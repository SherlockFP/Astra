import { G } from '../../game/G';
import { getDungeon } from '../../data/dungeons';
import { getEnemyDef } from '../../data/enemies';
import type { AffixId, RunState } from '../../types/mythic';
import type { UI } from '../UI';
import { ICON, div, esc, fmtClock, fmtNum, iconEl, pulse, setClass, setDisplay, setHTML, setStyle, setText } from '../widgets/dom';
import type { HudCtx, HudWidget } from './types';

const AFFIX_FALLBACK: Record<string, { name: string; desc: string }> = {
  fortified: { name: 'Güçlendirilmiş', desc: 'Sıradan düşmanların canı ve hasarı artar.' },
  tyrannical: { name: 'Zalim', desc: 'Patronların canı ve hasarı artar.' },
  bolstering: { name: 'Cesaretlendirici', desc: 'Bir düşman öldüğünde yakındakiler güçlenir.' },
  raging: { name: 'Öfkeli', desc: 'Düşük canlı düşmanlar çok daha sert vurur.' },
  sanguine: { name: 'Kanlı', desc: 'Ölen düşmanlar yerde şifalı kan gölü bırakır.' },
  bursting: { name: 'Patlayan', desc: 'Düşmanlar ölünce oyuncularda birikimli hasar bırakır.' },
  inspiring: { name: 'İlham Verici', desc: 'Bazı düşmanlar çevresindekileri kontrol etkilerinden korur.' },
  volcanic: { name: 'Volkanik', desc: 'Uzaktaki oyuncuların altında lav püskürür.' },
  quaking: { name: 'Sarsıcı', desc: 'Periyodik olarak oyuncuların etrafında yer sarsılır.' },
  explosive: { name: 'Patlayıcı', desc: 'Patlayıcı küreler belirir; hızlıca yok et.' },
  necrotic: { name: 'Nekrotik', desc: 'Yakın dövüşçüler birikimli iyileşme azaltma uygular.' },
  spiteful: { name: 'Kinci', desc: 'Ölen düşmanlar peşinden giden gölgeler bırakır.' },
  storming: { name: 'Fırtınalı', desc: 'Düşmanlar dönen hortumlar oluşturur.' },
  grievous: { name: 'Ağır Yara', desc: 'Canı düşük oyuncular zamanla kanar.' },
  seasonal_efsun: { name: 'Efsun Mevsimi', desc: 'Mevsimlik efsun etkisi.' },
};

const DIFF_TR: Record<string, string> = { normal: 'Normal', heroic: 'Kahraman', mythic: 'Efsanevi', mythicplus: 'Mitik+' };

function affixIcon(id: AffixId): string {
  return ICON('affix-' + (id === 'seasonal_efsun' ? 'seasonal' : id));
}

/** Right-side Mythic+ tracker: dungeon, key level, affixes, timer with +2/+3 thresholds, enemy forces, bosses, deaths. */
export class MythicTracker implements HudWidget {
  readonly el: HTMLElement;
  private nameEl: HTMLElement;
  private keyEl: HTMLElement;
  private diffEl: HTMLElement;
  private affixRow: HTMLElement;
  private timeEl: HTMLElement;
  private limitEl: HTMLElement;
  private thr3: HTMLElement;
  private thr2: HTMLElement;
  private thr1: HTMLElement;
  private barLit: HTMLElement;
  private forcesEl: HTMLElement;
  private forcesPct: HTMLElement;
  private forcesFill: HTMLElement;
  private forcesSub: HTMLElement;
  private forcesFloat: HTMLElement;
  private bossList: HTMLElement;
  private bossSum: HTMLElement;
  private deathEl: HTMLElement;
  private stateEl: HTMLElement;
  private timerBlock: HTMLElement;
  private affixKey = '';
  private bossKey = '';
  private lastForces = -1;
  private lastBossKills = -1;
  private visible = false;
  private timeShown = 0;

  /** True while the run is on screen (the context tracker's `run` mode). */
  get shown(): boolean {
    return this.visible;
  }

