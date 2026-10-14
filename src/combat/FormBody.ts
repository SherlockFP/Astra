/**
 * KIT Druid: the visual body of a shapeshift form (combat/Forms.ts). No animal GLB exists in public/assets/models, so each form is a
 * small voxel box rig built like game/Mount.ts's horse: Kedi (cat), Ayı (bear), Yolcu (long-legged runner), Ay Baykuşu (owl). The
 * character model is hidden while a beast is shown; a blob shadow stays. Driven from Player.update for every player (local and remote:
 * the form is a status and statuses are mirrored from the snapshot), so peers see the beast too. Rigs are cached per player and disposed
 * with it. OWNER: druid kit.
 */
import * as THREE from 'three';
import { psxMaterial } from '../world/ProceduralAssets';
import { formOf, type FormId } from './Forms';
import type { Player } from '../entities/Player';

interface Rig {
  id: FormId;
  root: THREE.Group;
  legs: THREE.Object3D[];
  tail: THREE.Object3D | null;
  head: THREE.Object3D | null;
  dispose(): void;
}

interface Cache {
  rig: Rig | null;
  shadow: THREE.Mesh | null;
  t: number;
  lunge: number;
}
const CACHE = new WeakMap<Player, Cache>();

/** Box helper bound to a group: adds a box mesh and tracks geometry / materials for disposal. */
function builder(root: THREE.Group): {
  box(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx?: number, parent?: THREE.Object3D): THREE.Mesh;
  mat(color: number, emissive?: number): THREE.MeshStandardMaterial;
  dispose(): void;
} {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  return {
    box(w, h, d, x, y, z, mat, rx = 0, parent = root) {
      const g = new THREE.BoxGeometry(w, h, d);
      geos.push(g);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      parent.add(m);
      return m;
    },
    mat(color, emissive = 0) {
      const m = psxMaterial(null, { color, flatShading: true, emissive, emissiveIntensity: emissive ? 0.6 : 1 });
      mats.push(m);
      return m;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** A leg pivot at the hip so swinging rotates the whole leg. */
function leg(b: ReturnType<typeof builder>, root: THREE.Group, x: number, y: number, z: number, w: number, h: number, mat: THREE.Material, paw: THREE.Material): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  root.add(pivot);
  b.box(w, h, w, 0, -h / 2, 0, mat, 0, pivot);
  b.box(w * 1.15, h * 0.18, w * 1.3, 0, -h + h * 0.09, w * 0.12, paw, 0, pivot);
  return pivot;
}

function buildCat(): Rig {
  const root = new THREE.Group();
  root.name = 'form_cat';
  const b = builder(root);
  const fur = b.mat(0xd9892e), belly = b.mat(0xf0d9a8), dark = b.mat(0x3a2412), eye = b.mat(0xffe27a, 0xffe27a);
  b.box(0.62, 0.62, 1.5, 0, 0.95, 0, fur);
  b.box(0.5, 0.2, 1.3, 0, 0.68, 0, belly);
  b.box(0.05, 0.12, 1.2, 0, 1.29, -0.05, dark); // spine stripe
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0.82);
  root.add(head);
  b.box(0.5, 0.46, 0.5, 0, 0.05, 0.12, fur, 0, head);
  b.box(0.3, 0.2, 0.18, 0, -0.04, 0.42, belly, 0, head);
  b.box(0.12, 0.16, 0.1, -0.17, 0.34, 0.05, fur, 0, head);
  b.box(0.12, 0.16, 0.1, 0.17, 0.34, 0.05, fur, 0, head);
  b.box(0.08, 0.06, 0.04, -0.13, 0.1, 0.38, eye, 0, head);
  b.box(0.08, 0.06, 0.04, 0.13, 0.1, 0.38, eye, 0, head);
  const tail = new THREE.Group();
  tail.position.set(0, 1.0, -0.78);
  root.add(tail);
  b.box(0.14, 0.14, 0.9, 0, 0.1, -0.4, fur, 0.5, tail);
  b.box(0.15, 0.15, 0.2, 0, 0.32, -0.8, dark, 0.5, tail);
  const legs = [leg(b, root, -0.22, 0.85, 0.55, 0.16, 0.85, fur, dark), leg(b, root, 0.22, 0.85, 0.55, 0.16, 0.85, fur, dark),
    leg(b, root, -0.22, 0.85, -0.55, 0.16, 0.85, fur, dark), leg(b, root, 0.22, 0.85, -0.55, 0.16, 0.85, fur, dark)];
  return { id: 'cat', root, legs, tail, head, dispose: b.dispose };
}

function buildBear(): Rig {
  const root = new THREE.Group();
  root.name = 'form_bear';
  const b = builder(root);
  const fur = b.mat(0x6b4426), dark = b.mat(0x2e1c10), snout = b.mat(0xb48a5a), eye = b.mat(0xffffff, 0xffffff);
  b.box(1.05, 1.0, 1.7, 0, 1.25, 0, fur);
  b.box(0.9, 0.5, 0.9, 0, 1.78, 0.5, fur); // shoulder hump
  const head = new THREE.Group();
  head.position.set(0, 1.55, 1.05);
  root.add(head);
  b.box(0.7, 0.6, 0.62, 0, 0.1, 0.18, fur, 0, head);
  b.box(0.36, 0.28, 0.3, 0, -0.04, 0.62, snout, 0, head);
  b.box(0.1, 0.1, 0.06, 0, 0.04, 0.79, dark, 0, head);
  b.box(0.16, 0.16, 0.12, -0.28, 0.46, 0.1, fur, 0, head);
  b.box(0.16, 0.16, 0.12, 0.28, 0.46, 0.1, fur, 0, head);
  b.box(0.07, 0.06, 0.04, -0.18, 0.2, 0.5, eye, 0, head);
  b.box(0.07, 0.06, 0.04, 0.18, 0.2, 0.5, eye, 0, head);
  const tail = new THREE.Group();
  tail.position.set(0, 1.2, -0.88);
  root.add(tail);
  b.box(0.2, 0.2, 0.2, 0, 0, -0.1, fur, 0, tail);
  const legs = [leg(b, root, -0.4, 0.95, 0.62, 0.34, 0.95, fur, dark), leg(b, root, 0.4, 0.95, 0.62, 0.34, 0.95, fur, dark),
    leg(b, root, -0.4, 0.95, -0.62, 0.34, 0.95, fur, dark), leg(b, root, 0.4, 0.95, -0.62, 0.34, 0.95, fur, dark)];
  return { id: 'bear', root, legs, tail, head, dispose: b.dispose };
}

function buildTravel(): Rig {
  const root = new THREE.Group();
  root.name = 'form_travel';
  const b = builder(root);
  const coat = b.mat(0x9c7a4a), light = b.mat(0xe9d7a8), dark = b.mat(0x3b2a18), horn = b.mat(0xd8c9a0), eye = b.mat(0xffffff, 0xcfe8ff);
  b.box(0.55, 0.62, 1.6, 0, 1.2, 0, coat);
  b.box(0.45, 0.2, 1.3, 0, 0.92, 0, light);
  b.box(0.26, 0.7, 0.28, 0, 1.58, 0.78, coat, -0.35); // neck
  const head = new THREE.Group();
  head.position.set(0, 1.92, 1.0);
  root.add(head);
  b.box(0.3, 0.3, 0.52, 0, 0, 0.14, coat, 0.1, head);
  b.box(0.08, 0.5, 0.08, -0.1, 0.38, -0.02, horn, -0.2, head);
  b.box(0.08, 0.5, 0.08, 0.1, 0.38, -0.02, horn, -0.2, head);
  b.box(0.06, 0.05, 0.04, -0.12, 0.08, 0.34, eye, 0, head);
  b.box(0.06, 0.05, 0.04, 0.12, 0.08, 0.34, eye, 0, head);
  const tail = new THREE.Group();
  tail.position.set(0, 1.35, -0.8);
  root.add(tail);
  b.box(0.12, 0.12, 0.45, 0, -0.05, -0.2, light, 0.6, tail);
  const legs = [leg(b, root, -0.2, 0.95, 0.62, 0.13, 1.0, coat, dark), leg(b, root, 0.2, 0.95, 0.62, 0.13, 1.0, coat, dark),
    leg(b, root, -0.2, 0.95, -0.62, 0.13, 1.0, coat, dark), leg(b, root, 0.2, 0.95, -0.62, 0.13, 1.0, coat, dark)];
  return { id: 'travel', root, legs, tail, head, dispose: b.dispose };
}

function buildMoonkin(): Rig {
  const root = new THREE.Group();
  root.name = 'form_moonkin';
  const b = builder(root);
  const feather = b.mat(0x4b4f8c), belly = b.mat(0xbfc4f0), dark = b.mat(0x1d1f3d), beak = b.mat(0xe8c050), eye = b.mat(0xbfe9ff, 0x9fd8ff), moon = b.mat(0xdfe8ff, 0xaec6ff);
  b.box(0.9, 1.35, 0.7, 0, 1.2, 0, feather);
  b.box(0.6, 0.9, 0.2, 0, 1.1, 0.32, belly);
  const head = new THREE.Group();
  head.position.set(0, 2.1, 0.05);
  root.add(head);
  b.box(0.72, 0.6, 0.62, 0, 0, 0.05, feather, 0, head);
  b.box(0.16, 0.2, 0.12, -0.26, 0.38, 0, dark, 0, head);
  b.box(0.16, 0.2, 0.12, 0.26, 0.38, 0, dark, 0, head);
  b.box(0.12, 0.14, 0.2, 0, -0.04, 0.42, beak, 0, head);
  b.box(0.14, 0.14, 0.05, -0.17, 0.08, 0.37, eye, 0, head);
  b.box(0.14, 0.14, 0.05, 0.17, 0.08, 0.37, eye, 0, head);
  b.box(0.1, 0.1, 0.05, 0, 0.36, 0.34, moon, 0, head); // crescent mark
  const tail = new THREE.Group();
  tail.position.set(0, 0.7, -0.3);
  root.add(tail);
  b.box(0.4, 0.15, 0.55, 0, -0.1, -0.2, dark, 0.5, tail);
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingL.position.set(-0.5, 1.6, 0);
  wingR.position.set(0.5, 1.6, 0);
  root.add(wingL, wingR);
  b.box(0.16, 1.2, 0.5, -0.1, -0.5, 0, feather, 0, wingL);
  b.box(0.16, 1.2, 0.5, 0.1, -0.5, 0, feather, 0, wingR);
  b.box(0.1, 0.5, 0.4, -0.12, -1.0, 0, dark, 0, wingL);
  b.box(0.1, 0.5, 0.4, 0.12, -1.0, 0, dark, 0, wingR);
  const l1 = leg(b, root, -0.18, 0.55, 0.05, 0.14, 0.55, beak, dark);
  const l2 = leg(b, root, 0.18, 0.55, 0.05, 0.14, 0.55, beak, dark);
  return { id: 'moonkin', root, legs: [l1, l2, wingL, wingR], tail, head, dispose: b.dispose };
}

const BUILD: Record<FormId, () => Rig> = { cat: buildCat, bear: buildBear, travel: buildTravel, moonkin: buildMoonkin };

function blobShadow(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  m.scale.set(0.9, 1.3, 1);
  return m;
}

function showHuman(p: Player, on: boolean): void {
  const cm = p.charModel;
  if (cm) cm.root.visible = on;
}

function drop(p: Player, c: Cache): void {
  if (c.rig) {
    c.rig.root.removeFromParent();
    c.rig.dispose();
    c.rig = null;
  }
  if (c.shadow) {
    c.shadow.removeFromParent();
    (c.shadow.material as THREE.Material).dispose();
    c.shadow.geometry.dispose();
    c.shadow = null;
  }
  showHuman(p, true);
}

/** Per-frame: show / hide the beast of the player's form and animate it (leg swing from speed, breathing, tail sway). */
export function updateFormBody(p: Player, dt: number): void {
  const f = formOf(p);
  let c = CACHE.get(p);
  if (!f && !c?.rig) return;
  if (!c) CACHE.set(p, (c = { rig: null, shadow: null, t: 0, lunge: 0 }));
  if (!f || p.isDead) {
    if (c.rig) drop(p, c);
    return;
  }
  if (c.rig && c.rig.id !== f) drop(p, c);
  if (!c.rig) {
    c.rig = BUILD[f]();
    p.object3d.add(c.rig.root);
    c.shadow = blobShadow();
    p.object3d.add(c.shadow);
  }
  showHuman(p, false);
  const rig = c.rig;
  c.t += dt;
  rig.root.position.y = p.modelLift + (p.jumpY > 0.05 ? 0 : 0);
  const speed = Math.hypot(p.velocity.x, p.velocity.z);
  const moving = speed > 0.4;
  const swing = moving ? Math.sin(c.t * Math.min(16, 5 + speed * 1.5)) * Math.min(0.8, 0.25 + speed * 0.08) : 0;
  if (rig.id === 'moonkin') {
    // wings flap lazily, the whole owl bobs
    const flap = Math.sin(c.t * (moving ? 6 : 1.6)) * (moving ? 0.5 : 0.12);
    rig.legs[2].rotation.z = -0.15 - flap;
    rig.legs[3].rotation.z = 0.15 + flap;
    rig.root.position.y += Math.sin(c.t * 2) * 0.05 + 0.1;
  } else {
    rig.legs.forEach((lg, i) => { lg.rotation.x = swing * (i === 0 || i === 3 ? 1 : -1); });
    rig.root.scale.y = 1 + Math.sin(c.t * 2.2) * 0.012;
  }
  if (rig.tail) rig.tail.rotation.y = Math.sin(c.t * 2.4) * 0.35;
  // the hidden character model still plays the attack / cast clip: the beast lunges and bites with it
  const strike = !!p.anim?.isPlayingOneShot && rig.id !== 'moonkin';
  c.lunge += ((strike ? 1 : 0) - c.lunge) * Math.min(1, dt * 18);
  rig.root.position.z = c.lunge * 0.28;
  if (rig.head) rig.head.rotation.x = moving ? 0.05 : Math.sin(c.t * 1.3) * 0.04;
  if (rig.head && c.lunge > 0.05) rig.head.rotation.x += c.lunge * 0.35;
  const sh = c.shadow;
  if (sh) sh.position.y = 0.04 - p.jumpY - p.modelLift;
}

/** Disposes the cached rig of a removed player. */
export function disposeFormBody(p: Player): void {
  const c = CACHE.get(p);
  if (c) drop(p, c);
  CACHE.delete(p);
}
