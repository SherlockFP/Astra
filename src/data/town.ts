import { RNG, hashString } from '../core/utils';
import type { TownDef, TownNpc, TownProp } from '../types/dungeons';
import { dg, fu, gp, hw, ip, kf, kg, kn, ks, tw } from './dungeons/kit';

/**
 * KUZGUNKALE ("Kadim Zindanlarin Kapisi") - the hub town, GDD_CONTENT section 2. OWNER: content module.
 *
 * 320 x 320 m (WP-11: grown from 120 m, with outer districts and gates on the new wall), origin at the centre, +x east, +z south. The north terrace (Kadim Kapilar Salonu) is raised +2 m; the four dungeon
 * portals stand on it. World metres, rotations in degrees (yaw 0 faces +z = south, 180 faces north).
 *
 * What lives where:
 *  - this file: buildings, plaza, market, craft street, training ground, tavern yard, portal hall decor, all NPCs / portals /
 *    interactable stand-ins (with loadout, clips, lines) and the lighting / terrace / stairs / exit / zone data;
 *  - the world TownBuilder: walls + gate + flags, terrain, nature, sky, and the default POI models (Font of Power is re-placed here
 *    on the terrace, the lobby obelisk and the notice board stay with the builder defaults because the interactables adopt them).
 * Props whose model path contains "wall_" or "fence_stone" must not be added here: the builder then assumes the town brings its
 * own walls and skips the default ones.
 */

const props: TownProp[] = [];
type PO = Partial<Omit<TownProp, 'model' | 'pos'>> & { y?: number };
const add = (model: string, x: number, z: number, o: PO = {}): void => {
  const { y, ...rest } = o;
  props.push({ model, pos: [x, y ?? 0, z], ...rest });
};
const rng = new RNG(hashString('kuzgunkale'));
const deg = (r: number): number => (r * 180) / Math.PI;
const WARM = 0xff9a40;

// ---------------------------------------------------------------------------------------------------------------------
// Buildings (KayKit hexagon pack, x6 scale, box colliders from the model)
// ---------------------------------------------------------------------------------------------------------------------
const bld = (name: string, colour: string, x: number, z: number, rot: number, o: PO = {}): void =>
  add(tw(`buildings/${colour}/building_${name}_${colour}`), x, z, { rot, scale: 6, collide: true, ...o });

bld('blacksmith', 'red', 36, -6, -90);
bld('market', 'blue', -36, -8, 90);
bld('home_A', 'green', -36, 6, 90);
bld('home_B', 'blue', -36, 18, 90);
bld('tavern', 'yellow', 40, 42, -90);
// East Gate (Doğu Kapısı, exit 'dogu_kapisi' -> Karakır Bozkırı): arch over the exit box x 58..62, z -4..4, lamps either side
add(hw('arch'), 158, 0, { rot: 90, scale: 2 });
// West Gate (Batı Kapısı, exit 'bati_kapisi' -> Kızıl Sınır, the PvP zone, level 35+): the same arch, mirrored, with a blue and a red banner
add(hw('arch'), -158, 0, { rot: 90, scale: 2 });
add(gp('banner_blue'), -157, -6, { rot: 90, scale: 1.5 });
add(gp('banner_red'), -157, 6, { rot: 90, scale: 1.5 });
add(gp('lamp_post'), -156, -4, { light: { color: WARM, intensity: 0.35, distance: 6, flicker: true, y: 3 } });
add(gp('lamp_post'), -156, 4, { light: { color: WARM, intensity: 0.35, distance: 6, flicker: true, y: 3 } });
// gate lamps: a warm lantern glow (the light sits 3 m up; a stronger one made a white pool on the road under each post)
add(gp('lamp_post'), 156, -4, { light: { color: WARM, intensity: 0.35, distance: 6, flicker: true, y: 3 } });
add(gp('lamp_post'), 156, 4, { light: { color: WARM, intensity: 0.35, distance: 6, flicker: true, y: 3 } });
bld('church', 'blue', -44, -44, 45);
bld('windmill', 'yellow', 44, -44, 0);
bld('home_A', 'red', 46, -24, -90);
bld('home_B', 'red', 46, 26, -90);
bld('home_A', 'blue', 52, -12, -90);
bld('home_B', 'green', 52, 6, -90);
bld('home_B', 'yellow', -52, -22, 90);
bld('home_A', 'red', -52, -6, 90);
bld('home_B', 'green', -52, 12, 90);
bld('well', 'blue', -12, 30, 0);
for (const [x, z, c, r] of [[-53.5, -53.5, 'blue', 45], [53.5, -53.5, 'red', -45], [-53.5, 53.5, 'green', 135], [53.5, 53.5, 'yellow', -135]] as [number, number, string, number][]) {
  bld('tower_B', c, x, z, r);
}
bld('castle', 'blue', 0, -72, 0, { scale: 8, collide: false });          // backdrop outside the wall

// ---------------------------------------------------------------------------------------------------------------------
// Plaza (Meydan): fountain, benches, flower beds, lamp ring
// ---------------------------------------------------------------------------------------------------------------------
// the Kenney colormap region this model uses is a pale grey-white stone: a warm sandstone tint reads as carved stone, not as grey metal
add(kf('fountain-round-detail'), 0, 8, { scale: 4, collide: true, radius: 4.4, id: 'fountain', tint: 0xe0c4a4 });
for (let k = 0; k < 4; k++) {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  const x = Math.sin(a) * 8.6, z = 8 + Math.cos(a) * 8.6;
  add(kg('bench'), x, z, { rot: deg(Math.atan2(-x, 8 - z)) + 180, scale: 3, collide: true, radius: 1.0 });
}
// flower beds between the benches
for (let k = 0; k < 8; k++) {
  const a = (k * Math.PI) / 4 + 0.2;
  const x = Math.sin(a) * 11.6, z = 8 + Math.cos(a) * 11.6;
  add(k % 2 ? gp('bush_a') : gp('bush_b'), x, z, { rot: rng.range(0, 360), scale: 1.1 });
  for (let f = 0; f < 3; f++) {
    const fl = [kn('flower_redA'), kn('flower_yellowA'), kn('flower_purpleA')][(k + f) % 3];
    add(fl, x + rng.range(-1.1, 1.1), z + rng.range(-1.1, 1.1), { rot: rng.range(0, 360), scale: 4 });
  }
}
// lamp posts: plaza ring + main road (the generated lamp post carries its own warm light)
// the ring's south post (k 3, z 23.6) stood 2.4 m in front of the spawn (z 26) on the walking line and in the camera's view: left out
for (let k = 0; k < 3; k++) {
  const a = Math.PI / 4 + (k * Math.PI) / 2 + Math.PI / 4;
  const x = Math.sin(a) * 15.6, z = 8 + Math.cos(a) * 15.6;
  add(gp('lamp_post'), x, z, { rot: deg(Math.atan2(-x, 8 - z)), collide: true, radius: 0.4 });
}
for (const z of [50, 38, 28, -12, -22]) for (const sx of [-1, 1]) add(gp('lamp_post'), sx * 6.2, z, { rot: sx > 0 ? -90 : 90, collide: true, radius: 0.4 });
// braziers on columns along the road (fire-basket, warm light)
const brazier = (x: number, z: number, y = 0): void => {
  add(dg('column'), x, z, { y, scale: 1.5, collide: true, radius: 0.6, tint: 0xd8cfc0 });
  // the basket's flame sits ~2.3 m up; a gentle light (0.45 = 10 cd, 6 m reach): a full 1.0 washed the road out under the stairs
  add(kg('fire-basket'), x, z, { y: y + 2.1, scale: 3, emissive: WARM, emissiveIntensity: 0.8, light: { color: WARM, intensity: 0.45, distance: 6, flicker: true, y: 0.2 } });
};
for (const [x, z] of [[6, 50], [-6, 50], [6, 38], [-6, 38], [6, -20], [-6, -20]] as [number, number][]) brazier(x, z);

