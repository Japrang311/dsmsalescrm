import { Link } from "@tanstack/react-router";
import { ArrowLeft, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/context/role-context-core";
import { LogCommercialFollowUpDialog } from "@/components/commercial/LogCommercialFollowUpDialog";
import { SoftDeleteAction } from "@/components/commercial/SoftDeleteAction";
import { ReviseQuotationDialog } from "@/components/clients/CreateRecordDialogs";
import { QuotationPreviewDialog } from "@/components/commercial/QuotationPreviewDialog";
import type { Client, CommercialItem, Role } from "@/lib/domain";
import type { OwnerLookup } from "@/lib/data/clients";

export function CommercialDetailHeader({
  item,
  client,
  owner,
  signerProfile,
  role,
  canEdit,
  isFoc,
  deleteLabel,
  backLabel,
  onBack,
  onDelete,
  onDeleted,
  onRevised,
  onSave,
  hasLinkedSalesOrder,
}: {
  item: CommercialItem;
  client: Client | undefined;
  owner: OwnerLookup[string] | undefined;
  signerProfile: OwnerLookup[string] | undefined;
  role: Role;
  canEdit: boolean;
  isFoc: boolean;
  deleteLabel: string;
  backLabel: string;
  onBack: () => void;
  onDelete: () => Promise<void>;
  onDeleted: () => void;
  onRevised: (documentId: string) => void;
  onSave: () => void;
  hasLinkedSalesOrder: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              {item.projectName ?? item.description}
            </h1>
            <Badge variant="outline">{item.type}</Badge>
            {isFoc && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                FOC
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {backLabel} ·{" "}
            <Link
              to="/clients/$clientId"
              params={{ clientId: item.clientId }}
              className="hover:text-primary"
            >
              {client?.name ?? "-"}
            </Link>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && item.type === "Quotation" && (
          <SoftDeleteAction
            label={deleteLabel}
            onDelete={onDelete}
            onDeleted={onDeleted}
          />
        )}
        {canEdit && item.type === "Quotation" && item.isCurrentRevision && (
          <ReviseQuotationDialog
            document={item}
            onRevised={onRevised}
            hasLinkedSalesOrder={hasLinkedSalesOrder}
            trigger={<Button variant="outline">Buat Revisi</Button>}
          />
        )}
        {canEdit && (
          <LogCommercialFollowUpDialog
            item={item}
            clientName={client?.name ?? "-"}
          />
        )}
        {/* Export is read-only, so it is not gated on canEdit — anyone who
            can see the quotation can send it. */}
        {item.type === "Quotation" && client && (
          <QuotationPreviewDialog
            item={item}
            client={client}
            owner={{ name: owner?.name ?? "", email: owner?.email ?? "" }}
            signer={{
              name: signerProfile?.name ?? "",
              title: ROLE_LABEL[signerProfile?.role ?? role],
              email: signerProfile?.email ?? "",
            }}
          />
        )}
        {canEdit && (
          <Button onClick={onSave} className="gap-1.5">
            <Save className="h-4 w-4" /> Simpan perubahan
          </Button>
        )}
      </div>
    </div>
  );
}
