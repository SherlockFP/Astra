import * as THREE from 'three';
import { G } from '../game/G';
import { Entity } from '../entities/Entity';
import { bootHarness } from './harness';
import { VFX_IDS, type DamageNumberKind, type TelegraphKind, type TelegraphShape, type VfxId } from '../types/vfx';
import { MUSIC_IDS, SFX_IDS } from '../types/audio';
import type { DamageType, Rarity } from '../types/common';

/** Gallery for the vfx-audio module: every VFX id in a labelled grid, telegraphs, numbers, loot beams, weapon glow, trails, combat sim, audio board. */

const CATS: Record<string, string[]> = {
  'Savaş': ['hit_spark', 'hit_blood', 'hit_magic', 'crit_burst', 'block_spark', 'dodge_dust', 'death_poof', 'death_bones', 'slash_arc', 'slash_arc_big', 'spin_slash', 'ground_slam', 'shockwave', 'charge_trail', 'leap_land'],
  'Ateş/Buz/Şimşek': ['fire_burst', 'fire_ground', 'meteor_fall', 'burn_loop', 'frost_burst', 'frost_nova', 'frost_ground', 'freeze_loop', 'blizzard', 'lightning_strike', 'chain_lightning', 'shock_loop'],
  'Gölge/Zehir/Kutsal': ['shadow_burst', 'shadow_ground', 'curse_loop', 'poison_burst', 'poison_cloud', 'poison_loop', 'holy_burst', 'heal_burst', 'heal_loop', 'arcane_burst', 'blink'],
  'Mermiler': ['fire_projectile', 'frost_projectile', 'lightning_projectile', 'shadow_projectile', 'poison_projectile', 'holy_projectile', 'arcane_projectile', 'arrow_projectile', 'bolt_projectile', 'dagger_projectile', 'bone_projectile', 'rock_projectile'],
  'Buff/Durum': ['buff_aura', 'enrage_aura', 'shield_bubble', 'stun_stars', 'stealth_smoke', 'smoke_zone', 'haste_trail', 'war_cry', 'level_up', 'potion_drink', 'respawn'],
  'Dünya/Loot': ['loot_beam', 'gold_sparkle', 'chest_open', 'portal_swirl', 'torch_fire', 'brazier_fire', 'candle_flame', 'ambient_dust', 'ambient_embers', 'ambient_snow', 'ambient_shadow_wisps', 'waypoint_glow', 'upgrade_success', 'upgrade_fail', 'keystone_insert', 'keystone_upgrade'],
  'Düşman/Boss': ['enemy_cast_glow', 'boss_enrage', 'boss_spawn', 'add_spawn', 'telegraph_flash', 'bolster_burst', 'sanguine_pool', 'bursting_pop', 'explosive_orb', 'explosive_orb_pop', 'volcanic_plume', 'quaking_ring', 'necrotic_hit', 'spiteful_shade', 'storm_tornado', 'inspiring_aura'],
};

class Dummy extends Entity {
  constructor(id: number, kind: 'enemy' | 'player', color: number, x: number, z: number) {
    super(id, kind);
    this.height = 2.2;
    this.radius = 0.6;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8b890 }));
    head.position.y = 2.1;
    this.object3d.add(body, head);
    this.object3d.position.set(x, 0, z);
    (this as unknown as { def: unknown }).def = { id: 'dummy', model: 'dummy' };
  }
  update(): void {}
}

(window as unknown as { __logs: string[] }).__logs = [];
for (const k of ['warn', 'error'] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    (window as unknown as { __logs: string[] }).__logs.push(`${k}: ${a.map(String).join(' ')}`.slice(0, 300));
    orig(...a);
  };
}
window.addEventListener('error', (e) => (window as unknown as { __logs: string[] }).__logs.push('uncaught: ' + e.message));
const h = await bootHarness({ floorSize: 120 });
const { scene, camera, orbit } = h;
const world = h.world;
camera.position.set(0, 16, 22);
orbit.target.set(0, 1, 4);
orbit.maxPolarAngle = Math.PI * 0.49;

// dummies for the combat sim
const enemy = new Dummy(100, 'enemy', 0x8a4a3a, 0, 14);
const player = new Dummy(1, 'player', 0x3a6a9a, 0, 20);
world.add(enemy);
world.add(player);
enemy.yaw = Math.PI;

