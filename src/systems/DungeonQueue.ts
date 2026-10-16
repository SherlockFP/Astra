import { G } from '../game/G';
import { toast } from './notify';

/**
 * Dungeon queue of the Zindan Bulucu (client side, one player). The finder's solo start goes through here: the card at the top
 * centre of the HUD (ui/hud/QueueCard.ts) shows the search ("Sırada: ..."), then the ready card ("Zindan hazır!") with a sound.
 * A solo player goes straight in when the ready card's 3 s run out; the Reddet button and the timeout of a group ready card
 * (GROUP_READY_SEC, reserved for a group match) decline it. No server pool exists for dungeon queues yet: the match time is a
 * local roll between MATCH_MIN_SEC and MATCH_MAX_SEC, and the card shows the estimate (QUEUE_ESTIMATE_SEC) as the GDD asks.
 */

export const QUEUE_ESTIMATE_SEC = 60;
export const SOLO_READY_SEC = 3;
export const GROUP_READY_SEC = 40;
const MATCH_MIN_SEC = 20;
const MATCH_MAX_SEC = 50;

export type DungeonQueuePhase = 'idle' | 'searching' | 'ready';

export interface DungeonQueueEntry {
  dungeonId: string;
  dungeonName: string;
  /** Turkish role list of the queue ("Hasar", "Tank + Şifacı"...). */
  roleLabel: string;
  /** Runs when the player is let in (solo: after the ready card, or Gir). */
  onStart: () => void;
}

export interface DungeonQueueView {
  phase: DungeonQueuePhase;
  entry: DungeonQueueEntry | null;
  /** Seconds since the search began (searching) or since the ready card (ready: seconds left). */
  elapsed: number;
  readyLeft: number;
  readySec: number;
}

type Listener = () => void;

const IDLE: DungeonQueueView = { phase: 'idle', entry: null, elapsed: 0, readyLeft: 0, readySec: 0 };

class DungeonQueueStore {
  private view: DungeonQueueView = IDLE;
  private listeners = new Set<Listener>();
  private since = 0;
  private matchAt = 0;
  private readyUntil = 0;
  private timer = 0;
  /** The scene that was current when the search began: a run-summary requeue starts from the finished dungeon scene itself. */
  private sceneAtEnter: unknown = null;

  get state(): DungeonQueueView {
    return this.view;
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Enters the queue. False (with a toast) when a queue or ready card is already up. */
  enter(entry: DungeonQueueEntry): boolean {
    if (this.view.phase !== 'idle') {
      toast('Zaten bir zindan sırasındasın.', 'info');
      return false;
    }
    const now = Date.now();
    this.since = now;
    this.sceneAtEnter = G.scenes?.current ?? null;
    this.matchAt = now + (MATCH_MIN_SEC + Math.random() * (MATCH_MAX_SEC - MATCH_MIN_SEC)) * 1000;
    this.set({ phase: 'searching', entry, elapsed: 0, readyLeft: 0, readySec: 0 });
    this.start();
    return true;
  }

  /** Ayrıl: the search ends without a run. */
  leave(): void {
    if (this.view.phase === 'idle') return;
    this.stop();
    toast('Zindan sırasından çıktın.', 'info');
  }

  /** Gir on the ready card: the run starts now. */
  accept(): void {
    if (this.view.phase !== 'ready' || !this.view.entry) return;
    this.launch();
  }

  /** Reddet on the ready card: back to idle, the search does not resume. */
  decline(): void {
    if (this.view.phase !== 'ready') return;
    this.stop();
    toast('Zindan hazır çağrısını reddettin.', 'info');
  }

  private start(): void {
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 200);
  }

  private stop(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
    this.set(IDLE);
  }

  private tick(): void {
    const now = Date.now();
    // a run started by any other path (party ready check, a portal) ends the queue; the dungeon scene the search began in
    // (a finished run, "Tekrar Sıraya Gir") does not count
    if (G.scenes?.current?.id === 'dungeon' && G.scenes.current !== this.sceneAtEnter) {
      this.stop();
      return;
    }
    if (this.view.phase === 'searching') {
      if (now >= this.matchAt) {
        // solo: the ready card lasts SOLO_READY_SEC and then the run starts (WoW solo shortcut)
        const readySec = SOLO_READY_SEC;
        this.readyUntil = now + readySec * 1000;
        this.set({ ...this.view, phase: 'ready', elapsed: 0, readyLeft: readySec, readySec });
        try {
          G.audio?.play('ready_check', { volume: 0.7 });
        } catch {
          /* no audio in this build */
        }
        return;
      }
      this.set({ ...this.view, elapsed: (now - this.since) / 1000 });
      return;
    }
    if (this.view.phase === 'ready') {
      const left = Math.max(0, (this.readyUntil - now) / 1000);
      if (left <= 0) {
        this.launch();
        return;
      }
      this.set({ ...this.view, readyLeft: left });
    }
  }

  private launch(): void {
    const entry = this.view.entry;
    if (!entry) return;
    this.stop();
    try {
      entry.onStart();
    } catch (err) {
      console.warn('[queue] start failed', err);
    }
  }

  private set(v: DungeonQueueView): void {
    this.view = v;
    for (const cb of this.listeners) cb();
  }
}

/** The one dungeon queue of this client. */
export const dungeonQueue = new DungeonQueueStore();
