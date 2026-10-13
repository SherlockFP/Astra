import { G } from '../game/G';
import type { AchievementSave, CharacterSave } from '../types/character';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, METRIC_KIND, type AchMetric, type AchievementDef } from '../data/achievements';
import { toast } from './notify';

/**
 * WP-08 achievements and titles (docs/MMO_PILLARS.md). OWNER: panels-game / items (new system).
 *
 * Progress lives in `CharacterSave.achievements` (optional, created on first use, see types/character.ts). The pure functions
 * below work on a save only, so the headless sim (dev/combat-sim/achievements.mjs) can drive them. `installAchievements()`
 * subscribes to the existing game events of the LOCAL character and feeds the metrics; an unlock toasts, plays the
 * achievement sound, writes a system chat line, tells the party when online, and emits `achievement:unlocked`.
 */

/** Boss kills with the same boss id and entity id within this window count once (two sources can report one kill). */
const BOSS_DEDUPE_MS = 30_000;

// ---------------------------------------------------------------------------------------------- save helpers (pure)

/** The character's achievement block, created on first use. Missing parts of an older block are filled in. */
export function achSave(save: CharacterSave): AchievementSave {
  const a = (save.achievements ??= { prog: {}, sets: {}, done: {} });
  a.prog ??= {};
  a.sets ??= {};
  a.done ??= {};
  return a;
}

/** `add` metric: adds `amount` to the counter. Ignored for other kinds. */
export function bump(save: CharacterSave, metric: AchMetric, amount = 1): void {
  if (METRIC_KIND[metric] !== 'add' || !(amount > 0)) return;
  const a = achSave(save);
  a.prog[metric] = (a.prog[metric] ?? 0) + amount;
}

/** `max` metric: keeps the highest value seen. Ignored for other kinds. */
export function raise(save: CharacterSave, metric: AchMetric, value: number): void {
  if (METRIC_KIND[metric] !== 'max' || !Number.isFinite(value)) return;
  const a = achSave(save);
  a.prog[metric] = Math.max(a.prog[metric] ?? 0, value);
}

/** `set` metric: records a distinct id. Returns true when the id is new. Ignored for other kinds. */
export function addToSet(save: CharacterSave, metric: AchMetric, key: string): boolean {
  if (METRIC_KIND[metric] !== 'set' || !key) return false;
  const a = achSave(save);
  const list = (a.sets[metric] ??= []);
  if (list.includes(key)) return false;
  list.push(key);
  return true;
}

/** Current progress of one achievement (counter, highest value or distinct count). */
export function progressOf(save: CharacterSave, def: AchievementDef): number {
  const a = achSave(save);
  if (METRIC_KIND[def.metric] === 'set') return a.sets[def.metric]?.length ?? 0;
  return a.prog[def.metric] ?? 0;
}

export function isUnlocked(save: CharacterSave, id: string): boolean {
  return achSave(save).done[id] !== undefined;
}

/** Points of every unlocked achievement. */
export function totalPoints(save: CharacterSave): number {
  return ACHIEVEMENTS.reduce((sum, def) => (isUnlocked(save, def.id) ? sum + def.points : sum), 0);
}

/**
 * Unlocks every achievement whose progress reached its target. Each one unlocks once (`done` keeps the time); a title
 * is added to `save.titles` (ids = achievement ids). Returns the newly unlocked definitions, in catalogue order.
 */
export function checkUnlocks(save: CharacterSave, now = Date.now()): AchievementDef[] {
  const a = achSave(save);
  const fresh: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (a.done[def.id] !== undefined) continue;
    if (progressOf(save, def) < def.target) continue;
    a.done[def.id] = now;
    if (def.title) {
      save.titles ??= [];
      if (!save.titles.includes(def.id)) save.titles.push(def.id);
    }
    fresh.push(def);
  }
  return fresh;
}

/** Chooses the displayed title (an earned title id) or clears it with null. False when the title is not earned. */
export function chooseTitle(save: CharacterSave, id: string | null): boolean {
  if (id === null) {
    delete save.title;
    return true;
  }
  if (!(save.titles ?? []).includes(id) || !ACHIEVEMENT_BY_ID[id]?.title) return false;
  save.title = id;
  return true;
}

