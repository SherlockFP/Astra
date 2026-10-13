/**
 * Dev page for the HUD module (dev/hud.html). Boots the harness, builds mock data (player, party, enemies, boss, M+ run,
 * skills, statuses) and exposes `window.dev` + hotkeys to fire every HUD feature.
 *   H hurt   G heal   T toast   6 loot   U level-up   X xp   V run countdown   P boss on/off
 *   F interact prompt   9 confirm modal   8 world label   7 loading   0 chat line
 *   Numpad1 zone banner   Numpad2 world announce (metin/rare/boss/info cycle)   Numpad3 accept first available quest
 *   Numpad4 advance the first open objective of the first active quest (QuestTracker)   L quest log (real hotkey)
 *   - dodge roll (charge bar)   = perfect-dodge pop   ` rogue combo point (+switches to rogue)   ; ground-aim hint
 *   ' ready check (answer with Y)   [ resource kind   ] class (knight/rogue/mage)   , hurt party member   Numpad8 kill/revive party member
 *   (`.` is the guide panel now; Numpad8 took the old dev revive key)
 *   LMB / RMB / Q E R / 1-5 (mock casts, REAL combat combo tracker, cooldowns, potions)   Enter chat   I/C/N/K/M/O/J/L/Esc panels
 *   console: window.dev.* (mode, setHp, setRes, bossHp, bossDefeat, cast, interrupt, tooltip, skillTip, setScale, fps...)
 */
import * as THREE from 'three';
import { G } from '../game/G';
import { bootHarness } from './harness';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { CharacterState } from '../systems/CharacterState';
import { DUNGEONS } from '../data/dungeons';
import { BOSSES, ENEMIES } from '../data/enemies';
import { tooltipHooks } from '../ui/widgets/tooltips';
import type { ItemDescription } from '../systems/ItemGen';
import type { ItemInstance } from '../types/items';
import type { SkillDef, SkillSlotKey, StatusId } from '../types/skills';
import type { RunState, AffixId } from '../types/mythic';
import type { DungeonDef } from '../types/dungeons';
import type { EnemyDef, BossDef } from '../types/enemies';
import type { ClassId, Rarity } from '../types/common';

const h = await bootHarness({ orbit: true });
const world = h.world;
const scene = h.scene;

// ---------------------------------------------------------------- character + player
const character = CharacterState.create('Gölge Avcısı', 'knight', 0);
character.save.level = 17;
character.save.xp = 540;
character.save.gold = 48213;
character.stats = { maxHp: 2400, maxResource: 100 };
G.character = character;
(G.progression as unknown as { xpToNext: (l: number) => number }).xpToNext = (l) => 1000 + l * 100;

const player = new Player({ id: 1, slot: 0, classId: 'knight', name: character.save.name, level: 17, isLocal: true, character });
player.resourceType = 'rage';
world.add(player);
world.localPlayer = G.player = player;
player.hp = 1620;
player.maxHp = 2400;
player.resource = 64;
player.maxResource = 100;
function capsule(color: number, height = 2): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, height - 0.9, 4, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.y = height / 2;
  m.castShadow = true;
  return m;
}
player.object3d.add(capsule(0x4a78d8, 2.2));
h.orbit.target.set(0, 1, 0);

// fake camera yaw source for the minimap rotation
const fakeCam = { yaw: 0 };
(G as unknown as { camera: unknown }).camera = fakeCam;

