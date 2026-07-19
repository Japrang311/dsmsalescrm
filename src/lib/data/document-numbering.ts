export type DocumentSeries = "QUO" | "SO" | "NP" | "PROTY";
export type Uom = "Unit" | "Pcs" | "Set" | "Lot";

export type ParsedDocumentNumber = {
  raw: string;
  series: DocumentSeries;
  yearCode: number;
  sequence: number;
  revision: number;
  baseNumber: string;
};

const DOCUMENT_NUMBER_PATTERN =
  /^(DSM-(\d{2})(?:(QUO)-(\d{4})|(SO|NP|PROTY)(\d{3})))(?:_REV\.(\d+))?$/;

export function parseDocumentNumber(raw: string): ParsedDocumentNumber | null {
  const match = DOCUMENT_NUMBER_PATTERN.exec(raw.trim());
  if (!match) return null;

  const series = (match[3] ?? match[5]) as DocumentSeries;
  const sequence = Number(match[4] ?? match[6]);
  return {
    raw,
    series,
    yearCode: Number(match[2]),
    sequence,
    revision: Number(match[7] ?? 0),
    baseNumber: match[1],
  };
}
