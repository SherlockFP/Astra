import { G } from '../game/G';
import type { GameEvents, GameEventName } from '../core/events';

/** Emit a game event without ever throwing into gameplay code (items module helper). */
export function emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
  try {
    G.events?.emit(name, payload);
  } catch (e) {
    console.warn('[items] event failed', name, e);
  }
}

/** Turkish toast through the event bus (the UI subscribes to 'ui:toast'). */
export function toast(text: string, kind: GameEvents['ui:toast']['kind'] = 'info'): void {
  emit('ui:toast', { text, kind });
}
