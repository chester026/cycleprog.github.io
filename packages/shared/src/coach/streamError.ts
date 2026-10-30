/**
 * Classifies a failed /api/coach/chat response body so the client can show a
 * rider-safe message. A non-2xx response (aiBudget.js's requireAiBudget,
 * auth, validation) is a plain JSON error envelope (`{error, code}`,
 * server/lib/apiError.js) — never the SSE stream itself. Formatting and
 * translation stay with the client.
 */

export type StreamError =
  /** 429 AI_BUDGET_EXCEEDED — the client renders "limit reached, resets at <local time>". */
  | { kind: 'budget'; resetAt: string }
  /** Text safe to show as-is: a JSON envelope's `error`, or a non-JSON body. */
  | { kind: 'message'; text: string }
  /** Nothing usable (empty body, or JSON with neither a known code nor `error`). */
  | { kind: 'generic' };

export const AI_BUDGET_EXCEEDED_CODE = 'AI_BUDGET_EXCEEDED';

export function classifyStreamError(rawBody: string | undefined | null): StreamError {
  if (!rawBody) return { kind: 'generic' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { kind: 'message', text: rawBody };
  }
  if (!parsed || typeof parsed !== 'object') return { kind: 'message', text: rawBody };
  const body = parsed as { code?: unknown; error?: unknown; resetAt?: unknown };
  if (body.code === AI_BUDGET_EXCEEDED_CODE && typeof body.resetAt === 'string') {
    return { kind: 'budget', resetAt: body.resetAt };
  }
  if (typeof body.error === 'string') return { kind: 'message', text: body.error };
  return { kind: 'generic' };
}
