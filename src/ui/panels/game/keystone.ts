import { G } from '../../../game/G';
import type { DungeonDef } from '../../../types/dungeons';
import type { KeystoneData } from '../../../types/items';
import type { AffixId } from '../../../types/mythic';
import type { DungeonParams } from '../../../scenes/scenes';
import { DUNGEONS } from '../../../data/dungeons';
import { DEATH_PENALTY_SEC, MIN_KEY_LEVEL, currentWeek } from '../../../data/mythicAffixes';
import {
  CLASS_META, DIFFICULTY_NAMES, GamePanel, affixChips, affixView, affixesForLevel, askConfirm, bindTip, button, clampN, dungeonArt, dungeonList, dungeonName, esc, fmtInt, h, icon,
  mmss, openPanel, pct, sfx, tabs, toast, windowFrame, type TabsHandle,
} from './base';
import { emptyState } from '../../kit';
import { startRun } from './runStart';
import {
  HEROIC_LEVEL, bestM0Sec, cardText, difficultyState, gateToast, isStartable, isUnderGeared, recommendedIlvl, requiredLevel, type DiffKind, type DiffState, type LadderDiff,
} from './ladder';

type Diff = 'normal' | 'heroic' | 'mythic' | 'mplus';
type Tab = 'key' | 'pick' | 'svc';

/** One difficulty card of the pick tab: ladder state, enemy level and the recommended overlay. */
interface DiffCard {
  id: Diff;
  name: string;
  desc: string;
  ladder: LadderDiff;
  st: DiffState;
  enemy: number;
  recommended: boolean;
}

/** States that cannot be entered (grey card + lock icon). */
const LOCKED_KINDS: DiffKind[] = ['locked_level', 'locked_quest', 'locked_clear', 'locked_key'];

/**
 * Level gates and enemy level rules (GDD_CONTENT 6): Normal clamp(party avg, min, min + 10), Kahramanlık clamp(avg, 50, 60), Mitik 0 / Mitik+ = 60.
 * Unlocks (ladder.ts difficultyState, GDD_OPENWORLD §7.3): Kahramanlık = level 50 + a Normal clear of that dungeon; Mitik 0 = level 60 +
 * a Kahramanlık clear (Bounties.hasCleared flags 'clear.<dungeonId>.<difficulty>', written on 'run:completed'). Testers can skip the clear
 * requirement with `?unlock` in the URL or localStorage 'efsun.unlock' = '1'.
 */
const CLEAR_GATES_OFF = ((): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('unlock') || window.localStorage.getItem('efsun.unlock') === '1';
  } catch {
    return false;
  }
})();

interface Holder {
  peerId: string;
  name: string;
  classId: keyof typeof CLASS_META | null;
  key: KeystoneData;
  isSelf: boolean;
}

/** Font of Power / Anahtar Ustası: insert the keystone (Mitik+), pick a dungeon + difficulty, keystone services. */
export class KeystonePanel extends GamePanel {
  private artEl!: HTMLElement;
  private cardInfo!: HTMLElement;
  private mainEl!: HTMLElement;
  private tabsH!: TabsHandle;
  private footEl!: HTMLElement;
  private tab: Tab = 'pick';
  private selDungeon = '';
  private selDiff: Diff = 'normal';
  private selKeyOwner = '';
  private renderedTab: Tab | '' = '';
  /** Set when opened from an open-world entrance (GDD_OPENWORLD §7.7): the run's exit returns to that entrance. */
  private returnTo: DungeonParams['returnTo'] = undefined;

