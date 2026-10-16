import { G } from '../../game/G';
import { Waypoint } from '../../entities/interactables';
import { getDungeon } from '../../data/dungeons';
import type { WaypointDef } from '../../types/dungeons';
import { worldToTile, type Pt, type WorldCtx } from './util';
import { openWorldParams } from './params';

/**
 * Işınlanma Taşları (GDD_OPENWORLD §5.1, §2.6): the fast-travel stones of the open-world zones. Walking within 8 m of a stone
 * discovers it (flag `world.wp.<id>`, +2% exploration XP, toast) and makes it the respawn point (flag `world.respawn`).
 * Within a zone, travel goes through the Işınlayıcı (`travel()`: the NPC, or F on an active stone, which opens the same panel).
 * Between zones (WoW flight master style, `startFlight()`): a short cast to a discovered stone of another open-world zone or to
 * Kuzgunkale (the town), paid in gold by distance (zone hops). Kızıl Sınır (PvP) has no stones and is not on the flight network.
 * Local per peer: every peer discovers and respawns for its own character. OWNER: scenes module.
 */

/** Activation radius of a stone (m). Passing within 8 m is enough: a stone beside the road is found without a detour. */
const STONE_RADIUS = 8;
/** Exploration XP for a first discovery (% of xpToNext). */
const DISCOVERY_XP_PCT = 2;
/** Cooldown between two trips (s). Halved from 30 so a long zone is not a wait between two stones. */
const TRAVEL_COOLDOWN = 15;
/** Tiles per fare hop. */
const HOP_TILES = 60;
/** No travel while the local player was hit or hit something in the last seconds (Actor.combatTimer). */
const POST_COMBAT_LOCK_SEC = 5;

/**
 * Fare of a trip (gold): `round(20 + 3.5 * level) * hops`, hops = min(4, 1 + floor(tiles / 60)). WP-13 (docs/MMO_PILLARS.md) raised it
 * from `round(10 + 1.5 * level)`: the gold-flow sim (dev/combat-sim/economy.mjs) needs fees >= 60 % of faucets at level 30.
 */
export function waypointFare(level: number, distTiles: number): number {
  const hops = Math.min(4, 1 + Math.floor(distTiles / HOP_TILES));
  return Math.round(20 + 3.5 * level) * hops;
}

/** Kuzgunkale, the town: the hub of the flight network (requestScene id 'town'). */
export const HUB_ZONE_ID = 'town';
export const HUB_NAME = 'Kuzgunkale';
/** Open-world zones on the flight network (they have stones). Kızıl Sınır is PvP and has none. */
export const FLIGHT_ZONE_IDS: readonly string[] = ['sisli_vadi', 'karakir_bozkiri', 'ayaz_daglari'];
/** Gate links of the network: the hub's gates and the Kartal Geçidi pass (Karakır r12 to Ayaz Dağları). */
const ZONE_LINKS: readonly (readonly [string, string])[] = [
  [HUB_ZONE_ID, 'sisli_vadi'],
  [HUB_ZONE_ID, 'karakir_bozkiri'],
  ['karakir_bozkiri', 'ayaz_daglari'],
];
/** Cast of a flight (s). A move, damage, combat or death cancels it. */
export const FLIGHT_CAST_SEC = 3;
/** A flight may not move the player further than this from where the cast started (m). */
const FLIGHT_MOVE_TOL = 1.5;

