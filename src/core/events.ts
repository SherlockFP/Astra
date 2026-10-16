import type { DamageType, EntityId, PipId, Rarity, SceneId } from '../types/common';
import type { EnemyRank } from '../types/enemies';
import type { ItemInstance } from '../types/items';
import type { RunState, RunRecord } from '../types/mythic';
import type { DamageNumberKind } from '../types/vfx';
import type { SpecId } from '../types/v2';
import type { ChatAnn } from '../types/itemsV2';
import type { ChatChannel, ChatLink } from '../types/net';
import type { DeathRecap } from '../types/deathLog';
import type { StatusId } from '../types/skills';
import type { StatusRemoveReason } from '../data/statuses';

/**
 * Every game-wide event and its payload. Emit with G.events.emit('name', payload).
 * Events are LOCAL (this browser). Networked effects are turned into local events by net/Replication.
 * Add new events here (append only) when a module needs one; keep payloads plain data.
 */
export interface GameEvents {
  // scene / flow
  'scene:changed': { from: SceneId | null; to: SceneId };
  /** Emitted BEFORE the old scene's exit(): services clear scene-scoped state (vfx, loot drops, hitShapes, casts, run). */
  'scene:leaving': { from: SceneId | null; to: SceneId };
  'loading:progress': { loaded: number; total: number; label?: string };
  'game:paused': { paused: boolean };

  // combat
  'damage': { targetId: EntityId; sourceId: EntityId | null; amount: number; crit: boolean; type: DamageType; kind: DamageNumberKind; pos: [number, number, number]; skillId?: string; overkill?: number; /** GDD_V2 §7.3: ZAYIF! (weak) and Dirençli (resisted) flags */ weak?: boolean; resisted?: boolean };
  'heal': { targetId: EntityId; sourceId: EntityId | null; amount: number; pos: [number, number, number] };
  'death': { entityId: EntityId; killerId: EntityId | null; pos: [number, number, number] };
  'player:died': { entityId: EntityId; local: boolean };
  'player:revived': { entityId: EntityId; local: boolean };
  /** Death panel 'Ruhunu Serbest Bırak' clicked: the active scene teleports + revives the local player. */
  'player:releaseRequested': Record<string, never>;
  'skill:cast': { casterId: EntityId; skillId: string; castTime: number };
  'skill:castInterrupted': { casterId: EntityId; skillId: string };
  /** COMBAT_WOW CW-01: `remaining` (seconds) is set on 'cooldown'; 'lockout' = the school is locked by an interrupt (skill:lockout). */
  'skill:fail': { reason: 'cooldown' | 'resource' | 'range' | 'target' | 'stunned' | 'casting' | 'silenced' | 'lockout' | 'moving' | 'facing' | 'los'; remaining?: number };
  'status:applied': { targetId: EntityId; status: string; duration: number; stacks: number };
  'status:removed': { targetId: EntityId; status: string; reason?: StatusRemoveReason };
  'target:changed': { targetId: EntityId | null };
  'enemy:aggro': { enemyId: EntityId; targetId: EntityId };
  'enemy:castStart': { enemyId: EntityId; abilityId: string; name: string; castTime: number; interruptible: boolean };
  /** interruptedBy: the player (or enemy) whose stun / interrupt / strong hit / knockback cut the cast short (optional, interrupts only). */
  'enemy:castEnd': { enemyId: EntityId; abilityId: string; interrupted: boolean; interruptedBy?: EntityId };
  'boss:engaged': { bossId: string; entityId: EntityId };
  'boss:phase': { bossId: string; entityId: EntityId; phase: string };
  'boss:yell': { bossId: string; text: string };
  'boss:defeated': { bossId: string; entityId: EntityId };
  'boss:wipe': { bossId: string };
  'camera:shake': { intensity: number; duration: number };
  /** Local player's hit-combo counter (hits within ~2 s); tier 0..4 drives HUD style and the small damage bonus. */
  'combo:changed': { count: number; tier: number };
  'hitstop': { ms: number };
  /** Rogue combo points (Kombo Puanı) changed — HUD shows 5 pips under the resource bar. */
  'combopoints:changed': { points: number; max: number };
  /** Local player perfect-dodged a hit (Kusursuz Kaçış): PlayerController refunds 50% of a dodge charge. */
  'player:perfectDodge': Record<string, never>;
  /** Ground-targeted skill preview (key held) started / ended (cast=true if it was cast, false if cancelled). */
  'skill:aimStart': { skillId: string };
  'skill:aimEnd': { skillId: string; cast: boolean };

