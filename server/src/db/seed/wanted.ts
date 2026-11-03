// server/src/db/seed/wanted.ts — OWNED BY THE `wanted` MODULE AGENT.
// 35 wanted posts (Northwestern 20 · UIUC 5 · NYU 5 · USC 5) by seeded students, bilingual, varied budgets / dates /
// group sizes / areas (circle, city, campus; a few nationwide relocations), then precomputed matches against the
// listings table. If the listings seed has not landed yet (no active listings), a small fallback pool of demo listings
// (ids `wseed-l-*`) is inserted so the matching UI is alive; it is removed automatically once real listings exist.
// Idempotent: delete-and-insert of wanted_posts / wanted_areas / matches (module tables) + the fallback listings.
import type { DatabaseSync } from 'node:sqlite';
import { q, uid } from '../index';
import { insertSeedUpload } from '../../lib/uploads';
import { haversineM } from '../../lib/geo';
import { getCampus } from '../../lib/campuses';
import { commuteEstimate } from '../../lib/shuttle';
import { contextCardFor, openConversation, postContextCard, postMessage } from '../../lib/conversations';
import { nowIso, nowMs, DAY } from '../../lib/time';
import { logger } from '../../lib/logger';
import { recomputeForWanted, scorePair } from '../../modules/wanted/service';

export const version = 1;

type AreaSeed =
  | { kind: 'circle'; label: string; lat: number; lng: number; radiusM: number }
  | { kind: 'city'; label: string; city: string; state: string }
  | { kind: 'campus'; label: string; campusId: string };

type WantedSeed = {
  email: string;
  campus: string;
  scope?: 'campus' | 'nationwide';
  title: string;
  description: string;
  budget: [number, number]; // dollars
  moveIn: [string, string];
  moveOut?: string | null;
  flex?: number;
  group?: number;
  bedroomsMin?: number;
  furnished?: 'any' | 'partial' | 'full';
  gender?: 'any' | 'female' | 'male';
  pets?: boolean;
  parking?: boolean;
  types?: string[];
  must?: string[];
  nice?: string[];
  areas?: AreaSeed[];
  status?: 'active' | 'paused' | 'fulfilled' | 'expired';
  daysAgo?: number;
  views?: number;
};

// Evanston / Chicago anchors (real neighbourhoods)
const EV = {
  downtown: { lat: 42.0464, lng: -87.6805 }, // Davis St
  noyes: { lat: 42.0583, lng: -87.6833 },
  central: { lat: 42.0643, lng: -87.6885 },
  southEvanston: { lat: 42.0335, lng: -87.6790 }, // Main St
  dempster: { lat: 42.0411, lng: -87.6811 },
  rogersPark: { lat: 42.0094, lng: -87.6681 },
  ridge: { lat: 42.0500, lng: -87.6920 },
  lakeshore: { lat: 42.0420, lng: -87.6720 },
};
const UI = {
  green: { lat: 40.1100, lng: -88.2330 }, // Green St campustown
  urbana: { lat: 40.1134, lng: -88.2069 },
  champaign: { lat: 40.1164, lng: -88.2434 },
  south: { lat: 40.0980, lng: -88.2250 },
};
const NY = {
  eastVillage: { lat: 40.7265, lng: -73.9815 },
  village: { lat: 40.7308, lng: -73.9973 },
  williamsburg: { lat: 40.7081, lng: -73.9571 },
  lic: { lat: 40.7447, lng: -73.9485 },
  downtownBk: { lat: 40.6928, lng: -73.9903 },
};
const LA = {
  expo: { lat: 34.0180, lng: -118.2880 },
  dtla: { lat: 34.0407, lng: -118.2468 },
  ktown: { lat: 34.0577, lng: -118.3009 },
  uv: { lat: 34.0253, lng: -118.2851 }, // University Village
};

