/**
 * Yol olayları (WoW-style "things happen as you travel"): short dynamic vignettes on the roads and POIs of an open-world ring.
 * Data only. The rules are scenes/world/VignetteRules.ts, the state machines scenes/world/VignetteRun.ts, the world side
 * scenes/world/Vignettes.ts. A vignette is picked by the host when a player passes a road or a POI of its ring, placed outside camps,
 * villages and quest spots, scaled to the ring's level band and despawns after `durSec` (at most 90 s) whatever happened.
 * OWNER: content module. Sisli Vadi L1-5 is the ring `r1` (Sisli Koru, levels 1-5). Another ring: add defs with its region id.
 */

export type VignetteKind = 'road_ambush' | 'scout_herbs' | 'wolf_hunt' | 'goblin_sighting' | 'stuck_cart';

export interface VignetteReward {
  /** Gold per level of the local character (ring band), paid on the main objective. */
  goldPerLevel: number;
  /** Exploration XP (% of the XP to the next level). */
  xpPct: number;
}

export interface VignetteDef {
  id: string;
  kind: VignetteKind;
  /** Name in the toast, the minimap marker and the prompt. */
  name: string;
  /** Ring: the region whose roads and POIs host it. Its level band scales the spawns and the rewards. */
  regionId: string;
  /** Seconds the vignette lasts before it despawns (<= 90). */
  durSec: number;
  /** Relative pick weight among the eligible defs of the ring. */
  weight: number;
  /** Seconds before the same player can get this vignette again. */
  cooldownSec: number;
  /** The NPC (or the cart, the scout) that speaks. */
  npc: string;
  /**
   * Enemy defs. road_ambush: the ambushers (`count` of them, picked at random from this list). wolf_hunt: the pack wolves (`count`).
   * goblin_sighting: the goblin (one).
   */
  enemies: string[];
  /** Ambusher or pack size. */
  count: number;
  /** wolf_hunt: the deer herd (`count` deer) around the anchor, with the pack patrolling `radius` m around it. */
  herd?: { enemyId: string; count: number; radius: number };
  /** Kills of `enemies[0]` (wolf_hunt pack members, goblin) that complete the main objective. */
  killsNeeded: number;
  /** road_ambush: the rescued traveler's follow-up mini quest. 'escort' walks him `escortM` m along the road, 'satchel' sends the player for his lost satchel. */
  followup?: 'escort' | 'satchel';
  escortM?: number;
  /** scout_herbs: the herb (material id) the scout asks for, `count` of them. Herb tufts by the campfire give one each. */
  herb?: { item: string; count: number };
  /** cart: seconds of F held to free the cart. */
  holdSec?: number;
  /** Main objective reward. */
  reward: VignetteReward;
  /** road_ambush: the small reward for the rescue itself (paid when the traveler is saved with the local player in the fight). */
  thanks?: VignetteReward;
  /** Lines (Turkish): start (bubble or rumour), ask (pop-up question), accept, done, fail (wrong moment). */
  lines: { start: string; ask?: string; accept?: string; thanks?: string; done: string; fail?: string };
}

/** Tuning shared by every ring. Distances in metres, times in seconds. */
export const VIGNETTE_RULES = {
  /** Walked distance on a road or near a POI (per player) between two rolls. */
  rollEveryM: 90,
  /** Chance of a vignette at each roll. */
  rollChance: 0.5,
  /** A player counts as passing a road within this distance of a road point (or a POI within 25 m). */
  nearRoadM: 22,
  /** Anchor distance from the player (the vignette lies ahead, not under the feet). */
  anchorMinM: 16,
  anchorMaxM: 60,
  /** No new vignette within this distance of an active one (host). */
  spacingM: 200,
  /** Global gap between two starts (s). */
  gapSec: 30,
  /** Seconds before the same player gets any vignette again (s), on top of the def's cooldown. */
  playerCdSec: 240,
  /** A player above the ring's top level by more than this gets no vignette. */
  maxOverLevel: 4,
  /** A peer creates the props and the pin of a vignette within this distance of its anchor. */
  liveM: 150,
  /** Return range to the NPC for the auto turn-in (m). */
  returnM: 4,
  /** Seconds a finished vignette stays on screen before it despawns. */
  lingerSec: 4,
  /** Seconds to wait for the wave before the traveler is called saved (no enemy seen). */
  waveWaitSec: 8,
  /** Off-road anchors: each road point also offers the two points this far to its sides (walkable only). */
  sideM: 10,
  /** Clearance (m) a vignette keeps from: a camp's edge (its radius + this), a patrol's loop, a village's walls, a quest spot, an escort route, a POI, a world boss. */
  clearCampM: 8,
  clearPatrolM: 8,
  clearVillageM: 8,
  clearQuestM: 12,
  clearEscortM: 10,
  clearPoiM: 8,
  clearBossM: 30,
} as const;

