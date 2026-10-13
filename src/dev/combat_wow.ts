// CW-02 · WoW Savaş dev scaffold (COMBAT_WOW §4.1). Panel "WoW Savaş" + window.dev.wow = { checks, run(id), runAll(), results, log }.
// Check modules live in src/dev/wow/cwNN.ts (auto-loaded, lazily, after window.dev exists). Each registers checks with registerWowCheck().
// Imported once from dev/combat.ts, which assigns window.dev later in its body, so attachment polls for window.dev.

import { gcdFor } from '../combat/gcd';
import { SpellQueue } from '../combat/spellQueue';
import { pushbackAdd, channelCut } from '../combat/castRules';
import { prdC, Prd } from '../combat/prd';

export interface WowCheckResult { ok: boolean; msg: string }
export interface WowCheck { id: string; run: () => WowCheckResult | Promise<WowCheckResult> }
export interface WowApi {
  checks: WowCheck[];
  results: Record<string, WowCheckResult>;
  log: string[];
  run(id: string): Promise<WowCheckResult>;
  runAll(): Promise<Array<WowCheckResult & { id: string }>>;
}

const registry = new Map<string, WowCheck>();
const results: Record<string, WowCheckResult> = {};
const log: string[] = [];

/** Adds (or replaces, by id) a check. Called by src/dev/wow/*.ts at load. */
export function registerWowCheck(c: WowCheck): void {
  registry.set(c.id, c);
}

/** Runs one check; a thrown error becomes a FAIL result (never swallowed silently). */
export async function runWowCheck(id: string): Promise<WowCheckResult> {
  const c = registry.get(id);
  let r: WowCheckResult;
  if (!c) r = { ok: false, msg: 'bilinmeyen kontrol' };
  else {
    try { r = await c.run(); } catch (e) { r = { ok: false, msg: `hata: ${e instanceof Error ? e.message : String(e)}` }; }
  }
  results[id] = r;
  log.push(`${r.ok ? 'PASS' : 'FAIL'} ${id} · ${r.msg}`);
  return r;
}

export async function runAllWowChecks(): Promise<Array<WowCheckResult & { id: string }>> {
  const out: Array<WowCheckResult & { id: string }> = [];
  for (const id of [...registry.keys()]) out.push({ id, ...(await runWowCheck(id)) });
  return out;
}

// ---- CW-02 self-checks (pure modules, no game state) ----
const SPELL = { tags: ['spell', 'fire'] };
const MELEE = { tags: ['melee'] };
const OFF = { tags: ['offgcd'] };

registerWowCheck({
  id: 'cw02.gcd',
  run: () => {
    const rows: Array<[number, number]> = [[1, 1], [1.15, 0.87], [1.3, 0.77], [1.6, 0.63], [2, 0.5]];
    const bad = rows.filter(([s, w]) => Math.abs(gcdFor('arpg', 'mage', s, SPELL) - w) > 0.006).map(([s]) => s);
    if (bad.length) return { ok: false, msg: `uyuşmayan hız: ${bad.join(', ')}` };
    if (gcdFor('arpg', 'knight', 1, OFF) !== 0) return { ok: false, msg: 'off-GCD 0 değil' };
    return { ok: true, msg: 'arpg tablosu ve off-GCD tamam' };
  },
});

registerWowCheck({
  id: 'cw02.queue',
  run: () => {
    const q = new SpellQueue();
    if (q.offer(0.39, { kind: 'skill', skillId: 'a', slot: 'rmb' }, 0) !== 'queued') return { ok: false, msg: '0.39 s kuyruğa girmedi' };
    if (q.offer(0.41, { kind: 'skill', skillId: 'b', slot: 'q' }, 0) !== 'reject') return { ok: false, msg: '0.41 s reddedilmedi' };
    return { ok: true, msg: '0.39 kuyruk / 0.41 red' };
  },
});

