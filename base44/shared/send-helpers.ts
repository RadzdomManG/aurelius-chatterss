// Fanvue send-with-retry helper extracted from ai-processor-v2.
// Handles exponential backoff for rate-limit (429) and server-error (5xx)
// responses, up to maxRetries attempts. Imported by the AI processor and
// any other send path that needs resilient delivery.

import { sendFanvueMessage } from "./fanvue-api.ts";

export async function sendWithRetry(
  accessToken: string,
  fanUuid: string,
  reply: string,
  ppvCents: number | null,
  media: any,
  maxRetries = 3
): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendFanvueMessage(accessToken, fanUuid, reply, ppvCents, media);
      return result;
    } catch (err: any) {
      lastErr = err;
      const msg = err.message || "";
      const isRateLimit = /429|rate.?limit|too many/i.test(msg);
      const isServerError = /5\d\d/.test(msg);
      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// Generate a client-side idempotency key for a logical send. Stored on the
// Message record so a retried send (where Fanvue returns no UUID) can be
// deduped — if a Message with this key already exists, the send already
// landed and we must not send again.
export function generateIdempotencyKey(): string {
  return `idem_${Date.now()}_${crypto.randomUUID()}`;
}