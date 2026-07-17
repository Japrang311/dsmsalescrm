// Mock data for DSM Sales Execution prototype.
// Field names intentionally mirror the source Google Sheets tabs so a
// backend implementer can map them directly.

export type Role = "sales" | "manager" | "executive";

export type ClientStatus =
  | "Prospect"
  | "Active Customer"
  | "Lost"
  | "Dormant"
  | "Repeat Order";

export type FollowUpResult =
  | "No Response"
  | "Interested"
  | "Need Quotation"
  | "Quotation Sent"
  | "Negotiation"
  | "Waiting PO"
  | "PO Confirmed"
  | "Not Interested"
  | "Follow-up Later";

export type CommercialType =
  | "RFQ"
  | "Quotation"
  | "Repeat Order Request"
  | "PO"
  | "Sales Order";

export type NewRfqStage =
  | "RFQ Received"
  | "Quotation in Progress"
  | "Quotation Sent"
  | "Waiting Client PO"
  | "PO Received"
  | "Sales Order Released"
  | "Revenue Recorded"
  | "Closed Lost";

export type RepeatStage =
  | "Timeplan/Price Update Requested"
  | "Waiting Client PO"
  | "PO Received"
  | "Sales Order Released"
  | "Revenue Recorded";

export type Stage = NewRfqStage | RepeatStage;

export interface User {
  id: string;
  name: string;
  role: Role;
  initials: string;
  email: string;
}

export interface Client {
  id: string;
  name: string;
  status: ClientStatus;
  ownerId: string;
  industry: string;
  city: string;
  spendingYTD: number;
  revenuePPN: number;
  revenueNonPPN: number;
  lastFU: string;
  nextFU: string;
  createdAt: string;
  notes?: string;
}

export interface Task {
  id: string;
  clientId: string;
  commercialItemId?: string;
  ownerId: string;
  title: string;
  tanggalFU: string;
  metodeFU: "Phone" | "Email" | "Visit" | "WhatsApp" | "Meeting";
  hasilFU?: FollowUpResult;
  nextAction: string;
  tanggalNextFU: string;
  statusCustomer: ClientStatus;
  potensiNilai: number;
  catatan: string;
  status: "Open" | "Done" | "Overdue" | "Archived";
  createdAt: string;
}

export interface CommercialItem {
  id: string;
  clientId: string;
  ownerId: string;
  type: CommercialType;
  flow: "New RFQ" | "Repeat Order";
  stage: Stage;
  description: string;
  amount: number;
  probability: number;
  quotationNo?: string;
  poNo?: string;
  soNo?: string;
  createdAt: string;
  nextFUDate: string;
  agingDays: number;
}

export interface RevenueRow {
  id: string;
  month: string; // "2026-01"
  week: number;
  poNo: string;
  soNo: string;
  clientId: string;
  ownerId: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  ppn: boolean;
  flow: "New RFQ" | "Repeat Order";
  revenueDate: string;
}

export interface MonthlyTarget {
  month: string; // "2026-01"
  target: number;
  achievement: number;
}

// ---------------- Users ----------------
export const users: User[] = [
  { id: "u1", name: "Bagas Pratama", role: "manager", initials: "BP", email: "bagas@dsm.co.id" },
  { id: "u2", name: "Ratna Sari", role: "sales", initials: "RS", email: "ratna@dsm.co.id" },
  { id: "u3", name: "Andi Wibowo", role: "sales", initials: "AW", email: "andi@dsm.co.id" },
  { id: "u4", name: "Dewi Anggraini", role: "sales", initials: "DA", email: "dewi@dsm.co.id" },
  { id: "u5", name: "Fajar Nugroho", role: "sales", initials: "FN", email: "fajar@dsm.co.id" },
  { id: "u6", name: "Pak Hendra (Direktur)", role: "executive", initials: "PH", email: "hendra@dsm.co.id" },
];

export const currentUserByRole: Record<Role, User> = {
  sales: users[1],
  manager: users[0],
  executive: users[5],
};

