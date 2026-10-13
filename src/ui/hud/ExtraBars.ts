import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import { MATERIALS, getMaterial } from '../../data/materials';
import type { AimInfo, SkillDef } from '../../types/skills';
import type { UI } from '../UI';
import { drag, type DragPayload } from '../panels/items/common';
import { DAMAGE_COLORS, ICON, div, esc, fmtCd, fmtNum, h, iconEl, pulse, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { skillTooltipHTML } from '../widgets/tooltips';
import type { EditFrame } from './EditMode';
import { readLayout, writeLayout } from './layoutStore';
import type { HudCtx } from './types';

/**
 * Two extra 8-slot action bars ("Çubuk 2" / "Çubuk 3", hud module). Slots take skills dragged from the skill book and
 * consumables (chosen with a right click on an empty slot). Shift+1..8 fires bar 2, Ctrl+1..8 fires bar 3 (handled here
 * in a capture-phase key listener, so the main bar bindings do not fire too). The bars are frames for the layout editor
 * (EditMode.ts); visibility and the lock live in layoutStore, slot contents are kept per character.
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

/** A slot's content: a skill id, or a consumable material id (potions go through G.combat.usePotion). */
export type BarContent = { k: 'skill'; id: string } | { k: 'mat'; id: string };

const SLOTS = 8;
const KEY_PREFIX = 'efsun.bars.';
const FAIL_TEXT: Record<string, string> = {
  cooldown: 'Henüz hazır değil',
  resource: 'Yeterli kaynak yok',
  range: 'Hedef menzil dışında',
  target: 'Geçerli bir hedef yok',
  stunned: 'Sersemlemiş durumdasın',
  casting: 'Zaten bir yetenek kullanıyorsun',
  silenced: 'Susturuldun',
};

/** The bar slot a skill is being dragged from; a drop onto another slot moves the skill (the source is cleared). */
let pendingMove: { bar: XBar; idx: number } | null = null;

function emptyContent(): (BarContent | null)[] {
  return Array.from({ length: SLOTS }, () => null);
}

function sanitizeContent(v: unknown): BarContent | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { k?: unknown; id?: unknown };
  if (typeof o.id !== 'string' || !o.id) return null;
  if (o.k === 'skill') return { k: 'skill', id: o.id };
  if (o.k === 'mat') return { k: 'mat', id: o.id };
  return null;
}

class XCell {
  readonly el: HTMLElement;
  private readonly ico: HTMLElement;
  private readonly cd: HTMLElement;
  private readonly gcd: HTMLElement;
  private readonly cdText: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly charges: HTMLElement;
  private shownKey = '';
  private prevCd = 0;
  private hover = false;
  private content: BarContent | null = null;
  private def: SkillDef | null = null;
  private failUntil = 0;

  constructor(
    readonly idx: number,
    private readonly bind: string,
    private readonly ui: UI,
  ) {
    this.el = div('slot sz-md xslot noskill');
    this.el.dataset.idx = String(idx);
    div('slot-bg', this.el);
    this.ico = iconEl(null, 'slot-ico', this.el);
    div('slot-tint', this.el);
    this.cd = div('slot-cd', this.el);
    this.gcd = div('slot-gcd', this.el);
    this.flash = div('slot-flash', this.el);
    div('slot-frame', this.el);
    this.cdText = div('slot-cdtext', this.el);
    h('div', 'slot-key', this.el, bind);
    this.charges = div('slot-charges', this.el);
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
      pulse(this.flash, 'go');
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
    const count = G.character?.material(c.id) ?? 0;
    return `<div class="sk"><div class="sk-head"><div><div class="sk-name">${esc(m?.name ?? c.id)}</div><div class="sk-tags">Tüketilebilir · Elindeki: ${fmtNum(count)}</div></div></div><div class="sk-desc">${esc(m?.desc ?? '')}</div><div class="sk-key">Tuş: <b>${esc(this.bind)}</b></div></div>`;
  }

  /** Refresh icon, cooldown sweeps, GCD, charges and resource tint for the current content. */
  update(ctx: HudCtx, c: BarContent | null): void {
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
      count = ctx.character?.material(c.id) ?? 0;
      const s = p?.statuses.get('potion_cd');
      if (s) {
        rem = s.remaining;
        total = s.duration;
      }
    }
    setClass(this.el, 'noskill', !c || (c.k === 'skill' && !def));
    setClass(this.el, 'empty', c?.k === 'mat' && count <= 0);
    setClass(this.charges, 'zero', c?.k === 'mat' && count <= 0);
    if (c?.k === 'mat') {
      setText(this.charges, String(count));
      setDisplay(this.charges, true);
    } else {
      setText(this.charges, maxCharges > 1 ? String(charges) : '');
      setDisplay(this.charges, maxCharges > 1);
    }

