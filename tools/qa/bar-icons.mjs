// Action bar icon check (headless Chrome): a bar cell that holds a skill must always show its icon, in every state the bar can paint.
//
// Part 1 forces each state class the bar sets (ActionBar.ts / ExtraBars.ts `setClass` names, read from the source) on a bound
// skill cell and checks that the cell and its icon are laid out and painted (display, opacity, mask).
// Part 2 fights 3 mobs for FIGHT_S seconds (keys + target), samples every bound cell every 200 ms and checks the same thing.
// Part 3 (Node side) reads the css of the bar and fails when a state class name is also a legacy selector that hides or moves a cell
// (the collision that once hid whole cells during every global cooldown: `.slot-gcd { display: none }` in hud-bottom.css).
//
//   BAR_URL=http://127.0.0.1:5285 MP_PW=<dir with node_modules/playwright-core> node tools/qa/bar-icons.mjs
// Env: BAR_CLASS (knight), BAR_LVL (1), FIGHT_S (25), MP_CHROME (chrome.exe), BAR_SHOT (dir for mid-fight bar shots, optional).
// Exit code 0 = every cell with a skill showed its icon in every sample and state; 1 otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BASE = process.env.BAR_URL ?? 'http://127.0.0.1:5285';
const CLS = process.env.BAR_CLASS ?? 'knight';
const LVL = process.env.BAR_LVL ?? '1';
const FIGHT_S = Number(process.env.FIGHT_S ?? 25);
const CHROME = process.env.MP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PW_DIR = process.env.MP_PW ?? process.env.QA_DIR ?? HERE;
const require = createRequire(path.join(PW_DIR, 'x.js'));
const { chromium } = require('playwright-core');

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log('FAIL ' + msg);
};

// ---- Part 3: state class names must not collide with a legacy selector that hides or moves a cell
const stateNames = new Set();
for (const f of ['src/ui/hud/ActionBar.ts', 'src/ui/hud/ExtraBars.ts']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/setClass\(this\.el, '([a-z0-9-]+)'/g)) stateNames.add(m[1]);
  for (const m of src.matchAll(/ITEM_OFF = \[([^\]]+)\]/g)) for (const n of m[1].matchAll(/'([a-z0-9-]+)'/g)) stateNames.add(n[1]);
}
const cssDir = path.join(ROOT, 'src/ui/styles');
const cssFiles = fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).map((f) => path.join(cssDir, f));
for (const file of cssFiles) {
  const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = rule[1].trim();
    if (!/display\s*:\s*none|position\s*:\s*absolute/.test(rule[2])) continue;
    for (const name of stateNames) {
      const kitScoped = /\.(k|ab|xslot)-|\.k-slot|\.ab-btn|\.xslot/.test(sel);
      if (!kitScoped && new RegExp(`(^|[\\s,>+~])\\.${name}(?![a-z0-9-])`).test(sel)) {
        fail(`class collision: ${path.basename(file)} "${sel.slice(0, 60)}" hides or moves .${name}`);
      }
    }
  }
}
console.log(`css: ${stateNames.size} bar state classes checked against ${cssFiles.length} stylesheets`);

// ---- Parts 1 and 2: the browser
const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => {
  if (!sessionStorage.getItem('__bar_icons')) {
    localStorage.clear();
    sessionStorage.setItem('__bar_icons', '1');
  }
});
await page.goto(`${BASE}/dev/scenes.html?scene=dungeon&dungeon=sisli_koru&class=${CLS}&lvl=${LVL}&seed=7`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.G?.player && window.G.world?.enemies?.length > 0, null, { timeout: 120000 });
await page.waitForTimeout(2500);

const cellState = () =>
  page.evaluate(() => {
    const sb = window.G.character?.save.skillBar ?? {};
    const out = {};
    document.querySelectorAll('.ab-btn[data-slot]').forEach((el) => {
      const art = el.querySelector('.k-art');
      const cs = art ? getComputedStyle(art) : null;
      out[el.dataset.slot] = {
        expect: !!sb[el.dataset.slot] || (el.dataset.slot === 'lmb' && !sb.lmb),
        cls: el.className,
        slotDisplay: getComputedStyle(el).display,
        slotW: el.getBoundingClientRect().width,
        artDisplay: cs?.display ?? 'none',
        artOpacity: cs?.opacity ?? '0',
        mask: cs ? cs.webkitMaskImage || cs.maskImage || '' : '',
        iVar: art ? art.style.getPropertyValue('--i') : '',
      };
    });
    return out;
  });

