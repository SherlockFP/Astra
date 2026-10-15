import '../styles/hud-guide.css';
import { G } from '../../game/G';
import type { UI } from '../UI';
import { div, h, setClass, setDisplay, setText } from '../widgets/dom';
import { expandKeys, keyLabel, slotKeyLabel } from '../widgets/controlHints';
// keyLabel: the key cap of the step's own action (the card shows it under the text)
import { GUIDE_NPC, GUIDE_SKILL_NEED, GUIDE_SKILL_SLOTS, GUIDE_WALK_M, activeStep, allDone, applyEvent, flagsToWrite, guideWanted, progressOf, stateFromFlags, type GuideEvent, type GuideState, type GuideStep } from '../../systems/onboarding';
import { skillPointsFree } from '../../systems/SkillPoints';
import type { HudCtx, HudWidget } from './types';

/** The card re-reads the save at this period (s); the events do the real work. */
const TICK_S = 0.25;

/**
 * The skills step names the keys of the bar abilities the character has at its level (WoW: the L1 kit sits on 1, 2, 3 and Q),
 * not fixed keys that may still be locked. Falls back to the static text when the bar holds fewer usable abilities.
 */
function skillsText(step: GuideStep): string {
  const ch = G.character;
  const level = ch?.level ?? 1;
  const keys: string[] = [];
  for (const slot of GUIDE_SKILL_SLOTS) {
    const id = ch?.save.skillBar[slot];
    if (!id) continue;
    if ((G.skills?.getDef(id)?.unlockLevel ?? 1) > level) continue;
    keys.push(slotKeyLabel(slot));
    if (keys.length === GUIDE_SKILL_NEED) break;
  }
  if (keys.length < GUIDE_SKILL_NEED) return step.text;
  return `Çubuktaki yetenekleri ${keys.join(' ')} tuşlarıyla dört kez farklı kullan.`;
}
/** Welcome card flag (ui/panels/game/welcome.ts): the guide starts after it. */
const WELCOME_FLAG = 'onb.welcome';

/**
 * First-10-minutes guide card (systems/onboarding.ts holds the steps). One step at a time: a title, short Turkish text with the
 * live key names, a progress count, an on-screen highlight (an action bar cell or a micro-menu button) and "Rehberi Atla".
 * Each step completes on the real game event (walking, the NPC dialog, the quest, damage dealt, a bar skill cast, loot, the
 * panels, equipment, skill points). Progress is written to the save as append-only flags; beta characters never see it.
 * It takes the tip-card slot above the chat (TipCards yields while the guide runs). OWNER: hud module.
 */
export class GuideCard implements HudWidget {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly count: HTMLElement;
  private readonly keys: HTMLElement;
  private acc = TICK_S;
  private state: GuideState | null = null;
  private shownId = '';
  private lastPos: { x: number; z: number } | null = null;
  private walked = 0;
  private spFree = -1;
  private hl: Element | null = null;
  private shown = false;

