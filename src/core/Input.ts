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
  | 'potionHp' | 'potionMp' | 'potionCleanse' | 'interact' | 'targetNext' | 'freeCursor' | 'toggleLock'
  | 'inventory' | 'character' | 'talents' | 'skills' | 'map' | 'party' | 'chat' | 'menu' | 'mplus' | 'quests'
  | 'zoomIn' | 'zoomOut' | 'screenshot' | 'revive'
  // GDD_V2 §0.4 (WP1 contracts): appended, never renamed
  | 'guard' | 'skill_m45' | 'skill_m90' | 'skill_m180' | 'flask1' | 'flask2' | 'flask3' | 'flask4' | 'flask5'
  | 'targetAlly' | 'partySel1' | 'partySel2' | 'partySel3' | 'partySel4' | 'partySel5' | 'paragon' | 'bestiary' | 'townPortal'
  // GDD_LIFE §0 (L-00): appended. Both stay UNBOUND ([]): the doc's KeyP is taken by `paragon`, KeyV by `skill_m90`.
  | 'professions' | 'camShoulder'
  // F4 (roadmap, combat): hold-to-charge the heavy. Shift (dodge) and Alt (freeCursor) are taken, so the side button (Mouse4) and Minus are the keys.
  | 'heavyAttack'
  // CORE_MECHANICS §10.1 key resolution + UI_REDESIGN Appendix A + COMBAT_WOW CW-01 (appended)
  | 'skill_s4' | 'groupFinder' | 'guide' | 'focusTarget' | 'targetPrev'
  // CONTROLS_WOW §2.1 / §3.2 (appended): WoW auto-attack toggle and keyboard turning (default unbound in Aksiyon)
  | 'autoAttack' | 'turnLeft' | 'turnRight'
  // UI_REDESIGN §2.6.5 (UX-10, appended): Panzehir İksiri (Combat.usePotion('cleanse')) on the consumable strip
  | 'potionCleanse'
  // CONTROLS_WOW fixes (appended): walk is a toggle (held Ctrl fights browser shortcuts), autorun runs forward until W / S is pressed
  | 'walkToggle' | 'autorun'
  // Binek (WoW ground mount, appended): F9
  | 'mount';

/** CONTROLS_WOW D1: the control scheme. 'wow' is the default; 'aksiyon' is the pre-WoW layout. */
export type ControlScheme = 'wow' | 'aksiyon';

/**
 * CONTROLS_WOW §2.2: the actions whose default differs between the two schemes, plus the new actions.
 * Their rebinds are stored per scheme (Settings.schemeBindings); every other action is shared (Settings.bindings).
 */
export const SCHEME_ACTIONS: readonly InputAction[] = [
  'skill_lmb', 'skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'skill_s4',
  'potionHp', 'potionMp', 'toggleLock', 'camShoulder', 'moveLeft', 'moveRight',
  'autoAttack', 'turnLeft', 'turnRight',
];

