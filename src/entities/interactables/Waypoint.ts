import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { dist2D } from '../../core/utils';
import { propUrl } from '../../scenes/SceneKit';

/**
 * Diriliş Taşı (waypoint / checkpoint). Wakes up when the local player walks close (or presses F), becomes the dungeon's
 * respawn point for "Ruhunu Serbest Bırak" and glows from then on.
 * OWNER: scenes module.
 */
export class Waypoint extends InteractableProp {
  active = false;
  private crystal: THREE.Object3D | null = null;
  private crystalBase = 0;
  private ring: THREE.Object3D | null = null;
  private lightRef: PropGlow | null = null;
  private glow = 0;
  private mats: THREE.MeshStandardMaterial[] = [];
  private onActivate?: (wp: Waypoint) => void;
  /** Toast shown on the first activation (null = silent). Open-world stones announce their own name. */
  private readonly toastText: string | null;
  readonly autoRadius: number;

  constructor(id: number, opts: { active?: boolean; autoRadius?: number; onActivate?: (wp: Waypoint) => void; toast?: string | null } = {}) {
    super(id);
    this.active = opts.active ?? false;
    this.glow = this.active ? 1 : 0;
    this.autoRadius = opts.autoRadius ?? 5.5;
    this.onActivate = opts.onActivate;
    this.toastText = opts.toast === undefined ? 'Diriliş Taşı etkinleştirildi. Düşersen buradan dirileceksin.' : opts.toast;
    this.interactRange = 3.6;
    this.blockRadius = 0.9;
    this.radius = 1.0;
    this.height = 3.3;
  }

  get interactPrompt(): string {
    return this.active ? 'Diriliş Taşı (etkin)' : 'Diriliş Taşını Etkinleştir';
  }

  async load(): Promise<void> {
    const m = await this.loadModel(propUrl('waypoint_stone'), { ownMaterials: true, scale: 0.85 });
    this.crystal = m.getObjectByName('waypoint_crystal') ?? null;
    this.crystalBase = this.crystal?.position.y ?? 0;
    this.ring = m.getObjectByName('teleport_ring') ?? null;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (mat.emissive && mat.emissiveIntensity > 0) this.mats.push(mat);
      }
    });
    this.lightRef = this.addLight(0x6ad8ff, 0, 11, this.nodeLocal('light_0', new THREE.Vector3(0, 2.6, 0)));
    this.refreshLabel();
  }

  private refreshLabel(): void {
    this.setLabel(
      `<div class="efs-wl"><div class="n" style="color:${this.active ? '#8ee8ff' : '#8a97a8'}">Diriliş Taşı</div><div class="s">${this.active ? 'Etkin: buradan dirilirsin' : 'Yaklaş ve etkinleştir'}</div></div>`,
      3.9,
      'efs-wl-wrap',
      28,
    );
  }

  canInteract(): boolean {
    return !this.active;
  }

  activate(silent = false): void {
    if (this.active) return;
    this.active = true;
    this.refreshLabel();
    this.onActivate?.(this);
    if (silent) return;
    G.audio.play('buff');
    if (this.toastText) G.ui.toast(this.toastText, 'success');
    try {
      G.vfx.spawn('waypoint_glow', this.position, { scale: 1.6, duration: 2 });
      G.vfx.spawn('heal_burst', this.pointAt(0.3), { scale: 1 });
    } catch {
      /* optional */
    }
  }

  interact(_player: Player): void {
    this.activate();
  }

  protected animate(dt: number): void {
    const t = this.time;
    if (!this.active) {
      const p = G.player;
      if (p && !p.isDead && dist2D(p.position, this.position) < this.autoRadius) this.activate();
    }
    this.glow += ((this.active ? 1 : 0.12) - this.glow) * Math.min(1, dt * 2.5);
    if (this.crystal) {
      this.crystal.rotation.y += dt * (0.4 + this.glow * 1.1);
      this.crystal.position.y = this.crystalBase + Math.sin(t * 1.7) * 0.06 * (0.3 + this.glow);
    }
    if (this.ring) this.ring.rotation.y -= dt * (0.2 + this.glow * 0.8);
    for (const m of this.mats) m.emissiveIntensity = 0.25 + this.glow * 1.5;
    if (this.lightRef) this.lightRef.intensity = this.glow * (16 + Math.sin(t * 2.2) * 3);
  }
}
