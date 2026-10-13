import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import { HoldF } from './ChannelGate';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { RNG } from '../../core/utils';
import type { NodeTypeDef } from '../../types/professions';
import { GATHER_HOLD_SEC, GATHER_MOVE_TOL_M, GATHER_RANGE_M, SKILL_COLOR_HEX, SKILL_COLOR_NAME, SKILL_MAX } from '../../data/professions';
import { profName } from '../../systems/Professions';
import { toast } from '../../systems/notify';

/**
 * Gather node (GDD_LIFE §1.5-1.7, MVP): an ore vein or a herb patch placed by scenes/world/WorldGather.ts.
 * Hold F for GATHER_HOLD_SEC (the channel is cancelled by walking away, by damage or by releasing F). The completed hold
 * goes to G.professions.harvest(): loot, skill-up and the personal cooldown. Depletion is per character (saved in the
 * `gather.cd` flag), so party members never compete for a node. The model is voxel blocks built in code (no asset).
 * OWNER: scenes module (WP-09 professions MVP).
 */
export interface GatherNodeOpts {
  /** Stable node key (`<field>#<index>`), the save key of its cooldown. */
  key: string;
  type: NodeTypeDef;
  rich: boolean;
  /** Base respawn of this node (s, from the layout field). Rich veins take x1.5 (see respawnAtMs). */
  respawnSec: number;
}

/** Shared unit cube for every voxel block. */
const CUBE = new THREE.BoxGeometry(1, 1, 1);
/** Depleted node shrinks to this fraction. */
const DEPLETED_SCALE = 0.45;

export class GatherNode extends InteractableProp {
  readonly key: string;
  readonly type: NodeTypeDef;
  readonly rich: boolean;
  readonly respawnSec: number;
  /** Epoch ms when the node is back (0 = available). */
  private depletedUntil = 0;
  private readonly hold = new HoldF(GATHER_HOLD_SEC, GATHER_MOVE_TOL_M);
  private holdHp = 0;
  private labelTimer = 0;

  constructor(id: number, o: GatherNodeOpts) {
    super(id);
    this.key = o.key;
    this.type = o.type;
    this.rich = o.rich;
    this.respawnSec = o.respawnSec;
    this.interactRange = GATHER_RANGE_M;
    this.radius = 0.5;
    this.height = 1;
  }

  get interactPrompt(): string {
    const name = this.type.name + (this.rich ? ' (Zengin)' : '');
    if (this.isDepleted()) return `${name} – Tükendi`;
    const gate = G.professions?.gate(this.type.prof, this.type.skillReq);
    if (gate && !gate.ok) return `${name} – ${gate.reason}`;
    const skill = G.professions?.skill(this.type.prof) ?? 1;
    return `${name} – Topla [F basılı tut] (${profName(this.type.prof)} ${skill}/${SKILL_MAX})`;
  }

  async load(): Promise<void> {
    const root = this.buildModel();
    this.object3d.add(root);
    this.model = root;
    this.depletedUntil = G.professions?.cooldownUntil(this.key) ?? 0;
    this.applyScale();
    this.showLabel();
  }

  interact(p: Player): void {
    if (this.hold.running) return;
    if (this.isDepleted()) {
      toast('Bu damar henüz yenilenmedi.', 'info');
      return;
    }
    const gate = G.professions?.gate(this.type.prof, this.type.skillReq);
    if (!gate) return;
    if (!gate.ok) {
      toast(gate.reason ?? 'Yetersiz beceri.', 'warning');
      return;
    }
    this.holdHp = p.hp;
    this.hold.start(p, p.position.x, p.position.z);
    this.labelTimer = 0;
    this.showLabel(0);
  }

  update(dt: number): void {
    super.update(dt);
    if (this.depletedUntil > 0 && Date.now() >= this.depletedUntil) this.reset();
    if (this.hold.running) this.tickHold(dt);
  }

  private tickHold(dt: number): void {
    const p = this.hold.holderPlayer;
    if (!p) return;
    if (p.hp < this.holdHp) {
      this.cancel('Saldırıya uğradın, toplama iptal edildi.');
      return;
    }
    const st = this.hold.tick(dt);
    if (st === 'run') {
      this.labelTimer -= dt;
      const t01 = this.hold.progress;
      this.emitProgress(t01);
      if (this.labelTimer <= 0) {
        this.labelTimer = 0.1;
        this.showLabel(t01);
      }
      return;
    }
    if (st === 'done') {
      this.finish();
      return;
    }
    this.cancel(null);
  }

  private finish(): void {
    this.hold.reset();
    const r = G.professions?.harvest(this.type, this.key, this.rich, this.id, this.respawnSec);
    if (r?.ok && r.respawnAt) {
      this.depletedUntil = r.respawnAt;
      this.applyScale();
    } else if (r?.reason) {
      toast(r.reason, 'warning');
    }
    if (!r?.ok) G.events.emit('gather:done', { id: this.id, ok: false });
    this.showLabel();
    this.emitProgress(0);
  }

