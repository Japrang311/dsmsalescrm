import { Link } from "@tanstack/react-router";
import { Building2, Calendar, Layers, User2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatRupiahFull,
  formatRupiahShort,
  formatDateShort,
} from "@/lib/format";
import { StatusBadge } from "@/components/clients/StatusBadges";
import {
  DocumentItemsTable,
  InfoCell,
  type LineItemEdit,
} from "@/components/commercial/CommercialDetailPrimitives";
import { QUOTATION_LOST_REASONS } from "@/lib/data/quotation-lost-reasons";
import type { Client, CommercialItem, QuotationLostReason } from "@/lib/domain";
import type { OwnerLookup } from "@/lib/data/clients";

export function CommercialDetailMainCard({
  item,
  client,
  owner,
  stages,
  aging,
  isFoc,
  quotationNumberGuide,
  canEdit,
  canEditLineItems,
  isClosedStage,
  stage,
  setStage,
  lostReason,
  setLostReason,
  lostReasonDetail,
  setLostReasonDetail,
  quotationDate,
  setQuotationDate,
  quotationExpiredDate,
  setQuotationExpiredDate,
  quotationNumber,
  setQuotationNumber,
  note,
  setNote,
  lineEdits,
  onLineEdit,
  hasPriceChanges,
  hasQtyChanges,
  priceReasonType,
  setPriceReasonType,
  priceReasonOther,
  setPriceReasonOther,
  qtyReason,
  setQtyReason,
  isLostReasonTracked,
}: {
  item: CommercialItem;
  client: Client | undefined;
  owner: OwnerLookup[string] | undefined;
  stages: string[];
  aging: number;
  isFoc: boolean;
  quotationNumberGuide: string;
  canEdit: boolean;
  canEditLineItems: boolean;
  isClosedStage: boolean;
  stage: string;
  setStage: (value: string) => void;
  lostReason: QuotationLostReason | "";
  setLostReason: (value: QuotationLostReason) => void;
  lostReasonDetail: string;
  setLostReasonDetail: (value: string) => void;
  quotationDate: string;
  setQuotationDate: (value: string) => void;
  quotationExpiredDate: string;
  setQuotationExpiredDate: (value: string) => void;
  quotationNumber: string;
  setQuotationNumber: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  lineEdits: Record<string, LineItemEdit>;
  onLineEdit: (lineId: string, patch: Partial<LineItemEdit>) => void;
  hasPriceChanges: boolean;
  hasQtyChanges: boolean;
  priceReasonType: string;
  setPriceReasonType: (value: string) => void;
  priceReasonOther: string;
  setPriceReasonOther: (value: string) => void;
  qtyReason: string;
  setQtyReason: (value: string) => void;
  isLostReasonTracked: boolean;
}) {
  return (
    <Card className="md:col-span-2">
      <CardContent className="grid gap-4 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Detail Klien
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCell icon={<Building2 className="h-3.5 w-3.5" />} label="Klien">
            <Link
              to="/clients/$clientId"
              params={{ clientId: item.clientId }}
              className="text-sm font-medium hover:text-primary"
            >
              {client?.name ?? "-"}
            </Link>
            {client && (
              <div className="mt-1">
                <StatusBadge status={client.status} />
              </div>
            )}
          </InfoCell>
          <InfoCell
            icon={<User2 className="h-3.5 w-3.5" />}
            label="Sales owner"
          >
            {/* Quotation ownership is read-only here. */}
            <span className="text-sm">{owner?.name ?? "-"}</span>
          </InfoCell>
          <InfoCell
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Source flow"
          >
            <Badge variant="outline" className="text-[11px]">
              {item.sourceFlow}
            </Badge>
          </InfoCell>
          <InfoCell icon={<Layers className="h-3.5 w-3.5" />} label="Stage">
            {canEdit ? (
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">{item.stage}</Badge>
            )}
          </InfoCell>
          {isLostReasonTracked && (
            <>
              <InfoCell label="Lost reason">
                {canEdit ? (
                  <Select
                    value={lostReason}
                    onValueChange={(value) =>
                      setLostReason(value as QuotationLostReason)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pilih alasan lost" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUOTATION_LOST_REASONS.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm">
                    {item.lostReason ?? "Belum diklasifikasi"}
                  </span>
                )}
              </InfoCell>
              <InfoCell label="Detail alasan">
                {canEdit ? (
                  <Textarea
                    value={lostReasonDetail}
                    onChange={(event) =>
                      setLostReasonDetail(event.target.value)
                    }
                    placeholder={
                      lostReason === "Lainnya"
                        ? "Wajib jelaskan alasan lainnya"
                        : "Tambahkan konteks bila diperlukan"
                    }
                    className="min-h-20 text-sm"
                  />
                ) : (
                  <span className="text-sm">
                    {item.lostReasonDetail ?? "—"}
                  </span>
                )}
              </InfoCell>
            </>
          )}
          <InfoCell
            icon={<Calendar className="h-3.5 w-3.5" />}
            label={item.type === "Quotation" ? "Quotation Date" : "Date"}
          >
            {canEdit && item.type === "Quotation" ? (
              <Input
                type="date"
                value={quotationDate}
                onChange={(event) => setQuotationDate(event.target.value)}
                className="h-8 text-xs"
              />
            ) : (
              <span className="text-sm">
                {item.documentDate ? formatDateShort(item.documentDate) : "—"}
              </span>
            )}
          </InfoCell>
          {item.type === "Quotation" && (
            <InfoCell
              icon={<Calendar className="h-3.5 w-3.5" />}
              label="Expired Date"
            >
              {canEdit ? (
                <Input
                  type="date"
                  value={quotationExpiredDate}
                  onChange={(event) =>
                    setQuotationExpiredDate(event.target.value)
                  }
                  className="h-8 text-xs"
                />
              ) : (
                <span className="text-sm">
                  {item.quotationExpiredDate
                    ? formatDateShort(item.quotationExpiredDate)
                    : "—"}
                </span>
              )}
            </InfoCell>
          )}
          <InfoCell
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Aging (sejak update terakhir)"
          >
            <span className="text-sm tabular-nums">
              {aging} hari · update {formatDateShort(item.updatedAt)}
            </span>
          </InfoCell>
        </div>

        <Separator />

        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Nilai &amp; Nomor Dokumen
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoCell label="Total">
            <span className="text-2xl font-bold tabular-nums">
              {isFoc ? "FOC · Rp0" : formatRupiahFull(item.estimatedValue)}
            </span>
            {!isFoc && item.estimatedValue >= 1_000_000 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({formatRupiahShort(item.estimatedValue)})
              </span>
            )}
          </InfoCell>
          <InfoCell label="Jumlah item">
            <span className="text-lg font-semibold tabular-nums">
              {item.itemCount ?? item.lineItems?.length ?? 0}
            </span>
          </InfoCell>
          <InfoCell label="Forecast">
            <span className="text-lg font-semibold tabular-nums">
              {item.forecastValue === null || item.forecastValue === undefined
                ? "—"
                : formatRupiahFull(item.forecastValue)}
            </span>
          </InfoCell>
          {item.type === "Quotation" && (
            <InfoCell label="No. Quotation">
              {canEdit ? (
                <>
                  <Input
                    value={quotationNumber}
                    onChange={(e) => setQuotationNumber(e.target.value)}
                    placeholder={quotationNumberGuide}
                    className="h-8 font-mono text-xs"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Panduan format: {quotationNumberGuide}. Tidak mengikat.
                  </p>
                </>
              ) : (
                <span className="font-mono text-xs">
                  {item.quotationNumber ?? "—"}
                </span>
              )}
            </InfoCell>
          )}
          <InfoCell label="Note">
            {canEdit && item.type === "Quotation" ? (
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Catatan quotation"
                className="min-h-20 text-sm"
              />
            ) : (
              <span className="text-sm">{item.note ?? "—"}</span>
            )}
          </InfoCell>
        </div>

        <Separator />

        {canEdit && isClosedStage && (
          <p className="text-xs text-muted-foreground">
            Item terkunci — quotation sudah berstatus {item.stage}.
          </p>
        )}
        <DocumentItemsTable
          items={item.lineItems ?? []}
          showMoney={!isFoc}
          canEdit={canEditLineItems}
          lineEdits={lineEdits}
          onLineEdit={onLineEdit}
        />
        {canEdit && (hasPriceChanges || hasQtyChanges) && (
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
            {hasPriceChanges && (
              <div className="grid gap-2">
                <Label>Alasan perubahan harga</Label>
                <Select
                  value={priceReasonType}
                  onValueChange={setPriceReasonType}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Pilih alasan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Discount">Discount</SelectItem>
                    <SelectItem value="Lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
                {priceReasonType === "Lainnya" && (
                  <Textarea
                    value={priceReasonOther}
                    onChange={(event) =>
                      setPriceReasonOther(event.target.value)
                    }
                    placeholder="Tulis alasan perubahan harga"
                    className="min-h-20 text-sm"
                  />
                )}
              </div>
            )}
            {hasQtyChanges && (
              <div className="grid gap-2">
                <Label>Alasan perubahan qty</Label>
                <Textarea
                  value={qtyReason}
                  onChange={(event) => setQtyReason(event.target.value)}
                  placeholder="Jelaskan kenapa qty diubah"
                  className="min-h-20 text-sm"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
