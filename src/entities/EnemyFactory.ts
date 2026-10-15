import type * as THREE from 'three';
import { G } from '../game/G';
import { Enemy } from './Enemy';
import { getEnemyDef } from '../data/enemies';
import { isLowLevelTrashRank, lowLevelDmgMult, lowLevelHpMult } from '../data/lowLevelScaling';
import { EnemyAI } from '../ai/EnemyAI';
import { BossController, BOSS_SPAWNS } from '../ai/BossController';
import { getDirector, hooks } from '../ai/EnemyDirector';
import { registerBossNet } from '../ai/bossNet';
import { HOST_DYNAMIC_ID_BASE, type EntityId } from '../types/common';
import type { World } from '../world/World';

export interface SpawnEnemyOpts {
  id?: EntityId;                // deterministic id (dungeon spawns) — default world.allocHostId()
  level: number;
  packId?: string | null;
  facing?: number;              // radians
  /** Apply current M+ scaling (default true). */
  scaled?: boolean;
  /** Open-world camp spawn: trash / swarm take the low-level curve (data/lowLevelScaling.ts). Clients get it on the 'spawn' payload. */
  openWorld?: boolean;
  /** Spawned mid-fight (adds): aggro immediately on the nearest player. */
  aggro?: boolean;
  /** Scripted encounter (escort ambush): with `aggro` it engages at once, bypassing the pull cap and the village safe boxes (EnemyAI.scripted). */
  scripted?: boolean;
  // ---- enemies module additions ----
  /** Start dormant (floor pose) until a player gets close / hits it. Default: the def's `ai.dormant` for static spawns. */
  dormant?: boolean;
  /** Patrol loop in world coordinates (PackDef.patrol converted by the scene). */
  patrol?: { x: number; z: number }[];
  /** Summoner id (adds are removed when a boss resets). */
  owner?: EntityId | null;
  tag?: string;
  /** Start at this fraction of max HP (raised skeletons 0.5). */
  hpFrac?: number;
  /** Explicit HP multiplier (x monsterHP(level)) replacing def.hpMult, no scaling at all (mechanic entities). */
  hpMult?: number;
  // ---- PackDef pass-through (scenes: every peer passes the same values for deterministic dungeon spawns) ----
  /** PackDef.stealth: the member is invisible-ish (alpha 0.15) until the pack aggroes / is hit; reveals within 7 m of a player. */
  stealth?: boolean;
  /** PackDef.linkedTo: pulling this pack pulls these packs too (registered with the director on the authority; needs packId). */
  linkedTo?: string[];
  /** PackDef.dormant.wakeRadius (m): wake-up distance of a dormant spawn (default def.ai.wakeRange, 6). */
  wakeRadius?: number;
}

/** monsterHP / monsterDmg of GDD_SYSTEMS §1.10. */
export const monsterHP = (L: number) => Math.round(14 + 0.62 * L * L);
export const monsterDmg = (L: number) => Math.round(14 + 4.5 * L);

/** GDD §0.3 party scaling of HP outside Mythic+ (runs include it in G.mplus.enemyScaling). */
export function partyHpMult(n?: number): number {
  const members = n ?? Math.max(1, G.net?.partySize ?? 1);
  return 1 + 0.6 * (Math.max(1, members) - 1);
}

let netFor: unknown = null;

