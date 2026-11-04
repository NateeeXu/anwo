// Copy guard (billing-requirements §4, BUSINESS_PLAN §3.7): users never read "escrow" / 托管 — the product is
// 安心付 / Secure Payment, a payment held by the licensed payment processor, never a platform account.
// Keys may contain it (billing.escrow.*, chat.system.escrow_funded), values may not — in every web dictionary and in
// the bilingual { zh, en } strings the server sends (notifications, system messages).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BANNED = /escrow|托管/i;

test('no web dictionary value says "escrow" or 托管', async () => {
  const dir = path.join(ROOT, 'web/src/i18n');
  const offenders: string[] = [];
  let checked = 0;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts') && n !== 'index.ts')) {
    const mod = (await import(path.join(dir, f))) as { default?: { zh?: Record<string, unknown>; en?: Record<string, unknown> } };
    const dict = mod.default;
    if (!dict || typeof dict !== 'object' || !dict.zh) continue;
    checked++;
    for (const locale of ['zh', 'en'] as const) {
      for (const [k, v] of Object.entries(dict[locale] ?? {})) if (typeof v === 'string' && BANNED.test(v)) offenders.push(`${f}:${locale}:${k}`);
    }
  }
  assert.ok(checked >= 10, `only ${checked} dictionaries loaded`);
  assert.deepEqual(offenders, []);
});

test('server zh/en user-facing strings never say "escrow" or 托管', () => {
  const offenders: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts')) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          for (const m of line.matchAll(/\b(?:zh|en):\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) if (BANNED.test(m[2] ?? '')) offenders.push(`${path.relative(ROOT, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(path.join(ROOT, 'server/src/modules'));
  walk(path.join(ROOT, 'server/src/lib'));
  assert.deepEqual(offenders, []);
});
