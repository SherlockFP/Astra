import { G } from '../game/G';
import { currentWeek } from '../data/mythicAffixes';
import { ArenaLadder } from './ArenaLadder';
import { bountyDayKey } from './Bounties';
import { fetihThisWeek, grantFetih, grantOnur, onurToday } from './PvpGear';
import { emit, toast } from './notify';
import { QueueService } from '../net/queue/QueueService';
import { arenaTitleName } from '../scenes/arena/arenaRules';

/**
 * Boots the arena services (GDD_PVP_FINDER): `G.arenaLadder` (ratings / MMR / season / tiers, persisted in CharacterSave.arena, rewards
 * through systems/PvpGear.ts) and `G.net.queue` (matchmaking on the global lobby). Called once from game/Game.ts createServices().
 * Both read G.character lazily, so they can be created before a character is selected.
 */
export function installArena(): { ladder: ArenaLadder; queue: QueueService } {
  const ladder = new ArenaLadder({
    save: () => G.character?.save ?? null,
    persist: () => G.character?.persist(),
    week: () => currentWeek(),
    day: () => bountyDayKey(),
    nowMs: () => Date.now(),
    addMaterial: (id, n) => G.character?.addMaterial(id, n),
    grantOnur: (n) => grantOnur(n, 'arena'),
    grantFetih: (n) => grantFetih(n),
    onurToday: () => onurToday(),
    fetihWeek: () => fetihThisWeek(),
    // the lifetime Onur counter (achievement metric) and the 'pvp:honor' event, like the world PvP kill path
    onHonor: (n) => {
      const rec = G.character?.pvpRecord();
      if (!rec) return;
      rec.honourTotal += n;
      emit('pvp:honor', { amount: n, total: rec.honourTotal, rank: 0 });
    },
    onRating: (bracket, before, after) => emit('pvp:rating', { bracket, before, after }),
    onTitle: (id) => toast(`Yeni unvan: ${arenaTitleName(id) ?? id}`, 'levelup'),
  });
  G.arenaLadder = ladder;
  const queue = new QueueService();
  G.net.queue = queue;
  return { ladder, queue };
}