  constructor() {
    super('keystone', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Kehanet Taşı', icon: '/assets/icons/item-keystone.svg', cls: 'pg-keystone', size: 'M', width: '900px', onClose: () => this.requestClose() });
    this.artEl = h('div.pg-ks-art');
    this.cardInfo = h('div.pg-ks-cardinfo');
    const card = h('div.pg-ks-card', null, this.artEl, this.cardInfo);
    this.tabsH = tabs(
      [
        { id: 'key', label: 'Mitik+ Anahtarı', icon: '/assets/icons/item-keystone.svg' },
        { id: 'pick', label: 'Zindan Seç', icon: '/assets/icons/ui-dungeon.svg' },
        { id: 'svc', label: 'Anahtar Ustası', icon: '/assets/icons/ui-anvil.svg' },
      ],
      (id) => {
        this.tab = id as Tab;
        this.render();
      },
    );
    this.mainEl = h('div.pg-ks-main.pg-scroll');
    body.append(h('div.pg-ks-layout', null, card, h('div.pg-ks-right', null, this.tabsH.el, this.mainEl)));
    this.footEl = foot;
    foot.classList.add('pg-ks-foot');
    this.el.append(win);
  }

  /* ---------------------------------------------------------------- data helpers */

  private myKey(): KeystoneData | null {
    return G.character?.save.mythic.keystone ?? null;
  }

  private inDungeon(): boolean {
    return G.scenes?.current?.id === 'dungeon';
  }

  private holders(): Holder[] {
    const out: Holder[] = [];
    const mk = this.myKey();
    if (mk) out.push({ peerId: G.net.selfId, name: G.character?.save.name ?? 'Sen', classId: G.character?.classId ?? null, key: mk, isSelf: true });
    for (const p of G.net.peers.values()) {
      if (p.peerId === G.net.selfId || !p.keystone) continue;
      out.push({ peerId: p.peerId, name: p.name, classId: p.summary?.classId ?? null, key: p.keystone, isSelf: false });
    }
    return out;
  }

  private partyInfo(): { size: number; avgLevel: number } {
    const levels: number[] = [G.character?.level ?? 1];
    // a peer whose summary has not arrived yet counts as the local level (never as level 1: that would drag the enemy level down)
    for (const p of G.net.peers.values()) if (p.peerId !== G.net.selfId) levels.push(p.summary?.level ?? levels[0]);
    return { size: levels.length, avgLevel: Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) };
  }

  /** Enemy level for the run (GDD_CONTENT 6): Normal clamp(avg, min, min + 10), Kahramanlık clamp(avg, 50, 60), Mitik 0 / Mitik+ 60. */
  private enemyLevelFor(def: DungeonDef | undefined, diff: Diff | 'mythicplus'): number {
    const avg = this.partyInfo().avgLevel;
    if (diff === 'normal') {
      const min = def?.levelRange?.[0] ?? 1;
      return clampN(avg, min, Math.min(60, min + 10));
    }
    if (diff === 'heroic') return clampN(avg, HEROIC_LEVEL, 60);
    return 60;
  }

  protected onOpen(data?: unknown): void {
    const d = (data ?? {}) as { dungeonId?: string; tab?: Tab | 'vault'; returnTo?: DungeonParams['returnTo'] };
    if (d.tab === 'vault') {
      // Lord Tarhan (weekly vault) shares the keystone NPC role: the vault lives in the M+ info panel
      this.requestClose();
      openPanel('mplusInfo', { focus: 'vault' });
      return;
    }
    this.returnTo = d.returnTo;
    const list = dungeonList();
    const key = this.myKey();
    this.selDungeon = d.dungeonId && DUNGEONS[d.dungeonId] ? d.dungeonId : key?.dungeonId ?? list[0]?.id ?? '';
    this.selDiff = 'normal';
    this.selKeyOwner = key ? G.net.selfId : this.holders()[0]?.peerId ?? '';
    this.tab = d.tab ?? (d.dungeonId ? 'pick' : key ? 'key' : 'pick');
    if (this.tab === 'svc' && this.inDungeon()) this.tab = key ? 'key' : 'pick';
    for (const ev of ['keystone:changed', 'party:changed', 'net:status', 'player:levelup', 'player:gold', 'bounty:changed'] as const) this.listen(ev, () => this.render());
    this.renderedTab = '';
    this.render();
  }

  /* ---------------------------------------------------------------- render */

  private render(): void {
    const key = this.myKey();
    const holders = this.holders();
    const dungeon = this.inDungeon();
    (this.tabsH.el.children[2] as HTMLElement | undefined)?.style.setProperty('display', dungeon ? 'none' : '');
    if (this.tab === 'svc' && dungeon) this.tab = 'pick';
    if (this.tab === 'key' && !key && !holders.length) this.tab = 'pick';
    this.tabsH.select(this.tab, true);
    // keep the scroll position across refreshes of the same tab, start at the top on a tab switch
    const keep = this.renderedTab === this.tab ? this.mainEl.scrollTop : 0;
    this.renderedTab = this.tab;
    this.mainEl.innerHTML = '';
    this.footEl.innerHTML = '';
    if (this.tab === 'key') this.renderKeyTab(holders);
    else if (this.tab === 'svc') this.renderSvcTab();
    else this.renderPickTab();
    this.renderCard();
    this.mainEl.scrollTop = keep;
  }

