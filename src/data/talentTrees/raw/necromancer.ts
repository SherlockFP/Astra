// GENERATED from docs/GDD_TALENTS.*.json by tools/gen-talent-data.mjs — do not edit
// Source: docs/GDD_TALENTS.trees.json · class:necromancer + necromancer_summoner, necromancer_bone. Row = [slot, opt, name, desc, fx] (GDD_TALENTS §2.9).
import type { SlotId } from '../../../types/talents';
import type { SpecId } from '../../../types/v2';
import type { StatId } from '../../../types/stats';

export type RawRow = [slot: SlotId, opt: '' | 'A' | 'B', name: string | null, desc: string | null, fx: string];
export interface RawTree { palette: StatId[]; rows: RawRow[] }

const data: { class: RawTree; specs: Partial<Record<SpecId, RawTree>> } = {
  class: {
    palette: ['int', 'shadowDamagePct', 'physicalDamagePct', 'minionDamagePct', 'minionHpPct', 'dotPct', 'maxHpPct', 'castSpeed', 'critChance', 'resourceRegenPct', 'cdr', 'lifeSteal'],
    rows: [
      ['s02', 'A', 'Mezar Hızı', 'Hareket hızı +%6; İskelet Çağır bekleme −0.5 sn.', 'S moveSpeedPct=.06 ;; M necro_raise_skeleton cd=-0.5'],
      ['s02', 'B', 'Ruh Adımı', 'Hasar alınca %10 şansla 3 sn hareket hızı +%20 (6 sn bekleme).', 'T hurt ch=.1 icd=6 => buff(spirit_dash,3,{moveSpeedPct=.2})'],
      ['s04', '', 'Keskin Mızrak', 'Kemik Mızrağı hasarı +%15, menzil +4 m.', 'M necro_bone_spear dmgx=1.15 rng=+4'],
      ['s05', 'A', null, null, 'G necro_soul_snap'],
      ['s05', 'B', null, null, 'G necro_spirit_walk'],
      ['s09', 'A', 'Kemik Kalkanı', 'Kemik Zırhı kullanınca 10 sn maks. canının %10\'u kadar kalkan kazanırsın.', 'T cast:necro_bone_armor => abs(.1,10)'],
      ['s09', 'B', 'Ruh Direnci', 'Canın %35 altına düşünce %15 can yenilenir ve 15 m içindeki yoldaşlar 4 sn güçlenir (60 sn bekleme).', 'T hurt if=hp<.35 icd=60 => heal(.15) ; st(near(15),empower,4)'],
      ['s11', '', 'Hızlı Mezar', 'İskelet Çağır maliyeti −%20; yoldaş canı +%10.', 'M necro_raise_skeleton costx=.8 ;; S minionHpPct=.10'],
      ['s12', '', 'Geniş Patlama', 'Ceset Patlaması alanı +%15, hasarı +%15.', 'M necro_corpse_explosion radx=1.15 dmgx=1.15'],
      ['s13', '', 'Hapishane Ustası', 'Kemik Hapishanesi bekleme −3 sn, kök süresi +1 sn.', 'M necro_bone_prison cd=-3 sdur=root:+1'],
      ['s15', 'A', 'Lanet Ustası', 'Lanet: Çürüme alanı +%20, süresi +4 sn.', 'M necro_curse_decay radx=1.2 dur=+4'],
      ['s15', 'B', 'Kan Rahibi', 'Can çalma +%0.5; Kan Emişi iyileştirmesi +%25.', 'S lifeSteal=.005 ;; M necro_blood_siphon healx=1.25'],
      ['s17', 'A', 'Öz Pınarı', 'Öz yenilenmesi +%20.', 'S resourceRegenPct=.20'],
      ['s17', 'B', 'Ceset Toplayıcı', 'Öldürmeler %25 şansla +8 Öz verir.', 'T kill ch=.25 => res(8)'],
      ['s18', '', 'Lanet Ustalığı', 'Lanet: Çürüme hasarı +%25.', 'M necro_curse_decay dmgx=1.25'],
      ['s20', '', 'Mezar Zamanı', 'Büyük yetenek bekleme süreleri %6 daha hızlı azalır.', 'S majorCdrPct=.06'],
      ['s21', '', 'Uzun Emiş', 'Kan Emişi hasarı +%20, menzili +3 m.', 'M necro_blood_siphon dmgx=1.2 rng=+3'],
      ['s25', '', 'Kemik Zırhı Ustalığı', 'Kemik Zırhı +2 kalkan, bekleme −5 sn.', 'M necro_bone_armor p.armorStacks+=2 cd=-5'],
      ['s26', 'A', 'Ölüm Ordusu', 'Ölüler Ordusu kullanınca grup 8 sn güçlenir.', 'T cast:necro_army_of_the_dead => st(party,empower,8)'],
      ['s26', 'B', 'Koruyucu Kemik', 'Kemik Zırhı 10 m içindeki müttefikleri 4 sn güçlendirir.', 'T cast:necro_bone_armor => st(near(10),fortify,4)'],
      ['s27', '', 'Ordu Yankısı', 'Ölüler Ordusu bekleme −%15, +2 iskelet askeri çağırır.', 'M necro_army_of_the_dead cdx=.85 cnt=+2'],
      ['s28', '', 'Ölümsüz Beden', 'Maks. can +%10. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S maxHpPct=.10 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
      ['s29', '', 'Mezar Ritmi', 'Hasar +%6. Kritik vuruşlar 5 sn boyunca +%5 büyü hızı yığar (en fazla 4).', 'S damagePct=.06 ;; T crit => buff(grave_rhythm,5,{castSpeed=.05},max=4)'],
      ['s30', 'A', 'Kemik Efendisi', 'Fiziksel hasar +%20, gölge hasarı +%15.', 'S physicalDamagePct=.20 shadowDamagePct=.15'],
      ['s30', 'B', 'Ruh Efendisi', 'Yoldaş hasarı ve canı +%20; Ölüler Ordusu bekleme −%20.', 'S minionDamagePct=.20 minionHpPct=.20 ;; M necro_army_of_the_dead cdx=.8'],
    ],
  },
  specs: {
    necromancer_summoner: {
      palette: ['minionDamagePct', 'minionHpPct', 'shadowDamagePct', 'int', 'castSpeed', 'critChance', 'damagePct', 'maxHpPct', 'resourceRegenPct', 'dotPct', 'cdr', 'physicalDamagePct'],
      rows: [
        ['s02', 'A', 'Büyük Ordu', 'İskelet sınırı +1 artar.', 'X trait_summoner{skeletonCap=1}'],
        ['s02', 'B', 'Golem Çağrısı', 'Kemik Golemi bekleme −5 sn, hasarı +%20.', 'M necro_golem cd=-5 dmgx=1.2'],
        ['s04', '', 'Golem Kayası', 'Kemik Golemi hasarı +%15, sarsması +%30.', 'M necro_golem dmgx=1.15 stgx=1.3'],
        ['s05', '', null, null, 'G necro_command_army'],
        ['s09', 'A', 'Ordu Kalkanı', 'Aldığın hasarın %10\'u daha fazla yoldaşlarına dağılır.', 'X trait_summoner{damageToMinions=.10}'],
        ['s09', 'B', 'Ölümcül Dönüş', 'Ölen iskeletler %20 şansla yeniden ayağa kalkar.', 'X trait_summoner{skeletonRevive=.20}'],
        ['s11', '', 'Emir Gücü', 'Ordu: Hücum! hasarı +%25; kışkırtma 1 sn uzar.', 'M necro_command_army dmgx=1.25 sdur=taunt:+1'],
        ['s12', '', 'Hızlı Mezar', 'İskelet Çağır bekleme −0.5 sn, maliyeti −%20.', 'M necro_raise_skeleton cd=-0.5 costx=.8'],
        ['s13', '', 'Patlayan Ordu', 'Ceset Patlaması hasarı +%20, alanı +%10.', 'M necro_corpse_explosion dmgx=1.2 radx=1.1'],
        ['s15', 'A', 'Çılgınlık Ustası', 'Ölüm Çılgınlığı 4 sn daha uzun sürer.', 'M necro_sm_frenzy sdur=frenzy_minions:+4'],
        ['s15', 'B', 'Şövalye Ustası', 'Kemik Şövalyeleri 6 sn daha uzun kalır.', 'M necro_sm_bone_knights p.life+=6'],
        ['s17', 'A', 'Öz Pınarı', 'Öz yenilenmesi +%20.', 'S resourceRegenPct=.20'],
        ['s17', 'B', 'Ruh Hasadı', 'Yoldaşların öldürmeleri %20 şansla +6 Öz verir.', 'T kill:@minion ch=.2 => res(6)'],
        ['s18', '', 'Golem Nöbeti', 'Kemik Golemi bekleme −%15.', 'M necro_golem cdx=.85'],
        ['s20', '', 'Ordu Zamanı', 'Ölüm Çılgınlığı ve Kemik Şövalyeleri bekleme −%10.', 'M necro_sm_frenzy+necro_sm_bone_knights cdx=.9'],
        ['s21', '', 'Ölüler Ordusu Genişler', 'Ölüler Ordusu +2 asker çağırır, bekleme −8 sn.', 'M necro_army_of_the_dead cnt=+2 cd=-8'],
        ['s25', '', 'Lanet Gölgesi', 'Lanet: Çürüme alanı +%20; kullanınca 10 sn yoldaş hasarı +%10.', 'M necro_curse_decay radx=1.2 ;; T cast:necro_curse_decay => buff(curse_edge,10,{minionDamagePct=.10})'],
        ['s26', 'A', 'Ölüm Çobanı', 'Ölüler Ordusu kullanınca grup 8 sn güçlenir.', 'T cast:necro_army_of_the_dead => st(party,empower,8)'],
        ['s26', 'B', 'Kemik Kalkanı', 'Kemik Şövalyeleri 10 m içindeki müttefikleri 6 sn güçlendirir.', 'T cast:necro_sm_bone_knights => st(near(10),fortify,6)'],
        ['s27', '', 'Komuta Zinciri', 'Ordu: Hücum! bekleme −3 sn.', 'M necro_command_army cd=-3'],
        ['s28', '', 'Sonsuz Ordu', 'Yoldaş hasarı ve canı +%15. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S minionDamagePct=.15 minionHpPct=.15 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
        ['s29', '', 'Mezar Efendisi', 'Hasar +%6. Yoldaş öldürmeleri 6 sn boyunca +%4 yoldaş hasarı yığar (en fazla 5).', 'S damagePct=.06 ;; T kill:@minion => buff(grave_master,6,{minionDamagePct=.04},max=5)'],
        ['s30', 'A', 'Ordu Efendisi', 'Yoldaş hasarı +%25, canı +%20; Kemik Golemi bekleme −%20.', 'S minionDamagePct=.25 minionHpPct=.20 ;; M necro_golem cdx=.8'],
        ['s30', 'B', 'Ölüler Kralı', 'Gölge hasarı +%20, yoldaş hasarı +%15; Ordu: Hücum! hasarı +%20.', 'S shadowDamagePct=.20 minionDamagePct=.15 ;; M necro_command_army dmgx=1.2'],
      ],
    },
    necromancer_bone: {
      palette: ['physicalDamagePct', 'shadowDamagePct', 'castSpeed', 'critChance', 'critDamage', 'int', 'damagePct', 'resourceRegenPct', 'aoePct', 'dotPct', 'cdr', 'lifeSteal'],
      rows: [
        ['s02', 'A', 'Fırtına Ustası', 'Kemik Fırtınası maliyeti −%15, hasarı +%10.', 'M necro_bone_storm costx=.85 dmgx=1.1'],
        ['s02', 'B', 'Mızrak Fırtınası', 'Savaşta 3 sn\'de bir otomatik Kemik Mızrağı yankısı (%50 hasar) atılır.', 'T tick:3 if=inCombat => echo(necro_bone_spear,.5,.1)'],
        ['s04', '', 'Keskin Fırtına', 'Kemik Fırtınası yarıçapı +1 m, süresi +1 sn.', 'M necro_bone_storm rad=+1 dur=+1'],
        ['s05', '', null, null, 'G necro_blood_surge'],
        ['s09', 'A', 'Kan Kalkanı', 'Kan Dalgası sonrası 6 sn %12 hasar azaltma kazanırsın.', 'T cast:necro_blood_surge => buff(blood_ward,6,{damageReductionPct=.12})'],
        ['s09', 'B', 'Kemik Zırhı', 'Kemik Fırtınası sırasında 4 sn %10 hasar azaltma kazanırsın.', 'T cast:necro_bone_storm => buff(storm_ward,4,{damageReductionPct=.1})'],
        ['s11', '', 'Geniş Dalga', 'Kan Dalgası yarıçap +2 m, hasarı +%15.', 'M necro_blood_surge rad=+2 dmgx=1.15'],
        ['s12', '', 'Delici Kemik', 'Kemik Mızrağı +1 delme yapar, hasarı +%10.', 'M necro_bone_spear prc=+1 dmgx=1.1'],
        ['s13', '', 'Zincir Patlama', 'Ceset Patlaması hasarı +%20; zincir patlamalar %20 daha güçlü.', 'M necro_corpse_explosion dmgx=1.2 p.explChainMult*=1.2'],
        ['s15', 'A', 'Ruh Ustası', 'Kemik Ruhu hasarı +%20, bekleme −5 sn.', 'M necro_bn_bone_spirit dmgx=1.2 cd=-5'],
        ['s15', 'B', 'Lich Ustası', 'Lich Formu 5 sn daha uzun sürer.', 'M necro_bn_lich_form sdur=lich:+5'],
        ['s17', 'A', 'Öz Pınarı', 'Öz yenilenmesi +%20.', 'S resourceRegenPct=.20'],
        ['s17', 'B', 'Kemik Hasadı', 'Kemik Mızrağı vuruşları %10 şansla +4 Öz verir.', 'T hit:necro_bone_spear ch=.1 => res(4)'],
        ['s18', '', 'Hapishane Kemiği', 'Kemik Hapishanesi bekleme −3 sn, hasarı +%20.', 'M necro_bone_prison cd=-3 dmgx=1.2'],
        ['s20', '', 'Kemik Zamanı', 'Kemik Ruhu ve Lich Formu bekleme −%10.', 'M necro_bn_bone_spirit+necro_bn_lich_form cdx=.9'],
        ['s21', '', 'Emiş Ustası', 'Kan Emişi iyileştirmesi +%25, hasarı +%15.', 'M necro_blood_siphon healx=1.25 dmgx=1.15'],
        ['s25', '', 'Çürüme Lanetı', 'Lanet: Çürüme hasarı +%25.', 'M necro_curse_decay dmgx=1.25'],
        ['s26', 'A', 'Ölüm Çağrısı', 'Lich Formu kullanınca grup 6 sn güçlenir.', 'T cast:necro_bn_lich_form => st(party,empower,6)'],
        ['s26', 'B', 'Koruyucu Ruh', 'Kemik Ruhu kullanınca %5 can yenilenir.', 'T cast:necro_bn_bone_spirit => heal(.05)'],
        ['s27', '', 'Fırtına Yankısı', 'Kemik Fırtınası %15 şansla yarı güçte tekrar eder.', 'T cast:necro_bone_storm ch=.15 => echo(necro_bone_storm,.5,.5)'],
        ['s28', '', 'Kemik Yürek', 'Fiziksel hasar +%10, kritik şansı +%2. Ölümcül darbede %20 canla ayakta kalır, 1.5 sn dokunulmaz olursun (90 sn bekleme).', 'S physicalDamagePct=.10 critChance=.02 ;; T lethal icd=90 => heal(.2) ; st(self,invulnerable,1.5)'],
        ['s29', '', 'Kemik Ritmi', 'Hasar +%6, kritik hasarı +%15. Kritik vuruşlar 5 sn boyunca +%5 büyü hızı yığar (en fazla 4).', 'S damagePct=.06 critDamage=.15 ;; T crit => buff(bone_rhythm,5,{castSpeed=.05},max=4)'],
        ['s30', 'A', 'Kemik Hükümdarı', 'Fiziksel hasar +%25; Kemik Fırtınası hasarı +%25.', 'S physicalDamagePct=.25 ;; M necro_bone_storm dmgx=1.25'],
        ['s30', 'B', 'Lich Kralı', 'Gölge hasarı +%20, büyü hızı +%5; Lich Formu bekleme −%20.', 'S shadowDamagePct=.20 castSpeed=.05 ;; M necro_bn_lich_form cdx=.8'],
      ],
    },
  },
};

export default data;
