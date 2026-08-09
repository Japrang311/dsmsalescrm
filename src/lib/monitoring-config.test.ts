import { describe, expect, test } from "bun:test";

import { browserMonitoringOptions } from "./browser-monitoring";
import { serverMonitoringOptions } from "./server-monitoring";

describe("monitoring config", () => {
  test("browser monitoring is disabled without a DSN", () => {
    expect(
      browserMonitoringOptions({
        VITE_SENTRY_ENVIRONMENT: "production",
        VITE_SENTRY_RELEASE: "abc123",
      }),
    ).toBeUndefined();
  });

  test("browser monitoring includes environment and release without exposing secrets", () => {
    expect(
      browserMonitoringOptions({
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        VITE_SENTRY_ENVIRONMENT: "production",
        VITE_SENTRY_RELEASE: "release-1",
      }),
    ).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "production",
      release: "release-1",
    });
  });

  test("browser monitoring falls back to Vercel commit SHA for release", () => {
    expect(
      browserMonitoringOptions({
        VITE_SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        VITE_VERCEL_GIT_COMMIT_SHA: "commit-sha",
      })?.release,
    ).toBe("commit-sha");
  });

  test("server monitoring prefers private DSN and explicit release", () => {
    expect(
      serverMonitoringOptions({
        SENTRY_DSN: "https://server@example.ingest.sentry.io/1",
        VITE_SENTRY_DSN: "https://browser@example.ingest.sentry.io/1",
        SENTRY_ENVIRONMENT: "production",
        SENTRY_RELEASE: "server-release",
        VERCEL_GIT_COMMIT_SHA: "fallback-sha",
      }),
    ).toEqual({
      dsn: "https://server@example.ingest.sentry.io/1",
      environment: "production",
      release: "server-release",
    });
  });

  test("server monitoring falls back to deployment environment and commit SHA", () => {
    expect(
      serverMonitoringOptions({
        VITE_SENTRY_DSN: "https://shared@example.ingest.sentry.io/1",
        VERCEL_ENV: "preview",
        NODE_ENV: "production",
        VERCEL_GIT_COMMIT_SHA: "commit-sha",
      }),
    ).toEqual({
      dsn: "https://shared@example.ingest.sentry.io/1",
      environment: "preview",
      release: "commit-sha",
    });
  });
});