const WANTED: WantedSeed[] = [
  // ------------------------------------------------------------ Northwestern (20)
  { email: 'alice@u.northwestern.edu', campus: 'northwestern', title: '找 Davis St 附近安静 1B1B，1 月入住', description: 'MSCS 在读，想找离 Davis 站步行 10 分钟内的一居室，1 月初到 6 月底。安静、带家具优先，最好有洗衣机。\n\nMSCS student looking for a quiet 1B1B within a 10-minute walk of Davis St, early January through June. Furnished preferred, in-unit laundry is a big plus.', budget: [1100, 1500], moveIn: ['2027-01-03', '2027-01-20'], moveOut: '2027-06-30', flex: 7, group: 1, bedroomsMin: 1, furnished: 'full', gender: 'female', types: ['apartment', 'studio'], must: ['furnished', 'laundry_in_unit'], nice: ['wifi', 'utilities_included'], areas: [{ kind: 'circle', label: 'Downtown Evanston', ...EV.downtown, radiusM: 1200 }, { kind: 'circle', label: '近 Noyes 站', ...EV.noyes, radiusM: 900 }], daysAgo: 3, views: 84 },
  { email: 'bob@u.northwestern.edu', campus: 'northwestern', title: '2 人找 2B 公寓，秋季学期整租', description: '和同学一起找 2 室，9 月开学前入住，一年起租。可以接受南 Evanston，预算每人 $900 左右。\n\nTwo MEM students looking for a 2-bedroom from late August, 12-month lease OK. South Evanston is fine. About $900 per person.', budget: [1600, 1900], moveIn: ['2027-08-20', '2027-09-10'], moveOut: null, flex: 10, group: 2, bedroomsMin: 2, furnished: 'any', types: ['apartment', 'townhouse'], must: ['laundry_in_building'], nice: ['dishwasher', 'desk'], areas: [{ kind: 'circle', label: 'South Evanston', ...EV.southEvanston, radiusM: 1500 }, { kind: 'circle', label: 'Dempster 一带', ...EV.dempster, radiusM: 1000 }], daysAgo: 6, views: 61 },
  { email: 'newbie@u.northwestern.edu', campus: 'northwestern', title: '新生求租：12 月起单间，预算 $900 内', description: '刚到 Evanston，暂住朋友家，想尽快找一个带家具的单间，合租也可以，女生优先。\n\nJust arrived and staying with a friend — looking for a furnished room ASAP, shared apartment is fine, female roommates preferred.', budget: [600, 900], moveIn: ['2026-11-15', '2026-12-15'], moveOut: '2027-06-15', flex: 5, group: 1, bedroomsMin: 0, furnished: 'full', gender: 'female', types: ['room', 'shared_room'], must: ['furnished'], nice: ['wifi', 'utilities_included'], areas: [], daysAgo: 1, views: 37 },
  { email: 'wenjun.liu@u.northwestern.edu', campus: 'northwestern', title: '博士生长租 1B，Tech 附近，宠物友好', description: '在 Tech 做实验，经常晚归，想住在 Noyes 或 Central 附近。有一只 3 岁的猫，需要允许宠物的公寓。长期租，至少 12 个月。\n\nPhD student (Tech), late lab hours, so Noyes or Central St area. I have a calm 3-year-old cat — pet-friendly only. Long-term, 12+ months.', budget: [1200, 1650], moveIn: ['2027-06-01', '2027-07-15'], moveOut: null, flex: 14, group: 1, bedroomsMin: 1, furnished: 'any', pets: true, types: ['apartment'], must: ['laundry_in_building'], nice: ['balcony', 'dishwasher'], areas: [{ kind: 'circle', label: 'Noyes / Tech', ...EV.noyes, radiusM: 1000 }, { kind: 'circle', label: 'Central St', ...EV.central, radiusM: 1000 }], daysAgo: 9, views: 52 },
  { email: 'haoran.zhang@u.northwestern.edu', campus: 'northwestern', title: '暑期短租 6–8 月，有车位最好', description: '暑假留校做项目，找 6 月中到 8 月底的转租，studio 或 1B 都行。有车，所以带车位的优先。\n\nStaying over summer for a project; need a sublet mid-June to end of August, studio or 1B. I drive, so parking is a plus.', budget: [900, 1300], moveIn: ['2027-06-10', '2027-06-25'], moveOut: '2027-08-31', flex: 7, group: 1, bedroomsMin: 0, furnished: 'partial', parking: true, types: ['studio', 'apartment', 'room'], must: ['parking'], nice: ['ac'], areas: [{ kind: 'circle', label: 'Evanston 全城', ...EV.downtown, radiusM: 2500 }], daysAgo: 12, views: 45 },
  { email: 'minjae.park@u.northwestern.edu', campus: 'northwestern', title: 'Room near Noyes station, Jan–Jun, quiet roommates', description: 'MSIS student, early riser. Looking for a room in a 2–3 bedroom place near the Noyes Purple Line stop. Shared bathroom is fine. 2027 winter + spring quarters.\n\n想在 Noyes 站附近合租一个房间，1 月到 6 月，室友作息规律就好。', budget: [700, 1000], moveIn: ['2027-01-01', '2027-01-15'], moveOut: '2027-06-20', flex: 5, group: 1, bedroomsMin: 0, furnished: 'any', gender: 'male', types: ['room'], must: ['wifi'], nice: ['desk'], areas: [{ kind: 'circle', label: 'Noyes station', ...EV.noyes, radiusM: 800 }], daysAgo: 4, views: 29 },
  { email: 'siyuan.wu@u.northwestern.edu', campus: 'northwestern', title: '3 人找 3B 整租，9 月起，近 Foster', description: '三个机械的同学，想找 3 室 1.5 卫以上的整租，Foster / Noyes 附近，9 月入住一年。有车，需要车位或街边停车。\n\nThree ME students looking for a 3-bedroom near Foster/Noyes from September, one-year lease. We have a car — parking or street parking needed.', budget: [2700, 3300], moveIn: ['2027-08-25', '2027-09-15'], moveOut: null, flex: 10, group: 3, bedroomsMin: 3, furnished: 'any', parking: true, types: ['apartment', 'house', 'townhouse'], must: ['parking', 'laundry_in_unit'], nice: ['dishwasher', 'balcony'], areas: [{ kind: 'circle', label: 'Foster / Noyes', ...EV.noyes, radiusM: 1200 }, { kind: 'circle', label: 'Ridge Ave', ...EV.ridge, radiusM: 1000 }], daysAgo: 15, views: 73 },
  { email: 'jiaqi.huang@u.northwestern.edu', campus: 'northwestern', title: 'Medill 女生找 1B 转租，3–6 月', description: '春季学期要在芝加哥市区实习两天，其余时间在学校，想找离 Davis 站近的一居室，3 月到 6 月。带家具必须。\n\nSpring-quarter sublet, March–June, close to the Davis St Metra/Purple Line because I commute downtown twice a week. Must be furnished.', budget: [1000, 1400], moveIn: ['2027-03-01', '2027-03-25'], moveOut: '2027-06-20', flex: 5, group: 1, bedroomsMin: 0, furnished: 'full', gender: 'female', types: ['studio', 'apartment'], must: ['furnished'], nice: ['laundry_in_unit', 'elevator'], areas: [{ kind: 'circle', label: 'Davis St', ...EV.downtown, radiusM: 800 }], daysAgo: 20, views: 58 },
  { email: 'tianyi.zhao@u.northwestern.edu', campus: 'northwestern', title: '大一找暑期合租房间，6–9 月', description: '暑假留校上课，找一个便宜的房间，6 月中到 9 月中，床和书桌有就行。\n\nFreshman staying for summer session, looking for a cheap room mid-June to mid-September. A bed and a desk are enough.', budget: [500, 800], moveIn: ['2027-06-12', '2027-06-30'], moveOut: '2027-09-15', flex: 7, group: 1, bedroomsMin: 0, furnished: 'partial', types: ['room', 'shared_room'], must: [], nice: ['wifi', 'desk'], areas: [], daysAgo: 2, views: 14 },
  { email: 'xinyi.lin@u.northwestern.edu', campus: 'northwestern', title: '毕业后留 Evanston 工作，找长租 1B 或 studio', description: '6 月毕业后在 Evanston 工作，想找 7 月起的长租，studio 或一居室都可以，不需要家具（自己有）。南 Evanston 和 Rogers Park 都可以考虑。\n\nStaying in Evanston for work after graduating in June; looking for a long-term studio/1B from July. Unfurnished is fine. South Evanston or Rogers Park both OK.', budget: [1000, 1450], moveIn: ['2027-07-01', '2027-08-01'], moveOut: null, flex: 14, group: 1, bedroomsMin: 0, furnished: 'any', types: ['studio', 'apartment'], must: [], nice: ['laundry_in_building', 'near_grocery'], areas: [{ kind: 'circle', label: 'South Evanston', ...EV.southEvanston, radiusM: 1500 }, { kind: 'circle', label: 'Rogers Park', ...EV.rogersPark, radiusM: 1500 }], daysAgo: 8, views: 40 },
  { email: 'kai.tanaka@u.northwestern.edu', campus: 'northwestern', title: 'Studio with a real desk, winter quarter', description: 'Materials science, mostly writing this quarter. Want a furnished studio with a proper desk and good light, walking distance to Tech. Jan to March, maybe longer.\n\n找一个带书桌的 studio，1 月到 3 月，步行到 Tech。', budget: [1000, 1350], moveIn: ['2027-01-04', '2027-01-18'], moveOut: '2027-03-31', flex: 4, group: 1, bedroomsMin: 0, furnished: 'full', types: ['studio'], must: ['furnished', 'desk'], nice: ['wifi'], areas: [{ kind: 'circle', label: 'Near Tech', ...EV.noyes, radiusM: 1000 }, { kind: 'circle', label: 'Downtown Evanston', ...EV.downtown, radiusM: 900 }], daysAgo: 5, views: 33 },
  { email: 'zihao.guo@u.northwestern.edu', campus: 'northwestern', title: '两人找 2B2B，有停车位，Dempster 附近', description: '和女朋友一起找 2B2B，8 月底入住，一年。需要一个车位。离 Costco 近是加分项（我们常去）。\n\nMy partner and I are looking for a 2B2B from late August, one-year lease, one parking spot required. Close to the Dempster Purple Line is ideal.', budget: [1800, 2300], moveIn: ['2027-08-15', '2027-09-05'], moveOut: null, flex: 10, group: 2, bedroomsMin: 2, furnished: 'any', parking: true, types: ['apartment', 'townhouse'], must: ['parking'], nice: ['dishwasher', 'ac', 'gym'], areas: [{ kind: 'circle', label: 'Dempster', ...EV.dempster, radiusM: 1200 }, { kind: 'circle', label: 'Main St', ...EV.southEvanston, radiusM: 1000 }], daysAgo: 11, views: 47 },
  { email: 'mengyao.xu@u.northwestern.edu', campus: 'northwestern', title: '找 1B 转租，4 月到 8 月，能看湖最好', description: '春天想换个靠湖的地方住，4 月到 8 月的转租，一居室，带家具，离 Davis 走路 15 分钟内。\n\nLooking for a furnished 1B sublet April–August, ideally on the lake side of Evanston, within 15 min walk of Davis St.', budget: [1200, 1600], moveIn: ['2027-04-01', '2027-04-20'], moveOut: '2027-08-25', flex: 7, group: 1, bedroomsMin: 1, furnished: 'full', types: ['apartment'], must: ['furnished'], nice: ['balcony', 'laundry_in_unit'], areas: [{ kind: 'circle', label: 'Lakeshore / Downtown', ...EV.lakeshore, radiusM: 1200 }], daysAgo: 7, views: 36 },
  { email: 'daniel.kim@u.northwestern.edu', campus: 'northwestern', title: 'Summer sublet for 2, June–Aug, near campus', description: 'Two CS undergrads doing research on campus this summer. Need a furnished 2B (or a 1B with a living room we can split) from mid-June through August. Budget is per place, not per person.\n\n两个 CS 本科生暑期留校做研究，找 6 月中到 8 月底的带家具 2B。', budget: [1500, 2000], moveIn: ['2027-06-12', '2027-06-24'], moveOut: '2027-08-28', flex: 5, group: 2, bedroomsMin: 1, furnished: 'full', types: ['apartment'], must: ['furnished', 'wifi'], nice: ['ac', 'laundry_in_building'], areas: [{ kind: 'campus', label: 'Northwestern 周边', campusId: 'northwestern' }], daysAgo: 13, views: 42 },
  { email: 'yiran.feng@u.northwestern.edu', campus: 'northwestern', title: '刚到 Evanston，急寻 12 月可入住的单间', description: '刚办完入学，现在住酒店，预算有限，找 12 月 1 日前后可入住的房间，合租可以，最好离校车站近。\n\nNewly enrolled, currently in a hotel. Need a room from around Dec 1, shared apartment is fine, ideally near a shuttle stop.', budget: [650, 950], moveIn: ['2026-11-20', '2026-12-10'], moveOut: '2027-06-30', flex: 5, group: 1, bedroomsMin: 0, furnished: 'partial', gender: 'female', types: ['room', 'shared_room', 'studio'], must: [], nice: ['furnished', 'utilities_included'], areas: [], daysAgo: 1, views: 22 },
  { email: 'boyang.he@u.northwestern.edu', campus: 'northwestern', title: '经济学博士找安静长租，Central St 一带', description: '不吵、采光好、可以长期住的一居室，Central St 到 Noyes 之间，7 月起至少 12 个月。不需要家具。\n\nEconomics PhD looking for a quiet, bright 1B between Central St and Noyes, 12+ months from July. Unfurnished is fine.', budget: [1150, 1500], moveIn: ['2027-07-01', '2027-07-31'], moveOut: null, flex: 10, group: 1, bedroomsMin: 1, furnished: 'any', types: ['apartment'], must: ['laundry_in_building'], nice: ['heating', 'near_grocery'], areas: [{ kind: 'circle', label: 'Central St', ...EV.central, radiusM: 1100 }], daysAgo: 18, views: 31 },
  { email: 'sophia.wang@u.northwestern.edu', campus: 'northwestern', title: '找带健身房的公寓，1 月起 6 个月', description: 'IMC 最后两个学期，想住在 downtown 有健身房和电梯的公寓，一居室，1 月到 6 月，带家具。\n\nLast two quarters of IMC; want a furnished 1B in a downtown Evanston building with a gym and elevator, January–June.', budget: [1400, 1900], moveIn: ['2027-01-02', '2027-01-16'], moveOut: '2027-06-25', flex: 5, group: 1, bedroomsMin: 1, furnished: 'full', gender: 'female', types: ['apartment'], must: ['furnished', 'gym', 'elevator'], nice: ['doorman', 'laundry_in_unit'], areas: [{ kind: 'circle', label: 'Downtown Evanston', ...EV.downtown, radiusM: 900 }], daysAgo: 10, views: 55 },
  { email: 'leo.ma@u.northwestern.edu', campus: 'northwestern', title: '找 9 月起的单间，骑车到校 10 分钟内', description: '我骑车通勤，Evanston 范围内都行，找一个 9 月起的单间，有自行车存放处更好。\n\nI bike everywhere; any room in Evanston from September works, bike storage is a plus.', budget: [700, 1000], moveIn: ['2027-09-01', '2027-09-20'], moveOut: null, flex: 7, group: 1, bedroomsMin: 0, furnished: 'any', types: ['room', 'studio'], must: [], nice: ['bike_storage', 'wifi'], areas: [{ kind: 'campus', label: 'Northwestern', campusId: 'northwestern' }], daysAgo: 16, views: 19 },
  { email: 'grace.hu@u.northwestern.edu', campus: 'northwestern', title: '女生找女生合租房间，1 月入住，近 Davis', description: '公共卫生专业，找 Davis 附近 2–3 室公寓里的一个房间，室友女生。1 月到 8 月。\n\nMPH student looking for a room in a 2–3 bedroom near Davis with female roommates, January through August.', budget: [800, 1100], moveIn: ['2027-01-01', '2027-01-20'], moveOut: '2027-08-31', flex: 7, group: 1, bedroomsMin: 0, furnished: 'partial', gender: 'female', types: ['room'], must: ['wifi'], nice: ['furnished', 'laundry_in_unit'], areas: [{ kind: 'circle', label: 'Davis St', ...EV.downtown, radiusM: 1000 }], daysAgo: 6, views: 27 },
  { email: 'ethan.luo@u.northwestern.edu', campus: 'northwestern', scope: 'nationwide', title: '暑期去纽约实习，找 6–8 月曼哈顿 / 布鲁克林转租', description: '6 月初到 8 月底在曼哈顿中城实习，找 studio 或合租房间，地铁 30 分钟内到 Midtown。预算 $1,800 以内。\n\nSummer internship in Midtown Manhattan, June–August. Looking for a studio or a room within 30 min by subway. Under $1,800.', budget: [1200, 1800], moveIn: ['2027-06-01', '2027-06-15'], moveOut: '2027-08-31', flex: 5, group: 1, bedroomsMin: 0, furnished: 'full', types: ['studio', 'room', 'apartment'], must: ['furnished'], nice: ['wifi', 'ac'], areas: [{ kind: 'campus', label: 'NYU 周边', campusId: 'nyu' }, { kind: 'city', label: 'New York, NY', city: 'New York', state: 'NY' }, { kind: 'circle', label: 'Williamsburg', ...NY.williamsburg, radiusM: 1500 }], daysAgo: 2, views: 48 },
  // ------------------------------------------------------------ UIUC (5)
  { email: 'ryan.zhu@illinois.edu', campus: 'uiuc', title: '8 月到校，找 Green St 附近 1B，带家具', description: '信息管理硕士新生，8 月中到校，想住在 campustown，走路到 Siebel 15 分钟内，带家具一居室。\n\nIncoming MSIM student arriving mid-August; want a furnished 1B in campustown within 15 min walk of Siebel.', budget: [800, 1150], moveIn: ['2027-08-10', '2027-08-25'], moveOut: null, flex: 7, group: 1, bedroomsMin: 1, furnished: 'full', types: ['apartment', 'studio'], must: ['furnished'], nice: ['wifi', 'gym'], areas: [{ kind: 'circle', label: 'Green St / Campustown', ...UI.green, radiusM: 1200 }], daysAgo: 4, views: 30 },
  { email: 'qianqian.wang@illinois.edu', campus: 'uiuc', title: '两人找 2B，Urbana 安静一点的地方，1 月起', description: '和同学找 2 室，1 月到 8 月，Urbana 这边安静的公寓，有洗衣机、允许养猫。\n\nTwo of us looking for a 2B in a quieter part of Urbana, January–August, in-unit laundry, cat-friendly.', budget: [1100, 1500], moveIn: ['2027-01-05', '2027-01-20'], moveOut: '2027-08-15', flex: 7, group: 2, bedroomsMin: 2, furnished: 'any', pets: true, types: ['apartment', 'townhouse'], must: ['laundry_in_unit'], nice: ['parking', 'dishwasher'], areas: [{ kind: 'circle', label: 'Urbana', ...UI.urbana, radiusM: 1800 }], daysAgo: 9, views: 26 },
  { email: 'jason.tan@illinois.edu', campus: 'uiuc', title: 'Summer room near campus, May–Aug, cheap', description: 'Staying in Champaign for a summer research position. Any room near campus with Wi-Fi and AC, mid-May to mid-August.\n\n暑期留校，找 5 月中到 8 月中的便宜房间，有空调就行。', budget: [400, 650], moveIn: ['2027-05-15', '2027-05-31'], moveOut: '2027-08-15', flex: 5, group: 1, bedroomsMin: 0, furnished: 'any', types: ['room', 'shared_room'], must: ['ac'], nice: ['wifi', 'furnished'], areas: [{ kind: 'campus', label: 'UIUC', campusId: 'uiuc' }], daysAgo: 14, views: 21 },
  { email: 'hana.sato@illinois.edu', campus: 'uiuc', scope: 'nationwide', title: 'Moving to Chicago for a job — 1B near the Loop from July', description: 'Starting a job in the Loop in July. Looking for a 1B or studio with a reasonable commute (CTA Red/Brown line). Furnished not required. Open to Evanston if the Purple Line works.\n\n7 月去芝加哥工作，找 Loop 通勤 40 分钟内的一居室或 studio。', budget: [1300, 1900], moveIn: ['2027-07-01', '2027-07-20'], moveOut: null, flex: 10, group: 1, bedroomsMin: 0, furnished: 'any', types: ['apartment', 'studio'], must: [], nice: ['laundry_in_building', 'gym'], areas: [{ kind: 'city', label: 'Chicago, IL', city: 'Chicago', state: 'IL' }, { kind: 'city', label: 'Evanston, IL', city: 'Evanston', state: 'IL' }, { kind: 'circle', label: 'Rogers Park', ...EV.rogersPark, radiusM: 2000 }], daysAgo: 5, views: 39 },
  { email: 'yuxuan.li@illinois.edu', campus: 'uiuc', title: '找 1 月起的 studio，Champaign downtown 也可以', description: '春季最后一学期，想一个人住 studio，Green St 或 Champaign downtown，1 月到 5 月。\n\nLast semester — looking for a studio on Green St or in downtown Champaign, January through May.', budget: [700, 1000], moveIn: ['2027-01-08', '2027-01-22'], moveOut: '2027-05-20', flex: 5, group: 1, bedroomsMin: 0, furnished: 'partial', gender: 'male', types: ['studio', 'apartment'], must: [], nice: ['furnished', 'wifi'], areas: [{ kind: 'circle', label: 'Green St', ...UI.green, radiusM: 1000 }, { kind: 'circle', label: 'Downtown Champaign', ...UI.champaign, radiusM: 1000 }], daysAgo: 7, views: 24 },
  // ------------------------------------------------------------ NYU (5)
  { email: 'mia.cheng@nyu.edu', campus: 'nyu', title: 'Tisch 新生找 East Village 合租房间，9 月起', description: '9 月入学，想住 East Village 或 Lower East Side 的合租房间，预算 $1,500 以内，女生室友优先。\n\nIncoming Tisch student looking for a room in a shared East Village / LES apartment from September, under $1,500, female roommates preferred.', budget: [1000, 1500], moveIn: ['2027-08-20', '2027-09-05'], moveOut: null, flex: 7, group: 1, bedroomsMin: 0, furnished: 'partial', gender: 'female', types: ['room'], must: [], nice: ['furnished', 'laundry_in_building'], areas: [{ kind: 'circle', label: 'East Village', ...NY.eastVillage, radiusM: 1000 }, { kind: 'circle', label: 'Greenwich Village', ...NY.village, radiusM: 900 }], daysAgo: 3, views: 44 },
  { email: 'kevin.xie@nyu.edu', campus: 'nyu', title: '找 1 月到 5 月的 studio，离 Washington Sq 地铁 20 分钟内', description: '最后一学期，想一个人住，studio 或小一居，带家具，地铁 20 分钟到 Washington Square。LIC、Williamsburg 都可以。\n\nLast semester; want a furnished studio within 20 min by subway of Washington Square. LIC or Williamsburg OK.', budget: [1800, 2500], moveIn: ['2027-01-10', '2027-01-25'], moveOut: '2027-05-25', flex: 5, group: 1, bedroomsMin: 0, furnished: 'full', types: ['studio', 'apartment'], must: ['furnished'], nice: ['elevator', 'laundry_in_building'], areas: [{ kind: 'circle', label: 'Long Island City', ...NY.lic, radiusM: 1200 }, { kind: 'circle', label: 'Williamsburg', ...NY.williamsburg, radiusM: 1200 }, { kind: 'campus', label: 'NYU', campusId: 'nyu' }], daysAgo: 8, views: 50 },
  { email: 'lucia.fernandez@nyu.edu', campus: 'nyu', title: 'Room in Brooklyn, June–August, Spanish/English household welcome', description: 'Summer research at Bobst, looking for a room in Downtown Brooklyn or Williamsburg, June through August. Quiet, with a desk. Budget up to $1,400.\n\n暑期找布鲁克林的合租房间，6 到 8 月。', budget: [900, 1400], moveIn: ['2027-06-01', '2027-06-20'], moveOut: '2027-08-31', flex: 7, group: 1, bedroomsMin: 0, furnished: 'full', gender: 'female', types: ['room'], must: ['furnished', 'desk'], nice: ['wifi', 'ac'], areas: [{ kind: 'circle', label: 'Downtown Brooklyn', ...NY.downtownBk, radiusM: 1300 }, { kind: 'circle', label: 'Williamsburg', ...NY.williamsburg, radiusM: 1300 }], daysAgo: 11, views: 23 },
  { email: 'anqi.yang@nyu.edu', campus: 'nyu', title: '2 人找 2B，Williamsburg / LIC，8 月起一年', description: '和合作伙伴一起找 2 室，8 月底起租一年，需要能放画具的客厅，电梯楼优先。\n\nTwo of us (both IDM) looking for a 2B in Williamsburg or LIC from late August, one-year lease, elevator building preferred, need a living room big enough for a studio corner.', budget: [3200, 4200], moveIn: ['2027-08-15', '2027-09-05'], moveOut: null, flex: 10, group: 2, bedroomsMin: 2, furnished: 'any', types: ['apartment'], must: ['elevator'], nice: ['laundry_in_building', 'balcony'], areas: [{ kind: 'circle', label: 'Williamsburg', ...NY.williamsburg, radiusM: 1500 }, { kind: 'circle', label: 'Long Island City', ...NY.lic, radiusM: 1300 }], daysAgo: 17, views: 35 },
  { email: 'ziyang.pan@nyu.edu', campus: 'nyu', scope: 'nationwide', title: 'Stern 毕业后去洛杉矶，找 7 月起 USC / DTLA 一带 1B', description: '7 月开始在 DTLA 工作，找 Downtown LA、USC 周边或 Koreatown 的一居室，长租，有车位。\n\nStarting a job in DTLA in July; looking for a 1B in Downtown LA, around USC or Koreatown, long-term, with parking.', budget: [1800, 2600], moveIn: ['2027-07-01', '2027-07-25'], moveOut: null, flex: 10, group: 1, bedroomsMin: 1, furnished: 'any', parking: true, types: ['apartment'], must: ['parking'], nice: ['gym', 'ac'], areas: [{ kind: 'campus', label: 'USC 周边', campusId: 'usc' }, { kind: 'city', label: 'Los Angeles, CA', city: 'Los Angeles', state: 'CA' }, { kind: 'circle', label: 'Koreatown', ...LA.ktown, radiusM: 1500 }], daysAgo: 6, views: 41 },
  // ------------------------------------------------------------ USC (5)
  { email: 'jingyi.cao@usc.edu', campus: 'usc', title: '找 1 月起 University Village 附近 1B，带家具', description: 'Viterbi 最后一学期，想住 University Village 或 Expo Park 附近的带家具一居室，1 月到 5 月，有门禁的小区。\n\nLast semester at Viterbi; furnished 1B near University Village / Expo Park, January–May, gated building preferred.', budget: [1500, 2100], moveIn: ['2027-01-05', '2027-01-20'], moveOut: '2027-05-20', flex: 5, group: 1, bedroomsMin: 1, furnished: 'full', gender: 'female', types: ['apartment'], must: ['furnished', 'security'], nice: ['gym', 'parking'], areas: [{ kind: 'circle', label: 'University Village', ...LA.uv, radiusM: 1000 }, { kind: 'circle', label: 'Expo Park', ...LA.expo, radiusM: 1000 }], daysAgo: 4, views: 38 },
  { email: 'weichen.du@usc.edu', campus: 'usc', title: '3 人找 3B 带车位，8 月起', description: '三个 EE 的同学，8 月起整租 3 室，必须有 2 个车位或车库，USC 周边或 DTLA 都行。\n\nThree EE students looking for a 3B from August, must have 2 parking spots or a garage, near USC or DTLA.', budget: [3300, 4200], moveIn: ['2027-08-01', '2027-08-20'], moveOut: null, flex: 10, group: 3, bedroomsMin: 3, furnished: 'any', parking: true, types: ['apartment', 'house', 'townhouse'], must: ['parking', 'ac'], nice: ['laundry_in_unit', 'security'], areas: [{ kind: 'circle', label: 'USC / Expo Park', ...LA.expo, radiusM: 1800 }, { kind: 'circle', label: 'Downtown LA', ...LA.dtla, radiusM: 1500 }], daysAgo: 12, views: 46 },
  { email: 'ava.nguyen@usc.edu', campus: 'usc', title: 'Room near campus, June–August, dog-friendly', description: 'MPH summer practicum in LA. Looking for a room (private bath ideally) within 20 min of campus. I have a small, well-behaved dog, so pet-friendly only.\n\n暑期找 USC 附近允许养狗的房间，6 到 8 月。', budget: [900, 1300], moveIn: ['2027-06-01', '2027-06-15'], moveOut: '2027-08-20', flex: 5, group: 1, bedroomsMin: 0, furnished: 'full', pets: true, types: ['room', 'studio'], must: ['furnished'], nice: ['private_bath', 'ac'], areas: [{ kind: 'campus', label: 'USC', campusId: 'usc' }], daysAgo: 9, views: 20 },
  { email: 'hongyu.shi@usc.edu', campus: 'usc', title: 'Marshall 找 Koreatown 1B，9 月起长租', description: '想住 Koreatown，地铁 D 线直达，9 月起长租一居室，不需要家具，有车位。\n\nLooking for a long-term 1B in Koreatown (D Line) from September, unfurnished OK, parking needed.', budget: [1700, 2300], moveIn: ['2027-09-01', '2027-09-20'], moveOut: null, flex: 10, group: 1, bedroomsMin: 1, furnished: 'any', parking: true, types: ['apartment'], must: ['parking'], nice: ['gym', 'dishwasher'], areas: [{ kind: 'circle', label: 'Koreatown', ...LA.ktown, radiusM: 1500 }], daysAgo: 19, views: 29, status: 'paused' },
  { email: 'jingyi.cao@usc.edu', campus: 'usc', scope: 'nationwide', title: 'Summer internship in Seattle — furnished studio June–Aug', description: 'Interning in South Lake Union. Need a furnished studio or room with a short bus/light-rail commute, June through August.\n\n6 月到 8 月在西雅图实习，找带家具 studio 或合租房间。', budget: [1500, 2200], moveIn: ['2027-06-05', '2027-06-20'], moveOut: '2027-08-28', flex: 5, group: 1, bedroomsMin: 0, furnished: 'full', types: ['studio', 'room'], must: ['furnished'], nice: ['wifi'], areas: [{ kind: 'city', label: 'Seattle, WA', city: 'Seattle', state: 'WA' }, { kind: 'campus', label: 'UW 周边', campusId: 'uw' }], daysAgo: 14, views: 17 },
];

