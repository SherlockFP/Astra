import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import { EQUIP_SLOT_NAMES_TR, type EquipSlot, type ItemInstance } from '../../../types/items';
import { LEVEL_CAP } from '../../../types/character';
import { RARITY_COLORS, type ClassId } from '../../../types/common';
import { type StatId } from '../../../types/stats';
import { CLASSES } from '../../../data/classes';
import { getItemBase } from '../../../data/items';
import { selectedTitleName } from '../../../systems/Achievements';
import { chip, emptyState } from '../../kit';
import { CLASS_META, ratingTier } from '../game/base';
import { ItemPanel, makeTabs, openPanel } from './PanelBase';
import { CharacterPreview } from './CharacterPreview';
import { canPlace, moveItem, quickAction } from './actions';
import { linkItemInChat } from '../../../systems/ChatLinks';
import {
  ItemSlot, SLOT_ICON, bindItemTip, bindTip, describe, drag, esc, flashEl, fmt, fmtStatValue, h, isTwoHanded, sfx, statName,
} from './common';

const LEFT: EquipSlot[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];
const RIGHT: EquipSlot[] = ['amulet', 'belt', 'ring1', 'ring2', 'weapon', 'offhand'];

const CLASS_TR: Record<ClassId, string> = {
  knight: 'Şövalye', barbarian: 'Barbar', mage: 'Büyücü', rogue: 'Haydut',
  monk: 'Keşiş', archer: 'Okçu', paladin: 'Paladin', necromancer: 'Nekromant', warlock: 'Warlock',
  demonhunter: 'İblis Avcısı', evoker: 'Ejderhasoy', // CM1
  priest: 'Rahip', shaman: 'Şaman', druid: 'Druid', // CLASS SCAFFOLD
};
const RESOURCE_TR: Record<ClassId, string> = {
  knight: 'Kararlılık', barbarian: 'Öfke', mage: 'Mana', rogue: 'Enerji',
  monk: 'Enerji', archer: 'Odak', paladin: 'İnanç', necromancer: 'Öz', warlock: 'Mana',
  demonhunter: 'Gazap', evoker: 'Öz', // CM1
  priest: 'Mana', shaman: 'Mana', druid: 'Mana', // CLASS SCAFFOLD
};
const MAIN_STAT: Record<ClassId, StatId> = {
  knight: 'str', barbarian: 'str', mage: 'int', rogue: 'dex',
  monk: 'dex', archer: 'dex', paladin: 'str', necromancer: 'int', warlock: 'int',
  demonhunter: 'dex', evoker: 'int', // CM1
  priest: 'int', shaman: 'int', druid: 'int', // CLASS SCAFFOLD
};

