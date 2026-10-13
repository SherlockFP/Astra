import { div, setDisplay } from '../widgets/dom';

/** UX-01 stub: the centre quest feed (quest progress lines). Hidden until UX-12 fills it. */
export class QuestFeed {
  readonly el: HTMLElement;

  constructor() {
    this.el = div('quest-feed');
    setDisplay(this.el, false);
  }
}
