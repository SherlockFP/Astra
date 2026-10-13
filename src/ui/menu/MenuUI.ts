import './menu.css';
import { h } from '../../core/utils';
import type { ClassId } from '../../types/common';
import { CLASS_ORDER, VARIANTS, classPresentation, randomName } from './classInfo';

/**
 * DOM overlay of the main menu: title, character list, command stack (Oyna / Yeni Karakter / Sil / Ayarlar /
 * Sunucular / Jenerik / Çıkış), creation screen (class picker, colour variants, name), nameplates projected from 3D
 * and a small modal dialog. The 3D side lives in scenes/MenuScene.ts; this class only owns DOM + callbacks.
 * OWNER: scenes module (ui/menu).
 */

export interface CharRow {
  id: string;
  name: string;
  classId: ClassId;
  level: number;
  rating: number;
  lastPlayed: number;
}

export interface MenuCallbacks {
  onSelect(id: string): void;
  onPlay(): void;
  onNew(): void;
  onDelete(): void;
  onSettings(): void;
  onServers(): void;
  onCredits(): void;
  onExit(): void;
  onPickClass(id: ClassId): void;
  onPickVariant(i: number): void;
  /** Returns an error message to show (null = accepted). */
  onSubmitCreate(name: string): string | null;
  onValidateName(name: string): string | null;
  onBackFromCreate(): void;
  onUiSound(kind: 'click' | 'hover' | 'error'): void;
}

export interface PlateState {
  x: number;
  y: number;
  visible: boolean;
  hot: boolean;
}

export interface ModalOpts {
  title: string;
  html: string;
  okLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** User must type this text to enable OK (delete confirmation). */
  requireText?: string;
}

const iconStyle = (url: string, color: string): string => `--m:url("${url}");--c:${color}`;

export class MenuUI {
  readonly root: HTMLDivElement;
  private cb: MenuCallbacks;
  private mode: 'select' | 'create' = 'select';
  private plateLayer = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
  private plates = new Map<string, HTMLDivElement>();

  // select
  private selectWrap = h('div');
  private listEl = h('div.efs-panel.efs-list');
  private stackEl = h('div.efs-panel.efs-stack');
  private playEl = h('div.efs-play');
  private footerEl = h('div.efs-footer');
  private playBtn!: HTMLButtonElement;
  private newBtn!: HTMLButtonElement;
  private delBtn!: HTMLButtonElement;
  private serversBtn!: HTMLButtonElement;

  // create
  private createWrap = h('div');
  private createL = h('div.efs-panel.efs-create-l');
  private createR = h('div.efs-panel.efs-create-r');
  private classCards = new Map<ClassId, HTMLElement>();
  private swatchEls: HTMLElement[] = [];
  private nameInput!: HTMLInputElement;
  private errEl!: HTMLElement;
  private variantName!: HTMLElement;
  private createBtn!: HTMLButtonElement;
  private dragHint = h('div.efs-drag', null, 'Karakteri döndürmek için sürükle');
  private currentClass: ClassId = 'knight';
  private currentVariant = 0;

  private modalEl: HTMLElement | null = null;
  private titleEl: HTMLElement;

  constructor(parent: HTMLElement, cb: MenuCallbacks) {
    this.cb = cb;
    this.root = h('div.efs-menu');
    this.root.append(h('div.efs-vignette'));

    this.titleEl = h('div.efs-title', null, h('h1', null, 'EFSUN ONLINE'), h('div.efs-sub', null, 'KADİM ZİNDANLAR'));
    this.buildSelect();
    this.buildCreate();
    this.root.append(this.titleEl, this.plateLayer, this.selectWrap, this.createWrap, h('div.efs-ver', null, 'v0.1 · Erken Erişim'));
    parent.appendChild(this.root);
    this.setMode('select');
  }

  // ------------------------------------------------------------------ build: select
  private btn(label: string, onClick: () => void, cls = '', sub?: string): HTMLButtonElement {
    const b = h(('button.efs-btn' + (cls ? '.' + cls.split(' ').join('.') : '')) as 'button.x', null, label) as HTMLButtonElement;
    if (sub) b.append(h('span.sub', null, sub));
    b.addEventListener('click', () => {
      if (b.disabled) return;
      this.cb.onUiSound('click');
      onClick();
    });
    b.addEventListener('mouseenter', () => !b.disabled && this.cb.onUiSound('hover'));
    return b;
  }

