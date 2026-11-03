// Entry point: opens the DB, builds the app, attaches the ws hub at /ws, starts jobs, handles graceful shutdown.
import http from 'node:http';
import { config } from './config';
import { logger } from './lib/logger';
import { openDb, closeDb } from './db';
import { ensureCampuses } from './lib/campuses';
import { ensureDefaultFlags } from './lib/flags';
import { createApp, MODULE_KEYS } from './app';
import { attach as attachHub, closeAll as closeHub, clientCount } from './realtime/hub';
import { loadModuleJobs, registerScaffoldJobs, startJobs, stopJobs } from './lib/jobs';

export async function startServer(opts: { port?: number; host?: string; jobs?: boolean } = {}): Promise<http.Server> {
  openDb(config.dbPath);
  ensureCampuses();
  ensureDefaultFlags();
  const app = createApp();
  const server = http.createServer(app);
  attachHub(server);
  registerScaffoldJobs();
  await loadModuleJobs([...MODULE_KEYS]);
  if (opts.jobs !== false) startJobs();
  const port = opts.port ?? config.port;
  const host = opts.host ?? config.host;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });
  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  logger.info({ port: actualPort, env: config.nodeEnv, db: config.dbPath }, `安窝 Anwo API listening on http://127.0.0.1:${actualPort}`);
  return server;
}

export async function stopServer(server: http.Server): Promise<void> {
  stopJobs();
  closeHub();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
}

const isMain = process.argv[1] && /[\\/]src[\\/]index\.ts$/.test(process.argv[1]);
if (isMain) {
  startServer()
    .then((server) => {
      let shuttingDown = false;
      const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info({ signal, wsClients: clientCount() }, 'shutting down');
        const timer = setTimeout(() => process.exit(1), 5000);
        timer.unref();
        stopServer(server).then(() => process.exit(0), () => process.exit(1));
      };
      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((e) => {
      logger.error({ err: e }, 'failed to start');
      process.exit(1);
    });
}
