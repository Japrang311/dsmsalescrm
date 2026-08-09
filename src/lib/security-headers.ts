type SecurityHeaderEnv = Record<string, string | undefined> & {
  VERCEL_ENV?: string;
  VITE_SUPABASE_URL?: string;
};

function toolbarSource(env: SecurityHeaderEnv, ...sources: string[]) {
  return env.VERCEL_ENV === "preview" ? ` ${sources.join(" ")}` : "";
}

function localSupabaseConnectSources(env: SecurityHeaderEnv): string {
  const rawUrl = env.VITE_SUPABASE_URL;
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    const isLocalhost =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1";

    if (!isLocalhost) return "";

    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return ` ${url.origin} ${wsProtocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function buildContentSecurityPolicy(
  env: SecurityHeaderEnv = process.env,
): string {
  // 'unsafe-inline' on script-src is required: TanStack Start injects inline
  // hydration/dehydration scripts with no nonce hook. Everything else is locked
  // to same-origin plus the two services the app actually talks to.
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${toolbarSource(env, "https://vercel.live")}`,
    `style-src 'self' 'unsafe-inline'${toolbarSource(env, "https://vercel.live")}`,
    `img-src 'self' data: blob:${toolbarSource(env, "https://vercel.live", "https://assets.vercel.com")}`,
    `font-src 'self' data:${toolbarSource(env, "https://vercel.live", "https://assets.vercel.com")}`,
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io${localSupabaseConnectSources(env)}${toolbarSource(env, "https://vercel.live", "https://*.pusher.com", "wss://*.pusher.com")}`,
    // blob: is required — QuotationPreviewDialog renders the generated PDF in an
    // iframe from a blob URL.
    `frame-src 'self' blob:${toolbarSource(env, "https://vercel.live")}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(
  env: SecurityHeaderEnv = process.env,
): Record<string, string> {
  return {
    "content-security-policy": buildContentSecurityPolicy(env),
    // Matches the HSTS header Vercel already serves on the edge — do not weaken it.
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}