// ---------------------------------------------------------------------------------------------------------------------
// Carsi (market, west): stalls, crates, produce, alchemist, stash chests
// ---------------------------------------------------------------------------------------------------------------------
add(kf('stall-red'), -21, -14, { rot: 90, scale: 3.5, collide: true });
add(kf('stall-green'), -21, -2, { rot: 90, scale: 3.5, collide: true });
add(kf('stall-bench'), -17.8, -14, { rot: 90, scale: 3 });
add(kf('stall-stool'), -23.6, -14.6, { rot: 20, scale: 3 });
add(gp('wagon'), -29, -21, { rot: 20, collide: true });
add(gp('crate_b'), -17.2, -19.6, { rot: 20, collide: true });
add(gp('crate_a'), -18.6, -20.2, { collide: true });
add(gp('crate_a'), -18.6, -20.2, { y: 1.0, rot: 35 });
add(gp('sacks'), -18.5, 7, { rot: 70 });
add(gp('barrel'), -17.5, -8, { collide: true, radius: 0.5 });
add(gp('barrel'), -16.8, -7, { collide: true, radius: 0.5 });
add(tw('decoration/props/wheelbarrow'), -17.4, -4.4, { rot: 160, scale: 6 });
add(tw('decoration/props/crate_A_big'), -23.4, -19.2, { rot: 10, scale: 6, collide: true, radius: 0.7 });
add(tw('decoration/props/sack'), -18.2, 0.4, { rot: 40, scale: 6 });
add(tw('decoration/props/resource_lumber'), -29.4, -16.6, { rot: 90, scale: 6 });
// produce in front of the stalls (itch PSX medieval market pack)
const produce = (name: string, x: number, z: number, rot = 0, s = 1.2): void => add(ip('psx-medieval', `market/${name}`), x, z, { rot, scale: s });
produce('crate_apples', -18.9, -12.6, 90); produce('crate_potatoes', -18.9, -15.5, 90); produce('crate_tomatoes_angled', -19.2, -17.1, 70);
produce('basket_apples', -22.9, -11.6, 0, 1.1); produce('basket_onions', -23.2, -16.2, 0, 1.1);
produce('barrel_potatoes', -24.0, -12.0, 0, 1.0); produce('barrel_apples_small', -24.2, -10.8, 40, 1.1);
produce('crate_beans', -18.9, -3.4, 90); produce('crate_eggplants', -18.9, -0.6, 90); produce('basket_beans', -23.1, -3.8, 0, 1.1);
produce('jutesack_open', -23.4, 0.1, 30, 1.2); produce('barrel_onion_small', -24.0, -1.0, 0, 1.1); produce('bread', -21.0, -2.2, 0, 1.4);
add(ip('psx-medieval', 'market/haybale_wrapped'), -27.4, -20.6, { rot: 5, scale: 1.2, collide: true });
// alchemist: cauldron over a campfire stand, buckets, table, bottles
// no light of its own: a 1.4 green point light at 1.2 m made a blown-out pool plus a second halo on top of the cauldron's (the cauldron keeps one)
add(ks('campfire-stand'), -21.5, 4, { scale: 3, rot: 90, vfx: 'poison_cloud', vfxColor: 0x40ff80, vfxScale: 0.5, collide: true, radius: 0.9 });
add(gp('cauldron'), -21.5, 4, { y: 0.6, scale: 0.8, rot: 90 });
add(ks('bucket'), -20.3, 2.6, { scale: 3 }); add(ks('bucket'), -20.1, 3.4, { scale: 3, rot: 40 }); add(ks('bucket'), -22.9, 5.7, { scale: 3, rot: 200 });
add(gp('alchemy_table'), -21.5, 9.5, { rot: 90, collide: true });
for (const [i, [bx, bz]] of ([[-21.6, 8.7], [-21.4, 9.2], [-21.8, 10.2], [-21.5, 10.7]] as [number, number][]).entries()) {
  add(dg(['bottle_A_green', 'bottle_B_brown', 'bottle_C_green', 'bottle_A_brown'][i]), bx, bz, { y: 1.33, scale: 0.6, rot: rng.range(0, 360) });
}
add(dg('shelf_large'), -18.2, 6.6, { rot: 90, y: 1.5, scale: 1.4 });
// stash: three iron chests next to Depocu Bekir (they open the stash too)
for (const z of [12, 14, 16]) add(gp('chest_iron'), -27, z, { rot: 90, collide: true, radius: 0.7, id: `stash_chest_${z}` });

// ---------------------------------------------------------------------------------------------------------------------
// Zanaat Sokagi (craft street, east): smithy, forge, enchanter
// ---------------------------------------------------------------------------------------------------------------------
add(ks('workbench-anvil'), 22.5, -6, { rot: -90, scale: 3, collide: true, radius: 0.8 });
add(ks('workbench-grind'), 26, -11, { scale: 3, collide: true, radius: 0.8 });
add(gp('forge'), 30, -2.5, { rot: -90, collide: true, radius: 1.6 });
add(ks('campfire-pit'), 27.4, -0.4, { scale: 3, vfx: 'ambient_embers', light: { color: 0xff7a2a, intensity: 2.4, distance: 10, flicker: true, y: 0.8 } });
add(gp('barrel'), 21, -10.5, { collide: true, radius: 0.5 });
add(gp('barrel'), 27.5, 1.6, { collide: true, radius: 0.5 });
add(ks('bucket'), 21.2, -8.2, { scale: 3 });
add(tw('decoration/props/weaponrack'), 33.6, -12.2, { rot: 90, scale: 6, collide: true, radius: 0.8 });
add(tw('decoration/props/resource_stone'), 20.2, -12.4, { rot: 30, scale: 6 });
add(tw('decoration/props/bucket_water'), 24.6, -4.2, { scale: 6 });
add(ks('tool-hammer'), 22.5, -6, { y: 0.95, scale: 3, rot: 70 });
add(kf('cart'), 34.6, -16.6, { rot: 120, scale: 3.2, collide: true });
// enchanter: tent, altar with a floating purple crystal
add(tw('decoration/props/tent'), 32, 8, { rot: 90, scale: 6, collide: true });
add(kg('altar-stone'), 22.5, 8, { rot: 90, scale: 3, collide: true });
add(gp('crystal_purple'), 22.5, 8, { y: 1.45, scale: 0.8, light: { color: 0xb060ff, intensity: 2.0, distance: 6, flicker: false, y: 1.0 } });
add(kg('candle-multiple'), 21.9, 7.0, { y: 0.5, scale: 3 }); add(kg('candle-multiple'), 23.1, 9.0, { y: 0.5, scale: 3 });
add(fu('rug_oval_B'), 27.5, 8.2, { rot: 90, scale: 1.6, tint: 0x7040a0 });
add(fu('book_set'), 31.5, 10.0, { scale: 1.4, rot: 30 });
add(kf('lantern'), 30.4, 4.0, { scale: 2.2, light: { color: 0xc080ff, intensity: 1.4, distance: 7, flicker: true, y: 2.8 } });

