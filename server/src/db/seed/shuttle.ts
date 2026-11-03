// server/src/db/seed/shuttle.ts — OWNED BY THE `shuttle` MODULE AGENT.
// Shuttle systems for 4 campuses (Northwestern rich; UIUC / NYU / USC lighter), 2 live alerts (+ 1 expired, 1 scheduled),
// favorites for alice / bob, "request my campus" rows and a few analytics events.
//
// Every route is marked isApproximate = true: stops and headways are approximations of the public schedules, with the
// official page linked per route — the UI shows the note and the link-out. Coordinates follow the real streets
// (Sheridan Rd / Chicago Ave / Davis St / Lake Shore Dr, Green St, Broadway / Third Ave, Figueroa / Jefferson).
//
// Ids are deterministic (`seed-shuttle-route-<campus>-<slug>`, `seed-shuttle-stop-<campus>-<slug>`) so specs can deep-link.
import type { DatabaseSync } from 'node:sqlite';
import { q } from '../index';
import { logEvent } from '../../lib/events';
import { nowIso, isoPlus, DAY, HOUR } from '../../lib/time';
import { importCampusRoutes, type ImportRouteInput } from '../../modules/shuttle/lib';

export const version = 1;

const PREFIX = 'seed-shuttle-';

/** 'HH:MM' list every `step` minutes from `from` to `to` (inclusive); hours may exceed 24 for after-midnight. */
function every(from: string, to: string, step: number): string[] {
  const [fh, fm] = from.split(':').map(Number) as [number, number];
  const [th, tm] = to.split(':').map(Number) as [number, number];
  const out: string[] = [];
  for (let t = fh * 60 + fm; t <= th * 60 + tm; t += step) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return out;
}
const ALL_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// ---------------------------------------------------------------- Northwestern (Evanston + Chicago campus)
const NU_URL = 'https://www.northwestern.edu/transportation-parking/shuttles/';
type Stop = ImportRouteInput['stops'][number];
const nu = {
  noyes: { key: 'noyes', name: 'Sheridan Rd & Noyes St', nameZh: 'Sheridan 路 / Noyes 街', code: 'NOY', lat: 42.0585, lng: -87.6775, address: 'Sheridan Rd & Noyes St, Evanston, IL 60201' },
  tech: { key: 'tech', name: 'Technological Institute', nameZh: '科技学院（Tech）', code: 'TECH', lat: 42.0574, lng: -87.6763, address: '2145 Sheridan Rd, Evanston, IL 60208' },
  norris: { key: 'norris', name: 'Norris University Center', nameZh: 'Norris 学生中心', code: 'NOR', lat: 42.0533, lng: -87.6727, address: '1999 Campus Dr, Evanston, IL 60208' },
  arch: { key: 'arch', name: 'Sheridan Rd & Chicago Ave (The Arch)', nameZh: '拱门 · Sheridan 路 / Chicago 大道', code: 'ARCH', lat: 42.0515, lng: -87.6778, address: '1800 Sheridan Rd, Evanston, IL 60208' },
  fosterWalker: { key: 'foster-walker', name: 'Foster-Walker Complex', nameZh: 'Foster-Walker 宿舍', code: 'FW', lat: 42.0544, lng: -87.6797, address: '1927 Orrington Ave, Evanston, IL 60201' },
  davis: { key: 'davis', name: 'Davis St Station (CTA / Metra)', nameZh: 'Davis 街车站（CTA / Metra）', code: 'DAV', lat: 42.0466, lng: -87.6833, address: 'Davis St & Benson Ave, Evanston, IL 60201' },
  dempster: { key: 'dempster', name: 'Chicago Ave & Dempster St', nameZh: 'Chicago 大道 / Dempster 街', code: 'DEM', lat: 42.0417, lng: -87.6799, address: 'Chicago Ave & Dempster St, Evanston, IL 60202' },
  lincoln: { key: 'lincoln', name: 'Sheridan Rd & Lincoln St', nameZh: 'Sheridan 路 / Lincoln 街（北校区）', code: 'LIN', lat: 42.061, lng: -87.676, address: 'Sheridan Rd & Lincoln St, Evanston, IL 60201' },
  ryanField: { key: 'ryan-field', name: 'Ryan Field', nameZh: 'Ryan 体育场', code: 'RYAN', lat: 42.0655, lng: -87.6926, address: '1501 Central St, Evanston, IL 60201' },
  michigan: { key: 'chicago-michigan', name: 'Chicago Ave & Michigan Ave (Red Line)', nameZh: 'Chicago 大道 / Michigan 大道（红线）', code: 'CHI', lat: 41.8966, lng: -87.6283, address: 'E Chicago Ave & N Michigan Ave, Chicago, IL 60611' },
  ward: { key: 'ward', name: 'Ward Building (Chicago campus)', nameZh: 'Ward 大楼（芝加哥校区）', code: 'WARD', lat: 41.8964, lng: -87.6194, address: '303 E Chicago Ave, Chicago, IL 60611' },
  abbott: { key: 'abbott', name: 'Abbott Hall', nameZh: 'Abbott 楼', code: 'ABB', lat: 41.8944, lng: -87.6153, address: '710 N Lake Shore Dr, Chicago, IL 60611' },
  lurie: { key: 'lurie', name: 'Lurie Medical Research Center', nameZh: 'Lurie 医学研究中心', code: 'LUR', lat: 41.8955, lng: -87.6188, address: '303 E Superior St, Chicago, IL 60611' },
  prentice: { key: 'prentice', name: 'Prentice Women’s Hospital', nameZh: 'Prentice 妇女医院', code: 'PRE', lat: 41.8956, lng: -87.6212, address: '250 E Superior St, Chicago, IL 60611' },
  erie: { key: 'erie-fairbanks', name: 'Erie St & Fairbanks Ct', nameZh: 'Erie 街 / Fairbanks 街', code: 'ERI', lat: 41.8938, lng: -87.6202, address: 'E Erie St & N Fairbanks Ct, Chicago, IL 60611' },
} satisfies Record<string, Omit<Stop, 'minutesFromStart'>>;
const at = (s: Omit<Stop, 'minutesFromStart'>, minutesFromStart: number): Stop => ({ ...s, minutesFromStart });

