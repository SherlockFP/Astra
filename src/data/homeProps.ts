/**
 * GDD_ITEMS_V2 §5.2 / §5.3: House (one per character, three tiers, P3). IT-00 STUB: the tier table and the trophy bits are final.
 * `HOME_PROPS` (furniture catalogue) is filled by IT-55; its index is the propIndex of every snapshot, so it is APPEND-ONLY.
 * `HOME_ENABLED` stays false until the housing phase ships.
 * OWNER: items (data), scenes (runtime: scenes/Housing).
 */

export const HOME_ENABLED = false;

export type HomeTierId = 'home_kulube' | 'home_karakol' | 'home_konak';

/** §5.2.1 house tiers. `sizeM` = interior [width, depth] metres; `deco` = deco slots; `evStash` = Ev Sandığı slots. */
export interface HomeTierDef {
  id: HomeTierId;
  name: string;
  level: number;
  price: number;
  sizeM: [number, number];
  rooms: number;
  deco: number;
  evStash: number;
  stationSlots: number;
  mannequins: number;
  trophies: number;
}

export const HOME_TIERS: readonly HomeTierDef[] = [
  { id: 'home_kulube',  name: 'Köy Kulübesi',       level: 10, price: 25000,  sizeM: [12, 8],  rooms: 1, deco: 24, evStash: 30, stationSlots: 2, mannequins: 1, trophies: 6 },
  { id: 'home_karakol', name: 'Karakol Evi',        level: 20, price: 120000, sizeM: [16, 12], rooms: 2, deco: 48, evStash: 60, stationSlots: 3, mannequins: 2, trophies: 12 },
  { id: 'home_konak',   name: 'Kuzgunkale Konağı',  level: 40, price: 600000, sizeM: [24, 16], rooms: 3, deco: 96, evStash: 90, stationSlots: 4, mannequins: 4, trophies: 24 },
];

/** §5.2.4 trophy bitmask per difficulty (`CharacterSave.home.trophies[bossId]`). */
export const TROPHY_BITS = {
  normal: 1,
  heroic: 2,
  mythic: 4,
  mythicPlusTimed: 8,
  raidNormal: 16,
  raidHeroic: 32,
  raidMythic: 64,
} as const;

/** One furniture piece (§5.2.3). Filled by IT-55. */
export interface HomePropDef {
  id: string;
  name: string;
  model: string;
  footprint: [number, number];
  slots: number;
  price: number;
  source: 'vendor' | 'craft' | 'boss' | 'event' | 'tier';
}

/** Furniture catalogue. Index = propIndex in `HomeSnapshot.decor` (append-only). Filled by IT-55. */
export const HOME_PROPS: HomePropDef[] = [];