// ---------------------------------------------------------------------------------------------------------------------
// Kadim Kapilar Salonu (portal hall on the +2 m terrace): floor, Font of Power, pillars, banners, vault chest, braziers
// ---------------------------------------------------------------------------------------------------------------------
const HALL_Y = 2;
// Stone floor of the terrace: 4 m tiles over all of it (x -24..24, z -58..-28). Centres x -22..22 and z -54..-30, tile top on the
// deck (HALL_Y, the walkable height). The old grid sat at z -30..-6 and y 2.02, a sheet floating over the plaza and the stairs.
for (let k = 0; k < 12; k++) for (let j = 0; j < 7; j++) {
  add(dg('floor_tile_large'), -22 + 4 * k, -54 + 4 * j, { y: HALL_Y - 0.05, tint: (k + j) % 2 === 0 ? 0xd8d0c4 : 0xc0b8ac });
}
add(gp('font_of_power'), 0, -41.5, { y: HALL_Y, collide: true, radius: 1.9, id: 'font_of_power' });
for (const [x, z] of [[17, -30], [-17, -30], [22, -40], [-22, -40], [22, -50], [-22, -50], [15, -55], [-15, -55]] as [number, number][]) {
  add(dg('pillar_decorated'), x, z, { y: HALL_Y, rot: deg(Math.atan2(-x, -44 - z)), scale: 1.7, collide: true, radius: 1.2 });
}
// one banner per dungeon colour above each portal (green / red / blue / white)
for (const [x, c] of [[-10.4, 'green'], [-4.1, 'red'], [4.1, 'blue'], [10.4, 'white']] as [number, string][]) {
  add(dg(`banner_triple_${c}`), x, -55.0, { y: HALL_Y + 3.2, rot: 0, scale: 1.1, id: `banner_${c}` });
}
brazier(14, -30, HALL_Y); brazier(-14, -30, HALL_Y);
add(gp('chest_epic'), -11, -34, { y: HALL_Y, rot: 0, collide: true, radius: 0.9, id: 'vault_chest', light: { color: 0xffc040, intensity: 1.6, distance: 7, flicker: true, y: 1.0 } });
add(gp('statue_hooded'), -19, -33, { y: HALL_Y, rot: 150, collide: true, radius: 1.0, tint: 0xb8b0a8 });
add(gp('statue_hooded'), 19, -33, { y: HALL_Y, rot: -150, collide: true, radius: 1.0, tint: 0xb8b0a8 });
add(kf('banner-red'), -12, -27, { scale: 3, rot: 0 }); add(kf('banner-green'), 12, -27, { scale: 3, rot: 0 });
add(gp('banner_red'), -9, -27.2, { rot: 0 }); add(gp('banner_blue'), 9, -27.2, { rot: 0 });

// ---------------------------------------------------------------------------------------------------------------------
// Egitim Alani (training ground, south-west): racks, archery targets, hay, fence
// ---------------------------------------------------------------------------------------------------------------------
for (const z of [30, 34.5, 39]) add(tw('decoration/props/weaponrack'), -54.5, z, { rot: 90, scale: 6, collide: true, radius: 0.8 });
for (const [i, x] of [-50, -44, -38].entries()) {
  add(tw('decoration/props/target'), x, 52, { rot: 180, scale: 6, collide: true, radius: 0.7, id: `obj_hedef_${i + 1}` });
  add(kg('hay-bale'), x, 55, { scale: 3, rot: 0, collide: true });
}
for (let x = -54; x < -19; x += 4.1) if (x < -38 || x > -29) add(gp('fence_wood'), x, 22.5, { rot: 0, collide: true, radius: 0.4 });
add(ks('signpost-single'), -29.6, 26.4, { scale: 4, rot: 170 });
add(kg('hay-bale'), -52, 47, { scale: 3, rot: 20 }); add(kg('hay-bale'), -52.6, 44.4, { scale: 3, rot: -30, y: 0 });
add(gp('barrel'), -47.5, 27.5, { collide: true, radius: 0.5 }); add(gp('crate_a'), -34, 53.5, { collide: true });

// ---------------------------------------------------------------------------------------------------------------------
// Han Bahcesi (tavern yard, south-east): tables, stools, barrels, bonfire
// ---------------------------------------------------------------------------------------------------------------------
for (const [tx, tz] of [[28, 34], [30, 44], [26, 52]] as [number, number][]) {
  add(fu('table_medium'), tx, tz, { scale: 1.3, collide: true, radius: 1.3 });
  add(ip('nocturnal-watch', 'tavern_beer_mug'), tx + 0.4, tz - 0.3, { y: 1.3, scale: 1.4, rot: rng.range(0, 360) });
  add(ip('nocturnal-watch', 'tavern_jug'), tx - 0.5, tz + 0.4, { y: 1.3, scale: 1.4 });
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    add(fu('chair_stool_wood'), tx + Math.sin(a) * 1.9, tz + Math.cos(a) * 1.9, { rot: deg(a) + 180, scale: 1.2 });
  }
}
add(gp('barrel'), 35.5, 37, { collide: true, radius: 0.5 }); add(gp('barrel'), 35.8, 38.1, { collide: true, radius: 0.5 }); add(gp('barrel'), 35.4, 48, { collide: true, radius: 0.5 });
add(ip('psx-medieval', 'market/barrel_apples'), 35.0, 35.8, { scale: 1.0, collide: true, radius: 0.6 });
add(ip('nocturnal-watch', 'tavern_bar_stool'), 36.4, 36.2, { scale: 1.1 });
add(gp('campfire'), 33.2, 50.6, { rot: 20, vfx: 'ambient_embers', light: { color: 0xff7a2a, intensity: 2.2, distance: 11, flicker: true, y: 0.9 } });
add(kg('bench'), 31.0, 50.2, { rot: 90, scale: 3, collide: true, radius: 0.9 }); add(kg('bench'), 35.4, 52.4, { rot: 200, scale: 3, collide: true, radius: 0.9 });
add(kg('hay-bale'), 47.4, 36, { scale: 3, rot: 15 }); add(kg('hay-bale'), 48.8, 37, { scale: 3, rot: -25 });
add(ip('psx-medieval', 'decoration/flower_box'), 36.0, 44.8, { y: 0.9, scale: 1.2, rot: 90 });
add(gp('lamp_post'), 28, 27, { rot: 90, collide: true, radius: 0.4 }); add(gp('lamp_post'), 50, 30, { rot: -90, collide: true, radius: 0.4 });
add(gp('lamp_post'), 24, 40, { rot: 90, collide: true, radius: 0.4 });

// ---------------------------------------------------------------------------------------------------------------------
// Guney Kapisi (south gate caravan), trees
// ---------------------------------------------------------------------------------------------------------------------
add(gp('wagon'), -14, 51, { rot: 25, collide: true }); add(gp('crate_b'), -16.5, 49, { rot: 10, collide: true }); add(gp('barrel'), -11.5, 48.5, { collide: true, radius: 0.5 });
add(ks('signpost'), 3, 50, { scale: 3, rot: 190 });
for (const [x, z, big] of [[-27, -53, 0], [27, -53, 1], [-55, 27, 1], [55, 17, 0], [-24, 55, 0], [24, 55, 1]] as [number, number, number][]) {
  add(tw(`decoration/nature/${big ? 'trees_B_large' : 'trees_A_medium'}`), x, z, { scale: 6, rot: rng.range(0, 360) });
}

