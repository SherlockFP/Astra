import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { propUrl } from '../../scenes/SceneKit';

/**
 * Güç Kaynağı (Font of Power): the Mythic+ keystone pedestal of the portal hall. The runed ring turns, shards bob, a
 * floating keystone appears in the socket when the local character holds one. Interact opens the keystone panel.
 * OWNER: scenes module.
 */
export class FontOfPower extends InteractableProp {
  private ring: THREE.Object3D | null = null;
  private shards: THREE.Object3D | null = null;
  private shardsBaseY = 0;
  private keystone: THREE.Object3D | null = null;
  private socket = new THREE.Vector3(0, 1.42, 0);
  private lightRef: PropGlow | null = null;
  private unsub: (() => void) | null = null;
  private hasKey = false;

  constructor(id: number) {
    super(id);
    this.interactRange = 3.8;
    this.blockRadius = 1.0;
    this.radius = 1.1;
    this.height = 2.2;
  }

  get interactPrompt(): string {
    return this.hasKey ? 'Güç Kaynağı: Anahtar Taşını Yerleştir' : 'Güç Kaynağı: Kadim Anahtar';
  }

  /** anchor: the builder's own font_of_power (it already animates + lights it); without it this entity renders its own. */
  async load(anchor?: THREE.Object3D): Promise<void> {
    let m: THREE.Object3D;
    if (anchor) {
      this.adoptModel(anchor);
      m = anchor;
    } else {
      m = await this.loadModel(propUrl('font_of_power'), { ownMaterials: true });
      this.ring = m.getObjectByName('rune_ring') ?? null;
      this.shards = m.getObjectByName('shards') ?? null;
      this.shardsBaseY = this.shards?.position.y ?? 0;
    }
    this.socket = this.nodeLocal('keystone_socket', this.socket);
    if (!anchor) this.lightRef = this.addLight(0xb070ff, 22, 12, this.nodeLocal('light_0', new THREE.Vector3(0, 1.8, 0)));
    this.setLabel('<div class="efs-wl"><div class="n" style="color:#d9a8ff">Güç Kaynağı</div><div class="s">Anahtar taşını burada kullan</div></div>', 3.0, 'efs-wl-wrap', 45);
    await G.assets.load(propUrl('keystone'));
    const ks = G.assets.instantiate(propUrl('keystone'));
    ks.position.copy(this.socket);
    ks.scale.setScalar(1.6);
    ks.visible = false;
    this.object3d.add(ks);
    this.keystone = ks;
    this.refreshKey();
    this.unsub = G.events.on('keystone:changed', () => this.refreshKey());
  }

  private refreshKey(): void {
    const ks = G.character?.save.mythic.keystone ?? null;
    this.hasKey = !!ks && !ks.depleted;
    if (this.keystone) this.keystone.visible = !!ks;
  }

  interact(_player: Player): void {
    if (this.hasKey) {
      G.audio.play('keystone_insert');
      try {
        G.vfx.spawn('keystone_insert', this.object3d.localToWorld(this.socket.clone()), { scale: 1 });
      } catch {
        /* optional */
      }
    }
    G.ui.openPanel('keystone', {});
  }

  protected animate(dt: number): void {
    const t = this.time;
    if (this.ring) this.ring.rotation.y += dt * 0.6;
    if (this.shards) {
      this.shards.position.y = this.shardsBaseY + Math.sin(t * 1.6) * 0.08;
      this.shards.rotation.y -= dt * 0.35;
    }
    if (this.keystone && this.keystone.visible) {
      this.keystone.position.y = this.socket.y + Math.sin(t * 2) * 0.06;
      this.keystone.rotation.y += dt * 1.2;
    }
    if (this.lightRef) this.lightRef.intensity = (this.hasKey ? 30 : 20) + Math.sin(t * 2.6) * 4;
  }

  onRemoved(): void {
    this.unsub?.();
    this.unsub = null;
    super.onRemoved();
  }
}
