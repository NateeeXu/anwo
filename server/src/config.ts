// Environment configuration. Relative DB_PATH / UPLOAD_DIR resolve against the REPO ROOT
// (so `DB_PATH=server/data/test-listings.db` works from any cwd).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // server/src
export const SERVER_ROOT = path.resolve(here, '..'); // server/
export const REPO_ROOT = path.resolve(here, '../..'); // repo root

function fromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

const env = process.env;
export const NODE_ENV = env.NODE_ENV ?? 'development';
export const IS_PROD = NODE_ENV === 'production';
export const IS_TEST = NODE_ENV === 'test';

export const config = {
  nodeEnv: NODE_ENV,
  isProd: IS_PROD,
  port: Number(env.PORT ?? 4000),
  host: env.HOST ?? '0.0.0.0',
  dbPath: fromRoot(env.DB_PATH ?? 'server/data/app.db'),
  uploadDir: fromRoot(env.UPLOAD_DIR ?? 'server/uploads'),
  /** private (verification) files live outside the statically served dir */
  uploadPrivateDir: fromRoot(env.UPLOAD_PRIVATE_DIR ?? 'server/data/private-uploads'),
  jwtSecret: env.JWT_SECRET ?? (IS_PROD ? '' : 'dev-secret-change-me'),
  webOrigins: (env.WEB_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()).filter(Boolean),
  nominatimUrl: env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org',
  geocodeOffline: env.GEOCODE_OFFLINE === '1' || env.GEOCODE_OFFLINE === 'true',
  logLevel: env.LOG_LEVEL ?? (IS_TEST ? 'warn' : 'info'),
  rateLimitDisabled: env.RATE_LIMIT_DISABLED === '1',
  jobsDisabled: env.JOBS_DISABLED === '1',
  webDist: fromRoot('web/dist'),
  appVersion: env.APP_VERSION ?? '0.1.0',
  sessionDays: 30,
  limits: {
    uploadMaxBytesImage: 10 * 1024 * 1024,
    uploadMaxBytesDoc: 20 * 1024 * 1024,
    pageSizeMax: 50,
    listingQuotaFree: 2,
  },
};

if (IS_PROD && !config.jwtSecret) {
  throw new Error('JWT_SECRET must be set in production');
}

export type Config = typeof config;
