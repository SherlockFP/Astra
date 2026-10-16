import { G } from '../../../game/G';
import { getDungeon } from '../../../data/dungeons';
import { ENEMIES } from '../../../data/enemyKit';
import type { CharacterState } from '../../../systems/CharacterState';
import type { QuestObjectiveRow } from '../../../systems/Quests';
import type { DungeonDef } from '../../../types/dungeons';
import { getPinnedQuest, guideTargetPos, liveGuideTarget, npcWorldPos, townNpcName, townNpcPos, waypointKnown, worldDef, worldExtras, type Pt } from '../../hud/questMarks';
import { dungeonList } from './base';
import { unspentTalentPoints } from '../../hud/Extras';

/**
 * "Ne yapmalıyım?" advice (UI_REDESIGN §4.6). `recommend()` is pure with respect to the DOM: it only reads the character,
 * G.quests, the world definition and the dungeon list, so it can be checked from a console for any level.
 * OWNER: panels-game (UX-21).
 */

export interface GuideAdvice {
  quest: { id: string; name: string; state: 'ready' | 'active' | 'available'; level: number; main: boolean; giverNpcId?: string; rows: QuestObjectiveRow[] } | null;
  zone: { id: string; name: string; levels: [number, number]; fit: 'low' | 'fit' | 'high'; mobs: string[]; spots: { label: string; levels: [number, number] }[]; waypointId?: string; built: boolean } | null;
  dungeon: { id: string; name: string; levels: [number, number]; diff: 'normal' | 'heroic' | 'mythic' | 'mythicplus'; note: string; locked: boolean } | null;
  todo: { id: string; text: string; done: boolean; action?: { panel: string; data?: unknown } }[];
}

/** Open-world zones past the last region (§4.6). They are listed until their content exists. */
const EXTRA_ZONES: { id: string; name: string; levels: [number, number] }[] = [
  { id: 'karakir_bozkiri', name: 'Karakır Bozkırı', levels: [30, 45] }, // built: data/world/karakir*.ts (r7..r12, Ayaz Eteği is its r10)
  { id: 'ayaz_daglari', name: 'Ayaz Dağları', levels: [45, 60] }, // built: data/world/ayaz*.ts (r16..r21, Kartal Geçidi from Karakır r12)
  { id: 'ayaz_eteği', name: 'Ayaz Eteği (devamı)', levels: [41, 45] },
];

/** Below this level the dungeon card reads "unlocks at level N" (§4.6). */
const DUNGEON_MIN_LEVEL = 6;
const TODO_MAX = 6;

function enemyName(id: string): string {
  return ENEMIES[id]?.name ?? id;
}

/** Position of a quest giver for the current scene (town NPC in town, village NPC on the world map). */
export function giverPosition(npcId: string): Pt | null {
  const inTown = G.ui?.mode === 'town';
  return inTown ? townNpcPos(npcId) : npcWorldPos(npcId);
}

function pickQuest(ch: CharacterState): GuideAdvice['quest'] {
  const q = G.quests;
  if (!q) return null;
  const L = ch.save.level;
  const all = q.all();
  const stateOf = (id: string) => q.state(id);
  const make = (d: (typeof all)[number], state: 'ready' | 'active' | 'available'): NonNullable<GuideAdvice['quest']> => ({
    id: d.id,
    name: d.name,
    state,
    level: d.level,
    main: !!d.main,
    giverNpcId: d.giver,
    rows: q.progressRows(d.id),
  });
  // (1) any ready quest
  const ready = all.find((d) => stateOf(d.id) === 'ready');
  if (ready) return make(ready, 'ready');
  // (2) the pinned active quest
  const pinned = getPinnedQuest();
  const pinnedDef = pinned ? all.find((d) => d.id === pinned) : undefined;
  if (pinnedDef && stateOf(pinnedDef.id) === 'active') return make(pinnedDef, 'active');
  // (3) the active quest with the lowest level
  const active = all.filter((d) => stateOf(d.id) === 'active').sort((a, b) => a.level - b.level);
  if (active[0]) return make(active[0], 'active');
  // (4) the lowest-level available main quest within two levels above the character
  const mains = all.filter((d) => stateOf(d.id) === 'available' && d.main && d.level <= L + 2).sort((a, b) => a.level - b.level);
  if (mains[0]) return make(mains[0], 'available');
  // (5) the lowest-level available side quest of the recommended region
  const zone = recommendZone(L);
  const side = all.filter((d) => stateOf(d.id) === 'available' && !d.main && zone && d.region === zone.id).sort((a, b) => a.level - b.level);
  if (side[0]) return make(side[0], 'available');
  return null;
}