// ------------------------------------------------------------------ fallback listings (only when the listings seed has not run)
type ListingSeed = {
  email: string; campus: string; title: string; description: string; type: string; bedrooms: number; bathrooms: number; price: number; deposit?: number;
  furnished: 'none' | 'partial' | 'full'; from: string; to: string | null; address: string; city: string; state: string; zip: string; lat: number; lng: number;
  neighborhood: string; amenities: string[]; parking?: 'none' | 'street' | 'lot' | 'garage'; pets?: boolean; gender?: 'any' | 'female' | 'male'; utilities?: boolean; listingType?: string; photo: number;
};
const FALLBACK_LISTINGS: ListingSeed[] = [
  { email: 'yuting.chen@u.northwestern.edu', campus: 'northwestern', title: '1735 Chicago Ave 带家具 Studio，1 月起', description: 'Downtown Evanston 电梯楼 studio，全套家具，楼内洗衣房和健身房，1 月初到 6 月底转租。\nFurnished studio in an elevator building downtown, gym and laundry in building, January to end of June.', type: 'studio', bedrooms: 0, bathrooms: 1, price: 1350, furnished: 'full', from: '2027-01-05', to: '2027-06-30', address: '1735 Chicago Ave', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0481, lng: -87.6792, neighborhood: 'Downtown Evanston', amenities: ['wifi', 'laundry_in_building', 'gym', 'elevator', 'desk', 'ac'], utilities: true, photo: 1 },
  { email: 'chloe.deng@u.northwestern.edu', campus: 'northwestern', title: 'Davis St 1B1B 整租转租，带家具，1–6 月', description: '离 Davis 站步行 5 分钟，一居室带全套家具和洗烘一体，1 月到 6 月，仅限女生。\n1B1B five minutes from Davis St, fully furnished with in-unit washer/dryer, Jan–Jun, female only.', type: 'apartment', bedrooms: 1, bathrooms: 1, price: 1450, furnished: 'full', from: '2027-01-02', to: '2027-06-28', address: '820 Davis St', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0459, lng: -87.6822, neighborhood: 'Downtown Evanston', amenities: ['wifi', 'laundry_in_unit', 'dishwasher', 'elevator', 'desk'], gender: 'female', photo: 2 },
  { email: 'ruoxi.sun@u.northwestern.edu', campus: 'northwestern', title: '2B2B lease takeover near Dempster, parking included', description: 'Taking over our lease from August: 2 bed 2 bath on Sherman near Dempster, one garage spot, dishwasher, central AC.\n8 月起 lease takeover，Sherman Ave 2B2B，含一个车库车位。', type: 'apartment', bedrooms: 2, bathrooms: 2, price: 2150, deposit: 2150, furnished: 'partial', from: '2027-08-20', to: null, address: '1210 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60202', lat: 42.0415, lng: -87.6820, neighborhood: 'Dempster', amenities: ['dishwasher', 'ac', 'laundry_in_building', 'gym', 'bike_storage'], parking: 'garage', listingType: 'lease_takeover', photo: 3 },
  { email: 'nina.zhou@u.northwestern.edu', campus: 'northwestern', title: 'Noyes 站旁 2B1B，8 月起，允许宠物', description: '离 Noyes 紫线站 2 分钟，两室一卫，可养猫狗，街边停车，8 月底可入住，一年起。\n2B1B two minutes from the Noyes Purple Line stop, pets OK, street parking, from late August, 12-month lease.', type: 'apartment', bedrooms: 2, bathrooms: 1, price: 1850, furnished: 'none', from: '2027-08-25', to: null, address: '2020 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0579, lng: -87.6829, neighborhood: 'Noyes', amenities: ['laundry_in_building', 'heating', 'near_grocery', 'bike_storage'], parking: 'street', pets: true, photo: 4 },
  { email: 'landlord@evanstonhomes.com', campus: 'northwestern', title: 'Central St 1B，安静采光好，7 月起长租', description: 'Central St 商业街旁的一居室，南向采光，楼内洗衣房，长期租约，7 月 1 日可入住，允许猫。\nQuiet south-facing 1B steps from Central St shops, laundry in building, 12-month lease from July 1, cats OK.', type: 'apartment', bedrooms: 1, bathrooms: 1, price: 1395, deposit: 1395, furnished: 'none', from: '2027-07-01', to: null, address: '2630 Central St', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0645, lng: -87.6901, neighborhood: 'Central St', amenities: ['laundry_in_building', 'heating', 'near_grocery', 'balcony'], parking: 'street', pets: true, listingType: 'new_lease', photo: 5 },
  { email: 'landlord@evanstonhomes.com', campus: 'northwestern', title: 'Main St 3B1.5B 整栋，带车道，9 月起', description: '南 Evanston 三室一卫半的独栋，私家车道可停两辆车，洗衣机烘干机在家，后院，9 月 1 日起一年。\nThree-bedroom house in South Evanston, driveway for two cars, in-unit laundry, backyard, 12-month lease from September 1.', type: 'house', bedrooms: 3, bathrooms: 1.5, price: 3100, deposit: 3100, furnished: 'none', from: '2027-09-01', to: null, address: '915 Main St', city: 'Evanston', state: 'IL', zip: '60202', lat: 42.0338, lng: -87.6845, neighborhood: 'South Evanston', amenities: ['laundry_in_unit', 'dishwasher', 'ac', 'heating', 'balcony'], parking: 'lot', pets: true, listingType: 'new_lease', photo: 6 },
  { email: 'evanston.rentals@gmail.com', campus: 'northwestern', title: 'Furnished room in 3B near Foster, Jan–Jun', description: 'Private room in a quiet 3-bedroom flat near Foster St, furnished (bed, desk, closet), shared kitchen and bath with two grad students. Wi-Fi included.\nFoster 附近三室合租的一个带家具房间，1 月到 6 月，室友是两位研究生。', type: 'room', bedrooms: 1, bathrooms: 1, price: 880, furnished: 'full', from: '2027-01-01', to: '2027-06-30', address: '2015 Orrington Ave', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0566, lng: -87.6796, neighborhood: 'Foster', amenities: ['wifi', 'desk', 'laundry_in_building', 'kitchen'], utilities: true, photo: 7 },
  { email: 'evanston.rentals@gmail.com', campus: 'northwestern', title: 'Summer sublet 2B2B on Hinman, furnished, June–Aug', description: 'Two-bedroom, two-bath, fully furnished, central AC, one block from the lake. Available June 10 through August 31. Great for two.\n夏季转租，Hinman Ave 带家具 2B2B，离湖一个街区，6 月 10 日到 8 月 31 日。', type: 'apartment', bedrooms: 2, bathrooms: 2, price: 1900, furnished: 'full', from: '2027-06-10', to: '2027-08-31', address: '1500 Hinman Ave', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0439, lng: -87.6753, neighborhood: 'Lakeshore', amenities: ['wifi', 'ac', 'laundry_in_building', 'dishwasher', 'elevator'], listingType: 'short_term', photo: 8 },
  { email: 'bob@u.northwestern.edu', campus: 'northwestern', title: '暑期转租 Studio，6 月中到 8 月底，有车位', description: '去湾区实习，转租我的 studio，带家具，楼后有车位，近 Dempster 站。\nSubletting my furnished studio mid-June to end of August while I intern in the Bay Area; parking behind the building, near Dempster station.', type: 'studio', bedrooms: 0, bathrooms: 1, price: 1150, furnished: 'full', from: '2027-06-14', to: '2027-08-30', address: '1301 Chicago Ave', city: 'Evanston', state: 'IL', zip: '60202', lat: 42.0405, lng: -87.6795, neighborhood: 'Dempster', amenities: ['wifi', 'ac', 'laundry_in_building', 'desk'], parking: 'lot', listingType: 'short_term', photo: 9 },
  { email: 'yuting.chen@u.northwestern.edu', campus: 'northwestern', title: 'Rogers Park 1B，7 月起，离紫线 Howard 站 5 分钟', description: '一居室，不带家具，有停车位，允许宠物，7 月 1 日起长租。到 Evanston 坐紫线两站。\nUnfurnished 1B in Rogers Park, parking spot, pets OK, long-term from July 1, two Purple Line stops to Evanston.', type: 'apartment', bedrooms: 1, bathrooms: 1, price: 1250, deposit: 1250, furnished: 'none', from: '2027-07-01', to: null, address: '7500 N Ashland Ave', city: 'Chicago', state: 'IL', zip: '60626', lat: 42.0185, lng: -87.6700, neighborhood: 'Rogers Park', amenities: ['laundry_in_building', 'heating', 'near_grocery'], parking: 'lot', pets: true, listingType: 'new_lease', photo: 10 },
  { email: 'ruoxi.sun@u.northwestern.edu', campus: 'northwestern', title: 'Shared room in downtown 2B, Dec–Jun, female', description: 'One bed in a shared bedroom (two beds) in a downtown 2B with three friendly roommates, furnished, utilities included. December through June.\n市中心合租公寓的一张床位，带家具含水电，12 月到 6 月，仅限女生。', type: 'shared_room', bedrooms: 1, bathrooms: 1, price: 620, furnished: 'full', from: '2026-12-01', to: '2027-06-30', address: '1620 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201', lat: 42.0470, lng: -87.6818, neighborhood: 'Downtown Evanston', amenities: ['wifi', 'laundry_in_building', 'kitchen', 'utilities_included'], gender: 'female', utilities: true, photo: 11 },
  { email: 'meilin.gao@illinois.edu', campus: 'uiuc', title: 'Urbana 2B1B lease takeover，1 月起，允许宠物', description: '两室一卫，洗烘在家，院子可以遛猫，1 月起接手到 8 月。\n2B1B in Urbana, in-unit laundry, cat-friendly, lease takeover January through August.', type: 'apartment', bedrooms: 2, bathrooms: 1, price: 1250, furnished: 'partial', from: '2027-01-05', to: '2027-08-15', address: '1004 W Main St', city: 'Urbana', state: 'IL', zip: '61801', lat: 40.1128, lng: -88.2180, neighborhood: 'Urbana', amenities: ['laundry_in_unit', 'dishwasher', 'ac', 'heating'], parking: 'lot', pets: true, listingType: 'lease_takeover', photo: 12 },
  { email: 'yuxuan.li@illinois.edu', campus: 'uiuc', title: 'Green St 带家具 1B，8 月起', description: 'Campustown 中心的一居室，带家具，健身房，走路到 Siebel 8 分钟，8 月中起一年。\nFurnished 1B in the middle of campustown, gym in building, 8-minute walk to Siebel, 12 months from mid-August.', type: 'apartment', bedrooms: 1, bathrooms: 1, price: 1050, furnished: 'full', from: '2027-08-12', to: null, address: '519 E Green St', city: 'Champaign', state: 'IL', zip: '61820', lat: 40.1102, lng: -88.2360, neighborhood: 'Campustown', amenities: ['wifi', 'gym', 'elevator', 'furnished', 'laundry_in_building', 'ac'], listingType: 'new_lease', photo: 13 },
  { email: 'meilin.gao@illinois.edu', campus: 'uiuc', title: 'Summer room near Green St, AC + Wi-Fi, May–Aug', description: 'Private room in a 4B house two blocks from Green St, central AC, Wi-Fi included, May 15 to August 15.\nGreen St 附近四室合租的单间，5 月中到 8 月中，有空调。', type: 'room', bedrooms: 1, bathrooms: 1, price: 520, furnished: 'full', from: '2027-05-15', to: '2027-08-15', address: '306 E John St', city: 'Champaign', state: 'IL', zip: '61820', lat: 40.1075, lng: -88.2378, neighborhood: 'Campustown', amenities: ['wifi', 'ac', 'laundry_in_unit', 'kitchen'], utilities: true, listingType: 'short_term', photo: 14 },
  { email: 'ziyang.pan@nyu.edu', campus: 'nyu', title: 'Greenwich Village furnished studio, Jan–May', description: 'Furnished studio on Bleecker, elevator and laundry in building, 6 minutes to Washington Square. January through May.\nBleecker St 带家具 studio，1 月到 5 月，电梯楼。', type: 'studio', bedrooms: 0, bathrooms: 1, price: 2400, furnished: 'full', from: '2027-01-08', to: '2027-05-31', address: '140 Bleecker St', city: 'New York', state: 'NY', zip: '10012', lat: 40.7287, lng: -73.9995, neighborhood: 'Greenwich Village', amenities: ['wifi', 'elevator', 'laundry_in_building', 'desk', 'ac'], photo: 15 },
  { email: 'manhattan.lets@outlook.com', campus: 'nyu', title: 'East Village 合租房间，女生，9 月起', description: 'East Village 三室公寓里的一个房间，两位女生室友（NYU 研究生），楼内洗衣，9 月 1 日起一年。\nRoom in an East Village 3B with two female NYU grad students, laundry in building, 12 months from September 1.', type: 'room', bedrooms: 1, bathrooms: 1, price: 1450, furnished: 'partial', from: '2027-09-01', to: null, address: '330 E 6th St', city: 'New York', state: 'NY', zip: '10003', lat: 40.7263, lng: -73.9855, neighborhood: 'East Village', amenities: ['laundry_in_building', 'wifi', 'kitchen'], gender: 'female', listingType: 'new_lease', photo: 16 },
  { email: 'manhattan.lets@outlook.com', campus: 'nyu', title: 'Williamsburg 2B，电梯楼带阳台，8 月起', description: 'Bedford 站旁两室，电梯楼，阳台朝曼哈顿，楼内洗衣，8 月 20 日起一年。\n2B near Bedford Ave, elevator building with a Manhattan-facing balcony, laundry in building, 12 months from August 20.', type: 'apartment', bedrooms: 2, bathrooms: 1, price: 3900, deposit: 3900, furnished: 'none', from: '2027-08-20', to: null, address: '150 N 6th St', city: 'Brooklyn', state: 'NY', zip: '11249', lat: 40.7175, lng: -73.9594, neighborhood: 'Williamsburg', amenities: ['elevator', 'balcony', 'laundry_in_building', 'dishwasher', 'gym'], listingType: 'new_lease', photo: 17 },
  { email: 'kevin.xie@nyu.edu', campus: 'nyu', title: 'Summer sublet: furnished room in Williamsburg, June–Aug', description: 'My room in a 2B while I intern in Seattle: furnished, desk, AC, Wi-Fi, 5 min to the L. June 1 to August 31. Roommate is a quiet PhD student.\n暑期转租 Williamsburg 合租房间，6 月 1 日到 8 月 31 日。', type: 'room', bedrooms: 1, bathrooms: 1, price: 1350, furnished: 'full', from: '2027-06-01', to: '2027-08-31', address: '245 Grand St', city: 'Brooklyn', state: 'NY', zip: '11211', lat: 40.7128, lng: -73.9585, neighborhood: 'Williamsburg', amenities: ['wifi', 'ac', 'desk', 'laundry_in_building'], listingType: 'short_term', photo: 18 },
  { email: 'hongyu.shi@usc.edu', campus: 'usc', title: 'Expo Park 2B2B，门禁小区带车位，8 月起', description: 'USC 南边门禁公寓，两室两卫，两个车位，健身房泳池，8 月 1 日起一年。\nGated community south of USC, 2B2B, two parking spots, gym and pool, 12 months from August 1.', type: 'apartment', bedrooms: 2, bathrooms: 2, price: 2900, deposit: 2900, furnished: 'none', from: '2027-08-01', to: null, address: '3800 S Figueroa St', city: 'Los Angeles', state: 'CA', zip: '90037', lat: 34.0162, lng: -118.2838, neighborhood: 'Exposition Park', amenities: ['security', 'gym', 'pool', 'ac', 'laundry_in_unit', 'dishwasher'], parking: 'garage', listingType: 'new_lease', photo: 19 },
  { email: 'jingyi.cao@usc.edu', campus: 'usc', title: 'University Village 带家具 1B，1 月到 5 月转租', description: '门禁楼，一居室全套家具，健身房，走路到 Viterbi 10 分钟，1 月 5 日到 5 月 20 日。\nGated building, fully furnished 1B, gym, 10-minute walk to Viterbi, January 5 to May 20.', type: 'apartment', bedrooms: 1, bathrooms: 1, price: 1950, furnished: 'full', from: '2027-01-05', to: '2027-05-20', address: '3335 S Figueroa St', city: 'Los Angeles', state: 'CA', zip: '90007', lat: 34.0245, lng: -118.2795, neighborhood: 'University Village', amenities: ['security', 'gym', 'wifi', 'ac', 'laundry_in_unit', 'elevator'], parking: 'garage', photo: 20 },
  { email: 'weichen.du@usc.edu', campus: 'usc', title: 'Furnished room near campus, dog OK, June–Aug', description: 'Private room with private bath in a 3B house 15 minutes from campus; we already have a dog, so yours is welcome. Furnished, AC. June through August.\n离校 15 分钟的独栋里一个带独卫的房间，允许养狗，6 到 8 月。', type: 'room', bedrooms: 1, bathrooms: 1, price: 1100, furnished: 'full', from: '2027-06-01', to: '2027-08-25', address: '2700 Menlo Ave', city: 'Los Angeles', state: 'CA', zip: '90007', lat: 34.0310, lng: -118.2905, neighborhood: 'West Adams', amenities: ['private_bath', 'ac', 'wifi', 'laundry_in_unit'], pets: true, listingType: 'short_term', photo: 21 },
  { email: 'hongyu.shi@usc.edu', campus: 'usc', title: 'Koreatown 1B with parking, D Line, from September', description: 'One-bedroom on Wilshire near Wilshire/Normandie station, gated garage spot, gym, dishwasher. 12 months from September 1.\nKoreatown 一居室，带车库车位，9 月 1 日起一年。', type: 'apartment', bedrooms: 1, bathrooms: 1, price: 2050, deposit: 2050, furnished: 'none', from: '2027-09-01', to: null, address: '3400 Wilshire Blvd', city: 'Los Angeles', state: 'CA', zip: '90010', lat: 34.0618, lng: -118.3005, neighborhood: 'Koreatown', amenities: ['gym', 'dishwasher', 'ac', 'security', 'laundry_in_building'], parking: 'garage', listingType: 'new_lease', photo: 22 },
];

function userIdByEmail(email: string): string | null {
  return q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase()])?.id ?? null;
}
const fallbackListingId = (i: number) => `wseed-l-${String(i + 1).padStart(2, '0')}`;