    const onCd = rem > 0.05 && total > 0;
    // charge skills only dim while no charge is left
    const lockedByCd = onCd && (maxCharges <= 1 || charges <= 0);
    if (lockedByCd) {
      setStyle(this.cd, '--e', String(Math.round((1 - Math.min(1, rem / total)) * 100)));
      setDisplay(this.cd, true, 'block');
      setText(this.cdText, fmtCd(rem));
      setDisplay(this.cdText, true, 'flex');
    } else {
      setDisplay(this.cdText, false);
      setDisplay(this.cd, onCd, 'block');
      if (onCd) setStyle(this.cd, '--e', String(Math.round((1 - Math.min(1, rem / total)) * 100)));
    }
    if (this.prevCd > 0.05 && rem <= 0.05 && c?.k === 'skill') pulse(this.el, 'ready');
    this.prevCd = rem;

    let gcdOn = false;
    if (c?.k === 'skill' && def && p && G.skills) {
      const g = G.skills.getGcd(p);
      if (g.remaining > 0.02 && g.total > 0 && rem <= g.remaining + 0.02) {
        setStyle(this.gcd, '--e', String(Math.round((1 - Math.min(1, g.remaining / g.total)) * 100)));
        gcdOn = true;
      }
    }
    setDisplay(this.gcd, gcdOn, 'block');
    setClass(this.el, 'nores', noRes);
    setClass(this.el, 'casting', casting);
    setClass(this.el, 'oncd', lockedByCd);
    setClass(this.el, 'failing', ctx.now < this.failUntil);
  }
}

