import * as THREE from 'three';
import { patchPSX } from '../render/psx';
import { mix, rnd, v3, type Fx } from './Fx';

/**
 * Visual-only projectiles. `object` is moved by the combat module; our trail/core particles are emitted from the
 * object's world position every frame (called by combat via update(dt), or automatically by VFX.update when it forgets).
 * Glowing cores are immediate-mode particles; solid projectiles (arrows, daggers, rocks...) are tiny PSX meshes.
 */

interface Step {
  fx: Fx;
  p: THREE.Vector3;      // world position
  dir: THREE.Vector3;    // travel direction (normalised, zero when still)
  speed: number;
  t: number;
  dt: number;
  s: number;
  rate(perSec: number): number;
}

type StepFn = (o: Step) => void;

const solid = (color: number, emissive = 0x000000, ei = 0): THREE.Material =>
  patchPSX(new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei }));

const MAT = {
  wood: solid(0x8a6238),
  steel: solid(0xb8c0cc, 0x202428, 0.3),
  white: solid(0xe8e4d8),
  bone: solid(0xe6dcc0, 0x201c14, 0.2),
  rock: solid(0x7a7468),
  dagger: solid(0xd0d8e8, 0x404860, 0.6),
  handle: solid(0x3a2a40, 0x201030, 0.3),
};

function makeArrow(scale: number, bolt: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const len = bolt ? 0.7 : 1.0;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(bolt ? 0.035 : 0.022, bolt ? 0.035 : 0.022, len, 5), MAT.wood);
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(bolt ? 0.07 : 0.05, 0.18, 5), MAT.steel);
  head.rotation.x = Math.PI / 2;
  head.position.z = len / 2 + 0.07;
  g.add(shaft, head);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.1, 0.16), MAT.white);
    fin.position.z = -len / 2 + 0.07;
    fin.rotation.z = (i * Math.PI * 2) / 3;
    fin.position.x = Math.sin(fin.rotation.z) * 0.04;
    fin.position.y = Math.cos(fin.rotation.z) * 0.04;
    g.add(fin);
  }
  g.scale.setScalar(scale);
  return g;
}

function makeDagger(scale: number): THREE.Object3D {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.42), MAT.dagger);
  blade.position.z = 0.2;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), MAT.handle);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.16), MAT.handle);
  grip.position.z = -0.1;
  g.add(blade, guard, grip);
  const spin = new THREE.Group();
  spin.add(g);
  spin.scale.setScalar(scale);
  spin.userData.spin = { axis: 'x', speed: 24 };
  return spin;
}

function makeBone(scale: number): THREE.Object3D {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), MAT.bone);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  for (const z of [-0.25, 0.25])
    for (const x of [-0.05, 0.05]) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), MAT.bone);
      k.position.set(x, 0, z);
      g.add(k);
    }
  const spin = new THREE.Group();
  spin.add(g);
  spin.scale.setScalar(scale);
  spin.userData.spin = { axis: 'x', speed: 14 };
  return spin;
}

function makeRock(scale: number): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), MAT.rock);
  m.scale.set(1, 0.85, 1.1);
  const spin = new THREE.Group();
  spin.add(m);
  spin.scale.setScalar(scale);
  spin.userData.spin = { axis: 'xy', speed: 9 };
  return spin;
}

const sprite = (fx: Fx, o: Step, tex: string, size: number, c0: number, c1: number, glow: number, a: number, rotv = 0) =>
  fx.add.spawn({ tex, at: o.p, size: size * o.s, life: 1, c0, c1, glow, a, rot: o.t * rotv, oneFrame: true });

/** Trail particles pushed backwards from the head. */
function trailBack(o: Step): [number, number, number] {
  return [-o.dir.x * Math.min(o.speed, 14) * 0.3, -o.dir.y * Math.min(o.speed, 14) * 0.3, -o.dir.z * Math.min(o.speed, 14) * 0.3];
}

