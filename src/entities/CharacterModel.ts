import * as THREE from 'three';
import { G } from '../game/G';
import { Assets } from '../core/Assets';
import { applyPSXTexture } from '../render/psx';
import { shellMaterial } from '../vfx/Meshes';
import { registerClassRim } from '../vfx/TargetRim';
import { charLodPlan, getGfxQuality } from '../world/WorldPerf';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AnimController } from './AnimController';
import { disposeFlashClones, mapMeshMaterials } from './sharedMaterials';
import { getItemBase } from '../data/items';
import { CLASSES } from '../data/classes';
import type { ClassId, ResourceType } from '../types/common';
import type { EquipSlot, ItemBaseDef, ItemInstance } from '../types/items';

export type GearMap = Partial<Record<EquipSlot, ItemInstance>>;

export interface CharacterModelOpts {
  variant?: number;                                     // colour variant (palette recolour, see CHARACTER_VARIANTS)
  gear?: GearMap;                                       // visible weapon/offhand/helm. undefined = class default loadout
  tint?: number;                                        // optional extra 0xRRGGBB multiply on top of the variant
  hooded?: boolean;                                     // rogue only: Rogue_Hooded (default) or Rogue
  hideHelm?: boolean;                                   // "Kaskı gizle"
  siegeAura?: boolean;                                  // siege winner's gold aura on the main-hand weapon (SiegeRules.siegeGlow)
  shadow?: boolean;                                     // blob shadow (default true)
}

