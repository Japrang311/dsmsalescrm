import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { APICallError, generateText } from "ai";
import { canUseAiSummary } from "@/lib/ai/access";
import { buildSummaryPrompt } from "@/lib/ai/summary-prompt";
import type { SummaryAudience, SummaryFacts } from "@/lib/ai/summary-facts";

export type AiSummaryResult =
  { ok: true; text: string } | { ok: false; message: string };

const DENIED: AiSummaryResult = {
  ok: false,
  message: "Fitur ini tidak tersedia untuk akun Anda.",
};

export function mapGatewayError(statusCode: number | undefined): string {
  switch (statusCode) {
    case 402:
      return "Kuota AI bulan ini sudah habis.";
    case 429:
      return "Terlalu sering. Coba lagi sebentar.";
    case 503:
      return "Layanan AI sedang bermasalah. Coba lagi nanti.";
    default:
      return "Ringkasan gagal dibuat. Coba lagi nanti.";
  }
}

/**
 * The minimal shape `authorize` needs from a Supabase client. Narrowed so a
 * fake client can be injected in tests without constructing a real one.
 */
type AuthClient = {
  auth: {
    getUser: (accessToken: string) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        single: () => Promise<{
          data: {
            email: string | null;
            account_status: string;
            role: string | null;
          } | null;
          error: unknown;
        }>;
      };
    };
  };
};

function defaultAuthClient(accessToken: string): AuthClient | null {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as AuthClient;
}

/**
 * Independently re-checks the caller. The Dashboard already hides the card
 * for everyone else, but that is convenience — this is the boundary. Reads
 * the caller's own profile with the caller's own token, so RLS applies.
 *
 * Returns the authenticated user's id AND the role read from the database on
 * success, or `null` on ANY failure —
 * a returned error, a missing/inactive profile, an email off the allow list,
 * a role other than `manager`/`executive`,
 * or an unexpected thrown exception (network blip, DNS failure, malformed
 * response). The whole body runs inside try/catch so a throw here can never
 * escape as an unhandled error; it is indistinguishable from any other
 * denial to the caller.
 *
 * `buildClient` defaults to a real Supabase client and is only ever
 * overridden in tests, to exercise the throw path without a live backend.
 */
export type AuthorizedCaller = { userId: string; role: SummaryAudience };

export async function authorize(
  accessToken: string,
  buildClient: (accessToken: string) => AuthClient | null = defaultAuthClient,
): Promise<AuthorizedCaller | null> {
  try {
    const client = buildClient(accessToken);
    if (!client) return null;

    const { data: userData, error: userError } =
      await client.auth.getUser(accessToken);
    if (userError || !userData.user) return null;

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("email, account_status, role")
      .eq("id", userData.user.id)
      .single();
    if (profileError || !profile) return null;
    if (profile.account_status !== "active") return null;
    if (!canUseAiSummary(profile.email)) return null;
    // The audience is derived here, from the database, and nowhere else.
    if (profile.role !== "manager" && profile.role !== "executive") return null;

    return { userId: userData.user.id, role: profile.role };
  } catch (error) {
    console.error("AI summary authorization failed", error);
    return null;
  }
}

/**
 * The posted `facts.audience` is attacker-controlled: the server function is a
 * plain POST endpoint, so any allow-listed caller can hand-build a body. The
 * audience is therefore overwritten with the role read from the database
 * before the prompt is built, which is what makes the executive strip in
 * `summary-prompt.ts` a genuinely independent second guard.
 */
export function factsForRole(
  facts: SummaryFacts,
  role: SummaryAudience,
): SummaryFacts {
  return { ...facts, audience: role };
}

export const generateAiSummary = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; facts: SummaryFacts }) => data)
  .handler(async ({ data }): Promise<AiSummaryResult> => {
    if (!data.accessToken) return DENIED;
    const caller = await authorize(data.accessToken);
    if (!caller) return DENIED;

    const { system, prompt } = buildSummaryPrompt(
      factsForRole(data.facts, caller.role),
    );

    try {
      const result = await generateText({
        model: "anthropic/claude-sonnet-4.6",
        system,
        prompt,
        providerOptions: {
          gateway: {
            models: ["openai/gpt-5.4"],
            tags: ["feature:dashboard-summary"],
            user: caller.userId,
          },
        },
      });
      return { ok: true, text: result.text.trim() };
    } catch (error) {
      if (APICallError.isInstance(error)) {
        return { ok: false, message: mapGatewayError(error.statusCode) };
      }
      console.error("AI summary failed", error);
      return { ok: false, message: mapGatewayError(undefined) };
    }
  });