  private currentDungeon(): DungeonDef | undefined {
    if (this.tab === 'key') {
      const ho = this.holders().find((x) => x.peerId === this.selKeyOwner) ?? this.holders()[0];
      return ho ? DUNGEONS[ho.key.dungeonId] : DUNGEONS[this.selDungeon];
    }
    if (this.tab === 'svc') {
      const k = this.myKey();
      return k ? DUNGEONS[k.dungeonId] : DUNGEONS[this.selDungeon];
    }
    return DUNGEONS[this.selDungeon];
  }

  private renderCard(): void {
    const def = this.currentDungeon();
    const art = dungeonArt(def);
    this.artEl.innerHTML = '';
    const isPhoto = /\.(png|jpe?g|webp)$/i.test(art);
    this.artEl.style.backgroundImage = isPhoto ? `url(${art})` : '';
    this.artEl.classList.toggle('is-photo', isPhoto);
    if (!isPhoto) this.artEl.append(h('div.pg-ks-rune'), icon(art, 'pg-ks-artico'));
    this.artEl.append(h('div.pg-ks-artfade'));
    this.cardInfo.innerHTML = '';
    if (!def) {
      this.cardInfo.append(h('div.pg-empty', null, 'Zindan verisi yok.'));
      return;
    }
    const lvl = G.character?.level ?? 1;
    this.cardInfo.append(
      h('div.pg-ks-dname', null, def.name),
      h('div.pg-ks-dlevel', null, `Seviye ${def.levelRange?.[0] ?? '?'} - ${def.levelRange?.[1] ?? '?'}`, lvl < (def.levelRange?.[0] ?? 0) ? h('span.pg-bad', null, '  · seviyen düşük') : null),
      h('p.pg-ks-lore', null, def.lore ?? ''),
      ...(this.returnTo ? [h('div.pg-ks-entrance', null, 'Dünya girişi: zindan çıkışı seni bu kapıya geri götürür.')] : []),
      h(
        'div.pg-ks-stats',
        null,
        h('div', null, icon('/assets/icons/ui-timer.svg'), h('span', null, `Süre ${mmss(def.timerSec ?? 0)}`)),
        h('div', null, icon('/assets/icons/ui-enemy-forces.svg'), h('span', null, `Düşman Gücü ${def.forcesRequired ?? '?'}`)),
        h('div', null, icon('/assets/icons/ui-boss.svg'), h('span', null, `${def.bosses?.length ?? 3} Boss`)),
      ),
    );
  }

