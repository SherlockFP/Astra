import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import { RARITY_COLORS, RARITY_NAMES_TR, type Rarity } from '../../../types/common';
import type { ItemInstance } from '../../../types/items';
import type { VendorEntry } from '../../../systems/Vendor';
import type { UpgradeResult } from '../../../systems/Upgrade';
import { gemEffect as itemGemEffect } from '../../../systems/ItemGen';
import { ItemPanel, makeTabs, openCompanionBag, releaseCompanionBag, type TabsHandle } from './PanelBase';
import { forgeApi, vendorApi } from './backend';
import { ForgeFx } from './ForgeFx';
import {
  ItemSlot, baseOf, bindItemTip, bindTip, describe, drag, esc, fmt, fmtStatValue, gemColor, gemName, gemParts, h, isEquipItem,
  materialInfo, sfx, statName, toast,
} from './common';

const STAGE_W = 300;
const STAGE_H = 336;
/** Centre of the anvil slot inside the stage (particle origin). */
const CX = STAGE_W / 2;
const CY = 150;

type Tab = 'up' | 'efsun' | 'socket' | 'salvage';

const MAX_UPGRADE: Record<Rarity, number> = { poor: 0, common: 9, uncommon: 9, rare: 12, epic: 15, legendary: 15, set: 15 };

const SALVAGE_HINT: Record<Rarity, string> = {
  poor: 'Kara Demir ×1 (%50 şans)',
  common: 'Kara Demir ×1-2',
  uncommon: 'Kara Demir ×2-3, Büyülü Toz ×1',
  rare: 'Kara Demir ×1-2, Büyülü Toz ×2-4, Ejderha Pulu (%10)',
  epic: 'Büyülü Toz ×4-6, Ejderha Pulu ×1-2',
  legendary: 'Büyülü Toz ×6-8, Ejderha Pulu ×2-3, Ruh Taşı ×1',
  set: 'Büyülü Toz ×6-8, Ejderha Pulu ×2-3, Ruh Taşı ×1',
};

function chanceColor(p: number): string {
  if (p >= 0.8) return '#5ee06a';
  if (p >= 0.5) return '#e8d45a';
  if (p >= 0.25) return '#f09a3a';
  return '#ff5a4a';
}

/** Text of a gem's effect for a given item type (ItemGen.gemEffect knows the socket category rules). */
function gemEffectText(gemId: string, item: ItemInstance | null): string {
  try {
    return itemGemEffect(gemId, item ? baseOf(item) : undefined)?.lines.join(', ') ?? '';
  } catch {
    return '';
  }
}

function yieldText(list: { id: string; count: number }[]): string {
  return list.map((y) => `${materialInfo(y.id).name} ×${y.count}`).join(', ');
}

/**
 * Demirci: +N upgrades (success %, costs, protection, El Kitabı, big animated result), efsun (affix reroll with locks,
 * Kadim Efsun, Takviye), sockets (gems, extra sockets, removal, combining) and salvage (Parçala).
 */
export class BlacksmithPanel extends ItemPanel {
  private tabs!: TabsHandle;
  private tab: Tab = 'up';
  private uid: string | null = null;
  private stage!: HTMLDivElement;
  private slot!: ItemSlot;
  private fx!: ForgeFx;
  private banner!: HTMLDivElement;
  private hammer!: HTMLElement;
  private slotWrap!: HTMLDivElement;
  private clearBtn!: HTMLButtonElement;
  private hintEl!: HTMLDivElement;
  private info!: HTMLDivElement;
  private shop!: HTMLDivElement;
  private shopEntries: VendorEntry[] = [];
  private shopOpen = false;
  private busy = false;
  private useProt = false;
  private useBook = false;
  private salvageMax: Rarity = 'common';
  private locked = new Set<number>();
  private selSocket = -1;
  private timers: number[] = [];
  private rolledSig = '';

  constructor() {
    super('blacksmith', {
      title: 'Demirci',
      icon: 'ui-blacksmith.svg',
      width: 716,
      height: 610,
      pos: () => [24, 34],
    });
  }

  /* -------------------------------------------------------------- build */

  protected build(body: HTMLElement): void {
    this.tabs = makeTabs(
      [
        { id: 'up', label: 'Yükselt', icon: 'ui-anvil.svg' },
        { id: 'efsun', label: 'Efsun', icon: 'item-efsun-orb.svg' },
        { id: 'socket', label: 'Taş Yuvası', icon: 'item-gems.svg' },
        { id: 'salvage', label: 'Parçala', icon: 'item-metal-bar.svg' },
      ],
      (id) => {
        if (this.busy) return;
        this.tab = id as Tab;
        this.selSocket = -1;
        this.refresh();
      },
      'big',
    );
    body.append(this.tabs.el);

    const main = h('div', 'pi-forge');

    // ---- stage (anvil)
    this.stage = h('div', 'pi-stage');
    this.stage.style.width = `${STAGE_W}px`;
    this.stage.style.height = `${STAGE_H}px`;
    const heat = h('div', 'pi-heat');
    const anvil = h('i', 'pi-anvil');
    anvil.style.setProperty('--ico', 'url("/assets/icons/ui-anvil.svg")');
    this.hammer = h('i', 'pi-hammer');
    this.hammer.style.setProperty('--ico', 'url("/assets/icons/item-hammer.svg")');
    this.slotWrap = h('div', 'pi-forge-slot');
    this.slot = new ItemSlot('xl', 'ui-anvil.svg');
    this.slotWrap.append(this.slot.el);
    this.clearBtn = h('button', 'pi-forge-clear', '✕');
    this.clearBtn.title = 'Eşyayı örsten al';
    this.clearBtn.addEventListener('click', () => {
      if (!this.busy) this.clear();
    });
    this.slotWrap.append(this.clearBtn);
    this.hintEl = h('div', 'pi-stage-hint');
    this.banner = h('div', 'pi-banner');
    this.fx = new ForgeFx(STAGE_W, STAGE_H);
    this.stage.append(heat, anvil, this.slotWrap, this.hammer, this.fx.canvas, this.banner, this.hintEl, h('div', 'pi-flash'));

    drag.zone(this.slotWrap, {
      accepts: (p) => p.kind === 'item' && isEquipItem(p.item) && !this.busy,
      drop: (p) => {
        if (p.kind !== 'item') return false;
        this.setItem(p.item.uid);
      },
    });
    drag.bindSource(this.slot.el, {
      payload: () => null,
      onContext: () => {
        if (!this.busy) this.clear();
      },
    });
    bindItemTip(this.slot.el, () => this.slot.item, { compare: false });

    // ---- info column
    this.info = h('div', 'pi-forge-info');
    main.append(this.stage, this.info);

    // ---- material shop strip
    this.shop = h('div', 'pi-shop');
    body.append(main, this.shop);
  }

