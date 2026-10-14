import { G } from '../../../game/G';
import type { DungeonDef, FissureThemeId, FissureTier } from '../../../types/dungeons';
import type { DungeonParams } from '../../../scenes/scenes';
import { BOSSES } from '../../../data/enemyKit';
import {
  FISSURE_MODS, FISSURE_THEMES, FISSURE_TIERS, FISSURE_TIER_ORDER, FISSURE_VERSION, THEMES, fissureClearFlag, fissureEnemyLevel, fissureId, fissureUnlock,
  getFissureDef, type FissureSpec,
} from '../../../world/procgen';
import { chip, emptyState } from '../../kit';
import { h, sfx, toast } from './base';
import { buildFissureParams, partyLevels } from './runStart';

/**
 * "Kadim Yarıklar" tab of the Zindan Bulucu (docs/GDD_PROCGEN.md §2, §11.2). Theme cards, difficulty cards with their lock reasons,
 * the enemy level (from the party level), a preview map of the generated layout, the modifiers and "Yeniden Çevir" (new seed).
 * The preview runs the real generator (a few ms, cached by id). Starting goes through runStart.startRun like every other run.
 * OWNER: panels-game module (generator: world/procgen).
 */

export interface FissurePrimary {
  label: string;
  show: boolean;
  disabled: boolean;
  reason: string;
  run: () => void;
}

export interface FissureDeps {
  /** Re-render the finder (selection changed). */
  rerender: () => void;
  inDungeon: () => boolean;
  /** Start the run (finder queue state + startRun + close). */
  launch: (params: DungeonParams, label: string) => void;
}

/** keystone.ts `?unlock` tester switch (skips the clear counts only). */
const CLEAR_GATES_OFF = ((): boolean => {
  try {
    return new URLSearchParams(window.location.search).has('unlock') || window.localStorage.getItem('efsun.unlock') === '1';
  } catch {
    return false;
  }
})();

const rollSeed = (): number => ((Math.random() * 0xffffffff) >>> 0) || 1;
const BANNER: Record<FissureThemeId, string> = {
  crypt: 'linear-gradient(90deg, #0d1a16, #1f3a30)',
  forge: 'linear-gradient(90deg, #1c0a04, #5a2410)',
  frost: 'linear-gradient(90deg, #0c1a28, #2c5878)',
  shadow: 'linear-gradient(90deg, #0e0818, #3a2468)',
};
const TIER_COLOR = ['#6b7280', '#9aa7b8', '#cfd8e3'];

export class FissureTab {
  readonly el: HTMLElement;
  private theme: FissureThemeId | 'random' = 'random';
  private tier: FissureTier = 'n';
  private seed = rollSeed();
  private canvas: HTMLCanvasElement | null = null;

  constructor(private deps: FissureDeps) {
    this.el = h('div.fd-split.fd-fis');
  }

  /** Panel opened: fresh seed, the highest tier the character may open is NOT preselected (Normal is the leveling default). */
  open(): void {
    this.seed = rollSeed();
    if (!this.unlock(this.tier).ok) this.tier = 'n';
  }

  /* ------------------------------------------------------------ state */

  private clears(): Partial<Record<FissureTier, number>> {
    const f = G.character?.save.flags;
    const out: Partial<Record<FissureTier, number>> = {};
    for (const t of FISSURE_TIER_ORDER) out[t] = f && typeof f[fissureClearFlag(t)] === 'number' ? (f[fissureClearFlag(t)] as number) : 0;
    return out;
  }

  /** The theme the rift will use ('random' resolves from the seed). */
  private themeId(): FissureThemeId {
    return this.theme === 'random' ? FISSURE_THEMES[this.seed % FISSURE_THEMES.length] : this.theme;
  }

  private unlock(t: FissureTier): { ok: boolean; reason: string } {
    const lvl = G.character?.level ?? 1;
    return fissureUnlock(t, lvl, this.clears(), CLEAR_GATES_OFF, THEMES[this.themeId()]?.level);
  }

  private level(t: FissureTier = this.tier): number {
    return fissureEnemyLevel(t, partyLevels().avgLevel, THEMES[this.themeId()]?.level);
  }

  private spec(): FissureSpec {
    const theme = this.themeId();
    return { theme, tier: this.tier, level: this.level(), seed: this.seed, v: FISSURE_VERSION };
  }

  private preview(spec: FissureSpec): DungeonDef | undefined {
    try {
      return getFissureDef(fissureId(spec));
    } catch {
      return undefined;
    }
  }

  /* ------------------------------------------------------------ render */

