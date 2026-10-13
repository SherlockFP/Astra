import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { getDungeon } from '../../data/dungeons';
import type { VfxHandle } from '../../vfx/VFX';
import { propUrl } from '../../scenes/SceneKit';
import type { DungeonParams } from '../../scenes/scenes';
import { openWorldParams } from '../../scenes/world/params';

/** Dungeon portal colours from GDD_CONTENT 2.3. */
export const PORTAL_TINTS: Record<string, number> = {
  kemik_mahzeni: 0x7affc0,
  kizil_dokumhane: 0xff6a20,
  buzul_tahti: 0x80c8ff,
  golge_tapinagi: 0xb060ff,
};

interface PortalMaterials {
  mat: THREE.MeshStandardMaterial;
  maps: THREE.Texture[];
}

/** Prepare the swirl surface of mplus_portal.glb: own material + own texture copies, tinted, swirl centre set. */
function preparePortalSurface(model: THREE.Object3D, tint: number): PortalMaterials | null {
  const surf = model.getObjectByName('portal_surface') as THREE.Mesh | undefined;
  if (!surf || !surf.isMesh) return null;
  const instanceMats = Array.isArray(surf.material) ? [...surf.material] : [surf.material];
  const src = instanceMats[0] as THREE.MeshStandardMaterial;
  const mat = src.clone();
  const maps: THREE.Texture[] = [];
  for (const key of ['map', 'emissiveMap'] as const) {
    const t = mat[key];
    if (t) {
      const c = t.clone();
      c.center.set(0.5, 0.5);
      c.needsUpdate = true;
      mat[key] = c;
      maps.push(c);
    }
  }
  mat.color.set(tint);
  if (mat.emissive) mat.emissive.set(tint);
  mat.emissiveIntensity = Math.max(mat.emissiveIntensity, 1.4);
  mat.transparent = true;
  surf.material = mat;
  // the per-instance copies loadModel made are replaced by `mat` and nothing else references them
  for (const m of instanceMats) m?.dispose();
  return { mat, maps };
}

/**
 * A Mythic+/dungeon portal in the Kadim Kapılar Salonu. Interact opens the keystone panel for this dungeon
 * (difficulty / key selection happens there). Levels below the dungeon's recommended level only change the label colour.
 * OWNER: scenes module.
 */
export class DungeonPortal extends InteractableProp {
  readonly dungeonId: string;
  private dungeonName: string;
  private minLevel: number;
  private tint: number;
  private surface: PortalMaterials | null = null;
  private swirl: VfxHandle | null = null;
  private lightRef: PropGlow | null = null;

  constructor(id: number, opts: { dungeonId: string; name?: string; tint?: number; minLevel?: number }) {
    super(id);
    this.dungeonId = opts.dungeonId;
    const def = getDungeon(opts.dungeonId);
    this.dungeonName = opts.name ?? def?.name ?? opts.dungeonId;
    this.minLevel = opts.minLevel ?? def?.levelRange?.[0] ?? 1;
    this.tint = opts.tint ?? PORTAL_TINTS[opts.dungeonId] ?? 0xb060ff;
    this.interactRange = 5.5;
    this.radius = 2.4;
    this.height = 7;
  }

  get interactPrompt(): string {
    return `${this.dungeonName}: Zindan Bulucu`;
  }

  async load(scale = 0.9): Promise<void> {
    const m = await this.loadModel(propUrl('mplus_portal'), { scale, ownMaterials: true });
    this.surface = preparePortalSurface(m, this.tint);
    const lp = this.nodeLocal('light_0', new THREE.Vector3(0, 3.2 * scale, 0.2));
    this.lightRef = this.addLight(this.tint, 26, 15, lp);
    const lvl = G.character?.level ?? 1;
    const lock = lvl < this.minLevel;
    this.setLabel(
      `<div class="efs-wl"><div class="n" style="color:#${this.tint.toString(16).padStart(6, '0')}">${this.dungeonName}</div><div class="s" style="color:${lock ? '#ff8a7a' : '#d6c196'}">Önerilen seviye ${this.minLevel}</div></div>`,
      7.4 * scale,
      'efs-wl-wrap',
      60,
    );
  }

