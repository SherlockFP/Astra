import { G } from '../game/G';
import { RNG, clamp } from '../core/utils';
import { DUNGEONS, DUNGEON_IDS, getDungeon } from '../data/dungeons';
import { HOST_DYNAMIC_ID_BASE } from '../types/common';
import type { AffixId, MythicAffixDef, RunRecord, RunState } from '../types/mythic';
import type { KeystoneData, ItemInstance } from '../types/items';
import type { Enemy } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import type { HitShapeSpec } from '../combat/HitShapes';
import { Affixes, isAffixUnit } from './Affixes';
import {
  COUNTDOWN_SEC, DEATH_PENALTY_SEC, DIFFICULTY_MULT, MAX_KEY_LEVEL, MIN_KEY_LEVEL, MPLUS_TR, MYTHIC_AFFIXES,
  affixesForWeek, computeRunScore, currentWeek, dungeonScore, isAffixId, keystoneTitle, mplusDmg, mplusHp, partyHpFactor, upgradeLevelsFor,
  vaultItemLevel, weekStartMs,
} from '../data/mythicAffixes';

export interface RunParams {
  dungeonId: string;
  difficulty: RunState['difficulty'];
  keyLevel: number;
  affixes: AffixId[];           // decided by the host when the run is started (DungeonParams.affixes)
  seed: number;
  enemyLevel: number;
  partySize: number;
  /** REAL peer id whose keystone is used (upgraded/depleted on completion). */
  keyOwner: string;
}

type HitSpecNoId = Omit<HitShapeSpec, 'id'>;

/** Which events/side effects were already produced for the current state (host and clients share the same diff logic). */
interface Shown {
  cc: number; started: boolean; forces: number; deaths: number; completed: boolean; failed: boolean;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const toast = (text: string, kind: 'info' | 'success' | 'warning' | 'error' | 'loot' | 'levelup' | 'boss' = 'info'): void => {
  try { G.events.emit('ui:toast', { text, kind }); } catch { /* ignore */ }
};
const dungeonName = (id: string): string => DUNGEONS[id]?.name ?? id;

/**
 * Dungeon run controller (all difficulties; Mythic+ adds timer, affixes, scaling, keystones, score).
 * HOST-authoritative: begin/update/onEnemyKilled/... run on the host (or offline); clients call applyRemoteState.
 * COMPLETION RUNS ON EVERY PEER: when state.completed flips false->true (host: locally; clients: in applyRemoteState)
 * each peer records the run + rating for G.character, rolls its own rewards (G.loot.endOfRunRewards), upgrades/depletes
 * the keystone iff keyOwner === G.net.selfId, then emits 'run:completed' locally.
 * Player-side affix effects (grievous, bursting stacks...) run on each peer for its own local player from state.affixes.
 * The keystone lives ONLY in G.character.save.mythic.keystone (not as a bag item); emit 'keystone:changed' on change.
 * Affix behaviours live in systems/Affixes.ts and hook in here. Clear everything on 'scene:leaving' from the dungeon.
 *
 * Time base: the run clock is a monotonic REAL-time clock (clock(): unscaled by hit-stop / slow-mo, at most 30 s per read so a frozen
 * tab cannot skip a key; Engine.time is capped at 0.1 s per frame and would stretch the 10 s countdown to minutes on a throttled tab).
 * The host's value is replicated in `RunState.elapsed` (1 Hz + on every discrete change) and clients advance it locally in between.
 * OWNER: mythic+ module.
 */
export class MythicPlus {
  state: RunState | null = null;
  /** Params of the prepared run (null outside runs). */
  params: RunParams | null = null;
  /** Affix gameplay (systems/Affixes.ts). */
  readonly fx: Affixes;
  /** Result of the last completed run on this peer (HUD / summary). */
  lastRecord: RunRecord | null = null;
  /** Params of the most recent run: stays readable after end() (leaving the dungeon) until the next prepare(); the run summary reads it. */
  lastParams: RunParams | null = null;
  /** Was the local player the key owner of the most recent run? null before any run. Survives end() like lastParams. */
  lastKeyOwner: boolean | null = null;
  lastRewards: ItemInstance[] = [];
  lastRatingDelta = 0;
  /** A boss encounter is running (death affixes are suppressed). Driven by boss:engaged/defeated/wipe. */
  bossActive = false;

  private begun = false;
  private t0 = 0;                    // engine time when the timer started
  private countdownEnd = 0;          // engine time when the countdown ends
  private timeWarp = 0;              // dev: seconds added to the clock
  private swarmDeaths = 0;           // horde rule counter
  private lastSig = '';
  private lastSend = -99;
  private shown: Shown = { cc: -1, started: false, forces: 0, deaths: 0, completed: false, failed: false };
  private remoteBase: { elapsed: number; countdown: number; at: number } | null = null;
  private keyHandled = false;
  private warnedFx = false;
  private wall = 0;                  // monotonic run clock (seconds)
  private wallAt = 0;                // performance.now() of the previous clock() read

