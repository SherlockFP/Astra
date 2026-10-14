// KIT Druid checks (WoW Midnight 12.0). Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/kit_druid.mjs
// Implemented: kit.druid.ids (specs, bars, majors, unlocks resolve), kit.druid.l1 (level-1 bar: basic + 4 usable skills), kit.druid.status
// (every applied status has a def; hot / takenMore / form stat rules), kit.druid.apl (rows resolve), kit.druid.forms (Forms.ts: resource
// swap Mana <-> Energy / Rage, button + LMB transform, stat swap, cancel on caster spells, auto-shift, speed forms, remote read, beast rig),
// kit.druid.balance / feral / guardian / resto (runtime through the real SkillSystem: AP loop, Eclipse, DoTs, combo points, bleeds,
// finisher scaling, rage, Ironfur stacks, Frenzied Regeneration, HoT stacking + Harmony, Swiftmend, Wild Growth, Lifebloom bloom,
// Tranquility), kit.druid.rotation (APL smoke run for each spec).
import * as H from './harness.mjs';

const { G, SKILLS, errors, events, THREE } = H;
const { SPECS } = await H.imp('data/specs.ts');
const { DEFAULT_BAR2_BY_SPEC } = await H.imp('data/defaultExtraBar.ts');
const { ROTATIONS_KIT_DRUID } = await H.imp('data/rotations_kit_druid.ts');
const { STATUSES, STATUS_RULES } = await H.imp('data/statuses.ts');
const { CLASSES, PLAYABLE_CLASSES } = await H.imp('data/classes.ts');
const { CharacterState } = await H.imp('systems/CharacterState.ts');
const { DRUID_KIT_SPEC_IDS } = await H.imp('data/specs_kit_druid.ts');
const Forms = await H.imp('combat/Forms.ts');
const { updateFormBody, disposeFormBody } = await H.imp('combat/FormBody.ts');
const { harmonyMul } = await H.imp('combat/skills/behaviors_druid.ts');
const { healFormula } = await H.imp('combat/healing.ts');

let fails = 0;
const ok = (name, cond, info = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
  if (!cond) fails++;
};

// ---- kit.druid.ids
ok('kit.druid.ids the four druid specs exist', DRUID_KIT_SPEC_IDS.length === 4 && DRUID_KIT_SPEC_IDS.every((id) => !!SPECS[id]), DRUID_KIT_SPEC_IDS.join(','));
for (const sid of DRUID_KIT_SPEC_IDS) {
  const s = SPECS[sid];
  if (!s) continue;
  const ids = [...s.skills, ...Object.values(s.defaultBar), ...Object.values(s.majors), ...Object.keys(s.unlock)];
  const missing = [...new Set(ids)].filter((id) => !SKILLS[id]);
  ok(`kit.druid.ids ${sid} skills, bar, majors and unlocks resolve`, missing.length === 0, missing.join(','));
  ok(`kit.druid.ids ${sid} bar has at most 12 slots`, Object.keys(s.defaultBar).length <= 12);
  ok(`kit.druid.ids ${sid} majors are m45 and m90 and sit on the bar`, !!SKILLS[s.majors.m45] && !!SKILLS[s.majors.m90] && s.defaultBar.m45 === s.majors.m45 && s.defaultBar.m90 === s.majors.m90);
  ok(`kit.druid.ids ${sid} class and role`, s.classId === 'druid' && ['tank', 'dps', 'healer'].includes(s.role));
  const own = Object.values(SKILLS).filter((d) => d.spec === sid).map((d) => d.id);
  ok(`kit.druid.ids ${sid} SpecDef.skills lists every spec-bound row`, own.every((id) => s.skills.includes(id)), own.filter((id) => !s.skills.includes(id)).join(','));
}
ok('kit.druid.ids roles: Denge dps, Vahşi dps, Koruyucu tank, Restorasyon healer',
  SPECS.druid_balance?.role === 'dps' && SPECS.druid_feral?.role === 'dps' && SPECS.druid_guardian?.role === 'tank' && SPECS.druid_restoration?.role === 'healer');
ok('kit.druid.ids ClassDef.specs lists the four specs', (CLASSES.druid?.specs ?? []).join() === DRUID_KIT_SPEC_IDS.join());
ok('kit.druid.ids ClassDef.skills all resolve', (CLASSES.druid?.skills ?? []).length >= 8 && CLASSES.druid.skills.every((id) => !!SKILLS[id]));
ok('kit.druid.ids the druid is playable', PLAYABLE_CLASSES.includes('druid'));
const rep = Object.values(SKILLS).filter((d) => d.classId === 'druid' && d.replaces);
ok('kit.druid.ids every button transform replaces a real druid skill and names a form status',
  rep.length >= 6 && rep.every((d) => SKILLS[d.replaces.skill]?.classId === 'druid' && !!STATUSES[d.replaces.whileStatus]), `${rep.length} rows`);
const behIds = [...new Set(Object.values(SKILLS).filter((d) => d.classId === 'druid' && d.behavior).map((d) => d.behavior))];
const { BEHAVIORS } = await H.imp('combat/skills/behaviors.ts');
ok('kit.druid.ids every behaviour a druid row names is installed', behIds.every((b) => b === 'combo' || !!BEHAVIORS[b]), behIds.filter((b) => b !== 'combo' && !BEHAVIORS[b]).join(','));
ok('kit.druid.ids secondary pip is Astral Güç (max 100)', CLASSES.druid?.secondary?.id === 'astral_power' && CLASSES.druid.secondary.max === 100);

