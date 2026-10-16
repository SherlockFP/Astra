import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import { MATERIALS, getMaterial } from '../../data/materials';
import { MOUNT_CALL_ID } from '../../data/mounts';
import type { AimInfo, SkillDef } from '../../types/skills';
import type { BarCell } from '../../types/character';
import type { UI } from '../UI';
import { drag, type DragPayload } from '../panels/items/common';
import { DAMAGE_COLORS, ICON, div, esc, fmtCd, fmtNum, h, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { skillTooltipHTML } from '../widgets/tooltips';
import type { EditFrame } from './EditMode';
import { readLayout } from './layoutStore';
import { applyBarDrop, barAccepts, barDropOutside, barPayload, placeBarCell, readBars, useBarMat } from './barDrop';
import { BAR_CELLS, canPickUp, cellAt, sharedCooldown, itemCount, type BarRow } from './barModel';
import type { HudCtx } from './types';

/**
 * Two extra 12-cell action bars ("Çubuk 2" / "Çubuk 3", hud module). Cells take skills from the skill book, consumables
 * from the pouch or the bags, and swap or move between cells by dragging. Shift+1..8 fires bar 2, Ctrl+1..8 fires bar 3
 * (a capture-phase key listener, so the main bar bindings do not fire too). Contents persist in the character save
 * (save.barLayout, see barDrop.ts). The bars are frames for the layout editor (EditMode.ts).
 */

export type ExtraBarId = 'bar2' | 'bar3';
export interface ExtraBarDef {
  id: ExtraBarId;
  name: string;
  mod: 'shift' | 'ctrl';
}
export const EXTRA_BARS: readonly ExtraBarDef[] = [
  { id: 'bar2', name: 'Çubuk 2', mod: 'shift' },
  { id: 'bar3', name: 'Çubuk 3', mod: 'ctrl' },
];

/** UI §2.6.6: each extra bar is 12 cells (a 3 x 12 block with the main row); cells 1-8 are keyed, 9-12 are mouse-only. */
const SLOTS = BAR_CELLS;
const KEYED = 8;

class XCell {
  readonly el: HTMLElement;
  private readonly ico: HTMLElement;
  private readonly sweep: HTMLElement;
  private readonly cdText: HTMLElement;
  private readonly charges: HTMLElement;
  private shownKey = '';
  private prevCd = 0;
  private hover = false;
  private content: BarCell | null = null;
  private def: SkillDef | null = null;
  private failUntil = 0;

  constructor(
    readonly idx: number,
    private readonly bind: string,
    private readonly ui: UI,
  ) {
    this.el = div('k-slot ab-btn xslot noskill');
    this.el.dataset.idx = String(idx);
    this.ico = iconEl(null, 'k-art', this.el);
    this.sweep = div('k-sweep', this.el);
    this.cdText = div('k-cdnum', this.el);
    if (bind) h('div', 'k-key-lbl', this.el, bind);
    this.charges = div('k-count', this.el);
    this.el.classList.add('hud-interactive');
    this.el.addEventListener('mouseenter', (e) => {
      this.hover = true;
      this.showTip(e);
    });
    this.el.addEventListener('mousemove', (e) => {
      if (this.hover) this.showTip(e);
    });
    this.el.addEventListener('mouseleave', () => {
      this.hover = false;
      ui.hideTooltipIf(this.el);
    });
  }

  setFlash(kind: 'press' | 'fail'): void {
    if (kind === 'press') {
      pulse(this.el, 'press');
    } else {
      pulse(this.el, 'fail');
      this.failUntil = performance.now() + 260;
    }
  }

  private showTip(e: MouseEvent): void {
    this.ui.showTooltipFor(this.el, this.tipHTML(), e.clientX, e.clientY);
  }

  private tipHTML(): string {
    const c = this.content;
    if (!c) {
      return `<div class="sk"><div class="sk-name">Boş Yuva</div><div class="sk-desc">Yetenek Kitabı'ndan bir yetenek sürükle. Sağ tık: tüketilebilir seç.</div><div class="sk-key">Tuş: <b>${esc(this.bind)}</b></div></div>`;
    }
    if (c.k === 'skill') {
      return this.def ? skillTooltipHTML(this.def, G.player, this.bind) : `<div class="sk"><div class="sk-name">${esc(c.id)}</div></div>`;
    }
    const m = getMaterial(c.id);
    if (c.id === MOUNT_CALL_ID) {
      // the summon cell: the tooltip names the key of the mount action (F9 by default), not only this cell's bar key
      const mountKey = G.input?.bindingLabel('mount') ?? '';
      return `<div class="sk"><div class="sk-head"><div><div class="sk-name">${esc(m?.name ?? 'Binek Çağır')}</div><div class="sk-tags">Binek</div></div></div><div class="sk-desc">${esc(m?.desc ?? '')}</div><div class="sk-key">Tuş: <b>${esc(mountKey)}</b>${this.bind ? ` · Çubuk: <b>${esc(this.bind)}</b>` : ''}</div></div>`;
    }
    const count = G.character?.material(c.id) ?? 0;
    return `<div class="sk"><div class="sk-head"><div><div class="sk-name">${esc(m?.name ?? c.id)}</div><div class="sk-tags">Tüketilebilir · Elindeki: ${fmtNum(count)}</div></div></div><div class="sk-desc">${esc(m?.desc ?? '')}</div><div class="sk-key">Tuş: <b>${esc(this.bind)}</b></div></div>`;
  }

  /** Refresh icon, cooldown sweeps, GCD, charges and resource tint for the current content. */
  update(ctx: HudCtx, c: BarCell | null): void {
    const p = ctx.player;
    this.content = c;
    const def = c?.k === 'skill' ? (G.skills?.getDef(c.id) ?? null) : null;
    this.def = def;
    const key = c ? `${c.k}:${c.id}:${def ? 1 : 0}` : '';
    if (key !== this.shownKey) {
      this.shownKey = key;
      let accent = '#e8c46a';
      if (c?.k === 'skill') {
        setIconUrl(this.ico, def?.icon ?? null);
        const dtype = def?.damage?.type;
        accent = dtype ? (DAMAGE_COLORS[dtype] ?? '#e8c46a') : def?.tags.includes('buff') ? '#9be86a' : '#e8c46a';
      } else if (c?.k === 'mat') {
        const m = getMaterial(c.id);
        setIconUrl(this.ico, m?.icon ?? ICON(m?.potion?.kind === 'mp' ? 'item-potion-mana' : 'item-potion-health'));
        accent = m?.potion ? (m.potion.kind === 'mp' ? '#6aa8ff' : '#ff6a5a') : '#e8c46a';
      } else {
        setIconUrl(this.ico, null);
      }
      setStyle(this.el, '--ac', accent);
    }

    let rem = 0;
    let total = 0;
    let charges = 1;
    let maxCharges = 1;
    let noRes = false;
    let casting = false;
    let count = 0;
    if (c?.k === 'skill' && def && p && G.skills) {
      const cdi = G.skills.getCooldown(p, def.id);
      rem = cdi.remaining;
      total = cdi.total;
      charges = cdi.charges;
      maxCharges = cdi.maxCharges;
      noRes = def.cost > 0 && p.resource < def.cost;
      casting = !!p.cast && p.cast.skillId === def.id;
    } else if (c?.k === 'mat') {
      count = itemCount(ctx.character?.save.materials ?? {}, c.id);
      const cd = sharedCooldown(p?.statuses.get('potion_cd'));
      rem = cd.remaining;
      total = cd.total;
    }
    setClass(this.el, 'noskill', !c || (c.k === 'skill' && !def));
    // sprint2: a mount cell summons the mount (not a pouch stack), so it is never shown as empty and has no count
    const mountCell = c?.k === 'mat' && (c.id === MOUNT_CALL_ID || !!getMaterial(c.id)?.teachesMount);
    setClass(this.el, 'empty', c?.k === 'mat' && !mountCell && count <= 0);
    // counts: > 1, or 0 on an empty consumable / a charge skill (`.is-zero`); exactly 1 shows nothing (UI §2.6.3)
    const countN = c?.k === 'mat' ? count : charges;
    const countOn = mountCell ? false : c?.k === 'mat' ? true : maxCharges > 1;
    setText(this.charges, String(countN));
    setClass(this.charges, 'is-zero', countN <= 0);
    setDisplay(this.charges, countOn && (countN > 1 || countN <= 0));

    const onCd = rem > 0.05 && total > 0;
    // charge skills only dim while no charge is left
    const lockedByCd = onCd && (maxCharges <= 1 || charges <= 0);
    // kit.css: --p is the remaining fraction; the number shows only while the cooldown locks the cell
    setClass(this.el, 'oncd', lockedByCd);
    if (onCd) setStyle(this.el, '--p', Math.min(1, rem / total).toFixed(3));
    setDisplay(this.sweep, onCd, 'block');
    if (lockedByCd) setText(this.cdText, fmtCd(rem));
    setDisplay(this.cdText, lockedByCd, 'flex');
    if (this.prevCd > 0.05 && rem <= 0.05 && c?.k === 'skill') pulse(this.el, 'ready');
    this.prevCd = rem;

    let gcdOn = false;
    if (c?.k === 'skill' && def && p && G.skills) {
      const g = G.skills.getGcd(p);
      if (g.remaining > 0.02 && g.total > 0 && rem <= g.remaining + 0.02) {
        setStyle(this.el, '--p', Math.min(1, g.remaining / g.total).toFixed(3));
        gcdOn = true;
      }
    }
    setClass(this.el, 'k-gcd', gcdOn);
    if (gcdOn) setDisplay(this.sweep, true, 'block');
    setClass(this.el, 'nores', noRes);
    setClass(this.el, 'casting', casting);
    setClass(this.el, 'failing', ctx.now < this.failUntil);
  }
}

class XBar {
  readonly el: HTMLElement;
  readonly frame: EditFrame;
  readonly cells: XCell[] = [];
  picker: HTMLElement | null = null;
  private readonly lockIco: HTMLElement;
  private lockShown: boolean | null = null;

  constructor(
    readonly def: ExtraBarDef,
    private readonly owner: ExtraBars,
    ui: UI,
  ) {
    this.el = div(`xbar xbar-${def.id}`);
    this.el.dataset.bar = def.id;
    this.el.style.display = 'none';
    const lockBtn = h('button', 'xbar-lock hud-interactive', this.el);
    lockBtn.type = 'button';
    lockBtn.title = 'Barları kilitle / kilidi aç';
    this.lockIco = iconEl(ICON('ui-unlock'), 'xbar-lico', lockBtn);
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      owner.toggleLock();
    });
    const row = div(def.id === 'bar2' ? 'ab-row r2' : 'ab-row r3', this.el);
    for (let i = 0; i < SLOTS; i++) {
      const bind = i < KEYED ? (def.mod === 'shift' ? 'S' : 'C') + (i + 1) : '';
      const cell = new XCell(i, bind, ui);
      row.appendChild(cell.el);
      this.cells.push(cell);
      owner.bindCell(this, cell);
    }
    this.frame = { id: def.id, name: def.name, el: this.el };
  }

  setLocked(locked: boolean): void {
    if (this.lockShown === locked) return;
    this.lockShown = locked;
    setClass(this.el, 'is-locked', locked);
    setIconUrl(this.lockIco, ICON(locked ? 'ui-lock' : 'ui-unlock'));
  }

  closePicker(): void {
    this.picker?.remove();
    this.picker = null;
  }
}

