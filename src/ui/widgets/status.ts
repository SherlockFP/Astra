import { getStatus } from '../../data/statuses';
import { STAT_INFO, type StatBlock, type StatId } from '../../types/stats';
import type { StatusId } from '../../types/skills';
import { ICON } from './dom';

export interface StatusView {
  id: string;
  name: string;
  icon: string;
  kind: 'buff' | 'debuff';
  desc: string;
}

const FALLBACK: Record<string, { name: string; icon: string; kind: 'buff' | 'debuff'; desc?: string }> = {
  stun: { name: 'Sersemletme', icon: 'debuff-stun', kind: 'debuff', desc: 'Hareket edemez ve saldıramaz.' },
  slow: { name: 'Yavaşlatma', icon: 'debuff-slow', kind: 'debuff', desc: 'Hareket hızı düşük.' },
  root: { name: 'Köklenme', icon: 'debuff-root', kind: 'debuff', desc: 'Yerinden kıpırdayamaz.' },
  freeze: { name: 'Donma', icon: 'debuff-freeze', kind: 'debuff', desc: 'Buza hapsedildi.' },
  knockdown: { name: 'Yere Serme', icon: 'debuff-stun', kind: 'debuff', desc: 'Yere devrildi.' },
  silence: { name: 'Susturma', icon: 'debuff-silence', kind: 'debuff', desc: 'Büyü yapamaz.' },
  fear: { name: 'Korku', icon: 'debuff-fear', kind: 'debuff', desc: 'Kontrolsüzce kaçar.' },
  burn: { name: 'Yanma', icon: 'debuff-burn', kind: 'debuff', desc: 'Zamanla ateş hasarı alır.' },
  bleed: { name: 'Kanama', icon: 'debuff-bleed', kind: 'debuff', desc: 'Zamanla fiziksel hasar alır.' },
  poison: { name: 'Zehir', icon: 'debuff-poison', kind: 'debuff', desc: 'Zamanla zehir hasarı alır.' },
  chill: { name: 'Üşüme', icon: 'debuff-chill', kind: 'debuff', desc: 'Buz etkisiyle yavaşlar.' },
  shock: { name: 'Şok', icon: 'debuff-shock', kind: 'debuff', desc: 'Şimşek hasarına açık.' },
  curse: { name: 'Lanet', icon: 'debuff-curse', kind: 'debuff', desc: 'Gölge laneti altında.' },
  sunder: { name: 'Zırh Kırma', icon: 'debuff-armor-break', kind: 'debuff', desc: 'Zırhı azaldı.' },
  shield: { name: 'Kalkan', icon: 'buff-absorb', kind: 'buff', desc: 'Hasarı emer.' },
  haste: { name: 'Hız', icon: 'buff-haste', kind: 'buff', desc: 'Hareket ve saldırı hızı artar.' },
  enrage: { name: 'Öfke', icon: 'buff-strength', kind: 'buff', desc: 'Hasarı artar.' },
  regen: { name: 'Yenilenme', icon: 'buff-regen', kind: 'buff', desc: 'Zamanla can yeniler.' },
  fortify: { name: 'Tahkim', icon: 'buff-defense', kind: 'buff', desc: 'Savunması artar.' },
  invulnerable: { name: 'Yenilmez', icon: 'buff-invulnerable', kind: 'buff', desc: 'Hasar almaz.' },
  stealth: { name: 'Gizlilik', icon: 'buff-stealth', kind: 'buff', desc: 'Düşmanlara görünmez.' },
  empower: { name: 'Güçlenme', icon: 'buff-crit', kind: 'buff', desc: 'Bir sonraki saldırı güçlenir.' },
  bolstered: { name: 'Takviyeli', icon: 'affix-bolstering', kind: 'buff', desc: 'Düşman öldükçe güçlenir.' },
  raging: { name: 'Öfkeli', icon: 'affix-raging', kind: 'buff', desc: 'Düşük canda hasarı artar.' },
  bursting: { name: 'Patlayan', icon: 'affix-bursting', kind: 'debuff', desc: 'Birikir ve zamanla hasar verir.' },
  necrotic: { name: 'Nekrotik', icon: 'affix-necrotic', kind: 'debuff', desc: 'Birikir, iyileşmeyi azaltır.' },
  grievous: { name: 'Ağır Yara', icon: 'affix-grievous', kind: 'debuff', desc: 'Can düşükken kanar.' },
  inspiring: { name: 'İlham', icon: 'affix-inspiring', kind: 'buff', desc: 'Kontrol etkilerinden korunur.' },
  taunt: { name: 'Kışkırtma', icon: 'debuff-marked', kind: 'debuff', desc: 'Kışkırtanı hedef almaya zorlanır.' },
  blind: { name: 'Körlük', icon: 'debuff-blind', kind: 'debuff', desc: 'Saldırıları sık sık ıskalar.' },
  banner: { name: 'Savaş Sancağı', icon: 'buff-aura', kind: 'buff', desc: 'Sancağın yakınında zırh ve kaynak yenilenmesi artar.' },
  blessed: { name: 'Kutsanmış', icon: 'buff-blessing', kind: 'buff', desc: 'Aldığı hasar azalır, saldırı hızı artar.' },
  bloodrage: { name: 'Kan Hiddeti', icon: 'buff-lifesteal', kind: 'buff', desc: 'Verdiği hasarın bir kısmını can olarak geri alır.' },
  venom: { name: 'Ölümcül Zehir', icon: 'debuff-poison', kind: 'buff', desc: 'Her vuruş ek zehir yığını bırakır; zehir hasarı artar.' },
  ambush: { name: 'Pusu', icon: 'buff-crit', kind: 'buff', desc: 'Bir sonraki saldırı kritik vurur.' },
  balance: { name: 'Element Dengesi', icon: 'buff-mana-regen', kind: 'buff', desc: 'Ateş, buz ve şimşek dönüşümlü kullanıldıkça hasar artar.' },
  windrunner: { name: 'Rüzgâr Koşucusu', icon: 'buff-haste', kind: 'buff', desc: 'Hareket, saldırı ve büyü hızı artar.' },
  veil: { name: 'Gölge Peçesi', icon: 'buff-crit', kind: 'buff', desc: 'Kritik vuruş şansı artar.' },
  dancer: { name: 'Gölge Dansı', icon: 'buff-stealth', kind: 'buff', desc: 'Kaçış sırasında gölgeye karışırsın.' },
};