  protected subscribe(s: EventScope): void {
    const r = () => {
      if (!this.busy) this.safeRefresh();
    };
    s.on('inventory:changed', r).on('equipment:changed', r).on('materials:changed', r).on('player:gold', r).on('item:upgraded', r);
  }

  protected onOpen(data?: unknown): void {
    const d = data as { tab?: Tab; uid?: string } | undefined;
    if (d?.tab) {
      this.tab = d.tab;
      this.tabs.set(d.tab, true);
    }
    if (d?.uid) this.uid = d.uid;
    try {
      this.shopEntries = vendorApi.entries('blacksmith').filter((e) => e.materialId);
    } catch {
      this.shopEntries = [];
    }
    this.fx.start();
    openCompanionBag(this.id);
  }

  protected onClose(): void {
    releaseCompanionBag(this.id);
    this.fx.stop();
    this.fx.clear();
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.busy = false;
    this.tabs.el.classList.remove('locked');
    this.stage.classList.remove('charging', 'magic', 'res-success', 'res-fail', 'res-destroy', 'res-magic', 'shake-s', 'shake-m', 'shake-l');
  }

  /* -------------------------------------------------------------- item */

  private item(): ItemInstance | null {
    const c = G.character;
    if (!c || !this.uid) return null;
    try {
      return c.findItem(this.uid)?.item ?? null;
    } catch {
      return null;
    }
  }

  private equipped(): boolean {
    const c = G.character;
    return !!c && !!this.uid && c.findItem(this.uid)?.loc.where === 'equipment';
  }

  /** Put an item (by uid) on the anvil. Called from drag&drop and right click. */
  setItem(uid: string): void {
    if (this.busy) return;
    const found = G.character?.findItem(uid)?.item;
    if (!found) return;
    if (!isEquipItem(found)) {
      toast("Bu eşya Demirci'de işlenemez", 'warning');
      sfx('ui_error');
      return;
    }
    this.uid = uid;
    this.locked.clear();
    this.selSocket = -1;
    this.useProt = false;
    this.useBook = false;
    sfx('ui_click');
    this.fx.sparks(CX, CY, 8, '#ffcf7a', 120);
    this.refresh();
  }

  private clear(): void {
    this.uid = null;
    this.locked.clear();
    this.selSocket = -1;
    sfx('ui_click');
    this.refresh();
  }

  /* ------------------------------------------------------------ refresh */

  protected refresh(): void {
    const item = this.item();
    if (this.uid && !item) this.uid = null;
    this.slot.set(item);
    this.clearBtn.style.display = item ? '' : 'none';
    this.slotWrap.classList.toggle('filled', !!item);
    const hints: Record<Tab, string> = {
      up: 'Yükseltmek istediğin eşyayı örse sürükle',
      efsun: 'Efsunlamak istediğin eşyayı örse sürükle',
      socket: 'Taş takmak istediğin eşyayı örse sürükle',
      salvage: 'Parçalamak istediğin eşyayı örse sürükle',
    };
    this.hintEl.textContent = item ? '' : hints[this.tab];
    this.hintEl.style.display = item ? 'none' : '';
    this.stage.dataset.tab = this.tab;
    this.stage.style.setProperty('--rc', item ? RARITY_COLORS[item.rarity] : '#8a6a3a');
    this.fx.heat = item ? 0.45 : 0.2;
    this.info.replaceChildren();
    if (this.tab === 'up') this.buildUpgrade(item);
    else if (this.tab === 'efsun') this.buildEfsun(item);
    else if (this.tab === 'socket') this.buildSockets(item);
    else this.buildSalvage(item);
    this.buildShop();
  }

  private matRow(id: string, need: number): HTMLElement {
    const c = G.character;
    const have = c ? c.material(id) : 0;
    const info = materialInfo(id);
    const row = h('div', `pi-mat${have >= need ? '' : ' lack'}`);
    const ico = h('i', 'pi-mat-ico');
    ico.style.setProperty('--ico', `url("${info.icon}")`);
    ico.style.setProperty('--rc', RARITY_COLORS[info.rarity]);
    row.append(ico, h('span', 'pi-mat-name', info.name), h('span', 'pi-mat-n', `${fmt(have)} / ${fmt(need)}`));
    bindTip(row, () => `<div class="pi-tip-name" style="color:${RARITY_COLORS[info.rarity]}">${esc(info.name)}</div>${info.desc ? `<div class="pi-tip-line">${esc(info.desc)}</div>` : ''}<div class="pi-tip-dim">Elinde: ${fmt(have)}</div>`);
    return row;
  }

  private goldRow(gold: number): HTMLElement {
    const c = G.character;
    const lack = !!c && c.save.gold < gold;
    const row = h('div', `pi-mat gold${lack ? ' lack' : ''}`);
    row.append(h('i', 'pi-coin'), h('span', 'pi-mat-name', 'Altın'), h('span', 'pi-mat-n', `${fmt(c?.save.gold ?? 0)} / ${fmt(gold)}`));
    return row;
  }

  private emptyInfo(lines: string[]): void {
    const box = h('div', 'pi-forge-empty');
    box.append(h('div', 'pi-forge-empty-title', 'Demirci'));
    for (const l of lines) box.append(h('div', 'pi-forge-empty-line', l));
    this.info.append(box);
  }

  private itemHeader(item: ItemInstance): HTMLElement {
    const d = describe(item);
    const box = h('div', 'pi-fi-head');
    const name = h('div', 'pi-fi-name', d.name.replace(/\s*\+\d+$/, ''));
    name.style.color = RARITY_COLORS[item.rarity];
    box.append(name, h('div', 'pi-fi-sub', `${d.slotLabel} · Eşya Seviyesi ${item.itemLevel}`));
    return box;
  }

