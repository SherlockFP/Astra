/**
 * ULUSLAR (WP-06, MMO_PILLARS). PURE data + rules, no G / three.js, importable from the node sims.
 *
 * Two nations, chosen once at character creation and stored in the save (`CharacterSave.nation`, append-only):
 *   Gök Kartal (blue)  vs  Kızıl Kurt (red).
 * Hostility is ZONE-bound: two different nations are enemies only inside a PvP zone (Kızıl Sınır). Everywhere else they are just
 * strangers (chat, trade, town). Parties are same-nation, except in a `pvp` room (net/NetSession `mode: 'pvp'`), which is the
 * room type used to fight in Kızıl Sınır.
 */

export type NationId = 'gok_kartal' | 'kizil_kurt';

export const NATION_IDS: readonly NationId[] = ['gok_kartal', 'kizil_kurt'];

export interface NationDef {
  id: NationId;
  name: string;
  /** Two letters shown in front of the name on nameplates / in presence. */
  tag: string;
  /** CSS colour (nameplate, panels). */
  color: string;
  /** Same colour as 0xRRGGBB (3D, minimap). */
  hex: number;
  lore: string;
}

export const NATIONS: Record<NationId, NationDef> = {
  gok_kartal: {
    id: 'gok_kartal', name: 'Gök Kartal', tag: 'GK', color: '#5aa8ff', hex: 0x5aa8ff,
    lore: 'Kuzey sınırının gök bayraklı muhafızları. Yüksekten bakar, keskin vurur.',
  },
  kizil_kurt: {
    id: 'kizil_kurt', name: 'Kızıl Kurt', tag: 'KK', color: '#ff5a4a', hex: 0xff5a4a,
    lore: 'Güney bozkırının kızıl sürüsü. Birlikte avlanır, sınırı kanla çizer.',
  },
};

export const isNationId = (x: unknown): x is NationId => x === 'gok_kartal' || x === 'kizil_kurt';

/** Stable 32-bit string hash (FNV-1a), the same everywhere (default nation of a character, sims). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Default nation of a seed (character id) when there is no balance information. */
export function hashNation(seed: string): NationId {
  return NATION_IDS[hash32(seed) & 1];
}

/**
 * Default pick at creation: the nation with FEWER characters among those the player already has (keeps both nations
 * populated), ties broken by the hash of `seed`.
 */
export function pickNation(counts: Partial<Record<NationId, number>>, seed: string): NationId {
  const a = counts.gok_kartal ?? 0;
  const b = counts.kizil_kurt ?? 0;
  if (a === b) return hashNation(seed);
  return a < b ? 'gok_kartal' : 'kizil_kurt';
}

/** Nation of a save: the stored one, else the hash default of its id (old saves; CharacterState.ensureNation persists it). */
export function nationOfSave(save: { id: string; nation?: unknown }): NationId {
  return isNationId(save.nation) ? save.nation : hashNation(save.id);
}

/** Wire value -> NationId or undefined (untrusted input). */
export function cleanNation(x: unknown): NationId | undefined {
  return isNationId(x) ? x : undefined;
}

/** Two different, known nations. NOT enough to fight: PvP also needs a PvP zone (see systems/PvpRules.canPvpHit). */
export function nationsOpposed(a: NationId | null | undefined, b: NationId | null | undefined): boolean {
  return !!a && !!b && a !== b;
}

export type RoomMode = 'coop' | 'pvp';

/** May `joiner` enter a room hosted by `host`? Same nation, unknown nation (old client), or a `pvp` room. */
export function canParty(host: NationId | null | undefined, joiner: NationId | null | undefined, mode: RoomMode = 'coop'): boolean {
  if (mode === 'pvp') return true;
  if (!host || !joiner) return true;
  return host === joiner;
}

export const nationName = (n: NationId | null | undefined): string => (n ? NATIONS[n].name : '-');
export const nationTag = (n: NationId | null | undefined): string => (n ? NATIONS[n].tag : '');
export const nationColor = (n: NationId | null | undefined, fallback = '#7fe08a'): string => (n ? NATIONS[n].color : fallback);

/** Other nation (for "enemy" text). */
export const otherNation = (n: NationId): NationId => (n === 'gok_kartal' ? 'kizil_kurt' : 'gok_kartal');
