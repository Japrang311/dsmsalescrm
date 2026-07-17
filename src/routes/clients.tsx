import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/badges";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clients, findUser, formatIDR, users } from "@/lib/mock-data";
import type { ClientStatus } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/clients")({
  head: () => ({ meta: [{ title: "Clients · DSM Sales Execution" }] }),
  component: ClientsPage,
});

const statuses: (ClientStatus | "all")[] = [
  "all",
  "Prospect",
  "Active Customer",
  "Repeat Order",
  "Dormant",
  "Lost",
];

function ClientsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ClientStatus | "all">("all");
  const [owner, setOwner] = useState<string>("all");

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (owner !== "all" && c.ownerId !== owner) return false;
      if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [q, status, owner]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="DSM's CRM is built around existing customers, referrals, and web inquiries — not cold canvassing."
        actions={
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> New Client
          </Button>
        }
      />
      <Card>
        <CardHeader className="flex flex-wrap gap-3">
          <Input
            className="h-9 max-w-xs"
            placeholder="Search client name..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus | "all")}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="h-9 w-52">
              <SelectValue placeholder="Sales owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {users
                .filter((u) => u.role !== "executive")
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="text-right">Spending YTD</TableHead>
                <TableHead className="text-right">PPN</TableHead>
                <TableHead className="text-right">Non-PPN</TableHead>
                <TableHead>Last FU</TableHead>
                <TableHead>Next FU</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <Link
                      to="/clients/$id"
                      params={{ id: c.id }}
                      className="hover:text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-[10px] text-muted-foreground">{c.city}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.industry}</TableCell>
                  <TableCell className="text-sm">{findUser(c.ownerId)?.name}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatIDR(c.spendingYTD)}
                  </TableCell>
                  <TableCell className="text-right text-sm">{formatIDR(c.revenuePPN)}</TableCell>
                  <TableCell className="text-right text-sm">{formatIDR(c.revenueNonPPN)}</TableCell>
                  <TableCell className="text-xs">{c.lastFU}</TableCell>
                  <TableCell className="text-xs">{c.nextFU}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
