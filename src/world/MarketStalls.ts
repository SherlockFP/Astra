import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G } from '../game/G';
import type { World } from './World';
import { patchPSX } from '../render/psx';
import { NPC, NPC_PRESETS } from '../entities/NPC';
import { MarketStall } from '../entities/interactables/MarketStall';
import { RARITY_COLORS } from '../types/common';
import {
  CANOPY_COLORS, CLASS_BODY_COLOR, MARKET, SEAT_LOCAL, STALL_LOCAL, TEZGAH_USTASI_ID, TEZGAH_USTASI_PRESET, hashSeller, spotCount, tezgahUstasiDef,
  type MarketOrigin,
} from '../data/market';
import { getMarket, type Market, type Stall } from '../systems/Market';
import { installPazarciMode } from '../ui/panels/game/market/pazarci';

/**
 * CM14 Pazar world presence (docs/CORE_MECHANICS.md §11): every announced stall of the scene's market district drawn as a light
 * static prop. Everything is procedural (no assets) and instanced: ONE InstancedMesh each for the wooden stalls, the cloth canopies,
 * the seated sellers (body + head) and the goods on the counters, so 60 stalls cost 5 draw calls. Floating title boards are canvas
 * text sprites for the 40 nearest stalls only (MARKET.TEXT_LOD); the others share one instanced blank board. One interactable per
 * stall (entities/interactables/MarketStall.ts) gives the F prompt. OWNER: scenes module (world presence).
 *
 *   mountMarket(scene, origin, { world, npc })   call from TownScene / the village spawner; returns the handle
 *   unmountMarket()                              call from the scene's exit(); also closes the player's own stall
 */

/* ------------------------------------------------------------------------------------------------ geometry */

function colored(g: THREE.BufferGeometry, hex: number, scale = 1): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r * scale;
    arr[i + 1] = c.g * scale;
    arr[i + 2] = c.b * scale;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, hex: number, o: { rx?: number; shade?: number } = {}): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (o.rx) g.rotateX(o.rx);
  g.translate(x, y, z);
  return colored(g, hex, o.shade ?? 1);
}
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('market: merge failed');
  return g;
}

const WOOD = 0x8a5a2b, WOOD_LIGHT = 0xa8763c, WOOD_DARK = 0x5a3a1c, SKIN = 0xe0b48c;

/** Counter, posts, back panel and the seller's stool (all wood), centred on the stall counter, front toward +z. */
function stallBodyGeometry(): THREE.BufferGeometry {
  const { w, d } = STALL_LOCAL;
  const parts: THREE.BufferGeometry[] = [
    box(w, 0.9, d, 0, 0.45, 0, WOOD),
    box(w + 0.12, 0.08, d + 0.14, 0, 0.94, 0.02, WOOD_LIGHT),
    box(w - 0.1, 1.5, 0.05, 0, 1.65, -d / 2 + 0.03, WOOD_DARK, { shade: 0.9 }),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.08, 2.2, 0.08, sx * (w / 2 - 0.02), 1.1, sz * (d / 2 + 0.02), WOOD_DARK));
  // the stool of the seller, beside the counter
  const sx = SEAT_LOCAL.x - STALL_LOCAL.x, sz = SEAT_LOCAL.z - STALL_LOCAL.z;
  parts.push(box(0.36, 0.06, 0.36, sx, 0.42, sz, WOOD_LIGHT), box(0.06, 0.4, 0.06, sx - 0.13, 0.2, sz - 0.13, WOOD_DARK), box(0.06, 0.4, 0.06, sx + 0.13, 0.2, sz + 0.13, WOOD_DARK),
    box(0.06, 0.4, 0.06, sx - 0.13, 0.2, sz + 0.13, WOOD_DARK), box(0.06, 0.4, 0.06, sx + 0.13, 0.2, sz - 0.13, WOOD_DARK));
  return merge(parts);
}

/** Striped cloth canopy (white strips, tinted per stall by the instance colour) with a hanging valance. */
function canopyGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const strips = 6, width = 2.0, sw = width / strips;
  const tilt = Math.atan2(0.3, 1.5);
  for (let i = 0; i < strips; i++) {
    parts.push(box(sw, 0.04, 1.55, -width / 2 + sw * (i + 0.5), 2.28, 0, 0xffffff, { rx: -tilt, shade: i % 2 ? 0.78 : 1 }));
    parts.push(box(sw, 0.2, 0.03, -width / 2 + sw * (i + 0.5), 2.0, 0.76, 0xffffff, { shade: i % 2 ? 0.7 : 0.92 }));
  }
  return merge(parts);
}

