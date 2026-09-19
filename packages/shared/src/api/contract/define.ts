/**
 * Typed API contract core (T-7.1, docs/audit/00-AUDIT-AND-PLAN.md).
 *
 * One `EndpointDef` per HTTP route, declared once in `contract/<domain>.ts`
 * and consumed from three places:
 *   - server: `middleware/contract.js` validates params/query/body with the
 *     same zod schemas (and, outside production, the response too);
 *   - clients: `callEndpoint(client, def, input)` builds the path, validates
 *     the input and parses the response — no string paths in client code;
 *   - tests: `server/test/contract/inventory.test.js` walks the live Express
 *     router and fails when a mounted route has no contract entry (the
 *     "route list is generated from code" DoD).
 *
 * Naming decision (T-7.1 "единый naming"): paths and field names are kept
 * EXACTLY as the server has them today (kebab-case paths with the handful of
 * legacy snake_case ones like /api/unlink_strava, snake_case DB fields in
 * responses). Renames are deferred until LEGACY_MOBILE_COMPAT is gone — the
 * App Store build depends on today's shapes, and a rename now would need a
 * second compatibility layer for no user-visible gain.
 */
import { z, type ZodTypeAny } from 'zod';
import type { ApiClient, RequestOptions } from '../client.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointDef<
  TParams extends ZodTypeAny = ZodTypeAny,
  TQuery extends ZodTypeAny = ZodTypeAny,
  TBody extends ZodTypeAny = ZodTypeAny,
  TResponse extends ZodTypeAny = ZodTypeAny,
> {
  method: HttpMethod;
  /** Express-style path with `:param` segments, always starting with `/api` (or `/` for non-API pages). */
  path: string;
  /** Route params (`:id`) — `z.coerce.number()` for numeric ids; omitted when the path has none. */
  params?: TParams;
  /** Query string. Omitted = the route reads no query. */
  query?: TQuery;
  /** JSON body. Omitted = no body. */
  body?: TBody;
  /** JSON response. `z.void()`-ish endpoints (204) use `z.undefined()`. */
  response: TResponse;
  /** True when the route needs a session JWT (the vast majority). Informational — used by the inventory test. */
  auth?: boolean;
  /** Admin-only route (`requireAdmin`). */
  admin?: boolean;
  /** Free-text note for the generated route list. */
  summary?: string;
  /** Multipart upload (client uses `client.upload`) — body schema then describes the fields. */
  multipart?: boolean;
  /** Server-Sent Events — clients never call this through `callEndpoint`. */
  sse?: boolean;
}

/** Identity helper that keeps the literal schema types (so `z.infer` works downstream). */
export function defineEndpoint<
  TParams extends ZodTypeAny = z.ZodUndefined,
  TQuery extends ZodTypeAny = z.ZodUndefined,
  TBody extends ZodTypeAny = z.ZodUndefined,
  TResponse extends ZodTypeAny = z.ZodUnknown,
>(def: EndpointDef<TParams, TQuery, TBody, TResponse>): EndpointDef<TParams, TQuery, TBody, TResponse> {
  if (!def.path.startsWith('/')) throw new Error(`Endpoint path must start with "/": ${def.path}`);
  return def;
}

type InferOrUndefined<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

export type EndpointParams<D> = D extends EndpointDef<infer P, any, any, any> ? InferOrUndefined<P> : never;
export type EndpointQuery<D> = D extends EndpointDef<any, infer Q, any, any> ? InferOrUndefined<Q> : never;
export type EndpointBody<D> = D extends EndpointDef<any, any, infer B, any> ? InferOrUndefined<B> : never;
export type EndpointResponse<D> = D extends EndpointDef<any, any, any, infer R> ? z.infer<R> : never;

type OptionalIfUndefined<K extends string, T> = [T] extends [undefined] ? { [P in K]?: T } : { [P in K]: T };

/** Input for `callEndpoint`: only the parts the endpoint declares are required. */
export type EndpointInput<D> = OptionalIfUndefined<'params', EndpointParams<D>> &
  OptionalIfUndefined<'query', EndpointQuery<D>> &
  OptionalIfUndefined<'body', EndpointBody<D>>;

