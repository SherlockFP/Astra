import type { EnemyDef } from '../types/enemies';
import { ENEMIES, A_WOLF, cone, aoe, line, buff, charge, summonAb, derive, boss, bp } from './enemyKit';
import { ITCH } from './enemyModels';

/**
 * KARAKIR BOZKIRI mob roster (levels 30-45, docs/GDD_OPENWORLD.md section 1.8). OWNER: enemies module.
 *
 * No new bodies and no new engine behaviour: every mob is a retinted copy of an existing open-world def (`variant`), registered under a
 * new `kb_` id with its own name, tint (or creature texture) and a small stat bias. HP and damage follow the same helpers as Sisli
 * Vadi: `hpMult` x monsterHP(level), `dmgMult` x monsterDmg(level) (entities/EnemyFactory.ts), and the level comes from the pack's
 * `levelRange` (30-33 / 33-36 / 36-38 / 38-40), so the numbers are scaled by the band without any table here.
 *
 * Called once from the end of data/enemies.ts (the bases `ow_*`, `skel_*` are defined there, after the imports run).
 * Rares (`rare_kb_*`), the mini-boss (`mb_kb_horgan`) and the world boss (`wb_ulu_boz`) are placed by data/world/karakir*.ts.
 */

interface VariantOpts {
  name: string;
  scale?: number;
  tint?: number;
  hp?: number;
  dmg?: number;
  speed?: number;
  /** Creature texture override (EnemyVisual.texture), e.g. wolf_white. */
  texture?: string;
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
  if (o.texture) d.visual = { ...(b.visual ?? {}), texture: TEX(o.texture) };
  ENEMIES[id] = d;
}

