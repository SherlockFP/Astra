import * as THREE from 'three';
import { G } from '../game/G';
import type { DamageType } from '../types/common';

/**
 * Chunky voxel impact cubes (Trove look). One InstancedMesh per element family, so a burst is one draw call per family.
 * Simulation is struct-of-arrays in preallocated Float32Arrays: a burst allocates nothing. Each cube launches out of the contact
 * point along the hit direction, falls with gravity, bounces once on the ground, tumbles, and shrinks out over its life.
 * The global cap (CHUNK_CAP live cubes) bounds the work in horde fights; bursts past it are dropped.
 */

export type ChunkFamily = 'physical' | 'fire' | 'frost' | 'arcane' | 'nature' | 'shadow' | 'holy';
export const CHUNK_FAMILIES: readonly ChunkFamily[] = ['physical', 'fire', 'frost', 'arcane', 'nature', 'shadow', 'holy'];

/** Damage type -> family pool and cube colour. Lightning reads arcane blue, poison nature green, true damage white. */
export const CHUNK_OF_TYPE: Record<DamageType, { family: ChunkFamily; color: number }> = {
  physical: { family: 'physical', color: 0xf2c24a },
  true: { family: 'physical', color: 0xffffff },
  fire: { family: 'fire', color: 0xff7a20 },
  frost: { family: 'frost', color: 0x9fe0ff },
  lightning: { family: 'arcane', color: 0xaed2ff },
  shadow: { family: 'shadow', color: 0x8a4cff },
  poison: { family: 'nature', color: 0x7aff40 },
  holy: { family: 'holy', color: 0xffe28a },
  arcane: { family: 'arcane', color: 0xd868ff },
};

const EMISSIVE: Record<ChunkFamily, number> = {
  physical: 0xffa020,
  fire: 0xff5a10,
  frost: 0x6fc8ff,
  arcane: 0xa030ff,
  nature: 0x40d030,
  shadow: 0x5a20c0,
  holy: 0xffd060,
};

/** Live cubes across all families (horde cap). */
export const CHUNK_CAP = 600;
/** Slots per family pool (7 pools x 128 = 896 allocated; CHUNK_CAP is the live limit). */
const POOL_CAP = 128;
const GRAVITY = 17;
/** Cube fraction of its life spent at full size before it shrinks out. */
const HOLD = 0.6;

const GEO = new THREE.BoxGeometry(1, 1, 1);
const WHITE = new THREE.Color(0xffffff);
const _c = new THREE.Color();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _ax = new THREE.Vector3();

interface Pool {
  readonly family: ChunkFamily;
  readonly mesh: THREE.InstancedMesh;
  n: number;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  age: Float32Array; life: Float32Array; size: Float32Array;
  qx: Float32Array; qy: Float32Array; qz: Float32Array; qw: Float32Array;
  wx: Float32Array; wy: Float32Array; wz: Float32Array;
  bounced: Uint8Array;
}

export class ChunkBursts {
  private readonly pools = new Map<ChunkFamily, Pool>();
  private total = 0;

