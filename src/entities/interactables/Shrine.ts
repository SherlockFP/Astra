import * as THREE from 'three';
import { InteractableProp, type PropGlow } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { dist2D } from '../../core/utils';
import { Assets } from '../../core/Assets';
import { propUrl } from '../../scenes/SceneKit';
import type { StatusId } from '../../types/skills';

export type ShrineType = 'shrine_power' | 'shrine_haste' | 'shrine_ward' | 'shrine_greed' | 'shrine_wisdom';

interface ShrineInfo {
  name: string;
  desc: string;
  color: number;
  css: string;
  crystal: string;
  status?: StatusId;
  duration: number;
}

export const SHRINES: Record<ShrineType, ShrineInfo> = {
  shrine_power: { name: 'Kudret Sunağı', desc: '+%25 hasar (30 sn)', color: 0xb060ff, css: '#c98cff', crystal: 'crystal_purple', status: 'empower', duration: 30 },
  shrine_haste: { name: 'Rüzgar Sunağı', desc: '+%25 hareket ve saldırı hızı (30 sn)', color: 0x5aff9a, css: '#7affb0', crystal: 'crystal_blue', status: 'haste', duration: 30 },
  shrine_ward: { name: 'Koruma Sunağı', desc: '-%25 alınan hasar (30 sn)', color: 0x5aa8ff, css: '#8ac4ff', crystal: 'crystal_blue', status: 'fortify', duration: 30 },
  shrine_greed: { name: 'Açgözlülük Sunağı', desc: 'Altın patlaması + 1 eşya', color: 0xffd24a, css: '#ffd24a', crystal: 'crystal_purple', duration: 0 },
  shrine_wisdom: { name: 'Bilgelik Sunağı', desc: '+%50 deneyim (120 sn)', color: 0x8affff, css: '#9cf2ff', crystal: 'crystal_blue', duration: 120 },
};

/** Wisdom shrine bonus: the progression module may multiply gained XP by this (1 = no bonus). */
let xpBonusUntil = 0;
export function shrineXpMultiplier(): number {
  return performance.now() < xpBonusUntil ? 1.5 : 1;
}

/** Rough gold average per kill used for greed rewards until the economy exposes one. */
function goldAvg(level: number): number {
  return Math.round(6 + level * 3.2);
}

/**
 * Sunak (shrine): click once per run to buff every party member within 20 m (GDD_CONTENT 1.4). Used shrines go dark and the
 * use is broadcast on the 'gate' channel (`shrine:<key>`) so other peers' copies go dark as well.
 * OWNER: scenes module.
 */
export class Shrine extends InteractableProp {
  readonly key: string;
  readonly type: ShrineType;
  /** One use per run (dungeons). Cooldown shrines never set it. */
  used = false;
  /** Seconds between two uses on this peer (open world, 0 = one use per run). */
  readonly cooldownSec: number;
  private readonly noLight: boolean;
  /** World time when a cooldown shrine is usable again. */
  private readyAt = 0;
  private lastUsable = true;
  private crystal: THREE.Object3D | null = null;
  private crystalBaseY = 2.3;
  private lightRef: PropGlow | null = null;
  private glow = 1;
  private mats: THREE.MeshStandardMaterial[] = [];

  constructor(id: number, opts: { key: string; type: ShrineType; cooldownSec?: number; noLight?: boolean }) {
    super(id);
    this.key = opts.key;
    this.type = opts.type;
    this.cooldownSec = Math.max(0, opts.cooldownSec ?? 0);
    // the open world has many shrines: they glow with their crystal only (no point light, keeps the light budget)
    this.noLight = !!opts.noLight;
    this.interactRange = 3.4;
    this.blockRadius = 1.1;
    this.radius = 1.2;
    this.height = 3;
  }

  /** Can be used right now (not spent for the run / not cooling down). */
  private usable(): boolean {
    if (this.cooldownSec <= 0) return !this.used;
    return (this.world?.time ?? 0) >= this.readyAt;
  }

  get interactPrompt(): string {
    if (this.usable()) return `${SHRINES[this.type].name}: Etkinleştir`;
    return this.cooldownSec > 0 ? 'Sunak yeniden hazırlanıyor' : 'Sunak sönmüş';
  }

