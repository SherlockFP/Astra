/**
 * GDD_TALENTS §2.7 (build string `EFT1`) and §3.9 (web plan string `EFP1`). Pure: no `G`, no I/O.
 * Ported from the Appendix H reference (tested there: `EFT1-04-Vqq9VuhEgFdVeq3QiQA-VAAA-47` for `mage_fire`).
 *
 * Build string: `EFT1-<SS>-<19 chars>-<4 chars>-<CC>`
 *   SS  = SPEC_ORDER index (2 digits)
 *   19  = base64url of 14 bytes: class tree (7 bytes, 49 bits padded to 56) + spec tree (7 bytes, 48 bits padded to 56)
 *   4   = base64url of 3 bytes: 9 skill-specialisation picks × 2 bits (18 bits padded to 24)
 *   CC  = CRC-8 (poly 0x07, init 0) over the 18 payload bytes (SS byte + 14 + 3), two upper-case hex digits
 *
 * Web string: `EFP1-<classIndex 1-2 digits>-<59 chars>-<6 chars>-<CC>` (§3.9)
 *   59  = base64url of 44 bytes: one bit per web node in TALENT_LIST order (346 bits padded to 352)
 *   6   = base64url of 4 bytes: the mastery picks (2 bits each, in TALENT_LIST order of the `mastery` nodes)
 *   CC  = CRC-8 over the 48 payload bytes (44 + 4)
 */
import type { ClassId } from '../types/common';
import type { SpecId } from '../types/v2';
import type { TreeKind } from '../types/talents';
import { SLOT_ORDER, slotType } from '../data/talentTrees/layout';
import { CLASS_ORDER, SPEC_ORDER, classOfSpec } from '../data/talentTrees/index';
import { TALENT_LIST } from '../data/talents';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const SKILL_COUNT = 9;

/** Bit width of each of the 30 slots of a tree (§2.7): P 2 · C 2 · s30 2 · class s05 2 · everything else 1. */
function widthsOf(kind: TreeKind): number[] {
  return SLOT_ORDER.map((s) => {
    const t = slotType(s, kind);
    if (s === 's30') return 2;
    if (t === 'P' || t === 'C') return 2;
    if (kind === 'class' && s === 's05') return 2;
    return 1;
  });
}

const WIDTHS: Record<TreeKind, number[]> = { class: widthsOf('class'), spec: widthsOf('spec') };

function crc8(bytes: readonly number[]): number {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}

function bytesToBits(bytes: readonly number[]): number[] {
  const bits: number[] = [];
  for (const b of bytes) for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
  return bits;
}

/** Packs bits (MSB first) into bytes; a short last byte is padded with zeros. */
function bitsToBytes(bits: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] ?? 0);
    out.push(v);
  }
  return out;
}

function padBits(bits: number[], total: number): number[] {
  while (bits.length < total) bits.push(0);
  return bits;
}

/** Values packed MSB-first with the given widths (value i occupies widths[i] bits). */
function valuesToBits(values: readonly number[], widths: readonly number[]): number[] {
  const bits: number[] = [];
  widths.forEach((w, i) => {
    const v = values[i] ?? 0;
    for (let b = w - 1; b >= 0; b--) bits.push((v >> b) & 1);
  });
  return bits;
}

function bitsToValues(bits: readonly number[], widths: readonly number[]): number[] {
  const out: number[] = [];
  let p = 0;
  for (const w of widths) {
    let v = 0;
    for (let b = 0; b < w; b++) v = (v << 1) | (bits[p++] ?? 0);
    out.push(v);
  }
  return out;
}

function b64Encode(bytes: readonly number[]): string {
  const bits = bytesToBits(bytes);
  while (bits.length % 6) bits.push(0);
  let out = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let j = 0; j < 6; j++) v = (v << 1) | (bits[i + j] ?? 0);
    out += B64[v];
  }
  return out;
}

