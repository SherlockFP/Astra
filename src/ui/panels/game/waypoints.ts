import { G } from '../../../game/G';
import { activeWorldRuntime, type WorldRuntime } from '../../../scenes/world/WorldRuntime';
import { FLIGHT_CAST_SEC, type FlightDest } from '../../../scenes/world/WaypointNetwork';
import { waypointKnown, worldExtras } from '../../hud/questMarks';
import { GamePanel, button, fmtInt, h, icon, openPanel, sfx, toast, windowFrame } from './base';
import { emptyState } from '../../kit';

/**
 * Işınlayıcı (fast-travel NPC or a discovered stone: F, `waypoints` panel, opened by `teleporter` NPCs with data `{ npcId }`). Lists
 * the stones this character discovered in this zone (GDD_OPENWORLD §5.1, §2.6), grouped by region, with the fare from the current
 * position; the trip itself is WorldRuntime.travel (cooldown, gold, teleport). Below it the flight network (WoW flight master style):
 * Kuzgunkale and the stones of the other open-world zones, a short cast (WorldRuntime.startFlight); undiscovered stones are greyed.
 * Outside the open world the panel explains that it does not work. OWNER: panels-game module.
 */

export class WaypointsPanel extends GamePanel {
  private bodyEl!: HTMLElement;
  private titleEl!: HTMLElement;

  constructor() {
    super('waypoints', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, titleEl, body, foot } = windowFrame({ title: 'Işınlayıcı', icon: '/assets/icons/ui-portal.svg', cls: 'pg-waypoints', size: 'M', onClose: () => this.requestClose() });
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
    const flying = rt.flying;

    this.bodyEl.append(
      h(
        'p.pg-wp-intro',
        null,
        'Yolculuk ücreti mesafeye ve seviyene göre değişir. Her yolculuktan sonra kısa bir bekleme olur.',
      ),
      h('div.pg-wp-gold', null, icon('/assets/icons/item-gold-coins.svg', 'pg-wp-goldico'), h('span', null, `${fmtInt(gold)} altın`)),
    );
    if (flying) this.bodyEl.append(h('div.pg-wp-fly', null, 'Işınlanma hazırlanıyor. Hareket etme, hasar alma.'));

    if (!known.length) {
      this.bodyEl.append(emptyState({ icon: '/assets/icons/ui-portal.svg', title: 'Henüz taş keşfetmedin', text: 'Açık dünyada ışınlayıcı taşlara F ile dokun.', action: { label: 'Haritayı Aç', onClick: () => openPanel('map') } }));
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

    this.renderFlights(rt.flightDests(), gold, flying, rt);
  }

  /** The flight network: Kuzgunkale and the stones of the other open-world zones, grouped by zone; undiscovered ones greyed. */
  private renderFlights(dests: FlightDest[], gold: number, flying: boolean, rt: WorldRuntime): void {
    if (!dests.length) return;
    this.bodyEl.append(h('div.pg-h', null, 'Bölgeler Arası Yolculuk'), h('p.pg-wp-intro', null, `Kuzgunkale'ye ve diğer bölgelerin taşlarına ${FLIGHT_CAST_SEC} sn'lik bir büyüyle uçarsın. Keşfedilmemiş taşlar soluk görünür.`));
    let lastZone = '';
    for (const d of dests) {
      if (d.zone !== lastZone) {
        lastZone = d.zone;
        this.bodyEl.append(h('div.pg-small.pg-dim', null, d.stoneId === null ? 'Şehir' : d.zoneName));
      }
      const afford = gold >= d.cost;
      const action = d.discovered
        ? button(
            'Uç',
            () => {
              const msg = rt.startFlight(d);
              if (msg) {
                sfx('ui_error');
                toast(msg, 'warning');
                this.render();
                return;
              }
              sfx('portal_enter');
              toast(`${d.name}: ${FLIGHT_CAST_SEC} sn içinde ışınlanıyorsun. Hareket etme.`, 'info');
              this.requestClose();
            },
            { variant: 'primary', disabled: flying || !afford },
          )
        : h('small', null, 'Keşfedilmedi');
      const row = h(
        'div.pg-wp-row',
        null,
        icon('/assets/icons/map-waypoint.svg', 'pg-wp-ico'),
        h('div.pg-wp-txt', null, h('b', null, d.name), h('small', null, d.stoneId === null ? 'Kuzgunkale' : d.zoneName)),
        h('span.pg-wp-cost' + (afford ? '' : '.is-short'), null, `${fmtInt(d.cost)} altın`),
        action,
      );
      if (!d.discovered) row.style.opacity = '0.45';
      this.bodyEl.append(row);
    }
  }
}
