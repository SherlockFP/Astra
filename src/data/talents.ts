import type { ClassId } from '../types/common';
import type { StatBlock } from '../types/stats';
import { buildPassiveWeb } from './passiveWeb';

export interface TalentNode {
  id: string;
  name: string;            // Turkish
  // GDD_TALENTS OT9 (T0, append-only): 'mastery' (Ustalık, §3.6) and 'socket' (jewel socket, §3.7) are new kinds
  kind: 'start' | 'small' | 'notable' | 'keystone' | 'mastery' | 'socket';
  x: number;
  y: number;
  links: string[];
  stats?: StatBlock;
  special?: { id: string; desc: string; params?: Record<string, number> };
  /** GDD_TALENTS §3.2 (T0): effect DSL string of the node (§2.5); optional, legacy nodes keep `stats` / `special`. */
  fx?: string;
  /** GDD_TALENTS §3.2 (T0): choice nodes (masteries pick one of three) with their own effect DSL strings. */
  choices?: { name: string; desc: string; fx: string }[];
  classStart?: ClassId;
  icon?: string;
  desc?: string;
}

/**
 * OWNER: items/progression module. Path of Exile style shared passive tree ("Pasif Ağaç", GDD_SYSTEMS section 3).
 * RAW_BASE: the 125 base nodes (4 class starts, 92 small, 21 notable (incl. Kadim Cekirdek), 8 keystones). TALENT_LIST is the
 * 306-node web built from them by buildPassiveWeb (GDD_TALENTS §3.3); base nodes keep their content, their links grow. Coordinates: origin = centre, x right, y DOWN, radius ~ 1000.
 * Generated from the GDD table; links are bidirectional. A class start node carries its FOREIGN bonus in `stats`
 * (applied only when ANOTHER class allocates it; the own start is free and grants nothing).
 * Specials with moreDamage/moreHp/... params are folded by StatCalc (CharacterState.specials).
 */
