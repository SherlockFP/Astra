// CW-04 · Skill loop A checks (COMBAT_WOW §4.3 CW-04): GCD spacing, spell queue window, off-GCD tier. Live checks need a running
// local player (dev/combat.html) and use dev.cast / dev.wait. Pure parts are also covered by dev/combat-sim/wow_queue.mjs.
import { registerWowCheck, type WowCheckResult } from '../combat_wow';
import { G } from '../../game/G';
import { WOW } from '../../combat/feel';
import { gcdFor, isOffGcd } from '../../combat/gcd';

interface DevLike {
  cast(slot: 'rmb' | 'q' | 'e' | 'lmb' | 'r' | 's1' | 's2' | 's3' | 's4' | 'm45' | 'm90' | 'm180', atNearest?: boolean): unknown;
  wait(sec: number): Promise<void>;
}

function devApi(): DevLike | null {
  const d = (window as unknown as { dev?: DevLike }).dev;
  return d && typeof d.cast === 'function' && typeof d.wait === 'function' ? d : null;
}

function noPlayer(): WowCheckResult {
  return { ok: false, msg: 'yerel oyuncu yok (dev/combat.html içinde çalıştırın)' };
}

// Static: the constants match Appendix A and the tier function.
registerWowCheck({
  id: 'cw04.constants',
  run: () => {
    const ok = WOW.gcd.profile === 'arpg' && WOW.gcd.arpg.base === 1 && WOW.queue.window === 0.4 && WOW.queue.ttl === 0.8
      && WOW.lead.instant === 0.14 && WOW.lead.basic === 0.17 && WOW.lead.min === 0.08;
    const major = isOffGcd({ tags: [], defaultSlot: 'm90' }) && gcdFor('arpg', 'mage', 1, { tags: [], defaultSlot: 'm90' }) === 0;
    return ok && major ? { ok: true, msg: 'WOW sabiti Appendix A ile aynı; majörler off-GCD' } : { ok: false, msg: 'WOW sabiti veya off-GCD majör kuralı uyuşmuyor' };
  },
});

// Live: a GCD skill started right after another one sets a GCD around gcdFor(...) and reports it through getGcd.
registerWowCheck({
  id: 'cw04.gcd',
  run: async (): Promise<WowCheckResult> => {
    const dev = devApi();
    const p = G.world?.localPlayer;
    if (!dev || !p) return noPlayer();
    dev.cast('rmb');
    const g = G.skills.getGcd(p);
    if (g.total <= 0) return { ok: false, msg: 'rmb GCD başlatmadı (total 0)' };
    const expect = gcdFor(G.settings?.data.gcdProfile ?? 'arpg', p.classId, 1, { tags: [] });
    if (g.total < expect * 0.5 || g.total > 1.6) return { ok: false, msg: `GCD ${g.total.toFixed(2)} s beklenmedik` };
    return { ok: true, msg: `GCD ${g.total.toFixed(2)} s (hız 1.0 taban ${expect.toFixed(2)} s)` };
  },
});

// Live: a press inside the window is queued (skill:queued); the queued press fires when the GCD ends.
registerWowCheck({
  id: 'cw04.queue',
  run: async (): Promise<WowCheckResult> => {
    const dev = devApi();
    const p = G.world?.localPlayer;
    if (!dev || !p) return noPlayer();
    let queued = 0;
    const unsub = G.events.on('skill:queued', () => { queued++; });
    try {
      dev.cast('rmb');
      const left = G.skills.getGcd(p).remaining;
      if (left <= 0.45) return { ok: false, msg: 'GCD çok kısa; kontrol için tekrar deneyin' };
      await dev.wait(Math.max(0, left - 0.2));
      dev.cast('q');
      if (queued === 0) return { ok: false, msg: '0.2 s erken basış kuyruğa girmedi' };
      return { ok: true, msg: 'pencere içi basış kuyruğa girdi' };
    } finally {
      unsub();
    }
  },
});
