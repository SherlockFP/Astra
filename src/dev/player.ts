import * as THREE from 'three';
import { bootHarness } from './harness';
import { G } from '../game/G';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { PlayerController } from '../game/PlayerController';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { CharacterState } from '../systems/CharacterState';
import { CHARACTER_VARIANTS } from '../entities/CharacterModel';
import { ITEM_BASES } from '../data/items';
import type { ClassId } from '../types/common';
import type { EnemyDef } from '../types/enemies';
import type { ItemBaseDef, ItemInstance } from '../types/items';

// ---------------------------------------------------------------------------------------------------------------------
// Dev page for the player module: movement, camera, dodge/jump, animation layering, gear attachment, colour variants.
//   WASD move | Space jump | Shift dodge | mouse orbit (click to lock; ?fakelock=1 fakes the lock) | wheel zoom | F interact
//   1-4 class | C camera mode | M shift-lock | G test attack (upper body) | V colour variant | H gear set | T Tab-target | K kill/revive
// ---------------------------------------------------------------------------------------------------------------------

const q = new URLSearchParams(location.search);
const h = await bootHarness({ orbit: false, floorSize: 120 });
const { scene, world } = h;
G.ui.setMode('town'); // HUD mode (wantsCursor() is true in 'loading'/'menu')
scene.fog = new THREE.Fog(0x14121a, 40, 140);
scene.add(new THREE.AmbientLight(0xffffff, 1.4)); // the harness lights are dim; inspect gear/colours properly

// ---- arena: boundary walls, pillars, crates, a small room with a doorway ----
const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a554c, roughness: 1 });
function addBox(x0: number, z0: number, x1: number, z1: number, height = 4, color?: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), height, Math.abs(z1 - z0)), color ? new THREE.MeshStandardMaterial({ color, roughness: 1 }) : wallMat);
  m.position.set((x0 + x1) / 2, height / 2, (z0 + z1) / 2);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  world.nav.setRect(x0, z0, x1, z1, false);
}
addBox(-40, -41, 40, -40);
addBox(-40, 40, 40, 41);
addBox(-41, -40, -40, 40);
addBox(40, -40, 41, 40);
for (const [x, z] of [[8, -6], [-8, -10], [14, 8], [-14, 6], [0, -16]] as [number, number][]) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.1, 5, 10), new THREE.MeshStandardMaterial({ color: 0x70685a, roughness: 1 }));
  m.position.set(x, 2.5, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  world.nav.setCircle(x, z, 1.1, false);
}
addBox(-6, 12, -4, 14, 1.2, 0x7a5a30);
addBox(4, 14, 6, 16, 1.2, 0x7a5a30);
// small room (camera collision test): walls with a doorway on the south side
addBox(-24, -24, -12, -23);
addBox(-24, -12, -12, -11);
addBox(-24, -23, -23, -12);
addBox(-13, -23, -12, -17);
addBox(-13, -15, -12, -12);

// ---- dummies for soft/hard targeting ----
const dummies: Enemy[] = [];
function addDummy(i: number, x: number, z: number) {
  const def = { id: 'dummy', name: 'Hedef Kuklası', model: '', scale: 1, role: 'melee', rank: 'trash', hpMult: 1, dmgMult: 1, radius: 0.7, speed: 0, abilities: [] } as unknown as EnemyDef;
  const e = new Enemy(100 + i, def);
  e.position.set(x, 0, z);
  e.height = 2.2;
  e.hp = e.maxHp = 100;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: 0x9a3030, roughness: 0.8 }));
  body.position.y = 1.1;
  body.castShadow = true;
  e.object3d.add(body);
  world.add(e);
  dummies.push(e);
}
addDummy(0, 6, 10);
addDummy(1, -3, 18);
addDummy(2, 14, 20);
addDummy(3, -14, 24);

