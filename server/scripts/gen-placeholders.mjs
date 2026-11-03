#!/usr/bin/env node
// =====================================================================
//  安窝 Anwo — deterministic placeholder image generator
//  Writes on-brand SVG "photos" into server/uploads/seed/** so seeds can
//  reference them by URL (/uploads/seed/<group>/<name>.svg) without any
//  external image hot-linking.
//
//  Groups (counts fixed by the cross-agent contract):
//    avatars  a01..a40   240×240   initials on warm tinted squares (CJK + Latin)
//    rooms    r01..r60   1200×900  stylised room scenes (4:3)
//    items    i01..i60   800×800   product silhouettes (1:1)
//    buddy    b01..b20   1600×900  activity scenes (16:9)
//    partners p01..p20   600×300   fictional partner wordmarks
//    campus   c01..c10   1200×400  campus skyline silhouettes
//
//  Deterministic: a seeded PRNG per file, so re-running produces identical
//  bytes. Palette is DESIGN.md §3.1 only (persimmon + warm stone).
//
//  Usage:  node server/scripts/gen-placeholders.mjs [--out <dir>] [--check]
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'server', 'uploads', 'seed');
const CHECK_ONLY = args.includes('--check');
const MAX_BYTES = 12 * 1024;

// ---------------------------------------------------------------- palette
const C = {
  paper: '#FBF8F3', surface: '#FFFFFF', sunken: '#F3EEE6',
  stone200: '#E7E0D5', stone300: '#CFC6B8', stone400: '#A39B90', stone500: '#6F6861', stone600: '#57514A',
  stone700: '#3A3531', stone800: '#272320', ink: '#1C1917',
  p50: '#FFF3EC', p100: '#FFE1D1', p200: '#FFCDB5', p300: '#FFAB85', p400: '#FB8A5A', p500: '#E35A2B', p600: '#C2410C', p700: '#A23A12', p900: '#67280F',
};
const FONT = "Inter, 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Source Han Sans SC', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// ---------------------------------------------------------------- prng
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function rng(seed) {
  let a = hash(seed) || 1;
  const next = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    range: (lo, hi) => lo + next() * (hi - lo),
  };
}