// ---------------------------------------------------------------------------------------------------------------------
// NPCs, portals and interactable stand-ins (GDD 2.3). Character models use the short names the scenes module resolves.
// ---------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------------------------------
// Outer districts (WP-11, the 320 m capital): Demirci Mahallesi (north-east), Kervansaray (south-east), Tapınak Avlusu (north-west),
// Lonca Meydanı (south-west) and the three gate yards. The quarter lanes run along z = +-100 (x 64..150), joined to the cardinal roads
// by the ring connectors at x = +-64. Each quarter has homes or workshops on both sides of its lane; the walkers use the lane loops below.
// ---------------------------------------------------------------------------------------------------------------------
// Demirci Mahallesi: smithies and homes, the forge row on the north front of the lane z = -100
bld('blacksmith', 'red', 76, -116, 0); bld('home_A', 'green', 94, -116, 0); bld('blacksmith', 'red', 112, -116, 0); bld('home_B', 'yellow', 130, -116, 0);
bld('home_B', 'red', 76, -84, 180); bld('market', 'blue', 94, -84, 180); bld('home_A', 'blue', 112, -84, 180); bld('home_B', 'green', 130, -84, 180);
add(gp('anvil'), 76, -107, { collide: true, radius: 0.8 });
add(ks('workbench-grind'), 94, -107, { scale: 3, collide: true, radius: 0.8 });
add(gp('forge'), 112, -107, { rot: -90, collide: true, radius: 1.6 });
add(kf('cart'), 130, -107, { rot: 90, scale: 3.2, collide: true });
add(gp('barrel'), 84, -107, { collide: true, radius: 0.5 }); add(gp('barrel'), 101, -107, { collide: true, radius: 0.5 });
add(gp('lamp_post'), 68, -107, { collide: true, radius: 0.4 }); add(gp('lamp_post'), 138, -93, { collide: true, radius: 0.4 });
add(gp('crate_a'), 120, -93, { collide: true }); add(tw('decoration/props/weaponrack'), 136, -93, { rot: 90, scale: 6, collide: true, radius: 0.8 });
add(gp('barrel'), 104, -93, { collide: true, radius: 0.5 }); add(kf('stall-red'), 88, -95, { rot: 0, scale: 3.5, collide: true });
// Kervansaray: the inn on the south front of the lane z = 100, homes on the north front, yard tables between the lane and the inn
bld('home_B', 'green', 76, 84, 0); bld('home_A', 'red', 94, 84, 0); bld('home_B', 'blue', 112, 84, 0); bld('home_A', 'green', 130, 84, 0);
bld('tavern', 'yellow', 112, 116, 180); bld('home_B', 'red', 76, 116, 180); bld('market', 'green', 94, 116, 180);
add(fu('table_medium'), 70, 108, { scale: 1.3, collide: true, radius: 1.3 }); add(fu('table_medium'), 88, 109, { scale: 1.3, collide: true, radius: 1.3 });
add(ip('nocturnal-watch', 'tavern_beer_mug'), 70.4, 107.7, { y: 1.3, scale: 1.4 }); add(ip('nocturnal-watch', 'tavern_jug'), 88.5, 108.6, { y: 1.3, scale: 1.4 });
add(kg('hay-bale'), 66, 92, { scale: 3, rot: 15 }); add(kg('hay-bale'), 68, 93.5, { scale: 3, rot: -25 });
add(gp('barrel'), 66, 88, { collide: true, radius: 0.5 }); add(gp('barrel'), 66.8, 86.4, { collide: true, radius: 0.5 });
add(gp('campfire'), 130, 92, { rot: 20, vfx: 'ambient_embers', light: { color: 0xff7a2a, intensity: 2.2, distance: 11, flicker: true, y: 0.9 } });
add(kg('bench'), 124, 92, { rot: 90, scale: 3, collide: true, radius: 0.9 });
add(gp('lamp_post'), 138, 108, { collide: true, radius: 0.4 });
add(tw('decoration/nature/trees_A_medium'), 146, 84, { scale: 6, rot: 30 }); add(tw('decoration/nature/trees_A_medium'), 146, 122, { scale: 6, rot: 80 });
// Tapınak Avlusu: the temple (church) on the north front of the lane z = -100, pillars and braziers in front of it
bld('church', 'blue', -112, -116, 0); bld('home_A', 'red', -130, -116, 0); bld('home_B', 'green', -94, -116, 0); bld('home_A', 'green', -76, -116, 0);
bld('home_B', 'yellow', -130, -84, 180); bld('well', 'blue', -112, -84, 0); bld('home_A', 'red', -94, -84, 180); bld('home_B', 'blue', -76, -84, 180);
add(dg('pillar_decorated'), -124, -107, { y: 0, scale: 1.7, collide: true, radius: 1.2 });
add(dg('pillar_decorated'), -100, -107, { y: 0, scale: 1.7, collide: true, radius: 1.2 });
add(gp('statue_hooded'), -118, -93, { collide: true, radius: 1.0, tint: 0xb8b0a8 });
add(gp('statue_hooded'), -106, -93, { collide: true, radius: 1.0, tint: 0xb8b0a8 });
brazier(-112, -107); brazier(-136, -107);
add(gp('banner_red'), -136, -88, { rot: 90, scale: 1.5 });
add(gp('lamp_post'), -90, -107, { collide: true, radius: 0.4 });
// Lonca Meydanı: the guild hall is a placeholder (the barracks building and two banners; the guild itself is not built yet)
bld('barracks', 'blue', -112, 116, 180); bld('home_B', 'blue', -130, 84, 0); bld('home_A', 'green', -112, 84, 0); bld('home_B', 'yellow', -94, 84, 0); bld('home_A', 'red', -76, 84, 0);
add(gp('banner_blue'), -124, 109.5, { scale: 1.5 }); add(gp('banner_red'), -100, 109.5, { scale: 1.5 });
add(gp('tent'), -140, 112, { rot: 90, collide: true }); add(gp('tent'), -86, 112, { collide: true });
add(gp('crate_a'), -134, 92, { collide: true }); add(gp('crate_b'), -128, 94, { rot: 10, collide: true }); add(gp('barrel'), -120, 92, { collide: true, radius: 0.5 });
add(ks('signpost'), -88, 94, { scale: 3, rot: 90 });
add(gp('lamp_post'), -140, 106, { collide: true, radius: 0.4 });
// Gate yards: Güney (south, caravans to Sisli Vadi), Doğu (east, Karakır) and Batı (west, the Kızıl Sınır border post)
add(gp('lamp_post'), -6, 118, { collide: true, radius: 0.4 }); add(gp('lamp_post'), 6, 118, { collide: true, radius: 0.4 });
add(gp('wagon'), -30, 132, { rot: 25, collide: true }); add(gp('crate_b'), -27, 128, { rot: 10, collide: true });
add(gp('barrel'), -26, 140, { collide: true, radius: 0.5 }); add(gp('crate_a'), -29, 146, { collide: true });
add(gp('wagon'), 30, 134, { rot: -20, collide: true }); add(gp('sacks'), 28, 126, { rot: 70 }); add(gp('barrel'), 27, 144, { collide: true, radius: 0.5 });
add(ks('signpost'), 6, 126, { scale: 3, rot: 190 });
add(gp('wagon'), 134, -28, { rot: 90, collide: true }); add(gp('crate_b'), 138, -24, { collide: true });
add(gp('barrel'), 142, 24, { collide: true, radius: 0.5 }); add(gp('barrel'), 142, 26.5, { collide: true, radius: 0.5 });
add(kg('hay-bale'), 128, 26, { scale: 3, rot: 15 }); add(tw('decoration/props/weaponrack'), 148, -28, { rot: 90, scale: 6, collide: true, radius: 0.8 });
add(gp('wagon'), -134, 28, { rot: -90, collide: true }); add(gp('barrel'), -138, -28, { collide: true, radius: 0.5 });
add(gp('crate_a'), -140, -24, { collide: true }); add(kg('hay-bale'), -128, -28, { scale: 3, rot: -20 });
add(tw('decoration/props/weaponrack'), -154, 22, { rot: 90, scale: 6, collide: true, radius: 0.8 });
const npcs: TownNpc[] = [];
const npc = (id: string, name: string, role: TownNpc['role'], model: string, x: number, z: number, rot: number, o: Partial<TownNpc> = {}, y = 0): void => {
  npcs.push({ id, name, role, model, pos: [x, y, z], rot, ...o });
};

