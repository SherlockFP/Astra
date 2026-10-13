import type { ClassId, DamageType, EntityId, Rarity, SceneId } from './common';
import type { KeystoneData, ItemInstance, EquipSlot } from './items';
import type { RunState } from './mythic';
import type { AimInfo, StatusApply, StatusId } from './skills';
import type { PlayerSyncState } from '../entities/Player';
import type { EnemySyncState } from '../entities/Enemy';
import type { HitShapeSpec } from '../combat/HitShapes';
import type { SpecId } from './v2';
import type { MinionSync } from './minions';
import type { StatBlock } from './stats';
import type { CampMsg, ChatAnn, HomeMsg } from './itemsV2';

/** GDD_LIFE §3.1 (L-00): chat channel of a `net:chat` line. `party` and `system` are the original two. */
export type ChatChannel = 'party' | 'system' | 'say' | 'yell' | 'whisper' | 'global' | 'trade' | 'emote' | 'boss' | 'loot';

/** GDD_LIFE §3.5 (L-00): item link carried by a chat message. Validated by sanitizeItemSnapshot on receive. */
export type ChatLink =
  | { k: 'item'; item: ItemSnapshot }
  | { k: 'loc'; zone: string; x: number; z: number; label: string };   // /pin command, P2

/** GDD_LIFE §3.5 (L-00) + GDD_ITEMS_V2 O-IT9 (optional extra lines). A compact, validated copy of an ItemInstance. */
export interface ItemSnapshot {
  baseId: string; rarity: Rarity; itemLevel: number; upgrade?: number; name?: string;
  affixes: { affixId: string; value: number; tier: number }[];
  weaponDamage?: [number, number]; implicit?: StatBlock;
  sockets?: (string | null)[]; uniqueId?: string; setId?: string; craftedBy?: string;
  /** GDD_ITEMS_V2 O-IT9: Ustalık rank 0..5, Tezgâh line (slot 6), Özel line (slot 7), Tılsım stone id. */
  mw?: number;
  bench?: { affixId: string; value: number; tier: number };
  special?: { affixId: string; value: number; tier: number; s?: number };
  tilsim?: string | null;
}

/**
 * GDD_LIFE §7.5 (L-00): PvP channel. Host validates and relays `hit` / `ack` to the victim only; `flag` and `duel`
 * feed the host's pvpState map. Trust model: friends' rooms (documented, not solved).
 */
export type PvpMsg =
  | { k: 'flag'; on: boolean; team?: 0 | 1 }
  | { k: 'duel'; op: 'invite' | 'accept' | 'decline' | 'start' | 'end'; to?: string; ring?: [number, number, number]; winner?: string }
  | { k: 'hit'; to: string; amount: number; type: DamageType; crit: boolean; skillId?: string; statuses?: StatusApply[]; knockback?: number; dir: [number, number]; aLvl: number; aIlvl: number; seq: number }
  | { k: 'ack'; to: string; amount: number; crit: boolean; hp: number; killed?: boolean; seq: number }
  | { k: 'kill'; killer: string; victim: string; assists: string[] }
  | { k: 'score'; teams: [number, number] };

/**
 * Typed logical gameplay channels carried by NetSession (see ARCHITECTURE.md "Net channels").
 * The net module carries them inside its generic envelope (`g` channel in net/messages.ts, host-relayed star
 * topology). Gameplay code ONLY uses these via G.net.broadcast/sendToHost/sendTo/on.
 * Append-only: modules may ADD channels/fields; never rename/remove.
 */
