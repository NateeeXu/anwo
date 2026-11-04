// SQLite access layer on node:sqlite (DatabaseSync). Everything is synchronous.
//
//   import { q, uid, now, tx, toCamel } from '../db';          (from server/src/modules/<key>)
//   const row = q.get<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
//   const rows = q.all<{ id: string }>('SELECT id FROM listings WHERE campus_id = :c', { c: campusId });
//   q.run('UPDATE users SET name = ? WHERE id = ?', [name, id]);   // -> { changes, lastInsertRowid }
//   q.tx(() => { ...several writes... });                          // BEGIN/COMMIT, nested = SAVEPOINT
//
// Params: positional array (?) or named object (:name / $name / @name). Booleans -> 0/1, undefined -> NULL,
// Date -> ISO, plain objects/arrays -> JSON string.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config';
import { logger } from '../lib/logger';
import { nowIso } from '../lib/time';
import { uid as makeUid } from '../lib/ids';
import { fuzz } from '../lib/fuzz';

export type SqlParam = string | number | null | boolean | undefined | Date | Buffer | Record<string, unknown> | unknown[];
export type SqlParams = SqlParam[] | Record<string, SqlParam>;
export type RunResult = { changes: number; lastInsertRowid: number | bigint };

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.join(here, 'schema.sql');
export const MIGRATIONS_DIR = path.join(here, 'migrations');

let _db: DatabaseSync | null = null;
let _path = '';
let txDepth = 0;

function bind(v: SqlParam): string | number | null | Buffer {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v as string | number;
}
function bindAll(params?: SqlParams): unknown[] {
  if (!params) return [];
  if (Array.isArray(params)) return params.map(bind);
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) o[k] = bind(v);
  return [o];
}

/** Opens (once) the database at DB_PATH, applies pragmas, schema.sql and migrations. */
export function openDb(dbPath: string = config.dbPath): DatabaseSync {
  if (_db && _path === dbPath) return _db;
  if (_db) closeDb();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  // anwo_fuzz(id, lat, lng, which): the public (fuzzed) coordinate of a hidden address — see lib/fuzz.ts
  db.function('anwo_fuzz', { deterministic: true }, (id, lat, lng, which) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    const p = fuzz(String(id), lat, lng);
    return Number(which) === 1 ? p.lng : p.lat;
  });
  _db = db;
  _path = dbPath;
  applySchema(db);
  applyMigrations(db);
  logger.debug({ dbPath }, 'db opened');
  return db;
}

export function getDb(): DatabaseSync {
  return _db ?? openDb();
}

export function closeDb(): void {
  if (_db) {
    try {
      _db.close();
    } catch (e) {
      logger.warn({ err: e }, 'db close failed');
    }
  }
  _db = null;
  _path = '';
  txDepth = 0;
}

export function dbPath(): string {
  return _path || config.dbPath;
}

function applySchema(db: DatabaseSync): void {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(sql); // idempotent: every statement is CREATE ... IF NOT EXISTS
}

/** Runs server/src/db/migrations/*.sql in filename order; each file is recorded in schema_migrations and never re-run. */
export function applyMigrations(db: DatabaseSync = getDb()): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const ran: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(f, nowIso());
      db.exec('COMMIT');
      ran.push(f);
      logger.info({ migration: f }, 'migration applied');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return ran;
}

export const q = {
  all<T = Record<string, unknown>>(sql: string, params?: SqlParams): T[] {
    return getDb().prepare(sql).all(...(bindAll(params) as never[])) as T[];
  },
  get<T = Record<string, unknown>>(sql: string, params?: SqlParams): T | undefined {
    return getDb().prepare(sql).get(...(bindAll(params) as never[])) as T | undefined;
  },
  run(sql: string, params?: SqlParams): RunResult {
    return getDb().prepare(sql).run(...(bindAll(params) as never[])) as RunResult;
  },
  exec(sql: string): void {
    getDb().exec(sql);
  },
  /** Scalar convenience: first column of first row. */
  scalar<T = number>(sql: string, params?: SqlParams): T | undefined {
    const row = q.get<Record<string, T>>(sql, params);
    if (!row) return undefined;
    const k = Object.keys(row)[0];
    return k === undefined ? undefined : row[k];
  },
  count(sql: string, params?: SqlParams): number {
    return Number(q.scalar<number>(sql, params) ?? 0);
  },
  /** Runs fn inside a transaction (SAVEPOINT when nested). Rethrows after rollback. */
  tx<T>(fn: () => T): T {
    const db = getDb();
    const name = `sp${txDepth}`;
    if (txDepth === 0) db.exec('BEGIN IMMEDIATE');
    else db.exec(`SAVEPOINT ${name}`);
    txDepth++;
    try {
      const out = fn();
      txDepth--;
      if (txDepth === 0) db.exec('COMMIT');
      else db.exec(`RELEASE ${name}`);
      return out;
    } catch (e) {
      txDepth--;
      if (txDepth === 0) db.exec('ROLLBACK');
      else db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  },
  /** INSERT helper: q.insert('users', { id, email, ... }) */
  insert(table: string, row: Record<string, SqlParam>): RunResult {
    const keys = Object.keys(row);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    return q.run(sql, keys.map((k) => row[k]));
  },
  /** UPDATE helper: q.update('users', { name }, 'id = ?', [id]) */
  update(table: string, set: Record<string, SqlParam>, where: string, whereParams: SqlParam[] = []): RunResult {
    const keys = Object.keys(set);
    if (keys.length === 0) return { changes: 0, lastInsertRowid: 0 };
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${where}`;
    return q.run(sql, [...keys.map((k) => set[k]), ...whereParams]);
  },
};
export const tx = q.tx;

/** Proxy that always points at the open connection — `db.prepare(...)` works like DatabaseSync. */
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_t, prop) {
    const real = getDb();
    const v = (real as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export const now = nowIso;
export const uid = makeUid;

// ---------------------------------------------------------------- row mapping
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}
export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}
/** DB row -> camelCase object; `*_json` columns are parsed and lose the suffix (price_cents stays priceCents). */
export function toCamel<T = Record<string, unknown>>(row: Record<string, unknown> | undefined | null): T {
  if (!row) return row as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('_json')) {
      const key = snakeToCamel(k.slice(0, -5));
      try {
        out[key] = typeof v === 'string' ? JSON.parse(v) : v;
      } catch {
        out[key] = v;
      }
    } else {
      out[snakeToCamel(k)] = v;
    }
  }
  return out as T;
}
export const bool = (v: unknown): boolean => v === 1 || v === true || v === '1';
export const parseJson = <T = unknown>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string') return (v as T) ?? fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};
/** Builds `(?, ?, ?)` for IN clauses. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}
export function tableExists(name: string): boolean {
  return !!q.get("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]);
}
export function columnExists(table: string, column: string): boolean {
  return q.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);
}
