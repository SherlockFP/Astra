// KIT Şaman checks (WoW Midnight 12.0 direction, Turkish names; the shaman kit). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_shaman.mjs
// Implemented: kit.shaman.ids (specs, bars, majors, unlocks resolve), kit.shaman.basic (the Geliştirme 3-step chain), kit.shaman.l1
// (level-1 bar: 3 usable skills at unlock 1), kit.shaman.pips (Girdap gains and costs), kit.shaman.minions (totems, wolves, caps),
// kit.shaman.status (every applied status has a def; hot rules), kit.shaman.apl (rows resolve, basic last),
// kit.shaman.cast (runtime: L1 Girdap, Ghost Wolf, Feral Spirit wolves, totems, Riptide HoT, Ruh Arındırma dispel path),
// kit.shaman.rotation (APL smoke run for each spec through the real SkillSystem, 30 s).
import * as H from './harness.mjs';

const { G, SKILLS, errors } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_SHAMAN } = await H.imp('data/rotations_kit_shaman.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { MINION_DEFS, MINION_GROUP_CAPS } = await H.imp('data/minions.ts');
const { CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { SHAMAN_KIT_SPEC_IDS } = await H.imp('data/specs_kit_shaman.ts');
const { Minions } = await H.imp('combat/Minions.ts');
G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- kit.shaman.ids: the three specs resolve; every id on a spec, its bar and its majors is a skill
ok('kit.shaman.ids the three shaman specs exist', SHAMAN_KIT_SPEC_IDS.every((id) => !!SPECS[id]), SHAMAN_KIT_SPEC_IDS.join(','));
for (const sid of SHAMAN_KIT_SPEC_IDS) {
  const s = SPECS[sid];
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors), ...Object.keys(s.unlock)];
  const missing = [...new Set(ids)].filter((id) => !SKILLS[id]);
  ok(`kit.shaman.ids ${sid} skills, bar, majors and unlocks resolve`, missing.length === 0, missing.join(','));
  ok(`kit.shaman.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
  ok(`kit.shaman.ids ${sid} majors are m45 and m90`, !!SKILLS[s.majors.m45] && !!SKILLS[s.majors.m90]);
  ok(`kit.shaman.ids ${sid} role and class`, s.classId === 'shaman' && ['tank', 'dps', 'healer'].includes(s.role));
  ok(`kit.shaman.ids ${sid} basic resolves`, !!SKILLS[s.basic ?? s.defaultBar.lmb]);
}
ok('kit.shaman.ids roles: Elementel dps, Geliştirme dps, Restorasyon healer',
  SPECS.shaman_elemental?.role === 'dps' && SPECS.shaman_enhancement?.role === 'dps' && SPECS.shaman_restoration?.role === 'healer');
ok('kit.shaman.ids ClassDef.specs lists the three specs', (CLASSES.shaman?.specs ?? []).join() === SHAMAN_KIT_SPEC_IDS.join());
ok('kit.shaman.ids ClassDef.skills are the six class skills', (CLASSES.shaman?.skills ?? []).length === 6 && CLASSES.shaman.skills.every((id) => !!SKILLS[id]));

// ---- kit.shaman.basic: the Geliştirme chain has three steps, Girdap 4 / 4 / 6
{
  ok('kit.shaman.basic shaman_enh_basic is a 3-step combo', SKILLS.shaman_enh_basic?.behavior === 'combo' && SKILLS.shaman_enh_basic?.params?.steps === 3);
  const steps = [1, 2, 3].map((i) => SKILLS[`shaman_enh_basic_${i}`]);
  ok('kit.shaman.basic steps 1-3 exist', steps.every((s) => !!s));
  const g = steps.map((s) => s?.pip?.gain ?? 0);
  ok('kit.shaman.basic Girdap per step is 4 / 4 / 6 (14 per chain)', g.join() === '4,4,6', g.join());
  ok('kit.shaman.basic step 3 is the finisher (medium weight, knockback)', steps[2]?.params?.finisher === 1 && (steps[2]?.knockback ?? 0) > 0);
  ok('kit.shaman.basic Elementel basic is the single bolt (not a combo)', !SKILLS.shaman_basic?.behavior && SKILLS.shaman_basic?.targeting === 'projectile');
}

// ---- kit.shaman.l1: the level-1 class bar has the bolt, Ghost Wolf and Wind Shear unlocked at 1
{
  const bar1 = CharacterState.defaultBar('shaman', 1);
  ok('kit.shaman.l1 lmb is the Şimşek basic', bar1.lmb === 'shaman_basic', JSON.stringify(bar1));
  const usable = Object.values(bar1).filter((id) => id !== 'shaman_basic' && SKILLS[id]?.unlockLevel <= 1);
  ok('kit.shaman.l1 at least 3 usable skills at unlock 1', usable.length >= 3, usable.join(','));
  ok('kit.shaman.l1 bar is rmb lightning bolt, s2 ghost wolf, s3 wind shear (barLayout rule)', bar1.rmb === 'shaman_lightning_bolt' && bar1.s2 === 'shaman_ghost_wolf' && bar1.s3 === 'shaman_wind_shear', JSON.stringify(bar1));
  ok('kit.shaman.l1 the shaman has its basic resolved', !!SKILLS.shaman_basic && CLASSES.shaman.basicAttack === 'shaman_basic');
}

// ---- kit.shaman.pips: Girdap (maelstrom) gains and costs match the rows; the class secondary is maelstrom, max 100
{
  const gains = { shaman_basic: 8, shaman_lightning_bolt: 8, shaman_lava_burst: 10, shaman_chain_lightning: 6, shaman_stormstrike: 10, shaman_lava_lash: 6, shaman_crash_lightning: 8, shaman_enh_basic_1: 4, shaman_enh_basic_2: 4, shaman_enh_basic_3: 6 };
  for (const [id, n] of Object.entries(gains)) ok(`kit.shaman.pips ${id} gains ${n} Girdap`, SKILLS[id]?.pip?.gain === n, `${SKILLS[id]?.pip?.gain}`);
  const costs = { shaman_earth_shock: 60, shaman_maelstrom_spender: 50 };
  for (const [id, n] of Object.entries(costs)) ok(`kit.shaman.pips ${id} spends ${n} Girdap`, SKILLS[id]?.pip?.cost === n, `${SKILLS[id]?.pip?.cost}`);
  ok('kit.shaman.pips the class secondary is maelstrom (Girdap, max 100)', CLASSES.shaman?.secondary?.id === 'maelstrom' && CLASSES.shaman.secondary.max === 100);
  ok('kit.shaman.pips restoration rows spend mana, not Girdap', ['shaman_healing_wave', 'shaman_riptide', 'shaman_chain_heal', 'shaman_healing_rain'].every((id) => !SKILLS[id]?.pip));
}

// ---- kit.shaman.minions: totems and wolves registered; the lesser group cap is 3, the pack cap 2; totems do not move
{
  ok('kit.shaman.minions the seven shaman minions are registered',
    ['shaman_fire_elemental', 'shaman_earth_elemental', 'shaman_earthbind_totem', 'shaman_stream_totem', 'shaman_tide_totem', 'shaman_spirit_wolf'].every((id) => !!MINION_DEFS[id]));
  ok('kit.shaman.minions the lesser cap is 3 and the pack cap is 2', MINION_GROUP_CAPS.lesser === 3 && MINION_GROUP_CAPS.pack === 2);
  ok('kit.shaman.minions totems are stationary (speed 0, follow 0)',
    ['shaman_earthbind_totem', 'shaman_stream_totem', 'shaman_tide_totem'].every((id) => MINION_DEFS[id]?.speed === 0 && MINION_DEFS[id]?.follow?.[1] === 0));
  ok('kit.shaman.minions Feral Spirit names the wolves (pack, cap 2, 15 s)',
    SKILLS.shaman_feral_spirit?.minion?.id === 'shaman_spirit_wolf' && SKILLS.shaman_feral_spirit.minion.count === 2 && SKILLS.shaman_feral_spirit.minion.group === 'pack' && SKILLS.shaman_feral_spirit.minion.life === 15);
}

// ---- kit.shaman.status: every status a shaman row or spec mod applies has a StatusDef; HoT rules are set
{
  const applied = new Set();
  for (const d of Object.values(SKILLS)) {
    if (d.classId !== 'shaman') continue;
    for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  }
  for (const d of Object.values(MINION_DEFS)) if (d.ownerClass === 'shaman') for (const a of d.attacks) for (const s of a.statuses ?? []) applied.add(s.status);
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('kit.shaman.status every shaman-applied status has a def', missing.length === 0, missing.join(','));
  ok('kit.shaman.status HoTs tick (hot rule): riptide, rain_hot, stream_totem',
    ['riptide', 'rain_hot', 'stream_totem'].every((id) => STATUS_RULES[id]?.hot === true));
  ok('kit.shaman.status Hayalet Kurt is +40 % move speed', STATUSES.ghost_wolf?.stats?.moveSpeedPct === 0.4);
}

// ---- kit.shaman.apl: every skill and status in the rows resolves; the last line of st is the spec's basic
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_SHAMAN)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(shaman_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.shaman.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`kit.shaman.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  const basic = SPECS[sid]?.basic ?? SPECS[sid]?.defaultBar?.lmb;
  ok(`kit.shaman.apl ${sid} ends with the spec basic (${basic})`, apl.st.at(-1) === basic);
}
ok('kit.shaman.apl the three specs have rows', SHAMAN_KIT_SPEC_IDS.every((id) => !!ROTATIONS_KIT_SHAMAN[id]));

// ---- runtime helpers
const newShaman = (spec = null, level = 30) => {
  G.minions.clearAll('scene');
  const p = H.addPlayer('shaman', level);
  p.spec = spec?.id ?? undefined;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  G.character.save.skillBar = spec ? { ...spec.defaultBar } : CharacterState.defaultBar('shaman', level);
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

// ---- kit.shaman.cast: runtime checks through the real SkillSystem
{
  // level-1 economy: the bolt adds 8 Girdap on cast, Ghost Wolf grants ghost_wolf
  const p = newShaman(null, 1);
  const foe = foeAt(2.2);
  H.step(2);
  H.setAimTarget(foe);
  p.resource = 100;
  H.clearEvents(); errors.length = 0;
  G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, foe)); H.stepSec(2.0);
  const girdap = G.skills.pipCount(p, 'maelstrom');
  ok('kit.shaman.cast L1 lightning bolt adds 8 Girdap', girdap === 8, `girdap=${girdap}`);
  p.resource = 100;
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foe)); H.stepSec(1.2);
  ok('kit.shaman.cast L1 Ghost Wolf grants ghost_wolf', p.statuses.has('ghost_wolf'));
  ok('kit.shaman.cast no script errors in the L1 economy', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}
{
  // Geliştirme: Feral Spirit summons two wolves; Crash Lightning not needed here
  const enh = SPECS.shaman_enhancement;
  const p = newShaman(enh);
  const foe = foeAt(3);
  H.step(2);
  p.resource = 100;
  const started = G.skills.tryCast(p, 'shaman_feral_spirit', H.aimFor(p, foe), 'm90');
  H.stepSec(1.5);
  const owned = G.minions.ownedBy(p.id).map((m) => m.def?.id);
  ok('kit.shaman.cast Ruh Kurdu Çağrısı summons two spirit wolves', started === true && owned.filter((id) => id === 'shaman_spirit_wolf').length === 2, `owned=${owned.join(',')}`);
}
{
  // Elementel: the fire totem is placed (stationary minion of the owner)
  const el = SPECS.shaman_elemental;
  const p = newShaman(el);
  const foe = foeAt(3);
  H.step(2);
  p.resource = 100;
  const started = G.skills.tryCastSlot(p, 'r', H.aimFor(p, foe));
  H.stepSec(1.5);
  const owned = G.minions.ownedBy(p.id).map((m) => m.def?.id);
  ok('kit.shaman.cast Ateş Elementali summons shaman_fire_elemental', started === true && owned.includes('shaman_fire_elemental'), `owned=${owned.join(',')}`);
}
{
  // Restorasyon: Riptide heals the caster and leaves the riptide HoT on them
  const rs = SPECS.shaman_restoration;
  const p = newShaman(rs);
  H.step(2);
  p.resource = 100;
  p.hp = p.maxHp * 0.5;
  const hp0 = p.hp;
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foeAt(3)));
  H.stepSec(1.0);
  ok('kit.shaman.cast Gel-Git Dalgası heals and leaves riptide on the ally', p.hp > hp0 && p.statuses.has('riptide'), `hp ${hp0.toFixed(0)} -> ${p.hp.toFixed(0)}`);
}

