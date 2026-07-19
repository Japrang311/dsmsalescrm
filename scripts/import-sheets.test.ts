import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildClientNameLookup,
  buildNameLookup,
  classifyRow,
  deriveCounterSeeds,
  groupImportRows,
  type ImportedCommercialHeader,
  type ImportedSalesOrderHeader,
  type RawSheetRow,
  type SheetTab,
} from "./import-sheets/classify";
import { parseSheetCsv } from "./import-sheets/parse";

const FIXTURES_DIR = join(
  import.meta.dir,
  "..",
  "tests",
  "fixtures",
  "sheets-import",
);
const clientsByName = buildClientNameLookup([
  { id: "client-astra", name: "PT Astra Komponen Nusantara" },
  { id: "client-sinar", name: "PT Sinar Baja Elektrik" },
  { id: "client-chandra", name: "PT Chandra Sakti Utama" },
  {
    id: "client-hariff",
    name: "PT. HARIFF DAYA TUNGGAL ENGINEERING",
  },
  { id: "client-14", name: "CV. ABADI TECHNIC" },
  { id: "client-15", name: "CV. ABENG JAYA MANDIRI" },
  { id: "client-16", name: "CV. LEUWI ANYAR TEKNIK" },
  { id: "client-17", name: "CV. RDD TECHNOLOGIES" },
  { id: "client-18", name: "PT ZAITECH ENJINIRING INDONESIA" },
  { id: "client-19", name: "PT. ABHIMATA CITRA ABADI" },
  { id: "client-20", name: "PT. AEMCO PERSADA NUSANTARA" },
  { id: "client-21", name: "PT. ANTARTEL MEDIA PRIMA" },
  { id: "client-22", name: "PT. BAMBANG DJAJA" },
  { id: "client-23", name: "PT. CAHAYA SOLUSI METAL" },
  { id: "client-24", name: "PT. CATUR ADI PERKASA" },
  { id: "client-25", name: "PT. CIKARANG LISTRINDO INDONESIA" },
  { id: "client-26", name: "PT. CONTROL SYSTEMS ARENA PARA NUSA" },
  { id: "client-27", name: "PT. ELEKTRINDO SARANA ABADI" },
  { id: "client-28", name: "PT. ENGINEERING VISIT ANTAR NUSA" },
  { id: "client-29", name: "PT. GLOBAL NINE INDONESIA" },
  { id: "client-30", name: "PT. IDEAS EDVOLUTION TECHNOLOGGY" },
  { id: "client-31", name: "PT. INTI CIPTA MAKMUR" },
  { id: "client-32", name: "PT. KOPERASI KARYAWAN BERSATU SEJAHTERA" },
  { id: "client-33", name: "PT. MAXINDO ENERGITAMA" },
  { id: "client-34", name: "PT. MEDIA TAMA ELEKTRONIK" },
  { id: "client-35", name: "PT. MEGATRON EMPAT SEKAWAN" },
  { id: "client-36", name: "PT. MEKANIKA ELEKTRIKA INDOCIPTA" },
  { id: "client-37", name: "PT. NEUTRAL ERA TRITAMA" },
  { id: "client-38", name: "PT. PAKARTEL" },
  { id: "client-39", name: "PT. POWER KARYA ELEKTRINDO" },
  { id: "client-40", name: "PT. PUTRA ARGA BINANGUN" },
  { id: "client-41", name: "PT. QUANTUM TERA NETWORK" },
  { id: "client-42", name: "PT. REKACIPTA PERKASA ENERGI" },
  { id: "client-43", name: "PT. RIZQALLAH BOER MAKMUR" },
  { id: "client-44", name: "PT. SARANA GLOBAL TELECOM" },
  { id: "client-45", name: "PT. SURYA ANUGRAH ENJINEERING" },
  { id: "client-46", name: "PT. SURYA UTAMA PUTRA" },
  { id: "client-47", name: "PT. SYMPHOS ELECTRIC" },
  { id: "client-48", name: "PT. TOHAAN RENEWABLE ENERGY ENGINEERING" },
  { id: "client-49", name: "PT. WESTINDO ESA PERKASA" },
  { id: "client-50", name: "PT. WIRAKY NUSA TELEKOMUNIKASI" },
  { id: "client-51", name: "BPK JAFAR" },
  { id: "client-52", name: "BPK. YUDIS" },
  { id: "client-53", name: "CV. CATUR DAYA MEKATAMA" },
  { id: "client-54", name: "CV. PANCA SAKTI" },
  { id: "client-55", name: "CV. VALDATA ADIDAYA" },
  { id: "client-56", name: "IBU ERNIKA" },
  { id: "client-57", name: "PAK SUHEDY" },
  { id: "client-58", name: "PAK YUDHI - KIRANA PAINT" },
  { id: "client-59", name: "PT ZELT TECHNOLOGIES SOLUTION" },
  { id: "client-60", name: "PT. ANTABOGA PANGAN NUSANTARA" },
  { id: "client-61", name: "PT. EVERPRO INDONESIA" },
  { id: "client-62", name: "PT. GLOBAL SEMESTA MANDIRI" },
  { id: "client-63", name: "PT. GUANGHAO TECHNOLOGY INDONESIA" },
  { id: "client-64", name: "PT. GUNUNG MADU PLANTATIONS" },
  { id: "client-65", name: "PT. HARMONI REKA ENGINEERNIG" },
  { id: "client-66", name: "PT. INFRA KARYA PRATAMA" },
  { id: "client-67", name: "PT. Jetec - ACTEMIUM Systems Indonesia" },
  { id: "client-68", name: "PT. KUBIK MADANI" },
  { id: "client-69", name: "PT. MAHARDIKA TEKNOTAMA INTEGRASI" },
  { id: "client-70", name: "PT. MERDEKA MINING SERVIS" },
  { id: "client-71", name: "PT. MUNGGARAN JAYA UTAMA" },
  { id: "client-72", name: "PT. NDL BAKTI SOLUSINDO" },
  { id: "client-73", name: "PT. PRASTIWAHYU TUNAS ENGINEERING" },
  { id: "client-74", name: "PT. PRIMA PERKASA TEKNIK INDONESIA" },
  { id: "client-75", name: "PT. SARANA TEKNOLOGI UTAMA" },
  { id: "client-76", name: "PT. SIEMENS INDONESIA" },
  { id: "client-77", name: "PT. SINAR BUDI" },
  { id: "client-78", name: "PT. SOLARENS LEDINDO" },
  { id: "client-79", name: "PT. SOLUSI KONEKTIVITAS DIGITAL" },
  { id: "client-80", name: "PT. TIRTA JAYA PRIMAKARSA" },
  { id: "client-81", name: "PT.NAWASENA JAYA KREASI" },
]);
const salesByName = buildNameLookup([
  { id: "sales-aditya", name: "Adhitya Wirambara" },
  { id: "sales-sinta", name: "Nur Iman" },
  { id: "sales-bagas", name: "Feni Cahyaningtias" },
  { id: "sales-dewi", name: "Leli Al" },
  { id: "sales-andri", name: "Andri Sutomo" },
  { id: "sales-siti", name: "Siti Zulaika (Ika)" },
]);
salesByName.set("sales", "sales-siti");
const clientOwnersByName = buildNameLookup([
  { id: "sales-aditya", name: "PT Astra Komponen Nusantara" },
]);

