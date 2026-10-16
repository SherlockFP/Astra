/**
 * PLAYER MENU - the WoW unit popup for another player (right-click on their nameplate; left-click selects them as the friendly
 * target). OWNER: hud module. Logic: systems/PlayerSocial.ts (friends list, duel / trade state machines).
 *
 * Items: Fısılda (prefills `/w name `), Gruba Davet Et, Takas, Düello İste, Arkadaş Ekle / Çıkar, İncele, Takip Et, Loncaya Davet
 * (only when we are in a guild), Engelle / Engeli Kaldır, Rapor Et (stub). Items that are not wired end-to-end show a "Yakında"
 * toast instead of a broken flow.
 *
 * Styling follows the ElvUI-like HUD: translucent dark panel, rounded corners, class-coloured header.
 */
import { G } from '../../game/G';
import { CLASSES } from '../../data/classes';
import type { ClassId } from '../../types/common';
import { addFriend, isFriend, loadFriends, removeFriend, saveFriends } from '../../systems/PlayerSocial';
import type { PlayerSocialNet } from '../../systems/PlayerSocialNet';
import { classColor } from '../widgets/classColors';
import { uiSound } from '../widgets/dom';
import { getPlayerSocial } from './SocialUi';

export interface PlayerMenuTarget {
  /** Character name as shown on the plate (the name typed after /w). */
  name: string;
  cls?: ClassId | string;
  level?: number;
  /** Screen position (px) where the menu opens; clamped to the viewport. */
  x: number;
  y: number;
}

type ItemKind = 'do' | 'soon';
interface Item {
  label: string;
  kind: ItemKind;
  /** Hidden when false (e.g. the guild item outside a guild). */
  show?: boolean;
  /** Greyed out (shown, not clickable) when true. */
  off?: boolean;
  run?: () => void;
}

let root: HTMLElement | null = null;
let cleanup: (() => void) | null = null;

const SOON_TEXT = 'yakında';

/** Opens the menu for `t`. Replaces an open one. */
export function openPlayerMenu(t: PlayerMenuTarget): void {
  closePlayerMenu();
  const name = cleanName(t.name);
  if (!name) return;
  const me = selfName();
  if (me && me.toLowerCase() === name.toLowerCase()) return;

  const el = document.createElement('div');
  el.className = 'player-menu';
  el.setAttribute('role', 'menu');
  el.style.cssText = [
    'position:fixed', 'z-index:9000', 'min-width:176px', 'padding:4px 0 6px',
    'background:rgba(14,16,22,0.94)', 'border:1px solid rgba(255,255,255,0.14)', 'border-radius:6px',
    'box-shadow:0 6px 18px rgba(0,0,0,0.55)', 'font:600 12px/16px var(--font-body, sans-serif)', 'color:#e8e6df',
    'user-select:none',
  ].join(';');

  // class and level: from the caller, else from the presence registry (chat names carry neither)
  const pe = G.presence?.find(name, false) ?? null;
  const clsIn = t.cls ?? pe?.cls ?? '';
  const cls = (clsIn && clsIn in CLASSES ? clsIn : '') as ClassId | '';
  const head = document.createElement('div');
  head.style.cssText = `padding:6px 10px 5px;border-bottom:1px solid rgba(255,255,255,0.10);margin-bottom:4px;`;
  const nameEl = document.createElement('div');
  nameEl.textContent = name;
  nameEl.style.cssText = `font:700 13px/17px var(--font-head, sans-serif);color:${cls ? classColor(cls) : '#e8e6df'};text-shadow:0 1px 0 #000;`;
  const subEl = document.createElement('div');
  subEl.style.cssText = 'font:500 11px/14px var(--font-body, sans-serif);color:#a9a69c;';
  const lvl = Math.max(1, Math.floor(Number(t.level ?? pe?.lvl) || 0));
  subEl.textContent = [lvl ? `Seviye ${lvl}` : '', cls ? CLASSES[cls].name : ''].filter(Boolean).join(' · ');
  head.append(nameEl, subEl);
  // friends: online status from the presence registry (the list itself is stored locally, the status is not)
  if (isFriend(loadFriends(), name)) {
    const st = document.createElement('div');
    const online = !!G.presence?.find(name, false);
    st.textContent = online ? 'Arkadaş · çevrimiçi' : 'Arkadaş · çevrimdışı';
    st.style.cssText = `font:500 11px/14px var(--font-body, sans-serif);color:${online ? '#7ee862' : '#8a877e'};`;
    head.appendChild(st);
  }
  el.appendChild(head);

  const close = () => closePlayerMenu();
  for (const it of buildItems(name)) {
    if (it.show === false) continue;
    const row = document.createElement('div');
    row.setAttribute('role', 'menuitem');
    row.textContent = it.label;
    const disabled = it.off === true;
    row.style.cssText = [
      'padding:4px 12px', 'cursor:' + (disabled ? 'default' : 'pointer'), 'border-radius:3px', 'margin:0 4px',
      'white-space:nowrap', disabled ? 'color:#6c6a64' : 'color:#e8e6df',
    ].join(';');
    if (!disabled) {
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.10)'; });
      row.addEventListener('mouseleave', () => { row.style.background = ''; });
      row.addEventListener('mousedown', (e) => e.stopPropagation());
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        uiSound('ui_click', 0.6);
        close();
        if (it.kind === 'soon') toast(`${it.label}: ${SOON_TEXT}.`);
        else it.run?.();
      });
    }
    el.appendChild(row);
  }

  document.body.appendChild(el);
  root = el;
  // clamp into the viewport after layout
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = `${Math.max(4, Math.min(t.x, window.innerWidth - w - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(t.y, window.innerHeight - h - 4))}px`;

  const onDown = (e: Event) => {
    if (root && e.target instanceof Node && root.contains(e.target)) return;
    closePlayerMenu();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePlayerMenu();
  };
  window.addEventListener('mousedown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  cleanup = () => {
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('keydown', onKey, true);
  };
}

