import * as THREE from 'three';
import type { SceneId } from '../types/common';

/**
 * A top-level game scene. The SceneManager calls enter() (async — load assets there),
 * then update(dt) every frame, then exit() when leaving. The Engine renders `scene` with `camera`.
 * Scene contract (see ARCHITECTURE.md "Scenes"): call G.vfx.attach(this.scene, this.camera) FIRST in enter(),
 * set G.world / G.player / G.camera as the LAST step of enter(), null them in exit().
 */
export interface GameScene {
  readonly id: SceneId;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  enter(params?: unknown): Promise<void>;
  update(dt: number): void;
  exit(): void;
}

export class SceneManager {
  private scenes = new Map<SceneId, () => GameScene>();
  current: GameScene | null = null;
  private switching = false;
  private pending: { id: SceneId; params?: unknown } | null = null;
  private fadeEl: HTMLDivElement;
  private emptyScene = new THREE.Scene();
  private emptyCam = new THREE.PerspectiveCamera();
  /** Fired before the old scene's exit() (services clear scene-scoped state). */
  onLeaving: ((from: SceneId | null, to: SceneId) => void) | null = null;
  onChange: ((from: SceneId | null, to: SceneId) => void) | null = null;
  onView: ((scene: THREE.Scene, camera: THREE.Camera) => void) | null = null;
  /** enter() threw: return a fallback scene id to go to (or null to stay black). */
  onError: ((id: SceneId, err: unknown) => SceneId | null) | null = null;

  constructor(uiRoot: HTMLElement) {
    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'scene-fade';
    Object.assign(this.fadeEl.style, {
      position: 'absolute', inset: '0', background: '#000', opacity: '0', pointerEvents: 'none',
      transition: 'opacity 0.45s ease', zIndex: '9000',
    });
    this.emptyScene.background = new THREE.Color(0x000000);
    uiRoot.appendChild(this.fadeEl);
  }

  register(id: SceneId, factory: () => GameScene): void {
    this.scenes.set(id, factory);
  }

  get isSwitching(): boolean {
    return this.switching;
  }

  /**
   * Switch scenes. A request made while a switch is in progress is queued (latest wins) and runs right after,
   * so a host 'scene' message arriving mid-load is never lost.
   */
  async go(id: SceneId, params?: unknown): Promise<void> {
    if (this.switching) {
      this.pending = { id, params };
      return;
    }
    const factory = this.scenes.get(id);
    if (!factory) throw new Error(`scene ${id} not registered`);
    this.switching = true;
    const from = this.current?.id ?? null;
    let failed: unknown = null;
    try {
      await this.fade(1);
      this.onLeaving?.(from, id);
      if (this.current) {
        try {
          this.current.exit();
        } catch (e) {
          console.error('[scenes] exit failed', e);
        }
      }
      this.current = null;
      this.onView?.(this.emptyScene, this.emptyCam);
      const next = factory();
      try {
        await next.enter(params);
        this.current = next;
        this.onView?.(next.scene, next.camera);
        this.onChange?.(from, id);
      } catch (e) {
        console.error(`[scenes] enter(${id}) failed`, e);
        failed = e;
        try {
          next.exit();
        } catch {
          /* ignore */
        }
      }
      await this.fade(0);
    } finally {
      this.switching = false;
    }
    if (failed) {
      const fallback = this.onError?.(id, failed) ?? null;
      if (fallback && fallback !== id && !this.pending) this.pending = { id: fallback };
    }
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      await this.go(p.id, p.params);
    }
  }

  update(dt: number): void {
    // keeps updating while fading out (old scene) and fading in (new scene); null during enter()
    if (this.current) this.current.update(dt);
  }

  private fade(to: 0 | 1): Promise<void> {
    return new Promise((res) => {
      this.fadeEl.style.opacity = String(to);
      setTimeout(res, 470);
    });
  }
}