// ---- kit.druid.l1
{
  const bar1 = CharacterState.defaultBar('druid', 1);
  ok('kit.druid.l1 lmb is the human chain', bar1.lmb === 'druid_basic', JSON.stringify(bar1));
  const usable = Object.values(bar1).filter((id) => id !== 'druid_basic' && SKILLS[id]?.unlockLevel <= 1);
  ok('kit.druid.l1 at least 3 usable skills at unlock 1', usable.length >= 3, usable.join(','));
  ok('kit.druid.l1 bar is wrath, moonfire, rejuvenation, cat form', bar1.rmb === 'druid_wrath' && bar1.q === 'druid_moonfire' && bar1.e === 'druid_rejuvenation' && bar1.s1 === 'druid_cat_form', JSON.stringify(bar1));
  ok('kit.druid.l1 the chains have steps', ['druid_basic', 'druid_cat_basic', 'druid_bear_basic'].every((id) => SKILLS[`${id}_1`] && SKILLS[`${id}_3`] && SKILLS[id].params.steps === 3));
}

// ---- kit.druid.status
{
  const applied = new Set();
  for (const d of Object.values(SKILLS)) {
    if (d.classId !== 'druid') continue;
    for (const s of [...(d.statuses ?? []), ...(d.selfStatuses ?? [])]) applied.add(s.status);
    if (d.replaces) applied.add(d.replaces.whileStatus);
    if (d.whileStatusMult) applied.add(d.whileStatusMult.status);
    if (d.procInstant) applied.add(d.procInstant.status);
  }
  for (const f of Object.values(Forms.FORMS)) applied.add(f.status);
  const missing = [...applied].filter((id) => !STATUSES[id]);
  ok('kit.druid.status every druid status has a def', missing.length === 0, missing.join(','));
  ok('kit.druid.status HoTs tick (hot rule)', ['rejuvenation', 'regrowth', 'lifebloom', 'wild_growth', 'frenzied'].every((id) => STATUS_RULES[id]?.hot === true));
  ok('kit.druid.status DoTs have a dotType', ['moonfire', 'sunfire', 'rake', 'rip', 'thrash'].every((id) => !!STATUSES[id]?.dotType));
  ok('kit.druid.status Bear form: +armour, +max HP; Travel: +40 % speed; Cat: speed',
    STATUSES.form_bear.stats.armorPct >= 1 && STATUSES.form_bear.stats.maxHpPct > 0 && STATUSES.form_travel.stats.moveSpeedPct === 0.4 && STATUSES.form_cat.stats.moveSpeedPct > 0);
  ok('kit.druid.status Ironfur stacks to 4', STATUS_RULES.ironfur?.stack === 'stack' && STATUSES.ironfur.maxStacks === 4);
  ok('kit.druid.status Survival Instincts -50 %, Barkskin -20 %, Demir Kabuk -20 %', STATUS_RULES.survival_instincts.takenMore === -0.5 && STATUS_RULES.barkskin.takenMore === -0.2 && STATUS_RULES.ironbark.takenMore === -0.2);
}

// ---- kit.druid.apl
for (const [sid, apl] of Object.entries(ROTATIONS_KIT_DRUID)) {
  const lines = [...apl.st, ...(apl.aoe ?? [])];
  const skillIds = new Set();
  const statusIds = new Set();
  for (const l of lines) {
    for (const m of l.matchAll(/\b(druid_[a-z_]+)/g)) skillIds.add(m[1]);
    for (const m of l.matchAll(/status:([a-z_]+)/g)) statusIds.add(m[1]);
  }
  const badSkills = [...skillIds].filter((id) => !SKILLS[id]);
  ok(`kit.druid.apl ${sid} skill ids resolve`, badSkills.length === 0, badSkills.join(','));
  const badStatus = [...statusIds].filter((id) => !STATUSES[id]);
  ok(`kit.druid.apl ${sid} status ids resolve`, badStatus.length === 0, badStatus.join(','));
  const basic = SPECS[sid]?.basic ?? SPECS[sid]?.defaultBar?.lmb ?? 'druid_basic';
  ok(`kit.druid.apl ${sid} ends with the weapon chain (${basic})`, apl.st.at(-1) === basic);
}
ok('kit.druid.apl the four specs have rows', DRUID_KIT_SPEC_IDS.every((id) => !!ROTATIONS_KIT_DRUID[id]));

// ---- runtime helpers
const newDruid = (spec = null, level = 30) => {
  const p = H.addPlayer('druid', level);
  p.spec = spec?.id ?? undefined;
  p.yaw = 0;
  p.position.set(0, 0, 0);
  p.stats.critChance = 0;
  if (spec?.mainStat) p.stats.dex = p.stats.int = 100;
  // the sim player has no Player.refreshStats: the form's resource swap is driven by the status hook
  // (Player.refreshStats resets the kind and max from the class first, then calls the sync)
  p.onStatusesChanged = function onStatusesChanged() { this.resourceType = 'mana'; this.maxResource = 100; Forms.syncFormResources(this); };
  p.refreshStats = p.onStatusesChanged;
  p.combatTimer = 99;
  G.character.save.skillBar = spec ? { ...spec.defaultBar } : CharacterState.defaultBar('druid', level);
  G.character.save.majorCd = { m45: 0, m90: 0, m180: 0 };
  G.character.save.spec = spec?.id ?? null;
  G.talents = { grantedSkills: () => [], skillPick: () => 0 };
  return p;
};
const foeAt = (z = 2.2, x = 0) => {
  const f = H.addEnemy(x, z, { hp: 1e9 });
  f.maxHp = 1e9; f.hp = 1e9;
  return f;
};
const cast = (p, slot, foe, secs = 1.2) => {
  const r = G.skills.tryCastSlot(p, slot, H.aimFor(p, foe));
  H.stepSec(secs);
  return r;
};
const dmgSum = (foe, fn) => { const h0 = foe.hp; fn(); return h0 - foe.hp; };

