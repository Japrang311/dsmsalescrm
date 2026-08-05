let initialized = false;

function browserDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  return typeof dsn === "string" && dsn.trim() ? dsn : undefined;
}

export async function initBrowserMonitoring(): Promise<void> {
  if (typeof window === "undefined" || initialized) return;
  const dsn = browserDsn();
  if (!dsn) return;

  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
  });
  initialized = true;
}

export function captureBrowserException(error: unknown): void {
  if (typeof window === "undefined") return;

  void initBrowserMonitoring().then(async () => {
    if (!initialized) return;
    const Sentry = await import("@sentry/react");
    Sentry.captureException(error);
  });
}