function recommendZone(L: number): GuideAdvice['zone'] {
  const ext = worldExtras();
  const def = worldDef();
  const regions = ext?.regions ?? [];
  let pick: { id: string; name: string; levels: [number, number]; roomId?: string; built: boolean } | null = null;
  if (regions.length && L <= 30) {
    const r = regions.find((x) => L < x.levels[1]) ?? regions[regions.length - 1];
    pick = { id: r.id, name: r.name, levels: r.levels, roomId: r.roomId, built: true };
  } else if (L <= 45) {
    const z = EXTRA_ZONES.find((x) => L <= x.levels[1]) ?? EXTRA_ZONES[EXTRA_ZONES.length - 1];
    pick = { id: z.id, name: z.name, levels: z.levels, built: !!getDungeon(z.id) };
  } else return null;

  const [lo, hi] = pick.levels;
  const fit: 'low' | 'fit' | 'high' = L < lo - 2 ? 'low' : L > hi + 3 ? 'high' : 'fit';
  const mobs: string[] = [];
  const spots: { label: string; levels: [number, number] }[] = [];
  let waypointId: string | undefined;
  if (pick.roomId && def && ext) {
    const roomId = pick.roomId;
    for (const p of def.packs) {
      if (p.roomId !== roomId) continue;
      for (const m of p.members) {
        const n = enemyName(m.enemyId);
        if (!mobs.includes(n) && mobs.length < 3) mobs.push(n);
      }
    }
    for (const t of ext.metin.tiers) {
      if (t.regionId === pick.id) spots.push({ label: `Metin Taşı · ${enemyName(t.enemyId)}`, levels: [t.level, t.level] });
    }
    for (const mb of ext.minibosses) {
      if (mb.regionId === pick.id) spots.push({ label: `${enemyName(mb.enemyId)} (mini boss)`, levels: [mb.level, mb.level] });
    }
    waypointId = ext.waypoints.find((w) => w.regionId === pick!.id)?.id;
  }
  spots.sort((a, b) => Math.abs(a.levels[0] - L) - Math.abs(b.levels[0] - L));
  return { id: pick.id, name: pick.name, levels: [lo, hi], fit, mobs, spots: spots.slice(0, 2), waypointId, built: pick.built };
}

function recommendDungeon(L: number): GuideAdvice['dungeon'] {
  const list: DungeonDef[] = dungeonList();
  if (!list.length) return null;
  const fits = list.filter((d) => {
    const r = d.levelRange ?? [0, 0];
    return r[0] - 2 <= L && L <= r[1] + 4;
  });
  let pick: DungeonDef | undefined;
  if (fits.length) {
    pick = fits.reduce((best, d) => {
      const mid = (d.levelRange[0] + d.levelRange[1]) / 2;
      const bm = (best.levelRange[0] + best.levelRange[1]) / 2;
      return Math.abs(mid - L) < Math.abs(bm - L) ? d : best;
    });
  } else pick = list.find((d) => (d.levelRange?.[0] ?? 0) > L);
  if (!pick) return null;
  const lo = pick.levelRange[0];
  const locked = L < DUNGEON_MIN_LEVEL;
  return {
    id: pick.id,
    name: pick.name,
    levels: [lo, pick.levelRange[1]],
    // TODO(UX-21 follow-up): heroic / mythic / mythic+ follow the ladder clears (difficultyState); normal until then
    diff: 'normal',
    note: locked ? `Seviye ${lo}'de açılır` : 'Normal',
    locked,
  };
}

