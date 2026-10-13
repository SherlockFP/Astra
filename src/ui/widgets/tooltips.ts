import { G } from '../../game/G';
import { describeItem, type ItemDescription } from '../../systems/ItemGen';
import { STAT_INFO, type StatBlock, type StatId } from '../../types/stats';
import { RARITY_COLORS, RARITY_NAMES_TR, type Rarity } from '../../types/common';
import type { ItemInstance } from '../../types/items';
import type { SkillDef } from '../../types/skills';
import type { Actor } from '../../entities/Actor';
import { esc, fmtNum, iconHTML, ICON, DAMAGE_COLORS } from './dom';
import type { StatusView } from './status';
import { trackInfo } from '../../systems/Track';

const TAG_TR: Record<string, string> = {
  melee: 'Yakın Dövüş', spell: 'Büyü', aoe: 'Alan', projectile: 'Mermi', movement: 'Hareket', fire: 'Ateş', frost: 'Buz',
  lightning: 'Şimşek', shadow: 'Gölge', poison: 'Zehir', holy: 'Kutsal', arcane: 'Gizem', physical: 'Fiziksel', buff: 'Güçlendirme',
  ultimate: 'Nihai', channel: 'Kanal', summon: 'Çağırma', dot: 'Zamanla Hasar', ranged: 'Menzilli', stun: 'Sersemletme', defensive: 'Savunma',
  heal: 'İyileştirme', basic: 'Temel Saldırı', combo: 'Kombo',
};

const RES_NAME: Record<string, string> = { rage: 'Öfke', mana: 'Mana', energy: 'Enerji', focus: 'Odak', faith: 'İnanç', essence: 'Öz', fury: 'Gazap' };

function fmtStatValue(id: StatId, v: number, signed = true): string {
  const info = STAT_INFO[id];
  const sign = signed ? (v >= 0 ? '+' : '−') : '';
  const a = Math.abs(v);
  if (info?.pct) return `${sign}${trim(a * 100)}%`;
  return `${sign}${trim(a)}`;
}

function trim(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? fmtNum(r) : r.toFixed(1).replace('.', ',');
}

/** "+12 Güç" style line for a stat id. */
export function statLine(id: StatId, v: number): string {
  const info = STAT_INFO[id];
  return `${fmtStatValue(id, v)} ${info?.name ?? id}`;
}

/** Dev pages may swap the describer to preview tooltips before the items module is wired. */
export const tooltipHooks: { describe: (item: ItemInstance) => ItemDescription } = { describe: (item) => describeItem(item) };

function safeDescribe(item: ItemInstance): ItemDescription | null {
  try {
    return tooltipHooks.describe(item);
  } catch (e) {
    console.warn('[ui] describeItem failed', e);
    return null;
  }
}

/** Stat differences new - old, only those that changed. */
function statDeltas(a: StatBlock, b: StatBlock): { id: StatId; d: number }[] {
  const out: { id: StatId; d: number }[] = [];
  const ids = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  for (const k of ids) {
    const id = k as StatId;
    const d = (a[id] ?? 0) - (b[id] ?? 0);
    if (Math.abs(d) > 1e-6) out.push({ id, d });
  }
  return out;
}

