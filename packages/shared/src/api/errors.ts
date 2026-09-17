/**
 * Shared ApiError shape + error-body normalization (T-2.3,
 * docs/audit/layers/04-cross-layer.md §5.8, §6.1 row `api/client.ts`).
 *
 * Both existing clients (react-spa/src/utils/api.js, BikeLabApp/src/utils/api.ts)
 * threw an Error-like object with `{status, code, details}` built from whatever
 * shape the server's error body happened to be:
 *   - current: { error: string, code: string, details?: unknown }
 *   - legacy:  { error: true, message: string } (old server error paths)
 *   - plain text / empty body (proxies, network edge cases, non-JSON 5xx pages)
 * `normalizeErrorBody` collapses all of these into `{message, code}` so
 * `client.ts` doesn't need to special-case each shape at every call site.
 */

export class ApiError extends Error {
  status: number;
  code: string | null;
  details?: unknown;

  constructor(status: number, message: string, code: string | null = null, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && typeof (e as { status?: unknown }).status === 'number';
}

/**
 * Normalizes whatever the server (or an intermediary proxy) sent back for a
 * non-ok response into `{message, code}`. `body` is either:
 *   - a parsed JSON object (current `{error, code, details}` or legacy
 *     `{error: true, message}` shape),
 *   - a non-empty string (plain-text error body), or
 *   - `null`/`undefined`/`{}` (no usable body — e.g. empty 500, HTML error page).
 */
export function normalizeErrorBody(
  body: unknown,
  status: number,
): { message: string; code: string | null } {
  if (typeof body === 'string') {
    const trimmed = body.trim();
    return { message: trimmed || `HTTP ${status}`, code: null };
  }

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;

    // Current server shape: { error: string, code, details? }
    if (typeof b.error === 'string') {
      return {
        message: b.error,
        code: typeof b.code === 'string' ? b.code : null,
      };
    }

    // Legacy shape: { error: true, message: string }
    if (typeof b.message === 'string') {
      return {
        message: b.message,
        code: typeof b.code === 'string' ? b.code : null,
      };
    }
  }

  return { message: `HTTP ${status}`, code: null };
}
