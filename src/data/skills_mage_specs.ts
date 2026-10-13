/**
 * GDD_TALENTS §1.3.3 mage spec skill rows (8 rows: Ateş / Buz / Gizem). OWNER: combat (T8).
 * Merged into SKILLS at the end of data/skills.ts (Object.assign). Numbers and params copy the doc table; the mechanics of
 * Sıcak Seri / Buz Parmakları / Gizem Yükü live in combat/specs/mage.ts (hooks read `def.params` and `def.tags`).
 *
 * Deviations from the table (recorded for the combat owner):
 * - `behavior` keys `bounce_projectile`, `burst_shot`, `target_status` are not in BEHAVIORS yet. behaviorFor falls back to
 *   the targeting default (projectile), so the rows cast as a single projectile / a volley until those behaviours exist.
 * - `mage_frozen_orb` uses the existing `orb` behaviour (pulse projectile) instead of `orb_pulse`: same 6 pulses in ~3 s.
 *   `endCoef` / `endRadius` are 0 so the closing burst deals no damage (cosmetic burst only).
 * - Presentation `scale` values and the `arcane_impact` / `ice_cast` / `arcane_cast` sound ids are dropped; the nearest
 *   existing ids are used (`frost_cast`, `frost_impact`, `spell_cast`).
 */
import type { SkillDef } from '../types/skills';

const I = (n: string) => `/assets/icons/${n}.svg`;

type Row = Partial<SkillDef> & Pick<SkillDef, 'id' | 'name' | 'desc' | 'icon' | 'anim' | 'targeting'>;

/** Fills the SkillDef defaults every mage row shares (class mage, unlock 99 = granted only by a tree node). */
function row(d: Row): SkillDef {
  return { classId: 'mage', unlockLevel: 99, cost: 0, cooldown: 0, castTime: 0, hitTime: 0.3, tags: [], ...d } as SkillDef;
}

