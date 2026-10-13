/**
 * Combo routes ("Kombo Yolları", GDD_V2 §3.9). Data only; detection lives in combat/routes.ts (RouteTracker).
 * OWNER: combat (data). Types: types/v2.ts.
 *
 * Input tokens (the tracker records one token per landed action, at its impact time):
 *   L light chain step (any of the steps)   H charged heavy (tier 1)   A weapon art (tier 2)
 *   RUN running attack   JMP jump attack (lands)   ROL roll attack   DOD dodge roll start
 *   PAR parry (successful)   RIP riposte   RMB right-button skill   BSK backstab hit
 *   S:<skillId> any other keyed skill (q / e / r / s1..s3), by its SkillDef id
 *
 * windowFrom / windowTo: allowed seconds between two consecutive tokens (previous action end -> next action impact).
 * Negative windowFrom = the next press may land during the previous recovery (cancel window, GDD §3.9 "end + 0.35 s").
 * effect: 'bonus' = banner `ROTA: <name>` + one extra combo tier + 5% damage for 3 s; 'quiet' = counted but silent
 * (the classic chains are the existing LMB combo, not a route banner).
 */
import type { ComboRouteDef } from '../types/v2';

const CHAIN = { windowFrom: -0.5, windowTo: 0.6 };
const SKILL = { windowFrom: -0.5, windowTo: 0.8 };
const ROLL = { windowFrom: 0.2, windowTo: 0.7 };
const PARRY = { windowFrom: 0, windowTo: 2.0 };
const JUMP = { windowFrom: -0.5, windowTo: 0.8 };
const BACK = { windowFrom: -0.5, windowTo: 3.0 };

const route = (d: ComboRouteDef): ComboRouteDef => d;