export interface CharacterModel {
  /** Add this to the scene / Actor.setModel(). Origin at the feet, faces +Z. */
  root: THREE.Object3D;
  anim: AnimController | null;
  classId: ClassId;
  /** Blob shadow object (child of root); Player lowers it while jumping. */
  shadow: THREE.Object3D | null;
  /** Swap visible weapon/offhand/helm (+ upgrade glow) without reloading. Resolves when attached weapon GLBs are in. */
  setGear(gear?: GearMap): Promise<void>;
  /** Re-colour the palette texture (variant 0 = original). */
  setVariant(variant: number, tint?: number): void;
  /** "Kaskı gizle" toggle at runtime (takes effect on the next setGear / immediately for the built-in helmet). */
  setHideHelm(hide: boolean): void;
  /** Siege winner aura on the main-hand weapon (faint gold shell); toggled in place, the weapon is not reloaded. */
  setSiegeAura(on: boolean): void;
  /**
   * Temporary "tool" loadout: show exactly these built-in nodes (e.g. ['1H_Crossbow'] for Arbalet Atışı, ['Spellbook_open']
   * for channels) and hide every other weapon. Pass null to restore the gear loadout.
   */
  setNodeOverride(names: string[] | null): void;
  /** Bone lookup by KayKit name: 'handslot.r', 'handslot.l', 'head', 'chest', 'hips', 'root'. */
  getBone(name: string): THREE.Object3D | null;
  /** Currently visible main-hand/off-hand weapon object (attached GLB or built-in node), null if none. */
  getWeaponRoot(slot?: 'weapon' | 'offhand'): THREE.Object3D | null;
  /** Empty marker at the weapon's tip (for trails / spark spawn). Falls back to the right hand bone. */
  getWeaponTip(slot?: 'weapon' | 'offhand'): THREE.Object3D | null;
  /** Frozen translucent copy of the current pose at the current world transform (dodge afterimages). Caller adds + fades + removes it. */
  createGhost(color?: number, opacity?: number): { object: THREE.Object3D; material: THREE.MeshBasicMaterial } | null;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------------------------------
// Class visual specs (fallback for data/classes.ts which the combat module owns)
// ---------------------------------------------------------------------------------------------------------------------

const KAYKIT = '/assets/models/characters/';
const V2 = KAYKIT + 'v2/';

/** Target standing height of a player model in metres (a human, next to ~2.4 m doors). */
export const CHARACTER_HEIGHT = 1.8;
/** Measured rest height of the KayKit Knight body (docs/ART_VOXEL_PSX.md: 2.31 m); the other heroes are within a few cm. */
export const KAYKIT_NATIVE_HEIGHT = 2.31;

interface ClassVisual {
  url: string;
  plainUrl?: string;
  /**
   * KayKit Adventurers 2.0 body (Rig_Medium, public/assets/models/characters/v2/): the file carries no clips and no weapon nodes.
   * The clips come from the shared Rig_Medium animation files (RIG2_ANIM_FILES, renamed to the 1.0 clip names) and the weapon /
   * shield nodes are stand-in holders loaded from /assets/models/weapons/ (STANDIN), so everything below works unchanged.
   */
  rig2?: boolean;
  /** Measured rest body height of this model (m); default KAYKIT_NATIVE_HEIGHT. The holder is scaled CHARACTER_HEIGHT / native. */
  native?: number;
  /** Extra built-in nodes toggled together with `helm` (e.g. the Knight 2.0 visor). */
  helmExtra?: string[];
  /** Built-in accessory nodes switched off for this class (e.g. the Ranger quiver on a druid). */
  hideNodes?: string[];
  /** The body already wears a quiver: a quiver off-hand item is not mounted twice. */
  hasQuiver?: boolean;
  resource: ResourceType;
  main: string[];        // default built-in right-hand nodes
  off: string[];         // default built-in left-hand nodes
  helm: string | null;
  shield: string | null; // built-in stand-in for shield items
}

export const CLASS_VISUALS: Record<ClassId, ClassVisual> = {
  knight: { url: KAYKIT + 'Knight.glb', resource: 'rage', main: ['1H_Sword'], off: ['Round_Shield'], helm: 'Knight_Helmet', shield: 'Round_Shield' },
  barbarian: { url: KAYKIT + 'Barbarian.glb', resource: 'rage', main: ['2H_Axe'], off: [], helm: 'Barbarian_Hat', shield: 'Barbarian_Round_Shield' },
  mage: { url: KAYKIT + 'Mage.glb', resource: 'mana', main: ['2H_Staff'], off: [], helm: 'Mage_Hat', shield: null },
  rogue: { url: KAYKIT + 'Rogue_Hooded.glb', plainUrl: KAYKIT + 'Rogue.glb', resource: 'energy', main: ['Knife'], off: ['Knife_Offhand'], helm: null, shield: null },
  // Class bodies (itch.io KayKit Adventurers 2.0 + Character Animations, docs/assets/credits-itch.md). A class keeps one of the five
  // 1.0 bodies above or gets a Rig_Medium 2.0 body (rig2), so the 14 classes read as 12 different silhouettes.
  monk: { url: KAYKIT + 'Rogue.glb', resource: 'energy', main: [], off: [], helm: null, shield: null },
  archer: { url: V2 + 'Ranger.glb', rig2: true, native: 2.275, hasQuiver: true, resource: 'focus', main: [], off: [], helm: null, shield: null },
  paladin: { url: V2 + 'Knight.glb', rig2: true, native: 2.284, resource: 'faith', main: ['1H_Sword'], off: [], helm: 'Knight_Helmet', helmExtra: ['Knight_HelmetVisor'], shield: 'Round_Shield' },
  necromancer: { url: V2 + 'Rogue_Hooded.glb', rig2: true, native: 2.173, resource: 'essence', main: ['2H_Staff'], off: [], helm: null, shield: null },
  warlock: { url: V2 + 'Mage.glb', rig2: true, native: 2.162, resource: 'mana', main: [], off: [], helm: 'Mage_Hat', shield: null },
  demonhunter: { url: V2 + 'Rogue.glb', rig2: true, native: 2.18, resource: 'fury', main: [], off: [], helm: null, shield: null },
  evoker: { url: KAYKIT + 'Mage.glb', resource: 'mana', main: ['2H_Staff'], off: [], helm: 'Mage_Hat', shield: null },
  priest: { url: V2 + 'Mage.glb', rig2: true, native: 2.162, resource: 'mana', main: ['2H_Staff'], off: [], helm: null, shield: null },
  shaman: { url: V2 + 'Barbarian.glb', rig2: true, native: 2.186, resource: 'mana', main: [], off: [], helm: 'Barbarian_BearHat', shield: null },
  druid: { url: V2 + 'Ranger.glb', rig2: true, native: 2.275, hideNodes: ['Ranger_Quiver'], resource: 'mana', main: [], off: [], helm: null, shield: null },
};

/**
 * Class identity on the shared KayKit rigs: an accent colour for the rim (Ui class colour), and size multipliers for the helm and
 * the weapon so the silhouettes differ (a tall mage hat, a heavy barbarian axe, the rogue's short blades). Multipliers apply to the
 * body's own accessory nodes and to the attached gear, never to the body or the bones.
 */
export interface ClassLook { accent: number; helm: number; weapon: number }
export const CLASS_LOOK: Record<ClassId, ClassLook> = {
  knight: { accent: 0xffd060, helm: 1, weapon: 1 },
  barbarian: { accent: 0xff5a3c, helm: 1.06, weapon: 1.08 },
  mage: { accent: 0x9a7bff, helm: 1.12, weapon: 1.04 },
  rogue: { accent: 0x5ee89a, helm: 1, weapon: 0.9 },
  monk: { accent: 0xffb24a, helm: 1.04, weapon: 0.96 },
  archer: { accent: 0x9fd86a, helm: 1, weapon: 1.02 },
  paladin: { accent: 0xfff2a0, helm: 1, weapon: 1.02 },
  necromancer: { accent: 0x5fd8c8, helm: 1.1, weapon: 1.02 },
  warlock: { accent: 0xb050ff, helm: 1, weapon: 1 },
  demonhunter: { accent: 0xff3a78, helm: 1, weapon: 0.94 },
  evoker: { accent: 0x4ac8ff, helm: 1.08, weapon: 1.02 },
  priest: { accent: 0xfff7d0, helm: 1.08, weapon: 1 },
  shaman: { accent: 0x3ad0c0, helm: 1.06, weapon: 1 },
  druid: { accent: 0x9fdc5a, helm: 1.04, weapon: 0.96 },
};

const classRimMats = new Map<number, THREE.ShaderMaterial>();
/** Class rim range of a player model (m): a remote player beyond it shows no class rim (TargetRim cullClassRims). */
export const PLAYER_RIM_RANGE = 25;
/**
 * Class rim: a thin fresnel shell in the class accent over every skinned mesh of a KayKit body, so the silhouette reads against the
 * voxel world (the same shell the target rim uses, bound to the body's own skeleton). Shells are `vfxShell`, so variant swaps,
 * hit flashes and material copies leave them alone. Used by the player models and the town NPCs.
 * The shells are drawn only inside `range` metres of the local player and in view, and for CLASS_RIM_BODIES bodies at once
 * (TargetRim). 'lod' (the town NPCs) = the full character tier of CharacterLod: a mid or far NPC shows no rim.
 */
export function addClassRim(body: THREE.Object3D, accent: number, range: number | 'lod' = 'lod'): void {
  let mat = classRimMats.get(accent);
  if (!mat) {
    mat = shellMaterial(accent, { power: 2.6, inflate: 0.012, alpha: 0.5, base: 0, additive: false });
    classRimMats.set(accent, mat);
  }
  const shells: THREE.Mesh[] = [];
  body.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.skeleton || o.userData.vfxShell) return;
    const shell = new THREE.SkinnedMesh(sm.geometry, mat);
    shell.bind(sm.skeleton, sm.bindMatrix);
    shell.userData.vfxShell = true;
    shell.renderOrder = 11;
    shell.frustumCulled = false;
    shell.castShadow = false;
    shell.receiveShadow = false;
    sm.add(shell);
    shells.push(shell);
  });
  registerClassRim(body, shells, typeof range === 'number' ? () => range : () => charLodPlan(getGfxQuality()).full);
}