// Sheridan Rd → Lake Shore Dr → Streeterville (south-bound)
const INTERCAMPUS_LINE: [number, number][] = [
  [42.0585, -87.6775], [42.0574, -87.6763], [42.0545, -87.6766], [42.0515, -87.6778], [42.0505, -87.6782], [42.0468, -87.6748], [42.0415, -87.6745],
  [42.0330, -87.6712], [42.0245, -87.6682], [42.0190, -87.6665], [42.0085, -87.6625], [41.9978, -87.6601], [41.9850, -87.6540], [41.9620, -87.6420],
  [41.9400, -87.6385], [41.9230, -87.6330], [41.9110, -87.6285], [41.9010, -87.6235], [41.8970, -87.6215], [41.8966, -87.6283], [41.8964, -87.6194], [41.8944, -87.6153],
];
const CAMPUS_LOOP_LINE: [number, number][] = [
  [42.0585, -87.6775], [42.0574, -87.6763], [42.0550, -87.6740], [42.0533, -87.6727], [42.0520, -87.6745], [42.0515, -87.6778], [42.0470, -87.6790],
  [42.0417, -87.6799], [42.0417, -87.6830], [42.0466, -87.6833], [42.0500, -87.6820], [42.0544, -87.6797], [42.0575, -87.6790], [42.0610, -87.6760], [42.0585, -87.6775],
];
const CHICAGO_LOOP_LINE: [number, number][] = [
  [41.8944, -87.6153], [41.8964, -87.6194], [41.8955, -87.6188], [41.8956, -87.6212], [41.8966, -87.6283], [41.8938, -87.6260], [41.8938, -87.6202], [41.8944, -87.6153],
];
const FROSTBITE_LINE: [number, number][] = [[42.0515, -87.6778], [42.0520, -87.6745], [42.0533, -87.6727], [42.0550, -87.6740], [42.0574, -87.6763], [42.0585, -87.6775], [42.061, -87.676]];
const RYAN_LINE: [number, number][] = [[42.0515, -87.6778], [42.0574, -87.6763], [42.0585, -87.6775], [42.0585, -87.6835], [42.0640, -87.6840], [42.0655, -87.6926]];

