/**
 * Food and drink (WoW style) and the flask bar item. OWNER: items (data); the use logic lives in Combat.useFood / Combat.useFlask.
 * Food is a material (kind consumable) bought at the Gümüşdere bakkal, and sits on the bar like a potion. Eating restores HP
 * over time out of combat (the food_regen status, broken by any damage); drinking restores mana at once.
 * Registered into the shared materials registry, like POTION_PANZEHIR in items.ts.
 */
import { MATERIALS, type MaterialDef } from './materials';
import { SISLI_MATARA_ID } from './flasks';

export const FOOD_BREAD_ID = 'food_kizarmis_ekmek';
export const FOOD_WATER_ID = 'food_kaynak_suyu';
export const FOOD_STEW_ID = 'food_avci_guvec';

export interface FoodDef {
  id: string;
  /** 'eat' restores HP over time (food_regen); 'drink' restores mana at once. */
  kind: 'eat' | 'drink';
  /** eat: HP per second as a fraction of max HP, for `hotSec` seconds (broken by damage). */
  hotPct: number;
  hotSec: number;
  /** drink: fraction of max mana restored at once. */
  resourcePct: number;
  /** Well Fed buff (food_well_fed style status `well_fed`), seconds. 0 = none. */
  wellFedSec: number;
}

export const FOOD: Readonly<Record<string, FoodDef>> = {
  [FOOD_BREAD_ID]: { id: FOOD_BREAD_ID, kind: 'eat', hotPct: 0.05, hotSec: 15, resourcePct: 0, wellFedSec: 0 },
  [FOOD_WATER_ID]: { id: FOOD_WATER_ID, kind: 'drink', hotPct: 0, hotSec: 0, resourcePct: 0.3, wellFedSec: 0 },
  [FOOD_STEW_ID]: { id: FOOD_STEW_ID, kind: 'eat', hotPct: 0.05, hotSec: 15, resourcePct: 0, wellFedSec: 1800 },
};

export const getFood = (id: string): FoodDef | undefined => FOOD[id];

const ic = (name: string) => `/assets/icons/${name}.svg`;

const FOOD_MATERIALS: MaterialDef[] = [
  { id: FOOD_BREAD_ID, name: 'Kızarmış Ekmek', desc: 'Dinlenirken can yeniler. 15 sn boyunca saniyede %5 can. Hasar alırsan kesilir.', icon: ic('buff-regen'), rarity: 'common', sellPrice: 1, buyPrice: 4, kind: 'consumable', maxStack: 20, requiredLevel: 1 },
  { id: FOOD_WATER_ID, name: 'Kaynak Suyu', desc: 'Ruh gücünü yeniler (%30).', icon: ic('item-potion-mana'), rarity: 'common', sellPrice: 1, buyPrice: 3, kind: 'consumable', maxStack: 20, requiredLevel: 1 },
  { id: FOOD_STEW_ID, name: 'Avcı Güveci', desc: 'Dinlenirken can yeniler (15 sn). 30 dakika boyunca Tok Karnı: maksimum can %3 artar.', icon: ic('item-potion-elixir'), rarity: 'uncommon', sellPrice: 8, buyPrice: 25, kind: 'consumable', maxStack: 10, requiredLevel: 1 },
  // Sisli Matara: the refillable flask. It sits on the bar and in the flask belt; its charges live in save.flaskCharges.
  { id: SISLI_MATARA_ID, name: 'Sisli Matara', desc: '3 yük. 20 sn bekleme. Bir köyde ya da kampta yeniden doldurulur.', icon: ic('item-potion-flask'), rarity: 'common', sellPrice: 0, kind: 'consumable', maxStack: 1, requiredLevel: 1 },
];
for (const m of FOOD_MATERIALS) MATERIALS[m.id] = m;
