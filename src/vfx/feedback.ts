import * as THREE from 'three';
import { STATUSES } from '../data/statuses';
import type { Actor } from '../entities/Actor';
import type { Entity } from '../entities/Entity';
import { G } from '../game/G';
import type { DamageType } from '../types/common';
import type { StatusId } from '../types/skills';
import type { VfxId } from '../types/vfx';
import { NUMBER_ONLY_KINDS, type DamageNumberOpts } from './DamageNumbers';
import type { VFX, VfxHandle } from './VFX';

/**
 * Default feedback subscriptions (ARCHITECTURE.md "Default feedback subscriptions"):
 * damage -> number + hit spark/blood/magic by type oriented away from the source + model flash,
 * heal, death, level up, status loops, enemy cast glow, loot drop flash, scene clear.
 * Everything is budgeted per frame so horde fights stay cheap.
 */

const TYPE_HIT: Record<DamageType, { id: VfxId; color?: number; scale: number; crit: number }> = {
  physical: { id: 'hit_spark', scale: 1, crit: 0xffc830 },
  true: { id: 'hit_spark', scale: 1, color: 0xffffff, crit: 0xffffff },
  fire: { id: 'fire_burst', scale: 0.42, crit: 0xff8a20 },
  frost: { id: 'frost_burst', scale: 0.45, crit: 0x9fe0ff },
  lightning: { id: 'hit_magic', color: 0xaed2ff, scale: 1, crit: 0xbcd8ff },
  shadow: { id: 'shadow_burst', scale: 0.45, crit: 0xb070ff },
  poison: { id: 'poison_burst', scale: 0.45, crit: 0x8cff50 },
  holy: { id: 'hit_magic', color: 0xffe28a, scale: 1, crit: 0xfff0a0 },
  arcane: { id: 'hit_magic', color: 0xe060ff, scale: 1, crit: 0xf080ff },
};

const DEFAULT_STATUS_VFX: Partial<Record<string, VfxId>> = {
  burn: 'burn_loop',
  freeze: 'freeze_loop',
  stun: 'stun_stars',
  curse: 'curse_loop',
  poison: 'poison_loop',
  shock: 'shock_loop',
  shield: 'shield_bubble',
  stealth: 'stealth_smoke',
  haste: 'haste_trail',
  enrage: 'enrage_aura',
  raging: 'enrage_aura',
  regen: 'heal_loop',
  inspiring: 'inspiring_aura',
  bolstered: 'bolster_burst',
  necrotic: 'necrotic_hit',
};

const DRY = /skelet|bone|golem|construct|statue|armor|guard|ghost|wraith|spirit|elemental|wisp|lich|mummy/i;

function entity(id: number | null | undefined): Entity | undefined {
  return id === null || id === undefined ? undefined : G.world?.get(id);
}

function isDry(e: Entity | undefined): boolean {
  const def = (e as unknown as { def?: { id?: string; model?: string } } | undefined)?.def;
  if (!def) return false;
  return DRY.test(`${def.id ?? ''} ${def.model ?? ''}`);
}
function isUndeadBones(e: Entity | undefined): boolean {
  const def = (e as unknown as { def?: { id?: string; model?: string } } | undefined)?.def;
  return !!def && /skelet|bone/i.test(`${def.id ?? ''} ${def.model ?? ''}`);
}

