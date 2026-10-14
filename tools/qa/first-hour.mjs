// "New player first hour" playtest through the REAL entry (index.html -> main menu -> Yeni Karakter -> Oluştur -> Oyna).
//
// Journey per class (default knight, mage, paladin):
//   1  menu: Yeni Karakter, pick the class card, name, Oluştur, Oyna            (real DOM clicks)
//   2  town: welcome card (Hoş Geldin) -> BAŞLA; guide arrow points at Muhtar Cemal
//   3  walk to Muhtar Cemal with the keyboard (W + turn arrows, steered along the game's own navgrid path), F, "Görevi Kabul Et"
//   4  walk out of the Güney Kapısı into Sisli Vadi (the guide arrow targets the gate), walk to Gümüşdere / Muhtar Ferhat, F,
//      turn in "Kuzgun'un Çağrısı" ("Teslim Et")                                            => first quest turn-in
//   5  accept "Fare Yuvası" (kill 10 Orman Sıçanı): walk to the nearest rat, right-click it (target + auto-attack), skills 1-5,
//      pick up the loot (F), repeat until the objective is done, release the spirit when it dies, turn in => first kill quest, level 2
//      then "Balçık Temizliği" (kill 8 Yeşil Balçık, needs level 2)                                       => level 3
//   5b Sisli Vadi side chain: Balçık Avı (Ferhat): F on 4 crystal props (qo_crystal, the prop objective), 6 slimes, turn-in;
//      Muhtarın Haberi (Ferhat) -> talk to Avcı Yıldız (turn-in) -> Gözcü Avı (level 3, the ESCORT quest) accepted there
//      (the escort walk is not played; the check is that it starts)                                      => prop + escort starts
//   6  equip the first equipment drop / quest reward from the bag (right-click in the B panel)
//   7  open the B / C / N / M / K / L panels once each (real hotkeys), screenshot, close them
//   8  report: FPS samples, console / page errors, blockers, UX notes
//
// "Real" parts: menu DOM, hotkeys, WASD + turn keys, F interact, quest dialog buttons, right-click targeting, skill keys, panel
// hotkeys. Helpers that only READ state use window.G and dynamic imports of the game's own modules (questMarks.guideTarget = the
// objective arrow's target, PlayerController.localHardTargetId = the selected target). Walking uses G.world.nav.findPath only to
// choose waypoints; the keys do the moving. When walking makes no progress (strafe left / right + hop, re-path, then give up) the
// script records a BLOCKER and teleports via the documented dev hook `G.player.position.set(x, y, z)` so the rest of the journey is
// still exercised. When no enemy of a kill objective is loaded (the objective arrow hides) the script walks to the nearest layout camp
// of that mob, like a player reading the map, and records a UX note.
//
// Run (dev server of THIS checkout must be up; NOTE vite.config.ts ignores **/.claude/** in its watcher, so a dev server started in an
// agent worktree does NOT see edits made after it started: restart it after changing src/):
//   npx vite --port 5182 --strictPort
//   FH_URL=http://127.0.0.1:5182 MP_PW=<dir that has node_modules/playwright-core> node tools/qa/first-hour.mjs
// Env: FH_URL (default http://127.0.0.1:5182), MP_PW / QA_DIR (playwright-core dir, default ./tools/qa), MP_CHROME (chrome.exe),
//      FH_CLASSES=knight,mage,paladin (comma list of class ids; any of knight barbarian mage rogue paladin necromancer warlock),
//      FH_VIEW=1280x720 (viewport), FH_HEADED=1 (watch it). One class takes about 4-5 minutes.
// Output: screenshots in tools/qa/out/fh_<class>_<nn>_<label>.png (gitignored), then a SUMMARY with BLOCKERS and UX notes.
// Exit code 0 = every check passed for every class (journey milestones, no console / page errors, FPS >= 30 in every sample) and no
// HARD blocker was recorded. Plain BLOCKER lines (deaths, a stuck spot, ...) and UX notes are informational.
//
// Environment note: when node_modules is a junction to another checkout, Vite answers 403 for the @fontsource files (outside the
// workspace root). That is filtered as noise below; the game then falls back to system fonts.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.FH_URL ?? 'http://127.0.0.1:5182';
const PW_DIR = process.env.MP_PW ?? process.env.QA_DIR ?? HERE;
const CHROME = process.env.MP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CLASSES = (process.env.FH_CLASSES ?? 'knight,mage,paladin').split(',').map((s) => s.trim()).filter(Boolean);
const [VW, VH] = (process.env.FH_VIEW ?? '1280x720').split('x').map(Number);

const req = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'));
const pwMod = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = pwMod.chromium ?? pwMod.default.chromium;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASS_LABEL = { knight: 'Şövalye', barbarian: 'Barbar', mage: 'Büyücü', rogue: 'Haydut', paladin: 'Paladin', necromancer: 'Nekromant', warlock: 'Warlock', priest: 'Rahip', druid: 'Druid' };
const CLASS_NAME = { knight: 'Kaan', barbarian: 'Barkın', mage: 'Bilge', rogue: 'Ozan', paladin: 'Alper', necromancer: 'Nehir', warlock: 'Varlık', priest: 'Tanrı', druid: 'Orman' };
const MELEE = new Set(['knight', 'barbarian', 'rogue', 'paladin', 'druid']);
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

