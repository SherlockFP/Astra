import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { AnimController } from '../../entities/AnimController';
import { classColor } from '../widgets/classColors';
import { clampN, div, esc, h, setClass, setStyle } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';
import type { ChatChannel } from '../../types/net';
import { getSocial } from '../../systems/Social';
import { getGuild } from '../../systems/Guild';
import { upcomingEventLines } from '../../scenes/world/EventCalendar';

/* ================================================================================================
 * UX-31 (§5.1): tabbed chat. Tabs: Genel · Grup · Fısıltı · Sistem · Savaş. Each tab keeps its own buffer
 * (200 lines); a line goes to every tab that lists its channel. Tabs with no lines yet are hidden.
 * ============================================================================================== */

type TabId = 'genel' | 'grup' | 'fisilti' | 'dunya' | 'ticaret' | 'lonca' | 'sistem' | 'savas';
interface TabDef {
  id: TabId;
  label: string;
  /** Always shown (otherwise only once it has a line). */
  always: boolean;
  channels: readonly ChatChannel[];
}
const TABS: readonly TabDef[] = [
  { id: 'genel', label: 'Genel', always: true, channels: ['say', 'yell', 'party', 'whisper', 'global', 'trade', 'guild', 'emote', 'system'] },
  { id: 'grup', label: 'Grup', always: true, channels: ['party'] },
  { id: 'fisilti', label: 'Fısıltı', always: false, channels: ['whisper'] },
  { id: 'dunya', label: 'Dünya', always: false, channels: ['global'] },
  { id: 'ticaret', label: 'Ticaret', always: false, channels: ['trade'] },
  { id: 'lonca', label: 'Lonca', always: false, channels: ['guild'] },
  { id: 'sistem', label: 'Sistem', always: true, channels: ['system', 'loot', 'boss'] },
  { id: 'savas', label: 'Savaş', always: false, channels: [] },
];
/** Tabs whose idle lines never fade (§5.1 "Fade"). */
const NO_FADE: ReadonlySet<TabId> = new Set<TabId>(['fisilti', 'sistem']);
/** Channel prefix of a line (WoW "[1. Genel]"); other channels have none. */
const CHAN_PREFIX: Partial<Record<ChatChannel, string>> = { global: 'Genel', trade: 'Ticaret', guild: 'Lonca' };
const LINE_CAP = 200;
const FADE_AFTER_MS = 12000;
const YELL_COOLDOWN_MS = 5000;

/** Send channels of the input row (the chip cycles them with Tab). `party` is the net default. */
type SendCh = 'party' | 'say' | 'yell' | 'global' | 'trade';
const SEND: readonly { id: SendCh; label: string }[] = [
  { id: 'party', label: 'Grup' },
  { id: 'say', label: 'Yakın' },
  { id: 'yell', label: 'Bağır' },
  { id: 'global', label: 'Genel Sohbet' },
  { id: 'trade', label: 'Ticaret' },
];

/**
 * WoW-style emotes: chat id -> Turkish line (`<name> <label>`) and the KayKit clip to play. `clips` is tried in order
 * (the first one the rig has wins); an emote whose clips a rig lacks still shows its line.
 */
export interface EmoteDef { label: string; clips: readonly string[]; hint: string }
export const EMOTES: Readonly<Record<string, EmoteDef>> = {
  dance: { label: 'dans ediyor', clips: ['Dance', 'CharacterArmature|Dance', 'Cheer'], hint: 'Dans et' },
  wave: { label: 'el sallıyor', clips: ['Wave', 'CharacterArmature|Wave', 'Interact'], hint: 'El salla' },
  bow: { label: 'selam veriyor', clips: ['Duck', 'CharacterArmature|Duck', 'Interact'], hint: 'Selam ver (eğil)' },
  cheer: { label: 'tezahürat yapıyor', clips: ['Cheer', 'CharacterArmature|Cheer'], hint: 'Tezahürat yap' },
  laugh: { label: 'kahkaha atıyor', clips: ['Taunt_Longer', 'Taunt'], hint: 'Gülümse / kahkaha' },
  sit: { label: 'oturuyor', clips: ['Sit_Floor_Down', 'Sit_Chair_Down'], hint: 'Otur' },
  yes: { label: 'evet diyor', clips: ['Yes', 'CharacterArmature|Yes'], hint: 'Evet' },
  no: { label: 'hayır diyor', clips: ['No', 'CharacterArmature|No'], hint: 'Hayır' },
  taunt: { label: 'kışkırtıyor', clips: ['Taunt', 'Taunt_Longer'], hint: 'Kışkırt' },
};

