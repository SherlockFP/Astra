import * as THREE from 'three';
import { Enemy } from '../Enemy';
import type { BossDef, EnemyDef } from '../../types/enemies';
import { G } from '../../game/G';
import { Assets } from '../../core/Assets';
import { propUrl } from '../../scenes/SceneKit';
import { disposeFlashClones, mapMeshMaterials } from '../sharedMaterials';
import type { WorldLabelHandle } from '../../ui/UI';
import type { World } from '../../world/World';
import { TANK_DUMMY } from '../../data/betaTest';

export type DummyKind = 'normal' | 'elite' | 'boss' | 'small' | 'tank';

const DUMMY_NAMES: Record<DummyKind, string> = {
  normal: 'Eğitim Kuklası',
  elite: 'Elit Kukla',
  boss: 'Boss Kuklası',
  small: 'Grup Kuklası',
  tank: 'Tank Kuklası',
};

/** Damage per window of the DPS meter: the sum of the hits of the last `window` seconds (divided by the window). */
export function dpsOfHits(hits: readonly { t: number; amount: number }[], now: number, window = 5): number {
  const from = now - window;
  let sum = 0;
  for (const h of hits) if (h.t >= from) sum += h.amount;
  return sum / window;
}

function dummyDef(kind: DummyKind): EnemyDef | BossDef {
  const base: EnemyDef = {
    id: `training_dummy_${kind}`,
    name: DUMMY_NAMES[kind],
    model: propUrl('training_dummy'),
    scale: kind === 'small' ? 0.7 : 1.15,
    role: 'tank',
    rank: kind === 'boss' ? 'boss' : kind === 'elite' ? 'elite' : 'trash',
    hpMult: 1,
    dmgMult: 0,
    speed: 0,
    radius: kind === 'small' ? 0.5 : 0.75,
    aggroRange: 0,
    attackRange: 0,
    attackCooldown: 999,
    basicAttack: { id: 'none', name: 'Yok', kind: 'melee', range: 0, cooldown: 999, windup: 1, anim: 'Idle' },
    abilities: [],
    forces: 0,
    xp: 0,
    ccImmune: true,
    anims: { idle: 'Idle', walk: 'Idle', run: 'Idle', death: 'Idle' },
  };
  if (kind === 'boss') {
    return { ...base, title: 'Antrenman Hedefi', phases: [], enrageTimer: 99999, arenaRadius: 12 } as BossDef;
  }
  return base;
}

/**
 * Antrenman kuklası: an Enemy-kind actor that takes any damage, never dies (HP is restored every frame), wobbles on every
 * hit and shows a DPS meter (5 s window + total) above its head. Local-only entity (id from world.allocLocalId()):
 * it has no AI and is never replicated. Combat/vfx treat it like any other enemy (damage numbers, flash, hit sounds).
 * OWNER: scenes module.
 */
export class TrainingDummy extends Enemy {
  readonly dummyKind: DummyKind;
  private visual: THREE.Object3D | null = null;
  private wob = { x: 0, z: 0, vx: 0, vz: 0 };
  private hits: { t: number; amount: number }[] = [];
  private total = 0;
  private lastHit = -99;
  private label: WorldLabelHandle | null = null;
  private labelTimer = 0;
  private off: (() => void) | null = null;
  private strikeT = TANK_DUMMY.strikeEvery;

  constructor(id: number, kind: DummyKind = 'normal') {
    super(id, dummyDef(kind));
    this.dummyKind = kind;
    this.maxHp = this.hp = 1_000_000_000;
    this.height = kind === 'small' ? 1.5 : 2.4;
    this.baseMoveSpeed = 0;
    this.level = 1;
  }

  async loadModel(): Promise<void> {
    const url = propUrl('training_dummy');
    await G.assets.load(url);
    const m = G.assets.instantiate(url);
    m.scale.setScalar(this.def.scale);
    // one shared material per dummy kind (hit flashes clone their own copy, so one flash never lights up every dummy)
    const tintHex = this.dummyKind === 'elite' ? 0xffd070 : this.dummyKind === 'boss' ? 0xff8a7a : this.dummyKind === 'tank' ? 0x7fb0ff : undefined;
    mapMeshMaterials(m, (src) =>
      Assets.sharedMaterial(src, tintHex === undefined ? 'plain' : `color|${tintHex}`, (c) => {
        const mat = c as THREE.MeshStandardMaterial;
        if (tintHex !== undefined) mat.color?.set(tintHex);
      }),
    );
    const holder = new THREE.Group();
    holder.add(m);
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    this.visual = holder;
    this.model = holder;
    this.object3d.add(holder);
  }

