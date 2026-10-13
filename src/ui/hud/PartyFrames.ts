import { G } from '../../game/G';
import { PARTY_ID_BASE } from '../../types/common';
import type { Player } from '../../entities/Player';
import type { EntityId } from '../../types/common';
import type { UI } from '../UI';
import { ICON, div, esc, fmtCompact, iconEl, setClass, setDisplay, setIconUrl, setText } from '../widgets/dom';
import { StatusRow } from '../widgets/StatusRow';
import { Bar, classColor, classNameTr } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';

class PartyFrame {
  readonly el: HTMLElement;
  private ico: HTMLElement;
  private lvl: HTMLElement;
  private nameEl: HTMLElement;
  private crown: HTMLElement;
  private stateEl: HTMLElement;
  private hp: Bar;
  private res: Bar;
  private debuffs: StatusRow;
  private classId = '';
  seen = 0;

  constructor(readonly id: EntityId, ui: UI) {
    this.el = div('pt hud-interactive');
    const port = div('pt-portrait', this.el);
    this.ico = iconEl(null, 'pt-pico', port);
    this.lvl = div('pt-lvl', port);
    const body = div('pt-body', this.el);
    const top = div('pt-top', body);
    this.crown = iconEl(ICON('ui-crown'), 'pt-crown', top);
    this.nameEl = div('pt-name', top);
    this.stateEl = div('pt-state', top);
    this.hp = new Bar('hp pt-hp', body);
    this.res = new Bar('res pt-res', body);
    this.debuffs = new StatusRow(ui, 'debuff', 5, 'pt-debuffs');
    body.appendChild(this.debuffs.el);
    div('pt-deadmark', this.el);
    this.el.addEventListener('mouseenter', (e) => {
      const p = G.world?.get(this.id) as Player | undefined;
      const peer = p ? G.net?.peerBySlot(p.slot) : undefined;
      if (!p) return;
      ui.showTooltipFor(this.el, `<div class="st"><div class="st-name" style="color:${classColor(p.classId)}">${esc(p.name)}</div><div class="st-kind">Seviye ${p.level} ${classNameTr(p.classId)}</div>${peer ? `<div class="st-time">Gecikme ${Math.round(peer.ping)} ms${peer.isHost ? ' · Grup lideri' : ''}</div>` : ''}</div>`, e.clientX, e.clientY);
    });
    this.el.addEventListener('mouseleave', () => ui.hideTooltipIf(this.el));
  }

  update(p: Player, dt: number): void {
    if (this.classId !== p.classId) {
      this.classId = p.classId;
      setIconUrl(this.ico, ICON('class-' + p.classId));
      this.el.style.setProperty('--cc', classColor(p.classId));
    }
    setText(this.nameEl, p.name);
    setText(this.lvl, String(p.level));
    const dead = p.isDead;
    setClass(this.el, 'dead', dead);
    setText(this.stateEl, dead ? 'Öldü' : '');
    const peer = G.net?.peerBySlot(p.slot);
    setDisplay(this.crown, !!peer?.isHost && G.net.isOnline);
    this.hp.set(p.maxHp > 0 ? p.hp / p.maxHp : 0, dt, dead ? '' : `${fmtCompact(Math.max(0, p.hp))}`);
    this.res.el.dataset.kind = p.resourceType;
    this.res.set(p.maxResource > 0 ? p.resource / p.maxResource : 0, dt);
    this.debuffs.update(p);
  }

  dispose(): void {
    this.debuffs.clear();
    this.el.remove();
  }
}

/** Left-side party frames for the other players (remote Player entities) + placeholders for peers still loading. */
export class PartyFrames implements HudWidget {
  readonly el: HTMLElement;
  private frames = new Map<EntityId, PartyFrame>();
  private placeholders = new Map<string, HTMLElement>();
  private tick = 0;

  constructor(private ui: UI) {
    this.el = div('party');
  }

  update(ctx: HudCtx): void {
    this.tick++;
    const w = ctx.world;
    if (w) {
      for (const p of w.players) {
        if (p.isLocal) continue;
        let f = this.frames.get(p.id);
        if (!f) {
          f = new PartyFrame(p.id, this.ui);
          this.frames.set(p.id, f);
          this.el.appendChild(f.el);
        }
        f.seen = this.tick;
        f.update(p, ctx.dt);
      }
    }
    for (const [id, f] of this.frames) {
      if (f.seen !== this.tick) {
        f.dispose();
        this.frames.delete(id);
      }
    }
    // peers that joined but whose avatar is not in this world yet
    const seenPeers = new Set<string>();
    const net = G.net;
    if (net && net.isOnline) {
      for (const peer of net.peers.values()) {
        if (peer.peerId === net.selfId) continue;
        const eid = PARTY_ID_BASE + peer.slot;
        if (this.frames.has(eid)) continue;
        seenPeers.add(peer.peerId);
        let el = this.placeholders.get(peer.peerId);
        if (!el) {
          el = div('pt loading');
          this.placeholders.set(peer.peerId, el);
          this.el.appendChild(el);
        }
        const html = `<div class="pt-portrait">${peer.summary ? `<span class="ico pt-pico" style="--i:url('${ICON('class-' + peer.summary.classId)}')"></span>` : ''}</div><div class="pt-body"><div class="pt-top"><div class="pt-name">${esc(peer.name)}</div><div class="pt-state">Yükleniyor...</div></div></div>`;
        if ((el as HTMLElement & { _h?: string })._h !== html) {
          (el as HTMLElement & { _h?: string })._h = html;
          el.innerHTML = html;
        }
      }
    }
    for (const [id, el] of this.placeholders) {
      if (!seenPeers.has(id)) {
        el.remove();
        this.placeholders.delete(id);
      }
    }
  }

  reset(): void {
    for (const f of this.frames.values()) f.dispose();
    this.frames.clear();
    for (const el of this.placeholders.values()) el.remove();
    this.placeholders.clear();
  }
}