export const RAW_BASE: TalentNode[] = [
  {"id":"core","name":"Kadim Çekirdek","kind":"notable","x":0,"y":0,"links":["mg_hub","rg_hub","bb_hub","kn_hub"],"stats":{"allAttr":10,"damagePct":0.05,"maxHpPct":0.05},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Tüm Özellikler; +%5 hasar; +%5 maks. can"},
  {"id":"mg_start","name":"Büyücü Başlangıcı","kind":"start","x":297,"y":-297,"links":["mg_p1","mg_a1","mg_m1","mg_b1"],"stats":{"int":10},"classStart":"mage","icon":"/assets/icons/stat-intelligence.svg","desc":"Büyücü için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Zeka"},
  {"id":"mg_p1","name":"Zeka","kind":"small","x":212,"y":-212,"links":["mg_start","mg_p2"],"stats":{"int":10},"icon":"/assets/icons/stat-intelligence.svg","desc":"+10 Zeka"},
  {"id":"mg_p2","name":"Dayanıklılık","kind":"small","x":134,"y":-134,"links":["mg_p1","mg_hub"],"stats":{"vit":10},"icon":"/assets/icons/stat-vitality.svg","desc":"+10 Dayanıklılık"},
  {"id":"mg_hub","name":"Tüm Özellikler","kind":"small","x":64,"y":-64,"links":["mg_p2","core","rg_hub","kn_hub"],"stats":{"allAttr":5},"icon":"/assets/icons/stat-strength.svg","desc":"+5 Tüm Özellikler"},
  {"id":"mg_a1","name":"Ateş hasarı","kind":"small","x":178,"y":-489,"links":["mg_start","mg_a2"],"stats":{"fireDamagePct":0.08},"icon":"/assets/icons/stat-fire-resist.svg","desc":"+%8 ateş hasarı"},
  {"id":"mg_a2","name":"Büyü hızı","kind":"small","x":205,"y":-564,"links":["mg_a1","n_pyromancer","br_n6"],"stats":{"castSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 büyü hızı"},
  {"id":"n_pyromancer","name":"Ateş Ustası","kind":"notable","x":236,"y":-648,"links":["mg_a2","mg_a3"],"stats":{"fireDamagePct":0.3},"special":{"id":"n_pyromancer","desc":"+%30 ateş hasarı; Yanma süresi +%50; yanan düşmanlara +%10 kritik hasarı","params":{"burnDurationPct":0.5,"critDamageVsBurning":0.1}},"icon":"/assets/icons/stat-fire-resist.svg","desc":"+%30 ateş hasarı; Yanma süresi +%50; yanan düşmanlara +%10 kritik hasarı"},
  {"id":"mg_a3","name":"Zamanla hasar","kind":"small","x":267,"y":-733,"links":["n_pyromancer","mg_a4","mg_c1"],"stats":{"dotPct":0.1},"icon":"/assets/icons/stat-damage.svg","desc":"+%10 zamanla hasar"},
  {"id":"mg_a4","name":"Ateş hasarı","kind":"small","x":294,"y":-808,"links":["mg_a3","ks_glass_cannon"],"stats":{"fireDamagePct":0.08},"icon":"/assets/icons/stat-fire-resist.svg","desc":"+%8 ateş hasarı"},
  {"id":"ks_glass_cannon","name":"Cam Top","kind":"keystone","x":325,"y":-893,"links":["mg_a4"],"special":{"id":"ks_glass_cannon","desc":"%35 DAHA FAZLA hasar. Maks. can %30 DAHA AZ.","params":{"moreDamage":1.35,"moreHp":0.7}},"icon":"/assets/icons/stat-damage.svg","desc":"%35 DAHA FAZLA hasar. Maks. can %30 DAHA AZ."},
  {"id":"mg_m1","name":"Maks. kaynak","kind":"small","x":368,"y":-368,"links":["mg_start","mg_m2"],"stats":{"maxResource":5},"icon":"/assets/icons/stat-mana.svg","desc":"+5 maks. kaynak"},
  {"id":"mg_m2","name":"Kaynak yenilenmesi","kind":"small","x":424,"y":-424,"links":["mg_m1","n_arcane_flow"],"stats":{"resourceRegenPct":0.1},"icon":"/assets/icons/stat-mana.svg","desc":"+%10 kaynak yenilenmesi"},
  {"id":"n_arcane_flow","name":"Gizem Akışı","kind":"notable","x":488,"y":-488,"links":["mg_m2","mg_m3"],"stats":{"resourceRegenPct":0.3,"maxResource":15,"costReductionPct":0.08},"icon":"/assets/icons/stat-mana.svg","desc":"+%30 kaynak yenilenmesi; +15 maks. mana; büyü maliyetleri −%8"},
  {"id":"mg_m3","name":"Gizem hasarı","kind":"small","x":552,"y":-552,"links":["n_arcane_flow","mg_m4","mg_c1","mg_c2"],"stats":{"arcaneDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 gizem hasarı"},
  {"id":"mg_m4","name":"Bekleme süresi azaltma","kind":"small","x":608,"y":-608,"links":["mg_m3","ks_mind_shield"],"stats":{"cdr":0.03},"icon":"/assets/icons/stat-cooldown.svg","desc":"+%3 bekleme süresi azaltma"},
  {"id":"ks_mind_shield","name":"Zihin Kalkanı","kind":"keystone","x":672,"y":-672,"links":["mg_m4"],"stats":{"resourceRegenPct":0.2},"special":{"id":"ks_mind_shield","desc":"Alınan hasarın %30'u önce manadan düşülür (4 hasar = 1 mana). Mana 0 iken etkisiz. +%20 kaynak yenilenmesi.","params":{"damageToManaPct":0.3,"damagePerMana":4}},"icon":"/assets/icons/stat-mana.svg","desc":"Alınan hasarın %30'u önce manadan düşülür (4 hasar = 1 mana). Mana 0 iken etkisiz. +%20 kaynak yenilenmesi."},
  {"id":"mg_b1","name":"Buz hasarı","kind":"small","x":489,"y":-178,"links":["mg_start","mg_b2"],"stats":{"frostDamagePct":0.08},"icon":"/assets/icons/stat-cold-resist.svg","desc":"+%8 buz hasarı"},
  {"id":"mg_b2","name":"Kontrol etkisi süresi","kind":"small","x":564,"y":-205,"links":["mg_b1","n_cryomancer","br_e1"],"stats":{"ccDurationPct":0.1},"icon":"/assets/icons/stat-damage.svg","desc":"+%10 kontrol etkisi süresi"},
  {"id":"n_cryomancer","name":"Buz Ustası","kind":"notable","x":648,"y":-236,"links":["mg_b2","mg_b3"],"stats":{"frostDamagePct":0.25,"chilledDamagePct":0.15},"special":{"id":"n_cryomancer","desc":"+%25 buz hasarı; Donma süresi +%30; donmuş/üşümüş düşmanlara +%15 hasar","params":{"freezeDurationPct":0.3}},"icon":"/assets/icons/stat-cold-resist.svg","desc":"+%25 buz hasarı; Donma süresi +%30; donmuş/üşümüş düşmanlara +%15 hasar"},
  {"id":"mg_b3","name":"Buz hasarı","kind":"small","x":733,"y":-267,"links":["n_cryomancer","mg_b4","mg_c2"],"stats":{"frostDamagePct":0.08},"icon":"/assets/icons/stat-cold-resist.svg","desc":"+%8 buz hasarı"},
  {"id":"mg_b4","name":"Büyü hızı","kind":"small","x":808,"y":-294,"links":["mg_b3","n_spell_echo"],"stats":{"castSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 büyü hızı"},
  {"id":"n_spell_echo","name":"Büyü Yankısı","kind":"notable","x":893,"y":-325,"links":["mg_b4"],"special":{"id":"n_spell_echo","desc":"Mermi büyülerin %12 şansla bedavaya ikinci kez atılır (Yankı, %70 hasar)","params":{"echoChance":0.12,"echoDamageMult":0.7}},"icon":"/assets/icons/stat-damage.svg","desc":"Mermi büyülerin %12 şansla bedavaya ikinci kez atılır (Yankı, %70 hasar)"},
  {"id":"mg_c1","name":"Kritik şansı","kind":"small","x":419,"y":-658,"links":["mg_a3","mg_m3"],"stats":{"critChance":0.01},"icon":"/assets/icons/stat-crit.svg","desc":"+%1 kritik şansı"},
  {"id":"mg_c2","name":"Maks. can","kind":"small","x":658,"y":-419,"links":["mg_m3","mg_b3"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"rg_start","name":"Haydut Başlangıcı","kind":"start","x":297,"y":297,"links":["rg_p1","rg_a1","rg_m1","rg_b1"],"stats":{"dex":10},"classStart":"rogue","icon":"/assets/icons/stat-dexterity.svg","desc":"Haydut için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Çeviklik"},
  {"id":"rg_p1","name":"Çeviklik","kind":"small","x":212,"y":212,"links":["rg_start","rg_p2"],"stats":{"dex":10},"icon":"/assets/icons/stat-dexterity.svg","desc":"+10 Çeviklik"},
  {"id":"rg_p2","name":"Dayanıklılık","kind":"small","x":134,"y":134,"links":["rg_p1","rg_hub"],"stats":{"vit":10},"icon":"/assets/icons/stat-vitality.svg","desc":"+10 Dayanıklılık"},
  {"id":"rg_hub","name":"Tüm Özellikler","kind":"small","x":64,"y":64,"links":["rg_p2","core","mg_hub","bb_hub"],"stats":{"allAttr":5},"icon":"/assets/icons/stat-strength.svg","desc":"+5 Tüm Özellikler"},
  {"id":"rg_a1","name":"Kaçınma","kind":"small","x":489,"y":178,"links":["rg_start","rg_a2"],"stats":{"dodgeChance":0.02},"icon":"/assets/icons/stat-dodge.svg","desc":"+%2 kaçınma"},
  {"id":"rg_a2","name":"Hareket hızı","kind":"small","x":564,"y":205,"links":["rg_a1","n_like_a_shadow","br_e6"],"stats":{"moveSpeedPct":0.03},"icon":"/assets/icons/stat-move-speed.svg","desc":"+%3 hareket hızı"},
  {"id":"n_like_a_shadow","name":"Gölge Gibi","kind":"notable","x":648,"y":236,"links":["rg_a2","rg_a3"],"stats":{"dodgeChance":0.08,"moveSpeedPct":0.1},"special":{"id":"n_like_a_shadow","desc":"+%8 kaçınma; +%10 hareket hızı; kaçınılan her saldırı +10 Enerji","params":{"energyOnDodge":10}},"icon":"/assets/icons/stat-dodge.svg","desc":"+%8 kaçınma; +%10 hareket hızı; kaçınılan her saldırı +10 Enerji"},
  {"id":"rg_a3","name":"Kritik şansı","kind":"small","x":733,"y":267,"links":["n_like_a_shadow","rg_a4","rg_c1"],"stats":{"critChance":0.01},"icon":"/assets/icons/stat-crit.svg","desc":"+%1 kritik şansı"},
  {"id":"rg_a4","name":"Kaçınma","kind":"small","x":808,"y":294,"links":["rg_a3","ks_shadow_dance"],"stats":{"dodgeChance":0.02},"icon":"/assets/icons/stat-dodge.svg","desc":"+%2 kaçınma"},
  {"id":"ks_shadow_dance","name":"Gölge Dansı","kind":"keystone","x":893,"y":325,"links":["rg_a4"],"special":{"id":"ks_shadow_dance","desc":"Kaçış Yuvarlanması +1 şarj ve %30 daha hızlı dolar. Yuvarlanmadan sonraki 1.5 sn içindeki ilk vuruş kesin kritik. Maks. can %15 DAHA AZ.","params":{"dodgeRollCharges":1,"dodgeRollRechargePct":-0.3,"guaranteedCritWindow":1.5,"moreHp":0.85}},"icon":"/assets/icons/stat-damage.svg","desc":"Kaçış Yuvarlanması +1 şarj ve %30 daha hızlı dolar. Yuvarlanmadan sonraki 1.5 sn içindeki ilk vuruş kesin kritik. Maks. can %15 DAHA AZ."},
  {"id":"rg_m1","name":"Kritik şansı","kind":"small","x":368,"y":368,"links":["rg_start","rg_m2"],"stats":{"critChance":0.01},"icon":"/assets/icons/stat-crit.svg","desc":"+%1 kritik şansı"},
  {"id":"rg_m2","name":"Kritik hasarı","kind":"small","x":424,"y":424,"links":["rg_m1","n_assassin"],"stats":{"critDamage":0.12},"icon":"/assets/icons/stat-crit.svg","desc":"+%12 kritik hasarı"},
  {"id":"n_assassin","name":"Suikastçı","kind":"notable","x":488,"y":488,"links":["rg_m2","rg_m3"],"stats":{"critChance":0.05,"critDamage":0.4},"special":{"id":"n_assassin","desc":"+%5 kritik şansı; +%40 kritik hasarı; arkadan vuruşlarda +%10 kritik şansı","params":{"backstabCritChance":0.1}},"icon":"/assets/icons/stat-crit.svg","desc":"+%5 kritik şansı; +%40 kritik hasarı; arkadan vuruşlarda +%10 kritik şansı"},
  {"id":"rg_m3","name":"Yakın dövüş hasarı","kind":"small","x":552,"y":552,"links":["n_assassin","rg_m4","rg_c1","rg_c2"],"stats":{"meleeDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 yakın dövüş hasarı"},
  {"id":"rg_m4","name":"Kritik hasarı","kind":"small","x":608,"y":608,"links":["rg_m3","ks_perfect_agony"],"stats":{"critDamage":0.12},"icon":"/assets/icons/stat-crit.svg","desc":"+%12 kritik hasarı"},
  {"id":"ks_perfect_agony","name":"Kusursuz İşkence","kind":"keystone","x":672,"y":672,"links":["rg_m4"],"special":{"id":"ks_perfect_agony","desc":"Kanama ve Zehir uygulanırken kritik atabilir ve kritik çarpanını kullanır. Doğrudan vuruşların kritik çarpanı %30 azalır.","params":{"dotCanCrit":1,"hitCritMultScale":0.7}},"icon":"/assets/icons/stat-damage.svg","desc":"Kanama ve Zehir uygulanırken kritik atabilir ve kritik çarpanını kullanır. Doğrudan vuruşların kritik çarpanı %30 azalır."},
  {"id":"rg_b1","name":"Zehir hasarı","kind":"small","x":178,"y":489,"links":["rg_start","rg_b2"],"stats":{"poisonDamagePct":0.08},"icon":"/assets/icons/stat-poison-resist.svg","desc":"+%8 zehir hasarı"},
  {"id":"rg_b2","name":"Mermi hasarı","kind":"small","x":205,"y":564,"links":["rg_b1","n_marksman","br_s1"],"stats":{"projectileDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 mermi hasarı"},
  {"id":"n_marksman","name":"Keskin Nişancı","kind":"notable","x":236,"y":648,"links":["rg_b2","rg_b3"],"stats":{"projectileDamagePct":0.25,"pierce":1,"projectileSpeedPct":0.2},"icon":"/assets/icons/stat-damage.svg","desc":"+%25 mermi hasarı; +1 delme; +%20 mermi hızı"},
  {"id":"rg_b3","name":"Zamanla hasar","kind":"small","x":267,"y":733,"links":["n_marksman","rg_b4","rg_c2"],"stats":{"dotPct":0.1},"icon":"/assets/icons/stat-damage.svg","desc":"+%10 zamanla hasar"},
  {"id":"rg_b4","name":"Zehir hasarı","kind":"small","x":294,"y":808,"links":["rg_b3","n_toxicologist"],"stats":{"poisonDamagePct":0.08},"icon":"/assets/icons/stat-poison-resist.svg","desc":"+%8 zehir hasarı"},
  {"id":"n_toxicologist","name":"Zehir Ustası","kind":"notable","x":325,"y":893,"links":["rg_b4"],"stats":{"poisonDamagePct":0.4},"special":{"id":"n_toxicologist","desc":"+%40 zehir hasarı; maks. Zehir yığını +5; Zehir süresi +%25","params":{"poisonMaxStacks":5,"poisonDurationPct":0.25}},"icon":"/assets/icons/stat-poison-resist.svg","desc":"+%40 zehir hasarı; maks. Zehir yığını +5; Zehir süresi +%25"},
  {"id":"rg_c1","name":"Saldırı hızı","kind":"small","x":658,"y":419,"links":["rg_a3","rg_m3"],"stats":{"attackSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 saldırı hızı"},
  {"id":"rg_c2","name":"Maks. can","kind":"small","x":419,"y":658,"links":["rg_m3","rg_b3"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"bb_start","name":"Barbar Başlangıcı","kind":"start","x":-297,"y":297,"links":["bb_p1","bb_a1","bb_m1","bb_b1"],"stats":{"str":10},"classStart":"barbarian","icon":"/assets/icons/stat-strength.svg","desc":"Barbar için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Güç"},
  {"id":"bb_p1","name":"Güç","kind":"small","x":-212,"y":212,"links":["bb_start","bb_p2"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"bb_p2","name":"Dayanıklılık","kind":"small","x":-134,"y":134,"links":["bb_p1","bb_hub"],"stats":{"vit":10},"icon":"/assets/icons/stat-vitality.svg","desc":"+10 Dayanıklılık"},
  {"id":"bb_hub","name":"Tüm Özellikler","kind":"small","x":-64,"y":64,"links":["bb_p2","core","rg_hub","kn_hub"],"stats":{"allAttr":5},"icon":"/assets/icons/stat-strength.svg","desc":"+5 Tüm Özellikler"},
  {"id":"bb_a1","name":"Fiziksel hasar","kind":"small","x":-178,"y":489,"links":["bb_start","bb_a2"],"stats":{"physicalDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 fiziksel hasar"},
  {"id":"bb_a2","name":"Kanama şansı","kind":"small","x":-205,"y":564,"links":["bb_a1","n_bloodletter","br_s6"],"stats":{"bleedChance":0.05},"icon":"/assets/icons/stat-damage.svg","desc":"+%5 kanama şansı"},
  {"id":"n_bloodletter","name":"Kan Döken","kind":"notable","x":-236,"y":648,"links":["bb_a2","bb_a3"],"stats":{"bleedDamagePct":0.4,"bleedChance":0.15},"icon":"/assets/icons/stat-damage.svg","desc":"+%40 kanama hasarı; +%15 kanama şansı"},
  {"id":"bb_a3","name":"Zamanla hasar","kind":"small","x":-267,"y":733,"links":["n_bloodletter","bb_a4","bb_c1"],"stats":{"dotPct":0.1},"icon":"/assets/icons/stat-damage.svg","desc":"+%10 zamanla hasar"},
  {"id":"bb_a4","name":"Can çalma","kind":"small","x":-294,"y":808,"links":["bb_a3","ks_blood_sacrifice"],"stats":{"lifeSteal":0.004},"icon":"/assets/icons/stat-life.svg","desc":"+%0.4 can çalma"},
  {"id":"ks_blood_sacrifice","name":"Kan Kurban","kind":"keystone","x":-325,"y":893,"links":["bb_a4"],"special":{"id":"ks_blood_sacrifice","desc":"Can çalma ×2; can çalma üst sınırı saniyede maks. canın %20'si. Doğal can yenilenmesi yok (savaş dışı dahil). İksirler %50 daha az iyileştirir.","params":{"lifeStealMult":2,"lifeStealCapPct":0.2,"noHpRegen":1,"potionMult":0.5}},"icon":"/assets/icons/stat-damage.svg","desc":"Can çalma ×2; can çalma üst sınırı saniyede maks. canın %20'si. Doğal can yenilenmesi yok (savaş dışı dahil). İksirler %50 daha az iyileştirir."},
  {"id":"bb_m1","name":"Kaynak üretimi","kind":"small","x":-368,"y":368,"links":["bb_start","bb_m2"],"stats":{"resourceGainPct":0.1},"icon":"/assets/icons/stat-mana.svg","desc":"+%10 kaynak üretimi"},
  {"id":"bb_m2","name":"Saldırı hızı","kind":"small","x":-424,"y":424,"links":["bb_m1","n_rage_engine"],"stats":{"attackSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 saldırı hızı"},
  {"id":"n_rage_engine","name":"Öfke Makinesi","kind":"notable","x":-488,"y":488,"links":["bb_m2","bb_m3"],"stats":{"resourceGainPct":0.25,"maxResource":10},"special":{"id":"n_rage_engine","desc":"+%25 kaynak üretimi; Öfke kazandıktan sonra 8 sn boyunca Öfke azalmaz; +10 maks. Öfke","params":{"rageDecayDelay":8}},"icon":"/assets/icons/stat-mana.svg","desc":"+%25 kaynak üretimi; Öfke kazandıktan sonra 8 sn boyunca Öfke azalmaz; +10 maks. Öfke"},
  {"id":"bb_m3","name":"Yakın dövüş hasarı","kind":"small","x":-552,"y":552,"links":["n_rage_engine","bb_m4","bb_c1","bb_c2"],"stats":{"meleeDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 yakın dövüş hasarı"},
  {"id":"bb_m4","name":"Saldırı hızı","kind":"small","x":-608,"y":608,"links":["bb_m3","ks_berserker_soul"],"stats":{"attackSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 saldırı hızı"},
  {"id":"ks_berserker_soul","name":"Çılgın Ruh","kind":"keystone","x":-672,"y":672,"links":["bb_m4"],"stats":{"healReceivedPct":-0.3},"special":{"id":"ks_berserker_soul","desc":"Eksik canın her %1'i için %1 DAHA FAZLA hasar (en fazla %60). Alınan iyileştirme −%30.","params":{"moreDamagePerMissingHpPct":1,"maxMoreDamage":0.6}},"icon":"/assets/icons/stat-damage.svg","desc":"Eksik canın her %1'i için %1 DAHA FAZLA hasar (en fazla %60). Alınan iyileştirme −%30."},
  {"id":"bb_b1","name":"Maks. can","kind":"small","x":-489,"y":178,"links":["bb_start","bb_b2"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"bb_b2","name":"Sarsma","kind":"small","x":-564,"y":205,"links":["bb_b1","n_thick_skin","br_w1"],"stats":{"staggerPct":0.1},"icon":"/assets/icons/stat-damage.svg","desc":"+%10 sarsma"},
  {"id":"n_thick_skin","name":"Kalın Deri","kind":"notable","x":-648,"y":236,"links":["bb_b2","bb_b3"],"stats":{"maxHpPct":0.2,"hpRegenPct":0.01,"healReceivedPct":0.1},"icon":"/assets/icons/stat-life.svg","desc":"+%20 maks. can; saniyede maks. canın %1'i kadar yenilenme; +%10 alınan iyileştirme"},
  {"id":"bb_b3","name":"Alan genişliği","kind":"small","x":-733,"y":267,"links":["n_thick_skin","bb_b4","bb_c2"],"stats":{"aoeRadiusPct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 alan genişliği"},
  {"id":"bb_b4","name":"Maks. can","kind":"small","x":-808,"y":294,"links":["bb_b3","n_executioner"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"n_executioner","name":"Cellat","kind":"notable","x":-893,"y":325,"links":["bb_b4"],"stats":{"executeDamagePct":0.4,"hpOnKillPct":0.02},"icon":"/assets/icons/stat-damage.svg","desc":"Canı %35'in altındaki düşmanlara +%40 hasar; öldürme başına maks. canın %2'si"},
  {"id":"bb_c1","name":"Can çalma","kind":"small","x":-419,"y":658,"links":["bb_a3","bb_m3"],"stats":{"lifeSteal":0.004},"icon":"/assets/icons/stat-life.svg","desc":"+%0.4 can çalma"},
  {"id":"bb_c2","name":"Güç","kind":"small","x":-658,"y":419,"links":["bb_m3","bb_b3"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"kn_start","name":"Şövalye Başlangıcı","kind":"start","x":-297,"y":-297,"links":["kn_p1","kn_a1","kn_m1","kn_b1"],"stats":{"str":10},"classStart":"knight","icon":"/assets/icons/stat-strength.svg","desc":"Şövalye için ücretsiz ve otomatik. Başka sınıf 1 puanla alabilir: +10 Güç"},
  {"id":"kn_p1","name":"Güç","kind":"small","x":-212,"y":-212,"links":["kn_start","kn_p2"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"kn_p2","name":"Dayanıklılık","kind":"small","x":-134,"y":-134,"links":["kn_p1","kn_hub"],"stats":{"vit":10},"icon":"/assets/icons/stat-vitality.svg","desc":"+10 Dayanıklılık"},
  {"id":"kn_hub","name":"Tüm Özellikler","kind":"small","x":-64,"y":-64,"links":["kn_p2","core","bb_hub","mg_hub"],"stats":{"allAttr":5},"icon":"/assets/icons/stat-strength.svg","desc":"+5 Tüm Özellikler"},
  {"id":"kn_a1","name":"Yakın dövüş hasarı","kind":"small","x":-489,"y":-178,"links":["kn_start","kn_a2"],"stats":{"meleeDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 yakın dövüş hasarı"},
  {"id":"kn_a2","name":"Saldırı hızı","kind":"small","x":-564,"y":-205,"links":["kn_a1","n_oath_blade","br_w6"],"stats":{"attackSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 saldırı hızı"},
  {"id":"n_oath_blade","name":"Kılıç Yemini","kind":"notable","x":-648,"y":-236,"links":["kn_a2","kn_a3"],"stats":{"meleeDamagePct":0.2,"critChance":0.04},"special":{"id":"n_oath_blade","desc":"+%20 yakın dövüş hasarı; kılıçla +%10 saldırı hızı; +%4 kritik şansı","params":{"attackSpeedWithSword1h":0.1}},"icon":"/assets/icons/stat-crit.svg","desc":"+%20 yakın dövüş hasarı; kılıçla +%10 saldırı hızı; +%4 kritik şansı"},
  {"id":"kn_a3","name":"Kritik şansı","kind":"small","x":-733,"y":-267,"links":["n_oath_blade","kn_a4","kn_c1"],"stats":{"critChance":0.01},"icon":"/assets/icons/stat-crit.svg","desc":"+%1 kritik şansı"},
  {"id":"kn_a4","name":"Yakın dövüş hasarı","kind":"small","x":-808,"y":-294,"links":["kn_a3","ks_steady_hand"],"stats":{"meleeDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 yakın dövüş hasarı"},
  {"id":"ks_steady_hand","name":"Sabit El","kind":"keystone","x":-893,"y":-325,"links":["kn_a4"],"stats":{"staggerPct":0.5},"special":{"id":"ks_steady_hand","desc":"Kritik vuruş yapamazsın. %30 DAHA FAZLA hasar. +%50 sarsma.","params":{"noCrit":1,"moreDamage":1.3}},"icon":"/assets/icons/stat-damage.svg","desc":"Kritik vuruş yapamazsın. %30 DAHA FAZLA hasar. +%50 sarsma."},
  {"id":"kn_m1","name":"Zırh","kind":"small","x":-368,"y":-368,"links":["kn_start","kn_m2"],"stats":{"armorPct":0.12},"icon":"/assets/icons/stat-armor.svg","desc":"+%12 zırh"},
  {"id":"kn_m2","name":"Blok şansı","kind":"small","x":-424,"y":-424,"links":["kn_m1","n_bulwark"],"stats":{"blockChance":0.02},"icon":"/assets/icons/stat-block.svg","desc":"+%2 blok şansı"},
  {"id":"n_bulwark","name":"Siper","kind":"notable","x":-488,"y":-488,"links":["kn_m2","kn_m3"],"stats":{"armorPct":0.25,"blockChance":0.08,"blockAmount":0.1},"icon":"/assets/icons/stat-armor.svg","desc":"+%25 zırh; +%8 blok şansı; blok edilen vuruşlardan ek %10 azaltma"},
  {"id":"kn_m3","name":"Maks. can","kind":"small","x":-552,"y":-552,"links":["n_bulwark","kn_m4","kn_c1","kn_c2"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"kn_m4","name":"Zırh","kind":"small","x":-608,"y":-608,"links":["kn_m3","ks_iron_fortress"],"stats":{"armorPct":0.12},"icon":"/assets/icons/stat-armor.svg","desc":"+%12 zırh"},
  {"id":"ks_iron_fortress","name":"Demir Kale","kind":"keystone","x":-672,"y":-672,"links":["kn_m4"],"stats":{"moveSpeedPct":-0.1},"special":{"id":"ks_iron_fortress","desc":"Blok şansın ×2, blok üst sınırı %75. Kaçınma şansın 0 olur. Her blok maks. canın %2'sini iyileştirir (0.5 sn ICD). −%10 hareket hızı.","params":{"blockChanceMult":2,"blockCap":0.75,"dodgeZero":1,"healOnBlockPct":0.02,"healOnBlockIcd":0.5}},"icon":"/assets/icons/stat-move-speed.svg","desc":"Blok şansın ×2, blok üst sınırı %75. Kaçınma şansın 0 olur. Her blok maks. canın %2'sini iyileştirir (0.5 sn ICD). −%10 hareket hızı."},
  {"id":"kn_b1","name":"Kutsal hasar","kind":"small","x":-178,"y":-489,"links":["kn_start","kn_b2"],"stats":{"holyDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 kutsal hasar"},
  {"id":"kn_b2","name":"Kaynak yenilenmesi","kind":"small","x":-205,"y":-564,"links":["kn_b1","n_unshaken_will","br_n1"],"stats":{"resourceRegenPct":0.1},"icon":"/assets/icons/stat-mana.svg","desc":"+%10 kaynak yenilenmesi"},
  {"id":"n_unshaken_will","name":"Sarsılmaz İrade","kind":"notable","x":-236,"y":-648,"links":["kn_b2","kn_b3"],"stats":{"resourceRegenPct":0.25,"ccReductionPct":0.3,"maxResource":10},"icon":"/assets/icons/stat-mana.svg","desc":"+%25 kaynak yenilenmesi; üzerindeki kontrol etkileri −%30 süre; +10 maks. Kararlılık"},
  {"id":"kn_b3","name":"Alan genişliği","kind":"small","x":-267,"y":-733,"links":["n_unshaken_will","kn_b4","kn_c2"],"stats":{"aoeRadiusPct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 alan genişliği"},
  {"id":"kn_b4","name":"Kutsal hasar","kind":"small","x":-294,"y":-808,"links":["kn_b3","n_holy_light"],"stats":{"holyDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 kutsal hasar"},
  {"id":"n_holy_light","name":"Kutsal Işık","kind":"notable","x":-325,"y":-893,"links":["kn_b4"],"stats":{"holyDamagePct":0.25},"special":{"id":"n_holy_light","desc":"+%25 kutsal hasar; Kutsal Toprak yarıçapı +%20 ve içindeki müttefikler +%10 hasar verir","params":{"consecrationRadiusPct":0.2,"consecrationAllyDamagePct":0.1}},"icon":"/assets/icons/stat-damage.svg","desc":"+%25 kutsal hasar; Kutsal Toprak yarıçapı +%20 ve içindeki müttefikler +%10 hasar verir"},
  {"id":"kn_c1","name":"Güç","kind":"small","x":-658,"y":-419,"links":["kn_a3","kn_m3"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"kn_c2","name":"Tüm dirençler","kind":"small","x":-419,"y":-658,"links":["kn_m3","kn_b3"],"stats":{"resAll":0.05},"icon":"/assets/icons/stat-cold-resist.svg","desc":"+%5 tüm dirençler"},
  {"id":"br_e1","name":"Zeka","kind":"small","x":618,"y":-166,"links":["mg_b2","br_e2"],"stats":{"int":10},"icon":"/assets/icons/stat-intelligence.svg","desc":"+10 Zeka"},
  {"id":"br_e2","name":"Büyü hızı","kind":"small","x":630,"y":-111,"links":["br_e1","br_e3"],"stats":{"castSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 büyü hızı"},
  {"id":"br_e3","name":"Mermi hasarı","kind":"small","x":638,"y":-56,"links":["br_e2","n_arcane_trickster"],"stats":{"projectileDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 mermi hasarı"},
  {"id":"n_arcane_trickster","name":"Gizemli Hilekâr","kind":"notable","x":640,"y":0,"links":["br_e3","br_e4"],"stats":{"attackSpeed":0.1,"castSpeed":0.1,"projectileSpeedPct":0.15,"pierce":1},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%10 saldırı ve büyü hızı; +%15 mermi hızı; mermiler +1 delme"},
  {"id":"br_e4","name":"Kritik hasarı","kind":"small","x":638,"y":56,"links":["n_arcane_trickster","br_e5"],"stats":{"critDamage":0.12},"icon":"/assets/icons/stat-crit.svg","desc":"+%12 kritik hasarı"},
  {"id":"br_e5","name":"Saldırı hızı","kind":"small","x":630,"y":111,"links":["br_e4","br_e6"],"stats":{"attackSpeed":0.04},"icon":"/assets/icons/stat-attack-speed.svg","desc":"+%4 saldırı hızı"},
  {"id":"br_e6","name":"Çeviklik","kind":"small","x":618,"y":166,"links":["br_e5","rg_a2"],"stats":{"dex":10},"icon":"/assets/icons/stat-dexterity.svg","desc":"+10 Çeviklik"},
  {"id":"br_s1","name":"Çeviklik","kind":"small","x":166,"y":618,"links":["rg_b2","br_s2"],"stats":{"dex":10},"icon":"/assets/icons/stat-dexterity.svg","desc":"+10 Çeviklik"},
  {"id":"br_s2","name":"Zehir hasarı","kind":"small","x":111,"y":630,"links":["br_s1","br_s3"],"stats":{"poisonDamagePct":0.08},"icon":"/assets/icons/stat-poison-resist.svg","desc":"+%8 zehir hasarı"},
  {"id":"br_s3","name":"Hareket hızı","kind":"small","x":56,"y":638,"links":["br_s2","n_hunter_instinct"],"stats":{"moveSpeedPct":0.03},"icon":"/assets/icons/stat-move-speed.svg","desc":"+%3 hareket hızı"},
  {"id":"n_hunter_instinct","name":"Avcı İçgüdüsü","kind":"notable","x":0,"y":640,"links":["br_s3","br_s4"],"stats":{"ailingDamagePct":0.2,"moveSpeedPct":0.05},"icon":"/assets/icons/stat-move-speed.svg","desc":"Kanayan veya zehirlenmiş düşmanlara +%20 hasar; +%5 hareket hızı"},
  {"id":"br_s4","name":"Kanama şansı","kind":"small","x":-56,"y":638,"links":["n_hunter_instinct","br_s5"],"stats":{"bleedChance":0.05},"icon":"/assets/icons/stat-damage.svg","desc":"+%5 kanama şansı"},
  {"id":"br_s5","name":"Fiziksel hasar","kind":"small","x":-111,"y":630,"links":["br_s4","br_s6"],"stats":{"physicalDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 fiziksel hasar"},
  {"id":"br_s6","name":"Güç","kind":"small","x":-166,"y":618,"links":["br_s5","bb_a2"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"br_w1","name":"Dayanıklılık","kind":"small","x":-618,"y":166,"links":["bb_b2","br_w2"],"stats":{"vit":10},"icon":"/assets/icons/stat-vitality.svg","desc":"+10 Dayanıklılık"},
  {"id":"br_w2","name":"Sarsma","kind":"small","x":-630,"y":111,"links":["br_w1","br_w3"],"stats":{"staggerPct":0.1},"icon":"/assets/icons/stat-damage.svg","desc":"+%10 sarsma"},
  {"id":"br_w3","name":"Maks. can","kind":"small","x":-638,"y":56,"links":["br_w2","n_warlord"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"n_warlord","name":"Savaş Lordu","kind":"notable","x":-640,"y":0,"links":["br_w3","br_w4"],"stats":{"maxHpPct":0.15,"staggerPct":0.15,"aoeRadiusPct":0.1},"icon":"/assets/icons/stat-life.svg","desc":"+%15 maks. can; +%15 sarsma; +%10 alan genişliği"},
  {"id":"br_w4","name":"Zırh","kind":"small","x":-638,"y":-56,"links":["n_warlord","br_w5"],"stats":{"armorPct":0.12},"icon":"/assets/icons/stat-armor.svg","desc":"+%12 zırh"},
  {"id":"br_w5","name":"Yakın dövüş hasarı","kind":"small","x":-630,"y":-111,"links":["br_w4","br_w6"],"stats":{"meleeDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 yakın dövüş hasarı"},
  {"id":"br_w6","name":"Güç","kind":"small","x":-618,"y":-166,"links":["br_w5","kn_a2"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"br_n1","name":"Güç","kind":"small","x":-166,"y":-618,"links":["kn_b2","br_n2"],"stats":{"str":10},"icon":"/assets/icons/stat-strength.svg","desc":"+10 Güç"},
  {"id":"br_n2","name":"Ateş hasarı","kind":"small","x":-111,"y":-630,"links":["br_n1","br_n3"],"stats":{"fireDamagePct":0.08},"icon":"/assets/icons/stat-fire-resist.svg","desc":"+%8 ateş hasarı"},
  {"id":"br_n3","name":"Maks. can","kind":"small","x":-56,"y":-638,"links":["br_n2","n_spellblade"],"stats":{"maxHpPct":0.05},"icon":"/assets/icons/stat-life.svg","desc":"+%5 maks. can"},
  {"id":"n_spellblade","name":"Büyülü Kılıç","kind":"notable","x":0,"y":-640,"links":["br_n3","br_n4"],"stats":{"damagePct":0.12,"str":10,"int":10},"special":{"id":"n_spellblade","desc":"+%12 hasar; yakın dövüş fiziksel hasarının %10'u kadar ek ateş hasarı; +10 Güç ve +10 Zeka","params":{"meleePhysAsExtraFire":0.1}},"icon":"/assets/icons/stat-strength.svg","desc":"+%12 hasar; yakın dövüş fiziksel hasarının %10'u kadar ek ateş hasarı; +10 Güç ve +10 Zeka"},
  {"id":"br_n4","name":"Zeka","kind":"small","x":56,"y":-638,"links":["n_spellblade","br_n5"],"stats":{"int":10},"icon":"/assets/icons/stat-intelligence.svg","desc":"+10 Zeka"},
  {"id":"br_n5","name":"Gizem hasarı","kind":"small","x":111,"y":-630,"links":["br_n4","br_n6"],"stats":{"arcaneDamagePct":0.08},"icon":"/assets/icons/stat-damage.svg","desc":"+%8 gizem hasarı"},
  {"id":"br_n6","name":"Bekleme süresi azaltma","kind":"small","x":166,"y":-618,"links":["br_n5","mg_a2"],"stats":{"cdr":0.03},"icon":"/assets/icons/stat-cooldown.svg","desc":"+%3 bekleme süresi azaltma"},
];

/** GDD_TALENTS §3.3 (T2): the full 306-node web; RAW_BASE (125 nodes) is kept as is, the rest is built by passiveWeb.ts. */
export const TALENT_LIST: TalentNode[] = buildPassiveWeb(RAW_BASE);
export const TALENT_NODES: Record<string, TalentNode> = Object.fromEntries(TALENT_LIST.map((n) => [n.id, n]));
export const CLASS_START_NODE: Record<ClassId, string> = {
  mage: 'mg_start', rogue: 'rg_start', barbarian: 'bb_start', knight: 'kn_start',
  // GDD_CLASSES_V2 §12.1 (NC04): sector prefixes mk / ar / pl / nc / wl; the start nodes are generated by NC26–NC30
  monk: 'mk_start', archer: 'ar_start', paladin: 'pl_start', necromancer: 'nc_start', warlock: 'wl_start',
  // CORE_MECHANICS §2 (CM1): placeholder start nodes of the two new classes (no nodes yet; the class is not playable).
  demonhunter: 'dh_start', evoker: 'ev_start',
  priest: 'pr_start', shaman: 'sh_start', druid: 'dr_start', // CLASS SCAFFOLD (no nodes yet, not playable)
};
/** Tree bounds for the UI. */
export const TALENT_BOUNDS = { minX: -1500, maxX: 1500, minY: -1500, maxY: 1500 };