/** Turkish explanations shown when hovering a stat row. */
export const STAT_DOCS: Partial<Record<StatId, string>> = {
  str: 'Her puan zırhı 2 artırır. Şövalye ve Barbar için ana niteliktir: her puan hasarı %1 artırır.',
  dex: 'Kritik şansını ve kaçınma şansını biraz artırır. Haydut için ana niteliktir: her puan hasarı %1 artırır.',
  int: 'Elementel dirençleri biraz artırır ve mana havuzunu büyütür. Büyücü için ana niteliktir: her puan hasarı %1 artırır.',
  vit: 'Her puan maksimum canı artırır.',
  maxHp: 'Maksimum can. Sıfıra inerse ölürsün.',
  maxHpPct: 'Maksimum canı yüzde olarak artırır.',
  maxResource: 'Maksimum kaynak havuzu (Öfke, Mana, Enerji veya Kararlılık).',
  hpRegen: 'Saniyede yenilenen can.',
  resourceRegen: 'Saniyede yenilenen kaynak.',
  hpOnHit: 'Her başarılı vuruşta kazandığın can.',
  hpOnKill: 'Bir düşmanı öldürünce kazandığın can.',
  lifeSteal: 'Verdiğin hasarın bu kadarı can olarak sana döner.',
  weaponMin: 'Silahın minimum hasarı.',
  weaponMax: 'Silahın maksimum hasarı.',
  attackSpeed: 'Silah saldırı hızına eklenen yüzde. Vuruş zincirlerini hızlandırır.',
  castSpeed: 'Büyü hızı: büyü yapma süresini ve animasyonları hızlandırır.',
  damagePct: 'Tüm hasarını yüzde olarak artırır.',
  physicalDamagePct: 'Fiziksel hasarını artırır.',
  fireDamagePct: 'Ateş hasarını artırır. Yanma etkisi zamanla ek hasar verir.',
  frostDamagePct: 'Buz hasarını artırır. Düşmanları yavaşlatır ve dondurur.',
  lightningDamagePct: 'Şimşek hasarını artırır.',
  shadowDamagePct: 'Gölge hasarını artırır.',
  poisonDamagePct: 'Zehir hasarını artırır.',
  holyDamagePct: 'Kutsal hasarını artırır (Şövalye).',
  arcaneDamagePct: 'Gizem hasarını artırır (Büyücü).',
  spellPower: 'Büyülerinin gücünü artırır.',
  critChance: 'Vuruşunun kritik olma olasılığı. Kritik vuruşlar çok daha fazla hasar verir.',
  critDamage: 'Kritik vuruşların ek hasarı. Temel kritik hasarı %150\'dir; bu değer üstüne eklenir.',
  cdr: 'Yeteneklerin bekleme sürelerini kısaltır (en fazla %40).',
  aoePct: 'Alan hasarı veren yeteneklerin hasarını artırır.',
  dotPct: 'Zamanla hasar (yanma, kanama, zehir) etkilerini güçlendirir.',
  bossDamagePct: 'Patronlara verdiğin hasarı artırır.',
  eliteDamagePct: 'Seçkin düşmanlara verdiğin hasarı artırır.',
  armorPen: 'Düşmanın zırhının bu kadarını yok sayar.',
  armor: 'Fiziksel hasarı azaltır. Azalma = zırh / (zırh + 50 × düşman seviyesi + 200), en fazla %75.',
  armorPct: 'Toplam zırhını yüzde olarak artırır.',
  blockChance: 'Önden gelen yakın dövüş ve mermi saldırılarını bloklama şansı (kalkan gerekir).',
  blockAmount: 'Bloklanan vuruşun ne kadarının engelleneceği.',
  dodgeChance: 'Bir saldırıdan tamamen kaçınma şansı.',
  damageReductionPct: 'Aldığın tüm hasarı yüzde olarak azaltır.',
  thorns: 'Sana vuran düşmana yansıyan hasar.',
  resFire: 'Ateş hasarını bu oranda azaltır.',
  resFrost: 'Buz hasarını bu oranda azaltır.',
  resLightning: 'Şimşek hasarını bu oranda azaltır.',
  resShadow: 'Gölge hasarını bu oranda azaltır.',
  resPoison: 'Zehir hasarını bu oranda azaltır.',
  resArcane: 'Gizem hasarını bu oranda azaltır.',
  resAll: 'Tüm elementel dirençleri artırır.',
  ccReductionPct: 'Sersemletme, dondurma ve yavaşlatma gibi kontrol etkilerinin süresini kısaltır.',
  moveSpeed: 'Hareket hızı.',
  moveSpeedPct: 'Koşma hızına eklenen yüzde.',
  goldFindPct: 'Düşen altın miktarını artırır.',
  magicFindPct: 'Büyülü, nadir ve daha iyi eşya bulma şansını artırır.',
  xpPct: 'Kazandığın tecrübe puanını artırır.',
  pickupRadius: 'Eşya ve altınları kendiliğinden toplama mesafesi.',
  potionPct: 'İksirlerin etkisini artırır.',
};

interface RowDef {
  id: StatId;
  /** show even when zero */
  always?: boolean;
  /** show a leading + sign for positive values */
  signed?: boolean;
  label?: string;
}

interface CatDef {
  id: string;
  title: string;
  icon: string;
  rows: RowDef[];
}

/**
 * Sheet groups (section 7.7). Nitelikler / İkincil / Üçüncül are open by default; the three legacy sections
 * (Saldırı · Savunma · Fayda) share one collapsed group.
 */
