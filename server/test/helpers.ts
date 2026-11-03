// Test harness: boots the real app on an ephemeral port against a temp SQLite file. Env must be set BEFORE importing src.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

export type Json = Record<string, unknown>;

export async function boot(name: string): Promise<{ base: string; stop: () => Promise<void>; dbPath: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `anwo-${name}-`));
  const dbPath = path.join(dir, 'test.db');
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.UPLOAD_PRIVATE_DIR = path.join(dir, 'private');
  process.env.JOBS_DISABLED = '1';
  process.env.RATE_LIMIT_DISABLED = '1';
  process.env.GEOCODE_OFFLINE = '1';
  process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
  process.env.JWT_SECRET = 'test-secret';
  const { startServer, stopServer } = await import('../src/index');
  const server: Server = await startServer({ port: 0, host: '127.0.0.1', jobs: false });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    base: `http://127.0.0.1:${port}`,
    dbPath,
    stop: async () => {
      await stopServer(server);
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Minimal cookie-jar fetch client that sets the CSRF header. */
export function client(base: string) {
  const jar = new Map<string, string>();
  async function call<T = Json>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; json: { ok: boolean; data?: T; error?: { code: string; message: string; fields?: Record<string, string>; data?: unknown } } }> {
    const headers: Record<string, string> = { 'X-Requested-With': 'fetch', ...extraHeaders };
    if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair!.indexOf('=');
      const k = pair!.slice(0, i);
      const v = pair!.slice(i + 1);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc) || v === '') jar.delete(k);
      else jar.set(k, v);
    }
    const text = await res.text();
    let json: { ok: boolean } = { ok: false };
    try {
      json = text ? JSON.parse(text) : { ok: res.ok };
    } catch {
      json = { ok: false };
    }
    return { status: res.status, json: json as never };
  }
  return {
    jar,
    get: <T = Json>(p: string, h?: Record<string, string>) => call<T>('GET', p, undefined, h),
    post: <T = Json>(p: string, b?: unknown, h?: Record<string, string>) => call<T>('POST', p, b, h),
    patch: <T = Json>(p: string, b?: unknown) => call<T>('PATCH', p, b),
    del: <T = Json>(p: string, b?: unknown) => call<T>('DELETE', p, b),
  };
}