  constructor() {
    this.fx = new Affixes(this);
    const ev = G.events;
    ev?.on('scene:leaving', ({ from }) => {
      if (from === 'dungeon') this.end();
    });
    ev?.on('scene:changed', ({ to }) => {
      if (to === 'town') {
        try { this.recoverUnfinishedRun(); } catch (e) { console.error('[mplus] recover failed', e); }
      }
      if (to === 'town' || to === 'dungeon') this.weeklyMaintenance();
    });
    ev?.on('boss:engaged', () => { this.bossActive = true; });
    ev?.on('boss:defeated', () => { this.bossActive = false; });
    ev?.on('boss:wipe', () => { this.bossActive = false; });
    G.net?.on('run', (s) => this.applyRemoteState(s));
    G.net?.on('affix', (m) => this.fx.handle(m));
  }

  /** Dev/tests: force the role seen by this instance ('client' mirrors a remote peer); null = the real NetSession role. */
  debugRole: 'host' | 'client' | null = null;
  /** Dev/tests: mirror instance that must not emit global events / run completion handlers. */
  debugMuted = false;

  /** Monotonic real-time run clock in seconds (see class doc). Safe to call from anywhere, any number of times. */
  private clock(): number {
    const n = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.wallAt) this.wall += Math.min(30, Math.max(0, (n - this.wallAt) / 1000));
    this.wallAt = n;
    return this.wall;
  }

  /** M+ affix units (explosive orbs, spiteful shades, Efsun guardians): they never give loot / XP / kills (Combat asks). */
  isAffixUnit(enemy: Enemy | null | undefined): boolean {
    return isAffixUnit(enemy);
  }

  /** offline or party host */
  get isHost(): boolean {
    if (this.debugRole) return this.debugRole === 'host';
    return !G.net || G.net.isAuthority;
  }

  get active(): boolean {
    return !!this.state && !this.state.completed && !this.state.failed;
  }

  /** True while an M+ key run (keyLevel >= 2) is in progress or finished. */
  get isKeyRun(): boolean {
    return !!this.state && this.state.difficulty === 'mythicplus' && this.state.keyLevel >= MIN_KEY_LEVEL;
  }

  /* ================================================================================ lifecycle */

  /**
   * EVERY peer, before enemies are spawned: set up `state` (not started) so enemyScaling()/affixes are correct
   * for spawns on host and clients alike.
   */
  prepare(params: RunParams): void {
    this.end(true);
    try { this.recoverUnfinishedRun({ dungeonId: params.dungeonId, keyLevel: Math.floor(params.keyLevel) }); } catch (e) { console.error('[mplus] recover failed', e); }
    const def = getDungeon(params.dungeonId);
    const mplus = params.difficulty === 'mythicplus';
    const keyLevel = mplus ? clamp(Math.floor(params.keyLevel) || MIN_KEY_LEVEL, MIN_KEY_LEVEL, MAX_KEY_LEVEL) : 0;
    const affixes = mplus ? (params.affixes ?? []).filter(isAffixId).slice(0, 6) : [];
    this.params = { ...params, keyLevel, affixes: [...affixes], partySize: clamp(Math.floor(params.partySize) || 1, 1, 5) };
    this.lastParams = this.params;
    this.lastKeyOwner = this.isKeyOwner();
    this.state = {
      dungeonId: params.dungeonId, difficulty: params.difficulty, keyLevel, affixes: [...affixes], seed: (params.seed >>> 0) || 1,
      started: false, startTime: 0, elapsed: 0, timerSec: mplus ? def?.timerSec ?? 0 : 0, deaths: 0, deathPenaltySec: 0,
      forces: 0, forcesRequired: def?.forcesRequired ?? 0, bossesKilled: [], bossesTotal: def?.bosses.length ?? 0,
      completed: false, failed: false, inTime: false, upgradeLevels: 0, countdown: 0,
    };
    this.begun = false;
    this.keyHandled = false;
    this.timeWarp = 0;
    this.swarmDeaths = 0;
    this.bossActive = false;
    this.lastSig = '';
    this.lastSend = -99;
    this.shown = { cc: -1, started: false, forces: 0, deaths: 0, completed: false, failed: false };
    this.remoteBase = null;
    this.lastRecord = null;
    this.lastRewards = [];
    this.lastRatingDelta = 0;
    this.fx.start(this.state, this.params);
  }

  /** HOST only, after 'party:allLoaded' (offline: right after spawning): start the 10 s countdown, then the timer. */
  begin(): void {
    const s = this.state;
    if (!s || !this.isHost || this.begun || s.completed || s.failed) return;
    this.setBegun();
    if (s.difficulty === 'mythicplus') {
      s.countdown = COUNTDOWN_SEC;
      this.countdownEnd = this.clock() + COUNTDOWN_SEC;
    } else {
      this.startTimer();
    }
    this.commit(true);
  }

  /** The key is in (host: begin(); clients: first replicated state with countdown/started). Marks the key owner's save as "run active". */
  private setBegun(): void {
    if (this.begun) return;
    this.begun = true;
    this.markActive(true);
  }

