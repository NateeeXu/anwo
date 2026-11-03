// server/src/db/seed/map.ts — OWNED BY THE `map` MODULE AGENT.
// Campus POIs (Northwestern ≈ 44, UIUC / NYU / USC ≈ 12–14 each) with bilingual names and real-street coordinates,
// student place suggestions (pending / approved / rejected) for the admin queue,
// a warmed forward-geocode cache for the Evanston / Champaign / Manhattan / LA addresses the demo listings use
// (so the geocode search answers with rooftop precision even with GEOCODE_OFFLINE=1), and a few map analytics events.
//
// Ids are deterministic (`seed-poi-<campus>-<slug>`, `seed-geo-<n>`) so re-seeding replaces rows instead of duplicating.
import type { DatabaseSync } from 'node:sqlite';
import type { PoiCategory } from '@shared/enums';
import { q } from '../index';
import { logEvent } from '../../lib/events';
import { nowIso, isoPlus, HOUR, DAY } from '../../lib/time';

export const version = 3;

const PREFIX = 'seed-poi-';
const GEO_PREFIX = 'seed-geo-';

type PoiSeed = { slug: string; name: string; nameZh: string; category: PoiCategory; lat: number; lng: number; address?: string; url?: string; tags?: string[]; sort?: number };

// ---------------------------------------------------------------- Northwestern (Evanston)
const NU: PoiSeed[] = [
  // campus buildings
  { slug: 'tech', name: 'Technological Institute', nameZh: '科技学院（Tech）', category: 'building', lat: 42.0577, lng: -87.6762, address: '2145 Sheridan Rd, Evanston, IL 60208', tags: ['engineering', 'lectures'], sort: 1 },
  { slug: 'norris', name: 'Norris University Center', nameZh: 'Norris 学生中心', category: 'building', lat: 42.0533, lng: -87.6727, address: '1999 Campus Dr, Evanston, IL 60208', tags: ['student center', 'food court'], sort: 2 },
  { slug: 'kellogg', name: 'Kellogg Global Hub', nameZh: 'Kellogg 商学院', category: 'building', lat: 42.0563, lng: -87.6736, address: '2211 Campus Dr, Evanston, IL 60208', tags: ['business'] },
  { slug: 'mudd', name: 'Mudd Hall', nameZh: 'Mudd 楼', category: 'building', lat: 42.0582, lng: -87.6744, address: '2233 Tech Dr, Evanston, IL 60208', tags: ['cs', 'library'] },
  { slug: 'annenberg', name: 'Annenberg Hall', nameZh: 'Annenberg 楼', category: 'building', lat: 42.0567, lng: -87.6784, address: '2120 Campus Dr, Evanston, IL 60208' },
  { slug: 'kresge', name: 'Kresge Centennial Hall', nameZh: 'Kresge 楼', category: 'building', lat: 42.0518, lng: -87.6752, address: '1880 Campus Dr, Evanston, IL 60208' },
  { slug: 'sail', name: 'Segal Visitors Center', nameZh: 'Segal 访客中心', category: 'landmark', lat: 42.0497, lng: -87.6734, address: '1841 Sheridan Rd, Evanston, IL 60208', tags: ['parking', 'tours'] },
  { slug: 'arch', name: 'The Arch (Weber Arch)', nameZh: '西北大学拱门', category: 'landmark', lat: 42.0515, lng: -87.6778, address: '1800 Sheridan Rd, Evanston, IL 60208', tags: ['photo spot'] },
  { slug: 'lakefill', name: 'Lakefill', nameZh: '湖滨填地（Lakefill）', category: 'landmark', lat: 42.0545, lng: -87.6690, address: 'Lakefill, Evanston, IL 60208', tags: ['running', 'sunrise'] },
  { slug: 'ryan-field', name: 'Ryan Field', nameZh: 'Ryan 体育场', category: 'landmark', lat: 42.0655, lng: -87.6926, address: '1501 Central St, Evanston, IL 60201', tags: ['football'] },
  { slug: 'welsh-ryan', name: 'Welsh-Ryan Arena', nameZh: 'Welsh-Ryan 体育馆', category: 'landmark', lat: 42.0645, lng: -87.6918, address: '2705 Ashland Ave, Evanston, IL 60201', tags: ['basketball'] },
  { slug: 'intl-office', name: 'Office of International Student & Scholar Services', nameZh: '国际学生办公室（OISS）', category: 'building', lat: 42.0505, lng: -87.6805, address: '630 Dartmouth Pl, Evanston, IL 60208', url: 'https://www.northwestern.edu/international/', tags: ['i-20', 'visa', 'opt'] },
  // libraries
  { slug: 'main-library', name: 'University Library (Main)', nameZh: '主图书馆', category: 'library', lat: 42.0530, lng: -87.6746, address: '1970 Campus Dr, Evanston, IL 60208', url: 'https://www.library.northwestern.edu/', tags: ['24h core', 'study rooms'], sort: 1 },
  { slug: 'deering', name: 'Deering Library', nameZh: 'Deering 图书馆', category: 'library', lat: 42.0537, lng: -87.6757, address: '1937 Sheridan Rd, Evanston, IL 60208', tags: ['quiet'] },
  { slug: 'seeley-mudd', name: 'Seeley G. Mudd Library', nameZh: 'Mudd 科学图书馆', category: 'library', lat: 42.0583, lng: -87.6744, address: '2233 Tech Dr, Evanston, IL 60208', tags: ['science', 'engineering'] },
  { slug: 'evanston-public', name: 'Evanston Public Library', nameZh: 'Evanston 公共图书馆', category: 'library', lat: 42.0481, lng: -87.6806, address: '1703 Orrington Ave, Evanston, IL 60201', url: 'https://www.epl.org/', tags: ['free wifi', 'printing'] },
  // dining
  { slug: 'allison', name: 'Allison Dining Commons', nameZh: 'Allison 食堂', category: 'dining', lat: 42.0523, lng: -87.6805, address: '2000 Sheridan Rd, Evanston, IL 60208', tags: ['meal plan'] },
  { slug: 'sargent', name: 'Sargent Dining Commons', nameZh: 'Sargent 食堂（北校区）', category: 'dining', lat: 42.0591, lng: -87.6755, address: '2245 Sheridan Rd, Evanston, IL 60208', tags: ['meal plan', 'north campus'] },
  { slug: 'joy-yee', name: 'Joy Yee Noodle', nameZh: 'Joy Yee 面馆', category: 'dining', lat: 42.0465, lng: -87.6815, address: '521 Davis St, Evanston, IL 60201', tags: ['bubble tea', 'asian'] },
  { slug: 'lao-sze-chuan', name: 'Lao Sze Chuan Evanston', nameZh: '老四川（Evanston）', category: 'dining', lat: 42.0468, lng: -87.6807, address: '1633 Orrington Ave, Evanston, IL 60201', tags: ['sichuan', 'group dinner'] },
  { slug: 'kung-fu-tea', name: 'Kung Fu Tea', nameZh: '功夫茶', category: 'dining', lat: 42.0479, lng: -87.6821, address: '1609 Sherman Ave, Evanston, IL 60201', tags: ['bubble tea'] },
  // grocery
  { slug: 'whole-foods', name: 'Whole Foods Market Evanston', nameZh: 'Whole Foods 超市', category: 'grocery', lat: 42.0432, lng: -87.6799, address: '1640 Chicago Ave, Evanston, IL 60201', tags: ['organic', 'walkable'], sort: 1 },
  { slug: 'trader-joes', name: "Trader Joe's Evanston", nameZh: "Trader Joe's 超市", category: 'grocery', lat: 42.0455, lng: -87.6880, address: '1211 Chicago Ave, Evanston, IL 60202', tags: ['budget', 'frozen'] },
  { slug: 'target', name: 'Target Evanston', nameZh: 'Target 百货', category: 'grocery', lat: 42.0446, lng: -87.6819, address: '1616 Sherman Ave, Evanston, IL 60201', tags: ['household', 'move-in'] },
  { slug: 'jewel-osco', name: 'Jewel-Osco', nameZh: 'Jewel-Osco 超市', category: 'grocery', lat: 42.0399, lng: -87.6793, address: '1128 Chicago Ave, Evanston, IL 60202', tags: ['24h', 'pharmacy'] },
  { slug: 'h-mart', name: 'H Mart Niles', nameZh: 'H Mart 韩国超市（Niles）', category: 'asian_grocery', lat: 42.0192, lng: -87.7832, address: '801 Civic Center Dr, Niles, IL 60714', tags: ['korean', 'carpool'] },
  { slug: 'mitsuwa', name: 'Mitsuwa Marketplace', nameZh: 'Mitsuwa 日本超市', category: 'asian_grocery', lat: 42.0493, lng: -87.9163, address: '100 E Algonquin Rd, Arlington Heights, IL 60005', tags: ['japanese', 'food court', 'carpool'] },
  { slug: 'tai-nam', name: 'Tai Nam Market', nameZh: '泰南超市（Argyle）', category: 'asian_grocery', lat: 41.9735, lng: -87.6598, address: '4925 N Broadway, Chicago, IL 60640', tags: ['chinese', 'vietnamese', 'red line'] },
  // transit
  { slug: 'davis-purple', name: 'Davis (CTA Purple Line)', nameZh: 'Davis 站（紫线）', category: 'transit', lat: 42.0471, lng: -87.6836, address: '1612 Benson Ave, Evanston, IL 60201', url: 'https://www.transitchicago.com/', tags: ['purple line', 'metra'], sort: 1 },
  { slug: 'foster-purple', name: 'Foster (CTA Purple Line)', nameZh: 'Foster 站（紫线）', category: 'transit', lat: 42.0543, lng: -87.6834, address: '900 Foster St, Evanston, IL 60201', tags: ['purple line'] },
  { slug: 'noyes-purple', name: 'Noyes (CTA Purple Line)', nameZh: 'Noyes 站（紫线）', category: 'transit', lat: 42.0582, lng: -87.6833, address: '901 Noyes St, Evanston, IL 60201', tags: ['purple line', 'north campus'] },
  { slug: 'central-purple', name: 'Central (CTA Purple Line)', nameZh: 'Central 站（紫线）', category: 'transit', lat: 42.0640, lng: -87.6855, address: '1100 Central St, Evanston, IL 60201', tags: ['purple line', 'ryan field'] },
  { slug: 'dempster-purple', name: 'Dempster (CTA Purple Line)', nameZh: 'Dempster 站（紫线）', category: 'transit', lat: 42.0412, lng: -87.6817, address: '1300 Sherman Ave, Evanston, IL 60201', tags: ['purple line'] },
  { slug: 'davis-metra', name: 'Davis Street (Metra UP-N)', nameZh: 'Davis 街 Metra 车站', category: 'transit', lat: 42.0468, lng: -87.6846, address: '900 Davis St, Evanston, IL 60201', url: 'https://metra.com/', tags: ['metra', 'ohare connection'] },
  { slug: 'main-metra', name: 'Main Street (Metra / Purple Line)', nameZh: 'Main 街站（Metra / 紫线）', category: 'transit', lat: 42.0337, lng: -87.6805, address: '836 Main St, Evanston, IL 60202', tags: ['metra', 'purple line'] },
  // banks
  { slug: 'chase', name: 'Chase Bank Evanston', nameZh: '大通银行（Chase）', category: 'bank', lat: 42.0474, lng: -87.6810, address: '1603 Orrington Ave, Evanston, IL 60201', tags: ['new account', 'atm'] },
  { slug: 'boa', name: 'Bank of America', nameZh: '美国银行（BoA）', category: 'bank', lat: 42.0463, lng: -87.6825, address: '1600 Sherman Ave, Evanston, IL 60201', tags: ['atm'] },
  { slug: 'wintrust', name: 'Wintrust Bank', nameZh: 'Wintrust 银行', category: 'bank', lat: 42.0478, lng: -87.6796, address: '1700 Chicago Ave, Evanston, IL 60201' },
  // health
  { slug: 'searle', name: 'Searle Health Service', nameZh: 'Searle 校医院', category: 'health', lat: 42.0565, lng: -87.6792, address: '633 Emerson St, Evanston, IL 60208', url: 'https://www.northwestern.edu/healthservice-evanston/', tags: ['student health', 'immunization'], sort: 1 },
  { slug: 'nm-immediate', name: 'Northwestern Medicine Immediate Care', nameZh: 'Northwestern Medicine 急诊门诊', category: 'health', lat: 42.0443, lng: -87.6983, address: '1704 Maple Ave, Evanston, IL 60201', tags: ['urgent care'] },
  { slug: 'evanston-hospital', name: 'Evanston Hospital', nameZh: 'Evanston 医院', category: 'health', lat: 42.0633, lng: -87.6835, address: '2650 Ridge Ave, Evanston, IL 60201', tags: ['emergency'] },
  { slug: 'walgreens', name: 'Walgreens Davis St', nameZh: 'Walgreens 药房', category: 'pharmacy', lat: 42.0470, lng: -87.6795, address: '1706 Sherman Ave, Evanston, IL 60201', tags: ['prescriptions', 'photo'] },
  { slug: 'cvs', name: 'CVS Pharmacy', nameZh: 'CVS 药房', category: 'pharmacy', lat: 42.0432, lng: -87.6826, address: '1601 Sherman Ave, Evanston, IL 60201' },
  // gyms
  { slug: 'sprac', name: 'Henry Crown Sports Pavilion (SPAC)', nameZh: 'SPAC 健身中心', category: 'gym', lat: 42.0604, lng: -87.6735, address: '2311 Campus Dr, Evanston, IL 60208', tags: ['pool', 'climbing'], sort: 1 },
  { slug: 'blomquist', name: 'Blomquist Recreation Center', nameZh: 'Blomquist 运动中心', category: 'gym', lat: 42.0508, lng: -87.6786, address: '617 Foster St, Evanston, IL 60208', tags: ['basketball'] },
  { slug: 'la-fitness', name: 'LA Fitness Evanston', nameZh: 'LA Fitness 健身房', category: 'gym', lat: 42.0441, lng: -87.6865, address: '1250 Chicago Ave, Evanston, IL 60202' },
  // post
  { slug: 'usps', name: 'USPS Evanston Main Post Office', nameZh: 'Evanston 邮局', category: 'post', lat: 42.0441, lng: -87.6850, address: '1101 Davis St, Evanston, IL 60201', tags: ['passport', 'packages'] },
];