const CATS: CatDef[] = [
  {
    id: 'attr',
    title: 'Nitelikler',
    icon: 'stat-strength.svg',
    rows: [
      { id: 'str', always: true },
      { id: 'dex', always: true },
      { id: 'int', always: true },
      { id: 'vit', always: true },
      { id: 'maxHp', always: true, label: 'Maks. Can' },
    ],
  },
  {
    id: 'sec',
    title: 'İkincil',
    icon: 'stat-damage.svg',
    rows: [
      { id: 'critChance', always: true },
      { id: 'critDamage', always: true, signed: true },
      { id: 'attackSpeed', always: true, signed: true },
      { id: 'castSpeed', always: true, signed: true },
      { id: 'cdr', always: true },
    ],
  },
  {
    id: 'ter',
    title: 'Üçüncül',
    icon: 'stat-move-speed.svg',
    rows: [
      { id: 'lifeSteal', always: true },
      { id: 'dodgeChance', always: true },
      { id: 'moveSpeedPct', always: true, signed: true },
      { id: 'damageReductionPct', always: true },
    ],
  },
  {
    id: 'off',
    title: 'Saldırı',
    icon: 'stat-damage.svg',
    rows: [
      { id: 'damagePct', signed: true },
      { id: 'spellPower', signed: true },
      { id: 'physicalDamagePct', signed: true },
      { id: 'fireDamagePct', signed: true },
      { id: 'frostDamagePct', signed: true },
      { id: 'lightningDamagePct', signed: true },
      { id: 'shadowDamagePct', signed: true },
      { id: 'poisonDamagePct', signed: true },
      { id: 'holyDamagePct', signed: true },
      { id: 'arcaneDamagePct', signed: true },
      { id: 'aoePct', signed: true },
      { id: 'dotPct', signed: true },
      { id: 'bossDamagePct', signed: true },
      { id: 'eliteDamagePct', signed: true },
      { id: 'armorPen' },
      { id: 'hpOnHit' },
      { id: 'hpOnKill' },
    ],
  },
  {
    id: 'def',
    title: 'Savunma',
    icon: 'stat-armor.svg',
    rows: [
      { id: 'armor', always: true },
      { id: 'blockChance' },
      { id: 'blockAmount' },
      { id: 'hpRegen' },
      { id: 'resFire', always: true },
      { id: 'resFrost', always: true },
      { id: 'resLightning', always: true },
      { id: 'resShadow', always: true },
      { id: 'resPoison', always: true },
      { id: 'resArcane', always: true },
      { id: 'resAll' },
      { id: 'ccReductionPct' },
      { id: 'thorns' },
    ],
  },
  {
    id: 'util',
    title: 'Fayda',
    icon: 'stat-move-speed.svg',
    rows: [
      { id: 'maxResource' },
      { id: 'resourceRegen' },
      { id: 'goldFindPct', always: true, signed: true },
      { id: 'magicFindPct', always: true, signed: true },
      { id: 'xpPct', always: true, signed: true },
      { id: 'potionPct', signed: true },
      { id: 'pickupRadius' },
    ],
  },
];

const LEGACY_CATS = ['off', 'def', 'util'];
const LEGACY_KEY = 'legacy';
const CHAR_SHEET_KEY = 'efsun.charsheet.v1';
const ALL_SLOTS = Object.keys(EQUIP_SLOT_NAMES_TR) as EquipSlot[];

type ViewId = 'char' | 'titles' | 'sets';

/** One decimal, decimal comma (326,9). */
const fmt1 = (n: number): string => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Upgrade sockets as filled / hollow marks. Empty string when the item has none. */
function socketMarks(it: ItemInstance): string {
  if (!it.sockets?.length) return '';
  const filled = it.sockets.filter(Boolean).length;
  return '◆'.repeat(filled) + '◇'.repeat(it.sockets.length - filled);
}

interface GearRow {
  row: HTMLElement;
  name: HTMLElement;
  meta: HTMLElement;
}

/**
 * Karakter (section 7.7, size L, dock left): header strip (level + class, EŞ equipped / overall, Mitik+ score), paper doll
 * columns with a live 3D preview, the stat groups, and the Unvanlar / Ekipman stubs.
 */
export class CharacterPanel extends ItemPanel {
  private slots = new Map<EquipSlot, ItemSlot>();
  private gear = new Map<EquipSlot, GearRow>();
  private views = new Map<ViewId, HTMLElement>();

