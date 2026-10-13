import * as THREE from 'three';
import { G } from '../game/G';
import { SKILLS } from '../data/skills';
import { potionIds } from '../data/materials';
import type { EventScope } from '../core/EventBus';
import type { World } from '../world/World';
import type { BuiltDungeon, BuiltProp } from '../world/DungeonBuilder';
import type { SkillDef } from '../types/skills';
import type { DungeonParams } from './scenes';

type Kind = 'wood' | 'clay' | 'stone' | 'bone';

const SHARD_COLOR: Record<Kind, number> = { wood: 0x8a5a2e, clay: 0xa8704c, stone: 0x7c7c86, bone: 0xe4dcc4 };
const SMASH_SFX: Record<Kind, 'barrel_break' | 'pot_break' | 'rubble' | 'hit_bone'> = { wood: 'barrel_break', clay: 'pot_break', stone: 'rubble', bone: 'hit_bone' };
const MAX_SHARDS = 72;

function kindOf(model: string): Kind {
  const n = (model.split('/').pop() ?? model).toLowerCase();
  if (/urn|pot|vase|jar|cauldron/.test(n)) return 'clay';
  if (/rubble|rock|stone|pillar/.test(n)) return 'stone';
  if (/bone|skull|rib/.test(n)) return 'bone';
  return 'wood';
}

const goldAvg = (level: number): number => Math.round(6 + level * 3.2);

interface Pending {
  at: number;
  def: SkillDef | undefined;
}

interface Shard {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  sz: number;
  life: number;
  max: number;
  bounced: boolean;
}

export interface PropGameplayOpts {
  world: World;
  scene: THREE.Scene;
  built: BuiltDungeon;
  params: DungeonParams;
}

/**
 * Gameplay of the content module's tagged props (World system). Breakables (barrels, crates, kegs, urns... `tag: 'breakable'`) are NOT
 * enemies (no nameplate / minimap dot / soft-target / chain-lightning magnet): the LOCAL player's own attacks smash them, resolved at
 * the skill's hit frame from its real shape (melee arc, self AoE, ground AoE circle, projectile / beam line), and so do dodge rolls,
 * dashes and charges that crash through them. A smash is juicy (poof + shards, material-matched sound, a touch of hit-stop and shake),
 * hides the builder prop (`BuiltProp.hide()` re-opens its nav cells) and rolls the personal loot of GDD_CONTENT 1.3:
 * 15% gold, 4% potion, 3% item, 5% Can Küresi (Mythic+: gold and globes only). Smashing is a purely local, per-peer affair.
 * OWNER: scenes module.
 */
export class PropGameplay {
  private items: BuiltProp[];
  private pending: Pending[] = [];
  private ev: EventScope;
  private shards: Shard[] = [];
  private free: THREE.Mesh[] = [];
  private geo: THREE.BoxGeometry | null = null;
  private mats = new Map<Kind, THREE.MeshLambertMaterial>();
  private disposed = false;

  constructor(private o: PropGameplayOpts) {
    this.items = o.built.props.filter((p) => p.tag === 'breakable' && !p.hidden);
    this.ev = G.events.scope();
    if (this.items.length) {
      this.ev.on('skill:cast', (e) => {
        const lp = this.o.world.localPlayer;
        if (this.disposed || !lp || e.casterId !== lp.id) return;
        const def = SKILLS[e.skillId];
        const hit = e.castTime > 0 ? e.castTime : (def?.hitTime ?? 0.16);
        this.pending.push({ at: this.o.world.time + Math.min(0.8, Math.max(0.05, hit)), def });
      });
    }
  }

  get count(): number {
    return this.items.length;
  }

