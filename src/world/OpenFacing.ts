import * as THREE from 'three';

/**
 * Open-world spawn facing (WoW: a fresh arrival looks at open ground, not at a portal or a wall). The map's own start facing can
 * put the exit portal four metres ahead of the player, so the first view is a dark block. This scores 24 headings from the spawn:
 *  - props / scenery within REACH metres, by bearing: ahead (inside the view cone) costs most, sideways less, and behind-the-player
 *    costs too, because the orbit camera sits there and a prop next to it fills the lens;
 *  - the nav clear run of three forward rays (walls, cliffs, water) as a second term.
 * The designer's facing wins ties (a 0.1 margin). Pure geometry: no scene state is changed. OWNER: world module.
 */

const STEPS = 24;
const REACH = 12;
const VIEW_CONE = 0.75; // rad: a prop this close to the heading fills the first view
const SIDE_CONE = 1.9; // rad: beyond this the prop is behind the player, next to the orbit camera
const NAV_RAYS = [-0.5, 0, 0.5];
const PREFER_MARGIN = 0.1;

/** A round obstacle on the ground plane: world x / z centre and radius (m). */
export interface FacingObstacle {
  x: number;
  z: number;
  r: number;
}

/** Nav grid as used here: raycast returns the clear fraction of a->b (1 = open). */
export interface FacingNav {
  raycast(ax: number, az: number, bx: number, bz: number): number;
}

const _box = new THREE.Box3();

/** Horizontal circles of the objects (world box centre, half-diagonal of the xz footprint). */
export function obstaclesOf(objects: THREE.Object3D[]): FacingObstacle[] {
  const out: FacingObstacle[] = [];
  for (const o of objects) {
    _box.setFromObject(o);
    if (_box.isEmpty()) continue;
    const cx = (_box.min.x + _box.max.x) / 2;
    const cz = (_box.min.z + _box.max.z) / 2;
    const r = Math.hypot(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2;
    out.push({ x: cx, z: cz, r });
  }
  return out;
}

function wrap(a: number): number {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
}

/** Clear run (m, up to REACH) of a ray from (x, z) along the game yaw `yaw` (forward = (sin, cos)). */
function clearRun(nav: FacingNav, x: number, z: number, yaw: number): number {
  return nav.raycast(x, z, x + Math.sin(yaw) * REACH, z + Math.cos(yaw) * REACH) * REACH;
}

/** Facing (rad, the game's yaw) with the least clutter in view from (x, z). `preferred` is the designer's facing. */
export function openGroundYaw(nav: FacingNav, x: number, z: number, obstacles: FacingObstacle[], preferred: number): number {
  const cost = (yaw: number): number => {
    let c = 0;
    for (const o of obstacles) {
      const dx = o.x - x, dz = o.z - z;
      const d = Math.max(0.5, Math.hypot(dx, dz) - o.r);
      if (d >= REACH) continue;
      const rel = Math.abs(wrap(Math.atan2(dx, dz) - yaw));
      const w = (REACH - d) / REACH;
      if (rel < VIEW_CONE) c += 2 * w;
      else if (rel > SIDE_CONE) c += w;
      else c += 0.4 * w;
    }
    let blocked = 0;
    for (const a of NAV_RAYS) blocked += (REACH - clearRun(nav, x, z, yaw + a)) / REACH / NAV_RAYS.length;
    return c + 1.5 * blocked;
  };
  let best = preferred;
  let bestCost = cost(preferred);
  for (let k = 0; k < STEPS; k++) {
    const yaw = (k * Math.PI * 2) / STEPS;
    const c = cost(yaw);
    if (c < bestCost - 1e-6) {
      bestCost = c;
      best = yaw;
    }
  }
  // the designer's facing stays unless another one is clearly better
  return cost(preferred) <= bestCost + PREFER_MARGIN ? preferred : best;
}
