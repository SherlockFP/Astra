import { G } from '../../game/G';
import { QUESTS } from '../../data/world/quests';
import type { QuestDef } from '../../types/quests';
import { QuestProp, questPropKind, type QuestPropKind } from '../../entities/interactables/QuestProp';
import { EscortNpc } from '../../entities/interactables/EscortNpc';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import { RNG, hashString } from '../../core/utils';
import { toast } from '../../systems/notify';
import { EscortRun, type EscortDeps, type Pt2 } from './QuestEscortRun';
import { distM, type Pt, type WorldCtx } from './util';

/**
 * Quest props and escorts of the open world (WoW-style objectives, data/world/quests_variety.ts):
 * - interact props (qo_sack / qo_crystal / qo_banner) and use altars (qt_*) per quest region, at deterministic spots
 *   (questPropSpots): max(count) + 1 interact props per (region, target), one altar per (region, target);
 * - escort quests: an escort NPC at the start of a short path (escortPath); F starts the walk (QuestEscortRun), each trigger
 *   waypoint spawns an ambush of 3 enemies (host only: other peers have no enemy spawns, so they walk without ambushers).
 * Every peer places the same props; progress and the empty timers are per character. OWNER: scenes module.
 */

export interface PropSpot {
  key: string;
  region: string;
  target: string;
  kind: QuestPropKind;
  item?: string;
  x: number;
  z: number;
}

/** The part of WorldCtx the placement needs (a test can pass a stub). */
export type SpotCtx = Pick<WorldCtx, 'regionRect' | 'regionAtTile' | 'snapTile' | 'seed'>;

/** Walkable point of a random tile of the region, deterministic for (seed, key). Null when no tile of the region was found. */
function pickPoint(ctx: SpotCtx, region: string, key: string): Pt | null {
  const rect = ctx.regionRect(region);
  if (!rect || rect.w < 1 || rect.h < 1) return null;
  const rng = new RNG(hashString(`${ctx.seed}:${key}`));
  for (let i = 0; i < 24; i++) {
    const tx = rect.x + Math.floor(rng.next() * rect.w);
    const tz = rect.z + Math.floor(rng.next() * rect.h);
    if (ctx.regionAtTile(tx, tz)?.id === region) return ctx.snapTile(tx, tz, 8);
  }
  return null;
}

/** Spots of the interact and use objectives of `defs`: interact = max(count) + 1 per (region, target), use = one altar. */
export function questPropSpots(ctx: SpotCtx, defs: readonly QuestDef[]): PropSpot[] {
  const need = new Map<string, { region: string; target: string; kind: QuestPropKind; item?: string; n: number }>();
  for (const d of defs) {
    if (!d.region) continue;
    for (const o of d.objectives) {
      if ((o.kind !== 'interact' && o.kind !== 'use') || !o.target) continue;
      const kind = questPropKind(o.target);
      if (!kind) continue;
      const n = o.kind === 'interact' ? o.count + 1 : 1;
      const key = `${d.region}|${o.target}`;
      const cur = need.get(key);
      if (!cur) need.set(key, { region: d.region, target: o.target, kind, item: o.item, n });
      else {
        cur.n = Math.max(cur.n, n);
        cur.item ??= o.item;
      }
    }
  }
  const out: PropSpot[] = [];
  for (const e of need.values()) {
    for (let i = 0; i < e.n; i++) {
      const key = `${e.region}:${e.target}:${i}`;
      const pt = pickPoint(ctx, e.region, `qprop:${key}`);
      if (pt) out.push({ key, region: e.region, target: e.target, kind: e.kind, item: e.item, x: pt.x, z: pt.z });
    }
  }
  return out;
}

/** Escort path of a quest: a start point and `segments` further waypoints at least `minGap` m apart, all in the region. */
export function escortPath(ctx: SpotCtx, questId: string, region: string, segments = 3, minGap = 18): Pt2[] | null {
  const start = pickPoint(ctx, region, `escort:${questId}:0`);
  if (!start) return null;
  const path: Pt2[] = [{ x: start.x, z: start.z }];
  for (let s = 1; s <= segments; s++) {
    const prev = path[s - 1];
    let next: Pt | null = null;
    for (let t = 0; t < 12 && !next; t++) {
      const p = pickPoint(ctx, region, `escort:${questId}:${s}:${t}`);
      if (p && distM(p.x, p.z, prev.x, prev.z) >= minGap) next = p;
    }
    if (!next) break;
    path.push({ x: next.x, z: next.z });
  }
  return path.length >= 2 ? path : null;
}

/** Walking speed (m/s), leash (m) and fail time (s) of an escort. */
const ESCORT_SPEED = 2;
const ESCORT_LEASH_M = 25;
const ESCORT_FAIL_SEC = 8;
/** Ambushers per trigger waypoint. */
const AMBUSH_SIZE = 3;

