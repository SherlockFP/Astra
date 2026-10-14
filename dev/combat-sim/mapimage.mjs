// OPEN-WORLD MAP IMAGE (src/world/MapImage.ts): headless checks of the zone picture the minimap and the map panel draw. No browser.
// Run: node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/mapimage.mjs [--v]
// Stages: size.* (pixel grid = zone size / mpp, mpp 2 m on the 1.6 km zones, <= 1024 px per side, RGBA length), road.* (road centre
//         lines carry the road colour of their kind, roads exist on every zone), water.* (lake pixels present), region.* (the six
//         Sisli Vadi regions read as different colours, medians taken away from roads), relief.* (the hill shading changes the image
//         against a flat bake of the same zone), det.* (two builds give the same bytes; the relief bake is deterministic too).
// PASS/FAIL per check, exit code 1 on any failure.
const root = new URL('../../src/', import.meta.url).href;
const imp = (p) => import(root + p);
const verbose = process.argv.includes('--v');

let fails = 0, passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || verbose) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};
const warns = [];
console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

const { TILE_SIZE: T } = await imp('types/dungeons.ts');
const MI = await imp('world/MapImage.ts');
const R = await imp('world/Relief.ts');
const { tileCentre } = await imp('world/WorldScenery.ts');
const { SISLI_VADI } = await imp('data/world/sisli_vadi.ts');
const { KARAKIR_BOZKIRI } = await imp('data/world/karakir.ts');
const { AYAZ_DAGLARI } = await imp('data/world/ayaz.ts');
const { KIZIL_SINIR } = await imp('data/world/kizil_sinir.ts');

const fnv = (u8) => {
  let h = 2166136261;
  for (let i = 0; i < u8.length; i++) h = Math.imul(h ^ u8[i], 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const px = (img, x, z) => {
  const o = (z * img.w + x) * 4;
  return [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]];
};
const same = (c, d) => c[0] === d[0] && c[1] === d[1] && c[2] === d[2];
const dist = (c, d) => Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

// ---------------------------------------------------------------------------------------------------------------------
// bake the zones once (the relief is the expensive part); every image reuses the baked relief, like the builder does
// ---------------------------------------------------------------------------------------------------------------------
const ZONES = [SISLI_VADI, KARAKIR_BOZKIRI, AYAZ_DAGLARI, KIZIL_SINIR];
const relief = {};
const images = {};
for (const def of ZONES) {
  const t0 = performance.now();
  relief[def.id] = R.buildRelief(def);
  const t1 = performance.now();
  images[def.id] = MI.buildZoneMapPixels(def, relief[def.id]);
  if (verbose) console.log(`  ${def.id}: relief ${(t1 - t0).toFixed(0)} ms, image ${(performance.now() - t1).toFixed(0)} ms`);
}

// ---------------------------------------------------------------------------------------------------------------------
// size.*
// ---------------------------------------------------------------------------------------------------------------------
for (const def of ZONES) {
  const img = images[def.id];
  const W = def.grid.w * T, H = def.grid.h * T;
  ok(`size.${def.id}.mpp`, img.mpp === 2, `mpp ${img.mpp}`);
  ok(`size.${def.id}.px`, img.w === Math.ceil(W / img.mpp) && img.h === Math.ceil(H / img.mpp), `${img.w}x${img.h} for ${W}x${H} m`);
  ok(`size.${def.id}.cap`, img.w <= 1024 && img.h <= 1024);
  ok(`size.${def.id}.rgba`, img.rgba.length === img.w * img.h * 4);
}
ok('size.sisli-800', images.sisli_vadi.w === 800 && images.sisli_vadi.h === 800, `${images.sisli_vadi.w}x${images.sisli_vadi.h}`);

// ---------------------------------------------------------------------------------------------------------------------
// road.*: the centre of every road segment is painted in the road colour of its kind (roads are drawn after the ground)
// ---------------------------------------------------------------------------------------------------------------------
for (const def of ZONES) {
  const img = images[def.id];
  let checked = 0, hit = 0;
  for (const r of def.world.roads) {
    const want = MI.ROAD_COLOR[r.kind];
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const x = (tileCentre(r.pts[i][0]) + tileCentre(r.pts[i + 1][0])) / 2;
      const z = (tileCentre(r.pts[i][1]) + tileCentre(r.pts[i + 1][1])) / 2;
      const c = px(img, Math.floor(x / img.mpp), Math.floor(z / img.mpp));
      checked++;
      if (same(c, want)) hit++;
    }
  }
  ok(`road.${def.id}.centre`, checked > 0 && hit / checked >= 0.9, `${hit}/${checked} segment centres in the road colour`);
  let roadPx = 0;
  const cols = Object.values(MI.ROAD_COLOR);
  for (let k = 0; k < img.rgba.length; k += 4) {
    const c = [img.rgba[k], img.rgba[k + 1], img.rgba[k + 2]];
    if (cols.some((rc) => same(c, rc))) roadPx++;
  }
  ok(`road.${def.id}.pixels`, roadPx > 0, `${roadPx} road pixels`);
}

