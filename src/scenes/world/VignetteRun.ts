import { ESCORT_FAIL_DIST_M, ESCORT_HINT_SEC, EscortRun, type EscortFailReason, type Pt2 } from './QuestEscortRun';
import { VIGNETTE_RULES, type VignetteDef, type VignetteKind, type VignetteReward } from '../../data/world/vignettes';

/**
 * One running vignette for the local player: a pure state machine (no three.js, no services). It takes the facts of the frame
 * (`update`) and the player's actions (`onNpc`, `onTuft`, `onSatchel`, `onKill`, `onDamage`, `onCart`, `answer`), and returns the
 * events the world must apply (phase changes, lines, pop-up questions, rewards, item moves, the end). The world side is
 * scenes/world/Vignettes.ts; the sim is dev/combat-sim/vignettes.mjs.
 *  - road_ambush: the ambushers fight the traveler; when they are dead the traveler is saved. A player who fought gets the small
 *    thanks reward and the pop-up mini quest: 'escort' (F starts the walk along the road, done at the end point) or 'satchel'
 *    (the satchel lies on the road, F picks it, back to the traveler in range = done).
 *  - scout_herbs: F asks the scout (pop-up); the tufts give Ak Papatya; with enough herbs in the bag the player walks back and
 *    the turn-in is automatic in range.
 *  - wolf_hunt: kill `killsNeeded` pack wolves. goblin_sighting: catch the goblin. stuck_cart: the cart is freed (F held).
 * Every vignette ends at durSec at the latest; a finished one lingers VIGNETTE_RULES.lingerSec, then 'end'.
 * OWNER: scenes module.
 */

export type VignettePhase =
  | 'ambush'
  | 'saved'
  | 'escort'
  | 'satchel'
  | 'carry'
  | 'scout'
  | 'herbs'
  | 'return'
  | 'hunt'
  | 'chase'
  | 'stuck'
  | 'done'
  | 'expired';

export type VigEvent =
  | { t: 'phase'; to: VignettePhase }
  | { t: 'say'; text: string }
  | { t: 'toast'; text: string; kind: 'info' | 'success' }
  | { t: 'ask'; text: string; yes: string; no: string }
  | { t: 'grant'; gold: number; xpPct: number; why: 'thanks' | 'reward' }
  | { t: 'give'; item: string; n: number }
  | { t: 'take'; item: string; n: number }
  | { t: 'end'; reason: 'done' | 'expired' };

/** The facts of one frame, read by the world (or by the sim). */
export interface RunFacts {
  dt: number;
  /** Distance (m) from the local player to (x, z). */
  playerDist(x: number, z: number): number;
  /** Alive enemies tagged to this vignette. */
  aliveTagged: number;
  /** Herbs of the scout's item in the bag. */
  herbsInBag: number;
}

export interface RunOpts {
  def: VignetteDef;
  slot: number;
  /** Where the NPC, the campfire or the cart stands (the anchor). */
  anchor: Pt2;
  /** Ring-scaled level of the local player (rewards). */
  level: number;
  /** road_ambush 'escort' follow-up: the nav polyline from the anchor along the road (path[0] = anchor). Missing = no escort. */
  escortPath?: Pt2[] | null;
}

const FIRST: Record<VignetteKind, VignettePhase> = {
  road_ambush: 'ambush',
  scout_herbs: 'scout',
  wolf_hunt: 'hunt',
  goblin_sighting: 'chase',
  stuck_cart: 'stuck',
};

/** Escort walk (QuestEscortRun constants of the quest escorts): 2 m/s, leash 25 m, fails after 20 s out of 60 m. */
const ESCORT = { speed: 2, leash: 25, failSec: 20 } as const;
/** The escort's end point counts as reached within this distance (m). */
const END_REACH_M = 1.5;

export class VignetteRun {
  readonly def: VignetteDef;
  readonly slot: number;
  readonly anchor: Pt2;
  readonly level: number;
  phase: VignettePhase;
  /** Seconds left before the despawn (a finished vignette: until its linger ends). */
  left: number;
  /** Seconds since the start. */
  age = 0;
  /** A pop-up question is open: answer() is due. */
  asking: 'followup' | 'herbs' | null = null;
  /** The local player fought in it (damage or a kill): the thanks and the follow-up need it. */
  participated = false;
  /** Kills of the objective's enemy. */
  kills = 0;
  /** Tufts picked (scout_herbs). */
  tufts = 0;
  /** The escort walk of a road_ambush follow-up; null when there is none. */
  escort: EscortRun | null = null;
  private seen = false;
  private resolved = false;
  private ended = false;
  private facts: RunFacts = { dt: 0, playerDist: () => Infinity, aliveTagged: 0, herbsInBag: 0 };
  private out: VigEvent[] = [];
  private readonly escortPath: Pt2[] | null;

