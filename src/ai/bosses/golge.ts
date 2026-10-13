import { G } from '../../game/G';
import type { Enemy } from '../../entities/Enemy';
import type { Player } from '../../entities/Player';
import type { BossController } from '../BossController';
import { bossFx, bossMsg, bossMsgTo, bossText, setAlphaAll } from '../bossNet';
import type { BossScript } from './types';
import { angleTo, beam, busyTarget, circle, every, floatOver, makeInvulnerable, partyHp, pickPlayers, playersIn, rad, ring, spawnMech, statusPlayer, TAU } from './kit';

/**
 * Gölge Tapınağı bosses (GDD_CONTENT 4.4.5): Gözcü Nefris, Yutucu Kevvas, İblis Lordu Zakhar.
 * OWNER: enemies module.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Gözcü Nefris
// ---------------------------------------------------------------------------------------------------------------------
function reappearBehind(c: BossController, pid: number | null): void {
  const e = c.e;
  const p = pid != null ? c.world.get<Player>(pid) : undefined;
  if (p && !p.isDead) {
    const bx = p.position.x - Math.sin(p.yaw) * 1.8, bz = p.position.z - Math.cos(p.yaw) * 1.8;
    const spot = c.world.nav.isWalkable(bx, bz) ? { x: bx, z: bz } : c.world.nav.nearestWalkable(bx, bz, 4) ?? { x: bx, z: bz };
    c.teleport(spot.x, spot.z, false);
    e.yaw = angleTo(spot.x, spot.z, p.position.x, p.position.z);
    e.playShot('Dualwield_Melee_Attack_Stab', 1.4, { fade: 0.03 });
  }
  setAlphaAll(e.id, 1);
  bossFx('stealth_smoke', e.position.x, e.position.z, { y: 0.8 });
}

const nefris: BossScript = {
  abilities: {
    /** Gölge Adımı: vanishes, 1 s later reappears behind a random player (purple circle r 2 under them): Arkadan Bıçak coef 3.5. */
    nefris_shadowstep: {
      start(c, b) {
        const t = pickPlayers(c, 1)[0] ?? busyTarget(c, b);
        b.data.pid = t ? t.id : null;
        b.data.back = false;
        b.total = b.delay + 1.0 + 0.7;
      },
      resolve(c, b) {
        const e = c.e;
        const pid = b.data.pid as number | null;
        const t = pid != null ? c.world.get<Player>(pid) : undefined;
        setAlphaAll(e.id, 0);
        bossFx('stealth_smoke', e.position.x, e.position.z, { y: 0.8 });
        if (!t || t.isDead) {
          c.schedule(0.2, () => reappearBehind(c, null), 'shadowstep');
          return;
        }
        c.track(circle(c, t.position.x, t.position.z, 2, 1.0, 3.5, { follow: true, sourceId: t.id, type: 'physical', name: 'Arkadan Bıçak', vfxOnLand: 'shadow_burst' }));
        bossMsgTo(t.id, 'boss_toast', {}, { text: 'Gölge Adımı! Mor çemberden çık!' });
        c.schedule(0.95, () => {
          if (c.e.isDead) return;
          b.data.back = true;
          reappearBehind(c, pid);
        }, 'shadowstep');
      },
      end(c, b) {
        if (!b.data.back && b.resolved) {
          setAlphaAll(c.e.id, 1);
        }
      },
      abort(c) {
        c.cancelTimers('shadowstep');
        setAlphaAll(c.e.id, 1);
      },
    },

    /** Hançer Yelpazesi: 5 lines in a star (72 deg apart, random rotation), 18 x 1.5 m, coef 2.0 + bleed. */
    nefris_fan: {
      start(c, b) {
        const e = c.e;
        const rot = Math.random() * TAU;
        b.data.rot = rot;
        for (let i = 0; i < 5; i++) {
          beam(c, e.position.x, e.position.z, rot + rad(72) * i, 18, 1.5, b.delay, 2.0, {
            type: 'physical', statuses: [{ status: 'bleed', duration: 6, stacks: 1, magnitude: 0.25 }], name: 'Hançer Yelpazesi',
          });
        }
      },
      resolve(c, b) {
        const e = c.e;
        const rot = b.data.rot as number;
        for (let i = 0; i < 5; i++) {
          const a = rot + rad(72) * i;
          bossFx('dagger_projectile', e.position.x, e.position.z, { y: 1.3, dir: [Math.sin(a), Math.cos(a)], to: [e.position.x + Math.sin(a) * 18, 1.1, e.position.z + Math.cos(a) * 18] });
        }
      },
    },

    /** Gölge Klonları (66% / 33%, 15 s): two clones (3x HP, half damage, explode on death). */
    nefris_clones: {
      resolve(c) {
        const e = c.e;
        c.spawnAdds('nefris_clone', 2, { x: e.position.x, z: e.position.z, radius: 3.8, hpMult: 3 * partyHp(c), tag: 'clone' });
        bossFx('shadow_burst', e.position.x, e.position.z, { scale: 1.4 });
        bossMsg('boss_toast', {}, { text: 'Gerçek Nefris\'in gözleri kırmızı! Klonlar 15 saniye yaşar.' });
        c.schedule(15, () => {
          for (const o of c.adds('clone')) {
            if (o.isDead) continue;
            bossFx('stealth_smoke', o.position.x, o.position.z, { y: 0.8 });
            o.escape();
          }
        }, 'clones');
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Yutucu Kevvas
// ---------------------------------------------------------------------------------------------------------------------
const RIFT_SPOTS: [number, number][] = [[32, 10], [38, 10], [35, 15]];

interface Rift { idx: number; x: number; z: number; closeT: number; imp: number; zone: number; armed: boolean }

const kevvas: BossScript = {
  init(c) {
    c.state.rifts = [];
  },
  update(c, dt) {
    const rifts = c.state.rifts as Rift[];
    for (let i = rifts.length - 1; i >= 0; i--) {
      const r = rifts[i];
      const ent = c.adds(`rift:${r.idx}`)[0];
      if (ent && !r.armed) {
        r.armed = true;
        makeInvulnerable(ent);
      }
      if (!ent && r.armed) {
        // removed by something else
        rifts.splice(i, 1);
        continue;
      }
      // standing inside closes it (3 s cumulative); every open rift feeds an imp every 10 s
      if (playersIn(c, r.x, r.z, 3).length > 0) r.closeT += dt;
      if (r.closeT >= 3.0) {
        try {
          G.hitShapes.cancel(r.zone);
        } catch { /* ignore */ }
        bossFx('portal_swirl', r.x, r.z, { scale: 1.2, dur: 1.2 });
        bossFx('shadow_burst', r.x, r.z, { y: 1.2 });
        ent?.escape();
        rifts.splice(i, 1);
        bossMsg('boss_toast', {}, { text: 'Yarık kapandı!' });
        continue;
      }
      r.imp -= dt;
      if (r.imp <= 0) {
        r.imp = 10;
        c.spawnAdds('void_imp', 1, { x: r.x, z: r.z, radius: 1.5, tag: 'imp' });
      }
    }
  },
  onReset(c) {
    for (const r of c.state.rifts as Rift[]) {
      try {
        G.hitShapes.cancel(r.zone);
      } catch { /* ignore */ }
    }
    c.state.rifts = [];
  },
  abilities: {
    /** Boşluk Çekimi: 4 s pull toward him at 6 m/s (r 6 circle around him, coef 1.0 per 0.5 s). */
    kevvas_void_pull: {
      start(c, b) {
        const e = c.e;
        b.total = b.delay + 4 + 0.4;
        c.shape({
          shape: { type: 'circle', radius: 6 }, x: e.position.x, z: e.position.z, dx: 0, dz: 1, delay: b.delay, coef: 1.0, type: 'shadow', telegraph: true,
          persist: { duration: 4, tick: 0.5 }, name: 'Boşluk Çekimi',
        });
      },
      resolve(c) {
        const e = c.e;
        bossMsg('boss_pull', { x: e.position.x, z: e.position.z, speed: 6, dur: 4, stop: 1.8, r: 0 });
        bossFx('shadow_ground', e.position.x, e.position.z, { dur: 4, scale: 3 });
        bossMsg('boss_shake', { i: 0.12, d: 4 });
      },
    },

    /** Boşluk Yarıkları: opens 1 rift (2 with 3+ players); 3 s standing inside closes it, each open rift spawns an imp every 10 s. */
    kevvas_rifts: {
      usable(c) {
        return (c.state.rifts as Rift[]).length < RIFT_SPOTS.length;
      },
      resolve(c) {
        const rifts = c.state.rifts as Rift[];
        const want = c.playersInArena(false).length >= 3 ? 2 : 1;
        const free = RIFT_SPOTS.map((s, idx) => ({ s, idx })).filter((o) => !rifts.some((r) => r.idx === o.idx)).sort(() => Math.random() - 0.5);
        for (const o of free.slice(0, want)) {
          const p = c.gdd(o.s[0], o.s[1]);
          spawnMech(c, 'proc_rift', p, { hpMult: 1, tag: `rift:${o.idx}` });
          const zid = c.track(c.shape({
            shape: { type: 'circle', radius: 3 }, x: p.x, z: p.z, dx: 0, dz: 1, delay: 0.8, coef: 0.8, type: 'shadow', telegraph: false,
            persist: { duration: 300, tick: 1.0 }, name: 'Boşluk Yarığı',
          }));
          rifts.push({ idx: o.idx, x: p.x, z: p.z, closeT: 0, imp: 10, zone: zid, armed: false });
          bossFx('portal_swirl', p.x, p.z, { scale: 1.2, dur: 2 });
        }
        bossMsg('boss_toast', {}, { text: 'Boşluk yarığı açıldı! İçinde 3 saniye durarak kapat.' });
      },
    },

    /** Ziyafet (50%): devours every living imp: +5% HP and +10% damage each. */
    kevvas_feast: {
      resolve(c) {
        const e = c.e;
        let n = 0;
        for (const o of c.adds('imp')) {
          if (o.isDead || o.removed) continue;
          n++;
          bossFx('shadow_burst', o.position.x, o.position.z, { y: 1, scale: 0.8 });
          o.escape();
        }
        if (n > 0) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05 * n);
          c.dmgMul *= Math.pow(1.1, n);
          floatOver(e, `ZİYAFET x${n}`, 1);
        }
        G.vfx.spawn('boss_enrage', e.pointAt(0.5));
        G.events.emit('camera:shake', { intensity: 0.4, duration: 0.5 });
      },
    },

    /** Boşluk Kükremesi: ring inner r 4, outer r 40, coef 3.0: hug the boss. */
    kevvas_roar: {
      start(c, b) {
        const e = c.e;
        ring(c, e.position.x, e.position.z, 4, 40, b.delay, 3.0, { type: 'shadow', name: 'Boşluk Kükremesi', vfxOnLand: 'shadow_burst' });
        bossMsg('boss_toast', {}, { text: 'Boşluk Kükremesi! Boss\'a yapış!' });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: İblis Lordu Zakhar
// ---------------------------------------------------------------------------------------------------------------------
const SOCKETS: [number, number][] = [[15, 6.5], [24, 6.5], [15, 11.5], [24, 11.5]];
const PLATFORMS: [number, number][] = [[15, 3], [24, 3], [15, 10], [24, 10]];

interface Seal { x: number; z: number; id: number }
interface RitChan { remain: number; since: number; started: boolean; resumeAt: number }

function startChannel(c: BossController, o: Enemy, s: RitChan): void {
  const now = c.world.time;
  const dur = Math.max(0.5, s.remain);
  o.cast = { skillId: 'zakhar_ayin', name: 'Karanlık Ayin', start: now, duration: dur, channel: true, interruptible: true };
  s.started = true;
  s.since = now;
  try {
    G.events.emit('enemy:castStart', { enemyId: o.id, abilityId: 'zakhar_ayin', name: 'Karanlık Ayin', castTime: dur, interruptible: true });
    G.net?.broadcast('ecast', { enemyId: o.id, abilityId: 'zakhar_ayin', name: 'Karanlık Ayin', castTime: dur, interruptible: true });
  } catch { /* ignore */ }
  o.playShot('Spellcasting', 1, { loop: true, loopFor: dur + 0.5 });
}

function endRitual(c: BossController): void {
  const st = c.state;
  const e = c.e;
  const live = c.adds('ritual').filter((o) => !o.isDead && !o.removed);
  for (const o of live) {
    o.cast = null;
    bossFx('shadow_burst', o.position.x, o.position.z, { y: 1.2 });
    o.escape();
  }
  for (const o of c.adds('ritual')) o.escape();
  st.ritual = null;
  c.setImmune(false);
  if (live.length) {
    c.dmgMul *= Math.pow(1.15, live.length);
    floatOver(e, `+%${live.length * 15} HASAR`, 1);
    bossMsg('boss_toast', {}, { text: `${live.length} ayin rahibi hayatta kaldı! Zakhar kalıcı olarak güçlendi.` });
  } else bossMsg('boss_toast', {}, { text: 'Ayin bozuldu!' });
  e.anim?.cancelOneShot(0.1);
  c.endMechanicPhase();
}

function resolveSeals(c: BossController): void {
  const st = c.state;
  const seals = (st.seals ?? []) as Seal[];
  st.seals = [];
  const now = c.world.time;
  const a = c.arena;
  for (const s of seals) {
    try {
      G.hitShapes.cancel(s.id);
    } catch { /* ignore */ }
    const inside = playersIn(c, s.x, s.z, 2.5);
    if (inside.length === 0) {
      // an empty seal: everybody is hit, an imp crawls out
      c.shape({ shape: { type: 'circle', radius: a.r + 8 }, x: a.cx, z: a.cz, dx: 0, dz: 1, delay: 0.05, coef: 3.0, type: 'shadow', telegraph: false, name: 'Mühür Patlaması' });
      c.spawnAdds('void_imp', 1, { x: s.x, z: s.z, radius: 1, tag: 'imp' });
      bossFx('shadow_burst', s.x, s.z, { scale: 1.6 });
      continue;
    }
    for (const p of inside) {
      const burdened = (st.burden?.[p.id] ?? 0) > now;
      (st.burden ??= {})[p.id] = now + 20;
      statusPlayer(p, 'sunder', 20);
      if (burdened) {
        c.shape({
          shape: { type: 'circle', radius: 0.9 }, x: p.position.x, z: p.position.z, dx: 0, dz: 1, delay: 0.1, coef: 1.5, type: 'shadow', telegraph: false, follow: true, sourceId: p.id, name: 'Mühür Yükü',
        });
        bossMsgTo(p.id, 'boss_toast', {}, { text: 'Mühür Yükü ile tekrar emdin! Ağır hasar aldın.' });
      } else bossMsgTo(p.id, 'boss_toast', {}, { text: 'Mühür Yükü: 20 saniye boyunca daha fazla gölge hasarı alırsın.' });
      bossFx('shadow_burst', p.position.x, p.position.z, { scale: 0.7 });
    }
  }
}

const zakhar: BossScript = {
  init(c) {
    c.state.seals = [];
    c.state.burden = {};
    c.state.ritual = null;
    c.state.softEnrage = false;
  },
  onReset(c) {
    c.state.seals = [];
    c.state.ritual = null;
  },
  update(c, dt) {
    const st = c.state;
    const now = c.world.time;
    // Tarikat Ayini: ritualists channel Karanlık Ayin; an interrupt stuns them for 3 s and pauses the channel
    const r = st.ritual as { t: number; ch: Record<number, RitChan>; acoT: number } | null;
    if (r) {
      r.t += dt;
      let alive = 0;
      for (const o of c.adds('ritual')) {
        if (o.isDead || o.removed) continue;
        alive++;
        const s = (r.ch[o.id] ??= { remain: 30, since: now, started: false, resumeAt: now });
        if (!s.started) {
          if (now >= s.resumeAt) startChannel(c, o, s);
        } else if (!o.cast) {
          // interrupted from outside (hard CC cleared the cast)
          s.started = false;
          s.remain = Math.max(0.5, s.remain - (now - s.since));
          s.resumeAt = now + 3;
          o.statuses.apply('stun', 3, { replicated: true });
          G.net?.broadcast('estatus', { targetId: o.id, status: 'stun', duration: 3, stacks: 1 });
          G.net?.broadcast('ecast', { enemyId: o.id, abilityId: 'zakhar_ayin', name: 'Karanlık Ayin', castTime: 0, interruptible: false, ended: true, interrupted: true });
          bossText('KESİLDİ!', o.position.x, o.height + 0.5, o.position.z, 0);
          G.events.emit('hitstop', { ms: 60 });
        }
      }
      r.acoT -= dt;
      if (r.acoT <= 0) {
        r.acoT = 10;
        const a = c.arena;
        c.spawnAdds('cult_acolyte', 6, { x: a.cx, z: a.cz + a.h / 2 - 4, radius: 5, tag: 'add' });
        bossFx('add_spawn', a.cx, a.cz + a.h / 2 - 4, { scale: 2 });
      }
      if (r.t > 2 && (alive === 0 || r.t >= 30)) endRitual(c);
    }
    // soft enrage below 15%: +5% damage every 5 s
    if (c.e.hpFrac < 0.15) every(st, 'seT', dt, 5, () => (c.dmgMul *= 1.05));
  },
  abilities: {
    /** Gölge Mühürleri: 3 seals (fewer with a smaller party), each needs a soaker at expiry (6 s). */
    zakhar_seals: {
      start(c) {
        const n = Math.max(1, Math.min(3, c.playersInArena(false).length));
        const chosen = SOCKETS.slice().sort(() => Math.random() - 0.5).slice(0, n);
        const seals: Seal[] = [];
        for (const [gx, gz] of chosen) {
          const p = c.gdd(gx, gz);
          // display only: the yellow soak telegraph is cancelled right before it would land (the host resolves the seal)
          const id = c.track(c.shape({
            shape: { type: 'circle', radius: 2.5 }, x: p.x, z: p.z, dx: 0, dz: 1, delay: 6.5, damage: 0, type: 'shadow', telegraph: true, kind: 'soak', name: 'Gölge Mührü',
          }));
          seals.push({ x: p.x, z: p.z, id });
          bossFx('shadow_ground', p.x, p.z, { dur: 6, scale: 1.4 });
        }
        c.state.seals = seals;
        c.schedule(6.0, () => resolveSeals(c), 'seal');
        bossMsg('boss_toast', {}, { text: 'Gölge Mühürleri! Her mührün içinde biri durmalı.' });
      },
    },

    /** Tarikat Ayini (70%): immune at the altar, 4 ritualists channel for 30 s, acolytes pour in every 10 s. */
    zakhar_ritual: {
      start(c) {
        c.setImmune(true);
        c.freeze(true);
        c.state.ritual = { t: -1.5, ch: {}, acoT: 4 };
      },
      resolve(c) {
        const altar = c.gdd(19.5, 3.5);
        c.teleport(altar.x, altar.z);
        for (const [gx, gz] of PLATFORMS) c.spawnAdds('cult_ritualist', 1, { positions: [c.gdd(gx, gz)], aggro: false, tag: 'ritual' });
        G.events.emit('camera:shake', { intensity: 0.4, duration: 0.5 });
        bossMsg('boss_toast', {}, { text: 'Ayin rahiplerinin büyüsünü kes! Aksi halde Zakhar güçlenir.' });
      },
      abort(c) {
        if (!c.inReset && !c.state.ritual) c.state.ritual = { t: -1.5, ch: {}, acoT: 4 };
      },
    },

    /** Uyanış (40%): trident gone, the basic attack becomes the claw combo. */
    zakhar_awaken: {
      resolve(c) {
        const claws = c.ability('zakhar_claws');
        if (claws) {
          c.basic = claws;
          c.basicCd = claws.cooldown;
        }
        c.cdOverride.set('zakhar_nova', 18);
        G.vfx.spawn('boss_enrage', c.e.pointAt(0.5));
        G.events.emit('camera:shake', { intensity: 0.5, duration: 0.6 });
      },
    },

    /** Ateş Yağmuru: 8 circles r 3 (2 on players), telegraph 1.5 s, coef 2.5. */
    zakhar_hellrain: {
      start(c, b) {
        const pts: { x: number; z: number }[] = [];
        for (const p of pickPlayers(c, 2)) pts.push({ x: p.position.x, z: p.position.z });
        while (pts.length < 8) pts.push(c.randomPoint(3));
        for (const p of pts) circle(c, p.x, p.z, 3, b.delay, 2.5, { type: 'fire', name: 'Ateş Yağmuru', vfxOnLand: 'fire_burst' });
      },
    },
  },
};

export const GOLGE_SCRIPTS: Record<string, BossScript> = {
  boss_nefris: nefris,
  boss_kevvas: kevvas,
  boss_zakhar: zakhar,
};

export const GOLGE_SPAWNS: Record<string, string[]> = {
  boss_nefris: ['nefris_clone'],
  boss_kevvas: ['void_imp', 'proc_rift'],
  boss_zakhar: ['cult_ritualist', 'cult_acolyte', 'void_imp'],
};
