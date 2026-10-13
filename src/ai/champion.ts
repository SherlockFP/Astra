import { G } from '../game/G';
import { RNG } from '../core/utils';
import { SHIELDERS, type Enemy } from '../entities/Enemy';
import type { World } from '../world/World';
import { EnemyAI } from './EnemyAI';
import { walkableToward, type PassiveHandler } from './abilities';
import { getDirector } from './EnemyDirector';
import { bossMsg } from './bossNet';
import type { EnemyAbility } from '../types/enemies';

/**
 * Şampiyon (champion) packs, GDD_CONTENT 1.5: one member per champion pack (the one with the highest hpMult) becomes a Şampiyon:
 * x3 HP, x1.4 damage, a buff aura in the modifier colour and ONE random modifier. Normal / Kahramanlık / Mitik 0 only.
 *
 * Usage (every peer, after the dungeon's deterministic spawns are done and not in Mythic+):
 *     assignChampions(world, params.seed)            // seeded pick of 3 packs + modifiers, identical on every peer
 * or  makeChampion(enemy, 'vampir')                   // one specific enemy
 * The flags / visuals run on every peer; stats and the modifier behaviours only where the enemy has authority.
 * OWNER: enemies module.
 */

export type ChampionMod = 'hizli' | 'atesli' | 'dondurucu' | 'kalkanli' | 'vampir' | 'isinlanan' | 'diriltici';

export const CHAMPION_MODS: { id: ChampionMod; name: string; color: number; desc: string }[] = [
  { id: 'hizli', name: 'Hızlı', color: 0xffe040, desc: '+%40 hareket ve saldırı hızı' },
  { id: 'atesli', name: 'Ateşli', color: 0xff6a20, desc: 'Ölünce patlar (4 m, ateş)' },
  { id: 'dondurucu', name: 'Dondurucu', color: 0x80d0ff, desc: 'Her 8 sn yavaşlatıcı buz küreleri atar' },
  { id: 'kalkanli', name: 'Kalkanlı', color: 0xe0e8ff, desc: '8 m içindeki müttefikler %40 az hasar alır' },
  { id: 'vampir', name: 'Vampir', color: 0xc02040, desc: 'Verdiği hasarın %20\'sini iyileşir' },
  { id: 'isinlanan', name: 'Işınlanan', color: 0xb060ff, desc: 'Her 6 sn rastgele bir oyuncunun yanına ışınlanır' },
  { id: 'diriltici', name: 'Diriltici', color: 0x60ff90, desc: 'Her 15 sn ölü bir sürü üyesini %50 canla diriltir' },
];

const modOf = (id: string) => CHAMPION_MODS.find((m) => m.id === id);

const NONE: EnemyAbility = { id: 'champion_mod', name: 'Şampiyon', kind: 'custom', range: 0, cooldown: 0, windup: 0, anim: '', params: { passive: 1 } };

function atesli(): PassiveHandler {
  return {
    onDeath(ai) {
      const e = ai.e;
      ai.shape({ shape: { type: 'circle', radius: 4 }, x: e.position.x, z: e.position.z, dx: 0, dz: 1, delay: 1.2, coef: 2.5, type: 'fire', telegraph: true, vfxOnLand: 'fire_burst', name: 'Ateşli Patlama' });
    },
  };
}

function dondurucu(): PassiveHandler {
  return {
    tick(ai, _ab, st, dt) {
      if (!ai.aggroed || ai.e.isDead || !ai.target) return;
      st.t = (st.t ?? 4) - dt;
      if (st.t > 0 || ai.busy) return;
      st.t = 8;
      const e = ai.e;
      const t = ai.target;
      const base = Math.atan2(t.position.x - e.position.x, t.position.z - e.position.z);
      const m = e.muzzle();
      for (let i = -1; i <= 1; i++) {
        const ang = base + i * 0.35;
        const dx = Math.sin(ang), dz = Math.cos(ang);
        ai.shape({
          shape: { type: 'circle', radius: 0.6 }, x: m.x, y: m.y, z: m.z, dx, dz, delay: 0, coef: 0.6, type: 'frost', name: 'Buz Küresi', vfxOnLand: 'frost_burst',
          statuses: [{ status: 'slow', duration: 2, magnitude: 0.3 }],
          projectile: { speed: 8, radius: 0.6, range: 16, vfx: 'frost_projectile' },
        });
        for (const d of [6, 10, 14]) {
          ai.schedule(d / 8, () => {
            if (ai.e.removed) return;
            ai.shape({
              shape: { type: 'circle', radius: 2 }, x: e.position.x + dx * d, z: e.position.z + dz * d, dx: 0, dz: 1, delay: 0.05, coef: 0.15, type: 'frost', telegraph: false,
              persist: { duration: 5, tick: 0.5 }, statuses: [{ status: 'chill', duration: 3, stacks: 1 }], vfxOnLand: 'frost_ground', name: 'Buz Birikintisi',
            });
          }, 'champ');
        }
      }
    },
  };
}

