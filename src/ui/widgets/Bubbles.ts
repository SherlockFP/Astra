import * as THREE from 'three';
import type { UI, WorldLabelHandle } from '../UI';
import { G } from '../../game/G';
import { clampN, div, esc } from './dom';

/* ================================================================================================
 * UX-30 (§5.2): speech bubbles above heads. One world label per speaker (anchor object) holds a flex
 * column of `.bb` boxes: newest at the bottom (nearest the head), older ones pushed up by the layout.
 * Speech (say, emote, yell, NPC) is measured from the LOCAL player: opaque inside 80 % of its range,
 * fading to nothing at the range and shrinking from 1 to 0.7 with distance.
 * ============================================================================================== */

export type BubbleKind = 'say' | 'party' | 'yell' | 'emote' | 'npc' | 'typing';
export interface BubbleOpts {
  kind: BubbleKind;
  text: string;
  /** Name line (shown on the newest bubble of a speaker only). */
  name?: string;
  /** Name colour (CSS colour); defaults to the kind's token. */
  color?: string;
  /** Lifetime in seconds. Default: bubbleSeconds(chars) = 4 s to 8 s by length. `Infinity` = until removed. */
  seconds?: number;
  /** Height above the anchor origin, metres (the caller knows the model height). */
  offsetY?: number;
  /** Own bubble of the local player: 90 % opacity, hidden while typing (setOwnHidden). */
  own?: boolean;
  /** Hearing range (m) of a speech line from the local player: say / emote 25, yell 100 (INTEREST). Default: 45 (party). */
  range?: number;
}
export interface BubbleHandle {
  remove(): void;
}

/** Max bubbles per speaker on screen (a third one fades out in 150 ms). */
const MAX_PER_SPEAKER = 2;
/** Budget of live bubbles on screen; the rest wait silently (nearest first). */
const MAX_VISIBLE = 6;
/** Text limits: player lines 80 characters, NPC barks 120 (then an ellipsis). */
const PLAYER_CHARS = 80;
const NPC_CHARS = 120;
/** The label itself stops at 110 m (yell range 100 m + margin); each bubble has its own hearing range (`range`). */
const LABEL_MAX_M = 110;
const PARTY_RANGE_M = 45;
/** Shrink: full size up to SCALE_NEAR_M from the local player, 0.7 at the range. */
const SCALE_NEAR_M = 6;
const SCALE_FAR = 0.7;
const FADE_OUT_MS = 400;
const CUT_MS = 150;
const OLD_OPACITY = 0.75;
const OWN_OPACITY = 0.9;

interface Bubble {
  kind: BubbleKind;
  own: boolean;
  el: HTMLElement;
  name: HTMLElement;
  group: Group;
  expiresAt: number;
  /** performance.now() at which a started removal completes (0 = alive). */
  removeAt: number;
  /** Distance to the camera (m), refreshed in update(): the budget order. */
  dist: number;
  /** Distance to the local player (m), refreshed in update(): range, fade and scale. */
  reach: number;
  /** Hearing range (m) of this bubble (speech only). */
  range: number;
}

interface Group {
  anchor: THREE.Object3D;
  handle: WorldLabelHandle;
  stack: HTMLElement;
  items: Bubble[];
}

const _a = new THREE.Vector3();
const _c = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Lifetime of a player line: 4 s + 0.04 s per character, 4 s to 8 s (chat bubbles spec). */
export function bubbleSeconds(chars: number): number {
  return clampN(4 + 0.04 * chars, 4, 8);
}

/** Speech kinds are heard within a range; the rest (party, typing) are not range-gated. */
function isSpeech(kind: BubbleKind): boolean {
  return kind === 'say' || kind === 'yell' || kind === 'emote' || kind === 'npc';
}

/** Distance fade of speech: opaque to 80 % of the range, gone at the range. */
function sayAlpha(d: number, range: number): number {
  const full = range * 0.8;
  if (d <= full) return 1;
  if (d >= range) return 0;
  return (range - d) / (range - full);
}

/** Size of a speech bubble: 1 close by, SCALE_FAR at the edge of its range. */
function sayScale(d: number, range: number): number {
  if (d <= SCALE_NEAR_M) return 1;
  if (d >= range) return SCALE_FAR;
  return 1 - (1 - SCALE_FAR) * ((d - SCALE_NEAR_M) / (range - SCALE_NEAR_M));
}

export class BubbleLayer {
  private groups = new Map<THREE.Object3D, Group>();
  private all: Bubble[] = [];
  private ownHidden = false;

  constructor(private readonly ui: UI) {}

