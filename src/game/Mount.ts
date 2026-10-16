import * as THREE from 'three';
import { G } from './G';
import type { Player } from '../entities/Player';
import { psxMaterial } from '../world/ProceduralAssets';
import { MOUNT_BY_ID, STARTER_MOUNT_ID, type MountDef } from '../data/mounts';
import { chosenMountId } from '../systems/Mounts';

/**
 * WoW-style ground mount (local player only). Unlocked at MOUNT_LEVEL. Mounting is a MOUNT_CAST_SEC cast that is
 * cancelled by a move, damage, a skill or attack, or by entering combat. Mounted: +MOUNT_SPEED_MUL run speed (PlayerController
 * applies it), the character is lifted onto the voxel mount of the chosen one (sprint2: data/mounts.ts, six shapes) and the mount
 * drops on attack / skill cast, taking damage, entering combat, death, a scene change, or pressing the mount key again. Jumping
 * keeps the mount. Not in dungeons. Needs a learned mount (systems/Mounts.ts). Remote players see the same model: the owner sends
 * `mounted` and `mountId` in its pstate (net/Replication.ts) and the receiver shows it through setRemoteMounted().
 */

export const MOUNT_LEVEL = 10;
export const MOUNT_CAST_SEC = 1.5;
export const MOUNT_SPEED_MUL = 1.6;
/** How far the character model is lifted while mounted (the saddle sits at about this height). */
export const MOUNT_LIFT = 1.1;

type MountState = 'idle' | 'casting' | 'mounted';
type DismountReason = 'key' | 'attack' | 'damage' | 'combat' | 'death' | 'scene';
type Model = { root: THREE.Group; dispose(): void };

/**
 * Procedural voxel mount, facing +Z like the character model. Built from boxes (one BoxGeometry per part, disposed with the model).
 * Shapes: horse (starter), wolf, ram, boar, stag (glowing crystal antlers), drake (small ground dragon, wings folded).
 */