export const MAGE_SPEC_SKILLS: Record<string, SkillDef> = {
  // ------------------------------------------------------------------ Ateş (mage_fire)
  mage_phoenix_flames: row({
    id: 'mage_phoenix_flames', name: 'Anka Alevleri', icon: I('skill-fire-wave'), spec: 'mage_fire',
    desc: 'Hedefe %190 ateş hasarı veren ve yakan bir alev fırlatırsın; alev en yakın yanan düşmana en fazla 2 kez sekip yanmayı yayar.',
    cost: 20, cooldown: 9, charges: 2, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.4, hitTime: 0.373,
    targeting: 'projectile', behavior: 'bounce_projectile', range: 26, speed: 30, radius: 0.4, count: 1, pierce: 0,
    damage: { coef: 1.9, type: 'fire' }, statuses: [{ status: 'burn', duration: 3, magnitude: 0.4 }],
    tags: ['offgcd', 'spell', 'projectile', 'fire'],
    vfx: { projectile: 'fire_projectile', impact: 'fire_burst' }, sfx: { cast: 'fire_cast', impact: 'fire_impact' },
    params: { bounces: 2, bounceRange: 6, bounceMult: 0.85, element: 1, end: 0.65, chain: 0.08, move: 0.15, stagger: 5, proc: 0.8, weight: 0, upper: 1, slow: 0.4 },
  }),
  mage_blazing_barrier: row({
    id: 'mage_blazing_barrier', name: 'Alev Bariyeri', icon: I('skill-firewall'), spec: 'mage_fire', unlockLevel: 10,
    desc: '10 saniye boyunca maks. canının %22\'si kadar kalkan kazanırsın; sana vuranlar yanar, kalkan kırılınca çevreye ateş patlar.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.8, hitTime: 0.3,
    targeting: 'self_buff', selfStatuses: [{ status: 'blazing_barrier', duration: 10 }],
    tags: ['major', 'defensive', 'fire', 'buff'],
    vfx: { cast: 'blazing_barrier' }, sfx: { cast: 'fire_cast' },
    params: { major: 45, absorbPct: 0.22, absorbW: 2.0, thornBurn: 0.6, breakNova: 2.0, breakRadius: 4, end: 0.7, chain: 0.1, move: 0.15, weight: 1 },
  }),

  // ------------------------------------------------------------------ Buz (mage_frost)
  mage_flurry: row({
    id: 'mage_flurry', name: 'Dondurucu Sağanak', icon: I('skill-ice-bolt'), spec: 'mage_frost',
    desc: 'Üç hızlı buz oku atarsın; her ok %80 hasar verir, hedefi üşütür ve %25 şansla Buz Parmağı kazandırır.',
    cost: 22, cooldown: 10, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 2.0, hitTime: 0.2,
    targeting: 'projectile', behavior: 'burst_shot', range: 26, speed: 38, radius: 0.3, count: 3, spread: 8, pierce: 0,
    damage: { coef: 0.8, type: 'frost' }, statuses: [{ status: 'chill', duration: 3, stacks: 1 }],
    tags: ['spell', 'projectile', 'frost'],
    vfx: { projectile: 'frost_projectile', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { burst: 3, gap: 0.18, fofChance: 0.25, element: 2, end: 0.9, chain: 0.1, move: 0.2, stagger: 2, proc: 0.5, weight: 0, upper: 1, slow: 0.4 },
  }),
  mage_frozen_orb: row({
    id: 'mage_frozen_orb', name: 'Donmuş Küre', icon: I('skill-frozen-orb'), spec: 'mage_frost', unlockLevel: 20, defaultSlot: 'm90',
    desc: 'Yavaş ilerleyen bir buz küresi salarsın: 3 saniyede 6 kez %110 buz hasarı verir, düşmanları üşütür ve Buz Parmağı kazandırabilir.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.6, hitTime: 0.5,
    targeting: 'projectile', behavior: 'orb', range: 26, speed: 8, radius: 0.9, count: 1, pierce: 99,
    damage: { coef: 1.1, type: 'frost', perTick: true },
    statuses: [{ status: 'chill', duration: 3, stacks: 1 }, { status: 'slow', duration: 1, magnitude: 0.4 }],
    tags: ['major', 'burst', 'frost'],
    vfx: { projectile: 'frost_projectile', impact: 'frost_burst' }, sfx: { cast: 'frost_cast', impact: 'frost_impact' },
    params: { major: 90, pulse: 0.5, pulses: 6, pulseCoef: 1.1, pulseRadius: 3.2, fofPerPulse: 0.25, endCoef: 0, endRadius: 0, endStagger: 0,
      end: 0.9, chain: 0.1, move: 0.2, weight: 2, element: 2 },
  }),

  // ------------------------------------------------------------------ Gizem (mage_arcane)
  mage_arcane_blast: row({
    id: 'mage_arcane_blast', name: 'Gizem Patlaması', icon: I('skill-arcane-missiles'), spec: 'mage_arcane', unlockLevel: 10,
    desc: '%240 gizem hasarı verirsin ve 1 Gizem Yükü kazanırsın. Her yük hasarı artırır ama mana maliyetini de artırır.',
    cost: 18, cooldown: 0, castTime: 0.9, anim: 'Spellcast_Shoot', animSpeed: 1.1, hitTime: 0.373,
    targeting: 'projectile', behavior: 'arcane_blast', range: 26, speed: 32, radius: 0.45, count: 1, pierce: 0,
    damage: { coef: 2.4, type: 'arcane' }, pip: { id: 'arcane', gain: 1 },
    tags: ['spell', 'projectile', 'arcane', 'builder'],
    vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
    params: { element: 3, end: 0.7, chain: 0.1, move: 0.2, stagger: 6, proc: 1, weight: 4, upper: 0 },
  }),
  // KIT PK-MAGE (docs/kits/casters-rogue.md §2a / §2e). Channel 2.0 s from press: the hit frame is 0.1 s in, so the channel
  // itself is 1.9 s. Waves at 0.1 / 0.5 / 0.9 / 1.3 / 1.7 s (params.tick 0.4). Haste does not stretch the wave spacing yet.
  // Berrak Zihin (clearcasting, ProcMod in procs_kit_mage.ts) makes it free and gives 0.60 per missile; the hardcast gives 0.36.
  mage_arcane_missiles: row({
    id: 'mage_arcane_missiles', name: 'Arkan Füzeler', icon: I('skill-arcane-missiles'), spec: 'mage_arcane', unlockLevel: 3,
    desc: 'İki saniye boyunca beş gizem füzesi yollarsın; her füze kavisli bir yolla hedefe gider ve hedef hareket etse de peşini bırakmaz. Berrak Zihin ile ücretsiz ve tam hasarlı; yoksa mana harcarsın ve hasar düşer. Kanalize ederken yürüyebilirsin (%50 hız).',
    cost: 10, cooldown: 0, castTime: 0, channel: 1.9, hitTime: 0.1, anim: 'Spellcasting', animSpeed: 1,
    targeting: 'projectile', behavior: 'homing_missiles', range: 30, speed: 22, radius: 0.3, count: 5, pierce: 0,
    damage: { coef: 0.6, type: 'arcane' },
    tags: ['spell', 'projectile', 'arcane', 'channel'],
    vfx: { projectile: 'arcane_projectile', impact: 'arcane_missile_hit', cast: 'cast_hands_arcane' },
    sfx: { cast: 'arcane_missile_launch', impact: 'arcane_missile_hit' },
    params: { tick: 0.4, waves: 5, element: 3, stagger: 2, proc: 0.5, slow: 0.5, upper: 0 },
  }),
  mage_arcane_barrage: row({
    id: 'mage_arcane_barrage', name: 'Gizem Barajı', icon: I('skill-arcane-explosion'), spec: 'mage_arcane',
    desc: 'Tüm Gizem Yüklerini harcayıp %180 + yük başına %90 gizem hasarı verirsin; harcanan her yük için 2 mana geri alırsın.',
    cost: 12, cooldown: 3, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.5, hitTime: 0.373,
    targeting: 'projectile', range: 30, speed: 45, radius: 0.4, count: 1, pierce: 0,
    damage: { coef: 1.8, type: 'arcane' }, pip: { id: 'arcane', consume: 'all', coefPerPip: 0.9 },
    tags: ['spell', 'projectile', 'arcane', 'spender'],
    vfx: { projectile: 'arcane_projectile', impact: 'arcane_burst' }, sfx: { cast: 'spell_cast' },
    params: { explode: 3, refundPerPip: 2, element: 3, end: 0.65, chain: 0.08, move: 0.15, stagger: 8, proc: 1, weight: 2 },
  }),
  mage_touch_of_magi: row({
    id: 'mage_touch_of_magi', name: 'Büyücü Dokunuşu', icon: I('skill-curse'), spec: 'mage_arcane', unlockLevel: 10, defaultSlot: 'm45',
    desc: 'Hedefi 8 saniye işaretlersin; verdiğin hasarın %25\'i depolanır ve süre bitince patlayarak geri verilir. Patlama +2 Gizem Yükü kazandırır.',
    cost: 0, cooldown: 45, castTime: 0, anim: 'Spellcast_Shoot', animSpeed: 1.8, hitTime: 0.373,
    targeting: 'projectile', behavior: 'target_status', range: 30, speed: 30, radius: 0.5, count: 1, pierce: 0,
    statuses: [{ status: 'touch_of_magi', duration: 8 }],
    tags: ['major', 'burst', 'arcane', 'mark'],
    vfx: { impact: 'mark_loop' }, sfx: { cast: 'spell_cast' },
    params: { major: 45, store: 0.25, storeCapW: 30, burstRadius: 4, pipOnBurst: 2, end: 0.6, chain: 0.1, move: 0.15, weight: 1 },
  }),
  mage_arcane_surge: row({
    id: 'mage_arcane_surge', name: 'Gizem Dalgalanması', icon: I('skill-arcane-orb'), spec: 'mage_arcane', unlockLevel: 20, defaultSlot: 'm90',
    desc: '12 saniye boyunca gizem hasarın %30 artar, mana yenilenmen üç katına çıkar ve Gizem Patlaması yarı maliyetle dökülür. Anında 40 mana kazanırsın.',
    cost: 0, cooldown: 90, castTime: 0, anim: 'Spellcast_Raise', animSpeed: 1.5, hitTime: 0.5,
    targeting: 'self_buff', selfStatuses: [{ status: 'arcane_surge', duration: 12 }],
    tags: ['major', 'burst', 'arcane', 'buff'],
    vfx: { cast: 'enrage_aura' }, sfx: { cast: 'spell_cast' },
    params: { major: 90, more: 1.3, regenMult: 3, blastCostMult: 0.5, manaFlat: 40, end: 0.9, chain: 0.1, move: 0.2, weight: 2 },
  }),
};