  private buildSelect(): void {
    this.playBtn = this.btn('Oyna', () => this.cb.onPlay(), 'primary');
    this.newBtn = this.btn('Yeni Karakter', () => this.cb.onNew());
    this.delBtn = this.btn('Sil', () => this.cb.onDelete(), 'danger');
    this.serversBtn = this.btn('Sunucular', () => this.cb.onServers());
    this.stackEl.append(
      this.newBtn,
      this.delBtn,
      h('div.sep'),
      this.btn('Ayarlar', () => this.cb.onSettings()),
      this.serversBtn,
      this.btn('Jenerik', () => this.cb.onCredits()),
      h('div.sep'),
      this.btn('Çıkış', () => this.cb.onExit(), 'danger'),
    );
    this.playEl.append(h('div.who'), this.playBtn);
    this.footerEl.innerHTML = '<kbd>←</kbd><kbd>→</kbd> karakter seç &nbsp;·&nbsp; <kbd>Enter</kbd> oyna &nbsp;·&nbsp; Ateşin başındaki kahramanlara tıklayabilirsin';
    this.selectWrap.append(this.listEl, this.stackEl, this.playEl, this.footerEl);
  }

  /** Refresh the character list + play bar. */
  setCharacters(allRows: CharRow[], selectedId: string | null, maxSlots: number): void {
    // one card per character id (the list is rebuilt from scratch every call, so a duplicate row can only come from the data)
    const seen = new Set<string>();
    const rows = allRows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
    const list = this.listEl;
    list.replaceChildren(h('h2', null, `Kahramanlar (${rows.length}/${maxSlots})`));
    if (!rows.length) {
      list.append(h('div.efs-empty', null, h('b', null, 'Ateş yalnız yanıyor'), 'Ateşin başında henüz kimse yok. İlk kahramanını yaratarak destanına başla.'));
    }
    for (const r of rows) {
      const p = classPresentation(r.classId);
      const el = h(
        ('div.efs-char' + (r.id === selectedId ? '.sel' : '')) as 'div.x',
        {
          onclick: () => {
            this.cb.onUiSound('click');
            this.cb.onSelect(r.id);
          },
          onmouseenter: () => this.cb.onUiSound('hover'),
        },
        h('div.efs-icon', { style: iconStyle(p.icon, p.color) }),
        h('div', null, h('div.nm', null, r.name), h('div.meta', null, `Sv. ${r.level} ${p.name}`)),
        r.rating > 0 ? h('div.rt', null, h('div', null, 'Mitik+'), h('div', null, String(Math.round(r.rating)))) : null,
      );
      list.append(el);
    }
    const sel = rows.find((r) => r.id === selectedId) ?? null;
    const who = this.playEl.querySelector('.who') as HTMLElement;
    if (sel) {
      const p = classPresentation(sel.classId);
      who.replaceChildren(h('div.n', null, sel.name), h('div.c', null, `Seviye ${sel.level} ${p.name}`));
    } else {
      who.replaceChildren(h('div.c', null, rows.length ? 'Bir kahraman seç' : 'Önce bir kahraman yarat'));
    }
    this.playBtn.disabled = !sel;
    this.delBtn.disabled = !sel;
    this.newBtn.disabled = rows.length >= maxSlots;
    this.newBtn.title = rows.length >= maxSlots ? 'Karakter yuvaları dolu' : '';
  }