// ---------------------------------------------------------------- mock skills
const sk = (id: string, name: string, icon: string, o: Partial<SkillDef>): SkillDef => ({
  id, classId: 'knight', name, desc: 'Hedeflere {dmg} hasar verir ve {dur} boyunca etki eder.', icon: `/assets/icons/${icon}.svg`, unlockLevel: 1, cost: 0, cooldown: 0, castTime: 0,
  anim: 'x', targeting: 'melee_arc', tags: ['melee'], ...o,
} as SkillDef);
const MOCK: Record<string, SkillDef> = {
  m_slash: sk('m_slash', 'Kılıç Darbesi', 'skill-sword-slash', { cooldown: 0.5, damage: { coef: 1.2, type: 'physical' }, range: 3, arc: 100, tags: ['melee', 'basic'] }),
  m_bash: sk('m_bash', 'Kalkan Vuruşu', 'skill-shield-bash', { cost: 15, cooldown: 6, damage: { coef: 2, type: 'physical' }, statuses: [{ status: 'stun', duration: 2 }], tags: ['melee', 'stun'] }),
  m_whirl: sk('m_whirl', 'Kasırga', 'skill-whirlwind', { cost: 30, cooldown: 9, radius: 5, damage: { coef: 3, type: 'physical' }, tags: ['melee', 'aoe'] }),
  m_charge: sk('m_charge', 'Hücum', 'skill-charge', { cost: 10, cooldown: 14, range: 12, tags: ['movement', 'melee'] }),
  m_nova: sk('m_nova', 'Buz Küresi', 'skill-frost-nova', { cost: 80, cooldown: 24, radius: 8, castTime: 1.5, damage: { coef: 4, type: 'frost' }, tags: ['spell', 'frost', 'aoe'] }),
  m_fire: sk('m_fire', 'Ateş Topu', 'skill-fireball', { cost: 20, cooldown: 3, charges: 3, damage: { coef: 2.5, type: 'fire' }, tags: ['spell', 'fire', 'projectile'], range: 22 }),
  m_ult: sk('m_ult', 'Meteor Yağmuru', 'skill-meteor', { cost: 50, cooldown: 60, damage: { coef: 9, type: 'fire' }, tags: ['spell', 'fire', 'aoe', 'ultimate'], radius: 9 }),
  m_shout: sk('m_shout', 'Savaş Narası', 'skill-war-cry', { cooldown: 30, tags: ['buff'], duration: 12 }),
};
character.save.skillBar = { lmb: 'm_slash', rmb: 'm_bash', q: 'm_whirl', e: 'm_charge', r: 'm_ult', s1: 'm_fire', s2: 'm_nova', s3: 'm_shout' } as Partial<Record<SkillSlotKey, string>>;
const cds = new Map<string, { until: number; total: number; charges: number }>();
let gcdUntil = 0;
const gcdTotal = 0.6;
const skillsAny = G.skills as unknown as Record<string, unknown>;
skillsAny.getDef = (id: string) => MOCK[id];
skillsAny.getGcd = () => ({ remaining: Math.max(0, gcdUntil - performance.now() / 1000), total: gcdTotal });
skillsAny.getCooldown = (_a: unknown, id: string) => {
  const d = MOCK[id];
  const c = cds.get(id);
  const now = performance.now() / 1000;
  const maxCharges = d?.charges ?? 1;
  if (!c) return { remaining: 0, total: d?.cooldown ?? 0, charges: maxCharges, maxCharges };
  const remaining = Math.max(0, c.until - now);
  return { remaining, total: c.total, charges: remaining > 0 && maxCharges > 1 ? c.charges : remaining > 0 ? 0 : maxCharges, maxCharges };
};
const BIND: [string, SkillSlotKey][] = [['skill_lmb', 'lmb'], ['skill_rmb', 'rmb'], ['skill_q', 'q'], ['skill_e', 'e'], ['skill_r', 'r'], ['skill_s1', 's1'], ['skill_s2', 's2'], ['skill_s3', 's3']];

// ---------------------------------------------------------------- mock items + tooltip describer
const ITEMS: Record<string, { it: ItemInstance; d: ItemDescription }> = {};
function mkItem(uid: string, rarity: Rarity, name: string, d: Partial<ItemDescription>): ItemInstance {
  const it: ItemInstance = { uid, baseId: uid, rarity, itemLevel: d.itemLevel ?? 30, affixes: [], name, upgrade: 0 };
  ITEMS[uid] = {
    it,
    d: {
      name, rarity, color: '#fff', slotLabel: 'Tek El Kılıç', itemLevel: 30, requiredLevel: 20, implicitLines: [], affixLines: [], socketLines: [], specialLines: [],
      sellPrice: 340, totalStats: {}, icon: '/assets/icons/item-sword.svg', isEquipment: true, ...d,
    } as ItemDescription,
  };
  return it;
}
const swordEpic = mkItem('dev_sword', 'epic', 'Ejderin Dişi +7', {
  slotLabel: 'Tek El Kılıç', itemLevel: 42, requiredLevel: 30, classes: ['Şövalye', 'Barbar'], damage: { min: 58, max: 94, aps: 1.35, dps: 102.6 },
  implicitLines: ['+12 Güç'], affixLines: [{ text: '+18% Kritik Şansı', tier: 2, kind: 'prefix' }, { text: '+9% Saldırı Hızı', tier: 3, kind: 'suffix', locked: true }, { text: '+240 Maks. Can', tier: 4, kind: 'suffix' }],
  upgradeLine: '+7 Yükseltme: +35% hasar', socketLines: [{ gemName: 'Yakut', text: '+24 Güç', color: '#e03a3a' }, { gemName: null, text: null, color: null }],
  sellPrice: 4820, icon: '/assets/icons/item-sword-rune.svg', totalStats: { str: 36, critChance: 0.18, attackSpeed: 0.09, maxHp: 240 },
});
const swordOld = mkItem('dev_sword_old', 'uncommon', 'Alevli Demir Kılıç', {
  slotLabel: 'Tek El Kılıç', itemLevel: 30, damage: { min: 40, max: 66, aps: 1.2, dps: 63.6 }, affixLines: [{ text: '+8% Kritik Şansı', tier: 1, kind: 'prefix' }],
  totalStats: { str: 10, critChance: 0.08 }, sellPrice: 210,
});
const legend = mkItem('dev_legend', 'legendary', 'Kemik Lordunun Tacı', {
  slotLabel: 'Kask', itemLevel: 55, requiredLevel: 45, armor: 312, implicitLines: ['+40 Dayanıklılık'], affixLines: [{ text: '+320 Maks. Can', tier: 5, kind: 'unique' }, { text: '+22% Ateş Hasarı', tier: 4, kind: 'unique' }],
  specialLines: ['Canın %50\'nin altındayken saldırı ve büyü hızın %25 artar.'], flavor: 'Ölüm yalnızca bir başlangıçtır.', sellPrice: 15200,
  setInfo: { name: 'Kemik Efendisi', pieces: [{ name: 'Kemik Lordunun Tacı', owned: true }, { name: 'Kemik Zırhı', owned: true }, { name: 'Kemik Eldivenleri', owned: false }], bonuses: [{ count: 2, text: '+10% Hasar', active: true }, { count: 3, text: 'Ölüm Nefesi eklenir', active: false }] },
  icon: '/assets/icons/item-helm-horned.svg', totalStats: { vit: 40, maxHp: 320 },
});
const ringRare = mkItem('dev_ring', 'rare', 'Gece Yüzüğü', { slotLabel: 'Yüzük', itemLevel: 36, requiredLevel: 25, affixLines: [{ text: '+6% Hareket Hızı', tier: 2, kind: 'prefix' }, { text: '+31 Zeka', tier: 3, kind: 'suffix' }], sellPrice: 760, icon: '/assets/icons/item-ring-gem.svg', totalStats: { moveSpeedPct: 0.06, int: 31 } });
const potion = mkItem('dev_pot', 'common', 'Can İksiri', { slotLabel: 'İksir', itemLevel: 1, requiredLevel: 1, implicitLines: ['Canının %45\'ini yeniler (3 sn)'], isEquipment: false, stack: 12, sellPrice: 30, icon: '/assets/icons/item-potion-health.svg' });
const realDescribe = tooltipHooks.describe;
tooltipHooks.describe = (item) => {
  const f = ITEMS[item.uid];
  if (f) return f.d;
  return realDescribe(item);
};