/** WoW-style item tooltip (rarity coloured name, slot, ilvl, damage/armor, implicit, affixes, +N, sockets, set, legendary, flavor, price, deltas). */
export function itemTooltipHTML(item: ItemInstance, compare?: ItemInstance | null, header?: string): string {
  const d = safeDescribe(item);
  const rarity = (d?.rarity ?? item.rarity ?? 'common') as Rarity;
  const color = d?.color && d.color !== '#fff' ? d.color : RARITY_COLORS[rarity] ?? '#fff';
  const name = d?.name ?? item.name ?? item.baseId;
  const lvl = G.character?.level ?? 1;
  let h = `<div class="it r-${rarity}${rarity === 'legendary' || rarity === 'set' ? ' special' : ''}" style="--rc:${color}">`;
  if (header) h += `<div class="it-head">${esc(header)}</div>`;
  h += `<div class="it-name">${esc(name)}</div>`;
  h += `<div class="it-sub"><span class="it-rar">${esc(RARITY_NAMES_TR[rarity] ?? rarity)}</span>${d?.slotLabel ? `<span>${esc(d.slotLabel)}</span>` : ''}</div>`;
  if (d) {
    h += `<div class="it-ilvl">Eşya Seviyesi <b>${d.itemLevel}</b></div>`;
    // Loot V3 §9.6: Yiğitlik Yolu line (track name, rank, item level -> cap)
    const tr = trackInfo(item);
    if (tr) h += `<div class="it-ilvl" style="color:${tr.color}">Yiğitlik Yolu: ${esc(tr.name.replace(' Yolu', ''))} ${tr.rank}/${tr.maxRank} (${item.itemLevel} → ${tr.cap})</div>`;
    if (d.damage) {
      h += `<div class="it-dmg"><b>${fmtNum(d.damage.min)} – ${fmtNum(d.damage.max)}</b> Hasar<span class="it-dps">Saniyede ${trim(d.damage.dps)} hasar</span></div>`;
      h += `<div class="it-aps">Saldırı hızı <b>${d.damage.aps.toFixed(2).replace('.', ',')}</b></div>`;
    }
    if (d.armor) h += `<div class="it-armor"><b>${fmtNum(d.armor)}</b> Zırh</div>`;
    if (d.stack && d.stack > 1) h += `<div class="it-stack">Yığın: ${d.stack}</div>`;
    if (d.implicitLines.length) {
      h += '<div class="it-sep"></div>';
      for (const l of d.implicitLines) h += `<div class="it-line imp">${esc(l)}</div>`;
    }
    if (d.affixLines.length) {
      h += '<div class="it-sep"></div>';
      for (const a of d.affixLines) {
        const lock = a.locked ? `<span class="ico it-lock" style="--i:url('${ICON('ui-lock')}')"></span>` : '';
        const cls = a.kind === 'unique' ? 'uni' : 'aff';
        h += `<div class="it-line ${cls}">${esc(a.text)}${a.tier ? `<small class="it-tier">T${a.tier}</small>` : ''}${lock}</div>`;
      }
    }
    if (d.upgradeLine) h += `<div class="it-upg">${esc(d.upgradeLine)}</div>`;
    if (d.socketLines.length) {
      h += '<div class="it-sep"></div>';
      for (const s of d.socketLines) {
        const gc = s.color ?? '#444';
        h += `<div class="it-sock${s.gemName ? ' filled' : ''}"><span class="it-gem" style="--gc:${gc}"></span><span>${s.gemName ? `${esc(s.gemName)}${s.text ? ' — ' + esc(s.text) : ''}` : 'Boş Soket'}</span></div>`;
      }
    }
    if (d.setInfo) {
      h += '<div class="it-sep"></div><div class="it-set">';
      h += `<div class="it-set-name">${esc(d.setInfo.name)} <small>(${d.setInfo.pieces.filter((p) => p.owned).length}/${d.setInfo.pieces.length})</small></div>`;
      for (const p of d.setInfo.pieces) h += `<div class="it-set-piece${p.owned ? ' own' : ''}">${esc(p.name)}</div>`;
      h += '<div class="it-set-gap"></div>';
      for (const b of d.setInfo.bonuses) h += `<div class="it-set-bonus${b.active ? ' on' : ''}">(${b.count}) ${esc(b.text)}</div>`;
      h += '</div>';
    }
    if (d.specialLines.length) {
      h += '<div class="it-sep"></div>';
      d.specialLines.forEach((l, i) => {
        // an effect that is not implemented yet is greyed out (its text already ends in "(etkin değil)")
        h += d.specialInactive?.[i] ? `<div class="it-line leg off" style="color:#8f8a80;opacity:.85">${esc(l)}</div>` : `<div class="it-line leg">${esc(l)}</div>`;
      });
    }
    if (d.flavor) h += `<div class="it-flavor">“${esc(d.flavor)}”</div>`;
    h += '<div class="it-sep faint"></div>';
    if (d.requiredLevel > 1) h += `<div class="it-req${lvl < d.requiredLevel ? ' bad' : ''}">Gerekli Seviye ${d.requiredLevel}</div>`;
    if (d.classes && d.classes.length) h += `<div class="it-req cls">Sınıf: ${esc(d.classes.join(', '))}</div>`;
    if (d.sellPrice > 0) h += `<div class="it-sell">Satış Fiyatı <b>${fmtNum(d.sellPrice)}</b>${iconHTML(ICON('item-coins'), 'it-coin')}</div>`;

    if (compare) {
      const c = safeDescribe(compare);
      if (c) {
        const rows: string[] = [];
        if (d.damage && c.damage) {
          const dd = d.damage.dps - c.damage.dps;
          if (Math.abs(dd) > 0.05) rows.push(cmpRow(dd, `${dd > 0 ? '+' : '−'}${trim(Math.abs(dd))} Saniyedeki Hasar`));
        }
        if ((d.armor ?? 0) !== (c.armor ?? 0)) {
          const da = (d.armor ?? 0) - (c.armor ?? 0);
          rows.push(cmpRow(da, `${da > 0 ? '+' : '−'}${fmtNum(Math.abs(da))} Zırh`));
        }
        for (const x of statDeltas(d.totalStats, c.totalStats)) rows.push(cmpRow(x.d, statLine(x.id, x.d)));
        h += `<div class="it-cmp"><div class="it-cmp-head">Kuşanılanla karşılaştırma</div>${rows.length ? rows.join('') : '<div class="it-cmp-row same">Fark yok</div>'}</div>`;
      }
    }
  } else {
    h += '<div class="it-line imp">Bilinmeyen eşya</div>';
  }
  h += '</div>';
  return h;
}

function cmpRow(delta: number, text: string): string {
  return `<div class="it-cmp-row ${delta > 0 ? 'up' : 'down'}"><span class="arr">${delta > 0 ? '▲' : '▼'}</span>${esc(text)}</div>`;
}