const NORTHWESTERN: ImportRouteInput[] = [
  {
    name: 'Intercampus Shuttle · Evanston → Chicago', shortName: 'IC ↓', color: '#2A5D8F',
    description: 'Evanston campus to the Chicago campus (Streeterville) via Sheridan Rd and Lake Shore Dr. About 50 minutes end to end; 30-minute service on weekdays, hourly on weekends. 埃文斯顿校区开往芝加哥校区（Streeterville），经 Sheridan 路与湖滨大道，全程约 50 分钟；工作日每 30 分钟一班，周末每小时一班。',
    polyline: INTERCAMPUS_LINE, serviceDays: ALL_WEEK, firstDeparture: '06:30', lastDeparture: '22:00', headwayMin: 30, officialUrl: NU_URL, sortOrder: 0,
    stops: [at(nu.noyes, 0), at(nu.tech, 3), at(nu.arch, 7), at(nu.michigan, 46), at(nu.ward, 50), at(nu.abbott, 54)],
    timetable: [
      { serviceDay: 'weekday', departures: [...every('06:30', '20:00', 30), '21:00', '22:00'] },
      { serviceDay: 'saturday', departures: every('08:00', '20:00', 60) },
      { serviceDay: 'sunday', departures: every('08:00', '20:00', 60) },
    ],
  },
  {
    name: 'Intercampus Shuttle · Chicago → Evanston', shortName: 'IC ↑', color: '#2A5D8F',
    description: 'Chicago campus back to Evanston. Boards at Abbott Hall and Ward Building; last weekday trip leaves Abbott Hall at 22:30. 芝加哥校区返回埃文斯顿，于 Abbott 楼与 Ward 大楼上车；工作日末班 22:30 从 Abbott 楼发车。',
    polyline: [...INTERCAMPUS_LINE].reverse(), serviceDays: ALL_WEEK, firstDeparture: '07:00', lastDeparture: '22:30', headwayMin: 30, officialUrl: NU_URL, sortOrder: 1,
    stops: [at(nu.abbott, 0), at(nu.ward, 3), at(nu.michigan, 7), at(nu.arch, 46), at(nu.tech, 50), at(nu.noyes, 53)],
    timetable: [
      { serviceDay: 'weekday', departures: [...every('07:00', '20:30', 30), '21:30', '22:30'] },
      { serviceDay: 'saturday', departures: every('09:00', '21:00', 60) },
      { serviceDay: 'sunday', departures: every('09:00', '21:00', 60) },
    ],
  },
  {
    name: 'Campus Loop', shortName: 'LOOP', color: '#1E7245',
    description: 'Clockwise loop around campus and downtown Evanston: Sheridan Rd, Chicago Ave, Davis St station, Orrington Ave. Every 20 minutes, 7 days a week. 顺时针环线：Sheridan 路、Chicago 大道、Davis 街车站、Orrington 大道，每 20 分钟一班，每天运行。',
    polyline: CAMPUS_LOOP_LINE, serviceDays: ALL_WEEK, firstDeparture: '07:00', lastDeparture: '23:00', headwayMin: 20, officialUrl: NU_URL, sortOrder: 2,
    stops: [at(nu.noyes, 0), at(nu.tech, 3), at(nu.norris, 6), at(nu.arch, 9), at(nu.dempster, 14), at(nu.davis, 18), at(nu.fosterWalker, 23), at(nu.lincoln, 27)],
  },
  {
    name: 'Frostbite Express', shortName: 'FROST', color: '#6B3FA0',
    description: 'Winter-quarter shuttle along Sheridan Rd between south and north campus. Weekdays every 10 minutes, late November through mid-March. 冬季学期沿 Sheridan 路往返南北校区，工作日每 10 分钟一班，11 月底至 3 月中旬运行。',
    polyline: FROSTBITE_LINE, serviceDays: WEEKDAYS, firstDeparture: '07:00', lastDeparture: '19:00', headwayMin: 10, officialUrl: NU_URL, sortOrder: 3,
    stops: [at(nu.arch, 0), at(nu.norris, 3), at(nu.tech, 6), at(nu.noyes, 8), at(nu.lincoln, 10)],
    timetable: [{ serviceDay: 'weekday', departures: every('07:00', '19:00', 10), validFrom: '2026-11-30', validTo: '2027-03-12' }],
  },
  {
    name: 'Ryan Field Game Day', shortName: 'RYAN', color: '#8A5200',
    description: 'Home football Saturdays only: the Arch and Noyes St to Ryan Field from three hours before kickoff, returning until an hour after the game. 仅主场橄榄球比赛的周六运行：开赛前 3 小时起从拱门、Noyes 街开往 Ryan 体育场，赛后 1 小时内返程。',
    polyline: RYAN_LINE, serviceDays: ['sat'], firstDeparture: '09:30', lastDeparture: '14:30', headwayMin: 15, officialUrl: 'https://nusports.com/sports/2018/6/18/ryan-field-gameday', sortOrder: 4,
    stops: [at(nu.arch, 0), at(nu.noyes, 4), at(nu.ryanField, 12)],
    timetable: [{ serviceDay: 'saturday', departures: every('09:30', '14:30', 15), validFrom: '2026-09-05', validTo: '2026-11-28' }],
  },
  {
    name: 'Chicago Campus Loop', shortName: 'CHI', color: '#B42318',
    description: 'Streeterville loop linking Abbott Hall, the Feinberg buildings and the Chicago Ave Red Line. Every 12 minutes on weekdays. 芝加哥校区 Streeterville 环线：Abbott 楼、Feinberg 医学院各楼与 Chicago 大道红线站，工作日每 12 分钟一班。',
    polyline: CHICAGO_LOOP_LINE, serviceDays: WEEKDAYS, firstDeparture: '06:00', lastDeparture: '22:00', headwayMin: 12, officialUrl: NU_URL, sortOrder: 5,
    stops: [at(nu.abbott, 0), at(nu.ward, 3), at(nu.lurie, 5), at(nu.prentice, 7), at(nu.michigan, 10), at(nu.erie, 13)],
  },
];

