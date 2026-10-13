/**
 * GDD_TALENTS §5.10 talents/shared.ts (panels-game, T10): the icon cache and tint helpers moved from the old talents.ts,
 * the node-shape outline helper, ROLE_COLORS, and the TalentTab contract that the shell (talents.ts) drives.
 */
import type { TalentNode } from '../../../../data/talents';
import type { NodeType } from '../../../../types/talents';
import { CLASS_META } from '../base';

/** Tab ids of the window (openPanel('talents', { tab })): tree = 1, web = 2, skills = 3 (GDD_TALENTS §5.1). */
export type TalentTabId = 'tree' | 'web' | 'skills';

/** One tab of the `N` window. The shell builds it once and drives onShow / onHide / refresh / focus. */
export interface TalentTab {
  readonly id: TalentTabId;
  readonly label: string;
  readonly el: HTMLElement;
  /** The tab became visible (its element is shown and the window is open). Start animations, refresh data. */
  onShow(): void;
  /** The tab was hidden (tab switch or window closed). Stop animations, clear hover state. */
  onHide(): void;
  /** True when the tab holds changes that are not applied yet (the window asks before closing). */
  hasDraft(): boolean;
  /** Optional: re-read data while visible (the shell forwards talent events here). */
  refresh?(): void;
  /** Optional: focus a node / slot id given by openPanel('talents', { focus }). */
  focus?(id: string): void;
}

/** Role colours of the spec chip and frames (GDD_TALENTS §5.7). */
export const ROLE_COLORS: Record<string, string> = { tank: '#5aa8ff', healer: '#6fdc8c', dps: '#e0604e' };

/* ------------------------------------------------------------------ */
/* Icon cache (white SVGs tinted on demand)                             */
/* ------------------------------------------------------------------ */

const imgs = new Map<string, HTMLImageElement>();
const ready = new Set<string>();
const tinted = new Map<string, HTMLCanvasElement>();

export function tintedIcon(src: string, color: string): HTMLCanvasElement | null {
  const key = src + '|' + color;
  const hit = tinted.get(key);
  if (hit) return hit;
  let img = imgs.get(src);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.onload = () => ready.add(src);
    img.onerror = () => ready.delete(src);
    img.src = src;
    imgs.set(src, img);
  }
  if (!ready.has(src)) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0, 64, 64);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  tinted.set(key, c);
  return c;
}

const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + '88');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}

/** Pick an icon from the node's own `icon`, its stats or its special id. */
export function iconFor(n: TalentNode): string {
  if (n.icon) return n.icon;
  if (n.kind === 'start' && n.classStart) return CLASS_META[n.classStart]?.icon ?? '/assets/icons/ui-star.svg';
  const ico = (name: string) => `/assets/icons/${name}.svg`;
  const sp = (n.special?.id ?? n.id).toLowerCase();
  if (n.kind === 'keystone') {
    if (sp.includes('glass')) return ico('skill-arcane-orb');
    if (sp.includes('mind')) return ico('skill-mana-shield');
    if (sp.includes('shadow')) return ico('skill-shadow-step');
    if (sp.includes('agony')) return ico('skill-poison-dagger');
    if (sp.includes('blood')) return ico('buff-lifesteal');
    if (sp.includes('berserk')) return ico('skill-berserk');
    if (sp.includes('steady')) return ico('skill-thrust');
    if (sp.includes('fortress') || sp.includes('iron')) return ico('skill-shield-wall');
    return ico('ui-crown');
  }
  const keys = Object.keys(n.stats ?? {});
  const map: [RegExp, string][] = [
    [/^str$/, 'stat-strength'], [/^dex$/, 'stat-dexterity'], [/^int$/, 'stat-intelligence'], [/^vit$/, 'stat-vitality'], [/^allAttr$/, 'ui-star'],
    [/^maxHp|^hpRegen|^hpOn/, 'stat-life'], [/lifeSteal/, 'buff-lifesteal'], [/^maxResource|resource/i, 'stat-mana'],
    [/^fireDamage/, 'skill-fireball'], [/^frostDamage/, 'skill-ice-bolt'], [/^lightningDamage/, 'skill-lightning-bolt'], [/^shadowDamage/, 'skill-curse'],
    [/^poisonDamage/, 'skill-poison-cloud'], [/^holyDamage/, 'skill-holy-light'], [/^arcaneDamage/, 'skill-arcane-orb'], [/^physicalDamage/, 'skill-sword-slash'],
    [/^crit/, 'stat-crit'], [/attackSpeed|castSpeed/, 'stat-attack-speed'], [/^cdr/, 'stat-cooldown'], [/^dot/, 'skill-rend'],
    [/^armor/, 'stat-armor'], [/^block/, 'stat-block'], [/^dodge/, 'stat-dodge'], [/^resFire/, 'stat-fire-resist'], [/^resFrost/, 'stat-cold-resist'],
    [/^resLightning/, 'stat-lightning-resist'], [/^resPoison/, 'stat-poison-resist'], [/^res/, 'stat-armor'], [/^moveSpeed/, 'stat-move-speed'],
    [/goldFind/, 'stat-gold-find'], [/magicFind/, 'stat-magic-find'], [/^xp/, 'ui-level-up'], [/bossDamage/, 'ui-boss'], [/eliteDamage/, 'ui-elite'],
    [/^thorns/, 'buff-thorns'], [/^potion/, 'item-potion-health'], [/^damage|^weapon|^spellPower|^aoe/, 'stat-damage'], [/ccDuration|ccReduction/, 'debuff-stun'],
  ];
  for (const k of keys) for (const [re, name] of map) if (re.test(k)) return ico(name);
  return ico(n.kind === 'notable' ? 'ui-medal' : 'ui-star');
}

/* ------------------------------------------------------------------ */
/* Node shapes (GDD_TALENTS §5.2): outline only, the caller fills and strokes                */
/* ------------------------------------------------------------------ */

/** Adds the outline of a tree node to the current path: P circle, C diamond, M hexagon, A rounded square, K octagon. */
export function nodePath(ctx: CanvasRenderingContext2D, type: NodeType, x: number, y: number, r: number): void {
  ctx.beginPath();
  if (type === 'C') {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  } else if (type === 'M' || type === 'K') {
    const n = type === 'M' ? 6 : 8;
    const off = type === 'M' ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / 8;
    for (let i = 0; i < n; i++) {
      const a = off + (Math.PI * 2 * i) / n;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (type === 'A') {
    const c = r * 0.3;
    ctx.moveTo(x - r + c, y - r);
    ctx.arcTo(x + r, y - r, x + r, y + r, c);
    ctx.arcTo(x + r, y + r, x - r, y + r, c);
    ctx.arcTo(x - r, y + r, x - r, y - r, c);
    ctx.arcTo(x - r, y - r, x + r, y - r, c);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}
