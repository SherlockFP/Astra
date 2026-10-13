// CW-07 · Skill loop B checks (COMBAT_WOW §4.3 CW-07): pushback, proc mods, PRD, proc watcher, school lockout, icons, off-GCD tags.
// Static checks are pure (no world needed). Live checks need a running local player (dev/combat.html) and use dev.cast / dev.wait.
import { registerWowCheck, type WowCheckResult } from '../combat_wow';
import { G } from '../../game/G';
import { SKILLS } from '../../data/skills';
import type { SkillDef } from '../../types/skills';
import { isOffGcd } from '../../combat/gcd';
import { Prd, prdC, prdRate } from '../../combat/prd';
import { PUSHBACK_CFG, pushbackAdd, channelCut, lockoutSchool, type HitForPushback } from '../../combat/castRules';
import { resolveProcMods, consumeProcMods } from '../../combat/procMods';
import { iconForStats } from '../../combat/procActions';
import { PROC_DEFS } from '../../data/procs';

type SlotKey = 'rmb' | 'q' | 'e' | 'lmb' | 'r' | 's1' | 's2' | 's3' | 's4' | 'm45' | 'm90' | 'm180';

interface DevLike {
  cast(slot: SlotKey, atNearest?: boolean): unknown;
  wait(sec: number): Promise<void>;
}

const BAR_SLOTS: SlotKey[] = ['rmb', 'q', 'e', 's1', 's2', 's3', 's4', 'r'];

function devApi(): DevLike | null {
  const d = (window as unknown as { dev?: DevLike }).dev;
  return d && typeof d.cast === 'function' && typeof d.wait === 'function' ? d : null;
}

function noPlayer(): WowCheckResult {
  return { ok: false, msg: 'yerel oyuncu yok (dev/combat.html içinde çalıştırın)' };
}

/** First bar slot whose skill matches `pred` (null when the current bar has none). */
function slotWhere(pred: (def: SkillDef) => boolean): SlotKey | null {
  const bar = G.character?.save.skillBar as unknown as Partial<Record<SlotKey, string>> | undefined;
  if (!bar) return null;
  for (const slot of BAR_SLOTS) {
    const id = bar[slot];
    const def = id ? SKILLS[id] : undefined;
    if (def && pred(def)) return slot;
  }
  return null;
}

