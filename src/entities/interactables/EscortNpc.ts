import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';

/**
 * Escort NPC of a quest (`escort` objective): a voxel figure that walks a short path once F starts it. The walk, the ambush and
 * the protection timer live in scenes/world/QuestEscortRun.ts; this entity only shows the figure and forwards F. OWNER: scenes module.
 * Only an escort whose quest is active is interactable (canStart): every escort NPC carries the same name, and a locked or
 * finished quest's escort used to take F from the real one (nearest-first pick in PlayerController).
 */
const CUBE = new THREE.BoxGeometry(1, 1, 1);

export class EscortNpc extends InteractableProp {
  constructor(
    id: number,
    private readonly npcName: string,
    private readonly onStart: () => void,
    private readonly promptOf: () => string,
    private readonly canStart: () => boolean,
  ) {
    super(id, 'interactable');
    this.interactRange = 3.6;
    this.radius = 0.5;
    this.height = 2;
  }

  get interactPrompt(): string {
    return `${this.npcName} – ${this.promptOf()}`;
  }

  async load(): Promise<void> {
    const g = new THREE.Group();
    const cloth = new THREE.MeshLambertMaterial({ color: 0x5a6a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b890 });
    const block = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
      const m = new THREE.Mesh(CUBE, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
    };
    block(cloth, 0, 0.55, 0, 0.5, 0.9, 0.36);
    block(cloth, 0, 1.25, 0, 0.36, 0.2, 0.3);
    block(skin, 0, 1.5, 0, 0.3, 0.3, 0.3);
    block(cloth, 0.3, 0.6, 0, 0.12, 0.8, 0.12);
    this.object3d.add(g);
    this.model = g;
  }

  /** PlayerController skips an escort whose quest is not active, so F reaches the NPC of the quest the player is on. */
  canInteract(_p: Player): boolean {
    return this.canStart();
  }

  interact(_p: Player): void {
    this.onStart();
  }
}
