import type { CharacterSave, CharacterSummary } from '../types/character';
import type { SkillSlotKey } from '../types/skills';
import type { SpecId } from '../types/v2';
import { SKILLS } from '../data/skills';
import { getSpec } from '../data/specs';
import { migrationToast } from '../dev/migrate';

const INDEX_KEY = 'efsun.characters.v1';
const CHAR_KEY = (id: string) => `efsun.char.${id}`;
export const MAX_CHARACTERS = 6;
/** v2 = GDD_V2 optional fields; see normaliseCharacterSave(). */
export const SAVE_VERSION = 2;

/**
 * Brings a parsed save up to SAVE_VERSION: fills defaults for every GDD_V2 optional field (CharacterSave §A) so systems
 * can read them without checks. Old (v1) saves load unchanged apart from these defaults. Idempotent.
 * Returns null for non-object payloads. Spec / title / raid stay undefined until chosen.
 */
export function normaliseCharacterSave(raw: unknown): CharacterSave | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as CharacterSave;
  if ((c.version ?? 1) < SAVE_VERSION) c.version = SAVE_VERSION;
  c.flags ??= {};
  c.specBars ??= {};
  c.skillRunes ??= {};
  c.flasks ??= [null, null, null, null, null]; // Şişe Kemeri: 5 slots (flask1..flask5)
  c.flaskCharges ??= [0, 0, 0, 0, 0];
  c.codex ??= {};
  c.bestiary ??= {};
  c.paragon ??= { ks: 0, xp: 0, points: 0, boards: [], cells: [], glyphs: [] };
  c.routes ??= {};
  c.raid ??= { week: 0, killed: { normal: [], heroic: [], mythic: [] } };
  c.titles ??= [];
  c.cosmetics ??= {};
  c.majorCd ??= { m45: 0, m90: 0, m180: 0 };
  // GDD_ITEMS_V2 §2.3 / §2.10 (IT-00): Talih Birikimi + Basma Günlüğü, per character. camp / home stay undefined until used.
  c.upg ??= { stacks: 0, fails: 0, wins: 0, destroyStreak: 0, best: 0, log: [] };
  // GDD_LIFE §1.3 (L-00): professions start empty; the skill is read as 0 when a profession is missing.
  c.professions ??= {};
  if (c.mythic && !c.mythic.seasons) c.mythic.seasons = {};
  migrateTalents(c);
  return c;
}

/**
 * GDD_TALENTS Appendix C (T0): one-time migration of the talent fields, run from normaliseCharacterSave. Pure (no G).
 * Runs once per save (flags['tb.migrated']). Fills tb / skillMastery / passiveExtra defaults.
 * Old `mage_elementalist` splits into `mage_fire` or `mage_frost` (more allocated frost-family web nodes -> frost); old
 * `mage_lightbringer` becomes `mage_arcane`. Both grant one free full web reset (flags['tb.freeWebReset'], consumed by the
 * N window / trainer). Bars move with the spec (remapBars). Old spec ids stay in the SpecId union (append-only).
 */
export function migrateTalents(save: CharacterSave): void {
  save.flags ??= {};
  if (save.flags['tb.migrated']) return;
  save.flags['tb.migrated'] = 1;
  save.tb ??= { v: 1, active: {}, saved: {}, removals: 0 };
  save.skillMastery ??= {};
  save.passiveExtra ??= { picks: {}, jewels: {} };
  const old = save.spec as string | undefined;
  if (old === 'mage_elementalist') {
    const talents = save.talents ?? [];
    const has = (re: RegExp) => talents.filter((id) => re.test(id)).length;
    const fire = has(/^(n_pyromancer|mg_a\d|ks_glass_cannon)$/);
    const frost = has(/^(n_cryomancer|mg_b\d|n_spell_echo)$/);
    const next: SpecId = frost > fire ? 'mage_frost' : 'mage_fire';
    save.spec = next;
    remapBars(save, old, next, next === 'mage_fire'
      ? { m45: 'mage_blazing_barrier', m90: 'mage_combustion' }
      : { m45: 'mage_icy_veins', m90: 'mage_frozen_orb' });
    save.flags['tb.freeWebReset'] = 1;
  } else if (old === 'mage_lightbringer') {
    save.spec = 'mage_arcane';
    remapBars(save, old, 'mage_arcane', { m45: 'mage_touch_of_magi', m90: 'mage_arcane_surge' });
    save.flags['tb.freeWebReset'] = 1;
  }
}