export function registerKarakirEnemies(): void {
  // ---- R7 Karakir Otlaklari (30-33): dry grass, wolves, raiders, dust goblins -------------------------------------------
  variant('kb_kurt', 'ow_wolf', { name: 'Bozkır Kurdu', tint: 0xd8c090, scale: 1.05, hp: 1.05, dmg: 1.05 });
  variant('kb_domuz', 'ow_boar', { name: 'Dikenli Bozkır Domuzu', tint: 0xa88c58, scale: 1.1, hp: 1.15 });
  variant('kb_ari', 'ow_wasp', { name: 'Toz Arısı', tint: 0xe8c840 });
  variant('kb_goblin', 'ow_goblin', { name: 'Toz Goblini', tint: 0xd8c078, scale: 1.05 });
  variant('kb_goblin_saman', 'ow_goblin_shaman', { name: 'Toz Şamanı', tint: 0xb8a050 });
  variant('kb_haydut', 'ow_bandit', { name: 'Bozkır Haydutu', tint: 0xc4a468, hp: 1.1, dmg: 1.05 });
  variant('kb_haydut_okcu', 'ow_bandit_archer', { name: 'Bozkır Okçusu', tint: 0xb89c60, dmg: 1.05 });
  variant('kb_haydut_pehlivan', 'ow_bandit_brute', { name: 'Atlı Pehlivan', tint: 0x9c7a48, hp: 1.1 });
  variant('kb_ayi', 'ow_bear', { name: 'Bozkır Ayısı', texture: 'bear_old', hp: 1.1 });

  // ---- R8 Kizil Corak (33-36): red badlands, orcs, centipedes, stone and ash -----------------------------------------------
  variant('kb_ork', 'ow_orc', { name: 'Çorak Orku', tint: 0xd08058, hp: 1.1, dmg: 1.05 });
  variant('kb_ork_atici', 'ow_orc_archer', { name: 'Çorak Mızrakçısı', tint: 0xc07848 });
  variant('kb_ork_saman', 'ow_orc_shaman', { name: 'Kızıl Şaman', tint: 0xd05030 });
  variant('kb_ork_cellat', 'ow_orc_brute', { name: 'Çorak Cellatı', tint: 0xa85838, hp: 1.1, dmg: 1.05 });
  variant('kb_ciyan', 'ow_centipede', { name: 'Kızıl Çıyan', tint: 0xd85838, hp: 1.1 });
  variant('kb_orumcek', 'ow_spider', { name: 'Çorak Örümceği', tint: 0xc09060 });
  variant('kb_orumcek_dev', 'ow_spider_giant', { name: 'Kızıl Ana Örümcek', tint: 0xd09870, hp: 1.1 });
  variant('kb_golem', 'ow_golem', { name: 'Kızıl Kaya Golemi', tint: 0xc87048, hp: 1.1 });
  variant('kb_iblis', 'ow_imp', { name: 'Kül İblisi', tint: 0xb04828 });
  variant('kb_kor', 'ow_ember', { name: 'Çorak Közü', tint: 0xff7a30, hp: 1.1 });
  variant('kb_gergedan', 'ow_rhino', { name: 'Kızıl Gergedan', tint: 0xc89070, hp: 1.1, dmg: 1.05 });

  // ---- R9 Ruzgar Yaylasi (36-38): windswept plateau, burial mounds (kurgan), dark wargs ---------------------------------------
  variant('kb_iskelet', 'skel_minion', { name: 'Kurgan İskeleti', tint: 0xc4b48c });
  variant('kb_iskelet_okcu', 'skel_archer', { name: 'Kurgan Okçusu', tint: 0xc4b48c });
  variant('kb_iskelet_buyucu', 'skel_mage', { name: 'Kurgan Büyücüsü', tint: 0xa8c0b0 });
  variant('kb_iskelet_muhafiz', 'skel_warrior', { name: 'Kurgan Muhafızı', tint: 0xb8a878, hp: 1.1 });
  variant('kb_hortlak', 'ow_wraith', { name: 'Kurgan Hortlağı', tint: 0xc8e8d0 });
  variant('kb_sovalye', 'ow_grave_knight', { name: 'Kurgan Şövalyesi', tint: 0x6a6a58, hp: 1.1 });
  variant('kb_warg', 'ow_warg', { name: 'Yayla Wargı', texture: 'warg_black', hp: 1.1, dmg: 1.05 });
  variant('kb_yayla_kurdu', 'ow_wolf_dire', { name: 'Rüzgâr Kurdu', tint: 0xb8b8a8, hp: 1.1 });
  variant('kb_yayla_ayisi', 'ow_bear', { name: 'Yayla Ayısı', tint: 0xa8a090, hp: 1.15, dmg: 1.05 });

  // ---- R10 Ayaz Etegi (38-40): snow foothills ------------------------------------------------------------------------------
  variant('kb_ayaz_kurdu', 'ow_wolf', { name: 'Ayaz Kurdu', texture: 'wolf_white', scale: 1.05, hp: 1.15, dmg: 1.1 });
  variant('kb_ayaz_warg', 'ow_warg', { name: 'Ayaz Wargı', texture: 'warg_ash', hp: 1.15, dmg: 1.1 });
  variant('kb_ayaz_ayisi', 'ow_bear', { name: 'Kar Ayısı', tint: 0xeaf2ff, hp: 1.2, dmg: 1.1 });
  variant('kb_buz_golemi', 'ow_golem', { name: 'Buz Golemi', tint: 0xa8d8ff, hp: 1.15, dmg: 1.1 });
  variant('kb_buz_hortlak', 'ow_wraith', { name: 'Ayaz Hortlağı', tint: 0x90d0ff, dmg: 1.1 });
  variant('kb_ayaz_ork', 'ow_orc', { name: 'Ayaz Orku', tint: 0x98acc8, hp: 1.15, dmg: 1.1 });
  variant('kb_ayaz_cellat', 'ow_orc_brute', { name: 'Ayaz Cellatı', tint: 0x8098b8, hp: 1.15, dmg: 1.1 });
  variant('kb_ayaz_orumcek', 'ow_spider', { name: 'Buz Örümceği', texture: 'spider_pale', hp: 1.15, dmg: 1.1 });

  // ---- R11 Kul Ovasi (40-43): ash plain, ash ghouls, will-o'-wisps, ash golems, cinders ----------------------------------------
  variant('kb_kul_akrep', 'ow_centipede', { name: 'Kül Akrebi', tint: 0x8c8478, hp: 1.1 });
  variant('kb_kul_kurdu', 'ow_wolf_dire', { name: 'Kül Kurdu', tint: 0x8a8680, hp: 1.1, dmg: 1.05 });
  variant('kb_kul_hortlak', 'ow_ghoul', { name: 'Kül Hortlağı', tint: 0xb0a890, hp: 1.1 });
  variant('kb_kul_ates', 'ow_will', { name: 'Kül Ateşi', tint: 0xffb060 });
  variant('kb_kul_golem', 'ow_golem', { name: 'Kül Golemi', tint: 0x7a7068, hp: 1.15, dmg: 1.1 });
  variant('kb_kul_cellat', 'ow_orc_brute', { name: 'Küllü Cellat', tint: 0x6e6258, hp: 1.15, dmg: 1.1 });
  variant('kb_kul_cin', 'ow_imp', { name: 'Kül Cini', tint: 0x8a6a58, hp: 1.1 });

  // ---- R12 Kartal Sirti (43-45): eagle ridge, cliff bandits, eagle priests, giant hawks -------------------------------------
  variant('kb_kartal_yirtici', 'ow_warg', { name: 'Sırt Yırtıcısı', tint: 0xcfc8b8, speed: 1.1, hp: 1.15, dmg: 1.1 });
  variant('kb_kartal_karakus', 'ow_wasp', { name: 'Dev Karakuş', tint: 0xe0d8c0, scale: 1.3, hp: 1.1 });
  variant('kb_kartal_rahip', 'shadow_priest', { name: 'Kartal Rahibi', tint: 0xe0d8c0, hp: 1.1, dmg: 1.05 });
  variant('kb_kartal_gozcu', 'ow_bandit_archer', { name: 'Sırt Gözcüsü', tint: 0xa0a8b0, dmg: 1.1 });
  variant('kb_kartal_dagci', 'ow_bandit_brute', { name: 'Dağcı Haydudu', tint: 0x8c9098, hp: 1.15, dmg: 1.05 });

  // Ayaz Mamutu: an elite on the mammoth body (clips Stomp / Charge / TuskSwipe), plain ability rows, no script.
  ENEMIES.kb_mamut = {
    id: 'kb_mamut', name: 'Ayaz Mamutu', model: ITCH('mammoth'), scale: 0.62, role: 'melee', rank: 'elite', hpMult: 4.6, dmgMult: 1.75,
    speed: 4.6, radius: 1.5, aggroRange: 12, leashRange: 40, attackRange: 4.2, attackCooldown: 2.4,
    basicAttack: cone('kb_mamut_tusk', 'Diş Savurma', 4.2, 110, 2.4, 1.0, 'TuskSwipe', 0.5, { windup: 0.6 }),
    abilities: [
      charge('kb_mamut_charge', 'Hücum', 14, 12, 1.2, 2.4, 'Charge', 0.5, { shape: { type: 'line', length: 14, width: 2.6 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      aoe('kb_mamut_stomp', 'Tepinme', 'self_aoe', 5, 5, 12, 1.1, 1.9, 'physical', 'Stomp', 0.55),
    ],
    forces: 0, xp: 5, resist: { frost: 0.5 }, ccImmune: false,
    anims: A_WOLF, ai: { dormant: true, wakeRange: 7 },
  };

  // ---- named rares (4): elite, xp x10, one special each --------------------------------------------------------------------
  derive('rare_kb_alaca_yele', 'Alaca Yele', 'ow_warg', {
    scale: 1.45, tint: 0xb89860, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_kb_alaca_yele',
    abilities: [
      charge('rare_kb_alaca_yele_lunge', 'Atılma', 9, 8, 0.8, 2.0, 'Lunge', 0.93),
      summonAb('rare_kb_alaca_yele_howl', 'Bozkır Ulumı', 'kb_kurt', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.7, once: 1, radius: 14 } }),
      buff('rare_kb_alaca_yele_rage', 'Alaca Öfke', 0.8, 25, [{ status: 'empower', duration: 8, magnitude: 0.3 }], 'Howl', 0.8, { params: { self: 1, radius: 14 } }),
    ],
  });
  derive('rare_kb_kor_pehlivan', 'Kor Pehlivan Dağhan', 'ow_orc_brute', {
    scale: 1.2, tint: 0xd85a28, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_kb_kor_pehlivan',
    abilities: [
      charge('rare_kb_kor_pehlivan_charge', 'Zincir Hücumu', 12, 11, 1.0, 1.8, 'Charge', 0.6, { shape: { type: 'line', length: 12, width: 2.2 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      aoe('rare_kb_kor_pehlivan_slam', 'Kor Darbesi', 'self_aoe', 5, 5, 10, 1.1, 2.2, 'fire', 'Weapon', 0.45, { vfx: 'fire_burst' }),
      buff('rare_kb_kor_pehlivan_cry', 'Pehlivan Narası', 0.6, 22, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { self: 1, radius: 12 } }),
    ],
  });

  derive('rare_kb_kul_hayaleti', 'Kül Hayaleti', 'ow_wraith', {
    scale: 1.4, tint: 0xc8c4b8, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_kb_kul_hayaleti',
    abilities: [
      charge('rare_kb_kul_hayaleti_glide', 'Kül Süzülüşü', 10, 9, 0.8, 2.0, 'Lunge', 0.9),
      summonAb('rare_kb_kul_hayaleti_call', 'Kül Çağrısı', 'kb_kul_ates', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
    ],
  });
  derive('rare_kb_kartal_kral', 'Kartal Kralı', 'ow_warg', {
    scale: 1.5, tint: 0xf0e0c0, hp: 9, rank: 'elite', xp: 10, loot: 'loot_rare_kb_kartal_kral',
    abilities: [
      charge('rare_kb_kartal_kral_dive', 'Dalış', 13, 9, 0.9, 2.0, 'Lunge', 0.9, { shape: { type: 'line', length: 13, width: 2.4 }, statuses: [{ status: 'knockdown', duration: 0.8 }] }),
      summonAb('rare_kb_kartal_kral_call', 'Kanat Çağrısı', 'kb_kartal_karakus', 3, 30, 'Howl', 0.8, { params: { hpBelow: 0.6, once: 1, radius: 14 } }),
      buff('rare_kb_kartal_kral_rage', 'Kral Öfkesi', 0.8, 25, [{ status: 'empower', duration: 8, magnitude: 0.3 }], 'Howl', 0.8, { params: { self: 1, radius: 14 } }),
    ],
  });

  // ---- mini-bosses (2): Corak Kagani Horgan (Kizil Corak) and Kul Efendisi Ruhan (Kul Ovasi), 20 / 25 min respawn (MiniBossDirector) ----
  derive('mb_kb_kul_efendisi', 'Kül Efendisi Ruhan', 'ow_grave_knight', {
    scale: 1.55, tint: 0x7a7468, hp: 26, rank: 'miniboss', xp: 25, loot: 'loot_mb_kb_kul_efendisi', ai: { homeRadius: 30 },
    abilities: [
      buff('mb_kb_kul_efendisi_cry', 'Kül Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { radius: 14, self: 1 } }),
      line('mb_kb_kul_efendisi_rend', 'Kül Yarması', 11, 2.8, 9, 1.1, 2.9, 'physical', 'Weapon', 0.45),
      charge('mb_kb_kul_efendisi_charge', 'Kül Hücumu', 14, 14, 1.0, 1.5, 'Charge', 0.6, { shape: { type: 'line', length: 14, width: 2 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
      summonAb('mb_kb_kul_efendisi_horde', 'Hortlak Çağrısı', 'kb_kul_hortlak', 4, 30, 'Wave', 0.8),
    ],
  });

  // ---- mini-boss (1): Corak Kagani Horgan, lair in the Kizil Corak, 20 min respawn (MiniBossDirector) ------------------------
  derive('mb_kb_horgan', 'Çorak Kağanı Horgan', 'ow_orc_chief', {
    scale: 1.55, tint: 0xc86a38, hp: 26, rank: 'miniboss', xp: 25, loot: 'loot_mb_kb_horgan', ai: { homeRadius: 30 },
    abilities: [
      buff('mb_kb_horgan_cry', 'Kağan Narası', 0.6, 20, [{ status: 'empower', duration: 8, magnitude: 0.25 }], 'Wave', 0.8, { params: { radius: 14, self: 1 } }),
      line('mb_kb_horgan_rend', 'Yarma', 11, 2.8, 9, 1.1, 2.9, 'physical', 'Weapon', 0.45),
      charge('mb_kb_horgan_charge', 'Kağan Hücumu', 14, 14, 1.0, 1.5, 'Charge', 0.6, { shape: { type: 'line', length: 14, width: 2 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
      summonAb('mb_kb_horgan_horde', 'Sürü Çağrısı', 'kb_ork', 4, 30, 'Wave', 0.8),
    ],
  });

  // ---- world boss: Ulu-Boz, Kadim Mamut (GDD 1.8). Generic ability rows only (BossController runs them through EnemyAI) ------
  boss({
    id: 'wb_ulu_boz', name: 'Ulu-Boz', title: 'Kadim Mamut', model: ITCH('mammoth'), scale: 1.05, role: 'melee',
    hp: 150, dmg: 2.7, speed: 4.8, radius: 2.8, enrage: 36000, arenaR: 28, loot: 'loot_wb_ulu_boz', anims: A_WOLF,
    resist: { frost: 0.5, physical: 0.05 }, armor: 1.4, visual: { glow: 0x9ad0ff },
    basic: cone('ulu_boz_tusk', 'Diş Savurma', 7, 120, 2.7, 1.0, 'TuskSwipe', 0.5, { windup: 0.8, telegraph: true }),
    abilities: [
      aoe('ulu_boz_stomp', 'Yer Sarsıntısı', 'self_aoe', 9, 9, 12, 1.4, 2.2, 'physical', 'Stomp', 0.55, { initialCooldown: 6 }),
      charge('ulu_boz_charge', 'Buz Hücumu', 24, 16, 1.4, 2.8, 'Charge', 0.5, { shape: { type: 'line', length: 24, width: 4 }, statuses: [{ status: 'knockdown', duration: 1 }] }),
      summonAb('ulu_boz_trumpet', 'Sürü Borusu', 'kb_ayaz_kurdu', 4, 28, 'Trumpet', 0.8, { params: { radius: 18 } }),
      aoe('ulu_boz_frost', 'Don Çemberi', 'ground_aoe', 5, 20, 14, 1.6, 1.8, 'frost', 'Trumpet', 0.8),
    ],
    phases: [
      bp('p1', 1.01, ['ulu_boz_stomp', 'ulu_boz_charge']),
      bp('p2', 0.65, ['ulu_boz_stomp', 'ulu_boz_charge', 'ulu_boz_trumpet'], { yell: 'Sürü, bana!' }),
      bp('p3', 0.3, ['ulu_boz_stomp', 'ulu_boz_charge', 'ulu_boz_trumpet', 'ulu_boz_frost'], { yell: 'Ayaz her şeyi donduracak!' }),
    ],
    intro: 'Bu buzullar benden eski. Gidin, yoksa donarsınız!', death: 'Buz... eriyor...',
    // Buzul Canağı: tile (276, 222) = world (1106, 890), r 7 tiles = 28 m (WorldDecor places the BossPlacement at the same point)
    arena: { cx: 1106, cz: 890, w: 56, h: 56, homeX: 1106, homeZ: 890 },
  });
}
