import { G } from '../../game/G';
import type { PipDef } from '../../types/classes';
import type { PipId } from '../../types/common';
import type { Player } from '../../entities/Player';
import { div, pulse, setClass, setDisplay, setStyle } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

/**
 * NC36 PipBar: the ElvUI "class bar" of the player frame. One row of glyphs per pip the class / spec uses
 * (SkillSystem.activePips: Çi, Kutsal Güç, Ruh Parçası, Kombo, Adalet, Karışım, Gizem Yükü, Rün). It lives in the player
 * frame's `pipsHost` slot, so it moves with the frame in the layout editor.
 *
 * Updates: `pips:changed` writes the new count at once; a per-frame poll of SkillSystem.pipCount covers the writers that do
 * not emit (Adalet / Karışım are written straight into Player.pips). Both go through `apply`, which returns early when
 * nothing changed, so a quiet frame costs one pipCount read per row. Glyphs are built once per class / spec, afterwards only
 * class and style toggles. Rune rows (PipDef.regen) show the recharge of the next glyph as a fill.
 */

/** Count at which a spender can be paid: the row glows from here (GDD_CLASSES_V2 §1.2: Kutsal Güç spenders cost 3). */
const READY_AT: Partial<Record<PipId, number>> = { holypower: 3 };

interface PipRow {
  def: PipDef;
  el: HTMLElement;
  glyphs: HTMLElement[];
  fills: HTMLElement[];
  /** Internal units per displayed glyph (shard fragments: 10). */
  scale: number;
  regen: boolean;
  /** Displayed count / max currently applied (-1 = never applied). */
  points: number;
  max: number;
  /** Last recharge percent written to the fill of the regenerating glyph (-1 = none). */
  regenPct: number;
  regenIdx: number;
}

export class PipBar implements HudWidget {
  readonly el: HTMLElement;
  private rows: PipRow[] = [];
  private byId = new Map<string, PipRow>();
  private cls = '';
  private spec = '';

  constructor() {
    this.el = div('pipbar');
    G.events.on('pips:changed', ({ id, points, max }) => {
      const row = this.byId.get(id);
      if (row) this.apply(row, points, max);
    });
    G.events.on('scene:leaving', () => this.reset());
  }

  update(ctx: HudCtx): void {
    const p = ctx.player;
    if (!p || !G.skills) {
      setClass(this.el, 'on', false);
      return;
    }
    const spec = p.spec ?? '';
    if (p.classId !== this.cls || spec !== this.spec) this.rebuild(p, spec);
    if (this.rows.length === 0) return;
    for (const row of this.rows) {
      const id = row.def.id;
      this.apply(row, Math.floor(G.skills.pipCount(p, id) / row.scale), Math.floor(G.skills.pipMax(p, id) / row.scale));
      if (row.regen) this.updateRegen(row, p);
    }
  }

  reset(): void {
    for (const row of this.rows) row.points = -1;
    this.cls = '';
    this.spec = '';
  }

  /** Rebuilds the rows for the player's class + spec (rare: login, spec switch). */
  private rebuild(p: Player, spec: string): void {
    this.cls = p.classId;
    this.spec = spec;
    this.rows = [];
    this.byId.clear();
    this.el.textContent = '';
    const defs = G.skills?.activePips(p) ?? [];
    for (const def of defs) {
      const scale = def.scale ?? 1;
      const el = div('pb-row', this.el);
      el.dataset.pip = def.id;
      el.title = def.name;
      setStyle(el, '--pc', def.color);
      const regen = !!def.regen;
      // one spare glyph: +1 max from notables (Çi, Kutsal Güç) and the Gölge combo cap of 6
      const cap = Math.ceil(def.max / scale) + 1;
      const glyphs: HTMLElement[] = [];
      const fills: HTMLElement[] = [];
      for (let i = 0; i < cap; i++) {
        const g = div('pb-g', el);
        glyphs.push(g);
        if (regen) fills.push(div('pb-fill', g));
      }
      const row: PipRow = { def, el, glyphs, fills, scale, regen, points: -1, max: -1, regenPct: -1, regenIdx: -1 };
      this.rows.push(row);
      this.byId.set(def.id, row);
    }
    setClass(this.el, 'on', this.rows.length > 0);
  }

  private apply(row: PipRow, points: number, max: number): void {
    if (row.points === points && row.max === max) return;
    const gained = row.points >= 0 && points > row.points;
    row.points = points;
    if (row.max !== max) {
      row.max = max;
      for (let i = 0; i < row.glyphs.length; i++) setDisplay(row.glyphs[i], i < max);
    }
    for (let i = 0; i < row.glyphs.length; i++) setClass(row.glyphs[i], 'on', i < points);
    if (gained && row.glyphs[points - 1]) pulse(row.glyphs[points - 1], 'pop');
    const ready = READY_AT[row.def.id] ?? max;
    setClass(row.el, 'full', max > 0 && points >= max);
    setClass(row.el, 'ready', points >= ready && points > 0);
    setClass(row.el, 'empty', points <= 0);
  }

  /** Recharge fill of the first empty glyph of a regenerating row (runes): whole percents, written only on change. */
  private updateRegen(row: PipRow, p: Player): void {
    const full = row.points >= row.max;
    const idx = full ? -1 : row.points;
    const pct = full ? 0 : Math.round(G.skills.pipRegenFrac(p, row.def.id) * 100);
    if (idx === row.regenIdx && pct === row.regenPct) return;
    if (row.regenIdx >= 0 && row.regenIdx !== idx && row.fills[row.regenIdx]) setStyle(row.fills[row.regenIdx], '--f', '0%');
    row.regenIdx = idx;
    row.regenPct = pct;
    if (idx >= 0 && row.fills[idx]) setStyle(row.fills[idx], '--f', pct + '%');
  }
}
