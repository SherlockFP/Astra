import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import { arenaActive, arenaController, type ArenaSnapshot } from '../../scenes/arena/ArenaController';
import { tierOf } from '../../scenes/arena/arenaRules';
import { ARENA_TR, clockText, TIER_TONE } from '../panels/game/arenaShared';
import { classColor } from '../widgets/classColors';
import { div, setDisplay, setText, uiSound } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import '../styles/arena.css';

/** The arena:result payload the HUD keeps for the results card (rating and rewards are not in the snapshot). */
interface ResultInfo {
  won: boolean | null;
  bracket: '1v1' | '2v2' | '3v3';
  ranked: boolean;
  score: [number, number];
  rating: { before: number; after: number; delta: number } | null;
  rewards: { onur: number; fetih: number; muhru: number };
}

/**
 * Arena HUD (GDD_PVP_FINDER §5.5): top centre score bar (round pips, round counter, live timer, dampening), the prep countdown with the
 * gates, enemy team frames (class colour, HP, dead mark; trinket / CC indicators need data the snapshot does not carry, so they are
 * absent) and the results card with W/L, rating change, tier change, Onur / Fetih and the "Arenadan Çık" button.
 * Everything comes from `arenaController()?.snapshot()` (4 Hz) and the `arena:result` event. Hidden when no arena runs.
 */
export class ArenaHud implements HudWidget {
  readonly el: HTMLElement;
  private barEl: HTMLElement;
  private scoreA: HTMLElement;
  private scoreB: HTMLElement;
  private pipsA: HTMLElement[] = [];
  private pipsB: HTMLElement[] = [];
  private roundEl: HTMLElement;
  private timeEl: HTMLElement;
  private dampEl: HTMLElement;
  private prepEl: HTMLElement;
  private prepTxt: HTMLElement;
  private framesEl: HTMLElement;
  private resultEl: HTMLElement;
  private resTitle: HTMLElement;
  private resScore: HTMLElement;
  private resRating: HTMLElement;
  private resRewards: HTMLElement;
  private resExit: HTMLElement;
  private exitBtn: HTMLButtonElement;
  private acc = 0;
  private shown = false;
  private result: ResultInfo | null = null;
  private off: (() => void) | null = null;

  constructor() {
    this.el = div('ah');
    this.barEl = div('ah-bar', this.el);
    const sideA = div('ah-side ah-a', this.barEl);
    this.scoreA = div('ah-score', sideA);
    const pa = div('ah-pips', sideA);
    for (let i = 0; i < 3; i++) this.pipsA.push(div('ah-pip', pa));
    const mid = div('ah-mid', this.barEl);
    this.roundEl = div('ah-round', mid);
    this.timeEl = div('ah-time', mid);
    const sideB = div('ah-side ah-b', this.barEl);
    this.scoreB = div('ah-score', sideB);
    const pb = div('ah-pips', sideB);
    for (let i = 0; i < 3; i++) this.pipsB.push(div('ah-pip', pb));
    this.dampEl = div('ah-damp', this.el);
    this.dampEl.title = ARENA_TR.dampRule;

    this.prepEl = div('ah-prep', this.el);
    this.prepTxt = div('ah-prep-txt', this.prepEl);
    const gates = div('ah-gates', this.prepEl);
    div('ah-gate ah-gate-a', gates).textContent = ARENA_TR.team.A;
    div('ah-gate ah-gate-b', gates).textContent = ARENA_TR.team.B;

    this.framesEl = div('ah-frames', this.el);

    this.resultEl = div('ah-result', this.el);
    this.resTitle = div('ah-res-title', this.resultEl);
    this.resScore = div('ah-res-score', this.resultEl);
    this.resRating = div('ah-res-rating', this.resultEl);
    this.resRewards = div('ah-res-rewards', this.resultEl);
    this.exitBtn = document.createElement('button');
    this.exitBtn.className = 'ah-exit';
    this.exitBtn.type = 'button';
    this.exitBtn.textContent = ARENA_TR.exitBtn;
    this.exitBtn.addEventListener('click', () => {
      uiSound('ui_click', 0.6);
      arenaController()?.exit();
    });
    this.resExit = div('ah-res-exit', this.resultEl);
    this.resultEl.appendChild(this.exitBtn);

    setDisplay(this.el, false);
  }

  private listen(): void {
    if (this.off || !G.events) return;
    this.off = G.events.on('arena:result', (e) => {
      this.result = {
        won: e.won, bracket: e.bracket, ranked: e.ranked, score: e.score, rating: e.rating, rewards: e.rewards,
      };
    });
  }

