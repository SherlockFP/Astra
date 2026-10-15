import { G } from '../../game/G';
import { TILE_SIZE } from '../../types/dungeons';
import type { WorldCtx } from './util';
import { tileToWorld } from './util';

/**
 * Hidden areas, vistas and named sub-areas (landmarks) of Sisli Vadi (GDD_OPENWORLD §5.6-5.8). OWNER: scenes module.
 *
 * The first time the local player walks into a spot's trigger circle: the spot is recorded in the save (`world.found.<id>`, so
 * it counts once per character), it gives its exploration XP once (hidden areas 8-10 %, vistas 6 %, landmarks 1 %), a banner
 * "Keşfedildi: <name>" through the zone banner lane (ui:zoneName), and the `explore` quest objective (G.quests.onEvent). The map
 * (ui/panels/game/map.ts) names the spots from then on. Every peer checks its own player.
 */

/** Trigger radius of vistas and landmarks (tiles). Hidden areas carry their own radius in the layout. */
const SMALL_RADIUS_TILES = 3;
/** Landmarks are named sub-areas: a little exploration XP on the first visit (percent of a level). */
const LANDMARK_XP_PCT = 1;

interface Spot {
  id: string;
  x: number;
  z: number;
  /** Trigger radius (m). */
  r: number;
  xpPct: number;
  name: string;
  /** Subtitle word of the banner: "Gizli bölge", "Manzara noktası", "Ufuk işareti". */
  kind: string;
}

export class Discoveries {
  private readonly spots: Spot[];

  constructor(private readonly ctx: WorldCtx) {
    const ext = ctx.ext;
    this.spots = [
      ...ext.hidden.map((h) => ({
        id: h.id, x: tileToWorld(h.pos[0]), z: tileToWorld(h.pos[1]), r: h.radius * TILE_SIZE, xpPct: h.xpPct,
        name: h.name, kind: 'Gizli bölge',
      })),
      ...ext.vistas.map((v) => ({
        id: v.id, x: tileToWorld(v.pos[0]), z: tileToWorld(v.pos[1]), r: SMALL_RADIUS_TILES * TILE_SIZE, xpPct: v.xpPct,
        name: v.name, kind: 'Manzara noktası',
      })),
      ...ext.landmarks.map((l) => ({
        id: l.id, x: tileToWorld(l.pos[0]), z: tileToWorld(l.pos[1]), r: SMALL_RADIUS_TILES * TILE_SIZE, xpPct: LANDMARK_XP_PCT,
        name: l.name, kind: 'Ufuk işareti',
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
      // the zone banner lane: queued, dropped in combat, one at a time (Banners.ts ZoneBanner)
      G.events.emit('ui:zoneName', { title: `Keşfedildi: ${s.name}`, subtitle: s.xpPct > 0 ? `${s.kind} · keşif XP +%${s.xpPct}` : s.kind });
    }
  }
}
