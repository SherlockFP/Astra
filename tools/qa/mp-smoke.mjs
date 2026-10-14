// Two-client multiplayer smoke test (real Chrome, ?net=local BroadcastChannel transport, one browser context, two pages).
//
// Covers: public town channel auto-join + presence + remote player + nameplate, Genel chat + whisper round trip, party host / join,
// arena 1v1 queue -> proposal -> match -> prep gates -> round -> kill -> result + rating delta + Onur/Fetih, and console error collection.
//
// Run (dev server for THIS checkout must be up, e.g. `npx vite --port 5181 --strictPort`):
//   MP_URL=http://127.0.0.1:5181 MP_PW=<dir that has node_modules/playwright-core> node tools/qa/mp-smoke.mjs
// Env: MP_URL (default http://127.0.0.1:5181), MP_PW (dir containing node_modules/playwright-core; default env QA_DIR, else ./tools/qa),
//      MP_CHROME (default C:/Program Files/Google/Chrome/Application/chrome.exe), MP_HEADED=1 to watch, MP_STAGES=1,4 to run only those stages (1 always runs).
// Screenshots go to tools/qa/out/ (gitignored). Exit code 0 = all assertions passed and no console / page errors.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.MP_URL ?? 'http://127.0.0.1:5181';
const PW_DIR = process.env.MP_PW ?? process.env.QA_DIR ?? HERE;
const CHROME = process.env.MP_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const STAGES = process.env.MP_STAGES ? process.env.MP_STAGES.split(',').map(Number) : null; // e.g. MP_STAGES=1,4 runs only those stages (stage 1 always runs: it sets the two clients up)
const run = (n) => !STAGES || n === 1 || STAGES.includes(n);

const req = createRequire(path.join(path.resolve(PW_DIR), 'noop.js'));
const pwMod = await import(pathToFileURL(req.resolve('playwright-core')).href);
const chromium = pwMod.chromium ?? pwMod.default.chromium;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let shotN = 0;
const check = (name, ok, info = '') => {
  results.push({ name, ok: !!ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  return !!ok;
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: process.env.MP_HEADED !== '1',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const ctx = await browser.newContext({ viewport: { width: 1024, height: 600 } });
const errors = [];
const NOISE = /WebSocket|nostr|satellite|ERR_|favicon|net::|Failed to load resource/i;

async function open(tag, name, cls, lvl, nation) {
  const page = await ctx.newPage();
  // two tabs in one window: without this Chrome throttles the one in the background to ~1 fps (a host would stall the whole match)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NOISE.test(t)) errors.push(`${tag} console.error: ${t.slice(0, 300)}`);
  });
  await page.goto(`${BASE}/dev/scenes.html?scene=town&net=local&name=${name}&class=${cls}&lvl=${lvl}&nation=${nation}`, { waitUntil: 'load', timeout: 90000 });
  await page.waitForFunction(() => window.G?.scenes?.current?.id === 'town' && window.G?.player && window.G?.net?.sceneIsReady, null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__chat = [];
    window.G.events.on('net:chat', (l) => window.__chat.push(l));
    window.__ev = [];
    for (const k of ['arena:queue', 'arena:phase', 'arena:out', 'arena:result', 'pvp:rating', 'net:status', 'ui:toast']) {
      try { window.G.events.on(k, (e) => window.__ev.push({ t: Math.round(performance.now()), k, e: JSON.parse(JSON.stringify(e ?? null, (_, v) => (typeof v === 'function' ? undefined : v))) })); } catch { /* unknown event */ }
    }
  });
  return page;
}
async function shot(page, tag, label) {
  shotN++;
  await page.screenshot({ path: path.join(OUT, `${String(shotN).padStart(2, '0')}_${tag}_${label}.png`) });
}
const until = async (page, fn, arg, timeout = 30000, what = 'condition') => {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 250 });
    return true;
  } catch {
    console.log(`  (timeout waiting for ${what})`);
    return false;
  }
};
// types into the real chat box (hud.chat.input) and presses Enter, exactly like the keyboard path (the input is hidden until focused)
async function say(page, text) {
  await page.evaluate((t) => {
    const c = window.G.ui.hud.chat;
    c.input.value = t;
    c.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }, text);
}

