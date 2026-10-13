/**
 * Minion / pet / summon shapes (GDD_CLASSES_V2 §1.5, NC02). Shared types, core module. Owners: combat (manager
 * combat/Minions.ts, data/minions*.ts, behaviours), enemies (ai/MinionAI.ts), net (replication), hud (MinionFrames).
 * Append-only: add optional fields, never rename or remove.
 */
import type { ClassId, DamageType, EntityId } from './common';
import type { StatusApply } from './skills';
import type { VfxId } from './vfx';
import type { SfxId } from './audio';

export type MinionRole = 'melee' | 'ranged' | 'caster' | 'tank' | 'beast' | 'guardian' | 'clone';

export interface MinionAttack {
  id: string; name: string; kind: 'melee' | 'projectile' | 'aoe' | 'leap' | 'taunt' | 'buff';
  range: number; cooldown: number; hitTime: number; anim: string; animSpeed?: number;
  coef: number; type: DamageType; radius?: number; arc?: number; speed?: number; knockback?: number; stagger?: number;
  statuses?: StatusApply[]; vfx?: { cast?: VfxId; projectile?: VfxId; impact?: VfxId }; sfx?: { cast?: SfxId; impact?: SfxId };
  weight?: number; params?: Record<string, number>;
}

export interface MinionDef {
  id: string; name: string; ownerClass: ClassId; role: MinionRole; group: string;          // group = cap bucket ('skeleton','pet','demon','clone','golem','guardian','knight','pack','army','infernal')
  model: string; scale: number; tint?: number; emissive?: number; ghost?: number; hide?: string[];
  weapon?: { url: string; bone: 'handslot.r' | 'handslot.l'; pos?: [number, number, number]; rotY?: number; scale?: number };
  offhand?: { url: string; bone: 'handslot.r' | 'handslot.l'; pos?: [number, number, number]; rotY?: number; scale?: number };
  anims: { idle: string; walk: string; run: string; hit?: string; death: string; spawn?: string };
  hover?: number; radius: number; height: number; speed: number;
  hpFrac: number;              // × owner.maxHp × (1 + minionHpPct)
  armorFrac: number;           // physical DR fraction (0..0.6)
  attacks: MinionAttack[]; aggro: number; follow: [number, number]; leash: number;
  life?: number;               // seconds (timed summons)
  spawnVfx?: VfxId; spawnSfx?: SfxId; deathVfx?: VfxId;
  /** Free re-summon of a dead pet / demon (no cast): seconds until it returns, `scene` after a scene change (GDD_CLASSES_V2 §1.5 rule 8). */
  respawn?: { dead: number; scene?: number };
}

/**
 * One owned minion in the `minion` net channel (owner -> all, 10 Hz; GDD_CLASSES_V2 §1.5 rule 1). Remote peers create /
 * remove remote Minions from these snapshots (despawn after 1.5 s without one, or at hp <= 0).
 * `life` = seconds left for timed summons, 0 = not timed.
 */
export interface MinionSync {
  id: EntityId;
  defId: string;
  ownerId: EntityId;
  x: number; z: number; yaw: number;
  anim: string;
  hp: number; maxHp: number;
  life: number;
}
