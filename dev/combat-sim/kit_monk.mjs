// KIT Keşiş checks (docs/GDD_CLASSES_V2.md §2, Midnight-aligned). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_monk.mjs
// Implemented: kit.monk.ids (specs, bars, majors, unlocks resolve), kit.monk.basic (chain steps), kit.monk.l1 (level-1 bar: 3 usable
// skills at unlock 1), kit.monk.chi (pip gains and costs match the rows), kit.monk.routes (route rows), kit.monk.minions (ids, caps),
// kit.monk.status (every applied status has a def; hot and takenMore rules), kit.monk.apl (rows resolve, weapon chain last),
// kit.monk.cast (runtime: L1 chi economy, Çi Torpedo chi_flow, Kara Öküz and clones summon, Sarsma purge, HoT, channel heal),
// kit.monk.rotation (APL smoke run for each spec through the real SkillSystem).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_MONK } = await H.imp('data/rotations_kit_monk.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { MINION_DEFS, MINION_GROUP_CAPS } = await H.imp('data/minions.ts');
const { CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { MONK_KIT_SPEC_IDS } = await H.imp('data/specs_kit_monk.ts');
const { Minions } = await H.imp('combat/Minions.ts');
G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- kit.monk.ids: the three specs resolve; every id on a spec, its bar and its majors is a skill
ok('kit.monk.ids the three monk specs exist', MONK_KIT_SPEC_IDS.every((id) => !!SPECS[id]), MONK_KIT_SPEC_IDS.join(','));
for (const sid of MONK_KIT_SPEC_IDS) {
  const s = SPECS[sid];
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors), ...Object.keys(s.unlock)];
  const missing = [...new Set(ids)].filter((id) => !SKILLS[id]);
  ok(`kit.monk.ids ${sid} skills, bar, majors and unlocks resolve`, missing.length === 0, missing.join(','));
  ok(`kit.monk.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
  ok(`kit.monk.ids ${sid} majors are m45 and m90`, !!SKILLS[s.majors.m45] && !!SKILLS[s.majors.m90]);
  ok(`kit.monk.ids ${sid} role and class`, s.classId === 'monk' && ['tank', 'dps', 'healer'].includes(s.role));
}
ok('kit.monk.ids roles: Demci tank, Rüzgâr dps, Sis healer',
  SPECS.monk_brewmaster?.role === 'tank' && SPECS.monk_windwalker?.role === 'dps' && SPECS.monk_mistweaver?.role === 'healer');
ok('kit.monk.ids ClassDef.specs lists the three specs', (CLASSES.monk?.specs ?? []).join() === MONK_KIT_SPEC_IDS.join());
ok('kit.monk.ids ClassDef.skills is the 8-id core list', (CLASSES.monk?.skills ?? []).length === 8 && CLASSES.monk.skills.every((id) => !!SKILLS[id]));

// ---- kit.monk.basic: the chain has four steps, all in SKILLS, with Çi 1/1/0/1
{
  ok('kit.monk.basic monk_basic is a 4-step combo', SKILLS.monk_basic?.behavior === 'combo' && SKILLS.monk_basic?.params?.steps === 4);
  const steps = [1, 2, 3, 4].map((i) => SKILLS[`monk_basic_${i}`]);
  ok('kit.monk.basic steps 1-4 exist', steps.every((s) => !!s));
  const chi = steps.map((s) => s?.pip?.gain ?? 0);
  ok('kit.monk.basic Çi per step is 1 / 1 / 0 / 1 (3 per chain)', chi.join() === '1,1,0,1' && chi.reduce((a, b) => a + b, 0) === 3, chi.join());
  ok('kit.monk.basic step 3 is the kick (medium weight, knockup)', steps[2]?.params?.weight === 4 && (steps[2]?.params?.knockup ?? 0) > 0);
  ok('kit.monk.basic step 4 is the finisher and roots', steps[3]?.params?.finisher === 1 && steps[3]?.params?.root === 1);
}

// ---- kit.monk.l1: the level-1 class bar has monk_basic and at least three usable skills unlocked at 1
{
  const bar1 = CharacterState.defaultBar('monk', 1);
  ok('kit.monk.l1 lmb is the chain', bar1.lmb === 'monk_basic', JSON.stringify(bar1));
  const usable = Object.values(bar1).filter((id) => id !== 'monk_basic' && SKILLS[id]?.unlockLevel <= 1);
  ok('kit.monk.l1 at least 3 usable skills at unlock 1', usable.length >= 3, usable.join(','));
  ok('kit.monk.l1 bar is rmb tiger palm, q torpedo, s1 blackout kick', bar1.rmb === 'monk_tiger_palm' && bar1.q === 'monk_chi_torpedo' && bar1.s1 === 'monk_blackout_kick', JSON.stringify(bar1));
  ok('kit.monk.l1 the monk is playable and at level 1 has the chain resolved', !!SKILLS.monk_basic_1 && CLASSES.monk.basicAttack === 'monk_basic');
}

// ---- kit.monk.chi: pip gains and costs match the rows (GDD §2.4 Çi column)
{
  const gains = { monk_tiger_palm: 2, monk_chi_torpedo: 1, monk_keg_smash: 2, monk_ww_tigers_fury: 2, monk_chi_wave: 1, monk_mw_basic: 1 };
  for (const [id, n] of Object.entries(gains)) ok(`kit.monk.chi ${id} gains ${n} Çi`, SKILLS[id]?.pip?.gain === n, `${SKILLS[id]?.pip?.gain}`);
  const costs = { monk_spinning_crane: 2, monk_blackout_kick: 1, monk_flying_serpent: 2, monk_rising_sun_kick: 3, monk_whirling_dragon: 2, monk_fists_of_fury: 3, monk_purifying_brew: 1 };
  for (const [id, n] of Object.entries(costs)) ok(`kit.monk.chi ${id} spends ${n} Çi`, SKILLS[id]?.pip?.cost === n, `${SKILLS[id]?.pip?.cost}`);
  ok('kit.monk.chi chain step gains are on the rows (1 / 1 / 0 / 1)', SKILLS.monk_basic_1?.pip?.gain === 1 && !SKILLS.monk_basic_3?.pip && SKILLS.monk_basic_4?.pip?.gain === 1);
  ok('kit.monk.chi the Flying Serpent route is free (no Çi)', SKILLS.monk_flying_serpent?.route?.free === true);
  ok('kit.monk.chi Çi pip is the class secondary (max 5, decay after 8 s, -1 / 4 s)',
    CLASSES.monk?.secondary?.id === 'chi' && CLASSES.monk.secondary.max === 5 && CLASSES.monk.secondary.decay?.after === 8 && CLASSES.monk.secondary.decay?.every === 4);
}

// ---- kit.monk.routes: the GDD route rows
{
  const bl = SKILLS.monk_blackout_kick?.route;
  ok('kit.monk.routes Kara Tekme refunds 1.5 s of the Keg Smash cooldown within 3 s', bl?.from?.includes('monk_keg_smash') && bl.window === 3 && bl.refund?.sec === 1.5 && bl.refund?.skill === 'monk_keg_smash');
  const rs = SKILLS.monk_rising_sun_kick?.route;
  ok('kit.monk.routes Doğan Güneş gives back 1 Çi after Kara Tekme (1.2 s)', rs?.from?.includes('monk_blackout_kick') && rs.window === 1.2 && rs.pipGain === 1);
  const fs = SKILLS.monk_flying_serpent?.route;
  ok('kit.monk.routes Uçan Yılan follows monk_basic_3 within 1.4 s (+35 %, free)', fs?.from?.includes('monk_basic_3') && fs.window === 1.4 && fs.more === 0.35 && fs.free === true);
  const dr = SKILLS.monk_whirling_dragon?.route;
  ok('kit.monk.routes Dönen Ejder follows Doğan Güneş within 1.5 s (+40 %)', dr?.from?.includes('monk_rising_sun_kick') && dr.window === 1.5 && dr.more === 0.4);
  for (const row of [bl, rs, fs, dr]) for (const id of row?.from ?? []) if (!SKILLS[id]) ok(`kit.monk.routes route source ${id} resolves`, false);
}

// ---- kit.monk.minions: the three minion ids resolve, groups are capped (clone 2, guardian 1)
{
  ok('kit.monk.minions monk_clone_fire, monk_clone_earth, monk_black_ox are registered',
    ['monk_clone_fire', 'monk_clone_earth', 'monk_black_ox'].every((id) => !!MINION_DEFS[id]));
  ok('kit.monk.minions clone group cap is 2 and guardian cap is 1', MINION_GROUP_CAPS.clone === 2 && MINION_GROUP_CAPS.guardian === 1);
  ok('kit.monk.minions the two clones are group clone, the ox is group guardian',
    MINION_DEFS.monk_clone_fire?.group === 'clone' && MINION_DEFS.monk_clone_earth?.group === 'clone' && MINION_DEFS.monk_black_ox?.group === 'guardian');
  ok('kit.monk.minions Kara Öküz row names the ox (life 25)', SKILLS.monk_bm_black_ox?.minion?.id === 'monk_black_ox' && SKILLS.monk_bm_black_ox?.minion?.life === 25);
  ok('kit.monk.minions Storm, Earth and Fire is the summon major (15 s clones)', SKILLS.monk_ww_storm_earth_fire?.behavior === 'monk_storm' && SKILLS.monk_ww_storm_earth_fire?.targeting === 'summon');
}

// ---- kit.monk.status: every status a monk row or spec mod applies has a StatusDef; hot / takenMore rules are set
{
  const applied = new Set();
  for (const d of Object.values(SKILLS)) {
    if (d.classId !== 'monk') continue;
    for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  }
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('kit.monk.status every monk-applied status has a def', missing.length === 0, missing.join(','));
  ok('kit.monk.status chi_flow, tigerlust, tigerfury, fortifying, brewed, stagger_pool are defined',
    ['chi_flow', 'tigerlust', 'tigerfury', 'fortifying', 'brewed', 'stagger_pool'].every((id) => !!STATUSES[id]));
  ok('kit.monk.status stagger_pool is hidden', STATUSES.stagger_pool?.hidden === true);
  ok('kit.monk.status fortifying is -20 % damage taken and +20 % max HP', STATUS_RULES.fortifying?.takenMore === -0.2 && STATUSES.fortifying?.stats?.maxHpPct === 0.2);
  ok('kit.monk.status HoTs tick (hot rule) for both Sis HoTs', STATUS_RULES.renewing_mist?.hot === true && STATUS_RULES.enveloping_mist?.hot === true);
  ok('kit.monk.status Doğan Güneş takes +12 % damage', STATUS_RULES.rising_sun?.takenMore === 0.12);
  ok('kit.monk.status the Sarsma pool is overwritten by purges (stack override)', STATUS_RULES.stagger_pool?.stack === 'override');
  const sp = (id) => SKILLS[id]?.selfStatuses?.[0];
  ok('kit.monk.status Storm, Earth and Fire empowers 15 s by +10 %', sp('monk_ww_storm_earth_fire')?.status === 'empower' && sp('monk_ww_storm_earth_fire').magnitude === 0.1 && sp('monk_ww_storm_earth_fire').duration === 15);
}

// ---- kit.monk.apl: every skill and status in the rows resolves; the last line of st is the weapon chain of the spec
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_MONK)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(monk_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.monk.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`kit.monk.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  const basic = SPECS[sid]?.basic ?? SPECS[sid]?.defaultBar?.lmb ?? 'monk_basic';
  ok(`kit.monk.apl ${sid} ends with the weapon chain (${basic})`, apl.st.at(-1) === basic);
}
ok('kit.monk.apl the three specs have rows', MONK_KIT_SPEC_IDS.every((id) => !!ROTATIONS_KIT_MONK[id]));