/** Every toggleable weapon-ish node on the KayKit rigs (capes are never toggled). */
const WEAPON_NODES = new Set([
  '1H_Sword', '2H_Sword', '1H_Axe', '2H_Axe', 'Mug', '2H_Staff', '1H_Wand', 'Knife', '1H_Crossbow', '2H_Crossbow', 'Throwable',
  'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand', '1H_Axe_Offhand', 'Barbarian_Round_Shield',
  'Spellbook', 'Spellbook_open', 'Knife_Offhand',
]);
const HELM_NODES = new Set(['Knight_Helmet', 'Knight_HelmetVisor', 'Barbarian_Hat', 'Barbarian_BearHat', 'Mage_Hat']);
// toggled by name (applyVisibility / setNodeOverride): these KayKit nodes must never be merged into the body mesh
Assets.keepNodeNames([...WEAPON_NODES, ...HELM_NODES, 'Ranger_Quiver']);

/** Built-in node used as a stand-in when an item has no model GLB, by item category. */
const MAIN_STANDIN: Record<string, string[]> = {
  sword1h: ['1H_Sword'], sword2h: ['2H_Sword'], axe1h: ['1H_Axe'], axe2h: ['2H_Axe'], mace: ['1H_Sword'],
  staff: ['2H_Staff'], wand: ['1H_Wand'], dagger: ['Knife'], crossbow: ['2H_Crossbow'], bow: ['2H_Crossbow'],
};
const OFF_STANDIN: Record<string, string[]> = {
  sword1h: ['1H_Sword_Offhand'], axe1h: ['1H_Axe_Offhand'], dagger: ['Knife_Offhand'], tome: ['Spellbook'],
};
const TWO_HANDED = new Set(['sword2h', 'axe2h', 'staff', 'bow', 'crossbow']);

// ---------------------------------------------------------------------------------------------------------------------
// Attachment transforms (KayKit handslot conventions from docs/assets/characters.md 1.1; generated weapons share them:
// grip at origin, blade/head along +Y, crossbows along +Z, shields face +Z)
// ---------------------------------------------------------------------------------------------------------------------

type BoneName = 'handslot.r' | 'handslot.l' | 'head' | 'chest';
interface Attach {
  bone: BoneName;
  pos: [number, number, number];
  rotY?: number;
  quat?: [number, number, number, number];
}

const PI = Math.PI;
const ATTACH: Record<string, Attach> = {
  // KayKit separate weapon files (modelled with the head toward -X, the embedded nodes rotate them by PI around Y)
  blade: { bone: 'handslot.r', pos: [0, 0.0333, 0], rotY: PI },
  stick: { bone: 'handslot.r', pos: [0, 0, 0], rotY: PI },
  // Blender-generated weapons (assets/models/gen): grip at the origin, head/edge toward +X, i.e. already in the final
  // bone frame (the KayKit embedded rotation ends with the head at +X as well, so NO extra rotation here).
  genBlade: { bone: 'handslot.r', pos: [0, 0, 0] },
  crossbow: { bone: 'handslot.r', pos: [-0.105, -0.01, 0], rotY: PI / 2 },
  offBlade: { bone: 'handslot.l', pos: [0, 0.025, 0] },
  // the left hand bone is the mirror of the right one (its local +X points up where the right one's points down in the idle
  // pose), so the same head-toward-+X model needs half a turn to hang the same way as in the right hand
  genOffBlade: { bone: 'handslot.l', pos: [0, 0, 0], rotY: PI },
  shield: { bone: 'handslot.l', pos: [0, 0.017, 0.05] },
  bookClosed: { bone: 'handslot.l', pos: [0, 0.266, 0], quat: [0, -0.7071, -0.7071, 0] },
  bookOpen: { bone: 'handslot.l', pos: [0, 0.145, 0], quat: [0, -0.7071, -0.7071, 0] },
  helm: { bone: 'head', pos: [0, -0.026, 0] },
  quiver: { bone: 'chest', pos: [0, 0.05, -0.2], rotY: 0 },
};

function attachFor(base: ItemBaseDef | undefined, slot: 'weapon' | 'offhand' | 'helm', url: string): Attach {
  const cat = base?.category ?? '';
  const u = url.toLowerCase();
  const gen = u.includes('/gen/');
  if (slot === 'helm') return ATTACH.helm;
  if (slot === 'offhand') {
    if (cat === 'shield' || u.includes('shield')) return ATTACH.shield;
    if (cat === 'tome' || u.includes('spellbook') || u.includes('tome')) return u.includes('open') ? ATTACH.bookOpen : ATTACH.bookClosed;
    if (cat === 'quiver' || u.includes('quiver')) return ATTACH.quiver;
    return gen ? ATTACH.genOffBlade : ATTACH.offBlade;
  }
  if (cat === 'crossbow' || cat === 'bow' || u.includes('crossbow') || u.includes('/bow')) return ATTACH.crossbow;
  if (gen) return ATTACH.genBlade;
  if (cat === 'staff' || cat === 'wand' || cat === 'dagger' || u.includes('staff') || u.includes('wand') || u.includes('dagger')) return ATTACH.stick;
  return ATTACH.blade;
}

// ---------------------------------------------------------------------------------------------------------------------
// Rig_Medium (KayKit Adventurers 2.0) bodies: shared animation files and weapon stand-ins
// ---------------------------------------------------------------------------------------------------------------------

/** Shared Rig_Medium animation files (KayKit Character Animations 1.1). Each also carries a mannequin mesh that is never used. */
const RIG2_ANIM_FILES = ['General', 'MovementBasic', 'MovementAdvanced', 'CombatMelee', 'CombatRanged', 'Simulation'].map((n) => `${V2}anims/Rig_Medium_${n}.glb`);

