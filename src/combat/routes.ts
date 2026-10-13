import { COMBO_ROUTES } from '../data/comboRoutes';
import type { ComboRouteDef } from '../types/v2';

/**
 * Combo route detection (GDD_V2 §3.9). The local player's landed actions are pushed as tokens (see data/comboRoutes.ts for
 * the token list). A route completes when the newest tokens equal its `inputs` and every gap between consecutive tokens lies
 * inside the route's window. Routes of the caster's class are tried longest first; the first match wins and clears the history,
 * except a 'quiet' route, which is matched but keeps the history so the chain can go on.
 * History resets after a silent gap longer than MAX_GAP. SkillSystem owns one tracker and applies the reward.
 * OWNER: combat module.
 */

/** A silent gap longer than this starts a new sequence (the longest route window is 3 s, the BSK route). */
const MAX_GAP = 3.2;
const MAX_TOKENS = 10;

interface Token { k: string; start: number; end: number }

let byClass: Map<string, ComboRouteDef[]> | null = null;

/** Routes of one class, longest input first (so L L L H beats L L H). */
function routesFor(classId: string): ComboRouteDef[] {
  if (!byClass) {
    byClass = new Map();
    for (const r of Object.values(COMBO_ROUTES)) {
      const list = byClass.get(r.classId) ?? [];
      list.push(r);
      byClass.set(r.classId, list);
    }
    for (const list of byClass.values()) list.sort((a, b) => b.inputs.length - a.inputs.length);
  }
  return byClass.get(classId) ?? [];
}

export class RouteTracker {
  private toks: Token[] = [];

  /**
   * Records one token (`start` = impact time, `end` = when that action's recovery ends). Returns the completed route, or null.
   * Quiet routes are returned too (the caller decides); a non-quiet match clears the history.
   */
  push(classId: string, k: string, start: number, end: number): ComboRouteDef | null {
    const last = this.toks[this.toks.length - 1];
    if (last && start - last.end > MAX_GAP) this.toks = [];
    this.toks.push({ k, start, end: Math.max(start, end) });
    if (this.toks.length > MAX_TOKENS) this.toks.splice(0, this.toks.length - MAX_TOKENS);

    for (const r of routesFor(classId)) {
      const n = r.inputs.length;
      if (this.toks.length < n) continue;
      const tail = this.toks.slice(this.toks.length - n);
      let ok = true;
      for (let i = 0; i < n && ok; i++) if (tail[i].k !== r.inputs[i]) ok = false;
      for (let i = 1; i < n && ok; i++) {
        const gap = tail[i].start - tail[i - 1].end;
        if (gap < r.windowFrom || gap > r.windowTo) ok = false;
      }
      if (!ok) continue;
      if (r.effect !== 'quiet') this.toks = [];
      return r;
    }
    return null;
  }

  /** Forget the sequence (scene change, death). */
  reset(): void {
    this.toks = [];
  }
}
