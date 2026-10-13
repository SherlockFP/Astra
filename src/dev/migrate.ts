/**
 * GDD_TALENTS T20: migration fixtures and headless checks for the talent save migration (Appendix C, §1.8).
 * OWNER: core (with the items QA). Pure: imports types, `migrateTalents` (core/Save.ts) and the live 306-node web
 * (data/talents.ts). No G, no DOM, no Vite, so tools/talents-check.mjs stage `migrate` runs `checkMigrations()` headless.
 *
 * Fixtures are V2-era saves with a 70-entry web (the class start included):
 *   elementalist_fire_web · elementalist_frost_web · elementalist_tie_web · elementalist_hybrid_web
 *   elementalist_no_family_web · elementalist_bars_missing · lightbringer_healer_web
 *   old_class_no_spec (4-class era, no spec) · rogue_assassin_tb (other spec, existing tb kept) · already_migrated (frozen)
 *
 * `migrationToast()` says which §1.8 toast a migration shows. Nothing calls it at runtime yet (the check warns about that).
 */
import type { CharacterSave } from '../types/character';
import type { ClassId } from '../types/common';
import type { SkillSlotKey } from '../types/skills';
import { migrateTalents } from '../core/Save';
import { CLASS_START_NODE, TALENT_NODES } from '../data/talents';

/** §1.8 toast texts (player-facing Turkish). */
export const MIGRATION_TOAST = {
  elementalist: "Elementalist ikiye ayrıldı: Ateş / Buz. Uzmanlığını N'den değiştirebilirsin.",
  lightbringer: 'Işık Çağıran kaldırıldı. Şifacılık için Paladin (Kutsal), Haydut (Simyacı) veya Keşiş (Sis Dokuyan) seçebilirsin.',
} as const;

/** §1.8 family members of the old Elementalist web: the regex of Save.ts migrateTalents, written out as lists. */
export const FIRE_FAMILY: readonly string[] = ['n_pyromancer', 'ks_glass_cannon', 'mg_a1', 'mg_a2', 'mg_a3', 'mg_a4'];
export const FROST_FAMILY: readonly string[] = ['n_cryomancer', 'n_spell_echo', 'mg_b1', 'mg_b2', 'mg_b3', 'mg_b4'];

/** Web size of every fixture (allocated entries, class start included). */
const WEB_POINTS = 70;

export type MigrationKind = 'elementalist' | 'lightbringer' | 'other';

export interface MigrationExpect {
  /** Spec after the migration (undefined = none). */
  spec: string | undefined;
  /** flags['tb.freeWebReset'] === 1 after the migration. */
  freeWebReset: boolean;
  /** Toast the runtime should show, or null. */
  toast: string | null;
  /** specBars[spec] after the migration, exact. Required for elementalist / lightbringer fixtures. */
  bars?: Partial<Record<SkillSlotKey, string>>;
  /** Nothing at all may change (the save was migrated before). */
  frozen?: boolean;
}

export interface MigrationFixture {
  id: string;
  about: string;
  kind: MigrationKind;
  /** The save before migrateTalents runs. Fresh on every migrationFixtures() call. */
  save: CharacterSave;
  expect: MigrationExpect;
}

export interface MigrationIssue {
  level: 'error' | 'warn';
  where: string;
  msg: string;
}

export interface MigrationReport {
  issues: MigrationIssue[];
  info: string[];
  fixtures: number;
}

/**
 * Deterministic web: BFS from `start` over the live links, collecting `size` nodes. Nodes in `skip` are neither
 * collected nor crossed, so a family can be left out of a fixture.
 */
export function webOf(start: string, size: number, skip: ReadonlySet<string> = new Set<string>()): string[] {
  const out: string[] = [];
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  let head = 0;
  while (head < queue.length && out.length < size) {
    const id = queue[head++];
    out.push(id);
    for (const link of TALENT_NODES[id]?.links ?? []) {
      if (seen.has(link) || skip.has(link)) continue;
      seen.add(link);
      queue.push(link);
    }
  }
  return out;
}