export const DEFAULT_BINDINGS: Record<InputAction, string[]> = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  dodge: ['ShiftLeft', 'ShiftRight'],
  // Held walk is unbound by default: holding Ctrl while pressing W / S / D / F / R / P triggers browser shortcuts (Ctrl+W closes the tab).
  // walkToggle is the default way to walk; `walk` stays rebindable for players who want a held key.
  walk: [],
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
  // UI_REDESIGN §2.6.5 (UX-10): Panzehir cell, after the two potions on the consumable strip
  potionCleanse: ['Backslash'],
  interact: ['KeyF'],
  targetNext: ['Tab'],
  freeCursor: ['AltLeft', 'AltRight'],
  toggleLock: ['Mouse1'],
  inventory: ['KeyB'],
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
  // CORE_MECHANICS §10.1: G is skill_s4 now; guard = Mouse3 + CapsLock (a stored guard→KeyG is migrated in Settings).
  guard: ['Mouse3', 'CapsLock'],
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
  // F4: Mouse4 (side button), with Minus as the keyboard fallback for mice without a side button and for laptops. Holding LMB
  // chains the combo when autoCombo is on. Alt (freeCursor) and Shift (dodge) are taken, so Alt+LMB and Shift+LMB do not work.
  heavyAttack: ['Mouse4', 'Minus'],
  // CORE_MECHANICS §10.1: the s4 slot (interrupt / utility). G was free after guard moved.
  skill_s4: ['KeyG'],
  // MAP_UI P00 / GDD_PVP_FINDER PV-00 / UI_REDESIGN: I opens the Group Finder; B is the only inventory key.
  groupFinder: ['KeyI'],
  // UI_REDESIGN Appendix A: the guide ("Ne Yapmalıyım?") panel.
  guide: ['Period'],
  // COMBAT_WOW §2.14 / CW-01: Shift+Tab is not a single code, and KeyZ is revive, so focus takes F8 (no browser default)
  // and the backward target cycle takes Backquote (the key above Tab).
  focusTarget: ['F8'],
  targetPrev: ['Backquote'],
  // Binek (Mount.ts): F9. Every letter and digit is already taken.
  mount: ['F9'],
  // CONTROLS_WOW §3.1: new actions are unbound in Aksiyon.
  autoAttack: [],
  turnLeft: [],
  turnRight: [],
  // Same in both schemes. Every letter and digit is taken, so these use the numpad (WoW's NumLock autorun) plus a bracket key for
  // laptops without a numpad ('[' / ']' sit on the Turkish-Q ğ / ü keys). None of these codes has a browser default.
  walkToggle: ['NumpadDivide', 'BracketLeft'],
  autorun: ['NumLock', 'BracketRight'],
};

/**
 * CONTROLS_WOW §3.2: the WoW diff against DEFAULT_BINDINGS (only the actions that differ, plus the new ones).
 * Mouse0 / Mouse2 are not listed anywhere in WoW (RESERVED_MOUSE). Digits 6-0 (flasks) are the same in both schemes.
 */
export const SCHEME_BINDINGS: Record<ControlScheme, Partial<Record<InputAction, string[]>>> = {
  aksiyon: {},
  wow: {
    skill_lmb: [],
    skill_rmb: ['Digit1'],
    skill_q: ['Digit2'],
    skill_e: ['Digit3'],
    skill_r: ['Digit4'],
    skill_s1: ['Digit5'],
    skill_s2: ['KeyQ'],
    skill_s3: ['KeyE'],
    skill_s4: ['KeyR'],
    potionHp: ['KeyG'],
    potionMp: ['KeyH'],
    camShoulder: [],
    toggleLock: [],
    autoAttack: ['Mouse1', 'Equal'],
    turnLeft: ['ArrowLeft'],
    turnRight: ['ArrowRight'],
    moveLeft: ['KeyA'],
    moveRight: ['KeyD'],
  },
};

/** CONTROLS_WOW §2.3: mouse buttons that are hard-wired gestures in a scheme and cannot be bound to an action. */
export const RESERVED_MOUSE: Record<ControlScheme, string[]> = {
  wow: ['Mouse0', 'Mouse2'],
  aksiyon: [],
};

/** Copies `overrides` into `target` for known action ids only (unknown or non-array entries are ignored, never throw). */
function applyOverrides(target: Record<InputAction, string[]>, overrides: Partial<Record<InputAction, string[]>> | undefined): void {
  if (!overrides || typeof overrides !== 'object') return;
  for (const action of Object.keys(target) as InputAction[]) {
    const codes = overrides[action];
    if (Array.isArray(codes)) target[action] = [...codes];
  }
}

/** The bindings of a scheme: DEFAULT_BINDINGS merged with SCHEME_BINDINGS[s]. */
export function defaultBindings(s: ControlScheme): Record<InputAction, string[]> {
  const out = structuredClone(DEFAULT_BINDINGS);
  applyOverrides(out, SCHEME_BINDINGS[s]);
  return out;
}

