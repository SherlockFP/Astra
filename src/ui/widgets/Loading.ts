import { G } from '../../game/G';
import { ICON, div, iconEl, setStyle, setText, approach } from './dom';
import { resolveHint, type SchemeText } from './controlHints';

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
  'Grupla oynarken boss\'un kesilebilir büyülerini sersemletme veya susturmayla durdur.',
  'Bir eşyanın üstüne gelince kuşandığınla farkları yeşil ve kırmızı görürsün.',
  'Can iksiri ({k:potionHp}) ve ruh iksiri ({k:potionMp}) kısa bir ortak bekleme süresine sahiptir.',
  {
    aks: '{k:freeCursor} tuşuyla imleci serbest bırakıp arayüze tıklayabilirsin.',
    wow: 'Fare imleci serbest: sol tuşu basılı tutup sürükleyerek kamerayı, sağ tuşla sürükleyerek karakteri döndürebilirsin.',
  },
  'Kritik ve bitirici vuruşlar daha uzun vuruş duraklaması yaratır; hissederek oyna!',
  'Haritayı ({k:map}) açarak zindanın keşfettiğin bölümlerini görebilirsin.',
  'Mitik+ anahtarını Güç Çeşmesi\'ne yerleştirerek koşuyu başlat.',
  'Grup kurmak için {k:party} tuşuna bas; bir sunucu aç ya da katıl. En fazla 5 kişi!',
  'Düşen eşyaları {k:interact} tuşuyla toplayabilirsin.',
  'Öldüğünde ruhunu serbest bırakabilir ya da bir grup arkadaşının seni diriltmesini bekleyebilirsin.',
  'Düşman kuvvetleri yüzde 100\'e ulaşmadan son patron koşuyu bitirmez.',
];

const LORE = 'Kuzgunkale\'nin altında, unutulmuş kralların kemikleri yatar. Kadim zindanlar yeniden uyanıyor...';

/** Full-screen loading overlay: crest art, ornate progress bar, rotating Turkish tips, drifting embers. */
export class LoadingScreen {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private pct: HTMLElement;
  private labelEl: HTMLElement;
  private tipEl: HTMLElement;
  private art: HTMLElement;
  private shown = 0;
  private target = 0;
  private visible = false;
  private tipTimer = 0;
  private tipIdx = Math.floor(Math.random() * LOADING_TIPS.length);
  private hideTimer = 0;

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
    div('ld-title', center).textContent = 'EFSUN ONLINE';
    div('ld-sub', center).textContent = 'Kadim Zindanlar';
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
      if (!this.visible) return;
      this.target = Math.max(this.target, total > 0 ? loaded / total : 0);
      if (label) setText(this.labelEl, label);
    });
  }

  get isVisible(): boolean {
    return this.visible;
  }

  show(progress: number, label?: string, image?: string): void {
    window.clearTimeout(this.hideTimer);
    if (!this.visible) {
      this.visible = true;
      this.el.style.display = '';
      this.el.classList.remove('out');
      this.shown = 0;
      this.tipTimer = 0;
      this.rotateTip();
    }
    this.target = Math.max(0, Math.min(1, progress));
    if (label !== undefined) setText(this.labelEl, label);
    if (image) this.art.style.backgroundImage = `url("${image}")`;
    else if (image === '') this.art.style.backgroundImage = '';
  }

  hide(): void {
    if (!this.visible) return;
    this.target = 1;
    this.visible = false;
    this.el.classList.add('out');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (!this.visible) this.el.style.display = 'none';
    }, 520);
  }

  private rotateTip(): void {
    this.tipIdx = (this.tipIdx + 1) % LOADING_TIPS.length;
    this.tipEl.classList.remove('swap');
    void this.tipEl.offsetWidth;
    this.tipEl.classList.add('swap');
    this.tipEl.innerHTML = `<b>İpucu:</b> ${resolveHint(LOADING_TIPS[this.tipIdx])}`;
  }

  update(dt: number): void {
    if (!this.visible && !this.el.classList.contains('out')) return;
    this.shown = approach(this.shown, this.target, 6, dt);
    const p = Math.max(0, Math.min(1, this.shown));
    setStyle(this.bar, 'width', (p * 100).toFixed(1) + '%');
    setText(this.pct, Math.round(p * 100) + '%');
    this.tipTimer += dt;
    if (this.visible && this.tipTimer > 5) {
      this.tipTimer = 0;
      this.rotateTip();
    }
  }
}
