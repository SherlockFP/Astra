import type { Engine } from '../core/Engine';
import type { EventBus } from '../core/EventBus';
import type { Input } from '../core/Input';
import type { Assets } from '../core/Assets';
import type { Settings } from '../core/Settings';
import type { Save } from '../core/Save';
import type { SceneManager } from '../core/SceneManager';
import type { Audio } from '../audio/Audio';
import type { VFX } from '../vfx/VFX';
import type { UI } from '../ui/UI';
import type { NetSession } from '../net/NetSession';
import type { Combat } from '../combat/Combat';
import type { SkillSystem } from '../combat/SkillSystem';
import type { Minions } from '../combat/Minions';
import type { HitShapes } from '../combat/HitShapes';
import type { LootSystem } from '../systems/LootSystem';
import type { Progression } from '../systems/Progression';
import type { MythicPlus } from '../systems/MythicPlus';
import type { QuestSystem } from '../systems/Quests';
import type { TalentSystem } from '../systems/Talents';
import type { Professions } from '../systems/Professions';
import type { PresenceApi } from '../systems/Social';
import type { Guild } from '../systems/Guild';
import type { ArenaLadder } from '../systems/ArenaLadder';
import type { ProcEngine } from '../combat/Procs';
import type { Auras } from '../combat/Auras';
import type { Corpses } from '../combat/Corpses';
import type { CharacterState } from '../systems/CharacterState';
import type { World } from '../world/World';
import type { Player } from '../entities/Player';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';

/**
 * Global service locator. Every module imports `G` and uses the services directly:
 *   G.events.emit('ui:toast', { text: 'Merhaba' }); G.vfx.spawn('hit_spark', pos);
 * Service fields are assigned once in game/Game.ts before any scene runs.
 * Scene-scoped fields (world, player, camera) are null outside town/dungeon.
 * `character` is the selected character (null in the main menu).
 * This file only has type imports, so importing it never creates runtime cycles.
 */
export interface Services {
  engine: Engine;
  events: EventBus;
  input: Input;
  assets: Assets;
  settings: Settings;
  save: Save;
  scenes: SceneManager;
  audio: Audio;
  vfx: VFX;
  ui: UI;
  net: NetSession;
  combat: Combat;
  skills: SkillSystem;
  /** GDD_CLASSES_V2 §1.5 (NC41): minion / pet / summon manager (caps, summon, commands, respawn). Ticked from Game.ts. */
  minions: Minions;
  hitShapes: HitShapes;
  loot: LootSystem;
  progression: Progression;
  mplus: MythicPlus;
  /** Open-world quests (systems/Quests.ts). Created by Game.ts once WP4 lands; until then it is undefined at runtime (nothing reads it yet). */
  quests: QuestSystem;
  /** GDD_TALENTS (T0): WoW trees, spec choice, loadouts, passive web, skill mastery (systems/Talents.ts). Stub until T5. */
  talents?: TalentSystem;
  /** GDD_TALENTS (T0): proc engine for talent procs and triggers (combat/Procs.ts). Stub until T4. */
  procs?: ProcEngine;
  /** GDD_CLASSES_V2 NC46: party auras (combat/Auras.ts). Created by Game.ts with the combat services. */
  auras?: Auras;
  /** GDD_CLASSES_V2 NC45: corpse registry (combat/Corpses.ts). Filled by Combat.finalizeDeath on every peer, ticked from Game.ts. Optional so sims without it keep working. */
  corpses?: Corpses;
  /** GDD_LIFE (L-00): gathering and crafting service (systems/Professions.ts). Stub until L-05; created by Game.ts then. */
  professions?: Professions;
  /** Social (systems/Social.ts): online players on the global lobby (list / count / find). Created by Game.ts; undefined in sims. */
  presence?: PresenceApi;
  /** WP-05 Lonca (systems/Guild.ts): guild roster, ranks, invites, guild chat; `G.guild.tagOf(peerName)` = guild tag. Created by Game.ts; undefined in sims. */
  guild?: Guild;
  /** GDD_PVP_FINDER §3.4 (systems/ArenaLadder.ts, installed by systems/ArenaInstall.ts): bracket ratings, MMR, season, tiers, weekly Fetih, queue lock. Undefined in sims. */
  arenaLadder?: ArenaLadder;
  character: CharacterState | null;
  world: World | null;
  player: Player | null;
  camera: ThirdPersonCamera | null;
  /** Debug flags toggled from the console: G.debug.nav = true */
  debug: Record<string, boolean>;
}

export const G: Services = { character: null, world: null, player: null, camera: null, debug: {} } as unknown as Services;

if (typeof window !== 'undefined') (window as unknown as { G: Services }).G = G;
