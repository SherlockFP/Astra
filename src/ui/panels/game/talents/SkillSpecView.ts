/**
 * GDD_TALENTS §4.5 / §5.4 tab 3, Beceri Uzmanlıkları (T13). The three signature skills of the character's class as cards.
 * Each card shows the skill, its mastery bar (Ustalık: XP toward the next tier, `G.progression.skillMasteryXp`) and three
 * tier rungs. An open rung has the A | B choosers with the effect text and a shape icon; a locked rung shows the exact
 * unlock text ("Ustalık x / y veya Seviye z"). Picks are immediate and free out of combat (`G.talents.setSkillPick`), so
 * this tab keeps no draft: hasDraft() is false and the staging bar is not used.
 * `skillSpecChips` / `skillSpecChipsHTML` give the picked option names for tooltips in other views (GDD_TALENTS §4.6).
 * Owner: panels-game. A TalentTab driven by the shell (talents.ts).
 */
import { G } from '../../../../game/G';
import { SKILLS } from '../../../../data/skills';
import { SIGNATURE_SKILLS, skillSpecsOf } from '../../../../data/skillSpecs';
import { TIER_LEVEL, TIER_MASTERY_XP, tierUnlocked } from '../../../../systems/Talents';
import type { ClassId } from '../../../../types/common';
import type { SkillDef } from '../../../../types/skills';
import type { SkillSpecRow } from '../../../../types/talents';
import { bindTip, esc, fmtInt, h, icon, sfx, toast } from '../base';
import type { TalentTab, TalentTabId } from './shared';

/** Tier of a signature skill (§4.2: three tiers). */
type Tier = 1 | 2 | 3;
/** Option codes as the GDD writes them. The engine's pick value is 1 for A and 2 for B (§2.7 `skl`). */
type Code = 'A' | 'B';
const PICK: Record<Code, 1 | 2> = { A: 1, B: 2 };
const TIERS: readonly Tier[] = [1, 2, 3];
const CODES: readonly Code[] = ['A', 'B'];
const FALLBACK_ICON = '/assets/icons/ui-star.svg';
const LOCK_ICON = '/assets/icons/ui-lock.svg';

/* ------------------------------------------------------------------ */
/* Shape icons (GDD_TALENTS §4.3 verbs, §5.4 icons)                     */
/* ------------------------------------------------------------------ */

type ShapeKind = 'split' | 'return' | 'orbit' | 'echo' | 'pull' | 'charge' | 'element' | 'effect';
interface ShapeInfo {
  kind: ShapeKind;
  label: string;
  /** Element swatch colour (element kind only). */
  color: string;
}

const SHAPE_LABEL: Record<ShapeKind, string> = {
  split: 'Parçalanma',
  return: 'Geri dönüş',
  orbit: 'Yörünge',
  echo: 'Yankı',
  pull: 'Çekim',
  charge: 'Şarj',
  element: 'Element',
  effect: 'Ek etki',
};
const ELEMENT_TR: Record<string, string> = {
  physical: 'Fiziksel', fire: 'Ateş', frost: 'Buz', lightning: 'Şimşek', shadow: 'Gölge', poison: 'Zehir', holy: 'Kutsal', arcane: 'Gizem',
};
const ELEMENT_COLOR: Record<string, string> = {
  physical: '#cfc6b0', fire: '#e0604e', frost: '#7fd6ff', lightning: '#ffe066', shadow: '#9a7ad8', poison: '#7fdc6a', holy: '#fff0b8', arcane: '#b78cff',
};
/** Inner SVG markup of each shape icon (16 × 16 view box, stroke or fill from CSS). Constant strings only. */
const SHAPE_BODY: Record<ShapeKind, (color: string) => string> = {
  split: () => '<path d="M8 14V9M8 9L3.5 3.5M8 9l4.5-5.5"/>',
  return: () => '<path d="M12.6 9.5A4.8 4.8 0 1 1 11.2 4.4"/><path d="M11.4 1.8v3.4H8"/>',
  orbit: () => '<circle cx="8" cy="8" r="4.6"/><circle cx="12.6" cy="8" r="1.5" fill="currentColor" stroke="none"/>',
  echo: () =>
    '<circle cx="3.5" cy="8" r="1.6" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" opacity=".6"/><circle cx="12.5" cy="8" r="1.6" fill="currentColor" stroke="none" opacity=".3"/>',
  pull: () => '<path d="M2.5 4.2L6 8l-3.5 3.8M13.5 4.2L10 8l3.5 3.8"/>',
  charge: () => '<circle cx="8" cy="8" r="5.2"/><path d="M8 8V2.8A5.2 5.2 0 0 1 13.2 8z" fill="currentColor" stroke="none"/>',
  element: (c) => `<circle cx="8" cy="8" r="5" fill="${c}" stroke="#000" stroke-width="1"/>`,
  effect: () => '<path d="M8 1.8l1.7 4.5 4.5 1.7-4.5 1.7L8 14.2l-1.7-4.5L1.8 8l4.5-1.7z" fill="currentColor" stroke="none"/>',
};