// ---- runtime helpers
const newMonk = (spec = null, level = 30) => {
  G.minions.clearAll('scene');
  const p = H.addPlayer('monk', level);
  p.spec = spec?.id ?? undefined;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  G.character.save.skillBar = spec ? { ...spec.defaultBar } : CharacterState.defaultBar('monk', level);
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.character.save.spec = spec?.id ?? null;
  G.talents = { grantedSkills: () => [], skillPick: () => 0 };
  return p;
};
const foeAt = (z = 2.2) => {
  const f = H.addEnemy(0, z, { hp: 1e9 });
  f.maxHp = 1e9; f.hp = 1e9;
  return f;
};

// ---- kit.monk.cast: runtime checks through the real SkillSystem
{
  // level-1 economy: tiger palm +2 Çi, Çi Torpedo +1, Kara Tekme -1
  const p = newMonk(null, 1);
  const foe = foeAt(2.2);
  H.step(2);
  H.setAimTarget(foe);
  p.resource = 100;
  H.clearEvents(); errors.length = 0;
  G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, foe)); H.stepSec(1.2);
  const afterPalm = G.skills.pipCount(p, 'chi');
  ok('kit.monk.cast L1 tiger palm adds 2 Çi', afterPalm === 2, `chi=${afterPalm}`);
  p.resource = 100;
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foe)); H.stepSec(1.2);
  ok('kit.monk.cast L1 Çi Torpedo adds 1 Çi and grants chi_flow', G.skills.pipCount(p, 'chi') === 3 && p.statuses.has('chi_flow'), `chi=${G.skills.pipCount(p, 'chi')} flow=${p.statuses.has('chi_flow')}`);
  p.resource = 100;
  const ok1 = G.skills.tryCastSlot(p, 's1', H.aimFor(p, foe)); H.stepSec(1.2);
  ok('kit.monk.cast L1 Kara Tekme casts on 3 Çi and spends 1', ok1 === true && G.skills.pipCount(p, 'chi') === 2, `started=${ok1} chi=${G.skills.pipCount(p, 'chi')}`);
  ok('kit.monk.cast no script errors in the L1 economy', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}
{
  // Demci: Arındırıcı İksir takes 55 % of the Sarsma pool and heals 6 % of max HP
  const bm = SPECS.monk_brewmaster;
  const p = newMonk(bm);
  H.step(2);
  p.hp = p.maxHp * 0.5;
  p.statuses.apply('stagger_pool', 12, { magnitude: 100, sourceId: p.id });
  p.pips = { chi: 5 };
  p.resource = 100;
  const hp0 = p.hp;
  const started = G.skills.tryCast(p, 'monk_purifying_brew', H.aimFor(p, foeAt(3)), 's2');
  H.stepSec(1.2);
  const pool = p.statuses.get('stagger_pool')?.magnitude ?? 0;
  ok('kit.monk.cast Arındırıcı İksir cast starts', started === true, `tryCast=${started}`);
  ok('kit.monk.cast Arındırıcı İksir leaves 45 % of the pool', Math.abs(pool - 45) < 1, `pool=${pool.toFixed(1)}`);
  ok('kit.monk.cast Arındırıcı İksir heals about 6 % max HP', p.hp - hp0 > p.maxHp * 0.05, `hp ${hp0.toFixed(0)} -> ${p.hp.toFixed(0)}`);
}
{
  // Güçlendirici İksir: fortifying 15 s, max HP +20 %
  const bm = SPECS.monk_brewmaster;
  const p = newMonk(bm);
  H.step(2);
  p.resource = 100;
  const started = G.skills.tryCast(p, 'monk_bm_fortifying_brew', H.aimFor(p, foeAt(3)), 'm45');
  H.stepSec(0.6);
  ok('kit.monk.cast Güçlendirici İksir grants fortifying', started === true && p.statuses.has('fortifying'), `tryCast=${started}`);
}
{
  // Kara Öküz: the summon major raises one guardian
  const bm = SPECS.monk_brewmaster;
  const p = newMonk(bm);
  const foe = foeAt(3);
  H.step(2);
  p.resource = 100;
  const started = G.skills.tryCast(p, 'monk_bm_black_ox', H.aimFor(p, foe), 'm90');
  H.stepSec(1.5);
  const owned = G.minions.ownedBy(p.id).map((m) => m.def?.id);
  ok('kit.monk.cast Kara Öküz Ruhu summons monk_black_ox', started === true && owned.includes('monk_black_ox'), `owned=${owned.join(',')}`);
}
{
  // Storm, Earth and Fire: a fire and an earth clone, plus empower
  const ww = SPECS.monk_windwalker;
  const p = newMonk(ww);
  const foe = foeAt(3);
  H.step(2);
  p.resource = 100;
  const started = G.skills.tryCast(p, 'monk_ww_storm_earth_fire', H.aimFor(p, foe), 'm90');
  H.stepSec(1.5);
  const owned = G.minions.ownedBy(p.id).map((m) => m.def?.id);
  ok('kit.monk.cast Storm, Earth and Fire summons a fire and an earth clone', started === true && owned.includes('monk_clone_fire') && owned.includes('monk_clone_earth'), `owned=${owned.join(',')}`);
  ok('kit.monk.cast Storm, Earth and Fire grants empower', p.statuses.has('empower'));
}
{
  // Cennet Yumrukları: channel ticks hit the foe and fists_guard is on the caster
  const ww = SPECS.monk_windwalker;
  const p = newMonk(ww);
  const foe = foeAt(2.2);
  H.step(2);
  p.pips = { chi: 3 };
  p.resource = 100;
  H.setAimTarget(foe);
  const hp0 = foe.hp;
  const started = G.skills.tryCastSlot(p, 'r', H.aimFor(p, foe));
  H.stepSec(1.0);
  ok('kit.monk.cast Cennet Yumrukları starts and grants fists_guard', started === true && p.statuses.has('fists_guard'), `started=${started}`);
  H.stepSec(3.0);
  ok('kit.monk.cast Cennet Yumrukları ticks damage the foe', foe.hp < hp0, `hp ${hp0} -> ${foe.hp}`);
}
{
  // Sis Dokuyan: Renewing Mist puts the HoT on the caster (no allies), Dinginlik Sisi heals over its channel
  const mw = SPECS.monk_mistweaver;
  const p = newMonk(mw);
  H.step(2);
  p.resource = 100;
  p.hp = p.maxHp * 0.5;
  G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, foeAt(3)));
  H.stepSec(0.8);
  ok('kit.monk.cast Yenileyen Sis puts the HoT on the healed ally', p.statuses.has('renewing_mist'));
  p.hp = p.maxHp * 0.5;
  const hp1 = p.hp;
  p.resource = 100;
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foeAt(3)));
  H.stepSec(3.0);
  ok('kit.monk.cast Dinginlik Sisi heals over its 2.5 s channel', p.hp > hp1, `hp ${hp1.toFixed(0)} -> ${p.hp.toFixed(0)}`);
  ok('kit.monk.cast Sis Vuruşu is the healer basic', G.character.save.skillBar.lmb === 'monk_mw_basic');
}

