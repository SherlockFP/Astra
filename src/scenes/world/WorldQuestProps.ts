import { G } from '../../game/G';
import { QUESTS } from '../../data/world/quests';
import type { QuestDef } from '../../types/quests';
import { QuestProp, questPropKind, type QuestPropKind } from '../../entities/interactables/QuestProp';
import { EscortNpc } from '../../entities/interactables/EscortNpc';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import { RNG, hashString } from '../../core/utils';
import { toast } from '../../systems/notify';
import { EscortRun, ESCORT_FAIL_DIST_M, ESCORT_HINT_SEC, type EscortDeps, type EscortFailReason, type Pt2 } from './QuestEscortRun';
import { ESCORT_ROUTES } from '../../data/world/escort_routes';
import { QUEST_PROP_SPOTS } from '../../data/world/quest_prop_spots';
import { distM, type Pt, type WorldCtx } from './util';

/**
 * Quest props and escorts of the open world (WoW-style objectives, data/world/quests_variety.ts):
 * - interact props (qo_sack / qo_crystal / qo_banner) and use altars (qt_*) at deterministic spots (questPropSpots): hand-placed
 *   near the giver for the Sisli level 1-5 quests (data/world/quest_prop_spots.ts); the others max(count) + 1 per (region, target),
 *   one altar per (region, target) on random tiles of the quest region;
 * - escort quests: an escort NPC at the start of its route (data/world/escort_routes.ts, inside the quest's level ring); F starts
 *   the walk (QuestEscortRun), each trigger waypoint spawns a wave of 1-2 quest-level ambushers (host only: other peers have no
 *   enemy spawns, so they walk without ambushers). The ambushers hit the escort while they stand next to it.
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
/** The part of WorldCtx an escort route needs (snapping its waypoints to walkable ground, routing each segment on the nav grid). */
export type EscortCtx = Pick<WorldCtx, 'snapWorld' | 'navPath'>;

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

/**
 * Spots of the interact and use objectives of `defs`. A quest objective with hand-placed spots (data/world/quest_prop_spots.ts) gets
 * its own tiles, one per spot. The others share one random spot set per (region, target): interact = max(count) + 1, use = one altar.
 */
export function questPropSpots(ctx: SpotCtx, defs: readonly QuestDef[]): PropSpot[] {
  const need = new Map<string, { region: string; target: string; kind: QuestPropKind; item?: string; n: number }>();
  const out: PropSpot[] = [];
  for (const d of defs) {
    if (!d.region) continue;
    for (const o of d.objectives) {
      if ((o.kind !== 'interact' && o.kind !== 'use') || !o.target) continue;
      const kind = questPropKind(o.target);
      if (!kind) continue;
      const n = o.kind === 'interact' ? o.count + 1 : 1;
      const placed = QUEST_PROP_SPOTS[d.id]?.[o.target];
      if (placed) {
        for (let i = 0; i < n && i < placed.length; i++) {
          const pt = ctx.snapTile(placed[i][0], placed[i][1], 8);
          out.push({ key: `${d.id}:${o.target}:${i}`, region: d.region, target: o.target, kind, item: o.item, x: pt.x, z: pt.z });
        }
        continue;
      }
      const key = `${d.region}|${o.target}`;
      const cur = need.get(key);
      if (!cur) need.set(key, { region: d.region, target: o.target, kind, item: o.item, n });
      else {
        cur.n = Math.max(cur.n, n);
        cur.item ??= o.item;
      }
    }
  }
  for (const e of need.values()) {
    for (let i = 0; i < e.n; i++) {
      const key = `${e.region}:${e.target}:${i}`;
      const pt = pickPoint(ctx, e.region, `qprop:${key}`);
      if (pt) out.push({ key, region: e.region, target: e.target, kind: e.kind, item: e.item, x: pt.x, z: pt.z });
    }
  }
  return out;
}

/** A built escort route: the nav polyline (path[0] is the start) and the indices of its trigger waypoints in that polyline. */
export interface EscortRoute {
  path: Pt2[];
  triggers: number[];
}

/**
 * Route of an escort quest (data/world/escort_routes.ts): every waypoint snapped to walkable ground near its spot (6 m), then each
 * segment routed on the nav grid (ctx.navPath), so the escort walks around fences and rocks like the player can. Fails with the first
 * segment that has no nav path (or a route missing from the data): the escort then gets no NPC, and the content check reports it.
 */
export function escortRoute(ctx: EscortCtx, questId: string): { route: EscortRoute } | { error: string } {
  const def = ESCORT_ROUTES[questId];
  if (!def) return { error: 'no route in data/world/escort_routes.ts' };
  const wps = def.route.map(([x, z]) => {
    const p = ctx.snapWorld(x, z, 6);
    return { x: p.x, z: p.z };
  });
  if (wps.length < 2) return { error: 'route has fewer than 2 waypoints' };
  const path: Pt2[] = [wps[0]];
  const at: number[] = [0]; // polyline index of each waypoint
  for (let i = 1; i < wps.length; i++) {
    const seg = ctx.navPath(wps[i - 1], wps[i]);
    if (!seg || seg.length === 0) return { error: `segment ${i - 1}-${i} (${Math.round(wps[i - 1].x)},${Math.round(wps[i - 1].z)} to ${Math.round(wps[i].x)},${Math.round(wps[i].z)}) has no nav path` };
    for (const p of seg) path.push({ x: p.x, z: p.z });
    at[i] = path.length - 1;
  }
  const triggers = def.triggers.filter((i) => i > 0 && i < wps.length).map((i) => at[i]);
  return { route: { path, triggers } };
}