const ui = document.getElementById('ui-root')!;
ui.style.pointerEvents = 'none';
const panel = document.createElement('div');
panel.style.cssText =
  'position:absolute;left:0;top:0;bottom:0;width:318px;overflow:auto;background:rgba(10,8,16,.86);color:#ddd;font:12px/1.3 monospace;padding:8px;pointer-events:auto;z-index:50;border-right:1px solid #442';
ui.appendChild(panel);
const stats = document.createElement('div');
stats.style.cssText = 'position:absolute;right:8px;top:6px;color:#9f9;font:12px monospace;background:rgba(0,0,0,.5);padding:4px 8px;pointer-events:none;z-index:50;white-space:pre';
ui.appendChild(stats);
const labels = document.createElement('div');
labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';
ui.appendChild(labels);

const style = document.createElement('style');
style.textContent = `.dv-btn{display:inline-block;margin:2px;padding:3px 6px;background:#2a2238;color:#eee;border:1px solid #5a4a78;border-radius:3px;cursor:pointer;font:11px monospace}
.dv-btn:hover{background:#463a68}.dv-btn.on{background:#7a5a18;border-color:#ffd24a}
.dv-h{margin:10px 0 3px;color:#ffd24a;font-weight:bold;border-bottom:1px solid #553;padding-bottom:2px}
.dv-lbl{position:absolute;transform:translate(-50%,-100%);color:#ffe8a0;font:10px monospace;text-shadow:0 0 3px #000,0 0 3px #000;white-space:nowrap}`;
document.head.appendChild(style);

function section(title: string): HTMLDivElement {
  const t = document.createElement('div');
  t.className = 'dv-h';
  t.textContent = title;
  panel.appendChild(t);
  const d = document.createElement('div');
  panel.appendChild(d);
  return d;
}
function btn(parent: HTMLElement, label: string, fn: () => void, title = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'dv-btn';
  b.textContent = label;
  b.title = title;
  b.onclick = fn;
  parent.appendChild(b);
  return b;
}

// -------------------------------------------------------------------- category grid
let gridLabels: { el: HTMLDivElement; pos: THREE.Vector3 }[] = [];
let activeCat = '';
let gridTimer: ReturnType<typeof setInterval> | null = null;
let repeat = true;
const gridPositions = new Map<string, [number, number, number]>();
const testTicks: ((dt: number) => void)[] = [];

function clearLabels(): void {
  for (const l of gridLabels) l.el.remove();
  gridLabels = [];
  gridPositions.clear();
}

function spawnOne(id: string, p: [number, number, number], opts: Record<string, unknown> = {}): void {
  G.vfx.spawn(id as VfxId, p, { dir: [0, 0, 1], target: [p[0] + 4, 0, p[2]], duration: 3.5, ...opts });
}

function spawnCategory(): void {
  const ids = CATS[activeCat] ?? [];
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(ids.length * 1.4))));
  ids.forEach((id) => {
    const p = gridPositions.get(id)!;
    spawnOne(id, p);
  });
  void cols;
}

function showCategory(cat: string): void {
  G.vfx.clear();
  clearLabels();
  activeCat = cat;
  const ids = CATS[cat] ?? [];
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(ids.length * 1.4))));
  const rows = Math.ceil(ids.length / cols);
  const sp = 7;
  ids.forEach((id, i) => {
    const x = ((i % cols) - (cols - 1) / 2) * sp;
    const z = Math.floor(i / cols) * sp - 2;
    const el = document.createElement('div');
    el.className = 'dv-lbl';
    el.textContent = id;
    labels.appendChild(el);
    gridLabels.push({ el, pos: new THREE.Vector3(x, 0.2, z + 2.2) });
    gridPositions.set(id, [x, 0, z]);
    // pedestal marker
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x555566 }));
    m.position.set(x, 0.03, z);
    m.userData.dev = true;
    scene.add(m);
  });
  camera.position.set(0, 7 + rows * 3.2, (rows - 1) * sp * 0.5 + 15 + rows * 2.2);
  orbit.target.set(0, 1, (rows - 1) * sp * 0.5 - 2);
  spawnCategory();
  if (gridTimer) clearInterval(gridTimer);
  gridTimer = setInterval(() => {
    if (repeat && activeCat === cat) spawnCategory();
  }, 4200);
}

