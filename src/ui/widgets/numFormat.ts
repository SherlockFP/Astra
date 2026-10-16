/**
 * Number formatters for the HUD (UI_REDESIGN §2.7, UX-00). Pure functions, tr-TR style:
 * decimal comma (`15,2K`), thousands dot for plain integers (`1.234`).
 *
 * - fmtHealth: unit frames, party rows. One decimal while the number in front of the unit is under 100, none from 100
 *   (`805K`, `15,2K`, `99,9K`, `1,2M`, `120M`). Values are rounded before the unit is chosen (999 999 -> `1,0M`).
 * - fmtMeter: Details!-style meter rows. From 1 000 always exactly one decimal (`226,9K`, `189,0K`, `1,2M`).
 */

const UNIT_K = 1e3;
const UNIT_M = 1e6;

/** Decimal comma. `dec` = one decimal; otherwise the integer with a dot as thousands separator. */
function trNumber(v: number, dec: boolean): string {
  if (dec) return v.toFixed(1).replace('.', ',');
  return Math.round(v)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Health scaling: one decimal below 100, none from 100 (after rounding to the displayed precision). */
function scaledHealth(x: number): { v: number; dec: boolean } {
  if (x < 100) {
    const r = Math.round(x * 10) / 10;
    if (r < 100) return { v: r, dec: true };
  }
  return { v: Math.round(x), dec: false };
}

/** Health / absorb / party values (`805K`, `15,2K`, `1,2M`). Negative values keep their sign. */
export function fmtHealth(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (Math.round(a) < 1000) return sign + Math.round(a).toString();
  const k = scaledHealth(a / UNIT_K);
  if (k.v < 1000) return sign + trNumber(k.v, k.dec) + 'K';
  const m = scaledHealth(a / UNIT_M);
  return sign + trNumber(m.v, m.dec) + 'M';
}

/** Meter values (`226,9K`, `189,0K`, `1,2M`): integer below 1 000, otherwise always one decimal. */
export function fmtMeter(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (Math.round(a) < 1000) return sign + Math.round(a).toString();
  const k = Math.round((a / UNIT_K) * 10) / 10;
  if (k < 1000) return sign + trNumber(k, true) + 'K';
  return sign + trNumber(Math.round((a / UNIT_M) * 10) / 10, true) + 'M';
}

let numAssertDone = false;

/**
 * One-time dev assert of the numbers quoted in UI_REDESIGN UX-00. Logs a warning on mismatch; never throws.
 * Call once at UI boot (dev builds only).
 */
export function runNumFormatAsserts(): void {
  if (numAssertDone) return;
  numAssertDone = true;
  const checks: [string, string][] = [
    [fmtHealth(805000), '805K'],
    [fmtHealth(15200), '15,2K'],
    [fmtHealth(1240000), '1,2M'],
    [fmtMeter(226900), '226,9K'],
    [fmtMeter(189000), '189,0K'],
  ];
  for (const [got, want] of checks) {
    if (got !== want) console.warn(`[numFormat] got "${got}", expected "${want}"`);
  }
}

/** Training dummies (entities/interactables/TrainingDummy.ts) never die: their HP is shown as an infinity sign, not a pool. */
export function isTrainingDummy(a: object): boolean {
  return ((a as { def?: { id?: string } }).def?.id ?? '').startsWith('training_dummy_');
}

/** The HP text of a training dummy (its name carries the label; there is no number to read). */
export const DUMMY_HP_TEXT = '∞ HP';
