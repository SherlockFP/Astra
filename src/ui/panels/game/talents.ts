/**
 * GDD_TALENTS §5 the `N` window: TalentsPanel is the shell. Header (class, level, spec chip, point badges), the three-tab
 * bar (Uzmanlık & Yetenekler · Pasif Ağaç · Beceri Uzmanlıkları), the staging bar (Taslak, Bedel, Geri Al, Değişiklikleri
 * Uygula), the talent event wiring, the unsaved-changes prompt and openPanel('talents', { tab, focus }).
 * Tab 1 is TreeTab (talents/TreeView.ts: the WoW trees and the spec picker), tab 2 is WebView (talents/WebView.ts: the PoE
 * canvas), tab 3 is SkillSpecView (talents/SkillSpecView.ts). Dialogs (talents/Dialogs.ts) owns the spec confirm, the Apply
 * confirm and the unsaved prompt. The drafts are shared by the tabs: Apply commits the WoW trees, then the passive web draft;
 * Geri Al and "At" drop both. Owner: panels-game.
 */
import { G } from '../../../game/G';
import { ROLE_TR } from '../../../combat/specs';
import { getSpec } from '../../../data/specs';
import { CLASS_META, GamePanel, button, fmtInt, h, icon, sfx, toast, windowFrame } from './base';
import { TalentDialogs } from './talents/Dialogs';
import { SkillSpecView } from './talents/SkillSpecView';
import { TreeTab } from './talents/TreeView';
import { WebView } from './talents/WebView';
import { ROLE_COLORS, type TalentTab, type TalentTabId } from './talents/shared';

/** Tab order of the bar (GDD_TALENTS §5.1). */
const TAB_ORDER: readonly TalentTabId[] = ['tree', 'web', 'skills'];
const TAB_LABELS: Record<TalentTabId, string> = { tree: 'Uzmanlık & Yetenekler', web: 'Pasif Ağaç', skills: 'Beceri Uzmanlıkları' };
/** Character level a tab opens at (§5.1). The web tab has always been open, so it stays open. */
const TAB_MIN_LEVEL: Record<TalentTabId, number> = { tree: 10, web: 1, skills: 10 };
/** Length of the level-up pulse while the window is open (GDD_TALENTS T10: 15 seconds). */
export const LEVELUP_PULSE_MS = 15000;

function isTabId(v: unknown): v is TalentTabId {
  return v === 'tree' || v === 'web' || v === 'skills';
}

