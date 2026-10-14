import * as THREE from 'three';
import { bootHarness } from './harness';
import { G } from '../game/G';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { PlayerController } from '../game/PlayerController';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { CharacterState } from '../systems/CharacterState';
import { describeItem, generateItem, generateSetPiece, generateUnique, itemDisplayName, sellValue, type ItemDescription } from '../systems/ItemGen';
import { rollUpgradeOutcome, upgradeChance, upgradeItem, efsun, socketGem, addSocket, salvageItem, upgradeCost, combineGems } from '../systems/Upgrade';
import { vendorEntries, buy, sell, buyback, buybackList, sealOffers, buySealOffer, gamble, gambleOptions, gambleCost } from '../systems/Vendor';
import { dailyBounties, bountyEvent, claimBounty, weeklyDecree, claimWeeklyDecree, bountyWeekKey } from '../systems/Bounties';
import { UNIQUES, SETS, SET_PIECES, CLASS_SET } from '../data/uniques';
import { UPGRADE_STEPS, upgradeGold } from '../data/upgrades';
import { MATERIALS, gemId } from '../data/materials';
import { STAT_INFO, type StatId } from '../types/stats';
import { RARITY_COLORS, RARITY_NAMES_TR, type ClassId, type Rarity } from '../types/common';
import type { ItemInstance, EquipSlot } from '../types/items';
import type { EnemyDef } from '../types/enemies';
import { RNG, h } from '../core/utils';
import { TALENT_NODES } from '../data/talents';

/**
 * DEV PAGE for the items module. URL params: ?class=knight|barbarian|mage|rogue &level=30
 * Buttons: item cards (describeItem), upgrade simulation (1000 attempts per level), loot drops (arc/beam/label/magnet),
 * boss kill (fountain + XP), equip + stat recompute, set/legendary showcases, smoke test of every system.
 * Console: window.dev.* helpers.
 */
const q = new URLSearchParams(location.search);
const hh = await bootHarness({ orbit: false, floorSize: 160 });
const { scene, world } = hh;
scene.fog = new THREE.Fog(0x14121a, 50, 160);
scene.add(new THREE.AmbientLight(0xffffff, 1.2));
try {
  G.settings.set('cameraMode', 'classic');
  G.settings.set('cameraDistance', 13);
} catch {
  /* ignore */
}

const rng = new RNG(1337);
let classId: ClassId = (q.get('class') as ClassId) || 'knight';
let startLevel = Number(q.get('level') ?? 20);
let player: Player | null = null;
let controller: PlayerController | null = null;
let cam: ThirdPersonCamera | null = null;
let fakeId = 900;

// ------------------------------------------------------------------------------------------------------ helpers
const logEl = h('div#dev-log');
const logLines: string[] = [];
function log(msg: string, cls = ''): void {
  logLines.push(`${cls === 'bad' ? '[X] ' : cls === 'ok' ? '[ok] ' : ''}${msg}`);
  if (logLines.length > 300) logLines.shift();
  logEl.textContent = logLines.join('\n');
  console.log('[items]', msg);
}
const toastBox = document.getElementById('dev-toasts') as HTMLElement;
function devToast(text: string): void {
  const d = h('div', null, text);
  toastBox.append(d);
  setTimeout(() => d.remove(), 3000);
}
G.events.on('player:levelup', ({ level }) => log(`SEVİYE ATLADI -> ${level}`, 'ok'));
G.events.on('loot:pickedUp', (e) => log(`alındı: ${e.item ? itemDisplayName(e.item) : e.gold ? e.gold + ' altın' : e.material ? e.material.id + ' x' + e.material.count : 'küre'}`));

// ------------------------------------------------------------------------------------------------------ player
async function spawnPlayer(cls: ClassId, level: number): Promise<void> {
  const prev = player ? player.position.clone() : new THREE.Vector3(0, 0, 0);
  controller?.dispose();
  if (player) world.remove(player);
  classId = cls;
  const ch = CharacterState.create('Test', cls, 0);
  G.character = ch;
  G.progression.setLevel(level);
  ch.save.gold = 250000;
  for (const id of Object.keys(MATERIALS)) if (!id.startsWith('gem_') && !id.startsWith('pot_') && !id.startsWith('elixir')) ch.save.materials[id] = 200;
  ch.save.materials.ruh_tasi = 40;
  const p = new Player({ id: 1, slot: 0, classId: cls, name: 'Test', level, isLocal: true, peerId: 'self', character: ch });
  p.position.copy(prev);
  await p.loadModel().catch((e) => log('loadModel: ' + e, 'bad'));
  world.add(p);
  world.localPlayer = G.player = p;
  player = p;
  if (!cam) {
    cam = new ThirdPersonCamera(hh.camera);
    G.camera = cam;
  }
  controller = new PlayerController(p, cam);
  cam.snap();
  ch.recomputeStats();
  p.refreshEquipmentVisuals();
  p.refreshStats();
  renderTab();
}
hh.onFrame((dt) => cam?.update(dt));
G.engine.onUpdate((dt) => controller?.update(dt), -1);

// ------------------------------------------------------------------------------------------------------ item cards
const rarityCls = (r: Rarity) => RARITY_COLORS[r];

