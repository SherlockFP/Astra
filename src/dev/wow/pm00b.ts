// PM-00b · Plate-melee engine hooks (docs/kits/plate-melee.md PM-00b, §g needs 1-8, 11, 12). These checks are pure (rule rows,
// riders, watcher threshold, pip definition). The world-dependent checks (multi_strike, grip, consume, recent, anger, gain, store,
// rune regen) run in dev/combat-sim/kit_plate.mjs: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_plate.mjs
import { registerWowCheck, type WowCheckResult } from '../combat_wow';
import { BEHAVIORS } from '../../combat/skills/behaviors';
import { TALENT_PIPS } from '../../data/specs_talents';
import { STATUS_RULES } from '../../data/statuses';
import { WATCHERS } from '../../data/watchers';
import { cdMultFor, cleaveRidersOf, type StatusIdsView } from '../../combat/procMods';
import type { StatusId } from '../../types/skills';

/** A fake status holder with the given active ids (the riders read only `ids()`). */
const view = (...ids: StatusId[]): StatusIdsView => ({ ids: () => ids });

const BEHAVIOR_IDS = ['multi_strike', 'grip', 'divine_toll', 'shield_block', 'heal_self_recent'];

registerWowCheck({
  id: 'pm00b.defs',
  run: (): WowCheckResult => {
    const missing = BEHAVIOR_IDS.filter((id) => typeof BEHAVIORS[id]?.fire !== 'function');
    const rune = TALENT_PIPS.rune;
    const rulesOk = STATUS_RULES.bone_armor?.consumeOnHit?.icd === 2.5 && STATUS_RULES.colossus?.takenMoreFromSource === 0.3
      && STATUS_RULES.rend?.pandemic === 0.3 && STATUS_RULES.deaths_advance?.immuneKnockback === true;
    const ok = missing.length === 0 && !!rune && rune.max === 6 && rune.regen?.every === 10 && rulesOk;
    return { ok, msg: ok ? 'behaviours, rune pip and rider rules in place' : `missing: ${missing.join(',') || '-'} rune=${!!rune} rules=${rulesOk}` };
  },
});

registerWowCheck({
  id: 'pm00b.rider',
  run: (): WowCheckResult => {
    const r = cleaveRidersOf(view('sweeping', 'meat_cleaver'));
    const ok = r.length === 2 && r[0].extraTargets === 3 && r[0].extraMult === 0.6 && r[1].extraTargets === 2;
    return { ok, msg: ok ? 'meat_cleaver 3 > sweeping 2, both x0.6' : `got ${JSON.stringify(r)}` };
  },
});

registerWowCheck({
  id: 'pm00b.cdmult',
  run: (): WowCheckResult => {
    const ok = cdMultFor(view('ursoc_form'), 'barbarian_cleave') === 0.5 && cdMultFor(view('ursoc_form'), 'barbarian_provoke') === 1
      && cdMultFor(view(), 'barbarian_cleave') === 1;
    return { ok, msg: ok ? 'ursoc_form x0.5 on Yarma / Paralama only' : 'cdMult rider mismatch' };
  },
});

registerWowCheck({
  id: 'pm00b.how',
  run: (): WowCheckResult => {
    const w = WATCHERS.find((x) => x.id === 'exec_window');
    const ok = !!w && w.test({ targetHpPct: 0.19, enemiesNearTarget: 1 }) && !w.test({ targetHpPct: 0.21, enemiesNearTarget: 1 });
    return { ok, msg: ok ? 'exec_window on at 19 %, off at 21 %' : 'exec_window threshold mismatch' };
  },
});

registerWowCheck({
  id: 'pm00b.rune',
  run: (): WowCheckResult => {
    const rune = TALENT_PIPS.rune;
    const ok = !!rune && rune.max === 6 && rune.regen?.every === 10 && rune.decay === undefined;
    return { ok, msg: ok ? 'rune pip: max 6, +1 per 10 s, no decay (regen run by SkillSystem)' : 'rune pip definition mismatch' };
  },
});
