/**
 * GDD_ITEMS_V2 §1 (armor glow), §1.5 (set aura), §2.8 / §4.2 (quality, seals) and §4.3 (+N colours). COMPLETE in IT-00.
 * Pure data and pure helpers: no three.js, no G. Shared by vfx (ArmorGlow, ArmorShader, WeaponGlow), player (armorLook),
 * panels (+N pills, quality bars, tooltips). Change numbers here only; every number is from GDD_ITEMS_V2.
 */
import type { PlusStyle } from '../types/itemsV2';

/** Slot order of every 6-array: helm, shoulders, chest, gloves, legs, boots. */
export const ARMOR_SLOT_ORDER = ['helm', 'shoulders', 'chest', 'gloves', 'legs', 'boots'] as const;
export type ArmorSlotName = (typeof ARMOR_SLOT_ORDER)[number];
/** §1.1: body weights (chest counts twice). Sum 7. */
export const ARMOR_WEIGHTS = [1, 1, 2, 1, 1, 1] as const;
/** §1.1: L_body = floor( Σ w_s · up_s / 7 + 0.5 ), empty slot = 0. Drives particles, light and the Character panel readout. */
export const bodyLevel = (lv: readonly number[]): number => Math.floor(lv.reduce((s, v, i) => s + v * ARMOR_WEIGHTS[i], 0) / 7 + 0.5);

/** §1.1 visual tiers. Shared with the +N colours (§4.3) and the tooltip glow line. */
export const UPGRADE_TIERS = [
  { id: 'none',   min: 0,  name: '',                  color: '#e8e8e8', glowName: '' },
  { id: 'steel',  min: 4,  name: 'Çelik Cila',        color: '#b8d0ff', glowName: 'Çelik Cila parıltısı' },
  { id: 'blue',   min: 7,  name: 'Mavi Titreşim',     color: '#3fa9ff', glowName: 'Mavi parıltı' },
  { id: 'purple', min: 9,  name: 'Mor Rünler',        color: '#b14cff', glowName: 'Mor parıltı' },
  { id: 'flame',  min: 12, name: 'Kızıl-Altın Alev',  color: '#ff4030', glowName: 'Kızıl parıltı' },
  { id: 'prism',  min: 15, name: 'Prizma',            color: '#ffffff', glowName: 'Gökkuşağı parıltı' },
] as const;
export type UpgradeTier = (typeof UPGRADE_TIERS)[number];

/** Tier row of a +N level (N below 4 gives 'none'). */
export function tierOfLevel(n: number): UpgradeTier {
  let t: UpgradeTier = UPGRADE_TIERS[0];
  for (const row of UPGRADE_TIERS) if (n >= row.min) t = row;
  return t;
}

/**
 * §1.3 shader constants (`attachArmorShader`, GLSL in §1.3.3). Amplitude per tier index (none, steel, blue, purple, flame,
 * prism) is the clamp of the summed emissive add. Times are seconds, periods in seconds.
 */
export const ARMOR_LOOK = {
  ampByTier: [0.9, 0.9, 1.2, 1.6, 2.0, 2.4] as const,
  fresnelPower: 2.6,
  /** Steel (+4): cool-white fresnel and sweep on metal and trim, amp 0.30; sweep period 3.2 s. */
  steelAmp: 0.3,
  sweepPeriod: 3.2,
  /** Blue (+7): fresnel pulse period 1.4 s, amp 0.45 on metal and trim, ×0.45 on cloth. */
  bluePulseSec: 1.4,
  blueAmpMetal: 0.45,
  blueClothFactor: 0.45,
  /** Purple (+9): 3-D rune grid cell in bind space (≈ 0.07 m), flicker 2 Hz. */
  runeCell: 14,
  runeHz: 2,
  /** Flame (+12): bands scroll upward in bind-space Y at this speed factor. */
  flameScroll: 3.5,
  /** Prism (+15): rainbow hue cycle period (s). */
  prismCycleSec: 4,
  /** Masterwork rank 5 on the prism look: amp × this (§2.8). */
  masterworkAmpMul: 1.1,
  /** LOD: full effect within lodNear metres, off at lodFar metres (§1.4). */
  lodNear: 30,
  lodFar: 55,
  /** Set-completion silhouette pulse (§1.5): 0.6 s flash every 6 s. */
  setPulseSec: 0.6,
  setPulseEverySec: 6,
  /** Shader version in the material cache key (ARMOR_SHADER_VERSION). Bump on any GLSL change. */
  shaderVersion: 1,
} as const;

