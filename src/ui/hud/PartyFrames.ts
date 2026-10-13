import { G } from '../../game/G';
import { PARTY_ID_BASE } from '../../types/common';
import type { Player } from '../../entities/Player';
import type { EntityId } from '../../types/common';
import type { UI } from '../UI';
import { getSpec } from '../../data/specs';
import type { RoleId } from '../../types/v2';
import { ICON, div, esc, iconEl, setClass, setDisplay, setIconUrl, setStyle, setText } from '../widgets/dom';
import { fmtHealth } from '../widgets/numFormat';
import { StatusRow } from '../widgets/StatusRow';
import { Bar, classColor, classNameTr } from './PlayerFrame';
import type { HudCtx, HudWidget } from './types';

/** Role icons of the party frame (§2.7): tank shield, healer cross, dps sword (existing icons stand in for the role glyphs). */
const ROLE_ICON: Record<RoleId, string> = { tank: 'item-shield-round', healer: 'skill-heal', dps: 'item-sword' };

/** One party member: a 34 px flat frame (class-colour health bar, 5 px power strip, role icon, leader crown, targeted outline) with its debuffs to the right. */
class PartyFrame {
  readonly el: HTMLElement;
  private frame: HTMLElement;
  private hp: Bar;
  private res: Bar;
  private roleIco: HTMLElement;
  private crown: HTMLElement;
  private nameT: HTMLElement;
  private valT: HTMLElement;
  private debuffs: StatusRow;
  private classId = '';
  private role: RoleId | null | undefined = undefined;
  seen = 0;

  constructor(readonly id: EntityId, ui: UI) {
    this.el = div('pt hud-interactive');
    this.frame = div('pt-frame', this.el);
    this.hp = new Bar('uf-hp pt-hp', this.frame);
    this.hp.el.dataset.kind = 'class';
    const nameWrap = div('pt-name', this.hp.label);
    this.roleIco = iconEl(null, 'pt-role', nameWrap);
    setDisplay(this.roleIco, false);
    this.crown = iconEl(ICON('ui-crown'), 'pt-crown', nameWrap);
    setDisplay(this.crown, false);
    this.nameT = div('pt-name-t', nameWrap);
    this.valT = div('pt-val', this.hp.label);
    this.res =new Bar('uf-strip pt-res', this.frame);
    this.debuffs = new StatusRow(ui, 'debuff', 4, 'pt-debuffs');
    this.el.appendChild(this.debuffs.el);
    div('pt-deadmark', this.el);
    this.el.addEventListener('mouseenter', (e) => {
      const p = G.world?.get(this.id) as Player | undefined;
      const peer = p ? G.net?.peerBySlot(p.slot) : undefined;
      if (!p) return;
      ui.showTooltipFor(this.el, `<div class="st"><div class="st-name" style="color:${classColor(p.classId)}">${esc(p.name)}</div><div class="st-kind">Seviye ${p.level} ${classNameTr(p.classId)}</div>${peer ? `<div class="st-time">Gecikme ${Math.round(peer.ping)} ms${peer.isHost ? ' · Grup lideri' : ''}</div>` : ''}</div>`, e.clientX, e.clientY);
    });
    this.el.addEventListener('mouseleave', () => ui.hideTooltipIf(this.el));
  }

  update(p: Player, dt: number, targeted: boolean): void {
    if (this.classId !== p.classId) {
      this.classId = p.classId;
      setStyle(this.hp.el, '--cls', classColor(p.classId));
    }
    const role = getSpec(p.spec)?.role ?? null;
    if (this.role !== role) {
      this.role = role;
      setIconUrl(this.roleIco, role ? ICON(ROLE_ICON[role]) : null);
      setDisplay(this.roleIco, !!role);
    }
    setText(this.nameT, p.name);
    const dead = p.isDead;
    setClass(this.el, 'dead', dead);
    setClass(this.frame, 'targeted', targeted);
    setClass(this.hp.el, 'is-dead', dead);
    const peer = G.net?.peerBySlot(p.slot);
    setDisplay(this.crown, !!peer?.isHost && G.net.isOnline);
    const pct = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
    setClass(this.hp.el, 'is-low', !dead && pct < 0.3);
    setText(this.valT, dead ? 'Öldü' : fmtHealth(Math.max(0, p.hp)));
    this.hp.set(pct, dt);
    this.res.el.dataset.kind = p.resourceType;
    this.res.set(p.maxResource > 0 ? p.resource / p.maxResource : 0, dt);
    this.debuffs.update(p);
  }

  dispose(): void {
    this.debuffs.clear();
    this.el.remove();
  }
}

/** Party frames for the other players (remote Player entities) + placeholders for peers still loading. */
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
      const target = ctx.player?.targetId ?? null;
      for (const p of w.players) {
        if (p.isLocal) continue;
        let f = this.frames.get(p.id);
        if (!f) {
          f = new PartyFrame(p.id, this.ui);
          this.frames.set(p.id, f);
          this.el.appendChild(f.el);
        }
        f.seen = this.tick;
        f.update(p, ctx.dt, target === p.id);
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
        const html = `<div class="pt-frame"><div class="pt-name"><span class="pt-name-t">${esc(peer.name)}</span></div><div class="pt-state">Yükleniyor...</div></div>`;
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
