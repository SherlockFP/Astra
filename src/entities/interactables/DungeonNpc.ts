import { InteractableProp } from './InteractableProp';
import { HoldF } from './ChannelGate';
import type { Player } from '../Player';
import type { DungeonNpcDef } from '../../types/dungeons';
import type { InteractEvent } from '../../data/devices';
import { PROFESSION_NAMES } from '../../data/devices';
import { CLASSES } from '../../data/classes';
import { G } from '../../game/G';
import type { EntityId } from '../../types/common';

/** Context handed to `DungeonNpcDef.onInteract` (the type is K9's, the field list is this file's). */
export interface NpcInteractCtx {
  npc: DungeonNpcDef;
  /** The local player who interacted (interaction always starts on the local client). */
  player: Player;
  /** True on the host / offline peer. A guest must ask the host with `request`. */
  isHost: boolean;
  /** Guest to host request (`G.net.sendRequest`). The host's `onRequest` handler performs the authoritative part. */
  request(kind: string, data: Record<string, unknown>): void;
}

/** Turkish label of a requirement entry: a class name from CLASSES or a profession name, else the raw id. */
function requirementLabel(kind: 'class' | 'profession', id: string): string {
  if (kind === 'profession') return PROFESSION_NAMES[id] ?? id;
  return (CLASSES as Record<string, { name: string } | undefined>)[id]?.name ?? id;
}

/**
 * Named dungeon NPC (P-14, `extras.npcs`). Interact (F, or a hold of `holdSeconds`) talks: the next line is toasted, then the
 * definition's `onInteract(ctx)` runs. `requires` is any-of: the player's class or one of the professions must match, otherwise
 * the prompt reads "Gereken: ..." and the interaction only toasts the requirement.
 * Events go to the scene through `onEvent` ({ type: 'npc' }). The scene decides what the talk does (for example the spy hunt).
 * OWNER: scenes module.
 */
export class DungeonNpc extends InteractableProp {
  readonly def: DungeonNpcDef;
  private readonly onEvent?: (e: InteractEvent) => void;
  private readonly hold: HoldF | null;
  private lineIndex = 0;

  constructor(id: number, def: DungeonNpcDef, opts: { onEvent?: (e: InteractEvent) => void } = {}) {
    super(id, 'npc');
    this.def = def;
    this.onEvent = opts.onEvent;
    this.interactRange = 3.5;
    this.blockRadius = 0.6;
    this.radius = 0.6;
    this.height = 2.2;
    this.hold = def.holdSeconds && def.holdSeconds > 0 ? new HoldF(def.holdSeconds, 3.5) : null;
  }

  /** Requirement text if the NPC is gated and the local player does not match, else null. */
  unmetRequirement(p: Player | null = G.player): string | null {
    const req = this.def.requires;
    if (!req) return null;
    const classes = req.classes ?? [];
    const profs = req.professions ?? [];
    if (classes.length === 0 && profs.length === 0) return null;
    if (p && classes.includes(p.classId)) return null;
    const profSkills = G.character?.save.professions as Record<string, { skill: number } | undefined> | undefined;
    if (profs.some((id) => (profSkills?.[id]?.skill ?? 0) >= 1)) return null;
    const names = [...classes.map((c) => requirementLabel('class', c)), ...profs.map((c) => requirementLabel('profession', c))];
    return names.join(' veya ');
  }

  get interactPrompt(): string {
    if (this.hold?.running) return `${this.def.name} ile konuşuluyor...`;
    const miss = this.unmetRequirement();
    if (miss) return `Gereken: ${miss}`;
    return `${this.def.name} ile konuş`;
  }

  async load(): Promise<void> {
    await this.loadModel(this.def.model);
    this.setLabel(`<div class="efs-wl"><div class="n" style="color:#e8d9a0">${this.def.name}</div></div>`, 2.2, 'efs-wl-wrap', 30);
  }

  interact(p: Player): void {
    if (this.hold?.running) return;
    const miss = this.unmetRequirement(p);
    if (miss) {
      G.ui.toast(`Gereken: ${miss}`, 'info');
      return;
    }
    if (this.hold) {
      this.hold.start(p, this.position.x, this.position.z);
      G.ui.toast(`${this.def.name} ile konuşuluyor...`, 'info');
      return;
    }
    this.talk(p);
  }

  /** Runs the talk: next line, event, definition callback. Public so the scene can re-run it (for example a guest's request). */
  talk(p: Player): void {
    const lines = this.def.lines ?? [];
    if (lines.length > 0) {
      G.ui.toast(`${this.def.name}: ${lines[this.lineIndex % lines.length]}`, 'info');
      this.lineIndex++;
    }
    const byId: EntityId = p.id;
    this.onEvent?.({ type: 'npc', npcId: this.def.id, byId });
    const ctx: NpcInteractCtx = {
      npc: this.def,
      player: p,
      isHost: G.net.role !== 'client',
      request: (kind, data) => G.net.sendRequest(kind, data),
    };
    try {
      this.def.onInteract?.(ctx);
    } catch (err) {
      console.error(`[DungeonNpc] ${this.def.id} onInteract failed`, err);
    }
  }

  protected animate(dt: number): void {
    if (!this.hold) return;
    const holder = this.hold.holderPlayer;
    if (!holder) return;
    const s = this.hold.tick(dt);
    if (s === 'done') {
      this.hold.reset();
      this.talk(holder);
    } else if (s === 'cancel') {
      this.hold.reset();
    }
  }
}