  constructor(private readonly ui: UI) {
    this.el = div('guide-card k-plate');
    setDisplay(this.el, false);
    const head = div('guide-head', this.el);
    div('guide-ico', head, '◆');
    this.title = div('guide-title', head);
    this.count = div('guide-count', head);
    this.text = div('guide-text', this.el);
    this.keys = div('guide-keys', this.el);
    const foot = div('guide-foot', this.el);
    div('guide-hint', foot, 'Kontroller: ?');
    const skip = h('button', 'guide-skip k-btn k-btn--sm', foot, 'Rehberi Atla');
    skip.type = 'button';
    skip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipGuide();
    });

    G.events.on('ui:panel', ({ panel, open }) => {
      if (open && panel === 'dialog') this.feed({ k: 'talk' });
      else if (['inventory', 'map', 'finder'].includes(panel)) this.feed({ k: 'panel', panel, open });
    });
    G.events.on('quest:updated', ({ questId, state }) => {
      if (G.quests?.def(questId)?.giver !== GUIDE_NPC) return;
      if (state === 'active') this.feed({ k: 'accept' });
      else if (state === 'done') this.feed({ k: 'turnin' });
    });
    G.events.on('damage', (e) => {
      if (G.player && e.sourceId === G.player.id) this.feed({ k: 'hit' });
    });
    G.events.on('skill:cast', ({ casterId, skillId }) => {
      const ch = G.character;
      if (!G.player || !ch || casterId !== G.player.id) return;
      for (const [slot, id] of Object.entries(ch.save.skillBar ?? {})) if (id === skillId) this.feed({ k: 'cast', slot });
    });
    G.events.on('loot:pickedUp', () => this.feed({ k: 'loot' }));
    G.events.on('equipment:changed', () => this.feed({ k: 'equip' }));
    G.events.on('skillpoints:changed', () => {
      const ch = G.character;
      if (!ch) return;
      const free = skillPointsFree(ch.save);
      if (this.spFree >= 0 && free < this.spFree) this.feed({ k: 'sp' });
      this.spFree = free;
    });
  }

  /** True while the card is on screen (TipCards yields to it). */
  get active(): boolean {
    return this.shown;
  }

  update(ctx: HudCtx): void {
    this.acc += ctx.dt;
    if (this.acc < TICK_S) return;
    this.acc = 0;
    const ch = G.character;
    const p = G.player;
    if (!ch || !p) return this.hide();
    if (this.state === null) {
      // a character above the first levels that never met the guide (created before it existed) is marked skipped, quietly
      const legacy = ch.save.level > 2 && Object.keys(ch.save.flags).every((k) => !k.startsWith('onb.'));
      if (legacy && !ch.save.beta) this.write({ ...stateFromFlags(ch.save.flags), skipped: true }, true);
      this.state = stateFromFlags(ch.save.flags);
      this.spFree = skillPointsFree(ch.save);
    }
    if (!guideWanted(ch.save) || this.state.skipped || allDone(this.state)) return this.hide();
    if (ch.save.flags[WELCOME_FLAG] === undefined || (ctx.mode !== 'town' && ctx.mode !== 'dungeon')) return this.hide();

    // walking counts toward the movement step (the camera drag is taught in the text, not measured)
    if (!this.lastPos) this.lastPos = { x: p.position.x, z: p.position.z };
    this.walked += Math.hypot(p.position.x - this.lastPos.x, p.position.z - this.lastPos.z);
    this.lastPos = { x: p.position.x, z: p.position.z };
    if (this.walked >= GUIDE_WALK_M) this.feed({ k: 'move' });

    this.render(ch.save.level);
  }

  reset(): void {
    this.lastPos = null;
    this.walked = 0;
    this.clearHighlight();
    this.hide();
  }

  /** Feeds one event: advances the state, writes the new flags, redraws, and ends the guide when every step is done. */
  private feed(ev: GuideEvent): void {
    const ch = G.character;
    if (!ch || !this.state || this.state.skipped || ch.save.beta) return;
    const next = applyEvent(this.state, ev, ch.save.level);
    if (next === this.state) return;
    this.write(next);
    this.state = next;
    if (allDone(next)) {
      this.write({ ...next, skipped: false }, false);
      ch.save.flags['onb.done'] = 1;
      ch.persist();
      this.hide();
      return;
    }
    this.render(ch.save.level);
  }

  /** Writes the append-only flags that `next` adds. `asSkip` writes `onb.skip` (the guide is over for good). */
  private write(next: GuideState, asSkip = next.skipped): void {
    const ch = G.character;
    if (!ch) return;
    for (const f of flagsToWrite(ch.save.flags, { ...next, skipped: false })) ch.save.flags[f] = 1;
    if (asSkip && !ch.save.flags['onb.done']) ch.save.flags['onb.skip'] = 1;
    ch.persist();
  }

  private skipGuide(): void {
    if (!this.state) return;
    this.state = { ...this.state, skipped: true };
    this.write(this.state, true);
    this.hide();
  }

  private render(level: number): void {
    const st = this.state;
    if (!st) return;
    const step = activeStep(st, level);
    if (!step) return this.hide();
    const prog = progressOf(st, level);
    setText(this.count, `${prog.done} / ${prog.total}`);
    if (step.id !== this.shownId) {
      this.shownId = step.id;
      this.setStep(step);
    }
    this.highlight(step);
    this.show();
  }

  private setStep(step: GuideStep): void {
    setText(this.title, step.title);
    setText(this.text, expandKeys(step.id === 'skills' ? skillsText(step) : step.text));
    this.keys.textContent = '';
    const action = step.anchor.kind === 'key' ? step.anchor.action : step.anchor.kind === 'panel' ? step.anchor.key : undefined;
    if (action) h('span', 'k-key guide-cap', this.keys, keyLabel(action as never));
    setDisplay(this.keys, this.keys.childElementCount > 0, 'flex');
  }

  /** The highlight: an action bar cell (slot) or a micro-menu button (panel). Key steps light their key cap in the card. */
  private highlight(step: GuideStep): void {
    const a = step.anchor;
    let el: Element | null = null;
    if (a.kind === 'slot') el = document.querySelector(`.ab-btn[data-slot="${a.slot}"]`);
    else if (a.kind === 'panel') el = document.querySelector(`[data-panel="${a.panel}"]`);
    if (el === this.hl) return;
    this.clearHighlight();
    if (el) {
      el.classList.add('onb-hl');
      this.hl = el;
    }
  }

  private clearHighlight(): void {
    this.hl?.classList.remove('onb-hl');
    this.hl = null;
  }

  private show(): void {
    if (this.shown) return;
    this.shown = true;
    setDisplay(this.el, true, 'flex');
    setClass(this.el, 'on', true);
  }

  private hide(): void {
    this.clearHighlight();
    if (!this.shown) return;
    this.shown = false;
    setClass(this.el, 'on', false);
    setDisplay(this.el, false);
  }
}
