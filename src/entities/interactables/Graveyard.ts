import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { toast } from '../../systems/notify';

/**
 * Mezarlık marker: a grave stone with a spirit healer (a ghost beside it), the release point of the dead (WoW spirit healer).
 * Models are reused from the kit in public/assets (no download). Walk-through, so it never blocks a path. OWNER: scenes module.
 */

const STONE_URL = '/assets/models/kenney/graveyard-kit/gravestone-cross.glb';
const SPIRIT_URL = '/assets/models/kenney/graveyard-kit/character-ghost.glb';

export class Graveyard extends InteractableProp {
  constructor(id: number, readonly graveName: string) {
    super(id);
    this.interactRange = 3.6;
    this.blockRadius = 0;
    this.radius = 1.0;
    this.height = 2.4;
  }

  get interactPrompt(): string {
    return `${this.graveName}: Ruh Şifacısı`;
  }

  async load(): Promise<void> {
    await this.loadModel(STONE_URL, { scale: 1.1 });
    // the spirit: a second instance beside the stone (loadModel keeps only one root as `model`)
    await G.assets.load(SPIRIT_URL);
    const spirit = G.assets.instantiate(SPIRIT_URL);
    spirit.position.set(0.9, 0, 0);
    this.object3d.add(spirit);
    this.setLabel('Ruh Şifacısı', 2.6);
  }

  interact(_player: Player): void {
    toast(`${this.graveName}: öldüğünde ruhun en yakın mezarlıktan dirilir.`);
  }
}
