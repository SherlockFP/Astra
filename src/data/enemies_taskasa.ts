/**
 * Taşkasa (`taskasa`) Mythic+ dungeon: the 12 trash / elite defs, the summoned Depremkıran Totemi, the six mech
 * proc entities (SP-15) and the five boss defs. Source: docs/dungeons/taskasa.md §4 (Trash), §5 (Bosses), §8.2.
 *
 * Built with the enemy kit (enemyKit.ts) through `def()` and the ability builders. Nothing here touches the global
 * ENEMIES / BOSSES registries; the dungeon wiring merges TASKASA_ENEMIES and TASKASA_BOSSES itself.
 * Status ids that are not in StatusId yet (fracture, void_infection) are left off the abilities; see the report for the list.
 */
import type { BossArena, BossDef, BossPhase, EnemyDef } from '../types/enemies';
import type { FamilyId } from '../types/v2';
import {
  A_ENEMY, A_FLY, A_GEN, A_KAYKIT, A_SPIDER, A_WOLF, KNIGHT_HIDE, R_CULT, R_GHOST, R_GOLEM, ROGUE_HIDE,
  aoe, bleed, bp, burn, charge, cone, custom, def, heal, line, mageHide, NOOP, onDeath, passive, proj, summonAb,
  type Spec,
} from './enemyKit';
import { CHAR, GEN, GENB, ITCH, MON, PROC } from './enemyModels';

// ---------------------------------------------------------------------------------------------------------------------
// resist profiles (§4.1); R_GOLEM / R_CULT / R_GHOST come from the kit
// ---------------------------------------------------------------------------------------------------------------------
const R_EARTHEN: EnemyDef['resist'] = { physical: 0.15, fire: 0.25, frost: 0.1, lightning: -0.1, shadow: 0.1 };
const R_VOID: EnemyDef['resist'] = { physical: 0.05, shadow: 0.5, holy: -0.25, arcane: 0.1 };

/** Spec plus the posture fields the kit's Spec does not carry yet. */
type TkSpec = Spec & {
  poise?: number;
  poiseRegen?: number;
  poiseDelay?: number;
  stanceBreakable?: boolean;
  family?: FamilyId;
};

/** `def()` plus the posture / family fields (set only when given). */
function mk(s: TkSpec): EnemyDef {
  const d = def(s);
  if (s.poise !== undefined) d.poise = s.poise;
  if (s.poiseRegen !== undefined) d.poiseRegen = s.poiseRegen;
  if (s.poiseDelay !== undefined) d.poiseDelay = s.poiseDelay;
  if (s.stanceBreakable !== undefined) d.stanceBreakable = s.stanceBreakable;
  if (s.family !== undefined) d.family = s.family;
  return d;
}

/** Mechanic entity (SP-15): a procedural body spawned by the boss scripts. Mirrors the kit's MECH() shape. */
function mech(id: string, name: string, proc: string, hp: number, o: Partial<TkSpec> = {}): EnemyDef {
  return mk({
    id, name, model: PROC(proc), scale: 1, role: 'support', rank: 'trash', hp, dmg: 0, speed: 0, radius: 0.8, aggro: 0, forces: 0,
    ccImmune: true, xp: 0,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' },
    basic: NOOP(`${id}_none`), ai: { summoned: true },
    ...o,
  });
}

/** Boss input: the def fields plus the boss-only ones (mirrors the kit's boss() helper, without the registry write). */
type BossIn = Omit<Spec, 'rank' | 'forces' | 'aggro'> & {
  aggro?: number;
  title: string;
  phases: BossPhase[];
  enrage: number;
  arenaR: number;
  intro?: string;
  death?: string;
  arena: BossArena;
  poise: number;
  poiseRegen?: number;
  poiseDelay?: number;
};

function bossDef(s: BossIn): BossDef {
  const base = def({ ...s, rank: 'boss', forces: 0, aggro: s.aggro ?? 18, leash: 0 });
  return {
    ...base,
    title: s.title,
    phases: s.phases,
    enrageTimer: s.enrage,
    arenaRadius: s.arenaR,
    introYell: s.intro,
    deathYell: s.death,
    music: 'boss',
    arena: s.arena,
    ccImmune: true,
    poise: s.poise,
    poiseRegen: s.poiseRegen,
    poiseDelay: s.poiseDelay,
  };
}

function index<T extends EnemyDef>(list: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const d of list) out[d.id] = d;
  return out;
}

