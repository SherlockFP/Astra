// GENERATED from docs/GDD_TALENTS.*.json by tools/gen-talent-data.mjs — do not edit
// Source: docs/GDD_TALENTS.trees.json · class:warlock + warlock_affliction, warlock_destruction. Row = [slot, opt, name, desc, fx] (GDD_TALENTS §2.9).
import type { SlotId } from '../../../types/talents';
import type { SpecId } from '../../../types/v2';
import type { StatId } from '../../../types/stats';

export type RawRow = [slot: SlotId, opt: '' | 'A' | 'B', name: string | null, desc: string | null, fx: string];
export interface RawTree { palette: StatId[]; rows: RawRow[] }

const data: { class: RawTree; specs: Partial<Record<SpecId, RawTree>> } = {
  class: {
    palette: ['int', 'shadowDamagePct', 'dotPct', 'castSpeed', 'critChance', 'maxHpPct', 'minionDamagePct', 'minionHpPct', 'resourceRegenPct', 'cdr', 'fireDamagePct', 'lifeSteal'],
    rows: [
      ['s02', 'A', 'Gölge Adımı', 'Hareket hızı +%8.', 'S moveSpeedPct=.08'],
      ['s02', 'B', 'İblis Atılışı', 'Hasar alınca %10 şansla 3 sn hareket hızı +%20 (6 sn bekleme).', 'T hurt ch=.1 icd=6 => buff(fel_dash,3,{moveSpeedPct=.2})'],
      ['s04', '', 'Yoğun Gölge Oku', 'Gölge Oku hasarı +%15, maliyeti −%10.', 'M warlock_shadow_bolt dmgx=1.15 costx=.9'],
      ['s05', 'A', null, null, 'G warlock_spell_lock'],
      ['s05', 'B', null, null, 'G warlock_unending_resolve'],
      ['s09', 'A', 'Can Bağı', 'Can Dönüşümü sonrası 6 sn %10 hasar azaltma kazanırsın.', 'T cast:warlock_life_tap => buff(life_pact,6,{damageReductionPct=.1})'],
      ['s09', 'B', 'Kader Direnci', 'Canın %35 altına düşünce %15 can yenilenir (60 sn bekleme).', 'T hurt if=hp<.35 icd=60 => heal(.15)'],
      ['s11', '', 'Yozlaşma Ustası', 'Yozlaşma maliyeti −%20, zamanla hasarı +%15.', 'M warlock_corruption costx=.8 dotx=1.15'],
      ['s12', '', 'Azap Ustası', 'Azap maliyeti −%20, zamanla hasarı +%10.', 'M warlock_agony costx=.8 dotx=1.1'],
      ['s13', '', 'İblis Çağrısı', 'İblis Çağır bekleme −2 sn; yoldaş canı +%10.', 'M warlock_summon_demon cd=-2 ;; S minionHpPct=.10'],
      ['s15', 'A', 'Zaman Silahı', 'Zamanla hasar +%20.', 'S dotPct=.20'],
      ['s15', 'B', 'Ateş ve Kükürt', 'Ateş hasarı +%15; Ateş Yağmuru hasarı +%15.', 'S fireDamagePct=.15 ;; M warlock_rain_of_fire dmgx=1.15'],
      ['s17', 'A', 'Ruh Pınarı', 'Mana yenilenmesi +%20.', 'S resourceRegenPct=.20'],
      ['s17', 'B', 'Kan Pakti', 'Can Dönüşümü maliyeti −%33, verdiği mana +%50.', 'M warlock_life_tap costx=.67 p.manaFlat*=1.5'],
      ['s18', '', 'Emme Ustası', 'Can Emme hasarı +%20, iyileştirmesi +%25.', 'M warlock_drain_life dmgx=1.2 healx=1.25'],
      ['s20', '', 'Sözleşme Zamanı', 'Büyük yetenek bekleme süreleri %6 daha hızlı azalır.', 'S majorCdrPct=.06'],
      ['s21', '', 'Geniş Ateş Yağmuru', 'Ateş Yağmuru alanı +%25, mana maliyeti −%10.', 'M warlock_rain_of_fire radx=1.25 costx=.9'],
      ['s25', '', 'Kadim Dönüşüm', 'Can Dönüşümü bekleme −3 sn, maliyeti −%20.', 'M warlock_life_tap cd=-3 costx=.8'],
      ['s26', 'A', 'Karanlık Ordu', 'Cehennem Muhafızı kullanınca grup 8 sn güçlenir.', 'T cast:warlock_summon_infernal => st(party,empower,8)'],
      ['s26', 'B', 'Koruyucu Sözleşme', 'Can Dönüşümü 10 m içindeki müttefikleri 4 sn güçlendirir.', 'T cast:warlock_life_tap => st(near(10),fortify,4)'],
      ['s27', '', 'Muhafız Efendisi', 'Cehennem Muhafızı bekleme −%15, hasarı +%20.', 'M warlock_summon_infernal cdx=.85 dmgx=1.2'],
      ['s28', '', 'Karanlık Beden', 'Maks. can +%10. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
      ['s29', '', 'Sözleşme Ritmi', 'Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 büyü hızı yığar (en fazla 4).', 'S damagePct=.06 ;; T crit => buff(pact_rhythm,5,{castSpeed=.05},max=4)'],
      ['s30', 'A', 'Acı Efendisi', 'Zamanla hasar +%30, gölge hasarı +%10.', 'S dotPct=.30 shadowDamagePct=.10'],
      ['s30', 'B', 'Şeytan Efendisi', 'Yoldaş hasarı +%25, canı +%20; İblis Çağır bekleme −%30.', 'S minionDamagePct=.25 minionHpPct=.20 ;; M warlock_summon_demon cdx=.7'],
    ],
  },
  specs: {
    warlock_affliction: {
      palette: ['dotPct', 'shadowDamagePct', 'castSpeed', 'critChance', 'int', 'damagePct', 'critDamage', 'resourceRegenPct', 'lifeSteal', 'cdr', 'maxHpPct', 'ailingDamagePct'],
      rows: [
        ['s02', 'A', 'Dengesiz Güç', 'Dengesiz Azap hasarı +%15, zamanla hasarı +%15.', 'M warlock_unstable_affliction dmgx=1.15 dotx=1.15'],
        ['s02', 'B', 'Yozlaşma Yayılımı', 'Yozlaşma kritik şansı +%10, süresi +3 sn.', 'M warlock_corruption crit=+.1 sdur=corruption:+3'],
        ['s04', '', 'Dengesiz Ustalık', 'Dengesiz Azap maliyeti −%20, süresi +2 sn.', 'M warlock_unstable_affliction costx=.8 sdur=unstable_affliction:+2'],
        ['s05', '', null, null, 'G warlock_seed_of_corruption'],
        ['s09', 'A', 'Kan Hırsı', 'Azaplı düşmanı öldürünce %50 şansla %2 can yenilenir.', 'T kill if=tst:agony ch=.5 => heal(.02)'],
        ['s09', 'B', 'Gölge Zırhı', 'Azap uygularken %15 şansla 4 sn %12 hasar azaltma kazanırsın.', 'T cast:warlock_agony ch=.15 => buff(shadow_ward,4,{damageReductionPct=.12})'],
        ['s11', '', 'Tohum Ustası', 'Yozlaşma Tohumu +1 hedefe bulaşır, hasarı +%20.', 'M warlock_seed_of_corruption cnt=+1 dmgx=1.2'],
        ['s12', '', 'Azap Yankısı', 'Azap %15 şansla fazladan bir yığın uygular.', 'T cast:warlock_agony ch=.15 => st(tgt,agony,18)'],
        ['s13', '', 'Yozlaşma Gücü', 'Yozlaşma zamanla hasarı +%20, maliyeti −%15.', 'M warlock_corruption dotx=1.2 costx=.85'],
        ['s15', 'A', 'Karanlık Ruh Ustası', 'Karanlık Ruh 4 sn daha uzun sürer.', 'M warlock_af_dark_soul sdur=soul_misery:+4'],
        ['s15', 'B', 'Pandemik Ustası', 'Pandemik 4 sn daha uzun sürer, alanı +%20.', 'M warlock_af_pandemic dur=+4 radx=1.2'],
        ['s17', 'A', 'Ruh Pınarı', 'Mana yenilenmesi +%20.', 'S resourceRegenPct=.20'],
        ['s17', 'B', 'Ruh Biçen', 'Azaplı düşman ölünce %25 şansla +1 Ruh Parçası kazanırsın.', 'T kill if=tst:agony ch=.25 => pip(shard,1)'],
        ['s18', '', 'Acı Emişi', 'Can Emme hasarı +%20.', 'M warlock_drain_life dmgx=1.2'],
        ['s20', '', 'Acı Zamanı', 'Karanlık Ruh ve Pandemik bekleme −%10.', 'M warlock_af_dark_soul+warlock_af_pandemic cdx=.9'],
        ['s21', '', 'Ateş Dili', 'Dengesiz Azaplı düşman ölünce çevreye %100 gölge patlaması olur.', 'T kill if=tst:unstable_affliction => exp(1.0,4,shadow)'],
        ['s25', '', 'Tohum Fırtınası', 'Yozlaşma Tohumu bekleme −4 sn, patlaması +%25.', 'M warlock_seed_of_corruption cd=-4 dmgx=1.25'],
        ['s26', 'A', 'Acı Yayılımı', 'Pandemik kullanınca grup 6 sn güçlenir.', 'T cast:warlock_af_pandemic => st(party,empower,6)'],
        ['s26', 'B', 'Ruh Bağı', 'Karanlık Ruh kullanınca +2 Ruh Parçası kazanırsın.', 'T cast:warlock_af_dark_soul => pip(shard,2)'],
        ['s27', '', 'Acıların Dansı', 'Yozlaşma %20 şansla yarı güçte yeniden uygulanır.', 'T cast:warlock_corruption ch=.2 => echo(warlock_corruption,.5,.4)'],
        ['s28', '', 'Sonsuz Acı', 'Zamanla hasar +%15, büyü hızı +%4. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S dotPct=.15 castSpeed=.04 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
        ['s29', '', 'Kader Dokusu', 'Hasar +%6, kritik şansı +%2. Kritik vuruşlar %15 şansla +1 Ruh Parçası verir.', 'S damagePct=.06 critChance=.02 ;; T crit ch=.15 => pip(shard,1)'],
        ['s30', 'A', 'Acı Hükümdarı', 'Zamanla hasar +%30; Dengesiz Azap hasarı +%20.', 'S dotPct=.30 ;; M warlock_unstable_affliction dmgx=1.2'],
        ['s30', 'B', 'Zaman Efendisi', 'Zamanla hasar +%20, gölge hasarı +%10, büyü hızı +%5; Pandemik bekleme −%20.', 'S dotPct=.20 shadowDamagePct=.10 castSpeed=.05 ;; M warlock_af_pandemic cdx=.8'],
      ],
    },
    warlock_destruction: {
      palette: ['fireDamagePct', 'critChance', 'critDamage', 'castSpeed', 'int', 'damagePct', 'shadowDamagePct', 'resourceRegenPct', 'aoePct', 'cdr', 'maxHpPct', 'executeDamagePct'],
      rows: [
        ['s02', 'A', 'Alev Ustası', 'Yakıp Yıkma yanması +%25, süresi +3 sn.', 'M warlock_immolate dotx=1.25 sdur=immolate:+3'],
        ['s02', 'B', 'Kor Gölge', 'Gölge Oku hasarının yarısı ateşe dönüşür; hasarı +%10.', 'M warlock_shadow_bolt cv=fire:.5 dmgx=1.1'],
        ['s04', '', 'Keskin Alev', 'Yakıp Yıkma hasarı +%15, maliyeti −%15.', 'M warlock_immolate dmgx=1.15 costx=.85'],
        ['s05', '', null, null, 'G warlock_chaos_bolt'],
        ['s09', 'A', 'Kor Zırhı', 'Ateş kritikleri %15 şansla 4 sn %10 hasar azaltma verir.', 'T crit:@fire ch=.15 => buff(ember_ward,4,{damageReductionPct=.1})'],
        ['s09', 'B', 'Yıkım Hırsı', 'Kritik vuruşlar %20 şansla +1 Ruh Parçası verir.', 'T crit ch=.2 => pip(shard,1)'],
        ['s11', '', 'Kaos Ustalığı', 'Kaos Oku hasarı +%15, kritik şansı +%10.', 'M warlock_chaos_bolt dmgx=1.15 crit=+.1'],
        ['s12', '', 'Yıkım Yağmuru', 'Ateş Yağmuru hasarı +%20, alanı +%15.', 'M warlock_rain_of_fire dmgx=1.2 radx=1.15'],
        ['s13', '', 'Hızlı Kaos', 'Kaos Oku döküm süresi −%20.', 'M warlock_chaos_bolt castx=.8'],
        ['s15', 'A', 'Kaos Efendisi', 'Kaos 4 sn daha uzun sürer.', 'M warlock_ds_havoc sdur=havoc:+4'],
        ['s15', 'B', 'Kıyamet Ustası', 'Kıyamet Yağmuru +2 ateş topu atar.', 'M warlock_ds_cataclysm p.balls+=2'],
        ['s17', 'A', 'Ruh Pınarı', 'Mana yenilenmesi +%20.', 'S resourceRegenPct=.20'],
        ['s17', 'B', 'Ruh Alevi', 'Ateş kritikleri %20 şansla maks. mananın %4\'ünü iade eder.', 'T crit:@fire ch=.2 => resp(.04)'],
        ['s18', '', 'Yakıcı Dalga', 'Yakıp Yıkma\'lı düşman ölünce çevreye %80 ateş patlaması olur.', 'T kill if=tst:immolate => exp(.8,4,fire)'],
        ['s20', '', 'Yıkım Zamanı', 'Kaos ve Kıyamet Yağmuru bekleme −%10.', 'M warlock_ds_havoc+warlock_ds_cataclysm cdx=.9'],
        ['s21', '', 'Kor Fırtınası', 'Gölge Oku kritikleri %20 şansla ek %60 ateş hasarı vurur.', 'T crit:warlock_shadow_bolt ch=.2 => dmg(.6,fire)'],
        ['s25', '', 'Ateş Gücü', 'Ateş hasarı +%15; Kaos Oku maliyeti −%15.', 'S fireDamagePct=.15 ;; M warlock_chaos_bolt costx=.85'],
        ['s26', 'A', 'Yıkım Haykırışı', 'Kıyamet Yağmuru kullanınca grup 6 sn güçlenir.', 'T cast:warlock_ds_cataclysm => st(party,empower,6)'],
        ['s26', 'B', 'Kor Bağı', 'Kaos kullanınca +2 Ruh Parçası kazanırsın.', 'T cast:warlock_ds_havoc => pip(shard,2)'],
        ['s27', '', 'Kaos Yankısı', 'Kaos Oku %15 şansla yarı güçte tekrar eder.', 'T cast:warlock_chaos_bolt ch=.15 => echo(warlock_chaos_bolt,.5,.4)'],
        ['s28', '', 'Yıkımın Eli', 'Ateş hasarı +%10, kritik şansı +%3. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S fireDamagePct=.10 critChance=.03 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
        ['s29', '', 'Alev Ritmi', 'Hasar +%6, kritik hasarı +%15. Ateş kritikleri 5 sn boyunca +%5 büyü hızı yığar (en fazla 4).', 'S damagePct=.06 critDamage=.15 ;; T crit:@fire => buff(flame_rhythm,5,{castSpeed=.05},max=4)'],
        ['s30', 'A', 'Yıkım Hükümdarı', 'Ateş hasarı +%25; Kaos Oku hasarı +%25.', 'S fireDamagePct=.25 ;; M warlock_chaos_bolt dmgx=1.25'],
        ['s30', 'B', 'Kıyamet Kralı', 'Kritik hasarı +%25, kritik şansı +%2; Kıyamet Yağmuru bekleme −%20.', 'S critDamage=.25 critChance=.02 ;; M warlock_ds_cataclysm cdx=.8'],
      ],
    },
  },
};

export default data;