function seedFallbackListings(t: string): number {
  q.run("DELETE FROM listings WHERE id LIKE 'wseed-l-%'");
  const others = q.count("SELECT COUNT(*) FROM listings WHERE status = 'active'");
  if (others > 0) return 0;
  let n = 0;
  FALLBACK_LISTINGS.forEach((l, i) => {
    const owner = userIdByEmail(l.email);
    if (!owner) return;
    const id = fallbackListingId(i);
    const trust = q.get<{ trust_level: number }>('SELECT trust_level FROM users WHERE id = ?', [owner])?.trust_level ?? 0;
    const campus = getCampus(l.campus);
    const commute = commuteEstimate(l.campus, l.lat, l.lng);
    const distance = campus ? Math.round(haversineM({ lat: l.lat, lng: l.lng }, { lat: campus.lat, lng: campus.lng })) : null;
    const cover = insertSeedUpload({ path: `seed/rooms/r${String(((l.photo - 1) % 60) + 1).padStart(2, '0')}.svg`, purpose: 'seed' });
    const publishedAt = new Date(nowMs() - (3 + i * 2) * DAY).toISOString();
    q.insert('listings', {
      id, owner_id: owner, campus_id: l.campus, title: l.title, description: l.description, listing_type: l.listingType ?? 'sublet', property_type: l.type,
      address_line1: l.address, city: l.city, state: l.state, zip: l.zip, country: 'US', lat: l.lat, lng: l.lng, geocode_precision: 'rooftop', hide_exact_address: 1,
      neighborhood: l.neighborhood, price_cents: l.price * 100, deposit_cents: (l.deposit ?? 0) * 100, utilities_included: l.utilities ? 1 : 0,
      bedrooms: l.bedrooms, bathrooms: l.bathrooms, furnished: l.furnished, available_from: l.from, available_to: l.to, min_term_months: l.to ? 1 : 12,
      lease_type: l.listingType === 'lease_takeover' ? 'takeover' : l.listingType === 'new_lease' ? 'new_lease' : 'sublease', roommates_count: l.type === 'room' || l.type === 'shared_room' ? 2 : 0,
      gender_pref: l.gender ?? 'any', pets_allowed: l.pets ? 1 : 0, parking: l.parking ?? 'none', status: 'active', moderation_status: 'ok',
      is_verified_listing: trust >= 2 ? 1 : 0, published_at: publishedAt, expires_at: new Date(Date.parse(l.from) + 60 * DAY).toISOString(),
      cover_upload_id: cover, distance_to_campus_m: distance, commute_walk_min: commute?.walkMin ?? null, commute_bike_min: commute?.bikeMin ?? null,
      commute_shuttle_min: commute?.shuttleMin ?? null, nearest_stop_id: commute?.nearestStop?.id ?? null, nearest_stop_m: commute?.nearestStop ? Math.round(commute.nearestStop.distanceM) : null,
      created_at: publishedAt, updated_at: t,
    });
    q.insert('listing_photos', { id: uid(), listing_id: id, upload_id: cover, sort_order: 0, caption: null, created_at: t });
    const second = insertSeedUpload({ path: `seed/rooms/r${String(((l.photo + 29) % 60) + 1).padStart(2, '0')}.svg`, purpose: 'seed' });
    if (second !== cover) q.insert('listing_photos', { id: uid(), listing_id: id, upload_id: second, sort_order: 1, caption: null, created_at: t });
    for (const a of new Set(l.amenities.filter((x) => x !== 'furnished'))) q.run('INSERT OR IGNORE INTO listing_amenities (listing_id, amenity) VALUES (?, ?)', [id, a]);
    n++;
  });
  return n;
}