  constructor(root: THREE.Object3D) {
    for (const family of CHUNK_FAMILIES) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0, emissive: EMISSIVE[family], emissiveIntensity: 0.85 });
      const mesh = new THREE.InstancedMesh(GEO, mat, POOL_CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.setColorAt(0, WHITE); // allocates instanceColor
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 9;
      mesh.name = `chunks-${family}`;
      root.add(mesh);
      const f = () => new Float32Array(POOL_CAP);
      this.pools.set(family, {
        family, mesh, n: 0,
        px: f(), py: f(), pz: f(), vx: f(), vy: f(), vz: f(), age: f(), life: f(), size: f(),
        qx: f(), qy: f(), qz: f(), qw: f(), wx: f(), wy: f(), wz: f(),
        bounced: new Uint8Array(POOL_CAP),
      });
    }
  }

  /** Live cube count (all families). */
  get live(): number {
    return this.total;
  }

  /**
   * Launch `count` cubes of damage type `type` from `p` along the horizontal hit direction (dx, dz; unit or zero).
   * Returns the number actually spawned (the cap may cut it short).
   */
  burst(type: DamageType, p: readonly [number, number, number], dx: number, dz: number, count: number, size: number, speed: number, life: number): number {
    const spec = CHUNK_OF_TYPE[type] ?? CHUNK_OF_TYPE.physical;
    const pool = this.pools.get(spec.family);
    if (!pool) return 0;
    const k = Math.min(Math.floor(count), CHUNK_CAP - this.total, POOL_CAP - pool.n);
    if (k <= 0) return 0;
    _c.setHex(spec.color);
    const mesh = pool.mesh;
    const sx = -dz; // lateral axis
    const sz = dx;
    for (let j = 0; j < k; j++) {
      const i = pool.n++;
      this.total++;
      const fwd = speed * (0.55 + Math.random() * 0.7);
      const lat = (Math.random() - 0.5) * speed * 0.9;
      pool.px[i] = p[0] + (Math.random() - 0.5) * 0.12;
      pool.py[i] = p[1] + (Math.random() - 0.5) * 0.12;
      pool.pz[i] = p[2] + (Math.random() - 0.5) * 0.12;
      pool.vx[i] = dx * fwd + sx * lat;
      pool.vz[i] = dz * fwd + sz * lat;
      pool.vy[i] = (1.6 + Math.random() * 2.8) * (0.6 + speed / 10);
      pool.size[i] = size * (0.75 + Math.random() * 0.5);
      pool.life[i] = life * (0.85 + Math.random() * 0.3);
      pool.age[i] = 0;
      pool.bounced[i] = 0;
      // random start orientation (unit quaternion from four uniforms, normalised in place)
      let qx = Math.random() - 0.5, qy = Math.random() - 0.5, qz = Math.random() - 0.5, qw = Math.random() - 0.5;
      const ql = Math.hypot(qx, qy, qz, qw) || 1;
      pool.qx[i] = qx / ql; pool.qy[i] = qy / ql; pool.qz[i] = qz / ql; pool.qw[i] = qw / ql;
      // tumble rate (rad/s) about a random axis
      pool.wx[i] = (Math.random() - 0.5) * 22;
      pool.wy[i] = (Math.random() - 0.5) * 22;
      pool.wz[i] = (Math.random() - 0.5) * 22;
      mesh.setColorAt(i, _c);
    }
    mesh.instanceColor!.needsUpdate = true;
    mesh.count = pool.n;
    mesh.visible = true;
    return k;
  }

  update(dt: number): void {
    if (this.total === 0) return;
    for (const pool of this.pools.values()) {
      if (pool.n === 0) continue;
      this.step(pool, dt);
      const mesh = pool.mesh;
      for (let i = 0; i < pool.n; i++) {
        const k = pool.age[i] / pool.life[i];
        const s = pool.size[i] * (k < HOLD ? 1 : Math.max(0, 1 - (k - HOLD) / (1 - HOLD)));
        _pos.set(pool.px[i], pool.py[i], pool.pz[i]);
        _q.set(pool.qx[i], pool.qy[i], pool.qz[i], pool.qw[i]);
        _scl.set(s, s, s);
        _mat.compose(_pos, _q, _scl);
        mesh.setMatrixAt(i, _mat);
      }
      mesh.count = pool.n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = pool.n > 0;
    }
  }

  /** Physics, tumble and ageing; dead cubes are swap-removed (the last cube moves into their slot). */
  private step(pool: Pool, dt: number): void {
    for (let i = pool.n - 1; i >= 0; i--) {
      pool.age[i] += dt;
      if (pool.age[i] >= pool.life[i]) {
        this.remove(pool, i);
        continue;
      }
      pool.vy[i] -= GRAVITY * dt;
      pool.px[i] += pool.vx[i] * dt;
      pool.py[i] += pool.vy[i] * dt;
      pool.pz[i] += pool.vz[i] * dt;
      const half = pool.size[i] * 0.5;
      const ground = (G.world?.groundY(pool.px[i], pool.pz[i]) ?? 0) + half;
      if (pool.py[i] < ground && pool.vy[i] < 0) {
        pool.py[i] = ground;
        if (!pool.bounced[i]) {
          // one bounce, lossy, with ground friction
          pool.vy[i] = -pool.vy[i] * 0.4;
          pool.vx[i] *= 0.6;
          pool.vz[i] *= 0.6;
          pool.bounced[i] = 1;
        } else {
          pool.vy[i] = 0;
          const f = Math.max(0, 1 - 7 * dt);
          pool.vx[i] *= f;
          pool.vz[i] *= f;
        }
      }
      // tumble: q = q * dq(axis = w / |w|, angle = |w| dt)
      const w = Math.hypot(pool.wx[i], pool.wy[i], pool.wz[i]);
      if (w > 1e-6) {
        const a = w * dt;
        _ax.set(pool.wx[i] / w, pool.wy[i] / w, pool.wz[i] / w);
        _dq.setFromAxisAngle(_ax, a);
        _q.set(pool.qx[i], pool.qy[i], pool.qz[i], pool.qw[i]).multiply(_dq);
        pool.qx[i] = _q.x; pool.qy[i] = _q.y; pool.qz[i] = _q.z; pool.qw[i] = _q.w;
      }
    }
  }

  private remove(pool: Pool, i: number): void {
    const last = pool.n - 1;
    if (i !== last) {
      pool.px[i] = pool.px[last]; pool.py[i] = pool.py[last]; pool.pz[i] = pool.pz[last];
      pool.vx[i] = pool.vx[last]; pool.vy[i] = pool.vy[last]; pool.vz[i] = pool.vz[last];
      pool.age[i] = pool.age[last]; pool.life[i] = pool.life[last]; pool.size[i] = pool.size[last];
      pool.qx[i] = pool.qx[last]; pool.qy[i] = pool.qy[last]; pool.qz[i] = pool.qz[last]; pool.qw[i] = pool.qw[last];
      pool.wx[i] = pool.wx[last]; pool.wy[i] = pool.wy[last]; pool.wz[i] = pool.wz[last];
      pool.bounced[i] = pool.bounced[last];
      const col = pool.mesh.instanceColor!.array as Float32Array;
      col[i * 3] = col[last * 3]; col[i * 3 + 1] = col[last * 3 + 1]; col[i * 3 + 2] = col[last * 3 + 2];
    }
    pool.n--;
    this.total--;
  }

  clear(): void {
    for (const pool of this.pools.values()) {
      pool.n = 0;
      pool.mesh.count = 0;
      pool.mesh.visible = false;
    }
    this.total = 0;
  }
}
