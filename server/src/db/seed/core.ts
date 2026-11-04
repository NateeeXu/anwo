// Core seed: 66 campuses, feature flags, the 5 BRIEF §9 accounts + ~40 realistic bilingual users across
// northwestern (most), uiuc, nyu, usc, umich, avatars (seed uploads), and a few notifications for alice.
// User ids are deterministic (sha256 of the email, formatted as a UUID) so module seeds can reference them stably;
// still prefer `q.get('SELECT id FROM users WHERE email = ?')` in module seeds.
import type { DatabaseSync } from 'node:sqlite';
import { q } from '../index';
import { hashPassword } from '../../lib/auth';
import { syncCampuses } from '../../lib/campuses';
import { ensureDefaultFlags, invalidateFlags } from '../../lib/flags';
import { insertSeedUpload } from '../../lib/uploads';
import { referralCode, sha256 } from '../../lib/ids';
import { nowIso, nowMs, DAY } from '../../lib/time';

export const version = 1;
export const SEED_PASSWORD = 'Passw0rd!';

export function seedUserId(email: string): string {
  const h = sha256('user:' + email.toLowerCase());
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function seedReferral(email: string): string {
  const h = sha256('ref:' + email.toLowerCase()).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (h.replace(/[01OI]/g, 'X').slice(0, 8) || referralCode()).padEnd(8, 'X');
}

export type SeedUser = {
  email: string; name: string; role?: 'student' | 'landlord' | 'admin'; trust: 0 | 1 | 2 | 3; campus: string | null; locale?: 'zh-CN' | 'en';
  program?: string; gradYear?: number; languages?: string[]; bio?: string; gender?: 'female' | 'male' | 'nonbinary' | 'undisclosed';
  avatar?: number; wechat?: string; phone?: string; verifiedOnly?: boolean; listingQuota?: number; daysAgo?: number;
};

export const SEED_USERS: SeedUser[] = [
  // ---- BRIEF §9 accounts
  { email: 'admin@example.edu', name: '安窝管理员 Admin', role: 'admin', trust: 3, campus: null, locale: 'en', program: 'Platform operations', languages: ['zh', 'en'], bio: 'Platform operator. 平台运营。', avatar: 1, phone: '+18475550100', daysAgo: 400 },
  { email: 'alice@u.northwestern.edu', name: '张晓雨 Alice', trust: 2, campus: 'northwestern', program: 'MS Computer Science', gradYear: 2027, languages: ['zh', 'en'], bio: '西北 MSCS 在读，喜欢做饭和爬山。Looking for a quiet place near Davis St.', gender: 'female', avatar: 2, wechat: 'alice_zxy', phone: '+18475550101', daysAgo: 300 },
  { email: 'bob@u.northwestern.edu', name: '李博 Bob', trust: 1, campus: 'northwestern', program: 'MEM (Engineering Management)', gradYear: 2026, languages: ['zh', 'en'], bio: '暑期去湾区实习，想转租 6–8 月。Summer sublet available.', gender: 'male', avatar: 3, wechat: 'bob_li', daysAgo: 220 },
  { email: 'landlord@evanstonhomes.com', name: 'Evanston Homes · 王先生', role: 'landlord', trust: 3, campus: 'northwestern', locale: 'en', program: 'Property management', languages: ['en', 'zh'], bio: 'Family-owned rentals within 10 minutes of campus. 中英文都可以联系。', gender: 'male', avatar: 4, phone: '+18475550102', listingQuota: 3, daysAgo: 500 },
  { email: 'newbie@u.northwestern.edu', name: '陈欣 Newbie', trust: 0, campus: 'northwestern', program: 'Incoming MS Data Science', gradYear: 2028, languages: ['zh'], bio: '九月入学，还在找房 🙏', gender: 'female', avatar: 5, daysAgo: 3 },
  // ---- Northwestern
  { email: 'wenjun.liu@u.northwestern.edu', name: '刘文君 Wenjun', trust: 2, campus: 'northwestern', program: 'PhD Chemistry', gradYear: 2029, languages: ['zh', 'en'], bio: '实验室常驻，找安静的 1B1B。', gender: 'female', avatar: 6, daysAgo: 180 },
  { email: 'haoran.zhang@u.northwestern.edu', name: '张浩然 Haoran', trust: 1, campus: 'northwestern', program: 'MS Analytics', gradYear: 2026, languages: ['zh', 'en'], bio: '周末打球 🏀 找球友也找室友。', gender: 'male', avatar: 7, daysAgo: 150 },
  { email: 'yuting.chen@u.northwestern.edu', name: '陈雨婷 Yuting', trust: 3, campus: 'northwestern', program: 'Kellogg MBA', gradYear: 2026, languages: ['zh', 'en'], bio: 'Kellogg 2026. Hosting a furnished studio downtown.', gender: 'female', avatar: 8, phone: '+18475550103', daysAgo: 260 },
  { email: 'minjae.park@u.northwestern.edu', name: 'Minjae Park 박민재', trust: 1, campus: 'northwestern', locale: 'en', program: 'MS Information Systems', gradYear: 2027, languages: ['ko', 'en'], bio: 'Looking for roommates near Noyes station.', gender: 'male', avatar: 9, daysAgo: 90 },
  { email: 'siyuan.wu@u.northwestern.edu', name: '吴思源 Siyuan', trust: 2, campus: 'northwestern', program: 'MS Mechanical Engineering', gradYear: 2026, languages: ['zh', 'en'], bio: '有车，可以帮忙机场接机。', gender: 'male', avatar: 10, wechat: 'wsy_nu', daysAgo: 200 },
  { email: 'jiaqi.huang@u.northwestern.edu', name: '黄佳琪 Jiaqi', trust: 1, campus: 'northwestern', program: 'MS Journalism (Medill)', gradYear: 2026, languages: ['zh', 'en'], bio: 'Medill 新闻，记录留学生活。', gender: 'female', avatar: 11, daysAgo: 120 },
  { email: 'tianyi.zhao@u.northwestern.edu', name: '赵天一 Tianyi', trust: 0, campus: 'northwestern', program: 'BS Economics', gradYear: 2028, languages: ['zh', 'en'], bio: '大一新生，想找学习搭子。', gender: 'male', avatar: 12, daysAgo: 10 },
  { email: 'xinyi.lin@u.northwestern.edu', name: '林心怡 Xinyi', trust: 2, campus: 'northwestern', program: 'MS Biotechnology', gradYear: 2026, languages: ['zh', 'en'], bio: '毕业季出闲置，几乎全新。', gender: 'female', avatar: 13, daysAgo: 310 },
  { email: 'kai.tanaka@u.northwestern.edu', name: 'Kai Tanaka 田中海', trust: 1, campus: 'northwestern', locale: 'en', program: 'MS Materials Science', gradYear: 2027, languages: ['ja', 'en'], bio: 'Climbing, ramen, and a good desk lamp.', gender: 'male', avatar: 14, daysAgo: 75 },
  { email: 'ruoxi.sun@u.northwestern.edu', name: '孙若曦 Ruoxi', trust: 3, campus: 'northwestern', program: 'JD-MBA', gradYear: 2027, languages: ['zh', 'en'], bio: 'Pritzker + Kellogg. Hosting a 2B2B lease takeover.', gender: 'female', avatar: 15, phone: '+18475550104', daysAgo: 340 },
  { email: 'zihao.guo@u.northwestern.edu', name: '郭子豪 Zihao', trust: 1, campus: 'northwestern', program: 'MS Electrical Engineering', gradYear: 2026, languages: ['zh', 'en'], bio: 'Costco 拼车常客。', gender: 'male', avatar: 16, daysAgo: 140 },
  { email: 'mengyao.xu@u.northwestern.edu', name: '徐梦瑶 Mengyao', trust: 2, campus: 'northwestern', program: 'MA Learning Sciences', gradYear: 2026, languages: ['zh', 'en'], bio: '喜欢周末去芝加哥看展。', gender: 'female', avatar: 17, daysAgo: 230 },
  { email: 'daniel.kim@u.northwestern.edu', name: 'Daniel Kim', trust: 1, campus: 'northwestern', locale: 'en', program: 'BS Computer Science', gradYear: 2027, languages: ['en', 'ko'], bio: 'Study group for CS 336 anyone?', gender: 'male', avatar: 18, daysAgo: 60 },
  { email: 'yiran.feng@u.northwestern.edu', name: '冯一冉 Yiran', trust: 0, campus: 'northwestern', program: 'MS Statistics', gradYear: 2027, languages: ['zh'], bio: '刚到 Evanston，求租 9 月起。', gender: 'female', avatar: 19, daysAgo: 5 },
  { email: 'boyang.he@u.northwestern.edu', name: '何博洋 Boyang', trust: 2, campus: 'northwestern', program: 'PhD Economics', gradYear: 2030, languages: ['zh', 'en'], bio: '长期租客，安静不吵。', gender: 'male', avatar: 20, daysAgo: 400 },
  { email: 'sophia.wang@u.northwestern.edu', name: '王思佳 Sophia', trust: 1, campus: 'northwestern', program: 'MS Integrated Marketing', gradYear: 2026, languages: ['zh', 'en'], bio: '健身搭子 / 周末 brunch。', gender: 'female', avatar: 21, daysAgo: 110 },
  { email: 'leo.ma@u.northwestern.edu', name: '马立 Leo', trust: 1, campus: 'northwestern', program: 'MS Project Management', gradYear: 2026, languages: ['zh', 'en'], bio: '出一辆通勤自行车和一张桌子。', gender: 'male', avatar: 22, daysAgo: 95 },
  { email: 'chloe.deng@u.northwestern.edu', name: '邓可 Chloe', trust: 2, campus: 'northwestern', program: 'MS Communication', gradYear: 2027, languages: ['zh', 'en'], bio: 'Downtown Evanston 1B1B 转租，带家具。', gender: 'female', avatar: 23, daysAgo: 170 },
  { email: 'ethan.luo@u.northwestern.edu', name: '罗一凡 Ethan', trust: 0, campus: 'northwestern', program: 'BS Industrial Engineering', gradYear: 2029, languages: ['zh', 'en'], bio: '新生报到！', gender: 'male', avatar: 24, daysAgo: 2 },
  { email: 'nina.zhou@u.northwestern.edu', name: '周宁 Nina', trust: 3, campus: 'northwestern', program: 'MS Finance (Kellogg)', gradYear: 2026, languages: ['zh', 'en'], bio: 'Verified host. 两个卧室八月起可入住。', gender: 'female', avatar: 25, phone: '+18475550105', daysAgo: 280 },
  { email: 'grace.hu@u.northwestern.edu', name: '胡佳怡 Grace', trust: 1, campus: 'northwestern', program: 'MS Public Health', gradYear: 2027, languages: ['zh', 'en'], bio: '找 roommate，女生优先。', gender: 'female', avatar: 26, daysAgo: 45 },
  { email: 'evanston.rentals@gmail.com', name: 'Lakeshore Rentals LLC', role: 'landlord', trust: 2, campus: 'northwestern', locale: 'en', program: 'Property management', languages: ['en'], bio: 'Student-friendly apartments on Sherman and Chicago Ave.', avatar: 27, listingQuota: 3, daysAgo: 420 },
  // ---- UIUC
  { email: 'yuxuan.li@illinois.edu', name: '李雨轩 Yuxuan', trust: 2, campus: 'uiuc', program: 'MS Computer Science', gradYear: 2026, languages: ['zh', 'en'], bio: 'Siebel 常驻。暑期转租 Green St 公寓。', gender: 'male', avatar: 28, daysAgo: 210 },
  { email: 'qianqian.wang@illinois.edu', name: '王倩倩 Qianqian', trust: 1, campus: 'uiuc', program: 'MS Accountancy', gradYear: 2026, languages: ['zh', 'en'], bio: 'Champaign 生活两年，熟悉周边。', gender: 'female', avatar: 29, daysAgo: 160 },
  { email: 'jason.tan@illinois.edu', name: 'Jason Tan 陈俊杰', trust: 1, campus: 'uiuc', locale: 'en', program: 'BS ECE', gradYear: 2027, languages: ['en', 'zh'], bio: 'Looking for a carpool to O\'Hare in May.', gender: 'male', avatar: 30, daysAgo: 70 },
  { email: 'meilin.gao@illinois.edu', name: '高美琳 Meilin', trust: 3, campus: 'uiuc', program: 'PhD Civil Engineering', gradYear: 2028, languages: ['zh', 'en'], bio: 'Verified host, Urbana 2B1B lease takeover.', gender: 'female', avatar: 31, phone: '+12175550106', daysAgo: 350 },
  { email: 'ryan.zhu@illinois.edu', name: '朱睿 Ryan', trust: 0, campus: 'uiuc', program: 'MS Information Management', gradYear: 2027, languages: ['zh', 'en'], bio: '八月到校，求租。', gender: 'male', avatar: 32, daysAgo: 7 },
  { email: 'hana.sato@illinois.edu', name: 'Hana Sato', trust: 1, campus: 'uiuc', locale: 'en', program: 'MS Statistics', gradYear: 2026, languages: ['ja', 'en'], bio: 'Selling a bike and a desk before graduation.', gender: 'female', avatar: 33, daysAgo: 130 },
  // ---- NYU
  { email: 'anqi.yang@nyu.edu', name: '杨安琪 Anqi', trust: 2, campus: 'nyu', program: 'MS Integrated Design & Media', gradYear: 2026, languages: ['zh', 'en'], bio: 'Brooklyn 工作室，找 roommate。', gender: 'female', avatar: 34, daysAgo: 190 },
  { email: 'kevin.xie@nyu.edu', name: '谢凯文 Kevin', trust: 1, campus: 'nyu', program: 'MS Data Science (CDS)', gradYear: 2026, languages: ['zh', 'en'], bio: '实习去西雅图，暑期转租 East Village。', gender: 'male', avatar: 35, daysAgo: 150 },
  { email: 'lucia.fernandez@nyu.edu', name: 'Lucía Fernández', trust: 1, campus: 'nyu', locale: 'en', program: 'MA Global Affairs', gradYear: 2027, languages: ['es', 'en'], bio: 'Spanish/English, looking for a study buddy at Bobst.', gender: 'female', avatar: 36, daysAgo: 55 },
  { email: 'ziyang.pan@nyu.edu', name: '潘子阳 Ziyang', trust: 3, campus: 'nyu', program: 'Stern MBA', gradYear: 2026, languages: ['zh', 'en'], bio: 'Verified host · Greenwich Village 1B.', gender: 'male', avatar: 37, phone: '+12125550107', daysAgo: 300 },
  { email: 'mia.cheng@nyu.edu', name: '程米亚 Mia', trust: 0, campus: 'nyu', program: 'BFA Film (Tisch)', gradYear: 2029, languages: ['zh', 'en'], bio: '新生，求 9 月入住。', gender: 'female', avatar: 38, daysAgo: 4 },
  { email: 'manhattan.lets@outlook.com', name: 'Manhattan Lets · 林女士', role: 'landlord', trust: 2, campus: 'nyu', locale: 'zh-CN', program: 'Property management', languages: ['zh', 'en'], bio: '华人房东，NYU 周边多套房源。', gender: 'female', avatar: 39, listingQuota: 3, daysAgo: 380 },
  // ---- USC
  { email: 'jingyi.cao@usc.edu', name: '曹静怡 Jingyi', trust: 2, campus: 'usc', program: 'MS Computer Science', gradYear: 2026, languages: ['zh', 'en'], bio: 'Viterbi。出一套 IKEA 家具。', gender: 'female', avatar: 40, daysAgo: 240 },
  { email: 'weichen.du@usc.edu', name: '杜伟辰 Weichen', trust: 1, campus: 'usc', program: 'MS Electrical Engineering', gradYear: 2027, languages: ['zh', 'en'], bio: 'LAX 接机拼车群主。', gender: 'male', avatar: 1, daysAgo: 100 },
  { email: 'ava.nguyen@usc.edu', name: 'Ava Nguyen', trust: 1, campus: 'usc', locale: 'en', program: 'MPH', gradYear: 2026, languages: ['en'], bio: 'Hiking buddies wanted (Runyon on Sundays).', gender: 'female', avatar: 2, daysAgo: 85 },
  { email: 'hongyu.shi@usc.edu', name: '施鸿宇 Hongyu', trust: 3, campus: 'usc', program: 'Marshall MBA', gradYear: 2026, languages: ['zh', 'en'], bio: 'Verified host · 2B2B near Expo Park.', gender: 'male', avatar: 3, phone: '+12135550108', daysAgo: 330 },
  // ---- UMich
  { email: 'ruijie.tang@umich.edu', name: '唐睿杰 Ruijie', trust: 2, campus: 'umich', program: 'MS Robotics', gradYear: 2026, languages: ['zh', 'en'], bio: 'Ann Arbor 两年，Kerrytown 一居转租。', gender: 'male', avatar: 4, daysAgo: 200 },
  { email: 'shuyi.peng@umich.edu', name: '彭书怡 Shuyi', trust: 1, campus: 'umich', program: 'MS Information (UMSI)', gradYear: 2027, languages: ['zh', 'en'], bio: '找一起去 Detroit 看球的朋友。', gender: 'female', avatar: 5, daysAgo: 65 },
  { email: 'omar.haddad@umich.edu', name: 'Omar Haddad', trust: 1, campus: 'umich', locale: 'en', program: 'MS Mechanical Engineering', gradYear: 2026, languages: ['en'], bio: 'Selling textbooks and a mini fridge.', gender: 'male', avatar: 6, daysAgo: 120 },
  { email: 'lanxin.zhang@umich.edu', name: '张兰欣 Lanxin', trust: 0, campus: 'umich', program: 'BS Business (Ross)', gradYear: 2029, languages: ['zh', 'en'], bio: '新生求租 North Campus 附近。', gender: 'female', avatar: 7, daysAgo: 6 },
];

const AVATAR_PATH = (n: number) => `seed/avatars/a${String(n).padStart(2, '0')}.svg`;

export default async function seed(_db: DatabaseSync): Promise<void> {
  syncCampuses({ overwrite: true });
  ensureDefaultFlags();
  // demo: Secure Payment is live in the first cleared state only (Illinois); everywhere else shows "coming to <state>"
  const ilCampuses = q.all<{ id: string }>("SELECT id FROM campuses WHERE state = 'IL' ORDER BY sort_order").map((c) => c.id);
  q.run("UPDATE feature_flags SET enabled = 1, campus_ids_json = ? WHERE key = 'escrow.enabled' AND campus_ids_json = '[]'", [JSON.stringify(ilCampuses)]);
  invalidateFlags();
  const hash = await hashPassword(SEED_PASSWORD);
  const t = nowIso();

  q.tx(() => {
    for (const u of SEED_USERS) {
      const id = seedUserId(u.email);
      const createdAt = new Date(nowMs() - (u.daysAgo ?? 30) * DAY).toISOString();
      const avatarId = u.avatar ? insertSeedUpload({ path: AVATAR_PATH(u.avatar), purpose: 'seed' }) : null;
      const eduEmail = /\.edu$/.test(u.email) ? u.email : null;
      const emailVerifiedAt = u.trust >= 1 ? createdAt : null;
      const idVerifiedAt = u.trust >= 2 ? new Date(Date.parse(createdAt) + 2 * DAY).toISOString() : null;
      const phoneVerifiedAt = u.trust >= 3 ? new Date(Date.parse(createdAt) + 3 * DAY).toISOString() : null;
      const paymentVerifiedAt = u.trust >= 3 ? new Date(Date.parse(createdAt) + 3 * DAY).toISOString() : null;
      q.run(
        `INSERT INTO users (id, email, password_hash, name, role, trust_level, locale, campus_id, bio, avatar_upload_id, phone, phone_verified_at,
           email_verified_at, edu_email, id_verified_at, payment_verified_at, wechat_id, gender, grad_year, program, languages_json, referral_code,
           verified_only_messaging, listing_quota, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, trust_level=excluded.trust_level, locale=excluded.locale,
           campus_id=excluded.campus_id, bio=excluded.bio, avatar_upload_id=excluded.avatar_upload_id, phone=excluded.phone,
           phone_verified_at=excluded.phone_verified_at, email_verified_at=excluded.email_verified_at, edu_email=excluded.edu_email,
           id_verified_at=excluded.id_verified_at, payment_verified_at=excluded.payment_verified_at, wechat_id=excluded.wechat_id,
           gender=excluded.gender, grad_year=excluded.grad_year, program=excluded.program, languages_json=excluded.languages_json,
           verified_only_messaging=excluded.verified_only_messaging, listing_quota=excluded.listing_quota, updated_at=excluded.updated_at`,
        [
          id, u.email.toLowerCase(), hash, u.name, u.role ?? 'student', u.trust, u.locale ?? 'zh-CN', u.campus, u.bio ?? null, avatarId,
          u.phone ?? null, phoneVerifiedAt, emailVerifiedAt, eduEmail, idVerifiedAt, paymentVerifiedAt, u.wechat ?? null, u.gender ?? null,
          u.gradYear ?? null, u.program ?? null, JSON.stringify(u.languages ?? ['zh', 'en']), seedReferral(u.email), u.verifiedOnly ? 1 : 0,
          u.listingQuota ?? 2, new Date(nowMs() - Math.min(u.daysAgo ?? 1, 3) * 3_600_000).toISOString(), createdAt, t,
        ],
      );
    }

    // a few notifications for alice (idempotent: delete seed-tagged ones first)
    const alice = seedUserId('alice@u.northwestern.edu');
    q.run("DELETE FROM notifications WHERE user_id = ? AND json_extract(data_json, '$.seed') = 1", [alice]);
    const notes: { kind: string; title: string; body: string; link: string; hoursAgo: number; read: boolean }[] = [
      { kind: 'system', title: '欢迎来到安窝 👋', body: '完成学生身份验证即可发布房源、联系房东。', link: '/verify', hoursAgo: 72, read: true },
      { kind: 'verify.approved', title: '学生证验证已通过', body: '你的信任等级提升到 L2，房源将显示「已验证」标识。', link: '/verify', hoursAgo: 48, read: true },
      { kind: 'match.new', title: '有新的匹配房源', body: '「Davis St 附近 1B1B 转租」与你的求租匹配度 82。', link: '/wanted', hoursAgo: 20, read: false },
      { kind: 'buddy.join', title: '有人加入了你的搭子', body: '吴思源 加入了「周六 Costco 拼车」。', link: '/buddy', hoursAgo: 6, read: false },
      { kind: 'digest', title: '今日摘要：3 条新匹配，1 个心愿单降价', body: '点开查看今天的新房源与降价提醒。', link: '/notifications', hoursAgo: 2, read: false },
    ];
    for (const n of notes) {
      const createdAt = new Date(nowMs() - n.hoursAgo * 3_600_000).toISOString();
      q.run('INSERT INTO notifications (id, user_id, kind, title, body, link, data_json, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        `${sha256('notif:' + alice + n.kind + n.hoursAgo).slice(0, 8)}-seed-4000-a000-${sha256(n.title).slice(0, 12)}`, alice, n.kind, n.title, n.body, n.link,
        JSON.stringify({ seed: 1 }), n.read ? createdAt : null, createdAt,
      ]);
    }
  });
}