/** Runs a read that may fail while a service is missing (the window never throws from its reads). */
function read<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export class TalentsPanel extends GamePanel {
  private head!: HTMLElement;
  private classSlot!: HTMLElement;
  private nameEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private specEl!: HTMLElement;
  private badgeClass!: HTMLElement;
  private badgeSpec!: HTMLElement;
  private badgeWeb!: HTMLElement;
  private tabBar!: HTMLElement;
  private tabBtns = new Map<TalentTabId, HTMLButtonElement>();
  private tabHints = new Map<TalentTabId, HTMLElement>();
  private views = new Map<TalentTabId, TalentTab>();
  /** The passive web (tab 2): its draft is staged here and applied by the shared Apply. */
  private web!: WebView;
  /** Dialogs of the window: the spec confirm, the Apply confirm, the unsaved prompt. */
  private dialogs!: TalentDialogs;
  private content!: HTMLElement;
  private lockedEl!: HTMLElement;
  private stage!: HTMLElement;
  private countEl!: HTMLElement;
  private costEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private diffPop!: HTMLElement;
  private applyBtn!: HTMLButtonElement;
  private discardBtn!: HTMLButtonElement;
  /** The view that is visible and has received onShow (null while the tab is locked). */
  private shown: TalentTab | null = null;
  /** Remembered between openings: a plain openPanel('talents') returns to the last tab. */
  private lastTab: TalentTabId = 'web';
  private pulseTimer = 0;
  /** The unsaved-changes prompt of a close is up (one prompt at a time). */
  private closeAsking = false;

  constructor() {
    super('talents', { backdropClose: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: 'Uzmanlık ve Yetenekler',
      icon: '/assets/icons/ui-talent-tree.svg',
      cls: 'pg-talents pt-shell',
      size: 'L',
      hints: ['Enter: al', 'Backspace: geri al', 'A / B: seçenek'],
      onClose: () => this.requestClose(),
    });
    body.classList.add('pt-body');

    // header: class icon, name, level, spec chip, point badges
    this.classSlot = h('span.pt-class-slot');
    this.nameEl = h('b.pt-class-name', null, '');
    this.levelEl = h('span.pt-level', null, '');
    this.specEl = h('span.pt-spec', null, '');
    this.badgeClass = h('b', null, '—');
    this.badgeSpec = h('b', null, '—');
    this.badgeWeb = h('b', null, '—');
    const badge = (label: string, value: HTMLElement, kind: string) => h('div.pt-badge', { dataset: { kind } }, h('span', null, label), value);
    this.head = h(
      'div.pt-head',
      null,
      h('div.pt-id', null, this.classSlot, h('div.pt-id-text', null, this.nameEl, this.levelEl)),
      this.specEl,
      h('div.pt-badges', null, badge('Sınıf', this.badgeClass, 'class'), badge('Uzmanlık', this.badgeSpec, 'spec'), badge('Pasif', this.badgeWeb, 'web')),
    );

    // tab bar
    this.tabBar = h('div.pt-tabs');
    for (const id of TAB_ORDER) {
      const hint = h('small.pt-tab-hint');
      const btn = h('button.pt-tab', { type: 'button' }, h('span.pt-tab-name', null, TAB_LABELS[id]), hint) as HTMLButtonElement;
      btn.addEventListener('click', () => {
        sfx('ui_tab');
        this.show(id);
      });
      this.tabBtns.set(id, btn);
      this.tabHints.set(id, hint);
      this.tabBar.append(btn);
    }

    // tab views: the WoW trees and the skill specialisations share the dialogs; tab 2 is the moved PoE canvas
    this.dialogs = new TalentDialogs(() => this.el);
    this.web = new WebView(() => this.el);
    this.views.set('tree', new TreeTab(() => this.el, this.dialogs.hooks));
    this.views.set('web', this.web);
    this.views.set('skills', new SkillSpecView());
    for (const v of this.views.values()) v.el.style.display = 'none';
    this.lockedEl = h('div.pt-locked');
    this.lockedEl.style.display = 'none';
    this.content = h('div.pt-content', null, this.lockedEl, ...[...this.views.values()].map((v) => v.el));

    // staging bar (footer, all tabs)
    this.countEl = h('span.pt-stage-count');
    this.costEl = h('span.pt-stage-cost');
    this.bannerEl = h('span.pt-stage-banner');
    this.diffPop = h('div.pt-diff');
    const diffBtn = button('Taslağı Göster', () => {
      this.diffPop.classList.toggle('is-open');
      this.refreshStage();
    }, { variant: 'ghost' });
    this.discardBtn = button('Geri Al', () => this.discard(), { variant: 'normal' });
    this.applyBtn = button('Değişiklikleri Uygula', () => void this.apply(), { variant: 'primary', cls: 'pt-apply' });
    this.stage = h(
      'div.pt-stage',
      null,
      this.diffPop,
      h('div.pt-stage-row', null, this.countEl, this.costEl, this.bannerEl, h('span.pt-stage-sp'), diffBtn, this.discardBtn, this.applyBtn),
    );

    body.append(this.head, this.tabBar, this.content);
    foot.append(this.stage);
    this.el.append(win);
  }

  /* ---------------------------------------------------------------- lifecycle */

  protected onOpen(data?: unknown): void {
    const d = (data ?? null) as { tab?: unknown; focus?: unknown } | null;
    const focus = d && typeof d.focus === 'string' ? d.focus : undefined;
    // a character of level 10+ with no spec yet opens on tab 1, where the spec picker is (GDD_TALENTS §5.6 step 1)
    const needsSpec = read(() => !!G.character && G.character.level >= TAB_MIN_LEVEL.tree && !G.talents?.specId, false);
    const tab = d && isTabId(d.tab) ? d.tab : needsSpec ? 'tree' : this.lastTab;
    this.listen('talents:changed', () => this.refresh());
    this.listen('talents:committed', () => this.refresh());
    this.listen('spec:changed', () => this.refresh());
    this.listen('loadout:changed', () => this.refresh());
    this.listen('skillmastery:changed', () => this.refresh());
    this.listen('passives:changed', () => this.refresh());
    this.listen('player:stats', () => this.refresh());
    this.listen('player:levelup', (p) => {
      this.refresh();
      this.pulseLevelUp(p.level);
    });
    // opening the window clears the HUD pulse (GDD_TALENTS Appendix B `tb.pulse`)
    const flags = read(() => G.character?.save.flags, undefined);
    if (flags && flags['tb.pulse']) flags['tb.pulse'] = 0;
    this.refreshHead();
    this.show(tab, focus);
  }

  protected onClose(): void {
    this.dialogs.dismissAll();
    this.shown?.onHide();
    this.shown = null;
    window.clearTimeout(this.pulseTimer);
    this.el.classList.remove('is-pulse');
  }

  /**
   * Closing with staged changes (X, Esc, N) asks first in town or a dungeon, where the drafts can still be applied.
   * Elsewhere the drafts are dropped, as before.
   */
  close(): void {
    if (!this.isOpen) return;
    if (this.dirty()) {
      const mode = G.ui?.mode;
      if (mode === 'town' || mode === 'dungeon') {
        this.askUnsaved();
        return;
      }
      this.discardAll();
    }
    super.close();
  }

  /** Level-up pulse hook (GDD_TALENTS T10): while open, the header badges pulse for 15 s; tabs that open at this level flash too. */
  pulseLevelUp(level: number, ms = LEVELUP_PULSE_MS): void {
    this.el.classList.add('is-pulse');
    for (const id of TAB_ORDER) this.tabBtns.get(id)?.classList.toggle('is-new', TAB_MIN_LEVEL[id] === level);
    window.clearTimeout(this.pulseTimer);
    this.pulseTimer = window.setTimeout(() => {
      this.el.classList.remove('is-pulse');
      for (const b of this.tabBtns.values()) b.classList.remove('is-new');
    }, ms);
  }

  /* ---------------------------------------------------------------- tabs */

  /** Shows a tab. A tab below its level shows the level it opens at. Leaves the tab shown before. */
  private show(id: TalentTabId, focus?: string): void {
    const view = this.views.get(id);
    if (!view) return;
    this.shown?.onHide();
    this.shown = null;
    this.lastTab = id;
    const level = read(() => G.character?.level ?? 1, 1);
    const locked = level < TAB_MIN_LEVEL[id];
    for (const [k, b] of this.tabBtns) b.classList.toggle('is-active', k === id);
    for (const [k, v] of this.views) v.el.style.display = !locked && k === id ? '' : 'none';
    this.lockedEl.style.display = locked ? '' : 'none';
    if (locked) {
      this.lockedEl.replaceChildren(
        h('b', null, `${TAB_LABELS[id]} · Seviye ${TAB_MIN_LEVEL[id]}'da açılır`),
        h('p', null, `Şu an seviye ${level}.`),
      );
    } else {
      this.shown = view;
      view.onShow();
      if (focus) view.focus?.(focus);
    }
    this.refreshTabs();
    this.refreshStage();
  }

  /* ---------------------------------------------------------------- refresh */

  /** Re-reads the header, the tab bar, the staging bar and the visible tab. Called on every talent event while open. */
  private refresh(): void {
    this.refreshHead();
    this.refreshTabs();
    this.refreshStage();
    this.shown?.refresh?.();
  }

  private refreshHead(): void {
    const c = G.character;
    const meta = c ? CLASS_META[c.classId] : undefined;
    this.classSlot.replaceChildren(meta ? icon(meta.icon, 'pt-class-ico') : h('span.pt-class-none'));
    this.nameEl.textContent = meta ? meta.name : 'Karakter seçilmedi';
    this.levelEl.textContent = c ? `Seviye ${c.level}` : '';
    const sd = getSpec(read(() => G.talents?.specId ?? null, null));
    this.specEl.textContent = sd
      ? `${sd.name} · ${ROLE_TR[sd.role]}`
      : c && c.level >= 10
        ? 'Uzmanlık seçilmedi'
        : 'Uzmanlık: Seviye 10';
    this.specEl.classList.toggle('is-none', !sd);
    if (sd) this.specEl.style.setProperty('--role', ROLE_COLORS[sd.role] ?? '#e8c25a');
    else this.specEl.style.removeProperty('--role');
    const T = G.talents;
    this.badgeClass.textContent = read(() => (T ? `${T.pointsFree('class')}/${T.pointsTotal('class')}` : '—'), '—');
    this.badgeSpec.textContent = read(() => (T && sd ? `${T.pointsFree('spec')}/${T.pointsTotal('spec')}` : '—'), '—');
    this.badgeWeb.textContent = String(read(() => G.progression.talentPointsAvailable(), 0));
  }

  private refreshTabs(): void {
    const level = read(() => G.character?.level ?? 1, 1);
    for (const id of TAB_ORDER) {
      const locked = level < TAB_MIN_LEVEL[id];
      this.tabBtns.get(id)?.classList.toggle('is-locked', locked);
      const hint = this.tabHints.get(id);
      if (hint) hint.textContent = locked ? `Seviye ${TAB_MIN_LEVEL[id]}'da açılır` : '';
    }
  }

  private refreshStage(): void {
    const T = G.talents;
    const d = read(() => (T ? T.diff() : null), null);
    const web = read(() => this.web.stagedCounts(), { add: 0, remove: 0 });
    this.countEl.textContent = `Taslak: +${(d?.addedPoints ?? 0) + web.add} −${(d?.removedPoints ?? 0) + web.remove}`;
    this.costEl.textContent = `Bedel: ${fmtInt(d?.cost ?? 0)} altın`;
    const edit = read(() => (T ? T.canEditHere() : null), null);
    this.bannerEl.textContent = edit?.reason ?? '';
    const blocker = this.applyBlocker();
    this.applyBtn.disabled = blocker !== null;
    this.applyBtn.title = blocker ?? 'Taslağı kalıcı olarak uygula';
    this.discardBtn.disabled = !this.dirty();
    this.refreshDiffList();
  }

  /** The "Taslağı Göster" list: "+ name" for every added change, "− name" for every removed one, the web draft as a count. */
  private refreshDiffList(): void {
    if (!this.diffPop.classList.contains('is-open')) {
      this.diffPop.replaceChildren();
      return;
    }
    const d = read(() => (G.talents ? G.talents.diff() : null), null);
    const web = read(() => this.web.stagedCounts(), { add: 0, remove: 0 });
    const rows: Node[] = [];
    for (const c of d?.added ?? []) rows.push(h('div.pt-diff-add', null, `+ ${c.name}`));
    for (const c of d?.removed ?? []) rows.push(h('div.pt-diff-rem', null, `− ${c.name}`));
    if (web.add > 0) rows.push(h('div.pt-diff-add', null, `+ Pasif Ağaç: ${web.add} düğüm`));
    if (web.remove > 0) rows.push(h('div.pt-diff-rem', null, `− Pasif Ağaç: ${web.remove} düğüm`));
    if (rows.length === 0) rows.push(h('div.pt-diff-none', null, 'Taslakta değişiklik yok.'));
    this.diffPop.replaceChildren(...rows);
  }

  /* ---------------------------------------------------------------- staging */

  /** Staged changes of any tab: the WoW draft or a tab's own draft. */
  private dirty(): boolean {
    const d = read(() => (G.talents ? G.talents.diff() : null), null);
    if (d && d.added.length + d.removed.length > 0) return true;
    for (const v of this.views.values()) if (v.hasDraft()) return true;
    return false;
  }

  /**
   * Why "Değişiklikleri Uygula" is off (GDD_TALENTS §5.5), or null when the staged changes can be applied. The WoW draft is
   * checked here; a passive-web-only draft is checked by its own commit, which says why it refuses.
   */
  private applyBlocker(): string | null {
    const T = G.talents;
    if (!T) return 'Uzmanlık sistemi hazır değil.';
    const d = T.diff();
    if (d.added.length + d.removed.length === 0) return this.web.hasDraft() ? null : 'Uygulanacak değişiklik yok.';
    const edit = T.canEditHere();
    if (d.addedPoints > 0 && !edit.add) return edit.reason ?? 'Şu an puan eklenemez.';
    if (d.removedPoints > 0 && !edit.remove) return edit.reason ?? 'Puan geri almak için şehir veya köyde ol.';
    if (d.cost > (G.character?.save.gold ?? 0)) return 'Yetersiz altın.';
    return null;
  }

  /**
   * "Değişiklikleri Uygula": the WoW trees first (after the removal confirm), then the passive web draft. A refusal keeps the
   * drafts and says why. Returns true when everything staged was applied.
   */
  private async apply(): Promise<boolean> {
    const blocker = this.applyBlocker();
    if (blocker) {
      sfx('ui_error', 0.6);
      toast(blocker, 'warning');
      this.refresh();
      return false;
    }
    const T = G.talents;
    const d = read(() => (T ? T.diff() : null), null);
    if (T && d && d.removedPoints > 0 && !(await this.dialogs.confirmApply(d))) {
      this.refresh();
      return false;
    }
    if (T && d && d.added.length + d.removed.length > 0) {
      const res = T.commit();
      if (!res.ok) {
        sfx('ui_error', 0.6);
        toast(res.error ?? 'Değişiklikler uygulanamadı.', 'error');
        this.refresh();
        return false;
      }
    }
    if (this.web.hasDraft()) {
      const res = this.web.commitDraft();
      if (!res.ok) {
        sfx('ui_error', 0.6);
        toast(res.error ?? 'Pasif ağaç değişiklikleri uygulanamadı.', 'error');
        this.refresh();
        return false;
      }
    }
    sfx('talent_apply', 0.7);
    toast('Değişiklikler uygulandı.', 'success');
    this.refresh();
    return true;
  }

  /** "Geri Al": drops every staged change, of the WoW trees and of the passive web. */
  private discard(): void {
    this.discardAll();
    sfx('ui_tab', 0.6);
    this.refresh();
  }

  /** Drops the WoW draft and the web draft. Used by Geri Al, "At" and a close that drops the drafts. */
  private discardAll(): void {
    read(() => G.talents?.cancel(), undefined);
    read(() => this.web.discardDraft(), undefined);
  }

  /**
   * Closing with staged changes: "Kaydedilmemiş değişiklikler var." [Uygula] [At] [Geri dön] (GDD_TALENTS §5.5). The window
   * stays open until the answer: Uygula applies (and closes when it went through), At drops the drafts and closes, Geri dön
   * and Esc keep it open.
   */
  private askUnsaved(): void {
    if (this.closeAsking) return;
    this.closeAsking = true;
    void this.dialogs.askUnsaved().then(async (choice) => {
      this.closeAsking = false;
      if (choice === 'apply') {
        if (await this.apply()) this.requestClose();
      } else if (choice === 'discard') {
        this.discardAll();
        this.requestClose();
      }
    });
  }
}
