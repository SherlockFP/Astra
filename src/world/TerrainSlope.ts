/**
 * Shader snippets of the slope shading shared by Terrain.ts (classic one-mesh ground) and TerrainChunks.ts (streamed chunks): the
 * steeper the ground, the more the region's dirt texture shows through the grass (a 0.34 grade is the limit of the relief,
 * normal.y 0.947 -> vSlope 0.053; the blend starts at 0.04 and is 70 % at 0.12). Flat ground has normal.y = 1, vSlope = 0, so nothing
 * changes there. Pure strings: importable from node.
 */
export const SLOPE_VARYING_VERT = 'varying float vSlope;';
export const SLOPE_VERT = 'vSlope = 1.0 - normal.y;';
export const SLOPE_VARYING_FRAG = 'varying float vSlope;';
export const SLOPE_FRAG = 'base = mix(base, dt * 0.82, smoothstep(0.04, 0.12, vSlope) * 0.7);';
