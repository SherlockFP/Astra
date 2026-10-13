import * as THREE from 'three';
import { RNG, hashString } from '../core/utils';
import { TILE_SIZE, type DungeonDef, type ZoneDef } from '../types/dungeons';
import type { VfxId } from '../types/vfx';
import { patchPSX } from '../render/psx';
import { shouldCastShadow } from '../render/shadowPolicy';
import { freezeStatic } from '../render/staticTransforms';
import type { NavGrid } from './NavGrid';
import type { GlowField } from './Glow';
import { designToPhysical, type LightPool } from './LightPool';
import { ParticleField } from './Particles';
import { canvasTexture, glowTexture, makeCanvas, psxMaterial, sharedTexture, surfaceTexture, mulHex } from './ProceduralAssets';

/**
 * Zones: floor/ground features of a room (lava lakes, bottomless pits, rune circles, ice patches, vents, bridges, daises).
 *
 * Everything works on a 2 m cell grid (half a floor tile): blocked zones (lava / pit / void / pool) turn their cells into
 * HOLES (the floor builder leaves them out and the nav grid blocks them), later `bridge` / `dais` zones turn cells into
 * DECK (walkable again, a slab replaces the floor) - exactly the "apply in array order" rule of ZoneDef. The visuals are
 * sunken animated lava / black pit shafts with stone banks, plus decals (runes, ice, vents, walkable lava) on the floor.
 * Deterministic: only depends on the DungeonDef. OWNER: world module.
 */

const T = TILE_SIZE;
const CELL = 2;
const PI = Math.PI;
const FLOOR_TOP = 0.05;
/** Distinct vent shapes (shared textures); every vent picks one and a random rotation. */
const VENT_VARIANTS = 4;

export interface BuiltZone {
  index: number;
  roomId: string;
  kind: ZoneDef['kind'];
  shape: 'rect' | 'circle';
  /** Closes nav cells (lava lake, pit...). Bridges/daises re-open them. */
  blocked: boolean;
  /** World centre + half extents (metres). For circles hx/hz are the radii. */
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  hazard: ZoneDef['hazard'] | null;
  def: ZoneDef;
  /** Point inside the zone's shape (pad grows the shape, metres). */
  contains(x: number, z: number, pad?: number): boolean;
}

export interface ZoneHost {
  def: DungeonDef;
  W: number;
  H: number;
  tileRoom(i: number, j: number): number;
  nav: NavGrid;
  root: THREE.Object3D;
  halo: GlowField;
  lights: LightPool;
  disposables: { dispose(): void }[];
  tint: number;
  spawnEmitter(id: VfxId, pos: [number, number, number], scale: number): void;
  addUpdater(fn: (dt: number, t: number) => void): void;
}

// ---------------------------------------------------------------------------
// shaders
// ---------------------------------------------------------------------------

const LIQUID_VERT = /* glsl */ `
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #include <fog_vertex>
}
`;

