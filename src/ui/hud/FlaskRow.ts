import { div, setDisplay } from '../widgets/dom';

/** UX-01 stub: the flask row (equipped flasks next to the potions, §2.6.5). Hidden until UX-10 fills it. */
export class FlaskRow {
  readonly el: HTMLElement;

  constructor() {
    this.el = div('flask-row');
    setDisplay(this.el, false);
  }
}
