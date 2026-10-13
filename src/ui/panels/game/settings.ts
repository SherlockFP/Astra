import { G } from '../../../game/G';
import { ACTION_NAMES_TR, RESERVED_MOUSE, SCHEME_ACTIONS, codeLabel, defaultBindings, type ControlScheme, type InputAction } from '../../../core/Input';
import { DEFAULT_SETTINGS, type SettingsData } from '../../../core/Settings';
import { exportSaves, openImportDialog } from '../../../core/SaveSafety';
import { GamePanel, askConfirm, button, divider, h, row, selectBox, slider, sfx, tabs, toast, toggle, windowFrame, type TabsHandle } from './base';

type NumKeys = { [K in keyof SettingsData]: SettingsData[K] extends number ? K : never }[keyof SettingsData];
type BoolKeys = { [K in keyof SettingsData]: SettingsData[K] extends boolean ? K : never }[keyof SettingsData];

const PRESETS: { id: string; name: string; desc: string; values: Partial<SettingsData> }[] = [
  { id: 'ps1', name: 'PS1 Klasik', desc: 'İri pikseller, titreyen köşeler, dithering', values: { psx: true, psxPixelScale: 4, psxJitter: 0.85, psxAffine: true, psxDither: true, psxColorDepth: 5, bloom: true, bloomStrength: 0.5, shadows: false } },
  { id: 'balanced', name: 'Dengeli', desc: 'Varsayılan Efsun görünümü', values: { psx: true, psxPixelScale: DEFAULT_SETTINGS.psxPixelScale, psxJitter: DEFAULT_SETTINGS.psxJitter, psxAffine: true, psxDither: true, psxColorDepth: 5, bloom: true, bloomStrength: 0.6, shadows: true } },
  { id: 'clean', name: 'Temiz', desc: 'Modern, keskin görüntü', values: { psx: false, psxPixelScale: 1, psxJitter: 0, psxAffine: false, psxDither: false, psxColorDepth: 8, bloom: true, bloomStrength: 0.4, shadows: true } },
];

type Group = { name: string; actions: InputAction[] };

