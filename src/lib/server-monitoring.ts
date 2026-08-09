import * as Sentry from "@sentry/node";

let initialized = false;

type ServerMonitoringEnv = {
  SENTRY_DSN?: unknown;
  VITE_SENTRY_DSN?: unknown;
  SENTRY_ENVIRONMENT?: unknown;
  VERCEL_ENV?: unknown;
  NODE_ENV?: unknown;
  SENTRY_RELEASE?: unknown;
  VERCEL_GIT_COMMIT_SHA?: unknown;
};

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function serverMonitoringOptions(env: ServerMonitoringEnv):
  | {
      dsn: string;
      environment?: string;
      release?: string;
    }
  | undefined {
  const dsn =
    trimmedString(env.SENTRY_DSN) ?? trimmedString(env.VITE_SENTRY_DSN);
  if (!dsn) return undefined;

  return {
    dsn,
    environment:
      trimmedString(env.SENTRY_ENVIRONMENT) ??
      trimmedString(env.VERCEL_ENV) ??
      trimmedString(env.NODE_ENV),
    release:
      trimmedString(env.SENTRY_RELEASE) ??
      trimmedString(env.VERCEL_GIT_COMMIT_SHA),
  };
}

export function initServerMonitoring(): void {
  if (initialized) return;
  const options = serverMonitoringOptions(process.env);
  if (!options) return;

  Sentry.init({
    ...options,
    tracesSampleRate: 0,
  });
  initialized = true;
}

export function captureServerException(error: unknown): void {
  if (!initialized) return;
  Sentry.captureException(error);
}
