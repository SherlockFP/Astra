import { div, esc, h } from './dom';

interface Pending {
  text: string;
  ok: string;
  cancel: string;
  resolve: (v: boolean) => void;
}

/** Serial modal confirm dialogs. Enter = confirm, Esc = cancel (the UI forwards keys). */
export class Modal {
  private queue: Pending[] = [];
  private current: Pending | null = null;
  private back: HTMLElement;
  private box: HTMLElement;
  private textEl: HTMLElement;
  private okBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  /** performance.now() when the last dialog closed (UI ignores the Esc that closed it). */
  closedAt = 0;

  constructor(layer: HTMLElement) {
    this.back = div('modal-back ui-capture', layer);
    this.back.style.display = 'none';
    this.box = div('modal', this.back);
    div('modal-orn', this.box);
    this.textEl = div('modal-text', this.box);
    const row = div('modal-row', this.box);
    this.okBtn = h('button', 'mbtn ok', row) as HTMLButtonElement;
    this.cancelBtn = h('button', 'mbtn cancel', row) as HTMLButtonElement;
    this.okBtn.addEventListener('click', () => this.close(true));
    this.cancelBtn.addEventListener('click', () => this.close(false));
    document.addEventListener('keydown', (e) => {
      if (!this.current) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(false);
      }
    }, true);
  }

  get isOpen(): boolean {
    return !!this.current;
  }

  ask(text: string, ok = 'Evet', cancel = 'Hayır'): Promise<boolean> {
    return new Promise((resolve) => {
      this.queue.push({ text, ok, cancel, resolve });
      if (!this.current) this.next();
    });
  }

  private next(): void {
    const p = this.queue.shift();
    if (!p) {
      this.current = null;
      this.back.style.display = 'none';
      return;
    }
    this.current = p;
    this.textEl.innerHTML = esc(p.text).replace(/\n/g, '<br>');
    this.okBtn.textContent = p.ok;
    this.cancelBtn.textContent = p.cancel;
    this.cancelBtn.style.display = p.cancel ? '' : 'none';
    this.back.style.display = '';
    this.box.classList.remove('in');
    void this.box.offsetWidth;
    this.box.classList.add('in');
    this.okBtn.focus();
  }

  close(result: boolean): void {
    const p = this.current;
    if (!p) return;
    this.current = null;
    this.closedAt = performance.now();
    p.resolve(result);
    this.next();
  }

  /** Resolve everything as cancelled (scene change). */
  cancelAll(): void {
    const cur = this.current;
    this.current = null;
    cur?.resolve(false);
    for (const q of this.queue) q.resolve(false);
    this.queue = [];
    this.back.style.display = 'none';
  }
}