// Zanaat Sokagi
npc('npc_demirci', 'Demirci Haldun Usta', 'blacksmith', 'Barbarian', 24, -6, -90, {
  title: 'Demirci', show: ['1H_Axe'], tint: 0xb08060, idle: 'Idle', loop: { clip: '1H_Melee_Attack_Chop', every: 3, offset: 0 },
  ui: { panel: 'blacksmith' }, lines: ['Demir sıcakken dövülür, yiğidim. Ne getirdin?', 'Silahın +15 olsun da gör...', 'Örsüm susmaz, demir dinlenmez.'],
});
npc('npc_cirak', 'Çırak Murat', 'citizen', 'Worker', 26, -9.5, -120, { title: 'Çırak', scale: 1.25, idle: 'Interact', lines: ['Usta bugün çok sinirli...', 'Bileği taşı yine bozuldu!'] });
npc('npc_efsuncu', 'Efsuncu Nergis', 'blacksmith', 'Mage', 24, 8, -90, {
  title: 'Efsuncu', show: ['1H_Wand', 'Spellbook_open', 'Mage_Hat'], tint: 0xa888c8, idle: 'Idle', loop: { clip: 'Spellcast_Raise', every: 8, offset: 2 },
  ui: { panel: 'blacksmith', tab: 'efsun' }, lines: ['Efsun, sabır ister. Ve biraz da altın.', 'Her efsun bir kumardır.'],
});
// Carsi
npc('npc_tuccar', 'Tüccar Selim', 'merchant', 'Rogue_Hooded', -24, -8, 90, {
  title: 'Tüccar', show: ['Rogue_Cape'], tint: 0x90b4d4, idle: 'Idle', ui: { panel: 'vendor', kind: 'merchant' }, shouts: ['Ucuz mal, bol çeşit, gel bak!', 'Altının varsa malın bende!'],
  lines: ['Her şeyin bir fiyatı var. Senin de.', 'Altınını say, sonra konuşuruz.'],
});
npc('npc_simyaci', 'Simyacı Lale', 'alchemist', 'Mage', -24, 4, 90, {
  title: 'Simyacı', show: ['1H_Wand'], tint: 0x90d0a0, idle: 'Idle', loop: { clip: 'Spellcasting', every: 6, offset: 1 }, ui: { panel: 'vendor', kind: 'alchemist' }, shouts: ['İksir! Taze iksir, şifalı iksir!', 'Kazan kaynıyor, gelin görün!'],
  lines: ['Bu yeşil olanı içme. Henüz.', 'Kazan bugün huysuz...'],
});
npc('npc_depocu', 'Depocu Bekir', 'stash', 'Barbarian', -24, 14, 90, {
  title: 'Depocu', show: ['Mug'], tint: 0xc0a078, idle: 'Idle', loop: { clip: 'Use_Item', every: 7 }, ui: { panel: 'stash' },
  lines: ['Eşyaların bende güvende. Çoğu zaman.', 'Sandıklar dolu, hafıza boş.'],
});
npc('npc_gizemli_tuccar', 'Gizemli Tüccar Sabri', 'merchant', 'Rogue_Hooded', -21, -18, 60, {
  title: 'Kumarbaz', show: ['Throwable'], tint: 0xa08cb0, idle: 'Idle', loop: { clip: 'Throw', every: 6, offset: 3 }, unlockLevel: 25, ui: { panel: 'vendor', kind: 'gamble' },
  lines: ['Kutunun içinde ne var? Öde ve gör!', 'Şansın varsa kazanırsın. Yoksa... yine de eğlenirsin.'],
});
// Kadim Kapilar Salonu (terrace, y = 2)
npc('npc_anahtar_ustasi', 'Anahtar Ustası Yaşar', 'keystone', 'Knight', 0, -34, 0, {
  title: 'Anahtar Ustası', show: ['Badge_Shield'], tint: 0xc0a060, idle: 'Idle', loop: { clip: 'Use_Item', every: 9 }, ui: { panel: 'keystone' },
  lines: ['Anahtar taşı seni seçti. Kehanet Taşı\'na götür onu.', 'Her anahtar bir sınavdır.', 'Haftalık efsunlara dikkat et.'],
}, 2);
npc('npc_lord_tarhan', 'Lord Tarhan', 'keystone', 'King', -8, -34, 0, {
  title: 'Kadim Hazine', scale: 1.3, idle: 'Idle_Neutral', loop: { clip: 'Wave', every: 10, offset: 4 }, ui: { panel: 'keystone', tab: 'vault' },
  lines: ['Kuzgunkale cesurları ödüllendirir.', 'Haftalık hazine seni bekliyor.'],
}, 2);
npc('obj_seref_tasi', 'Şeref Taşı', 'citizen', 'prop', 8, -34, 0, {
  title: 'Mitik+ Puanı', vfx: 'waypoint_glow', vfxColor: 0xd9a8ff, ui: { panel: 'mplusInfo' },
  object: { model: kg('pillar-obelisk'), scale: 3, extra: [{ model: gp('crystal_purple'), pos: [0, 3.1, 0], scale: 0.5 }] },
  light: { color: 0xb060ff, intensity: 1.6, distance: 8, flicker: false, y: 3 },
}, 2);
// Kadim Yarık Taşı (procedural dungeons, docs/GDD_PROCGEN.md): opens the Zindan Bulucu on its "Kadim Yarıklar" tab
npc('obj_yarik_tasi', 'Kadim Yarık Taşı', 'citizen', 'prop', 14, -37, 0, {
  title: 'Kadim Yarıklar', vfx: 'waypoint_glow', vfxColor: 0xc070ff, ui: { panel: 'finder', tab: 'fissure' },
  object: { model: kg('altar-stone'), scale: 3, extra: [{ model: gp('crystal_purple'), pos: [0, 1.7, 0], scale: 0.9 }] },
  light: { color: 0xa860ff, intensity: 1.6, distance: 8, flicker: false, y: 2.6 },
}, 2);
// id, name, x, z, yaw, required level, swirl tint
const PORTALS: [string, string, number, number, number, number, number][] = [
  ['kemik_mahzeni', 'Kemik Mahzeni', -10.4, -50, 60, 8, 0x7affc0],
  ['kizil_dokumhane', 'Kızıl Dökümhane', -4.1, -55.3, 20, 18, 0xff6a20],
  ['buzul_tahti', 'Buzul Tahtı', 4.1, -55.3, -20, 30, 0x80c8ff],
  ['golge_tapinagi', 'Gölge Tapınağı', 10.4, -50, -60, 42, 0xb060ff],
];
for (const [id, name, x, z, rot, lvl, col] of PORTALS) {
  npc(`portal_${id}`, name, 'portal', 'portal', x, z, rot, {
    dungeonId: id, title: `Seviye ${lvl}`, unlockLevel: lvl, vfx: 'portal_swirl', vfxColor: col, ui: { panel: 'keystone' },
    object: { model: hw('arch'), scale: 2 }, lines: [`Seviye ${lvl} gerekli.`],
  }, 2);
}
// Egitim Alani
npc('npc_egitmen', 'Eğitmen Kaya', 'trainer', 'Knight', -24, 32, -90, {
  title: 'Eğitmen', show: ['2H_Sword'], tint: 0xb0b0b0, idle: '2H_Melee_Idle', loop: { clip: '2H_Melee_Attack_Slice', every: 5, offset: 1 }, ui: { panel: 'trainer' },
  lines: ['Ağacın köklerini söküp yeniden dikmek mi? Bedeli var.', 'Kuklalara vur, öğren!', 'Kombo yapmayı unutma.'],
});
for (const [id, name, x, z] of [
  ['obj_kukla_1', 'Eğitim Kuklası', -48, 40], ['obj_kukla_2', 'Eğitim Kuklası', -43, 40], ['obj_kukla_3', 'Elit Kukla', -38, 40], ['obj_kukla_4', 'Boss Kuklası', -33, 40],
  ['obj_kukla_5a', 'Grup Kuklası', -42, 48], ['obj_kukla_5b', 'Grup Kuklası', -40, 47], ['obj_kukla_5c', 'Grup Kuklası', -38, 48], ['obj_kukla_5d', 'Grup Kuklası', -41, 50], ['obj_kukla_5e', 'Grup Kuklası', -39, 50],
] as [string, string, number, number][]) {
  npc(id, name, 'citizen', 'dummy', x, z, 180, { decor: true, title: 'Antrenman' });
}
// Meydan
// quest giver: the quest dialog (panel 'dialog'). The bounty board stays next to him as the notice board (TownScene).
npc('npc_muhtar', 'Muhtar Cemal', 'bounty', 'Barbarian', 10, 18, -150, {
  title: 'Muhtar', show: [], tint: 0xb89860, idle: 'Idle', ui: { panel: 'dialog' },
  quests: ['mq_01_kuzgunun_cagrisi', 'mq_19_kuzgunkaleye_donus'],
  lines: ['Zindanlar yine kıpırdıyor. İş var, ödül var.', 'İlan tahtasına bir göz at!', 'Günlük görevler seni bekler.'],
});
npc('npc_muhurdar', 'Mühürdar Kemal', 'merchant', 'Knight', 13, 21, -150, {
  title: 'Mühürdar', show: ['Badge_Shield'], tint: 0x9ab0c8, idle: 'Idle', ui: { panel: 'vendor', kind: 'seal_vendor' }, lines: ['Mührünü getir, ödülünü al.'], shouts: ['Av mührü! Av mührü, kaçırma!'],
});
npc('obj_bulusma_tasi', 'Buluşma Taşı', 'lobby', 'prop', -8, 18, 0, {
  title: 'Online Odalar', ui: { panel: 'party' }, // no 10 m waypoint pillar here: the obelisk itself carries a subtle glow (world/TownBuilder)
  object: { model: kg('altar-stone'), scale: 3, extra: [{ model: gp('crystal_blue'), pos: [0, 1.6, 0], scale: 1.2 }] },
});
// guards
const GUARD = ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'];
const GUARD2H = ['2H_Sword', 'Knight_Helmet', 'Knight_Cape'];
npc('npc_muhafiz_1', 'Kale Muhafızı', 'guard', 'Knight', -5, 152, 0, { title: 'Güney Kapısı', show: GUARD, tint: 0x8090b0, idle: 'Blocking', lines: ['Kapıdan çıkarsan kendi başınasın.'] });
npc('npc_muhafiz_2', 'Kale Muhafızı', 'guard', 'Knight', 5, 152, 0, { title: 'Güney Kapısı', show: GUARD, tint: 0x8090b0, idle: 'Idle', lines: ['Kapıdan çıkarsan kendi başınasın.'] });
npc('npc_muhafiz_3', 'Kale Muhafızı', 'guard', 'Knight', -7, -24, 0, { title: 'Kadim Kapılar', show: GUARD2H, tint: 0x8090b0, idle: '2H_Melee_Idle', lines: ['Kadim Kapılar yalnızca cesurlara açılır.'] });
npc('npc_muhafiz_4', 'Kale Muhafızı', 'guard', 'Knight', 7, -24, 0, { title: 'Kadim Kapılar', show: GUARD2H, tint: 0x8090b0, idle: '2H_Melee_Idle', lines: ['Kadim Kapılar yalnızca cesurlara açılır.'] });
const lap = (phase: number): [number, number][] => Array.from({ length: 16 }, (_, i) => {
  const a = ((i / 16 + phase) * 2 * Math.PI);
  return [+(Math.sin(a) * 17).toFixed(2), +(8 + Math.cos(a) * 17).toFixed(2)] as [number, number];
});
npc('npc_sinir_subayi', 'Sınır Subayı Tarkan', 'guard', 'Knight', -153.5, 1, 90, {
  title: 'Batı Kapısı: Kızıl Sınır', show: GUARD2H, tint: 0x6a7ab0, idle: '2H_Melee_Idle',
  lines: ['Batı Kapısı Kızıl Sınır\'a açılır: Gök Kartal ile Kızıl Kurt\'un savaş alanı. Seviye 35 gerekir.', 'Orada iki ulus birbirine düşman. Kendi ulusundan olanlar dostundur, diğerleri değil.'],
});
npc('npc_muhafiz_5', 'Devriye', 'guard', 'Knight', 0, 25, 0, { title: 'Devriye', show: GUARD, tint: 0x8090b0, idle: 'Walking_A', patrol: { path: lap(0), lap: 30 } });
npc('npc_muhafiz_6', 'Devriye', 'guard', 'Knight', 0, -9, 0, { title: 'Devriye', show: GUARD, tint: 0x8090b0, idle: 'Walking_A', patrol: { path: lap(0.5), lap: 30 } });
// Batı Kapısı yard: PvP vendors (GDD_PVP_FINDER §4.4). Onur (Er tier) and Fetih (Şampiyon tier, upgrades) beside the Kızıl Sınır gate.
npc('npc_savas_ustasi', 'Savaş Ustası', 'pvp', 'Knight', -140, -8, 90, {
  title: 'Savaş Ustası', show: GUARD2H, tint: 0xc05040, idle: '2H_Melee_Idle', ui: { panel: 'vendor', kind: 'pvp_honor' },
  lines: ['Kızıl Sınır\'da kanını döktün mü? Onurun burada değerli.', 'Er tier zırh, Onur karşılığı.'],
});
npc('npc_fetih_muhafizi', 'Fetih Muhafızı', 'pvp', 'Knight', -140, 8, 90, {
  title: 'Fetih Muhafızı', show: GUARD2H, tint: 0x6a7ab0, idle: '2H_Melee_Idle', ui: { panel: 'vendor', kind: 'pvp_conquest' },
  lines: ['Fetih kazandın, şimdi zırhını yükselt.', 'Şampiyon tier, haftalık sınırla satılır. Mühürle yükseltilir.'],
});
// ---------------------------------------------------------------------------------------------------------------------
// Ambient life (WP-11): citizens walk closed street loops (walk()), vendors stand and shout their wares into /say bubbles (the NPC
// runtime calls `shouts` every 60-120 s while the vendor is on screen). Walker phases spread each crowd along its loop.
// ---------------------------------------------------------------------------------------------------------------------
/** A closed walk: the start point at `phase` (0..1) along the corners, and the patrol record for the NPC runtime (lap at `speed` m/s). */
const walk = (corners: [number, number][], phase: number, speed = 1.1): { pos: [number, number]; patrol: { path: [number, number][]; lap: number; phase: number } } => {
  const cum: number[] = [0];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i], b = corners[(i + 1) % corners.length];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  const s = phase * total;
  let i = 0;
  while (i < corners.length - 1 && cum[i + 1] < s) i++;
  const a = corners[i], b = corners[(i + 1) % corners.length];
  const k = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
  return { pos: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], patrol: { path: corners, lap: total / speed, phase } };
};
const LOOP = {
  ne: [[68, -103], [140, -103], [140, -97], [68, -97]] as [number, number][],
  se: [[82, 97], [118, 97], [118, 103], [82, 103]] as [number, number][],
  nw: [[-140, -103], [-70, -103], [-70, -97], [-140, -97]] as [number, number][],
  sw: [[-140, 97], [-70, 97], [-70, 103], [-140, 103]] as [number, number][],
  road: [[-2, 66], [2, 66], [2, 112], [-2, 112]] as [number, number][],
  south: [[-16, 124], [16, 124], [16, 150], [-16, 150]] as [number, number][],
  east: [[122, -16], [150, -16], [150, 16], [122, 16]] as [number, number][],
  west: [[-150, -16], [-122, -16], [-122, 16], [-150, 16]] as [number, number][],
};
/** A crowd: every citizen walks the same loop from its own point along it. */
const crowd = (loop: [number, number][], list: [string, string, string, string, number][]): void => {
  list.forEach(([id, name, title, model, tint], i) => {
    const w = walk(loop, (i / list.length) % 1);
    npc(id, name, 'citizen', model, w.pos[0], w.pos[1], 0, { title, tint, idle: 'Walking_A', patrol: w.patrol });
  });
};
// Demirci Mahallesi (north-east) walkers and the smith's shouting seller
crowd(LOOP.ne, [
  ['npc_dm_yolcu_1', 'Demirci Çırağı', 'Çırak', 'Worker', 0xb8a890], ['npc_dm_yolcu_2', 'Hamal Osman', 'Hamal', 'Barbarian', 0xa08868],
  ['npc_dm_yolcu_3', 'Kalfa Asiye', 'Kalfa', 'Rogue', 0x98a8c0], ['npc_dm_yolcu_4', 'Madenci Hüseyin', 'Madenci', 'Knight', 0x8c8c8c],
  ['npc_dm_yolcu_5', 'Demirci Çırağı Ali', 'Çırak', 'Worker', 0xc0a884], ['npc_dm_yolcu_6', 'Müşteri Zehra', 'Müşteri', 'Mage', 0xb89ab0],
]);
npc('npc_dm_silahci', 'Silahçı Ferit', 'citizen', 'Barbarian', 88, -91, 180, {
  title: 'Silahçı', show: ['1H_Axe'], tint: 0xb08060, idle: 'Idle', loop: { clip: '1H_Melee_Attack_Chop', every: 9 },
  shouts: ['Kılıç, balta, kalkan! Hepsi taze dövme!', 'Demir ucuz, dövülmesi bedava!'], lines: ['Hangi silahı istersin, yiğit?'],
});
npc('npc_dm_usta', 'Demirci Usta Kenan', 'citizen', 'Barbarian', 112, -91, 180, {
  title: 'Demirci Usta', show: ['1H_Axe'], tint: 0xa08060, idle: 'Idle', loop: { clip: '1H_Melee_Attack_Chop', every: 6, offset: 2 },
  lines: ['Örs susmaz, demir dinlenmez.'],
});
// Kervansaray (south-east)
crowd(LOOP.se, [
  ['npc_kv_yolcu_1', 'Kervancı Murat', 'Kervancı', 'Barbarian', 0xa08868], ['npc_kv_yolcu_2', 'Yolcu Deniz', 'Yolcu', 'Rogue', 0x98a8c0],
  ['npc_kv_yolcu_3', 'Tüccar Yardımcısı Emre', 'Yolcu', 'Knight', 0xa0a8b0], ['npc_kv_yolcu_4', 'Gezgin Şair Kerem', 'Gezgin', 'Mage', 0xb0a0c0],
  ['npc_kv_yolcu_5', 'Yolcu Fatma', 'Yolcu', 'Rogue_Hooded', 0xa89080], ['npc_kv_yolcu_6', 'Hancı Çırağı Can', 'Çırak', 'Worker', 0xc0b090],
]);
npc('npc_han_hanci', 'Hancı Güler', 'citizen', 'Barbarian', 104, 109, 180, {
  title: 'Hancı', show: ['Mug'], tint: 0x9a6a40, idle: 'Idle', loop: { clip: 'Use_Item', every: 8 },
  shouts: ['Oda var! Sıcak yemek, soğuk bira!', 'Kervansaray kapıları açık, buyurun!'], lines: ['Hoş geldin, yorgun yolcu!'],
});
npc('npc_kv_halil', 'Kervancı Halil', 'citizen', 'Barbarian', 92, 92, 0, { title: 'Kervancı', tint: 0xa08060, idle: 'Idle', lines: ['Yol uzun, bira soğuk.'] });
// Tapınak Avlusu (north-west): pilgrims, the priest, the holy-water seller and the seer
crowd(LOOP.nw, [
  ['npc_tp_hac_1', 'Hacı Ali', 'Hacı', 'Mage', 0xb0c0b0], ['npc_tp_hac_2', 'Hacı Fatma', 'Hacı', 'Rogue_Hooded', 0xc0b0a0],
  ['npc_tp_hac_3', 'Dilenci Yusuf', 'Dilenci', 'Worker', 0xa89c88], ['npc_tp_hac_4', 'Hacı Recep', 'Hacı', 'Knight', 0xb8b0a8],
]);
npc('npc_tp_ahmet', 'Rahip Ahmet', 'citizen', 'Mage', -112, -91, 0, { title: 'Rahip', tint: 0xd8d0c0, idle: 'Idle', lines: ['Tanrı yolunu aydınlatsın.', 'Kutsal ateş burada sönmez.'] });
npc('npc_tp_meryem', 'Kutsal Su Satıcısı Meryem', 'citizen', 'Rogue_Hooded', -82, -91, 180, {
  title: 'Kutsal Su', tint: 0x90b4d4, idle: 'Idle',
  shouts: ['Kutsal su! Bir kupa, bir altın!', 'Şifa suyu, şifa suyu, gelin!'], lines: ['Kutsal su derdine deva.'],
});
npc('npc_tp_zeynel', 'Kâhin Zeynel', 'citizen', 'Mage', -98, -91, 0, {
  title: 'Kâhin', show: ['1H_Wand'], tint: 0xa888c8, idle: 'Idle', loop: { clip: 'Spellcasting', every: 7, offset: 2 }, lines: ['Yıldızlar bu gece parlak.'],
});
// Lonca Meydanı (south-west): the guild hall placeholder
crowd(LOOP.sw, [
  ['npc_lo_uye_1', 'Lonca Üyesi Kaan', 'Lonca Üyesi', 'Knight', 0x98a8c0], ['npc_lo_uye_2', 'Lonca Çırağı Selin', 'Çırak', 'Rogue', 0xb0b8c8],
  ['npc_lo_uye_3', 'Taşıyıcı Mahmut', 'Hamal', 'Barbarian', 0xa08868],
]);
npc('npc_lo_katip', 'Lonca Katibi Berna', 'citizen', 'Rogue', -104, 108, 180, {
  title: 'Lonca Katibi', tint: 0x9ab0c8, idle: 'Idle',
  shouts: ['Lonca kurmak ister misin? Yakında burada!', 'Lonca salonu yakında açılıyor, kayıt yaptır!'], lines: ['Lonca salonu henüz inşa ediliyor.'],
});
npc('npc_lo_muhafiz', 'Lonca Muhafızı Ercan', 'guard', 'Knight', -126, 112, 0, {
  title: 'Lonca', show: GUARD2H, tint: 0x8090b0, idle: '2H_Melee_Idle', lines: ['Lonca salonu yakında. Sabırlı ol.'],
});
// Gate yards: Güney (caravans), Doğu (Karakır), Batı (Kızıl Sınır) and the south road walkers
npc('npc_kapi_dogu_1', 'Kale Muhafızı', 'guard', 'Knight', 152, -6, 90, { title: 'Doğu Kapısı', show: GUARD, tint: 0x8090b0, idle: 'Blocking', lines: ['Kapıdan çıkarsan kendi başınasın.'] });
npc('npc_kapi_dogu_2', 'Kale Muhafızı', 'guard', 'Knight', 152, 6, 90, { title: 'Doğu Kapısı', show: GUARD2H, tint: 0x8090b0, idle: '2H_Melee_Idle', lines: ['Karakır\'a giden kervan burada toplanır.'] });
npc('npc_kapi_bati_2', 'Kale Muhafızı', 'guard', 'Knight', -153.5, -7, -90, { title: 'Batı Kapısı', show: GUARD, tint: 0x6a7ab0, idle: 'Blocking', lines: ['Kızıl Sınır seviye 35 ister.'] });
crowd(LOOP.east, [['npc_kapi_dogu_yolcu_1', 'Karakır Kervancısı Oğuz', 'Kervancı', 'Barbarian', 0xa08868], ['npc_kapi_dogu_yolcu_2', 'Karakır Kervancısı Berk', 'Kervancı', 'Rogue', 0x98a8c0]]);
crowd(LOOP.west, [['npc_kapi_bati_yolcu_1', 'Sınır Nöbetçisi Vedat', 'Nöbetçi', 'Knight', 0x6a7ab0], ['npc_kapi_bati_yolcu_2', 'Sınır Devriyesi Kadir', 'Devriye', 'Rogue', 0x7a8ab8]]);
crowd(LOOP.south, [
  ['npc_kapi_guney_yolcu_1', 'Kervancı Yusuf', 'Kervancı', 'Barbarian', 0xa08868], ['npc_kapi_guney_yolcu_2', 'Kervancı Ayla', 'Kervancı', 'Rogue', 0xb0a0a8],
  ['npc_kapi_guney_yolcu_3', 'Odun Taşıyıcı Ömer', 'Hamal', 'Worker', 0xa89c88], ['npc_kapi_guney_yolcu_4', 'Nöbet Değişimi Cem', 'Nöbetçi', 'Knight', 0x8090b0],
]);
crowd(LOOP.road, [['npc_yol_selim', 'Kervancı Selim', 'Kervancı', 'Barbarian', 0xa08060], ['npc_yol_nuran', 'Köylü Nuran', 'Köylü', 'Mage', 0xa8c890]]);

