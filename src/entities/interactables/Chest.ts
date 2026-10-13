import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { propUrl } from '../../scenes/SceneKit';

export type ChestTier = 'wood' | 'iron' | 'gold' | 'epic';

const TIER_INFO: Record<ChestTier, { name: string; color: string; light: number }> = {
  wood: { name: 'Ahşap Sandık', color: '#d6c196', light: 0xffc070 },
  iron: { name: 'Demir Sandık', color: '#6aa8ff', light: 0x6aa8ff },
  gold: { name: 'Altın Sandık', color: '#ffd24a', light: 0xffd24a },
  epic: { name: 'Destansı Sandık', color: '#c77bff', light: 0xb060ff },
};

/** Chest tier by Mythic+ key level (GDD: gold chest at the end of a run, epic from +10). */
export function chestTierForKey(keyLevel: number, difficulty?: string): ChestTier {
  if (keyLevel >= 10) return 'epic';
  if (keyLevel > 0 || difficulty === 'mythic' || difficulty === 'mythicplus') return 'gold';
  if (difficulty === 'heroic') return 'iron';
  return 'wood';
}

/**
 * Reward chest: hinged lid animation (manual, with a little bounce), `chest_open` vfx at the glowing `loot_fx` node, sound,
 * and a callback so the scene can show the run summary. The loot itself is rolled by the run controller.
 * OWNER: scenes module.
 */
export interface ChestOpts {
  tier: ChestTier;
  onOpen?: (chest: Chest, firstTime: boolean) => void;
  /** Label line under the name (default: the Mitik+ reward chest line). */
  sub?: string;
  /** Prompt once the chest is open (default: the reward chest line). */
  emptyText?: string;
  /** Restored as already opened (a personal respawn timer still runs). */
  startOpen?: boolean;
  /** No point light (open-world chests: the light budget is the builder's). */
  noLight?: boolean;
}

/**
 * Reward chest: hinged lid animation (manual, with a little bounce), `chest_open` vfx at the glowing `loot_fx` node, sound,
 * and a callback so the scene can show the run summary. The loot itself is rolled by the run controller.
 * Open-world chests (WorldPois) reuse it: they open per player and `reset()` when their respawn timer ends.
 * OWNER: scenes module.
 */
export class Chest extends InteractableProp {
  readonly tier: ChestTier;
  opened = false;
  private openT = -1;
  private lid: THREE.Object3D | null = null;
  private lightRef: PropGlow | null = null;
  private fxPos = new THREE.Vector3(0, 0.9, 0);
  private onOpen?: (chest: Chest, firstTime: boolean) => void;
  private idleGlow = 0;
  private readonly sub: string;
  private readonly emptyText: string;
  private readonly startOpen: boolean;
  private readonly noLight: boolean;

  constructor(id: number, opts: ChestOpts) {
    super(id);
    this.tier = opts.tier;
    this.onOpen = opts.onOpen;
    this.sub = opts.sub ?? 'Mitik+ ödül sandığı';
    this.emptyText = opts.emptyText ?? 'Ödülleri Gör';
    this.startOpen = !!opts.startOpen;
    this.noLight = !!opts.noLight;
    this.interactRange = 3.2;
    this.blockRadius = 0.8;
    this.radius = 0.8;
    this.height = 1.2;
  }

  get interactPrompt(): string {
    return this.opened ? this.emptyText : `${TIER_INFO[this.tier].name}'ı Aç`;
  }

  async load(): Promise<void> {
    const m = await this.loadModel(propUrl(`chest_${this.tier}`)); // static materials: the lid moves, nothing recolours
    this.lid = m.getObjectByName('lid') ?? null;
    this.fxPos = this.nodeLocal('loot_fx', new THREE.Vector3(0, 0.9, 0));
    const info = TIER_INFO[this.tier];
    if (!this.noLight) this.lightRef = this.addLight(info.light, 6, 8, new THREE.Vector3(0, 1.4, 0.4));
    if (this.startOpen) {
      this.opened = true;
      if (this.lid) this.lid.rotation.x = -1.83;
    }
    this.refreshLabel();
  }

  /** Label of a chest that is still closed (after load, and again after reset()). */
  private refreshLabel(): void {
    const info = TIER_INFO[this.tier];
    this.setLabel(`<div class="efs-wl"><div class="n" style="color:${info.color}">${info.name}</div><div class="s">${this.sub}</div></div>`, 2.1, 'efs-wl-wrap', 30);
  }

  /** Close the lid again (a respawn timer ended): the chest can be opened once more. */
  reset(): void {
    this.opened = false;
    this.openT = -1;
    if (this.lid) this.lid.rotation.x = 0;
    this.refreshLabel();
  }

  interact(_player: Player): void {
    if (this.opened) {
      this.onOpen?.(this, false);
      return;
    }
    this.opened = true;
    this.openT = 0;
    G.audio.play('chest_open');
    const wp = this.object3d.localToWorld(this.fxPos.clone());
    try {
      G.vfx.spawn('chest_open', wp, { scale: this.tier === 'epic' ? 1.6 : 1.2 });
      G.vfx.spawn('gold_sparkle', wp, { scale: 1.2 });
    } catch {
      /* vfx optional */
    }
    G.events.emit('camera:shake', { intensity: 0.12, duration: 0.25 });
    setTimeout(() => this.onOpen?.(this, true), 650);
    this.setLabel(`<div class="efs-wl"><div class="n" style="color:${TIER_INFO[this.tier].color}">Sandık Açıldı</div></div>`, 2.1, 'efs-wl-wrap', 30);
  }

  protected animate(dt: number): void {
    if (this.openT >= 0 && this.lid) {
      this.openT = Math.min(1, this.openT + dt / 0.62);
      const k = this.openT;
      // easeOutBack for a little overshoot-bounce
      const c1 = 1.9, c3 = c1 + 1;
      const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      this.lid.rotation.x = -1.83 * e;
      if (k >= 1) this.openT = -1;
    }
    if (this.lightRef) {
      const base = this.opened ? 16 : 5 + Math.sin(this.time * 3) * 1.5;
      this.idleGlow += (base - this.idleGlow) * Math.min(1, dt * 4);
      this.lightRef.intensity = this.idleGlow;
    }
  }
}
