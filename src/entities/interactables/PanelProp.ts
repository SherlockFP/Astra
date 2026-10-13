import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';

export interface PanelPropOpts {
  parts: { url: string; scale?: number; pos?: [number, number, number]; spin?: number; bob?: number }[];
  name: string;
  sub?: string;
  prompt: string;
  panel: string;
  data?: unknown;
  color?: string;
  light?: number;
  block?: number;
  range?: number;
  labelY?: number;
  /** Shown as a toast on interact (panel '' = message only: sealed doors, lore stones). */
  message?: string;
  /** No floating name label (stand-ins for decorative props that already read clearly). */
  noLabel?: boolean;
}

/** Generic "walk up and press F to open a panel" prop (Şeref Taşı / Mitik+ board, vault chest...). */
export class PanelProp extends InteractableProp {
  private opts: PanelPropOpts;
  private spinners: { obj: THREE.Object3D; spin: number; bob: number; baseY: number }[] = [];
  private lightRef: PropGlow | null = null;

  constructor(id: number, opts: PanelPropOpts) {
    super(id);
    this.opts = opts;
    this.interactRange = opts.range ?? 3.8;
    this.blockRadius = opts.block ?? 1.2;
    this.radius = Math.max(0.8, this.blockRadius);
    this.height = 3;
  }

  get interactPrompt(): string {
    return this.opts.prompt;
  }

  async load(): Promise<void> {
    await Promise.all(this.opts.parts.map((p) => G.assets.load(p.url)));
    for (const p of this.opts.parts) {
      const m = G.assets.instantiate(p.url);
      if (p.scale) m.scale.setScalar(p.scale);
      if (p.pos) m.position.set(...p.pos);
      m.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.object3d.add(m);
      if (!this.model) this.model = m;
      if (p.spin || p.bob) this.spinners.push({ obj: m, spin: p.spin ?? 0, bob: p.bob ?? 0, baseY: m.position.y });
    }
    if (this.opts.light) this.lightRef = this.addLight(this.opts.light, 18, 11, new THREE.Vector3(0, 2.4, 0));
    if (this.opts.noLabel) return;
    const col = this.opts.color ?? '#ffd982';
    this.setLabel(
      `<div class="efs-wl"><div class="n" style="color:${col}">${this.opts.name}</div>${this.opts.sub ? `<div class="s">${this.opts.sub}</div>` : ''}</div>`,
      this.opts.labelY ?? 3.6,
      'efs-wl-wrap',
      40,
    );
  }

  interact(_player: Player): void {
    if (this.opts.message) {
      G.audio.play('chest_locked', { volume: 0.7 });
      G.ui.toast(this.opts.message, 'info');
    }
    if (this.opts.panel) {
      G.audio.play('ui_open');
      G.ui.openPanel(this.opts.panel, this.opts.data);
    }
  }

  protected animate(dt: number): void {
    for (const s of this.spinners) {
      if (s.spin) s.obj.rotation.y += s.spin * dt;
      if (s.bob) s.obj.position.y = s.baseY + Math.sin(this.time * 1.6) * s.bob;
    }
    if (this.lightRef) this.lightRef.intensity = (this.opts.light ?? 18) + Math.sin(this.time * 2.4) * 3;
  }
}