/** Owns the two extra bars: slot display, drag & drop, casting and keybinds. The contents live in the character save. */
export class ExtraBars {
  private readonly bars: XBar[];

  constructor(private readonly ui: UI) {
    this.bars = EXTRA_BARS.map((d) => new XBar(d, this, ui));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener(
      'pointerdown',
      (e) => {
        for (const b of this.bars) if (b.picker && !b.picker.contains(e.target as Node)) b.closePicker();
      },
      true,
    );
  }

  /** The bars as layout-editor frames. */
  get frames(): EditFrame[] {
    return this.bars.map((b) => b.frame);
  }

  mount(root: HTMLElement): void {
    for (const b of this.bars) root.appendChild(b.el);
  }

  /** Per-frame refresh (only the visible bars do any work). */
  update(ctx: HudCtx): void {
    const bars = readBars();
    const lock = G.settings?.data.barLock === true;
    const l = readLayout();
    for (const b of this.bars) {
      const shown = l.bars[b.def.id] === true;
      setDisplay(b.el, shown, 'flex');
      if (!shown) continue;
      b.setLocked(lock);
      const row: BarRow = bars[b.def.id];
      for (let i = 0; i < SLOTS; i++) b.cells[i].update(ctx, row[i] ?? null);
    }
  }

  /** The bar lock icon: Çubukları kilitle (Settings.barLock). */
  toggleLock(): void {
    const locked = G.settings?.data.barLock !== true;
    G.settings?.set('barLock', locked);
    this.ui.toast(locked ? 'Çubuklar kilitlendi.' : 'Çubukların kilidi açıldı.', 'info');
  }

