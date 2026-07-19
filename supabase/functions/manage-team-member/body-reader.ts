import { AdminHttpError } from "./contracts.ts";

export const MAX_BODY_BYTES = 16 * 1024;

function requestTooLarge(): AdminHttpError {
  return new AdminHttpError(
    413,
    "REQUEST_TOO_LARGE",
    "Body request terlalu besar.",
  );
}

function declaredLength(request: Request): number | null {
  const raw = request.headers.get("Content-Length");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export async function readBoundedRequestBody(
  request: Request,
): Promise<string> {
  if ((declaredLength(request) ?? 0) > MAX_BODY_BYTES) {
    throw requestTooLarge();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let bodyText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel("REQUEST_TOO_LARGE");
        throw requestTooLarge();
      }
      bodyText += decoder.decode(value, { stream: true });
    }
    bodyText += decoder.decode();
    return bodyText;
  } finally {
    reader.releaseLock();
  }
}
