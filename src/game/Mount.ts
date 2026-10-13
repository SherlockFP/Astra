import * as THREE from 'three';
import { G } from './G';
import type { Player } from '../entities/Player';
import { psxMaterial } from '../world/ProceduralAssets';

/**
 * WoW-style ground mount (local player only). Unlocked at MOUNT_LEVEL. Mounting is a MOUNT_CAST_SEC cast that is
 * cancelled by a move, damage, a skill or attack, or by entering combat. Mounted: +MOUNT_SPEED_MUL run speed (PlayerController
 * applies it), the character is lifted onto a voxel horse parented under the player, and the mount drops on attack / skill cast,
 * taking damage, entering combat, death, a scene change, or pressing the mount key again. Jumping keeps the mount.
 * Not in dungeons. Remote players do not see it (no net field carries it; local-only).
 */

export const MOUNT_LEVEL = 10;
export const MOUNT_CAST_SEC = 1.5;
export const MOUNT_SPEED_MUL = 1.6;
/** How far the character model is lifted while mounted (the saddle sits at about this height). */
export const MOUNT_LIFT = 1.1;

type MountState = 'idle' | 'casting' | 'mounted';
type DismountReason = 'key' | 'attack' | 'damage' | 'combat' | 'death' | 'scene';

/** Simple voxel horse, facing +Z like the character model. Built once per rider and reused. */
function buildHorse(): { root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  root.name = 'mount_horse';
  const coat = psxMaterial(null, { color: 0x7a4e2d, flatShading: true });
  const dark = psxMaterial(null, { color: 0x2b1d12, flatShading: true });
  const saddle = psxMaterial(null, { color: 0x8c2f1e, flatShading: true });
  const geos: THREE.BoxGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx = 0): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    root.add(m);
  };
  // body, saddle
  box(0.72, 0.6, 1.5, 0, 0.75, 0, coat);
  box(0.62, 0.08, 0.6, 0, 1.1, 0, saddle);
  // legs and hooves
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.5, 0.5]) {
      box(0.14, 0.5, 0.14, x, 0.25, z, coat);
      box(0.16, 0.08, 0.16, x, 0.04, z, dark);
    }
  }
  // neck, head, ears, mane, tail
  box(0.3, 0.62, 0.3, 0, 1.2, 0.68, coat, -0.45);
  box(0.28, 0.28, 0.5, 0, 1.44, 0.98, coat, -0.2);
  box(0.08, 0.14, 0.08, -0.09, 1.66, 0.9, dark);
  box(0.08, 0.14, 0.08, 0.09, 1.66, 0.9, dark);
  box(0.1, 0.28, 0.9, 0, 1.3, 0.4, dark, -0.3);
  box(0.12, 0.55, 0.12, 0, 0.95, -0.82, dark, 0.45);
  return {
    root,
    dispose() {
      for (const g of geos) g.dispose();
      coat.dispose();
      dark.dispose();
      saddle.dispose();
    },
  };
}

export class MountRider {
  private state: MountState = 'idle';
  private castT = 0;
  private wasInCombat = false;
  private horse: { root: THREE.Group; dispose(): void } | null = null;
  private unsubs: (() => void)[] = [];

  constructor(private readonly player: Player) {
    this.unsubs.push(
      // a skill or basic attack cancels a mount cast and drops the mount (attack / skill cast)
      G.events.on('skill:cast', (e) => {
        if (e.casterId !== this.player.id) return;
        if (this.state === 'casting') this.cancel('Büyü yaptığın için binme iptal oldu.');
        else this.dismount('attack');
      }),
      G.events.on('damage', (e) => {
        if (e.targetId !== this.player.id || !(e.amount > 0)) return;
        if (this.state === 'casting') this.cancel('Hasar aldığın için binme iptal oldu.');
        else this.dismount('damage');
      }),
      G.events.on('player:died', (e) => {
        if (e.local) this.dismount('death');
      }),
      G.events.on('scene:leaving', () => this.dismount('scene')),
    );
  }

  /** Run speed multiplier for PlayerController (walking is not boosted). */
  speedMul(): number {
    return this.state === 'mounted' ? MOUNT_SPEED_MUL : 1;
  }

  get mounted(): boolean {
    return this.state === 'mounted';
  }

  /** Called once per frame by PlayerController before movement. `moving`: a move key is held this frame. */
  update(dt: number, canInput: boolean, moving: boolean): void {
    const p = this.player;
    const press = canInput && G.input.pressed('mount');
    const inCombat = p.inCombat;
    const enteredCombat = inCombat && !this.wasInCombat;
    this.wasInCombat = inCombat;

    if (this.state === 'mounted') {
      if (press) this.dismount('key');
      else if (enteredCombat) this.dismount('combat');
      return;
    }
    if (this.state === 'casting') {
      if (press) return this.cancel('Binme iptal edildi.');
      if (moving) return this.cancel('Hareket ettiğin için binme iptal oldu.');
      if (enteredCombat) return this.cancel('Savaşa girdiğin için binme iptal oldu.');
      this.castT += dt;
      if (this.castT >= MOUNT_CAST_SEC) this.mountUp();
      return;
    }
    if (press) this.tryStart();
  }

  private tryStart(): void {
    const p = this.player;
    if (p.level < MOUNT_LEVEL) {
      G.events.emit('ui:toast', { text: `Binek Sv ${MOUNT_LEVEL}'da açılır`, kind: 'info' });
      return;
    }
    if (G.scenes?.current?.id === 'dungeon') {
      G.events.emit('ui:toast', { text: 'Zindanda binek kullanılamaz.', kind: 'warning' });
      return;
    }
    if (p.inCombat) {
      G.events.emit('ui:toast', { text: 'Savaşta binilemez.', kind: 'warning' });
      return;
    }
    if (p.isDead || p.cast || p.dodging || !p.canMove()) return;
    this.state = 'casting';
    this.castT = 0;
  }

  private cancel(text: string): void {
    this.state = 'idle';
    this.castT = 0;
    G.events.emit('ui:toast', { text, kind: 'warning' });
  }

  private mountUp(): void {
    const p = this.player;
    this.state = 'mounted';
    this.castT = 0;
    if (!this.horse) this.horse = buildHorse();
    p.object3d.add(this.horse.root);
    p.modelLift = MOUNT_LIFT;
    G.events.emit('player:mounted', { on: true });
  }

  private dismount(reason: DismountReason): void {
    if (this.state !== 'mounted') {
      if (this.state === 'casting') this.state = 'idle';
      return;
    }
    this.state = 'idle';
    this.horse?.root.removeFromParent();
    this.player.modelLift = 0;
    G.events.emit('player:mounted', { on: false });
    if (reason === 'attack' || reason === 'damage' || reason === 'combat') {
      const why = reason === 'attack' ? 'Saldırı yaptığın için' : reason === 'damage' ? 'Hasar aldığın için' : 'Savaşa girdiğin için';
      G.events.emit('ui:toast', { text: `${why} binekten indin.`, kind: 'info' });
    }
  }

  dispose(): void {
    this.dismount('scene');
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.horse?.dispose();
    this.horse = null;
  }
}
