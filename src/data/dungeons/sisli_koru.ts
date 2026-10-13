import type { DungeonDef, PackDef, RoomDef } from '../../types/dungeons';
import { hashString, RNG } from '../../core/utils';
import {
  bossAt, decorator, gp, hw, kc, kg, kn, ks, lt, makeCtx, pack, rectsOf, room, shPt, tw, withProps,
} from './kit';

/**
 * DEPRECATED (GDD_OPENWORLD WP2): superseded by data/world/sisli_vadi.ts. The town's South Gate now leads to Sisli Vadi. This file is
 * kept for its scenery recipes and the legacy id only (`sisli_koru` stays in OPEN_ZONES until WP1's alias lands). Do not extend it.
 *
 * SISLI KORU (misty forest, open world, levels 1-10) - GDD_CONTENT 2.6. One 50 x 50 tile (200 m) outdoor zone expressed as a
 * DungeonDef with `outdoor: true`: ONE room, tree walls instead of stone walls (the builder's OutdoorScenery), camps are packs
 * with respawn timers / level ranges / radii. NOT registered in DUNGEONS (it is no dungeon: keystone UI and portals iterate
 * DUNGEON_IDS); use getDungeon('sisli_koru') or OPEN_ZONES.
 * Entry (25, 1) facing 0 from the town's south gate; the return portal Kuzgunkale Kapisi stands at (25, 2).
 */

const ROOMS: RoomDef[] = [
  room('koru', 'Sisli Koru', 0, 0, 50, 50, 'dirt', 'cave', 0, { ambientVfx: 'ambient_dust', explicitDecor: true, lightColor: 0xc8d8b0 }),
];

type Member = [enemyId: string, count: number];
/** A camp of mixed members arranged on a golden-angle spiral inside `rTiles`. */
function camp(
  id: string, cx: number, cz: number, radiusM: number, levels: [number, number], respawn: number, members: Member[], extra: Partial<PackDef> = {},
): PackDef {
  const ids: string[] = [];
  for (const [e, n] of members) for (let i = 0; i < n; i++) ids.push(e);
  const rT = Math.min(2.6, (radiusM / 4) * 0.55);
  const tuples = ids.map((e, i) => {
    const a = i * 2.39996, d = i === 0 && ids.length > 1 ? 0 : rT * Math.sqrt((i + 0.5) / ids.length);
    return [e, +(Math.sin(a) * d).toFixed(2), +(Math.cos(a) * d).toFixed(2)] as [string, number, number];
  });
  const forces = ids.reduce((a, e) => a + (e === 'skel_minion' ? 2 : 0), 0);   // open-world mobs carry no forces except the crypt skeletons
  return pack(id, 'koru', cx, cz, forces, tuples, { respawnSec: respawn, levelRange: levels, radius: radiusM, ...extra });
}

const PACKS: PackDef[] = [
  camp('ow_c01', 25, 8, 12, [1, 2], 60, [['ow_rat', 6]], { note: 'Fare Yuvasi' }),
  camp('ow_c02', 14, 12, 16, [1, 3], 60, [['ow_slime', 5]], { note: 'Balcik Golu' }),
  camp('ow_c03', 36, 13, 16, [2, 4], 75, [['ow_goblin', 5], ['ow_goblin_shaman', 1]], { note: 'Yagmaci Kampi' }),
  camp('ow_c04', 10, 24, 16, [3, 5], 60, [['ow_mushnub', 8]], { note: 'Mantar Halkasi' }),
  camp('ow_c05', 40, 25, 16, [4, 6], 75, [['ow_spider', 4], ['ow_rat', 4]], { note: 'Orumcek Korusu' }),
  camp('ow_c06', 24, 27, 20, [5, 7], 90, [['ow_zombie', 6], ['ow_bat', 4]], { note: 'Terk Edilmis Koy' }),
  camp('ow_c07', 8, 38, 12, [6, 8], 60, [['ow_bat', 8]], { note: 'Yarasa Magarasi' }),
  camp('ow_c08', 38, 38, 20, [7, 9], 120, [['ow_orc_chief', 1], ['ow_goblin', 6], ['ow_goblin_shaman', 2]], { note: 'Ork Karakolu' }),
  camp('ow_c09', 16, 42, 16, [8, 10], 90, [['ow_zombie', 5], ['skel_minion', 3]], { note: 'Kayip Mezarlik' }),
];

const BOSSES = [
  // Curukkok, the Mushroom King (world boss, level 10): the Curuk Hoyuk arena, r 6 tiles
  bossAt('wb_curukkok', 'koru', 25, 44, 0, 1),
];

const START: [number, number] = [25, 1];
const EXIT: [number, number] = [25, 2];