  /**
   * Key owner only: remember in the save that a key run is unfinished. If the tab is closed / the game crashes mid-run the flag stays
   * and the next town visit applies the abandon rule (GDD 5.13: "the owner's client applies the abandon rule the next time it sees
   * the unfinished run in its save"). Cleared on completion, abandon and end().
   */
  private markActive(on: boolean): void {
    const ch = G.character;
    const p = this.params;
    if (!ch || !p || p.difficulty !== 'mythicplus' || !this.isKeyOwner()) return;
    try {
      if (on) {
        ch.save.flags.mplusActive = `${p.dungeonId}|${p.keyLevel}`;
        ch.persist(true);
      } else if (ch.save.flags.mplusActive !== undefined) {
        delete ch.save.flags.mplusActive;
        ch.persist();
      }
    } catch { /* ignore */ }
  }

  /** An unfinished key run left in the save (crash / closed tab): the key drops one level, same dungeon, depleted. Idempotent. */
  private recoverUnfinishedRun(next?: { dungeonId: string; keyLevel: number }): void {
    const ch = G.character;
    const raw = ch?.save.flags.mplusActive;
    if (!ch || typeof raw !== 'string') return;
    const [dungeonId, lv] = raw.split('|');
    const level = Number(lv);
    if (next && next.dungeonId === dungeonId && next.keyLevel === level) return;   // rejoining the very same key run
    if (this.state && !this.state.completed && !this.state.failed) return;       // a run is in progress right now
    delete ch.save.flags.mplusActive;
    const ks = ch.save.mythic.keystone;
    if (ks && ks.dungeonId === dungeonId && ks.level === level) {
      ch.save.mythic.keystone = { dungeonId, level: Math.max(MIN_KEY_LEVEL, level - 1), depleted: true };
      G.events.emit('keystone:changed', {});
      toast(MPLUS_TR.abandoned, 'warning');
    }
    ch.persist(true);
  }

  private startTimer(): void {
    const s = this.state!;
    s.countdown = 0;
    s.started = true;
    s.startTime = G.world?.time ?? 0;
    s.elapsed = s.deathPenaltySec;
    this.t0 = this.clock();
  }

  /** Leave/finish the run (cleanup timers, affix systems). An unfinished key run counts as abandoned for this peer. */
  end(silent = false): void {
    const s = this.state;
    if (s && !silent && !s.completed && !s.failed && s.difficulty === 'mythicplus' && this.begun) {
      s.failed = true;
      try { this.emitDiff(); } catch (e) { console.error('[mplus] abandon on end failed', e); }
      if (this.isHost) try { G.net?.broadcast('run', this.snapshot(s)); } catch { /* ignore */ }
    }
    this.markActive(false);
    this.fx.stop();
    this.state = null;
    this.params = null;
    this.begun = false;
    this.remoteBase = null;
    this.bossActive = false;
  }

  /** HOST: abandon the run now (key owner "Koşuyu Terk Et" after the party vote). Key -1, same dungeon, depleted. */
  abandon(): void {
    const s = this.state;
    if (!s || s.completed || s.failed || !this.isHost) return;
    s.failed = true;
    this.commit(true);
  }

  /* ================================================================================ weekly rotation / scaling / score */

  /** Affixes active for a key level in a given week (default: current real-world week). `week` is a core/utils weekIndex(). */
  affixesFor(level: number, week?: number): AffixId[] {
    return affixesForWeek(level, week ?? currentWeek());
  }

  getAffix(id: AffixId): MythicAffixDef | undefined {
    return MYTHIC_AFFIXES[id];
  }

  /** HP/damage multipliers for enemies in the current run (1/1 outside runs). Party HP scaling is NOT included (see partyHpMult). */
  enemyScaling(isBoss: boolean): { hp: number; dmg: number } {
    const s = this.state;
    if (!s) return { hp: 1, dmg: 1 };
    if (s.difficulty === 'mythicplus') return this.scalingFor(s.keyLevel, s.affixes, isBoss);
    const d = DIFFICULTY_MULT[s.difficulty as 'normal' | 'heroic' | 'mythic'] ?? DIFFICULTY_MULT.normal;
    return { hp: d.hp, dmg: d.dmg };
  }

  /** HP multiplier for the party size of the current run: x(1 + 0.7 (n-1)) in Mythic+, x(1 + 0.6 (n-1)) otherwise. 1 outside runs. */
  partyHpMult(): number {
    const p = this.params;
    if (!p) return 1;
    return partyHpFactor(p.partySize, p.difficulty === 'mythicplus');
  }

  /** Multipliers for an arbitrary level/affix set (tooltips, keystone UI). */
  scalingFor(level: number, affixes: AffixId[], isBoss: boolean): { hp: number; dmg: number } {
    if (level < MIN_KEY_LEVEL) return { hp: 1, dmg: 1 };
    let hp = mplusHp(level);
    let dmg = mplusDmg(level);
    const f = MYTHIC_AFFIXES.fortified?.params;
    const t = MYTHIC_AFFIXES.tyrannical?.params;
    if (!isBoss && affixes.includes('fortified') && f) { hp *= 1 + f.trashHpPct; dmg *= 1 + f.trashDmgPct; }
    if (isBoss && affixes.includes('tyrannical') && t) { hp *= 1 + t.bossHpPct; dmg *= 1 + t.bossDmgPct; }
    return { hp, dmg };
  }

