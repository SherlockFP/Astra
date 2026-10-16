import * as THREE from 'three';
import { G } from '../game/G';

/**
 * Objective beam (the WoW waypoint light, the modern MMO quest beacon): a tall soft column and a floating medallion over the point
 * the objective arrow aims at, so the goal reads from across the zone. Off up close (the arrow and the medallion carry it) and faded
 * in over FADE_M metres past NEAR_M. Gold for talk / turn-in, blue for kill / explore, violet for a dungeon, as the arrow. One shared
 * texture per kind, no allocation per frame. Fed by ObjectiveArrow through VFX.setObjectiveBeam. OWNER: vfx module.
 */

/** Beam height and base radius (m). */
const BEAM_H = 60;
const BEAM_R = 0.55;
/** Closer than NEAR_M the beam is off; it fades in over FADE_M more. */
const NEAR_M = 12;
const FADE_M = 8;
/** Medallion height above the ground (m) and its bob (m, amplitude). */
const MEDAL_Y = 3.4;
const BOB_M = 0.22;
const BEAM_OPACITY = 0.5;

/** The target the beam marks (a structural copy of the HUD's GuideTarget, so vfx does not import the HUD). */
export interface BeamTarget {
  x: number;
  z: number;
  kind: string;
  key: string;
}

const COLOR: Record<string, number> = { talk: 0xffd65a, turnin: 0xffd65a, kill: 0x5aa0ff, explore: 0x5aa0ff, dungeon: 0xa77bff };
const GLYPH: Record<string, string> = { talk: '!', turnin: '?' };

let radialCache: THREE.Texture | null = null;
function radialTexture(): THREE.Texture {
  if (radialCache) return radialCache;
  radialCache = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
  return radialCache;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  return new THREE.CanvasTexture(c);
}

export class ObjectiveBeam {
  readonly root = new THREE.Group();
  private readonly beamMat: THREE.MeshBasicMaterial;
  private readonly groundMat: THREE.SpriteMaterial;
  private readonly medalMat: THREE.SpriteMaterial;
  private readonly medal: THREE.Sprite;
  private readonly medalTex = new Map<string, THREE.Texture>();
  private target: BeamTarget | null = null;
  private shownKey = '';
  private t = 0;

  constructor() {
    // bright at the ground, fading up the column: the cylinder's v=1 end (its bottom) reads canvas row 0 (flipY), so row 0 is bright
    const column = canvasTexture(4, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 256);
    });
    this.beamMat = new THREE.MeshBasicMaterial({
      map: column,
      color: COLOR.talk,
      transparent: true,
      opacity: BEAM_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(BEAM_R * 0.5, BEAM_R, BEAM_H, 12, 1, true), this.beamMat);
    beam.position.y = BEAM_H / 2;
    beam.renderOrder = 5;
    this.groundMat = new THREE.SpriteMaterial({ map: radialTexture(), color: COLOR.talk, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const ground = new THREE.Sprite(this.groundMat);
    ground.scale.set(5, 5, 1);
    ground.position.y = 0.4;
    this.medalMat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false });
    this.medal = new THREE.Sprite(this.medalMat);
    this.medal.scale.set(1.5, 1.5, 1);
    this.medal.position.y = MEDAL_Y;
    this.root.add(beam, ground, this.medal);
    this.root.visible = false;
  }

  /** The target to mark, or null for no beam. ObjectiveArrow sets it at 2 Hz. */
  set(t: BeamTarget | null): void {
    this.target = t;
    if (!t || t.key === this.shownKey) return;
    this.shownKey = t.key;
    const col = COLOR[t.kind] ?? COLOR.talk;
    this.beamMat.color.setHex(col);
    this.groundMat.color.setHex(col);
    this.medalMat.map = this.medallion(t.kind, col);
    this.medalMat.needsUpdate = true;
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.target;
    const p = G.player;
    if (!t || !p) {
      this.root.visible = false;
      return;
    }
    const d = Math.hypot(t.x - p.position.x, t.z - p.position.z);
    const a = Math.min(1, Math.max(0, (d - NEAR_M) / FADE_M));
    if (a <= 0) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.position.set(t.x, G.world?.groundY(t.x, t.z) ?? 0, t.z);
    this.beamMat.opacity = BEAM_OPACITY * a;
    this.groundMat.opacity = 0.7 * a;
    this.medalMat.opacity = a;
    this.medal.position.y = MEDAL_Y + Math.sin(this.t * 2.2) * BOB_M;
  }

  /** A diamond medallion in the kind's colour, with the arrow's glyph (! offer / ? turn-in) or a dot. One texture per kind. */
  private medallion(kind: string, col: number): THREE.Texture {
    const have = this.medalTex.get(kind);
    if (have) return have;
    const hex = '#' + col.toString(16).padStart(6, '0');
    const glyph = GLYPH[kind];
    const tex = canvasTexture(64, 64, (g) => {
      g.beginPath();
      g.moveTo(32, 5);
      g.lineTo(59, 32);
      g.lineTo(32, 59);
      g.lineTo(5, 32);
      g.closePath();
      g.fillStyle = 'rgba(12,12,16,0.85)';
      g.fill();
      g.strokeStyle = hex;
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = hex;
      if (glyph) {
        g.font = '900 34px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(glyph, 32, 35);
      } else {
        g.beginPath();
        g.arc(32, 32, 7, 0, Math.PI * 2);
        g.fill();
      }
    });
    this.medalTex.set(kind, tex);
    return tex;
  }
}
