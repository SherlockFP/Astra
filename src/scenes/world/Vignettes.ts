import { G } from '../../game/G';
import { spawnEnemy, type SpawnEnemyOpts } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import { VignetteProp, type VignettePropKind, type VignettePropOpts } from '../../entities/interactables/VignetteProp';
import { VIGNETTE_DEFS, VIGNETTE_RULES, vignetteDef, type VignetteDef } from '../../data/world/vignettes';
import { QUESTS } from '../../data/world/quests';
import { RNG, hashString } from '../../core/utils';
import { toast } from '../../systems/notify';
import type { World } from '../../world/World';
import type { EventScope } from '../../core/EventBus';
import type { EntityId } from '../../types/common';
import { TILE_SIZE, type WorldRegion } from '../../types/dungeons';
import { distM, tileToWorld, type Pt, type WorldCtx } from './util';
import { escortPath, questPropSpots } from './WorldQuestProps';
import { anchorCandidates, eligibleDefs, freeSites, inDisc, levelEligible, nearestDist, pickWeighted, ringLevel, type Disc } from './VignetteRules';
import { VignetteRun, type RunFacts, type VigEvent } from './VignetteRun';
import type { Pt2 } from './QuestEscortRun';

/**
 * Travel vignettes of the open world (data/world/vignettes.ts; rules VignetteRules.ts, state machines VignetteRun.ts).
 * Host only: the roll. Each peer keeps the travelled distance of every live player on a road or next to a POI of a ring; after
 * VIGNETTE_RULES.rollEveryM metres a roll picks a def (weights, the player's cooldowns, the ring's level band), an anchor outside
 * camps, villages, quest spots and escort routes (one vignette per 200 m), spawns the host's enemies (tag `vig:<slot>`) and
 * announces it on the gate channel (`ev:vig:<defId>:<slot>:<x>:<z>:<lv>:<rollerId>`). Every peer, the host included, then runs its own
 * copy of the vignette for the local player (a bystander in range only inside the level band and off their own cooldowns): the
 * props (VignetteProp), the minimap pin, the bubbles and the pop-up questions
 * (G.ui.confirm), the kill and hit credit, and the rewards (gold, exploration XP). A vignette despawns after its durSec whatever
 * happened, and the host escapes the units it spawned. Never inside camps; never on a quest's spots.
 * OWNER: scenes module.
 */

/** Host spawner of the vignette's enemies (EnemyFactory.spawnEnemy; a sim injects a fake). */
export type VignetteSpawner = (world: World, defId: string, pos: Pt, opts: SpawnEnemyOpts) => Promise<Enemy | null>;

export interface VignetteDirectorOpts {
  spawn?: VignetteSpawner;
}

export interface VignettePin { id: number; defId: string; x: number; z: number; name: string }

interface Site extends Pt {
  kind: 'road' | 'poi';
  regionId: string;
}

interface Active extends Pt {
  slot: number;
  /** Host clock (s) when the spawned units are escaped. */
  until: number;
}

interface Local {
  run: VignetteRun;
  def: VignetteDef;
  props: { role: string; prop: VignetteProp }[];
  /** The figure that speaks (the traveler, the scout). */
  npc: VignetteProp | null;
  disposed: boolean;
}

