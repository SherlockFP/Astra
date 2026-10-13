import { G } from '../../../game/G';
import type { QuestDef, QuestState } from '../../../types/quests';
import { MATERIALS } from '../../../data/materials';
import { TOWN } from '../../../data/town';
import { AV_DEFTERI } from '../../../data/avDefteri';
import { getPinnedQuest, setPinnedQuest, worldExtras } from '../../hud/questMarks';
import { GamePanel, bar, button, fmtInt, h, mmss, openPanel, sfx, tabs, windowFrame, type TabsHandle } from './base';
import { emptyState } from '../../kit';

/**
 * Quest log (`questlog`: hotkey L = Input action 'quests', mapped to this id in UI HOTKEYS; the HUD quest tracker opens it on click)
 * and the quest-giver dialog (`dialog`,
 * opened by `quest` NPCs with data `{ npcId, quests }`). Progress and rewards come from G.quests (systems/Quests.ts).
 * The Av Defteri collector (Avcı Yıldız / Avcı Karaca) also gets a section in the dialog (GDD_OPENWORLD §6.4).
 * OWNER: panels-game module.
 */

type LogTab = 'active' | 'available' | 'done';

const LOG_TABS: { id: LogTab; label: string }[] = [
  { id: 'active', label: 'Aktif' },
  { id: 'available', label: 'Alınabilir' },
  { id: 'done', label: 'Tamamlanan' },
];

const RARITY_TR: Record<string, string> = { uncommon: 'Büyülü', rare: 'Nadir', epic: 'Destansı' };
const SLOT_TR: Record<string, string> = { weapon: 'silah', armor: 'zırh', jewelry: 'takı' };
/** Avcı Yıldız and Avcı Karaca hold the Av Defteri (GDD_OPENWORLD §6.4). */
const BIO_NPCS = new Set(['npc_g_avci', 'npc_k_avci']);

/** Reward summary line of a quest (XP share, gold, items, generic items). */
export function rewardLine(def: QuestDef): string {
  const r = def.reward;
  const parts: string[] = [`%${r.xpPct} deneyim`];
  if (r.goldPerLevel) parts.push(`${fmtInt(r.goldPerLevel * def.level)} altın`);
  for (const it of r.items ?? []) parts.push(`${it.count}× ${MATERIALS[it.id]?.name ?? it.id}`);
  for (const g of r.generic ?? []) parts.push(`${RARITY_TR[g.rarity] ?? 'Eşya'} ${SLOT_TR[g.slot ?? 'armor'] ?? 'eşya'}`);
  return parts.join(' · ');
}

/** Turkish quest status badge text and class. */
function stateBadge(s: QuestState): { text: string; cls: string } | null {
  switch (s) {
    case 'active':
      return { text: 'Devam ediyor', cls: 'is-active' };
    case 'ready':
      return { text: 'Teslim et', cls: 'is-ready' };
    case 'available':
      return { text: 'Alınabilir', cls: 'is-avail' };
    case 'done':
      return { text: 'Tamamlandı', cls: 'is-done' };
    default:
      return null;
  }
}

/** Name of a town / village NPC (for dialog titles). */
export function npcNameOf(npcId: string): { name: string; lines: string[] } | null {
  const town = TOWN.npcs.find((n) => n.id === npcId);
  if (town) return { name: town.name, lines: town.lines ?? [] };
  for (const v of worldExtras()?.villages ?? []) {
    const n = v.npcs.find((x) => x.id === npcId);
    if (n) return { name: n.name, lines: n.lines ?? [] };
  }
  return null;
}

/** Region name of a quest's region (or 'Ana Hikaye' / 'Diğer'). */
function groupOf(def: QuestDef): { key: string; label: string; order: number } {
  if (def.main) return { key: 'main', label: 'Kadim Mühür', order: 0 };
  const ext = worldExtras();
  if (def.region) {
    const idx = ext?.regions.findIndex((r) => r.id === def.region) ?? -1;
    const name = ext?.regions.find((r) => r.id === def.region)?.name ?? def.region;
    return { key: def.region, label: name, order: idx < 0 ? 99 : idx + 1 };
  }
  return { key: 'other', label: 'Diğer', order: 98 };
}

