import * as THREE from 'three';
import { G } from '../game/G';
import { Assets } from '../core/Assets';
import { AnimController } from '../entities/AnimController';
import { loadCharacterModel } from '../entities/CharacterModel';
import { copyMeshMaterials, disposeFlashClones, mapMeshMaterials } from '../entities/sharedMaterials';
import type { ClassId } from '../types/common';
import { disposeSkeletons, setEmissiveHighlight } from './SceneKit';
import { VARIANTS } from '../ui/menu/classInfo';
import { CHARACTER_ACCESSORY_NODES } from '../entities/CharacterLod';

/**
 * A displayable class character (menu stands, creation pedestal). Prefers the player module's
 * loadCharacterModel(); if that returns nothing usable (stub / failure) it falls back to a direct KayKit GLB
 * clone with the documented default accessory set, so the menu always shows real characters.
 * OWNER: scenes module.
 */
export interface CharVisual {
  root: THREE.Object3D;
  anim: AnimController | null;
  classId: ClassId;
  variant: number;
  /** Emissive rim/pulse highlight (0 = off). */
  highlight(amount: number, color?: number): void;
  dispose(): void;
}

/** Classes without a preset here (new ClassIds whose models are not in yet) stand in as the knight. */
const MODEL_FILE: Partial<Record<ClassId, string>> = {
  knight: 'Knight', barbarian: 'Barbarian', mage: 'Mage', rogue: 'Rogue',
  // WP-01: the necromancer is the Mage rig (bone palette), the warlock the hooded Rogue rig
  necromancer: 'Mage', warlock: 'Rogue_Hooded',
  // WP-02: the keşiş is the bare-fisted Barbarian rig (no cape/axe), the okçu the unhooded Rogue rig (bow + quiver attach at equip time)
  monk: 'Barbarian', archer: 'Rogue',
  // AE-3 / AE-4: the demon hunter is the hooded Rogue rig (blindfold + glaives are gear / recolour), the evoker the Mage rig in dragon scale tint
  demonhunter: 'Rogue_Hooded', evoker: 'Mage',
};

const ACCESSORY_NAMES = CHARACTER_ACCESSORY_NODES;

const DEFAULT_VISIBLE: Partial<Record<ClassId, string[]>> = {
  knight: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'],
  barbarian: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'],
  mage: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'],
  rogue: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
  necromancer: ['2H_Staff', 'Mage_Cape'],
  warlock: ['Rogue_Cape'],
  monk: [],
  archer: ['Rogue_Cape'],
  demonhunter: ['Rogue_Cape'],
  evoker: ['2H_Staff', 'Mage_Cape'],
};

export const classModelUrl = (classId: ClassId): string => `/assets/models/characters/${MODEL_FILE[classId] ?? MODEL_FILE.knight}.glb`;

/** Show only `visible` of the known KayKit accessory nodes on a character root. */
export function setAccessories(root: THREE.Object3D, visible: string[]): void {
  root.traverse((o) => {
    if (ACCESSORY_NAMES.includes(o.name)) o.visible = visible.includes(o.name);
  });
}

/** Sets every mesh colour under `root` to `hex`: one shared material per model material and tint (Assets.sharedMaterial). */
export function tintObject(root: THREE.Object3D, hex: number): void {
  mapMeshMaterials(root, (src) =>
    Assets.sharedMaterial(src, `tint|${hex}`, (c) => {
      const m = c as THREE.MeshStandardMaterial;
      if (m.color) m.color.set(hex);
    }),
  );
}

export async function createCharacterVisual(classId: ClassId, variant = 0): Promise<CharVisual> {
  let root: THREE.Object3D | null = null;
  let anim: AnimController | null = null;
  try {
    const m = await loadCharacterModel(classId, { variant });
    if (m.root && m.root.children.length > 0 && m.anim) {
      root = m.root;
      anim = m.anim;
    }
  } catch (e) {
    console.warn('[scenes] loadCharacterModel failed, using fallback', e);
  }
  if (!root) {
    const url = classModelUrl(classId);
    await G.assets.load(url);
    const obj = G.assets.instantiate(url);
    setAccessories(obj, DEFAULT_VISIBLE[classId] ?? DEFAULT_VISIBLE.knight ?? []);
    tintObject(obj, VARIANTS[variant % VARIANTS.length].tint);
    obj.traverse((o) => {
      const mm = o as THREE.SkinnedMesh;
      if (mm.isSkinnedMesh) mm.frustumCulled = false;
    });
    const shadow = G.vfx.blobShadow(0.9);
    if (shadow) obj.add(shadow);
    root = obj;
    anim = new AnimController(obj, G.assets.clips(url));
  }
  // the highlight pulse writes emissive per stand: it gets its own copies, the shared tint / variant materials stay untouched
  const rootRef = root;
  const highlightCopies = copyMeshMaterials(rootRef);
  const vis: CharVisual = {
    root: rootRef,
    anim,
    classId,
    variant,
    highlight(amount, color = 0xffd27a) {
      setEmissiveHighlight(rootRef, color, amount);
    },
    dispose() {
      anim?.dispose();
      rootRef.removeFromParent();
      for (const s of highlightCopies) for (const m of s.copies) m.dispose();
      disposeFlashClones(rootRef);
      disposeSkeletons(rootRef); // every stand / pedestal rebuild used to leak the rig's bone texture
    },
  };
  anim?.setBase(anim.pick('Idle', 'Unarmed_Idle') ?? 'Idle', { fade: 0 });
  return vis;
}
