/**
 * Minion behaviours (GDD_CLASSES_V2 §1.5 rule 7, NC41): `minion_summon` (SkillDef.minion rows, e.g. necro_golem, necro_army_of_the_dead)
 * and `minion_command` (necro_command_army, archer_kill_command, archer_call_pet, necro_death_order). Installed into BEHAVIORS by the
 * import at the end of behaviors.ts (microtask fallback, as in plateKit.ts). Owner: combat.
 * Remote replays do nothing: the owner's peer summons and commands; other peers get the minions from the `minion` net channel (NC43).
 *   minion_summon   `def.minion { id, count, cap, group, life, ignoreCap, cycle }`; id 'auto' = the class default (data/minions.ts)
 *   minion_command  params: `focusSec` (default 6) focus the target; `recall 1` clears the focus instead; `cmdCoef` each minion
 *                   within 40 m teleports to a ring round the target and strikes it once for cmdCoef x the owner's hit
 */
import { G } from '../../game/G';
import { BEHAVIORS, type Behavior, type CastCtx } from './behaviors';
import { CLASS_DEFAULT_MINION, minionDef } from '../../data/minions';
import type { MinionAttack, MinionDef } from '../../types/minions';
import type { ClassId } from '../../types/common';
import type { Enemy } from '../../entities/Enemy';

export const MINION_BEHAVIORS: Record<string, Behavior> = {};
const COMMAND_RANGE = 40;

/** Minion def for a summon row: 'auto' is the class default; unknown ids are logged and summon nothing. */
function defFor(id: string, classId: ClassId): MinionDef | undefined {
  const want = id === 'auto' ? (CLASS_DEFAULT_MINION[classId] ?? '') : id;
  const def = minionDef(want);
  if (!def) console.warn(`[minions] unknown minion def '${want}' (row id '${id}')`);
  return def;
}

/** The enemy a command acts on: the soft target when it is an enemy, else the nearest enemy within 2.5 m of the aim point. */
function commandTarget(c: CastCtx): Enemy | null {
  const t = c.target;
  if (t && t.kind === 'enemy' && !t.isDead && !t.removed) return t as Enemy;
  const w = G.world;
  if (!w) return null;
  let best: Enemy | null = null;
  let bd = 2.5;
  for (const e of w.enemies) {
    if (e.isDead || e.removed) continue;
    const d = Math.hypot(e.position.x - c.point[0], e.position.z - c.point[1]);
    if (d <= bd) { bd = d; best = e; }
  }
  return best;
}

MINION_BEHAVIORS.minion_summon = {
  fire(c: CastCtx) {
    if (c.remote) return;
    const row = c.def.minion;
    if (!row) return;
    const def = defFor(row.id, c.caster.classId);
    if (!def) return;
    G.minions.summon(c.caster, def, { count: row.count, cap: row.cap, group: row.group, life: row.life, ignoreCap: row.ignoreCap });
  },
};

MINION_BEHAVIORS.minion_command = {
  fire(c: CastCtx) {
    if (c.remote) return;
    const p = c.caster;
    const params = c.def.params ?? {};
    if (params.recall) {
      G.minions.recall(p);
      return;
    }
    const t = commandTarget(c);
    if (!t) return;
    G.minions.focus(p, t.id, params.focusSec ?? 6);
    const coef = params.cmdCoef ?? 0;
    if (coef <= 0) return;
    // one strike per minion in command range: the synthetic attack carries the command coefficient and the skill's damage type
    const atk: MinionAttack = {
      id: c.def.id, name: c.def.name, kind: 'melee', range: 99, cooldown: 0, hitTime: 0, anim: '',
      coef, type: c.def.damage?.type ?? 'physical',
    };
    const list = G.minions.ownedBy(p.id).filter((m) => Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) <= COMMAND_RANGE);
    list.forEach((m, i) => {
      const ang = (i / Math.max(1, list.length)) * Math.PI * 2;
      m.position.x = t.position.x + Math.sin(ang) * 1.5;
      m.position.z = t.position.z + Math.cos(ang) * 1.5;
      m.yaw = Math.atan2(t.position.x - m.position.x, t.position.z - m.position.z);
      m.playShot(m.def.attacks[0]?.anim, m.def.attacks[0]?.animSpeed ?? 1);
      G.minions.strike(m, atk, t);
    });
  },
};

function installMinionBehaviors(): void {
  Object.assign(BEHAVIORS, MINION_BEHAVIORS);
}

try {
  installMinionBehaviors();
} catch {
  queueMicrotask(installMinionBehaviors);
}
