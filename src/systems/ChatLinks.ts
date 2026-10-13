import { G } from '../game/G';
import type { ItemInstance } from '../types/items';
import type { ChatLink, ItemSnapshot } from '../types/net';
import { ITEM_BASES } from '../data/itemBases';
import { isObj, sanitizeText } from '../net/messages';
import { cleanSnapshot, fromSnapshot, toSnapshot } from './MarketWire';

/**
 * WP-13 item links in chat. Shift+click on a bag / equipment slot emits `chat:linkItem`; the chat input gets a `[Name]` tag and the
 * item snapshot waits as a pending link. On send the links travel with the message (`links`, at most LINK_MAX). Receivers run every
 * link through sanitizeLinks (cleanSnapshot: known base, clamped numbers, whitelisted affix ids) and only ever DISPLAY it: a linked
 * item is never added to a bag, and remote stats are not used for anything but the tooltip. Pure helpers plus one emit; no DOM.
 * OWNER: items module (chat rendering lives in ui/hud/Chat.ts).
 */

export const LINK_MAX = 2;
const LINK_NAME_MAX = 48;

/** Display name of a validated snapshot: the tag text, identical on both sides of the wire. */
export function snapshotName(s: ItemSnapshot): string {
  const raw = s.name || ITEM_BASES[s.baseId]?.name || s.baseId;
  return sanitizeText(raw.replace(/[[\]]/g, ''), LINK_NAME_MAX) || s.baseId;
}

export function linkTag(name: string): string {
  return `[${name}]`;
}

/** The tag and the link of one item (the snapshot is validated first, so the sender tags exactly what the receiver will show). */
export function itemLink(item: ItemInstance): { link: ChatLink; tag: string } | null {
  const snap = cleanSnapshot(toSnapshot(item));
  if (!snap) return null;
  return { link: { k: 'item', item: snap }, tag: linkTag(snapshotName(snap)) };
}

/** Validates the `links` of an incoming (or outgoing) chat message. Unknown kinds and bad snapshots are dropped. */
export function sanitizeLinks(x: unknown): ChatLink[] {
  if (!Array.isArray(x)) return [];
  const out: ChatLink[] = [];
  for (const e of x.slice(0, LINK_MAX)) {
    if (!isObj(e) || e.k !== 'item') continue;
    const snap = cleanSnapshot(e.item);
    if (snap) out.push({ k: 'item', item: snap });
  }
  return out;
}

/** A display-only item rebuilt from a link (tooltips). Its uid is not a real inventory uid and it is never stored. */
export function linkedDisplayItem(s: ItemSnapshot): ItemInstance {
  return fromSnapshot(s, `link:${s.baseId}`);
}

/** Shift+click: ask the chat to insert the item. */
export function linkItemInChat(item: ItemInstance): void {
  G.events.emit('chat:linkItem', { item });
}