function cardFor(item: ItemInstance, extra?: string): HTMLElement {
  const d: ItemDescription = describeItem(item);
  const card = h('div.card', { style: { borderLeftColor: d.color } });
  const title = h('h4', { style: { color: d.color } }, d.name);
  card.append(title);
  card.append(h('div.sub', null, `${RARITY_NAMES_TR[d.rarity]} · ${d.slotLabel}${d.baseName && d.baseName !== d.name.replace(/ \+\d+$/, '') ? ' · ' + d.baseName : ''} · ilvl ${d.itemLevel} · gerekli sv. ${d.requiredLevel}${d.classes ? ' · ' + d.classes.join('/') : ''}${d.bound ? ' · Ruha Bağlı' : ''}${extra ? ' · ' + extra : ''}`));
  if (d.damage) card.append(h('div.ln', null, `Hasar ${d.damage.min}-${d.damage.max} · ${d.damage.aps}/sn · DPS ${d.damage.dps}`));
  if (d.armor !== undefined) card.append(h('div.ln', null, `Zırh ${d.armor}`));
  for (const l of d.implicitLines) card.append(h('div.ln.dim', null, l));
  for (const a of d.affixLines) card.append(h('div.ln', { className: a.kind === 'unique' ? 'uni' : 'aff' }, `${a.text}  ${a.kind === 'unique' ? '◆' : `[T${a.tier}]`}`));
  if (d.upgradeLine) card.append(h('div.ln.gold', null, d.upgradeLine));
  for (const s of d.socketLines) card.append(h('div.ln', { style: { color: s.color ?? '#777' } }, s.gemName ? `◆ ${s.gemName}: ${s.text}` : '◇ Boş yuva'));
  for (const s of d.specialLines) card.append(h('div.ln.uni', null, '★ ' + s));
  if (d.setInfo) {
    card.append(h('div.ln.set', null, `${d.setInfo.name}: ` + d.setInfo.pieces.map((p) => (p.owned ? '■ ' : '□ ') + p.name).join(' · ')));
    for (const b of d.setInfo.bonuses) card.append(h('div.ln', { className: 'set', style: { opacity: b.active ? 1 : 0.5 } }, `(${b.count}) ${b.text}`));
  }
  if (d.flavor) card.append(h('div.ln.dim', null, `"${d.flavor}"`));
  card.append(h('div.sub', null, `Satış ${d.sellPrice} altın · +${d.upgrade ?? 0}/${d.maxUpgrade ?? 0}${d.glow ? ' · ' + d.glow : ''}`));
  const eq = h('button', { onclick: () => {
    G.character?.addItem(item);
    const ok = G.character?.equip(item.uid);
    log(`${itemDisplayName(item)} kuşan: ${ok}`, ok ? 'ok' : 'bad');
    renderTab();
  } }, 'Kuşan');
  const drop = h('button', { onclick: () => player && G.loot.dropItem(item, player.position.clone().add(new THREE.Vector3(Math.sin(player.yaw) * 2, 0, Math.cos(player.yaw) * 2))) }, 'Düşür');
  card.append(h('div', { style: { marginTop: '3px', display: 'flex', gap: '4px' } }, eq, drop));
  return card;
}

let items60: ItemInstance[] = [];
function roll60(): void {
  const ch = G.character!;
  items60 = [];
  const pattern: Rarity[] = ['poor', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'rare', 'epic', 'epic', 'legendary'];
  for (let i = 0; i < 60; i++) {
    const rarity = pattern[i % pattern.length];
    const ilvl = [5, 12, 20, 27, 35, 44, 55, 62, 75][Math.floor(rng.next() * 9)];
    items60.push(generateItem({ itemLevel: ilvl, rarity, classId: i % 3 === 0 ? undefined : classId, smart: i % 3 !== 0 }, rng));
  }
  // a handful of upgraded / socketed showcases
  items60.forEach((it, i) => {
    if (i % 7 === 0 && it.rarity !== 'poor') it.upgrade = [3, 7, 9, 12, 15][i % 5];
    if (i % 9 === 0 && it.sockets) it.sockets[0] = gemId(['ruby', 'emerald', 'sapphire', 'topaz', 'amethyst', 'diamond'][i % 6], 1 + (i % 6));
  });
  ch.save.bag.fill(null);
  items60.slice(0, ch.save.bag.length).forEach((it) => ch.addItem(it));
  log(`60 eşya üretildi (çantada ${ch.save.bag.filter(Boolean).length})`, 'ok');
  tab = 'cards';
  renderTab();
}