  async load(): Promise<void> {
    const info = SHRINES[this.type];
    const altarUrl = '/assets/models/kenney/graveyard-kit/altar-stone.glb';
    const crystalUrl = propUrl(info.crystal);
    await Promise.all([G.assets.load(altarUrl), G.assets.load(crystalUrl)]);
    const altar = G.assets.instantiate(altarUrl);
    altar.scale.setScalar(3);
    const crystal = G.assets.instantiate(crystalUrl);
    Assets.cloneMaterials(crystal);
    this.ownedRoots.push(crystal);
    crystal.scale.setScalar(0.55);
    crystal.position.y = this.crystalBaseY;
    crystal.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (this.type === 'shrine_haste' || this.type === 'shrine_greed' || this.type === 'shrine_wisdom') {
          mat.color?.set(info.color);
          mat.emissive?.set(info.color);
        }
        this.mats.push(mat);
      }
    });
    for (const o of [altar, crystal]) {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
    }
    this.object3d.add(altar, crystal);
    this.model = altar;
    this.crystal = crystal;
    if (!this.noLight) this.lightRef = this.addLight(info.color, 22, 8, new THREE.Vector3(0, 2.2, 0));
    this.refreshLabel();
  }

  private refreshLabel(): void {
    const info = SHRINES[this.type];
    const ready = this.usable();
    const desc = ready ? info.desc : this.cooldownSec > 0 ? 'Kısa süre sonra yeniden hazır' : 'Kullanıldı';
    this.setLabel(
      `<div class="efs-wl"><div class="n" style="color:${ready ? info.css : '#7a7a80'}">${info.name}</div><div class="s">${desc}</div></div>`,
      3.4,
      'efs-wl-wrap',
      26,
    );
  }

  canInteract(): boolean {
    return this.usable();
  }

  interact(_player: Player): void {
    if (!this.usable()) return;
    this.activate(true);
  }

  /** `local` = this peer clicked it (applies effects + broadcasts); false = a remote peer used it (only goes dark). */
  activate(local: boolean): void {
    if (!this.usable()) return;
    if (this.cooldownSec > 0) this.readyAt = (this.world?.time ?? 0) + this.cooldownSec;
    else this.used = true;
    this.refreshLabel();
    const info = SHRINES[this.type];
    try {
      G.vfx.spawn('waypoint_glow', this.position, { color: info.color, scale: 1.6, duration: 2.5 });
      G.vfx.spawn('buff_aura', this.pointAt(0.5), { color: info.color, scale: 1.4 });
    } catch {
      /* optional */
    }
    G.audio.play('buff');
    if (!local) return;
    G.events.emit('camera:shake', { intensity: 0.1, duration: 0.3 });
    this.applyEffects(info);
    // cooldown shrines are personal (each player may use them again later): nothing to tell the other peers
    if (G.net.isOnline && this.cooldownSec <= 0) G.net.broadcast('gate', { key: `shrine:${this.key}`, open: false });
  }

  private applyEffects(info: ShrineInfo): void {
    const world = this.world;
    const me = G.player;
    if (!world || !me) return;
    if (this.type === 'shrine_greed') {
      const lvl = me.level;
      G.loot.dropGold(30 * goldAvg(lvl), this.position);
      try {
        const item = G.loot.rollItem({ itemLevel: lvl, classId: me.classId });
        G.loot.dropItem(item, this.position, { delay: 0.25 });
      } catch (e) {
        console.warn('[shrine] item roll failed', e);
      }
      G.ui.toast(`${info.name}: altın yağmuru!`, 'loot');
      return;
    }
    if (this.type === 'shrine_wisdom') {
      xpBonusUntil = performance.now() + info.duration * 1000;
      G.ui.toast(`${info.name}: ${info.desc}`, 'success');
      return;
    }
    const st = info.status!;
    for (const p of world.players) {
      if (p.isDead || dist2D(p.position, this.position) > 20) continue;
      if (p.isLocal) {
        p.statuses.apply(st, info.duration, { magnitude: 0.25, sourceId: me.id });
        G.ui.toast(`${info.name}: ${info.desc}`, 'success');
      } else {
        const peer = G.net.peerOfEntity(p.id);
        if (peer) G.net.sendTo(peer, 'pstatus', { targetId: p.id, status: st, duration: info.duration, magnitude: 0.25, sourceId: me.id });
      }
    }
  }

  protected animate(dt: number): void {
    const t = this.time;
    const ready = this.usable();
    if (ready !== this.lastUsable) {
      this.lastUsable = ready;
      this.refreshLabel();
    }
    this.glow += ((ready ? 1 : 0) - this.glow) * Math.min(1, dt * 2.5);
    if (this.crystal) {
      this.crystal.rotation.y += dt * (0.2 + this.glow * 1.1);
      this.crystal.position.y = this.crystalBaseY + Math.sin(t * 1.8) * 0.12 * this.glow;
    }
    for (const m of this.mats) if (m.emissive) m.emissiveIntensity = 0.1 + this.glow * 1.5;
    if (this.lightRef) this.lightRef.intensity = this.glow * (20 + Math.sin(t * 2.8) * 3);
  }
}
