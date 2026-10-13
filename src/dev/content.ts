import { DUNGEONS, DUNGEON_IDS, OPEN_ZONES, OPEN_ZONE_IDS } from '../data/dungeons';
import { TOWN } from '../data/town';
import { TILE_SIZE, type DungeonDef, type PackDef, type PropPlacement, type TownDef } from '../types/dungeons';
import { ENEMIES } from '../data/enemies';
import {
  buildNav, checkDungeon, checkTown, defaultBox, dungeonUrls, loadModels, propFootprint, townUrls,
  type DungeonReport, type Issue, type ModelDb, type TownReport,
} from './contentCheck';

/**
 * dev/content.html: top-down plan of every dungeon + the town, with the content validator.
 * Keys: 1-9 select dungeon / town, N nav overlay, P props, K packs, L lights, 3 = 3D view (needs the world builder).
 */

const T = TILE_SIZE;
/** every plan this page can show: the four dungeons plus the open-world zones. */
const ALL: Record<string, DungeonDef> = { ...DUNGEONS, ...OPEN_ZONES };
const ALL_IDS: string[] = [...DUNGEON_IDS, ...OPEN_ZONE_IDS];
const root = document.getElementById('app')!;
const q = new URLSearchParams(location.search);
// other modules are edited constantly while this page is open: do not let Vite full-reload it (add ?hmr=1 to allow)
if (import.meta.hot && q.get('hmr') !== '1') {
  import.meta.hot.on('vite:beforeFullReload', () => { throw new Error('[content] full reload suppressed (use ?hmr=1)'); });
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, css = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
};

const FLOOR_COL: Record<string, string> = {
  stone: '#3b3d3a', stone_dark: '#2a2c2c', wood: '#4a3622', dirt: '#3b2f22', tiles: '#35383d', lava_rock: '#3a2420', ice: '#3c5266', temple: '#322a46',
};
const gateCol: Record<string, string> = { none: '#5fe08a', open: '#9fffbf', boss_lock: '#ff4040', boss_exit: '#ff9a30', forces_lock: '#c060ff' };
const forcesCol = (f: number): string => (f >= 18 ? '#ff3030' : f >= 14 ? '#ff8a30' : f >= 9 ? '#ffd040' : '#7fe05a');

const state = {
  view: 'kemik_mahzeni' as string,
  nav: false, props: true, packs: true, lights: false, labels: true,
};
let models: ModelDb = new Map();
const reports = new Map<string, DungeonReport>();
let townReport: TownReport | null = null;

// ---------------------------------------------------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------------------------------------------------
document.body.style.cssText = 'margin:0;background:#101012;color:#e8dcc0;font:12px/1.35 Consolas,monospace;overflow:auto';
const bar = el('div', 'position:sticky;top:0;z-index:5;background:#17171c;border-bottom:1px solid #444;padding:6px 8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center');
const body = el('div', 'display:flex;gap:10px;padding:8px;align-items:flex-start');
const plan = el('canvas');
plan.id = 'plan';
plan.style.cssText = 'background:#08080a;border:1px solid #333;image-rendering:pixelated;cursor:crosshair';
const side = el('div', 'flex:1;min-width:360px;max-width:640px;white-space:pre-wrap;overflow:auto;max-height:calc(100vh - 60px)');
const tip = el('div', 'position:fixed;pointer-events:none;background:rgba(0,0,0,.85);border:1px solid #665;padding:4px 6px;display:none;z-index:9;max-width:360px;white-space:pre');
body.append(plan, side);
root.append(bar, body, tip);

