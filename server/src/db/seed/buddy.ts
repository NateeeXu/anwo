// server/src/db/seed/buddy.ts — OWNED BY THE `buddy` MODULE AGENT.
// 50 buddy posts across Northwestern (30), UIUC, NYU and USC: airport pickups with flight times, carpools, roommate
// searches, study groups, gym, dinners, weekend trips and events — bilingual, with members, pending requests, weekly
// occurrences and group chats. Dates are relative to "now" in the campus timezone so the calendar always looks alive.
import type { DatabaseSync } from 'node:sqlite';
import { q, uid } from '../index';
import { nowIso, nowMs, DAY, HOUR } from '../../lib/time';
import { insertSeedUpload } from '../../lib/uploads';
import { getCampus } from '../../lib/campuses';
import { addMembers, openConversation, postContextCard, postMessage, contextCardFor } from '../../lib/conversations';
import { notify } from '../../lib/notify';
import { sha256 } from '../../lib/ids';

export const version = 4;

type MemberSpec = string | { email: string; status?: 'joined' | 'pending' | 'left' | 'declined'; note?: string; daysAgo?: number };
/** days from today | next weekday (0 = Sun) + weeks | absolute campus-local date */
type DaySpec = number | { dow: number; weeks?: number } | { date: string };
const W = (dow: number, weeks = 0): DaySpec => ({ dow, weeks });
type EventSpec = { day: DaySpec; time: string; durH?: number; loc?: string };
type PostSpec = {
  key: string;
  campus: 'northwestern' | 'uiuc' | 'nyu' | 'usc';
  host: string;
  type: 'airport_pickup' | 'carpool' | 'roommate' | 'study' | 'gym' | 'dining' | 'travel' | 'costco_run' | 'event' | 'other';
  title: string;
  zh: string;
  en: string;
  /** days from today (campus-local), next weekday, or absolute date; omit for no fixed time */
  day?: DaySpec;
  /** HH:MM campus-local */
  time?: string;
  durH?: number;
  allDay?: boolean;
  loc?: string;
  lat?: number;
  lng?: number;
  dest?: string;
  dlat?: number;
  dlng?: number;
  langs?: string[];
  max?: number;
  verifiedOnly?: boolean;
  minTrust?: 0 | 1 | 2 | 3;
  approval?: boolean;
  cost?: number;
  members?: MemberSpec[];
  events?: EventSpec[];
  status?: 'open' | 'full' | 'closed' | 'cancelled' | 'expired';
  createdDaysAgo?: number;
  views?: number;
  chat?: { from: string; body: string }[];
};

// ---------------------------------------------------------------- places
const NU = { lat: 42.0565, lng: -87.6753 };
const ORD_T5 = { name: "ORD 国际到达 Terminal 5", lat: 41.9802, lng: -87.897 };
const ORD_T1 = { name: 'ORD Terminal 1', lat: 41.9773, lng: -87.9024 };
const MDW = { name: 'Midway (MDW) 到达层', lat: 41.7868, lng: -87.7522 };
const NORRIS = { name: 'Norris University Center', lat: 42.0533, lng: -87.6727 };
const NU_LIB = { name: 'Main Library 2 楼', lat: 42.0533, lng: -87.6744 };
const SPAC = { name: 'Henry Crown Sports Pavilion (SPAC)', lat: 42.0605, lng: -87.673 };
const DAVIS = { name: 'Davis St 站', lat: 42.0466, lng: -87.6798 };
const COSTCO_GLENVIEW = { name: 'Costco Glenview', lat: 42.0808, lng: -87.8216 };
const MITSUWA = { name: 'Mitsuwa Marketplace (Arlington Heights)', lat: 42.0817, lng: -87.9838 };
const HMART_NILES = { name: 'H Mart Niles', lat: 42.0303, lng: -87.8143 };
const CHINATOWN = { name: '芝加哥 Chinatown（Wentworth Ave）', lat: 41.8527, lng: -87.632 };
const TECH = { name: 'Tech Institute L 楼', lat: 42.0577, lng: -87.6761 };
const LAOSZECHUAN = { name: 'Lao Sze Chuan Evanston', lat: 42.0472, lng: -87.6808 };
const STARVED_ROCK = { name: 'Starved Rock State Park', lat: 41.3195, lng: -88.9942 };
const MILLENNIUM = { name: 'Millennium Park', lat: 41.8826, lng: -87.6226 };
const ALLISON = { name: 'Allison Dining Hall', lat: 42.0523, lng: -87.6786 };
const KELLOGG = { name: 'Kellogg Global Hub', lat: 42.0566, lng: -87.6721 };
const CLARK_BEACH = { name: 'Clark Street Beach', lat: 42.0513, lng: -87.671 };
const TARGET_EV = { name: 'Target Evanston', lat: 42.0458, lng: -87.6811 };

const UIUC = { lat: 40.102, lng: -88.2272 };
const CMI = { name: 'Willard Airport (CMI)', lat: 40.0392, lng: -88.2781 };
const GRAINGER = { name: 'Grainger Library 4 楼', lat: 40.1125, lng: -88.2269 };
const ARC = { name: 'ARC（Activities and Recreation Center）', lat: 40.1013, lng: -88.2362 };
const COSTCO_CHAMPAIGN = { name: 'Costco Champaign', lat: 40.1402, lng: -88.258 };
const GREEN_ST = { name: 'Green St · Illini Union', lat: 40.1092, lng: -88.2272 };
const SIEBEL = { name: 'Siebel Center 1 楼', lat: 40.1138, lng: -88.2249 };

const NYU = { lat: 40.7295, lng: -73.9965 };
const JFK_T4 = { name: 'JFK Terminal 4 到达层', lat: 40.6413, lng: -73.7781 };
const LGA = { name: 'LaGuardia Terminal B', lat: 40.7769, lng: -73.874 };
const BOBST = { name: 'Bobst Library LL1', lat: 40.7295, lng: -73.9972 };
const FLUSHING = { name: 'Flushing · Main St', lat: 40.759, lng: -73.83 };
const COSTCO_BK = { name: 'Costco Sunset Park (Brooklyn)', lat: 40.6553, lng: -74.0068 };
const PALLADIUM = { name: 'Palladium Athletic Facility', lat: 40.7325, lng: -73.988 };
const WSP = { name: 'Washington Square Park 喷泉', lat: 40.7308, lng: -73.9973 };
const KIMLAU = { name: 'Chinatown · Mott St', lat: 40.7158, lng: -73.9971 };

const USC = { lat: 34.0224, lng: -118.2851 };
const LAX_TBIT = { name: 'LAX Tom Bradley 国际航站楼', lat: 33.9416, lng: -118.4085 };
const LEAVEY = { name: 'Leavey Library 2 楼', lat: 34.0217, lng: -118.283 };
const LYON = { name: 'Lyon Center', lat: 34.0244, lng: -118.2887 };
const COSTCO_LA = { name: 'Costco Los Feliz', lat: 34.1047, lng: -118.292 };
const RANCH99 = { name: '99 Ranch San Gabriel', lat: 34.0953, lng: -118.087 };
const RUNYON = { name: 'Runyon Canyon 入口', lat: 34.1125, lng: -118.3485 };
const JOSHUA = { name: 'Joshua Tree National Park', lat: 33.8734, lng: -115.901 };
const USC_VILLAGE = { name: 'USC Village Target 门口', lat: 34.0254, lng: -118.2852 };

