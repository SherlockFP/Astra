import type { Object3D } from 'three';
import { G } from '../game/G';
import { DUNGEONS } from '../data/dungeons';
import { CLASS_LINES, ENEMY_AGGRO_LINES, ENEMY_DEATH_LINES, FAMILY_NAMES, PLAYER_LINES, RARE_AGGRO_LINES, ROLE_LINES, type BarkTrigger } from '../data/barks';
import type { SettingsData } from '../core/Settings';
import type { BossDef, EnemyDef } from '../types/enemies';
import type { TownNpcRole } from '../types/dungeons';

/**
 * Karakter sözleri (barks). OWNER: content module. Text lives in data/barks.ts.
 *  - The local player speaks on game events (level, first zone / dungeon entry, rare and epic loot, boss kill, first kill of a
 *    creature family, low HP once per fight, resurrection, quest, achievement, long idle in town, mount, PvP zone, arena win).
 *  - Elites, mini-bosses and bosses without a yell table speak their aggro and death lines.
 *  - Town NPCs with no lines of their own greet a walking player through npcLine() (NPC.ts walk-by).
 * The player's own line is a speech bubble over the player plus a say line in Genel ("<name> diyor: ...", Chat.addBark). NPC and
 * enemy lines are a speech bubble over the speaker plus a faint italic 'Söylenti' rumour line.
 * Pacing: player barks share a 20 s global gap, world lines (NPC / enemy) an 8 s gap, every trigger has its own cooldown,
 * a line never repeats the previous one from the same pool. Setting `characterBarks`: on (Açık), few (Az: only the
 * important moments, cooldowns x3, no world lines), off (Kapalı).
 * The pure part (BarkPicker) is driven by dev/combat-sim/barks.mjs. installBarks() wires it to the game.
 */

export type BarkLevel = SettingsData['characterBarks'];

/** Seconds between two player barks (global). */
export const PLAYER_GAP = 20;
/** Seconds between two world lines (NPC greeting or enemy line), global. */
export const WORLD_GAP = 8;
/** Ambient world lines (NPC walk-by, enemy lines) reach the chat only this close (m); farther ones are bubble-only. */
export const AMBIENT_CHAT_M = 25;
/** The same ambient line is printed to the chat at most once per this many seconds (any speaker). */
export const AMBIENT_DEDUPE_SEC = 20;
/** Enemy line cooldown per creature (seconds). */
export const ENEMY_CD = 90;
/** Az: every cooldown is multiplied by this. */
export const FEW_MUL = 3;
/** Standing still this long (within IDLE_RADIUS m) in town triggers the idle bark. */
export const IDLE_SEC = 300;
export const IDLE_RADIUS = 2;
/** Low HP: below LOW_HP of max, once per fight; re-armed above REARM_HP or after OUT_OF_COMBAT seconds without a hit. */
export const LOW_HP = 0.25;
export const REARM_HP = 0.6;
export const OUT_OF_COMBAT = 30;

interface Rule {
  /** Cooldown per trigger, seconds (0 = the once-per-character flag is the only limit). */
  cd: number;
  /** Still heard on Az (few): the important moments. */
  high: boolean;
}

export const RULES: Record<BarkTrigger, Rule> = {
  levelup: { cd: 30, high: true },
  zone: { cd: 0, high: true },
  dungeon: { cd: 0, high: true },
  loot_rare: { cd: 90, high: false },
  loot_epic: { cd: 45, high: true },
  boss_kill: { cd: 60, high: true },
  family: { cd: 0, high: false },
  low_hp: { cd: 120, high: true },
  resurrect: { cd: 60, high: false },
  quest_done: { cd: 45, high: false },
  achievement: { cd: 30, high: true },
  idle_town: { cd: 900, high: false },
  mount: { cd: 300, high: false },
  pvp_zone: { cd: 300, high: false },
  arena_win: { cd: 120, high: true },
};

export interface BarkRequest {
  /** Cooldown key (a trigger, or one creature: `aggro:<id>`). */
  key: string;
  pool: string[];
  /** Survives the Az level. */
  high: boolean;
  /** NPC / enemy line: subject to WORLD_GAP and off on Az. */
  world: boolean;
  /** Cooldown of `key` in seconds. */
  cd: number;
}

/**
 * Pure bark bookkeeping: cooldowns, the global gaps and the non-repeating pick. Times are seconds on any clock the caller uses.
 * `take()` returns the line to say now (and records it), or null when muted, cooling down or with an empty pool.
 */
export class BarkPicker {
  private lastPick = new Map<string, string>();
  private lastKey = new Map<string, number>();
  private lastPlayer = -Infinity;
  private lastWorld = -Infinity;

  constructor(private readonly rng: () => number = Math.random) {}

