import type { Actor } from '../../entities/Actor';
import type { UI } from '../UI';
import { div, fmtCd, iconEl, setClass, setText } from './dom';
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

/** A reconciled row of status icons (buffs/debuffs) for an actor with stack counts, durations and tooltips. */
export class StatusRow {
  readonly el: HTMLElement;
  private items = new Map<string, Item>();
  private frame = 0;

  constructor(
    private ui: UI,
    private filter: 'buff' | 'debuff' | 'all',
    private max: number,
    cls = '',
    private showTime = true,
  ) {
    this.el = div('status-row ' + cls);
  }

  update(actor: Actor | null): void {
    this.frame++;
    if (actor) {
      let shown = 0;
      const list = actor.statuses.list().filter((s) => !isStatusHidden(s.id));
      // longest first, permanent first
      list.sort((a, b) => (b.duration >= 9000 ? 1e9 : b.remaining) - (a.duration >= 9000 ? 1e9 : a.remaining));
      for (const s of list) {
        const view = statusView(s.id);
        if (this.filter !== 'all' && view.kind !== this.filter) continue;
        if (shown >= this.max) break;
        shown++;
        let it = this.items.get(s.id);
        if (!it) {
          it = this.create(s.id, view);
          this.items.set(s.id, it);
          this.el.appendChild(it.el);
        }
        it.seen = this.frame;
        it.rem = s.duration >= 9000 ? Infinity : s.remaining;
        it.stacks = s.stacks;
        setText(it.stack, s.stacks > 1 ? String(s.stacks) : '');
        if (this.showTime) {
          if (it.rem === Infinity) setText(it.time, '');
          else setText(it.time, fmtCd(it.rem));
          setClass(it.el, 'expiring', it.rem < 3);
        }
      }
    }
    for (const [id, it] of this.items) {
      if (it.seen !== this.frame) {
        it.el.remove();
        this.items.delete(id);
        if (this.ui) this.ui.hideTooltipIf(it.el);
      }
    }
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
  }
}

