// Fight-back rules of the first-hour bot (tools/qa/first-hour.mjs).
//
// An attacker is an enemy that dealt damage to the character in the last HIT_WINDOW_MS, taken from the game's own 'damage' events
// (targetId = the character, sourceId = the enemy, amount > 0). It is PICKED when it is also in reach (its attack range + REACH_MARGIN_M).
// A fight-back target is KEPT while it keeps dealing damage (the window), wherever it stands. An aggroed enemy that has not hit the
// character is no attacker.
//
// installHitTracker and hitterSnapshot run in the page: they are self-contained, so the bot passes them to page.evaluate.
// recentHitters and pickAttackers are the Node side of the same rule (the unit check imports them with stub events).

export const HIT_WINDOW_MS = 3000;
export const FIGHT_BACK_CAP_MS = 20000;
export const REACH_MARGIN_M = 4;

/** Page side, once the character is in the world: records when each enemy last dealt damage to the character.
 *  window.__fhHits: enemy entity id -> performance.now() of its last hit. */
export function installHitTracker() {
  window.__fhHits = new Map();
  window.G.events.on('damage', (e) => {
    const me = window.G.player;
    if (!me || e.targetId !== me.id || !(e.amount > 0) || e.sourceId == null || e.sourceId === me.id) return;
    window.__fhHits.set(e.sourceId, performance.now());
  });
}

/** Page side: the living enemies that dealt damage to the character at any time (the Node side applies the window and the reach).
 *  Each: id, def, name, level, camp, d (m from the character), reach (attack range + 4 m), ago (ms since its last hit). */
export function hitterSnapshot() {
  const G = window.G;
  const hits = window.__fhHits;
  const out = [];
  if (!hits || !G.player || !G.world) return out;
  const p = G.player.position;
  const now = performance.now();
  for (const e of G.world.enemies ?? []) {
    const t = hits.get(e.id);
    if (t === undefined || e.isDead || e.removed || e.alive === false) continue;
    out.push({
      id: e.id,
      def: e.def?.id,
      name: e.def?.name,
      level: e.level ?? 1,
      camp: e.packId ?? `solo:${e.id}`,
      d: Math.hypot(e.position.x - p.x, e.position.z - p.z),
      reach: (e.def?.attackRange ?? 3) + 4,
      ago: now - t,
    });
  }
  return out;
}

/** Node side: the enemies of a hitterSnapshot list that dealt damage to the character within `windowMs`, nearest first, at any distance.
 *  This is the DROP rule of a fight-back target: it stays while it is in this list. `exceptId` is the objective of the fight; `capped` maps
 *  an enemy id to the Date.now() ms until which it is not picked again (its 20 s cap). Dead entries are never in the result. */
export function recentHitters(list, { exceptId = null, windowMs = HIT_WINDOW_MS, capped = new Map(), nowMs = Date.now() } = {}) {
  return list
    .filter((e) => e.alive !== false && e.id !== exceptId && e.ago <= windowMs && !((capped.get(e.id) ?? 0) > nowMs))
    .sort((a, b) => a.d - b.d);
}

/** Node side: the attackers to PICK: recentHitters that are also in reach (d <= reach), nearest first. */
export function pickAttackers(list, opts = {}) {
  return recentHitters(list, opts).filter((e) => e.d <= e.reach);
}