function classifyFixture(tab: SheetTab, filename: string) {
  const raw = parseSheetCsv(
    tab,
    readFileSync(join(FIXTURES_DIR, filename), "utf8"),
  );
  return raw.map((row) =>
    classifyRow(tab, row, 2026, clientsByName, salesByName),
  );
}

function quotationRow(overrides: Partial<RawSheetRow> = {}): RawSheetRow {
  return {
    sourceIndex: 1,
    documentNumber: "DSM-26QUO-0384",
    customerPoNumber: "",
    customerName: "PT Astra Komponen Nusantara",
    ownerName: "Adhitya Wirambara",
    description: "Historical quotation item",
    dateOrMonth: "2026-05-29",
    qtyRaw: "1",
    uomRaw: "Unit",
    unitPriceRaw: "15147000",
    lineTotalRaw: "15147000",
    address: "",
    stage: "Quotes Sent",
    linkedSoNumber: "",
    note: "",
    ...overrides,
  };
}

function salesOrderRow(overrides: Partial<RawSheetRow> = {}): RawSheetRow {
  return {
    sourceIndex: 1,
    documentNumber: "DSM-26SO144",
    customerPoNumber: "PO-SO-144",
    customerName: "PT Astra Komponen Nusantara",
    ownerName: "Adhitya Wirambara",
    description: "Historical sales order item",
    dateOrMonth: "JULI",
    qtyRaw: "2",
    uomRaw: "",
    unitPriceRaw: "1000000",
    lineTotalRaw: "2000000",
    address: "",
    stage: "",
    linkedSoNumber: "",
    note: "",
    ...overrides,
  };
}

