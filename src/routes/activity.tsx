import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TaskStatusBadge } from "@/components/app/badges";
import { findClient, findUser, tasks } from "@/lib/mock-data";
import { Phone, Mail, Users, MessageCircle, Building } from "lucide-react";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity Log · DSM" }] }),
  component: ActivityPage,
});

const icons = {
  Phone,
  Email: Mail,
  Visit: Building,
  WhatsApp: MessageCircle,
  Meeting: Users,
} as const;

function ActivityPage() {
  const sorted = [...tasks].sort((a, b) => b.tanggalFU.localeCompare(a.tanggalFU));
  return (
    <>
      <PageHeader
        title="Activity Log"
        description="Chronological feed of all customer follow-ups across the team — mirrors the DAILY ACTIVITY sheet."
      />
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {sorted.map((t) => {
            const client = findClient(t.clientId);
            const owner = findUser(t.ownerId);
            const Icon = icons[t.metodeFU];
            return (
              <div key={t.id} className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{client?.name}</p>
                    <TaskStatusBadge status={t.status} />
                    <span className="text-xs text-muted-foreground">
                      by {owner?.name} · {t.tanggalFU}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm">
                    {t.metodeFU} — Hasil: <span className="font-medium">{t.hasilFU}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Next action: {t.nextAction} · Next FU: {t.tanggalNextFU}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
