/**
 * One-time contextual tips (UI_REDESIGN §4.7). Each tip shows once per character (save flag `tip.<id>`), never during a panel,
 * and at least 25 s after the previous one. The scheduler lives in ui/hud/TipCards.ts; this file is only the table.
 * Player-facing text is Turkish. Key names are never literal: a text holds `{k:action}` tokens and the key chips list `keyActions`,
 * both resolved from the live bindings at show time (`keys` are only the display fallbacks). A tip whose wording depends on the
 * control scheme (CONTROLS_WOW) carries a `wow` variant; ui/hud/TipCards.ts picks it with tipView().
 */
import type { InputAction } from '../core/Input';

/** What the scheduler knows when it asks a tip whether its condition holds. */
export interface TipCtx {
  level: number;
  /** Town or open-world scene (not a dungeon run). */
  inTown: boolean;
  inCombat: boolean;
  /** Player HP as a fraction of max (1 when unknown). */
  hpFrac: number;
  /** Seconds since the current scene started. */
  sceneAge: number;
  /** The player has moved at least half a metre since the scene started. */
  moved: boolean;
  /** An interaction prompt has been up for at least a second. */
  promptHeld: boolean;
  /** A live enemy is within 18 m. */
  enemyNear: boolean;
  /** The player took a hit of at least 10 % of max HP from an enemy (this session). */
  bigHit: boolean;
  /** A loot drop appeared within 8 m (this session). */
  dropNear: boolean;
  /** An item is in the bag. */
  bagHasItem: boolean;
  /** At least one health potion is owned. */
  hasPotion: boolean;
  /** A quest was accepted (this session). */
  questAccepted: boolean;
  /** A waypoint stone of this character is discovered. */
  waypointFound: boolean;
  /** Unspent talent points across the three pools. */
  unspent: number;
  /** Specialisation chosen. */
  specChosen: boolean;
  /** A major skill became ready (this session). */
  majorReady: boolean;
  /** Save flag is set (1 / true / any non-empty string). */
  flag(key: string): boolean;
}

/** Scheme variant of a tip: replaces the text and the key chips while the WoW scheme is active. */
export interface TipVariant {
  text: string;
  keys?: string[];
  keyActions?: InputAction[];
}

export interface TipDef {
  id: string;
  title: string;
  text: string;
  keys: string[];
  /** Key chips taken from the live bindings (wins over `keys`). */
  keyActions?: InputAction[];
  /** WoW wording (the base text is the Aksiyon one). */
  wow?: TipVariant;
  /** Higher wins when several are due at once. */
  prio: number;
  /** Shown during combat too (otherwise never while fighting). */
  inCombat?: boolean;
  when: (c: TipCtx) => boolean;
}

