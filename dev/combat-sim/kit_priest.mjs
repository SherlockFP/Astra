// KIT Rahip checks (Midnight 12.0 shape: Disiplin Atonement healer, Kutsal healer, Gölge Insanity DPS). Run:
//   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_priest.mjs
// Implemented: kit.priest.ids (specs, bars, majors, unlocks resolve), kit.priest.basic, kit.priest.l1 (level-1 bar: basic and
// 3 usable skills at unlock 1), kit.priest.insanity (Delilik gains and costs, class secondary), kit.priest.status (every applied
// status has a def; the rules), kit.priest.minions (Shadowfiend), kit.priest.apl (rows resolve, basic last), kit.priest.cast
// (runtime: L1 shield / heal / smite, Keffara heal from damage, Shadow DoTs, Voidform, Shadowfiend, renew), kit.priest.rotation
// (APL smoke run for each spec through the real SkillSystem).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { ROTATIONS_KIT_PRIEST } = await H.imp('data/rotations_kit_priest.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { MINION_DEFS, MINION_GROUP_CAPS } = await H.imp('data/minions.ts');
const { CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { PRIEST_KIT_SPEC_IDS } = await H.imp('data/specs_kit_priest.ts');
const { Minions } = await H.imp('combat/Minions.ts');
const { setFriendlyTarget } = await H.imp('combat/healing.ts');
G.minions = new Minions();

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- kit.priest.ids: the three specs exist; every id on a spec, its bar and its majors is a skill
ok('kit.priest.ids the three priest specs exist', PRIEST_KIT_SPEC_IDS.every((id) => !!SPECS[id]), PRIEST_KIT_SPEC_IDS.join(','));
for (const sid of PRIEST_KIT_SPEC_IDS) {
  const s = SPECS[sid];
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors), ...Object.keys(s.unlock)];
  const missing = [...new Set(ids)].filter((id) => !SKILLS[id]);
  ok(`kit.priest.ids ${sid} skills, bar, majors and unlocks resolve`, missing.length === 0, missing.join(','));
  ok(`kit.priest.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
  ok(`kit.priest.ids ${sid} majors are m45 and m90`, !!SKILLS[s.majors.m45] && !!SKILLS[s.majors.m90]);
  ok(`kit.priest.ids ${sid} role and class`, s.classId === 'priest' && ['healer', 'dps'].includes(s.role));
  ok(`kit.priest.ids ${sid} mainStat is int`, s.mainStat === 'int');
}
ok('kit.priest.ids roles: Disiplin and Kutsal healers, Gölge dps',
  SPECS.priest_discipline?.role === 'healer' && SPECS.priest_holy?.role === 'healer' && SPECS.priest_shadow?.role === 'dps');
ok('kit.priest.ids ClassDef.specs lists the three specs', (CLASSES.priest?.specs ?? []).join() === PRIEST_KIT_SPEC_IDS.join());
ok('kit.priest.ids ClassDef.skills is the 8-id core list', (CLASSES.priest?.skills ?? []).length === 8&& CLASSES.priest.skills.every((id) => !!SKILLS[id]));
ok('kit.priest.ids priest is a playable class', H.imp && (await H.imp('data/classes.ts')).PLAYABLE_CLASSES.includes('priest'));

// ---- kit.priest.basic: Kutsal Ok is the class basic; the holy spec swaps in its heal bolt
ok('kit.priest.basic priest_basic is the class basic and a strike', CLASSES.priest.basicAttack === 'priest_basic' && SKILLS.priest_basic?.behavior === 'priest_strike');
ok('kit.priest.basic Kutsal basic is the heal bolt', SPECS.priest_holy?.basic === 'priest_holy_basic' && SKILLS.priest_holy_basic?.behavior === 'heal_bolt');

// ---- kit.priest.l1: the level-1 bar has the basic and at least three usable skills unlocked at 1
{
  const bar1 = CharacterState.defaultBar('priest', 1);
  ok('kit.priest.l1 lmb is the class basic', bar1.lmb === 'priest_basic', JSON.stringify(bar1));
  const usable = Object.values(bar1).filter((id) => id !== 'priest_basic' && SKILLS[id]?.unlockLevel <= 1);
  ok('kit.priest.l1 at least 3 usable skills at unlock 1', usable.length >= 3, usable.join(','));
  ok('kit.priest.l1 bar is rmb shield, q flash heal, s1 smite', bar1.rmb === 'priest_power_word_shield' && bar1.q === 'priest_flash_heal' && bar1.s1 === 'priest_smite', JSON.stringify(bar1));
}

// ---- kit.priest.insanity: Delilik is the class secondary (max 100, 20 per shown pip); gains and the spend match the rows
{
  const sec = CLASSES.priest?.secondary;
  ok('kit.priest.insanity Delilik is the class secondary (max 100, scale 20)', sec?.id === 'insanity' && sec.max === 100 && sec.scale === 20, JSON.stringify(sec));
  ok('kit.priest.insanity Zihin Patlaması gains 20, Gölge Acısı and Vampirik Dokunuş 10 each, Mind Flay 10 per cast',
    SKILLS.priest_shadow_mind_blast?.pip?.gain === 20 && SKILLS.priest_shadow_swp?.pip?.gain === 10 && SKILLS.priest_shadow_vt?.pip?.gain === 10 && SKILLS.priest_shadow_mind_flay?.pip?.gain === 10);
  ok('kit.priest.insanity Boşluk Oku spends 40', SKILLS.priest_shadow_void_bolt?.pip?.cost === 40);
}

// ---- kit.priest.status: every priest-applied status has a def; the Keffara, pain suppression and Voidform rules are set
{
  const applied = new Set();
  for (const d of Object.values(SKILLS)) {
    if (d.classId !== 'priest') continue;
    for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
  }
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('kit.priest.status every priest-applied status has a def', missing.length === 0, missing.join(','));
  ok('kit.priest.status Keffara (atonement) is a buff with a refresh rule', STATUSES.atonement?.kind === 'buff' && STATUS_RULES.atonement?.stack === 'refresh');
  ok('kit.priest.status Acı Bastırma takes -40 % damage', STATUS_RULES.pain_suppression?.takenMore === -0.4);
  ok('kit.priest.status Boşluk Formu adds +20 % damage', STATUSES.voidform?.stats?.damagePct === 0.2);
  ok('kit.priest.status the two Shadow DoTs are shadow damage over time',
    STATUSES.shadow_word_pain?.dotType === 'shadow' && STATUSES.vampiric_touch?.dotType === 'shadow');
}

// ---- kit.priest.minions: the Shadowfiend is registered in the pet group (cap 1) and the major names it
{
  ok('kit.priest.minions priest_shadowfiend is registered', !!MINION_DEFS.priest_shadowfiend);
  ok('kit.priest.minions pet group cap is 1', MINION_GROUP_CAPS.pet === 1);
  ok('kit.priest.minions Gölge Canavarı names the Shadowfiend (15 s)', SKILLS.priest_shadow_fiend?.minion?.id === 'priest_shadowfiend' && SKILLS.priest_shadow_fiend?.minion?.life === 15);
}

// ---- kit.priest.apl: every skill and status in the rows resolves; the last line of st is the spec's basic
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_PRIEST)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(priest_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.priest.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`kit.priest.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  const basic = SPECS[sid]?.basic ?? 'priest_basic';
  ok(`kit.priest.apl ${sid} ends with the basic (${basic})`, apl.st.at(-1) === basic);
}
ok('kit.priest.apl the three specs have rows', PRIEST_KIT_SPEC_IDS.every((id) => !!ROTATIONS_KIT_PRIEST[id]));

