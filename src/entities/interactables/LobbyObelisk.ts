import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { propUrl } from '../../scenes/SceneKit';

/**
 * Buluşma Taşı (lobby obelisk): the online-rooms hub. The five slot stones light up for every party member
 * (yourself + connected peers). Interact opens the party / server browser panel.
 * OWNER: scenes module.
 */
export class LobbyObelisk extends InteractableProp {
  private crystal: THREE.Object3D | null = null;
  private slots: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
  private lightRef: PropGlow | null = null;
  private lit = 1;
  private litAnim = [0, 0, 0, 0, 0];
  private poll = 0;
  private unsub: (() => void) | null = null;

  constructor(id: number) {
    super(id);
    this.interactRange = 4.4;
    this.blockRadius = 1.5;
    this.radius = 1.6;
    this.height = 4.4;
  }

  get interactPrompt(): string {
    return 'Buluşma Taşı: Online Odalar';
  }

  /** anchor: the builder's own lobby_obelisk (already animated + lit); without it this entity renders its own. */
  async load(anchor?: THREE.Object3D): Promise<void> {
    let m: THREE.Object3D;
    if (anchor) {
      this.adoptModel(anchor);
      m = anchor;
    } else {
      m = await this.loadModel(propUrl('lobby_obelisk'), { ownMaterials: true });
      this.crystal = m.getObjectByName('obelisk_crystal') ?? null;
    }
    for (let i = 1; i <= 5; i++) {
      const mesh = m.getObjectByName(`slot_${i}`) as THREE.Mesh | undefined;
      if (!mesh || !mesh.isMesh) continue;
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      const mat = src.clone(); // shared across slots in the file: each needs its own
      mesh.material = mat;
      this.slots.push({ mesh, mat });
    }
    if (!anchor) this.lightRef = this.addLight(0x6aa8ff, 24, 14, this.nodeLocal('light_0', new THREE.Vector3(0, 3.6, 0)));
    this.refreshCount();
    this.unsub = G.events.on('party:changed', () => this.refreshCount());
  }

  private refreshCount(): void {
    const peers = G.net?.peers?.size ?? 0;
    this.lit = Math.max(1, Math.min(5, peers)); // NetSession.peers already includes the local peer
    this.setLabel(
      `<div class="efs-wl"><div class="n" style="color:#9fd0ff">Buluşma Taşı</div><div class="s">Online odalar · Grup ${this.lit}/5</div></div>`,
      4.9,
      'efs-wl-wrap',
      45,
    );
  }

  interact(_player: Player): void {
    G.audio.play('ui_open');
    G.ui.openPanel('party');
  }

  protected animate(dt: number): void {
    const t = this.time;
    this.poll -= dt;
    if (this.poll <= 0) {
      this.poll = 1.0;
      const peers = G.net?.peers?.size ?? 0;
      const want = Math.max(1, Math.min(5, peers));
      if (want !== this.lit) this.refreshCount();
    }
    if (this.crystal) this.crystal.rotation.y += dt * 0.8;
    this.slots.forEach((s, i) => {
      this.litAnim[i] += ((i < this.lit ? 1 : 0.08) - this.litAnim[i]) * Math.min(1, dt * 3);
      s.mat.emissiveIntensity = 0.1 + this.litAnim[i] * (1.4 + Math.sin(t * 2 + i) * 0.25);
    });
    if (this.lightRef) this.lightRef.intensity = 20 + this.lit * 2.5 + Math.sin(t * 2.4) * 3;
  }

  onRemoved(): void {
    this.unsub?.();
    this.unsub = null;
    super.onRemoved();
  }
}