/** Closes the open menu, if any. */
export function closePlayerMenu(): void {
  cleanup?.();
  cleanup = null;
  root?.remove();
  root = null;
}

export function playerMenuOpen(): boolean {
  return root !== null;
}

/* ------------------------------------------------------------------------------------------------ items */

function buildItems(name: string): Item[] {
  const friends = loadFriends();
  const friend = isFriend(friends, name);
  const ignored = ignoreList();
  const isIgnored = ignored.some((n) => n.toLowerCase() === name.toLowerCase());
  const inGuild = !!G.guild?.presenceInfo();

  return [
    {
      label: 'Fısılda',
      kind: 'do',
      run: () => G.events.emit('chat:prefill', { text: `/w ${name} ` }),
    },
    { label: 'Gruba Davet Et', kind: 'do', run: () => service((s) => s.requestParty(name).then(tell)) },
    { label: 'Takas', kind: 'do', run: () => service((s) => tell(s.requestTrade(name))) },
    { label: 'Düello İste', kind: 'do', run: () => service((s) => tell(s.requestDuel(name))) },
    {
      label: friend ? 'Arkadaşlıktan Çıkar' : 'Arkadaş Ekle',
      kind: 'do',
      run: () => toggleFriend(name, friend, friends),
    },
    { label: 'İncele', kind: 'do', run: () => service((s) => tell(s.requestGear(name))) },
    {
      label: following(name) ? 'Takibi Bırak' : 'Takip Et',
      kind: 'do',
      run: () => service((s) => {
        if (s.followTarget === name) s.stopFollow('Takip bırakıldı.');
        else tell(s.follow(name));
      }),
    },
    {
      label: 'Loncaya Davet',
      kind: 'do',
      show: inGuild,
      run: () => void guildInvite(name),
    },
    {
      label: isIgnored ? 'Engeli Kaldır' : 'Engelle',
      kind: 'do',
      run: () => toggleIgnore(name, isIgnored, ignored),
    },
    {
      label: 'Rapor Et',
      kind: 'do',
      run: () => toast('Rapor alındı. Teşekkürler.'),
    },
  ];
}

/** Runs `fn` on the social service; a missing service (not installed yet) is a toast, not a crash. */
function service(fn: (s: PlayerSocialNet) => unknown): void {
  const s = getPlayerSocial();
  if (!s) {
    toast('Sosyal sistem hazır değil.');
    return;
  }
  void fn(s);
}

/** A request error text is a toast; null means the request went out (its own toast or popup follows). */
function tell(err: string | null): void {
  if (err) toast(err);
}

function following(name: string): boolean {
  return getPlayerSocial()?.followTarget === name;
}

function toggleFriend(name: string, isFriendNow: boolean, friends: string[]): void {
  if (isFriendNow) {
    saveFriends(removeFriend(friends, name));
    toast(`${name} arkadaşlıktan çıkarıldı.`);
    return;
  }
  const r = addFriend(friends, name, selfName() ?? '');
  if (!r.ok) {
    toast(r.reason);
    return;
  }
  saveFriends(r.list);
  const online = !!G.presence?.find(name, false);
  toast(`${name} arkadaş listene eklendi${online ? ' (çevrimiçi)' : ''}.`);
}

async function guildInvite(name: string): Promise<void> {
  if (!G.guild) return;
  const r = await G.guild.invite(name);
  toast(r.ok ? `${name} loncaya davet edildi.` : r.reason);
}

function toggleIgnore(name: string, isIgnoredNow: boolean, list: string[]): void {
  const next = isIgnoredNow
    ? list.filter((n) => n.toLowerCase() !== name.toLowerCase())
    : [...list.filter((n) => n.toLowerCase() !== name.toLowerCase()), name];
  G.settings?.set('chatIgnore', next);
  toast(isIgnoredNow ? `${name} engeli kaldırıldı.` : `${name} engellendi. Mesajları görünmeyecek.`);
}

function ignoreList(): string[] {
  const list = G.settings?.data.chatIgnore;
  return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
}

function selfName(): string | null {
  const n = G.character?.save.name;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

function cleanName(input: unknown): string {
  return typeof input === 'string' ? input.replace(/~/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) : '';
}

function toast(text: string): void {
  G.events.emit('ui:toast', { text, kind: 'info' });
}
