import * as THREE from 'three';
import { G } from '../game/G';
import { Assets } from '../core/Assets';
import { AnimController } from '../entities/AnimController';
import { loadCharacterModel } from '../entities/CharacterModel';
import type { ClassId } from '../types/common';
import { disposeSkeletons, setEmissiveHighlight } from './SceneKit';
import { VARIANTS } from '../ui/menu/classInfo';

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
};

const ACCESSORY_NAMES = [
  '1H_Sword', '2H_Sword', 'Round_Shield', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '1H_Sword_Offhand', 'Knight_Helmet', 'Knight_Cape',
  '2H_Axe', '1H_Axe', 'Mug', '1H_Axe_Offhand', 'Barbarian_Round_Shield', 'Barbarian_Hat', 'Barbarian_Cape',
  '2H_Staff', '1H_Wand', 'Spellbook', 'Spellbook_open', 'Mage_Hat', 'Mage_Cape',
  'Knife', 'Knife_Offhand', 'Rogue_Cape', '1H_Crossbow', '2H_Crossbow', 'Throwable',
];

const DEFAULT_VISIBLE: Partial<Record<ClassId, string[]>> = {
  knight: ['1H_Sword', 'Round_Shield', 'Knight_Helmet', 'Knight_Cape'],
  barbarian: ['2H_Axe', 'Barbarian_Hat', 'Barbarian_Cape'],
  mage: ['2H_Staff', 'Mage_Hat', 'Mage_Cape'],
  rogue: ['Knife', 'Knife_Offhand', 'Rogue_Cape'],
};

export const classModelUrl = (classId: ClassId): string => `/assets/models/characters/${MODEL_FILE[classId] ?? MODEL_FILE.knight}.glb`;

/** Show only `visible` of the known KayKit accessory nodes on a character root. */
export function setAccessories(root: THREE.Object3D, visible: string[]): void {
  root.traverse((o) => {
    if (ACCESSORY_NAMES.includes(o.name)) o.visible = visible.includes(o.name);
  });
}

export function tintObject(root: THREE.Object3D, hex: number): void {
  const c = new THREE.Color(hex);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list as THREE.MeshStandardMaterial[]) if (mat && mat.color) mat.color.copy(c);
  });
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
    Assets.cloneMaterials(obj);
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
  } else {
    // unique materials per instance so highlight/tint never leaks to sibling stands
    Assets.cloneMaterials(root);
  }
  const rootRef = root;
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
      disposeSkeletons(rootRef); // every stand / pedestal rebuild used to leak the rig's bone texture
    },
  };
  anim?.setBase(anim.pick('Idle', 'Unarmed_Idle') ?? 'Idle', { fade: 0 });
  return vis;
}
