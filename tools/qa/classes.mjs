// Shared class-id handling for the QA scripts (first-hour.mjs, dungeon-pack.mjs).
//
// The class list is read from src/net/messages.ts (CLASS_IDS, the wire-level list of every class id). Labels and melee / caster
// behaviour are NOT kept in this file: the scripts read them from the game's own modules in the page (classInfo.ts classPresentation,
// the auto-attack mode from SkillSystem.autoInfo). Only WoW class names are kept here, as aliases for the internal ids.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES = path.resolve(HERE, '..', '..', 'src', 'net', 'messages.ts');

/** WoW names (and common spellings) -> the game's class id. Keys are lower case, '-' and ' ' are folded to '_'. */
export const CLASS_ALIASES = {
  hunter: 'archer',
  warrior: 'knight',
  demon_hunter: 'demonhunter',
  dh: 'demonhunter',
};

/** Every class id of src/net/messages.ts CLASS_IDS, in source order. Throws when the list cannot be read. */
export function netClassIds() {
  const src = fs.readFileSync(MESSAGES, 'utf8');
  const m = src.match(/const\s+CLASS_IDS\b[^=]*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error(`CLASS_IDS not found in ${MESSAGES}`);
  const ids = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  if (!ids.length) throw new Error(`CLASS_IDS in ${MESSAGES} has no entries`);
  return ids;
}

/** A class token from the env (id or WoW alias, any case) -> class id. Throws with the accepted names on an unknown token. */
export function resolveClass(token, ids = netClassIds()) {
  const raw = String(token).trim().toLowerCase();
  const key = raw.replace(/[\s-]+/g, '_');
  const id = ids.includes(raw) ? raw : ids.includes(key) ? key : CLASS_ALIASES[key];
  if (!id || !ids.includes(id)) {
    const aliases = Object.keys(CLASS_ALIASES).join(', ');
    throw new Error(`unknown class "${token}": use one of ${ids.join(', ')} (aliases: ${aliases})`);
  }
  return id;
}

/** Comma list from an env var -> resolved class ids (duplicates dropped, order kept). */
export function resolveClassList(csv, ids = netClassIds()) {
  const out = [];
  for (const t of String(csv).split(',').map((s) => s.trim()).filter(Boolean)) {
    const id = resolveClass(t, ids);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