// ------------------------------------------------------------------------------------------------------ stats tab
let lastStats: Record<string, number> = {};
function statsView(): HTMLElement {
  const ch = G.character!;
  const wrap = h('div');
  wrap.append(h('div.sub', null, `${ch.save.name} · ${classId} · sv.${ch.level} · XP ${ch.save.xp}/${G.progression.xpToNext(ch.level)} · altın ${ch.save.gold} · ort. eşya sv. ${ch.itemLevel()}`));
  wrap.append(h('div.sub', null, `Pasif puan: ${G.progression.talentPointsAvailable()} / ${G.progression.talentPointsTotal()} · moreDamage ×${ch.moreDamage.toFixed(2)} · setler: ${JSON.stringify(ch.setCounts)}`));
  const t = h('table.t');
  t.append(h('tr', null, h('th', null, 'Stat'), h('th', null, 'Değer'), h('th', null, 'Δ')));
  const keys = Object.keys(ch.stats).filter((k) => Math.abs(ch.stats[k as StatId] ?? 0) > 1e-9).sort();
  for (const k of keys) {
    const v = ch.stats[k as StatId] ?? 0;
    const info = STAT_INFO[k as StatId];
    const prev = lastStats[k] ?? 0;
    const d = v - prev;
    const fmt = (n: number) => (info?.pct ? (n * 100).toFixed(1) + '%' : Number.isInteger(n) ? String(n) : n.toFixed(2));
    t.append(h('tr', null, h('td', null, `${info?.name ?? k}`), h('td', null, fmt(v)), h('td', { className: d > 0 ? 'ok' : d < 0 ? 'bad' : '' }, Math.abs(d) > 1e-9 ? (d > 0 ? '+' : '') + fmt(d) : '')));
  }
  wrap.append(t);
  const sp = Object.values(ch.specials);
  if (sp.length) {
    wrap.append(h('h4', null, 'Özel etkiler'));
    for (const s of sp) wrap.append(h('div.ln', null, `${s.source === 'talent' ? '◈' : s.source === 'set' ? '■' : '★'} ${s.id} — ${s.desc}`));
  }
  const eq = h('div');
  eq.append(h('h4', null, 'Kuşanılanlar'));
  for (const [slot, it] of Object.entries(ch.save.equipment)) eq.append(h('div.ln', { style: { color: it ? rarityCls(it.rarity) : '#777' } }, `${slot}: ${it ? itemDisplayName(it) : '-'}`));
  wrap.append(eq);
  lastStats = Object.fromEntries(Object.entries(ch.stats).map(([k, v]) => [k, v ?? 0]));
  return wrap;
}

// ------------------------------------------------------------------------------------------------------ upgrade simulation
function simulate(): HTMLElement {
  const wrap = h('div');
  const N = 1000;
  const t = h('table.t');
  t.append(h('tr', null, h('th', null, 'Hedef'), h('th', null, 'Beklenen'), h('th', null, 'Gözlenen'), h('th', null, 'Sonuç'), h('th', null, 'kalır'), h('th', null, '-1'), h('th', null, 'yok'), h('th', null, 'koruma:yok'), h('th', null, 'altın@60')));
  let pass = 0;
  for (let target = 1; target <= 15; target++) {
    let ok = 0, stay = 0, down = 0, destroy = 0, protDestroy = 0;
    for (let i = 0; i < N; i++) {
      const r = rollUpgradeOutcome(target, {}, rng);
      if (r.success) ok++;
      else if (r.outcome === 'stay') stay++;
      else if (r.outcome === 'downgrade') down++;
      else destroy++;
      if (rollUpgradeOutcome(target, { useProtection: true }, rng).outcome === 'destroy') protDestroy++;
    }
    const exp = upgradeChance(target);
    const obs = ok / N;
    const sigma = Math.sqrt(exp * (1 - exp) / N);
    const good = Math.abs(obs - exp) <= Math.max(0.012, 3.2 * sigma) && protDestroy === 0;
    if (good) pass++;
    t.append(h('tr', null,
      h('td', null, `+${target - 1}→+${target}`), h('td', null, (exp * 100).toFixed(0) + '%'), h('td', null, (obs * 100).toFixed(1) + '%'),
      h('td', { className: good ? 'ok' : 'bad' }, good ? 'OK' : 'SAPMA'), h('td', null, String(stay)), h('td', null, String(down)), h('td', null, String(destroy)), h('td', null, String(protDestroy)), h('td', null, String(upgradeGold(60, target)))));
  }
  wrap.append(h('div.sub', null, `${N} deneme / seviye · ${pass}/15 tutarlı`));
  wrap.append(t);
  log(`yükseltme simülasyonu: ${pass}/15 tutarlı`, pass === 15 ? 'ok' : 'bad');
  return wrap;
}

// ------------------------------------------------------------------------------------------------------ drops
const fakeEnemies: Enemy[] = [];
function fakeEnemy(rank: 'trash' | 'elite' | 'miniboss' | 'boss', role: 'melee' | 'swarm' = 'melee', lootTable?: string, level = 30): Enemy {
  const xp = rank === 'boss' ? 25 : rank === 'miniboss' ? 6 : rank === 'elite' ? 3 : role === 'swarm' ? 0.3 : 1;
  const def = { id: 'fake_' + rank, name: 'Sahte ' + rank, model: '', scale: 1, role, rank, hpMult: 1, dmgMult: 1, radius: 0.7, speed: 0, abilities: [], xp, forces: 0, lootTable } as unknown as EnemyDef;
  const e = new Enemy(fakeId++, def);
  e.level = level;
  e.height = rank === 'boss' ? 3.2 : 2;
  const fwd = player ? new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)) : new THREE.Vector3(0, 0, 1);
  const pos = (player?.position ?? new THREE.Vector3()).clone().addScaledVector(fwd, 7);
  e.position.copy(pos);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(rank === 'boss' ? 1.1 : 0.55, 1.0, 4, 8), new THREE.MeshStandardMaterial({ color: rank === 'boss' ? 0x7a2030 : 0x30607a, roughness: 0.8 }));
  body.position.y = rank === 'boss' ? 1.6 : 1;
  e.object3d.add(body);
  world.add(e);
  fakeEnemies.push(e);
  return e;
}
function kill(rank: 'trash' | 'elite' | 'miniboss' | 'boss', n = 1, role: 'melee' | 'swarm' = 'melee', table?: string): void {
  for (let i = 0; i < n; i++) {
    const e = fakeEnemy(rank, role, table, G.character?.level ?? 30);
    e.position.x += (i - n / 2) * 0.6;
    G.loot.onEnemyKilled(e);
    e.alive = false;
    setTimeout(() => world.remove(e), 150);
  }
  log(`${n}x ${rank} öldü -> drop sayısı ${G.loot.drops.length}`);
}
function dropRing(): void {
  if (!player) return;
  const rars: Rarity[] = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
  rars.forEach((r, i) => {
    const it = generateItem({ itemLevel: 50, rarity: r, classId }, rng);
    const a = player!.yaw + (i - (rars.length - 1) / 2) * 0.42; // arc in front of the player (the camera is behind)
    G.loot.dropItem(it, player!.position.clone().add(new THREE.Vector3(Math.sin(a) * 6, 0, Math.cos(a) * 6)), { delay: i * 0.12 });
  });
  G.loot.dropGold(1234, player.position.clone().add(new THREE.Vector3(1.5, 0, 3)));
  G.loot.dropMaterial('pot_hp_2', 2, player.position.clone().add(new THREE.Vector3(2, 0, -4)));
  G.loot.dropMaterial('gem_ruby_3', 1, player.position.clone().add(new THREE.Vector3(-2, 0, -4)));
  G.loot.dropGlobe(player.position.clone().add(new THREE.Vector3(-5, 0, 2)));
  log('7 nadirlik + altın + iksir + taş + küre düşürüldü');
}