/** The toast a migration shows (§1.8), or null. Call with the spec read from the RAW save (before normalise) and the save after it. */
export function migrationToast(before: { spec?: string }, after: CharacterSave): string | null {
  if (after.spec === before.spec) return null;
  if (before.spec === 'mage_elementalist') return MIGRATION_TOAST.elementalist;
  if (before.spec === 'mage_lightbringer') return MIGRATION_TOAST.lightbringer;
  return null;
}

/** Fixture save: the fields the migration reads or writes are real, the rest is a stub (mythic, equipment, bag...). */
function saveOf(id: string, classId: ClassId, talents: string[], extra: Partial<CharacterSave> = {}): CharacterSave {
  const base = {
    version: 2, id, name: `Test ${id}`, classId, appearance: { variant: 0 }, level: 30, xp: 0, gold: 5000,
    createdAt: 1760300000000, lastPlayed: 1760300000000, playedSec: 3600,
    equipment: {}, bag: [], stash: [], materials: {}, talents: [...talents], talentRefunds: 0,
    skillBar: {}, skillRanks: {}, flags: {},
    stats: { kills: 0, deaths: 0, bossKills: 0, dungeonsCompleted: 0, highestKey: 0, legendaryFound: 0 },
  };
  return { ...base, ...extra } as unknown as CharacterSave;
}

// Old Elementalist bars (V2 era). s3 holds a skill id that no longer exists, so the migration must drop it.
const ELEM_BEFORE: Partial<Record<SkillSlotKey, string>> = {
  lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_frost_nova', e: 'mage_blink', s1: 'mage_meteor', s2: 'mage_mana_barrier',
  s3: 'mage_removed_skill', r: 'mage_arcane_cataclysm', m45: 'mage_icy_veins', m90: 'mage_frozen_orb', m180: 'mage_time_warp',
};
const FIRE_BARS: Partial<Record<SkillSlotKey, string>> = {
  lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_frost_nova', e: 'mage_blink', s1: 'mage_meteor', s2: 'mage_mana_barrier',
  r: 'mage_arcane_cataclysm', m45: 'mage_blazing_barrier', m90: 'mage_combustion', m180: 'mage_time_warp',
};
const FROST_BARS: Partial<Record<SkillSlotKey, string>> = { ...FIRE_BARS, m45: 'mage_icy_veins', m90: 'mage_frozen_orb' };
// Healer bars (lightbringer): q and m45/m90 are healing skills; s3 is removed. m45/m90 are replaced by the arcane majors.
const LIGHT_BEFORE: Partial<Record<SkillSlotKey, string>> = {
  lmb: 'mage_basic', rmb: 'mage_fireball', q: 'mage_healing_light', e: 'mage_blink', s1: 'mage_meteor', s2: 'mage_mana_barrier',
  s3: 'mage_removed_skill', r: 'mage_arcane_cataclysm', m45: 'mage_healing_ward', m90: 'mage_healing_rain', m180: 'mage_time_warp',
};
const ARCANE_BARS: Partial<Record<SkillSlotKey, string>> = {
  lmb: 'mage_basic', rmb: 'mage_fireball', e: 'mage_blink', s1: 'mage_meteor', s2: 'mage_mana_barrier',
  r: 'mage_arcane_cataclysm', m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge', m180: 'mage_time_warp',
};

/** Hand-picked mixed web: 4 fire-family and 5 frost-family nodes, the other 61 entries from the non-family region. */
function hybridWeb(start: string): string[] {
  const fire = ['n_pyromancer', 'mg_a1', 'mg_a2', 'ks_glass_cannon'];
  const frost = ['mg_b1', 'mg_b2', 'mg_b3', 'mg_b4', 'n_cryomancer'];
  const families = new Set([...FIRE_FAMILY, ...FROST_FAMILY]);
  return [...fire, ...frost, ...webOf(start, WEB_POINTS - fire.length - frost.length, families)];
}