/** Seated seller: legs, torso, arms (tinted by class colour through the instance colour). The head is a second mesh. */
function sellerBodyGeometry(): THREE.BufferGeometry {
  const x = SEAT_LOCAL.x - STALL_LOCAL.x, z = SEAT_LOCAL.z - STALL_LOCAL.z;
  return merge([
    box(0.32, 0.14, 0.4, x, 0.52, z + 0.2, 0xffffff, { shade: 0.55 }),          // thighs
    box(0.28, 0.42, 0.14, x, 0.27, z + 0.42, 0xffffff, { shade: 0.5 }),           // shins
    box(0.4, 0.56, 0.24, x, 0.84, z, 0xffffff),                                   // torso
    box(0.1, 0.42, 0.1, x - 0.26, 0.8, z + 0.1, 0xffffff, { shade: 0.85 }),       // arms
    box(0.1, 0.42, 0.1, x + 0.26, 0.8, z + 0.1, 0xffffff, { shade: 0.85 }),
  ]);
}
function sellerHeadGeometry(): THREE.BufferGeometry {
  const x = SEAT_LOCAL.x - STALL_LOCAL.x, z = SEAT_LOCAL.z - STALL_LOCAL.z;
  return merge([box(0.26, 0.26, 0.26, x, 1.3, z + 0.02, SKIN), box(0.3, 0.1, 0.3, x, 1.46, z, 0x3a2a1a)]);
}

/* ------------------------------------------------------------------------------------------------ board textures */

const BOARD_W = 256, BOARD_H = 64;

function paintBoard(ctx: CanvasRenderingContext2D, title: string | null): void {
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  // wooden plaque with a gold rim, two chain lugs on top
  ctx.fillStyle = '#2a1a0c';
  ctx.fillRect(2, 6, BOARD_W - 4, BOARD_H - 8);
  ctx.fillStyle = '#5a3a1c';
  ctx.fillRect(5, 9, BOARD_W - 10, BOARD_H - 14);
  ctx.strokeStyle = '#d8b060';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 8, BOARD_W - 8, BOARD_H - 12);
  ctx.fillStyle = '#d8b060';
  ctx.fillRect(40, 0, 4, 8);
  ctx.fillRect(BOARD_W - 44, 0, 4, 8);
  if (!title) return;
  let size = 28;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `700 ${size}px Cinzel, "Roboto Condensed", "Trebuchet MS", serif`;
    size -= 2;
  } while (ctx.measureText(title).width > BOARD_W - 26 && size > 10);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1a0f06';
  ctx.strokeText(title, BOARD_W / 2, BOARD_H / 2 + 3);
  ctx.fillStyle = '#f6e6b4';
  ctx.fillText(title, BOARD_W / 2, BOARD_H / 2 + 3);
}

function boardTexture(title: string | null): { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  const ctx = canvas.getContext('2d')!;
  paintBoard(ctx, title);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return { tex, ctx };
}

/* ------------------------------------------------------------------------------------------------ MarketStalls */

const GOODS_PER_STALL = 6;
const BOARD_SCALE = new THREE.Vector2(1.7, 0.425);
const BOARD_Y = 2.95;
const BOARD_DRAW_DIST = 80;

interface TextBoard {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  tex: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  title: string;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

export class MarketStalls {
  readonly group = new THREE.Group();
  private readonly market: Market;
  private readonly count: number;
  private readonly bodyMesh: THREE.InstancedMesh;
  private readonly canopyMesh: THREE.InstancedMesh;
  private readonly sellerMesh: THREE.InstancedMesh;
  private readonly headMesh: THREE.InstancedMesh;
  private readonly goodsMesh: THREE.InstancedMesh;
  private readonly blankMesh: THREE.InstancedMesh;
  private readonly blankTex: THREE.CanvasTexture;
  private readonly boards: TextBoard[] = [];
  private readonly entities = new Map<string, MarketStall>();
  private readonly disposables: { dispose(): void }[] = [];
  private offs: (() => void)[] = [];
  private dirty = true;
  private lodT = 0;
  private beam: { stop(): void } | null = null;
  private beamTimer: ReturnType<typeof setTimeout> | null = null;
  private npc: NPC | null = null;
  private disposed = false;