// ---------------------------------------------------------------- posts
const POSTS: PostSpec[] = [
  // ---------------- Northwestern (30)
  {
    key: 'nu-ord-ua851', campus: 'northwestern', host: 'siyuan.wu@u.northwestern.edu', type: 'airport_pickup',
    title: 'ORD 接机 · UA 851 北京→芝加哥 14:35 落地',
    zh: '周四 UA 851 从北京直飞，预计 14:35 落地 T5。我开车（RAV4，后备箱能放两个 28 寸箱子），顺路回 Evanston，可以接 2 位同学。油费分摊，到了再给。',
    en: 'UA 851 from Beijing lands at Terminal 5 around 14:35 on Thursday. I drive a RAV4 (room for two 28" suitcases) and am heading back to Evanston — two seats available. Gas split after arrival.',
    day: W(4), time: '14:35', durH: 3, loc: ORD_T5.name, lat: ORD_T5.lat, lng: ORD_T5.lng, dest: 'Evanston · Davis St', dlat: DAVIS.lat, dlng: DAVIS.lng,
    langs: ['zh', 'en'], max: 3, verifiedOnly: true, minTrust: 1, cost: 2000, members: ['yiran.feng@u.northwestern.edu'], createdDaysAgo: 6, views: 148,
    chat: [{ from: 'yiran.feng@u.northwestern.edu', body: '我是 CA 985 转 UA 的，14:20 到，应该能赶上！' }, { from: 'siyuan.wu@u.northwestern.edu', body: '没问题，到了在 T5 出口 Door 5E 等我，我发车牌给你。' }],
  },
  {
    key: 'nu-ord-ca987', campus: 'northwestern', host: 'yuting.chen@u.northwestern.edu', type: 'airport_pickup',
    title: 'ORD 接机 · CA 987 上海→芝加哥 周六 16:10',
    zh: '周六 CA 987 浦东出发，16:10 落地 T5。Kellogg 同学接新生，Uber XL 拼车回 Evanston，每人约 $25。先到的在 Starbucks 等。',
    en: 'CA 987 from Shanghai lands at T5 at 16:10 on Saturday. Sharing an Uber XL back to Evanston, roughly $25 each. Meet at the Starbucks in arrivals.',
    day: W(6), time: '16:10', durH: 3, loc: ORD_T5.name, lat: ORD_T5.lat, lng: ORD_T5.lng, dest: 'Evanston', dlat: NU.lat, dlng: NU.lng,
    langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 1, approval: true, cost: 2500,
    members: ['mengyao.xu@u.northwestern.edu', { email: 'tianyi.zhao@u.northwestern.edu', status: 'pending', note: '我也是这班，一个 24 寸箱子。' }], createdDaysAgo: 4, views: 93,
  },
  {
    key: 'nu-mdw-sw', campus: 'northwestern', host: 'zihao.guo@u.northwestern.edu', type: 'airport_pickup',
    title: 'Midway 接机 · 西南航空 WN 1422 21:05 到',
    zh: '周日晚从 Austin 飞回来的西南 WN 1422，21:05 落地 Midway。想找同航班或前后半小时的同学一起打车回 Evanston，深夜 Uber 一个人太贵。',
    en: 'Southwest WN 1422 from Austin lands at Midway 21:05 Sunday. Looking for anyone on a flight within 30 minutes to share a ride to Evanston.',
    day: W(0), time: '21:05', durH: 2, loc: MDW.name, lat: MDW.lat, lng: MDW.lng, dest: 'Evanston', dlat: NU.lat, dlng: NU.lng, langs: ['zh', 'en'], max: 4, cost: 2200, members: ['leo.ma@u.northwestern.edu'], createdDaysAgo: 2, views: 41,
  },
  {
    key: 'nu-ord-winter', campus: 'northwestern', host: 'alice@u.northwestern.edu', type: 'airport_pickup',
    title: '寒假回国 · 12 月 ORD 送机拼车（CA 988 / MU 718）',
    zh: '12 月中旬期末结束回国，CA 988 和 MU 718 都是中午出发。我家在 Sherman Ave，叫一辆 Uber XL 一起去 T5，可以放 4 个大箱子。',
    en: 'Flying home mid-December after finals (CA 988 / MU 718 both leave around noon). Sharing an Uber XL from Sherman Ave to T5 — room for four large suitcases.',
    day: 41, time: '09:30', durH: 3, loc: 'Sherman Ave & Davis St', lat: 42.0474, lng: -87.6815, dest: ORD_T5.name, dlat: ORD_T5.lat, dlng: ORD_T5.lng,
    langs: ['zh'], max: 4, verifiedOnly: true, minTrust: 1, cost: 1800, members: ['wenjun.liu@u.northwestern.edu'], createdDaysAgo: 1, views: 27,
  },
  {
    key: 'nu-ord-t1', campus: 'northwestern', host: 'ruoxi.sun@u.northwestern.edu', type: 'airport_pickup',
    title: 'ORD T1 接机 · UA 2201 旧金山→芝加哥 18:40',
    zh: '从 SFO 回来的 UA 2201，18:40 到 T1。有车位可以多接一位，顺路送到 Evanston 任何地方。',
    en: 'UA 2201 from SFO lands at T1 at 18:40. One spare seat, happy to drop you anywhere in Evanston.',
    day: 9, time: '18:40', durH: 2, loc: ORD_T1.name, lat: ORD_T1.lat, lng: ORD_T1.lng, dest: 'Evanston', dlat: NU.lat, dlng: NU.lng, langs: ['zh', 'en'], max: 2, verifiedOnly: true, minTrust: 2, cost: 1500, createdDaysAgo: 3, views: 36,
  },
  {
    key: 'nu-costco-sat', campus: 'northwestern', host: 'zihao.guo@u.northwestern.edu', type: 'costco_run',
    title: '周六 Costco Glenview 拼车 · 10:00 出发',
    zh: '每周六上午的 Costco 车，Tech 门口 10:00 集合，买完 12:30 左右回来。有后备箱，大米、水、纸巾随便囤。油费每人 $5。',
    en: 'The usual Saturday Costco run: meet outside Tech at 10:00, back around 12:30. Big trunk for rice, water and paper towels. $5 each for gas.',
    day: W(6), time: '10:00', durH: 2.5, loc: TECH.name, lat: TECH.lat, lng: TECH.lng, dest: COSTCO_GLENVIEW.name, dlat: COSTCO_GLENVIEW.lat, dlng: COSTCO_GLENVIEW.lng,
    langs: ['zh', 'en'], max: 4, cost: 500, members: ['alice@u.northwestern.edu', 'haoran.zhang@u.northwestern.edu'], createdDaysAgo: 5, views: 212,
    events: [{ day: W(6), time: '10:00', durH: 2.5 }, { day: W(6, 1), time: '10:00', durH: 2.5 }, { day: W(6, 2), time: '10:00', durH: 2.5 }],
    chat: [{ from: 'alice@u.northwestern.edu', body: '我要买一箱气泡水，后备箱还放得下吗？' }, { from: 'zihao.guo@u.northwestern.edu', body: '放得下，后排座位也能放。' }],
  },
  {
    key: 'nu-mitsuwa', campus: 'northwestern', host: 'kai.tanaka@u.northwestern.edu', type: 'carpool',
    title: 'Mitsuwa 日超拼车 · 周日下午',
    zh: '周日下午去 Arlington Heights 的 Mitsuwa 买食材和拉面，顺便吃 food court。车上还有 3 个位置，14:00 Noyes 站出发。',
    en: 'Sunday afternoon trip to Mitsuwa in Arlington Heights for groceries and ramen at the food court. Three seats left, leaving Noyes station at 14:00.',
    day: W(0), time: '14:00', durH: 3.5, loc: 'Noyes 站', lat: 42.0583, lng: -87.6836, dest: MITSUWA.name, dlat: MITSUWA.lat, dlng: MITSUWA.lng, langs: ['en', 'ja', 'zh'], max: 4, cost: 600, members: ['minjae.park@u.northwestern.edu'], createdDaysAgo: 3, views: 64,
  },
  {
    key: 'nu-hmart', campus: 'northwestern', host: 'minjae.park@u.northwestern.edu', type: 'carpool',
    title: 'H Mart Niles 周三晚拼车',
    zh: '周三晚 18:30 去 H Mart Niles 囤泡菜和韩国零食，大概 1 小时。Davis 站集合，油费 AA。',
    en: 'Wednesday 18:30 run to H Mart Niles for kimchi and snacks, about an hour. Meet at Davis station, split gas.',
    day: W(3), time: '18:30', durH: 1.5, loc: DAVIS.name, lat: DAVIS.lat, lng: DAVIS.lng, dest: HMART_NILES.name, dlat: HMART_NILES.lat, dlng: HMART_NILES.lng, langs: ['ko', 'en', 'zh'], max: 4, cost: 400, members: ['daniel.kim@u.northwestern.edu', 'sophia.wang@u.northwestern.edu'], createdDaysAgo: 2, views: 58,
  },
  {
    key: 'nu-chinatown', campus: 'northwestern', host: 'mengyao.xu@u.northwestern.edu', type: 'carpool',
    title: '周六去 Chinatown 吃早茶 + 买菜',
    zh: '周六上午坐 Purple Line 转 Red Line 去 Chinatown 吃早茶（MingHin），顺便去 Richwell 买调料。11:00 Davis 站集合，拼桌人多点菜多。',
    en: 'Saturday dim sum at MingHin in Chinatown via the Purple + Red Line, then groceries at Richwell Market. Meet at Davis station at 11:00 — more people, more dishes.',
    day: W(6, 1), time: '11:00', durH: 4, loc: DAVIS.name, lat: DAVIS.lat, lng: DAVIS.lng, dest: CHINATOWN.name, dlat: CHINATOWN.lat, dlng: CHINATOWN.lng, langs: ['zh'], max: 6, cost: 3000, members: ['jiaqi.huang@u.northwestern.edu', 'xinyi.lin@u.northwestern.edu', 'grace.hu@u.northwestern.edu'], createdDaysAgo: 2, views: 120,
  },
  {
    key: 'nu-roommate-grace', campus: 'northwestern', host: 'grace.hu@u.northwestern.edu', type: 'roommate',
    title: '找 1 位女生室友 · 1 月起合租 Ridge Ave 2B1B',
    zh: '1 月起 Ridge Ave 2B1B 合租，整租 $2,100，一人一半，带洗衣机。我作息规律，不养宠物，希望找同样爱干净的女生。先聊聊再约看房。',
    en: 'Looking for one female roommate for a 2B1B on Ridge Ave from January. $2,100 total, split evenly, in-unit laundry. I keep regular hours, no pets. Chat first, then tour together.',
    loc: 'Ridge Ave & Dempster St', lat: 42.0416, lng: -87.6943, langs: ['zh', 'en'], max: 2, verifiedOnly: true, minTrust: 1, approval: true, members: [{ email: 'yiran.feng@u.northwestern.edu', status: 'pending', note: '我也是 1 月起找房，统计系女生，作息早。' }], createdDaysAgo: 8, views: 176,
  },
  {
    key: 'nu-roommate-haoran', campus: 'northwestern', host: 'haoran.zhang@u.northwestern.edu', type: 'roommate',
    title: '两人找第三位室友 · Maple Ave 3B2B 暑期前',
    zh: '我和朋友租了 Maple Ave 的 3B2B，还差一间主卧（带独卫）$950/月。我们俩都是 MS Analytics，周末打球，平时安静。男女不限。',
    en: 'Two of us have a 3B2B on Maple Ave and need a third for the master bedroom (private bath), $950/mo. Both MS Analytics, basketball on weekends, quiet otherwise. Any gender.',
    loc: 'Maple Ave & Church St', lat: 42.0485, lng: -87.6845, langs: ['zh', 'en'], max: 3, approval: true, members: ['leo.ma@u.northwestern.edu'], createdDaysAgo: 12, views: 203,
  },
  {
    key: 'nu-roommate-minjae', campus: 'northwestern', host: 'minjae.park@u.northwestern.edu', type: 'roommate',
    title: 'Roommate wanted near Noyes · move-in anytime',
    zh: 'Noyes 站附近 2B1B，一间空房 $880/月，水电平摊。我是 MSIS，韩语/英语，希望室友不吸烟。',
    en: '2B1B near Noyes station, one room open at $880/mo plus split utilities. MSIS student, Korean/English, non-smoker preferred.',
    loc: 'Noyes St & Sherman Ave', lat: 42.0582, lng: -87.6825, langs: ['en', 'ko'], max: 2, approval: true, createdDaysAgo: 15, views: 88,
  },
  {
    key: 'nu-study-cs336', campus: 'northwestern', host: 'daniel.kim@u.northwestern.edu', type: 'study',
    title: 'CS 336 算法 · 周二周四晚自习小组',
    zh: '每周二、周四 19:00 在 Main Library 2 楼小组间刷 CS 336 的作业，互相讲题。欢迎同课的同学，不限年级。',
    en: 'CS 336 problem sets every Tuesday and Thursday at 19:00, group room on Main Library 2F. Explain, argue, repeat. Anyone in the class is welcome.',
    day: W(2), time: '19:00', durH: 2.5, loc: NU_LIB.name, lat: NU_LIB.lat, lng: NU_LIB.lng, langs: ['en', 'zh', 'ko'], max: 6,
    members: ['tianyi.zhao@u.northwestern.edu', 'kai.tanaka@u.northwestern.edu'], createdDaysAgo: 20, views: 310,
    events: [{ day: W(2), time: '19:00', durH: 2.5 }, { day: W(4), time: '19:00', durH: 2.5 }, { day: W(2, 1), time: '19:00', durH: 2.5 }, { day: W(4, 1), time: '19:00', durH: 2.5 }, { day: W(2, 2), time: '19:00', durH: 2.5 }, { day: W(4, 2), time: '19:00', durH: 2.5 }],
    chat: [{ from: 'daniel.kim@u.northwestern.edu', body: 'This week: DP + amortized analysis. Bring questions from PS4.' }],
  },
  {
    key: 'nu-study-gre', campus: 'northwestern', host: 'tianyi.zhao@u.northwestern.edu', type: 'study',
    title: 'GRE 背单词打卡 · 每天早上 8 点 Norris',
    zh: '工作日每天早上 8:00 在 Norris 一楼咖啡区背单词一小时，互相抽查。坚持到 12 月考试。来的人多就换二楼。',
    en: 'Weekday GRE vocab at 8:00 in the Norris ground-floor café, one hour, quiz each other. Running until the December test date.',
    day: W(1), time: '08:00', durH: 1, loc: NORRIS.name, lat: NORRIS.lat, lng: NORRIS.lng, langs: ['zh'], max: 8, minTrust: 0,
    members: ['yiran.feng@u.northwestern.edu', 'ethan.luo@u.northwestern.edu'], createdDaysAgo: 9, views: 97,
    events: [1, 2, 3, 4, 5].flatMap((d) => [{ day: W(d), time: '08:00', durH: 1 }, { day: W(d, 1), time: '08:00', durH: 1 }]),
  },
  {
    key: 'nu-study-kellogg', campus: 'northwestern', host: 'nina.zhou@u.northwestern.edu', type: 'study',
    title: 'Kellogg 案例讨论组 · 周日下午 Global Hub',
    zh: '周日 14:00 Global Hub 3 楼讨论下周的 case，提前一天在群里分工。偏好同 section 的同学。',
    en: 'Sunday 14:00 case prep on Global Hub 3F for next week\'s classes; we split the work in the group chat a day ahead. Same-section classmates preferred.',
    day: W(0), time: '14:00', durH: 3, loc: KELLOGG.name, lat: KELLOGG.lat, lng: KELLOGG.lng, langs: ['en', 'zh'], max: 5, verifiedOnly: true, minTrust: 2, approval: true,
    members: ['yuting.chen@u.northwestern.edu', 'ruoxi.sun@u.northwestern.edu'], createdDaysAgo: 7, views: 54,
    events: [{ day: W(0), time: '14:00', durH: 3 }, { day: W(0, 1), time: '14:00', durH: 3 }],
  },
  {
    key: 'nu-gym-spac', campus: 'northwestern', host: 'sophia.wang@u.northwestern.edu', type: 'gym',
    title: 'SPAC 力量训练搭子 · 一三五早 7 点',
    zh: '一三五早上 7:00 SPAC 二楼器械区，练 1 小时，互相保护和督促。新手也欢迎，我可以带动作。',
    en: 'Mon/Wed/Fri 7:00 strength sessions on SPAC 2F, one hour, spotting each other. Beginners welcome — I can walk you through the lifts.',
    day: W(1), time: '07:00', durH: 1, loc: SPAC.name, lat: SPAC.lat, lng: SPAC.lng, langs: ['zh', 'en'], max: 4,
    members: ['alice@u.northwestern.edu', 'chloe.deng@u.northwestern.edu'], createdDaysAgo: 14, views: 143,
    events: [1, 3, 5].flatMap((d) => [{ day: W(d), time: '07:00', durH: 1 }, { day: W(d, 1), time: '07:00', durH: 1 }]),
    chat: [{ from: 'sophia.wang@u.northwestern.edu', body: '明早练背，带好腕带～' }, { from: 'alice@u.northwestern.edu', body: '收到，我 6:50 到。' }],
  },
  {
    key: 'nu-run-lakefill', campus: 'northwestern', host: 'boyang.he@u.northwestern.edu', type: 'gym',
    title: 'Lakefill 晨跑 5K · 周六 8:00',
    zh: '周六早上 8:00 从 Clark Street Beach 出发沿湖跑 5K，配速 6 分左右，跑完一起去 Norris 吃早餐。',
    en: 'Saturday 8:00 lakefill 5K from Clark Street Beach, easy 6:00/km pace, breakfast at Norris afterwards.',
    day: W(6), time: '08:00', durH: 1.5, loc: CLARK_BEACH.name, lat: CLARK_BEACH.lat, lng: CLARK_BEACH.lng, langs: ['zh', 'en'], max: 8, minTrust: 0, members: ['haoran.zhang@u.northwestern.edu', 'ethan.luo@u.northwestern.edu'], createdDaysAgo: 3, views: 71,
  },
  {
    key: 'nu-basketball', campus: 'northwestern', host: 'haoran.zhang@u.northwestern.edu', type: 'gym',
    title: '周末篮球 · Blomquist 三对三',
    zh: '周日下午 15:00 Blomquist 打三对三，缺两个人。水平不限，开心就好。',
    en: 'Sunday 15:00 pickup 3v3 at Blomquist, two spots open. Any level, just for fun.',
    day: W(0), time: '15:00', durH: 2, loc: 'Blomquist Recreation Center', lat: 42.0553, lng: -87.6792, langs: ['zh', 'en'], max: 6, minTrust: 0, members: ['daniel.kim@u.northwestern.edu', 'zihao.guo@u.northwestern.edu', 'leo.ma@u.northwestern.edu'], createdDaysAgo: 1, views: 44,
  },
  {
    key: 'nu-dinner-hotpot', campus: 'northwestern', host: 'jiaqi.huang@u.northwestern.edu', type: 'dining',
    title: '周五晚火锅局 · Lao Sze Chuan',
    zh: '周五 18:30 Lao Sze Chuan 吃火锅，人多可以点双拼锅。AA，大概每人 $30。想认识新朋友的来。',
    en: 'Friday 18:30 hot pot at Lao Sze Chuan — enough people for a split pot. Dutch, about $30 each. Come meet new people.',
    day: W(5), time: '18:30', durH: 2.5, loc: LAOSZECHUAN.name, lat: LAOSZECHUAN.lat, lng: LAOSZECHUAN.lng, langs: ['zh', 'en'], max: 8, cost: 3000, members: ['mengyao.xu@u.northwestern.edu', 'xinyi.lin@u.northwestern.edu', 'bob@u.northwestern.edu', 'grace.hu@u.northwestern.edu'], createdDaysAgo: 2, views: 166,
  },
  {
    key: 'nu-brunch', campus: 'northwestern', host: 'chloe.deng@u.northwestern.edu', type: 'dining',
    title: '周日 brunch · Le Peep Evanston',
    zh: '周日 10:30 Le Peep 吃 brunch，聊聊实习和找房。4 人小桌，先到先得。',
    en: 'Sunday 10:30 brunch at Le Peep, internship and housing chat. Table for four, first come first served.',
    day: W(0), time: '10:30', durH: 1.5, loc: 'Le Peep Evanston', lat: 42.0467, lng: -87.6793, langs: ['zh', 'en'], max: 4, cost: 2000, members: ['sophia.wang@u.northwestern.edu', 'jiaqi.huang@u.northwestern.edu', 'alice@u.northwestern.edu'], status: 'full', createdDaysAgo: 2, views: 52,
  },
  {
    key: 'nu-thanksgiving', campus: 'northwestern', host: 'xinyi.lin@u.northwestern.edu', type: 'dining',
    title: '感恩节留校聚餐 · 一起做火鸡',
    zh: '感恩节不回家的同学一起做饭，我家在 Hinman Ave，有烤箱。每人带一个菜，火鸡我负责。下午 16:00 开始准备。',
    en: 'Thanksgiving potluck for everyone staying on campus. My place on Hinman Ave has an oven — I handle the turkey, bring one dish each. Prep starts 16:00.',
    day: { date: '2026-11-26' }, time: '16:00', durH: 5, loc: 'Hinman Ave（具体地址群里发）', lat: 42.0497, lng: -87.6753, langs: ['zh', 'en'], max: 10, verifiedOnly: true, minTrust: 1, approval: true, cost: 1500,
    members: ['wenjun.liu@u.northwestern.edu', 'boyang.he@u.northwestern.edu', 'mengyao.xu@u.northwestern.edu', { email: 'kai.tanaka@u.northwestern.edu', status: 'pending', note: 'Can bring Japanese curry and help with dishes!' }], createdDaysAgo: 5, views: 231,
  },
  {
    key: 'nu-starved-rock', campus: 'northwestern', host: 'alice@u.northwestern.edu', type: 'travel',
    title: 'Starved Rock 徒步一日游 · 周六',
    zh: '周六开车去 Starved Rock 看峡谷和瀑布，早上 7:30 出发，傍晚回来。我有车，油费和停车费平摊，带好水和零食。',
    en: 'Saturday day trip to Starved Rock for the canyons and waterfalls. Leaving 7:30, back by evening. I drive; split gas and parking, bring water and snacks.',
    day: W(6, 1), time: '07:30', durH: 11, loc: 'Sherman Ave & Davis St', lat: 42.0474, lng: -87.6815, dest: STARVED_ROCK.name, dlat: STARVED_ROCK.lat, dlng: STARVED_ROCK.lng, langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 1, cost: 1500,
    members: ['wenjun.liu@u.northwestern.edu', 'siyuan.wu@u.northwestern.edu'], createdDaysAgo: 4, views: 188,
    chat: [{ from: 'wenjun.liu@u.northwestern.edu', body: '那天天气预报 8 度，记得穿防滑的鞋。' }],
  },
  {
    key: 'nu-chicago-museum', campus: 'northwestern', host: 'mengyao.xu@u.northwestern.edu', type: 'travel',
    title: '周日去 Art Institute 看展 + Millennium Park',
    zh: '周日 11:00 坐 Purple Line 去市区，先看 Art Institute（学生票），下午 Millennium Park 拍照。晚饭看大家心情。',
    en: 'Sunday 11:00 Purple Line downtown: Art Institute (student tickets) then photos at Millennium Park. Dinner wherever the group feels like.',
    day: W(0, 1), time: '11:00', durH: 7, loc: DAVIS.name, lat: DAVIS.lat, lng: DAVIS.lng, dest: MILLENNIUM.name, dlat: MILLENNIUM.lat, dlng: MILLENNIUM.lng, langs: ['zh', 'en'], max: 6, cost: 2500, members: ['jiaqi.huang@u.northwestern.edu'], createdDaysAgo: 1, views: 39,
  },
  {
    key: 'nu-chunwan', campus: 'northwestern', host: 'ruoxi.sun@u.northwestern.edu', type: 'event',
    title: '2027 西北春晚 · 志愿者与观众群',
    zh: '2 月 6 日除夕晚 CSSA 春晚在 Cahn Auditorium，需要 10 位志愿者（签到、后台、摄影）。观众也可以加群抢前排票。',
    en: 'CSSA Spring Festival Gala on Lunar New Year\'s Eve (Feb 6) at Cahn Auditorium. Need 10 volunteers (check-in, backstage, photo). Audience members can join for early tickets.',
    day: { date: '2027-02-06' }, time: '18:00', durH: 4, loc: 'Cahn Auditorium', lat: 42.0501, lng: -87.6799, langs: ['zh', 'en'], max: 30, minTrust: 0, members: ['alice@u.northwestern.edu', 'tianyi.zhao@u.northwestern.edu', 'yiran.feng@u.northwestern.edu', 'ethan.luo@u.northwestern.edu', 'leo.ma@u.northwestern.edu'], createdDaysAgo: 10, views: 402,
  },
  {
    key: 'nu-career-fair', campus: 'northwestern', host: 'bob@u.northwestern.edu', type: 'event',
    title: 'MEM 秋季招聘会一起去 · 互相改简历',
    zh: '下周四 13:00 Norris 招聘会，前一天晚上一起过一遍简历和 elevator pitch。有 2025 拿到 offer 的学长会来分享。',
    en: 'MEM career fair next Thursday 13:00 at Norris. We\'ll review resumes and elevator pitches the night before, with a 2025 grad who landed an offer.',
    day: W(4, 1), time: '13:00', durH: 3, loc: NORRIS.name, lat: NORRIS.lat, lng: NORRIS.lng, langs: ['zh', 'en'], max: 12, members: ['haoran.zhang@u.northwestern.edu', 'leo.ma@u.northwestern.edu', 'sophia.wang@u.northwestern.edu'], createdDaysAgo: 3, views: 97,
    events: [{ day: W(3, 1), time: '20:00', durH: 2, loc: 'Main Library 小组间' }, { day: W(4, 1), time: '13:00', durH: 3 }],
  },
  {
    key: 'nu-black-friday', campus: 'northwestern', host: 'siyuan.wu@u.northwestern.edu', type: 'costco_run',
    title: 'Black Friday Costco + Best Buy 扫货车',
    zh: '黑五早上 7:00 出发，先 Costco Glenview 再 Best Buy Skokie，买完直接送回宿舍。后备箱大，显示器、吸尘器都能放。',
    en: 'Black Friday run: leaving 7:00, Costco Glenview first then Best Buy Skokie, straight back to campus. Big trunk — monitors and vacuums fit.',
    day: { date: '2026-11-27' }, time: '07:00', durH: 4, loc: TECH.name, lat: TECH.lat, lng: TECH.lng, dest: COSTCO_GLENVIEW.name, dlat: COSTCO_GLENVIEW.lat, dlng: COSTCO_GLENVIEW.lng, langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 1, cost: 800, members: ['zihao.guo@u.northwestern.edu'], createdDaysAgo: 1, views: 61,
  },
  {
    key: 'nu-target', campus: 'northwestern', host: 'ethan.luo@u.northwestern.edu', type: 'other',
    title: '新生一起去 Target 买宿舍用品',
    zh: '明天下午 15:00 Davis 站集合走路去 Target，买被子台灯收纳箱，顺便办 Target Circle。新生互相认识一下。',
    en: 'Tomorrow 15:00, meet at Davis station and walk to Target for bedding, lamps and bins. First-years meet first-years.',
    day: 1, time: '15:00', durH: 2, loc: DAVIS.name, lat: DAVIS.lat, lng: DAVIS.lng, dest: TARGET_EV.name, dlat: TARGET_EV.lat, dlng: TARGET_EV.lng, langs: ['zh'], max: 6, minTrust: 0, members: ['tianyi.zhao@u.northwestern.edu'], createdDaysAgo: 0, views: 12,
  },
  {
    key: 'nu-orientation', campus: 'northwestern', host: 'yuting.chen@u.northwestern.edu', type: 'event',
    title: '9 月迎新 · Lakefill 野餐 + 校园导览',
    zh: '开学迎新野餐，老生带新生逛校园，讲选课、办卡、买保险的坑。已结束，感谢大家。',
    en: 'Welcome picnic on the lakefill with a campus tour and tips on classes, IDs and insurance. Wrapped up — thanks everyone.',
    day: -48, time: '12:00', durH: 3, loc: 'Lakefill', lat: 42.0538, lng: -87.6705, langs: ['zh', 'en'], max: 40, minTrust: 0, status: 'closed',
    members: ['alice@u.northwestern.edu', 'bob@u.northwestern.edu', 'tianyi.zhao@u.northwestern.edu', 'yiran.feng@u.northwestern.edu', 'ethan.luo@u.northwestern.edu', 'grace.hu@u.northwestern.edu', 'daniel.kim@u.northwestern.edu'], createdDaysAgo: 70, views: 640,
  },
  {
    key: 'nu-ord-past', campus: 'northwestern', host: 'siyuan.wu@u.northwestern.edu', type: 'airport_pickup',
    title: 'ORD 接机 · CA 987 9 月 2 日 16:10',
    zh: '9 月 2 日 CA 987 接机，已完成。',
    en: 'CA 987 pickup on Sept 2 — done.',
    day: -62, time: '16:10', durH: 3, loc: ORD_T5.name, lat: ORD_T5.lat, lng: ORD_T5.lng, dest: 'Evanston', dlat: NU.lat, dlng: NU.lng, langs: ['zh'], max: 3, verifiedOnly: true, minTrust: 1, cost: 2000, status: 'expired',
    members: ['alice@u.northwestern.edu', 'yiran.feng@u.northwestern.edu'], createdDaysAgo: 75, views: 120,
  },
  {
    key: 'nu-cancelled-dinner', campus: 'northwestern', host: 'bob@u.northwestern.edu', type: 'dining',
    title: '周三韩餐局 · 取消',
    zh: '周三晚 Koco Table 吃韩餐。因为临时有考试取消了，抱歉。',
    en: 'Wednesday Korean dinner at Koco Table. Cancelled because of a surprise exam — sorry.',
    day: W(3), time: '18:00', durH: 2, loc: 'Koco Table', lat: 42.0469, lng: -87.6803, langs: ['zh', 'en'], max: 5, cost: 2500, status: 'cancelled', members: ['alice@u.northwestern.edu'], createdDaysAgo: 6, views: 33,
  },

  // ---------------- UIUC (8)
  {
    key: 'uiuc-ord-thanksgiving', campus: 'uiuc', host: 'jason.tan@illinois.edu', type: 'carpool',
    title: 'Thanksgiving ORD carpool · leaving Wed 6:00',
    zh: '感恩节周三早上 6:00 从 Illini Union 出发开去 ORD，大约 2.5 小时。回程周日晚。油费每人 $25。',
    en: 'Driving from Illini Union to O\'Hare on Thanksgiving Wednesday at 6:00, about 2.5 hours; return Sunday evening. $25 each for gas.',
    day: { date: '2026-11-25' }, time: '06:00', durH: 3, loc: GREEN_ST.name, lat: GREEN_ST.lat, lng: GREEN_ST.lng, dest: ORD_T1.name, dlat: ORD_T1.lat, dlng: ORD_T1.lng, langs: ['en', 'zh'], max: 4, verifiedOnly: true, minTrust: 1, cost: 2500, members: ['qianqian.wang@illinois.edu'], createdDaysAgo: 3, views: 77,
  },
  {
    key: 'uiuc-cmi', campus: 'uiuc', host: 'yuxuan.li@illinois.edu', type: 'airport_pickup',
    title: 'CMI 接机 · AA 3640 周五 22:15',
    zh: '周五晚 AA 3640 从 Dallas 到 Willard，22:15 落地。我去接朋友，顺路可以多带 2 人回 Green St。',
    en: 'AA 3640 from Dallas lands at Willard 22:15 Friday. Picking up a friend, two spare seats back to Green St.',
    day: W(5), time: '22:15', durH: 1.5, loc: CMI.name, lat: CMI.lat, lng: CMI.lng, dest: 'Green St', dlat: GREEN_ST.lat, dlng: GREEN_ST.lng, langs: ['zh', 'en'], max: 3, verifiedOnly: true, minTrust: 1, cost: 500, createdDaysAgo: 2, views: 29,
  },
  {
    key: 'uiuc-costco', campus: 'uiuc', host: 'qianqian.wang@illinois.edu', type: 'costco_run',
    title: '周六 Costco Champaign 拼车',
    zh: '周六 11:00 从 Siebel 门口出发去 Costco，大概 1.5 小时。有会员卡，没卡的可以一起结账。',
    en: 'Saturday 11:00 Costco run from Siebel, about 1.5 hours. I have a membership — happy to check out together.',
    day: W(6), time: '11:00', durH: 1.5, loc: SIEBEL.name, lat: SIEBEL.lat, lng: SIEBEL.lng, dest: COSTCO_CHAMPAIGN.name, dlat: COSTCO_CHAMPAIGN.lat, dlng: COSTCO_CHAMPAIGN.lng, langs: ['zh', 'en'], max: 4, cost: 400, members: ['ryan.zhu@illinois.edu', 'hana.sato@illinois.edu'], createdDaysAgo: 4, views: 85,
    events: [{ day: W(6), time: '11:00', durH: 1.5 }, { day: W(6, 1), time: '11:00', durH: 1.5 }],
  },
  {
    key: 'uiuc-study-cs225', campus: 'uiuc', host: 'yuxuan.li@illinois.edu', type: 'study',
    title: 'CS 225 / 374 Grainger 自习组 · 周三 18:00',
    zh: '周三 18:00 Grainger 4 楼靠窗长桌，一起写 MP 和复习 374。偶尔点披萨。',
    en: 'Wednesday 18:00 at the window tables on Grainger 4F: MPs and 374 review. Pizza sometimes.',
    day: W(3), time: '18:00', durH: 3, loc: GRAINGER.name, lat: GRAINGER.lat, lng: GRAINGER.lng, langs: ['zh', 'en'], max: 6, minTrust: 0, members: ['jason.tan@illinois.edu', 'ryan.zhu@illinois.edu'], createdDaysAgo: 16, views: 190,
    events: [{ day: W(3), time: '18:00', durH: 3 }, { day: W(3, 1), time: '18:00', durH: 3 }, { day: W(3, 2), time: '18:00', durH: 3 }],
  },
  {
    key: 'uiuc-arc', campus: 'uiuc', host: 'hana.sato@illinois.edu', type: 'gym',
    title: 'ARC morning swim · Tue/Thu 7:30',
    zh: '周二周四早 7:30 ARC 游泳 40 分钟，之后一起吃早饭。',
    en: 'Tuesday and Thursday 7:30 swim at ARC, 40 minutes, breakfast after.',
    day: W(2), time: '07:30', durH: 1, loc: ARC.name, lat: ARC.lat, lng: ARC.lng, langs: ['en', 'ja'], max: 4, members: ['qianqian.wang@illinois.edu'], createdDaysAgo: 11, views: 48,
    events: [{ day: W(2), time: '07:30', durH: 1 }, { day: W(4), time: '07:30', durH: 1 }, { day: W(2, 1), time: '07:30', durH: 1 }, { day: W(4, 1), time: '07:30', durH: 1 }],
  },
  {
    key: 'uiuc-roommate', campus: 'uiuc', host: 'meilin.gao@illinois.edu', type: 'roommate',
    title: 'Urbana 2B1B 找室友 · 1 月起 · 女生',
    zh: 'Urbana Lincoln Ave 2B1B，1 月起一间房 $620/月，离 Grainger 步行 12 分钟。我是土木博士，作息规律。',
    en: '2B1B on Lincoln Ave in Urbana, one room at $620/mo from January, 12-minute walk to Grainger. PhD Civil, regular hours. Female roommate.',
    loc: 'Lincoln Ave & Nevada St', lat: 40.1053, lng: -88.2206, langs: ['zh', 'en'], max: 2, verifiedOnly: true, minTrust: 1, approval: true, createdDaysAgo: 9, views: 102,
  },
  {
    key: 'uiuc-hotpot', campus: 'uiuc', host: 'ryan.zhu@illinois.edu', type: 'dining',
    title: '周五晚 Green St 麻辣烫局',
    zh: '周五 19:00 Green St 的麻辣烫，吃完去 Kung Fu Tea。新生多认识认识。',
    en: 'Friday 19:00 malatang on Green St, bubble tea after. New students, come say hi.',
    day: W(5), time: '19:00', durH: 2, loc: GREEN_ST.name, lat: GREEN_ST.lat, lng: GREEN_ST.lng, langs: ['zh'], max: 6, minTrust: 0, cost: 1800, members: ['jason.tan@illinois.edu'], createdDaysAgo: 1, views: 22,
  },
  {
    key: 'uiuc-chicago-weekend', campus: 'uiuc', host: 'qianqian.wang@illinois.edu', type: 'travel',
    title: '周末去芝加哥 · Amtrak 拼票 + 住宿分摊',
    zh: '下下周末坐 Amtrak Illini 去芝加哥两天，Airbnb 四人分摊，看 Bean、逛 Chinatown。',
    en: 'Weekend in Chicago the week after next on the Amtrak Illini, four-way Airbnb split, the Bean and Chinatown.',
    day: W(6, 2), time: '08:00', durH: 36, loc: 'Illinois Terminal', lat: 40.1162, lng: -88.2424, dest: CHINATOWN.name, dlat: CHINATOWN.lat, dlng: CHINATOWN.lng, langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 1, approval: true, cost: 12000, members: ['hana.sato@illinois.edu'], createdDaysAgo: 2, views: 57,
  },

  // ---------------- NYU (7)
  {
    key: 'nyu-jfk', campus: 'nyu', host: 'ziyang.pan@nyu.edu', type: 'airport_pickup',
    title: 'JFK 接机拼车 · MU 587 周四 13:20 落地 T4',
    zh: '周四 MU 587 上海→JFK，13:20 到 T4。拼一辆 Uber XL 到 Greenwich Village，每人约 $30。',
    en: 'MU 587 from Shanghai lands at JFK T4 at 13:20 Thursday. Sharing an Uber XL to Greenwich Village, about $30 each.',
    day: W(4), time: '13:20', durH: 3, loc: JFK_T4.name, lat: JFK_T4.lat, lng: JFK_T4.lng, dest: 'Greenwich Village', dlat: NYU.lat, dlng: NYU.lng, langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 1, cost: 3000, members: ['mia.cheng@nyu.edu'], createdDaysAgo: 4, views: 66,
  },
  {
    key: 'nyu-lga', campus: 'nyu', host: 'kevin.xie@nyu.edu', type: 'airport_pickup',
    title: 'LGA 接机 · DL 1278 周日 20:45',
    zh: '周日 DL 1278 从 Atlanta 到 LGA Terminal B，20:45 落地，一起打车回 East Village。',
    en: 'DL 1278 from Atlanta lands at LGA Terminal B 20:45 Sunday. Splitting a cab to the East Village.',
    day: W(0), time: '20:45', durH: 2, loc: LGA.name, lat: LGA.lat, lng: LGA.lng, dest: 'East Village', dlat: 40.7265, dlng: -73.9815, langs: ['zh', 'en'], max: 3, cost: 2000, createdDaysAgo: 2, views: 19,
  },
  {
    key: 'nyu-study-bobst', campus: 'nyu', host: 'lucia.fernandez@nyu.edu', type: 'study',
    title: 'Bobst study group · Spanish/English, weeknights',
    zh: '工作日晚 19:00 Bobst LL1 一起自习，互相练西语/英语口语，学期末一起复习。',
    en: 'Weeknight 19:00 study sessions at Bobst LL1 with Spanish/English conversation breaks. Finals review together.',
    day: W(1), time: '19:00', durH: 2, loc: BOBST.name, lat: BOBST.lat, lng: BOBST.lng, langs: ['es', 'en'], max: 5, minTrust: 0, members: ['anqi.yang@nyu.edu'], createdDaysAgo: 12, views: 73,
    events: [{ day: W(1), time: '19:00', durH: 2 }, { day: W(3), time: '19:00', durH: 2 }, { day: W(1, 1), time: '19:00', durH: 2 }],
  },
  {
    key: 'nyu-flushing', campus: 'nyu', host: 'anqi.yang@nyu.edu', type: 'carpool',
    title: '周六去法拉盛吃东北菜 + 买菜（7 号线）',
    zh: '周六 12:00 Washington Sq 集合坐 7 号线去 Flushing，吃东北菜，逛新世界商城超市。',
    en: 'Saturday 12:00 from Washington Square on the 7 train to Flushing for Dongbei food and New World Mall groceries.',
    day: W(6), time: '12:00', durH: 5, loc: WSP.name, lat: WSP.lat, lng: WSP.lng, dest: FLUSHING.name, dlat: FLUSHING.lat, dlng: FLUSHING.lng, langs: ['zh'], max: 6, cost: 2500, members: ['kevin.xie@nyu.edu', 'mia.cheng@nyu.edu'], createdDaysAgo: 3, views: 94,
  },
  {
    key: 'nyu-costco', campus: 'nyu', host: 'kevin.xie@nyu.edu', type: 'costco_run',
    title: 'Brooklyn Costco 拼车 · 周日上午',
    zh: '周日 10:00 租 Zipcar 去 Sunset Park Costco，车费 4 人平摊，大件直接送到楼下。',
    en: 'Sunday 10:00 Zipcar to the Sunset Park Costco, four-way split on the car, bulk items dropped at your door.',
    day: W(0), time: '10:00', durH: 3, loc: 'Astor Place', lat: 40.7301, lng: -73.9914, dest: COSTCO_BK.name, dlat: COSTCO_BK.lat, dlng: COSTCO_BK.lng, langs: ['zh', 'en'], max: 4, cost: 1500, members: ['anqi.yang@nyu.edu'], createdDaysAgo: 2, views: 40,
  },
  {
    key: 'nyu-gym', campus: 'nyu', host: 'mia.cheng@nyu.edu', type: 'gym',
    title: 'Palladium 瑜伽课搭子 · 周三 18:00',
    zh: '周三 18:00 Palladium 的 vinyasa 课，一个人不好意思去，找人一起。',
    en: 'Wednesday 18:00 vinyasa class at Palladium — looking for company so I actually go.',
    day: W(3), time: '18:00', durH: 1, loc: PALLADIUM.name, lat: PALLADIUM.lat, lng: PALLADIUM.lng, langs: ['zh', 'en'], max: 3, minTrust: 0, createdDaysAgo: 1, views: 15,
  },
  {
    key: 'nyu-roommate', campus: 'nyu', host: 'anqi.yang@nyu.edu', type: 'roommate',
    title: 'Brooklyn 工作室合租找室友 · 12 月起',
    zh: 'Williamsburg 两居，一间 $1,450/月，L 线到 Union Sq 15 分钟。做设计的，希望室友爱干净、不常开 party。',
    en: 'Two-bedroom in Williamsburg, one room at $1,450/mo, 15 minutes to Union Sq on the L. Designer, looking for a tidy roommate who doesn\'t host parties.',
    loc: 'Williamsburg · Bedford Ave', lat: 40.7171, lng: -73.9569, langs: ['zh', 'en'], max: 2, verifiedOnly: true, minTrust: 1, approval: true, members: [{ email: 'lucia.fernandez@nyu.edu', status: 'pending', note: 'Tidy, quiet, grad student. Could move in Dec 15.' }], createdDaysAgo: 7, views: 131,
  },

  // ---------------- USC (5)
  {
    key: 'usc-lax', campus: 'usc', host: 'weichen.du@usc.edu', type: 'airport_pickup',
    title: 'LAX 接机 · CA 983 周六 11:50 TBIT',
    zh: '周六 CA 983 北京→洛杉矶，11:50 落地 TBIT。我有车，可接 3 人回 USC 周边，油费 $10/人。',
    en: 'CA 983 from Beijing lands at TBIT 11:50 Saturday. Three seats back to the USC area, $10 each.',
    day: W(6), time: '11:50', durH: 3, loc: LAX_TBIT.name, lat: LAX_TBIT.lat, lng: LAX_TBIT.lng, dest: 'USC Village', dlat: USC_VILLAGE.lat, dlng: USC_VILLAGE.lng, langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 1, cost: 1000, members: ['jingyi.cao@usc.edu'], createdDaysAgo: 3, views: 58,
  },
  {
    key: 'usc-costco', campus: 'usc', host: 'jingyi.cao@usc.edu', type: 'costco_run',
    title: 'Costco Los Feliz + 99 Ranch 周日采购',
    zh: '周日 10:00 USC Village 门口出发，先 Costco 再去 San Gabriel 99 Ranch，下午 15:00 前回来。',
    en: 'Sunday 10:00 from USC Village: Costco first, then 99 Ranch in San Gabriel, back before 15:00.',
    day: W(0), time: '10:00', durH: 5, loc: USC_VILLAGE.name, lat: USC_VILLAGE.lat, lng: USC_VILLAGE.lng, dest: RANCH99.name, dlat: RANCH99.lat, dlng: RANCH99.lng, langs: ['zh', 'en'], max: 4, cost: 800, members: ['weichen.du@usc.edu', 'hongyu.shi@usc.edu'], createdDaysAgo: 2, views: 49,
  },
  {
    key: 'usc-runyon', campus: 'usc', host: 'ava.nguyen@usc.edu', type: 'travel',
    title: 'Runyon Canyon hike · Sunday 8:00',
    zh: '周日早上 8:00 Runyon Canyon 徒步，大约 1.5 小时，看 Hollywood sign。拼车从 Lyon Center 出发。',
    en: 'Sunday 8:00 Runyon Canyon hike, about 90 minutes with the Hollywood sign view. Carpooling from Lyon Center.',
    day: W(0), time: '08:00', durH: 3, loc: LYON.name, lat: LYON.lat, lng: LYON.lng, dest: RUNYON.name, dlat: RUNYON.lat, dlng: RUNYON.lng, langs: ['en'], max: 5, minTrust: 0, cost: 500, members: ['jingyi.cao@usc.edu'], createdDaysAgo: 4, views: 62,
    events: [{ day: W(0), time: '08:00', durH: 3 }, { day: W(0, 1), time: '08:00', durH: 3 }],
  },
  {
    key: 'usc-study', campus: 'usc', host: 'jingyi.cao@usc.edu', type: 'study',
    title: 'CSCI 570 算法期末复习 · Leavey 周二晚',
    zh: '周二 20:00 Leavey 2 楼刷 570 往年题，一起对答案。',
    en: 'Tuesday 20:00 on Leavey 2F: CSCI 570 past exams, compare answers.',
    day: W(2), time: '20:00', durH: 2.5, loc: LEAVEY.name, lat: LEAVEY.lat, lng: LEAVEY.lng, langs: ['zh', 'en'], max: 6, members: ['weichen.du@usc.edu'], createdDaysAgo: 5, views: 83,
    events: [{ day: W(2), time: '20:00', durH: 2.5 }, { day: W(2, 1), time: '20:00', durH: 2.5 }],
  },
  {
    key: 'usc-joshua-tree', campus: 'usc', host: 'hongyu.shi@usc.edu', type: 'travel',
    title: 'Joshua Tree 露营两天一夜 · 下下周末',
    zh: '下下周六早 7:00 出发去 Joshua Tree 露营看星星，周日下午回。我有车和两顶帐篷，露营地费用平摊。',
    en: 'Joshua Tree camping the weekend after next: leaving Saturday 7:00, back Sunday afternoon. I have a car and two tents; campsite fee split.',
    day: W(6, 2), time: '07:00', durH: 32, loc: LYON.name, lat: LYON.lat, lng: LYON.lng, dest: JOSHUA.name, dlat: JOSHUA.lat, dlng: JOSHUA.lng, langs: ['zh', 'en'], max: 4, verifiedOnly: true, minTrust: 2, approval: true, cost: 4500, members: ['jingyi.cao@usc.edu', { email: 'ava.nguyen@usc.edu', status: 'pending', note: 'I have a camp stove and can drive part of the way.' }], createdDaysAgo: 3, views: 97,
  },
];

