import type { Ctx, Fx } from './Fx';
import type { V3 } from './Particles';
import { sheet } from './Sheets';

/**
 * Pixel-art sprite-sheet layers that ride on top of the procedural presets (VFX.spawn runs the overlay for the same id right after
 * the preset). Everything here is optional garnish: when the sheets are not loaded yet `sheet()` returns false and the particle
 * preset alone carries the effect. Sizes are quad widths in metres, `speed` multiplies the authored 15/20/30 fps.
 */
export type Overlay = (fx: Fx, c: Ctx) => void;

const P = (c: Ctx, up = 0): V3 => [c.p.x, c.p.y + up, c.p.z];
const chance = (p: number): boolean => Math.random() < p;

export const sheetOverlays: Record<string, Overlay> = {
  // ---- generic combat
  hit_spark(fx, c) {
    sheet(fx, ['impact_sym1', 'impact_sym4', 'impact_dir3', 'impact_dir1', 'bk_impact_white'], P(c), 1.3 * c.s, { color: c.color(0xffeec0), speed: 1.8, a: 0.95 });
  },
  hit_magic(fx, c) {
    sheet(fx, ['impact_sym4', 'impact_sym1'], P(c), 1.6 * c.s, { color: c.color(0xb070ff), speed: 1.6 });
  },
  crit_burst(fx, c) {
    const col = c.color(0xffc830);
    sheet(fx, 'bk_bighit', P(c), 3.2 * c.s, { color: col, speed: 1.35, a: 1 });
    sheet(fx, 'impact_sym6', P(c), 2.6 * c.s, { color: col, speed: 1.6, a: 0.9, delay: 0.03 });
  },
  hit_blood(fx, c) {
    if (c.o.color !== undefined || !chance(0.75)) return; // coloured blood (slime, ichor) keeps the particle version
    sheet(fx, ['bk_blood', 'splat1', 'splat_dir1'], P(c), 1.7 * c.s, { speed: 1.5, a: 0.95 });
  },
  block_spark(fx, c) {
    sheet(fx, 'sparkburst', P(c), 1.7 * c.s, { color: c.color(0xffe08a), speed: 1.5 });
  },
  dodge_dust(fx, c) {
    sheet(fx, 'dashdust', P(c, 0.45), 1.9 * c.s, { color: 0xcdbf9f, speed: 1.35, a: 0.8 });
  },
  death_poof(fx, c) {
    sheet(fx, 'dust', P(c), 2.8 * c.s, { flat: true, color: 0xb8a98c, speed: 1.2, a: 0.85 });
    if (chance(0.6)) sheet(fx, 'skullsmoke', P(c, 1.0 * c.s), 1.9 * c.s, { speed: 1.1, a: 0.9, color: 0xe8e0d0 });
  },
  death_bones(fx, c) {
    sheet(fx, 'skullsmoke', P(c, 1.0 * c.s), 2.1 * c.s, { speed: 1.05, a: 0.95 });
    sheet(fx, 'dust', P(c), 2.6 * c.s, { flat: true, color: 0xd6cdb4, speed: 1.2, a: 0.8 });
  },
  ground_slam(fx, c) {
    sheet(fx, 'dust', P(c), 6.0 * c.s, { flat: true, color: 0xb5a58a, speed: 1.15, a: 0.9 });
    sheet(fx, 'explosion_sym4', P(c, 0.5 * c.s), 3.2 * c.s, { speed: 1.8, a: 0.7, delay: 0.02 });
  },
  leap_land(fx, c) {
    sheet(fx, 'dust', P(c), 3.8 * c.s, { flat: true, color: 0xb5a58a, speed: 1.3, a: 0.85 });
  },

  // ---- elemental
  fire_burst(fx, c) {
    sheet(fx, ['explosion1', 'explosion_sym4'], P(c, 0.3 * c.s), 3.0 * c.s, { speed: 1.7, color: c.o.color });
    if (c.s >= 0.9) sheet(fx, 'bk_explosion', P(c, 0.8 * c.s), 3.6 * c.s, { speed: 2.0, a: 0.85 });
  },
  explosive_orb_pop(fx, c) {
    sheet(fx, 'explosion1', P(c, 0.5), 5.0 * c.s, { speed: 1.35 });
    sheet(fx, 'bk_explosion', P(c, 1.0), 4.5 * c.s, { speed: 1.8, a: 0.9, delay: 0.04 });
  },
  bursting_pop(fx, c) {
    sheet(fx, ['explosion_sym4', 'explosion1'], P(c, 0.8), 2.8 * c.s, { speed: 1.6, color: c.o.color });
  },
  volcanic_plume(fx, c) {
    sheet(fx, 'bk_fire', P(c, 1.4 * c.s), 3.4 * c.s, { speed: 1.5, a: 0.9 });
  },
  frost_burst(fx, c) {
    sheet(fx, ['impact_sym1', 'impact_sym4'], P(c), 2.1 * c.s, { color: c.color(0x9fe0ff), speed: 1.5 });
  },
  shadow_burst(fx, c) {
    sheet(fx, ['impact_sym4', 'impact_sym1'], P(c), 2.1 * c.s, { color: c.color(0xa060ff), speed: 1.5 });
  },
  holy_burst(fx, c) {
    sheet(fx, 'lightburst', P(c, 1.0), 4.2 * c.s, { color: c.color(0xffe28a), speed: 1.4 });
    sheet(fx, 'sparkle1', P(c, 0.8), 2.2 * c.s, { color: 0xfff0b0, speed: 1.0 });
  },
  arcane_burst(fx, c) {
    sheet(fx, ['impact_sym4', 'impact_sym1'], P(c), 2.5 * c.s, { color: c.color(0xe060ff), speed: 1.5 });
  },
  lightning_strike(fx, c) {
    const size = 7.5 * c.s;
    sheet(fx, 'lightning_strike', P(c, size * 0.5), size, { color: c.color(0xd8e6ff), speed: 1.15, glow: 1.6 });
  },
  chain_lightning(fx, c) {
    sheet(fx, 'lightning_burst', P(c, 1.0), 2.6 * c.s, { color: c.color(0xcfe0ff), speed: 1.5 });
  },
  blink(fx, c) {
    sheet(fx, 'warp', P(c, 1.0), 3.0 * c.s, { speed: 1.3, a: 0.9 });
  },

  // ---- buffs / world
  heal_burst(fx, c) {
    sheet(fx, 'heal', P(c, 1.1 * c.s), 2.0 * c.s, { color: c.color(0x9affb0), speed: 1.0 });
  },
  potion_drink(fx, c) {
    sheet(fx, 'heal', P(c, 1.1), 1.9 * c.s, { color: c.color(0xff9a9a), speed: 1.1 });
  },
  level_up(fx, c) {
    // clamped: a smaller, dimmer gold burst (the full-size white-ish stack washed the frame into bloom)
    sheet(fx, 'lightburst', P(c, 1.1), 5.0 * c.s, { color: 0xffd060, speed: 0.95, a: 0.5 });
    sheet(fx, 'sparkle2', P(c, 1.4), 4.0 * c.s, { color: 0xfff0b0, speed: 0.75, delay: 0.1 });
  },
  respawn(fx, c) {
    sheet(fx, 'lightburst', P(c, 1.0), 6.0 * c.s, { color: c.color(0xbfe0ff), speed: 1.1 });
    sheet(fx, 'sparkle2', P(c, 1.2), 3.2 * c.s, { speed: 0.9, delay: 0.08 });
  },
  gold_sparkle(fx, c) {
    sheet(fx, 'sparkle1', P(c, 0.3), 1.2 * c.s, { color: c.color(0xffd860), speed: 1.1 });
  },
  chest_open(fx, c) {
    sheet(fx, 'sparkle2', P(c, 0.9), 2.8 * c.s, { color: c.color(0xffe08a), speed: 1.0 });
  },
  upgrade_success(fx, c) {
    sheet(fx, 'sparkle2', P(c, 1.0), 3.2 * c.s, { color: c.color(0xffe08a), speed: 1.0 });
    sheet(fx, 'lightburst', P(c, 1.0), 5.0 * c.s, { color: c.color(0xffd060), speed: 1.2, a: 0.8 });
  },
  upgrade_fail(fx, c) {
    sheet(fx, 'skullsmoke', P(c, 1.0), 2.0 * c.s, { color: c.color(0xff7070), speed: 1.0 });
  },
  keystone_insert(fx, c) {
    sheet(fx, 'sparkburst', P(c, 1.0), 2.6 * c.s, { color: c.color(0xa0e0ff), speed: 1.2 });
  },
  keystone_upgrade(fx, c) {
    sheet(fx, 'sparkle2', P(c, 1.2), 4.0 * c.s, { color: c.color(0xc090ff), speed: 0.9 });
    sheet(fx, 'lightburst', P(c, 1.2), 6.0 * c.s, { color: c.color(0xb070ff), speed: 1.1, a: 0.8 });
  },

  // ---- enemy / boss
  enemy_cast_glow(fx, c) {
    const life = Math.max(0.35, Math.min(4, c.o.duration ?? 0.9));
    sheet(fx, 'chargeup', P(c, 1.1 * Math.max(0.8, c.s)), 2.4 * Math.max(0.8, c.s), { color: c.color(0xffa060), life, a: 0.9 });
  },
  add_spawn(fx, c) {
    sheet(fx, 'dust', P(c), 3.2 * c.s, { flat: true, color: 0x9a8a9a, speed: 1.2, a: 0.85 });
  },
  boss_spawn(fx, c) {
    sheet(fx, 'dust', P(c), 7.0 * c.s, { flat: true, color: 0x8a7a8a, speed: 0.9, a: 0.9 });
    sheet(fx, 'lightburst', P(c, 1.4), 7.0 * c.s, { color: c.color(0xc060ff), speed: 0.9, a: 0.8 });
  },
};
