import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/700.css';
import '../ui/styles/base.css';
import { bootGame } from '../game/Game';
import { G } from '../game/G';
import { CharacterState } from '../systems/CharacterState';
import { CLASS_IDS } from '../data/classes';
import { DUNGEONS, DUNGEON_IDS } from '../data/dungeons';
import { setNightPreview } from '../world/NightLight';
import type { ClassId } from '../types/common';
import type { DungeonDef } from '../types/dungeons';

/**
 * Dev launcher for the scenes module: boots the REAL game, optionally seeds saved characters and jumps straight into a
 * scene.  dev/scenes.html?seed=3&scene=town | menu | dungeon&class=mage&dungeon=dev_test&key=5
 *   seed=N      make sure N characters exist (cycling classes)
 *   scene=...   jump into the scene with the first/selected character (omit to follow the normal flow)
 *   class=...   class of the character used for a direct jump (creates one when none exists)
 *   nation=gok_kartal|kizil_kurt  nation of a newly created character (default: hashed from its id; coop parties are single-nation)
 *   name=...    character name for a direct jump (selects the saved character of that name, else creates it); lets two tabs run different identities
 *   dungeon=id  dungeon for scene=dungeon ("dev_test" is a tiny built-in layout used when content has none; "sisli_koru" = open world)
 *   key=N       Mythic+ key level (0 = Normal);  dif=heroic|mythic  difficulty without a key;  lvl=N  character level
 *   portal=1 / south=1   town arrival point (portal hall / south gate)
 */

const q = new URLSearchParams(location.search);

// night preview (world/NightLight.ts): night=1 starts in it; window.__astraNight(on) toggles it from a test script
setNightPreview(q.get('night') === '1');
(window as unknown as { __astraNight: (on: boolean) => void }).__astraNight = setNightPreview;

const TEST_DUNGEON: DungeonDef = {
  id: 'dev_test', name: 'Deneme Mahzeni', shortName: 'Deneme', lore: 'Sahne testi için küçük bir zindan.', levelRange: [1, 5], timerSec: 600, forcesRequired: 10,
  theme: { fogColor: 0x141a18, fogNear: 8, fogFar: 38, ambient: 0x3c4a48, ambientIntensity: 0.4, hemiSky: 0x6a7a90, hemiGround: 0x201810, torchColor: 0xffa050, music: 'dungeon_crypt' },
  grid: { w: 20, h: 20 },
  rooms: [
    { id: 'giris', name: 'Giriş Salonu', rect: { x: 2, z: 12, w: 6, h: 5 }, floor: 'stone_dark', wall: 'stone' },
    { id: 'koridor', name: 'Uzun Koridor', rect: { x: 8, z: 13, w: 5, h: 2 }, floor: 'stone', wall: 'stone' },
    { id: 'boss', name: 'Kemik Tahtı', rect: { x: 13, z: 10, w: 6, h: 7 }, floor: 'stone_dark', wall: 'stone' },
  ],
  doors: [
    { a: 'giris', b: 'koridor', tile: [7, 13], side: 'e', gate: 'none' },
    { a: 'koridor', b: 'boss', tile: [12, 13], side: 'e', gate: 'boss_lock' },
  ],
  packs: [{ id: 'p1', roomId: 'koridor', center: [10, 13.5], members: [{ enemyId: 'skeleton_minion', offset: [0, 0] }, { enemyId: 'skeleton_minion', offset: [1, 0] }] }],
  bosses: [{ bossId: 'boss_dev', roomId: 'boss', pos: [16, 13.5], facing: 90, order: 1 }],
  start: { pos: [4, 14], facing: 90 },
  exit: { pos: [16, 11] },
} as unknown as DungeonDef;

async function main(): Promise<void> {
  await bootGame();
  const want = Number(q.get('seed') ?? 0);
  const scene = q.get('scene');
  const cls = (q.get('class') as ClassId | null) ?? null;
  const classes = CLASS_IDS.length ? CLASS_IDS : (['knight', 'barbarian', 'mage', 'rogue'] as ClassId[]);
  const names = ['Aylin', 'Demirhan', 'Selvi', 'Kaan', 'Bora', 'Nehir'];
  const have = G.save.list();
  for (let i = have.length; i < want; i++) {
    const cs = CharacterState.create(names[i % names.length], classes[i % classes.length], i % 6);
    cs.save.level = 5 + i * 7;
    cs.save.mythic.rating = i * 340;
    G.save.write(cs.save);
  }
  if (scene && scene !== 'menu') {
    // net=local goes through G.net.enterScene (async): let the loading scene finish first, or its hand-over to the menu clears the character
    if (q.get('net') === 'local') for (let i = 0; i < 600 && G.scenes.current?.id !== 'menu'; i++) await new Promise((r) => setTimeout(r, 100));
    const wantName = q.get('name'); // two-tab QA (tools/qa/mp-smoke.mjs): each tab picks / creates its own character by name
    let save = wantName ? G.save.list().find((s) => s.name === wantName) : G.save.list()[0];
    if (!save || (cls && save.classId !== cls)) {
      const cs = CharacterState.create(wantName ?? 'Deneme', cls ?? 'knight', 0, q.get('nation') === 'gok_kartal' || q.get('nation') === 'kizil_kurt' ? (q.get('nation') as 'gok_kartal' | 'kizil_kurt') : undefined);
      G.save.write(cs.save);
      save = cs.save;
    }
    const forceLvl = Number(q.get('lvl') ?? 0);
    if (forceLvl > 0) save.level = forceLvl;
    // enemy level of the direct dungeon jump: elvl=N, else follows lvl (the character's level), else 10
    const enemyLvl = Math.max(1, Math.min(70, Number(q.get('elvl') ?? 0) || forceLvl || 10));
    G.character = new CharacterState(save);
    G.character.recomputeStats();
    const townParams = q.get('portal') ? { spawnAt: 'portal' } : q.get('south') ? { spawnAt: 'south' } : undefined;
    // net=local: enter the town like the menu does (G.net.enterScene -> public channel); otherwise the plain scene jump (no network)
    if (scene === 'town') await (q.get('net') === 'local' ? G.net.enterScene('town', townParams) : G.scenes.go('town', townParams));
    if (scene === 'dungeon') {
      const id = q.get('dungeon') ?? DUNGEON_IDS[0] ?? 'dev_test';
      if (!DUNGEONS[id] && id === 'dev_test') {
        DUNGEONS.dev_test = TEST_DUNGEON;
        DUNGEON_IDS.push('dev_test');
      }
      const lvl = Number(q.get('key') ?? 0);
      const dif = (['heroic', 'mythic'] as const).find((d) => d === q.get('dif')) ?? 'normal';
      await G.scenes.go('dungeon', {
        dungeonId: id, difficulty: lvl > 0 ? 'mythicplus' : dif, keyLevel: lvl, seed: 12345, affixes: [], enemyLevel: enemyLvl, partySize: 1, keyOwner: G.net.selfId,
      });
    }
  }
}

main().catch((e) => console.error('[dev/scenes] boot failed', e));
