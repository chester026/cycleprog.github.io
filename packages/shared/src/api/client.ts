/**
 * Shared, typed API client (T-2.3, docs/audit/layers/04-cross-layer.md §5.7,
 * §5.8, §6.1 row `api/client.ts`). Replaces the two hand-rolled `apiFetch`
 * implementations (`react-spa/src/utils/api.js`, `BikeLabApp/src/utils/api.ts`)
 * with one core that both platforms adapt via dependency injection
 * (`getToken`, `onUnauthorized`, `fetch`) — see the adapters at those paths.
 *
 * Not using `AbortSignal.timeout()` / `AbortSignal.any()` on purpose: React
 * Native's JS engine (Hermes) does not reliably provide either, so the
 * timeout-vs-caller-signal merge is done by hand with a single
 * `AbortController` that both a timer and the caller's signal can trip.
 */
import type { ZodType } from 'zod';
import { ApiError, normalizeErrorBody } from './errors.js';

export type TokenGetter = () => Promise<string | null> | string | null;

export interface CreateApiClientOptions {
  /** Prepended to any `path` that doesn't already start with `http`. */
  baseUrl: string;
  /** May return synchronously or asynchronously; `null`/`''` omits the header. */
  getToken: TokenGetter;
  /** Called (and awaited) exactly once per 401 response, before the ApiError is thrown. */
  onUnauthorized?: (err: ApiError) => void | Promise<void>;
  /** Injectable for tests / non-global fetch environments. Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** Default per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Merged under caller/per-request headers. */
  defaultHeaders?: Record<string, string>;
  /**
   * Whether `schema` on a request is actually enforced (`schema.parse`) or is
   * only used for the TypeScript return type (`as T`). Consumers should pass
   * their own dev-flag here (`import.meta.env.DEV` / `__DEV__`) — there is no
   * safe default that works in both a bundler and a server context, so this
   * is required.
   */
  validateResponses: boolean;
}

export interface RequestOptions<T> extends Omit<RequestInit, 'signal' | 'body'> {
  /** When set and `validateResponses` is true, the parsed JSON is run through `schema.parse`. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
  /** A plain object/array is JSON-encoded automatically; FormData/string/etc pass through untouched. */
  body?: unknown;
  /** Overrides the client-level default for this one request. */
  timeoutMs?: number;
  /**
   * Set to `false` to skip JSON parsing entirely and resolve with the raw
   * response text. Defaults to `true`.
   */
  parseJson?: boolean;
}

export interface ApiClient {
  request<T = unknown>(path: string, init?: RequestOptions<T>): Promise<T>;
  get<T = unknown>(path: string, opts?: RequestOptions<T>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions<T>): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions<T>): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions<T>): Promise<T>;
  del<T = unknown>(path: string, opts?: RequestOptions<T>): Promise<T>;
  upload<T = unknown>(path: string, formData: FormData, opts?: RequestOptions<T>): Promise<T>;
}

function isPlainJsonBody(body: unknown): body is Record<string, unknown> | unknown[] {
  if (body === null || typeof body !== 'object') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(body as ArrayBufferView)) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  return true;
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const {
    baseUrl,
    getToken,
    onUnauthorized,
    fetch: injectedFetch,
    timeoutMs: clientTimeoutMs = 15000,
    defaultHeaders = {},
    validateResponses,
  } = options;

  const fetchImpl = injectedFetch ?? fetch;

  async function request<T = unknown>(path: string, init: RequestOptions<T> = {}): Promise<T> {
    const { schema, signal: callerSignal, timeoutMs, parseJson = true, ...rest } = init;
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

    const headers: Record<string, string> = {
      ...defaultHeaders,
      ...(rest.headers as Record<string, string> | undefined),
    };

    const tokenResult = getToken();
    const token = tokenResult instanceof Promise ? await tokenResult : tokenResult;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let body = rest.body;
    if (isPlainJsonBody(body)) {
      body = JSON.stringify(body);
      if (!headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    // Manual timeout + caller-signal merge (see file header for why).
    const controller = new AbortController();
    const effectiveTimeoutMs = timeoutMs ?? clientTimeoutMs;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, effectiveTimeoutMs);

    let onCallerAbort: (() => void) | undefined;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        onCallerAbort = () => controller.abort();
        callerSignal.addEventListener('abort', onCallerAbort);
      }
    }

    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...rest,
        // RN's TS lib has no global BodyInit — keep the cast lib-agnostic.
        body: body as RequestInit['body'],
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (isAbort && timedOut) {
        throw new ApiError(0, `Request timed out after ${effectiveTimeoutMs}ms`, 'TIMEOUT');
      }
      if (isAbort) {
        // Caller's own AbortSignal fired — surface the original abort as-is
        // rather than mislabeling it a network error.
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network request failed';
      throw new ApiError(0, message, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      if (callerSignal && onCallerAbort) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    }

    if (!response.ok) {
      const errorBody = await parseBodyLoosely(response);
      const { message, code } = normalizeErrorBody(errorBody, response.status);
      const details =
        errorBody && typeof errorBody === 'object' ? (errorBody as Record<string, unknown>).details : undefined;
      const err = new ApiError(response.status, message, code, details);

      if (response.status === 401 && onUnauthorized) {
        await onUnauthorized(err);
      }

      throw err;
    }

    if (!parseJson) {
      return (await response.text()) as unknown as T;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (text.length === 0) {
      return undefined as T;
    }

    const data: unknown = JSON.parse(text);

    if (schema) {
      if (!validateResponses) {
        return data as T;
      }
      const result = schema.safeParse(data);
      if (!result.success) {
        throw new ApiError(
          response.status,
          'Response did not match expected schema',
          'RESPONSE_SCHEMA_MISMATCH',
          result.error.issues,
        );
      }
      return result.data;
    }

    return data as T;
  }

  async function parseBodyLoosely(response: Response): Promise<unknown> {
    const text = await response.text().catch(() => '');
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    request,
    get: (path, opts) => request(path, { ...opts, method: 'GET' }),
    post: (path, requestBody, opts) => request(path, { ...opts, method: 'POST', body: requestBody }),
    put: (path, requestBody, opts) => request(path, { ...opts, method: 'PUT', body: requestBody }),
    patch: (path, requestBody, opts) => request(path, { ...opts, method: 'PATCH', body: requestBody }),
    del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
    upload: (path, formData, opts) => {
      // Never JSON-encode or set a Content-Type for FormData — the runtime
      // fetch sets the correct multipart boundary itself. Auth header is
      // still added via the normal token flow above.
      return request(path, { method: 'POST', ...opts, body: formData });
    },
  };
}