function elementalist(id: string, about: string, talents: string[], expectSpec: string, bars: Partial<Record<SkillSlotKey, string>>, specBars: boolean = true): MigrationFixture {
  return {
    id, about, kind: 'elementalist',
    save: saveOf(id, 'mage', talents, {
      spec: 'mage_elementalist' as CharacterSave['spec'],
      ...(specBars ? { specBars: { mage_elementalist: { ...ELEM_BEFORE } } } : {}),
    }),
    expect: { spec: expectSpec, freeWebReset: true, toast: MIGRATION_TOAST.elementalist, bars },
  };
}

/** Fresh fixtures on every call (the check mutates them). */
export function migrationFixtures(): MigrationFixture[] {
  const MAGE = CLASS_START_NODE.mage;
  const ROGUE = CLASS_START_NODE.rogue;
  const families = new Set([...FIRE_FAMILY, ...FROST_FAMILY]);
  return [
    elementalist('elementalist_fire_web', 'Ateş ağırlıklı: 6 ateş, 0 buz düğümü', webOf(MAGE, WEB_POINTS, new Set(FROST_FAMILY)), 'mage_fire', FIRE_BARS),
    elementalist('elementalist_frost_web', 'Buz ağırlıklı: 0 ateş, 6 buz düğümü', webOf(MAGE, WEB_POINTS, new Set(FIRE_FAMILY)), 'mage_frost', FROST_BARS),
    elementalist('elementalist_tie_web', 'Doğal 70 puanlık web: 6 ateş, 6 buz, beraberlikte Ateş', webOf(MAGE, WEB_POINTS), 'mage_fire', FIRE_BARS),
    elementalist('elementalist_hybrid_web', 'Karışık: 4 ateş, 5 buz, az farkla Buz', hybridWeb(MAGE), 'mage_frost', FROST_BARS),
    elementalist('elementalist_no_family_web', 'Elemental düğüm yok: varsayılan Ateş', webOf(MAGE, WEB_POINTS, families), 'mage_fire', FIRE_BARS),
    elementalist('elementalist_bars_missing', 'Buz web, specBars hiç yok: yalnızca majorlar yazılır', webOf(MAGE, WEB_POINTS, new Set(FIRE_FAMILY)), 'mage_frost', { m45: 'mage_icy_veins', m90: 'mage_frozen_orb' }, false),
    {
      id: 'lightbringer_healer_web', kind: 'lightbringer',
      about: 'Işık Çağıran: şifa barı kopar, majorlar Gizem Ustası\'na geçer, skillRunes kalır',
      save: saveOf('lightbringer_healer_web', 'mage', webOf(MAGE, WEB_POINTS), {
        spec: 'mage_lightbringer' as CharacterSave['spec'],
        specBars: { mage_lightbringer: { ...LIGHT_BEFORE } } as CharacterSave['specBars'],
        skillRunes: { mage_healing_light: ['rune_heal_1', null] },
      }),
      expect: { spec: 'mage_arcane', freeWebReset: true, toast: MIGRATION_TOAST.lightbringer, bars: ARCANE_BARS },
    },
    {
      id: 'old_class_no_spec', kind: 'other',
      about: 'Dört sınıf dönemi kaydı: spec yok, 70 puanlık web. Yalnızca tb / ustalık / pasif alanları eklenir',
      save: saveOf('old_class_no_spec', 'rogue', webOf(ROGUE, WEB_POINTS)),
      expect: { spec: undefined, freeWebReset: false, toast: null },
    },
    {
      id: 'rogue_assassin_tb', kind: 'other',
      about: 'Başka bir V2 uzmanlığı: bars ve mevcut tb olduğu gibi kalır',
      save: saveOf('rogue_assassin_tb', 'rogue', webOf(ROGUE, WEB_POINTS), {
        spec: 'rogue_assassin',
        specBars: { rogue_assassin: { lmb: 'rogue_basic', q: 'rogue_smoke_bomb' } } as CharacterSave['specBars'],
        tb: { v: 1, active: {}, saved: {}, removals: 3 },
      }),
      expect: { spec: 'rogue_assassin', freeWebReset: false, toast: null },
    },
    {
      id: 'already_migrated', kind: 'other',
      about: 'tb.migrated zaten 1: eski uzmanlık kimliği bile olsa hiçbir şey değişmez',
      save: saveOf('already_migrated', 'mage', webOf(MAGE, WEB_POINTS), {
        spec: 'mage_elementalist' as CharacterSave['spec'],
        specBars: { mage_elementalist: { ...ELEM_BEFORE } } as CharacterSave['specBars'],
        flags: { 'tb.migrated': 1 },
      }),
      expect: { spec: 'mage_elementalist', freeWebReset: false, toast: null, frozen: true },
    },
  ];
}