// ------------------------------------------------------------------------------------------------------ equip all
function equipBest(): void {
  const ch = G.character!;
  const before = JSON.stringify(ch.stats);
  let n = 0;
  for (const it of [...ch.save.bag]) {
    if (!it) continue;
    const slot = ch.pickSlot(it);
    if (!slot) continue;
    const cur = ch.save.equipment[slot];
    if (cur && cur.itemLevel >= it.itemLevel) continue;
    if (ch.canEquip(it, slot).ok && ch.equip(it.uid)) n++;
  }
  log(`${n} parça kuşanıldı; stat değişti: ${before !== JSON.stringify(ch.stats)}`, 'ok');
  player?.refreshEquipmentVisuals();
  tab = 'stats';
  renderTab();
}

function giveSet(): void {
  const ch = G.character!;
  const setId = CLASS_SET[classId];
  const set = SETS[setId];
  for (const pid of set.pieces) {
    const it = generateSetPiece(pid, Math.min(60, Math.max(40, ch.level + 10)), rng);
    ch.addItem(it);
  }
  const lvl = ch.level;
  if (lvl < 58) G.progression.setLevel(58);
  for (const pid of set.pieces) {
    const f = ch.allItems().find((x) => x.item.uniqueId === pid);
    if (f) ch.equip(f.item.uid);
  }
  log(`${set.name} giyildi: ${JSON.stringify(ch.setCounts)}`, 'ok');
  tab = 'stats';
  renderTab();
}

function showLegendaries(): HTMLElement {
  const wrap = h('div');
  for (const u of Object.values(UNIQUES)) {
    const it = generateUnique(u.id, Math.max(u.minItemLevel ?? 1, 45), rng, classId);
    wrap.append(cardFor(it));
  }
  return wrap;
}

function spendTalents(): void {
  const prog = G.progression;
  const ch = G.character!;
  let guard = 200, spent = 0;
  while (prog.talentPointsAvailable() > 0 && guard-- > 0) {
    const cands = Object.keys(TALENT_NODES).filter((id) => prog.canAllocate(id));
    if (!cands.length) break;
    // prefer notables/keystones near the class (greedy random)
    const id = rng.pick(cands);
    if (prog.allocate(id)) spent++;
  }
  log(`${spent} pasif düğüm alındı; kalan puan ${prog.talentPointsAvailable()}; düğümler ${ch.save.talents.length}`, 'ok');
  tab = 'stats';
  renderTab();
}