  // character / progression (local player)
  'player:xp': { gained: number; xp: number; level: number; needed: number };
  'player:levelup': { level: number };
  'player:gold': { gold: number; delta: number };
  'player:stats': Record<string, never>;          // final stats recomputed
  'player:resources': { hp: number; maxHp: number; res: number; maxRes: number };
  'inventory:changed': Record<string, never>;
  'equipment:changed': { slot: string };
  'materials:changed': Record<string, never>;
  'talents:changed': Record<string, never>;
  'skillbar:changed': Record<string, never>;
  /** Yetenek Puanı earned or spent / refunded (SkillsPanel, micro-menu badge). */
  'skillpoints:changed': Record<string, never>;
  /** GDD_ITEMS_V2 §A (IT-00): `outcome` (stay / success / down1 / down3 / destroy / break / protected / pity), stacks before / after are optional additions. */
  'item:upgraded': { item: ItemInstance; success: boolean; destroyed: boolean; newLevel: number; outcome?: string; stacksBefore?: number; stacksAfter?: number };

  // loot
  'loot:dropped': { uid: string; rarity: Rarity; pos: [number, number, number]; gold?: number };
  'loot:pickedUp': { item?: ItemInstance; gold?: number; material?: { id: string; count: number }; globe?: boolean };

  // mythic+ / dungeon run
  'run:started': { state: RunState };
  'run:updated': { state: RunState };
  'run:countdown': { seconds: number };
  'run:forces': { forces: number; required: number; gained: number };
  'run:playerDeath': { deaths: number; penalty: number };
  'run:completed': { state: RunState; record: RunRecord | null; rewards: ItemInstance[] };
  'keystone:changed': Record<string, never>;
  /** items module: daily bounty progress/claim changed. */
  'bounty:changed': Record<string, never>;
  /** items module: consumable/elixir buffs changed (id list in G.character.save.flags). */
  'elixir:changed': Record<string, never>;

  // interaction / ui
  'interact:prompt': { text: string | null; key?: string };
  'ui:toast': { text: string; kind?: 'info' | 'success' | 'warning' | 'error' | 'loot' | 'levelup' | 'boss' };
  'ui:panel': { panel: string; open: boolean };
  'ui:openPanel': { panel: string; data?: unknown };   // request UI to open a panel (e.g. from an NPC)
  'ui:closePanels': Record<string, never>;
  'ui:zoneName': { title: string; subtitle?: string };
  'settings:changed': { key: string };

  // network / party
  'net:status': { role: 'offline' | 'host' | 'client'; connected: boolean; roomId: string | null };
  'net:peerJoined': { peerId: string; name: string };
  'net:peerLeft': { peerId: string; name: string };
  /** Public channels (net/Channels.ts): the room has a new host (host migration or split-brain merge); `self` = this peer is it. */
  'net:hostChanged': { hostId: string; self: boolean };
  /** GDD_LIFE §3.8 (L-00): `channel` widened (old `party` / `system` lines unchanged). `to` = whisper target name, `links` ≤ 2. */
  'net:chat': { from: string; text: string; channel: ChatChannel; to?: string; links?: ChatLink[] };
  'net:rooms': Record<string, never>;            // room browser list updated
  /** Social (systems/Social.ts): the online-player list (G.presence.list()) changed; `count` includes the local player. */
  'presence:changed': { count: number };
  /** WP-05 Lonca (systems/Guild.ts): the guild state, roster, a pending invite or the chat key changed (panel refresh). */
  'guild:changed': Record<string, never>;
  'party:changed': Record<string, never>;
  'party:readyCheck': { active: boolean };
  /** Host: every party member finished loading the current scene. */
  'party:allLoaded': Record<string, never>;