export default async function seed(_db: DatabaseSync): Promise<void> {
  const t = nowIso();
  const ids: string[] = [];
  q.tx(() => {
    q.run('DELETE FROM matches');
    q.run('DELETE FROM wanted_areas');
    q.run('DELETE FROM wanted_posts');
    const fallback = seedFallbackListings(t);
    if (fallback) logger.info({ count: fallback }, 'wanted seed: inserted fallback demo listings (listings seed not present)');

    WANTED.forEach((w, i) => {
      const userId = userIdByEmail(w.email);
      if (!userId) {
        logger.warn({ email: w.email }, 'wanted seed: author not found, skipped');
        return;
      }
      const id = `wseed-w-${String(i + 1).padStart(2, '0')}`;
      const createdAt = new Date(nowMs() - (w.daysAgo ?? 5) * DAY - (i % 7) * 3_600_000).toISOString();
      const expiresAt = new Date(Date.parse(w.moveIn[1] + 'T00:00:00Z') + 14 * DAY).toISOString();
      q.insert('wanted_posts', {
        id, user_id: userId, campus_id: w.campus, scope: w.scope ?? 'campus', title: w.title, description: w.description,
        budget_min_cents: w.budget[0] * 100, budget_max_cents: w.budget[1] * 100, move_in_from: w.moveIn[0], move_in_to: w.moveIn[1], move_out_date: w.moveOut ?? null,
        flexible_days: w.flex ?? 0, group_size: w.group ?? 1, bedrooms_min: w.bedroomsMin ?? 0, furnished_pref: w.furnished ?? 'any', gender_pref: w.gender ?? 'any',
        has_pets: w.pets ? 1 : 0, needs_parking: w.parking ? 1 : 0, property_types_json: JSON.stringify(w.types ?? []), must_haves_json: JSON.stringify(w.must ?? []),
        nice_to_haves_json: JSON.stringify(w.nice ?? []), status: w.status ?? 'active', moderation_status: 'ok', view_count: w.views ?? 0, expires_at: expiresAt,
        created_at: createdAt, updated_at: createdAt,
      });
      (w.areas ?? []).forEach((a, j) => {
        q.insert('wanted_areas', {
          id: uid(), wanted_id: id, label: a.label, kind: a.kind,
          lat: a.kind === 'circle' ? a.lat : null, lng: a.kind === 'circle' ? a.lng : null, radius_m: a.kind === 'circle' ? a.radiusM : null,
          city: a.kind === 'city' ? a.city : null, state: a.kind === 'city' ? a.state : null, campus_id: a.kind === 'campus' ? a.campusId : null, sort_order: j,
        });
      });
      ids.push(id);
    });
  });

  // precompute matches (no notifications from the seed)
  let total = 0;
  for (const id of ids) total += recomputeForWanted(id, { notify: 'none' }).count;

  // a few lived-in states: seen rows + two host offers with real conversations
  q.run("UPDATE matches SET status = 'seen' WHERE wanted_id IN ('wseed-w-01','wseed-w-02') AND score >= 60 AND rowid % 2 = 0");
  seedOffer('wseed-w-01', 'chloe.deng@u.northwestern.edu', '你好！看到你在找 Davis 附近的一居室，我 1 月初转租的 1B1B 带家具、有洗烘，离 Davis 站 5 分钟，有兴趣可以约看房。');
  seedOffer('wseed-w-21', 'yuxuan.li@illinois.edu', 'Hi! Your request matches my Green St 1B (furnished, gym in building). Happy to do a video tour.');
  logger.info({ posts: ids.length, matches: total }, 'wanted seed done');
}

