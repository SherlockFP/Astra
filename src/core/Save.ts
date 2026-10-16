import type { CharacterSave, CharacterSummary } from '../types/character';
import type { SkillSlotKey } from '../types/skills';
import type { SpecId } from '../types/v2';
import { SKILLS } from '../data/skills';
import { ensureStarterFlask } from '../data/flasks';
import { OPENING_KIT, classGrantOrder } from '../data/openingKit';
import { LEGACY_KIT_SLOTS, MAJOR_SLOTS, barCandidates, layoutDefaultBar } from '../data/barLayout';
import { getSpec } from '../data/specs';
import { migrationToast } from '../dev/migrate';
import { CLASS_ORDER, validateName } from '../ui/menu/classInfo';
import {
  EXPORT_FORMAT, MSG_BAD_FILE, MSG_NEWER_FILE, backupDue, backupKey, clearBackups, isQuotaError, newCharacterId, notifyBackupRestored, notifyFull,
  notifyLost, notifyRestored, notifyWriteFailed, requestPersistentStorage, rollBackup, type ImportResult,
} from './SaveSafety';

const INDEX_KEY = 'efsun.characters.v1';
const CHAR_KEY = (id: string) => `efsun.char.${id}`;
export const MAX_CHARACTERS = 6;
/** v2 = GDD_V2 optional fields; see normaliseCharacterSave(). */
export const SAVE_VERSION = 2;
/** Imported ids: no dots, so an id can never end in `.bak1` / `.bak2` (the backup keys). */
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** Longest character name; validateName (ui/menu/classInfo) enforces the same limit. */
const NAME_MAX = 14;
/** Why an import skipped a character (shown in the toast). */
const SKIP = { invalid: 'bozuk kayıt', classNotInMenu: 'bilinmeyen sınıf', full: 'yuva dolu', write: 'yazılamadı' } as const;

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
  ensureStarterFlask(c); // every character gets its Sisli Matara once (data/flasks.ts)
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
  migratePlateBars(c);
  migrateDefaultBar(c);
  return c;
}

/**
 * Bar layout rev 1 (data/barLayout.ts; flags['bar.layoutRev']): a bar whose kit rows still hold exactly the OLD default (LEGACY_KIT_SLOTS
 * up to the save's level, and nothing else off the default) moves its kit rows to the new default. Any other bar (the player's own
 * arrangement, a talent skill, a spec bar, a major) is kept as it is. Runs once per save.
 */
function migrateDefaultBar(save: CharacterSave): void {
  save.flags ??= {};
  if (save.flags['bar.layoutRev']) return;
  save.flags['bar.layoutRev'] = 1;
  const kit = OPENING_KIT[save.classId] ?? [];
  if (!kit.length || !save.skillBar) return;
  const majorKeys = new Set<string>(MAJOR_SLOTS);
  const legacy = kit.filter(([id]) => (SKILLS[id]?.unlockLevel ?? 1) <= save.level && LEGACY_KIT_SLOTS[id]).map(([id]) => `${LEGACY_KIT_SLOTS[id]}=${id}`).sort();
  const current = Object.entries(save.skillBar).filter(([k, id]) => id && k !== 'lmb' && !majorKeys.has(k)).map(([k, id]) => `${k}=${id}`).sort();
  if (legacy.length !== current.length || legacy.some((x, i) => x !== current[i])) return;
  const { candidates, majors } = barCandidates(kit, classGrantOrder(save.classId), SKILLS);
  const next = layoutDefaultBar(save.skillBar.lmb ?? '', candidates, save.level, majors);
  const kitIds = new Set(kit.map(([id]) => id));
  for (const [k, id] of Object.entries(save.skillBar)) if (id && kitIds.has(id) && !majorKeys.has(k)) delete save.skillBar[k as SkillSlotKey];
  for (const [k, id] of Object.entries(next)) if (k !== 'lmb' && id && kitIds.has(id)) save.skillBar[k as SkillSlotKey] = id;
}

/** PM-00a (docs/kits/plate-melee.md §g need 9 / f4): the nine plate-melee specs. */
const PLATE_SPEC_IDS: SpecId[] = [
  'knight_protector', 'knight_blademaster', 'barbarian_warlord', 'barbarian_butcher',
  'paladin_protection', 'paladin_holy', 'paladin_retribution', 'necromancer_bone', 'necromancer_summoner', 'necromancer_frost',
];

