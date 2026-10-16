/**
 * First-10-minutes guide (WoW-style): the step state machine. Pure: no DOM, no G, so dev/combat-sim/onboarding.mjs can drive it.
 * The HUD (ui/hud/Onboarding.ts) feeds it game events and writes the flags it returns; the state lives in the character save
 * as APPEND-ONLY flags: `onb.s.<stepId>` (step done), `onb.k.<slot>` (a bar key used in the skills step), `onb.skip` (skipped
 * by the player or by a character that started after the guide existed), `onb.done` (every step done).
 * Beta characters never get the guide (`beta` in the save), see `guideWanted`.
 */

/** Skill bar slots the skills step counts: every main-bar ability slot, since the opening kit fills s2 (WoW Q) at level 1 too. */
export const GUIDE_SKILL_SLOTS = ['rmb', 'q', 'e', 'r', 's1', 's2', 's3', 's4'] as const;
/** Distinct bar keys the skills step needs ("4 yeteneğini kullan"). */
export const GUIDE_SKILL_NEED = 4;
/** Walking this far (m) counts as the movement step. */
export const GUIDE_WALK_M = 3;
/** Quest giver of the first quest (town.ts npc_muhtar). */
export const GUIDE_NPC = 'npc_muhtar';

/** Where the on-screen highlight points. `key` = an action's key cap, `slot` = an action bar cell, `panel` = a micro-menu button. */
export type GuideAnchor = { kind: 'none' } | { kind: 'key'; action: string } | { kind: 'slot'; slot: string } | { kind: 'panel'; panel: string; key?: string } | { kind: 'flask' };

export interface GuideStep {
  id: string;
  /** Short Turkish title (the card header). */
  title: string;
  /** One or two short Turkish sentences. `{k:action}` is replaced with the live key label by the HUD. */
  text: string;
  anchor: GuideAnchor;
  /** Not shown (and not counted) below this level. */
  minLevel?: number;
  /** The card waits (and the highlight stays off) until the character has taken damage (flag `onb.hurt`). */
  needsHurt?: boolean;
  /** The card waits until this quest is active (the step is about a quest that unlocks later). */
  needsQuest?: string;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  { id: 'move', title: 'Hareket', text: 'Yürümek için {k:moveForward} {k:moveLeft} {k:moveBack} {k:moveRight}. Kamerayı çevirmek için sol tuşu basılı tutup sürükle.', anchor: { kind: 'none' } },
  { id: 'talk', title: 'Muhtar ile konuş', text: 'Haritadaki ! işaretine git ve {k:interact} ile Muhtar Cemal ile konuş.', anchor: { kind: 'key', action: 'interact' } },
  { id: 'accept', title: 'Görev al', text: 'Muhtar Cemal’in görevini kabul et. Görev takipçisinde hedefini göreceksin.', anchor: { kind: 'none' } },
  { id: 'attack', title: 'Düşman seç ve saldır', text: 'Bir düşmana sağ tıkla ya da yeteneğe bas: hedef otomatik seçilir ve saldırı başlar.', anchor: { kind: 'slot', slot: 'rmb' } },
  { id: 'skills', title: '4 yeteneğini kullan', text: 'Çubuktaki yetenekleri {k:skill_rmb} {k:skill_q} {k:skill_e} {k:skill_r} tuşlarıyla dört kez farklı kullan.', anchor: { kind: 'slot', slot: 'q' } },
  { id: 'flask', title: 'İksir kullan', text: 'Bir düşman sana vurdu. Can düşünce iksir kemerindeki şişeye tıkla ya da {k:flask1} bas.', anchor: { kind: 'flask' }, needsHurt: true },
  { id: 'loot', title: 'Ganimet topla', text: 'Yere düşen eşyaya ya da altına yaklaş; topladığında bu adım tamamlanır.', anchor: { kind: 'none' } },
  { id: 'bag', title: 'Çantanı aç', text: 'Çantanı açmak için {k:inventory} tuşuna bas.', anchor: { kind: 'panel', panel: 'inventory', key: 'inventory' } },
  { id: 'equip', title: 'Eşya giy', text: 'Çantadaki bir eşyaya çift tıkla ya da sürükleyip ekipman yuvasına bırak.', anchor: { kind: 'panel', panel: 'inventory' } },
  { id: 'sp', title: 'Yeni yetenek', text: 'Seviye atlayınca Yetenek Kitabı’nı ({k:skills}) aç, puanını bir beceriye harca ve yeni yeteneği çubuğa sürükle.', anchor: { kind: 'panel', panel: 'skills', key: 'skills' } },
  { id: 'turnin', title: 'Görevi teslim et', text: 'Görev hedefini tamamla, sonra görevi Muhtar Cemal’e teslim et ve ödülünü seç.', anchor: { kind: 'none' } },
  { id: 'map', title: 'Harita', text: 'Dünya haritasını {k:map} ile aç; bölgeler, zindanlar ve ışınlanma noktaları orada.', anchor: { kind: 'panel', panel: 'map', key: 'map' } },
  { id: 'finder', title: 'Zindan Bulucu', text: 'Mağaradaki Sis görevi açıldı. Zindan Bulucu’yu {k:groupFinder} ile aç ve girişi bul.', anchor: { kind: 'panel', panel: 'finder', key: 'groupFinder' }, needsQuest: 'sq_g_07_magaradaki_sis' },
];

/** Events the HUD feeds in. `move` = walked GUIDE_WALK_M, `talk` = the NPC dialog opened, `accept` / `turnin` = the Muhtar quest. */
export type GuideEvent =
  | { k: 'move' }
  | { k: 'talk' }
  | { k: 'accept' }
  | { k: 'hit' }
  | { k: 'cast'; slot: string }
  | { k: 'loot' }
  | { k: 'panel'; panel: string; open: boolean }
  | { k: 'equip' }
  | { k: 'sp' }
  | { k: 'turnin' }
  | { k: 'flask' }
  /** The HUD's fallback for the flask step: HP is full and the step has been shown for FLASK_IDLE_S without a flask use. */
  | { k: 'flaskIdle' };

