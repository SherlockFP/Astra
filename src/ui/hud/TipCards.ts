import { div } from '../widgets/dom';

/** UX-01 stub: the tip card slot (`.hud-tip`, one card at a time, §4.7). Empty until UX-20 fills it. */
export class TipCards {
  readonly el: HTMLElement;

  constructor() {
    this.el = div('tip-cards');
  }
}