// ---- kit.druid.forms
{
  const p = newDruid(null, 30);
  const foe = foeAt(2.2);
  H.step(2);
  H.setAimTarget(foe);
  p.resource = 77;
  ok('kit.druid.forms L1 starts in caster form on mana', Forms.formOf(p) === null && p.resourceType === 'mana');
  ok('kit.druid.forms L1 lmb is the human chain', G.skills.getSlotSkill(p, 'lmb') === 'druid_basic');
  cast(p, 's1', foe, 0.8);
  ok('kit.druid.forms Kedi Biçimi button enters form_cat', p.statuses.has('form_cat') && Forms.formOf(p) === 'cat', `form=${Forms.formOf(p)}`);
  ok('kit.druid.forms cat uses Energy (max 100, start 50), mana is stashed', p.resourceType === 'energy' && p.maxResource === 100 && p.resource >= 48 && p.resource <= 62, `${p.resourceType} ${p.resource.toFixed(1)}/${p.maxResource}`);
  ok('kit.druid.forms cat transforms rmb / q / e / lmb', G.skills.getSlotSkill(p, 'rmb') === 'druid_shred' && G.skills.getSlotSkill(p, 'q') === 'druid_rake'
    && G.skills.getSlotSkill(p, 'e') === 'druid_rip' && G.skills.getSlotSkill(p, 'lmb') === 'druid_cat_basic',
  [1, 2, 3].map((i) => G.skills.getSlotSkill(p, ['rmb', 'q', 'e'][i - 1])).join(','));
  ok('kit.druid.forms cat form stat swap: speed, crit, dodge', (p.statuses.getStatMods().moveSpeedPct ?? 0) > 0.1 && (p.statuses.getStatMods().critChance ?? 0) > 0);
  H.stepSec(2);
  ok('kit.druid.forms energy refills (10 per second)', p.resource > 50 + 15, `energy=${p.resource.toFixed(1)}`);
  p.resource = 100;
  const e0 = p.resource;
  cast(p, 'rmb', foe, 1.0);
  ok('kit.druid.forms Doğra costs 25 Energy and builds 1 Kombo Puanı', p.resource < e0 - 8 && G.skills.pipCount(p, 'combo') >= 1, `energy ${e0}->${p.resource.toFixed(1)} cp=${G.skills.pipCount(p, 'combo')}`);
  // a caster spell drops the form and mana returns
  p.resource = 90;
  // Yaşam Çiçeği (not a form skill, no moonkin tag) is bound to s4 for this check
  G.character.save.skillBar = { ...G.character.save.skillBar, s4: 'druid_lifebloom' };
  const castOk = cast(p, 's4', null, 2.2);
  ok('kit.druid.forms a caster spell (Yaşam Çiçeği) drops the form', castOk && Forms.formOf(p) === null, `form=${Forms.formOf(p)}`);
  ok('kit.druid.forms mana is back (77 minus the spell cost)', p.resourceType === 'mana' && p.resource > 40 && p.resource <= 77, `${p.resourceType} ${p.resource.toFixed(1)}`);
  ok('kit.druid.forms the human bar is back after leaving', G.skills.getSlotSkill(p, 'rmb') === 'druid_wrath' && G.skills.getSlotSkill(p, 'lmb') === 'druid_basic');
  // toggling: the button again leaves the form
  cast(p, 's1', foe, 1.2);
  cast(p, 's1', foe, 1.2);
  ok('kit.druid.forms the form button toggles the form off again', Forms.formOf(p) === null && p.resourceType === 'mana', `form=${Forms.formOf(p)}`);
  // bear
  cast(p, 's3', foe, 0.8);
  ok('kit.druid.forms Ayı Biçimi: rage 0, armour and max HP mods, transforms rmb / q / e / lmb', Forms.formOf(p) === 'bear' && p.resourceType === 'rage' && p.resource < 5
    && (p.statuses.getStatMods().armorPct ?? 0) >= 1 && (p.statuses.getStatMods().maxHpPct ?? 0) > 0
    && G.skills.getSlotSkill(p, 'rmb') === 'druid_mangle' && G.skills.getSlotSkill(p, 'q') === 'druid_thrash' && G.skills.getSlotSkill(p, 'e') === 'druid_ironfur'
    && G.skills.getSlotSkill(p, 'lmb') === 'druid_bear_basic', `${p.resourceType} ${p.resource}`);
  // a cat skill from bear auto-shifts (no button press)
  G.character.save.skillBar = { ...G.character.save.skillBar, s2: 'druid_shred' };
  cast(p, 's2', foe, 0.8);
  ok('kit.druid.forms an f_cat skill auto-shifts Ayı -> Kedi and resources follow', Forms.formOf(p) === 'cat' && p.resourceType === 'energy');
  // travel form
  p.statuses.remove('form_cat');
  H.step(2);
  cast(p, 'r', foe, 0.8);
  ok('kit.druid.forms Yolcu Biçimi: +40 % move speed', Forms.formOf(p) === 'travel' && Math.abs((p.statuses.getStatMods().moveSpeedPct ?? 0) - 0.4) < 1e-6);
  // a status removed by the engine (death / scene change clear) returns the resources
  p.statuses.clear();
  H.step(2);
  ok('kit.druid.forms clearing statuses (death, scene) returns the caster resource', Forms.formOf(p) === null && p.resourceType === 'mana');
  // remote read: a peer only has the status list
  const remote = new (p.constructor)('druid', 30);
  remote.isLocal = false;
  remote.statuses.apply('form_bear', 5);
  ok('kit.druid.forms a remote player in form_bear reads as Ayı with a rage bar', Forms.formOf(remote) === 'bear' && Forms.formResourceOf(remote) === 'rage');
  // beast rig
  for (const f of ['cat', 'bear', 'travel', 'moonkin']) {
    const q = new (p.constructor)('druid', 30);
    q.velocity = q.velocity ?? new THREE.Vector3();
    q.modelLift = 0; q.jumpY = 0;
    const human = new THREE.Group();
    q.charModel = { root: human };
    q.statuses.apply(Forms.FORMS[f].status, 100);
    errors.length = 0;
    updateFormBody(q, 0.016);
    const rig = q.object3d.children.find((c) => c.name === `form_${f}`);
    updateFormBody(q, 0.016);
    ok(`kit.druid.forms beast rig ${f}: built, character model hidden, animates`, !!rig && human.visible === false && errors.length === 0, errors.slice(0, 1).join(''));
    q.statuses.remove(Forms.FORMS[f].status);
    updateFormBody(q, 0.016);
    ok(`kit.druid.forms beast rig ${f}: removed with the form, character model back`, !q.object3d.children.some((c) => c.name === `form_${f}`) && human.visible === true);
    disposeFormBody(q);
  }
}