/** Register the 'spawn' / 'ecast' receivers once per NetSession (enemies module owns both channels). */
function ensureNetHandlers(): void {
  const net = G.net;
  if (!net || netFor === net) return;
  netFor = net;
  registerBossNet();
  net.on('spawn', (p, from) => {
    try {
      if (net.isAuthority || from !== net.hostId || !p || typeof p.id !== 'number' || typeof p.defId !== 'string') return;
      const world = G.world;
      if (!world) return;
      const id = Math.round(p.id);
      if (p.remove) {
        const e = world.get(id) as Enemy | undefined;
        if (e && e.kind === 'enemy') e.escape();
        return;
      }
      if (world.get(id)) return;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return;
      world.noteHostId(id);
      void spawnEnemy(world, p.defId, { x: p.x, z: p.z }, {
        id, level: Math.max(1, Math.min(200, Math.round(p.level) || 1)), packId: typeof p.packId === 'string' ? p.packId : null, facing: typeof p.facing === 'number' ? p.facing : undefined,
        openWorld: !!p.openWorld, aggro: !!p.aggro, owner: typeof p.owner === 'number' ? p.owner : null, tag: typeof p.tag === 'string' ? p.tag.slice(0, 24) : undefined, hpFrac: typeof p.hpFrac === 'number' ? p.hpFrac : undefined,
      });
    } catch (e) {
      console.error('[enemy] spawn receiver failed', e);
    }
  });
  net.on('ecast', (p, from) => {
    try {
      if (net.isAuthority || from !== net.hostId || !p) return;
      const e = G.world?.get(p.enemyId) as Enemy | undefined;
      if (!e || e.kind !== 'enemy' || e.authority) return;
      if (p.ended) {
        // an interrupt this client already predicted (its own stun / strong hit cleared e.cast) is announced once only
        const hadCast = !!e.cast;
        e.cast = null;
        if (p.interrupted && !hadCast) return;
        const by = (p as unknown as { interruptedBy?: unknown }).interruptedBy;
        G.events.emit('enemy:castEnd', {
          enemyId: e.id, abilityId: String(p.abilityId).slice(0, 48), interrupted: !!p.interrupted,
          interruptedBy: typeof by === 'number' ? by : undefined,
        });
        return;
      }
      const dur = Math.max(0.1, Math.min(60, Number(p.castTime) || 1));
      e.cast = { skillId: String(p.abilityId).slice(0, 48), name: String(p.name).slice(0, 48), start: e.world?.time ?? 0, duration: dur, channel: false, interruptible: !!p.interruptible };
      G.events.emit('enemy:castStart', { enemyId: e.id, abilityId: e.cast.skillId, name: e.cast.name, castTime: dur, interruptible: !!p.interruptible });
      G.vfx.spawn('enemy_cast_glow', e.pointAt(0.55), { follow: e.model ?? e.object3d, duration: dur });
    } catch (err) {
      console.error('[enemy] ecast receiver failed', err);
    }
  });
}

/**
 * Create an enemy from data/enemies.ts (trash, elites, bosses), load its model, set stats from level/rank/M+, attach AI when
 * authoritative, add to the world, notify G.mplus.onEnemySpawned. Dungeon spawns pass a deterministic `id`; the host also
 * broadcasts dynamic adds (ids from world.allocHostId) on the 'spawn' channel and clients create them with that id.
 * OWNER: enemies module.
 */