  onAdded(world: World): void {
    super.onAdded(world);
    world.nav.setCircle(this.position.x, this.position.z, this.radius, false);
    try {
      this.label = G.ui.addWorldLabel(this.object3d, this.labelHtml(), { offsetY: this.height + 0.8, className: 'efs-wl-wrap', maxDistance: 38 });
    } catch {
      this.label = null;
    }
    this.off = G.events.on('damage', (e) => {
      if (e.targetId !== this.id) return;
      this.onHit(e.amount, e.crit, e.sourceId, e.kind);
    });
  }

  private onHit(amount: number, crit: boolean, sourceId: number | null = null, kind = 'normal'): void {
    const now = this.world?.time ?? 0;
    if (now - this.lastHit > 6) {
      this.total = 0;
      this.hits.length = 0;
    }
    this.lastHit = now;
    this.total += amount;
    this.hits.push({ t: now, amount });
    // the dummy takes every blow like a punching bag: it leans AWAY from the attacker (random direction for dots / unknown sources),
    // crits and big hits swing it harder, damage-over-time ticks only tremble it
    const dot = kind === 'dot';
    const avg = this.total / Math.max(1, this.hits.length);
    const rel = Math.max(0.6, Math.min(2.2, amount / Math.max(1, avg))); // a finisher (bigger than the recent average) swings it harder
    const k = (crit ? 1.7 : 1) * (dot ? 0.25 : 1) * (0.8 + rel * 0.25);
    const src = sourceId !== null ? this.world?.get(sourceId) : undefined;
    let dx = 0, dz = 0;
    if (src && !dot) {
      dx = this.position.x - src.position.x;
      dz = this.position.z - src.position.z;
    }
    const l = Math.hypot(dx, dz);
    if (l > 0.05) {
      dx /= l;
      dz /= l;
    } else {
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    }
    this.wob.vx += dx * 3.8 * k;
    this.wob.vz += dz * 3.8 * k;
    this.labelTimer = 0;
  }

  private dps(now: number): number {
    const from = now - 5;
    while (this.hits.length && this.hits[0].t < from - 1) this.hits.shift();
    return dpsOfHits(this.hits, now, 5);
  }

  private labelHtml(): string {
    const now = this.world?.time ?? 0;
    const active = now - this.lastHit < 6;
    const dps = active ? Math.round(this.dps(now)) : 0;
    const col = this.dummyKind === 'boss' ? '#ff8a7a' : this.dummyKind === 'elite' ? '#ffd070' : this.dummyKind === 'tank' ? '#9fd0ff' : '#e8e2d2';
    return `<div class="efs-wl"><div class="n" style="color:${col}">${DUMMY_NAMES[this.dummyKind]}</div><div class="s" style="color:${active ? '#9fe8ff' : '#8a8f98'}">${
      active ? `DPS ${dps.toLocaleString('tr-TR')} · Toplam ${Math.round(this.total).toLocaleString('tr-TR')}` : 'Vur ve hasarını ölç'
    }</div></div>`;
  }

  update(dt: number): void {
    super.update(dt);
    this.hp = this.maxHp;
    this.alive = true;
    if (this.dummyKind === 'tank') this.tankStrike(dt);
    // spring wobble
    const w = this.wob;
    w.vx += -w.x * 60 * dt - w.vx * 5.5 * dt;
    w.vz += -w.z * 60 * dt - w.vz * 5.5 * dt;
    w.x += w.vx * dt;
    w.z += w.vz * dt;
    if (this.visual) {
      this.visual.rotation.x = THREE.MathUtils.clamp(w.z * 0.09, -0.3, 0.3);
      this.visual.rotation.z = THREE.MathUtils.clamp(-w.x * 0.09, -0.3, 0.3);
    }
    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      this.label?.setText(this.labelHtml());
    }
  }

  /** Tank dummy: hits back. Every TANK_DUMMY.strikeEvery seconds a blow of hpFrac of max HP lands on the local player within range. */
  private tankStrike(dt: number): void {
    this.strikeT -= dt;
    if (this.strikeT > 0) return;
    this.strikeT = TANK_DUMMY.strikeEvery;
    const p = G.world?.localPlayer ?? G.player;
    if (!p || p.isDead || !p.isLocal) return;
    if (Math.hypot(p.position.x - this.position.x, p.position.z - this.position.z) > TANK_DUMMY.range) return;
    G.combat?.hitLocalPlayer({ sourceId: this.id, amount: Math.max(1, Math.round(p.maxHp * TANK_DUMMY.hpFrac)), type: 'physical', melee: true, parryable: true, abilityName: 'Tank Vuruşu' });
  }

  onRemoved(): void {
    this.off?.();
    this.off = null;
    this.label?.remove();
    this.label = null;
    // the dummy draws shared materials (loadModel): only the clones its hit flashes made are freed
    if (this.visual) disposeFlashClones(this.visual);
    super.onRemoved();
  }
}