// ------------------------------------------------------------------------------------------------------ smoke test (every system)
function assert(cond: boolean, msg: string, res: string[]): void {
  res.push(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) log('FAIL: ' + msg, 'bad');
}
async function smoke(): Promise<void> {
  const res: string[] = [];
  const ch = G.character!;
  ch.save.bag.fill(null);
  // level / xp
  const lv0 = ch.level;
  G.progression.addXp(G.progression.xpToNext(lv0) * 2.5);
  assert(ch.level >= lv0 + 2, `addXp çoklu seviye (${lv0} -> ${ch.level})`, res);
  assert(G.progression.xpToNext(1) === 240 && G.progression.xpToNext(10) === 5590 && G.progression.xpToNext(30) === 66660, 'XP eğrisi GDD ile aynı (240 / 5590 / 66660)', res);
  const total = G.progression.xpToReach(60);
  assert(Math.abs(total - 6059090) < 2000, `toplam 1->60 XP ~6,059,090 (${total})`, res);
  // generation
  const all: Rarity[] = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
  for (const r of all) {
    const it = generateItem({ itemLevel: 55, rarity: r, classId }, rng);
    const d = describeItem(it);
    assert(d.name.length > 0 && d.rarity === (r === 'set' && it.rarity !== 'set' ? it.rarity : r) || (r === 'legendary' || r === 'set'), `üretim ${r}: ${d.name}`, res);
  }
  const counts: Record<string, number> = {};
  for (let i = 0; i < 400; i++) {
    const it = generateItem({ itemLevel: 40, rarityCtx: { rank: 'trash' } }, rng);
    counts[it.rarity] = (counts[it.rarity] ?? 0) + 1;
  }
  log('400 rastgele (sv.40 sıradan) rarity dağılımı: ' + JSON.stringify(counts));
  assert((counts.poor ?? 0) > 60 && (counts.common ?? 0) > 80 && (counts.uncommon ?? 0) > 50, 'rarity ağırlıkları makul', res);
  // equip rules
  const knight = CharacterState.create('K', 'knight');
  const twoH = generateItem({ itemLevel: 1, rarity: 'common', baseId: 'axe2h_t1' }, rng);
  knight.addItem(twoH);
  assert(!knight.canEquip(twoH).ok, 'Şövalye çift el balta kuşanamaz', res);
  const mage = CharacterState.create('M', 'mage');
  const wand = generateItem({ itemLevel: 1, rarity: 'common', baseId: 'wand_t1' }, rng);
  const tome = generateItem({ itemLevel: 1, rarity: 'common', baseId: 'tome_t1' }, rng);
  mage.addItem(wand); mage.addItem(tome);
  assert(!mage.canEquip(tome, 'offhand').ok, 'Büyücü asa varken kitap takamaz (2H yan eli kilitler)', res);
  mage.equip(wand.uid);
  assert(mage.canEquip(tome, 'offhand').ok && mage.equip(tome.uid), 'Büyücü değnek + kitap kuşanabilir', res);
  const staff = generateItem({ itemLevel: 1, rarity: 'common', baseId: 'staff_t1' }, rng);
  mage.addItem(staff);
  assert(mage.equip(staff.uid) && !mage.save.equipment.offhand && mage.findItem(tome.uid)?.loc.where === 'bag', 'asa kuşanınca kitap çantaya döner', res);
  const hi = generateItem({ itemLevel: 40, rarity: 'rare', classId: 'knight' }, rng);
  knight.addItem(hi);
  assert(!knight.canEquip(hi).ok && !!hi, 'seviye şartı (ilvl 40 eşya sv.1 karakterde)', res);
  // stats
  const stBefore = ch.stats.maxHp ?? 0;
  const bigRing = generateItem({ itemLevel: 40, rarity: 'rare', baseId: 'ring_iron' }, rng);
  ch.addItem(bigRing);
  ch.equip(bigRing.uid);
  assert((ch.stats.maxHp ?? 0) >= stBefore, `yüzük kuşanınca maks. can artar (${stBefore} -> ${ch.stats.maxHp})`, res);
  // upgrades
  const weapon = generateItem({ itemLevel: 30, rarity: 'epic', baseId: CHAR_WEAPON[classId] }, rng);
  ch.addItem(weapon);
  ch.addGold(10_000_000);
  for (const id of ['kara_demir', 'buyulu_toz', 'ejderha_pulu', 'ruh_tasi', 'kutsama_kagidi', 'demirci_el_kitabi']) ch.addMaterial(id, 500);
  let lastLevel = 0, attempts = 0, destroyed = 0, downs = 0;
  const dmgBefore = describeItem(weapon).damage?.max ?? 0;
  while (attempts < 400 && !destroyed && (weapon.upgrade ?? 0) < 15) {
    const c = upgradeCost(weapon, { useBook: true });
    if (!c) break;
    const r = upgradeItem(weapon.uid, { useProtection: true, useBook: true });
    attempts++;
    if (!r.ok) {
      log('yükseltme reddedildi: ' + r.reason, 'bad');
      break;
    }
    if (r.destroyed) destroyed++;
    if (r.downgraded) downs++;
    lastLevel = r.newLevel;
  }
  assert(destroyed === 0, `korumalı yükseltme eşyayı yok etmedi (${attempts} deneme, son seviye +${lastLevel})`, res);
  assert((weapon.upgrade ?? 0) >= 12, `epik silah +12 üstüne çıktı (+${weapon.upgrade})`, res);
  assert((describeItem(weapon).damage?.max ?? 0) > dmgBefore, `yükseltme hasarı artırdı (${dmgBefore} -> ${describeItem(weapon).damage?.max})`, res);
  const lowItem = generateItem({ itemLevel: 20, rarity: 'common' }, rng);
  ch.addItem(lowItem);
  let lr = 0;
  for (let i = 0; i < 40; i++) lr = upgradeItem(lowItem.uid).newLevel;
  assert((lowItem.upgrade ?? 0) <= 9, `normal eşya +9 sınırında (+${lowItem.upgrade})`, res);
  const poor = generateItem({ itemLevel: 20, rarity: 'poor' }, rng);
  ch.addItem(poor);
  assert(!upgradeItem(poor.uid).ok, 'sıradan (gri) eşya yükseltilemez', res);
  // efsun
  const rare = generateItem({ itemLevel: 50, rarity: 'rare', classId }, rng);
  ch.addItem(rare);
  const before = rare.affixes.map((a) => a.affixId).join(',');
  const e1 = efsun(rare.uid, [0]);
  assert(e1.ok && rare.affixes[0] !== undefined, `efsun kilitle (${e1.reason ?? 'ok'})`, res);
  assert(rare.affixes.length >= 3, `efsun afiks sayısını korudu (${rare.affixes.length})`, res);
  void before;
  const leg = generateItem({ itemLevel: 50, rarity: 'legendary', classId }, rng);
  ch.addItem(leg);
  const fixedBefore = leg.affixes.filter((a) => a.locked).map((a) => a.value).join(',');
  efsun(leg.uid, []);
  const fixedAfter = leg.affixes.filter((a) => a.locked).map((a) => a.value).join(',');
  assert(fixedBefore === fixedAfter, 'efsun efsanevi sabit satırları değiştirmedi', res);
  // sockets
  const sock = generateItem({ itemLevel: 50, rarity: 'epic', classId }, rng);
  ch.addItem(sock);
  ch.addMaterial('oyma_kalemi', 3);
  const had = sock.sockets?.length ?? 0;
  const as = addSocket(sock.uid);
  ch.addMaterial(gemId('ruby', 4), 3);
  const sg = socketGem(sock.uid, 0, gemId('ruby', 4));
  assert(as.ok || had >= 1, `yuva açma (${as.reason ?? 'ok'})`, res);
  assert(sg.ok, `taş yerleştirme (${sg.reason ?? 'ok'})`, res);
  ch.addMaterial(gemId('topaz', 1), 6);
  assert(combineGems('topaz', 1).ok && ch.material(gemId('topaz', 2)) >= 1, 'taş birleştirme 3 -> 1', res);
  // salvage
  const junk = generateItem({ itemLevel: 40, rarity: 'rare' }, rng);
  ch.addItem(junk);
  const sv = salvageItem(junk.uid);
  assert(sv.ok && sv.yields.length > 0, `parçalama ${JSON.stringify(sv.yields)}`, res);
  // vendor
  const merch = vendorEntries('merchant');
  assert(merch.length >= 8 && merch.every((e) => e.item && e.price > 0), `satıcı stoğu ${merch.length} eşya`, res);
  const alc = vendorEntries('alchemist');
  assert(alc.some((e) => e.materialId === 'pot_hp_1'), 'simyacı can iksiri satar', res);
  const bs = vendorEntries('blacksmith');
  const efs = bs.find((e) => e.materialId === 'efsun_nesnesi');
  assert(!!efs && efs.stock === 5, 'demirci efsun nesnesi (günde 5)', res);
  const free0 = ch.freeBagSlots();
  const first = merch[0];
  const b1 = buy(first);
  assert(b1.ok && ch.freeBagSlots() === free0 - 1, `satın alma (${b1.reason ?? 'ok'})`, res);
  const sellGold = sell(first.item!.uid);
  assert(sellGold.ok && sellGold.gold > 0 && buybackList().length >= 1, 'satış + geri alma listesi', res);
  assert(buyback(0).ok, 'geri alma', res);
  // bounties
  const bl = dailyBounties();
  assert(bl.length === 3, `3 günlük görev: ${bl.map((b) => b.title).join(' / ')}`, res);
  bountyEvent('kill', 999);
  bountyEvent('kill_elite', 99);
  bountyEvent('dungeon', 5);
  bountyEvent('boss', 9);
  bountyEvent('upgrade', 9);
  bountyEvent('salvage', 99);
  bountyEvent('gold', 1e9);
  bountyEvent('globe', 99);
  const done = dailyBounties().filter((b) => b.progress >= b.target);
  assert(done.length >= 1, `görev ilerlemesi (${done.length}/3 tamam)`, res);
  const g0 = ch.save.gold;
  const claimed = done.length ? claimBounty(done[0].id) : false;
  assert(claimed && ch.save.gold > g0, 'görev ödülü alındı', res);
  // weekly decree, Mühürdar, Gizemli Tüccar, death penalty
  const wd0 = weeklyDecree();
  assert(wd0.target === 12 && !wd0.ready, `haftalık ferman sayacı ${wd0.count}/${wd0.target}`, res);
  ch.save.flags[`bounty.week.${bountyWeekKey()}.count`] = 12;
  assert(weeklyDecree().ready && !!claimWeeklyDecree() && !weeklyDecree().ready, 'haftalık ferman alındı ve tekrar alınamaz', res);
  ch.addMaterial('av_muhru', 400);
  const offers = sealOffers();
  assert(offers.length === 10, `Mühürdar ${offers.length} ürün`, res);
  const ks = ch.material('kutsama_kagidi');
  assert(buySealOffer('seal_kutsama').ok && ch.material('kutsama_kagidi') === ks + 1, 'Mühürdar: Kutsama Kağıdı', res);
  assert(buySealOffer('seal_pulu').ok, 'Mühürdar: Ejderha Pulu x3', res);
  const sc = buySealOffer('seal_chest', gambleOptions()[0].category);
  assert(sc.ok && !!sc.item && sc.item.rarity !== 'common', `Mühür Sandığı: ${sc.item ? describeItem(sc.item).name : sc.reason}`, res);
  const lvBefore = ch.level;
  G.progression.setLevel(30);
  ch.addGold(1_000_000);
  const g1 = gamble(gambleOptions()[1].category);
  assert(g1.ok && !!g1.item && g1.cost === gambleCost(), `Gizemli Tüccar: ${g1.item ? describeItem(g1.item).name : g1.reason} (${g1.cost} altın)`, res);
  const gr: Record<string, number> = {};
  for (let i = 0; i < 300; i++) {
    const g = gamble(gambleOptions()[i % gambleOptions().length].category);
    if (g.ok && g.item) {
      gr[g.item.rarity] = (gr[g.item.rarity] ?? 0) + 1;
      ch.removeItem(g.item.uid);
    }
  }
  log('300 kumar rarity dağılımı: ' + JSON.stringify(gr));
  assert((gr.uncommon ?? 0) > 150 && (gr.rare ?? 0) > 40, 'kumar rarity ağırlıkları makul (Büyülü 70 / Nadir 25)', res);
  G.progression.setLevel(Math.max(lvBefore, 12));
  const xp0 = ch.save.xp;
  ch.save.xp = Math.max(ch.save.xp, 5000);
  const lost = G.progression.applyDeathPenalty();
  assert(lost > 0 && ch.save.xp >= 0, `ölüm cezası -${lost} TP (seviye düşmez)`, res);
  void xp0;
  // talents
  const pts = G.progression.talentPointsAvailable();
  assert(pts > 0, `pasif puan var (${pts})`, res);
  const adj = Object.keys(TALENT_NODES).find((id) => G.progression.canAllocate(id));
  assert(!!adj && G.progression.allocate(adj!), `düğüm alındı (${adj})`, res);
  assert(!G.progression.allocate('n_pyromancer') || ch.classId === 'mage', 'komşu olmayan düğüm alınamaz', res);
  assert(G.progression.refundAll() && G.progression.talentPointsSpent() === 0, 'tam sıfırlama (ilk ücretsiz)', res);
  // persistence round trip
  ch.persist(true);
  const loaded = G.save.load(ch.save.id);
  assert(!!loaded && loaded.level === ch.level && loaded.bag.filter(Boolean).length === ch.save.bag.filter(Boolean).length, 'kaydet / yükle dönüşümü', res);
  G.save.delete(knight.save.id);
  G.save.delete(mage.save.id);
  // end of run
  const fakeState = { dungeonId: 'x', difficulty: 'mythicplus', keyLevel: 10, affixes: [], seed: 1, started: true, startTime: 0, elapsed: 100, timerSec: 1800, deaths: 0, deathPenaltySec: 0, forces: 100, forcesRequired: 100, bossesKilled: [], bossesTotal: 3, completed: true, failed: false, inTime: true, upgradeLevels: 2, countdown: 0 } as never;
  const rewards = G.loot.endOfRunRewards(fakeState);
  assert(rewards.length === 2 && rewards.every((r) => r.itemLevel === 80 && r.rarity !== 'common'), `M+10 sandık: ${rewards.map((r) => `${r.rarity}@${r.itemLevel}`).join(', ')}`, res);
  log('--- SMOKE ---\n' + res.join('\n'));
  const failed = res.filter((r) => r.startsWith('FAIL')).length;
  log(`SMOKE: ${res.length - failed}/${res.length} geçti`, failed ? 'bad' : 'ok');
  (window as unknown as { smokeResult: string[] }).smokeResult = res;
  tab = 'log';
  renderTab();
}
const CHAR_WEAPON: Record<ClassId, string> = {
  knight: 'sword1h_t3', barbarian: 'axe2h_t3', mage: 'staff_t3', rogue: 'dagger_t3',
  monk: 'fist_t3', archer: 'bow_t3', paladin: 'mace_t3', necromancer: 'staff_t3', warlock: 'staff_t3',
  demonhunter: 'dagger_t3', evoker: 'staff_t3', // CM1 stubs
  priest: 'staff_t3', shaman: 'mace_t3', druid: 'staff_t3', // CLASS SCAFFOLD
};