  /** Score for a timed/untimed run (Raider.io-like). */
  computeScore(level: number, timeSec: number, timerSec: number, _affixes: AffixId[] = []): number {
    return round2(computeRunScore(level, timeSec, timerSec));
  }

  /** Recompute the local character's rating from its best runs. */
  recomputeRating(): number {
    const m = G.character?.save.mythic;
    if (!m) return 0;
    let total = 0;
    for (const k of Object.keys(m.best)) total += dungeonScore(m.best[k]?.fortified?.score ?? 0, m.best[k]?.tyrannical?.score ?? 0);
    m.rating = round1(total);
    return m.rating;
  }

  /* ================================================================================ host hooks */

  /**
   * Called by the enemy factory (host only) for every enemy that enters the world: visual set-up of affix units, inspiring aura...
   * Clients never get this call, so Affixes also scans the world every 0.4 s on EVERY peer and runs the same (idempotent) set-up.
   */
  onEnemySpawned(enemy: Enemy): void {
    try { this.fx.onSpawned(enemy); } catch (e) { this.warnFx(e); }
  }

  /** HOST: forces + death-triggered affixes. Called only by Combat (single caller). */
  onEnemyKilled(enemy: Enemy): void {
    const s = this.state;
    if (!s || !this.isHost || s.completed || s.failed) return;
    try {
      if (isAffixUnit(enemy)) {
        this.fx.onEnemyKilled(enemy, false);
        return;
      }
      if (!s.started) return;
      const summoned = enemy.id >= HOST_DYNAMIC_ID_BASE;
      let gained = 0;
      if (!summoned && !enemy.forcesCounted) {
        gained = Math.max(0, enemy.def.forces ?? 0);
        enemy.forcesCounted = true;
      }
      if (gained > 0) {
        const req = Math.max(1, s.forcesRequired);
        const prev = s.forces / req;
        // Mythic+: the bar stops at 100 % (like WoW), the surplus is not kept
        s.forces = this.requiresForces(s) ? Math.min(s.forcesRequired, s.forces + gained) : s.forces + gained;
        this.fx.onForces(prev, s.forces / req);
      }
      // death affixes: non-summoned, non-boss, outside boss fights; swarm deaths count every 3rd (horde rule)
      let trigger = !summoned && !this.bossActive && (enemy.def.rank === 'trash' || enemy.def.rank === 'elite');
      if (trigger && enemy.def.role === 'swarm') trigger = ++this.swarmDeaths % 3 === 0;
      this.fx.onEnemyKilled(enemy, trigger);
      this.checkCompletion();
    } catch (e) {
      this.warnFx(e);
    }
    this.commit();
  }

  /** HOST: a boss died (Combat calls this after onEnemyKilled). */
  onBossKilled(bossId: string): void {
    const s = this.state;
    if (!s || !this.isHost || s.completed || s.failed) return;
    if (!s.bossesKilled.includes(bossId)) s.bossesKilled.push(bossId);
    this.bossActive = false;
    this.checkCompletion();
    this.commit(true);
  }

  /** HOST: a player died (+15 s on key runs). Called by Combat for local deaths and replicated deaths. */
  onPlayerDeath(_player: Player): void {
    const s = this.state;
    if (!s || !this.isHost || !s.started || s.completed || s.failed) return;
    s.deaths++;
    if (s.difficulty === 'mythicplus') {
      s.deathPenaltySec += DEATH_PENALTY_SEC;
      s.elapsed = this.computeElapsed();
    }
    this.commit(true);
  }

  /**
   * HOST: let affixes modify an enemy-caused hit before it is spawned (Necrotic adds a stacking debuff on melee hits).
   * Fortified/Tyrannical/Bolstering/Raging damage is already in enemyScaling / the enemy's status stat mods.
   */
  decorateHitShape(enemy: Enemy, spec: HitSpecNoId): HitSpecNoId {
    try { return this.fx.decorateHitShape(enemy, spec); } catch (e) { this.warnFx(e); return spec; }
  }

  /** Combat helper: may this damage hurt this enemy? (Explosive orbs ignore DoTs and zone ticks.) */
  canDamageEnemy(enemy: Enemy, opts: { dot?: boolean; tick?: boolean } = {}): boolean {
    return this.fx.canDamage(enemy, opts);
  }

  private warnFx(e: unknown): void {
    if (this.warnedFx) return;
    this.warnedFx = true;
    console.error('[mplus] hook failed', e);
  }

  /* ================================================================================ completion */

  private requiresForces(s: RunState): boolean {
    return s.difficulty === 'mythicplus' && s.forcesRequired > 0;
  }

  /** Host: every boss dead and (Mythic+) forces >= 100 % -> complete. If the final boss dies first, completion waits for forces. */
  checkCompletion(): void {
    const s = this.state;
    if (!s || !this.isHost || !s.started || s.completed || s.failed) return;
    if (s.bossesKilled.length < Math.max(1, s.bossesTotal)) return;
    if (this.requiresForces(s) && s.forces < s.forcesRequired) return;
    s.elapsed = this.computeElapsed();
    s.completed = true;
    s.inTime = s.timerSec <= 0 || s.elapsed <= s.timerSec;
    s.upgradeLevels = s.difficulty === 'mythicplus' && s.inTime ? upgradeLevelsFor(s.elapsed, s.timerSec) : 0;
    this.commit(true);
  }