/** The polyline cut into points every `step` m, its vertices included (the escort's exclusion check runs on the whole route). */
function sampleLine(poly: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const n = Math.max(1, Math.ceil(distM(a.x, a.z, b.x, b.z) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  const last = poly[poly.length - 1];
  if (last) out.push({ x: last.x, z: last.z });
  return out;
}

let live: VignetteDirector | null = null;

/** Minimap pins of the local player's running vignettes (empty outside the open world). */
export function activeVignettePins(): VignettePin[] {
  return live?.pins() ?? [];
}

export class VignetteDirector {
  private readonly rng: RNG;
  private readonly spawn: VignetteSpawner;
  private readonly ringIds: Set<string>;
  private events: EventScope | null = null;
  private built = false;
  private sites: Site[] = [];
  private regionSites = new Map<string, Site[]>();
  private exclusions: Disc[] = [];
  private readonly runs: Local[] = [];
  /** Host: the vignettes it started and their spawned units. */
  private readonly active: Active[] = [];
  /** Host: `<playerId>|<defId>` and `<playerId>|*`: the host clock when the cooldown is over (the roller and every player in range). */
  private readonly cd = new Map<string, number>();
  /** Every peer: the local player's `<defId>` and `*` cooldowns, charged when a run starts for the player (a bystander's runs too). */
  private readonly mine = new Map<string, number>();
  /** `<defId>@x,z`: the escort route of a road_ambush at an anchor (null when there is none), computed once per anchor. */
  private readonly escorts = new Map<string, Pt2[] | null>();
  private readonly lastPos = new Map<number, Pt>();
  private readonly travel = new Map<number, number>();
  private hostT = 0;
  private gapUntil = 0;
  private nextSlot = 0;
  private disposed = false;

  constructor(
    private readonly ctx: WorldCtx,
    /** Broadcast an `ev:*` key and apply it on this peer (WorldRuntime.announce). */
    private readonly announce: (key: string) => void,
    opts: VignetteDirectorOpts = {},
  ) {
    this.spawn = opts.spawn ?? spawnEnemy;
    this.rng = new RNG(hashString(`${ctx.seed}:vignettes`));
    this.ringIds = new Set(VIGNETTE_DEFS.map((d) => d.regionId).filter((id) => !!ctx.regionById(id)));
    live = this;
  }

  /** Subscribes to the kill and hit credit of the local player. Called by WorldRuntime after the map is up. */
  attach(): void {
    this.events = G.events?.scope() ?? null;
    this.events?.on('death', ({ entityId, killerId }) => this.onDeath(entityId, killerId));
    this.events?.on('damage', ({ sourceId, targetId, amount }) => this.onHit(sourceId, targetId, amount));
  }

  /** Per frame: the host rolls, every peer runs its live vignettes. Never throws. */
  update(dt: number): void {
    if (this.disposed) return;
    this.ensureBuilt();
    this.hostT += dt;
    if (G.net.isAuthority) this.hostTick();
    for (const local of [...this.runs]) {
      if (local.disposed) continue;
      this.apply(local, local.run.update(dt, this.facts(local, dt)));
      this.followEscort(local);
    }
  }

  /** `ev:vig:<defId>:<slot>:<x>:<z>:<lv>:<rollerId>` from the gate channel (every peer, the host included). */
  onMessage(key: string): void {
    if (this.disposed) return;
    const q = key.split(':');
    const def = vignetteDef(q[2] ?? '');
    const slot = Number(q[3]);
    const x = Number(q[4]);
    const z = Number(q[5]);
    const roller = Number(q[7]);
    if (!def || !Number.isFinite(slot) || !Number.isFinite(x) || !Number.isFinite(z)) return;
    if (this.runs.some((r) => r.run.slot === slot && r.def.id === def.id)) return;
    const me = this.ctx.world.localPlayer;
    if (!me || me.removed || distM(me.position.x, me.position.z, x, z) > VIGNETTE_RULES.liveM) return;
    const region = this.ctx.regionById(def.regionId);
    // the roller's gates ran on the host (roll); a bystander takes the vignette only inside the ring's level band and off their own cooldowns
    const isRoller = roller === me.id;
    if (!region || (!isRoller && (!levelEligible(region.levels, me.level) || !this.mineFree(def)))) return;
    const escortPath = def.followup === 'escort' ? this.escortAt(def, { x, z }) : null;
    const run = new VignetteRun({
      def,
      slot,
      anchor: { x, z },
      level: ringLevel(region.levels, me.level),
      escortPath,
    });
    this.chargeMine(def);
    const local: Local = { run, def, props: [], npc: null, disposed: false };
    this.runs.push(local);
    this.makeProps(local);
    this.apply(local, run.begin());
  }

  /** Pins of the running vignettes (the minimap draws them). */
  pins(): VignettePin[] {
    const out: VignettePin[] = [];
    for (const l of this.runs) {
      if (l.disposed || l.run.isEnded || l.run.phase === 'done') continue;
      out.push({ id: l.run.slot, defId: l.def.id, x: l.run.anchor.x, z: l.run.anchor.z, name: l.def.name });
    }
    return out;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events?.dispose();
    this.events = null;
    for (const l of [...this.runs]) this.drop(l);
    if (live === this) live = null;
  }

  // ================================================================================================ host
  private hostTick(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (this.hostT < a.until) continue;
      this.active.splice(i, 1);
      this.escapeTagged(a.slot);
    }
    this.travelTick();
  }

  /** Every live player walks: the distance on a road or next to a POI counts; a roll is due every rollEveryM metres. */
  private travelTick(): void {
    const ctx = this.ctx;
    for (const p of ctx.livePlayers()) {
      const pos = { x: p.position.x, z: p.position.z };
      const prev = this.lastPos.get(p.id);
      this.lastPos.set(p.id, pos);
      if (!prev) continue;
      const moved = distM(prev.x, prev.z, pos.x, pos.z);
      if (moved > 25) continue; // a waypoint, a respawn: not a walk
      const rid = ctx.regionAt(pos.x, pos.z)?.id;
      if (!rid || !this.ringIds.has(rid)) continue;
      const list = this.regionSites.get(rid) ?? [];
      if (nearestDist(list, pos) > VIGNETTE_RULES.nearRoadM) continue;
      const acc = (this.travel.get(p.id) ?? 0) + moved;
      if (acc < VIGNETTE_RULES.rollEveryM) {
        this.travel.set(p.id, acc);
        continue;
      }
      this.travel.set(p.id, 0);
      this.roll(p, rid, pos);
    }
  }

  private roll(p: Player, rid: string, pos: Pt): void {
    if (this.rng.next() >= VIGNETTE_RULES.rollChance) return;
    if (this.hostT < this.gapUntil) return;
    if (this.active.some((a) => distM(a.x, a.z, pos.x, pos.z) < VIGNETTE_RULES.spacingM)) return;
    const region = this.ctx.regionById(rid);
    if (!region) return;
    const cands = anchorCandidates(this.regionSites.get(rid) ?? [], pos, this.active);
    if (!cands.length) return;
    const c = cands[Math.floor(this.rng.next() * cands.length)];
    const at = { x: Math.round(c.x), z: Math.round(c.z) };
    const free = (defId: string): boolean =>
      this.hostT >= (this.cd.get(`${p.id}|${defId}`) ?? -Infinity) && this.hostT >= (this.cd.get(`${p.id}|*`) ?? -Infinity);
    // an escort follow-up needs its route from this anchor: without one the traveler would end as thanks only, so another def is picked
    const servable = (defId: string): boolean => {
      const d = vignetteDef(defId);
      return !d || d.followup !== 'escort' || !!this.escortAt(d, at);
    };
    const def = pickWeighted(eligibleDefs(VIGNETTE_DEFS, rid, region.levels, p.level, (id) => free(id) && servable(id)), () => this.rng.next());
    if (!def) return;
    this.launch(def, at, p, region);
  }

  /**
   * Host: starts `def` at `at` for the player `p`, at once (the roll applies the cooldowns and the gap first; the sim calls this
   * directly). Refused (false) off the host, for a spot within spacingM of an active vignette, for a region the map lacks, or for an
   * escort follow-up with no escort route from `at`.
   */
  startAt(def: VignetteDef, at: Pt, p: Player): boolean {
    this.ensureBuilt();
    const region = this.ctx.regionById(def.regionId);
    if (!region || !G.net.isAuthority) return false;
    if (this.active.some((a) => distM(a.x, a.z, at.x, at.z) < VIGNETTE_RULES.spacingM)) return false;
    const site = { x: Math.round(at.x), z: Math.round(at.z) };
    if (def.followup === 'escort' && !this.escortAt(def, site)) return false;
    this.launch(def, site, p, region);
    return true;
  }

  /** The road and POI sites of a ring region, outside every exclusion disc (the roll picks anchors from them). */
  sitesOf(regionId: string): Pt[] {
    this.ensureBuilt();
    return this.regionSites.get(regionId) ?? [];
  }

  /** True when no camp, village, quest spot, escort route or other exclusion covers `p`. */
  isFree(p: Pt): boolean {
    this.ensureBuilt();
    return !this.exclusions.some((d) => inDisc(p, d));
  }

  /** Host: a vignette starts at `site` for the player `p` (the host's units spawn, then every peer gets the announcement). */
  private launch(def: VignetteDef, site: Pt, p: Player, region: WorldRegion): void {
    const slot = ++this.nextSlot;
    const lv = ringLevel(region.levels, p.level);
    const x = Math.round(site.x);
    const z = Math.round(site.z);
    this.chargeNear(def, { x, z }, p, region);
    this.gapUntil = this.hostT + VIGNETTE_RULES.gapSec;
    this.active.push({ slot, x, z, until: this.hostT + def.durSec + VIGNETTE_RULES.lingerSec });
    this.spawnUnits(def, { x, z }, lv, slot);
    this.announce(`ev:vig:${def.id}:${slot}:${x}:${z}:${lv}:${p.id}`);
  }

  /** Host: the cooldowns a started vignette charges: the roller's and those of every player in range who may take it (each peer runs it for its own player). */
  private chargeNear(def: VignetteDef, at: Pt, roller: Player, region: WorldRegion): void {
    const charge = (pl: Player): void => {
      this.cd.set(`${pl.id}|${def.id}`, this.hostT + def.cooldownSec);
      this.cd.set(`${pl.id}|*`, this.hostT + VIGNETTE_RULES.playerCdSec);
    };
    charge(roller);
    for (const q of this.ctx.livePlayers()) {
      if (q.id === roller.id || distM(q.position.x, q.position.z, at.x, at.z) > VIGNETTE_RULES.liveM) continue;
      if (levelEligible(region.levels, q.level)) charge(q);
    }
  }

  /** Every peer: the local player's cooldowns allow `def` now. */
  private mineFree(def: VignetteDef): boolean {
    return this.hostT >= (this.mine.get(def.id) ?? -Infinity) && this.hostT >= (this.mine.get('*') ?? -Infinity);
  }

  /** Every peer: a run started for the local player, so its cooldowns start. */
  private chargeMine(def: VignetteDef): void {
    this.mine.set(def.id, this.hostT + def.cooldownSec);
    this.mine.set('*', this.hostT + VIGNETTE_RULES.playerCdSec);
  }

  /** The host's units of a vignette: the ambushers (scripted, they engage at once), the herd and its wolves, the goblin. */
  private spawnUnits(def: VignetteDef, at: Pt, lv: number, slot: number): void {
    const world = this.ctx.world;
    const tag = `vig:${slot}`;
    const rng = new RNG(hashString(`${this.ctx.seed}:vig:${slot}`));
    const put = (defId: string, x: number, z: number, opts: Partial<SpawnEnemyOpts>): void => {
      const p = this.ctx.snapWorld(x, z, 6);
      this.spawn(world, defId, p, { level: lv, tag, openWorld: true, aggro: false, ...opts }).catch(() => undefined);
    };
    if (def.kind === 'road_ambush') {
      for (let i = 0; i < def.count; i++) {
        const defId = def.enemies[rng.int(0, def.enemies.length - 1)];
        const a = (i / def.count) * Math.PI * 2 + rng.next();
        put(defId, at.x + Math.cos(a) * 5, at.z + Math.sin(a) * 5, { aggro: true, scripted: true });
      }
    } else if (def.kind === 'wolf_hunt' && def.herd) {
      for (let i = 0; i < def.herd.count; i++) {
        const a = rng.range(0, Math.PI * 2);
        put(def.herd.enemyId, at.x + Math.cos(a) * 3, at.z + Math.sin(a) * 3, {});
      }
      const r = def.herd.radius;
      const loop: { x: number; z: number }[] = [];
      // the pack walks in from its spawn ring (r) onto an inner loop (0.4 r) around the herd: it closes on the deer, slowly (patrolMul)
      const inner = r * 0.4;
      for (let k = 0; k < 8; k++) loop.push({ x: at.x + Math.cos((k / 8) * Math.PI * 2) * inner, z: at.z + Math.sin((k / 8) * Math.PI * 2) * inner });
      for (let i = 0; i < def.count; i++) {
        const a = (i / def.count) * Math.PI * 2;
        // scripted: the pack takes the encounter at once when the player is near (it bypasses the low-level pull cap that the herd's
        // engaged deer would fill), so the wolves turn on the player inside their aggro range (10 m) or when hit
        put(def.enemies[0], at.x + Math.cos(a) * r, at.z + Math.sin(a) * r, { patrol: loop, scripted: true });
      }
    } else if (def.kind === 'goblin_sighting') {
      put(def.enemies[0], at.x + 2, at.z + 1, {});
    }
  }

  /** Host: the units of a vignette leave (escape, no death). */
  private escapeTagged(slot: number): void {
    const tag = `vig:${slot}`;
    for (const e of [...this.ctx.world.enemies]) {
      if (e.tag === tag && !e.isDead && !e.removed) e.escape();
    }
  }

  // ================================================================================================ every peer
  private facts(local: Local, dt: number): RunFacts {
    const w = this.ctx.world;
    const me = w.localPlayer;
    const tag = `vig:${local.run.slot}`;
    let tagged = 0;
    for (const e of w.enemies) if (e.tag === tag && !e.isDead && !e.removed) tagged++;
    return {
      dt,
      playerDist: (x, z) => (me && !me.removed ? distM(me.position.x, me.position.z, x, z) : Infinity),
      aliveTagged: tagged,
      herbsInBag: local.def.herb ? G.character?.material(local.def.herb.item) ?? 0 : 0,
    };
  }

  /** Applies the events of a run: props, bubbles, toasts, pop-up questions, rewards, item moves, the end. */
  private apply(local: Local, events: VigEvent[]): void {
    for (const ev of events) {
      if (local.disposed) return;
      switch (ev.t) {
        case 'phase':
          if (ev.to === 'satchel') this.addSatchel(local);
          break;
        case 'say':
          this.say(local, ev.text);
          break;
        case 'toast':
          toast(ev.text, ev.kind);
          break;
        case 'ask':
          void G.ui.confirm(ev.text, ev.yes, ev.no).then((yes) => {
            if (!local.disposed) this.apply(local, local.run.answer(yes));
          });
          break;
        case 'grant':
          this.grant(local, ev.gold, ev.xpPct, ev.why);
          break;
        case 'give':
          G.character?.addMaterial(ev.item, ev.n);
          G.character?.persist();
          break;
        case 'take':
          G.character?.useMaterial(ev.item, ev.n);
          G.character?.persist();
          break;
        case 'end':
          // the host's units leave with the vignette (the host is the one that spawned them)
          if (G.net.isAuthority) this.escapeTagged(local.run.slot);
          this.drop(local);
          break;
      }
    }
  }

  private grant(local: Local, gold: number, xpPct: number, why: 'thanks' | 'reward'): void {
    const ch = G.character;
    if (!ch) return;
    if (gold > 0) ch.addGold(gold);
    G.progression.addExplorationXp(xpPct);
    ch.persist();
    toast(`${local.def.name}${why === 'thanks' ? ' (teşekkür)' : ''}: +${gold} altın, %${xpPct} keşif XP`, 'loot');
  }

  /** The line shows as a bubble over the figure (or the cart) and as a rumour in the chat. */
  private say(local: Local, text: string): void {
    const speaker = local.props.find((p) => p.role === 'npc' || p.role === 'cart')?.prop ?? null;
    if (speaker) G.ui?.say(speaker.object3d, { kind: 'npc', text, name: local.def.npc, color: '#ffd27a', seconds: 4.5, offsetY: 2.4 });
    G.barks?.rumor(local.def.npc, text);
  }

  /** The traveler walks the escort route while its run walks (the nav polyline of the run). */
  private followEscort(local: Local): void {
    const esc = local.run.escort;
    if (!esc || !local.npc || local.run.phase !== 'escort') return;
    const w = this.ctx.world;
    local.npc.position.set(esc.pos.x, w.groundY(esc.pos.x, esc.pos.z), esc.pos.z);
  }

  private makeProps(local: Local): void {
    const { run, def } = local;
    const a = run.anchor;
    const alive = () => !run.isEnded;
    switch (def.kind) {
      case 'road_ambush':
        this.addProp(local, 'npc', 'traveler', a, {
          name: def.npc, prompt: () => this.npcPrompt(local), canUse: alive, onUse: () => this.apply(local, run.onNpc()),
        });
        break;
      case 'scout_herbs': {
        this.addProp(local, 'npc', 'scout', a, {
          name: def.npc, prompt: () => this.npcPrompt(local), canUse: alive, onUse: () => this.apply(local, run.onNpc()),
        });
        this.addProp(local, 'fire', 'campfire', { x: a.x + 1.6, z: a.z }, { name: 'Kamp ateşi', prompt: () => 'Kamp ateşi', canUse: () => false, onUse: () => {} });
        const n = (def.herb?.count ?? 0) + 1;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + 0.5;
          const r = 3.5 + (i % 2) * 1.2;
          const at = { x: a.x + Math.cos(ang) * r, z: a.z + Math.sin(ang) * r };
          this.addProp(local, 'tuft', 'tuft', at, {
            name: 'Ak Papatya',
            prompt: () => 'Ak Papatya – topla [F]',
            canUse: () => run.phase === 'herbs' && !run.isEnded,
            onUse: () => {
              this.removeRole(local, 'tuft', at);
              this.apply(local, run.onTuft());
            },
          });
        }
        break;
      }
      case 'stuck_cart':
        this.addProp(local, 'cart', 'cart', a, {
          name: def.npc,
          holdSec: def.holdSec,
          prompt: () => `${def.npc} – kaldır (F basılı tut)`,
          canUse: () => run.phase === 'stuck' && !run.isEnded,
          onUse: () => this.apply(local, run.onCart()),
        });
        break;
      default:
        break;
    }
  }

  private npcPrompt(local: Local): string {
    const { run, def } = local;
    switch (run.phase) {
      case 'escort': return run.escort?.state === 'idle' ? `${def.npc} – eskortu başlat [F]` : `${def.npc} – yolda`;
      case 'carry': return `${def.npc} – heybeyi teslim et [F]`;
      case 'scout': return `${def.npc} – görev iste [F]`;
      case 'herbs': return `${def.npc} – papatyaları bekliyor`;
      case 'return': return `${def.npc} – papatyaları teslim et [F]`;
      default: return `${def.npc} – konuş [F]`;
    }
  }

  /** The satchel lies on the road once the player accepted the satchel follow-up. */
  private addSatchel(local: Local): void {
    const { run } = local;
    const a = run.anchor;
    this.addProp(local, 'satchel', 'satchel', { x: a.x + 3, z: a.z + 1 }, {
      name: 'Kayıp Heybe',
      prompt: () => 'Kayıp Heybe – al [F]',
      canUse: () => run.phase === 'satchel' && !run.isEnded,
      onUse: () => {
        this.removeRole(local, 'satchel');
        this.apply(local, run.onSatchel());
      },
    });
  }

  private addProp(local: Local, role: string, kind: VignettePropKind, at: Pt, opts: Omit<VignettePropOpts, 'kind'>): void {
    const world = this.ctx.world;
    const prop = new VignetteProp(world.allocLocalId(), { kind, ...opts });
    prop.position.set(at.x, world.groundY(at.x, at.z), at.z);
    local.props.push({ role, prop });
    if (role === 'npc') local.npc = prop;
    prop.load().then(
      () => {
        if (!local.disposed) world.add(prop);
      },
      (err) => console.warn(`[vignette] ${kind} of ${local.def.id} failed to load`, err),
    );
  }

  /** Removes one prop of a role (the tuft or the satchel that was used); `at` picks one tuft out of several. */
  private removeRole(local: Local, role: string, at?: Pt): void {
    const i = local.props.findIndex((p) => p.role === role && (!at || (Math.abs(p.prop.position.x - at.x) < 0.01 && Math.abs(p.prop.position.z - at.z) < 0.01)));
    if (i < 0) return;
    const [gone] = local.props.splice(i, 1);
    this.ctx.world.remove(gone.prop);
    if (local.npc === gone.prop) local.npc = null;
  }

  private drop(local: Local): void {
    if (local.disposed) return;
    local.disposed = true;
    for (const p of local.props) this.ctx.world.remove(p.prop);
    local.props = [];
    local.npc = null;
    const i = this.runs.indexOf(local);
    if (i >= 0) this.runs.splice(i, 1);
  }

  private onDeath(entityId: EntityId, killerId: EntityId | null): void {
    const me = this.ctx.world.localPlayer;
    if (!me || killerId !== me.id) return;
    const e = this.ctx.world.get<Enemy>(entityId);
    const tag = e?.tag ?? '';
    if (!tag.startsWith('vig:')) return;
    const local = this.runOf(tag);
    if (local) this.apply(local, local.run.onKill(e?.def?.id ?? ''));
  }

  private onHit(sourceId: EntityId | null, targetId: EntityId, amount: number): void {
    const me = this.ctx.world.localPlayer;
    if (!me || sourceId !== me.id) return;
    const e = this.ctx.world.get<Enemy>(targetId);
    const tag = e?.tag ?? '';
    if (!tag.startsWith('vig:')) return;
    const local = this.runOf(tag);
    if (local) this.apply(local, local.run.onDamage(amount));
  }

  private runOf(tag: string): Local | undefined {
    const slot = Number(tag.slice(4));
    return this.runs.find((r) => r.run.slot === slot && !r.run.isEnded && !r.disposed);
  }

  // ================================================================================================ map data
  /** Once per map: the road and POI sites of the rings outside every exclusion disc, and the escort routes' spacing. */
  private ensureBuilt(): void {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx;
    const tile = (t: [number, number]): Pt => ({ x: tileToWorld(t[0]), z: tileToWorld(t[1]) });
    const ex: Disc[] = [];
    const disc = (p: Pt, r: number): void => {
      ex.push({ x: p.x, z: p.z, r });
    };
    // camps and patrols (a camp's members stand within its radius; a patrol walks its loop)
    const C = VIGNETTE_RULES;
    for (const pk of ctx.def.packs) {
      disc(tile(pk.center), (pk.radius ?? 12) + C.clearCampM);
      for (const q of pk.patrol ?? []) disc(tile(q), C.clearPatrolM);
    }
    for (const v of ctx.ext.villages) disc(tile(v.center), Math.max(v.bounds[0], v.bounds[1]) + C.clearVillageM);
    for (const s of ctx.ext.metin.spots) disc(tile(s.pos), C.clearPoiM + 4);
    for (const r of ctx.ext.rares) for (const s of r.spots) disc(tile(s), C.clearPoiM + 6);
    for (const m of ctx.ext.minibosses) disc(tile(m.lair), C.clearPoiM + 8);
    for (const f of ctx.ext.gather) disc(tile(f.center), f.radius * TILE_SIZE + C.clearPoiM);
    for (const d of [...ctx.ext.chests, ...ctx.ext.shrines, ...ctx.ext.hidden, ...ctx.ext.vistas, ...(ctx.ext.graveyards ?? [])]) disc(tile(d.pos), C.clearPoiM);
    for (const b of ctx.def.bosses ?? []) disc(tile(b.pos), C.clearBossM);
    // quest spots and escort routes of the ring's quests: nothing spawns on them
    const questDefs = QUESTS.filter((d) => !!d.region && !!ctx.regionById(d.region!));
    for (const s of questPropSpots(ctx, questDefs)) disc(s, C.clearQuestM);
    for (const d of QUESTS) {
      if (!d.region || !this.ringIds.has(d.region) || !d.objectives.some((o) => o.kind === 'escort')) continue;
      (escortPath(ctx, d.id) ?? []).forEach((q, i) => {
        if (i % 3 === 0) disc(q, C.clearEscortM);
      });
    }
    this.exclusions = ex;

    const sites: Site[] = [];
    const add = (x: number, z: number, kind: Site['kind']): void => {
      const rid = ctx.regionAt(x, z)?.id;
      if (!rid || !this.ringIds.has(rid)) return;
      // walkable ground only: a point with no walkable cell within 3 m is dropped (no spawn in the water or on a rock)
      const w = ctx.built.nav.nearestWalkable(x, z, 3);
      if (w) sites.push({ x: w.x, z: w.z, kind, regionId: rid });
    };
    for (const road of ctx.ext.roads) {
      for (let i = 0; i + 1 < road.pts.length; i++) {
        const a = tile(road.pts[i]);
        const b = tile(road.pts[i + 1]);
        const len = distM(a.x, a.z, b.x, b.z) || 1;
        const n = Math.max(1, Math.floor(len / 8));
        const ux = (b.x - a.x) / len;
        const uz = (b.z - a.z) / len;
        for (let k = 0; k < n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n;
          const z = a.z + ((b.z - a.z) * k) / n;
          add(x, z, 'road');
          // beside the road: a scout's camp, a cart in the ditch (the sides are still "on the road" for the pass check)
          add(x - uz * C.sideM, z + ux * C.sideM, 'road');
          add(x + uz * C.sideM, z - ux * C.sideM, 'road');
        }
      }
    }
    for (const w of ctx.ext.waypoints) {
      const c = tile(w.pos);
      add(c.x, c.z, 'poi');
    }
    this.sites = freeSites(sites, ex);
    this.regionSites = new Map();
    for (const s of this.sites) {
      const arr = this.regionSites.get(s.regionId) ?? [];
      arr.push(s);
      this.regionSites.set(s.regionId, arr);
    }
  }

  /**
   * The escort route of a traveler: the nav path from the anchor to a road point about `escortM` metres away. It keeps off every
   * exclusion disc along its whole length (the string-pulled path has long straight segments, so they are sampled every metre).
   * Null when no such route exists; the roll then picks another def at that anchor, so a traveler never ends as thanks only.
   */
  private escortFrom(def: VignetteDef, anchor: Pt): Pt2[] | null {
    this.ensureBuilt();
    const want = def.escortM ?? 40;
    const list = (this.regionSites.get(def.regionId) ?? [])
      .filter((s) => s.kind === 'road' && Math.abs(distM(s.x, s.z, anchor.x, anchor.z) - want) <= 10)
      .sort((a, b) => Math.abs(distM(a.x, a.z, anchor.x, anchor.z) - want) - Math.abs(distM(b.x, b.z, anchor.x, anchor.z) - want));
    for (const c of list.slice(0, 6)) {
      const path = this.ctx.navPath(anchor, c);
      if (!path || !path.length) continue;
      const full = [{ x: anchor.x, z: anchor.z }, ...path];
      if (sampleLine(full, 1).some((q) => this.exclusions.some((d) => inDisc(q, d)))) continue;
      return full;
    }
    return null;
  }

  /** The escort route of an anchor, computed once per anchor (the roll asks for it; every peer computes it for the announcement). */
  private escortAt(def: VignetteDef, anchor: Pt): Pt2[] | null {
    const key = `${def.id}@${anchor.x},${anchor.z}`;
    let route = this.escorts.get(key);
    if (route === undefined) {
      route = this.escortFrom(def, anchor);
      this.escorts.set(key, route);
    }
    return route ? route.map((q) => ({ x: q.x, z: q.z })) : null;
  }
}