for (const cls of CLASSES) {
  try {
    await journey(cls);
  } catch (e) {
    check(`[${cls}] journey finished without exception`, false, `navigations=${NAVS} (>1 means the page reloaded mid-journey) ` + String(e?.stack ?? e).slice(0, 400));
  }
}
await browser.close();

console.log('\n==== SUMMARY ====');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
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
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(`fh_${cls}_`)) fs.rmSync(path.join(OUT, f)); // stale shots of an older run
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
  const fpsSamples = [];
  let shotN = 0;
  const shot = async (label) => {
    shotN++;
    await page.screenshot({ path: path.join(OUT, `fh_${cls}_${String(shotN).padStart(2, '0')}_${label}.png`) });
  };
  const B = (msg, hard = false) => blocker(cls, msg, hard);
  const X = (msg) => ux(cls, msg);
  const C = (name, ok, info) => check(`[${cls}] ${name}`, ok, info);
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
  const flagOf = (id) => page.evaluate((qid) => window.G.character.save.flags[`q.${qid}`] ?? null, id);
  const guide = () =>
    page.evaluate(async () => {
      const qm = await import('/src/ui/hud/questMarks.ts');
      const ge = await import('/src/ui/panels/game/guideEngine.ts');
      let rg = null;
      try {
        const rq = ge.recommend(window.G.character).quest;
        rg = rq && rq.state === 'available' ? rq.giverNpcId ?? null : null;
      } catch { /* none */ }
      return qm.guideTarget(rg);
    });

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
  /** Raw ids / placeholders leaking into visible text (missing Turkish strings): undefined, NaN, [object, mq_xx / ow_xx / item_xx / npc_xx ids. */
  const noteTextIssues = async (where) => {
    const bad = await page.evaluate(() => {
      const t = document.getElementById('ui-root')?.innerText ?? '';
      const m = t.match(/\bundefined\b|\bNaN\b|\[object|\b(?:mq|ow|item|npc|mb|wb|skel|cult)_[a-z0-9_]{3,}\b|\{\{|\}\}/g);
      return m ? [...new Set(m)].slice(0, 6) : [];
    });
    if (bad.length) X(`visible raw / untranslated text at "${where}": ${bad.join(', ')}`);
  };
  /** Quest marker kind worn by an NPC entity ('offer' | 'turnin' | 'locked' | null) - the '!' / '?' over its head. */
  const npcMark = (defId) => page.evaluate((id) => { const e = [...window.G.world.entities.values()].find((n) => n.kind === 'npc' && n.def?.id === id); return e ? (e.questMarkKind ?? null) : 'missing'; }, defId);
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
    let path = await page.evaluate(([x, z]) => {
      const G = window.G;
      const pts = G.world.nav.findPath({ x: G.player.position.x, z: G.player.position.z }, { x, z }, 60000);
      return pts ? pts.map((v) => [v.x, v.z]) : null;
    }, [tx, tz]);
    if (!path) {
      B(`no navgrid path to ${label}; trying a straight line`);
      path = [[tx, tz]];
    }
    let wpI = 0;
    let lastPos = await snap();
    let lastCheck = Date.now();
    let stuckN = 0;
    let jumpAt = 0;
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
      if (Date.now() - jumpAt > 600 && o.jump) { jumpAt = Date.now(); }
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
            const np = await page.evaluate(([x, z]) => {
              const G = window.G;
              const pts = G.world.nav.findPath({ x: G.player.position.x, z: G.player.position.z }, { x, z }, 60000);
              return pts ? pts.map((v) => [v.x, v.z]) : null;
            }, [tx, tz]);
            if (np) { path = np; wpI = 0; }
            await setKeys(['KeyS']);
            await sleep(350);
          } else if (stuckN >= 4) {
            await releaseAll();
            B(`stuck walking to ${label} at (${s.x.toFixed(1)},${s.z.toFixed(1)}); dev teleport used`);
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

  // =============================================================== 1. menu
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.G?.scenes?.current?.id === 'menu', null, { timeout: 120000 });
  await sleep(1800);
  await shot('menu');
  const menuTitle = await page.evaluate(() => document.querySelector('.efs-title h1')?.textContent ?? '');
  C('main menu shows the title', /EFSUN/i.test(menuTitle), menuTitle);
  await page.click('button:has-text("Yeni Karakter")');
  await sleep(1200);
  // the class list: every playable class card exists with Turkish text
  const cards = await page.evaluate(() => [...document.querySelectorAll('.efs-class .nm')].map((e) => e.textContent));
  C('creation screen lists the classes', cards.length >= 7, cards.join(','));
  await page.click(`.efs-class:has-text("${CLASS_LABEL[cls]}")`);
  await sleep(900);
  await shot('create');
  const createBtn = page.locator('button:has-text("Oluştur")');
  const cb = await createBtn.boundingBox();
  if (!cb || cb.y + cb.height > VH + 1 || cb.y < 0) X(`Oluştur button is outside the ${VW}x${VH} viewport (y=${cb ? Math.round(cb.y) : '?'}): the creation panel is taller than the screen`);
  await page.fill('.efs-input', CLASS_NAME[cls]);
  await sleep(200);
  await createBtn.click();
  await sleep(2200);
  const created = await page.evaluate(() => [...document.querySelectorAll('.efs-char .nm')].map((e) => e.textContent));
  C('character appears in the list after Oluştur', created.includes(CLASS_NAME[cls]), created.join(','));
  await shot('created');
  await page.click('button:has-text("Oyna")');
  await waitScene('town');
  await sleep(2500);
  const s0 = await snap();
  C('entered Kuzgunkale as level 1', s0.scene === 'town' && s0.lvl === 1, `scene=${s0.scene} lvl=${s0.lvl}`);
  const gotCls = await page.evaluate(() => window.G.character.save.classId);
  C('character class is ' + cls, gotCls === cls, gotCls);
  // barks (systems/Barks.ts): every bark also writes a 'Söylenti' (rumor) line into the chat; count the lines added from now on
  await page.evaluate(() => {
    window.__barks = 0;
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.classList?.contains('rumor') || n.querySelector?.('.rumor'))) window.__barks++;
    }).observe(document.body, { childList: true, subtree: true });
  });

  // =============================================================== 2. welcome card
  await page.waitForFunction(() => window.G.ui.isPanelOpen('welcome'), null, { timeout: 15000 }).catch(() => {});
  const welcomeOpen = await page.evaluate(() => window.G.ui.isPanelOpen('welcome'));
  C('welcome card opens on first login', welcomeOpen);
  await shot('welcome');
  const g0 = await guide();
  C('guide target after login (welcome) exists', !!g0, JSON.stringify(g0));
  if (welcomeOpen) {
    await page.click('button:has-text("BAŞLA")');
    await sleep(600);
  }
  C('welcome card closed by BAŞLA', !(await page.evaluate(() => window.G.ui.isPanelOpen('welcome'))));
  await sampleFps('town spawn');

  // =============================================================== 3. Muhtar Cemal
  const g1 = await guide();
  C('objective arrow target = Muhtar Cemal', g1?.label === 'Muhtar Cemal', JSON.stringify(g1));
  const cemal = await page.evaluate(() => {
    const e = [...window.G.world.entities.values()].find((n) => n.kind === 'npc' && n.def?.id === 'npc_muhtar');
    return e ? { x: e.position.x, z: e.position.z } : null;
  });
  C('Muhtar Cemal exists in the town world', !!cemal, JSON.stringify(cemal));
  if (!cemal) return;
  await shot('town_before_walk');
  const w1 = await walkTo(cemal.x, cemal.z, { stop: 2.4, label: 'Muhtar Cemal' });
  C('walked to Muhtar Cemal', w1.ok, JSON.stringify(w1));
  await shot('at_cemal');
  const prompt = await page.evaluate(() => document.querySelector('.interact-prompt, .hud-interact, [class*="prompt"]')?.textContent ?? '');
  const mCemal = await npcMark('npc_muhtar');
  C('Muhtar Cemal wears an offer marker (!) before the quest is taken', mCemal === 'offer', String(mCemal));
  await noteTextIssues('town HUD at Muhtar Cemal');
  await tap('KeyF');
  await sleep(700);
  const dlg = await page.evaluate(() => window.G.ui.isPanelOpen('dialog'));
  C('F opens the quest dialog of Muhtar Cemal', dlg, `prompt="${prompt.slice(0, 40)}"`);
  await shot('cemal_dialog');
  const accept = page.locator('.pg-dialog button:has-text("Görevi Kabul Et")').first();
  const hasAccept = (await accept.count()) > 0;
  C('dialog offers "Görevi Kabul Et"', hasAccept);
  if (hasAccept) await accept.click();
  await sleep(500);
  C('Kuzgun\'un Çağrısı is active', (await qState('mq_01_kuzgunun_cagrisi')) === 'active', await qState('mq_01_kuzgunun_cagrisi'));
  await shot('cemal_accepted');
  await closePanels();

  // =============================================================== 4. gate -> Sisli Vadi
  const g2 = await guide();
  C('arrow now points at the Güney Kapısı', g2 && /Kap/i.test(g2.label ?? '') , JSON.stringify(g2));
  if (g2) {
    const w2 = await walkTo(g2.x, g2.z, { stop: 1.5, label: 'Güney Kapısı', timeout: 120000 });
    C('walked to the south gate', w2.ok, JSON.stringify(w2));
  }
  await waitScene('dungeon', 90000).catch(() => {});
  const s1 = await snap();
  C('arrived in Sisli Vadi', s1.scene === 'dungeon', `scene=${s1.scene}`);
  await sleep(4000);
  await shot('world_arrive');
  await sampleFps('sisli vadi spawn');
  // exploration: the guide now points at Gümüşdere / Muhtar Ferhat
  const g3 = await guide();
  C('world guide target = Muhtar Ferhat', !!g3 && /Muhtar Ferhat/.test(g3.label ?? ''), JSON.stringify(g3));
  if (g3) {
    const w3 = await walkTo(g3.x, g3.z, { stop: 2.4, label: 'Muhtar Ferhat', timeout: 180000 });
    C('walked to Muhtar Ferhat', w3.ok, JSON.stringify(w3));
  }
  const ferhat = await page.evaluate(() => {
    const e = [...window.G.world.entities.values()].find((n) => n.kind === 'npc' && n.def?.id === 'npc_g_muhtar');
    return e ? { x: e.position.x, z: e.position.z } : null;
  });
  C('Muhtar Ferhat exists in the open world', !!ferhat, JSON.stringify(ferhat));
  await shot('at_ferhat');
  const mFerhat = await npcMark('npc_g_muhtar');
  if (mFerhat !== 'turnin' && mFerhat !== 'offer') X(`Muhtar Ferhat wears no quest marker (${mFerhat}) although the active quest says to talk to him`);
  await noteTextIssues('open-world HUD at Muhtar Ferhat');
  await tap('KeyF');
  await sleep(700);
  C('F opens Ferhat\'s dialog', await page.evaluate(() => window.G.ui.isPanelOpen('dialog')));
  C('Kuzgun\'un Çağrısı is ready after talking to Ferhat', (await qState('mq_01_kuzgunun_cagrisi')) === 'ready', await qState('mq_01_kuzgunun_cagrisi'));
  await shot('ferhat_dialog');

  // =============================================================== 4b. first quest turn-in
  const xp0 = await snap();
  await page.locator('.pg-dialog button:has-text("Teslim Et")').first().click();
  await sleep(900);
  C('FIRST TURN-IN: Kuzgun\'un Çağrısı done', (await qState('mq_01_kuzgunun_cagrisi')) === 'done', await qState('mq_01_kuzgunun_cagrisi'));
  const xp1 = await snap();
  C('turn-in gave XP / gold or a level', xp1.xp > xp0.xp || xp1.lvl > xp0.lvl || xp1.gold > xp0.gold, `lvl ${xp0.lvl}->${xp1.lvl} xp ${xp0.xp}->${xp1.xp} gold ${xp0.gold}->${xp1.gold}`);
  await shot('turned_in');
  await noteTextIssues('after first turn-in');

  // =============================================================== 5. kill quests
  /** Accept the quest in the open Ferhat dialog (dialog must be open; talks to Ferhat again when it is closed). */
  const acceptFromFerhat = async (questId, label) => {
    const st = await qState(questId);
    if (st === 'active' || st === 'ready' || st === 'done') return st;
    if (!(await page.evaluate(() => window.G.ui.isPanelOpen('dialog')))) {
      const f = await page.evaluate(() => {
        const e = [...window.G.world.entities.values()].find((n) => n.kind === 'npc' && n.def?.id === 'npc_g_muhtar');
        return e ? { x: e.position.x, z: e.position.z } : null;
      });
      if (f) await walkTo(f.x, f.z, { stop: 2.4, label: 'Muhtar Ferhat' });
      await tap('KeyF');
      await sleep(700);
    }
    // the quest block that belongs to this quest: its card contains the quest name
    const name = await page.evaluate((id) => window.G.quests.def(id)?.name ?? '', questId);
    const card = page.locator('.pg-dlg-q', { hasText: name }).first();
    const btn = card.locator('button:has-text("Görevi Kabul Et")');
    if ((await btn.count()) > 0) await btn.click();
    await sleep(600);
    const after = await qState(questId);
    C(`${label} accepted`, after === 'active', after);
    return after;
  };

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
        if (!best || d < best.d) best = { id: e.id, def: e.def?.id, name: e.def?.name, x: e.position.x, z: e.position.z, d, aggro: !!e.aggroed };
      }
      return best;
    }, ids ?? null);
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
        pHp: p.hp, pMax: p.maxHp, pDead: !!p.isDead, pYaw: p.yaw, px: p.position.x, pz: p.position.z,
      };
    }, id);

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

  /** Fight one enemy with real input: steer + approach, right-click target + auto-attack, cycle skills 1-5. Returns 'dead' | 'timeout' | 'died'. */
  let skillIx = 0;
  const fight = async (enemyId, maxMs = 45000) => {
    const t0 = Date.now();
    let lastSkill = 0;
    let lastClick = 0;
    let potionAt = 0;
    while (Date.now() - t0 < maxMs) {
      const s = await enemyState(enemyId);
      if (s.pDead) { await releaseAll(); return 'died'; }
      if (!s.alive) { await releaseAll(); return 'dead'; }
      const want = melee ? 2.2 : 13;
      const err = wrap(Math.atan2(s.x - s.px, s.z - s.pz) - s.pYaw);
      const keys = [];
      if (Math.abs(err) > 0.1) keys.push((err > 0) === turnLeftIncreasesYaw ? 'ArrowLeft' : 'ArrowRight');
      if (s.d > want && Math.abs(err) < 0.9) keys.push('KeyW');
      await setKeys(keys);
      const now = Date.now();
      // select + arm auto-attack with a real right click on the enemy (retry every 1.5 s while not selected)
      if (!s.selected && s.onScreen && s.d < 30 && now - lastClick > 1500) {
        lastClick = now;
        await page.mouse.click(s.sx, s.sy, { button: 'right' });
        await sleep(80);
        if (!(await enemyState(enemyId)).selected) await tap('Tab');
      }
      if (s.selected && s.d < (melee ? 4 : 28) && now - lastSkill > 420) {
        lastSkill = now;
        skillIx = (skillIx + 1) % 5;
        await tap(`Digit${skillIx + 1}`, 40);
      }
      if (s.pHp < s.pMax * 0.4 && now - potionAt > 6000) {
        potionAt = now;
        await tap('KeyG', 40);
      }
      await sleep(70);
    }
    await releaseAll();
    return 'timeout';
  };

  const melee = MELEE.has(cls);
  let kills = 0;
  let deaths = 0;
  /** Play a kill quest through: find enemies by the objective's target ids, fight, loot, until `ready`. */
  const killQuest = async (questId, label) => {
    const info = await page.evaluate((id) => {
      const d = window.G.quests.def(id);
      return { objs: d.objectives.map((o) => ({ kind: o.kind, target: o.target, count: o.count, text: o.text })), region: d.region };
    }, questId);
    const ids = info.objs.filter((o) => o.kind === 'kill').map((o) => o.target);
    console.log(`  ${label}: objectives ${JSON.stringify(info.objs)}`);
    const t0 = Date.now();
    let noEnemyTicks = 0;
    let noArrowNoted = false;
    const visited = [];
    while (Date.now() - t0 < 6 * 60000) {
      const st = await qState(questId);
      if (st === 'ready' || st === 'done') break;
      if ((await snap()).dead) {
        // died on the way (walking to a camp): release the spirit like a player would, then carry on
        deaths++;
        B(`${label}: the player died while walking to a camp (lvl ${(await snap()).lvl})`);
        await handleDeath();
        continue;
      }
      const en = await nearestEnemy(ids);
      if (!en || en.d > 110) {
        noEnemyTicks++;
        const g = await guide();
        let tx = null;
        if (g && g.kind === 'kill') tx = g;
        else {
          if (!noArrowNoted) {
            noArrowNoted = true;
            X(`${label}: no enemy of the objective is loaded near the player and the objective arrow has no target (${g ? 'points at "' + g.label + '"' : 'hidden'}); a new player has to find the next camp on the map`);
          }
          // what a player does with the map: the nearest camp of that mob that is not visited yet
          tx = await page.evaluate(async ([idl, seen]) => {
            const G = window.G;
            const dg = await import('/src/data/dungeons/index.ts');
            const ts = (await import('/src/types/dungeons.ts')).TILE_SIZE;
            const def = dg.getDungeon(G.mplus?.params?.dungeonId ?? G.mplus?.state?.dungeonId);
            const lvl = G.character.level;
            const p = G.player.position;
            let best = null;
            for (const pk of def?.packs ?? []) {
              if (seen.includes(pk.id) || !pk.members.some((m) => idl.includes(m.enemyId))) continue;
              if ((pk.levelRange?.[0] ?? 1) > lvl + 2) continue;
              const x = (pk.center[0] + 0.5) * ts;
              const z = (pk.center[1] + 0.5) * ts;
              const d = Math.hypot(x - p.x, z - p.z);
              const score = d + 150 * Math.max(0, (pk.levelRange?.[0] ?? 1) - lvl);
              if (!best || score < best.score) best = { x, z, d, score, id: pk.id, label: pk.id };
            }
            return best;
          }, [ids, visited]);
          if (tx) visited.push(tx.id);
        }
        if (tx && noEnemyTicks <= 8) {
          console.log(`  no ${ids.join('/')} within 110 m (nearest ${en ? Math.round(en.d) : '-'} m): walking to ${tx.label} (${Math.round(tx.x)},${Math.round(tx.z)})`);
          await walkTo(tx.x, tx.z, { stop: 14, timeout: 90000, label: 'kill area' });
          await sleep(1200);
          const near = await page.evaluate(() => {
            const G = window.G;
            const p = G.player.position;
            const m = {};
            for (const e of G.world.enemies) {
              const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
              if (d < 70) m[e.def?.id] = (m[e.def?.id] ?? 0) + (e.isDead ? 0 : 1);
            }
            return { at: [Math.round(p.x), Math.round(p.z)], m };
          });
          console.log(`  arrived: ${JSON.stringify(near)}`);
          continue;
        }
        B(`${label}: no ${ids.join('/')} found near the player, the guide target or any layout camp`, true);
        return false;
      }
      noEnemyTicks = 0;
      // approach until the fight can start (the fight loop keeps closing in on a chasing enemy)
      if (en.d > 20) {
        await walkTo(en.x, en.z, { stop: 14, timeout: 30000, label: en.name ?? en.def });
      }
      const res = await fight(en.id);
      if (res === 'died') {
        deaths++;
        const around = await page.evaluate(() => {
          const G = window.G;
          const p = G.player.position;
          return G.world.enemies.filter((e) => !e.isDead && Math.hypot(e.position.x - p.x, e.position.z - p.z) < 25).map((e) => `${e.def?.id}${e.level ? ' L' + e.level : ''}${e.aggroed ? '*' : ''}@${Math.round(Math.hypot(e.position.x - p.x, e.position.z - p.z))}`).join(' ');
        });
        B(`${label}: the player died while fighting ${en.def} (lvl ${(await snap()).lvl}); enemies within 25 m: ${around}`);
        await handleDeath();
        continue;
      }
      if (res === 'dead') {
        kills++;
        const rows = await page.evaluate((id) => window.G.quests.progressRows(id).map((r) => `${r.have}/${r.need}`).join(' '), questId);
        console.log(`  kill #${kills} ${en.def} -> ${questId} ${rows} (lvl ${(await snap()).lvl})`);
        await sleep(500);
        await collectLoot();
      } else {
        B(`${label}: fight with ${en.def} timed out (enemy not dying / unreachable)`);
        // drop the target and try another one
        await closePanels();
      }
    }
    const fin = await qState(questId);
    C(`${label}: objectives completed`, fin === 'ready' || fin === 'done', `state=${fin} kills=${kills}`);
    return fin === 'ready' || fin === 'done';
  };

  const handleDeath = async () => {
    await sleep(1500);
    await shot('death');
    const top = await page.evaluate(() => window.G.ui.topPanelId?.() ?? null);
    const btns = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()).filter(Boolean));
    console.log(`  death: top panel=${top} buttons=${btns.join('|').slice(0, 200)}`);
    // free respawn = "Ruhunu Serbest Bırak" (the other button costs gold)
    const respawn = page.locator('button:has-text("Ruhunu Serbest")').first();
    if ((await respawn.count()) > 0) await respawn.click().catch(() => {});
    else B('death panel has no "Ruhunu Serbest Bırak" button', true);
    for (let i = 0; i < 12 && (await snap()).dead; i++) await sleep(500);
    await sleep(1500);
    const s = await snap();
    if (s.dead) B('player stays dead after "Ruhunu Serbest Bırak"', true);
    await closePanels();
  };

  /** Turn a ready quest in at Ferhat (walk back with the arrow's help when needed). */
  /** Bag items (the slots the character carries). */
  const bagCount = () => page.evaluate(() => window.G.character.allItems().filter((x) => x.loc.where === 'bag').length);
  /**
   * Turn-in button of a quest card: "Teslim Et"; a reward-choice card ("Bir ödül seç:") has item buttons in `.pg-ql-acts` instead,
   * so the first one is taken. Returns 'Teslim Et' | 'reward choice' | null.
   */
  const turnInCard = async (questId) => {
    const name = await page.evaluate((id) => window.G.quests.def(id)?.name ?? '', questId);
    const card = page.locator('.pg-dlg-q', { hasText: name }).first();
    const btn = card.locator('button:has-text("Teslim Et")');
    if ((await btn.count()) > 0) { await btn.click(); return 'Teslim Et'; }
    const choice = card.locator('.pg-ql-acts button').first();
    if ((await choice.count()) > 0) { await choice.click(); return 'reward choice'; }
    return null;
  };
  const turnInAtFerhat = async (questId, label) => {
    let g = null;
    let w = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      g = await guide();
      if (!g) break;
      w = await walkTo(g.x, g.z, { stop: 2.4, timeout: 150000, label: 'turn-in NPC' });
      if (w.dead) {
        deaths++;
        B(`${label}: the player died on the way to the turn-in NPC (lvl ${(await snap()).lvl})`);
        await handleDeath();
        continue;
      }
      break;
    }
    await closePanels();
    await tap('KeyF');
    await sleep(700);
    console.log(`  turn-in: guide=${JSON.stringify(g)} walk=${JSON.stringify(w)} top=${await page.evaluate(() => window.G.ui.topPanelId?.() ?? null)}`);
    await shot('turnin_attempt');
    const bagBefore = await bagCount();
    const how = await turnInCard(questId);
    await sleep(900);
    const st = await qState(questId);
    C(`${label}: turned in`, st === 'done', st);
    if (how === 'reward choice') {
      const bagAfter = await bagCount();
      C(`${label}: the chosen reward item landed in the bags`, bagAfter > bagBefore, `bag ${bagBefore}->${bagAfter}`);
    }
    return st === 'done';
  };

  // ---- Fare Yuvası: kill 10 Orman Sıçanı ----
  await acceptFromFerhat('mq_02_fare_yuvasi', 'Fare Yuvası');
  await closePanels();
  await shot('fare_accepted');
  const g4 = await guide();
  C('guide arrow follows the kill quest (Fare Yuvası)', !!g4 && g4.kind === 'kill', JSON.stringify(g4));
  const lvlBefore = (await snap()).lvl;
  await sampleFps('before combat');
  const ok2 = await killQuest('mq_02_fare_yuvasi', 'Fare Yuvası');
  await sampleFps('after combat');
  await shot('fare_done');
  if (ok2) {
    await turnInAtFerhat('mq_02_fare_yuvasi', 'FIRST KILL QUEST Fare Yuvası');
  }
  const sAfter = await snap();
  C('level 2 or higher after the first kill quest', sAfter.lvl >= 2, `lvl ${lvlBefore}->${sAfter.lvl} xp=${sAfter.xp}`);
  await shot('after_fare_turnin');

  // ---- level 3: Balçık Temizliği (needs level 2) ----
  if (sAfter.lvl >= 2 && sAfter.lvl < 3) {
    const st3 = await qState('mq_03_balcik_temizligi');
    if (st3 === 'available') {
      await acceptFromFerhat('mq_03_balcik_temizligi', 'Balçık Temizliği');
      await closePanels();
      if (await killQuest('mq_03_balcik_temizligi', 'Balçık Temizliği')) await turnInAtFerhat('mq_03_balcik_temizligi', 'Balçık Temizliği');
    } else {
      B(`Balçık Temizliği is ${st3} at level ${sAfter.lvl} (expected available)`);
    }
  }
  const sLvl = await snap();
  C('level 2-3 reached', sLvl.lvl >= 2 && sLvl.lvl <= 4, `lvl=${sLvl.lvl}`);

  // =============================================================== 5b. Sisli Vadi side chain: a prop objective and the escort quest
  // Balçık Avı (sq_r1_k02, Ferhat, level 2): F on 4 crystal props (qo_crystal = the interact objective), then 6 slimes.
  // Muhtarın Haberi (sq_r1_ch01, Ferhat) -> talk to Avcı Yıldız (turn-in there, she offers the next step) -> Gözcü Avı (sq_r1_ch02,
  // level 3): the ESCORT quest of the first chain. It has to START here (accepted at Avcı Yıldız); the escort walk itself is not played.
  const PROP_Q = 'sq_r1_k02_balcik_avi';
  const CH1 = 'sq_r1_ch01_muhtarin_haberi';
  const ESC_Q = 'sq_r1_ch02_gozcu_avi';
  const dlgButton = async (questId, btnText) => {
    const name = await page.evaluate((q) => window.G.quests.def(q)?.name ?? '', questId);
    const btn = page.locator('.pg-dlg-q', { hasText: name }).first().locator(`button:has-text("${btnText}")`);
    if ((await btn.count()) === 0) return false;
    await btn.click();
    await sleep(700);
    return true;
  };
  const talkTo = async (npcId, label) => {
    const at = await page.evaluate((nid) => {
      const e = [...window.G.world.entities.values()].find((n) => n.kind === 'npc' && n.def?.id === nid);
      return e ? { x: e.position.x, z: e.position.z } : null;
    }, npcId);
    if (!at) { B(`${label} is not in the open world`); return false; }
    await walkTo(at.x, at.z, { stop: 2.4, label });
    await closePanels();
    await tap('KeyF');
    await sleep(700);
    return page.evaluate(() => window.G.ui.isPanelOpen('dialog'));
  };

  // 5b.1 prop objective: F on the crystals; a prop is empty for 60 s after each use, so walk to the nearest one that still has a charge
  if ((await acceptFromFerhat(PROP_Q, 'Balçık Avı')) === 'active') {
    await closePanels(); // the accepted quest's dialog stays open and would block walking and F (wantsCursor)
    for (let i = 0; i < 12; i++) {
      const row0 = (await page.evaluate((q) => window.G.quests.progressRows(q), PROP_Q))[0];
      if (!row0 || row0.have >= row0.need) break;
      const spot = await page.evaluate(() => {
        const G = window.G;
        const p = G.player.position;
        let best = null;
        for (const e of G.world.entities.values()) {
          if (e.propKind !== 'crystal' || e.target !== 'qo_crystal' || e.removed || e.isEmpty()) continue;
          const d = Math.hypot(e.position.x - p.x, e.position.z - p.z);
          if (!best || d < best.d) best = { x: e.position.x, z: e.position.z, d, prompt: e.interactPrompt, wants: G.quests.wants('interact', 'qo_crystal'), kind: e.propKind };
        }
        return best;
      });
      if (!spot) { B('no crystal prop with a charge left for the Balçık Avı interact objective'); break; }
      console.log(`  crystal #${i}: ${JSON.stringify(spot)} progress=${row0.have}/${row0.need}`);
      if (spot.d > 1.8) await walkTo(spot.x, spot.z, { stop: 1.6, timeout: 60000, label: 'qo_crystal' });
      await tap('KeyF');
      await sleep(600);
    }
    const rows = await page.evaluate((q) => window.G.quests.progressRows(q).map((r) => `${r.have}/${r.need}`).join(' '), PROP_Q);
    C('PROP objective: 4 crystals interacted with F (qo_crystal)', rows.startsWith('4/4'), rows);
    if (await killQuest(PROP_Q, 'Balçık Avı')) await turnInAtFerhat(PROP_Q, 'Balçık Avı');
  }

  // 5b.2 escort quest: Muhtarın Haberi (Ferhat) -> talk to Avcı Yıldız (turn-in) -> Gözcü Avı is offered there and must be accepted
  if ((await acceptFromFerhat(CH1, 'Muhtarın Haberi')) === 'active') {
    if (await talkTo('npc_g_avci', 'Avcı Yıldız')) {
      await turnInCard(CH1);
      await sleep(700);
      C('Muhtarın Haberi turned in at Avcı Yıldız', (await qState(CH1)) === 'done', await qState(CH1));
      await dlgButton(ESC_Q, 'Görevi Kabul Et');
    } else B('Avcı Yıldız: F did not open a dialog');
  }
  const escState = await qState(ESC_Q);
  C('ESCORT quest Gözcü Avı can be started (accepted at Avcı Yıldız)', escState === 'active', escState);
  await closePanels();

  // =============================================================== 6. equipment
  await closePanels();
  const eq = await page.evaluate(() => {
    const ch = window.G.character;
    const bag = ch.allItems().filter((x) => x.loc.where === 'bag');
    const cand = bag.filter((x) => ch.canEquip(x.item).ok).map((x) => ({ uid: x.item.uid, name: x.item.baseId, idx: x.loc.index, slot: ch.pickSlot(x.item), cur: !!ch.getEquipped(ch.pickSlot(x.item)) }));
    const equipped = Object.keys(ch.save.equipment ?? {}).filter((k) => ch.save.equipment[k]);
    return { bagCount: bag.length, cand, equipped };
  });
  console.log('  equipment state', JSON.stringify(eq));
  if (!eq.cand.length) {
    B('no equippable item in the bag after the first quests (no drop / reward received)');
  } else {
    await tap('KeyB');
    await sleep(700);
    C('B opens the inventory', await page.evaluate(() => window.G.ui.isPanelOpen('inventory')));
    const pick = eq.cand.find((c) => !c.cur) ?? eq.cand[0];
    const slotsInfo = await page.evaluate(() => [...document.querySelectorAll('.pi-slot:not(.empty)')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.width > 0 }; }));
    console.log(`  non-empty slots in DOM: ${slotsInfo.length}`);
    const before = await page.evaluate((slot) => window.G.character.getEquipped(slot)?.uid ?? null, pick.slot);
    for (const sl of slotsInfo.filter((x) => x.vis)) {
      await page.mouse.click(sl.x, sl.y, { button: 'right' });
      await sleep(250);
      const now = await page.evaluate((slot) => window.G.character.getEquipped(slot)?.uid ?? null, pick.slot);
      if (now === pick.uid) break;
    }
    const nowUid = await page.evaluate((slot) => window.G.character.getEquipped(slot)?.uid ?? null, pick.slot);
    C(`first equipment drop equipped (${pick.name} -> ${pick.slot})`, nowUid === pick.uid, `before=${before} now=${nowUid}`);
    await shot('equipped');
    await closePanels();
  }

  // =============================================================== 7. panels
  const PANELS = [['KeyB', 'inventory', 'B Çanta'], ['KeyC', 'character', 'C Karakter'], ['KeyN', 'talents', 'N Yetenek Ağacı'], ['KeyM', 'map', 'M Harita'], ['KeyK', 'skills', 'K Yetenek Kitabı'], ['KeyL', 'questlog', 'L Görev Defteri']];
  for (const [key, id, name] of PANELS) {
    await closePanels();
    await tap(key);
    await sleep(1000);
    const open = await page.evaluate((pid) => window.G.ui.isPanelOpen(pid), id);
    C(`${name} panel opens with its hotkey`, open);
    await shot(`panel_${id}`);
    if (open) {
      await noteTextIssues(name);
      // an open panel must not run outside the viewport
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

  // =============================================================== 8. report
  const fpsMin = Math.min(...fpsSamples.map((f) => f.fps));
  console.log(`  FPS samples: ${fpsSamples.map((f) => `${f.where}=${f.fps}`).join(', ')}`);
  const barks = await page.evaluate(() => window.__barks ?? 0);
  C('at least one bark (Söylenti line in the chat, speech bubble over the speaker) during the run', barks >= 1, `${barks} bark line(s)`);
  C('FPS >= 30 in every sample', fpsMin >= 30, `min ${fpsMin}`);
  C('no console / page errors', errors.length === 0, errors.slice(0, 4).join(' || '));
  for (const e of errors) console.log('   ERR', e);
  const fin = await snap();
  console.log(`  final: lvl ${fin.lvl} xp ${fin.xp} gold ${fin.gold} kills ${kills} deaths ${deaths}`);
  await ctx.close();
}