/** The nav polyline of an escort route (escortRoute), or null when the route is missing or a segment has no nav path. */
export function escortPath(ctx: EscortCtx, questId: string): Pt2[] | null {
  const r = escortRoute(ctx, questId);
  return 'route' in r ? r.route.path : null;
}

/** Walking speed (m/s), leash (m) and fail time (s) of an escort: WoW rules, see QuestEscortRun.ts. */
const ESCORT_SPEED = 2;
const ESCORT_LEASH_M = 25;
const ESCORT_FAIL_SEC = 20;

interface EscortUnit {
  questId: string;
  level: number;
  ambushDef: string;
  /** Ambushers per wave (1-2). */
  waveSize: number;
  npc: EscortNpc;
  run: EscortRun;
  enemies: Enemy[];
  /** Ambushers still spawning. */
  pending: number;
  rng: RNG;
  /** The keep-up toast is out for the current wait (reset when the player is back in leash). */
  hintShown: boolean;
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
      const route = ESCORT_ROUTES[d.id];
      const built = escortRoute(ctx, d.id);
      if (!route || 'error' in built) {
        console.error(`[world] escort quest ${d.id}: ${'error' in built ? built.error : 'no route'} (data/world/escort_routes.ts)`);
        continue;
      }
      const { path, triggers } = built.route;
      const unit: EscortUnit = {
        questId: d.id,
        level: Math.max(1, d.level),
        ambushDef: route.ambushDef,
        waveSize: Math.max(1, Math.min(2, route.waveSize)),
        npc: null as unknown as EscortNpc,
        run: null as unknown as EscortRun,
        enemies: [],
        pending: 0,
        rng: new RNG(`${d.id}:ambush`),
        hintShown: false,
      };
      const deps: EscortDeps = {
        playerDist: (x, z) => {
          const p = world.localPlayer;
          return p ? distM(p.position.x, p.position.z, x, z) : Infinity;
        },
        ambush: (x, z) => this.ambush(unit, x, z),
        ambushAlive: () => unit.pending + unit.enemies.filter((e) => !e.isDead && !e.removed).length,
        attackersNear: (x, z, reach) => this.attackersNear(unit, x, z, reach),
        tick: (seconds, alive) => G.quests?.tickEscort(seconds, alive),
        done: () => !!G.quests?.progressRows(d.id).some((r) => r.kind === 'escort' && r.done),
        failed: (reason) => this.escortFailed(reason),
      };
      unit.run = new EscortRun(
        {
          path,
          triggers,
          speed: ESCORT_SPEED,
          leash: ESCORT_LEASH_M,
          failDist: ESCORT_FAIL_DIST_M,
          failSec: ESCORT_FAIL_SEC,
          hintSec: ESCORT_HINT_SEC,
          hp: route.hp,
          attackerDps: route.attackerDps,
          regen: route.regen,
        },
        deps,
      );
      unit.npc = new EscortNpc(
        world.allocLocalId(),
        'Yaralı Gözcü',
        () => this.startEscort(unit),
        () => this.promptOf(unit),
        () => G.quests?.state(d.id) === 'active',
      );
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
      if (u.run.hint) {
        if (!u.hintShown) toast('Gözcü bekliyor! Yetiş, yoksa görev başarısız olur.', 'info');
        u.hintShown = true;
      } else u.hintShown = false;
      const { x, z } = u.run.pos;
      u.npc.position.set(x, this.ctx.world.groundY(x, z), z);
    }
  }

  /** The escort run failed (the player stayed out too long, or the escort fell): back at its start, F starts it again there. */
  private escortFailed(reason: EscortFailReason): void {
    toast(
      reason === 'far' ? 'Gözcü yanından ayrıldın: görev başarısız. Gözcüyü başlangıçta yeniden başlat.' : 'Gözcü düştü: görev başarısız. Gözcüyü başlangıçta yeniden başlat.',
      'info',
    );
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
    if (u.run.hint) return `gözcü bekliyor, yetiş · can %${Math.round(u.run.hpPct * 100)}`;
    return `yolda · can %${Math.round(u.run.hpPct * 100)}`;
  }

  /** Ambushers alive within `reach` m of (x, z): they hit the escort while they stand next to it. */
  private attackersNear(u: EscortUnit, x: number, z: number, reach: number): number {
    let n = 0;
    for (const e of u.enemies) if (!e.isDead && !e.removed && distM(e.position.x, e.position.z, x, z) <= reach) n++;
    return n;
  }

  /** Ambush of one trigger waypoint: `waveSize` enemies around it. Peers that cannot spawn enemies get null and no ambushers. */
  private ambush(u: EscortUnit, x: number, z: number): void {
    for (let i = 0; i < u.waveSize; i++) {
      const a = (i / u.waveSize) * Math.PI * 2 + u.rng.next();
      const p = this.ctx.snapWorld(x + Math.cos(a) * 6, z + Math.sin(a) * 6, 6);
      u.pending++;
      // open-world trash: the low-level curve of the quest level (a same-level solo fight, as the camps), not the dungeon HP
      spawnEnemy(this.ctx.world, u.ambushDef, p, { level: u.level, aggro: true, openWorld: true }).then(
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
