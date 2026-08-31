import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { APICallError, generateText } from "ai";
import { canUseAiSummary } from "@/lib/ai/access";
import { buildSummaryPrompt } from "@/lib/ai/summary-prompt";
import type { SummaryFacts } from "@/lib/ai/summary-facts";

export type AiSummaryResult =
  | { ok: true; text: string }
  | { ok: false; message: string };

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
 * Independently re-checks the caller. The Dashboard already hides the card
 * for everyone else, but that is convenience — this is the boundary. Reads
 * the caller's own profile with the caller's own token, so RLS applies.
 */
async function authorize(accessToken: string): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await client.auth.getUser(
    accessToken,
  );
  if (userError || !userData.user) return false;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("email, status")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile) return false;
  if (profile.status !== "active") return false;

  return canUseAiSummary(profile.email);
}

export const generateAiSummary = createServerFn({ method: "POST" })
  .validator((data: { accessToken: string; facts: SummaryFacts }) => data)
  .handler(async ({ data }): Promise<AiSummaryResult> => {
    if (!data.accessToken) return DENIED;
    if (!(await authorize(data.accessToken))) return DENIED;

    const { system, prompt } = buildSummaryPrompt(data.facts);

    try {
      const result = await generateText({
        model: "anthropic/claude-sonnet-4.6",
        system,
        prompt,
        providerOptions: {
          gateway: {
            models: ["openai/gpt-5.4"],
            tags: ["feature:dashboard-summary"],
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
