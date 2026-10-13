import type { UI, UIMode } from '../UI';
import type { Player } from '../../entities/Player';
import type { World } from '../../world/World';
import type { Actor } from '../../entities/Actor';
import type { CastTracker } from '../widgets/CastBar';
import type { CharacterState } from '../../systems/CharacterState';

/** Per-frame context handed to every HUD widget. `dt` is REAL seconds (not hit-stop scaled). */
export interface HudCtx {
  ui: UI;
  dt: number;
  /** performance.now() in ms. */
  now: number;
  /** Real seconds since the HUD was created (animation clock). */
  t: number;
  player: Player | null;
  world: World | null;
  character: CharacterState | null;
  mode: UIMode;
  /** Enemy under the crosshair/cursor this frame (soft target), if any. */
  hover: Actor | null;
  casts: CastTracker;
  /** HUD zoom factor applied to the layer (screen px per CSS px of the HUD). */
  scale: number;
}

export interface HudWidget {
  el: HTMLElement;
  update(ctx: HudCtx): void;
  /** Called when the HUD layer is hidden/shown or the scene changes (drop transient state). */
  reset?(): void;
}

/** HUD size class (§2.2): lg at HUD widths >= 1800 css px, md >= 1500, sm below. Set on `.hud[data-density]`. */
export type HudDensity = 'lg' | 'md' | 'sm';

/** The zone containers of §2.5. The legacy four are the old corner / column parents; the rest are new and empty. */
export interface HudZones {
  readonly tl: HTMLElement;
  readonly tc: HTMLElement;
  readonly tr: HTMLElement;
  readonly bl: HTMLElement;
  readonly bc: HTMLElement;
  readonly br: HTMLElement;
  /** Centre-cluster stacks (player, target) hang from here. */
  readonly uf: HTMLElement;
  /** Bottom edge XP strip. */
  readonly xp: HTMLElement;
  /** Combo counter and route banner anchor. */
  readonly ml: HTMLElement;
  /** Tip card slot, directly above the chat. */
  readonly tip: HTMLElement;
}
