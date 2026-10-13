/**
 * Keyboard + mouse input with rebindable actions.
 * - Call `input.endFrame()` once per frame AFTER all game updates (Game does it) to clear edge states.
 * - `pressed(action)` is true only on the frame the key went down; `down(action)` while held.
 * - Mouse buttons are bound as 'Mouse0' (left), 'Mouse1' (middle), 'Mouse2' (right); 'Mouse3' / 'Mouse4' are the back / forward
 *   buttons (GDD_V2 guard alias): the browser navigation of those buttons is swallowed only while they are bound.
 * - When the pointer is over a UI element with class `ui-capture` (or any element inside #ui-root that
 *   is not marked `ui-passthrough`), mouse button presses are NOT delivered to game actions.
 * - While a text field is focused, keyboard actions are suppressed (chat, character name).
 */
export type InputAction =
  | 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight' | 'jump' | 'dodge' | 'walk'
  | 'skill_lmb' | 'skill_rmb' | 'skill_q' | 'skill_e' | 'skill_r' | 'skill_s1' | 'skill_s2' | 'skill_s3'
  | 'potionHp' | 'potionMp' | 'interact' | 'targetNext' | 'freeCursor' | 'toggleLock'
  | 'inventory' | 'character' | 'talents' | 'skills' | 'map' | 'party' | 'chat' | 'menu' | 'mplus' | 'quests'
  | 'zoomIn' | 'zoomOut' | 'screenshot' | 'revive'
  // GDD_V2 §0.4 (WP1 contracts): appended, never renamed
  | 'guard' | 'skill_m45' | 'skill_m90' | 'skill_m180' | 'flask1' | 'flask2' | 'flask3' | 'flask4' | 'flask5'
  | 'targetAlly' | 'partySel1' | 'partySel2' | 'partySel3' | 'partySel4' | 'partySel5' | 'paragon' | 'bestiary' | 'townPortal'
  // GDD_LIFE §0 (L-00): appended. Both stay UNBOUND ([]): the doc's KeyP is taken by `paragon`, KeyV by `skill_m90`.
  | 'professions' | 'camShoulder';

export const DEFAULT_BINDINGS: Record<InputAction, string[]> = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  walk: ['ControlLeft'],
  skill_lmb: ['Mouse0'],
  skill_rmb: ['Mouse2'],
  skill_q: ['KeyQ'],
  skill_e: ['KeyE'],
  skill_r: ['KeyR'],
  skill_s1: ['Digit1'],
  skill_s2: ['Digit2'],
  skill_s3: ['Digit3'],
  potionHp: ['Digit4'],
  potionMp: ['Digit5'],
  interact: ['KeyF'],
  targetNext: ['Tab'],
  freeCursor: ['AltLeft', 'AltRight'],
  toggleLock: ['Mouse1'],
  inventory: ['KeyI', 'KeyB'],
  character: ['KeyC'],
  talents: ['KeyN'],
  skills: ['KeyK'],
  map: ['KeyM'],
  party: ['KeyO'],
  chat: ['Enter'],
  menu: ['Escape'],
  mplus: ['KeyJ'],
  quests: ['KeyL'],
  zoomIn: [],
  zoomOut: [],
  screenshot: ['F12'],
  revive: ['KeyZ'],
  // GDD_V2 §0.4 (WP1). bestiary: the doc says L, but L is already 'quests' (KeyL, existing); left unbound pending a decision.
  guard: ['KeyG', 'Mouse3'],
  skill_m45: ['KeyX'],
  skill_m90: ['KeyV'],
  skill_m180: ['KeyT'],
  flask1: ['Digit6'],
  flask2: ['Digit7'],
  flask3: ['Digit8'],
  flask4: ['Digit9'],
  flask5: ['Digit0'],
  targetAlly: ['KeyU'],
  partySel1: ['F1'],
  partySel2: ['F2'],
  partySel3: ['F3'],
  partySel4: ['F4'],
  partySel5: ['F5'],
  paragon: ['KeyP'],
  bestiary: [],
  townPortal: ['KeyY'],
  // GDD_LIFE (L-00). Unbound pending a decision (same as bestiary): KeyP = paragon, KeyV = skill_m90 today.
  professions: [],
  camShoulder: ['KeyH'],
};

export const ACTION_NAMES_TR: Record<InputAction, string> = {
  moveForward: 'İleri', moveBack: 'Geri', moveLeft: 'Sol', moveRight: 'Sağ', jump: 'Zıpla', dodge: 'Takla / Kaçın', walk: 'Yürü',
  skill_lmb: 'Temel Saldırı', skill_rmb: 'Yetenek (Sağ Tık)', skill_q: 'Yetenek Q', skill_e: 'Yetenek E', skill_r: 'Yetenek R',
  skill_s1: 'Yetenek 1', skill_s2: 'Yetenek 2', skill_s3: 'Yetenek 3', potionHp: 'Can İksiri', potionMp: 'Mana İksiri',
  interact: 'Etkileşim', targetNext: 'Sonraki Hedef', freeCursor: 'İmleci Serbest Bırak', toggleLock: 'Kamera Kilidi',
  inventory: 'Envanter', character: 'Karakter', talents: 'Yetenek Ağacı', skills: 'Yetenek Kitabı', map: 'Harita', party: 'Grup / Sunucular',
  chat: 'Sohbet', menu: 'Menü', mplus: 'Mitik+ Bilgisi', quests: 'Görev Defteri', zoomIn: 'Yakınlaştır', zoomOut: 'Uzaklaştır', screenshot: 'Ekran Görüntüsü', revive: 'Dirilt (basılı tut)',
  guard: 'Siper (basılı tut)', skill_m45: 'Büyük Yetenek (45 sn)', skill_m90: 'Büyük Yetenek (90 sn)', skill_m180: 'Grup Kahramanlığı (3 dk)',
  flask1: 'Şişe 1', flask2: 'Şişe 2', flask3: 'Şişe 3', flask4: 'Şişe 4', flask5: 'Şişe 5',
  targetAlly: 'Sonraki Müttefik', partySel1: 'Grup Üyesi 1 (Sen)', partySel2: 'Grup Üyesi 2', partySel3: 'Grup Üyesi 3',
  partySel4: 'Grup Üyesi 4', partySel5: 'Grup Üyesi 5', paragon: 'Kadim Levha', bestiary: 'Bestiyari', townPortal: 'Dönüş Parşömeni',
  professions: 'Meslekler', camShoulder: 'Omuz Değiştir',
};

