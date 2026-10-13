import type { Actor } from '../../entities/Actor';
import type { ActiveStatus } from '../../combat/StatusEffects';
import { G } from '../../game/G';
import type { UI } from '../UI';
import { div, esc, fmtCd, iconEl, setClass, setText } from './dom';
import { isStatusHidden, statusView, type StatusView } from './status';
import { statusTooltipHTML } from './tooltips';

interface Item {
  id: string;
  el: HTMLElement;
  ico: HTMLElement;
  stack: HTMLElement;
  time: HTMLElement;
  view: StatusView;
  rem: number;
  stacks: number;
  seen: number;
}

/** Below this share of its duration a status is in its refresh window (CW-16: own debuffs pulse, timer turns gold). */
export const REFRESH_FRAC = 0.3;
/** UI_REDESIGN §2.7: the remaining time is written on the icon only under this many seconds. */
export const TIMER_SHOW_SEC = 60;
/** Typed debuff frame (§2.7 `--deb-*`): the debuff's school picks the border; anything else is the plain red frame. */
const DEBUFF_TYPE: Record<string, string> = {
  curse: 'curse', venom: 'poison', poison: 'poison', bleed: 'disease',
  burn: 'magic', chill: 'magic', freeze: 'magic', shock: 'magic', slow: 'magic',
};

/** Target aura rows (CW-16): `own` = the local player's debuffs only, `others` = everything else (other debuffs, enemy buffs). */
export type AuraScope = 'own' | 'others';

/**
 * A reconciled row of status icons (buffs/debuffs) for an actor with stack counts, durations and tooltips.
 * `aura` (target frame, CW-16): own debuffs (sourceId = local player) sort first and get class `own`, other debuffs get `other`
 * (dimmed), timers take threshold colours (`tm-warn` in the refresh window, `tm-crit` under 3 s) and own debuffs in the
 * refresh window get class `refresh` (pulse). Without `aura` the row sorts soonest-expiring first, permanent last (§2.7).
 * Beyond `max` icons a `+N` chip lists the rest on hover.
 */
export class StatusRow {
  readonly el: HTMLElement;
  private items = new Map<string, Item>();
  private frame = 0;
  private more: HTMLElement | null = null;
  private moreNames = '';

  constructor(
    private ui: UI,
    private filter: 'buff' | 'debuff' | 'all',
    private max: number,
    cls = '',
    private showTime = true,
    private aura = false,
    private scope?: AuraScope,
  ) {
    this.el = div('status-row ' + cls);
  }

  update(actor: Actor | null): void {
    this.frame++;
    let extra: string[] = [];
    if (actor) {
      let shown = 0;
      const me = G.player?.id;
      const list = actor.statuses.list().filter((s) => !isStatusHidden(s.id));
      list.sort((a, b) => {
        if (this.aura) {
          const oa = this.isOwnDebuff(a, me) ? 1 : 0;
          const ob = this.isOwnDebuff(b, me) ? 1 : 0;
          if (oa !== ob) return ob - oa;
        }
        const la = a.duration >= 9000 ? Infinity : a.remaining;
        const lb = b.duration >= 9000 ? Infinity : b.remaining;
        if (la === lb) return 0;
        // aura rows: longest first; other rows: soonest first, permanent last
        if (this.aura) return la > lb ? -1 : 1;
        return la < lb ? -1 : 1;
      });
      for (const s of list) {
        const view = statusView(s.id);
        if (this.filter !== 'all' && view.kind !== this.filter) continue;
        const own = this.isOwnDebuff(s, me);
        if (this.scope === 'own' && !own) continue;
        if (this.scope === 'others' && own) continue;
        if (shown >= this.max) {
          extra.push(view.name);
          continue;
        }
        shown++;
        let it = this.items.get(s.id);
        if (!it) {
          it = this.create(s.id, view);
          this.items.set(s.id, it);
          this.el.appendChild(it.el);
        }
        it.seen = this.frame;
        // rows keep the sorted order on screen (icons that already exist move too)
        if (this.el.children[shown - 1] !== it.el) this.el.insertBefore(it.el, this.el.children[shown - 1] ?? null);
        it.rem = s.duration >= 9000 ? Infinity : s.remaining;
        it.stacks = s.stacks;
        setText(it.stack, s.stacks > 1 ? String(s.stacks) : '');
        if (this.showTime) {
          setText(it.time, it.rem !== Infinity && it.rem < TIMER_SHOW_SEC ? fmtCd(it.rem) : '');
          setClass(it.el, 'expiring', it.rem < 3);
        }
        if (view.kind === 'debuff') {
          const deb = DEBUFF_TYPE[s.id] ?? 'none';
          if (it.el.dataset.deb !== deb) it.el.dataset.deb = deb;
        }
        if (this.aura) this.paintAura(it, s, view.kind === 'debuff', me);
      }
    }
    for (const [id, it] of this.items) {
      if (it.seen !== this.frame) {
        it.el.remove();
        this.items.delete(id);
        if (this.ui) this.ui.hideTooltipIf(it.el);
      }
    }
    this.updateMore(extra);
  }