  private cancel(msg: string | null): void {
    this.hold.reset();
    this.emitProgress(0);
    this.showLabel();
    G.events.emit('gather:done', { id: this.id, ok: false });
    if (msg) toast(msg, 'warning');
  }

  /** Progress for the HUD (`gather:progress`), with the difficulty colour and tag. t01 = 0 clears it. */
  private emitProgress(t01: number): void {
    const gate = G.professions?.gate(this.type.prof, this.type.skillReq);
    const color = gate ? SKILL_COLOR_HEX[gate.color] : '#ffffff';
    G.events.emit('gather:progress', {
      id: this.id, t01, label: `${this.type.name} topluyor…`, color, tag: gate ? SKILL_COLOR_NAME[gate.color] : undefined, tagColor: color,
    });
  }

  private isDepleted(): boolean {
    return this.depletedUntil > Date.now();
  }

  private reset(): void {
    this.depletedUntil = 0;
    this.applyScale();
    this.showLabel();
  }

  private applyScale(): void {
    if (!this.model) return;
    const base = this.rich ? 1.3 : 1;
    this.model.scale.setScalar(this.isDepleted() ? base * DEPLETED_SCALE : base);
  }

  /** World label: name in the difficulty colour, then the skill line or the progress bar while channelling. */
  private showLabel(t01 = -1): void {
    const gate = G.professions?.gate(this.type.prof, this.type.skillReq);
    const color = gate ? SKILL_COLOR_HEX[gate.color] : '#ffffff';
    let sub: string;
    if (this.isDepleted()) sub = 'Tükendi';
    else if (t01 >= 0) {
      const pct = Math.round(Math.min(1, t01) * 100);
      sub = `<div style="width:90px;height:5px;margin:2px auto 0;background:#000a;border:1px solid #666"><div style="width:${pct}%;height:100%;background:${color}"></div></div>`;
    } else if (gate && !gate.ok) sub = gate.reason ?? '';
    else sub = `${profName(this.type.prof)} ${G.professions?.skill(this.type.prof) ?? 1}`;
    this.setLabel(`<div class="efs-wl"><div class="n" style="color:${color}">${this.type.name}</div><div class="s">${sub}</div></div>`, 1.7, 'efs-wl-wrap', 30);
  }

  /** Voxel model: a rock with coloured crystals (ore) or a bush with coloured blossoms (herb). Deterministic per key. */
  private buildModel(): THREE.Group {
    const g = new THREE.Group();
    const rng = new RNG(`${this.key}:model`);
    const tint = this.type.tint ?? 0xffffff;
    if (this.type.prof === 'mine') {
      const stone = new THREE.MeshLambertMaterial({ color: 0x6a6e76 });
      const crystal = new THREE.MeshLambertMaterial({ color: tint, emissive: this.type.emissive ?? 0x000000 });
      this.ownedRoots.push(g);
      for (let i = 0; i < 9; i++) {
        const m = new THREE.Mesh(CUBE, stone);
        const s = 0.28 + rng.next() * 0.18;
        m.scale.set(s, s * 0.8, s);
        m.position.set((rng.next() - 0.5) * 0.5, s * 0.4, (rng.next() - 0.5) * 0.5);
        m.rotation.y = rng.next() * 3;
        g.add(m);
      }
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(CUBE, crystal);
        const s = 0.12 + rng.next() * 0.08;
        m.scale.set(s, s * 2.2, s);
        m.position.set((rng.next() - 0.5) * 0.4, 0.45 + rng.next() * 0.1, (rng.next() - 0.5) * 0.4);
        m.rotation.set((rng.next() - 0.5) * 0.5, rng.next() * 3, (rng.next() - 0.5) * 0.5);
        g.add(m);
      }
    } else {
      const leaf = new THREE.MeshLambertMaterial({ color: 0x3f7f3a });
      const bloom = new THREE.MeshLambertMaterial({ color: tint });
      this.ownedRoots.push(g);
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(CUBE, leaf);
        const s = 0.22 + rng.next() * 0.1;
        m.scale.set(s, s * 0.7, s);
        m.position.set((rng.next() - 0.5) * 0.4, 0.12 + rng.next() * 0.12, (rng.next() - 0.5) * 0.4);
        g.add(m);
      }
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(CUBE, bloom);
        m.scale.setScalar(0.1);
        m.position.set((rng.next() - 0.5) * 0.35, 0.3 + rng.next() * 0.08, (rng.next() - 0.5) * 0.35);
        g.add(m);
      }
    }
    return g;
  }
}
