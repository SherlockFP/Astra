import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import type { DungeonBoonDef } from '../../types/dungeons';
import type { EntityId } from '../../types/common';
import type { InteractEvent } from '../../data/devices';
import { G } from '../../game/G';

/**
 * Kutsama yastığı (P-15, `extras.boons`). F applies `status` to the interacting player only (locally, no host round trip).
 * `oncePerPlayer` and `cooldownSec` are tracked on this peer. Each use also reports a 'boon' event (with `persistOnDeath`)
 * so the scene can keep the buff through a death if it wants to.
 * OWNER: scenes module.
 */
export class BoonPad extends InteractableProp {
  readonly def: DungeonBoonDef;
  private readonly usedBy = new Set<EntityId>();
  private readonly onEvent?: (e: InteractEvent) => void;
  private readyAt = 0;
  private model2: THREE.Object3D | null = null;

  constructor(id: number, def: DungeonBoonDef, opts: { onEvent?: (e: InteractEvent) => void; model?: THREE.Object3D } = {}) {
    super(id);
    this.def = def;
    this.onEvent = opts.onEvent;
    this.model2 = opts.model ?? null;
    this.interactRange = 3.2;
    this.radius = 0.8;
    this.height = 1.4;
    if (this.model2) this.adoptModel(this.model2);
  }

  /** Nothing to load: the builder's model (if any) is adopted in the constructor. */
  async load(): Promise<void> {}

  get interactPrompt(): string {
    if (this.def.cooldownSec && this.time < this.readyAt) return `Kutsama hazırlanıyor (${Math.ceil(this.readyAt - this.time)} sn)`;
    return 'Kutsamayı al';
  }

  canInteract(p?: Player): boolean {
    if (p && this.def.oncePerPlayer && this.usedBy.has(p.id)) return false;
    return true;
  }

  interact(p: Player): void {
    if (this.def.oncePerPlayer && this.usedBy.has(p.id)) {
      G.ui.toast('Bu kutsamayı zaten aldın.', 'info');
      return;
    }
    if (this.def.cooldownSec && this.time < this.readyAt) {
      G.ui.toast(`Kutsama henüz hazır değil (${Math.ceil(this.readyAt - this.time)} sn).`, 'info');
      return;
    }
    const applied = p.statuses.apply(this.def.status, this.def.duration, { magnitude: this.def.magnitude, sourceId: p.id });
    if (!applied) {
      G.ui.toast('Kutsama bu durumda etki etmedi.', 'warning');
      return;
    }
    this.usedBy.add(p.id);
    if (this.def.cooldownSec) this.readyAt = this.time + this.def.cooldownSec;
    G.ui.toast('Kutsama alındı!', 'success');
    this.onEvent?.({
      type: 'boon',
      boonId: this.def.id,
      byId: p.id,
      status: this.def.status,
      duration: this.def.duration,
      persistOnDeath: !!this.def.persistOnDeath,
    });
  }
}
