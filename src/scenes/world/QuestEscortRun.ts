/**
 * Escort run of one quest (`escort` objective), pure state machine: the walk along a short path, the ambush at the trigger
 * waypoints, the escort NPC's HP and the protection timer. The world code (WorldQuestProps.ts) supplies the distances, the ambush
 * spawns and the QuestSystem.tickEscort call through EscortDeps, so this file runs headless in the sims.
 *
 * Rules: the escort walks only while the local player stays within `leash` metres. Beyond it the escort stops; after `failSec`
 * seconds out of range the run fails (timer reset, escort back to the start). At a trigger waypoint the ambush spawns once per run
 * and the escort waits until the ambushers are dead (no protection time counts meanwhile). One protection second is counted per
 * second of walking (or standing at the end of the path) while the player is in range.
 * HP (optional, `hp` > 0): ambushers within CONTACT_M of the escort hit it (`attackerDps` each, at every moment of the run, waiting
 * included); it regenerates `regen` HP/s while no ambusher is alive. At 0 HP the escort falls: the run fails like an out-of-range
 * run (timer reset, back to the start, full HP).
 */

export interface Pt2 { x: number; z: number }

/** Reach (m) of an ambusher's hit on the escort. */
export const CONTACT_M = 4;

export interface EscortDeps {
  /** Distance (m) from (x, z) to the local player. */
  playerDist(x: number, z: number): number;
  /** Spawn the ambush at (x, z). Peers that cannot spawn enemies simply do nothing (ambushAlive stays 0). */
  ambush(x: number, z: number): void;
  /** Ambushers alive or still spawning. */
  ambushAlive(): number;
  /** Ambushers alive within `reach` m of (x, z). Optional: without it the escort takes no contact damage. */
  attackersNear?(x: number, z: number, reach: number): number;
  /** QuestSystem.tickEscort(seconds, alive). */
  tick(seconds: number, alive: boolean): void;
  /** True when the escort objective is complete. */
  done(): boolean;
}

export interface EscortOpts {
  /** Waypoints; path[0] is the start. */
  path: Pt2[];
  /** Waypoint indices where the ambush fires (first arrival only). */
  triggers: number[];
  /** Walking speed (m/s). */
  speed: number;
  /** Max distance (m) to the local player while the escort walks. */
  leash: number;
  /** Seconds out of range before the run fails. */
  failSec: number;
  /** Max HP of the escort NPC (0 or missing = no HP model). */
  hp?: number;
  /** HP lost per second per ambusher in contact. */
  attackerDps?: number;
  /** HP regenerated per second while no ambusher is alive. */
  regen?: number;
}

export type EscortState = 'idle' | 'walking' | 'ambush' | 'done';

export class EscortRun {
  state: EscortState = 'idle';
  pos: Pt2;
  /** Current HP of the escort NPC (0 when the run has no HP model). */
  hp: number;
  /** Index of the next waypoint to reach. */
  private wp = 1;
  private readonly fired = new Set<number>();
  private far = 0;
  private acc = 0;

  constructor(private readonly o: EscortOpts, private readonly d: EscortDeps) {
    this.pos = { ...o.path[0] };
    this.hp = o.hp ?? 0;
  }

  /** HP share 0..1 (1 without an HP model). */
  get hpPct(): number {
    const max = this.o.hp ?? 0;
    return max > 0 ? Math.max(0, this.hp / max) : 1;
  }

  /** Start the walk (F on the escort). False when a run is already going or finished. */
  start(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'walking';
    return true;
  }

  /** Advance the run by `dt` seconds. */
  update(dt: number): void {
    if (this.state === 'idle' || this.state === 'done') return;
    if (this.d.playerDist(this.pos.x, this.pos.z) > this.o.leash) {
      this.far += dt;
      if (this.far >= this.o.failSec) this.fail();
      return;
    }
    this.far = 0;
    if (this.tendHp(dt)) return;
    if (this.state === 'ambush') {
      if (this.d.ambushAlive() === 0) this.state = 'walking';
      return;
    }
    this.move(dt);
    // move() may have fired an ambush (state changes inside the call, so TypeScript does not see it)
    if ((this.state as EscortState) === 'ambush') return;
    this.acc += dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.d.tick(1, true);
    }
    if (this.d.done()) this.state = 'done';
  }

  /** Contact damage from the ambushers and the regeneration between waves. True when the escort fell (the run failed). */
  private tendHp(dt: number): boolean {
    if (!(this.o.hp && this.o.hp > 0)) return false;
    const near = this.d.attackersNear?.(this.pos.x, this.pos.z, CONTACT_M) ?? 0;
    if (near > 0) this.hp -= near * (this.o.attackerDps ?? 0) * dt;
    else if (this.d.ambushAlive() === 0) this.hp = Math.min(this.o.hp, this.hp + (this.o.regen ?? 0) * dt);
    if (this.hp > 0) return false;
    this.fail();
    return true;
  }

  private move(dt: number): void {
    const path = this.o.path;
    let budget = this.o.speed * dt;
    while (budget > 0 && this.wp < path.length) {
      const t = path[this.wp];
      const dx = t.x - this.pos.x;
      const dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > budget) {
        this.pos.x += (dx / d) * budget;
        this.pos.z += (dz / d) * budget;
        return;
      }
      this.pos = { x: t.x, z: t.z };
      budget -= d;
      const idx = this.wp;
      this.wp++;
      if (this.o.triggers.includes(idx) && !this.fired.has(idx)) {
        this.fired.add(idx);
        this.d.ambush(this.pos.x, this.pos.z);
        this.state = 'ambush';
        return;
      }
    }
  }

  /** Out of range for too long, or the escort fell: the protection timer resets and the escort returns to the start at full HP. */
  private fail(): void {
    this.d.tick(1, false);
    this.state = 'idle';
    this.pos = { ...this.o.path[0] };
    this.hp = this.o.hp ?? 0;
    this.wp = 1;
    this.fired.clear();
    this.far = 0;
    this.acc = 0;
  }
}
