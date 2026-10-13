import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Entity } from './Entity';
import type { Interactable } from './Interactable';
import type { Player } from './Player';
import { G } from '../game/G';
import { Assets } from '../core/Assets';
import { RARITY_COLORS, type Rarity } from '../types/common';
import type { ItemInstance } from '../types/items';
import type { VfxHandle } from '../vfx/VFX';
import { patchPSX } from '../render/psx';
import { getMaterial, GEM_COLORS, type GemType } from '../data/materials';
import { parseGemId } from '../data/gems';
import { ITEM_BASES } from '../data/itemBases';
import { LOOT } from '../data/loot';
import { itemDisplayName } from '../systems/ItemGen';

export type DropKind = 'item' | 'gold' | 'material' | 'globe';

export interface DropPayload {
  kind: DropKind;
  item?: ItemInstance;
  gold?: number;
  material?: { id: string; count: number };
  rarity: Rarity;
}

export interface LootDropOpts {
  /** Where the item starts (chest height of the corpse). */
  origin: THREE.Vector3;
  /** Where it lands. */
  target: THREE.Vector3;
  /** Seconds before it appears (stagger). */
  delay?: number;
  /** Flight height boost (boss fountain). */
  vy?: number;
}

const GRAVITY = 20;
const RESTITUTION = 0.3;

// ---------------------------------------------------------------- shared visual resources (never disposed per drop)
const _mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, emissive = 0, emissiveIntensity = 0.4, roughness = 0.7, metalness = 0.1): THREE.MeshStandardMaterial {
  const key = `${color}|${emissive}|${emissiveIntensity}|${roughness}|${metalness}`;
  let m = _mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: emissive || color, emissiveIntensity: emissive === 0 ? 0 : emissiveIntensity, roughness, metalness, flatShading: true });
    patchPSX(m);
    _mats.set(key, m);
  }
  return m;
}

let _coinGeo: THREE.BufferGeometry[] | null = null;
function coinGeos(): THREE.BufferGeometry[] {
  if (_coinGeo) return _coinGeo;
  const coin = () => new THREE.CylinderGeometry(0.17, 0.17, 0.045, 8);
  const build = (positions: [number, number, number, number][]) => {
    const parts = positions.map(([x, y, z, tilt]) => {
      const g = coin();
      g.rotateZ(tilt);
      g.translate(x, y, z);
      return g;
    });
    return mergeGeometries(parts)!;
  };
  const small = build([[0, 0.025, 0, 0], [0.22, 0.025, 0.05, 0], [-0.08, 0.07, 0.02, 0.2]]);
  const medium = build([[0, 0.025, 0, 0], [0.24, 0.025, 0.06, 0], [-0.22, 0.025, 0.1, 0], [0.05, 0.07, 0.02, 0], [0.12, 0.025, -0.24, 0], [-0.1, 0.075, 0.18, 0.15]]);
  const large = build([
    [0, 0.025, 0, 0], [0.25, 0.025, 0.07, 0], [-0.25, 0.025, 0.1, 0], [0.04, 0.07, 0.03, 0], [0.13, 0.025, -0.26, 0], [-0.14, 0.025, -0.2, 0],
    [0.2, 0.07, -0.1, 0.1], [-0.06, 0.115, 0.04, 0], [0.1, 0.12, 0.1, 0.2], [-0.2, 0.07, 0.0, 0.15], [0.0, 0.07, -0.18, 0],
  ]);
  _coinGeo = [small, medium, large];
  return _coinGeo;
}

let _bottleGeo: THREE.BufferGeometry | null = null;
function bottleGeo(): THREE.BufferGeometry {
  if (_bottleGeo) return _bottleGeo;
  const body = new THREE.SphereGeometry(0.17, 7, 5);
  body.translate(0, 0.19, 0);
  const neck = new THREE.CylinderGeometry(0.055, 0.07, 0.17, 6);
  neck.translate(0, 0.4, 0);
  const cork = new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6);
  cork.translate(0, 0.51, 0);
  _bottleGeo = mergeGeometries([body, neck, cork].map((g) => g.toNonIndexed()))!;
  return _bottleGeo;
}
const _shared: Record<string, THREE.BufferGeometry> = {};
function shared(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  return (_shared[key] ??= make());
}