/* ------------------------------------------------------------------ */
/* Quest log                                                           */
/* ------------------------------------------------------------------ */

export class QuestLogPanel extends GamePanel {
  private tabsH!: TabsHandle;
  private listEl!: HTMLElement;
  private sumEl!: HTMLElement;
  private tab: LogTab = 'active';

  constructor() {
    super('questlog', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body } = windowFrame({ title: 'Görevler', icon: '/assets/icons/ui-quest.svg', cls: 'pg-questlog', size: 'M', dock: 'left', hints: ['Takip et: takipçi ve ok bu göreve bakar'], onClose: () => this.requestClose() });
    this.tabsH = tabs(LOG_TABS, (id) => {
      this.tab = id as LogTab;
      this.render();
    });
    this.sumEl = h('div.pg-ql-sum');
    this.listEl = h('div.pg-ql-list.pg-scroll');
    body.append(h('div.pg-ql-head', null, this.tabsH.el, this.sumEl), this.listEl);
    this.el.append(win);
  }

  protected onOpen(): void {
    this.listen('quest:updated', () => this.render());
    this.listen('materials:changed', () => this.render());
    this.listen('player:levelup', () => this.render());
    this.render();
  }

  private inTab(s: QuestState): boolean {
    if (this.tab === 'active') return s === 'active' || s === 'ready';
    if (this.tab === 'available') return s === 'available';
    return s === 'done';
  }

  private render(): void {
    const q = G.quests;
    this.tabsH.select(this.tab, true);
    this.listEl.innerHTML = '';
    if (!q || !G.character) {
      this.listEl.append(h('div.pg-empty', null, 'Karakter seçilmedi.'));
      return;
    }
    const all = q.all();
    const counts = { active: 0, available: 0, done: 0 };
    for (const d of all) {
      const s = q.state(d.id);
      if (s === 'active' || s === 'ready') counts.active++;
      else if (s === 'available') counts.available++;
      else if (s === 'done') counts.done++;
    }
    this.sumEl.textContent = `${counts.active} aktif · ${counts.available} alınabilir · ${counts.done} tamamlandı`;

    const groups = new Map<string, { label: string; order: number; defs: QuestDef[] }>();
    for (const d of all) {
      if (!this.inTab(q.state(d.id))) continue;
      const g = groupOf(d);
      const rec = groups.get(g.key) ?? { label: g.label, order: g.order, defs: [] };
      rec.defs.push(d);
      groups.set(g.key, rec);
    }
    if (!groups.size) {
      // section 7.5 copy table
      this.listEl.append(
        this.tab === 'active'
          ? emptyState({ icon: '/assets/icons/ui-quest.svg', title: 'Aktif görevin yok', text: 'Kuzgunkale ve köylerdeki ünlem işaretli kişilerle konuş.', action: { label: 'Ne Yapmalıyım?', onClick: () => openPanel('guide') } })
          : this.tab === 'available'
            ? emptyState({ icon: '/assets/icons/ui-quest.svg', title: 'Şu an alabileceğin görev yok', text: 'Yeni görevler seviye atladıkça açılır.' })
            : emptyState({ icon: '/assets/icons/ui-trophy.svg', title: 'Henüz tamamlanmış görev yok', text: 'Tamamladığın görevler burada listelenir.' }),
      );
      return;
    }
    const pinned = getPinnedQuest();
    const ordered = [...groups.values()].sort((a, b) => a.order - b.order);
    for (const g of ordered) {
      this.listEl.append(h('div.pg-h', null, g.label));
      for (const d of g.defs) this.listEl.append(this.questRow(d, q.state(d.id), pinned === d.id));
    }
  }