const catSec = section('VFX kategorileri (grid)');
for (const cat of Object.keys(CATS)) btn(catSec, cat, () => showCategory(cat));
btn(catSec, 'tekrar: açık', () => {
  repeat = !repeat;
}).title = 'toggle auto repeat';
btn(catSec, 'şimdi tekrar', () => spawnCategory());
btn(catSec, 'temizle', () => {
  G.vfx.clear();
});

const idSec = section('Tek id (merkezde)');
for (const id of VFX_IDS) btn(idSec, id, () => spawnOne(id, [0, 0, 6], { target: [4, 0, 6] }));

// -------------------------------------------------------------------- telegraphs
const tgSec = section('Telegraph');
const shapes: Record<string, TelegraphShape> = {
  circle: { type: 'circle', radius: 4 },
  ring: { type: 'ring', inner: 2, outer: 5 },
  cone: { type: 'cone', radius: 7, angle: 70 },
  line: { type: 'line', length: 10, width: 2.4 },
  rect: { type: 'rect', width: 5, length: 8 },
};
for (const [name, sh] of Object.entries(shapes)) {
  for (const kind of ['danger', 'soak', 'safe', 'friendly'] as TelegraphKind[]) {
    btn(tgSec, `${name}/${kind}`, () => G.vfx.telegraph(sh, [0, 0, 6], [0, 1], 2.2, kind));
  }
}
btn(tgSec, 'hepsi', () => {
  let i = 0;
  for (const [, sh] of Object.entries(shapes)) {
    G.vfx.telegraph(sh, [(i - 2) * 11, 0, 6], [0, 1], 2.6, (['danger', 'soak', 'safe', 'friendly', 'danger'] as TelegraphKind[])[i]);
    i++;
  }
});

// -------------------------------------------------------------------- damage numbers
const dnSec = section('Hasar sayıları');
const kinds: DamageNumberKind[] = ['normal', 'crit', 'heal', 'player_hurt', 'dot', 'immune', 'dodge', 'block', 'xp', 'gold'];
for (const k of kinds) btn(dnSec, k, () => G.vfx.damageNumber([Math.random() * 2 - 1, 2.4, 14], 100 + Math.floor(Math.random() * 9000), k));
let spam: ReturnType<typeof setInterval> | null = null;
btn(dnSec, 'spam (toggle)', () => {
  if (spam) {
    clearInterval(spam);
    spam = null;
  } else
    spam = setInterval(() => {
      for (let i = 0; i < 3; i++) {
        const k = kinds[Math.floor(Math.random() * 4.2)];
        G.vfx.damageNumber([Math.random() * 1.2 - 0.6, 2.4, 14], Math.floor(Math.random() * 3000), k);
      }
    }, 120);
});

// -------------------------------------------------------------------- loot beams
const lootSec = section('Loot ışınları');
const lootObjs: THREE.Object3D[] = [];
function lootRow(): void {
  G.vfx.clear();
  for (const o of lootObjs) o.removeFromParent();
  lootObjs.length = 0;
  clearLabels();
  const rar: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
  rar.forEach((r, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
    m.position.y = 0.45;
    g.add(m);
    g.position.set((i - 2.5) * 5, 0, 8);
    scene.add(g);
    lootObjs.push(g);
    G.vfx.lootBeam(g, r);
    const el = document.createElement('div');
    el.className = 'dv-lbl';
    el.textContent = r;
    labels.appendChild(el);
    gridLabels.push({ el, pos: new THREE.Vector3((i - 2.5) * 5, 0.2, 9.5) });
  });
  camera.position.set(0, 7, 24);
  orbit.target.set(0, 3, 8);
}
btn(lootSec, 'rarity sırası', lootRow);

