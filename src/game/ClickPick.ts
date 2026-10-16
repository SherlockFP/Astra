/**
 * WoW click picking (docs/CONTROLS_WOW.md §4.4). Pure apart from three.js vector math: no imports from G.
 *
 * Same body test as the soft target in PlayerController (`perp / (radius + 0.9 + t * 0.035)` over feet, chest and head
 * samples), but driven by an NDC point (the press-time cursor) instead of the crosshair. No line-of-sight test: selection
 * through walls is allowed, the attack itself still needs LOS.
 */
import * as THREE from 'three';
import type { World } from '../world/World';
import type { Entity } from '../entities/Entity';
import type { EntityKind } from '../types/common';

export type PickKind = 'enemy' | 'npc' | 'loot' | 'interactable';
export interface PickHit { kind: PickKind; entity: Entity; ratio: number }

export const PICK = {
  /** Body samples as fractions of the entity height (feet, chest, head). */
  samples: [0.1, 0.5, 0.9] as const,
  /** Candidates whose ratio is within this of the best one are tie-broken by kind. */
  tieRatio: 0.1,
  /** Metres added to the body radius for the click area (was 0.9; the generous area makes small mobs clickable). */
  slack: 1.2,
  maxDist: 60,
} as const;

/** Tie-break order (lower wins): enemy > loot > interactable > npc. */
export const PICK_PRIORITY: Record<PickKind, number> = { enemy: 0, loot: 1, interactable: 2, npc: 3 };

const PICKABLE: Partial<Record<EntityKind, PickKind>> = { enemy: 'enemy', npc: 'npc', loot: 'loot', interactable: 'interactable' };

/**
 * Ray-to-body ratio for one entity: the smallest `perp / allowed` over the body samples (t >= 1 only).
 * <= 1 means the ray passes through the body. Pure math, no three objects.
 */
export function bodyRatio(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  ex: number, ey: number, ez: number,
  radius: number, height: number,
): number {
  let ratio = Infinity;
  for (const f of PICK.samples) {
    const qx = ex - ox, qy = ey + height * f - oy, qz = ez - oz;
    const t = qx * dx + qy * dy + qz * dz;
    if (t < 1) continue;
    const lenSq = qx * qx + qy * qy + qz * qz;
    const perp = Math.sqrt(Math.max(0, lenSq - t * t));
    const allowed = Math.max(radius, 0.5) + PICK.slack + t * 0.035; // small mobs (radius 0.3) get the same click area as a 0.5 m body
    ratio = Math.min(ratio, perp / allowed);
  }
  return ratio;
}

/** Best candidate: the lowest ratio, but any candidate within `tieRatio` of it wins by kind priority. */
export function choosePick<T extends { kind: PickKind; ratio: number }>(cands: readonly T[]): T | null {
  if (!cands.length) return null;
  let best = Infinity;
  for (const c of cands) if (c.ratio < best) best = c.ratio;
  let pick: T | null = null;
  for (const c of cands) {
    if (c.ratio > best + PICK.tieRatio) continue;
    if (!pick) { pick = c; continue; }
    const pp = PICK_PRIORITY[pick.kind], cp = PICK_PRIORITY[c.kind];
    if (cp < pp || (cp === pp && c.ratio < pick.ratio)) pick = c;
  }
  return pick;
}

const _o = new THREE.Vector3();
const _n = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Entity under NDC (x, y): ray from the camera through the cursor point. */
export function pickAtNdc(
  camera: THREE.PerspectiveCamera,
  world: World,
  ndcX: number,
  ndcY: number,
  maxDist: number = PICK.maxDist,
): PickHit | null {
  camera.getWorldPosition(_o);
  _n.set(ndcX, ndcY, 0.5).unproject(camera);
  _d.copy(_n).sub(_o).normalize();
  const cands: PickHit[] = [];
  for (const e of world.entities.values()) {
    const kind = PICKABLE[e.kind];
    if (!kind) continue;
    if (e.removed || !e.alive || (e as Entity & { isDead?: boolean }).isDead) continue;
    const ex = e.position.x, ey = e.position.y, ez = e.position.z;
    const dist = Math.hypot(ex - _o.x, ey - _o.y, ez - _o.z);
    if (dist > maxDist + e.radius) continue;
    const ratio = bodyRatio(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, ex, ey, ez, e.radius, e.height);
    if (ratio > 1) continue;
    cands.push({ kind, entity: e, ratio });
  }
  return choosePick(cands);
}

// ------------------------------------------------------------------------------------------------------
// self test (dev/player.html?selftest=1). Returns failure messages; empty array = pass.
// ------------------------------------------------------------------------------------------------------

export function selfTest(): string[] {
  const fails: string[] = [];
  const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };

  // straight ahead: origin (0,1,0) looking +z, body at z = 5 (feet at y 0, 2 m tall, radius 0.5)
  const hit = bodyRatio(0, 1, 0, 0, 0, 1, 0, 0, 5, 0.5, 2);
  check(hit <= 1, 'bodyRatio: centred body must hit');
  // same body 5 m to the side: miss
  const miss = bodyRatio(0, 1, 0, 0, 0, 1, 5, 0, 5, 0.5, 2);
  check(miss > 1, 'bodyRatio: body 5 m to the side must miss');
  // body behind the origin: t < 1 for every sample, so no hit
  const behind = bodyRatio(0, 1, 0, 0, 0, 1, 0, 0, -5, 0.5, 2);
  check(!(behind <= 1), 'bodyRatio: body behind the ray must not hit');

  // tie-break: enemy beats a closer npc when both are inside the tie window
  const tie = choosePick([
    { kind: 'npc' as PickKind, ratio: 0.2 },
    { kind: 'enemy' as PickKind, ratio: 0.25 },
  ]);
  check(!!tie && tie.kind === 'enemy', 'choosePick: enemy must win a tie within 0.1');
  // outside the window the better ratio wins regardless of kind
  const far = choosePick([
    { kind: 'npc' as PickKind, ratio: 0.1 },
    { kind: 'enemy' as PickKind, ratio: 0.5 },
  ]);
  check(!!far && far.kind === 'npc', 'choosePick: ratio decides outside the tie window');
  // loot beats interactable beats npc
  const order = choosePick([
    { kind: 'npc' as PickKind, ratio: 0.3 },
    { kind: 'interactable' as PickKind, ratio: 0.3 },
    { kind: 'loot' as PickKind, ratio: 0.3 },
  ]);
  check(!!order && order.kind === 'loot', 'choosePick: loot > interactable > npc');
  check(choosePick<{ kind: PickKind; ratio: number }>([]) === null, 'choosePick: empty -> null');

  return fails;
}
