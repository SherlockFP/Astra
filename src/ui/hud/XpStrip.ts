import { div, setDisplay } from '../widgets/dom';

/** UX-01 stub: the thin XP strip on the bottom edge (§2.6.7, `.hud-xp`). Hidden until UX-10 fills it. */
export class XpStrip {
  readonly el: HTMLElement;

  constructor() {
    this.el = div('xp-strip');
    setDisplay(this.el, false);
  }
}
