import * as THREE from 'three';

/**
 * Billboard stand-in of a far town character (CharacterLod tier `billboard`): one textured quad per NPC, a white silhouette tinted with
 * the NPC's costume colour. One silhouette texture and one material per colour are shared by every billboard, so a far NPC is a single
 * draw call of two triangles. Feet at the origin, 0.9 m wide and 2.4 m tall before the caller's scale.
 */
let silhouette: THREE.CanvasTexture | null = null;
const materials = new Map<number, THREE.SpriteMaterial>();

function silhouetteTexture(): THREE.CanvasTexture {
  if (silhouette) return silhouette;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(16, 12, 7, 0, Math.PI * 2); // head
    g.fill();
    g.fillRect(8, 22, 16, 26); // torso
    g.fillRect(9, 48, 6, 16); // legs
    g.fillRect(17, 48, 6, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  silhouette = t;
  return t;
}

/** A billboard sprite of one colour (the material is shared by every sprite of that colour). */
export function characterBillboard(color: number): THREE.Sprite {
  let mat = materials.get(color);
  if (!mat) {
    mat = new THREE.SpriteMaterial({ map: silhouetteTexture(), color, alphaTest: 0.5 });
    materials.set(color, mat);
  }
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0);
  s.name = 'npcBillboard';
  return s;
}