// -------------------------------------------------------------------- weapon glow + trail
const wgSec = section('Silah parıltısı / iz');
const swords: THREE.Object3D[] = [];
function makeSword(): THREE.Object3D {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.5, 0.04), new THREE.MeshStandardMaterial({ color: 0xc8ccd8, metalness: 0.8, roughness: 0.4 }));
  blade.position.y = 0.95;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0x8a6a30 }));
  guard.position.y = 0.2;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), new THREE.MeshStandardMaterial({ color: 0x4a2a18 }));
  grip.position.y = 0;
  g.add(blade, guard, grip);
  return g;
}
function swordRow(): void {
  G.vfx.clear();
  for (const o of swords) o.removeFromParent();
  swords.length = 0;
  clearLabels();
  [0, 7, 9, 12, 15].forEach((lvl, i) => {
    const s = makeSword();
    s.position.set((i - 2) * 3.2, 1.6, 8);
    s.rotation.z = 0.25;
    scene.add(s);
    swords.push(s);
    G.vfx.weaponGlow(s, lvl);
    const el = document.createElement('div');
    el.className = 'dv-lbl';
    el.textContent = lvl ? `+${lvl}` : '+0';
    labels.appendChild(el);
    gridLabels.push({ el, pos: new THREE.Vector3((i - 2) * 3.2, 0.2, 8) });
  });
  camera.position.set(0, 4, 17);
  orbit.target.set(0, 1.6, 8);
}
btn(wgSec, 'kılıç sırası (0,7,9,12,15)', swordRow);
let spinner: THREE.Object3D | null = null;
btn(wgSec, 'dönen çubuk + iz', () => {
  if (spinner) spinner.removeFromParent();
  spinner = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), new THREE.MeshStandardMaterial({ color: 0x886644 }));
  stick.position.y = 1.2;
  const tip = new THREE.Object3D();
  tip.position.y = 2.4;
  stick.add(tip);
  (spinner as THREE.Group).add(stick);
  spinner.position.set(0, 0.2, 8);
  scene.add(spinner);
  spinner.userData.tip = tip;
  G.vfx.trail(tip, 0xffd070, 12, 0.7);
  camera.position.set(0, 5, 16);
  orbit.target.set(0, 2, 8);
});

// -------------------------------------------------------------------- combat sim (events)
const simSec = section('Savaş simülasyonu (events)');
function at(e: Entity): [number, number, number] {
  return [e.position.x, e.position.y + 1.1, e.position.z];
}
function hit(type: DamageType, crit = false, kind: DamageNumberKind = 'normal'): void {
  G.events.emit('damage', { targetId: enemy.id, sourceId: player.id, amount: crit ? 2400 + Math.floor(Math.random() * 900) : 350 + Math.floor(Math.random() * 400), crit, type, kind, pos: at(enemy) });
}
for (const t of ['physical', 'fire', 'frost', 'lightning', 'shadow', 'poison', 'holy', 'arcane'] as DamageType[]) {
  btn(simSec, t, () => hit(t));
  btn(simSec, t + '!', () => hit(t, true));
}
btn(simSec, 'oyuncu yaralandı', () => G.events.emit('damage', { targetId: player.id, sourceId: enemy.id, amount: 420, crit: false, type: 'physical', kind: 'player_hurt', pos: at(player) }));
btn(simSec, 'dot', () => hit('fire', false, 'dot'));
btn(simSec, 'bağışık', () => G.events.emit('damage', { targetId: enemy.id, sourceId: player.id, amount: 0, crit: false, type: 'physical', kind: 'immune', pos: at(enemy) }));
btn(simSec, 'bloklandı', () => G.events.emit('damage', { targetId: player.id, sourceId: enemy.id, amount: 0, crit: false, type: 'physical', kind: 'block', pos: at(player) }));
btn(simSec, 'heal', () => G.events.emit('heal', { targetId: player.id, sourceId: player.id, amount: 600, pos: at(player) }));
btn(simSec, 'death', () => G.events.emit('death', { entityId: enemy.id, killerId: player.id, pos: [enemy.position.x, 0, enemy.position.z] }));
btn(simSec, 'level up', () => G.events.emit('player:levelup', { level: 2 }));
// whirlwind-like horde spam
let horde: ReturnType<typeof setInterval> | null = null;
btn(simSec, 'horde spam', () => {
  if (horde) {
    clearInterval(horde);
    horde = null;
  } else
    horde = setInterval(() => {
      for (let i = 0; i < 6; i++) hit((['physical', 'fire', 'frost', 'lightning'] as DamageType[])[i % 4], Math.random() < 0.2);
    }, 100);
});
const stSec = section('Durumlar (status:applied)');
for (const s of ['burn', 'freeze', 'stun', 'curse', 'poison', 'shock', 'shield', 'stealth', 'haste', 'enrage', 'regen', 'inspiring']) {
  btn(stSec, s, () => G.events.emit('status:applied', { targetId: enemy.id, status: s, duration: 4, stacks: 1 }));
}
btn(stSec, 'cast glow', () => G.events.emit('enemy:castStart', { enemyId: enemy.id, abilityId: 'x', name: 'Test', castTime: 1.5, interruptible: true }));
btn(stSec, 'flash kırmızı', () => G.vfx.flash(enemy.object3d, 0xff2010, 0.2));
btn(stSec, 'projektil uçuşu', () => {
  for (const id of ['fire_projectile', 'frost_projectile', 'lightning_projectile', 'arcane_projectile', 'shadow_projectile', 'poison_projectile', 'holy_projectile', 'arrow_projectile', 'dagger_projectile', 'bone_projectile', 'rock_projectile']) {
    const idx = ['fire_projectile', 'frost_projectile', 'lightning_projectile', 'arcane_projectile', 'shadow_projectile', 'poison_projectile', 'holy_projectile', 'arrow_projectile', 'dagger_projectile', 'bone_projectile', 'rock_projectile'].indexOf(id);
    const v = G.vfx.createProjectileVisual(id as VfxId, 1);
    scene.add(v.object);
    const z0 = 20;
    const x = (idx - 5) * 1.8;
    let t = 0;
    const tick = (dt: number): void => {
      t += dt;
      v.object.position.set(x, 1.4, z0 - t * 10);
      v.object.lookAt(x, 1.4, z0 - t * 10 - 1);
      v.update(dt);
      if (t > 2.4) {
        v.dispose();
        return;
      }
    };
    G.engine.onUpdate(function f(dt) {
      if (v.object.parent) tick(dt);
    }, 11);
  }
});