  /** A "use this extra item" toggle row (Kutsama Kağıdı, Demircinin El Kitabı). */
  private toggleRow(matId: string, label: string, enabled: boolean, on: boolean, note: string, onChange: (v: boolean) => void): HTMLElement {
    const c = G.character;
    const have = c?.material(matId) ?? 0;
    const info = materialInfo(matId);
    const row = h('label', `pi-prot${enabled ? '' : ' off'}${on ? ' on' : ''}`);
    const cb = h('input') as HTMLInputElement;
    cb.type = 'checkbox';
    cb.checked = on && enabled;
    cb.disabled = !enabled || this.busy;
    cb.addEventListener('change', () => {
      sfx('ui_click');
      onChange(cb.checked);
    });
    const ico = h('i', 'pi-prot-ico');
    ico.style.setProperty('--ico', `url("${info.icon}")`);
    row.append(cb, h('span', 'pi-prot-box'), ico, h('span', 'pi-prot-txt', label), h('em', '', note || `Elinde: ${fmt(have)}`));
    bindTip(row, () => `<div class="pi-tip-name" style="color:${RARITY_COLORS[info.rarity]}">${esc(info.name)}</div><div class="pi-tip-line">${esc(info.desc)}</div><div class="pi-tip-dim">Elinde: ${fmt(have)}</div>`);
    return row;
  }

  /* ------------------------------------------------------------ upgrade */

  private buildUpgrade(item: ItemInstance | null): void {
    if (!item) {
      this.emptyInfo([
        "Eşyalarını +15'e kadar yükseltebilirsin.",
        '+1 ile +2 garantidir; ilerledikçe şans düşer.',
        "+7'ye çıkarken başarısızlık seviyeyi düşürür, +10'dan itibaren eşya YOK OLUR!",
        'Kutsama Kağıdı seni başarısızlığın cezasından korur.',
        "Demircinin El Kitabı bir denemenin şansını %10 artırır.",
      ]);
      return;
    }
    const c = G.character;
    const cur = item.upgrade ?? 0;
    this.info.append(this.itemHeader(item));
    const haveBook = (c?.material('demirci_el_kitabi') ?? 0) > 0;
    if (!haveBook) this.useBook = false;
    const cost = forgeApi.upgradeCost(item, { useBook: this.useBook });
    const lvl = h('div', 'pi-lvl');
    lvl.append(h('span', 'pi-lvl-cur', `+${cur}`), h('i', 'pi-lvl-arrow', '➜'), h('span', 'pi-lvl-next', cost ? `+${cur + 1}` : 'MAKS'));
    this.info.append(lvl);
    if (!cost) {
      const why = item.rarity === 'poor' ? 'Sıradan eşyalar yükseltilemez.' : cur >= MAX_UPGRADE[item.rarity] ? `Bu eşya en yüksek seviyede (+${MAX_UPGRADE[item.rarity]}).` : 'Bu eşya yükseltilemez.';
      this.info.append(h('div', 'pi-fi-note bad', why));
      return;
    }

    // success chance
    const pct = Math.round(cost.successChance * 100);
    const bar = h('div', 'pi-chance');
    const fill = h('div', 'pi-chance-fill');
    fill.style.width = `${pct}%`;
    fill.style.background = chanceColor(cost.successChance);
    bar.append(fill, h('span', 'pi-chance-txt', `Başarı Şansı: %${pct}`));
    this.info.append(bar);
    if (cost.failStacksBonus) this.info.append(h('div', 'pi-fi-note good', `Demircinin Hatırası: +%${Math.round(cost.failStacksBonus * 100)} şans (önceki başarısız denemelerin)`));
    const failTxt = cost.failOutcome === 'stay' ? 'Başarısız olursa: seviye korunur.' : cost.failOutcome === 'downgrade' ? 'Başarısız olursa: seviye 1 düşer!' : 'Başarısız olursa: EŞYA YOK OLUR!';
    this.info.append(h('div', `pi-fi-note ${cost.failOutcome === 'destroy' ? 'danger' : cost.failOutcome === 'downgrade' ? 'warn' : ''}`, failTxt));

    // stat preview
    const nextItem: ItemInstance = { ...item, upgrade: cur + 1 };
    const dNow = describe(item).upgradeLine;
    const dNext = describe(nextItem).upgradeLine;
    if (dNow || dNext) {
      const pv = h('div', 'pi-preview-lines');
      if (dNow) pv.append(h('div', 'pi-pv now', dNow));
      if (dNext) pv.append(h('div', 'pi-pv next', dNext));
      this.info.append(pv);
    }

    // costs
    const costs = h('div', 'pi-costs');
    costs.append(this.goldRow(cost.gold));
    for (const m of cost.materials) costs.append(this.matRow(m.id, m.count));
    this.info.append(costs);

    // protection + book
    const protId = cost.protectedBy;
    let canProt = false;
    if (protId) {
      const have = c?.material(protId) ?? 0;
      canProt = have > 0;
      if (!canProt) this.useProt = false;
      this.info.append(
        this.toggleRow(protId, 'Kutsama Kağıdı kullan', canProt, this.useProt, '', (v) => {
          this.useProt = v;
          this.refresh();
        }),
      );
    }
    this.info.append(
      this.toggleRow('demirci_el_kitabi', 'El Kitabı kullan (+%10)', haveBook, this.useBook, haveBook ? '' : 'Elinde yok', (v) => {
        this.useBook = v;
        this.refresh();
      }),
    );

    // button
    const lackGold = !!c && c.save.gold < cost.gold;
    const lackMat = cost.materials.some((m) => (c?.material(m.id) ?? 0) < m.count);
    const btn = h('button', 'pi-btn primary big pi-go', 'YÜKSELT');
    btn.disabled = this.busy || lackGold || lackMat;
    btn.addEventListener('click', () => this.doUpgrade(item, cost.failOutcome, this.useProt && canProt, this.useBook && haveBook));
    this.info.append(btn);
    if (lackGold || lackMat) this.info.append(h('div', 'pi-fi-note bad', lackGold ? 'Yeterli altının yok.' : 'Yeterli malzemen yok.'));
  }

