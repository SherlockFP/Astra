/**
 * Loot V3: effect hooks of the 87 Season 1 dungeon uniques (src/data/uniques.ts, K18). OWNER: items module.
 *
 * Each unique's effect is a row of the talent effect DSL (data/talentTrees/fx.ts) that systems/UniqueEffects.ts folds into the
 * proc engine while the item is equipped (GDD_LOOT_V3 §3.2, §10.3), so no Combat / SkillSystem code is needed per item.
 *
 *   mode 'full'   the whole effect of `special.desc` is implemented (`effect` is only given when the numbers differ from the desc)
 *   mode 'approx' the core trigger → payoff is implemented, a sub-part is simplified or dropped; `effect` is the Turkish text of
 *                 what really happens (the tooltip shows it instead of the design text)
 *   mode 'engine' the DSL cannot express it yet; no fx; `need` says which engine piece is missing. The tooltip greys the line
 *                 out and adds "(etkin değil)".
 *
 * Rules (GDD_LOOT_V3 §3.2): no skill ids in `fx`, only `@tag` filters; only existing statuses / stats.
 * The 16 legacy `leg_*` uniques (dragonfang … merchant_kings_ring) keep their bespoke combat hooks: see LEGACY_WIRED_UNIQUES.
 */
export type UniqueFxMode = 'full' | 'approx' | 'engine';

export interface UniqueFxDef {
  mode: UniqueFxMode;
  /** Effect DSL row(s) (`;;` separated). Absent for mode 'engine'. */
  fx?: string;
  /** Turkish tooltip text of what is implemented (defaults to `UniqueDef.special.desc`). */
  effect?: string;
  /** Mode 'engine': the missing engine piece (English, for the status doc). */
  need?: string;
}

/** The legacy uniques whose effects are coded in combat/specials, SkillSystem, Combat and behaviors (they have no fx rows). */
export const LEGACY_WIRED_UNIQUES: readonly string[] = [
  'leg_dragonfang', 'leg_mountain_heart', 'leg_skullsplitter', 'leg_heart_of_storm', 'leg_ember_staff', 'leg_frozen_crown',
  'leg_tome_of_echoes', 'leg_whisper', 'leg_nightstalker_hood', 'leg_windrunner', 'leg_blood_ring', 'leg_eye_of_ancients',
  'leg_madmans_belt', 'leg_titan_grip', 'leg_phoenix_mantle', 'leg_merchant_kings_ring',
];

const full = (fx: string, effect?: string): UniqueFxDef => ({ mode: 'full', fx, effect });
const approx = (fx: string, effect: string): UniqueFxDef => ({ mode: 'approx', fx, effect });
const engine = (need: string): UniqueFxDef => ({ mode: 'engine', need });

