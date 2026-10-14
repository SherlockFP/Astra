import type { DamageType } from '../types/common';
import type { StatusDef, StatusId } from '../types/skills';
import { TALENT_STATUSES } from './statuses_talents';
// KIT PK-0 (docs/kits/casters-rogue.md §h): empty kit tables until the class packages fill them (merged at the end of this file).
import { STATUSES_KIT_MAGE, STATUS_RULES_KIT_MAGE } from './statuses_kit_mage';
import { STATUSES_KIT_ROGUE, STATUS_RULES_KIT_ROGUE } from './statuses_kit_rogue';
import { STATUSES_KIT_WARLOCK, STATUS_RULES_KIT_WARLOCK } from './statuses_kit_warlock';
import { STATUSES_KIT_PLATE, STATUS_RULES_KIT_PLATE } from './statuses_kit_plate';
// WP-02 (Keşiş / Okçu): kit statuses of the monk and archer packages.
import { STATUSES_KIT_MONK, STATUS_RULES_KIT_MONK } from './statuses_kit_monk';
import { STATUSES_KIT_ARCHER, STATUS_RULES_KIT_ARCHER } from './statuses_kit_archer';
import { WATCHER_STATUSES } from './watchers';

/**
 * OWNER: combat module. A StatusDef for every StatusId (GDD_SYSTEMS 1.8) + extra runtime rules (STATUS_RULES).
 *
 * Stat modifiers (`StatusDef.stats`) convention:
 *   - statuses with `perMag` rule: the numbers are PER UNIT of `magnitude` (slow: moveSpeedPct -1 x magnitude 0.3 = -30%).
 *   - all others: the numbers are per stack (chill: -10% move/attack speed per stack).
 * The effective modifier is always multiplied by the status' stacks (perMag statuses use stacks = 1 unless stated).
 */
const I = (n: string) => `/assets/icons/${n}.svg`;

/**
 * Kirlenme (Metin tier 5-6 rot). 1% of MAX HP per second per stack (ticks every 0.5 s, see StatusEffects.tick), max 5 stacks.
 * NON-LETHAL: ticks never take the owner below 25% max HP. No attacker dps snapshot is needed: apply it as a plain
 * StatusApply `{ status: 'kirlenme', duration, stacks }` (stacks 1..5). Exported so ai/metin.ts can use the same numbers.
 */
export const KIRLENME_MAX_STACKS = 5;
export const KIRLENME_MAX_HP_PCT_PER_SEC = 0.01;
export const KIRLENME_HP_FLOOR_PCT = 0.25;