/**
 * The form an option changes, read from its fx string (GDD_TALENTS §4.3 verbs): a shape first, then a full element
 * conversion (`cv=<type>:1`), then charges (`chg=`), else the option only adds effects.
 */
export function shapeOf(fx: string): ShapeInfo {
  const sh = /(?:^|\s)shape=(split|return|orbit|echo|pull)\b/.exec(fx);
  if (sh) {
    const kind = sh[1] as ShapeKind;
    return { kind, label: SHAPE_LABEL[kind], color: '' };
  }
  const cv = /(?:^|\s)cv=([a-z]+):1\b/.exec(fx);
  if (cv && ELEMENT_TR[cv[1]]) return { kind: 'element', label: `Element: ${ELEMENT_TR[cv[1]]}`, color: ELEMENT_COLOR[cv[1]] ?? '#cfc6b0' };
  if (/(?:^|\s)chg=/.test(fx)) return { kind: 'charge', label: SHAPE_LABEL.charge, color: '' };
  return { kind: 'effect', label: SHAPE_LABEL.effect, color: '' };
}

function shapeSvg(shape: ShapeInfo): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg viewBox="0 0 16 16" class="pt-sk-shape" aria-hidden="true">${SHAPE_BODY[shape.kind](shape.color)}</svg>`;
  return tpl.content.firstElementChild as SVGSVGElement;
}

/* ------------------------------------------------------------------ */
/* Data and state helpers (never throw)                                 */
/* ------------------------------------------------------------------ */

/** Runs a read that may fail while a service is missing (the tab never throws from its reads). */
function read<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function rowOf(skillId: string, tier: Tier, code: Code): SkillSpecRow | undefined {
  return skillSpecsOf(skillId).find((r) => r.tier === tier && r.opt === code);
}

/** Whether a pick can be set now, and why not (tier lock, combat, no spec). `want` 0 clears the tier. */
function gateFor(skillId: string, tier: Tier, want: number): { ok: boolean; reason?: string } {
  return read(
    () => (G.talents ? G.talents.canSetSkillPick(skillId, tier, want) : { ok: false, reason: 'Uzmanlık sistemi hazır değil.' }),
    { ok: false, reason: 'Uzmanlık sistemi hazır değil.' },
  );
}

/** Names of the picked options of a signature skill in tier order ("Parçalanan Top", "Buz Topu"). Empty when none. */
export function skillSpecChips(skillId: string): string[] {
  const names: string[] = [];
  for (const tier of TIERS) {
    const pick = read(() => G.talents?.skillPick(skillId, tier) ?? 0, 0);
    if (pick === 0) continue;
    const row = rowOf(skillId, tier, pick === 1 ? 'A' : 'B');
    if (row) names.push(row.name);
  }
  return names;
}

/** Chip HTML of the picks (escaped), for tooltips outside this tab such as the skill tooltip or the skill book (§4.6). */
export function skillSpecChipsHTML(skillId: string): string {
  const names = skillSpecChips(skillId);
  return names.map((n) => `<span class="pt-sk-chip">${esc(n)}</span>`).join('');
}

/* ------------------------------------------------------------------ */
/* Tooltips                                                             */
/* ------------------------------------------------------------------ */

function skillTipHTML(skillId: string): string {
  const def = SKILLS[skillId] as SkillDef | undefined;
  const chips = skillSpecChips(skillId);
  const xp = read(() => G.progression.skillMasteryXp(skillId), 0);
  const picks = chips.length
    ? `<div class="pt-sk-tt-line">Seçili: ${chips.map((n) => esc(n)).join(' · ')}</div>`
    : '<div class="pt-sk-tt-hint">Henüz bir uzmanlık seçilmedi.</div>';
  return `<div class="pg-ttip-name">${esc(def?.name ?? skillId)}</div><div class="pg-ttip-kind">Beceri Uzmanlığı · Ustalık ${fmtInt(xp)}</div>${picks}`;
}

function optTipHTML(skillId: string, tier: Tier, code: Code, row: SkillSpecRow | undefined): string {
  if (!row) return '';
  const picked = read(() => G.talents?.skillPick(skillId, tier) ?? 0, 0) === PICK[code];
  const gate = gateFor(skillId, tier, picked ? 0 : PICK[code]);
  const shape = shapeOf(row.fx);
  const hint = gate.ok
    ? picked
      ? 'Seçili. Tekrar tıklayınca kaldırılır.'
      : 'Tıkla: bu formu seç.'
    : gate.reason ?? 'Şu an seçilemez.';
  return (
    `<div class="pg-ttip-name">${esc(row.name)}</div>` +
    `<div class="pg-ttip-kind">Kademe ${tier} · Seçenek ${code} · ${esc(shape.label)}</div>` +
    `<div class="pt-sk-tt-desc">${esc(row.desc)}</div>` +
    `<div class="${gate.ok ? 'pt-sk-tt-hint' : 'pt-sk-tt-block'}">${esc(hint)}</div>`
  );
}

/* ------------------------------------------------------------------ */
/* The tab                                                              */
/* ------------------------------------------------------------------ */

interface RungView {
  tier: Tier;
  root: HTMLElement;
  status: HTMLElement;
  lock: HTMLElement;
  lockText: HTMLElement;
  opts: Record<Code, HTMLButtonElement>;
}

interface CardView {
  skillId: string;
  root: HTMLElement;
  fill: HTMLElement;
  barLabel: HTMLElement;
  rank: HTMLElement;
  chips: HTMLElement;
  /** Last rendered pick names, so the chips are rebuilt only when they change. */
  chipKey: string | null;
  rungs: RungView[];
}

export class SkillSpecView implements TalentTab {
  readonly id: TalentTabId = 'skills';
  readonly label = 'Beceri Uzmanlıkları';
  /** Root of the tab: the shell shows and hides it. */
  readonly el: HTMLElement;
  private readonly note: HTMLElement;
  private readonly grid: HTMLElement;
  private cards: CardView[] = [];
  /** Class the cards were built for (undefined before the first build, null without a character). */
  private builtFor: ClassId | null | undefined = undefined;
  private timer = 0;
  private focusTimer = 0;

  constructor() {
    this.note = h('div.pt-sk-note');
    this.grid = h('div.pt-sk-cards');
    this.el = h('div.pt-tab-skills', null, this.note, this.grid);
  }

  onShow(): void {
    this.refresh();
    window.clearInterval(this.timer);
    // mastery XP grows with every cast: the bars follow while the tab is open
    this.timer = window.setInterval(() => this.sync(), 1000);
  }

  onHide(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    window.clearTimeout(this.focusTimer);
    this.clearFocus();
  }

  /** Picks are applied at once, so the tab never holds a draft. */
  hasDraft(): boolean {
    return false;
  }

  /** Re-reads the class, the mastery and the picks. The shell calls it on every talent event while visible. */
  refresh(): void {
    this.ensureCards();
    this.sync();
  }

  /** openPanel('talents', { tab: 'skills', focus: '<skillId>' | '<skillId>:<tier>' }): highlights the card (and rung). */
  focus(id: string): void {
    this.ensureCards();
    const [skillId, tierText] = id.split(':');
    const card = this.cards.find((c) => c.skillId === skillId);
    if (!card) return;
    this.clearFocus();
    card.root.classList.add('is-focus');
    card.rungs.find((r) => String(r.tier) === tierText)?.root.classList.add('is-focus');
    card.root.scrollIntoView({ block: 'nearest' });
    window.clearTimeout(this.focusTimer);
    this.focusTimer = window.setTimeout(() => this.clearFocus(), 1600);
  }

  private clearFocus(): void {
    for (const c of this.cards) {
      c.root.classList.remove('is-focus');
      for (const r of c.rungs) r.root.classList.remove('is-focus');
    }
  }

  /* ---------------------------------------------------------------- build */

  /** Builds the three cards again only when the character's class changed. */
  private ensureCards(): void {
    const classId = read(() => G.character?.classId ?? null, null);
    if (classId === this.builtFor) return;
    this.builtFor = classId;
    this.cards = classId ? (SIGNATURE_SKILLS[classId] ?? []).map((id) => this.buildCard(id)) : [];
    if (this.cards.length) {
      this.grid.replaceChildren(...this.cards.map((c) => c.root));
    } else {
      this.grid.replaceChildren(h('p.pt-sk-empty', null, classId ? 'Bu sınıf için beceri uzmanlığı tanımlı değil.' : 'Karakter seçilmedi.'));
    }
  }

  private buildCard(skillId: string): CardView {
    const def = SKILLS[skillId] as SkillDef | undefined;
    const ico = icon(def?.icon ?? FALLBACK_ICON, 'pt-sk-ico');
    bindTip(ico, () => skillTipHTML(skillId), 'pt-sk-tip');
    const fill = h('div.pt-sk-bar-fill');
    const barLabel = h('span.pt-sk-bar-label');
    const rank = h('span.pt-sk-rank');
    const chips = h('div.pt-sk-chips');
    const rungs = TIERS.map((tier) => this.buildRung(skillId, tier));
    const root = h(
      'article.pt-sk-card',
      { dataset: { skill: skillId } },
      h('div.pt-sk-head', null, ico, h('div.pt-sk-title', null, h('b.pt-sk-name', null, def?.name ?? skillId), rank)),
      h('div.pt-sk-bar', null, fill, barLabel),
      chips,
      h('div.pt-sk-rungs', null, ...rungs.map((r) => r.root)),
    );
    return { skillId, root, fill, barLabel, rank, chips, chipKey: null, rungs };
  }

  private buildRung(skillId: string, tier: Tier): RungView {
    const status = h('span.pt-sk-status');
    const lockText = h('span');
    const lock = h('span.pt-sk-lock', null, icon(LOCK_ICON, 'pt-sk-lock-ico'), lockText);
    const opts = { A: this.buildOpt(skillId, tier, 'A'), B: this.buildOpt(skillId, tier, 'B') };
    const root = h(
      'div.pt-sk-rung',
      { dataset: { tier: String(tier) } },
      h('div.pt-sk-rung-head', null, h('span.pt-sk-tier', null, `Kademe ${tier}`), lock, status),
      h('div.pt-sk-opts', null, opts.A, opts.B),
    );
    return { tier, root, status, lock, lockText, opts };
  }

  private buildOpt(skillId: string, tier: Tier, code: Code): HTMLButtonElement {
    const row = rowOf(skillId, tier, code);
    const shape = shapeOf(row?.fx ?? '');
    const btn = h(
      'button.pt-sk-opt',
      { type: 'button' },
      h('span.pt-sk-letter', null, code),
      h(
        'span.pt-sk-opt-body',
        null,
        h('span.pt-sk-opt-top', null, shapeSvg(shape), h('b.pt-sk-opt-name', null, row?.name ?? '—')),
        h('span.pt-sk-opt-text', null, row?.desc ?? ''),
      ),
    ) as HTMLButtonElement;
    btn.classList.add(code === 'A' ? 'is-a' : 'is-b');
    btn.addEventListener('click', () => this.onOption(skillId, tier, code));
    bindTip(btn, () => optTipHTML(skillId, tier, code, row), 'pt-sk-tip');
    return btn;
  }

  /* ---------------------------------------------------------------- actions */

  /** Picks an option, or clears it when it is already the pick. Immediate and free; refused picks say why. */
  private onOption(skillId: string, tier: Tier, code: Code): void {
    const T = G.talents;
    if (!T) {
      sfx('ui_error', 0.6);
      toast('Uzmanlık sistemi hazır değil.', 'warning');
      return;
    }
    const picked = read(() => T.skillPick(skillId, tier), 0) === PICK[code];
    const want = picked ? 0 : PICK[code];
    const gate = T.canSetSkillPick(skillId, tier, want);
    if (!gate.ok) {
      sfx('ui_error', 0.6);
      toast(gate.reason ?? 'Bu beceri uzmanlığı seçilemez.', 'warning');
      return;
    }
    T.setSkillPick(skillId, tier, want);
    if (T.lastReason) {
      sfx('ui_error', 0.6);
      toast(T.lastReason, 'warning');
    } else {
      sfx(want ? 'talent_take' : 'talent_untake', 0.6);
    }
    this.sync();
  }

  /* ---------------------------------------------------------------- sync */

  /** Writes the live state (mastery, rungs, picks, notice) into the built DOM. Never rebuilds the buttons. */
  private sync(): void {
    const C = read(() => G.character, null);
    const spec = read(() => G.talents?.specId ?? null, null);
    const inCombat = read(() => !!G.player?.inCombat, false);
    if (!C) {
      this.note.textContent = 'Karakter seçilmedi.';
    } else if (!spec) {
      this.note.textContent = 'Beceri uzmanlığı seçimleri aktif uzmanlığına kaydedilir. Önce Uzmanlık & Yetenekler sekmesinden bir uzmanlık seç.';
    } else if (inCombat) {
      this.note.textContent = 'Savaşta beceri uzmanlığı seçilemez. Seçimler savaş bitince yapılabilir.';
    } else {
      this.note.textContent = 'Ustalık, becerini kullandıkça artar. Kademeler Ustalık ya da seviye ile açılır. Seçimler ücretsizdir ve anında uygulanır.';
    }
    this.note.classList.toggle('is-warn', !C || !spec || inCombat);
    if (!C) return;
    for (const card of this.cards) this.syncCard(card, C.level);
  }

  private syncCard(card: CardView, level: number): void {
    const skillId = card.skillId;
    const xp = read(() => G.progression.skillMasteryXp(skillId), 0);
    const rank = read(() => G.progression.skillMasteryRank(skillId), 0);
    let frac = 1;
    let label: string;
    if (rank >= 3) {
      label = `Ustalık ${fmtInt(xp)} · Tüm kademeler açık`;
    } else {
      const next = TIER_MASTERY_XP[rank];
      frac = Math.min(1, xp / next);
      label = `Ustalık ${fmtInt(xp)} / ${fmtInt(next)}`;
    }
    card.fill.style.width = `${(frac * 100).toFixed(1)}%`;
    card.barLabel.textContent = label;
    card.rank.textContent = rank === 0 ? 'Kademe açılmadı' : rank >= 3 ? 'Tüm kademeler açık' : `${rank} / 3 kademe açık`;
    this.syncChips(card);

    for (const rung of card.rungs) {
      const open = tierUnlocked(xp, level, rung.tier);
      const pick = read(() => G.talents?.skillPick(skillId, rung.tier) ?? 0, 0);
      rung.root.classList.toggle('is-open', open);
      rung.root.classList.toggle('is-locked', !open);
      rung.lock.style.display = open ? 'none' : '';
      rung.status.style.display = open ? '' : 'none';
      rung.lockText.textContent = `Ustalık ${fmtInt(xp)} / ${fmtInt(TIER_MASTERY_XP[rung.tier - 1])} veya Seviye ${TIER_LEVEL[rung.tier - 1]}`;
      rung.status.textContent = pick === 0 ? 'Seçilmedi' : pick === 1 ? 'A seçili' : 'B seçili';
      for (const code of CODES) {
        const btn = rung.opts[code];
        const own = pick === PICK[code];
        const gate = gateFor(skillId, rung.tier, own ? 0 : PICK[code]);
        btn.classList.toggle('is-picked', own);
        // not `disabled`: a disabled button would lose its tooltip, which says why the pick is refused
        btn.classList.toggle('is-off', !gate.ok);
        btn.setAttribute('aria-pressed', String(own));
        btn.setAttribute('aria-disabled', String(!gate.ok));
      }
    }
  }

  private syncChips(card: CardView): void {
    const names = skillSpecChips(card.skillId);
    const key = names.join('|');
    if (key === card.chipKey) return;
    card.chipKey = key;
    card.chips.replaceChildren(
      ...(names.length ? names.map((n) => h('span.pt-sk-chip', null, n)) : [h('span.pt-sk-chip.is-none', null, 'Seçim yok')]),
    );
  }
}