// tavern + villagers
npc('npc_meyhaneci', 'Meyhaneci Hasan', 'citizen', 'Barbarian', 34, 34, -90, {
  title: 'Meyhaneci', show: ['Mug'], tint: 0x9a6a40, idle: 'Idle', loop: { clip: 'Use_Item', every: 8 }, lines: ['Zindandan sağ döneni bir içki benden!', 'Bir kupa daha?', 'Hikâyeni anlat bakalım!'],
});
const VILLAGER = ['Bu akşam meyhane dolu.', 'Kuzgunkale\'de huzur var.', 'Zindan mı? Ben burada kalırım.', 'Duydun mu, Kemik Mahzeni yine uyanmış.'];
const villager = (n: number, model: string, x: number, z: number, rot: number, idle: string, tint: number): void =>
  npc(`npc_koylu_${n}`, 'Köylü', 'citizen', model, x, z, rot, { title: 'Köylü', show: [], tint, idle, lines: VILLAGER });
villager(1, 'Rogue', 4.5, 12, 200, 'Sit_Chair_Idle', 0xa08060);          // beside the fountain bench
villager(2, 'Knight', -4.5, 4, 40, 'Idle', 0x98b4d0);
villager(3, 'Mage', 34.2, 40.2, 90, 'Sit_Floor_Idle', 0xa8c890);       // in front of the tavern door
villager(4, 'Barbarian', 33.6, 44.2, 60, 'Cheer', 0xa06060);
villager(5, 'Rogue', -17.6, 1.8, 150, 'Idle', 0x98b4d0);                // market
villager(6, 'Knight', 29.34, 32.66, 120, 'Sit_Chair_Idle', 0xa08060);   // on a stool of the first yard table