// ---------------- Clients ----------------
const clientSeed: Array<[string, ClientStatus, string, string, string, number, number, number]> = [
  ["PT Astra Otoparts", "Active Customer", "u1", "Automotive", "Bekasi", 1_450_000_000, 1_100_000_000, 350_000_000],
  ["PT Toyota Astra Motor", "Repeat Order", "u1", "Automotive", "Karawang", 2_320_000_000, 1_900_000_000, 420_000_000],
  ["PT Nippon Indosari", "Active Customer", "u2", "Food & Bev", "Cikarang", 780_000_000, 620_000_000, 160_000_000],
  ["PT Panasonic Manufacturing", "Repeat Order", "u2", "Electronics", "Bekasi", 1_120_000_000, 900_000_000, 220_000_000],
  ["PT Sharp Electronics Indonesia", "Active Customer", "u3", "Electronics", "Karawang", 640_000_000, 480_000_000, 160_000_000],
  ["PT Yamaha Indonesia", "Active Customer", "u3", "Automotive", "Pulogadung", 890_000_000, 720_000_000, 170_000_000],
  ["PT Denso Indonesia", "Repeat Order", "u4", "Automotive", "Bekasi", 1_580_000_000, 1_280_000_000, 300_000_000],
  ["PT Indofood CBP", "Active Customer", "u4", "Food & Bev", "Cibitung", 520_000_000, 420_000_000, 100_000_000],
  ["PT Kalbe Farma", "Prospect", "u2", "Pharma", "Cikarang", 0, 0, 0],
  ["PT Mayora Indah", "Active Customer", "u5", "Food & Bev", "Tangerang", 460_000_000, 380_000_000, 80_000_000],
  ["PT Unilever Indonesia", "Repeat Order", "u5", "Consumer Goods", "Cikarang", 1_240_000_000, 1_000_000_000, 240_000_000],
  ["PT LG Electronics", "Dormant", "u3", "Electronics", "Tangerang", 0, 0, 0],
  ["CV Karya Mandiri", "Active Customer", "u4", "General", "Bekasi", 210_000_000, 160_000_000, 50_000_000],
  ["PT Suzuki Indomobil", "Prospect", "u1", "Automotive", "Cikarang", 0, 0, 0],
  ["PT Nestle Indonesia", "Active Customer", "u5", "Food & Bev", "Karawang", 380_000_000, 320_000_000, 60_000_000],
  ["PT Sanken Indonesia", "Repeat Order", "u2", "Electronics", "Bekasi", 720_000_000, 580_000_000, 140_000_000],
  ["PT Mitsubishi Motors", "Active Customer", "u1", "Automotive", "Karawang", 990_000_000, 800_000_000, 190_000_000],
  ["PT Wilmar Nabati", "Prospect", "u4", "Food & Bev", "Gresik", 0, 0, 0],
  ["PT Tokopedia Logistics", "Lost", "u3", "Logistics", "Jakarta", 0, 0, 0],
  ["PT Krakatau Steel", "Active Customer", "u1", "Steel", "Cilegon", 1_780_000_000, 1_450_000_000, 330_000_000],
  ["PT Sinar Sosro", "Dormant", "u5", "Food & Bev", "Tangerang", 0, 0, 0],
  ["PT Hino Motors Sales", "Repeat Order", "u4", "Automotive", "Purwakarta", 620_000_000, 500_000_000, 120_000_000],
  ["PT Schneider Electric", "Active Customer", "u2", "Electronics", "Cikarang", 540_000_000, 440_000_000, 100_000_000],
  ["PT Sanwa Engineering", "Prospect", "u3", "Machinery", "Bekasi", 0, 0, 0],
  ["PT Modern Industries", "Active Customer", "u5", "General", "Serang", 310_000_000, 240_000_000, 70_000_000],
];

