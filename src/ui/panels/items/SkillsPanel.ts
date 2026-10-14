import { G } from '../../../game/G';
import type { EventScope } from '../../../core/EventBus';
import type { ClassId, DamageType } from '../../../types/common';
import { SKILL_SLOT_KEYS, type SkillDef, type SkillSlotKey } from '../../../types/skills';
import { CLASSES } from '../../../data/classes';
import { SKILLS } from '../../../data/skills';
import { STATUSES } from '../../../data/statuses';
import { getSpec } from '../../../data/specs';
import { SIGNATURE_SKILLS, skillSpecsOf } from '../../../data/skillSpecs';
import { ROLE_TR } from '../../../combat/specs';
import { ItemPanel, makeTabs } from './PanelBase';
import { bindTip, drag, esc, fmt, h, iconUrl, sfx, toast } from './common';
import { slotKeyLabel } from '../../widgets/controlHints';

const DMG_COLOR: Record<string, string> = {
  physical: '#e6e6ee', fire: '#ff7a2a', frost: '#6fd8ff', lightning: '#ffe84a', shadow: '#b060ff', poison: '#7cd23a', holy: '#ffe08a', arcane: '#ff6ad8', true: '#ffffff',
};
const DMG_TR: Record<string, string> = {
  physical: 'Fiziksel', fire: 'Ateş', frost: 'Buz', lightning: 'Şimşek', shadow: 'Gölge', poison: 'Zehir', holy: 'Kutsal', arcane: 'Gizem', true: 'Saf',
};
/** The 12-slot bar in the HUD's own order (section 7.4): 9 skills, then the 3 majors. */
const SLOT_ORDER: SkillSlotKey[] = ['lmb', 'rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4', 'm45', 'm90', 'm180'];
/** Skill-book groups (section 7.4). */
type SkGroup = 'bar' | 'learned' | 'spec' | 'locked';
const SK_GROUP_KEY = 'efsun.skillbook.v1';

