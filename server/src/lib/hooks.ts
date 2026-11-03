// Tiny typed event bus so modules can react to scaffold events without the scaffold importing modules.
//
//   import { hooks } from '../../lib/hooks';
//   hooks.on('user.trustChanged', ({ userId, from, to }) => { ... });   // e.g. billing qualifies referrals at to >= 1
//   hooks.on('user.registered', ({ userId, referralCode }) => { ... });
import { EventEmitter } from 'node:events';
import { logger } from './logger';

export type HookEvents = {
  'user.registered': { userId: string; email: string; campusId: string | null; referredBy: string | null };
  'user.trustChanged': { userId: string; from: number; to: number; reason: string };
  'user.banned': { userId: string; banned: boolean; reason: string | null };
  'user.campusChanged': { userId: string; from: string | null; to: string | null };
  'flags.changed': { key: string };
  'notification.created': { userId: string; kind: string; id: string };
};
type Handler<K extends keyof HookEvents> = (payload: HookEvents[K]) => void | Promise<void>;

class Hooks {
  private em = new EventEmitter();
  on<K extends keyof HookEvents>(event: K, handler: Handler<K>): () => void {
    const wrapped = (p: HookEvents[K]) => {
      try {
        const r = handler(p);
        if (r && typeof (r as Promise<void>).catch === 'function')
          (r as Promise<void>).catch((e) => logger.error({ err: e, event }, 'hook handler failed'));
      } catch (e) {
        logger.error({ err: e, event }, 'hook handler failed');
      }
    };
    this.em.on(event, wrapped);
    return () => this.em.off(event, wrapped);
  }
  emit<K extends keyof HookEvents>(event: K, payload: HookEvents[K]): void {
    this.em.emit(event, payload);
  }
}
export const hooks = new Hooks();
