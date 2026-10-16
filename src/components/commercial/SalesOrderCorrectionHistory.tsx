import { useInfiniteQuery } from "@tanstack/react-query";
import { listSalesOrderCorrections } from "@/lib/data/activity-log";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export function SalesOrderCorrectionHistory({
  id,
  owners,
}: {
  id: string;
  owners: Record<string, { name: string }>;
}) {
  const query = useInfiniteQuery({
    queryKey: ["activity-log", "so-corrections", id],
    initialPageParam: undefined as { at: string; id: string } | undefined,
    queryFn: ({ pageParam }) => listSalesOrderCorrections(id, pageParam),
    getNextPageParam: (last) =>
      last.length === 50
        ? { at: last[last.length - 1].created_at, id: last[last.length - 1].id }
        : undefined,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Riwayat koreksi SO</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <p>Memuat audit…</p>
        ) : query.isError ? (
          <p role="alert">Gagal memuat audit koreksi.</p>
        ) : (
          <ul className="space-y-3">
            {query.data.pages.flat().map((row) => (
              <li key={row.id} className="rounded border p-3 text-sm">
                <p className="font-medium">{row.title}</p>
                <p>
                  {formatDateTime(row.created_at)} · oleh{" "}
                  {owners[row.actor_id]?.name ?? row.actor_id} · owner{" "}
                  {owners[row.owner_id]?.name ?? row.owner_id}
                </p>
                <p>Alasan: {row.event_data?.reason ?? row.detail ?? "—"}</p>
                {row.event_data && (
                  <details>
                    <summary>Perubahan sebelum / sesudah</summary>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(
                        {
                          before: row.event_data.before,
                          after: row.event_data.after,
                        },
                        null,
                        2,
                      )}
                    </pre>
                    <p className="break-all text-xs">
                      Referensi: {row.event_data.request_id}
                    </p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {query.isSuccess && query.data.pages[0].length === 0 && (
          <p>Belum ada koreksi SO.</p>
        )}
        {query.hasNextPage && (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Muat audit berikutnya
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