export const STATUSES: Partial<Record<StatusId, StatusDef>> = {
  // ---- crowd control ----
  stun: { id: 'stun', name: 'Sersemleme', icon: I('debuff-stun'), kind: 'debuff', cc: true, vfx: 'stun_stars', dispellable: false },
  slow: { id: 'slow', name: 'Yavaşlama', icon: I('debuff-slow'), kind: 'debuff', cc: false, stats: { moveSpeedPct: -1 }, dispellable: true },
  root: { id: 'root', name: 'Kök Salma', icon: I('debuff-root'), kind: 'debuff', cc: true, dispellable: true },
  freeze: { id: 'freeze', name: 'Donma', icon: I('debuff-freeze'), kind: 'debuff', cc: true, vfx: 'freeze_loop' },
  knockdown: { id: 'knockdown', name: 'Havaya Kaldırma', icon: I('debuff-stun'), kind: 'debuff', cc: true },
  silence: { id: 'silence', name: 'Susturma', icon: I('debuff-silence'), kind: 'debuff', cc: true, dispellable: true },
  fear: { id: 'fear', name: 'Korku', icon: I('debuff-fear'), kind: 'debuff', cc: true, dispellable: true },
  blind: { id: 'blind', name: 'Körlük', icon: I('debuff-blind'), kind: 'debuff', cc: false, dispellable: true },
  taunt: { id: 'taunt', name: 'Kışkırtma', icon: I('debuff-marked'), kind: 'debuff', cc: false },

  // ---- damage over time / debuffs ----
  burn: { id: 'burn', name: 'Yanma', icon: I('debuff-burn'), kind: 'debuff', dotType: 'fire', vfx: 'burn_loop', dispellable: true },
  bleed: { id: 'bleed', name: 'Kanama', icon: I('debuff-bleed'), kind: 'debuff', dotType: 'physical', maxStacks: 5, dispellable: true },
  poison: { id: 'poison', name: 'Zehir', icon: I('debuff-poison'), kind: 'debuff', dotType: 'poison', maxStacks: 10, vfx: 'poison_loop', dispellable: true },
  chill: { id: 'chill', name: 'Üşüme', icon: I('debuff-chill'), kind: 'debuff', maxStacks: 5, stats: { moveSpeedPct: -0.1, attackSpeed: -0.1 }, dispellable: true },
  shock: { id: 'shock', name: 'Çarpılma', icon: I('debuff-shock'), kind: 'debuff', maxStacks: 3, vfx: 'shock_loop', dispellable: true },
  curse: { id: 'curse', name: 'Zayıflama', icon: I('debuff-curse'), kind: 'debuff', stats: { damagePct: -0.2 }, vfx: 'curse_loop', dispellable: true },
  sunder: { id: 'sunder', name: 'Savunmasız', icon: I('debuff-armor-break'), kind: 'debuff', dispellable: true },

  // ---- buffs ----
  shield: { id: 'shield', name: 'Kalkan', icon: I('buff-absorb'), kind: 'buff', vfx: 'shield_bubble', dispellable: true },
  haste: { id: 'haste', name: 'Hız', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 1, attackSpeed: 0.6, castSpeed: 0.6 }, vfx: 'haste_trail', dispellable: true },
  enrage: { id: 'enrage', name: 'Kudurma', icon: I('buff-strength'), kind: 'buff', stats: { attackSpeed: 0.75 }, vfx: 'enrage_aura', dispellable: true },
  regen: { id: 'regen', name: 'Yenilenme', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop', dispellable: true },
  fortify: { id: 'fortify', name: 'Tahkimat', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 1 }, dispellable: true },
  invulnerable: { id: 'invulnerable', name: 'Dokunulmaz', icon: I('buff-invulnerable'), kind: 'buff', vfx: 'shield_bubble' },
  stealth: { id: 'stealth', name: 'Gizlenme', icon: I('buff-stealth'), kind: 'buff' },
  empower: { id: 'empower', name: 'Güçlenme', icon: I('buff-strength'), kind: 'buff', vfx: 'buff_aura', dispellable: true },
  banner: { id: 'banner', name: 'Savaş Sancağı', icon: I('buff-aura'), kind: 'buff', stats: { armorPct: 0.2, resourceRegen: 1.5 }, vfx: 'buff_aura' },
  blessed: { id: 'blessed', name: 'Kutsanmış', icon: I('buff-blessing'), kind: 'buff', stats: { damageReductionPct: 0.25, attackSpeed: 0.2 }, vfx: 'buff_aura' },
  // PM-00a retune (plate-melee 3b): -30 % damage taken added to the 8 % lifesteal.
  bloodrage: { id: 'bloodrage', name: 'Kan Hiddeti', icon: I('buff-lifesteal'), kind: 'buff', stats: { lifeSteal: 0.08, damageReductionPct: 0.30 }, vfx: 'enrage_aura', defaultDuration: 8 },
  venom: { id: 'venom', name: 'Ölümcül Zehir', icon: I('debuff-poison'), kind: 'buff', stats: { poisonDamagePct: 0.5 } },
  ambush: { id: 'ambush', name: 'Pusu', icon: I('buff-crit'), kind: 'buff' },
  balance: { id: 'balance', name: 'Element Dengesi', icon: I('buff-mana-regen'), kind: 'buff', vfx: 'buff_aura' },
  windrunner: { id: 'windrunner', name: 'Rüzgâr Koşucusu', icon: I('buff-haste'), kind: 'buff', stats: { moveSpeedPct: 0.15, attackSpeed: 0.15, castSpeed: 0.15 }, vfx: 'haste_trail' },
  veil: { id: 'veil', name: 'Gölge Peçesi', icon: I('buff-crit'), kind: 'buff', stats: { critChance: 0.1 } },
  dancer: { id: 'dancer', name: 'Gölge Dansı', icon: I('buff-stealth'), kind: 'buff' },

  // ---- Mythic+ affix statuses ----
  bolstered: { id: 'bolstered', name: 'Güçlendirilmiş', icon: I('affix-bolstering'), kind: 'buff', maxStacks: 20, stats: { damagePct: 0.2 } },
  raging: { id: 'raging', name: 'Öfkeli', icon: I('affix-raging'), kind: 'buff', stats: { damagePct: 0.5 }, vfx: 'enrage_aura' },
  bursting: { id: 'bursting', name: 'Patlayan', icon: I('affix-bursting'), kind: 'debuff', maxStacks: 99, dotType: 'true' },
  necrotic: { id: 'necrotic', name: 'Nekrotik', icon: I('affix-necrotic'), kind: 'debuff', maxStacks: 99, vfx: 'necrotic_hit' },
  grievous: { id: 'grievous', name: 'Ağır Yara', icon: I('affix-grievous'), kind: 'debuff', maxStacks: 1, dotType: 'true' },
  inspiring: { id: 'inspiring', name: 'İlham Verici', icon: I('affix-inspiring'), kind: 'buff', vfx: 'inspiring_aura' },
  fortified_aura: { id: 'fortified_aura', name: 'Tahkim Edilmiş', icon: I('affix-fortified'), kind: 'buff', stats: { damagePct: 0.3 } },
  tyrannical_aura: { id: 'tyrannical_aura', name: 'Zalim', icon: I('affix-tyrannical'), kind: 'buff', stats: { damagePct: 0.4 } },

  // ---- Metin rot (tier 5-6) ----
  kirlenme: { id: 'kirlenme', name: 'Kirlenme', icon: I('debuff-curse'), kind: 'debuff', dotType: 'shadow', maxStacks: KIRLENME_MAX_STACKS, vfx: 'curse_loop', dispellable: true },

  // ---- misc ----
  iframes: { id: 'iframes', name: 'Kaçış', icon: I('buff-invulnerable'), kind: 'buff', hidden: true },
  potion_cd: { id: 'potion_cd', name: 'İksir Bekleme', icon: I('item-potion-health'), kind: 'debuff' },
  act_slow: { id: 'act_slow', name: 'Saldırı', icon: I('buff-strength'), kind: 'debuff', stats: { moveSpeedPct: -1 }, hidden: true },
  act_root: { id: 'act_root', name: 'Saldırı', icon: I('buff-strength'), kind: 'debuff', hidden: true },
  // ---- Taşkasa (SP-21, docs/dungeons/taskasa.md §5 / §9): boss and mechanic statuses ----
  seismic_echo: { id: 'seismic_echo', name: 'Sismik Yankı', icon: I('debuff-bleed'), kind: 'debuff', dotType: 'physical', dispellable: true, defaultDuration: 30 },
  seismic_ward: { id: 'seismic_ward', name: 'Sismik Kalkan', icon: I('buff-absorb'), kind: 'buff', defaultDuration: 6 },
  earth_fracture: { id: 'earth_fracture', name: 'Yer Çatlağı', icon: I('debuff-armor-break'), kind: 'debuff', dotType: 'physical', maxStacks: 8, defaultDuration: 8 },
  unstable_energy: { id: 'unstable_energy', name: 'Kararsız Enerji', icon: I('buff-crit'), kind: 'buff', dotType: 'shadow', maxStacks: 6, defaultDuration: 15 },
  void_mark: { id: 'void_mark', name: 'Boşluk İşareti', icon: I('debuff-marked'), kind: 'debuff', maxStacks: 4, defaultDuration: 20 },
  void_corruption: { id: 'void_corruption', name: 'Boşluk Yozlaşması', icon: I('debuff-curse'), kind: 'debuff', dotType: 'shadow', maxStacks: 12, vfx: 'curse_loop', defaultDuration: 12 },
};

