import { G } from '../game/G';
import { METIN_SPECS, type MetinSpec } from '../data/enemies';
import type { Enemy } from '../entities/Enemy';
import type { StatusApply } from '../types/skills';
import type { PassiveHandler } from './abilities';
import type { EnemyAI } from './EnemyAI';
import { bossFx, bossMsg } from './bossNet';

/**
 * Metin stones (GDD_OPENWORLD §4.2-4.4). The stone is a stationary EnemyAI (ai.stationary) whose only behaviour is the
 * `metin_core` passive below: it engages on the first hit, spawns the five HP-threshold waves on the host, keeps a periodic add
 * stream and a debuff aura (and a pulse for tiers 3+), heals while nobody is near, and cracks / announces on death.
 *
 * Host only (it runs inside EnemyAI). Visual state (cracks, core glow, aura ring) is drawn by ai/procModels.ts from the HP
 * fraction on every peer; cosmetic shots and announcements go through bossFx / bossMsg so clients see them too.
 * Wave mobs and adds carry `tag` 'metin_wave' / 'metin_add' and `ownerId` = the stone (EnemyAI.orphanTick despawns them 8 s
 * after the stone is gone). Rewards are not handled here (loot / XP are personal, on the death event).
 * OWNER: enemies module.
 */

/** Players farther than this (m) from the stone do not keep it engaged / awake. */
export const METIN_ENGAGE_RANGE = 40;
/** Seconds without a player near the stone before the waves despawn and the stone heals. */
const IDLE_HEAL_AFTER = 10;
/** Fraction of max HP healed per second while idle (GDD §4.2.8). */
const HEAL_PER_SEC = 0.01;
/** Gap between two waves when several thresholds were crossed by one hit (s). */
const WAVE_GAP = 1.5;
const AURA_EVERY = 2;
const AURA_LAST = 2.5;
const PULSE_FIRST = 6;
const PULSE_TELEGRAPH = 1.0;
/** Thickness of one pulse band (m); bands travel at PULSE_BAND / PULSE_STEP = 5 m/s. */
const PULSE_BAND = 2;
const PULSE_STEP = 0.4;
const WAVE_NAMES = ['Birinci Dalga', 'İkinci Dalga', 'Üçüncü Dalga', 'Seçkin Dalga', 'Son Direniş'];
const METIN_TAG = 'metin_';

const specOf = (ai: EnemyAI): MetinSpec | undefined => METIN_SPECS[ai.e.def.id];

function playerNear(ai: EnemyAI, r: number): boolean {
  const e = ai.e;
  const r2 = r * r;
  for (const p of ai.world.players) {
    if (p.isDead || p.removed) continue;
    const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}

/** Living wave mobs and adds owned by this stone. */
export function metinChildren(ai: EnemyAI): Enemy[] {
  const id = ai.e.id;
  return ai.world.enemies.filter((o) => o.ownerId === id && !o.isDead && !o.removed && o.tag.startsWith(METIN_TAG));
}

function engage(ai: EnemyAI, st: Record<string, number>): void {
  const e = ai.e;
  st.engaged = 1;
  const x = e.position.x, z = e.position.z;
  bossFx('shockwave', x, z, { scale: 2, color: e.def.tint ?? 0xffffff, dur: 1.2 });
  bossFx('ground_slam', x, z, { scale: 1.4 });
  bossMsg('boss_shake', { i: 0.12, d: 0.35 });
  bossMsg('boss_announce', { k: 0 }, { text: `${e.def.name} uyandı!` });
  G.events.emit('world:metinChanged', { id: String(e.id), tierId: e.def.id, pos: [x, z], active: true });
}

function spawnWave(ai: EnemyAI, spec: MetinSpec, k: number): void {
  const e = ai.e;
  const wave = spec.waves[k];
  if (!wave || e.isDead || e.removed) return;
  for (const m of wave.members) {
    if (m.count > 0) ai.spawnAdds(m.enemyId, m.count, { radius: 9, aggro: true, tag: 'metin_wave' });
  }
  const x = e.position.x, z = e.position.z;
  bossFx('add_spawn', x, z, { scale: 2.2 });
  bossFx('ground_slam', x, z, { scale: 1.2 });
  bossMsg('boss_shake', { i: 0.06, d: 0.3 });
  bossMsg('boss_announce', { k: 0 }, { text: `${e.def.name}: ${WAVE_NAMES[k] ?? `${k + 1}. dalga`} saldırıyor!` });
}

/** Bozulma Aurası: a follow-circle HitShape with no damage that refreshes the debuffs every 2 s (like frost_knight_aura). */
function aura(ai: EnemyAI, spec: MetinSpec): void {
  const a = spec.aura;
  const e = ai.e;
  const sts: StatusApply[] = [{ status: 'slow', duration: AURA_LAST, magnitude: a.slowPct }];
  if (a.curse) sts.push({ status: 'curse', duration: AURA_LAST });
  // Kirlenme: approximated by a non-stacking burn-type DOT (a dedicated rot status is still missing, see report)
  if (a.dotPctPerSec) sts.push({ status: 'burn', duration: AURA_LAST, magnitude: a.dotPctPerSec * 10 });
  ai.shape({
    shape: { type: 'circle', radius: a.radius }, x: e.position.x, z: e.position.z, dx: 0, dz: 1, delay: 0.02, damage: 0, type: 'poison',
    statuses: sts, follow: true, name: 'Bozulma Aurası',
  });
}

/** Metin Nabzı: an expanding ring 4 -> rMax m (5 m/s, 2 m bands), telegraphed from the first frame. */
function pulse(ai: EnemyAI, spec: MetinSpec): void {
  const p = spec.pulse;
  if (!p) return;
  const e = ai.e;
  const x = e.position.x, z = e.position.z;
  bossFx('shockwave', x, z, { scale: p.rMax / 5.5, color: e.def.tint ?? 0xffffff, dur: PULSE_TELEGRAPH + 1 });
  let k = 0;
  for (let r = 4; r + PULSE_BAND <= p.rMax + 0.01; r += PULSE_BAND, k++) {
    ai.shape({
      shape: { type: 'ring', inner: r, outer: r + PULSE_BAND }, x, z, dx: 0, dz: 1, delay: PULSE_TELEGRAPH + k * PULSE_STEP,
      coef: p.coef, type: 'physical', telegraph: true, name: 'Metin Nabzı',
    });
  }
}

/** Idle: no player within 40 m for 10 s. Waves despawn once, the stone heals 1 %/s and resets when it is full again. */
function idle(ai: EnemyAI, st: Record<string, number>, dt: number): void {
  const e = ai.e;
  if (!st.cleared) {
    st.cleared = 1;
    for (const o of metinChildren(ai)) o.escape();
    if (ai.aggroed) ai.deaggro();
  }
  if (e.hpFrac < 1) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * HEAL_PER_SEC * dt);
  if (e.hpFrac >= 0.999) {
    st.engaged = 0;
    st.w = 0;
  }
}