  private preview!: CharacterPreview;
  private nameEl!: HTMLDivElement;
  private unvanEl!: HTMLDivElement;
  private clsEl!: HTMLDivElement;
  private ilvlEl!: HTMLDivElement;
  private mplusVal!: HTMLElement;
  private durEl!: HTMLElement;
  private xpFill!: HTMLDivElement;
  private xpText!: HTMLDivElement;
  private helmBox!: HTMLInputElement;
  private statsEl!: HTMLDivElement;
  private statSig = '';
  private visSig = '';
  private charKey = '';
  private collapsed = new Set<string>([LEGACY_KEY]);
  private lastWeapon: ItemInstance | null = null;
  /** Stat values of the previous render (null right after opening): changed rows flash green / red. */
  private prevStats: Record<string, number> | null = null;

  constructor() {
    super('character', {
      title: 'Karakter',
      icon: 'ui-character.svg',
      width: 1000,
      height: 720,
      dock: 'left',
      hints: ['Sağ Tık: çıkar', 'Sürükle: eşyayı yuvaya bırak'],
    });
  }

  protected build(body: HTMLElement): void {
    this.collapsed = this.loadCollapsed();
    const tabs = makeTabs(
      [
        { id: 'char', label: 'Karakter' },
        { id: 'titles', label: 'Unvanlar' },
        { id: 'sets', label: 'Ekipman' },
      ],
      (id) => this.showView(id as ViewId),
    );
    body.append(tabs.el);

    const charView = h('div', 'pi-ch');
    charView.append(this.buildHead(), this.buildCols());
    const titles = emptyState({
      icon: '/assets/icons/ui-trophy.svg',
      title: 'Henüz unvanın yok',
      text: 'Zindan ilk temizlikleri ve başarımlar unvan kazandırır.',
      action: { label: 'Görev Defteri', onClick: () => openPanel('questlog') },
    });
    const sets = emptyState({
      icon: '/assets/icons/ui-bag.svg',
      title: 'Ekipman setleri yakında',
      text: 'Kuşandığın eşyaları kaydedip tek tıkla değiştireceksin.',
      action: { label: 'Çantayı Aç', onClick: () => openPanel('inventory') },
    });
    this.views.set('char', charView);
    this.views.set('titles', titles);
    this.views.set('sets', sets);
    body.append(charView, titles, sets);
    this.showView('char');
  }

  private showView(id: ViewId): void {

    for (const [k, el] of this.views) el.style.display = k === id ? '' : 'none';
    this.statSig = '';
    if (this.isOpen) this.refresh();
  }

  /** Header strip (52 px): class + name, the item level pair, the Mitik+ score. */
  private buildHead(): HTMLElement {
    const head = h('div', 'pi-ch-head');
    const who = h('div', 'pi-ch-who');
    this.clsEl = h('div', 'pi-ch-cls');
    this.nameEl = h('div', 'pi-ch-name');
    this.unvanEl = h('div', 'pi-ch-title');
    who.append(this.clsEl, this.nameEl, this.unvanEl);

    const ilvl = h('div', 'pi-ch-ilvl');
    this.ilvlEl = h('div', 'pi-ch-ilvl-n');
    ilvl.append(this.ilvlEl, h('div', 'pi-ch-ilvl-cap', 'kuşanılan / toplam'));
    bindTip(ilvl, () => '<div class="pi-tip-name" style="color:#ffd35a">Eşya Seviyesi</div><div class="pi-tip-line">Solda: kuşandığın eşyaların ortalaması. Sağda: her yuva için kuşanılan ya da çantadaki en iyi eşyanın ortalaması. Aradaki fark, çantanda daha iyi bir eşya olduğunu gösterir.</div>');

    const mplus = h('button', 'pi-ch-mplus') as HTMLButtonElement;
    mplus.type = 'button';
    mplus.append(h('span', 'pi-ch-mplus-l', 'Mitik+ Puanı'));
    this.mplusVal = h('b', 'pi-ch-mplus-v', '–');
    mplus.append(this.mplusVal);
    mplus.title = 'Mitik+ Bilgisi';
    mplus.addEventListener('click', () => openPanel('mplusInfo'));
    head.append(who, ilvl, mplus);
    return head;
  }