const ctx = makeCtx('sisli_koru', [], PACKS, [
  { x: START[0], z: START[1], r: 2.0 },
  { x: EXIT[0], z: EXIT[1], r: 3.0 },
  { x: 25, z: 44, r: 5.0 },
]);
const D = decorator(ctx, rectsOf(ROOMS));
const rng = new RNG(hashString('sisli_koru:props'));

D.room('koru', (p) => {
  // ---- return portal: Kuzgunkale Kapisi (golden swirl) --------------------------------------------------------------
  p.at(hw('arch'), 25, 2.4, { scale: 1.6, id: 'return_portal', vfx: 'portal_swirl', light: lt(0xffd070, 2.4, 14, true, 3.0), tint: 0xe8e0d0 });
  p.at(gp('lamp_post'), 22.6, 2.4, { rot: 90, collide: true }).at(gp('lamp_post'), 27.4, 2.4, { rot: -90, collide: true });
  p.at(ks('signpost'), 28.6, 4.6, { scale: 3, rot: 200, id: 'sign_south' }).at(gp('signpost'), 21.4, 4.2, { rot: 160 });

  // ---- ow_c01 Fare Yuvasi (25, 8): logs, stumps, a rotten barrel -----------------------------------------------------------
  p.at(kn('log_stackLarge'), 22.0, 6.4, { scale: 4, rot: 30, collide: true }).at(kn('stump_oldTall'), 28.4, 9.6, { scale: 4, rot: 100, collide: true });
  p.at(kn('log_large'), 27.6, 6.0, { scale: 4, rot: 75 }).at(gp('barrel'), 22.8, 10.2, { rot: 140, collide: true }).at(kn('mushroom_tanGroup'), 28.0, 7.6, { scale: 5 });
  p.at(gp('bone_pile'), 24.2, 10.6, { rot: 20 }).at(gp('rock_medium'), 21.2, 9.0, { rot: 60, collide: true });

  // ---- ow_c02 Balcik Golu (14, 12): green slime pond rocks, reeds ---------------------------------------------------------
  for (const [x, z, s] of [[11.4, 9.4, 1.0], [16.8, 9.2, 0.8], [10.6, 14.4, 1.2], [17.6, 14.6, 0.9], [14.2, 16.0, 1.0]] as [number, number, number][]) {
    p.at(gp('rock_medium'), x, z, { scale: s, rot: rng.range(0, 360), collide: true });
  }
  for (let i = 0; i < 9; i++) p.at(tw(`decoration/nature/waterplant_${'ABC'[i % 3]}`), 14 + rng.range(-1.9, 1.9), 12.4 + rng.range(-1.6, 1.6), { scale: 6, rot: rng.range(0, 360) });
  p.at(gp('crystal_blue'), 13.0, 11.2, { scale: 0.5, emissive: 0x60ff90, light: lt(0x60ff90, 1.0, 7, true, 0.6) });

  // ---- ow_c03 Yagmaci Kampi (36, 13): goblin tents, fire, loot ------------------------------------------------------------
  p.at(ks('tent'), 33.0, 10.0, { scale: 4, rot: 30, collide: true }).at(ks('tent'), 39.4, 10.6, { scale: 4, rot: -40, collide: true }).at(tw('decoration/props/tent'), 36.4, 16.6, { scale: 6, rot: 180, collide: true });
  p.at(gp('campfire'), 36.0, 12.4, { rot: 10, light: lt(0xff7a2a, 2.2, 11, true, 0.9), vfx: 'ambient_embers' });
  p.at(gp('crate_a'), 40.8, 14.0, { collide: true }).at(gp('barrel'), 40.2, 15.2, { collide: true }).at(gp('sacks'), 32.6, 14.8, { rot: 50 }).at(gp('bone_pile'), 33.4, 13.2, { rot: 200 });
  p.row(ks('fence-fortified'), 32.0, 17.6, 40.0, 17.6, 9, { scale: 4, rot: 0 });

  // ---- ow_c04 Mantar Halkasi (10, 24): a ring of toadstools --------------------------------------------------------------
  p.ring(kn('mushroom_redGroup'), 10, 24, 2.5, 12, { scale: 9, collide: false }, 'out', 8);
  p.at(kn('mushroom_redTall'), 10.0, 24.0, { scale: 12 }).at(kn('mushroom_tanGroup'), 12.4, 21.6, { scale: 9, rot: 40 }).at(kn('mushroom_tanGroup'), 7.6, 26.6, { scale: 9, rot: 200 });

  // ---- ow_c05 Orumcek Korusu (40, 25): dead trees and webs of bones ---------------------------------------------------------
  for (const [x, z, rot] of [[37.4, 22.4, 20], [43.0, 23.0, 160], [37.8, 28.2, 250], [43.4, 27.8, 80]] as [number, number, number][]) p.at(gp('tree_dead'), x, z, { rot, collide: true });
  p.at(gp('bone_pile'), 40.0, 22.6, { rot: 40 }).at(gp('bone_pile'), 41.6, 28.0, { rot: 190 }).at(gp('rock_large'), 45.0, 25.0, { rot: 30, collide: true }).at(gp('rock_medium'), 35.6, 25.6, { rot: 120, collide: true });

  // ---- ow_c06 Terk Edilmis Koy (24, 27): empty farmhouses, a well, wagon, fences ----------------------------------------------
  p.at(tw('buildings/red/building_home_A_red'), 19.4, 24.0, { scale: 6, rot: 90, collide: true, tint: 0xbba890 });
  p.at(tw('buildings/green/building_home_B_green'), 29.2, 24.4, { scale: 6, rot: -90, collide: true, tint: 0xbba890 });
  p.at(tw('buildings/neutral/building_destroyed'), 24.0, 32.4, { scale: 6, rot: 180, collide: true });
  p.at(tw('buildings/blue/building_well_blue'), 24.0, 21.4, { scale: 4, collide: true, tint: 0xbba890 });
  p.at(gp('wagon'), 28.0, 29.8, { rot: 70, collide: true }).at(kg('hay-bale'), 20.6, 29.4, { scale: 3, rot: 20, collide: true }).at(kg('hay-bale'), 21.6, 30.4, { scale: 3, rot: -30 });
  p.row(gp('fence_wood'), 18.0, 27.8, 18.0, 33.0, 4, { rot: 90, collide: true }).at(gp('fence_wood'), 31.0, 30.6, { rot: 20 });
  p.at(kg('pumpkin-carved'), 20.8, 25.8, { scale: 3, rot: 150 }).at(kg('lantern-candle'), 22.0, 24.4, { scale: 3, light: lt(0xffb060, 1.0, 6, true, 0.5) });

  // ---- ow_c07 Yarasa Magarasi (8, 38): a cave mouth of cliff rocks ---------------------------------------------------------------
  p.at(gp('rock_cliff'), 4.4, 35.4, { rot: 70, scale: 1.1, collide: true }).at(gp('rock_cliff'), 4.6, 41.4, { rot: 110, scale: 1.0, collide: true }).at(gp('rock_cliff'), 10.6, 33.2, { rot: 10, scale: 0.9, collide: true });
  p.at(gp('bone_pile'), 6.6, 38.6, { rot: 80 }).at(gp('rock_large'), 11.6, 41.4, { rot: 200, collide: true }).at(gp('chest_wood'), 5.6, 39.8, { rot: 90, collide: true, tag: 'chest', id: 'cave_chest' });

  // ---- ow_c08 Ork Karakolu (38, 38): a watch tower, palisade, tents ----------------------------------------------------------------
  p.at(tw('buildings/red/building_tower_A_red'), 43.4, 33.6, { scale: 6, rot: -135, collide: true, tint: 0x9a8a78 });
  p.at(tw('buildings/red/building_barracks_red'), 33.4, 42.4, { scale: 5, rot: 30, collide: true, tint: 0x9a8a78 });
  p.at(ks('tent'), 41.6, 41.6, { scale: 4, rot: -120, collide: true }).at(ks('tent'), 44.6, 38.4, { scale: 4, rot: -80, collide: true });
  p.at(gp('campfire'), 38.2, 38.2, { light: lt(0xff7a2a, 2.4, 12, true, 0.9), vfx: 'ambient_embers' });
  p.row(ks('fence-fortified'), 31.0, 34.6, 45.0, 34.6, 15, { scale: 4, rot: 0 });
  p.at(tw('decoration/props/weaponrack'), 35.4, 34.0, { scale: 6, rot: 180, collide: true }).at(gp('crate_b'), 34.0, 36.4, { collide: true }).at(gp('barrel'), 42.2, 35.8, { collide: true });
  p.at(gp('banner_red'), 36.4, 33.4, { rot: 0, tint: 0x6a2a20 });

  // ---- ow_c09 Kayip Mezarlik (16, 42) + the sealed Kemik Mahzeni crypt door (16, 46) -----------------------------------------------
  p.at(kg('crypt-large'), 16.0, 46.4, { scale: 3, collide: true, id: 'crypt_hint', tag: 'gate', tint: 0xcfd0c8 });
  p.at(kg('crypt-large-door'), 16.0, 44.9, { scale: 3, rot: 0 }).at(gp('statue_hooded'), 13.0, 45.4, { rot: 20, collide: true, tint: 0x8a9488 }).at(gp('statue_hooded'), 19.0, 45.4, { rot: -20, collide: true, tint: 0x8a9488 });
  for (const [x, z] of [[12.4, 40.4], [14.6, 39.6], [18.2, 40.0], [20.0, 41.6], [12.0, 43.6], [20.6, 44.0]] as [number, number][]) {
    p.at(kg(rng.chance(0.5) ? 'gravestone-cross' : 'gravestone-round'), x, z, { scale: 3, rot: rng.range(-20, 20), collide: true });
  }
  for (const [x, z, rot] of [[10.6, 38.4, 0], [14.0, 37.6, 0], [18.0, 37.8, 0], [21.6, 38.6, 40], [22.4, 42.4, 90], [22.2, 46.2, 90], [10.0, 42.2, 90], [10.4, 46.0, 90]] as [number, number, number][]) {
    p.at(kc('wall-half'), x, z, { scale: 3, rot, collide: true });
  }
  p.at(kg('cross-wood'), 17.6, 43.6, { scale: 3, rot: 12 }).at(kg('cross-wood'), 14.4, 44.0, { scale: 3, rot: -20 }).at(gp('tree_dead'), 22.8, 40.0, { rot: 130, collide: true });
  p.at(kg('lantern-candle'), 15.4, 43.0, { scale: 3, light: lt(0x9fffd0, 1.0, 6, true, 0.5) });

  // ---- Curuk Hoyuk (25, 44): the mushroom king's mound, a ring of giant toadstools ----------------------------------------------------
  p.ring(kn('mushroom_redGroup'), 25, 44, 5.2, 16, { scale: 14, collide: false }, 'out', 5);
  p.ring(kn('mushroom_tanGroup'), 25, 44, 4.4, 8, { scale: 11 }, 'out', 20);
  p.at(kn('mushroom_redTall'), 25, 47.6, { scale: 22, collide: true }).at(kn('mushroom_redTall'), 21.4, 43.4, { scale: 17, collide: true }).at(kn('mushroom_redTall'), 28.6, 42.6, { scale: 16, collide: true });
  p.at(gp('crystal_purple'), 22.0, 47.0, { scale: 0.8, emissive: 0xb060ff, vfx: 'ambient_shadow_wisps', light: lt(0xb060ff, 1.6, 10, true, 0.8) }).at(gp('crystal_purple'), 28.6, 46.6, { scale: 0.7, emissive: 0xb060ff, light: lt(0xb060ff, 1.4, 9, true, 0.8) });

  // ---- Lanetli Sandik spots (32, 20) and (12, 32): cursed chests (event spawns, GDD 1.8) ---------------------------------------------------
  for (const [i, [x, z]] of ([[32, 20], [12, 32]] as [number, number][]).entries()) {
    p.at(gp('chest_iron'), x, z, { rot: 20, collide: true, tag: 'chest', id: `cursed_chest_${i + 1}`, tint: 0x9a70c0, emissive: 0xb060ff, emissiveIntensity: 0.35, light: lt(0xb060ff, 1.4, 8, true, 0.7) });
    p.at(gp('bone_pile'), x + 1.3, z + 0.6, { rot: 100 });
  }

  // ---- loose scenery between the camps ---------------------------------------------------------------------------------------------------
  for (const [x, z] of [[24, 16], [30, 20], [18, 20], [26, 35], [30, 44], [6, 8], [44, 10], [46, 32]] as [number, number][]) {
    p.at(gp('rock_small'), x, z, { scale: 1.2, rot: rng.range(0, 360) });
  }
  p.at(gp('signpost'), 25.6, 18.4, { rot: 190 }).at(gp('signpost'), 30.2, 33.6, { rot: 120 });
});