// -------------------------------------------------------------------- audio board
const auSec = section('Ses panosu');
const vol = document.createElement('div');
auSec.appendChild(vol);
for (const k of ['masterVolume', 'musicVolume', 'sfxVolume', 'uiVolume'] as const) {
  const l = document.createElement('label');
  l.style.cssText = 'display:block;font-size:10px';
  l.textContent = k + ' ';
  const r = document.createElement('input');
  r.type = 'range';
  r.min = '0';
  r.max = '1';
  r.step = '0.05';
  r.value = String(G.settings.data[k]);
  r.oninput = () => G.settings.set(k, parseFloat(r.value));
  l.appendChild(r);
  vol.appendChild(l);
}
const musicSec = section('Müzik');
for (const m of MUSIC_IDS) btn(musicSec, m, () => G.audio.music(m, 1.5));
btn(musicSec, 'sus', () => G.audio.music(null, 1));
btn(musicSec, 'boss:engaged', () => G.events.emit('boss:engaged', { bossId: 'x', entityId: enemy.id }));
btn(musicSec, 'boss:defeated', () => G.events.emit('boss:defeated', { bossId: 'x', entityId: enemy.id }));
const sfxSec = section('SFX');
for (const s of SFX_IDS) btn(sfxSec, s, () => G.audio.play(s));
const voiceSec = section('Ses: sınıf sesleri / ambiyans / thump');
for (const pack of ['warrior', 'mage', 'orc'] as const) {
  for (const k of ['attack', 'light', 'heavy', 'crit', 'hurt', 'death', 'hup', 'hut', 'defend', 'bleed', 'fire', 'poison', 'angry', 'laugh'] as const) {
    btn(voiceSec, pack[0] + ':' + k, () => G.audio.voice(k, { pack }));
  }
}
btn(voiceSec, 'thump hafif', () => G.audio.thump(0.4));
btn(voiceSec, 'thump ağır', () => G.audio.thump(0.9, 90, 30, 0.3));
btn(voiceSec, 'amb: zindan', () => G.audio.ambience('amb_dungeon_bed'));
btn(voiceSec, 'amb: rüzgar', () => G.audio.ambience('amb_wind'));
btn(voiceSec, 'amb: yok', () => G.audio.ambience(null));
btn(voiceSec, 'duck', () => G.audio.duck(0.6, 1.2));
btn(voiceSec, 'oyuncu öldü', () => G.events.emit('player:died', { entityId: player.id, local: true }));
btn(voiceSec, 'oyuncu dirildi', () => G.events.emit('player:revived', { entityId: player.id, local: true }));
btn(voiceSec, 'run:completed (zafer)', () => G.events.emit('run:completed', { state: { failed: false, completed: true } as never, record: null, rewards: [] }));
btn(voiceSec, 'run:completed (yenilgi)', () => G.events.emit('run:completed', { state: { failed: true, completed: false } as never, record: null, rewards: [] }));
btn(voiceSec, 'loot: altın', () => G.events.emit('loot:pickedUp', { gold: 240 }));
btn(voiceSec, 'loot: efsanevi', () => G.events.emit('loot:pickedUp', { item: { rarity: 'legendary' } as never }));

