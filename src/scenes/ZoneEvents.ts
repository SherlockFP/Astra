import { G } from '../game/G';
import { spawnEnemy } from '../entities/EnemyFactory';
import type { Enemy } from '../entities/Enemy';
import { getEnemyDef } from '../data/enemies';
import { RNG, hashString } from '../core/utils';
import { TILE_SIZE, type BossPlacement, type DungeonDef } from '../types/dungeons';
import type { World } from '../world/World';
import type { BuiltDungeon } from '../world/DungeonBuilder';
import type { CursedChest } from '../entities/interactables';
import type { DungeonParams } from './scenes';

const tileToWorld = (c: number): number => (c + 0.5) * TILE_SIZE;

/** GDD_CONTENT 1.8: 7 waves of 6 (every 5 s, 10 m ring), 40 kills inside the window, 10 min cooldown per chest. */
export const CURSE = { waves: 7, interval: 5, mobsPerWave: 6, ring: 10, need: 40, window: 36, cooldown: 600 };
/** GDD_CONTENT 1.6: open world rolls every 5 min (15%); dungeons roll once after the first boss (8% / M+ 3%). */
const GOBLIN = { owInterval: 300, owChance: 0.15, dungeonChance: 0.08, mplusChance: 0.03 };
/** World boss respawn (GDD_CONTENT 2.6): 15 minutes after the kill. */
const BOSS_RESPAWN_SEC = 900;

interface CampInfo {
  defs: string[];
  lo: number;
  hi: number;
}

interface CurseRun {
  index: number;
  t: number;
  waves: number;
  spawned: Enemy[];
  counted: Set<Enemy>;
  kills: number;
  lastSent: number;
  info: CampInfo;
  chest: CursedChest;
}

export interface ZoneEventsOpts {
  world: World;
  def: DungeonDef;
  params: DungeonParams;
  built: BuiltDungeon;
  outdoor: boolean;
}

/**
 * Host-driven set pieces on top of a dungeon / open-world scene: Hazine Goblini rolls, the open world's Lanetli Sandık wave
 * event, the world boss respawn. Registered as a World system (ticks with the scene), announces through the existing 'gate' channel
 * (`ev:*` keys, handled by `handleMessage` on every peer) and gives every peer its OWN personal rewards.
 * OWNER: scenes module.
 */
export class ZoneEvents {
  private rng: RNG;
  private chests: CursedChest[] = [];
  private curse: CurseRun | null = null;
  private goblinClock = 0;
  private bossTimer: { placement: BossPlacement; at: number } | null = null;
  private firstBossSeen = false;
  private disposed = false;

  constructor(private o: ZoneEventsOpts) {
    this.rng = new RNG(hashString(`${o.params.seed}:zone-events:${Date.now() >> 12}`));
  }

  // ------------------------------------------------------------------------------------------------
  // scene hooks
  // ------------------------------------------------------------------------------------------------

  registerChest(c: CursedChest): void {
    this.chests.push(c);
  }

  /** CursedChest.onOpen: only the host starts the wave event (guests cannot reach the host over a host-only channel). */
  openChest(c: CursedChest): void {
    if (this.curse) return;
    if (!G.net.isAuthority) {
      G.ui.toast('Lanetli Sandık\'ı yalnızca oda sahibi uyandırabilir.', 'info');
      G.audio.play('chest_locked');
      return;
    }
    this.startCurse(c);
  }

  /** Host: a boss died. Open world = respawn timer; dungeon = first-boss goblin roll. */
  onBossDefeated(bossId: string): void {
    if (!G.net.isAuthority) return;
    // open-world maps: the world boss schedule (scenes/world/BossSchedule.ts) owns respawns
    if (this.o.def.world) return;
    if (this.o.outdoor) {
      const placement = this.o.def.bosses.find((b) => b.bossId === bossId);
      if (placement) this.bossTimer = { placement, at: this.o.world.time + BOSS_RESPAWN_SEC };
      return;
    }
    if (this.firstBossSeen) return;
    this.firstBossSeen = true;
    const p = this.o.params.difficulty === 'mythicplus' ? GOBLIN.mplusChance : GOBLIN.dungeonChance;
    if (this.rng.chance(p)) {
      const delay = 4 + this.rng.next() * 6;
      setTimeout(() => {
        if (!this.disposed) void this.spawnGoblinInClearedRoom();
      }, delay * 1000);
    }
  }

