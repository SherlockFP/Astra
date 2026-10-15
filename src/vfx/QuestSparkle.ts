import * as THREE from 'three';
import { G } from '../game/G';
import type { Player } from '../entities/Player';
import { QuestProp } from '../entities/interactables/QuestProp';

/**
 * Quest interactables of an ACTIVE objective (sacks, crystals, banners, use altars) get a soft golden halo on the ground and a few
 * sparkles rising from it (the WoW Midnight quest-object look). Shown only while the prop is interactable (an active quest still
 * wants it: QuestProp.canInteract), not empty (its save flag `qprop.<key>` runs to the respawn time) and within SHOW_M metres.
 * Built once per prop and attached to its object3d (it moves and goes with the prop); one shared texture; no allocation per frame.
 * Fed from VFX.update. OWNER: vfx module.
 */

/** Halos are drawn only this close (m). */
const SHOW_M = 60;
/** The wanted-state of every prop is re-read this often (s). */
const RECHECK_S = 0.25;
const SPARKS = 9;

let glowTex: THREE.Texture | null = null;

/** Soft round gold dot, shared by the halo sprite and the sparkles. */
function radialTex(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,236,160,0.85)');
    grd.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

interface Halo {
  root: THREE.Group;
  ground: THREE.Sprite;
  sparks: THREE.Points;
  pos: Float32Array;
  geo: THREE.BufferGeometry;
  /** Per spark: its start phase in [0, 1). */
  seed: Float32Array;
  wanted: boolean;
}

function build(prop: QuestProp): Halo {
  const tex = radialTex();
  const root = new THREE.Group();
  const ground = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color: 0xffd65a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ground.position.set(0, 0.25, 0);
  ground.scale.set(2.2, 2.2, 1);
  const pos = new Float32Array(SPARKS * 3);
  const seed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) seed[i] = (i * 0.618034) % 1;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ map: tex, color: 0xffe9a0, size: 0.22, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  // the positions move every frame: the bounds computed once would cull the sparkles away
  sparks.frustumCulled = false;
  root.add(ground, sparks);
  root.visible = false;
  prop.object3d.add(root);
  return { root, ground, sparks, pos, geo, seed, wanted: false };
}

/** A quest prop shows its halo while an active objective wants it, it is not empty and the player is near. */
function wantedNow(p: QuestProp, me: Player): boolean {
  if (!p.canInteract(me)) return false;
  const until = Number(G.character?.save.flags[`qprop.${p.key}`] ?? 0);
  if (until > Date.now()) return false;
  return Math.hypot(p.position.x - me.position.x, p.position.z - me.position.z) < SHOW_M;
}

export class QuestSparkles {
  private readonly halos = new Map<QuestProp, Halo>();
  private world: unknown = null;
  private t = 0;
  private scanIn = 0;

  update(dt: number): void {
    this.t += dt;
    const w = G.world;
    const me = G.player;
    // another world (town, dungeon, the next zone): the old props are gone with it
    if (w !== this.world) {
      for (const h of this.halos.values()) h.root.removeFromParent();
      this.halos.clear();
      this.world = w;
    }
    if (!w || !me) return;
    this.scanIn -= dt;
    if (this.scanIn <= 0) {
      this.scanIn = RECHECK_S;
      for (const e of w.entities.values()) {
        if (!(e instanceof QuestProp) || e.removed || this.halos.has(e)) continue;
        this.halos.set(e, build(e));
      }
      for (const [p, h] of this.halos) {
        if (p.removed) {
          h.root.removeFromParent();
          this.halos.delete(p);
          continue;
        }
        h.wanted = wantedNow(p, me);
      }
    }
    for (const h of this.halos.values()) {
      h.root.visible = h.wanted;
      if (h.wanted) this.animate(h);
    }
  }

  private animate(h: Halo): void {
    const t = this.t;
    const arr = h.pos;
    for (let i = 0; i < SPARKS; i++) {
      const u = (t * 0.45 + h.seed[i]) % 1;
      const a = h.seed[i] * Math.PI * 2 + t * 0.9 * (i % 2 ? 1 : -1);
      const r = 0.35 + 0.25 * u;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = 0.1 + u * 1.5;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    (h.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    h.ground.material.opacity = 0.55 + 0.25 * Math.sin(t * 3);
  }
}
