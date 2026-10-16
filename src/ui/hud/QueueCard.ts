import { div, esc, fmtClock, setClass, setDisplay, setText, uiSound } from '../widgets/dom';
import { dungeonQueue, QUEUE_ESTIMATE_SEC, type DungeonQueueView } from '../../systems/DungeonQueue';
import type { HudCtx, HudWidget } from './types';

/**
 * Dungeon queue card (Zindan Bulucu), top centre, small (ElvUI style). Two rows, one shown at a time:
 * - search: "Sırada: Sisli Mağara · Hasar · süre 0:23 · tahmini 1:00" and [Ayrıl];
 * - ready:  "Zindan hazır!" with the countdown and [Gir] [Reddet] (the solo card lasts 3 s, then the run starts by itself).
 * The state lives in systems/DungeonQueue.ts; this widget only draws it. OWNER: hud module.
 */
export class QueueCard implements HudWidget {
  readonly el: HTMLElement;
  private searchRow: HTMLElement;
  private readyRow: HTMLElement;
  private infoEl: HTMLElement;
  private timeEl: HTMLElement;
  private countEl: HTMLElement;
  private lastPhase = '';
  private lastInfo = '';
  private lastTime = '';
  private lastCount = '';
  private view: DungeonQueueView;

  constructor() {
    this.view = dungeonQueue.state;
    this.el = div('hud-queue');
    this.searchRow = div('qc-row qc-search', this.el);
    this.infoEl = div('qc-info', this.searchRow);
    this.timeEl = div('qc-time', this.searchRow);
    this.addBtn(this.searchRow, 'Ayrıl', 'leave');

    this.readyRow = div('qc-row qc-ready', this.el);
    div('qc-title', this.readyRow, 'Zindan hazır!');
    this.countEl = div('qc-count', this.readyRow);
    this.addBtn(this.readyRow, 'Gir', 'accept', true);
    this.addBtn(this.readyRow, 'Reddet', 'decline');

    dungeonQueue.subscribe(() => {
      this.view = dungeonQueue.state;
      this.render();
    });
    this.render();
  }

  private addBtn(parent: HTMLElement, label: string, act: 'leave' | 'accept' | 'decline', primary = false): void {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `qc-btn${primary ? ' primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', () => {
      uiSound('ui_click', 0.6);
      if (act === 'leave') dungeonQueue.leave();
      else if (act === 'accept') dungeonQueue.accept();
      else dungeonQueue.decline();
    });
    parent.appendChild(b);
  }

  update(_ctx: HudCtx): void {
    this.view = dungeonQueue.state;
    this.render();
  }

  reset(): void {
    this.render();
  }

  private render(): void {
    const v = this.view;
    const phase = v.phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      setDisplay(this.el, phase !== 'idle', 'flex');
      setDisplay(this.searchRow, phase === 'searching', 'flex');
      setDisplay(this.readyRow, phase === 'ready', 'flex');
      setClass(this.el, 'ready', phase === 'ready');
    }
    if (phase === 'searching' && v.entry) {
      const info = `Sırada: <b>${esc(v.entry.dungeonName)}</b> · ${esc(v.entry.roleLabel)}`;
      if (info !== this.lastInfo) {
        this.lastInfo = info;
        this.infoEl.innerHTML = info;
      }
      const time = `süre ${fmtClock(v.elapsed)} · tahmini ${fmtClock(QUEUE_ESTIMATE_SEC)}`;
      if (time !== this.lastTime) {
        this.lastTime = time;
        setText(this.timeEl, time);
      }
    } else if (phase === 'ready') {
      const count = `${Math.ceil(v.readyLeft)} sn`;
      if (count !== this.lastCount) {
        this.lastCount = count;
        setText(this.countEl, count);
      }
    }
  }
}