function buildMount(def: MountDef): Model {
  const root = new THREE.Group();
  root.name = 'mount_' + def.id;
  const mats: THREE.Material[] = [];
  const own = <T extends THREE.Material>(m: T): T => {
    mats.push(m);
    return m;
  };
  const coat = own(psxMaterial(null, { color: def.color, flatShading: true }));
  const trim = own(psxMaterial(null, { color: def.accent, flatShading: true }));
  const glow = own(psxMaterial(null, { color: def.accent, flatShading: true, emissive: def.glow || 0x000000, emissiveIntensity: 0.9 }));
  const geos: THREE.BoxGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx = 0, rz = 0): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    root.add(m);
  };
  const legs = (x: number, y: number, z: number, w: number, h: number, mat: THREE.Material, hoof: THREE.Material | null): void => {
    for (const sx of [-x, x]) {
      for (const sz of [-z, z]) {
        box(w, h, w, sx, y, sz, mat);
        if (hoof) box(w + 0.03, 0.08, w + 0.03, sx, 0.04, sz, hoof);
      }
    }
  };
  const dark = trim;

  switch (def.shape) {
    case 'horse': {
      const saddle = own(psxMaterial(null, { color: 0x8c2f1e, flatShading: true }));
      const hoof = own(psxMaterial(null, { color: 0x2b1d12, flatShading: true }));
      box(0.72, 0.6, 1.5, 0, 0.75, 0, coat);
      box(0.62, 0.08, 0.6, 0, 1.1, 0, saddle);
      legs(0.24, 0.25, 0.5, 0.14, 0.5, coat, hoof);
      box(0.3, 0.62, 0.3, 0, 1.2, 0.68, coat, -0.45);
      box(0.28, 0.28, 0.5, 0, 1.44, 0.98, coat, -0.2);
      box(0.08, 0.14, 0.08, -0.09, 1.66, 0.9, dark);
      box(0.08, 0.14, 0.08, 0.09, 1.66, 0.9, dark);
      box(0.1, 0.28, 0.9, 0, 1.3, 0.4, dark, -0.3);
      box(0.12, 0.55, 0.12, 0, 0.95, -0.82, dark, 0.45);
      break;
    }
    case 'wolf': {
      box(0.56, 0.5, 1.2, 0, 0.6, 0, coat);
      legs(0.2, 0.3, 0.45, 0.13, 0.6, coat, dark);
      box(0.36, 0.4, 0.3, 0, 0.86, 0.6, coat, -0.3);
      box(0.34, 0.3, 0.46, 0, 0.98, 0.95, coat);
      box(0.2, 0.14, 0.3, 0, 0.9, 1.25, trim);
      box(0.1, 0.16, 0.08, -0.1, 1.2, 0.85, dark);
      box(0.1, 0.16, 0.08, 0.1, 1.2, 0.85, dark);
      box(0.14, 0.14, 0.62, 0, 0.86, -0.85, trim, 0.6);
      break;
    }
    case 'ram': {
      box(0.8, 0.7, 1.1, 0, 0.85, 0, coat);
      box(0.92, 0.3, 1.18, 0, 1.15, 0, trim);
      legs(0.25, 0.3, 0.4, 0.15, 0.6, dark, null);
      box(0.3, 0.3, 0.36, 0, 1.1, 0.8, dark);
      box(0.1, 0.1, 0.3, -0.2, 1.36, 0.74, trim, 0, 0.5);
      box(0.1, 0.1, 0.3, 0.2, 1.36, 0.74, trim, 0, -0.5);
      box(0.1, 0.1, 0.1, 0, 1.0, -0.6, coat);
      break;
    }
    case 'boar': {
      box(0.8, 0.6, 1.3, 0, 0.7, 0, coat);
      box(0.14, 0.16, 1.3, 0, 1.03, 0, dark);
      box(0.5, 0.45, 0.5, 0, 0.72, 0.9, coat);
      box(0.3, 0.25, 0.25, 0, 0.66, 1.2, dark);
      box(0.08, 0.08, 0.18, -0.14, 0.55, 1.25, glow);
      box(0.08, 0.08, 0.18, 0.14, 0.55, 1.25, glow);
      box(0.12, 0.12, 0.06, -0.2, 1.05, 0.8, dark);
      box(0.12, 0.12, 0.06, 0.2, 1.05, 0.8, dark);
      legs(0.28, 0.25, 0.45, 0.18, 0.5, dark, null);
      box(0.06, 0.06, 0.3, 0, 0.9, -0.75, dark);
      break;
    }
    case 'stag': {
      box(0.66, 0.6, 1.4, 0, 0.95, 0, coat);
      legs(0.22, 0.45, 0.5, 0.13, 0.9, coat, dark);
      box(0.26, 0.6, 0.26, 0, 1.35, 0.7, coat, -0.5);
      box(0.24, 0.26, 0.44, 0, 1.62, 1.0, coat);
      box(0.12, 0.1, 0.2, 0, 1.56, 1.3, trim);
      // magitech: glowing flank plates and crystal antlers
      box(0.04, 0.3, 0.3, -0.34, 0.95, 0, glow);
      box(0.04, 0.3, 0.3, 0.34, 0.95, 0, glow);
      for (const sx of [-1, 1]) {
        box(0.06, 0.5, 0.06, sx * 0.14, 1.95, 0.95, trim, 0, sx * 0.2);
        box(0.3, 0.06, 0.06, sx * 0.22, 2.15, 0.95, trim);
        box(0.1, 0.1, 0.1, sx * 0.36, 2.2, 0.95, glow);
      }
      box(0.12, 0.5, 0.12, 0, 0.9, -0.82, dark, 0.4);
      break;
    }
    case 'drake': {
      box(0.7, 0.55, 1.5, 0, 0.8, 0, coat);
      box(0.5, 0.12, 1.3, 0, 0.55, 0, glow);
      legs(0.25, 0.25, 0.45, 0.16, 0.5, trim, null);
      box(0.3, 0.4, 0.4, 0, 1.05, 0.8, coat, -0.6);
      box(0.42, 0.3, 0.5, 0, 1.25, 1.1, coat);
      box(0.2, 0.2, 0.2, 0, 1.22, 1.45, trim);
      box(0.06, 0.2, 0.06, -0.14, 1.45, 1.0, trim);
      box(0.06, 0.2, 0.06, 0.14, 1.45, 1.0, trim);
      box(0.08, 0.04, 0.08, -0.14, 1.36, 1.3, glow);
      box(0.08, 0.04, 0.08, 0.14, 1.36, 1.3, glow);
      // wings folded along the back, tail tapering behind
      box(0.08, 0.4, 0.9, -0.4, 1.12, -0.1, trim, 0, 0.35);
      box(0.08, 0.4, 0.9, 0.4, 1.12, -0.1, trim, 0, -0.35);
      box(0.22, 0.22, 0.9, 0, 0.75, -1.0, coat);
      box(0.14, 0.14, 0.6, 0, 0.7, -1.6, coat);
      box(0.08, 0.08, 0.08, 0, 0.9, -1.0, glow);
      break;
    }
  }

  return {
    root,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** Mount models of remote riders (one per Player while its pstate says mounted). */
const remoteMounts = new WeakMap<Player, { id: string; model: Model }>();

/**
 * Shows (on) or removes (off) the mount of a REMOTE player, driven by its replicated `mounted` flag and `mountId` (the mount it
 * rides; the starter horse when the id is missing or unknown). Idempotent; a changed id swaps the model. The remote model is
 * lifted by MOUNT_LIFT like the local one. Removing a remote who is not mounted is a no-op.
 */
export function setRemoteMounted(player: Player, on: boolean, mountId?: string | null): void {
  const cur = remoteMounts.get(player);
  if (on) {
    const id = mountId && MOUNT_BY_ID[mountId] ? mountId : STARTER_MOUNT_ID;
    if (cur?.id === id) return;
    cur?.model.root.removeFromParent();
    cur?.model.dispose();
    const model = buildMount(MOUNT_BY_ID[id]);
    player.object3d.add(model.root);
    player.modelLift = MOUNT_LIFT;
    remoteMounts.set(player, { id, model });
    return;
  }
  if (!cur) return;
  remoteMounts.delete(player);
  cur.model.root.removeFromParent();
  cur.model.dispose();
  player.modelLift = 0;
}

export class MountRider {
  private state: MountState = 'idle';
  private castT = 0;
  private wasInCombat = false;
  private bobT = 0;
  /** Model per mount id, built on first use and kept (disposed with the rider). */
  private models = new Map<string, Model>();
  private active: Model | null = null;
  /** A summon from the action bar (`mount:summon`) counts like the mount key once. */
  private pendingSummon = false;
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
      G.events.on('mount:summon', () => {
        this.pendingSummon = true;
      }),
    );
  }

  /** Run speed multiplier for PlayerController (walking is not boosted). */
  speedMul(): number {
    return this.state === 'mounted' ? MOUNT_SPEED_MUL : 1;
  }

  get mounted(): boolean {
    return this.state === 'mounted';
  }

  /** The id of the mount this rider is on (null when on foot). */
  get mountId(): string | null {
    return this.state === 'mounted' ? this.activeId : null;
  }
  private activeId: string | null = null;

  /** Called once per frame by PlayerController before movement. `moving`: a move key is held this frame. */
  update(dt: number, canInput: boolean, moving: boolean): void {
    const p = this.player;
    const press = (canInput && G.input.pressed('mount')) || this.pendingSummon;
    this.pendingSummon = false;
    const inCombat = p.inCombat;
    const enteredCombat = inCombat && !this.wasInCombat;
    this.wasInCombat = inCombat;

    if (this.state === 'mounted') {
      this.bob(dt, moving);
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

  /** Vertical bob of the mount model: faster and bigger while running (per-mount amplitude and frequency). */
  private bob(dt: number, moving: boolean): void {
    if (!this.active || !this.activeId) return;
    const def = MOUNT_BY_ID[this.activeId];
    if (!def) return;
    this.bobT += dt * (moving ? 1 : 0.35);
    this.active.root.position.y = Math.abs(Math.sin(this.bobT * Math.PI * 2 * def.bob.hz * 0.5)) * def.bob.amp * (moving ? 1 : 0.4);
  }

  private tryStart(): void {
    const p = this.player;
    if (p.level < MOUNT_LEVEL) {
      G.events.emit('ui:toast', { text: `Binek Sv ${MOUNT_LEVEL}'da açılır`, kind: 'info' });
      return;
    }
    if (!G.character || !chosenMountId(G.character.save)) {
      G.events.emit('ui:toast', { text: 'Önce bir binek öğrenmelisin (Kuzgunkale Ahır Ustası).', kind: 'info' });
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
    const id = G.character ? chosenMountId(G.character.save) : null;
    if (!id || !MOUNT_BY_ID[id]) {
      this.state = 'idle';
      this.castT = 0;
      return;
    }
    this.state = 'mounted';
    this.castT = 0;
    this.activeId = id;
    let model = this.models.get(id);
    if (!model) {
      model = buildMount(MOUNT_BY_ID[id]);
      this.models.set(id, model);
    }
    this.active = model;
    p.object3d.add(model.root);
    p.modelLift = MOUNT_LIFT;
    G.events.emit('player:mounted', { on: true, mountId: id });
  }

  private dismount(reason: DismountReason): void {
    if (this.state !== 'mounted') {
      if (this.state === 'casting') this.state = 'idle';
      return;
    }
    this.state = 'idle';
    this.active?.root.removeFromParent();
    this.active = null;
    this.activeId = null;
    this.player.modelLift = 0;
    G.events.emit('player:mounted', { on: false, mountId: null });
    if (reason === 'attack' || reason === 'damage' || reason === 'combat') {
      const why = reason === 'attack' ? 'Saldırı yaptığın için' : reason === 'damage' ? 'Hasar aldığın için' : 'Savaşa girdiğin için';
      G.events.emit('ui:toast', { text: `${why} binekten indin.`, kind: 'info' });
    }
  }

  dispose(): void {
    this.dismount('scene');
    for (const off of this.unsubs) off();
    this.unsubs = [];
    for (const m of this.models.values()) m.dispose();
    this.models.clear();
    this.active = null;
  }
}