const today = new Date("2026-07-17");
function daysAgo(n: number) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function daysFromNow(n: number) {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const clients: Client[] = clientSeed.map(([name, status, ownerId, industry, city, sp, ppn, non], i) => ({
  id: `c${i + 1}`,
  name,
  status,
  ownerId,
  industry,
  city,
  spendingYTD: sp,
  revenuePPN: ppn,
  revenueNonPPN: non,
  lastFU: daysAgo(((i * 7) % 30) + 2),
  nextFU: daysFromNow(((i * 5) % 20) - 5),
  createdAt: daysAgo(180 + i * 5),
}));

// ---------------- Commercial items ----------------
const newRfqStages: NewRfqStage[] = [
  "RFQ Received",
  "Quotation in Progress",
  "Quotation Sent",
  "Waiting Client PO",
  "PO Received",
  "Sales Order Released",
  "Revenue Recorded",
  "Closed Lost",
];
const repeatStages: RepeatStage[] = [
  "Timeplan/Price Update Requested",
  "Waiting Client PO",
  "PO Received",
  "Sales Order Released",
  "Revenue Recorded",
];

const descriptions = [
  "Custom bracket assembly SS304",
  "Enclosure panel powder coated",
  "Sheet metal chassis 1.5mm",
  "Ducting galvanized 0.8mm",
  "Cover plate laser cut",
  "Frame weldment MS",
  "Junction box IP54",
  "Support bracket bending",
  "Mounting plate aluminum",
  "Cabinet 19-inch rack",
];

export const commercialItems: CommercialItem[] = Array.from({ length: 42 }, (_, i) => {
  const client = clients[i % clients.length];
  const isRepeat = i % 3 === 0 && client.status === "Repeat Order";
  const flow = isRepeat ? "Repeat Order" : "New RFQ";
  const stage = isRepeat
    ? repeatStages[i % repeatStages.length]
    : newRfqStages[i % newRfqStages.length];
  const type: CommercialType =
    stage === "RFQ Received"
      ? "RFQ"
      : stage.includes("Quotation")
        ? "Quotation"
        : stage === "Timeplan/Price Update Requested"
          ? "Repeat Order Request"
          : stage.includes("PO")
            ? "PO"
            : "Sales Order";
  const amount = 50_000_000 + ((i * 37) % 40) * 15_000_000;
  return {
    id: `ci${i + 1}`,
    clientId: client.id,
    ownerId: client.ownerId,
    type,
    flow,
    stage,
    description: descriptions[i % descriptions.length],
    amount,
    probability: Math.min(90, 20 + (newRfqStages.indexOf(stage as NewRfqStage) + 1) * 10),
    quotationNo: `QT-2026-${String(1000 + i).slice(1)}`,
    poNo: stage.includes("PO") || stage.includes("Sales Order") || stage.includes("Revenue")
      ? `PO-${String(2000 + i)}`
      : undefined,
    soNo: stage.includes("Sales Order") || stage.includes("Revenue")
      ? `SO-2026-${String(3000 + i).slice(1)}`
      : undefined,
    createdAt: daysAgo(60 - i),
    nextFUDate: daysFromNow(((i * 3) % 14) - 3),
    agingDays: (i * 5) % 45,
  };
});

// ---------------- Sales Orders (multi-line) ----------------
export interface SalesOrderLine {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface SalesOrder {
  id: string;
  soNo: string;
  poNo: string;
  clientId: string;
  ownerId: string;
  poReleaseDate: string;
  expectedDeliveryDate: string;
  lines: SalesOrderLine[];
  totalAmount: number;
}

function addDays(base: string, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export const salesOrders: SalesOrder[] = Array.from({ length: 12 }, (_, i) => {
  const client = clients[(i * 2) % clients.length];
  const poRelease = daysAgo(((i * 6) % 40) + 3);
  const leadDays = 21 + ((i * 7) % 25); // 21..45
  const expected = addDays(poRelease, leadDays);
  const lineCount = (i % 4) + 1; // 1..4 lines
  const lines: SalesOrderLine[] = Array.from({ length: lineCount }, (_, j) => {
    const qty = 20 + ((i * 11 + j * 17) % 180);
    const unitPrice = 250_000 + (((i + j) * 13) % 24) * 75_000;
    return {
      id: `sol-${i + 1}-${j + 1}`,
      description: descriptions[(i * 3 + j) % descriptions.length],
      qty,
      unitPrice,
      total: qty * unitPrice,
    };
  });
  const totalAmount = lines.reduce((s, l) => s + l.total, 0);
  return {
    id: `so${i + 1}`,
    soNo: `SO-2026-${String(100 + i).padStart(3, "0")}`,
    poNo: `PO-${String(2100 + i)}`,
    clientId: client.id,
    ownerId: client.ownerId,
    poReleaseDate: poRelease,
    expectedDeliveryDate: expected,
    lines,
    totalAmount,
  };
});

// ---------------- Prototypes ----------------
export interface PrototypeLine {
  id: string;
  description: string;
  qty: number;
  unitPrice?: number;
  total?: number;
}

export interface Prototype {
  id: string;
  protoNo: string;
  refNo?: string;
  clientId: string;
  ownerId: string;
  releaseDate: string;
  expectedDeliveryDate: string;
  lines: PrototypeLine[];
  totalAmount: number;
  chargeable: boolean;
  ppn: boolean;
}

export const prototypes: Prototype[] = Array.from({ length: 6 }, (_, i) => {
  const client = clients[(i * 3 + 1) % clients.length];
  const release = daysAgo(((i * 5) % 30) + 2);
  const expected = addDays(release, 10 + ((i * 4) % 14));
  const lineCount = (i % 3) + 1;
  // Free samples for i=1,4 (unitPrice kosong); sisanya chargeable
  const isFree = i === 1 || i === 4;
  const lines: PrototypeLine[] = Array.from({ length: lineCount }, (_, j) => {
    const qty = 2 + ((i * 5 + j * 3) % 15);
    if (isFree) {
      return {
        id: `ptl-${i + 1}-${j + 1}`,
        description: descriptions[(i * 2 + j + 4) % descriptions.length],
        qty,
      };
    }
    const unitPrice = 350_000 + (((i + j) * 7) % 20) * 50_000;
    return {
      id: `ptl-${i + 1}-${j + 1}`,
      description: descriptions[(i * 2 + j + 4) % descriptions.length],
      qty,
      unitPrice,
      total: qty * unitPrice,
    };
  });
  const totalAmount = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  return {
    id: `pt${i + 1}`,
    protoNo: `PT-2026-${String(50 + i).padStart(3, "0")}`,
    refNo: i % 3 === 0 ? undefined : `REF-${1200 + i}`,
    clientId: client.id,
    ownerId: client.ownerId,
    releaseDate: release,
    expectedDeliveryDate: expected,
    lines,
    totalAmount,
    chargeable: !isFree,
    ppn: i % 2 === 0,
  };
});

export function prototypeRevenue(ownerId?: string) {
  const rows = ownerId ? prototypes.filter((p) => p.ownerId === ownerId) : prototypes;
  return rows.filter((p) => p.chargeable).reduce((s, p) => s + p.totalAmount, 0);
}

// ---------------- Tasks ----------------
const results: FollowUpResult[] = [
  "No Response",
  "Interested",
  "Need Quotation",
  "Quotation Sent",
  "Negotiation",
  "Waiting PO",
  "PO Confirmed",
  "Follow-up Later",
];

export const tasks: Task[] = Array.from({ length: 34 }, (_, i) => {
  const client = clients[i % clients.length];
  const ci = commercialItems[i % commercialItems.length];
  const dueOffset = (i * 3) % 30 - 12;
  const isOverdue = dueOffset < 0 && i % 4 !== 0;
  return {
    id: `t${i + 1}`,
    clientId: client.id,
    commercialItemId: ci.id,
    ownerId: client.ownerId,
    title: `Follow up ${client.name}`,
    tanggalFU: daysAgo(Math.abs(dueOffset)),
    metodeFU: (["Phone", "Email", "Visit", "WhatsApp", "Meeting"] as const)[i % 5],
    hasilFU: results[i % results.length],
    nextAction: [
      "Kirim quotation revisi",
      "Follow up PO",
      "Konfirmasi timeplan",
      "Visit ke pabrik",
      "Meeting negosiasi harga",
    ][i % 5],
    tanggalNextFU: daysFromNow(dueOffset),
    statusCustomer: client.status,
    potensiNilai: 80_000_000 + ((i * 23) % 20) * 25_000_000,
    catatan: "Client meminta update timeline dan konfirmasi harga terbaru.",
    status: i % 6 === 0 ? "Done" : isOverdue ? "Overdue" : "Open",
    createdAt: daysAgo(30 + i),
  };
});

// ---------------- Revenue ----------------
const months2026 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
export const revenue: RevenueRow[] = Array.from({ length: 68 }, (_, i) => {
  const client = clients[i % clients.length];
  const month = months2026[i % months2026.length];
  const qty = 50 + ((i * 11) % 200);
  const unit = 100_000 + ((i * 17) % 30) * 25_000;
  return {
    id: `r${i + 1}`,
    month,
    week: (i % 4) + 1,
    poNo: `PO-${2000 + i}`,
    soNo: `SO-2026-${String(3000 + i).slice(1)}`,
    clientId: client.id,
    ownerId: client.ownerId,
    description: descriptions[i % descriptions.length],
    qty,
    unitPrice: unit,
    total: qty * unit,
    ppn: i % 4 !== 0,
    flow: i % 5 === 0 ? "Repeat Order" : "New RFQ",
    revenueDate: `${month}-${String(((i * 3) % 27) + 1).padStart(2, "0")}`,
  };
});

// ---------------- Targets ----------------
export const monthlyTargets: MonthlyTarget[] = months2026.map((month, i) => {
  const target = 2_500_000_000 + i * 100_000_000;
  const achievement = revenue
    .filter((r) => r.month === month)
    .reduce((s, r) => s + r.total, 0);
  return { month, target, achievement };
});

// ---------------- Helpers ----------------
export const findUser = (id: string) => users.find((u) => u.id === id);
export const findClient = (id: string) => clients.find((c) => c.id === id);
export const findCI = (id: string) => commercialItems.find((c) => c.id === id);

export function formatIDR(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)} M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return `Rp ${n}`;
}

export function formatFullIDR(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

export function ytdAchievement(ownerId?: string) {
  const rows = ownerId ? revenue.filter((r) => r.ownerId === ownerId) : revenue;
  return rows.reduce((s, r) => s + r.total, 0);
}

export function ytdTarget() {
  return monthlyTargets.reduce((s, m) => s + m.target, 0);
}

export function ppnBreakdown(ownerId?: string) {
  const rows = ownerId ? revenue.filter((r) => r.ownerId === ownerId) : revenue;
  const ppn = rows.filter((r) => r.ppn).reduce((s, r) => s + r.total, 0);
  const non = rows.filter((r) => !r.ppn).reduce((s, r) => s + r.total, 0);
  return { ppn, non, total: ppn + non };
}

export function topCustomers(limit = 5) {
  const map = new Map<string, number>();
  for (const r of revenue) {
    map.set(r.clientId, (map.get(r.clientId) ?? 0) + r.total);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([clientId, total]) => ({ client: findClient(clientId)!, total }));
}

export function salesPerformance() {
  return users
    .filter((u) => u.role === "sales" || u.role === "manager")
    .map((u) => {
      const rev = ytdAchievement(u.id);
      const openTasks = tasks.filter((t) => t.ownerId === u.id && t.status === "Open").length;
      const overdue = tasks.filter((t) => t.ownerId === u.id && t.status === "Overdue").length;
      const activeCI = commercialItems.filter(
        (c) => c.ownerId === u.id && !["Revenue Recorded", "Closed Lost"].includes(c.stage),
      ).length;
      return { user: u, revenue: rev, openTasks, overdue, activeCI };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function pipelineByStage() {
  const map = new Map<Stage, { count: number; value: number }>();
  for (const c of commercialItems) {
    const cur = map.get(c.stage) ?? { count: 0, value: 0 };
    map.set(c.stage, { count: cur.count + 1, value: cur.value + c.amount });
  }
  return map;
}
