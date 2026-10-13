import { InteractableProp } from './InteractableProp';
import { HoldF } from './ChannelGate';
import type { Player } from '../Player';
import type { DungeonDropPropDef } from '../../types/dungeons';
import type { EntityId } from '../../types/common';
import type { InteractEvent } from '../../data/devices';
import { G } from '../../game/G';

/**
 * Winch that drops a chandelier-like prop (P-15, `extras.dropProps`, Yıldız S11). Hold F for 1.0 s within 3 m of the winch.
 * On completion the drop fires once: the host resolves it (ring damage and stun, `ring`, `dmgPctMax`, `eliteCap`, `stun`,
 * `playerCoef`) from the 'drop' event, and replicates it. A guest asks with `sendRequest('drop:winch', { id })`; the host's
 * handler calls `fire()`. The 2 s red telegraph ring is not drawn here (the scene owns VFX).
 * OWNER: scenes module.
 */
export class DropWinch extends InteractableProp {
  readonly def: DungeonDropPropDef;
  /** True after the drop fired (one use per chandelier). */
  dropped = false;
  readonly hold = new HoldF(1.0, 3);
  private readonly onEvent?: (e: InteractEvent) => void;
  /** World x/z of the drop centre (the chandelier), from the scene (tile to world conversion lives there). */
  readonly dropWorld: [number, number];

  constructor(id: number, def: DungeonDropPropDef, opts: { dropWorld: [number, number]; onEvent?: (e: InteractEvent) => void }) {
    super(id);
    this.def = def;
    this.dropWorld = opts.dropWorld;
    this.onEvent = opts.onEvent;
    this.interactRange = 3;
    this.blockRadius = 0;
    this.radius = 0.6;
    this.height = 2;
  }

  /** Nothing to load: the winch is a placed prop (its model, if any, is the builder's). */
  async load(): Promise<void> {}

  get interactPrompt(): string {
    if (this.dropped) return 'Avize indirildi';
    if (this.hold.running) return 'Vinç çalışıyor...';
    return 'Aviziyi indir (F\'yi 1 sn basılı tut)';
  }

  canInteract(): boolean {
    return !this.dropped;
  }

  interact(p: Player): void {
    if (this.dropped || this.hold.running) return;
    this.hold.start(p, this.position.x, this.position.z);
    G.ui.toast('Vinç çalışıyor...', 'info');
  }

  /** Host side: fires the drop once. Returns false if it already fired. */
  fire(byId: EntityId): boolean {
    if (this.dropped) return false;
    this.dropped = true;
    this.onEvent?.({ type: 'drop', propId: this.def.id, byId, x: this.dropWorld[0], z: this.dropWorld[1] });
    return true;
  }

  protected animate(dt: number): void {
    const holder = this.hold.holderPlayer;
    if (!holder) return;
    const s = this.hold.tick(dt);
    if (s === 'done') {
      this.hold.reset();
      if (G.net.role === 'client') G.net.sendRequest('drop:winch', { id: this.def.id });
      else this.fire(holder.id);
    } else if (s === 'cancel') {
      this.hold.reset();
    }
  }
}
