import { G } from '../../game/G';
import { div, esc, h, setClass } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import type { ChatChannel } from '../../types/net';

interface Line {
  el: HTMLElement;
  t: number;
}

/** Bottom-left chat: party + system lines that fade out, scrollback, Enter-to-type input. */
export class Chat implements HudWidget {
  readonly el: HTMLElement;
  private log: HTMLElement;
  private input: HTMLInputElement;
  private lines: Line[] = [];
  private focused = false;
  private pendingEcho: string | null = null;
  private echoTimer = 0;
  /** performance.now() of the last time Enter/Esc was consumed by the input (UI hotkeys must ignore it). */
  consumedAt = 0;

  constructor() {
    this.el = div('chat');
    this.log = div('chat-log', this.el);
    const row = div('chat-row', this.el);
    div('chat-chan', row).textContent = 'Grup';
    this.input = h('input', 'chat-input', row) as HTMLInputElement;
    this.input.type = 'text';
    this.input.maxLength = 200;
    this.input.placeholder = 'Mesaj yaz...';
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.send();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.blur();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    this.input.addEventListener('blur', () => {
      this.focused = false;
      setClass(this.el, 'typing', false);
    });
    this.input.addEventListener('focus', () => {
      this.focused = true;
      setClass(this.el, 'typing', true);
    });
    this.log.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.el.classList.add('hud-interactive');

    G.events.on('net:chat', ({ from, text, channel }) => {
      if (this.pendingEcho !== null && channel === 'party' && text === this.pendingEcho) this.pendingEcho = null;
      this.addLine(from, text, channel);
    });
    G.events.on('net:peerJoined', ({ name }) => this.addLine('', `${name} gruba katıldı.`, 'system'));
    G.events.on('net:peerLeft', ({ name }) => this.addLine('', `${name} gruptan ayrıldı.`, 'system'));
    G.events.on('player:levelup', ({ level }) => this.addLine('', `Seviye ${level} oldun! Tebrikler.`, 'system'));
  }

  get isFocused(): boolean {
    return this.focused || document.activeElement === this.input;
  }

  focus(): void {
    if (this.isFocused) return;
    G.input?.unlock();
    this.input.focus();
    this.input.value = '';
    this.focused = true;
    setClass(this.el, 'typing', true);
    this.scrollEnd();
  }

  blur(): void {
    this.consumedAt = performance.now();
    this.focused = false;
    setClass(this.el, 'typing', false);
    this.input.blur();
    this.input.value = '';
    // Input only refreshes its text-focus flag on keydown: poke it with a harmless synthetic key
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F24', key: 'F24' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F24', key: 'F24' }));
    } catch { /* ignore */ }
  }

  private send(): void {
    const text = this.input.value.trim();
    this.consumedAt = performance.now();
    if (!text) {
      this.blur();
      return;
    }
    if (text === '/temizle') {
      this.clear();
      this.blur();
      return;
    }
    this.pendingEcho = text;
    try {
      G.net.sendChat(text);
    } catch (e) {
      console.warn('[chat] send failed', e);
    }
    // NetSession echoes our own message via 'net:chat'; if it did not (offline) echo locally
    window.clearTimeout(this.echoTimer);
    this.echoTimer = window.setTimeout(() => {
      if (this.pendingEcho !== null) {
        this.addLine(G.character?.save.name ?? 'Ben', this.pendingEcho, 'party');
        this.pendingEcho = null;
      }
    }, 120);
    this.blur();
  }

  clear(): void {
    for (const l of this.lines) l.el.remove();
    this.lines = [];
  }

  addLine(from: string, text: string, channel: ChatChannel): void {
    const el = div('cl ' + channel, this.log);
    el.innerHTML = from ? `<span class="cl-from">[${esc(from)}]</span> ${esc(text)}` : esc(text);
    this.lines.push({ el, t: performance.now() });
    while (this.lines.length > 80) this.lines.shift()!.el.remove();
    this.scrollEnd();
  }

  private scrollEnd(): void {
    this.log.scrollTop = this.log.scrollHeight;
  }

  update(ctx: HudCtx): void {
    setClass(this.el, 'open', this.focused);
    for (const l of this.lines) {
      const old = ctx.now - l.t > 12000;
      if (old !== l.el.classList.contains('old')) l.el.classList.toggle('old', old);
    }
  }
}