  render(): void {
    const el = this.el;
    el.textContent = '';
    if (!G.character) {
      el.append(emptyState({ icon: '/assets/icons/ui-dungeon.svg', title: 'Karakter yok', text: 'Kadim Yarıklar bir karakterle açılır.' }));
      return;
    }
    const spec = this.spec();
    const def = this.preview(spec);
    el.append(this.themeList(spec), this.detail(spec, def));
    if (def && this.canvas) this.drawMap(this.canvas, def);
  }

  private themeList(spec: FissureSpec): HTMLElement {
    const list = h('div.fd-list.k-scroll');
    list.append(h('div.fd-who', null, `Sv. ${G.character?.level ?? 1} · Kadim Yarık Taşı`), h('div.fd-h', null, 'TEMA'));
    const cards: { id: FissureThemeId | 'random'; name: string; sub: string; lore: string }[] = [
      { id: 'random', name: 'Rastgele', sub: 'Yarık seni seçsin', lore: 'Tema tohuma göre belirlenir.' },
      ...FISSURE_THEMES.map((t) => ({ id: t as FissureThemeId | 'random', name: THEMES[t].name, sub: `Sv. ${THEMES[t].level[0]}–${THEMES[t].level[1]}`, lore: THEMES[t].lore })),
    ];
    for (const c of cards) {
      const sel = c.id === this.theme;
      const b = h(
        'button.fd-card' + (sel ? '.is-sel' : ''),
        { type: 'button', style: { height: '78px' } },
        h('div.fd-art', { style: { backgroundImage: c.id === 'random' ? 'linear-gradient(135deg, #2a2a34, #4a3a6a)' : BANNER[c.id], width: '78px', height: '78px' } }),
        h('div.fd-ctext', null, h('b', null, c.name), h('small', null, c.sub), h('small.fd-dim', null, c.lore)),
      ) as HTMLButtonElement;
      b.addEventListener('click', () => {
        this.theme = c.id;
        sfx('ui_tab');
        this.deps.rerender();
      });
      list.append(b);
    }
    void spec;
    return list;
  }

  private detail(spec: FissureSpec, def: DungeonDef | undefined): HTMLElement {
    const el = h('div.fd-detail.k-scroll');
    const th = THEMES[spec.theme];
    el.append(
      h(
        'div.fd-banner',
        { style: { backgroundImage: `linear-gradient(90deg, rgba(8,8,10,0.55), rgba(8,8,10,0.15)), ${BANNER[spec.theme]}` } },
        h('div.fd-bname', null, th.name),
        h('div.fd-bstats', null, h('span', null, `Düşman Sv. ${spec.level}`), h('span', null, `${FISSURE_TIERS[spec.tier].name}`), h('span', null, def ? `${def.fissure?.rooms ?? 0} oda · ${def.bosses.length} boss` : '')),
      ),
      h('p.fd-lore', null, th.lore),
      h('div.fd-h', null, 'ZORLUK'),
      this.diffGrid(),
    );
    if (def?.fissure) {
      const info = def.fissure;
      const bosses = def.bosses.map((b) => BOSSES[b.bossId]?.name ?? b.bossId);
      const enemies = def.packs.reduce((n, p) => n + p.members.length, 0);
      const floors = new Set(info.tiers).size;
      el.append(
        h('div.fd-h', null, 'YARIK'),
        h(
          'div.fd-lines',
          null,
          h('div', null, `Muhafızlar: ${bosses.slice(0, 2).join(', ')}`),
          h('div', null, `Son Patron: ${bosses[2] ?? '?'}`),
          h('div', null, `Yaklaşık ${enemies} düşman · ${floors} kat · tahmini ${Math.round(8 + info.rooms * 2.2)} dk`),
        ),
      );
      const mods = info.mods.map((m) => {
        const c = chip(FISSURE_MODS[m].name);
        c.title = FISSURE_MODS[m].desc;
        return c;
      });
      el.append(h('div.fd-h', null, 'DEĞİŞTİRİCİLER'), mods.length ? h('div.fd-chips', null, ...mods) : h('div.fd-dim', null, 'Normal zorlukta değiştirici yok.'));
      this.canvas = h('canvas', { width: 360, height: 220, style: { width: '100%', maxWidth: '420px', background: 'var(--bg-0)', border: '1px solid var(--ink)', borderRadius: 'var(--r-1)' } }) as HTMLCanvasElement;
      const reroll = h('button.k-btn', { type: 'button', title: 'Aynı tema ve zorlukta yeni bir yarık üret' }, 'Yeniden Çevir') as HTMLButtonElement;
      reroll.addEventListener('click', () => {
        this.seed = rollSeed();
        sfx('ui_tab', 0.7);
        this.deps.rerender();
      });
      el.append(h('div.fd-h', null, 'HARİTA'), this.canvas, h('div.fd-chips', { style: { marginTop: '8px' } }, reroll));
    } else {
      this.canvas = null;
      el.append(h('div.fd-warn', null, 'Bu yarık üretilemedi. Yeniden çevir.'));
    }
    return el;
  }

