import * as THREE from 'three';
import { bootHarness } from './harness';
import { G } from '../game/G';
import { World } from '../world/World';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { CharacterState } from '../systems/CharacterState';
import type { GameScene } from '../core/SceneManager';
import type { SceneId, ClassId } from '../types/common';
import { DUNGEON_ENEMY_ID_BASE, PARTY_ID_BASE } from '../types/common';
import type { EnemyDef } from '../types/enemies';

/**
 * Dev page for the net module (dev/net.html). Open TWO (or three) tabs/windows of the same browser:
 *   tab A: "Oda kur (local)"   -> shows a room code
 *   tab B: type the code, "Katıl"
 * Every tab moves its real Player entity with WASD, remote players are created by Replication (pstate/gear),
 * the host simulates one enemy (id 100) that follows a circle and clients receive it through `snap`.
 * F = client sends a `hit` to the host (host lowers the enemy's hp, replicated back via snap).
 * window.dev exposes helpers for scripted tests.
 */

const params = new URLSearchParams(location.search);
const NAME = params.get('name') ?? 'Tab' + Math.random().toString(36).slice(2, 5).toUpperCase();
const CLASS = (params.get('class') as ClassId | null) ?? (['knight', 'barbarian', 'mage', 'rogue'] as ClassId[])[Math.floor(Math.random() * 4)];
const SLOT_COLORS = [0xffcc33, 0x33ccff, 0xff5577, 0x66ff66, 0xcc77ff];

const DEV_ENEMY_DEF = {
  id: 'dev_dummy', name: 'Test Düşmanı', model: '', scale: 1, role: 'melee', rank: 'trash', hpMult: 1, dmgMult: 1, speed: 3, radius: 0.9,
  aggroRange: 10, attackRange: 2, attackCooldown: 2, abilities: [], forces: 1, xp: 1,
  anims: { idle: 'Idle', walk: 'Walk', run: 'Run', hit: 'Hit', death: 'Death' },
  basicAttack: { id: 'basic', name: 'Vuruş', kind: 'melee', range: 2, cooldown: 2, windup: 0.3, anim: 'Attack' },
} as unknown as EnemyDef;

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'KeyF') dev.hitEnemy();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

const log: string[] = [];
function addLog(line: string): void {
  log.push(`${new Date().toLocaleTimeString()} ${line}`);
  if (log.length > 60) log.shift();
}

/* ------------------------------------------------------------------------------------------------ dev scene */

class DevScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  world!: World;
  local: Player | null = null;
  enemy: Enemy | null = null;
  private markers = new WeakSet<Player>();
  private t = 0;
  private offHit: (() => void) | null = null;
  private readonly out = { x: 0, y: 0, z: 0, yaw: 0 };

  constructor(readonly id: SceneId) {}

  async enter(): Promise<void> {
    const dungeon = this.id === 'dungeon';
    this.scene.background = new THREE.Color(dungeon ? 0x1a0c10 : 0x14201a);
    this.scene.fog = new THREE.Fog(dungeon ? 0x1a0c10 : 0x14201a, 30, 110);
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x302418, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(12, 20, 8);
    this.scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: dungeon ? 0x4a2a2e : 0x3b4a36, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.scene.add(new THREE.GridHelper(120, 30, 0x777777, 0x2a2a2a));

    this.world = new World(this.scene);
    const slot = G.net.localSlot;
    const ch = G.character!;
    const p = new Player({
      id: PARTY_ID_BASE + slot, slot, classId: ch.classId, name: ch.save.name, level: ch.level, isLocal: true, peerId: G.net.selfId, character: ch,
    });
    try {
      await p.loadModel();
    } catch (e) {
      console.warn('[dev] local model failed', e);
    }
    p.position.set(slot * 3 - 6, 0, 8);
    this.world.add(p);
    this.world.localPlayer = p;
    this.local = p;

    // host-simulated enemy with a deterministic id (every peer creates it, only the host moves it)
    const e = new Enemy(DUNGEON_ENEMY_ID_BASE, DEV_ENEMY_DEF);
    e.authority = G.net.isAuthority;
    e.hp = e.maxHp = 100;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 1.4), new THREE.MeshStandardMaterial({ color: 0xcc2222, emissive: 0x330000 }));
    body.position.y = 1;
    e.setModel(body, null);
    e.position.set(0, 0, 0);
    this.world.add(e);
    this.enemy = e;

    // host applies client hits (client-computed damage model)
    this.offHit = G.net.on('hit', (hit) => {
      if (!G.net.isAuthority || !this.enemy || hit.targetId !== this.enemy.id) return;
      this.enemy.hp = this.enemy.hp - hit.amount <= 0 ? this.enemy.maxHp : this.enemy.hp - hit.amount;
      addLog(`hit ${hit.amount} -> enemy hp ${Math.round(this.enemy.hp)}`);
    });

    G.vfx.attach(this.scene, this.camera);
    G.world = this.world;
    G.player = p;
    G.net.sceneReady(this.id);
    addLog(`scene ${this.id} ready (slot ${slot}, id ${p.id})`);
  }

  update(dt: number): void {
    const w = this.world;
    const p = this.local;
    if (!w || !p) return;
    this.t += dt;
    // local movement (WASD / arrows, or the scripted auto-walk)
    let dx = 0, dz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (dev.autoWalk) {
      dx = Math.cos(this.t * 0.8);
      dz = Math.sin(this.t * 0.8);
    }
    const len = Math.hypot(dx, dz);
    const moving = len > 0.01;
    if (moving) {
      dx /= len;
      dz /= len;
      const sp = 7;
      p.position.x += dx * sp * dt;
      p.position.z += dz * sp * dt;
      p.yaw = Math.atan2(dx, dz);
      p.velocity.set(dx * sp, 0, dz * sp);
    } else p.velocity.set(0, 0, 0);
    try {
      p.anim?.setBase(moving ? 'Running_A' : 'Idle', { fade: 0.1 });
    } catch {
      /* no model */
    }

    // host enemy: circle path
    const e = this.enemy;
    if (e && e.authority) {
      const a = this.t * 0.5;
      const nx = Math.cos(a) * 7, nz = Math.sin(a) * 7;
      e.yaw = Math.atan2(nx - e.position.x, nz - e.position.z);
      e.position.set(nx, 0, nz);
    } else if (e && e.interp.sample(G.engine.time, this.out)) {
      // (Enemy.update samples this itself once the enemies module implements it; harmless duplicate)
      e.position.set(this.out.x, 0, this.out.z);
      e.yaw = this.out.yaw;
    }

    w.update(dt);

    // coloured marker above every player (so the test works even when a model failed to load)
    for (const pl of w.players) {
      if (this.markers.has(pl)) continue;
      this.markers.add(pl);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshBasicMaterial({ color: SLOT_COLORS[pl.slot % 5] }));
      m.position.y = 3.2;
      pl.object3d.add(m);
    }

    // follow camera
    const cp = p.position;
    this.camera.position.set(cp.x, 16, cp.z + 14);
    this.camera.lookAt(cp.x, 0.5, cp.z);
  }

  exit(): void {
    this.offHit?.();
    this.world?.dispose();
    G.world = null;
    G.player = null;
  }
}

/* ------------------------------------------------------------------------------------------------ dev api */

