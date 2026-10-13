// CW-02 · Spell queue (COMBAT_WOW §2.2). Pure: the caller supplies `now` and `wait`.
// One slot. A queued skill beats a queued LMB step; a newer skill replaces an older skill; a newer LMB step replaces an older LMB step.

export const QUEUE_CFG = { window: 0.40, ttl: 0.80 } as const;

export type QueueKind = 'skill' | 'basic';

export interface QueueInput {
  kind: QueueKind;
  skillId: string | null;
  slot: string | null;
}

export interface QueueEntry extends QueueInput {
  enqueuedAt: number;
}

/**
 * 'fire'   : wait <= 0, act now.
 * 'queued' : 0 < wait <= window, held in the slot (quiet, no error). A basic press while a skill is queued is also reported
 *            as 'queued' but does not replace the skill (check `peek()` if the caller needs to know).
 * 'reject' : wait > window, show the "not ready" text with the remaining time.
 */
export type OfferResult = 'fire' | 'queued' | 'reject';

/** Result of checking the queued entry at fire time. 'invalid' drops it quietly. */
export type TakeState = 'ready' | 'wait' | 'invalid';

export class SpellQueue {
  readonly window: number;
  readonly ttl: number;
  private entry: QueueEntry | null = null;
  private lastClear = '';

  constructor(opts: { window?: number; ttl?: number } = {}) {
    this.window = opts.window ?? QUEUE_CFG.window;
    this.ttl = opts.ttl ?? QUEUE_CFG.ttl;
  }

  /** Offer a press. `wait` = max(gcdLeft if on-GCD, own cooldown left, action left), in seconds. */
  offer(wait: number, input: QueueInput, now: number): OfferResult {
    if (wait <= 0) return 'fire';
    if (wait > this.window) return 'reject';
    const cur = this.entry;
    if (input.kind === 'basic' && cur && cur.kind === 'skill') return 'queued';
    this.entry = { ...input, enqueuedAt: now };
    return 'queued';
  }

  /**
   * Call every frame while the player is free. 'ready' returns and clears the entry; 'invalid' drops it quietly;
   * 'wait' keeps it. An entry older than `ttl` is dropped regardless of state.
   */
  take(now: number, state: TakeState): QueueEntry | null {
    const e = this.entry;
    if (!e) return null;
    if (now - e.enqueuedAt > this.ttl) { this.clear('ttl'); return null; }
    if (state === 'wait') return null;
    this.entry = null;
    if (state === 'invalid') { this.lastClear = 'invalid'; return null; }
    this.lastClear = 'fired';
    return e;
  }

  peek(): QueueEntry | null { return this.entry; }

  /** Clears the slot. reason: 'dodge' | 'stun' | 'death' | 'scene' | 'interrupt' | ... (free text for logs). */
  clear(reason: string): void {
    this.entry = null;
    this.lastClear = reason;
  }

  get lastClearReason(): string { return this.lastClear; }
}
