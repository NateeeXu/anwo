// Copy guard (billing-requirements §4): the word "escrow" must never reach users — the product name is
// 安心付 / Secure Payment. Keys may contain it (billing.escrow.*), values may not.
import test from 'node:test';
import assert from 'node:assert/strict';

test('billing dictionary values never say "escrow"', async () => {
  const mod = (await import('../../web/src/i18n/billing')) as { default: { zh: Record<string, string>; en: Record<string, string> } };
  const dict = mod.default;
  const offenders: string[] = [];
  for (const locale of ['zh', 'en'] as const) {
    for (const [k, v] of Object.entries(dict[locale])) if (typeof v === 'string' && /escrow/i.test(v)) offenders.push(`${locale}:${k}`);
  }
  assert.deepEqual(offenders, []);
});
