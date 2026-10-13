import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import { EQUIP_SLOT_NAMES_TR, type EquipSlot, type ItemInstance } from '../../../types/items';
import { LEVEL_CAP } from '../../../types/character';
import type { ClassId } from '../../../types/common';
import { type StatId } from '../../../types/stats';
import { CLASSES } from '../../../data/classes';
import { ItemPanel } from './PanelBase';
import { CharacterPreview } from './CharacterPreview';
import { canPlace, moveItem, quickAction } from './actions';
import {
  ItemSlot, SLOT_ICON, bindItemTip, bindTip, describe, drag, esc, flashEl, fmt, fmtStatValue, h, isTwoHanded, sfx, statName,
} from './common';

const LEFT: EquipSlot[] = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'];
const RIGHT: EquipSlot[] = ['amulet', 'belt', 'ring1', 'ring2', 'weapon', 'offhand'];

const CLASS_TR: Record<ClassId, string> = {
  knight: 'Şövalye', barbarian: 'Barbar', mage: 'Büyücü', rogue: 'Haydut',
  monk: 'Keşiş', archer: 'Okçu', paladin: 'Paladin', necromancer: 'Nekromant', warlock: 'Warlock',
  demonhunter: 'İblis Avcısı', evoker: 'Ejderhasoy', // CM1
};
const RESOURCE_TR: Record<ClassId, string> = {
  knight: 'Kararlılık', barbarian: 'Öfke', mage: 'Mana', rogue: 'Enerji',
  monk: 'Enerji', archer: 'Odak', paladin: 'İnanç', necromancer: 'Öz', warlock: 'Mana',
  demonhunter: 'Gazap', evoker: 'Öz', // CM1
};
const MAIN_STAT: Record<ClassId, StatId> = {
  knight: 'str', barbarian: 'str', mage: 'int', rogue: 'dex',
  monk: 'dex', archer: 'dex', paladin: 'str', necromancer: 'int', warlock: 'int',
  demonhunter: 'dex', evoker: 'int', // CM1
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

const CATS: CatDef[] = [
  { id: 'attr', title: 'Nitelikler', icon: 'stat-strength.svg', rows: [{ id: 'str', always: true }, { id: 'dex', always: true }, { id: 'int', always: true }, { id: 'vit', always: true }] },
  {
    id: 'off',
    title: 'Saldırı',
    icon: 'stat-damage.svg',
    rows: [
      { id: 'attackSpeed', always: true, signed: true },
      { id: 'critChance', always: true },
      { id: 'critDamage', always: true, signed: true },
      { id: 'castSpeed', signed: true },
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
      { id: 'cdr' },
      { id: 'lifeSteal' },
      { id: 'hpOnHit' },
      { id: 'hpOnKill' },
    ],
  },
  {
    id: 'def',
    title: 'Savunma',
    icon: 'stat-armor.svg',
    rows: [
      { id: 'maxHp', always: true },
      { id: 'armor', always: true },
      { id: 'dodgeChance', always: true },
      { id: 'blockChance' },
      { id: 'blockAmount' },
      { id: 'hpRegen' },
      { id: 'damageReductionPct' },
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
      { id: 'moveSpeedPct', always: true, signed: true },
      { id: 'goldFindPct', always: true, signed: true },
      { id: 'magicFindPct', always: true, signed: true },
      { id: 'xpPct', always: true, signed: true },
      { id: 'potionPct', signed: true },
      { id: 'pickupRadius' },
    ],
  },
];

/** Karakter: 12-slot paper doll around a live 3D preview + the full stat sheet. */
export class CharacterPanel extends ItemPanel {
  private slots = new Map<EquipSlot, ItemSlot>();
  private preview!: CharacterPreview;
  private nameEl!: HTMLDivElement;
  private subEl!: HTMLDivElement;
  private ilvlEl!: HTMLDivElement;
  private xpFill!: HTMLDivElement;
  private xpText!: HTMLDivElement;
  private helmBox!: HTMLInputElement;
  private statsEl!: HTMLDivElement;
  private statSig = '';
  private visSig = '';
  private charKey = '';
  private collapsed = new Set<string>();
  /** Stat values of the previous render (null right after opening): changed rows flash green / red. */
  private prevStats: Record<string, number> | null = null;

  constructor() {
    super('character', {
      title: 'Karakter',
      icon: 'ui-character.svg',
      width: 780,
      height: 600,
      pos: () => [18, 40],
    });
  }

  protected build(body: HTMLElement): void {
    const root = h('div', 'pi-char');

    // ---- left: doll
    const doll = h('div', 'pi-doll');
    const top = h('div', 'pi-doll-top');
    this.nameEl = h('div', 'pi-doll-name');
    this.subEl = h('div', 'pi-doll-sub');
    this.ilvlEl = h('div', 'pi-ilvl');
    bindTip(this.ilvlEl, () => '<div class="pi-tip-name" style="color:#ffd35a">Eşya Seviyesi</div><div class="pi-tip-line">Kuşandığın eşyaların ortalama eşya seviyesi. Yüksek anahtarlı zindanlara girmek için hedefin bu olmalı.</div>');
    top.append(this.nameEl, this.subEl, this.ilvlEl);

    const stage = h('div', 'pi-doll-stage');
    const colL = h('div', 'pi-doll-col');
    const colR = h('div', 'pi-doll-col');
    for (const s of LEFT) colL.append(this.makeSlot(s));
    for (const s of RIGHT) {
      colR.append(this.makeSlot(s));
      if (s === 'ring2') colR.append(h('div', 'pi-doll-sep'));
    }
    this.preview = new CharacterPreview(250, 340);
    stage.append(colL, this.preview.el, colR);

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
    doll.append(top, stage, xp, opts);

    // ---- right: stat sheet
    const sheet = h('div', 'pi-sheet');
    sheet.append(h('div', 'pi-sheet-title', 'Nitelikler'));
    this.statsEl = h('div', 'pi-stats');
    sheet.append(this.statsEl);

    root.append(doll, sheet);
    body.append(root);
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

  protected refresh(): void {
    const c = G.character;
    if (!c) {
      this.nameEl.textContent = 'Karakter yok';
      return;
    }
    this.syncPreview(false);
    const eq = c.save.equipment;
    const weapon = eq.weapon;
    for (const [slot, s] of this.slots) {
      const dis = slot === 'offhand' && isTwoHanded(weapon);
      s.set(eq[slot] ?? null, { disabled: dis && !eq[slot] });
    }
    const cls = CLASSES[c.classId]?.name ?? CLASS_TR[c.classId];
    this.nameEl.textContent = c.save.name;
    this.subEl.textContent = `Seviye ${c.level} ${cls}`;
    let il = 0;
    try {
      il = c.itemLevel();
    } catch {
      il = 0;
    }
    this.ilvlEl.textContent = `Eşya Seviyesi ${il}`;
    const need = G.progression?.xpToNext(c.level) ?? 100 * c.level;
    const atCap = c.level >= LEVEL_CAP;
    this.xpFill.style.width = atCap ? '100%' : `${Math.max(0, Math.min(100, (c.save.xp / Math.max(1, need)) * 100))}%`;
    this.xpText.textContent = atCap ? 'Maksimum seviye' : `TP ${fmt(c.save.xp)} / ${fmt(need)}`;
    this.renderStats(weapon ?? null);
  }

  private renderStats(weapon: ItemInstance | null): void {
    const c = G.character;
    if (!c) return;
    const st = c.stats;
    const sig = JSON.stringify(st) + `|${c.level}|${weapon?.uid ?? ''}${weapon?.upgrade ?? 0}|${[...this.collapsed].join(',')}`;
    if (sig === this.statSig) return;
    this.statSig = sig;
    const main = MAIN_STAT[c.classId];
    const res = CLASSES[c.classId]?.resourceName ?? RESOURCE_TR[c.classId];
    this.statsEl.replaceChildren();

    for (const cat of CATS) {
      const box = h('div', 'pi-cat');
      const head = h('button', 'pi-cat-head');
      const ic = h('i', 'pi-cat-ico');
      ic.style.setProperty('--ico', `url("/assets/icons/${cat.icon}")`);
      head.append(ic, h('span', '', cat.title), h('em', 'pi-cat-arrow', this.collapsed.has(cat.id) ? '▸' : '▾'));
      head.addEventListener('click', () => {
        if (this.collapsed.has(cat.id)) this.collapsed.delete(cat.id);
        else this.collapsed.add(cat.id);
        this.statSig = '';
        this.renderStats(weapon);
      });
      box.append(head);
      if (!this.collapsed.has(cat.id)) {
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
          let v = st[r.id] ?? 0;
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
      }
      this.statsEl.append(box);
    }
    this.prevStats = { ...(st as unknown as Record<string, number>) };
  }

  private row(label: string, value: string, cls: string, doc: string, diff = 0): HTMLElement {
    const r = h('div', `pi-stat ${cls}${diff > 0 ? ' gain' : diff < 0 ? ' loss' : ''}`);
    r.append(h('span', 'pi-stat-l', label), h('span', 'pi-stat-v', value));
    bindTip(r, () => `<div class="pi-tip-name">${esc(label)}</div><div class="pi-tip-line">${doc.startsWith('<') || doc.includes('<div') ? doc : esc(doc)}</div>`);
    return r;
  }
}