const btn = (label: string, on: () => void, id?: string): HTMLButtonElement => {
  const b = el('button', 'background:#2a2a32;color:#e8dcc0;border:1px solid #666;padding:3px 8px;cursor:pointer;font:inherit', label);
  if (id) b.id = id;
  b.onclick = on;
  bar.append(b);
  return b;
};
const tabs = new Map<string, HTMLButtonElement>();
const makeTabs = (): void => {
  for (const id of [...ALL_IDS, 'town']) {
    const b = btn(id === 'town' ? 'Kuzgunkale' : ALL[id]?.shortName ?? id, () => select(id), `tab_${id}`);
    tabs.set(id, b);
  }
  const sp = el('span', 'width:16px');
  bar.append(sp);
  const tog = (label: string, key: 'nav' | 'props' | 'packs' | 'lights' | 'labels'): void => {
    const b = btn(label, () => { state[key] = !state[key]; b.style.opacity = state[key] ? '1' : '.45'; redraw(); });
    b.style.opacity = state[key] ? '1' : '.45';
  };
  tog('nav', 'nav'); tog('props', 'props'); tog('packs', 'packs'); tog('lights', 'lights'); tog('labels', 'labels');
  btn('3D', () => void open3D(), 'btn3d');
  btn('yeniden doğrula', () => void runAll(true), 'btnrun');
};

// ---------------------------------------------------------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------------------------------------------------------
let S = 18; // px per tile
const px = (v: number): number => v * S;

