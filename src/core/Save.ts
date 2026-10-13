import type { CharacterSave, CharacterSummary } from '../types/character';
import type { SkillSlotKey } from '../types/skills';
import type { SpecId } from '../types/v2';
import { SKILLS } from '../data/skills';
import { getSpec } from '../data/specs';
import { migrationToast } from '../dev/migrate';
import { CLASSES } from '../data/classes';
import type { ClassId } from '../types/common';
import {
  EXPORT_FORMAT, MSG_BAD_FILE, MSG_NEWER_FILE, backupDue, backupKey, clearBackups, newCharacterId, notifyFull, notifyLost, notifyRestored,
  notifyWriteFailed, requestPersistentStorage, rollBackup, type ImportResult,
} from './SaveSafety';

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

/**
 * Character slots in localStorage. Pure persistence — no game logic. Safety net (SaveSafety.ts): rolling `.bak1` / `.bak2`
 * copies, recovery from a backup when the JSON is corrupt, one retry + toast on write failure, JSON export / import.
 */
export class Save {
  constructor() {
    requestPersistentStorage();
  }

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

  /** Missing, corrupt or unnormalisable JSON falls back to .bak1, then .bak2 (see recover). */
  load(id: string): CharacterSave | null {
    try {
      const raw = localStorage.getItem(CHAR_KEY(id));
      if (!raw) return this.recover(id, false);
      const save = this.decode(raw);
      if (save) return save;
      console.error('[save] corrupt character', id);
    } catch (e) {
      console.error('[save] corrupt character', id, e);
    }
    return this.recover(id, true);
  }

  /**
   * Parses one stored JSON string and normalises it (queues the talent migration toast). Null for non-object payloads;
   * throws on invalid JSON.
   */
  private decode(raw: string): CharacterSave | null {
    const parsed: unknown = JSON.parse(raw);
    // the spec as stored: normaliseCharacterSave runs the talent migration, which may change it (GDD_TALENTS §1.8)
    const storedSpec = parsed && typeof parsed === 'object' ? (parsed as { spec?: unknown }).spec : undefined;
    const save = normaliseCharacterSave(parsed);
    if (save) queueMigrationToast(save, typeof storedSpec === 'string' ? storedSpec : undefined);
    return save;
  }

  /**
   * Restores a character from `.bak1`, then `.bak2`. A usable backup is written back to the character key, so the
   * character stays in the list. `corrupt` = the main JSON was unreadable (the player is told); a missing key restores silently
   * unless no backup exists either.
   */
  private recover(id: string, corrupt: boolean): CharacterSave | null {
    const key = CHAR_KEY(id);
    for (const n of [1, 2] as const) {
      try {
        const raw = localStorage.getItem(backupKey(key, n));
        const save = raw ? this.decode(raw) : null;
        if (!save) continue;
        save.id = id;
        this.setRaw(key, JSON.stringify(save));
        console.warn('[save] restored', id, 'from bak' + n);
        notifyRestored();
        return save;
      } catch (e) {
        console.warn('[save] bak' + n + ' unusable', id, e);
      }
    }
    if (corrupt) {
      console.error('[save] no usable backup', id);
      notifyLost();
    }
    return null;
  }

  /** localStorage.setItem that never throws. Returns false on failure (logged). */
  private setRaw(key: string, json: string): boolean {
    try {
      localStorage.setItem(key, json);
      return true;
    } catch (e) {
      console.warn('[save] write failed', key, e);
      return false;
    }
  }

  /** Copies the stored JSON to `.bak1` when backupDue() says so. Failures never block the write. */
  private backupBefore(save: CharacterSave, key: string): void {
    try {
      const stored = localStorage.getItem(key);
      if (stored && backupDue(save.id, stored, save)) rollBackup(save.id, key, stored);
    } catch (e) {
      console.warn('[save] backup skipped', save.id, e);
    }
  }