// ---------------------------------------------------------------- UIUC (Urbana-Champaign)
const UIUC: PoiSeed[] = [
  { slug: 'illini-union', name: 'Illini Union', nameZh: 'Illini 学生会', category: 'building', lat: 40.1093, lng: -88.2272, address: '1401 W Green St, Urbana, IL 61801', tags: ['student center'], sort: 1 },
  { slug: 'grainger', name: 'Grainger Engineering Library', nameZh: 'Grainger 工程图书馆', category: 'library', lat: 40.1125, lng: -88.2268, address: '1301 W Springfield Ave, Urbana, IL 61801', tags: ['24h', 'engineering'], sort: 1 },
  { slug: 'main-library', name: 'Main Library', nameZh: '主图书馆', category: 'library', lat: 40.1047, lng: -88.2288, address: '1408 W Gregory Dr, Urbana, IL 61801' },
  { slug: 'siebel', name: 'Thomas M. Siebel Center for CS', nameZh: 'Siebel 计算机楼', category: 'building', lat: 40.1138, lng: -88.2249, address: '201 N Goodwin Ave, Urbana, IL 61801', tags: ['cs'] },
  { slug: 'isss', name: 'International Student and Scholar Services', nameZh: '国际学生服务中心（ISSS）', category: 'building', lat: 40.1083, lng: -88.2241, address: '610 E John St, Champaign, IL 61820', url: 'https://isss.illinois.edu/', tags: ['visa', 'opt'] },
  { slug: 'arc', name: 'Activities and Recreation Center (ARC)', nameZh: 'ARC 健身中心', category: 'gym', lat: 40.1012, lng: -88.2360, address: '201 E Peabody Dr, Champaign, IL 61820', tags: ['pool', 'climbing'], sort: 1 },
  { slug: 'mckinley', name: 'McKinley Health Center', nameZh: 'McKinley 校医院', category: 'health', lat: 40.1054, lng: -88.2202, address: '1109 S Lincoln Ave, Urbana, IL 61801', tags: ['student health'] },
  { slug: 'county-market', name: 'County Market', nameZh: 'County Market 超市', category: 'grocery', lat: 40.1138, lng: -88.2325, address: '331 E Stoughton St, Champaign, IL 61820', tags: ['campus town'] },
  { slug: 'target', name: 'Target Campustown', nameZh: 'Target 百货（校园店）', category: 'grocery', lat: 40.1108, lng: -88.2365, address: '603 S Sixth St, Champaign, IL 61820', tags: ['move-in'] },
  { slug: 'fresh-intl', name: 'Fresh International Market', nameZh: '鲜国际超市', category: 'asian_grocery', lat: 40.1151, lng: -88.2457, address: '505 S Neil St, Champaign, IL 61820', tags: ['chinese', 'hot food'], sort: 1 },
  { slug: 'am-ko', name: 'AM-KO Oriental Foods', nameZh: 'AM-KO 亚洲超市', category: 'asian_grocery', lat: 40.1101, lng: -88.2093, address: '101 E Springfield Ave, Champaign, IL 61820' },
  { slug: 'illinois-terminal', name: 'Illinois Terminal (MTD / Amtrak)', nameZh: 'Illinois 总站（MTD / Amtrak）', category: 'transit', lat: 40.1160, lng: -88.2425, address: '45 E University Ave, Champaign, IL 61820', url: 'https://mtd.org/', tags: ['amtrak', 'chicago bus'], sort: 1 },
  { slug: 'busey', name: 'Busey Bank Campus', nameZh: 'Busey 银行', category: 'bank', lat: 40.1107, lng: -88.2338, address: '501 E Green St, Champaign, IL 61820' },
  { slug: 'walgreens', name: 'Walgreens Green St', nameZh: 'Walgreens 药房', category: 'pharmacy', lat: 40.1103, lng: -88.2374, address: '503 E Green St, Champaign, IL 61820' },
];

