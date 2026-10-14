import type { EnemyAbility, EnemyDef } from '../types/enemies';
import type { MetinSpec, MetinWaveSpec } from './enemies';
import { ENEMIES, A_WOLF, cone, aoe, line, buff, charge, summonAb, derive, boss, bp, add, NOOP } from './enemyKit';
import { ITCH, PROC } from './enemyModels';

/**
 * AYAZ DAGLARI mob roster (levels 45-60, regions r16..r21, snowy mountains). OWNER: enemies module.
 *
 * Same pattern as enemies_karakir.ts: no new bodies and no new engine behaviour. Every trash mob is a retinted copy of an existing
 * open-world def (`variant`) under an `ad_` id, with its own name, tint (or creature texture) and a small stat bias. HP and damage
 * follow the pack levelRange through `hpMult` x monsterHP(level) and `dmgMult` x monsterDmg(level), so the band scales the numbers.
 *
 * Rares (`rare_ad_*`), mini-bosses (`mb_ad_*`), the world boss (`wb_ad_zemheri`) and the six metin stones (`ad_metin_t1..t6`) are
 * built here too. The metin scripts go to AYAZ_METIN_SPECS, which enemies.ts merges into METIN_SPECS (single source for the stones).
 * Called once from the end of data/enemies.ts; the bases used here are all defined there or in enemies_karakir.ts (registered before).
 */

interface VariantOpts {
  name: string;
  scale?: number;
  tint?: number;
  emissive?: number;
  hp?: number;
  dmg?: number;
  speed?: number;
  /** Creature texture override (EnemyVisual.texture), e.g. wolf_white. */
  texture?: string;
  /** AI hints override, e.g. a dormant guardian. */
  ai?: EnemyDef['ai'];
}

const TEX = (n: string): string => `/assets/textures/itch/creatures/${n}.png`;

function variant(id: string, base: string, o: VariantOpts): void {
  const b = ENEMIES[base];
  if (!b) {
    console.warn(`[enemy] variant "${id}": unknown base "${base}"`);
    return;
  }
  const d: EnemyDef = {
    ...b,
    id,
    name: o.name,
    scale: b.scale * (o.scale ?? 1),
    tint: o.tint ?? b.tint,
    hpMult: b.hpMult * (o.hp ?? 1),
    dmgMult: b.dmgMult * (o.dmg ?? 1),
    speed: b.speed * (o.speed ?? 1),
    forces: 0,
    leashRange: 40,
  };
  if (o.emissive !== undefined) d.emissive = o.emissive;
  if (o.texture) d.visual = { ...(b.visual ?? {}), texture: TEX(o.texture) };
  if (o.ai) d.ai = o.ai;
  ENEMIES[id] = d;
}

/** Metin stone body (copy of the metinStone helper in enemies.ts section 4: stationary, curse-free core, ccImmune). */
const METIN_CORE = (): EnemyAbility => ({ id: 'metin_core', name: 'Metin Çekirdeği', kind: 'custom', range: 0, cooldown: 0, windup: 0, anim: '', params: { passive: 1 } });
const metinStone = (id: string, name: string, tint: number, hp: number, armor: number, loot: string): void =>
  add({
    // dmg 1: the stone never swings, but its pulse / aura coefficients are relative to this base damage
    id, name, model: PROC('metin_stone'), scale: 1, tint, role: 'support', rank: 'miniboss', hp, dmg: 1, speed: 0, radius: 1.2, aggro: 0, forces: 0, xp: 15,
    armor, ccImmune: true, leash: 0, loot,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' },
    basic: NOOP(`${id}_none`), abilities: [METIN_CORE()], ai: { stationary: true },
  });

/** Tier script of the Ayaz stones, merged into METIN_SPECS by enemies.ts (same shape as Karakir's, read by ai/metin.ts). */
export const AYAZ_METIN_SPECS: Record<string, MetinSpec> = {};