function vampir(): PassiveHandler {
  return {
    init(ai) {
      ai.onResolveHooks.push((b) => {
        const coef = b.ab.damage?.coef;
        const t = ai.target;
        if (!coef || !t || t.isDead) return;
        const e = ai.e;
        if (Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z) > Math.max(4, b.ab.range + 2)) return;
        const amt = ai.dmg(coef) * 0.2;
        e.hp = Math.min(e.maxHp, e.hp + amt);
        try {
          G.vfx.spawn('heal_burst', e.pointAt(0.5), { scale: 0.5 });
          G.events.emit('heal', { targetId: e.id, sourceId: e.id, amount: Math.round(amt), pos: [e.position.x, e.position.y + e.height, e.position.z] });
        } catch { /* ignore */ }
      });
    },
  };
}

function isinlanan(): PassiveHandler {
  return {
    tick(ai, _ab, st, dt) {
      if (!ai.aggroed || ai.e.isDead || ai.busy) return;
      st.t = (st.t ?? 3) - dt;
      if (st.t > 0) return;
      st.t = 6;
      const ps = ai.players();
      if (!ps.length) return;
      const p = ps[Math.floor(Math.random() * ps.length)];
      const e = ai.e;
      const a = Math.random() * Math.PI * 2;
      const spot = walkableToward(ai, p.position.x, p.position.z, Math.sin(a), Math.cos(a), 2.2);
      if (spot.x === p.position.x && spot.z === p.position.z) return;
      G.vfx.spawn('blink', [e.position.x, e.position.y + 0.8, e.position.z]);
      e.position.x = spot.x;
      e.position.z = spot.z;
      e.velocity.set(0, 0, 0);
      e.interp.clear();
      e.yaw = Math.atan2(p.position.x - spot.x, p.position.z - spot.z);
      G.vfx.spawn('blink', [e.position.x, e.position.y + 0.8, e.position.z]);
    },
  };
}

function diriltici(): PassiveHandler {
  return {
    tick(ai, _ab, st, dt) {
      if (!ai.aggroed || ai.e.isDead) return;
      st.t = (st.t ?? 10) - dt;
      if (st.t > 0) return;
      st.t = 15;
      const e = ai.e;
      let best: Enemy | null = null;
      for (const o of ai.world.enemies) {
        if (o === e || !o.isDead || o.removed || o.isBoss || o.packId !== e.packId || o.tag === 'eaten') continue;
        if (Math.hypot(o.position.x - e.position.x, o.position.z - e.position.z) > 20) continue;
        best = o;
        break;
      }
      if (!best || !ai.target) return;
      const target = ai.target;
      bossMsg('boss_revive', { f: 0.5 }, { targetId: best.id });
      best.forcesCounted = true;
      best.ai = new EnemyAI(best, ai.dir);
      best.ai.acquire(target, true);
    },
  };
}