function drawDungeon(def: DungeonDef): void {
  const W = def.grid.w, H = def.grid.h;
  S = Math.max(12, Math.min(22, Math.floor((innerHeight - 70) / H)));
  plan.width = W * S; plan.height = H * S;
  const c = plan.getContext('2d')!;
  c.fillStyle = '#08080a'; c.fillRect(0, 0, plan.width, plan.height);
  // grid
  c.strokeStyle = '#15151a'; c.lineWidth = 1;
  for (let i = 0; i <= W; i++) { c.beginPath(); c.moveTo(i * S, 0); c.lineTo(i * S, H * S); c.stroke(); }
  for (let j = 0; j <= H; j++) { c.beginPath(); c.moveTo(0, j * S); c.lineTo(W * S, j * S); c.stroke(); }
  // rooms
  for (const r of def.rooms) {
    c.fillStyle = FLOOR_COL[r.floor ?? 'stone'] ?? '#333';
    c.fillRect(px(r.rect.x), px(r.rect.z), px(r.rect.w), px(r.rect.h));
    c.strokeStyle = r.boss ? '#ff5040' : r.optional ? '#a090ff' : r.skip ? '#60c0ff' : '#8a8a90';
    c.lineWidth = r.boss ? 2 : 1;
    c.strokeRect(px(r.rect.x) + 0.5, px(r.rect.z) + 0.5, px(r.rect.w) - 1, px(r.rect.h) - 1);
  }
  const rep = reports.get(def.id);
  if (state.nav && rep) {
    const n = rep.nav;
    const img = c.createImageData(plan.width, plan.height);
    for (let j = 0; j < n.h; j++) for (let i = 0; i < n.w; i++) {
      const idx = j * n.w + i;
      const blockedInRoom = !n.walk[idx];
      const unreachable = n.walk[idx] && !n.reach[idx];
      if (!blockedInRoom && !unreachable) continue;
      // only colour inside rooms
      const inRoom = def.rooms.some((r) => i + 0.5 > r.rect.x * T && i + 0.5 < (r.rect.x + r.rect.w) * T && j + 0.5 > r.rect.z * T && j + 0.5 < (r.rect.z + r.rect.h) * T);
      if (!inRoom) continue;
      const x0 = Math.floor((i / T) * S), x1 = Math.floor(((i + 1) / T) * S), y0 = Math.floor((j / T) * S), y1 = Math.floor(((j + 1) / T) * S);
      for (let yy = y0; yy < Math.max(y1, y0 + 1); yy++) for (let xx = x0; xx < Math.max(x1, x0 + 1); xx++) {
        const o = (yy * plan.width + xx) * 4;
        img.data[o] = unreachable ? 255 : 255; img.data[o + 1] = unreachable ? 220 : 40; img.data[o + 2] = 40; img.data[o + 3] = unreachable ? 200 : 110;
      }
    }
    const off = document.createElement('canvas'); off.width = plan.width; off.height = plan.height;
    off.getContext('2d')!.putImageData(img, 0, 0);
    c.drawImage(off, 0, 0);
  }
  // zones
  for (const r of def.rooms) for (const z of r.zones ?? []) {
    c.save();
    c.globalAlpha = 0.55;
    c.fillStyle = z.kind === 'lava' ? '#ff5a10' : z.kind === 'pit' || z.kind === 'void' ? '#000' : z.kind === 'rune' ? '#40ffd0' : z.kind === 'ice' ? '#a0e0ff' : z.kind === 'bridge' ? '#8a6a40' : '#c0a0ff';
    c.strokeStyle = z.glow ? '#' + z.glow.toString(16).padStart(6, '0') : '#fff';
    c.lineWidth = 1.5;
    if (z.shape === 'circle') { c.beginPath(); c.ellipse(px(z.rect.x + z.rect.w / 2), px(z.rect.z + z.rect.h / 2), px(z.rect.w / 2), px(z.rect.h / 2), 0, 0, 7); c.fill(); c.globalAlpha = 1; c.stroke(); }
    else { c.fillRect(px(z.rect.x), px(z.rect.z), px(z.rect.w), px(z.rect.h)); c.globalAlpha = 1; c.strokeRect(px(z.rect.x), px(z.rect.z), px(z.rect.w), px(z.rect.h)); }
    c.restore();
  }
  // doors
  for (const d of def.doors) {
    const [tx, tz] = d.tile;
    const w = d.width ?? 1;
    c.strokeStyle = gateCol[d.gate ?? 'none']; c.lineWidth = 4;
    c.beginPath();
    if (d.side === 'n') { c.moveTo(px(tx) + 2, px(tz)); c.lineTo(px(tx + w) - 2, px(tz)); }
    else if (d.side === 's') { c.moveTo(px(tx) + 2, px(tz + 1)); c.lineTo(px(tx + w) - 2, px(tz + 1)); }
    else if (d.side === 'w') { c.moveTo(px(tx), px(tz) + 2); c.lineTo(px(tx), px(tz + w) - 2); }
    else { c.moveTo(px(tx + 1), px(tz) + 2); c.lineTo(px(tx + 1), px(tz + w) - 2); }
    c.stroke();
  }
  // props
  if (state.props) {
    for (const r of def.rooms) for (const p of r.props ?? []) drawProp(c, p);
  }
  // lights
  if (state.lights) {
    for (const r of def.rooms) for (const p of r.props ?? []) {
      if (!p.light) continue;
      c.strokeStyle = '#' + p.light.color.toString(16).padStart(6, '0'); c.globalAlpha = 0.35; c.lineWidth = 1;
      c.beginPath(); c.arc(px(p.pos[0] + 0.5), px(p.pos[1] + 0.5), (p.light.distance / T) * S, 0, 7); c.stroke(); c.globalAlpha = 1;
    }
  }
  // packs
  if (state.packs) for (const pk of def.packs) drawPack(c, pk);
  // bosses, start, exit, extras
  const label = (x: number, z: number, text: string, col: string, r = 6): void => {
    c.fillStyle = col; c.beginPath(); c.arc(px(x), px(z), r, 0, 7); c.fill();
    c.fillStyle = '#000'; c.font = `bold ${Math.max(8, r + 1)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, px(x), px(z) + 0.5);
  };
  def.bosses.forEach((b) => { c.strokeStyle = '#ff3030'; c.lineWidth = 1; c.beginPath(); c.arc(px(b.pos[0] + 0.5), px(b.pos[1] + 0.5), 12 / 4 * S / 2, 0, 7); c.stroke(); label(b.pos[0] + 0.5, b.pos[1] + 0.5, `B${b.order}`, '#ff4040', 9); });
  label(def.start.pos[0] + 0.5, def.start.pos[1] + 0.5, 'S', '#40ff80', 7);
  label(def.exit.pos[0] + 0.5, def.exit.pos[1] + 0.5, 'EX', '#60a0ff', 8);
  if (def.extras) {
    label(def.extras.fontOfPower[0] + 0.5, def.extras.fontOfPower[1] + 0.5, 'KT', '#d080ff', 7);
    for (const s of def.extras.shrines) label(s.pos[0] + 0.5, s.pos[1] + 0.5, 'SN', '#ffe060', 7);
    for (const s of def.extras.riftSpots) { c.fillStyle = '#c070ff'; c.fillRect(px(s[0] + 0.5) - 2, px(s[1] + 0.5) - 2, 4, 4); }
    for (const ch of def.extras.chests ?? []) label(ch.pos[0] + 0.5, ch.pos[1] + 0.5, 'C', '#ffc040', 5);
  }
  if (state.labels) {
    c.fillStyle = '#d8d0b8'; c.font = '10px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    for (const r of def.rooms) c.fillText(r.name ?? r.id, px(r.rect.x) + 3, px(r.rect.z) + 2);
  }
}

function drawProp(c: CanvasRenderingContext2D, p: PropPlacement): void {
  const info = models.get(p.model);
  if (p.collide) {
    const f = propFootprint(p, info?.box ?? defaultBox);
    c.save();
    c.translate(px(f.cx / T), px(f.cz / T));
    c.rotate(-f.rot);
    c.strokeStyle = '#5aa0ff'; c.fillStyle = 'rgba(90,160,255,.22)'; c.lineWidth = 1;
    c.fillRect((-f.hx / T) * S, (-f.hz / T) * S, ((f.hx * 2) / T) * S, ((f.hz * 2) / T) * S);
    c.strokeRect((-f.hx / T) * S, (-f.hz / T) * S, ((f.hx * 2) / T) * S, ((f.hz * 2) / T) * S);
    c.restore();
  } else {
    const wall = (p.y ?? 0) > 1.2;
    c.fillStyle = p.light ? '#ffdd77' : wall ? '#b0a090' : '#8c8c8c';
    c.fillRect(px(p.pos[0] + 0.5) - 1, px(p.pos[1] + 0.5) - 1, 2.5, 2.5);
  }
}

function drawPack(c: CanvasRenderingContext2D, pk: PackDef): void {
  const f = pk.forces ?? 0;
  const col = forcesCol(f);
  if (pk.patrol) {
    c.strokeStyle = '#ffffff'; c.setLineDash([4, 3]); c.lineWidth = 1;
    c.beginPath(); pk.patrol.forEach((w, i) => (i ? c.lineTo(px(w[0] + 0.5), px(w[1] + 0.5)) : c.moveTo(px(w[0] + 0.5), px(w[1] + 0.5)))); c.stroke(); c.setLineDash([]);
  }
  for (const m of pk.members) {
    c.fillStyle = col; c.strokeStyle = pk.optional ? '#a090ff' : '#000'; c.lineWidth = 1;
    c.beginPath(); c.arc(px(pk.center[0] + m.offset[0] + 0.5), px(pk.center[1] + m.offset[1] + 0.5), Math.max(2, S * 0.17), 0, 7); c.fill(); c.stroke();
  }
  if (state.labels) {
    c.fillStyle = '#fff'; c.font = '9px monospace'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(`${pk.id.split('_')[1]}·${f}`, px(pk.center[0] + 0.5), px(pk.center[1] + 0.5) - Math.max(4, S * 0.3));
  }
}

function drawTown(t: TownDef): void {
  const half = t.size[0] / 2;
  const s = Math.max(4, Math.floor((innerHeight - 70) / (t.size[1] + 50)));
  S = s;
  const pad = 30;
  plan.width = (t.size[0] + pad * 2) * s; plan.height = (t.size[1] + pad * 2 + 20) * s;
  const c = plan.getContext('2d')!;
  c.fillStyle = '#10130c'; c.fillRect(0, 0, plan.width, plan.height);
  const X = (x: number): number => (x + half + pad) * s, Z = (z: number): number => (z + half + pad + 20) * s;
  c.fillStyle = '#2a3320'; c.fillRect(X(-half), Z(-half), t.size[0] * s, t.size[1] * s);
  c.strokeStyle = '#555'; c.strokeRect(X(-half), Z(-half), t.size[0] * s, t.size[1] * s);
  for (const z of t.zones ?? []) {
    c.strokeStyle = '#6a7a50'; c.setLineDash([3, 3]); c.strokeRect(X(z.box[0]), Z(z.box[1]), (z.box[2] - z.box[0]) * s, (z.box[3] - z.box[1]) * s); c.setLineDash([]);
    c.fillStyle = '#8a9a70'; c.font = '10px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(z.name, X(z.box[0]) + 3, Z(z.box[1]) + 2);
  }
  for (const ter of t.terraces ?? []) { c.fillStyle = 'rgba(200,180,120,.18)'; c.fillRect(X(ter.box[0]), Z(ter.box[1]), (ter.box[2] - ter.box[0]) * s, (ter.box[3] - ter.box[1]) * s); }
  for (const e of t.exits ?? []) { c.strokeStyle = '#ffd040'; c.strokeRect(X(e.box[0]), Z(e.box[1]), (e.box[2] - e.box[0]) * s, (e.box[3] - e.box[1]) * s); }
  for (const p of t.props) {
    const info = models.get(p.model);
    const sc = p.scale ?? 1;
    const bx = p.box ?? (info?.box ? [(info.box.max[0] - info.box.min[0]) * sc, (info.box.max[2] - info.box.min[2]) * sc] : [(p.radius ?? 0.5) * 2, (p.radius ?? 0.5) * 2]);
    const isBuilding = p.model.includes('/buildings/');
    c.save();
    c.translate(X(p.pos[0]), Z(p.pos[2]));
    c.rotate(-((p.rot ?? 0) * Math.PI) / 180);
    c.fillStyle = isBuilding ? 'rgba(190,120,90,.55)' : p.collide ? 'rgba(90,160,255,.4)' : p.light ? '#ffdd77' : '#7a8a6a';
    const w = Math.max(1.5, bx[0] * s), h = Math.max(1.5, bx[1] * s);
    c.fillRect(-w / 2, -h / 2, w, h);
    if (p.light) { c.strokeStyle = 'rgba(255,200,100,.5)'; c.beginPath(); c.arc(0, 0, 3, 0, 7); c.stroke(); }
    c.restore();
  }
  const roleCol: Record<string, string> = { blacksmith: '#ff9a50', merchant: '#ffd040', alchemist: '#50ff90', stash: '#c0a060', keystone: '#d080ff', trainer: '#a0a0a0', bounty: '#ff7070', lobby: '#60a0ff', guard: '#8090b0', citizen: '#70a070', portal: '#ff60ff' };
  for (const n of t.npcs) {
    c.fillStyle = roleCol[n.role] ?? '#fff';
    c.beginPath(); c.arc(X(n.pos[0]), Z(n.pos[2]), Math.max(2.5, s * 0.5), 0, 7); c.fill();
    if (state.labels && n.role !== 'citizen' && n.role !== 'guard') { c.fillStyle = '#fff'; c.font = '9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillText(n.name, X(n.pos[0]), Z(n.pos[2]) - 3); }
  }
  c.fillStyle = '#40ff80'; c.beginPath(); c.arc(X(t.spawn.pos[0]), Z(t.spawn.pos[2]), 5, 0, 7); c.fill();
  if (t.arrival) { c.fillStyle = '#60a0ff'; c.beginPath(); c.arc(X(t.arrival.pos[0]), Z(t.arrival.pos[2]), 5, 0, 7); c.fill(); }
}

function redraw(): void {
  for (const [id, b] of tabs) b.style.outline = id === state.view ? '2px solid #ffd040' : 'none';
  if (state.view === 'town') drawTown(TOWN);
  else drawDungeon(ALL[state.view]);
  renderSide();
}

// ---------------------------------------------------------------------------------------------------------------------
// report panel
// ---------------------------------------------------------------------------------------------------------------------
const lvlCol: Record<Issue['level'], string> = { error: '#ff6060', warn: '#ffc040', info: '#90b0d0' };
function listIssues(issues: Issue[]): HTMLElement {
  const box = el('div');
  const order: Issue['level'][] = ['error', 'warn', 'info'];
  for (const lv of order) {
    const items = issues.filter((i) => i.level === lv);
    if (!items.length) continue;
    box.append(el('div', `color:${lvlCol[lv]};font-weight:bold;margin-top:6px`, `${lv.toUpperCase()} (${items.length})`));
    for (const it of items.slice(0, 60)) box.append(el('div', `color:${lvlCol[lv]};padding-left:8px`, `${it.where}: ${it.msg}`));
    if (items.length > 60) box.append(el('div', 'padding-left:8px;color:#888', `... ${items.length - 60} more`));
  }
  return box;
}

function renderSide(): void {
  side.replaceChildren();
  if (state.view === 'town') {
    side.append(el('div', 'font-size:14px;font-weight:bold', `${TOWN.name} (${TOWN.id})`));
    if (townReport) {
      side.append(el('div', '', `props ${townReport.stats.props}  npcs ${townReport.stats.npcs}  lights ${townReport.stats.lights}  models ${townReport.stats.models}`));
      side.append(listIssues(townReport.issues));
    }
    return;
  }
  const def = ALL[state.view];
  const rep = reports.get(def.id);
  side.append(el('div', 'font-size:14px;font-weight:bold', `${def.name} (${def.id})  lv ${def.levelRange.join('-')}  ${def.timerSec}s  forces ${def.forcesRequired}`));
  if (!rep) { side.append(el('div', '', 'doğrulanıyor…')); return; }
  const s = rep.stats;
  const errs = rep.issues.filter((i) => i.level === 'error').length;
  side.append(el('div', `color:${errs ? '#ff6060' : '#60ff90'};font-weight:bold`, errs ? `${errs} HATA` : 'TEMİZ (0 hata)'));
  side.append(el('div', '', `odalar ${s.rooms}  kapı ${s.doors}  paket ${s.packs}  düşman ${s.enemies}  boss ${s.bosses}\nprop ${s.props} (çarpışan ${s.collide}, ışık ${s.lights})  model ${s.models}\nforces ${s.forcesAll}/${s.forcesRequired} = ${(s.ratio * 100).toFixed(1)}%  (opsiyonel hariç ${s.forcesNonOptional} = ${((s.forcesNonOptional / s.forcesRequired) * 100).toFixed(1)}%)`));
  const tbl = el('div', 'margin-top:6px;color:#aaa');
  tbl.textContent = def.rooms.map((r) => `${r.id.padEnd(20)} props ${String(s.perRoom[r.id].props).padStart(3)}  forces ${String(s.perRoom[r.id].forces).padStart(3)}`).join('\n');
  side.append(tbl);
  side.append(listIssues(rep.issues));
}

// hover
plan.addEventListener('mousemove', (e) => {
  const r = plan.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  let text = '';
  if (state.view !== 'town') {
    const def = ALL[state.view];
    const tx = mx / S, tz = my / S;
    const room = def.rooms.find((rm) => tx >= rm.rect.x && tx < rm.rect.x + rm.rect.w && tz >= rm.rect.z && tz < rm.rect.z + rm.rect.h);
    text = `(${tx.toFixed(2)}, ${tz.toFixed(2)})  GDD ${(tx - 0.5).toFixed(2)}, ${(tz - 0.5).toFixed(2)} (everything but rects/doors/zones: GDD coords)${room ? `\n${room.name} [${room.id}]` : ''}`;
    for (const pk of def.packs) {
      if (pk.members.some((m) => Math.hypot(pk.center[0] + m.offset[0] + 0.5 - tx, pk.center[1] + m.offset[1] + 0.5 - tz) < 0.6)) {
        const names = new Map<string, number>();
        pk.members.forEach((m) => names.set(m.enemyId, (names.get(m.enemyId) ?? 0) + 1));
        text += `\n${pk.id}  forces ${pk.forces}${pk.optional ? ' (opt)' : ''}${pk.dormant ? ' dormant' : ''}\n` + [...names].map(([k, v]) => `${v}x ${k}`).join(', ');
        break;
      }
    }
    for (const rm of def.rooms) for (const p of rm.props ?? []) {
      if (Math.hypot(p.pos[0] + 0.5 - tx, p.pos[1] + 0.5 - tz) < 0.3) { text += `\n${p.model.split('/').slice(-2).join('/')}${p.collide ? ' [collide]' : ''}${p.light ? ' [light]' : ''}${p.tag ? ` <${p.tag}>` : ''}`; break; }
    }
  } else {
    const half = TOWN.size[0] / 2;
    const wx = mx / S - half - 30, wz = my / S - half - 50;
    text = `(${wx.toFixed(1)}, ${wz.toFixed(1)})`;
    for (const n of TOWN.npcs) if (Math.hypot(n.pos[0] - wx, n.pos[2] - wz) < 2) { text += `\n${n.name} [${n.role}] ${n.id}`; break; }
  }
  tip.textContent = text;
  tip.style.display = text ? 'block' : 'none';
  tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 14}px`;
});
plan.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