export const TIPS: TipDef[] = [
  {
    id: 'move', title: 'Hareket', prio: 100, keys: ['W', 'A', 'S', 'D'],
    keyActions: ['moveForward', 'moveLeft', 'moveBack', 'moveRight'],
    text: 'Yürümek için {k:moveForward} {k:moveLeft} {k:moveBack} {k:moveRight}, kamerayı çevirmek için fareyi oynat. {k:jump} zıplar.',
    wow: {
      text: 'Yürümek için {k:moveForward} {k:moveLeft} {k:moveBack} {k:moveRight}. Kamerayı çevirmek için sol tuşu basılı tutup sürükle; sağ tuşla sürüklersen karakter de döner. {k:jump} zıplar.',
    },
    when: (c) => c.inTown && c.sceneAge >= 3 && !c.moved,
  },
  {
    id: 'interact', title: 'Etkileşim', prio: 90, keys: ['F'], keyActions: ['interact'],
    text: 'Konuşmak, eşya almak ve kapıları açmak için {k:interact} tuşuna bas.',
    when: (c) => c.promptHeld,
  },
  {
    id: 'attack', title: 'Saldırı', prio: 95, keys: ['SolT', 'SağT'], inCombat: true,
    keyActions: ['skill_lmb', 'skill_rmb'],
    text: '{k:skill_lmb} saldırır, {k:skill_rmb} yeteneğini kullanır. {k:skill_lmb} tuşunu basılı tutarsan ağır vuruş yaparsın.',
    wow: {
      text: 'Bir düşmana sağ tıkla: seçilir ve otomatik saldırı başlar. Yeteneklerin {k:skill_rmb} {k:skill_q} {k:skill_e} {k:skill_r} {k:skill_s1} ve {k:skill_s2} {k:skill_s3} {k:skill_s4} tuşlarında; {k:targetNext} sıradaki düşmanı seçer.',
      keyActions: ['skill_rmb', 'skill_q', 'skill_e', 'targetNext'],
      keys: ['SağT'],
    },
    when: (c) => c.enemyNear,
  },
  {
    id: 'dodge', title: 'Kaçış', prio: 92, keys: ['Shift'], inCombat: true, keyActions: ['dodge'],
    text: '{k:dodge} ile yuvarlan. Saldırı sana değmeden hemen önce yuvarlanırsan kusursuz kaçış yaparsın.',
    when: (c) => c.bigHit,
  },
  {
    id: 'loot', title: 'Ganimet', prio: 85, keys: ['F'], keyActions: ['interact'],
    text: 'Yerdeki eşyaları {k:interact} ile al. Parıltının rengi eşyanın nadirliğini gösterir.',
    when: (c) => c.dropNear,
  },
  {
    id: 'bag', title: 'Çanta', prio: 80, keys: ['B'], keyActions: ['inventory'],
    text: '{k:inventory} ile çantanı aç. Eşyaya sağ tıklayarak kuşanabilirsin.',
    when: (c) => c.bagHasItem,
  },
  {
    id: 'potion', title: 'İksir', prio: 99, keys: ['4', '5'], inCombat: true, keyActions: ['potionHp', 'potionMp'],
    text: '{k:potionHp} tuşu can iksiri, {k:potionMp} tuşu kaynak iksiri içer.',
    when: (c) => c.hpFrac < 0.4 && c.hasPotion,
  },
  {
    id: 'quest', title: 'Görevler', prio: 75, keys: ['L'], keyActions: ['quests'],
    text: '{k:quests} ile görev defterini aç. Sağ üstteki takipçi aktif görevini gösterir.',
    when: (c) => c.questAccepted,
  },
  {
    id: 'map', title: 'Harita', prio: 70, keys: ['M'], keyActions: ['map'],
    text: '{k:map} ile haritayı aç. Mavi halkalar görev hedeflerini gösterir.',
    when: (c) => c.inTown && c.level >= 2,
  },
  {
    id: 'waypoint', title: 'Işınlayıcı', prio: 65, keys: ['F'], keyActions: ['interact'],
    text: 'Keşfettiğin taşlar arasında hızlı yolculuk yapabilirsin. Taşa yaklaşıp {k:interact} tuşuna bas.',
    when: (c) => c.waypointFound,
  },
  {
    id: 'talents', title: 'Yetenek Ağacı', prio: 82, keys: ['N'], keyActions: ['talents'],
    text: '{k:talents} ile yetenek ağacını aç. Harcayabileceğin {n} puanın var.',
    when: (c) => c.level >= 2 && c.unspent > 0,
  },
  {
    id: 'smith', title: 'Demirci', prio: 60, keys: [],
    text: 'Demirci\'de eşyalarını yükseltebilirsin. Her seviye daha güçlü eşya demek.',
    when: (c) => c.inTown && c.level >= 5,
  },
  {
    id: 'finder', title: 'Zindan Bulucu', prio: 78, keys: ['I'], keyActions: ['groupFinder'],
    text: '{k:groupFinder} ile Zindan Bulucu\'yu aç: Kemik Mahzeni artık açık.',
    when: (c) => c.inTown && c.level >= 8,
  },
  {
    id: 'spec', title: 'Uzmanlık', prio: 94, keys: ['N'], keyActions: ['talents'],
    text: 'Uzmanlık seçme zamanı! {k:talents} tuşuyla uzmanlığını seç.',
    when: (c) => c.level >= 10 && !c.specChosen,
  },
  {
    id: 'major', title: 'Büyük Yetenek', prio: 86, keys: ['X', 'V', 'T'], keyActions: ['skill_m45', 'skill_m90', 'skill_m180'],
    text: '{k:skill_m45}, {k:skill_m90} ve {k:skill_m180} büyük bekleme süreli yeteneklerdir. Zor savaşlar için sakla.',
    when: (c) => c.majorReady,
  },
];

/** Fills the `{n}` placeholder of a tip text. */
export function tipText(def: TipDef, c: TipCtx): string {
  return def.text.replace('{n}', String(c.unspent));
}

/** Binding helpers the tip renderer hands in (data/ stays free of game imports). */
export interface TipEnv {
  /** WoW control scheme active. */
  wow: boolean;
  /** Fills the `{k:action}` tokens of a text from the live bindings. */
  expand(text: string): string;
  /** Key-cap label of an action's binding (`-` = unbound). */
  label(action: InputAction): string;
}

/** What the card shows: the scheme's text with bindings filled in, and the key chips (unbound actions are left out). */
export function tipView(def: TipDef, c: TipCtx, env: TipEnv): { text: string; keys: string[] } {
  const v: TipVariant = env.wow && def.wow ? def.wow : def;
  const text = env.expand(v.text.replace('{n}', String(c.unspent)));
  // chips: the variant's own actions or literal keys, else the base tip's actions, else its literal fallbacks
  const actions = v === def ? def.keyActions : (v.keyActions ?? (v.keys ? undefined : def.keyActions));
  const keys = actions ? actions.map(env.label).filter((k) => k !== '-') : (v.keys ?? def.keys);
  return { text, keys };
}
