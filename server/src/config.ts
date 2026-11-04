// Environment configuration. Relative DB_PATH / UPLOAD_DIR resolve against the REPO ROOT
// (so `DB_PATH=server/data/test-listings.db` works from any cwd).
import { randomBytes } from 'node:crypto';
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
/** /api/dev (login-as, mailbox, clock, seed) is opt-in: ENABLE_DEV_API=1 (never in production). Tests always get it. */
const DEV_API = !IS_PROD && (IS_TEST || env.ENABLE_DEV_API === '1');
const DEFAULT_DEV_SECRET = 'dev-secret-change-me';
/** JWT secret: production requires ≥ 32 bytes; dev/test may use the well-known default only with the dev API opted in
 *  (or under NODE_ENV=test). Otherwise an unset secret becomes a random per-process secret (sessions end on restart). */
function resolveJwtSecret(): string {
  const s = env.JWT_SECRET ?? '';
  if (IS_PROD) return s;
  if (s && s !== DEFAULT_DEV_SECRET) return s;
  if (IS_TEST || DEV_API || env.ALLOW_DEV_SECRET === '1') return s || DEFAULT_DEV_SECRET;
  return randomBytes(32).toString('hex');
}

export const config = {
  nodeEnv: NODE_ENV,
  isProd: IS_PROD,
  port: Number(env.PORT ?? 4000),
  /** loopback outside production; set HOST=0.0.0.0 explicitly to expose a dev server on the network */
  host: env.HOST ?? (IS_PROD ? '0.0.0.0' : '127.0.0.1'),
  /** Express `trust proxy` hop count (req.ip resolution); 0 = no proxy in front */
  trustProxy: Number(env.TRUST_PROXY ?? 1),
  devApi: DEV_API,
  /** the mock Stripe webhook is mounted only outside production or with BILLING_MOCK=1 (staging demos) */
  billingMock: !IS_PROD || env.BILLING_MOCK === '1',
  dbPath: fromRoot(env.DB_PATH ?? 'server/data/app.db'),
  uploadDir: fromRoot(env.UPLOAD_DIR ?? 'server/uploads'),
  /** private (verification) files live outside the statically served dir */
  uploadPrivateDir: fromRoot(env.UPLOAD_PRIVATE_DIR ?? 'server/data/private-uploads'),
  jwtSecret: resolveJwtSecret(),
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

if (IS_PROD && (!config.jwtSecret || config.jwtSecret === DEFAULT_DEV_SECRET || Buffer.byteLength(config.jwtSecret) < 32)) {
  throw new Error('JWT_SECRET must be set to at least 32 random bytes in production');
}

export type Config = typeof config;