const dev = {
  autoWalk: false,
  async host(password?: string): Promise<string> {
    return G.net.hostRoom({ name: `${NAME}'in Odası`, password, transport: 'local' });
  },
  async join(code: string, password?: string): Promise<void> {
    await G.net.joinRoom(code, { password, transport: 'local' });
    // test tabs are often hidden (rAF stops): keep simulating like a host does
    if (G.net.role === 'client') G.engine.setBackgroundTick(true);
  },
  leave(): void {
    G.net.leaveRoom();
  },
  chat(text: string): void {
    G.net.sendChat(text);
  },
  hitEnemy(): void {
    const e = (G.scenes.current as DevScene | null)?.enemy;
    if (!e) return;
    if (G.net.isAuthority) {
      e.hp = e.hp - 10 <= 0 ? e.maxHp : e.hp - 10;
    } else G.net.sendToHost('hit', { targetId: e.id, amount: 10, crit: false, type: 'physical' });
  },
  scene(id: 'town' | 'dungeon'): void {
    if (G.net.role === 'client') G.net.requestSceneFromHost(id, { dungeonId: 'dev', difficulty: 'normal', keyLevel: 0, seed: 1, affixes: [], enemyLevel: 1, partySize: 1, keyOwner: G.net.selfId });
    else G.net.requestScene(id, { dungeonId: 'dev', difficulty: 'normal', keyLevel: 0, seed: 1, affixes: [], enemyLevel: 1, partySize: G.net.peers.size, keyOwner: G.net.selfId });
  },
  state() {
    const ds = G.scenes.current as DevScene | null;
    const rep = G.net.replication;
    return {
      name: NAME,
      role: G.net.role,
      selfId: G.net.selfId,
      slot: G.net.localSlot,
      room: G.net.roomId,
      scene: G.scenes.current?.id ?? null,
      sceneReady: G.net.sceneIsReady,
      peers: G.net.members().map((p) => ({ id: p.peerId.slice(0, 6), slot: p.slot, name: p.name, ping: p.ping, host: p.isHost, ready: p.ready, ls: p.loadedScene })),
      players: G.world?.players.map((p) => ({ id: p.id, name: p.name, local: p.isLocal, x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), vis: p.object3d.visible, hp: Math.round(p.hp) })) ?? [],
      enemy: ds?.enemy ? { x: +ds.enemy.position.x.toFixed(2), z: +ds.enemy.position.z.toFixed(2), hp: Math.round(ds.enemy.hp), authority: ds.enemy.authority } : null,
      rep: rep?.stats,
      net: G.net.getStats(),
      log: log.slice(-12),
    };
  },
};
(window as unknown as { dev: typeof dev }).dev = dev;

/* ------------------------------------------------------------------------------------------------ panel */

function buildPanel(): { refresh(): void } {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed', top: '8px', left: '8px', width: '360px', maxHeight: '96vh', overflow: 'auto', zIndex: '99999', font: '12px/1.35 Consolas, monospace',
    color: '#e8e0d0', background: 'rgba(10,8,6,0.88)', border: '1px solid #6b5530', padding: '8px', pointerEvents: 'auto',
  });
  el.innerHTML = `
    <div style="color:#e8c46a;font-weight:bold">NET DEV &middot; <span id="d-name"></span></div>
    <div id="d-status" style="margin:4px 0"></div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">
      <button id="b-host">Oda kur (local)</button>
      <input id="i-code" placeholder="KOD" size="7" style="text-transform:uppercase"/>
      <button id="b-join">Katıl</button>
      <button id="b-leave">Ayrıl</button>
    </div>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">
      <button id="b-town">Kasaba</button><button id="b-dun">Zindan</button>
      <button id="b-rc">Hazırlık kontrolü</button><button id="b-ready">Hazırım</button>
      <button id="b-auto">Otomatik yürü</button><button id="b-hit">Vur (F)</button>
    </div>
    <div style="display:flex;gap:4px;margin-bottom:4px"><input id="i-chat" placeholder="sohbet..." style="flex:1"/><button id="b-chat">Gönder</button></div>
    <div id="d-peers"></div><hr style="border-color:#3a2d18"/><div id="d-stats"></div><hr style="border-color:#3a2d18"/><div id="d-log" style="color:#b3a284;white-space:pre-wrap"></div>`;
  document.body.appendChild(el);
  const $ = (id: string) => el.querySelector('#' + id) as HTMLElement;
  ($('d-name') as HTMLElement).textContent = `${NAME} (${CLASS})`;
  const input = $('i-code') as HTMLInputElement;
  $('b-host').onclick = () => void dev.host();
  $('b-join').onclick = () => void dev.join(input.value);
  $('b-leave').onclick = () => dev.leave();
  $('b-town').onclick = () => dev.scene('town');
  $('b-dun').onclick = () => dev.scene('dungeon');
  $('b-rc').onclick = () => G.net.startReadyCheck();
  $('b-ready').onclick = () => G.net.setReady(true);
  $('b-auto').onclick = () => { dev.autoWalk = !dev.autoWalk; };
  $('b-hit').onclick = () => dev.hitEnemy();
  const chat = $('i-chat') as HTMLInputElement;
  const sendChat = () => { if (chat.value.trim()) dev.chat(chat.value); chat.value = ''; };
  $('b-chat').onclick = sendChat;
  chat.onkeydown = (e) => { if (e.key === 'Enter') sendChat(); e.stopPropagation(); };
  input.onkeydown = (e) => e.stopPropagation();
  let last = { t: performance.now(), s: 0, r: 0 };
  return {
    refresh() {
      const st = dev.state();
      const now = performance.now();
      const dtS = (now - last.t) / 1000;
      let rate = '';
      if (dtS >= 1) {
        rate = `up ${Math.round((st.net.sentBytes - last.s) / dtS)} B/s  down ${Math.round((st.net.recvBytes - last.r) / dtS)} B/s`;
        last = { t: now, s: st.net.sentBytes, r: st.net.recvBytes };
        ($('d-stats') as HTMLElement).dataset.rate = rate;
      }
      $('d-status').innerHTML = `role <b>${st.role}</b> &middot; room <b>${st.room ?? '-'}</b> &middot; slot ${st.slot} &middot; scene ${st.scene} ${st.sceneReady ? '' : '(yükleniyor)'}`;
      $('d-peers').innerHTML = st.peers.map((p) => `${p.host ? '★' : '·'} #${p.slot} <b>${p.name}</b> ${p.ping}ms ${p.ready ? '✔' : ''} [${p.ls ?? '...'}] ${p.id}`).join('<br>') || '(boş)';
      const rep = st.rep;
      $('d-stats').innerHTML =
        `${(($('d-stats') as HTMLElement).dataset.rate) ?? ''}<br>buffer ${st.net.buffered} &middot; players in world ${st.players.length}<br>` +
        (rep ? `pstate ↑${rep.pstateSent} ↓${rep.pstateRecv} &middot; snap ↑${rep.snapSent} ↓${rep.snapRecv} (unk ${rep.snapUnknown}) &middot; gear ↑${rep.gearSent} ↓${rep.gearRecv}<br>` : '') +
        st.players.map((p) => `${p.local ? 'ben' : 'uzak'} #${p.id} ${p.name} (${p.x}, ${p.z}) hp ${p.hp}${p.vis ? '' : ' [gizli]'}`).join('<br>') +
        (st.enemy ? `<br>düşman (${st.enemy.x}, ${st.enemy.z}) hp ${st.enemy.hp} ${st.enemy.authority ? '[host]' : '[client]'}` : '');
      $('d-log').textContent = log.slice(-10).join('\n');
    },
  };
}