/** CONTROLS_WOW §10: the key list per scheme. Aksiyon is exactly the list that exists today. */
const GROUPS_AKSIYON: Group[] = [
  { name: 'Hareket', actions: ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'dodge', 'walk'] },
  { name: 'Savaş', actions: ['skill_lmb', 'heavyAttack', 'skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'skill_s4', 'guard', 'potionHp', 'potionMp', 'potionCleanse', 'targetNext', 'targetPrev', 'focusTarget', 'interact', 'revive'] },
  { name: 'Arayüz', actions: ['inventory', 'groupFinder', 'character', 'talents', 'skills', 'map', 'party', 'mplus', 'guide', 'chat', 'menu'] },
  { name: 'Kamera ve Diğer', actions: ['freeCursor', 'toggleLock', 'zoomIn', 'zoomOut', 'screenshot'] },
];

const GROUPS_WOW: Group[] = [
  { name: 'Hareket', actions: ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'turnLeft', 'turnRight', 'jump', 'dodge', 'walk'] },
  { name: 'Savaş', actions: ['skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'skill_s4', 'autoAttack', 'skill_lmb', 'heavyAttack', 'guard', 'potionHp', 'potionMp', 'potionCleanse', 'targetNext', 'targetPrev', 'focusTarget', 'interact', 'revive'] },
  { name: 'Arayüz', actions: ['inventory', 'groupFinder', 'character', 'talents', 'skills', 'map', 'party', 'mplus', 'guide', 'chat', 'menu'] },
  { name: 'Kamera ve Diğer', actions: ['freeCursor', 'zoomIn', 'zoomOut', 'screenshot'] },
];

function groupsFor(scheme: ControlScheme): Group[] {
  return scheme === 'wow' ? GROUPS_WOW : GROUPS_AKSIYON;
}

/** CONTROLS_WOW §10: WoW slot names (the bar cells are numbered 1-5 and Q/E/R there). Aksiyon keeps ACTION_NAMES_TR. */
const WOW_NAMES: Partial<Record<InputAction, string>> = {
  skill_lmb: 'Manuel Saldırı',
  skill_rmb: 'Yetenek 1',
  skill_q: 'Yetenek 2',
  skill_e: 'Yetenek 3',
  skill_r: 'Yetenek 4',
  skill_s1: 'Yetenek 5',
  skill_s2: 'Yetenek Q',
  skill_s3: 'Yetenek E',
  skill_s4: 'Yetenek R',
};

/** Display names that differ from ACTION_NAMES_TR (CONTROLS_WOW §10: 'Otomatik Saldırı (aç/kapat)'). Input.ts is not edited by this package. */
const NAME_OVERRIDES: Partial<Record<InputAction, string>> = {
  autoAttack: 'Otomatik Saldırı (aç/kapat)',
};

/** Display name of an action in a scheme (CONTROLS_WOW §10). */
export function actionName(action: InputAction, scheme: ControlScheme): string {
  if (scheme === 'wow') {
    const w = WOW_NAMES[action];
    if (w) return w;
  }
  return NAME_OVERRIDES[action] ?? ACTION_NAMES_TR[action];
}

export class SettingsPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private tabsH!: TabsHandle;
  private tab = 'gfx';
  private bindBtns = new Map<string, HTMLButtonElement>();
  private capturing: { action: InputAction; slot: number; btn: HTMLButtonElement } | null = null;
  private capOff: (() => void) | null = null;
  private sfxTimer = 0;

  constructor() {
    super('settings', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Ayarlar', icon: '/assets/icons/ui-settings.svg', cls: 'pg-set', onClose: () => this.requestClose() });
    this.tabsH = tabs(
      [
        { id: 'gfx', label: 'Grafik', icon: '/assets/icons/ui-gears.svg' },
        { id: 'snd', label: 'Ses', icon: '/assets/icons/ui-speaker.svg' },
        { id: 'ctl', label: 'Kontroller', icon: '/assets/icons/ui-compass.svg' },
        { id: 'game', label: 'Oyun', icon: '/assets/icons/ui-character.svg' },
      ],
      (id) => {
        this.cancelCapture();
        this.tab = id;
        this.renderTab();
      },
    );
    this.bodyEl = h('div.pg-set-body.pg-scroll');
    body.append(this.tabsH.el, this.bodyEl);
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';
    body.style.overflow = 'hidden';
    foot.append(
      button('Varsayılana Dön', () => this.resetAll(), { variant: 'danger' }),
      button('Kapat', () => this.requestClose(), { variant: 'primary' }),
    );
    this.el.append(win);
  }

  protected onOpen(): void {
    this.tabsH.select(this.tab, true);
    this.renderTab();
  }

  protected onClose(): void {
    this.cancelCapture();
  }

  private renderTab(): void {
    this.bodyEl.innerHTML = '';
    this.bindBtns.clear();
    this.bodyEl.scrollTop = 0;
    if (this.tab === 'gfx') this.renderGraphics();
    else if (this.tab === 'snd') this.renderAudio();
    else if (this.tab === 'ctl') this.renderControls();
    else this.renderGame();
  }

  /* ---------------------------------------------------------------- helpers */

  private num<K extends NumKeys>(key: K, label: string, min: number, max: number, step: number, format?: (v: number) => string, hint?: string, onInput?: (v: number) => void): HTMLElement {
    return row(
      label,
      slider({
        min, max, step,
        value: G.settings.get(key) as number,
        format,
        onInput: (v) => {
          G.settings.set(key, v as SettingsData[K]);
          onInput?.(v);
        },
      }),
      hint,
    );
  }

  private flag<K extends BoolKeys>(key: K, label: string, hint?: string): HTMLElement {
    return row(label, toggle(G.settings.get(key) as boolean, (v) => G.settings.set(key, v as SettingsData[K])), hint);
  }

  private section(title: string, ...rows: HTMLElement[]): HTMLElement {
    return h('div.pg-set-sec', null, h('div.pg-h', null, title), ...rows);
  }

  /* ---------------------------------------------------------------- graphics */

  private renderGraphics(): void {
    const presets = h('div.pg-set-presets');
    for (const p of PRESETS) {
      const b = h('button.pg-set-preset', { type: 'button' }, h('b', null, p.name), h('small', null, p.desc)) as HTMLButtonElement;
      b.addEventListener('click', () => {
        sfx('ui_tab');
        for (const [k, v] of Object.entries(p.values)) G.settings.set(k as keyof SettingsData, v as never);
        this.renderTab();
        toast(`Grafik: ${p.name}`, 'info');
      });
      presets.append(b);
    }
    const psxOn = G.settings.get('psx');
    const psxRows = h(
      'div.pg-set-sub' + (psxOn ? '' : '.is-off'),
      null,
      this.num('psxPixelScale', 'Piksel Boyutu', 1, 6, 1, (v) => `${v}x`, 'Yüksek değer = daha iri, daha retro pikseller'),
      this.num('psxJitter', 'Köşe Titremesi', 0, 1, 0.05, (v) => `%${Math.round(v * 100)}`, 'PS1 köşe titremesi (vertex snapping)'),
      this.flag('psxAffine', 'Doku Bükülmesi', 'Affine doku eşleme: dokular hafifçe kayar'),
      this.flag('psxDither', 'Dithering', 'Renk geçişlerinde klasik tarama deseni'),
      this.num('psxColorDepth', 'Renk Derinliği', 3, 8, 1, (v) => `${v} bit`, 'Kanal başına bit sayısı'),
    );
    const psxRow = row(
      'PSX Görünümü',
      toggle(psxOn, (v) => {
        G.settings.set('psx', v);
        psxRows.classList.toggle('is-off', !v);
      }),
      'Tüm PS1 efektlerini aç/kapat',
    );
    this.bodyEl.append(
      this.section('Hazır Ayarlar', presets),
      this.section('PSX Görünümü', psxRow, psxRows),
      this.section('Modeller', this.voxelRow()),
      this.section(
        'Işık ve Efektler',
        this.flag('bloom', 'Parlama (Bloom)', 'Büyü ve ateş efektlerinde ışıma'),
        this.num('bloomStrength', 'Parlama Gücü', 0, 1.5, 0.05, (v) => `%${Math.round(v * 100)}`),
        this.flag('shadows', 'Gölgeler'),
      ),
      this.section(
        'Görüntü',
        this.num('renderScale', 'Çözünürlük Ölçeği', 0.5, 2, 0.25, (v) => `${v}x`, 'Düşük değer FPS kazandırır'),
        this.num('fov', 'Görüş Açısı (FOV)', 40, 100, 1, (v) => `${v}°`),
        this.flag('showFps', 'FPS Göstergesi'),
        row(
          'Arayüz Boyutu',
          slider({
            min: 0.7, max: 1.5, step: 0.05, value: G.ui?.userScale ?? 1,
            format: (v) => `%${Math.round(v * 100)}`,
            onInput: () => {},
            onChange: (v) => G.ui?.setUserScale(v),
          }),
          'Menü, HUD ve pencerelerin boyutu',
        ),
        row(
          'Arayüz Stili',
          selectBox<SettingsData['hudStyle']>(
            [
              { value: 'elvui', label: 'ElvUI' },
              { value: 'metin2', label: 'Metin2' },
              { value: 'orbs', label: 'Küreler' },
            ],
            G.settings.get('hudStyle'),
            (v) => G.settings.set('hudStyle', v),
          ),
          'Alt çubuk görünümü: ElvUI (varsayılan), taş panel (Metin2) veya Diablo küreleri',
        ),
      ),
      this.section(
        'Savaş Hissi',
        this.flag('damageNumbers', 'Hasar Sayıları'),
        row(
          'Hasar Sayısı Stili',
          selectBox<SettingsData['numberStyle']>(
            [
              { value: 'school', label: 'Okul renkli' },
              { value: 'classic', label: 'Klasik' },
            ],
            G.settings.get('numberStyle'),
            (v) => G.settings.set('numberStyle', v),
          ),
          'Okul renkli: hasar türüne göre renk ve büyüklük. Klasik: eski tek renk görünüm',
        ),
        this.flag('abilityGlow', 'Yetenek Parıltısı', 'Hazır ve tetiklenen yetenekler altın çerçeveyle parlar'),
        this.num('screenShake', 'Ekran Sarsıntısı', 0, 1, 0.05, (v) => (v === 0 ? 'Kapalı' : `%${Math.round(v * 100)}`), 'Vuruş ve patlamalarda kamera sarsıntısı'),
      ),
    );
  }

  /** Voxel model set. Read once at page load (core/voxelRemap.ts), so the change applies after a reload. */
  private voxelRow(): HTMLElement {
    return row(
      'Voxel modeller',
      toggle(G.settings.get('voxelModels'), (v) => {
        G.settings.set('voxelModels', v);
        toast('Voxel modeller için sayfayı yenileyin.', 'info');
      }),
      'Karakter ve yaratıklar küp (voxel) modellerle. Kapalıyken orijinal modeller kullanılır. Sayfa yenilenince uygulanır.',
    );
  }

  /* ---------------------------------------------------------------- audio */

  private renderAudio(): void {
    const apply = (test: 'ui_click' | 'hit_flesh' | null) => {
      try {
        G.audio.applyVolumes();
      } catch {
        /* ignore */
      }
      if (test) {
        clearTimeout(this.sfxTimer);
        this.sfxTimer = window.setTimeout(() => sfx(test), 90);
      }
    };
    const pc = (v: number) => `%${Math.round(v * 100)}`;
    this.bodyEl.append(
      this.section(
        'Ses Düzeyi',
        this.num('masterVolume', 'Ana Ses', 0, 1, 0.01, pc, undefined, () => apply('ui_click')),
        this.num('musicVolume', 'Müzik', 0, 1, 0.01, pc, undefined, () => apply(null)),
        this.num('sfxVolume', 'Efektler', 0, 1, 0.01, pc, 'Vuruş, büyü ve ortam sesleri', () => apply('hit_flesh')),
        this.num('uiVolume', 'Arayüz', 0, 1, 0.01, pc, 'Tıklama ve pencere sesleri', () => apply('ui_click')),
      ),
    );
  }

  /* ---------------------------------------------------------------- controls */

  private scheme(): ControlScheme {
    return G.settings.get('controlScheme');
  }

  private renderControls(): void {
    const scheme = this.scheme();
    const wow = scheme === 'wow';
    const camRows: HTMLElement[] = [
      row(
        'Kontrol Şeması',
        selectBox<ControlScheme>(
          [
            { value: 'wow', label: 'WoW (Varsayılan)' },
            { value: 'aksiyon', label: 'Aksiyon' },
          ],
          scheme,
          (v) => {
            this.cancelCapture();
            G.settings.set('controlScheme', v);
            this.renderTab();
          },
        ),
        'WoW: fare imleci serbest, sağ tık bakış, sol tık döndür, yetenekler 1–5 / Q E R. Aksiyon: fare kilitli, sol/sağ tık saldırı.',
      ),
      this.num('mouseSensitivity', 'Fare Hassasiyeti', 0.2, 3, 0.05, (v) => v.toFixed(2).replace('.', ',')),
      this.flag('invertY', 'Y Eksenini Ters Çevir'),
    ];
    if (wow) {
      camRows.push(
        this.num('cameraDistanceWow', 'Kamera Mesafesi', 2, 30, 0.5, (v) => `${v} m`),
        this.flag('cameraSmartPivot', 'Akıllı Kamera (hareket ederken arkaya dön)'),
      );
    } else {
      camRows.push(
        this.num('cameraDistance', 'Kamera Mesafesi', 4, 16, 0.5, (v) => `${v} m`),
        this.flag('cameraAutoFollow', 'Otomatik omuz değişimi', 'Kamera, hareket yönüne kendiliğinden döner'),
        row(
          'Kilit modu',
          selectBox<SettingsData['lockOnMode']>(
            [
              { value: 'hold-lock', label: 'Basılı tut' },
              { value: 'tap-cycle', label: 'Tıkla, değiştir' },
            ],
            G.settings.get('lockOnMode'),
            (v) => G.settings.set('lockOnMode', v),
          ),
          'Hedef kilidinin nasıl açılıp değiştiği',
        ),
      );
    }
    const cam = this.section('Kamera', ...camRows);
    if (wow) {
      cam.append(
        this.flag('casterAutoShot', 'Büyücüler uzaktan otomatik ateş etsin'),
        this.flag('autoAttackFromSkills', 'Yakın dövüş yeteneği otomatik saldırıyı başlatsın'),
      );
    }
    const combat = this.section(
      'Savaş',
      row(
        'Tempo (GCD)',
        selectBox<SettingsData['gcdProfile']>(
          [
            { value: 'arpg', label: 'Aksiyon (1 sn)' },
            { value: 'wow', label: 'WoW (1,5 sn)' },
          ],
          G.settings.get('gcdProfile'),
          (v) => G.settings.set('gcdProfile', v),
        ),
        'Yetenekler arası genel bekleme. Aksiyon: akıcı tempo. WoW: klasik 1,5 sn (hızla kısalır)',
      ),
      ...(wow ? [] : [this.flag('autoCombo', 'Basılı tutunca saldırı zinciri', 'Kapalıyken sol tık basılı tutmak ağır vuruşu şarj eder')]),
      this.num('spellQueueMs', 'Yetenek Kuyruğu', 0, 400, 50, (v) => (v === 0 ? 'Kapalı' : `${v} ms`), 'Bekleme sırasında basılan yetenek, bitince kendiliğinden uygulanır'),
      this.flag('leadSkip', 'Erken Başlatma', 'Yetenek animasyonunun başını atlar, vuruş daha erken gelir'),
    );
    this.bodyEl.append(cam, combat);

    const binds = h('div.pg-set-sec', null, h('div.pg-h', null, 'Tuş Atamaları'));
    binds.append(
      h(
        'div.pg-set-bindhelp',
        null,
        'Bir kutuya tıkla, sonra yeni tuşa bas. ',
        h('b', null, 'Esc'),
        ': iptal · ',
        h('b', null, 'Backspace'),
        ': temizle · ',
        wow ? 'Sol ve sağ tık WoW şemasında fare hareketlerine ayrılmıştır; orta ve yan tuşlar atanabilir.' : 'Fare sağ/orta tuşu da atanabilir.',
      ),
    );
    for (const g of groupsFor(scheme)) {
      binds.append(h('div.pg-set-bgroup', null, g.name));
      for (const a of g.actions) binds.append(this.bindRow(a));
    }
    binds.append(h('div.pg-set-bindfoot', null, button('Tüm Tuşları Sıfırla', () => this.resetBindings(), { variant: 'ghost' })));
    this.bodyEl.append(binds);
  }

  private bindRow(action: InputAction): HTMLElement {
    const mk = (slot: number) => {
      const b = h('button.pg-bind', { type: 'button' }) as HTMLButtonElement;
      this.bindBtns.set(`${action}:${slot}`, b);
      this.paintBind(action, slot);
      b.addEventListener('click', () => this.startCapture(action, slot, b));
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.setCode(action, slot, null);
      });
      return b;
    };
    const reset = h('button.pg-bind-reset', { type: 'button', title: 'Varsayılana döndür' }, '↺') as HTMLButtonElement;
    reset.addEventListener('click', () => {
      sfx('ui_click');
      this.resetAction(action);
    });
    return h('div.pg-bindrow', null, h('span.pg-bindname', null, actionName(action, this.scheme())), mk(0), mk(1), reset);
  }

  private paintBind(action: InputAction, slot: number): void {
    const b = this.bindBtns.get(`${action}:${slot}`);
    if (!b) return;
    const code = G.input.bindings[action]?.[slot];
    b.textContent = code ? codeLabel(code) : '—';
    b.classList.toggle('is-empty', !code);
    b.classList.remove('is-listening');
  }

  private startCapture(action: InputAction, slot: number, btn: HTMLButtonElement): void {
    this.cancelCapture();
    sfx('ui_click');
    this.capturing = { action, slot, btn };
    btn.classList.add('is-listening');
    btn.textContent = 'Tuşa bas...';
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') return this.cancelCapture();
      if (e.code === 'Backspace' || e.code === 'Delete') {
        this.cancelCapture();
        return this.setCode(action, slot, null);
      }
      if (['ControlRight', 'MetaLeft', 'MetaRight', 'ContextMenu'].includes(e.code)) return;
      this.cancelCapture();
      this.setCode(action, slot, e.code);
    };
    const onMouse = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t === btn) return;
      e.stopImmediatePropagation();
      if (e.button === 0) {
        e.preventDefault();
        return this.cancelCapture();
      }
      e.preventDefault();
      this.cancelCapture();
      const code = 'Mouse' + e.button;
      if (RESERVED_MOUSE[this.scheme()].includes(code)) {
        sfx('ui_error');
        return void toast('Sol ve sağ tık WoW şemasında fare hareketlerine ayrılmıştır.', 'warning');
      }
      this.setCode(action, slot, code);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    this.capOff = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
  }

  private cancelCapture(): void {
    this.capOff?.();
    this.capOff = null;
    if (this.capturing) {
      const { action, slot } = this.capturing;
      this.capturing = null;
      this.paintBind(action, slot);
    }
  }

  /** CONTROLS_WOW §2.4: scheme actions (SCHEME_ACTIONS) are stored per scheme, every other action in the shared `bindings`. */
  private persistBinding(action: InputAction): void {
    const codes = [...G.input.bindings[action]];
    if (SCHEME_ACTIONS.includes(action)) {
      const scheme = this.scheme();
      const all = { ...G.settings.get('schemeBindings') };
      all[scheme] = { ...(all[scheme] ?? {}), [action]: codes };
      G.settings.set('schemeBindings', all);
    } else {
      const all = { ...G.settings.get('bindings') };
      all[action] = codes;
      G.settings.set('bindings', all);
    }
  }

  private setCode(action: InputAction, slot: number, code: string | null): void {
    const cur = [...(G.input.bindings[action] ?? [])];
    if (code === null) {
      if (action === 'menu' && cur.filter((_, i) => i !== slot).length === 0) {
        sfx('ui_error');
        return void toast('Menü için en az bir tuş atanmalı.', 'warning');
      }
      cur.splice(slot, 1);
      G.input.rebind(action, cur);
      this.persistBinding(action);
      sfx('ui_drop');
      this.refreshBinds();
      return;
    }
    // steal the code from other actions (of the active scheme only)
    const stolenFrom: InputAction[] = [];
    for (const other of Object.keys(G.input.bindings) as InputAction[]) {
      if (other === action) continue;
      const list = G.input.bindings[other];
      if (list.includes(code)) {
        if (other === 'menu' && list.length === 1) {
          sfx('ui_error');
          return void toast('Bu tuş menü için ayrılmış.', 'warning');
        }
        G.input.rebind(other, list.filter((c) => c !== code));
        this.persistBinding(other);
        stolenFrom.push(other);
      }
    }
    const list = cur.filter((c) => c !== code);
    if (slot >= list.length) list.push(code);
    else list[slot] = code;
    G.input.rebind(action, list);
    this.persistBinding(action);
    sfx('ui_drop');
    if (stolenFrom.length) toast(`"${codeLabel(code)}" tuşu ${stolenFrom.map((a) => actionName(a, this.scheme())).join(', ')} işleminden alındı.`, 'info');
    this.refreshBinds();
  }

  private refreshBinds(): void {
    for (const key of this.bindBtns.keys()) {
      const [a, s] = key.split(':');
      this.paintBind(a as InputAction, Number(s));
    }
  }

  /** Row reset (↺): the default of the active scheme; the override is dropped from the table it was stored in. */
  private resetAction(action: InputAction): void {
    const scheme = this.scheme();
    G.input.rebind(action, [...defaultBindings(scheme)[action]]);
    if (SCHEME_ACTIONS.includes(action)) {
      const all = { ...G.settings.get('schemeBindings') };
      const perScheme = { ...(all[scheme] ?? {}) };
      delete perScheme[action];
      all[scheme] = perScheme;
      G.settings.set('schemeBindings', all);
    } else {
      const all = { ...G.settings.get('bindings') };
      delete all[action];
      G.settings.set('bindings', all);
    }
    this.refreshBinds();
  }

  /** "Tüm Tuşları Sıfırla": clears the shared overrides and the active scheme's overrides; the other scheme is kept. */
  private async resetBindings(): Promise<void> {
    if (!(await askConfirm(this.el, 'Tüm tuş atamaları varsayılana döndürülsün mü?', 'Sıfırla', 'Vazgeç', true))) return;
    const scheme = this.scheme();
    const defs = defaultBindings(scheme);
    for (const a of Object.keys(defs) as InputAction[]) G.input.rebind(a, [...defs[a]]);
    const perScheme = { ...G.settings.get('schemeBindings') };
    perScheme[scheme] = {};
    G.settings.set('schemeBindings', perScheme);
    G.settings.set('bindings', {});
    this.refreshBinds();
    toast('Tuş atamaları sıfırlandı.', 'success');
  }

  /* ---------------------------------------------------------------- game */

  private renderGame(): void {
    const name = h('input.pg-input', { type: 'text', maxLength: 16, placeholder: G.character?.save.name ?? 'Oyuncu adı', value: G.settings.get('playerName') }) as HTMLInputElement;
    name.value = G.settings.get('playerName');
    name.addEventListener('change', () => {
      G.settings.set('playerName', name.value.trim().slice(0, 16));
      sfx('ui_click');
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') name.blur();
    });
    this.bodyEl.append(
      this.section(
        'Ganimet',
        this.flag('autoLoot', 'Otomatik Ganimet', 'Üzerinden geçtiğin eşyaları otomatik toplar'),
        row(
          'Ganimet Filtresi',
          selectBox<SettingsData['lootFilter']>(
            [
              { value: 'all', label: 'Hepsi' },
              { value: 'uncommon', label: 'Büyülü+' },
              { value: 'rare', label: 'Nadir+' },
              { value: 'epic', label: 'Destansı+' },
            ],
            G.settings.get('lootFilter'),
            (v) => G.settings.set('lootFilter', v),
          ),
          'Seçilenin altındaki eşyalar otomatik toplanmaz',
        ),
      ),
      this.section(
        'Pasif Ağaç',
        this.flag('autoApplyPassives', 'Pasif puanları anında uygula', 'Yalnızca puan eklediğin taslak 1,5 sn sonra kendiliğinden uygulanır; geri alma içeren taslaklar Uygula ister'),
      ),
      this.section(
        'Arayüz',
        row(
          'Dövüş Ölçer',
          selectBox<SettingsData['meterVisibility']>(
            [
              { value: 'auto', label: 'Otomatik' },
              { value: 'always', label: 'Her zaman' },
              { value: 'never', label: 'Kapalı' },
            ],
            G.settings.get('meterVisibility'),
            (v) => G.settings.set('meterVisibility', v),
          ),
          'Otomatik: grupta, zindanda ve savaştan sonra 15 sn açık',
        ),
        this.flag('barGhostSlots', 'Boş Yuvaları Göster', 'Yetenek çubuğunda boş kareler görünür'),
        this.flag('ufIcon', 'Oyuncu Simgesi', 'Oyuncu çerçevesinde sınıf simgesi'),
        this.flag('showStats', 'Sohbette İstatistik Satırı', 'Kritik, hız, soğuma ve kaçınma özeti'),
        this.flag('showMapInfo', 'Minimap Saati', 'Haritada yerel saat (FPS göstergesi açıksa kare hızı da)'),
        this.flag('showTips', 'İpuçları', 'Yeni oyuncular için kısa ipuçları'),
        this.flag('questArrow', 'Görev Oku', 'Takip edilen görevin hedefine ekran oku'),
      ),
      this.section('Çevrimiçi', row('Oyuncu Adı', name, 'Boş bırakırsan karakter adın kullanılır'), row('Dil', h('span.pg-gold', null, 'Türkçe'))),
      this.section(
        'Kayıt',
        row(
          'Karakter Kayıtları',
          h(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
            button('Dışa Aktar', () => exportSaves(G.save)),
            button('İçe Aktar', () => openImportDialog(G.save)),
          ),
          'Tüm karakterlerini tek JSON dosyasına kaydet; yedek dosyasını İçe Aktar ile geri yükle',
        ),
      ),
    );
    this.bodyEl.append(divider());
  }

  private async resetAll(): Promise<void> {
    if (!(await askConfirm(this.el, 'Tüm ayarlar (grafik, ses, kontroller) varsayılana dönecek. Emin misin?', 'Sıfırla', 'Vazgeç', true))) return;
    G.settings.reset();
    // Settings.reset() only notifies 'psx': push every key again so graphics / audio / camera listeners re-apply their values
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof SettingsData)[]) if (k !== 'bindings') G.settings.set(k, DEFAULT_SETTINGS[k] as never);
    // CONTROLS_WOW §2.4: "Varsayılana Dön" resets the scheme too, so the bindings are the default scheme's
    const defs = defaultBindings(DEFAULT_SETTINGS.controlScheme);
    for (const a of Object.keys(defs) as InputAction[]) G.input.rebind(a, [...defs[a]]);
    try {
      G.ui?.setUserScale(1);
    } catch {
      /* ignore */
    }
    try {
      G.audio.applyVolumes();
    } catch {
      /* ignore */
    }
    this.renderTab();
    toast('Ayarlar varsayılana döndürüldü.', 'success');
  }
}
