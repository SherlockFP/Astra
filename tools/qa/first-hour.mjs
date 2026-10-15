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
//   4. a quest whose open objective does not change for 4 steps is a HARD blocker (the chain is stuck) and ends the journey.
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
// then the nearest mob within level lvl-3..lvl+2. Fights 1 and 5 of each class get a screenshot ~3 s in (combat_f<n>); every fight is logged
// in tools/qa/out/fh_<class>.json (fights: ttk, hpLeft); the end prints one CLASS line per class (deaths, kills, median TTK / HP left, L2-L4).
// Environment note: when node_modules is a junction to another checkout, Vite answers 403 for the @fontsource files; that is noise.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveClassList } from './classes.mjs';

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
  console.log(`CLASS ${s.cls}: deaths ${s.deaths}, kills ${s.kills}, median TTK ${fmtN(s.medianTtk, 's')}, median HP left ${fmtN(s.medianHpLeft, '%')}, L2 ${lvT(2, s)}, L3 ${lvT(3, s)}, L4 ${lvT(4, s)}`);
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
  let T0 = 0; // wall clock when the character entered the world
  const mins = (t = Date.now()) => ((t - T0) / 60000).toFixed(1);
  const levelUps = []; // {level, min}
  const levelMin = {};
  const chainLog = [];
  const stats = { deaths: 0, teleports: 0, kills: 0, questsDone: 0 };
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
  /** Static quest data the steps need (from G.quests, no ids written here). */
  const questDef = (id) =>
    page.evaluate((qid) => {
      const d = window.G.quests.def(qid);
      if (!d) return null;
      return {
        id: d.id, name: d.name, level: d.level, giver: d.giver, turnIn: d.turnIn ?? null, bonus: !!d.bonus, region: d.region ?? null, place: d.place ?? null,
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

  /**
   * Walk to (tx, tz) with W + turn arrows. `stop` = distance at which to stop (m). Returns { ok, teleported, dist }.
   * The path comes from the game's navgrid (waypoints only); unreachable / stuck -> BLOCKER + dev teleport.
   */
  const walkTo = async (tx, tz, o = {}) => {
    const stop = o.stop ?? 2.5;
    const timeout = o.timeout ?? 90000;
    const label = o.label ?? `(${tx.toFixed(0)},${tz.toFixed(0)})`;
    const t0 = Date.now();
    if (turnLeftIncreasesYaw === null) await calibrateTurn();
    const findPath = () => page.evaluate(([x, z]) => {
      const G = window.G;
      const pts = G.world.nav.findPath({ x: G.player.position.x, z: G.player.position.z }, { x, z }, 60000);
      return pts ? pts.map((v) => [v.x, v.z]) : null;
    }, [tx, tz]);
    let path = await findPath();
    if (!path) {
      B(`no navgrid path to ${label}; trying a straight line`);
      path = [[tx, tz]];
    }
    let wpI = 0;
    let lastPos = await snap();
    let lastCheck = Date.now();
    let stuckN = 0;
    while (Date.now() - t0 < timeout) {
      const s = await snap();
      if (s.dead) { await releaseAll(); return { ok: false, dead: true, dist: dev(s, { x: tx, z: tz }) }; }
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
            const np = await findPath();
            if (np) { path = np; wpI = 0; }
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
    B(`walk to ${label} timed out (${Math.round(dev(s, { x: tx, z: tz }))} m left)`);
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
      if (g && g.kind === 'talk') {
        await walkTo(g.x, g.z, { stop: 1.5, timeout: 150000, label: g.label });
        await waitScene('dungeon', 60000).catch(() => {});
        await sleep(2500);
        p = await npcPos(npcId);
      }
    }
    if (!p) { B(`NPC ${npcId} has no position (not streamed in, no data position)`, true); return false; }
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
  /**
   * The next pull, one camp at a time: the camp being fought stays the target while one of its members lives within 40 m; otherwise the
   * nearest in-band camp (mob level lvl-3..lvl+2), else the nearest mob of any level.
   */
  let campLock = null;
  const pickTarget = async (ids) => {
    const all = await aliveEnemies(ids);
    if (!all.length) return null;
    const lvl = (await snap()).lvl;
    const locked = campLock ? all.filter((e) => e.camp === campLock && e.d <= 40) : [];
    if (locked.length) return locked[0];
    const band = all.filter((e) => e.level >= lvl - 3 && e.level <= lvl + 2);
    const pick = (band.length ? band : all)[0];
    campLock = pick.camp;
    return pick;
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
  const handleDeath = async () => {
    stats.deaths++;
    await sleep(1500);
    await shot('death');
    const respawn = page.locator('button:has-text("Ruhunu Serbest")').first();
    if ((await respawn.count()) > 0) await respawn.click().catch(() => {});
    else B('death panel has no "Ruhunu Serbest Bırak" button', true);
    for (let i = 0; i < 12 && (await snap()).dead; i++) await sleep(500);
    await sleep(1500);
    const s = await snap();
    if (s.dead) B('player stays dead after "Ruhunu Serbest Bırak"', true);
    await closePanels();
  };

  /** Fight one enemy with real input: steer + approach, right-click target + auto-attack, bar skills, heal below 50%, potion below 35%, interrupt casts. */
  let skillIx = 0;
  let healIx = 0;
  let fightSeq = 0; // fights of this class; fights 1 and 5 get a mid-combat screenshot at ~3 s
  let healCasts = 0;
  let restCount = 0;
  const fightLog = []; // {n, def, level, res: dead | died | timeout, ttk (s), hpLeft (%)}
  const fight = async (enemyId, maxMs = 45000, meta = {}) => {
    if (!keys) keys = await loadKeys();
    const n = ++fightSeq;
    const t0 = Date.now();
    const rec = (res, st) => fightLog.push({ n, def: meta.def ?? null, level: meta.level ?? null, res, ttk: +((Date.now() - t0) / 1000).toFixed(1), hpLeft: st ? Math.round((100 * st.pHp) / Math.max(1, st.pMax)) : null });
    let lastSkill = 0;
    let lastClick = 0;
    let lastKick = 0;
    let lastHeal = 0;
    let potionAt = 0;
    let shotDone = false;
    while (Date.now() - t0 < maxMs) {
      const s = await enemyState(enemyId);
      if (s.pDead) { await releaseAll(); rec('died', s); return 'died'; }
      if (!s.alive) { await releaseAll(); rec('dead', s); return 'dead'; }
      if (!shotDone && (n === 1 || n === 5) && Date.now() - t0 >= 3000) {
        shotDone = true;
        await shot(`combat_f${n}`);
      }
      // a casting target is closed in on for the interrupt (kick reach is short); otherwise the class's fight distance
      const kickNow = !!keys.interrupt && s.casting;
      const want = kickNow ? 2.5 : melee ? 2.2 : 13;
      const err = wrap(Math.atan2(s.x - s.px, s.z - s.pz) - s.pYaw);
      const mv = [];
      if (Math.abs(err) > 0.1) mv.push((err > 0) === turnLeftIncreasesYaw ? 'ArrowLeft' : 'ArrowRight');
      if (s.d > want && Math.abs(err) < 0.9) mv.push('KeyW');
      await setKeys(mv);
      const now = Date.now();
      // select + arm auto-attack with a real right click on the enemy (retry every 1.5 s while not selected)
      if (!s.selected && s.onScreen && s.d < 30 && now - lastClick > 1500) {
        lastClick = now;
        await page.mouse.click(s.sx, s.sy, { button: 'right' });
        await sleep(80);
        if (!(await enemyState(enemyId)).selected) await tap('Tab');
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
    rec('timeout', null);
    return 'timeout';
  };

  /** Before a pull: below 60% HP the character stands still (out-of-combat regen runs 5 s after the last hit; the game has no food) until 80%. Aggro that walks in is fought. */
  const restUp = async () => {
    const s0 = await snap();
    if (s0.dead || s0.hp >= s0.maxHp * 0.6) return;
    restCount++;
    await releaseAll();
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const s = await snap();
      if (s.dead || s.hp >= s.maxHp * 0.8) break;
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
          let best = null;
          for (const pk of def?.packs ?? []) {
            if (!pk.members.some((m) => idl.includes(m.enemyId))) continue;
            const x = (pk.center[0] + 0.5) * ts;
            const z = (pk.center[1] + 0.5) * ts;
            const d = Math.hypot(x - p.x, z - p.z);
            const score = d + 150 * Math.max(0, (pk.levelRange?.[0] ?? 1) - G.character.level);
            if (!best || score < best.score) best = { x, z, score, id: pk.id };
          }
          return best;
        }, [ids]);
        if (tx) X(`${label}: no ${ids.join('/')} loaded near the player and no objective arrow; walked to the layout camp ${tx.id}`);
      }
      if (!tx) { B(`${label}: no ${ids.join('/')} found near the player, the guide arrow or any layout camp`, true); return 'stuck'; }
      await walkTo(tx.x, tx.z, { stop: 14, timeout: 90000, label: 'kill area' });
      await sleep(1200);
      return 'walked';
    }
    if (en.d > 20) await walkTo(en.x, en.z, { stop: 14, timeout: 30000, label: en.name ?? en.def });
    const res = await fight(en.id, 45000, { def: en.def, level: en.level });
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
        if (!p) { B(`${label}: no position for "${o.target}"`, true); return 'stuck'; }
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
        return stepKill(d, killTargetsOf(d), label);
      case 'interact':
      case 'use': {
        if (o.kind === 'use') {
          const have = await page.evaluate((it) => window.G.character.material(it), o.item);
          if (have < 1) { B(`${label}: the quest item ${o.item} is not in the bag`, true); return 'stuck'; }
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
        if (spot.d > 1.8) await walkTo(spot.x, spot.z, { stop: 1.6, timeout: 60000, label: o.target });
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
            if (!(e instanceof E.EscortNpc)) continue;
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
        // follow it for up to 90 s: walk to the escort, fight what attacks it
        const killIds = killTargetsOf(d);
        const t0 = Date.now();
        while (Date.now() - t0 < 90000 && !(await progressRows(d.id))[k]?.done) {
          const en = await nearestEnemy(killIds);
          if (en && en.d < 15) { await fight(en.id, 30000); continue; }
          const ee = await page.evaluate(async () => {
            const E = await import('/src/entities/interactables/EscortNpc.ts');
            const p = window.G.player.position;
            let best = null;
            for (const e of window.G.world.entities.values()) {
              if (!(e instanceof E.EscortNpc)) continue;
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
        B(`${label}: no handler for the "${o.kind}" objective (${o.text})`, true);
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
  let end = '';
  while (true) {
    steps++;
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
    const rec = await recommended();
    if (!rec) { B(`the guide recommends no quest at level ${s.lvl} (${mins()} min): the chain ends or has a gap`, true); end = 'no recommendation'; break; }
    const d = await questDef(rec.id);
    if (!d) { B(`recommended quest ${rec.id} has no definition`, true); end = 'no definition'; break; }
    const failKey = `${d.id}:${rec.state}`;
    let ok = true;
    try {
      if (rec.state === 'available') {
        ok = await acceptAt(d);
      } else if (rec.state === 'ready') {
        ok = await turnInAt(d);
      } else {
        const before = await progressKey(d.id);
        const r = await stepObjective(d);
        if (r === 'unsupported' || r === 'stuck') { end = `chain stuck on "${d.name}" (${r})`; break; }
        const after = await progressKey(d.id);
        // a kill or a walk is progress of its own: a drop has a chance per kill, and a walk to a far target changes no counter
        const moved = (['killed', 'walked', 'walked to prop area', 'walked to escort area', 'escorted'].includes(r));
        ok = moved || after !== before || (await qState(d.id)) !== 'active';
      }
    } catch (e) {
      B(`step on "${d.name}" threw: ${String(e?.message ?? e).slice(0, 160)}`, true);
      end = 'exception';
      break;
    }
    if (!ok) {
      fails[failKey] = (fails[failKey] ?? 0) + 1;
      if (fails[failKey] >= 4) {
        const rows = (await progressRows(d.id)).map((r) => `${r.text}: ${r.have}/${r.need}`).join(' | ');
        B(`chain stuck: "${d.name}" (${rec.state}) makes no progress after 4 steps [${rows}]`, true);
        end = `stuck on "${d.name}"`;
        break;
      }
    }
  }
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
  const med = (a) => {
    if (!a.length) return null;
    const b = [...a].sort((x, y) => x - y);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  const won = fightLog.filter((f) => f.res === 'dead');
  const summary = {
    cls, checks: results.length - checksAtStart, failed: results.slice(checksAtStart).filter((r) => !r.ok).length,
    deaths: stats.deaths, teleports: stats.teleports, kills: stats.kills, questsDone: stats.questsDone,
    levelMin, levelUps, end, chain: chainLog,
    fights: fightLog, medianTtk: med(won.map((f) => f.ttk)), medianHpLeft: med(won.map((f) => f.hpLeft).filter((v) => v != null)),
    rests: restCount, healCasts,
    end_level: fin.lvl,
  };
  fs.writeFileSync(path.join(OUT, `fh_${cls}.json`), JSON.stringify(summary, null, 2));
  await ctx.close();
  return summary;
}