// GDD_TALENTS (T0): the 13 talent statuses (compile-only stub until T8 / T9 fill data/statuses_talents.ts).
Object.assign(STATUSES, TALENT_STATUSES);

/**
 * GDD_V2 §0.3 statuses (WP5). `stats` are per stack (stacks default 1). Absorbs use the `shield` status (Actor.statuses.absorb):
 * the named status here is the HUD marker. Majors and spec skills apply these ids; numbers follow the doc table.
 */
const V2_STATUSES: Partial<Record<StatusId, StatusDef>> = {
  guard: { id: 'guard', name: 'Siper', icon: I('buff-defense'), kind: 'buff', hidden: true },
  riposte: { id: 'riposte', name: 'Karşı Vuruş Hazır', icon: I('buff-crit'), kind: 'buff' },
  guard_broken: { id: 'guard_broken', name: 'Siper Kırıldı', icon: I('debuff-stun'), kind: 'debuff', cc: true },
  critbuff: { id: 'critbuff', name: 'Kritik Gücü', icon: I('buff-crit'), kind: 'buff' },
  // PM-00a retune (plate-melee 2b): 6 s; blockAmount +0.25 kept.
  shield_block: { id: 'shield_block', name: 'Kalkan Kaldır', icon: I('buff-defense'), kind: 'buff', stats: { blockAmount: 0.25 }, vfx: 'shield_bubble', defaultDuration: 6 },
  oath_ward: { id: 'oath_ward', name: 'Yemin Siperi', icon: I('buff-absorb'), kind: 'buff', vfx: 'shield_bubble' },
  bastion: { id: 'bastion', name: 'Sarsılmaz Bastion', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.40 }, vfx: 'shield_bubble', defaultDuration: 8 },
  aegis: { id: 'aegis', name: "Yemin Aegis'i", icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.25 }, vfx: 'buff_aura' },
  // PM-00a retune (plate-melee 3b / 4b): +13 % damage reduction per stack, max 3 stacks, 7 s.
  iron_stance: { id: 'iron_stance', name: 'Demir Duruş', icon: I('buff-defense'), kind: 'buff', maxStacks: 3, defaultDuration: 7, stats: { damageReductionPct: 0.13 }, vfx: 'enrage_aura' },
  blood_shield: { id: 'blood_shield', name: 'Kan Zırhı', icon: I('buff-absorb'), kind: 'buff', vfx: 'enrage_aura' },
  // PM-00a retune (plate-melee 4b): -25 % damage taken, CC immune, 8 s, no max-HP bonus.
  last_stand: { id: 'last_stand', name: 'Son Direniş', icon: I('buff-defense'), kind: 'buff', stats: { damageReductionPct: 0.25 }, vfx: 'enrage_aura', defaultDuration: 8 },
  rally: { id: 'rally', name: 'Toplayıcı Kükreme', icon: I('buff-strength'), kind: 'buff', stats: { maxHpPct: 0.15 }, vfx: 'enrage_aura' },
  zeal: { id: 'zeal', name: 'Gayret', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.30 }, vfx: 'buff_aura' },
  wings: { id: 'wings', name: 'Hüküm Kanatları', icon: I('buff-blessing'), kind: 'buff', stats: { critChance: 0.20, moveSpeedPct: 0.15 }, vfx: 'buff_aura' },
  // PM-00a retune (plate-melee 3b): +20 % crit chance, +50 % rage generation (rule resGain), no damage / healing malus.
  carnage: { id: 'carnage', name: 'Katliam Çılgınlığı', icon: I('buff-strength'), kind: 'buff', stats: { critChance: 0.20 }, vfx: 'enrage_aura' },
  icy_veins: { id: 'icy_veins', name: 'Ayaz Damarları', icon: I('buff-mana-regen'), kind: 'buff', stats: { castSpeed: 0.30 }, vfx: 'buff_aura' },
  combustion: { id: 'combustion', name: 'Yanış', icon: I('buff-strength'), kind: 'buff', vfx: 'buff_aura' },
  shadow_blades: { id: 'shadow_blades', name: 'Gölge Bıçakları', icon: I('buff-crit'), kind: 'buff', stats: { costReductionPct: 0.30 }, vfx: 'buff_aura' },
  shadow_veil_cd: { id: 'shadow_veil_cd', name: 'Ölümcül Gölge Dansı', icon: I('buff-stealth'), kind: 'buff' },
  clarity: { id: 'clarity', name: 'Kadim Berraklık', icon: I('buff-mana-regen'), kind: 'buff', stats: { castSpeed: 0.30 }, vfx: 'buff_aura' },
  dawn_hot: { id: 'dawn_hot', name: 'Şafak Işığı', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  renew: { id: 'renew', name: 'Yenilenme Işığı', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  overheal_ward: { id: 'overheal_ward', name: 'Taşan Şifa', icon: I('buff-absorb'), kind: 'buff' },
  brew_zone: { id: 'brew_zone', name: 'Mucize Karışım', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  elixir_regen: { id: 'elixir_regen', name: 'Hayat İksiri', icon: I('buff-regen'), kind: 'buff', vfx: 'heal_loop' },
  hero_haste: { id: 'hero_haste', name: 'Kurt Narası', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.30, castSpeed: 0.30, moveSpeedPct: 0.10 }, vfx: 'haste_trail' },
  sated: { id: 'sated', name: 'Yorgun', icon: I('debuff-slow'), kind: 'debuff' },
  weakness_chain: { id: 'weakness_chain', name: 'Sömürü', icon: I('buff-crit'), kind: 'buff', maxStacks: 5, stats: { damagePct: 0.04 } },
  shielded_poise: { id: 'shielded_poise', name: 'Duruş Zırhı', icon: I('buff-defense'), kind: 'buff', hidden: true },
  marked_crit: { id: 'marked_crit', name: 'Kritik Fırsatı', icon: I('debuff-marked'), kind: 'debuff' },
  armored: { id: 'armored', name: 'Zırhlı', icon: I('buff-defense'), kind: 'buff', hidden: true },
  cursed_zone: { id: 'cursed_zone', name: 'Lanet Alanı', icon: I('debuff-curse'), kind: 'debuff', hidden: true },
};
Object.assign(STATUSES, V2_STATUSES);

export const getStatus = (id: StatusId): StatusDef | undefined => STATUSES[id];

/** How repeated applications combine. */
export type StackMode =
  | 'refresh'    // keep one instance, refresh duration (stacks stay 1)
  | 'strongest'  // keep the strongest magnitude/dps, refresh duration
  | 'stack'      // +stacks up to maxStacks, refresh duration
  | 'dotstack'   // dots: +stacks, dps summed (capped: replaces the average once full)
  | 'override';  // internal locks: overwrite magnitude & duration exactly

export interface StatusRule {
  stack?: StackMode;
  /** Crowd control diminishing-returns group (enemies, 8 s window: 100% -> 60% -> 30% -> immune 6 s). */
  group?: 'hard' | 'fear' | 'root';
  /** Hard CC: bosses/mini-bosses/ccImmune enemies are immune (converted to stagger by Combat); elites take 50% duration. */
  hard?: boolean;
  /** `StatusDef.stats` values are per unit of magnitude. */
  perMag?: boolean;
  /** Magnitude used when the applier gave none. */
  defMag?: number;
  /** Damage dealt multiplier (DAHA FAZLA): x(1 + value * (perMag ? magnitude : stacks)). */
  dealtMore?: number;
  /** Damage taken multiplier: x(1 + value * (perMag ? magnitude : 1)). */
  takenMore?: number;
  /** Healing received multiplier (necrotic, grievous). */
  healMult?: number | ((stacks: number) => number);
  /** Heal-over-time: `magnitude` is HP per second. */
  hot?: boolean;
  /** Fully internal: no events, no stat refresh. */
  internal?: boolean;
  /** Always-on immunity to a class of effects while active. */
  immuneSlow?: boolean;
  immuneCC?: boolean;
  /** +X% resource generation while active (x magnitude). */
  resGain?: number;
  /** Chill: bosses use only this fraction of the per-stack slow. */
  bossFactor?: number;
  /** Max-HP rot (Kirlenme): damage per second = maxHpPctPerSec x owner MAX HP x stacks. Ignores the attacker dps snapshot. */
  maxHpPctPerSec?: number;
  /** Non-lethal floor of a max-HP rot: its ticks never take the owner below this fraction of max HP. */
  hpFloorPct?: number;
  /** P-21: a dodge roll by the owner removes this many stacks (arcane_lockdown). Read by the K14 hook in Combat.ts. */
  onDodge?: { removeStacks: number };
  /** P-21: a dispel removes this many stacks instead of the whole status (arcane_lockdown). Read by dispel code via dispelStackLoss. */
  onDispel?: { removeStacks: number };
  /** P-21: per-stack damage-taken multiplier, x(1 + value x stacks). Combined multiplicatively by Combat (takenPerStackTotal). */
  takenMorePerStack?: number;
  /** P-21: burst on natural expiry only (never on dispel, see shouldFireOnExpire). Read by the K14 hook in Combat.ts. */
  onExpire?: StatusExpireBurst;
  // ---- PM-00a (plate-melee §g needs 4 / 7 / 8): rule fields only; the behaviour is wired by PM-00b (combat/procMods.ts, Combat.ts).
  /** Target takes this much extra damage (fraction) only from the player who applied the status (Dev Ezme `colossus`, Ceza `judged`). */
  takenMoreFromSource?: number;
  /** Rider: hits from the owner's skills also strike this many nearby enemies (`sweeping` 2, `meat_cleaver` 3) ... */
  extraTargets?: number;
  /** ... at this damage multiplier (0.6 for both). */
  extraMult?: number;
  /** Cooldown multiplier on the listed skills while the status is up (`ursoc_form`: Yarma / Paralama x0.5). */
  cdMult?: { mult: number; skills: string[] };
  /** Heal-over-time pandemic: a refresh keeps this fraction of the remaining duration (`rend` 0.30, `virulent_plague` pandemic). */
  pandemic?: number;
  /** Knockback immunity while active (`deaths_advance`). */
  immuneKnockback?: boolean;
  /** PM-00b (plate-melee §g need 2): each melee hit taken removes one stack, at most once per `icd` s (`bone_armor`, 2.5 s). */
  consumeOnHit?: { icd: number };
}

/** P-21 onExpire payload: an area hit at the owner's position when the status runs out. */
export interface StatusExpireBurst {
  shape: 'circle' | 'cone' | 'self';
  radius: number;
  coef: number;
  type: DamageType;
}

/** Why a status left the owner. Only 'expire' may fire onExpire. */
export type StatusRemoveReason = 'expire' | 'dispel' | 'remove' | 'clear' | 'death';

export const STATUS_RULES: Partial<Record<StatusId, StatusRule>> = {
  stun: { stack: 'strongest', group: 'hard', hard: true },
  freeze: { stack: 'strongest', group: 'hard', hard: true, takenMore: 0.2 },
  knockdown: { stack: 'strongest', group: 'hard', hard: true },
  fear: { stack: 'strongest', group: 'fear', hard: true },
  root: { stack: 'strongest', group: 'root', hard: true },
  silence: { stack: 'strongest' },
  slow: { stack: 'strongest', perMag: true, defMag: 0.3, bossFactor: 0.5 },
  blind: { stack: 'refresh' },
  taunt: { stack: 'refresh' },
  burn: { stack: 'strongest' },
  bleed: { stack: 'dotstack' },
  poison: { stack: 'dotstack' },
  chill: { stack: 'stack', bossFactor: 0.6 },
  shock: { stack: 'stack', takenMore: 0.1 },
  curse: { stack: 'refresh' },
  sunder: { stack: 'refresh', takenMore: 0.15, perMag: false },
  shield: { stack: 'strongest' },
  haste: { stack: 'strongest', perMag: true, defMag: 0.2 },
  // PM-00a retune (plate-melee 3b): called with magnitude 0.15 (Kudurma), default magnitude 0.15.
  enrage: { stack: 'strongest', perMag: true, defMag: 0.15, dealtMore: 1 },
  regen: { stack: 'strongest', hot: true, defMag: 5 },
  fortify: { stack: 'strongest', perMag: true, defMag: 0.2 },
  invulnerable: { stack: 'refresh' },
  stealth: { stack: 'refresh' },
  empower: { stack: 'strongest', perMag: true, defMag: 0.15, dealtMore: 1 },
  banner: { stack: 'refresh', dealtMore: 0.15 },
  blessed: { stack: 'refresh', perMag: false },
  bloodrage: { stack: 'refresh', immuneSlow: true, dealtMore: 0.25, resGain: 0.5 },
  venom: { stack: 'refresh' },
  ambush: { stack: 'refresh' },
  balance: { stack: 'refresh', dealtMore: 0.15 },
  windrunner: { stack: 'refresh' },
  veil: { stack: 'refresh' },
  dancer: { stack: 'refresh' },
  bolstered: { stack: 'stack' },
  raging: { stack: 'refresh' },
  bursting: { stack: 'stack' },
  // GDD_CONTENT 5.5: -3% healing received per stack (max 99%); params live in data/mythicAffixes (healReducePerStack)
  necrotic: { stack: 'stack', healMult: (s: number) => Math.max(0.01, 1 - 0.03 * s) },
  // Ağır Yara: GDD_SYSTEMS 1.5 "grievous x0.5" (flat while any stack is present) — decided over GDD_CONTENT's damage-only wording
  grievous: { stack: 'refresh', healMult: 0.5 },
  inspiring: { stack: 'refresh', immuneCC: true },
  fortified_aura: { stack: 'refresh' },
  tyrannical_aura: { stack: 'refresh' },
  // Metin rot: +1 stack per application (max 5), refresh duration; 1% max HP/s per stack, never below 25% HP
  kirlenme: { stack: 'stack', maxHpPctPerSec: KIRLENME_MAX_HP_PCT_PER_SEC, hpFloorPct: KIRLENME_HP_FLOOR_PCT },
  iframes: { stack: 'override' },
  potion_cd: { stack: 'override' },
  act_slow: { stack: 'override', perMag: true, internal: true },
  act_root: { stack: 'override', internal: true },
  // Taşkasa (SP-21): Sismik Kalkan -50% damage taken; Yer Çatlağı and Kararsız Enerji stack their DoT per stack (dotstack);
  // Kararsız Enerji +8% damage dealt per stack; Boşluk İşareti +25% damage taken per stack; Boşluk Yozlaşması is the max-HP rot (1 % per stack at 0.35 %)
  seismic_echo: { stack: 'refresh' },
  seismic_ward: { stack: 'refresh', takenMore: -0.5 },
  earth_fracture: { stack: 'dotstack' },
  unstable_energy: { stack: 'dotstack', dealtMore: 0.08 },
  void_mark: { stack: 'stack', takenMorePerStack: 0.25 },
  void_corruption: { stack: 'stack', maxHpPctPerSec: 0.0035 },
};

/** GDD_V2 §0.3 stack / immunity rules (WP5). HoTs use `hot` (magnitude = HP per second). */
const V2_STATUS_RULES: Partial<Record<StatusId, StatusRule>> = {
  guard: { stack: 'refresh', internal: true },
  riposte: { stack: 'refresh' },
  guard_broken: { stack: 'refresh' },
  critbuff: { stack: 'refresh', dealtMore: 0.15 },
  shield_block: { stack: 'refresh' },
  oath_ward: { stack: 'strongest' },
  bastion: { stack: 'refresh', immuneCC: true },
  aegis: { stack: 'refresh' },
  iron_stance: { stack: 'stack' },
  blood_shield: { stack: 'strongest' },
  last_stand: { stack: 'refresh', immuneCC: true },
  rally: { stack: 'refresh' },
  zeal: { stack: 'refresh' },
  wings: { stack: 'refresh', dealtMore: 0.25 },
  carnage: { stack: 'refresh', immuneSlow: true, resGain: 0.5 },
  icy_veins: { stack: 'refresh' },
  combustion: { stack: 'refresh' },
  shadow_blades: { stack: 'refresh' },
  shadow_veil_cd: { stack: 'refresh' },
  clarity: { stack: 'refresh' },
  dawn_hot: { stack: 'refresh', hot: true },
  renew: { stack: 'refresh', hot: true },
  overheal_ward: { stack: 'strongest' },
  brew_zone: { stack: 'refresh' },
  elixir_regen: { stack: 'refresh', hot: true },
  hero_haste: { stack: 'refresh' },
  sated: { stack: 'refresh' },
  weakness_chain: { stack: 'stack' },
  shielded_poise: { stack: 'refresh', internal: true },
  marked_crit: { stack: 'refresh' },
  armored: { stack: 'refresh', internal: true },
  cursed_zone: { stack: 'refresh', internal: true },
};
Object.assign(STATUS_RULES, V2_STATUS_RULES);

/**
 * Season 1 shared primitives P-21 (K4, append-only): the 14 ids of K1 that have no row yet. Numbers come from the dungeon docs
 * (docs/dungeons/*.md, cited per row). `takenMore` / `dealtMore` already scale with stacks (StatusEffects.takenMore / dealtMore),
 * so a stacking debuff only needs `stack: 'stack'` plus `maxStacks`. `defaultDuration` is the nominal value; appliers may override.
 */
const S1_STATUSES: Partial<Record<StatusId, StatusDef>> = {
  // Taşa Çevir (kefaret yagmaci, Taşa Dönüş): hard CC, dispellable (P6)
  petrify: { id: 'petrify', name: 'Taşlaşma', icon: I('debuff-stun'), kind: 'debuff', cc: true, vfx: 'stun_stars', dispellable: true, defaultDuration: 5 },
  // Ölümcül Darbe (kefaret): healing received x0.5, not dispellable (P6)
  mortal_wound: { id: 'mortal_wound', name: 'Ölümcül Yara', icon: I('debuff-bleed'), kind: 'debuff', dispellable: false, defaultDuration: 8 },
  // Terzi Dolabı (yildiz S6): guards ignore the party while it lasts
  disguise: { id: 'disguise', name: 'Soylu Kılığı', icon: I('buff-stealth'), kind: 'buff', defaultDuration: 120 },
  // Büyüleme (yildiz ys_mist_bewitch): move -75%, attack speed -50%, dispellable
  bewitch: { id: 'bewitch', name: 'Büyülenme', icon: I('debuff-slow'), kind: 'debuff', stats: { moveSpeedPct: -0.75, attackSpeed: -0.5 }, dispellable: true, defaultDuration: 8 },
  // Açıkta (yanki YSP-06): +1 x magnitude damage taken (magnitude 0.5 = +50%); yanki calls it at 0.5 (tank buster) and 0.15 (Ağ Örücü)
  exposed: { id: 'exposed', name: 'Açıkta', icon: I('debuff-armor-break'), kind: 'debuff', defaultDuration: 10 },
  // Kin Laneti (peri ps_spiteclaw_curse): +6% damage taken per stack, max 3, dispellable (peri 4.4)
  kin_laneti: { id: 'kin_laneti', name: 'Kin Laneti', icon: I('debuff-curse'), kind: 'debuff', maxStacks: 3, dispellable: true, vfx: 'curse_loop', defaultDuration: 10 },
  // Asit Yarası (peri Tred'ova): +10% damage taken per stack, max 5, dispellable, each stack refreshes the timer (peri 4.4)
  asit_yarasi: { id: 'asit_yarasi', name: 'Asit Yarası', icon: I('debuff-poison'), kind: 'debuff', maxStacks: 5, dispellable: true, defaultDuration: 8 },
  // Arcane Kilitlenme (yildiz gerdan_lockdown): -30% move per stack, 1.2% max HP/s per stack (no HP floor), dispellable, a dodge roll removes one stack
  arcane_lockdown: { id: 'arcane_lockdown', name: 'Arkan Kilitlenme', icon: I('debuff-slow'), kind: 'debuff', maxStacks: 3, stats: { moveSpeedPct: -0.3 }, dotType: 'arcane', dispellable: true, defaultDuration: 20 },
  // Solan Ruh (yildiz taliksa_withering): -8% max HP and -8% move speed per stack, max 5, dispellable one stack per dispel
  withering_soul: { id: 'withering_soul', name: 'Solan Ruh', icon: I('debuff-curse'), kind: 'debuff', maxStacks: 5, stats: { maxHpPct: -0.08, moveSpeedPct: -0.08 }, dispellable: true, defaultDuration: 20 },
  // Derin Yara (yildiz ys_mist_slash): healing received -25%, not dispellable
  deep_wound: { id: 'deep_wound', name: 'Derin Yara', icon: I('debuff-bleed'), kind: 'debuff', dispellable: false, defaultDuration: 6 },
  // Yakıcı Şiddet (yildiz taliksa_intensity): +15% damage taken per stack, max 6, dispellable.
  // Deviation: takenMore is not element-specific, so this applies to all damage (the doc says fire damage only). Typed fire-only needs a new field.
  ys_intensity: { id: 'ys_intensity', name: 'Yakıcı Şiddet', icon: I('debuff-burn'), kind: 'debuff', maxStacks: 6, vfx: 'burn_loop', dispellable: true, defaultDuration: 12 },
  // Ay Çeşmesi (yildiz S13 boon): haste and move speed +10% for 60 s. Doc says "haste +10%": mapped to attackSpeed 0.1 (confirm castSpeed).
  ay_cesmesi: { id: 'ay_cesmesi', name: 'Ay Çeşmesi', icon: I('buff-haste'), kind: 'buff', stats: { attackSpeed: 0.1, castSpeed: 0.1, moveSpeedPct: 0.1 }, defaultDuration: 60 },
  // Yapışkan Hidromel (yigitler SET-16 mead puddle, enemy side): -35% move speed, +10% damage taken. Duration not in the doc (puddle-driven).
  mead_sticky: { id: 'mead_sticky', name: 'Yapışkan Hidromel', icon: I('debuff-slow'), kind: 'debuff', stats: { moveSpeedPct: -0.35 } },
  // Yüklü Çubuk (yigitler, grounding rods): +8% damage dealt per stack, max 3, 6 s
  rod_charged: { id: 'rod_charged', name: 'Yüklü Çubuk', icon: I('buff-strength'), kind: 'buff', maxStacks: 3, defaultDuration: 6 },
};

const S1_STATUS_RULES: Partial<Record<StatusId, StatusRule>> = {
  petrify: { stack: 'strongest', group: 'hard', hard: true },
  mortal_wound: { stack: 'refresh', healMult: 0.5 },
  disguise: { stack: 'refresh' },
  bewitch: { stack: 'refresh' },
  exposed: { stack: 'refresh', perMag: true, takenMore: 1 },
  kin_laneti: { stack: 'stack', takenMore: 0.06 },
  asit_yarasi: { stack: 'stack', takenMore: 0.10 },
  // Each dodge roll removes one stack (P-21 onDodge; the hook itself is K14 in Combat.ts)
  arcane_lockdown: { stack: 'stack', maxHpPctPerSec: 0.012, onDodge: { removeStacks: 1 }, onDispel: { removeStacks: 1 } },
  withering_soul: { stack: 'stack' },
  deep_wound: { stack: 'refresh', healMult: 0.75 },
  ys_intensity: { stack: 'stack', takenMore: 0.15 },
  ay_cesmesi: { stack: 'refresh' },
  mead_sticky: { stack: 'refresh', takenMore: 0.10 },
  rod_charged: { stack: 'stack', dealtMore: 0.08 },
};
Object.assign(STATUSES, S1_STATUSES);
Object.assign(STATUS_RULES, S1_STATUS_RULES);

/**
 * Yiğitler Sarayı and Leş Uyanışı (SP-05, append-only). Numbers from docs/dungeons/yigitler_sarayi.md (sections 4, 6, Odyn's
 * hook) and docs/dungeons/les_uyanisi.md (SP-05 table, Amarth and Exile sections). `stats` are per stack. Damage-taken rules
 * apply to every source of damage on the owner; the docs' "from the source" wording is not modelled per source.
 */
const YS_LU_STATUSES: Partial<Record<StatusId, StatusDef>> = {
  holy_scorch: { id: 'holy_scorch', name: 'Kutsal Yanık', icon: I('debuff-burn'), kind: 'debuff', dotType: 'holy', maxStacks: 3, dispellable: true, defaultDuration: 8 },
  aegis_ward: { id: 'aegis_ward', name: 'Aegis Siperi', icon: I('buff-absorb'), kind: 'buff', stats: { damageReductionPct: 0.75 }, vfx: 'shield_bubble', defaultDuration: 0.8 },
  odyn_favor: { id: 'odyn_favor', name: "Odyn'in Lütfu", icon: I('buff-blessing'), kind: 'buff', stats: { moveSpeedPct: 0.4 }, vfx: 'buff_aura', defaultDuration: 75 },
  odyn_blessing: { id: 'odyn_blessing', name: "Odyn'in Nimeti", icon: I('buff-blessing'), kind: 'buff', stats: { moveSpeedPct: 0.7 }, vfx: 'buff_aura', defaultDuration: 60 },
  rune_blessed: { id: 'rune_blessed', name: 'Rünle Kutsanmış', icon: I('buff-strength'), kind: 'buff', stats: { damagePct: 0.3, moveSpeedPct: 0.25 }, vfx: 'buff_aura', defaultDuration: 20 },
  bear_snare: { id: 'bear_snare', name: 'Ayı Tuzağı', icon: I('debuff-root'), kind: 'debuff', cc: true, dispellable: true, defaultDuration: 3 },
  heal_cut: { id: 'heal_cut', name: 'Şifa Kesintisi', icon: I('debuff-healing-reduction'), kind: 'debuff', dispellable: false, defaultDuration: 8 },
  heal_absorb: { id: 'heal_absorb', name: 'Şifa Emilimi', icon: I('debuff-weakness'), kind: 'debuff', defaultDuration: 10 },
  tank_stack: { id: 'tank_stack', name: 'Yığın Yarası', icon: I('debuff-bleed'), kind: 'debuff', maxStacks: 8, defaultDuration: 12 },
  frost_mark: { id: 'frost_mark', name: 'Ayaz Damgası', icon: I('debuff-chill'), kind: 'debuff', maxStacks: 3, defaultDuration: 5 },
  morbid_fixation: { id: 'morbid_fixation', name: 'Hastalıklı Takıntı', icon: I('debuff-marked'), kind: 'debuff', stats: { moveSpeedPct: -0.6 }, defaultDuration: 8 },
  exile_cold: { id: 'exile_cold', name: 'Sürgün Soğuğu', icon: I('debuff-chill'), kind: 'debuff', stats: { moveSpeedPct: -0.25 }, defaultDuration: 50 },
  champion_boon: { id: 'champion_boon', name: 'Şampiyonun Lütfu', icon: I('buff-crit'), kind: 'buff', stats: { critChance: 1.0 }, vfx: 'buff_aura', defaultDuration: 40 },
  weapon_mark: { id: 'weapon_mark', name: 'Kan İzi', icon: I('debuff-bleed'), kind: 'debuff', defaultDuration: 10 },
  anima_exhaust: { id: 'anima_exhaust', name: 'Anima Egzozu', icon: I('buff-aura'), kind: 'buff', vfx: 'buff_aura', defaultDuration: 60 },
};
Object.assign(STATUSES, YS_LU_STATUSES);

const YS_LU_STATUS_RULES: Partial<Record<StatusId, StatusRule>> = {
  // Kutsal Yanık: holy DoT, 1.2% of max HP per second per stack, max 3 stacks (the dispel target of the Mystic).
  holy_scorch: { stack: 'stack', maxHpPctPerSec: 0.012 },
  aegis_ward: { stack: 'refresh' },
  odyn_favor: { stack: 'refresh' },
  odyn_blessing: { stack: 'refresh' },
  rune_blessed: { stack: 'refresh' },
  // Ayı Tuzağı: dispellable root, mirrors the root rule.
  bear_snare: { stack: 'strongest', group: 'root', hard: true },
  heal_cut: { stack: 'refresh', healMult: 0.5 },
  heal_absorb: { stack: 'refresh' },
  // Yığın Yarası: +10% damage taken per stack, max 8, refresh on each bite.
  tank_stack: { stack: 'stack', takenMorePerStack: 0.10 },
  // Ayaz Damgası: +25% damage taken per stack, max 3 (frost-only in the docs; the rule applies to all damage).
  frost_mark: { stack: 'stack', takenMorePerStack: 0.25 },
  morbid_fixation: { stack: 'refresh', takenMore: 1 },
  exile_cold: { stack: 'refresh' },
  champion_boon: { stack: 'refresh' },
  weapon_mark: { stack: 'refresh', takenMore: 0.25 },
  anima_exhaust: { stack: 'refresh' },
};
Object.assign(STATUS_RULES, YS_LU_STATUS_RULES);
// KIT PK-0: kit statuses (PK-MAGE / PK-ROGUE / PK-WARLOCK) and the shared hidden watcher statuses (data/watchers.ts).
Object.assign(STATUSES, STATUSES_KIT_MAGE, STATUSES_KIT_ROGUE, STATUSES_KIT_WARLOCK, WATCHER_STATUSES);
Object.assign(STATUS_RULES, STATUS_RULES_KIT_MAGE, STATUS_RULES_KIT_ROGUE, STATUS_RULES_KIT_WARLOCK);
// PM-00a (plate-melee §g): plate kit statuses (32 ids, 10 pending defs). Merged last: sudden_death overrides the talent stub.
Object.assign(STATUSES, STATUSES_KIT_PLATE);
Object.assign(STATUS_RULES, STATUS_RULES_KIT_PLATE);
// WP-02: monk and archer kit statuses (merged after the shared rows, like the other kits).
Object.assign(STATUSES, STATUSES_KIT_MONK, STATUSES_KIT_ARCHER);
Object.assign(STATUS_RULES, STATUS_RULES_KIT_MONK, STATUS_RULES_KIT_ARCHER);

/** Statuses that are crowd control on the "hard" scale (cannot act). */
export const HARD_CC: StatusId[] = ['stun', 'freeze', 'knockdown', 'fear', 'petrify'];

/** Statuses that count as debuffs for invulnerability checks etc. */
export const isDebuff = (id: StatusId): boolean => STATUSES[id]?.kind === 'debuff';

// ---- P-21 K14 pure rule helpers (no game state; Combat.ts and tools/smoke/status_hooks.mjs use them) ----

/** Per-stack damage-taken multiplier of one rule: 1 + takenMorePerStack x stacks (1 when the rule has none). */
export const takenMorePerStackMult = (rule: StatusRule | undefined, stacks: number): number =>
  rule?.takenMorePerStack ? 1 + rule.takenMorePerStack * Math.max(0, stacks) : 1;

/** Status ids whose rule has takenMorePerStack, computed once from the rule table. */
export const TAKEN_PER_STACK_IDS: readonly StatusId[] = (Object.keys(STATUS_RULES) as StatusId[]).filter(
  (id) => !!STATUS_RULES[id]?.takenMorePerStack,
);

/** Product of every per-stack damage-taken multiplier, reading each owner's stacks through `stackOf`. */
export function takenPerStackTotal(stackOf: (id: StatusId) => number, ids: readonly StatusId[] = TAKEN_PER_STACK_IDS): number {
  let m = 1;
  for (const id of ids) {
    const n = stackOf(id);
    if (n > 0) m *= takenMorePerStackMult(STATUS_RULES[id], n);
  }
  return m;
}

/** Status ids that lose stacks on a dodge roll (arcane_lockdown). */
export const DODGE_STACK_IDS: readonly StatusId[] = (Object.keys(STATUS_RULES) as StatusId[]).filter(
  (id) => !!STATUS_RULES[id]?.onDodge,
);

/** Stacks a dodge roll removes from this status (0 when the status has no onDodge rule). */
export const dodgeStackLoss = (id: StatusId): number => STATUS_RULES[id]?.onDodge?.removeStacks ?? 0;

/** Stacks a dispel removes from this status: the onDispel amount, or 0 meaning the whole status is removed. */
export const dispelStackLoss = (id: StatusId): number => STATUS_RULES[id]?.onDispel?.removeStacks ?? 0;

/** Stacks left after `loss` is taken from `stacks` (never below 0). */
export const stacksAfterLoss = (stacks: number, loss: number): number => Math.max(0, stacks - Math.max(0, loss));

/** onExpire fires only for a natural expiry. A dispel or any other removal never fires it. */
export const shouldFireOnExpire = (reason: StatusRemoveReason): boolean => reason === 'expire';

/** The onExpire burst of a status, if its rule has one. */
export const expireBurstOf = (id: StatusId): StatusExpireBurst | undefined => STATUS_RULES[id]?.onExpire;