  /** Body columns: gear 272 · model 250 · gear 272 · stats 1fr, 8 px apart (section 7.7). */
  private buildCols(): HTMLElement {
    const cols = h('div', 'pi-ch-cols');
    const colL = h('div', 'pi-ch-gear');
    for (const s of LEFT) colL.append(this.makeRow(s, false));

    const model = h('div', 'pi-ch-model');
    this.preview = new CharacterPreview(220, 300);
    model.append(this.preview.el);

    const xp = h('div', 'pi-xp');
    this.xpFill = h('div', 'pi-xp-fill');
    this.xpText = h('div', 'pi-xp-text');
    xp.append(this.xpFill, this.xpText);
    bindTip(xp, () => {
      const c = G.character;
      if (!c) return null;
      const need = G.progression?.xpToNext(c.level) ?? 0;
      return `<div class="pi-tip-name" style="color:#b57aff">Tecrübe</div><div class="pi-tip-line">${fmt(c.save.xp)} / ${fmt(need)}</div>`;
    });
    // appearance options
    const opts = h('label', 'pi-doll-opts');
    this.helmBox = h('input') as HTMLInputElement;
    this.helmBox.type = 'checkbox';
    this.helmBox.addEventListener('change', () => {
      const c = G.character;
      if (!c) return;
      c.save.flags.hideHelm = this.helmBox.checked;
      sfx('ui_click');
      this.preview.setHideHelm(this.helmBox.checked);
      try {
        c.persist();
        G.events.emit('equipment:changed', { slot: 'helm' });
      } catch {
        /* ignore */
      }
    });
    opts.append(this.helmBox, h('span', 'pi-optbox'), h('span', 'pi-opt-txt', 'Kaskı gizle'));
    bindTip(opts, () => '<div class="pi-tip-name">Kaskı Gizle</div><div class="pi-tip-line">Kaskın görünümünü karakter modelinde gizler. Kaskın nitelikleri geçerli kalır.</div>');
    this.durEl = chip('');
    this.durEl.classList.add('pi-ch-dur');
    this.durEl.addEventListener('click', () => {
      if (this.durEl.classList.contains('is-bad')) openPanel('blacksmith');
    });
    bindTip(this.durEl, () => '<div class="pi-tip-name">Dayanıklılık</div><div class="pi-tip-line">Kırık eşyalar nitelik vermez. Demirci’de onarılır. Kırık durumdayken tıklarsan Demirci açılır.</div>');
    model.append(opts, xp, this.durEl);

    const colR = h('div', 'pi-ch-gear pi-ch-gear--r');
    for (const s of RIGHT) colR.append(this.makeRow(s, true));

    this.statsEl = h('div', 'pi-ch-stats k-scroll');
    cols.append(colL, model, colR, this.statsEl);
    return cols;
  }

  /** One gear row: slot tile + name / item level line. Right-column rows mirror the order (text on the outer edge). */
  private makeRow(slot: EquipSlot, right: boolean): HTMLElement {
    const row = h('div', `pi-gear-row${right ? ' is-right' : ''}`);
    const slotEl = this.makeSlot(slot);
    const txt = h('div', 'pi-gear-txt');
    const name = h('div', 'pi-gear-name');
    const meta = h('div', 'pi-gear-meta');
    txt.append(name, meta);
    if (right) row.append(txt, slotEl);
    else row.append(slotEl, txt);
    this.gear.set(slot, { row, name, meta });
    return row;
  }

  private makeSlot(slot: EquipSlot): HTMLElement {
    const s = new ItemSlot('lg', SLOT_ICON[slot], EQUIP_SLOT_NAMES_TR[slot]);
    this.slots.set(slot, s);
    drag.bindSource(s.el, {
      payload: () => (s.item ? { kind: 'item', item: s.item, loc: { where: 'equipment', slot } } : null),
      onContext: (e) => {
        if (s.item) quickAction({ where: 'equipment', slot }, s.item, e);
      },
      onDouble: (e) => {
        if (s.item) quickAction({ where: 'equipment', slot }, s.item, e);
      },
      // WP-13: Shift+click on a worn item links it into the chat input
      onClick: (e) => {
        if (e.shiftKey && s.item) linkItemInChat(s.item);
      },
    });
    drag.zone(s.el, {
      accepts: (p) => p.kind === 'item' && canPlace(p.item, { where: 'equipment', slot }),
      drop: (p) => (p.kind === 'item' ? moveItem(p.loc, { where: 'equipment', slot }) : false),
    });
    bindItemTip(s.el, () => s.item, { compare: false, footer: () => '<div class="pi-tip-hint">Sağ tık: çıkar</div>' });
    return s.el;
  }