  // open world (GDD_OPENWORLD §9.1, append-only)
  'world:regionEntered': { regionId: string; name: string; first: boolean };
  'world:announce': { text: string; kind: 'metin' | 'boss' | 'rare' | 'info' };
  'world:metinChanged': { id: string; tierId: string; pos: [number, number]; active: boolean };
  /** WP-04 event calendar (scenes/world/EventCalendar.ts): `soon` 5 and 1 min before, `start`, `end`. `at` = the scheduled start (soon, start) or the end (end); `zone` = the site id. */
  'world:event': { id: 'metin_storm' | 'world_boss' | 'village_raid' | 'goblin_caravan'; phase: 'soon' | 'start' | 'end'; at: number; zone: string };
  'waypoint:discovered': { id: string };
  'quest:updated': { questId: string; state: 'available' | 'active' | 'ready' | 'done'; progress?: number };

  // ---- GDD_V2 (WP1 contracts, append-only). Emitted by combat/AI/systems; feedback modules subscribe to them.
  /** Successful parry (Savuşturma). `perfect` = inside the base 0.20 s window (GDD_V2 §3.5). */
  'parry': { enemyId: EntityId; perfect: boolean };
  /** Karşı Vuruş (riposte) window used on this target. */
  'riposte': { targetId: EntityId };
  /** Enemy poise broken (Duruş Kırılması, GDD_V2 §3.7). */
  'poise:break': { enemyId: EntityId };
  /** Kritik Vuruş finisher landed. */
  'crit:finisher': { targetId: EntityId; damage: number };
  /** Local guard gauge reached 0 (Siper Kırıldı). */
  'guard:broke': Record<string, never>;
  /** Threat table of one enemy changed (GDD_V2 §1.4). `topId` = current top target. */
  'threat:update': { enemyId: EntityId; topId: EntityId | null; table: [EntityId, number][] };
  /** A kick (Kes) is requested on this enemy cast (GDD_V2 §3.8 / §8.4). */
  'kick:request': { enemyId: EntityId; casterId: EntityId };
  /** A 45 / 90 / 180 s major cooldown was used (GDD_V2 §2). */
  'major:used': { casterId: EntityId; skillId: string; slot: 'm45' | 'm90' | 'm180' };
  /** A hero effect (Kurt Narası family) was cast; `duration` in seconds (GDD_V2 §2.1). */
  'hero:cast': { casterId: EntityId; skillId: string; duration: number };
  /** A flask was drunk from belt slot `slot` (1..5). */
  'flask:used': { slot: number; baseId: string; charges: number };
  /** A party member changed spec (GDD_V2 §1). */
  'spec:changed': { entityId: EntityId; spec: SpecId };
  /** A ZAYIF! hit landed (GDD_V2 §7.3). `stacks` = attacker's Sömürü stacks after the hit. */
  'weakness:hit': { targetId: EntityId; sourceId: EntityId | null; type: DamageType; stacks: number };
  /** Run ended: each peer reports its meters once (GDD_V2 §8.10, combat/meters.ts). */
  'run:recap': {
    dungeonId: string;
    players: { id: EntityId; damage: number; effectiveHeal: number; overheal: number; taken: number; kicks: number; kicksMissed: number; deaths: number; dispels: number; absorbed: number }[];
    route: { pulls: number; avgPullForces: number; avgPullSec: number; longestIdleSec: number };
  };
  /** Camera punch: fov delta in degrees, attack-in and recover-out times in seconds (GDD_V2 §2.3 / §3.11). */
  'camera:punch': { fov: number; in: number; out: number };
  /** A combo route (ROTA, GDD_V2 §3.9) was completed by the LOCAL player: HUD banner "ROTA: <name>". `tier` = combo tier after the bonus. */
  'combo:route': { id: string; name: string; tier: number };

