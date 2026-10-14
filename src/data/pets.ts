/**
 * WP-12 cosmetic pets (docs/MMO_PILLARS.md). Pure data: systems/Pets.ts learns and summons them, game/Pet.ts builds the
 * small voxel model, ui/panels/game/collection.ts lists them. No combat effect.
 *
 * Ids are saved (CharacterSave.pets.known): never rename or reuse one. Every pet has one source:
 *   drop   a teaching item (`petItemId(id)`, a material with `teachesPet`) in a named loot table (loot.ts, bonus rolls)
 *   ach    an achievement that teaches it on unlock (`pet` field of data/achievements.ts)
 *   event  a teaching item rolled for each participant of that world event (scenes/world/EventCalendar.ts)
 * `text` is the Turkish source line the collection panel shows.
 */

/** Model family, built from boxes in game/Pet.ts. */
export type PetShape = 'quad' | 'bird' | 'orb' | 'turtle' | 'dragon';

export type PetSource =
  | { kind: 'drop'; table: string; text: string }
  | { kind: 'ach'; achId: string; text: string }
  | { kind: 'event'; event: string; text: string };

export interface PetDef {
  id: string;
  name: string;
  desc: string;
  shape: PetShape;
  /** Main body colour and accent (eyes, beak, shell pattern...). */
  color: number;
  accent: number;
  /** Model scale (1 = a cat-sized body). */
  scale: number;
  source: PetSource;
}

export const PETS: PetDef[] = [
  // ---- drops: rare enemies and world bosses
  { id: 'kurt_yavrusu', name: 'Gece Kurdu Yavrusu', desc: 'Vadinin gölgesinden çıkmış küçük bir kurt.', shape: 'quad', color: 0x3d4450, accent: 0xc9d3e0, scale: 0.8,
    source: { kind: 'drop', table: 'loot_rare_golge_alfa', text: 'Nadir düşman: Gölge Alfa (Sisli Vadi)' } },
  { id: 'kizil_tilki', name: 'Kızıl Tilki', desc: 'Kuyruğu ateş gibi yanan, hızlı bir tilki.', shape: 'quad', color: 0xb4502a, accent: 0xf0e0c8, scale: 0.75,
    source: { kind: 'drop', table: 'loot_rare_kizil_kuyruk', text: 'Nadir düşman: Kızıl Kuyruk' } },
  { id: 'ejder_yavrusu', name: 'Küçük Ejder', desc: 'Ulu-Boz\'un kanından doğmuş minik bir ejder.', shape: 'dragon', color: 0x2e7d4f, accent: 0xf2c037, scale: 0.9,
    source: { kind: 'drop', table: 'loot_wb_ulu_boz', text: 'Dünya Boss\'u: Ulu-Boz (Karakır Bozkırı)' } },
  { id: 'buz_tilkisi', name: 'Buz Tilkisi', desc: 'Zemheri\'nin karından doğmuş, gözleri mavi parlayan küçük bir tilki.', shape: 'quad', color: 0xe8f4ff, accent: 0x6fb8e0, scale: 0.7,
    source: { kind: 'drop', table: 'loot_wb_ad_zemheri', text: 'Dünya Boss\'u: Zemheri (Ayaz Dağları)' } },
  { id: 'tas_kaplumbaga', name: 'Taş Kaplumbağa', desc: 'Sırtında yosun taşıyan yaşlı bir kaplumbağa.', shape: 'turtle', color: 0x7d7a6e, accent: 0x4f8a5b, scale: 0.8,
    source: { kind: 'drop', table: 'loot_wb_curukkok', text: 'Dünya Boss\'u: Çürükkök (Mantar Kral)' } },
  // ---- achievements
  { id: 'sisli_kedi', name: 'Sisli Kedi', desc: 'Savaşçıların peşini bırakmayan gri bir kedi.', shape: 'quad', color: 0x9aa3ad, accent: 0x2b2f36, scale: 0.65,
    source: { kind: 'ach', achId: 'sav_kill1000', text: 'Başarım: Savaş Ağası (1000 düşman)' } },
  { id: 'gece_baykusu', name: 'Gece Baykuşu', desc: 'Zindanların karanlığında gözleri parlayan bir baykuş.', shape: 'bird', color: 0x4a3b2c, accent: 0xe6c35c, scale: 0.7,
    source: { kind: 'ach', achId: 'zin_clear25', text: 'Başarım: Zindan Kurdu (25 zindan)' } },
  { id: 'altin_sincap', name: 'Altın Sincap', desc: 'Cebinde hep bir kese altın taşıyan sincap.', shape: 'quad', color: 0xd4a017, accent: 0xfff1b0, scale: 0.5,
    source: { kind: 'ach', achId: 'eko_gold1m', text: 'Başarım: Altın Kral (1.000.000 altın)' } },
  { id: 'kuzgun', name: 'Kuzgun', desc: 'Mitik anahtarların kokusunu alan bir kuzgun.', shape: 'bird', color: 0x1a1a22, accent: 0x6a5acd, scale: 0.6,
    source: { kind: 'ach', achId: 'mit_clear10', text: 'Başarım: Anahtar Ustası (10 Mitik+)' } },
  // ---- world events
  { id: 'tas_peri', name: 'Taş Perisi', desc: 'Metin taşlarının içinden süzülen küçük bir peri.', shape: 'orb', color: 0x7fd1c7, accent: 0xe8fff9, scale: 0.6,
    source: { kind: 'event', event: 'metin_storm', text: 'Etkinlik: Metin Fırtınası' } },
  { id: 'ruh_fener', name: 'Ruh Feneri', desc: 'Boss\'un ardından süzülen turuncu bir ruh feneri.', shape: 'orb', color: 0xff9d3a, accent: 0xfff0c2, scale: 0.55,
    source: { kind: 'event', event: 'world_boss', text: 'Etkinlik: Dünya Boss\'u' } },
  { id: 'koy_kopegi', name: 'Köy Çoban Köpeği', desc: 'Köy baskınlarında sürüyü toplayan sadık bir köpek.', shape: 'quad', color: 0x8c6239, accent: 0xf4efe4, scale: 0.9,
    source: { kind: 'event', event: 'village_raid', text: 'Etkinlik: Köy Baskını' } },
  { id: 'kervan_kecisi', name: 'Kervan Keçisi', desc: 'Goblin kervanının yolunu hiç şaşırmayan bir keçi.', shape: 'quad', color: 0xe9e2d0, accent: 0x5b4636, scale: 0.85,
    source: { kind: 'event', event: 'goblin_caravan', text: 'Etkinlik: Goblin Kervanı' } },
];

/** Chance that one event participant gets the event pet's teaching item (per finished event). */
export const PET_EVENT_CHANCE = 0.12;

export const PET_BY_ID: Readonly<Record<string, PetDef>> = Object.fromEntries(PETS.map((p) => [p.id, p]));

/** Material id of the teaching item of a pet (a stackable consumable, see data/materials.ts). */
export const petItemId = (petId: string): string => `pet_${petId}`;

/** The pet an event can teach (null when the event has none). */
export function petForEvent(event: string): PetDef | null {
  return PETS.find((p) => p.source.kind === 'event' && p.source.event === event) ?? null;
}
