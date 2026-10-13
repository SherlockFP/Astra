import { div, setDisplay } from '../widgets/dom';

/** UX-01 stub (§4.4): the objective arrow clamped to the screen edge. Hidden until UX-20 fills it. */
export class ObjectiveArrow {
  readonly el: HTMLElement;

  constructor() {
    this.el = div('objective-arrow');
    setDisplay(this.el, false);
  }
}
