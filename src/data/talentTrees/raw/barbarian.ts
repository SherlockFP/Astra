// GENERATED from docs/GDD_TALENTS.*.json by tools/gen-talent-data.mjs — do not edit
// Source: docs/GDD_TALENTS.trees.json · class:barbarian + barbarian_warlord, barbarian_butcher. Row = [slot, opt, name, desc, fx] (GDD_TALENTS §2.9).
import type { SlotId } from '../../../types/talents';
import type { SpecId } from '../../../types/v2';
import type { StatId } from '../../../types/stats';

export type RawRow = [slot: SlotId, opt: '' | 'A' | 'B', name: string | null, desc: string | null, fx: string];
export interface RawTree { palette: StatId[]; rows: RawRow[] }

const data: { class: RawTree; specs: Partial<Record<SpecId, RawTree>> } = {
  class: {
    palette: ['str', 'physicalDamagePct', 'maxHpPct', 'attackSpeed', 'critChance', 'bleedDamagePct', 'lifeSteal', 'armorPct', 'resourceGainPct', 'staggerPct', 'meleeDamagePct', 'ccReductionPct'],
    rows: [
      ['s02', 'A', 'Vahşi Sıçrayış', 'Sıçrayış bekleme −2 sn; inişte 2 sn %20 hareket hızı.', 'M barbarian_leap cd=-2 ;; T cast:barbarian_leap => buff(wild_leap,2,{moveSpeedPct=.2})'],
      ['s02', 'B', 'Çelik Ayak', 'Sıçrayış +1 şarj; şarjlar %30 daha yavaş dolar.', 'M barbarian_leap chg=+1 cdx=1.3'],
      ['s04', '', 'Parçalayıcı Yarma', 'Yarma kanaması +%30 güçlü, hasarı +%10.', 'M barbarian_cleave dotx=1.3 dmgx=1.1'],
      ['s05', 'A', null, null, 'G barbarian_war_cry'],
      ['s05', 'B', null, null, 'G barbarian_intimidating_shout'],
      ['s09', 'A', 'Kan Kalkanı', 'Öfken %50\'nin üzerindeyken aldığın hasar %10 azalır.', 'T tick:1 if=res>.5 => buff(blood_guard,2,{damageReductionPct=.1})'],
      ['s09', 'B', 'Dirilen Öfke', 'Canın %35 altına düşünce +30 Öfke ve 5 sn %3 can çalma kazanırsın (60 sn bekleme).', 'T hurt if=hp<.35 icd=60 => res(30) ; buff(revenge_leech,5,{lifeSteal=.03})'],
      ['s11', '', 'Kasırga Ustası', 'Kasırga yavaşlatması %50 azalır; Kasırga hasarı +%10.', 'M barbarian_whirlwind dmgx=1.1 p.moveSlow*=0.5'],
      ['s12', '', 'Yumruk Ustası', 'Yumruk Darbesi bekleme −3 sn.', 'M barbarian_pummel cd=-3'],
      ['s13', '', 'Yer Sarsıntısı', 'Sıçrayış inişi %30 daha geniş ve 1 sn sersemletir.', 'M barbarian_leap radx=1.3 st=stun:1:1'],
      ['s15', 'A', 'Kanlı Tırpan', 'Yakın dövüş vuruşları %10 şansla kanama (4 sn) uygular.', 'T hit:@melee ch=.1 => st(tgt,bleed,4,.3)'],
      ['s15', 'B', 'Yıkıcı Güç', 'Paralama ve Ata Fırtınası hasarı +%15, sarsması +%25.', 'M barbarian_thrash+barbarian_ancestral_tempest dmgx=1.15 stgx=1.25'],
      ['s17', 'A', 'Öfke Pınarı', 'Öfke kazancı +%20.', 'S resourceGainPct=.20'],
      ['s17', 'B', 'Soğukkanlı Öfke', 'Maks. Öfke +10; vuruşlar %15 şansla +3 Öfke verir.', 'S maxResource=10 ;; T hit ch=.15 => res(3)'],
      ['s18', '', 'Uzun Sıçrayış', 'Sıçrayış bekleme −3 sn, menzil +3 m.', 'M barbarian_leap cd=-3 rng=+3'],
      ['s20', '', 'Kan Çağrısı', 'Büyük yetenek bekleme süreleri %6 daha hızlı azalır.', 'S majorCdrPct=.06'],
      ['s21', '', 'Kemik Parçalayıcı Balta', 'Dönen Balta kanaması +%50 güçlü; geri dönerken ikinci kez vurur.', 'M barbarian_axe_throw dotx=1.5 shape=return'],
      ['s25', '', 'Hiddet Düzeni', 'Kan Hiddeti bekleme −%15, süresi +3 sn.', 'M barbarian_blood_rage cdx=.85 sdur=bloodrage:+3'],
      ['s26', 'A', 'Savaş Haykırışı', 'Büyük yetenek kullanınca 20 m içindeki müttefikler 6 sn güçlenir (20 sn\'de bir).', 'T major ch=1 icd=20 => st(near(20),empower,6)'],
      ['s26', 'B', 'Dayanıklı Ruh', 'Kontrol azaltma +%15; Kan Hiddeti kullanınca %10 can yenilenir.', 'S ccReductionPct=.15 ;; T cast:barbarian_blood_rage => heal(.1)'],
      ['s27', '', 'Nesillerin Fırtınası', 'Ata Fırtınası bekleme −%15; çekim gücü +%30.', 'M barbarian_ancestral_tempest cdx=.85 p.pull*=1.3'],
      ['s28', '', 'Sarsılmaz Kemik', 'Maks. can +%10. Ölümcül darbede %25 canla ayakta kalır, 6 sn Kan Hiddeti gücü kazanırsın (90 sn bekleme).', 'S maxHpPct=.10 ;; T lethal icd=90 => heal(.25) ; st(self,bloodrage,6)'],
      ['s29', '', 'Kan Seli', 'Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 saldırı hızı yığar (en fazla 4).', 'S damagePct=.06 ;; T crit => buff(blood_tide,5,{attackSpeed=.05},max=4)'],
      ['s30', 'A', 'Savaş Ruhu', 'Fiziksel hasar +%25; Ata Fırtınası hasarı +%25.', 'S physicalDamagePct=.25 ;; M barbarian_ancestral_tempest dmgx=1.25'],
      ['s30', 'B', 'Yaşayan Duvar', 'Maks. can +%12, zırh +%20; canın %50 altına düşünce 5 sn %10 kalkan (20 sn bekleme).', 'S maxHpPct=.12 armorPct=.20 ;; T hurt if=hp<.5 icd=20 => abs(.1,5)'],
    ],
  },
  specs: {
    barbarian_warlord: {
      palette: ['maxHpPct', 'armorPct', 'threatPct', 'vit', 'lifeSteal', 'resAll', 'staggerPct', 'meleeDamagePct', 'ccReductionPct', 'healReceivedPct', 'guardGauge', 'parryWindow'],
      rows: [
        ['s02', 'A', 'Demir Duruş Ustası', 'Demir Duruş maliyeti −%15.', 'M barbarian_iron_stance costx=.85'],
        ['s02', 'B', 'Uzun Demir Duruş', 'Demir Duruş 2 sn daha uzun sürer.', 'M barbarian_iron_stance sdur=iron_stance:+2'],
        ['s04', '', 'Kükreyen Tehdit', 'Kükreyen Balta bekleme −2 sn, menzil +8 m.', 'M barbarian_axe_throw cd=-2 rng=+8'],
        ['s05', '', null, null, 'G barbarian_blood_shield'],
        ['s09', 'A', 'Yara Kabuğu Sertleşir', 'Aldığın vuruşlar %10 şansla +5 Öfke verir.', 'T hurt ch=.1 => res(5)'],
        ['s09', 'B', 'Kanlı Direnç', 'Canın %50 altındayken %12 hasar azaltma kazanırsın.', 'T tick:1 if=hp<.5 => buff(bloody_resolve,2,{damageReductionPct=.12})'],
        ['s11', '', 'Kalın Kan Yenilenmesi', 'Kan Yenilenmesi iyileştirmesi +%25.', 'M barbarian_blood_shield healx=1.25'],
        ['s12', '', 'Kemik Kırıcı', 'Yarma tehdit çarpanı +%30, hasarı +%10.', 'M barbarian_cleave p.threatMult*=1.3 dmgx=1.1'],
        ['s13', '', 'Paralama Çemberi', 'Paralama tehdit çarpanı +%25; Paralama hasarı +%10.', 'M barbarian_thrash p.threatMult*=1.25 dmgx=1.1'],
        ['s15', 'A', 'Öfke Zırhı Ustası', 'Öfken %50 üzerindeyken 2 sn\'de bir yenilenen +%10 zırh ve +%1 can çalma kazanırsın.', 'T tick:1 if=res>.5 => buff(rage_plate,2,{armorPct=.1,lifeSteal=.01})'],
        ['s15', 'B', 'Karşı Hücum', 'Paralama hedefi 2 sn %30 yavaşlatır.', 'M barbarian_thrash st=slow:2:.3'],
        ['s17', 'A', 'Öfke Biriktirici', 'Öfke kazancı +%20.', 'S resourceGainPct=.20'],
        ['s17', 'B', 'Kendini Onaran', 'Kan Zırhı kullanınca %4 can yenilenir.', 'T cast:barbarian_blood_shield => heal(.04)'],
        ['s18', '', 'Meydan Balta', 'Kükreyen Balta bekleme −1 sn; kışkırtma süresi +1 sn.', 'M barbarian_axe_throw cd=-1 sdur=taunt:+1'],
        ['s20', '', 'Uzun Direniş', 'Son Direniş bekleme −%15, 3 sn daha uzun sürer.', 'M barbarian_last_stand cdx=.85 sdur=last_stand:+3'],
        ['s21', '', 'Geniş Fırtına', 'Ata Fırtınası yarıçapı +2 m.', 'M barbarian_ancestral_tempest rad=+2'],
        ['s25', '', 'Kale Yıkıcı', 'Sıçrayış +200 sabit tehdit verir.', 'M barbarian_leap p.threat+=200'],
        ['s26', 'A', 'Sürü Koruyucusu', 'Demir Duruş kullanınca 10 m içindeki müttefikler 4 sn güçlenir.', 'T cast:barbarian_iron_stance => st(near(10),fortify,4)'],
        ['s26', 'B', 'Kan Bağı', 'Kan Zırhı kullanınca en yaralı müttefik %5 iyileşir.', 'T cast:barbarian_blood_shield => healally(.05)'],
        ['s27', '', 'Siper Fırtınası', 'Ata Fırtınası tehdit çarpanı +%30; sırasındaki hasar azaltma +%10.', 'M barbarian_ancestral_tempest p.threatMult*=1.3 p.dr+=.1'],
        ['s28', '', 'Yılmaz Savaşçı', 'Maks. can +%10, zırh +%10. Ölümcül darbede %25 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S maxHpPct=.10 armorPct=.10 ;; T lethal icd=90 => heal(.25) ; st(self,invulnerable,1.5)'],
        ['s29', '', 'Öfke Kalkanı', 'Aldığın vuruşlar %20 şansla 6 sn boyunca %4 hasar azaltma yığar (en fazla 4, 1 sn bekleme).', 'T hurt ch=.2 icd=1 => buff(rage_shield,6,{damageReductionPct=.04},max=4)'],
        ['s30', 'A', 'Savaş Efendisi', 'Maks. can +%12, tehdit +%15; Ata Kılığı bekleme −%20.', 'S maxHpPct=.12 threatPct=.15 ;; M barbarian_incarnation cdx=.8'],
        ['s30', 'B', 'Kan Kalesi', 'Can çalma +%2, zırh +%15; Kan Zırhı bekleme −%30.', 'S lifeSteal=.02 armorPct=.15 ;; M barbarian_blood_shield cdx=.7'],
      ],
    },
    barbarian_butcher: {
      palette: ['bleedDamagePct', 'physicalDamagePct', 'attackSpeed', 'critChance', 'critDamage', 'executeDamagePct', 'bleedChance', 'meleeDamagePct', 'str', 'resourceGainPct', 'damagePct', 'lifeSteal'],
      rows: [
        ['s02', 'A', 'Kan Susuzluğu Ustası', 'Kan Susuzluğu hasarı +%15.', 'M barbarian_bloodthirst dmgx=1.15'],
        ['s02', 'B', 'Kan Kokusu', 'Kanayan düşmanlara +%10 hasar; kanama şansı +%8.', 'S ailingDamagePct=.10 bleedChance=.08'],
        ['s04', '', 'Çılgınlık Hazırlığı', 'Çılgın Hamle Öfke maliyeti −%10.', 'M barbarian_rampage costx=.9'],
        ['s05', '', null, null, 'G barbarian_execute'],
        ['s09', 'A', 'Kan Hırsı', 'Kan Susuzluğu vuruşları %50 şansla %1.5 maks. can yeniler.', 'T hit:barbarian_bloodthirst ch=.5 => heal(.015)'],
        ['s09', 'B', 'Öfke Dönüşü', 'Kritik vuruşlar %20 şansla +4 Öfke verir.', 'T crit ch=.2 => res(4)'],
        ['s11', '', 'Cellat Baltası', 'İdam hasarı +%15, sarsması +%20.', 'M barbarian_execute dmgx=1.15 stgx=1.2'],
        ['s12', '', 'Kasırga Ustası', 'Kasırga hasarı +%10 ve vuruşlar hedefi 2 sn %30 yavaşlatır.', 'M barbarian_whirlwind dmgx=1.1 st=slow:2:.3'],
        ['s13', '', 'Öfkeli Darbe Ustası', 'Öfkeli Darbe hasarı +%15.', 'M barbarian_raging_blow dmgx=1.15'],
        ['s15', 'A', 'Banyo Hazırlığı', 'Kan Banyosu hasarı +%20, kanama hasarı +%40.', 'M barbarian_bloodbath dmgx=1.2 dotx=1.4'],
        ['s15', 'B', 'Katliam', 'Katliam Çılgınlığı 4 sn daha uzun sürer.', 'M barbarian_carnage sdur=carnage:+4'],
        ['s17', 'A', 'Hırlayan Öfke', 'Öfke kazancı +%20.', 'S resourceGainPct=.20'],
        ['s17', 'B', 'Çılgın Kemik', 'Çılgın Hamle hasarı +%10.', 'M barbarian_rampage dmgx=1.1'],
        ['s18', '', 'Öfkeli Fay', 'Öfkeli Darbe bekleme −1 sn.', 'M barbarian_raging_blow cd=-1'],
        ['s20', '', 'Sürü Çağrısı', 'Büyük yetenek bekleme süreleri %6 daha hızlı azalır.', 'S majorCdrPct=.06'],
        ['s21', '', 'Av Sıçrayışı', 'Sıçrayış bekleme −2 sn, hasarı +%15.', 'M barbarian_leap cd=-2 dmgx=1.15'],
        ['s25', '', 'Şiddet Düzeni', 'Kan Hiddeti 4 sn daha uzun sürer.', 'M barbarian_blood_rage sdur=bloodrage:+4'],
        ['s26', 'A', 'Sürü Lideri', 'Kurt Narası kullanınca +40 Öfke kazanırsın.', 'T cast:barbarian_wolf_howl => res(40)'],
        ['s26', 'B', 'Kan Dostları', 'Düşman öldürünce %20 şansla +6 Öfke ve %2 can kazanırsın.', 'T kill ch=.2 => res(6) ; heal(.02)'],
        ['s27', '', 'Kan Yağmuru', 'Pervasızlık bekleme −%15.', 'M barbarian_carnage cdx=.85'],
        ['s28', '', 'Cellat Çağrısı', 'Canı <%35 düşmanlara +%30 hasar. İdam bir hedefi öldürürse bekleme süresi sıfırlanır.', 'S executeDamagePct=.30 ;; T kill:barbarian_execute => rst(barbarian_execute)'],
        ['s29', '', 'Kanlı Çılgınlık', 'Saldırı hızı +%5, kritik şansı +%2.5.', 'S attackSpeed=.05 critChance=.025 ;; T crit ch=.15 => buff(frenzy_edge,4,{critDamage=.15},max=1)'],
        ['s30', 'A', 'Kasap Efendisi', 'Hasar +%5; Kan Banyosu hasarı +%20.', 'S damagePct=.05 ;; M barbarian_bloodbath dmgx=1.2'],
        ['s30', 'B', 'Katliam Efendisi', 'Hasar +%8; İdam Öfke maliyeti −%50 ve hasarı +%20.', 'S damagePct=.08 ;; M barbarian_execute costx=.5 dmgx=1.2'],
      ],
    },
  },
};

export default data;