  constructor(o: RunOpts) {
    this.def = o.def;
    this.slot = o.slot;
    this.anchor = { x: o.anchor.x, z: o.anchor.z };
    this.level = Math.max(1, o.level);
    this.left = o.def.durSec;
    this.phase = FIRST[o.def.kind];
    this.escortPath = o.def.followup === 'escort' && o.escortPath && o.escortPath.length >= 2 ? o.escortPath : null;
    if (this.escortPath) {
      const path = this.escortPath;
      const end = path[path.length - 1];
      this.escort = new EscortRun(
        { path, triggers: [], speed: ESCORT.speed, leash: ESCORT.leash, failDist: ESCORT_FAIL_DIST_M, failSec: ESCORT.failSec, hintSec: ESCORT_HINT_SEC },
        {
          playerDist: (x, z) => this.facts.playerDist(x, z),
          ambush: () => {},
          ambushAlive: () => 0,
          tick: () => {},
          done: () => {
            const at = this.escort ? Math.hypot(this.escort.pos.x - end.x, this.escort.pos.z - end.z) <= END_REACH_M : false;
            if (at) this.complete();
            return at;
          },
          failed: (reason: EscortFailReason) => this.emit({ t: 'toast', text: reason === 'far' ? `${o.def.lines.fail ?? 'Yanımdan ayrılma.'} Yeniden [F].` : 'Yolcu düştü. Yeniden [F] ile başlat.', kind: 'info' }),
        },
      );
    }
  }

  /** The events of the start (the phase, the first line). */
  begin(): VigEvent[] {
    this.emit({ t: 'phase', to: this.phase });
    this.emit({ t: 'toast', text: `${this.def.name}: yolda bir olay! Haritada işaretlendi.`, kind: 'info' });
    this.emit({ t: 'say', text: this.def.lines.start });
    return this.drain();
  }

  /** Per frame (or per sim step). */
  update(dt: number, facts: RunFacts): VigEvent[] {
    if (this.ended) return [];
    this.facts = facts;
    this.age += dt;
    this.left -= dt;
    if (this.phase !== 'done') this.step(dt);
    if (this.left <= 0) this.expire();
    return this.drain();
  }

  /** F on the NPC (the traveler, the scout, the cart's keeper). */
  onNpc(): VigEvent[] {
    if (this.ended) return [];
    switch (this.phase) {
      case 'scout':
        if (!this.asking) {
          this.asking = 'herbs';
          this.emit({ t: 'ask', text: this.def.lines.ask ?? '', yes: 'Getir', no: 'Sonra' });
        }
        break;
      case 'escort':
        if (this.escort && this.escort.state === 'idle') {
          this.escort.start();
          this.emit({ t: 'toast', text: 'Yolcu yürüyor. Onu yanında tut!', kind: 'info' });
        }
        break;
      case 'carry':
        this.complete();
        break;
      case 'return':
        if (this.herbsReady()) this.complete();
        else this.emit({ t: 'say', text: this.def.lines.fail ?? '' });
        break;
      case 'herbs':
        this.emit({ t: 'say', text: this.def.lines.fail ?? '' });
        break;
      default:
        break;
    }
    return this.drain();
  }

  /** Answer of the pop-up question (`ask` event). A late answer (the vignette ended) changes nothing. */
  answer(yes: boolean): VigEvent[] {
    const which = this.asking;
    this.asking = null;
    if (this.ended || !which) return this.drain();
    if (which === 'followup') {
      if (!yes || this.phase !== 'saved') this.finish(false);
      else if (this.def.followup === 'escort' && this.escort) {
        this.enter('escort');
        this.emit({ t: 'say', text: this.def.lines.accept ?? '' });
      } else if (this.def.followup === 'satchel') {
        this.enter('satchel');
        this.emit({ t: 'say', text: this.def.lines.accept ?? '' });
      } else this.finish(false);
    } else if (which === 'herbs' && yes && this.phase === 'scout') {
      this.enter('herbs');
      this.emit({ t: 'say', text: this.def.lines.accept ?? '' });
    }
    return this.drain();
  }

  /** A tuft of the scout's herbs picked (scout_herbs): one herb to the bag. */
  onTuft(): VigEvent[] {
    if (this.ended || this.phase !== 'herbs' || !this.def.herb) return this.drain();
    if (this.tufts >= this.def.herb.count + 1) {
      this.emit({ t: 'toast', text: 'Bu çalıdaki papatyalar bitti.', kind: 'info' });
      return this.drain();
    }
    this.tufts++;
    this.emit({ t: 'give', item: this.def.herb.item, n: 1 });
    return this.drain();
  }