/**
 * One-time reset (flags['bars.plate1']): drops the saved bars of the nine plate specs so they fall back to the new
 * `defaultBar` (dropped / moved skill ids would otherwise stay on the bar, see remapBars). Idempotent.
 */
function migratePlateBars(save: CharacterSave): void {
  save.flags ??= {};
  if (save.flags['bars.plate1']) return;
  save.flags['bars.plate1'] = 1;
  const bars = (save.specBars ??= {});
  for (const s of PLATE_SPEC_IDS) delete bars[s];
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
 * An imported character's name under validateName's rules: 2 to 14 characters, letters / digits / space / - _ ', starting
 * with a letter, single spaces. Other characters become spaces; an unusable name becomes "Kahraman". A name already in
 * `taken` (case-insensitive) gets " 2", " 3"... with the base cut so the result keeps the 14-character limit.
 */
function cleanImportedName(raw: unknown, taken: string[]): string {
  const cleaned = (typeof raw === 'string' ? raw : '')
    .replace(/[^A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû0-9 '_-]+/g, ' ')
    .replace(/^[^A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû]+/, '')
    .replace(/\s+/g, ' ')
    .slice(0, NAME_MAX)
    .trim();
  const base = validateName(cleaned, []) === null ? cleaned : 'Kahraman';
  const low = (s: string) => s.toLocaleLowerCase('tr');
  const isTaken = (n: string) => taken.some((t) => low(t) === low(n));
  let name = base;
  for (let n = 2; isTaken(name); n++) {
    const suffix = ` ${n}`;
    name = base.slice(0, NAME_MAX - suffix.length).trimEnd() + suffix;
  }
  return name;
}

/**
 * Character slots in localStorage. Pure persistence — no game logic. Safety net (SaveSafety.ts): rolling `.bak1` / `.bak2`
 * copies, recovery from a backup when the JSON is corrupt, a retry and a toast on write failure (a full storage frees
 * backups first), JSON export / import.
 */
export class Save {
  constructor() {
    requestPersistentStorage();
  }

  /** The character index. Anything that is not an array of strings counts as no index. */
  listIds(): string[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
      return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string') ? (parsed as string[]) : [];
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
   * character stays in the list. `corrupt` = the main JSON was unreadable: the player is told it was restored, and that it
   * is lost when no backup works (once per session). A missing key restored from a backup gets a neutral notice.
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
        if (corrupt) notifyRestored();
        else notifyBackupRestored();
        return save;
      } catch (e) {
        console.warn('[save] bak' + n + ' unusable', id, e);
      }
    }
    if (corrupt) {
      console.error('[save] no usable backup', id);
      notifyLost(id);
    }
    return null;
  }

  /** localStorage.setItem that never throws: 'quota' when the storage is full, 'failed' for any other error (logged). */
  private setRaw(key: string, json: string): 'ok' | 'quota' | 'failed' {
    try {
      localStorage.setItem(key, json);
      return 'ok';
    } catch (e) {
      console.warn('[save] write failed', key, e);
      return isQuotaError(e) ? 'quota' : 'failed';
    }
  }

  /** localStorage.getItem that never throws. Null when the key is missing or unreadable. */
  private readRaw(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('[save] read failed', key, e);
      return null;
    }
  }

  /** Copies the stored JSON (read before it was overwritten) to `.bak1` when backupDue() says so. Failures never block. */
  private backupBefore(save: CharacterSave, key: string, stored: string): void {
    try {
      if (backupDue(save.id, stored, save)) rollBackup(save.id, key, stored);
    } catch (e) {
      console.warn('[save] backup skipped', save.id, e);
    }
  }

  private idTaken(id: string): boolean {
    return this.listIds().includes(id) || localStorage.getItem(CHAR_KEY(id)) !== null;
  }

  /**
   * Writes the character key. A failure other than a full storage gets one retry. A full storage (QuotaExceededError)
   * frees one backup at a time (freeBackup) and retries after each, at most 3 times. False = not written.
   */
  private writeMain(id: string, key: string, json: string): boolean {
    let res = this.setRaw(key, json);
    if (res === 'failed') res = this.setRaw(key, json);
    for (let retry = 0; res === 'quota' && retry < 3; retry++) {
      if (!this.freeBackup(id, key)) break;
      res = this.setRaw(key, json);
    }
    return res === 'ok';
  }

  /**
   * Deletes one backup to make room, in this order: this character's `.bak2`, its `.bak1`, then the other characters'
   * `.bak2` keys. False when none is left. Never throws.
   */
  private freeBackup(id: string, key: string): boolean {
    try {
      const others = this.listIds().filter((x) => x !== id).map((x) => backupKey(CHAR_KEY(x), 2));
      for (const k of [backupKey(key, 2), backupKey(key, 1), ...others]) {
        if (localStorage.getItem(k) === null) continue;
        localStorage.removeItem(k);
        console.warn('[save] storage full, removed backup', k);
        return true;
      }
    } catch (e) {
      console.warn('[save] could not free space', id, e);
    }
    return false;
  }

  /** Adds the id to the character index (one retry). False when the index could not be written. Never throws. */
  private indexAdd(id: string): boolean {
    try {
      const ids = this.listIds();
      if (ids.includes(id)) return true;
      ids.push(id);
      const index = JSON.stringify(ids);
      return this.setRaw(INDEX_KEY, index) === 'ok' || this.setRaw(INDEX_KEY, index) === 'ok';
    } catch (e) {
      console.warn('[save] index update failed', id, e);
      return false;
    }
  }

  /**
   * Writes one character. The main key is written first; the JSON it replaces is rolled to `.bak1` only once that write
   * has worked. Failures toast (see writeMain). False = not saved. A new id past MAX_CHARACTERS is refused here too, so a
   * menu with stale stands cannot store a 7th character. `keepLastPlayed` keeps the save's own timestamp (import).
   */
  write(save: CharacterSave, opts: { keepLastPlayed?: boolean } = {}): boolean {
    const taken = this.listIds();
    if (!taken.includes(save.id) && taken.length >= MAX_CHARACTERS) {
      notifyFull(MAX_CHARACTERS);
      return false;
    }
    if (!opts.keepLastPlayed) save.lastPlayed = Date.now();
    const key = CHAR_KEY(save.id);
    let json: string;
    try {
      json = JSON.stringify(save);
    } catch (e) {
      console.warn('[save] serialise failed', save.id, e);
      notifyWriteFailed();
      return false;
    }
    const before = this.readRaw(key);
    if (!this.writeMain(save.id, key, json)) {
      notifyWriteFailed();
      return false;
    }
    if (before !== null) this.backupBefore(save, key, before);
    const ok = this.indexAdd(save.id);
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

  /** The exported id when it is well-formed and unused here, otherwise a new one. */
  private freeId(id: unknown): string {
    if (typeof id === 'string' && ID_RE.test(id) && !this.idTaken(id)) return id;
    return newCharacterId((x) => this.idTaken(x));
  }

  /**
   * Reads a document made by exportAll(). Each character goes through normaliseCharacterSave. Its id is kept when it is
   * well-formed and unused, otherwise replaced. Its name is cleaned to the menu's rules and gets a " 2"-style suffix when
   * already taken. Bad data, a class the character menu cannot show, and anything past MAX_CHARACTERS are skipped and
   * counted by reason. The exported lastPlayed is kept. A character that throws while being processed is skipped as well,
   * so the rest still import and the result always matches what was written. Throws an Error with a Turkish message when the
   * file itself is not a save export (before anything is written).
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
    const result: ImportResult = { imported: 0, skipped: 0, skippedBy: {} };
    const skip = (why: string) => {
      result.skipped++;
      result.skippedBy[why] = (result.skippedBy[why] ?? 0) + 1;
    };
    const names = this.list().map((c) => c.name);
    let slots = this.listIds().length;
    for (const raw of bundle.chars as unknown[]) {
      // one malformed character (e.g. flags: 5 breaks migrateTalents) must not abort the rest: a throw here would leave the
      // characters already written unreported, and the menu list would stay stale
      try {
        const save = normaliseCharacterSave(raw);
        if (!save) {
          skip(SKIP.invalid);
          continue;
        }
        if (!CLASS_ORDER.includes(save.classId)) {
          skip(SKIP.classNotInMenu);
          continue;
        }
        if (slots >= MAX_CHARACTERS) {
          skip(SKIP.full);
          continue;
        }
        const name = cleanImportedName(save.name, names);
        save.name = name;
        save.id = this.freeId(save.id);
        if (!Number.isFinite(save.lastPlayed)) save.lastPlayed = Date.now();
        if (this.write(save, { keepLastPlayed: true })) {
          names.push(name);
          slots++;
          result.imported++;
        } else {
          skip(SKIP.write);
        }
      } catch (e) {
        console.warn('[save] import: character skipped', e);
        skip(SKIP.invalid);
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
