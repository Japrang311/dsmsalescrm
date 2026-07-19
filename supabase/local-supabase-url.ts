const APPROVED_LOCAL_SUPABASE_PORT = "54321";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const REFUSAL_MESSAGE =
  "Refusing privileged Supabase access outside the approved local origin";

/**
 * Validates a privileged Supabase target without reading environment state or
 * contacting Supabase. Only an exact HTTP origin on the approved local API
 * port is accepted; paths, credentials, query strings, and fragments fail.
 */
export function requireLocalSupabaseUrl(candidate: string): string {
  try {
    const url = new URL(candidate);
    const isExactOrigin =
      url.protocol === "http:" &&
      LOOPBACK_HOSTS.has(url.hostname) &&
      url.port === APPROVED_LOCAL_SUPABASE_PORT &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "";

    if (!isExactOrigin) throw new Error(REFUSAL_MESSAGE);
    return url.origin;
  } catch (error) {
    if (error instanceof Error && error.message === REFUSAL_MESSAGE) {
      throw error;
    }
    throw new Error(REFUSAL_MESSAGE, { cause: error });
  }
}
