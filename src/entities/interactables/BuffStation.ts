import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import type { DungeonStationDef } from '../../types/dungeons';
import type { EntityId } from '../../types/common';
import type { InteractEvent } from '../../data/devices';
import { PROFESSION_NAMES } from '../../data/devices';
import { CLASSES } from '../../data/classes';
import { G } from '../../game/G';

/**
 * `DungeonStationDef` (K1) plus the optional fields of the Taşkasa SP-14 spec (`requires`, `hint`). The K1 type does not carry
 * them yet, so the scene passes them through when present. Requirements are "either one": a listed class or a profession skill.
 */
export interface BuffStationSpec extends DungeonStationDef {
  requires?: { classIds?: string[]; profession?: { id: string; skill: number } };
  hint?: string;
}

/**
 * Tek kullanımlık güç istasyonu (P-15, `extras.stations`). One use per run per player (this peer keeps the set; the scene's run
 * scope owns the entity, so it resets with the run). F applies `buff` to the interacting player locally. A player who does not
 * meet `requires` sees the `hint` as a toast.
 * OWNER: scenes module.
 */
export class BuffStation extends InteractableProp {
  readonly spec: BuffStationSpec;
  private readonly usedBy = new Set<EntityId>();
  private readonly onEvent?: (e: InteractEvent) => void;

  constructor(id: number, spec: BuffStationSpec, opts: { onEvent?: (e: InteractEvent) => void; model?: THREE.Object3D } = {}) {
    super(id);
    this.spec = spec;
    this.onEvent = opts.onEvent;
    this.interactRange = 3.4;
    this.blockRadius = 0.7;
    this.radius = 0.9;
    this.height = 2;
    if (opts.model) this.adoptModel(opts.model);
  }

  /** Nothing to load: the builder's model (if any) is adopted in the constructor. */
  async load(): Promise<void> {}

  /** True if `p` meets the spec's requirement (no requirement: everyone). */
  meets(p: Player): boolean {
    const req = this.spec.requires;
    if (!req) return true;
    if (req.classIds?.includes(p.classId)) return true;
    const skill = (G.character?.save.professions as Record<string, { skill: number } | undefined> | undefined)?.[req.profession?.id ?? '']?.skill ?? 0;
    return !!req.profession && skill >= req.profession.skill;
  }

  private requirementText(): string {
    const req = this.spec.requires;
    if (!req) return '';
    const names: string[] = [];
    for (const c of req.classIds ?? []) names.push((CLASSES as Record<string, { name: string } | undefined>)[c]?.name ?? c);
    if (req.profession) names.push(`${PROFESSION_NAMES[req.profession.id] ?? req.profession.id} (${req.profession.skill}+)`);
    return names.join(' veya ');
  }

  get interactPrompt(): string {
    return 'Güç istasyonunu kullan';
  }

  canInteract(p?: Player): boolean {
    return !(p && this.usedBy.has(p.id));
  }

  interact(p: Player): void {
    if (this.usedBy.has(p.id)) {
      G.ui.toast('Bu istasyonu bu koşuda zaten kullandın.', 'info');
      return;
    }
    if (!this.meets(p)) {
      G.ui.toast(this.spec.hint ?? `Yalnızca şunlar kullanabilir: ${this.requirementText()}`, 'info');
      return;
    }
    const applied = p.statuses.apply(this.spec.status, this.spec.duration, { magnitude: this.spec.magnitude, sourceId: p.id });
    if (!applied) {
      G.ui.toast('Güç bu durumda etki etmedi.', 'warning');
      return;
    }
    this.usedBy.add(p.id);
    G.ui.toast('Güç kazandın!', 'success');
    this.onEvent?.({ type: 'station', stationId: this.spec.id, byId: p.id, buff: this.spec.status, duration: this.spec.duration });
  }
}
