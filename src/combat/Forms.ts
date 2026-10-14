/**
 * KIT Druid: SHAPESHIFT FORMS (new, minimal, reusable). OWNER: druid kit (combat/Forms.ts, combat/FormBody.ts).
 *
 * A form is a long STATUS on the player (`form_moonkin|cat|bear|travel`, data/statuses_kit_druid.ts). Everything else derives from it:
 *   - stat / armour / speed modifiers      the StatusDef `stats` (armorPct, maxHpPct, moveSpeedPct ...), so they stack with gear and talents
 *   - button transform / bar               SkillDef.replaces `{ skill, whileStatus: 'form_cat' }` (SkillSystem.replacementFor), also on the LMB
 *   - resource swap                        syncFormResources(): Mana <-> Energy (Kedi) / Rage (Ayı). The mana is stashed and returns on exit
 *   - regen                                formRegen(): energy refills, rage decays out of combat (Combat.updateLocal)
 *   - model                                combat/FormBody.ts: voxel beast box rig (no animal GLB exists), the character model is hidden
 *   - cancel on caster spells              beforeCast() (SkillSystem.tryCast): a `spell` skill drops Kedi / Ayı / Yolcu; a skill tagged
 *                                          `f_cat` / `f_bear` auto-shifts into its form first (free, no GCD); `f_any` never changes form
 *   - replication                          none needed: the status list already rides the player-state snapshot (Player.getSyncState /
 *                                          applySyncState mirror it), so peers see the form status, its model, and (res / maxRes are in the
 *                                          snapshot too) the energy / rage bar; Player.applySyncState picks the resource kind with formResourceOf()
 *
 * Skill tags: `f_cat`, `f_bear`, `f_moon` (needs / auto-enters that form), `f_any` (usable in every form, never cancels), `f_shift` (a form button).
 * Other kits can reuse this: add a FormId + FORMS row + a status def, and tag the skills.
 */
import { G } from '../game/G';
import type { Actor } from '../entities/Actor';
import type { Player } from '../entities/Player';
import type { ResourceType } from '../types/common';
import type { SkillDef, StatusId } from '../types/skills';

export type FormId = 'moonkin' | 'cat' | 'bear' | 'travel';

export interface FormDef {
  id: FormId;
  /** The long status that IS the form. */
  status: StatusId;
  /** Turkish name. */
  name: string;
  /** Resource the form uses; null = keeps the class resource (mana). */
  resource: ResourceType | null;
  maxResource: number;
  /** Resource the form starts with when entered from another resource. */
  startResource: number;
  /** Energy per second (before resourceRegenPct), 0 = none. */
  regen: number;
  /** Rage-like: seconds out of combat before the bar decays, and the decay per second. */
  decay?: { after: number; perSec: number };
}

export const FORM_IDS: readonly FormId[] = ['moonkin', 'cat', 'bear', 'travel'];

export const FORMS: Record<FormId, FormDef> = {
  moonkin: { id: 'moonkin', status: 'form_moonkin', name: 'Ay Baykuşu Biçimi', resource: null, maxResource: 0, startResource: 0, regen: 0 },
  cat: { id: 'cat', status: 'form_cat', name: 'Kedi Biçimi', resource: 'energy', maxResource: 100, startResource: 50, regen: 10 },
  bear: { id: 'bear', status: 'form_bear', name: 'Ayı Biçimi', resource: 'rage', maxResource: 100, startResource: 0, regen: 0, decay: { after: 4, perSec: 3 } },
  travel: { id: 'travel', status: 'form_travel', name: 'Yolcu Biçimi', resource: null, maxResource: 0, startResource: 0, regen: 0 },
};

/** A form is a status that never runs out on its own (a day). */
export const FORM_DURATION = 86400;

/** The form an actor is in (read from its statuses, so remote players work too). */
export function formOf(a: Actor | null | undefined): FormId | null {
  if (!a) return null;
  for (const id of FORM_IDS) if (a.statuses.has(FORMS[id].status)) return id;
  return null;
}

/** Resource kind the actor's form shows (null = the class resource). Used for remote players, whose bar value comes from the snapshot. */
export function formResourceOf(a: Actor | null | undefined): ResourceType | null {
  const f = formOf(a);
  return f ? FORMS[f].resource : null;
}

// ------------------------------------------------------------------------------------------------------------------------
// resource swap
// ------------------------------------------------------------------------------------------------------------------------

interface FormState {
  /** Form the resources were last synced for. */
  active: FormId | null;
  /** Last value of every resource kind the player left (mana waits here while a cat claws). */
  stash: Partial<Record<ResourceType, number>>;
}
const STATE = new WeakMap<Player, FormState>();
const stateOf = (p: Player): FormState => {
  let s = STATE.get(p);
  if (!s) STATE.set(p, (s = { active: null, stash: {} }));
  return s;
};

/**
 * Called by Player.refreshStats right after maxResource was derived from the stats (class resource), before the clamp: detects a form
 * change (any cause: shift, expiry, death, scene change), moves the bar value between the stash and the live resource, and applies the
 * form's resource kind and max. Idempotent while the form stays the same.
 */
