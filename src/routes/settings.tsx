import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { users, monthlyTargets, formatIDR } from "@/lib/mock-data";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · DSM" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Team, targets, and system configuration (prototype placeholders — backend to be implemented)."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team</CardTitle>
            <CardDescription>1 Sales Manager · 4 Sales · 1 Top Executive</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-md border border-border p-2.5"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-navy text-navy-foreground text-xs font-semibold">
                      {u.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <Badge variant="outline" className="capitalize">
                  {u.role}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Targets 2026</CardTitle>
            <CardDescription>Source of truth: Monthly Target VS Month PO sheet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {monthlyTargets.map((m) => (
              <div
                key={m.month}
                className="flex items-center justify-between rounded-md border border-border p-2.5"
              >
                <span className="text-sm font-medium">{m.month}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">
                    Target: <span className="font-medium">{formatIDR(m.target)}</span>
                  </span>
                  <span className="text-primary">
                    Ach: <span className="font-semibold">{formatIDR(m.achievement)}</span>
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