  // ------------------------------------------------------------------------------------------------
  // frame
  // ------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed) return;
    this.updateShards(dt);
    if (!this.items.length) return;
    const world = this.o.world;
    const p = world.localPlayer;
    if (!p || p.isDead || p.removed) {
      this.pending.length = 0;
      return;
    }
    // strikes whose hit frame has arrived
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const pd = this.pending[i];
      if (world.time < pd.at) continue;
      this.pending.splice(i, 1);
      this.strike(pd.def);
    }
    // rolls / dashes / charges crash through them
    const fm = p.forcedMove;
    if (p.dodging || (fm && fm.until > world.time && Math.hypot(fm.vx, fm.vz) > 6)) this.smashAll(this.inCircle(p.position.x, p.position.z, 1.4));
  }

  // ------------------------------------------------------------------------------------------------
  // hit resolution
  // ------------------------------------------------------------------------------------------------

  private live(): BuiltProp[] {
    this.items = this.items.filter((b) => !b.hidden);
    return this.items;
  }

  private inCircle(x: number, z: number, r: number): BuiltProp[] {
    return this.live().filter((b) => Math.hypot(b.x - x, b.z - z) <= r);
  }

  /** Cone from the player: `range` metres (+ prop radius), `arc` degrees, with line of sight to a point just in front of the prop. */
  private inCone(px: number, pz: number, fx: number, fz: number, range: number, arc: number): BuiltProp[] {
    const nav = this.o.built.nav;
    const half = ((arc / 2) * Math.PI) / 180;
    return this.live().filter((b) => {
      const dx = b.x - px, dz = b.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > range) return false;
      if (d > 0.9) {
        const cos = (dx * fx + dz * fz) / d;
        if (Math.acos(Math.max(-1, Math.min(1, cos))) > half + Math.atan2(0.5, d)) return false;
        const k = Math.max(0, d - 0.7) / d; // stop short of the prop: its own cells are blocked
        if (!nav.lineOfSight(px, pz, px + dx * k, pz + dz * k)) return false;
      }
      return true;
    });
  }

  private strike(def: SkillDef | undefined): void {
    const p = this.o.world.localPlayer;
    if (!p) return;
    const px = p.position.x, pz = p.position.z;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let hits: BuiltProp[] = [];
    switch (def?.targeting ?? 'melee_arc') {
      case 'melee_arc':
        hits = this.inCone(px, pz, fx, fz, (def?.range ?? 2.6) + 0.6, def?.arc ?? 120);
        break;
      case 'self_aoe':
        hits = this.inCircle(px, pz, (def?.radius ?? 4) + 0.5);
        break;
      case 'ground_aoe':
      case 'leap': {
        const reach = Math.min(def?.range ?? 8, 10) * 0.8;
        hits = this.inCircle(px + fx * reach, pz + fz * reach, (def?.radius ?? 3) + 0.5);
        break;
      }
      case 'projectile':
      case 'beam': {
        // the first (1 + pierce) props on the aim line
        const len = Math.min(def?.range ?? 14, 18);
        const line = this.live()
          .map((b) => {
            const dx = b.x - px, dz = b.z - pz;
            const along = dx * fx + dz * fz;
            const side = Math.abs(dx * fz - dz * fx);
            return { b, along, ok: along > 0.3 && along < len && side < 0.95 };
          })
          .filter((o) => o.ok)
          .sort((a, c) => a.along - c.along);
        hits = line.slice(0, 1 + Math.max(0, def?.pierce ?? 0)).map((o) => o.b);
        break;
      }
      default:
        break; // self_buff, dash (contact handles it)...
    }
    this.smashAll(hits);
  }

  // ------------------------------------------------------------------------------------------------
  // smash
  // ------------------------------------------------------------------------------------------------

  private smashAll(list: BuiltProp[]): void {
    if (!list.length) return;
    for (const b of list) this.smash(b);
    const n = Math.min(3, list.length);
    G.events.emit('hitstop', { ms: 30 + 14 * n });
    G.events.emit('camera:shake', { intensity: 0.05 + 0.035 * n, duration: 0.14 });
  }

  private smash(b: BuiltProp): void {
    if (b.hidden) return;
    const world = this.o.world;
    b.hide();
    const kind = kindOf(b.model);
    const gy = world.groundY(b.x, b.z);
    const cy = Math.max(b.y, gy) + 0.55;
    try {
      G.vfx.spawn('death_poof', [b.x, cy, b.z], { scale: 1.1 });
      G.vfx.spawn('hit_spark', [b.x, cy, b.z], { scale: 0.9, color: SHARD_COLOR[kind] });
      G.audio.play(SMASH_SFX[kind], { pos: [b.x, cy, b.z], pitchVar: 0.12 });
      if (kind === 'wood' || kind === 'clay') G.audio.play('hit_blunt', { pos: [b.x, cy, b.z], volume: 0.5, pitchVar: 0.15 });
    } catch {
      /* feedback is optional */
    }
    this.burst(kind, b.x, cy, b.z);
    this.rollLoot(b.x, cy, b.z);
  }

  private rollLoot(x: number, y: number, z: number): void {
    const params = this.o.params;
    const ch = G.character;
    const mplus = params.difficulty === 'mythicplus';
    const lvl = ch?.level ?? params.enemyLevel;
    const pos = { x, y: y - 0.5, z };
    let u = Math.random();
    try {
      if (u < 0.15) {
        G.loot.dropGold(goldAvg(lvl), pos);
        return;
      }
      u -= 0.15;
      if (!mplus) {
        if (u < 0.04) {
          // best tier the character may use (potion requiredLevel 1 / 15 / 30 / 45 / 60)
          const ids = potionIds('hp');
          const tier = [1, 15, 30, 45, 60].filter((L) => lvl >= L).length - 1;
          G.loot.dropMaterial(ids[Math.max(0, Math.min(ids.length - 1, tier))], 1, pos);
          return;
        }
        u -= 0.04;
        if (u < 0.03) {
          G.loot.dropItem(G.loot.rollItem({ itemLevel: params.enemyLevel, classId: ch?.classId, rank: 'trash' }), pos, { delay: 0.1 });
          return;
        }
        u -= 0.03;
      }
      if (u < 0.05) G.loot.dropGlobe(pos);
    } catch (e) {
      console.warn('[props] breakable loot failed', e);
    }
  }

  // ------------------------------------------------------------------------------------------------
  // shards
  // ------------------------------------------------------------------------------------------------

  private shardMesh(kind: Kind): THREE.Mesh {
    if (!this.geo) this.geo = new THREE.BoxGeometry(1, 1, 1);
    let mat = this.mats.get(kind);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: SHARD_COLOR[kind] });
      this.mats.set(kind, mat);
    }
    const m = this.free.pop() ?? new THREE.Mesh(this.geo, mat);
    m.material = mat;
    m.visible = true;
    if (!m.parent) this.o.scene.add(m);
    return m;
  }

  private burst(kind: Kind, x: number, y: number, z: number): void {
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      if (this.shards.length >= MAX_SHARDS) break;
      const mesh = this.shardMesh(kind);
      const a = Math.random() * Math.PI * 2, sp = 2.2 + Math.random() * 3.2;
      const sx = 0.1 + Math.random() * 0.16, sy = 0.06 + Math.random() * 0.1, sz = 0.14 + Math.random() * 0.2;
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y - 0.1 + Math.random() * 0.5, z + (Math.random() - 0.5) * 0.4);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      mesh.scale.set(sx, sy, sz);
      const life = 0.8 + Math.random() * 0.5;
      this.shards.push({ mesh, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 3.6, vz: Math.sin(a) * sp, sx, sy, sz, life, max: life, bounced: false });
    }
  }

  private updateShards(dt: number): void {
    const world = this.o.world;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        this.free.push(s.mesh);
        this.shards.splice(i, 1);
        continue;
      }
      s.vy -= 15 * dt;
      const m = s.mesh;
      m.position.x += s.vx * dt;
      m.position.y += s.vy * dt;
      m.position.z += s.vz * dt;
      m.rotation.x += s.vz * dt * 2;
      m.rotation.z -= s.vx * dt * 2;
      const gy = world.groundY(m.position.x, m.position.z) + 0.04;
      if (m.position.y < gy) {
        m.position.y = gy;
        if (!s.bounced && s.vy < -2) {
          s.vy = -s.vy * 0.32;
          s.vx *= 0.6;
          s.vz *= 0.6;
          s.bounced = true;
        } else {
          s.vy = 0;
          s.vx *= 0.8;
          s.vz *= 0.8;
        }
      }
      const k = Math.min(1, s.life / 0.3); // shrink away over the last 0.3 s
      m.scale.set(s.sx * k, s.sy * k, s.sz * k);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.ev.dispose();
    this.pending.length = 0;
    for (const s of this.shards) s.mesh.removeFromParent();
    for (const m of this.free) m.removeFromParent();
    this.shards = [];
    this.free = [];
    this.geo?.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    this.geo = null;
  }
}