  private doUpgrade(item: ItemInstance, failOutcome: string, prot: boolean, book: boolean): void {
    const oldLevel = item.upgrade ?? 0;
    const color = RARITY_COLORS[item.rarity];
    this.perform<UpgradeResult>(
      'iron',
      3,
      () => forgeApi.upgradeItem(item.uid, { useProtection: prot, useBook: book }),
      (res) => this.revealUpgrade(res, oldLevel, failOutcome, prot, color),
    );
  }

  private revealUpgrade(res: UpgradeResult, oldLevel: number, failOutcome: string, prot: boolean, color: string): void {
    if (!res.ok) {
      this.showBanner(res.reason ?? 'Yükseltme yapılamadı', '', 'fail');
      this.stageFlash('res-fail', 'shake-s');
      sfx('ui_error');
      this.endBusy(500);
      return;
    }
    if (res.success) {
      this.stageFlash('res-success');
      this.fx.sparks(CX, CY, 90, '#ffd35a', 380, 0.9);
      this.fx.sparks(CX, CY, 40, '#fff4c0', 240, 0.6);
      this.fx.ring(CX, CY, '#ffe08a', 190);
      this.fx.glints(CX, CY, 14);
      this.showBanner('BAŞARILI!', `+${oldLevel} ➜ +${res.newLevel}`, 'success');
      sfx('upgrade_success');
      this.pulseSlot();
      if (res.newLevel >= 12) toast(`Muhteşem! Eşyan +${res.newLevel} oldu!`, 'levelup');
      this.endBusy(1100);
      return;
    }
    if (res.destroyed) {
      this.slot.set(null);
      this.stageFlash('res-destroy', 'shake-l');
      this.fx.shards(CX, CY, 34, color);
      this.fx.sparks(CX, CY, 50, '#ff5a3a', 320, 0.5);
      this.fx.smoke(CX, CY, 14, 'rgba(40,30,30,');
      this.fx.ring(CX, CY, '#ff4030', 150);
      this.showBanner('EŞYA YOK OLDU!', 'Demirci başını salladı...', 'destroy');
      sfx('upgrade_destroy');
      this.uid = null;
      this.endBusy(1500);
      return;
    }
    // plain failure
    this.stageFlash('res-fail', 'shake-m');
    this.fx.smoke(CX, CY + 10, 12);
    this.fx.sparks(CX, CY, 16, '#8a8a90', 160, 0.3);
    let sub = 'Seviye korundu.';
    if (res.downgraded || res.newLevel < oldLevel) sub = `Seviye düştü: +${oldLevel} ➜ +${res.newLevel}`;
    else if ((res.protectedUsed || prot) && failOutcome !== 'stay') sub = 'Kutsama Kağıdı seni korudu!';
    this.showBanner('BAŞARISIZ!', sub, 'fail');
    sfx('upgrade_fail');
    this.endBusy(900);
  }

  /* -------------------------------------------------------------- efsun */

  private affixList(item: ItemInstance): { text: string; tier: number; kind: string }[] {
    const d = describe(item);
    const lines = d.affixLines.filter((l) => l.kind !== 'unique');
    if (lines.length === item.affixes.length) return item.affixes.map((a, i) => ({ text: lines[i].text, tier: a.tier, kind: lines[i].kind }));
    return item.affixes.map((a) => ({ text: `${fmtStatValue(a.stat, a.value, true)} ${statName(a.stat)}`, tier: a.tier, kind: 'prefix' }));
  }

