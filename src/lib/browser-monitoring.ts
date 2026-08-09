let initialized = false;

type BrowserMonitoringEnv = {
  VITE_SENTRY_DSN?: unknown;
  VITE_SENTRY_ENVIRONMENT?: unknown;
  VITE_SENTRY_RELEASE?: unknown;
  VITE_VERCEL_GIT_COMMIT_SHA?: unknown;
};

function trimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function browserMonitoringOptions(env: BrowserMonitoringEnv):
  | {
      dsn: string;
      environment?: string;
      release?: string;
    }
  | undefined {
  const dsn = trimmedString(env.VITE_SENTRY_DSN);
  if (!dsn) return undefined;

  return {
    dsn,
    environment: trimmedString(env.VITE_SENTRY_ENVIRONMENT),
    release:
      trimmedString(env.VITE_SENTRY_RELEASE) ??
      trimmedString(env.VITE_VERCEL_GIT_COMMIT_SHA),
  };
}

function browserDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  return typeof dsn === "string" && dsn.trim() ? dsn : undefined;
}

export async function initBrowserMonitoring(): Promise<void> {
  if (typeof window === "undefined" || initialized) return;
  const dsn = browserDsn();
  if (!dsn) return;
  const options = browserMonitoringOptions(
    import.meta.env as BrowserMonitoringEnv,
  );
  if (!options) return;

  const Sentry = await import("@sentry/react");
  Sentry.init({
    ...options,
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