const allRows = [
  ...classifyFixture("QUOTATION", "quotation.csv"),
  ...classifyFixture("SO 2026", "so-2026.csv"),
  ...classifyFixture("NP 2026", "np-2026.csv"),
  ...classifyFixture("PROTY", "proty.csv"),
  ...classifyFixture("HARIFF", "hariff.csv"),
];
const grouped = groupImportRows(allRows);

describe("normalized Sheet import classification and grouping", () => {
  test("resolves only approved historical customer aliases", () => {
    const lookup = buildClientNameLookup([
      { id: "client-leuwi", name: "CV. LEUWI ANYAR TEKNIK" },
      {
        id: "client-evan",
        name: "PT. ENGINEERING VISIT ANTAR NUSA",
      },
      {
        id: "client-ideas",
        name: "PT. IDEAS EDVOLUTION TECHNOLOGGY",
      },
      { id: "client-rizqallah", name: "PT. Rizqallah Boer Makmur" },
      {
        id: "client-zaitech",
        name: "PT ZAITECH ENJINIRING INDONESIA",
      },
      {
        id: "client-cikarang",
        name: "PT. Cikarang listrindo Indonesia",
      },
    ]);

    expect(lookup.get("cv. leuwianyar teknik")).toBe("client-leuwi");
    expect(lookup.get("pt. engineering visi antar nusa")).toBe("client-evan");
    expect(lookup.get("pt. idea edvolution technology")).toBe("client-ideas");
    expect(lookup.get("pt. rizqallah boem makmur")).toBe("client-rizqallah");
    expect(lookup.get("pt. zaitech engineering indonesia")).toBe(
      "client-zaitech",
    );
    expect(lookup.get("pt. cikarang listrindo")).toBe("client-cikarang");
    expect(lookup.has("pt. putra arga binangun")).toBe(false);
  });

  test("keeps bare carriage returns inside unquoted Quotation cells", () => {
    const parsed = parseSheetCsv(
      "QUOTATION",
      [
        "Quotation Number,Date,Account,Description,Clients,Address,QTY,UOM,Harga satuan,Harga total,Status,SO Number,Note",
        "DSM-26QUO-0194,21/04/2026,Nur Iman,AXIAL FAN 6 Inch\r,PT. CONTROL SYSTEM ARENA PARA NUSA,PT. Control Systems Arena Para Nusa,4,Unit,Rp774.000,Rp3.096.000,Closed Lost,,Harga tidak masuk",
      ].join("\n"),
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      documentNumber: "DSM-26QUO-0194",
      description: "AXIAL FAN 6 Inch",
      customerName: "PT. CONTROL SYSTEM ARENA PARA NUSA",
      qtyRaw: "4",
      uomRaw: "Unit",
      unitPriceRaw: "Rp774.000",
      lineTotalRaw: "Rp3.096.000",
    });
  });

  test("forward-fills one unambiguous customer PO across SO line items", () => {
    const parsed = parseSheetCsv(
      "SO 2026",
      [
        "No SO,No PO Customer,Customer,Sales,Deskripsi Project,Month,Qty,Unit Price,Total Price",
        "DSM-26SO065,PO-SO-065,PT Astra Komponen Nusantara,Adhitya Wirambara,First item,MEI,1,Rp1.000,Rp1.000",
        "DSM-26SO065,,PT Astra Komponen Nusantara,Adhitya Wirambara,Second item,MEI,2,Rp1.000,Rp2.000",
      ].join("\n"),
    );

    expect(parsed.map((row) => row.customerPoNumber)).toEqual([
      "PO-SO-065",
      "PO-SO-065",
    ]);
  });

  test("parses historical quotation dates in DD/MM/YYYY format", () => {
    const classified = classifyRow(
      "QUOTATION",
      quotationRow({ dateOrMonth: "29/05/2026" }),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect((classified.header as ImportedCommercialHeader).documentDate).toBe(
        "2026-05-29",
      );
    }
  });

  test("parses Indonesian Rupiah dots as thousands separators", () => {
    const classified = classifyRow(
      "QUOTATION",
      quotationRow({
        unitPriceRaw: "Rp15.147.000",
        lineTotalRaw: "Rp15.147.000",
      }),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect(classified.item.unitPrice).toBe(15_147_000);
      expect(classified.item.lineTotal).toBe(15_147_000);
    }
  });

  test("defaults blank SO 2026 UOM to Unit", () => {
    const classified = classifyRow(
      "SO 2026",
      salesOrderRow(),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect(classified.item).toMatchObject({ qty: 2, uom: "Unit" });
    }
  });

  test("defaults blank NP 2026 UOM to Unit", () => {
    const classified = classifyRow(
      "NP 2026",
      salesOrderRow({ documentNumber: "DSM-26NP017" }),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect(classified.item).toMatchObject({ qty: 2, uom: "Unit" });
    }
  });

  test("defaults blank HARIFF UOM to Unit", () => {
    const classified = classifyRow(
      "HARIFF",
      salesOrderRow({
        documentNumber: "DSM-22SO147",
        customerName: "PT. HARIFF DAYA TUNGGAL ENGINEERING",
        ownerName: "Leli Al",
      }),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect(classified.item).toMatchObject({ qty: 2, uom: "Unit" });
    }
  });

  test("uses the client owner and imports zero-total PROTY as FOC", () => {
    const classified = classifyRow(
      "PROTY",
      salesOrderRow({
        documentNumber: "DSM-26PROTY009",
        ownerName: "",
        unitPriceRaw: "",
        lineTotalRaw: "Rp0,00",
      }),
      2026,
      clientsByName,
      salesByName,
      clientOwnersByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect(classified.item).toMatchObject({
        qty: 2,
        uom: "Unit",
        unitPrice: null,
        lineTotal: null,
      });
      expect(classified.header).toMatchObject({
        ownerId: "sales-aditya",
        prototypeStatus: "FOC",
        totalValue: null,
      });
    }
  });

  test("uses the client owner for a paid PROTY row", () => {
    const classified = classifyRow(
      "PROTY",
      salesOrderRow({
        documentNumber: "DSM-26PROTY010",
        ownerName: "",
      }),
      2026,
      clientsByName,
      salesByName,
      clientOwnersByName,
    );

    expect(classified.status).toBe("import");
    if (classified.status === "import") {
      expect(classified.item).toMatchObject({ qty: 2, uom: "Unit" });
      expect(classified.header).toMatchObject({
        ownerId: "sales-aditya",
        prototypeStatus: "Paid",
      });
    }
  });

  test("does not replace an explicit unknown PROTY sales name", () => {
    const classified = classifyRow(
      "PROTY",
      salesOrderRow({
        documentNumber: "DSM-26PROTY011",
        ownerName: "Sales Tidak Dikenal",
      }),
      2026,
      clientsByName,
      salesByName,
      clientOwnersByName,
    );

    expect(classified).toMatchObject({
      status: "review",
      code: "unmatched_sales",
    });
  });

  test("rejects impossible DD/MM/YYYY dates instead of rolling them over", () => {
    const classified = classifyRow(
      "QUOTATION",
      quotationRow({ dateOrMonth: "31/02/2026" }),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified).toMatchObject({
      status: "review",
      code: "unparseable_date",
    });
  });

  test("rejects impossible ISO dates instead of accepting the shape only", () => {
    const classified = classifyRow(
      "QUOTATION",
      quotationRow({ dateOrMonth: "2026-02-31" }),
      2026,
      clientsByName,
      salesByName,
    );

    expect(classified).toMatchObject({
      status: "review",
      code: "unparseable_date",
    });
  });

  test("groups repeated SO rows into one header and ordered items", () => {
    const document = grouped.documents.find(
      (candidate) =>
        candidate.header.kind === "sales_order" &&
        candidate.header.soNumber === "DSM-26SO143",
    );
    expect(document).toBeDefined();
    expect(document?.items).toEqual([
      {
        productName: null,
        description: "Housing panel",
        qty: 4,
        uom: "Pcs",
        unitPrice: 7_500_000,
        lineTotal: 30_000_000,
        linePosition: 1,
      },
      {
        productName: null,
        description: "Mounting kit",
        qty: 2,
        uom: "Set",
        unitPrice: 6_000_000,
        lineTotal: 12_000_000,
        linePosition: 2,
      },
    ]);
    expect(
      (document?.header as ImportedSalesOrderHeader).customerPoNumber,
    ).toBe("PO-SO-143");
    expect((document?.header as ImportedSalesOrderHeader).totalValue).toBe(
      42_000_000,
    );
  });

  test("preserves multiple customer POs on one historical HARIFF SO", () => {
    const rows = [
      salesOrderRow({
        sourceIndex: 1,
        documentNumber: "DSM-22SO147",
        customerPoNumber: "PO-HARIFF-A",
        customerName: "PT. HARIFF DAYA TUNGGAL ENGINEERING",
        ownerName: "Leli Al",
        description: "First HARIFF item",
      }),
      salesOrderRow({
        sourceIndex: 2,
        documentNumber: "DSM-22SO147",
        customerPoNumber: "PO-HARIFF-B",
        customerName: "PT. HARIFF DAYA TUNGGAL ENGINEERING",
        ownerName: "Leli Al",
        description: "Second HARIFF item",
      }),
    ].map((row) =>
      classifyRow("HARIFF", row, 2026, clientsByName, salesByName),
    );

    const hariff = groupImportRows(rows);

    expect(hariff.reviews).toHaveLength(0);
    expect(hariff.documents).toHaveLength(1);
    expect(hariff.documents[0].header).toMatchObject({
      soNumber: "DSM-22SO147",
      customerPoNumber: "PO-HARIFF-A / PO-HARIFF-B",
    });
    expect(hariff.documents[0].items.map((item) => item.description)).toEqual([
      "First HARIFF item",
      "Second HARIFF item",
    ]);
  });

  test("treats punctuation-only address variations as the same document header", () => {
    const rows = [
      quotationRow({
        sourceIndex: 1,
        documentNumber: "DSM-26QUO-0119",
        customerName: "PT. HARIFF DAYA TUNGGAL ENGINEERING",
        address: "PT.Hariff Daya Tunggal Engineering",
        description: "First item",
      }),
      quotationRow({
        sourceIndex: 2,
        documentNumber: "DSM-26QUO-0119",
        customerName: "PT. HARIFF DAYA TUNGGAL ENGINEERING",
        address: "PT Hariff Daya Tunggal Engineering",
        description: "Second item",
      }),
    ].map((row) =>
      classifyRow("QUOTATION", row, 2026, clientsByName, salesByName),
    );

    const result = groupImportRows(rows);

    expect(result.reviews).toHaveLength(0);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].items).toHaveLength(2);
    expect(result.documents[0].header).toMatchObject({
      clientAddress: "PT.Hariff Daya Tunggal Engineering",
    });
  });

  test("quarantines an entire document when any source row requires review", () => {
    const rows = [
      salesOrderRow({
        sourceIndex: 1,
        documentNumber: "DSM-26SO065",
        customerPoNumber: "PO-SO-065",
        description: "Valid first item",
      }),
      salesOrderRow({
        sourceIndex: 2,
        documentNumber: "DSM-26SO065",
        customerPoNumber: "",
        description: "Rejected continuation item",
      }),
    ].map((row) =>
      classifyRow(
        "SO 2026",
        row,
        2026,
        clientsByName,
        salesByName,
        clientOwnersByName,
      ),
    );

    const result = groupImportRows(rows);

    expect(result.documents).toHaveLength(0);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews.map((review) => review.code).sort()).toEqual([
      "document_has_rejected_rows",
      "missing_customer_po",
    ]);
  });

  test("parses embedded UOM and preserves historical month precision", () => {
    const document = grouped.documents.find(
      (candidate) =>
        candidate.header.kind === "sales_order" &&
        candidate.header.soNumber === "DSM-26NP016",
    );
    expect(document?.items[0]).toMatchObject({ qty: 1, uom: "Unit" });
    expect((document?.header as ImportedSalesOrderHeader).date).toBe(
      "2026-01-01",
    );
  });

  test("preserves Prototype FOC items with null money", () => {
    const document = grouped.documents.find(
      (candidate) =>
        candidate.header.kind === "sales_order" &&
        candidate.header.soNumber === "DSM-26PROTY007",
    );
    expect(document?.items[0]).toMatchObject({
      productName: null,
      qty: 1,
      uom: "Unit",
      unitPrice: null,
      lineTotal: null,
    });
    expect(
      (document?.header as ImportedSalesOrderHeader).totalValue,
    ).toBeNull();
  });

  test("normalizes quotation revisions while preserving raw full number", () => {
    const base = grouped.documents.find(
      (candidate) =>
        candidate.header.kind === "commercial" &&
        candidate.header.quotationNumber === "DSM-26QUO-0404",
    );
    const revision = grouped.documents.find(
      (candidate) =>
        candidate.header.kind === "commercial" &&
        candidate.header.quotationNumber === "DSM-26QUO-0404_REV.01",
    );
    expect(base?.items).toHaveLength(2);
    expect(base?.header).toMatchObject({
      quotationRevision: 0,
      isCurrentRevision: false,
      supersedesQuotationNumber: null,
    });
    expect(revision?.header).toMatchObject({
      quotationBaseNumber: "DSM-26QUO-0404",
      quotationRevision: 1,
      isCurrentRevision: true,
      supersedesQuotationNumber: "DSM-26QUO-0404",
    });
    expect((revision?.header as ImportedCommercialHeader).documentDate).toBe(
      "2026-07-10",
    );
  });

  test("rejects every ambiguity instead of guessing or partially grouping", () => {
    const codes = grouped.reviews.map((entry) => entry.code);
    expect(codes).toContain("unmatched_customer");
    expect(codes).toContain("unmatched_sales");
    expect(codes).toContain("invalid_paid_money");
    expect(codes).toContain("price_mismatch");
    expect(codes).toContain("unknown_uom");
    expect(codes).toContain("foc_money_present");
    expect(codes.filter((code) => code === "header_conflict")).toHaveLength(4);
    expect(
      grouped.documents.some(
        (document) =>
          document.header.kind === "sales_order" &&
          document.header.soNumber === "DSM-26SO130",
      ),
    ).toBe(false);
    expect(
      grouped.documents.some(
        (document) =>
          document.header.kind === "commercial" &&
          document.header.quotationNumber === "DSM-26QUO-0403",
      ),
    ).toBe(false);
  });

  test("derives independent maxima, skips gaps and HARIFF history", () => {
    expect(deriveCounterSeeds(allRows)).toEqual([
      { series: "NP", yearCode: 26, lastValue: 16 },
      { series: "PROTY", yearCode: 26, lastValue: 8 },
      { series: "QUO", yearCode: 26, lastValue: 404 },
      { series: "SO", yearCode: 26, lastValue: 143 },
    ]);
  });

  test("reserves a valid official number even when its row requires review", () => {
    const rows = [
      classifyRow(
        "SO 2026",
        salesOrderRow({ documentNumber: "DSM-26SO143" }),
        2026,
        clientsByName,
        salesByName,
        clientOwnersByName,
      ),
      classifyRow(
        "SO 2026",
        salesOrderRow({
          sourceIndex: 2,
          documentNumber: "DSM-26SO145",
          customerName: "Unknown Client",
        }),
        2026,
        clientsByName,
        salesByName,
        clientOwnersByName,
      ),
    ];

    expect(deriveCounterSeeds(rows)).toEqual([
      { series: "SO", yearCode: 26, lastValue: 145 },
    ]);
  });

  test("reconciliation counts source rows, reviews, headers, and items exactly", () => {
    const importedItemCount = grouped.documents.reduce(
      (sum, document) => sum + document.items.length,
      0,
    );
    expect(allRows).toHaveLength(20);
    expect(grouped.documents).toHaveLength(8);
    expect(importedItemCount).toBe(10);
    expect(grouped.reviews).toHaveLength(10);
    expect(importedItemCount + grouped.reviews.length).toBe(allRows.length);
  });
});