// ---------------------------------------------------------------- mock dungeon + boss defs
const fakeDungeon = {
  id: 'dev_crypt', name: 'Kemik Mahzeni', shortName: 'Mahzen', lore: '', levelRange: [1, 10], timerSec: 780, forcesRequired: 100, theme: {}, grid: { w: 1, h: 1 }, rooms: [], doors: [], packs: [],
  bosses: [{ bossId: 'dev_boss1', roomId: 'a', pos: [0, 0], order: 1 }, { bossId: 'dev_boss2', roomId: 'b', pos: [0, 0], order: 2 }, { bossId: 'dev_boss3', roomId: 'c', pos: [0, 0], order: 3 }],
  start: { pos: [0, 0], facing: 0 }, exit: { pos: [0, 0] },
} as unknown as DungeonDef;
DUNGEONS['dev_crypt'] = fakeDungeon;
const baseAbility = { id: 'a', name: 'Vuruş', kind: 'melee', range: 2, cooldown: 2, windup: 0.5, anim: 'x' };
function fakeDef(id: string, name: string, rank: EnemyDef['rank'], extra: Partial<EnemyDef> = {}): EnemyDef {
  return { id, name, model: '', scale: 1, role: 'melee', rank, hpMult: 1, dmgMult: 1, speed: 3, radius: 0.6, aggroRange: 12, attackRange: 2, attackCooldown: 2, basicAttack: baseAbility, abilities: [], forces: 1, xp: 1, anims: { idle: '', walk: '', run: '', death: '' }, ...extra } as unknown as EnemyDef;
}
const bossDef = fakeDef('dev_boss1', 'Kemik Lordu Azrakel', 'boss', {
  radius: 1.6,
  ...({ title: 'Mahzenin Efendisi', enrageTimer: 300, arenaRadius: 20, phases: [{ id: 'phase1', hpBelow: 1.01, abilities: [] }, { id: 'phase2', hpBelow: 0.7, abilities: [] }, { id: 'phase3', hpBelow: 0.3, abilities: [] }] } as Partial<BossDef>),
} as Partial<EnemyDef>) as BossDef;
BOSSES['dev_boss1'] = bossDef;
BOSSES['dev_boss2'] = fakeDef('dev_boss2', 'Ruh Bekçisi Kaldur', 'boss') as BossDef;
BOSSES['dev_boss3'] = fakeDef('dev_boss3', 'Gölge Kraliçe Veyra', 'boss') as BossDef;
ENEMIES['dev_skel'] = fakeDef('dev_skel', 'İskelet Savaşçı', 'trash');
ENEMIES['dev_elite'] = fakeDef('dev_elite', 'Kral Muhafızı', 'elite', { radius: 0.9 });

// ---------------------------------------------------------------- enemies
let nextEnemyId = 100;
function addEnemy(def: EnemyDef, x: number, z: number, level: number, hpFrac = 1, color = 0xb8b090, scale = 1): Enemy {
  const e = new Enemy(nextEnemyId++, def);
  e.level = level;
  e.maxHp = def.rank === 'boss' ? 480000 : def.rank === 'elite' ? 18000 : 2400;
  e.hp = e.maxHp * hpFrac;
  e.position.set(x, 0, z);
  const m = capsule(color, 2 * scale * (def.rank === 'boss' ? 2.4 : 1));
  if (def.rank === 'boss') m.scale.setScalar(1.2);
  e.object3d.add(m);
  e.height = 2 * scale * (def.rank === 'boss' ? 2.4 : 1);
  world.add(e);
  return e;
}
const trash: Enemy[] = [];
for (let i = 0; i < 7; i++) {
  const a = (i / 7) * Math.PI * 2 + 0.3;
  const r = 6 + (i % 3) * 3.5;
  trash.push(addEnemy(ENEMIES['dev_skel'], Math.cos(a) * r, Math.sin(a) * r - 4, 17 + (i % 4) - 1, i === 1 ? 0.45 : i === 4 ? 0.8 : 1));
}
const elite1 = addEnemy(ENEMIES['dev_elite'], -9, -10, 19, 0.7, 0xd8b050, 1.2);
const elite2 = addEnemy(ENEMIES['dev_elite'], 11, -8, 21, 1, 0xd8b050, 1.2);
const boss = addEnemy(bossDef, 0, -22, 22, 0.86, 0xb04040);
trash[1].aggroed = true;
trash[4].aggroed = true;
player.targetId = trash[1].id;