// ---------------------------------------------------------------- UIUC (MTD campus routes)
const MTD_URL = 'https://mtd.org/maps-and-schedules/routes/';
const ui = {
  terminal: { key: 'illinois-terminal', name: 'Illinois Terminal', nameZh: 'Illinois 总站', lat: 40.116, lng: -88.2425, address: '45 E University Ave, Champaign, IL 61820' },
  neil: { key: 'green-neil', name: 'Green St & Neil St', nameZh: 'Green 街 / Neil 街', lat: 40.112, lng: -88.2434, address: 'Green St & Neil St, Champaign, IL 61820' },
  fourth: { key: 'green-fourth', name: 'Green St & Fourth St', nameZh: 'Green 街 / Fourth 街', lat: 40.1108, lng: -88.238, address: 'Green St & Fourth St, Champaign, IL 61820' },
  sixth: { key: 'green-sixth', name: 'Green St & Sixth St', nameZh: 'Green 街 / Sixth 街', lat: 40.1108, lng: -88.2345, address: 'Green St & Sixth St, Champaign, IL 61820' },
  wright: { key: 'green-wright', name: 'Green St & Wright St', nameZh: 'Green 街 / Wright 街', lat: 40.1105, lng: -88.2287, address: 'Green St & Wright St, Urbana, IL 61801' },
  union: { key: 'illini-union', name: 'Illini Union', nameZh: 'Illini 学生会', lat: 40.1095, lng: -88.2273, address: '1401 W Green St, Urbana, IL 61801' },
  lincoln: { key: 'green-lincoln', name: 'Green St & Lincoln Ave', nameZh: 'Green 街 / Lincoln 大道', lat: 40.1104, lng: -88.22, address: 'Green St & Lincoln Ave, Urbana, IL 61801' },
  lincolnSq: { key: 'lincoln-square', name: 'Lincoln Square', nameZh: 'Lincoln 广场', lat: 40.1115, lng: -88.206, address: '300 S Broadway Ave, Urbana, IL 61801' },
  gregory: { key: 'gregory-dorner', name: 'Gregory Dr & Dorner Dr', nameZh: 'Gregory 路 / Dorner 路', lat: 40.105, lng: -88.2235, address: 'Gregory Dr & Dorner Dr, Urbana, IL 61801' },
  par: { key: 'par', name: 'Pennsylvania Ave Residence Halls (PAR)', nameZh: 'PAR 宿舍', lat: 40.101, lng: -88.2208, address: '901 W Pennsylvania Ave, Urbana, IL 61801' },
  orchard: { key: 'orchard-downs', name: 'Orchard Downs', nameZh: 'Orchard Downs 公寓', lat: 40.099, lng: -88.211, address: '1841 Orchard Pl, Urbana, IL 61801' },
};
const UIUC: ImportRouteInput[] = [
  {
    name: '22 Illini', shortName: '22', color: '#2A5D8F',
    description: 'MTD’s main campus route: Illinois Terminal through the Green St corridor to PAR and Orchard Downs. Every 10 minutes on weekdays, 15 on weekends. MTD 校园主线：从 Illinois 总站经 Green 街到 PAR 与 Orchard Downs，工作日每 10 分钟、周末每 15 分钟一班。',
    polyline: [[40.116, -88.2425], [40.1135, -88.2434], [40.112, -88.2434], [40.1108, -88.2345], [40.1105, -88.2287], [40.1095, -88.2273], [40.107, -88.2273], [40.105, -88.2235], [40.102, -88.2225], [40.101, -88.2208], [40.0995, -88.215], [40.099, -88.211]],
    serviceDays: ALL_WEEK, firstDeparture: '06:30', lastDeparture: '24:00', headwayMin: 10, officialUrl: MTD_URL, sortOrder: 0,
    stops: [at(ui.terminal, 0), at(ui.neil, 2), at(ui.sixth, 6), at(ui.wright, 8), at(ui.union, 10), at(ui.gregory, 13), at(ui.par, 16), at(ui.orchard, 19)],
  },
  {
    name: '5 Green', shortName: '5', color: '#1E7245',
    description: 'Along Green St from downtown Champaign through campus to Lincoln Square in Urbana. Every 10 minutes on weekdays. 沿 Green 街从香槟市中心穿过校园到厄巴纳 Lincoln 广场，工作日每 10 分钟一班。',
    polyline: [[40.116, -88.2425], [40.112, -88.2434], [40.1108, -88.238], [40.1108, -88.2345], [40.1105, -88.2287], [40.1095, -88.2273], [40.1104, -88.22], [40.1115, -88.206]],
    serviceDays: WEEKDAYS, firstDeparture: '06:00', lastDeparture: '23:00', headwayMin: 10, officialUrl: MTD_URL, sortOrder: 1,
    stops: [at(ui.terminal, 0), at(ui.neil, 2), at(ui.fourth, 5), at(ui.sixth, 7), at(ui.wright, 9), at(ui.union, 11), at(ui.lincoln, 14), at(ui.lincolnSq, 20)],
  },
];

