import * as THREE from 'three';
import { G } from '../game/G';
import { monsterDmg } from '../entities/EnemyFactory';
import { TILE_SIZE, type DungeonDef, type HazardDef, type RoomDef, type ZoneDef } from '../types/dungeons';
import type { DamageType } from '../types/common';
import type { SfxId } from '../types/audio';
import type { VfxId } from '../types/vfx';
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

type GroundedBy = NonNullable<HazardDef['groundedBy']>;
type Kind = HazardDef['kind'];
/** Visual code of a strike (the 'hz:' gate message carries it): l lava, i icicle, d debris, p plague, b bolt. */
type Code = 'l' | 'i' | 'd' | 'p' | 'b';
const CODES = 'lidpb';

const CODE_OF: Record<Kind, Code> = { lava_burst: 'l', icicle_drop: 'i', debris_fall: 'd', plague_vent: 'p', lightning_strike: 'b' };
/** Hit shape damage of each hazard kind (host only). */
const STRIKE: Record<Kind, { type: DamageType; name: string }> = {
  lava_burst: { type: 'fire', name: 'Lav Fışkırması' },
  icicle_drop: { type: 'frost', name: 'Buz Sarkıtı' },
  debris_fall: { type: 'physical', name: 'Düşen Enkaz' },
  plague_vent: { type: 'poison', name: 'Veba Buharı' },
  lightning_strike: { type: 'lightning', name: 'Yıldırım' },
};
/** Impact feedback of each visual code (every peer). */
const IMPACT: Record<Code, { vfx: VfxId; color?: number; sfx: SfxId; pitch: number; volume: number; scale: 'fire' | 'fixed' }> = {
  l: { vfx: 'fire_burst', sfx: 'fire_impact', pitch: 0.8, volume: 0.9, scale: 'fire' },
  i: { vfx: 'hit_spark', color: 0xcff3ff, sfx: 'frost_impact', pitch: 1.1, volume: 0.8, scale: 'fixed' },
  d: { vfx: 'hit_spark', color: 0x8a7a66, sfx: 'rubble', pitch: 1.0, volume: 0.8, scale: 'fixed' },
  p: { vfx: 'poison_burst', sfx: 'poison_impact', pitch: 0.9, volume: 0.8, scale: 'fire' },
  b: { vfx: 'lightning_strike', sfx: 'lightning_impact', pitch: 1.1, volume: 0.9, scale: 'fixed' },
};
/** Seconds a grounded rod's status lasts on a player standing by it. */
const ROD_STATUS_SEC = 6;
/** Seconds of the storm strike telegraph (the hit shape delay). */
const STORM_WARN = 0.9;

/**
 * P-17 grounding, pure: index of the rod (`groundedBy.pos`) whose `radius` contains the point (x, z), or -1.
 * Rods and the point are world metres. `radius` is the caller's choice: strikes use `g.radius`, players use it too.
 */
export function rodIndexNear(x: number, z: number, g: GroundedBy | undefined, radius: number): number {
  if (!g) return -1;
  const r2 = radius * radius;
  for (let i = 0; i < g.pos.length; i++) {
    const dx = x - g.pos[i][0], dz = z - g.pos[i][1];
    if (dx * dx + dz * dz <= r2) return i;
  }
  return -1;
}

/** P-17 grounding, pure: true when a strike at (x, z) is cancelled by one of the rods (within `g.radius`). */
export function groundedStrike(x: number, z: number, g: GroundedBy | undefined): boolean {
  return !!g && rodIndexNear(x, z, g, g.radius) >= 0;
}

interface Slot {
  /** Position in DungeonHazards.slots (identical on every peer: built from the same def in the same order). */
  idx: number;
  room: RoomDef;
  h: HazardDef;
  t: number;
  /** Storm rhythm (RoomDef.storm.every): the next strike comes after a random time in this range. */
  every?: [number, number];
}

interface Fx {
  code: Code;
  x: number;
  z: number;
  t: number;
  warn: number;
  r: number;
  /** Height the falling mesh starts from (capped by the ceiling above the spot). */
  top: number;
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
 *  - host: periodic RoomDef.hazards (lava, icicles, debris, plague vents, lightning) while a living player is in that room: a random
 *    walkable spot (half of them near a player) gets a HitShape telegraph + burst (replicated by HitShapes, resolved per peer for its
 *    own player). Every strike lands on the floor under it (`world.groundY`), so vertical dungeons strike the right level.
 *  - host: RoomDef.storm rooms get a lightning strike every `storm.every` seconds (damage coef = `storm.strength`).
 *  - host: a strike within `HazardDef.groundedBy.radius` of a rod is cancelled; the players by that rod gain its status (per peer, local).
 *  - The host broadcasts 'hz:' messages on the 'gate' channel so every peer shows the telegraph (and 'hz:g:' for rod charges).
 * OWNER: scenes module.
 */
export class DungeonHazards {
  private slots: Slot[] = [];
  private fx: Fx[] = [];
  private inZone = false;
  private zoneAcc = 0;
  private disposed = false;
  private geos: Partial<Record<Code, THREE.BufferGeometry>> = {};
  private mats: Partial<Record<Code, THREE.MeshBasicMaterial>> = {};

