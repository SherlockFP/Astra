// GENERATED from docs/GDD_TALENTS.*.json by tools/gen-talent-data.mjs — do not edit
// Source: docs/GDD_TALENTS.trees.json · class:knight + knight_protector, knight_blademaster. Row = [slot, opt, name, desc, fx] (GDD_TALENTS §2.9).
import type { SlotId } from '../../../types/talents';
import type { SpecId } from '../../../types/v2';
import type { StatId } from '../../../types/stats';

export type RawRow = [slot: SlotId, opt: '' | 'A' | 'B', name: string | null, desc: string | null, fx: string];
export interface RawTree { palette: StatId[]; rows: RawRow[] }

const data: { class: RawTree; specs: Partial<Record<SpecId, RawTree>> } = {
  class: {
    palette: ['str', 'meleeDamagePct', 'maxHpPct', 'armorPct', 'blockChance', 'critChance', 'attackSpeed', 'holyDamagePct', 'resAll', 'ccReductionPct', 'staggerPct', 'resourceRegenPct'],
    rows: [
      ['s02', 'A', 'Süvari Adımı', 'Hareket hızı +%8; Hücum bekleme süresi −3 sn.', 'S moveSpeedPct=.08 ;; M knight_charge cd=-3'],
      ['s02', 'B', 'Zırhlı Atılış', 'Hücum +3 m menzil kazanır; atılırken aldığın hasar %30 azalır.', 'M knight_charge rng=+3 ;; T cast:knight_charge => buff(charge_ward,2,{damageReductionPct=.3})'],
      ['s04', '', 'Parlak Kalkan', 'Kalkan Darbesi bekleme −0.5 sn ve menzil +1 m.', 'M knight_shield_bash cd=-0.5 rng=+1'],
      ['s05', 'A', null, null, 'G knight_intercept'],
      ['s05', 'B', null, null, 'G knight_guardian_vow'],
      ['s09', 'A', 'Yemin Gücü', 'Canın %40 altına düşünce 6 sn maks. canının %15\'i kadar kalkan kazanırsın (45 sn bekleme).', 'T hurt if=hp<.4 icd=45 => abs(.15,6)'],
      ['s09', 'B', 'Çelik İrade', 'Kontrol azaltma +%15; canın %30 altına düşünce 2 olumsuz etki temizlenir (60 sn bekleme).', 'S ccReductionPct=.15 ;; T hurt if=hp<.3 icd=60 => purge(2)'],
      ['s11', '', 'Çelik Hücum', 'Hücum +1 şarj kazanır; şarjlar %25 daha yavaş dolar.', 'M knight_charge chg=+1 cdx=1.25'],
      ['s12', '', 'Işık Hasadı', 'Işıltılı Yarma alanı +%20, hasarı +%10.', 'M knight_radiant_cleave radx=1.2 dmgx=1.1'],
      ['s13', '', 'Meydan Okuma Yankısı', 'Meydan Okuma bekleme −3 sn, yarıçap +2 m.', 'M knight_challenge cd=-3 rad=+2'],
      ['s15', 'A', 'Kılıç Hasadı', 'Temel vuruşlar %10 şansla ek %80 fiziksel hasar vurur.', 'T hit:@basic ch=.1 => dmg(.8,physical)'],
      ['s15', 'B', 'Kalkan Ustası', 'Kalkan Darbesi hasarı +%20, sarsması +%30.', 'M knight_shield_bash dmgx=1.2 stgx=1.3'],
      ['s17', 'A', 'Kararlılık Akışı', 'Kaynak yenilenmesi +%20.', 'S resourceRegenPct=.20'],
      ['s17', 'B', 'Kararlı Vuruş', 'Vuruşların %20 şansla +4 Kararlılık verir.', 'T hit ch=.2 => res(4)'],
      ['s18', '', 'Kalkan Duvarı: Sabır', 'Kalkan Duvarı bekleme −4 sn; depoladığı hasar %50 artar.', 'M knight_shield_wall cd=-4 p.store*=1.5'],
      ['s20', '', 'Kahramanlık Sancağı', 'Büyük yetenek bekleme süreleri %6 daha hızlı azalır.', 'S majorCdrPct=.06'],
      ['s21', '', 'Kutsal Toprak: Işık Alanı', 'Kutsal Toprak alanı +%15, hasarı +%20.', 'M knight_consecration radx=1.15 dmgx=1.2'],
      ['s25', '', 'Sancak Yemini', 'Savaş Sancağı 3 sn uzun sürer; Kararlılık kazancı %50 artar.', 'M knight_war_banner sdur=banner:+3 p.gainPerSec*=1.5'],
      ['s26', 'A', 'Cesaret Şarkısı', 'Göksel Hüküm kullanınca grup 8 sn Kutsanmış olur.', 'T cast:knight_heavens_judgment => st(party,blessed,8)'],
      ['s26', 'B', 'Siper Kardeşliği', 'Blokladığın vuruşlar 8 m içindeki müttefikleri 4 sn güçlendirir (2 sn bekleme).', 'T block icd=2 => st(near(8),fortify,4)'],
      ['s27', '', 'Göksel Hüküm: Yargı Günü', 'Göksel Hüküm bekleme −%15, savurma +%20.', 'M knight_heavens_judgment cdx=.85 kbx=1.2'],
      ['s28', '', 'Yılmaz Muhafız', 'Maks. can +%10. Ölümcül darbede canının %20\'siyle ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
      ['s29', '', 'Adalet Ordusu', 'Hasar +%6. Kritik vuruşlar 6 sn boyunca +%4 saldırı hızı yığar (en fazla 5).', 'S damagePct=.06 ;; T crit => buff(justice_army,6,{attackSpeed=.04},max=5)'],
      ['s30', 'A', 'Kutsal Savaşçı', 'Kutsal hasar +%25; Göksel Hüküm hasarı +%25.', 'S holyDamagePct=.25 ;; M knight_heavens_judgment dmgx=1.25'],
      ['s30', 'B', 'Demir Kale', 'Zırh +%30, blok şansı +%5; Kalkan Duvarı %25 daha sık kullanılır.', 'S armorPct=.30 blockChance=.05 ;; M knight_shield_wall cdx=.75'],
    ],
  },
  specs: {
    knight_protector: {
      palette: ['maxHpPct', 'armorPct', 'blockChance', 'threatPct', 'guardGauge', 'blockAmount', 'parryWindow', 'vit', 'resAll', 'holyDamagePct', 'healReceivedPct', 'staggerPct'],
      rows: [
        ['s02', 'A', 'Kalkan Refleksi', 'Kalkan Kaldır şarjları 1.5 sn daha hızlı dolar.', 'M knight_shield_block cd=-1.5'],
        ['s02', 'B', 'Aegis Dönüşü', 'Kalkan Kaldır 2 sn daha uzun sürer.', 'M knight_shield_block sdur=shield_block:+2'],
        ['s04', '', 'Tehditkâr Kalkan', 'Kalkan Darbesi hasarı +%15 ve +150 sabit tehdit verir.', 'M knight_shield_bash dmgx=1.15 p.threat+=150'],
        ['s05', '', null, null, 'G knight_ward_of_oath'],
        ['s09', 'A', 'Blok Ustalığı', 'Engellenen her vuruş +2 Kararlılık verir.', 'T block => res(2)'],
        ['s09', 'B', 'Parlak Savunma', 'Savuşturma penceresi +0.05 sn; başarılı savuşturma 4 sn %15 hasar azaltma verir.', 'S parryWindow=.05 ;; T parry => buff(parry_guard,4,{damageReductionPct=.15})'],
        ['s11', '', 'Güçlü Yemin Siperi', 'Yemin Siperi emilimi +%25.', 'M knight_ward_of_oath absx=1.25'],
        ['s12', '', 'Kalkan Duvarı: Yemin', 'Kalkan Duvarı bekleme −%15; depoladığı hasar +%25.', 'M knight_shield_wall cdx=.85 p.store*=1.25'],
        ['s13', '', 'Yarma: Tehdit Taşkını', 'Işıltılı Yarma 5 Kararlılık ucuz; tehdit çarpanı +%20.', 'M knight_radiant_cleave cost=-5 p.threatMult*=1.2'],
        ['s15', 'A', 'Demir Duvar', 'Engellenen vuruşlar Kalkan Darbesi bekleme süresini 0.5 sn azaltır (1 sn bekleme).', 'T block icd=1 => cdr(knight_shield_bash,0.5)'],
        ['s15', 'B', 'Karşı Kılıç', 'Savuşturmadan sonra 3 sn vuruşların +%60 hasar verir.', 'T parry => buff(riposte_edge,3,{damagePct=.6})'],
        ['s17', 'A', 'Kararlı Nöbetçi', 'Kaynak yenilenmesi +%20; Kalkan Kaldır maliyeti −%20.', 'S resourceRegenPct=.20 ;; M knight_shield_block costx=.8'],
        ['s17', 'B', 'Şifa Işığı', 'Kutsal Toprak\'ın iyileştirmesi +%50.', 'M knight_consecration healx=1.5'],
        ['s18', '', 'Kışkırtma Ustası', 'Kışkırtma bekleme −2 sn, menzil +8 m.', 'M knight_provoke cd=-2 rng=+8'],
        ['s20', '', 'Kadim Bastion', 'Sarsılmaz Bastion bekleme −%15 ve 2 sn daha uzun sürer.', 'M knight_unbroken_bastion cdx=.85 sdur=bastion:+2'],
        ['s21', '', 'Geniş Aegis', 'Yemin Aegis\'i yarıçap +5 m, 2 sn daha uzun sürer.', 'M knight_oath_aegis rad=+5 sdur=aegis:+2'],
        ['s25', '', 'Kutsal Kalkan', 'Kalkan Darbesi hasarının yarısı kutsala dönüşür; hasar +%10.', 'M knight_shield_bash cv=holy:.5 dmgx=1.1'],
        ['s26', 'A', 'Güvenli Liman', 'Yemin Siperi kullanınca 12 m içindeki müttefikler de Yemin Siperi alır.', 'T cast:knight_ward_of_oath => st(near(12),oath_ward,8)'],
        ['s26', 'B', 'Yankılanan Nara', 'Meydan Okuma sonrası 5 sn blok miktarı +%15.', 'T cast:knight_challenge => buff(echo_roar,5,{blockAmount=.15})'],
        ['s27', '', 'Hüküm: Muhafız', 'Göksel Hüküm +250 sabit tehdit verir, hasarı +%10.', 'M knight_heavens_judgment p.threat+=250 dmgx=1.1'],
        ['s28', '', 'Sarsılmaz Nöbetçi', 'Maks. can +%8, blok şansı +%4. Blokların %15 şansla Kalkan Kaldır\'ı sıfırlar (6 sn bekleme).', 'S maxHpPct=.08 blockChance=.04 ;; T block ch=.15 icd=6 => rst(knight_shield_block)'],
        ['s29', '', 'Yeminli Kalkan', 'Savuşturma çevreye %120 kutsal patlama yapar ve +10 Kararlılık verir.', 'S guardGauge=20 ;; T parry => exp(1.2,3,holy) ; res(10)'],
        ['s30', 'A', 'Işığın Zırhı', 'Zırh +%20, alınan iyileştirme +%15; Yemin Siperi +1 şarj.', 'S armorPct=.20 healReceivedPct=.15 ;; M knight_ward_of_oath chg=+1'],
        ['s30', 'B', 'Ateşten Siper', 'Blok şansı +%6, diken +40; engellenen vuruşlar saldırgana %80 kutsal hasar yansıtır.', 'S blockChance=.06 thorns=40 ;; T block => dmg(.8,holy)'],
      ],
    },
    knight_blademaster: {
      palette: ['attackSpeed', 'holyDamagePct', 'critChance', 'meleeDamagePct', 'critDamage', 'finisherPct', 'str', 'damagePct', 'cdr', 'resourceGainPct', 'weaponArtPct', 'poiseDamagePct'],
      rows: [
        ['s02', 'A', 'Adalet Hızlanması', 'Kutsal hasar +%8; temel vuruşlar %15 şansla ek +1 Adalet verir.', 'S holyDamagePct=.08 ;; T hit:@basic ch=.15 => pip(adalet,1)'],
        ['s02', 'B', 'Hüküm Hasadı', 'Karar Darbesi hasarı +%15, kritik şansı +%10.', 'M knight_templar_verdict dmgx=1.15 crit=+.1'],
        ['s04', '', 'Keskin Karar', 'Karar Darbesi sarsması +%30, menzili +0.5 m.', 'M knight_templar_verdict stgx=1.3 rng=+0.5'],
        ['s05', '', null, null, 'G knight_wake_of_flames'],
        ['s09', 'A', 'Alev Zırhı', 'Kutsal hasar +%6; Kutsal Alev Dalgası sonrası 4 sn %12 hasar azaltma.', 'S holyDamagePct=.06 ;; T cast:knight_wake_of_flames => buff(flame_ward,4,{damageReductionPct=.12})'],
        ['s09', 'B', 'Işığın Atılışı', 'Hücum +1 Adalet verir.', 'T cast:knight_charge => pip(adalet,1)'],
        ['s11', '', 'Geniş Alev', 'Alan hasarı +%8; Kutsal Alev Dalgası +2 m menzil, +%15 alan.', 'S aoePct=.08 ;; M knight_wake_of_flames rng=+2 radx=1.15'],
        ['s12', '', 'Adalet Hasadı', 'Işıltılı Yarma hasarı +%15; fazladan her 2 hedefte +1 Adalet.', 'M knight_radiant_cleave dmgx=1.15 pip=adalet:1'],
        ['s13', '', 'Hüküm Günü Çağrısı', 'Kritik hasarı +%10; Göksel Hüküm bekleme −%15, sarsması +%30.', 'S critDamage=.10 ;; M knight_heavens_judgment cdx=.85 stgx=1.3'],
        ['s15', 'A', 'Gayret Ustası', 'Gayret 3 sn uzar; temel vuruşlar %20 şansla +1 Adalet verir.', 'M knight_zeal sdur=zeal:+3 ;; T hit:@basic ch=.2 => pip(adalet,1)'],
        ['s15', 'B', 'Kılıç Fırtınası', 'Saldırı hızı +%8; temel zincir hasarı +%10.', 'S attackSpeed=.08 ;; M knight_basic dmgx=1.1'],
        ['s17', 'A', 'Uzun Uçuş', 'Hüküm Kanatları 6 sn daha uzun sürer.', 'M knight_wings_of_judgment sdur=wings:+6'],
        ['s17', 'B', 'Çabuk Adalet', 'Kaynak kazancı +%20; savaşta Adalet varsa 4 sn\'de bir +1 kazanırsın.', 'S resourceGainPct=.20 ;; T tick:4 if=pips>=1:adalet&inCombat => pip(adalet,1)'],
        ['s18', '', 'Çifte Hüküm', 'Kritik şansı +%1; Karar Darbesi %20 şansla yarım güçte ikinci kez vurur.', 'S critChance=.01 ;; T cast:knight_templar_verdict ch=.2 => echo(knight_templar_verdict,.5,.4)'],
        ['s20', '', 'Borazancı Kardeşliği', 'Hüküm Kanatları ve Gayret bekleme −%10.', 'M knight_wings_of_judgment+knight_zeal cdx=.9'],
        ['s21', '', 'Adalet Alanı', 'Kutsal Toprak alanı +%10, hasarı +%25.', 'M knight_consecration dmgx=1.25 radx=1.1'],
        ['s25', '', 'Hücum Ustalığı', 'Yakın dövüş hasarı +%8; Hücum hasarı +%25, sarsması +%40.', 'S meleeDamagePct=.08 ;; M knight_charge dmgx=1.25 stgx=1.4'],
        ['s26', 'A', 'Adalet Fenerı', '5 Adalet\'le Karar Darbesi 10 m içindeki müttefikleri 6 sn Kutsanmış yapar.', 'T cast:knight_templar_verdict if=pips>=5:adalet => st(near(10),blessed,6)'],
        ['s26', 'B', 'Yalnız Kılıç', 'Yakınında (40 m) müttefik yokken +%12 hasar.', 'T tick:1 if=solo => buff(lone_blade,2,{damagePct=.12})'],
        ['s27', '', 'Yargı Patlaması', '5 Adalet\'le Karar Darbesi hedefin çevresinde %120 kutsal patlama yapar.', 'T cast:knight_templar_verdict if=pips>=5:adalet => exp(1.2,3.5,holy)'],
        ['s28', '', 'Hüküm Zinciri', 'Karar Darbesi sonrası 4 sn +%5 saldırı hızı yığar (en fazla 3).', 'T cast:knight_templar_verdict => buff(verdict_chain,4,{attackSpeed=.05},max=3)'],
        ['s29', '', 'Hüküm Sahibi', 'Kritik şansı +%4; kritik vuruşlar %25 şansla +1 Adalet verir.', 'S critChance=.04 ;; T crit ch=.25 => pip(adalet,1)'],
        ['s30', 'A', 'Kutsal Kasırga', 'Karar Darbesi hasarı +%30; 5 Adalet\'le kullanınca Kutsal Alev Dalgası sıfırlanır.', 'M knight_templar_verdict dmgx=1.3 ;; T cast:knight_templar_verdict if=pips>=5:adalet => rst(knight_wake_of_flames)'],
        ['s30', 'B', 'Cellat Yemini', 'Canı <%35 düşmanlara +%40 hasar; öldürünce +2 Adalet.', 'S executeDamagePct=.40 ;; T kill => pip(adalet,2)'],
      ],
    },
  },
};

export default data;
