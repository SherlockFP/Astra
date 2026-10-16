import { G } from '../game/G';

/**
 * World clock: one real 48 minute cycle is one game day (2 real minutes per game hour). Day 30 min (07:00 .. 22:00 game time),
 * dusk 4 min (22:00 .. 24:00), night 10 min (00:00 .. 05:00), dawn 4 min (05:00 .. 07:00).
 *
 * The clock is a pure function of Date.now(), so every player in the zone sees the same hour with no net traffic. Overrides, in
 * order: `?night=1` (dev, night at 01:00), `?time=0..1` (fraction of the day, 0 = 00:00, 0.5 = 12:00), then the Settings switch
 * "Gün/Gece döngüsü": 'off' (Hep gündüz) pins the clock to 13:00.
 *
 * sampleDay() writes into a caller-owned object: no allocation per frame. NightLight blends the sun, moon, sky, fog, ambient, grade,
 * lamp glow and window glow from it; the minimap reads the hour for its clock.
 */

export const CYCLE_MS = 48 * 60 * 1000;
/** Sun arc: sunrise at 05:00 (the sun leaves the horizon while the dawn ramp runs), sunset at 21:00. Peak at 13:00. */
const ARC_START = 5;
const ARC_LEN = 16;
const DAY_RAMP_FROM = 5;
const DAY_RAMP_TO = 7;
const DUSK_FROM = 22;
const DUSK_TO = 24;
/** Hour used when the cycle is switched off (always day). */
const DAY_HOUR = 13;
/** Hour used by `?night=1` and the night preview. */
const NIGHT_HOUR = 1;

export interface DaySample {
  /** game hour, 0..24 */
  hour: number;
  /** 1 = full day, 0 = full night; eases over the dawn (05:00 .. 07:00) and dusk (22:00 .. 24:00) */
  dayW: number;
  /** 1 - dayW */
  nightW: number;
  /** 0 mid day or night, 1 at the dawn / dusk midpoint (sunset tint strength) */
  warm: number;
  /** sun height along its arc: 0 at sunrise / sunset, 1 at 13:00 (the sun direction keeps the builder's azimuth) */
  arc: number;
}

function smooth(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

function parseUrlTime(): number | null {
  if (typeof location === 'undefined') return null;
  const raw = new URLSearchParams(location.search).get('time');
  if (raw === null || raw.trim() === '') return null;
  const t = Number(raw);
  if (!Number.isFinite(t)) return null;
  const frac = ((t % 1) + 1) % 1;
  return frac * 24;
}

let overrideHour: number | null = parseUrlTime();

/** Pins the clock to an hour (0..24), or releases it (null). Used by the night preview and tests. */
export function setDayOverride(hour: number | null): void {
  overrideHour = hour === null ? null : ((hour % 24) + 24) % 24;
}

export function dayOverride(): number | null {
  return overrideHour;
}

/** Settings switch: false when the player chose 'Hep gündüz'. */
export function dayCycleOn(): boolean {
  return G.settings?.data.dayNightCycle !== 'off';
}

/** Game hour (0..24) at a shared time. Overrides win over the settings switch, which wins over the real clock. */
export function gameHour(now: number = Date.now()): number {
  if (overrideHour !== null) return overrideHour;
  if (!dayCycleOn()) return DAY_HOUR;
  const f = (((now % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
  return f * 24;
}

/** Writes the sample for a shared time into `out` (no allocation). */
export function sampleDay(out: DaySample, now: number = Date.now()): DaySample {
  const h = gameHour(now);
  let dayW: number;
  if (h < DAY_RAMP_FROM) dayW = 0;
  else if (h < DAY_RAMP_TO) dayW = smooth((h - DAY_RAMP_FROM) / (DAY_RAMP_TO - DAY_RAMP_FROM));
  else if (h < DUSK_FROM) dayW = 1;
  else if (h < DUSK_TO) dayW = 1 - smooth((h - DUSK_FROM) / (DUSK_TO - DUSK_FROM));
  else dayW = 0;
  out.hour = h;
  out.dayW = dayW;
  out.nightW = 1 - dayW;
  out.warm = 4 * dayW * (1 - dayW);
  out.arc = Math.sin(Math.PI * Math.min(1, Math.max(0, (h - ARC_START) / ARC_LEN)));
  return out;
}

/** "HH:MM" of a game hour (0..24). */
export function formatHour(hour: number): string {
  const m = Math.round(((hour * 60) % 1440 + 1440) % 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}