// ---- fake gear (ITEM_BASES is filled by the items module in the real game) ----
function regBase(id: string, category: ItemBaseDef['category'], model: string, extra: Partial<ItemBaseDef> = {}) {
  ITEM_BASES[id] ??= { id, name: id, category, icon: '', model, minLevel: 1, itemLevelRange: [1, 60], ...extra };
}
const GEN = '/assets/models/gen/weapons/';
regBase('dv_sword_dragon', 'sword1h', GEN + 'sword_1h_dragon.glb');
regBase('dv_sword_jade', 'sword1h', GEN + 'sword_1h_jade.glb');
regBase('dv_claymore', 'sword2h', GEN + 'sword_2h_claymore.glb', { twoHanded: true });
regBase('dv_kite', 'shield', GEN + 'shield_kite_crest.glb');
regBase('dv_tower', 'shield', GEN + 'shield_tower.glb');
regBase('dv_axe2h', 'axe2h', GEN + 'axe_2h_executioner.glb', { twoHanded: true });
regBase('dv_axe1h', 'axe1h', GEN + 'axe_1h_crescent.glb');
regBase('dv_axe_inf', 'axe2h', GEN + 'axe_2h_infernal.glb', { twoHanded: true });
regBase('dv_hammer', 'axe2h', GEN + 'hammer_2h_thunder.glb', { twoHanded: true });
regBase('dv_round', 'shield', GEN + 'shield_round_wood.glb');
regBase('dv_staff_fire', 'staff', GEN + 'staff_fire.glb', { twoHanded: true });
regBase('dv_staff_frost', 'staff', GEN + 'staff_frost.glb', { twoHanded: true });
regBase('dv_wand', 'wand', GEN + 'wand_arcane.glb');
regBase('dv_book', 'tome', '/assets/models/weapons/spellbook_closed.gltf');
regBase('dv_dagger_a', 'dagger', GEN + 'dagger_assassin.glb');
regBase('dv_dagger_c', 'dagger', GEN + 'dagger_curved.glb');
regBase('dv_dagger_r', 'dagger', GEN + 'dagger_ritual.glb');
regBase('dv_xbow', 'crossbow', GEN + 'crossbow_heavy.glb', { twoHanded: true });
let itemSeq = 0;
const it = (baseId: string, upgrade = 0): ItemInstance => ({ uid: 'dev' + itemSeq++, baseId, rarity: 'epic', itemLevel: 30, upgrade, affixes: [] });
const GEAR_SETS: Record<ClassId, (Partial<Record<'weapon' | 'offhand' | 'helm', ItemInstance>> | undefined)[]> = {
  knight: [undefined, { weapon: it('dv_sword_dragon', 9), offhand: it('dv_kite', 7) }, { weapon: it('dv_sword_jade', 12), offhand: it('dv_tower') }, { weapon: it('dv_claymore', 15) }, {}],
  barbarian: [undefined, { weapon: it('dv_axe2h', 9) }, { weapon: it('dv_axe1h', 7), offhand: it('dv_round') }, { weapon: it('dv_axe_inf', 12) }, { weapon: it('dv_hammer', 15) }],
  mage: [undefined, { weapon: it('dv_staff_fire', 9) }, { weapon: it('dv_staff_frost', 12) }, { weapon: it('dv_wand', 7), offhand: it('dv_book') }, {}],
  rogue: [undefined, { weapon: it('dv_dagger_a', 9), offhand: it('dv_dagger_c', 7) }, { weapon: it('dv_dagger_r', 12), offhand: it('dv_dagger_r') }, { weapon: it('dv_xbow') }, {}],
  // GDD_CLASSES_V2 (NC04): dev gear for the new classes comes with their bases (NC09); one empty set keeps indexing safe
  monk: [undefined], archer: [undefined], paladin: [undefined], necromancer: [undefined], warlock: [undefined],
  demonhunter: [undefined], evoker: [undefined], // CM1 stubs
  priest: [undefined], shaman: [undefined], druid: [undefined], // CLASS SCAFFOLD
};

// ---- player management ----
const CLASS_KEYS: ClassId[] = ['knight', 'barbarian', 'mage', 'rogue'];
let classIdx = Math.max(0, CLASS_KEYS.indexOf((q.get('class') as ClassId) ?? 'knight'));
let variant = Number(q.get('variant') ?? 0);
let gearIdx = 0;
let player: Player | null = null;
let controller: PlayerController | null = null;
let cam: ThirdPersonCamera | null = null;
let character: CharacterState | null = null;

if (q.get('fakelock') === '1') G.input.isLocked = () => true;