/** 2.0 clip name -> the 1.0 name the game code looks up (AnimController.pick chains, combat clip tables). */
export function rig2ClipName(n: string): string {
  if (n === 'Idle_A') return 'Idle';
  if (n === 'Cheering') return 'Cheer';
  if (n === 'Waving') return 'Wave';
  let m = /^Melee_(1H|2H|Dualwield|Unarmed)_(.+)$/.exec(n);
  if (m) return m[1] + '_Melee_' + m[2];
  m = /^Melee_(Block.*)$/.exec(n);
  if (m) return m[1];
  m = /^Ranged_(1H|2H)_(.+)$/.exec(n);
  if (m) return m[1] + '_Ranged_' + m[2];
  switch (n) {
    case 'Ranged_Magic_Spellcasting': return 'Spellcasting';
    case 'Ranged_Magic_Spellcasting_Long': return 'Spellcast_Long';
    case 'Ranged_Magic_Raise': return 'Spellcast_Raise';
    case 'Ranged_Magic_Shoot': return 'Spellcast_Shoot';
    case 'Ranged_Magic_Summon': return 'Spellcast_Summon';
  }
  return n;
}

let rig2Clips: Promise<THREE.AnimationClip[]> | null = null;
/** All Rig_Medium clips under their 1.0 names (loaded once, shared by every 2.0 body; mixers never mutate clips). */
function loadRig2Clips(): Promise<THREE.AnimationClip[]> {
  rig2Clips ??= (async () => {
    const out: THREE.AnimationClip[] = [];
    const seen = new Set<string>();
    for (const url of RIG2_ANIM_FILES) {
      const a = await G.assets.load(url);
      if (!a) {
        warnOnce('anim:' + url, `[character] animation file failed to load: ${url}`);
        continue;
      }
      for (const c of a.clips) {
        if (c.name === 'T-Pose' || c.name.startsWith('EXPERIMENTAL')) continue;
        const name = rig2ClipName(c.name);
        if (seen.has(name)) continue;
        seen.add(name);
        const k = c.clone();
        k.name = name;
        out.push(k);
      }
    }
    // the 1.0 set has a second punch; 2.0 only ships one
    const punch = out.find((c) => c.name === 'Unarmed_Melee_Attack_Punch_A');
    if (punch && !seen.has('Unarmed_Melee_Attack_Punch_B')) {
      const k = punch.clone();
      k.name = 'Unarmed_Melee_Attack_Punch_B';
      out.push(k);
    }
    return out;
  })();
  return rig2Clips;
}

/**
 * The 1.0 bodies carry their weapons as named child nodes; a 2.0 body carries none. These stand-ins are holder nodes with the
 * same names on the same hand bones (the separate weapon meshes of /assets/models/weapons/ at the documented grip transforms),
 * so default loadouts, MAIN_STANDIN / OFF_STANDIN, visibility, size multipliers and weapon tips need no special case.
 */
const WEAPON_DIR = '/assets/models/weapons/';
type StandinAttach = 'blade' | 'stick' | 'crossbow' | 'offBlade' | 'shield' | 'bookClosed' | 'bookOpen';
const STANDIN: Record<string, { file: string; attach: StandinAttach; mirror?: boolean }> = {
  '1H_Sword': { file: 'sword_1handed', attach: 'blade' },
  '2H_Sword': { file: 'sword_2handed', attach: 'blade' },
  '1H_Axe': { file: 'axe_1handed', attach: 'blade' },
  '2H_Axe': { file: 'axe_2handed', attach: 'blade' },
  Knife: { file: 'dagger', attach: 'stick' },
  '2H_Staff': { file: 'staff', attach: 'stick' },
  '1H_Wand': { file: 'wand', attach: 'stick' },
  '1H_Crossbow': { file: 'crossbow_1handed', attach: 'crossbow' },
  '2H_Crossbow': { file: 'crossbow_2handed', attach: 'crossbow' },
  '1H_Sword_Offhand': { file: 'sword_1handed', attach: 'offBlade' },
  '1H_Axe_Offhand': { file: 'axe_1handed', attach: 'offBlade' },
  Knife_Offhand: { file: 'dagger', attach: 'offBlade', mirror: true },
  Round_Shield: { file: 'shield_round', attach: 'shield' },
  Badge_Shield: { file: 'shield_badge', attach: 'shield' },
  Spike_Shield: { file: 'shield_spikes', attach: 'shield' },
  Rectangle_Shield: { file: 'shield_square', attach: 'shield' },
  Barbarian_Round_Shield: { file: 'shield_round_barbarian', attach: 'shield' },
  Spellbook: { file: 'spellbook_closed', attach: 'bookClosed' },
  Spellbook_open: { file: 'spellbook_open', attach: 'bookOpen' },
};

/** Stand-in node names a 2.0 class can show: its default loadout, its shield and the stand-ins of its weapon / off-hand categories. */
function standinNames(classId: ClassId, spec: ClassVisual): string[] {
  const names = new Set<string>([...spec.main, ...spec.off]);
  if (spec.shield) names.add(spec.shield);
  const def = CLASSES[classId];
  for (const c of def?.weapons ?? []) for (const n of MAIN_STANDIN[c] ?? []) names.add(n);
  for (const c of def?.offhands ?? []) for (const n of OFF_STANDIN[c] ?? []) names.add(n);
  return [...names].filter((n) => STANDIN[n]);
}

const standinUrl = (name: string): string => WEAPON_DIR + STANDIN[name].file + '.gltf';

// ---------------------------------------------------------------------------------------------------------------------
// Colour variants (palette recolour). KayKit uses one palette texture per class; skin/leather/wood hues are protected.
// ---------------------------------------------------------------------------------------------------------------------

interface VariantDef {
  name: string;           // Turkish (same order/names as the menu's colour swatches)
  target: number;         // hue (deg) the class's dominant cloth colour is moved to (ignored for variant 0)
  trim: number;           // degrees added to gold/yellow trim (42..65 deg)
  sat: number;            // saturation multiplier for recoloured pixels
  val: number;            // brightness multiplier for recoloured + metal pixels
  metal?: [number, number, number]; // multiply tint for grey steel (0..1+ each)
  metalAmt: number;       // 0..1
  swatch: string;         // UI colour
}