/**
 * GDD_TALENTS §1.8: a load that migrated the spec queues the migration toast. The old spec id waits in
 * flags['tb.migToast'] until CharacterState shows the toast once (it clears the flag and writes the save).
 */
function queueMigrationToast(save: CharacterSave, storedSpec: string | undefined): void {
  if (storedSpec && migrationToast({ spec: storedSpec }, save)) save.flags['tb.migToast'] = storedSpec;
}

/**
 * Appendix C remapBars: copies specBars[from] to specBars[to], replaces m45 / m90 with the given skills and deletes
 * specBars[from]. A slot is dropped only when its skill is neither registered (SKILLS) nor listed by the new spec. While the
 * new spec is not registered (stub), nothing is dropped.
 */
function remapBars(save: CharacterSave, from: string, to: SpecId, majors: Partial<Record<'m45' | 'm90', string>>): void {
  const bars = (save.specBars ??= {});
  const src = bars[from as SpecId] ?? {};
  const spec = getSpec(to);
  const listed = spec
    ? new Set<string>([...spec.skills, ...Object.keys(spec.treeSkills ?? {}), ...Object.values(spec.defaultBar).filter((v): v is string => !!v)])
    : null;
  const out: Partial<Record<SkillSlotKey, string>> = {};
  for (const [slot, skill] of Object.entries(src) as [SkillSlotKey, string | undefined][]) {
    if (!skill) continue;
    if (!listed || SKILLS[skill] || listed.has(skill)) out[slot] = skill;
  }
  if (majors.m45) out.m45 = majors.m45;
  if (majors.m90) out.m90 = majors.m90;
  bars[to] = out;
  delete bars[from as SpecId];
}

/** Character slots in localStorage. Pure persistence — no game logic. */
export class Save {
  listIds(): string[] {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    } catch {
      return [];
    }
  }

  list(): CharacterSave[] {
    return this.listIds()
      .map((id) => this.load(id))
      .filter((c): c is CharacterSave => !!c)
      .sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  load(id: string): CharacterSave | null {
    try {
      const raw = localStorage.getItem(CHAR_KEY(id));
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      // the spec as stored: normaliseCharacterSave runs the talent migration, which may change it (GDD_TALENTS §1.8)
      const storedSpec = parsed && typeof parsed === 'object' ? (parsed as { spec?: unknown }).spec : undefined;
      const save = normaliseCharacterSave(parsed);
      if (save) queueMigrationToast(save, typeof storedSpec === 'string' ? storedSpec : undefined);
      return save;
    } catch (e) {
      console.error('[save] corrupt character', id, e);
      return null;
    }
  }

  write(save: CharacterSave): boolean {
    try {
      save.lastPlayed = Date.now();
      localStorage.setItem(CHAR_KEY(save.id), JSON.stringify(save));
      const ids = this.listIds();
      if (!ids.includes(save.id)) {
        ids.push(save.id);
        localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
      }
      return true;
    } catch (e) {
      console.error('[save] write failed', e);
      return false;
    }
  }

  delete(id: string): void {
    localStorage.removeItem(CHAR_KEY(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.listIds().filter((x) => x !== id)));
  }

  summaries(): CharacterSummary[] {
    return this.list().map((c) => ({
      id: c.id, name: c.name, classId: c.classId, level: c.level, itemLevel: 0, rating: c.mythic?.rating ?? 0, variant: c.appearance?.variant ?? 0,
    }));
  }
}