export const ACTION_NAMES_TR: Record<InputAction, string> = {
  moveForward: 'İleri', moveBack: 'Geri', moveLeft: 'Sol', moveRight: 'Sağ', jump: 'Zıpla', dodge: 'Takla / Kaçın', walk: 'Yürü (basılı tut)',
  skill_lmb: 'Temel Saldırı', skill_rmb: 'Yetenek (Sağ Tık)', skill_q: 'Yetenek Q', skill_e: 'Yetenek E', skill_r: 'Yetenek R',
  skill_s1: 'Yetenek 1', skill_s2: 'Yetenek 2', skill_s3: 'Yetenek 3', potionHp: 'Can İksiri', potionMp: 'Mana İksiri', potionCleanse: 'Panzehir İksiri',
  interact: 'Etkileşim', targetNext: 'Sonraki Hedef', freeCursor: 'İmleci Serbest Bırak', toggleLock: 'Kamera Kilidi',
  inventory: 'Envanter', character: 'Karakter', talents: 'Yetenek Ağacı', skills: 'Yetenek Kitabı', map: 'Harita', party: 'Grup / Sunucular',
  chat: 'Sohbet', menu: 'Menü', mplus: 'Mitik+ Bilgisi', quests: 'Görev Defteri', zoomIn: 'Yakınlaştır', zoomOut: 'Uzaklaştır', screenshot: 'Ekran Görüntüsü', revive: 'Dirilt (basılı tut)',
  guard: 'Siper (basılı tut)', skill_m45: 'Büyük Yetenek (45 sn)', skill_m90: 'Büyük Yetenek (90 sn)', skill_m180: 'Grup Kahramanlığı (3 dk)',
  flask1: 'Şişe 1', flask2: 'Şişe 2', flask3: 'Şişe 3', flask4: 'Şişe 4', flask5: 'Şişe 5',
  targetAlly: 'Sonraki Müttefik', partySel1: 'Grup Üyesi 1 (Sen)', partySel2: 'Grup Üyesi 2', partySel3: 'Grup Üyesi 3',
  partySel4: 'Grup Üyesi 4', partySel5: 'Grup Üyesi 5', paragon: 'Kadim Levha', bestiary: 'Bestiyari', townPortal: 'Dönüş Parşömeni',
  professions: 'Meslekler', camShoulder: 'Omuz Değiştir', heavyAttack: 'Ağır Saldırı',
  skill_s4: 'Beceri G', groupFinder: 'Grup Bulucu', guide: 'Ne Yapmalıyım?', focusTarget: 'Odak Hedef', targetPrev: 'Önceki Hedef',
  autoAttack: 'Otomatik Saldırı', turnLeft: 'Sola Dön', turnRight: 'Sağa Dön',
  walkToggle: 'Yürü / Koş (aç/kapat)', autorun: 'Otomatik Koşu', mount: 'Binek',
};

export class Input {
  bindings: Record<InputAction, string[]> = defaultBindings('wow');
  /** Active control scheme. Set by applyScheme (Game.ts applies the stored one at boot). */
  scheme: ControlScheme = 'wow';
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
  /** Bumped on every window blur: consumers that track a press (WoW mouse gestures, Tab hold) reset themselves when it changes. */
  blurSeq = 0;
  private canvas: HTMLElement;

