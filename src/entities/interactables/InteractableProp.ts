import * as THREE from 'three';
import { Entity } from '../Entity';
import type { Interactable } from '../Interactable';
import type { Player } from '../Player';
import type { World } from '../../world/World';
import type { EntityKind } from '../../types/common';
import type { WorldLabelHandle } from '../../ui/UI';
import { G } from '../../game/G';
import { Assets } from '../../core/Assets';
import { radialGlowTexture } from '../../scenes/SceneKit';

/**
 * Base for the concrete town/dungeon interactables (portals, chests, font of power, boards, waypoints...).
 * Loads a generated PSX prop GLB, optionally blocks the nav grid around it, owns an optional world label.
 * OWNER: scenes module.
 */

/** Level (in the PointLight units the props were tuned with) at which a glow is fully opaque. */
const GLOW_FULL = 24;

let haloTexture: THREE.Texture | null = null;
/** One white radial halo shared by every prop glow (tinted per sprite). Never disposed: it outlives every prop. */
function halo(): THREE.Texture {
  haloTexture ??= radialGlowTexture(64, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)');
  return haloTexture;
}

/**
 * The glow a prop shows where it used to add a PointLight. Real point lights are no longer added to the scene: every light a prop
 * added or removed (portals, shrines, waypoints, chests load at different times) changed the scene's light count, which makes
 * three.js recompile every lit material, and each lit pixel paid for it. The sprite is additive and depth-tested; its opacity
 * follows the level the prop sets, so the existing per-frame animations keep working unchanged.
 */
export class PropGlow {
  readonly sprite: THREE.Sprite;
  private readonly mat: THREE.SpriteMaterial;
  private level = 0;

  constructor(color: number, distance: number, localPos: THREE.Vector3) {
    this.mat = new THREE.SpriteMaterial({
      map: halo(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.position.copy(localPos);
    this.sprite.scale.setScalar(0.8 + 0.1 * distance);
    this.sprite.renderOrder = 6;
  }

  /** Level in the units of the light this replaces (design intensity, about 0..30). */
  get intensity(): number {
    return this.level;
  }

  set intensity(v: number) {
    this.level = v;
    this.mat.opacity = Math.max(0, Math.min(1, v / GLOW_FULL)) * 0.85;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.mat.dispose();
  }
}

/**
 * Frees the materials of a model instance an entity cloned for itself (Assets.cloneMaterials). Textures are shared and stay alive.
 * Shared variants (Assets.sharedMaterial) are skipped: other instances draw them.
 */
export function disposeInstanceMaterials(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat && !Assets.isSharedMaterial(mat)) mat.dispose();
  });
}

export abstract class InteractableProp extends Entity implements Interactable {
  model: THREE.Object3D | null = null;
  interactRange = 3.4;
  /** Radius blocked on the nav grid when added to a world (0 = walk-through). */
  protected blockRadius = 0;
  protected time = Math.random() * 10;
  protected label: WorldLabelHandle | null = null;
  /** Glows standing in for the prop's lights (see PropGlow). */
  protected lights: PropGlow[] = [];
  /** Model roots whose materials this entity cloned for itself: freed on removal. */
  protected ownedRoots: THREE.Object3D[] = [];

  abstract get interactPrompt(): string;
  abstract interact(player: Player): void;

  constructor(id: number, kind: EntityKind = 'interactable') {
    super(id, kind);
  }

  /** Load + instantiate a prop; optionally give it its own materials / scale. */
  protected async loadModel(url: string, opts: { scale?: number; ownMaterials?: boolean; yaw?: number } = {}): Promise<THREE.Object3D> {
    await G.assets.load(url);
    const m = G.assets.instantiate(url);
    if (opts.ownMaterials) {
      Assets.cloneMaterials(m);
      this.ownedRoots.push(m);
    }
    if (opts.scale) m.scale.setScalar(opts.scale);
    if (opts.yaw) m.rotation.y = opts.yaw;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.model = m;
    this.object3d.add(m);
    return m;
  }

  protected adopted = false;

  /**
   * Use a model somebody else (the world builder) already renders: this entity is placed at it, owns no geometry and must not
   * animate or collide it (the builder does). Interaction, labels and extras still work.
   */
  protected adoptModel(obj: THREE.Object3D): void {
    this.model = obj;
    this.adopted = true;
    this.blockRadius = 0;
    obj.updateWorldMatrix(true, false);
    obj.getWorldPosition(this.object3d.position);
    this.object3d.rotation.y = obj.rotation.y;
    this.object3d.updateMatrixWorld(true);
  }

  /** World-space position of a named empty/mesh of the model (falls back to `fallback` in local space). */
  protected nodeLocal(name: string, fallback: THREE.Vector3): THREE.Vector3 {
    const n = this.model?.getObjectByName(name);
    if (!n || !this.model) return fallback.clone();
    this.model.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    n.getWorldPosition(v);
    return this.object3d.worldToLocal(v);
  }

  /** A glow at `localPos` at the level `intensity` (the PointLight this replaces had the same arguments). */
  protected addLight(color: number, intensity: number, distance: number, localPos: THREE.Vector3): PropGlow {
    const g = new PropGlow(color, distance, localPos);
    g.intensity = intensity;
    this.object3d.add(g.sprite);
    this.lights.push(g);
    return g;
  }

  protected setLabel(html: string, offsetY: number, className = 'efs-label-world', maxDistance = 40): void {
    this.label?.remove();
    try {
      this.label = G.ui.addWorldLabel(this.object3d, html, { offsetY, className, maxDistance });
    } catch {
      this.label = null;
    }
  }

  onAdded(world: World): void {
    super.onAdded(world);
    if (this.blockRadius > 0) world.nav.setCircle(this.position.x, this.position.z, this.blockRadius, false);
  }

  update(dt: number): void {
    this.time += dt;
    this.animate(dt);
  }

  protected animate(_dt: number): void {}

  onRemoved(): void {
    this.label?.remove();
    this.label = null;
    for (const g of this.lights) g.dispose();
    this.lights = [];
    for (const r of this.ownedRoots) disposeInstanceMaterials(r);
    this.ownedRoots = [];
    super.onRemoved();
  }
}

/** Rotates / bobs named nodes of a prop model (rune rings, crystals, shards). */
export function spinNode(model: THREE.Object3D | null, name: string, dy: number): void {
  const n = model?.getObjectByName(name);
  if (n) n.rotation.y += dy;
}
