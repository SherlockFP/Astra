import { G } from '../../game/G';
import { div, setDisplay, setText, uiSound } from '../widgets/dom';

/** Diff period (4 Hz, never per frame). */
const TICK_MS = 250;
/** Lifetime of one feed line. */
const LIFE_MS = 2200;
/** Lines on screen at once. */
const MAX_LINES = 3;

/**
 * Centre quest feed (UI_REDESIGN §2.9 / §4.9): `Orman Kurdu: 3 / 8` for every step of a kill / collect objective, a green
 * `✓` line when an objective completes (ui_confirm 0.4), and a one-shot `Görev tamamlandı — teslim et: …` line when a quest
 * becomes ready. It diffs QuestSystem.progressRows() of the active quests, so it needs no per-frame hook of its own.
 * OWNER: hud module.
 */
export class QuestFeed {
  readonly el: HTMLElement;
  /** Last `have` / `done` per quest row, keyed `questId#rowIndex`. */
  private prev = new Map<string, { have: number; done: boolean }>();
  private readySeen = new Set<string>();

  constructor() {
    this.el = div('quest-feed');
    setDisplay(this.el, false);
    G.events.on('quest:updated', ({ questId, state }) => {
      if (state !== 'ready' || this.readySeen.has(questId)) return;
      this.readySeen.add(questId);
      const name = G.quests?.def(questId)?.name ?? questId;
      this.line(`Görev tamamlandı — teslim et: ${name}`, 'ready');
    });
    setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const q = G.quests;
    if (!q || !G.character) {
      this.prev.clear();
      return;
    }
    let act: ReturnType<typeof q.active>;
    try {
      act = q.active();
    } catch {
      return;
    }
    const seen = new Set<string>();
    for (const d of act) {
      q.progressRows(d.id).forEach((r, i) => {
        const key = `${d.id}#${i}`;
        seen.add(key);
        const before = this.prev.get(key);
        this.prev.set(key, { have: r.have, done: r.done });
        // the first sight of a row (quest just accepted or the feed just started) is not a step
        if (!before) return;
        if (r.done && !before.done) {
          this.line(`✓ ${r.text}`, 'done');
          uiSound('ui_confirm', 0.4);
        } else if (!r.done && r.have > before.have) {
          this.line(`${r.text}: ${Math.min(r.have, r.need)} / ${r.need}`, '');
        }
      });
    }
    for (const k of Array.from(this.prev.keys())) if (!seen.has(k)) this.prev.delete(k);
  }

  private line(text: string, kind: string): void {
    const l = div('qf-line' + (kind ? ' ' + kind : ''), this.el);
    setText(l, text);
    while (this.el.childElementCount > MAX_LINES) this.el.firstElementChild?.remove();
    setDisplay(this.el, true);
    setTimeout(() => {
      l.remove();
      if (this.el.childElementCount === 0) setDisplay(this.el, false);
    }, LIFE_MS);
  }
}
