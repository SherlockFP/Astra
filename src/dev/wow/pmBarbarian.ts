// PM-BA · Barbar kit (docs/kits/plate-melee.md PM-BA). Pure registry checks (rows, bars, cooldowns, replaces, procs, APL ids) that run
// in the browser dev console (window.dev.wow.run('pmba.*')). The world-dependent checks (rampage hits, cleave riders, iron stacks,
// gory procs, execute gate, tempest, growl, heal) run in dev/combat-sim/kit_barbarian.mjs:
//   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_barbarian.mjs
import { registerWowCheck, type WowCheckResult } from '../combat_wow';
import { SKILLS } from '../../data/skills';
import { SPECS } from '../../data/specs';
import { STATUSES } from '../../data/statuses';
import { PROC_DEFS } from '../../data/procs';
import { ROTATIONS_KIT_BARBARIAN } from '../../data/rotations_kit_barbarian';
import type { StatusId } from '../../types/skills';

const BUTCHER = SPECS.barbarian_butcher;
const LORD = SPECS.barbarian_warlord;

registerWowCheck({
  id: 'pmba.ids',
  run: (): WowCheckResult => {
    const ids = [BUTCHER, LORD].flatMap((s) => [...(s?.skills ?? []), ...Object.values(s?.defaultBar ?? {}), ...Object.values(s?.majors ?? {})]);
    const missing = ids.filter((id) => !SKILLS[id]);
    const ok = missing.length === 0 && !!SKILLS.barbarian_bloodbath?.replaces && !!SKILLS.barbarian_crushing_blow?.replaces;
    return { ok, msg: ok ? 'both specs resolve; Kan Banyosu / Kemik Ezici replace their bases' : `missing: ${missing.join(',') || '-'}` };
  },
});

registerWowCheck({
  id: 'pmba.bars',
  run: (): WowCheckResult => {
    const okBar = (s: typeof BUTCHER): boolean => !!s && s.defaultBar.m45 === s.majors.m45 && s.defaultBar.m90 === s.majors.m90
      && s.defaultBar.m180 === s.majors.m180 && s.defaultBar.lmb === 'barbarian_basic';
    const ok = okBar(BUTCHER) && okBar(LORD);
    return { ok, msg: ok ? 'majors on m45 / m90 / m180, lmb is the chain' : 'bar / major mismatch' };
  },
});

registerWowCheck({
  id: 'pmba.cd',
  run: (): WowCheckResult => {
    const want: Record<string, number> = {
      barbarian_bloodthirst: 4.5, barbarian_rampage: 1.5, barbarian_raging_blow: 8, barbarian_cleave: 6, barbarian_leap: 20,
      barbarian_axe_throw: 8, barbarian_blood_rage: 120, barbarian_ancestral_tempest: 90, barbarian_iron_stance: 0.5,
      barbarian_blood_shield: 26, barbarian_last_stand: 45, barbarian_thrash: 6, barbarian_incarnation: 180, barbarian_avatar: 45,
      barbarian_carnage: 90, barbarian_wolf_howl: 180, barbarian_pummel: 15,
    };
    const bad = Object.entries(want).filter(([id, v]) => SKILLS[id]?.cooldown !== v).map(([id]) => id);
    return { ok: bad.length === 0, msg: bad.length === 0 ? 'cooldowns match the kit tables' : `off: ${bad.join(',')}` };
  },
});

registerWowCheck({
  id: 'pmba.procs',
  run: (): WowCheckResult => {
    const ids = ['gore', 'gory_maul', 'gory_iron', 'meat_cleaver', 'carnage', 'ursoc_form'];
    const missing = ids.filter((id) => !PROC_DEFS.some((d) => d.id === id) || !STATUSES[id as StatusId]);
    return { ok: missing.length === 0, msg: missing.length === 0 ? 'proc rows and status defs in place' : `missing: ${missing.join(',')}` };
  },
});

registerWowCheck({
  id: 'pmba.apl',
  run: (): WowCheckResult => {
    const names = Object.values(ROTATIONS_KIT_BARBARIAN).flatMap((a) => [...a.st, ...(a.aoe ?? [])]).join(' ');
    const skillIds = [...names.matchAll(/\b(barbarian_[a-z_]+)/g)].map((m) => m[1]);
    const missing = [...new Set(skillIds)].filter((id) => !SKILLS[id]);
    return { ok: missing.length === 0, msg: missing.length === 0 ? 'APL skill ids resolve' : `missing: ${missing.join(',')}` };
  },
});
