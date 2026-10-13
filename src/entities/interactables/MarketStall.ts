import { Entity } from '../Entity';
import type { Interactable } from '../Interactable';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { MARKET } from '../../data/market';
import { peekMarket } from '../../systems/Market';

/**
 * CM14 Pazar: the F target of one announced stall (the visible stall, seller and board are instanced props drawn by
 * world/MarketStalls.ts; this entity only carries the position, the prompt and the click). Interact within 6 m opens the buyer's
 * listing window (`marketStall`, data `{ sellerId }`); on the player's own stall it opens the manage view (`marketOpen`).
 * OWNER: scenes module (interactables).
 */
export class MarketStall extends Entity implements Interactable {
  /** The entity radius is added by PlayerController, so the effective reach is exactly MARKET.BUY_RANGE. */
  readonly interactRange = MARKET.BUY_RANGE - 0.8;

  constructor(id: number, public sellerId: string) {
    super(id, 'interactable');
    this.radius = 0.8;
    this.height = 2.2;
  }

  get interactPrompt(): string {
    const s = peekMarket()?.stalls.get(this.sellerId);
    if (!s) return 'Tezgâh';
    return s.own ? `Tezgâhını yönet: ${s.title}` : `Tezgâha bak: ${s.title}`;
  }

  canInteract(): boolean {
    const s = peekMarket()?.stalls.get(this.sellerId);
    return !!s && !s.hidden;
  }

  interact(_player: Player): void {
    const s = peekMarket()?.stalls.get(this.sellerId);
    if (!s) return;
    try {
      G.audio?.play('ui_open', { volume: 0.7 });
      if (s.own) G.ui.openPanel('marketOpen', { manage: true });
      else G.ui.openPanel('marketStall', { sellerId: this.sellerId });
    } catch (e) {
      console.warn('[market] could not open the stall', e);
    }
  }

  update(_dt: number): void {
    /* static: the stall is drawn by MarketStalls */
  }
}