const hex = (css: string) => new THREE.Color(css).getHex();

/**
 * A dropped item / gold pile / pouch item / health globe in the world. LOCAL ONLY (id from world.allocLocalId()).
 * Bounce-out arc (GDD 7.7): up 6-9 m/s, gravity 20, one bounce (restitution .3), squash, then bob + slow spin.
 * Rarity beam via G.vfx.lootBeam (with a built-in additive fallback), clickable rarity-coloured world label,
 * implements Interactable (F) and is auto-picked / magnetised by LootSystem.update.
 * OWNER: items module.
 */
export class LootDrop extends Entity implements Interactable {
  readonly drop: DropPayload;
  readonly interactRange = LOOT.interactRange;
  /** Visible bits (weapon model, bag, coins...) inside object3d, separate from the beam/label. */
  private visual = new THREE.Group();
  private pivot = new THREE.Group();
  private vel = new THREE.Vector3();
  private phase: 'delay' | 'fly' | 'bounce' | 'settle' | 'idle' = 'delay';
  private delay: number;
  private target: THREE.Vector3;
  private origin: THREE.Vector3;
  private t = 0;
  private spin = new THREE.Vector3();
  private baseRot = new THREE.Euler();
  private restY = 0.08;
  private bobPhase = Math.random() * 6.28;
  private bounceCount = 0;
  private squash = 0;
  private beam: VfxHandle | null = null;
  private fallbackBeam: THREE.Mesh | null = null;
  private fallbackDisc: THREE.Mesh | null = null;
  private labelHandle: { el: HTMLElement; setText(h: string): void; setVisible(v: boolean): void; remove(): void } | null = null;
  private labelFallback: HTMLElement | null = null;
  private labelChecked = false;
  private labelWanted = true;
  private labelShown = true;
  private ownedGeos: THREE.BufferGeometry[] = [];
  age = 0;
  landed = false;
  /** Seconds since landing. */
  sinceLanded = 0;
  /** LootSystem: being sucked toward the player. */
  magnet = false;
  magnetSpeed = 6;
  /** Click-to-pickup request (label click): pick up as soon as the drop reaches the player. */
  forcePickup = false;
  /** Pickup distance bookkeeping for the loot filter. */
  hiddenByFilter = false;

