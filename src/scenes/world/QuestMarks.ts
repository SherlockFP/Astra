import { G } from '../../game/G';
import { NPC, type NpcQuestMark } from '../../entities/NPC';
import type { World } from '../../world/World';
import type { EventScope } from '../../core/EventBus';

/**
 * Quest markers over the quest givers (town and open world, GDD_OPENWORLD §6.1): '!' yellow = a quest is on offer, '?' gold =
 * a quest is ready to turn in here, grey '!' = the next quest of this giver waits for the level. OWNER: scenes module.
 * The markers are NPC labels (NPC.setQuestMark); state comes from G.quests, so the local character sees its own quests.
 */

const RANK: Record<NpcQuestMark, number> = { turnin: 3, offer: 2, locked: 1 };

/** The marker of one quest giver (TownNpc id): the most urgent of its quests, or null. */
export function questMarkFor(npcId: string): NpcQuestMark | null {
  const q = G.quests;
  const ch = G.character;
  if (!q || !ch) return null;
  let best: NpcQuestMark | null = null;
  for (const def of q.all()) {
    const talkIdx = def.objectives.findIndex((o) => o.kind === 'talk' && o.target === npcId);
    if (def.giver !== npcId && def.turnIn !== npcId && talkIdx < 0) continue;
    const s = q.state(def.id);
    let mark: NpcQuestMark | null = null;
    if (s === 'ready' && (def.turnIn ?? def.giver) === npcId) mark = 'turnin';
    // an active quest whose open objective is "talk to this NPC" (Kuzgun'un Çağrısı -> Muhtar Ferhat): the talk completes it, so this NPC
    // is where the quest goes next; without this it showed a grey "locked" mark (or none) and the arrow was the only hint
    else if (s === 'active' && talkIdx >= 0 && !q.progressRows(def.id)[talkIdx]?.done) mark = 'turnin';
    else if (s === 'available' && def.giver === npcId) mark = 'offer';
    else if (s === 'locked' && def.giver === npcId && ch.level < def.level && (def.prereq ?? []).every((p) => q.state(p) === 'done')) {
      mark = 'locked';
    }
    if (mark && (!best || RANK[mark] > RANK[best])) best = mark;
  }
  return best;
}

/** Refresh the marker of every NPC of the list (NPCs that carry quests only; the others never get one). */
export function refreshQuestMarks(npcs: NPC[]): void {
  for (const n of npcs) {
    if (n.removed) continue;
    n.setQuestMark(questMarkFor(n.def.id));
  }
}

/**
 * Keeps the quest markers of the NPCs in `world` in sync: now, and on every quest update or level-up of the local character.
 * Call it after the NPCs are spawned; the subscriptions end with the scene's event scope.
 */
export function bindQuestMarks(scope: EventScope, world: World): void {
  const npcs: NPC[] = [];
  for (const e of world.entities.values()) {
    if (e instanceof NPC && (e.def.quests?.length ?? 0) > 0) npcs.push(e);
  }
  if (!npcs.length) return;
  const run = (): void => refreshQuestMarks(npcs);
  scope.on('quest:updated', run);
  scope.on('player:levelup', run);
  run();
}
