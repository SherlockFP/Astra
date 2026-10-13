import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import type { InteractEvent } from '../../data/devices';

/**
 * Hold-F channel helper for interactables (P-14). The shared controller does not run hold interactions yet, so each hold owner
 * starts the hold from its `interact()` (the press frame) and ticks it from its own `update`. Release, distance or damage ends it.
 */
export class HoldF {
  private t = 0;
  private holder: Player | null = null;
  private anchor = { x: 0, z: 0 };

  constructor(readonly seconds: number, readonly maxDist: number) {}

  get running(): boolean {
    return this.holder !== null;
  }

  get progress(): number {
    return this.seconds > 0 ? Math.min(1, this.t / this.seconds) : 1;
  }

  /** The player holding F, or null. Kept until the owner calls `reset()`, so a 'done' or 'cancel' result can still credit them. */
  get holderPlayer(): Player | null {
    return this.holder;
  }

  start(p: Player, x: number, z: number): void {
    this.holder = p;
    this.anchor = { x, z };
    this.t = 0;
  }

  reset(): void {
    this.holder = null;
    this.t = 0;
  }

  /** Per frame. 'done' when the hold completed, 'cancel' when F was released or the holder moved away, 'run' while holding. The owner calls `reset()`. */
  tick(dt: number): 'idle' | 'run' | 'done' | 'cancel' {
    const p = this.holder;
    if (!p) return 'idle';
    if (!G.input.down('interact')) return 'cancel';
    if (Math.hypot(p.position.x - this.anchor.x, p.position.z - this.anchor.z) > this.maxDist) return 'cancel';
    this.t += dt;
    return this.t >= this.seconds ? 'done' : 'run';
  }
}

export interface ChannelGateOpts {
  /** Prop id from the placement (`root_gate_a`, `root_gate_b`). */
  gateId: string;
  /** Hold length in seconds (default 3). */
  channelSec?: number;
  /** Hold range in metres (default 3.5). */
  rangeM?: number;
  /** Builder model to adopt (the prop the builder placed with `collide: true`). Optional: without it the gate only logs state. */
  model?: THREE.Object3D;
  /** The prop's `Open` clip, if the model has one. */
  clips?: THREE.AnimationClip[];
  /** Called after opening (host side): the builder hides the prop so its nav cells re-open (`BuiltProp.hide()`). */
  onOpen?: (gate: ChannelGate) => void;
  /** Noise on opening: `EnemyDirector.alertNear(x, z, r)` (aggroes idle packs in range). */
  alertNear?: (x: number, z: number, r: number) => void;
  /** Alert radius in metres (default 16). */
  alertRadius?: number;
  /** Events for the dungeon scene. */
  onEvent?: (e: InteractEvent) => void;
}

/**
 * Kök Kapısı style barricade (P-14, peri_sisleri M2). Hold F for `channelSec` within `rangeM`; any damage taken cancels it.
 * On completion the host opens the gate (`open()`), plays the `Open` clip, alerts nearby packs and reports a 'gate' event.
 * A guest asks the host with `sendRequest('gate:open', { gateId })`; the host's handler calls `open()`.
 * OWNER: scenes module.
 */
export class ChannelGate extends InteractableProp {
  readonly gateId: string;
  opened = false;
  readonly hold: HoldF;
  private readonly opts: ChannelGateOpts;
  private mixer: THREE.AnimationMixer | null = null;
  private offDamage: (() => void) | null = null;

  constructor(id: number, opts: ChannelGateOpts) {
    super(id);
    this.opts = opts;
    this.gateId = opts.gateId;
    this.hold = new HoldF(opts.channelSec ?? 3, opts.rangeM ?? 3.5);
    this.interactRange = opts.rangeM ?? 3.5;
    this.radius = 0.4;
    this.height = 3;
    if (opts.model) this.adoptModel(opts.model);
  }

  get interactPrompt(): string {
    if (this.opened) return 'Kapı açık';
    if (this.hold.running) return 'Kökler çekiliyor...';
    return `Kökleri geri çek (F'yi ${this.hold.seconds} sn basılı tut)`;
  }

  canInteract(): boolean {
    return !this.opened;
  }

  interact(p: Player): void {
    if (this.opened || this.hold.running) return;
    this.hold.start(p, this.position.x, this.position.z);
    G.ui.toast('Kökler çekiliyor... Hasar almadan bekle.', 'info');
  }

  onAdded(world: import('../../world/World').World): void {
    super.onAdded(world);
    // damage taken by the channelling player cancels the hold
    this.offDamage = G.events.on('damage', (e) => {
      const holder = this.hold.holderPlayer;
      if (!holder || e.amount <= 0 || e.targetId !== holder.id) return;
      this.hold.reset();
      G.ui.toast('Kanal kesildi!', 'warning');
      this.opts.onEvent?.({ type: 'gate:cancel', gateId: this.gateId, byId: holder.id });
    });
  }

  /** Host side: opens the gate. Safe to call twice. */
  open(byId: number = -1): void {
    if (this.opened) return;
    this.opened = true;
    if (this.model && this.opts.clips) {
      const clip = THREE.AnimationClip.findByName(this.opts.clips, 'Open');
      if (clip) {
        this.mixer = new THREE.AnimationMixer(this.model);
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
      }
    }
    const x = this.position.x;
    const z = this.position.z;
    this.opts.onOpen?.(this);
    this.opts.alertNear?.(x, z, this.opts.alertRadius ?? 16);
    this.opts.onEvent?.({ type: 'gate', gateId: this.gateId, byId, x, z });
    G.ui.toast('Kökler geri çekildi.', 'success');
  }

  protected animate(dt: number): void {
    const holder = this.hold.holderPlayer;
    if (holder) {
      const s = this.hold.tick(dt);
      if (s === 'done') {
        this.hold.reset();
        // a guest asks the host; the host opens the gate and broadcasts it through onEvent
        if (G.net.role === 'client') G.net.sendRequest('gate:open', { gateId: this.gateId });
        else this.open(holder.id);
      } else if (s === 'cancel') {
        this.hold.reset();
      }
    }
    this.mixer?.update(dt);
  }

  onRemoved(): void {
    this.offDamage?.();
    this.offDamage = null;
    this.mixer?.stopAllAction();
    this.mixer = null;
    super.onRemoved();
  }
}