  constructor(id: number, drop: DropPayload, opts: LootDropOpts) {
    super(id, 'loot');
    this.drop = drop;
    this.radius = 0.4;
    this.height = 0.8;
    this.origin = opts.origin.clone();
    this.target = opts.target.clone();
    this.delay = opts.delay ?? 0;
    this.object3d.add(this.pivot);
    this.pivot.add(this.visual);
    this.object3d.position.copy(this.origin);
    this.object3d.visible = this.delay <= 0;
    const vy = opts.vy ?? 6 + Math.random() * 3;
    // flight time to reach the target height (restY) from the origin height
    const h0 = this.origin.y - this.restY;
    const tFlight = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * Math.max(0, h0))) / GRAVITY;
    this.vel.set((this.target.x - this.origin.x) / tFlight, vy, (this.target.z - this.origin.z) / tFlight);
    this.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 14);
    this.buildVisual();
    if (this.delay <= 0) this.phase = 'fly';
  }

  // ---------------------------------------------------------------- Interactable
  get interactPrompt(): string {
    const d = this.drop;
    if (d.kind === 'gold') return `Altını al: ${d.gold}`;
    if (d.kind === 'globe') return 'Can Küresi';
    if (d.kind === 'material') return `Al: ${getMaterial(d.material!.id)?.name ?? d.material!.id}${d.material!.count > 1 ? ' ×' + d.material!.count : ''}`;
    return `Eşyayı al: ${d.item ? itemDisplayName(d.item) : ''}`;
  }
  canInteract(_player: Player): boolean {
    return this.landed && !this.removed;
  }
  interact(_player: Player): void {
    G.loot.pickup(this);
  }

  /** Where this drop will land (for scatter spacing). */
  get landingSpot(): THREE.Vector3 {
    return this.target;
  }

  get color(): string {
    return RARITY_COLORS[this.drop.rarity] ?? '#ffffff';
  }
  get displayName(): string {
    const d = this.drop;
    if (d.kind === 'gold') return `${d.gold} Altın`;
    if (d.kind === 'globe') return 'Can Küresi';
    if (d.kind === 'material') return `${getMaterial(d.material!.id)?.name ?? d.material!.id}${d.material!.count > 1 ? ' ×' + d.material!.count : ''}`;
    return d.item ? itemDisplayName(d.item) : '?';
  }

  // ---------------------------------------------------------------- visuals
  private buildVisual(): void {
    const d = this.drop;
    const rc = hex(this.color);
    if (d.kind === 'gold') {
      const amount = d.gold ?? 1;
      const geos = coinGeos();
      const g = amount >= 200 ? geos[2] : amount >= 40 ? geos[1] : geos[0];
      const m = new THREE.Mesh(g, mat(0xe8b830, 0xffc830, 0.55, 0.45, 0.6));
      m.castShadow = false;
      this.visual.add(m);
      this.restY = 0.02;
      this.baseRot.set(0, Math.random() * 6.28, 0);
      return;
    }
    if (d.kind === 'globe') {
      const m = new THREE.Mesh(shared('globe', () => new THREE.IcosahedronGeometry(0.26, 1)), mat(0xe02030, 0xff2030, 1.4, 0.3, 0));
      m.position.y = 0.5;
      this.visual.add(m);
      this.restY = 0.35;
      this.spin.set(0, 2, 0);
      return;
    }
    if (d.kind === 'material') {
      this.buildMaterialVisual(d.material!.id, rc);
      return;
    }
    const item = d.item!;
    const base = ITEM_BASES[item.baseId];
    // weapons / shields / tomes use their own model
    if (base?.model) {
      this.restY = 0.1;
      const url = base.model;
      const place = () => {
        if (this.removed) return;
        const obj = G.assets.instantiate(url);
        this.fitModel(obj, base.category);
      };
      if (G.assets.has(url)) place();
      else G.assets.load(url).then(place).catch(() => {});
      this.addGlowDisc(rc);
      return;
    }
    // jewelry
    if (base && (base.category === 'ring' || base.category === 'amulet')) {
      const g = base.category === 'ring' ? shared('ring', () => new THREE.TorusGeometry(0.15, 0.045, 5, 10)) : shared('amulet', () => {
        const disc = new THREE.CylinderGeometry(0.14, 0.14, 0.05, 6);
        disc.rotateX(Math.PI / 2);
        const gem = new THREE.OctahedronGeometry(0.1, 0);
        gem.translate(0, 0, 0.05);
        return mergeGeometries([disc.toNonIndexed(), gem])!;
      });
      const m = new THREE.Mesh(g, mat(0xd6b04a, rc, 0.5, 0.35, 0.7));
      m.position.y = 0.3;
      m.rotation.x = base.category === 'ring' ? Math.PI / 2.4 : 0;
      this.visual.add(m);
      this.restY = 0.25;
      this.spin.set(0, 1.4, 0);
      this.addGlowDisc(rc);
      return;
    }
    // armour, belts and everything else: the generated loot bag
    const url = '/assets/models/gen/props/loot_bag.glb';
    const place = () => {
      if (this.removed) return;
      const obj = G.assets.instantiate(url);
      obj.scale.setScalar(1.0);
      this.visual.add(obj);
      // lighten the bag by the rarity colour so it reads at a distance (one shared material per rarity colour)
      const glow = item.rarity === 'rare' ? 0.15 : 0.3;
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && (item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary' || item.rarity === 'set')) {
          mesh.material = Assets.sharedMaterial(mesh.material as THREE.MeshStandardMaterial, `loot|${rc}|${glow}`, (c) => {
            if ('emissive' in c) {
              c.emissive = new THREE.Color(rc);
              c.emissiveIntensity = glow;
            }
          });
        }
      });
    };
    if (G.assets.has(url)) place();
    else G.assets.load(url).then(place).catch(() => {});
    this.restY = 0.0;
    this.baseRot.set(0, Math.random() * 6.28, 0);
    this.spin.set(0, 0, 0);
    this.addGlowDisc(rc);
  }

  private buildMaterialVisual(id: string, rc: number): void {
    const def = getMaterial(id);
    const gem = parseGemId(id);
    let mesh: THREE.Mesh;
    if (gem) {
      mesh = new THREE.Mesh(shared('gem', () => new THREE.OctahedronGeometry(0.2, 0)), mat(hex(GEM_COLORS[gem.type as GemType]), hex(GEM_COLORS[gem.type as GemType]), 0.9, 0.2, 0.1));
      mesh.position.y = 0.38;
      mesh.scale.set(1, 1.4, 1);
      this.spin.set(0, 2.2, 0);
      this.restY = 0.2;
    } else if (id.startsWith('pot_hp')) {
      mesh = new THREE.Mesh(bottleGeo(), mat(0xd02838, 0xff3040, 0.55, 0.3, 0.1));
      this.spin.set(0, 1.5, 0);
      this.restY = 0.1;
    } else if (id.startsWith('pot_res')) {
      mesh = new THREE.Mesh(bottleGeo(), mat(0x2f6fe0, 0x4f9fff, 0.55, 0.3, 0.1));
      this.spin.set(0, 1.5, 0);
      this.restY = 0.1;
    } else if (id.startsWith('elixir')) {
      mesh = new THREE.Mesh(bottleGeo(), mat(0x6fd05a, 0x8fff6a, 0.6, 0.3, 0.1));
      this.spin.set(0, 1.5, 0);
      this.restY = 0.1;
    } else if (def?.kind === 'upgrade' && (id === 'kutsama_kagidi' || id === 'demirci_el_kitabi') || id.includes('kilit') || id.includes('efsun') && id !== 'efsun_nesnesi' || id === 'takviye_nesnesi' || id.startsWith('scroll')) {
      mesh = new THREE.Mesh(shared('scroll', () => {
        const g = new THREE.CylinderGeometry(0.07, 0.07, 0.42, 6);
        g.rotateZ(Math.PI / 2);
        return g;
      }), mat(0xe8d49a, rc, 0.35, 0.8, 0));
      mesh.position.y = 0.12;
      this.spin.set(0, 1.2, 0);
      this.restY = 0.1;
    } else if (id === 'efsun_nesnesi' || id === 'oyma_kalemi') {
      mesh = new THREE.Mesh(shared('orb', () => new THREE.IcosahedronGeometry(0.2, 0)), mat(0xb060ff, 0xc890ff, 1.0, 0.3, 0.1));
      mesh.position.y = 0.4;
      this.spin.set(0, 2.5, 0);
      this.restY = 0.2;
    } else {
      mesh = new THREE.Mesh(shared('shard', () => new THREE.IcosahedronGeometry(0.19, 0)), mat(0x9a8f80, rc, 0.5, 0.5, 0.2));
      mesh.position.y = 0.3;
      mesh.scale.set(1, 1.3, 0.9);
      this.spin.set(0, 1.6, 0);
      this.restY = 0.15;
    }
    this.visual.add(mesh);
  }

  /** Flat additive disc under items so their position reads on the ground. */
  private addGlowDisc(color: number): void {
    const r = this.drop.rarity;
    if (r === 'poor' || r === 'common') return;
    const disc = new THREE.Mesh(
      shared('disc', () => new THREE.CircleGeometry(0.7, 16).rotateX(-Math.PI / 2)),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: r === 'uncommon' ? 0.22 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    disc.position.y = 0.02 - this.restY;
    disc.visible = false;
    this.fallbackDisc = disc;
    this.pivot.add(disc);
  }

  /** Fit a GLB weapon/shield model to the ground: scaled to ~1.1 m, lying flat or tilted. */
  private fitModel(obj: THREE.Object3D, category: string): void {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const target = category === 'shield' ? 0.85 : category === 'tome' ? 0.55 : category === 'staff' ? 1.5 : category === 'axe2h' ? 1.3 : 1.1;
    const s = target / Math.max(0.01, maxDim);
    obj.scale.multiplyScalar(s);
    const wrap = new THREE.Group();
    wrap.add(obj);
    // center the model on the wrapper
    const b2 = new THREE.Box3().setFromObject(obj);
    const c = b2.getCenter(new THREE.Vector3());
    obj.position.sub(c);
    if (category === 'shield' || category === 'tome') {
      wrap.rotation.x = -0.35;
      wrap.position.y = 0.42;
      this.spin.set(0, 1.0, 0);
    } else {
      wrap.rotation.z = Math.PI / 2; // blade along X, lying down
      wrap.position.y = 0.16;
      this.spin.set(0, 0.9, 0);
    }
    this.visual.add(wrap);
  }

  /** Called when the drop reaches the ground the first time. */
  private onFirstLand(): void {
    const d = this.drop;
    this.landed = true;
    this.sinceLanded = 0;
    this.squash = 0.14;
    G.loot.onDropLanded(this);
    // beam
    const r = d.rarity;
    const wantsBeam = d.kind === 'item' && (r === 'rare' || r === 'epic' || r === 'legendary' || r === 'set' || r === 'uncommon');
    if (wantsBeam && !this.hiddenByFilter) this.attachBeam();
    if (this.fallbackDisc) this.fallbackDisc.visible = !this.hiddenByFilter;
    if (d.kind === 'gold') G.vfx.spawn('gold_sparkle', this.object3d.position.clone().setY(0.2), { scale: Math.min(1.6, 0.8 + (d.gold ?? 1) / 400) });
    if (d.kind === 'globe') G.vfx.spawn('heal_loop', this.object3d.position.clone().setY(0.3), { duration: 1.2, scale: 0.6 });
  }

  attachBeam(): void {
    if (this.beam || this.fallbackBeam) return;
    const r = this.drop.rarity;
    const handle = G.vfx.lootBeam(this.object3d, r);
    this.beam = handle;
    if (handle.alive) return;
    // VFX module has no implementation (yet): simple additive pillar.
    const height = r === 'legendary' || r === 'set' ? 8 : r === 'epic' ? 5 : r === 'rare' ? 3 : 1.2;
    const radius = r === 'legendary' || r === 'set' ? 0.2 : r === 'epic' ? 0.16 : 0.12;
    const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 8, 1, true);
    geo.translate(0, height / 2, 0);
    const m = new THREE.MeshBasicMaterial({ color: hex(this.color), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.y = -this.restY;
    this.pivot.add(mesh);
    this.fallbackBeam = mesh;
    this.ownedGeos.push(geo);
  }

  detachBeam(): void {
    try {
      this.beam?.stop();
    } catch {
      /* ignore */
    }
    this.beam = null;
    if (this.fallbackBeam) {
      this.fallbackBeam.removeFromParent();
      (this.fallbackBeam.material as THREE.Material).dispose();
      this.fallbackBeam = null;
    }
  }

  // ---------------------------------------------------------------- label
  /** Create the clickable world label (called by LootSystem once the drop landed). */
  createLabel(html: string, offsetY: number, maxDistance: number): void {
    try {
      // maxDistance is measured from the CAMERA by the HUD: add the third-person camera distance so labels near the player stay readable
      const camDist = G.settings?.data.cameraDistance ?? 9;
      this.labelHandle = G.ui.addWorldLabel(this.object3d, html, { offsetY, className: 'loot-label', maxDistance: maxDistance + camDist + 6, onClick: () => G.loot.clickPickup(this), stackGroup: 'loot' });
    } catch (e) {
      console.warn('[loot] addWorldLabel failed', e);
      this.labelHandle = null;
    }
    this.labelChecked = false;
  }

  setLabelVisible(v: boolean): void {
    this.labelWanted = v;
    if (v === this.labelShown) return;
    this.labelShown = v;
    this.labelHandle?.setVisible(v);
    if (this.labelFallback) this.labelFallback.style.display = v ? 'block' : 'none';
  }

  /** LootSystem: switch to the built-in DOM label layer when the HUD does not implement world labels. */
  private ensureLabelFallback(): void {
    const h = this.labelHandle;
    if (h && h.el.isConnected) return;
    if (!h && this.labelFallback) return;
    // handle missing or detached: use own element
    try {
      h?.remove();
    } catch {
      /* ignore */
    }
    this.labelHandle = null;
    const host = document.getElementById('loot-label-layer') ?? LootDrop.makeLabelLayer();
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'loot-label-fallback ui-capture';
    el.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-100%);padding:1px 7px;background:rgba(8,6,4,.72);color:${this.color};border:1px solid ${this.color}66;border-radius:2px;font:700 13px/1.25 'Alegreya Sans',system-ui,sans-serif;letter-spacing:.2px;text-shadow:0 1px 0 #000;white-space:nowrap;cursor:pointer;pointer-events:auto;user-select:none;will-change:transform;`;
    el.textContent = this.displayName;
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      G.loot.clickPickup(this);
    });
    host.appendChild(el);
    this.labelFallback = el;
    if (!this.labelWanted) el.style.display = 'none';
  }

  static makeLabelLayer(): HTMLElement | null {
    const root = document.getElementById('ui-root');
    if (!root) return null;
    const layer = document.createElement('div');
    layer.id = 'loot-label-layer';
    layer.className = 'ui-passthrough';
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:40;';
    root.appendChild(layer);
    return layer;
  }

  private static _v = new THREE.Vector3();
  private updateFallbackLabel(): void {
    const el = this.labelFallback;
    if (!el || !this.labelShown) return;
    const cam = G.engine?.activeCamera;
    const canvas = G.engine?.canvas;
    if (!cam || !canvas) return;
    const v = LootDrop._v.copy(this.object3d.position);
    v.y += 1.0 + (this.drop.kind === 'item' ? 0.2 : 0);
    v.project(cam);
    if (v.z > 1 || v.z < -1) {
      el.style.visibility = 'hidden';
      return;
    }
    el.style.visibility = 'visible';
    const rect = canvas.getBoundingClientRect();
    const x = (v.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
  }

  // ---------------------------------------------------------------- update
  update(dt: number): void {
    try {
      this.step(dt);
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        console.error('[loot] drop update failed', e);
      }
    }
  }

  private warned = false;
  private step(dt: number): void {
    this.age += dt;
    const pos = this.object3d.position;
    if (this.phase === 'delay') {
      this.delay -= dt;
      if (this.delay > 0) return;
      this.object3d.visible = true;
      this.phase = 'fly';
      dt = Math.min(dt, 0.016);
    }
    if (this.magnet && this.landed) {
      this.updateMagnet(dt);
      this.updateFallbackLabel();
      return;
    }
    switch (this.phase) {
      case 'fly':
      case 'bounce': {
        this.vel.y -= GRAVITY * dt;
        pos.x += this.vel.x * dt;
        pos.z += this.vel.z * dt;
        pos.y += this.vel.y * dt;
        this.pivot.rotation.x += this.spin.x * dt;
        this.pivot.rotation.y += this.spin.y * dt;
        this.pivot.rotation.z += this.spin.z * dt;
        if (pos.y <= this.restY && this.vel.y < 0) {
          pos.y = this.restY;
          this.bounceCount++;
          if (this.bounceCount === 1) {
            this.onFirstLand();
            // one bounce
            this.vel.y = -this.vel.y * RESTITUTION;
            this.vel.x *= 0.22;
            this.vel.z *= 0.22;
            this.phase = 'bounce';
            this.spin.multiplyScalar(0.3);
          } else {
            this.vel.set(0, 0, 0);
            this.phase = 'settle';
            this.t = 0;
            this.squash = 0.1;
          }
        }
        break;
      }
      case 'settle': {
        this.t += dt;
        // ease the tumble back to the resting orientation
        const k = 1 - Math.exp(-14 * dt);
        this.pivot.rotation.x += (this.baseRot.x - this.pivot.rotation.x) * k;
        this.pivot.rotation.z += (this.baseRot.z - this.pivot.rotation.z) * k;
        this.pivot.rotation.y += this.spin.y * dt * 0.5;
        if (this.t > 0.25) this.phase = 'idle';
        break;
      }
      case 'idle': {
        this.sinceLanded += dt;
        this.pivot.rotation.x += (this.baseRot.x - this.pivot.rotation.x) * (1 - Math.exp(-10 * dt));
        this.pivot.rotation.z += (this.baseRot.z - this.pivot.rotation.z) * (1 - Math.exp(-10 * dt));
        this.pivot.rotation.y += this.spin.y * dt;
        const bob = this.drop.kind === 'gold' ? 0 : Math.sin(this.age * 2.2 + this.bobPhase) * 0.05;
        pos.y = this.restY + bob + (this.drop.kind === 'globe' ? 0.15 : 0);
        break;
      }
    }
    if (this.landed && this.phase !== 'idle') this.sinceLanded += dt;
    // squash & stretch
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt);
      const s = Math.sin((this.squash / 0.14) * Math.PI) * 0.25;
      this.visual.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
    } else this.visual.scale.set(1, 1, 1);
    // epic / legendary / set: an expanding ground ring pulses under the drop (every 1.2 s for legendary and set)
    if (this.fallbackDisc && this.fallbackDisc.visible) {
      const r = this.drop.rarity;
      if (r === 'epic' || r === 'legendary' || r === 'set') {
        const per = r === 'epic' ? 2 : 1.2;
        const ph = ((this.age + this.bobPhase) % per) / per;
        this.fallbackDisc.scale.setScalar(0.7 + ph * 0.75);
        (this.fallbackDisc.material as THREE.MeshBasicMaterial).opacity = (1 - ph * ph) * (r === 'epic' ? 0.4 : 0.6);
      }
    }
    // pulse the fallback beam
    if (this.fallbackBeam) {
      const m = this.fallbackBeam.material as THREE.MeshBasicMaterial;
      m.opacity = 0.32 + Math.sin(this.age * 3) * 0.1;
    }
    if (this.landed && !this.labelChecked && this.sinceLanded > 0.06) {
      this.labelChecked = true;
      this.ensureLabelFallback();
    }
    if (this.labelFallback) this.updateFallbackLabel();
  }

  private updateMagnet(dt: number): void {
    const p = G.world?.localPlayer ?? G.player;
    if (!p) return;
    this.magnetSpeed = Math.min(26, this.magnetSpeed + 38 * dt);
    const pos = this.object3d.position;
    const tx = p.position.x, tz = p.position.z, ty = p.position.y + 0.9;
    const dx = tx - pos.x, dz = tz - pos.z, dy = ty - pos.y;
    const d = Math.hypot(dx, dz, dy) || 1;
    const step = Math.min(d, this.magnetSpeed * dt);
    pos.x += (dx / d) * step;
    pos.y += (dy / d) * step;
    pos.z += (dz / d) * step;
    this.pivot.rotation.y += 8 * dt;
  }

  /** Distance on the ground plane to a point. */
  distTo(x: number, z: number): number {
    return Math.hypot(this.object3d.position.x - x, this.object3d.position.z - z);
  }

  onRemoved(): void {
    this.detachBeam();
    try {
      this.labelHandle?.remove();
    } catch {
      /* ignore */
    }
    this.labelHandle = null;
    this.labelFallback?.remove();
    this.labelFallback = null;
    if (this.fallbackDisc) (this.fallbackDisc.material as THREE.Material).dispose();
    for (const g of this.ownedGeos) g.dispose();
    this.ownedGeos = [];
    super.onRemoved();
  }
}
