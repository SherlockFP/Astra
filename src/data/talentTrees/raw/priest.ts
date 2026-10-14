// GENERATED from docs/GDD_TALENTS.*.json by tools/gen-talent-data.mjs — do not edit
// Source: docs/GDD_TALENTS.trees.json · class:priest + . Row = [slot, opt, name, desc, fx] (GDD_TALENTS §2.9).
import type { SlotId } from '../../../types/talents';
import type { SpecId } from '../../../types/v2';
import type { StatId } from '../../../types/stats';

export type RawRow = [slot: SlotId, opt: '' | 'A' | 'B', name: string | null, desc: string | null, fx: string];
export interface RawTree { palette: StatId[]; rows: RawRow[] }

const data: { class: RawTree; specs: Partial<Record<SpecId, RawTree>> } = {
  class: {
    palette: ['str', 'meleeDamagePct', 'maxHpPct', 'armorPct', 'blockChance', 'critChance', 'attackSpeed', 'holyDamagePct', 'resAll', 'ccReductionPct', 'staggerPct', 'resourceRegenPct'],
    rows: [
      ['s02', 'A', 'Kutsal Kalkan Gücü', 'Güç Kalkanı bekleme süresi −1 sn.', 'M priest_power_word_shield cd=-1'],
      ['s02', 'B', 'Huzurlu Yol', 'Hareket hızı +%8; Hızlı Şifa yazım süresi %10 kısalır.', 'S moveSpeedPct=.08 ;; M priest_flash_heal castx=.9'],
      ['s04', '', 'Kutsal Vuruş', 'Kutsal Ceza hasarı +%15.', 'M priest_smite dmgx=1.15'],
      ['s05', 'A', null, null, 'S resourceRegenPct=.15'],
      ['s05', 'B', null, null, 'S healingPct=.08'],
      ['s09', 'A', 'Kalkan Yenilemesi', 'Güç Kalkanı verdiğinde kendi canını %3 yenilersin.', 'T cast:priest_power_word_shield => heal(.03)'],
      ['s09', 'B', 'Son Umut', 'Canın %35 altına düşünce 60 sn bekleme ile maks. canının %15\'i kadar iyileşirsin.', 'T hurt if=hp<.35 icd=60 => heal(.15)'],
      ['s11', '', 'Hızlı Yenileme', 'Yenileme\'nin iyileştirme miktarı %20 artar.', 'M priest_renew p.hotCoef*=1.2'],
      ['s12', '', 'Şifa Hızı', 'Büyü hızı +%6.', 'S castSpeed=.06'],
      ['s13', '', 'Kutsal Ceza Gücü', 'Kutsal Ceza hasarı +%10, maliyeti −%10.', 'M priest_smite dmgx=1.1 costx=.9'],
      ['s15', 'A', 'Kutsal Işık', 'Kutsal hasar +%10.', 'S holyDamagePct=.1'],
      ['s15', 'B', 'Ruhani Huzur', 'Kritik şansı +%2.', 'S critChance=.02'],
      ['s17', 'A', 'Enerji Pınarı', 'Kaynak yenilenmesi +%20.', 'S resourceRegenPct=.2'],
      ['s17', 'B', 'İçsel Huzur', 'Yetenek maliyetleri −%10.', 'S costReductionPct=.1'],
      ['s18', '', 'Dinlenme Duası', 'Hızlı Şifa yazım süresi %15 kısalır.', 'M priest_flash_heal castx=.85'],
      ['s20', '', 'Tapınak Sırrı', 'Büyük yeteneklerin bekleme süresi %6 kısalır.', 'S majorCdrPct=.06'],
      ['s21', '', 'Psişik Yankı', 'Psişik Çığlık hasarı +%15, alanı +%20.', 'M priest_psychic_scream radx=1.2 dmgx=1.15'],
      ['s25', '', 'Uzun Sığınak', 'Güç Kalkanı 3 sn daha uzun sürer.', 'M priest_power_word_shield p.shieldSec+=3'],
      ['s26', 'A', 'Dayanıklı Ruh', 'Canın %50 altına düşünce 6 sn maks. canının %10\'u kadar kalkan kazanırsın (30 sn bekleme).', 'T hurt if=hp<.5 icd=30 => abs(.1,6)'],
      ['s26', 'B', 'Koruyucu Dua', 'Arındırma bekleme süresi 2 sn kısalır.', 'M priest_dispel cd=-2'],
      ['s27', '', 'Göksel Kalkan', 'Güç Kalkanı bekleme süresi %15 kısalır.', 'M priest_power_word_shield cdx=.85'],
      ['s28', '', 'Yorulmaz Beden', 'Maks. can +%8, kaçınma şansı +%2.', 'S maxHpPct=.08 dodgeChance=.02 ;; T lethal icd=90 => heal(.2)'],
      ['s29', '', 'Kutsal Akış', 'Hasar +%6; kritik vuruşlar müttefikini %3 iyileştirir.', 'S damagePct=.06 ;; T crit => healally(.03)'],
      ['s30', 'A', 'Kutsal Usta', 'Hasar +%10; Kutsal Ceza hasarı +%20.', 'S damagePct=.1 ;; M priest_smite dmgx=1.2'],
      ['s30', 'B', 'Gök Yolu', 'Hareket hızı +%8; Psişik Çığlık bekleme süresi %20 kısalır.', 'S moveSpeedPct=.08 ;; M priest_psychic_scream cdx=.8'],
    ],
  },
  specs: {},
};

export default data;