  private buildEfsun(item: ItemInstance | null): void {
    if (!item) {
      this.emptyInfo([
        'Efsun, eşyanın rastgele özelliklerini yeniden çevirir.',
        'Beğendiğin özelliği kilitleyerek koruyabilirsin (en fazla 2).',
        'Her kilit için Efsun Kilidi gerekir.',
        'Kadim Efsun yalnızca değerleri yeniler, Takviye Nesnesi yeni bir özellik ekler.',
      ]);
      return;
    }
    const c = G.character;
    this.info.append(this.itemHeader(item));
    const list = this.affixList(item);
    for (const i of [...this.locked]) if (i >= list.length) this.locked.delete(i);
    if (list.length) {
      const box = h('div', 'pi-affixes');
      const sig = list.map((l) => l.text).join('|');
      const rolled = !!this.rolledSig && this.rolledSig !== sig;
      list.forEach((l, i) => {
        const row = h('label', `pi-affix${this.locked.has(i) ? ' locked' : ''}${rolled && !this.locked.has(i) ? ' rolled' : ''}`);
        row.style.animationDelay = `${i * 90}ms`;
        const cb = h('input') as HTMLInputElement;
        cb.type = 'checkbox';
        cb.checked = this.locked.has(i);
        cb.disabled = this.busy;
        cb.addEventListener('change', () => {
          if (cb.checked && this.locked.size >= 2) {
            cb.checked = false;
            toast('En fazla 2 özellik kilitlenebilir', 'warning');
            sfx('ui_error');
            return;
          }
          if (cb.checked) this.locked.add(i);
          else this.locked.delete(i);
          sfx('ui_click');
          this.refresh();
        });
        const lock = h('i', 'pi-lockbox');
        lock.style.setProperty('--ico', `url("/assets/icons/${this.locked.has(i) ? 'ui-lock.svg' : 'ui-unlock.svg'}")`);
        row.append(cb, lock, h('span', 'pi-affix-text', l.text), h('em', 'pi-affix-tier', `T${l.tier + 1}`));
        box.append(row);
      });
      this.rolledSig = sig;
      this.info.append(box);
      this.info.append(h('div', 'pi-fi-note', `Kilitli özellik: ${this.locked.size} / 2`));
    } else {
      this.info.append(h('div', 'pi-fi-note', 'Bu eşyada efsun yok.'));
    }

    const cost = forgeApi.efsunCost(item, this.locked.size);
    if (cost) {
      const costs = h('div', 'pi-costs');
      costs.append(this.goldRow(cost.gold));
      for (const m of cost.materials) costs.append(this.matRow(m.id, m.count));
      this.info.append(costs);
      const lackGold = !!c && c.save.gold < cost.gold;
      const lackMat = cost.materials.some((m) => (c?.material(m.id) ?? 0) < m.count);
      const btn = h('button', 'pi-btn primary big pi-go magic', 'EFSUN YAP');
      btn.disabled = this.busy || lackGold || lackMat;
      btn.addEventListener('click', () => this.doEfsun(item));
      this.info.append(btn);
      if (lackGold || lackMat) this.info.append(h('div', 'pi-fi-note bad', lackGold ? 'Yeterli altının yok.' : 'Yeterli malzemen yok.'));
    } else {
      this.info.append(h('div', 'pi-fi-note bad', item.rarity === 'poor' ? 'Sıradan eşyalara efsun yapılamaz.' : item.rarity === 'common' ? 'Normal eşyalara Takviye Nesnesi kullan.' : item.rarity === 'set' ? 'Set eşyalarına efsun yapılamaz.' : 'Bu eşyaya efsun yapılamaz.'));
    }

    // secondary: Kadim Efsun / Takviye
    const sec = h('div', 'pi-efsun-sec');
    const kadim = materialInfo('kadim_efsun');
    const tak = materialInfo('takviye_nesnesi');
    const haveK = c?.material('kadim_efsun') ?? 0;
    const haveT = c?.material('takviye_nesnesi') ?? 0;
    const bK = h('button', 'pi-btn sm', `Kadim Efsun (${haveK})`);
    bK.disabled = this.busy || haveK < 1 || !list.length;
    bK.addEventListener('click', () => this.doSimple(item, 'Kadim Efsun', () => forgeApi.kadimEfsun(item.uid), 'DEĞERLER YENİLENDİ!', 'Kademeler korundu'));
    bindTip(bK, () => `<div class="pi-tip-name" style="color:${RARITY_COLORS[kadim.rarity]}">${esc(kadim.name)}</div><div class="pi-tip-line">${esc(kadim.desc)}</div>`);
    const bT = h('button', 'pi-btn sm', `Takviye (${haveT})`);
    bT.disabled = this.busy || haveT < 1;
    bT.addEventListener('click', () => this.doSimple(item, 'Takviye', () => forgeApi.takviye(item.uid), 'YENİ EFSUN!', 'Eşyana bir özellik eklendi'));
    bindTip(bT, () => `<div class="pi-tip-name" style="color:${RARITY_COLORS[tak.rarity]}">${esc(tak.name)}</div><div class="pi-tip-line">${esc(tak.desc)}</div>`);
    sec.append(bK, bT);
    this.info.append(sec);
  }

  private doEfsun(item: ItemInstance): void {
    const locked = [...this.locked];
    this.stage.classList.add('magic');
    this.perform<{ ok: boolean; reason?: string }>(
      'magic',
      2,
      () => forgeApi.efsun(item.uid, locked),
      (r) => {
        if (!r.ok) return this.revealError(r.reason ?? 'Efsun yapılamadı');
        this.revealMagic('EFSUN TAMAM!', 'Özellikler yenilendi');
      },
    );
  }

  /** Secondary one-click actions (Kadim Efsun, Takviye). */
  private doSimple(item: ItemInstance, _name: string, fn: () => { ok: boolean; reason?: string }, title: string, sub: string): void {
    void item;
    this.perform<{ ok: boolean; reason?: string }>('magic', 1, fn, (r) => (r.ok ? this.revealMagic(title, sub) : this.revealError(r.reason ?? 'Yapılamadı')));
  }

  /* ------------------------------------------------------------ sockets */

  private gemsOwned(): { id: string; n: number }[] {
    const c = G.character;
    if (!c) return [];
    return Object.keys(c.save.materials)
      .filter((id) => gemParts(id) && (c.save.materials[id] ?? 0) > 0)
      .map((id) => ({ id, n: c.save.materials[id] }))
      .sort((a, b) => {
        const pa = gemParts(a.id)!;
        const pb = gemParts(b.id)!;
        return pa.type < pb.type ? -1 : pa.type > pb.type ? 1 : pb.grade - pa.grade;
      });
  }

