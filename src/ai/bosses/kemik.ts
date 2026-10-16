import { G } from '../../game/G';
import { yawFromDir } from '../../core/utils';
import type { Player } from '../../entities/Player';
import type { BossController } from '../BossController';
import type { Busy } from '../EnemyAI';
import { bossFx, bossMsg, bossMsgTo } from '../bossNet';
import type { BossScript } from './types';
import { angleTo, beam, circle, clearPrisons, distXZ, every, floatOver, partyHp, pickPlayers, ring, spawnMech, TAU, trapPlayer, updatePrisons, zone } from './kit';

/**
 * Kemik Mahzeni bosses (GDD_CONTENT 4.1.5): Bekci Kaldur, Olucagiran Morkan, Kemik Lordu Azrakel.
 * Generic pieces (basic swings, Kalkan Yarmasi, Mezar Soğuğu) run through the EnemyAI ability pipeline from data/enemies.ts;
 * this file holds the scripted mechanics. OWNER: enemies module.
 */

const targetOf = (c: BossController, b: Busy): Player | null => {
  const t = b.targetId != null ? c.world.getActor(b.targetId) : undefined;
  return t && t.kind === 'player' && !t.isDead ? (t as Player) : null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 1: Bekçi Kaldur
// ---------------------------------------------------------------------------------------------------------------------
const kaldur: BossScript = {
  abilities: {
    /** Kemik Kasırgası: 1.5 s telegraph (r 5) then 4 s spin drifting toward a random player, circle r 4 ticks every 0.5 s. */
    kaldur_whirl: {
      start(c, b) {
        const e = c.e;
        const t = pickPlayers(c, 1)[0];
        b.data.tgt = t ? t.id : null;
        b.data.next = 0;
        b.total = b.delay + 4 + 0.35;
        circle(c, e.position.x, e.position.z, 5, b.delay, 0.8, { follow: true, name: 'Kemik Kasırgası', type: 'physical' });
      },
      resolve(c) {
        c.e.playShot('2H_Melee_Attack_Spinning', 1, { loop: true, loopFor: 4.3, fade: 0.05 });
        try {
          G.audio.play('whoosh', { pos: [c.e.position.x, 1, c.e.position.z], pitch: 0.8 });
        } catch { /* ignore */ }
      },
      tick(c, b, dt, t) {
        if (t < b.delay || t > b.delay + 4) return;
        const e = c.e;
        const tgt = (b.data.tgt != null ? c.world.getActor(b.data.tgt as number) : undefined) ?? c.nearestPlayer();
        if (tgt && !tgt.isDead) c.slide(tgt.position.x - e.position.x, tgt.position.z - e.position.z, 3.5, dt, false);
        e.yaw += dt * 9;
        b.data.next = (b.data.next as number) - dt;
        if (b.data.next <= 0) {
          b.data.next = 0.5;
          circle(c, e.position.x, e.position.z, 4, 0.05, 0.8, { telegraph: false, name: 'Kemik Kasırgası', vfxOnLand: 'spin_slash' });
          G.events.emit('camera:shake', { intensity: 0.1, duration: 0.15 });
        }
      },
      end(c) {
        c.e.anim?.cancelOneShot(0.15);
      },
      abort(c) {
        c.e.anim?.cancelOneShot(0.1);
      },
    },

    /** Kalkan Duvarı: 4 s of Blocking, -90% damage from the front, +20% from behind (every peer applies it via bossNet). */
    kaldur_shield_wall: {
      start(c, b) {
        const e = c.e;
        b.total = b.delay + 4;
        c.frontalBlock(4.4, 120, 0.1, 1.2);
        e.playShot('Blocking', 1, { loop: true, loopFor: 4.4, fade: 0.08 });
        bossFx('shield_bubble', e.position.x, e.position.z, { y: 1.2, follow: e.id, dur: 4.2, scale: 1.3 });
        floatOver(e, 'KALKAN DUVARI', 1);
      },
      tick(c, b, dt) {
        const t = targetOf(c, b) ?? c.nearestPlayer();
        if (t) c.faceTo(t.position.x - c.e.position.x, t.position.z - c.e.position.z, 5, dt);
      },
      end(c) {
        c.e.anim?.cancelOneShot(0.12);
      },
      abort(c) {
        c.e.anim?.cancelOneShot(0.1);
      },
    },

    /** Mezarlık Çağrısı (70% / 35%): rattlers from the four corner bone piles (2/2/1/1), plus an archer at 35%. */
    kaldur_call: {
      resolve(c) {
        const a = c.arena;
        const ix = a.w / 2 - 5, iz = a.h / 2 - 5;
        const corners = [
          { x: a.cx - ix, z: a.cz - iz, n: 2 },
          { x: a.cx + ix, z: a.cz - iz, n: 2 },
          { x: a.cx - ix, z: a.cz + iz, n: 1 },
          { x: a.cx + ix, z: a.cz + iz, n: 1 },
        ];
        for (const k of corners) {
          c.spawnAdds('skel_rattler', k.n, { x: k.x, z: k.z, radius: 2.2, tag: 'add' });
          bossFx('death_bones', k.x, k.z, { scale: 1.2 });
        }
        if (c.phaseIdx >= 2) c.spawnAdds('skel_archer', 1, { x: a.cx, z: a.cz + iz, radius: 3, tag: 'add' });
        G.events.emit('camera:shake', { intensity: 0.2, duration: 0.4 });
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 2: Ölüçağıran Morkan
// ---------------------------------------------------------------------------------------------------------------------
const well = (c: BossController) => c.gdd(34.1, 22.1);

function endStorm(c: BossController): void {
  const st = c.state;
  if (!st.storm) return;
  st.storm = false;
  for (const o of c.adds('orb')) o.escape();
  c.setImmune(false);
  bossMsg('boss_hover', { h: 0 }, { targetId: c.e.id });
  c.cdOverride.set('morkan_prison', 12);
  c.cdOverride.set('morkan_bolt', 1.8);
  c.setCooldown('morkan_prison', 6);
}

const morkan: BossScript = {
  kite: [8, 12],
  init(c) {
    c.state.prisons = [];
    c.state.blinkT = 12;
  },
  update(c, dt) {
    const st = c.state;
    const e = c.e;
    // blink to a new spot on the well rim every 12 s
    if (!st.storm) {
      st.blinkT -= dt;
      if (st.blinkT <= 0 && !c.busy && !e.statuses.stunned) {
        st.blinkT = 12;
        const w = well(c);
        const tank = c.tank ?? c.nearestPlayer();
        let best: { x: number; z: number } | null = null;
        let bs = -1;
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * TAU;
          const x = w.x + Math.sin(a) * 6, z = w.z + Math.cos(a) * 6;
          if (!c.world.nav.isWalkable(x, z)) continue;
          const d = tank ? distXZ(x, z, tank.position.x, tank.position.z) : 10;
          const score = -Math.abs(d - 10) + Math.random();
          if (score > bs) {
            bs = score;
            best = { x, z };
          }
        }
        if (best) {
          c.teleport(best.x, best.z);
          e.playShot('Spawn_Air', 1.3, { fade: 0.05 });
        }
      }
    }
    // bone cages: keep the prisoner stunned until the cage is broken (solo: it shatters by itself after 3 s)
    updatePrisons(c, dt);
    // Ruh Fırtınası: orbs drift to the well and heal him 3% each
    if (st.storm) {
      const w = well(c);
      for (const o of c.adds('orb')) {
        if (o.isDead || o.removed) continue;
        const dx = w.x - o.position.x, dz = w.z - o.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.7) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03);
          bossFx('heal_burst', e.position.x, e.position.z, { y: 1.4, scale: 0.8 });
          floatOver(e, '+%3', 2);
          o.escape();
          continue;
        }
        o.position.x += (dx / d) * 4 * dt;
        o.position.z += (dz / d) * 4 * dt;
        o.yaw = yawFromDir(dx, dz);
      }
    }
  },
  onReset(c) {
    clearPrisons(c);
    bossMsg('boss_hover', { h: 0 }, { targetId: c.e.id });
  },
  abilities: {
    /** Ölüleri Kaldır: interruptible 3 s cast; success raises 4 half-HP skeletons around the well, an interrupt staggers him. */
    morkan_raise: {
      resolve(c) {
        const w = well(c);
        c.spawnAdds('skel_minion', 4, { x: w.x, z: w.z, radius: 4.5, hpFrac: 0.5, tag: 'add' });
        bossFx('shadow_burst', w.x, w.z, { scale: 1.6 });
      },
      abort(c, _b, reason) {
        if (c.inReset || reason === 'death') return;
        if (reason === 'external' || reason === 'cc') c.stagger(2, 1.25, 5);
      },
    },

    /** Kemik Hapsi: circle under a random non-tank; the player left inside is stunned in a breakable bone cage. */
    morkan_prison: {
      start(c, b) {
        const t = pickPlayers(c, 1, true)[0];
        if (!t) return;
        b.data.pid = t.id;
        b.data.px = t.position.x;
        b.data.pz = t.position.z;
        // a grab (the bone cage closes on the player): perilous, dodge only (GDD_V2 §3.12)
        circle(c, t.position.x, t.position.z, 1.5, b.delay, 0.5, { type: 'shadow', name: 'Kemik Hapsi', vfxOnLand: 'shadow_burst', perilous: true });
      },
      resolve(c, b) {
        if (b.data.pid == null) return;
        const p = c.world.get<Player>(b.data.pid as number);
        if (!p || p.isDead || p.removed) return;
        if (distXZ(b.data.px as number, b.data.pz as number, p.position.x, p.position.z) > 1.5 + p.radius) return; // dodged
        trapPlayer(c, p, { defId: 'proc_bone_cage', prefix: 'cage', hpMult: 4 * partyHp(c), status: 'stun', maxAge: 30, soloAge: 3, toast: 'Kemik kafesine hapsoldun! Müttefiklerin seni kurtarsın.' });
        bossFx('shadow_burst', p.position.x, p.position.z, { scale: 0.9 });
      },
    },

    /** Ceset Patlaması: every bone pile / corpse in the arena glows for 3 s, then explodes (r 4, coef 2.5). */
    morkan_corpse_explosion: {
      usable(c) {
        return c.dir.pilesNear(c.arena.cx, c.arena.cz, c.arena.r + 6).length > 0;
      },
      start(c, b) {
        const piles = c.dir.pilesNear(c.arena.cx, c.arena.cz, c.arena.r + 6);
        c.state.batch = piles;
        for (const p of piles) {
          circle(c, p.x, p.z, 4, b.delay, 2.5, { type: 'shadow', name: 'Ceset Patlaması', vfxOnLand: 'shadow_burst' });
          bossFx('necrotic_hit', p.x, p.z, { y: 0.8, dur: b.delay, scale: 1.2 });
        }
      },
      resolve(c) {
        for (const p of (c.state.batch ?? []) as ReturnType<BossController['dir']['pilesNear']>) c.dir.claimPile(p);
        c.state.batch = [];
        G.events.emit('camera:shake', { intensity: 0.25, duration: 0.3 });
      },
    },

    /** Ruh Fırtınası (40%): 8 s channel over the well, immune; 3 soul orbs per player drift in and heal him. */
    morkan_soul_storm: {
      start(c, b) {
        const e = c.e;
        c.state.storm = true;
        c.setImmune(true);
        b.total = Math.max(b.total, b.delay + 8 + 0.3);
        void e;
      },
      resolve(c) {
        const e = c.e;
        const w = well(c);
        c.teleport(w.x, w.z);
        bossMsg('boss_hover', { h: 1.8 }, { targetId: e.id });
        const n = 3 * Math.max(1, c.playersInArena(false).length);
        const r = Math.min(c.arena.w, c.arena.h) / 2 - 3.5;
        const start = Math.random() * TAU;
        for (let i = 0; i < n; i++) {
          const a = start + (i / n) * TAU;
          let x = w.x + Math.sin(a) * r, z = w.z + Math.cos(a) * r;
          if (!c.world.nav.isWalkable(x, z)) {
            const wp = c.world.nav.nearestWalkable(x, z, 6);
            if (wp) {
              x = wp.x;
              z = wp.z;
            }
          }
          spawnMech(c, 'proc_soul_orb', { x, z }, { hpMult: 0.02, tag: 'orb' });
        }
        bossMsg('boss_toast', {}, { text: 'Ruh küreleri kuyuya akıyor! Hepsini yok et!' });
      },
      end(c) {
        endStorm(c);
      },
      abort(c) {
        endStorm(c);
      },
    },
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Boss 3: Kemik Lordu Azrakel
// ---------------------------------------------------------------------------------------------------------------------
/** Spawn the phylacteries and move the boss to the throne (idempotent: called by resolve, or by abort when the cast was cut). */
function beginPhylactery(c: BossController): void {
  const st = c.state;
  const ph = st.phyl as { t: number; wave: number; begun?: boolean } | undefined;
  if (!ph || ph.begun) return;
  ph.begun = true;
  const e = c.e;
  const throne = c.gdd(20, 37.5);
  c.teleport(throne.x, throne.z);
  e.playShot('Cast', 1, { loop: true, loopFor: 42, fade: 0.1 });
  const hp = 10 * partyHp(c);
  for (const [x, z] of [[15.5, 31.5], [25, 31.5], [20, 38.7]] as [number, number][]) spawnMech(c, 'proc_phylactery', c.gdd(x, z), { hpMult: hp, tag: 'phyl' });
  bossMsg('boss_toast', {}, { text: 'Filakterleri 40 saniye içinde yok et!' });
  G.events.emit('camera:shake', { intensity: 0.4, duration: 0.5 });
}

function endPhylactery(c: BossController): void {
  const st = c.state;
  const e = c.e;
  const standing = c.adds('phyl').filter((o) => !o.isDead && !o.removed);
  for (const o of standing) {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1);
    c.dmgMul *= 1.1;
    bossFx('heal_burst', o.position.x, o.position.z, { y: 1.6, scale: 1.2 });
    bossFx('shadow_burst', o.position.x, o.position.z, { y: 1.2 });
    o.escape();
  }
  for (const o of c.adds('phyl')) o.escape();
  st.phyl = null;
  c.setImmune(false);
  e.anim?.cancelOneShot(0.15);
  if (standing.length) {
    floatOver(e, `+%${standing.length * 10} HASAR`, 1);
    bossMsg('boss_toast', {}, { text: `${standing.length} filakter ayakta kaldı! Kemik Lordu güçlendi.` });
  } else bossMsg('boss_toast', {}, { text: 'Filakterler yok edildi!' });
  c.endMechanicPhase();
}

const azrakel: BossScript = {
  init(c) {
    c.state.ringN = 0;
  },
  onPhase(c, ph) {
    if (ph.id === 'p3' || ph.id === 'p4') c.cdOverride.set('azrakel_spears', 11);
  },
  update(c, dt) {
    const st = c.state;
    // Filakter Evresi
    const ph = st.phyl as { t: number; wave: number } | null | undefined;
    if (ph) {
      ph.t += dt;
      every(ph, 'wave', dt, 8, () => {
        const pts = [0, 1, 2, 3].map(() => c.randomPoint(4));
        c.spawnAdds('skel_rattler', 4, { positions: pts, tag: 'add' });
        for (const p of pts) bossFx('death_bones', p.x, p.z, { scale: 0.9 });
        // recombined soak: a Ruh Hasadı marks up to 3 players during each rattler wave
        c.castNow('azrakel_soul_reap');
      });
      const standing = c.adds('phyl').filter((o) => !o.isDead && !o.removed).length;
      if (ph.t > 2 && (standing === 0 || ph.t >= 40)) endPhylactery(c);
    }
    // Son Nefes: +5% damage every 10 s
    if (st.lastBreath) every(st, 'lbT', dt, 10, () => (c.dmgMul *= 1.05));
  },
  onReset(c) {
    c.e.anim?.cancelOneShot(0.1);
  },
  abilities: {
    /** Kemik Mızrakları: 3 lines (24 x 2.5) toward 3 players (random angles for missing ones), knock-up 0.8 s. */
    azrakel_spears: {
      start(c, b) {
        const e = c.e;
        const targets = c.randomPlayers(3);
        for (let i = 0; i < 3; i++) {
          const t = targets[i];
          const ang = t ? angleTo(e.position.x, e.position.z, t.position.x, t.position.z) : Math.random() * TAU;
          beam(c, e.position.x, e.position.z, ang, 24, 2.5, b.delay, 3.0, { type: 'physical', statuses: [{ status: 'knockdown', duration: 0.8 }], name: 'Kemik Mızrakları' });
        }
      },
    },

    /** Ruh Hasadı: up to 3 marked players burst after 5 s (r 5, coef 2.0 to everyone in range) and leave a necrotic puddle. */
    azrakel_soul_reap: {
      start(c) {
        for (const p of c.randomPlayers(3)) {
          c.track(circle(c, p.position.x, p.position.z, 5, 5.0, 2.0, { follow: true, sourceId: p.id, type: 'shadow', name: 'Ruh Hasadı', vfxOnLand: 'shadow_burst' }));
          bossMsgTo(p.id, 'boss_toast', {}, { text: 'Ruh Hasadı! Gruptan uzaklaş!' });
          c.schedule(5.0, () => {
            if (p.removed || c.e.isDead) return;
            zone(c, p.position.x, p.position.z, 3, 10, 0.5, 0.5, 0.1, { type: 'shadow', name: 'Nekrotik Birikinti', vfxOnLand: 'shadow_ground' });
          }, 'reap');
        }
      },
    },

    /** Filakter Evresi (60%): immune on the throne, 3 phylacteries, rattlers every 8 s, 40 s timer. */
    azrakel_phylactery: {
      start(c) {
        c.setImmune(true);
        c.freeze(true);
        c.state.phyl = { t: 0, wave: 4 };
      },
      resolve(c) {
        beginPhylactery(c);
      },
      abort(c) {
        // a cut cast must never leave the boss immune without a running phase
        if (!c.inReset) beginPhylactery(c);
      },
    },

    /** İç / Dış Ölüm: alternates a ring (hug the boss) and a circle (get out); the first cast is always the ring. */
    azrakel_death_rings: {
      start(c, b) {
        const e = c.e;
        const first = c.state.ringN % 2 === 0;
        c.state.ringN++;
        if (first) ring(c, e.position.x, e.position.z, 6, 22, b.delay, 3.5, { type: 'shadow', name: 'Ölüm Halkası', vfxOnLand: 'shadow_burst' });
        else circle(c, e.position.x, e.position.z, 6, b.delay, 3.5, { type: 'shadow', name: 'Ölüm Çemberi', vfxOnLand: 'shadow_burst' });
      },
    },

    /** Son Nefes (30%): soft enrage, +5% damage every 10 s until death. */
    azrakel_last_breath: {
      resolve(c) {
        c.state.lastBreath = true;
        G.vfx.spawn('boss_enrage', c.e.pointAt(0.5));
      },
    },
  },
};

export const KEMIK_SCRIPTS: Record<string, BossScript> = {
  boss_bekci_kaldur: kaldur,
  boss_olucagiran_morkan: morkan,
  boss_azrakel: azrakel,
};

export const KEMIK_SPAWNS: Record<string, string[]> = {
  boss_bekci_kaldur: ['skel_rattler', 'skel_archer'],
  boss_olucagiran_morkan: ['skel_minion', 'proc_bone_cage', 'proc_soul_orb'],
  boss_azrakel: ['skel_rattler', 'proc_phylactery'],
};