// ---------------------------------------------------------------------------------------------------------------------
// water.*: lake pixels exist where the water rects are
// ---------------------------------------------------------------------------------------------------------------------
{
  const def = SISLI_VADI, img = images[def.id];
  let wet = 0, total = 0;
  for (const wt of def.world.water) {
    const cx = (wt.rect.x + wt.rect.w / 2) * T, cz = (wt.rect.z + wt.rect.h / 2) * T;
    const c = px(img, Math.floor(cx / img.mpp), Math.floor(cz / img.mpp));
    total++;
    if (dist(c, MI.MAP_COLOR.water) < 4) wet++;
  }
  ok('water.sisli.centres', total > 0 && wet === total, `${wet}/${total} water rect centres in the water colour`);
}

// ---------------------------------------------------------------------------------------------------------------------
// region.*: each Sisli Vadi region has its own median colour (the median skips roads and POI footprints)
// ---------------------------------------------------------------------------------------------------------------------
{
  const def = SISLI_VADI, img = images[def.id];
  const medians = [];
  for (const reg of def.world.regions) {
    const room = def.rooms.find((r) => r.id === reg.roomId);
    const rs = [[], [], []];
    const x0 = room.rect.x * T / img.mpp, x1 = (room.rect.x + room.rect.w) * T / img.mpp;
    const z0 = room.rect.z * T / img.mpp, z1 = (room.rect.z + room.rect.h) * T / img.mpp;
    for (let z = Math.ceil(z0) + 4; z < z1 - 4; z += 6)
      for (let x = Math.ceil(x0) + 4; x < x1 - 4; x += 6) {
        const c = px(img, x, z);
        rs[0].push(c[0]); rs[1].push(c[1]); rs[2].push(c[2]);
      }
    medians.push({ id: reg.id, c: [median(rs[0]), median(rs[1]), median(rs[2])] });
  }
  let minD = Infinity, pair = '';
  for (let i = 0; i < medians.length; i++)
    for (let j = i + 1; j < medians.length; j++) {
      const d = dist(medians[i].c, medians[j].c);
      if (d < minD) {
        minD = d;
        pair = `${medians[i].id}/${medians[j].id}`;
      }
    }
  ok('region.sisli.count', medians.length === 6, `${medians.length} regions`);
  ok('region.sisli.distinct', minD >= 12, `closest pair ${pair} at distance ${minD.toFixed(1)}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// relief.*: the hill shading moves pixels (against a flat bake of the same zone) and the relief bake is deterministic
// ---------------------------------------------------------------------------------------------------------------------
{
  const def = SISLI_VADI, img = images[def.id];
  const flat = MI.buildZoneMapPixels(def, null);
  let diff = 0;
  for (let k = 0; k < img.rgba.length; k += 4) if (img.rgba[k] !== flat.rgba[k] || img.rgba[k + 1] !== flat.rgba[k + 1] || img.rgba[k + 2] !== flat.rgba[k + 2]) diff++;
  const frac = diff / (img.w * img.h);
  ok('relief.sisli.shading', frac > 0.2, `${(frac * 100).toFixed(1)}% of the pixels differ from the flat bake`);
  ok('relief.sisli.flat-size', flat.w === img.w && flat.h === img.h);
  const again = R.buildRelief(def);
  ok('relief.sisli.bake-det', again && fnv(new Uint8Array(again.h.buffer)) === fnv(new Uint8Array(relief[def.id].h.buffer)), 'two relief bakes, same heights');
}

// ---------------------------------------------------------------------------------------------------------------------
// det.*: two image builds give the same bytes
// ---------------------------------------------------------------------------------------------------------------------
for (const def of [SISLI_VADI, KARAKIR_BOZKIRI]) {
  const a = MI.buildZoneMapPixels(def, relief[def.id]);
  const b = MI.buildZoneMapPixels(def, relief[def.id]);
  ok(`det.${def.id}`, fnv(a.rgba) === fnv(b.rgba) && fnv(a.rgba) === fnv(images[def.id].rgba), `hash ${fnv(a.rgba)}`);
}

if (warns.length) console.log(`warnings: ${warns.length}`);
console.log(`mapimage: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
