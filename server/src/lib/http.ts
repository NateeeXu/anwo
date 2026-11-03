// Response + validation helpers.
//
//   ok(res, dto);                               // { ok: true, data: dto }
//   paginated(res, { items, total, page, pageSize }, { scope });   // adds siblings to data
//   const body = parse(ListingInput, req.body);  // throws ApiError VALIDATION with fields
//   const qs = parseQuery(req, ScopeQuery.merge(PaginationQuery));
import type { Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { ApiError, zodFields } from './errors';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}
export function created<T>(res: Response, data: T): void {
  ok(res, data, 201);
}
export function noContent(res: Response): void {
  res.status(204).end();
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
export function paginated<T, E extends Record<string, unknown> = Record<string, never>>(
  res: Response,
  page: Page<T>,
  extra?: E,
): void {
  res.status(200).json({ ok: true, data: { ...page, ...(extra ?? {}) } });
}

/** Validate `input` with `schema`; throws ApiError('VALIDATION') with `fields` on failure. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new ApiError('VALIDATION', 'Invalid input', { fields: zodFields(r.error) });
  return r.data;
}
export function parseBody<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  return parse(schema, req.body ?? {});
}
export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  return parse(schema, req.query ?? {});
}
export function parseParams<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  return parse(schema, req.params ?? {});
}

/** OFFSET/LIMIT from a parsed PaginationQuery. */
export function pageWindow(p: { page: number; pageSize: number }): { limit: number; offset: number } {
  return { limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
}

export function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  const first = Array.isArray(xf) ? xf[0] : xf?.split(',')[0];
  return (first?.trim() || req.ip || req.socket.remoteAddress || '0.0.0.0').replace(/^::ffff:/, '');
}

export function wantsJson(req: Request): boolean {
  return req.path.startsWith('/api/') || (req.headers.accept ?? '').includes('application/json');
}
