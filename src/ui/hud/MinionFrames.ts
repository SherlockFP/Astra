import { G } from '../../game/G';
import type { Minion } from '../../entities/Minion';
import { div, fmtClock, setClass, setDisplay, setText, span } from '../widgets/dom';
import { Bar } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';

/**
 * NC44 MinionFrames (GDD_CLASSES_V2 §1.5 rule 9): small ElvUI-style frames for the LOCAL player's minions (pets, demons, golems,
 * timed summons). They sit in the top-left column right under the party frames and move with the layout editor ("Yoldaş
 * çerçeveleri").
 *
 *  - one 18 px row per minion: name, HP bar (value in the bar), and a countdown for timed summons (red under 5 s);
 *  - more than GROUP_AT minions of the same def (the ghoul army: 8) collapse into ONE row with a "×N" badge, the summed HP and the
 *    shortest remaining time;
 *  - at most MAX_ROWS rows; permanent companions first.
 *
 * Cheap: the minion list is scanned at 10 Hz and the rows are only rebuilt when the set of row keys changes (a summon, a death, a
 * group forming). Per frame a row writes its HP bar (Bar caches its style writes) and cached text. Hidden (no layout room) while
 * the player has no minions.
 */

/** More than this many minions of one def share one row. */
export const MINION_GROUP_AT = 4;
const MAX_ROWS = 8;
const SCAN_EVERY = 0.1;
const LOW_TIME = 5;

interface Entry {
  key: string;
  name: string;
  members: Minion[];
  timed: boolean;
}

class Row {
  readonly el: HTMLElement;
  readonly bar: Bar;
  private readonly nameT: HTMLElement;
  private readonly badge: HTMLElement;
  private readonly timer: HTMLElement;
  entry: Entry | null = null;

  constructor() {
    this.el = div('mf-row');
    this.bar = new Bar('mf-hp', this.el);
    this.bar.el.dataset.kind = 'friendly';
    this.nameT = span('mf-name', this.bar.label);
    const right = div('mf-right', this.bar.label);
    this.badge = span('mf-badge', right);
    this.timer = span('mf-time', right);
  }

  bind(e: Entry): void {
    this.entry = e;
    setText(this.nameT, e.name);
    const n = e.members.length;
    setText(this.badge, n > 1 ? `×${n}` : '');
    setDisplay(this.badge, n > 1);
  }

  update(dt: number): void {
    const e = this.entry;
    if (!e) return;
    let hp = 0, max = 0, life = Infinity;
    for (const m of e.members) {
      hp += Math.max(0, m.hp);
      max += Math.max(1, m.maxHp);
      if (m.timed && m.life < life) life = m.life;
    }
    this.bar.set(max > 0 ? hp / max : 0, dt);
    const low = hp / Math.max(1, max) < 0.3;
    setClass(this.bar.el, 'is-low', low);
    if (e.timed && Number.isFinite(life)) {
      setText(this.timer, life >= 60 ? fmtClock(life) : `${Math.ceil(life)} sn`);
      setDisplay(this.timer, true);
      setClass(this.timer, 'low', life < LOW_TIME);
    } else {
      setDisplay(this.timer, false);
    }
  }
}

export class MinionFrames implements HudWidget {
  readonly el: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private shown: Row[] = [];
  private sig = '';
  private acc = SCAN_EVERY;
  private readonly byDef = new Map<string, Minion[]>();

  constructor() {
    this.el = div('mfr');
    G.events.on('scene:leaving', () => this.reset());
  }

  update(ctx: HudCtx): void {
    const owner = ctx.player;
    const minions = G.minions;
    if (!owner || !minions) {
      if (this.shown.length) this.reset();
      return;
    }
    this.acc += ctx.dt;
    if (this.acc >= SCAN_EVERY) {
      this.acc = 0;
      this.scan(owner.id, minions.list);
    }
    for (const r of this.shown) r.update(ctx.dt);
  }

  reset(): void {
    this.sig = '';
    this.acc = SCAN_EVERY;
    this.shown = [];
    for (const r of this.rows.values()) r.el.remove();
    this.rows.clear();
    setClass(this.el, 'on', false);
  }

  /** Collects the owner's living minions into row entries; rebuilds the DOM rows only when the key list changed. */
  private scan(ownerId: number, list: readonly Minion[]): void {
    const byDef = this.byDef;
    byDef.clear();
    for (const m of list) {
      if (m.ownerId !== ownerId || m.isDead || m.removed) continue;
      const a = byDef.get(m.def.id);
      if (a) a.push(m);
      else byDef.set(m.def.id, [m]);
    }
    const entries: Entry[] = [];
    for (const [defId, ms] of byDef) {
      if (ms.length > MINION_GROUP_AT) entries.push({ key: `g:${defId}`, name: ms[0].def.name, members: ms.slice(), timed: ms.some((m) => m.timed) });
      else for (const m of ms) entries.push({ key: `m:${m.id}`, name: m.def.name, members: [m], timed: m.timed });
    }
    // permanent companions first, then timed ones; stable by key
    entries.sort((a, b) => Number(a.timed) - Number(b.timed) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    if (entries.length > MAX_ROWS) entries.length = MAX_ROWS;
    let sig = '';
    for (const e of entries) sig += `${e.key}:${e.members.length};`;
    if (sig === this.sig) {
      // same rows: refresh the member lists (ghouls of a group come and go without changing the row set only when the count changes)
      for (let i = 0; i < entries.length; i++) this.shown[i].entry = entries[i];
      return;
    }
    this.sig = sig;
    const keep = new Set<string>();
    const next: Row[] = [];
    for (const e of entries) {
      keep.add(e.key);
      let r = this.rows.get(e.key);
      if (!r) {
        r = new Row();
        this.rows.set(e.key, r);
      }
      r.bind(e);
      next.push(r);
    }
    for (const [k, r] of this.rows) {
      if (!keep.has(k)) {
        r.el.remove();
        this.rows.delete(k);
      }
    }
    for (const r of next) this.el.appendChild(r.el);   // appendChild also re-orders existing rows
    this.shown = next;
    setClass(this.el, 'on', next.length > 0);
  }
}
