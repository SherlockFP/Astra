import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { propUrl } from '../../scenes/SceneKit';

/** İlan Tahtası: opens the bounty panel. Gently sways its notes and shows a "!" marker when a bounty can be claimed. */
export class BountyBoard extends InteractableProp {
  private marker: THREE.Sprite | null = null;

  constructor(id: number) {
    super(id);
    this.interactRange = 3.6;
    this.blockRadius = 1.1;
    this.radius = 1.2;
    this.height = 2.9;
  }

  get interactPrompt(): string {
    return 'İlan Tahtasını İncele';
  }

  /** visualExists: the world builder already draws a board/signpost here, so only add interaction + label. */
  async load(visualExists = false): Promise<void> {
    if (!visualExists) await this.loadModel(propUrl('notice_board'));
    this.setLabel('<div class="efs-wl"><div class="n" style="color:#ffd982">İlan Tahtası</div><div class="s">Günlük görevler</div></div>', 3.5, 'efs-wl-wrap', 40);
  }

  interact(_player: Player): void {
    G.audio.play('ui_open');
    G.ui.openPanel('bounty');
  }

  protected animate(): void {
    if (this.model) this.model.rotation.z = Math.sin(this.time * 0.9) * 0.004;
  }
}
