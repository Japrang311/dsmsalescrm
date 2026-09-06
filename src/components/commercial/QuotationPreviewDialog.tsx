import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { getOrgSettings } from "@/lib/data/org-settings";
import type { Client, CommercialItem } from "@/lib/domain";
import {
  buildQuotationPdf,
  QUOTATION_PDF_DEFAULTS,
  quotationAddressLines,
  quotationPdfFilename,
  quotationSignerDefaults,
  type QuotationPdfInput,
} from "@/lib/export-quotation-pdf";

const PREVIEW_DEBOUNCE_MS = 300;

export function QuotationPreviewDialog({
  item,
  client,
  owner,
  signer,
}: {
  item: CommercialItem;
  client: Client;
  owner: { name: string; email: string };
  /** Signed-in user — the PDF is printed and signed by hand by whoever exports it. */
  signer: { name: string; title: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          <FileText className="h-4 w-4" /> Preview & Export PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-6xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Preview Quotation</DialogTitle>
          <DialogDescription>
            {item.quotationNumber ?? "Nomor belum tersedia"} · {client.name}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <PreviewBody
            item={item}
            client={client}
            owner={owner}
            signer={signer}
            onClose={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  item,
  client,
  owner,
  signer,
  onClose,
}: {
  item: CommercialItem;
  client: Client;
  owner: { name: string; email: string };
  signer: { name: string; title: string; email: string };
  onClose: () => void;
}) {
  const { data: orgSettings } = useQuery({
    queryKey: ["org-settings"],
    queryFn: getOrgSettings,
  });

  // Contacts without a name can't be addressed, so they're not offered.
  const picOptions = useMemo(
    () =>
      client.contacts
        .map((contact, index) => ({ contact, index }))
        .filter(({ contact }) => Boolean(contact.name)),
    [client.contacts],
  );

  const [picIndex, setPicIndex] = useState(picOptions[0]?.index ?? 0);
  const [customerReference, setCustomerReference] = useState("");
  const signerDefaults = useMemo(
    () => quotationSignerDefaults(signer.email, signer.title),
    [signer.email, signer.title],
  );
  const [terms, setTerms] = useState(QUOTATION_PDF_DEFAULTS.terms.join("\n"));
  const [closing, setClosing] = useState(
    signerDefaults.closingLines.join("\n"),
  );
  const [signerName, setSignerName] = useState(signer.name);
  const [signerTitle, setSignerTitle] = useState(signerDefaults.title);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const input: QuotationPdfInput = useMemo(
    () => ({
      item,
      client,
      owner,
      ppnRate: orgSettings?.ppnRate ?? 0,
      picIndex,
      customerReference,
      terms: terms.split(/\r?\n/),
      closingLines: closing.split(/\r?\n/),
      signerName,
      signerTitle,
      validityNote: QUOTATION_PDF_DEFAULTS.validityNote,
    }),
    [
      item,
      client,
      owner,
      orgSettings?.ppnRate,
      picIndex,
      customerReference,
      terms,
      closing,
      signerName,
      signerTitle,
    ],
  );

  // The preview is the real PDF rendered in an iframe, so what's on screen and
  // what gets downloaded can never drift apart.
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!orgSettings) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void buildQuotationPdf(input)
        .then((doc) => {
          if (cancelled) return;
          const url = doc.output("bloburl").toString();
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
          setPreviewUrl(url);
          setFailed(false);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error(error);
          setFailed(true);
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, orgSettings]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const [downloading, setDownloading] = useState(false);
  async function handleDownload() {
    setDownloading(true);
    try {
      const doc = await buildQuotationPdf(input);
      doc.save(quotationPdfFilename(item));
    } catch (error) {
      console.error(error);
      toast.error("Gagal membuat PDF");
    } finally {
      setDownloading(false);
    }
  }

  const addressPreview = quotationAddressLines(item, client).join(" · ");

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="grid flex-1 gap-4 overflow-hidden md:grid-cols-[minmax(260px,1fr)_2fr]">
        <div className="grid content-start gap-4 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label htmlFor="quotation-pic">PIC klien</Label>
            {picOptions.length > 0 ? (
              <Select
                value={String(picIndex)}
                onValueChange={(value) => setPicIndex(Number(value))}
              >
                <SelectTrigger id="quotation-pic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {picOptions.map(({ contact, index }) => (
                    <SelectItem key={index} value={String(index)}>
                      {contact.name}
                      {contact.position ? ` — ${contact.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                Klien ini belum punya kontak. Tambahkan PIC di halaman klien
                agar blok Attention terisi.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="quotation-reference">Customer Reference #</Label>
            <Input
              id="quotation-reference"
              value={customerReference}
              onChange={(event) => setCustomerReference(event.target.value)}
              placeholder="Nomor referensi dari klien (opsional)"
            />
          </div>

          <Collapsible>
            <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
              Terms & penutup
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid gap-4 pt-3">
              <div className="grid gap-1.5">
                <Label htmlFor="quotation-terms">Terms (satu per baris)</Label>
                <Textarea
                  id="quotation-terms"
                  rows={3}
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quotation-closing">
                  Kalimat penutup (satu per baris)
                </Label>
                <Textarea
                  id="quotation-closing"
                  rows={3}
                  value={closing}
                  onChange={(event) => setClosing(event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quotation-signer">Nama penanda tangan</Label>
                <Input
                  id="quotation-signer"
                  value={signerName}
                  onChange={(event) => setSignerName(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Terisi dari akun yang sedang login. PDF dicetak tanpa tanda
                  tangan — ditandatangani manual di atas nama ini.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="quotation-signer-title">Jabatan</Label>
                <Input
                  id="quotation-signer-title"
                  value={signerTitle}
                  onChange={(event) => setSignerTitle(event.target.value)}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Alamat dari database</dt>
              <dd>{addressPreview || "Belum diisi di data klien"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">PPN (dari Settings)</dt>
              <dd>
                {orgSettings
                  ? `${Number((orgSettings.ppnRate * 100).toFixed(2))}%`
                  : "Memuat…"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="min-h-0 overflow-hidden rounded-md border bg-muted/30">
          {failed ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              Preview gagal dibuat. Coba tutup dan buka lagi dialog ini.
            </div>
          ) : previewUrl ? (
            <iframe
              title="Preview PDF quotation"
              src={previewUrl}
              className="h-full w-full"
            />
          ) : (
            <div className="grid h-full place-items-center p-6">
              <Skeleton className="h-full w-full" />
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="border-t pt-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Tutup
        </Button>
        <Button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading || !orgSettings}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Menyiapkan…" : "Download PDF"}
        </Button>
      </DialogFooter>
    </div>
  );
}
