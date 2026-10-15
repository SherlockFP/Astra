import '../styles/hud-quests.css';
import { G } from '../../game/G';
import { div, pulse, setClass, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import { focusObjective, focusedObjective, getPinnedQuest } from './questMarks';

/**
 * Quest pane of the context tracker (GDD_OPENWORLD §6.1, UI_REDESIGN §2.9): the pinned active quest (or the first active
 * one) with up to three open objectives, each with a count and a 6 px bar. A rising count flashes the row and steps the
 * bar (200 ms, steps(6)). Click opens the quest log. Reads G.quests only; never throws.
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
  /** `have` of each shown row at the last rebuild (flash + bar step on a rise). */
  private lastHave: number[] = [];
  private lastQuest = '';

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
      } catch (err) {
        console.warn("[hud] quest log not open yet", err);
      }
    });
    G.events.on('quest:updated', () => {
      this.dirty = true;
    });
    // a tracker click pins the quest it focuses (setPinnedQuest), which also marks the focused row
    G.events.on('quest:pinned', () => {
      this.dirty = true;
    });
    G.events.on('scene:leaving', () => {
      this.sig = '';
      this.lastHave = [];
      setClass(this.el, 'on', false);
    });
  }

  /** True while a quest is on screen (the context tracker's `quest` mode). */
  get shown(): boolean {
    return this.el.classList.contains('on');
  }

  reset(): void {
    this.sig = '';
    this.lastHave = [];
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
    const fo = focusedObjective();
    const fk = fo && fo.questId === def.id ? fo.k : -1;
    const sig = [def.id, state, act.length, fk, ...rows.map((r) => `${r.have}/${r.need}`)].join('|');
    setClass(this.el, 'on', true);
    if (sig === this.sig) return;
    this.sig = sig;

    setText(this.head, state === 'ready' ? `${def.name} · Teslim et` : def.name);
    const sameQuest = def.id === this.lastQuest;
    const prev = sameQuest ? this.lastHave : [];
    this.lastQuest = def.id;
    this.lastHave = [];
    this.list.textContent = '';
    // open objectives first; a finished one stays in the list (green, struck through) while there is room for it
    const shown = rows.map((r, k) => ({ r, k })).sort((a, b) => Number(a.r.done) - Number(b.r.done)).slice(0, 3);
    for (const { r, k } of shown) {
      const row = div('qt-row' + (r.done ? ' done' : '') + (k === fk ? ' focus' : ''), this.list);
      // click: the arrow and the pinned quest go to this objective (the quest log stays shut)
      row.title = 'Hedefe odaklan';
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!(fo && fo.questId === def.id && fo.k === k)) focusObjective(def.id, k);
      });
      const line = div('qt-line', row);
      const t = div('', line);
      setText(t, r.text);
      const n = div('', line);
      setText(n, `${Math.min(r.have, r.need)}/${r.need}`);
      const bar = div('qt-bar', row);
      const fill = div('qt-fill', bar);
      const to = r.need > 0 ? Math.min(1, r.have / r.need) * 100 : 0;
      fill.style.setProperty('--to', `${to.toFixed(1)}%`);
      fill.style.width = `${to.toFixed(1)}%`;
      const before = prev[k];
      if (before !== undefined && r.have > before) {
        const from = r.need > 0 ? Math.min(1, before / r.need) * 100 : 0;
        fill.style.setProperty('--from', `${from.toFixed(1)}%`);
        fill.classList.add('grow');
        pulse(row, 'flash');
      }
      // the objective completes on this rebuild: the X/Y count pops (green, scaled up once)
      if (before !== undefined && r.done && before < r.need) pulse(n, 'pop');
      this.lastHave[k] = r.have;
    }
    const extra = act.length - 1;
    setText(this.more, extra > 0 ? `+${extra} görev daha` : '');
    this.more.style.display = extra > 0 ? '' : 'none';
  }
}
