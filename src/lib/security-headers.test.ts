import { describe, expect, test } from "bun:test";

import { buildContentSecurityPolicy } from "./security-headers";

describe("security headers", () => {
  test("allows local Supabase only when the configured Supabase URL is loopback", () => {
    const policy = buildContentSecurityPolicy({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    });

    expect(policy).toContain("http://127.0.0.1:54321 ws://127.0.0.1:54321");
  });

  test("does not widen production CSP for hosted Supabase projects", () => {
    const policy = buildContentSecurityPolicy({
      VITE_SUPABASE_URL: "https://example.supabase.co",
    });

    expect(policy).toContain("https://*.supabase.co");
    expect(policy).not.toContain("https://example.supabase.co");
  });

  test("allows Vercel preview toolbar sources only in preview deployments", () => {
    expect(buildContentSecurityPolicy({ VERCEL_ENV: "preview" })).toContain(
      "https://vercel.live",
    );
    expect(
      buildContentSecurityPolicy({ VERCEL_ENV: "production" }),
    ).not.toContain("https://vercel.live");
  });
});