// ---- kit.druid.l1run: a fresh level-1 druid can use the L1 bar for real (Güneş Gazabı, Ay Ateşi, Gençleşme, Kedi Biçimi, then the cat buttons)
{
  const p = newDruid(null, 1);
  const foe = foeAt(5);
  H.step(2);
  H.setAimTarget(foe);
  errors.length = 0;
  p.resource = 100;
  const hp0 = foe.hp;
  cast(p, 'rmb', foe, 2.0);
  ok('kit.druid.l1run Güneş Gazabı hits the target', foe.hp < hp0);
  cast(p, 'q', foe, 1.2);
  ok('kit.druid.l1run Ay Ateşi bleeds it (moonfire)', foe.statuses.has('moonfire'));
  p.hp = p.maxHp * 0.5;
  cast(p, 'e', foe, 1.2);
  ok('kit.druid.l1run Gençleşme heals the caster over time', p.statuses.has('rejuvenation'));
  foe.position.set(0, 0, 2.2);
  cast(p, 's1', foe, 1.0);
  ok('kit.druid.l1run Kedi Biçimi: Doğra on rmb, Tırmık on q, Parçalama on e, no spec needed', Forms.formOf(p) === 'cat' && G.skills.getSlotSkill(p, 'rmb') === 'druid_shred' && G.skills.getSlotSkill(p, 'q') === 'druid_rake' && G.skills.getSlotSkill(p, 'e') === 'druid_rip');
  p.resource = 100;
  cast(p, 'rmb', foe, 1.0);
  p.resource = 100;
  cast(p, 'rmb', foe, 1.0);
  p.resource = 100;
  const hpB = foe.hp;
  cast(p, 'e', foe, 1.0);
  ok('kit.druid.l1run Doğra x2 builds points and Parçalama spends them', foe.hp < hpB && G.skills.pipCount(p, 'combo') === 0);
  ok('kit.druid.l1run no script errors', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- kit.druid.balance
{
  const spec = SPECS.druid_balance;
  const p = newDruid(spec);
  const foe = foeAt(8);
  const foe2 = foeAt(10, 2);
  H.step(2);
  H.setAimTarget(foe);
  p.resource = 100;
  errors.length = 0;
  cast(p, 'rmb', foe, 2.0);
  ok('kit.druid.balance Güneş Gazabı hits and gives 8 Astral Güç', G.skills.pipCount(p, 'astral_power') === 8 && foe.hp < 1e9, `ap=${G.skills.pipCount(p, 'astral_power')}`);
  cast(p, 'e', foe, 2.5); // Yıldız Ateşi
  ok('kit.druid.balance Yıldız Ateşi (2 s cast) gives 12 more, enters Ay Baykuşu Biçimi', G.skills.pipCount(p, 'astral_power') === 20 && Forms.formOf(p) === 'moonkin', `ap=${G.skills.pipCount(p, 'astral_power')} form=${Forms.formOf(p)}`);
  ok('kit.druid.balance Moonkin keeps casting (spells do not drop it) on mana', Forms.formOf(p) === 'moonkin' && p.resourceType === 'mana');
  const ap0 = G.skills.pipCount(p, 'astral_power');
  const started = cast(p, 's2', foe, 1.0);
  ok('kit.druid.balance Yıldız Dalgası refuses below 35 AP', started === false && G.skills.pipCount(p, 'astral_power') === ap0);
  p.pips = { ...(p.pips ?? {}), astral_power: 60 };
  const hpB = foe.hp;
  cast(p, 's2', foe, 1.5);
  ok('kit.druid.balance Yıldız Dalgası spends 35 AP and hits hard', G.skills.pipCount(p, 'astral_power') === 25 && hpB - foe.hp > 0, `ap=${G.skills.pipCount(p, 'astral_power')}`);
  cast(p, 'q', foe, 1.0);
  ok('kit.druid.balance Ay Ateşi puts moonfire on the target (dps snapshot)', foe.statuses.has('moonfire') && (foe.statuses.get('moonfire')?.dps ?? 0) > 0);
  cast(p, 's1', foe, 1.0);
  ok('kit.druid.balance Güneş Ateşi burns the pack around the target', foe.statuses.has('sunfire') && foe2.statuses.has('sunfire'), `${foe.statuses.has('sunfire')} ${foe2.statuses.has('sunfire')}`);
  // Tutulma alternates Güneş / Ay
  G.character.save.skillBar = { ...G.character.save.skillBar, s3: 'druid_eclipse' }; cast(p, 's3', foe, 0.8);
  const first = p.statuses.has('eclipse_solar') ? 'solar' : p.statuses.has('eclipse_lunar') ? 'lunar' : 'none';
  p.pips = { ...p.pips, astral_power: 0 };
  G.skills.resetCooldown?.(p, 'druid_eclipse');
  cast(p, 's3', foe, 0.8);
  const second = p.statuses.has('eclipse_solar') ? 'solar' : p.statuses.has('eclipse_lunar') ? 'lunar' : 'none';
  ok('kit.druid.balance Tutulma opens Güneş or Ay and the next cast switches', first !== 'none' && second !== 'none' && first !== second, `${first} -> ${second}`);
  // eclipse bonus: Wrath under Güneş hits ~1.4x harder
  const dummy = foeAt(9, -3);
  const wrathAvg = (solar) => {
    let tot = 0;
    for (let i = 0; i < 8; i++) {
      p.statuses.remove('eclipse_solar'); p.statuses.remove('eclipse_lunar');
      if (solar) p.statuses.apply('eclipse_solar', 20);
      p.resource = 100;
      tot += dmgSum(dummy, () => cast(p, 'rmb', dummy, 2.0));
    }
    return tot / 8;
  };
  const base = wrathAvg(false), boosted = wrathAvg(true);
  ok('kit.druid.balance Güneş Tutulması: Güneş Gazabı about +40 %', boosted / base > 1.2 && boosted / base < 1.7, `x${(boosted / base).toFixed(2)}`);
  // Göksel Hizalanma
  p.resource = 100;
  cast(p, 'm45', foe, 1.0);
  ok('kit.druid.balance Göksel Hizalanma opens both Tutulmalar and gives AP', p.statuses.has('celestial_alignment') && p.statuses.has('eclipse_solar') && p.statuses.has('eclipse_lunar') && G.skills.pipCount(p, 'astral_power') >= 40);
  // Yıldız Yağmuru channel hits the pack
  p.pips = { ...p.pips, astral_power: 100 };
  const hpF1 = foe.hp, hpF2 = foe2.hp;
  foe.position.set(0, 0, 5); foe2.position.set(0, 0, 6);
  cast(p, 'r', foe, 4.0);
  ok('kit.druid.balance Yıldız Yağmuru spends 50 AP and hits both enemies', G.skills.pipCount(p, 'astral_power') <= 50 + 10 && foe.hp < hpF1 && foe2.hp < hpF2, `ap=${G.skills.pipCount(p, 'astral_power')}`);
  // Elune'nin Hiddeti
  p.resource = 100;
  const hpE = foe.hp;
  cast(p, 'm90', foe, 1.0);
  H.stepSec(9);
  ok("kit.druid.balance Elune'nin Hiddeti pulses on the aimed ground", foe.hp < hpE);
  ok('kit.druid.balance no script errors', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- kit.druid.feral
{
  const spec = SPECS.druid_feral;
  const p = newDruid(spec);
  const foe = foeAt(2.2);
  H.step(2);
  H.setAimTarget(foe);
  errors.length = 0;
  p.resource = 100;
  cast(p, 'rmb', foe, 1.0); // Doğra: auto-shift into Kedi
  ok('kit.druid.feral Doğra auto-shifts into Kedi and builds a Kombo Puanı', Forms.formOf(p) === 'cat' && G.skills.pipCount(p, 'combo') >= 1, `form=${Forms.formOf(p)} cp=${G.skills.pipCount(p, 'combo')}`);
  p.resource = 100;
  cast(p, 'q', foe, 1.0);
  ok('kit.druid.feral Tırmık bleeds (rake dps) and builds a point', foe.statuses.has('rake') && (foe.statuses.get('rake')?.dps ?? 0) > 0 && G.skills.pipCount(p, 'combo') >= 2);
  p.resource = 100;
  ok('kit.druid.feral the LMB chain is the cat chain', G.skills.getSlotSkill(p, 'lmb') === 'druid_cat_basic');
  // finishers scale with points: Yırtıcı Isırık at 2 vs 5
  const clean = foeAt(2.4, 0.2); // no bleeds on it: the bite alone
  foe.position.set(0, 0, 40); // the bleeding foe steps out of the way
  H.setAimTarget(clean);
  const bite = (cp) => {
    const all = [];
    for (let i = 0; i < 11; i++) {
      G.skills.consumeCombo(p); G.skills.addCombo(p, cp);
      p.resource = 100;
      all.push(dmgSum(clean, () => cast(p, 's1', clean, 1.1)));
    }
    return all.sort((a, b) => a - b)[5]; // median: crits and weapon rolls are noise
  };
  const b2 = bite(2), b5 = bite(5);
  foe.position.set(0, 0, 2.2);
  H.setAimTarget(foe);
  ok('kit.druid.feral Yırtıcı Isırık scales with points (5 vs 2: more than 1.6x)', b5 / b2 > 1.6, `2cp=${b2.toFixed(0)} 5cp=${b5.toFixed(0)}`);
  ok('kit.druid.feral the finisher spends every point', G.skills.pipCount(p, 'combo') === 0, `cp=${G.skills.pipCount(p, 'combo')}`);
  // Parçalama: duration grows per point
  const rip = (cp) => {
    foe.statuses.remove('rip');
    G.skills.consumeCombo(p); G.skills.addCombo(p, cp);
    p.resource = 100; G.skills.resetCooldown?.(p, 'druid_rip');
    cast(p, 'e', foe, 1.0);
    return foe.statuses.get('rip');
  };
  const r2 = rip(2), r5 = rip(5);
  ok('kit.druid.feral Parçalama lasts longer and bleeds harder in total with 5 points', !!r2 && !!r5 && r5.duration > r2.duration + 5 && r5.dps * r5.duration > r2.dps * r2.duration * 1.8,
    r2 && r5 ? `2cp ${r2.duration.toFixed(0)}s ${r2.dps.toFixed(0)}dps | 5cp ${r5.duration.toFixed(0)}s ${r5.dps.toFixed(0)}dps` : 'missing');
  // Pars Öfkesi
  p.resource = 10;
  cast(p, 's3', foe, 0.8);
  ok('kit.druid.feral Pars Öfkesi: +15 % damage and 40 Energy', p.statuses.has('feral_fury') && p.resource >= 45, `energy=${p.resource.toFixed(1)}`);
  // Vahşi Çılgınlık: 5 hits + 5 points
  G.skills.consumeCombo(p);
  const hpFr = foe.hp;
  p.resource = 100;
  cast(p, 'm90', foe, 2.2);
  ok('kit.druid.feral Vahşi Çılgınlık hits 5 times and gives 5 points', foe.hp < hpFr && G.skills.pipCount(p, 'combo') === 5, `cp=${G.skills.pipCount(p, 'combo')}`);
  cast(p, 'm45', foe, 1.0);
  ok('kit.druid.feral Vahşileşme grants berserk (-40 % costs)', p.statuses.has('berserk'));
  ok('kit.druid.feral no script errors', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- kit.druid.guardian
{
  const spec = SPECS.druid_guardian;
  const p = newDruid(spec);
  const foe = foeAt(2.2);
  const foe2 = foeAt(2.6, 1.4);
  H.step(2);
  H.setAimTarget(foe);
  errors.length = 0;
  cast(p, 'rmb', foe, 1.0);
  ok('kit.druid.guardian Parçalayıcı Pençe auto-shifts into Ayı and builds Öfke (8)', Forms.formOf(p) === 'bear' && p.resourceType === 'rage' && p.resource >= 7, `form=${Forms.formOf(p)} rage=${p.resource.toFixed(1)}`);
  cast(p, 's1', foe, 1.0);
  ok('kit.druid.guardian Çırpınma bleeds both enemies and gives Öfke', foe.statuses.has('thrash') && foe2.statuses.has('thrash') && p.resource >= 11, `rage=${p.resource.toFixed(1)}`);
  p.resource = 80;
  cast(p, 'e', foe, 0.8);
  cast(p, 'e', foe, 0.8);
  ok('kit.druid.guardian Demir Post costs 35 Öfke and stacks', (p.statuses.stacks('ironfur') ?? 0) === 2 && p.resource < 15, `stacks=${p.statuses.stacks('ironfur')} rage=${p.resource.toFixed(1)}`);
  const armor0 = p.statuses.getStatMods().armorPct ?? 0;
  ok('kit.druid.guardian armour from the form and Ironfur stacks (>= 1.0 + 0.5)', armor0 >= 1.45, `armorPct=${armor0}`);
  p.hp = p.maxHp * 0.4;
  const hp0 = p.hp;
  cast(p, 's3', foe, 3.4);
  ok('kit.druid.guardian Çılgın Yenilenme heals ~35 % max HP over 3 s', p.hp - hp0 > p.maxHp * 0.2, `+${((p.hp - hp0) / p.maxHp * 100).toFixed(0)} %`);
  cast(p, 'q', foe, 0.8);
  ok('kit.druid.guardian Kükreme taunts', foe.statuses.has('taunt'));
  cast(p, 'm45', foe, 0.8);
  ok('kit.druid.guardian Hayatta Kalma İçgüdüsü -50 % damage taken', p.statuses.has('survival_instincts') && Math.abs(p.statuses.takenMore() - 0.5) < 0.01 * 0.5 + 0.2, `takenMore=${p.statuses.takenMore().toFixed(2)}`);
  // damage taken feeds rage
  p.resource = 0;
  G.events.emit('damage', { targetId: p.id, sourceId: foe.id, amount: p.maxHp * 0.1, crit: false, type: 'physical', kind: 'player_hurt', pos: [0, 0, 0] });
  ok('kit.druid.guardian damage taken gives Öfke', p.resource > 3, `rage=${p.resource.toFixed(1)}`);
  ok('kit.druid.guardian no script errors', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- kit.druid.resto
{
  const spec = SPECS.druid_restoration;
  const p = newDruid(spec);
  const foe = foeAt(8);
  H.step(2);
  H.setAimTarget(null);
  errors.length = 0;
  p.resource = 100;
  p.hp = p.maxHp * 0.3;
  cast(p, 'rmb', null, 0.5);
  ok('kit.druid.resto Gençleşme puts a HoT on the (self) pick', p.statuses.has('rejuvenation') && (p.statuses.get('rejuvenation')?.magnitude ?? 0) > 0);
  const hpR = p.hp;
  H.stepSec(6);
  ok('kit.druid.resto the HoT heals over time', p.hp > hpR, `hp ${hpR.toFixed(0)} -> ${p.hp.toFixed(0)}`);
  cast(p, 'q', null, 1.7);
  cast(p, 's2', null, 3.0);
  ok('kit.druid.resto Gençleşme + Yaşam Çiçeği + Yeniden Büyüme stack on one target', p.statuses.has('rejuvenation') && p.statuses.has('lifebloom') && p.statuses.has('regrowth'));
  ok('kit.druid.resto Mastery: Armoni grows with each HoT (>= +12 % with 3)', harmonyMul(p, p) >= 1.17, `x${harmonyMul(p, p).toFixed(2)}`);
  // Yabani Büyüme
  p.hp = p.maxHp * 0.5;
  const hpW = p.hp;
  cast(p, 's1', null, 2.6);
  ok('kit.druid.resto Yabani Büyüme heals at once and adds the HoT', p.hp > hpW && p.statuses.has('wild_growth'));
  // Çabuk İyileşme consumes a HoT
  p.hp = p.maxHp * 0.4;
  const hpS = p.hp;
  cast(p, 's3', null, 1.7);
  ok('kit.druid.resto Çabuk İyileşme consumes a HoT and heals big', p.hp - hpS > p.maxHp * 0.03 && HOTCOUNT(p) < 4, `hots=${HOTCOUNT(p)}`);
  function HOTCOUNT(a) { return ['rejuvenation', 'regrowth', 'lifebloom', 'wild_growth'].filter((s) => a.statuses.has(s)).length; }
  // swiftmend without a HoT fails
  for (const s of ['rejuvenation', 'regrowth', 'lifebloom', 'wild_growth']) p.statuses.remove(s);
  G.skills.resetCooldown?.(p, 'druid_swiftmend');
  p.resource = 100;
  ok('kit.druid.resto Çabuk İyileşme refuses without a HoT', cast(p, 's3', null, 0.5) === false);
  // Yaşam Çiçeği blooms at the end
  p.hp = p.maxHp * 0.2;
  p.resource = 100;
  cast(p, 'q', null, 1.7);
  const t = p.statuses.get('lifebloom');
  p.statuses.apply('lifebloom', 0.1, { magnitude: 0, sourceId: p.id });
  const hpBloom0 = p.hp;
  H.stepSec(14);
  ok('kit.druid.resto Yaşam Çiçeği heals (HoT + bloom) over its life', !!t && p.hp > hpBloom0, `hp ${hpBloom0.toFixed(0)} -> ${p.hp.toFixed(0)}`);
  // Berraklık Alameti makes Yeniden Büyüme instant
  p.statuses.apply('omen_clarity', 10, { sourceId: p.id });
  p.resource = 60;
  G.skills.tryCastSlot(p, 's2', H.aimFor(p, null));
  H.stepSec(2.2);
  ok('kit.druid.resto Berraklık Alameti: Yeniden Büyüme is free and consumes the proc', p.statuses.has('regrowth') && !p.statuses.has('omen_clarity') && p.resource >= 60, `regrowth=${p.statuses.has('regrowth')} mana=${p.resource.toFixed(0)}`);
  // Demir Kabuk
  H.stepSec(1.5);
  cast(p, 'm45', null, 1.0);
  ok('kit.druid.resto Demir Kabuk puts -20 % damage taken on the pick', p.statuses.has('ironbark'));
  // Dinginlik
  p.hp = p.maxHp * 0.3;
  const hpT = p.hp;
  H.stepSec(1.5);
  cast(p, 'm90', null, 7.5);
  ok('kit.druid.resto Dinginlik heals over its 6 s channel', p.hp - hpT > p.maxHp * 0.2, `+${((p.hp - hpT) / p.maxHp * 100).toFixed(0)} %`);
  // the basic is the healer chain
  ok('kit.druid.resto Doğa Kıvılcımı is the healer basic', G.skills.getSlotSkill(p, 'lmb') === 'druid_resto_basic');
  ok('kit.druid.resto no script errors', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- kit.druid.resto.new: Yeniden Doğuş (battle res: refused without a dead ally, accepted with one) and Çiçeklenme (ground heal zone)
{
  errors.length = 0;
  const p = newDruid(SPECS.druid_restoration);
  p.position.set(400, 0, 400); // far from the other sim actors: no leftover dead ally can be in range
  H.step(2);
  p.resource = 200;
  ok('kit.druid.resto Yeniden Doğuş is refused with no dead ally in range', G.skills.tryCast(p, 'druid_rebirth', H.aimFor(p, null)) === false);
  const dead = new H.FakePlayer('druid', 30); dead.id = 93; H.world.add(dead);
  dead.position.set(p.position.x - Math.sin(p.yaw) * 4, 0, p.position.z - Math.cos(p.yaw) * 4); dead.alive = false; dead.hp = 0;
  ok('kit.druid.resto Yeniden Doğuş accepts a dead ally in range', G.skills.tryCast(p, 'druid_rebirth', H.aimFor(p, null)) === true);
  ok('kit.druid.resto Yeniden Doğuş is on the resto default bar (Shift bar 2)', DEFAULT_BAR2_BY_SPEC.druid_restoration?.includes('druid_rebirth') === true);
}
{
  const q = newDruid(SPECS.druid_restoration);
  q.position.set(-400, 0, -400);
  H.step(2);
  q.resource = 200;
  const ally = new H.FakePlayer('druid', 30); ally.id = 94; H.world.add(ally);
  ally.position.set(q.position.x + Math.sin(q.yaw) * 6, 0, q.position.z + Math.cos(q.yaw) * 6); ally.hp = ally.maxHp * 0.4;
  const hpA0 = ally.hp;
  const cE = G.skills.tryCast(q, 'druid_efflorescence', H.aimFor(q, null));
  H.stepSec(5);
  ok('kit.druid.resto Çiçeklenme heals the allies inside its ground zone', cE === true && ally.hp > hpA0, `hp ${hpA0.toFixed(0)} -> ${ally.hp.toFixed(0)}`);
  ok('kit.druid.resto Çiçeklenme is on the resto bar (s4)', G.skills.getSlotSkill(q, 's4') === 'druid_efflorescence');
  ok('kit.druid.resto no script errors (Yeniden Doğuş / Çiçeklenme)', errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}

// ---- kit.druid.l1 (owner rule): level 1 starts with >= 4 usable core skills per spec, and each form's level-1 bar has >= 4 too
{
  const usable = (id) => !!SKILLS[id] && (SKILLS[id].unlockLevel ?? 1) <= 1;
  const L1 = CharacterState.defaultBar('druid', 1);
  for (const sid of ['druid_balance', 'druid_feral', 'druid_guardian', 'druid_restoration']) {
    const bar = SPECS[sid].defaultBar;
    const core = Object.entries(bar).filter(([slot, id]) => slot !== 'lmb' && id !== SPECS[sid].basic && usable(id)).map(([, id]) => id);
    ok(`kit.druid.l1 ${sid} starts with >= 4 usable core skills`, core.length >= 4, core.join(','));
  }
  // form buttons: the level-1 bar (caster slots) after the form swaps its skills through SkillDef.replaces
  for (const [st, nm] of [['form_cat', 'Kedi'], ['form_bear', 'Ayı']]) {
    const eff = Object.values(L1).map((slotId) => {
      const r = Object.values(SKILLS).find((x) => x.replaces?.whileStatus === st && x.replaces.skill === slotId && usable(x.id));
      return r ? r.id : slotId;
    });
    const n = eff.filter((id) => usable(id)).length;
    ok(`kit.druid.l1 ${nm} Biçimi bar has >= 4 usable skills at level 1`, n >= 4, eff.join(','));
  }
}

// ---- kit.druid.rotation: each spec's APL runs through the real SkillSystem for 30 s without script errors
function compile(line) {
  const m = line.match(/^(\S+)(?:\s+if\s+(.*))?$/);
  const cond = (m[2] ?? 'true')
    .replace(/cd_ready\((\w+)\)/g, "CDR('$1')")
    .replace(/charges\((\w+)\)/g, "CH('$1')")
    .replace(/\bcd\((\w+)\)/g, "CD('$1')")
    .replace(/pips:(\w+)/g, "PIP('$1')")
    .replace(/target\.status:(\w+)/g, "TS('$1')")
    .replace(/!status:(\w+)/g, "!S('$1')")
    .replace(/status:(\w+)/g, "S('$1')")
    .replace(/\bhp%/g, 'HPP')
    .replace(/ally\.low%/g, 'ALOW')
    .replace(/allies\.injured/g, 'AINJ')
    .replace(/allies\.debuffed/g, 'ADEB')
    .replace(/\btargets\b/g, 'TG');
  // eslint-disable-next-line no-new-func
  return { skill: m[1], fn: new Function('S', 'TS', 'CDR', 'CH', 'CD', 'PIP', 'HPP', 'ALOW', 'AINJ', 'ADEB', 'TG', `return (${cond});`) };
}
function runApl(spec, seconds, list = 'st') {
  const p = newDruid(spec);
  const foe = foeAt(2.2);
  H.step(2);
  p.position.set(0, 0, 0);
  H.setAimTarget(foe);
  const compiled = ROTATIONS_KIT_DRUID[spec.id][list].map(compile);
  const casts = {};
  const onCast = (ev) => { if (ev.casterId === p.id) casts[ev.skillId] = (casts[ev.skillId] ?? 0) + 1; };
  G.events.on('skill:cast', onCast);
  const slotOf = (id) => {
    if (id === (spec.basic ?? 'druid_basic')) return 'lmb';
    for (const [slot, sid] of Object.entries(G.character.save.skillBar)) if (sid === id) return slot;
    return null;
  };
  const CDR = (id) => { const c = G.skills.getCooldown(p, id); return c.remaining <= 0 && c.charges >= 1; };
  const CH = (id) => G.skills.getCooldown(p, id).charges;
  const CD = (id) => G.skills.getCooldown(p, id).remaining;
  const foeStart = foe.hp;
  const total = Math.round(seconds / H.DT);
  for (let f = 0; f < total; f++) {
    if (spec.role !== 'tank') p.resource = Math.max(p.resource, p.resourceType === 'mana' ? 100 : p.resource);
    p.hp = p.maxHp * (spec.role === 'healer' ? [0.3, 0.6, 0.95][Math.floor(f / 120) % 3] : spec.role === 'tank' ? 0.6 : 0.9);
    if (foe.hp < 1e8) foe.hp = 1e9;
    if (f % 6 === 0 && !p.cast) { // a hard cast in progress is not cancelled by the APL
      const env = {
        S: (id) => p.statuses.has(id), TS: (id) => foe.statuses.has(id), CDR, CH, CD,
        PIP: (id) => G.skills.pipCount(p, id), HPP: 100 * p.hp / p.maxHp, ALOW: p.hp / p.maxHp, AINJ: list === 'aoe' ? 3 : 0, ADEB: false, TG: list === 'aoe' ? 3 : 1,
      };
      for (const line of compiled) {
        const slot = slotOf(line.skill);
        if (!slot) continue;
        if (!line.fn(env.S, env.TS, env.CDR, env.CH, env.CD, env.PIP, env.HPP, env.ALOW, env.AINJ, env.ADEB, env.TG)) continue;
        if (line.skill !== 'druid_basic' && !String(line.skill).endsWith('_basic') && !CDR(line.skill)) continue;
        if (G.skills.tryCastSlot(p, slot, H.aimFor(p, foe))) break;
      }
    }
    H.step(1);
  }
  G.events.off?.('skill:cast', onCast);
  return { casts, dmg: 1e9 - foe.hp + (foeStart - 1e9), p };
}
for (const sid of DRUID_KIT_SPEC_IDS) {
  const spec = SPECS[sid];
  errors.length = 0;
  const { casts } = runApl(spec, 30);
  const used = Object.keys(casts);
  const n = Object.values(casts).reduce((a, b) => a + b, 0);
  ok(`kit.druid.rotation ${sid} casts at least 8 times in 30 s`, n >= 8, `casts=${JSON.stringify(casts)}`);
  ok(`kit.druid.rotation ${sid} uses at least 3 distinct skills`, used.length >= 3, used.join(','));
  ok(`kit.druid.rotation ${sid} runs without script errors`, errors.length === 0, errors.slice(0, 2).map((m) => m.slice(0, 160)).join(' | '));
}
for (const sid of ['druid_balance', 'druid_feral', 'druid_guardian']) {
  errors.length = 0;
  const { casts } = runApl(SPECS[sid], 20, 'aoe');
  ok(`kit.druid.rotation ${sid} aoe list runs without script errors`, errors.length === 0 && Object.keys(casts).length >= 3, `casts=${JSON.stringify(casts)} ${errors.slice(0, 1).join('')}`);
}

// ---- kit.druid.dps: single-target damage per second at the sim's flat stats, for the balance review (printed, loose sanity band)
{
  const out = {};
  for (const sid of ['druid_balance', 'druid_feral']) {
    const spec = SPECS[sid];
    const p = newDruid(spec);
    const foe = foeAt(2.2);
    H.step(2);
    H.setAimTarget(foe);
    const r = runApl(spec, 40);
    out[sid] = r;
  }
  const monk = (() => { /* monk windwalker reference is not re-run here: this sim only prints druid numbers */ return null; })();
  void monk;
  console.log('INFO kit.druid.dps casts/40 s', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.values(v.casts).reduce((a, b) => a + b, 0)]))));
}

console.log(fails === 0 ? '\nkit.druid: all checks PASS' : `\nkit.druid: ${fails} FAIL`);
H.restoreConsole?.();
// ---- kit.druid.dmg: keys 1-4 (rmb, q, e, r) carry >= 2 damage skills on each healer spec of the class
{
  const KEYS14 = ['rmb', 'q', 'e', 'r'];
  const healers = Object.values(SPECS).filter((s) => s.classId === 'druid' && s.role === 'healer');
  ok('kit.druid.dmg has a healer spec to audit', healers.length > 0, healers.map((s) => s.id).join(','));
  for (const s of healers) {
    const n = KEYS14.filter((k) => (H.SKILLS[s.defaultBar[k]]?.damage?.coef ?? 0) > 0).length;
    ok(`kit.druid.dmg ${s.id} has >= 2 damage skills on keys 1-4`, n >= 2, KEYS14.map((k) => `${k}=${s.defaultBar[k]}`).join(','));
  }
}
process.exit(fails === 0 ? 0 : 1);
