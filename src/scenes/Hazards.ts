import * as THREE from 'three';
import { G } from '../game/G';
import { monsterDmg } from '../entities/EnemyFactory';
import { TILE_SIZE, type DungeonDef, type HazardDef, type RoomDef, type ZoneDef } from '../types/dungeons';
import type { DamageType } from '../types/common';
import type { World } from '../world/World';
import type { BuiltDungeon } from '../world/DungeonBuilder';

const T = TILE_SIZE;

/** Damage type + Turkish source name of a damaging floor zone (ZoneDef.kind). */
const ZONE_FX: Partial<Record<ZoneDef['kind'], { type: DamageType; name: string }>> = {
  lava: { type: 'fire', name: 'Lav' },
  vent: { type: 'fire', name: 'Buhar Deliği' },
  ice: { type: 'frost', name: 'Buz Yarığı' },
  pool: { type: 'poison', name: 'Zehirli Su' },
  void: { type: 'shadow', name: 'Boşluk' },
  pit: { type: 'shadow', name: 'Boşluk' },
  rune: { type: 'shadow', name: 'Lanetli Rün' },
};

interface Slot {
  room: RoomDef;
  h: HazardDef;
  t: number;
}

interface Fx {
  kind: 'l' | 'i';
  x: number;
  z: number;
  t: number;
  warn: number;
  r: number;
  mesh: THREE.Mesh | null;
}

export interface HazardOpts {
  world: World;
  scene: THREE.Scene;
  def: DungeonDef;
  built: BuiltDungeon;
  /** Enemy level of the run (hazard damage scales like a monster of this level). */
  level: number;
}

/**
 * Environmental damage of a dungeon (World system):
 *  - every peer, every frame: standing in a ZoneDef.hazard zone (lava strips, poison pools...) hurts the LOCAL player on the
 *    zone's interval (`built.hazardAt`); jumping over it or rolling through it (i-frames) is safe.
 *  - host: periodic RoomDef.hazards (Lav Fışkırması / Buz Sarkıtları) while a living player is in that room: a random walkable spot
 *    (half of them near a player) gets a HitShape telegraph + burst (replicated by HitShapes, resolved per peer for its own player).
 *    The host broadcasts a tiny 'hz:' message on the 'gate' channel so every peer also shows the falling icicle / lava rumble.
 * OWNER: scenes module.
 */
export class DungeonHazards {
  private slots: Slot[] = [];
  private fx: Fx[] = [];
  private inZone = false;
  private zoneAcc = 0;
  private disposed = false;
  private geo: THREE.ConeGeometry | null = null;
  private mat: THREE.MeshBasicMaterial | null = null;

  constructor(private o: HazardOpts) {
    for (const r of o.def.rooms) for (const h of r.hazards ?? []) this.slots.push({ room: r, h, t: h.interval * 0.5 });
  }

  // ------------------------------------------------------------------------------------------------
  // damage numbers
  // ------------------------------------------------------------------------------------------------

  private baseDamage(): number {
    let scale = 1;
    try {
      scale = G.mplus.enemyScaling(false).dmg;
    } catch {
      /* mythic not ready */
    }
    return monsterDmg(Math.max(1, this.o.level)) * scale;
  }

