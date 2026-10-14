/**
 * AE-4 (docs/kits/agile-evoker.md §4.1-§4.3): Ejderhasoy SpecDefs, merged into SPECS by data/specs.ts. WoW Midnight (12.0) Evoker:
 * Yıkım Nefesi (Devastation, ranged dps), Koruyucu Nefes (Preservation, healer), Yüceltme (Augmentation, support dps). All three are
 * Intellect specs; the weapon chain `evoker_basic` is the class chain for every spec (Koruyucu patches its damage x2.4 through `mods`).
 *
 * Spec `fx` rows are chance triggers read by StatCalc.collectFx -> ProcEngine (combat/Procs.ts):
 *   all three   chain finisher (evoker_basic_3): 6 % +1 Öz (pip essence), Yıkım only 1 % Öz Patlaması
 *   Yıkım       Yaşayan Alev 15 % Alev Tükenişi (burnout), Serbest Alev 25 % Öz Patlaması
 *   Koruyucu    Geri Dönüş 15 %, Yaşayan Alev 20 % Öz Patlaması
 *   Yüceltme    Öngörü 30 % Öz Patlaması
 * The deterministic grants (Ateş Nefesi +1 Öz Patlaması, Ejder Öfkesi, Merithra'nın Lütfu at rank >= 2, Terazi Eğimi) are in the behaviours.
 *
 * Mana (100-unit bar; class regen 5 / s, specs bring it to the doc's pace): Yıkım 1.2 / s (-3.8) vs ~0.9 / s spent, Yüceltme (5 - 4) x 1.2 =
 * 1.2 / s vs ~0.9 / s, Koruyucu (5 - 4) x 1.3 = 1.3 / s vs ~1.5 / s spent at 95 % efficiency (doc 4.2 d: 30 % of the bar left after 5 minutes).
 * Hero talents (Alevşekilci, Ölçekkomutanı, Zamanbekçisi) and the Bronz Kudret aura / battle res are not modelled here.
 */
import type { SpecDef, SpecId } from '../types/v2';

/** Finisher Öz (all specs): 6 % +1 Öz per Azur Süpürmesi hit (0.5 s apart at most, the chain pierces up to 3 enemies). */
const FINISHER_PIP = 'T hit:evoker_basic_3 ch=.06 icd=0.5 => pip(essence,1)';