  private buildSockets(item: ItemInstance | null): void {
    if (!item) {
      this.emptyInfo([
        'Taşlar eşyalara güç verir: silahlara hasar, zırhlara nitelik, takılara direnç.',
        'Oyma Kalemi ile yeni yuva açabilirsin.',
        'Dolu yuvaya yeni taş takarsan eski taş yok olur.',
        'Aynı türden 3 taşı bir üst dereceye birleştirebilirsin.',
      ]);
      return;
    }
    const c = G.character;
    this.info.append(this.itemHeader(item));
    const socks = item.sockets ?? [];
    const max = forgeApi.maxSocketsOf(item);
    const row = h('div', 'pi-sockets');
    if (!socks.length) row.append(h('div', 'pi-fi-note', 'Bu eşyada hiç taş yuvası yok.'));
    socks.forEach((g, i) => {
      const s = h('button', `pi-sock${g ? ' filled' : ''}${this.selSocket === i ? ' sel' : ''}`);
      s.style.setProperty('--gc', gemColor(g));
      s.append(h('i', 'pi-sock-gem'));
      s.addEventListener('click', () => {
        if (this.busy) return;
        this.selSocket = this.selSocket === i ? -1 : i;
        sfx('ui_click');
        this.refresh();
      });
      bindTip(s, () => (g ? `<div class="pi-tip-name" style="color:${gemColor(g)}">${esc(gemName(g))}</div><div class="pi-tip-line">${esc(gemEffectText(g, item))}</div>` : '<div class="pi-tip-name">Boş Yuva</div><div class="pi-tip-dim">Aşağıdan bir taş seç.</div>'));
      row.append(s);
    });
    this.info.append(row);
    this.info.append(h('div', 'pi-fi-note', `Yuva: ${socks.length} / ${max}${this.selSocket >= 0 ? ` · Seçili: ${this.selSocket + 1}. yuva` : ''}`));

    // remove gem from the selected socket
    const selGem = this.selSocket >= 0 ? socks[this.selSocket] : null;
    if (selGem) {
      const gp = gemParts(selGem);
      const price = 500 * (gp?.grade ?? 1);
      const rm = h('button', 'pi-btn sm', `Taşı Çıkar (${fmt(price)} altın)`);
      rm.disabled = this.busy || !c || c.save.gold < price;
      rm.addEventListener('click', () => {
        const idx = this.selSocket;
        this.perform<{ ok: boolean; reason?: string }>(
          'iron',
          1,
          () => forgeApi.removeGem(item.uid, idx),
          (r) => {
            if (!r.ok) return this.revealError(r.reason ?? 'Taş çıkarılamadı');
            this.selSocket = -1;
            this.revealGold('TAŞ ÇIKARILDI!', `${gemName(selGem)} kesene döndü`, gemColor(selGem));
          },
        );
      });
      this.info.append(rm);
    }

    // gem picker
    const gems = this.gemsOwned();
    const picker = h('div', 'pi-gems');
    if (!gems.length) picker.append(h('div', 'pi-empty', 'Kesende hiç taş yok.'));
    for (const g of gems) {
      const gp = gemParts(g.id)!;
      const b = h('div', `pi-gem${this.busy || !socks.length ? ' off' : ''}`);
      b.style.setProperty('--gc', gemColor(g.id));
      b.append(h('i', 'pi-sock-gem'), h('span', 'pi-gem-name', gemName(g.id)), h('em', 'pi-gem-fx', gemEffectText(g.id, item)), h('span', 'pi-gem-n', `x${g.n}`));
      b.addEventListener('click', () => {
        if (!this.busy && socks.length) void this.doSocket(item, g.id);
      });
      if (g.n >= 3 && gp.grade < 6) {
        const cc = forgeApi.combineCost(gp.grade);
        const mini = h('button', 'pi-mini', '3➜1');
        mini.disabled = this.busy;
        mini.addEventListener('click', (e) => {
          e.stopPropagation();
          this.doCombine(gp.type, gp.grade, g.id);
        });
        bindTip(mini, () => `<div class="pi-tip-name">Taş Birleştir</div><div class="pi-tip-line">3 adet ${esc(gemName(g.id))} ➜ 1 üst derece taş</div>${cc ? `<div class="pi-tip-gold">${fmt(cc.gold)} altın${cc.materials.map((m) => ` + ${esc(materialInfo(m.id).name)} ×${m.count}`).join('')}</div>` : ''}`);
        b.append(mini);
      }
      picker.append(b);
    }
    this.info.append(picker);

    // add socket
    const cost = forgeApi.addSocketCost(item);
    const addRow = h('div', 'pi-addsock');
    const have = c?.material('oyma_kalemi') ?? 0;
    addRow.append(this.matRow('oyma_kalemi', 1));
    if (cost) addRow.append(this.goldRow(cost.gold));
    const btn = h('button', 'pi-btn primary pi-go', 'YUVA AÇ');
    btn.disabled = this.busy || !cost || have < 1 || (!!cost && !!c && c.save.gold < cost.gold);
    btn.addEventListener('click', () => this.doAddSocket(item));
    addRow.append(btn);
    if (!cost) addRow.append(h('div', 'pi-fi-note bad', item.rarity === 'poor' ? 'Sıradan eşyalara yuva açılamaz.' : 'Bu eşya en fazla yuva sayısına ulaştı.'));
    this.info.append(addRow);
  }

  private async doSocket(item: ItemInstance, gemId: string): Promise<void> {
    if (this.busy) return;
    const socks = item.sockets ?? [];
    let idx = this.selSocket >= 0 ? this.selSocket : socks.findIndex((x) => !x);
    if (idx < 0) idx = 0;
    if (!socks.length) return;
    const old = socks[idx];
    if (old) {
      let ok = false;
      try {
        ok = await G.ui.confirm(`Bu yuvadaki ${gemName(old)} yok olacak. Devam edilsin mi?`, 'Evet', 'Vazgeç');
      } catch {
        ok = false;
      }
      if (!ok) return;
    }
    this.perform<{ ok: boolean; reason?: string }>(
      'magic',
      1,
      () => forgeApi.socketGem(item.uid, idx, gemId),
      (r) => {
        if (!r.ok) return this.revealError(r.reason ?? 'Taş takılamadı');
        this.selSocket = -1;
        this.revealGold('TAŞ TAKILDI!', gemName(gemId), gemColor(gemId));
      },
    );
  }

  private doAddSocket(item: ItemInstance): void {
    this.perform<{ ok: boolean; reason?: string }>(
      'iron',
      2,
      () => forgeApi.addSocket(item.uid),
      (r) => (r.ok ? this.revealGold('YUVA AÇILDI!', 'Yeni bir taş yuvası', '#ffe9a0') : this.revealError(r.reason ?? 'Yuva açılamadı')),
    );
  }

  private doCombine(type: string, grade: number, gemId: string): void {
    this.perform<{ ok: boolean; reason?: string; resultId?: string }>(
      'magic',
      2,
      () => forgeApi.combineGems(type as Parameters<typeof forgeApi.combineGems>[0], grade),
      (r) => {
        if (!r.ok) return this.revealError(r.reason ?? 'Taşlar birleştirilemedi');
        const out = r.resultId ?? gemId;
        this.revealGold('TAŞLAR BİRLEŞTİ!', gemName(out), gemColor(out));
      },
    );
  }

  /* ------------------------------------------------------------ salvage */

