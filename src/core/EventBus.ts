import type { GameEvents, GameEventName } from './events';

type Handler<K extends GameEventName> = (payload: GameEvents[K]) => void;

/** Typed synchronous pub/sub. on() returns an unsubscribe function. */
export class EventBus {
  private handlers = new Map<GameEventName, Set<Handler<any>>>();

  on<K extends GameEventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  once<K extends GameEventName>(name: K, fn: Handler<K>): () => void {
    const off = this.on(name, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`[events] handler for "${name}" threw`, e);
      }
    }
  }

  /** Collects unsubscribers so scenes/panels can drop all their listeners at once. */
  scope(): EventScope {
    return new EventScope(this);
  }
}

export class EventScope {
  private offs: (() => void)[] = [];
  constructor(private bus: EventBus) {}
  on<K extends GameEventName>(name: K, fn: Handler<K>): this {
    this.offs.push(this.bus.on(name, fn));
    return this;
  }
  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