const METIN_WAVE_HP = [0.85, 0.65, 0.45, 0.25, 0.1];
const metinWaves = (rows: [string, number][][]): MetinWaveSpec[] =>
  rows.map((members, i) => ({ hpBelow: METIN_WAVE_HP[i], members: members.map(([enemyId, count]) => ({ enemyId, count })) }));

export function registerAyazEnemies(): void {
  // ---- trash (r16..r21, levels 45-60): one row per region, bases from the open-world roster -----------------------------------
  variant('ad_kar_kurdu', 'ow_wolf', { name: 'Kar Kurdu', tint: 0xdfeeff, hp: 1.05, dmg: 1.05 });
  variant('ad_kar_warg', 'ow_warg', { name: 'Kar Wargı', tint: 0xd6e6ff, hp: 1.1, dmg: 1.05 });
  variant('ad_kar_tilki', 'ow_wolf', { name: 'Kar Tilkisi', tint: 0xf0d8b0, scale: 0.7, speed: 1.25, hp: 0.7, dmg: 0.9 });
  variant('ad_dag_keci', 'ow_boar', { name: 'Dağ Keçisi', tint: 0xd8d4cc, hp: 1.05 });
  variant('ad_buz_ayisi', 'ow_bear', { name: 'Buz Ayısı', tint: 0xdcecff, hp: 1.15, dmg: 1.05 });
  variant('ad_yeti', 'yeti_brute', { name: 'Yeti', tint: 0xf4faff, scale: 1.12, hp: 1.1, dmg: 1.05 });
  variant('ad_buz_golemi', 'bone_golem', { name: 'Buz Golemi', tint: 0xb8e4ff, hp: 1.05 });
  variant('ad_don_hortlak', 'ow_ghoul', { name: 'Donmuş Hortlak', tint: 0xc0e0f0, hp: 1.05 });
  variant('ad_don_iskelet', 'frost_dead', { name: 'Donmuş İskelet', tint: 0xbfe8ff, hp: 1.05 });
  variant('ad_don_iskelet_okcu', 'skel_archer', { name: 'Donmuş İskelet Okçusu', tint: 0xbfe8ff });
  variant('ad_buz_orumcek', 'snow_spider', { name: 'Buz Örümceği', tint: 0xdcecff, hp: 1.05 });
  variant('ad_buz_orumcek_dev', 'ow_spider_giant', { name: 'Dev Buz Örümceği', tint: 0xdcecff, hp: 1.1 });
  variant('ad_kar_haydut', 'ow_bandit', { name: 'Kar Haydudu', tint: 0xc8d8e8, hp: 1.1, dmg: 1.05 });
  variant('ad_kar_haydut_okcu', 'ow_bandit_archer', { name: 'Kar Okçusu', tint: 0xc0d0e0, dmg: 1.05 });
  variant('ad_kar_ork', 'ow_orc', { name: 'Ayaz Orku', tint: 0xa8c4dc, hp: 1.15, dmg: 1.1 });
  variant('ad_kar_ork_okcu', 'ow_orc_archer', { name: 'Ayaz Okçusu', tint: 0xa0bcd4 });
  variant('ad_kar_cellat', 'ow_orc_brute', { name: 'Ayaz Cellatı', tint: 0x90a8c4, hp: 1.15, dmg: 1.1 });
  variant('ad_kar_saman', 'ow_orc_shaman', { name: 'Buz Şamanı', tint: 0x9ad4ff });
  variant('ad_buz_cin', 'frost_wraith', { name: 'Buz Cini', tint: 0xc8f0ff, hp: 1.05, dmg: 1.1 });
  variant('ad_buz_ruhu', 'ow_will', { name: 'Buz Ruhu', tint: 0xbff0ff, emissive: 0xbff0ff });
  // Genç Mamut: the young of the Ayaz mammoth (kb_mamut). It has no trash base of its own, so it keeps the elite rank of kb_mamut.
  variant('ad_mamut', 'kb_mamut', { name: 'Genç Mamut', scale: 0.8, hp: 0.6 });
  // Kar Kartalı: flyer, the wasp body with the dive charge (ow_wasp_dive); its hp is scaled up from the wasp's 0.3 swarm base.
  variant('ad_kartal', 'ow_wasp', { name: 'Kar Kartalı', tint: 0xf4f8ff, scale: 1.3, hp: 3.2, dmg: 1.2 });
  variant('ad_buz_rahip', 'shadow_priest', { name: 'Buz Rahibi', tint: 0xc8f0ff });
  variant('ad_buz_sovalye', 'frost_knight', { name: 'Buz Şövalyesi', tint: 0xbfe8ff, hp: 1.1 });
  // Buz Muhafızı: dormant guardian (floor pose until a player comes within wakeRange), as kb_mamut.
  variant('ad_buz_muhafiz', 'ow_golem', { name: 'Buz Muhafızı', tint: 0xbfe4ff, hp: 1.2, ai: { dormant: true, wakeRange: 8 } });

  // ---- named rares (6, one per region): elite, xp x10, one special each -----------------------------------------------------
  derive('rare_ad_kiragi_kurdu', 'Kırağı Kurdu', 'ow_wolf_dire', {
    scale: 1.45, tint: 0xd8ecff, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_ad_kiragi_kurdu',
    abilities: [
      charge('rare_ad_kiragi_kurdu_lunge', 'Buz Atılması', 9, 8, 0.8, 2.0, 'Lunge', 0.93),
      summonAb('rare_ad_kiragi_kurdu_howl', 'Kırağı Uluması', 'ad_kar_kurdu', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.7, once: 1, radius: 14 } }),
      buff('rare_ad_kiragi_kurdu_rage', 'Kırağı Öfkesi', 0.8, 25, [{ status: 'empower', duration: 8, magnitude: 0.3 }], 'Howl', 0.8, { params: { self: 1, radius: 14 } }),
    ],
  });
  derive('rare_ad_buz_aga', 'Buz Ağa', 'ow_bandit_chief', {
    scale: 1.3, tint: 0xbcdcf4, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_ad_buz_aga',
    abilities: [
      charge('rare_ad_buz_aga_charge', 'Buz Hücumu', 12, 11, 1.0, 1.8, 'Charge', 0.6, { shape: { type: 'line', length: 12, width: 2.2 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      summonAb('rare_ad_buz_aga_call', 'Haydut Çağrısı', 'ad_kar_haydut', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
      buff('rare_ad_buz_aga_cry', 'Ağa Narası', 0.6, 22, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { self: 1, radius: 12 } }),
    ],
  });
  derive('rare_ad_kar_yeti', 'Kar Yeti Anası', 'yeti_brute', {
    scale: 1.5, tint: 0xf4faff, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_ad_kar_yeti',
    abilities: [
      aoe('rare_ad_kar_yeti_slam', 'Kar Patlaması', 'self_aoe', 5, 5, 10, 1.1, 2.2, 'frost', 'Weapon', 0.45, { vfx: 'frost_nova' }),
      summonAb('rare_ad_kar_yeti_call', 'Yeti Çağrısı', 'ad_yeti', 2, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
      buff('rare_ad_kar_yeti_rage', 'Ana Öfkesi', 0.8, 25, [{ status: 'empower', duration: 8, magnitude: 0.3 }], 'Howl', 0.8, { params: { self: 1, radius: 14 } }),
    ],
  });
  derive('rare_ad_firtina_kartali', 'Fırtına Kartalı', 'ow_wasp', {
    scale: 1.9, tint: 0xe8f0ff, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_ad_firtina_kartali',
    abilities: [
      charge('rare_ad_firtina_kartali_dive', 'Fırtına Dalışı', 13, 9, 0.9, 2.0, 'Dive', 0.9, { shape: { type: 'line', length: 13, width: 2.4 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      summonAb('rare_ad_firtina_kartali_call', 'Kanat Çağrısı', 'ad_kartal', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
      buff('rare_ad_firtina_kartali_rage', 'Fırtına Öfkesi', 0.8, 25, [{ status: 'empower', duration: 8, magnitude: 0.3 }], 'Howl', 0.8, { params: { self: 1, radius: 14 } }),
    ],
  });
  derive('rare_ad_don_kral', 'Donmuş Hortlak Kralı', 'ow_ghoul', {
    scale: 1.4, tint: 0xa8d4f0, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_ad_don_kral',
    abilities: [
      charge('rare_ad_don_kral_charge', 'Buz Pençesi', 11, 10, 1.0, 1.9, 'Charge', 0.6, { shape: { type: 'line', length: 11, width: 2.2 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      summonAb('rare_ad_don_kral_call', 'Hortlak Çağrısı', 'ad_don_hortlak', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
      buff('rare_ad_don_kral_cry', 'Kral Narası', 0.8, 25, [{ status: 'empower', duration: 8, magnitude: 0.3 }], 'Howl', 0.8, { params: { self: 1, radius: 14 } }),
    ],
  });
  derive('rare_ad_donmus_sovalye', 'Donmuş Şövalye', 'ow_grave_knight', {
    scale: 1.5, tint: 0x9ccbe8, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_ad_donmus_sovalye',
    abilities: [
      charge('rare_ad_donmus_sovalye_charge', 'Donmuş Hücum', 12, 11, 1.0, 1.9, 'Charge', 0.6, { shape: { type: 'line', length: 12, width: 2.2 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      line('rare_ad_donmus_sovalye_rend', 'Donmuş Yarma', 10, 2.6, 8, 1.0, 2.6, 'frost', 'Weapon', 0.45),
      summonAb('rare_ad_donmus_sovalye_call', 'Şövalye Çağrısı', 'ad_buz_sovalye', 2, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
    ],
  });

  // ---- mini-bosses (3): 25 min respawn class (MiniBossDirector) -------------------------------------------------------------
  derive('mb_ad_buz_dev', 'Buz Devi', 'yeti_brute', {
    scale: 1.8, tint: 0xbfe4ff, hp: 26, rank: 'miniboss', xp: 25, loot: 'loot_mb_ad_buz_dev', ai: { homeRadius: 30 },
    abilities: [
      buff('mb_ad_buz_dev_cry', 'Buz Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { radius: 14, self: 1 } }),
      line('mb_ad_buz_dev_rend', 'Buz Yarması', 11, 2.8, 9, 1.1, 2.9, 'frost', 'Weapon', 0.45),
      charge('mb_ad_buz_dev_charge', 'Buz Hücumu', 14, 14, 1.0, 1.5, 'Charge', 0.6, { shape: { type: 'line', length: 14, width: 2 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
      summonAb('mb_ad_buz_dev_horde', 'Ayaz Çağrısı', 'ad_buz_ayisi', 4, 30, 'Wave', 0.8),
    ],
  });
  derive('mb_ad_kar_alfa', 'Kar Alfası', 'ow_warg', {
    scale: 1.55, tint: 0xeef6ff, hp: 26, rank: 'miniboss', xp: 25, loot: 'loot_mb_ad_kar_alfa', ai: { homeRadius: 30 },
    abilities: [
      buff('mb_ad_kar_alfa_howl', 'Alfa Ulumu', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Howl', 0.8, { params: { radius: 14, self: 1 } }),
      line('mb_ad_kar_alfa_rend', 'Alfa Yarması', 11, 2.8, 9, 1.1, 2.9, 'physical', 'Weapon', 0.45),
      charge('mb_ad_kar_alfa_charge', 'Alfa Hücumu', 14, 14, 1.0, 1.5, 'Lunge', 0.6, { shape: { type: 'line', length: 14, width: 2 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
      summonAb('mb_ad_kar_alfa_pack', 'Sürü Çağrısı', 'ad_kar_kurdu', 4, 30, 'Howl', 0.8),
    ],
  });
  derive('mb_ad_zirve_muhafizi', 'Zirve Muhafızı', 'ow_golem', {
    scale: 1.6, tint: 0xdcecff, hp: 26, rank: 'miniboss', xp: 25, loot: 'loot_mb_ad_zirve_muhafizi', ai: { homeRadius: 30 },
    abilities: [
      aoe('mb_ad_zirve_muhafizi_slam', 'Zirve Darbesi', 'self_aoe', 6, 6, 12, 1.1, 2.2, 'physical', 'Attack', 0.67),
      buff('mb_ad_zirve_muhafizi_cry', 'Muhafız Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { radius: 14, self: 1 } }),
      summonAb('mb_ad_zirve_muhafizi_guard', 'Şövalye Çağrısı', 'ad_buz_sovalye', 3, 30, 'Wave', 0.8),
    ],
  });

  // ---- world boss: Zemheri, the deep-winter beast of the r20 arena. Bear body (ITCH bear, old-fur texture), not the mammoth ---
  boss({
    id: 'wb_ad_zemheri', name: 'Zemheri', title: 'Kışın Kadim Canavarı', model: ITCH('bear'), scale: 1.5, role: 'melee',
    hp: 150, dmg: 2.7, speed: 4.8, radius: 2.6, enrage: 36000, arenaR: 28, loot: 'loot_wb_ad_zemheri', anims: A_WOLF,
    resist: { frost: 0.6, physical: 0.05 }, armor: 1.4, visual: { glow: 0xa0e0ff, texture: TEX('bear_old') },
    basic: cone('zemheri_claw', 'Pençe Savurma', 6.5, 120, 2.6, 1.0, 'Swipe', 0.5, { windup: 0.8, telegraph: true }),
    abilities: [
      aoe('zemheri_stomp', 'Buz Sarsıntısı', 'self_aoe', 9, 9, 12, 1.4, 2.2, 'physical', 'Slam', 0.55, { initialCooldown: 6 }),
      charge('zemheri_charge', 'Kar Fırtınası', 24, 16, 1.4, 2.8, 'Bite', 0.5, { shape: { type: 'line', length: 24, width: 4 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
      summonAb('zemheri_call', 'Kış Çağrısı', 'ad_kar_warg', 4, 28, 'Roar', 0.8, { params: { radius: 18 } }),
      aoe('zemheri_frost', 'Zemheri Ayazı', 'ground_aoe', 5, 20, 14, 1.6, 1.8, 'frost', 'Roar', 0.8),
    ],
    phases: [
      bp('p1', 1.01, ['zemheri_stomp', 'zemheri_charge']),
      bp('p2', 0.65, ['zemheri_stomp', 'zemheri_charge', 'zemheri_call'], { yell: 'Kış derinleşiyor!' }),
      bp('p3', 0.3, ['zemheri_stomp', 'zemheri_charge', 'zemheri_call', 'zemheri_frost'], { yell: 'Zemheri uyandı, herkes donacak!' }),
    ],
    intro: 'Kışın en derin gecesinde uyandım. Ayazımdan kaçamazsınız!', death: 'Kış... nihayet çözüldü...',
    // Zemheri Yatağı in r20: placeholder centre (world m); the zone layout decides the final spot (see the enemies report)
    arena: { cx: 1402, cz: 1002, w: 56, h: 56, homeX: 1402, homeZ: 1002 },
  });

  // ---- metin stones (six, one per tier, tiers 1..6 = r16..r21). Shape copied from the Karakir stones (enemies.ts section 4) ----
  metinStone('ad_metin_t1', 'Kırağı Metini', 0xbfe6ff, 100, 3.9, 'loot_metin_ad_t1');
  metinStone('ad_metin_t2', 'Dondurucu Metini', 0x9ad8ff, 106, 4.1, 'loot_metin_ad_t2');
  metinStone('ad_metin_t3', 'Kar Fırtınası Metini', 0xd8f4ff, 112, 4.3, 'loot_metin_ad_t3');
  metinStone('ad_metin_t4', 'Kutup Metini', 0x7ec8f0, 118, 4.5, 'loot_metin_ad_t4');
  metinStone('ad_metin_t5', 'Ölü Ayaz Metini', 0x6ab0e0, 124, 4.7, 'loot_metin_ad_t5');
  metinStone('ad_metin_t6', 'Zemheri Metini', 0xeaf8ff, 130, 4.9, 'loot_metin_ad_t6');

  AYAZ_METIN_SPECS.ad_metin_t1 = {
    waves: metinWaves([
      [['ad_kar_kurdu', 6]], [['ad_kar_tilki', 4], ['ad_kar_warg', 1]], [['ad_kar_kurdu', 8]], [['ad_dag_keci', 4], ['ad_buz_ayisi', 1]], [['ad_kar_warg', 4], ['ad_kar_kurdu', 4]],
    ]),
    add: { enemyId: 'ad_kar_tilki', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15 },
  };
  AYAZ_METIN_SPECS.ad_metin_t2 = {
    waves: metinWaves([
      [['ad_kar_haydut', 6]], [['ad_kar_haydut_okcu', 4], ['ad_kar_saman', 2]], [['ad_buz_ruhu', 8]], [['ad_kar_cellat', 1], ['ad_kar_ork', 4]], [['ad_kar_ork', 6], ['ad_kar_ork_okcu', 3]],
    ]),
    add: { enemyId: 'ad_buz_ruhu', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15 },
  };
  AYAZ_METIN_SPECS.ad_metin_t3 = {
    waves: metinWaves([
      [['ad_buz_ayisi', 4]], [['ad_buz_cin', 4], ['ad_buz_rahip', 2]], [['ad_kar_kurdu', 8]], [['ad_yeti', 1], ['ad_kar_kurdu', 4]], [['ad_mamut', 1], ['ad_buz_ayisi', 3]],
    ]),
    add: { enemyId: 'ad_buz_cin', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  };
  AYAZ_METIN_SPECS.ad_metin_t4 = {
    waves: metinWaves([
      [['ad_kartal', 6]], [['ad_kar_haydut', 4], ['ad_kar_haydut_okcu', 2]], [['ad_kartal', 8]], [['ad_buz_sovalye', 1], ['ad_kartal', 4]], [['ad_kar_warg', 6], ['ad_kar_haydut', 4]],
    ]),
    add: { enemyId: 'ad_kartal', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  };
  AYAZ_METIN_SPECS.ad_metin_t5 = {
    waves: metinWaves([
      [['ad_don_hortlak', 6]], [['ad_don_iskelet', 4], ['ad_don_iskelet_okcu', 2]], [['ad_buz_orumcek', 8]], [['ad_buz_orumcek_dev', 1], ['ad_buz_orumcek', 4]], [['ad_buz_rahip', 2], ['ad_don_hortlak', 6]],
    ]),
    add: { enemyId: 'ad_don_hortlak', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true, dotPctPerSec: 0.01 },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  };
  AYAZ_METIN_SPECS.ad_metin_t6 = {
    waves: metinWaves([
      [['ad_buz_sovalye', 6]], [['ad_buz_rahip', 4], ['ad_buz_cin', 2]], [['ad_don_iskelet', 8]], [['ad_buz_golemi', 1], ['ad_buz_sovalye', 4]], [['ad_yeti', 1], ['ad_don_hortlak', 6]],
    ]),
    add: { enemyId: 'ad_buz_cin', count: 2, everySec: 20, cap: 12 },
    aura: { radius: 10, slowPct: 0.15, curse: true, dotPctPerSec: 0.01 },
    pulse: { everySec: 12, coef: 1.0, rMax: 12 },
  };
}