/** Display text of a title id (the achievement's title). */
export function titleName(id: string): string {
  return ACHIEVEMENT_BY_ID[id]?.title ?? id;
}

/** The title a character shows (nameplate, character header): '' when none is chosen or it is no longer earned. */
export function selectedTitleName(save: CharacterSave | undefined): string {
  const id = save?.title;
  if (!id || !(save?.titles ?? []).includes(id)) return '';
  return ACHIEVEMENT_BY_ID[id]?.title ?? '';
}

/**
 * One-time backfill (`achievements.v` 1) from counters the game already keeps, so a character made before WP-08 gets its
 * earned achievements on the next scene change. Also keeps the level maximum current. Returns the new unlocks.
 */
export function backfill(save: CharacterSave, now = Date.now()): AchievementDef[] {
  const a = achSave(save);
  if ((a.v ?? 0) < 1) {
    a.v = 1;
    const st = save.stats;
    a.prog.kills = Math.max(a.prog.kills ?? 0, st?.kills ?? 0);
    a.prog.bossKills = Math.max(a.prog.bossKills ?? 0, st?.bossKills ?? 0);
    a.prog.dungeonClears = Math.max(a.prog.dungeonClears ?? 0, st?.dungeonsCompleted ?? 0);
    for (const [key, value] of Object.entries(save.flags)) {
      if (value !== 'done' && value !== true) continue;
      if (key.startsWith('world.wp.')) addToSet(save, 'waypoints', key.slice('world.wp.'.length));
      else if (key.startsWith('world.region.')) addToSet(save, 'regions', key.slice('world.region.'.length));
      else if (key.startsWith('q.') && key.split('.').length === 2) addToSet(save, 'quests', key.slice(2));
    }
  }
  raise(save, 'level', save.level);
  return checkUnlocks(save, now);
}

// ---------------------------------------------------------------------------------------------- game wiring

/** Applies one metric change to the local character, then unlocks and announces what it completed. */
export function feed(change: (save: CharacterSave) => void): void {
  const ch = G.character;
  if (!ch) return;
  try {
    change(ch.save);
    for (const def of checkUnlocks(ch.save)) announce(def);
    ch.persist();
  } catch (e) {
    console.warn('[achievements] update failed', e);
  }
}

function announce(def: AchievementDef): void {
  const ch = G.character;
  if (!ch) return;
  const ev = G.events;
  toast(`Başarım kazanıldı: ${def.name} (+${def.points} puan)${def.title ? ` · Unvan: ${def.title}` : ''}`, 'success');
  try {
    G.audio?.play('achievement');
  } catch {
    /* audio unavailable */
  }
  ev.emit('net:chat', { from: '', text: `${def.name} başarımını kazandın!`, channel: 'system' });
  if (G.net?.isOnline) G.net.sendChat(`${ch.save.name}: ${def.name} başarımını kazandı!`);
  ev.emit('achievement:unlocked', { id: def.id, name: def.name, points: def.points, title: def.title });
}

/** Chooses the title of the local character and saves it. */
export function setTitle(id: string | null): boolean {
  const ch = G.character;
  if (!ch || !chooseTitle(ch.save, id)) return false;
  ch.persist();
  G.events?.emit('ui:toast', { text: id ? `Unvan seçildi: ${titleName(id)}` : 'Unvan kaldırıldı.', kind: 'info' });
  return true;
}

/**
 * Subscribes the achievement metrics to the game events (LOCAL character only). Returns the disposer.
 * Called once from game/Game.ts createServices(); it reads G.character lazily, so it is safe before a character exists.
 */