  /** The `+N` chip: present only while icons are hidden by `max`; always the last child of the row. */
  private updateMore(extra: string[]): void {
    if (extra.length === 0) {
      if (this.more) {
        this.more.remove();
        this.more = null;
      }
      return;
    }
    if (!this.more) {
      const chip = div('st-more hud-interactive');
      this.more = chip;
      chip.addEventListener('mouseenter', (e) => {
        if (this.ui) this.ui.showTooltipFor(chip, `<div class="st"><div class="st-name">Diğer</div><div class="st-kind">${esc(this.moreNames)}</div></div>`, e.clientX, e.clientY);
      });
      chip.addEventListener('mouseleave', () => {
        if (this.ui) this.ui.hideTooltipIf(chip);
      });
    }
    this.moreNames = extra.join(', ');
    setText(this.more, `+${extra.length}`);
    if (this.more.parentNode !== this.el || this.el.lastElementChild !== this.more) this.el.appendChild(this.more);
  }

  private isOwnDebuff(s: ActiveStatus, me: number | undefined): boolean {
    return me !== undefined && s.sourceId === me && statusView(s.id).kind === 'debuff';
  }

  /** CW-16 aura styling: own / other classes, refresh pulse for own debuffs, timer colours by threshold. */
  private paintAura(it: Item, s: ActiveStatus, isDebuff: boolean, me: number | undefined): void {
    const own = isDebuff && this.isOwnDebuff(s, me);
    setClass(it.el, 'own', own);
    setClass(it.el, 'other', isDebuff && !own);
    const permanent = s.duration >= 9000;
    const frac = permanent || s.duration <= 0 ? 1 : s.remaining / s.duration;
    const refresh = !permanent && frac < REFRESH_FRAC;
    setClass(it.el, 'refresh', own && refresh);
    setClass(it.time, 'tm-crit', !permanent && it.rem < 3);
    setClass(it.time, 'tm-warn', !permanent && it.rem >= 3 && refresh);
  }

  private create(id: string, view: StatusView): Item {
    const el = div('st-icon ' + view.kind);
    const ico = iconEl(view.icon, 'st-ico', el);
    const stack = div('st-stack', el);
    const time = div('st-time', el);
    const it: Item = { id, el, ico, stack, time, view, rem: 0, stacks: 1, seen: 0 };
    el.classList.add('hud-interactive');
    const show = (e: MouseEvent) => this.ui.showTooltipFor(el, statusTooltipHTML(it.view, it.rem === Infinity ? 0 : it.rem, it.stacks), e.clientX, e.clientY);
    el.addEventListener('mouseenter', show);
    el.addEventListener('mousemove', show);
    el.addEventListener('mouseleave', () => this.ui.hideTooltipIf(el));
    return it;
  }

  clear(): void {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
    if (this.more) {
      this.more.remove();
      this.more = null;
    }
  }
}