// ---- runtime helpers
const newPriest = (spec = null, level = 30) => {
  G.minions.clearAll('scene');
  setFriendlyTarget(null);
  const p = H.addPlayer('priest', level);
  p.spec = spec?.id ?? undefined;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  G.character.save.skillBar = spec ? { ...spec.defaultBar } : CharacterState.defaultBar('priest', level);
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
const allyAt = (x, z, hpFrac = 1) => {
  const a = new H.FakePlayer('priest', 30);
  a.id = 2; // FakePlayer takes entity id 1 (the local player); a second entity needs its own id
  H.world.add(a);
  a.position.set(x, 0, z);
  a.hp = a.maxHp * hpFrac;
  return a;
};

// ---- kit.priest.cast: runtime checks through the real SkillSystem
{
  // level-1 economy: shield on self, a flash heal, a smite on the foe
  const p = newPriest(null, 1);
  const foe = foeAt(2.2);
  H.step(2);
  H.setAimTarget(foe);
  p.resource = 100;
  H.clearEvents(); errors.length = 0;
  G.skills.tryCastSlot(p, 'rmb', H.aimFor(p, foe)); H.stepSec(0.6);
  ok('kit.priest.cast L1 Güç Kalkanı gives the caster a shield', p.statuses.has('shield'), `shield=${p.statuses.get('shield')?.magnitude ?? 0}`);
  p.hp = p.maxHp * 0.5;
  const hp0 = p.hp;
  p.resource = 100;
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foe)); H.stepSec(2.0);
  ok('kit.priest.cast L1 Hızlı Şifa heals the caster', p.hp > hp0, `hp ${hp0.toFixed(0)} -> ${p.hp.toFixed(0)}`);
  const f0 = foe.hp;
  p.resource = 100;
  const started = G.skills.tryCastSlot(p, 's1', H.aimFor(p, foe)); H.stepSec(1.6);
  ok('kit.priest.cast L1 Kutsal Ceza starts and hurts the foe', started === true && foe.hp < f0, `started=${started} hp ${f0} -> ${foe.hp}`);
  ok('kit.priest.cast no script errors in the L1 economy', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}
{
  // Disiplin: a shield on an ally marks Keffara; the caster's smite on the foe heals the marked ally
  const disc = SPECS.priest_discipline;
  const p = newPriest(disc);
  const foe = foeAt(2.2);
  const ally = allyAt(3, 0, 0.5);
  H.step(2);
  setFriendlyTarget(ally.id);
  H.setAimTarget(foe);
  p.resource = 100;
  G.skills.tryCast(p, 'priest_power_word_shield', H.aimFor(p, foe), 'rmb'); H.stepSec(1.6);
  ok('kit.priest.cast Disiplin shield on an ally marks Keffara', ally.statuses.has('atonement'), `atonement=${ally.statuses.has('atonement')}`);
  const hpA = ally.hp;
  p.resource = 100;
  const smite = G.skills.tryCastSlot(p, 's1', H.aimFor(p, foe)); H.stepSec(1.6);
  ok('kit.priest.cast Keffara: the smite heals the marked ally', ally.hp > hpA, `smite=${smite} ally hp ${hpA.toFixed(0)} -> ${ally.hp.toFixed(0)}`);
  setFriendlyTarget(null);
}
{
  // Gölge: Zihin Patlaması adds Delilik; Gölge Acısı is on the foe; Boşluk Oku spends 40; Boşluk Formu and the Shadowfiend work
  const sh = SPECS.priest_shadow;
  const p = newPriest(sh);
  const foe = foeAt(2.2);
  H.step(2);
  H.setAimTarget(foe);
  p.resource = 100;
  G.skills.tryCast(p, 'priest_shadow_mind_blast', H.aimFor(p, foe), 'rmb'); H.stepSec(2.0);
  ok('kit.priest.cast Zihin Patlaması adds 20 Delilik', G.skills.pipCount(p, 'insanity') === 20, `insanity=${G.skills.pipCount(p, 'insanity')}`);
  p.resource = 100;
  G.skills.tryCastSlot(p, 'e', H.aimFor(p, foe)); H.stepSec(0.8);
  ok('kit.priest.cast Gölge Acısı is on the foe', foe.statuses.has('shadow_word_pain'));
  p.pips = { insanity: 40 };
  p.resource = 100;
  G.skills.tryCastSlot(p, 'q', H.aimFor(p, foe)); H.stepSec(1.0);
  ok('kit.priest.cast Boşluk Oku spends 40 Delilik', G.skills.pipCount(p, 'insanity') === 0, `insanity=${G.skills.pipCount(p, 'insanity')}`);
  p.resource = 100;
  const vf = G.skills.tryCast(p, 'priest_shadow_voidform', H.aimFor(p, foe), 'm45'); H.stepSec(1.6);
  ok('kit.priest.cast Boşluk Formu grants voidform', vf === true && p.statuses.has('voidform'), `tryCast=${vf}`);
  p.resource = 100;
  const sf = G.skills.tryCast(p, 'priest_shadow_fiend', H.aimFor(p, foe), 'm90'); H.stepSec(1.5);
  const owned = G.minions.ownedBy(p.id).map((m) => m.def?.id);
  ok('kit.priest.cast Gölge Canavarı summons the Shadowfiend', sf === true && owned.includes('priest_shadowfiend'), `owned=${owned.join(',')}`);
}
{
  // Kutsal: Yenileme puts the HoT on the caster; Kutsal Söz: Huzur heals
  const holy = SPECS.priest_holy;
  const p = newPriest(holy);
  const foe = foeAt(3);
  H.step(2);
  p.resource = 100;
  p.hp = p.maxHp * 0.5;
  G.skills.tryCastSlot(p, 's2', H.aimFor(p, foe)); H.stepSec(0.8);
  ok('kit.priest.cast Yenileme puts the HoT on the healed ally', p.statuses.has('renew'));
  p.hp = p.maxHp * 0.5;
  const hp1 = p.hp;
  p.resource = 100;
  G.skills.tryCast(p, 'priest_holy_serenity', H.aimFor(p, foe), 'rmb'); H.stepSec(1.0);
  ok('kit.priest.cast Kutsal Söz: Huzur heals', p.hp > hp1, `hp ${hp1.toFixed(0)} -> ${p.hp.toFixed(0)}`);
  ok('kit.priest.cast Kutsal basic is the healer basic', G.character.save.skillBar.lmb === 'priest_holy_basic');
}

