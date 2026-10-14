import '../styles/hud-guide.css';
import { ACTION_NAMES_TR, type InputAction } from '../../core/Input';
import { div, h } from '../widgets/dom';
import { isWowScheme, keyLabel } from '../widgets/controlHints';

/**
 * "Kontroller" overlay (? key): a compact cheat-sheet generated from the live bindings, so a rebind or the WoW / Aksiyon switch is
 * followed. Toggled by "?" (Shift+/), closed by "?" again, Esc or a click on the backdrop. It does nothing while a text field has
 * focus. OWNER: hud module.
 */

/** Rows per group, in the order the overlay shows them (WoW scheme; the Aksiyon scheme shows the same actions). */
const GROUPS: { title: string; actions: InputAction[] }[] = [
  { title: 'Hareket', actions: ['moveForward', 'moveLeft', 'moveBack', 'moveRight', 'jump', 'dodge', 'walk'] },
  { title: 'Savaş', actions: ['skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'skill_s4', 'targetNext', 'targetPrev'] },
  { title: 'Etkileşim', actions: ['interact', 'inventory', 'skills', 'talents', 'map', 'quests', 'groupFinder', 'guide'] },
];

/** Mouse gestures that have no binding to read (WoW scheme, CONTROLS_WOW). */
const WOW_MOUSE: [string, string][] = [
  ['Sol Tık (basılı)', 'Kamerayı çevir'],
  ['Sağ Tık', 'Hedef seç + otomatik saldırı'],
  ['Sağ Tık (sürükle)', 'Karakteri döndür'],
];

export class ControlsOverlay {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.el.classList.contains('on')) {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      }
      return;
    }
    if (e.key !== '?' || isTyping(e.target)) return;
    e.preventDefault();
    this.show();
  };

  constructor() {
    this.el = div('ctrl-overlay');
    const card = div('ctrl-card k-plate', this.el);
    const title = div('ctrl-title', card);
    div('', title, 'Kontroller');
    const close = h('button', 'k-btn k-btn--sm', title, 'Kapat ?');
    close.type = 'button';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });
    this.body = div('ctrl-cols', card);
    div('ctrl-foot', card, 'Tuş adları seçtiğin kontrol şemasına ve kendi atamalarına göre değişir (Ayarlar > Tuşlar).');
    this.el.addEventListener('mousedown', (e) => {
      if (e.target === this.el) this.hide();
    });
    window.addEventListener('keydown', this.onKey, true);
  }

  /** Toggles the overlay (the "?" key does the same). */
  toggle(): void {
    if (this.el.classList.contains('on')) this.hide();
    else this.show();
  }

  show(): void {
    this.render();
    this.el.classList.add('on');
  }

  hide(): void {
    this.el.classList.remove('on');
  }

  /** Rebuilds the rows from the live bindings (so the overlay is never stale after a rebind). */
  private render(): void {
    this.body.replaceChildren();
    for (const g of GROUPS) {
      const box = div('ctrl-group', this.body);
      div('ctrl-group-t', box, g.title);
      const rows: [string, string][] = g.actions.map((a) => [keyLabel(a), ACTION_NAMES_TR[a] ?? a]);
      if (g.title === 'Savaş' && isWowScheme()) rows.unshift(...WOW_MOUSE);
      for (const [k, text] of rows) {
        const r = div('ctrl-row', box);
        div('k-key', r, k || '-');
        div('', r, text);
      }
    }
  }
}

/** True while the focus is in a text field (the chat box, a rename field): "?" is then a typed character. */
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}