function seedOffer(wantedId: string, hostEmail: string, message: string): void {
  const w = q.get<{ id: string; user_id: string; campus_id: string }>('SELECT id, user_id, campus_id FROM wanted_posts WHERE id = ?', [wantedId]);
  const hostId = userIdByEmail(hostEmail);
  if (!w || !hostId) return;
  const listing = q.get<{ id: string }>("SELECT id FROM listings WHERE owner_id = ? AND status = 'active' ORDER BY published_at DESC LIMIT 1", [hostId]);
  if (!listing) return;
  const { conversation, created } = openConversation({ kind: 'direct', memberIds: [hostId, w.user_id], campusId: w.campus_id, context: { type: 'listing', id: listing.id }, createdBy: hostId });
  if (created) {
    const lc = contextCardFor('listing', listing.id);
    if (lc) postContextCard(conversation.id, hostId, lc);
    const wc = contextCardFor('wanted', w.id);
    if (wc) postContextCard(conversation.id, hostId, wc);
    postMessage(conversation.id, hostId, 'text', message, { notify: false });
  }
  const t = nowIso();
  const existing = q.get<{ id: string }>('SELECT id FROM matches WHERE wanted_id = ? AND listing_id = ?', [w.id, listing.id]);
  if (existing) {
    q.run("UPDATE matches SET status = 'offered', offered_by_host = 1, conversation_id = ?, updated_at = ? WHERE id = ?", [conversation.id, t, existing.id]);
  } else {
    const full = q.get<Parameters<typeof scorePair>[0]>('SELECT * FROM wanted_posts WHERE id = ?', [w.id]);
    const s = full ? scorePair(full, listing.id) : null;
    q.insert('matches', { id: uid(), wanted_id: w.id, listing_id: listing.id, score: s?.score ?? 0, breakdown_json: JSON.stringify(s?.breakdown ?? {}), status: 'offered', offered_by_host: 1, conversation_id: conversation.id, computed_at: t, updated_at: t });
  }
  q.run('UPDATE wanted_posts SET offer_count = offer_count + 1 WHERE id = ?', [w.id]);
}