  // ---- GDD_CLASSES_V2 (NC01, append-only). Emitted by combat (pips, minions, corpses); feedback modules subscribe.
  /** A secondary pip counter (Çi, Kutsal Güç, Ruh Parçası, Kombo) changed on the LOCAL player (HUD PipBar). */
  'pips:changed': { id: PipId; points: number; max: number };
  /** NC46 (Auras): the LOCAL player's active party aura changed (`status` null = off). Auras.ts emits it on every change. */
  'aura:changed': { playerId: EntityId; status: StatusId | null };
  /** A minion / pet / summon entered the world. */
  'minion:spawned': { id: EntityId; defId: string; ownerId: EntityId };
  /** A minion died (hp <= 0): death vfx and the skeleton corpse hook (GDD_CLASSES_V2 §1.5 rule 3). */
  'minion:died': { id: EntityId; defId: string; ownerId: EntityId; pos: [number, number, number] };
  /** A minion was removed without dying: timed expiry, group cap (oldest despawned), owner gone, scene change. */
  'minion:despawned': { id: EntityId; defId: string; ownerId: EntityId; reason: 'expired' | 'cap' | 'owner' | 'scene' };
  /** The owner issued a minion command (combat/Minions focus / recall; behaviour minion_command). */
  'minion:command': { ownerId: EntityId; command: 'focus' | 'recall'; targetId: EntityId | null };
  /** A corpse was registered (combat/Corpses.ts, GDD_CLASSES_V2 §1.6). */
  'corpse:added': { id: number; x: number; z: number; defId: string; rank: EnemyRank; level: number };
  /** A corpse left the registry: consumed by a skill, expired, or cleared on scene change. */
  'corpse:removed': { id: number; x: number; z: number; reason: 'consumed' | 'expired' | 'cleared' };

  // ---- GDD_TALENTS (T0, append-only; Appendix B). Emitted by systems/Talents.ts, systems/SkillMastery.ts, the passive web.
  // NOTE: the Appendix B row `spec:changed { specId, prev }` is NOT added here: `spec:changed` already exists (GDD_V2) with
  // `{ entityId, spec }`, and existing members must not change. TalentSystem.setSpec emits the existing payload.
  /** A talent build was committed (Uygula): `wow` = class/spec trees, `web` = passive web (clears the draft in TalentsPanel). */
  'talents:committed': { kind: 'wow' | 'web' };
  /** A saved loadout of a spec was created, renamed, deleted or activated (Dialogs). */
  'loadout:changed': { specId: string };
  /** Skill mastery (Ustalık) crossed a rank threshold on this skill (toast + SkillSpecView). */
  'skillmastery:changed': { skillId: string; rank: number };
  /** Passive masteries / jewels changed (WebView redraw). */
  'passives:changed': Record<string, never>;

  // ---- GDD_ITEMS_V2 (IT-00, append-only). Emitted by systems/Upgrade, Crafting, panels and scenes/Camping + Housing.
  /** One upgrade attempt resolved (Basma Günlüğü, ceremony). `res`: 0 stay, 1 success, 2 down, 3 destroyed / Kırık, 4 protected, 5 pity. */
  'upgrade:attempt': { uid: string; target: number; res: 0 | 1 | 2 | 3 | 4 | 5; chance: number };
  /** A +12 … +15 success or a Ustalık rank-5 result: the announcement (chat line, HUD banner, avatar vfx). */
  'upgrade:announce': { from: string; ann: ChatAnn };
  /** Efsun slots of an item changed (any layer: Nesnesi, Kaos, Tezgâh, Özel, Kader, Kazıma). `slot` = 6 or 7 when a bonus slot changed. */
  'efsun:changed': { uid: string; slot?: number };
  /** A camp was placed at (x, z) by the local player (GDD_ITEMS_V2 §5.1). */
  'camp:placed': { x: number; z: number };
  /** The local camp's fuel ran out or it was removed (props + smoke puff). */
  'camp:expired': Record<string, never>;
  /** The local player entered a house interior of `owner` (entity id). */
  'home:entered': { owner: number };
  /** The local player left a house interior. */
  'home:left': Record<string, never>;

