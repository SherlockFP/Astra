// Dungeon pack check: one class walks into the FIRST pack of a dungeon and fights it with real input (WASD + arrows, right click to
// target, the bar's keys rotated, the potion key at low HP). Nothing in the fight is scripted through the game API except the reads.
//
// Journey per class (fresh browser profile, so a fresh character):
//   1  dev/scenes.html?scene=dungeon&dungeon=<id>&lvl=<N>&class=<class>  (enemy level follows lvl; elvl=N overrides it)
//   2  walk to the pack centre with the game's navgrid path (waypoints only, the keys do the moving); stuck or no path -> dev teleport
//   3  fight: right click the nearest pack body (Tab as fallback), press the bar's keyboard keys in turn (skills unlocked at lvl, bound
//      to a key: mouse-bound slots are skipped), keep the target in range (melee closes in, casters hold ~14 m)
//   4  a death releases the spirit ("Ruhunu Serbest Bırak") and ends the run; the pack is cleared when every tracked body is dead
//   5  report: HP lost % (damage taken / max HP), min HP %, damage dealt, kills, deaths, time, keys pressed, enemy levels
//
// Run (dev server of THIS checkout must be up on DP_URL; vite.config.ts ignores **/.claude/** in its watcher, so restart the server
// after changing src/):
//   npx vite --port 5190 --strictPort --host 127.0.0.1
//   DP_URL=http://127.0.0.1:5190 MP_PW=<dir with node_modules/playwright-core> node tools/qa/dungeon-pack.mjs
// Env: DP_CLASSES=priest,knight  DP_LVL=15  DP_DUNGEON=kemik_mahzeni  DP_PACK=0 (index into the dungeon's packs)
//      DP_CAP=150 (seconds allowed for the fight of one class)  MP_CHROME (chrome.exe)  DP_VIEW=1280x720  DP_HEADED=1 (watch it)
// Exit code: 0 = every class cleared the pack without a death, dealt damage, enemies at the run level, no console / page errors.
//            1 = anything else (the reason is printed per class). Plain numbers are informational.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DP_URL ?? 'http://127.0.0.1:5190';
const PW_DIR = process.env.MP_PW ?? process.env.QA_DIR ?? HERE;
const CHROME = process.env.MP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CLASSES = (process.env.DP_CLASSES ?? 'priest,knight').split(',').map((s) => s.trim()).filter(Boolean);
const LVL = Number(process.env.DP_LVL ?? 15);
const DUNGEON = process.env.DP_DUNGEON ?? 'kemik_mahzeni';
const PACK_IDX = Number(process.env.DP_PACK ?? 0);
const CAP_MS = Number(process.env.DP_CAP ?? 150) * 1000;
const [VW, VH] = (process.env.DP_VIEW ?? '1280x720').split('x').map(Number);
const MELEE = new Set(['knight', 'barbarian', 'rogue', 'paladin', 'druid']);
/** console noise that is not a game bug: blocked fonts (junction node_modules), relay sockets of the P2P layer, favicon, 403 of @fs. */
const NOISE = /WebSocket|nostr|satellite|ERR_|favicon|net::|Failed to load resource|@fontsource|A network error occurred/i;

const req = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'));
const pwMod = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = pwMod.chromium ?? pwMod.default.chromium;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: process.env.DP_HEADED !== '1',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const reports = [];
for (const cls of CLASSES) {
  const r = await runClass(cls).catch((e) => ({ cls, ok: false, why: `exception: ${String(e?.stack ?? e).slice(0, 300)}` }));
  reports.push(r);
}
await browser.close();

console.log('\n==== SUMMARY ====');
for (const r of reports) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.cls} lvl${LVL} ${r.ok ? '' : '- ' + r.why}`);
const bad = reports.filter((r) => !r.ok);
console.log(`${reports.length - bad.length}/${reports.length} classes cleared the pack`);
process.exit(bad.length ? 1 : 0);

async function runClass(cls) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!NOISE.test(e.message)) errors.push(`pageerror: ${e.message.slice(0, 200)}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  try {
    return await journey(page, cls, errors);
  } finally {
    await ctx.close();
  }
}

