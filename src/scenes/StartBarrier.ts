import * as THREE from 'three';
import { G } from '../game/G';
import { TILE_SIZE, type DoorDef, type DungeonDef } from '../types/dungeons';
import type { World } from '../world/World';
import type { BuiltDungeon } from '../world/DungeonBuilder';

const T = TILE_SIZE;

interface Panel {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  cells: [number, number][];
}

/** Opening line of a door in world metres, same convention as DungeonBuilder (tile in room a, `side` towards room b). */
function opening(d: DoorDef): { ax: number; az: number; bx: number; bz: number } {
  const width = Math.max(1, d.width ?? 1);
  const [tx, tz] = d.tile;
  if (d.side === 'n' || d.side === 's') {
    const j = d.side === 'n' ? tz : tz + 1;
    return { ax: tx * T, bx: (tx + width) * T, az: j * T, bz: j * T };
  }
  const i = d.side === 'w' ? tx : tx + 1;
  return { az: tz * T, bz: (tz + width) * T, ax: i * T, bx: i * T };
}

/**
 * GDD_CONTENT 5.3: "a barrier on the start room exit until the countdown ends". Mythic+ only: every door of the start room gets a
 * shimmering violet curtain that also closes its nav cells, so nobody can pull packs during the 10 s countdown. It dissolves when
 * the run clock starts (`G.mplus.state.started`, replicated to every peer), or after a safety timeout when the run never starts.
 * World system. OWNER: scenes module.
 */
export class StartBarrier {
  private panels: Panel[] = [];
  private tex: THREE.CanvasTexture | null = null;
  private geoms: THREE.PlaneGeometry[] = [];
  private lifted = false;
  private fade = 1;
  private clock = 0;
  private nav: BuiltDungeon['nav'];

  constructor(private o: { world: World; scene: THREE.Scene; def: DungeonDef; built: BuiltDungeon }) {
    this.nav = o.built.nav;
    const start = o.built.roomAt(o.built.start.x, o.built.start.z);
    if (!start) return;
    this.tex = this.makeTexture();
    for (const d of o.def.doors) {
      if (d.a !== start.id && d.b !== start.id) continue;
      this.addPanel(d);
    }
  }

  get count(): number {
    return this.panels.length;
  }

  private makeTexture(): THREE.CanvasTexture | null {
    try {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, 'rgba(255,255,255,0.05)');
      grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 16, 64);
      const t = new THREE.CanvasTexture(c);
      t.wrapT = THREE.RepeatWrapping;
      t.wrapS = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.repeat.set(1, 2);
      return t;
    } catch {
      return null;
    }
  }

  private addPanel(d: DoorDef): void {
    const { ax, az, bx, bz } = opening(d);
    const along = Math.abs(bx - ax) > Math.abs(bz - az);
    const len = Math.hypot(bx - ax, bz - az);
    const midx = (ax + bx) / 2, midz = (az + bz) / 2;
    const geo = new THREE.PlaneGeometry(Math.max(0.5, len - 1.2), 3.1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xa070ff, map: this.tex ?? undefined, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(midx, 1.6, midz);
    mesh.rotation.y = along ? 0 : Math.PI / 2;
    mesh.renderOrder = 5;
    this.o.scene.add(mesh);
    this.geoms.push(geo);
    // nav cells along the opening line (same lattice rule as the builder's boss gates: cell index = integer world metre)
    const cells: [number, number][] = [];
    const ca = along ? Math.round(Math.min(ax, bx)) : Math.round(Math.min(az, bz));
    const cb = along ? Math.round(Math.max(ax, bx)) : Math.round(Math.max(az, bz));
    for (let c = ca + 1; c < cb; c++) cells.push(along ? [c, Math.round(az)] : [Math.round(ax), c]);
    for (const [cx, cz] of cells) this.nav.setCell(cx, cz, 0);
    this.panels.push({ mesh, mat, cells });
  }

  private lift(): void {
    if (this.lifted) return;
    this.lifted = true;
    for (const p of this.panels) for (const [cx, cz] of p.cells) this.nav.setCell(cx, cz, 1);
    try {
      G.audio.play('door_open', { volume: 0.7, pitch: 1.2 });
      G.events.emit('camera:shake', { intensity: 0.08, duration: 0.2 });
    } catch {
      /* optional */
    }
  }

  update(dt: number): void {
    if (!this.panels.length) return;
    this.clock += dt;
    if (!this.lifted) {
      const st = G.mplus.state;
      if ((st && (st.started || st.completed || st.failed)) || this.clock > 120) this.lift();
    }
    if (this.lifted) {
      this.fade = Math.max(0, this.fade - dt / 0.6);
    }
    const pulse = 0.45 + Math.sin(this.clock * 5) * 0.1;
    if (this.tex) this.tex.offset.y -= dt * 0.6;
    for (const p of this.panels) {
      p.mat.opacity = pulse * this.fade;
      p.mesh.visible = this.fade > 0.01;
    }
  }

  dispose(): void {
    if (!this.lifted) for (const p of this.panels) for (const [cx, cz] of p.cells) this.nav.setCell(cx, cz, 1);
    for (const p of this.panels) {
      p.mesh.removeFromParent();
      p.mat.dispose();
    }
    for (const g of this.geoms) g.dispose();
    this.tex?.dispose();
    this.panels = [];
    this.geoms = [];
    this.tex = null;
    this.lifted = true;
  }
}
