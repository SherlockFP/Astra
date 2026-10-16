import { G } from '../../game/G';
import type { Player } from '../../entities/Player';
import type { PackDef } from '../../types/dungeons';
import { tileToWorld } from './util';

/**
 * WoW-style danger line: a camp at least 2 levels above the local player, within 25 m of the player, shows one short red line
 * ("Tehlikeli bölge: Sv. X düşmanlar", X = the camp's lowest level). Once per camp per session (the module set survives map
 * re-entries; a page reload starts it again). Patrols are not camps and never warn. OWNER: scenes module (open world).
 */

const WARN_RANGE_M = 25;
const WARN_LEVEL_GAP = 2;
const CHECK_EVERY = 0.25;

/** Camps already warned about this session (pack ids). */
const warned = new Set<string>();

interface CampSpot { id: string; x: number; z: number; minLevel: number }

export class CampDanger {
  private readonly camps: CampSpot[];
  private acc = 0;

  constructor(packs: readonly PackDef[]) {
    this.camps = packs
      .filter((pk) => pk.kind !== 'patrol' && !!pk.levelRange)
      .map((pk) => ({ id: pk.id, x: tileToWorld(pk.center[0]), z: tileToWorld(pk.center[1]), minLevel: pk.levelRange![0] }));
  }

  update(dt: number, p: Player): void {
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc = CHECK_EVERY;
    if (p.isDead) return;
    const level = G.character?.level ?? 1;
    for (const c of this.camps) {
      if (warned.has(c.id) || c.minLevel < level + WARN_LEVEL_GAP) continue;
      const d = Math.hypot(c.x - p.position.x, c.z - p.position.z);
      if (d > WARN_RANGE_M) continue;
      warned.add(c.id);
      G.events.emit('ui:toast', { text: `Tehlikeli bölge: Sv. ${c.minLevel} düşmanlar`, kind: 'error' });
    }
  }
}