// ---- kit.monk.rotation: each spec's APL runs through the real SkillSystem for 30 s without script errors
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/pips:chi/g, 'CHI')
    .replace(/target\.status:(\w+)/g, "TS('$1')")
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/\bhp%/g, 'HPP')
    .replace(/ally\.low%/g, 'ALOW')
    .replace(/allies\.injured/g, 'AINJ')
    .replace(/allies\.debuffed/g, 'ADEB')
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], fn: new Function('S', 'TS', 'CDR', 'CH', 'CD', 'CHI', 'HPP', 'ALOW', 'AINJ', 'ADEB', 'TG', `return (${cond});`) };
}
function runApl(spec, seconds) {
  const p = newMonk(spec);
  const foe = foeAt(2.2);
  H.step(2);
  p.position.set(0, 0, 0);
  H.setAimTarget(foe);
  const lines = [...ROTATIONS_KIT_MONK[spec.id].st, ...(ROTATIONS_KIT_MONK[spec.id].aoe ?? [])];
  const compiled = [...ROTATIONS_KIT_MONK[spec.id].st].map(compile);
  const casts = {};
  const onCast = (ev) => { if (ev.casterId === p.id) casts[ev.skillId] = (casts[ev.skillId] ?? 0) + 1; };
  G.events.on('skill:cast', onCast);
  const slotOf = (id) => {
    if (id === 'monk_basic' || id === 'monk_mw_basic') return 'lmb';
    for (const [slot, sid] of Object.entries(G.character.save.skillBar)) if (sid === id) return slot;
    return null;
  };
  const CDR = (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; };
  const CH = (id) => G.skills.getCooldown(p, id).charges;
  const CD = (id) => G.skills.getCooldown(p, id).remaining;
  const total = Math.round(seconds / H.DT);
  for (let f = 0; f < total; f++) {
    p.resource = 100;
    // the healer's own HP cycles 30 / 60 / 95 % every 2 s so every heal row gets a turn (the ally conditions read the real fraction); the others sit at 90 %
    p.hp = p.maxHp * (spec.role === 'healer' ? [0.3, 0.6, 0.95][Math.floor(f / 120) % 3] : 0.9);
    if (foe.hp < 1e8) foe.hp = 1e9;
    if (f % 6 === 0) {
      const env = {
        S: (id) => p.statuses.has(id),
        TS: (id) => foe.statuses.has(id),
        CDR, CH, CD,
        CHI: G.skills.pipCount(p, 'chi'),
        HPP: 100 * p.hp / p.maxHp,
        ALOW: p.hp / p.maxHp,
        AINJ: 0,
        ADEB: false,
        TG: 1,
      };
      for (let i = 0; i < compiled.length; i++) {
        const line = compiled[i];
        const slot = slotOf(line.skill);
        if (!slot) continue;
        if (!line.fn(env.S, env.TS, env.CDR, env.CH, env.CD, env.CHI, env.HPP, env.ALOW, env.AINJ, env.ADEB, env.TG)) continue;
        if (line.skill !== 'monk_basic' && line.skill !== 'monk_mw_basic' && !CDR(line.skill)) continue;
        if (G.skills.tryCastSlot(p, slot, H.aimFor(p, foe))) break;
      }
    }
    H.step(1);
  }
  G.events.off?.('skill:cast', onCast);
  return { casts, lines };
}
for (const sid of MONK_KIT_SPEC_IDS) {
  const spec = SPECS[sid];
  if (!spec) continue;
  errors.length = 0;
  const { casts } = runApl(spec, 30);
  const used = Object.keys(casts);
  ok(`kit.monk.rotation ${sid} casts at least 8 times in 30 s`, Object.values(casts).reduce((a, b) => a + b, 0) >= 8, `casts=${JSON.stringify(casts)}`);
  ok(`kit.monk.rotation ${sid} uses at least 3 distinct skills`, used.length >= 3, used.join(','));
  ok(`kit.monk.rotation ${sid} runs without script errors`, errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

console.log(fails === 0 ? '\nkit.monk: all checks PASS' : `\nkit.monk: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