// ------------------------------------------------------------------------------------------------------ ui
type Tab = 'cards' | 'stats' | 'sim' | 'legend' | 'log';
let tab: Tab = 'cards';
const tabsEl = document.getElementById('dev-tabs') as HTMLElement;
const bodyEl = document.getElementById('dev-body') as HTMLElement;
function renderTab(): void {
  tabsEl.innerHTML = '';
  for (const [id, label] of [['cards', 'Kartlar'], ['stats', 'Statlar'], ['sim', 'Yükseltme Sim.'], ['legend', 'Efsaneler'], ['log', 'Log']] as [Tab, string][]) {
    const b = h('button', { className: tab === id ? 'on' : '', onclick: () => { tab = id; renderTab(); } }, label);
    tabsEl.append(b);
  }
  bodyEl.innerHTML = '';
  if (tab === 'cards') {
    const ch = G.character!;
    const bag = ch.save.bag.filter(Boolean) as ItemInstance[];
    bodyEl.append(h('div.sub', null, `Çanta: ${bag.length}/${ch.save.bag.length} eşya · ilk 40 kart gösterilir`));
    bag.slice(0, 40).forEach((it) => bodyEl.append(cardFor(it)));
  } else if (tab === 'stats') bodyEl.append(statsView());
  else if (tab === 'sim') bodyEl.append(simulate());
  else if (tab === 'legend') bodyEl.append(showLegendaries());
  else bodyEl.append(logEl);
}