/** Statuses never drawn as icons (internal markers or shown elsewhere). */
const HIDDEN = new Set(['iframes', 'potion_cd', 'fortified_aura', 'tyrannical_aura']);

export function isStatusHidden(id: string): boolean {
  return HIDDEN.has(id);
}

const DOT_TR: Record<string, string> = {
  physical: 'fiziksel', fire: 'ateş', frost: 'buz', lightning: 'şimşek', shadow: 'gölge', poison: 'zehir', holy: 'kutsal', arcane: 'gizem', true: 'saf',
};

/** "+30% Hareket Hızı · -10 Zırh" style summary of a status' per-stack stat modifiers (used when no hand-written text exists). */
function describeMods(stats: StatBlock | undefined, dotType: string | undefined): string {
  const parts: string[] = [];
  if (stats) {
    for (const k of Object.keys(stats)) {
      const id = k as StatId;
      const v = stats[id] ?? 0;
      if (!v) continue;
      const info = STAT_INFO[id];
      const a = Math.abs(v);
      const n = info?.pct ? Math.round(a * 1000) / 10 : Math.round(a * 10) / 10;
      parts.push(`${v > 0 ? '+' : '−'}${String(n).replace('.', ',')}${info?.pct ? '%' : ''} ${info?.name ?? id}`);
    }
  }
  if (dotType) parts.push(`Zamanla ${DOT_TR[dotType] ?? dotType} hasarı verir`);
  return parts.join(' · ');
}

/** Display info for a status id: data/statuses.ts first, then built-in Turkish fallbacks. */
export function statusView(id: StatusId | string): StatusView {
  const hit = VIEW_CACHE.get(id);
  if (hit) return hit;
  const view = buildView(id);
  // only cache real definitions (a later-loaded def should replace a placeholder)
  if (getStatus(id as StatusId) || FALLBACK[id]) VIEW_CACHE.set(id, view);
  return view;
}

const VIEW_CACHE = new Map<string, StatusView>();

function buildView(id: string): StatusView {
  const def = getStatus(id as StatusId) as ({ name?: string; icon?: string; kind?: 'buff' | 'debuff'; desc?: string; stats?: StatBlock; dotType?: string } | undefined);
  const fb = FALLBACK[id];
  const text = def?.desc ?? fb?.desc ?? '';
  const mods = describeMods(def?.stats, def?.dotType);
  return {
    id,
    name: def?.name ?? fb?.name ?? id,
    icon: def?.icon ?? (fb ? ICON(fb.icon) : ICON('buff-aura')),
    kind: def?.kind ?? fb?.kind ?? 'debuff',
    desc: mods ? (text ? `${text} (${mods})` : mods) : text,
  };
}