  /** A bubble over `anchor`. The handle removes it early (typing indicator, speaker gone). */
  say(anchor: THREE.Object3D, o: BubbleOpts): BubbleHandle {
    const now = performance.now();
    const max = o.kind === 'npc' ? NPC_CHARS : PLAYER_CHARS;
    const seconds = o.seconds ?? bubbleSeconds(o.text.length);
    let group = this.groups.get(anchor);
    if (!group) {
      const handle = this.ui.addWorldLabel(anchor, '', {
        offsetY: o.offsetY ?? 2.2,
        className: 'wl-bubble wl-bare',
        maxDistance: LABEL_MAX_M,
      });
      const stack = div('bb-stack', handle.el);
      group = { anchor, handle, stack, items: [] };
      this.groups.set(anchor, group);
    }

    const el = div(`bb bb--${o.kind}${o.own ? ' bb--own' : ''}`);
    const name = div('bb-name', el, o.name ? esc(o.name) : '');
    if (o.color) name.style.color = o.color;
    if (o.kind === 'typing') div('bb-text', el, '<i></i><i></i><i></i>');
    else div('bb-text', el, esc(o.text.length > max ? `${o.text.slice(0, max - 1)}…` : o.text));
    group.stack.appendChild(el);

    const b: Bubble = {
      kind: o.kind,
      own: !!o.own,
      el,
      name,
      group,
      expiresAt: Number.isFinite(seconds) ? now + seconds * 1000 : Infinity,
      removeAt: 0,
      dist: 0,
      reach: 0,
      range: o.range ?? PARTY_RANGE_M,
    };
    group.items.push(b);
    this.all.push(b);

    // third bubble of this speaker: the oldest one is cut quickly
    const live = group.items.filter((x) => x.removeAt === 0);
    while (live.length > MAX_PER_SPEAKER) this.startRemoval(live.shift()!, now, CUT_MS);
    this.refreshNames(group);

    return {
      remove: () => {
        if (b.removeAt === 0) this.startRemoval(b, performance.now(), FADE_OUT_MS);
      },
    };
  }

  /** Removes every bubble of one speaker at once. */
  clearFor(anchor: THREE.Object3D): void {
    const g = this.groups.get(anchor);
    if (g) this.dropGroup(g);
  }

  /** Own speech bubble hidden (chat input focused). Typing bubbles are not affected. */
  setOwnHidden(hidden: boolean): void {
    this.ownHidden = hidden;
  }

  clear(): void {
    for (const g of [...this.groups.values()]) this.dropGroup(g);
  }

  /** Per frame: expiry and removals, the distance fade, the 6-bubble budget and own-bubble hiding. */
  update(now: number, _dt: number): void {
    const cam = this.ui.camera;
    if (cam) _c.setFromMatrixPosition(cam.matrixWorld);

    // 1. expiry, finished removals, speakers that left the scene
    for (const g of [...this.groups.values()]) {
      if (!g.anchor.parent) {
        this.dropGroup(g);
        continue;
      }
      for (const b of [...g.items]) {
        if (now >= b.expiresAt) this.startRemoval(b, now, FADE_OUT_MS);
      }
    }
    for (const b of [...this.all]) if (b.removeAt !== 0 && now >= b.removeAt) this.drop(b);
    for (const g of [...this.groups.values()]) {
      if (!this.all.some((b) => b.group === g)) this.dropGroup(g);
    }

    // 2. distances (camera for the budget order, local player for the hearing range), then the budget: nearest first, at most MAX_VISIBLE
    const player = G.player?.object3d;
    if (player) player.getWorldPosition(_p);
    const alive: Bubble[] = [];
    for (const b of this.all) {
      if (b.removeAt !== 0) continue;
      b.group.anchor.getWorldPosition(_a);
      if (cam) b.dist = _a.distanceTo(_c);
      b.reach = player ? _a.distanceTo(_p) : 0;
      alive.push(b);
    }
    alive.sort((x, y) => x.dist - y.dist);
    const shown = new Set<Bubble>();
    for (const b of alive) {
      if (shown.size >= MAX_VISIBLE) break;
      if (isSpeech(b.kind) && !b.own && b.reach >= b.range) continue;
      if (b.own && b.kind !== 'typing' && this.ownHidden) continue;
      shown.add(b);
    }

    // 3. DOM: display, opacity (speech fade, own 90 %, older 75 %), scale (speech shrinks with distance); fading bubbles stay until done
    for (const b of this.all) {
      if (b.removeAt !== 0) {
        b.el.style.display = '';
        b.el.style.opacity = '';
        continue;
      }
      if (!shown.has(b)) {
        b.el.style.display = 'none';
        continue;
      }
      b.el.style.display = '';
      const speech = isSpeech(b.kind) && !b.own;
      const fade = speech ? sayAlpha(b.reach, b.range) : 1;
      const older = b.group.items[b.group.items.length - 1] !== b;
      const base = b.own ? OWN_OPACITY : 1;
      b.el.style.opacity = (base * fade * (older ? OLD_OPACITY : 1)).toFixed(2);
      b.el.style.transform = speech ? `scale(${sayScale(b.reach, b.range).toFixed(3)})` : '';
    }
    for (const g of this.groups.values()) {
      g.handle.setVisible(g.items.some((x) => shown.has(x)));
    }
  }

  // ---- internals ----

  /** The newest live bubble of a speaker carries the name line. */
  private refreshNames(g: Group): void {
    const last = g.items[g.items.length - 1];
    for (const x of g.items) x.name.style.display = x === last && x.name.textContent ? '' : 'none';
  }

  private startRemoval(b: Bubble, now: number, ms: number): void {
    if (b.removeAt !== 0) return;
    b.removeAt = now + ms;
    b.el.classList.add('bb--out');
    b.group.items = b.group.items.filter((x) => x !== b);
    this.refreshNames(b.group);
  }

  private drop(b: Bubble): void {
    b.el.remove();
    this.all = this.all.filter((x) => x !== b);
  }

  private dropGroup(g: Group): void {
    for (const b of this.all) if (b.group === g) b.el.remove();
    this.all = this.all.filter((b) => b.group !== g);
    g.items = [];
    g.handle.remove();
    if (this.groups.get(g.anchor) === g) this.groups.delete(g.anchor);
  }
}
