// server/src/db/seed/verify.ts — OWNED BY THE `verify` MODULE AGENT.
// Seeds verification requests (pending / in_review / approved / rejected / cancelled) across ≥ 4 campuses, private
// placeholder "ID card" SVGs (clearly marked SAMPLE — never real-looking documents), phone codes, mock payment methods
// for L3 users, audit entries, notifications and events so the verification center, timeline and admin queue look alive.
//
// Private documents are written into UPLOAD_PRIVATE_DIR/seed/verify/ (never under the statically served server/uploads/)
// and registered as uploads rows with is_private = 1, purpose = 'verification'. Idempotent: every row this seed writes
// carries a `seed-verify-` id prefix (or path prefix) and is deleted before re-insert.
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { config } from '../../config';
import { q } from '../index';
import { sha256 } from '../../lib/ids';
import { nowIso, nowMs, DAY, HOUR } from '../../lib/time';
import { recomputeTrust } from '../../lib/trust';
import { seedUserId } from './core';

export const version = 1;

type ReqType = 'student_id' | 'passport' | 'government_id' | 'landlord_proof';
type Status = 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled';
type Spec = {
  email: string;
  type: ReqType;
  status: Status;
  /** hours before now the request was submitted */
  hoursAgo: number;
  /** hours after submission it was decided (approved/rejected) */
  decidedAfterH?: number;
  fullName: string;
  last4?: string;
  back?: boolean;
  selfie?: boolean;
  reason?: string;
  code?: string;
  note?: string;
};