export function installAchievements(): () => void {
  const ev = G.events;
  if (!ev) return () => {};
  const bossSeen = new Map<string, number>();
  const offs: (() => void)[] = [
    // Seviye
    ev.on('player:levelup', ({ level }) => feed((s) => raise(s, 'level', level))),
    ev.on('scene:changed', () => {
      const ch = G.character;
      if (!ch) return;
      try {
        for (const def of backfill(ch.save)) announce(def);
        ch.persist();
      } catch (e) {
        console.warn('[achievements] backfill failed', e);
      }
    }),
    // Keşif
    ev.on('waypoint:discovered', ({ id }) => feed((s) => addToSet(s, 'waypoints', id))),
    ev.on('world:regionEntered', ({ regionId }) => feed((s) => addToSet(s, 'regions', regionId))),
    // Görev
    ev.on('quest:updated', ({ questId, state }) => {
      if (state === 'done') feed((s) => addToSet(s, 'quests', questId));
    }),
    // Zindan / Mitik+
    ev.on('run:completed', ({ state }) => {
      if (!state.completed || state.failed) return;
      feed((s) => {
        bump(s, 'dungeonClears');
        addToSet(s, 'dungeonsSeen', state.dungeonId);
        if (state.difficulty === 'mythicplus') {
          bump(s, 'mplusClears');
          raise(s, 'mplusKey', state.keyLevel);
          if (state.inTime) bump(s, 'mplusInTime');
        } else if (state.difficulty === 'mythic') {
          bump(s, 'mythicClears');
        }
      });
    }),
    ev.on('boss:defeated', ({ bossId, entityId }) => {
      const key = `${bossId}:${entityId}`;
      const now = Date.now();
      if (now - (bossSeen.get(key) ?? -Infinity) < BOSS_DEDUPE_MS) return;
      bossSeen.set(key, now);
      feed((s) => bump(s, 'bossKills'));
    }),
    // Savaş
    ev.on('death', ({ entityId, killerId }) => {
      if (!G.player || killerId !== G.player.id) return;
      const def = (G.world?.entities.get(entityId) as { def?: { id?: string } } | undefined)?.def;
      const id = def?.id ?? '';
      if (id.startsWith('metin_') || id.startsWith('proc_')) return; // Metin stones and mechanic units are not kills
      feed((s) => bump(s, 'kills'));
    }),
    ev.on('parry', ({ perfect }) => {
      if (perfect) feed((s) => bump(s, 'perfectParry'));
    }),
    ev.on('crit:finisher', () => feed((s) => bump(s, 'finishers'))),
    ev.on('major:used', ({ casterId }) => {
      if (G.player && casterId === G.player.id) feed((s) => bump(s, 'majors'));
    }),
    ev.on('pvp:honor', ({ total }) => feed((s) => raise(s, 'honor', total))),
    ev.on('combo:route', ({ id }) => feed((s) => addToSet(s, 'routes', id))),
    // Toplama / Ekonomi
    ev.on('player:gold', ({ delta }) => {
      if (delta > 0) feed((s) => bump(s, 'goldEarned', delta));
    }),
    ev.on('item:upgraded', ({ success, destroyed, newLevel }) => {
      if (!success || destroyed) return;
      feed((s) => {
        bump(s, 'upgradeOk');
        raise(s, 'upgradeMax', newLevel);
      });
    }),
    ev.on('gather:done', ({ ok }) => {
      if (ok) feed((s) => bump(s, 'gathers'));
    }),
    ev.on('profession:skillUp', ({ skill }) => feed((s) => raise(s, 'profSkill', skill))),
    ev.on('market:sale', () => feed((s) => bump(s, 'sales'))),
    ev.on('loot:pickedUp', ({ item }) => {
      if (item?.rarity === 'legendary') feed((s) => bump(s, 'legendary'));
    }),
    ev.on('player:mounted', ({ on }) => {
      if (on) feed((s) => raise(s, 'mount', 1));
    }),
    // Sosyal
    ev.on('net:peerJoined', () => feed((s) => bump(s, 'partyJoins'))),
    ev.on('chat:line', ({ channel, local }) => {
      if (!local) return;
      feed((s) => {
        bump(s, 'chats');
        if (channel === 'whisper') bump(s, 'whispers');
        else if (channel === 'emote') bump(s, 'emotes');
      });
    }),
  ];
  return () => {
    for (const off of offs) off();
    bossSeen.clear();
  };
}