registerWowCheck({
  id: 'cw02.pushback',
  run: () => {
    const hit = { hitFrac: 0.1 };
    const a = pushbackAdd(0, hit) === 0.5 && pushbackAdd(1, hit) === 0.5 && pushbackAdd(2, hit) === 0;
    const c = channelCut(4, 0, hit) === 1 && channelCut(4, 2, hit) === 0;
    return a && c ? { ok: true, msg: 'üçüncü vuruş 0, kanal %25 ×2' } : { ok: false, msg: 'pushback/kanal kuralı uyuşmuyor' };
  },
});

registerWowCheck({
  id: 'cw02.prd',
  run: () => {
    // deterministic LCG; 200k trials at 10 %, tolerance ±0.5 %
    let s = 1;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const prd = new Prd();
    const N = 200000;
    let procs = 0;
    for (let i = 0; i < N; i++) if (prd.roll('k', 0.1, rng)) procs++;
    const rate = procs / N;
    const cOk = Math.abs(prdC(0.1) - 0.01475) < 0.0002;
    const ok = cOk && Math.abs(rate - 0.1) <= 0.005;
    return { ok, msg: `C ${prdC(0.1).toFixed(5)} · oran ${(rate * 100).toFixed(2)} %` };
  },
});

// ---- panel ----
function buildPanel(api: WowApi): void {
  const panel = document.createElement('div');
  panel.id = 'wow-panel';
  panel.style.cssText = 'position:fixed;left:8px;top:260px;z-index:9999;background:rgba(10,8,4,.85);color:#f1dfae;font:11px monospace;padding:6px 8px;max-width:320px;max-height:60vh;overflow:auto;';
  document.body.appendChild(panel);

  const title = document.createElement('div');
  title.textContent = 'WoW Savaş';
  title.style.cssText = 'font-weight:bold;margin-bottom:4px;';
  panel.appendChild(title);

  const out = document.createElement('pre');
  out.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;color:#c8e8ff;';
  const render = (): void => {
    out.textContent = Object.entries(api.results)
      .map(([id, r]) => `${r.ok ? 'PASS' : 'FAIL'} ${id} · ${r.msg}`)
      .join('\n') || 'henüz çalıştırılmadı';
  };

  const mkBtn = (label: string, fn: () => Promise<unknown>): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px 2px 2px 0;background:rgba(20,14,6,.9);color:#f1dfae;border:1px solid #7a5a2a;font:11px monospace;cursor:pointer;';
    b.addEventListener('mousedown', (ev) => ev.stopPropagation());
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void fn().then(render);
    });
    panel.appendChild(b);
  };

  mkBtn('Tümünü çalıştır', () => api.runAll());
  for (const c of api.checks) mkBtn(c.id, () => api.run(c.id));

  // Sliders for the WOW constant (Appendix A) are bound only once CW-04 exposes it on globalThis.WOW.
  const cfg = (globalThis as { WOW?: unknown }).WOW;
  const note = document.createElement('div');
  note.textContent = cfg ? 'WOW sabiti bağlı' : 'WOW sabiti henüz yok (CW-04): sliderlar kapalı';
  note.style.cssText = 'margin-top:4px;color:#a89070;';
  panel.append(note, out);
  render();
}

// Lazy load of src/dev/wow/*.ts (each one registers its checks), then the panel. Waits for window.dev from dev/combat.ts.
const wowModules = import.meta.glob('./wow/*.ts');

async function attach(): Promise<void> {
  for (const load of Object.values(wowModules)) {
    try { await load(); } catch (e) { console.error('[dev/wow] load failed', e); }
  }
  const api: WowApi = {
    get checks() { return [...registry.values()]; },
    results,
    log,
    run: runWowCheck,
    runAll: runAllWowChecks,
  };
  (window as unknown as { dev?: { wow?: WowApi } }).dev!.wow = api;
  buildPanel(api);
  console.log(`[dev/wow] ${registry.size} kontrol hazır`);
}

let tries = 0;
const poll = setInterval(() => {
  tries++;
  const dev = (window as unknown as { dev?: object }).dev;
  if (dev) {
    clearInterval(poll);
    void attach();
  } else if (tries > 200) {
    clearInterval(poll);
    console.warn('[dev/wow] window.dev bulunamadı; WoW Savaş paneli açılmadı');
  }
}, 50);