// ---------------------------------------------------------------- the queue (richest at Northwestern; UIUC / NYU / USC / UMich lighter)
const SPECS: Spec[] = [
  // --- Northwestern: pending / in review
  { email: 'bob@u.northwestern.edu', type: 'student_id', status: 'pending', hoursAgo: 31, fullName: 'Bo Li', last4: '4471', back: true },
  { email: 'haoran.zhang@u.northwestern.edu', type: 'passport', status: 'pending', hoursAgo: 5, fullName: 'ZHANG HAORAN', last4: '8812', selfie: true },
  { email: 'jiaqi.huang@u.northwestern.edu', type: 'student_id', status: 'pending', hoursAgo: 2, fullName: 'Jiaqi Huang', last4: '2093' },
  { email: 'kai.tanaka@u.northwestern.edu', type: 'student_id', status: 'pending', hoursAgo: 14, fullName: 'Kai Tanaka', last4: '7730', back: true },
  { email: 'minjae.park@u.northwestern.edu', type: 'student_id', status: 'in_review', hoursAgo: 3, fullName: 'Minjae Park', last4: '1156', back: true },
  { email: 'daniel.kim@u.northwestern.edu', type: 'passport', status: 'in_review', hoursAgo: 12, fullName: 'DANIEL KIM', last4: '5521', selfie: true },
  // --- Northwestern: rejected (still L1) and a cancelled one
  { email: 'zihao.guo@u.northwestern.edu', type: 'student_id', status: 'rejected', hoursAgo: 80, decidedAfterH: 9, fullName: 'Zihao Guo', last4: '3310', reason: '照片模糊，无法辨认姓名和有效期。请在光线充足的地方重新拍摄。', code: 'blurry' },
  { email: 'sophia.wang@u.northwestern.edu', type: 'government_id', status: 'rejected', hoursAgo: 200, decidedAfterH: 20, fullName: 'Sijia Wang', last4: '9087', reason: '证件上的姓名与填写的姓名不一致。请按证件原样填写。', code: 'name_mismatch' },
  { email: 'grace.hu@u.northwestern.edu', type: 'student_id', status: 'rejected', hoursAgo: 40, decidedAfterH: 6, fullName: 'Grace Hu', last4: '6604', reason: '学生证已过期（2024-06）。请上传当前学年的学生证或护照。', code: 'expired' },
  { email: 'leo.ma@u.northwestern.edu', type: 'student_id', status: 'cancelled', hoursAgo: 60, fullName: 'Li Ma', last4: '2271' },
  // --- Northwestern: approved (L2 / L3 users); alice also has an older rejected attempt
  { email: 'alice@u.northwestern.edu', type: 'student_id', status: 'rejected', hoursAgo: 24 * 299, decidedAfterH: 7, fullName: 'Xiaoyu Zhang', last4: '0042', reason: '学生证背面缺失，无法核对有效期。', code: 'wrong_side' },
  { email: 'alice@u.northwestern.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 298, decidedAfterH: 5, fullName: 'Xiaoyu Zhang', last4: '0042', back: true, note: 'Front + back legible, expiry 06/2027.' },
  { email: 'wenjun.liu@u.northwestern.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 178, decidedAfterH: 11, fullName: 'Wenjun Liu', last4: '5188', back: true },
  { email: 'yuting.chen@u.northwestern.edu', type: 'passport', status: 'approved', hoursAgo: 24 * 258, decidedAfterH: 3, fullName: 'CHEN YUTING', last4: '7721', selfie: true },
  { email: 'siyuan.wu@u.northwestern.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 198, decidedAfterH: 16, fullName: 'Siyuan Wu', last4: '3395', back: true },
  { email: 'xinyi.lin@u.northwestern.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 308, decidedAfterH: 8, fullName: 'Xinyi Lin', last4: '9910' },
  { email: 'ruoxi.sun@u.northwestern.edu', type: 'passport', status: 'approved', hoursAgo: 24 * 338, decidedAfterH: 4, fullName: 'SUN RUOXI', last4: '1024', selfie: true },
  { email: 'mengyao.xu@u.northwestern.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 228, decidedAfterH: 22, fullName: 'Mengyao Xu', last4: '4480', back: true },
  { email: 'boyang.he@u.northwestern.edu', type: 'government_id', status: 'approved', hoursAgo: 24 * 398, decidedAfterH: 9, fullName: 'Boyang He', last4: '6712', back: true },
  { email: 'chloe.deng@u.northwestern.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 168, decidedAfterH: 2, fullName: 'Ke Deng', last4: '8059' },
  { email: 'nina.zhou@u.northwestern.edu', type: 'passport', status: 'approved', hoursAgo: 24 * 278, decidedAfterH: 6, fullName: 'ZHOU NING', last4: '2648', selfie: true },
  { email: 'landlord@evanstonhomes.com', type: 'landlord_proof', status: 'approved', hoursAgo: 24 * 498, decidedAfterH: 30, fullName: 'Evanston Homes LLC · Wang', last4: '0017', back: true, note: 'Cook County deed excerpt + utility bill match.' },
  { email: 'evanston.rentals@gmail.com', type: 'landlord_proof', status: 'approved', hoursAgo: 24 * 418, decidedAfterH: 41, fullName: 'Lakeshore Rentals LLC', last4: '3302', back: true },
  // --- UIUC
  { email: 'qianqian.wang@illinois.edu', type: 'student_id', status: 'pending', hoursAgo: 20, fullName: 'Qianqian Wang', last4: '5890', back: true },
  { email: 'jason.tan@illinois.edu', type: 'passport', status: 'pending', hoursAgo: 9, fullName: 'TAN JUNJIE JASON', last4: '1177', selfie: true },
  { email: 'hana.sato@illinois.edu', type: 'student_id', status: 'rejected', hoursAgo: 120, decidedAfterH: 15, fullName: 'Hana Sato', last4: '4402', reason: 'The photo is cropped — the expiry date and the i-card number are cut off.', code: 'cropped' },
  { email: 'yuxuan.li@illinois.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 208, decidedAfterH: 12, fullName: 'Yuxuan Li', last4: '7316', back: true },
  { email: 'meilin.gao@illinois.edu', type: 'passport', status: 'approved', hoursAgo: 24 * 348, decidedAfterH: 5, fullName: 'GAO MEILIN', last4: '9034', selfie: true },
  // --- NYU
  { email: 'kevin.xie@nyu.edu', type: 'government_id', status: 'pending', hoursAgo: 52, fullName: 'Kevin Xie', last4: '6271', back: true },
  { email: 'lucia.fernandez@nyu.edu', type: 'student_id', status: 'pending', hoursAgo: 7, fullName: 'Lucía Fernández', last4: '0931' },
  { email: 'anqi.yang@nyu.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 188, decidedAfterH: 7, fullName: 'Anqi Yang', last4: '2217', back: true },
  { email: 'ziyang.pan@nyu.edu', type: 'passport', status: 'approved', hoursAgo: 24 * 298, decidedAfterH: 3, fullName: 'PAN ZIYANG', last4: '5503', selfie: true },
  { email: 'manhattan.lets@outlook.com', type: 'landlord_proof', status: 'approved', hoursAgo: 24 * 378, decidedAfterH: 36, fullName: 'Manhattan Lets · Lin', last4: '8140', back: true },
  // --- USC
  { email: 'weichen.du@usc.edu', type: 'student_id', status: 'pending', hoursAgo: 1, fullName: 'Weichen Du', last4: '3348', back: true },
  { email: 'ava.nguyen@usc.edu', type: 'student_id', status: 'in_review', hoursAgo: 26, fullName: 'Ava Nguyen', last4: '7605' },
  { email: 'jingyi.cao@usc.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 238, decidedAfterH: 9, fullName: 'Jingyi Cao', last4: '1902', back: true },
  { email: 'hongyu.shi@usc.edu', type: 'passport', status: 'approved', hoursAgo: 24 * 328, decidedAfterH: 4, fullName: 'SHI HONGYU', last4: '4466', selfie: true },
  // --- UMich
  { email: 'shuyi.peng@umich.edu', type: 'student_id', status: 'pending', hoursAgo: 8, fullName: 'Shuyi Peng', last4: '2850', back: true },
  { email: 'omar.haddad@umich.edu', type: 'passport', status: 'rejected', hoursAgo: 70, decidedAfterH: 10, fullName: 'Omar Haddad', last4: '1193', reason: 'Only the back cover was uploaded. Upload the photo page of your passport.', code: 'wrong_side' },
  { email: 'ruijie.tang@umich.edu', type: 'student_id', status: 'approved', hoursAgo: 24 * 198, decidedAfterH: 6, fullName: 'Ruijie Tang', last4: '6628', back: true },
];

// ---------------------------------------------------------------- placeholder SVGs (abstract, watermarked, never real-looking)
const PALETTES = [
  ['#F3E8DC', '#C2410C'], ['#E6EEF4', '#1F4E79'], ['#E8F1E6', '#2F6B3A'], ['#F1E8F3', '#5B3A7A'], ['#F6EFD9', '#8A6A1F'], ['#E9ECEF', '#3B3F46'],
];
const TYPE_TITLE: Record<ReqType, [string, string]> = {
  student_id: ['STUDENT ID · 学生证', 'Sample student card'],
  passport: ['PASSPORT · 护照', 'Sample passport page'],
  government_id: ['GOVERNMENT ID · 身份证件', 'Sample identity card'],
  landlord_proof: ['OWNERSHIP PROOF · 房东证明', 'Sample deed excerpt'],
};
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function frontSvg(spec: Spec, campus: string, idx: number): string {
  const [bg, ink] = PALETTES[idx % PALETTES.length]!;
  const [title, sub] = TYPE_TITLE[spec.type];
  const masked = `•••• •••• ${spec.last4 ?? '0000'}`;
  const portrait = spec.type === 'landlord_proof' ? '' : `
    <rect x="64" y="150" width="220" height="280" rx="18" fill="#fff" stroke="${ink}" stroke-opacity=".35" stroke-width="3"/>
    <circle cx="174" cy="250" r="52" fill="${ink}" fill-opacity=".18"/>
    <path d="M94 410c10-70 60-100 80-100s70 30 80 100z" fill="${ink}" fill-opacity=".18"/>`;
  const lines = spec.type === 'landlord_proof'
    ? `<rect x="64" y="170" width="520" height="14" rx="7" fill="${ink}" fill-opacity=".18"/><rect x="64" y="204" width="460" height="14" rx="7" fill="${ink}" fill-opacity=".18"/><rect x="64" y="238" width="500" height="14" rx="7" fill="${ink}" fill-opacity=".18"/><rect x="64" y="272" width="380" height="14" rx="7" fill="${ink}" fill-opacity=".18"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630" font-family="Inter, 'Noto Sans SC', system-ui, sans-serif">
  <rect width="1000" height="630" rx="40" fill="${bg}"/>
  <rect x="24" y="24" width="952" height="582" rx="28" fill="none" stroke="${ink}" stroke-opacity=".25" stroke-width="3"/>
  <rect x="0" y="40" width="1000" height="64" fill="${ink}" fill-opacity=".9"/>
  <text x="56" y="83" font-size="28" font-weight="700" fill="#fff" letter-spacing="2">${esc(campus)}</text>
  <text x="944" y="83" font-size="22" font-weight="600" fill="#fff" text-anchor="end" opacity=".9">${esc(title)}</text>
  ${portrait}${lines}
  <text x="${spec.type === 'landlord_proof' ? 64 : 330}" y="${spec.type === 'landlord_proof' ? 350 : 200}" font-size="22" fill="${ink}" opacity=".7">NAME · 姓名</text>
  <text x="${spec.type === 'landlord_proof' ? 64 : 330}" y="${spec.type === 'landlord_proof' ? 392 : 242}" font-size="36" font-weight="700" fill="${ink}">${esc(spec.fullName)}</text>
  <text x="${spec.type === 'landlord_proof' ? 64 : 330}" y="${spec.type === 'landlord_proof' ? 450 : 306}" font-size="22" fill="${ink}" opacity=".7">NO. · 编号</text>
  <text x="${spec.type === 'landlord_proof' ? 64 : 330}" y="${spec.type === 'landlord_proof' ? 490 : 346}" font-size="32" font-weight="600" fill="${ink}" letter-spacing="3">${masked}</text>
  <text x="330" y="${spec.type === 'landlord_proof' ? 0 : 410}" font-size="22" fill="${ink}" opacity=".7">${spec.type === 'landlord_proof' ? '' : 'VALID THRU · 有效期'}</text>
  <text x="330" y="${spec.type === 'landlord_proof' ? 0 : 448}" font-size="30" font-weight="600" fill="${ink}">${spec.type === 'landlord_proof' ? '' : '06 / 2027'}</text>
  <circle cx="870" cy="470" r="64" fill="none" stroke="${ink}" stroke-opacity=".4" stroke-width="6" stroke-dasharray="14 10"/>
  <circle cx="870" cy="470" r="30" fill="${ink}" fill-opacity=".25"/>
  <text x="500" y="340" font-size="96" font-weight="800" fill="${ink}" fill-opacity=".14" text-anchor="middle" transform="rotate(-18 500 340)">SAMPLE · 示例</text>
  <text x="56" y="580" font-size="20" fill="${ink}" opacity=".75">${esc(sub)} — placeholder generated by the seed. Not a real document. 仅为演示用占位图，非真实证件。</text>
</svg>`;
}

function backSvg(spec: Spec, idx: number): string {
  const [bg, ink] = PALETTES[idx % PALETTES.length]!;
  let bars = '';
  let x = 80;
  let seed = idx * 7919 + (spec.last4 ? Number(spec.last4) : 11);
  while (x < 920) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const w = 4 + (seed % 14);
    bars += `<rect x="${x}" y="150" width="${w}" height="180" fill="${ink}" fill-opacity=".8"/>`;
    x += w + 4 + (seed % 9);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="630" viewBox="0 0 1000 630" font-family="Inter, 'Noto Sans SC', system-ui, sans-serif">
  <rect width="1000" height="630" rx="40" fill="${bg}"/>
  <rect x="24" y="24" width="952" height="582" rx="28" fill="none" stroke="${ink}" stroke-opacity=".25" stroke-width="3"/>
  <rect x="0" y="60" width="1000" height="56" fill="${ink}" fill-opacity=".9"/>
  ${bars}
  <rect x="80" y="380" width="840" height="14" rx="7" fill="${ink}" fill-opacity=".18"/>
  <rect x="80" y="414" width="700" height="14" rx="7" fill="${ink}" fill-opacity=".18"/>
  <rect x="80" y="448" width="760" height="14" rx="7" fill="${ink}" fill-opacity=".18"/>
  <text x="500" y="340" font-size="96" font-weight="800" fill="${ink}" fill-opacity=".14" text-anchor="middle" transform="rotate(-18 500 340)">SAMPLE · 示例</text>
  <text x="56" y="580" font-size="20" fill="${ink}" opacity=".75">Back side placeholder — not a real document. 背面占位图，非真实证件。</text>
</svg>`;
}

function selfieSvg(idx: number): string {
  const [bg, ink] = PALETTES[(idx + 2) % PALETTES.length]!;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000" font-family="Inter, 'Noto Sans SC', system-ui, sans-serif">
  <rect width="800" height="1000" fill="${bg}"/>
  <circle cx="400" cy="380" r="150" fill="${ink}" fill-opacity=".2"/>
  <path d="M130 900c30-220 170-300 270-300s240 80 270 300z" fill="${ink}" fill-opacity=".2"/>
  <rect x="470" y="560" width="250" height="160" rx="16" fill="#fff" stroke="${ink}" stroke-opacity=".4" stroke-width="4"/>
  <rect x="490" y="585" width="140" height="12" rx="6" fill="${ink}" fill-opacity=".3"/>
  <rect x="490" y="612" width="200" height="12" rx="6" fill="${ink}" fill-opacity=".3"/>
  <rect x="490" y="639" width="170" height="12" rx="6" fill="${ink}" fill-opacity=".3"/>
  <text x="400" y="520" font-size="90" font-weight="800" fill="${ink}" fill-opacity=".14" text-anchor="middle" transform="rotate(-18 400 520)">SAMPLE · 示例</text>
  <text x="400" y="960" font-size="22" fill="${ink}" opacity=".75" text-anchor="middle">Selfie-with-document placeholder. 手持证件自拍占位图，非真实照片。</text>
</svg>`;
}

// ---------------------------------------------------------------- helpers
const sid = (kind: string, key: string) => `seed-verify-${kind}-${sha256(key).slice(0, 20)}`;
const CAMPUS_LABEL: Record<string, string> = {
  northwestern: 'NORTHWESTERN UNIVERSITY', uiuc: 'UNIVERSITY OF ILLINOIS', nyu: 'NEW YORK UNIVERSITY', usc: 'UNIVERSITY OF SOUTHERN CALIFORNIA', umich: 'UNIVERSITY OF MICHIGAN',
};

function writePrivateUpload(ownerId: string, rel: string, svg: string, createdAt: string): string {
  const abs = path.join(config.uploadPrivateDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, svg);
  const id = sid('up', rel);
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  q.run(
    `INSERT INTO uploads (id, owner_id, kind, purpose, filename, path, url, mime, size_bytes, width, height, sha256, is_private, created_at)
     VALUES (?, ?, 'image', 'verification', ?, ?, ?, 'image/svg+xml', ?, ?, ?, ?, 1, ?)`,
    [id, ownerId, path.basename(rel), rel, `/api/uploads/${id}/file`, Buffer.byteLength(svg), m ? Number(m[1]) : null, m ? Number(m[2]) : null, sha256(svg), createdAt],
  );
  return id;
}

export default async function seed(_db: DatabaseSync): Promise<void> {
  const admin = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.edu'])?.id ?? seedUserId('admin@example.edu');
  const t = nowIso();

  q.tx(() => {
    // ---- wipe what this seed owns (requests first: uploads are referenced with ON DELETE SET NULL)
    q.run("DELETE FROM verification_requests WHERE id LIKE 'seed-verify-%'");
    q.run("DELETE FROM audit_log WHERE id LIKE 'seed-verify-%'");
    q.run("DELETE FROM events WHERE id LIKE 'seed-verify-%'");
    q.run("DELETE FROM phone_codes WHERE id LIKE 'seed-verify-%'");
    q.run("DELETE FROM payment_methods WHERE id LIKE 'seed-verify-%'");
    q.run("DELETE FROM notifications WHERE json_extract(data_json, '$.seed') = 'verify'");
    q.run("DELETE FROM uploads WHERE path LIKE 'seed/verify/%'");
    try { fs.rmSync(path.join(config.uploadPrivateDir, 'seed', 'verify'), { recursive: true, force: true }); } catch { /* ignore */ }

    const touched = new Set<string>();
    SPECS.forEach((spec, idx) => {
      const user = q.get<{ id: string; campus_id: string | null; locale: string; id_verified_at: string | null }>('SELECT id, campus_id, locale, id_verified_at FROM users WHERE email = ?', [spec.email.toLowerCase()]);
      if (!user) return;
      touched.add(user.id);
      const key = `${spec.email}:${spec.type}:${spec.status}:${spec.hoursAgo}`;
      const id = sid('vr', key);
      const submittedAt = new Date(nowMs() - spec.hoursAgo * HOUR).toISOString();
      const decided = spec.status === 'approved' || spec.status === 'rejected';
      const reviewedAt = decided ? new Date(Date.parse(submittedAt) + (spec.decidedAfterH ?? 6) * HOUR).toISOString() : null;
      const campusLabel = CAMPUS_LABEL[user.campus_id ?? ''] ?? (user.campus_id ?? 'CAMPUS').toUpperCase();
      const base = `seed/verify/${sha256(key).slice(0, 10)}`;
      const front = writePrivateUpload(user.id, `${base}-front.svg`, frontSvg(spec, campusLabel, idx), submittedAt);
      const back = spec.back ? writePrivateUpload(user.id, `${base}-back.svg`, backSvg(spec, idx), submittedAt) : null;
      const selfie = spec.selfie ? writePrivateUpload(user.id, `${base}-selfie.svg`, selfieSvg(idx), submittedAt) : null;
      const reviewer = spec.status === 'pending' || spec.status === 'cancelled' ? null : admin;
      q.run(
        `INSERT INTO verification_requests (id, user_id, campus_id, type, front_upload_id, back_upload_id, selfie_upload_id, full_name, doc_number_last4,
           status, reviewer_id, reason, internal_note, submitted_at, reviewed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, user.id, user.campus_id, spec.type, front, back, selfie, spec.fullName, spec.last4 ?? null, spec.status, reviewer,
          spec.status === 'rejected' ? spec.reason ?? null : null, spec.note ?? null, submittedAt, reviewedAt, submittedAt, reviewedAt ?? submittedAt],
      );
      // analytics: the submission
      q.run(
        `INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at)
         VALUES (?, ?, NULL, ?, 'verify.submit', 'verification_request', ?, ?, '/api/verify/id', ?)`,
        [sid('ev', key), user.id, user.campus_id, id, JSON.stringify({ type: spec.type, hasBack: !!back, hasSelfie: !!selfie, seed: 1 }), submittedAt],
      );
      // admin trail + notification for decided / claimed requests
      if (spec.status === 'in_review') {
        q.run(
          `INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, ?, 'admin', 'verify.claim', 'verification_request', ?, ?, ?, NULL, ?)`,
          [sid('au', key + ':claim'), admin, id, JSON.stringify({ status: 'pending', type: spec.type }), JSON.stringify({ status: 'in_review', type: spec.type, reviewerId: admin }), new Date(Date.parse(submittedAt) + 40 * 60_000).toISOString()],
        );
      }
      if (decided && reviewedAt) {
        const approved = spec.status === 'approved';
        q.run(
          `INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, ?, 'admin', ?, 'verification_request', ?, ?, ?, ?, ?)`,
          [
            sid('au', key + ':decide'), admin, approved ? 'verify.approve' : 'verify.reject', id,
            JSON.stringify({ status: 'pending', type: spec.type }),
            JSON.stringify(approved ? { status: 'approved', type: spec.type, userId: user.id } : { status: 'rejected', type: spec.type, code: spec.code ?? null, userId: user.id }),
            approved ? spec.note ?? null : spec.reason ?? null, reviewedAt,
          ],
        );
        q.run(
          `INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, ?, 'admin', 'verify.view_document', 'verification_request', ?, NULL, ?, NULL, ?)`,
          [sid('au', key + ':view'), admin, id, JSON.stringify({ side: 'front', uploadId: front, userId: user.id }), new Date(Date.parse(reviewedAt) - 6 * 60_000).toISOString()],
        );
        const zh = user.locale !== 'en';
        const typeZh: Record<ReqType, string> = { student_id: '学生证', passport: '护照', government_id: '身份证件', landlord_proof: '房东证明' };
        const typeEn: Record<ReqType, string> = { student_id: 'student ID', passport: 'passport', government_id: 'government ID', landlord_proof: 'landlord proof' };
        q.run(
          `INSERT INTO notifications (id, user_id, kind, title, body, link, entity_type, entity_id, data_json, read_at, created_at) VALUES (?, ?, ?, ?, ?, '/verify', 'verification_request', ?, ?, ?, ?)`,
          [
            sid('nt', key), user.id, approved ? 'verify.approved' : 'verify.rejected',
            approved ? (zh ? `${typeZh[spec.type]}验证已通过` : `Your ${typeEn[spec.type]} was verified`) : zh ? `${typeZh[spec.type]}验证未通过` : `Your ${typeEn[spec.type]} could not be verified`,
            approved ? (zh ? '你的信任等级提升到 L2，发布的内容会显示「已验证」标识。' : 'Your trust level is now L2. Your posts show the verified badge.') : zh ? `原因：${spec.reason}。你可以重新提交。` : `Reason: ${spec.reason}. You can resubmit.`,
            id, JSON.stringify({ seed: 'verify', type: spec.type, code: spec.code ?? null }),
            spec.hoursAgo > 48 ? reviewedAt : null, reviewedAt,
          ],
        );
      }
      // keep users.id_verified_at consistent with the approved row (core seed already sets it for L2+; align the timestamp)
      if (spec.status === 'approved' && reviewedAt) {
        q.run('UPDATE users SET id_verified_at = ? WHERE id = ? AND (id_verified_at IS NULL OR id_verified_at > ?)', [reviewedAt, user.id, reviewedAt]);
      }
    });

    // ---- phone codes (mock SMS): bob confirmed a number last week but it was not completed; haoran has a fresh code
    const phoneCodes: { email: string; phone: string; code: string; minutesAgo: number; consumed: boolean }[] = [
      { email: 'bob@u.northwestern.edu', phone: '+18475550111', code: '482913', minutesAgo: 3 * 24 * 60, consumed: false },
      { email: 'haoran.zhang@u.northwestern.edu', phone: '+13125550118', code: '731406', minutesAgo: 2, consumed: false },
      { email: 'alice@u.northwestern.edu', phone: '+18475550101', code: '905512', minutesAgo: 40 * 24 * 60, consumed: true },
    ];
    for (const pc of phoneCodes) {
      const uid = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [pc.email])?.id;
      if (!uid) continue;
      const createdAt = new Date(nowMs() - pc.minutesAgo * 60_000).toISOString();
      q.run(
        `INSERT INTO phone_codes (id, user_id, phone, code, purpose, body, attempts, max_attempts, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, 'phone_verify', ?, 0, 5, ?, ?, ?)`,
        [sid('pc', pc.email + pc.code), uid, pc.phone, pc.code, `【安窝 Anwo】验证码 ${pc.code}，5 分钟内有效。`, new Date(Date.parse(createdAt) + 5 * 60_000).toISOString(), pc.consumed ? new Date(Date.parse(createdAt) + 90_000).toISOString() : null, createdAt],
      );
      if (!pc.consumed && pc.minutesAgo < 10) q.run('UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?', [pc.phone, uid]);
    }

    // ---- mock payment methods for every L3 seed user without one (billing's PaymentMethod DTO; brand + last4 only)
    const l3 = q.all<{ id: string; email: string; payment_verified_at: string | null; created_at: string }>("SELECT id, email, payment_verified_at, created_at FROM users WHERE trust_level >= 3 AND deleted_at IS NULL");
    const cards: [string, string, number, number][] = [['visa', '4242', 8, 2028], ['mastercard', '4444', 1, 2029], ['amex', '0005', 11, 2027], ['unionpay', '0016', 5, 2030]];
    l3.forEach((u, i) => {
      if (q.count('SELECT COUNT(*) FROM payment_methods WHERE user_id = ? AND deleted_at IS NULL', [u.id]) > 0) return;
      const [brand, last4, m, y] = cards[i % cards.length]!;
      const createdAt = u.payment_verified_at ?? new Date(Date.parse(u.created_at) + 3 * DAY).toISOString();
      q.run(
        `INSERT INTO payment_methods (id, user_id, provider, provider_token, brand, last4, exp_month, exp_year, is_default, created_at) VALUES (?, ?, 'mock_stripe', ?, ?, ?, ?, ?, 1, ?)`,
        [sid('pm', u.email), u.id, `pm_mock_seed_${sha256(u.email).slice(0, 16)}`, brand, last4, m, y, createdAt],
      );
      q.run('UPDATE users SET payment_verified_at = COALESCE(payment_verified_at, ?) WHERE id = ?', [createdAt, u.id]);
    });

    // ---- a trust override example in the audit trail (admin bumped the Evanston Homes landlord after a phone call)
    const landlord = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['landlord@evanstonhomes.com'])?.id;
    if (landlord) {
      q.run(
        `INSERT INTO audit_log (id, actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, reason, created_at) VALUES (?, ?, 'admin', 'user.trust_override', 'user', ?, ?, ?, ?, ?)`,
        [sid('au', 'override:landlord'), admin, landlord, JSON.stringify({ trustLevel: 2 }), JSON.stringify({ trustLevel: 3 }), 'Ownership confirmed by phone with Cook County records; payment method on file.', new Date(nowMs() - 470 * DAY).toISOString()],
      );
    }

    // ---- users touched by this seed get a consistent derived trust level (never lowers admin overrides)
    for (const uid of touched) recomputeTrust(uid, 'seed');
    q.run('UPDATE users SET updated_at = ? WHERE id IN (SELECT user_id FROM verification_requests WHERE id LIKE ?)', [t, 'seed-verify-%']);
  });
}
