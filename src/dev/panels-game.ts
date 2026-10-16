import { G } from '../game/G';
import { weekIndex } from '../core/utils';
import { bootHarness } from './harness';
import { getGamePanel, registerGamePanels } from '../ui/panels/game';
import { installFakeTalents } from './fakeTalents';
import { CharacterState } from '../systems/CharacterState';
import { TALENT_NODES } from '../data/talents';
import { DUNGEONS, DUNGEON_IDS } from '../data/dungeons';
import { ITEM_BASES } from '../data/items';
import { MATERIALS } from '../data/materials';
import { NavGrid } from '../world/NavGrid';
import type { DungeonDef } from '../types/dungeons';
import type { ItemInstance } from '../types/items';
import type { AffixId, RunRecord, RunState } from '../types/mythic';
import type { UIPanel } from '../ui/UI';
import type { RoomInfo, PeerInfo } from '../net/NetSession';

/**
 * DEV PAGE for the panels-game module. Everything here is mock scaffolding used only while other modules'
 * stubs are still empty: fake talent tree, dungeons, character with a keystone, progression, net rooms/peers.
 * Real data wins whenever it exists (each mock only installs if the real thing is empty).
 */
const params = new URLSearchParams(location.search);

// Other agents edit the project constantly: only reload this page for changes in OUR files.
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeFullReload', (payload: { path?: string; triggeredBy?: string }) => {
    const t = `${payload?.triggeredBy ?? ''} ${payload?.path ?? ''}`;
    if (!/panels[\\/]game|panels-game|fakeTalents|styles[\\/]panels-game/.test(t)) throw new Error('[dev] reload blocked: ' + t);
  });
}

/* ------------------------------------------------------------------ fake data */