  /** The satchel picked up (road_ambush 'satchel' follow-up). */
  onSatchel(): VigEvent[] {
    if (!this.ended && this.phase === 'satchel') {
      this.enter('carry');
      this.emit({ t: 'toast', text: 'Heybeyi aldın. Yolcuya götür.', kind: 'info' });
    }
    return this.drain();
  }

  /** A kill of a tagged enemy by the local player (`defId` = its enemy def). */
  onKill(defId: string): VigEvent[] {
    if (this.ended) return [];
    this.participated = true;
    const scored = (this.phase === 'hunt' || this.phase === 'chase') && this.def.killsNeeded > 0 && defId === this.def.enemies[0];
    if (scored) {
      this.kills++;
      if (this.kills >= this.def.killsNeeded) this.complete();
    }
    return this.drain();
  }

  /** Damage the local player dealt to a tagged enemy. */
  onDamage(amount: number): VigEvent[] {
    if (amount > 0 && !this.ended) this.participated = true;
    return this.drain();
  }

  /** The cart's hold finished (stuck_cart). */
  onCart(): VigEvent[] {
    if (!this.ended && this.phase === 'stuck') this.complete();
    return this.drain();
  }

  /** True once the vignette despawns (the world removes its props and the pin). */
  get isEnded(): boolean {
    return this.ended;
  }

  herbsReady(): boolean {
    return !!this.def.herb && this.facts.herbsInBag >= this.def.herb.count;
  }

  private step(dt: number): void {
    const f = this.facts;
    switch (this.phase) {
      case 'ambush': {
        if (f.aliveTagged > 0) this.seen = true;
        const cleared = this.seen && f.aliveTagged === 0;
        const noWave = !this.seen && this.age >= VIGNETTE_RULES.waveWaitSec;
        if (cleared || noWave) this.saved();
        break;
      }
      case 'escort':
        this.escort?.update(dt);
        break;
      case 'herbs':
        if (this.herbsReady()) {
          this.enter('return');
          this.emit({ t: 'toast', text: 'Papatyalar tamam! İzciye dön.', kind: 'success' });
        }
        break;
      case 'return':
        if (this.herbsReady() && f.playerDist(this.anchor.x, this.anchor.z) <= VIGNETTE_RULES.returnM) this.complete();
        break;
      case 'carry':
        if (f.playerDist(this.anchor.x, this.anchor.z) <= VIGNETTE_RULES.returnM) this.complete();
        break;
      default:
        break;
    }
  }

  /** The wave is over: the traveler is saved. A player who fought gets the thanks reward and the pop-up mini quest. */
  private saved(): void {
    this.enter('saved');
    this.emit({ t: 'say', text: this.def.lines.thanks ?? this.def.lines.done });
    if (!this.participated) {
      this.finish(false);
      return;
    }
    if (this.def.thanks) this.grant(this.def.thanks, 'thanks');
    const offers = this.def.followup === 'satchel' || (this.def.followup === 'escort' && !!this.escort);
    if (!offers) {
      this.finish(false);
      return;
    }
    this.asking = 'followup';
    this.emit({ t: 'ask', text: this.def.lines.ask ?? '', yes: 'Kabul et', no: 'Hayır' });
  }

  private complete(): void {
    if (this.phase === 'done' || this.ended) return;
    // the scout's herbs are handed in: the turn-in takes them from the bag
    if (this.def.herb && this.phase === 'return') this.emit({ t: 'take', item: this.def.herb.item, n: this.def.herb.count });
    this.grant(this.def.reward, 'reward');
    this.finish(true);
  }

  private grant(r: VignetteReward, why: 'thanks' | 'reward'): void {
    this.emit({ t: 'grant', gold: Math.round(r.goldPerLevel * this.level), xpPct: r.xpPct, why });
  }

  /** The vignette is over for the player: it lingers, then despawns. `withLine`: the closing line of the objective. */
  private finish(withLine: boolean): void {
    if (this.phase === 'done' || this.ended) return;
    this.resolved = true;
    this.enter('done');
    this.left = Math.min(this.left, VIGNETTE_RULES.lingerSec);
    this.asking = null;
    if (withLine) this.emit({ t: 'say', text: this.def.lines.done });
  }

  private expire(): void {
    if (this.ended) return;
    this.ended = true;
    this.asking = null;
    this.phase = 'expired';
    this.emit({ t: 'phase', to: 'expired' });
    this.emit({ t: 'end', reason: this.resolved ? 'done' : 'expired' });
  }

  private enter(to: VignettePhase): void {
    this.phase = to;
    this.emit({ t: 'phase', to });
  }

  private emit(e: VigEvent): void {
    this.out.push(e);
  }

  private drain(): VigEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }
}
