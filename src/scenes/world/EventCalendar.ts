import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import { getEnemyDef } from '../../data/enemies';
import { getMaterial } from '../../data/materials';
import { RNG, hashString } from '../../core/utils';
import { TILE_SIZE } from '../../types/dungeons';
import type { EntityId } from '../../types/common';
import type { EventScope } from '../../core/EventBus';
import { toast } from '../../systems/notify';
import { eventPetItem } from '../../systems/Pets';
import type { BossSchedule } from './BossSchedule';
import type { MetinDirector } from './MetinDirector';
import { distM, tileToWorld, type Pt, type WorldCtx } from './util';

/**
 * Open-world event calendar (MMO pillars WP-04). The schedule is a pure function of the wall clock: a 30-minute slot k
 * (UTC epoch) runs `EVENT_IDS[k % 4]`, so every client derives the same events, sites and phases with no network.
 * Announcements are local (banner, toast, chat line, `world:event`). The spawning is host-only, like the other directors:
 * the metin storm (MetinDirector.setStorm), the world boss (BossSchedule.expedite), the village raid waves and the goblin
 * caravan (spawnEnemy with tags `ev:*`). Rewards are local: a participant (damage dealt to an event unit, or presence in the
 * event radius for 60 s) gets gold, exploration XP and a roll from the elite table.
 * OWNER: scenes module.
 */

export const EVENT_SLOT_SEC = 30 * 60;
/** Announcements before the start (s), in ascending time order of the warning. */
export const EVENT_LEADS_SEC = [300, 60] as const;
const SLOT_MS = EVENT_SLOT_SEC * 1000;

export const EVENT_IDS = ['metin_storm', 'world_boss', 'village_raid', 'goblin_caravan'] as const;
export type EventId = (typeof EVENT_IDS)[number];
export type EventPhase = 'soon' | 'start' | 'end';

export interface EventDef {
  name: string;
  durSec: number;
  /** Participation radius (m) around the event points. */
  radius: number;
  xpPct: number;
  goldPerLevel: number;
  items: number;
}

export const EVENT_DEFS: Record<EventId, EventDef> = {
  metin_storm: { name: 'Metin Fırtınası', durSec: 600, radius: 150, xpPct: 12, goldPerLevel: 40, items: 1 },
  world_boss: { name: "Dünya Boss'u", durSec: 900, radius: 60, xpPct: 15, goldPerLevel: 60, items: 1 },
  village_raid: { name: 'Köy Baskını', durSec: 480, radius: 70, xpPct: 20, goldPerLevel: 50, items: 1 },
  goblin_caravan: { name: 'Goblin Kervanı', durSec: 600, radius: 40, xpPct: 10, goldPerLevel: 30, items: 2 },
};

/** One place where an event can happen (world metres). */
export interface EventSite {
  id: string;
  name: string;
  pos: Pt;
  /** Caravan road (world metres), village raid ring radius (m), world boss id. */
  path?: Pt[];
  radius?: number;
  bossId?: string;
}
export type EventSites = Record<EventId, EventSite[]>;

/** One scheduled run of an event. `site` null = the map has no site for it (the event is skipped). */
export interface EventOcc {
  id: EventId;
  slot: number;
  start: number;
  end: number;
  site: EventSite | null;
}

export const slotOf = (ms: number): number => Math.floor(ms / SLOT_MS);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** The occurrence of slot k: the rotation id and a hashed site (the same on every client). */
export function occurrenceAt(slot: number, sites: EventSites): EventOcc {
  const id = EVENT_IDS[mod(slot, EVENT_IDS.length)];
  const list = sites[id];
  const site = list.length ? list[hashString(`${slot}:${id}`) % list.length] : null;
  const start = slot * SLOT_MS;
  return { id, slot, start, end: start + EVENT_DEFS[id].durSec * 1000, site };
}

/** The event running at `nowMs` (start <= now < end), or null. */
export function eventAt(nowMs: number, sites: EventSites): EventOcc | null {
  const occ = occurrenceAt(slotOf(nowMs), sites);
  return occ.site && nowMs >= occ.start && nowMs < occ.end ? occ : null;
}

