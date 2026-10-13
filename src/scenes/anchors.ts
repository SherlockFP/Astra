import type { BuiltProp } from '../world/DungeonBuilder';

/**
 * Named world anchors of the CURRENT dungeon scene, harvested from the content module's tagged / id'd props
 * (`seal_socket_1..4`, `priest_platform_1..4`, `rift_spot_1..3`, `phylactery_N`, `cage_N`, `vent_N`, `crucible_*` ...).
 * The scene fills this on enter and clears it on exit, so boss scripts (ai/bosses/*) can read the REAL positions of the
 * content props instead of duplicating coordinates:
 *
 *   const s = getSceneAnchors('seal_socket_');   // [{ id, x, z, y, rot, tag, room }, ...] in id order
 *
 * OWNER: scenes module (additive API; nothing in the game depends on it being populated).
 */
export interface SceneAnchor {
  id: string;
  tag?: string;
  room: string;
  x: number;
  y: number;
  z: number;
  /** Radians (world yaw of the prop). */
  rot: number;
}

let anchors = new Map<string, SceneAnchor>();
let propsById = new Map<string, BuiltProp>();

export function setSceneAnchors(props: readonly BuiltProp[]): void {
  const m = new Map<string, SceneAnchor>();
  const pm = new Map<string, BuiltProp>();
  for (const p of props) {
    if (!p.id) continue;
    m.set(p.id, { id: p.id, tag: p.tag, room: p.room, x: p.x, y: p.y, z: p.z, rot: p.rot });
    pm.set(p.id, p);
  }
  anchors = m;
  propsById = pm;
}

export function clearSceneAnchors(): void {
  anchors = new Map();
  propsById = new Map();
}

/**
 * The builder prop behind an anchor, e.g. so a boss mechanic that spawns a real entity on top of decor (an iron cage, a phylactery)
 * can `getSceneProp('cage_3')?.hide()` the static copy and `.reveal()` it again on reset.
 */
export function getSceneProp(id: string): BuiltProp | undefined {
  return propsById.get(id);
}

export function getSceneAnchor(id: string): SceneAnchor | undefined {
  return anchors.get(id);
}

/** All anchors whose id starts with `prefix`, sorted by id (natural order: ..._2 before ..._10). */
export function getSceneAnchors(prefix = ''): SceneAnchor[] {
  const out: SceneAnchor[] = [];
  for (const a of anchors.values()) if (a.id.startsWith(prefix)) out.push(a);
  return out.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}