function select(id: string): void {
  state.view = id;
  redraw();
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const ids = [...ALL_IDS, 'town'];
  const n = Number(e.key);
  if (n >= 1 && n <= ids.length) select(ids[n - 1]);
  if (e.key === 'n') { state.nav = !state.nav; redraw(); }
  if (e.key === 'p') { state.props = !state.props; redraw(); }
  if (e.key === 'k') { state.packs = !state.packs; redraw(); }
  if (e.key === 'l') { state.lights = !state.lights; redraw(); }
  if (e.key === '3') void open3D();
});

// ---------------------------------------------------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------------------------------------------------
const knownEnemy = (id: string): number | undefined => (ENEMIES[id] ? ENEMIES[id].forces : undefined);

async function runAll(force = false): Promise<void> {
  if (force) { models = new Map(); reports.clear(); townReport = null; }
  const urls = new Set<string>();
  for (const id of ALL_IDS) for (const u of dungeonUrls(ALL[id])) urls.add(u);
  for (const u of townUrls(TOWN)) urls.add(u);
  const status = el('div', 'color:#aaa', '');
  bar.append(status);
  await loadModels(urls, models, (d, t) => { status.textContent = `modeller ${d}/${t}`; });
  status.remove();
  for (const id of ALL_IDS) reports.set(id, checkDungeon(ALL[id], models, knownEnemy));
  townReport = checkTown(TOWN, models, DUNGEON_IDS);
  // console summary for automated reading
  const summary = ALL_IDS.map((id) => {
    const r = reports.get(id)!;
    return { id, errors: r.issues.filter((i) => i.level === 'error').length, warns: r.issues.filter((i) => i.level === 'warn').length, ...r.stats, perRoom: undefined };
  });
  (window as unknown as Record<string, unknown>).__content = { summary, reports, townReport, models };
  console.log('[content] validation', JSON.stringify(summary), 'town errors', townReport.issues.filter((i) => i.level === 'error').length);
  redraw();
}