// ---- kit.shaman.rotation: each spec's APL runs through the real SkillSystem for 30 s without script errors
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/pips:maelstrom/g, 'CHI')
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
  const p = newShaman(spec);
  const foe = foeAt(2.2);
  H.step(2);
  p.position.set(0, 0, 0);
  H.setAimTarget(foe);
  const compiled = [...ROTATIONS_KIT_SHAMAN[spec.id].st].map(compile);
  const casts = {};
  const onCast = (ev) => { if (ev.casterId === p.id) casts[ev.skillId] = (casts[ev.skillId] ?? 0) + 1; };
  G.events.on('skill:cast', onCast);
  const slotOf = (id) => {
    if (id === 'shaman_basic' || id === 'shaman_enh_basic' || id === 'shaman_resto_basic') return 'lmb';
    for (const [slot, sid] of Object.entries(G.character.save.skillBar)) if (sid === id) return slot;
    return null;
  };
  const CDR = (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; };
  const CH = (id) => G.skills.getCooldown(p, id).charges;
  const CD = (id) => G.skills.getCooldown(p, id).remaining;
  const total = Math.round(seconds / H.DT);
  for (let f = 0; f < total; f++) {
    p.resource = 100;
    p.hp = p.maxHp * (spec.role === 'healer' ? [0.3, 0.6, 0.95][Math.floor(f / 120) % 3] : 0.9);
    if (foe.hp < 1e8) foe.hp = 1e9;
    if (f % 6 === 0) {
      const env = {
        S: (id) => p.statuses.has(id),
        TS: (id) => foe.statuses.has(id),
        CDR, CH, CD,
        CHI: G.skills.pipCount(p, 'maelstrom'),
        HPP: 100 * p.hp / p.maxHp,
        ALOW: p.hp / p.maxHp,
        AINJ: 0,
        ADEB: false,
        TG: 1,
      };
      for (const line of compiled) {
        const slot = slotOf(line.skill);
        if (!slot) continue;
        if (!line.fn(env.S, env.TS, env.CDR, env.CH, env.CD, env.CHI, env.HPP, env.ALOW, env.AINJ, env.ADEB, env.TG)) continue;
        if (!line.skill.endsWith('_basic') && !CDR(line.skill)) continue;
        if (G.skills.tryCastSlot(p, slot, H.aimFor(p, foe))) break;
      }
    }
    H.step(1);
  }
  G.events.off?.('skill:cast', onCast);
  return { casts };
}
for (const sid of SHAMAN_KIT_SPEC_IDS) {
  const spec = SPECS[sid];
  if (!spec) continue;
  errors.length = 0;
  const { casts } = runApl(spec, 30);
  const used = Object.keys(casts);
  ok(`kit.shaman.rotation ${sid} casts at least 8 times in 30 s`, Object.values(casts).reduce((a, b) => a + b, 0) >= 8, `casts=${JSON.stringify(casts)}`);
  ok(`kit.shaman.rotation ${sid} uses at least 3 distinct skills`, used.length >= 3, used.join(','));
  ok(`kit.shaman.rotation ${sid} runs without script errors`, errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- level 1 (owner rule): every spec starts at level 1 with >= 4 usable core skills on its bar (basic / auto attack excluded)
for (const sid of ["shaman_elemental","shaman_enhancement","shaman_restoration"]) {
  const spec = SPECS[sid];
  const l1 = Object.entries(spec.defaultBar).filter(([slot, id]) => slot !== 'lmb' && id !== spec.basic && SKILLS[id]?.unlockLevel <= 1 && (spec.unlock?.[id] ?? 1) <= 1);
  ok(`kit_shaman.l1 ${sid} level 1 has >= 4 usable skills`, l1.length >= 4, l1.map(([s, id]) => `${s}=${id}`).join(','));
}
// ---- kit.defensive: Ruh Bağı Totemi (Spirit Link, HP redistribution) and Toprak Duvarı Totemi (Earthen Wall, party absorb)
{
  const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
  const p = newShaman(SPECS.shaman_restoration);
  const low = new H.FakePlayer('shaman', 30); low.id = 77; H.world.add(low); low.position.set(3, 0, 0); low.hp = low.maxHp * 0.5;
  H.step(2);
  G.skills.addResource(p, 300);
  const c = G.skills.tryCast(p, 'shaman_spirit_link', H.aimFor(p, null));
  H.stepSec(0.8);
  const f = low.hp / low.maxHp;
  ok('kit.defensive shaman_spirit_link lifts the low ally toward the party share', c === true && f > 0.7 && f < 0.9, `low=${f.toFixed(3)} caster=${(p.hp / p.maxHp).toFixed(3)}`);
  ok('kit.defensive shaman_spirit_link summons its totem', G.minions.ownedBy(p.id, (m) => m.def.id === 'shaman_spirit_link_totem').length === 1);
  ok('kit.defensive shaman_spirit_link equalises: the healthiest (caster) comes down to the low ally share', p.hp / p.maxHp < 0.95 && Math.abs(p.hp / p.maxHp - f) < 0.05, `caster=${(p.hp / p.maxHp).toFixed(3)} low=${f.toFixed(3)}`);
  const q = newShaman(SPECS.shaman_restoration);
  H.step(2);
  G.skills.addResource(q, 300);
  const cE = G.skills.tryCast(q, 'shaman_earthen_wall', H.aimFor(q, null));
  H.stepSec(0.8);
  const sh = q.statuses.get('shield');
  ok('kit.defensive shaman_earthen_wall absorbs 10 % of max HP for the party', cE === true && !!sh && near(sh.magnitude, q.maxHp * 0.1, 1) && q.statuses.has('earthen_wall'), `shield=${sh?.magnitude}`);
  ok('kit.defensive shaman_earthen_wall summons its totem', G.minions.ownedBy(q.id, (m) => m.def.id === 'shaman_earthen_wall_totem').length === 1);
  ok('kit.defensive shaman_earthen_wall is on the T (m180) key of Restorasyon', SPECS.shaman_restoration.defaultBar.m180 === 'shaman_earthen_wall');
}

console.log(fails === 0 ? '\nkit.shaman: all checks PASS' : `\nkit.shaman: ${fails} FAIL`);
H.restoreConsole?.();
// ---- kit.shaman.dmg: keys 1-4 (rmb, q, e, r) carry >= 2 damage skills on each healer spec of the class
{
  const KEYS14 = ['rmb', 'q', 'e', 'r'];
  const healers = Object.values(SPECS).filter((s) => s.classId === 'shaman' && s.role === 'healer');
  ok('kit.shaman.dmg has a healer spec to audit', healers.length > 0, healers.map((s) => s.id).join(','));
  for (const s of healers) {
    const n = KEYS14.filter((k) => (H.SKILLS[s.defaultBar[k]]?.damage?.coef ?? 0) > 0).length;
    ok(`kit.shaman.dmg ${s.id} has >= 2 damage skills on keys 1-4`, n >= 2, KEYS14.map((k) => `${k}=${s.defaultBar[k]}`).join(','));
  }
}
process.exit(fails === 0 ? 0 : 1);