export const UNIQUE_FX: Record<string, UniqueFxDef> = {
  // ---------------------------------------------------------------------------- Büyücü Terasi
  mt_gloves_kural: approx('T dodge icd=0.5 => buff(mt_breach,8,{damagePct=.06},max=5)',
    'Bir saldırıdan kaçındığında 8 sn boyunca +%6 hasar kazanırsın (en fazla 5 yığın).'),
  mt_belt_shackle: approx('S ccReductionPct=.25',
    'Üzerindeki kontrol etkilerinin (kök, yavaşlatma, sersemletme...) süresi %25 kısalır.'),
  mt_ring_orb: approx('T crit ch=.2 icd=3 => zone(.6,arcane,6,8,2)',
    'Kritik vuruşların %20 şansla hedefin altında 8 sn süren bir Enerji Alanı bırakır: 2 sn\'de bir 6 m içindekilere %60 arkan hasarı (3 sn bekleme).'),
  leg_cynosure_pendant: approx('T hurt icd=45 => purge(2) ; buff(mt_cynosure,6,{moveSpeedPct=.15})',
    'Hasar aldığında (45 sn\'de bir) 2 olumsuz etkiyi (susturma ve korku dahil) temizler ve 6 sn boyunca %15 hareket hızı kazanırsın.'),
  mt_shield_dome: approx('T block icd=12 => st(foes(6),silence,2)',
    'Bir saldırıyı engellediğinde 6 m çevredeki düşmanları 2 sn susturur (12 sn bekleme).'),
  mt_sword_glaive: approx('T hit:@basic ch=.33 icd=1 => dmg(.7,physical)',
    'Hafif saldırılarının %33\'ü hedefe ek %70 silah hasarı verir (1 sn bekleme).'),
  mt_helm_triplicate: approx('T hit:@aoe icd=0.5 => buff(mt_triple,6,{damagePct=.06},max=5)',
    'Alan hasarı veren her vuruş 6 sn boyunca +%6 hasar yığını verir (en fazla 5 yığın).'),
  mt_legs_neural: approx('T hit ch=.25 icd=0.5 => exp(.25,6,arcane)',
    'Vuruşlarının %25\'i hedefin 6 m çevresine %25 silah hasarını arkan hasarı olarak yayar (0.5 sn bekleme).'),
  mt_staff_echo: approx('T hit:@spell ch=.25 icd=1.5 => dmg(.5,arcane)',
    'Büyülerinin %25\'i hedefe ek %50 arkan hasarı yankılar (1.5 sn bekleme).'),
  leg_orrery_staff: full('T hit:@arcane icd=3 => zone(.18,arcane,3,6,1.5) ;; T hit:@shadow icd=3 => zone(.18,arcane,3,6,1.5)',
    'Arkan veya gölge büyülerin her 3 sn\'de bir hedefin çevresinde Mercek Küresi başlatır: küre 6 sn döner, 1.5 sn\'de bir %18 hasar verir (en fazla 3).'),
  mt_chest_entropy: engine('incoming-damage deferral (spread a share of each hit over 8 s) in Combat.hitLocalPlayer'),
  mt_ring_splinter: full('T crit icd=0.25 => burst(mt_splinter,5,1.5,2.5,physical)',
    'Kritik vuruşlar hedefe Kıymık yığını bırakır; 5. yığında 2.5 m çevreye %150 silah hasarı verir ve yığınlar sıfırlanır.'),

  // ---------------------------------------------------------------------------- Kefaret Salonları
  leg_kef_halkor_shard: full('T crit ch=.12 icd=3 => zone(.5,physical,3,4,1)'),
  leg_kef_sinstone_aegis: approx('T block icd=0.5 => buff(kef_stone,8,{armorPct=.03,damageReductionPct=.02},max=5) ;; T break icd=0.5 => buff(kef_stone,8,{armorPct=.03,damageReductionPct=.02},max=5)',
    'Bir saldırıyı engellediğinde veya düşmanın Duruşunu kırdığında 8 sn Taş Deri yığını alırsın (+%3 zırh ve +%2 hasar azaltma, en fazla 5 yığın).'),
  leg_kef_fracture_axe: approx('T break icd=2 => zone(.6,physical,4,6,1,.1)',
    'Bir düşmanın Duruşunu kırdığında altında 4 m\'lik Günah Çatlağı açılır (6 sn, saniyede %60 hasar); içindeki düşmanlar %10 daha fazla hasar alır.'),
  leg_kef_ekelon_eye: full('T status:stun icd=10 => buff(kef_eye,6,{damageReductionPct=.08}) ;; T break icd=10 => buff(kef_eye,6,{damageReductionPct=.08})'),
  leg_kef_dive_boots: approx('T cast:@movement icd=8 => zone(1.8,physical,5,0.5,0.5)',
    'Atılma, sıçrama, ışınlanma veya hamle yeteneğinden 0.5 sn sonra 5 m çevrede %180 hasarlı bir iniş dalgası patlar (8 sn bekleme).'),
  leg_kef_commander_dagger: approx('T break icd=12 => buff(kef_cmd,8,{damageReductionPct=.10,critChance=.25})',
    'Bir düşmanın Duruşunu kırdığında 8 sn boyunca %10 hasar azaltma ve +%25 kritik şansı kazanırsın (12 sn bekleme).'),
  leg_kef_vessel: approx('T heal icd=8 => abs(.05,6)',
    'İyileştirdiğinde kendine 6 sn boyunca maks. canının %5\'i kadar anima kalkanı verir (8 sn bekleme).'),
  leg_kef_judge_seal: approx('T kick => buff(kef_judge,8,{damagePct=.04,moveSpeedPct=.06},max=3)',
    'Bir düşmanın büyüsünü kestiğinde 8 sn boyunca +%4 hasar ve +%6 hareket hızı kazanırsın (en fazla 3 yığın).'),
  leg_kef_halo_wand: approx('T cast:@channel icd=4 => buff(kef_halo,4,{damagePct=.15})',
    'Kanalize bir büyü başlattığında 4 sn boyunca +%15 hasar kazanırsın (4 sn bekleme).'),
  leg_kef_ferula: full('T hit:@spell ch=.1 icd=6 => zone(0,arcane,4,5,1,.12)'),
  leg_kef_reaper: approx('T hit ch=.12 icd=0.5 => burst(kef_reap,3,3,0,physical)',
    'Vuruşlarının %12\'si hedefe bir Hasat işareti koyar; 3. işarette Kibir Hasadı patlar: hedefte %300 silah hasarı.'),
  leg_kef_pride_mantle: approx('T kill if=elite => buff(kef_pride,20,{damagePct=.10,moveSpeedPct=.05})',
    'Bir elit veya patron öldürdüğünde 20 sn boyunca %10 hasar ve %5 hareket hızı kazanırsın.'),

  // ---------------------------------------------------------------------------- Leş Uyanışı
  leg_les_curukkemik: full('T kill icd=1 => zone(.6,poison,4,6,1)'),
  leg_les_kanemici: engine('periodic-damage tick speed / DoT crit / DoT transfer on death (StatusEffects tick hooks)'),
  leg_les_cukur_kalkan: approx('T block icd=1 => zone(.6,poison,4,6,1)',
    'Engellediğin her vuruş 4 m\'lik bir Çürük Bulutu bırakır (6 sn, saniyede %60 zehir hasarı, en fazla 3 bulut).'),
  leg_les_amarth: full('T crit icd=0.5 => burst(les_amarth,5,1.8,4,shadow)',
    'Kritik vuruşlar hedefe İşkence Yankısı yükü verir; 5. yükte hedefin çevresinde (4 m) %180 gölge hasarı patlar.'),
  leg_les_ruh_hasadi: approx('T kill icd=0.25 => buff(les_soul,20,{shadowDamagePct=.2},max=5)',
    'Bir düşmanı öldürdüğünde 20 sn boyunca +%20 gölge hasarı kazanırsın (en fazla 5 yığın).'),
  leg_les_kanat_omuz: approx('T roll icd=5 => buff(les_wings,3,{moveSpeedPct=.25,damagePct=.3,critChance=.15})',
    'Yuvarlanmadan sonra 3 sn boyunca %25 hareket hızı, +%30 hasar ve +%15 kritik şansı kazanırsın (5 sn bekleme).'),
  leg_les_dikisat: full('T hurt icd=90 if=hp<.4 => abs(.5,6) ; buff(les_stitch,6,{damagePct=.2})'),
  leg_les_onluk: engine('incoming-damage deferral (spread 30 % of each hit over 8 s) + heal-received multiplier'),
  leg_les_mumya_tomu: engine('damage multiplier conditional on the number of distinct DoT kinds on the target + DoT duration extension'),
  leg_les_nalthor: full('T hit:@frost icd=1.5 => burst(les_rime,3,0,0,frost,freeze:1.5)',
    'Buz hasarın hedefe Kırağı Damgası vurur (1.5 sn\'de bir); 3. damgada hedef 1.5 sn donar.'),
  leg_les_ayaz_tac: engine('damage multiplier conditional on the target being frozen / marked (outgoing damage pipeline hook) + frost-mark spread'),
  leg_les_surgun_muhru: full('T lethal icd=180 => heal(.3) ; st(self,invulnerable,2) ; st(foes(12),slow,3,.5)'),

  // ---------------------------------------------------------------------------- Peri Sisleri
  leg_ps_antler_charm: full('T kick => buff(ps_antler,8,{damagePct=.12,moveSpeedPct=.08}) ;; T break => buff(ps_antler,8,{damagePct=.12,moveSpeedPct=.08})',
    'Bir düşmanın Duruşunu kırdığında veya büyüsünü kestiğinde 8 sn boyunca +%12 hasar ve +%8 hareket hızı kazanırsın (yığılmaz, süreyi tazeler).'),
  leg_ps_soul_splitter: approx('T hit:@spell ch=.2 icd=1.5 => dmg(.6,shadow)',
    'Hasar veren büyülerin %20 şansla hedefte %60 silah hasarlı bir Ruh Yankısı (gölge) bırakır (1.5 sn bekleme).'),
  leg_ps_wicker_mantle: approx('T parry icd=1 => buff(ps_wicker,6,{damageReductionPct=.12})',
    'Başarılı bir savuşturma yaptığında 6 sn boyunca aldığın hasar %12 azalır.'),
  leg_ps_mist_ocarina: full('T hurt icd=45 if=hp<.4 => buff(ps_mist,4,{damageReductionPct=.30})'),
  leg_ps_vulpin_treads: approx('T roll icd=1 => buff(ps_vulpin,3,{moveSpeedPct=.2})',
    'Her kaçınma yuvarlanışından sonra 3 sn boyunca %20 hareket hızı kazanırsın.'),
  leg_ps_player_dagger: approx('T hit ch=.25 icd=2 => st(tgt,exposed,6,.10)',
    'Vuruşlarının %25\'i hedefi 6 sn Oyun işaretiyle işaretler: işaretli hedef %10 daha fazla hasar alır (2 sn bekleme).'),
  leg_ps_acid_fang: full('T hit ch=.15 icd=0.8 => st(tgt,asit_yarasi,8) ; burst(ps_acid,5,1.5,4,poison)',
    'Vuruşların %15 şansla hedefe Asit Yarası uygular (+%10 alınan hasar, en çok 5 yığın); 5. yığında 4 m çevrede %150 zehir hasarı patlar.'),
  leg_ps_lakali_tear: full('T tick:25 if=inCombat => healally(.12) ; st(ally,fortify,6,.1)'),
  leg_ps_brood_carapace: approx('S resPoison=.3',
    'Zehir direncin %30 artar.'),

  // ---------------------------------------------------------------------------- Yankı Ağı
  uni_yk_sacbrood: approx('T major icd=120 => buff(yk_sac,18,{poisonDamagePct=.15,attackSpeed=.10})',
    'Büyük bir beceri kullandığında 18 sn boyunca +%15 zehir hasarı ve +%10 saldırı hızı kazanırsın (120 sn bekleme).'),
  uni_yk_maw: approx('T kill icd=0.25 => buff(yk_maw,12,{damagePct=.04},max=5) ; heal(.02)',
    'Her öldürmede 12 sn boyunca +%4 hasar (en fazla 5 yığın) kazanır ve maks. canının %2\'sini iyileştirirsin.'),
  uni_yk_webwrap: approx('T status:slow icd=8 => st(tgt,root,1.2) ; st(tgt,exposed,6,.12)',
    'Bir düşmanı yavaşlattığında onu 1.2 sn köklersin (8 sn bekleme) ve 6 sn boyunca senden %12 fazla hasar alır.'),
  uni_yk_impaler: approx('T hit ch=.12 icd=6 => exp(1.2,4,physical) ; st(tgt,slow,3,.3)',
    'Vuruşların %12 şansla (6 sn iç bekleme) hedefin 4 m çevresinde %120 fiziksel patlama yapar ve hedefi 3 sn %30 yavaşlatır.'),
  uni_yk_echoshield: approx('T block icd=3 => zone(.7,physical,6,1.5,1.5)',
    'Engellediğin vuruş 1.5 sn sonra bulunduğun yerde 6 m\'lik %70 hasarlı bir şok dalgası olarak yankılanır (3 sn iç bekleme).'),
  uni_yk_hiveeye: approx('T crit ch=.3 icd=2 => zone(1.2,poison,5,4,1)',
    'Kritik vuruşların %30 şansla hedefin altında 4 sn süren 5 m\'lik bir sürü bulutu bırakır (saniyede %120 zehir hasarı, 2 sn bekleme).'),
  uni_yk_sickle: approx('T hit:@shadow icd=0.3 => burst(yk_blood,10,1,6,shadow)',
    'Gölge hasarı veren vuruşlar Kara Kan yükü biriktirir; 10 yükte 6 m çevreye %100 silah hasarlı gölge patlaması yapar.'),
  uni_yk_echo: approx('T major icd=90 => zone(6,shadow,6,1.5,1.5)',
    'Büyük bir beceri kullandığında 1.5 sn sonra bulunduğun yerde 6 m çevreye %600 gölge hasarı patlar (90 sn bekleme).'),
  uni_yk_harvestrobe: engine('DoT tick event (heal on each periodic tick, per-kind DoT amplification stacks)'),

  // ---------------------------------------------------------------------------- Yiğitler Sarayı
  leg_yg_borusu: approx('T major icd=90 => buff(yg_horn,20,{damagePct=.08,moveSpeedPct=.05})',
    'Büyük bir beceri kullandığında 20 sn boyunca +%8 hasar ve +%5 hareket hızı kazanırsın (90 sn bekleme).'),
  leg_yg_kapi_kilic: approx('T hit:@finisher ch=.33 icd=1 => exp(1.5,8,physical)',
    'Bitiriş vuruşlarının %33\'ü hedefin 8 m çevresinde %150 silah hasarlı bir Kanlı Süpürme açar (1 sn bekleme).'),
  leg_yg_statik_kusak: approx('T still:1 => buff(yg_static,10,{damagePct=.04},max=5) ;; T roll icd=6 => zone(1.2,lightning,6,0.3,0.3)',
    'Bir saniye hareketsiz kalmak 10 sn boyunca +%4 hasar yükü verir (en fazla 5). Kaçınma yuvarlanması 6 m çevreye %120 yıldırım hasarı verir (6 sn bekleme).'),
  leg_yg_valkyr_pelerin: approx('T hit ch=.06 icd=1 => exp(.7,5,holy) ;; T hurt icd=90 if=hp<.35 => buff(yg_wings,4,{moveSpeedPct=.3}) ; heal(.16)',
    'Vuruşların %6 şansla hedefin 5 m çevresine %70 kutsal hasar saçar. Canın %35\'in altındayken (90 sn\'de bir) kanatlar açılır: %16 can yenilenir ve 4 sn %30 hareket hızı.'),
  leg_yg_isik_asa: engine('line-shaped projectile (Işık Mızrağı) that heals allies it passes + skill-count stacks across a 6 s window'),
  leg_yg_ikiz_muhur: approx('T tick:12 if=inCombat => buff(yg_gok,6,{lightningDamagePct=.2,physicalDamagePct=.2})',
    'Savaştayken her 12 sn\'de bir 6 sn boyunca Gök\'ün gücünü alırsın: +%20 yıldırım ve fiziksel hasar.'),
  leg_yg_kanli_av: approx('T hit:@basic ch=.33 icd=0.5 => dmg(.4,physical)',
    'Hafif vuruşlarının %33\'ü hedefi yaralar: ek %40 silah hasarı (fiziksel).'),
  leg_yg_av_yuzugu: approx('T kill icd=0.25 => buff(yg_hunt,8,{moveSpeedPct=.08,critChance=.04},max=5)',
    'Her öldürme 8 sn boyunca %8 hareket hızı ve %4 kritik şansı verir (en fazla 5 yığın).'),
  leg_yg_surusu_kurk: approx('T roll icd=12 => st(foes(6),slow,3,.3)',
    'Kaçınma yuvarlanman 6 m içindeki düşmanları 3 sn boyunca %30 yavaşlatan bir uluma bırakır (12 sn bekleme).'),
  leg_yg_sinav_mizragi: approx('T parry icd=1 => buff(yg_sinav,8,{damagePct=.2})',
    'Mükemmel bir savuşturma yaptığında 8 sn boyunca +%20 hasar kazanırsın.'),
  leg_yg_yargi_muhru: approx('T major icd=120 => buff(yg_judge,15,{damagePct=.3,moveSpeedPct=.25})',
    'Büyük bir beceri kullandığında 15 sn boyunca Rünle Kutsanırsın: +%30 hasar ve +%25 hareket hızı (120 sn bekleme).'),
  leg_yg_aegis_golgesi: approx('T block icd=8 => st(near(10),fortify,0.8,.75)',
    'Bir saldırıyı engellediğinde 10 m içindeki müttefiklere (kendin dahil) 0.8 sn boyunca %75 hasar azaltma verirsin (8 sn bekleme).'),

  // ---------------------------------------------------------------------------- Yıldız Divanı
  leg_ys_nobet_cani: full('T block icd=4 => st(foes(8),stun,1.5) ; st(near(8),fortify,4,.08)'),
  leg_ys_kilitlenme_zinciri: approx('T roll icd=12 => purge(3) ; buff(ys_chain,3,{damageReductionPct=.15})',
    'Her kaçınma yuvarlanması üzerindeki yavaşlatma ve kökleri temizler ve 3 sn boyunca %15 daha az hasar alırsın (12 sn bekleme).'),
  leg_ys_fener_yuzugu: approx('T kick => st(tgt,exposed,8,.12)',
    'Başarılı bir kesinti hedefi 8 sn boyunca işaretler: hedef %12 daha fazla hasar alır.'),
  leg_ys_alevcelenk: full('T kill icd=3 if=tst:burn => exp(.6,6,fire)',
    'Yanan bir düşman öldüğünde 6 m çevreye %60 ateş hasarı patlaması yayılır (3 sn bekleme).'),
  leg_ys_zumrut_sozlesme: approx('T hit:@dot icd=0.5 => buff(ys_covenant,8,{damagePct=.03},max=5)',
    'Zamanla hasar veren büyülerin 8 sn boyunca Sözleşme yığını verir (yığın başına +%3 hasar, en fazla 5).'),
  leg_ys_yakici_siddet: approx('T hit:@fire icd=0.5 => buff(ys_siddet,12,{damagePct=.04},max=5)',
    'Ateş hasarın 12 sn boyunca Şiddet yığını verir (yığın başına +%4 hasar, en fazla 5).'),
  leg_ys_pinar_keser: approx('T crit icd=0.25 => dmg(.12,arcane) ; buff(ys_pinar,6,{moveSpeedPct=.03},max=5)',
    'Kritik vuruşlar ek %12 arkan hasarı verir ve 6 sn boyunca hareket hızını %3 artıran Pınar yığını bırakır (en fazla 5).'),
  leg_ys_yildiz_haritasi: approx('T tick:45 if=inCombat => buff(ys_star,8,{critChance=.12,moveSpeedPct=.10})',
    'Savaştayken her 45 sn\'de bir 8 sn boyunca +%12 kritik şansı ve +%10 hareket hızı veren Yıldız Hizalanması açılır.'),
  leg_ys_yanki_kusagi: approx('T roll icd=1 => buff(ys_echo,4,{damagePct=.1},max=3)',
    'Her kaçınma yuvarlanması 4 sn boyunca +%10 hasar yansıması bırakır (en fazla 3 yığın).'),

  // ---------------------------------------------------------------------------- Taşkasa
  leg_seda_lens: approx('T crit ch=.12 icd=2 => exp(.7,4,physical)',
    'Kritik vuruşlarının %12\'si hedefin 4 m çevresinde %70 silah hasarlı bir Lens Patlaması yaratır (2 sn bekleme).'),
  leg_seda_aegis: full('T parry icd=2 => zone(1.5,physical,5,0.3,0.3) ;; T parry icd=20 => buff(tk_seda,3,{damageReductionPct=.5})'),
  leg_seda_gauntlets: approx('T crit icd=1 => exp(1.5,6,physical)',
    'Kritik vuruşlar hedefin 6 m çevresinde %150 silah hasarlı patlar (1 sn bekleme).'),
  leg_skarmorak_heart: full('T tick:12 if=inCombat => abs(.06,12) ;; T hurt icd=12 if=shield => buff(tk_heart,4,{damagePct=.15})',
    'Savaştayken her 12 sn\'de bir maks. canının %6\'sı kadar kristal kalkan açılır; kalkan varken hasar aldığında 4 sn boyunca %15 daha fazla hasar verirsin.'),
  leg_skar_fragment_belt: approx('T kill ch=.09 icd=0.5 => buff(tk_frag,15,{damagePct=.08},max=5) ;; T kill if=elite => buff(tk_frag,15,{damagePct=.08},max=5)',
    'Öldürmelerin yaklaşık her 12.\'si ve her elit öldürme Kararsız Parça yığını verir: 15 sn boyunca yığın başına +%8 hasar (en fazla 5).'),
  leg_skar_pauldrons: approx('T hit if=shield icd=0.5 => buff(tk_pauld,2,{damagePct=.08})',
    'Üzerinde kalkan varken vurduğunda 2 sn boyunca +%8 hasar kazanırsın.'),
  leg_dorlita_hammer: approx('T hit:@finisher icd=3 => zone(.3,fire,5,3,1)',
    'Bitiriş vuruşları hedefin altında 3 sn süren 5 m\'lik bir magma izi bırakır (saniyede %30 ateş hasarı, 3 sn bekleme).'),
  leg_brokk_anvil_staff: approx('T hit:@fire ch=.12 icd=1 => dmg(.4,fire) ;; T hit:@fire ch=.2 icd=5 => zone(0,fire,4,3,1,.10)',
    'Ateş büyülerin %12 şansla %40 ek ateş hasarı verir. %20 şansla da hedefin altına 3 sn\'lik bir örs halkası bırakır: içindekiler %10 fazla hasar alır (5 sn bekleme).'),
  leg_crescendo_plate: approx('T hurt icd=0.5 => burst(tk_heat,8,2.5,8,fire)',
    'Aldığın her 8. vuruş etrafında 8 m çevreye %250 ateş hasarı patlatır.'),
  leg_eirich_staff: full('T hit:@shadow ch=.1 icd=1.5 => dmg(.6,shadow) ;; T hit:@arcane ch=.1 icd=1.5 => dmg(.6,arcane)',
    'Gölge ve Arkan büyülerinin %10\'u Boşluk Yankısı bırakır: hedefe ek %60 hasar (1.5 sn bekleme).'),
  leg_eirich_crown: engine('DoT tick-speed multiplier and every-Nth-tick echo nova (StatusEffects tick hooks)'),
  leg_eirich_dagger: approx('T crit icd=12 => zone(0,shadow,5,6,1,.15)',
    'Kritik vuruşlar hedefin altında 6 sn süren 5 m\'lik bir Yarık açar: içindeki düşmanlar %15 fazla hasar alır (12 sn bekleme).'),
};
