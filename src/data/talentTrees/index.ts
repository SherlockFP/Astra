/**
 * GDD_TALENTS §1.2 / §2.9 — the 30 trees (9 class + 21 spec) and their registry.
 *
 * `TREES` is keyed by tree id (`class:<classId>` or `spec:<specId>`, the ids of the trees.json data) and each entry is
 * built the first time it is read (`buildTree` on the raw data of `./raw/<classId>.ts`, cached afterwards).
 * `getTree(kind, id)` takes the class id for a class tree and the spec id for a spec tree.
 */
import type { ClassId } from '../../types/common';
import type { SpecId } from '../../types/v2';
import type { TreeDef, TreeKind } from '../../types/talents';
import { buildTree } from './build';
import type { RawClassFile } from './build';
import knight from './raw/knight';
import barbarian from './raw/barbarian';
import mage from './raw/mage';
import rogue from './raw/rogue';
import monk from './raw/monk';
import archer from './raw/archer';
import paladin from './raw/paladin';
import necromancer from './raw/necromancer';
import warlock from './raw/warlock';

interface ClassEntry {
  id: ClassId;
  name: string;
}

interface SpecEntry {
  id: SpecId;
  classId: ClassId;
  name: string;
}

/** §2.10 class order (the import/export and the tree order). Names are the Turkish tree titles. */
const CLASS_TABLE: readonly ClassEntry[] = [
  { id: 'knight', name: 'Şövalye' },
  { id: 'barbarian', name: 'Barbar' },
  { id: 'mage', name: 'Büyücü' },
  { id: 'rogue', name: 'Haydut' },
  { id: 'monk', name: 'Keşiş' },
  { id: 'archer', name: 'Okçu' },
  { id: 'paladin', name: 'Paladin' },
  { id: 'necromancer', name: 'Nekromant' },
  { id: 'warlock', name: 'Warlock' },
];

/** §1.2 table order (index 0–20 = `SPEC_ORDER`, used by the export string `SS` of §2.7). */
const SPEC_TABLE: readonly SpecEntry[] = [
  { id: 'knight_protector', classId: 'knight', name: 'Koruyucu' },
  { id: 'knight_blademaster', classId: 'knight', name: 'Kılıç Ustası' },
  { id: 'barbarian_warlord', classId: 'barbarian', name: 'Savaş Lordu' },
  { id: 'barbarian_butcher', classId: 'barbarian', name: 'Kasap' },
  { id: 'mage_fire', classId: 'mage', name: 'Ateş Büyücüsü' },
  { id: 'mage_frost', classId: 'mage', name: 'Buz Büyücüsü' },
  { id: 'mage_arcane', classId: 'mage', name: 'Gizem Ustası' },
  { id: 'rogue_assassin', classId: 'rogue', name: 'Suikastçı' },
  { id: 'rogue_alchemist', classId: 'rogue', name: 'Simyacı' },
  { id: 'monk_brewmaster', classId: 'monk', name: 'Demci' },
  { id: 'monk_windwalker', classId: 'monk', name: 'Rüzgâr Yürüyen' },
  { id: 'monk_mistweaver', classId: 'monk', name: 'Sis Dokuyan' },
  { id: 'archer_marksman', classId: 'archer', name: 'Nişancı' },
  { id: 'archer_beastmaster', classId: 'archer', name: 'Av Ustası' },
  { id: 'paladin_protection', classId: 'paladin', name: 'Koruma' },
  { id: 'paladin_holy', classId: 'paladin', name: 'Kutsal' },
  { id: 'paladin_retribution', classId: 'paladin', name: 'Ceza' },
  { id: 'necromancer_summoner', classId: 'necromancer', name: 'Ordu Efendisi' },
  { id: 'necromancer_bone', classId: 'necromancer', name: 'Kemik Ustası' },
  { id: 'warlock_affliction', classId: 'warlock', name: 'Azap' },
  { id: 'warlock_destruction', classId: 'warlock', name: 'Yıkım' },
];

/** Class ids in canonical order (§1.2). */
export const CLASS_ORDER: readonly ClassId[] = CLASS_TABLE.map((c) => c.id);
/** Spec ids in canonical order (§1.2); the index is the export-string `SS` value. */
export const SPEC_ORDER: readonly SpecId[] = SPEC_TABLE.map((s) => s.id);

/** Tree id of a class tree (`class:<classId>`) or a spec tree (`spec:<specId>`). */
export function treeIdFor(kind: TreeKind, classId: ClassId, specId?: SpecId): string {
  if (kind === 'class') return `class:${classId}`;
  if (!specId) throw new Error(`treeIdFor: spec tree of ${classId} needs a specId`);
  return `spec:${specId}`;
}

/** The specs of a class, in §1.2 order. */
export function specsOfClass(classId: ClassId): SpecId[] {
  return SPEC_TABLE.filter((s) => s.classId === classId).map((s) => s.id);
}

/** The class a spec belongs to (undefined for an id outside the 21 listed specs). */
export function classOfSpec(specId: SpecId): ClassId | undefined {
  return SPEC_TABLE.find((s) => s.id === specId)?.classId;
}

interface TreeDesc {
  key: string;
  kind: TreeKind;
  classId: ClassId;
  specId?: SpecId;
  name: string;
}

const RAW_FILES: Record<ClassId, RawClassFile> = {
  knight,
  barbarian,
  mage,
  rogue,
  monk,
  archer,
  paladin,
  necromancer,
  warlock,
};

const TREE_DESCS: readonly TreeDesc[] = [
  ...CLASS_TABLE.map((c): TreeDesc => ({ key: treeIdFor('class', c.id), kind: 'class', classId: c.id, name: c.name })),
  ...SPEC_TABLE.map((s): TreeDesc => ({
    key: treeIdFor('spec', s.classId, s.id),
    kind: 'spec',
    classId: s.classId,
    specId: s.id,
    name: s.name,
  })),
];

/** Every tree id of the registry (30 keys). */
export const TREE_KEYS: readonly string[] = TREE_DESCS.map((d) => d.key);

const built = new Map<string, TreeDef>();

function buildDesc(d: TreeDesc): TreeDef {
  const hit = built.get(d.key);
  if (hit) return hit;
  const file = RAW_FILES[d.classId];
  const raw = d.kind === 'class' ? file.class : d.specId ? file.specs[d.specId] : undefined;
  if (!raw) throw new Error(`talentTrees: no raw data for ${d.key} (generated by tools/gen-talent-data.mjs)`);
  const tree = buildTree(d.key, d.kind, d.classId, d.specId, d.name, raw);
  built.set(d.key, tree);
  return tree;
}

/** Lazy registry: each getter builds its tree on first access and caches it. */
export const TREES: Record<string, TreeDef> = {};
for (const d of TREE_DESCS) {
  Object.defineProperty(TREES, d.key, { enumerable: true, get: () => buildDesc(d) });
}

/** The tree of a class (`kind 'class'`, `id` = class id) or a spec (`kind 'spec'`, `id` = spec id); null if unknown. */
export function getTree(kind: TreeKind, id: string): TreeDef | null {
  const key = kind === 'class' ? `class:${id}` : `spec:${id}`;
  return Object.hasOwn(TREES, key) ? TREES[key] : null;
}
