import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import { HoldF } from './ChannelGate';
import type { Player } from '../Player';
import { G } from '../../game/G';

/**
 * Props of the travel vignettes (scenes/world/Vignettes.ts): the wounded traveler and the scout (NPC figures), the scout's campfire,
 * the herb tufts, the satchel and the stuck cart (hold F). Voxel models built in code, like QuestProp. Every peer places its own
 * copy; progress is per character and lives in VignetteRun. The props never block the nav (walk-through).
 * OWNER: scenes module.
 */

export type VignettePropKind = 'traveler' | 'scout' | 'campfire' | 'tuft' | 'satchel' | 'cart';

export interface VignettePropOpts {
  kind: VignettePropKind;
  /** Name shown in the prompt (and the hold label). */
  name: string;
  /** Prompt text (called per frame: it follows the phase). */
  prompt: () => string;
  /** F can reach it now (phase gates). */
  canUse: () => boolean;
  /** F pressed (or the hold finished). */
  onUse: () => void;
  /** Hold length in seconds (the cart): F held that long within range. */
  holdSec?: number;
}

const CUBE = new THREE.BoxGeometry(1, 1, 1);
const WHEEL = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8);

export class VignetteProp extends InteractableProp {
  readonly propKind: VignettePropKind;
  private readonly hold: HoldF | null;

  constructor(id: number, private readonly o: VignettePropOpts) {
    super(id);
    this.propKind = o.kind;
    const figure = o.kind === 'traveler' || o.kind === 'scout';
    this.interactRange = figure ? 3.6 : 3;
    this.radius = 0.5;
    this.height = figure ? 2 : 1.2;
    this.hold = o.holdSec && o.holdSec > 0 ? new HoldF(o.holdSec, 3.5) : null;
  }

  get interactPrompt(): string {
    if (this.hold?.running) return `${this.o.name} – kaldırılıyor...`;
    return this.o.prompt();
  }

  canInteract(_p: Player): boolean {
    return this.o.canUse();
  }

  async load(): Promise<void> {
    const root = this.buildModel();
    this.object3d.add(root);
    this.model = root;
  }

  interact(p: Player): void {
    if (this.hold) {
      if (this.hold.running) return;
      this.hold.start(p, this.position.x, this.position.z);
      G.ui?.toast(`${this.o.name} kaldırılıyor... F'yi basılı tut.`, 'info');
      return;
    }
    this.o.onUse();
  }

  protected animate(dt: number): void {
    if (!this.hold || !this.hold.holderPlayer) return;
    const s = this.hold.tick(dt);
    if (s === 'done') {
      this.hold.reset();
      this.o.onUse();
    } else if (s === 'cancel') {
      this.hold.reset();
    }
  }

  private buildModel(): THREE.Group {
    const g = new THREE.Group();
    const add = (color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, emissive = 0): THREE.Mesh => {
      const m = new THREE.Mesh(CUBE, new THREE.MeshLambertMaterial({ color, emissive }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    switch (this.propKind) {
      case 'traveler':
      case 'scout': {
        const cloth = this.propKind === 'scout' ? 0x4a6a3a : 0x7a5a8a;
        add(cloth, 0, 0.55, 0, 0.5, 0.9, 0.36);
        add(cloth, 0, 1.25, 0, 0.36, 0.2, 0.3);
        add(0xe0b890, 0, 1.5, 0, 0.3, 0.3, 0.3);
        // a bandage on the arm (traveler) or a bow (scout)
        if (this.propKind === 'traveler') add(0xf2f0e6, -0.3, 0.7, 0, 0.14, 0.3, 0.14);
        else add(0x6a4a2a, 0.34, 0.7, 0, 0.08, 1.0, 0.08);
        break;
      }
      case 'campfire': {
        add(0x6a4a28, -0.2, 0.08, 0, 0.5, 0.14, 0.14);
        add(0x6a4a28, 0.2, 0.08, 0, 0.14, 0.14, 0.5);
        add(0xff7a1a, 0, 0.32, 0, 0.3, 0.4, 0.3, 0xff5a10);
        add(0xffc040, 0, 0.5, 0, 0.16, 0.3, 0.16, 0xffa030);
        break;
      }
      case 'tuft': {
        add(0x3f7a34, 0, 0.18, 0, 0.5, 0.36, 0.5);
        add(0x4f8f3e, 0.2, 0.3, 0.1, 0.22, 0.24, 0.22);
        add(0xf4f2e8, -0.12, 0.46, -0.05, 0.1, 0.1, 0.1);
        add(0xf4f2e8, 0.14, 0.44, -0.12, 0.1, 0.1, 0.1);
        break;
      }
      case 'satchel': {
        add(0x7a5530, 0, 0.14, 0, 0.42, 0.26, 0.26);
        add(0x4a3018, 0, 0.3, 0, 0.44, 0.04, 0.28);
        break;
      }
      case 'cart': {
        add(0x7a5a30, 0, 0.7, 0, 1.6, 0.14, 1.0);
        add(0x5a4020, 0, 1.0, 0, 1.6, 0.5, 0.08);
        add(0x5a4020, 0, 1.0, 0.46, 1.6, 0.5, 0.08);
        add(0x5a4020, 0.78, 1.0, 0, 0.08, 0.5, 1.0);
        add(0x5a4020, -0.78, 1.0, 0, 0.08, 0.5, 1.0);
        // wheels on both sides of the bed (axis along z)
        for (const sz of [-0.62, 0.62]) {
          const w = new THREE.Mesh(WHEEL, new THREE.MeshLambertMaterial({ color: 0x3a2a18 }));
          w.rotation.x = Math.PI / 2;
          w.position.set(0, 0.42, sz);
          g.add(w);
        }
        break;
      }
    }
    return g;
  }
}
