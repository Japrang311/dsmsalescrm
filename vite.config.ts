import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  // Source-map upload only activates when a Sentry auth token is present
  // (e.g. in Vercel/CI env, never committed) — a no-op everywhere else.
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
  const sentryOrg = process.env.SENTRY_ORG;
  const sentryProject = process.env.SENTRY_PROJECT;
  const sentryUploadEnabled = Boolean(
    sentryAuthToken && sentryOrg && sentryProject,
  );

  return {
    define: envDefine,
    css: { transformer: "lightningcss" },
    // "hidden": still emits .map files for Sentry to read, but omits the
    // sourceMappingURL comment so a failed/misconfigured upload can't leave
    // maps silently linked from the publicly shipped JS.
    build: { sourcemap: sentryUploadEnabled ? "hidden" : false },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    plugins: [
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
      }),
      nitro({
        defaultPreset: "vercel",
        // Supabase lives in ap-northeast-1 (Tokyo). Keep the SSR function in the
        // same region (hnd1) so every query is a local hop, not a trans-Pacific one.
        vercel: { functions: { regions: ["hnd1"] } },
      }),
      react(),
      tailwindcss(),
      sentryUploadEnabled &&
        sentryVitePlugin({
          authToken: sentryAuthToken,
          org: sentryOrg,
          project: sentryProject,
          release: {
            name: process.env.VERCEL_GIT_COMMIT_SHA,
          },
          sourcemaps: {
            filesToDeleteAfterUpload: ["**/*.js.map"],
          },
        }),
    ],
    server: {
      host: "::",
      port: 8080,
    },
  };
});
