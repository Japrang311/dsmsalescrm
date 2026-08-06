import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatRupiahFull, daysBetween } from "@/lib/format";
import { stagesForFlow } from "@/lib/business-rules";
import type { CommercialItem, QuotationLostReason } from "@/lib/domain";
import { useRole } from "@/context/role-context";
import { NOW } from "@/lib/domain";
import { canManageSoftDeletedRecord } from "@/components/commercial/soft-delete-controls";
import { CommercialDetailHeader } from "@/components/commercial/CommercialDetailHeader";
import { CommercialDetailMainCard } from "@/components/commercial/CommercialDetailMainCard";
import { CommercialDetailSidebar } from "@/components/commercial/CommercialDetailSidebar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listCommercialItems,
  updateCommercialItem,
  describeCommercialItemChanges,
} from "@/lib/data/commercial-items";
import {
  deleteCommercialDocument,
  updateCommercialDocumentLineItem,
} from "@/lib/data/commercial-documents";
import { documentNumberExample } from "@/lib/data/document-numbering";
import { listClients, listOwners } from "@/lib/data/clients";
import { listTasks } from "@/lib/data/tasks";
import { commercialRelatedTasks } from "@/lib/data/task-relations";
import {
  getCurrentActorId,
  listCommercialItemHistory,
  logActivity,
} from "@/lib/data/activity-log";
import { listFollowUpsForCommercialDocument } from "@/lib/data/follow-ups";
import {
  activeLostReasonPatch,
  isLostReasonTracked,
  validateQuotationLostReason,
} from "@/lib/data/quotation-lost-reasons";
import type { LineItemEdit } from "@/components/commercial/CommercialDetailPrimitives";

type LineItemChange = {
  line: NonNullable<CommercialItem["lineItems"]>[number];
  qty: number;
  unitPrice: number;
  qtyChanged: boolean;
  priceChanged: boolean;
};

// Some activity_log rows store `detail` as a raw JSON literal (e.g. the
// revise_quotation/create_quotation DB functions) instead of prose. Render
// those as a human sentence instead of dumping the JSON to the user.
function formatHistoryDetail(
  detail: string | null | undefined,
  items: CommercialItem[],
): string | null {
  if (!detail) return null;
  const trimmed = detail.trim();
  if (!trimmed.startsWith("{")) return detail;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof parsed.quotation_number === "string") {
      parts.push(`Nomor: ${parsed.quotation_number}`);
    }
    if (typeof parsed.supersedes_document_id === "string") {
      const previous = items.find(
        (i) => i.id === parsed.supersedes_document_id,
      );
      parts.push(
        previous?.quotationNumber
          ? `Menggantikan: ${previous.quotationNumber}`
          : "Menggantikan revisi sebelumnya",
      );
    }
    return parts.length > 0 ? parts.join(" · ") : detail;
  } catch {
    return detail;
  }
}