  // ---- GDD_LIFE (L-00, append-only). Emitted by gathering, crafting, RegionTracker, camera, chat and PvP systems.
  /** Hold-F progress of an interaction (HUD GatherBar), t01 = 0..1 (GDD_LIFE §1.6). */
  'gather:progress': { id: number; t01: number; label: string; color: string; tag?: string; tagColor?: string };
  /** A hold interaction completed (`ok` true: `interact()` was called at t01 >= 1; false: the node refused the result). */
  'gather:done': { id: number; ok: boolean };
  /** A profession skill went up (GDD_LIFE §1.3). */
  'profession:skillUp': { prof: string; skill: number };
  /** A craft batch finished (GDD_LIFE §1.11). */
  'craft:done': { recipeId: string; count: number };
  /** The local player entered a map region (GDD_LIFE §2.1, scenes/RegionTracker). */
  'region:entered': { id: string; name: string; subtitle: string; levelRange: [number, number]; danger: number };
  /** The local player left a map region. */
  'region:left': { id: string };
  /** Directional camera kick: world-space direction (dx, dz) and amount (GDD_LIFE §4.11). */
  'camera:kick': { dx: number; dz: number; amount: number };
  /** FOV kick in degrees, added to the FOV spring (GDD_LIFE §4.10). */
  'camera:fov': { deg: number };
  /** Shift-click on an item: the chat input inserts a link token (GDD_LIFE §3.5). */
  'chat:insertLink': { item: ItemInstance };
  /** PvP flag changed (GDD_LIFE §7.2). `zone` = flagged by a PvP zone rather than the toggle. */
  'pvp:flag': { on: boolean; zone: boolean };
  /** Duel state machine step (GDD_LIFE §7.3). `with` = opponent peer id when known. */
  'pvp:duel': { state: 'invited' | 'accepted' | 'declined' | 'started' | 'ended'; with?: string; winner?: string };
  /** Honor (Onur) gained (GDD_LIFE §7.7): amount added, new total, rank index. */
  'pvp:honor': { amount: number; total: number; rank: number };
  // ---- GDD_PVP_FINDER §6 (PV-00, append-only): matchmaking queue + arena match + rating.
  /** The local ARENA queue changed (QueueState phase / pool) or produced a notice (found, declined, timeout, joinFail, cooldown). The older 'finder:queue' below belongs to the Zindan Bulucu UI. */
  'arena:queue': { state: import('../types/finder').QueueState; key: import('../types/finder').QueueKey | null; notice?: import('../types/finder').QueueNotice };
  /** Arena phase change (every peer): prep / live / round_end / match_end, the round (1..), seconds left in the phase and the round score [A, B]. */
  'arena:phase': { ph: 'prep' | 'live' | 'round_end' | 'match_end'; round: number; left: number; score: [number, number]; rw?: 'A' | 'B' | 'draw' };
  /** Dampening (Yıpranma) percentage changed (1 Hz while live). */
  'arena:damp': { pct: number };
  /** A fighter fell (arena:out). `local` = the local player. */
  'arena:out': { peer: string; name: string; team: 'A' | 'B'; local: boolean };
  /** The match is over: winner team, whether the local team won, reason, local rating change and rewards (ranked only change rating). */
  'arena:result': {
    winner: 'A' | 'B' | 'draw'; won: boolean | null; why: 'normal' | 'forfeit' | 'draw' | 'void'; score: [number, number];
    bracket: import('../types/finder').ArenaBracket; ranked: boolean;
    rating: { before: number; after: number; delta: number } | null;
    rewards: { onur: number; fetih: number; muhru: number };
  };
  /** A bracket rating changed (ranked result applied / season soft reset). */
  'pvp:rating': { bracket: import('../types/finder').ArenaBracket; before: number; after: number };

  // ---- combat (append-only). Emitted by Combat on the LOCAL player's death; the death panel's "Ölüm Özeti" tab reads it.
  /** Death recap of the local player (GDD_V2 §8.5): last 10 s of hits and heals, the killing blow, top sources. */
  'death:recap': DeathRecap;

  // ---- COMBAT_WOW (CW-01, append-only). Emitted by the skill loop (procs, queue, pushback, lockout); feedback modules subscribe.
  /** A proc (ProcDef `id`, e.g. Sıcak Seri) was gained by the LOCAL player (spell alert, glow, sfx). */
  'proc:gain': { id: string; status: StatusId; duration: number; stacks: number };
  /** The proc ended: `consumed` = removed early (> 0.3 s left, spent by a cast), `false` = it ran out. */
  'proc:fade': { id: string; consumed: boolean };
  /** A skill or LMB was pressed during a cast / GCD and waits in the spell queue. Both `null` = the queue was cleared. */
  'skill:queued': { skillId: string | null; slot: string | null };
  /** A hit pushed the LOCAL player's cast back by `add` seconds; `count` = pushbacks so far in this cast. */
  'cast:pushback': { skillId: string; add: number; count: number };
  /** An interrupt locked a school for `sec` seconds on the LOCAL player (skills of that school fail with 'lockout'). */
  'skill:lockout': { school: DamageType; sec: number };
  /** A skill's cooldown finished (majors always, others for the glow / sfx). */
  'skill:ready': { skillId: string; major: boolean };
  /** The burst window (≥ 2 offensive major statuses up) opened or closed: PATLAMA! banner and edge vignette. */
  'burst:window': { active: boolean };

