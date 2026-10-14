import { G } from '../../game/G';
import { QUEUE_TIMING } from '../../net/queue/QueueCore';
import type { QueueState } from '../../types/finder';
import { ARENA_TR, clockText, estimatedWaitSec } from '../panels/game/arenaShared';
import { div, setDisplay, setText, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import '../styles/arena.css';

/**
 * Arena queue bar (GDD_PVP_FINDER §5.3): a small ElvUI strip under the minimap with the elapsed time, the rating window, the estimated
 * wait and the cancel button. Shown while the local arena queue is searching or handshaking; hidden in idle and during the match.
 * Reads `G.net.queue.state()` four times a second. Owner of the state is net/queue (QueueService); this widget only shows it.
 */
export class QueueBar implements HudWidget {
  readonly el: HTMLElement;
  private titleEl: HTMLElement;
  private timeEl: HTMLElement;
  private stateEl: HTMLElement;
  private waitEl: HTMLElement;
  private cancelBtn: HTMLButtonElement;
  private acc = 0;

  constructor() {
    this.el = div('aq-bar');
    const top = div('aq-top', this.el);
    this.titleEl = div('aq-title', top);
    this.timeEl = div('aq-time', top);
    this.stateEl = div('aq-state', this.el);
    const row = div('aq-row', this.el);
    this.waitEl = div('aq-wait', row);
    this.cancelBtn = document.createElement('button');
    this.cancelBtn.className = 'aq-cancel';
    this.cancelBtn.type = 'button';
    this.cancelBtn.textContent = ARENA_TR.cancelQueue;
    this.cancelBtn.addEventListener('click', () => {
      uiSound('ui_click', 0.6);
      G.net?.queue?.cancel();
    });
    row.appendChild(this.cancelBtn);
    setDisplay(this.el, false);
  }

  update(ctx: HudCtx): void {
    this.acc += ctx.dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const q = G.net?.queue;
    const st: QueueState | null = q ? q.state() : null;
    const active = !!st && (st.phase === 'searching' || st.phase === 'proposed' || st.phase === 'joining');
    if (!st || !active) {
      setDisplay(this.el, false);
      return;
    }
    setDisplay(this.el, true);
    const b = st.key?.startsWith('arena:') ? (st.key.split(':')[1] as '1v1' | '2v2' | '3v3') : '2v2';
    const elapsed = st.since ? (ctx.now - st.since) / 1000 : 0;
    setText(this.titleEl, ARENA_TR.inQueue);
    setText(this.timeEl, clockText(elapsed));
    if (st.phase === 'joining') setText(this.stateEl, ARENA_TR.found);
    else if (st.phase === 'proposed') setText(this.stateEl, ARENA_TR.proposed);
    else setText(this.stateEl, st.window ? `${ARENA_TR.searching} · ${ARENA_TR.range}: ${st.window[0]}–${st.window[1]}` : ARENA_TR.searching);
    setText(this.waitEl, `${ARENA_TR.estWait}: ~${estimatedWaitSec(b, st.pool)} sn`);
  }

  reset(): void {
    this.acc = 0;
  }
}

/**
 * Match-found popup (GDD_PVP_FINDER §5.3 / §2.9.4): appears when the local peer is in a handshake (`joining`) and shows the countdown to
 * the join deadline (QUEUE_TIMING.joinMs). Kabul hides it (the handshake goes on); Reddet cancels the queue through `G.net.queue.cancel()`.
 * The core acknowledges a proposal on its own when it arrives, so Kabul is a local acknowledgement, not a second protocol step.
 */
export class MatchFoundPopup implements HudWidget {
  readonly el: HTMLElement;
  private timeEl: HTMLElement;
  private fillEl: HTMLElement;
  private mid = '';
  private accepted = '';
  private started = 0;

  constructor() {
    this.el = div('aq-found');
    div('aq-found-title', this.el).textContent = ARENA_TR.matchFoundTitle;
    div('aq-found-text', this.el).textContent = ARENA_TR.matchFoundText;
    const bar = div('aq-found-bar', this.el);
    this.fillEl = div('aq-found-fill', bar);
    this.timeEl = div('aq-found-time', this.el);
    const row = div('aq-found-row', this.el);
    const accept = document.createElement('button');
    accept.className = 'aq-found-btn aq-found-accept';
    accept.type = 'button';
    accept.textContent = ARENA_TR.matchFoundAccept;
    accept.addEventListener('click', () => {
      this.accepted = this.mid;
      uiSound('ui_click', 0.7);
    });
    const decline = document.createElement('button');
    decline.className = 'aq-found-btn aq-found-decline';
    decline.type = 'button';
    decline.textContent = ARENA_TR.matchFoundDecline;
    decline.addEventListener('click', () => {
      uiSound('ui_error', 0.6);
      G.net?.queue?.cancel();
    });
    row.append(accept, decline);
    setDisplay(this.el, false);
  }

  update(ctx: HudCtx): void {
    const st = G.net?.queue?.state();
    if (!st || st.phase !== 'joining' || !st.mid || st.mid === this.accepted) {
      setDisplay(this.el, false);
      return;
    }
    if (st.mid !== this.mid) {
      this.mid = st.mid;
      this.started = ctx.now;
      uiSound('ready_check', 0.8);
    }
    const total = QUEUE_TIMING.joinMs / 1000;
    const left = Math.max(0, total - (ctx.now - this.started) / 1000);
    setDisplay(this.el, true);
    setText(this.timeEl, ARENA_TR.secLeft(Math.ceil(left)));
    this.fillEl.style.width = `${Math.round((left / total) * 100)}%`;
  }
}