export const VIGNETTE_DEFS: readonly VignetteDef[] = [
  {
    id: 'vg_yolcu_pusu_escort', kind: 'road_ambush', name: 'Yolcu Pususu', regionId: 'r1', durSec: 90, weight: 3, cooldownSec: 420,
    npc: 'Yaralı Yolcu', enemies: ['ow_bandit', 'ow_wolf'], count: 2, killsNeeded: 0,
    followup: 'escort', escortM: 40,
    reward: { goldPerLevel: 40, xpPct: 8 }, thanks: { goldPerLevel: 6, xpPct: 1 },
    lines: {
      start: 'İmdat! Haydutlar beni pusuya düşürdü!',
      thanks: 'Canımı kurtardın! Bunu unutmayacağım.',
      ask: 'Köye kadar bana eşlik eder misin? Tek başıma yürüyemem.',
      accept: 'Teşekkürler, yavaş yürü, yaram kanıyor.',
      done: 'Köye vardık! Bu iyiliğini unutmayacağım.',
      fail: 'Yanımdan ayrılma, yoksa yolda kalırım.',
    },
  },
  {
    id: 'vg_yolcu_pusu_heybe', kind: 'road_ambush', name: 'Yolcu Pususu', regionId: 'r1', durSec: 90, weight: 3, cooldownSec: 420,
    npc: 'Yaralı Yolcu', enemies: ['ow_bandit', 'ow_bandit_archer'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 30, xpPct: 6 }, thanks: { goldPerLevel: 6, xpPct: 1 },
    lines: {
      start: 'Haydutlar! Yardım edin!',
      thanks: 'Sağ ol, bu kadar yeter.',
      ask: 'Heybem haydutların eline geçti, içinde kayıt defterim var. Bulup getirir misin?',
      accept: 'Yol kenarına düşmüş olmalı, bak bir.',
      done: 'Heybemi buldun! Defterimi kurtardın, sağ ol.',
      fail: 'Acele et, defterim tehlikede!',
    },
  },
  {
    id: 'vg_izci_otu', kind: 'scout_herbs', name: 'Yaralı İzci', regionId: 'r1', durSec: 90, weight: 2, cooldownSec: 600,
    npc: 'Yaralı İzci', enemies: [], count: 0, killsNeeded: 0,
    herb: { item: 'herb_daisy', count: 3 },
    reward: { goldPerLevel: 30, xpPct: 6 },
    lines: {
      start: 'Ah, bacağım... Biraz ot lazım.',
      ask: 'Kamp ateşinin yanındaki papatyalardan üç Ak Papatya getirir misin? Bacağıma saracağım.',
      accept: 'Teşekkürler! Etrafta papatyalar var.',
      done: 'Şimdi daha iyiyim. Bu senin hakkın.',
      fail: 'Henüz üç papatya yok...',
    },
  },
  {
    id: 'vg_kurt_surusu', kind: 'wolf_hunt', name: 'Kurt Sürüsü', regionId: 'r1', durSec: 75, weight: 2, cooldownSec: 600,
    npc: 'Kurt Sürüsü', enemies: ['ow_wolf'], count: 3, killsNeeded: 3,
    herd: { enemyId: 'ow_deer', count: 3, radius: 8 },
    reward: { goldPerLevel: 35, xpPct: 8 },
    lines: {
      start: 'Kurtlar bir geyik sürüsünü kovalıyor!',
      done: 'Sürü dağıldı, geyikler kurtuldu!',
    },
  },
  {
    id: 'vg_hazine_goblini', kind: 'goblin_sighting', name: 'Hazine Goblini', regionId: 'r1', durSec: 75, weight: 1, cooldownSec: 900,
    npc: 'Hazine Goblini', enemies: ['treasure_goblin'], count: 1, killsNeeded: 1,
    reward: { goldPerLevel: 20, xpPct: 4 },
    lines: {
      start: 'Bir Hazine Goblini! Kaçmadan yakala!',
      done: 'Hazine Goblini yakalandı!',
    },
  },
  {
    id: 'vg_takili_kagni', kind: 'stuck_cart', name: 'Takılan Kağnı', regionId: 'r1', durSec: 60, weight: 2, cooldownSec: 480,
    npc: 'Kağnıcı', enemies: [], count: 0, killsNeeded: 0, holdSec: 6,
    reward: { goldPerLevel: 25, xpPct: 5 },
    lines: {
      start: 'Kağnı çamura saplandı, yardım et!',
      done: 'Kağnı kurtuldu, teşekkürler!',
    },
  },
];

export const vignetteDef = (id: string): VignetteDef | undefined => VIGNETTE_DEFS.find((d) => d.id === id);