const SPECS: Record<string, { mesh?: (s: number) => THREE.Object3D; step: StepFn }> = {
  fire_projectile: {
    step(o) {
      const { fx } = o;
      sprite(fx, o, 'glow', 1.5, 0xff6a14, 0xffc060, 1.5, 0.8);
      sprite(fx, o, 'fire-01', 0.95, 0xffffff, 0xffd080, 2.2, 1, 7);
      sprite(fx, o, 'star-05', 0.6, 0xffffff, 0xffe0a0, 2.6, 0.9, -4);
      const n = o.rate(70);
      const back = trailBack(o);
      for (let i = 0; i < n; i++)
        fx.add.spawn({ tex: ['flame-01', 'flame-02', 'fire-02'], at: [o.p.x + rnd(-0.15, 0.15), o.p.y + rnd(-0.15, 0.15), o.p.z + rnd(-0.15, 0.15)], vel: back, life: [0.3, 0.6], size: [0.5 * o.s, 0.8 * o.s], grow: 0.3, c0: 0xffa83a, c1: 0xc02000, glow: 1.35, a: 0.7, fi: 0.05, fp: 1.1, spin: [-2, 2] });
      const m = o.rate(26);
      for (let i = 0; i < m; i++) fx.add.spawn({ tex: 'px', at: o.p, vel: [back[0] + rnd(-1, 1), back[1] + rnd(0, 1.5), back[2] + rnd(-1, 1)], life: [0.3, 0.7], size: 0.06, c0: 0xffe090, c1: 0xff3000, glow: 2.4, grav: 5, fi: 0, fp: 1 });
      fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], n: o.rate(24), at: o.p, vel: [back[0] * 0.5, 0.5, back[2] * 0.5], life: [0.5, 0.9], size: [0.5, 0.8], grow: 2, c0: 0x3a3634, c1: 0x0e0c0c, a: 0.35, fi: 0.1, fp: 1.4 });
      fx.light(o.p, 0xff7a20, 22, 0.1, 8);
    },
  },
  frost_projectile: {
    step(o) {
      const { fx } = o;
      sprite(fx, o, 'glow', 1.4, 0x6ac8ff, 0xc8f0ff, 1.5, 0.75);
      sprite(fx, o, 'star-02', 0.85, 0xffffff, 0xbfeaff, 2.4, 1, 3);
      fx.add.spawn({ tex: 'shard', at: o.p, size: 0.5 * o.s, asp: 1.8, life: 1, c0: 0xffffff, c1: 0x9fe0ff, glow: 2, a: 1, rot: o.t * 9, oneFrame: true });
      const back = trailBack(o);
      fx.add.spawn({ tex: ['star-01', 'cross', 'star-03'], n: o.rate(50), at: o.p, jit: 0.2, vel: [back[0] * 0.6, back[1] * 0.6, back[2] * 0.6], life: [0.3, 0.6], size: [0.14, 0.28], c0: 0xffffff, c1: 0x8fdcff, glow: 2.4, fi: 0.05, fp: 1.2 });
      fx.alpha.spawn({ tex: ['smoke-02', 'smoke-01'], n: o.rate(24), at: o.p, vel: back, life: [0.4, 0.8], size: [0.5, 0.8], grow: 1.8, c0: 0xeaf8ff, c1: 0x80b8e0, a: 0.3, fi: 0.1, fp: 1.4 });
      fx.light(o.p, 0x7ad0ff, 16, 0.1, 7);
    },
  },
  lightning_projectile: {
    step(o) {
      const { fx } = o;
      sprite(fx, o, 'glow', 1.4, 0x8ab8ff, 0xffffff, 1.6, 0.7);
      sprite(fx, o, 'lightning-01', 1.5 + 0.3 * Math.sin(o.t * 40), 0xffffff, 0xb8d8ff, 2.4, 0.9, rnd(0, 6));
      sprite(fx, o, 'star-05', 0.7, 0xffffff, 0xffffff, 2.8, 0.9, 10);
      if (o.rate(18) > 0) {
        const a = rnd(0, 6.28);
        const l = rnd(0.5, 1.1) * o.s;
        fx.lightning(o.p, v3(o.p.x + Math.cos(a) * l, o.p.y + rnd(-0.5, 0.5), o.p.z + Math.sin(a) * l), 0xb8d8ff, 0.09, 0.06, { segs: 4, amp: 0.2 });
      }
      const back = trailBack(o);
      fx.add.spawn({ tex: 'streak', mode: 'stretch', n: o.rate(40), at: o.p, vel: back, speed: [0, 3], life: [0.12, 0.25], size: 0.08, asp: 1.2, c0: 0xffffff, c1: 0x9ac4ff, glow: 3, fi: 0, fp: 1 });
      fx.light(o.p, 0x9ac4ff, 20, 0.08, 8);
    },
  },
  shadow_projectile: {
    step(o) {
      const { fx } = o;
      fx.alpha.spawn({ tex: 'smoke-01', at: o.p, size: 1.1 * o.s, life: 1, c0: 0x1a0c2a, c1: 0x07030e, a: 0.9, rot: o.t * 3, oneFrame: true });
      sprite(fx, o, 'glow', 1.3, 0x8a40ff, 0xc890ff, 1.5, 0.55);
      sprite(fx, o, 'star-04', 0.6, 0xf0e0ff, 0xc890ff, 2.4, 0.9, 5);
      const back = trailBack(o);
      fx.alpha.spawn({ tex: ['smoke-01', 'smoke-04'], n: o.rate(30), at: o.p, jit: 0.15, vel: back, life: [0.5, 0.9], size: [0.5, 0.9], grow: 1.8, c0: 0x3a2060, c1: 0x07030e, a: 0.55, fi: 0.1, fp: 1.4 });
      fx.add.spawn({ tex: 'wisp', n: o.rate(20), at: o.p, jit: 0.15, vel: [back[0], back[1] + 0.4, back[2]], life: [0.4, 0.7], size: [0.4, 0.65], asp: 1.6, c0: 0xe0c8ff, c1: 0x7a30d0, glow: 1.6, a: 0.7, fi: 0.1, fp: 1.4 });
    },
  },
  poison_projectile: {
    step(o) {
      const { fx } = o;
      sprite(fx, o, 'glow', 1.3, 0x58d020, 0xc8ff90, 1.5, 0.7);
      fx.alpha.spawn({ tex: 'bubble', at: o.p, size: 0.75 * o.s, life: 1, c0: 0xd0ff90, c1: 0x58d020, a: 0.95, oneFrame: true });
      const back = trailBack(o);
      fx.add.spawn({ tex: 'drop', mode: 'stretch', n: o.rate(34), at: o.p, jit: 0.1, vel: [back[0] * 0.4, back[1] * 0.4 - 1, back[2] * 0.4], life: [0.3, 0.6], size: 0.07, asp: 1.3, stretch: 0.05, c0: 0xc8ff90, c1: 0x30a010, glow: 1.5, grav: 12, fi: 0, fp: 1 });
      fx.alpha.spawn({ tex: ['smoke-01', 'smoke-02'], n: o.rate(24), at: o.p, vel: back, life: [0.5, 0.9], size: [0.5, 0.9], grow: 1.8, c0: 0x6ad030, c1: 0x153a0a, a: 0.35, fi: 0.1, fp: 1.4 });
    },
  },
  holy_projectile: {
    step(o) {
      const { fx } = o;
      sprite(fx, o, 'glow', 1.5, 0xffd860, 0xfff2c0, 1.6, 0.75);
      sprite(fx, o, 'magic-flare-01', 1.2, 0xffffff, 0xffe28a, 2.6, 0.9, 3);
      sprite(fx, o, 'star-05', 0.7, 0xffffff, 0xffffff, 2.8, 0.9, -5);
      const back = trailBack(o);
      fx.add.spawn({ tex: ['star-01', 'cross', 'star-04', 'flare-01'], n: o.rate(44), at: o.p, jit: 0.2, vel: [back[0] * 0.7, back[1] * 0.7 + 0.3, back[2] * 0.7], life: [0.4, 0.8], size: [0.12, 0.26], c0: 0xffffff, c1: 0xffd24a, glow: 2.6, fi: 0.05, fp: 1.1 });
      fx.light(o.p, 0xffd870, 18, 0.1, 8);
    },
  },
  arcane_projectile: {
    step(o) {
      const { fx } = o;
      sprite(fx, o, 'glow', 1.4, 0xd040ff, 0xff90ff, 1.6, 0.7);
      sprite(fx, o, 'magic-circle-02', 1.2, 0xe880ff, 0xffc0ff, 1.8, 0.8, 4);
      sprite(fx, o, 'star-04', 0.8, 0xffffff, 0xffc0ff, 2.6, 1, -6);
      const back = trailBack(o);
      fx.add.spawn({ tex: ['star-01', 'star-03', 'cross'], n: o.rate(50), at: o.p, jit: 0.2, vel: [back[0] * 0.7, back[1] * 0.7, back[2] * 0.7], life: [0.35, 0.7], size: [0.12, 0.26], c0: 0xffffff, c1: 0xd050ff, glow: 2.6, spin: [-5, 5], fi: 0.05, fp: 1.1 });
      fx.light(o.p, 0xd060ff, 18, 0.1, 8);
    },
  },
  arrow_projectile: {
    mesh: (s) => makeArrow(s, false),
    step(o) {
      const back = trailBack(o);
      o.fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: o.rate(60), at: o.p, vel: back, life: [0.08, 0.18], size: 0.05 * o.s, asp: 2.4, stretch: 0.06, c0: 0xffffff, c1: 0xdde8ff, glow: 1.1, a: 0.5, fi: 0, fp: 1 });
    },
  },
  bolt_projectile: {
    mesh: (s) => makeArrow(s * 1.15, true),
    step(o) {
      const back = trailBack(o);
      o.fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: o.rate(70), at: o.p, vel: back, life: [0.1, 0.22], size: 0.07 * o.s, asp: 2.8, stretch: 0.07, c0: 0xffffff, c1: 0xfff0c0, glow: 1.6, a: 0.65, fi: 0, fp: 1 });
    },
  },
  dagger_projectile: {
    mesh: makeDagger,
    step(o) {
      const back = trailBack(o);
      o.fx.add.spawn({ tex: 'slash-04', mode: 'bb', at: o.p, size: 0.8 * o.s, life: 1, c0: 0xe0d8ff, c1: 0x8a70c0, glow: 1.4, a: 0.7, rot: o.t * 24, oneFrame: true });
      o.fx.add.spawn({ tex: 'trace-01', mode: 'stretch', n: o.rate(40), at: o.p, vel: back, life: [0.1, 0.2], size: 0.05 * o.s, asp: 2, c0: 0xffffff, c1: 0xb0a0e8, glow: 1.4, a: 0.55, fi: 0, fp: 1 });
    },
  },
  bone_projectile: {
    mesh: makeBone,
    step(o) {
      const back = trailBack(o);
      o.fx.alpha.spawn({ tex: ['smoke-01', 'smoke-03'], n: o.rate(24), at: o.p, vel: back, life: [0.3, 0.6], size: [0.3, 0.5], grow: 1.8, c0: 0xcfc6b0, c1: 0x7a7060, a: 0.3, fi: 0.1, fp: 1.4 });
      o.fx.alpha.spawn({ tex: ['chunk', 'bone'], n: o.rate(8), at: o.p, vel: [back[0], 1, back[2]], speed: [0, 1], life: [0.4, 0.8], size: 0.1, c0: 0xeee2c6, c1: 0xbfae8c, grav: 12, spin: [-8, 8], fi: 0, fp: 3 });
    },
  },
  rock_projectile: {
    mesh: makeRock,
    step(o) {
      const back = trailBack(o);
      o.fx.alpha.spawn({ tex: ['smoke-01', 'smoke-03'], n: o.rate(28), at: o.p, vel: back, life: [0.4, 0.8], size: [0.4, 0.7], grow: 1.8, c0: 0xa09480, c1: 0x5a5044, a: 0.38, fi: 0.1, fp: 1.4 });
      o.fx.alpha.spawn({ tex: ['chunk', 'px'], n: o.rate(10), at: o.p, vel: [back[0], 0.5, back[2]], speed: [0, 1.4], life: [0.4, 0.8], size: 0.1, c0: 0x8a7c6a, c1: 0x4a4036, grav: 14, spin: [-8, 8], fi: 0, fp: 3 });
    },
  },
};