// ---------------------------------------------------------------- NYU (Manhattan)
const NYU: PoiSeed[] = [
  { slug: 'bobst', name: 'Bobst Library', nameZh: 'Bobst 图书馆', category: 'library', lat: 40.7295, lng: -73.9972, address: '70 Washington Square S, New York, NY 10012', tags: ['12 floors', 'study'], sort: 1 },
  { slug: 'kimmel', name: 'Kimmel Center for University Life', nameZh: 'Kimmel 学生中心', category: 'building', lat: 40.7299, lng: -73.9979, address: '60 Washington Square S, New York, NY 10012', sort: 1 },
  { slug: 'stern', name: 'Stern School of Business', nameZh: 'Stern 商学院', category: 'building', lat: 40.7290, lng: -73.9966, address: '44 W 4th St, New York, NY 10012' },
  { slug: 'courant', name: 'Courant Institute (Warren Weaver Hall)', nameZh: 'Courant 数学科学研究所', category: 'building', lat: 40.7286, lng: -73.9956, address: '251 Mercer St, New York, NY 10012', tags: ['math', 'cs'] },
  { slug: 'ogs', name: 'Office of Global Services', nameZh: '国际学生办公室（OGS）', category: 'building', lat: 40.7307, lng: -73.9933, address: '383 Lafayette St, New York, NY 10003', url: 'https://www.nyu.edu/students/student-information-and-resources/student-visa-and-immigration.html', tags: ['visa', 'opt'] },
  { slug: 'washington-sq', name: 'Washington Square Park', nameZh: '华盛顿广场公园', category: 'landmark', lat: 40.7308, lng: -73.9973, address: 'Washington Square Park, New York, NY 10012', tags: ['arch', 'photo spot'] },
  { slug: 'palladium', name: 'Palladium Athletic Facility', nameZh: 'Palladium 健身中心', category: 'gym', lat: 40.7331, lng: -73.9888, address: '140 E 14th St, New York, NY 10003', tags: ['pool'], sort: 1 },
  { slug: 'shc', name: 'NYU Student Health Center', nameZh: 'NYU 学生健康中心', category: 'health', lat: 40.7276, lng: -73.9939, address: '726 Broadway, New York, NY 10003', tags: ['student health'] },
  { slug: 'trader-joes', name: "Trader Joe's Union Square", nameZh: "Trader Joe's（联合广场）", category: 'grocery', lat: 40.7354, lng: -73.9906, address: '142 E 14th St, New York, NY 10003', tags: ['budget'] },
  { slug: 'whole-foods', name: 'Whole Foods Union Square', nameZh: 'Whole Foods（联合广场）', category: 'grocery', lat: 40.7343, lng: -73.9908, address: '4 Union Square S, New York, NY 10003' },
  { slug: 'h-mart', name: 'H Mart Manhattan (E 32nd)', nameZh: 'H Mart 韩国超市（韩国城）', category: 'asian_grocery', lat: 40.7474, lng: -73.9860, address: '38 W 32nd St, New York, NY 10001', tags: ['korean'] },
  { slug: 'hong-kong-sm', name: 'Hong Kong Supermarket (Chinatown)', nameZh: '香港超市（唐人街）', category: 'asian_grocery', lat: 40.7157, lng: -73.9975, address: '157 Hester St, New York, NY 10013', tags: ['chinese'], sort: 1 },
  { slug: 'w4-station', name: 'West 4th St – Washington Sq (A/C/E/B/D/F/M)', nameZh: '西四街地铁站', category: 'transit', lat: 40.7323, lng: -74.0003, address: 'W 4th St & 6th Ave, New York, NY 10012', url: 'https://new.mta.info/', tags: ['subway'], sort: 1 },
  { slug: 'astor-pl', name: 'Astor Place (6)', nameZh: 'Astor Place 地铁站（6 号线）', category: 'transit', lat: 40.7300, lng: -73.9914, address: 'Astor Pl & Lafayette St, New York, NY 10003', tags: ['subway'] },
  { slug: 'chase', name: 'Chase Bank Broadway', nameZh: '大通银行（Chase）', category: 'bank', lat: 40.7285, lng: -73.9943, address: '731 Broadway, New York, NY 10003' },
];