  private buildSalvage(item: ItemInstance | null): void {
    const c = G.character;
    if (!item) {
      this.emptyInfo([
        'Eşyayı parçalayıp malzemeye çevirirsin.',
        'Yükseltilmiş eşyada harcanan malzemenin %30\'u geri döner.',
        'Takılı taşlar kesene iade edilir.',
        'Kilitli ve kuşanılmış eşyalar parçalanamaz.',
      ]);
      this.buildBulk();
      return;
    }
    this.info.append(this.itemHeader(item));
    const box = h('div', 'pi-preview-lines');
    box.append(h('div', 'pi-pv now', `${RARITY_NAMES_TR[item.rarity]} eşya verir:`), h('div', 'pi-pv next', SALVAGE_HINT[item.rarity]));
    if ((item.upgrade ?? 0) > 0) box.append(h('div', 'pi-pv now', `+${item.upgrade} yükseltme: yatırılan malzemenin %30'u geri döner.`));
    if (item.sockets?.some((g) => g)) box.append(h('div', 'pi-pv now', 'Takılı taşlar iade edilir.'));
    this.info.append(box);
    const equipped = this.equipped();
    const why = equipped ? 'Kuşanılan eşya parçalanamaz. Önce çıkar.' : item.locked ? 'Eşya kilitli. Kilidi açmak için Ctrl + Tık.' : '';
    const btn = h('button', 'pi-btn primary big pi-go danger', 'PARÇALA');
    btn.disabled = this.busy || !!why;
    btn.addEventListener('click', () => void this.doSalvage(item));
    this.info.append(btn);
    if (why) this.info.append(h('div', 'pi-fi-note bad', why));
    void c;
    this.buildBulk();
  }

  private buildBulk(): void {
    const c = G.character;
    const box = h('div', 'pi-bulk');
    box.append(h('div', 'pi-shop-title', 'Toplu Parçala'));
    const row = h('div', 'pi-chips');
    for (const r of ['poor', 'common', 'uncommon', 'rare'] as Rarity[]) {
      const b = h('button', `pi-chip${this.salvageMax === r ? ' on' : ''}`, RARITY_NAMES_TR[r]);
      b.style.setProperty('--rc', RARITY_COLORS[r]);
      b.addEventListener('click', () => {
        this.salvageMax = r;
        sfx('ui_tab');
        this.refresh();
      });
      row.append(b);
    }
    const order: Rarity[] = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
    const limit = order.indexOf(this.salvageMax);
    const count = c ? c.save.bag.filter((it) => it && !it.locked && isEquipItem(it) && order.indexOf(it.rarity) <= limit).length : 0;
    const go = h('button', 'pi-btn sm danger', `Toplu Parçala (${count})`);
    go.disabled = this.busy || count === 0;
    go.addEventListener('click', () => void this.doBulk(count));
    box.append(row, go, h('div', 'pi-fi-note', 'Seçilen nadirlik ve altındaki kilitsiz çanta eşyaları parçalanır.'));
    this.info.append(box);
  }

  private async doSalvage(item: ItemInstance): Promise<void> {
    if (this.busy) return;
    if (['rare', 'epic', 'legendary', 'set'].includes(item.rarity) || (item.upgrade ?? 0) >= 5) {
      let ok = false;
      try {
        ok = await G.ui.confirm(`${describe(item).name} parçalansın mı? Bu işlem geri alınamaz.`, 'Parçala', 'Vazgeç');
      } catch {
        ok = false;
      }
      if (!ok) return;
    }
    const color = RARITY_COLORS[item.rarity];
    this.perform<ReturnType<typeof forgeApi.salvageItem>>(
      'iron',
      3,
      () => forgeApi.salvageItem(item.uid),
      (r) => {
        if (!r.ok) return this.revealError(r.reason ?? 'Parçalanamadı');
        this.slot.set(null);
        this.stageFlash('res-destroy', 'shake-m');
        this.fx.shards(CX, CY, 26, color);
        this.fx.sparks(CX, CY, 40, '#ffb347', 300, 0.6);
        this.fx.ring(CX, CY, '#ffcf7a', 140);
        this.showBanner('PARÇALANDI!', yieldText(r.yields) || 'Hiçbir şey kalmadı', 'success');
        sfx('item_pickup');
        this.uid = null;
        this.endBusy(1300);
      },
    );
  }

  private async doBulk(count: number): Promise<void> {
    if (this.busy || count <= 0) return;
    let ok = false;
    try {
      ok = await G.ui.confirm(`${count} eşya parçalansın mı? Bu işlem geri alınamaz.`, 'Parçala', 'Vazgeç');
    } catch {
      ok = false;
    }
    if (!ok) return;
    this.perform<ReturnType<typeof forgeApi.salvageAll>>(
      'iron',
      3,
      () => forgeApi.salvageAll(this.salvageMax),
      (r) => {
        if (!r.count) return this.revealError('Parçalanacak eşya yok');
        this.stageFlash('res-destroy', 'shake-m');
        this.fx.shards(CX, CY, 30, '#c9a24a');
        this.fx.sparks(CX, CY, 50, '#ffb347', 320, 0.6);
        this.showBanner(`${r.count} EŞYA PARÇALANDI!`, yieldText(r.yields), 'success');
        sfx('item_pickup');
        this.endBusy(1300);
      },
    );
  }

  /* --------------------------------------------------------------- shop */

  private buildShop(): void {
    this.shop.replaceChildren();
    if (!this.shopEntries.length) {
      this.shop.style.display = 'none';
      return;
    }
    this.shop.style.display = '';
    const c = G.character;
    const title = h('button', 'pi-shop-title', `${this.shopOpen ? '▾' : '▸'} Malzeme Satışı`);
    title.addEventListener('click', () => {
      this.shopOpen = !this.shopOpen;
      sfx('ui_tab');
      this.buildShop();
    });
    this.shop.append(title);
    if (!this.shopOpen) return;
    const row = h('div', 'pi-shop-row');
    for (const e of this.shopEntries) {
      const info = materialInfo(e.materialId ?? '');
      const limited = e.stock !== undefined && e.stock <= 0;
      const b = h('button', `pi-shopitem${c && c.save.gold < e.price ? ' poor' : ''}${limited ? ' off' : ''}`);
      const ico = h('i', 'pi-mat-ico');
      ico.style.setProperty('--ico', `url("${info.icon}")`);
      ico.style.setProperty('--rc', RARITY_COLORS[info.rarity]);
      b.append(ico, h('span', 'pi-shop-name', info.name), h('span', 'pi-shop-price', h('i', 'pi-coin'), fmt(e.price)));
      b.addEventListener('click', (ev) => {
        const q = ev.shiftKey ? 10 : 1;
        if (c && c.save.gold < e.price * q) {
          toast('Yeterli altının yok', 'warning');
          sfx('ui_error');
          return;
        }
        const r = vendorApi.buy(e, q);
        if (r.ok) {
          sfx('buy');
          this.buildShop();
        } else {
          toast(r.reason ?? 'Satın alınamadı', 'warning');
          sfx('ui_error');
        }
      });
      bindTip(b, () => `<div class="pi-tip-name" style="color:${RARITY_COLORS[info.rarity]}">${esc(info.name)}</div>${info.desc ? `<div class="pi-tip-line">${esc(info.desc)}</div>` : ''}<div class="pi-tip-dim">Elinde: ${fmt(c?.material(e.materialId ?? '') ?? 0)}${e.stock !== undefined ? ` · Bugün kalan: ${e.stock}` : ''}</div><div class="pi-tip-hint">Tık: 1 adet · Shift+Tık: 10 adet</div>`);
      row.append(b);
    }
    this.shop.append(row);
  }

