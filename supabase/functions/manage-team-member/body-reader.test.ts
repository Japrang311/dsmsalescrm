import { describe, expect, test } from "bun:test";
import { toHttpError } from "./contracts.ts";
import { MAX_BODY_BYTES, readBoundedRequestBody } from "./body-reader.ts";

describe("manage-team-member request adapter body limit", () => {
  test("rejects an oversized declared Content-Length without pulling the body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    const request = new Request("http://localhost/manage-team-member", {
      method: "POST",
      headers: { "Content-Length": String(MAX_BODY_BYTES + 1) },
      body,
    });

    const error = await readBoundedRequestBody(request).catch(toHttpError);

    expect(error).toMatchObject({
      status: 413,
      body: { code: "REQUEST_TOO_LARGE" },
    });
    // Bun may pre-fill one stream slot when Request is constructed, but the
    // adapter must reject before acquiring/consuming the body reader.
    expect(pulls).toBeLessThanOrEqual(1);
    expect(request.bodyUsed).toBe(false);
  });

  test("cancels a chunked stream as soon as accumulated bytes exceed 16 KiB", async () => {
    const chunk = new Uint8Array(9 * 1024).fill(97);
    let pulls = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("http://localhost/manage-team-member", {
      method: "POST",
      body,
    });

    const error = await readBoundedRequestBody(request).catch(toHttpError);

    expect(error).toMatchObject({
      status: 413,
      body: { code: "REQUEST_TOO_LARGE" },
    });
    expect(pulls).toBe(2);
    expect(cancelled).toBe(true);
  });
});