  /** Runs on EVERY peer when completed flips (host: from commit(); clients: from applyRemoteState). */
  private handleCompleted(): void {
    const s = this.state;
    if (!s) return;
    const ch = G.character;
    const isKey = s.difficulty === 'mythicplus' && s.keyLevel >= MIN_KEY_LEVEL;
    let record: RunRecord | null = null;
    let delta = 0;
    this.markActive(false);
    this.weeklyMaintenance();
    if (ch) {
      const m = ch.save.mythic;
      const before = m.rating;
      if (isKey) {
        const score = this.computeScore(s.keyLevel, s.elapsed, s.timerSec, s.affixes);
        record = {
          dungeonId: s.dungeonId, keyLevel: s.keyLevel, timeSec: Math.round(s.elapsed), timerSec: s.timerSec, inTime: s.inTime, upgrade: s.upgradeLevels,
          affixes: [...s.affixes], score, date: Date.now(), party: this.partyNames(),
        };
        // filed under the week's +2 affix (first of the two base affixes), even at +12 where both are active
        const slot: 'fortified' | 'tyrannical' = s.affixes.find((a) => a === 'fortified' || a === 'tyrannical') === 'tyrannical' ? 'tyrannical' : 'fortified';
        const best = (m.best[s.dungeonId] ??= {});
        const cur = best[slot];
        if (!cur || score >= cur.score) best[slot] = record;
        m.weekly.runs.push(record);
        this.recomputeRating();
        delta = round1(m.rating - before);
      }
      ch.save.stats.dungeonsCompleted++;
      if (isKey && s.inTime) ch.save.stats.highestKey = Math.max(ch.save.stats.highestKey, s.keyLevel);
      if (s.difficulty === 'mythic') ch.save.flags.clearedM0 = true;
    }
    let rewards: ItemInstance[] = [];
    try { rewards = G.loot?.endOfRunRewards(s) ?? []; } catch (e) { console.error('[mplus] endOfRunRewards failed', e); }
    try { this.applyKeyResult(s); } catch (e) { console.error('[mplus] key result failed', e); }
    if (ch && s.difficulty === 'mythic' && !ch.save.mythic.keystone) this.grantKeystone();
    try { ch?.persist(true); } catch { /* ignore */ }
    this.lastRecord = record;
    this.lastRewards = rewards;
    this.lastRatingDelta = delta;
    if (isKey) {
      toast(s.inTime ? MPLUS_TR.bannerTimed(s.upgradeLevels, s.elapsed, s.timerSec, s.deaths) : MPLUS_TR.bannerUntimed(s.elapsed, s.timerSec, s.deaths), s.inTime ? 'success' : 'warning');
      if (delta > 0 && record && ch) {
        toast(MPLUS_TR.score(ch.save.mythic.rating, delta), 'success');
        this.later(900, () => G.audio?.play('achievement'));
      }
    }
    G.events.emit('run:completed', { state: s, record, rewards });
  }

  /** Runs on EVERY peer when `failed` flips (abandoned): the key owner drops one level (same dungeon, depleted). */
  private handleAbandoned(): void {
    const s = this.state;
    const ch = G.character;
    if (!s || !ch || s.difficulty !== 'mythicplus' || this.keyHandled) return;
    this.keyHandled = true;
    this.markActive(false);
    if (!this.isKeyOwner()) return;
    ch.save.mythic.keystone = { dungeonId: s.dungeonId, level: Math.max(MIN_KEY_LEVEL, s.keyLevel - 1), depleted: true };
    ch.persist(true);
    G.events.emit('keystone:changed', {});
    toast(MPLUS_TR.abandoned, 'warning');
    G.audio?.play('keystone_deplete');
  }

  private isKeyOwner(): boolean {
    const p = this.params;
    return !!p && p.keyOwner === (G.net?.selfId ?? 'local');
  }

  private partyNames(): string[] {
    try { return (G.net?.members() ?? []).map((p) => p.name).filter(Boolean).slice(0, 5); } catch { return []; }
  }

  /** Keystone upgrade/deplete (§5.8). Owner: +N / -1 and a new random dungeon; party members with a lower key get +1 (timed). */
  private applyKeyResult(s: RunState): void {
    const ch = G.character;
    if (!ch || s.difficulty !== 'mythicplus' || this.keyHandled) return;
    this.keyHandled = true;
    const m = ch.save.mythic;
    const L = s.keyLevel;
    const timed = s.inTime;
    if (this.isKeyOwner()) {
      const level = timed ? Math.min(MAX_KEY_LEVEL, L + Math.max(1, s.upgradeLevels)) : Math.max(MIN_KEY_LEVEL, L - 1);
      const dungeonId = this.pickKeyDungeon(s.dungeonId);
      m.keystone = { dungeonId, level, depleted: !timed };
      G.events.emit('keystone:changed', {});
      toast(timed ? MPLUS_TR.timed(Math.max(1, s.upgradeLevels), dungeonName(dungeonId), level) : MPLUS_TR.untimed(dungeonName(dungeonId), level), timed ? 'success' : 'warning');
      this.later(1400, () => G.audio?.play(timed ? 'keystone_upgrade' : 'keystone_deplete'));
      G.vfx?.spawn('keystone_upgrade', G.player?.position ?? [0, 0, 0]);
      return;
    }
    const ks = m.keystone;
    if (timed) {
      if (ks && ks.level < L) {
        ks.level = Math.min(MAX_KEY_LEVEL, ks.level + 1);
        G.events.emit('keystone:changed', {});
        toast(keystoneTitle(dungeonName(ks.dungeonId), ks.level), 'success');
      } else if (!ks) {
        this.grantKeystone(undefined, Math.max(MIN_KEY_LEVEL, L - 2));
      }
    } else if (!ks) {
      this.grantKeystone(undefined, Math.max(MIN_KEY_LEVEL, L - 3));
    }
  }