export const SISLI_KORU: DungeonDef = {
  id: 'sisli_koru',
  name: 'Sisli Koru',
  shortName: 'Koru',
  lore: 'Kuzgunkale\'nin güneyinde, sisle kaplı bir orman vadisi. Terk edilmiş çiftlikler, bir goblin yağmacı kampı, eski bir mezarlık ve mantar kralın büyüdüğü çürük bir höyük burada seni bekliyor.',
  levelRange: [1, 10],
  timerSec: 0,
  forcesRequired: 0,
  theme: {
    fogColor: 0x9aa890, fogNear: 15, fogFar: 70, ambient: 0x607060, ambientIntensity: 0.3, hemiSky: 0xc0d0b0, hemiGround: 0x303820,
    torchColor: 0xffa050, bloomStrength: 0.3, music: 'town', palette: [0x303820, 0x6a7a58, 0x9aa890, 0xc0d0b0, 0xffa050], tint: 0xdde4d0,
  },
  grid: { w: 50, h: 50 },
  rooms: withProps(ROOMS, D.out),
  doors: [],
  packs: PACKS,
  bosses: BOSSES,
  start: { pos: shPt(START[0], START[1]), facing: 0 },
  exit: { pos: shPt(EXIT[0], EXIT[1]) },
  outdoor: true,
};