  /* ---- tab: key ---- */
  private renderKeyTab(holders: Holder[]): void {
    const main = this.mainEl;
    const sel = holders.find((x) => x.peerId === this.selKeyOwner) ?? holders[0];
    if (!sel) {
      main.append(
        emptyState({ icon: '/assets/icons/item-keystone.svg', title: 'Anahtarın yok', text: 'Bir zindanı Mitik 0 zorluğunda bitirince Kadim Anahtar Taşı kazanırsın.', action: { label: 'Zindan Bulucu', onClick: () => openPanel('finder') } }),
        h('div.pg-ks-linkrow', null, button('Anahtar Ustası', () => this.switchTab('svc'), { variant: 'ghost', icon: '/assets/icons/ui-anvil.svg' })),
      );
      return;
    }
    this.selKeyOwner = sel.peerId;
    const def = DUNGEONS[sel.key.dungeonId];
    const level = sel.key.level;
    const affixes = affixesForLevel(level);
    const trash = safeScale(level, affixes, false);
    const boss = safeScale(level, affixes, true);

    // keystone showcase
    const stone = h('div.pg-ks-stone', null, h('div.pg-ks-ring'), h('div.pg-ks-ring.r2'), icon('/assets/icons/item-keystone.svg', 'pg-ks-stoneico'), h('div.pg-ks-lvl', null, `+${level}`));
    const timer = def?.timerSec ?? 0;
    const showcase = h(
      'div.pg-ks-show',
      null,
      stone,
      h(
        'div.pg-ks-showinfo',
        null,
        h('div.pg-ks-kname', null, 'Kadim Anahtar Taşı'),
        h('div.pg-ks-kdun', null, `${def?.name ?? sel.key.dungeonId} `, h('b', null, `+${level}`)),
        sel.key.depleted ? h('div.pg-ks-depleted', null, icon('/assets/icons/ui-key-depleted.svg'), 'Tükenmiş: son koşu zamanında bitmedi.') : null,
        timer
          ? h('div.pg-ks-thresholds', null, h('span', null, `Süre ${mmss(timer)}`), h('span.t3', null, `+3: ${mmss(timer * 0.6)}`), h('span.t2', null, `+2: ${mmss(timer * 0.8)}`), h('span.t1', null, `+1: ${mmss(timer)}`))
          : null,
      ),
    );
    main.append(showcase);

    // scaling
    main.append(
      h('div.pg-h', null, 'Zorluk Çarpanı'),
      h(
        'div.pg-ks-scale',
        null,
        scaleBox('Düşmanlar', trash),
        scaleBox('Bosslar', boss),
        h('div.pg-ks-scalebox', null, h('small', null, 'Ölüm Cezası'), h('b', null, `+${DEATH_PENALTY_SEC} sn`), h('em', null, 'her ölümde')),
      ),
    );

    // affixes
    main.append(h('div.pg-h', null, 'Bu Haftanın Eklentileri'));
    const alist = h('div.pg-ks-affixes');
    if (!affixes.length) alist.append(h('div.pg-empty', null, 'Bu seviyede eklenti yok.'));
    for (const id of affixes) alist.append(affixRow(id));
    main.append(alist);

    // party keys
    if (holders.length > 1 || G.net.isOnline) {
      main.append(h('div.pg-h', null, 'Grup Anahtarları'));
      const list = h('div.pg-ks-party');
      for (const ho of holders) {
        const d = DUNGEONS[ho.key.dungeonId];
        const cm = ho.classId ? CLASS_META[ho.classId] : null;
        const row = h(
          'div.pg-ks-prow',
          { class: ho.peerId === this.selKeyOwner ? 'is-sel' : '' },
          cm ? icon(cm.icon, 'pg-ks-pcls') : h('span.pg-ks-pcls'),
          h('span.pg-ks-pname', { style: { color: cm?.color } }, ho.name + (ho.isSelf ? ' (sen)' : '')),
          h('span.pg-ks-pkey', null, `${d?.shortName ?? ho.key.dungeonId} +${ho.key.level}`),
          ho.key.depleted ? h('span.pg-pill.pg-dim', null, 'Tükenmiş') : null,
        );
        if (G.net.isAuthority) {
          row.addEventListener('click', () => {
            sfx('ui_tab');
            this.selKeyOwner = ho.peerId;
            this.render();
          });
          row.style.cursor = 'pointer';
        }
        list.append(row);
      }
      main.append(list);
      if (!G.net.isAuthority) main.append(h('div.pg-dim.pg-small', null, 'Başkasının anahtarını yalnızca oda lideri seçebilir. Kendi anahtarını yerleştirebilirsin.'));
    }

    // start button
    const mp = this.partyInfo();
    const canStart = G.net.isAuthority || sel.isSelf;
    const label = sel.isSelf ? 'Anahtarı Yerleştir' : 'Bu Anahtarla Git';
    const btn = button(label, () => this.startMythicPlus(sel), { variant: 'primary', cls: 'pg-big', icon: '/assets/icons/item-keystone.svg', disabled: !canStart });
    this.footEl.append(h('span.pg-ks-footnote', null, mp.size > 1 ? `${mp.size} kişilik grup` : 'Tek başına'), btn, button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
  }

  private switchTab(t: Tab): void {
    this.tab = t;
    this.render();
  }

  /* ---- tab: pick ---- */
  private renderPickTab(): void {
    const main = this.mainEl;
    const list = dungeonList();
    const lvl = G.character?.level ?? 1;
    if (!list.length) {
      main.append(h('div.pg-empty', null, 'Henüz zindan verisi yüklenmedi.'));
      return;
    }
    // the leader may start with any member's key; everybody else only with their own
    const party = G.net.isAuthority ? this.holders().filter((ho) => !ho.isSelf).map((ho) => ho.key) : [];

    main.append(
      h('div.pg-ks-banner', null, h('span', null, "Grupla girmek mi istiyorsun? Zindan Bulucu'yu kullan."), button('Zindan Bulucu', () => openPanel('finder'), { variant: 'ghost', icon: '/assets/icons/ui-dungeon.svg' })),
      h('div.pg-h', null, 'Zindan'),
    );
    const grid = h('div.pg-ks-dgrid');
    for (const def of list) {
      const min = def.levelRange?.[0] ?? 0;
      const locked = lvl < min;
      const card = h(
        'button.pg-ks-dcard',
        { type: 'button', class: (def.id === this.selDungeon ? 'is-sel ' : '') + (locked ? 'is-locked' : '') },
        icon(def.icon || '/assets/icons/ui-dungeon.svg', 'pg-ks-dico'),
        h(
          'div.pg-ks-dtxt',
          null,
          h('b', null, def.name),
          h('small', null, `Sv. ${min}-${def.levelRange?.[1]} · ${mmss(def.timerSec ?? 0)}`),
          locked ? h('small.pg-bad', null, `Gereken seviye: ${min}`) : null,
        ),
        locked ? icon('/assets/icons/ui-lock.svg', 'pg-ks-lock') : null,
      ) as HTMLButtonElement;
      card.addEventListener('click', () => {
        sfx('ui_tab');
        this.selDungeon = def.id;
        this.render();
      });
      grid.append(card);
    }
    main.append(grid);

    main.append(h('div.pg-h', null, 'Zorluk'));
    const def = DUNGEONS[this.selDungeon];
    const cards = this.difficultyCards(def, party);
    if (!def || !cards.length) {
      main.append(h('div.pg-empty', null, 'Bu zindan için zorluk verisi yok.'));
      this.footEl.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
      return;
    }
    if (!cards.some((c) => c.id === this.selDiff)) this.selDiff = (cards.find((c) => isStartable(c.st)) ?? cards[0]).id;

    const drow = h('div.pg-ks-diffs');
    for (const c of cards) {
      const locked = LOCKED_KINDS.includes(c.st.kind);
      const badge =
        c.st.kind === 'cleared'
          ? h('span.pg-ks-badge.ok', null, '✓ Temizlendi')
          : c.st.kind === 'key_other'
            ? h('span.pg-ks-badge.gold', null, 'Başka zindan')
            : c.st.kind === 'depleted'
              ? h('span.pg-ks-badge.red', null, 'Tükenmiş')
              : null;
      const cls = [
        c.id === this.selDiff ? 'is-sel' : '',
        locked ? 'is-locked' : '',
        c.st.kind === 'key_other' ? 'is-other' : '',
        c.st.kind === 'depleted' ? 'is-depleted' : '',
        c.st.kind === 'cleared' ? 'is-cleared' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const text = isStartable(c.st) ? this.cardDesc(def, c) : cardText(def, c.ladder, c.st);
      const b = h(
        'button.pg-ks-diff',
        { type: 'button', class: cls },
        h('div.pg-ks-dtop', null, h('b', null, c.name), locked ? icon('/assets/icons/ui-lock.svg', 'pg-ks-dlock') : null, badge),
        h('small', null, text),
        c.recommended ? h('span.pg-ks-rec', null, 'Önerilen') : null,
      ) as HTMLButtonElement;
      b.addEventListener('click', () => {
        sfx(isStartable(c.st) ? 'ui_tab' : 'ui_error');
        if (!isStartable(c.st)) toast(gateToast(def, c.ladder, c.st) || text, 'warning');
        this.selDiff = c.id;
        this.render();
      });
      drow.append(b);
    }
    main.append(drow);

    const cur = cards.find((c) => c.id === this.selDiff) ?? cards[0];
    const curLocked = !isStartable(cur.st);
    main.append(
      h(
        'div.pg-ks-diffdesc' + (curLocked ? '.pg-bad' : ''),
        null,
        curLocked ? cardText(def, cur.ladder, cur.st) : this.cardDesc(def, cur),
        h('b', { style: { color: 'var(--gold-bright)', marginLeft: '8px' } }, `Düşman seviyesi: ${cur.enemy}`),
      ),
    );

    // recommended item level (portal text, never a hard gate)
    const rec = recommendedIlvl(def, cur.ladder, cur.st.key?.level ?? 2);
    const il = G.character?.itemLevel() ?? 0;
    const low = isUnderGeared(il, rec);
    main.append(h('div.pg-ks-recline' + (low ? '.is-low' : ''), null, `Önerilen eşya seviyesi: ${rec}`, low ? h('span', null, ' — eşyaların zayıf, riskli!') : null));

    // per-member level gate: every member must meet it (the start button stays disabled)
    const need = requiredLevel(def, cur.ladder);
    const gates: string[] = [];
    for (const p of G.net.peers.values()) {
      if (p.peerId === G.net.selfId || !p.summary) continue;
      if (p.summary.level < need) gates.push(`${p.name} için seviye yetersiz (${need} gerekli).`);
    }
    for (const g of gates) main.append(h('div.pg-bad.pg-small', null, g));

    const canHost = G.net.isAuthority;
    const isMp = cur.ladder === 'mythicplus';
    const mpHolder = isMp ? this.holders().find((ho) => ho.key.dungeonId === def.id && (ho.isSelf || canHost)) : undefined;
    if (isStartable(cur.st)) {
      if (isMp && !mpHolder) main.append(h('div.pg-bad.pg-small', null, 'Bu anahtarla yalnızca oda lideri başlatabilir.'));
      else if (!isMp && !canHost) main.append(h('div.pg-bad.pg-small', null, 'Zindanı yalnızca oda lideri başlatabilir.'));
    }
    const ok = isStartable(cur.st) && gates.length === 0 && (isMp ? !!mpHolder : canHost);
    this.footEl.append(
      button(isMp ? 'Anahtarı Yerleştir' : 'Zindana Gir', () => (isMp && mpHolder ? this.startMythicPlus(mpHolder) : this.startNormal()), {
        variant: 'primary', cls: 'pg-big', icon: isMp ? '/assets/icons/item-keystone.svg' : '/assets/icons/ui-portal.svg', disabled: !ok,
      }),
      button('Kapat', () => this.requestClose(), { variant: 'ghost' }),
    );
  }

  /** The four difficulty cards of one dungeon with their ladder state (GDD_OPENWORLD §7.5). Mitik+ only when a key exists. */
  private difficultyCards(def: DungeonDef | undefined, party: KeystoneData[]): DiffCard[] {
    const ch = G.character;
    if (!def || !ch) return [];
    const defs: { id: Diff; name: string; desc: string; ladder: LadderDiff }[] = [
      { id: 'normal', name: DIFFICULTY_NAMES.normal, ladder: 'normal', desc: 'Düşman seviyesi grubun ortalamasına göre ayarlanır. Bilgelik sunakları ve şampiyon sürüleri seni bekler.' },
      { id: 'heroic', name: DIFFICULTY_NAMES.heroic, ladder: 'heroic', desc: 'Düşmanlar 50-60 seviye. Daha çok şampiyon sürüsü, daha iyi ganimet ve set eşyaları düşer.' },
      { id: 'mythic', name: DIFFICULTY_NAMES.mythic, ladder: 'mythic', desc: 'Düşmanlar 60. seviye. Bitirince ilk Mitik+ anahtarını kazanırsın.' },
      { id: 'mplus', name: DIFFICULTY_NAMES.mythicplus, ladder: 'mythicplus', desc: 'Anahtarın: süre, eklentiler ve puan. Düşmanlar 60. seviye.' },
    ];
    const out: DiffCard[] = [];
    for (const x of defs) {
      const st = difficultyState(def, x.ladder, ch, party, CLEAR_GATES_OFF);
      if (x.ladder === 'mythicplus' && st.kind === 'locked_key') continue;
      const name = x.ladder === 'mythicplus' && st.key ? `Mitik+ +${st.key.level}` : x.name;
      out.push({ ...x, name, st, enemy: this.enemyLevelFor(def, x.id), recommended: false });
    }
    // recommended overlay: the startable card whose enemy level is closest to the character's level
    let best: DiffCard | null = null;
    for (const c of out) if (isStartable(c.st) && (!best || Math.abs(c.enemy - ch.level) < Math.abs(best.enemy - ch.level))) best = c;
    if (best) best.recommended = true;
    return out;
  }

  /** Description of an open card; Mitik 0 shows the best stored clear time. */
  private cardDesc(def: DungeonDef, c: DiffCard): string {
    if (c.ladder === 'mythic' && c.st.kind === 'cleared') {
      const best = bestM0Sec(def);
      return best ? `${c.desc} En iyi süre ${mmss(best)}.` : c.desc;
    }
    return c.desc;
  }

  /* ---- tab: services (Anahtar Ustası Yaşar) ---- */
  private renderSvcTab(): void {
    const main = this.mainEl;
    const ch = G.character;
    if (!ch) {
      main.append(h('div.pg-empty', null, 'Karakter seçilmedi.'));
      return;
    }
    const key = this.myKey();
    const gold = ch.save.gold;
    main.append(
      h('div.pg-svc-intro', null, icon('/assets/icons/ui-key-upgrade.svg', 'pg-svc-introico'), h('p', null, '"Anahtar bir kapıdır, ama hangi kapının açılacağını sen seçersin." ', h('small', null, '— Anahtar Ustası Yaşar'))),
      key
        ? h('div.pg-svc-key', null, icon('/assets/icons/item-keystone.svg'), h('span', null, `Anahtarın: ${dungeonName(key.dungeonId)} `, h('b', null, `+${key.level}`)), key.depleted ? h('em', null, 'Tükenmiş') : null)
        : h('div.pg-svc-key.is-none', null, icon('/assets/icons/item-keystone.svg'), h('span', null, 'Şu an bir anahtarın yok.')),
    );

    // Zindanı Değiştir
    let info = { free: false, cost: 0 };
    try {
      info = G.mplus.changeDungeonInfo();
    } catch {
      /* mythic module not ready */
    }
    const canChange = !!key && (info.free || gold >= info.cost);
    main.append(
      this.svcCard(
        '/assets/icons/ui-portal.svg',
        'Zindanı Değiştir',
        'Anahtarın seviyesi aynı kalır, zindan rastgele değişir.',
        key ? (info.free ? h('span.pg-good', null, 'Ücretsiz (bu hafta anahtarı kullanmadın)') : h('span' + (gold >= info.cost ? '.pg-gold' : '.pg-bad'), null, `${fmtInt(info.cost)} altın`)) : h('span.pg-dim', null, 'Anahtar gerekli'),
        button('Değiştir', () => void this.doChange(), { variant: 'normal', disabled: !canChange }),
      ),
    );

    // Seviyeyi Düşür
    const canLower = !!key && key.level > MIN_KEY_LEVEL;
    main.append(
      this.svcCard(
        '/assets/icons/ui-upgrade-fail.svg',
        'Seviyeyi Düşür',
        `Anahtar seviyesi 1 azalır (en az +${MIN_KEY_LEVEL}). Zorlandığında işe yarar.`,
        h('span.pg-good', null, 'Ücretsiz'),
        button('Düşür', () => void this.doLower(), { variant: 'normal', disabled: !canLower }),
      ),
    );

    // Anahtar Ver (weekly +2 safety net)
    const flags = ch.save.flags;
    const claimedThisWeek = flags.weeklyKeyWeek === currentWeek();
    let reason = '';
    if (key) reason = 'Zaten bir anahtarın var.';
    else if (ch.level < 60) reason = 'Seviye 60 gerekli.';
    else if (!flags.clearedM0) reason = 'Önce bir zindanı Mitik 0 zorluğunda bitir.';
    else if (claimedThisWeek) reason = 'Bu haftaki anahtarını zaten aldın.';
    main.append(
      this.svcCard(
        '/assets/icons/item-keystone.svg',
        'Anahtar Ver',
        'Anahtarı olmayan ve daha önce bir Mitik 0 bitirmiş seviye 60 kahramanlara haftada bir ücretsiz +2 anahtar verilir.',
        reason ? h('span.pg-dim', null, reason) : h('span.pg-good', null, 'Ücretsiz'),
        button('Anahtarı Al', () => this.doWeeklyKey(), { variant: reason ? 'normal' : 'primary', disabled: !!reason }),
      ),
    );

    // Haftalık Ekler
    main.append(h('div.pg-h', { style: { marginTop: '16px' } }, 'Haftalık Ekler'));
    let tables: { week: number; startsAt: number; rows: { level: number; affixes: AffixId[] }[] }[] = [];
    try {
      tables = G.mplus.weeklyAffixTable(2);
    } catch {
      tables = [];
    }
    if (!tables.length) main.append(h('div.pg-empty', null, 'Eklenti verisi yok.'));
    tables.forEach((t, i) => {
      const wrap = h('div.pg-mi-aff.pg-svc-aff');
      wrap.append(h('div.pg-mi-affrow.pg-svc-affhead', null, h('span.lv', null, i === 0 ? 'Bu Hafta' : 'Gelecek Hafta'), h('span', null, new Date(t.startsAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })), h('span')));
      let prev: AffixId[] = [];
      for (const r of t.rows) {
        const add = r.affixes.filter((a) => !prev.includes(a));
        prev = r.affixes;
        wrap.append(h('div.pg-mi-affrow', null, h('span.lv', null, `+${r.level}`), affixChips(add, i > 0), h('span')));
      }
      main.append(wrap);
    });

    this.footEl.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
  }

  private svcCard(ico: string, title: string, desc: string, cost: HTMLElement, action: HTMLElement): HTMLElement {
    return h('div.pg-svc', null, icon(ico, 'pg-svc-ico'), h('div.pg-svc-txt', null, h('b', null, title), h('span', null, desc), h('div.pg-svc-cost', null, cost)), action);
  }

  private async doChange(): Promise<void> {
    const info = G.mplus.changeDungeonInfo();
    const text = info.free ? 'Anahtarının zindanı rastgele değişsin mi? (Ücretsiz)' : `Anahtarının zindanı rastgele değişsin mi? Bedel: ${fmtInt(info.cost)} altın.`;
    if (!(await askConfirm(this.el, text, 'Değiştir', 'Vazgeç'))) return;
    if (G.mplus.changeKeystoneDungeon()) {
      sfx('keystone_insert');
      const k = this.myKey();
      toast(k ? `Yeni anahtar: ${dungeonName(k.dungeonId)} +${k.level}` : 'Anahtar değişti.', 'success');
    } else {
      sfx('ui_error');
      toast('Yeterli altının yok.', 'warning');
    }
    this.render();
  }

  private async doLower(): Promise<void> {
    const k = this.myKey();
    if (!k) return;
    if (!(await askConfirm(this.el, `Anahtarın +${k.level} seviyesinden +${k.level - 1} seviyesine düşürülsün mü?`, 'Düşür', 'Vazgeç', true))) return;
    if (G.mplus.lowerKeystone()) {
      sfx('keystone_deplete');
      toast(`Anahtar seviyesi +${this.myKey()?.level ?? k.level - 1} oldu.`, 'info');
    } else {
      sfx('ui_error');
    }
    this.render();
  }

  private doWeeklyKey(): void {
    if (G.mplus.claimWeeklyKey()) {
      sfx('keystone_upgrade');
    } else {
      sfx('ui_error');
      toast('Şu an anahtar alamazsın.', 'warning');
    }
    this.render();
  }

  /* ---------------------------------------------------------------- start */

  private baseParams(dungeonId: string, difficulty: DungeonParams['difficulty'], keyLevel: number, keyOwner: string): DungeonParams {
    const party = this.partyInfo();
    const def = DUNGEONS[dungeonId];
    return {
      dungeonId,
      difficulty,
      keyLevel,
      seed: (Math.random() * 0xffffffff) >>> 0,
      affixes: difficulty === 'mythicplus' ? (affixesForLevel(keyLevel) as AffixId[]) : [],
      enemyLevel: this.enemyLevelFor(def, difficulty === 'mythicplus' ? 'mythic' : difficulty),
      partySize: party.size,
      keyOwner: keyOwner || G.net.selfId || 'local',
      ...(this.returnTo ? { returnTo: this.returnTo } : {}),
    };
  }

  /** Start through runStart.ts (shared with the finder): host/offline moves the party, a client asks the host. */
  private go(params: DungeonParams): void {
    this.requestClose();
    startRun(params);
  }

  private startMythicPlus(ho: Holder): void {
    const def = DUNGEONS[ho.key.dungeonId];
    if (!def) return toast('Bu zindan bulunamadı.', 'error');
    sfx('keystone_insert');
    toast(`${def.name} +${ho.key.level} başlıyor...`, 'boss');
    this.go(this.baseParams(ho.key.dungeonId, 'mythicplus', ho.key.level, ho.peerId));
  }

  private startNormal(): void {
    const def = DUNGEONS[this.selDungeon];
    if (!def) return;
    if (this.selDiff === 'mplus') return;
    const diff = this.selDiff === 'normal' ? 'normal' : this.selDiff === 'heroic' ? 'heroic' : 'mythic';
    sfx('portal_enter');
    toast(`${def.name} · ${DIFFICULTY_NAMES[diff]}`, 'info');
    this.go(this.baseParams(def.id, diff, 0, G.net.selfId));
  }
}

/* ------------------------------------------------------------------ small views */

function safeScale(level: number, affixes: AffixId[], boss: boolean): { hp: number; dmg: number } {
  try {
    const s = G.mplus.scalingFor(level, affixes, boss);
    if (s && s.hp > 0) return s;
  } catch {
    /* fall through */
  }
  const mult = level <= 1 ? 1 : level <= 10 ? 1.08 ** (level - 1) : 1.08 ** 9 * 1.1 ** (level - 10);
  return { hp: mult, dmg: mult };
}

function scaleBox(title: string, s: { hp: number; dmg: number }): HTMLElement {
  return h('div.pg-ks-scalebox', null, h('small', null, title), h('b', null, `Can ${pct(s.hp - 1)}`), h('em', null, `Hasar ${pct(s.dmg - 1)}`));
}

export function affixRow(id: AffixId | string): HTMLElement {
  const a = affixView(id);
  const row = h('div.pg-ks-affix', null, icon(a.icon, 'pg-ks-aico'), h('div.pg-ks-atxt', null, h('b', null, a.name, h('i', null, `+${a.minLevel}`)), h('span', null, a.desc)));
  bindTip(row, `<div class="pg-ttip"><div class="pg-ttip-name">${esc(a.name)}</div><div class="pg-ttip-kind">Eklenti · +${a.minLevel} ve üzeri</div><div>${esc(a.desc)}</div></div>`);
  return row;
}