// a cell that holds a skill must be laid out, painted and not hidden by its own class (potion cells and ghost cells are excluded)
const cellProblems = (s) => {
  const probs = [];
  if (s.cls.includes('is-hidden') || s.cls.includes('is-ghost') || s.cls.includes('is-socket')) probs.push('hidden or socket');
  if (s.slotDisplay === 'none' || s.slotW === 0) probs.push(`cell display ${s.slotDisplay} width ${s.slotW}`);
  if (s.artDisplay === 'none' || s.artOpacity === '0') probs.push(`icon display ${s.artDisplay} opacity ${s.artOpacity}`);
  if (!s.mask || s.mask === 'none' || s.iVar === 'none' || s.iVar === '') probs.push('no icon mask');
  if (s.cls.includes('noskill')) probs.push('noskill');
  return probs;
};

// Part 1: every state class forced on one bound skill cell
const base = await cellState();
const target = Object.keys(base).find((k) => base[k].expect && !['lmb', 'rmb'].includes(k)) ?? 'q';
let forced = 0;
// these classes hide the cell or its icon by design (no skill to show, or a dashed socket)
const HIDES_BY_DESIGN = new Set(['is-hidden', 'is-ghost', 'is-socket', 'noskill']);
for (const st of ['', ...[...stateNames].filter((n) => !HIDES_BY_DESIGN.has(n)).sort()]) {
  const res = await page.evaluate(([slot, st]) => {
    const el = document.querySelector(`.ab-btn[data-slot="${slot}"]`);
    el.className = 'k-slot ab-btn hud-interactive pi-drop' + (st ? ' ' + st : '');
    el.style.setProperty('--p', '0.5');
    const art = el.querySelector('.k-art');
    const cs = getComputedStyle(art);
    return { slotDisplay: getComputedStyle(el).display, slotW: el.getBoundingClientRect().width, artDisplay: cs.display, artOpacity: cs.opacity, mask: cs.webkitMaskImage || cs.maskImage || '', iVar: art.style.getPropertyValue('--i') };
  }, [target, st]);
  forced++;
  const probs = [];
  if (res.slotDisplay === 'none' || res.slotW === 0) probs.push(`cell display ${res.slotDisplay}`);
  if (res.artDisplay === 'none' || res.artOpacity === '0') probs.push(`icon display ${res.artDisplay} opacity ${res.artOpacity}`);
  if (!res.mask || res.mask === 'none') probs.push('no mask');
  if (probs.length) fail(`state "${st || '(none)'}" on ${target}: ${probs.join(', ')}`);
}
console.log(`forced states: ${forced} on the ${target} cell`);

// Part 2: a fight, sampled every 200 ms
await page.evaluate(() => {
  const G = window.G;
  const p = G.player;
  const en = G.world.enemies.filter((e) => !e.isDead && !e.removed).slice(0, 3);
  if (en[0]) {
    p.position.x = en[0].position.x + 2.5;
    p.position.z = en[0].position.z;
    G.events.emit('target:select', { id: en[0].id, attack: true });
  }
});
const pressKeys = ['1', '2', '3', '4', '5', 'q', 'e', 'r'];
const seen = new Set();
let samples = 0;
let shots = 0;
let ki = 0;
const t0 = Date.now();
while (Date.now() - t0 < FIGHT_S * 1000) {
  const s = await cellState();
  samples++;
  for (const [slot, r] of Object.entries(s)) {
    for (const c of r.cls.split(' ')) seen.add(c);
    if (!r.expect) continue;
    const probs = cellProblems(r);
    if (probs.length) fail(`fight sample ${samples} ${slot}: ${probs.join(', ')} (class "${r.cls}")`);
  }
  if (process.env.BAR_SHOT && shots < 3 && seen.has('k-gcd') && samples % 15 === 0) {
    const bb = await page.evaluate(() => {
      const r = document.querySelector('.ab-row.r1').getBoundingClientRect();
      return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 };
    });
    shots++;
    await page.screenshot({ path: path.join(process.env.BAR_SHOT, `mid_${CLS}_${shots}.png`), clip: bb });
  }
  await page.evaluate(() => {
    const G = window.G;
    const p = G.player;
    const e = G.world.enemies.filter((x) => !x.isDead && !x.removed).sort((a, b) => Math.hypot(a.position.x - p.position.x, a.position.z - p.position.z) - Math.hypot(b.position.x - p.position.x, b.position.z - p.position.z))[0];
    if (e && (!p.targetId || (G.world.getActor && !G.world.getActor(p.targetId)))) G.events.emit('target:select', { id: e.id, attack: true });
  });
  if (Math.random() < 0.6) await page.keyboard.press(pressKeys[ki++ % pressKeys.length]);
  await page.waitForTimeout(200);
}
for (const want of ['k-gcd', 'oncd']) if (!seen.has(want)) console.log(`note: state ${want} not seen in ${samples} fight samples`);
console.log(`fight: ${samples} samples over ${FIGHT_S} s`);

await browser.close();
console.log(failures.length === 0 ? 'bar-icons: OK' : `bar-icons: ${failures.length} problem(s)`);
process.exit(failures.length === 0 ? 0 : 1);
