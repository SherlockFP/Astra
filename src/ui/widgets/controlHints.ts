import { G } from '../../game/G';
import type { InputAction } from '../../core/Input';

/**
 * Scheme-aware key hints for tips, cheat-sheets and slot labels (CONTROLS_WOW). Every key name shown to the player comes from the
 * live bindings (`G.input.bindingLabel`), never from a literal, so rebinds and the WoW / Aksiyon switch are followed.
 * All helpers tolerate a missing input layer (loading screen, menu).
 */

/** True while the WoW control scheme is active (the default; Aksiyon only when the setting says so). */
export function isWowScheme(): boolean {
  return G.settings?.data.controlScheme !== 'aksiyon';
}

/** Key-cap label of an action's first binding (`-` when unbound), the same text the action bar prints. */
export function keyLabel(action: InputAction): string {
  try {
    return G.input?.bindingLabel(action) ?? '-';
  } catch {
    return '-';
  }
}

/** True when the action has at least one binding in the active scheme. */
export function isBound(action: InputAction): boolean {
  return (G.input?.bindings[action]?.length ?? 0) > 0;
}

const MOUSE_PROSE: Record<string, string> = {
  Mouse0: 'Sol tık', Mouse1: 'Orta tık', Mouse2: 'Sağ tık', Mouse3: 'Geri tuşu', Mouse4: 'İleri tuşu',
};

/** First binding of an action in running text: mouse buttons read as "Sol tık" / "Sağ tık", keyboard codes as their key-cap label. */
export function keyProse(action: InputAction): string {
  const code = G.input?.bindings[action]?.[0];
  if (!code) return '-';
  return MOUSE_PROSE[code] ?? keyLabel(action);
}

/** A hint text, or one text per control scheme. */
export type SchemeText = string | { aks: string; wow: string };

/** Picks the text of the active scheme and fills its `{k:action}` tokens. */
export function resolveHint(t: SchemeText): string {
  return expandKeys(typeof t === 'string' ? t : isWowScheme() ? t.wow : t.aks);
}

/** Replaces `{k:action}` tokens with the running-text label of that action's binding. */
export function expandKeys(text: string): string {
  return text.replace(/\{k:([A-Za-z0-9_]+)\}/g, (_m, a: string) => keyProse(a as InputAction));
}

/**
 * Label of a skill-bar slot (`lmb`, `rmb`, `q`, ... `m180`) from the live binding. The WoW basic attack (lmb, unbound) reads
 * `Oto` (auto-attack); mouse buttons are title-cased (`Sol Tık`) like the skill book's own labels.
 */
export function slotKeyLabel(slot: string): string {
  const action = `skill_${slot}` as InputAction;
  const code = G.input?.bindings[action]?.[0];
  if (!code) return slot === 'lmb' && isWowScheme() ? 'Oto' : '-';
  const prose = MOUSE_PROSE[code];
  return prose ? prose.replace(/ t/, ' T') : keyLabel(action);
}