// ---------------------------------------------------------------- party
const party: Player[] = [];
function addPartyMember(id: number, slot: number, cls: ClassId, name: string, level: number, x: number, z: number, hpFrac: number): Player {
  const p = new Player({ id, slot, classId: cls, name, level, isLocal: false });
  p.maxHp = 2000 + slot * 150;
  p.hp = p.maxHp * hpFrac;
  p.maxResource = 100;
  p.resource = 70;
  p.object3d.add(capsule(cls === 'mage' ? 0x9a6ae8 : cls === 'rogue' ? 0x6ad06a : 0xe07a3a, 2.2));
  p.position.set(x, 0, z);
  world.add(p);
  party.push(p);
  return p;
}
addPartyMember(2, 1, 'mage', 'Büyücü_Elif', 16, -4, 3, 0.82);
addPartyMember(3, 2, 'rogue', 'GölgeHan', 18, 5, 4, 0.4);
const deadOne = addPartyMember(4, 3, 'barbarian', 'KızılBayrak', 17, 3, -5, 0);
deadOne.resourceType = 'rage';
void deadOne;

// ---------------------------------------------------------------- statuses
player.statuses.apply('haste' as StatusId, 14, { stacks: 1 });
player.statuses.apply('regen' as StatusId, 40, { stacks: 1 });
player.statuses.apply('fortify' as StatusId, 9999, { stacks: 1 });
player.statuses.apply('empower' as StatusId, 8, { stacks: 3 });
player.statuses.apply('burn' as StatusId, 7, { stacks: 2 });
player.statuses.apply('slow' as StatusId, 9, { stacks: 1 });
player.statuses.apply('bleed' as StatusId, 5, { stacks: 1 });
trash[1].statuses.apply('burn' as StatusId, 6, { stacks: 1 });
trash[1].statuses.apply('slow' as StatusId, 8, { stacks: 1 });
trash[1].statuses.apply('bleed' as StatusId, 5, { stacks: 4 });
boss.statuses.apply('curse' as StatusId, 20, { stacks: 1 });
addPartyMember;

// ---------------------------------------------------------------- M+ run state
const run: RunState = {
  dungeonId: 'dev_crypt', difficulty: 'mythicplus', keyLevel: 12, affixes: ['fortified', 'bolstering', 'necrotic', 'volcanic'] as AffixId[], seed: 1, started: true, startTime: 0,
  elapsed: 498, timerSec: 780, deaths: 3, deathPenaltySec: 45, forces: 67, forcesRequired: 100, bossesKilled: ['dev_boss1'], bossesTotal: 3, completed: false, failed: false,
  inTime: true, upgradeLevels: 0, countdown: 0,
};
const mplusAny = G.mplus as unknown as { state: RunState | null; update: (dt: number) => void };
mplusAny.update = () => {};
mplusAny.state = run;

// ---------------------------------------------------------------- minimap nav: a small dungeon-like layout
const nav = world.nav;
nav.cells.fill(0);
const rooms: [number, number, number, number][] = [[-30, -30, 22, 22], [-6, -6, -1, 1], [20, -26, 56, 14], [-30, 8, 8, 44], [30, 14, 36, 40], [-20, -45, 10, -30]];
for (const [x0, z0, x1, z1] of rooms) nav.setRect(x0, z0, x1, z1, true);
nav.setRect(-4, 20, 4, 30, true);
nav.setRect(-10, -30, 2, -45, true);

