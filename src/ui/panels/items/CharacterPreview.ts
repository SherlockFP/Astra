import * as THREE from 'three';
import { G } from '../../../game/G';
import { loadCharacterModel, type GearMap } from '../../../entities/CharacterModel';
import { AnimController } from '../../../entities/AnimController';
import type { ClassId } from '../../../types/common';
import type { EquipSlot, ItemInstance } from '../../../types/items';

/** The subset of CharacterModel the preview needs (the real one satisfies it; the fallback fakes it). */
interface PreviewModel {
  root: THREE.Object3D;
  anim: AnimController | null;
  setGear(gear?: GearMap): unknown;
  setHideHelm?(hide: boolean): void;
  dispose?(): void;
}

/** Appearance extras that Player.ts also honours (tint override, helmet toggle, hooded rogue). */
export interface PreviewLook {
  tint?: number;
  hideHelm?: boolean;
  hooded?: boolean;
}

const CLASS_GLB: Record<ClassId, string> = {
  knight: '/assets/models/characters/Knight.glb',
  barbarian: '/assets/models/characters/Barbarian.glb',
  mage: '/assets/models/characters/Mage.glb',
  rogue: '/assets/models/characters/Rogue.glb',
  monk: '/assets/models/characters/Barbarian.glb',
  archer: '/assets/models/characters/Rogue.glb',
  paladin: '/assets/models/characters/Knight.glb',
  necromancer: '/assets/models/characters/Mage.glb',
  warlock: '/assets/models/characters/Rogue_Hooded.glb',
};