  private questRow(def: QuestDef, state: QuestState, pinned: boolean): HTMLElement {
    const q = G.quests;
    const badge = stateBadge(state);
    const ready = state === 'ready';
    const row = h('div.pg-ql-q', { class: (ready ? 'is-ready ' : '') + (pinned ? 'is-pinned' : '') });
    row.append(h('div.pg-ql-top', null, h('b', null, def.name), h('span.pg-ql-lvl', null, `Sv. ${def.level}`), badge ? h('span.pg-ql-badge.' + badge.cls, null, badge.text) : null));
    const text = state === 'available' ? def.text.offer : state === 'ready' ? def.text.done : state === 'done' ? def.text.done : def.text.progress;
    row.append(h('p.pg-ql-text', null, text));
    if (state === 'active' || state === 'ready') {
      const rows = q.progressRows(def.id);
      const list = h('div.pg-ql-objs');
      rows.forEach((r) => {
        const frac = r.need > 0 ? Math.min(1, r.have / r.need) : 1;
        list.append(h('div.pg-ql-obj', { class: r.done ? 'is-done' : '' }, h('span', null, r.text), bar(frac, r.done ? '#62c978' : '#c9a24a', `${Math.min(r.have, r.need)} / ${r.need}`)));
      });
      row.append(list);
    }
    row.append(h('div.pg-ql-rew', null, rewardLine(def)));

    const acts = h('div.pg-ql-acts');
    if (state === 'available') {
      acts.append(
        button('Kabul et', () => {
          if (q.accept(def.id)) this.render();
        }, { variant: 'primary' }),
      );
    } else if (state === 'ready') {
      acts.append(
        button('Teslim et', () => {
          if (q.turnIn(def.id)) this.render();
        }, { variant: 'primary' }),
      );
    }
    if (state === 'active' || state === 'ready') {
      acts.append(
        button('Haritada göster', () => openPanel('map'), { variant: 'ghost' }),
        button(pinned ? 'Takibi bırak' : 'Takip et', () => {
          setPinnedQuest(pinned ? null : def.id);
          sfx('ui_tab');
          this.render();
        }, { variant: 'ghost' }),
      );
    }
    if (acts.childElementCount) row.append(acts);
    return row;
  }
}

/* ------------------------------------------------------------------ */
/* Quest-giver dialog                                                  */
/* ------------------------------------------------------------------ */

export class QuestDialogPanel extends GamePanel {
  private titleEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private npcId = '';
  private extra: string[] = [];
  private acc = 0;
  private hasBio = false;