  /** Every peer: an `ev:*` message of the 'gate' channel. */
  handleMessage(key: string): void {
    const parts = key.split(':'); // ev:goblin | ev:boss | ev:curse:<i>:start|prog:<n>|win|lose
    if (parts[0] !== 'ev') return;
    if (parts[1] === 'goblin') {
      this.announceGoblin();
    } else if (parts[1] === 'boss') {
      G.ui.toast('Çürükkök topraktan yükseliyor!', 'boss');
      G.audio.play('timer_warning', { volume: 0.7 });
    } else if (parts[1] === 'curse') {
      const chest = this.chests[Number(parts[2])] ?? null;
      const what = parts[3];
      if (!chest) return;
      if (what === 'start') {
        chest.setState('active');
        G.ui.toast('Lanetli Sandık uyandı! 30 saniyede 40 yaratığı yen!', 'boss');
        G.events.emit('camera:shake', { intensity: 0.18, duration: 0.4 });
      } else if (what === 'prog') {
        const n = Number(parts[4]);
        if (n > 0 && n % 10 === 0) G.ui.toast(`Lanetli Sandık: ${n}/${CURSE.need}`, 'info');
      } else if (what === 'win' || what === 'lose') {
        this.applyCurseResult(chest, what === 'win');
      }
    }
  }

  // ------------------------------------------------------------------------------------------------
  // per-frame (World system)
  // ------------------------------------------------------------------------------------------------

  update(dt: number): void {
    if (this.disposed || !G.net.isAuthority) return;
    const world = this.o.world;
    // legacy outdoor zones only: open-world maps roll goblins and boss respawns in WorldRuntime
    if (this.o.outdoor && !this.o.def.world) {
      this.goblinClock += dt;
      if (this.goblinClock >= GOBLIN.owInterval) {
        this.goblinClock = 0;
        if (this.rng.chance(GOBLIN.owChance)) void this.spawnGoblinAtCamp();
      }
      if (this.bossTimer && world.time >= this.bossTimer.at) {
        const pl = this.bossTimer.placement;
        this.bossTimer = null;
        void this.respawnBoss(pl);
      }
    }
    if (this.curse) this.tickCurse(dt);
  }

  dispose(): void {
    this.disposed = true;
    this.curse = null;
    this.chests = [];
  }

  // ------------------------------------------------------------------------------------------------
  // Hazine Goblini
  // ------------------------------------------------------------------------------------------------

  private announceGoblin(): void {
    G.audio.play('reward_coin');
    G.ui.toast('Hazine Goblini ortaya çıktı! Kaçmadan yakala!', 'loot');
  }

  private async spawnGoblin(x: number, z: number, level: number): Promise<void> {
    if (!getEnemyDef('treasure_goblin')) return;
    const e = await spawnEnemy(this.o.world, 'treasure_goblin', { x, z }, { level, tag: 'treasure' });
    if (!e || this.disposed) return;
    this.announceGoblin();
    try {
      G.net.broadcast('gate', { key: 'ev:goblin', open: true });
    } catch {
      /* offline */
    }
  }

  private async spawnGoblinAtCamp(): Promise<void> {
    const packs = this.o.def.packs;
    if (!packs.length) return;
    const pk = this.rng.pick(packs);
    const x = tileToWorld(pk.center[0]) + this.rng.range(-3, 3), z = tileToWorld(pk.center[1]) + this.rng.range(-3, 3);
    const fix = this.o.built.nav.nearestWalkable(x, z, 8) ?? { x, z };
    const lvl = pk.levelRange ? this.rng.int(pk.levelRange[0], pk.levelRange[1]) : this.o.params.enemyLevel;
    await this.spawnGoblin(fix.x, fix.z, lvl);
  }

