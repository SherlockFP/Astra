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


/**
 * Open-world rings beyond Sisli Vadi (Karakır Bozkırı r7..r12, Ayaz Dağları r16..r21): the same kinds, read by the director next to
 * VIGNETTE_DEFS (ALL_VIGNETTE_DEFS). Caravans under attack (road_ambush: the traveller is the caravan's), treasure goblins (the minimap
 * pin shows them while they run), wolf packs round a herd, stuck carts. Rewards scale with the ring's level band. Kept apart so the Sisli
 * checks (the r1 ring) stay on their own list.
 */
export const OPEN_VIGNETTE_DEFS: readonly VignetteDef[] = [
  {
    id: 'vg_k7_kervan_pusu', kind: 'road_ambush', name: 'Kervan Pususu', regionId: 'r7', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['kb_haydut', 'kb_kurt'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 12, xpPct: 5 }, thanks: { goldPerLevel: 2, xpPct: 1 },
    lines: {
      start: 'İmdat! Bozkır haydutları kervanımı bastı!',
      thanks: 'Sağ ol, bu kadar yeter.',
      ask: 'Heybem haydutların elinde, içinde mühür var. Bulup getirir misin?',
      accept: 'Yol kenarına düşmüş olmalı, bak bir.',
      done: 'Kervanın yükü kurtuldu, sağ ol.',
      fail: 'Acele et, mühür tehlikede!',
    },
  },
  {
    id: 'vg_k7_hazine_goblini', kind: 'goblin_sighting', name: 'Hazine Goblini', regionId: 'r7', durSec: 75, weight: 1, cooldownSec: 900,
    npc: 'Hazine Goblini', enemies: ['treasure_goblin'], count: 1, killsNeeded: 1,
    reward: { goldPerLevel: 8, xpPct: 4 },
    lines: {
      start: 'Bir Hazine Goblini! Kaçmadan yakala!',
      done: 'Hazine Goblini yakalandı!',
    },
  },
  {
    id: 'vg_k7_kurt_surusu', kind: 'wolf_hunt', name: 'Kurt Sürüsü', regionId: 'r7', durSec: 75, weight: 2, cooldownSec: 600,
    npc: 'Kurt Sürüsü', enemies: ['kb_kurt'], count: 3, killsNeeded: 3,
    herd: { enemyId: 'ow_deer', count: 3, radius: 8 },
    reward: { goldPerLevel: 12, xpPct: 5 },
    lines: {
      start: 'Bozkır kurtları bir geyik sürüsünü kovalıyor!',
      done: 'Sürü dağıldı, geyikler kurtuldu!',
    },
  },
  {
    id: 'vg_k8_ork_pusu', kind: 'road_ambush', name: 'Ork Pususu', regionId: 'r8', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['kb_ork', 'kb_ciyan'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 13, xpPct: 5 }, thanks: { goldPerLevel: 2, xpPct: 1 },
    lines: {
      start: 'Orklar kervanın üstüne çöktü! Yardım edin!',
      thanks: 'Canımı kurtardın, bunu unutmam.',
      ask: 'Yükümüz Kızıl Çorak\'ın kumlarına savruldu, bulabilir misin?',
      accept: 'Kumların arasında bakmaya devam edin.',
      done: 'Kızıl Çorak\'tan yükü geri aldın, teşekkürler.',
      fail: 'Orklar geri dönmeden acele et!',
    },
  },
  {
    id: 'vg_k8_takili_kagni', kind: 'stuck_cart', name: 'Takılan Kağnı', regionId: 'r8', durSec: 60, weight: 2, cooldownSec: 480,
    npc: 'Kağnıcı', enemies: [], count: 0, killsNeeded: 0, holdSec: 6,
    reward: { goldPerLevel: 10, xpPct: 5 },
    lines: {
      start: 'Kağnı çamura saplandı, yardım et!',
      done: 'Kağnı kurtuldu, teşekkürler!',
    },
  },
  {
    id: 'vg_k9_warg_surusu', kind: 'wolf_hunt', name: 'Warg Sürüsü', regionId: 'r9', durSec: 75, weight: 2, cooldownSec: 600,
    npc: 'Warg Sürüsü', enemies: ['kb_warg'], count: 3, killsNeeded: 3,
    herd: { enemyId: 'ow_deer', count: 3, radius: 8 },
    reward: { goldPerLevel: 13, xpPct: 5 },
    lines: {
      start: 'Yayla wargları bir sürüyü kovalıyor!',
      done: 'Wargların sürüsü dağıldı!',
    },
  },
  {
    id: 'vg_k10_takili_kagni', kind: 'stuck_cart', name: 'Donmuş Kağnı', regionId: 'r10', durSec: 60, weight: 2, cooldownSec: 480,
    npc: 'Kağnıcı', enemies: [], count: 0, killsNeeded: 0, holdSec: 6,
    reward: { goldPerLevel: 13, xpPct: 5 },
    lines: {
      start: 'Kağnı çamura saplandı, yardım et!',
      done: 'Kağnı kurtuldu, teşekkürler!',
    },
  },
  {
    id: 'vg_k10_buz_pusu', kind: 'road_ambush', name: 'Buz Yolu Pususu', regionId: 'r10', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['kb_buz_hortlak', 'kb_ayaz_kurdu'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 14, xpPct: 6 }, thanks: { goldPerLevel: 2, xpPct: 1 },
    lines: {
      start: 'Buz hortlakları yolu kesti! İmdat!',
      thanks: 'Canım kurtuldu, sağ ol.',
      ask: 'Heybem buzun altına gömüldü, bulup getirir misin?',
      accept: 'Buzun altında bakmaya devam edin.',
      done: 'Heybem kurtuldu, bunu unutmayacağım.',
      fail: 'Acele et, buz eriyor!',
    },
  },
  {
    id: 'vg_k11_kul_pusu', kind: 'road_ambush', name: 'Kül Pususu', regionId: 'r11', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['kb_kul_akrep', 'kb_kul_kurdu'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 14, xpPct: 6 }, thanks: { goldPerLevel: 2, xpPct: 1 },
    lines: {
      start: 'Kül akrepleri kervanı kuşattı! Yardım!',
      thanks: 'Kül yağdığı sürece tetikte olun, sağ olun.',
      ask: 'Heybem küllerin altında kaldı, bulabilir misin?',
      accept: 'Külün altına bakın.',
      done: 'Heybem kurtuldu, sağ ol.',
      fail: 'Acele et, kül her şeyi örtüyor!',
    },
  },
  {
    id: 'vg_k12_sirt_pusu', kind: 'road_ambush', name: 'Sırt Pususu', regionId: 'r12', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['kb_kartal_dagci', 'kb_kartal_yirtici'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 15, xpPct: 6 }, thanks: { goldPerLevel: 3, xpPct: 1 },
    lines: {
      start: 'Sırt haydutları üstümüze çıktı! Yardım!',
      thanks: 'Sırtın ruhları bize göz kulak oldu, sağ ol.',
      ask: 'Heybem uçurumun kenarına düştü, alır mısın?',
      accept: 'Uçurumdan dikkatli inin.',
      done: 'Heybem kurtuldu, sağ ol.',
      fail: 'Acele et, sırt kayalık!',
    },
  },
  {
    id: 'vg_k12_hazine_goblini', kind: 'goblin_sighting', name: 'Hazine Goblini', regionId: 'r12', durSec: 75, weight: 1, cooldownSec: 900,
    npc: 'Hazine Goblini', enemies: ['treasure_goblin'], count: 1, killsNeeded: 1,
    reward: { goldPerLevel: 10, xpPct: 4 },
    lines: {
      start: 'Bir Hazine Goblini! Kaçmadan yakala!',
      done: 'Hazine Goblini yakalandı!',
    },
  },
  {
    id: 'vg_a16_kar_pusu', kind: 'road_ambush', name: 'Kar Pususu', regionId: 'r16', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['ad_kar_haydut', 'ad_kar_kurdu'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 16, xpPct: 6 }, thanks: { goldPerLevel: 3, xpPct: 1 },
    lines: {
      start: 'Kar haydutları yolu kesti! İmdat!',
      thanks: 'Bu soğukta yardımınız çok değerli, sağ olun.',
      ask: 'Heybem karın altına düştü, bulup getirir misin?',
      accept: 'Kar yağmadan bulun.',
      done: 'Heybem kurtuldu, sağ ol.',
      fail: 'Acele et, kar kapatıyor!',
    },
  },
  {
    id: 'vg_a16_kar_kurdu_surusu', kind: 'wolf_hunt', name: 'Kar Kurdu Sürüsü', regionId: 'r16', durSec: 75, weight: 2, cooldownSec: 600,
    npc: 'Kar Kurdu Sürüsü', enemies: ['ad_kar_kurdu'], count: 3, killsNeeded: 3,
    herd: { enemyId: 'ow_deer', count: 3, radius: 8 },
    reward: { goldPerLevel: 16, xpPct: 6 },
    lines: {
      start: 'Kar kurtları bir sürüyü kovalıyor!',
      done: 'Kar kurtlarının sürüsü dağıldı!',
    },
  },
  {
    id: 'vg_a17_ork_pusu', kind: 'road_ambush', name: 'Ork Kervanı Pususu', regionId: 'r17', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['ad_kar_ork', 'ad_kar_ork_okcu'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 17, xpPct: 6 }, thanks: { goldPerLevel: 3, xpPct: 1 },
    lines: {
      start: 'Ayaz orkları kervanı bastı! Yardım!',
      thanks: 'Yükü kurtardık, sağ ol.',
      ask: 'Heybem orkların elinde, geri alabilir misin?',
      accept: 'Orkların izini sürün.',
      done: 'Heybem kurtuldu, teşekkürler.',
      fail: 'Acele et, orklar kaçıyor!',
    },
  },
  {
    id: 'vg_a18_hazine_goblini', kind: 'goblin_sighting', name: 'Hazine Goblini', regionId: 'r18', durSec: 75, weight: 1, cooldownSec: 900,
    npc: 'Hazine Goblini', enemies: ['treasure_goblin'], count: 1, killsNeeded: 1,
    reward: { goldPerLevel: 18, xpPct: 4 },
    lines: {
      start: 'Bir Hazine Goblini! Kaçmadan yakala!',
      done: 'Hazine Goblini yakalandı!',
    },
  },
  {
    id: 'vg_a19_kartal_pusu', kind: 'road_ambush', name: 'Kartal Pususu', regionId: 'r19', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['ad_kar_haydut', 'ad_kar_ork'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 17, xpPct: 6 }, thanks: { goldPerLevel: 3, xpPct: 1 },
    lines: {
      start: 'Dağ haydutları kervanı pusuya düşürdü! İmdat!',
      thanks: 'Dağda ayakta kalmak zor, sağ ol.',
      ask: 'Heybem kayalıkların arasında kaldı, bulabilir misin?',
      accept: 'Kayalıklara bakın.',
      done: 'Heybem kurtuldu, sağ ol.',
      fail: 'Acele et, dağ hava değiştiriyor!',
    },
  },
  {
    id: 'vg_a20_donmus_kagni', kind: 'stuck_cart', name: 'Donmuş Kağnı', regionId: 'r20', durSec: 60, weight: 2, cooldownSec: 480,
    npc: 'Kağnıcı', enemies: [], count: 0, killsNeeded: 0, holdSec: 6,
    reward: { goldPerLevel: 18, xpPct: 6 },
    lines: {
      start: 'Kağnı çamura saplandı, yardım et!',
      done: 'Kağnı kurtuldu, teşekkürler!',
    },
  },
  {
    id: 'vg_a21_zirve_pusu', kind: 'road_ambush', name: 'Zirve Pususu', regionId: 'r21', durSec: 90, weight: 3, cooldownSec: 480,
    npc: 'Yaralı Kervancı', enemies: ['ad_buz_orumcek', 'ad_don_hortlak'], count: 2, killsNeeded: 0,
    followup: 'satchel',
    reward: { goldPerLevel: 19, xpPct: 7 }, thanks: { goldPerLevel: 3, xpPct: 1 },
    lines: {
      start: 'Zirve yolunda hortlaklar saldırdı! İmdat!',
      thanks: 'Zirvenin rüzgârı bizi ayakta tuttu, sağ ol.',
      ask: 'Heybem buzun altına düştü, bulup getirir misin?',
      accept: 'Buzun üstünden dikkatli geçin.',
      done: 'Heybem kurtuldu, sağ ol.',
      fail: 'Acele et, zirve kapanıyor!',
    },
  },
];

/** Every vignette def of every ring: the director's list (Sisli r1 + the open-world rings). */
export const ALL_VIGNETTE_DEFS: readonly VignetteDef[] = [...VIGNETTE_DEFS, ...OPEN_VIGNETTE_DEFS];

export const vignetteDef = (id: string): VignetteDef | undefined => ALL_VIGNETTE_DEFS.find((d) => d.id === id);