// =====================================================================================================================
// 4.3 Trash and elite defs (12) + the summoned totem
// =====================================================================================================================
const TRASH_DEFS: EnemyDef[] = [
  // ---- swarm: Hurda Kemiricisi (forces 1, poise 6) ----
  mk({
    id: 'tk_hurda', name: 'Hurda Kemiricisi', model: MON('Spider'), scale: 0.45, tint: 0xb08a50, emissive: 0xffb030, role: 'swarm', rank: 'trash',
    hp: 0.4, dmg: 0.6, speed: 7.2, radius: 0.35, aggro: 9, forces: 1, poise: 6,
    anims: A_SPIDER, resist: R_EARTHEN, visual: { emissiveIntensity: 0.45, eyeEmissive: 0xffd54a },
    basic: cone('tk_hurda_gnaw', 'Kemirme', 1.3, 100, 1.3, 0.6, 'Spider_Attack', 0.42, { windup: 0.6 }),
    abilities: [
      aoe('tk_hurda_lunge', 'Hurda Atılışı', 'ground_aoe', 1.2, 5, 7, 0.65, 0.8, 'physical', 'Spider_Attack', 0.42,
        { initialCooldown: 3, telegraph: true, params: { target: 1, leap: 1 } }),
      onDeath(aoe('tk_hurda_shrapnel', 'Hurda Şarapneli', 'self_aoe', 1.6, 0, 0, 0.55, 0.35, 'physical', '', 0,
        { telegraph: true, vfx: 'hit_spark' })),
    ],
  }),
  // ---- caster: Dönmüş Sözcü (forces 4, poise 24) ----
  mk({
    id: 'tk_sozcu', name: 'Dönmüş Sözcü', model: CHAR('Mage'), scale: 1, tint: 0xb89060, role: 'caster', rank: 'trash',
    hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 4, poise: 24,
    anims: A_KAYKIT, resist: R_EARTHEN, ai: { kite: [9, 15] },
    visual: { hide: mageHide('2H_Staff'), eyeEmissive: 0xffd54a, runRef: 7 },
    basic: proj('tk_sozcu_shard', 'Taş Kıymığı', 16, 18, 2.4, 0.7, 1.0, 'physical', 'rock_projectile', 'Spellcast_Shoot', 0.3),
    abilities: [
      proj('tk_sozcu_gear', 'Susturan Dişli', 18, 18, 14, 2.0, 0.8, 'physical', 'bolt_projectile', 'Spellcast_Raise', 1.0,
        { initialCooldown: 6, castTime: 2.0, interruptible: true, kick: 2, dispel: 'silence', statuses: [{ status: 'silence', duration: 3 }], params: { target: 3 } }),
      cone('tk_sozcu_staff', 'Asa Darbesi', 2.4, 90, 6, 0.8, '2H_Melee_Attack_Slice', 0.3, { windup: 0.65 }),
    ],
  }),
  // ---- healer: Dökümlü Onarıcı (forces 4, poise 24) ----
  mk({
    id: 'tk_onarici', name: 'Dökümlü Onarıcı', model: CHAR('Rogue_Hooded'), scale: 1, tint: 0xa88050, role: 'healer', rank: 'trash',
    hp: 1.3, dmg: 0.9, speed: 5.2, radius: 0.5, aggro: 12, forces: 4, poise: 24,
    anims: A_KAYKIT, resist: R_EARTHEN, ai: { kite: [8, 14] },
    visual: { hide: ROGUE_HIDE, eyeEmissive: 0xffd54a, runRef: 7 },
    basic: proj('tk_onarici_bolt', 'Alaşım Okı', 16, 16, 2.6, 0.7, 0.9, 'physical', 'bolt_projectile', 'Throw', 0.4),
    abilities: [
      heal('tk_onarici_restore', 'Metal Onarımı', 2.0, 12, 0.4, 'Throw', 0.8, { kick: 2 }),
      proj('tk_onarici_alloy', 'Alaşım Kıvılcımı', 18, 16, 7, 1.5, 1.4, 'fire', 'fire_projectile', 'Throw', 0.8,
        { castTime: 1.5, interruptible: true, kick: 1 }),
    ],
  }),
  // ---- brute: Yeniden Görevlendirilmiş Yükleyici (forces 4, poise 36, golem family) ----
  mk({
    id: 'tk_yukleyici', name: 'Yeniden Görevlendirilmiş Yükleyici', model: GEN('golem_stone'), scale: 0.55, tint: 0x9a8466, emissive: 0xffb030,
    role: 'melee', rank: 'trash', hp: 1.5, dmg: 1.1, speed: 5.2, radius: 0.7, aggro: 10, forces: 4, poise: 36, family: 'golem',
    anims: A_GEN, resist: R_GOLEM, visual: { emissiveIntensity: 0.5, runRef: 4.5 },
    // hit 1 stacks `fracture` in the doc; not in StatusId yet, so the stack is left off
    basic: cone('tk_yukleyici_hit', 'Kırıcı Çift', 2.3, 100, 2.0, 1.0, 'Attack', 0.67, { windup: 0.7, params: { chain: 1, t2: 1.45, c2: 1.2 } }),
    abilities: [
      aoe('tk_yukleyici_pounce', 'Ezici Atılış', 'ground_aoe', 3, 14, 11, 1.2, 4.5, 'physical', 'Attack', 0.67,
        { initialCooldown: 5, perilous: true, telegraph: true, params: { target: 1, minRange: 5, leap: 1 } }),
      cone('tk_yukleyici_shove', 'Omuz Darbesi', 3, 60, 12, 1.6, 'Attack2', 0.57,
        { initialCooldown: 6, windup: 0.86, knockback: 4, telegraph: true }),
    ],
  }),
  // ---- caster: Boşluğa Bağlı Uluyan (forces 5, poise 24) ----
  mk({
    id: 'tk_uluyan', name: 'Boşluğa Bağlı Uluyan', model: ITCH('centipede'), scale: 0.9, tint: 0x7a50b8, emissive: 0x7a3cff, role: 'caster',
    rank: 'trash', hp: 1.1, dmg: 1.1, speed: 5.4, radius: 0.6, aggro: 12, forces: 5, poise: 24,
    anims: A_WOLF, resist: R_VOID, ai: { kite: [8, 14] }, visual: { emissiveIntensity: 0.6, glow: 0x7a3cff },
    basic: proj('tk_uluyan_spit', 'Boşluk Fışkırması', 15, 16, 2.4, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Bite', 0.3),
    abilities: [
      aoe('tk_uluyan_wail', 'Delici Çığlık', 'self_aoe', 12, 12, 13, 2.2, 1.8, 'shadow', 'Threat', 1.0,
        { castTime: 2.2, interruptible: true, kick: 2, vfx: 'shadow_burst' }),
      aoe('tk_uluyan_burst', 'Boşluk Patlaması', 'ground_aoe', 4, 16, 9, 1.5, 1.4, 'shadow', 'Threat', 0.8,
        { castTime: 1.5, initialCooldown: 4, params: { target: 1 } }),
    ],
  }),
  // ---- caster flyer: Korkunç Boşluk Ruhu (forces 5, poise 14, ghost) ----
  mk({
    id: 'tk_ruh', name: 'Korkunç Boşluk Ruhu', model: MON('Ghost'), scale: 0.8, tint: 0x7a3cff, role: 'caster', rank: 'trash',
    hp: 1.1, dmg: 1.0, speed: 5.0, radius: 0.5, aggro: 11, forces: 5, flying: true, poise: 14,
    anims: A_FLY, resist: R_GHOST, ai: { kite: [8, 14] }, visual: { opacity: 0.7, eyeEmissive: 0xb080ff, hoverBob: 0.1 },
    basic: proj('tk_ruh_touch', 'Ruh Dokunuşu', 14, 18, 2.2, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Punch', 0.33),
    abilities: [
      aoe('tk_ruh_fear', 'Uluyan Korku', 'self_aoe', 18, 18, 16, 2.0, 0, 'shadow', 'No', 0.6,
        { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 6, dispel: 'fear', statuses: [{ status: 'fear', duration: 3 }], vfx: 'shadow_burst', sfx: 'boss_cast' }),
      line('tk_ruh_dive', 'Ruh Dalışı', 8, 1.6, 9, 0.9, 1.0, 'shadow', 'Punch', 0.33, { initialCooldown: 4, vfx: 'shadow_burst' }),
    ],
  }),
  // ---- caster: Lanetli Yürek İstilacısı (forces 5, poise 24) ----
  mk({
    id: 'tk_istilaci', name: 'Lanetli Yürek İstilacısı', model: CHAR('Mage'), scale: 1, tint: 0x6a4a90, role: 'caster', rank: 'trash',
    hp: 1.2, dmg: 1.0, speed: 4.9, radius: 0.55, aggro: 12, forces: 5, poise: 24,
    anims: A_KAYKIT, resist: R_VOID, ai: { kite: [9, 15] },
    visual: { hide: mageHide('1H_Wand'), eyeEmissive: 0x9a5cff, runRef: 7 },
    basic: proj('tk_istilaci_bolt', 'Boşluk Oku', 16, 18, 2.4, 0.7, 1.0, 'shadow', 'shadow_projectile', 'Spellcast_Shoot', 0.3),
    // the arc's `void_infection` (10 s shadow DoT, dispellable) is not in StatusId yet; the hit stays
    abilities: [
      proj('tk_istilaci_arc', 'Yay Boşluk', 20, 20, 12, 2.0, 1.4, 'shadow', 'shadow_projectile', 'Spellcast_Raise', 1.0,
        { castTime: 2.0, interruptible: true, kick: 2, initialCooldown: 5, params: { target: 1 } }),
    ],
  }),
  // ---- caster summoner: Lanetli Taş Şekillendirici (forces 5, poise 24) ----
  mk({
    id: 'tk_sekillendirici', name: 'Lanetli Taş Şekillendirici', model: MON('Goblin'), scale: 0.85, tint: 0x9a8870, role: 'caster', rank: 'trash',
    hp: 1.2, dmg: 1.0, speed: 5.0, radius: 0.5, aggro: 12, forces: 5, poise: 24,
    anims: A_ENEMY, resist: R_EARTHEN, ai: { kite: [9, 15] },
    basic: proj('tk_sekil_pebble', 'Taş Mermisi', 15, 16, 2.4, 0.7, 1.0, 'physical', 'rock_projectile', 'Attack', 0.37),
    abilities: [
      proj('tk_sekil_bolt', 'Taş Oku', 18, 18, 9, 1.8, 2.0, 'physical', 'rock_projectile', 'Attack', 0.37,
        { castTime: 1.8, interruptible: true, kick: 2, initialCooldown: 3 }),
      summonAb('tk_sekil_totem', 'Depremkıran Totemi', 'tk_totem', 1, 22, 'Attack', 0.37,
        { initialCooldown: 8, castTime: 1.2, windup: 1.2, interruptible: false, params: { radius: 5 } }),
    ],
  }),
  // ---- summoned support: Depremkıran Totemi (0 forces, no posture) ----
  mk({
    id: 'tk_totem', name: 'Depremkıran Totemi', model: PROC('earth_totem'), scale: 1, role: 'support', rank: 'trash',
    hp: 0.6, dmg: 1.0, speed: 0, radius: 0.7, aggro: 0, forces: 0, ccImmune: true, xp: 0, stanceBreakable: false,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Death' },
    ai: { summoned: true, stationary: true }, basic: NOOP('tk_totem_none'),
    abilities: [
      aoe('tk_totem_burst', 'Deprem Patlaması', 'self_aoe', 12, 12, 99, 7.0, 7.0, 'physical', 'Idle', 0,
        { initialCooldown: 0, castTime: 7.0, interruptible: false, perilous: true, params: { suicide: 1 } }),
    ],
  }),
  // ---- elite shield tank: Lanetli Dökümcü Onur Muhafızı (forces 8, poise 160) ----
  mk({
    id: 'tk_onur', name: 'Lanetli Dökümcü Onur Muhafızı', model: CHAR('Knight'), scale: 1.0, tint: 0x9a8666, role: 'tank', rank: 'elite',
    hp: 3.0, dmg: 1.4, speed: 5.6, radius: 0.7, aggro: 11, forces: 8, poise: 160,
    anims: { ...A_KAYKIT, idle: 'Idle_Combat' }, resist: R_CULT,
    visual: { hide: KNIGHT_HIDE.filter((n) => n !== '1H_Sword' && n !== 'Round_Shield'), eyeEmissive: 0xffa030, runRef: 7 },
    basic: cone('tk_onur_slash', 'Kılıç Üçlüsü', 2.6, 100, 2.6, 1.0, '1H_Melee_Attack_Slice_Horizontal', 0.3,
      { windup: 0.7, params: { chain: 2, t2: 1.4, c2: 1.0, t3: 2.7, c3: 1.6 } }),
    abilities: [
      passive('tk_onur_stance', 'Kalkan Duruşu', { arc: 120, reduce: 0.5, poiseReduce: 0.5 }),
      charge('tk_onur_stampede', 'Kalkan Hücumu', 12, 14, 1.1, 2.4, 'Block_Attack', 0.4,
        { initialCooldown: 6, shape: { type: 'line', length: 12, width: 2 }, statuses: [{ status: 'stun', duration: 1.5 }], params: { minRange: 4, dash: 0.7 } }),
      cone('tk_onur_bash', 'Kalkan Patlatması', 3, 70, 15, 1.4, 'Block_Attack', 0.4,
        { initialCooldown: 8, windup: 0.8, telegraph: true, knockback: 3, params: { interrupt: 1 } }),
    ],
  }),
  // ---- elite giant tank: Kaya Ezici (forces 10, poise 220, CC immune) ----
  mk({
    id: 'tk_ezici', name: 'Kaya Ezici', model: MON('Giant'), scale: 1.05, tint: 0x9a7e66, role: 'tank', rank: 'elite',
    hp: 6.0, dmg: 1.9, speed: 4.4, radius: 1.1, aggro: 10, forces: 10, ccImmune: true, poise: 220,
    anims: A_ENEMY, resist: R_GOLEM,
    basic: cone('tk_ezici_smash_basic', 'Ezme ve Sırt', 3.4, 110, 2.8, 1.0, 'Attack', 0.47, { windup: 0.7, params: { chain: 1, t2: 1.45, c2: 1.2 } }),
    abilities: [
      aoe('tk_ezici_rock', 'Kaya Fırlat', 'ground_aoe', 3.5, 16, 8, 1.2, 1.8, 'physical', 'Attack', 0.47,
        { initialCooldown: 3, params: { target: 1, ramp: 0.25, rampMax: 6 } }),
      aoe('tk_ezici_eruption', 'Granit Patlaması', 'self_aoe', 7, 7, 24, 2.5, 3.5, 'physical', 'Attack', 0.47,
        { initialCooldown: 12, castTime: 2.5, perilous: true, vfx: 'ground_slam' }),
      aoe('tk_ezici_stomp', 'Yer Tepmesi', 'ground_aoe', 4.5, 10, 20, 1.1, 2.6, 'physical', 'Attack', 0.47,
        { initialCooldown: 10, telegraph: true, statuses: [{ status: 'stun', duration: 1 }], params: { target: 0, leap: 1 } }),
    ],
  }),
  // ---- elite golem tank: Döküm Yükleyici (forces 10, poise 150, golem family, CC immune) ----
  mk({
    id: 'tk_dokum_yukleyici', name: 'Döküm Yükleyici', model: GEN('golem_stone'), scale: 0.85, tint: 0x5a5048, emissive: 0xff7a10,
    role: 'tank', rank: 'elite', hp: 4.5, dmg: 1.8, speed: 4.0, radius: 1.2, aggro: 10, forces: 10, ccImmune: true, poise: 150, family: 'golem',
    anims: A_GEN, resist: { ...R_GOLEM, fire: 0.9 }, visual: { emissiveIntensity: 0.55, runRef: 3.4 },
    basic: cone('tk_dl_scoop', 'Kepçe Üçlüsü', 3.2, 100, 2.8, 1.0, 'Attack', 0.67,
      { windup: 0.7, params: { chain: 2, t2: 1.4, c2: 1.0, t3: 2.9, c3: 2.2 } }),
    abilities: [
      line('tk_dl_cannon', 'Lav Topu', 20, 2.4, 10, 1.6, 2.6, 'fire', 'Attack2', 0.57, { initialCooldown: 5, vfx: 'fire_burst' }),
      aoe('tk_dl_mortar', 'Erimiş Havan', 'ground_aoe', 2.5, 18, 12, 1.4, 0.8, 'fire', 'Attack2', 0.57,
        { initialCooldown: 8, statuses: [burn(0.3, 8)], params: { target: 1, count: 2, persist: 6, persistCoef: 0.6, tick: 1 } }),
    ],
  }),
  // ---- elite melee leaper: Boşluğa Bağlı Yağmacı (forces 9, poise 120) ----
  mk({
    id: 'tk_yagmaci', name: 'Boşluğa Bağlı Yağmacı', model: MON('Demon'), scale: 1.05, tint: 0x6a4a9a, emissive: 0x7a3cff, role: 'melee', rank: 'elite',
    hp: 4.0, dmg: 1.7, speed: 5.8, radius: 0.8, aggro: 11, forces: 9, poise: 120,
    anims: A_ENEMY, resist: R_VOID, visual: { emissiveIntensity: 0.5, eyeEmissive: 0xb080ff },
    basic: cone('tk_yag_claw_basic', 'Boşluk Pençe Çifti', 2.8, 100, 2.4, 1.2, 'Attack', 0.37,
      { windup: 0.75, damage: { coef: 1.2, type: 'shadow' }, params: { chain: 1, t2: 1.5, c2: 1.2 } }),
    abilities: [
      cone('tk_yag_shadowclaw', 'Gölge Pençesi', 4, 60, 11, 3.4, 'Attack', 0.37,
        { initialCooldown: 5, windup: 1.2, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 3.4, type: 'shadow' }, statuses: [bleed(1, 0.25, 8)] }),
      aoe('tk_yag_outburst', 'Boşluk Taşkını', 'self_aoe', 9, 9, 15, 1.6, 1.6, 'shadow', 'Attack', 0.37,
        { initialCooldown: 8, vfx: 'shadow_burst', params: { once: 1 } }),
      aoe('tk_yag_leap', 'Boşluk Sıçrayışı', 'ground_aoe', 2.5, 10, 16, 0.95, 2.0, 'shadow', 'Attack2', 0.37,
        { initialCooldown: 7, telegraph: true, statuses: [{ status: 'stun', duration: 1 }], params: { target: 1, leap: 1, delay: 1.35 } }),
    ],
  }),
];

// =====================================================================================================================
// SP-15 mech proc entities (flying / blocker flags as the row says; `invulnerable` has no field and is dropped)
// =====================================================================================================================
const MECH_DEFS: EnemyDef[] = [
  mech('tk_proc_volatile_spike', 'Sivri Taş', 'volatile_spike', 1, { radius: 0.7, visual: { blocker: 0.7 }, ai: { summoned: true, stationary: true } }),
  mech('tk_proc_crystal_shard', 'Kristal Kıymığı', 'crystal_shard', 3, { radius: 1.0, visual: { blocker: 1.0 }, ai: { summoned: true, stationary: true } }),
  mech('proc_unstable_fragment', 'Kararsız Parça', 'unstable_fragment', 0.02, { radius: 0.5, flying: true, visual: { spin: 1.5 } }),
  mech('proc_scrap_cube', 'Hurda Küpü', 'scrap_cube', 99, { radius: 1.0, speed: 22 }),
  mech('proc_magma_blob', 'Erimiş Damla', 'magma_blob', 0.3, { radius: 0.6, speed: 5 }),
  mech('proc_void_rift', 'Boşluk Yarığı', 'void_rift', 1, { radius: 1.0, tint: 0x7a3cff }),
];

/** The 12 trash / elite defs, tk_totem and the six proc_* mech entities. */
export const TASKASA_ENEMIES: Record<string, EnemyDef> = index<EnemyDef>([...TRASH_DEFS, ...MECH_DEFS]);

// =====================================================================================================================
// 5. Bosses (definition parts only; the scripts live in src/ai/bosses/taskasa.ts)
// =====================================================================================================================
const SEDA_KIT = ['seda_smash', 'seda_spikes', 'seda_beams', 'seda_sweep', 'seda_dive'];
const SKAR_KIT = ['skar_smash', 'skar_crash', 'skar_shell', 'skar_charge'];
const DORLITA_KIT = ['dorlita_hammer', 'dorlita_cannon', 'dorlita_crescendo', 'dorlita_leap'];
const BROKK_KIT = ['brokk_scrap_song', 'brokk_molten', 'brokk_vents', 'brokk_flurry', 'brokk_slag'];
const EIRICH_COMBAT = ['eirich_void_claw', 'eirich_leap', 'eirich_grasp', 'eirich_corruption', 'eirich_reckoning', 'eirich_unbridled'];

export const TASKASA_BOSSES: Record<string, BossDef> = index<BossDef>([
  // ---- 5.1 Otomat Seda (E.D.N.A.) ----
  bossDef({
    id: 'boss_seda', name: 'Otomat Seda', title: 'Çekirdeğin Nöbetçisi', model: GENB('lav_golemi'), scale: 0.9, tint: 0xb8c4cc, role: 'melee',
    hp: 53, dmg: 2.3, speed: 3.8, radius: 1.8, enrage: 240, arenaR: 28, poise: 800, poiseRegen: 0.08, poiseDelay: 4, loot: 'loot_tk_b1',
    anims: A_GEN, resist: { ...R_GOLEM, fire: 0.5 }, visual: { runRef: 3.8 },
    basic: cone('seda_stomp', 'Çift Basış', 5, 100, 3.2, 1.0, 'Attack', 0.67, { windup: 0.7, telegraph: true, params: { chain: 1, t2: 1.45, c2: 1.2 } }),
    abilities: [
      // seismic_echo (30 s magic DoT) is not in StatusId yet; the hit stays
      cone('seda_smash', 'Sismik Ezme', 6.5, 70, 18, 4.2, 'Attack2', 0.57, { initialCooldown: 7, windup: 1.4, telegraph: true, tankBuster: true, parryable: false }),
      custom('seda_spikes', 'Kararsız Sivri Taşlar', 30, 11, 1.2, 'Cast', { sfx: 'boss_cast', params: { impact: 0.8 } }),
      custom('seda_beams', 'Kırılan Işın', 24, 6, 1.0, 'Cast', { sfx: 'boss_cast', params: { impact: 0.6 } }),
      custom('seda_sweep', 'Lens Taraması', 30, 17, 1.1, 'Cast', { sfx: 'boss_cast', params: { impact: 0.8 } }),
      custom('seda_dive', 'Çekirdek Atılışı', 40, 22, 1.2, 'Attack', { sfx: 'boss_cast', params: { impact: 1.0, leap: 1 } }),
      custom('seda_shatter', 'Yer Parçalayıcı', 999, 9999, 3.5, 'Cast', { castTime: 3.5, interruptible: false, sfx: 'boss_roar', params: { impact: 2.0 } }),
      // phase-2 state flag (energy x1.5, beams +1), driven by the script through onEnter
      custom('seda_overclock', 'Aşırı Yük', 999, 9999, 0, 'Cast', { interruptible: false, params: { passive: 1 } }),
    ],
    phases: [
      bp('p1', 1.01, SEDA_KIT),
      bp('p2', 0.4, SEDA_KIT, { yell: 'AŞIRI YÜK UYARISI.' }),
    ],
    intro: 'SİSTEM UYANDI. İZİNSİZ GİRİŞ TESPİT EDİLDİ.', death: 'Çekirdek... durduruluyor...',
    arena: { cx: 144, cz: 134, w: 66, h: 48, homeX: 144, homeZ: 122 },
  }),
  // ---- 5.2 Kristal Golem Skarmorak ----
  bossDef({
    id: 'boss_skarmorak', name: 'Kristal Golem Skarmorak', title: 'Çatlak Kristalinin Kölesi', model: GENB('buzul_devi'), scale: 1.0,
    tint: 0x5a9a98, emissive: 0x3fe0c8, role: 'melee',
    hp: 70, dmg: 2.4, speed: 3.6, radius: 2.0, enrage: 270, arenaR: 26, poise: 900, loot: 'loot_tk_b2',
    anims: A_GEN, resist: { ...R_GOLEM, shadow: 0.3 }, visual: { emissiveIntensity: 0.6, runRef: 3.6 },
    basic: cone('skar_slam', 'Kristal Üçlü', 5.5, 100, 3.4, 1.0, 'Attack', 0.67,
      { windup: 0.8, telegraph: true, params: { chain: 2, t2: 1.55, c2: 1.0, t3: 2.95, c3: 1.8 } }),
    abilities: [
      cone('skar_smash', 'Kristal Ezme', 7, 80, 999, 4.0, 'Attack2', 0.57, { initialCooldown: 9999, windup: 1.4, telegraph: true, tankBuster: true, parryable: false }),   // cast by the sequence
      custom('skar_crash', 'Kararsız Çarpma', 999, 9999, 2.2, 'Cast', { sfx: 'boss_cast', params: { impact: 1.0 } }),
      custom('skar_shell', 'Güçlendirilmiş Kabuk', 999, 9999, 1.0, 'Cast', { sfx: 'boss_roar', params: { channel: 22, loop: 1 } }),
      custom('skar_charge', 'Kristal Boğası', 36, 20, 1.2, 'Attack2', { sfx: 'boss_roar', params: { impact: 1.0 } }),
      // shard-death reaction (raid circle); script-triggered, never selected by the AI
      custom('skar_eruption', 'Kristal Patlaması', 999, 9999, 0, 'Cast', { params: { passive: 1 } }),
    ],
    phases: [
      bp('p1', 1.01, SKAR_KIT),
      bp('p2', 0.35, SKAR_KIT, { yell: '*Kristaller çığlık atıyor!*' }),
    ],
    intro: '*Kristal çatırdıyor ve gürlüyor.*', death: '*Çatlak sessizce kapanıyor...*',
    arena: { cx: 260, cz: 132, w: 50, h: 50, homeX: 260, homeZ: 124 },
  }),
  // ---- 5.3 Sözcü Dorlita (tank mech) ----
  bossDef({
    id: 'boss_dorlita', name: 'Sözcü Dorlita', title: 'Usta Makinist', model: MON('Giant'), scale: 1.5, tint: 0x9a7a60, emissive: 0xff7a10,
    role: 'tank', hp: 38, dmg: 2.5, speed: 4.0, radius: 1.6, enrage: 300, arenaR: 22, poise: 700, loot: 'loot_tk_b3',
    anims: A_ENEMY, resist: { ...R_GOLEM, fire: 0.9 }, visual: { emissiveIntensity: 0.4, runRef: 4 },
    basic: cone('dorlita_slam', 'Mekanik Üçlü', 5.5, 100, 3.6, 1.0, 'Attack', 0.47,
      { windup: 0.8, telegraph: true, params: { chain: 2, t2: 1.55, c2: 1.0, t3: 2.95, c3: 1.8 } }),
    abilities: [
      cone('dorlita_hammer', 'Eriyik Çekiç', 6, 90, 16, 4.2, 'Attack', 0.47,
        { initialCooldown: 6, windup: 1.3, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.2, type: 'fire' }, statuses: [burn(0.4, 6)] }),
      custom('dorlita_cannon', 'Lav Topu', 14, 12, 2.0, 'Attack', { sfx: 'boss_cast', params: { impact: 0.5 } }),
      custom('dorlita_crescendo', 'Kızgın Kreşendo', 38, 28, 3.0, 'Attack', { castTime: 3.0, sfx: 'boss_roar', params: { impact: 2.0 } }),
      custom('dorlita_leap', 'Fırın Atılışı', 34, 16, 1.2, 'Attack', { sfx: 'boss_roar', params: { impact: 1.0, leap: 1 } }),
    ],
    phases: [bp('p1', 1.01, DORLITA_KIT)],
    intro: 'Brokk, ateşi yak! Tek parça çıkan olmasın!', death: 'Brokk... ben... sustum...',
    arena: { cx: 24, cz: 136, w: 42, h: 42, homeX: 26, homeZ: 128 },
  }),
  // ---- 5.3 Sözcü Brokk (caster, kited) ----
  bossDef({
    id: 'boss_brokk', name: 'Sözcü Brokk', title: 'Usta Makinist', model: CHAR('Mage'), scale: 1.1, tint: 0xc8a070, role: 'caster',
    hp: 38, dmg: 2.0, speed: 4.6, radius: 1.0, enrage: 300, arenaR: 22, poise: 350, loot: 'loot_tk_b3',
    anims: A_KAYKIT, resist: R_CULT, ai: { kite: [10, 16] },
    visual: { hide: mageHide('2H_Staff'), eyeEmissive: 0xffd54a, runRef: 7 },
    basic: proj('brokk_bolt', 'Kor Oku', 16, 40, 2.5, 0.8, 0.8, 'fire', 'fire_projectile', 'Spellcast_Shoot', 0.3, { sfx: 'fire_cast' }),
    abilities: [
      custom('brokk_scrap_song', 'Hurda Şarkısı', 36, 10, 2.5, 'Spellcast_Raise', { sfx: 'boss_cast', params: { impact: 1.0 } }),
      custom('brokk_molten', 'Erimiş Metal', 36, 12.5, 2.2, 'Spellcast_Long', { castTime: 2.2, interruptible: true, kick: 2, sfx: 'fire_cast', params: { impact: 1.5 } }),
      custom('brokk_vents', 'Egzoz Delikleri', 38, 20, 2.0, 'Spellcast_Summon', { sfx: 'boss_cast', params: { impact: 1.0 } }),
      // usable only with a player within 4 m: the range field, not a param
      custom('brokk_flurry', 'Örs Üçlüsü', 8, 5, 1.0, '2H_Melee_Attack_Slice', { range: 4, params: { impact: 0.3, chain: 2, t2: 1.45, c2: 0.9, t3: 2.75, c3: 1.6 } }),
      // ranged tank buster: a telegraphed beam fired at the tank from the kite distance (the flurry only reaches 4 m)
      custom('brokk_slag', 'Erimiş Hüzme', 26, 12, 1.4, 'Spellcast_Shoot', { tankBuster: true, telegraph: true, sfx: 'fire_cast', params: { impact: 1.2 } }),
    ],
    phases: [bp('p1', 1.01, BROKK_KIT)],
    intro: 'Örsün sesini duyuyor musun? Seni dövmek için çalıyor!', death: 'Dorlita... bitir onları...',
    arena: { cx: 24, cz: 136, w: 42, h: 42, homeX: 18, homeZ: 122 },
  }),
  // ---- 5.4 Başsözcü Eirich (final) ----
  bossDef({
    id: 'boss_eirich', name: 'Başsözcü Eirich', title: 'Boşluğun Son Sözcüsü', model: GENB('golge_rahibesi'), scale: 1.0, tint: 0x6a5a7a, emissive: 0x7a3cff,
    role: 'melee', hp: 100, dmg: 2.5, speed: 4.6, radius: 1.6, enrage: 360, arenaR: 38, poise: 1000, loot: 'loot_tk_b4',
    anims: A_GEN, resist: { ...R_VOID, physical: 0.15 }, visual: { emissiveIntensity: 0.6, runRef: 4.6 },
    basic: cone('eirich_claw', 'Boşluk Üçlüsü', 5.5, 100, 3.8, 1.0, 'Attack', 0.5,
      { windup: 0.75, telegraph: true, params: { chain: 2, t2: 1.5, c2: 1.0, t3: 2.85, c3: 2.0 } }),
    abilities: [
      // void_mark (+2 stacks on hit) is not in StatusId yet; the hit stays
      cone('eirich_void_claw', 'Boşluk Pençesi', 7.5, 60, 15, 4.0, 'Attack2', 0.5,
        { initialCooldown: 8, windup: 1.3, telegraph: true, tankBuster: true, parryable: false, damage: { coef: 4.0, type: 'shadow' } }),
      custom('eirich_corruption', 'Boşluk Yozlaşması', 55, 0.5, 2.0, 'Cast', { castTime: 2.0, sfx: 'boss_cast', params: { impact: 1.5 } }),
      custom('eirich_reckoning', 'Entropik Hesaplaşma', 45, 20, 2.0, 'Cast', { castTime: 2.0, sfx: 'boss_cast', params: { impact: 1.5 } }),
      custom('eirich_unbridled', 'Dizginsiz Boşluk', 28, 12, 2.4, 'Cast', { sfx: 'boss_roar', params: { impact: 2.4 } }),
      custom('eirich_leap', 'Boşluk Sıçrayışı', 34, 26, 1.2, 'Attack2', { sfx: 'boss_roar', params: { impact: 1.0, leap: 1 } }),
      custom('eirich_grasp', 'Boşluk Kavrayışı', 42, 30, 1.2, 'Attack2', { perilous: true, sfx: 'boss_cast', params: { impact: 1.0 } }),
      custom('eirich_rift_surge', 'Yarık Dalgası', 999, 9999, 1.0, 'Cast', { sfx: 'boss_roar' }),
      custom('eirich_collapse', 'Boşluk Çöküşü', 999, 9999, 1.5, 'Cast', { sfx: 'boss_roar' }),
    ],
    phases: [
      bp('p1', 1.01, EIRICH_COMBAT),
      bp('p2', 0.5, [], { yell: 'Çatlağı duyuyor musunuz? Her fısıltı bir kapı!', ability: 'eirich_rift_surge' }),
      bp('p3', 0.499, EIRICH_COMBAT),
      bp('p4', 0.35, [], { yell: 'Kasa açılıyor! Sözcüler... bana gelin!', ability: 'eirich_rift_surge' }),
      bp('p5', 0.349, EIRICH_COMBAT),
      bp('p6', 0.15, EIRICH_COMBAT, { yell: 'BOŞLUK İSTİYOR... VE ALACAK!', ability: 'eirich_collapse' }),
    ],
    intro: 'Taşın sesi kesildi. Boşluk konuşuyor, ve ben dinliyorum.', death: 'Ses... yeniden... sessizlik... teşekkürler...',
    arena: { cx: 144, cz: 36, w: 90, h: 66, homeX: 144, homeZ: 28 },
  }),
]);

/** Every id this file defines (trash, elite, totem, mech and bosses), for content checks. */
export const TASKASA_ENEMY_IDS: string[] = [
  ...Object.keys(TASKASA_ENEMIES),
  ...Object.keys(TASKASA_BOSSES),
];