  private diffGrid(): HTMLElement {
    const grid = h('div.fd-diffs', { style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } });
    for (const t of FISSURE_TIER_ORDER) {
      const rule = FISSURE_TIERS[t];
      const un = this.unlock(t);
      const cls = [t === this.tier ? 'is-sel' : '', un.ok ? '' : 'is-locked'].filter(Boolean).join('.');
      const b = h(
        'button.fd-diff' + (cls ? `.${cls}` : ''),
        { type: 'button' },
        h('div.fd-dtop', null, h('b', null, rule.name)),
        h('small', null, `Düşman Sv. ${this.level(t)} · ${rule.rooms[0]}–${rule.rooms[1]} oda`),
        h('em', null, un.ok ? (rule.mods ? `${rule.mods} değiştirici` : 'Değiştirici yok') : un.reason),
      ) as HTMLButtonElement;
      b.addEventListener('click', () => {
        if (!un.ok) {
          sfx('ui_error');
          toast(un.reason, 'warning');
          return;
        }
        sfx('ui_tab', 0.7);
        this.tier = t;
        this.deps.rerender();
      });
      grid.append(b);
    }
    return grid;
  }

  /** Layout preview: room rects tinted by floor tier, guardians gold, the final red, start green. */
  private drawMap(cv: HTMLCanvasElement, def: DungeonDef): void {
    const g = cv.getContext('2d');
    const info = def.fissure;
    if (!g || !info) return;
    const W = cv.width, H = cv.height, pad = 8;
    g.clearRect(0, 0, W, H);
    const s = Math.min((W - pad * 2) / def.grid.w, (H - pad * 2) / def.grid.h);
    const ox = (W - def.grid.w * s) / 2, oz = (H - def.grid.h * s) / 2;
    def.rooms.forEach((r, i) => {
      const kind = info.kinds[i];
      const conn = kind === 'corridor' || kind === 'ramp';
      g.fillStyle = TIER_COLOR[Math.min(2, info.tiers[i] ?? 0)];
      g.globalAlpha = conn ? 0.7 : 1;
      g.fillRect(ox + r.rect.x * s, oz + r.rect.z * s, Math.max(1, r.rect.w * s - (conn ? 0 : 0.6)), Math.max(1, r.rect.h * s - (conn ? 0 : 0.6)));
      g.globalAlpha = 1;
      if (kind === 'ramp') {
        g.fillStyle = '#2a2d34';
        g.fillRect(ox + (r.rect.x + r.rect.w / 2) * s - 0.8, oz + (r.rect.z + r.rect.h / 2) * s - 0.8, 1.6, 1.6);
      }
      if (kind === 'guardian' || kind === 'final') {
        g.strokeStyle = kind === 'final' ? '#d04a3a' : '#c9a24a';
        g.lineWidth = 2;
        g.strokeRect(ox + r.rect.x * s + 1, oz + r.rect.z * s + 1, r.rect.w * s - 2, r.rect.h * s - 2);
      } else if (kind === 'treasure') {
        g.fillStyle = '#c9a24a';
        g.fillRect(ox + (r.rect.x + r.rect.w / 2) * s - 2, oz + (r.rect.z + r.rect.h / 2) * s - 2, 4, 4);
      }
    });
    g.fillStyle = '#4fe06a';
    g.beginPath();
    g.arc(ox + (def.start.pos[0] + 0.5) * s, oz + (def.start.pos[1] + 0.5) * s, 3.2, 0, Math.PI * 2);
    g.fill();
  }

  /* ------------------------------------------------------------ start */

  primary(): FissurePrimary {
    const none: FissurePrimary = { label: 'Yarığa Gir', show: true, disabled: true, reason: '', run: () => undefined };
    if (!G.character) return { ...none, reason: 'Karakter yok.' };
    if (this.deps.inDungeon()) return { ...none, label: 'Zindandasın', reason: 'Zindan içindeyken yeni koşu başlatılamaz.' };
    if (G.net.inParty && !G.net.isPartyLeader) return { ...none, label: 'Yarığı oda sahibi açar', reason: 'Yarığı yalnızca oda sahibi (grup lideri) başlatabilir.' };
    const un = this.unlock(this.tier);
    if (!un.ok) return { ...none, reason: un.reason };
    const spec = this.spec();
    if (!this.preview(spec)) return { ...none, reason: 'Yarık üretilemedi: Yeniden Çevir.' };
    return {
      label: 'Yarığa Gir', show: true, disabled: false, reason: '',
      run: () => {
        const params = buildFissureParams(spec);
        this.deps.launch(params, `${THEMES[spec.theme].name} · ${FISSURE_TIERS[spec.tier].name}`);
      },
    };
  }
}
