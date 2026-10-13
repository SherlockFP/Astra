import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import type { VfxHandle } from '../../vfx/VFX';
import { G } from '../../game/G';
import { propUrl } from '../../scenes/SceneKit';

export type CursedChestState = 'ready' | 'active' | 'cooldown';

/**
 * Lanetli Sandık (GDD_CONTENT 1.8): a black, purple-smoking chest in the open world. Opening it starts a 30 s wave event that the
 * scene's ZoneEvents (host) runs; this entity is only the visual + the interaction + the 10 minute cooldown state.
 * OWNER: scenes module.
 */
export class CursedChest extends InteractableProp {
  readonly index: number;
  state: CursedChestState = 'ready';
  private cooldownEnd = 0;
  private lid: THREE.Object3D | null = null;
  private lidT = 0;
  private fx: VfxHandle | null = null;
  private fxPos = new THREE.Vector3(0, 0.9, 0);
  private lightRef: PropGlow | null = null;
  private mats: THREE.MeshStandardMaterial[] = [];
  private onOpen: (c: CursedChest) => void;
  private labelTimer = 0;

  constructor(id: number, opts: { index: number; onOpen: (c: CursedChest) => void }) {
    super(id);
    this.index = opts.index;
    this.onOpen = opts.onOpen;
    this.interactRange = 3.4;
    this.blockRadius = 0.8;
    this.radius = 0.9;
    this.height = 1.3;
  }

  get interactPrompt(): string {
    if (this.state === 'active') return 'Lanet uyanık...';
    if (this.state === 'cooldown') return `Sandık soğuyor (${this.cooldownLeftText()})`;
    return 'Lanetli Sandığı Aç';
  }

  canInteract(): boolean {
    return this.state !== 'active';
  }

  private cooldownLeftText(): string {
    const left = Math.max(0, Math.ceil(this.cooldownEnd - this.time));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }

  async load(): Promise<void> {
    const m = await this.loadModel(propUrl('chest_epic'), { ownMaterials: true });
    this.lid = m.getObjectByName('lid') ?? null;
    this.fxPos = this.nodeLocal('loot_fx', new THREE.Vector3(0, 0.9, 0));
    // black wood, violet glow
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (!mat || !mat.color) continue;
        mat.color.multiply(new THREE.Color(0x4a3a68));
        if (mat.emissive) {
          mat.emissive.lerp(new THREE.Color(0x6a28b0), 0.55);
          mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, 0.55);
        }
        this.mats.push(mat);
      }
    });
    this.lightRef = this.addLight(0x9a50ff, 7, 9, new THREE.Vector3(0, 1.3, 0.3));
    this.refreshLabel();
  }

  onAdded(world: import('../../world/World').World): void {
    super.onAdded(world);
    try {
      this.fx = G.vfx.spawn('curse_loop', this.object3d.localToWorld(this.fxPos.clone()), { scale: 1.1 });
    } catch {
      this.fx = null;
    }
  }

  private refreshLabel(): void {
    const sub = this.state === 'active' ? 'Dalgalar geliyor!' : this.state === 'cooldown' ? `Soğuma ${this.cooldownLeftText()}` : '30 saniyede 40 yaratığı yen';
    const col = this.state === 'ready' ? '#c58bff' : '#8a7aa0';
    this.setLabel(`<div class="efs-wl"><div class="n" style="color:${col}">Lanetli Sandık</div><div class="s">${sub}</div></div>`, 2.4, 'efs-wl-wrap', 36);
  }

  /** Called by the event runner on every peer. */
  setState(state: CursedChestState, cooldownSec = 0): void {
    this.state = state;
    if (state === 'cooldown') this.cooldownEnd = this.time + cooldownSec;
    if (state === 'active') this.lidT = 0.0001;
    if (state !== 'active') this.lidT = -1;
    this.refreshLabel();
  }

  interact(_player: Player): void {
    if (this.state !== 'ready') {
      if (this.state === 'cooldown') G.ui.toast(`Lanetli Sandık henüz soğumadı (${this.cooldownLeftText()}).`, 'info');
      return;
    }
    this.onOpen(this);
  }

  protected animate(dt: number): void {
    const t = this.time;
    if (this.state === 'cooldown') {
      this.labelTimer -= dt;
      if (this.labelTimer <= 0) {
        this.labelTimer = 1;
        if (t >= this.cooldownEnd) this.setState('ready');
        else this.refreshLabel();
      }
    }
    if (this.lid) {
      if (this.state === 'active') {
        this.lidT = Math.min(1, (this.lidT > 0 ? this.lidT : 0.0001) + dt / 0.5);
        this.lid.rotation.x = -1.5 * Math.min(1, this.lidT) + Math.sin(t * 22) * 0.025;
      } else if (this.lid.rotation.x < -0.01) {
        this.lid.rotation.x += (0 - this.lid.rotation.x) * Math.min(1, dt * 4);
      }
    }
    const pulse = this.state === 'active' ? 1.4 + Math.sin(t * 9) * 0.4 : this.state === 'ready' ? 0.55 + Math.sin(t * 2.2) * 0.15 : 0.15;
    for (const m of this.mats) if (m.emissive) m.emissiveIntensity = pulse;
    if (this.lightRef) this.lightRef.intensity = (this.state === 'active' ? 22 : this.state === 'ready' ? 7 : 2) + Math.sin(t * 5) * 1.5;
  }

  onRemoved(): void {
    this.fx?.stop();
    this.fx = null;
    super.onRemoved();
  }
}