/** Dominant cloth hue per class palette (red cape / blue tunic / purple robe / green hood). */
const ANCHOR_HUE: Record<ClassId, number> = {
  knight: 355, barbarian: 212, mage: 252, rogue: 152,
  // GDD_CLASSES_V2 §2.2–§6.2 paletteClass: monk barbarian, archer rogue, paladin knight, necromancer mage, warlock rogue
  monk: 212, archer: 152, paladin: 355, necromancer: 252, warlock: 152,
  // CM1: demonhunter paletteClass rogue (152), evoker paletteClass mage (252)
  demonhunter: 152, evoker: 252,
  // CLASS SCAFFOLD: paletteClass mage (252) for priest and shaman, rogue (152) for druid
  priest: 252, shaman: 252, druid: 152,
};
// NOTE: the 2.0 bodies (archer, paladin, necromancer, warlock, demonhunter, priest, shaman, druid) have their own palettes; the
// anchors above are the 1.0 hues of the palette class and are only approximate for them (variant hue shifts are relative).

export const CHARACTER_VARIANTS: VariantDef[] = [
  { name: 'Klasik', target: 0, trim: 0, sat: 1, val: 1, metalAmt: 0, swatch: '#e8e2d2' },
  { name: 'Kızıl', target: 4, trim: 0, sat: 1.1, val: 1, metal: [1.12, 0.72, 0.66], metalAmt: 0.45, swatch: '#d8604c' },
  { name: 'Zümrüt', target: 140, trim: 0, sat: 1, val: 0.95, metal: [0.8, 1.08, 0.85], metalAmt: 0.4, swatch: '#58b870' },
  { name: 'Safir', target: 218, trim: 0, sat: 1.05, val: 1, metal: [0.72, 0.85, 1.12], metalAmt: 0.5, swatch: '#5a82e0' },
  { name: 'Altın', target: 38, trim: 0, sat: 1.1, val: 1.05, metal: [1.12, 0.92, 0.45], metalAmt: 0.8, swatch: '#e0b840' },
  { name: 'Gölge', target: 272, trim: 12, sat: 0.75, val: 0.62, metal: [0.6, 0.56, 0.78], metalAmt: 0.7, swatch: '#8a70b0' },
];
export const CHARACTER_VARIANT_COUNT = CHARACTER_VARIANTS.length;
export const variantName = (i: number): string => CHARACTER_VARIANTS[((i % CHARACTER_VARIANT_COUNT) + CHARACTER_VARIANT_COUNT) % CHARACTER_VARIANT_COUNT].name;

const recolorCache = new Map<string, THREE.Texture>();
/** recoloured texture -> its original palette texture. */
const baseOf = new WeakMap<THREE.Texture, THREE.Texture>();

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max <= 0 ? 0 : d / max, max];
}

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [r + m, g + m, b + m];
}

function recolorTexture(src: THREE.Texture, variant: number, classId: ClassId): THREE.Texture | null {
  const v = CHARACTER_VARIANTS[variant];
  if (!v || variant === 0) return null;
  const key = `${src.uuid}|${variant}`;
  const cached = recolorCache.get(key);
  if (cached) return cached;
  const img = src.image as (CanvasImageSource & { width?: number; height?: number }) | null;
  if (!img || !img.width || !img.height || typeof document === 'undefined') return null;
  const w = img.width, h = img.height;
  const hueShift = v.target - ANCHOR_HUE[classId];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const [hh, ss, vv] = rgb2hsv(r, g, b);
      let or = r, og = g, ob = b;
      if (ss < 0.16) {
        // steel / white / black: tint toward the variant metal colour, preserving luminance
        if (v.metal) {
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) * v.val;
          or = r + (Math.min(1, lum * v.metal[0]) - r) * v.metalAmt;
          og = g + (Math.min(1, lum * v.metal[1]) - g) * v.metalAmt;
          ob = b + (Math.min(1, lum * v.metal[2]) - b) * v.metalAmt;
        } else if (v.val !== 1) {
          or = r * v.val; og = g * v.val; ob = b * v.val;
        }
      } else if (hh >= 8 && hh <= 40 && ss < 0.72) {
        // skin / leather / wood: protected (slightly darker for the dark variant)
        const k = v.val < 1 ? 0.7 + 0.3 * v.val : 1;
        or = r * k; og = g * k; ob = b * k;
      } else {
        const shift = hh >= 41 && hh <= 66 ? v.trim : hueShift;
        const [rr, gg, bb] = hsv2rgb(hh + shift, Math.min(1, ss * v.sat), Math.min(1, vv * v.val));
        or = rr; og = gg; ob = bb;
      }
      px[i] = Math.max(0, Math.min(255, Math.round(or * 255)));
      px[i + 1] = Math.max(0, Math.min(255, Math.round(og * 255)));
      px[i + 2] = Math.max(0, Math.min(255, Math.round(ob * 255)));
    }
    ctx.putImageData(data, 0, 0);
  } catch (e) {
    console.warn('[character] recolour failed', e);
    return null;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = src.flipY;
  tex.colorSpace = src.colorSpace;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.channel = src.channel;
  applyPSXTexture(tex, { mipmaps: false, textureColorBits: 5 });
  recolorCache.set(key, tex);
  baseOf.set(tex, src);
  return tex;
}

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  // GLTFLoader sanitises node names (PropertyBinding.sanitizeNodeName strips '.'), the raw name lives in userData.name.
  const sanitized = name.replace(/[.\[\]:/]/g, '');
  let found: THREE.Object3D | null = root.getObjectByName(sanitized) ?? root.getObjectByName(name) ?? null;
  if (!found) {
    root.traverse((o) => {
      if (!found && (o.userData?.name === name || o.name === name)) found = o;
    });
  }
  return found;
}