/** Stable JSON (sorted keys) so two saves compare equal regardless of key order. */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x: unknown) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
    return Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}
const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

const ALLOWED_TOP = new Set(['spec', 'specBars', 'flags', 'tb', 'skillMastery', 'passiveExtra']);
const NEW_FLAGS = new Set(['tb.migrated', 'tb.freeWebReset']);

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}

/** Runs every fixture through migrateTalents and checks the result against the §1.8 / Appendix C rules. */
export function checkMigrations(): MigrationReport {
  const issues: MigrationIssue[] = [];
  const info: string[] = [];
  const err = (where: string, msg: string): void => {
    issues.push({ level: 'error', where, msg });
  };

  // family lists: every listed id is a web node, and the §1.8 regex matches exactly the listed ids
  const webIds = Object.keys(TALENT_NODES);
  for (const id of [...FIRE_FAMILY, ...FROST_FAMILY]) if (!TALENT_NODES[id]) err('families', `${id} is not a web node`);
  if (!sameSet(webIds.filter((id) => /^(n_pyromancer|mg_a\d|ks_glass_cannon)$/.test(id)), FIRE_FAMILY)) err('families', 'fire family differs from the §1.8 regex');
  if (!sameSet(webIds.filter((id) => /^(n_cryomancer|mg_b\d|n_spell_echo)$/.test(id)), FROST_FAMILY)) err('families', 'frost family differs from the §1.8 regex');

  // toast texts: the §1.8 wording, verbatim
  if (MIGRATION_TOAST.elementalist !== "Elementalist ikiye ayrıldı: Ateş / Buz. Uzmanlığını N'den değiştirebilirsin.") err('toast', 'elementalist text differs from §1.8');
  if (MIGRATION_TOAST.lightbringer !== 'Işık Çağıran kaldırıldı. Şifacılık için Paladin (Kutsal), Haydut (Simyacı) veya Keşiş (Sis Dokuyan) seçebilirsin.') err('toast', 'lightbringer text differs from §1.8');

  const fixtures = migrationFixtures();
  for (const f of fixtures) {
    const where = `fixture:${f.id}`;
    const s = f.save;
    const before = structuredClone(s);
    const web = s.talents;
    if (new Set(web).size !== web.length) err(where, 'duplicate web ids');
    if (web.length !== WEB_POINTS) err(where, `web has ${web.length} entries, expected ${WEB_POINTS}`);
    for (const id of web) if (!TALENT_NODES[id]) err(where, `web id ${id} is not a node`);

    const fire = web.filter((id) => FIRE_FAMILY.includes(id)).length;
    const frost = web.filter((id) => FROST_FAMILY.includes(id)).length;
    if (f.kind === 'elementalist') {
      if (before.spec !== 'mage_elementalist') err(where, 'fixture is not an old Elementalist save');
      const oracle = frost > fire ? 'mage_frost' : 'mage_fire';
      if (oracle !== f.expect.spec) err(where, `fixture expects ${f.expect.spec}, the §1.8 rule on ${fire} fire / ${frost} frost gives ${oracle}`);
    }
    if (f.kind === 'lightbringer' && before.spec !== 'mage_lightbringer') err(where, 'fixture is not a Lightbringer save');

    migrateTalents(s);
    const e = f.expect;

    if (s.spec !== e.spec) err(where, `spec ${s.spec ?? '-'}, expected ${e.spec ?? '-'}`);
    if ((s.flags['tb.freeWebReset'] === 1) !== e.freeWebReset) err(where, `tb.freeWebReset should be ${e.freeWebReset}`);
    if (s.flags['tb.migrated'] !== 1) err(where, 'tb.migrated is not set');
    const toast = migrationToast(before, s);
    if (toast !== e.toast) err(where, `toast ${toast ?? 'none'}, expected ${e.toast ?? 'none'}`);

    if (e.frozen) {
      if (!same(before, s)) err(where, 'an already migrated save changed');
    } else {
      // only the migration's own fields may change (spec, specBars, the two flags, tb / skillMastery / passiveExtra)
      const keys = new Set([...Object.keys(before), ...Object.keys(s)]);
      for (const k of keys) {
        if (ALLOWED_TOP.has(k)) continue;
        if (!same((before as unknown as Record<string, unknown>)[k], (s as unknown as Record<string, unknown>)[k])) err(where, `${k} changed by the migration`);
      }
      for (const k of new Set([...Object.keys(before.flags), ...Object.keys(s.flags)])) {
        if (NEW_FLAGS.has(k)) continue;
        if (!same(before.flags[k], s.flags[k])) err(where, `flag ${k} changed`);
      }
      // defaults: created when absent, never overwritten when present
      if (!before.tb) {
        if (!s.tb || s.tb.v !== 1 || s.tb.removals !== 0) err(where, 'tb default missing or wrong');
      } else if (!same(before.tb, s.tb)) err(where, 'existing tb was overwritten');
      if (!before.skillMastery && !same(s.skillMastery, {})) err(where, 'skillMastery default missing');
      if (!before.passiveExtra && !same(s.passiveExtra, { picks: {}, jewels: {} })) err(where, 'passiveExtra default missing');
      // bars: the new spec gets exactly the expected map; the old spec's bars are gone; other specs are not touched
      if (f.kind === 'other') {
        if (!same(s.specBars, before.specBars)) err(where, 'specBars changed for a save that is not an old mage');
      } else {
        if (!e.bars) err(where, 'fixture has no bars expectation');
        else if (!same(s.specBars?.[s.spec as keyof NonNullable<CharacterSave['specBars']>], e.bars)) {
          err(where, `bars of ${s.spec} are ${stable(s.specBars?.[s.spec as keyof NonNullable<CharacterSave['specBars']>])}, expected ${stable(e.bars)}`);
        }
        const oldSpec = before.spec as keyof NonNullable<CharacterSave['specBars']>;
        if (s.specBars && oldSpec in s.specBars) err(where, `specBars.${oldSpec} was not deleted`);
      }
    }

    // a second run changes nothing (the flag gates it)
    const again = structuredClone(s);
    migrateTalents(again);
    if (!same(again, s)) err(where, 'a second migrateTalents run changes the save');

    const slots = Object.keys(s.specBars?.[(s.spec ?? '') as keyof NonNullable<CharacterSave['specBars']>] ?? {}).length;
    info.push(`${f.id}: ${before.spec ?? '-'} -> ${s.spec ?? '-'} | fire ${fire} frost ${frost} | bars ${slots} | freeReset ${s.flags['tb.freeWebReset'] === 1 ? 'yes' : 'no'} | toast ${toast ? 'yes' : 'no'}`);
  }

  return { issues, info, fixtures: fixtures.length };
}