/** Lower-case, Turkish-aware and diacritic-insensitive text, for the skill search. */
function foldText(s: string): string {
  return s.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const MAIN_STAT: Record<ClassId, 'str' | 'dex' | 'int'> = {
  knight: 'str', barbarian: 'str', mage: 'int', rogue: 'dex',
  monk: 'dex', archer: 'dex', paladin: 'str', necromancer: 'int', warlock: 'int',
  demonhunter: 'dex', evoker: 'int', // CM1 stubs
  priest: 'int', shaman: 'int', druid: 'int', // CLASS SCAFFOLD stubs
};
const RESOURCE_TR: Record<ClassId, string> = {
  knight: 'Kararlılık', barbarian: 'Öfke', mage: 'Mana', rogue: 'Enerji',
  monk: 'Enerji', archer: 'Odak', paladin: 'İnanç', necromancer: 'Öz', warlock: 'Mana',
  demonhunter: 'Gazap', evoker: 'Öz', // CM1 stubs
  priest: 'Mana', shaman: 'Mana', druid: 'Mana', // CLASS SCAFFOLD stubs
};
const TAG_TR: Record<string, string> = {
  melee: 'Yakın', spell: 'Büyü', aoe: 'Alan', projectile: 'Mermi', movement: 'Hareket', fire: 'Ateş', frost: 'Buz', arcane: 'Gizem', lightning: 'Şimşek', shadow: 'Gölge',
  poison: 'Zehir', holy: 'Kutsal', buff: 'Güçlendirme', defensive: 'Savunma', ultimate: 'Ultimate', basic: 'Temel', channel: 'Kanal', dot: 'Zamanla Hasar', stun: 'Sersemletme',
  summon: 'Çağırma', heal: 'İyileştirme', finisher: 'Bitirici', combo: 'Kombo',
};
/** Skills at this unlock level are granted only by a talent-tree node (GDD_TALENTS §1.4). */
const TREE_UNLOCK_LEVEL = 99;

function skillColor(s: SkillDef): string {
  if (s.damage) return DMG_COLOR[s.damage.type] ?? '#e8c46a';
  if (s.heal) return '#6fe08a';
  if (s.tags.includes('movement')) return '#8ad0ff';
  return '#f0d070';
}

function isUltimate(s: SkillDef): boolean {
  return s.tags.includes('ultimate');
}

/** Slot rule: which slots may hold which skill. */
function slotAllows(slot: SkillSlotKey, s: SkillDef, basicId: string | undefined): boolean {
  if (slot === 'lmb') return s.id === basicId || s.tags.includes('basic');
  if (slot === 'r') return isUltimate(s);
  if (isUltimate(s)) return false;
  if (s.id === basicId || s.tags.includes('basic')) return false;
  return true;
}

/** Beceri Kitapları (GDD_OPENWORLD §4.6): the rank cap each book raises a skill to. Read from the skill panel. */
const SKILL_BOOKS: { id: string; short: string; name: string; cap: number }[] = [
  { id: 'beceri_kitabi_1', short: 'Kitap I', name: 'Beceri Kitabı I (Çırak)', cap: 3 },
  { id: 'beceri_kitabi_2', short: 'Kitap II', name: 'Beceri Kitabı II (Usta)', cap: 5 },
  { id: 'beceri_kitabi_3', short: 'Kitap III', name: 'Beceri Kitabı III (Üstat)', cap: 6 },
];

type SkillTab = 'skills' | 'spec';

/**
 * Yetenek Kitabı (K): two tabs. "Beceriler" lists the class kit plus the skills granted by the talent tree (GDD_TALENTS
 * §2.3), with specialisation chips, drag to the action bar. "Uzmanlık" is the read-only spec summary with an "N'de aç"
 * button into the talents window (GDD_TALENTS §5.9).
 */
export class SkillsPanel extends ItemPanel {
  private list!: HTMLDivElement;
  private detail!: HTMLDivElement;
  private barSlots = new Map<SkillSlotKey, HTMLElement>();
  private selected: string | null = null;
  private header!: HTMLDivElement;
  private sig = '';
  private tab: SkillTab = 'skills';
  private skillsView!: HTMLDivElement;
  private specView!: HTMLDivElement;
  private search!: HTMLInputElement;
  private query = '';
  /** Skill ids granted by the committed talent build, read at each refresh and before each placement. */
  private granted = new Set<string>();

  constructor() {
    super('skills', {
      title: 'Yetenek Kitabı',
      icon: 'ui-spellbook.svg',
      width: 780,
      height: 560,
      dock: 'center',
      hints: ['Sürükle: beceriyi yuvaya bırak', 'Çift Tık: hızlı yerleştir'],
    });
  }

  protected build(body: HTMLElement): void {
    const tabs = makeTabs([{ id: 'skills', label: 'Beceriler' }, { id: 'spec', label: 'Uzmanlık' }], (id) => this.showTab(id === 'spec' ? 'spec' : 'skills'));
    body.append(tabs.el);

    this.skillsView = h('div', 'pi-skills');
    const left = h('div', 'pi-sk-left');
    this.header = h('div', 'pi-sk-head');
    this.search = h('input', 'pi-sk-search') as HTMLInputElement;
    this.search.type = 'search';
    this.search.placeholder = 'Ara: ad veya etiket';
    this.search.setAttribute('aria-label', 'Yetenek ara');
    this.search.addEventListener('input', () => {
      this.query = this.search.value;
      this.sig = '';
      this.refresh();
    });
    this.list = h('div', 'pi-sk-list');
    left.append(this.header, this.search, this.list);

    const right = h('div', 'pi-sk-right');
    right.append(h('div', 'pi-sheet-title', 'Yetenek Çubuğu'));
    const bar = h('div', 'pi-sk-bar');
    for (const key of SLOT_ORDER) bar.append(this.makeBarSlot(key));
    right.append(bar);
    right.append(h('div', 'pi-hint', 'Yeteneği çubuktaki bir yuvaya sürükle, ya da seçip yuvaya tıkla. Sağ tık: yuvayı boşalt.'));
    this.detail = h('div', 'pi-sk-detail');
    right.append(this.detail);

    this.skillsView.append(left, right);
    this.specView = h('div', 'pi-sk-spec');
    this.specView.style.display = 'none';
    body.append(this.skillsView, this.specView);
  }

  protected subscribe(s: EventScope): void {
    s.on('skillbar:changed', this.safeRefresh).on('player:levelup', this.safeRefresh).on('player:stats', this.safeRefresh).on('equipment:changed', this.safeRefresh).on('materials:changed', this.safeRefresh)
      .on('talents:changed', this.safeRefresh).on('talents:committed', this.safeRefresh).on('spec:changed', this.safeRefresh).on('loadout:changed', this.safeRefresh);
  }

  private showTab(id: SkillTab): void {
    this.tab = id;
    this.skillsView.style.display = id === 'skills' ? '' : 'none';
    this.specView.style.display = id === 'spec' ? '' : 'none';
    this.sig = '';
    this.refresh();
  }

  /* ------------------------------------------------------------ data */

  /** Reads the committed talent grants into `granted` (called before every use of it). */
  private grantedNow(): Set<string> {
    this.granted = new Set(G.talents?.grantedSkills() ?? []);
    return this.granted;
  }

  /** Unlocked by level, or granted by a talent-tree node (the node is the only unlock of a granted skill). */
  private isUnlocked(s: SkillDef): boolean {
    const c = G.character;
    if (!c) return false;
    return c.level >= s.unlockLevel || this.granted.has(s.id);
  }

  private lockText(s: SkillDef): string {
    return s.unlockLevel >= TREE_UNLOCK_LEVEL ? 'Uzmanlık ağacından açılır' : `Seviye ${s.unlockLevel}'de açılır`;
  }

  private classSkills(): SkillDef[] {
    const c = G.character;
    if (!c) return [];
    const def = CLASSES[c.classId];
    let ids: string[] = [];
    if (def) ids = [...(def.basicAttack ? [def.basicAttack] : []), ...def.skills];
    let out = ids.map((id) => SKILLS[id]).filter((s): s is SkillDef => !!s);
    if (!out.length) out = Object.values(SKILLS).filter((s) => s.classId === c.classId).sort((a, b) => a.unlockLevel - b.unlockLevel);
    // skills granted by the talent tree come after the class kit (GDD_TALENTS §2.3)
    for (const id of this.granted) {
      const s = SKILLS[id];
      if (s && !out.some((x) => x.id === id)) out.push(s);
    }
    return out;
  }

  private basicId(): string | undefined {
    const c = G.character;
    return c ? CLASSES[c.classId]?.basicAttack : undefined;
  }

  private slotOf(skillId: string): SkillSlotKey | null {
    const bar = G.character?.save.skillBar;
    if (!bar) return null;
    for (const k of SKILL_SLOT_KEYS) if (bar[k] === skillId) return k;
    return null;
  }

  /** Put a skill into a slot (with the slot rules, swapping if it already sits elsewhere). */
  private assign(skillId: string, slot: SkillSlotKey): boolean {
    const c = G.character;
    const s = SKILLS[skillId];
    if (!c || !s) return false;
    this.grantedNow();
    if (!this.isUnlocked(s)) {
      toast(s.unlockLevel >= TREE_UNLOCK_LEVEL ? 'Bu yetenek uzmanlık ağacından açılır' : `Bu yetenek ${s.unlockLevel}. seviyede açılır`, 'warning');
      sfx('ui_error');
      return false;
    }
    if (!slotAllows(slot, s, this.basicId())) {
      toast(slot === 'r' ? 'R yuvası sadece Ultimate yetenekler içindir' : slot === 'lmb' ? `${slotKeyLabel('lmb')} yuvası temel saldırıya ayrılmıştır` : isUltimate(s) ? 'Ultimate yetenek sadece R yuvasına konabilir' : 'Bu yetenek bu yuvaya konamaz', 'warning');
      sfx('ui_error');
      return false;
    }
    const from = this.slotOf(skillId);
    if (from === slot) return true;
    const displaced = c.save.skillBar[slot];
    this.place(slot, skillId);
    if (from) {
      const d = displaced ? SKILLS[displaced] : undefined;
      this.place(from, d && slotAllows(from, d, this.basicId()) ? displaced ?? null : null);
    }
    sfx('equip');
    return true;
  }

  /**
   * Writes one bar slot. `CharacterState.setSkillSlot` refuses skills above the character level, which would block a
   * tree-granted skill (unlockLevel 99), so a granted skill is written here with the same rules: one slot per skill,
   * `skillbar:changed`, persist. TODO(items owner): let `setSkillSlot` accept `Talents.grantedSkills()`, then drop this branch.
   */
  private place(slot: SkillSlotKey, skillId: string | null): void {
    const c = G.character;
    if (!c) return;
    const s = skillId ? SKILLS[skillId] : undefined;
    const treeOnly = !!s && s.unlockLevel > c.level && this.granted.has(s.id);
    if (!skillId || !s || !treeOnly) {
      c.setSkillSlot(slot, skillId);
      return;
    }
    if (s.classId !== 'common' && s.classId !== c.classId) return;
    const bar = c.save.skillBar;
    for (const [k, v] of Object.entries(bar)) if (v === skillId && k !== slot) delete bar[k as SkillSlotKey];
    bar[slot] = skillId;
    G.events.emit('skillbar:changed', {});
    c.persist();
  }

  private clearSlot(slot: SkillSlotKey): void {
    const c = G.character;
    if (!c || slot === 'lmb') return;
    if (!c.save.skillBar[slot]) return;
    c.setSkillSlot(slot, null);
    sfx('unequip');
  }

  /** Specialisation picks of a skill (GDD_TALENTS §4.2): the row of each picked tier. */
  private specPicks(skillId: string): { tier: number; name: string }[] {
    const T = G.talents;
    const rows = skillSpecsOf(skillId);
    if (!T || !rows.length) return [];
    const out: { tier: number; name: string }[] = [];
    for (const tier of [1, 2, 3]) {
      const pick = T.skillPick(skillId, tier);
      if (!pick) continue;
      const row = rows.find((r) => r.tier === tier && r.opt === (pick === 1 ? 'A' : 'B'));
      if (row) out.push({ tier, name: row.name });
    }
    return out;
  }

  /** The picks of a skill as chips (GDD_TALENTS §4.6), or null when none is picked. */
  private specChips(skillId: string): HTMLElement | null {
    const picks = this.specPicks(skillId);
    if (!picks.length) return null;
    const row = h('div', 'pi-sd-pick');
    row.title = 'Beceri uzmanlığı seçimleri';
    for (const p of picks) {
      const chip = h('span', 'pi-tag', p.name);
      chip.title = `Kademe ${p.tier}`;
      row.append(chip);
    }
    return row;
  }

  /** Pick state of the class's signature skills, for the refresh signature. */
  private pickSig(): string {
    const c = G.character;
    if (!c) return '';
    return (SIGNATURE_SKILLS[c.classId] ?? []).map((id) => [1, 2, 3].map((t) => G.talents?.skillPick(id, t) ?? 0).join('')).join(',');
  }

  /* ------------------------------------------------------------ DOM */

  private makeBarSlot(key: SkillSlotKey): HTMLElement {
    const wrap = h('div', `pi-sk-slotwrap${key === 'r' ? ' ult' : ''}`);
    const slot = h('div', 'pi-slot sz-lg skill empty');
    slot.append(h('div', 'pi-ico none'), h('span', 'pi-skill-key', slotKeyLabel(key)));
    wrap.append(slot, h('div', 'pi-sk-slotlabel', key === 'r' ? 'Ultimate' : key === 'lmb' ? 'Temel' : ''));
    this.barSlots.set(key, slot);
    drag.bindSource(slot, {
      payload: () => {
        const id = G.character?.save.skillBar[key];
        return id && key !== 'lmb' ? { kind: 'skill', skillId: id, from: key } : null;
      },
      onClick: () => {
        const id = G.character?.save.skillBar[key];
        if (this.selected && key !== 'lmb' && this.selected !== id) {
          this.assign(this.selected, key);
        } else if (id) {
          this.selected = id;
          this.refresh();
        }
      },
      onContext: () => this.clearSlot(key),
    });
    drag.zone(slot, {
      accepts: (p) => {
        if (p.kind !== 'skill') return false;
        const s = SKILLS[p.skillId];
        return !!s && slotAllows(key, s, this.basicId()) && this.isUnlocked(s);
      },
      drop: (p) => (p.kind === 'skill' ? this.assign(p.skillId, key) : false),
    });
    bindTip(slot, () => {
      const id = G.character?.save.skillBar[key];
      const s = id ? SKILLS[id] : undefined;
      if (!s) return `<div class="pi-tip-name">${slotKeyLabel(key)} yuvası</div><div class="pi-tip-dim">${key === 'r' ? 'Sadece Ultimate yetenekler.' : key === 'lmb' ? 'Temel saldırı.' : 'Boş. Bir yetenek sürükle.'}</div>`;
      return this.skillTip(s);
    });
    return wrap;
  }

  private skillCard(s: SkillDef): HTMLElement {
    const c = G.character;
    const unlocked = this.isUnlocked(s);
    const fromTree = this.granted.has(s.id);
    const col = skillColor(s);
    const card = h('div', `pi-skill${unlocked ? '' : ' locked'}${this.selected === s.id ? ' sel' : ''}`);
    const ico = h('div', 'pi-slot sz-lg skill');
    ico.style.setProperty('--rc', col);
    const i = h('div', 'pi-ico');
    i.style.setProperty('--ico', `url("${iconUrl(s.icon)}")`);
    ico.append(i);
    const cur = this.slotOf(s.id);
    if (cur) ico.append(h('span', 'pi-skill-key', slotKeyLabel(cur)));
    if (!unlocked) ico.append(h('i', 'pi-skill-lock'));
    const txt = h('div', 'pi-skill-txt');
    const name = h('div', 'pi-skill-name', s.name);
    const rt = c ? RESOURCE_TR[c.classId] : 'Kaynak';
    const parts = [fromTree ? 'Uzmanlık ağacı' : '', s.cooldown ? `BS ${s.cooldown}sn` : '', s.cost > 0 ? `${s.cost} ${rt}` : s.cost < 0 ? `+${-s.cost} ${rt}` : ''];
    const sub = unlocked ? parts.filter(Boolean).join(' · ') : this.lockText(s);
    txt.append(name, h('div', 'pi-skill-sub', sub), h('div', 'pi-skill-desc', this.shortDesc(s)));
    const picks = this.specChips(s.id);
    if (picks) txt.append(picks);
    if (unlocked) txt.append(this.rankPips(s.id));
    card.append(ico, txt);
    bindTip(card, () => this.skillTip(s));
    drag.bindSource(card, {
      payload: () => (unlocked ? { kind: 'skill', skillId: s.id } : null),
      onClick: () => {
        this.selected = s.id;
        sfx('ui_click');
        this.refresh();
      },
      onDouble: () => {
        if (!unlocked) return;
        const target = this.firstSlotFor(s);
        if (target) this.assign(s.id, target);
      },
    });
    return card;
  }

  private firstSlotFor(s: SkillDef): SkillSlotKey | null {
    const c = G.character;
    if (!c) return null;
    const order: SkillSlotKey[] = isUltimate(s) ? ['r'] : ['rmb', 'q', 'e', 's1', 's2', 's3'];
    for (const k of order) if (!c.save.skillBar[k] && slotAllows(k, s, this.basicId())) return k;
    for (const k of order) if (slotAllows(k, s, this.basicId())) return k;
    return null;
  }

  /* ---------------------------------------------------------- numbers */

  private avgWeapon(): number {
    const st = G.character?.stats ?? {};
    const mn = st.weaponMin ?? 0;
    const mx = st.weaponMax ?? 0;
    return (mn + mx) / 2;
  }

  private estimate(s: SkillDef): number | null {
    const c = G.character;
    if (!c || !s.damage) return null;
    const w = this.avgWeapon();
    if (w <= 0) return null;
    const st = c.stats;
    const main = st[MAIN_STAT[c.classId]] ?? 0;
    const inc = 1 + (st.damagePct ?? 0);
    return Math.round((w * s.damage.coef + (s.damage.flat ?? 0)) * (1 + main / 100) * inc);
  }

  private shortDesc(s: SkillDef): string {
    return this.fillDesc(s).replace(/<[^>]+>/g, '');
  }

  /** Replace {dmg} {dur} etc. placeholders in the skill description with real numbers. */
  private fillDesc(s: SkillDef): string {
    const vals: Record<string, string> = {
      dmg: s.damage ? `%${Math.round(s.damage.coef * 100)}` : '',
      dur: String(s.duration ?? s.statuses?.[0]?.duration ?? s.selfStatuses?.[0]?.duration ?? ''),
      cd: String(s.cooldown),
      radius: String(s.radius ?? ''),
      range: String(s.range ?? ''),
      heal: s.heal ? `%${Math.round(s.heal.coef * 100)}` : '',
    };
    for (const [k, v] of Object.entries(s.params ?? {})) vals[k] = String(v);
    return s.desc.replace(/\{(\w+)\}/g, (_m, k: string) => vals[k] ?? '');
  }

  private statusName(id: string): string {
    return (STATUSES as Record<string, { name?: string }>)[id]?.name ?? id;
  }

  private statLines(s: SkillDef): string[] {
    const c = G.character;
    const lines: string[] = [];
    const cdr = Math.min(0.4, c?.stats.cdr ?? 0);
    if (s.cooldown) lines.push(`Bekleme: <b>${s.cooldown}sn</b>${cdr > 0 ? ` <span class="pi-tip-up2">(${(s.cooldown * (1 - cdr)).toFixed(1).replace('.', ',')}sn)</span>` : ''}`);
    const rt = c ? RESOURCE_TR[c.classId] : 'Kaynak';
    if (s.cost > 0) lines.push(`Maliyet: <b>${s.cost} ${rt}</b>`);
    else if (s.cost < 0) lines.push(`Üretir: <b>+${-s.cost} ${rt}</b>`);
    if (s.channel) lines.push(`Kanal süresi: <b>${s.channel}sn</b>`);
    else lines.push(`Kullanım: <b>${s.castTime > 0 ? s.castTime + 'sn büyü süresi' : 'Anlık'}</b>`);
    if (s.range) lines.push(`Menzil: <b>${s.range} m</b>`);
    if (s.radius) lines.push(`Alan: <b>${s.radius} m</b>`);
    if (s.arc) lines.push(`Açı: <b>${s.arc}°</b>`);
    if (s.damage) {
      const t = s.damage.type as DamageType;
      const est = this.estimate(s);
      lines.push(`Hasar: <b style="color:${DMG_COLOR[t] ?? '#fff'}">%${Math.round(s.damage.coef * 100)} silah hasarı (${DMG_TR[t] ?? t})</b>${s.damage.perTick ? ' her vuruşta' : ''}${est ? ` <span class="pi-tip-dim">~${fmt(est)}</span>` : ''}`);
    }
    if (s.heal) lines.push(`İyileştirme: <b class="pi-tip-up2">%${Math.round(s.heal.coef * 100)}</b>`);
    if (s.count && s.count > 1) lines.push(`Mermi sayısı: <b>${s.count}</b>`);
    if (s.pierce) lines.push(`Delme: <b>${s.pierce} hedef</b>`);
    if (s.knockback) lines.push(`Geri itme: <b>${s.knockback} m</b>`);
    for (const st of s.statuses ?? []) lines.push(`Etki: <b>${esc(this.statusName(st.status))}</b> ${st.duration}sn${st.chance !== undefined && st.chance < 1 ? ` (%${Math.round(st.chance * 100)} şans)` : ''}`);
    for (const st of s.selfStatuses ?? []) lines.push(`Kendine: <b>${esc(this.statusName(st.status))}</b> ${st.duration}sn`);
    return lines;
  }

  private skillTip(s: SkillDef): string {
    const col = skillColor(s);
    let out = `<div class="pi-tip-name" style="color:${col}">${esc(s.name)}</div>`;
    const unlocked = this.isUnlocked(s);
    out += `<div class="pi-tip-sub">${unlocked ? 'Açık' : `<span class="pi-tip-bad">${this.lockText(s)}</span>`}${s.tags.length ? ' · ' + s.tags.map((t) => TAG_TR[t] ?? t).slice(0, 4).join(', ') : ''}</div>`;
    for (const l of this.statLines(s)) out += `<div class="pi-tip-line">${l}</div>`;
    const picks = this.specPicks(s.id);
    if (picks.length) out += `<div class="pi-tip-line">Uzmanlık: ${picks.map((p) => `<b>${esc(p.name)}</b>`).join(' · ')}</div>`;
    const d = this.fillDesc(s);
    if (d) out += `<div class="pi-tip-flavor" style="font-style:normal">${esc(d)}</div>`;
    if (unlocked) out += `<div class="pi-tip-hint">Sürükle: çubuğa yerleştir · Çift tık: hızlı yerleştir</div>`;
    return out;
  }

  /* --------------------------------------------------------- refresh */

  protected refresh(): void {
    const c = G.character;
    if (!c) return;
    const granted = this.grantedNow();
    const T = G.talents;
    const skills = this.classSkills();
    const bar = c.save.skillBar;
    const sig = [
      this.tab,
      c.level,
      this.selected,
      JSON.stringify(bar),
      skills.length,
      JSON.stringify(c.stats.weaponMax ?? 0),
      JSON.stringify(c.save.skillRanks),
      SKILL_BOOKS.map((b) => c.material(b.id)).join(','),
      Array.from(granted).join(','),
      this.pickSig(),
      c.save.spec ?? '',
      T ? `${T.pointsSpent('class')}/${T.pointsSpent('spec')}` : '',
    ].join('|');
    if (sig === this.sig) return;
    this.sig = sig;

    const def = CLASSES[c.classId];
    const unlocked = skills.filter((s) => this.isUnlocked(s)).length;
    this.header.replaceChildren(h('span', 'pi-sk-class', def?.name ?? c.classId), h('span', 'pi-sk-count', `${unlocked} / ${skills.length} yetenek açık`));

    this.renderGroups(skills, granted);

    // action bar
    for (const key of SLOT_ORDER) {
      const slot = this.barSlots.get(key);
      if (!slot) continue;
      const id = bar[key];
      const s = id ? SKILLS[id] : undefined;
      const ico = slot.querySelector('.pi-ico') as HTMLElement;
      const keyEl = slot.querySelector('.pi-skill-key');
      if (keyEl) keyEl.textContent = slotKeyLabel(key);
      slot.classList.toggle('empty', !s);
      if (s) {
        slot.style.setProperty('--rc', skillColor(s));
        ico.className = 'pi-ico';
        ico.style.setProperty('--ico', `url("${iconUrl(s.icon)}")`);
      } else {
        slot.style.removeProperty('--rc');
        ico.className = 'pi-ico none';
      }
    }

    // detail card
    if (!this.selected || !SKILLS[this.selected]) this.selected = skills[0]?.id ?? null;
    this.renderDetail();
    this.renderSpec();
  }

  /** Open / closed state of a group, per character (`efsun.skillbook.v1`). Locked skills start collapsed. */
  private isGroupOpen(g: SkGroup): boolean {
    const key = G.character?.save.id ?? 'default';
    try {
      const all = JSON.parse(localStorage.getItem(SK_GROUP_KEY) ?? '{}') as Record<string, Partial<Record<SkGroup, boolean>>>;
      const v = all?.[key]?.[g];
      if (typeof v === 'boolean') return v;
    } catch {
      /* storage unavailable or corrupt: use the defaults */
    }
    return g !== 'locked';
  }

  private setGroupOpen(g: SkGroup, open: boolean): void {
    const key = G.character?.save.id ?? 'default';
    try {
      const all = JSON.parse(localStorage.getItem(SK_GROUP_KEY) ?? '{}') as Record<string, Partial<Record<SkGroup, boolean>>>;
      all[key] = { ...(all[key] ?? {}), [g]: open };
      localStorage.setItem(SK_GROUP_KEY, JSON.stringify(all));
    } catch {
      /* ignore: the group simply reopens next time */
    }
  }

  /**
   * Beceriler list (section 7.4): Çubukta · Öğrenildi (not on the bar, gold "!") · Uzmanlık (talent-tree grants) ·
   * Açılacak (locked, sorted by unlock level, collapsed). The search matches name and tags, diacritic-insensitive.
   */
  private renderGroups(skills: SkillDef[], granted: Set<string>): void {
    this.list.replaceChildren();
    if (!skills.length) {
      this.list.append(h('div', 'pi-empty', 'Bu sınıfın yetenekleri henüz yüklenmedi.'));
      return;
    }
    const q = foldText(this.query.trim());
    const hit = (s: SkillDef): boolean => !q || foldText(s.name).includes(q) || s.tags.some((t) => foldText(TAG_TR[t] ?? t).includes(q));
    const groups: Record<SkGroup, SkillDef[]> = { bar: [], learned: [], spec: [], locked: [] };
    for (const s of skills) {
      if (!hit(s)) continue;
      if (!this.isUnlocked(s)) groups.locked.push(s);
      else if (this.slotOf(s.id)) groups.bar.push(s);
      else if (granted.has(s.id)) groups.spec.push(s);
      else groups.learned.push(s);
    }
    groups.locked.sort((a, b) => a.unlockLevel - b.unlockLevel);
    const sd = G.character ? getSpec(G.character.save.spec ?? null) : undefined;
    const titles: Record<SkGroup, string> = {
      bar: 'Çubukta',
      learned: 'Öğrenildi — çubukta değil',
      spec: sd ? `Uzmanlık: ${sd.name}` : 'Uzmanlık ağacı',
      locked: 'Açılacak',
    };

    if (q && !(groups.bar.length + groups.learned.length + groups.spec.length + groups.locked.length)) {
      this.list.append(h('div', 'pi-empty', `"${this.query.trim()}" ile eşleşen yetenek yok.`));
      return;
    }
    for (const g of ['bar', 'learned', 'spec', 'locked'] as SkGroup[]) {
      const items = groups[g];
      if (!items.length) continue;
      const open = !!q || this.isGroupOpen(g);
      const head = h('button', 'pi-sk-group', h('span', 'pi-sk-arrow', open ? '▾' : '▸'), h('span', '', `${titles[g]} (${items.length})`)) as HTMLButtonElement;
      head.type = 'button';
      if (g === 'learned') {
        head.append(h('b', 'pi-sk-bang', '!'), h('small', 'pi-sk-ghint', 'Sürükleyip yuvaya bırak'));
      }
      head.addEventListener('click', () => {
        this.setGroupOpen(g, !open);
        this.sig = '';
        this.refresh();
      });
      this.list.append(head);
      if (open) for (const s of items) this.list.append(this.skillCard(s));
    }
  }

  /** Skill rank pips (GDD_OPENWORLD §4.6): filled up to the current rank; the cap for this character level is shown dimmer. */
  private rankPips(skillId: string): HTMLElement {
    const c = G.character;
    const rank = c?.save.skillRanks[skillId] ?? 1;
    const cap = Math.min(6, Math.ceil((c?.level ?? 1) / 6) + 1);
    const wrap = h('div', 'pi-sk-ranks');
    for (let i = 1; i <= 6; i++) {
      const pip = h('span', `pi-sk-pip${i <= rank ? ' on' : ''}${i > cap ? ' off' : ''}`);
      wrap.append(pip);
    }
    wrap.title = `Kademe ${rank} / ${cap} (en fazla ${cap} kademeye kadar)`;
    return wrap;
  }

  /** Read a skill book on this skill: one chip per book in the bag, with its rank cap (GDD_OPENWORLD §4.6). */
  private bookRow(s: SkillDef): HTMLElement {
    const c = G.character;
    const wrap = h('div', 'pi-sk-book');
    wrap.append(h('div', 'pi-qtylabel', `Beceri kitabı oku · kademe ${c?.save.skillRanks[s.id] ?? 1}`));
    const books = SKILL_BOOKS.filter((b) => (c?.material(b.id) ?? 0) > 0);
    if (!books.length) {
      wrap.append(h('div', 'pi-hint', 'Envanterinde beceri kitabı yok. Metin ve sandıklardan düşer.'));
      return wrap;
    }
    const row = h('div', 'pi-sd-pick');
    for (const b of books) {
      const chip = h('button', 'pi-chip', `${b.short} (${c?.material(b.id) ?? 0})`);
      chip.title = `${b.name}: ${b.cap}. kademeye kadar yükseltir`;
      chip.addEventListener('click', () => this.readBook(s, b.id));
      row.append(chip);
    }
    wrap.append(row);
    return wrap;
  }

  private readBook(s: SkillDef, bookId: string): void {
    const c = G.character;
    if (!c) return;
    const r = c.readSkillBook(bookId, s.id);
    if (r.ok) {
      sfx('equip');
      toast(`${s.name} kademe ${r.rank}.`, 'success');
    } else {
      sfx('ui_error');
      toast(r.reason ?? 'Kitap okunamadı.', 'warning');
    }
    this.sig = '';
    this.refresh();
  }

  private renderDetail(): void {
    const c = G.character;
    const s = this.selected ? SKILLS[this.selected] : undefined;
    this.detail.replaceChildren();
    if (!c || !s) return;
    const col = skillColor(s);
    const unlocked = this.isUnlocked(s);
    const head = h('div', 'pi-sd-head');
    const ico = h('div', 'pi-slot sz-lg skill');
    ico.style.setProperty('--rc', col);
    const i = h('div', 'pi-ico');
    i.style.setProperty('--ico', `url("${iconUrl(s.icon)}")`);
    ico.append(i);
    const name = h('div', 'pi-sd-name', s.name);
    name.style.color = col;
    const tags = h('div', 'pi-sd-tags');
    for (const t of s.tags.slice(0, 5)) tags.append(h('span', 'pi-tag', TAG_TR[t] ?? t));
    const lvl = unlocked ? (this.granted.has(s.id) ? 'Uzmanlık ağacından açık' : 'Açık') : this.lockText(s);
    head.append(ico, h('div', 'pi-sd-title', name, h('div', 'pi-sd-lvl', lvl), tags));
    const body = h('div', 'pi-sd-body');
    body.innerHTML = this.statLines(s).map((l) => `<div class="pi-sd-line">${l}</div>`).join('');
    const d = this.fillDesc(s);
    const desc = h('div', 'pi-sd-desc', d);
    this.detail.append(head, body, desc);
    const picks = this.specChips(s.id);
    if (picks) this.detail.append(h('div', 'pi-qtylabel', 'Uzmanlık seçimleri'), picks);

    if (unlocked) this.detail.append(this.bookRow(s));
    const slotsFor = SLOT_ORDER.filter((k) => k !== 'lmb' && slotAllows(k, s, this.basicId()));
    if (unlocked && !slotsFor.length) {
      this.detail.append(h('div', 'pi-hint', `Temel saldırı ${slotKeyLabel('lmb')} yuvasına sabittir.`));
    } else if (unlocked) {
      const pick = h('div', 'pi-sd-pick');
      pick.append(h('span', 'pi-qtylabel', 'Yuvaya ata:'));
      const cur = this.slotOf(s.id);
      for (const key of SLOT_ORDER) {
        if (!slotAllows(key, s, this.basicId())) continue;
        if (key === 'lmb') continue;
        const b = h('button', `pi-chip${cur === key ? ' on' : ''}`, slotKeyLabel(key));
        b.addEventListener('click', () => this.assign(s.id, key));
        pick.append(b);
      }
      if (cur && cur !== 'lmb') {
        const x = h('button', 'pi-chip warn', 'Çıkar');
        x.addEventListener('click', () => this.clearSlot(cur));
        pick.append(x);
      }
      this.detail.append(pick);
    }
  }

  private sectionLabel(text: string): HTMLElement {
    const el = h('div', 'pi-qtylabel', text);
    el.style.display = 'block';
    el.style.margin = '10px 0 4px';
    return el;
  }

  /** "Uzmanlık" tab (GDD_TALENTS §5.9): read-only summary of the active spec, with the "N'de aç" button into `N`. */
  private renderSpec(): void {
    const c = G.character;
    const v = this.specView;
    v.replaceChildren();
    if (!c) return;
    const T = G.talents;
    const sd = getSpec(c.save.spec ?? null);

    const head = h('div', 'pi-sk-head');
    head.append(
      h('span', 'pi-sk-class', sd ? sd.name : 'Uzmanlık seçilmedi'),
      h('span', 'pi-sk-count', sd ? ROLE_TR[sd.role] : c.level >= 10 ? 'Seçim bekliyor' : "Seviye 10'da açılır"),
    );
    const info = h('div', 'pi-sd-body');
    const line = (label: string, value: string): void => {
      info.append(h('div', 'pi-sd-line', `${label}: `, h('b', '', value)));
    };
    line('Sınıf Puanı', T ? `${T.pointsSpent('class')} / ${T.pointsTotal('class')}` : '—');
    line('Uzmanlık Puanı', T && sd ? `${T.pointsSpent('spec')} / ${T.pointsTotal('spec')}` : '—');
    line('Ağaçtan açılan beceri', String(this.granted.size));
    v.append(head, info);
    if (sd) v.append(h('div', 'pi-sd-desc', sd.desc));

    v.append(this.sectionLabel('Ağaçtan açılan beceriler'));
    const gr = h('div', 'pi-sd-pick');
    for (const id of Array.from(this.granted)) gr.append(h('span', 'pi-tag', SKILLS[id]?.name ?? id));
    if (!this.granted.size) gr.append(h('div', 'pi-hint', sd ? 'Henüz yok. Uzmanlık ağacındaki beceri düğümleri alındıkça burada görünür.' : 'Uzmanlık seçilince burada görünür.'));
    v.append(gr);

    const sigs = SIGNATURE_SKILLS[c.classId] ?? [];
    if (sigs.length) {
      v.append(this.sectionLabel('Beceri uzmanlıkları'));
      for (const id of sigs) v.append(h('div', 'pi-sd-line', h('b', '', SKILLS[id]?.name ?? id)), this.specChips(id) ?? h('div', 'pi-hint', 'Seçim yok.'));
    }

    const open = h('button', 'pi-chip on', "N'de aç");
    open.title = 'Uzmanlık ve Yetenekler penceresini aç';
    open.addEventListener('click', () => {
      sfx('ui_click');
      G.ui.openPanel('talents', { tab: 'tree' });
    });
    v.append(h('div', 'pi-sd-pick', open));
  }
}