export interface NetChannels {
  pstate: PlayerSyncState & { id: EntityId; t: number; /** GDD_V2 §2.1: remaining major cooldowns in seconds (45 / 90 / 180), sent at 1 Hz */ mcd?: [number, number, number] };
  gear: { id: EntityId; gear: Partial<Record<EquipSlot, ItemInstance>>; /** player module: colour variant (v), tint 0xRRGGBB (t) and "hide helm" (hh) of the sender's avatar, so remote models match */ look?: { v: number; t?: number; hh?: boolean } };
  snap: { t: number; enemies: EnemySyncState[] };
  spawn: { id: EntityId; defId: string; x: number; z: number; level: number; packId: string | null; facing?: number; aggro?: boolean; /** enemies module: summoner id, tag and remove (escaped / reset adds) */ owner?: EntityId; tag?: string; hpFrac?: number; remove?: boolean };
  hit: { targetId: EntityId; amount: number; crit: boolean; type: DamageType; skillId?: string; statuses?: StatusApply[]; knockback?: number; dir?: [number, number]; isDot?: boolean; /** GDD_V2 §3.7: poise damage this hit deals (poise bar, break) */ poise?: number };
  dmg: { targetId: EntityId; amount: number; crit: boolean; type: DamageType; sourceId: EntityId | null; hp: number; /** combat module: damage-over-time tick (the attacker did not predict it) */ dot?: boolean };
  death: { entityId: EntityId; killerId: EntityId | null; pos: [number, number, number] };
  estatus: { targetId: EntityId; status: StatusId; duration: number; stacks: number; removed?: boolean };
  heal: { targetId: EntityId; amount: number; sourceId: EntityId | null };
  pstatus: { targetId: EntityId; status: StatusId; duration: number; stacks?: number; magnitude?: number; sourceId: EntityId | null };
  revive: { targetId: EntityId; hpFrac: number; sourceId: EntityId | null };
  pdeath: { entityId: EntityId; dead: boolean; /** GDD_V2 §8.5: killing ability name (optional) */ by?: string; /** GDD_V2 §8.5: the death was avoidable */ av?: boolean };
  cast: { casterId: EntityId; skillId: string; aim: AimInfo; /** combat module: owner released/ended a channel (remote replay stops) */ end?: boolean; /** combat module: owner's visual-relevant special ids for this cast (fan of fissures, extra meteors...) */ sp?: string[]; /** combat module: light "special fired" variant (titan / mountain / phoenix / echo): visuals only, no base cast */ fx?: string; /** radius (m) of the fx */ r?: number; /** GDD_TALENTS (T0): skill-specialisation picks of the cast skill, 3 tiers x 2 bits (tier i = bits 2i..2i+1, 0 none / 1 A / 2 B) */ sf?: number };
  ecast: { enemyId: EntityId; abilityId: string; name: string; castTime: number; interruptible: boolean; ended?: boolean; interrupted?: boolean; interruptedBy?: EntityId };
  hitshape: HitShapeSpec;
  hitshape_x: { id: number };
  run: RunState;
  affix: { kind: string; targetId?: EntityId; data?: Record<string, number>; /** mythic module: extra ids / text payload */ ids?: number[]; text?: string };
  gate: { key: string; open: boolean; bossEvent?: { type: 'engaged' | 'phase' | 'yell' | 'defeated' | 'wipe'; bossId: string; entityId: EntityId; text?: string; phase?: string } };
  scene: { scene: SceneId; params: unknown };
  sceneRequest: { scene: SceneId; params: unknown };   // client asks host to move the party (keystone owner / exit portal)
  /**
   * Chat line. Old clients send `{ text }` only (= party). GDD_ITEMS_V2 §2.10: `ann` is the cosmetic upgrade announcement.
   * GDD_LIFE §3.8: channel, whisper target, item links (<= 2), emote id, roll [max, result].
   */
  chat: { text: string; ann?: ChatAnn; ch?: 'say' | 'yell' | 'party' | 'whisper' | 'emote' | 'roll'; to?: string; links?: ChatLink[]; emote?: string; roll?: [number, number] };
  keystone: { peerId: string; keystone: KeystoneData | null };
  /**
   * net module: small client -> HOST event request (a guest asks the host to start the Lanetli Sandık, open a host-owned
   * door...). Never relayed to other peers. Use `G.net.sendRequest(kind, data)` to send (offline/host: runs the handlers
   * locally) and `G.net.onRequest(kind, (data, fromPeerId) => ...)` to handle (register on every peer; only the host/offline
   * peer ever receives). `kind` is an identifier (A-Z a-z 0-9 _ . : -, max 48), `data` a small plain object (max ~2 KB).
   */
  req: { kind: string; data?: Record<string, unknown> };
  // ---- GDD_V2 (WP1 contracts). The wire whitelist (net/messages.ts KNOWN_CHANNELS) must list these; owner: net.
  /** Enemy threat table snapshot at 4 Hz (GDD_V2 §1.4): `e` enemy, `v` current top target, `t` [playerId, threat] pairs. */
  threat: { e: EntityId; v: EntityId; t: [EntityId, number][] };
  /** Kick lockout state (GDD_V2 §3.8 / §8.4): `ready` = seconds until the next kick is allowed; `order` = rotation index. */
  kick: { id: EntityId; ready: number; order?: number };
  /** Spec change of a party member (GDD_V2 §1; allowed in town only). */
  spec: { id: EntityId; spec: SpecId };
  // ---- GDD_CLASSES_V2 §1.5 (NC01, append-only). Owner: net (Replication). Sent by the OWNING peer, 10 Hz.
  /** Owned minions / pets / summons of one peer; remote Minions are created or removed from these snapshots. */
  minion: { t: number; minions: MinionSync[] };
  // ---- GDD_ITEMS_V2 (IT-00). Owners: scenes (camp, home; P3). Not yet in KNOWN_CHANNELS (net owner adds them with the sender).
  /** Camp placed / removed by its owner, or a late joiner's `{ t: 'req' }` (GDD_ITEMS_V2 §5.1.6). */
  camp: CampMsg;
  /** House decor / mannequins / trophies snapshot of the owner (GDD_ITEMS_V2 §5.2.7). */
  home: HomeMsg;
  // ---- GDD_LIFE (L-00). Owner: net (sends and registers). Not yet in KNOWN_CHANNELS.
  /** Open-world PvP: flag, duel, hit / ack, kill, team score (GDD_LIFE §7.5). */
  pvp: PvpMsg;
  // ---- K8 (P-12, dungeon events). Owner: scenes (DungeonScene). Host-only: clients ask with sendRequest('dungeon.event').
  /** One dungeon event flag changed on the host (DungeonEventStore); the host sends one per flag at run start too. */
  dungeon_event: { name: string; on: boolean };
}

export type NetChannel = keyof NetChannels;