const bar = document.getElementById('dev-bar') as HTMLElement;
const btn = (label: string, fn: () => void | Promise<void>) => bar.append(h('button', { onclick: () => void fn() }, label));
const sel = h('select', { onchange: (e: Event) => void spawnPlayer((e.target as HTMLSelectElement).value as ClassId, G.character?.level ?? startLevel) },
  ...(['knight', 'barbarian', 'mage', 'rogue'] as ClassId[]).map((c) => h('option', { value: c, selected: c === classId }, c)));
bar.append(sel);
const lvl = h('input', { type: 'number', value: String(startLevel), min: '1', max: '60' }) as HTMLInputElement;
bar.append(lvl);
btn('Sv. ayarla', () => { G.progression.setLevel(Number(lvl.value)); renderTab(); });
btn('XP +1 sv.', () => { G.progression.addXp(G.progression.xpToNext(G.character!.level)); renderTab(); });
bar.append(h('span', null, '|'));
btn('60 eşya', roll60);
btn('Çantayı boşalt', () => { G.character!.save.bag.fill(null); renderTab(); });
btn('Hepsini kuşan', equipBest);
btn('Set giy', giveSet);
btn('Pasif harca', spendTalents);
bar.append(h('span', null, '|'));
btn('Eşya halkası', dropRing);
btn('Sıradan x10', () => kill('trash', 10));
btn('Sürü x15', () => kill('trash', 15, 'swarm'));
btn('Seçkin', () => kill('elite'));
btn('Ara patron', () => kill('miniboss'));
btn('PATRON', () => kill('boss', 1, 'melee', 'loot_d1_b3'));
btn('Altın 2500', () => { if (player) G.loot.dropGold(2500, player.position.clone().add(new THREE.Vector3(0, 0, 4))); });
bar.append(h('span', null, '|'));
btn('SMOKE TEST', smoke);
btn('Temizle', () => G.loot.clear());
btn('Paneli gizle', () => { const p = document.getElementById('dev-panel')!; p.style.display = p.style.display === 'none' ? 'flex' : 'none'; });

