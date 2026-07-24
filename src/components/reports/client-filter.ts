export function filterClientOptions<T extends { id: string; name: string }>(
  clients: T[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");

  return clients
    .filter(
      (client) =>
        !normalizedQuery ||
        client.name.toLocaleLowerCase("id-ID").includes(normalizedQuery),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
