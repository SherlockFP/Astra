import '../styles/hud-quests.css';
import { G } from '../../game/G';
import { div, setClass, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import { getPinnedQuest } from './questMarks';

/**
 * Quest tracker (GDD_OPENWORLD §6.1): the pinned active quest (or the first active one) with up to three open objectives.
 * Click opens the quest log. Under the minimap in the top-right column. Reads G.quests only; never throws.
 * OWNER: hud module.
 */
export class QuestTracker implements HudWidget {
  readonly el: HTMLElement;
  private head: HTMLElement;
  private list: HTMLElement;
  private more: HTMLElement;
  private sig = '';
  private acc = 0;
  private dirty = true;

  constructor() {
    // ui-capture: the click opens the quest log and must not also reach the game as an attack (Input checks the class)
    this.el = div('qt ui-capture');
    this.head = div('qt-head', this.el);
    this.list = div('qt-list', this.el);
    this.more = div('qt-more', this.el);
    this.el.title = 'Görev günlüğü (Görevler paneli)';
    this.el.addEventListener('click', () => {
      try {
        G.ui.openPanel('questlog');
      } catch {
        /* ui not ready */
      }
    });
    G.events.on('quest:updated', () => {
      this.dirty = true;
    });
    G.events.on('scene:leaving', () => {
      this.sig = '';
      setClass(this.el, 'on', false);
    });
  }

  reset(): void {
    this.sig = '';
    setClass(this.el, 'on', false);
  }

  update(ctx: HudCtx): void {
    this.acc += ctx.dt;
    if (!this.dirty && this.acc < 0.3) return;
    this.acc = 0;
    this.dirty = false;
    const q = G.quests;
    const inGame = ctx.mode === 'town' || ctx.mode === 'dungeon';
    if (!inGame || !q || !G.character) {
      setClass(this.el, 'on', false);
      return;
    }
    let act: ReturnType<typeof q.active>;
    try {
      act = q.active();
    } catch {
      setClass(this.el, 'on', false);
      return;
    }
    if (!act.length) {
      setClass(this.el, 'on', false);
      this.sig = '';
      return;
    }
    const pinned = getPinnedQuest();
    const def = act.find((d) => d.id === pinned) ?? act[0];
    const state = q.state(def.id);
    const rows = q.progressRows(def.id);
    const sig = [def.id, state, act.length, ...rows.map((r) => `${r.have}/${r.need}`)].join('|');
    setClass(this.el, 'on', true);
    if (sig === this.sig) return;
    this.sig = sig;

    setText(this.head, state === 'ready' ? `${def.name} · Teslim et` : def.name);
    this.list.textContent = '';
    const open = rows.filter((r) => !r.done);
    for (const r of (open.length ? open : rows).slice(0, 3)) {
      const line = div('qt-row' + (r.done ? ' done' : ''), this.list);
      const t = div('', line);
      setText(t, r.text);
      const n = div('', line);
      setText(n, `${Math.min(r.have, r.need)}/${r.need}`);
    }
    const extra = act.length - 1;
    setText(this.more, extra > 0 ? `+${extra} görev daha` : '');
    this.more.style.display = extra > 0 ? '' : 'none';
  }
}