  private later(ms: number, fn: () => void): void {
    setTimeout(() => { try { fn(); } catch { /* ignore */ } }, ms);
  }

  /* ================================================================================ keystone & services */

  /** Key dungeons: DUNGEON_IDS only (open-world zones such as Sisli Koru are never keystone dungeons). */
  private dungeonPool(): string[] {
    const ids = DUNGEON_IDS.filter((id) => !!DUNGEONS[id]);
    return ids.length ? ids : Object.keys(DUNGEONS);
  }

  /** Random dungeon id, different from `exclude` when possible. */
  pickKeyDungeon(exclude?: string): string {
    const pool = this.dungeonPool();
    if (!pool.length) return exclude ?? '';
    const choices = pool.filter((d) => d !== exclude);
    const rng = new RNG(((Math.random() * 2 ** 32) >>> 0) || 1);
    return rng.pick(choices.length ? choices : pool);
  }

  /** Give the local character a keystone (e.g. after a Mythic 0 clear). */
  grantKeystone(dungeonId?: string, level = MIN_KEY_LEVEL): void {
    const ch = G.character;
    if (!ch) return;
    const d = dungeonId ?? this.pickKeyDungeon();
    const lv = clamp(Math.floor(level), MIN_KEY_LEVEL, MAX_KEY_LEVEL);
    ch.save.mythic.keystone = { dungeonId: d, level: lv };
    ch.persist();
    G.events.emit('keystone:changed', {});
    toast(MPLUS_TR.newKey(dungeonName(d), lv), 'success');
    G.audio?.play('keystone_upgrade');
  }

  keystone(): KeystoneData | null {
    return G.character?.save.mythic.keystone ?? null;
  }

  /**
   * Weekly upkeep for the local character (idempotent): the vault week + weekly run list roll over, and a keystone held across
   * the weekly reset drops one level, gets a new random dungeon and loses `depleted` (GDD 5.8).
   */
  weeklyMaintenance(): void {
    const ch = G.character;
    if (!ch) return;
    const m = ch.save.mythic;
    const w = currentWeek();
    let changed = false;
    if (m.weekly.week !== w) {
      m.weekly = { week: w, runs: [] };
      changed = true;
    }
    const seen = ch.save.flags.keystoneWeek;
    if (typeof seen !== 'number') {
      ch.save.flags.keystoneWeek = w;
      changed = true;
    } else if (seen !== w) {
      ch.save.flags.keystoneWeek = w;
      const ks = m.keystone;
      if (ks) {
        m.keystone = { dungeonId: this.pickKeyDungeon(ks.dungeonId), level: Math.max(MIN_KEY_LEVEL, ks.level - 1) };
        G.events.emit('keystone:changed', {});
      }
      changed = true;
    }
    if (changed) ch.persist();
  }

  /** Weekly vault: rewards available for the local character (slots at 1 / 4 / 8 completed key runs; ilvl 63 + 2 x min(key, 15)). */
  vaultOptions(): { unlocked: number; itemLevels: number[] } {
    this.weeklyMaintenance();
    const runs = G.character?.save.mythic.weekly.runs ?? [];
    const keys = runs.map((r) => r.keyLevel).sort((a, b) => b - a);
    const slots = [1, 4, 8];
    const itemLevels: number[] = [];
    for (const n of slots) if (keys.length >= n) itemLevels.push(vaultItemLevel(keys[n - 1]));
    return { unlocked: itemLevels.length, itemLevels };
  }

  /**
   * Take the vault reward of `slot` (0..2). Uses the item the vault panel already rolled (flags `vault.items.<week>`) when present,
   * otherwise rolls one (min Destansı; Efsanevi 15 %, Set 15 %). One claim per week. False when nothing to claim / bag full.
   */
  claimVault(slot: number): boolean {
    const ch = G.character;
    if (!ch) return false;
    const m = ch.save.mythic;
    const w = currentWeek();
    const opts = this.vaultOptions();
    if (m.vaultClaimedWeek === w || slot < 0 || slot >= opts.unlocked) return false;
    let item: ItemInstance | undefined;
    const cached = ch.save.flags[`vault.items.${w}`];
    if (typeof cached === 'string') {
      try { item = (JSON.parse(cached) as ItemInstance[])[slot]; } catch { item = undefined; }
    }
    if (!item) {
      const roll = Math.random();
      try {
        item = G.loot.rollItem({ itemLevel: opts.itemLevels[slot], rarity: roll < 0.15 ? 'legendary' : roll < 0.3 ? 'set' : 'epic', classId: ch.classId });
      } catch (e) { console.error('[mplus] vault roll failed', e); return false; }
    }
    item.bound = true;
    if (!ch.addItem(item)) {
      toast('Çantan dolu. Yer açıp tekrar dene.', 'warning');
      return false;
    }
    m.vaultClaimedWeek = w;
    ch.persist(true);
    toast('Kadim Kasa ödülü çantana eklendi!', 'loot');
    return true;
  }