// ---------------------------------------------------------------------------------------------------------------------
// 3D view (needs the world module)
// ---------------------------------------------------------------------------------------------------------------------
let threeBooted: Awaited<ReturnType<(typeof import('./worldBoot'))['bootWorldDev']>> | null = null;
let built: { dispose(): void; update(dt: number): void; start: { x: number; z: number } } | null = null;

async function open3D(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const rootEl = document.getElementById('game-root') as HTMLElement;
  rootEl.style.display = 'block';
  document.getElementById('app')!.style.display = 'none';
  const hud = document.getElementById('hud3d')!;
  hud.style.display = 'block';
  hud.textContent = '3D hazırlanıyor…';
  try {
    const { bootWorldDev } = await import('./worldBoot');
    const { buildDungeon } = await import('../world/DungeonBuilder');
    const { buildTown } = await import('../world/TownBuilder');
    const THREE = await import('three');
    if (!threeBooted) threeBooted = await bootWorldDev();
    const h = threeBooted;
    for (const c of [...h.scene.children]) if ((c as { isLight?: boolean }).isLight) h.scene.remove(c);
    built?.dispose(); built = null;
    const t0 = performance.now();
    let startPos = new THREE.Vector3();
    if (state.view === 'town') {
      const b = await buildTown(TOWN, h.scene);
      built = b as never; startPos = b.spawn.clone();
      h.world.nav = b.nav;
    } else {
      const b = await buildDungeon(ALL[state.view], h.scene);
      built = b as never; startPos = b.start.clone();
      h.world.nav = b.nav;
    }
    hud.textContent = `${state.view} 3D ${(performance.now() - t0).toFixed(0)} ms   [Esc] plan   [WASD] gez   [R] sonraki oda`;
    const goto = (x: number, z: number, dist = 22, height = 26, yaw = 0): void => {
      h.orbit.target.set(x, 0, z);
      h.camera.position.set(x + Math.sin(yaw) * dist, height, z + Math.cos(yaw) * dist);
      h.orbit.update();
    };
    const cam = q.get('cam');
    if (cam) { const [x, z, d, hh, yw] = cam.split(',').map(Number); goto(x, z, d || 22, hh || 26, yw || 0); }
    else goto(startPos.x, startPos.z - 6);
    h.camera.far = 600; h.camera.updateProjectionMatrix();
    const w = window as unknown as Record<string, unknown>;
    w.__goto = goto;
    w.__built = built;
    w.__roomCam = (roomId: string, dist = 24, height = 28, yaw = 0): void => {
      if (state.view === 'town') return;
      const r = ALL[state.view].rooms.find((rm) => rm.id === roomId);
      if (r) goto((r.rect.x + r.rect.w / 2) * T, (r.rect.z + r.rect.h / 2) * T, dist, height, yaw);
    };
    let ri = 0;
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { rootEl.style.display = 'none'; document.getElementById('app')!.style.display = 'block'; hud.style.display = 'none'; }
      if (e.code === 'KeyR' && state.view !== 'town') {
        const rooms = ALL[state.view].rooms;
        ri = (ri + 1) % rooms.length;
        (w.__roomCam as (id: string) => void)(rooms[ri].id);
        hud.textContent = `${rooms[ri].name} (${rooms[ri].id})`;
      }
    });
    h.onFrame((dt) => built?.update(dt));
    // debug lighting boost (the real game has the player's light + brighter post): ?light=hemi,ambient,moon or key B
    const lighting = (built as unknown as { lighting?: { hemi: { intensity: number }; ambient: { intensity: number }; moon: { intensity: number } } }).lighting;
    const base = lighting ? [lighting.hemi.intensity, lighting.ambient.intensity, lighting.moon.intensity] : [1, 1, 1];
    const boost = (k: number): void => { if (lighting) { lighting.hemi.intensity = base[0] * k; lighting.ambient.intensity = base[1] * k; lighting.moon.intensity = base[2] * k; } };
    w.__boost = boost;
    const lq = q.get('light');
    if (lq) boost(Number(lq));
    let bi = 0;
    addEventListener('keydown', (e) => { if (e.code === 'KeyB') { bi = (bi + 1) % 4; boost([1, 2.5, 4, 7][bi]); } });
    void canvas;
  } catch (e) {
    hud.textContent = `3D başarısız: ${(e as Error).message}`;
    console.error('[content] 3D failed', e);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
makeTabs();
state.view = q.get('view') ?? (DUNGEON_IDS[0] ?? 'town');
redraw();
void runAll().then(() => { if (q.get('mode') === '3d') void open3D(); });