class XBar {
  readonly el: HTMLElement;
  readonly frame: EditFrame;
  readonly cells: XCell[] = [];
  content: (BarContent | null)[] = emptyContent();
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
    lockBtn.title = 'Çubukları kilitle / kilidi aç';
    this.lockIco = iconEl(ICON('ui-unlock'), 'xbar-lico', lockBtn);
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      owner.toggleLock();
    });
    const row = div('xbar-row', this.el);
    for (let i = 0; i < SLOTS; i++) {
      const cell = new XCell(i, (def.mod === 'shift' ? 'S+' : 'C+') + (i + 1), ui);
      row.appendChild(cell.el);
      this.cells.push(cell);
      owner.bindCell(this, cell);
    }
    this.frame = { id: def.id, name: def.name, el: this.el };
  }

  setContent(i: number, c: BarContent | null): void {
    this.content[i] = c;
    this.owner.save();
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

/** Owns the two extra bars: slots, drag & drop, casting, keybinds and per-character persistence. */
export class ExtraBars {
  private readonly bars: XBar[];
  private loadedFor: string | null | undefined = undefined;
  private lastFail = { frame: -1, reason: '' };

  constructor(private readonly ui: UI) {
    this.bars = EXTRA_BARS.map((d) => new XBar(d, this, ui));
    G.events.on('skill:fail', ({ reason }) => {
      this.lastFail = { frame: G.engine.frame, reason };
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener(
      'pointerdown',
      (e) => {
        for (const b of this.bars) if (b.picker && !b.picker.contains(e.target as Node)) b.closePicker();
      },
      true,
    );
    // a pointer release ends a drag; the drop handlers (bubble phase) have run by the time this timer fires
    window.addEventListener(
      'pointerup',
      () => {
        setTimeout(() => {
          pendingMove = null;
        }, 0);
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
    const cid = ctx.character?.save.id ?? null;
    if (cid !== this.loadedFor) {
      this.loadedFor = cid;
      this.loadAll(cid);
    }
    const l = readLayout();
    for (const b of this.bars) {
      const shown = l.bars[b.def.id] === true;
      setDisplay(b.el, shown, 'flex');
      if (!shown) continue;
      b.setLocked(l.locked);
      for (let i = 0; i < SLOTS; i++) b.cells[i].update(ctx, b.content[i]);
    }
  }

  /** Persist the slot contents of the current character. */
  save(): void {
    const cid = this.loadedFor;
    if (!cid) return;
    const data: Record<string, (BarContent | null)[]> = {};
    for (const b of this.bars) data[b.def.id] = b.content;
    try {
      localStorage.setItem(KEY_PREFIX + cid, JSON.stringify({ v: 1, bars: data }));
    } catch {
      /* blocked: the bars still work for this session */
    }
  }

  toggleLock(): void {
    const l = readLayout();
    const locked = !l.locked;
    writeLayout({ ...l, locked });
    this.ui.toast(locked ? 'Çubuklar kilitlendi.' : 'Çubukların kilidi açıldı.', 'info');
  }

  /** Wire one slot as a drop zone (skills, consumables) and as a drag source (moves a skill, click casts). */
  bindCell(bar: XBar, cell: XCell): void {
    const i = cell.idx;
    drag.zone(cell.el, {
      accepts: (p) => this.accepts(bar, i, p),
      drop: (p) => this.drop(bar, i, p),
    });
    drag.bindSource(cell.el, {
      payload: () => {
        const c = bar.content[i];
        if (!c || c.k !== 'skill' || this.isLocked()) return null;
        pendingMove = { bar, idx: i };
        return { kind: 'skill', skillId: c.id };
      },
      onClick: () => this.activate(bar, i),
      onContext: (e) => this.onContext(bar, i, e),
    });
  }

  private isLocked(): boolean {
    return readLayout().locked === true;
  }

  private accepts(bar: XBar, i: number, p: DragPayload): boolean {
    if (this.isLocked() && bar.content[i]) return false;
    if (p.kind === 'skill') {
      const d = G.skills?.getDef(p.skillId);
      return !!d && (G.character?.level ?? 0) >= d.unlockLevel;
    }
    if (p.kind === 'item') {
      const m = MATERIALS[p.item.baseId];
      return !!m && m.kind === 'consumable';
    }
    return false;
  }

  private drop(bar: XBar, i: number, p: DragPayload): boolean {
    if (!this.accepts(bar, i, p)) return false;
    if (p.kind === 'skill') {
      const src = pendingMove;
      pendingMove = null;
      bar.setContent(i, { k: 'skill', id: p.skillId });
      if (src && !(src.bar === bar && src.idx === i)) src.bar.setContent(src.idx, null);
      return true;
    }
    if (p.kind === 'item') {
      bar.setContent(i, { k: 'mat', id: p.item.baseId });
      return true;
    }
    return false;
  }

  private onContext(bar: XBar, i: number, e: MouseEvent): void {
    e.preventDefault();
    if (bar.content[i]) {
      if (this.isLocked()) {
        this.ui.toast('Çubuklar kilitli. Kilidi açmak için kilit simgesine tıkla.', 'info');
        return;
      }
      bar.setContent(i, null);
      return;
    }
    this.openPicker(bar, i);
  }

  /** Small list of the consumables in the pouch; picking one fills the empty slot. */
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
        bar.setContent(i, { k: 'mat', id: m.id });
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
    const c = bar.content[idx];
    const cell = bar.cells[idx];
    if (!c) {
      cell.setFlash('fail');
      return;
    }
    if (c.k === 'skill') this.castSkill(c.id, cell);
    else this.useMaterial(c.id, cell);
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
    const reason = this.lastFail.frame === G.engine.frame ? this.lastFail.reason : '';
    this.ui.toast(FAIL_TEXT[reason] ?? 'Şu an kullanılamaz', 'warning');
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

  private useMaterial(id: string, cell: XCell): void {
    const m = MATERIALS[id];
    const ch = G.character;
    if (!m || !ch) return;
    if (m.potion) {
      // usePotion toasts its own failures (cooldown, none left)
      const ok = G.combat?.usePotion(m.potion.kind) ?? false;
      cell.setFlash(ok ? 'press' : 'fail');
      return;
    }
    const r = ch.useConsumable(id);
    if (r.ok) {
      cell.setFlash('press');
      return;
    }
    cell.setFlash('fail');
    if (r.reason) this.ui.toast(r.reason, 'warning');
  }

  private loadAll(cid: string | null): void {
    for (const b of this.bars) b.content = emptyContent();
    if (!cid) return;
    try {
      const raw = localStorage.getItem(KEY_PREFIX + cid);
      if (!raw) return;
      const data = JSON.parse(raw) as { bars?: Record<string, unknown> } | null;
      for (const b of this.bars) {
        const arr = data?.bars?.[b.def.id];
        if (!Array.isArray(arr)) continue;
        for (let i = 0; i < SLOTS; i++) b.content[i] = sanitizeContent(arr[i]);
      }
    } catch {
      /* corrupt or blocked: empty bars */
    }
  }
}