  protected subscribe(s: EventScope): void {
    s.on('equipment:changed', (e) => {
      this.safeRefresh();
      const slot = this.slots.get(e.slot as EquipSlot);
      if (slot?.item) flashEl(slot.el, 'pop', 650);
    })
      .on('inventory:changed', this.safeRefresh)
      .on('player:stats', this.safeRefresh)
      .on('player:levelup', this.safeRefresh)
      .on('player:xp', this.safeRefresh)
      .on('item:upgraded', this.safeRefresh);
  }

  protected onOpen(): void {
    this.prevStats = null;
    this.statSig = '';
    this.preview.start();
    this.syncPreview(true);
  }

  protected onClose(): void {
    this.preview.stop();
  }

  private syncPreview(force: boolean): void {
    const c = G.character;
    if (!c) return;
    const key = `${c.save.id}|${c.classId}|${c.save.appearance.variant}|${c.save.appearance.tint ?? ''}|${c.save.flags?.hooded === false ? 0 : 1}`;
    const hideHelm = !!c.save.flags?.hideHelm;
    this.helmBox.checked = hideHelm;
    const eq = c.save.equipment;
    const vis = (['weapon', 'offhand', 'helm'] as EquipSlot[]).map((s) => `${eq[s]?.uid ?? ''}:${eq[s]?.upgrade ?? 0}`).join('|');
    if (key !== this.charKey || (force && !this.charKey)) {
      this.charKey = key;
      this.visSig = vis + `|${hideHelm ? 1 : 0}`;
      void this.preview.setCharacter(c.classId, c.save.appearance.variant, { ...eq }, { tint: c.save.appearance.tint, hideHelm, hooded: c.save.flags?.hooded !== false });
    } else if (vis + `|${hideHelm ? 1 : 0}` !== this.visSig) {
      this.visSig = vis + `|${hideHelm ? 1 : 0}`;
      this.preview.setHideHelm(hideHelm);
      this.preview.setGear({ ...eq });
    }
  }

  /** Best item level per slot over the equipment and the bag, averaged over the slots that have one (the header's "overall"). */
  private overallIlvl(): number {
    const c = G.character;
    if (!c) return 0;
    const best = new Map<EquipSlot, number>();
    const up = (s: EquipSlot, v: number): void => {
      if (v > (best.get(s) ?? 0)) best.set(s, v);
    };
    for (const [s, it] of Object.entries(c.save.equipment)) if (it && !it.broken) up(s as EquipSlot, it.itemLevel);
    for (const it of c.save.bag) {
      if (!it || it.broken) continue;
      for (const s of ALL_SLOTS) if (canPlace(it, { where: 'equipment', slot: s })) up(s, it.itemLevel);
    }
    if (!best.size) return 0;
    let sum = 0;
    for (const v of best.values()) sum += v;
    return sum / best.size;
  }