/** Commands shown by the `/` hint card (local commands first, then emotes). */
const COMMANDS: readonly { cmd: string; hint: string }[] = [
  { cmd: 'g', hint: 'Genel Sohbet: /g mesaj (veya /1)' },
  { cmd: 'ticaret', hint: 'Ticaret kanalı: /ticaret mesaj (veya /2)' },
  { cmd: 'l', hint: 'Lonca sohbeti: /l mesaj' },
  { cmd: 'lonca', hint: 'Lonca: /lonca kur | davet | at | ayril | bilgi' },
  { cmd: 'w', hint: 'Fısıltı: /w isim mesaj' },
  { cmd: 'r', hint: 'Son fısıldayana yanıt: /r mesaj' },
  { cmd: 'kim', hint: 'Çevrimiçi oyuncuları listele' },
  { cmd: 'yardim', hint: 'Komut listesi' },
  { cmd: 'temizle', hint: 'Sohbeti temizle' },
  { cmd: 'arayuz', hint: 'Arayüzü düzenle' },
  { cmd: 'zindan', hint: 'Zindan Bulucu' },
  { cmd: 'etkinlik', hint: 'Sıradaki dünya etkinlikleri' },
  ...Object.keys(EMOTES).map((id) => ({ cmd: id, hint: EMOTES[id].hint })),
];

interface TabState {
  def: TabDef;
  btn: HTMLButtonElement;
  log: HTMLElement;
  lines: { el: HTMLElement; t: number }[];
  unread: boolean;
}

/** Plays an emote clip on an actor. Nothing while dead, locked, mid-action or moving (WoW cancels an emote on move). */
function playEmoteOn(actor: Actor | null | undefined, id: string): void {
  const def = EMOTES[id];
  const a = actor?.anim as AnimController | null | undefined;
  if (!actor || !def || !a || actor.isDead || a.locked || a.isPlayingOneShot) return;
  if (actor.velocity.lengthSq() > 0.25) return;
  const clip = a.pick(...def.clips);
  if (clip) a.playOnce(clip, { fade: 0.15 });
}

/** A remote party member's actor by its name (remote players are entities of the world). */
function remoteActorNamed(name: string): Actor | null {
  const world = G.world;
  if (!world || !name) return null;
  for (const e of world.entities.values()) {
    const a = e as Actor;
    if (a.name === name && a.anim !== undefined && a !== G.player) return a;
  }
  return null;
}

/** Bottom-left chat: tabs, per-tab scrollback, Enter-to-type input with send channels, emotes and local commands. */
export class Chat implements HudWidget {
  readonly el: HTMLElement;
  private tabStrip: HTMLElement;
  private logWrap: HTMLElement;
  private newChip: HTMLElement;
  private hint: HTMLElement;
  private row: HTMLElement;
  private chip: HTMLElement;
  private statsEl: HTMLElement;
  private input: HTMLInputElement;
  private tabs: TabState[] = [];
  private active: TabId = 'genel';
  private focused = false;
  private sendIdx = 0;
  private lastYell = -1e9;
  private fadeAcc = 0;
  private statsAcc = 0;
  /** performance.now() of the last time Enter/Esc was consumed by the input (UI hotkeys must ignore it). */
  consumedAt = 0;