  // ------------------------------------------------------------------ build: create
  private buildCreate(): void {
    const l = this.createL;
    l.append(h('h2', null, 'Kahraman Yarat'));
    for (const id of CLASS_ORDER) {
      const p = classPresentation(id);
      const card = h(
        'div.efs-class',
        {
          style: `--c:${p.color}`,
          onclick: () => {
            this.cb.onUiSound('click');
            this.cb.onPickClass(id);
          },
          onmouseenter: () => this.cb.onUiSound('hover'),
        },
        h('div.efs-icon', { style: iconStyle(p.icon, p.color) }),
        h('div', null, h('div.nm', null, p.name), h('div.tg', null, p.tagline)),
      );
      this.classCards.set(id, card);
      l.append(card);
    }
    l.append(h('div.efs-label', null, 'Renk Varyantı'));
    const sw = h('div.efs-swatches');
    VARIANTS.forEach((v, i) => {
      const e = h('div.efs-sw', {
        style: `--c:${v.css}`,
        title: v.name,
        onclick: () => {
          this.cb.onUiSound('click');
          this.cb.onPickVariant(i);
        },
      });
      this.swatchEls.push(e);
      sw.append(e);
    });
    this.variantName = h('div.efs-vname');
    l.append(sw, this.variantName);

    l.append(h('div.efs-label', null, 'Kahraman Adı'));
    this.nameInput = h('input.efs-input', { type: 'text', maxLength: 14, placeholder: 'Bir isim seç...', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    this.nameInput.addEventListener('input', () => {
      const v = this.nameInput.value;
      const err = v.length ? this.cb.onValidateName(v) : null;
      this.setNameError(err);
    });
    this.nameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.submit();
      if (e.key === 'Escape') this.cb.onBackFromCreate();
    });
    const dice = h('button.efs-dice', {
      title: 'Rastgele isim',
      onclick: () => {
        this.cb.onUiSound('click');
        this.nameInput.value = randomName();
        this.setNameError(this.cb.onValidateName(this.nameInput.value));
      },
    }, '⚄');
    this.errEl = h('div.efs-err');
    l.append(h('div.efs-namerow', null, this.nameInput, dice), this.errEl);

    this.createBtn = this.btn('Oluştur', () => this.submit(), 'primary');
    this.createBtn.style.minHeight = '54px';
    this.createBtn.style.fontSize = '20px';
    l.append(h('div.efs-actions', null, this.createBtn, this.btn('Geri', () => this.cb.onBackFromCreate(), 'small')));

    this.createWrap.append(this.createL, this.createR, this.dragHint);
  }

  private submit(): void {
    const err = this.cb.onSubmitCreate(this.nameInput.value);
    if (err) {
      this.setNameError(err);
      this.cb.onUiSound('error');
      this.nameInput.focus();
    }
  }

  setNameError(msg: string | null): void {
    this.errEl.textContent = msg ?? '';
    this.nameInput.classList.toggle('bad', !!msg);
  }

  /** Update the class details + selection state of the creation screen. */
  setCreateSelection(classId: ClassId, variant: number): void {
    this.currentClass = classId;
    this.currentVariant = variant;
    const p = classPresentation(classId);
    for (const [id, el] of this.classCards) el.classList.toggle('sel', id === classId);
    this.swatchEls.forEach((e, i) => e.classList.toggle('sel', i === variant));
    this.variantName.textContent = `${VARIANTS[variant]?.name ?? ''} varyant`;
    const pips = (n: number) => h('div.efs-pips', null, ...[0, 1, 2, 3, 4].map((i) => h(('div.efs-pip' + (i < n ? '.on' : '')) as 'div.x')));
    const r = this.createR;
    r.style.setProperty('--c', p.color);
    r.replaceChildren(
      h('h2', null, 'Sınıf Bilgisi'),
      h('div.efs-detail-hd', null, h('div.efs-icon'), h('div', null, h('div.nm', null, p.name), h('div.tg', null, p.tagline))),
      h('div.efs-badges', null, h('span.efs-badge', null, p.role), h('span.efs-badge', { style: `--c:${p.resourceColor}` }, `Kaynak: ${p.resource}`)),
      h('p.efs-desc', null, p.desc),
      h('div.efs-label', null, 'Öne Çıkanlar'),
      h('ul.efs-hl', null, ...p.highlights.map((t) => {
        const i = t.indexOf(':');
        return h('li', null, i > 0 ? h('b', null, t.slice(0, i + 1)) : '', i > 0 ? t.slice(i + 1) : t);
      })),
      h('div.efs-label', null, 'Karakteristik'),
      h('div.efs-stat', null, h('span.k', null, 'Dayanıklılık'), pips(p.stats.dayaniklilik)),
      h('div.efs-stat', null, h('span.k', null, 'Hasar'), pips(p.stats.hasar)),
      h('div.efs-stat', null, h('span.k', null, 'Hareket'), pips(p.stats.hareket)),
      h('div.efs-stat', null, h('span.k', null, 'Menzil'), pips(p.stats.menzil)),
    );
    // icon (mask-based) needs custom properties, set explicitly
    const ic = r.querySelector('.efs-detail-hd .efs-icon') as HTMLElement;
    ic.style.cssText = `${iconStyle(p.icon, p.color)};width:54px;height:54px`;
  }