// ---------------------------------------------------------------- svg helpers
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '');
const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => ` ${k}="${typeof v === 'number' ? n(v) : esc(v)}"`).join('');
const svg = (w, h, body, extra = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${attrs(extra)}>\n${body}\n</svg>\n`;
const rect = (x, y, w, h, o = {}) => `<rect${attrs({ x, y, width: w, height: h, ...o })}/>`;
const circle = (cx, cy, r, o = {}) => `<circle${attrs({ cx, cy, r, ...o })}/>`;
const ellipse = (cx, cy, rx, ry, o = {}) => `<ellipse${attrs({ cx, cy, rx, ry, ...o })}/>`;
const line = (x1, y1, x2, y2, o = {}) => `<line${attrs({ x1, y1, x2, y2, ...o })}/>`;
const pathd = (d, o = {}) => `<path${attrs({ d, ...o })}/>`;
const poly = (pts, o = {}) => `<polygon${attrs({ points: pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' '), ...o })}/>`;
const g = (body, o = {}) => `<g${attrs(o)}>${body}</g>`;
const text = (x, y, s, o = {}) => `<text${attrs({ x, y, 'font-family': FONT, ...o })}>${esc(s)}</text>`;
const stroke = (color, width = 4, extra = {}) => ({ fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra });

/** Corner label chip: surface plate, hairline, ink text. Width estimated from characters. */
function labelChip(x, y, label, { size = 30, align = 'left', fill = C.surface, color = C.ink } = {}) {
  const cjk = (label.match(/[　-鿿＀-￯]/g) || []).length;
  const latin = label.length - cjk;
  const w = Math.round(latin * size * 0.56 + cjk * size * 1.02 + size * 1.4);
  const h = Math.round(size * 1.8);
  const rx = align === 'right' ? x - w : x;
  return rect(rx, y, w, h, { rx: h / 2, fill, stroke: C.stone200, 'stroke-width': 2 }) +
    text(rx + w / 2, y + h / 2 + size * 0.36, label, { 'font-size': size, 'font-weight': 600, fill: color, 'text-anchor': 'middle', 'letter-spacing': -0.2 });
}

// =====================================================================
//  AVATARS
// =====================================================================
const CJK_GIVEN = ['涵', '宇', '晨', '悦', '然', '萱', '轩', '怡', '博', '欣', '泽', '雨', '嘉', '琪', '浩', '婷', '睿', '妍', '航', '瑶'];
const LATIN_INITIALS = ['AL', 'BW', 'CK', 'DM', 'EP', 'JR', 'GS', 'HT', 'JL', 'KN', 'LM', 'MO', 'NQ', 'PR', 'RS', 'SU', 'TV', 'WY', 'YZ', 'ZC'];
const AVATAR_TINTS = [
  [C.p100, C.p700], [C.stone200, C.stone600], [C.p50, C.p600], [C.sunken, C.stone700], [C.p200, C.p900], [C.stone300, C.ink],
];
function avatar(i) {
  const r = rng(`avatar-${i}`);
  const isCjk = i % 2 === 1;
  const label = isCjk ? CJK_GIVEN[Math.floor(i / 2) % CJK_GIVEN.length] : LATIN_INITIALS[(i / 2 - 1) % LATIN_INITIALS.length];
  const [bg, fg] = AVATAR_TINTS[(i + r.int(0, 1)) % AVATAR_TINTS.length];
  const size = isCjk ? 112 : 92;
  // subtle "paper grain": two soft circles offset, same hue family
  const deco = circle(r.int(150, 210), r.int(30, 80), r.int(50, 80), { fill: C.surface, 'fill-opacity': 0.22 });
  const body = rect(0, 0, 240, 240, { fill: bg }) + deco +
    text(120, isCjk ? 160 : 153, label, { 'font-size': size, 'font-weight': 700, fill: fg, 'text-anchor': 'middle', 'letter-spacing': isCjk ? 0 : -2 });
  return { svg: svg(240, 240, body, { role: 'img', 'aria-label': `Avatar ${label}` }), meta: { label, width: 240, height: 240 } };
}

// =====================================================================
//  ROOMS
// =====================================================================
const CITIES = ['Evanston', 'Evanston', 'Evanston', 'Chicago', 'Urbana', 'New York', 'Brooklyn', 'Los Angeles', 'Boston', 'Cambridge', 'Seattle', 'Ann Arbor', 'Berkeley', 'Austin', 'Pittsburgh', 'Atlanta'];
const WALLS = [C.paper, C.sunken, C.p50, C.stone200, C.surface];
const FLOORS = [C.stone200, C.stone300, C.p100, C.stone300];

function plant(x, y, scale = 1, r) {
  // pot + leaves; (x,y) = bottom center
  const s = scale;
  const leaves = [];
  const count = r.int(4, 6);
  for (let k = 0; k < count; k++) {
    const ang = -90 + (k - (count - 1) / 2) * r.range(22, 30);
    const len = r.range(70, 110) * s;
    leaves.push(ellipse(0, -len / 2, 16 * s, len / 2, { fill: r.pick([C.stone500, C.stone600, C.stone400]), transform: `rotate(${n(ang + 90)})` }));
  }
  return g(
    g(leaves.join(''), { transform: `translate(0 ${n(-62 * s)})` }) +
    poly([[-34 * s, -62 * s], [34 * s, -62 * s], [26 * s, 0], [-26 * s, 0]], { fill: C.p300 }) +
    rect(-38 * s, -70 * s, 76 * s, 14 * s, { rx: 4 * s, fill: C.p400 }),
    { transform: `translate(${n(x)} ${n(y)})` },
  );
}
function frame(x, y, w, h, r) {
  const inner = r.pick([
    circle(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, { fill: C.p300 }),
    poly([[x + w * 0.2, y + h * 0.75], [x + w * 0.45, y + h * 0.35], [x + w * 0.65, y + h * 0.6], [x + w * 0.8, y + h * 0.45], [x + w * 0.85, y + h * 0.75]], { fill: C.stone400 }),
    rect(x + w * 0.3, y + h * 0.3, w * 0.4, h * 0.4, { fill: C.p200, transform: `rotate(12 ${n(x + w / 2)} ${n(y + h / 2)})` }),
  ]);
  return rect(x, y, w, h, { fill: C.surface, stroke: C.stone600, 'stroke-width': 6 }) + inner;
}
function windowPane(x, y, w, h, r, { curtains = true } = {}) {
  const sky = r.pick([C.p50, C.paper, C.p100]);
  let s = rect(x, y, w, h, { fill: sky });
  // distant skyline/horizon inside the glass
  s += rect(x, y + h * 0.62, w, h * 0.38, { fill: C.stone200 });
  s += circle(x + w * r.range(0.25, 0.75), y + h * 0.32, h * 0.08, { fill: C.p300 });
  s += rect(x, y, w, h, stroke(C.stone300, 14));
  s += line(x + w / 2, y, x + w / 2, y + h, stroke(C.stone300, 10));
  s += line(x, y + h / 2, x + w, y + h / 2, stroke(C.stone300, 10));
  s += rect(x - 16, y + h, w + 32, 16, { fill: C.stone300, rx: 3 });
  if (curtains) {
    s += rect(x - 42, y - 30, 52, h + 60, { rx: 10, fill: C.stone200 });
    s += rect(x + w - 10, y - 30, 52, h + 60, { rx: 10, fill: C.stone200 });
    s += rect(x - 60, y - 40, w + 120, 14, { rx: 7, fill: C.stone500 });
  }
  return s;
}
function lightBeam(x, y, w, h, floorY) {
  return poly([[x, y + h], [x + w, y + h], [x + w + 180, floorY + 180], [x - 120, floorY + 180]], { fill: C.p100, 'fill-opacity': 0.45 });
}
function floorPlanks(floorY, r) {
  const W = 1200, H = 900;
  let s = '';
  const gap = r.int(110, 160);
  for (let x = -200; x < W + 200; x += gap) s += line(x, floorY, x + 140, H, stroke(C.stone400, 3, { 'stroke-opacity': 0.35 }));
  return s;
}
function bed(x, y, w, r) {
  // (x,y) = bottom-left of mattress block
  const h = 150, head = 220;
  const blanket = r.pick([C.p200, C.p300, C.p100]);
  return rect(x - 10, y - head - 20, 40, head + 20, { rx: 8, fill: C.stone600 }) +   // headboard post
    rect(x - 10, y - head - 20, w * 0.55, 90, { rx: 10, fill: C.stone600 }) +       // headboard
    rect(x, y - h, w, h, { rx: 14, fill: C.surface, stroke: C.stone300, 'stroke-width': 4 }) +
    rect(x + w * 0.3, y - h + 10, w * 0.7 - 6, h - 40, { rx: 12, fill: blanket }) +
    pathd(`M${n(x + w * 0.3)} ${n(y - 30)} q ${n(w * 0.2)} -18 ${n(w * 0.4)} 0`, stroke(C.p400, 4)) +
    rect(x + 24, y - h + 18, w * 0.22, 50, { rx: 12, fill: C.surface, stroke: C.stone300, 'stroke-width': 4 }) +
    rect(x + 24, y - h + 74, w * 0.22, 44, { rx: 12, fill: C.surface, stroke: C.stone300, 'stroke-width': 4 }) +
    rect(x + 10, y, 22, 40, { fill: C.stone600 }) + rect(x + w - 32, y, 22, 40, { fill: C.stone600 });
}
function nightstand(x, y) {
  return rect(x, y - 110, 110, 110, { rx: 8, fill: C.stone300 }) + rect(x + 20, y - 80, 70, 10, { rx: 5, fill: C.stone500 }) +
    rect(x + 46, y - 180, 18, 70, { fill: C.stone600 }) + poly([[x + 15, y - 180], [x + 95, y - 180], [x + 80, y - 240], [x + 30, y - 240]], { fill: C.p200 });
}
function desk(x, y, w, r) {
  const monitor = r.chance(0.55);
  let s = rect(x, y - 190, w, 16, { rx: 4, fill: C.stone600 }) +
    rect(x + 18, y - 174, 20, 174, { fill: C.stone600 }) + rect(x + w - 38, y - 174, 20, 174, { fill: C.stone600 }) +
    rect(x + w - 140, y - 174, 100, 90, { rx: 6, fill: C.stone300 }) + rect(x + w - 110, y - 135, 40, 8, { rx: 4, fill: C.stone600 });
  if (monitor) {
    s += rect(x + w * 0.28, y - 360, w * 0.44, 150, { rx: 8, fill: C.ink }) + rect(x + w * 0.3, y - 350, w * 0.4, 130, { rx: 4, fill: C.stone500 }) +
      rect(x + w * 0.47, y - 210, w * 0.06, 22, { fill: C.stone700 }) + rect(x + w * 0.4, y - 196, w * 0.2, 8, { rx: 4, fill: C.stone700 });
  } else {
    s += poly([[x + w * 0.3, y - 190], [x + w * 0.34, y - 300], [x + w * 0.66, y - 300], [x + w * 0.62, y - 190]], { fill: C.stone700 }) +
      rect(x + w * 0.36, y - 290, w * 0.26, 88, { rx: 4, fill: C.stone500 });
  }
  // lamp
  s += pathd(`M${n(x + 60)} ${n(y - 190)} v -150 q 0 -40 40 -40 h 60`, stroke(C.stone600, 10)) + poly([[x + 140, y - 400], [x + 200, y - 400], [x + 220, y - 340], [x + 120, y - 340]], { fill: C.p400 }) +
    poly([[x + 120, y - 340], [x + 220, y - 340], [x + 260, y - 190], [x + 80, y - 190]], { fill: C.p100, 'fill-opacity': 0.5 });
  // mug + books
  s += rect(x + w * 0.8, y - 220, 34, 30, { rx: 6, fill: C.p500 }) + rect(x + w * 0.12, y - 214, 70, 24, { rx: 3, fill: C.p700 }) + rect(x + w * 0.14, y - 236, 60, 22, { rx: 3, fill: C.stone500 });
  return s;
}
function chair(x, y) {
  return rect(x - 20, y - 330, 130, 110, { rx: 24, fill: C.stone600 }) + rect(x + 36, y - 230, 20, 60, { fill: C.stone700 }) +
    rect(x - 30, y - 176, 150, 34, { rx: 14, fill: C.stone600 }) + rect(x + 36, y - 142, 20, 100, { fill: C.stone700 }) +
    line(x - 20, y, x + 120, y, stroke(C.stone700, 14)) + line(x + 46, y - 42, x - 10, y, stroke(C.stone700, 10)) + line(x + 46, y - 42, x + 110, y, stroke(C.stone700, 10)) +
    rect(x - 40, y - 262, 24, 10, { rx: 5, fill: C.stone700 }) + rect(x + 106, y - 262, 24, 10, { rx: 5, fill: C.stone700 });
}
function sofa(x, y, w, r) {
  const col = r.pick([C.stone500, C.stone600, C.p300]);
  const cushion = col === C.p300 ? C.p200 : C.stone400;
  let s = rect(x, y - 200, w, 110, { rx: 18, fill: col }) + rect(x, y - 130, w, 100, { rx: 20, fill: col });
  const cw = (w - 90) / 3;
  for (let k = 0; k < 3; k++) s += rect(x + 45 + k * cw + 6, y - 190, cw - 12, 80, { rx: 12, fill: cushion });
  s += rect(x - 24, y - 150, 48, 120, { rx: 16, fill: col }) + rect(x + w - 24, y - 150, 48, 120, { rx: 16, fill: col });
  s += rect(x + 20, y - 30, 20, 30, { fill: C.stone700 }) + rect(x + w - 40, y - 30, 20, 30, { fill: C.stone700 });
  // throw pillow
  s += rect(x + 60, y - 180, 70, 70, { rx: 10, fill: C.p400, transform: `rotate(-8 ${n(x + 95)} ${n(y - 145)})` });
  return s;
}
function coffeeTable(x, y, w) {
  return ellipse(x + w / 2, y - 80, w / 2, 24, { fill: C.stone300 }) + rect(x + w / 2 - 12, y - 80, 24, 80, { fill: C.stone500 }) + ellipse(x + w / 2, y, w / 4, 10, { fill: C.stone500 }) +
    rect(x + w / 2 - 50, y - 110, 100, 24, { rx: 4, fill: C.p600 }) + circle(x + w / 2 + 70, y - 94, 16, { fill: C.surface, stroke: C.stone400, 'stroke-width': 3 });
}
function rug(x, y, w, r) {
  const col = r.pick([C.p100, C.stone200, C.p200]);
  return ellipse(x, y, w / 2, 36, { fill: col }) + ellipse(x, y, w / 2 - 30, 24, { fill: 'none', stroke: C.surface, 'stroke-width': 4, 'stroke-opacity': 0.8 });
}
function floorLamp(x, y) {
  return rect(x - 5, y - 420, 10, 420, { fill: C.stone600 }) + ellipse(x, y, 40, 10, { fill: C.stone600 }) +
    poly([[x - 70, y - 420], [x + 70, y - 420], [x + 55, y - 520], [x - 55, y - 520]], { fill: C.p200 });
}
function bookshelf(x, y, w, h, r) {
  let s = rect(x, y - h, w, h, { fill: C.stone600 });
  const rows = Math.max(2, Math.floor(h / 110));
  for (let k = 0; k < rows; k++) {
    const ry = y - h + 14 + k * (h / rows);
    s += rect(x + 12, ry, w - 24, h / rows - 14, { fill: C.sunken });
    let bx = x + 20;
    while (bx < x + w - 50) {
      const bw = r.int(14, 30), bh = r.int(40, h / rows - 30);
      s += rect(bx, ry + (h / rows - 14) - bh, bw, bh, { rx: 2, fill: r.pick([C.p500, C.p700, C.stone400, C.stone500, C.p300, C.ink]) });
      bx += bw + 4;
    }
  }
  return s;
}
function kitchenRun(x, y, w, r) {
  let s = rect(x, y - 180, w, 180, { fill: C.stone300 }) + rect(x - 10, y - 196, w + 20, 18, { rx: 4, fill: C.stone600 });
  const cols = Math.floor(w / 150);
  for (let k = 0; k < cols; k++) {
    const cx = x + 10 + k * (w / cols);
    s += rect(cx, y - 170, w / cols - 20, 160, { rx: 6, fill: C.stone200 }) + rect(cx + (w / cols) / 2 - 24, y - 120, 48, 8, { rx: 4, fill: C.stone600 });
  }
  // upper cabinets
  s += rect(x, y - 560, w, 170, { fill: C.stone200 });
  for (let k = 0; k < cols; k++) {
    const cx = x + 10 + k * (w / cols);
    s += rect(cx, y - 550, w / cols - 20, 150, { rx: 6, fill: C.sunken }) + rect(cx + (w / cols) / 2 - 24, y - 410, 48, 8, { rx: 4, fill: C.stone600 });
  }
  // stove + kettle + pot
  const sx = x + w * 0.55;
  s += rect(sx, y - 206, 220, 12, { rx: 4, fill: C.ink });
  for (let k = 0; k < 2; k++) s += circle(sx + 60 + k * 100, y - 200, 24, { fill: 'none', stroke: C.stone700, 'stroke-width': 6 });
  s += rect(sx + 30, y - 270, 70, 64, { rx: 8, fill: C.p500 }) + pathd(`M${n(sx + 100)} ${n(sx ? y - 250 : y)} q 30 10 30 40`, stroke(C.p600, 8));
  s += rect(x + 60, y - 220, 90, 24, { rx: 8, fill: C.stone600 }) + rect(x + 40, y - 232, 130, 10, { rx: 5, fill: C.stone400 }); // sink
  s += pathd(`M${n(x + 105)} ${n(y - 232)} v -40 q 0 -30 30 -30 h 10`, stroke(C.stone600, 8));
  // pendant lamp
  s += line(x + w * 0.5, 0, x + w * 0.5, 160, stroke(C.stone600, 4)) + poly([[x + w * 0.5 - 60, 230], [x + w * 0.5 + 60, 230], [x + w * 0.5 + 30, 160], [x + w * 0.5 - 30, 160]], { fill: C.p400 });
  return s;
}
function facade(r) {
  const W = 1200, H = 900, groundY = 700;
  let s = rect(0, 0, W, H, { fill: r.pick([C.p50, C.paper, C.sunken]) }) + circle(r.int(150, 400), 160, 60, { fill: C.p300 }) + rect(0, groundY, W, H - groundY, { fill: C.stone300 });
  // sidewalk + road
  s += rect(0, groundY + 80, W, 20, { fill: C.stone400 });
  const bx = 180, bw = 760, by = 150;
  const brick = r.pick([C.stone200, C.p100, C.surface, C.stone300]);
  s += rect(bx, by, bw, groundY - by, { fill: brick, stroke: C.stone600, 'stroke-width': 6 });
  s += rect(bx - 20, by - 30, bw + 40, 40, { rx: 6, fill: C.stone600 });
  const floors = r.int(3, 4), cols = r.int(4, 6);
  const fh = (groundY - by - 160) / floors, cw = bw / cols;
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const wx = bx + c * cw + cw * 0.25, wy = by + 40 + f * fh;
    const lit = r.chance(0.35);
    s += rect(wx, wy, cw * 0.5, fh * 0.6, { rx: 4, fill: lit ? C.p200 : C.stone500, stroke: C.stone700, 'stroke-width': 4 }) + line(wx + cw * 0.25, wy, wx + cw * 0.25, wy + fh * 0.6, stroke(C.stone700, 4));
  }
  // door + steps
  const dx = bx + bw / 2 - 60;
  s += rect(dx, groundY - 150, 120, 150, { rx: 6, fill: C.p600 }) + circle(dx + 96, groundY - 76, 6, { fill: C.p200 }) + rect(dx - 30, groundY, 180, 14, { fill: C.stone500 }) + rect(dx - 50, groundY + 14, 220, 14, { fill: C.stone400 });
  // trees
  for (const tx of [90, 1110]) s += rect(tx - 10, groundY - 120, 20, 120, { fill: C.stone600 }) + circle(tx, groundY - 200, 90, { fill: C.stone400 }) + circle(tx - 50, groundY - 150, 60, { fill: C.stone500 });
  return s;
}
const ROOM_TYPES = ['bedroom', 'study', 'living', 'kitchen', 'studio', 'building'];
function room(i) {
  const r = rng(`room-${i}`);
  const type = ROOM_TYPES[(i - 1) % ROOM_TYPES.length];
  const city = CITIES[(i * 7 + r.int(0, 3)) % CITIES.length];
  const W = 1200, H = 900, floorY = r.int(620, 680);
  const mirror = r.chance(0.5);
  let body = '';
  let name = '';
  if (type === 'building') {
    body = facade(r);
    name = 'Building';
  } else {
    const wall = WALLS[r.int(0, WALLS.length - 1)];
    const floor = FLOORS[r.int(0, FLOORS.length - 1)];
    let s = rect(0, 0, W, H, { fill: wall }) + rect(0, floorY, W, H - floorY, { fill: floor }) + floorPlanks(floorY, r) + rect(0, floorY - 18, W, 18, { fill: C.stone300 });
    const wx = r.int(90, 240), wy = r.int(110, 160), ww = r.int(300, 420), wh = r.int(300, 380);
    const curtains = r.chance(0.6);
    if (type !== 'kitchen') s += lightBeam(wx, wy, ww, wh, floorY) + windowPane(wx, wy, ww, wh, r, { curtains });
    if (type === 'bedroom') {
      s += bed(wx + ww + 60, floorY + 90, r.int(460, 560), r) + nightstand(wx + ww + 60 + r.int(480, 580), floorY + 70);
      if (r.chance(0.7)) s += frame(wx + ww + 200, 150, 150, 120, r);
      if (r.chance(0.8)) s += plant(80, floorY + 60, r.range(0.9, 1.3), r);
      if (r.chance(0.5)) s += rug(600, floorY + 170, 520, r);
      name = 'Bedroom';
    } else if (type === 'study') {
      s += desk(wx + ww + 80, floorY + 60, r.int(380, 460), r) + chair(wx + ww + 190, floorY + 110);
      s += bookshelf(60 + (r.chance(0.5) ? 0 : 940), floorY + 40, 160, r.int(380, 520), r);
      if (r.chance(0.7)) s += plant(wx + ww + 560, floorY + 60, 0.9, r);
      name = 'Study';
    } else if (type === 'living') {
      s += rug(620, floorY + 150, 640, r) + sofa(wx + ww + 40, floorY + 60, r.int(480, 560), r) + coffeeTable(wx + ww + 120, floorY + 170, 220);
      s += floorLamp(wx + ww + 660, floorY + 70);
      s += plant(90, floorY + 70, r.range(1.1, 1.5), r);
      if (r.chance(0.8)) s += frame(wx + ww + 150, 130, 120, 160, r) + frame(wx + ww + 300, 150, 180, 120, r);
      name = 'Living room';
    } else if (type === 'kitchen') {
      s += kitchenRun(60, floorY + 20, 1080, r);
      s += plant(1110, floorY - 176, 0.6, r);
      name = 'Kitchen';
    } else if (type === 'studio') {
      s += bed(wx + ww + 60, floorY + 70, 400, r) + desk(60, floorY + 60, 300, r);
      if (r.chance(0.6)) s += plant(1120, floorY + 60, 0.9, r);
      if (r.chance(0.5)) s += frame(wx + ww + 160, 140, 140, 110, r);
      name = 'Studio';
    }
    body = mirror ? rect(0, 0, W, H, { fill: wall }) + g(s, { transform: `translate(${W} 0) scale(-1 1)` }) : s;
  }
  body += labelChip(40, H - 110, `${name} · ${city}`);
  return { svg: svg(W, H, body, { role: 'img', 'aria-label': `${name} in ${city}` }), meta: { label: `${name} · ${city}`, width: W, height: H, type } };
}

// =====================================================================
//  ITEMS
// =====================================================================
const ITEMS = {
  furniture: ['Desk chair', 'Study desk', 'Bookshelf', 'Loveseat', 'Floor lamp', 'Bed frame (full)', 'Dresser', 'Dining table', 'Nightstand', 'Bar stool', 'Bean bag', 'Clothes rack'],
  electronics: ['Laptop', '27" monitor', 'Phone', 'Headphones', 'Printer', 'Bluetooth speaker', 'Tablet', 'Mechanical keyboard', 'Desk fan', 'Router', 'Mini projector', 'Smart lamp'],
  textbooks: ['Calculus textbook', 'Organic chemistry', 'Intro economics', 'Linear algebra', 'Data structures', 'Statistics', 'Physics vol. 1', 'Accounting', 'Psychology 101', 'Microbiology', 'Macroeconomics', 'Writing handbook'],
  kitchen: ['Rice cooker', 'Electric kettle', 'Frying pan', 'Stock pot', 'Mug set', 'Blender', 'Toaster', 'Bowl set', 'Air fryer', 'Hot pot', 'Knife set', 'Water filter'],
  bikes: ['Road bike', 'Commuter bike', 'Electric scooter', 'Bike helmet', 'U-lock', 'Folding bike', 'Longboard', 'Bike lights', 'Mountain bike', 'City bike', 'Bike pump', 'Pannier bag'],
};
const ITEM_BG = [C.sunken, C.paper, C.p50, C.stone200];
function drawItem(category, name, r) {
  const ink = C.stone600, dark = C.ink, acc = C.p500, light = C.surface;
  const cx = 400, base = 560;
  let s = ellipse(cx, base + 30, 220, 26, { fill: C.stone300, 'fill-opacity': 0.6 });
  if (category === 'furniture') {
    const v = name.toLowerCase();
    if (v.includes('chair') || v.includes('stool')) s += rect(cx - 90, base - 330, 180, 130, { rx: 30, fill: ink }) + rect(cx - 110, base - 200, 220, 40, { rx: 16, fill: dark }) + rect(cx - 14, base - 160, 28, 110, { fill: dark }) + ellipse(cx, base - 50, 110, 16, { fill: dark }) + line(cx - 90, base - 40, cx - 120, base + 20, stroke(dark, 12)) + line(cx + 90, base - 40, cx + 120, base + 20, stroke(dark, 12)) + circle(cx, base - 265, 30, { fill: acc });
    else if (v.includes('desk') || v.includes('table') || v.includes('nightstand')) s += rect(cx - 230, base - 220, 460, 26, { rx: 6, fill: dark }) + rect(cx - 210, base - 194, 24, 210, { fill: ink }) + rect(cx + 186, base - 194, 24, 210, { fill: ink }) + rect(cx + 60, base - 194, 130, 100, { rx: 6, fill: ink }) + rect(cx + 100, base - 150, 50, 10, { rx: 5, fill: light }) + rect(cx - 120, base - 260, 60, 40, { rx: 6, fill: acc });
    else if (v.includes('shelf') || v.includes('dresser') || v.includes('rack')) { s += rect(cx - 180, base - 420, 360, 420, { rx: 8, fill: ink }); for (let k = 0; k < 3; k++) { s += rect(cx - 160, base - 400 + k * 135, 320, 115, { fill: light }); let bx = cx - 150; while (bx < cx + 120) { const bw = r.int(16, 34), bh = r.int(60, 100); s += rect(bx, base - 285 + k * 135 - bh, bw, bh, { rx: 2, fill: r.pick([acc, C.p700, C.stone400, dark, C.p300]) }); bx += bw + 5; } } }
    else if (v.includes('seat') || v.includes('bean')) s += rect(cx - 220, base - 260, 440, 130, { rx: 30, fill: ink }) + rect(cx - 220, base - 170, 440, 120, { rx: 24, fill: dark }) + rect(cx - 200, base - 240, 200, 90, { rx: 16, fill: C.stone400 }) + rect(cx + 10, base - 240, 190, 90, { rx: 16, fill: C.stone400 }) + rect(cx - 100, base - 230, 70, 70, { rx: 10, fill: acc, transform: `rotate(-10 ${cx - 65} ${base - 195})` });
    else if (v.includes('lamp')) s += rect(cx - 8, base - 420, 16, 420, { fill: dark }) + ellipse(cx, base, 70, 14, { fill: dark }) + poly([[cx - 110, base - 420], [cx + 110, base - 420], [cx + 80, base - 560], [cx - 80, base - 560]], { fill: acc });
    else s += rect(cx - 240, base - 170, 480, 60, { rx: 12, fill: ink }) + rect(cx - 240, base - 280, 60, 280, { rx: 10, fill: dark }) + rect(cx + 180, base - 240, 60, 240, { rx: 10, fill: dark }) + rect(cx - 170, base - 230, 350, 70, { rx: 14, fill: light, stroke: C.stone300, 'stroke-width': 4 }) + rect(cx - 150, base - 220, 110, 40, { rx: 10, fill: acc });
  } else if (category === 'electronics') {
    const v = name.toLowerCase();
    if (v.includes('headphones')) s += pathd(`M${cx - 180} ${base - 120} v -60 a 180 180 0 0 1 360 0 v 60`, stroke(dark, 22)) + rect(cx - 230, base - 140, 90, 150, { rx: 30, fill: dark }) + rect(cx + 140, base - 140, 90, 150, { rx: 30, fill: dark }) + rect(cx - 210, base - 120, 50, 110, { rx: 20, fill: acc }) + rect(cx + 160, base - 120, 50, 110, { rx: 20, fill: acc });
    else if (v.includes('laptop')) s += rect(cx - 200, base - 300, 400, 250, { rx: 14, fill: dark }) + rect(cx - 180, base - 280, 360, 210, { rx: 6, fill: C.stone500 }) + rect(cx - 240, base - 50, 480, 22, { rx: 8, fill: ink }) + circle(cx, base - 175, 24, { fill: acc });
    else if (v.includes('monitor') || v.includes('tablet') || v.includes('projector')) s += rect(cx - 240, base - 360, 480, 290, { rx: 12, fill: dark }) + rect(cx - 220, base - 340, 440, 250, { rx: 6, fill: C.stone500 }) + rect(cx - 30, base - 70, 60, 50, { fill: ink }) + rect(cx - 120, base - 24, 240, 14, { rx: 7, fill: ink }) + rect(cx - 150, base - 300, 120, 50, { rx: 8, fill: acc, 'fill-opacity': 0.9 });
    else if (v.includes('phone')) s += rect(cx - 110, base - 420, 220, 420, { rx: 30, fill: dark }) + rect(cx - 94, base - 400, 188, 380, { rx: 20, fill: C.stone500 }) + circle(cx, base - 350, 14, { fill: acc }) + rect(cx - 40, base - 60, 80, 8, { rx: 4, fill: light });
    else if (v.includes('printer')) s += rect(cx - 220, base - 220, 440, 200, { rx: 16, fill: ink }) + rect(cx - 150, base - 300, 300, 90, { rx: 8, fill: light, stroke: C.stone300, 'stroke-width': 4 }) + rect(cx - 160, base - 60, 320, 30, { rx: 6, fill: C.stone400 }) + circle(cx + 160, base - 180, 12, { fill: acc });
    else if (v.includes('speaker') || v.includes('router')) s += rect(cx - 160, base - 260, 320, 250, { rx: 40, fill: dark }) + circle(cx - 70, base - 135, 50, { fill: ink, stroke: C.stone500, 'stroke-width': 8 }) + circle(cx + 70, base - 135, 50, { fill: ink, stroke: C.stone500, 'stroke-width': 8 }) + circle(cx + 70, base - 135, 14, { fill: acc });
    else if (v.includes('keyboard')) { s += rect(cx - 260, base - 120, 520, 110, { rx: 14, fill: dark }); for (let row = 0; row < 3; row++) for (let k = 0; k < 12; k++) s += rect(cx - 240 + k * 41, base - 104 + row * 32, 32, 24, { rx: 5, fill: k === 11 && row === 0 ? acc : C.stone500 }); }
    else if (v.includes('lamp')) s += rect(cx - 8, base - 300, 16, 300, { fill: dark }) + ellipse(cx, base, 90, 16, { fill: dark }) + poly([[cx - 130, base - 300], [cx + 130, base - 300], [cx + 90, base - 440], [cx - 90, base - 440]], { fill: acc }) + rect(cx - 30, base - 220, 60, 24, { rx: 12, fill: C.stone400 }) + circle(cx + 50, base - 40, 10, { fill: acc });
    else if (v.includes('fan')) s += circle(cx, base - 240, 170, { fill: 'none', stroke: dark, 'stroke-width': 18 }) + ellipse(cx, base - 320, 30, 70, { fill: ink }) + ellipse(cx - 70, base - 200, 70, 30, { fill: ink, transform: `rotate(-30 ${cx - 70} ${base - 200})` }) + ellipse(cx + 70, base - 200, 70, 30, { fill: ink, transform: `rotate(30 ${cx + 70} ${base - 200})` }) + circle(cx, base - 240, 22, { fill: acc }) + rect(cx - 10, base - 70, 20, 60, { fill: dark }) + rect(cx - 90, base - 14, 180, 14, { rx: 7, fill: dark });
    else s += rect(cx - 120, base - 420, 240, 320, { rx: 60, fill: ink }) + rect(cx - 70, base - 100, 140, 100, { fill: dark }) + circle(cx, base - 260, 50, { fill: acc });
  } else if (category === 'textbooks') {
    const colors = [C.p600, C.stone500, C.p300, dark, C.p700];
    const count = r.int(2, 4);
    for (let k = 0; k < count; k++) {
      const h = r.int(50, 80), w = r.int(340, 420), y = base - 20 - k * 70 - (k ? r.int(0, 10) : 0);
      s += rect(cx - w / 2, y - h, w, h, { rx: 8, fill: colors[(k + r.int(0, 4)) % colors.length], transform: `rotate(${k % 2 ? -2 : 2} ${cx} ${y})` }) + rect(cx - w / 2 + 24, y - h + 12, 60, h - 24, { rx: 4, fill: light, 'fill-opacity': 0.5 });
    }
    s += rect(cx - 120, base - 400, 240, 140, { rx: 10, fill: light, stroke: C.stone300, 'stroke-width': 5 }) + line(cx - 80, base - 360, cx + 80, base - 360, stroke(C.stone400, 8)) + line(cx - 80, base - 330, cx + 40, base - 330, stroke(C.stone400, 8)) + line(cx - 80, base - 300, cx + 60, base - 300, stroke(acc, 8));
  } else if (category === 'kitchen') {
    const v = name.toLowerCase();
    if (v.includes('rice') || v.includes('fryer') || v.includes('hot pot')) s += rect(cx - 170, base - 260, 340, 250, { rx: 50, fill: light, stroke: dark, 'stroke-width': 10 }) + rect(cx - 150, base - 300, 300, 60, { rx: 30, fill: dark }) + rect(cx - 40, base - 320, 80, 24, { rx: 12, fill: acc }) + rect(cx - 90, base - 100, 180, 36, { rx: 8, fill: C.stone300 }) + circle(cx + 110, base - 60, 10, { fill: acc });
    else if (v.includes('kettle')) s += pathd(`M${cx - 150} ${base} v -220 q 0 -60 60 -60 h 180 q 60 0 60 60 v 220 z`, { fill: dark }) + pathd(`M${cx + 150} ${base - 240} l 90 -40 l -20 90`, stroke(dark, 20)) + rect(cx - 90, base - 310, 180, 30, { rx: 15, fill: ink }) + rect(cx - 30, base - 340, 60, 30, { rx: 15, fill: acc }) + rect(cx - 110, base - 180, 20, 120, { rx: 10, fill: C.stone500 });
    else if (v.includes('pan') || v.includes('pot')) s += ellipse(cx - 40, base - 120, 190, 110, { fill: dark }) + ellipse(cx - 40, base - 140, 170, 80, { fill: ink }) + rect(cx + 120, base - 150, 200, 34, { rx: 17, fill: dark }) + rect(cx + 240, base - 146, 70, 26, { rx: 13, fill: acc });
    else if (v.includes('mug') || v.includes('bowl')) { const cols = [acc, light, C.p300]; for (let k = 0; k < 3; k++) { const x = cx - 220 + k * 200; s += rect(x, base - 170, 150, 160, { rx: 24, fill: cols[k], stroke: dark, 'stroke-width': 8 }) + pathd(`M${x + 150} ${base - 130} h 40 a 40 40 0 0 1 0 80 h -40`, stroke(dark, 10)); } }
    else if (v.includes('blender') || v.includes('toaster') || v.includes('filter')) s += rect(cx - 120, base - 160, 240, 150, { rx: 24, fill: dark }) + poly([[cx - 90, base - 160], [cx + 90, base - 160], [cx + 110, base - 440], [cx - 110, base - 440]], { fill: light, stroke: dark, 'stroke-width': 10 }) + rect(cx - 100, base - 300, 200, 60, { fill: acc, 'fill-opacity': 0.8 }) + circle(cx, base - 85, 20, { fill: acc });
    else { for (let k = 0; k < 4; k++) s += rect(cx - 170 + k * 100, base - 380 + k * 20, 40, 360 - k * 20, { rx: 12, fill: k === 1 ? acc : dark }) + rect(cx - 174 + k * 100, base - 100, 48, 100, { rx: 10, fill: ink }); }
  } else if (category === 'bikes') {
    const v = name.toLowerCase();
    if (v.includes('helmet')) s += pathd(`M${cx - 220} ${base - 120} a 220 200 0 0 1 440 0 v 40 h -440 z`, { fill: acc }) + pathd(`M${cx - 160} ${base - 160} a 160 120 0 0 1 320 0`, stroke(C.p700, 14)) + rect(cx - 220, base - 90, 440, 40, { rx: 20, fill: dark }) + line(cx - 60, base - 40, cx - 20, base + 20, stroke(dark, 10)) + line(cx + 60, base - 40, cx + 20, base + 20, stroke(dark, 10));
    else if (v.includes('lock') || v.includes('pump') || v.includes('lights')) s += pathd(`M${cx - 120} ${base - 80} v -200 a 120 120 0 0 1 240 0 v 200`, stroke(dark, 34)) + rect(cx - 190, base - 110, 380, 110, { rx: 24, fill: ink }) + circle(cx, base - 55, 24, { fill: acc });
    else if (v.includes('scooter') || v.includes('board')) s += rect(cx - 260, base - 90, 380, 30, { rx: 15, fill: dark }) + circle(cx - 230, base - 40, 46, { fill: ink, stroke: dark, 'stroke-width': 14 }) + circle(cx + 150, base - 40, 46, { fill: ink, stroke: dark, 'stroke-width': 14 }) + line(cx + 120, base - 90, cx + 220, base - 420, stroke(dark, 22)) + rect(cx + 150, base - 440, 140, 24, { rx: 12, fill: acc }) + circle(cx + 150, base - 40, 12, { fill: acc });
    else s += circle(cx - 200, base - 130, 120, { fill: 'none', stroke: dark, 'stroke-width': 18 }) + circle(cx + 200, base - 130, 120, { fill: 'none', stroke: dark, 'stroke-width': 18 }) + circle(cx - 200, base - 130, 20, { fill: acc }) + circle(cx + 200, base - 130, 20, { fill: acc }) + poly([[cx - 200, base - 130], [cx - 40, base - 130], [cx + 40, base - 320], [cx - 150, base - 320]], stroke(acc, 18)) + line(cx + 40, base - 320, cx + 200, base - 130, stroke(acc, 18)) + line(cx - 40, base - 130, cx + 20, base - 330, stroke(acc, 18)) + line(cx + 60, base - 360, cx + 20, base - 330, stroke(dark, 14)) + rect(cx - 220, base - 360, 90, 22, { rx: 11, fill: dark }) + line(cx - 160, base - 350, cx - 150, base - 320, stroke(dark, 12)) + circle(cx - 40, base - 130, 30, { fill: 'none', stroke: dark, 'stroke-width': 10 });
  }
  return s;
}
const CAT_LABEL = { furniture: 'Furniture · 家具', electronics: 'Electronics · 电子', textbooks: 'Textbooks · 课本', kitchen: 'Kitchen · 厨房', bikes: 'Bikes · 自行车' };
function item(i) {
  const r = rng(`item-${i}`);
  const cats = Object.keys(ITEMS);
  const category = cats[(i - 1) % cats.length];
  const name = ITEMS[category][Math.floor((i - 1) / cats.length) % ITEMS[category].length];
  const bg = ITEM_BG[r.int(0, ITEM_BG.length - 1)];
  let body = rect(0, 0, 800, 800, { fill: bg });
  body += circle(r.int(520, 680), r.int(120, 260), r.int(90, 160), { fill: C.surface, 'fill-opacity': 0.5 });
  body += drawItem(category, name, r);
  body += labelChip(36, 800 - 92, name, { size: 28 });
  body += labelChip(800 - 36, 36, CAT_LABEL[category], { size: 22, align: 'right', fill: C.ink, color: C.paper });
  return { svg: svg(800, 800, body, { role: 'img', 'aria-label': name }), meta: { label: name, category, width: 800, height: 800 } };
}

// =====================================================================
//  BUDDY SCENES
// =====================================================================
const BUDDY_TYPES = [
  ['airport_pickup', 'Airport pickup · 接机'], ['carpool', 'Carpool · 拼车'], ['study', 'Library · 自习'], ['gym', 'Gym · 健身'],
  ['dining', 'Dinner · 聚餐'], ['costco_run', 'Costco run · 囤货'], ['travel', 'Hiking · 徒步'],
];
function buddyScene(type, r) {
  const W = 1600, H = 900, groundY = 640;
  const ink = C.ink, mid = C.stone600, far = C.stone400, acc = C.p500;
  let s = rect(0, 0, W, H, { fill: r.pick([C.paper, C.p50, C.sunken]) }) + rect(0, groundY, W, H - groundY, { fill: C.stone200 });
  if (type === 'airport_pickup') {
    s += rect(100, groundY - 220, 1000, 220, { fill: far }) + rect(1100, groundY - 360, 90, 360, { fill: mid }) + rect(1080, groundY - 420, 130, 70, { rx: 10, fill: ink });
    for (let k = 0; k < 11; k++) s += rect(130 + k * 88, groundY - 180, 60, 90, { rx: 4, fill: C.p100 });
    for (let k = 0; k < 7; k++) s += rect(60 + k * 220, groundY + 120, 110, 12, { rx: 6, fill: C.stone400 });
    s += g(ellipse(0, 0, 260, 44, { fill: ink }) + poly([[-60, -10], [120, -10], [20, -150], [-40, -150]], { fill: ink }) + poly([[-260, -10], [-200, -10], [-150, -100], [-230, -100]], { fill: acc }) + poly([[-20, 10], [80, 10], [100, 80], [-60, 80]], { fill: ink }) + poly([[200, -30], [280, -80], [280, 0]], { fill: C.p200 }), { transform: 'translate(620 230) rotate(-12)' });
    s += rect(1280, groundY - 150, 120, 160, { rx: 14, fill: acc }) + rect(1310, groundY - 190, 60, 40, { rx: 10, fill: ink }) + rect(1300, groundY - 130, 80, 10, { rx: 5, fill: C.p200 }) + circle(1310, groundY + 14, 12, { fill: ink }) + circle(1370, groundY + 14, 12, { fill: ink });
    s += text(240, groundY - 60, 'ARRIVALS', { 'font-size': 60, 'font-weight': 700, fill: C.paper, 'letter-spacing': 6 });
  } else if (type === 'carpool') {
    s += rect(0, groundY + 40, W, 140, { fill: C.stone700 });
    for (let k = 0; k < 9; k++) s += rect(40 + k * 190, groundY + 104, 100, 10, { rx: 5, fill: C.p100 });
    for (const [x, h] of [[200, 180], [420, 260], [1300, 220], [1480, 160]]) s += rect(x, groundY - h, 120, h, { fill: far }) + rect(x + 20, groundY - h + 30, 80, h - 60, { fill: C.stone300 });
    s += g(rect(0, 40, 620, 140, { rx: 36, fill: acc }) + poly([[120, 40], [180, -60], [460, -60], [540, 40]], { fill: acc }) + poly([[150, 40], [200, -40], [300, -40], [300, 40]], { fill: C.p100 }) + poly([[320, 40], [320, -40], [440, -40], [500, 40]], { fill: C.p100 }) + circle(130, 180, 56, { fill: ink }) + circle(490, 180, 56, { fill: ink }) + circle(130, 180, 22, { fill: C.stone300 }) + circle(490, 180, 22, { fill: C.stone300 }) + rect(560, 90, 50, 24, { rx: 8, fill: C.p100 }), { transform: `translate(560 ${groundY - 180})` });
    s += rect(1040, groundY - 320, 14, 320, { fill: mid }) + rect(990, groundY - 400, 114, 90, { rx: 10, fill: ink }) + text(1047, groundY - 342, 'HOV', { 'font-size': 40, 'font-weight': 700, fill: C.paper, 'text-anchor': 'middle' });
  } else if (type === 'study') {
    s = rect(0, 0, W, H, { fill: C.sunken }) + rect(0, groundY, W, H - groundY, { fill: C.stone300 });
    for (let col = 0; col < 2; col++) {
      const x = 80 + col * 1180;
      s += rect(x, 100, 260, groundY - 100, { fill: mid });
      for (let row = 0; row < 4; row++) { s += rect(x + 14, 120 + row * 130, 232, 110, { fill: C.sunken }); let bx = x + 22; while (bx < x + 230) { const bw = r.int(14, 28), bh = r.int(60, 100); s += rect(bx, 230 + row * 130 - bh, bw, bh, { rx: 2, fill: r.pick([acc, C.p700, far, mid, C.p300, ink]) }); bx += bw + 4; } }
    }
    s += rect(420, groundY - 190, 760, 24, { rx: 6, fill: mid }) + rect(450, groundY - 166, 24, 166, { fill: mid }) + rect(1126, groundY - 166, 24, 166, { fill: mid });
    s += rect(500, groundY - 250, 150, 60, { rx: 6, fill: C.p600 }) + rect(520, groundY - 290, 130, 40, { rx: 6, fill: far }) + rect(700, groundY - 330, 320, 140, { rx: 10, fill: ink }) + rect(716, groundY - 316, 288, 110, { rx: 6, fill: C.stone500 });
    s += pathd(`M${1060} ${groundY - 190} v -170 q 0 -40 40 -40 h 60`, stroke(mid, 12)) + poly([[1140, groundY - 440], [1220, groundY - 440], [1250, groundY - 370], [1110, groundY - 370]], { fill: acc }) + poly([[1110, groundY - 370], [1250, groundY - 370], [1300, groundY - 190], [1050, groundY - 190]], { fill: C.p100, 'fill-opacity': 0.6 });
    s += rect(560, groundY - 60, 60, 60, { rx: 8, fill: acc });
  } else if (type === 'gym') {
    s = rect(0, 0, W, H, { fill: C.stone200 }) + rect(0, groundY, W, H - groundY, { fill: C.stone700 });
    for (let k = 0; k < 6; k++) s += rect(0, groundY + 20 + k * 40, W, 2, { fill: C.stone600 });
    s += rect(300, groundY - 300, 1000, 36, { rx: 18, fill: ink });
    for (const [x, w] of [[180, 60], [250, 50], [1300, 50], [1370, 60]]) s += rect(x, groundY - 420, w, 280, { rx: 14, fill: mid });
    s += rect(640, groundY - 300, 320, 36, { fill: acc });
    s += circle(1200, 260, 70, { fill: C.surface, stroke: ink, 'stroke-width': 10 }) + line(1200, 260, 1200, 215, stroke(ink, 8)) + line(1200, 260, 1235, 275, stroke(acc, 8));
    s += pathd(`M${430} ${groundY} v -40 a 40 40 0 0 1 80 0 v 40`, stroke(ink, 60)) + rect(380, groundY - 110, 180, 150, { rx: 50, fill: ink }) + rect(430, groundY - 40, 80, 40, { fill: acc });
    s += rect(1000, groundY - 120, 360, 40, { rx: 14, fill: mid }) + rect(1030, groundY - 80, 24, 80, { fill: mid }) + rect(1306, groundY - 80, 24, 80, { fill: mid });
  } else if (type === 'dining') {
    s = rect(0, 0, W, H, { fill: C.p50 }) + rect(0, groundY + 60, W, H - groundY - 60, { fill: C.stone300 });
    s += line(800, 0, 800, 180, stroke(mid, 6)) + poly([[700, 300], [900, 300], [860, 180], [740, 180]], { fill: acc }) + poly([[700, 300], [900, 300], [1000, 540], [600, 540]], { fill: C.p100, 'fill-opacity': 0.6 });
    s += ellipse(800, groundY, 520, 120, { fill: C.surface, stroke: C.stone300, 'stroke-width': 8 }) + rect(360, groundY, 880, 140, { fill: mid, 'fill-opacity': 0.08 });
    for (const [cx, cy, rr, col] of [[560, groundY - 20, 70, C.p300], [800, groundY - 50, 90, acc], [1040, groundY - 20, 70, C.p300], [700, groundY + 50, 50, far], [900, groundY + 50, 50, far]]) s += circle(cx, cy, rr, { fill: C.surface, stroke: ink, 'stroke-width': 8 }) + circle(cx, cy, rr - 22, { fill: col });
    s += line(630, groundY + 40, 690, groundY - 70, stroke(ink, 6)) + line(650, groundY + 40, 710, groundY - 70, stroke(ink, 6)) + line(900, groundY + 100, 960, groundY - 10, stroke(ink, 6)) + line(920, groundY + 100, 980, groundY - 10, stroke(ink, 6));
    s += pathd(`M1180 ${groundY - 120} h 90 v 100 h -90 z`, { fill: mid }) + pathd(`M1270 ${groundY - 100} q 50 10 40 60`, stroke(mid, 10)) + rect(1200, groundY - 140, 50, 24, { rx: 8, fill: acc });
    for (const x of [300, 1240]) s += rect(x, groundY - 140, 60, 260, { rx: 14, fill: mid, 'fill-opacity': 0.9 });
  } else if (type === 'costco_run') {
    s = rect(0, 0, W, H, { fill: C.stone200 }) + rect(0, groundY, W, H - groundY, { fill: C.stone300 });
    for (let col = 0; col < 2; col++) {
      const x = 60 + col * 1160;
      s += rect(x, 80, 320, groundY - 80, { fill: mid });
      for (let row = 0; row < 3; row++) { s += rect(x + 16, 100 + row * 180, 288, 150, { fill: C.sunken }); for (let k = 0; k < 4; k++) s += rect(x + 30 + k * 70, 150 + row * 180, 56, 90, { rx: 6, fill: r.pick([acc, C.p300, far, C.p700]) }); }
    }
    s += g(poly([[0, 0], [520, 0], [460, 240], [60, 240]], stroke(ink, 20)) + line(100, 60, 420, 60, stroke(ink, 10)) + line(130, 130, 400, 130, stroke(ink, 10)) + line(160, 0, 160, 240, stroke(ink, 8)) + line(360, 0, 360, 240, stroke(ink, 8)) + line(520, 0, 640, -140, stroke(ink, 20)) + rect(640, -160, 90, 28, { rx: 14, fill: acc }) + circle(110, 300, 36, { fill: ink }) + circle(420, 300, 36, { fill: ink }) + rect(30, -120, 150, 120, { rx: 8, fill: C.p300 }) + rect(200, -180, 220, 180, { rx: 8, fill: C.p100, stroke: C.p500, 'stroke-width': 8 }) + rect(300, -100, 80, 100, { rx: 6, fill: acc }), { transform: `translate(500 ${groundY - 320})` });
    s += text(800, 140, 'BULK', { 'font-size': 90, 'font-weight': 700, fill: C.surface, 'text-anchor': 'middle', 'letter-spacing': 12 }) + rect(600, 60, 400, 110, { rx: 20, fill: 'none', stroke: C.surface, 'stroke-width': 10 });
  } else {
    // hiking / travel
    s = rect(0, 0, W, H, { fill: C.p50 }) + circle(1240, 190, 90, { fill: acc });
    s += poly([[0, 560], [260, 300], [520, 520], [700, 360], [900, 560], [1200, 280], [1600, 540], [1600, 700], [0, 700]], { fill: far });
    s += poly([[0, 650], [200, 470], [420, 620], [640, 450], [880, 640], [1100, 480], [1360, 650], [1600, 520], [1600, 760], [0, 760]], { fill: mid });
    s += poly([[0, 760], [180, 640], [360, 740], [560, 620], [800, 760], [1000, 660], [1240, 760], [1400, 680], [1600, 760], [1600, 900], [0, 900]], { fill: ink });
    for (const [x, h] of [[260, 120], [330, 160], [1180, 140], [1260, 100]]) s += poly([[x - 50, 780], [x + 50, 780], [x, 780 - h]], { fill: C.stone700 }) + rect(x - 8, 780, 16, 40, { fill: C.stone700 });
    s += pathd('M 700 900 q 100 -120 60 -200 q -30 -60 100 -90', stroke(C.p100, 16, { 'stroke-dasharray': '34 24' }));
    s += rect(560, 700, 90, 120, { rx: 24, fill: acc }) + rect(580, 680, 50, 30, { rx: 12, fill: C.p700 }) + rect(575, 740, 60, 12, { rx: 6, fill: C.p200 });
  }
  return s;
}
function buddy(i) {
  const r = rng(`buddy-${i}`);
  const [type, label] = BUDDY_TYPES[(i - 1) % BUDDY_TYPES.length];
  let body = buddyScene(type, r);
  body += labelChip(40, 900 - 110, label, { size: 30 });
  return { svg: svg(1600, 900, body, { role: 'img', 'aria-label': label }), meta: { label, type, width: 1600, height: 900 } };
}

// =====================================================================
//  PARTNERS (fictional)
// =====================================================================
const PARTNERS = [
  ['bank', 'Northbank', 'Student checking'], ['bank', 'Maple Trust', 'No-fee accounts'],
  ['sim', 'Lumen Mobile', 'Prepaid SIM & eSIM'], ['sim', 'Hopper SIM', 'Campus data plans'],
  ['insurance', 'Nestsure', 'Renters insurance'], ['insurance', 'Covenant Renters', 'Deposit protection'],
  ['movers', 'Hauler Co.', 'Local movers'], ['movers', 'Two Boxes Moving', 'Dorm-to-apartment'],
  ['storage', 'Boxroom', 'Summer storage'], ['storage', 'Attic Self Storage', 'Month-to-month units'],
  ['furniture', 'Sofa Loop', 'Furniture rental'], ['furniture', 'Furnish Monthly', 'Rent-to-own sets'],
  ['airport_pickup', 'Gate Ride', 'Airport pickup'], ['airport_pickup', 'Terminal Taxi', 'Fixed-fare rides'],
  ['money_transfer', 'Swiftwire', 'Money transfer'], ['money_transfer', 'Ping Remit', 'Cross-border payments'],
  ['credit_card', 'Campus Card', 'First credit card'], ['credit_card', 'Fledge Credit', 'No-SSN credit'],
  ['tuition', 'TuitionPay', 'Tuition payments'], ['tuition', 'Semester Flow', 'Payment plans'],
];
function partner(i) {
  const r = rng(`partner-${i}`);
  const [category, name, tagline] = PARTNERS[(i - 1) % PARTNERS.length];
  const W = 600, H = 300;
  const bg = r.pick([C.surface, C.paper, C.sunken]);
  const style = r.int(0, 3);
  const monoFill = r.pick([C.p500, C.ink, C.p700, C.stone600]);
  const monoText = monoFill === C.ink || monoFill === C.stone600 ? C.paper : C.surface;
  let mono = '';
  const mx = 60, my = 86, ms = 128;
  if (style === 0) mono = rect(mx, my, ms, ms, { rx: 28, fill: monoFill });
  else if (style === 1) mono = circle(mx + ms / 2, my + ms / 2, ms / 2, { fill: monoFill });
  else if (style === 2) mono = rect(mx, my, ms, ms, { rx: 28, fill: 'none', stroke: monoFill, 'stroke-width': 10 });
  else mono = poly([[mx + ms / 2, my], [mx + ms, my + ms / 2], [mx + ms / 2, my + ms], [mx, my + ms / 2]], { fill: monoFill });
  const initial = name[0];
  mono += text(mx + ms / 2, my + ms / 2 + 26, initial, { 'font-size': 76, 'font-weight': 700, fill: style === 2 ? monoFill : monoText, 'text-anchor': 'middle' });
  // small accent dot (the only vivid accent when monogram is ink)
  if (monoFill !== C.p500) mono += circle(mx + ms - 4, my + 4, 12, { fill: C.p500, stroke: bg, 'stroke-width': 6 });
  const body = rect(0, 0, W, H, { fill: bg }) + mono +
    text(220, 150, name, { 'font-size': name.length > 13 ? 44 : 52, 'font-weight': 700, fill: C.ink, 'letter-spacing': -1.2 }) +
    text(222, 196, tagline, { 'font-size': 24, 'font-weight': 500, fill: C.stone500 }) +
    line(220, 222, 220 + Math.min(300, name.length * 24), 222, stroke(C.p500, 6));
  return { svg: svg(W, H, body, { role: 'img', 'aria-label': `${name} — ${tagline}` }), meta: { label: name, category, tagline, width: W, height: H } };
}

// =====================================================================
//  CAMPUS SKYLINES
// =====================================================================
function loadCampuses() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'data', 'campuses.json'), 'utf8')); } catch { return []; }
}
function campus(i, campuses) {
  const r = rng(`campus-${i}`);
  const c = campuses[(i - 1) % Math.max(1, campuses.length)] || { shortName: `Campus ${i}`, city: 'Somewhere', state: 'US' };
  const W = 1200, H = 400, groundY = 320;
  const sky = r.pick([C.paper, C.p50, C.sunken]);
  let s = rect(0, 0, W, H, { fill: sky }) + circle(r.int(120, 1080), r.int(70, 130), r.int(34, 54), { fill: C.p400 });
  // far layer
  let x = -20;
  while (x < W) { const w = r.int(60, 140), h = r.int(60, 150); s += rect(x, groundY - 40 - h, w, h + 40, { fill: C.stone300 }); x += w + r.int(10, 40); }
  // mid layer with roofs
  x = 10;
  while (x < W) {
    const w = r.int(80, 180), h = r.int(90, 200);
    s += rect(x, groundY - h, w, h, { fill: C.stone400 });
    const roof = r.int(0, 3);
    if (roof === 0) s += poly([[x - 6, groundY - h], [x + w + 6, groundY - h], [x + w / 2, groundY - h - w * 0.45]], { fill: C.stone400 });
    else if (roof === 1) s += pathd(`M${n(x + 10)} ${n(groundY - h)} a ${n(w / 2 - 10)} ${n(w / 2 - 10)} 0 0 1 ${n(w - 20)} 0 z`, { fill: C.stone400 });
    for (let wy = groundY - h + 24; wy < groundY - 20; wy += 34) for (let wx = x + 12; wx < x + w - 20; wx += 30) if (r.chance(0.75)) s += rect(wx, wy, 14, 20, { fill: sky, 'fill-opacity': 0.8 });
    x += w + r.int(14, 50);
  }
  // signature near-layer: a tower per campus (clock tower / dome / spire / arch) in ink
  const tx = r.int(300, 900), tw = r.int(70, 110), th = r.int(200, 260);
  const kind = (i - 1) % 4;
  s += rect(tx, groundY - th, tw, th, { fill: C.ink });
  if (kind === 0) s += poly([[tx - 10, groundY - th], [tx + tw + 10, groundY - th], [tx + tw / 2, groundY - th - 90]], { fill: C.ink }) + circle(tx + tw / 2, groundY - th + 50, 22, { fill: sky }) + line(tx + tw / 2, groundY - th + 50, tx + tw / 2, groundY - th + 36, stroke(C.ink, 4)) + line(tx + tw / 2, groundY - th + 50, tx + tw / 2 + 12, groundY - th + 56, stroke(C.p500, 4));
  else if (kind === 1) s += pathd(`M${n(tx - 20)} ${n(groundY - th)} a ${n(tw / 2 + 20)} ${n(tw / 2 + 20)} 0 0 1 ${n(tw + 40)} 0 z`, { fill: C.ink }) + rect(tx + tw / 2 - 4, groundY - th - tw / 2 - 50, 8, 34, { fill: C.ink }) + circle(tx + tw / 2, groundY - th - tw / 2 - 54, 8, { fill: C.p500 });
  else if (kind === 2) s += poly([[tx, groundY - th], [tx + tw, groundY - th], [tx + tw / 2, groundY - th - 160]], { fill: C.ink }) + rect(tx + tw / 2 - 3, groundY - th - 190, 6, 40, { fill: C.p500 });
  else s += rect(tx - 40, groundY - th + 40, tw + 80, th - 40, { fill: C.ink }) + pathd(`M${n(tx + 10)} ${n(groundY)} v -100 a ${n(tw / 2 - 10)} ${n(tw / 2 - 10)} 0 0 1 ${n(tw - 20)} 0 v 100 z`, { fill: sky }) + rect(tx + tw / 2 - 30, groundY - th - 10, 60, 12, { fill: C.p500 });
  // trees + ground
  s += rect(0, groundY, W, H - groundY, { fill: C.stone600 });
  for (let k = 0; k < 9; k++) { const tx2 = 40 + k * 140 + r.int(-30, 30); s += rect(tx2 - 5, groundY - 40, 10, 44, { fill: C.stone700 }) + circle(tx2, groundY - 60, r.int(22, 34), { fill: C.stone500 }); }
  s += rect(0, groundY + 4, W, 6, { fill: C.stone700 });
  s += labelChip(40, H - 86, `${c.shortName} · ${c.city}, ${c.state}`, { size: 26 });
  return { svg: svg(W, H, s, { role: 'img', 'aria-label': `${c.shortName} campus skyline` }), meta: { label: `${c.shortName} · ${c.city}, ${c.state}`, campusId: c.id, width: W, height: H } };
}

// =====================================================================
//  MAIN
// =====================================================================
const pad2 = (i) => String(i).padStart(2, '0');
const GROUPS = [
  ['avatars', 'a', 40, (i) => avatar(i)],
  ['rooms', 'r', 60, (i) => room(i)],
  ['items', 'i', 60, (i) => item(i)],
  ['buddy', 'b', 20, (i) => buddy(i)],
  ['partners', 'p', 20, (i) => partner(i)],
  ['campus', 'c', 10, (i, ctx) => campus(i, ctx.campuses)],
];

function main() {
  const ctx = { campuses: loadCampuses() };
  const manifest = { generatedBy: 'server/scripts/gen-placeholders.mjs', baseUrl: '/uploads/seed', groups: {} };
  let total = 0, oversize = 0, totalBytes = 0;
  for (const [group, prefix, count, make] of GROUPS) {
    const dir = path.join(OUT, group);
    if (!CHECK_ONLY) fs.mkdirSync(dir, { recursive: true });
    manifest.groups[group] = [];
    for (let i = 1; i <= count; i++) {
      const name = `${prefix}${pad2(i)}.svg`;
      const { svg: content, meta } = make(i, ctx);
      const bytes = Buffer.byteLength(content, 'utf8');
      totalBytes += bytes;
      if (bytes > MAX_BYTES) { oversize++; console.warn(`! ${group}/${name} is ${bytes} bytes (> ${MAX_BYTES})`); }
      if (!CHECK_ONLY) fs.writeFileSync(path.join(dir, name), content, 'utf8');
      manifest.groups[group].push({ file: name, url: `/uploads/seed/${group}/${name}`, bytes, ...meta });
      total++;
    }
    console.log(`${group.padEnd(9)} ${String(count).padStart(3)} files -> ${path.relative(ROOT, dir)}`);
  }
  if (!CHECK_ONLY) fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8');
  console.log(`${total} SVGs, ${(totalBytes / 1024).toFixed(0)} KB total, ${oversize} over ${MAX_BYTES / 1024} KB${CHECK_ONLY ? ' (check only, nothing written)' : ''}`);
  if (oversize) process.exitCode = 1;
}
main();