export function CommercialDetailPage({
  itemId,
  backHref,
  backLabel,
}: {
  itemId: string;
  backHref: string;
  backLabel: string;
}) {
  const { role, authReady } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["commercial-items", "all"],
    queryFn: listCommercialItems,
    enabled: authReady,
  });
  const item = items.find((i) => i.id === itemId);

  const { data: clientList = [] } = useQuery({
    queryKey: ["clients", "all"],
    queryFn: listClients,
    enabled: authReady,
  });
  const { data: owners = {} } = useQuery({
    queryKey: ["profiles", "owners"],
    queryFn: listOwners,
    enabled: authReady,
  });
  const { data: allTasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: listTasks,
    enabled: authReady,
  });
  const clients = useMemo(() => {
    const map: Record<string, (typeof clientList)[number]> = {};
    for (const c of clientList) map[c.id] = c;
    return map;
  }, [clientList]);
  const { data: history = [] } = useQuery({
    queryKey: ["activity-log", "commercial-item", itemId],
    queryFn: () => listCommercialItemHistory(itemId),
    enabled: authReady,
  });
  const { data: followUps = [] } = useQuery({
    queryKey: ["follow-ups", "commercial-document", itemId],
    queryFn: () => listFollowUpsForCommercialDocument(itemId),
    enabled: authReady,
  });
  const { data: currentUserId } = useQuery({
    queryKey: ["current-user-id"],
    queryFn: getCurrentActorId,
    enabled: authReady,
  });

  const [stage, setStage] = useState(item?.stage ?? "");
  const [quotationNumber, setQuotationNumber] = useState(
    item?.quotationNumber ?? "",
  );
  const [quotationDate, setQuotationDate] = useState(item?.documentDate ?? "");
  const [quotationExpiredDate, setQuotationExpiredDate] = useState(
    item?.quotationExpiredDate ?? "",
  );
  const [note, setNote] = useState(item?.note ?? "");
  const [lineEdits, setLineEdits] = useState<Record<string, LineItemEdit>>({});
  const [priceReasonType, setPriceReasonType] = useState<string>("");
  const [priceReasonOther, setPriceReasonOther] = useState("");
  const [qtyReason, setQtyReason] = useState("");
  const [lostReason, setLostReason] = useState<QuotationLostReason | "">(
    item?.lostReason ?? "",
  );
  const [lostReasonDetail, setLostReasonDetail] = useState(
    item?.lostReasonDetail ?? "",
  );

  useEffect(() => {
    if (!item) return;
    setStage(item.stage);
    setQuotationNumber(item.quotationNumber ?? "");
    setQuotationDate(item.documentDate ?? "");
    setQuotationExpiredDate(item.quotationExpiredDate ?? "");
    setNote(item.note ?? "");
    setLineEdits(
      Object.fromEntries(
        (item.lineItems ?? []).map((line) => [
          line.id,
          {
            qty: line.qty?.toString() ?? "",
            unitPrice: line.unitPrice?.toString() ?? "",
          },
        ]),
      ),
    );
    setPriceReasonType("");
    setPriceReasonOther("");
    setQtyReason("");
    setLostReason(item.lostReason ?? "");
    setLostReasonDetail(item.lostReasonDetail ?? "");
  }, [item]);

  if (!authReady) {
    return (
      <div className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Item tidak ditemukan</h1>
        <p className="mt-1 text-sm text-muted-foreground">ID tidak dikenali.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to={backHref}>Kembali</Link>
        </Button>
      </div>
    );
  }

  const client = clients[item.clientId];
  const owner = owners[item.ownerId];
  // Whoever is signed in signs the exported quotation by hand, so the PDF's
  // name/title placeholder follows them, not the document's sales owner.
  const signerProfile = currentUserId ? owners[currentUserId] : undefined;
  const stages = stagesForFlow(item.sourceFlow);
  const relatedTasks = commercialRelatedTasks(allTasks, item.id);
  // Sales Orders don't exist yet (Phase 5) — shown as an honest "not
  // available yet" placeholder below rather than mock SALES_ORDERS data.
  const canEdit = canManageSoftDeletedRecord(role, item.ownerId, currentUserId);
  const isClosedStage =
    item.stage === "Closed Won" || item.stage === "Closed Lost";
  const canEditLineItems = canEdit && !isClosedStage;
  const aging = Math.max(0, daysBetween(new Date(item.updatedAt), NOW));
  const isFoc = item.prototypeStatus === "FOC";
  const quotationNumberGuide = documentNumberExample("QUO");
  const lineChanges = (item.lineItems ?? [])
    .map((line) => {
      const edit = lineEdits[line.id];
      if (!edit) return null;
      const qty = Number(edit.qty);
      const unitPrice = isFoc ? (line.unitPrice ?? 0) : Number(edit.unitPrice);
      const qtyChanged = qty !== (line.qty ?? 0);
      const priceChanged = !isFoc && unitPrice !== (line.unitPrice ?? 0);
      if (!qtyChanged && !priceChanged) return null;
      return { line, qty, unitPrice, qtyChanged, priceChanged };
    })
    .filter((change): change is LineItemChange => Boolean(change));
  const hasQtyChanges = lineChanges.some((change) => change.qtyChanged);
  const hasPriceChanges = lineChanges.some((change) => change.priceChanged);
  const quotationHistory =
    item.type === "Quotation" && item.quotationBaseNumber
      ? items
          .filter(
            (candidate) =>
              candidate.type === "Quotation" &&
              candidate.quotationBaseNumber === item.quotationBaseNumber,
          )
          .sort(
            (a, b) => (a.quotationRevision ?? 0) - (b.quotationRevision ?? 0),
          )
      : [];

  async function persist() {
    if (!item) return;
    const changes: { field: string; from?: string; to?: string }[] = [];
    const normalizedQuotation = quotationNumber.trim();
    const normalizedQuotationDate = quotationDate.trim();
    const normalizedExpiredDate = quotationExpiredDate.trim();
    const normalizedNote = note.trim();
    const reasonPatch = activeLostReasonPatch({
      type: item.type,
      stage,
      lostReason: lostReason || null,
      lostReasonDetail,
    });
    const lostReasonError = validateQuotationLostReason({
      type: item.type,
      stage,
      lostReason: lostReason || null,
      lostReasonDetail,
    });
    if (lostReasonError) {
      toast.error(lostReasonError);
      return;
    }
    if (
      item.type === "Quotation" &&
      normalizedQuotation !== (item.quotationNumber ?? "")
    )
      changes.push({
        field: "quotationNumber",
        from: item.quotationNumber,
        to: normalizedQuotation || undefined,
      });
    if (
      item.type === "Quotation" &&
      normalizedQuotationDate !== (item.documentDate ?? "")
    )
      changes.push({
        field: "quotationDate",
        from: item.documentDate,
        to: normalizedQuotationDate || undefined,
      });
    if (
      item.type === "Quotation" &&
      normalizedExpiredDate !== (item.quotationExpiredDate ?? "")
    )
      changes.push({
        field: "quotationExpiredDate",
        from: item.quotationExpiredDate,
        to: normalizedExpiredDate || undefined,
      });
    if (item.type === "Quotation" && normalizedNote !== (item.note ?? ""))
      changes.push({
        field: "note",
        from: item.note,
        to: normalizedNote || undefined,
      });
    if (stage !== item.stage)
      changes.push({ field: "stage", from: item.stage, to: stage });
    if (reasonPatch.lostReason !== (item.lostReason ?? null)) {
      changes.push({
        field: "lostReason",
        from: item.lostReason,
        to: reasonPatch.lostReason ?? undefined,
      });
    }
    if (reasonPatch.lostReasonDetail !== (item.lostReasonDetail ?? null)) {
      changes.push({
        field: "lostReasonDetail",
        from: item.lostReasonDetail,
        to: reasonPatch.lostReasonDetail ?? undefined,
      });
    }
    for (const change of lineChanges) {
      if (!Number.isFinite(change.qty) || change.qty <= 0) {
        toast.error("Qty tidak valid", {
          description: "Qty wajib lebih dari 0.",
        });
        return;
      }
      if (
        !isFoc &&
        (!Number.isFinite(change.unitPrice) || change.unitPrice <= 0)
      ) {
        toast.error("Harga tidak valid", {
          description: "Unit price wajib lebih dari 0.",
        });
        return;
      }
      if (change.qtyChanged) {
        changes.push({
          field: `qty ${change.line.productName ?? "item"}`,
          from: String(change.line.qty ?? "-"),
          to: String(change.qty),
        });
      }
      if (change.priceChanged) {
        changes.push({
          field: `unitPrice ${change.line.productName ?? "item"}`,
          from:
            change.line.unitPrice === null
              ? "-"
              : formatRupiahFull(change.line.unitPrice),
          to: formatRupiahFull(change.unitPrice),
        });
      }
    }

    if (changes.length === 0) {
      toast.info("Tidak ada perubahan");
      return;
    }
    if (hasPriceChanges && !priceReasonType) {
      toast.error("Alasan perubahan harga wajib diisi", {
        description: "Pilih Discount atau Lainnya.",
      });
      return;
    }
    if (
      hasPriceChanges &&
      priceReasonType === "Lainnya" &&
      !priceReasonOther.trim()
    ) {
      toast.error("Detail alasan harga wajib diisi", {
        description: "Isi alasan lain perubahan harga.",
      });
      return;
    }
    if (hasQtyChanges && !qtyReason.trim()) {
      toast.error("Alasan perubahan qty wajib diisi", {
        description: "Jelaskan kenapa qty diubah.",
      });
      return;
    }
    if (
      item.type === "Quotation" &&
      normalizedQuotationDate.length > 0 &&
      Number.isNaN(new Date(normalizedQuotationDate).getTime())
    ) {
      toast.error("Quotation Date tidak valid");
      return;
    }
    if (
      item.type === "Quotation" &&
      normalizedExpiredDate.length > 0 &&
      Number.isNaN(new Date(normalizedExpiredDate).getTime())
    ) {
      toast.error("Expired Date tidak valid");
      return;
    }

    try {
      for (const change of lineChanges) {
        await updateCommercialDocumentLineItem(change.line.id, {
          qty: change.qty,
          unitPrice: isFoc ? null : change.unitPrice,
          lineTotal: isFoc ? null : change.qty * change.unitPrice,
        });
      }
      const headerChanged =
        (item.type === "Quotation" &&
          normalizedQuotation !== (item.quotationNumber ?? "")) ||
        (item.type === "Quotation" &&
          normalizedQuotationDate !== (item.documentDate ?? "")) ||
        (item.type === "Quotation" &&
          normalizedExpiredDate !== (item.quotationExpiredDate ?? "")) ||
        (item.type === "Quotation" && normalizedNote !== (item.note ?? "")) ||
        stage !== item.stage ||
        reasonPatch.lostReason !== (item.lostReason ?? null) ||
        reasonPatch.lostReasonDetail !== (item.lostReasonDetail ?? null);
      if (headerChanged) {
        await updateCommercialItem(item.id, {
          quotationNumber:
            item.type === "Quotation" &&
            normalizedQuotation !== (item.quotationNumber ?? "")
              ? normalizedQuotation
              : undefined,
          quotationBaseNumber:
            item.type === "Quotation" &&
            !item.quotationBaseNumber &&
            normalizedQuotation
              ? normalizedQuotation
              : undefined,
          documentDate:
            item.type === "Quotation" &&
            normalizedQuotationDate !== (item.documentDate ?? "")
              ? normalizedQuotationDate
              : undefined,
          quotationExpiredDate:
            item.type === "Quotation" &&
            normalizedExpiredDate !== (item.quotationExpiredDate ?? "")
              ? normalizedExpiredDate || null
              : undefined,
          note:
            item.type === "Quotation" && normalizedNote !== (item.note ?? "")
              ? normalizedNote
              : undefined,
          stage: stage !== item.stage ? stage : undefined,
          lostReason: reasonPatch.lostReason,
          lostReasonDetail: reasonPatch.lostReasonDetail,
        });
      }
      const actorId = await getCurrentActorId();
      if (actorId) {
        const reasonLines = [
          hasPriceChanges
            ? `Alasan harga: ${
                priceReasonType === "Lainnya"
                  ? priceReasonOther.trim()
                  : priceReasonType
              }`
            : null,
          hasQtyChanges ? `Alasan qty: ${qtyReason.trim()}` : null,
          isLostReasonTracked(item.type, stage)
            ? `Alasan lost: ${reasonPatch.lostReason}${
                reasonPatch.lostReasonDetail
                  ? ` — ${reasonPatch.lostReasonDetail}`
                  : ""
              }`
            : null,
        ].filter(Boolean);
        await logActivity({
          kind: "commercial_item_stage_change",
          ownerId: item.ownerId,
          actorId,
          clientId: item.clientId,
          commercialDocumentId: item.id,
          title: `${item.description} diperbarui`,
          detail: [describeCommercialItemChanges(changes), ...reasonLines].join(
            "\n",
          ),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["commercial-items"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      toast.success("Perubahan tersimpan", {
        description: `${changes.length} field diperbarui`,
      });
    } catch (error) {
      toast.error("Gagal menyimpan perubahan", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  async function deleteItem(id: string) {
    await deleteCommercialDocument(id);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["commercial-items"] }),
      queryClient.invalidateQueries({ queryKey: ["activity-log"] }),
    ]);
  }

  const deleteLabel = `${item.type} ${
    item.quotationNumber ?? item.projectName ?? item.id
  }`;

  return (
    <div className="flex flex-col gap-4">
      <CommercialDetailHeader
        item={item}
        client={client}
        owner={owner}
        signerProfile={signerProfile}
        role={role}
        canEdit={canEdit}
        isFoc={isFoc}
        deleteLabel={deleteLabel}
        backHref={backHref}
        backLabel={backLabel}
        onBack={() => navigate({ to: backHref })}
        onDelete={() => deleteItem(item.id)}
        onDeleted={() => {
          toast.success(`${item.type} dihapus`);
          navigate({ to: backHref });
        }}
        onRevised={(documentId) =>
          navigate({ to: `${backHref}/${documentId}` as never })
        }
        onSave={() => void persist()}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <CommercialDetailMainCard
          item={item}
          client={client}
          owner={owner}
          stages={stages}
          aging={aging}
          isFoc={isFoc}
          quotationNumberGuide={quotationNumberGuide}
          canEdit={canEdit}
          canEditLineItems={canEditLineItems}
          isClosedStage={isClosedStage}
          stage={stage}
          setStage={setStage}
          lostReason={lostReason}
          setLostReason={setLostReason}
          lostReasonDetail={lostReasonDetail}
          setLostReasonDetail={setLostReasonDetail}
          quotationDate={quotationDate}
          setQuotationDate={setQuotationDate}
          quotationExpiredDate={quotationExpiredDate}
          setQuotationExpiredDate={setQuotationExpiredDate}
          quotationNumber={quotationNumber}
          setQuotationNumber={setQuotationNumber}
          note={note}
          setNote={setNote}
          lineEdits={lineEdits}
          onLineEdit={(lineId, patch) =>
            setLineEdits((current) => ({
              ...current,
              [lineId]: { ...current[lineId], ...patch },
            }))
          }
          hasPriceChanges={hasPriceChanges}
          hasQtyChanges={hasQtyChanges}
          priceReasonType={priceReasonType}
          setPriceReasonType={setPriceReasonType}
          priceReasonOther={priceReasonOther}
          setPriceReasonOther={setPriceReasonOther}
          qtyReason={qtyReason}
          setQtyReason={setQtyReason}
          isLostReasonTracked={isLostReasonTracked(item.type, stage)}
        />

        <CommercialDetailSidebar
          backHref={backHref}
          quotationHistory={quotationHistory}
          relatedTasks={relatedTasks}
          followUps={followUps}
          history={history}
          formatHistoryDetail={(detail) => formatHistoryDetail(detail, items)}
        />
      </div>
    </div>
  );
}