  protected refresh(): void {
    const c = G.character;
    if (!c) {
      this.nameEl.textContent = 'Karakter yok';
      this.unvanEl.textContent = '';
      return;
    }
    this.syncPreview(false);
    const eq = c.save.equipment;
    const weapon = eq.weapon;
    for (const [slot, s] of this.slots) {
      const dis = slot === 'offhand' && isTwoHanded(weapon);
      s.set(eq[slot] ?? null, { disabled: dis && !eq[slot] });
    }
    this.refreshGear();

    const cls = CLASSES[c.classId]?.name ?? CLASS_TR[c.classId];
    this.clsEl.textContent = `Sv. ${c.level} ${cls}`;
    this.clsEl.style.color = CLASS_META[c.classId]?.color ?? '';
    this.statsEl.style.setProperty('--cls', CLASS_META[c.classId]?.color ?? '#8a8a8a');
    this.nameEl.textContent = c.save.name;
    this.unvanEl.textContent = selectedTitleName(c.save);
    let il = 0;
    try {
      il = c.itemLevel();
    } catch {
      il = 0;
    }
    this.ilvlEl.textContent = `EŞ ${fmt1(il)} / ${fmt1(this.overallIlvl())}`;
    const rating = c.save.mythic?.rating ?? 0;
    this.mplusVal.textContent = rating > 0 ? (Number.isInteger(rating) ? fmt(rating) : fmt1(rating)) : '–';
    this.mplusVal.style.color = rating > 0 ? ratingTier(rating).color : '';

    const broken = Object.values(eq).filter((it) => it?.broken).length;
    this.durEl.textContent = broken ? `Dayanıklılık: Kırık ${broken}` : 'Dayanıklılık: Sağlam';
    this.durEl.classList.toggle('is-bad', broken > 0);
    this.durEl.classList.toggle('is-ok', broken === 0);

    const need = G.progression?.xpToNext(c.level) ?? 100 * c.level;
    const atCap = c.level >= LEVEL_CAP;
    this.xpFill.style.width = atCap ? '100%' : `${Math.max(0, Math.min(100, (c.save.xp / Math.max(1, need)) * 100))}%`;
    this.xpText.textContent = atCap ? 'Maksimum seviye' : `TP ${fmt(c.save.xp)} / ${fmt(need)}`;
    this.renderStats(weapon ?? null);
  }

  /** Gear row texts: name in the rarity colour, then item level · +N · sockets (Kırık when broken). */
  private refreshGear(): void {
    const c = G.character;
    if (!c) return;
    const eq = c.save.equipment;
    for (const [slot, g] of this.gear) {
      const it = eq[slot] ?? null;
      g.row.classList.toggle('is-empty', !it);
      g.row.classList.toggle('is-broken', !!it?.broken);
      if (!it) {
        g.name.textContent = EQUIP_SLOT_NAMES_TR[slot];
        g.name.style.color = '';
        g.meta.textContent = '—';
        continue;
      }
      g.name.textContent = it.name || getItemBase(it.baseId)?.name || it.baseId;
      g.name.style.color = RARITY_COLORS[it.rarity] ?? '';
      g.meta.textContent = it.broken
        ? 'Kırık'
        : [String(it.itemLevel), it.upgrade ? `+${it.upgrade}` : '', socketMarks(it)].filter(Boolean).join(' · ');
    }
  }

  private renderStats(weapon: ItemInstance | null): void {
    const c = G.character;
    if (!c) return;
    this.lastWeapon = weapon;
    const st = c.stats;
    const sig = JSON.stringify(st) + `|${c.level}|${weapon?.uid ?? ''}${weapon?.upgrade ?? 0}|${[...this.collapsed].join(',')}`;
    if (sig === this.statSig) return;
    this.statSig = sig;
    this.statsEl.replaceChildren();
    for (const id of ['attr', 'sec', 'ter']) {
      const cat = CATS.find((x) => x.id === id);
      if (cat) this.statsEl.append(this.catBox(cat, weapon));
    }
    const legacy = h('div', 'pi-cat pi-cat--legacy');
    legacy.append(this.catHead(LEGACY_KEY, 'Saldırı · Savunma · Fayda', 'stat-armor.svg'));
    if (!this.collapsed.has(LEGACY_KEY)) {
      for (const id of LEGACY_CATS) {
        const cat = CATS.find((x) => x.id === id);
        if (cat) legacy.append(this.catBox(cat, weapon, true));
      }
    }
    this.statsEl.append(legacy);
    this.prevStats = { ...(st as unknown as Record<string, number>) };
  }

  private catHead(id: string, title: string, icon: string): HTMLButtonElement {
    const head = h('button', 'pi-cat-head') as HTMLButtonElement;
    head.type = 'button';
    const ic = h('i', 'pi-cat-ico');
    ic.style.setProperty('--ico', `url("/assets/icons/${icon}")`);
    head.append(ic, h('span', '', title), h('em', 'pi-cat-arrow', this.collapsed.has(id) ? '▸' : '▾'));
    head.addEventListener('click', () => {
      if (this.collapsed.has(id)) this.collapsed.delete(id);
      else this.collapsed.add(id);
      this.saveCollapsed();
      this.statSig = '';
      this.renderStats(this.lastWeapon);
    });
    return head;
  }