let A;
let B;
let failedEarly = false;
try {
  A = await open('A', 'Aylin', 'knight', 25, 'gok_kartal');
  B = await open('B', 'Demirhan', 'mage', 25, 'gok_kartal');
  await sleep(500);

  // ---------------------------------------------------------------------------------------------- 1. channel + presence
  console.log('== 1. town channel, presence, remote entity, nameplate');
  const joined = await Promise.all([A, B].map((p) => until(p, () => window.G.net.channel && window.G.net.peers.size >= 2, null, 45000, 'channel + 2 peers')));
  check('1.a both auto-join a public channel with 2 peers', joined[0] && joined[1]);
  const st = await Promise.all([A, B].map((p) => p.evaluate(() => ({
    ch: window.G.net.channel ? `${window.G.net.channel.zone}:${window.G.net.channel.num}` : null,
    role: window.G.net.role, peers: window.G.net.peers.size, remote: window.G.net.replication?.stats.remotePlayers ?? -1,
    pres: window.G.presence?.count?.() ?? -1, names: [...window.G.net.peers.values()].map((p2) => p2.name),
  }))));
  console.log('  state', JSON.stringify(st));
  check('1.b same channel', st[0].ch && st[0].ch === st[1].ch, `${st[0].ch} / ${st[1].ch}`);
  check('1.c one host, one client', new Set([st[0].role, st[1].role]).size === 2 && st.some((s) => s.role === 'host'), `${st[0].role}/${st[1].role}`);
  const rem = await Promise.all([A, B].map((p) => until(p, () => (window.G.net.replication?.stats.remotePlayers ?? 0) >= 1, null, 30000, 'remote player entity')));
  check('1.d remote player entity present on both', rem[0] && rem[1]);
  const pres = await Promise.all([A, B].map((p) => until(p, () => window.G.presence.count() === 2, null, 30000, 'presence 2')));
  check('1.e presence count 2 on both', pres[0] && pres[1], JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(() => window.G.presence.list().map((e) => e.name))))));
  // nameplate of the other player (DOM .np-name); nudge the camera is not needed: both spawn next to each other
  const plates = await Promise.all([[A, 'Demirhan'], [B, 'Aylin']].map(async ([p, other]) => {
    const ok = await until(p, (n) => [...document.querySelectorAll('.np-name')].some((e) => e.textContent.includes(n)), other, 20000, 'nameplate');
    return ok;
  }));
  check('1.f nameplate of the other player visible on both', plates[0] && plates[1], JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(() => [...document.querySelectorAll('.np-name')].map((e) => e.textContent))))));
  await shot(A, 'A', 'town');
  await shot(B, 'B', 'town');
  const kanal = await Promise.all([A, B].map(async (p) => {
    const n0 = await p.evaluate(() => window.__chat.length);
    await say(p, '/kanal');
    await sleep(300);
    return p.evaluate((n) => window.__chat.slice(n).map((l) => l.text), n0);
  }));
  console.log('  /kanal A:', JSON.stringify(kanal[0]));
  check('1.g /kanal prints the channel list (no "bir kanala bağlı değilsin")', kanal.every((k) => k.length && !k.some((l) => /bağlı değilsin|kanal yok/.test(l))));

  // ---------------------------------------------------------------------------------------------- 2. chat + whisper
  if (run(2)) {
  console.log('== 2. global chat + whisper');
  await say(A, '/g merhaba dunya');
  const g1 = await until(B, () => window.__chat.some((l) => l.channel === 'global' && l.text === 'merhaba dunya' && l.from === 'Aylin'), null, 15000, 'global chat at B');
  check('2.a global chat A -> B', g1);
  await sleep(1300);
  await say(B, '/g selam aylin');
  const g2 = await until(A, () => window.__chat.some((l) => l.channel === 'global' && l.text === 'selam aylin' && l.from === 'Demirhan'), null, 15000, 'global chat at A');
  check('2.b global chat B -> A', g2);
  await say(A, '/w Demirhan fisilti testi');
  const w1 = await until(B, () => window.__chat.some((l) => l.channel === 'whisper' && l.text === 'fisilti testi' && l.from === 'Aylin'), null, 15000, 'whisper at B');
  check('2.c whisper A -> B', w1);
  await sleep(1200);
  await say(B, '/r yanit geldi');
  const w2 = await until(A, () => window.__chat.some((l) => l.channel === 'whisper' && l.text === 'yanit geldi' && l.from === 'Demirhan'), null, 15000, 'whisper reply at A');
  check('2.d whisper reply (/r) B -> A', w2);
  await shot(A, 'A', 'chat');
  }

  // ---------------------------------------------------------------------------------------------- 3. party (host room + invite via the room list / code)
  if (run(3)) {
  console.log('== 3. party: A hosts, B sees the room in the browser, B joins');
  await B.evaluate(() => window.G.net.startBrowsing({ transport: 'local' }));
  const code = await A.evaluate(() => window.G.net.hostRoom({ name: 'Smoke Grubu', transport: 'local' }));
  check('3.a host creates a party room (code returned)', typeof code === 'string' && code.length >= 4, String(code));
  const listed = await until(B, (c) => window.G.net.listRooms().some((r) => r.roomId.includes(c)), code, 30000, 'room visible in the browser');
  check('3.b B sees the room announcement (the invite)', listed, JSON.stringify(await B.evaluate(() => window.G.net.listRooms().map((r) => [r.roomId, r.name, r.count, r.joinable]))));
  await B.evaluate(() => window.G.net.stopBrowsing());
  await B.evaluate((c) => window.G.net.joinRoom(c, { transport: 'local' }), code);
  const pj = await Promise.all([A, B].map((p) => until(p, () => window.G.net.inParty && window.G.net.partySize === 2 && window.G.net.sceneIsReady, null, 40000, 'party of 2')));
  check('3.c both in a 2-man party (accept = join)', pj[0] && pj[1]);
  const pst = await Promise.all([A, B].map((p) => p.evaluate(() => ({ role: window.G.net.role, ch: window.G.net.channel, names: window.G.net.partyMembers().map((m) => m.name), leader: window.G.net.partyLeader, scene: window.G.scenes.current?.id }))));
  console.log('  party state', JSON.stringify(pst));
  check('3.d roles host/client, not in a public channel, same member list', pst[0].role === 'host' && pst[1].role === 'client' && !pst[0].ch && !pst[1].ch && pst[0].names.join() === pst[1].names.join() && pst[0].names.length === 2);
  const pf = await Promise.all([A, B].map((p) => until(p, () => (window.G.net.replication?.stats.remotePlayers ?? 0) >= 1, null, 20000, 'remote in party')));
  check('3.e party mates see each other in the world', pf[0] && pf[1]);
  await A.evaluate(() => window.G.net.sendChat('grup sohbeti', 'party'));
  check('3.e2 party chat A -> B', await until(B, () => window.__chat.some((l) => l.channel === 'party' && l.text === 'grup sohbeti'), null, 15000, 'party chat'));
  await shot(A, 'A', 'party');
  await shot(B, 'B', 'party');
  await B.evaluate(() => window.G.net.leaveRoom());
  await A.evaluate(() => window.G.net.leaveRoom());
  const back = await Promise.all([A, B].map((p) => until(p, () => window.G.net.role !== 'offline' && window.G.net.channel && window.G.scenes.current?.id === 'town' && window.G.net.sceneIsReady, null, 45000, 'back in a town channel')));
  check('3.f after leaving, both land in a public town channel again', back[0] && back[1], JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(() => [window.G.net.role, window.G.net.channel?.num, window.G.net.peers.size])))));
  const same = await until(A, () => window.G.net.peers.size === 2, null, 30000, 'channel reunion');
  check('3.g ... and in the SAME channel (2 peers)', same);
  }

  // ---------------------------------------------------------------------------------------------- 4. arena 1v1 ranked, full match
  if (run(4)) {
  console.log('== 4. arena: 1v1 ranked queue -> match -> prep -> live -> kill x2 -> result');
  const snap = (p) => p.evaluate(() => ({
    rating: window.G.arenaLadder.rating('1v1'), games: window.G.arenaLadder.profile?.()?.games?.['1v1'],
    onur: window.G.character.material('onur_puani'), fetih: window.G.character.material('fetih_puani'), self: window.G.net.selfId,
  }));
  const before = await Promise.all([A, B].map(snap));
  console.log('  before', JSON.stringify(before));
  const entered = await Promise.all([A, B].map((p) => p.evaluate(() => window.G.net.queue.enter('arena:1v1:r'))));
  check('4.a both can enter the 1v1 ranked queue', entered.every((e) => e.ok), JSON.stringify(entered));
  const qs = await Promise.all([A, B].map((p) => until(p, () => ['searching', 'proposed', 'joining', 'in_match'].includes(window.G.net.queue.state().phase), null, 10000, 'searching')));
  check('4.b queue state leaves idle (searching or later)', qs[0] && qs[1]);
  await shot(A, 'A', 'queue');
  // the proposer goes straight to hosting (no 'found' notice, its bar shows 'joining'); the member gets the 'found' notice. Both must end up in_match.
  const matched = await Promise.all([A, B].map((p) => until(p, () => window.G.net.queue.state().phase === 'in_match' || window.G.scenes.current?.id === 'dungeon', null, 60000, 'queue in_match')));
  const notices = await Promise.all([A, B].map((p) => p.evaluate(() => window.__ev.filter((x) => x.k === 'arena:queue' && x.e?.notice).map((x) => x.e.notice.k))));
  check('4.c proposal handshake (qprop / qack / room join): both reach in_match, the member got the found notice', matched[0] && matched[1] && notices.flat().includes('found'), JSON.stringify(notices));
  if (notices.flat().includes('declined')) console.log('  NOTE a first proposal was declined/withdrawn before the match formed; timeline:', JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(() => window.__ev.filter((x) => x.k !== 'arena:phase').map((x) => x.t + ' ' + x.k + ' ' + (x.e?.notice ? 'N:' + x.e.notice.k : x.e?.state ? x.e.state.phase : x.e?.role ?? x.e?.text ?? '')))))));
  const inArena = await Promise.all([A, B].map((p) => until(p, () => window.G.scenes.current?.id === 'dungeon' && window.G.net.role !== 'offline' && window.G.net.sceneIsReady && window.__ev.some((x) => x.k === 'arena:phase'), null, 90000, 'arena scene + first phase')));
  check('4.d both in the arena scene, same pvp room (host + client)', inArena[0] && inArena[1], JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(() => [window.G.net.role, window.G.net.roomMode, window.G.net.peers.size, window.G.scenes.current?.id])))));
  const qph = await Promise.all([A, B].map((p) => p.evaluate(() => window.G.net.queue.state().phase)));
  check('4.d2 both queue states are in_match while the arena runs (proposer not bounced to searching by the member qcancel)', qph.every((x) => x === 'in_match') && !notices.flat().includes('declined'), JSON.stringify([qph, notices]));
  const waitPhase = (p, ph, round, ms) => until(p, (a) => window.__ev.some((x) => x.k === 'arena:phase' && x.e.ph === a[0] && x.e.round === a[1]), [ph, round], ms, `phase ${ph} r${round}`);
  const prep1 = await Promise.all([A, B].map((p) => waitPhase(p, 'prep', 1, 60000)));
  check('4.e prep phase round 1 on both (gates closed, 30 s)', prep1[0] && prep1[1]);
  // no hit allowed during prep: invulnerable
  const invs = await Promise.all([A, B].map((p) => p.evaluate(() => ({ inv: !!window.G.player.statuses.invulnerable, same: window.G.player === window.G.world.localPlayer, hp: window.G.player.hp, evs: window.__ev.filter((x) => x.k === 'arena:phase').map((x) => x.e.ph + x.e.round + '@' + Math.round(x.e.left)) }))));
  console.log('  prep dump', JSON.stringify(invs));
  await shot(A, 'A', 'arena_prep');
  await shot(B, 'B', 'arena_prep');
  check('4.f local player is invulnerable during prep (both peers)', invs[0].inv && invs[1].inv);
  const live1 = await Promise.all([A, B].map((p) => waitPhase(p, 'live', 1, 60000)));
  check('4.g gates open: live round 1 on both', live1[0] && live1[1]);
  if (!(live1[0] && live1[1])) console.log('  live dump', JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(async () => { const f0 = window.G.engine.frame; await new Promise((r) => setTimeout(r, 1000)); return { vis: document.visibilityState, fps: window.G.engine.frame - f0, role: window.G.net.role, peers: window.G.net.peers.size, scene: window.G.scenes.current?.id, evs: window.__ev.map((x) => x.k + ':' + (x.e?.ph ?? x.e?.notice?.k ?? x.e?.role ?? '') + (x.e?.left !== undefined ? '@' + Math.round(x.e.left) : '')) }; })))));
  await sleep(1500);
  await shot(A, 'A', 'arena_live');
  // dev hook: kill B through the real death path (Combat.killLocalPlayer -> player:died -> ArenaController -> host ArenaMatch)
  await B.evaluate(() => window.G.combat.killLocalPlayer(null, { by: 'smoke' }));
  const re1 = await Promise.all([A, B].map((p) => until(p, () => window.__ev.some((x) => x.k === 'arena:phase' && x.e.ph === 'round_end' && x.e.round === 1), null, 30000, 'round_end r1')));
  check('4.h B dies -> round 1 ends on both peers', re1[0] && re1[1]);
  const sc = await A.evaluate(() => window.__ev.find((x) => x.k === 'arena:phase' && x.e.ph === 'round_end')?.e.score);
  check('4.i score 1:0 or 0:1 after round 1', Array.isArray(sc) && sc[0] + sc[1] === 1, JSON.stringify(sc));
  const live2 = await Promise.all([A, B].map((p) => waitPhase(p, 'live', 2, 90000)));
  check('4.j round 2 prep -> live (B revived)', live2[0] && live2[1]);
  await sleep(800);
  await B.evaluate(() => window.G.combat.killLocalPlayer(null, { by: 'smoke' }));
  const res = await Promise.all([A, B].map((p) => until(p, () => window.__ev.some((x) => x.k === 'arena:result'), null, 30000, 'arena result')));
  check('4.k match result on both', res[0] && res[1]);
  await sleep(500);
  const r = await Promise.all([A, B].map((p) => p.evaluate(() => window.__ev.find((x) => x.k === 'arena:result')?.e)));
  console.log('  result A', JSON.stringify(r[0]));
  console.log('  result B', JSON.stringify(r[1]));
  const wA = r[0]?.won, wB = r[1]?.won;
  check('4.l exactly one winner, both agree on the score', wA !== wB && wA !== null && JSON.stringify(r[0]?.score?.slice().sort()) === JSON.stringify(r[1]?.score?.slice().sort()));
  check('4.m ranked result carries a rating delta for both sides (winner +, loser -)', !!r[0]?.rating && !!r[1]?.rating && (wA ? r[0].rating.delta > 0 && r[1].rating.delta < 0 : r[1].rating.delta > 0 && r[0].rating.delta < 0), JSON.stringify([r[0]?.rating, r[1]?.rating, r[0]?.rewards, r[1]?.rewards]));
  const after = await Promise.all([A, B].map(snap));
  console.log('  after', JSON.stringify(after));
  const win = wA ? 0 : 1;
  check('4.n winner: rating up, Onur granted to the material balance', after[win].rating > before[win].rating && after[win].onur > before[win].onur, `rating ${before[win].rating}->${after[win].rating} onur ${before[win].onur}->${after[win].onur} fetih ${before[win].fetih}->${after[win].fetih}`);
  check('4.o winner is granted Fetih (ranked win)', after[win].fetih > before[win].fetih, `fetih ${before[win].fetih}->${after[win].fetih}`);
  check('4.p loser: rating down', after[1 - win].rating < before[1 - win].rating, `${before[1 - win].rating}->${after[1 - win].rating}`);
  await shot(A, 'A', 'arena_result');
  await shot(B, 'B', 'arena_result');
  const exitOk = await Promise.all([A, B].map((p) => until(p, () => window.G.scenes.current?.id === 'town' && window.G.net.channel && window.G.net.sceneIsReady && window.G.net.queue.state().phase === 'idle', null, 60000, 'back in the town channel')));
  check('4.q after the result both return to the town channel, queue idle', exitOk[0] && exitOk[1], JSON.stringify(await Promise.all([A, B].map((p) => p.evaluate(() => [window.G.scenes.current?.id, window.G.net.role, window.G.net.channel?.num, window.G.net.peers.size, window.G.net.queue.state().phase])))));
  const reunite = await until(A, () => window.G.net.peers.size === 2, null, 30000, 'channel reunion after arena');
  check('4.r ... and in the same channel again', reunite);
  }
} catch (e) {
  failedEarly = true;
  check('script ran without throwing', false, String(e.stack ?? e).slice(0, 400));
}

// ------------------------------------------------------------------------------------------------ report
await sleep(500);
for (const e of errors) console.log('ERR ' + e);
check('no console errors / pageerrors on either page', errors.length === 0, errors.length ? `${errors.length} (see ERR lines)` : '');
fs.writeFileSync(path.join(OUT, 'mp-smoke-result.json'), JSON.stringify({ results, errors }, null, 1));
await browser.close();
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad || failedEarly ? 1 : 0);
