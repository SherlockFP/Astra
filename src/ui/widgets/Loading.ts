import { G } from '../../game/G';
import { ICON, div, iconEl, setStyle, setText, approach } from './dom';
import { resolveHint, type SchemeText } from './controlHints';
import type { LoadingZone } from './loadingZone';

/** Key names are `{k:action}` tokens (resolved from the live bindings when shown); scheme-dependent tips have one text per scheme. */
export const LOADING_TIPS: SchemeText[] = [
  {
    aks: 'Kombo yapmak için {k:skill_lmb} ile arka arkaya saldır; zincirin son vuruşu en ağır olandır.',
    wow: 'Bir düşmana sağ tıkla: seçilir ve otomatik saldırı zinciri kendiliğinden döner; son vuruş en ağır olandır.',
  },
  'Takla atarken ({k:dodge}) kısa süre hasar almazsın. Boss saldırılarından kaçmak için kullan.',
  'Yerdeki kırmızı alanlar düşman saldırılarını işaret eder. Dolmadan önce alandan çık!',
  'Seçkin düşmanlar daha çok eşya düşürür. Sürüleri toplayıp alan hasarıyla temizle.',
  'Mitik+ zindanında +2 için sürenin %80\'i, +3 için %60\'ı içinde bitirmelisin.',
  'Mitik+ koşusunda her ölüm süreye 15 saniye ekler. Dikkatli oyna!',
  'Demirci eşyalarını +15\'e kadar yükseltebilir; ama yüksek seviyelerde eşya yok olabilir.',
  'Efsun nesneleriyle eşyalarının büyülü özelliklerini yeniden belirleyebilirsin.',
  'Yetenek ağacı ({k:talents}) her seviyede puan verir. Anahtar düğümler oyun tarzını değiştirir.',
  '{k:targetNext} tuşuyla yakındaki düşmanlar arasında hedef değiştirebilirsin; 1-5 tuşları yeteneklerini kullanır.',
  'Şişeni {k:flask1} tuşuyla kullan; şarjı kasaba ve köylerde yeniden dolar.',
  'Can iksiri ({k:potionHp}) ve ruh iksiri ({k:potionMp}) kısa bir ortak bekleme süresine sahiptir.',
  {
    aks: '{k:freeCursor} tuşuyla imleci serbest bırakıp arayüze tıklayabilirsin.',
    wow: 'Fare imleci serbest: sol tuşu basılı tutup sürükleyerek kamerayı, sağ tuşla sürükleyerek karakteri döndürebilirsin.',
  },
  'Ekmek, su ve yahni savaş dışında canını yavaşça yeniler ve İyi Beslenmiş etkisi verir.',
  'Haritayı ({k:map}) açarak zindanın keşfettiğin bölümlerini görebilirsin.',
  'Mitik+ anahtarını Güç Çeşmesi\'ne yerleştirerek koşuyu başlat.',
  'Grup kurmak için {k:party} tuşuna bas; bir sunucu aç ya da katıl. En fazla 5 kişi!',
  'Grup bulucu ({k:groupFinder}) ile uygun bir zindana ekip bulabilirsin; düşen eşyaları {k:interact} ile toplarsın.',
  'Öldüğünde ruhunu serbest bırakabilir ya da bir grup arkadaşının seni diriltmesini bekleyebilirsin.',
  'Düşman kuvvetleri yüzde 100\'e ulaşmadan son patron koşuyu bitirmez.',
];

const LORE = 'Kuzgunkale\'nin altında, unutulmuş kralların kemikleri yatar. Kadim zindanlar yeniden uyanıyor...';
/** Shortest time the zone screen stays up once shown (WoW-style: no flicker on a fast load). */
const MIN_SHOW_MS = 600;
/** A load that finishes inside this window never shows the screen at all (no flash). */
const REVEAL_DELAY_MS = 150;
const FADE_MS = 520;
/** idle: hidden. pending: waiting out REVEAL_DELAY_MS. shown: up. closing: holding for MIN_SHOW_MS. fading: CSS fade-out. */
type LoadPhase = 'idle' | 'pending' | 'shown' | 'closing' | 'fading';

const BOOT_TITLE = 'EFSUN ONLINE';
const BOOT_SUB = 'Kadim Zindanlar';

/**
 * Full-screen loading overlay (WoW-style): zone art, zone name and level band, ornate progress bar driven by the real
 * load steps, rotating Turkish tips and drifting embers. Boot uses the crest; scene changes call setZone() first.
 */
export class LoadingScreen {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private pct: HTMLElement;
  private labelEl: HTMLElement;
  private tipEl: HTMLElement;
  private art: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private shown = 0;
  private target = 0;
  private phase: LoadPhase = 'idle';
  private shownAt = 0;
  private timer = 0;
  private tipTimer = 0;
  private tipIdx = Math.floor(Math.random() * LOADING_TIPS.length);