  constructor() {
    super('dialog', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, titleEl, body, foot } = windowFrame({ title: 'Görev Veren', icon: '/assets/icons/ui-quest.svg', cls: 'pg-dialog', size: 'S', width: '560px', onClose: () => this.requestClose() });
    this.titleEl = titleEl;
    this.bodyEl = h('div.pg-dlg-body.pg-scroll');
    body.append(this.bodyEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(data?: unknown): void {
    const d = (data ?? {}) as { npcId?: string; quests?: string[] };
    this.npcId = d.npcId ?? '';
    this.extra = d.quests ?? [];
    this.hasBio = BIO_NPCS.has(this.npcId);
    this.listen('quest:updated', () => this.render());
    this.listen('materials:changed', () => this.render());
    this.render();
  }

  protected tick(dt: number): void {
    // the Av Defteri cooldown counts down while the dialog is open
    if (!this.hasBio) return;
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    this.render();
  }

  private render(): void {
    const q = G.quests;
    const npc = npcNameOf(this.npcId);
    this.titleEl.textContent = npc?.name ?? 'Görev Veren';
    this.bodyEl.innerHTML = '';
    if (!q || !G.character) {
      this.bodyEl.append(h('div.pg-empty', null, 'Karakter seçilmedi.'));
      return;
    }
    const greet = npc?.lines?.[0] ?? 'Ne istersin, yolcu?';
    this.bodyEl.append(h('div.pg-dlg-say', null, h('i', null, '“' + greet + '”')));

    // quests this NPC offers / takes in: the NPC's list plus anything the quest system says is offered here
    const ids = [...new Set([...this.extra, ...q.offered(this.npcId).map((d) => d.id)])];
    const defs = ids.map((id) => q.def(id)).filter((d): d is QuestDef => !!d);
    if (!defs.length && !this.hasBio) this.bodyEl.append(h('div.pg-empty', null, 'Şu an sana verebileceğim bir görev yok.'));
    for (const def of defs) this.bodyEl.append(this.questBlock(def));
    if (this.hasBio) this.bodyEl.append(this.bioBlock());
  }

  private questBlock(def: QuestDef): HTMLElement {
    const q = G.quests;
    const state = q.state(def.id);
    const level = G.character?.level ?? 1;
    const block = h('div.pg-dlg-q', { class: state === 'locked' ? 'is-locked' : '' });
    block.append(h('div.pg-dlg-qtop', null, h('b', null, def.name), h('span.pg-ql-lvl', null, `Sv. ${def.level}`)));
    if (state === 'locked') {
      const why = level < def.level ? `Bu görev için seviye ${def.level} gerekir.` : 'Önce bir önceki görevi tamamla.';
      block.append(h('p.pg-dim', null, why));
      return block;
    }
    if (state === 'done') {
      block.append(h('p.pg-dim', null, 'Bu görevi tamamladın.'));
      return block;
    }
    if (state === 'available') {
      block.append(h('p', null, def.text.offer), h('div.pg-ql-rew', null, rewardLine(def)));
      block.append(
        h(
          'div.pg-ql-acts',
          null,
          button('Görevi Kabul Et', () => {
            if (q.accept(def.id)) this.render();
          }, { variant: 'primary' }),
        ),
      );
      return block;
    }
    if (state === 'ready') {
      block.append(h('p', null, def.text.done), h('div.pg-ql-rew', null, rewardLine(def)));
      block.append(
        h(
          'div.pg-ql-acts',
          null,
          button('Teslim Et', () => {
            if (q.turnIn(def.id)) this.render();
          }, { variant: 'primary' }),
        ),
      );
      return block;
    }
    // active
    block.append(h('p', null, def.text.progress));
    const list = h('div.pg-ql-objs');
    for (const r of q.progressRows(def.id)) {
      const frac = r.need > 0 ? Math.min(1, r.have / r.need) : 1;
      list.append(h('div.pg-ql-obj', { class: r.done ? 'is-done' : '' }, h('span', null, r.text), bar(frac, r.done ? '#62c978' : '#c9a24a', `${Math.min(r.have, r.need)} / ${r.need}`)));
    }
    block.append(list);
    return block;
  }

  /** Av Defteri (GDD_OPENWORLD §6.4): six steps, one active, 20-minute cooldown between deliveries. */
  private bioBlock(): HTMLElement {
    const q = G.quests;
    const st = q.bioStatus();
    const wrap = h('div.pg-dlg-bio');
    wrap.append(h('div.pg-h', null, 'Av Defteri'), h('p.pg-dim', null, `Tamamlanan adım: ${st.completed} / ${st.total}`));
    if (st.active) {
      const have = Math.min(st.have, st.active.count);
      wrap.append(
        h('p', null, `Adım ${st.active.step}: ${st.active.count} ${MATERIALS[st.active.item]?.name ?? st.active.item} topla (${st.active.sourceText}).`),
        bar(st.active.count ? have / st.active.count : 0, '#c9a24a', `${have} / ${st.active.count}`),
      );
    } else if (st.next) {
      wrap.append(h('p', null, `Sıradaki adım ${st.next.step}: ${st.next.count} ${MATERIALS[st.next.item]?.name ?? st.next.item}. ${st.canAccept ? '' : `Seviye ${st.next.minLevel} gerekir.`}`));
    } else {
      wrap.append(h('p.pg-good', null, 'Av Defteri tamamlandı.'));
    }
    if (st.cooldownSec > 0) wrap.append(h('p.pg-dim', null, `Bir sonraki teslimat için ${mmss(st.cooldownSec)} bekle.`));
    const acts = h('div.pg-ql-acts');
    if (st.canAccept) acts.append(button('Adımı Başlat', () => { if (q.bioAccept()) this.render(); }, { variant: 'primary' }));
    if (st.canDeliver) acts.append(button('Teslim Et', () => { if (q.bioDeliver()) this.render(); }, { variant: 'primary' }));
    if (acts.childElementCount) wrap.append(acts);
    const steps = h('div.pg-bio-steps');
    for (const s of AV_DEFTERI) {
      const done = s.step <= st.completed;
      steps.append(h('div.pg-bio-step', { class: done ? 'is-done' : '' }, h('span', null, `${s.step}. ${s.rewardText}`), h('small', null, `Sv. ${s.minLevel} · ${s.count} ${MATERIALS[s.item]?.name ?? s.item}`)));
    }
    wrap.append(steps);
    return wrap;
  }
}