/** Estimated damage number for {dmg} placeholders in skill descriptions. */
function estimateDamage(def: SkillDef, actor: Actor | null): number | null {
  const dm = def.damage;
  if (!dm) return null;
  let base = 10;
  if (actor) {
    const spell = def.tags.includes('spell');
    const wMin = actor.getStat('weaponMin'), wMax = actor.getStat('weaponMax');
    const sp = actor.getStat('spellPower');
    base = spell ? Math.max(sp, (wMin + wMax) / 2, 1) : Math.max((wMin + wMax) / 2, 1);
  }
  return Math.round(dm.coef * base + (dm.flat ?? 0));
}

export function skillDescription(def: SkillDef, actor: Actor | null): string {
  const dmg = estimateDamage(def, actor);
  const dur = def.duration ?? def.statuses?.[0]?.duration ?? def.selfStatuses?.[0]?.duration ?? def.channel ?? 0;
  return (def.desc ?? '')
    .replace(/\{dmg\}/g, dmg !== null ? `<b class="tt-num">${fmtNum(dmg)}</b>` : '<b class="tt-num">?</b>')
    .replace(/\{dur\}/g, dur > 0 ? `<b class="tt-num">${trim(dur)}</b> sn` : 'kısa bir süre');
}

export function skillTooltipHTML(def: SkillDef, actor: Actor | null, bindLabel?: string): string {
  const dtype = def.damage?.type;
  const col = dtype ? DAMAGE_COLORS[dtype] ?? '#f0e0b0' : '#e8c46a';
  const resType = actor?.resourceType ?? 'mana';
  const resName = RES_NAME[resType] ?? 'Kaynak';
  let h = `<div class="sk" style="--sc:${col}"><div class="sk-head">${iconHTML(def.icon, 'sk-ico')}<div><div class="sk-name">${esc(def.name)}</div>`;
  const tags = def.tags.map((t) => TAG_TR[t]).filter(Boolean).slice(0, 4);
  h += `<div class="sk-tags">${esc(tags.join(' · '))}</div></div></div>`;
  h += '<div class="sk-row">';
  if (def.cost > 0) h += `<span class="sk-cost">${fmtNum(def.cost)} ${resName}</span>`;
  else if (def.cost < 0) h += `<span class="sk-gain">+${fmtNum(-def.cost)} ${resName}</span>`;
  else h += '<span class="sk-cost free">Bedava</span>';
  if (def.cooldown > 0) h += `<span class="sk-cd">${trim(def.cooldown)} sn bekleme</span>`;
  h += '</div>';
  const meta: string[] = [];
  if (def.castTime > 0) meta.push(`${trim(def.castTime)} sn büyü süresi`);
  else meta.push('Anında');
  if (def.channel) meta.push(`${trim(def.channel)} sn kanal`);
  if (def.range) meta.push(`Menzil ${trim(def.range)} m`);
  if (def.radius) meta.push(`Yarıçap ${trim(def.radius)} m`);
  if (def.charges && def.charges > 1) meta.push(`${def.charges} yük`);
  h += `<div class="sk-meta">${esc(meta.join(' · '))}</div>`;
  h += `<div class="sk-desc">${skillDescription(def, actor)}</div>`;
  if (def.statuses?.length) {
    const sts = def.statuses.map((s) => `${esc(statusNameTr(s.status))} (${trim(s.duration)} sn)`).join(', ');
    h += `<div class="sk-extra">Etki: ${sts}</div>`;
  }
  if (bindLabel) h += `<div class="sk-key">Tuş: <b>${esc(bindLabel)}</b></div>`;
  h += '</div>';
  return h;
}

function statusNameTr(id: string): string {
  const names: Record<string, string> = {
    stun: 'Sersemletme', slow: 'Yavaşlatma', root: 'Köklenme', freeze: 'Donma', knockdown: 'Yere Serme', silence: 'Susturma', fear: 'Korku',
    burn: 'Yanma', bleed: 'Kanama', poison: 'Zehir', chill: 'Üşüme', shock: 'Şok', curse: 'Lanet', sunder: 'Zırh Kırma',
    shield: 'Kalkan', haste: 'Hız', enrage: 'Öfke', regen: 'Yenilenme', fortify: 'Tahkim', invulnerable: 'Yenilmez', stealth: 'Gizlilik', empower: 'Güçlenme',
  };
  return names[id] ?? id;
}

export function statusTooltipHTML(v: StatusView, remaining: number, stacks: number): string {
  const rem = remaining > 0 && remaining < 9999 ? `<div class="st-time">${remaining >= 60 ? Math.floor(remaining / 60) + ' dk ' + Math.round(remaining % 60) + ' sn' : trim(remaining) + ' sn kaldı'}</div>` : '';
  return `<div class="st ${v.kind}"><div class="st-name">${esc(v.name)}${stacks > 1 ? ` <small>x${stacks}</small>` : ''}</div><div class="st-kind">${v.kind === 'buff' ? 'Güçlendirme' : 'Zayıflatma'}</div>${v.desc ? `<div class="st-desc">${esc(v.desc)}</div>` : ''}${rem}</div>`;
}