async function journey(page, cls, errors) {
  const notes = [];
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
  };
  const tap = async (key, ms = 60) => {
    await page.keyboard.down(key);
    await sleep(ms);
    await page.keyboard.up(key);
  };
  let turnLeftIncreasesYaw = true; // calibrated before the first walk: which arrow raises player.yaw

  /** One read of the world: the player, and (when ids are given) the living tracked bodies with the nearest one's screen position. */
  const state = (ids = []) =>
    page.evaluate(async (idl) => {
      const G = window.G;
      const p = G.player;
      const pc = await import('/src/game/PlayerController.ts');
      const alive = [];
      for (const id of idl) {
        const e = G.world.entities.get(id);
        if (e && !e.isDead && !e.removed && e.alive !== false) alive.push(e);
      }
      let nearest = null;
      for (const e of alive) {
        const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
        if (!nearest || d < nearest.d) nearest = { e, d };
      }
      let near = null;
      if (nearest) {
        const out = { x: 0, y: 0 };
        const e = nearest.e;
        const on = G.ui.projectWorld(e.position.x, e.position.y + (e.height || 1.5) * 0.5, e.position.z, out);
        near = {
          id: e.id, x: e.position.x, z: e.position.z, d: nearest.d, sx: out.x, sy: out.y,
          onScreen: !!(on && out.x > 20 && out.x < innerWidth - 20 && out.y > 20 && out.y < innerHeight - 90),
          selected: pc.localHardTargetId() === e.id,
        };
      }
      return { alive: alive.length, near, hp: p.hp, maxHp: p.maxHp, dead: !!p.isDead, x: p.position.x, z: p.position.z, yaw: p.yaw };
    }, ids);

  await page.goto(`${BASE}/dev/scenes.html?scene=dungeon&dungeon=${DUNGEON}&lvl=${LVL}&class=${cls}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.G?.scenes?.current?.id === 'dungeon' && !!window.G?.player && !!window.G?.world, null, { timeout: 120000, polling: 250 });
  await sleep(3000);

  // turn calibration (ArrowLeft should raise the yaw, else the walk keys are mirrored)
  const y0 = (await state()).yaw;
  await page.keyboard.down('ArrowLeft');
  await sleep(250);
  await page.keyboard.up('ArrowLeft');
  await sleep(80);
  const turnDelta = wrap((await state()).yaw - y0);
  turnLeftIncreasesYaw = turnDelta > 0;
  if (Math.abs(turnDelta) < 0.02) notes.push('ArrowLeft did not turn the character');

  // the first pack from the dungeon's own data; its live bodies are the ones within 12 m of the pack centre
  const pack = await page.evaluate(async ([dun, idx]) => {
    const G = window.G;
    const { getDungeon } = await import('/src/data/dungeons/index.ts');
    const { TILE_SIZE } = await import('/src/types/dungeons.ts');
    const pk = getDungeon(dun).packs[idx];
    const x = (pk.center[0] + 0.5) * TILE_SIZE;
    const z = (pk.center[1] + 0.5) * TILE_SIZE;
    const members = pk.members.map((m) => m.enemyId);
    const bodies = [...G.world.enemies].filter((e) => members.includes(e.def?.id) && Math.hypot(e.position.x - x, e.position.z - z) < 12);
    const w = G.world.nav.nearestWalkable?.(x, z, 16) ?? { x, z };
    return {
      id: pk.id, room: pk.roomId, x, z, wx: w.x, wz: w.z, members,
      ids: bodies.map((e) => e.id), levels: bodies.map((e) => e.level ?? null),
    };
  }, [DUNGEON, PACK_IDX]);
  if (!pack.ids.length) return { cls, ok: false, why: `pack ${pack.id} has no live bodies at its centre` };

  // every damage / death the player is part of, read off the game's event bus (listeners only, no game state is written)
  await page.evaluate(() => {
    const G = window.G;
    const st = { dealt: 0, taken: 0, kills: 0, deaths: 0, pid: G.player.id, src: {} };
    window.__dp = st;
    G.events.on('damage', (e) => {
      if (e.kind === 'absorb') return;
      if (e.sourceId === st.pid && e.targetId !== st.pid) st.dealt += e.amount ?? 0;
      if (e.targetId === st.pid) {
        st.taken += e.amount ?? 0;
        const src = G.world.entities.get(e.sourceId)?.def?.id ?? 'env';
        st.src[src] = (st.src[src] ?? 0) + (e.amount ?? 0);
      }
    });
    G.events.on('death', (e) => { if (e.killerId === st.pid) st.kills++; });
    G.events.on('player:died', () => { st.deaths++; });
  });

  // ---- 2 walk to the pack (nav path, stuck -> dev teleport to the walkable point nearest the pack centre)
  const teleport = async (why) => {
    await setKeys([]);
    await page.evaluate(([x, z]) => { const G = window.G; G.player.position.set(x, G.player.position.y, z); }, [pack.wx, pack.wz]);
    await sleep(400);
    notes.push(`dev teleport to the pack (${why})`);
    return 'teleported';
  };
  const walkTo = async (tx, tz, stop, timeoutMs) => {
    const path = await page.evaluate(([x, z]) => {
      const G = window.G;
      const p = G.player.position;
      const pts = G.world.nav.findPath({ x: p.x, z: p.z }, { x, z }, 60000);
      return pts ? pts.map((v) => [v.x, v.z]) : null;
    }, [tx, tz]);
    if (!path) return teleport('no navgrid path');
    let wp = 0;
    let last = await state();
    let lastT = Date.now();
    let stuck = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = await state();
      if (Math.hypot(s.x - tx, s.z - tz) <= stop) { await setKeys([]); return 'arrived'; }
      while (wp < path.length - 1 && Math.hypot(path[wp][0] - s.x, path[wp][1] - s.z) < 1.6) wp++;
      const err = wrap(Math.atan2(path[wp][0] - s.x, path[wp][1] - s.z) - s.yaw);
      const keys = [];
      if (Math.abs(err) > 0.12) keys.push((err > 0) === turnLeftIncreasesYaw ? 'ArrowLeft' : 'ArrowRight');
      if (Math.abs(err) < 0.6) keys.push('KeyW');
      await setKeys(keys);
      if (Date.now() - lastT > 1600) {
        const moved = Math.hypot(s.x - last.x, s.z - last.z);
        last = s;
        lastT = Date.now();
        if (moved < 0.6) {
          stuck++;
          if (stuck === 1) { await setKeys(['KeyW', 'KeyA']); await sleep(700); await tap('Space', 120); }
          else if (stuck === 2) { await setKeys(['KeyW', 'KeyD']); await sleep(1100); await tap('Space', 120); }
          else if (stuck >= 3) return teleport(`stuck at (${s.x.toFixed(1)},${s.z.toFixed(1)})`);
        } else stuck = 0;
      }
      await sleep(60);
    }
    await setKeys([]);
    return 'timeout';
  };
  const tWalk = Date.now();
  const walk = await walkTo(pack.x, pack.z, 13, 90000);
  console.log(`  [${cls}] walk to ${pack.id}: ${walk} in ${((Date.now() - tWalk) / 1000).toFixed(1)} s`);

  // ---- the bar: keyboard keys of the skills the character has at this level (mouse-bound slots are not keys)
  const plan = await page.evaluate(async (lvl) => {
    const G = window.G;
    const { SKILLS } = await import('/src/data/skills.ts');
    const b = G.input.bindings;
    const kb = (act) => (b[act] ?? []).find((c) => /^(Key|Digit)/.test(c)) ?? null;
    const potion = kb('potionHp');
    const taken = new Set([potion, kb('potionMp'), 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'Space', 'Tab', 'ArrowLeft', 'ArrowRight'].filter(Boolean));
    const keys = [];
    for (const slot of ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4']) {
      const id = G.skills.getSlotSkill(G.player, slot);
      const def = id ? SKILLS[id] : null;
      const key = kb('skill_' + slot);
      if (!def || !key || taken.has(key) || (def.unlockLevel ?? 1) > lvl) continue;
      taken.add(key);
      keys.push({ slot, id, key, heal: (def.tags ?? []).some((t) => t === 'heal' || t === 'shield') });
    }
    return { keys, potion };
  }, LVL);
  if (!plan.keys.length) return { cls, ok: false, why: 'no keyboard-bound skill on the bar at this level' };
  console.log(`  [${cls}] bar: ${plan.keys.map((k) => `${k.key}=${k.id}`).join(' ')}`);
  const diag = () => page.evaluate(() => {
    const G = window.G;
    const a = G.skills.autoInfo(G.player);
    return { maxHp: G.player.maxHp, lmb: G.skills.getSlotSkill(G.player, 'lmb'), auto: { mode: a.mode, ready: a.ready, reach: a.reach } };
  });
  const diag0 = await diag();
  console.log(`  [${cls}] start: maxHp=${diag0.maxHp} lmb=${diag0.lmb} auto=${JSON.stringify(diag0.auto)}`);

  // ---- 3 fight
  const melee = MELEE.has(cls);
  const pressed = {};
  let rot = 0;
  let lastCast = 0;
  let lastClick = 0;
  let lastPotion = 0;
  let lastTab = 0;
  let minHp = 1;
  let maxHp0 = 0;
  let outcome = 'timeout';
  const tFight = Date.now();
  while (Date.now() - tFight < CAP_MS) {
    const s = await state(pack.ids);
    if (!maxHp0) maxHp0 = s.maxHp;
    if (s.maxHp > 0) minHp = Math.min(minHp, s.hp / s.maxHp);
    if (s.dead) { outcome = 'died'; break; }
    if (!s.alive || !s.near) { outcome = 'cleared'; break; }
    const near = s.near;
    const err = wrap(Math.atan2(near.x - s.x, near.z - s.z) - s.yaw);
    const mv = [];
    if (Math.abs(err) > 0.1) mv.push((err > 0) === turnLeftIncreasesYaw ? 'ArrowLeft' : 'ArrowRight');
    if (near.d > (melee ? 2.2 : 14) && Math.abs(err) < 0.9) mv.push('KeyW');
    await setKeys(mv);
    const now = Date.now();
    if (!near.selected && now - lastClick > 1500) {
      lastClick = now;
      if (near.onScreen && near.d < 30) {
        await page.mouse.click(near.sx, near.sy, { button: 'right' });
        await sleep(80);
      }
      if (now - lastTab > 2500 && !(await state(pack.ids)).near?.selected) {
        lastTab = now;
        await tap('Tab', 40);
      }
    }
    if (near.selected && near.d < (melee ? 4 : 26) && now - lastCast > 450) {
      lastCast = now;
      // below half HP the rotation is the heals and shields, otherwise the damage and utility keys (a heal with no ally is a self cast)
      const low = s.hp < s.maxHp * 0.5;
      const pool = plan.keys.filter((x) => x.heal === low);
      const k = (pool.length ? pool : plan.keys)[rot++ % (pool.length ? pool.length : plan.keys.length)];
      pressed[k.key] = (pressed[k.key] ?? 0) + 1;
      await tap(k.key, 40);
    }
    if (plan.potion && s.hp < s.maxHp * 0.4 && now - lastPotion > 6000) {
      lastPotion = now;
      pressed[plan.potion] = (pressed[plan.potion] ?? 0) + 1;
      await tap(plan.potion, 40);
    }
    await sleep(70);
  }
  await setKeys([]);
  const secs = ((Date.now() - tFight) / 1000).toFixed(1);
  if (outcome === 'died') {
    await sleep(1200);
    const respawn = page.locator('button:has-text("Ruhunu Serbest")').first();
    if ((await respawn.count()) > 0) await respawn.click().catch(() => {});
    await sleep(1200);
  }

  // ---- 5 report
  const st = await page.evaluate(() => window.__dp);
  const lvls = [...new Set(pack.levels)];
  const hpLost = maxHp0 ? Math.round((100 * st.taken) / maxHp0) : 0;
  const reasons = [];
  if (outcome !== 'cleared') reasons.push(outcome === 'died' ? 'the character died' : `pack not cleared in ${CAP_MS / 1000} s`);
  if (st.dealt <= 0) reasons.push('no damage dealt');
  if (lvls.some((l) => l !== LVL)) reasons.push(`pack enemies at levels ${lvls.join('/')} (expected ${LVL})`);
  if (errors.length) reasons.push(`${errors.length} console / page error(s): ${errors.slice(0, 2).join(' || ')}`);
  console.log(`PACK [${cls}] lvl${LVL} ${pack.id} (${pack.members.length} members, enemy levels ${lvls.join('/')}) walk=${walk}`);
  console.log(`     cleared=${outcome === 'cleared' ? 'yes' : 'no (' + outcome + ')'} deaths=${st.deaths} kills=${st.kills} hpLost=${hpLost}% minHp=${Math.round(minHp * 100)}% dealt=${Math.round(st.dealt)} time=${secs}s`);
  console.log(`     keys pressed: ${Object.entries(pressed).map(([k, n]) => `${k}:${n}`).join(' ') || '-'}`);
  console.log(`     taken by source: ${Object.entries(st.src).map(([k, v]) => `${k}=${Math.round(v)}`).join(' ') || '-'}`);
  for (const n of notes) console.log(`     note: ${n}`);
  for (const e of errors.slice(0, 4)) console.log(`     ERR ${e}`);
  return { cls, ok: reasons.length === 0, why: reasons.join('; ') };
}
