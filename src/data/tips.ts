/**
 * One-time contextual tips (UI_REDESIGN §4.7). Each tip shows once per character (save flag `tip.<id>`), never during a panel,
 * and at least 25 s after the previous one. The scheduler lives in ui/hud/TipCards.ts; this file is only the table.
 * Player-facing text is Turkish. Keys are binding labels resolved at show time (`keys` are the display fallbacks).
 */

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

export interface TipDef {
  id: string;
  title: string;
  text: string;
  keys: string[];
  /** Higher wins when several are due at once. */
  prio: number;
  /** Shown during combat too (otherwise never while fighting). */
  inCombat?: boolean;
  when: (c: TipCtx) => boolean;
}

export const TIPS: TipDef[] = [
  {
    id: 'move', title: 'Hareket', prio: 100, keys: ['W', 'A', 'S', 'D'],
    text: 'Yürümek için W A S D, kamerayı çevirmek için fareyi oynat. Boşluk zıplar.',
    when: (c) => c.inTown && c.sceneAge >= 3 && !c.moved,
  },
  {
    id: 'interact', title: 'Etkileşim', prio: 90, keys: ['F'],
    text: 'Konuşmak, eşya almak ve kapıları açmak için F tuşuna bas.',
    when: (c) => c.promptHeld,
  },
  {
    id: 'attack', title: 'Saldırı', prio: 95, keys: ['SolT', 'SağT'], inCombat: true,
    text: 'Sol tık saldırır, sağ tık yeteneğini kullanır. Sol tuşu basılı tutarsan ağır vuruş yaparsın.',
    when: (c) => c.enemyNear,
  },
  {
    id: 'dodge', title: 'Kaçış', prio: 92, keys: ['Shift'], inCombat: true,
    text: 'Shift ile yuvarlan. Saldırı sana değmeden hemen önce yuvarlanırsan kusursuz kaçış yaparsın.',
    when: (c) => c.bigHit,
  },
  {
    id: 'loot', title: 'Ganimet', prio: 85, keys: ['F'],
    text: 'Yerdeki eşyaları F ile al. Parıltının rengi eşyanın nadirliğini gösterir.',
    when: (c) => c.dropNear,
  },
  {
    id: 'bag', title: 'Çanta', prio: 80, keys: ['B'],
    text: 'B ile çantanı aç. Eşyaya sağ tıklayarak kuşanabilirsin.',
    when: (c) => c.bagHasItem,
  },
  {
    id: 'potion', title: 'İksir', prio: 99, keys: ['4', '5'], inCombat: true,
    text: '4 tuşu can iksiri, 5 tuşu kaynak iksiri içer.',
    when: (c) => c.hpFrac < 0.4 && c.hasPotion,
  },
  {
    id: 'quest', title: 'Görevler', prio: 75, keys: ['L'],
    text: 'L ile görev defterini aç. Sağ üstteki takipçi aktif görevini gösterir.',
    when: (c) => c.questAccepted,
  },
  {
    id: 'map', title: 'Harita', prio: 70, keys: ['M'],
    text: 'M ile haritayı aç. Mavi halkalar görev hedeflerini gösterir.',
    when: (c) => c.inTown && c.level >= 2,
  },
  {
    id: 'waypoint', title: 'Işınlayıcı', prio: 65, keys: ['F'],
    text: 'Keşfettiğin taşlar arasında hızlı yolculuk yapabilirsin. Taşa yaklaşıp F\'ye bas.',
    when: (c) => c.waypointFound,
  },
  {
    id: 'talents', title: 'Yetenek Ağacı', prio: 82, keys: ['N'],
    text: 'N ile yetenek ağacını aç. Harcayabileceğin {n} puanın var.',
    when: (c) => c.level >= 2 && c.unspent > 0,
  },
  {
    id: 'smith', title: 'Demirci', prio: 60, keys: [],
    text: 'Demirci\'de eşyalarını yükseltebilirsin. Her seviye daha güçlü eşya demek.',
    when: (c) => c.inTown && c.level >= 5,
  },
  {
    id: 'finder', title: 'Zindan Bulucu', prio: 78, keys: ['I'],
    text: 'I ile Zindan Bulucu\'yu aç: Kemik Mahzeni artık açık.',
    when: (c) => c.inTown && c.level >= 8,
  },
  {
    id: 'spec', title: 'Uzmanlık', prio: 94, keys: ['N'],
    text: 'Uzmanlık seçme zamanı! N tuşuyla uzmanlığını seç.',
    when: (c) => c.level >= 10 && !c.specChosen,
  },
  {
    id: 'major', title: 'Büyük Yetenek', prio: 86, keys: ['X', 'V', 'T'],
    text: 'X, V ve T büyük bekleme süreli yeteneklerdir. Zor savaşlar için sakla.',
    when: (c) => c.majorReady,
  },
];

/** Fills the `{n}` placeholder of a tip text. */
export function tipText(def: TipDef, c: TipCtx): string {
  return def.text.replace('{n}', String(c.unspent));
}