// ---------------------------------------------------------------- USC (Los Angeles)
const USC: PoiSeed[] = [
  { slug: 'doheny', name: 'Doheny Memorial Library', nameZh: 'Doheny 纪念图书馆', category: 'library', lat: 34.0202, lng: -118.2838, address: '3550 Trousdale Pkwy, Los Angeles, CA 90089', sort: 1 },
  { slug: 'leavey', name: 'Leavey Library', nameZh: 'Leavey 图书馆（24 小时）', category: 'library', lat: 34.0217, lng: -118.2827, address: '651 W 35th St, Los Angeles, CA 90089', tags: ['24h'] },
  { slug: 'tommy-trojan', name: 'Tommy Trojan', nameZh: 'Tommy Trojan 雕像', category: 'landmark', lat: 34.0205, lng: -118.2854, address: 'Trousdale Pkwy, Los Angeles, CA 90089', tags: ['photo spot'] },
  { slug: 'village', name: 'USC Village', nameZh: 'USC Village 商业区', category: 'building', lat: 34.0253, lng: -118.2852, address: '3015 S Hoover St, Los Angeles, CA 90007', tags: ['target', 'trader joes', 'dining'], sort: 1 },
  { slug: 'ois', name: 'Office of International Services', nameZh: '国际学生办公室（OIS）', category: 'building', lat: 34.0226, lng: -118.2878, address: '3601 Trousdale Pkwy, Los Angeles, CA 90089', url: 'https://ois.usc.edu/', tags: ['visa', 'opt'] },
  { slug: 'viterbi', name: 'Viterbi School of Engineering (OHE)', nameZh: 'Viterbi 工程学院', category: 'building', lat: 34.0200, lng: -118.2890, address: '3650 McClintock Ave, Los Angeles, CA 90089', tags: ['engineering'] },
  { slug: 'lyon', name: 'Lyon Center', nameZh: 'Lyon 健身中心', category: 'gym', lat: 34.0245, lng: -118.2883, address: '1026 W 34th St, Los Angeles, CA 90089', sort: 1 },
  { slug: 'engemann', name: 'Engemann Student Health Center', nameZh: 'Engemann 学生健康中心', category: 'health', lat: 34.0243, lng: -118.2823, address: '1031 W 34th St, Los Angeles, CA 90089', tags: ['student health'] },
  { slug: 'target', name: 'Target USC Village', nameZh: 'Target（USC Village）', category: 'grocery', lat: 34.0255, lng: -118.2843, address: '3131 S Hoover St, Los Angeles, CA 90007', tags: ['move-in'] },
  { slug: 'trader-joes', name: "Trader Joe's USC Village", nameZh: "Trader Joe's（USC Village）", category: 'grocery', lat: 34.0251, lng: -118.2857, address: '3131 S Hoover St, Los Angeles, CA 90007' },
  { slug: 'ralphs', name: 'Ralphs Downtown LA', nameZh: 'Ralphs 超市', category: 'grocery', lat: 34.0402, lng: -118.2630, address: '645 W 9th St, Los Angeles, CA 90015' },
  { slug: '99-ranch', name: '99 Ranch Market (Koreatown)', nameZh: '大华超市（韩国城）', category: 'asian_grocery', lat: 34.0586, lng: -118.3035, address: '3300 W 6th St, Los Angeles, CA 90020', tags: ['chinese', 'carpool'], sort: 1 },
  { slug: 'expo-usc', name: 'Expo Park/USC Station (Metro E Line)', nameZh: 'Expo Park/USC 轻轨站', category: 'transit', lat: 34.0182, lng: -118.2858, address: 'Exposition Blvd & Trousdale Pkwy, Los Angeles, CA 90007', url: 'https://www.metro.net/', tags: ['e line'], sort: 1 },
  { slug: 'jefferson-usc', name: 'Jefferson/USC Station (Metro E Line)', nameZh: 'Jefferson/USC 轻轨站', category: 'transit', lat: 34.0222, lng: -118.2782, address: 'Jefferson Blvd & Flower St, Los Angeles, CA 90007', tags: ['e line'] },
  { slug: 'boa', name: 'Bank of America Figueroa', nameZh: '美国银行（Figueroa）', category: 'bank', lat: 34.0266, lng: -118.2795, address: '3000 S Figueroa St, Los Angeles, CA 90007' },
  { slug: 'cvs', name: 'CVS Pharmacy Figueroa', nameZh: 'CVS 药房', category: 'pharmacy', lat: 34.0248, lng: -118.2794, address: '3301 S Figueroa St, Los Angeles, CA 90007' },
];