function tipOf(obj: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3();
  // measure in the object's own frame: temporarily detach transforms by working on geometry bounds
  let maxY = 0.9;
  let cx = 0;
  let cz = 0;
  let got = false;
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox!;
    const b = new THREE.Box3().copy(bb).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    box.union(b);
    got = true;
  });
  if (got && !box.isEmpty()) {
    maxY = box.max.y;
    cx = (box.min.x + box.max.x) / 2;
    cz = (box.min.z + box.max.z) / 2;
  }
  const tip = new THREE.Object3D();
  tip.name = 'WeaponTip';
  tip.position.set(cx, maxY * 0.94, cz);
  obj.add(tip);
  return tip;
}

const warned = new Set<string>();
function warnOnce(key: string, ...args: unknown[]): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(...args);
}

function itemModelUrl(item: ItemInstance | undefined): { base: ItemBaseDef | undefined; url: string | null } {
  if (!item) return { base: undefined, url: null };
  const base = getItemBase(item.baseId);
  return { base, url: base?.model ?? null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Builds a playable-class character model: KayKit GLB clone, default child meshes per class (show/hide weapons,
 * helmets, capes), weapon GLBs attached to `handslot.r` / `handslot.l` bones from gear (upgrade glow via
 * G.vfx.weaponGlow), colour variant tint, blob shadow. Used by Player.loadModel, MenuScene (select/create),
 * the character panel 3D preview and remote players.
 * OWNER: player module.
 */
export async function loadCharacterModel(classId: ClassId, opts: CharacterModelOpts = {}): Promise<CharacterModel> {
  const spec = CLASS_VISUALS[classId] ?? CLASS_VISUALS.knight;
  const url = classId === 'rogue' && opts.hooded === false && spec.plainUrl ? spec.plainUrl : spec.url;
  const asset = await G.assets.load(url);
  const holder = new THREE.Group();
  holder.name = `Character_${classId}`;
  const standins = spec.rig2 ? standinNames(classId, spec) : [];
  const extraClips = spec.rig2 && asset ? await loadRig2Clips() : [];
  if (standins.length) await Promise.all(standins.map((n) => G.assets.load(standinUrl(n))));
  // KayKit heroes are authored ~2.3 m tall; the player is a 1.8 m human, so a ~2.4 m door reads right beside them.
  // Scaling the holder (origin at the feet) keeps the feet on the ground and every bone / socket / weapon in proportion.
  holder.scale.setScalar(CHARACTER_HEIGHT / (spec.native ?? KAYKIT_NATIVE_HEIGHT));

  if (!asset) {
    warnOnce('model:' + url, `[character] model failed to load: ${url}`);
    const fallback = G.assets.instantiate(url); // placeholder box
    holder.add(fallback);
    return { root: holder, anim: null, classId, shadow: null, async setGear() {}, setVariant() {}, setHideHelm() {}, setSiegeAura() {}, setNodeOverride() {}, getBone: () => null, getWeaponRoot: () => null, getWeaponTip: () => null, createGhost: () => null, dispose() {} };
  }

  // the body keeps the model's materials until applyVariant swaps in the shared variant (no per-instance copies)
  const body = G.assets.instantiate(url);
  body.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) m.frustumCulled = false;
  });
  holder.add(body);
  const look = CLASS_LOOK[classId] ?? CLASS_LOOK.knight;
  addClassRim(body, look.accent, PLAYER_RIM_RANGE);
  const anim = new AnimController(body, extraClips.length ? [...asset.clips, ...extraClips] : asset.clips);

  const hand = { r: findBone(body, 'handslot.r'), l: findBone(body, 'handslot.l') };
  const bones: Record<string, THREE.Object3D | null> = {
    'handslot.r': hand.r, 'handslot.l': hand.l, head: findBone(body, 'head'), chest: findBone(body, 'chest'), hips: findBone(body, 'hips'), root: findBone(body, 'root'),
  };
  // 2.0 bodies: mount the stand-in weapon holders (named like the 1.0 embedded nodes) before the built-in node scan below
  for (const name of standins) {
    const def = STANDIN[name];
    const a = ATTACH[def.attach];
    const bone = bones[a.bone];
    if (!bone || !G.assets.has(standinUrl(name))) continue;
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...a.pos);
    if (a.quat) node.quaternion.set(...a.quat);
    else if (a.rotY) node.rotation.y = a.rotY;
    if (def.mirror) node.scale.x = -1;
    node.add(G.assets.instantiate(standinUrl(name)));
    bone.add(node);
  }
  for (const n of spec.hideNodes ?? []) {
    const o = findBone(body, n);
    if (o) o.visible = false;
  }

  // built-in accessory nodes by name (only those that exist on this rig)
  const builtin = new Map<string, THREE.Object3D>();
  body.traverse((o) => {
    if (WEAPON_NODES.has(o.name) || HELM_NODES.has(o.name)) builtin.set(o.name, o);
    // class silhouette: the built-in weapon / helm nodes take the class size multipliers (CLASS_LOOK)
    if (WEAPON_NODES.has(o.name)) o.scale.multiplyScalar(look.weapon);
    else if (HELM_NODES.has(o.name)) o.scale.multiplyScalar(look.helm);
  });
  const builtinTips = new Map<string, THREE.Object3D>();

  const shadow = opts.shadow === false ? null : G.vfx.blobShadow(0.85);
  if (shadow) {
    shadow.position.y = 0.03;
    holder.add(shadow);
  }

  // ---- state ----
  let gear: GearMap | undefined = opts.gear;
  let override: string[] | null = null;
  let variant = opts.variant ?? 0;
  let tint = opts.tint;
  let gearVersion = 0;
  let hideHelm = !!opts.hideHelm;
  let siegeAura = !!opts.siegeAura;
  const attached: { weapon?: THREE.Object3D; offhand?: THREE.Object3D; helm?: THREE.Object3D } = {};
  const attachedTips: { weapon?: THREE.Object3D; offhand?: THREE.Object3D } = {};
  let visibleBuiltin: { weapon: THREE.Object3D | null; offhand: THREE.Object3D | null } = { weapon: null, offhand: null };
  let disposed = false;

  const detach = (slot: 'weapon' | 'offhand' | 'helm') => {
    const o = attached[slot];
    if (!o) return;
    try {
      G.vfx.weaponGlow(o, 0);
    } catch { /* ignore */ }
    o.removeFromParent();
    disposeFlashClones(o); // gear draws the model's materials: only VFX flash clones are ours to free
    delete attached[slot];
    if (slot !== 'helm') delete attachedTips[slot];
  };

  const mountAttached = async (slot: 'weapon' | 'offhand' | 'helm', item: ItemInstance, version: number): Promise<boolean> => {
    const { base, url: mUrl } = itemModelUrl(item);
    if (!mUrl) return false;
    const a = attachFor(base, slot, mUrl);
    const bone = bones[a.bone];
    if (!bone) return false;
    const loaded = await G.assets.load(mUrl);
    if (disposed || version !== gearVersion) return true; // superseded: pretend handled
    if (!loaded) {
      warnOnce('item:' + mUrl, `[character] item model failed: ${mUrl}`);
      return false;
    }
    const obj = G.assets.instantiate(mUrl); // gear is never tinted per instance: it draws the model's materials
    obj.name = `Gear_${slot}`;
    obj.position.set(...a.pos);
    if (a.quat) obj.quaternion.set(...a.quat);
    else if (a.rotY) obj.rotation.y = a.rotY;
    // class size multiplier (CLASS_LOOK): the main-hand gear and the helm, not the off-hand
    if (slot !== 'offhand') obj.scale.multiplyScalar(slot === 'helm' ? look.helm : look.weapon);
    // offhand daggers mirror so the blade edge matches the main hand
    if (slot === 'offhand' && a === ATTACH.offBlade && (base?.category === 'dagger' || mUrl.includes('dagger'))) obj.scale.x = -1;
    bone.add(obj);
    attached[slot] = obj;
    if (slot !== 'helm') attachedTips[slot] = tipOf(obj);
    const up = item.upgrade ?? 0;
    try {
      G.vfx.weaponGlow(obj, slot === 'helm' ? 0 : up, slot === 'weapon' && siegeAura);
    } catch (e) {
      console.warn('[character] weaponGlow failed', e);
    }
    return true;
  };

  const builtinNodeFor = (list: string[]): THREE.Object3D | null => {
    for (const n of list) {
      const o = builtin.get(n);
      if (o) return o;
    }
    return null;
  };

  /** Recompute which built-in nodes are visible (attached GLBs are always visible when present). */
  const applyVisibility = () => {
    for (const o of builtin.values()) o.visible = false;
    visibleBuiltin = { weapon: null, offhand: null };
    for (const slot of ['weapon', 'offhand', 'helm'] as const) {
      const a = attached[slot];
      if (a) a.visible = !override;
    }
    if (override) {
      for (const n of override) {
        const o = builtin.get(n);
        if (o) o.visible = true;
      }
      visibleBuiltin.weapon = builtinNodeFor(override);
      return;
    }
    const useDefaults = gear === undefined;
    const wItem = gear?.weapon;
    const oItem = gear?.offhand;
    const wBase = wItem ? getItemBase(wItem.baseId) : undefined;
    const twoHanded = wBase ? !!wBase.twoHanded || TWO_HANDED.has(wBase.category) : useDefaults ? spec.off.length === 0 : false;

    // main hand
    if (!attached.weapon) {
      let nodes: string[] = [];
      if (useDefaults) nodes = spec.main;
      else if (wItem) nodes = (wBase && MAIN_STANDIN[wBase.category]) || spec.main;
      let first: THREE.Object3D | null = null;
      for (const n of nodes) {
        const o = builtin.get(n);
        if (o) {
          o.visible = true;
          first ??= o;
        }
      }
      // a stand-in that does not exist on this rig (e.g. 1H_Wand on the Knight) falls back to the class default
      if (!first && (useDefaults || wItem)) {
        for (const n of spec.main) {
          const o = builtin.get(n);
          if (o) {
            o.visible = true;
            first ??= o;
          }
        }
      }
      visibleBuiltin.weapon = first;
    }
    // off hand
    if (!attached.offhand && !twoHanded) {
      let nodes: string[] = [];
      if (useDefaults) nodes = spec.off;
      else if (oItem) {
        const ob = getItemBase(oItem.baseId);
        if (ob?.category === 'shield') nodes = spec.shield ? [spec.shield] : [];
        else nodes = (ob && OFF_STANDIN[ob.category]) || spec.off;
      }
      let first: THREE.Object3D | null = null;
      for (const n of nodes) {
        const o = builtin.get(n);
        if (o) {
          o.visible = true;
          first ??= o;
        }
      }
      visibleBuiltin.offhand = first;
    }
    // helm
    if (!attached.helm && spec.helm && !hideHelm) {
      const show = useDefaults || !!gear?.helm;
      for (const n of [spec.helm, ...(spec.helmExtra ?? [])]) {
        const o = builtin.get(n);
        if (o) o.visible = show;
      }
    }
  };

  const applyVariant = () => {
    // one shared material per palette material and variant / tint (Assets.sharedMaterial). The palette is resolved from the
    // source material, so a material another party re-cloned still recolours from the original palette texture.
    mapMeshMaterials(body, (src) => {
      const sm = src as THREE.MeshStandardMaterial;
      const base = sm.map ? baseOf.get(sm.map) ?? sm.map : null;
      const rec = base ? recolorTexture(base, variant, classId) : null;
      return Assets.sharedMaterial(sm, `variant|${variant}|${tint ?? ''}`, (c) => {
        const m = c as THREE.MeshStandardMaterial;
        m.map = rec ?? base;
        if (m.color) m.color.setHex(tint ?? 0xffffff);
      });
    });
  };

  const setGear = async (g?: GearMap): Promise<void> => {
    gear = g;
    const version = ++gearVersion;
    const jobs: Promise<boolean>[] = [];
    const off = g?.offhand;
    const skipOff = !!spec.hasQuiver && !!off && getItemBase(off.baseId)?.category === 'quiver'; // the Ranger body wears its own quiver
    const want: Record<'weapon' | 'offhand' | 'helm', ItemInstance | undefined> = { weapon: g?.weapon, offhand: skipOff ? undefined : off, helm: hideHelm ? undefined : g?.helm };
    for (const slot of ['weapon', 'offhand', 'helm'] as const) {
      const item = want[slot];
      const cur = attached[slot];
      const curUid = (cur?.userData as { uid?: string } | undefined)?.uid;
      if (!item || !itemModelUrl(item).url) {
        detach(slot);
        continue;
      }
      if (cur && curUid === item.uid && (cur.userData as { upgrade?: number }).upgrade === (item.upgrade ?? 0)) continue;
      if (cur && curUid === item.uid) {
        // same item, new upgrade level: refresh the glow only
        (cur.userData as { upgrade?: number }).upgrade = item.upgrade ?? 0;
        try {
          G.vfx.weaponGlow(cur, slot === 'helm' ? 0 : item.upgrade ?? 0, slot === 'weapon' && siegeAura);
        } catch { /* ignore */ }
        continue;
      }
      detach(slot);
      jobs.push(
        mountAttached(slot, item, version).then((ok) => {
          const o = attached[slot];
          if (o) {
            (o.userData as { uid?: string; upgrade?: number }).uid = item.uid;
            (o.userData as { uid?: string; upgrade?: number }).upgrade = item.upgrade ?? 0;
          }
          return ok;
        }),
      );
    }
    // show built-in stand-ins right away (also covers items without models); attached GLBs pop in when loaded
    applyVisibility();
    if (jobs.length) {
      await Promise.all(jobs);
      if (!disposed && version === gearVersion) applyVisibility();
    }
  };

  applyVariant();
  applyVisibility();
  // hide the whole built-in set until gear finished loading when real items are given (avoids a flash of the default weapon)
  if (gear) await setGear(gear);

  const tipFor = (o: THREE.Object3D | null): THREE.Object3D | null => {
    if (!o) return null;
    let t = builtinTips.get(o.uuid);
    if (!t) {
      t = tipOf(o);
      builtinTips.set(o.uuid, t);
    }
    return t;
  };

  const model: CharacterModel = {
    root: holder,
    anim,
    classId,
    shadow,
    setGear,
    setVariant(v: number, t?: number) {
      variant = v;
      if (t !== undefined) tint = t;
      applyVariant();
    },
    setHideHelm(hide: boolean) {
      if (hide === hideHelm) return;
      hideHelm = hide;
      void setGear(gear);
    },
    setSiegeAura(on: boolean) {
      if (on === siegeAura) return;
      siegeAura = on;
      const w = attached.weapon;
      if (w) G.vfx.weaponGlow(w, (w.userData as { upgrade?: number }).upgrade ?? 0, on);
    },
    setNodeOverride(names: string[] | null) {
      override = names && names.length ? names : null;
      applyVisibility();
    },
    getBone(name: string) {
      return bones[name] ?? findBone(body, name);
    },
    getWeaponRoot(slot = 'weapon') {
      if (override) return visibleBuiltin.weapon;
      return attached[slot] ?? (slot === 'weapon' ? visibleBuiltin.weapon : visibleBuiltin.offhand);
    },
    getWeaponTip(slot = 'weapon') {
      if (!override && attachedTips[slot]) return attachedTips[slot]!;
      const root = override ? visibleBuiltin.weapon : slot === 'weapon' ? visibleBuiltin.weapon : visibleBuiltin.offhand;
      return tipFor(root) ?? (slot === 'weapon' ? hand.r : hand.l);
    },
    createGhost(color = 0x9fd8ff, opacity = 0.35) {
      try {
        const g = SkeletonUtils.clone(body);
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        g.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.material = material;
          m.castShadow = false;
          m.receiveShadow = false;
          m.frustumCulled = false;
          m.renderOrder = 5;
        });
        body.updateWorldMatrix(true, false);
        body.matrixWorld.decompose(g.position, g.quaternion, g.scale);
        return { object: g, material };
      } catch (e) {
        console.warn('[character] ghost failed', e);
        return null;
      }
    },
    dispose() {
      disposed = true;
      gearVersion++;
      for (const slot of ['weapon', 'offhand', 'helm'] as const) detach(slot);
      anim.dispose();
      holder.removeFromParent();
      disposeFlashClones(body); // the body's shared variants stay alive for the other characters
    },
  };
  return model;
}