/**
 * Substitutes `:param` segments and appends a query string. Undefined/null
 * query values are dropped; arrays repeat the key. Values are URL-encoded.
 */
export function buildPath(
  path: string,
  params?: Record<string, unknown>,
  query?: Record<string, unknown>,
): string {
  let out = path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_m, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === null) {
      throw new Error(`Missing route param ":${name}" for ${path}`);
    }
    return encodeURIComponent(String(value));
  });
  if (query) {
    const parts: string[] = [];
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined || raw === null) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      for (const v of values) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
    if (parts.length) out += (out.includes('?') ? '&' : '?') + parts.join('&');
  }
  return out;
}

/**
 * An omitted query/body means "nothing to send". Most query/body schemas are
 * `z.object({...all optional})` without `.optional()` on the object itself,
 * so `parse(undefined)` would fail with "Required" and no request would ever
 * leave — that is how every `GET /api/activities` call in both clients broke
 * once they moved onto the contract. When the input is undefined, an
 * all-optional object schema is parsed as `{}`; a schema that really needs
 * fields still fails loudly.
 */
function parseOptionalObject(schema: ZodTypeAny, value: unknown): unknown {
  if (value !== undefined) return schema.parse(value);
  const asUndefined = schema.safeParse(undefined);
  if (asUndefined.success) return asUndefined.data;
  return schema.parse({});
}

export interface CallOptions<T> extends Omit<RequestOptions<T>, 'body' | 'schema'> {}

/**
 * Typed request through the shared `ApiClient`. Input is validated with the
 * endpoint's zod schemas before the request leaves (a client bug shows up as
 * a ZodError at the call site, not as a 400 from the server); the response
 * goes through `client`'s `validateResponses` switch like any other call.
 */
export async function callEndpoint<D extends EndpointDef<any, any, any, any>>(
  client: ApiClient,
  def: D,
  input?: EndpointInput<D>,
  opts: CallOptions<EndpointResponse<D>> = {},
): Promise<EndpointResponse<D>> {
  const inp = (input ?? {}) as { params?: unknown; query?: unknown; body?: unknown };
  const params = def.params ? (def.params.parse(inp.params) as Record<string, unknown>) : undefined;
  const query = def.query ? (parseOptionalObject(def.query, inp.query) as Record<string, unknown> | undefined) : undefined;
  // Multipart bodies are FormData: zod can't read its entries, and the
  // server (multer) parses the fields — so the body schema documents the
  // fields and is enforced server-side only; the FormData passes through.
  const body = def.multipart ? inp.body : def.body ? parseOptionalObject(def.body, inp.body) : undefined;
  const path = buildPath(def.path, params, query);
  const requestOpts = { ...opts, schema: def.response } as RequestOptions<EndpointResponse<D>>;

  switch (def.method) {
    case 'GET':
      return client.get(path, requestOpts);
    case 'DELETE':
      return client.del(path, body === undefined ? requestOpts : { ...requestOpts, body });
    case 'POST':
      if (def.multipart) return client.upload(path, body as FormData, requestOpts);
      return client.post(path, body, requestOpts);
    case 'PUT':
      return client.put(path, body, requestOpts);
    case 'PATCH':
      return client.patch(path, body, requestOpts);
  }
}

/** Flat list of every endpoint in a `{ name: def }` map — for inventories and docs. */
export function listEndpoints(
  registry: Record<string, Record<string, EndpointDef<any, any, any, any>>>,
): Array<{ domain: string; name: string; def: EndpointDef<any, any, any, any> }> {
  const out: Array<{ domain: string; name: string; def: EndpointDef<any, any, any, any> }> = [];
  for (const [domain, defs] of Object.entries(registry)) {
    for (const [name, def] of Object.entries(defs)) out.push({ domain, name, def });
  }
  return out;
}

/** `GET /api/activities/:id` — the key the server inventory compares routes by. */
export function endpointKey(def: { method: string; path: string }): string {
  return `${def.method.toUpperCase()} ${def.path}`;
}