  private catBox(cat: CatDef, weapon: ItemInstance | null, nested = false): HTMLElement {
    const box = h('div', nested ? 'pi-cat pi-cat--sub' : 'pi-cat');
    box.append(this.catHead(cat.id, cat.title, cat.icon));
    const c = G.character;
    if (!c || this.collapsed.has(cat.id)) return box;
    const st = c.stats;
    const main = MAIN_STAT[c.classId];
    const res = CLASSES[c.classId]?.resourceName ?? RESOURCE_TR[c.classId];
    const list = h('div', 'pi-cat-rows');
    // custom leading rows
    if (cat.id === 'off') {
      const wmin = st.weaponMin ?? 0;
      const wmax = st.weaponMax ?? 0;
      list.append(this.row('Silah Hasarı', wmax > 0 ? `${fmt(wmin)} - ${fmt(wmax)}` : '-', '', 'Kuşandığın silahın (ve gövde nitelikleriyle) ortalama vuruş hasar aralığı.'));
      const dps = weapon ? describe(weapon).damage?.dps : undefined;
      if (dps) list.append(this.row('Silah DPS', dps.toFixed(1).replace('.', ','), 'hi', 'Silahının saniye başına ortalama hasarı (nitelik ve diğer bonuslar hariç).'));
    }
    for (const r of cat.rows) {
      const v = st[r.id] ?? 0;
      if (cat.id === 'def' && r.id === 'blockAmount' && (st.blockChance ?? 0) <= 0) continue;
      if (!r.always && Math.abs(v) < 1e-9) continue;
      if (r.id === 'maxResource' && v === 0) continue;
      const cls = r.id === main ? 'main' : v < 0 ? 'neg' : r.id.startsWith('res') && v > 0 ? 'res' : '';
      let label = r.label ?? statName(r.id);
      if (r.id === 'maxHpPct') label = 'Maks. Can %';
      if (r.id === 'maxResource') label = `Maks. ${res}`;
      if (r.id === 'resourceRegen') label = `${res} Yenilenmesi/sn`;
      const val = r.id === 'maxHp' || r.id === 'armor' || r.id === 'maxResource' || r.id === 'pickupRadius' ? fmt(v) : fmtStatValue(r.id, v, r.signed);
      let doc = STAT_DOCS[r.id] ?? `${statName(r.id)}.`;
      if (r.id === 'armor') {
        const dr = Math.min(0.75, v / (v + 50 * c.level + 200));
        doc += `<div class="pi-tip-up2">Seviye ${c.level} bir düşmana karşı: %${(dr * 100).toFixed(1).replace('.', ',')} fiziksel hasar azaltma</div>`;
      }
      if (r.id === main) doc += `<div class="pi-tip-gold">Bu sınıfın ana niteliği</div>`;
      const prev = this.prevStats ? this.prevStats[r.id] ?? 0 : null;
      const diff = prev === null ? 0 : v - prev;
      list.append(this.row(label, val, cls, doc, Math.abs(diff) > 1e-6 ? diff : 0));
    }
    box.append(list);
    return box;
  }

  private loadCollapsed(): Set<string> {
    try {
      const raw = localStorage.getItem(CHAR_SHEET_KEY);
      if (raw) {
        const v: unknown = JSON.parse(raw);
        if (Array.isArray(v)) return new Set(v.filter((x): x is string => typeof x === 'string'));
      }
    } catch {
      /* corrupt or unavailable: defaults */
    }
    return new Set([LEGACY_KEY]);
  }

  private saveCollapsed(): void {
    try {
      localStorage.setItem(CHAR_SHEET_KEY, JSON.stringify([...this.collapsed]));
    } catch {
      /* ignore */
    }
  }

  private row(label: string, value: string, cls: string, doc: string, diff = 0): HTMLElement {
    const r = h('div', `pi-stat ${cls}${diff > 0 ? ' gain' : diff < 0 ? ' loss' : ''}`);
    r.append(h('span', 'pi-stat-l', label), h('span', 'pi-stat-v', value));
    bindTip(r, () => `<div class="pi-tip-name">${esc(label)}</div><div class="pi-tip-line">${doc.startsWith('<') || doc.includes('<div') ? doc : esc(doc)}</div>`);
    return r;
  }
}
