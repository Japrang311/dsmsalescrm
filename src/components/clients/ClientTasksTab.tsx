import { Calendar } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { SectionTitle } from "@/components/clients/ClientPrimitives";
import { formatDateShort } from "@/lib/format";
import type { Task } from "@/lib/domain";

export function ClientTasksTab({ clientTasks }: { clientTasks: Task[] }) {
  return (
    <div className="mt-4 space-y-3">
      <Card>
        <CardContent className="p-4">
          <SectionTitle icon={Calendar} title="Semua Tasks" />
          {clientTasks.length === 0 ? (
            <EmptyState
              className="mt-3"
              description="Belum ada task untuk klien ini."
            />
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Workflow</TableHead>
                    <TableHead>Due State</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientTasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell>{t.method}</TableCell>
                      <TableCell>{formatDateShort(t.dueDate)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.workflowStatus === "Cancelled"
                              ? "destructive"
                              : t.workflowStatus === "Done"
                                ? "secondary"
                                : "default"
                          }
                          className="text-[10px]"
                        >
                          {t.workflowStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {t.dueState ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.priority === "High" ? "destructive" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {t.priority}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