// ---------------------------------------------------------------- helpers exposed to the page
/** Drives the REAL combat ComboTracker (G.combat.combo): it emits 'combo:changed', owns the 2 s window and the tier bonus. */
function setCombo(count: number): void {
  const t = G.combat.combo;
  if (count <= 0) { t.reset(); return; }
  t.count = Math.max(0, count - 1);
  t.onHit(1);
}
function hitEnemy(e: Enemy, mult = 1, crit = false): void {
  const amount = Math.round((300 + Math.random() * 400) * mult * (crit ? 2 : 1));
  e.hp = Math.max(1, e.hp - amount);
  G.events.emit('damage', { targetId: e.id, sourceId: player.id, amount, crit, type: 'physical', kind: crit ? 'crit' : 'normal', pos: [e.position.x, 1.5, e.position.z] });
}
function nearestEnemy(): Enemy {
  let best = trash[0];
  let bd = 1e9;
  for (const e of world.enemies) {
    if (e.isDead) continue;
    const d = Math.hypot(e.position.x - player.position.x, e.position.z - player.position.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function castMock(key: SkillSlotKey): void {
  const id = character.save.skillBar[key];
  if (!id) return;
  const d = MOCK[id];
  const now = performance.now() / 1000;
  const c = cds.get(id);
  const maxCharges = d.charges ?? 1;
  if (c && c.until > now && (maxCharges <= 1 || c.charges <= 0)) { G.events.emit('skill:fail', { reason: 'cooldown' }); return; }
  if (d.cost > 0 && player.resource < d.cost) { G.events.emit('skill:fail', { reason: 'resource' }); return; }
  player.resource = Math.max(0, player.resource - Math.max(0, d.cost));
  if (maxCharges > 1) {
    const prev = c && c.until > now ? c.charges : maxCharges;
    cds.set(id, { until: now + d.cooldown, total: d.cooldown, charges: prev - 1 });
  } else if (d.cooldown > 0) cds.set(id, { until: now + d.cooldown, total: d.cooldown, charges: 0 });
  gcdUntil = now + gcdTotal;
  if (d.castTime > 0) {
    player.cast = { skillId: d.id, name: d.name, start: world.time, duration: d.castTime, channel: false, interruptible: true };
    setTimeout(() => { if (player.cast?.skillId === d.id) player.cast = null; }, d.castTime * 1000);
  }
  const t = nearestEnemy();
  hitEnemy(t, d.damage?.coef ?? 1, Math.random() < 0.25);
  if (key === 'lmb') {
    G.combat.combo.onHit(1);
  } else if (d.damage) {
    for (const e of trash.slice(0, 3)) hitEnemy(e, 0.6);
    G.combat.combo.onHit(2);
  }
  if (key === 'lmb' && player.resourceType === 'rage') player.resource = Math.min(player.maxResource, player.resource + 6);
}

let bossOn = false;
function bossToggle(on = !bossOn): void {
  bossOn = on;
  if (on) {
    G.events.emit('boss:engaged', { bossId: 'dev_boss1', entityId: boss.id });
    setTimeout(() => G.events.emit('boss:phase', { bossId: 'dev_boss1', entityId: boss.id, phase: 'phase2' }), 800);
    setTimeout(() => G.events.emit('boss:yell', { bossId: 'dev_boss1', text: 'Kemiklerinizi tozlara karıştıracağım!' }), 1600);
    setTimeout(() => G.events.emit('enemy:castStart', { enemyId: boss.id, abilityId: 'x', name: 'Ruh Patlaması', castTime: 3.5, interruptible: true }), 2200);
  } else {
    G.events.emit('boss:wipe', { bossId: 'dev_boss1' });
  }
}

const KINDS = ['info', 'success', 'warning', 'error', 'loot', 'levelup', 'boss'] as const;
let kindIdx = 0;
/** world:announce samples (WorldAnnounce banner stack, GDD_OPENWORLD §9.4). */
const ANNOUNCE: { kind: 'metin' | 'rare' | 'boss' | 'info'; text: string }[] = [
  { kind: 'metin', text: 'Keder Metini (Gümüşdere) belirdi!' },
  { kind: 'rare', text: 'Kurt Alfası yakınlarda dolaşıyor!' },
  { kind: 'boss', text: 'Ejder Yuvası uyandı!' },
  { kind: 'info', text: 'Gümüşdere Köyü\'ne ulaştın.' },
];
let annIdx = 0;
const dev = {
  G, world, player, enemies: world.enemies, trash, boss, party, run, character,
  mode: (m: 'loading' | 'menu' | 'town' | 'dungeon') => G.ui.setMode(m),
  hurt: (f = 0.15) => {
    const amount = Math.round(player.maxHp * f);
    player.hp = Math.max(1, player.hp - amount);
    G.events.emit('damage', { targetId: player.id, sourceId: boss.id, amount, crit: false, type: 'physical', kind: 'player_hurt', pos: [0, 1, 0] });
  },
  heal: (f = 0.2) => {
    const amount = Math.round(player.maxHp * f);
    player.hp = Math.min(player.maxHp, player.hp + amount);
    G.events.emit('heal', { targetId: player.id, sourceId: null, amount, pos: [0, 1, 0] });
  },
  setHp: (f: number) => { player.hp = player.maxHp * f; },
  setRes: (f: number) => { player.resource = player.maxResource * f; },
  toast: (text?: string, kind?: (typeof KINDS)[number]) => {
    const k = kind ?? KINDS[kindIdx++ % KINDS.length];
    G.ui.toast(text ?? ({ info: 'Sunucuya bağlanıldı', success: 'Görev tamamlandı!', warning: 'Envanterin neredeyse dolu', error: 'Yeterli altının yok', loot: 'Efsanevi eşya düştü!', levelup: 'Seviye 18!', boss: 'Kemik Lordu uyandı!' }[k]), k);
  },
  loot: () => {
    const items = [swordEpic, legend, ringRare, swordOld, potion];
    const it = items[Math.floor(Math.random() * items.length)];
    G.events.emit('loot:pickedUp', { item: it });
    G.events.emit('loot:pickedUp', { gold: 40 + Math.floor(Math.random() * 300) });
  },
  levelUp: () => { character.save.level++; player.level++; G.events.emit('player:levelup', { level: character.save.level }); },
  xp: (n = 120) => { character.save.xp += n; G.events.emit('player:xp', { gained: n, xp: character.save.xp, level: character.save.level, needed: 1000 + character.save.level * 100 }); },
  gold: (n = 250) => { character.save.gold += n; G.events.emit('player:gold', { gold: character.save.gold, delta: n }); },
  zone: () => G.events.emit('ui:zoneName', { title: 'Kemik Mahzeni', subtitle: 'Mitik+ Anahtar Taşı +12' }),
  countdown: () => {
    run.started = false;
    run.countdown = 10;
    run.elapsed = 0;
    const t0 = performance.now();
    const iv = setInterval(() => {
      const left = 10 - (performance.now() - t0) / 1000;
      if (left <= 0) {
        clearInterval(iv);
        run.countdown = 0;
        run.started = true;
        G.events.emit('run:started', { state: run });
      } else run.countdown = left;
    }, 100);
  },
  combo: setCombo,
  bossToggle,
  bossHp: (f: number) => { boss.hp = boss.maxHp * f; },
  bossDefeat: () => { boss.hp = 0; G.events.emit('boss:defeated', { bossId: 'dev_boss1', entityId: boss.id }); },
  cast: (e: Enemy = elite1, name = 'Kıyamet Darbesi', t = 2.5, interruptible = true) => G.events.emit('enemy:castStart', { enemyId: e.id, abilityId: 'x', name, castTime: t, interruptible }),
  interrupt: (e: Enemy = elite1) => G.events.emit('enemy:castEnd', { enemyId: e.id, abilityId: 'x', interrupted: true }),
  prompt: (text: string | null = 'Demirci Hüseyin ile konuş') => G.events.emit('interact:prompt', { text }),
  chat: () => G.events.emit('net:chat', { from: 'Büyücü_Elif', text: 'Boss\'a hazır mısınız? Ben mana içeceğim!', channel: 'party' }),
  sys: () => G.events.emit('net:chat', { from: '', text: 'GölgeHan gruba katıldı.', channel: 'system' }),
  tooltip: (which: 'sword' | 'legend' | 'ring' | 'potion' = 'sword', x = 520, y = 160) => {
    const it = { sword: swordEpic, legend, ring: ringRare, potion }[which];
    G.ui.showItemTooltip(it, x, y, { compare: which === 'sword' ? swordOld : which === 'ring' ? null : null });
  },
  skillTip: (slot: SkillSlotKey = 'q', x = 700, y = 700) => G.ui.showTooltip(G.ui.skillTooltipHTML(MOCK[character.save.skillBar[slot] ?? 'm_slash'], 'Q'), x, y),
  hideTip: () => G.ui.hideTooltip(),
  label: () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff8000, emissive: 0xff6000 }));
    m.position.set(2 + Math.random() * 3, 0.4, 2 + Math.random() * 3);
    scene.add(m);
    G.ui.addWorldLabel(m, '<span style="color:#ff8000">Kemik Lordunun Tacı</span>', { offsetY: 0.9, onClick: () => G.ui.toast('Eşya toplandı', 'success'), className: 'loot', stackGroup: 'loot' });
  },
  confirm: () => G.ui.confirm('Bu eşyayı satmak istediğine emin misin?\nBu işlem geri alınamaz.', 'Sat', 'Vazgeç').then((r) => G.ui.toast(r ? 'Satıldı' : 'İptal edildi', r ? 'success' : 'info')),
  loading: (secs = 4) => {
    G.ui.showLoading(0, 'Dokular yükleniyor...');
    const t0 = performance.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / (secs * 1000));
      G.ui.showLoading(p, p < 0.5 ? 'Dokular yükleniyor...' : p < 0.85 ? 'Zindan inşa ediliyor...' : 'Düşmanlar uyanıyor...');
      if (p >= 1) { clearInterval(iv); G.ui.hideLoading(); }
    }, 100);
  },
  resKind: (k: 'rage' | 'mana' | 'energy') => { player.resourceType = k; },
  killTrash: (i = 0) => { const e = trash[i]; e.hp = 0; G.events.emit('death', { entityId: e.id, killerId: player.id, pos: [e.position.x, 1, e.position.z] }); e.destroy(); },
  forces: (n = 4) => { run.forces = Math.min(run.forcesRequired, run.forces + n); },
  bossKill: () => { run.bossesKilled.push('dev_boss2'); },
  setScale: (s: number) => G.ui.setScale(s),
  fps: (on = true) => G.settings.set('showFps', on),
  openFake: () => {
    // register a tiny fake panel to test open/close/Esc/hotkeys
    const el = document.createElement('div');
    el.className = 'panel';
    el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;padding:24px;background:#1b130d;border:2px solid #9b7b36;color:#f1e6cf;font:20px Cinzel';
    el.textContent = 'Sahte Envanter Paneli (Esc ile kapat)';
    const panel = { id: 'fake', el, isOpen: false, open() { this.isOpen = true; }, close() { this.isOpen = false; } };
    G.ui.registerPanel(panel);
    G.ui.openPanel('fake');
  },
  // ---- extras: dodge charges, rogue combo points, perfect dodge, aim hint, ready check, class ----
  dodge: () => { player.dodgeCharges = Math.max(0, player.dodgeCharges - 1); player.dodging = true; setTimeout(() => { player.dodging = false; }, 350); },
  perfect: () => G.events.emit('player:perfectDodge', {}),
  cp: (n = 1) => {
    cpPoints = Math.min(5, Math.max(0, cpPoints + n));
    G.events.emit('combopoints:changed', { points: cpPoints, max: 5 });
  },
  setClass: (c: ClassId) => {
    player.classId = c;
    player.resourceType = c === 'rogue' ? 'energy' : c === 'mage' ? 'mana' : 'rage';
  },
  aim: (on = !aimOn) => {
    aimOn = on;
    if (on) G.events.emit('skill:aimStart', { skillId: 'm_nova' });
    else G.events.emit('skill:aimEnd', { skillId: 'm_nova', cast: false });
  },
  readyCheck: () => {
    const net = G.net as unknown as {
      peers: Map<string, { peerId: string; slot: number; name: string; ready: boolean; ping: number; isHost: boolean; summary: null; keystone: null; loadedScene: null }>;
      readyCheck: unknown; selfId: string;
    };
    const mk = (id: string, slot: number, name: string, ready = false) => ({ peerId: id, slot, name, ready, ping: 40, isHost: slot === 0, summary: null, keystone: null, loadedScene: null });
    Object.defineProperty(G.net, 'isOnline', { get: () => true, configurable: true });
    const me = net.peers.get(net.selfId);
    if (me) { me.ready = false; me.name = character.save.name; }
    net.peers.set('p_elif', mk('p_elif', 1, 'Büyücü_Elif'));
    net.peers.set('p_han', mk('p_han', 2, 'GölgeHan'));
    net.readyCheck = { id: ++rcId, active: true, startedAt: Date.now(), timeoutMs: 30000, by: 'Büyücü_Elif', deadline: performance.now() + 30000, result: null };
    G.events.emit('party:readyCheck', { active: true });
    setTimeout(() => { const p = net.peers.get('p_elif'); if (p) p.ready = true; }, 1500);
    setTimeout(() => { const p = net.peers.get('p_han'); if (p) p.ready = true; }, 4000);
    setTimeout(() => {
      const rc = net.readyCheck as { active: boolean } | null;
      if (rc) rc.active = false;
      for (const k of ['p_elif', 'p_han']) net.peers.delete(k);
      Object.defineProperty(G.net, 'isOnline', { get: () => false, configurable: true });
    }, 30000);
  },
  partyHurt: () => {
    const p = party[Math.floor(Math.random() * 2)];
    p.hp = Math.max(1, p.hp - p.maxHp * 0.25);
  },
  partyRevive: () => { deadOne.hp = deadOne.hp > 0 ? 0 : deadOne.maxHp * 0.5; },
  /** Any game panel by id (console: dev.panel('questlog'), dev.panel('dialog', { npcId: 'npc_g_muhtar' }), dev.panel('waypoints')). */
  panel: (id: string, data?: unknown) => G.ui.openPanel(id, data),
  /** WorldAnnounce: the next sample, or the given kind (console: dev.announce('boss')). Three lines stay on screen at most. */
  announce: (kind?: (typeof ANNOUNCE)[number]['kind']) => {
    const a = ANNOUNCE.find((x) => x.kind === kind) ?? ANNOUNCE[annIdx++ % ANNOUNCE.length];
    G.events.emit('world:announce', { text: a.text, kind: a.kind });
  },
  /** QuestTracker: accept the first quest the character may take (real QuestSystem; the tracker shows it in 'dungeon' mode). */
  quest: () => {
    const q = G.quests;
    const d = q.all().find((x) => q.state(x.id) === 'available');
    if (!d) return G.ui.toast('Alınabilir görev yok.', 'warning');
    if (q.accept(d.id)) console.log('[dev/hud] accepted', d.id);
  },
  /** QuestTracker: advance the first unfinished objective of the first active quest (kill / boss / metin / event kinds). */
  questStep: () => {
    const q = G.quests;
    const d = q.active()[0];
    if (!d) return G.ui.toast('Aktif görev yok.', 'warning');
    const k = q.progressRows(d.id).findIndex((r) => !r.done);
    if (k < 0) return;
    const o = d.objectives[k];
    if (o.kind === 'collect') return G.ui.toast('Toplama adımı: malzeme envantere eklenmeli.', 'info');
    if (o.kind === 'kill' || o.kind === 'boss' || o.kind === 'metin') {
      q.onKill({ enemyId: o.target ?? 'dev_mob', family: o.target ?? (o.kind === 'metin' ? 'metin' : undefined), rank: o.kind === 'boss' ? 'boss' : undefined });
    } else q.onEvent(o.kind, o.target ?? '');
  },
};
let cpPoints = 0;
let aimOn = false;
let rcId = 0;
(window as unknown as { dev: typeof dev }).dev = dev;