  /** Cost and availability of the "Zindanı Değiştir" keystone service (free once per week while the key is unused this week). */
  changeDungeonInfo(): { free: boolean; cost: number } {
    const ch = G.character;
    const ks = ch?.save.mythic.keystone;
    if (!ch || !ks) return { free: false, cost: 0 };
    const unusedThisWeek = ch.save.mythic.weekly.week !== currentWeek() || ch.save.mythic.weekly.runs.length === 0;
    const freeUsed = ch.save.flags.keyChangeWeek === currentWeek();
    const free = unusedThisWeek && !freeUsed;
    return { free, cost: free ? 0 : 1000 * ks.level };
  }

  /** Keystone service: new dungeon, same level. Returns false when there is no key or the gold is missing. */
  changeKeystoneDungeon(dungeonId?: string): boolean {
    const ch = G.character;
    const ks = ch?.save.mythic.keystone;
    if (!ch || !ks) return false;
    const info = this.changeDungeonInfo();
    if (info.cost > 0 && !ch.spendGold(info.cost)) return false;
    if (info.free) ch.save.flags.keyChangeWeek = currentWeek();
    ch.save.mythic.keystone = { dungeonId: dungeonId ?? this.pickKeyDungeon(ks.dungeonId), level: ks.level, depleted: ks.depleted };
    ch.persist();
    G.events.emit('keystone:changed', {});
    return true;
  }

  /** Keystone service: level -1 (min +2), free. */
  lowerKeystone(): boolean {
    const ch = G.character;
    const ks = ch?.save.mythic.keystone;
    if (!ch || !ks || ks.level <= MIN_KEY_LEVEL) return false;
    ks.level--;
    ch.persist();
    G.events.emit('keystone:changed', {});
    return true;
  }

  /** Keystone service: the weekly +2 safety-net key (level 60, ever cleared a Mitik 0, no key, once per week). */
  claimWeeklyKey(): boolean {
    const ch = G.character;
    if (!ch || ch.save.mythic.keystone || ch.level < 60 || !ch.save.flags.clearedM0) return false;
    if (ch.save.flags.weeklyKeyWeek === currentWeek()) return false;
    ch.save.flags.weeklyKeyWeek = currentWeek();
    this.grantKeystone();
    return true;
  }

  /** "Haftalık Ekler": affixes of this and the next weeks for the standard key tiers. */
  weeklyAffixTable(weeks = 2): { week: number; startsAt: number; rows: { level: number; affixes: AffixId[] }[] }[] {
    const w0 = currentWeek();
    return Array.from({ length: weeks }, (_, i) => ({
      week: w0 + i,
      startsAt: weekStartMs(w0 + i),
      rows: [2, 4, 7, 10, 12].map((level) => ({ level, affixes: affixesForWeek(level, w0 + i) })),
    }));
  }

  /* ================================================================================ state sync */

  private snapshot(s: RunState): RunState {
    return { ...s, affixes: [...s.affixes], bossesKilled: [...s.bossesKilled] };
  }

  private computeElapsed(): number {
    const s = this.state;
    if (!s || !s.started) return s?.elapsed ?? 0;
    return Math.max(0, this.clock() - this.t0) + this.timeWarp + s.deathPenaltySec;
  }

  /** Emit the local events that correspond to the state change since the last call; triggers completion/abandon handlers. */
  private emitDiff(forceUpdated = false): void {
    const s = this.state;
    if (!s) return;
    const sh = this.shown;
    if (this.debugMuted) {
      sh.cc = Math.ceil(s.countdown); sh.started = s.started; sh.forces = s.forces; sh.deaths = s.deaths; sh.completed = s.completed; sh.failed = s.failed;
      return;
    }
    const ev = G.events;
    let changed = forceUpdated;
    if (!s.started && s.countdown > 0) {
      const cc = Math.ceil(s.countdown);
      if (cc !== sh.cc) { sh.cc = cc; changed = true; ev.emit('run:countdown', { seconds: cc }); }
    }
    if (s.started && !sh.started) {
      sh.started = true;
      changed = true;
      if (sh.cc > 0) ev.emit('run:countdown', { seconds: 0 });
      ev.emit('run:started', { state: s });
    }
    if (s.forces > sh.forces) {
      const gained = s.forces - sh.forces;
      sh.forces = s.forces;
      changed = true;
      ev.emit('run:forces', { forces: s.forces, required: s.forcesRequired, gained });
    }
    if (s.deaths > sh.deaths) {
      sh.deaths = s.deaths;
      changed = true;
      ev.emit('run:playerDeath', { deaths: s.deaths, penalty: s.deathPenaltySec });
    }
    if (changed) ev.emit('run:updated', { state: s });
    if (s.failed && !sh.failed) { sh.failed = true; this.handleAbandoned(); }
    if (s.completed && !sh.completed) { sh.completed = true; this.handleCompleted(); }
  }