// ---------------------------------------------------------------- NYU
const NYU_URL = 'https://www.nyu.edu/life/travel-and-transportation/university-transportation.html';
const ny = {
  broadway: { key: '715-broadway', name: '715 Broadway (Washington Square)', nameZh: '715 Broadway（华盛顿广场）', lat: 40.7292, lng: -73.9942, address: '715 Broadway, New York, NY 10003' },
  thirdNorth: { key: 'third-ave-north', name: 'Third Avenue North', nameZh: 'Third Ave North 宿舍', lat: 40.7318, lng: -73.9884, address: '75 Third Ave, New York, NY 10003' },
  palladium: { key: 'palladium', name: 'Palladium', nameZh: 'Palladium 宿舍', lat: 40.7336, lng: -73.9878, address: '140 E 14th St, New York, NY 10003' },
  gramercy: { key: 'gramercy-green', name: 'Gramercy Green', nameZh: 'Gramercy Green 宿舍', lat: 40.739, lng: -73.983, address: '310 Third Ave, New York, NY 10010' },
  langone: { key: 'first-26th', name: '1st Ave & 26th St (Langone)', nameZh: '1st 大道 / 26 街（Langone 医学院）', lat: 40.7395, lng: -73.9745, address: '1st Ave & E 26th St, New York, NY 10016' },
  carlyle: { key: 'carlyle-court', name: 'Carlyle Court (Union Square)', nameZh: 'Carlyle Court（联合广场）', lat: 40.7365, lng: -73.991, address: '25 Union Square W, New York, NY 10003' },
  lafayette: { key: 'lafayette-hall', name: 'Lafayette Hall', nameZh: 'Lafayette 宿舍', lat: 40.717, lng: -74.001, address: '80 Lafayette St, New York, NY 10013' },
  tandon: { key: 'tandon', name: 'Tandon (MetroTech, Brooklyn)', nameZh: 'Tandon 工学院（布鲁克林 MetroTech）', lat: 40.6945, lng: -73.9865, address: '6 MetroTech Center, Brooklyn, NY 11201' },
};
const NYU: ImportRouteInput[] = [
  {
    name: 'Route A', shortName: 'A', color: '#2A5D8F', description: 'Washington Square to the east-side residence halls and Langone via Third Ave. Every 15 minutes. 华盛顿广场经 Third 大道到东侧宿舍与 Langone，每 15 分钟一班。',
    polyline: [[40.7292, -73.9942], [40.7310, -73.9900], [40.7318, -73.9884], [40.7336, -73.9878], [40.739, -73.983], [40.7395, -73.9745]],
    serviceDays: ALL_WEEK, firstDeparture: '07:00', lastDeparture: '23:30', headwayMin: 15, officialUrl: NYU_URL, sortOrder: 0,
    stops: [at(ny.broadway, 0), at(ny.thirdNorth, 5), at(ny.palladium, 7), at(ny.gramercy, 11), at(ny.langone, 16)],
  },
  {
    name: 'Route B', shortName: 'B', color: '#1E7245', description: 'Washington Square, Union Square, 14th St residences and Lafayette Hall. Every 20 minutes on weekdays. 华盛顿广场、联合广场、14 街宿舍与 Lafayette 宿舍，工作日每 20 分钟一班。',
    polyline: [[40.7292, -73.9942], [40.7365, -73.991], [40.7336, -73.9878], [40.7318, -73.9884], [40.7250, -73.9960], [40.717, -74.001]],
    serviceDays: WEEKDAYS, firstDeparture: '08:00', lastDeparture: '22:00', headwayMin: 20, officialUrl: NYU_URL, sortOrder: 1,
    stops: [at(ny.broadway, 0), at(ny.carlyle, 4), at(ny.palladium, 7), at(ny.thirdNorth, 9), at(ny.lafayette, 18)],
  },
  {
    name: 'Route C', shortName: 'C', color: '#8A5200', description: 'Manhattan to Tandon in Brooklyn over the Manhattan Bridge. Every 30 minutes on weekdays. 经曼哈顿大桥往返布鲁克林 Tandon 工学院，工作日每 30 分钟一班。',
    polyline: [[40.7292, -73.9942], [40.717, -74.001], [40.7110, -73.9950], [40.7050, -73.9900], [40.6945, -73.9865]],
    serviceDays: WEEKDAYS, firstDeparture: '07:30', lastDeparture: '23:00', headwayMin: 30, officialUrl: NYU_URL, sortOrder: 2,
    stops: [at(ny.broadway, 0), at(ny.lafayette, 8), at(ny.tandon, 24)],
  },
  {
    name: 'Route E', shortName: 'E', color: '#6B3FA0', description: 'Express between Washington Square and Langone via Third Avenue North. Every 20 minutes on weekdays. 华盛顿广场与 Langone 之间的快线，经 Third Ave North，工作日每 20 分钟一班。',
    polyline: [[40.7292, -73.9942], [40.7318, -73.9884], [40.7360, -73.9800], [40.7395, -73.9745]],
    serviceDays: WEEKDAYS, firstDeparture: '07:00', lastDeparture: '21:00', headwayMin: 20, officialUrl: NYU_URL, sortOrder: 3,
    stops: [at(ny.broadway, 0), at(ny.thirdNorth, 5), at(ny.langone, 13)],
  },
  {
    name: 'Route F', shortName: 'F', color: '#0E7490', description: 'Weekend and late-night loop: Lafayette Hall, Washington Square, Palladium, Gramercy Green. Every 20 minutes until 2 am. 周末及深夜环线：Lafayette 宿舍、华盛顿广场、Palladium、Gramercy Green，每 20 分钟一班，运行至凌晨 2 点。',
    polyline: [[40.717, -74.001], [40.7250, -73.9960], [40.7292, -73.9942], [40.7336, -73.9878], [40.739, -73.983], [40.7318, -73.9884], [40.717, -74.001]],
    serviceDays: ['sat', 'sun'], firstDeparture: '10:00', lastDeparture: '25:40', headwayMin: 20, officialUrl: NYU_URL, sortOrder: 4,
    stops: [at(ny.lafayette, 0), at(ny.broadway, 8), at(ny.palladium, 13), at(ny.gramercy, 17)],
  },
  {
    name: 'Route G', shortName: 'G', color: '#B42318', description: 'Weekend express between Tandon and Washington Square. Every 30 minutes. 周末 Tandon 与华盛顿广场之间的快线，每 30 分钟一班。',
    polyline: [[40.6945, -73.9865], [40.7050, -73.9900], [40.7110, -73.9950], [40.717, -74.001], [40.7292, -73.9942]],
    serviceDays: ['sat', 'sun'], firstDeparture: '09:00', lastDeparture: '22:00', headwayMin: 30, officialUrl: NYU_URL, sortOrder: 5,
    stops: [at(ny.tandon, 0), at(ny.lafayette, 15), at(ny.broadway, 24)],
  },
];