// ---- kit.priest.rotation: each spec's APL runs through the real SkillSystem for 30 s without script errors
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/pips:insanity/g, 'INS')
    .replace(/target\.status:(\w+)/g, "TS('$1')")
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/\bhp%/g, 'HPP')
    .replace(/ally\.low%/g, 'ALOW')
    .replace(/allies\.injured/g, 'AINJ')
    .replace(/allies\.debuffed/g, 'ADEB')
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], fn: new Function('S', 'TS', 'CDR', 'CH', 'CD', 'INS', 'HPP', 'ALOW', 'AINJ', 'ADEB', 'TG', `return (${cond});`) };
}
function runApl(spec, seconds) {
  const p = newPriest(spec);
  const foe = foeAt(2.2);
  const ally = allyAt(4, 0, 0.9);
  H.step(2);
  p.position.set(0, 0, 0);
  H.setAimTarget(foe);
  setFriendlyTarget(ally.id);
  const apl = ROTATIONS_KIT_PRIEST[spec.id];
  const compiled = apl.st.map(compile);
  const casts = {};
  const onCast = (ev) => { if (ev.casterId === p.id) casts[ev.skillId] = (casts[ev.skillId] ?? 0) + 1; };
  G.events.on('skill:cast', onCast);
  const slotOf = (id) => {
    if (id === 'priest_basic' || id === 'priest_holy_basic') return 'lmb';
    for (const [slot, sid] of Object.entries(G.character.save.skillBar)) if (sid === id) return slot;
    return null;
  };
  const CDR = (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; };
  const CH = (id) => G.skills.getCooldown(p, id).charges;
  const CD = (id) => G.skills.getCooldown(p, id).remaining;
  const total = Math.round(seconds / H.DT);
  for (let f = 0; f < total; f++) {
    p.resource = 100;
    // the healer's HP cycles 30 / 60 / 95 % every 2 s and the ally's too, so every heal row gets a turn; the others sit at 90 %
    const hpFrac = spec.role === 'healer' ? [0.3, 0.6, 0.95][Math.floor(f / 120) % 3] : 0.9;
    p.hp = p.maxHp * hpFrac;
    ally.hp = ally.maxHp * (spec.role === 'healer' ? [0.95, 0.3, 0.6][Math.floor(f / 120) % 3] : 0.9);
    if (foe.hp < 1e8) foe.hp = 1e9;
    if (f % 6 === 0) {
      const env = {
        S: (id) => p.statuses.has(id),
        TS: (id) => foe.statuses.has(id),
        CDR, CH, CD,
        INS: G.skills.pipCount(p, 'insanity'),
        HPP: 100 * p.hp / p.maxHp,
        ALOW: Math.min(p.hp / p.maxHp, ally.hp / ally.maxHp),
        AINJ: p.hp < p.maxHp * 0.9 ? 3 : 0,
        ADEB: false,
        TG: 1,
      };
      for (const line of compiled) {
        const slot = slotOf(line.skill);
        if (!slot) continue;
        if (!line.fn(env.S, env.TS, env.CDR, env.CH, env.CD, env.INS, env.HPP, env.ALOW, env.AINJ, env.ADEB, env.TG)) continue;
        if (line.skill !== 'priest_basic' && line.skill !== 'priest_holy_basic' && !CDR(line.skill)) continue;
        if (G.skills.tryCastSlot(p, slot, H.aimFor(p, foe))) break;
      }
    }
    H.step(1);
  }
  G.events.off?.('skill:cast', onCast);
  setFriendlyTarget(null);
  return { casts };
}
for (const sid of PRIEST_KIT_SPEC_IDS) {
  const spec = SPECS[sid];
  if (!spec) continue;
  errors.length = 0;
  const { casts } = runApl(spec, 30);
  const used = Object.keys(casts);
  ok(`kit.priest.rotation ${sid} casts at least 8 times in 30 s`, Object.values(casts).reduce((a, b) => a + b, 0) >= 8, `casts=${JSON.stringify(casts)}`);
  ok(`kit.priest.rotation ${sid} uses at least 3 distinct skills`, used.length >= 3, used.join(','));
  ok(`kit.priest.rotation ${sid} runs without script errors`, errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- level 1 (owner rule): every spec starts at level 1 with >= 4 usable core skills on its bar (basic / auto attack excluded)
for (const sid of ["priest_discipline","priest_holy","priest_shadow"]) {
  const spec = SPECS[sid];
  const l1 = Object.entries(spec.defaultBar).filter(([slot, id]) => slot !== 'lmb' && id !== spec.basic && SKILLS[id]?.unlockLevel <= 1 && (spec.unlock?.[id] ?? 1) <= 1);
  ok(`kit_priest.l1 ${sid} level 1 has >= 4 usable skills`, l1.length >= 4, l1.map(([s, id]) => `${s}=${id}`).join(','));
}
// ---- kit.defensive: Kutsal Ateş (Holy Fire, instant holy strike)
{
  const p = newPriest(SPECS.priest_holy);
  const foe = foeAt(2.2);
  G.skills.addResource(p, 300);
  const c = G.skills.tryCast(p, 'priest_holy_fire', H.aimFor(p, foe));
  H.stepSec(0.9);
  ok('kit.defensive priest_holy_fire strikes the target with holy damage', c === true && foe.hp < 1e9 && SKILLS.priest_holy_fire?.damage?.type === 'holy', `hp=${foe.hp}`);
  ok('kit.defensive priest_holy_fire is on the Kutsal list at unlock 6', SPECS.priest_holy.skills.includes('priest_holy_fire') && SPECS.priest_holy.unlock.priest_holy_fire === 6);
}

console.log(fails === 0 ? '\nkit.priest: all checks PASS' : `\nkit.priest: ${fails} FAIL`);
H.restoreConsole?.();
process.exit(fails === 0 ? 0 : 1);