  private o: HazardOpts;

  constructor(o: HazardOpts) {
    this.o = o;
    for (const r of o.def.rooms) {
      for (const h of r.hazards ?? []) this.slots.push({ idx: this.slots.length, room: r, h, t: h.interval * 0.5 });
      if (r.storm) {
        const [a, b] = r.storm.every;
        const h: HazardDef = { kind: 'lightning_strike', interval: (a + b) / 2, warn: STORM_WARN, radius: 2.2, coef: r.storm.strength };
        this.slots.push({ idx: this.slots.length, room: r, h, t: a + Math.random() * Math.max(0, b - a), every: [a, b] });
      }
    }
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
  // periodic room hazards and storms (host)
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
      if (s.every) {
        s.t = s.every[0] + Math.random() * (s.every[1] - s.every[0]);
        this.erupt(s, inside);
        continue;
      }
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
    // P-17 grounding: a strike within a rod's radius is cancelled and the players by that rod are charged
    if (groundedStrike(x, z, s.h.groundedBy)) {
      const rod = rodIndexNear(x, z, s.h.groundedBy, s.h.groundedBy!.radius);
      this.applyRodStatus(s.idx, rod);
      try {
        G.net.broadcast('gate', { key: `hz:g:${s.idx}:${rod}`, open: true });
      } catch {
        /* offline */
      }
      return;
    }
    const code = CODE_OF[s.h.kind];
    const gy = world.groundY(x, z); // the floor under the spot (vertical dungeons: the level it stands on)
    const st = STRIKE[s.h.kind];
    try {
      G.hitShapes.spawn({
        sourceId: null,
        shape: { type: 'circle', radius: s.h.radius },
        origin: [x, gy, z],
        dir: [0, 1],
        delay: s.h.warn,
        damage: this.baseDamage() * s.h.coef,
        type: st.type,
        statuses: s.h.stun ? [{ status: 'stun', duration: s.h.stun }] : undefined,
        knockback: code === 'l' ? 3.5 : 0,
        telegraph: true,
        kind: 'danger',
        abilityName: st.name,
        vfxOnLand: s.h.vfx ?? IMPACT[code].vfx,
      });
    } catch (e) {
      console.warn('[hazards] hit shape failed', e);
      return;
    }
    this.visual(code, x, z, s.h.warn, s.h.radius);
    try {
      G.net.broadcast('gate', { key: `hz:${code}:${x.toFixed(1)}:${z.toFixed(1)}:${s.h.warn.toFixed(2)}:${s.h.radius.toFixed(1)}`, open: true });
    } catch {
      /* offline */
    }
  }

  /** P-17: the local player stands by rod `rod` of slot `slot` and gains that rod's status (no-op when out of range). */
  private applyRodStatus(slot: number, rod: number): void {
    const g = this.slots[slot]?.h.groundedBy;
    const status = g?.status;
    const p = this.o.world.localPlayer;
    if (!g || !status || rod < 0 || !p || p.isDead || p.removed) return;
    if (rodIndexNear(p.position.x, p.position.z, { pos: [g.pos[rod]], radius: g.radius }, g.radius) < 0) return;
    try {
      p.statuses.apply(status, ROD_STATUS_SEC);
    } catch (e) {
      console.warn('[hazards] rod status failed', e);
    }
  }

  /** Every peer: `hz:<l|i|d|p|b>:<x>:<z>:<warn>:<radius>` telegraphs, `hz:g:<slot>:<rod>` rod charges (the 'gate' channel). */
  handleMessage(key: string): void {
    const p = key.split(':');
    if (p[0] !== 'hz') return;
    if (p[1] === 'g') {
      const si = Number(p[2]), ri = Number(p[3]);
      if (Number.isInteger(si) && Number.isInteger(ri)) this.applyRodStatus(si, ri);
      return;
    }
    const c = p[1] ?? '';
    if (c.length !== 1 || !CODES.includes(c)) return;
    const code = c as Code;
    const x = Number(p[2]), z = Number(p[3]), warn = Number(p[4]), r = Number(p[5]);
    if (![x, z, warn, r].every(Number.isFinite)) return;
    this.visual(code, x, z, Math.max(0.2, Math.min(5, warn)), Math.max(0.5, Math.min(12, r)));
  }