  focusName(): void {
    setTimeout(() => this.nameInput.focus(), 350);
  }
  resetCreateForm(): void {
    this.nameInput.value = '';
    this.setNameError(null);
  }

  // ------------------------------------------------------------------ mode
  setMode(mode: 'select' | 'create'): void {
    this.mode = mode;
    this.selectWrap.style.display = mode === 'select' ? '' : 'none';
    this.createWrap.style.display = mode === 'create' ? '' : 'none';
    this.titleEl.style.animation = 'none';
    this.titleEl.style.transition = 'opacity .5s';
    this.titleEl.style.opacity = mode === 'select' ? '1' : '0.0';
    if (mode === 'create') this.setCreateSelection(this.currentClass, this.currentVariant);
  }
  getMode(): 'select' | 'create' {
    return this.mode;
  }
  /** Re-trigger the CSS entrance animations (after returning from create). */
  replayIntro(): void {
    for (const el of [this.listEl, this.stackEl, this.playEl]) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    }
  }

  // ------------------------------------------------------------------ nameplates
  ensurePlate(key: string, name: string, classLine: string, extra: string, color: string, isNew = false): void {
    let el = this.plates.get(key);
    if (!el) {
      el = h(('div.efs-plate' + (isNew ? '.new' : '')) as 'div.x') as HTMLDivElement;
      this.plateLayer.append(el);
      this.plates.set(key, el);
    }
    el.style.setProperty('--c', color);
    el.replaceChildren(h('div.n', null, name), h('div.c', null, classLine), h('div.x', null, extra));
  }
  updatePlate(key: string, s: PlateState): void {
    const el = this.plates.get(key);
    if (!el) return;
    el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    el.classList.toggle('on', s.visible);
    el.classList.toggle('hot', s.visible && s.hot);
  }
  removePlate(key: string): void {
    this.plates.get(key)?.remove();
    this.plates.delete(key);
  }
  clearPlates(): void {
    for (const el of this.plates.values()) el.remove();
    this.plates.clear();
  }
  hidePlates(): void {
    for (const el of this.plates.values()) el.classList.remove('on', 'hot');
  }

  setServersEnabled(enabled: boolean): void {
    this.serversBtn.disabled = !enabled;
  }

  // ------------------------------------------------------------------ modal
  modal(o: ModalOpts): Promise<boolean> {
    this.closeModal();
    return new Promise((resolve) => {
      let input: HTMLInputElement | null = null;
      const ok = this.btn(o.okLabel, () => done(true), o.danger ? 'danger' : '');
      const cancel = this.btn(o.cancelLabel ?? 'Vazgeç', () => done(false));
      if (o.requireText) {
        input = h('input.efs-input', { type: 'text', placeholder: o.requireText, spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
        ok.disabled = true;
        input.addEventListener('input', () => {
          ok.disabled = (input!.value.trim().toLocaleLowerCase('tr') !== o.requireText!.toLocaleLowerCase('tr'));
        });
        input.addEventListener('keydown', (e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && !ok.disabled) done(true);
          if (e.key === 'Escape') done(false);
        });
      }
      const done = (v: boolean) => {
        this.closeModal();
        resolve(v);
      };
      const body = h('div.efs-modal', null, h('div.efs-panel', { style: { position: 'relative' } }, h('h2', null, o.title), h('p', { html: o.html }), input, h('div.row', null, cancel, ok)));
      const bg = h('div.efs-modal-bg', {
        onmousedown: (e: MouseEvent) => {
          if (e.target === bg) done(false);
        },
      }, body);
      this.modalEl = bg;
      this.root.append(bg);
      if (input) setTimeout(() => input!.focus(), 60);
      else setTimeout(() => (o.danger ? cancel : ok).focus(), 60);
    });
  }
  closeModal(): void {
    this.modalEl?.remove();
    this.modalEl = null;
  }
  get modalOpen(): boolean {
    return !!this.modalEl;
  }

  /** Full-screen farewell (Çıkış). */
  showBye(): void {
    this.root.append(h('div.efs-bye', null, h('div.t', null, 'Tekrar görüşmek üzere'), h('div.s', null, 'Ateş seni bekliyor, kahraman. Sekmeyi kapatabilirsin.')));
  }

  dispose(): void {
    this.root.remove();
    this.plates.clear();
  }
}