  // ---- GDD_CLASSES / CORE_MECHANICS §3 (CM1, append-only). Party buff set of the LOCAL party view.
  /** `active`: buff ids applied to the party with their source; `missing`: buff ids no member provides (Group Finder hint). */
  'party:buffs': { active: { id: string; sourceId: EntityId }[]; missing: string[] };

  // ---- UI_REDESIGN Appendix A (UX-00, append-only). HUD chat bubbles, Group Finder state, objective pin.
  /** A chat line was added locally (incoming or own). `local` = typed on this client. Speech bubbles and the chat tabs listen. */
  'chat:line': { from: string; text: string; channel: ChatChannel; local: boolean };
  /** WP-13: Shift+click on an item in a bag / equipment slot asks the chat input for an item link. */
  'chat:linkItem': { item: ItemInstance };
  /** Group Finder state step (drives the minimap eye and the finder panel). */
  'finder:queue': { state: 'idle' | 'listing' | 'proposal' | 'entering' | 'inrun' | 'failed'; dungeonId?: string; since?: number };
  /** The pinned quest changed (`null` = unpinned). The objective arrow follows it. */
  'quest:pinned': { questId: string | null };

  // ---- CONTROLS_WOW §8 (W2-A, append-only). Local auto-attack state, emitted on change (HUD Oto frame, swing sweep).
  'autoattack:state': { armed: boolean; targetId: number | null };

  // ---- CM14 Pazar (CORE_MECHANICS §11, append-only). Emitted by systems/Market.ts; the Pazar panels and world/MarketStalls listen.
  /** Something in the market changed: the announced stalls ('stalls'), the local shop ('own'), the sales log ('sales') or a purchase ('tx'). */
  'market:changed': { what: 'stalls' | 'own' | 'sales' | 'tx' };
  /** The local stall sold an item (toast + overlay log). */
  'market:sale': { name: string; price: number; net: number; buyer?: string };
  /** "Göster" in Pazar Arama: a beam over the stall + a map pin. `null` clears the pin. */
  'market:pin': { zone: string; x: number; z: number; label: string; sellerId: string } | null;
  /** Pazarcı Modu (AFK stall mode: ~2 fps render, audio muted, sales overlay) turned on or off. */
  'market:mode': { on: boolean };

  // ---- HUD click-to-select (append-only). Emitted by the HUD (target-of-target, nameplates); PlayerController must subscribe and
  // run its selectEnemy(entity) (+ armAuto when `attack`, like a right click in WoW). The HUD never mutates the selection itself.
  /** The player clicked a unit in the HUD: select it. `attack` = right click (select and arm the auto-attack, WoW). */
  'target:select': { entityId: EntityId; attack?: boolean };
  // ---- Binek (WoW ground mount, append-only). Local player only; emitted by game/Mount.ts.
  /** The local player mounted (`on: true`) or dismounted. */
  'player:mounted': { on: boolean };
  /** KIT Druid (combat/Forms.ts): the local player entered (`form` = id) or left (null) a shapeshift form. */
  'form:changed': { casterId: EntityId; form: string | null };

  // ---- WP-08 achievements (append-only). Emitted by systems/Achievements.ts once per unlock; the achievements panel listens.
  /** An achievement was unlocked by the LOCAL character (`title` = the title it grants, if any). */
  'achievement:unlocked': { id: string; name: string; points: number; title?: string };
  /** WP-12: the summoned pet of the local character changed (null = dismissed). Game/Pet.ts rebuilds the follower. */
  'pet:changed': { id: string | null };
}

export type GameEventName = keyof GameEvents;