  constructor(layer: HTMLElement) {
    this.el = div('loading', layer);
    this.art = div('ld-art', this.el);
    const embers = div('ld-embers', this.el);
    for (let i = 0; i < 26; i++) {
      const e = div('ld-ember', embers);
      e.style.left = Math.random() * 100 + '%';
      e.style.animationDelay = (-Math.random() * 9).toFixed(2) + 's';
      e.style.animationDuration = (6 + Math.random() * 7).toFixed(2) + 's';
      e.style.setProperty('--s', (1 + Math.random() * 3).toFixed(1) + 'px');
      e.style.setProperty('--dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
    }
    const center = div('ld-center', this.el);
    const crest = div('ld-crest', center);
    iconEl(ICON('ui-dungeon'), 'ld-crest-ico', crest);
    this.titleEl = div('ld-title', center);
    this.titleEl.textContent = BOOT_TITLE;
    this.subEl = div('ld-sub', center);
    this.subEl.textContent = BOOT_SUB;
    const foot = div('ld-foot', this.el);
    this.labelEl = div('ld-label', foot);
    const track = div('ld-track', foot);
    this.bar = div('ld-bar', track);
    div('ld-shine', this.bar);
    this.pct = div('ld-pct', track);
    this.tipEl = div('ld-tip', foot);
    div('ld-lore', foot).textContent = LORE;
    this.el.style.display = 'none';
    G.events.on('loading:progress', ({ loaded, total, label }) => {
      if (this.phase === 'idle') return;
      this.target = Math.max(this.target, total > 0 ? loaded / total : 0);
      if (label) setText(this.labelEl, label);
    });
  }

  /** True from the first show() until the screen has faded out (input stays blocked through the hold). */
  get isVisible(): boolean {
    return this.phase !== 'idle';
  }

  /** Zone header and backdrop for the next show(); null restores the boot title. */
  setZone(zone: LoadingZone | null): void {
    setText(this.titleEl, zone ? zone.name : BOOT_TITLE);
    setText(this.subEl, zone ? zone.band : BOOT_SUB);
    this.art.style.backgroundImage = zone ? `url("${zone.art}")` : '';
  }

  show(progress: number, label?: string, image?: string): void {
    if (this.phase === 'idle') {
      this.phase = 'pending';
      this.shown = 0;
      this.tipTimer = 0;
      this.el.classList.remove('out');
      this.rotateTip();
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.reveal(), REVEAL_DELAY_MS);
    } else if (this.phase === 'closing' || this.phase === 'fading') {
      // a new load started during the hold: cancel the fade-out
      window.clearTimeout(this.timer);
      this.el.classList.remove('out');
      this.phase = 'shown';
    }
    this.target = Math.max(0, Math.min(1, progress));
    if (label !== undefined) setText(this.labelEl, label);
    if (image) this.art.style.backgroundImage = `url("${image}")`;
    else if (image === '') this.art.style.backgroundImage = '';
  }

  /** Ends the load. A screen that never appeared is dropped silently; a shown one holds MIN_SHOW_MS, then fades. */
  hide(): void {
    if (this.phase === 'idle' || this.phase === 'closing' || this.phase === 'fading') return;
    this.target = 1;
    if (this.phase === 'pending') {
      window.clearTimeout(this.timer);
      this.phase = 'idle';
      return;
    }
    const wait = Math.max(0, MIN_SHOW_MS - (performance.now() - this.shownAt));
    this.phase = 'closing';
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.fadeOut(), wait);
  }

  private reveal(): void {
    if (this.phase !== 'pending') return;
    this.phase = 'shown';
    this.shownAt = performance.now();
    this.el.style.display = '';
  }

  private fadeOut(): void {
    this.phase = 'fading';
    this.el.classList.add('out');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.phase !== 'fading') return;
      this.phase = 'idle';
      this.el.style.display = 'none';
    }, FADE_MS);
  }

  private rotateTip(): void {
    this.tipIdx = (this.tipIdx + 1) % LOADING_TIPS.length;
    this.tipEl.classList.remove('swap');
    void this.tipEl.offsetWidth;
    this.tipEl.classList.add('swap');
    this.tipEl.innerHTML = `<b>İpucu:</b> ${resolveHint(LOADING_TIPS[this.tipIdx])}`;
  }

  update(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'pending') return;
    this.shown = approach(this.shown, this.target, 6, dt);
    const p = Math.max(0, Math.min(1, this.shown));
    setStyle(this.bar, 'width', (p * 100).toFixed(1) + '%');
    setText(this.pct, Math.round(p * 100) + '%');
    this.tipTimer += dt;
    if (this.phase === 'shown' && this.tipTimer > 5) {
      this.tipTimer = 0;
      this.rotateTip();
    }
  }
}