const LIQUID_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCrust;
uniform vec3 uGlow;
uniform float uIntensity;
uniform float uScale;
uniform float uSpeed;
uniform float uHeat;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vn(p) * a; p = p * 2.07 + vec2(17.3, 9.1); a *= 0.5; }
  return s;
}
void main() {
  vec2 p = floor(vWorld.xz * 6.0) / 6.0 * uScale;
  float t = uTime * uSpeed;
  vec2 w = vec2(fbm(p + vec2(t * 0.35, t * 0.2)), fbm(p + vec2(-t * 0.25, t * 0.3) + 5.2));
  float n = fbm(p + w * 1.8 + vec2(t * 0.1, -t * 0.07));
  float q = floor(n * 6.0) / 6.0;
  float crust = smoothstep(0.40, 0.62, q);
  vec3 hot = mix(uGlow, vec3(1.0, 0.86, 0.42), smoothstep(0.0, 0.32, 0.46 - q) * uHeat);
  vec3 col = mix(hot, uCrust, crust);
  float line = 1.0 - smoothstep(0.0, 0.05, abs(n - 0.52));
  col += uGlow * line * 0.55;
  gl_FragColor = vec4(col * uIntensity, 1.0);
  #include <fog_fragment>
}
`;

function liquidMaterial(crust: number, glow: number, intensity: number, scale: number, speed: number, heat: number): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uCrust: { value: new THREE.Color(crust) },
        uGlow: { value: new THREE.Color(glow) },
        uIntensity: { value: intensity },
        uScale: { value: scale },
        uSpeed: { value: speed },
        uHeat: { value: heat },
      },
    ]),
    vertexShader: LIQUID_VERT,
    fragmentShader: LIQUID_FRAG,
    fog: true,
    toneMapped: false,
  });
  patchPSX(m, { affine: false });
  return m;
}

// ---------------------------------------------------------------------------
// tiny mesher
// ---------------------------------------------------------------------------

class Mesher {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  private v = 0;
  get empty(): boolean { return this.idx.length === 0; }

  quad(p: number[][], n: [number, number, number], uvs: number[][], cols?: number[][]): void {
    const [a, b, c] = p;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0;
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k][0], p[k][1], p[k][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[k][0], uvs[k][1]);
      const cc = cols ? cols[k] : [1, 1, 1];
      this.col.push(cc[0], cc[1], cc[2]);
    }
    const v = this.v;
    if (flip) this.idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
    else this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.v += 4;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const SURFACE_Y: Partial<Record<ZoneDef['kind'], number>> = { lava: -0.55, pool: -0.3, ice: -0.22, pit: -7, void: -7 };

// ---------------------------------------------------------------------------
// ZoneField
// ---------------------------------------------------------------------------

export class ZoneField {
  readonly zones: BuiltZone[] = [];
  readonly zw: number;
  readonly zh: number;
  /** 0 = plain floor, 1 = hole (lava / pit), 2 = deck (bridge / dais slab). */
  readonly state: Uint8Array;
  private owner: Int16Array;
  private cells: number[][] = [];
  private mats: THREE.ShaderMaterial[] = [];
  private runes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; k: number; ph: number }[] = [];
  private seed: string;
  get any(): boolean { return this.zones.length > 0; }

  constructor(private host: ZoneHost) {
    this.zw = host.W * 2;
    this.zh = host.H * 2;
    this.state = new Uint8Array(this.zw * this.zh);
    this.owner = new Int16Array(this.zw * this.zh).fill(-1);
    this.seed = host.def.id + ':zones';
    this.compute();
  }

  // ---- shapes / queries ----
  private makeZone(index: number, roomId: string, def: ZoneDef): BuiltZone {
    const r = def.rect;
    const circle = def.shape === 'circle';
    const cx = (r.x + r.w / 2) * T, cz = (r.z + r.h / 2) * T;
    const hx = (r.w * T) / 2, hz = (r.h * T) / 2;
    const kind = def.kind;
    const blocked = !!def.blocked && kind !== 'bridge' && kind !== 'dais';
    return {
      index, roomId, kind, shape: circle ? 'circle' : 'rect', blocked, cx, cz, hx, hz, def,
      hazard: def.hazard ?? null,
      contains(x: number, z: number, pad = 0): boolean {
        if (circle) {
          const a = (x - cx) / (hx + pad), b = (z - cz) / (hz + pad);
          return a * a + b * b <= 1;
        }
        return Math.abs(x - cx) <= hx + pad && Math.abs(z - cz) <= hz + pad;
      },
    };
  }

  private cellIdx(zi: number, zj: number): number { return zj * this.zw + zi; }

  private compute(): void {
    const { def, W, H } = this.host;
    const roomOfCell = (zi: number, zj: number): number => this.host.tileRoom(Math.floor(zi / 2), Math.floor(zj / 2));
    def.rooms.forEach((room) => {
      for (const zd of room.zones ?? []) {
        const bz = this.makeZone(this.zones.length, room.id, zd);
        this.zones.push(bz);
        const list: number[] = [];
        const pad = bz.kind === 'dais' ? 0.8 : 0;
        const x0 = Math.max(0, Math.floor((bz.cx - bz.hx - pad) / CELL)), x1 = Math.min(this.zw - 1, Math.floor((bz.cx + bz.hx + pad) / CELL));
        const z0 = Math.max(0, Math.floor((bz.cz - bz.hz - pad) / CELL)), z1 = Math.min(this.zh - 1, Math.floor((bz.cz + bz.hz + pad) / CELL));
        for (let zj = z0; zj <= z1; zj++)
          for (let zi = x0; zi <= x1; zi++) {
            if (roomOfCell(zi, zj) < 0) continue;
            if (bz.contains(zi * CELL + 1, zj * CELL + 1, pad)) list.push(this.cellIdx(zi, zj));
          }
        if (!list.length) {
          // tiny zones still claim the cell under their centre
          const zi = Math.floor(bz.cx / CELL), zj = Math.floor(bz.cz / CELL);
          if (zi >= 0 && zj >= 0 && zi < this.zw && zj < this.zh && roomOfCell(zi, zj) >= 0) list.push(this.cellIdx(zi, zj));
        }
        this.cells.push(list);
        if (bz.blocked) for (const c of list) { this.state[c] = 1; this.owner[c] = bz.index; }
        else if (bz.kind === 'bridge' || bz.kind === 'dais') for (const c of list) { this.state[c] = 2; this.owner[c] = bz.index; }
      }
    });
    void W; void H;
    // nav: holes block their four 1 m cells; deck cells keep whatever the layout made walkable
    const nav = this.host.nav;
    for (let zj = 0; zj < this.zh; zj++)
      for (let zi = 0; zi < this.zw; zi++) {
        if (this.state[this.cellIdx(zi, zj)] !== 1) continue;
        for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) nav.setCell(nav.cx(zi * CELL + dx), nav.cz(zj * CELL + dz), 0);
      }
  }

  /** Bit mask of the four 2 m cells of tile (tx, tz) that are NOT plain floor: bit0 = (0,0) bit1 = (1,0) bit2 = (0,1) bit3 = (1,1). */
  tileMask(tx: number, tz: number): number {
    if (!this.zones.length) return 0;
    let m = 0;
    for (let q = 0; q < 4; q++) {
      const zi = tx * 2 + (q & 1), zj = tz * 2 + (q >> 1);
      if (zi < this.zw && zj < this.zh && this.state[this.cellIdx(zi, zj)] !== 0) m |= 1 << q;
    }
    return m;
  }

  /** True where auto-decor must not be dropped (holes, decks and floor features that read as hazards). */
  blockedAt(x: number, z: number): boolean {
    if (!this.zones.length) return false;
    const zi = Math.floor(x / CELL), zj = Math.floor(z / CELL);
    if (zi >= 0 && zj >= 0 && zi < this.zw && zj < this.zh && this.state[this.cellIdx(zi, zj)] !== 0) return true;
    for (const bz of this.zones) {
      if ((bz.kind === 'lava' || bz.kind === 'pool' || bz.kind === 'vent' || bz.kind === 'pit' || bz.kind === 'void') && bz.contains(x, z, 0.4)) return true;
    }
    return false;
  }

  /** Top-most zone at a world position (later zones override earlier ones; bridges/daises hide what lies below). */
  zoneAt(x: number, z: number): BuiltZone | null {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const bz = this.zones[i];
      if (bz.kind === 'bridge' || bz.kind === 'dais') {
        const zi = Math.floor(x / CELL), zj = Math.floor(z / CELL);
        if (zi >= 0 && zj >= 0 && zi < this.zw && zj < this.zh && this.state[this.cellIdx(zi, zj)] === 2 && this.owner[this.cellIdx(zi, zj)] === bz.index) return bz;
        continue;
      }
      if (bz.contains(x, z)) return bz;
    }
    return null;
  }

  /** The damaging zone (hazard) a point stands in, honouring bridges. */
  hazardAt(x: number, z: number): BuiltZone | null {
    const z0 = this.zoneAt(x, z);
    return z0 && z0.hazard ? z0 : null;
  }

  // ---- geometry helpers ----
  private cellQuads(list: number[], y: number, uvScale = 0.25, color?: number[]): THREE.BufferGeometry {
    const ms = new Mesher();
    for (const c of list) {
      const zi = c % this.zw, zj = Math.floor(c / this.zw);
      const x0 = zi * CELL, z0 = zj * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
      const cols = color ? [color, color, color, color] : undefined;
      ms.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, 1, 0], [[x0 * uvScale, z0 * uvScale], [x1 * uvScale, z0 * uvScale], [x1 * uvScale, z1 * uvScale], [x0 * uvScale, z1 * uvScale]], cols);
    }
    return ms.geometry();
  }

  private add(mesh: THREE.Object3D): void {
    this.host.root.add(mesh);
  }
  private own(...d: { dispose(): void }[]): void {
    this.host.disposables.push(...d);
  }

  // ---- build ----
  build(): void {
    if (!this.zones.length) return;
    const rng = new RNG(hashString(this.seed));
    const host = this.host;
    // shared glow sprite (ProceduralAssets cache): not owned by the zone field
    const gt = glowTexture(32, 6, 1.5);
    const embers = new ParticleField({ map: gt, blending: 'additive', gravity: [0, 0.35, 0], sizeEnd: 0.35, alpha: 1, intensity: 2.2, fog: [host.def.theme.fogNear * 0.9, host.def.theme.fogFar * 1.2] });
    const bankM = new Mesher();
    const glowM = new Mesher();

    this.zones.forEach((bz) => {
      const zd = bz.def;
      const list = this.cells[bz.index];
      const holeCells = list.filter((c) => this.state[c] === 1 && this.owner[c] === bz.index);
      const color = zd.color ?? (bz.kind === 'lava' ? 0x7a1a05 : bz.kind === 'pool' ? 0x1e4a60 : 0x14141a);
      const glow = zd.glow ?? (bz.kind === 'lava' ? 0xff6a20 : bz.kind === 'pool' ? 0x60b0ff : bz.kind === 'ice' ? 0x9ad8ff : 0xb070ff);
      const gi = zd.glowIntensity ?? 1;
      const center: [number, number, number] = [bz.cx, 0, bz.cz];
      const areaM2 = list.length * CELL * CELL;

      // ----- sunken surfaces (blocked zones) -----
      if (holeCells.length) {
        const surfY = SURFACE_Y[bz.kind] ?? -0.4;
        if (bz.kind === 'pit' || bz.kind === 'void') {
          const g = this.cellQuads(holeCells, surfY);
          const m = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
          const mesh = new THREE.Mesh(g, m);
          mesh.name = `zone_${bz.kind}_${bz.index}`;
          mesh.frustumCulled = false;
          this.add(mesh);
          freezeStatic(mesh);
          this.own(g, m);
          if (bz.kind === 'pit' && zd.glow !== undefined) {
            // an unseen glow deep in the shaft: halo + faint light
            const dia = Math.max(bz.hx, bz.hz) * 2;
            host.halo.add([bz.cx, -2.4, bz.cz], glow, { size: dia * 1.5, flicker: 0.2, intensity: 0.7 * gi });
            host.halo.add([bz.cx, -0.6, bz.cz], glow, { size: dia * 1.1, flicker: 0.25, intensity: 0.45 * gi });
            host.lights.add([bz.cx, -0.8, bz.cz], { color: glow, intensity: designToPhysical(1.1 * gi), distance: Math.max(8, dia * 1.8), flicker: 0.2 });
          }
        } else {
          const lava = bz.kind === 'lava';
          const g = this.cellQuads(holeCells, surfY);
          const m = liquidMaterial(color, glow, lava ? 0.85 + gi * 0.45 : 0.9 * Math.max(0.6, gi), lava ? 0.55 : 0.8, lava ? 1 : 0.5, lava ? 1 : 0.2);
          this.mats.push(m);
          const mesh = new THREE.Mesh(g, m);
          mesh.name = `zone_${bz.kind}_${bz.index}`;
          mesh.frustumCulled = false;
          this.add(mesh);
          freezeStatic(mesh);
          this.own(g, m);
          if (lava) {
            // lake lighting: halos scattered over the surface + a few real lights (the pool keeps the nearest)
            let k = 0;
            for (const c of holeCells) {
              if ((k++ % 4) !== 0) continue;
              const zi = c % this.zw, zj = Math.floor(c / this.zw);
              host.halo.add([zi * CELL + 1 + rng.range(-0.5, 0.5), surfY + 0.5, zj * CELL + 1 + rng.range(-0.5, 0.5)], glow, { size: rng.range(3.2, 4.6), flicker: 0.28, intensity: 0.45 * gi });
            }
            const nLights = areaM2 > 400 ? 4 : areaM2 > 100 ? 2 : 1;
            for (let q = 0; q < nLights; q++) {
              const c = holeCells[Math.min(holeCells.length - 1, Math.floor(((q + 0.5) / nLights) * holeCells.length))];
              const zi = c % this.zw, zj = Math.floor(c / this.zw);
              const spec = zd.light ?? { color: glow, intensity: 1.5, distance: 13 };
              host.lights.add([nLights === 1 ? bz.cx : zi * CELL + 1, (spec.y ?? 0.9), nLights === 1 ? bz.cz : zj * CELL + 1], {
                color: spec.color, intensity: designToPhysical(spec.intensity * 0.85), distance: Math.max(spec.distance * (nLights > 1 ? 0.7 : 1), 8), flicker: spec.flicker === false ? 0.05 : 0.3,
              });
            }
            // rising embers
            const count = Math.min(320, Math.round(holeCells.length * 1.4));
            for (let n = 0; n < count; n++) {
              const c = holeCells[rng.int(0, holeCells.length - 1)];
              const zi = c % this.zw, zj = Math.floor(c / this.zw);
              embers.add({
                pos: [zi * CELL + rng.range(0, CELL), surfY + 0.1, zj * CELL + rng.range(0, CELL)],
                vel: [rng.range(-0.25, 0.25), rng.range(0.7, 1.9), rng.range(-0.25, 0.25)],
                speed: rng.range(0.22, 0.55), size: rng.range(0.07, 0.15), sway: rng.range(0.1, 0.5), color: rng.pick([0xff9a30, 0xffc050, 0xff7020]),
              });
            }
          } else if (zd.light) {
            host.lights.add([bz.cx, zd.light.y ?? 0.6, bz.cz], { color: zd.light.color, intensity: designToPhysical(zd.light.intensity), distance: zd.light.distance, flicker: zd.light.flicker ? 0.25 : 0.05 });
          }
        }
        // banks: vertical faces from the floor edge down to the surface wherever a hole cell meets solid ground
        this.addBanks(bankM, glowM, holeCells, bz, surfY, glow);
      }

      // ----- floor decals / decks (do not change the hole mask) -----
      switch (bz.kind) {
        case 'bridge':
        case 'dais': {
          const deck = list.filter((c) => this.state[c] === 2 && this.owner[c] === bz.index);
          if (!deck.length) break;
          const dais = bz.kind === 'dais';
          const base = new THREE.Color(zd.color ?? (dais ? 0x2a2420 : 0x3a2a1a));
          const tex = surfaceTexture(dais ? 'tiles' : 'planks', host.def.id + ':' + bz.kind, 64);
          const mat = psxMaterial(tex, { color: base.clone().multiplyScalar(dais ? 3.6 : 3.0), roughness: 0.9, affine: false });
          const g = this.cellQuads(deck, FLOOR_TOP + 0.012, dais ? 0.25 : 0.5);
          const mesh = new THREE.Mesh(g, mat);
          mesh.receiveShadow = true;
          mesh.name = `zone_${bz.kind}_${bz.index}`;
          this.add(mesh);
          freezeStatic(mesh);
          this.own(g, mat);
          if (bz.kind === 'bridge') this.addBridgeRails(deck, bz);
          if (dais && bz.shape === 'circle') this.addRoundDais(bz, base);
          break;
        }
        case 'rune': this.addRune(bz, color, glow, gi); break;
        case 'ice': if (!bz.blocked) this.addIce(bz, list, color, glow, gi); break;
        case 'vent': this.addVent(bz, list, glow, gi, rng); break;
        case 'lava':
        case 'pool':
          if (!bz.blocked) this.addDecalLiquid(bz, list, color, glow, gi);
          break;
        case 'pit':
        case 'void':
          if (!bz.blocked) this.addDarkPatch(bz, list, color, glow, gi);
          break;
        default: break;
      }

      // ----- common extras -----
      if (zd.vfx) host.spawnEmitter(zd.vfx, [bz.cx, bz.kind === 'pit' ? 0.2 : 0.4, bz.cz], 1);
      if (zd.light && (bz.kind === 'rune' || bz.kind === 'vent' || bz.kind === 'ice' || bz.kind === 'lava' || bz.kind === 'pool') && !bz.blocked) {
        host.lights.add([bz.cx, zd.light.y ?? 0.8, bz.cz], { color: zd.light.color, intensity: designToPhysical(zd.light.intensity), distance: zd.light.distance, flicker: zd.light.flicker ? 0.28 : 0.05 });
      }
      void center;
    });

    if (!bankM.empty) {
      const g = bankM.geometry();
      const mat = psxMaterial(surfaceTexture('brick', host.def.id + ':bank', 64), { color: new THREE.Color(mulHex(host.tint, 0xe0d8d0)), vertexColors: true, roughness: 1, affine: false });
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.name = 'zone_banks';
      mesh.frustumCulled = false;
      this.add(mesh);
      freezeStatic(mesh);
      this.own(g, mat);
    }
    if (!glowM.empty) {
      const g = glowM.geometry();
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = 'zone_bank_glow';
      mesh.renderOrder = 3;
      mesh.frustumCulled = false;
      this.add(mesh);
      freezeStatic(mesh);
      this.own(g, mat);
    }
    if (embers.count) {
      embers.build();
      this.add(embers.mesh);
      this.own(embers);
      host.addUpdater((_dt, t) => embers.update(t));
    }
    host.addUpdater((dt, t) => {
      for (const m of this.mats) m.uniforms.uTime.value = t;
      for (const r of this.runes) {
        r.mesh.rotation.y += dt * 0.08;
        // slow breathing (about +-8 %) so the sigils read as living marks, not a static light disc
        r.mat.color.setScalar(r.k * (0.92 + 0.08 * Math.sin(t * 1.3 + r.ph)));
      }
    });
  }

  private addBanks(bankM: Mesher, glowM: Mesher, holeCells: number[], bz: BuiltZone, surfY: number, glow: number): void {
    const top = FLOOR_TOP;
    const depth = top - surfY;
    const gc = new THREE.Color(glow);
    const lava = bz.kind === 'lava';
    const topCol = [0.62, 0.6, 0.58];
    const botCol = lava ? [0.55, 0.22, 0.1] : bz.kind === 'pool' ? [0.28, 0.36, 0.42] : [0.03, 0.03, 0.04];
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const uvS = 0.4;
    for (const c of holeCells) {
      const zi = c % this.zw, zj = Math.floor(c / this.zw);
      for (const [dx, dz] of dirs) {
        const ni = zi + dx, nj = zj + dz;
        if (ni < 0 || nj < 0 || ni >= this.zw || nj >= this.zh) continue;
        const nIdx = this.cellIdx(ni, nj);
        if (this.state[nIdx] === 1) continue; // still a hole
        if (this.host.tileRoom(Math.floor(ni / 2), Math.floor(nj / 2)) < 0) continue; // a wall stands there
        // edge line between the hole cell and its neighbour; the face belongs to the neighbour and looks into the hole
        const x0 = zi * CELL, z0 = zj * CELL;
        let a: number[], b: number[];
        if (dx !== 0) {
          const x = dx < 0 ? x0 : x0 + CELL;
          a = [x, z0]; b = [x, z0 + CELL];
        } else {
          const z = dz < 0 ? z0 : z0 + CELL;
          a = [x0, z]; b = [x0 + CELL, z];
        }
        const n: [number, number, number] = [-dx, 0, -dz];
        const u0 = (a[0] + a[1]) * uvS, u1 = (b[0] + b[1]) * uvS, vv = depth * uvS;
        bankM.quad(
          [[a[0], top, a[1]], [b[0], top, b[1]], [b[0], surfY, b[1]], [a[0], surfY, a[1]]],
          n,
          [[u0, 0], [u1, 0], [u1, vv], [u0, vv]],
          [topCol, topCol, botCol, botCol],
        );
        if (lava) {
          // glowing rim at the waterline of the lava
          const h = Math.min(0.5, depth);
          const hot = [gc.r * 1.35, gc.g * 1.35, gc.b * 1.35];
          const off = 0.012;
          const ox = -dx * off, oz = -dz * off;
          glowM.quad(
            [[a[0] + ox, surfY + h, a[1] + oz], [b[0] + ox, surfY + h, b[1] + oz], [b[0] + ox, surfY, b[1] + oz], [a[0] + ox, surfY, a[1] + oz]],
            n,
            [[0, 0], [1, 0], [1, 1], [0, 1]],
            [[0, 0, 0], [0, 0, 0], hot, hot],
          );
        }
      }
    }
  }

  /** Low parapet along the long edges of a bridge so it reads as a causeway (visual only). */
  private addBridgeRails(deck: number[], bz: BuiltZone): void {
    const set = new Set(deck);
    const ms = new Mesher();
    const h = 0.32, w = 0.22, y0 = FLOOR_TOP;
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const c of deck) {
      const zi = c % this.zw, zj = Math.floor(c / this.zw);
      for (const [dx, dz] of dirs) {
        const ni = zi + dx, nj = zj + dz;
        if (ni < 0 || nj < 0 || ni >= this.zw || nj >= this.zh) continue;
        const nIdx = this.cellIdx(ni, nj);
        if (set.has(nIdx) || this.state[nIdx] !== 1) continue; // rails only where the deck borders the hole
        const x0 = zi * CELL, z0 = zj * CELL;
        if (dx !== 0) {
          const x = dx < 0 ? x0 + w / 2 : x0 + CELL - w / 2;
          this.box(ms, x - w / 2, y0, z0, x + w / 2, y0 + h, z0 + CELL);
        } else {
          const z = dz < 0 ? z0 + w / 2 : z0 + CELL - w / 2;
          this.box(ms, x0, y0, z - w / 2, x0 + CELL, y0 + h, z + w / 2);
        }
      }
    }
    if (ms.empty) return;
    const g = ms.geometry();
    const base = new THREE.Color(bz.def.color ?? 0x3a2a1a);
    const mat = psxMaterial(surfaceTexture('planks', this.host.def.id + ':rail', 64), { color: base.multiplyScalar(2.2), vertexColors: true, affine: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = shouldCastShadow(mesh);
    mesh.receiveShadow = true;
    mesh.name = `bridge_rails_${bz.index}`;
    this.add(mesh);
    freezeStatic(mesh);
    this.own(g, mat);
  }

  private box(ms: Mesher, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const uv = (u: number, v: number) => [u * 0.8, v * 0.8];
    const c = [1, 1, 1];
    ms.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], [uv(x0, z0), uv(x1, z0), uv(x1, z1), uv(x0, z1)], [c, c, c, c]);
    ms.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [uv(x0, y0), uv(x1, y0), uv(x1, y1), uv(x0, y1)], [c, c, c, c]);
    ms.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [uv(x0, y0), uv(x1, y0), uv(x1, y1), uv(x0, y1)], [c, c, c, c]);
    ms.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [uv(z0, y0), uv(z1, y0), uv(z1, y1), uv(z0, y1)], [c, c, c, c]);
    ms.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [uv(z0, y0), uv(z1, y0), uv(z1, y1), uv(z0, y1)], [c, c, c, c]);
  }

  /** The visible round platform on top of a circular dais' blocky deck. */
  private addRoundDais(bz: BuiltZone, base: THREE.Color): void {
    const r = Math.max(bz.hx, bz.hz);
    const hgt = Math.min(0.32, Math.max(0.16, (bz.def.y ?? 0.3) * 0.15));
    const tex = surfaceTexture('tiles', this.host.def.id + ':daistop', 64);
    const seg = Math.max(18, Math.min(48, Math.round(r * 2.4)));
    const geo = new THREE.CylinderGeometry(r * 0.985, r, hgt, seg, 1, false);
    geo.translate(0, FLOOR_TOP + hgt / 2 + 0.012, 0);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nor = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      if (nor.getY(i) > 0.5) uv.setXY(i, pos.getX(i) * 0.25, pos.getZ(i) * 0.25);
      else uv.setXY(i, Math.atan2(pos.getZ(i), pos.getX(i)) * r * 0.25, pos.getY(i) * 0.5);
    }
    const mat = psxMaterial(tex, { color: base.clone().multiplyScalar(4.4), roughness: 0.85, affine: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(bz.cx, 0, bz.cz);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `dais_${bz.index}`;
    this.add(mesh);
    freezeStatic(mesh);
    this.own(geo, mat);
    // an engraved ring on top
    const ring = new THREE.RingGeometry(r * 0.7, r * 0.74, seg);
    ring.rotateX(-PI / 2);
    const rm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.45, 0.35), fog: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const rmesh = new THREE.Mesh(ring, rm);
    rmesh.position.set(bz.cx, FLOOR_TOP + hgt + 0.03, bz.cz);
    this.add(rmesh);
    freezeStatic(rmesh);
    this.own(ring, rm);
  }

  /** One rune texture per (glow, fill) colour pair, shared by every rune zone of that colour (not owned by the field). */
  private runeTexture(glowHex: number, fillHex: number): THREE.CanvasTexture {
    return sharedTexture(`rune|${glowHex}|${fillHex}`, () => this.paintRune(glowHex, fillHex));
  }

  private paintRune(glowHex: number, fillHex: number): THREE.CanvasTexture {
    const S = 128;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);
    const fill = new THREE.Color(fillHex);
    ctx.fillStyle = `rgb(${Math.round(fill.r * 255)},${Math.round(fill.g * 255)},${Math.round(fill.b * 255)})`;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, PI * 2); ctx.fill();
    const g = new THREE.Color(glowHex);
    const gs = `rgb(${Math.round(Math.min(1, g.r) * 255)},${Math.round(Math.min(1, g.g) * 255)},${Math.round(Math.min(1, g.b) * 255)})`;
    ctx.strokeStyle = gs;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 6, 0, PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 16, 0, PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.2, 0, PI * 2); ctx.stroke();
    const pts = 6;
    for (let k = 0; k < pts; k++) {
      const a = (k / pts) * PI * 2 - PI / 2, b = ((k + 2) / pts) * PI * 2 - PI / 2;
      const rr = S / 2 - 16;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr);
      ctx.lineTo(S / 2 + Math.cos(b) * rr, S / 2 + Math.sin(b) * rr);
      ctx.stroke();
      // tick glyphs between the rings
      const t = (k / pts) * PI * 2;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.cos(t) * (S / 2 - 16), S / 2 + Math.sin(t) * (S / 2 - 16));
      ctx.lineTo(S / 2 + Math.cos(t) * (S / 2 - 6), S / 2 + Math.sin(t) * (S / 2 - 6));
      ctx.stroke();
    }
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) img.data[i + 3] = img.data[i + 3] > 100 ? 255 : 0;
    ctx.putImageData(img, 0, 0);
    return canvasTexture(canvas, { repeat: false, mipmaps: false });
  }

  private addRune(bz: BuiltZone, color: number, glow: number, gi: number): void {
    const tex = this.runeTexture(glow, color);
    const size = Math.max(bz.hx, bz.hz) * 2;
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-PI / 2);
    const k = 1.15 + gi * 0.6;
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, color: new THREE.Color(k, k, k), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    patchPSX(mat, { affine: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(bz.cx, FLOOR_TOP + 0.03, bz.cz);
    mesh.name = `rune_${bz.index}`;
    this.add(mesh);
    this.runes.push({ mesh, mat, k, ph: bz.index * 1.37 });
    this.own(g, mat);
    this.host.halo.add([bz.cx, 0.35, bz.cz], glow, { size: size * 0.8, flicker: 0.12, intensity: 0.28 * gi });
  }

  private addIce(bz: BuiltZone, list: number[], color: number, glow: number, gi: number): void {
    const g = this.cellQuads(list, FLOOR_TOP + 0.02);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.08, metalness: 0.1, emissive: glow, emissiveIntensity: 0.25 * gi, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    patchPSX(mat, { affine: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    mesh.name = `ice_${bz.index}`;
    this.add(mesh);
    freezeStatic(mesh);
    this.own(g, mat);
  }

  private addDecalLiquid(bz: BuiltZone, list: number[], color: number, glow: number, gi: number): void {
    const lava = bz.kind === 'lava';
    const g = this.cellQuads(list, FLOOR_TOP + 0.03);
    const m = liquidMaterial(color, glow, lava ? 0.8 + gi * 0.4 : 0.85, lava ? 0.7 : 0.8, lava ? 1 : 0.5, lava ? 1 : 0.2);
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    this.mats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.name = `${bz.kind}_decal_${bz.index}`;
    mesh.frustumCulled = false;
    this.add(mesh);
    freezeStatic(mesh);
    this.own(g, m);
    if (lava) {
      this.host.halo.add([bz.cx, 0.5, bz.cz], glow, { size: Math.max(bz.hx, bz.hz) * 2.2, flicker: 0.25, intensity: 0.4 * gi });
      if (!bz.def.light) this.host.lights.add([bz.cx, 0.9, bz.cz], { color: glow, intensity: designToPhysical(1.1), distance: Math.max(8, Math.max(bz.hx, bz.hz) * 3), flicker: 0.3 });
    }
  }

  /** Walkable "pit" / "void" zones: a sunken-looking dark patch on the floor with a faint rim glow (corpse pits, shadow wells). */
  private addDarkPatch(bz: BuiltZone, list: number[], color: number, glow: number, gi: number): void {
    const g = this.cellQuads(list, FLOOR_TOP + 0.025);
    const mat = new THREE.MeshBasicMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    patchPSX(mat, { affine: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `dark_patch_${bz.index}`;
    mesh.frustumCulled = false;
    this.add(mesh);
    freezeStatic(mesh);
    this.own(g, mat);
    const size = Math.max(bz.hx, bz.hz) * 2.3;
    this.host.halo.add([bz.cx, 0.3, bz.cz], glow, { size, flicker: 0.25, intensity: 0.32 * gi });
  }

  private addVent(bz: BuiltZone, list: number[], glow: number, gi: number, rng: RNG): void {
    // a few shared vent shapes (one canvas each); the per-vent rotation keeps every vent distinct
    const variant = rng.int(0, VENT_VARIANTS - 1);
    const tex = sharedTexture(`vent|${variant}`, () => this.paintVent(new RNG(`vent:${variant}`)));
    this.placeVent(bz, glow, gi, tex, rng.range(0, PI * 2));
    void list;
  }

  /** One vent shape: radiating cracks around a bright core (cosmetic, seeded by its variant). */
  private paintVent(rng: RNG): THREE.CanvasTexture {
    const S = 64;
    const { canvas, ctx } = makeCanvas(S, S);
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    const arms = 8;
    for (let k = 0; k < arms; k++) {
      let a = (k / arms) * PI * 2 + rng.range(-0.2, 0.2);
      let x = S / 2, y = S / 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const len = rng.range(0.55, 0.95) * (S / 2 - 2);
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        a += rng.range(-0.5, 0.5);
        x += Math.cos(a) * (len / steps);
        y += Math.sin(a) * (len / steps);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, 6, 0, PI * 2); ctx.fill();
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) { img.data[i + 3] = img.data[i + 3] > 90 ? 255 : 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; }
    ctx.putImageData(img, 0, 0);
    return canvasTexture(canvas, { repeat: false, mipmaps: false });
  }

  private placeVent(bz: BuiltZone, glow: number, gi: number, tex: THREE.CanvasTexture, rot: number): void {
    const size = Math.max(bz.hx, bz.hz) * 2.4;
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(-PI / 2);
    g.rotateY(rot);
    const gc = new THREE.Color(glow);
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, color: new THREE.Color(gc.r * (1.2 + gi), gc.g * (1.2 + gi), gc.b * (1.2 + gi)), toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    patchPSX(mat, { affine: false });
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(bz.cx, FLOOR_TOP + 0.03, bz.cz);
    mesh.name = `vent_${bz.index}`;
    this.add(mesh);
    freezeStatic(mesh);
    this.own(g, mat);
    this.host.halo.add([bz.cx, 0.45, bz.cz], glow, { size: size * 1.2, flicker: 0.35, intensity: 0.5 * gi });
  }
}