const CAMPUSES: Record<string, PoiSeed[]> = { northwestern: NU, uiuc: UIUC, nyu: NYU, usc: USC };

// ---------------------------------------------------------------- warmed geocode cache (rooftop, matches lib/geo normalizeQuery)
type GeoSeed = { q: string; lat: number; lng: number; line1: string; city: string; state: string; zip: string };
const GEOCODES: GeoSeed[] = [
  { q: '1735 Chicago Ave, Evanston, IL 60201', lat: 42.0488, lng: -87.6795, line1: '1735 Chicago Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '1890 Maple Ave, Evanston, IL 60201', lat: 42.0507, lng: -87.6865, line1: '1890 Maple Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '2100 Sherman Ave, Evanston, IL 60201', lat: 42.0534, lng: -87.6820, line1: '2100 Sherman Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '711 Foster St, Evanston, IL 60201', lat: 42.0541, lng: -87.6810, line1: '711 Foster St', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '824 Noyes St, Evanston, IL 60201', lat: 42.0584, lng: -87.6822, line1: '824 Noyes St', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '1500 Oak Ave, Evanston, IL 60201', lat: 42.0462, lng: -87.6861, line1: '1500 Oak Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '1012 Davis St, Evanston, IL 60201', lat: 42.0463, lng: -87.6845, line1: '1012 Davis St', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '2125 Ridge Ave, Evanston, IL 60201', lat: 42.0545, lng: -87.6890, line1: '2125 Ridge Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '1930 Orrington Ave, Evanston, IL 60201', lat: 42.0536, lng: -87.6798, line1: '1930 Orrington Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '603 Hinman Ave, Evanston, IL 60202', lat: 42.0403, lng: -87.6760, line1: '603 Hinman Ave', city: 'Evanston', state: 'IL', zip: '60202' },
  { q: '1326 Chicago Ave, Evanston, IL 60201', lat: 42.0449, lng: -87.6801, line1: '1326 Chicago Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '2315 Sheridan Rd, Evanston, IL 60208', lat: 42.0600, lng: -87.6758, line1: '2315 Sheridan Rd', city: 'Evanston', state: 'IL', zip: '60208' },
  { q: '555 Michigan Ave, Evanston, IL 60202', lat: 42.0395, lng: -87.6732, line1: '555 Michigan Ave', city: 'Evanston', state: 'IL', zip: '60202' },
  { q: '1570 Elmwood Ave, Evanston, IL 60201', lat: 42.0477, lng: -87.6875, line1: '1570 Elmwood Ave', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '2200 Pratt Ct, Evanston, IL 60201', lat: 42.0552, lng: -87.6850, line1: '2200 Pratt Ct', city: 'Evanston', state: 'IL', zip: '60201' },
  { q: '1101 W Green St, Urbana, IL 61801', lat: 40.1105, lng: -88.2235, line1: '1101 W Green St', city: 'Urbana', state: 'IL', zip: '61801' },
  { q: '502 E Healey St, Champaign, IL 61820', lat: 40.1132, lng: -88.2375, line1: '502 E Healey St', city: 'Champaign', state: 'IL', zip: '61820' },
  { q: '309 E Green St, Champaign, IL 61820', lat: 40.1105, lng: -88.2393, line1: '309 E Green St', city: 'Champaign', state: 'IL', zip: '61820' },
  { q: '120 E 4th St, New York, NY 10003', lat: 40.7265, lng: -73.9899, line1: '120 E 4th St', city: 'New York', state: 'NY', zip: '10003' },
  { q: '240 Mercer St, New York, NY 10012', lat: 40.7281, lng: -73.9950, line1: '240 Mercer St', city: 'New York', state: 'NY', zip: '10012' },
  { q: '75 3rd Ave, New York, NY 10003', lat: 40.7318, lng: -73.9888, line1: '75 3rd Ave', city: 'New York', state: 'NY', zip: '10003' },
  { q: '1250 W 35th St, Los Angeles, CA 90007', lat: 34.0236, lng: -118.2903, line1: '1250 W 35th St', city: 'Los Angeles', state: 'CA', zip: '90007' },
  { q: '2615 Ellendale Pl, Los Angeles, CA 90007', lat: 34.0320, lng: -118.2890, line1: '2615 Ellendale Pl', city: 'Los Angeles', state: 'CA', zip: '90007' },
  { q: '3400 S Hoover St, Los Angeles, CA 90007', lat: 34.0229, lng: -118.2847, line1: '3400 S Hoover St', city: 'Los Angeles', state: 'CA', zip: '90007' },
];

function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export default async function seed(_db: DatabaseSync): Promise<void> {
  const now = nowIso();
  const campusIds = new Set(q.all<{ id: string }>('SELECT id FROM campuses').map((r) => r.id));
  const alice = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['alice@u.northwestern.edu'])?.id ?? null;
  const bob = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['bob@u.northwestern.edu'])?.id ?? null;

  q.tx(() => {
    q.run(`DELETE FROM pois WHERE id LIKE '${PREFIX}%'`);
    let n = 0;
    for (const [campusId, list] of Object.entries(CAMPUSES)) {
      if (!campusIds.has(campusId)) continue; // core seed defines campuses; skip gracefully if one is missing
      list.forEach((p, i) => {
        q.insert('pois', {
          id: `${PREFIX}${campusId}-${p.slug}`, campus_id: campusId, name: p.name, name_zh: p.nameZh, category: p.category, lat: p.lat, lng: p.lng,
          address: p.address ?? null, url: p.url ?? null, icon: null, tags_json: JSON.stringify(p.tags ?? []), is_active: 1, sort_order: p.sort ?? 10 + i, created_at: now,
        });
        n++;
      });
    }

    // forward geocode cache — only rows this seed owns (never clobber real upstream answers)
    q.run(`DELETE FROM geocode_cache WHERE id LIKE '${GEO_PREFIX}%'`);
    GEOCODES.forEach((g, i) => {
      const key = normalizeQuery(g.q);
      const exists = q.get<{ id: string }>('SELECT id FROM geocode_cache WHERE query_key = ?', [key]);
      if (exists) return;
      q.insert('geocode_cache', {
        id: `${GEO_PREFIX}${String(i + 1).padStart(2, '0')}`, query_key: key, kind: 'forward', provider: 'seed', lat: g.lat, lng: g.lng,
        display_name: `${g.line1}, ${g.city}, ${g.state} ${g.zip}, United States`, address_line1: g.line1, city: g.city, state: g.state, zip: g.zip, country: 'US',
        precision: 'rooftop', raw_json: JSON.stringify({ seed: true }), hit_count: 0, created_at: isoPlus(-DAY * (3 + (i % 20))), expires_at: null,
      });
    });

    // commute cache rows for a few demo origins so the admin stats are not empty
    q.run(`DELETE FROM commute_cache WHERE cache_key LIKE 'northwestern:42.04%' AND created_at < ?`, [isoPlus(-30 * DAY)]);

    // analytics: a handful of map events for the admin KPIs (explore / geocode / commute)
    q.run(`DELETE FROM events WHERE type LIKE 'map.%' AND props_json LIKE '%"seed":true%'`);
    const seedEvents: { type: string; userId: string | null; campusId: string; props: Record<string, unknown>; ago: number }[] = [
      { type: 'map.explore', userId: alice, campusId: 'northwestern', props: { seed: true, source: 'initial', layers: 'all' }, ago: 3 * DAY },
      { type: 'map.explore', userId: alice, campusId: 'northwestern', props: { seed: true, source: 'search', layers: 'listings,items' }, ago: 3 * DAY - HOUR },
      { type: 'map.explore', userId: bob, campusId: 'northwestern', props: { seed: true, source: 'draw', layers: 'listings' }, ago: 2 * DAY },
      { type: 'map.geocode', userId: alice, campusId: 'northwestern', props: { seed: true, cached: true, precision: 'rooftop' }, ago: 2 * DAY - 2 * HOUR },
      { type: 'map.commute', userId: bob, campusId: 'northwestern', props: { seed: true, walkMin: 12, shuttle: true }, ago: DAY },
      { type: 'map.pin_click', userId: null, campusId: 'uiuc', props: { seed: true, type: 'listing' }, ago: 5 * HOUR },
      { type: 'map.explore', userId: null, campusId: 'nyu', props: { seed: true, source: 'layer', layers: 'pois' }, ago: 2 * HOUR },
    ];
    for (const e of seedEvents) {
      if (!campusIds.has(e.campusId)) continue;
      logEvent(null, e.type, { userId: e.userId, campusId: e.campusId, entityType: 'campus', entityId: e.campusId, props: e.props, ts: isoPlus(-e.ago), path: '/map' });
    }
    void n;

    // student suggestions (「补充地点」): two pending for the admin queue, one approved, one rejected
    q.run(`DELETE FROM poi_suggestions WHERE id LIKE 'seed-sug-%'`);
    const admin = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.edu'])?.id ?? null;
    const uiucUser = q.get<{ id: string }>(`SELECT id FROM users WHERE campus_id = 'uiuc' AND role = 'student' ORDER BY email LIMIT 1`)?.id ?? null;
    const sug: { id: string; campus: string; user: string | null; name: string; nameZh: string; category: PoiCategory; lat: number; lng: number; address: string; note: string; status: 'pending' | 'approved' | 'rejected'; reason?: string; ago: number }[] = [
      { id: 'seed-sug-01', campus: 'northwestern', user: bob, name: 'Clarke\'s Off Campus', nameZh: 'Clarke\'s 24 小时餐厅', category: 'dining', lat: 42.0466, lng: -87.6817, address: '720 Clark St, Evanston, IL 60201', note: '凌晨也开门，考试周复习完可以来吃。Open late during finals.', status: 'pending', ago: 6 * HOUR },
      { id: 'seed-sug-02', campus: 'northwestern', user: alice, name: 'Evanston Farmers Market', nameZh: 'Evanston 农夫市集', category: 'grocery', lat: 42.0455, lng: -87.6845, address: 'University Pl & Oak Ave, Evanston, IL 60201', note: '5–11 月每周六上午，蔬果比超市便宜。Saturdays May–Nov.', status: 'pending', ago: 2 * DAY },
      { id: 'seed-sug-03', campus: 'northwestern', user: alice, name: 'Northwestern Bookstore', nameZh: '西北大学书店', category: 'building', lat: 42.0533, lng: -87.6729, address: '1999 Campus Dr, Evanston, IL 60208', note: 'Norris 一楼，买教材和文具。', status: 'rejected', reason: 'Already covered by Norris University Center.', ago: 9 * DAY },
      { id: 'seed-sug-04', campus: 'uiuc', user: uiucUser, name: 'Green Street Bubble Tea', nameZh: 'Green 街奶茶店', category: 'dining', lat: 40.1102, lng: -88.2318, address: '611 E Green St, Champaign, IL 61820', note: 'Popular after-class spot.', status: 'pending', ago: 30 * HOUR },
    ];
    for (const g of sug) {
      if (!campusIds.has(g.campus)) continue;
      q.insert('poi_suggestions', {
        id: g.id, campus_id: g.campus, user_id: g.user, name: g.name, name_zh: g.nameZh, category: g.category, lat: g.lat, lng: g.lng, address: g.address, url: null,
        note: g.note, status: g.status, poi_id: null, reviewer_id: g.status === 'pending' ? null : admin, review_reason: g.reason ?? null,
        reviewed_at: g.status === 'pending' ? null : isoPlus(-g.ago + DAY), created_at: isoPlus(-g.ago),
      });
    }
    // approved example → points at the seeded Kung Fu Tea POI
    if (campusIds.has('northwestern')) {
      q.insert('poi_suggestions', {
        id: 'seed-sug-05', campus_id: 'northwestern', user_id: bob, name: 'Kung Fu Tea', name_zh: '功夫茶', category: 'dining', lat: 42.0479, lng: -87.6821,
        address: '1609 Sherman Ave, Evanston, IL 60201', url: null, note: '珍奶第二杯半价（周二）。', status: 'approved', poi_id: `${PREFIX}northwestern-kung-fu-tea`,
        reviewer_id: admin, review_reason: null, reviewed_at: isoPlus(-12 * DAY), created_at: isoPlus(-14 * DAY),
      });
    }
  });
}