  /** True while a text field has the focus (derived from document.activeElement, so it clears itself on blur / removal). */
  private get textFocus(): boolean {
    return isTextTarget(typeof document !== 'undefined' ? document.activeElement : null);
  }

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    initKeyboardLayout();
    window.addEventListener('keydown', (e) => {
      const inText = isTextTarget(e.target) || this.textFocus;
      // Ctrl / Cmd + letter or digit is a browser shortcut (Ctrl+R reload, S save, D bookmark, F find, P print, ...): swallow it in the game
      // scene unless a text field is focused. Ctrl+W / T / N are reserved by the browser and cannot be stopped from a page.
      if (this.gameScene && !inText && (e.ctrlKey || e.metaKey) && /^(Key[A-Z]|Digit[0-9])$/.test(e.code)) e.preventDefault();
      if (inText && e.code !== 'Escape' && e.code !== 'Enter') return;
      if (e.code === 'Tab' || e.code === 'AltLeft' || e.code === 'AltRight' || e.code === 'F1' || (e.code === 'Space' && !inText)) e.preventDefault();
      if (this.gameScene && /^F[2-5]$/.test(e.code)) e.preventDefault(); // GDD_V2 partySel2..5 (F5 would reload the page)
      if (!this.held.has(e.code)) this.justDown.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.justUp.add(e.code);
    });
    window.addEventListener('blur', () => {
      // Releases the browser never delivers (alt-tab, devtools, a dialog): report them as released so released() stays consistent.
      for (const c of this.held) this.justUp.add(c);
      this.held.clear();
      this.justDown.clear();
      this.blurSeq++;
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
        if (p && typeof (p as Promise<void>).catch === 'function') {
          (p as Promise<void>).catch((e) => console.warn('[input] pointer lock refused (user gesture required?)', e));
        }
      } catch (e) {
        console.warn('[input] requestPointerLock failed', e);
      }
    }
  }
  unlock(): void {
    if (this.isLocked()) document.exitPointerLock();
  }

  rebind(action: InputAction, codes: string[]): void {
    this.bindings[action] = codes;
  }
  /**
   * Rebuild `bindings` for a scheme: defaultBindings(s) < shared overrides < scheme overrides (CONTROLS_WOW §2.3).
   * Never throws on unknown actions. Callers re-apply after any change to controlScheme / bindings / schemeBindings.
   */
  applyScheme(
    s: ControlScheme,
    shared: Partial<Record<InputAction, string[]>> | undefined,
    perScheme: Partial<Record<InputAction, string[]>> | undefined,
  ): void {
    const next = defaultBindings(s);
    applyOverrides(next, shared);
    applyOverrides(next, perScheme);
    this.scheme = s;
    this.bindings = next;
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

/**
 * Physical code -> the character printed on the player's keyboard (Chromium's Keyboard Map API; Turkish-Q, AZERTY, ...).
 * Filled asynchronously by initKeyboardLayout(); null/empty where the API is missing (Firefox, Safari) and in node.
 */
let layoutMap: Map<string, string> | null = null;

/** Letters and punctuation follow the layout; digits keep their number (AZERTY's Digit1 would read '&'). */
const LAYOUT_LABELLED = /^(Key[A-Z]|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|IntlBackslash|Semicolon|Quote|Comma|Period|Slash)$/;

function initKeyboardLayout(): void {
  try {
    const kb = (typeof navigator !== 'undefined' ? navigator : undefined) as unknown as {
      keyboard?: { getLayoutMap?: () => Promise<Map<string, string>>; addEventListener?: (t: string, f: () => void) => void };
    } | undefined;
    if (!kb?.keyboard?.getLayoutMap) return;
    const load = () => {
      kb.keyboard!.getLayoutMap!().then((m) => { layoutMap = m; }).catch(() => { /* unsupported / blocked: keep QWERTY names */ });
    };
    load();
    kb.keyboard.addEventListener?.('layoutchange', load);
  } catch { /* optional nicety */ }
}

export function codeLabel(code: string): string {
  if (layoutMap && LAYOUT_LABELLED.test(code)) {
    const ch = layoutMap.get(code);
    if (ch && ch.length === 1) return ch.toLocaleUpperCase('tr');
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const numpad = /^Numpad(\d)$/.exec(code);
  if (numpad) return 'Num' + numpad[1];
  const map: Record<string, string> = {
    Mouse0: 'SolT', Mouse1: 'OrtaT', Mouse2: 'SağT', Space: 'Boşluk', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    AltLeft: 'Alt', AltRight: 'Alt', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    // Short forms: the action bar prints these at 12 px in a 44 px cell.
    Mouse3: 'Geri', Mouse4: 'İleri', Minus: '-', CapsLock: 'Caps', Period: '.', Backquote: '`', Equal: '=',
    Backslash: '\\', Slash: '/', Comma: ',', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', IntlBackslash: '<',
    NumLock: 'NumLk', NumpadDivide: 'Num/', NumpadMultiply: 'Num*', NumpadSubtract: 'Num-', NumpadAdd: 'Num+', NumpadDecimal: 'Num.',
    NumpadEnter: 'NumEnt', Backspace: 'Geri Sil', Insert: 'Ins', Delete: 'Del', PageUp: 'PgUp', PageDown: 'PgDn', MetaLeft: 'Win', MetaRight: 'Win',
    ScrollLock: 'ScrLk', Pause: 'Pause', ContextMenu: 'Menü',
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