function fakeDungeons(): void {
  if (Object.keys(DUNGEONS).length) return;
  const defs: [string, string, string, [number, number], number, string][] = [
    ['kemik_mahzeni', 'Kemik Mahzeni', 'Mahzen', [8, 17], 780, 'Unutulmuş kralların iskeletleri artık huzur bulmuyor. Mahzenin derinliklerinde bir lich bekliyor.'],
    ['kizil_dokumhane', 'Kızıl Dökümhane', 'Dökümhane', [18, 29], 810, 'Lav nehirleri üzerine kurulu kadim bir demirhane. Ocaklar hâlâ yanıyor, ustalar hâlâ çalışıyor.'],
    ['buzul_tahti', 'Buzul Tahtı', 'Buzul', [30, 41], 840, 'Donmuş bir kralın tahtı etrafında yeti sürüleri ve buz cadıları toplanmış durumda.'],
    ['golge_tapinagi', 'Gölge Tapınağı', 'Tapınak', [42, 60], 900, 'Karanlık tarikatın son sığınağı. Zakhar uyanmadan onu durdurmalısınız.'],
  ];
  defs.forEach(([id, name, shortName, levelRange, timerSec, lore], di) => {
    const rooms = Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`,
      name: ['Giriş', 'Kemik Salonu', 'Bekçi Odası', 'Mum Odası', 'Ruh Kuyusu', 'Unutulmuş Mezarlar', 'Ceset Çukuru', 'Çökük Tünel', 'Kemik Taht'][i],
      rect: { x: 2 + (i % 3) * 12, z: 2 + Math.floor(i / 3) * 9, w: 8 + ((i * 3 + di) % 3), h: 6 + ((i + di) % 2) },
    }));
    DUNGEONS[id] = {
      id, name, shortName, lore, levelRange, timerSec, forcesRequired: 100 + di * 10,
      theme: { fogColor: 0x101018, fogNear: 10, fogFar: 40, ambient: 0x404050, ambientIntensity: 1, hemiSky: 0x8899aa, hemiGround: 0x222222, torchColor: 0xff9944, music: 'dungeon_crypt' },
      grid: { w: 42, h: 30 }, rooms, doors: [], packs: [], bosses: [], start: { pos: [6, 5], facing: 0 }, exit: { pos: [38, 26] },
    } as unknown as DungeonDef;
    DUNGEON_IDS.push(id);
  });
}

function fakeItems(): ItemInstance[] {
  const bases: [string, string, string][] = [
    ['dev_sword', 'Kemik Kıran Kılıç', '/assets/icons/item-sword-rune.svg'],
    ['dev_helm', 'Buzul Miğferi', '/assets/icons/item-helm-horned.svg'],
    ['dev_ring', 'Kadim Yüzük', '/assets/icons/item-ring-power.svg'],
    ['dev_chest', 'Gölge Zırhı', '/assets/icons/item-chest-leather.svg'],
    ['dev_staff', 'Efsun Asası', '/assets/icons/item-staff-skull.svg'],
  ];
  for (const [id, name, ico] of bases) {
    if (!ITEM_BASES[id]) ITEM_BASES[id] = { id, name, category: 'sword1h', icon: ico, minLevel: 1, itemLevelRange: [1, 99] };
  }
  if (!MATERIALS['dev_dust']) MATERIALS['dev_dust'] = { id: 'dev_dust', name: 'Kadim Toz', desc: '', icon: '/assets/icons/item-crystal-shard.svg', rarity: 'epic', sellPrice: 1, kind: 'currency' };
  const rar = ['rare', 'epic', 'legendary', 'epic', 'rare'] as const;
  return bases.map(([id], i) => ({
    uid: 'dev' + i, baseId: id, rarity: rar[i], itemLevel: 118 + i * 3, upgrade: i === 2 ? 3 : 0,
    affixes: [{ affixId: 'a', stat: 'damagePct', value: 0.12, tier: 2 }, { affixId: 'b', stat: 'critChance', value: 0.04, tier: 1 }],
    weaponDamage: i === 0 ? [88, 131] : undefined,
  }));
}

function weekAffixes(level: number, week = 3): AffixId[] {
  if (level < 2) return [];
  const ROT4: AffixId[] = ['bolstering', 'raging', 'sanguine', 'bursting', 'inspiring', 'volcanic', 'quaking', 'bolstering', 'volcanic', 'raging', 'bursting', 'sanguine'];
  const ROT7: AffixId[] = ['explosive', 'spiteful', 'storming', 'explosive', 'necrotic', 'grievous', 'spiteful', 'storming', 'explosive', 'necrotic', 'spiteful', 'grievous'];
  const r = ((week % 12) + 12) % 12;
  const base: AffixId = r % 2 === 0 ? 'fortified' : 'tyrannical';
  const out: AffixId[] = [base];
  if (level >= 4) out.push(ROT4[r]);
  if (level >= 7) out.push(ROT7[r]);
  if (level >= 10) out.push('seasonal_efsun');
  if (level >= 12) out.push(base === 'fortified' ? 'tyrannical' : 'fortified');
  return out;
}

function mockCharacter(): void {
  const c = CharacterState.create('Efsuncu', (params.get('class') as 'mage') || 'mage', 2);
  c.save.level = 34;
  c.save.gold = 48250;
  c.save.stats = { kills: 1520, deaths: 12, bossKills: 14, dungeonsCompleted: 9, highestKey: 9, legendaryFound: 2 };
  const rec = (d: string, lvl: number, t: number, timer: number, up: number, sc: number): RunRecord => ({ dungeonId: d, keyLevel: lvl, timeSec: t, timerSec: timer, inTime: up > 0, upgrade: up, affixes: weekAffixes(lvl), score: sc, date: Date.now() - 86400000 });
  c.save.mythic = {
    rating: 1234.5,
    best: {
      kemik_mahzeni: { fortified: rec('kemik_mahzeni', 9, 640, 780, 2, 110.3), tyrannical: rec('kemik_mahzeni', 7, 700, 780, 1, 88.2) },
      kizil_dokumhane: { fortified: rec('kizil_dokumhane', 6, 600, 810, 3, 98.1) },
      buzul_tahti: { tyrannical: rec('buzul_tahti', 8, 900, 840, 0, 71.5) },
    },
    weekly: { week: weekIndex(), runs: [rec('kemik_mahzeni', 9, 640, 780, 2, 110), rec('kizil_dokumhane', 6, 600, 810, 3, 98), rec('buzul_tahti', 8, 900, 840, 0, 71), rec('kemik_mahzeni', 5, 500, 780, 3, 80), rec('golge_tapinagi', 4, 880, 900, 1, 60)] },
    vaultClaimedWeek: -1,
    keystone: { dungeonId: 'buzul_tahti', level: 7 },
  };
  c.save.materials = { dev_dust: 12 };
  G.character = c;
}

function mockProgression(): void {
  const P = G.progression;
  const save = () => G.character!.save;
  const isOwnStart = (id: string) => TALENT_NODES[id]?.classStart === save().classId && TALENT_NODES[id]?.kind === 'start';
  const alloc = () => {
    const s = new Set(save().talents);
    for (const id of Object.keys(TALENT_NODES)) if (isOwnStart(id)) s.add(id);
    return s;
  };
  P.talentPointsTotal = () => save().level - 1 + 6;
  P.talentPointsAvailable = () => P.talentPointsTotal() - save().talents.filter((id) => !isOwnStart(id)).length;
  P.canAllocate = (id: string) => {
    const n = TALENT_NODES[id];
    if (!n) return false;
    const a = alloc();
    if (a.has(id) || P.talentPointsAvailable() <= 0) return false;
    return n.links.some((l) => a.has(l));
  };
  P.allocate = (id: string) => {
    if (!P.canAllocate(id)) return false;
    save().talents.push(id);
    G.events.emit('talents:changed', {});
    return true;
  };
  P.refundAll = () => {
    save().talents = [];
    G.events.emit('talents:changed', {});
    return true;
  };
}

function mockMythic(): void {
  const m = G.mplus;
  if (m.affixesFor(5).length) return;
  m.affixesFor = (level: number, week = 3) => weekAffixes(level, week);
  m.scalingFor = (level: number, _affixes: AffixId[], isBoss: boolean) => {
    const mult = level <= 1 ? 1 : level <= 10 ? 1.08 ** (level - 1) : 1.08 ** 9 * 1.1 ** (level - 10);
    return { hp: mult * (isBoss ? 1.3 : 1.2), dmg: mult * (isBoss ? 1.15 : 1.3) };
  };
  m.vaultOptions = () => ({ unlocked: 2, itemLevels: [124, 127] });
  m.computeScore = (level: number, time: number, timer: number) => 20 + 7.5 * level + (time <= timer ? 7.5 * Math.min(1, (timer - time) / (0.4 * timer)) : -10);
}

const FAKE_ROOMS: RoomInfo[] = [
  { roomId: 'KRTL', name: 'Gece Avcıları', hostName: 'Karakurt', players: 3, maxPlayers: 5, activity: 'mythic', dungeonId: 'buzul_tahti', keyLevel: 9, hasPassword: false, version: '0.1.0', lastSeen: Date.now(), ping: 38, hostLevel: 60, hostClass: 'barbarian', affixes: ['fortified', 'bolstering', 'necrotic'], minLevel: 60, compatible: true, joinable: true, inProgress: false },
  { roomId: 'ZMRT', name: 'Yeni başlayanlar', hostName: 'Zümrüt', players: 1, maxPlayers: 4, activity: 'town', hasPassword: false, version: '0.1.0', lastSeen: Date.now(), ping: 71, hostLevel: 4, hostClass: 'mage', compatible: true, joinable: true, inProgress: false },
  { roomId: 'DRGN', name: 'Sadece davetli', hostName: 'Ejder', players: 2, maxPlayers: 5, activity: 'dungeon', dungeonId: 'kemik_mahzeni', hasPassword: true, version: '0.1.0', lastSeen: Date.now(), ping: 120, hostLevel: 12, hostClass: 'knight', compatible: true, joinable: false, inProgress: true },
  { roomId: 'OLMZ', name: 'Eski sürüm', hostName: 'Ahmet', players: 4, maxPlayers: 5, activity: 'mythic', dungeonId: 'golge_tapinagi', keyLevel: 14, hasPassword: false, version: '0.0.9', lastSeen: Date.now(), ping: 230, hostLevel: 60, hostClass: 'rogue', compatible: false, joinable: false, inProgress: false },
];

function mockNet(): void {
  const net = G.net as unknown as Record<string, unknown> & { peers: Map<string, PeerInfo>; role: string; roomId: string | null; selfId: string };
  const me = (): PeerInfo => ({ peerId: net.selfId, slot: 0, name: G.character!.save.name, summary: G.character!.summary(), ready: false, ping: 0, isHost: net.role !== 'client', keystone: G.character!.save.mythic.keystone, loadedScene: 'town' });
  const fake = (id: string, slot: number, name: string, cls: 'knight' | 'rogue' | 'barbarian', level: number, ks: PeerInfo['keystone'], ready: boolean): PeerInfo => ({
    peerId: id, slot, name, summary: { id, name, classId: cls, level, itemLevel: 100 + slot * 6, rating: 400 + slot * 330, variant: 0 }, ready, ping: 30 + slot * 17, isHost: false, keystone: ks, loadedScene: 'town',
  });
  const emitParty = () => {
    G.events.emit('party:changed', {});
    G.events.emit('net:status', { role: net.role as 'host', connected: net.role !== 'offline', roomId: net.roomId });
  };
  net.listRooms = () => FAKE_ROOMS;
  net.startBrowsing = () => {};
  net.stopBrowsing = () => {};
  net.hostRoom = async (opts: { name: string }) => {
    net.role = 'host';
    net.roomId = 'WXYZ';
    net.peers.clear();
    net.peers.set(net.selfId, me());
    net.peers.set('p2', fake('p2', 1, 'Demirpençe', 'knight', 36, { dungeonId: 'kemik_mahzeni', level: 5 }, true));
    net.peers.set('p3', fake('p3', 2, 'Gölgeİz', 'rogue', 33, null, false));
    emitParty();
    console.log('[dev] hostRoom', opts);
    return 'WXYZ';
  };
  net.joinRoom = async (id: string) => {
    net.role = 'client';
    net.roomId = id;
    net.peers.clear();
    const host = fake('h', 0, 'Karakurt', 'barbarian', 40, { dungeonId: 'golge_tapinagi', level: 11 }, true);
    host.isHost = true;
    net.peers.set('h', host);
    const m = me();
    m.slot = 1;
    m.isHost = false;
    net.peers.set(net.selfId, m);
    emitParty();
  };
  net.leaveRoom = () => {
    net.role = 'offline';
    net.roomId = null;
    net.peers.clear();
    emitParty();
  };
  net.setReady = (r: boolean) => {
    const p = net.peers.get(net.selfId);
    if (p) p.ready = r;
    emitParty();
  };
  net.signalStatus = () => ({ open: 3, total: 5 });
  net.startReadyCheck = () => {
    for (const p of net.peers.values()) p.ready = p.peerId === net.selfId;
    net.readyCheck = { id: 1, active: true, startedAt: Date.now(), timeoutMs: 8000, by: 'Karakurt', deadline: 0, result: null };
    emitParty();
    G.events.emit('party:readyCheck', { active: true });
    setTimeout(() => {
      for (const p of net.peers.values()) p.ready = true;
      net.readyCheck = { id: 1, active: false, startedAt: Date.now() - 8000, timeoutMs: 8000, by: 'Karakurt', deadline: 0, result: { ok: true, notReady: [] } };
      emitParty();
      G.events.emit('party:readyCheck', { active: false });
    }, 6500);
  };
  net.kick = (id: string) => {
    net.peers.delete(id);
    emitParty();
  };
  net.requestScene = (scene: string, p: unknown) => {
    console.log('[dev] requestScene', scene, p);
    G.ui.toast(`requestScene(${scene}) ${JSON.stringify(p).slice(0, 120)}`, 'info');
  };
  net.requestSceneFromHost = net.requestScene;
}

/* ------------------------------------------------------------------ mock UI host (only if hud's UI is still a stub) */

function installMockHost(): void {
  const ui = G.ui as unknown as Record<string, unknown>;
  const panels = new Map<string, UIPanel>();
  const order: string[] = [];
  const toasts = document.getElementById('dev-toasts')!;
  ui.registerPanel = (p: UIPanel) => panels.set(p.id, p);
  ui.openPanel = (id: string, data?: unknown) => {
    const p = panels.get(id);
    if (!p) return console.warn('[dev] unknown panel', id);
    p.open(data);
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
    order.push(id);
  };
  ui.closePanel = (id: string) => {
    panels.get(id)?.close();
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
  };
  ui.togglePanel = (id: string, data?: unknown) => (panels.get(id)?.isOpen ? (ui.closePanel as (id: string) => void)(id) : (ui.openPanel as (id: string, d?: unknown) => void)(id, data));
  ui.closeAll = () => [...order].forEach((id) => (ui.closePanel as (id: string) => void)(id));
  ui.isPanelOpen = (id: string) => !!panels.get(id)?.isOpen;
  ui.wantsCursor = () => [...panels.values()].some((p) => p.isOpen);
  ui.toast = (text: string, kind = 'info') => {
    const d = document.createElement('div');
    d.textContent = text;
    if (kind === 'warning' || kind === 'error') d.style.borderColor = '#ff6a5a';
    toasts.append(d);
    setTimeout(() => d.remove(), 3100);
  };
  ui.itemTooltipHTML = () => '';
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    const top = order[order.length - 1];
    if (top) (ui.closePanel as (id: string) => void)(top);
    else (ui.openPanel as (id: string) => void)('gameMenu');
  });
  registerGamePanels(G.ui);
  // re-register into the mock registry (registerGamePanels used G.ui.registerPanel which is now the mock)
}

/* ------------------------------------------------------------------ world for the map */

function mockWorld(): void {
  const def = DUNGEONS['kemik_mahzeni'];
  if (!def || !G.world) return;
  const T = 4;
  const nav = new NavGrid({ originX: 0, originZ: 0, width: def.grid.w * T, depth: def.grid.h * T, cellSize: 1 });
  const centers: [number, number][] = [];
  for (const r of def.rooms) {
    nav.setRect(r.rect.x * T, r.rect.z * T, (r.rect.x + r.rect.w) * T, (r.rect.z + r.rect.h) * T, true);
    centers.push([(r.rect.x + r.rect.w / 2) * T, (r.rect.z + r.rect.h / 2) * T]);
  }
  for (let i = 1; i < centers.length; i++) {
    const [ax, az] = centers[i - 1];
    const [bx, bz] = centers[i];
    nav.setRect(Math.min(ax, bx) - 2, az - 2, Math.max(ax, bx) + 2, az + 2, true);
    nav.setRect(bx - 2, Math.min(az, bz) - 2, bx + 2, Math.max(az, bz) + 2, true);
  }
  G.world.nav = nav;
  const mkPlayer = (name: string, cls: string, x: number, z: number, local: boolean) => ({ name, classId: cls, isLocal: local, position: { x, y: 0, z }, yaw: 0.6, kind: 'player', isDead: false, alive: true, statuses: { apply: () => true, clear: () => {} } });
  const me = mkPlayer('Efsuncu', 'mage', centers[1][0], centers[1][1], true);
  (G.world.players as unknown[]).push(me, mkPlayer('Demirpençe', 'knight', centers[1][0] + 5, centers[1][1] + 3, false));
  (G as unknown as { player: unknown }).player = me;
  // dev: reviveLocalPlayer just flips the mock flag and tells the panels like the real Combat does
  (G.combat as unknown as { reviveLocalPlayer: (f: number) => void }).reviveLocalPlayer = () => {
    me.isDead = false;
    me.alive = true;
    G.events.emit('player:revived', { entityId: 1, local: true });
  };
  (G.scenes as unknown as { current: unknown }).current = { id: 'dungeon' };
  G.mplus.state = { dungeonId: 'kemik_mahzeni', difficulty: 'mythicplus', keyLevel: 7, affixes: weekAffixes(7), seed: 1, started: true, startTime: 0, elapsed: 300, timerSec: 780, deaths: 2, deathPenaltySec: 30, forces: 40, forcesRequired: 100, bossesKilled: [], bossesTotal: 3, completed: false, failed: false, inTime: true, upgradeLevels: 0, countdown: 0 };
}

/* ------------------------------------------------------------------ run summary payloads */

function runPayload(kind: 'timed3' | 'timed1' | 'untimed'): { state: RunState; record: RunRecord; rewards: ItemInstance[] } {
  const timer = 840;
  const t = kind === 'timed3' ? 480 : kind === 'timed1' ? 810 : 990;
  const up = kind === 'timed3' ? 3 : kind === 'timed1' ? 1 : 0;
  const state: RunState = {
    dungeonId: 'buzul_tahti', difficulty: 'mythicplus', keyLevel: 7, affixes: weekAffixes(7), seed: 5, started: true, startTime: 0,
    elapsed: t, timerSec: timer, deaths: kind === 'timed3' ? 1 : 4, deathPenaltySec: kind === 'timed3' ? 15 : 60, forces: 100, forcesRequired: 100,
    bossesKilled: ['a', 'b', 'c'], bossesTotal: 3, completed: true, failed: false, inTime: up > 0, upgradeLevels: up, countdown: 0,
  };
  const record: RunRecord = { dungeonId: 'buzul_tahti', keyLevel: 7, timeSec: t, timerSec: timer, inTime: up > 0, upgrade: up, affixes: state.affixes, score: 96.4, date: Date.now() };
  // the run tally (XP bar with a level-up, gold, ground pickups) the end card reads
  const items = fakeItems();
  const tally = {
    key: `${state.dungeonId}|${state.seed}|${state.keyLevel}|${Math.round(state.elapsed)}`,
    xp: kind === 'untimed' ? 620 : 1840,
    start: { level: 9, xp: 300, needed: 2400 },
    end: { level: 10, xp: 260, needed: 2600 },
    levelUps: kind === 'untimed' ? [] : [10],
    gold: 1260,
    items: items.slice(3, 9),
    materials: [{ id: 'pot_hp_1', count: 3 }],
  };
  return { state, record, rewards: items.slice(0, 3), tally, force: true } as { state: RunState; record: RunRecord; rewards: ItemInstance[] };
}

/* ------------------------------------------------------------------ boot */

async function main(): Promise<void> {
  const h = await bootHarness({ floor: false, orbit: false });
  h.orbit.enabled = false;
  (G.engine.canvas as HTMLCanvasElement).style.background = '#0b0907';

  fakeDungeons();
  fakeItems();
  mockCharacter();
  const usedFakeTree = installFakeTalents();
  const realProgression = typeof (G.progression as unknown as { refundAllCost?: unknown }).refundAllCost === 'function';
  if (usedFakeTree || !realProgression) mockProgression();
  mockMythic();
  if (params.get('net') !== 'real') mockNet();
  mockWorld();

  // is hud's UI real? (then registerPanels already ran inside UI.init and our registry is filled)
  const realUI = !!getGamePanel('talents');
  if (!realUI) installMockHost();
  console.log('[dev] UI host:', realUI ? 'real (hud)' : 'mock');

  const openDev = (id: string, data?: unknown) => {
    G.ui.openPanel(id, data);
    const p = getGamePanel(id);
    if (p && !p.isOpen) p.open(data);
  };
  const bar = document.getElementById('dev-bar')!;
  const add = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = fn;
    bar.append(b);
  };
  const sep = (t: string) => {
    const s = document.createElement('span');
    s.textContent = t;
    bar.append(s);
  };
  sep('panel:');
  for (const id of ['talents', 'keystone', 'mplusInfo', 'settings', 'party', 'map', 'gameMenu', 'bounty', 'trainer', 'credits', 'questlog', 'waypoints']) add(id, () => openDev(id));
  add('death', () => openDev('death'));
  sep('özel:');
  // quest-giver dialog: { npcId, quests }. npc_g_avci = Av Defteri collector (bio section), npc_g_muhtar = offers quests
  add('dialog (Av Defteri)', () => openDev('dialog', { npcId: 'npc_g_avci' }));
  add('dialog (muhtar)', () => openDev('dialog', { npcId: 'npc_g_muhtar' }));
  add('görev kabul (ilk)', () => {
    const q = G.quests;
    const d = q.all().find((x) => q.state(x.id) === 'available');
    if (d && q.accept(d.id)) openDev('questlog');
    else G.ui.toast('Alınabilir görev yok.', 'warning');
  });
  add('keystone (anahtarsız)', () => {
    const ks = G.character!.save.mythic.keystone;
    G.character!.save.mythic.keystone = null;
    openDev('keystone', { dungeonId: 'kizil_dokumhane' });
    G.character!.save.mythic.keystone = ks;
  });
  add('özet +3', () => openDev('runSummary', runPayload('timed3')));
  add('özet +1', () => openDev('runSummary', runPayload('timed1')));
  add('özet süre aşımı', () => openDev('runSummary', runPayload('untimed')));
  add('sahne: town/dungeon', () => {
    const cur = (G.scenes as unknown as { current: { id: string } }).current;
    cur.id = cur.id === 'town' ? 'dungeon' : 'town';
    G.ui.toast('Sahne: ' + cur.id, 'info');
  });
  add('keystone (usta)', () => openDev('keystone', { tab: 'svc' }));
  add('keystone (kasa)', () => openDev('keystone', { tab: 'vault' }));
  add('M+ bilgisi (kasa)', () => openDev('mplusInfo', { focus: 'vault' }));
  add('player:died', () => G.events.emit('player:died', { entityId: 1, local: true }));
  add('öl (gerçek)', () => {
    const pl = G.player as unknown as { isDead: boolean; alive: boolean };
    pl.isDead = true;
    pl.alive = false;
    G.events.emit('player:died', { entityId: 1, local: true });
  });
  add('diril', () => {
    const pl = G.player as unknown as { isDead: boolean; alive: boolean };
    pl.isDead = false;
    pl.alive = true;
    G.events.emit('player:revived', { entityId: 1, local: true });
  });
  add('altın +5000', () => {
    G.character!.addGold(5000);
    G.ui.toast('+5000 altın', 'info');
  });
  add('seviye +5', () => {
    G.character!.save.level += 5;
    G.events.emit('player:levelup', { level: G.character!.save.level });
  });
  (window as unknown as Record<string, unknown>).__pg = { openDev, runPayload, G };
  const q = params.get('open');
  if (q) setTimeout(() => openDev(q), 300);
}

main().catch((e) => console.error('[dev] boot failed', e));
