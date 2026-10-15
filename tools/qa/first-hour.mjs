// "New player first hour" playtest through the REAL entry (index.html -> main menu -> Yeni Karakter -> Oluştur -> Oyna), then the
// quest chain FOLLOWED FROM GAME DATA. No quest id, NPC id, camp or zone is written in this file: the chain changes in
// src/data/world/*.ts do not break it.
//
// Loop (one step per pass, until the level target or the wall-clock budget):
//   1. the game's own guide picks the quest: guideEngine.recommend(G.character).quest (ready > pinned / lowest-level active >
//      available main within 2 levels > side quest of the zone). Its state decides the step:
//        available -> accept it at def.giver (F, "Görevi Kabul Et")
//        ready     -> turn it in at def.turnIn ?? def.giver (F, "Teslim Et" or the reward choice)
//        active    -> play the first open objective of def.objectives by its kind (stepObjective)
//   2. positions: the streamed NPC entity, else guideEngine.giverPosition (town or world data); places / regions: questMarks
//      placeWorldPos / regionCentre, else guideEngine.questFocusPos. Walking uses the game's navgrid (G.world.nav.findPath) for
//      waypoints only and the keys do the moving. Stuck -> dev teleport `G.player.position.set` (counted as TELEPORT, reported).
//   3. objective kinds: talk (F on the NPC), explore (walk to the place), kill / boss / metin / elite (fight the target ids),
//      drop / collect (fight the source ids, pick up the loot), skill (fight and interrupt the target's casts with the bar's
//      interrupt skill; none on the bar = BLOCKER), interact / use (QuestProp: F; use needs the item), escort (EscortNpc: F to start,
//      then follow it, fighting what attacks it). dungeon has no handler: HARD blocker.
//   4. a MAIN-chain quest whose open objective does not change for 4 steps is a HARD blocker (the chain is stuck) and ends the journey.
//   5. a SIDE quest is dropped instead, checked first: two watchdog fires on it (any state) or 4 steps without progress or an
//      unsupported / stuck step drops it (QuestSystem.abandon for active / ready, never taken again; the chain goes on): a BLOCKER, never HARD.
//
// Keys come from the game: src/core/Input.ts SCHEME_BINDINGS.wow (scheme 'wow' = the default) over DEFAULT_BINDINGS; the skill
// slots from G.character.save.skillBar; the interrupt skill is the bar skill whose SKILLS[id].behavior === 'interrupt'.
// Level-ups are timed from the moment the character enters the world (real elapsed minutes = the game runs in real time; walking,
// fights and teleports are included). Screenshots: each level-up (levelup_L<n>), the world arrival (world_arrive), reward choices.
//
// Run (dev server of THIS checkout must be up; vite.config.ts ignores **/.claude/** in its watcher, so restart it after editing src/):
//   npx vite --port 5197 --strictPort
//   FH_URL=http://localhost:5197 MP_PW=<dir with node_modules/playwright-core> node tools/qa/first-hour.mjs
// Env: FH_URL (default http://127.0.0.1:5182), MP_PW / QA_DIR (playwright-core dir, default ./tools/qa), MP_CHROME (chrome.exe),
//      FH_CLASSES=knight,mage,paladin (ids of src/net/messages.ts CLASS_IDS or WoW aliases, see classes.mjs), FH_VIEW=1280x720,
//      FH_HEADED=1 (watch it), FH_TO_LEVEL=5 (chain ends at this level), FH_MAX_MIN=45 (wall-clock budget per class, minutes).
// Output: screenshots in tools/qa/out/fh_<class>_<nn>_<label>.png (gitignored), tools/qa/out/fh_<class>.json (machine-readable run
// summary: levels, quests, deaths, teleports), then a SUMMARY with BLOCKERS and UX notes.
// Exit code 0 = every check passed for every class and no HARD blocker was recorded. Plain BLOCKER lines and UX notes are informational.
// Player behaviour: below 50% HP the bar's heal / absorb / defensive skills (skills.ts tags) are cast; below 35% the health potion; before a
// pull below 60% HP the character stands still until 80% (out-of-combat regen). Targets: one camp at a time (the camp being fought first),
// then the nearest mob within level lvl-3..lvl. Objective fights 1 and 5 of each class get a screenshot ~3 s in (combat_f<n>); every fight is logged
// in tools/qa/out/fh_<class>.json (fights: ttk, hpLeft); the end prints one CLASS line per class (deaths, kills, median TTK / HP left, L2-L4).
// Fight back (every path: a fight, a walk, the wait at a camp, the rest, an escort): an enemy in reach (its attack range + 4 m) that dealt
// damage to the character in the last 3 s (the game's 'damage' events, see fight-back.mjs) is fought first, nearest first. It is selected
// through the game's target:select (what a click emits; Tab cycles only the enemies inside the camera frustum, so it cannot reach an
// off-screen attacker), then turned to face. It is kept while it keeps dealing damage; the fight-back ends when it dies, when it has dealt
// no damage for 3 s, or after 20 s (it is not picked again for 20 s). The objective or the walk resumes.
// Rest and routes: after a death (released at the graveyard with half HP) the character rests there to 90% before the walk back. Walks
// route round the camps of another level band (navRoute: a ring or road point round the camp); a walk's time budget is its route length at
// 2 m/s (or the step's timeout when longer). A camp for a kill is taken from the character's level band first.
// Environment note: when node_modules is a junction to another checkout, Vite answers 403 for the @fontsource files; that is noise.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveClassList } from './classes.mjs';
import { installHitTracker, hitterSnapshot, recentHitters, pickAttackers, FIGHT_BACK_CAP_MS } from './fight-back.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.FH_URL ?? 'http://127.0.0.1:5182';
const PW_DIR = process.env.MP_PW ?? process.env.QA_DIR ?? HERE;
const CHROME = process.env.MP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CLASSES = resolveClassList(process.env.FH_CLASSES ?? 'knight,mage,paladin');
const TO_LEVEL = Number(process.env.FH_TO_LEVEL ?? 5);
const MAX_MIN = Number(process.env.FH_MAX_MIN ?? 45);
const [VW, VH] = (process.env.FH_VIEW ?? '1280x720').split('x').map(Number);

const req = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'));
const pwMod = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = pwMod.chromium ?? pwMod.default.chromium;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** character name for a class: the name validator accepts letters, digits and spaces (classInfo.ts NAME_RE), max 20 chars */
const charName = (cls) => `FH ${cls}`.slice(0, 20);
/** console noise that is not a game bug: blocked fonts (junction node_modules), relay sockets of the P2P layer, favicon, 403 of @fs. */
const NOISE = /WebSocket|nostr|satellite|ERR_|favicon|net::|Failed to load resource|@fontsource|A network error occurred/i;
/**
 * Page side, passed to page.evaluate (self-contained). The game's navgrid route from the character to a point:
 * a = { to: [x, z], zones: [{ id, x, z, r }], detour }. With detour, a route that crosses a zone (a camp of another level band) is re-planned
 * through a point round that camp: one of 12 ring points at r + 12 m, or one of the 8 road points nearest to the camp outside every zone.
 * Returns null when unreachable, else { pts: [[x, z], ...] (waypoints after the start), len (m), detour (a re-plan was used),
 * zone (id of a zone still crossed, else null) }.
 */
const navRoute = async (a) => {
  const G = window.G;
  const nav = G.world.nav;
  const ts = (await import('/src/types/dungeons.ts')).TILE_SIZE;
  const roads = (await import('/src/ui/hud/questMarks.ts')).worldExtras()?.roads ?? [];
  const pl = G.player.position;
  const start = [pl.x, pl.z];
  const dd = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  // a zone the character stands in or the target stands in is not avoided (leaving it, or going to it)
  const zones = (a.zones ?? []).filter((z) => dd(start[0], start[1], z.x, z.z) >= z.r && dd(a.to[0], a.to[1], z.x, z.z) >= z.r);
  const inZone = (x, z) => zones.find((zn) => dd(x, z, zn.x, zn.z) < zn.r) ?? null;
  const fp = (from, to) => {
    const pts = nav.findPath({ x: from[0], z: from[1] }, { x: to[0], z: to[1] }, 60000);
    return pts ? pts.map((v) => [v.x, v.z]) : null;
  };
  const plen = (from, pts) => {
    let t = 0;
    let prev = from;
    for (const p of pts) { t += dd(prev[0], prev[1], p[0], p[1]); prev = p; }
    return t;
  };
  /** the first zone a polyline crosses (sampled every 2 m), else null */
  const crosses = (from, pts) => {
    let prev = from;
    for (const p of pts) {
      const n = Math.max(1, Math.ceil(dd(prev[0], prev[1], p[0], p[1]) / 2));
      for (let i = 1; i <= n; i++) {
        const zn = inZone(prev[0] + ((p[0] - prev[0]) * i) / n, prev[1] + ((p[1] - prev[1]) * i) / n);
        if (zn) return zn;
      }
      prev = p;
    }
    return null;
  };
  const direct = fp(start, a.to);
  if (!direct) return null;
  const blocked = crosses(start, direct);
  if (!blocked || !a.detour) return { pts: direct, len: plen(start, direct), detour: false, zone: blocked ? blocked.id : null };
  const cands = [];
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI * 2) / 12;
    cands.push([blocked.x + (blocked.r + 12) * Math.sin(ang), blocked.z + (blocked.r + 12) * Math.cos(ang)]);
  }
  const roadPts = [];
  for (const rd of roads) {
    for (const q of rd.pts) {
      const x = (q[0] + 0.5) * ts;
      const z = (q[1] + 0.5) * ts;
      const d = dd(x, z, blocked.x, blocked.z);
      if (d > blocked.r + 12 && d < blocked.r + 160 && !inZone(x, z)) roadPts.push({ p: [x, z], d });
    }
  }
  roadPts.sort((u, v) => u.d - v.d);
  for (const rp of roadPts.slice(0, 8)) cands.push(rp.p);
  let best = null;
  for (const c of cands) {
    if (inZone(c[0], c[1])) continue;
    const p1 = fp(start, c);
    if (!p1 || crosses(start, p1)) continue;
    const e1 = p1.length ? p1[p1.length - 1] : start;
    const p2 = fp(e1, a.to);
    if (!p2 || crosses(e1, p2)) continue;
    const len = plen(start, p1) + plen(e1, p2);
    if (!best || len < best.len) best = { pts: [...p1, ...p2], len };
  }
  if (!best) return { pts: direct, len: plen(start, direct), detour: false, zone: blocked.id };
  return { pts: best.pts, len: best.len, detour: true, zone: null };
};