// hud-ext modules: later UX packages add dev buttons in src/dev/hud-ext/<package>.ts, each exporting an optional install(h, dev).
const hudExt = import.meta.glob('./hud-ext/*.ts', { eager: true }) as Record<string, { install?: (h: unknown, d: unknown) => void }>;
for (const [path, mod] of Object.entries(hudExt)) {
  try {
    mod.install?.(h, dev);
  } catch (err) {
    console.warn('[dev/hud] hud-ext install failed', path, err);
  }
}

// ---------------------------------------------------------------- per-frame mock simulation
let resTick = 0;
h.onFrame((dt) => {
  // fake camera yaw from the orbit camera
  const cam = h.camera;
  const fx = h.orbit.target.x - cam.position.x, fz = h.orbit.target.z - cam.position.z;
  fakeCam.yaw = Math.atan2(-fx, -fz);
  // keep mocked pools stable (Player.refreshStats may touch them)
  player.maxHp = 2400;
  player.maxResource = 100;
  // passive regen + rage decay
  resTick += dt;
  if (resTick > 0.1) {
    resTick = 0;
    if (player.resourceType === 'rage') player.resource = Math.max(0, player.resource - 0.6);
    else player.resource = Math.min(player.maxResource, player.resource + 1.2);
    if (!player.isDead) player.hp = Math.min(player.maxHp, player.hp + 2);
  }
  // run timer
  if (run.started && !run.completed) run.elapsed += dt;
  // mock casts
  const input = G.input;
  for (const [action, key] of BIND) if (input.pressed(action as never) && !G.ui.wantsCursor()) castMock(key);
  if (input.pressed('potionHp' as never)) { player.statuses.apply('potion_cd' as StatusId, 10, {}); player.hp = Math.min(player.maxHp, player.hp + 600); }
  if (input.pressed('potionMp' as never)) { player.statuses.apply('potion_cd' as StatusId, 10, {}); player.resource = Math.min(player.maxResource, player.resource + 40); }
  // wander enemies a little so nameplates move
  const t = performance.now() / 1000;
  trash.forEach((e, i) => { if (!e.isDead) { e.position.x += Math.sin(t * 0.7 + i) * dt * 0.8; e.position.z += Math.cos(t * 0.5 + i * 2) * dt * 0.8; } });
});

