// ApiError + envelope error handling — API.md §1.1 / §1.5.
//
//   throw new ApiError('NOT_FOUND');                         // 404 default status for the code
//   fail('TRUST_REQUIRED', 403, 'Verify your email first', { data: { required: 1, current: 0, nextStep: 'edu' } });
//   fail('VALIDATION', 400, 'Invalid input', { fields: { 'address.zip': 'Invalid zip' } });
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';
import { config } from '../config';

export const ERROR_STATUS: Record<string, number> = {
  VALIDATION: 400,
  BAD_REQUEST: 400,
  NOT_EDU_EMAIL: 400,
  CODE_INVALID: 400,
  CODE_EXPIRED: 400,
  CODE_ATTEMPTS: 400,
  PROMO_INVALID: 400,
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  PAYMENT_FAILED: 402,
  INSUFFICIENT_FUNDS: 402,
  FORBIDDEN: 403,
  TRUST_REQUIRED: 403,
  BANNED: 403,
  BLOCKED: 403,
  VERIFIED_ONLY: 403,
  FEATURE_DISABLED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  INVALID_STATE: 409,
  QUOTA_EXCEEDED: 409,
  UPLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
};
export type ErrorCode = keyof typeof ERROR_STATUS | (string & {});

const DEFAULT_MESSAGE: Record<string, string> = {
  VALIDATION: 'Invalid input',
  NOT_FOUND: 'Not found',
  UNAUTHORIZED: 'Sign in required',
  FORBIDDEN: 'Forbidden',
  INTERNAL: 'Internal error',
  RATE_LIMITED: 'Too many requests',
  CONFLICT: 'Conflict',
  INVALID_STATE: 'Invalid state transition',
  NOT_IMPLEMENTED: 'Not implemented',
};

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string>;
  data?: unknown;
  constructor(
    code: ErrorCode,
    message?: string,
    opts: { status?: number; fields?: Record<string, string>; data?: unknown } = {},
  ) {
    super(message ?? DEFAULT_MESSAGE[code] ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? ERROR_STATUS[code] ?? 500;
    this.fields = opts.fields;
    this.data = opts.data;
  }
  toJSON() {
    return {
      ok: false as const,
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.data !== undefined ? { data: this.data } : {}),
      },
    };
  }
}

/** Throws an ApiError. `status` may be omitted (default per code). */
export function fail(
  code: ErrorCode,
  status?: number,
  message?: string,
  extra: { fields?: Record<string, string>; data?: unknown } = {},
): never {
  throw new ApiError(code, message, { status, ...extra });
}
export const notFound = (what = 'Resource'): never => fail('NOT_FOUND', 404, `${what} not found`);
export const forbidden = (message = 'Forbidden'): never => fail('FORBIDDEN', 403, message);
export const invalidState = (from: string, to: string): never =>
  fail('INVALID_STATE', 409, `Cannot go from '${from}' to '${to}'`, { data: { from, to } });

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError || (typeof e === 'object' && e !== null && (e as ApiError).name === 'ApiError');
}

/** zod issues -> { 'path.to.field': message } */
export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Wraps an async route so rejections reach the error handler (Express 5 does this natively; kept for clarity/compat). */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    try {
      const r = fn(req as Req, res, next);
      if (r && typeof (r as Promise<unknown>).then === 'function') (r as Promise<unknown>).catch(next);
    } catch (e) {
      next(e);
    }
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (res.headersSent) return;
  let apiErr: ApiError;
  if (isApiError(err)) apiErr = err as ApiError;
  else if (err instanceof ZodError) apiErr = new ApiError('VALIDATION', 'Invalid input', { fields: zodFields(err) });
  else if (err instanceof SyntaxError && 'body' in (err as object)) apiErr = new ApiError('BAD_REQUEST', 'Malformed JSON body');
  else if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_FILE_SIZE')
    apiErr = new ApiError('UPLOAD_TOO_LARGE', 'File too large');
  else if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'LIMIT_UNEXPECTED_FILE')
    apiErr = new ApiError('BAD_REQUEST', 'Unexpected multipart field');
  else if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.too.large')
    apiErr = new ApiError('UPLOAD_TOO_LARGE', 'Body too large');
  else {
    const msg = (err as Error)?.message ?? String(err);
    if (/UNIQUE constraint failed/i.test(msg)) apiErr = new ApiError('CONFLICT', 'Already exists');
    else {
      logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
      apiErr = new ApiError('INTERNAL', config.isProd ? 'Internal error' : msg);
    }
  }
  if (apiErr.status >= 500) logger.error({ err: apiErr, path: req.path }, apiErr.message);
  res.status(apiErr.status).json(apiErr.toJSON());
};