// ---------------------------------------------------------------- helpers
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute')) - at.getTime();
}
/** Resolves a DaySpec to "days from today" in the campus timezone (next weekday is always in the future). */
function dayOffset(timeZone: string, d: DaySpec): number {
  if (typeof d === 'number') return d;
  const now = new Date(nowMs());
  const local = new Date(now.getTime() + tzOffsetMs(timeZone, now));
  const todayUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  if ('date' in d) {
    const [y, m, dd] = d.date.split('-').map(Number) as [number, number, number];
    return Math.round((Date.UTC(y, m - 1, dd) - todayUtc) / DAY);
  }
  const delta = (d.dow - local.getUTCDay() + 7) % 7 || 7;
  return delta + (d.weeks ?? 0) * 7;
}
/** ISO instant for `day` from today at HH:MM campus-local. */
function localIso(timeZone: string, daySpec: DaySpec, hhmm: string): string {
  const day = dayOffset(timeZone, daySpec);
  const now = new Date(nowMs());
  const local = new Date(now.getTime() + tzOffsetMs(timeZone, now));
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + day, h, m, 0);
  const guess = new Date(target);
  return new Date(target - tzOffsetMs(timeZone, guess)).toISOString();
}
function postId(key: string): string {
  const h = sha256('buddy:' + key);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-b${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export default async function seed(_db: DatabaseSync): Promise<void> {
  const userId = (email: string): string | null => q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase()])?.id ?? null;
  for (let i = 1; i <= 20; i++) insertSeedUpload({ path: `seed/buddy/b${String(i).padStart(2, '0')}.svg`, purpose: 'seed' });

  const ids = POSTS.map((p) => postId(p.key));
  q.tx(() => {
    // idempotent: wipe previous buddy seed (posts cascade members/events; group chats + their messages; bell notifications)
    const oldConvs = q.all<{ id: string }>("SELECT id FROM conversations WHERE context_type = 'buddy_post'").map((r) => r.id);
    for (const c of oldConvs) q.run('DELETE FROM conversations WHERE id = ?', [c]);
    q.run("DELETE FROM notifications WHERE entity_type = 'buddy_post'");
    q.run("DELETE FROM events WHERE entity_type = 'buddy_post'");
    q.run('DELETE FROM buddy_posts');
    q.run("DELETE FROM reports WHERE entity_type = 'buddy_post'");

    POSTS.forEach((p, i) => {
      const id = ids[i]!;
      const campus = getCampus(p.campus);
      if (!campus) throw new Error(`seed buddy: unknown campus ${p.campus}`);
      const hostId = userId(p.host);
      if (!hostId) throw new Error(`seed buddy: unknown host ${p.host}`);
      const startsAt = p.day !== undefined && p.time ? localIso(campus.timezone, p.day, p.time) : null;
      const endsAt = startsAt && p.durH ? new Date(new Date(startsAt).getTime() + p.durH * HOUR).toISOString() : null;
      const createdAt = new Date(nowMs() - (p.createdDaysAgo ?? 3) * DAY - ((i * 37) % 23) * HOUR).toISOString();
      q.insert('buddy_posts', {
        id, author_id: hostId, campus_id: campus.id, type: p.type, title: p.title, description: `${p.zh}\n\n${p.en}`,
        starts_at: startsAt, ends_at: endsAt, is_all_day: p.allDay ? 1 : 0, location_name: p.loc ?? null, lat: p.lat ?? null, lng: p.lng ?? null,
        destination_name: p.dest ?? null, dest_lat: p.dlat ?? null, dest_lng: p.dlng ?? null, languages_json: JSON.stringify(p.langs ?? ['zh', 'en']),
        max_members: p.max ?? 4, member_count: 1, verified_only: p.verifiedOnly ? 1 : 0, min_trust_level: p.minTrust ?? 1, requires_approval: p.approval ? 1 : 0,
        cost_split_cents: p.cost ?? null, conversation_id: null, status: p.status ?? 'open', moderation_status: 'ok', boosted_until: null, view_count: p.views ?? 0,
        created_at: createdAt, updated_at: createdAt,
      });
      q.run("INSERT INTO buddy_members (post_id, user_id, role, status, note, joined_at, updated_at) VALUES (?, ?, 'host', 'joined', NULL, ?, ?)", [id, hostId, createdAt, createdAt]);

      const joined: string[] = [];
      for (const [mi, spec] of (p.members ?? []).entries()) {
        const m = typeof spec === 'string' ? { email: spec } : spec;
        const uidOf = userId(m.email);
        if (!uidOf || uidOf === hostId) continue;
        const status = m.status ?? 'joined';
        const joinedAt = new Date(new Date(createdAt).getTime() + (mi + 1) * 5 * HOUR + ((mi * 13) % 7) * 600_000).toISOString();
        q.run('INSERT OR IGNORE INTO buddy_members (post_id, user_id, role, status, note, joined_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, uidOf, 'member', status, m.note ?? null, joinedAt, joinedAt]);
        if (status === 'joined') joined.push(uidOf);
        if (status === 'pending' && (p.status ?? 'open') === 'open') {
          const joiner = q.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [uidOf]);
          notify(hostId, 'buddy.join', {
            title: { zh: `${joiner?.name ?? '有人'} 申请加入「${p.title}」`, en: `${joiner?.name ?? 'Someone'} asked to join "${p.title}"` },
            body: m.note ?? null, link: `/buddy/${id}?tab=requests`, entityType: 'buddy_post', entityId: id, data: { userId: uidOf, status: 'pending', seed: 1 }, silent: true,
          });
        }
      }

      for (const e of p.events ?? []) {
        const s = localIso(campus.timezone, e.day, e.time);
        q.run('INSERT INTO buddy_events (id, post_id, campus_id, starts_at, ends_at, location_name, lat, lng, status, reminder_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)',
          [uid(), id, campus.id, s, e.durH ? new Date(new Date(s).getTime() + e.durH * HOUR).toISOString() : null, e.loc ?? p.loc ?? null, p.lat ?? null, p.lng ?? null, dayOffset(campus.timezone, e.day) < 0 ? 'done' : 'scheduled', createdAt]);
      }

      // group chat on first joined member (DATA_MODEL §3.8)
      if (joined.length) {
        const { conversation } = openConversation({ kind: 'group', memberIds: [hostId], campusId: campus.id, context: { type: 'buddy_post', id }, createdBy: hostId, title: p.title });
        q.run('UPDATE conversations SET created_at = ?, updated_at = ? WHERE id = ?', [createdAt, createdAt, conversation.id]);
        q.run('UPDATE buddy_posts SET conversation_id = ? WHERE id = ?', [conversation.id, id]);
        const card = contextCardFor('buddy_post', id);
        if (card) postContextCard(conversation.id, hostId, card);
        addMembers(conversation.id, joined);
        for (const msg of p.chat ?? []) {
          const sender = userId(msg.from);
          if (sender) postMessage(conversation.id, sender, 'text', msg.body, { notify: false });
        }
      }

      // trigger-maintained member_count is now right; derive full status for posts that filled up
      const row = q.get<{ member_count: number; max_members: number; status: string }>('SELECT member_count, max_members, status FROM buddy_posts WHERE id = ?', [id])!;
      if (row.status === 'open' && row.member_count >= row.max_members) q.run("UPDATE buddy_posts SET status = 'full' WHERE id = ?", [id]);
      if (row.status === 'full' && row.member_count < row.max_members) q.run("UPDATE buddy_posts SET status = 'open' WHERE id = ?", [id]);
    });

    // a few realistic analytics events (views) so the admin dashboard has something to count
    const alice = userId('alice@u.northwestern.edu');
    for (const [i, id] of ids.slice(0, 12).entries()) {
      q.run(
        'INSERT INTO events (id, user_id, session_id, campus_id, type, entity_type, entity_id, props_json, path, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)',
        [uid(), i % 3 === 0 ? alice : null, POSTS[i]!.campus, 'buddy.view', 'buddy_post', id, JSON.stringify({ type: POSTS[i]!.type, seed: 1 }), `/buddy/${id}`, new Date(nowMs() - (i + 1) * 3 * HOUR).toISOString()],
      );
    }
  });
  void nowIso;
}

/** Deterministic ids so other seeds (billing boosts, reports) can reference buddy posts. */
export const SEED_BUDDY_POST_IDS: Record<string, string> = Object.fromEntries(POSTS.map((p) => [p.key, postId(p.key)]));