export const metinCore: PassiveHandler = {
  init(_ai, _ab, st) {
    st.w = 0;          // next wave index
    st.engaged = 0;
    st.addT = 0;
    st.auraT = 0;
    st.pulseT = PULSE_FIRST;
    st.idle = 0;
    st.cleared = 0;
  },
  tick(ai, _ab, st, dt) {
    const spec = specOf(ai);
    const e = ai.e;
    if (!spec || e.isDead) return;
    if (!st.engaged && (e.hpFrac < 0.999 || ai.aggroed)) engage(ai, st);

    if (playerNear(ai, METIN_ENGAGE_RANGE)) {
      st.idle = 0;
      st.cleared = 0;
    } else {
      st.idle = (st.idle ?? 0) + dt;
      if (st.idle >= IDLE_HEAL_AFTER) {
        idle(ai, st, dt);
        return;
      }
    }
    if (!st.engaged) return;

    // waves at the HP thresholds; several crossed by one hit come out one after another
    const waves = spec.waves;
    let slot = 0;
    while (st.w < waves.length && e.hpFrac <= waves[st.w].hpBelow) {
      const k = st.w;
      st.w = k + 1;
      const delay = slot * WAVE_GAP;
      slot++;
      if (delay <= 0) spawnWave(ai, spec, k);
      else ai.schedule(delay, () => spawnWave(ai, spec, k), 'metin_wave');
    }

    // periodic adds (cap counts every mob this stone still owns)
    st.addT += dt;
    if (st.addT >= spec.add.everySec) {
      st.addT = 0;
      const n = Math.min(spec.add.count, spec.add.cap - metinChildren(ai).length);
      if (n > 0) ai.spawnAdds(spec.add.enemyId, n, { radius: 6, aggro: true, tag: 'metin_add' });
    }

    st.auraT -= dt;
    if (st.auraT <= 0) {
      st.auraT = AURA_EVERY;
      aura(ai, spec);
    }

    if (spec.pulse) {
      st.pulseT -= dt;
      if (st.pulseT <= 0) {
        st.pulseT = spec.pulse.everySec;
        pulse(ai, spec);
      }
    }
  },
  onDeath(ai, _ab, _st, killerId) {
    const e = ai.e;
    const x = e.position.x, z = e.position.z;
    bossFx('ground_slam', x, z, { scale: 2.2 });
    bossFx('shockwave', x, z, { scale: 3, color: e.def.tint ?? 0xffffff, dur: 1.2 });
    bossFx('loot_beam', x, z, { color: e.def.tint ?? 0xffffff, dur: 4 });
    bossMsg('boss_shake', { i: 0.3, d: 0.6 });
    const killer = killerId != null ? ai.world.getActor(killerId) : undefined;
    bossMsg('boss_announce', { k: 0 }, { text: `${e.def.name} yıkıldı!${killer ? ` — ${killer.name}` : ''}` });
    G.events.emit('world:metinChanged', { id: String(e.id), tierId: e.def.id, pos: [x, z], active: false });
  },
};

/** Passive table entries for ai/abilities.ts (keyed by the ability id `metin_core`). */
export const METIN_PASSIVES: Record<string, PassiveHandler> = { metin_core: metinCore };