// ---------------------------------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------------------------------
export const TOWN: TownDef = {
  id: 'town_kuzgunkale',
  name: 'Kuzgunkale',
  size: [320, 320],
  spawn: { pos: [0, 0, 26], facing: 180 },
  arrival: { pos: [0, 2, -38], facing: 0 },
  // South Gate -> Sisli Vadi (open-world map, WP2). East Gate -> Karakır Bozkırı (map 2, skeleton; the entry is locked in TownScene
  // until flag q.mq_19_kuzgunkaleye_donus is done or level >= 30, GDD_OPENWORLD §9.3).
  exits: [
    { id: 'guney_kapisi', box: [-4, 158, 4, 162], to: 'sisli_vadi' },
    { id: 'dogu_kapisi', box: [158, -4, 162, 4], to: 'karakir_bozkiri' },
    // West Gate -> Kızıl Sınır (WP-07): TownScene.exitLock needs level 35
    { id: 'bati_kapisi', box: [-162, -4, -158, 4], to: 'kizil_sinir' },
  ],
  terraces: [{ id: 'kadim_kapilar_salonu', box: [-24, -58, 24, -28], y: 2 }],
  // the stair runs along z from the terrace edge (z -28, y 2) down to the plaza (z -24, y 0)
  stairs: [{ id: 'salon_merdiveni', box: [-6, -28, 6, -24], yFrom: 2, yTo: 0, axis: 'z' }],
  lighting: {
    hemiSky: 0xffe0b0, hemiGround: 0x504030, hemiIntensity: 0.6, sun: 0xffc890, sunIntensity: 1.2, sunDir: [-0.64, 0.42, 0.64],
    fogColor: 0xd8c0a0, fogNear: 30, fogFar: 140,
  },
  zones: [
    { id: 'guney_kapisi', name: 'Güney Kapısı', box: [-24, 120, 24, 160] },
    { id: 'dogu_kapisi', name: 'Doğu Kapısı', box: [120, -24, 160, 24] },
    { id: 'bati_kapisi', name: 'Batı Kapısı', box: [-160, -24, -120, 24] },
    { id: 'demirci_mahallesi', name: 'Demirci Mahallesi', box: [64, -150, 150, -60] },
    { id: 'kervansaray', name: 'Kervansaray', box: [64, 60, 150, 150] },
    { id: 'tapinak', name: 'Tapınak Avlusu', box: [-150, -150, -64, -60] },
    { id: 'lonca', name: 'Lonca Meydanı', box: [-150, 60, -64, 150] },
    { id: 'kadim_kapilar', name: 'Kadim Kapılar Salonu', box: [-24, -58, 24, -28] },
    { id: 'zanaat_sokagi', name: 'Zanaat Sokağı', box: [16, -20, 56, 18] },
    { id: 'carsi', name: 'Çarşı', box: [-56, -20, -16, 18] },
    { id: 'egitim_alani', name: 'Eğitim Alanı', box: [-56, 24, -20, 56] },
    { id: 'han_bahcesi', name: 'Han Bahçesi', box: [20, 24, 56, 56] },
    { id: 'meydan', name: 'Meydan', box: [-14, -6, 14, 22] },
    { id: 'ana_yol', name: 'Ana Yol', box: [-4, -26, 4, 160] },
  ],
  props,
  npcs,
};
