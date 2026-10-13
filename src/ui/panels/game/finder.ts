import { buildChrome, buildTabs, emptyState, type Chrome, type TabsApi } from '../../kit';
import { GamePanel } from './base';

const TABS = [
  { id: 'dungeons', label: 'Zindanlar & Raidler' },
  { id: 'pvp', label: 'Oyuncuya Karşı' },
  { id: 'mythic', label: 'Mitik+ Zindanlar' },
];

/**
 * Grup Bulucu (key I, UI_REDESIGN §6 / UX-40). UX-02 stub: the three tabs and the empty body only;
 * queue, listings and run start come with UX-40.
 */
export class FinderPanel extends GamePanel {
  private chrome: Chrome | null = null;
  private tabs: TabsApi | null = null;

  constructor() {
    super('finder');
  }

  protected build(): void {
    const c = buildChrome({
      title: 'Grup Bulucu',
      icon: '/assets/icons/ui-party.svg',
      keyAction: 'groupFinder',
      size: 'L',
      onClose: () => this.requestClose(),
    });
    this.chrome = c;
    this.tabs = buildTabs(TABS, (id) => this.showTab(id), 'dungeons');
    c.tabsHost.append(this.tabs.el);
    this.el.append(c.root);
    this.showTab('dungeons');
  }

  private showTab(id: string): void {
    const c = this.chrome;
    if (!c) return;
    const label = TABS.find((t) => t.id === id)?.label ?? '';
    c.body.textContent = '';
    c.body.append(
      emptyState({ icon: '/assets/icons/ui-party.svg', title: 'Yakında', text: `${label}: grup listesi burada görünecek.` }),
    );
  }
}