  constructor(private ui: UI) {
    this.el = div('mt');
    const head = div('mt-head', this.el);
    this.keyEl = div('mt-key', head);
    const nm = div('mt-names', head);
    this.nameEl = div('mt-name', nm);
    this.diffEl = div('mt-diff', nm);
    this.affixRow = div('mt-affixes', this.el);

    this.timerBlock = div('mt-timer', this.el);
    const trow = div('mt-trow', this.timerBlock);
    this.timeEl = div('mt-time', trow);
    this.limitEl = div('mt-limit', trow);
    this.stateEl = div('mt-state', trow);
    const bar = div('mt-bar', this.timerBlock);
    div('mt-zones', bar);
    this.barLit = div('mt-zones lit', bar);
    div('mt-mark m3', bar);
    div('mt-mark m2', bar);
    const thr = div('mt-thr', this.timerBlock);
    this.thr3 = div('mt-t t3', thr);
    this.thr2 = div('mt-t t2', thr);
    this.thr1 = div('mt-t t1', thr);

    const forces = div('mt-forces', this.el);
    this.forcesEl = forces;
    const fh = div('mt-fhead', forces);
    iconEl(ICON('ui-enemy-forces'), 'mt-fico', fh);
    div('mt-flabel', fh).textContent = 'Düşman Kuvvetleri';
    this.forcesPct = div('mt-fpct', fh);
    const fbar = div('mt-fbar', forces);
    this.forcesFill = div('mt-ffill', fbar);
    div('mt-fshine', fbar);
    this.forcesSub = div('mt-fsub', forces);
    this.forcesFloat = div('mt-ffloat', forces);

    // compact form for md / sm (context tracker): `Boss 2 / 3` replaces the list
    this.bossSum = div('mt-bsum', this.el);
    this.bossList = div('mt-bosses', this.el);
    this.deathEl = div('mt-deaths hud-interactive', this.el);
    this.deathEl.addEventListener('mouseenter', (e) => {
      const st = G.mplus?.state;
      if (!st) return;
      ui.showTooltipFor(this.deathEl, `<div class="st"><div class="st-name">Ölüm Cezası</div><div class="st-desc">Her oyuncu ölümü süreye ${Math.round(st.deaths > 0 ? st.deathPenaltySec / st.deaths : 15)} sn ekler.</div></div>`, e.clientX, e.clientY);
    });
    this.deathEl.addEventListener('mouseleave', () => ui.hideTooltipIf(this.deathEl));
    setDisplay(this.el, false);
  }

  private buildAffixes(st: RunState): void {
    const key = st.affixes.join(',');
    if (key === this.affixKey) return;
    this.affixKey = key;
    this.affixRow.innerHTML = '';
    for (const a of st.affixes) {
      const d = div('mt-affix hud-interactive', this.affixRow);
      iconEl(affixIcon(a), 'mt-aico', d);
      d.addEventListener('mouseenter', (e) => {
        const def = G.mplus?.getAffix(a);
        const fb = AFFIX_FALLBACK[a];
        this.ui.showTooltipFor(d, `<div class="st debuff"><div class="st-name">${esc(def?.name ?? fb?.name ?? a)}</div><div class="st-kind">Mitik+ Etkisi${def?.minLevel ? ` · +${def.minLevel}` : ''}</div><div class="st-desc">${esc(def?.desc ?? fb?.desc ?? '')}</div></div>`, e.clientX, e.clientY);
      });
      d.addEventListener('mouseleave', () => this.ui.hideTooltipIf(d));
    }
  }

  private bossNames(st: RunState): { id: string; name: string }[] {
    const def = getDungeon(st.dungeonId);
    const out: { id: string; name: string }[] = [];
    if (def && def.bosses.length) {
      for (const b of [...def.bosses].sort((a, b) => a.order - b.order)) out.push({ id: b.bossId, name: getEnemyDef(b.bossId)?.name ?? b.bossId });
    } else {
      for (let i = 0; i < st.bossesTotal; i++) out.push({ id: st.bossesKilled[i] ?? 'boss' + i, name: `Patron ${i + 1}` });
    }
    return out;
  }