  /* ---------------------------------------------------------- animation */

  /** Pay for / attempt an action: lock the UI, hammer, call `fn`, then reveal its outcome. */
  private perform<T>(kind: 'iron' | 'magic', n: number, fn: () => T, reveal: (r: T) => void): void {
    if (this.busy) return;
    this.setBusy(true);
    this.strike(n, kind, () => {
      let r: T;
      try {
        r = fn();
      } catch (e) {
        console.error('[blacksmith] action failed', e);
        this.stage.classList.remove('charging', 'magic');
        this.setHeat(0);
        this.showBanner('Bir hata oluştu', '', 'fail');
        this.endBusy(300);
        return;
      }
      this.stage.classList.remove('charging', 'magic');
      this.setHeat(0);
      reveal(r);
    });
  }

  private revealError(reason: string): void {
    this.showBanner(reason, '', 'fail');
    this.stageFlash('res-fail', 'shake-s');
    sfx('ui_error');
    this.endBusy(500);
  }

  private revealMagic(title: string, sub: string): void {
    this.stageFlash('res-magic');
    this.fx.sparks(CX, CY, 70, '#b98cff', 320, 0.8);
    this.fx.sparks(CX, CY, 30, '#7fd8ff', 220, 0.6);
    this.fx.ring(CX, CY, '#c9a4ff', 170);
    this.fx.glints(CX, CY, 12, '#e6d2ff');
    this.showBanner(title, sub, 'magic');
    sfx('efsun_reveal');
    sfx('upgrade_success', 0.7);
    sfx('buff', 0.6);
    this.pulseSlot();
    this.endBusy(600);
  }

  private revealGold(title: string, sub: string, color: string): void {
    this.stageFlash('res-success');
    this.fx.sparks(CX, CY, 46, color, 280, 0.7);
    this.fx.sparks(CX, CY, 20, '#fff4c0', 200, 0.5);
    this.fx.ring(CX, CY, color, 130);
    this.fx.glints(CX, CY, 8);
    this.showBanner(title, sub, 'success');
    sfx('upgrade_success');
    this.pulseSlot();
    this.endBusy(500);
  }

  private setBusy(v: boolean): void {
    this.busy = v;
    this.info.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach((b) => (b.disabled = v || b.disabled));
    this.tabs.el.classList.toggle('locked', v);
  }

  private endBusy(afterMs: number): void {
    this.later(() => {
      this.busy = false;
      this.tabs.el.classList.remove('locked');
      if (this.isOpen) this.refresh();
    }, afterMs);
  }

  private later(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      if (this.isOpen) fn();
    }, ms);
    this.timers.push(id);
  }

  private setHeat(v: number): void {
    this.stage.style.setProperty('--heat', String(v));
    this.fx.heat = 0.2 + v * 0.8;
  }

  /** n hammer blows (with sparks + sound), then `done`. */
  private strike(n: number, kind: 'iron' | 'magic', done: () => void): void {
    this.stage.classList.add('charging');
    this.stage.classList.toggle('magic', kind === 'magic');
    this.banner.className = 'pi-banner';
    const gap = kind === 'iron' ? 430 : 520;
    for (let k = 0; k < n; k++) {
      this.later(() => {
        this.setHeat((k + 1) / n);
        const col = kind === 'iron' ? '#ffb347' : '#b98cff';
        this.fx.sparks(CX, CY + 28, 16 + k * 6, col, 240 + k * 40, 0.7);
        if (k === n - 1) this.fx.ring(CX, CY, col, 90);
        if (kind === 'iron') {
          sfx('blacksmith_hammer', 0.85);
          sfx('hit_metal', 0.45);
        } else {
          sfx('efsun_reroll', 0.8);
          sfx('spell_cast', 0.4);
        }
        this.shake('shake-s');
        this.hammer.classList.remove('hit');
        void this.hammer.offsetWidth;
        this.hammer.classList.add('hit');
      }, 300 + k * gap);
    }
    this.later(done, 300 + (n - 1) * gap + 330);
  }

  private shake(cls: 'shake-s' | 'shake-m' | 'shake-l'): void {
    this.stage.classList.remove('shake-s', 'shake-m', 'shake-l');
    void this.stage.offsetWidth;
    this.stage.classList.add(cls);
  }

  private stageFlash(cls: 'res-success' | 'res-fail' | 'res-destroy' | 'res-magic', shake?: 'shake-s' | 'shake-m' | 'shake-l'): void {
    const st = this.stage;
    st.classList.remove('res-success', 'res-fail', 'res-destroy', 'res-magic');
    void st.offsetWidth;
    st.classList.add(cls);
    if (shake) this.shake(shake);
    this.later(() => st.classList.remove(cls), 1600);
  }

  private pulseSlot(): void {
    this.slotWrap.classList.remove('bounce');
    void this.slotWrap.offsetWidth;
    this.slotWrap.classList.add('bounce');
  }

  private showBanner(text: string, sub: string, kind: 'success' | 'fail' | 'destroy' | 'magic'): void {
    const b = this.banner;
    b.className = 'pi-banner';
    b.innerHTML = `<div class="pi-banner-main">${esc(text)}</div>${sub ? `<div class="pi-banner-sub">${esc(sub)}</div>` : ''}`;
    void b.offsetWidth;
    b.classList.add('show', kind);
    this.later(() => b.classList.remove('show'), 2600);
  }
}