let NAVS = 0; // main-frame navigations of the current journey; a reload resets the game state
const results = [];
const blockers = [];
const uxNotes = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  return !!ok;
};
/** hard = fails the run; otherwise listed in the report only. */
const blocker = (cls, msg, hard = false) => {
  blockers.push({ cls, msg, hard });
  console.log(`${hard ? 'BLOCKER(HARD)' : 'BLOCKER'} [${cls}] ${msg}`);
  if (hard) results.push({ name: `[${cls}] ${msg}`, ok: false, info: 'blocker' });
};
const ux = (cls, msg) => {
  uxNotes.push({ cls, msg });
  console.log(`UX [${cls}] ${msg}`);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: process.env.FH_HEADED !== '1',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

const summaries = [];
for (const cls of CLASSES) {
  try {
    summaries.push(await journey(cls));
  } catch (e) {
    check(`[${cls}] journey finished without exception`, false, `navigations=${NAVS} (>1 means the page reloaded mid-journey) ` + String(e?.stack ?? e).slice(0, 400));
  } finally {
    // every class leaves its fh_<cls>.json, also when journey() threw before it wrote its own summary
    const file = path.join(OUT, `fh_${cls}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ cls, end: 'journey threw before its summary' }, null, 2));
  }
}
await browser.close();

console.log('\n==== SUMMARY ====');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
console.log('class     checks  deaths  teleports  L2     L3     L4     L5     quests  end');
for (const s of summaries) {
  const lv = (n) => (s.levelMin[n] != null ? `${s.levelMin[n]}m` : '-').padEnd(7);
  console.log(`${s.cls.padEnd(9)} ${String(s.checks).padEnd(7)} ${String(s.deaths).padEnd(7)} ${String(s.teleports).padEnd(10)} ${lv(2)}${lv(3)}${lv(4)}${lv(5)} ${String(s.questsDone).padEnd(7)} ${s.end}`);
}
const fmtN = (v, u) => (v == null ? '-' : `${v}${u}`);
const lvT = (n, s) => (s.levelMin[n] != null ? `${s.levelMin[n]}m` : '-');
for (const s of summaries) {
  console.log(`CLASS ${s.cls}: deaths ${s.deaths}, kills ${s.kills}, median TTK ${fmtN(s.medianTtk, 's')}, median HP left ${fmtN(s.medianHpLeft, '%')}, L2 ${lvT(2, s)}, L3 ${lvT(3, s)}, L4 ${lvT(4, s)}, fight-backs ${s.fightBacks}, detours ${s.detours}`);
}
if (blockers.length) {
  console.log('Blockers / anomalies:');
  for (const b of blockers) console.log(`  - [${b.cls}]${b.hard ? ' (HARD)' : ''} ${b.msg}`);
}
if (uxNotes.length) {
  console.log('UX notes:');
  for (const u of uxNotes) console.log(`  - [${u.cls}] ${u.msg}`);
}
for (const f of failed) console.log('FAILED:', f.name, f.info);
process.exit(failed.length ? 1 : 0);

// ======================================================================================================================
async function journey(cls) {
  console.log(`\n===== ${cls} =====`);
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`fh_${cls}_`) || f === `fh_${cls}.json`) fs.rmSync(path.join(OUT, f)); // stale output
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => {
    if (!NOISE.test(e.message)) errors.push(`pageerror: ${e.message.slice(0, 300)}`);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NOISE.test(t)) errors.push(`console.error: ${t.slice(0, 300)}`);
  });
  NAVS = 0;
  page.on('framenavigated', (fr) => {
    if (fr !== page.mainFrame()) return;
    NAVS++;
    console.log(`  NAV #${NAVS} main frame -> ${fr.url()}`);
  });
  const checksAtStart = results.length;
  const fpsSamples = [];
  let shotN = 0;
  const shot = async (label) => {
    shotN++;
    await page.screenshot({ path: path.join(OUT, `fh_${cls}_${String(shotN).padStart(2, '0')}_${label}.png`) });
  };
  const B = (msg, hard = false) => blocker(cls, msg, hard);
  const X = (msg) => ux(cls, msg);
  const C = (name, ok, info) => check(`[${cls}] ${name}`, ok, info);
  let melee = false;
  let lastStep = null; // the kill step being fought: label, the target ids and how the bot picked its target (death report)
  let T0 = 0; // wall clock when the character entered the world
  const mins = (t = Date.now()) => ((t - T0) / 60000).toFixed(1);
  const levelUps = []; // {level, min}
  const levelMin = {};
  const chainLog = [];
  const stats = { deaths: 0, teleports: 0, kills: 0, questsDone: 0, fightBacks: 0, detours: 0 };
  // watchdog state: no progress (level, XP, kills, quest state / progress, HP gain, or a move of more than 5 m) for FH_WD_S seconds
  // = BLOCKER + state dump + screenshot; the step in flight is aborted (stepAbort: every wait loop of a step returns) and the chain moves on.
  const WD_MS = Number(process.env.FH_WD_S ?? 90) * 1000;
  let stepAbort = false;
  let wdTimer = null;
  let wdBusy = false;
  let wdFires = 0;
  // side quests the watchdog fired on: two fires abandon the quest through the game's own Abandon Quest (G.quests.abandon: progress and
  // quest items go, the quest is offered again at its giver), and the bot never takes it again. BLOCKER lines record each abandon.
  const wdFiresBy = new Map();
  const abandoned = new Set();
  let wdAnchor = { t: 0, x: 0, z: 0 };
  let wdLast = null;
  let wdLabel = 'setup'; // the chain step in progress (quest + state)
  let wdWalk = null; // {label, x, z} of the walk in progress
  let curQuest = null; // id of the quest the chain step works on
  let curMain = true; // the chain step in flight is a main-chain quest: its blockers are HARD; a side quest's are dropped instead
  let end = ''; // how the chain ended (summary)
  let written = false;
  let summary = null;
  let excMsg = '';
  let capAt = 0; // wall clock when the class time cap (FH_MAX_MIN) was seen
  await page.exposeFunction('__fhLevelUp', (level) => {
    levelUps.push({ level, min: mins() });
    if (levelMin[level] == null) levelMin[level] = mins();
    console.log(`  LEVEL ${level} at ${mins()} min (real time since the character entered the world)`);
    shot(`levelup_L${level}`).catch(() => {});
  });
  const sampleFps = async (where) => {
    const fps = await page.evaluate(
      () => new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 > 1500) res((n * 1000) / (performance.now() - t0));
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
    );
    fpsSamples.push({ where, fps: Math.round(fps) });
    return fps;
  };

  // ---- state helpers (read only) ----
  const snap = () =>
    page.evaluate(() => {
      const G = window.G;
      const p = G.player;
      const ch = G.character;
      return {
        scene: G.scenes?.current?.id ?? null,
        x: p?.position.x ?? 0, y: p?.position.y ?? 0, z: p?.position.z ?? 0, yaw: p?.yaw ?? 0,
        hp: p?.hp ?? 0, maxHp: p?.maxHp ?? 0, dead: !!p?.isDead,
        lvl: ch?.level ?? 0, xp: ch?.save?.xp ?? 0, gold: ch?.save?.gold ?? 0,
        top: G.ui?.topPanelId?.() ?? null, wantsCursor: !!G.ui?.wantsCursor?.(),
        fps: G.engine?.fps ?? 0,
      };
    });
  const waitScene = async (id, timeout = 120000) => {
    await page.waitForFunction((sid) => window.G?.scenes?.current?.id === sid && !!window.G?.player && !!window.G?.world, id, { timeout, polling: 250 });
  };
  const qState = (id) => page.evaluate((qid) => window.G.quests.state(qid), id);
  const progressRows = (id) => page.evaluate((qid) => window.G.quests.progressRows(qid), id);
  const progressKey = async (id) => (await progressRows(id)).map((r) => `${r.have}/${r.need}`).join(' ');
  /** The game's own pick of what to do next (guideEngine.recommend, the same quest the tracker and the guide arrow show). */
  const recommended = () =>
    page.evaluate(async () => {
      const ge = await import('/src/ui/panels/game/guideEngine.ts');
      const q = ge.recommend(window.G.character).quest;
      return q ? { id: q.id, name: q.name, state: q.state, giver: q.giverNpcId ?? null } : null;
    });
  /** The guide's pick, minus the side quests this run abandoned (the guide would hand them back): ready > lowest active > main chain
   * within 2 levels > a side quest of the dropped one's zone. */
  const recommendedNow = async () => {
    const r = await recommended();
    if (!r || !abandoned.has(r.id)) return r;
    return page.evaluate((skip) => {
      const q = window.G.quests;
      const L = window.G.character.save.level;
      const zone = q.def(skip[skip.length - 1])?.region ?? null;
      const all = q.all().filter((d) => !skip.includes(d.id));
      const pick = (d, state) => ({ id: d.id, name: d.name, state, giver: d.giver ?? null });
      const ready = all.find((d) => q.state(d.id) === 'ready');
      if (ready) return pick(ready, 'ready');
      const act = all.filter((d) => q.state(d.id) === 'active').sort((a, b) => a.level - b.level);
      if (act[0]) return pick(act[0], 'active');
      const mains = all.filter((d) => q.state(d.id) === 'available' && d.main && d.level <= L + 2).sort((a, b) => a.level - b.level);
      if (mains[0]) return pick(mains[0], 'available');
      const side = all.filter((d) => q.state(d.id) === 'available' && !d.main && d.region === zone).sort((a, b) => a.level - b.level);
      return side[0] ? pick(side[0], 'available') : null;
    }, [...abandoned, r.id]);
  };
  /** Static quest data the steps need (from G.quests, no ids written here). */
  const questDef = (id) =>
    page.evaluate((qid) => {
      const d = window.G.quests.def(qid);
      if (!d) return null;
      return {
        id: d.id, name: d.name, level: d.level, main: !!d.main, giver: d.giver, turnIn: d.turnIn ?? null, bonus: !!d.bonus, region: d.region ?? null, place: d.place ?? null,
        objectives: d.objectives.map((o) => ({ kind: o.kind, target: o.target ?? null, count: o.count, text: o.text, from: o.from ?? null, item: o.item ?? null })),
      };
    }, id);
  /** Ids of the enemies a quest fights: its kill-type objectives (fallback for collect / drop). */
  const killTargetsOf = (d) => d.objectives.filter((o) => ['kill', 'boss', 'metin', 'elite', 'skill'].includes(o.kind) && o.target).map((o) => o.target);

  // ---- keyboard driving ----
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const releaseAll = () => setKeys([]);
  const tap = async (key, ms = 60) => {
    await page.keyboard.down(key);
    await sleep(ms);
    await page.keyboard.up(key);
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let turnLeftIncreasesYaw = null; // calibrated once: which arrow raises player.yaw
  const calibrateTurn = async () => {
    const y0 = (await snap()).yaw;
    await page.keyboard.down('ArrowLeft');
    await sleep(250);
    await page.keyboard.up('ArrowLeft');
    await sleep(80);
    const y1 = (await snap()).yaw;
    const d = wrap(y1 - y0);
    turnLeftIncreasesYaw = d > 0;
    if (Math.abs(d) < 0.02) B('ArrowLeft does not turn the character (turnLeft binding / WoW scheme)');
  };
  const dev = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  /** Raw ids / placeholders leaking into visible text (missing Turkish strings). */
  const noteTextIssues = async (where) => {
    const bad = await page.evaluate(() => {
      const t = document.getElementById('ui-root')?.innerText ?? '';
      const m = t.match(/\bundefined\b|\bNaN\b|\[object|\b(?:mq|ow|item|npc|mb|wb|skel|cult|sq|qo|qt|metin|rare)_[a-z0-9_]{3,}\b|\{\{|\}\}/g);
      return m ? [...new Set(m)].slice(0, 6) : [];
    });
    if (bad.length) X(`visible raw / untranslated text at "${where}": ${bad.join(', ')}`);
  };
  /** Esc until no panel is open (never presses Esc on an empty HUD: that opens the game menu). */
  const closePanels = async () => {
    for (let i = 0; i < 6; i++) {
      const top = await page.evaluate(() => window.G.ui.topPanelId?.() ?? null);
      if (!top) return;
      await page.keyboard.press('Escape');
      await sleep(350);
    }
  };

  /** Camps of another level band than the character's (pickTarget's band lvl-3..lvl) as zones for navRoute: walks go round them. */
  const avoidZones = (lvl) =>
    page.evaluate(async (L) => {
      const qm = await import('/src/ui/hud/questMarks.ts');
      const ts = (await import('/src/types/dungeons.ts')).TILE_SIZE;
      const out = [];
      for (const pk of qm.worldDef()?.packs ?? []) {
        const lr = pk.levelRange;
        if (!lr || (lr[1] >= L - 3 && lr[0] <= L)) continue;
        out.push({ id: pk.id, x: (pk.center[0] + 0.5) * ts, z: (pk.center[1] + 0.5) * ts, r: (pk.radius ?? 18) + 10 });
      }
      return out;
    }, lvl).catch(() => []);
  /** A wait point R m out from the centre c: of 8 bearings (the character's side first) the one with the shortest route that crosses no
   *  camp of another level band (a route through one costs 1e6 m). Null when no bearing is reachable. */
  const waitPoint = async (c, R) => {
    const zones = await avoidZones((await snap()).lvl);
    const here = await snap();
    const base = Math.atan2(here.x - c.x, here.z - c.z);
    let best = null;
    for (let k = 0; k < 8; k++) {
      const a = base + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 4);
      const x = c.x + R * Math.sin(a);
      const z = c.z + R * Math.cos(a);
      const r = await page.evaluate(navRoute, { to: [x, z], zones, detour: false });
      if (!r) continue;
      const score = (r.zone ? 1e6 : 0) + r.len;
      if (!best || score < best.score) best = { x, z, score };
    }
    return best;
  };
  /**
   * Walk to (tx, tz) with W + turn arrows. `stop` = distance at which to stop (m). Returns { ok, teleported, dist }.
   * The route is the game's navgrid (navRoute: waypoints only, round the camps of another level band unless `avoid: false`). The time
   * budget is `timeout` or the route length at 2 m/s, whichever is longer. Unreachable / stuck -> BLOCKER + dev teleport.
   * Fight back on the way (fightBackIfHit): an enemy that hits the character is fought, then the walk re-plans; the fight uses no budget.
   */
  const walkTo = async (tx, tz, o = {}) => {
    const stop = o.stop ?? 2.5;
    const label = o.label ?? `(${tx.toFixed(0)},${tz.toFixed(0)})`;
    if (stepAbort) return { ok: false, aborted: true, dist: null };
    wdWalk = { label, x: tx, z: tz };
    const t0 = Date.now();
    if (turnLeftIncreasesYaw === null) await calibrateTurn();
    const zones = o.avoid === false ? [] : await avoidZones((await snap()).lvl);
    const plan = () => page.evaluate(navRoute, { to: [tx, tz], zones, detour: true });
    const r0 = await plan();
    if (!r0) B(`no navgrid path to ${label}; trying a straight line`);
    if (r0?.detour) { stats.detours++; console.log(`    walk to ${label} goes round a camp (route ${Math.round(r0.len)} m)`); }
    if (r0?.zone) console.log(`    walk to ${label} crosses the camp ${r0.zone}: no way round it found`);
    let path = r0 ? r0.pts : [[tx, tz]];
    let wpI = 0;
    let lastPos = await snap();
    const routeLen = r0 ? r0.len : dev(lastPos, { x: tx, z: tz });
    const budget = Math.max(o.timeout ?? 90000, Math.round(routeLen * 500) + 10000);
    let lastCheck = Date.now();
    let stuckN = 0;
    let budgetEnd = t0 + budget;
    let lastFb = 0;
    while (Date.now() < budgetEnd && !stepAbort) {
      const s = await snap();
      if (s.dead) { await releaseAll(); return { ok: false, dead: true, dist: dev(s, { x: tx, z: tz }) }; }
      // fight back on the walk: an enemy in reach that hits the character is fought first (checked every 250 ms); then the walk re-plans
      if (Date.now() - lastFb > 250) {
        lastFb = Date.now();
        const f0 = Date.now();
        const fb = await fightBackIfHit(60000);
        if (fb !== 'clear') {
          await releaseAll();
          if (fb === 'aborted') return { ok: false, aborted: true, dist: dev(s, { x: tx, z: tz }) };
          if (fb === 'died') return { ok: false, dead: true, dist: dev(s, { x: tx, z: tz }) };
          budgetEnd += Date.now() - f0; // the fight does not use up the walk's time budget
          const np = await plan();
          if (np) { path = np.pts; wpI = 0; }
          lastPos = await snap();
          lastCheck = Date.now();
          stuckN = 0;
          continue;
        }
      }
      const distFinal = dev(s, { x: tx, z: tz });
      if (distFinal <= stop) { await releaseAll(); return { ok: true, dist: distFinal }; }
      if (s.scene !== (o.scene ?? s.scene)) { await releaseAll(); return { ok: true, sceneChanged: true, dist: distFinal }; }
      while (wpI < path.length - 1 && Math.hypot(path[wpI][0] - s.x, path[wpI][1] - s.z) < 1.6) wpI++;
      const [wx, wz] = path[wpI];
      const want = Math.atan2(wx - s.x, wz - s.z);
      const err = wrap(want - s.yaw);
      const keys = [];
      if (Math.abs(err) > 0.12) keys.push((err > 0) === turnLeftIncreasesYaw ? 'ArrowLeft' : 'ArrowRight');
      if (Math.abs(err) < 0.6) keys.push('KeyW');
      await setKeys(keys);
      // stuck detection every 1.6 s
      if (Date.now() - lastCheck > 1600) {
        const moved = dev(s, lastPos);
        lastPos = s;
        lastCheck = Date.now();
        if (moved < 0.6) {
          stuckN++;
          if (stuckN === 1 || stuckN === 2) {
            // head-on against a rock / tree trunk: slide round it (strafe one way, then the other) and hop
            await setKeys(['KeyW', stuckN === 1 ? 'KeyA' : 'KeyD']);
            await sleep(stuckN === 1 ? 700 : 1100);
            await tap('Space', 120);
            await sleep(300);
          } else if (stuckN === 3) {
            const np = await plan();
            if (np) { path = np.pts; wpI = 0; }
            await setKeys(['KeyS']);
            await sleep(350);
          } else if (stuckN >= 4) {
            await releaseAll();
            B(`stuck walking to ${label} at (${s.x.toFixed(1)},${s.z.toFixed(1)}); dev teleport used`);
            stats.teleports++;
            await page.evaluate(([x, z]) => {
              const G = window.G;
              G.player.position.set(x, G.player.position.y, z);
            }, [tx, tz]);
            await sleep(400);
            return { ok: true, teleported: true, dist: 0 };
          }
        } else if (moved >= 0.6) stuckN = 0;
      }
      await sleep(60);
    }
    await releaseAll();
    const s = await snap();
    if (stepAbort) return { ok: false, aborted: true, dist: dev(s, { x: tx, z: tz }) };
    B(`walk to ${label} timed out after ${Math.round(budget / 1000)} s (${Math.round(dev(s, { x: tx, z: tz }))} m left)`);
    return { ok: false, timeout: true, dist: dev(s, { x: tx, z: tz }) };
  };

  // ---- positions (game data, not ids written here) ----
  /** NPC of a def id: the streamed entity, else the game's own position data (town or world). */
  const npcPos = (npcId) =>
    page.evaluate(async (nid) => {
      const e = [...window.G.world.entities.values()].find((n) => n.kind === 'npc' && n.def?.id === nid);
      if (e) return { x: e.position.x, z: e.position.z };
      const ge = await import('/src/ui/panels/game/guideEngine.ts');
      const p = ge.giverPosition(nid);
      return p ? { x: p.x, z: p.z } : null;
    }, npcId);
  /** A place / region of an objective, else the quest's focus point (the objective point of the map). */
  const placePos = (target, questId) =>
    page.evaluate(async ([t, q]) => {
      const qm = await import('/src/ui/hud/questMarks.ts');
      const ge = await import('/src/ui/panels/game/guideEngine.ts');
      const p = (t && qm.placeWorldPos(t)) ?? (t && qm.regionCentre(t)) ?? ge.questFocusPos(q);
      return p ? { x: p.x, z: p.z } : null;
    }, [target ?? null, questId]);
  /** Walk to an NPC and press F; true when its dialog opens. */
  const talkNpc = async (npcId) => {
    let p = await npcPos(npcId);
    if (!p) {
      // a village NPC is not in the town: the guide arrow points at the gate that leads to its map; walk there, then retry
      const g = await page.evaluate(async () => (await import('/src/ui/hud/questMarks.ts')).guideTarget(null));
      if (g && g.kind === 'talk' && !stepAbort) {
        await walkTo(g.x, g.z, { stop: 1.5, timeout: 150000, label: g.label });
        if (!stepAbort) await waitScene('dungeon', 60000).catch(() => {});
        await sleep(2500);
        p = await npcPos(npcId);
      }
    }
    if (!p) { B(`NPC ${npcId} has no position (not streamed in, no data position)`, curMain); return false; }
    await walkTo(p.x, p.z, { stop: 2.4, label: npcId, timeout: 150000 });
    await closePanels();
    await tap('KeyF');
    await sleep(700);
    return page.evaluate(() => window.G.ui.isPanelOpen('dialog'));
  };

  // ---- keys: from the game's binding tables and the character's skill bar ----
  let keys = null;
  /** Bar skills whose game tags (skills.ts) say heal / absorb / defensive: the survival set. The other bar skills are the damage rotation. */
  const HEAL_TAGS = ['heal', 'absorb', 'defensive'];
  const loadKeys = () =>
    page.evaluate(async (healTags) => {
      const I = await import('/src/core/Input.ts');
      const S = await import('/src/data/skills.ts');
      const key = (action) => (I.SCHEME_BINDINGS.wow[action] ?? I.DEFAULT_BINDINGS[action] ?? [])[0] ?? null;
      const bar = window.G.character.save.skillBar ?? {};
      const skills = [];
      const heals = [];
      let interrupt = null;
      for (const slot of ['rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4']) {
        const id = bar[slot];
        const k = key(`skill_${slot}`);
        if (!id || !k) continue;
        const def = S.SKILLS[id];
        if (def?.behavior === 'interrupt') interrupt = { slot, key: k, id };
        else if (def?.tags?.some((t) => healTags.includes(t))) heals.push({ slot, key: k, id, cast: def.castTime ?? 0 });
        else skills.push({ slot, key: k, id });
      }
      heals.sort((a, b) => a.cast - b.cast); // instant heals first
      return { skills, heals, interrupt, potionHp: key('potionHp') };
    }, HEAL_TAGS);

  // ---- combat ----
  const enemyState = (id) =>
    page.evaluate(async (eid) => {
      const G = window.G;
      const pc = await import('/src/game/PlayerController.ts');
      const e = G.world.entities.get(eid);
      const p = G.player;
      const out = { x: 0, y: 0 };
      const on = e ? G.ui.projectWorld(e.position.x, e.position.y + (e.height || 1.5) * 0.5, e.position.z, out) : false;
      return {
        alive: !!e && !e.isDead && !e.removed && e.alive !== false,
        x: e?.position.x ?? 0, z: e?.position.z ?? 0,
        d: e ? Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z) : 999,
        sx: out.x, sy: out.y, onScreen: !!(on && out.x > 20 && out.x < innerWidth - 20 && out.y > 20 && out.y < innerHeight - 90),
        selected: pc.localHardTargetId() === eid,
        casting: !!e?.cast?.interruptible,
        pHp: p.hp, pMax: p.maxHp, pDead: !!p.isDead, pYaw: p.yaw, px: p.position.x, pz: p.position.z,
      };
    }, id);
  /** Nearest living enemy whose def id is in `ids` (null = any). */
  const nearestEnemy = (ids) =>
    page.evaluate((idl) => {
      const G = window.G;
      const p = G.player.position;
      let best = null;
      for (const e of G.world.enemies) {
        if (e.isDead || e.removed || e.alive === false) continue;
        if (idl && !idl.includes(e.def?.id)) continue;
        const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
        if (!best || d < best.d) best = { id: e.id, def: e.def?.id, name: e.def?.name, x: e.position.x, z: e.position.z, d, aggro: !!e.aggroed, level: e.level ?? 1, camp: e.packId ?? `solo:${e.id}` };
      }
      return best;
    }, ids ?? null);
  /** Every living enemy of `ids` (null = any), nearest first, with its level and camp (packId). */
  const aliveEnemies = (ids) =>
    page.evaluate((idl) => {
      const G = window.G;
      const p = G.player.position;
      const out = [];
      for (const e of G.world.enemies) {
        if (e.isDead || e.removed || e.alive === false) continue;
        if (idl && !idl.includes(e.def?.id)) continue;
        out.push({ id: e.id, def: e.def?.id, name: e.def?.name, x: e.position.x, z: e.position.z, d: Math.hypot(e.position.x - p.x, e.position.z - p.z), aggro: !!e.aggroed, level: e.level ?? 1, camp: e.packId ?? `solo:${e.id}` });
      }
      return out.sort((a, b) => a.d - b.d);
    }, ids ?? null);
  /** Fight back (fight-back.mjs): the enemies that hit the character, read from the game's damage events in the page (one read per call). */
  const fbCapped = new Map(); // enemy id -> Date.now() ms until which it is not picked again (its fight-back cap)
  const hitSnapshot = () => page.evaluate(hitterSnapshot);
  /** The attackers now, nearest first: dealt damage to the character in the last 3 s, in reach, alive, not under the 20 s cap of an earlier fight-back. */
  const hittersNow = async () => pickAttackers(await hitSnapshot(), { capped: fbCapped, nowMs: Date.now() });
  /** Fight back on every path (walk, camp wait, rest, escort, fight): 'clear' when no enemy hits the character, else fight(null), which
   *  returns 'clear' | 'died' | 'aborted' | 'timeout' (the time cap). */
  const fightBackIfHit = async (maxMs = 60000) => ((await hittersNow()).length ? fight(null, maxMs) : 'clear');
  /**
   * The next pull, one camp at a time: the camp being fought stays the target while one of its members lives within 40 m; otherwise the
   * nearest in-band mob (level lvl-3..lvl, never above the character's level; no fallback to any other level).
   */
  let campLock = null;
  const pickTarget = async (ids) => {
    const all = await aliveEnemies(ids);
    if (!all.length) return null;
    const lvl = (await snap()).lvl;
    const locked = campLock ? all.filter((e) => e.camp === campLock && e.d <= 40) : [];
    if (locked.length) return locked[0];
    // never a camp above the character's level: a level 2 character does not pull level 3 goblin camps (no fallback to any level)
    const band = all.filter((e) => e.level >= lvl - 3 && e.level <= lvl);
    if (!band.length) { campLock = null; return null; }
    campLock = band[0].camp;
    return band[0];
  };
  const lootAround = () =>
    page.evaluate(() => {
      const G = window.G;
      const p = G.player.position;
      const out = [];
      for (const e of G.world.entities.values()) {
        if (e.kind !== 'loot' || e.removed) continue;
        const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
        if (d < 14) out.push({ x: e.position.x, z: e.position.z, d, name: e.displayName ?? '', landed: !!e.landed });
      }
      return out.sort((a, b) => a.d - b.d);
    });
  const collectLoot = async () => {
    for (let i = 0; i < 6; i++) {
      const l = (await lootAround()).filter((x) => x.landed);
      if (!l.length) return;
      if (l[0].d > 1.6) await walkTo(l[0].x, l[0].z, { stop: 1.2, timeout: 12000, label: 'loot' });
      await sleep(350);
      if ((await lootAround()).some((x) => x.landed && x.d < 2)) {
        await tap('KeyF');
        await sleep(350);
      }
    }
  };
  /** Death report: the game's own death recap (death:recap, last 10 s of hits and heals), the attackers' level / camp / distance
   *  from the r1_c02 camp, the player's HP and resource over the last 10 s, and how the bot chose the target. Written to fh_<class>_deaths.json. */
  const deathReport = async () => {
    const rep = await page.evaluate(async () => {
      const G = window.G;
      const qm = await import('/src/ui/hud/questMarks.ts');
      const { TILE_SIZE: ts } = await import('/src/types/dungeons.ts');
      const def = qm.worldDef();
      const packs = def?.packs ?? [];
      const camp = packs.find((pk) => pk.id === 'r1_c02');
      const cc = camp ? { x: (camp.center[0] + 0.5) * ts, z: (camp.center[1] + 0.5) * ts } : null;
      const p = G.player;
      const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      const rc = window.__fhRecap;
      window.__fhRecap = null;
      const ent = (id) => {
        if (id == null) return null;
        let e = null;
        try { e = G.world.get(id); } catch { e = null; }
        if (!e) return { id, gone: true };
        return { id, def: e.def?.id ?? null, level: e.level ?? null, camp: e.packId ?? 'solo', x: +e.position.x.toFixed(1), z: +e.position.z.toFixed(1), campDistM: cc ? Math.round(dist(e.position, cc)) : null };
      };
      const hits = (rc?.hits ?? []).map((h) => ({ ago: +(rc.at - h.t).toFixed(1), name: h.sourceName, ability: h.ability, amount: Math.round(h.amount), hpPct: Math.round(h.hpPct * 100), src: ent(h.source) }));
      const bySrc = {};
      for (const h of rc?.hits ?? []) { const k = String(h.source); bySrc[k] = (bySrc[k] ?? 0) + h.amount; }
      const perSource = Object.entries(bySrc).map(([k, v]) => ({ src: ent(k === 'null' ? null : Number(k)), amount: Math.round(v) })).sort((a, b) => b.amount - a.amount);
      const around = G.world.enemies.filter((e) => !e.isDead && !e.removed && dist(e.position, p.position) < 25).map((e) => ({ def: e.def?.id, level: e.level ?? null, camp: e.packId ?? 'solo', aggro: !!e.aggroed, dM: Math.round(dist(e.position, p.position)), campDistM: cc ? Math.round(dist(e.position, cc)) : null }));
      const slimesInCamp = G.world.enemies.filter((e) => !e.isDead && !e.removed && e.packId === 'r1_c02').length;
      const hist = (window.__fhHist ?? []).slice(-40).map((h) => ({ hpPct: Math.round((100 * h.hp) / Math.max(1, h.maxHp)), resPct: h.maxRes ? Math.round((100 * h.res) / h.maxRes) : null, resType: h.resType, campDistM: cc ? Math.round(dist(h.pos, cc)) : null }));
      return {
        recapAt: rc?.at ?? null, taken: rc?.taken ?? null, healed: rc?.healed ?? null,
        killingBlow: rc?.killingBlow ? { ability: rc.killingBlow.ability, name: rc.killingBlow.sourceName, amount: Math.round(rc.killingBlow.amount) } : null,
        topSources: perSource.slice(0, 3), hits, around,
        player: { x: +p.position.x.toFixed(1), z: +p.position.z.toFixed(1), lvl: G.character.level, distToR1c02CampM: cc ? Math.round(dist(p.position, cc)) : null, hp: p.hp, maxHp: p.maxHp },
        campR1c02: { centre: cc, slimesAlive: slimesInCamp, levelRange: camp?.levelRange ?? null, members: camp?.members ?? null },
        hist,
      };
    });
    rep.step = lastStep;
    rep.cls = cls;
    stats.deathReports ??= [];
    stats.deathReports.push(rep);
    fs.writeFileSync(path.join(OUT, 'fh_' + cls + '_deaths.json'), JSON.stringify(stats.deathReports, null, 1));
    console.log('  DEATH ' + stats.deathReports.length + ' [' + cls + '] lvl ' + rep.player.lvl + ' at ' + mins() + ' min, ' + rep.player.distToR1c02CampM + ' m from r1_c02 centre; step: ' + rep.step?.label + ' / how: ' + rep.step?.how);
    console.log('    taken ' + rep.taken + ' healed ' + rep.healed + '; killing blow ' + JSON.stringify(rep.killingBlow) + '; top ' + rep.topSources.map((t) => (t.src?.def ?? t.src?.id) + '(L' + t.src?.level + ', ' + t.src?.camp + ', ' + t.src?.campDistM + 'm) ' + t.amount).join(' | '));
    for (const h of rep.hits) console.log('    -' + h.ago + 's ' + h.name + ' / ' + h.ability + ' ' + h.amount + ' dmg -> ' + h.hpPct + '% hp, src ' + (h.src?.def ?? h.src?.id) + ' L' + h.src?.level + ' ' + h.src?.camp + ' ' + h.src?.campDistM + 'm from r1_c02');
    console.log('    around: ' + (rep.around.map((e) => e.def + ' L' + e.level + ' ' + e.camp + ' ' + e.dM + 'm' + (e.aggro ? '*' : '')).join(', ') || '-') + '; r1_c02 slimes alive ' + rep.campR1c02.slimesAlive);
    console.log('    hp%/res% last 10 s (oldest first): ' + rep.hist.map((h) => h.hpPct + '/' + (h.resPct ?? '-')).join(' '));
  };
  const handleDeath = async () => {
    stats.deaths++;
    await sleep(1500);
    await deathReport().catch((e) => console.log('  death report failed: ' + e));
    await shot('death');
    const respawn = page.locator('button:has-text("Ruhunu Serbest")').first();
    if ((await respawn.count()) > 0) await respawn.click().catch(() => {});
    else B('death panel has no "Ruhunu Serbest Bırak" button', true);
    for (let i = 0; i < 12 && (await snap()).dead; i++) await sleep(500);
    await sleep(1500);
    const s = await snap();
    if (s.dead) B('player stays dead after "Ruhunu Serbest Bırak"', true);
    await closePanels();
    // the release puts the character at the graveyard with half its HP: rest there to 90% before the walk back (the walk goes round camps of
    // another level band, see walkTo)
    const back = await snap();
    console.log(`  released at the graveyard with ${Math.round((100 * back.hp) / Math.max(1, back.maxHp))}% HP: resting to 90% before the walk back`);
    await restUp(0.9, 0.9);
  };

  /** Fight one enemy with real input: steer + approach, select, bar skills, heal below 50%, potion below 35%, interrupt casts. `enemyId` is the
   *  objective; null = a fight back only (walk, camp wait, rest, escort): it returns 'clear' once no enemy hits the character. An attacker
   *  (fight-back rules, see fightBackIfHit) is fought first, nearest first. It is selected through the game's target:select (what a click emits)
   *  and turned to face. It is kept while it keeps dealing damage. The fight-back ends when it dies (a kill, counted once), when it has dealt no
   *  damage for 3 s (a drop) or at its 20 s cap (not picked again for 20 s); the objective resumes after each. */
  let skillIx = 0;
  let healIx = 0;
  let fightSeq = 0; // objective fights of this class; fights 1 and 5 get a mid-combat screenshot at ~3 s (fight-back-only fights are not numbered)
  let healCasts = 0;
  let restCount = 0;
  const fightLog = []; // {n, def, level, res: dead | died | timeout | aborted, ttk (s), hpLeft (%)}
  /** The game's own targeting: target:select, the event a nameplate click emits (attack: true arms the auto-attack, as a right click does). */
  const selectByGame = (id) => page.evaluate((eid) => { window.G.events.emit('target:select', { entityId: eid, attack: true }); }, id);
  const fight = async (enemyId, maxMs = 45000, meta = {}) => {
    if (!keys) keys = await loadKeys();
    const n = enemyId != null ? ++fightSeq : 0;
    const t0 = Date.now();
    const mainId = enemyId; // the objective, or null for a fight back only
    let tgt = null; // {id, def, level, since}: the enemy fought now
    const rec = (res, st) => fightLog.push({ n, def: meta.def ?? null, level: meta.level ?? null, res, ttk: +((Date.now() - t0) / 1000).toFixed(1), hpLeft: st ? Math.round((100 * st.pHp) / Math.max(1, st.pMax)) : null });
    let lastSkill = 0;
    let lastClick = 0;
    let lastKick = 0;
    let lastHeal = 0;
    let potionAt = 0;
    let shotDone = false;
    let lastScan = -1e9; // the attacker lists are read again 250 ms after the last read, at once after a kill or after a pick found a dead enemy
    let attackers = []; // in reach and hitting (the pick rule), nearest first
    let hitters = []; // hitting within the window, in reach or not (the drop rule)
    while (Date.now() - t0 < maxMs && !stepAbort) {
      const now = Date.now();
      // the lists are read BEFORE the liveness read below: an attacker that dies after its list was read is seen dead by that read (a kill,
      // counted once), and is never dropped as a stale list entry
      if (now - lastScan > 250) {
        const snapL = await hitSnapshot();
        const opts = { exceptId: mainId, capped: fbCapped, nowMs: Date.now() };
        hitters = recentHitters(snapL, opts);
        attackers = pickAttackers(snapL, opts);
        lastScan = now;
      }
      // the enemy fought now (the objective when none is set) also gives the character's state
      let s = await enemyState(tgt ? tgt.id : mainId);
      if (s.pDead) { await releaseAll(); rec('died', s); return 'died'; }
      const mainS = mainId != null ? (tgt && tgt.id === mainId ? s : await enemyState(mainId)) : null;
      // the fought attacker ends: a kill when it is dead (it leaves both lists at once, so no later pick sees it), a drop when it has dealt no
      // damage for the window (the drop is in the else-if chain after the liveness test, so only a live attacker is dropped), or at its 20 s cap
      if (tgt && tgt.id !== mainId) {
        if (!s.alive) {
          stats.kills++;
          fightLog.push({ n, def: tgt.def, level: tgt.level, res: 'dead', ttk: +((now - tgt.since) / 1000).toFixed(1), hpLeft: Math.round((100 * s.pHp) / Math.max(1, s.pMax)) });
          console.log(`  kill ${tgt.def} (attacker in the ${meta.def ?? 'fight'} fight, L${tgt.level}, ${mins()} min)`);
          attackers = attackers.filter((h) => h.id !== tgt.id);
          hitters = hitters.filter((h) => h.id !== tgt.id);
          lastScan = -1e9;
          tgt = null;
        } else if (now - tgt.since >= FIGHT_BACK_CAP_MS) {
          fbCapped.set(tgt.id, Date.now() + FIGHT_BACK_CAP_MS);
          console.log(`    fight back on ${tgt.def} capped at ${FIGHT_BACK_CAP_MS / 1000} s: the ${meta.def ?? 'fight'} resumes`);
          attackers = attackers.filter((h) => h.id !== tgt.id);
          hitters = hitters.filter((h) => h.id !== tgt.id);
          tgt = null;
        } else if (!hitters.some((h) => h.id === tgt.id)) {
          console.log(`    fight back on ${tgt.def} dropped: no damage to the character in the last 3 s`);
          tgt = null;
        }
      }
      // next target: the attacker kept above, else the nearest attacker, else the objective while it lives
      let nextId = null;
      if (tgt && tgt.id !== mainId) nextId = tgt.id;
      else if (attackers.length) nextId = attackers[0].id;
      else if (mainS?.alive) nextId = mainId;
      if (nextId == null) {
        await releaseAll();
        if (mainId == null) return 'clear';
        rec('dead', mainS ?? s);
        return 'dead';
      }
      if (!tgt || nextId !== tgt.id) {
        if (nextId === mainId) tgt = { id: mainId, def: meta.def ?? null, level: meta.level ?? null, since: now };
        else {
          const h = attackers.find((a) => a.id === nextId);
          if (!(await enemyState(h.id)).alive) {
            // it died after its list was read: no fight, no fight-back count, no kill. The next pass reads the lists again.
            attackers = attackers.filter((a) => a.id !== h.id);
            hitters = hitters.filter((a) => a.id !== h.id);
            lastScan = -1e9;
            await sleep(70);
            continue;
          }
          stats.fightBacks++;
          console.log(`    fight back: ${h.def} L${h.level} hits us in the ${meta.def ?? 'fight'} fight (${Math.round(h.d)} m)`);
          tgt = { id: h.id, def: h.def, level: h.level, since: now };
        }
        lastClick = 0;
        s = await enemyState(tgt.id);
      }
      if (!shotDone && (n === 1 || n === 5) && now - t0 >= 3000) {
        shotDone = true;
        await shot(`combat_f${n}`);
      }
      // a casting target is closed in on for the interrupt (kick reach is short); otherwise the class's fight distance
      const kickNow = !!keys.interrupt && s.casting;
      const want = kickNow ? 2.5 : melee ? 2.2 : 13;
      const err = wrap(Math.atan2(s.x - s.px, s.z - s.pz) - s.pYaw);
      const mv = [];
      if (Math.abs(err) > 0.1) mv.push((err > 0) === turnLeftIncreasesYaw ? 'ArrowLeft' : 'ArrowRight'); // turn to face the target
      if (s.d > want && Math.abs(err) < 0.9) mv.push('KeyW');
      await setKeys(mv);
      // select + arm the auto-attack. An attacker is selected through the game's target:select (Tab is not used: it cycles only the enemies
      // inside the camera frustum). The objective is right-clicked when it is on screen, then selected the same way when that click did not.
      if (!s.selected && s.d < 30 && now - lastClick > 1500) {
        lastClick = now;
        if (tgt.id === mainId) {
          if (s.onScreen) {
            await page.mouse.click(s.sx, s.sy, { button: 'right' });
            await sleep(80);
          }
          if (!(await enemyState(tgt.id)).selected) await selectByGame(tgt.id);
        } else await selectByGame(tgt.id);
      }
      if (s.selected && s.d < (melee ? 4 : 28)) {
        if (kickNow && s.d < 4 && now - lastKick > 1200) {
          lastKick = now;
          await tap(keys.interrupt.key, 40);
        } else if (!kickNow && now - lastSkill > 420 && keys.skills.length) {
          lastSkill = now;
          skillIx = (skillIx + 1) % keys.skills.length;
          await tap(keys.skills[skillIx].key, 40);
        }
      }
      if (s.pHp < s.pMax * 0.5 && keys.heals.length && now - lastHeal > 1500) {
        lastHeal = now;
        healCasts++;
        await tap(keys.heals[healIx++ % keys.heals.length].key, 40);
      }
      if (s.pHp < s.pMax * 0.35 && now - potionAt > 6000 && keys.potionHp) {
        potionAt = now;
        await tap(keys.potionHp, 40);
      }
      await sleep(70);
    }
    await releaseAll();
    if (stepAbort) { rec('aborted', null); return 'aborted'; }
    rec('timeout', null);
    return 'timeout';
  };

  /** Before a pull: below 60% HP the character stands still (out-of-combat regen runs 5 s after the last hit; the game has no food) until 80%.
   *  After a death (released at the graveyard with half its HP) the rest is `below` 90% and runs to 90%. Aggro that walks in is fought. */
  const restUp = async (below = 0.6, to = 0.8) => {
    const s0 = await snap();
    if (s0.dead || s0.hp >= s0.maxHp * below) return;
    restCount++;
    await releaseAll();
    const t0 = Date.now();
    while (Date.now() - t0 < 150000 && !stepAbort) {
      const s = await snap();
      if (s.dead || s.hp >= s.maxHp * to) break;
      // an enemy that hits the character is fought back first; an aggroed one coming in (within 15 m) is taken as before
      const fb = await fightBackIfHit(60000);
      if (fb === 'died') break;
      if (fb !== 'clear') continue;
      const near = await nearestEnemy(null);
      if (near && near.aggro && near.d < 15) {
        await fight(near.id, 30000);
        await releaseAll();
      } else await sleep(400);
    }
  };
  /** One kill: approach the nearest target, fight it, loot. Walks to the game's own kill area (guide arrow, layout camp) when none is loaded. */
  const stepKill = async (d, ids, label) => {
    await restUp();
    const en = await pickTarget(ids);
    lastStep = { label, ids, how: en && en.d <= 110 ? 'nearest in-band ' + en.def + ' camp=' + en.camp + ' L' + en.level + ' d=' + Math.round(en.d) + 'm (campLock=' + campLock + ')' : 'no target within 110 m: guide arrow / layout camp' };
    if (!en || en.d > 110) {
      const g = await page.evaluate(async () => {
        const qm = await import('/src/ui/hud/questMarks.ts');
        return qm.guideTarget(null);
      });
      let tx = g && g.kind === 'kill' ? g : null;
      if (!tx) {
        // no arrow target: the nearest camp of these mobs in the world layout, like a player reading the map
        tx = await page.evaluate(async ([idl]) => {
          const G = window.G;
          const qm = await import('/src/ui/hud/questMarks.ts');
          const def = qm.worldDef();
          const ts = (await import('/src/types/dungeons.ts')).TILE_SIZE;
          const p = G.player.position;
          const L = G.character.level;
          const band = (pk) => !pk.levelRange || (pk.levelRange[1] >= L - 3 && pk.levelRange[0] <= L);
          let best = null;
          // the camps of the character's level band first; a camp of another band only when none of the band holds these mobs
          for (const inBand of [true, false]) {
            for (const pk of def?.packs ?? []) {
              if (inBand && !band(pk)) continue;
              if (!pk.members.some((m) => idl.includes(m.enemyId))) continue;
              const x = (pk.center[0] + 0.5) * ts;
              const z = (pk.center[1] + 0.5) * ts;
              const d = Math.hypot(x - p.x, z - p.z);
              const score = d + 150 * Math.max(0, (pk.levelRange?.[0] ?? 1) - L);
              if (!best || score < best.score) best = { x, z, score, id: pk.id };
            }
            if (best) break;
          }
          return best;
        }, [ids]);
        if (tx) X(`${label}: no ${ids.join('/')} loaded near the player and no objective arrow; walked to the layout camp ${tx.id}`);
      }
      if (!tx) { B(`${label}: no ${ids.join('/')} found near the player, the guide arrow or any layout camp`, curMain); return 'stuck'; }
      await walkTo(tx.x, tx.z, { stop: 14, timeout: 90000, label: 'kill area' });
      // no in-level mob alive at the camp: the game refreshes a camp only while no player is within radius + 30 m of its centre
      // (CampDirector.ts REFRESH_CLEAR_M), so waiting at the camp blocks its own respawn. Walk 40 m out (a navgrid-reachable
      // point), wait there; the next pass walks back when a member is up.
      const away = await waitPoint(tx, 40);
      if (away) await walkTo(away.x, away.z, { stop: 3, timeout: 60000, label: 'wait outside camp' });
      else B(`${label}: no navgrid point 40 m from ${tx.id ?? 'the kill area'}; waiting at the camp (its respawn is blocked while a player stands near)`);
      for (let i = 0; i < 300 && !stepAbort; i++) {
        // fight back while waiting at the camp: an enemy in reach that hits the character is fought first (no objective). A death on the way
        // here (walkTo returns at once when the character is dead) ends the wait too, not only a fight that found the death.
        const fb = await fightBackIfHit(60000);
        if (fb === 'died' || (await snap()).dead) {
          B(`${label}: the player died at the camp (lvl ${(await snap()).lvl})`);
          await handleDeath();
          return 'died';
        }
        if (fb === 'aborted') break;
        if (await pickTarget(ids)) break;
        if (fb === 'clear') await sleep(500);
      }
      return 'walked';
    }
    if (en.d > 20) await walkTo(en.x, en.z, { stop: 14, timeout: 30000, label: en.name ?? en.def });
    if (stepAbort) return 'aborted';
    const res = await fight(en.id, 45000, { def: en.def, level: en.level });
    if (res === 'aborted') return 'aborted';
    if (res === 'died') {
      const around = await page.evaluate(() => {
        const G = window.G;
        const p = G.player.position;
        return G.world.enemies.filter((e) => !e.isDead && Math.hypot(e.position.x - p.x, e.position.z - p.z) < 25).map((e) => `${e.def?.id}${e.level ? ' L' + e.level : ''}${e.aggroed ? '*' : ''}@${Math.round(Math.hypot(e.position.x - p.x, e.position.z - p.z))}`).join(' ');
      });
      B(`${label}: the player died while fighting ${en.def} (lvl ${(await snap()).lvl}); enemies within 25 m: ${around}`);
      await handleDeath();
      return 'died';
    }
    if (res === 'dead') {
      stats.kills++;
      console.log(`  kill ${en.def} (lvl ${(await snap()).lvl}, ${mins()} min)`);
      await sleep(500);
      await collectLoot();
      return 'killed';
    }
    B(`${label}: fight with ${en.def} timed out (enemy not dying / unreachable)`);
    await closePanels();
    return 'timeout';
  };

  // ---- objective steps: one step = one attempt at the first open objective ----
  const stepObjective = async (d) => {
    const rows = await progressRows(d.id);
    const k = rows.findIndex((r) => !r.done);
    if (k < 0) return 'nothing open';
    const o = d.objectives[k];
    const label = `${d.name} / ${o.kind}`;
    switch (o.kind) {
      case 'talk': {
        const ok = await talkNpc(o.target);
        if (ok) await sleep(500);
        await closePanels();
        return ok ? 'talked' : 'no dialog';
      }
      case 'explore': {
        const p = await placePos(o.target, d.id);
        if (!p) { B(`${label}: no position for "${o.target}"`, curMain); return 'stuck'; }
        await walkTo(p.x, p.z, { stop: 5, timeout: 150000, label: `${o.target}` });
        await sleep(1500);
        return 'explored';
      }
      case 'kill':
      case 'boss':
      case 'metin':
      case 'elite':
      case 'skill':
        return stepKill(d, [o.target], label);
      case 'drop':
        return stepKill(d, o.from ?? killTargetsOf(d), label);
      case 'collect':
        // collect hunts the mobs of its `from` list (QuestSystem.rollDrops); killTargetsOf is [] for a collect-only objective
        return stepKill(d, o.from ?? killTargetsOf(d), label);
      case 'interact':
      case 'use': {
        if (o.kind === 'use') {
          const have = await page.evaluate((it) => window.G.character.material(it), o.item);
          if (have < 1) { B(`${label}: the quest item ${o.item} is not in the bag`, curMain); return 'stuck'; }
        }
        const spot = await page.evaluate(async ([t, alt]) => {
          const QP = await import('/src/entities/interactables/QuestProp.ts');
          const p = window.G.player.position;
          let best = null;
          for (const e of window.G.world.entities.values()) {
            if (!(e instanceof QP.QuestProp) || e.target !== t || e.removed) continue;
            if ((e.propKind === 'altar') !== alt) continue;
            if (!alt && e.isEmpty()) continue;
            const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
            if (!best || d < best.d) best = { x: e.position.x, z: e.position.z, d };
          }
          return best;
        }, [o.target, o.kind === 'use']);
        if (!spot) {
          // not streamed in: walk to the region centre (props are placed in the quest's region)
          const p = await placePos(d.region ?? d.place, d.id);
          if (p) await walkTo(p.x, p.z, { stop: 8, timeout: 90000, label: 'prop area' });
          return 'walked to prop area';
        }
        // the nearest prop can be a few hundred metres away (a quest region is large): the walk budget follows the distance (~2.5 m/s)
        if (spot.d > 1.8) await walkTo(spot.x, spot.z, { stop: 1.6, timeout: Math.max(60000, Math.round(spot.d * 400)), label: o.target });
        await tap('KeyF');
        await sleep(600);
        return 'used prop';
      }
      case 'escort': {
        const e0 = await page.evaluate(async () => {
          const E = await import('/src/entities/interactables/EscortNpc.ts');
          const p = window.G.player.position;
          let best = null;
          for (const e of window.G.world.entities.values()) {
            if (!(e instanceof E.EscortNpc) || !e.canInteract(window.G.player)) continue; // the escort of the active quest only (decoys of locked quests share the name)
            const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
            if (!best || d < best.d) best = { x: e.position.x, z: e.position.z, d };
          }
          return best;
        });
        if (!e0) {
          const p = await placePos(d.region ?? d.place, d.id);
          if (p) await walkTo(p.x, p.z, { stop: 8, timeout: 120000, label: 'escort area' });
          return 'walked to escort area';
        }
        await walkTo(e0.x, e0.z, { stop: 2.5, timeout: 90000, label: 'escort NPC' });
        await tap('KeyF'); // F starts the walk
        await sleep(500);
        // follow it for up to 90 s: walk to the escort, fight what attacks it. The ambush (the game's trigger waypoints) is not
        // always a kill objective of the quest: with no kill target, any aggro mob within 15 m is an ambusher. The escort's
        // protection timer pauses while ambushers are alive, so an ambush that is never fought stalls the objective for good.
        const killIds = killTargetsOf(d);
        const t0 = Date.now();
        while (Date.now() - t0 < 90000 && !stepAbort && !(await progressRows(d.id))[k]?.done) {
          // fight back first: an enemy in reach that hits the character (the ambush pulls below follow)
          const fb = await fightBackIfHit(60000);
          if (fb === 'died' || fb === 'aborted') break;
          if (fb !== 'clear') continue;
          const pool = await aliveEnemies(killIds.length ? killIds : null);
          const en = pool.find((e) => e.d < 15 && (killIds.length || e.aggro));
          if (en) { await fight(en.id, 30000, { def: en.def, level: en.level }); continue; }
          const ee = await page.evaluate(async () => {
            const E = await import('/src/entities/interactables/EscortNpc.ts');
            const p = window.G.player.position;
            let best = null;
            for (const e of window.G.world.entities.values()) {
              if (!(e instanceof E.EscortNpc) || !e.canInteract(window.G.player)) continue; // the escort of the active quest only (decoys of locked quests share the name)
              const dd = Math.hypot(e.position.x - p.x, e.position.z - p.z);
              if (!best || dd < best.d) best = { x: e.position.x, z: e.position.z, d: dd };
            }
            return best;
          });
          if (ee) await walkTo(ee.x, ee.z, { stop: 6, timeout: 6000, label: 'escort follow' });
          else await sleep(500);
        }
        return 'escorted';
      }
      default:
        B(`${label}: no handler for the "${o.kind}" objective (${o.text})`, curMain);
        return 'unsupported';
    }
  };

  // ---- accept / turn in, at the NPCs the game data names ----
  const acceptAt = async (d) => {
    for (let i = 0; i < 2; i++) {
      if (!(await talkNpc(d.giver))) continue;
      const btn = page.locator('.pg-dlg-q', { hasText: d.name }).first().locator('button:has-text("Görevi Kabul Et")');
      if ((await btn.count()) > 0) { await btn.click(); await sleep(600); }
      await closePanels();
      if ((await qState(d.id)) === 'active') break;
    }
    const st = await qState(d.id);
    C(`accepted "${d.name}" from ${d.giver}`, st === 'active', st);
    if (st === 'active') chainLog.push({ min: mins(), lvl: (await snap()).lvl, ev: 'accepted', quest: d.name });
    return st === 'active';
  };
  /** Turn-in button of the quest card: "Teslim Et"; a reward-choice card takes its first item. Returns 'Teslim Et' | 'reward choice' | null. */
  const turnInCard = async (d) => {
    const card = page.locator('.pg-dlg-q', { hasText: d.name }).first();
    const btn = card.locator('button:has-text("Teslim Et")');
    if ((await btn.count()) > 0) { await btn.click(); return 'Teslim Et'; }
    const choice = card.locator('.pg-ql-acts button').first();
    if ((await choice.count()) > 0) {
      const txt = await card.innerText().catch(() => '');
      C(`${d.name}: reward-choice card says "Bir ödül seç"`, /Bir ödül seç/.test(txt), txt.slice(0, 60).replace(/\n/g, ' | '));
      await shot('reward_choice');
      await choice.click();
      // the card preselects the upgrade; 'Ödülü al' confirms the pick and turns the quest in
      const take = card.locator('button:has-text("Ödülü al")');
      if ((await take.count()) > 0) await take.first().click();
      return 'reward choice';
    }
    return null;
  };
  const bagCount = () => page.evaluate(() => window.G.character.allItems().filter((x) => x.loc.where === 'bag').length);
  const turnInAt = async (d) => {
    const npc = d.turnIn ?? d.giver;
    let how = null;
    const bagBefore = await bagCount();
    for (let i = 0; i < 2 && !how; i++) {
      if (!(await talkNpc(npc))) continue;
      how = await turnInCard(d);
      await sleep(900);
    }
    const st = await qState(d.id);
    C(`turned in "${d.name}" to ${npc}`, st === 'done', st);
    if (st === 'done') {
      stats.questsDone++;
      chainLog.push({ min: mins(), lvl: (await snap()).lvl, ev: 'turned in', quest: d.name });
    }
    if (how === 'reward choice') {
      const bagAfter = await bagCount();
      C(`${d.name}: the chosen reward item landed in the bags`, bagAfter > bagBefore, `bag ${bagBefore}->${bagAfter}`);
    }
    await closePanels();
    return st === 'done';
  };

  // ---- watchdog helpers ----
  /** A promise that resolves to `fallback` after `ms` when the page does not answer (a frozen game must not freeze the bot). */
  const withTimeout = (p, ms, fallback = null) => Promise.race([p.catch(() => fallback), sleep(ms).then(() => fallback)]);
  const wdSnap = async () => {
    const s = await snap();
    const qs = curQuest ? await qState(curQuest).catch(() => null) : null;
    const rows = curQuest ? await progressRows(curQuest).catch(() => []) : [];
    return { ...s, qk: `${qs}|${rows.map((r) => `${r.have}/${r.need}`).join(' ')}`, kills: stats.kills, qdone: stats.questsDone };
  };
  /** Watchdog fire: BLOCKER with the state dump (json file) and a screenshot. */
  const wdDump = async (s) => {
    if (curQuest) wdFiresBy.set(curQuest, (wdFiresBy.get(curQuest) ?? 0) + 1);
    const n = wdFires;
    const ev = (f, ms = 4000) => withTimeout(f(), ms, null);
    const dump = {
      cls, fire: n, atMin: mins(), step: wdLabel, quest: curQuest,
      questState: curQuest ? await ev(() => qState(curQuest)) : null,
      questProgress: curQuest ? await ev(() => progressRows(curQuest)) : null,
      lastKillStep: lastStep, walk: wdWalk,
      player: s ? { scene: s.scene, x: +s.x.toFixed(1), z: +s.z.toFixed(1), yaw: +s.yaw.toFixed(2), hp: s.hp, maxHp: s.maxHp, lvl: s.lvl, xp: s.xp, dead: s.dead } : { note: 'page did not answer (evaluate timed out)', lastMove: wdAnchor },
      distToWalkTarget: s && wdWalk ? Math.round(Math.hypot(wdWalk.x - s.x, wdWalk.z - s.z)) : null,
      nearbyMobs: await ev(() => aliveEnemies(null).then((a) => a.slice(0, 8).map((e) => ({ def: e.def, L: e.level, d: Math.round(e.d), aggro: e.aggro, camp: e.camp })))),
      topPanel: s?.top ?? null, wantsCursor: s?.wantsCursor ?? null, keysHeld: [...held],
      lastErrors: errors.slice(-5),
    };
    const jsonPath = path.join(OUT, `fh_${cls}_watchdog_${n}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(dump, null, 1));
    await ev(() => page.screenshot({ path: path.join(OUT, `fh_${cls}_watchdog_${n}.png`), timeout: 8000 }), 10000);
    const p = dump.player;
    B(`WATCHDOG: no progress for ${WD_MS / 1000} s in "${wdLabel}" (fire ${n}): pos ${p.x ?? '?'},${p.z ?? '?'} HP ${p.hp ?? '?'}/${p.maxHp ?? '?'}, `
      + `target ${wdWalk?.label ?? '-'} ${dump.distToWalkTarget ?? '?'} m, quest ${dump.questState ?? '-'}, top panel ${dump.topPanel ?? '-'}, `
      + `nearest ${(dump.nearbyMobs ?? []).slice(0, 2).map((e) => `${e.def} L${e.L} ${e.d}m`).join(' / ') || 'none'}; dump fh_${cls}_watchdog_${n}.json; step aborted`);
  };
  /** Runs once a second while the chain runs: progress resets the window, a full window without progress fires the watchdog. */
  const wdTick = async () => {
    if (wdBusy) return;
    wdBusy = true;
    try {
      const now = Date.now();
      const s = await withTimeout(wdSnap(), 4000, null);
      let progress = false;
      if (s) {
        const moved = Math.hypot(s.x - wdAnchor.x, s.z - wdAnchor.z);
        const prev = wdLast ?? {};
        progress = wdLast === null || prev.lvl !== s.lvl || prev.xp !== s.xp || prev.kills !== s.kills || prev.qdone !== s.qdone
          || prev.qk !== s.qk || s.hp > (prev.hp ?? s.hp) || moved > 5;
        wdLast = { lvl: s.lvl, xp: s.xp, kills: s.kills, qdone: s.qdone, qk: s.qk, hp: s.hp };
        if (progress) wdAnchor = { t: now, x: s.x, z: s.z };
      }
      if (progress || now - wdAnchor.t < WD_MS) return;
      wdFires++;
      wdAnchor = { t: now, x: s?.x ?? wdAnchor.x, z: s?.z ?? wdAnchor.z };
      stepAbort = true;
      await wdDump(s);
    } finally {
      wdBusy = false;
    }
  };
  /** Per-class summary, written once: on the normal end, the time cap, the step cap, and on an exception (from the finally below). */
  const writeJson = async (endStr) => {
    if (written) return summary;
    written = true;
    const fin = await withTimeout(snap(), 8000, null);
    const fmed = (a) => {
      if (!a.length) return null;
      const b = [...a].sort((x, y) => x - y);
      const m = b.length >> 1;
      return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
    };
    const won = fightLog.filter((f) => f.res === 'dead');
    summary = {
      cls, checks: results.length - checksAtStart, failed: results.slice(checksAtStart).filter((r) => !r.ok).length,
      deaths: stats.deaths, teleports: stats.teleports, kills: stats.kills, questsDone: stats.questsDone, watchdogFires: wdFires,
      levelMin, levelUps, end: endStr || end, chain: chainLog,
      fights: fightLog, medianTtk: fmed(won.map((f) => f.ttk)), medianHpLeft: fmed(won.map((f) => f.hpLeft).filter((v) => v != null)),
      rests: restCount, healCasts, fightBacks: stats.fightBacks, detours: stats.detours,
      end_level: fin?.lvl ?? null,
    };
    fs.writeFileSync(path.join(OUT, `fh_${cls}.json`), JSON.stringify(summary, null, 2));
    return summary;
  };

  try {
    // =============================================================== 1. menu
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90000 });
    await page.waitForFunction(() => window.G?.scenes?.current?.id === 'menu', null, { timeout: 120000 });
    await sleep(1800);
    await shot('menu');
    const menuTitle = await page.evaluate(() => document.querySelector('.efs-title h1')?.textContent ?? '');
    C('main menu shows the title', /EFSUN/i.test(menuTitle), menuTitle);
    await page.click('button:has-text("Yeni Karakter")');
    await sleep(1200);
    // the card text of this class comes from the game (classInfo.ts classPresentation / CLASS_ORDER), not from a list here
    const card = await page.evaluate(async (id) => {
      const ci = await import('/src/ui/menu/classInfo.ts');
      return { label: ci.classPresentation(id).name, all: ci.CLASS_ORDER.map((c) => ci.classPresentation(c).name) };
    }, cls);
    const cards = await page.evaluate(() => [...document.querySelectorAll('.efs-class .nm')].map((e) => e.textContent));
    const missing = card.all.filter((n) => !cards.includes(n));
    C('creation screen lists every class card', missing.length === 0, missing.length ? `missing: ${missing.join(',')}` : `${card.all.length} classes`);
    C(`class card "${card.label}" exists`, cards.includes(card.label), cls);
    await page.click(`.efs-class:has-text("${card.label.replace(/"/g, '')}")`);
    await sleep(900);
    await shot('create');
    const createBtn = page.locator('button:has-text("Oluştur")');
    const cb = await createBtn.boundingBox();
    if (!cb || cb.y + cb.height > VH + 1 || cb.y < 0) X(`Oluştur button is outside the ${VW}x${VH} viewport (y=${cb ? Math.round(cb.y) : '?'}): the creation panel is taller than the screen`);
    await page.fill('.efs-input', charName(cls));
    await sleep(200);
    await createBtn.click();
    await sleep(2200);
    const created = await page.evaluate(() => [...document.querySelectorAll('.efs-char .nm')].map((e) => e.textContent));
    C('character appears in the list after Oluştur', created.includes(charName(cls)), created.join(','));
    await shot('created');
    await page.click('button:has-text("Oyna")');
    await waitScene('town');
    await sleep(2500);
    T0 = Date.now();
    const s0 = await snap();
    C('entered the first town as level 1', s0.scene === 'town' && s0.lvl === 1, `scene=${s0.scene} lvl=${s0.lvl}`);
    const gotCls = await page.evaluate(() => window.G.character.save.classId);
    C('character class is ' + cls, gotCls === cls, gotCls);
    // barks (systems/Barks.ts): every bark also writes a 'Söylenti' (rumor) line into the chat; count the lines added from now on
    await page.evaluate(() => {
      window.__barks = 0;
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.classList?.contains('rumor') || n.querySelector?.('.rumor'))) window.__barks++;
      }).observe(document.body, { childList: true, subtree: true });
    });
    // melee or caster, read from the game's own auto-attack mode of this character (SkillSystem.autoInfo: the basic step's range)
    melee = (await page.evaluate(() => window.G.skills.autoInfo(window.G.player).mode)) === 'melee';
    console.log(`  [${cls}] auto-attack mode: ${melee ? 'melee' : 'ranged/off'}`);
    await page.evaluate(() => window.G.events.on('player:levelup', ({ level }) => window.__fhLevelUp(level)));
    // fight back (page side): the damage events that hit the character, by source (fight-back.mjs)
    await page.evaluate(installHitTracker);
    // death recorder (page side): the game's death:recap snapshot, and a 4 Hz sample of HP / resource / position for the last 10 s
    await page.evaluate(() => {
      const G = window.G;
      window.__fhRecap = null;
      G.events.on('death:recap', (r) => { window.__fhRecap = r; });
      window.__fhHist = [];
      setInterval(() => {
        const p = window.G?.player;
        if (!p) return;
        window.__fhHist.push({ hp: p.hp, maxHp: p.maxHp, res: p.resource, maxRes: p.maxResource, resType: p.resourceType, pos: { x: p.position.x, z: p.position.z } });
        if (window.__fhHist.length > 40) window.__fhHist.shift();
      }, 250);
    });

    // =============================================================== 2. welcome card
    await page.waitForFunction(() => window.G.ui.isPanelOpen('welcome'), null, { timeout: 15000 }).catch(() => {});
    const welcomeOpen = await page.evaluate(() => window.G.ui.isPanelOpen('welcome'));
    C('welcome card opens on first login', welcomeOpen);
    await shot('welcome');
    if (welcomeOpen) {
      await page.click('button:has-text("BAŞLA")');
      await sleep(600);
    }
    C('welcome card closed by BAŞLA', !(await page.evaluate(() => window.G.ui.isPanelOpen('welcome'))));
    await sampleFps('town spawn');
    keys = await loadKeys();
    console.log(`  keys: skills ${keys.skills.map((s) => `${s.slot}=${s.key}`).join(' ')} interrupt=${keys.interrupt ? keys.interrupt.slot + '=' + keys.interrupt.key : 'none'} potion=${keys.potionHp}`);

    // =============================================================== 3. the chain, followed from the game's guide
    const LEVEL_TARGET = TO_LEVEL;
    const fails = {};
    let steps = 0;
    let worldSeen = false;
    wdAnchor = { t: Date.now(), x: 0, z: 0 };
    wdTimer = setInterval(() => {
      wdTick().catch(() => {});
      // the class time cap is also checked inside a step: the step in flight returns at once (its wait loops check stepAbort), and when
      // it has not returned 30 s later the summary is written from here, so a capped class always leaves its JSON behind
      if (!capAt && (Date.now() - T0) / 60000 > MAX_MIN) { capAt = Date.now(); stepAbort = true; }
      if (capAt && !written && Date.now() - capAt > 30000) writeJson(`time budget ${MAX_MIN} min (step did not return)`).catch(() => {});
    }, 1000);
    /** Drops a side quest (BLOCKER, not HARD): G.quests.abandon for an active / ready one, an available one is only never taken again. */
    const dropSide = async (d, state, why) => {
      const left = await page.evaluate((qid) => {
        const st = window.G.quests.state(qid);
        if (st === 'active' || st === 'ready') window.G.quests.abandon(qid);
        return window.G.quests.state(qid);
      }, d.id);
      abandoned.add(d.id);
      B(`side quest "${d.name}" dropped ${why} (was "${state}", now "${left}"); the bot never takes it again; the chain goes on`);
      wdAnchor = { t: Date.now(), x: wdAnchor.x, z: wdAnchor.z };
    };
    while (true) {
      steps++;
      stepAbort = false;
      const s = await snap();
      if (s.lvl >= LEVEL_TARGET) { end = `level ${s.lvl} at ${mins()} min`; break; }
      if ((Date.now() - T0) / 60000 > MAX_MIN) { end = `time budget ${MAX_MIN} min (level ${s.lvl})`; break; }
      if (steps > 700) { end = `step cap (level ${s.lvl})`; break; }
      if (s.dead) { B(`dead at level ${s.lvl} (${mins()} min)`); await handleDeath(); continue; }
      if (s.scene === 'dungeon' && !worldSeen) {
        worldSeen = true;
        await sleep(3000);
        await shot('world_arrive');
        await sampleFps('sisli vadi spawn');
        C('arrived in the open world', true, `at ${mins()} min`);
      }
      const rec = await recommendedNow();
      if (!rec) { B(`the guide recommends no quest at level ${s.lvl} (${mins()} min): the chain ends or has a gap`, true); end = 'no recommendation'; break; }
      const d = await questDef(rec.id);
      if (!d) { B(`recommended quest ${rec.id} has no definition`, true); end = 'no definition'; break; }
      // side quests first: two watchdog fires on a side quest (in any state: accept walk, active, turn-in walk) drop it and the chain
      // goes on (BLOCKER for the report, never HARD). The HARD block below is for main-chain steps only.
      if (!d.main && (wdFiresBy.get(d.id) ?? 0) >= 2 && !abandoned.has(d.id)) {
        await dropSide(d, rec.state, `after ${wdFiresBy.get(d.id)} watchdog fires`);
        continue;
      }
      const failKey = `${d.id}:${rec.state}`;
      curQuest = d.id;
      curMain = !!d.main;
      wdLabel = `${d.name} / ${rec.state}`;
      let ok = true;
      try {
        if (rec.state === 'available') {
          ok = await acceptAt(d);
        } else if (rec.state === 'ready') {
          ok = await turnInAt(d);
        } else {
          const before = await progressKey(d.id);
          const r = await stepObjective(d);
          if (r === 'unsupported' || r === 'stuck') {
            if (d.main) { end = `chain stuck on "${d.name}" (${r})`; break; }
            await dropSide(d, rec.state, `(${r})`);
            continue;
          }
          const after = await progressKey(d.id);
          // a kill or a walk is progress of its own: a drop has a chance per kill, and a walk to a far target changes no counter
          const moved = (['killed', 'walked', 'walked to prop area', 'walked to escort area', 'escorted'].includes(r));
          ok = moved || after !== before || (await qState(d.id)) !== 'active';
          // a step the watchdog aborted counts as progress only when the quest itself moved on
          if (stepAbort) ok = after !== before || (await qState(d.id)) !== 'active';
        }
      } catch (e) {
        B(`step on "${d.name}" threw: ${String(e?.message ?? e).slice(0, 160)}`, true);
        end = 'exception';
        break;
      }
      if (!ok) {
        fails[failKey] = (fails[failKey] ?? 0) + 1;
        if (fails[failKey] >= 4) {
          if (!d.main) { await dropSide(d, rec.state, `after ${fails[failKey]} steps without progress`); fails[failKey] = 0; continue; }
          const rows = (await progressRows(d.id)).map((r) => `${r.text}: ${r.have}/${r.need}`).join(' | ');
          B(`chain stuck: "${d.name}" (${rec.state}) makes no progress after 4 steps [${rows}]`, true);
          end = `stuck on "${d.name}"`;
          break;
        }
      }
    }
    clearInterval(wdTimer);
    wdTimer = null;
    console.log(`  chain end: ${end}`);
    for (const c of chainLog) console.log(`  CHAIN ${c.min} min L${c.lvl} ${c.ev} ${c.quest}`);
    await shot('chain_end');

    // level checks (the time each level was reached is in the summary table)
    for (let n = 2; n <= LEVEL_TARGET; n++) {
      C(`reached level ${n}`, levelMin[n] != null, levelMin[n] != null ? `at ${levelMin[n]} min` : `not reached (${end})`);
    }

    // =============================================================== 4. equipment
    await closePanels();
    const eq = await page.evaluate(() => {
      const ch = window.G.character;
      const bag = ch.allItems().filter((x) => x.loc.where === 'bag');
      const cand = bag.filter((x) => ch.canEquip(x.item).ok).map((x) => ({ uid: x.item.uid, name: x.item.baseId, idx: x.loc.index, slot: ch.pickSlot(x.item), cur: !!ch.getEquipped(ch.pickSlot(x.item)) }));
      return { bagCount: bag.length, cand };
    });
    console.log('  equipment state', JSON.stringify(eq));
    if (eq.cand.length) {
      await tap('KeyB');
      await sleep(700);
      C('B opens the inventory', await page.evaluate(() => window.G.ui.isPanelOpen('inventory')));
      const pick = eq.cand.find((c) => !c.cur) ?? eq.cand[0];
      const slotsInfo = await page.evaluate(() => [...document.querySelectorAll('.pi-slot:not(.empty)')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.width > 0 }; }));
      for (const sl of slotsInfo.filter((x) => x.vis)) {
        await page.mouse.click(sl.x, sl.y, { button: 'right' });
        await sleep(250);
        const now = await page.evaluate((slot) => window.G.character.getEquipped(slot)?.uid ?? null, pick.slot);
        if (now === pick.uid) break;
      }
      const nowUid = await page.evaluate((slot) => window.G.character.getEquipped(slot)?.uid ?? null, pick.slot);
      C(`a bag item equipped (${pick.name} -> ${pick.slot})`, nowUid === pick.uid, `now=${nowUid}`);
      await shot('equipped');
      await closePanels();
    } else X('no equippable item in the bag at the end of the chain');

    // =============================================================== 5. panels
    const PANELS = [['KeyB', 'inventory', 'B Çanta'], ['KeyC', 'character', 'C Karakter'], ['KeyN', 'talents', 'N Yetenek Ağacı'], ['KeyM', 'map', 'M Harita'], ['KeyK', 'skills', 'K Yetenek Kitabı'], ['KeyL', 'questlog', 'L Görev Defteri']];
    for (const [key, id, name] of PANELS) {
      await closePanels();
      await tap(key);
      await sleep(1000);
      const open = await page.evaluate((pid) => window.G.ui.isPanelOpen(pid), id);
      C(`${name} panel opens with its hotkey`, open);
      if (open) {
        await noteTextIssues(name);
        const r = await page.evaluate((pid) => {
          const rec = window.G.ui.panels?.get?.(pid);
          const el = rec?.host ?? null;
          const b = el?.firstElementChild?.getBoundingClientRect?.() ?? el?.getBoundingClientRect?.();
          return b ? { x: b.x, y: b.y, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight } : null;
        }, id);
        if (r && (r.x < -12 || r.y < -12 || r.x + r.w > r.vw + 12 || r.y + r.h > r.vh + 12)) X(`${name} panel exceeds the ${r.vw}x${r.vh} viewport (${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)})`);
      }
    }
    await closePanels();
    await sampleFps('end');

    // =============================================================== 6. report
    const fpsMin = Math.min(...fpsSamples.map((f) => f.fps));
    console.log(`  FPS samples: ${fpsSamples.map((f) => `${f.where}=${f.fps}`).join(', ')}`);
    const barks = await page.evaluate(() => window.__barks ?? 0);
    C('at least one bark (Söylenti line) during the run', barks >= 1, `${barks} bark line(s)`);
    C('FPS >= 30 in every sample', fpsMin >= 30, `min ${fpsMin}`);
    C('no console / page errors', errors.length === 0, errors.slice(0, 4).join(' || '));
    for (const e of errors) console.log('   ERR', e);
    const fin = await snap();
    console.log(`  final: lvl ${fin.lvl} xp ${fin.xp} gold ${fin.gold} kills ${stats.kills} deaths ${stats.deaths} teleports ${stats.teleports}`);
    await writeJson(end);
  } catch (e) {
    excMsg = String(e?.stack ?? e).slice(0, 300);
    throw e;
  } finally {
    if (wdTimer) clearInterval(wdTimer);
    if (!written) await writeJson(`exception: ${excMsg || 'unknown'}`);
    await ctx.close().catch(() => {});
  }
  return summary;
}