/* ------------------------------------------------------------------------------------------------ boot */

async function main(): Promise<void> {
  await bootHarness({ orbit: false, floor: false });
  G.character = CharacterState.create(NAME, CLASS, 0);
  G.scenes.onView = (scene, camera) => {
    G.engine.setView(scene, camera);
    G.vfx.attach(scene, camera);
  };
  G.scenes.onChange = (from, to) => G.events.emit('scene:changed', { from, to });
  G.scenes.onLeaving = (from, to) => G.events.emit('scene:leaving', { from, to });
  G.scenes.register('town', () => new DevScene('town'));
  G.scenes.register('dungeon', () => new DevScene('dungeon'));
  G.engine.onUpdate((dt) => G.scenes.update(dt), 0);

  // capture toasts / events into the log
  G.ui.toast = (text: string, kind?: string) => addLog(`[toast ${kind ?? 'info'}] ${text}`);
  G.events.on('net:chat', (c) => addLog(`[chat] ${c.from ? c.from + ': ' : '* '}${c.text}`));
  G.events.on('net:peerJoined', (p) => addLog(`peerJoined ${p.name}`));
  G.events.on('net:peerLeft', (p) => addLog(`peerLeft ${p.name}`));
  G.events.on('net:status', (s) => addLog(`status ${s.role} connected=${s.connected} room=${s.roomId}`));
  G.events.on('party:allLoaded', () => addLog('party:allLoaded'));
  G.events.on('party:readyCheck', (r) => addLog(`readyCheck active=${r.active}`));

  // Test tabs may live in a pane that is not composited (rAF stalls even though visibilityState says visible):
  // keep stepping the engine without rendering so replication keeps running.
  let lastRaf = performance.now();
  const rafLoop = () => {
    lastRaf = performance.now();
    requestAnimationFrame(rafLoop);
  };
  requestAnimationFrame(rafLoop);
  setInterval(() => {
    const now = performance.now();
    if (now - lastRaf > 250) (G.engine as unknown as { step(t: number, render: boolean): void }).step(now, false);
  }, 50);

  const panel = buildPanel();
  setInterval(() => panel.refresh(), 250);
  await G.scenes.go('town');
  addLog(`hazır: ${NAME} (${CLASS})`);
}

void main();