interface EscortUnit {
  questId: string;
  level: number;
  ambushDef: string;
  npc: EscortNpc;
  run: EscortRun;
  enemies: Enemy[];
  /** Ambushers still spawning. */
  pending: number;
  rng: RNG;
}

export class WorldQuestProps {
  private readonly escorts: EscortUnit[] = [];

  constructor(private readonly ctx: WorldCtx) {}

  /** Spawn the quest props and escort NPCs of this map (local entities; resolves when loaded). Never throws. */
  async place(): Promise<number> {
    const { ctx } = this;
    const world = ctx.world;
    const jobs: Promise<void>[] = [];
    let count = 0;
    const defs = QUESTS.filter((d) => !!d.region && !!ctx.regionById(d.region!));

    for (const s of questPropSpots(ctx, defs)) {
      const prop = new QuestProp(world.allocLocalId(), { key: s.key, target: s.target, kind: s.kind, item: s.item });
      prop.position.set(s.x, world.groundY(s.x, s.z), s.z);
      prop.object3d.rotation.y = new RNG(`${s.key}:yaw`).next() * Math.PI * 2;
      count++;
      jobs.push(
        prop.load().then(
          () => {
            world.add(prop);
          },
          (err) => console.warn(`[world] quest prop ${s.key} failed to load`, err),
        ),
      );
    }

    for (const d of defs) {
      if (!d.objectives.some((o) => o.kind === 'escort')) continue;
      const path = escortPath(ctx, d.id, d.region!);
      if (!path) continue;
      const killTarget = d.objectives.find((o) => o.kind === 'kill' && o.target)?.target;
      const unit: EscortUnit = {
        questId: d.id,
        level: Math.max(1, d.level),
        ambushDef: killTarget ?? 'ow_bandit',
        npc: null as unknown as EscortNpc,
        run: null as unknown as EscortRun,
        enemies: [],
        pending: 0,
        rng: new RNG(`${d.id}:ambush`),
      };
      const deps: EscortDeps = {
        playerDist: (x, z) => {
          const p = world.localPlayer;
          return p ? distM(p.position.x, p.position.z, x, z) : Infinity;
        },
        ambush: (x, z) => this.ambush(unit, x, z),
        ambushAlive: () => unit.pending + unit.enemies.filter((e) => !e.isDead && !e.removed).length,
        tick: (seconds, alive) => G.quests?.tickEscort(seconds, alive),
        done: () => !!G.quests?.progressRows(d.id).some((r) => r.kind === 'escort' && r.done),
      };
      unit.run = new EscortRun(
        { path, triggers: path.map((_, i) => i).slice(1), speed: ESCORT_SPEED, leash: ESCORT_LEASH_M, failSec: ESCORT_FAIL_SEC },
        deps,
      );
      unit.npc = new EscortNpc(world.allocLocalId(), 'Yaralı Gözcü', () => this.startEscort(unit), () => this.promptOf(unit));
      unit.npc.position.set(path[0].x, world.groundY(path[0].x, path[0].z), path[0].z);
      this.escorts.push(unit);
      count++;
      jobs.push(
        unit.npc.load().then(
          () => {
            world.add(unit.npc);
          },
          (err) => console.warn(`[world] escort NPC of ${d.id} failed to load`, err),
        ),
      );
    }

    await Promise.all(jobs);
    return count;
  }

  /** Per frame: walks the escorts and keeps their NPCs on the ground. */
  update(dt: number): void {
    for (const u of this.escorts) {
      u.run.update(dt);
      const { x, z } = u.run.pos;
      u.npc.position.set(x, this.ctx.world.groundY(x, z), z);
    }
  }

  private startEscort(u: EscortUnit): void {
    if (G.quests?.state(u.questId) !== 'active') {
      toast('Bu eskortun görevi şu an aktif değil.', 'info');
      return;
    }
    if (u.run.start()) toast('Gözcüyü yanında tut! Pusu noktalarında saldırı gelecek.', 'info');
  }

  private promptOf(u: EscortUnit): string {
    if (u.run.state === 'idle') return 'eskortu başlat [F]';
    if (u.run.state === 'done') return 'görev tamam';
    return 'yolda';
  }

  /** Ambush of one trigger waypoint: AMBUSH_SIZE enemies around it. Peers that cannot spawn enemies get null and no ambushers. */
  private ambush(u: EscortUnit, x: number, z: number): void {
    for (let i = 0; i < AMBUSH_SIZE; i++) {
      const a = (i / AMBUSH_SIZE) * Math.PI * 2 + u.rng.next();
      const p = this.ctx.snapWorld(x + Math.cos(a) * 6, z + Math.sin(a) * 6, 6);
      u.pending++;
      spawnEnemy(this.ctx.world, u.ambushDef, p, { level: u.level, aggro: true }).then(
        (e) => {
          u.pending--;
          if (e) u.enemies.push(e);
        },
        (err) => {
          u.pending--;
          console.warn(`[world] ambush ${u.ambushDef} failed`, err);
        },
      );
    }
  }
}