  /** HOST: emit events, then replicate on every discrete change and at least once per second. */
  private commit(force = false): void {
    const s = this.state;
    if (!s) return;
    this.emitDiff();
    if (!this.isHost) return;
    const sig = `${+s.started}|${Math.ceil(s.countdown)}|${s.forces}|${s.bossesKilled.length}|${s.deaths}|${+s.completed}|${+s.failed}|${s.upgradeLevels}`;
    const now = this.clock();
    if (force || sig !== this.lastSig || now - this.lastSend >= 1) {
      this.lastSig = sig;
      this.lastSend = now;
      try { G.net?.broadcast('run', this.snapshot(s)); } catch { /* ignore */ }
    }
  }

  /** Clients: apply replicated state (untrusted: every field is clamped). */
  applyRemoteState(raw: RunState): void {
    const cur = this.state;
    if (!cur || this.isHost || !raw || typeof raw !== 'object' || raw.dungeonId !== cur.dungeonId) return;
    const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
    cur.started = !!raw.started;
    cur.startTime = n(raw.startTime, 0, 1e9, cur.startTime);
    cur.elapsed = n(raw.elapsed, 0, 86400, cur.elapsed);
    cur.timerSec = n(raw.timerSec, 0, 7200, cur.timerSec);
    cur.deaths = n(raw.deaths, 0, 999, cur.deaths);
    cur.deathPenaltySec = n(raw.deathPenaltySec, 0, 99999, cur.deathPenaltySec);
    cur.forces = n(raw.forces, 0, 1e6, cur.forces);
    cur.forcesRequired = n(raw.forcesRequired, 0, 1e6, cur.forcesRequired);
    cur.bossesTotal = n(raw.bossesTotal, 0, 32, cur.bossesTotal);
    cur.bossesKilled = Array.isArray(raw.bossesKilled) ? raw.bossesKilled.filter((b) => typeof b === 'string').slice(0, 32).map((b) => b.slice(0, 64)) : cur.bossesKilled;
    cur.inTime = !!raw.inTime;
    cur.upgradeLevels = n(raw.upgradeLevels, 0, 3, 0);
    cur.countdown = n(raw.countdown, 0, 60, 0);
    cur.completed = !!raw.completed;
    cur.failed = !!raw.failed;
    if (Array.isArray(raw.affixes)) cur.affixes = raw.affixes.filter(isAffixId).slice(0, 6);
    if (cur.started || cur.countdown > 0) this.setBegun();   // clients: the host inserted the key (abandon rules apply on leaving)
    this.remoteBase = { elapsed: cur.elapsed, countdown: cur.countdown, at: this.clock() };
    this.emitDiff(true);
  }

  /* ================================================================================ per frame */

  update(dt: number): void {
    const s = this.state;
    if (!s) return;
    const now = this.clock();
    try {
      if (this.isHost) {
        if (!s.completed && !s.failed) {
          if (!s.started) {
            if (s.countdown > 0) {
              s.countdown = Math.max(0, this.countdownEnd - now);
              if (s.countdown <= 0) this.startTimer();
            }
          } else {
            s.elapsed = this.computeElapsed();
          }
        }
        this.commit();
      } else if (this.remoteBase && !s.completed && !s.failed) {
        const b = this.remoteBase;
        if (s.started) s.elapsed = b.elapsed + (now - b.at);
        else if (b.countdown > 0) s.countdown = Math.max(0, b.countdown - (now - b.at));
        this.emitDiff();
      }
    } catch (e) {
      console.error('[mplus] update failed', e);
    }
    this.fx.update(dt);
  }

  /* ================================================================================ dev helpers */

  /** Dev: add seconds to the run clock (time travel for timer/upgrade tests). */
  debugAdvance(sec: number): void {
    this.timeWarp += sec;
    const s = this.state;
    if (s && s.started && !s.completed) s.elapsed = this.computeElapsed();
  }

  /** Dev: end the pre-run countdown on the next frame. */
  debugSkipCountdown(): void {
    this.countdownEnd = this.clock();
  }

  /** Dev: pretend the game was closed mid-run with the current key, then run the next-town-visit recovery (key -1, depleted). */
  debugSimulateCrashRecovery(): boolean {
    const ch = G.character;
    const ks = ch?.save.mythic.keystone;
    if (!ch || !ks) return false;
    ch.save.flags.mplusActive = `${ks.dungeonId}|${ks.level}`;
    const keep = this.state;
    this.state = null;   // recovery is skipped while a run is in progress
    try { this.recoverUnfinishedRun(); } finally { this.state = keep; }
    return true;
  }

  /** Dev: snapshot used by overlays. */
  debugSummary(): Record<string, unknown> {
    const s = this.state;
    return { host: this.isHost, begun: this.begun, bossActive: this.bossActive, swarmDeaths: this.swarmDeaths, keyOwner: this.params?.keyOwner ?? null, state: s ? this.snapshot(s) : null, fx: this.fx.debugInfo() };
  }
}