/** Decodes exactly `nBytes` bytes from a base64url string; null when a character is outside the alphabet or too short. */
function b64Decode(s: string, nBytes: number): number[] | null {
  const bits: number[] = [];
  for (const c of s) {
    const v = B64.indexOf(c);
    if (v < 0) return null;
    for (let b = 5; b >= 0; b--) bits.push((v >> b) & 1);
  }
  if (bits.length < nBytes * 8) return null;
  return bitsToBytes(bits.slice(0, nBytes * 8));
}

/** Largest legal value of a slot field: 2-bit fields hold 0..2 (none / A / B or a rank), 1-bit fields 0..1. */
const maxValueOfWidth = (w: number): number => (w === 2 ? 2 : 1);

// ============================================================================ build string (EFT1)

/**
 * Encodes a build: `cls` and `spc` are the 30 slot values of the class and spec trees (P 0–2, C/s30/class s05 0–2,
 * others 0–1), `skl` the 9 skill-specialisation picks (3 signature skills × tiers 1–3, 0 / 1 A / 2 B).
 * Returns '' for a spec outside SPEC_ORDER.
 */
export function encodeBuild(specId: SpecId, cls: readonly number[], spc: readonly number[], skl: readonly number[]): string {
  const si = SPEC_ORDER.indexOf(specId);
  if (si < 0) return '';
  const clsBytes = bitsToBytes(padBits(valuesToBits(cls, WIDTHS.class), 56));
  const spcBytes = bitsToBytes(padBits(valuesToBits(spc, WIDTHS.spec), 56));
  const sklBits: number[] = [];
  for (let i = 0; i < SKILL_COUNT; i++) {
    const v = skl[i] ?? 0;
    sklBits.push((v >> 1) & 1, v & 1);
  }
  const skBytes = bitsToBytes(padBits(sklBits, 24));
  const tb = [...clsBytes, ...spcBytes];
  const crc = crc8([si, ...tb, ...skBytes]);
  return `EFT1-${String(si).padStart(2, '0')}-${b64Encode(tb)}-${b64Encode(skBytes)}-${crc.toString(16).padStart(2, '0').toUpperCase()}`;
}

export type BuildDecode =
  | { ok: true; specId: SpecId; cls: number[]; spc: number[]; skl: number[] }
  | { ok: false; error: 'format' | 'crc' | 'class' };

/**
 * Decodes a build string. `format` = syntax, unknown spec index or a field value out of range; `crc` = checksum;
 * `class` = the spec belongs to another class (only checked when `classId` is given). Gates and parents are NOT checked
 * here: TalentSystem.importBuild validates the allocation.
 */
export function decodeBuild(str: string, classId?: ClassId): BuildDecode {
  const m = /^EFT1-(\d{2})-([A-Za-z0-9_-]{19})-([A-Za-z0-9_-]{4})-([0-9A-F]{2})$/.exec(str.trim());
  if (!m) return { ok: false, error: 'format' };
  const si = Number(m[1]);
  const specId = SPEC_ORDER[si];
  const tb = b64Decode(m[2], 14);
  const sk = b64Decode(m[3], 3);
  if (!specId || !tb || !sk) return { ok: false, error: 'format' };
  if (crc8([si, ...tb, ...sk]) !== parseInt(m[4], 16)) return { ok: false, error: 'crc' };
  if (classId !== undefined && classOfSpec(specId) !== classId) return { ok: false, error: 'class' };
  const cls = bitsToValues(bytesToBits(tb.slice(0, 7)), WIDTHS.class);
  const spc = bitsToValues(bytesToBits(tb.slice(7, 14)), WIDTHS.spec);
  const sklBits = bytesToBits(sk);
  const skl: number[] = [];
  for (let i = 0; i < SKILL_COUNT; i++) skl.push((sklBits[2 * i] << 1) | sklBits[2 * i + 1]);
  const badCls = cls.some((v, i) => v > maxValueOfWidth(WIDTHS.class[i]));
  const badSpc = spc.some((v, i) => v > maxValueOfWidth(WIDTHS.spec[i]));
  if (badCls || badSpc || skl.some((v) => v > 2)) return { ok: false, error: 'format' };
  return { ok: true, specId, cls, spc, skl };
}