export function syncFormResources(p: Player): void {
  const s = stateOf(p);
  const now = formOf(p);
  const def = now ? FORMS[now] : null;
  if (now !== s.active) {
    const old = s.active ? FORMS[s.active] : null;
    s.stash[old?.resource ?? p.resourceType] = p.resource;
    const kind = def?.resource ?? null;
    if (kind) p.resource = s.stash[kind] ?? def!.startResource;
    else if (old?.resource) p.resource = s.stash[p.resourceType] ?? p.maxResource;
    s.active = now;
    hook();
  }
  if (def?.resource) {
    p.resourceType = def.resource;
    p.maxResource = def.maxResource;
  }
}

/** Energy refill / rage decay of a form, in place of the class regen. Returns true when it handled this frame. */
export function formRegen(p: Player, dt: number, ooc: boolean, regenPct: number): boolean {
  const f = formOf(p);
  if (!f) return false;
  const d = FORMS[f];
  if (!d.resource) return false;
  if (d.regen > 0 && p.resource < p.maxResource) p.resource = Math.min(p.maxResource, p.resource + d.regen * (1 + Math.max(-0.9, regenPct)) * dt);
  if (d.decay && p.combatTimer > d.decay.after && ooc) p.resource = Math.max(0, p.resource - d.decay.perSec * dt);
  return true;
}

/** Rage gain of a bear (damage taken, skills do their own `gain`). */
export function addFormResource(p: Player, n: number): void {
  p.resource = Math.max(0, Math.min(p.maxResource, p.resource + n));
}

// ------------------------------------------------------------------------------------------------------------------------
// shifting
// ------------------------------------------------------------------------------------------------------------------------

/** Enters `to` (null = back to caster form). Local player only. Returns false when nothing changed. */
export function shiftForm(p: Player, to: FormId | null): boolean {
  if (!p.isLocal || p.isDead) return false;
  const cur = formOf(p);
  if (cur === to) return false;
  for (const id of FORM_IDS) if (id !== to && p.statuses.has(FORMS[id].status)) p.statuses.remove(FORMS[id].status);
  if (to) p.statuses.apply(FORMS[to].status, FORM_DURATION, { sourceId: p.id });
  try {
    G.vfx?.spawn('dodge_dust', [p.position.x, p.position.y + 0.2, p.position.z], { scale: 1.6 });
    G.events.emit('form:changed', { casterId: p.id, form: to });
  } catch { /* vfx / events not ready (sim) */ }
  return true;
}

/** Form button: leaves the form when already in it, else enters it. */
export function toggleForm(p: Player, id: FormId): boolean {
  return shiftForm(p, formOf(p) === id ? null : id);
}

/**
 * SkillSystem.tryCast hook (before costs are checked). `f_cat` / `f_bear` skills auto-shift into their form; `f_any` and `f_shift` skills
 * leave the form alone; any other druid skill drops Kedi / Ayı / Yolcu (casting a caster spell cancels the form, mana comes back first).
 * Moonkin keeps casting. Always returns true (the cast proceeds).
 */
export function beforeCast(p: Player, def: SkillDef): boolean {
  if (p.classId !== 'druid' || def.classId !== 'druid') return true;
  const cur = formOf(p);
  const tags = def.tags;
  if (tags.includes('f_cat')) { if (cur !== 'cat') shiftForm(p, 'cat'); return true; }
  if (tags.includes('f_bear')) { if (cur !== 'bear') shiftForm(p, 'bear'); return true; }
  if (tags.includes('f_moon')) { if (cur !== 'moonkin') shiftForm(p, 'moonkin'); return true; }
  if (tags.includes('f_any') || tags.includes('f_shift')) return true;
  if (cur && cur !== 'moonkin') shiftForm(p, null);
  return true;
}

// ------------------------------------------------------------------------------------------------------------------------
// damage hooks (installed once per event bus)
// ------------------------------------------------------------------------------------------------------------------------

let hooked: unknown = null;

/** Bear rage from damage taken; Yolcu Biçimi drops when hit. Installed lazily on the first form change. */
function hook(): void {
  const ev = G.events;
  if (!ev || hooked === ev) return;
  hooked = ev;
  ev.on('damage', (e) => {
    const p = G.world?.localPlayer;
    if (!p || e.targetId !== p.id || !(e.amount > 0)) return;
    const f = formOf(p);
    if (f === 'bear') addFormResource(p, Math.min(12, 1 + (40 * e.amount) / Math.max(1, p.maxHp)));
    else if (f === 'travel') shiftForm(p, null);
  });
}

/** LMB chain of a form (Kedi / Ayı swap the basic attack of the bar, SkillSystem.skillIdForSlot). null = the spec / class basic. */
const FORM_BASIC: Partial<Record<FormId, string>> = { cat: 'druid_cat_basic', bear: 'druid_bear_basic' };
export function formBasic(p: Actor): string | null {
  const f = formOf(p);
  return (f && FORM_BASIC[f]) || null;
}