function buildTodo(ch: CharacterState, quest: GuideAdvice['quest']): GuideAdvice['todo'] {
  const L = ch.save.level;
  const flags = ch.save.flags;
  const out: GuideAdvice['todo'] = [];
  if (quest) {
    quest.rows.forEach((r, i) => {
      if (r.done || out.length >= 3) return;
      out.push({ id: `obj-${quest.id}-${i}`, text: `${r.text}  ${Math.min(r.have, r.need)} / ${r.need}`, done: false, action: { panel: 'questlog' } });
    });
  }
  const ranks = ch.save.skillRanks ?? {};
  const learned = Object.keys(ranks).filter((id) => (ranks[id] ?? 0) > 0);
  const onBar = new Set(Object.values(ch.save.skillBar ?? {}));
  // region hub signposts: level 10 starts Haydut Tepeleri (Kızılkaya), level 15 Ağıt Bataklığı (Bataklık Konak)
  if (L >= 10 && L < 15) out.push({ id: 'hub-r3', text: "Kızılkaya Karakolu'na git: Komutan Aslan ve Avcı Karaca görev verir", done: false, action: { panel: 'map' } });
  if (L >= 15 && L < 21) out.push({ id: 'hub-r4', text: "Bataklık Konak'a git: Bekçi Nazlı, Demirci Kadir ve Otacı Filiz görev verir", done: false, action: { panel: 'map' } });
  if (learned.some((id) => !onBar.has(id))) out.push({ id: 'skill-slot', text: 'Yeni beceriyi çubuğa yerleştir (K)', done: false, action: { panel: 'skills' } });
  if (L >= 10 && !ch.save.spec) out.push({ id: 'spec', text: 'Uzmanlık seç (N)', done: false, action: { panel: 'talents' } });
  const unspent = unspentTalentPoints();
  if (unspent > 0) out.push({ id: 'points', text: `Harcanmamış puanların var (${unspent})`, done: false, action: { panel: 'talents' } });
  if (L >= 5) out.push({ id: 'smith', text: "Demirci'de eşyalarını yükselt", done: !!flags['onb.smith'], action: { panel: 'map' } });
  if (L >= 5) out.push({ id: 'bounty', text: 'Günlük görevler: İlan Tahtası', done: false, action: { panel: 'bounty' } });
  if (L >= 8) out.push({ id: 'finder', text: "Zindan Bulucu'yu dene (I)", done: !!flags['onb.finder'], action: { panel: 'finder' } });
  if (L >= 5) {
    const bio = G.quests?.bioCompleted() ?? 0;
    out.push({ id: 'bio', text: 'Av Defteri: Avcı Yıldız ile konuş', done: bio > 0, action: { panel: 'questlog' } });
  }
  // done items sink to the bottom, at most six rows
  return out.sort((a, b) => Number(a.done) - Number(b.done)).slice(0, TODO_MAX);
}

/**
 * The advice for one character (§4.6). Quest: ready > pinned active > lowest active > lowest available main within L+2 >
 * lowest available side quest of the recommended region. Zone: first region with L < its top level (above 30 the bozkır and
 * ayaz zones; above 45 none). Dungeon: the best fit by level band. Todo: the chosen quest's open objectives plus the chores.
 */
export function recommend(ch: CharacterState): GuideAdvice {
  const quest = pickQuest(ch);
  const zone = recommendZone(ch.save.level);
  const dungeon = recommendDungeon(ch.save.level);
  return { quest, zone, dungeon, todo: buildTodo(ch, quest) };
}

