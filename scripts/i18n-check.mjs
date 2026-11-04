// i18n consistency check: every dictionary key exists in both zh and en, and every literal t('a.b') key used in
// web/src exists. Template keys (t(`x.${y}`)) are checked by prefix only. Exit 1 on problems.
//   node scripts/i18n-check.mjs [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web', 'src');
const verbose = process.argv.includes('--verbose');

// Load dictionaries through tsx so TS syntax is fine.
const require = createRequire(path.join(ROOT, 'server', 'package.json'));
const { tsImport } = await import(pathToFileURL(require.resolve('tsx/esm/api')).href);

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const zh = {}, en = {};
const perFile = {};
for (const f of fs.readdirSync(path.join(WEB, 'i18n')).filter((f) => f.endsWith('.ts'))) {
  const mod = await tsImport(pathToFileURL(path.join(WEB, 'i18n', f)).href, import.meta.url);
  const dict = mod.default?.default ?? mod.default ?? mod;
  const z = flatten(dict.zh ?? dict['zh-CN']), e = flatten(dict.en);
  Object.assign(zh, z); Object.assign(en, e);
  perFile[f] = { zh: z, en: e };
}

const problems = [];
for (const [f, { zh: z, en: e }] of Object.entries(perFile)) {
  for (const k of Object.keys(z)) if (!(k in e) && !(k in en)) problems.push(`missing en: ${k} (${f})`);
  for (const k of Object.keys(e)) if (!(k in z) && !(k in zh)) problems.push(`missing zh: ${k} (${f})`);
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (ent.name !== 'i18n') walk(p, out); }
    else if (/\.(tsx?|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}
const all = new Set([...Object.keys(zh), ...Object.keys(en)]);
const allKeys = [...all];
const literal = /\bt(?:Static)?\(\s*'([a-zA-Z][\w-]*(?:\.[\w-]+)+)'/g;
const tpl = /\bt(?:Static)?\(\s*`([a-zA-Z][\w-]*(?:\.[\w-]+)*\.)\$\{/g;
let used = 0;
for (const file of walk(WEB)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  for (const m of src.matchAll(literal)) {
    used++;
    const k = m[1];
    if (!all.has(k)) problems.push(`unknown key: ${k} (${rel})`);
    else if (!(k in zh)) problems.push(`no zh for: ${k} (${rel})`);
    else if (!(k in en)) problems.push(`no en for: ${k} (${rel})`);
  }
  for (const m of src.matchAll(tpl)) {
    const prefix = m[1];
    if (!allKeys.some((k) => k.startsWith(prefix))) problems.push(`no keys with prefix: ${prefix}* (${rel})`);
  }
}
console.log(`[i18n-check] ${Object.keys(zh).length} zh keys, ${Object.keys(en).length} en keys, ${used} literal uses, ${problems.length} problem(s)`);
for (const p of problems.slice(0, verbose ? 10000 : 200)) console.log('  ' + p);
process.exit(problems.length ? 1 : 0);