export const COMBO_ROUTES: Readonly<Record<string, ComboRouteDef>> = {
  // ---- Şövalye (knight, 4-step chain) ----
  kn_r1: route({ id: 'kn_r1', classId: 'knight', name: 'Klasik', inputs: ['L', 'L', 'L', 'L'], ...CHAIN, effect: 'quiet' }),
  kn_r2: route({ id: 'kn_r2', classId: 'knight', name: 'Kalkan Ezme', inputs: ['L', 'L', 'H'], ...CHAIN, effect: 'bonus' }),
  kn_r3: route({ id: 'kn_r3', classId: 'knight', name: 'Hüküm Zinciri', inputs: ['L', 'L', 'L', 'H'], ...CHAIN, effect: 'bonus' }),
  kn_r4: route({ id: 'kn_r4', classId: 'knight', name: 'Koşu Zinciri', inputs: ['RUN', 'L', 'H'], ...CHAIN, effect: 'bonus' }),
  kn_r5: route({ id: 'kn_r5', classId: 'knight', name: 'Karşılık', inputs: ['PAR', 'RIP'], ...PARRY, effect: 'bonus' }),
  kn_r6: route({ id: 'kn_r6', classId: 'knight', name: 'Yuvarlanma Hücumu', inputs: ['DOD', 'ROL'], ...ROLL, effect: 'bonus' }),
  kn_r7: route({ id: 'kn_r7', classId: 'knight', name: 'Gökten Hüküm', inputs: ['JMP', 'L'], ...JUMP, effect: 'bonus' }),
  kn_r8: route({ id: 'kn_r8', classId: 'knight', name: 'Kalkan İptali', inputs: ['L', 'L', 'L', 'RMB', 'L'], ...CHAIN, effect: 'bonus' }),

  // ---- Barbar ----
  bb_r1: route({ id: 'bb_r1', classId: 'barbarian', name: 'Klasik', inputs: ['L', 'L', 'L', 'L'], ...CHAIN, effect: 'quiet' }),
  bb_r2: route({ id: 'bb_r2', classId: 'barbarian', name: 'Kafa Yaran', inputs: ['L', 'L', 'H'], ...CHAIN, effect: 'bonus' }),
  bb_r3: route({ id: 'bb_r3', classId: 'barbarian', name: 'Kasırga Finali', inputs: ['L', 'L', 'L', 'H'], ...CHAIN, effect: 'bonus' }),
  bb_r4: route({ id: 'bb_r4', classId: 'barbarian', name: 'Balta Atılışı', inputs: ['RUN', 'L'], ...CHAIN, effect: 'bonus' }),
  bb_r5: route({ id: 'bb_r5', classId: 'barbarian', name: 'Kemik Kıran', inputs: ['PAR', 'RIP'], ...PARRY, effect: 'bonus' }),
  bb_r6: route({ id: 'bb_r6', classId: 'barbarian', name: 'Dönen Kesik', inputs: ['DOD', 'ROL'], ...ROLL, effect: 'bonus' }),
  bb_r7: route({ id: 'bb_r7', classId: 'barbarian', name: 'Yer Çökertme', inputs: ['JMP', 'L'], ...JUMP, effect: 'bonus' }),
  bb_r8: route({ id: 'bb_r8', classId: 'barbarian', name: 'Silah Sanatı', inputs: ['A'], windowFrom: 0, windowTo: 0, effect: 'quiet' }),

  // ---- Büyücü (3-cast chain). mg_r6 / mg_r7 need the frost spells (no ice lance id yet): inert until those SkillDefs exist. ----
  mg_r1: route({ id: 'mg_r1', classId: 'mage', name: 'Klasik Salvo', inputs: ['L', 'L', 'L'], ...CHAIN, effect: 'quiet' }),
  mg_r2: route({ id: 'mg_r2', classId: 'mage', name: 'Gizem Mızrağı', inputs: ['L', 'L', 'H'], ...CHAIN, effect: 'bonus' }),
  mg_r3: route({ id: 'mg_r3', classId: 'mage', name: 'Çapraz Atış', inputs: ['DOD', 'ROL'], ...ROLL, effect: 'bonus' }),
  mg_r4: route({ id: 'mg_r4', classId: 'mage', name: 'Karşı Büyü', inputs: ['PAR', 'RIP'], ...PARRY, effect: 'bonus' }),
  mg_r5: route({ id: 'mg_r5', classId: 'mage', name: 'Süzülen Salvo', inputs: ['JMP', 'L'], ...JUMP, effect: 'bonus' }),
  mg_r6: route({ id: 'mg_r6', classId: 'mage', name: 'Buz Mızrağı Zinciri', inputs: ['S:mage_frost_nova', 'S:mage_ice_lance'], ...SKILL, effect: 'bonus' }),
  mg_r7: route({ id: 'mg_r7', classId: 'mage', name: 'Termal Şok', inputs: ['S:mage_ice_lance', 'S:mage_fireball'], ...SKILL, effect: 'bonus' }),
  mg_r8: route({ id: 'mg_r8', classId: 'mage', name: 'Silah Sanatı', inputs: ['A'], windowFrom: 0, windowTo: 0, effect: 'quiet' }),

  // ---- Haydut (4-step chain, Suikastçı backstab routes) ----
  rg_r1: route({ id: 'rg_r1', classId: 'rogue', name: 'Klasik', inputs: ['L', 'L', 'L', 'L'], ...CHAIN, effect: 'quiet' }),
  rg_r2: route({ id: 'rg_r2', classId: 'rogue', name: 'Hançer Fırtınası', inputs: ['L', 'L', 'A'], ...CHAIN, effect: 'bonus' }),
  rg_r3: route({ id: 'rg_r3', classId: 'rogue', name: 'Kayan Bıçak', inputs: ['RUN', 'L'], ...CHAIN, effect: 'bonus' }),
  rg_r4: route({ id: 'rg_r4', classId: 'rogue', name: 'Gölge Karşılığı', inputs: ['PAR', 'RIP'], ...PARRY, effect: 'bonus' }),
  rg_r5: route({ id: 'rg_r5', classId: 'rogue', name: 'Kuş Saldırısı', inputs: ['JMP', 'L'], ...JUMP, effect: 'bonus' }),
  rg_r6: route({ id: 'rg_r6', classId: 'rogue', name: 'Arkadan Dönüş', inputs: ['DOD', 'ROL'], ...ROLL, effect: 'bonus' }),
  rg_r7: route({ id: 'rg_r7', classId: 'rogue', name: 'Gölge Dörtlüsü', inputs: ['BSK', 'L', 'L', 'L'], ...CHAIN, effect: 'bonus' }),
  rg_r8: route({ id: 'rg_r8', classId: 'rogue', name: 'Pusu Zinciri', inputs: ['S:rogue_shadow_step', 'BSK'], ...BACK, effect: 'bonus' }),
};
