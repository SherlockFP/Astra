import { toast } from '../systems/notify';
import type { Save } from './Save';

/**
 * Save safety net (F1): persistent storage request, rolling backups, recovery and write-failure notices, JSON export /
 * import. Save.ts calls these helpers; nothing here knows about game rules. Only type imports from Save (no runtime cycle).
 */

/** Marker inside an exported file (Save.exportAll / importAll). */
export const EXPORT_FORMAT = 'efsun-save';
/** A character gets a fresh backup at most this often (a version change or a migration always backs up). */
export const BACKUP_INTERVAL_MS = 5 * 60 * 1000;
/** Autosave retries often, so the write-failure toast is throttled. */
const WRITE_TOAST_COOLDOWN_MS = 30 * 1000;

export const MSG_RESTORED = 'Kayıt bozuktu — yedekten geri yüklendi.';
export const MSG_LOST = 'Kayıt bozuktu ve kullanılabilir yedeği yok.';
export const MSG_WRITE_FAILED = 'Kayıt yazılamadı! Dışa aktararak yedek al.';
export const MSG_BAD_FILE = 'Bu dosya bir EFSUN ONLINE kayıt dosyası değil.';
export const MSG_NEWER_FILE ='Bu kayıt dosyası daha yeni bir sürümden; oyunu güncellemen gerekiyor.';

export interface ImportResult {
  imported: number;
  skipped: number;
}

/** The part of a stored save that backupDue() reads. */
type StoredHead = { version?: unknown; flags?: Record<string, unknown> | null } | null;

/** Last backup time per character id. In memory only: the first write of a new session takes a backup. */
const lastBackupAt = new Map<string, number>();
let persistRequested = false;
let lastWriteToastAt = 0;

/** Asks the browser not to evict this origin's storage. Once per session, never throws. */
export function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persist) return;
    storage.persist().then(
      (granted) => console.info('[save] persistent storage', granted ? 'granted' : 'denied'),
      (e: unknown) => console.warn('[save] persist() failed', e),
    );
  } catch (e) {
    console.warn('[save] persist() unavailable', e);
  }
}

/** Key of a character's backup: `<charKey>.bak1` (newest) or `.bak2`. */
export function backupKey(charKey: string, n: 1 | 2): string {
  return `${charKey}.bak${n}`;
}

/**
 * True when the stored JSON must be copied to .bak1 before `next` overwrites it: `next` changes the save version (a load
 * migrated it, or a v1 save is being upgraded), a talent migration is about to run, or the last backup is 5 min old or
 * older. The check uses `next.version`, the version being written, so a save that keeps its version only follows the 5 min
 * clock (a character created this session stays v1 in memory). Unreadable stored JSON is never backed up, so it cannot push
 * a good backup out.
 */
export function backupDue(id: string, stored: string, next: { version?: number; flags?: Record<string, unknown> }, now = Date.now()): boolean {
  let old: StoredHead;
  try {
    old = JSON.parse(stored) as StoredHead;
  } catch (e) {
    console.warn('[save] stored save unreadable, backup skipped', id, e);
    return false;
  }
  if (!old || typeof old !== 'object') return false;
  if ((old.version ?? 1) !== (next.version ?? 1)) return true;
  if (!old.flags?.['tb.migrated'] && next.flags?.['tb.migrated']) return true;
  return now - (lastBackupAt.get(id) ?? 0) >= BACKUP_INTERVAL_MS;
}

/** Copies the stored JSON to .bak1 (the old .bak1 moves to .bak2). Never throws: a failed copy is logged, the write goes on. */
export function rollBackup(id: string, charKey: string, stored: string): void {
  try {
    const bak1 = backupKey(charKey, 1);
    const old1 = localStorage.getItem(bak1);
    if (old1 !== null) localStorage.setItem(backupKey(charKey, 2), old1);
    localStorage.setItem(bak1, stored);
    lastBackupAt.set(id, Date.now());
  } catch (e) {
    console.warn('[save] backup failed', id, e);
  }
}

/** Removes a deleted character's backups and its backup clock. */
export function clearBackups(id: string, charKey: string): void {
  lastBackupAt.delete(id);
  try {
    localStorage.removeItem(backupKey(charKey, 1));
    localStorage.removeItem(backupKey(charKey, 2));
  } catch (e) {
    console.warn('[save] could not remove backups', id, e);
  }
}

/** A character was restored from a backup. */
export function notifyRestored(): void {
  toast(MSG_RESTORED, 'warning');
}

/** A character is corrupt and no backup could be used. */
export function notifyLost(): void {
  toast(MSG_LOST, 'error');
}

/** A new character was refused: every slot is taken (Save.write). */
export function notifyFull(max: number): void {
  toast(`Karakter yuvaları dolu (${max}/${max}). Yeni karakter için birini silmelisin.`, 'warning');
}

/** A write failed even after the retry. Throttled. */
export function notifyWriteFailed(): void {
  const now = Date.now();
  if (now - lastWriteToastAt < WRITE_TOAST_COOLDOWN_MS) return;
  lastWriteToastAt = now;
  toast(MSG_WRITE_FAILED, 'error');
}

/** A new character id that `taken` does not report as used (same shape as CharacterState.create). */
export function newCharacterId(taken: (id: string) => boolean): string {
  let id: string;
  do {
    id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  } while (taken(id));
  return id;
}

/** `efsun-kayit-YYYYMMDD.json` with the local date. */
export function saveFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `efsun-kayit-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.json`;
}

/** Downloads a text file through a temporary object URL and an a[download] click. */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Dışa aktar: every character in one file. Toasts the outcome. */
export function exportSaves(save: Save): void {
  if (!save.listIds().length) {
    toast('Dışa aktarılacak kayıt yok.', 'warning');
    return;
  }
  try {
    downloadText(saveFileName(), save.exportAll());
    toast('Kayıtlar dışa aktarıldı.', 'success');
  } catch (e) {
    console.warn('[save] export failed', e);
    toast('Dışa aktarma başarısız oldu.', 'error');
  }
}

/** Pending import target: one hidden file input is reused for every open. */
let importInput: HTMLInputElement | null = null;
let importTarget: { save: Save; onDone?: (result: ImportResult) => void } | null = null;

/**
 * İçe aktar: file picker for an exportAll() file. Toasts the result and calls `onDone` after a successful import so
 * the caller can refresh its list. Call it from a click handler (browsers block file pickers otherwise).
 */
export function openImportDialog(save: Save, onDone?: (result: ImportResult) => void): void {
  importTarget = { save, onDone };
  if (!importInput) {
    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.style.display = 'none';
    importInput.addEventListener('change', () => {
      const file = importInput?.files?.[0];
      if (importInput) importInput.value = ''; // the same file can be picked again later
      const target = importTarget;
      if (file && target) void importFile(target.save, file, target.onDone);
    });
    document.body.append(importInput);
  }
  importInput.click();
}

async function importFile(save: Save, file: File, onDone?: (result: ImportResult) => void): Promise<void> {
  try {
    const result = save.importAll(await file.text());
    const extra = result.skipped ? `, ${result.skipped} atlandı` : '';
    toast(`${result.imported} kahraman içe aktarıldı${extra}.`, result.imported ? 'success' : 'warning');
    onDone?.(result);
  } catch (e) {
    console.warn('[save] import failed', e);
    toast(e instanceof Error && e.message ? e.message : MSG_BAD_FILE, 'error');
  }
}