  constructor() {
    this.el = div('chat');
    this.statsEl = div('chat-stats', this.el);
    this.statsEl.style.display = 'none';
    this.tabStrip = div('chat-tabs', this.el);
    this.logWrap = div('chat-logwrap', this.el);
    this.newChip = div('chat-new', this.logWrap, 'Yeni mesajlar ↓');
    this.newChip.style.display = 'none';
    this.newChip.addEventListener('click', () => {
      this.scrollEnd();
      this.newChip.style.display = 'none';
    });
    this.hint = div('chat-hint', this.el);
    this.row = div('chat-row', this.el);
    this.chip = div('chat-chan', this.row);
    this.input = h('input', 'chat-input', this.row) as HTMLInputElement;
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
      } else if (e.key === 'Tab') {
        this.cycleSend();
        e.preventDefault();
      }
      e.stopPropagation();
    });
    this.input.addEventListener('input', () => this.updateHint());
    this.input.addEventListener('blur', () => {
      this.focused = false;
      setClass(this.el, 'typing', false);
    });
    this.input.addEventListener('focus', () => {
      this.focused = true;
      setClass(this.el, 'typing', true);
    });
    this.logWrap.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.logWrap.addEventListener('scroll', () => {
      if (this.atBottom()) this.newChip.style.display = 'none';
    }, { passive: true });
    this.el.classList.add('hud-interactive');

    for (const def of TABS) {
      const btn = h('button', 'chat-tab', this.tabStrip, def.label) as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', () => this.select(def.id));
      const log = div('chat-log', this.logWrap);
      log.hidden = def.id !== this.active;
      this.tabs.push({ def, btn, log, lines: [], unread: false });
    }
    this.renderTabs();
    this.renderChip();

    G.events.on('net:chat', ({ from, text, channel, to }) => {
      if (channel === 'emote') this.emote(text, false, from);
      else this.addLine(from, text, channel, from === this.ownName(), to);
    });
    G.events.on('net:peerJoined', ({ name }) => this.addLine('', `${name} gruba katıldı.`, 'system'));
    G.events.on('net:peerLeft', ({ name }) => this.addLine('', `${name} gruptan ayrıldı.`, 'system'));
    G.events.on('player:levelup', ({ level }) => this.addLine('', `Seviye ${level} oldun! Tebrikler.`, 'system'));
    G.events.on('settings:changed', () => this.applySettings());
    this.applySettings();
  }

  get isFocused(): boolean {
    return this.focused || document.activeElement === this.input;
  }

  /** The text being typed (trimmed), empty when the input is not focused. Read by the typing bubble. */
  get draft(): string {
    return this.focused ? this.input.value.trim() : '';
  }

  focus(): void {
    if (this.isFocused) return;
    G.input?.unlock();
    this.input.focus();
    this.input.value = '';
    this.focused = true;
    setClass(this.el, 'typing', true);
    this.updateHint();
    this.scrollEnd();
  }

  blur(): void {
    this.consumedAt = performance.now();
    this.focused = false;
    setClass(this.el, 'typing', false);
    this.input.blur();
    this.input.value = '';
    this.updateHint();
    // Input only refreshes its text-focus flag on keydown: poke it with a harmless synthetic key
    try {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F24', key: 'F24' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F24', key: 'F24' }));
    } catch { /* ignore */ }
  }

  private ownName(): string {
    return G.character?.save.name ?? 'Ben';
  }

  private send(): void {
    const raw = this.input.value.trim();
    this.consumedAt = performance.now();
    if (!raw) {
      this.blur();
      return;
    }
    if (raw.startsWith('/')) {
      this.command(raw.slice(1));
      this.blur();
      return;
    }
    const ch = SEND[this.sendIdx].id;
    if (ch === 'global' || ch === 'trade') {
      // Social prints its own errors (offline, too fast, duplicate) as system lines
      getSocial().sendChannel(ch, raw);
      this.blur();
      return;
    }
    if (ch === 'yell') {
      const now = performance.now();
      if (now - this.lastYell < YELL_COOLDOWN_MS) {
        this.addLine('', 'Bağırmak için biraz beklemelisin.', 'system', true);
        this.blur();
        return;
      }
      this.lastYell = now;
    }
    try {
      // NetSession echoes our own line through 'net:chat' (offline too), so the line appears in addLine
      G.net.sendChat(raw, ch);
    } catch (e) {
      console.warn('[chat] send failed', e);
    }
    this.blur();
  }

  /** Slash commands: the social ones (`/g` `/ticaret` `/w` `/r` `/kim` `/yardim`, systems/Social.ts), local ones (`/temizle`, `/arayuz`, `/zindan`) and emotes. */
  private command(body: string): void {
    if (getSocial().command(body) || getGuild().command(body)) return;
    const cmd = (body.split(/\s+/)[0] ?? '').toLowerCase();
    if (cmd === 'temizle') {
      this.clear();
    } else if (cmd === 'arayuz') {
      G.ui?.hud?.startEdit();
    } else if (cmd === 'zindan') {
      G.ui?.openPanel('finder');
    } else if (cmd === 'etkinlik') {
      const lines = upcomingEventLines();
      if (!lines.length) this.addLine('', 'Dünya etkinlikleri açık dünyada (Sisli Vadi) çalışır.', 'system', true);
      else for (const l of ['Sıradaki dünya etkinlikleri:', ...lines]) this.addLine('', l, 'system', true);
    } else if (EMOTES[cmd]) {
      this.emote(cmd, true);
    } else {
      this.addLine('', `Bilinmeyen komut: /${cmd}`, 'system', true);
    }
  }

  /** An emote line (`<name> <label>`) and its clip. Local ones are also sent to the party. */
  private emote(id: string, local: boolean, from?: string): void {
    const def = EMOTES[id];
    if (!def) return;
    const name = local ? this.ownName() : from ?? '';
    this.addLine(name, def.label, 'emote', local);
    if (local) {
      playEmoteOn(G.player, id);
      try {
        G.net.sendEmote(id);
      } catch (e) {
        console.warn('[chat] emote send failed', e);
      }
    } else {
      playEmoteOn(remoteActorNamed(name), id);
    }
  }

  clear(): void {
    for (const t of this.tabs) {
      for (const l of t.lines) l.el.remove();
      t.lines = [];
      t.unread = false;
    }
    this.renderTabs();
  }

  /** One line into every tab that lists its channel. `local` = our own message (typing / own bubble). Emits `chat:line`. */
  addLine(from: string, text: string, channel: ChatChannel, local = false, to?: string): void {
    const now = performance.now();
    let placed = false;
    for (const t of this.tabs) {
      if (!t.def.channels.includes(channel)) continue;
      placed = true;
      const el = this.makeLine(from, text, channel, local, to);
      const nearEnd = this.atBottom(t);
      t.log.appendChild(el);
      t.lines.push({ el, t: now });
      while (t.lines.length > LINE_CAP) t.lines.shift()!.el.remove();
      if (t.def.id === this.active) {
        if (local || nearEnd) this.scrollEnd();
        else this.newChip.style.display = '';
      } else t.unread = true;
    }
    if (placed) this.renderTabs();
    G.events?.emit('chat:line', { from, text, channel, local });
  }

  private makeLine(from: string, text: string, channel: ChatChannel, local = false, to?: string): HTMLElement {
    const el = div('cl ' + channel);
    let html = '';
    if (G.settings?.data.chatTimestamps) {
      const d = new Date();
      const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      html += `<span class="cl-ts">[${hm}] </span>`;
    }
    const prefix = CHAN_PREFIX[channel];
    if (prefix) html += `<span class="cl-ch">[${prefix}] </span>`;
    if (channel === 'whisper' && from) {
      // WoW style: "X kişisine fısıldadın: ..." / "X sana fısıldıyor: ..." (all text through esc(), never raw HTML)
      html += local
        ? `<span class="cl-from">${esc(to ?? '')}</span> kişisine fısıldadın: ${esc(text)}`
        : `<span class="cl-from">${esc(from)}</span> sana fısıldıyor: ${esc(text)}`;
    } else if (from) {
      const cls = this.classOf(from);
      const style = cls ? ` style="color:${classColor(cls)}"` : '';
      html += channel === 'emote'
        ? `<span class="cl-from"${style}>${esc(from)}</span> ${esc(text)}`
        : `<span class="cl-from"${style}>${esc(from)}:</span> ${esc(text)}`;
    } else html += esc(text);
    el.innerHTML = html;
    return el;
  }

  /** Class of a named peer (net roster), for the class-coloured name. */
  private classOf(name: string): string | undefined {
    const online = G.presence?.find(name);
    if (online?.cls) return online.cls;
    const peers = G.net?.peers;
    if (!peers) return undefined;
    for (const p of peers.values()) if (p.name === name) return p.summary?.classId;
    return undefined;
  }

  private select(id: TabId): void {
    this.active = id;
    for (const t of this.tabs) {
      t.log.hidden = t.def.id !== id;
      if (t.def.id === id) t.unread = false;
    }
    this.renderTabs();
    this.scrollEnd();
  }

  private renderTabs(): void {
    for (const t of this.tabs) {
      const visible = t.def.always || t.lines.length > 0 || t.def.id === this.active;
      t.btn.style.display = visible ? '' : 'none';
      setClass(t.btn, 'on', t.def.id === this.active);
      setClass(t.btn, 'unread', t.unread && t.def.id !== this.active);
      setClass(t.btn, 'pulse', t.unread && t.def.id === 'fisilti' && t.def.id !== this.active);
    }
  }

  private cycleSend(): void {
    this.sendIdx = (this.sendIdx + 1) % SEND.length;
    this.renderChip();
  }

  private renderChip(): void {
    const s = SEND[this.sendIdx];
    this.chip.textContent = s.label;
    this.chip.className = `chat-chan ${s.id}`;
  }

  private updateHint(): void {
    const v = this.input.value;
    if (!this.focused || !v.startsWith('/')) {
      this.hint.innerHTML = '';
      setClass(this.hint, 'on', false);
      return;
    }
    const q = v.slice(1).toLowerCase();
    const rows = COMMANDS.filter((c) => c.cmd.startsWith(q)).slice(0, 6);
    this.hint.innerHTML = rows.map((c) => `<div class="chat-hint-row"><b>/${esc(c.cmd)}</b> ${esc(c.hint)}</div>`).join('');
    setClass(this.hint, 'on', rows.length > 0);
  }

  private atBottom(t?: TabState): boolean {
    const log = t ? t.log : this.tabs.find((x) => x.def.id === this.active)!.log;
    return log.scrollHeight - log.scrollTop - log.clientHeight < 6;
  }

  private scrollEnd(): void {
    const t = this.tabs.find((x) => x.def.id === this.active);
    if (t) t.log.scrollTop = t.log.scrollHeight;
    this.newChip.style.display = 'none';
  }

  /** Stats line (`Settings.showStats`, §5.1): crit, attack/cast speed, cooldown reduction, dodge. Refreshed at 2 Hz. */
  private renderStats(): void {
    const st = G.character?.stats as Record<string, number> | undefined;
    if (!st) return;
    const pct = (v: number | undefined): string => `${((v ?? 0) * 100).toFixed(1).replace('.', ',')}%`;
    const isCaster = G.character?.save.classId === 'mage' || G.character?.save.classId === 'warlock' || G.character?.save.classId === 'necromancer' || G.character?.save.classId === 'evoker';
    const speed = isCaster ? st.castSpeed : st.attackSpeed;
    const parts = [`Kritik ${pct(st.critChance)}`, `Hız ${pct(speed)}`, `Soğuma ${pct(st.cdr)}`, `Kaçınma ${pct(st.dodgeChance)}`];
    this.statsEl.textContent = parts.join(' · ');
  }

  private applySettings(): void {
    const size = clampN(G.settings?.data.chatFontSize ?? 15, 13, 17);
    setStyle(this.el, '--chat-fs', `${size}px`);
    const on = G.settings?.data.showStats === true;
    this.statsEl.style.display = on ? '' : 'none';
    if (on) this.renderStats();
    this.syncStatsVar(on);
  }

  /** The tip card above the chat moves up by --stats-h while the stats line shows (§5.1). */
  private syncStatsVar(on: boolean): void {
    const root = this.el.closest<HTMLElement>('#ui-root');
    root?.style.setProperty('--stats-h', on ? '20px' : '0px');
  }

  update(ctx: HudCtx): void {
    setClass(this.el, 'open', this.focused);
    this.fadeAcc += ctx.dt;
    if (this.fadeAcc >= 0.25) {
      this.fadeAcc = 0;
      const showAll = this.focused || this.el.matches(':hover');
      for (const t of this.tabs) {
        const keep = NO_FADE.has(t.def.id);
        for (const l of t.lines) {
          const old = !showAll && !keep && ctx.now - l.t > FADE_AFTER_MS;
          if (old !== l.el.classList.contains('old')) l.el.classList.toggle('old', old);
        }
      }
    }
    if (this.statsEl.style.display !== 'none') {
      this.statsAcc += ctx.dt;
      if (this.statsAcc >= 0.5) {
        this.statsAcc = 0;
        this.renderStats();
        this.syncStatsVar(true); // the chat may have been attached after the settings were applied
      }
    }
  }
}
