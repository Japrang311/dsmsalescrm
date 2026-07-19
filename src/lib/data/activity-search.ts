export type ActivitySearchEvent = {
  title: string;
  detail?: string;
  administrativeReason?: string;
  kindLabel?: string;
  clientName?: string;
  ownerName?: string;
  actorName?: string;
  targetName?: string;
};

export function matchesActivitySearch(
  event: ActivitySearchEvent,
  query: string,
  fallbackKindLabel: string,
): boolean {
  const haystack = [
    event.title,
    event.detail,
    event.administrativeReason,
    event.kindLabel ?? fallbackKindLabel,
    event.clientName,
    event.ownerName,
    event.actorName,
    event.targetName,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}