// -------------------------------------------------------------------- per-frame
h.onFrame((dt) => {
  for (const s of swords) s.rotation.y += dt * 0.8;
  if (spinner) {
    spinner.rotation.z = Math.sin(performance.now() / 380) * 1.1;
    spinner.rotation.y += dt * 2;
  }
  // labels
  const w = G.engine.width;
  const hgt = G.engine.height;
  const v = new THREE.Vector3();
  for (const l of gridLabels) {
    v.copy(l.pos).project(camera);
    l.el.style.display = v.z > 1 ? 'none' : '';
    l.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
    l.el.style.top = `${(-v.y * 0.5 + 0.5) * hgt}px`;
  }
  const s = G.vfx.stats();
  const a = G.audio.stats();
  stats.textContent = `fps ${G.engine.fps}  add ${s.add}  alpha ${s.alpha}  decal ${s.decal}  loops ${s.loops}  ribbons ${s.ribbons}  proj ${s.visuals}\nsheets ${G.vfx.sheets.ready ? 'ok' : 'loading'}  audio ${a.state} buf ${a.buffers}/${a.loading} voices ${a.voices} music ${a.music ?? '-'}`;
});

(window as unknown as { dev: unknown }).dev = {
  showCategory,
  spawn: (id: string, x = 0, z = 6, opts: Record<string, unknown> = {}) => spawnOne(id, [x, 0, z], opts),
  cam: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
    camera.position.set(x, y, z);
    orbit.target.set(tx, ty, tz);
  },
  hit,
  lootRow,
  swordRow,
  enemy,
  player,
  repeat: (v: boolean) => (repeat = v),
  blank: () => { testTicks.length = 0; clearLabels(); if (gridTimer) clearInterval(gridTimer); repeat = false; G.vfx.clear(); scene.children.filter((o) => o.userData.dev).forEach((o) => o.removeFromParent()); },
  /** deterministic stepping: freezes the engine clock and advances only the vfx by `sec` */
  step: (sec: number, dt = 1 / 60) => { G.engine.timeScale = 0; let t = 0; while (t < sec - 1e-6) { for (const f of testTicks) f(dt); G.vfx.update(dt); t += dt; } },
  /** fly every projectile visual sideways for deterministic screenshots */
  projRow: (ids: string[], speed = 9) => {
    ids.forEach((id, i) => {
      const v = G.vfx.createProjectileVisual(id as VfxId, 1);
      scene.add(v.object);
      let x = -6;
      v.object.position.set(x, 1.4, 0.5 + i * 1.0);
      v.object.lookAt(x + 1, 1.4, 0.5 + i * 1.0);
      testTicks.push((dt) => { x += speed * dt; v.object.position.x = x; v.update(dt); });
    });
  },
  tele: (shape: string, kind = 'danger', dur = 2, progress = -1) => {
    const sh = shapes[shape];
    const t = G.vfx.telegraph(sh, [0, 0, 6], [0, 1], dur, kind as TelegraphKind);
    if (progress >= 0) t.setProgress(progress);
  },
  numbers: () => { kinds.forEach((k, i) => G.vfx.damageNumber([(i - 4.5) * 1.1, 2.2, 6], 1234 + i * 111, k)); },
  panel: (v: boolean) => (panel.style.display = v ? '' : 'none'),
  once: (id: string, x = 0, z = 6, opts: Record<string, unknown> = {}, y = 0) => { repeat = false; if (gridTimer) clearInterval(gridTimer); G.vfx.clear(); spawnOne(id, [x, y, z], opts); },
  cats: CATS,
};
showCategory('Savaş');

window.addEventListener('keydown', (e) => { if (e.key === 'h' && !(e.target instanceof HTMLInputElement)) panel.style.display = panel.style.display === 'none' ? '' : 'none'; });