/** Seconds the flask step is shown (HP regenerated to full, no flask used) before it completes by itself. */
export const FLASK_IDLE_S = 60;

/** Save-derived state. `done` = completed step ids, `slots` = bar keys used in the skills step. */
export interface GuideState {
  done: string[];
  slots: string[];
  skipped: boolean;
}

/** Minimal save view: only the flags are read. */
export interface GuideSave {
  beta?: boolean;
  level: number;
  flags: Record<string, number | boolean | string>;
}

const on = (v: unknown): boolean => !!v;

/** The guide state from the save flags (any non-empty flag value counts as set). */
export function stateFromFlags(flags: Record<string, number | boolean | string>): GuideState {
  const done = GUIDE_STEPS.filter((s) => on(flags[`onb.s.${s.id}`])).map((s) => s.id);
  const slots = GUIDE_SKILL_SLOTS.filter((s) => on(flags[`onb.k.${s}`]));
  return { done, slots, skipped: on(flags['onb.skip']) || on(flags['onb.done']) };
}

/**
 * Flags to write so the save reflects `next`. Only ever ADDS flags (append-only): a flag that is already set is never returned
 * again and nothing is removed.
 */
export function flagsToWrite(flags: Record<string, number | boolean | string>, next: GuideState): string[] {
  const out: string[] = [];
  for (const id of next.done) if (!on(flags[`onb.s.${id}`])) out.push(`onb.s.${id}`);
  for (const s of next.slots) if (!on(flags[`onb.k.${s}`])) out.push(`onb.k.${s}`);
  if (next.skipped && !on(flags['onb.skip']) && !on(flags['onb.done'])) out.push('onb.skip');
  if (next.done.length === GUIDE_STEPS.length && !on(flags['onb.done'])) out.push('onb.done');
  return out;
}

/** Whether a character should run the guide at all (beta characters never do; a finished or skipped guide stays off). */
export function guideWanted(save: GuideSave): boolean {
  if (save.beta) return false;
  const st = stateFromFlags(save.flags);
  return !st.skipped;
}

/**
 * The step to show now: the first step that is not done, whose `minLevel` the character has reached and that `available`
 * accepts (the HUD's wait rules: a step waiting for a hit or a quest is skipped, so it never blocks the steps after it).
 * null when every reachable, available step is done.
 */
export function activeStep(state: GuideState, level: number, available: (s: GuideStep) => boolean = () => true): GuideStep | null {
  return GUIDE_STEPS.find((s) => !state.done.includes(s.id) && (s.minLevel ?? 0) <= level && available(s)) ?? null;
}

/** True once every step is done (gated steps included). */
export function allDone(state: GuideState): boolean {
  return GUIDE_STEPS.every((s) => state.done.includes(s.id));
}

/** Whether `ev` completes the step `id` (skills needs GUIDE_SKILL_NEED distinct keys; slots accumulate in the state). */
function completes(id: string, ev: GuideEvent, state: GuideState): boolean {
  switch (id) {
    case 'move': return ev.k === 'move';
    case 'talk': return ev.k === 'talk';
    case 'accept': return ev.k === 'accept';
    case 'attack': return ev.k === 'hit';
    case 'skills': return ev.k === 'cast' && (GUIDE_SKILL_SLOTS as readonly string[]).includes(ev.slot) && new Set([...state.slots, ev.slot]).size >= GUIDE_SKILL_NEED;
    case 'flask': return ev.k === 'flask' || ev.k === 'flaskIdle';
    case 'loot': return ev.k === 'loot';
    case 'bag': return ev.k === 'panel' && ev.panel === 'inventory' && ev.open;
    case 'equip': return ev.k === 'equip';
    case 'sp': return ev.k === 'sp';
    case 'turnin': return ev.k === 'turnin';
    case 'map': return ev.k === 'panel' && ev.panel === 'map' && ev.open;
    case 'finder': return ev.k === 'panel' && ev.panel === 'finder' && ev.open;
    default: return false;
  }
}

/**
 * Feeds one event. Every reachable step (`minLevel` reached) that is not done completes on its own event, in ANY order: a
 * trigger that already happened (talked, attacked, looted, turned in, bags...) is never lost behind an earlier card. A
 * skipped or finished guide ignores events; the skills step keeps its distinct bar keys in `slots`. Returns a new state;
 * the input is not mutated.
 */
export function applyEvent(state: GuideState, ev: GuideEvent, level: number): GuideState {
  if (state.skipped || allDone(state)) return state;
  let next = state;
  if (ev.k === 'cast' && (GUIDE_SKILL_SLOTS as readonly string[]).includes(ev.slot) && !state.slots.includes(ev.slot)) {
    next = { ...next, slots: [...next.slots, ev.slot] };
  }
  const done: string[] = [];
  for (const step of GUIDE_STEPS) {
    if (next.done.includes(step.id) || (step.minLevel ?? 0) > level) continue;
    if (completes(step.id, ev, { ...next, done: [...next.done, ...done] })) done.push(step.id);
  }
  if (done.length === 0) return next;
  return { ...next, done: [...next.done, ...done] };
}

/** Player-visible progress: `n / total` over the steps that exist for this level (gated steps count only once reached). */
export function progressOf(state: GuideState, level: number): { done: number; total: number } {
  const steps = GUIDE_STEPS.filter((s) => (s.minLevel ?? 0) <= level);
  return { done: steps.filter((s) => state.done.includes(s.id)).length, total: steps.length };
}
