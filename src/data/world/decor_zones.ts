import type { DecorDef, LandmarkDef } from '../../types/dungeons';

/**
 * Generated life of the typed open-world zones (Karakır, Ayaz, Kızıl Sınır): `<zone>_decor.json`, written by tools/world-fill.mjs
 * --zone <zone> (the same passes as the Sisli Vadi fill: vignettes, fields, signposts, groves, flora, rocks, meadow carpets, landmarks).
 * The zone module passes its biome name (the palette of src/world/decorRecipes.ts BIOME_PALETTE).
 */
export interface ZoneDecorFile {
  decor: { id: string; kind: string; recipe: string; region: string; pos: number[]; rot: number; lines?: string[] }[];
  landmarks: { id: string; name: string; region: string; pos: number[]; recipe: string; rot?: number }[];
}

/** The decor entries of a zone file, as the open-world decor reads them (WorldExtras.decor). */
export function zoneDecor(file: ZoneDecorFile, biome: string): DecorDef[] {
  return file.decor.map((d) => ({
    id: d.id, kind: d.kind as DecorDef['kind'], recipe: d.recipe, regionId: d.region, pos: d.pos as [number, number], rot: d.rot, lines: d.lines, biome,
  }));
}

/** The landmarks the fill pass added to a zone (appended to the hand-authored LANDMARKS). */
export function zoneLandmarks(file: ZoneDecorFile): LandmarkDef[] {
  return file.landmarks.map((l) => ({ id: l.id, name: l.name, regionId: l.region, pos: l.pos as [number, number], recipe: l.recipe, rot: l.rot }));
}

/**
 * Flat pads under the story decor (tile centre, m), as Sisli Vadi does, so a camp or a field does not tilt into the slope. Groves,
 * flora and rocks stand on the ground by themselves (one anchor per tree). Only vignettes, fields and signposts get a pad: a pad on
 * every grove made the relief exceed its grade limit (tools/content-check.mjs).
 */
export function zoneFlats(decor: DecorDef[]): { pos: [number, number]; radius: number }[] {
  return decor
    .filter((d) => d.kind === 'vignette' || d.kind === 'field' || d.kind === 'signpost')
    .map((d) => ({ pos: d.pos, radius: d.kind === 'field' ? 8 : d.kind === 'signpost' ? 2 : 3 }));
}
