import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client } from './helpers';
import { CAMPUSES } from '@shared/campuses';

let base = '';
let stop: () => Promise<void> = async () => {};
before(async () => {
  const b = await boot('campuses');
  base = b.base;
  stop = b.stop;
});
after(async () => stop());

type Campus = { id: string; slug: string; shortName: string; city: string; state: string; eduDomains: string[]; defaultRadiusM: number; distanceM?: number };

test('GET /api/campuses lists every seeded campus with the Campus DTO shape', async () => {
  const c = client(base);
  const r = await c.get<Campus[]>('/api/campuses');
  assert.equal(r.status, 200);
  const list = r.json.data!;
  assert.equal(list.length, CAMPUSES.length);
  assert.equal(list[0]!.id, 'northwestern');
  const nu = list.find((x) => x.id === 'northwestern')!;
  assert.deepEqual(nu.eduDomains, ['northwestern.edu', 'u.northwestern.edu']);
  assert.equal(nu.slug, 'northwestern');
  assert.equal(nu.defaultRadiusM, 3000);
});

test('q / state / near filters', async () => {
  const c = client(base);
  const q = await c.get<Campus[]>('/api/campuses?q=north');
  assert.equal(q.status, 200);
  assert.ok(q.json.data!.length >= 2);
  assert.equal(q.json.data![0]!.id, 'northwestern');
  const zh = await c.get<Campus[]>('/api/campuses?q=' + encodeURIComponent('纽约'));
  assert.ok(zh.json.data!.some((x) => x.id === 'nyu'));
  const il = await c.get<Campus[]>('/api/campuses?state=il');
  assert.ok(il.json.data!.length >= 3);
  assert.ok(il.json.data!.every((x) => x.state === 'IL'));
  const near = await c.get<Campus[]>('/api/campuses?near=40.73,-73.99&limit=3');
  assert.equal(near.json.data![0]!.id, 'nyu');
  assert.ok(typeof near.json.data![0]!.distanceM === 'number');
});

test('GET /api/campuses/:idOrSlug with stats, 404 for unknown, suggest by coordinates', async () => {
  const c = client(base);
  const d = await c.get<Campus & { stats: Record<string, number> }>('/api/campuses/northwestern');
  assert.equal(d.status, 200);
  assert.equal(d.json.data!.city, 'Evanston');
  assert.deepEqual(Object.keys(d.json.data!.stats).sort(), ['activeItems', 'activeListings', 'activeWanted', 'openBuddy', 'shuttleRoutes']);
  const nf = await c.get('/api/campuses/hogwarts');
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error!.code, 'NOT_FOUND');
  const s = await c.get<{ suggested: Campus | null; nearest: Campus[] }>('/api/campuses/suggest?lat=42.05&lng=-87.68');
  assert.equal(s.status, 200);
  assert.equal(s.json.data!.suggested!.id, 'northwestern');
  assert.equal(s.json.data!.nearest.length, 3);
  const far = await c.get<{ suggested: Campus | null }>('/api/campuses/suggest?lat=45.0&lng=-100.0');
  assert.equal(far.json.data!.suggested, null);
  const bad = await c.get('/api/campuses/suggest?lat=999&lng=0');
  assert.equal(bad.status, 400);
});

test('POST /api/campuses/requests works anonymously; /api/meta exposes enums, brand and campus count', async () => {
  const c = client(base);
  const r = await c.post<{ id: string }>('/api/campuses/requests', { schoolName: 'Hogwarts School', city: 'London', state: 'NY' });
  assert.equal(r.status, 201);
  assert.ok(r.json.data!.id);
  const meta = await c.get<{ enums: Record<string, string[]>; brand: { nameZh: string }; campusesCount: number; flags: Record<string, unknown> }>('/api/meta');
  assert.equal(meta.status, 200);
  assert.deepEqual(meta.json.data!.enums.role, ['student', 'landlord', 'admin']);
  assert.equal(meta.json.data!.brand.nameZh, '安窝');
  assert.equal(meta.json.data!.campusesCount, CAMPUSES.length);
  // Secure Payment is off by default and enabled per campus (one cleared state at a time) — review fix
  assert.equal(meta.json.data!.flags['escrow.enabled'], false);
});