/** Drop one of everything near the player, then walk over each drop and report what got picked up. */
function testPickup(): Record<string, unknown> {
  const ch = G.character!;
  const p = player!;
  G.loot.clear();
  ch.save.bag.fill(null);
  G.settings.set('autoLoot', true);
  p.position.set(0, 0, 0);
  const gold0 = ch.save.gold, hp0 = (p.hp = 100), pot0 = ch.material('pot_hp_1');
  const picked: string[] = [];
  const off = G.events.on('loot:pickedUp', (e) => picked.push(e.item ? 'item:' + e.item.rarity : e.gold ? 'gold' : e.material ? 'mat' : e.globe ? 'globe' : '?'));
  for (const r of ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as Rarity[]) G.loot.dropItem(generateItem({ itemLevel: 30, rarity: r, classId }, rng), { x: 0, y: 0, z: 0 });
  G.loot.dropGold(500, { x: 0, y: 0, z: 0 });
  G.loot.dropGlobe({ x: 0, y: 0, z: 0 });
  G.loot.dropMaterial('pot_hp_1', 3, { x: 0, y: 0, z: 0 });
  step(2);
  const spawned = G.loot.drops.length;
  for (const x of [...G.loot.drops]) {
    if (x.removed) continue;
    p.position.set(x.object3d.position.x, 0, x.object3d.position.z);
    step(1.3);
  }
  off();
  return {
    spawned, bag: ch.save.bag.filter(Boolean).map((i) => i!.rarity), goldGain: ch.save.gold - gold0, picked, hp: hp0 + ' -> ' + p.hp + '/' + p.maxHp,
    potions: ch.material('pot_hp_1') - pot0, remaining: G.loot.drops.filter((x) => !x.removed).map((x) => x.drop.kind + ':' + x.drop.rarity),
  };
}
function step(sec: number): void {
  for (let t = 0; t < sec; t += 1 / 60) {
    world.update(1 / 60);
    G.loot.update(1 / 60);
    G.vfx.update(1 / 60);
    cam?.update(1 / 60);
    G.ui.update(1 / 60);
  }
}

(window as unknown as { dev: unknown }).dev = {
  testPickup,
  G, smoke, kill, roll60, equipBest, giveSet, dropRing, describeItem, generateItem, sellValue, upgradeItem, simulate,
  spawnPlayer, items: () => items60,
  /** Manual frame stepping (the page only ticks while the pane is visible). */
  step: (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) { world.update(1 / 60); G.loot.update(1 / 60); G.vfx.update(1 / 60); cam?.update(1 / 60); G.ui.update(1 / 60); } },
  hidePanel: (v = true) => { (document.getElementById('dev-panel') as HTMLElement).style.display = v ? 'none' : 'flex'; },
};

await spawnPlayer(classId, startLevel);
// switch the HUD into in-game mode (world labels, nameplates and the action bar only update there)
G.events.emit('scene:changed', { from: null, to: 'town' });
roll60();
log('hazır. Çanta dolduruldu; WASD yürü, F al, sağ tık sürükle kamera.');

// ?auto=ring|boss|trash|elite|globe : scripted showcase after load (the page reloads often while other modules are edited)
const auto = q.get('auto');
if (q.get('hidepanel') === '1' || auto) (document.getElementById('dev-panel') as HTMLElement).style.display = 'none';
if (auto) {
  setTimeout(() => {
    if (auto === 'ring') dropRing();
    else if (auto === 'boss') kill('boss', 1, 'melee', 'loot_d1_b3');
    else if (auto === 'elite') kill('elite');
    else if (auto === 'trash') kill('trash', 12);
    else if (auto === 'swarm') kill('trash', 15, 'swarm');
  }, 1200);
}