export class Input {
  bindings: Record<InputAction, string[]> = structuredClone(DEFAULT_BINDINGS);
  /** Raw codes currently held. */
  private held = new Set<string>();
  private justDown = new Set<string>();
  private justUp = new Set<string>();
  /** Mouse position in CSS pixels relative to the canvas, and NDC. */
  mouseX = 0;
  mouseY = 0;
  ndcX = 0;
  ndcY = 0;
  /** Accumulated mouse movement this frame (pointer-lock friendly). */
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** True while the pointer hovers interactive UI (game ignores mouse buttons). */
  pointerOverUI = false;
  /** Global switch (e.g. during loading). */
  enabled = true;
  /** True while a game scene (town / dungeon) is active; Game.ts sets it on scene:changed. Gates F2-F5 preventDefault (F5 reloads). */
  gameScene = false;
  private canvas: HTMLElement;
  private textFocus = false;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      this.textFocus = isTextTarget(e.target);
      if (this.textFocus && e.code !== 'Escape' && e.code !== 'Enter') return;
      if (e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'F1' || (e.code === 'Space' && !this.textFocus)) e.preventDefault();
      if (this.gameScene && /^F[2-5]$/.test(e.code)) e.preventDefault(); // GDD_V2 partySel2..5 (F5 would reload the page)
      if (!this.held.has(e.code)) this.justDown.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.justUp.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
    });
    window.addEventListener('mousemove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.ndcX = (this.mouseX / r.width) * 2 - 1;
      this.ndcY = -(this.mouseY / r.height) * 2 + 1;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
      this.pointerOverUI = !this.isLocked() && isUITarget(e.target);
    });
    window.addEventListener('mousedown', (e) => {
      const code = 'Mouse' + e.button;
      if (this.backButtonBound(e.button)) e.preventDefault();
      if (!this.isLocked() && isUITarget(e.target)) return;
      if (!this.held.has(code)) this.justDown.add(code);
      this.held.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      const code = 'Mouse' + e.button;
      if (this.backButtonBound(e.button)) e.preventDefault();
      this.held.delete(code);
      this.justUp.add(code);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.isLocked() && isUITarget(e.target)) return;
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
  }

  /** Mouse back/forward buttons (3, 4) would navigate the browser: swallowed only while some action is bound to them (guard = Mouse3). */
  private backButtonBound(button: number): boolean {
    if (button !== 3 && button !== 4) return false;
    const code = 'Mouse' + button;
    return Object.values(this.bindings).some((codes) => codes.includes(code));
  }

  private codesActive(action: InputAction, set: Set<string>): boolean {
    if (!this.enabled) return false;
    const codes = this.bindings[action];
    if (!codes) return false; // unknown or unbound action (e.g. an action added later) — never throw per frame
    for (const c of codes) if (set.has(c)) return true;
    return false;
  }

  down(action: InputAction): boolean {
    if (this.textFocus) return false;
    return this.codesActive(action, this.held);
  }
  pressed(action: InputAction): boolean {
    if (this.textFocus && action !== 'menu' && action !== 'chat') return false;
    return this.codesActive(action, this.justDown);
  }
  released(action: InputAction): boolean {
    return this.codesActive(action, this.justUp);
  }
  keyDown(code: string): boolean {
    return this.held.has(code);
  }
  keyPressed(code: string): boolean {
    return this.justDown.has(code);
  }
  /** Movement axes (-1..1) from WASD relative to the camera: x = right, y = forward. */
  moveAxis(): { x: number; y: number } {
    const x = (this.down('moveRight') ? 1 : 0) - (this.down('moveLeft') ? 1 : 0);
    const y = (this.down('moveForward') ? 1 : 0) - (this.down('moveBack') ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  // ---- pointer lock (action camera) ----
  isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }
  lock(): void {
    if (!this.isLocked()) {
      try {
        const p = (this.canvas as HTMLCanvasElement).requestPointerLock?.() as unknown;
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      } catch {
        /* user gesture required */
      }
    }
  }
  unlock(): void {
    if (this.isLocked()) document.exitPointerLock();
  }

  rebind(action: InputAction, codes: string[]): void {
    this.bindings[action] = codes;
  }
  bindingLabel(action: InputAction): string {
    const c = this.bindings[action]?.[0];
    return c ? codeLabel(c) : '-';
  }

  endFrame(): void {
    this.justDown.clear();
    this.justUp.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}

export function codeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Mouse0: 'SolT', Mouse1: 'OrtaT', Mouse2: 'SağT', Space: 'Boşluk', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl',
    AltLeft: 'Alt', AltRight: 'Alt', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Mouse3: 'Geri Tuşu', Mouse4: 'İleri Tuşu',
  };
  return map[code] ?? code;
}

function isTextTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function isUITarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.closest) return false;
  if (el.closest('.ui-passthrough')) return false;
  return !!el.closest('#ui-root') && !!el.closest('.ui-capture, button, input, textarea, select, .panel, .hud-interactive');
}
