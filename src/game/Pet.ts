import * as THREE from 'three';
import { G } from './G';
import type { Player } from '../entities/Player';
import { PET_BY_ID, type PetDef } from '../data/pets';
import { psxMaterial } from '../world/ProceduralAssets';
import { activePetId } from '../systems/Pets';

/**
 * WP-12 cosmetic pet follower (local character only, docs/MMO_PILLARS.md). The summoned pet (`save.pets.active`) floats
 * behind and beside the character, hops while it catches up and does nothing in combat. It is built from boxes like the
 * mount (game/Mount.ts), one of five shape families (data/pets.ts PetShape). Remote players do not see it yet (local-only).
 */

/** Offset behind (m) and beside (m) the character, in the character's own frame. */
const BEHIND = 1.2;
const SIDE = 0.9;
/** Catch-up rate (1/s) of the position lerp. */
const RATE = 6;
/** Distance (m) to the anchor under which the pet counts as standing still. */
const STILL_M = 0.08;

interface PetModel {
  root: THREE.Group;
  dispose(): void;
}

/** Builds the voxel model of one pet, facing +Z like the character. */
function buildPet(def: PetDef): PetModel {
  const root = new THREE.Group();
  root.name = `pet_${def.id}`;
  const body = psxMaterial(null, { color: def.color, flatShading: true });
  const acc = psxMaterial(null, { color: def.accent, flatShading: true });
  const geos: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): void => {
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    root.add(m);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx = 0): void =>
    add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx);
  const ball = (r: number, x: number, y: number, z: number, mat: THREE.Material): void =>
    add(new THREE.SphereGeometry(r, 8, 6), mat, x, y, z);

  switch (def.shape) {
    case 'quad':
      box(0.36, 0.28, 0.56, 0, 0.34, 0, body);
      box(0.26, 0.24, 0.24, 0, 0.44, 0.36, body);
      box(0.12, 0.1, 0.1, 0, 0.38, 0.5, acc);
      for (const x of [-0.08, 0.08]) box(0.06, 0.1, 0.05, x, 0.6, 0.34, body);
      for (const x of [-0.12, 0.12]) for (const z of [-0.2, 0.2]) box(0.08, 0.2, 0.08, x, 0.1, z, body);
      box(0.07, 0.07, 0.3, 0, 0.42, -0.4, acc, -0.5);
      break;
    case 'dragon':
      box(0.3, 0.26, 0.5, 0, 0.34, 0, body);
      box(0.24, 0.22, 0.26, 0, 0.44, 0.32, body);
      for (const x of [-0.08, 0.08]) box(0.05, 0.1, 0.05, x, 0.6, 0.3, acc);
      for (const x of [-0.4, 0.4]) box(0.5, 0.04, 0.3, x, 0.52, -0.02, acc);
      for (const x of [-0.12, 0.12]) for (const z of [-0.18, 0.18]) box(0.08, 0.14, 0.08, x, 0.08, z, body);
      box(0.07, 0.07, 0.36, 0, 0.36, -0.42, body);
      break;
    case 'bird':
      box(0.26, 0.26, 0.36, 0, 0.3, 0, body);
      box(0.2, 0.2, 0.2, 0, 0.5, 0.14, body);
      box(0.08, 0.06, 0.1, 0, 0.48, 0.3, acc);
      for (const x of [-0.16, 0.16]) box(0.04, 0.2, 0.26, x, 0.32, 0, body);
      for (const x of [-0.05, 0.05]) box(0.04, 0.1, 0.04, x, 0.05, 0, acc);
      box(0.12, 0.04, 0.16, 0, 0.3, -0.3, body);
      break;
    case 'turtle':
      box(0.5, 0.22, 0.6, 0, 0.2, 0, body);
      box(0.3, 0.04, 0.3, 0, 0.33, 0, acc);
      box(0.16, 0.14, 0.16, 0, 0.2, 0.38, acc);
      for (const x of [-0.22, 0.22]) for (const z of [-0.2, 0.2]) box(0.12, 0.08, 0.12, x, 0.05, z, acc);
      break;
    case 'orb':
      ball(0.18, 0, 0.42, 0, body);
      ball(0.09, 0, 0.42, 0, acc);
      box(0.12, 0.04, 0.12, 0, 0.2, 0, acc);
      break;
  }
  root.scale.setScalar(def.scale);
  return {
    root,
    dispose() {
      for (const g of geos) g.dispose();
      body.dispose();
      acc.dispose();
    },
  };
}

export class PetFollower {
  private model: PetModel | null = null;
  private petId: string | null = null;
  private readonly anchor = new THREE.Vector3();
  private inited = false;
  private t = 0;
  private unsubs: (() => void)[] = [];

  /** Local character: follows its own summoned pet. Remote players: net/Replication.ts sets the pet from the presence. */
  constructor(private readonly player: Player) {
    if (!player.isLocal) return;
    this.unsubs.push(
      G.events.on('pet:changed', ({ id }) => this.setPet(id)),
      G.events.on('scene:leaving', () => this.detach()),
    );
    if (G.character) this.setPet(activePetId(G.character.save));
  }

  /** The pet shown now (null = none). */
  get current(): string | null {
    return this.petId;
  }

  /** Shows the pet `id` (replacing the current model), or none for null / an unknown id. */
  setPet(id: string | null): void {
    const want = id && PET_BY_ID[id] ? id : null;
    if (want === this.petId) return;
    this.detach();
    this.model?.dispose();
    this.model = null;
    this.petId = null;
    const def = want ? PET_BY_ID[want] : undefined;
    if (!def) return;
    this.model = buildPet(def);
    this.petId = def.id;
  }

  /** Called once per frame by PlayerController. */
  update(dt: number): void {
    const m = this.model;
    const world = this.player.world;
    if (!m || !world || !(dt > 0)) return;
    const root = m.root;
    if (root.parent !== world.scene) {
      world.scene.add(root);
      this.inited = false;
    }
    root.visible = !this.player.isDead;

    // anchor behind and beside the character (its frame: forward is (sin yaw, cos yaw))
    const pp = this.player.position;
    const yaw = this.player.yaw;
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    const tx = pp.x - BEHIND * s + SIDE * c;
    const tz = pp.z - BEHIND * c - SIDE * s;
    const ty = world.groundY(tx, tz);
    if (!this.inited) {
      this.anchor.set(tx, ty, tz);
      this.inited = true;
    }
    const k = 1 - Math.exp(-RATE * dt);
    const dx = tx - this.anchor.x;
    const dz = tz - this.anchor.z;
    const dist = Math.hypot(dx, dz);
    this.anchor.x += dx * k;
    this.anchor.z += dz * k;
    this.anchor.y += (ty - this.anchor.y) * k;

    // hop while it catches up, a slow bob when it stands still
    this.t += dt;
    const hop = dist > STILL_M ? Math.abs(Math.sin(this.t * 9)) * 0.14 : Math.sin(this.t * 2) * 0.02;
    root.position.set(this.anchor.x, this.anchor.y + hop, this.anchor.z);
    root.rotation.y = yaw;
  }

  private detach(): void {
    this.model?.root.removeFromParent();
    this.inited = false;
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.detach();
    this.model?.dispose();
    this.model = null;
    this.petId = null;
  }
}
