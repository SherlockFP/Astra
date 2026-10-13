import { G } from '../../game/G';
import { TILE_SIZE } from '../../types/dungeons';
import type { WorldCtx } from './util';
import { tileToWorld } from './util';

/**
 * Hidden areas, vistas and landmarks of Sisli Vadi (GDD_OPENWORLD §5.6-5.8). OWNER: scenes module.
 *
 * The first time the local player walks into a spot's trigger circle: the spot is recorded in the save (`world.found.<id>`, so
 * it counts once per character), it gives its exploration XP once (hidden areas 8-10 %, vistas 6 %, landmarks none), a toast,
 * and the `explore` quest objective (G.quests.onEvent). Every peer checks its own player.
 */

/** Trigger radius of vistas and landmarks (tiles). Hidden areas carry their own radius in the layout. */
const SMALL_RADIUS_TILES = 3;

interface Spot {
  id: string;
  x: number;
  z: number;
  /** Trigger radius (m). */
  r: number;
  xpPct: number;
  toast: string;
}

export class Discoveries {
  private readonly spots: Spot[];

  constructor(private readonly ctx: WorldCtx) {
    const ext = ctx.ext;
    this.spots = [
      ...ext.hidden.map((h) => ({
        id: h.id, x: tileToWorld(h.pos[0]), z: tileToWorld(h.pos[1]), r: h.radius * TILE_SIZE, xpPct: h.xpPct,
        toast: `Gizli bölge keşfedildi: ${h.name}!`,
      })),
      ...ext.vistas.map((v) => ({
        id: v.id, x: tileToWorld(v.pos[0]), z: tileToWorld(v.pos[1]), r: SMALL_RADIUS_TILES * TILE_SIZE, xpPct: v.xpPct,
        toast: `Manzara noktası: ${v.name}`,
      })),
      ...ext.landmarks.map((l) => ({
        id: l.id, x: tileToWorld(l.pos[0]), z: tileToWorld(l.pos[1]), r: SMALL_RADIUS_TILES * TILE_SIZE, xpPct: 0,
        toast: `Ufuk işareti: ${l.name}`,
      })),
    ];
  }

  /** Is the local player inside an undiscovered spot? Called every ~0.4 s by WorldRuntime. Never throws. */
  check(): void {
    const p = this.ctx.world.localPlayer;
    const ch = G.character;
    if (!p || p.removed || !ch) return;
    for (const s of this.spots) {
      const key = `world.found.${s.id}`;
      if (ch.save.flags[key] === true) continue;
      if (Math.hypot(p.position.x - s.x, p.position.z - s.z) > s.r) continue;
      ch.save.flags[key] = true;
      ch.persist();
      if (s.xpPct > 0) {
        try {
          G.progression.addExplorationXp(s.xpPct);
        } catch {
          /* progression not ready */
        }
      }
      G.quests?.onEvent('explore', s.id);
      G.ui.toast(s.toast, 'success');
    }
  }
}
