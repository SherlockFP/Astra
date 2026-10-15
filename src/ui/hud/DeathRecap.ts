import { G } from '../../game/G';
import type { DeathHitEntry, DeathRecap } from '../../types/deathLog';
import { sourceLabel } from '../../combat/deathLog';
import { DAMAGE_COLORS, ICON, div, fmtNum, h, iconEl, setClass, setText, span } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/** Hits listed in the card (the last ones before death). */
const ROWS = 8;

/** "−3,2 sn" for a hit `dt` seconds before the death (dt <= 0). */
function fmtAgo(dt: number): string {
  const v = Math.max(0, -dt);
  return `−${v.toFixed(1).replace('.', ',')} sn`;
}

/**
 * "Ölüm Özeti" block (GDD_V2 §8.5): the last 8 hits taken before the local player died (source, ability, amount, damage type, HP
 * left, an "avoidable" tag), the killing blow and the defensives that were ready. Built from the `death:recap` snapshot Combat
 * publishes; it keeps the last recap until the next death or a scene change. Read only. Any owner can mount `el` (the HUD slot below
 * does). OWNER: hud module.
 */
export class DeathRecapBlock {
  readonly el: HTMLElement;
  private win: HTMLElement;
  private sum: HTMLElement;
  private list: HTMLElement;
  private foot: HTMLElement;
  private recap: DeathRecap | null = null;

  constructor() {
    this.el = div('dr');
    const head = div('dr-head', this.el);
    iconEl(ICON('ui-skull'), 'dr-ico', head);
    div('dr-title', head, 'Ölüm Özeti');
    this.win = div('dr-win', head);
    this.sum = div('dr-sum', this.el);
    this.list = div('dr-list', this.el);
    this.foot = div('dr-foot', this.el);
    G.events.on('death:recap', (r) => this.show(r));
    G.events.on('scene:leaving', () => this.clear());
  }

  /** The recap of a death: render it (Combat emits `death:recap` once per local death). */
  show(r: DeathRecap): void {
    this.recap = r;
    this.render(r);
  }

  /** Drop the recap (scene change). */
  clear(): void {
    this.recap = null;
  }

  get hasRecap(): boolean {
    return this.recap !== null;
  }

  private render(r: DeathRecap): void {
    setText(this.win, `Son ${r.windowSec} sn`);

    this.sum.textContent = '';
    span('', this.sum, 'Alınan ');
    h('b', '', this.sum, fmtNum(r.taken));
    span('', this.sum, '  ·  İyileşme ');
    h('b', 'dr-heal', this.sum, '+' + fmtNum(r.healed));

    this.list.textContent = '';
    const hits = r.hits.slice(-ROWS);
    if (!hits.length) span('dr-none', this.list, 'Son saniyelerde vuruş alınmadı.');
    for (const hit of hits) this.row(hit, r);

    this.foot.textContent = '';
    const kb = r.killingBlow;
    if (kb) {
      span('', this.foot, 'Son darbe: ');
      h('b', '', this.foot, `${sourceLabel(kb.sourceName, kb.sourceLevel, kb.sourceDist)} · ${kb.ability}`);
      if (kb.avoidable) h('span', 'dr-chip hot', this.foot, 'Kaçınılabilirdi');
    } else span('', this.foot, 'Son darbe belirsiz (süreli hasar).');
    if (r.unused.length) span('dr-unused', this.foot, `Kullanılmayan: ${r.unused.join(', ')}`);
  }

  private row(hit: DeathHitEntry, r: DeathRecap): void {
    const killed = hit === r.killingBlow;
    const row = div('dr-row' + (killed ? ' kill' : ''), this.list);
    row.style.setProperty('--tc', DAMAGE_COLORS[hit.type] ?? '#d8d8e0');
    span('dr-t', row, fmtAgo(hit.t - r.at));
    const src = div('dr-src', row);
    h('b', '', src, sourceLabel(hit.sourceName, hit.sourceLevel, hit.sourceDist));
    span('dr-ab', src, ` · ${hit.ability}`);
    if (hit.avoidable) h('span', 'dr-chip', src, 'Kaçınılabilir');
    span('dr-amt', row, '−' + fmtNum(hit.amount));
    span('dr-hp', row, `%${Math.max(0, Math.round(hit.hpPct * 100))}`);
  }
}

/**
 * HUD slot for the recap: shown on the right while the local player is dead and a recap exists (the death panel's dark overlay
 * dims it, which reads as part of the death screen). OWNER: hud module.
 */
export class DeathRecapCard implements HudWidget {
  readonly el: HTMLElement;
  private block: DeathRecapBlock;

  constructor() {
    this.el = div('dr-slot');
    this.block = new DeathRecapBlock();
    this.el.appendChild(this.block.el);
  }

  update(ctx: HudCtx): void {
    const dead = !!ctx.player && ctx.player.isDead;
    const inGame = ctx.mode === 'town' || ctx.mode === 'dungeon';
    setClass(this.el, 'on', dead && inGame && this.block.hasRecap);
  }

  reset(): void {
    this.block.clear();
    setClass(this.el, 'on', false);
  }
}
