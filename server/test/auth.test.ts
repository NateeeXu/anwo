import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot, client } from './helpers';

let base = '';
let stop: () => Promise<void> = async () => {};

before(async () => {
  const b = await boot('auth');
  base = b.base;
  stop = b.stop;
});
after(async () => stop());

test('register → me → edu code → confirm raises trust to 1 and sets campus', async () => {
  const c = client(base);
  const reg = await c.post('/api/auth/register', { email: 'nu.student@u.northwestern.edu', password: 'Passw0rd!', name: '测试 Tester' });
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  assert.equal(reg.json.ok, true);
  const me = reg.json.data!;
  assert.equal(me.trustLevel, 0);
  assert.equal(me.campusId, 'northwestern'); // inferred from the edu domain
  assert.equal(me.eduCodeSent, true);
  assert.ok(c.jar.has('sid'), 'session cookie set');
  assert.equal(c.jar.get('campus'), 'northwestern');

  const me2 = await c.get('/api/auth/me');
  assert.equal(me2.status, 200);
  assert.equal((me2.json.data as { email: string }).email, 'nu.student@u.northwestern.edu');

  const req = await c.post('/api/auth/request-edu-code', { email: 'nu.student@u.northwestern.edu' });
  assert.equal(req.status, 200, JSON.stringify(req.json));
  const code = (req.json.data as { devCode: string }).devCode;
  assert.match(code, /^\d{6}$/);

  const mailbox = await c.get<{ emails: { code: string; to: string }[] }>('/api/dev/mailbox?email=nu.student@u.northwestern.edu');
  assert.equal(mailbox.status, 200);
  assert.equal(mailbox.json.data!.emails[0]!.code, code);

  const bad = await c.post('/api/auth/confirm-edu-code', { email: 'nu.student@u.northwestern.edu', code: '000000' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error!.code, 'CODE_INVALID');

  const ok = await c.post('/api/auth/confirm-edu-code', { email: 'nu.student@u.northwestern.edu', code });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal((ok.json.data as { trustLevel: number }).trustLevel, 1);
  assert.ok((ok.json.data as { badges: string[] }).badges.includes('edu'));
});

test('duplicate email → EMAIL_TAKEN; bad password → INVALID_CREDENTIALS; validation → fields', async () => {
  const c = client(base);
  const dup = await c.post('/api/auth/register', { email: 'nu.student@u.northwestern.edu', password: 'Passw0rd!', name: 'Dup' });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.error!.code, 'EMAIL_TAKEN');

  const bad = await c.post('/api/auth/login', { email: 'nu.student@u.northwestern.edu', password: 'nope-nope' });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error!.code, 'INVALID_CREDENTIALS');

  const v = await c.post('/api/auth/register', { email: 'not-an-email', password: 'short' });
  assert.equal(v.status, 400);
  assert.equal(v.json.error!.code, 'VALIDATION');
  assert.ok(v.json.error!.fields!.email);
  assert.ok(v.json.error!.fields!.password);
  assert.ok(v.json.error!.fields!.name);
});

test('login sets cookie; logout clears it; CSRF header required on writes; non-edu register gets no code', async () => {
  const c = client(base);
  const login = await c.post('/api/auth/login', { email: 'nu.student@u.northwestern.edu', password: 'Passw0rd!' });
  assert.equal(login.status, 200);
  assert.ok(c.jar.has('sid'));

  const noCsrf = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: `sid=${c.jar.get('sid')}` } });
  assert.equal(noCsrf.status, 403);
  assert.equal(((await noCsrf.json()) as { error: { code: string } }).error.code, 'FORBIDDEN');

  const out = await c.post('/api/auth/logout');
  assert.equal(out.status, 200);
  const me = await c.get('/api/auth/me');
  assert.equal(me.status, 401);
  assert.equal(me.json.error!.code, 'UNAUTHORIZED');
  // the web app's boot probe: anonymous → 200 null (no console 401)
  const probe = await c.get('/api/auth/me?optional=1');
  assert.equal(probe.status, 200);
  assert.equal(probe.json.data, null);

  const c2 = client(base);
  const reg = await c2.post('/api/auth/register', { email: 'someone@gmail.com', password: 'Passw0rd!', name: 'Gmail' });
  assert.equal(reg.status, 201);
  assert.equal((reg.json.data as { eduCodeSent?: boolean }).eduCodeSent, false);
  const notEdu = await c2.post('/api/auth/request-edu-code', { email: 'someone@gmail.com' });
  assert.equal(notEdu.status, 400);
  assert.equal(notEdu.json.error!.code, 'NOT_EDU_EMAIL');
});

test('PATCH /api/users/me switches campus and cookie; GET /api/users/:id is public without email', async () => {
  const c = client(base);
  await c.post('/api/auth/login', { email: 'nu.student@u.northwestern.edu', password: 'Passw0rd!' });
  const patched = await c.patch('/api/users/me', { campusId: 'uiuc', bio: '你好', gradYear: 2027 });
  assert.equal(patched.status, 200, JSON.stringify(patched.json));
  assert.equal((patched.json.data as { campusId: string }).campusId, 'uiuc');
  assert.equal(c.jar.get('campus'), 'uiuc');
  const id = (patched.json.data as { id: string }).id;
  const pub = await client(base).get(`/api/users/${id}`);
  assert.equal(pub.status, 200);
  const d = pub.json.data as Record<string, unknown>;
  assert.equal(d.email, undefined);
  assert.equal((d.stats as { activeListings: number }).activeListings, 0);
  assert.equal((d.trustProfile as { eduVerified: boolean }).eduVerified, true);
});