  update(ctx: HudCtx): void {
    this.listen();
    if (!arenaActive()) {
      if (this.shown) this.hide();
      return;
    }
    this.acc += ctx.dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const ac = arenaController();
    if (!ac) return;
    this.show();
    this.paint(ac.snapshot());
  }

  reset(): void {
    this.acc = 0;
  }

  private show(): void {
    if (this.shown) return;
    this.shown = true;
    setDisplay(this.el, true);
  }

  private hide(): void {
    this.shown = false;
    this.result = null;
    setDisplay(this.el, false);
  }

  private paint(s: ArenaSnapshot): void {
    const enemyTeam = s.myTeam === 'A' ? 'B' : 'A';
    setText(this.scoreA, `${ARENA_TR.team.A} ${s.score[0]}`);
    setText(this.scoreB, `${s.score[1]} ${ARENA_TR.team.B}`);
    this.pipsA.forEach((p, i) => p.classList.toggle('is-on', i < s.score[0]));
    this.pipsB.forEach((p, i) => p.classList.toggle('is-on', i < s.score[1]));
    setText(this.roundEl, ARENA_TR.round(Math.max(1, s.round)));
    const live = s.phase === 'live';
    setText(this.timeEl, live ? clockText(s.left) : s.phase === 'round_end' ? '—' : s.phase === 'prep' ? clockText(s.left) : '');
    const dampOn = s.dampPct > 0;
    setDisplay(this.dampEl, dampOn);
    if (dampOn) setText(this.dampEl, ARENA_TR.damp(Math.round(s.dampPct)));

    setDisplay(this.prepEl, s.phase === 'prep');
    if (s.phase === 'prep') setText(this.prepTxt, ARENA_TR.prep(Math.ceil(s.left)));

    this.paintFrames(s, enemyTeam);

    const done = s.result !== null;
    setDisplay(this.resultEl, done);
    if (done) this.paintResult(s);
  }

  private paintFrames(s: ArenaSnapshot, enemyTeam: 'A' | 'B'): void {
    const world = G.world;
    const fighters = s.fighters.filter((f) => f.team === enemyTeam);
    if (this.framesEl.childElementCount !== fighters.length) this.framesEl.textContent = '';
    fighters.forEach((f, i) => {
      let frame = this.framesEl.children[i] as HTMLElement | undefined;
      if (!frame) {
        frame = div('ah-fr', this.framesEl);
        div('ah-fr-name', frame);
        div('ah-fr-hp', frame).appendChild(div('ah-fr-fill'));
        div('ah-fr-x', frame).textContent = '✕';
      }
      const p = world?.players.find((x) => (x as Player).peerId === f.peer) as Player | undefined;
      const frac = p && p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : f.alive ? 1 : 0;
      const name = frame.children[0] as HTMLElement;
      const hp = frame.children[1] as HTMLElement;
      const fill = hp.firstElementChild as HTMLElement;
      const x = frame.children[2] as HTMLElement;
      setText(name, f.name);
      name.style.color = classColor(p?.classId);
      fill.style.width = `${Math.round(frac * 100)}%`;
      fill.style.background = classColor(p?.classId);
      setDisplay(x, !f.alive, 'flex');
      frame.classList.toggle('is-dead', !f.alive);
      frame.title = f.alive ? f.name : `${f.name} ${ARENA_TR.dead}`;
    });
  }

  private paintResult(s: ArenaSnapshot): void {
    const r = s.result;
    if (!r) return;
    const won = r.won;
    const title = won === null ? ARENA_TR.draw : won ? ARENA_TR.won : ARENA_TR.lost;
    this.resultEl.classList.toggle('is-win', won === true);
    this.resultEl.classList.toggle('is-loss', won === false);
    setText(this.resTitle, title);
    setText(this.resScore, ARENA_TR.score(s.score[0], s.score[1]));
    const info = this.result;
    if (info?.rating) {
      const { before, after, delta } = info.rating;
      const was = tierOf(before);
      const now = tierOf(after);
      const tierLine = was.id !== now.id ? ` · ${ARENA_TR.tierChange(was.name, now.name)}` : '';
      setText(this.resRating, `Puan: ${before} → ${after} (${ARENA_TR.delta(delta)})${tierLine}`);
      this.resRating.style.color = TIER_TONE[now.id] ?? '';
      setDisplay(this.resRating, true);
    } else {
      setDisplay(this.resRating, !!s.ranked);
      setText(this.resRating, s.ranked ? 'Puan değişmedi' : 'Derecesiz maç: puan değişmez');
    }
    if (info) setText(this.resRewards, ARENA_TR.rewards(info.rewards.onur, info.rewards.fetih));
    setText(this.resExit, ARENA_TR.exitIn(Math.max(0, Math.ceil(s.exitIn))));
  }
}
