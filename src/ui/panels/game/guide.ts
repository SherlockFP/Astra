import { buildChrome, emptyState } from '../../kit';
import { GamePanel } from './base';

/**
 * Ne Yapmalıyım? (key '.', UI_REDESIGN §4.6 / UX-21). UX-02 stub: the window shell and an empty body only.
 */
export class GuidePanel extends GamePanel {
  constructor() {
    super('guide');
  }

  protected build(): void {
    const c = buildChrome({
      title: 'Ne Yapmalıyım?',
      icon: '/assets/icons/ui-quest.svg',
      keyAction: 'guide',
      size: 'S',
      onClose: () => this.requestClose(),
    });
    c.body.append(emptyState({ icon: '/assets/icons/ui-quest.svg', title: 'Yakında', text: 'Sıradaki adımların burada listelenecek.' }));
    this.el.append(c.root);
  }
}