  constructor(readonly scene: THREE.Scene, readonly origin: MarketOrigin, private readonly worldRef: World | null, npcAt: { x: number; z: number; rotDeg?: number } | null) {
    this.market = getMarket();
    this.count = spotCount(origin.kind);
    this.group.name = 'market-stalls';

    const mkMat = (extra: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial => {
      const m = patchPSX(new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }));
      this.disposables.push(m);
      return m;
    };
    const inst = (g: THREE.BufferGeometry, m: THREE.Material, n: number, colors: boolean): THREE.InstancedMesh => {
      this.disposables.push(g);
      const im = new THREE.InstancedMesh(g, m, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; // the instances span the whole plaza; the bounding sphere of one stall would cull them all
      im.castShadow = false;
      im.receiveShadow = true;
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO_M);
      if (colors) {
        for (let i = 0; i < n; i++) im.setColorAt(i, tmpC.set(0xffffff));
      }
      this.group.add(im);
      return im;
    };
    this.bodyMesh = inst(stallBodyGeometry(), mkMat(), this.count, false);
    this.canopyMesh = inst(canopyGeometry(), mkMat({ side: THREE.DoubleSide }), this.count, true);
    this.sellerMesh = inst(sellerBodyGeometry(), mkMat(), this.count, true);
    this.headMesh = inst(sellerHeadGeometry(), mkMat(), this.count, false);
    this.goodsMesh = inst(colored(new THREE.BoxGeometry(0.16, 0.16, 0.16), 0xffffff), mkMat(), this.count * GOODS_PER_STALL, true);

    const blank = boardTexture(null);
    this.blankTex = blank.tex;
    this.disposables.push(blank.tex);
    const blankMat = new THREE.MeshBasicMaterial({ map: blank.tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, depthWrite: false });
    this.disposables.push(blankMat);
    this.blankMesh = inst(new THREE.PlaneGeometry(BOARD_SCALE.x, BOARD_SCALE.y), blankMat, this.count, false);
    this.blankMesh.renderOrder = 4;

    // pooled text boards (the 40 nearest stalls)
    for (let i = 0; i < Math.min(MARKET.TEXT_LOD, this.count); i++) {
      const { tex, ctx } = boardTexture('');
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(BOARD_SCALE.x, BOARD_SCALE.y, 1);
      sprite.visible = false;
      sprite.renderOrder = 5;
      sprite.frustumCulled = true;
      this.group.add(sprite);
      this.boards.push({ sprite, mat, tex, ctx, title: '\u0000' });
    }

    scene.add(this.group);
    const ev = G.events;
    this.offs.push(
      ev.on('market:changed', () => (this.dirty = true)),
      ev.on('market:pin', (p) => this.onPin(p)),
    );
    this.offs.push(G.engine.onUpdate((dt) => this.update(dt), 60, 'market'));

    if (npcAt) void this.spawnNpc(npcAt);
  }

  /** Tezgâh Ustası next to the plaza (opens the setup panel). Failures never break the scene. */
  private async spawnNpc(at: { x: number; z: number; rotDeg?: number }): Promise<void> {
    try {
      NPC_PRESETS[TEZGAH_USTASI_ID] = TEZGAH_USTASI_PRESET;
      const world = this.worldRef ?? G.world;
      if (!world) return;
      const npc = new NPC(world.allocLocalId(), tezgahUstasiDef(at.x, at.z, at.rotDeg ?? 0));
      npc.position.set(at.x, world.groundY(at.x, at.z), at.z);
      npc.object3d.rotation.y = ((at.rotDeg ?? 0) * Math.PI) / 180;
      await npc.load();
      if (this.disposed) return;
      world.add(npc);
      this.npc = npc;
    } catch (e) {
      console.warn('[market] Tezgâh Ustası could not be placed', e);
    }
  }

  /* ---------------------------------------------------------------------------- per frame */

  private update(dt: number): void {
    if (this.disposed) return;
    if (this.dirty) {
      this.dirty = false;
      this.syncStalls();
    }
    this.lodT -= dt;
    if (this.lodT <= 0) {
      this.lodT = 0.35;
      this.updateBoards();
    }
  }

  private cameraPos(): THREE.Vector3 {
    return (G.engine.activeCamera as THREE.Camera).position;
  }