export const PROJECTILE_IDS = Object.keys(SPECS);
export const isProjectileId = (id: string): boolean => id in SPECS;

export class ProjectileVisual {
  readonly object = new THREE.Group();
  lastFrame = -1;
  private last = new THREE.Vector3();
  private has = false;
  private vel = new THREE.Vector3();
  private t = Math.random() * 10;
  private carry = new Map<number, number>();
  private body: THREE.Object3D | null = null;
  disposed = false;
  private wp = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(
    private fx: Fx,
    private id: string,
    private scale: number,
    private onDispose: (v: ProjectileVisual) => void,
  ) {
    const spec = SPECS[id];
    if (spec?.mesh) {
      this.body = spec.mesh(scale);
      this.object.add(this.body);
    }
    this.object.userData.vfxProjectile = id;
  }

  /** Called by combat every frame (or automatically by VFX). */
  step(dt: number, frame: number): void {
    if (this.disposed) return;
    this.lastFrame = frame;
    const spec = SPECS[this.id];
    if (!spec) return;
    this.t += dt;
    this.object.getWorldPosition(this.wp);
    if (this.has && dt > 1e-5) this.vel.copy(this.wp).sub(this.last).divideScalar(dt);
    else this.vel.set(0, 0, 0);
    this.last.copy(this.wp);
    this.has = true;
    const speed = this.vel.length();
    if (speed > 0.5) this.dir.copy(this.vel).divideScalar(speed);
    else this.dir.set(0, 0, 0);
    if (this.body?.userData.spin) {
      const sp = this.body.userData.spin as { axis: string; speed: number };
      if (sp.axis.includes('x')) this.body.rotation.x += sp.speed * dt;
      if (sp.axis.includes('y')) this.body.rotation.y += sp.speed * 0.7 * dt;
    }
    const carry = this.carry;
    let k = 0;
    spec.step({
      fx: this.fx,
      p: this.wp,
      dir: this.dir,
      speed,
      t: this.t,
      dt,
      s: this.scale,
      rate: (perSec: number) => {
        const key = k++;
        const acc = (carry.get(key) ?? 0) + perSec * dt;
        const n = Math.floor(acc);
        carry.set(key, acc - n);
        return n;
      },
    });
  }

  update(dt: number): void {
    this.step(dt, this.fx.frame());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    // the geometries are built per visual (makeArrow / makeBone / ...); only the materials in MAT are shared
    this.object.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
    });
    this.onDispose(this);
  }
}

void mix;
