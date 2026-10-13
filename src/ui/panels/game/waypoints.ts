import { G } from '../../../game/G';
import { activeWorldRuntime } from '../../../scenes/world/WorldRuntime';
import { waypointKnown, worldExtras } from '../../hud/questMarks';
import { GamePanel, button, fmtInt, h, icon, sfx, toast, windowFrame } from './base';

/**
 * Işınlayıcı (fast-travel NPC, `waypoints` panel, opened by `teleporter` NPCs with data `{ npcId }`). Lists the stones this
 * character discovered (GDD_OPENWORLD §5.1, §2.6), grouped by region, with the fare from the current position. The trip
 * itself is WorldRuntime.travel (cooldown, gold, teleport). Outside the open world the panel explains that it does not work.
 * OWNER: panels-game module.
 */

export class WaypointsPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private titleEl!: HTMLElement;

  constructor() {
    super('waypoints', { backdropClose: true });
  }

  protected build(): void {
    const { win, titleEl, body, foot } = windowFrame({ title: 'Işınlayıcı', icon: '/assets/icons/ui-portal.svg', cls: 'pg-waypoints', onClose: () => this.requestClose() });
    this.titleEl = titleEl;
    this.bodyEl = h('div.pg-wp-body.pg-scroll');
    body.append(this.bodyEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.listen('waypoint:discovered', () => this.render());
    this.listen('player:gold', () => this.render());
    this.render();
  }

  private render(): void {
    this.bodyEl.innerHTML = '';
    const rt = activeWorldRuntime();
    const ext = worldExtras();
    this.titleEl.textContent = 'Işınlayıcı';
    if (!G.character) {
      this.bodyEl.append(h('div.pg-empty', null, 'Karakter seçilmedi.'));
      return;
    }
    if (!rt || !ext) {
      this.bodyEl.append(h('div.pg-empty', null, 'Işınlayıcı yalnızca açık dünyada çalışır.'));
      return;
    }

    const gold = G.character.save.gold;
    const respawnId = G.character.save.flags['world.respawn'];
    const regionName = (rid: string) => ext.regions.find((r) => r.id === rid)?.name ?? rid;
    const known = ext.waypoints.filter((w) => waypointKnown(w.id));
    const unknownCount = ext.waypoints.length - known.length;

    this.bodyEl.append(
      h(
        'p.pg-wp-intro',
        null,
        'Yolculuk ücreti mesafeye ve seviyene göre değişir. Her yolculuktan sonra kısa bir bekleme olur.',
      ),
      h('div.pg-wp-gold', null, icon('/assets/icons/item-gold-coins.svg', 'pg-wp-goldico'), h('span', null, `${fmtInt(gold)} altın`)),
    );

    if (!known.length) {
      this.bodyEl.append(h('div.pg-empty', null, 'Henüz Işınlanma Taşı keşfetmedin. Taşların yanından geçince keşfedersin.'));
      return;
    }

    let lastRegion = '';
    for (const w of known) {
      if (w.regionId !== lastRegion) {
        lastRegion = w.regionId;
        this.bodyEl.append(h('div.pg-h', null, regionName(w.regionId)));
      }
      const quote = rt.quoteTravel(w.id);
      const cost = quote?.cost ?? 0;
      const afford = gold >= cost;
      const here = respawnId === w.id ? h('span.pg-wp-tag', null, 'Diriliş noktan') : null;
      const row = h(
        'div.pg-wp-row',
        null,
        icon('/assets/icons/map-waypoint.svg', 'pg-wp-ico'),
        h('div.pg-wp-txt', null, h('b', null, w.name), h('small', null, here ?? regionName(w.regionId))),
        h('span.pg-wp-cost' + (afford ? '' : '.is-short'), null, quote ? `${fmtInt(cost)} altın` : '-'),
        button(
          'Işınlan',
          () => {
            const msg = rt.travel(w.id);
            if (msg) {
              sfx('ui_error');
              toast(msg, 'warning');
              this.render();
              return;
            }
            sfx('portal_enter');
            toast(`${w.name} için ışınlandın.`, 'success');
            this.requestClose();
          },
          { variant: 'primary', disabled: !quote || !afford },
        ),
      );
      this.bodyEl.append(row);
    }
    if (unknownCount > 0) this.bodyEl.append(h('div.pg-dim.pg-small', null, `Keşfedilmemiş ${unknownCount} taş daha var. Yanından geçerek keşfedebilirsin.`));
  }
}