  take(req: BarkRequest, now: number, level: BarkLevel, poolKey: string = req.key): string | null {
    if (level === 'off' || req.pool.length === 0) return null;
    if (level === 'few' && (!req.high || req.world)) return null;
    const cd = req.cd * (level === 'few' ? FEW_MUL : 1);
    if (now - (this.lastKey.get(req.key) ?? -Infinity) < cd) return null;
    if (req.world) {
      if (now - this.lastWorld < WORLD_GAP) return null;
    } else if (now - this.lastPlayer < PLAYER_GAP) return null;
    const line = this.next(poolKey, req.pool);
    this.lastKey.set(req.key, now);
    if (req.world) this.lastWorld = now;
    else this.lastPlayer = now;
    return line;
  }

  /** A line from `pool` that differs from the last one picked from the same pool key. */
  next(poolKey: string, pool: string[]): string {
    const prev = this.lastPick.get(poolKey);
    const cands = pool.length > 1 ? pool.filter((l) => l !== prev) : pool;
    const line = cands[Math.min(cands.length - 1, Math.floor(this.rng() * cands.length))];
    this.lastPick.set(poolKey, line);
    return line;
  }
}

/** Placeholders of the data lines: {name} (zone or dungeon), {family} (creature family). */
export function fillLine(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export interface BarkService {
  /** Per frame: idle in town, combat re-arm. */
  update(dt: number): void;
  /** The line a town NPC speaks on the walk-by (its own lines first, else the role's). null = silent now. */
  npcLine(id: string, role: TownNpcRole, own: string[]): string | null;
  /** The faint italic 'Söylenti' chat line. */
  rumor(from: string, text: string): void;
  /**
   * An ambient world line (NPC walk-by, enemy aggro / death) heard `dist` metres from the player: the chat line only within
   * AMBIENT_CHAT_M, and the same text at most once per AMBIENT_DEDUPE_SEC. The bubble is drawn by the caller.
   */
  ambient(from: string, text: string, dist: number): void;
  dispose(): void;
}

/** The part of an entity the bark code reads (enemies and the player have these). */
interface Speaker {
  def?: EnemyDef;
  height?: number;
  object3d?: Object3D;
}

/** Elites and mini-bosses always get lines here. A boss with a phase / intro / death yell table keeps its own voice (BossController). */
function hasWorldLines(def: EnemyDef): boolean {
  if (def.rank === 'elite' || def.rank === 'miniboss') return true;
  if (def.rank !== 'boss') return false;
  const b = def as Partial<BossDef>;
  return !(b.phases?.length || b.introYell || b.deathYell);
}

/**
 * Wires the bark rules to the game events. Created by Game.ts createServices (G.barks); `update` runs per frame.
 * `rng` is injectable for the headless sim.
 */
export function installBarks(rng: () => number = Math.random): BarkService {
  const ev = G.events;
  const picker = new BarkPicker(rng);
  const offs: (() => void)[] = [];
  let t = 0;
  let armed = true;
  let lastHurt = -Infinity;
  let scene: string | null = null;
  let anchor: { x: number; z: number } | null = null;
  let idle = 0;

  const level = (): BarkLevel => G.settings?.data.characterBarks ?? 'on';
  const rumor = (from: string, text: string): void => {
    G.ui?.hud?.chat?.addRumor(from, text);
  };
  const ambientPrinted = new Map<string, number>();
  const ambient = (from: string, text: string, dist: number): void => {
    if (!(dist <= AMBIENT_CHAT_M)) return;
    const last = ambientPrinted.get(text) ?? -Infinity;
    if (t - last < AMBIENT_DEDUPE_SEC) return;
    ambientPrinted.set(text, t);
    rumor(from, text);
  };
  /** Once per character: the flag is written when the event happens, whether or not the line is heard. */
  const firstTime = (key: string): boolean => {
    const save = G.character?.save;
    if (!save) return false;
    save.flags ??= {};
    if (save.flags[key]) return false;
    save.flags[key] = true;
    return true;
  };

  const playerBark = (trigger: BarkTrigger, vars: Record<string, string> = {}): void => {
    const rule = RULES[trigger];
    const cls = G.character?.save.classId;
    const own = cls ? CLASS_LINES[cls]?.[trigger] : undefined;
    const raw = picker.take(
      { key: trigger, pool: own ?? PLAYER_LINES[trigger], high: rule.high, world: false, cd: rule.cd },
      t,
      level(),
      own && cls ? `${trigger}:${cls}` : trigger,
    );
    if (!raw) return;
    const text = fillLine(raw, vars);
    const p = G.player;
    if (p?.object3d) G.ui?.say(p.object3d, { kind: 'say', text, own: true, offsetY: (p.height ?? 2) + 0.5 });
    // our own line is a say line in the chat (not a rumour): "<name> diyor: ..." in Genel
    G.ui?.hud?.chat?.addBark(G.character?.save.name ?? 'Sen', text);
  };

  const worldSpeak = (e: Speaker, def: EnemyDef, key: string, pool: string[], poolKey: string): void => {
    const text = picker.take({ key: `${key}:${def.id}`, pool, high: false, world: true, cd: ENEMY_CD }, t, level(), poolKey);
    if (!text) return;
    if (e.object3d) G.ui?.say(e.object3d, { kind: 'npc', text, name: def.name, color: '#ff9a7a', seconds: 4.5, offsetY: (e.height ?? 2) + 1.2 });
    const pp = G.player?.position;
    const ep = e.object3d?.position;
    ambient(def.name, text, pp && ep ? Math.hypot(pp.x - ep.x, pp.z - ep.z) : 0);
  };

  const isPlayer = (id: number | string | null | undefined): boolean => !!G.player && id === G.player.id;
  const entity = (id: number): Speaker | undefined => G.world?.entities.get(id) as Speaker | undefined;

  offs.push(
    ev.on('player:levelup', () => playerBark('levelup')),
    ev.on('region:entered', ({ id, name }) => {
      if (firstTime(`bark.zone.${id}`)) playerBark('zone', { name });
    }),
    ev.on('run:started', ({ state }) => {
      const id = state.dungeonId;
      if (firstTime(`bark.dun.${id}`)) playerBark('dungeon', { name: DUNGEONS[id]?.name ?? id });
    }),
    ev.on('loot:pickedUp', ({ item }) => {
      if (item?.rarity === 'rare') playerBark('loot_rare');
      else if (item?.rarity === 'epic' || item?.rarity === 'legendary') playerBark('loot_epic');
    }),
    ev.on('boss:defeated', () => playerBark('boss_kill')),
    ev.on('death', ({ entityId, killerId }) => {
      if (!isPlayer(killerId)) return;
      const e = entity(entityId);
      const def = e?.def;
      if (!e || !def) return;
      if (def.family && firstTime(`bark.fam.${def.family}`)) {
        const family = FAMILY_NAMES[def.family];
        if (family) playerBark('family', { family });
      }
      if (hasWorldLines(def)) worldSpeak(e, def, 'death', ENEMY_DEATH_LINES, 'enemy_death');
    }),
    ev.on('enemy:aggro', ({ enemyId, targetId }) => {
      if (!isPlayer(targetId)) return;
      const e = entity(enemyId);
      const def = e?.def;
      if (!e || !def || !hasWorldLines(def)) return;
      worldSpeak(e, def, 'aggro', RARE_AGGRO_LINES[def.id] ?? ENEMY_AGGRO_LINES, 'enemy_aggro');
    }),
    ev.on('damage', ({ targetId }) => {
      if (isPlayer(targetId)) lastHurt = t;
    }),
    ev.on('player:resources', ({ hp, maxHp }) => {
      if (!(maxHp > 0)) return;
      const r = hp / maxHp;
      if (r >= REARM_HP) armed = true;
      if (armed && r > 0 && r < LOW_HP) {
        armed = false;
        playerBark('low_hp');
      }
    }),
    ev.on('player:revived', ({ local }) => {
      if (!local) return;
      armed = true;
      playerBark('resurrect');
    }),
    ev.on('quest:updated', ({ state }) => {
      if (state === 'done') playerBark('quest_done');
    }),
    ev.on('achievement:unlocked', () => playerBark('achievement')),
    ev.on('player:mounted', ({ on }) => {
      if (on) playerBark('mount');
    }),
    ev.on('pvp:flag', ({ on }) => {
      if (on) playerBark('pvp_zone');
    }),
    ev.on('arena:result', ({ won }) => {
      if (won === true) playerBark('arena_win');
    }),
    ev.on('scene:changed', ({ to }) => {
      scene = to;
      anchor = null;
      idle = 0;
    }),
  );

  return {
    update(dt: number): void {
      t += dt;
      const p = G.player;
      if (!armed && t - lastHurt > OUT_OF_COMBAT) armed = true;
      if (scene !== 'town' || !p) {
        anchor = null;
        idle = 0;
        return;
      }
      const x = p.position.x;
      const z = p.position.z;
      if (!anchor || Math.hypot(x - anchor.x, z - anchor.z) > IDLE_RADIUS) {
        anchor = { x, z };
        idle = 0;
        return;
      }
      idle += dt;
      if (idle >= IDLE_SEC) {
        idle = 0;
        playerBark('idle_town');
      }
    },
    npcLine(id: string, role: TownNpcRole, own: string[]): string | null {
      if (level() !== 'on') return null;
      const pool = own.length ? own : (ROLE_LINES[role] ?? []);
      if (!pool.length) return null;
      return picker.next(`npc:${own.length ? id : role}`, pool);
    },
    rumor,
    ambient,
    dispose(): void {
      for (const off of offs) off();
    },
  };
}