  /** Wire one cell as a drop zone (skills, consumables, moved cells) and as a drag source (a filled cell; click casts). */
  bindCell(bar: XBar, cell: XCell): void {
    const ref = { bar: bar.def.id, idx: cell.idx };
    drag.zone(cell.el, {
      accepts: (p: DragPayload) => barAccepts(ref, p),
      drop: (p: DragPayload) => applyBarDrop(ref, p),
    });
    drag.bindSource(cell.el, {
      payload: (ev) => barPayload(ref, ev),
      onDropOutside: barDropOutside,
      onClick: () => this.activate(bar, cell.idx),
      onContext: (e) => this.onContext(bar, cell.idx, e),
    });
  }

  private onContext(bar: XBar, i: number, e: MouseEvent): void {
    e.preventDefault();
    const ref = { bar: bar.def.id, idx: i };
    const c = cellAt(readBars(), ref);
    if (c) {
      if (!canPickUp(G.settings?.data.barLock === true, e.shiftKey)) {
        this.ui.toast('Çubuklar kilitli. Eşyayı almak için Shift basılı tut.', 'info');
        return;
      }
      placeBarCell(ref, null);
      return;
    }
    this.openPicker(bar, i);
  }

  /** Small list of the consumables in the pouch; picking one fills the empty cell. */
  private openPicker(bar: XBar, i: number): void {
    bar.closePicker();
    const ch = G.character;
    const pick = div('xbar-pick ui-capture', bar.el);
    h('div', 'xbar-ptitle', pick, 'Tüketilebilirler');
    const list = ch
      ? Object.values(MATERIALS)
          .filter((m) => m.kind === 'consumable' && ch.material(m.id) > 0)
          .sort((a, b) => Number(!!b.potion) - Number(!!a.potion) || a.name.localeCompare(b.name, 'tr'))
      : [];
    if (!list.length) h('div', 'xbar-pnone', pick, 'Elinde tüketilebilir yok.');
    for (const m of list.slice(0, 40)) {
      const row = h('div', 'xbar-prow hud-interactive', pick);
      iconEl(m.icon, 'xbar-pico', row);
      h('span', 'xbar-pname', row, m.name);
      h('span', 'xbar-pn', row, fmtNum(ch ? ch.material(m.id) : 0));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        placeBarCell({ bar: bar.def.id, idx: i }, { k: 'mat', id: m.id });
        bar.closePicker();
      });
    }
    bar.picker = pick;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.altKey || e.metaKey) return;
    const m = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
    if (!m) return;
    const shift = e.shiftKey && !e.ctrlKey;
    const ctrl = e.ctrlKey && !e.shiftKey;
    if (!shift && !ctrl) return;
    const bar = this.bars.find((b) => b.def.mod === (shift ? 'shift' : 'ctrl'));
    if (!bar || readLayout().bars[bar.def.id] !== true) return;
    if (!G.player || this.ui.wantsCursor() || (this.ui.mode !== 'town' && this.ui.mode !== 'dungeon')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    // capture phase + stop: the main bar's Digit bindings (Input, bubble phase on window) must not fire as well.
    // Auto-repeat keydowns are swallowed too (Input would otherwise see them as fresh presses), but cast only once.
    e.stopPropagation();
    if (!e.repeat) this.activate(bar, Number(m[1]) - 1);
  }

  private activate(bar: XBar, idx: number): void {
    const c = cellAt(readBars(), { bar: bar.def.id, idx });
    const cell = bar.cells[idx];
    if (!c) {
      cell.setFlash('fail');
      return;
    }
    if (c.k === 'skill') this.castSkill(c.id, cell);
    else cell.setFlash(useBarMat(c.id) ? 'press' : 'fail');
  }

  private castSkill(id: string, cell: XCell): void {
    const p = G.player;
    if (!p || !G.skills) return;
    let ok = false;
    try {
      ok = G.skills.tryCast(p, id, this.aimFor(p));
    } catch (err) {
      console.error('[hud] extra bar cast failed', err);
    }
    if (ok) {
      cell.setFlash('press');
      return;
    }
    cell.setFlash('fail');
  }

  /** The controller's aim (soft target / ground point) when it is active, else the player's facing direction. */
  private aimFor(p: Player): AimInfo {
    const provider = G.skills?.aimProvider;
    if (provider) {
      try {
        return provider();
      } catch {
        /* fall through to facing */
      }
    }
    const yaw = p.yaw;
    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    return { point: [p.position.x + dx * 6, p.position.y, p.position.z + dz * 6], dir: [dx, 0, dz], targetId: null };
  }
}
