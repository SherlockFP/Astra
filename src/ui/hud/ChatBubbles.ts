import { G } from '../../game/G';
import type { Actor } from '../../entities/Actor';
import type { UI } from '../UI';
import type { BubbleHandle, BubbleKind } from '../widgets/Bubbles';
import { INTEREST } from '../../net/Channels';

/**
 * The remote avatar of a speaker: by peer id (the relay origin, exact even with two players of one name), else by name.
 * Remote players are entities of the world with `peerId` (Player).
 */
function remoteActorOf(peerId: string | undefined, name: string): Actor | null {
  const world = G.world;
  if (!world) return null;
  if (peerId) {
    for (const e of world.entities.values()) {
      const a = e as Actor & { peerId?: string };
      if (a.peerId === peerId && a.anim !== undefined && a !== G.player) return a;
    }
  }
  if (!name) return null;
  for (const e of world.entities.values()) {
    const a = e as Actor;
    if (a.name === name && a.anim !== undefined && a !== G.player) return a;
  }
  return null;
}

/** Name colour of each bubble kind (channel tokens of hud-chat.css). */
const NAME_COLOR: Partial<Record<BubbleKind, string>> = {
  say: 'var(--ch-say)',
  yell: 'var(--ch-yell)',
  party: 'var(--ch-party)',
  emote: 'var(--ch-emote)',
};

/** UI anchor height of an actor: the visual model height for players (Player.visualHeight), else the combat height. */
const anchorH = (a: Actor): number => (a as { visualHeight?: number }).visualHeight ?? a.height;

/**
 * UX-30 (§5.2) + chat bubbles: the chat-to-bubble bridge. Every line the chat shows (`chat:line`) with channel say / yell /
 * party / emote gets a bubble over the speaker: ours over the local player, a remote one over that player's avatar (by peer
 * id). Say and emote are heard within INTEREST.SAY_M (25 m), yell within INTEREST.YELL_M (100 m) of the local player; the
 * Bubbles layer hides a bubble beyond its range. Whispers and system lines never reach the bubble layer. Also owns the typing bubble.
 */
export class ChatBubbles {
  private typing: BubbleHandle | null = null;

  constructor(private readonly ui: UI) {
    G.events.on('chat:line', (line) => this.onLine(line));
  }

  private onLine({ from, text, channel, local, peerId }: { from: string; text: string; channel: string; local: boolean; peerId?: string }): void {
    const kind: BubbleKind | null =
      channel === 'say' ? 'say' : channel === 'yell' ? 'yell' : channel === 'party' ? 'party' : channel === 'emote' ? 'emote' : null;
    if (!kind) return;
    const st = G.settings?.data;
    if (st && !st.chatBubbles) return;
    if (!local && st?.chatIgnore.includes(from)) return;
    // filterChat() (GDD_LIFE L-33) is not in this build: lines are shown as they arrive.

    let anchor: Actor | null;
    if (local) anchor = G.player ?? null;
    else anchor = remoteActorOf(peerId, from);
    if (!anchor) return;
    this.ui.say(anchor.object3d, {
      kind,
      text,
      name: from || undefined,
      color: NAME_COLOR[kind],
      offsetY: anchorH(anchor) + (local ? 0.5 : 1.1),
      own: local,
      range: kind === 'yell' ? INTEREST.YELL_M : kind === 'party' ? undefined : INTEREST.SAY_M,
    });
  }

  /** Per frame: the typing bubble lives while the chat input has at least one character. */
  update(): void {
    const p = G.player;
    const st = G.settings?.data;
    const draft = G.ui?.hud?.chat?.draft ?? '';
    const want = !!p && st?.chatBubbles !== false && draft.length > 0;
    if (want && !this.typing && p) {
      this.typing = this.ui.say(p.object3d, { kind: 'typing', text: '', seconds: Infinity, offsetY: anchorH(p) + 0.5 });
    } else if (!want && this.typing) {
      this.typing.remove();
      this.typing = null;
    }
  }

  clear(): void {
    this.typing?.remove();
    this.typing = null;
  }
}
