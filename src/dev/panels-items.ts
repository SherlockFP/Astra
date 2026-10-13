import { G } from '../game/G';
import { bootHarness } from './harness';
import { CharacterState } from '../systems/CharacterState';
import { generateItem, refreshItemName } from '../systems/ItemGen';
import { registerItemPanels, itemPanels } from '../ui/panels/items';
import { forgeApi } from '../ui/panels/items/backend';
import { MATERIALS } from '../data/materials';
import { MAX_UPGRADE_BY_RARITY } from '../data/upgrades';
import type { ClassId, Rarity } from '../types/common';
import type { ItemInstance } from '../types/items';

/**
 * DEV PAGE for the panels-items module. Boots the harness, creates a character with a filled bag and opens the panels.
 * URL params: ?class=knight|barbarian|mage|rogue &level=30 &open=character,inventory,vendor:merchant|alchemist|gamble|seal_vendor,stash,skills,blacksmith
 *             &anvil=up|efsun|socket|salvage (opens the blacksmith with a test item, &lvl=9 &rarity=epic)
 *             &force=success|fail|down|destroy (forces the upgrade outcome to test the animations)
 */
const params = new URLSearchParams(location.search);
const CLASS = (params.get('class') as ClassId) || 'knight';

/* ------------------------------------------------------------------ toasts */

const toastBox = document.getElementById('dev-toasts') as HTMLElement;
function devToast(text: string): void {
  const d = document.createElement('div');
  d.textContent = text;
  toastBox.append(d);
  setTimeout(() => d.remove(), 3000);
}

/* ------------------------------------------------------------------ forced upgrade outcomes (animation testing) */

let forceOutcome: 'random' | 'success' | 'fail' | 'down' | 'destroy' = (params.get('force') as 'success' | 'fail' | 'down' | 'destroy') || 'random';

function emitAll(): void {
  G.events.emit('inventory:changed', {});
  G.events.emit('equipment:changed', { slot: 'weapon' });
  G.events.emit('materials:changed', {});
}

function installForcedUpgrade(): void {
  const real = forgeApi.upgradeItem;
  forgeApi.upgradeItem = (uid, opts) => {
    const c = G.character;
    const f = c?.findItem(uid);
    if (forceOutcome === 'random' || !c || !f) return real(uid, opts);
    const item = f.item;
    const lvl = item.upgrade ?? 0;
    if (forceOutcome === 'success') {
      item.upgrade = lvl + 1;
      refreshItemName(item);
      c.recomputeStats();
      G.events.emit('item:upgraded', { item, success: true, destroyed: false, newLevel: lvl + 1 });
      emitAll();
      return { ok: true, success: true, destroyed: false, newLevel: lvl + 1 };
    }
    if (forceOutcome === 'destroy') {
      c.removeItem(uid);
      G.events.emit('item:upgraded', { item, success: false, destroyed: true, newLevel: 0 });
      emitAll();
      return { ok: true, success: false, destroyed: true, newLevel: 0 };
    }
    if (forceOutcome === 'down') {
      item.upgrade = Math.max(0, lvl - 1);
      refreshItemName(item);
      emitAll();
      return { ok: true, success: false, destroyed: false, newLevel: item.upgrade, downgraded: true };
    }
    return { ok: true, success: false, destroyed: false, newLevel: lvl, protectedUsed: !!opts?.useProtection };
  };
}

/* ------------------------------------------------------------------ character / data helpers */

function newCharacter(cls: ClassId, level: number): void {
  const ch = CharacterState.create('Efsun', cls, 0);
  ch.save.level = level;
  ch.save.gold = 250000;
  ch.save.skillBar = CharacterState.defaultBar(cls, level);
  for (const [id, n] of Object.entries({ kara_demir: 60, buyulu_toz: 40, ejderha_pulu: 12, ruh_tasi: 3, kutsama_kagidi: 3, demirci_el_kitabi: 2, efsun_nesnesi: 6, efsun_kilidi: 8, kadim_efsun: 2, takviye_nesnesi: 2, oyma_kalemi: 2, av_muhru: 400 })) ch.addMaterial(id, n);
  for (const id of ['gem_ruby_1', 'gem_ruby_3', 'gem_emerald_2', 'gem_sapphire_3', 'gem_topaz_1', 'gem_amethyst_2', 'gem_diamond_4']) ch.addMaterial(id, 3);
  for (const id of ['pot_hp_2', 'pot_res_2', 'elixir_might']) if (MATERIALS[id]) ch.addMaterial(id, 3);
  G.character = ch;
  ch.recomputeStats();
  fillBag(14);
  emitAll();
}

function fillBag(n: number): void {
  const c = G.character;
  if (!c) return;
  const rar: Rarity[] = ['poor', 'common', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'set', 'uncommon'];
  for (let i = 0; i < n; i++) {
    const it = generateItem({ itemLevel: 8 + Math.floor(Math.random() * 40), rarity: rar[i % rar.length], classId: c.classId, smart: i % 3 !== 2 });
    if (i % 3 === 0 && it.rarity !== 'poor') it.upgrade = Math.min(MAX_UPGRADE_BY_RARITY[it.rarity] ?? 0, 3 + Math.floor(Math.random() * 12));
    if (i % 4 === 1 && it.rarity !== 'poor' && !it.sockets) it.sockets = [null, i % 8 === 1 ? 'gem_ruby_2' : null];
    refreshItemName(it);
    if (!c.addItem(it)) break;
  }
  c.recomputeStats();
  emitAll();
}

