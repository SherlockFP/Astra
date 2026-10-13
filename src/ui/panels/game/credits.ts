import { GamePanel, button, h, icon, windowFrame } from './base';
import { CREDITS, CREDITS_THANKS } from './creditsData';

/** "Jenerik": scrolling credits (auto-scroll, hover/wheel pauses it). */
export class CreditsPanel extends GamePanel {
  private scroller!: HTMLElement;
  private raf = 0;
  private last = 0;
  private pauseUntil = 0;
  private pos = 0;

  constructor() {
    super('credits', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Emeği Geçenler', icon: '/assets/icons/ui-laurels.svg', cls: 'pg-credits', onClose: () => this.requestClose() });
    body.style.padding = '0';
    body.style.overflow = 'hidden';
    this.scroller = h('div.pg-cr-scroll.pg-scroll');
    const roll = h('div.pg-cr-roll');
    roll.append(
      h('div.pg-cr-hero', null, h('div.pg-cr-t1', null, 'EFSUN ONLINE'), h('div.pg-cr-t2', null, 'Kadim Zindanlar')),
      h('div.pg-cr-lead', null, 'Bu oyunun ortaya çıkmasını sağlayan yetenekli sanatçıların ve geliştiricilerin emeği için minnettarız. Aşağıdaki çalışmaların lisansları gereği adları burada anılır.'),
    );
    for (const sec of CREDITS) {
      const s = h('section.pg-cr-sec', null, h('div.pg-cr-h', null, icon(sec.icon), h('span', null, sec.title)));
      if (sec.intro) s.append(h('p.pg-cr-intro', null, sec.intro));
      for (const e of sec.entries) {
        s.append(
          h(
            'div.pg-cr-entry' + (e.required ? '.is-req' : ''),
            null,
            h('div.pg-cr-title', null, e.title),
            h('div.pg-cr-by', null, e.by),
            h('div.pg-cr-lic', null, e.required ? h('i', null, '★') : null, e.licence),
            e.note ? h('div.pg-cr-note', null, e.note) : null,
          ),
        );
      }
      if (sec.attribution) s.append(h('blockquote.pg-cr-attr', null, sec.attribution));
      roll.append(s);
    }
    roll.append(h('div.pg-cr-thanks', null, CREDITS_THANKS), h('div.pg-cr-end'));
    this.scroller.append(roll);
    const stop = () => (this.pauseUntil = performance.now() + 3500);
    this.scroller.addEventListener('wheel', stop, { passive: true });
    this.scroller.addEventListener('pointerdown', stop);
    this.scroller.addEventListener('mouseenter', stop);
    body.append(this.scroller);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'primary' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.scroller.scrollTop = 0;
    this.pos = 0;
    this.pauseUntil = performance.now() + 1500;
    this.last = performance.now();
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  protected onClose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number): void => {
    if (!this.isOpen) {
      this.raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (now > this.pauseUntil) {
      const max = this.scroller.scrollHeight - this.scroller.clientHeight;
      if (Math.abs(this.scroller.scrollTop - this.pos) > 3) this.pos = this.scroller.scrollTop;
      if (this.pos < max) {
        this.pos += 38 * dt;
        this.scroller.scrollTop = this.pos;
      }
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