async function spawnPlayer(): Promise<void> {
  const classId = CLASS_KEYS[classIdx];
  const prevPos = player ? player.position.clone() : new THREE.Vector3(0, 0, 0);
  const prevYaw = player ? player.yaw : 0;
  controller?.dispose();
  if (player) world.remove(player);
  character = CharacterState.create('Test', classId, variant);
  character.save.appearance.variant = variant;
  G.character = character;
  const p = new Player({ id: 1, slot: 0, classId, name: 'Test', level: 10, isLocal: true, peerId: 'self', character });
  p.position.copy(prevPos);
  p.yaw = prevYaw;
  await p.loadModel();
  world.add(p);
  world.localPlayer = G.player = p;
  player = p;
  const set = GEAR_SETS[classId][gearIdx % GEAR_SETS[classId].length];
  if (set) {
    character.save.equipment = { ...set };
    p.refreshEquipmentVisuals();
  }
  if (!cam) {
    cam = new ThirdPersonCamera(h.camera);
    G.camera = cam;
  }
  controller = new PlayerController(p, cam);
  cam.snap();
  p.refreshStats();
}
await spawnPlayer();

// ---- fake remote player mirroring the local one (replication path: applySyncState / interpolation / one-shot replay) ----
let remote: Player | null = null;
let remoteAcc = 0;
async function spawnRemote(classId: ClassId = 'mage'): Promise<Player> {
  if (remote) world.remove(remote);
  const rp = new Player({ id: 2, slot: 1, classId, name: 'Uzak Oyuncu', level: 7, isLocal: false, peerId: 'peer2' });
  rp.visibleGear = classId === 'mage' ? { weapon: it('dv_staff_frost', 12) } : { weapon: it('dv_sword_jade', 7), offhand: it('dv_tower') };
  rp.refreshEquipmentVisuals();
  await rp.loadModel();
  world.add(rp);
  remote = rp;
  return rp;
}
h.onFrame((dt) => {
  cam?.update(dt);
  if (remote && player) {
    remoteAcc += dt;
    while (remoteAcc >= 1 / 15) {
      remoteAcc -= 1 / 15;
      const st = player.getSyncState();
      st.x += 3.5; // stand next to the local player
      remote.applySyncState(st, G.engine.time);
    }
  }
});
G.engine.onUpdate((dt) => controller?.update(dt), -1);

// ---- dev keys (captured before the game Input sees them) ----
window.addEventListener(
  'keydown',
  (e) => {
    const stop = () => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    if (e.repeat) {
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyC', 'KeyG', 'KeyV', 'KeyH', 'KeyT', 'KeyK', 'KeyM'].includes(e.code)) stop();
      return;
    }
    switch (e.code) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
        classIdx = Number(e.code.slice(5)) - 1;
        gearIdx = 0;
        void spawnPlayer();
        stop();
        break;
      case 'KeyC':
        G.settings.set('cameraMode', G.settings.data.cameraMode === 'action' ? 'classic' : 'action');
        stop();
        break;
      case 'KeyM':
        if (cam) cam.shiftLock = !cam.shiftLock;
        stop();
        break;
      case 'KeyG': {
        const p = player;
        if (!p?.anim) break;
        const clip = ['mage'].includes(p.classId) ? 'Spellcast_Shoot' : p.classId === 'barbarian' ? '2H_Melee_Attack_Slice' : '1H_Melee_Attack_Slice_Horizontal';
        const moving = Math.hypot(p.velocity.x, p.velocity.z) > 0.8;
        p.anim.playOnce(clip, { upperBody: moving, speed: 1.4 });
        p.setActionMove(0.5, 0.35);
        stop();
        break;
      }
      case 'KeyV':
        variant = (variant + 1) % CHARACTER_VARIANTS.length;
        if (character) character.save.appearance.variant = variant;
        player?.refreshAppearance();
        stop();
        break;
      case 'KeyH':
        gearIdx++;
        if (player && character) {
          const sets = GEAR_SETS[player.classId];
          character.save.equipment = { ...(sets[gearIdx % sets.length] ?? {}) };
          if (!sets[gearIdx % sets.length]) (player as unknown as { charModel: { setGear(g?: undefined): void } }).charModel.setGear(undefined);
          else player.refreshEquipmentVisuals();
        }
        stop();
        break;
      case 'KeyT':
        stop();
        break;
      case 'KeyK':
        if (player) {
          if (player.isDead) G.combat.reviveLocalPlayer(0.5);
          else G.combat.killLocalPlayer(null);
        }
        stop();
        break;
    }
  },
  true,
);

