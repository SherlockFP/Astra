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