/** A forge test item (epic weapon, +N, sockets) in the bag. */
function makeForgeItem(): ItemInstance | null {
  const c = G.character;
  if (!c) return null;
  const cat = ({
    knight: 'sword1h', barbarian: 'axe2h', mage: 'staff', rogue: 'dagger',
    monk: 'fist', archer: 'bow', paladin: 'mace', necromancer: 'staff', warlock: 'staff',
  } as const)[c.classId];
  const it = generateItem({ itemLevel: 40, rarity: (params.get('rarity') as Rarity) || 'epic', category: cat, classId: c.classId });
  it.upgrade = Number(params.get('lvl') ?? 9);
  it.sockets = [null, 'gem_ruby_2'];
  refreshItemName(it);
  c.addItem(it);
  return it;
}

/* ------------------------------------------------------------------ boot */

async function main(): Promise<void> {
  await bootHarness({ floor: false, orbit: false });
  const ui = G.ui;
  G.events.on('ui:toast', ({ text }) => devToast(text));

  installForcedUpgrade();
  newCharacter(CLASS, Number(params.get('level') ?? 30));
  if (!itemPanels.inventory) registerItemPanels(ui);

  const open = (id: string, data?: unknown) => {
    try {
      ui.openPanel(id, data);
    } catch {
      /* ignore */
    }
    const p = itemPanels[id];
    if (p && !p.isOpen) p.open(data);
  };
  const toggle = (id: string, data?: unknown) => {
    const p = itemPanels[id];
    if (p?.isOpen) ui.closePanel(id);
    else open(id, data);
  };

  // ---- dev bar
  const bar = document.getElementById('dev-bar') as HTMLElement;
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.append(b);
  };
  const sep = (t: string) => {
    const s = document.createElement('span');
    s.textContent = t;
    bar.append(s);
  };
  sep('Paneller');
  btn('Çanta', () => toggle('inventory'));
  btn('Karakter', () => toggle('character'));
  btn('Depo', () => toggle('stash'));
  btn('Tüccar', () => toggle('vendor', { kind: 'merchant' }));
  btn('Simyacı', () => toggle('vendor', { kind: 'alchemist' }));
  btn('Kumarbaz', () => toggle('vendor', { kind: 'gamble' }));
  btn('Mühürdar', () => toggle('vendor', { kind: 'seal_vendor' }));
  btn('Demirci', () => toggle('blacksmith'));
  btn('Yetenekler', () => toggle('skills'));
  btn('Hepsini Kapat', () => Object.values(itemPanels).forEach((p) => p?.isOpen && ui.closePanel(p.id)));
  sep('Veri');
  btn('Çantayı Doldur', () => fillBag(24));
  btn('+100K Altın', () => G.character?.addGold(100000));
  btn('+Malzeme', () => {
    const c = G.character;
    if (!c) return;
    for (const id of ['kara_demir', 'buyulu_toz', 'ejderha_pulu', 'ruh_tasi', 'kutsama_kagidi', 'demirci_el_kitabi', 'efsun_nesnesi', 'efsun_kilidi', 'oyma_kalemi']) c.addMaterial(id, 25);
  });
  btn('Seviye +5', () => {
    const c = G.character;
    if (!c) return;
    c.save.level = Math.min(60, c.save.level + 5);
    c.recomputeStats();
    G.events.emit('player:levelup', { level: c.save.level });
  });
  btn('Test Eşyası', () => makeForgeItem());
  sep('Sınıf');
  for (const cls of ['knight', 'barbarian', 'mage', 'rogue'] as ClassId[]) btn(cls, () => newCharacter(cls, G.character?.level ?? 30));
  sep('Yükseltme sonucu');
  const sel = document.createElement('select');
  for (const [v, t] of [['random', 'Rastgele'], ['success', 'Hep Başarı'], ['fail', 'Hep Başarısız'], ['down', 'Hep Seviye Düş'], ['destroy', 'Hep Yok Ol']]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = t;
    sel.append(o);
  }
  sel.value = forceOutcome;
  sel.addEventListener('change', () => (forceOutcome = sel.value as typeof forceOutcome));
  bar.append(sel);

  const anvil = params.get('anvil');
  if (anvil) {
    const it = makeForgeItem();
    open('blacksmith', { tab: anvil === 'efsun' ? 'efsun' : anvil === 'socket' ? 'socket' : anvil === 'salvage' ? 'salvage' : 'up', uid: it?.uid });
  }
  for (const id of (params.get('open') ?? '').split(',').filter(Boolean)) {
    const [pid, kind] = id.split(':');
    open(pid, kind ? { kind } : undefined);
  }
  (window as unknown as Record<string, unknown>).devOpen = open;
}

void main();