// ---------------------------------------------------------------- USC
const USC_URL = 'https://transnet.usc.edu/index.php/section/shuttles/';
const us = {
  village: { key: 'usc-village', name: 'USC Village', nameZh: 'USC Village', lat: 34.0255, lng: -118.285, address: '3015 S Hoover St, Los Angeles, CA 90007' },
  mcclintock: { key: 'jefferson-mcclintock', name: 'Jefferson Blvd & McClintock Ave', nameZh: 'Jefferson 大道 / McClintock 大道', lat: 34.0237, lng: -118.2893, address: 'W Jefferson Blvd & McClintock Ave, Los Angeles, CA 90007' },
  expo: { key: 'expo-vermont', name: 'Expo/Vermont Station', nameZh: 'Expo/Vermont 轻轨站', lat: 34.0183, lng: -118.2914, address: 'Exposition Blvd & Vermont Ave, Los Angeles, CA 90007' },
  figueroa37: { key: 'figueroa-37th', name: 'Figueroa St & 37th St (Parking Center)', nameZh: 'Figueroa 街 / 37 街（停车中心）', lat: 34.0175, lng: -118.2815, address: 'S Figueroa St & W 37th St, Los Angeles, CA 90007' },
  gateway: { key: 'gateway-plaza', name: 'Gateway Plaza (Jefferson & Figueroa)', nameZh: 'Gateway 广场（Jefferson / Figueroa）', lat: 34.0209, lng: -118.279, address: 'W Jefferson Blvd & S Figueroa St, Los Angeles, CA 90007' },
  unionStation: { key: 'union-station', name: 'Union Station', nameZh: '联合车站', lat: 34.056, lng: -118.2365, address: '800 N Alameda St, Los Angeles, CA 90012' },
  hsc: { key: 'hsc', name: 'Health Sciences Campus (Zonal Ave)', nameZh: '健康科学校区（Zonal 大道）', lat: 34.062, lng: -118.206, address: '1975 Zonal Ave, Los Angeles, CA 90033' },
};
const USC: ImportRouteInput[] = [
  {
    name: 'Campus Tram', shortName: 'TRAM', color: '#1E7245', description: 'Loop around University Park: USC Village, Jefferson Blvd, Expo/Vermont station and the Figueroa parking structures. Every 10 minutes on weekdays. 环绕 University Park 校区：USC Village、Jefferson 大道、Expo/Vermont 站与 Figueroa 停车楼，工作日每 10 分钟一班。',
    polyline: [[34.0255, -118.285], [34.0255, -118.289], [34.0237, -118.2893], [34.0200, -118.2914], [34.0183, -118.2914], [34.0175, -118.2860], [34.0175, -118.2815], [34.0209, -118.279], [34.0240, -118.2800], [34.0255, -118.285]],
    serviceDays: WEEKDAYS, firstDeparture: '06:30', lastDeparture: '23:00', headwayMin: 10, officialUrl: USC_URL, sortOrder: 0,
    stops: [at(us.village, 0), at(us.mcclintock, 4), at(us.expo, 8), at(us.figueroa37, 13), at(us.gateway, 16)],
  },
  {
    name: 'Union Station Express', shortName: 'UNION', color: '#2A5D8F', description: 'Non-stop between Gateway Plaza and Union Station (Metrolink / Amtrak). Every 20 minutes on weekdays. Gateway 广场与联合车站（Metrolink / Amtrak）之间直达，工作日每 20 分钟一班。',
    polyline: [[34.0209, -118.279], [34.0300, -118.2740], [34.0440, -118.2600], [34.0520, -118.2440], [34.056, -118.2365]],
    serviceDays: WEEKDAYS, firstDeparture: '06:00', lastDeparture: '21:00', headwayMin: 20, officialUrl: USC_URL, sortOrder: 1,
    stops: [at(us.gateway, 0), at(us.unionStation, 25)],
  },
  {
    name: 'Health Sciences Express', shortName: 'HSC', color: '#B42318', description: 'University Park to the Health Sciences Campus via the 110 and 10 freeways. Every 15 minutes on weekdays. 从 University Park 经 110 与 10 号高速到健康科学校区，工作日每 15 分钟一班。',
    polyline: [[34.0209, -118.279], [34.0330, -118.2720], [34.0450, -118.2550], [34.0560, -118.2300], [34.0610, -118.2150], [34.062, -118.206]],
    serviceDays: WEEKDAYS, firstDeparture: '06:00', lastDeparture: '22:00', headwayMin: 15, officialUrl: USC_URL, sortOrder: 2,
    stops: [at(us.gateway, 0), at(us.hsc, 28)],
  },
];