// ============================================================================ web plan string (EFP1)

export type WebDecode =
  | { ok: true; classId: ClassId; allocated: string[]; picks: Record<string, number> }
  | { ok: false; error: 'format' | 'crc' };

/** Byte counts of the web payload for the current TALENT_LIST: node bits, and 2 bits per mastery node. */
function webSizes(): { nodeBytes: number; pickBytes: number; masteries: string[] } {
  const masteries = TALENT_LIST.filter((n) => n.kind === 'mastery').map((n) => n.id);
  return {
    nodeBytes: Math.ceil(TALENT_LIST.length / 8),
    pickBytes: Math.ceil((masteries.length * 2) / 8),
    masteries,
  };
}

/**
 * Encodes a web plan: `allocated` = node ids of the passive web (unknown ids are ignored), `picks` = mastery node id →
 * option index 0–2 (missing = 0). Returns '' for an unknown class.
 */
export function encodeWeb(classId: ClassId, allocated: readonly string[], picks: Record<string, number>): string {
  const ci = CLASS_ORDER.indexOf(classId);
  if (ci < 0) return '';
  const { nodeBytes, pickBytes, masteries } = webSizes();
  const index = new Map<string, number>();
  TALENT_LIST.forEach((n, i) => index.set(n.id, i));
  const bits: number[] = new Array(nodeBytes * 8).fill(0);
  for (const id of allocated) {
    const i = index.get(id);
    if (i !== undefined) bits[i] = 1;
  }
  const nodePayload = bitsToBytes(bits);
  const pickBits: number[] = [];
  for (const id of masteries) {
    const v = (picks[id] ?? 0) & 3;
    pickBits.push((v >> 1) & 1, v & 1);
  }
  const pickPayload = bitsToBytes(padBits(pickBits, pickBytes * 8));
  const crc = crc8([...nodePayload, ...pickPayload]);
  return `EFP1-${ci}-${b64Encode(nodePayload)}-${b64Encode(pickPayload)}-${crc.toString(16).padStart(2, '0').toUpperCase()}`;
}

/** Decodes a web plan string. `picks` holds only the non-zero mastery picks. */
export function decodeWeb(str: string): WebDecode {
  const { nodeBytes, pickBytes, masteries } = webSizes();
  const aLen = Math.ceil((nodeBytes * 8) / 6);
  const pLen = Math.ceil((pickBytes * 8) / 6);
  const re = new RegExp(`^EFP1-(\\d{1,2})-([A-Za-z0-9_-]{${aLen}})-([A-Za-z0-9_-]{${pLen}})-([0-9A-F]{2})$`);
  const m = re.exec(str.trim());
  if (!m) return { ok: false, error: 'format' };
  const classId = CLASS_ORDER[Number(m[1])];
  const nodePayload = b64Decode(m[2], nodeBytes);
  const pickPayload = b64Decode(m[3], pickBytes);
  if (!classId || !nodePayload || !pickPayload) return { ok: false, error: 'format' };
  if (crc8([...nodePayload, ...pickPayload]) !== parseInt(m[4], 16)) return { ok: false, error: 'crc' };
  const nodeBits = bytesToBits(nodePayload);
  const allocated: string[] = [];
  TALENT_LIST.forEach((n, i) => {
    if (nodeBits[i]) allocated.push(n.id);
  });
  const pickBits = bytesToBits(pickPayload);
  const picks: Record<string, number> = {};
  for (let k = 0; k < masteries.length; k++) {
    const v = (pickBits[2 * k] << 1) | pickBits[2 * k + 1];
    if (v > 2) return { ok: false, error: 'format' };
    if (v > 0) picks[masteries[k]] = v;
  }
  return { ok: true, classId, allocated, picks };
}