/** Fallback only (used if loadCharacterModel returns an empty model): accessory meshes + the default visible subset. */
const ACCESSORIES: Record<ClassId, { all: string[]; show: string[] }> = {
  // GDD_CLASSES_V2 §2.2–§6.2 (NC04): monk shows bare fists, archer and warlock the rogue cape, paladin/necromancer their stand-ins
  monk: {
    all: ['2H_Axe', '1H_Axe', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape', 'Mug'],
    show: [],
  },
  archer: {
    all: ['Knife', 'Knife_Offhand', 'Rogue_Cape', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    show: ['Rogue_Cape'],
  },
  paladin: {
    all: ['1H_Sword', '2H_Sword', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand', 'Knight_Helmet', 'Knight_Cape'],
    show: ['1H_Sword', 'Badge_Shield', 'Knight_Helmet', 'Knight_Cape'],
  },
  necromancer: {
    all: ['2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat', 'Mage_Cape'],
    show: ['2H_Staff', 'Mage_Cape'],
  },
  warlock: {
    all: ['Knife', 'Knife_Offhand', 'Rogue_Cape', '1H_Crossbow', '2H_Crossbow', 'Throwable'],
    show: ['Rogue_Cape'],
  },
  knight: {
    all: ['1H_Sword', '2H_Sword', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand', 'Knight_Helmet', 'Knight_Cape'],
    show: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'],
  },
  barbarian: {
    all: ['2H_Axe', '1H_Axe', 'Mug', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape'],
    show: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'],
  },
  mage: {
    all: ['2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat', 'Mage_Cape'],
    show: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'],
  },
  rogue: {
    all: ['Knife', '1H_Crossbow', '2H_Crossbow', 'Throwable', 'Knife_Offhand', 'Rogue_Cape'],
    show: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
  },
};

/**
 * Live 3D paper-doll preview: a separate small WebGLRenderer (transparent canvas) rendering the character model
 * (loadCharacterModel + gear) with an idle animation on a stone podium. Drag to rotate, wheel to zoom.
 */
export class CharacterPreview {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private pivot = new THREE.Group();
  private model: PreviewModel | null = null;
  private fallbackAnim: AnimController | null = null;
  private raf = 0;
  private running = false;
  private last = 0;
  private yaw = 0.4;
  private vel = 0;
  private dragging = false;
  private idle = 0;
  private dist = 6.4;
  private token = 0;
  private w: number;
  private h: number;
  private loading = false;
  private cheerAt = 0;
  private noGl = false;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.el = document.createElement('div');
    this.el.className = 'pi-preview';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pi-preview-canvas';
    this.el.append(this.canvas);
    const hint = document.createElement('div');
    hint.className = 'pi-preview-hint';
    hint.textContent = 'Döndürmek için sürükle';
    this.el.append(hint);

    this.camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 50);
    this.camera.position.set(0, 1.45, this.dist);
    this.camera.lookAt(0, 1.18, 0);

    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x5a4330, 1.6));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7a98ff, 1.8);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0xff9a40, 12, 9, 1.6);
    warm.position.set(1.4, 0.6, 2.2);
    this.scene.add(warm);

    // podium
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 1, flatShading: true });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.24, 0.16, 14), stone);
    plat.position.y = -0.08;
    this.scene.add(plat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 5, 28), new THREE.MeshBasicMaterial({ color: 0xe8c46a }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);
    const glow = new THREE.Mesh(new THREE.RingGeometry(0.2, 1.05, 28), new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    this.scene.add(glow);
    this.scene.add(this.pivot);

    this.bindInput();
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    if (this.noGl) return null;
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
      r.setPixelRatio(0.6); // chunky PSX pixels, upscaled with image-rendering: pixelated
      r.setSize(this.w, this.h, false);
      r.setClearColor(0x000000, 0);
      this.renderer = r;
    } catch (e) {
      console.warn('[character-preview] WebGL unavailable', e);
      this.noGl = true;
    }
    return this.renderer;
  }

  private bindInput(): void {
    const c = this.canvas;
    let lastX = 0;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      lastX = e.clientX;
      this.vel = 0;
      c.setPointerCapture(e.pointerId);
      this.el.classList.add('grab');
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.yaw += dx * 0.012;
      this.vel = dx * 0.012 * 60;
      this.idle = 0;
    });
    const up = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.classList.remove('grab');
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = Math.max(4.4, Math.min(8, this.dist + Math.sign(e.deltaY) * 0.35));
        this.idle = 0;
      },
      { passive: false },
    );
  }

  /** Load / replace the displayed character. */
  async setCharacter(classId: ClassId, variant: number, gear: Partial<Record<EquipSlot, ItemInstance>>, look: PreviewLook = {}): Promise<void> {
    const my = ++this.token;
    this.loading = true;
    this.el.classList.add('loading');
    let model: PreviewModel | null = null;
    try {
      model = await loadCharacterModel(classId, { variant, gear, tint: look.tint, hideHelm: look.hideHelm, hooded: look.hooded, shadow: false });
    } catch (e) {
      console.warn('[character-preview] loadCharacterModel failed', e);
    }
    let fallback: AnimController | null = null;
    if (!model || model.root.children.length === 0) {
      const fb = await this.loadFallback(classId);
      if (fb) {
        model = { root: fb.root, anim: fb.anim, setGear() {}, dispose() {} };
        fallback = fb.anim;
      }
    }
    if (my !== this.token) return; // a newer request superseded this one
    this.clearModel();
    if (model) {
      this.model = model;
      this.fallbackAnim = fallback;
      this.pivot.add(model.root);
      const idle = model.anim?.pick('Idle', 'Unarmed_Idle', '2H_Melee_Idle');
      if (idle) model.anim?.setBase(idle, { fade: 0 });
    }
    this.loading = false;
    this.el.classList.remove('loading');
    this.cheerAt = 0.35;
  }

  private async loadFallback(classId: ClassId): Promise<{ root: THREE.Object3D; anim: AnimController | null } | null> {
    try {
      const asset = await G.assets.load(CLASS_GLB[classId]);
      if (!asset) return null;
      const root = G.assets.instantiate(CLASS_GLB[classId]);
      const acc = ACCESSORIES[classId];
      for (const n of acc.all) {
        const o = root.getObjectByName(n);
        if (o) o.visible = acc.show.includes(n);
      }
      return { root, anim: new AnimController(root, asset.clips) };
    } catch (e) {
      console.warn('[character-preview] fallback model failed', e);
      return null;
    }
  }

  private clearModel(): void {
    if (this.model) {
      this.pivot.remove(this.model.root);
      try {
        this.model.dispose?.();
      } catch {
        /* ignore */
      }
    }
    this.model = null;
    this.fallbackAnim = null;
  }

  /** "Kaskı gizle" toggle. */
  setHideHelm(hide: boolean): void {
    try {
      this.model?.setHideHelm?.(hide);
    } catch (e) {
      console.warn('[character-preview] setHideHelm failed', e);
    }
  }

  /** Gear changed: swap weapon/offhand/helm visuals and play a little flourish. */
  setGear(gear: Partial<Record<EquipSlot, ItemInstance>>, flourish = true): void {
    try {
      this.model?.setGear(gear);
    } catch (e) {
      console.warn('[character-preview] setGear failed', e);
    }
    if (flourish) this.cheerAt = 0.05;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(dt: number): void {
    const r = this.ensureRenderer();
    if (!r) return;
    const anim = this.model?.anim ?? this.fallbackAnim;
    if (this.cheerAt > 0) {
      this.cheerAt -= dt;
      if (this.cheerAt <= 0 && anim) {
        const clip = anim.pick('Cheer', 'Interact', 'Spellcast_Raise');
        if (clip) anim.playOnce(clip, { fade: 0.12, speed: 1.15 });
      }
    }
    try {
      anim?.update(dt);
    } catch {
      /* never throw from a frame loop */
    }
    // inertia + ease back to the front after a while
    if (!this.dragging) {
      this.yaw += this.vel * dt;
      this.vel *= Math.exp(-4.5 * dt);
      this.idle += dt;
      if (this.idle > 3 && Math.abs(this.vel) < 0.05) {
        const tau = Math.PI * 2;
        const target = Math.round(this.yaw / tau) * tau + 0.4;
        this.yaw += (target - this.yaw) * (1 - Math.exp(-1.6 * dt));
      }
    }
    this.pivot.rotation.y = this.yaw;
    const cz = this.camera.position.z;
    this.camera.position.z = cz + (this.dist - cz) * (1 - Math.exp(-8 * dt));
    this.camera.position.y = 1.0 + this.camera.position.z * 0.07;
    this.camera.lookAt(0, 1.18, 0);
    r.render(this.scene, this.camera);
  }

  dispose(): void {
    this.stop();
    this.clearModel();
    this.renderer?.dispose();
    this.renderer = null;
    this.loading = false;
  }

  get isLoading(): boolean {
    return this.loading;
  }
}
