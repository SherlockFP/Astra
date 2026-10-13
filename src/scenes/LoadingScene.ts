import * as THREE from 'three';
import type { GameScene } from '../core/SceneManager';
import { G } from '../game/G';
import { characterAssetUrls } from '../entities/CharacterModel';
import { CLASS_ORDER, classPresentation } from '../ui/menu/classInfo';
import { classModelUrl } from './CharacterVisual';
import { MENU_PROP_URLS } from './MenuScene';
import { createEmbers, ownGeo, ownMat, radialGlowTexture, runeRingTexture, disposeOwned, type ParticleSystem } from './SceneKit';

/**
 * Boot scene: preloads everything shared (class models + weapons, camp props, class icons, fonts) while a slowly
 * turning rune seal and rising embers fill the screen, reports progress through G.ui.showLoading, then opens the menu.
 * OWNER: scenes module.
 */
export class LoadingScene implements GameScene {
  readonly id = 'loading' as const;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  private seal: THREE.Mesh | null = null;
  private seal2: THREE.Mesh | null = null;
  private glow: THREE.Sprite | null = null;
  private embers: ParticleSystem | null = null;
  private time = 0;
  private disposed = false;

  async enter(_params?: unknown): Promise<void> {
    G.vfx.attach(this.scene, this.camera);
    G.ui.setMode('loading');
    this.scene.background = new THREE.Color(0x04050a);
    this.camera.position.set(0, 0, 7);
    this.camera.lookAt(0, 0, 0);

    const tex = runeRingTexture('#e8c46a', 256);
    const mat = ownMat(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
    this.seal = new THREE.Mesh(ownGeo(new THREE.PlaneGeometry(6.2, 6.2)), mat);
    const mat2 = ownMat(new THREE.MeshBasicMaterial({ map: runeRingTexture('#ff9a4a', 128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
    this.seal2 = new THREE.Mesh(ownGeo(new THREE.PlaneGeometry(3.6, 3.6)), mat2);
    this.glow = new THREE.Sprite(ownMat(new THREE.SpriteMaterial({ map: radialGlowTexture(64, 'rgba(255,170,70,0.55)', 'rgba(255,90,20,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    this.glow.scale.setScalar(10);
    this.embers = createEmbers(new THREE.Vector3(0, -3.2, 0), 110, { spread: 5.5, rise: 1.8, size: 2.4, height: 5 });
    this.scene.add(this.glow, this.seal, this.seal2, this.embers.points);

    void this.run();
  }

  private async run(): Promise<void> {
    const t0 = performance.now();
    const classUrls = CLASS_ORDER.flatMap((c) => [classModelUrl(c), ...characterAssetUrls(c)]);
    const urls = [...new Set([...classUrls, ...MENU_PROP_URLS])];
    G.ui.showLoading(0, 'Kadim güçler uyandırılıyor...');
    const label = (url: string): string => {
      if (url.includes('/characters/')) return 'Kahramanlar hazırlanıyor...';
      if (url.includes('/weapons/')) return 'Silahlar bileniyor...';
      return 'Kamp kuruluyor...';
    };
    // fonts + icons first (tiny), models second
    const extra: Promise<unknown>[] = [];
    try {
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts) extra.push(fonts.load('700 48px "Cinzel Decorative"'), fonts.load('700 18px "Cinzel"'), fonts.load('400 16px "Alegreya Sans"'));
    } catch {
      /* optional */
    }
    for (const c of CLASS_ORDER) {
      const img = new Image();
      img.src = classPresentation(c).icon;
      extra.push(new Promise((res) => (img.onload = img.onerror = () => res(null))));
    }
    await G.assets.loadMany(urls, (loaded, total, url) => {
      const p = loaded / total;
      G.ui.showLoading(p * 0.97, label(url));
      G.events.emit('loading:progress', { loaded, total, label: label(url) });
    });
    await Promise.allSettled(extra);
    G.ui.showLoading(1, 'Hazır');
    // keep the seal on screen for a moment so the boot never flashes
    const wait = Math.max(0, 700 - (performance.now() - t0));
    await new Promise((r) => setTimeout(r, wait));
    // wait until the SceneManager finished entering us (so a queued go() is not a race), then open the menu
    for (let i = 0; i < 100 && !this.disposed && G.scenes.current !== this; i++) await new Promise((r) => setTimeout(r, 30));
    // someone else already moved on (dev pages, host scene change): a switch away from us is in progress when isSwitching is set
    if (this.disposed || G.scenes.current !== this || G.scenes.isSwitching) return;
    G.ui.hideLoading();
    void G.scenes.go('menu');
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    if (this.seal) {
      this.seal.rotation.z += dt * 0.25;
      (this.seal.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.15 * Math.sin(t * 2);
    }
    if (this.seal2) this.seal2.rotation.z -= dt * 0.5;
    if (this.glow) (this.glow.material as THREE.SpriteMaterial).opacity = 0.7 + 0.2 * Math.sin(t * 1.3);
    this.embers?.update(dt, t);
  }

  exit(): void {
    this.disposed = true;
    this.embers?.dispose();
    disposeOwned(this.scene);
    this.scene.clear();
  }
}