/** Turn an enemy into a Şampiyon (idempotent). Call on every peer; authority-only parts check `e.authority`. */
export function makeChampion(e: Enemy, mod: ChampionMod): void {
  if (e.champion || e.isDead) return;
  const info = modOf(mod);
  if (!info) return;
  e.champion = true;
  e.championMod = mod;
  e.name = `${e.def.name} (${info.name})`;
  e.setVisualScale(1.22);
  try {
    G.vfx.spawn('buff_aura', e.pointAt(0.5), { follow: e.model ?? e.object3d, duration: 3600, color: info.color });
  } catch { /* ignore */ }
  if (mod === 'kalkanli') SHIELDERS.add(e);
  if (!e.authority) return;
  e.maxHp = Math.round(e.maxHp * 3);
  e.hp = e.maxHp;
  e.baseDamage *= 1.4;
  const ai = e.ai;
  if (mod === 'hizli') {
    e.stats.moveSpeedPct = (e.stats.moveSpeedPct ?? 0) + 0.4;
    e.stats.attackSpeed = (e.stats.attackSpeed ?? 0) + 0.4;
    return;
  }
  if (!ai) return;
  switch (mod) {
    case 'atesli': ai.addPassive(NONE, atesli()); break;
    case 'dondurucu': ai.addPassive(NONE, dondurucu()); break;
    case 'vampir': ai.addPassive(NONE, vampir()); break;
    case 'isinlanan': ai.addPassive(NONE, isinlanan()); break;
    case 'diriltici': ai.addPassive(NONE, diriltici()); break;
    default: break;
  }
}

/**
 * Seeded champion pick, identical on every peer: `count` packs (packs with at least 2 living non-summoned members, sorted by id),
 * the member with the highest hpMult of each becomes a champion with a seeded modifier. Returns the champions.
 */
export function assignChampions(world: World, seed: number, count = 3): Enemy[] {
  try {
    getDirector(world); // makes sure the director exists on the host before AIs are touched
  } catch { /* clients have none */ }
  const packs = new Map<string, Enemy[]>();
  for (const e of world.enemies) {
    if (!e.packId || e.dynamic || e.isBoss || e.isDead || e.def.ai?.summoned || e.def.role === 'support') continue;
    let l = packs.get(e.packId);
    if (!l) packs.set(e.packId, (l = []));
    l.push(e);
  }
  const ids = [...packs.keys()].filter((id) => packs.get(id)!.length >= 2).sort();
  const rng = new RNG((seed >>> 0) ^ 0x5a17c4a3);
  const out: Enemy[] = [];
  for (let i = 0; i < count && ids.length; i++) {
    const idx = Math.min(ids.length - 1, Math.floor(rng.next() * ids.length));
    const pid = ids.splice(idx, 1)[0];
    const members = packs.get(pid)!.sort((a, b) => b.def.hpMult - a.def.hpMult || a.id - b.id);
    const mod = CHAMPION_MODS[Math.min(CHAMPION_MODS.length - 1, Math.floor(rng.next() * CHAMPION_MODS.length))].id;
    makeChampion(members[0], mod);
    out.push(members[0]);
  }
  return out;
}

/**
 * Open-world champions (GDD_OPENWORLD §1.4): once per camp activation, a `chance` roll (PackDef.championChance, default 0.12,
 * 0 disables) on every camp with at least 4 living members at level 8+. The member with the highest hpMult becomes a champion
 * with a seeded modifier. `rng` must be seeded from the activation so every peer picks the same champion. Returns the champions.
 */
export function rollOpenWorldChampion(enemies: Enemy[], rng: RNG, chance = 0.12): Enemy[] {
  const out: Enemy[] = [];
  if (chance <= 0) return out;
  const packs = new Map<string, Enemy[]>();
  for (const e of enemies) {
    if (!e.packId || e.dynamic || e.isBoss || e.isDead || e.removed || e.champion) continue;
    if (e.def.ai?.summoned || e.def.ai?.stationary || e.def.role === 'support' || e.level < 8) continue;
    let l = packs.get(e.packId);
    if (!l) packs.set(e.packId, (l = []));
    l.push(e);
  }
  for (const pid of [...packs.keys()].sort()) {
    const members = packs.get(pid)!;
    if (members.length < 4) continue;
    if (!rng.chance(chance)) continue;
    members.sort((a, b) => b.def.hpMult - a.def.hpMult || a.id - b.id);
    const mod = CHAMPION_MODS[Math.min(CHAMPION_MODS.length - 1, Math.floor(rng.next() * CHAMPION_MODS.length))].id;
    makeChampion(members[0], mod);
    out.push(members[0]);
  }
  return out;
}