/** Hops between two zones over the gate links (BFS). 0 for the same zone, Infinity when they are not linked. */
export function zoneHops(from: string, to: string): number {
  if (from === to) return 0;
  const dist = new Map<string, number>([[from, 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [a, b] of ZONE_LINKS) {
      const next = a === cur ? b : b === cur ? a : null;
      if (!next || dist.has(next)) continue;
      dist.set(next, (dist.get(cur) ?? 0) + 1);
      queue.push(next);
    }
  }
  return dist.get(to) ?? Infinity;
}

/** Flight fare (gold): `round(6 + 1.5 * level)` per hop, at least one hop. Small on purpose: a flight replaces a long walk. */
export function flightFare(level: number, hops: number): number {
  return Math.round(6 + 1.5 * level) * Math.max(1, hops);
}

/** One flight destination in the Işınlayıcı panel. `stoneId` null = the hub (Kuzgunkale). */
export interface FlightDest {
  zone: string;
  zoneName: string;
  stoneId: string | null;
  name: string;
  discovered: boolean;
  cost: number;
}

interface Flight {
  dest: FlightDest;
  cost: number;
  x: number;
  z: number;
  hp: number;
  t: number;
}

export class WaypointNetwork {
  private readonly stones = new Map<string, Waypoint>();
  private lastTravelAt = -Infinity;
  private flight: Flight | null = null;

  constructor(private readonly ctx: WorldCtx, private readonly teleport: (x: number, z: number, yaw: number) => void) {}

  /** Discovered stones of this character (flags). */
  known(id: string): boolean {
    return G.character?.save.flags[`world.wp.${id}`] === true;
  }

  /** Spawn every stone (local entities; resolves when all are loaded). */
  async place(): Promise<number> {
    const { ctx } = this;
    const jobs: Promise<void>[] = [];
    for (const w of ctx.ext.waypoints) {
      const known = this.known(w.id);
      const pt = ctx.snapTile(w.pos[0], w.pos[1], 8);
      // always starts asleep: every approach re-sets this character's respawn point, the toast only once per character
      const stone = new Waypoint(ctx.world.allocLocalId(), {
        active: false,
        autoRadius: STONE_RADIUS,
        toast: known ? null : `Işınlanma Taşı keşfedildi: ${w.name}`,
        onActivate: () => this.discover(w),
        // F on an active stone opens the Işınlayıcı panel (same panel as the NPC): travel within and between zones
        onUse: () => G.events.emit('ui:openPanel', { panel: 'waypoints', data: {} }),
      });
      stone.position.set(pt.x, ctx.world.groundY(pt.x, pt.z), pt.z);
      this.stones.set(w.id, stone);
      jobs.push(
        stone.load().then(
          () => {
            ctx.world.add(stone);
          },
          (err) => console.warn(`[waypoints] ${w.id} failed to load`, err),
        ),
      );
    }
    await Promise.all(jobs);
    return this.stones.size;
  }

  private discover(w: WaypointDef): void {
    const ch = G.character;
    if (!ch) return;
    const key = `world.wp.${w.id}`;
    const first = ch.save.flags[key] !== true;
    ch.save.flags[key] = true;
    ch.save.flags['world.respawn'] = w.id;
    ch.persist();
    if (first) {
      G.events.emit('waypoint:discovered', { id: w.id });
      try {
        G.progression.addExplorationXp(DISCOVERY_XP_PCT);
      } catch {
        /* progression not ready */
      }
    }
  }

  /** The respawn point of the last stone this character activated (world metres), or null. */
  respawnPoint(): Pt | null {
    const id = G.character?.save.flags['world.respawn'];
    if (typeof id !== 'string') return null;
    const w = this.ctx.ext.waypoints.find((x) => x.id === id);
    if (!w) return null;
    return this.ctx.snapTile(w.pos[0], w.pos[1], 8);
  }

  /** Destination of a stone for the travel panel: world point and the fare from `fromPos` (metres) at the local level. */
  quote(toId: string, fromPos: Pt): { id: string; name: string; cost: number } | null {
    const w = this.ctx.ext.waypoints.find((x) => x.id === toId);
    if (!w || !G.character) return null;
    const dist = Math.hypot(w.pos[0] - worldToTile(fromPos.x), w.pos[1] - worldToTile(fromPos.z));
    return { id: w.id, name: w.name, cost: waypointFare(G.character.level, dist) };
  }

  /**
   * Trip to a discovered stone: combat lock, cooldown, gold and the destination check, then the teleport. Returns the Turkish
   * message (empty when the trip started).
   */
  travel(toId: string, fromPos: Pt, now: number): string {
    const ch = G.character;
    if (!ch) return 'Karakter yok.';
    if (this.flight) return 'Bölgeler arası ışınlanma sürüyor.';
    if (!this.known(toId)) return 'Bu taş henüz keşfedilmedi.';
    // no trips right after a fight: the local player must be out of combat for POST_COMBAT_LOCK_SEC (the caller toasts the text)
    const me = G.player;
    if (me && me.combatTimer < POST_COMBAT_LOCK_SEC) return 'Savaşta ışınlanamazsın';
    if (now - this.lastTravelAt < TRAVEL_COOLDOWN) return `Işınlanma için ${Math.ceil(TRAVEL_COOLDOWN - (now - this.lastTravelAt))} sn bekle.`;
    const q = this.quote(toId, fromPos);
    if (!q) return 'Hedef bulunamadı.';
    if (!ch.spendGold(q.cost)) return `Yetersiz altın (${q.cost} altın gerekli).`;
    const w = this.ctx.ext.waypoints.find((x) => x.id === toId);
    if (!w) return 'Hedef bulunamadı.';
    const pt = this.ctx.snapTile(w.pos[0], w.pos[1], 8);
    this.lastTravelAt = now;
    this.teleport(pt.x, pt.z, this.ctx.built.startYaw);
    G.events.emit('player:gold', { gold: ch.save.gold, delta: -q.cost });
    return '';
  }

  /**
   * Flight destinations from `fromZone` (the zone the player is in): Kuzgunkale first, then the stones of the other flight zones in
   * data order. Undiscovered stones are listed too (`discovered` false: the panel greys them out).
   */
  flightDests(fromZone: string, level: number): FlightDest[] {
    const out: FlightDest[] = [];
    const hubHops = zoneHops(fromZone, HUB_ZONE_ID);
    if (hubHops > 0 && Number.isFinite(hubHops)) {
      out.push({ zone: HUB_ZONE_ID, zoneName: HUB_NAME, stoneId: null, name: HUB_NAME, discovered: true, cost: flightFare(level, hubHops) });
    }
    for (const zone of FLIGHT_ZONE_IDS) {
      const hops = zoneHops(fromZone, zone);
      if (hops === 0 || !Number.isFinite(hops)) continue;
      const def = getDungeon(zone);
      const zoneName = def?.name ?? zone;
      const cost = flightFare(level, hops);
      for (const w of def?.world?.waypoints ?? []) {
        out.push({ zone, zoneName, stoneId: w.id, name: w.name, discovered: this.known(w.id), cost });
      }
    }
    return out;
  }

  /** A flight is being cast (the panel shows it, WorldRuntime ticks it). */
  get flying(): boolean {
    return this.flight !== null;
  }

  /**
   * Starts a flight: the checks (discovered stone, alive, out of combat, cooldown, gold), then the cast. Returns the Turkish message
   * (empty when the cast started). The gold is paid when the cast completes.
   */
  startFlight(dest: FlightDest, fromPos: Pt, now: number): string {
    const ch = G.character;
    if (!ch) return 'Karakter yok.';
    if (this.flight) return 'Zaten ışınlanıyorsun.';
    if (dest.stoneId !== null && !this.known(dest.stoneId)) return 'Bu taş henüz keşfedilmedi.';
    const me = G.player;
    if (!me || me.isDead) return 'Şu anda ışınlanamazsın.';
    if (me.inCombat || me.combatTimer < POST_COMBAT_LOCK_SEC) return 'Savaşta ışınlanamazsın';
    if (now - this.lastTravelAt < TRAVEL_COOLDOWN) return `Işınlanma için ${Math.ceil(TRAVEL_COOLDOWN - (now - this.lastTravelAt))} sn bekle.`;
    if (ch.save.gold < dest.cost) return `Yetersiz altın (${dest.cost} altın gerekli).`;
    this.lastTravelAt = now;
    this.flight = { dest, cost: dest.cost, x: fromPos.x, z: fromPos.z, hp: me.hp, t: 0 };
    return '';
  }

  /** Per-frame: runs the flight cast. Any cancel condition ends it; when the cast completes the gold is paid and the scene changes. */
  tick(dt: number): void {
    const f = this.flight;
    if (!f) return;
    const ch = G.character;
    const me = G.player;
    if (!ch || !me || me.isDead) return this.cancelFlight('Öldüğün için ışınlanma iptal oldu.');
    if (me.hp < f.hp - 0.5) return this.cancelFlight('Hasar aldığın için ışınlanma iptal oldu.');
    if (me.inCombat) return this.cancelFlight('Savaşa girdiğin için ışınlanma iptal oldu.');
    if (Math.hypot(me.position.x - f.x, me.position.z - f.z) > FLIGHT_MOVE_TOL) return this.cancelFlight('Hareket ettiğin için ışınlanma iptal oldu.');
    f.t += dt;
    if (f.t < FLIGHT_CAST_SEC) return;
    this.flight = null;
    if (!ch.spendGold(f.cost)) return this.cancelFlight(`Yetersiz altın (${f.cost} altın gerekli).`);
    ch.persist();
    G.events.emit('player:gold', { gold: ch.save.gold, delta: -f.cost });
    const d = f.dest;
    // leaving an open-world zone: the hub's gate of that zone ('south' = the gate the zone was entered by, TownScene)
    if (d.stoneId === null) this.route('town', { spawnAt: 'south' });
    else this.route('dungeon', openWorldParams(d.zone, { type: 'waypoint', id: d.stoneId }));
  }

  private cancelFlight(text: string): void {
    this.flight = null;
    G.events.emit('ui:toast', { text, kind: 'warning' });
  }

  /** The scene change of a flight. Guests move alone and keep their group (the rule of the game menu's leave). */
  private route(scene: 'town' | 'dungeon', params: unknown): void {
    if (G.net.isPartyGuest) void G.scenes.go(scene, params);
    else G.net.requestScene(scene, params);
  }

  dispose(): void {
    this.flight = null;
    this.stones.clear();
  }
}
