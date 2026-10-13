import { buildChrome, emptyState } from '../../kit';
import { GamePanel } from './base';

/**
 * Hoş Geldin (welcome card, UI_REDESIGN §4.2 / UX-21). UX-02 stub: a modal card whose Başla button closes it.
 */
export class WelcomePanel extends GamePanel {
  constructor() {
    super('welcome');
  }

  protected build(): void {
    const c = buildChrome({
      title: 'Hoş Geldin',
      icon: '/assets/icons/ui-star.svg',
      size: 'S',
      modal: true,
      onClose: () => this.requestClose(),
    });
    c.body.append(
      emptyState({
        icon: '/assets/icons/ui-star.svg',
        title: 'EFSUN ONLINE\'a hoş geldin',
        text: 'Yakında burada başlangıç rehberi olacak.',
        action: { label: 'Başla', onClick: () => this.requestClose() },
      }),
    );
    this.el.append(c.root);
  }
}