  update(ctx: HudCtx): void {
    const st = G.mplus?.state;
    const def = st ? getDungeon(st.dungeonId) : undefined;
    const isKey = !!st && st.keyLevel > 0 && st.difficulty === 'mythicplus';
    // open world (outdoor zones): no forces objective and no run to track, so the whole tracker stays hidden there
    const outdoor = !!def?.outdoor;
    const hasForces = !!st && !outdoor && st.forcesRequired > 0;
    const objective = isKey || hasForces || (!!st && !outdoor && st.bossesTotal > 0);
    const show = !!st && !st.failed && objective && (ctx.mode === 'dungeon' || st.started || st.countdown > 0);
    if (show !== this.visible) {
      this.visible = show;
      setDisplay(this.el, show);
      if (show) pulse(this.el, 'enter');
    }
    if (!show || !st) return;
    setText(this.nameEl, def?.name ?? st.dungeonId);
    setText(this.keyEl, isKey ? `+${st.keyLevel}` : '');
    setDisplay(this.keyEl, isKey);
    setText(this.diffEl, isKey ? 'Mitik+ Anahtar Taşı' : (DIFF_TR[st.difficulty] ?? '') + ' Zindan');
    setClass(this.el, 'key', isKey);
    this.buildAffixes(st);
    setDisplay(this.affixRow, st.affixes.length > 0);

    // ---- timer ----
    const T = st.timerSec || def?.timerSec || 0;
    const elapsed = st.elapsed;
    const hasTimer = isKey && T > 0;
    if (!hasTimer) {
      setClass(this.timerBlock, 'plain', true);
      setText(this.timeEl, fmtClock(elapsed));
      setText(this.limitEl, '');
      setText(this.stateEl, st.started ? '' : st.countdown > 0 ? `Başlıyor ${Math.ceil(st.countdown)}` : '');
      setDisplay(this.thr3.parentElement as HTMLElement, false);
      setDisplay(this.timerBlock.querySelector('.mt-bar') as HTMLElement, false);
    } else {
      setClass(this.timerBlock, 'plain', false);
      setDisplay(this.thr3.parentElement as HTMLElement, true);
      setDisplay(this.timerBlock.querySelector('.mt-bar') as HTMLElement, true);
      this.timeShown = elapsed;
      setText(this.timeEl, fmtClock(elapsed));
      setText(this.limitEl, '/ ' + fmtClock(T));
      const t3 = T * 0.6, t2 = T * 0.8;
      let tier = 'g';
      if (elapsed > T) tier = 'r';
      else if (elapsed > t2) tier = 'o';
      else if (elapsed > t3) tier = 'y';
      this.el.dataset.tier = tier;
      setText(this.stateEl, st.completed ? (st.inTime ? `+${Math.max(1, st.upgradeLevels)} TAMAMLANDI` : 'SÜRE AŞILDI') : !st.started ? (st.countdown > 0 ? `Başlıyor ${Math.ceil(st.countdown)}` : '') : elapsed > T ? 'SÜRE DOLDU' : '');
      setText(this.thr3, `+3  ${fmtClock(t3)}`);
      setText(this.thr2, `+2  ${fmtClock(t2)}`);
      setText(this.thr1, `+1  ${fmtClock(T)}`);
      setClass(this.thr3, 'passed', elapsed > t3);
      setClass(this.thr2, 'passed', elapsed > t2);
      setClass(this.thr1, 'passed', elapsed > T);
      const best = elapsed <= t3 ? 't3' : elapsed <= t2 ? 't2' : elapsed <= T ? 't1' : '';
      setClass(this.thr3, 'live', best === 't3');
      setClass(this.thr2, 'live', best === 't2');
      setClass(this.thr1, 'live', best === 't1');
      const f = Math.min(1, elapsed / T);
      setStyle(this.barLit, 'clipPath', `inset(0 ${((1 - f) * 100).toFixed(2)}% 0 0)`);
    }

    // ---- forces (row only where the run has a forces objective: forcesRequired 0 shows "0,00% 0/0" otherwise) ----
    setDisplay(this.forcesEl, hasForces);
    setClass(this.el, 'forces-done', hasForces && st.forces >= st.forcesRequired);
    if (hasForces) {
      const req = st.forcesRequired;
      const pct = Math.min(100, (st.forces / req) * 100);
      setText(this.forcesPct, pct.toFixed(2).replace('.', ',') + '%');
      setStyle(this.forcesFill, 'width', pct.toFixed(2) + '%');
      setText(this.forcesSub, `${fmtNum(st.forces)} / ${fmtNum(st.forcesRequired)}`);
      if (this.lastForces >= 0 && st.forces > this.lastForces) {
        const gain = ((st.forces - this.lastForces) / req) * 100;
        pulse(this.forcesFill, 'gain');
        const f = div('mt-fgain', this.forcesFloat);
        f.textContent = '+' + gain.toFixed(2).replace('.', ',') + '%';
        setTimeout(() => f.remove(), 1400);
      }
    }
    this.lastForces = st.forces;

    // ---- bosses ----
    const names = this.bossNames(st);
    const killed = new Set(st.bossesKilled);
    const bkey = names.map((n) => n.id + (killed.has(n.id) ? '1' : '0')).join('|');
    if (bkey !== this.bossKey) {
      const flashNew = this.lastBossKills >= 0 && st.bossesKilled.length > this.lastBossKills;
      this.bossKey = bkey;
      this.bossList.innerHTML = '';
      names.forEach((n, i) => {
        const k = killed.has(n.id) || (names.length === st.bossesTotal && i < st.bossesKilled.length && !def);
        const row = div('mt-boss' + (k ? ' done' : ''), this.bossList);
        iconEl(ICON(k ? 'ui-check' : 'ui-boss'), 'mt-bico', row);
        const t = div('mt-bname', row);
        t.textContent = n.name;
        if (k && flashNew && i === st.bossesKilled.length - 1) pulse(row, 'flash');
      });
    }
    this.lastBossKills = st.bossesKilled.length;
    setText(this.bossSum, `Boss ${names.filter((n) => killed.has(n.id)).length} / ${names.length}`);

    // ---- deaths ----
    if (isKey) {
      setDisplay(this.deathEl, true);
      setHTML(this.deathEl, `<span class="mt-dico ico" style="--i:url('${ICON('ui-death')}')"></span>Ölüm: <b>${st.deaths}</b>${st.deaths > 0 ? ` <span class="mt-pen">(+${fmtClock(st.deathPenaltySec)})</span>` : ''}`);
      setClass(this.deathEl, 'some', st.deaths > 0);
    } else setDisplay(this.deathEl, false);
    void this.timeShown;
  }

  reset(): void {
    this.affixKey = '';
    this.bossKey = '';
    this.lastForces = -1;
    this.lastBossKills = -1;
  }
}