// ---------------------------------------------------------------- seed
export default async function seed(_db: DatabaseSync): Promise<void> {
  const routesByCampus: Record<string, ImportRouteInput[]> = { northwestern: NORTHWESTERN, uiuc: UIUC, nyu: NYU, usc: USC };
  const summary: Record<string, { routes: number; stops: number; scheduleRows: number }> = {};
  for (const [campusId, routes] of Object.entries(routesByCampus)) {
    const r = importCampusRoutes(campusId, routes, { replace: true, idPrefix: PREFIX });
    summary[campusId] = { routes: r.routes, stops: r.stops, scheduleRows: r.scheduleRows };
  }

  const admin = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['admin@example.edu'])?.id ?? null;
  const alice = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['alice@u.northwestern.edu'])?.id ?? null;
  const bob = q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', ['bob@u.northwestern.edu'])?.id ?? null;
  const uiucUser = q.get<{ id: string; email: string }>("SELECT id, email FROM users WHERE campus_id = 'uiuc' AND role = 'student' ORDER BY email LIMIT 1") ?? null;
  const nyuUser = q.get<{ id: string }>("SELECT id FROM users WHERE campus_id = 'nyu' AND role = 'student' ORDER BY email LIMIT 1") ?? null;

  const rid = (campus: string, slug: string) => `${PREFIX}route-${campus}-${slug}`;
  const sid = (campus: string, slug: string) => `${PREFIX}stop-${campus}-${slug}`;
  const now = nowIso();

  q.tx(() => {
    q.run(`DELETE FROM shuttle_alerts WHERE id LIKE '${PREFIX}%'`);
    q.run(`DELETE FROM shuttle_requests WHERE id LIKE '${PREFIX}%'`);
    // favorites pointing at stops/routes that no longer exist (re-seeds)
    q.run("DELETE FROM shuttle_favorites WHERE entity_type = 'stop' AND entity_id NOT IN (SELECT id FROM shuttle_stops)");
    q.run("DELETE FROM shuttle_favorites WHERE entity_type = 'route' AND entity_id NOT IN (SELECT id FROM shuttle_routes)");

    // ---- alerts: 2 live at Northwestern, 1 live at NYU, 1 expired, 1 scheduled
    const alerts = [
      {
        id: `${PREFIX}alert-nu-lsd-detour`, campus_id: 'northwestern', route_id: rid('northwestern', 'intercampus-shuttle-evanston-chicago'), severity: 'warning',
        title: 'Detour via Clark St: Lake Shore Dr lane closures at Fullerton add 10–15 minutes to the trip through Nov 14.',
        title_zh: '湖滨大道 Fullerton 段施工，绕行 Clark 街，全程增加 10–15 分钟（至 11 月 14 日）。',
        body: 'Southbound trips leave Evanston on schedule but arrive at the Chicago campus later than the timetable shows. Plan an extra 15 minutes for morning clinic shifts.',
        body_zh: '南行班次按时从埃文斯顿发车，但到达芝加哥校区会晚于时刻表。早班门诊的同学请预留 15 分钟。',
        starts_at: isoPlus(-2 * DAY), ends_at: '2026-11-15T05:59:00.000Z', is_active: 1,
      },
      {
        id: `${PREFIX}alert-nu-thanksgiving`, campus_id: 'northwestern', route_id: null, severity: 'info',
        title: 'Thanksgiving week: all routes run the Saturday schedule Nov 25–27. No service on Thursday, Nov 26.',
        title_zh: '感恩节周：11 月 25–27 日所有线路按周六时刻运行，11 月 26 日（周四）停运。',
        body: 'The Intercampus Shuttle keeps hourly departures on Wednesday and Friday. Campus Loop resumes the regular schedule on Saturday, Nov 28.',
        body_zh: 'Intercampus 线周三、周五保持每小时一班；Campus Loop 于 11 月 28 日（周六）恢复常规时刻。',
        starts_at: isoPlus(-6 * HOUR), ends_at: '2026-11-28T06:00:00.000Z', is_active: 1,
      },
      {
        id: `${PREFIX}alert-nyu-bridge`, campus_id: 'nyu', route_id: rid('nyu', 'route-c'), severity: 'warning',
        title: 'Manhattan Bridge roadwork: Route C runs every 30 minutes this week and may skip Lafayette Hall after 9 pm.',
        title_zh: '曼哈顿大桥施工：本周 C 线每 30 分钟一班，晚 9 点后可能跳过 Lafayette 宿舍。',
        body: 'Use Route G on weekends. Trips are tracked live on the NYU transportation page.', body_zh: '周末请改乘 G 线。实时位置请看 NYU 交通页面。',
        starts_at: isoPlus(-1 * DAY), ends_at: isoPlus(6 * DAY), is_active: 1,
      },
      {
        id: `${PREFIX}alert-nu-gameday-oct31`, campus_id: 'northwestern', route_id: rid('northwestern', 'ryan-field-game-day'), severity: 'info',
        title: 'Game day Oct 31: shuttles start at 9:30 am, three hours before kickoff.', title_zh: '10 月 31 日比赛日：开赛前 3 小时（上午 9:30）起发车。',
        body: null, body_zh: null, starts_at: '2026-10-29T12:00:00.000Z', ends_at: '2026-11-01T04:00:00.000Z', is_active: 0,
      },
      {
        id: `${PREFIX}alert-nu-winter-break`, campus_id: 'northwestern', route_id: null, severity: 'critical',
        title: 'Winter break: no shuttle service Dec 24 – Jan 1. Intercampus resumes Jan 2 on the Saturday schedule.',
        title_zh: '寒假停运：12 月 24 日至 1 月 1 日所有线路停运，Intercampus 线 1 月 2 日按周六时刻恢复。',
        body: null, body_zh: null, starts_at: '2026-12-20T06:00:00.000Z', ends_at: '2027-01-03T06:00:00.000Z', is_active: 1,
      },
    ];
    for (const a of alerts) q.insert('shuttle_alerts', { ...a, created_by: admin, created_at: a.starts_at < now ? a.starts_at : now, updated_at: now });

    // ---- favorites (alice: Campus Loop + two stops; bob: Intercampus south + Noyes)
    const favs: [string | null, 'stop' | 'route', string][] = [
      [alice, 'route', rid('northwestern', 'campus-loop')],
      [alice, 'stop', sid('northwestern', 'noyes')],
      [alice, 'stop', sid('northwestern', 'davis')],
      [bob, 'route', rid('northwestern', 'intercampus-shuttle-evanston-chicago')],
      [bob, 'stop', sid('northwestern', 'noyes')],
      [nyuUser?.id ?? null, 'route', rid('nyu', 'route-a')],
    ];
    for (const [userId, type, entityId] of favs) {
      if (!userId) continue;
      q.run('INSERT OR IGNORE INTO shuttle_favorites (user_id, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?)', [userId, type, entityId, isoPlus(-3 * DAY)]);
    }

    // ---- "request my campus" rows for campuses without data
    const requests = [
      { id: `${PREFIX}request-purdue`, campus_id: 'purdue', user_id: null, email: 'wang.lei@purdue.edu', official_url: 'https://www.purdue.edu/parking/campus-shuttles/', note: 'Purdue has the CityBus campus loops (Gold Loop, Silver Loop). Free with student ID.', status: 'open', created_at: isoPlus(-1 * DAY) },
      { id: `${PREFIX}request-northeastern`, campus_id: 'northeastern', user_id: null, email: 'chen.y@husky.neu.edu', official_url: 'https://www.northeastern.edu/campus-shuttle/', note: '校区有夜间安全接驳车（SafeRide）和去 Burlington 校区的班车，希望能加上。', status: 'planned', created_at: isoPlus(-5 * DAY) },
      { id: `${PREFIX}request-uiuc`, campus_id: 'uiuc', user_id: uiucUser?.id ?? null, email: uiucUser?.email ?? 'student@illinois.edu', official_url: MTD_URL, note: 'MTD 的 22 Illini 和 5 Green 是大家最常坐的。', status: 'done', created_at: isoPlus(-20 * DAY) },
    ];
    for (const r of requests) q.insert('shuttle_requests', r);
  });

  // ---- a few analytics events so the admin dashboard has something to count
  if (alice) logEvent(null, 'shuttle.view', { userId: alice, campusId: 'northwestern', entityType: 'campus', entityId: 'northwestern', props: { hasData: true }, ts: isoPlus(-1 * DAY) });
  if (alice) logEvent(null, 'shuttle.stop.view', { userId: alice, campusId: 'northwestern', entityType: 'shuttle_stop', entityId: sid('northwestern', 'noyes'), ts: isoPlus(-1 * DAY + 5 * 60_000) });
  if (bob) logEvent(null, 'shuttle.route.view', { userId: bob, campusId: 'northwestern', entityType: 'shuttle_route', entityId: rid('northwestern', 'intercampus-shuttle-evanston-chicago'), ts: isoPlus(-2 * DAY) });
  if (nyuUser) logEvent(null, 'shuttle.view', { userId: nyuUser.id, campusId: 'nyu', entityType: 'campus', entityId: 'nyu', props: { hasData: true }, ts: isoPlus(-3 * DAY) });

  void summary;
}