/** Seeded LCG in [0, 1): the PRD sample is repeatable. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---- static -------------------------------------------------------------------------------------------------------

// Pushback rules (§2.4): +0.5 s for the first two qualifying hits, nothing for small, DoT, absorbed or immune hits.
registerWowCheck({
  id: 'cw07.pushback.rules',
  run: () => {
    const hit: HitForPushback = { hitFrac: 0.1 };
    const seq = [0, 1, 2].map((n) => pushbackAdd(n, hit));
    const small = pushbackAdd(0, { hitFrac: 0.02 });
    const dot = pushbackAdd(0, { hitFrac: 0.1, dot: true });
    const absorbed = pushbackAdd(0, { hitFrac: 0.1, absorbed: true });
    const immune = pushbackAdd(0, { hitFrac: 0.1, resist: true });
    const cut = [channelCut(10, 0, hit), channelCut(10, 2, hit)];
    const ok = seq[0] === 0.5 && seq[1] === 0.5 && seq[2] === 0 && small === 0 && dot === 0 && absorbed === 0 && immune === 0
      && cut[0] === 2.5 && cut[1] === 0 && PUSHBACK_CFG.max === 2;
    return ok
      ? { ok: true, msg: `+0.5, +0.5, +0 · 3 % altı / DoT / emilen / bağışık = 0 · kanal kesimi 25 % ×2` }
      : { ok: false, msg: `pushback kuralı uyuşmuyor: ${JSON.stringify({ seq, small, dot, absorbed, immune, cut })}` };
  },
});

// Proc mods (§2.7): revenge_ready makes knight_revenge free and +25 %, and the status is spent by consume. (PM-KN moved the
// revenge_ready row from knight_shield_bash to knight_revenge; the shield bash gets its shield_block x1.3 from its own row.)
registerWowCheck({
  id: 'cw07.mods',
  run: () => {
    const active = new Set<string>(['revenge_ready']);
    const view = { has: (s: string) => active.has(s), stacks: () => 0 };
    const r = resolveProcMods(view, 'knight_revenge');
    const none = resolveProcMods(view, 'knight_charge');
    const host = { ...view, remove: (s: string) => { active.delete(s); } };
    const heal = consumeProcMods(host, r);
    const again = consumeProcMods(host, r);
    const ok = !!r && r.costMult === 0 && !r.cdFree && r.more === 1.25 && none === null && heal === 0 && again === 0 && !active.has('revenge_ready');
    return ok
      ? { ok: true, msg: 'revenge_ready: knight_revenge cost ×0, more ×1.25; statüs tüketimde kalkar' }
      : { ok: false, msg: `proc mod çözümü uyuşmuyor: ${JSON.stringify(r)}` };
  },
});

// PRD (§2.7): the nominal chance is preserved, and the bad-luck bound is 1/C attempts.
registerWowCheck({
  id: 'cw07.prd',
  run: () => {
    const c10 = prdC(0.1);
    const vectors = Math.abs(c10 - 0.01475) < 1e-4 && Math.abs(prdRate(c10) - 0.1) < 1e-4;
    const prd = new Prd();
    const rng = lcg(0x9e3779b9);
    let procs = 0, streak = 0, longest = 0;
    for (let i = 0; i < 5000; i++) {
      if (prd.roll('cw07.sample', 0.1, rng)) { procs++; longest = Math.max(longest, streak); streak = 0; }
      else streak++;
    }
    longest = Math.max(longest, streak);
    const rate = procs / 5000;
    const bound = Math.ceil(1 / c10);
    const ok = vectors && rate >= 0.095 && rate <= 0.105 && longest <= bound;
    return ok
      ? { ok: true, msg: `10 % → ${(rate * 100).toFixed(2)} % (5000 emit), en uzun kuru seri ${longest} (sınır ${bound})` }
      : { ok: false, msg: `PRD uyuşmuyor: vektör=${vectors}, oran=${(rate * 100).toFixed(2)} %, seri=${longest}, sınır=${bound}` };
  },
});

// School lockout (§2.6): a school tag locks, melee has no school.
registerWowCheck({
  id: 'cw07.lockout.school',
  run: () => {
    const arcane = lockoutSchool({ tags: ['spell', 'arcane'] });
    const melee = lockoutSchool({ tags: ['melee', 'bleed'] });
    const none = lockoutSchool({ tags: ['spell'] });
    return arcane === 'arcane' && melee === null && none === null
      ? { ok: true, msg: 'arcane kilitlenir; melee ve okulsuz büyü kilitlenmez' }
      : { ok: false, msg: `lockoutSchool: arcane=${arcane} melee=${melee} none=${none}` };
  },
});

// Proc table (§2.7 + Appendix B): every proc row has a status, a name and at least one glow id; the watcher reads them all.
registerWowCheck({
  id: 'cw07.procs.table',
  run: () => {
    const bad = PROC_DEFS.filter((d) => !d.status || !d.name || d.glow.length === 0 || !d.school).map((d) => d.id);
    return bad.length === 0
      ? { ok: true, msg: `${PROC_DEFS.length} proc satırı tam` }
      : { ok: false, msg: `eksik proc satırı: ${bad.join(', ')}` };
  },
});

// Icons (§4.3 item 6): the buff icon follows the stat it changes.
registerWowCheck({
  id: 'cw07.icons',
  run: () => {
    const crit = iconForStats({ critChance: 0.1 });
    const haste = iconForStats({ attackSpeed: 0.1 });
    const def = iconForStats({ damageReductionPct: 0.1 });
    const blessing = iconForStats({});
    const ok = crit.endsWith('buff-crit.svg') && haste.endsWith('buff-haste.svg') && def.endsWith('buff-defense.svg') && blessing.endsWith('buff-blessing.svg');
    return ok
      ? { ok: true, msg: 'crit / haste / defense / blessing ikonları doğru' }
      : { ok: false, msg: `ikon eşlemesi: ${crit}, ${haste}, ${def}, ${blessing}` };
  },
});

// Off-GCD tags (§2.1): the listed interrupts, taunts, mitigation and movement are off-GCD; a plain melee skill is not.
registerWowCheck({
  id: 'cw07.offgcd.tags',
  run: () => {
    const ids = ['knight_charge', 'barbarian_leap', 'mage_blink', 'rogue_shadow_step', 'knight_provoke', 'barbarian_provoke',
      'knight_challenge', 'knight_shield_block', 'barbarian_iron_stance', 'knight_shield_wall', 'rogue_garrote',
      'mage_counterspell', 'barbarian_pummel', 'rogue_kick', 'mage_phoenix_flames'];
    const missing = ids.filter((id) => !SKILLS[id] || !isOffGcd(SKILLS[id]));
    const plain = SKILLS['knight_shield_bash'];
    const plainOk = !!plain && !isOffGcd(plain);
    return missing.length === 0 && plainOk
      ? { ok: true, msg: `${ids.length} beceri off-GCD; knight_shield_bash on-GCD` }
      : { ok: false, msg: `off-GCD eksik: ${missing.join(', ') || '-'}; shield_bash on-GCD=${plainOk}` };
  },
});

// ---- live ---------------------------------------------------------------------------------------------------------

// Pushback (§2.4): two 10 % hits push a hard cast by +0.5 s each, the third adds nothing.
registerWowCheck({
  id: 'cw07.pushback',
  run: async (): Promise<WowCheckResult> => {
    const dev = devApi();
    const p = G.world?.localPlayer;
    if (!dev || !p) return noPlayer();
    const slot = slotWhere((d) => d.castTime > 0 && d.targeting !== 'dash' && d.targeting !== 'leap' && d.targeting !== 'teleport');
    if (!slot) return { ok: false, msg: 'çubukta hard cast becerisi yok' };
    dev.cast(slot);
    const cast = p.cast;
    if (!cast || cast.duration <= 0) return { ok: false, msg: `${slot} hard cast başlatmadı` };
    const d0 = cast.duration;
    G.skills.onPlayerDamaged(p, p.maxHp * 0.1);
    const d1 = p.cast?.duration ?? 0;
    G.skills.onPlayerDamaged(p, p.maxHp * 0.1);
    const d2 = p.cast?.duration ?? 0;
    G.skills.onPlayerDamaged(p, p.maxHp * 0.1);
    const d3 = p.cast?.duration ?? 0;
    const ok = Math.abs(d1 - d0 - 0.5) < 1e-6 && Math.abs(d2 - d1 - 0.5) < 1e-6 && Math.abs(d3 - d2) < 1e-6;
    return ok
      ? { ok: true, msg: `${slot}: süre ${d0.toFixed(2)} → ${d1.toFixed(2)} → ${d2.toFixed(2)} → ${d3.toFixed(2)} (+0.5, +0.5, +0)` }
      : { ok: false, msg: `pushback süreleri: ${d0.toFixed(2)} ${d1.toFixed(2)} ${d2.toFixed(2)} ${d3.toFixed(2)}` };
  },
});

// Watcher (§4.3 item 2): a proc status gained, then removed early, gives proc:gain followed by proc:fade {consumed: true}.
registerWowCheck({
  id: 'cw07.watcher',
  run: async (): Promise<WowCheckResult> => {
    const dev = devApi();
    const p = G.world?.localPlayer;
    if (!dev || !p) return noPlayer();
    const seen: string[] = [];
    const fade = { consumed: null as boolean | null };
    const offGain = G.events.on('proc:gain', (e) => { if (e.status === 'hot_streak') seen.push('gain'); });
    const offFade = G.events.on('proc:fade', (e) => { if (e.id === 'hot_streak') { seen.push('fade'); fade.consumed = e.consumed; } });
    try {
      p.statuses.apply('hot_streak', 8);
      await dev.wait(0.1);
      p.statuses.remove('hot_streak');
      await dev.wait(0.1);
    } finally {
      offGain();
      offFade();
    }
    const ok = seen.join(',') === 'gain,fade' && fade.consumed === true;
    return ok
      ? { ok: true, msg: 'hot_streak: proc:gain, sonra proc:fade (tüketildi)' }
      : { ok: false, msg: `olaylar: ${seen.join(',') || 'yok'}; tüketildi=${String(fade.consumed)}` };
  },
});

// Lockout (§2.6): an enemy interrupt cuts an arcane cast; the arcane skill then fails with 'lockout', a melee skill does not.
registerWowCheck({
  id: 'cw07.lockout',
  run: async (): Promise<WowCheckResult> => {
    const dev = devApi();
    const p = G.world?.localPlayer;
    if (!dev || !p) return noPlayer();
    const arcaneSlot = slotWhere((d) => d.castTime > 0 && lockoutSchool(d) === 'arcane');
    const meleeSlot = slotWhere((d) => d.tags.includes('melee') && lockoutSchool(d) === null && d.castTime === 0);
    if (!arcaneSlot || !meleeSlot) return { ok: false, msg: 'çubukta arcane hard cast ve melee beceri gerekli' };
    const reasons: string[] = [];
    const off = G.events.on('skill:fail', (e) => { reasons.push(e.reason); });
    try {
      dev.cast(arcaneSlot);
      if (!p.cast) return { ok: false, msg: `${arcaneSlot} cast başlatmadı` };
      G.skills.interrupt(p, false, 'enemyInterrupt');
      reasons.length = 0;
      dev.cast(arcaneSlot);
      const arcaneFail = reasons.includes('lockout');
      reasons.length = 0;
      dev.cast(meleeSlot);
      const meleeFail = reasons.includes('lockout');
      const ok = arcaneFail && !meleeFail;
      return ok
        ? { ok: true, msg: `${arcaneSlot} kilitlendi ('lockout'), ${meleeSlot} serbest` }
        : { ok: false, msg: `arcane lockout=${arcaneFail}, melee lockout=${meleeFail}` };
    } finally {
      off();
    }
  },
});