  /** Stalls, sellers, goods, canopy colours and the interactables follow the market's stall list. */
  private syncStalls(): void {
    const stalls = this.market.visibleStalls();
    const live = new Set<number>();
    const world = this.worldRef ?? G.world;
    const keep = new Set<string>();
    for (const s of stalls) {
      const sp = this.market.spots[s.spot];
      if (!sp) continue;
      live.add(s.spot);
      keep.add(s.sellerId);
      const y = world?.groundY(sp.x, sp.z) ?? 0;
      tmpQ.setFromAxisAngle(UP, sp.yaw);
      tmpP.set(sp.x, y, sp.z);
      tmpS.set(1, 1, 1);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.bodyMesh.setMatrixAt(s.spot, tmpM);
      this.canopyMesh.setMatrixAt(s.spot, tmpM);
      this.canopyMesh.setColorAt(s.spot, tmpC.setHex(CANOPY_COLORS[hashSeller(s.sellerId) % CANOPY_COLORS.length]));
      // the real avatar sits at the seat when the seller is us or a party member in this scene: no stand-in then
      const real = s.own || !!G.net?.peers?.has(s.sellerId);
      if (real) {
        this.sellerMesh.setMatrixAt(s.spot, ZERO_M);
        this.headMesh.setMatrixAt(s.spot, ZERO_M);
      } else {
        this.sellerMesh.setMatrixAt(s.spot, tmpM);
        this.sellerMesh.setColorAt(s.spot, tmpC.setHex(CLASS_BODY_COLOR[s.look.c] ?? 0x888888));
        this.headMesh.setMatrixAt(s.spot, tmpM);
      }
      // goods: up to six little boxes in rarity colours along the counter
      for (let g = 0; g < GOODS_PER_STALL; g++) {
        const idx = s.spot * GOODS_PER_STALL + g;
        const l = s.listings[g];
        if (!l) {
          this.goodsMesh.setMatrixAt(idx, ZERO_M);
          continue;
        }
        const lx = -0.62 + g * 0.248;
        const c = Math.cos(sp.yaw), sn = Math.sin(sp.yaw);
        tmpP.set(sp.x + lx * c + 0.04 * sn, y + 1.06, sp.z - lx * sn + 0.04 * c);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.goodsMesh.setMatrixAt(idx, tmpM);
        this.goodsMesh.setColorAt(idx, tmpC.set(RARITY_COLORS[l.item.rarity] ?? '#ffffff'));
      }
    }
    // vacated spots
    for (let i = 0; i < this.count; i++) {
      if (live.has(i)) continue;
      this.bodyMesh.setMatrixAt(i, ZERO_M);
      this.canopyMesh.setMatrixAt(i, ZERO_M);
      this.sellerMesh.setMatrixAt(i, ZERO_M);
      this.headMesh.setMatrixAt(i, ZERO_M);
      this.blankMesh.setMatrixAt(i, ZERO_M);
      for (let g = 0; g < GOODS_PER_STALL; g++) this.goodsMesh.setMatrixAt(i * GOODS_PER_STALL + g, ZERO_M);
    }
    for (const m of [this.bodyMesh, this.canopyMesh, this.sellerMesh, this.headMesh, this.goodsMesh, this.blankMesh]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // interactables: one per visible stall
    if (world) {
      for (const [id, e] of this.entities) {
        if (!keep.has(id)) {
          e.destroy();
          this.entities.delete(id);
        }
      }
      for (const s of stalls) {
        const sp = this.market.spots[s.spot];
        if (!sp) continue;
        let e = this.entities.get(s.sellerId);
        if (!e) {
          e = new MarketStall(world.allocLocalId(), s.sellerId);
          this.entities.set(s.sellerId, e);
          world.add(e);
        }
        e.position.set(sp.x, world.groundY(sp.x, sp.z), sp.z);
      }
    }
    this.lodT = 0; // boards follow the new stall list at once
  }

  /** The 40 nearest boards draw their title; the rest show the shared blank board, billboarded on the CPU (one draw call). */
  private updateBoards(): void {
    const cam = this.cameraPos();
    const stalls = this.market.visibleStalls();
    const rows: { s: Stall; d2: number; x: number; y: number; z: number }[] = [];
    const world = this.worldRef ?? G.world;
    for (const s of stalls) {
      const sp = this.market.spots[s.spot];
      if (!sp) continue;
      const dx = sp.x - cam.x, dz = sp.z - cam.z;
      rows.push({ s, d2: dx * dx + dz * dz, x: sp.x, y: (world?.groundY(sp.x, sp.z) ?? 0) + BOARD_Y, z: sp.z });
    }
    rows.sort((a, b) => a.d2 - b.d2);
    const maxD2 = BOARD_DRAW_DIST * BOARD_DRAW_DIST;
    const shown = new Set(rows.map((r) => r.s.spot));
    for (let i = 0; i < this.count; i++) if (!shown.has(i)) this.blankMesh.setMatrixAt(i, ZERO_M);
    rows.forEach((r, rank) => {
      const far = r.d2 > maxD2;
      if (rank < this.boards.length && !far) {
        const b = this.boards[rank];
        if (b.title !== r.s.title) {
          b.title = r.s.title;
          paintBoard(b.ctx, r.s.title);
          b.tex.needsUpdate = true;
        }
        b.sprite.position.set(r.x, r.y, r.z);
        b.sprite.visible = true;
        this.blankMesh.setMatrixAt(r.s.spot, ZERO_M);
      } else {
        if (rank < this.boards.length) this.boards[rank].sprite.visible = false;
        // blank board facing the camera
        const yaw = Math.atan2(cam.x - r.x, cam.z - r.z);
        tmpQ.setFromAxisAngle(UP, yaw);
        tmpP.set(r.x, r.y, r.z);
        tmpS.set(1, 1, 1);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.blankMesh.setMatrixAt(r.s.spot, far ? ZERO_M : tmpM);
      }
    });
    for (let i = rows.length; i < this.boards.length; i++) this.boards[i].sprite.visible = false;
    this.blankMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------------------------------------------------------------------- "Göster" */

  private onPin(p: { zone: string; x: number; z: number; label: string; sellerId: string } | null): void {
    this.clearBeam();
    if (!p || p.zone !== this.origin.zone) return;
    try {
      const anchor = new THREE.Object3D();
      const y = (this.worldRef ?? G.world)?.groundY(p.x, p.z) ?? 0;
      anchor.position.set(p.x, y, p.z);
      this.scene.add(anchor);
      const h = G.vfx.lootBeam(anchor, 'legendary');
      this.beam = {
        stop: () => {
          try {
            h.stop();
          } finally {
            anchor.removeFromParent();
          }
        },
      };
      this.beamTimer = setTimeout(() => {
        this.clearBeam();
        this.market.setPin(null);
      }, MARKET.PIN_S * 1000);
    } catch (e) {
      console.warn('[market] beam failed', e);
    }
  }

  private clearBeam(): void {
    if (this.beamTimer) clearTimeout(this.beamTimer);
    this.beamTimer = null;
    this.beam?.stop();
    this.beam = null;
  }

  /* ---------------------------------------------------------------------------- teardown */

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearBeam();
    for (const o of this.offs.splice(0)) o();
    for (const e of this.entities.values()) e.destroy();
    this.entities.clear();
    if (this.npc) this.npc.destroy();
    this.group.removeFromParent();
    for (const b of this.boards) {
      b.mat.dispose();
      b.tex.dispose();
    }
    this.boards.length = 0;
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    for (const m of [this.bodyMesh, this.canopyMesh, this.sellerMesh, this.headMesh, this.goodsMesh, this.blankMesh]) m.dispose();
  }
}

/* ------------------------------------------------------------------------------------------------ mount / unmount */

let mounted: MarketStalls | null = null;
let offPazarci: (() => void) | null = null;

export interface MountMarketOpts {
  /** The scene's World. Pass it when the call happens before `G.world` is set (inside TownScene.spawnPOIs). */
  world?: World | null;
  /** Place the Tezgâh Ustası here (opens the stall setup panel). Omit to place him with town.ts data instead. */
  npc?: { x: number; z: number; rotDeg?: number } | null;
}

/**
 * Mount the market district of the current scene: stalls, sellers, boards, F interaction, Pazarcı Modu, lobby connection.
 * `origin.zone` is 'town' for the capital's Pazar Meydanı or the village id; `origin.x/z` the centre of the spot grid (10 x 6 spots
 * 25 m x 15 m for the plaza, 4 x 3 for a village corner); `origin.yaw` rotates the grid (stall fronts face local +z).
 */
export function mountMarket(scene: THREE.Scene, origin: MarketOrigin, opts: MountMarketOpts = {}): MarketStalls {
  unmountMarket();
  const market = getMarket();
  market.init();
  market.mount(origin);
  void market.connect();
  mounted = new MarketStalls(scene, origin, opts.world ?? null, opts.npc ?? null);
  offPazarci = installPazarciMode();
  return mounted;
}

/** Remove the district (scene exit). The player's own open stall is closed first. Safe to call twice. */
export function unmountMarket(): void {
  if (!mounted) return;
  const m = mounted;
  mounted = null;
  offPazarci?.();
  offPazarci = null;
  try {
    getMarket().unmount();
    getMarket().disconnect();
  } finally {
    m.dispose();
  }
}

export function currentMarket(): MarketStalls | null {
  return mounted;
}