  /** A room whose packs are all dead (the party already passed it), else any non-boss room. */
  private async spawnGoblinInClearedRoom(): Promise<void> {
    const { def, world, built } = this.o;
    const alive = (packId: string): boolean => world.enemies.some((e) => e.packId === packId && !e.isDead && !e.removed);
    const candidates = def.rooms.filter((r) => r.boss === undefined && !r.optional);
    const cleared = candidates.filter((r) => {
      const ps = def.packs.filter((p) => p.roomId === r.id);
      return ps.length > 0 && ps.every((p) => !alive(p.id));
    });
    const pool = cleared.length ? cleared : candidates;
    if (!pool.length) return;
    const room = this.rng.pick(pool);
    const x = tileToWorld(room.rect.x + room.rect.w / 2 - 0.5), z = tileToWorld(room.rect.z + room.rect.h / 2 - 0.5);
    const fix = built.nav.nearestWalkable(x, z, 10) ?? { x, z };
    await this.spawnGoblin(fix.x, fix.z, this.o.params.enemyLevel);
  }

  // ------------------------------------------------------------------------------------------------
  // World boss respawn
  // ------------------------------------------------------------------------------------------------

  private async respawnBoss(pl: BossPlacement): Promise<void> {
    const { world, built, params } = this.o;
    if (!getEnemyDef(pl.bossId)) return;
    const x = tileToWorld(pl.pos[0]), z = tileToWorld(pl.pos[1]);
    const fix = built.nav.nearestWalkable(x, z, 8) ?? { x, z };
    const e = await spawnEnemy(world, pl.bossId, fix, { level: params.enemyLevel, facing: ((pl.facing ?? 0) * Math.PI) / 180 });
    if (!e || this.disposed) return;
    G.ui.toast('Çürükkök topraktan yükseliyor!', 'boss');
    try {
      G.net.broadcast('gate', { key: 'ev:boss', open: true });
    } catch {
      /* offline */
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Lanetli Sandık
  // ------------------------------------------------------------------------------------------------

  private campInfoAt(x: number, z: number): CampInfo {
    let best: { d: number; lo: number; hi: number; defs: string[] } | null = null;
    for (const pk of this.o.def.packs) {
      const d = Math.hypot(tileToWorld(pk.center[0]) - x, tileToWorld(pk.center[1]) - z);
      if (best && d >= best.d) continue;
      const defs = [...new Set(pk.members.map((m) => m.enemyId))].filter((id) => getEnemyDef(id)?.rank === 'trash');
      best = { d, lo: pk.levelRange?.[0] ?? 1, hi: pk.levelRange?.[1] ?? 3, defs };
    }
    return { defs: best?.defs.length ? best.defs : ['ow_rat'], lo: best?.lo ?? 1, hi: best?.hi ?? 3 };
  }

  private startCurse(chest: CursedChest): void {
    const info = this.campInfoAt(chest.position.x, chest.position.z);
    this.curse = { index: chest.index, t: 0, waves: 0, spawned: [], counted: new Set(), kills: 0, lastSent: 0, info, chest };
    this.handleMessage(`ev:curse:${chest.index}:start`);
    try {
      G.net.broadcast('gate', { key: `ev:curse:${chest.index}:start`, open: true });
    } catch {
      /* offline */
    }
  }

  private tickCurse(dt: number): void {
    const c = this.curse;
    if (!c) return;
    c.t += dt;
    while (c.waves < CURSE.waves && c.t >= c.waves * CURSE.interval) {
      c.waves++;
      void this.spawnWave(c);
    }
    let kills = 0;
    for (const e of c.spawned) {
      if (e.isDead && !c.counted.has(e)) c.counted.add(e);
    }
    kills = c.counted.size;
    c.kills = kills;
    if (kills !== c.lastSent && kills % 10 === 0 && kills > 0) {
      c.lastSent = kills;
      try {
        G.net.broadcast('gate', { key: `ev:curse:${c.index}:prog:${kills}`, open: true });
      } catch {
        /* offline */
      }
      this.handleMessage(`ev:curse:${c.index}:prog:${kills}`);
    }
    if (kills >= CURSE.need) this.finishCurse(true);
    else if (c.t >= CURSE.window) this.finishCurse(false);
  }

  private finishCurse(win: boolean): void {
    const c = this.curse;
    if (!c) return;
    this.curse = null;
    const key = `ev:curse:${c.index}:${win ? 'win' : 'lose'}`;
    try {
      G.net.broadcast('gate', { key, open: true });
    } catch {
      /* offline */
    }
    this.applyCurseResult(c.chest, win);
  }

  private async spawnWave(c: CurseRun): Promise<void> {
    const { world, built } = this.o;
    const cx = c.chest.position.x, cz = c.chest.position.z;
    const base = this.rng.next() * Math.PI * 2;
    const jobs: Promise<void>[] = [];
    for (let i = 0; i < CURSE.mobsPerWave; i++) {
      const a = base + (i / CURSE.mobsPerWave) * Math.PI * 2 + this.rng.range(-0.25, 0.25);
      let x = cx + Math.cos(a) * CURSE.ring, z = cz + Math.sin(a) * CURSE.ring;
      const fix = built.nav.nearestWalkable(x, z, 6);
      if (fix) {
        x = fix.x;
        z = fix.z;
      }
      const defId = this.rng.pick(c.info.defs);
      const level = this.rng.int(c.info.lo, c.info.hi);
      jobs.push(
        spawnEnemy(world, defId, { x, z }, { level, aggro: true, tag: 'curse' }).then(
          (e) => {
            if (e) c.spawned.push(e);
          },
          () => undefined,
        ),
      );
    }
    await Promise.all(jobs);
    if (c.waves === 1) G.events.emit('camera:shake', { intensity: 0.12, duration: 0.3 });
  }

  /** Every peer: cooldown on the chest + the local player's personal reward at the chest. */
  private applyCurseResult(chest: CursedChest, win: boolean): void {
    chest.setState('cooldown', CURSE.cooldown);
    const info = this.campInfoAt(chest.position.x, chest.position.z);
    const lvl = info.hi;
    const pos = chest.position;
    try {
      G.audio.play(win ? 'vault_open' : 'chest_locked');
      if (win) {
        G.ui.toast('Lanet kırıldı! Ara patron ödülü seni bekliyor.', 'success');
        G.vfx.spawn('chest_open', pos, { scale: 1.6 });
        G.vfx.spawn('gold_sparkle', pos, { scale: 1.4 });
        const classId = G.character?.classId;
        G.loot.dropItem(G.loot.rollItem({ itemLevel: lvl + 2, rank: 'miniboss', minRarity: 'rare', classId }), pos, { delay: 0.2 });
        G.loot.dropItem(G.loot.rollItem({ itemLevel: lvl + 1, rank: 'elite', minRarity: 'uncommon', classId }), pos, { delay: 0.45 });
        G.loot.dropGold(Math.round((8 + lvl * 4) * 14), pos);
        G.loot.dropGlobe(pos);
      } else {
        G.ui.toast('Lanet seni yendi... Yine de küçük bir ödül düştü.', 'warning');
        G.loot.dropItem(G.loot.rollItem({ itemLevel: lvl, rank: 'elite', minRarity: 'uncommon', classId: G.character?.classId }), pos, { delay: 0.2 });
        G.loot.dropGold(Math.round((8 + lvl * 4) * 4), pos);
      }
    } catch (e) {
      console.warn('[zone] curse reward failed', e);
    }
  }
}