/** One line for the tracker `hint` pane and the welcome card (`Yağmacı Başı: Gırtlak'ı öldür`). */
export function adviceSummary(a: GuideAdvice): string {
  if (a.quest) {
    // not accepted yet: point at the GIVER (WoW: an available quest's "!" is its giver), never at the objective's NPC
    if (a.quest.state === 'available') {
      return a.quest.giverNpcId ? `${a.quest.name}: ${townNpcName(a.quest.giverNpcId)}'den al` : a.quest.name;
    }
    const open = a.quest.rows.find((r) => !r.done);
    return open ? `${a.quest.name}: ${open.text}` : a.quest.name;
  }
  if (a.dungeon?.locked) return `Seviye ${a.dungeon.levels[0]}'de zindanlar açılır`;
  if (a.zone) return `${a.zone.name} bölgesinde av`;
  return '';
}

/** Objective point of a quest row for the guide's "Haritada" button (world map or town), or null. */
export function questFocusPos(questId: string): Pt | null {
  const d = G.quests?.def(questId);
  const o = d?.objectives.find((x, i) => !G.quests?.progressRows(questId)[i]?.done);
  if (!o) return null;
  const p = guideTargetPos(o, G.ui?.mode === 'town', d?.region, d?.place, d?.level);
  return p ? { x: p.x, z: p.z } : null;
}

/** True when the waypoint of a zone is discovered (the "Işınlan" button). */
export function zoneWaypointKnown(waypointId: string | undefined): boolean {
  return !!waypointId && waypointKnown(waypointId);
}

let lineAt = -Infinity;
let line = '';
let lineAvail = false;
/** Refreshes the cached advice (at most once a second). */
function refreshAdvice(): void {
  const now = performance.now();
  if (now - lineAt < 1000) return;
  lineAt = now;
  const ch = G.character;
  line = '';
  lineAvail = false;
  if (ch) {
    try {
      const a = recommend(ch);
      line = adviceSummary(a);
      // a quest the player has not accepted yet: the tracker labels it "Alınacak"
      lineAvail = a.quest?.state === 'available';
    } catch {
      line = '';
    }
  }
}

/**
 * The tracker's `hint` line (HudApi.adviceLine). The tracker asks every frame, so the advice is recomputed at most once a
 * second.
 */
export function adviceLine(): string {
  refreshAdvice();
  return line;
}

/** True when adviceLine() names a quest that is not accepted yet (shown as "Alınacak", never as an active quest). */
export function adviceAvailable(): boolean {
  refreshAdvice();
  return lineAvail;
}

/**
 * "Ne yapmalıyım?" in one sentence (the tracker footer, §4.4): the next action, the place it is and how far. Reads the objective
 * arrow's live target and the recommended quest for its state. `dist` is the formatted distance ('' when there is none).
 * Empty when there is nothing to do.
 */
export function nextActionLine(dist: string): string {
  const ch = G.character;
  if (!ch) return '';
  const t = liveGuideTarget();
  let quest: GuideAdvice['quest'] = null;
  try {
    quest = recommend(ch).quest;
  } catch {
    quest = null;
  }
  const tail = t ? [t.label, dist].filter(Boolean).join(' · ') : dist;
  const sep = tail ? ` · ${tail}` : '';
  if (!quest) return t ? `Sonraki: ${tail}` : '';
  if (quest.state === 'ready') return `Sonraki: "${quest.name}" görevini teslim et${sep}`;
  if (quest.state === 'available') {
    const giver = quest.giverNpcId ? townNpcName(quest.giverNpcId) : '';
    return giver ? `Sonraki: ${giver}'den "${quest.name}" görevini al${sep}` : `Sonraki: "${quest.name}" görevini al${sep}`;
  }
  const row = quest.rows.find((r) => !r.done);
  const step = row ? `${row.text} ${Math.min(row.have, row.need)} / ${row.need}` : quest.name;
  return `Sonraki: ${step}${sep}`;
}