export function subscribeFeedback(vfx: VFX): void {
  const ev = G.events;
  const dotAt = new Map<number, number>();
  const _v = new THREE.Vector3();

  ev.on('damage', (e) => {
    try {
      const target = entity(e.targetId);
      const src = entity(e.sourceId);
      const pos: [number, number, number] = e.pos;
      // ---- floating number
      const headY = target ? target.position.y + target.height * 1.02 : pos[1] + 0.6;
      const nx = (target ? target.position.x : pos[0]) + (Math.random() - 0.5) * 0.5;
      const nz = target ? target.position.z : pos[2];
      if (e.kind === 'immune' || e.kind === 'dodge' || e.kind === 'block') {
        vfx.damageNumber([nx, headY, nz], 0, e.kind);
        if (e.kind === 'block' && vfx.hitBudget > 0) {
          vfx.hitBudget--;
          vfx.spawn('block_spark', pos, { dir: dirAway(src, target, pos) });
        }
        return;
      }
      if (NUMBER_ONLY_KINDS.has(e.kind)) {
        // miss / absorb / resist / interrupt: the word or amount only, no hit sparks
        vfx.damageNumber([nx, headY, nz], e.amount, e.kind);
        return;
      }
      const numOpts: DamageNumberOpts = {
        type: e.type,
        weak: e.weak,
        resisted: e.resisted,
        // DoT ticks of one skill on one target merge into a single live number (CW-05)
        merge: e.kind === 'dot' ? `${e.targetId}:${e.skillId ?? 'dot'}` : undefined,
      };
      vfx.damageNumber([nx, headY, nz], e.amount, e.crit && e.kind === 'normal' ? 'crit' : e.kind, undefined, numOpts);
      // ---- budget (hordes)
      if (vfx.hitBudget <= 0) return;
      const dot = e.kind === 'dot';
      if (dot) {
        const now = G.engine.time;
        if (now - (dotAt.get(e.targetId) ?? -9) < 0.28) return;
        dotAt.set(e.targetId, now);
      }
      vfx.hitBudget -= dot ? 1 : e.crit ? 3 : 2;
      const dir = dirAway(src, target, pos);
      const t = TYPE_HIT[e.type] ?? TYPE_HIT.physical;
      const hurt = e.kind === 'player_hurt' || target?.kind === 'player';
      const baseScale = dot ? 0.5 : 1;
      if (hurt) {
        vfx.spawn('hit_blood', pos, { dir, scale: 0.9 });
        if (e.type !== 'physical') vfx.spawn(t.id, pos, { dir, scale: t.scale * 0.8, color: t.color });
      } else if (e.type === 'physical' || e.type === 'true') {
        if (dot) vfx.spawn('hit_blood', pos, { dir, scale: 0.5 });
        else if (isDry(target)) {
          vfx.spawn('hit_spark', pos, { dir, color: isUndeadBones(target) ? 0xf2ead2 : undefined, scale: 1 });
        } else {
          vfx.spawn('hit_blood', pos, { dir, scale: e.crit ? 1.25 : 1 });
          vfx.spawn('hit_spark', pos, { dir, scale: 0.7 });
        }
      } else {
        vfx.spawn(t.id, pos, { dir, scale: t.scale * baseScale, color: t.color });
        if (e.type === 'lightning' && !dot) vfx.spawn('hit_spark', pos, { dir, scale: 0.6, color: 0xcfe4ff });
      }
      if (e.crit && !dot) vfx.spawn('crit_burst', pos, { dir, color: t.crit, scale: hurt ? 0.8 : 1 });
      // ---- model flash
      if (target && !dot) {
        if (hurt) vfx.flash(target.object3d, 0xff2410, 0.16);
        else vfx.flash(target.object3d, 0xffffff, e.crit ? 0.13 : 0.09);
      }
      if (hurt && target) {
        const maxHp = (target as unknown as Actor).maxHp || 100;
        if (e.amount > maxHp * 0.12) vfx.screenFlash('rgba(190,10,10,0.9)', Math.min(0.45, 0.15 + (e.amount / maxHp) * 0.6), 0.45);
      }
    } catch (err) {
      console.warn('[vfx] damage feedback failed', err);
    }
  });

  ev.on('heal', (e) => {
    try {
      if (e.amount <= 0.5) return;
      const target = entity(e.targetId);
      const headY = target ? target.position.y + target.height * 1.02 : e.pos[1] + 0.6;
      vfx.damageNumber([target ? target.position.x : e.pos[0], headY, target ? target.position.z : e.pos[2]], e.amount, 'heal');
      if (vfx.hitBudget > 0) {
        vfx.hitBudget -= 2;
        vfx.spawn('heal_burst', target ? [target.position.x, target.position.y, target.position.z] : e.pos, { scale: 0.7 });
      }
    } catch (err) {
      console.warn('[vfx] heal feedback failed', err);
    }
  });

  ev.on('death', (e) => {
    try {
      const ent = entity(e.entityId);
      const p: [number, number, number] = [e.pos[0], e.pos[1], e.pos[2]];
      const h = ent ? ent.height : 2;
      const boss = (ent as unknown as { isBoss?: boolean } | undefined)?.isBoss;
      // a normal kill puff stays small (height is the rest-pose size of the visible model); only a boss gets the big one
      const scale = boss ? Math.max(0.7, Math.min(2.6, h / 2.2)) : Math.max(0.6, Math.min(0.9, h / 2.2));
      if (ent?.kind === 'player') return;
      const bones = isUndeadBones(ent);
      vfx.spawn(bones ? 'death_bones' : 'death_poof', p, { scale });
      if (boss) {
        vfx.spawn('shockwave', p, { scale: 2, color: 0xffd0a0 });
        vfx.spawn('death_poof', p, { scale: scale * 1.2 });
        vfx.lightFlash([p[0], p[1] + 2, p[2]], 0xffe0b0, 120, 0.5, 18);
      } else if (!bones && vfx.hitBudget > 0) {
        // killing blow pop
        vfx.spawn('hit_spark', [p[0], p[1] + h * 0.5, p[2]], { scale: 1.2 });
        // ... and a spray of blood flung away from the killer (the corpse flies with it)
        if (!isDry(ent) && vfx.hitBudget > 1) {
          vfx.hitBudget -= 2;
          vfx.spawn('hit_blood', [p[0], p[1] + h * 0.55, p[2]], { dir: dirAway(entity(e.killerId), ent, p), scale: Math.min(1.9, 1.15 * scale) });
        }
      }
    } catch (err) {
      console.warn('[vfx] death feedback failed', err);
    }
  });

  // low-health warning (VFX.updateLowHp pulses while the fraction is under 30%)
  ev.on('player:resources', (e) => {
    vfx.lowHpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  });
  ev.on('player:died', (e) => {
    if (e.local) vfx.lowHpFrac = 1;
  });

  ev.on('player:levelup', () => {
    try {
      const pl = G.player;
      if (!pl) return;
      vfx.spawn('level_up', [pl.position.x, 0, pl.position.z], { follow: pl.object3d });
    } catch (err) {
      console.warn('[vfx] levelup feedback failed', err);
    }
  });

  ev.on('player:revived', (e) => {
    try {
      const ent = entity(e.entityId);
      if (ent) vfx.spawn('respawn', [ent.position.x, 0, ent.position.z], { follow: ent.object3d });
    } catch {
      /* ignore */
    }
  });

  ev.on('player:xp', (e) => {
    try {
      const pl = G.player;
      if (!pl || e.gained <= 0) return;
      vfx.damageNumber([pl.position.x, pl.position.y + pl.height * 1.25, pl.position.z], e.gained, 'xp');
    } catch {
      /* ignore */
    }
  });

  ev.on('loot:pickedUp', (e) => {
    try {
      const pl = G.player;
      if (!pl) return;
      if (e.gold && e.gold > 0) vfx.damageNumber([pl.position.x, pl.position.y + pl.height * 1.1, pl.position.z], e.gold, 'gold');
      if (vfx.hitBudget > 0) vfx.spawn('gold_sparkle', [pl.position.x, pl.position.y + 0.9, pl.position.z], { scale: e.gold ? 0.7 : 0.5, color: e.item ? 0xffffff : undefined });
    } catch {
      /* ignore */
    }
  });

  ev.on('loot:dropped', (e) => {
    try {
      if (e.rarity !== 'legendary' && e.rarity !== 'set') return;
      const pl = G.player;
      if (pl && _v.set(e.pos[0], e.pos[1], e.pos[2]).distanceTo(pl.position) > 50) return;
      vfx.screenFlash(e.rarity === 'set' ? 'rgba(184,224,74,0.9)' : 'rgba(255,128,0,0.95)', 0.38, 0.7);
      vfx.spawn('upgrade_success', [e.pos[0], 0, e.pos[2]], { scale: 0.6, color: e.rarity === 'set' ? 0xb8e04a : 0xff8a10 });
    } catch {
      /* ignore */
    }
  });

  // ---- looping status effects
  ev.on('status:applied', (e) => {
    try {
      const ent = entity(e.targetId);
      if (!ent) return;
      const id = (STATUSES[e.status as StatusId]?.vfx ?? DEFAULT_STATUS_VFX[e.status]) as VfxId | undefined;
      if (!id) return;
      const key = `${e.targetId}:${e.status}`;
      const ex = vfx.status.get(key);
      const dur = Math.min(60, Math.max(0.5, e.duration)) + 0.15;
      if (ex && ex.alive) {
        (ex as VfxHandle & { setDuration?(s: number): void }).setDuration?.(dur);
        return;
      }
      const h = vfx.spawn(id, [ent.position.x, ent.position.y, ent.position.z], { follow: ent.object3d, duration: dur });
      if (h.alive) vfx.status.set(key, h);
    } catch (err) {
      console.warn('[vfx] status feedback failed', err);
    }
  });
  ev.on('status:removed', (e) => {
    const key = `${e.targetId}:${e.status}`;
    const h = vfx.status.get(key);
    if (h) {
      h.stop();
      vfx.status.delete(key);
    }
  });

  // ---- enemy windups
  const casts = new Map<number, VfxHandle>();
  ev.on('enemy:castStart', (e) => {
    try {
      const ent = entity(e.enemyId);
      if (!ent || e.castTime <= 0.15) return;
      const h = vfx.spawn('enemy_cast_glow', [ent.position.x, ent.position.y, ent.position.z], { follow: ent.object3d, duration: e.castTime });
      if (h.alive) casts.set(e.enemyId, h);
    } catch {
      /* ignore */
    }
  });
  ev.on('enemy:castEnd', (e) => {
    const h = casts.get(e.enemyId);
    if (h) {
      h.stop();
      casts.delete(e.enemyId);
    }
    if (e.interrupted) {
      const ent = entity(e.enemyId);
      if (ent) vfx.spawn('block_spark', [ent.position.x, ent.position.y + ent.height * 0.7, ent.position.z], { scale: 1.6, color: 0xffe08a });
    }
  });

  ev.on('boss:phase', (e) => {
    const ent = entity(e.entityId);
    if (ent) vfx.spawn('shockwave', [ent.position.x, 0, ent.position.z], { scale: 1.5, color: 0xff7040 });
  });

  ev.on('scene:leaving', () => {
    dotAt.clear();
    casts.clear();
    vfx.lowHpFrac = 1;
    vfx.clear();
  });
}

function dirAway(src: Entity | undefined, target: Entity | undefined, pos: [number, number, number]): [number, number, number] | undefined {
  const from = src ? src.position : G.camera ? undefined : undefined;
  if (from) {
    const tx = target ? target.position.x : pos[0];
    const tz = target ? target.position.z : pos[2];
    const dx = tx - from.x;
    const dz = tz - from.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.01) return [dx / l, 0.22, dz / l];
  }
  // no source: away from the camera
  const cam = G.engine?.activeCamera;
  if (cam) {
    const dx = pos[0] - cam.position.x;
    const dz = pos[2] - cam.position.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.01) return [dx / l, 0.22, dz / l];
  }
  return undefined;
}