  private idTaken(id: string): boolean {
    return this.listIds().includes(id) || localStorage.getItem(CHAR_KEY(id)) !== null;
  }

  /**
   * Writes one character (sets lastPlayed). Retries once on failure, then toasts. False = not saved. A new id past
   * MAX_CHARACTERS is refused here too, so a menu with stale stands cannot store a 7th character.
   */
  write(save: CharacterSave): boolean {
    const taken = this.listIds();
    if (!taken.includes(save.id) && taken.length >= MAX_CHARACTERS) {
      notifyFull(MAX_CHARACTERS);
      return false;
    }
    save.lastPlayed = Date.now();
    const key = CHAR_KEY(save.id);
    let json: string;
    try {
      json = JSON.stringify(save);
    } catch (e) {
      console.warn('[save] serialise failed', save.id, e);
      notifyWriteFailed();
      return false;
    }
    this.backupBefore(save, key);
    let ok = this.setRaw(key, json) || this.setRaw(key, json);
    if (ok) {
      const ids = this.listIds();
      if (!ids.includes(save.id)) {
        ids.push(save.id);
        const index = JSON.stringify(ids);
        ok = this.setRaw(INDEX_KEY, index) || this.setRaw(INDEX_KEY, index);
      }
    }
    if (!ok) notifyWriteFailed();
    return ok;
  }

  delete(id: string): void {
    localStorage.removeItem(CHAR_KEY(id));
    clearBackups(id, CHAR_KEY(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.listIds().filter((x) => x !== id)));
  }

  /** Every character as one JSON document (format 'efsun-save'). Read back with importAll(). */
  exportAll(): string {
    return JSON.stringify({ format: EXPORT_FORMAT, version: SAVE_VERSION, exportedAt: new Date().toISOString(), chars: this.list() });
  }

  /**
   * Reads a document made by exportAll(). Each character goes through normaliseCharacterSave. A character whose id is
   * already used gets a new id and " (2)" on its name. Invalid characters and anything past MAX_CHARACTERS are skipped.
   * Throws an Error with a Turkish message when the file itself is not a save export.
   */
  importAll(json: string): ImportResult {
    let doc: unknown;
    try {
      doc = JSON.parse(json);
    } catch (e) {
      console.warn('[save] import: invalid JSON', e);
      throw new Error(MSG_BAD_FILE);
    }
    const bundle = doc as { format?: unknown; version?: unknown; chars?: unknown } | null;
    if (!bundle || typeof bundle !== 'object' || bundle.format !== EXPORT_FORMAT || !Array.isArray(bundle.chars)) throw new Error(MSG_BAD_FILE);
    if (typeof bundle.version === 'number' && bundle.version > SAVE_VERSION) throw new Error(MSG_NEWER_FILE);
    const result: ImportResult = { imported: 0, skipped: 0 };
    let slots = this.listIds().length;
    for (const raw of bundle.chars as unknown[]) {
      const save = normaliseCharacterSave(raw);
      const classOk = !!save && typeof save.classId === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, save.classId as ClassId);
      if (!save || typeof save.name !== 'string' || !save.name || !classOk || slots >= MAX_CHARACTERS) {
        result.skipped++;
        continue;
      }
      if (typeof save.id !== 'string' || !save.id) {
        save.id = newCharacterId((id) => this.idTaken(id));
      } else if (this.idTaken(save.id)) {
        save.name = `${save.name} (2)`;
        save.id = newCharacterId((id) => this.idTaken(id));
      }
      if (this.write(save)) {
        result.imported++;
        slots++;
      } else {
        result.skipped++;
      }
    }
    return result;
  }

  summaries(): CharacterSummary[] {
    return this.list().map((c) => ({
      id: c.id, name: c.name, classId: c.classId, level: c.level, itemLevel: 0, rating: c.mythic?.rating ?? 0, variant: c.appearance?.variant ?? 0,
    }));
  }
}
