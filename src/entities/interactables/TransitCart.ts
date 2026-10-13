import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import type { DungeonTransitDef } from '../../types/dungeons';
import type { EntityId } from '../../types/common';
import type { InteractEvent } from '../../data/devices';
import { G } from '../../game/G';

export interface TransitCartOpts {
  /** World x/z of the two stops, in the same order as `DungeonTransitDef.stops` (the scene converts tile coords). */
  stopsWorld: [[number, number], [number, number]];
  /** Riders within this many metres board (default 12). */
  boardRadius?: number;
  /** Max riders (default 5). */
  maxRiders?: number;
  /** Cart model url (`tk_mine_cart`). Loaded with the entity so it moves with it. Optional. */
  modelUrl?: string;
  /** Gate for rides: returns a Turkish reason when the cart cannot be used yet ("Arabayı bekliyor"), else null. */
  blockedReason?: () => string | null;
  onEvent?: (e: InteractEvent) => void;
}

/**
 * Taşkasa cart (P-15, `extras.transits`, SP-13). Two stops; F boards every living party member within `boardRadius`.
 * The ride runs on the host: a guest asks with `sendRequest('transit:ride', { id })` and the host's handler calls `ride()`.
 * `ride()` moves the cart along the straight line at `speed` m/s (default 14) and reports 'transit' events with phase 'start'
 * and 'arrive'. The scene moves the riders with those events. The polyline path and the height drop of the doc are not built.
 * OWNER: scenes module.
 */
export class TransitCart extends InteractableProp {
  readonly transitId: string;
  readonly stopsTile: [[number, number], [number, number]];
  /** 0 or 1: the stop the cart is at. */
  atStop = 0;
  riding = false;
  private readonly opts: TransitCartOpts;
  private readonly speed: number;
  private t = 0;
  private seconds = 0;
  private from: [number, number] = [0, 0];
  private to: [number, number] = [0, 0];
  private riderIds: EntityId[] = [];

  constructor(id: number, def: DungeonTransitDef, opts: TransitCartOpts) {
    super(id);
    this.transitId = def.id;
    this.stopsTile = def.stops;
    this.opts = opts;
    this.speed = def.speed ?? 14;
    this.interactRange = 3.5;
    this.blockRadius = 0;
    this.radius = 1.4;
    this.height = 1.6;
  }

  async load(): Promise<void> {
    if (this.opts.modelUrl) await this.loadModel(this.opts.modelUrl);
  }

  get interactPrompt(): string {
    if (this.riding) return 'Araba yolda';
    const why = this.opts.blockedReason?.() ?? null;
    if (why) return why;
    return 'Arabaya bin';
  }

  canInteract(): boolean {
    return !this.riding;
  }

  interact(p: Player): void {
    if (this.riding) return;
    const why = this.opts.blockedReason?.() ?? null;
    if (why) {
      G.ui.toast(why, 'info');
      return;
    }
    if (G.net.role === 'client') {
      G.net.sendRequest('transit:ride', { id: this.transitId });
      return;
    }
    this.ride(this.nearbyRiders(p));
  }

  /** Living players within `boardRadius` of the cart (the local player included), nearest first, at most `maxRiders`. */
  nearbyRiders(p: Player): Player[] {
    const r = this.opts.boardRadius ?? 12;
    const world = this.world;
    if (!world) return [p];
    const list = world.players
      .filter((o) => !o.isDead && Math.hypot(o.position.x - this.position.x, o.position.z - this.position.z) <= r)
      .sort((a, b) => Math.hypot(a.position.x - this.position.x, a.position.z - this.position.z) - Math.hypot(b.position.x - this.position.x, b.position.z - this.position.z));
    return list.slice(0, this.opts.maxRiders ?? 5);
  }

  /** Host side: starts the ride to the other stop. No-op while riding or with no riders. */
  ride(riders: Player[]): void {
    if (this.riding || riders.length === 0) return;
    const [a, b] = this.opts.stopsWorld;
    const [from, to] = this.atStop === 0 ? [a, b] : [b, a];
    this.from = [from[0], from[1]];
    this.to = [to[0], to[1]];
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    this.seconds = Math.max(1, len / this.speed);
    this.t = 0;
    this.riding = true;
    this.riderIds = riders.map((r) => r.id);
    this.opts.onEvent?.({
      type: 'transit',
      transitId: this.transitId,
      phase: 'start',
      riderIds: this.riderIds,
      to: this.stopsTile[this.atStop === 0 ? 1 : 0],
      seconds: this.seconds,
    });
  }

  protected animate(dt: number): void {
    if (!this.riding) return;
    this.t += dt;
    const s = Math.min(1, this.t / this.seconds);
    this.position.x = this.from[0] + (this.to[0] - this.from[0]) * s;
    this.position.z = this.from[1] + (this.to[1] - this.from[1]) * s;
    if (s < 1) return;
    this.riding = false;
    this.atStop = this.atStop === 0 ? 1 : 0;
    this.opts.onEvent?.({
      type: 'transit',
      transitId: this.transitId,
      phase: 'arrive',
      riderIds: this.riderIds,
      to: this.stopsTile[this.atStop],
      seconds: this.seconds,
    });
    this.riderIds = [];
  }
}