// ---- HUD ----
const hud = document.getElementById('dev-hud')!;
const help = document.getElementById('dev-help')!;
help.textContent = [
  'WASD hareket | Boşluk zıpla | Shift takla | F etkileşim',
  'Fare: kamera (tıkla = kilitle) | tekerlek: zoom | Alt: imleç',
  '1-4 sınıf | C kamera modu | M shift-lock | G saldırı',
  'V renk | H teçhizat | Tab hedef | K öl/dirIl | Ctrl yürü',
].join('\n');
G.events.on('target:changed', (e) => console.log('[dev] target', e.targetId));
G.events.on('interact:prompt', (e) => console.log('[dev] prompt', e.text));
setInterval(() => {
  const p = player;
  if (!p) return;
  const t = controller?.currentTarget();
  hud.textContent = [
    `${p.classId}  varyant ${variant} (${CHARACTER_VARIANTS[variant]?.name})  gear#${gearIdx}  kamera: ${G.settings.data.cameraMode}${G.settings.data.cameraMode === 'action' ? (cam?.shiftLock ? ' [shift-lock]' : '') : ''}`,
    `konum ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(1)}  hız ${Math.hypot(p.velocity.x, p.velocity.z).toFixed(1)}  yaw ${p.yaw.toFixed(2)}`,
    `anim ${p.anim?.baseName ?? '-'} / shot ${p.anim?.oneShotName ?? '-'}  zıplama ${p.jumpY.toFixed(2)}  takla ${p.dodgeCharges.toFixed(2)}/${p.dodgeMaxCharges}${p.dodging ? ' [TAKLA]' : ''}${p.statuses.has('iframes') ? ' [iframes]' : ''}`,
    `hedef ${t ? t.id : '-'}${controller?.hardTarget ? ' (sabit)' : ''}  kilit ${G.input.isLocked()}  fps ${G.engine.fps}  mesafe ${cam?.distance.toFixed(1)}`,
  ].join('\n');
}, 100);

// ---- headless helpers: when the preview pane is hidden rAF stops, so tests step the engine by hand and ship canvas
// captures to a tiny local receiver (see ?shots=1) ----
const eng = G.engine as unknown as { step(t: number, render: boolean): void; stop(): void; lastT: number };
let simT = performance.now();
let clockPatched = false;
/** Engine.hitStop() uses performance.now(): make it follow the simulated clock so hit-stop expires in sim time. */
function patchClock(): void {
  if (clockPatched) return;
  clockPatched = true;
  performance.now = () => simT;
}
const sim = {
  /** Take over the loop and advance `frames` frames of `dtMs` each (render only the last one when render=true). */
  step(frames = 1, dtMs = 16.667, render = false): void {
    eng.stop();
    patchClock();
    for (let i = 0; i < frames; i++) {
      simT += dtMs;
      eng.step(simT, render && i === frames - 1);
    }
  },
  /** Render one frame and POST the canvas as a PNG to http://localhost:5199/<name>. */
  async shot(name: string): Promise<string> {
    eng.stop();
    patchClock();
    simT += 16.667;
    eng.step(simT, true);
    const url = G.engine.canvas.toDataURL('image/png');
    const r = await fetch('http://localhost:5199/' + name, { method: 'POST', body: url });
    return r.text();
  },
  key(code: string, down: boolean): void {
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  },
  look(dx: number, dy: number): void {
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, clientX: 400, clientY: 300, bubbles: true }));
  },
  /** Inspection pose: shift-lock off, camera in front of the character at `dist`, looking at it from `pitch`. */
  front(dist = 5, pitch = 0.15, yawOff = 0): void {
    const c = cam!, pl = player!;
    c.shiftLock = false;
    pl.yaw = c.yaw + yawOff;
    (c as unknown as { zoomTarget: number }).zoomTarget = dist;
    c.pitch = pitch;
    c.shoulderSide = 0;
  },
  click(button: number, down: boolean): void {
    window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true }));
  },
};
(window as unknown as Record<string, unknown>).__sim = sim;

(window as unknown as Record<string, unknown>).__dev = {
  get player() { return player; },
  get controller() { return controller; },
  get cam() { return cam; },
  world, dummies, spawnPlayer, spawnRemote,
  get remote() { return remote; },
  setClass: (i: number) => { classIdx = i; gearIdx = 0; return spawnPlayer(); },
  setGear: (i: number) => {
    gearIdx = i;
    if (!player || !character) return;
    const sets = GEAR_SETS[player.classId];
    const set = sets[i % sets.length];
    character.save.equipment = { ...(set ?? {}) };
    if (!set) void player.charModel?.setGear(undefined);
    else player.refreshEquipmentVisuals();
  },
  setVariant: (v: number) => { variant = v; if (character) character.save.appearance.variant = v; player?.refreshAppearance(); },
};
