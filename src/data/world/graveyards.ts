import type { GraveyardDef } from '../../types/dungeons';

/**
 * Sisli Vadi graveyards (WoW spirit healers, GDD_OPENWORLD death rules). OWNER: content module.
 * Tile coords on the 400 x 400 map (1 tile = 4 m). Placement rules, checked by tools/content-check.mjs (graveyard rule):
 *  - every graveyard stands in a region room, 35 m or more from every camp and patrol centre (no camp is inside one, so a release
 *    point is never the middle of a mob pack);
 *  - every quest area of the map has a graveyard within 250 m: the quest giver's village and the in-band camps of each kill / metin /
 *    elite / boss / skill target (levels q-1..q+1 of the quest's region).
 * Hubs: Gümüşdere (the starting village, also the inner ring of Sisli Koru) and Altın Ambar Çiftliği (Rıza's hub). Rings: one per camp
 * ring of Sisli Koru (inner = Gümüşdere, middle = L3, outer = L4-5). The rest cover the quest areas of the other regions.
 */
export const GRAVEYARDS: GraveyardDef[] = [
  { id: 'gy_gumusdere', name: 'Gümüşdere Mezarlığı', pos: [200, 34], regionId: 'r1', villageId: 'koy_gumusdere' },
  { id: 'gy_altin_ambar', name: 'Altın Ambar Mezarlığı', pos: [304, 50], regionId: 'r2', villageId: 'kamp_ciftlik' },
  { id: 'gy_koru_orta', name: 'Sisli Koru Orta Mezarlığı', pos: [198, 48], regionId: 'r1' },
  { id: 'gy_koru_dis', name: 'Sisli Koru Dış Mezarlığı', pos: [182, 76], regionId: 'r1' },
  { id: 'gy_koru_bati', name: 'Sisli Koru Batı Mezarlığı', pos: [96, 26], regionId: 'r1' },
  { id: 'gy_tarla_karakol', name: 'Tarla Karakolu Mezarlığı', pos: [340, 50], regionId: 'r2' },
  { id: 'gy_tarla_dogu', name: 'Altın Tarlalar Mezarlığı', pos: [392, 140], regionId: 'r2' },
  { id: 'gy_ciftlik_yolu', name: 'Çiftlik Yolu Mezarlığı', pos: [286, 114], regionId: 'r2' },
  { id: 'gy_gecit', name: 'Geçit Mezarlığı', pos: [250, 228], regionId: 'r3' },
  { id: 'gy_haydut', name: 'Haydut Tepeleri Mezarlığı', pos: [362, 198], regionId: 'r3' },
  { id: 'gy_tepeler', name: 'Tepeler Mezarlığı', pos: [356, 288], regionId: 'r3' },
  { id: 'gy_konak', name: 'Bataklık Konağı Mezarlığı', pos: [304, 336], regionId: 'r4' },
  { id: 'gy_konak_kiyi', name: 'Bataklık Kıyısı Mezarlığı', pos: [296, 354], regionId: 'r4' },
  { id: 'gy_iskele', name: 'Bataklık İskelesi Mezarlığı', pos: [206, 342], regionId: 'r4' },
  { id: 'gy_agit', name: 'Ağıt Bataklığı Mezarlığı', pos: [368, 332], regionId: 'r4' },
  { id: 'gy_kanyon_girisi', name: 'Kanyon Girişi Mezarlığı', pos: [128, 330], regionId: 'r5' },
  { id: 'gy_ork_kanyonu', name: 'Ork Kanyonu Mezarlığı', pos: [94, 332], regionId: 'r5' },
  { id: 'gy_kanyon_bati', name: 'Ork Kanyonu Batı Mezarlığı', pos: [8, 340], regionId: 'r5' },
  { id: 'gy_kanyon_kuzey', name: 'Ork Kanyonu Kuzey Mezarlığı', pos: [8, 252], regionId: 'r5' },
  { id: 'gy_kanyon_guney', name: 'Ork Kanyonu Güney Mezarlığı', pos: [8, 392], regionId: 'r5' },
  { id: 'gy_son_ocak', name: 'Son Ocak Mezarlığı', pos: [80, 246], regionId: 'r6' },
  { id: 'gy_harabe_1', name: 'Harabe Mezarlığı I', pos: [68, 130], regionId: 'r6' },
  { id: 'gy_harabe_2', name: 'Harabe Mezarlığı II', pos: [132, 176], regionId: 'r6' },
  { id: 'gy_harabe_3', name: 'Harabe Mezarlığı III', pos: [24, 190], regionId: 'r6' },
];
