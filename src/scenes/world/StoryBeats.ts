import { G } from '../../game/G';
import { spawnEnemy } from '../../entities/EnemyFactory';
import type { Enemy } from '../../entities/Enemy';
import type { WorldCtx } from './util';

/**
 * Story beats: scripted moments built on existing hooks only. The trigger is the quest state event (`quest:updated`), the
 * villain is spawned with the rare path (spawnEnemy, aggro off), its lines are speech bubbles (G.ui.say, like the bark
 * service), and it leaves through Enemy.escape() (the same removal as the reset adds, no death). Host only, like the rares;
 * a client accepting the quest sees no beat. Each beat runs once per character (save flag).
 * OWNER: scenes module.
 */

interface Taunt { at: number; text: string }

interface Beat {
  questId: string;
  flag: string;
  enemyId: string;
  name: string;
  /** Tile of the spawn point (snapped to walkable ground); the villain stands a few steps off the outpost. */
  tile: [number, number];
  level: number;
  taunts: Taunt[];
  /** Seconds after the spawn when the villain retreats (escape). */
  leaveAt: number;
}

const BEATS: Beat[] = [
  {
    questId: 'mq_05_yagmaci_kampi', flag: 'story.girtlak_taunt', enemyId: 'mb_girtlak', name: 'Yağmacı Başı Gırtlak', tile: [262, 42], level: 5,
    taunts: [
      { at: 0, text: 'Demek bu kadar cesur bir yabancı. Karakolunu bana kadar getirmişsin.' },
      { at: 5, text: 'Kadim Mühür\'ü korumaya çalışıyorsun. Boşuna.' },
      { at: 11, text: 'Bu kez çekiliyorum, ama adımı unutma. Kampıma gel, orada bekliyorum.' },
    ],
    leaveAt: 18,
  },
];

interface Run {
  beat: Beat;
  t: number;
  enemy: Enemy | null;
  said: number;
  done: boolean;
}

export class StoryBeats {
  private readonly runs: Run[] = [];
  private off: (() => void) | null = null;

  constructor(private readonly ctx: WorldCtx) {
    this.off = G.events?.on('quest:updated', ({ questId, state }) => {
      if (state !== 'active' || !G.net?.isAuthority) return;
      const beat = BEATS.find((b) => b.questId === questId);
      if (!beat || !this.firstTime(beat.flag)) return;
      this.start(beat);
    }) ?? null;
  }

  update(dt: number): void {
    for (const run of this.runs) {
      if (run.done) continue;
      run.t += dt;
      const e = run.enemy;
      if (!e) {
        if (run.t > 15) run.done = true;
        continue;
      }
      if (e.isDead || e.removed) {
        run.done = true;
        continue;
      }
      const { taunts, leaveAt } = run.beat;
      while (run.said < taunts.length && run.t >= taunts[run.said].at) {
        this.say(e, run.beat, taunts[run.said].text);
        run.said++;
      }
      if (run.t >= leaveAt) {
        e.escape();
        run.done = true;
      }
    }
    if (this.runs.some((r) => r.done)) this.runs.splice(0, this.runs.length, ...this.runs.filter((r) => !r.done));
  }

  dispose(): void {
    this.off?.();
    this.off = null;
    for (const run of this.runs) if (run.enemy && !run.done && !run.enemy.removed) run.enemy.escape();
    this.runs.length = 0;
  }

  private start(beat: Beat): void {
    const run: Run = { beat, t: 0, enemy: null, said: 0, done: false };
    this.runs.push(run);
    const spot = this.ctx.snapTile(beat.tile[0], beat.tile[1], 8);
    spawnEnemy(this.ctx.world, beat.enemyId, spot, { level: beat.level, aggro: false })
      .then((e) => {
        if (!e || e.removed) run.done = true;
        else run.enemy = e;
      })
      .catch(() => {
        run.done = true;
      });
  }

  private say(e: Enemy, beat: Beat, text: string): void {
    if (e.object3d) G.ui?.say(e.object3d, { kind: 'npc', text, name: beat.name, color: '#ff9a7a', seconds: 4.5, offsetY: (e.height ?? 2) + 1.2 });
    G.barks?.rumor(beat.name, text);
  }

  /** Once per character: the flag is written when the beat starts. */
  private firstTime(key: string): boolean {
    const save = G.character?.save;
    if (!save) return false;
    save.flags ??= {};
    if (save.flags[key]) return false;
    save.flags[key] = true;
    return true;
  }
}