export async function spawnEnemy(world: World, defId: string, pos: THREE.Vector3 | { x: number; z: number }, opts: SpawnEnemyOpts): Promise<Enemy | null> {
  const def = getEnemyDef(defId);
  if (!def) {
    console.warn(`[enemy] unknown enemy def "${defId}"`);
    return null;
  }
  const authority = !G.net || G.net.isAuthority;
  let id = opts.id;
  if (id === undefined) {
    if (!authority) {
      console.warn(`[enemy] client called spawnEnemy("${defId}") without an id — ignored (clients only spawn with the host's id)`);
      return null;
    }
    id = world.allocHostId();
  } else if (id >= HOST_DYNAMIC_ID_BASE) world.noteHostId(id);
  if (world.get(id)) return world.get(id) as Enemy;
  const dynamic = id >= HOST_DYNAMIC_ID_BASE;
  ensureNetHandlers();
  const level = Math.max(1, Math.round(opts.level || 1));
  if (dynamic && authority) {
    try {
      G.net?.broadcast('spawn', {
        id, defId, x: pos.x, z: pos.z, level, packId: opts.packId ?? null, facing: opts.facing, aggro: !!opts.aggro,
        owner: opts.owner ?? undefined, tag: opts.tag, hpFrac: opts.hpFrac, openWorld: opts.openWorld || undefined,
      });
    } catch { /* offline */ }
  }

  const e = new Enemy(id, def);
  e.authority = authority;
  e.level = level;
  e.packId = opts.packId ?? null;
  e.homeX = pos.x;
  e.homeZ = pos.z;
  e.object3d.position.set(pos.x, world.vertical ? world.groundY(pos.x, pos.z) : 0, pos.z);
  e.yaw = opts.facing ?? Math.random() * Math.PI * 2;
  e.dynamic = dynamic;
  e.forcesCounted = dynamic; // summoned / split / raised enemies give no M+ forces
  e.ownerId = opts.owner ?? null;
  e.tag = opts.tag ?? '';
  e.dormant = !!(opts.dormant ?? (def.ai?.dormant && !dynamic));
  e.patrol = opts.patrol ?? null;
  if (opts.wakeRadius && opts.wakeRadius > 0) e.wakeRange = opts.wakeRadius;
  if (authority && opts.packId && opts.linkedTo?.length) {
    try {
      const dir = getDirector(world);
      for (const l of opts.linkedTo) dir.linkPacks(opts.packId, l);
    } catch (err) {
      console.warn('[enemy] linkPacks failed', err);
    }
  }

  // ---- stats ----
  // open-world trash / swarm: the low-level HP and damage curve (no effect from L20 up, and never on instances / bosses)
  const lowMobs = !!opts.openWorld && isLowLevelTrashRank(def.rank, def.role);
  e.openWorld = lowMobs;
  let hpScale = 1, dmgScale = 1;
  let partyScale: { hp: number; dmg: number } | null = null;
  // the low-level curve is the whole open-world trash scaling and is solo-tuned: no run party factor on it (a solo run would add x1.4 damage / x0.9 HP,
  // so L1-10 trash hit ~40 % harder than lowLevelScaling.ts describes). Instances and every elite / boss keep their party factors.
  if (opts.scaled !== false && !lowMobs) {
    try {
      // encounter adds (mini-bosses / boss-summoned adds) take Tyrannical, not Fortified (MythicPlus.isEncounterAdd, K16)
      const s = G.mplus.enemyScaling(def.rank === 'boss', def.rank === 'miniboss' || opts.tag === 'encounter_boss');
      dmgScale = s.dmg;
      if (opts.hpMult === undefined) hpScale = s.hp;
    } catch { /* mythic not ready */ }
    // explicit hpMult (mechanic entities: cages, tombs, phylacteries) already contains its own party scaling
    if (opts.hpMult === undefined) hpScale *= G.mplus?.state ? G.mplus.partyHpMult() : partyHpMult();
    // instance runs keep the party factors they were spawned with, so a join / leave can rescale them (MythicPlus.syncPartySize)
    if (opts.hpMult === undefined && G.mplus?.state) {
      try { partyScale = G.mplus.partyFactors(def.rank === 'boss'); } catch { /* mythic not ready */ }
    }
  }
  e.partyScale = partyScale;
  const baseHp = monsterHP(level) * (opts.hpMult ?? def.hpMult) * (opts.hpMult !== undefined ? 1 : hpScale) * (lowMobs ? lowLevelHpMult(level) : 1);
  e.maxHp = Math.max(1, Math.round(baseHp));
  e.hp = Math.max(1, Math.round(e.maxHp * (opts.hpFrac ?? 1)));
  e.baseDamage = monsterDmg(level) * def.dmgMult * dmgScale * (lowMobs ? lowLevelDmgMult(level) : 1);
  e.stats = {};
  if (def.armorMult) e.stats.armor = 10 * level * def.armorMult;

  try {
    await e.loadModel();
  } catch (err) {
    console.error(`[enemy] model load failed for ${defId}`, err);
  }
  if (e.removed) return null;
  if (world.get(id)) return world.get(id) as Enemy; // spawned twice while loading
  world.add(e);
  e.setLocomotion('idle');
  if (opts.stealth && !def.ai?.stealthReveal && !dynamic) {
    e.packStealth = true;
    e.hidden = true;
    e.setAlpha(0.15, true);
  }

  if (authority) {
    const dir = getDirector(world);
    try {
      e.ai = def.rank === 'boss' ? new BossController(e, dir) : new EnemyAI(e, dir);
    } catch (err) {
      console.error(`[enemy] AI setup failed for ${defId}`, err);
    }
  }

  // spawn presentation for mid-fight adds
  if (dynamic) {
    try {
      G.vfx.spawn('add_spawn', [e.position.x, 0.3, e.position.z]);
      const clip = def.anims.spawn;
      if (clip && e.anim?.has(clip)) {
        const dur = e.playShot(clip, 2, { fade: 0.02 });
        e.ai?.holdFor(dur);
      } else e.playSpawnPop();
    } catch { /* ignore */ }
  }

  // every peer: affix visuals (inspiring aura, orb mesh...) are idempotent per enemy (Affixes keeps a WeakSet), the 0.4 s scan is the fallback
  try {
    G.mplus.onEnemySpawned(e);
  } catch (err) {
    console.error('[enemy] mplus.onEnemySpawned failed', err);
  }
  if (authority) {
    if (opts.scripted && e.ai) e.ai.scripted = true;
    if (opts.aggro && e.ai && !e.dormant) {
      const p = world.nearest(world.players, e.position, 400, (a) => !a.isDead);
      if (p) e.ai.acquire(p, true);
    }
  }
  return e;
}

/** All model URLs needed by a set of enemy/boss ids (for preloading). Includes weapons, extra clip sources and boss adds. */
export function enemyAssetUrls(defIds: string[]): string[] {
  const urls = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const d = getEnemyDef(id);
    if (!d) return;
    if (d.model && !d.model.startsWith('PROC:')) urls.add(d.model);
    for (const a of d.visual?.attach ?? []) urls.add(a.url);
    if (d.visual?.clipsFrom) urls.add(d.visual.clipsFrom);
    for (const ab of [d.basicAttack, ...d.abilities]) if (ab.summon) visit(ab.summon.enemyId);
    for (const extra of BOSS_SPAWNS[id] ?? []) visit(extra);
  };
  for (const id of defIds) visit(id);
  return [...urls];
}

// AI code spawns adds through this hook (no import cycle with the factory)
hooks.spawn = spawnEnemy;