  onAdded(world: import('../../world/World').World): void {
    super.onAdded(world);
    // the two pillars block, the opening stays walkable
    const s = (this.model?.scale.x ?? 1) * 3.1;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    for (const side of [-1, 1]) world.nav.setCircle(this.position.x + c * s * side, this.position.z - sn * s * side, 0.9, false);
    try {
      const p = this.pointAt(0.38);
      this.swirl = G.vfx.spawn('portal_swirl', p, { color: this.tint, scale: 1.3 * (this.model?.scale.x ?? 1) });
    } catch {
      this.swirl = null;
    }
  }

  interact(_player: Player): void {
    G.audio.play('portal_enter', { volume: 0.5 });
    G.ui.openPanel('finder', { dungeonId: this.dungeonId });
  }

  protected animate(dt: number): void {
    const t = this.time;
    if (this.surface) {
      for (const tex of this.surface.maps) tex.rotation = t * 0.9;
      this.surface.mat.emissiveIntensity = 1.5 + Math.sin(t * 2.3) * 0.35;
    }
    if (this.lightRef) this.lightRef.intensity = 24 + Math.sin(t * 3.1) * 4 + Math.sin(t * 7.7) * 1.5;
    void dt;
  }

  onRemoved(): void {
    this.swirl?.stop();
    super.onRemoved();
  }
}

/**
 * Exit portal at the end of a dungeon run: returns the whole party (host) or asks the host (client) to go back to town.
 * OWNER: scenes module.
 */
export class ExitPortal extends InteractableProp {
  private surface: PortalMaterials | null = null;
  private swirl: VfxHandle | null = null;
  private lightRef: PropGlow | null = null;
  private tint = 0x70ffd0;
  private used = false;
  private spawnAt: 'portal' | 'south';
  /** Run started from a world entrance (GDD_OPENWORLD §9.3): the exit goes back to that open-world spot, not to town. */
  private readonly returnTo: DungeonParams['returnTo'];

  constructor(id: number, opts: { spawnAt?: 'portal' | 'south'; returnTo?: DungeonParams['returnTo'] } = {}) {
    super(id);
    this.spawnAt = opts.spawnAt ?? 'portal';
    this.returnTo = opts.returnTo;
    this.interactRange = 4.6;
    this.radius = 1.6;
    this.height = 5;
  }

  get interactPrompt(): string {
    return 'Kuzgunkale\'ye Dön';
  }

  async load(scale = 0.62): Promise<void> {
    const m = await this.loadModel(propUrl('mplus_portal'), { scale, ownMaterials: true });
    this.surface = preparePortalSurface(m, this.tint);
    this.lightRef = this.addLight(this.tint, 22, 13, this.nodeLocal('light_0', new THREE.Vector3(0, 2.2, 0.2)));
    this.setLabel('<div class="efs-wl"><div class="n" style="color:#70ffd0">Çıkış Portalı</div><div class="s" style="color:#d6c196">Kuzgunkale\'ye dön</div></div>', 5, 'efs-wl-wrap', 50);
  }

  onAdded(world: import('../../world/World').World): void {
    super.onAdded(world);
    try {
      this.swirl = G.vfx.spawn('portal_swirl', this.pointAt(0.4), { color: this.tint, scale: 0.9 });
    } catch {
      this.swirl = null;
    }
    try {
      G.vfx.spawn('respawn', this.position, { scale: 1.4 });
    } catch {
      /* optional */
    }
  }

  canInteract(): boolean {
    return !this.used;
  }

  interact(_player: Player): void {
    if (this.used) return;
    this.used = true;
    G.audio.play('portal_enter');
    if (this.returnTo) {
      // back to the open-world map, at the entrance the run came from
      const back = openWorldParams(this.returnTo.dungeonId, this.returnTo.spawn);
      if (G.net.isAuthority) G.net.requestScene('dungeon', back);
      else G.net.requestSceneFromHost('dungeon', back);
    } else {
      const params = { spawnAt: this.spawnAt };
      if (G.net.isAuthority) G.net.requestScene('town', params);
      else G.net.requestSceneFromHost('town', params);
    }
    // allow another try if the host did not move us (denied request)
    setTimeout(() => {
      this.used = false;
    }, 4000);
  }

  protected animate(): void {
    const t = this.time;
    if (this.surface) {
      for (const tex of this.surface.maps) tex.rotation = t * 1.1;
      this.surface.mat.emissiveIntensity = 1.6 + Math.sin(t * 2.7) * 0.4;
    }
    if (this.lightRef) this.lightRef.intensity = 22 + Math.sin(t * 3.7) * 4;
  }

  onRemoved(): void {
    this.swirl?.stop();
    super.onRemoved();
  }
}