/**
 * All model URLs needed for a class (preloading): the KayKit GLB, the models of its starting items and (when the selected
 * character is of this class) the models of the currently equipped weapon / off-hand / helm so nothing pops in late.
 */
export function characterAssetUrls(classId: ClassId): string[] {
  const spec = CLASS_VISUALS[classId] ?? CLASS_VISUALS.knight;
  const urls = new Set<string>([spec.url]);
  if (spec.rig2) {
    for (const u of RIG2_ANIM_FILES) urls.add(u);
    for (const n of standinNames(classId, spec)) urls.add(standinUrl(n));
  }
  const def = CLASSES[classId];
  for (const id of def?.startingItems ?? []) {
    const m = getItemBase(id)?.model;
    if (m) urls.add(m);
  }
  try {
    const ch = G.character;
    if (ch && ch.classId === classId) {
      const eq = ch.save.equipment ?? {};
      for (const slot of ['weapon', 'offhand', 'helm'] as const) {
        const it = eq[slot];
        const m = it ? getItemBase(it.baseId)?.model : undefined;
        if (m) urls.add(m);
      }
    }
  } catch { /* character not ready */ }
  return [...urls];
}

/** Resource type of a class (fallback when data/classes.ts is not filled yet). */
export function classResource(classId: ClassId): ResourceType {
  return CLASSES[classId]?.resource ?? CLASS_VISUALS[classId]?.resource ?? 'mana';
}