  // ------------------------------------------------------------------------------------------------
  // visuals (every peer)
  // ------------------------------------------------------------------------------------------------

  private geoOf(code: Code): THREE.BufferGeometry {
    let g = this.geos[code];
    if (!g) {
      if (code === 'i') {
        g = new THREE.ConeGeometry(0.34, 2.6, 6);
        g.rotateX(Math.PI); // tip down
      } else if (code === 'd') {
        g = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      } else {
        g = new THREE.CylinderGeometry(0.08, 0.08, 9, 5); // bolt
      }
      this.geos[code] = g;
    }
    return g;
  }

  private matOf(code: Code): THREE.MeshBasicMaterial {
    let m = this.mats[code];
    if (!m) {
      const color = code === 'i' ? 0xd6f2ff : code === 'd' ? 0x8a7a66 : 0xbfe9ff;
      m = new THREE.MeshBasicMaterial({ color });
      this.mats[code] = m;
    }
    return m;
  }

  private visual(code: Code, x: number, z: number, warn: number, r: number): void {
    const { world, built, scene } = this.o;
    const gy = world.groundY(x, z);
    let mesh: THREE.Mesh | null = null;
    // falling strikes start at most 9 m up, and never through the ceiling above the spot (vertical dungeons)
    const top = Math.max(gy + 1, Math.min(gy + 9, built.ceilingY(x, z) - 0.4));
    try {
      if (code === 'i' || code === 'd' || code === 'b') {
        mesh = new THREE.Mesh(this.geoOf(code), this.matOf(code));
        const k = code === 'd' ? Math.max(0.6, r / 2) : code === 'i' ? Math.max(0.6, r / 1.5) : 1;
        mesh.scale.set(k, code === 'b' ? 1 : k, k);
        mesh.position.set(x, top, z);
        scene.add(mesh);
        if (code === 'i') G.audio.play('frost_cast', { pos: [x, gy + 1, z], volume: 0.4, pitch: 1.5, pitchVar: 0.1 });
        else if (code === 'd') G.audio.play('rubble', { pos: [x, gy + 1, z], volume: 0.35, pitch: 1.3, pitchVar: 0.1 });
        else G.audio.play('lightning_cast', { pos: [x, gy + 1, z], volume: 0.5, pitchVar: 0.1 });
      } else if (code === 'p') {
        G.vfx.spawn('poison_cloud', [x, gy + 0.3, z], { scale: Math.max(0.5, (r / 2.2) * 0.85), duration: warn });
      } else {
        G.vfx.spawn('fire_ground', [x, gy + 0.05, z], { scale: Math.max(0.5, (r / 2.2) * 0.85), duration: warn });
        G.audio.play('fire_cast', { pos: [x, gy + 0.5, z], volume: 0.5, pitch: 0.6, pitchVar: 0.1 });
      }
    } catch {
      /* visuals are optional */
    }
    this.fx.push({ code, x, z, t: 0, warn, r, top, mesh });
  }

  private updateFx(dt: number): void {
    const { world } = this.o;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const gy = world.groundY(f.x, f.z);
      if (f.mesh) {
        const k = Math.min(1, f.t / f.warn);
        f.mesh.position.y = f.top - (f.top - gy - 0.1) * k * k * (0.35 + 0.65 * k); // accelerates into the floor
        f.mesh.rotation.y += dt * 4;
      }
      if (f.t < f.warn) continue;
      // impact
      this.fx.splice(i, 1);
      if (f.mesh) {
        f.mesh.removeFromParent();
        f.mesh = null;
      }
      const im = IMPACT[f.code];
      try {
        const scale = im.scale === 'fire' ? Math.max(0.8, f.r / 2.2) : im.color !== undefined ? 1.5 : 1.2;
        const pos: [number, number, number] = [f.x, gy + 0.4, f.z];
        if (im.color !== undefined) G.vfx.spawn(im.vfx, pos, { scale, color: im.color });
        else G.vfx.spawn(im.vfx, pos, { scale });
        G.audio.play(im.sfx, { pos: [f.x, gy, f.z], volume: im.volume, pitch: im.pitch, pitchVar: 0.1 });
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
    for (const g of Object.values(this.geos)) g?.dispose();
    for (const m of Object.values(this.mats)) m?.dispose();
    this.geos = {};
    this.mats = {};
  }
}