/** §1.4 particle table as data. Remote rates: near = remote ≤ 25 m, far = remote 25–45 m (none beyond). */
export interface ArmorParticleRow {
  tier: 'purple' | 'flame' | 'prism';
  /** Minimum body level L_body for this row. */
  minBody: number;
  /** A slot emits only when its own level is at least this. */
  minSlot: number;
  kind: 'motes' | 'embers' | 'sparkles';
  /** fx.add.spawn sprite presets (same textures as WeaponGlow). */
  sprites: readonly string[];
  /** Particles per second: local player, remote near, remote far. */
  rate: { local: number; near: number; far: number };
  /** Life range in seconds. */
  life: readonly [number, number];
  /** Size range in metres. */
  size: readonly [number, number];
  /** Rise speed range in m/s (motes and embers). */
  rise?: readonly [number, number];
  /** Flame row: share of `px` embers vs `flame-tongue` sprites. */
  mix?: { embers: number; tongues: number };
  /** Sparkle spin, rad/s (±). */
  spin?: number;
  /** Colours: c0 at birth, c1 at death (RGB hex). */
  colors?: { c0: number; c1: number };
  /** Point light (prism only). Args are those of fx.light(p, hue, intensity, size, life) in §1.4; `localOnly` = local player only. */
  light?: { every: number; intensity: number; size: number; life: number; localOnly: boolean };
}
export const ARMOR_PARTICLES: readonly ArmorParticleRow[] = [
  { tier: 'purple', minBody: 9, minSlot: 9, kind: 'motes', sprites: ['star-01', 'flare-01', 'cross'],
    rate: { local: 6, near: 4, far: 2 }, life: [0.5, 1.0], size: [0.07, 0.14], rise: [0.2, 0.7], colors: { c0: 0xffffff, c1: 0xb14cff } },
  { tier: 'flame', minBody: 12, minSlot: 12, kind: 'embers', sprites: ['px', 'flame-tongue-01', 'flame-tongue-02'],
    rate: { local: 14, near: 9, far: 4 }, life: [0.25, 0.5], size: [0.16, 0.26], rise: [0.5, 1.4], mix: { embers: 0.6, tongues: 0.4 }, colors: { c0: 0xffe090, c1: 0xff3010 } },
  { tier: 'prism', minBody: 15, minSlot: 12, kind: 'sparkles', sprites: ['star-01', 'cross', 'star-04', 'flare-01'],
    rate: { local: 22, near: 14, far: 6 }, life: [0.45, 0.95], size: [0.08, 0.2], spin: 4,
    light: { every: 0.12, intensity: 6, size: 0.14, life: 4, localOnly: true } },
];

/** §1.4 anchors: bones of the shared KayKit rig. A particle picks a random active anchor, jittered in a 0.25 m sphere. */
export const ARMOR_ANCHORS: Record<ArmorSlotName, readonly string[]> = {
  helm: ['head'],
  shoulders: ['upperarm.l', 'upperarm.r'],
  chest: ['chest'],
  gloves: ['hand.l', 'hand.r'],
  legs: ['upperleg.l', 'upperleg.r'],
  boots: ['foot.l', 'foot.r'],
};

/** §1.4 emission budget: at most 4 characters emit (local always counts), armor particles ≤ 120 alive, pool guard 1800. */
export const ARMOR_EMIT = { maxEmitters: 4, remoteFullM: 25, remoteOffM: 45, aliveBudget: 120, poolGuard: 1800, jitterM: 0.25 } as const;

