import { G } from '../../../game/G';
import { ACTION_NAMES_TR, DEFAULT_BINDINGS, codeLabel, type InputAction } from '../../../core/Input';
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

const GROUPS: { name: string; actions: InputAction[] }[] = [
  { name: 'Hareket', actions: ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'dodge', 'walk'] },
  { name: 'Savaş', actions: ['skill_lmb', 'heavyAttack', 'skill_rmb', 'skill_q', 'skill_e', 'skill_r', 'skill_s1', 'skill_s2', 'skill_s3', 'potionHp', 'potionMp', 'targetNext', 'interact', 'revive'] },
  { name: 'Arayüz', actions: ['inventory', 'character', 'talents', 'skills', 'map', 'party', 'mplus', 'chat', 'menu'] },
  { name: 'Kamera ve Diğer', actions: ['freeCursor', 'toggleLock', 'zoomIn', 'zoomOut', 'screenshot'] },
];

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
              { value: 'metin2', label: 'Metin2' },
              { value: 'orbs', label: 'Küreler' },
            ],
            G.settings.get('hudStyle'),
            (v) => G.settings.set('hudStyle', v),
          ),
          'Alt çubuk: taş panel (Metin2) veya Diablo küreleri',
        ),
      ),
      this.section(
        'Savaş Hissi',
        this.flag('damageNumbers', 'Hasar Sayıları'),
        this.num('screenShake', 'Ekran Sarsıntısı', 0, 1, 0.05, (v) => (v === 0 ? 'Kapalı' : `%${Math.round(v * 100)}`), 'Vuruş ve patlamalarda kamera sarsıntısı'),
      ),
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

  private renderControls(): void {
    const cam = this.section(
      'Kamera',
      row(
        'Kamera Modu',
        selectBox<'action' | 'classic'>(
          [
            { value: 'action', label: 'Aksiyon' },
            { value: 'classic', label: 'Klasik' },
          ],
          G.settings.get('cameraMode'),
          (v) => G.settings.set('cameraMode', v),
        ),
        'Aksiyon: fare ekranı kilitler, kamera fareyle döner. Klasik: sağ tık sürükleyerek döndür.',
      ),
      this.num('mouseSensitivity', 'Fare Hassasiyeti', 0.2, 3, 0.05, (v) => v.toFixed(2).replace('.', ',')),
      this.flag('invertY', 'Y Eksenini Ters Çevir'),
      this.num('cameraDistance', 'Kamera Mesafesi', 4, 16, 0.5, (v) => `${v} m`),
    );
    const combat = this.section('Savaş', this.flag('autoCombo', 'Basılı tutunca saldırı zinciri', 'Kapalıyken sol tık basılı tutmak ağır vuruşu şarj eder'));
    this.bodyEl.append(cam, combat);

    const binds =h('div.pg-set-sec', null, h('div.pg-h', null, 'Tuş Atamaları'));
    binds.append(h('div.pg-set-bindhelp', null, 'Bir kutuya tıkla, sonra yeni tuşa bas. ', h('b', null, 'Esc'), ': iptal · ', h('b', null, 'Backspace'), ': temizle · Fare sağ/orta tuşu da atanabilir.'));
    for (const g of GROUPS) {
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
    return h('div.pg-bindrow', null, h('span.pg-bindname', null, ACTION_NAMES_TR[action]), mk(0), mk(1), reset);
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
      this.setCode(action, slot, 'Mouse' + e.button);
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

  private persistBinding(action: InputAction): void {
    const all = { ...G.settings.get('bindings') };
    all[action] = [...G.input.bindings[action]];
    G.settings.set('bindings', all);
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
    // steal the code from other actions
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
    if (stolenFrom.length) toast(`"${codeLabel(code)}" tuşu ${stolenFrom.map((a) => ACTION_NAMES_TR[a]).join(', ')} işleminden alındı.`, 'info');
    this.refreshBinds();
  }

  private refreshBinds(): void {
    for (const key of this.bindBtns.keys()) {
      const [a, s] = key.split(':');
      this.paintBind(a as InputAction, Number(s));
    }
  }

  private resetAction(action: InputAction): void {
    G.input.rebind(action, [...DEFAULT_BINDINGS[action]]);
    const all = { ...G.settings.get('bindings') };
    delete all[action];
    G.settings.set('bindings', all);
    this.refreshBinds();
  }

  private async resetBindings(): Promise<void> {
    if (!(await askConfirm(this.el, 'Tüm tuş atamaları varsayılana döndürülsün mü?', 'Sıfırla', 'Vazgeç', true))) return;
    for (const a of Object.keys(DEFAULT_BINDINGS) as InputAction[]) G.input.rebind(a, [...DEFAULT_BINDINGS[a]]);
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
    for (const a of Object.keys(DEFAULT_BINDINGS) as InputAction[]) G.input.rebind(a, [...DEFAULT_BINDINGS[a]]);
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