/** The next `n` occurrences that start after `nowMs`, in time order. */
export function upcomingAfter(nowMs: number, sites: EventSites, n: number): EventOcc[] {
  const s0 = slotOf(nowMs);
  const out: EventOcc[] = [];
  for (let k = 1; out.length < n && k <= n + EVENT_IDS.length; k++) {
    const occ = occurrenceAt(s0 + k, sites);
    if (occ.site) out.push(occ);
  }
  return out.slice(0, n);
}

export interface PhaseMoment {
  /** Moment (epoch ms) the phase is due. */
  when: number;
  phase: EventPhase;
  /** Payload `at`: the scheduled start for soon/start, the end for end. */
  at: number;
  /** Seconds before the start (soon only). */
  lead?: number;
}

export function phaseMomentsOf(occ: EventOcc): PhaseMoment[] {
  const out: PhaseMoment[] = EVENT_LEADS_SEC.map((lead) => ({ when: occ.start - lead * 1000, phase: 'soon' as const, at: occ.start, lead }));
  out.push({ when: occ.start, phase: 'start', at: occ.start });
  out.push({ when: occ.end, phase: 'end', at: occ.end });
  return out;
}

export interface Crossing extends PhaseMoment {
  id: EventId;
  occ: EventOcc & { site: EventSite };
}