  // ------------------------------------------------------------------------------------------------
  // frame
  // ------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed) return;
    this.updateFx(dt);
    this.updateZoneDot(dt);
    if (this.slots.length && G.net.isAuthority) this.updateSlots(dt);
  }

  /** Every peer: DoT zones hit the local player. */
  private updateZoneDot(dt: number): void {
    const { world, built } = this.o;
    const p = world.localPlayer;
    if (!p || p.isDead || p.removed) {
      this.inZone = false;
      this.zoneAcc = 0;
      return;
    }
    const z = built.hazardAt(p.position.x, p.position.z);
    const airborne = p.position.y - world.groundY(p.position.x, p.position.z) > 0.8;
    if (!z || !z.hazard || airborne) {
      this.inZone = false;
      this.zoneAcc = Math.max(0, this.zoneAcc - dt * 2);
      return;
    }
    const iv = Math.max(0.2, z.hazard.interval);
    if (!this.inZone) {
      this.inZone = true;
      this.zoneAcc = Math.max(this.zoneAcc, iv - 0.4); // first tick 0.4 s after stepping in: a graze is a warning, not a punishment
    }
    this.zoneAcc += dt;
    if (this.zoneAcc < iv) return;
    this.zoneAcc -= iv;
    const info = ZONE_FX[z.kind] ?? { type: 'fire' as DamageType, name: 'Tehlikeli Zemin' };
    try {
      G.combat.hitLocalPlayer({
        sourceId: null, amount: this.baseDamage() * z.hazard.coef, type: info.type, isDot: true, unavoidable: true, blockable: false,
        abilityName: info.name, sourceLevel: this.o.level,
      });
    } catch (e) {
      console.warn('[hazards] zone tick failed', e);
    }
    // sizzle: embers + a little rumble so it reads as "this floor is hurting me"
    const pos: [number, number, number] = [p.position.x, p.position.y + 0.35, p.position.z];
    try {
      if (info.type === 'fire') {
        G.vfx.spawn('fire_burst', pos, { scale: 0.5 });
        G.audio.play('fire_impact', { pos, volume: 0.35, pitch: 1.35, pitchVar: 0.1 });
      } else if (info.type === 'frost') {
        G.vfx.spawn('frost_burst', pos, { scale: 0.5 });
        G.audio.play('frost_impact', { pos, volume: 0.3, pitch: 1.3, pitchVar: 0.1 });
      } else if (info.type === 'poison') {
        G.vfx.spawn('poison_burst', pos, { scale: 0.5 });
        G.audio.play('poison_impact', { pos, volume: 0.3, pitchVar: 0.1 });
      } else {
        G.vfx.spawn('shadow_burst', pos, { scale: 0.5 });
        G.audio.play('shadow_impact', { pos, volume: 0.3, pitchVar: 0.1 });
      }
      G.events.emit('camera:shake', { intensity: 0.06, duration: 0.14 });
    } catch {
      /* feedback is optional */
    }
  }

  // ------------------------------------------------------------------------------------------------
  // periodic room hazards (host)
  // ------------------------------------------------------------------------------------------------

  private updateSlots(dt: number): void {
    const { world, built } = this.o;
    const living = world.players.filter((p) => !p.isDead && !p.removed);
    if (!living.length) return;
    for (const s of this.slots) {
      const inside = living.filter((p) => built.roomAt(p.position.x, p.position.z)?.id === s.room.id);
      if (!inside.length) continue;
      s.t -= dt;
      if (s.t > 0) continue;
      s.t = s.h.interval * (0.85 + Math.random() * 0.3);
      const n = inside.length >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) this.erupt(s, inside);
    }
  }

  private erupt(s: Slot, inside: { position: THREE.Vector3 }[]): void {
    const { world, built } = this.o;
    const r = s.room.rect;
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 16 && !ok; k++) {
      if (k % 2 === 0) {
        // half of the strikes land near somebody (readable and threatening), the rest anywhere in the room
        const t = inside[Math.floor(Math.random() * inside.length)];
        const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 5;
        x = t.position.x + Math.cos(a) * d;
        z = t.position.z + Math.sin(a) * d;
      } else {
        x = (r.x + Math.random() * r.w) * T;
        z = (r.z + Math.random() * r.h) * T;
      }
      ok = built.nav.isWalkable(x, z) && built.roomAt(x, z)?.id === s.room.id;
    }
    if (!ok) return;
    const lava = s.h.kind === 'lava_burst';
    try {
      G.hitShapes.spawn({
        sourceId: null,
        shape: { type: 'circle', radius: s.h.radius },
        origin: [x, world.groundY(x, z), z],
        dir: [0, 1],
        delay: s.h.warn,
        damage: this.baseDamage() * s.h.coef,
        type: lava ? 'fire' : 'frost',
        statuses: s.h.stun ? [{ status: 'stun', duration: s.h.stun }] : undefined,
        knockback: lava ? 3.5 : 0,
        telegraph: true,
        kind: 'danger',
        abilityName: lava ? 'Lav Fışkırması' : 'Buz Sarkıtı',
        vfxOnLand: s.h.vfx ?? (lava ? 'volcanic_plume' : 'frost_burst'),
      });
    } catch (e) {
      console.warn('[hazards] hit shape failed', e);
      return;
    }
    this.visual(lava ? 'l' : 'i', x, z, s.h.warn, s.h.radius);
    try {
      G.net.broadcast('gate', { key: `hz:${lava ? 'l' : 'i'}:${x.toFixed(1)}:${z.toFixed(1)}:${s.h.warn.toFixed(2)}:${s.h.radius.toFixed(1)}`, open: true });
    } catch {
      /* offline */
    }
  }

  /** Every peer: an `hz:<l|i>:<x>:<z>:<warn>:<radius>` message of the 'gate' channel. */
  handleMessage(key: string): void {
    const p = key.split(':');
    if (p[0] !== 'hz' || (p[1] !== 'l' && p[1] !== 'i')) return;
    const x = Number(p[2]), z = Number(p[3]), warn = Number(p[4]), r = Number(p[5]);
    if (![x, z, warn, r].every(Number.isFinite)) return;
    this.visual(p[1], x, z, Math.max(0.2, Math.min(5, warn)), Math.max(0.5, Math.min(12, r)));
  }

  // ------------------------------------------------------------------------------------------------
  // visuals (every peer)
  // ------------------------------------------------------------------------------------------------

  private visual(kind: 'l' | 'i', x: number, z: number, warn: number, r: number): void {
    const gy = this.o.world.groundY(x, z);
    let mesh: THREE.Mesh | null = null;
    try {
      if (kind === 'i') {
        // a big icicle hangs above the marked spot and drops over the warning time
        if (!this.geo) {
          this.geo = new THREE.ConeGeometry(0.34, 2.6, 6);
          this.geo.rotateX(Math.PI); // tip down
          this.mat = new THREE.MeshBasicMaterial({ color: 0xd6f2ff });
        }
        mesh = new THREE.Mesh(this.geo, this.mat!);
        mesh.scale.setScalar(Math.max(0.6, r / 1.5));
        mesh.position.set(x, gy + 9, z);
        this.o.scene.add(mesh);
        G.audio.play('frost_cast', { pos: [x, gy + 1, z], volume: 0.4, pitch: 1.5, pitchVar: 0.1 });
      } else {
        G.vfx.spawn('fire_ground', [x, gy + 0.05, z], { scale: Math.max(0.5, (r / 2.2) * 0.85), duration: warn });
        G.audio.play('fire_cast', { pos: [x, gy + 0.5, z], volume: 0.5, pitch: 0.6, pitchVar: 0.1 });
      }
    } catch {
      /* visuals are optional */
    }
    this.fx.push({ kind, x, z, t: 0, warn, r, mesh });
  }

  private updateFx(dt: number): void {
    const { world } = this.o;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const gy = world.groundY(f.x, f.z);
      if (f.mesh) {
        const k = Math.min(1, f.t / f.warn);
        f.mesh.position.y = gy + 9 - (9 - 0.1) * k * k * (0.35 + 0.65 * k); // accelerates into the floor
        f.mesh.rotation.y += dt * 4;
      }
      if (f.t < f.warn) continue;
      // impact
      this.fx.splice(i, 1);
      if (f.mesh) {
        f.mesh.removeFromParent();
        f.mesh = null;
      }
      try {
        if (f.kind === 'i') {
          G.vfx.spawn('hit_spark', [f.x, gy + 0.4, f.z], { scale: 1.5, color: 0xcff3ff });
          G.audio.play('frost_impact', { pos: [f.x, gy, f.z], volume: 0.8, pitch: 1.1, pitchVar: 0.1 });
        } else {
          G.vfx.spawn('fire_burst', [f.x, gy + 0.5, f.z], { scale: Math.max(0.8, f.r / 2.2) });
          G.audio.play('fire_impact', { pos: [f.x, gy, f.z], volume: 0.9, pitch: 0.8, pitchVar: 0.1 });
        }
        const lp = world.localPlayer;
        if (lp) {
          const d = Math.hypot(lp.position.x - f.x, lp.position.z - f.z);
          if (d < 18) G.events.emit('camera:shake', { intensity: 0.05 + 0.12 * (1 - d / 18), duration: 0.22 });
        }
      } catch {
        /* optional */
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const f of this.fx) f.mesh?.removeFromParent();
    this.fx = [];
    this.geo?.dispose();
    this.mat?.dispose();
    this.geo = null;
    this.mat = null;
  }
}
