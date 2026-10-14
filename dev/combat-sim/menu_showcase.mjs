#!/usr/bin/env node
/**
 * Creation-pedestal showcase check (src/ui/menu/classInfo.ts, MenuScene.updatePedestal). Headless: no browser, no server.
 *
 *   node --no-warnings --import ./dev/combat-sim/register.mjs dev/combat-sim/menu_showcase.mjs      (V=1 prints every PASS)
 *
 * Every playable class has at least one showcase step; each step names a clip that exists on the class's rig (the GLB the
 * pedestal loads, read from public/), a VFX id and an SFX id that the engine knows. Exit 0 = all PASS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as H from './harness.mjs';

const { PLAYABLE_CLASSES } = await H.imp('data/classes.ts');
const { classPresentation } = await H.imp('ui/menu/classInfo.ts');
const { VFX_IDS } = await H.imp('types/vfx.ts');
const { SFX_IDS } = await H.imp('types/audio.ts');
const { classModelUrl } = await H.imp('scenes/CharacterVisual.ts');

let fails = 0;
let passes = 0;
const ok = (name, cond, info = '') => {
  if (cond) passes++;
  else fails++;
  if (!cond || process.env.V) console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' - ' + info : ''}`);
};

/** Animation clip names inside a binary glTF (the GLB JSON chunk). */
const clipsOf = (file) => {
  const b = fs.readFileSync(file);
  const len = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + len).toString('utf8'));
  return new Set((json.animations ?? []).map((a) => a.name));
};
const publicDir = fileURLToPath(new URL('../../public/', import.meta.url));

const vfxIds = new Set(VFX_IDS);
const sfxIds = new Set(SFX_IDS);
const rigCache = new Map();

for (const id of PLAYABLE_CLASSES) {
  const p = classPresentation(id);
  const steps = p.showcase ?? [];
  ok(`showcase.${id} has at least one showcase step`, steps.length >= 1, `${steps.length} step(s)`);

  const url = classModelUrl(id);
  if (!rigCache.has(url)) rigCache.set(url, clipsOf(path.join(publicDir, url)));
  const clips = rigCache.get(url);
  for (const s of steps) {
    ok(`showcase.${id} clip ${s.clip} exists on ${url.split('/').pop()}`, clips.has(s.clip));
    if (s.vfx) ok(`showcase.${id} vfx ${s.vfx} is a known VFX id`, vfxIds.has(s.vfx));
    if (s.sfx) ok(`showcase.${id} sfx ${s.sfx} is a known SFX id`, sfxIds.has(s.sfx));
  }
}

console.log(fails === 0 ? `ALL PASS (${passes} passed, ${fails} failed)` : `FAILED (${passes} passed, ${fails} failed)`);
process.exit(fails === 0 ? 0 : 1);