/** Every phase due in (fromMs, toMs], ascending. Pure: the runtime calls it with its last tick and the current time. */
export function crossings(fromMs: number, toMs: number, sites: EventSites): Crossing[] {
  const out: Crossing[] = [];
  // a slot's soon phases fall in the slot before it, its start and end inside it: the range covers both
  for (let s = slotOf(fromMs); s <= slotOf(toMs) + 1; s++) {
    const occ = occurrenceAt(s, sites);
    if (!occ.site) continue;
    for (const m of phaseMomentsOf(occ)) {
      if (m.when > fromMs && m.when <= toMs) out.push({ ...m, id: occ.id, occ: { ...occ, site: occ.site } });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}

/** One chat line for an occurrence (local time of day, name, site, minutes until the start). */
export function describeOcc(occ: EventOcc, nowMs: number): string {
  const hhmm = new Date(occ.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const mins = Math.max(0, Math.round((occ.start - nowMs) / 60000));
  return `${hhmm} · ${EVENT_DEFS[occ.id].name} (${occ.site?.name ?? '-'}) · ${mins} dk sonra`;
}

// ================================================================================================
// sites of a world map (built once by the runtime)
// ================================================================================================

/** Event sites of an open-world map: regions with a metin tier (storm), villages (raid), roads (caravan), bosses without a level gate. */
export function buildEventSites(ctx: WorldCtx): EventSites {
  const ext = ctx.ext;
  const nameNear = (p: Pt): string => {
    let best = '';
    let bd = Infinity;
    for (const w of ext.waypoints) {
      const d = distM(p.x, p.z, tileToWorld(w.pos[0]), tileToWorld(w.pos[1]));
      if (d < bd) { bd = d; best = w.name; }
    }
    return best || 'Yol';
  };
  const regionPos = (regionId: string): Pt => {
    const r = ext.regions.find((x) => x.id === regionId);
    const rc = r && ctx.def.rooms.find((room) => room.id === r.roomId)?.rect;
    return rc ? { x: (rc.x + rc.w / 2) * TILE_SIZE, z: (rc.z + rc.h / 2) * TILE_SIZE } : { x: 0, z: 0 };
  };
  const storm: EventSite[] = ext.regions
    .filter((r) => ext.metin.tiers.some((t) => t.regionId === r.id))
    .map((r) => ({ id: r.id, name: r.name, pos: regionPos(r.id) }));
  const raid: EventSite[] = ext.villages.map((v) => ({
    id: v.id,
    name: v.name,
    pos: { x: tileToWorld(v.center[0]), z: tileToWorld(v.center[1]) },
    radius: Math.max(v.bounds[0], v.bounds[1]) + 18,
  }));
  const caravan: EventSite[] = ext.roads
    .filter((r) => r.pts.length >= 2)
    .map((r) => {
      const path = r.pts.map(([x, z]) => ({ x: tileToWorld(x), z: tileToWorld(z) }));
      const a = path[0];
      const b = path[path.length - 1];
      return { id: r.id, name: `${nameNear(a)} - ${nameNear(b)}`, pos: path[Math.floor(path.length / 2)], path };
    });
  const boss: EventSite[] = [];
  for (const sched of ext.bosses) {
    // level-gated bosses stay eligible: BossSchedule.expedite() refuses while the gate is still locked
    const pl = ctx.def.bosses.find((b) => b.bossId === sched.bossId);
    if (!pl) continue;
    const region = ctx.regionAtTile(pl.pos[0], pl.pos[1]);
    boss.push({ id: region?.id ?? sched.bossId, name: region?.name ?? 'Dünya', pos: ctx.snapTile(pl.pos[0], pl.pos[1], 8), bossId: sched.bossId });
  }
  return { metin_storm: storm, world_boss: boss, village_raid: raid, goblin_caravan: caravan };
}

// ================================================================================================
// runtime
// ================================================================================================

/** Event caravan / raid tags on the spawned units (replicated by the spawn channel). */
const TAG = { storm: 'ev:storm', raid: 'ev:raid', caravan: 'ev:caravan' } as const;
/** Village raid waves: seconds after the start, five units each. */
const RAID_WAVES_SEC = [0, 90, 180, 270] as const;
const RAID_WAVE_SIZE = 5;
const CARAVAN_MEMBERS = ['ow_orc_chief', 'ow_warg', 'ow_warg'] as const;
const TICK_SEC = 0.5;
/** Presence needed for the reward when no damage was dealt (s). */
const PRESENCE_REWARD_SEC = 60;
/** A phase older than this when the runtime sees it (tab asleep, scene loading) is dropped silently. */
const STALE_MS = 15000;

export interface EventHooks {
  metin: MetinDirector;
  bosses: BossSchedule;
}

export interface EventPin { id: EventId; x: number; z: number; name: string; active: boolean }

let live: EventCalendar | null = null;

/** Minimap pins of the events that are running or start within 5 minutes (empty outside the open world). */
export function activeEventPins(): EventPin[] {
  return live?.pins() ?? [];
}

/** Chat lines of the next four events (`/etkinlik`); empty outside the open world. */
export function upcomingEventLines(nowMs = Date.now(), n = 4): string[] {
  return live?.upcomingLines(nowMs, n) ?? [];
}

export class EventCalendar {
  private readonly events: EventScope;
  private last: number;
  private active: EventOcc | null = null;
  private dealt = 0;
  private presence = 0;
  private readonly spawned: Enemy[] = [];
  private raidPool: string[] = [];
  private raidLevel: [number, number] = [1, 1];
  private wave = 0;
  private timer = 0;
  private warned = false;

  constructor(
    private readonly ctx: WorldCtx,
    private readonly hooks: EventHooks,
    private readonly sites: EventSites,
    private readonly clock: () => number = () => Date.now(),
  ) {
    this.last = this.clock();
    this.events = G.events.scope();
    this.events.on('damage', (d) => this.onDamage(d.sourceId, d.targetId, d.amount));
    live = this;
  }

  /** Per-frame: the calendar ticks twice a second. Never throws. */
  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = TICK_SEC;
    try {
      this.tick(this.clock());
    } catch (e) {
      if (!this.warned) console.warn('[events] tick failed', e);
      this.warned = true;
    }
  }

  tick(now: number): void {
    const from = this.last;
    this.last = now;
    for (const c of crossings(from, now, this.sites)) {
      if (now - c.when <= STALE_MS) this.announce(c);
    }
    const cur = eventAt(now, this.sites);
    if (this.active && (!cur || cur.start !== this.active.start)) this.finish(this.active);
    if (cur && !this.active) this.begin(cur);
    const occ = this.active;
    if (!occ) return;
    const me = G.world?.localPlayer;
    if (me && !me.removed) {
      const near = this.pointsOf(occ).some((q) => distM(me.position.x, me.position.z, q.x, q.z) <= EVENT_DEFS[occ.id].radius);
      if (near) this.presence += Math.min(2, Math.max(0, (now - from) / 1000));
    }
    if (G.net.isAuthority) this.hostTick(occ, now);
  }

  /** Points where the event's units stand now (participation and minimap pins). */
  private pointsOf(occ: EventOcc): Pt[] {
    const site = occ.site;
    const tagged = (tag: string): Pt[] => this.ctx.world.enemies.filter((e) => e.tag === tag && !e.isDead && !e.removed).map((e) => ({ x: e.position.x, z: e.position.z }));
    switch (occ.id) {
      case 'metin_storm': return tagged(TAG.storm);
      case 'world_boss': return site ? [site.pos] : [];
      case 'village_raid': return site ? [site.pos, ...tagged(TAG.raid)] : [];
      case 'goblin_caravan': return tagged(TAG.caravan);
    }
  }

  private onDamage(sourceId: EntityId | null, targetId: EntityId, amount: number): void {
    if (!this.active) return;
    const me = G.world?.localPlayer;
    if (!me || sourceId !== me.id) return;
    const t = this.ctx.world.get<Enemy>(targetId);
    if (t && t.kind === 'enemy' && t.tag.startsWith('ev:')) this.dealt += amount;
  }

  private begin(occ: EventOcc): void {
    this.active = occ;
    this.dealt = 0;
    this.presence = 0;
    this.wave = 0;
    if (!G.net.isAuthority || !occ.site) return;
    switch (occ.id) {
      case 'metin_storm':
        this.hooks.metin.setStorm(true);
        break;
      case 'world_boss':
        if (occ.site.bossId) this.hooks.bosses.expedite(occ.site.bossId);
        break;
      case 'village_raid': {
        const region = this.ctx.regionAt(occ.site.pos.x, occ.site.pos.z);
        this.raidLevel = region ? region.levels : [this.ctx.params.enemyLevel, this.ctx.params.enemyLevel];
        this.raidPool = this.poolOf(region?.id ?? null);
        break;
      }
      case 'goblin_caravan':
        this.spawnCaravan(occ.site);
        break;
    }
  }

  /** Host: the raid waves, on their schedule. */
  private hostTick(occ: EventOcc, now: number): void {
    if (occ.id !== 'village_raid' || !occ.site) return;
    const elapsed = (now - occ.start) / 1000;
    while (this.wave < RAID_WAVES_SEC.length && elapsed >= RAID_WAVES_SEC[this.wave]) {
      this.spawnRaidWave(occ.site, this.wave);
      this.wave++;
    }
  }

  private finish(occ: EventOcc): void {
    this.active = null;
    if (G.net.isAuthority) {
      this.hooks.metin.setStorm(false);
      for (const e of this.spawned) if (!e.isDead && !e.removed) e.escape();
      this.spawned.length = 0;
    }
    this.reward(occ);
  }

  /** Local participant reward (existing helpers: gold, exploration XP, the elite loot roll). */
  private reward(occ: EventOcc): void {
    if (this.dealt <= 0 && this.presence < PRESENCE_REWARD_SEC) return;
    const ch = G.character;
    const me = G.world?.localPlayer;
    if (!ch) return;
    const def = EVENT_DEFS[occ.id];
    const lvl = Math.max(1, ch.level);
    const gold = def.goldPerLevel * lvl;
    ch.addGold(gold);
    G.progression.addExplorationXp(def.xpPct);
    let dropped = 0;
    for (let i = 0; i < def.items; i++) {
      const item = G.loot.rollItem({ itemLevel: lvl, rank: 'elite', minRarity: 'uncommon' });
      if (!ch.addItem(item)) {
        dropped++;
        if (me) G.loot.dropItem(item, me.position);
      }
    }
    // WP-12: the event's pet egg (data/pets.ts) for a small share of the participants
    const egg = eventPetItem(occ.id, Math.random());
    if (egg) {
      ch.addMaterial(egg, 1);
      toast(`Evcil hayvan yumurtası düştü: ${getMaterial(egg)?.name ?? egg}`, 'loot');
    }
    ch.persist();
    toast(`${def.name} ödülü:${gold} altın, %${def.xpPct} keşif XP${dropped ? ' (envanter dolu, yere düştü)' : ''}`, 'loot');
  }

  private announce(c: Crossing): void {
    const def = EVENT_DEFS[c.id];
    const site = c.occ.site.name;
    let text: string;
    if (c.phase === 'soon') text = `${def.name} ${Math.round((c.lead ?? 0) / 60)} dakika sonra başlıyor! Bölge: ${site}`;
    else if (c.phase === 'start') text = `${def.name} başladı! Bölge: ${site} (${Math.round(def.durSec / 60)} dk)`;
    else text = `${def.name} sona erdi.`;
    G.events.emit('world:event', { id: c.id, phase: c.phase, at: c.at, zone: c.occ.site.id });
    G.events.emit('world:announce', { text, kind: 'info' });
    toast(text, c.phase === 'start' ? 'boss' : 'info');
    G.events.emit('net:chat', { from: '', text, channel: 'system' });
  }

  pins(): EventPin[] {
    const now = this.clock();
    const out: EventPin[] = [];
    for (const occ of [occurrenceAt(slotOf(now), this.sites), occurrenceAt(slotOf(now) + 1, this.sites)]) {
      if (!occ.site) continue;
      const running = this.active?.start === occ.start;
      const soon = !running && now >= occ.start - EVENT_LEADS_SEC[0] * 1000 && now < occ.start;
      if (!running && !soon) continue;
      const p = running ? this.pointsOf(occ)[0] ?? occ.site.pos : occ.site.pos;
      out.push({ id: occ.id, x: p.x, z: p.z, name: EVENT_DEFS[occ.id].name, active: running });
    }
    return out;
  }

  upcomingLines(nowMs: number, n: number): string[] {
    return upcomingAfter(nowMs, this.sites, n).map((occ) => describeOcc(occ, nowMs));
  }

  dispose(): void {
    this.events.dispose();
    if (this.active && G.net.isAuthority) this.hooks.metin.setStorm(false);
    this.active = null;
    if (live === this) live = null;
  }

  // ------------------------------------------------------------------------------------------ host spawns

  /** Raid pool: the non-boss members of the packs of the region (trash rank first). */
  private poolOf(regionId: string | null): string[] {
    const ids = new Set<string>();
    for (const pk of this.ctx.def.packs) {
      const r = this.ctx.regionAtTile(pk.center[0], pk.center[1]);
      if (!regionId || r?.id !== regionId) continue;
      for (const m of pk.members) if (getEnemyDef(m.enemyId)) ids.add(m.enemyId);
    }
    const trash = [...ids].filter((id) => getEnemyDef(id)?.rank === 'trash');
    return trash.length ? trash : [...ids].filter((id) => getEnemyDef(id)?.rank === 'elite');
  }

  private spawnRaidWave(site: EventSite, wave: number): void {
    const ctx = this.ctx;
    if (!this.raidPool.length || !site.radius) return;
    if (ctx.aliveEnemies() > ctx.ext.perf.maxActiveEnemies - RAID_WAVE_SIZE * 2) return;
    const rng = new RNG(hashString(`${ctx.seed}:raid:${site.id}:${wave}`));
    for (let i = 0; i < RAID_WAVE_SIZE; i++) {
      const ang = rng.next() * Math.PI * 2;
      const p = ctx.snapWorld(site.pos.x + Math.cos(ang) * site.radius, site.pos.z + Math.sin(ang) * site.radius, 10);
      const defId = rng.pick(this.raidPool);
      const level = rng.int(this.raidLevel[0], this.raidLevel[1]);
      void spawnEnemy(ctx.world, defId, p, { level, tag: TAG.raid, aggro: true })
        .then((e) => this.track(e))
        .catch(() => undefined);
    }
  }

  /** The caravan walks the road A to B and back (a patrol loop) as a small elite pack. */
  private spawnCaravan(site: EventSite): void {
    const ctx = this.ctx;
    const road = site.path ?? [site.pos];
    const loop = [...road, ...road.slice(0, -1).reverse()].map((q) => ({ x: q.x, z: q.z }));
    const level = ctx.params.enemyLevel;
    CARAVAN_MEMBERS.forEach((defId, i) => {
      const at = road[0];
      void spawnEnemy(ctx.world, defId, { x: at.x + i * 2.5, z: at.z }, { level, tag: TAG.caravan, aggro: false, patrol: loop })
        .then((e) => this.track(e))
        .catch(() => undefined);
    });
  }

  private track(e: Enemy | null): void {
    if (!e || e.removed) return;
    if (this.active) this.spawned.push(e);
    else e.escape();
  }
}