/** §1.5 set-aura colours by set id (`tier_<specId>` for GDD_V2 §6 tier sets). Unknown sets: SET_AURA_DEFAULT. */
export const SET_AURA_COLORS: Readonly<Record<string, number>> = {
  set_holy_vanguard: 0xffe9a0,
  set_wolfblood: 0xc02030,
  set_archmage_legacy: 0x8a60ff,
  set_shadow_veil: 0x3fe0c8,
  tier_knight_protector: 0x7fb8ff,
  tier_knight_blademaster: 0xffd070,
  tier_barbarian_warlord: 0xff6a30,
  tier_barbarian_butcher: 0xd02030,
  tier_mage_elementalist: 0xff9a4a,
  tier_mage_lightbringer: 0xfff2b0,
  tier_rogue_assassin: 0x9060ff,
  tier_rogue_alchemist: 0x70e07a,
  tier_paladin_protection: 0x9ad0ff,
  tier_paladin_holy: 0xfff2b0,
  tier_paladin_retribution: 0xffb040,
};
export const SET_AURA_DEFAULT = 0xffffff;
export const setAuraColor = (setId: string): number => SET_AURA_COLORS[setId] ?? SET_AURA_DEFAULT;

/** §1.5 set-aura tuning: ground sigil (additive ring decal) and motes. Alpha by completion: partial (count ≥ 2), near-full, full. */
export const SET_AURA = {
  sigilRadius: 1.1,
  sigilAlpha: [0.25, 0.55, 0.85] as const,
  sigilSpinDegPerSec: 20,
  motesNearFull: 5,
  motesFull: 8,
} as const;

/** §4.2 quality bands (Kalite 0–100). Computed, never stored. */
export const QUALITY_BANDS = [
  { min: 0,  color: '#d9534f', name: 'Zayıf' }, { min: 15, color: '#e8c33a', name: 'Vasat' }, { min: 30, color: '#4ec45a', name: 'İyi' },
  { min: 55, color: '#4aa3ff', name: 'Çok İyi' }, { min: 75, color: '#b565ff', name: 'Mükemmel' }, { min: 90, color: '#ff9a2e', name: 'Kusursuz' },
] as const;

/** §4.2 seal thresholds: Yıldız ≥ 75, Ay ≥ 90, Güneş ≥ 97. */
export const SEAL_THRESHOLDS = [75, 90, 97] as const;

/** §4.2 seal style by QualityInfo.seal (0 none, 1 Yıldız, 2 Ay, 3 Güneş). */
export const SEAL_STYLE: readonly { name: string; color: string; pickupChime: boolean }[] = [
  { name: '', color: '', pickupChime: false },
  { name: 'Yıldız Mührü', color: '#cfe8ff', pickupChime: false },
  { name: 'Ay Mührü', color: '#b8a8ff', pickupChime: true },
  { name: 'Güneş Mührü', color: '#ffc84a', pickupChime: true },
];

/**
 * §4.3 "+N" token style. Tiers: +1..3 white, +4..6 steel, +7..8 blue, +9..11 purple, +12..14 red-gold gradient with glow
 * (anim 'flame' = the glow flicker), +15 rainbow (anim 'rainbow'). With Ustalık the token shows one star per rank (+15 only,
 * because `mwEffective = upgrade >= 15 ? mw : 0`). `css` is inline CSS declarations for the token text.
 */
export function plusStyle(up: number, mw = 0): PlusStyle {
  if (up >= 15) {
    const stars = Math.max(0, Math.min(5, Math.floor(mw)));
    return { color: '#ffffff', css: 'background:linear-gradient(90deg,#ff4030,#ffc040,#40ff80,#40a0ff,#c040ff);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 8px rgba(255,255,255,.7)', anim: 'rainbow', stars };
  }
  if (up >= 12) return { color: '#ff4030', css: 'background:linear-gradient(90deg,#ff4030,#ffc040);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 6px rgba(255,64,48,.7)', anim: 'flame', stars: 0 };
  if (up >= 9) return { color: '#b14cff', css: '', stars: 0 };
  if (up >= 7) return { color: '#3fa9ff', css: '', stars: 0 };
  if (up >= 4) return { color: '#b8d0ff', css: '', stars: 0 };
  return { color: '#e8e8e8', css: '', stars: 0 };
}