const SPEC_LIST: SpecDef[] = [
  {
    id: 'evoker_devastation', classId: 'evoker', name: 'Yıkım Nefesi', role: 'dps', mainStat: 'int',
    desc: 'Menzilden ateş ve gizem yağdıran ejderha. Ateş Nefesi ve Ebedi Dalga\'yı tuşu basılı tutarak güçlendirirsin; her nefes bir Öz Patlaması verir ve Parçala ile Pyre bedavaya gelir. Yaşayan Alev dolgu büyüsüdür, Ejder Öfkesi 18 saniyelik patlama penceresidir.',
    stats: { castSpeed: 0.05, fireDamagePct: 0.10, resourceRegen: -3.8 },
    specials: [
      { id: 'trait_devastation', desc: 'Güçlendirilmiş nefesler: tuşu bırakmadan 0.67 / 1.33 / 2 saniyede üç kademe dolar; Süzül hareketi yavaşlatmaz. Ejder Öfkesi ve Terazi Eğimi son kademeyi bekletmeden verir.', params: { empower: 1 } },
    ],
    skills: ['evoker_living_flame', 'evoker_disintegrate', 'evoker_fire_breath', 'evoker_eternity_surge', 'evoker_pyre', 'evoker_hover', 'evoker_obsidian_scales', 'evoker_quell', 'evoker_shattering_star'],
    unlock: {
      evoker_living_flame: 1, evoker_disintegrate: 1, evoker_fire_breath: 1, evoker_eternity_surge: 10, evoker_pyre: 6,
      evoker_hover: 1, evoker_obsidian_scales: 15, evoker_quell: 10, evoker_shattering_star: 10,
    },
    majors: { m45: 'evoker_deep_breath', m90: 'evoker_dragonrage', m180: 'evoker_fury_of_aspects' },
    fx: [
      FINISHER_PIP,
      'T hit:evoker_basic_3 ch=.01 icd=0.5 => st(self,essence_burst,15)',
      'T cast:evoker_living_flame ch=.15 => st(self,burnout,10)',
      'T cast:evoker_unbound_flame ch=.25 => st(self,essence_burst,15)',
    ].join(' ;; '),
    mods: [],
    defaultBar: {
      lmb: 'evoker_basic', rmb: 'evoker_living_flame', q: 'evoker_disintegrate', e: 'evoker_fire_breath', r: 'evoker_eternity_surge',
      s1: 'evoker_pyre', s2: 'evoker_hover', s3: 'evoker_obsidian_scales', s4: 'evoker_quell',
      m45: 'evoker_deep_breath', m90: 'evoker_dragonrage', m180: 'evoker_fury_of_aspects',
    },
  },
  {
    id: 'evoker_preservation', classId: 'evoker', name: 'Koruyucu Nefes', role: 'healer', mainStat: 'int',
    desc: 'Zamanı ve yaşamı büken şifacı. Geri Dönüş ve Yankı ile ağ örer, Rüya Nefesi\'ni güçlendirip grubu konide iyileştirir, Zümrüt Çiçek ve Yeşil Kucaklayış ile yaralıya yetişir. Durgunluk üç şifayı saklayıp bedavaya yeniden bırakır; Zaman Genişlemesi tank kurtarır.',
    stats: { healingPct: 0.30, resourceRegenPct: 0.30, resourceRegen: -4, castSpeed: 0.05, threatPct: -0.4, damagePct: -0.40 },
    specials: [
      { id: 'trait_preservation', desc: 'Akıllı şifa: seçili, imleçteki ya da en yaralı müttefik iyileşir. Taşan şifanın %40\'ı hedefe kısa süreli kalkan olur. Yankı bir müttefikin sonraki şifasını %70 güçle tekrarlar.', params: { smartHeal: 1, overhealWard: 0.4 } },
    ],
    skills: [
      'evoker_living_flame', 'evoker_reversion', 'evoker_dream_breath', 'evoker_echo', 'evoker_emerald_blossom', 'evoker_verdant_embrace',
      'evoker_obsidian_scales', 'evoker_quell', 'evoker_rewind',
    ],
    unlock: {
      evoker_living_flame: 1, evoker_reversion: 10, evoker_dream_breath: 10, evoker_echo: 10, evoker_emerald_blossom: 10, evoker_verdant_embrace: 10,
      evoker_obsidian_scales: 15, evoker_quell: 10, evoker_rewind: 15,
    },
    majors: { m45: 'evoker_time_dilation', m90: 'evoker_stasis', m180: 'evoker_fury_of_aspects' },
    fx: [
      FINISHER_PIP,
      'T cast:evoker_reversion ch=.15 => st(self,essence_burst,15)',
      'T cast:evoker_living_flame ch=.20 => st(self,essence_burst,15)',
    ].join(' ;; '),
    mods: [
      // the weapon chain hits 2.4 times harder than the plain chain (0.82 coef/s, then x0.60 from damagePct -0.40)
      { skill: 'evoker_basic_1', patch: { damage: { coef: 0.24, type: 'frost' } } },
      { skill: 'evoker_basic_2', patch: { damage: { coef: 0.24, type: 'frost' } } },
      { skill: 'evoker_basic_3', patch: { damage: { coef: 0.34, type: 'frost' } } },
      // Yaşayan Alev: heal 1.5 on an ally, the Yıkım damage bolt on an enemy under the reticle
      {
        skill: 'evoker_living_flame',
        patch: {
          behavior: 'kit_heal', heal: { coef: 1.5 }, allyTarget: 'any', range: 30, tags: ['spell', 'fire', 'projectile', 'heal', 'builder'],
          desc: '1.6 saniyelik büyüyle seçili, imleçteki ya da en yaralı müttefiki %150 iyileştirir. İmleçte düşman varsa ona %100 ateş hasarlı bir ateş topu atar (canı %40\'ın altındaki müttefik önce iyileşir). Merithra\'nın Lütfu şifayı en yaralı 4 müttefike sıçratır. %2.5 Mana.',
          vfx: { cast: 'heal_burst', projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'heal', impact: 'fire_impact' },
        },
        params: { healBelow: 0.4, echoable: 1, bounce: 1 },
      },
    ],
    defaultBar: {
      lmb: 'evoker_basic', rmb: 'evoker_living_flame', q: 'evoker_reversion', e: 'evoker_dream_breath', r: 'evoker_echo',
      s1: 'evoker_emerald_blossom', s2: 'evoker_verdant_embrace', s3: 'evoker_obsidian_scales', s4: 'evoker_quell',
      m45: 'evoker_time_dilation', m90: 'evoker_stasis', m180: 'evoker_fury_of_aspects',
    },
  },
  {
    id: 'evoker_augmentation', classId: 'evoker', name: 'Yüceltme', role: 'dps', mainStat: 'int',
    desc: 'Müttefiklerini güçlendiren destek ejderha. Abanoz Kudret ve Öngörü en çok hasar veren iki dostunu büyütür, Çağların Nefesi onların hasarını biriktirip patlatır. Kendi Püskürme ve Yaşayan Alev ritmi Abanoz Kudret\'i canlı tutar; Ateş Nefesi ve Yer Sarsıntısı güçlendirilmiş saldırılarındır.',
    stats: { castSpeed: 0.05, resourceRegenPct: 0.20, resourceRegen: -4 },
    specials: [
      { id: 'trait_augmentation', desc: 'Zamanın Ustası: Abanoz Kudret ve Öngörü, son 20 saniyede en çok hasar veren iki müttefike gider (yalnızken ya da ikiliyken yanındakilere).', params: { topAllies: 2 } },
    ],
    skills: [
      'evoker_living_flame', 'evoker_eruption', 'evoker_ebon_might', 'evoker_prescience', 'evoker_fire_breath', 'evoker_hover',
      'evoker_obsidian_scales', 'evoker_quell',
    ],
    unlock: {
      evoker_living_flame: 1, evoker_eruption: 10, evoker_ebon_might: 10, evoker_prescience: 10, evoker_fire_breath: 1, evoker_hover: 1,
      evoker_obsidian_scales: 15, evoker_quell: 10,
    },
    majors: { m45: 'evoker_upheaval', m90: 'evoker_breath_of_eons', m180: 'evoker_fury_of_aspects' },
    fx: [
      FINISHER_PIP,
      'T cast:evoker_prescience ch=.30 => st(self,essence_burst,15)',
    ].join(' ;; '),
    mods: [
      // no heal half, no burnout: 0.75 fire and +0.25 Öz per cast
      { skill: 'evoker_living_flame', patch: { damage: { coef: 0.75, type: 'fire' }, pip: { id: 'essence', gain: 0.25 } } },
      // Ateş Nefesi is the s1 button of this spec: 3.40 at rank 1 (1.457 initial + the same burn, x2.333)
      { skill: 'evoker_fire_breath', patch: { defaultSlot: 's1', damage: { coef: 1.4571, type: 'fire' } } },
    ],
    defaultBar: {
      lmb: 'evoker_basic', rmb: 'evoker_living_flame', q: 'evoker_eruption', e: 'evoker_ebon_might', r: 'evoker_prescience',
      s1: 'evoker_fire_breath', s2: 'evoker_hover', s3: 'evoker_obsidian_scales', s4: 'evoker_quell',
      m45: 'evoker_upheaval', m90: 'evoker_breath_of_eons', m180: 'evoker_fury_of_aspects',
    },
  },
];

export const SPECS_KIT_EVOKER: Partial<Record<SpecId, SpecDef>> = Object.fromEntries(SPEC_LIST.map((s) => [s.id, s]));
