import * as Sentry from "@sentry/node";

let initialized = false;

function serverDsn(): string | undefined {
  const dsn = process.env.SENTRY_DSN ?? process.env.VITE_SENTRY_DSN;
  return typeof dsn === "string" && dsn.trim() ? dsn : undefined;
}

export function initServerMonitoring(): void {
  if (initialized) return;
  const dsn = serverDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
  initialized = true;
}

export function captureServerException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}
