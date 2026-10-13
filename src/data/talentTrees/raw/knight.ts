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
      ['s18', '', 'Kalkan Kaldır: Sabır', 'Kalkan Kaldır bekleme −1.5 sn; depoladığı hasar %50 artar.', 'M knight_shield_block cd=-1.5 p.store*=1.5'],
      ['s20', '', 'Kahramanlık Sancağı', 'Büyük yetenek bekleme süreleri %6 daha hızlı azalır.', 'S majorCdrPct=.06'],
      ['s21', '', 'Avatar Uzatma', 'Savaş Avatarı 3 sn daha uzun sürer.', 'M knight_avatar sdur=avatar:+3'],
      ['s25', '', 'Sancak Yemini', 'Büyük yetenek bekleme azaltma +%4; Savaş Avatarı bekleme −%5.', 'S majorCdrPct=.04 ;; M knight_avatar cdx=.95'],
      ['s26', 'A', 'Cesaret Şarkısı', 'Savaş Avatarı kullanınca grup 8 sn Kutsanmış olur.', 'T cast:knight_avatar => st(party,blessed,8)'],
      ['s26', 'B', 'Siper Kardeşliği', 'Blokladığın vuruşlar 8 m içindeki müttefikleri 4 sn güçlendirir (2 sn bekleme).', 'T block icd=2 => st(near(8),fortify,4)'],
      ['s27', '', 'Avatar: Yargı Günü', 'Savaş Avatarı bekleme −%15, 2 sn daha uzun sürer.', 'M knight_avatar cdx=.85 sdur=avatar:+2'],
      ['s28', '', 'Yılmaz Muhafız', 'Maks. can +%10. Ölümcül darbede canının %20\'siyle ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
      ['s29', '', 'Adalet Ordusu', 'Hasar +%6. Kritik vuruşlar 6 sn boyunca +%4 saldırı hızı yığar (en fazla 5).', 'S damagePct=.06 ;; T crit => buff(justice_army,6,{attackSpeed=.04},max=5)'],
      ['s30', 'A', 'Savaş Efendisi', 'Yakın dövüş hasarı +%15; Hücum hasarı +%25.', 'S meleeDamagePct=.15 ;; M knight_charge dmgx=1.25'],
      ['s30', 'B', 'Demir Kale', 'Zırh +%30, blok şansı +%5; Sarsılmaz Bastion %25 daha sık kullanılır.', 'S armorPct=.30 blockChance=.05 ;; M knight_unbroken_bastion cdx=.75'],
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
        ['s12', '', 'Kalkan Kaldır: Yemin', 'Kalkan Kaldır bekleme −%15; depoladığı hasar +%25.', 'M knight_shield_block cdx=.85 p.store*=1.25'],
        ['s13', '', 'İntikam: Tehdit Taşkını', 'İntikam 5 Kararlılık ucuz; tehdit çarpanı +%20.', 'M knight_revenge cost=-5 p.threatMult*=1.2'],
        ['s15', 'A', 'Demir Duvar', 'Engellenen vuruşlar Kalkan Darbesi bekleme süresini 0.5 sn azaltır (1 sn bekleme).', 'T block icd=1 => cdr(knight_shield_bash,0.5)'],
        ['s15', 'B', 'Karşı Kılıç', 'Savuşturmadan sonra 3 sn vuruşların +%60 hasar verir.', 'T parry => buff(riposte_edge,3,{damagePct=.6})'],
        ['s17', 'A', 'Kararlı Nöbetçi', 'Kaynak yenilenmesi +%20; Kalkan Kaldır maliyeti −%20.', 'S resourceRegenPct=.20 ;; M knight_shield_block costx=.8'],
        ['s17', 'B', 'Şifa Siperi', 'Yemin Siperi\'nin kalkanı +%15.', 'M knight_ward_of_oath absx=1.15'],
        ['s18', '', 'Kışkırtma Ustası', 'Kışkırtma bekleme −2 sn, menzil +8 m.', 'M knight_provoke cd=-2 rng=+8'],
        ['s20', '', 'Kadim Bastion', 'Sarsılmaz Bastion bekleme −%15 ve 2 sn daha uzun sürer.', 'M knight_unbroken_bastion cdx=.85 sdur=bastion:+2'],
        ['s21', '', 'Geniş Moral Bozma', 'Moral Bozma yarıçap +4 m, laneti 2 sn daha uzun sürer.', 'M knight_challenge rad=+4 sdur=curse:+2'],
        ['s25', '', 'Kutsal Kalkan', 'Kalkan Darbesi hasarının yarısı kutsala dönüşür; hasar +%10.', 'M knight_shield_bash cv=holy:.5 dmgx=1.1'],
        ['s26', 'A', 'Güvenli Liman', 'Yemin Siperi kullanınca 12 m içindeki müttefikler de Yemin Siperi alır.', 'T cast:knight_ward_of_oath => st(near(12),oath_ward,8)'],
        ['s26', 'B', 'Yankılanan Nara', 'Meydan Okuma sonrası 5 sn blok miktarı +%15.', 'T cast:knight_challenge => buff(echo_roar,5,{blockAmount=.15})'],
        ['s27', '', 'Hüküm: Muhafız', 'Hücum +250 sabit tehdit verir, hasarı +%10.', 'M knight_charge p.threat+=250 dmgx=1.1'],
        ['s28', '', 'Sarsılmaz Nöbetçi', 'Maks. can +%8, blok şansı +%4. Blokların %15 şansla Kalkan Kaldır\'ı sıfırlar (6 sn bekleme).', 'S maxHpPct=.08 blockChance=.04 ;; T block ch=.15 icd=6 => rst(knight_shield_block)'],
        ['s29', '', 'Yeminli Kalkan', 'Savuşturma çevreye %120 kutsal patlama yapar ve +10 Kararlılık verir.', 'S guardGauge=20 ;; T parry => exp(1.2,3,holy) ; res(10)'],
        ['s30', 'A', 'Işığın Zırhı', 'Zırh +%20, alınan iyileştirme +%15; Yemin Siperi +1 şarj.', 'S armorPct=.20 healReceivedPct=.15 ;; M knight_ward_of_oath chg=+1'],
        ['s30', 'B', 'Ateşten Siper', 'Blok şansı +%6, diken +40; engellenen vuruşlar saldırgana %80 kutsal hasar yansıtır.', 'S blockChance=.06 thorns=40 ;; T block => dmg(.8,holy)'],
      ],
    },
    knight_blademaster: {
      palette: ['attackSpeed', 'holyDamagePct', 'critChance', 'meleeDamagePct', 'critDamage', 'finisherPct', 'str', 'damagePct', 'cdr', 'resourceGainPct', 'weaponArtPct', 'poiseDamagePct'],
      rows: [
        ['s02', 'A', 'Savaş Hızlanması', 'Yakın dövüş hasarı +%6; temel vuruşlar %15 şansla +6 Kararlılık verir.', 'S meleeDamagePct=.06 ;; T hit:@basic ch=.15 => res(6)'],
        ['s02', 'B', 'Ölümcül Hasat', 'Ölümcül Darbe hasarı +%15, kritik şansı +%10.', 'M knight_mortal_strike dmgx=1.15 crit=+.1'],
        ['s04', '', 'Keskin Darbe', 'Ölümcül Darbe sarsması +%30, menzili +0.5 m.', 'M knight_mortal_strike stgx=1.3 rng=+0.5'],
        ['s05', '', null, null, 'G knight_execute'],
        ['s09', 'A', 'Cellat Zırhı', 'Yakın dövüş hasarı +%5; Cellat Vuruşu sonrası 4 sn %12 hasar azaltma.', 'S meleeDamagePct=.05 ;; T cast:knight_execute => buff(execute_ward,4,{damageReductionPct=.12})'],
        ['s09', 'B', 'Savaşçı Atılışı', 'Hücum +10 Kararlılık verir.', 'T cast:knight_charge => res(10)'],
        ['s11', '', 'Geniş Girdap', 'Alan hasarı +%8; Çelik Girdap +%15 alan, +0.5 m menzil.', 'S aoePct=.08 ;; M knight_radiant_cleave radx=1.15 rng=+0.5'],
        ['s12', '', 'Girdap Hasadı', 'Çelik Girdap hasarı +%15, maliyeti 5 Kararlılık düşer.', 'M knight_radiant_cleave dmgx=1.15 cost=-5'],
        ['s13', '', 'Dev Ezme Çağrısı', 'Kritik hasarı +%10; Dev Ezme bekleme −%15, sarsması +%30.', 'S critDamage=.10 ;; M knight_colossus_smash cdx=.85 stgx=1.3'],
        ['s15', 'A', 'Ezme Ustası', 'Dev Ezme etkisi 3 sn uzar; temel vuruşlar %20 şansla +6 Kararlılık verir.', 'M knight_colossus_smash sdur=colossus:+3 ;; T hit:@basic ch=.2 => res(6)'],
        ['s15', 'B', 'Kılıç Fırtınası', 'Saldırı hızı +%8; temel zincir hasarı +%10.', 'S attackSpeed=.08 ;; M knight_basic dmgx=1.1'],
        ['s17', 'A', 'Uzun Uçuş', 'Savaş Avatarı 6 sn daha uzun sürer.', 'M knight_avatar sdur=avatar:+6'],
        ['s17', 'B', 'Çabuk Öfke', 'Kaynak kazancı +%20.', 'S resourceGainPct=.20'],
        ['s18', '', 'Çifte Hüküm', 'Kritik şansı +%1; Ölümcül Darbe %20 şansla yarım güçte ikinci kez vurur.', 'S critChance=.01 ;; T cast:knight_mortal_strike ch=.2 => echo(knight_mortal_strike,.5,.4)'],
        ['s20', '', 'Borazancı Kardeşliği', 'Savaş Avatarı ve Dev Ezme bekleme −%10.', 'M knight_avatar+knight_colossus_smash cdx=.9'],
        ['s21', '', 'Fırtına Alanı', 'Bıçak Fırtınası alanı +%10, hasarı +%25.', 'M knight_bladestorm dmgx=1.25 radx=1.1'],
        ['s25', '', 'Hücum Ustalığı', 'Yakın dövüş hasarı +%8; Hücum hasarı +%25, sarsması +%40.', 'S meleeDamagePct=.08 ;; M knight_charge dmgx=1.25 stgx=1.4'],
        ['s26', 'A', 'Savaş Feneri', 'Dev Ezme 10 m içindeki müttefikleri 6 sn Kutsanmış yapar.', 'T cast:knight_colossus_smash => st(near(10),blessed,6)'],
        ['s26', 'B', 'Yalnız Kılıç', 'Yakınında (40 m) müttefik yokken +%12 hasar.', 'T tick:1 if=solo => buff(lone_blade,2,{damagePct=.12})'],
        ['s27', '', 'Ezme Patlaması', 'Dev Ezme hedefin çevresinde %120 fiziksel patlama yapar.', 'T cast:knight_colossus_smash => exp(1.2,3.5,physical)'],
        ['s28', '', 'Hüküm Zinciri', 'Ölümcül Darbe sonrası 4 sn +%5 saldırı hızı yığar (en fazla 3).', 'T cast:knight_mortal_strike => buff(verdict_chain,4,{attackSpeed=.05},max=3)'],
        ['s29', '', 'Cellat Gözü', 'Kritik şansı +%4; kritik vuruşlar %25 şansla +5 Kararlılık verir.', 'S critChance=.04 ;; T crit ch=.25 => res(5)'],
        ['s30', 'A', 'Ölüm Kasırgası', 'Ölümcül Darbe hasarı +%30; kullanınca %15 şansla Üstün Vuruş sıfırlanır.', 'M knight_mortal_strike dmgx=1.3 ;; T cast:knight_mortal_strike ch=.15 => rst(knight_overpower)'],
        ['s30', 'B', 'Cellat Yemini', 'Canı <%35 düşmanlara +%40 hasar; öldürünce +10 Kararlılık.', 'S executeDamagePct=.40 ;; T kill => res(10)'],
      ],
    },
  },
};

export default data;
