import '../../styles/panels-guide.css';
import { G } from '../../../game/G';
import type { InputAction } from '../../../core/Input';
import { buildChrome, keyCap } from '../../kit';
import { ICON, div, h, setText } from '../../widgets/dom';
import { formatDistance } from '../../hud/ObjectiveArrow';
import { GamePanel, button } from './base';
import { giverPosition, recommend } from './guideEngine';

/** Save flag: the welcome card was seen (closed by any means) (§4.10). */
const WELCOME_FLAG = 'onb.welcome';
/** Level at which the welcome card is shown automatically (§4.1). */
const WELCOME_MAX_LEVEL = 2;
/** The first guide NPC (§4.3). */
const GUIDE_NPC = 'npc_muhtar';

/** Binding label of an action, or a placeholder when the input layer is not ready. */
function key(action: InputAction): string {
  try {
    return G.input?.bindingLabel(action) ?? '?';
  } catch {
    return '?';
  }
}

/**
 * Hoş Geldin card (§4.2, UX-21): a modal card with the controls cheat-sheet and the first goal. Shown once, on entering the
 * town at level 2 or below, when `onb.welcome` is unset. Başla (or Enter / Space / Esc) closes it, sets the guide target to
 * Muhtar Cemal and writes the flag. Its distance line is live.
 * OWNER: panels-game.
 */
export class WelcomePanel extends GamePanel {
  private questName!: HTMLElement;
  private distEl!: HTMLElement;
  private acc = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.begin();
    }
  };

  constructor() {
    super('welcome', { cls: 'gd-welcome' });
    // onb.metCemal (§4.3): the first quest of the guide NPC has left `available`
    G.events.on('quest:updated', ({ questId, state }) => {
      const ch = G.character;
      if (!ch || state === 'available') return;
      if (G.quests?.def(questId)?.giver !== GUIDE_NPC || ch.save.flags['onb.metCemal']) return;
      ch.save.flags['onb.metCemal'] = 1;
      ch.persist();
    });
    // first login: the town at level 1-2, once per character
    G.events.on('scene:changed', ({ to }) => {
      if (to !== 'town') return;
      setTimeout(() => this.autoOpen(), 1000);
    });
  }

  private autoOpen(): void {
    const ch = G.character;
    if (!ch || ch.save.level > WELCOME_MAX_LEVEL || ch.save.flags[WELCOME_FLAG]) return;
    if (G.ui.mode !== 'town' || G.ui.wantsCursor()) return;
    G.ui.openPanel('welcome');
  }

  protected build(): void {
    const c = buildChrome({
      title: "Kuzgunkale'ye Hoş Geldin, Gölge Avcısı",
      icon: ICON('ui-star'),
      size: 'M',
      modal: true,
      closable: false,
      onClose: () => this.begin(),
    });
    c.body.classList.add('gd-welcome-body');
    div('gd-intro', c.body, 'Kadim Mühür çatlıyor. Vadiyi ve zindanları kurtaracak kişi sen olabilirsin.');

    const cols = div('gd-cols', c.body);
    this.column(cols, 'Hareket', [
      [`${key('moveForward')} ${key('moveLeft')} ${key('moveBack')} ${key('moveRight')}`, 'yürü'],
      [key('jump'), 'zıpla'],
      [key('dodge'), 'yuvarlan'],
    ]);
    this.column(cols, 'Savaş', [
      [key('skill_lmb'), 'saldır'],
      [key('skill_rmb'), 'yetenek'],
      [`${key('skill_q')} ${key('skill_e')} ${key('skill_s1')} ${key('skill_s2')} ${key('skill_s3')}`, 'beceriler'],
    ]);
    this.column(cols, 'Etkileşim', [
      [key('interact'), 'konuş / al'],
      [key('inventory'), 'çanta'],
      [`${key('map')} · ${key('quests')}`, 'harita · görevler'],
    ]);

    const first = div('k-card gd-first', c.body);
    div('gd-first-t', first, 'İLK GÖREVİN');
    const row = div('gd-first-row', first);
    div('gd-first-ico', row).textContent = '◆';
    this.questName = div('gd-first-name', row, 'Muhtar Cemal ile konuş');
    this.distEl = div('gd-first-dist', row);

    const foot = div('gd-welcome-foot', c.body);
    const label = h('label', 'gd-check', foot);
    const box = h('input', '', label);
    box.type = 'checkbox';
    box.checked = G.settings?.data.showTips !== false;
    box.addEventListener('change', () => G.settings?.set('showTips', box.checked));
    label.append(' Başlangıç ipuçlarını göster');
    const go = button('BAŞLA ▸', () => this.begin(), { variant: 'primary', cls: 'gd-start' });
    foot.append(go);

    this.el.append(c.root);
  }

  private column(parent: HTMLElement, title: string, rows: [string, string][]): void {
    const card = div('k-card gd-col', parent);
    div('gd-col-t', card, title);
    for (const [k, text] of rows) {
      const r = div('gd-col-row', card);
      const kc = keyCap(k, false);
      kc.classList.add('gd-key');
      r.append(kc, ' ' + text);
    }
  }

  protected onOpen(): void {
    window.addEventListener('keydown', this.onKey, true);
    this.refresh();
  }

  protected onClose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    // any close counts as seen (Esc and the card's own button alike); the guide target is the first giver
    const ch = G.character;
    if (ch) {
      ch.save.flags[WELCOME_FLAG] = 1;
      ch.persist();
    }
    G.ui.hud?.setGuideTarget(GUIDE_NPC);
  }

  protected tick(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.refresh();
  }

  private begin(): void {
    this.requestClose();
  }

  /** Quest title from recommend() and the live distance to its giver. */
  private refresh(): void {
    const ch = G.character;
    if (!ch) return;
    let giver = GUIDE_NPC;
    try {
      const a = recommend(ch);
      if (a.quest) {
        setText(this.questName, a.quest.name);
        giver = a.quest.giverNpcId ?? GUIDE_NPC;
      }
    } catch (err) {
      console.warn('[ui] quest data not ready: keep the default line', err);
    }
    const pos = giverPosition(giver);
    const p = G.player;
    setText(this.distEl, pos && p ? '≈ ' + formatDistance(Math.hypot(pos.x - p.position.x, pos.z - p.position.z)) : '');
  }
}

