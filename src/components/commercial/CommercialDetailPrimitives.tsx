import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { formatRupiahFull } from "@/lib/format";
import type { CommercialItem } from "@/lib/domain";

export type LineItemEdit = {
  qty: string;
  unitPrice: string;
};

export function InfoCell({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function DocumentItemsTable({
  items,
  showMoney,
  canEdit,
  lineEdits,
  onLineEdit,
}: {
  items: NonNullable<CommercialItem["lineItems"]>;
  showMoney: boolean;
  canEdit: boolean;
  lineEdits: Record<string, LineItemEdit>;
  onLineEdit: (lineId: string, patch: Partial<LineItemEdit>) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Line Items
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Product</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>UOM</TableHead>
              {showMoney && (
                <>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((line) => (
              <TableRow key={line.id} className="odd:bg-muted/20">
                <TableCell className="font-medium">
                  {line.productName ?? "Nama Product belum diisi"}
                </TableCell>
                {/* Description carries the multi-line spec block that the
                    Quotation PDF renders — pre-wrap keeps both the line breaks
                    and the leading spaces that mark indented sub-items. */}
                <TableCell className="whitespace-pre-wrap align-top">
                  {line.description ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {canEdit ? (
                    <Input
                      type="number"
                      min={0}
                      value={lineEdits[line.id]?.qty ?? ""}
                      onChange={(event) =>
                        onLineEdit(line.id, { qty: event.target.value })
                      }
                      className="ml-auto h-8 w-24 text-right text-xs"
                      aria-label={`Qty ${line.productName ?? "item"}`}
                    />
                  ) : (
                    (line.qty ?? "—")
                  )}
                </TableCell>
                <TableCell>{line.uom ?? "—"}</TableCell>
                {showMoney && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {canEdit ? (
                        <Input
                          type="number"
                          min={0}
                          value={lineEdits[line.id]?.unitPrice ?? ""}
                          onChange={(event) =>
                            onLineEdit(line.id, {
                              unitPrice: event.target.value,
                            })
                          }
                          className="ml-auto h-8 w-32 text-right text-xs"
                          aria-label={`Unit price ${line.productName ?? "item"}`}
                        />
                      ) : line.unitPrice === null ? (
                        "—"
                      ) : (
                        formatRupiahFull(line.unitPrice)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {canEdit
                        ? formatRupiahFull(
                            (Number(lineEdits[line.id]?.qty) || 0) *
                              (Number(lineEdits[line.id]?.unitPrice) || 0),
                          )
                        : line.lineTotal === null
                          ? "—"
                          : formatRupiahFull(line.lineTotal)}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={showMoney ? 6 : 4}
                  className="text-center text-muted-foreground"
                >
                  Belum ada line item.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
