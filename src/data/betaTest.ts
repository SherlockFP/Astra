import type { TownNpc } from '../types/dungeons';

/**
 * Beta test town corner (owner request): a fenced "Test Alanı" in the Lonca Meydanı corner of Kuzgunkale with three target
 * dummies and the "Beta Rehberi" NPC. Only beta characters get it (TownScene: `ch.save.beta`). Positions are world metres
 * (origin = town centre, +x east, +z south); the walkable ground is snapped by the scene. Layout: systems/BetaTest.ts header.
 * OWNER: content module (data).
 */

/** Centre of the fenced area (Lonca Meydanı, the emptiest 22 m square of the town corner boxes). */
export const TEST_AREA = { cx: -140, cz: 76, halfW: 9, halfD: 8 } as const;

/** Beta Rehberi: the guide NPC. Its menu (ui/panels/game/betaGuide.ts) teleports to every zone and dungeon and resets the character. */
export const BETA_GUIDE_NPC: TownNpc = {
  id: 'beta_rehber',
  name: 'Beta Rehberi',
  role: 'citizen',
  model: 'Mage',
  pos: [TEST_AREA.cx - 7, 0, TEST_AREA.cz + 4],
  rot: 90,
  title: 'Test Alanı',
  show: ['1H_Wand'],
  tint: 0x3d7fd0,
  idle: 'Idle',
  ui: { panel: 'betaGuide' },
  lines: ['Hoş geldin, test kahramanı. Her şey açık: istediğine ışınlan.', 'Kuklaları vur, DPS ölçümünü gör.', 'Canın bitti mi? Sıfırlamayı unutma.'],
};

/** Target dummies of the corner (kinds of entities/interactables/TrainingDummy.ts). */
export const TEST_DUMMIES = {
  /** single target with a DPS readout */
  single: { x: TEST_AREA.cx - 3, z: TEST_AREA.cz - 2, kind: 'normal' as const },
  /** AoE pack: five dummies on a ring around the centre (the ring radius is in the scene) */
  pack: { x: TEST_AREA.cx + 3, z: TEST_AREA.cz + 3, count: 5, ring: 2.2 },
  /** the tank dummy hits back: a blow of 6 % max HP every 2.5 s while the player stands within 4.5 m */
  tank: { x: TEST_AREA.cx + 5, z: TEST_AREA.cz - 4, kind: 'tank' as const },
};
export const TANK_DUMMY = { strikeEvery: 2.5, range: 4.5, hpFrac: 0.06 } as const;

/** Teleport targets of the guide: open-world zones (spawn = the zone's gate or entrance, as the town's own gates use). */
export const BETA_ZONES: { id: string; name: string; spawn: { type: 'gate' | 'entrance'; id: string }; note: string }[] = [
  { id: 'sisli_vadi', name: 'Sisli Vadisi', spawn: { type: 'gate', id: 'guney_kapisi' }, note: 'Açık dünya · Sv. 1-30' },
  { id: 'karakir_bozkiri', name: 'Karakır Bozkırı', spawn: { type: 'gate', id: 'dogu_kapisi' }, note: 'Açık dünya · Sv. 30-40' },
  { id: 'ayaz_daglari', name: 'Ayaz Dağları', spawn: { type: 'entrance', id: 'ent_karakir_gecidi' }, note: 'Açık dünya · Sv. 45+' },
  { id: 'kizil_sinir', name: 'Kızıl Sınır', spawn: { type: 'gate', id: 'bati_kapisi' }, note: 'PvP bölgesi · Sv. 35+' },
];