// dev hotkeys (letters not bound to game actions)
const RES_KINDS = ['rage', 'mana', 'energy'] as const;
let promptOn = false;
const keys: Record<string, () => void> = {
  KeyH: () => dev.hurt(0.18),
  KeyG: () => dev.heal(0.2),
  KeyT: () => dev.toast(),
  Digit6: () => dev.loot(),
  KeyU: () => dev.levelUp(),
  KeyF: () => { promptOn = !promptOn; dev.prompt(promptOn ? 'Demirci Hüseyin ile konuş' : null); },
  Minus: () => dev.dodge(),
  Equal: () => dev.perfect(),
  Backquote: () => { if (player.classId !== 'rogue') dev.setClass('rogue'); dev.cp(1); },
  BracketLeft: () => { const k = RES_KINDS[(RES_KINDS.indexOf(player.resourceType as (typeof RES_KINDS)[number]) + 1) % RES_KINDS.length]; dev.resKind(k); },
  BracketRight: () => { dev.setClass(player.classId === 'knight' ? 'rogue' : player.classId === 'rogue' ? 'mage' : 'knight'); },
  Semicolon: () => dev.aim(),
  Quote: () => dev.readyCheck(),
  Comma: () => dev.partyHurt(),
  Numpad8: () => dev.partyRevive(),
  KeyX: () => dev.xp(),
  // KeyL is the real quest-log hotkey now (Input 'quests'), so the zone banner moved to Numpad1
  Numpad1: () => dev.zone(),
  Numpad2: () => dev.announce(),
  Numpad3: () => dev.quest(),
  Numpad4: () => dev.questStep(),
  KeyV: () => dev.countdown(),
  KeyP: () => dev.bossToggle(),
  Digit9: () => void dev.confirm(),
  Digit8: () => dev.label(),
  Digit7: () => dev.loading(),
  Digit0: () => dev.chat(),
};
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  keys[e.code]?.();
});

// legend overlay
const legendEl = document.createElement('div');
legendEl.style.cssText = 'position:fixed;left:50%;bottom:2px;transform:translateX(-50%);font:11px monospace;color:#9a9;background:rgba(0,0,0,.55);padding:2px 8px;z-index:9999;pointer-events:none;white-space:nowrap';
legendEl.textContent = 'H hasar · G şifa · T toast · 6 loot · U seviye · X xp · N1 bölge · N2 duyuru · N3 görev kabul · N4 görev adımı · L görev defteri · V geri sayım · P boss · 9 onay · 8 etiket · 7 yükleme · 0 sohbet · F ipucu · - kaçış · = kusursuz · ` kombo puanı · ; nişan · \' hazır kontrolü (Y) · [ ] kaynak/sınıf · , . grup · LMB/RMB/Q/E/R/1-5 yetenek · Enter sohbet';
document.body.appendChild(legendEl);

G.ui.setMode('dungeon');
G.ui.hud.setVisible(true);
setTimeout(() => { dev.zone(); }, 400);
console.log('[dev/hud] ready — window.dev available');
