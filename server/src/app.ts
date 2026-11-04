// Express app assembly: middleware, static uploads, API routers, 404 + error envelope, production SPA.
import express, { type Request, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './lib/errors';
import { ANON_COOKIE, cookieOf, csrf, optionalAuth } from './lib/auth';
import { globalRateLimit } from './lib/ratelimit';
import { uid } from './lib/ids';
import './lib/notify'; // registers the ws `notification.read` handler

import authRoutes from './modules/auth/routes';
import usersRoutes from './modules/users/routes';
import campusesRoutes from './modules/campuses/routes';
import uploadsRoutes from './modules/uploads/routes';
import notificationsRoutes from './modules/notifications/routes';
import searchRoutes from './modules/search/routes';
import metaRoutes from './modules/meta/routes';
import eventsRoutes from './modules/events/routes';
import devRoutes from './modules/dev/routes';

import listingsRoutes from './modules/listings/routes';
import wantedRoutes from './modules/wanted/routes';
import chatRoutes from './modules/chat/routes';
import verifyRoutes from './modules/verify/routes';
import mapRoutes from './modules/map/routes';
import shuttleRoutes from './modules/shuttle/routes';
import marketRoutes from './modules/market/routes';
import buddyRoutes from './modules/buddy/routes';
import billingRoutes from './modules/billing/routes';
import adminRoutes from './modules/admin/routes';

export const MODULE_KEYS = ['listings', 'wanted', 'chat', 'verify', 'map', 'shuttle', 'market', 'buddy', 'billing', 'admin'] as const;

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (config.webOrigins.includes(origin)) return true;
  return !config.isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

const cors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept-Language, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};

/** pino-http style request logging (one line per response). */
const requestLog: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  req.reqId = uid().slice(0, 8);
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    if (req.path.startsWith('/uploads/') && res.statusCode < 400) return; // static noise
    logger[level]({ reqId: req.reqId, method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(ms * 10) / 10, user: req.user?.id ?? null }, `${req.method} ${req.originalUrl} ${res.statusCode}`);
  });
  next();
};

/** /api/dev answers loopback callers only (the Vite proxy and local scripts), never the network. */
const loopbackOnly: RequestHandler = (req, res, next) => {
  const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  if (ip === '127.0.0.1' || ip === '::1') return next();
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } });
};

/** Baseline security headers (API, uploads, SPA). The SPA CSP is only set where Express serves the built app. */
const securityHeaders: RequestHandler = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  if (req.path.startsWith('/uploads/')) res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  else if (req.path.startsWith('/api/')) res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  else res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  next();
};

/** Anonymous session cookie `aid` (analytics). */
const anonSession: RequestHandler = (req, res, next) => {
  let aid = cookieOf(req, ANON_COOKIE);
  if (!aid) {
    aid = uid();
    res.cookie(ANON_COOKIE, aid, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 86_400_000, secure: config.isProd });
  }
  req.sessionId = aid;
  next();
};

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('etag', false);

  app.use(securityHeaders);
  app.use(cors);
  app.use(cookieParser());
  app.use(requestLog);
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }));
  app.use('/api/events', express.text({ limit: '64kb', type: ['text/plain', 'text/*'] })); // navigator.sendBeacon
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(anonSession);

  // public uploads (private files are streamed by /api/uploads/:id/file)
  fs.mkdirSync(config.uploadDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadDir, { maxAge: '1d', immutable: false, index: false, dotfiles: 'ignore', fallthrough: true }));

  // API
  app.use('/api', optionalAuth, csrf, globalRateLimit);
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/campuses', campusesRoutes);
  app.use('/api/uploads', uploadsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/meta', metaRoutes);
  app.use('/api/events', eventsRoutes);
  if (config.devApi) app.use('/api/dev', loopbackOnly, devRoutes);

  app.use('/api/listings', listingsRoutes);
  app.use('/api/wanted', wantedRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/verify', verifyRoutes);
  app.use('/api/map', mapRoutes);
  app.use('/api/shuttle', shuttleRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/buddy', buddyRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', notFoundHandler);

  // production: serve the built SPA with history fallback
  if (config.isProd || process.env.SERVE_WEB === '1') {
    const dist = config.webDist;
    const index = path.join(dist, 'index.html');
    if (fs.existsSync(index)) {
      app.use(express.static(dist, { maxAge: '1h', index: false }));
      app.get(/.*/, (req: Request, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path === '/ws') return next();
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        res.sendFile(index);
      });
      logger.info({ dist }, 'serving web/dist');
    } else {
      logger.warn({ dist }, 'web/dist not found — run `npm run build` first');
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
