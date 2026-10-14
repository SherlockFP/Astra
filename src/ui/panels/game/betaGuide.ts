import { G } from '../../../game/G';
import { DUNGEONS, DUNGEON_IDS, MPLUS_POOL, getDungeon } from '../../../data/dungeons';
import { BETA_ZONES } from '../../../data/betaTest';
import { openWorldParams } from '../../../scenes/world/params';
import type { DungeonParams } from '../../../scenes/scenes';
import { GamePanel, button, h, openPanel, sfx, toast, windowFrame } from './base';
import { startRun } from './runStart';

/**
 * Beta Rehberi (ui/panels/game/betaGuide.ts): the menu of the beta test NPC in the town's Test Alanı. Teleports the beta character
 * to every open-world zone and every dungeon (normal difficulty, the zone's top level), opens the arena queue (finder PvP tab)
 * and resets the character's health and cooldowns. Only beta characters meet the NPC (TownScene), so the panel is safe to register.
 * OWNER: panels-game module.
 */

/** Dungeon params of a plain normal-difficulty trip (no key, no affixes), enemy level = the zone's top level (cap 60). */
function dungeonTrip(dungeonId: string): DungeonParams {
  const def = getDungeon(dungeonId) ?? DUNGEONS[dungeonId];
  const top = def?.levelRange?.[1] ?? 60;
  return {
    dungeonId,
    difficulty: 'normal',
    keyLevel: 0,
    seed: (Math.random() * 0x7fffffff) >>> 0 || 1,
    affixes: [],
    enemyLevel: Math.max(1, Math.min(60, top)),
    partySize: 1,
    keyOwner: G.net.selfId || 'local',
  };
}

export class BetaGuidePanel extends GamePanel {
  private bodyEl!: HTMLElement;

  constructor() {
    super('betaGuide', { backdropClose: true, modal: false });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({ title: 'Beta Rehberi', icon: '/assets/icons/ui-portal.svg', cls: 'pg-waypoints', size: 'M', onClose: () => this.requestClose() });
    this.bodyEl = h('div.pg-wp-body.pg-scroll');
    body.append(this.bodyEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.render();
  }

  /** One teleport row: name, note and the button. */
  private row(name: string, note: string, go: () => void): HTMLElement {
    return h('div.pg-wp-row', null, h('div.pg-wp-txt', null, h('b', null, name), h('small', null, note)), button('Işınlan', go, { variant: 'primary' }));
  }

  private render(): void {
    this.bodyEl.replaceChildren();
    const ch = G.character;
    if (!ch?.save.beta) {
      this.bodyEl.append(h('div.pg-empty', null, 'Bu rehber yalnızca beta test karakterleri içindir.'));
      return;
    }
    this.bodyEl.append(h('p.pg-wp-intro', null, 'Beta test kahramanı · Sv. 60. Istediğin bölgeye ya da zindana ışınlan; yolculuk ücretsiz ve bekleme yok.'));

    this.bodyEl.append(h('div.pg-h', null, 'Açık Dünya'));
    for (const z of BETA_ZONES) {
      this.bodyEl.append(this.row(z.name, z.note, () => this.go(() => startRun(openWorldParams(z.id, z.spawn)), z.name)));
    }

    this.bodyEl.append(h('div.pg-h', null, 'Zindanlar'));
    const dungeons = [...new Set([...DUNGEON_IDS, ...MPLUS_POOL])];
    for (const id of dungeons) {
      const def = getDungeon(id);
      if (!def) continue;
      const band = def.levelRange ? `Sv. ${def.levelRange[0]}-${def.levelRange[1]}` : 'Zindan';
      this.bodyEl.append(this.row(def.name, `${band} · Normal`, () => this.go(() => startRun(dungeonTrip(id)), def.name)));
    }

    this.bodyEl.append(h('div.pg-h', null, 'PvP'));
    this.bodyEl.append(
      h(
        'div.pg-wp-row',
        null,
        h('div.pg-wp-txt', null, h('b', null, 'Arena Kuyruğu'), h('small', null, 'Grup Bulucu · Oyuncuya Karşı sekmesi')),
        button('Aç', () => {
          sfx('ui_tab');
          this.requestClose();
          openPanel('finder', { tab: 'pvp' });
        }, { variant: 'primary' }),
      ),
    );

    this.bodyEl.append(h('div.pg-h', null, 'Sıfırla'));
    this.bodyEl.append(
      h(
        'div.pg-wp-row',
        null,
        h('div.pg-wp-txt', null, h('b', null, 'Can ve bekleme sürelerini sıfırla'), h('small', null, 'Canı doldurur, ölüyse diriltir, beceri ve büyük bekleme sürelerini kapatır.')),
        button('Sıfırla', () => this.reset(), { variant: 'primary' }),
      ),
    );
  }

  /** Runs a teleport and closes the guide; a refused trip is shown as a toast and the guide stays open. */
  private go(trip: () => boolean, name: string): void {
    const ok = trip();
    if (!ok) return;
    sfx('portal_enter');
    toast(`${name} için yola çıkılıyor...`, 'info');
    this.requestClose();
  }

  /** Health, death, cooldowns and the major-skill timers of the beta character. */
  private reset(): void {
    const ch = G.character;
    const p = G.world?.localPlayer ?? G.player;
    if (p) {
      if (p.isDead) G.combat?.reviveLocalPlayer(1);
      p.hp = p.maxHp;
      try {
        G.skills?.reset(p);
      } catch (e) {
        console.warn('[beta] skill cooldown reset failed', e);
      }
    }
    if (ch) {
      ch.save.majorCd = { m45: 0, m90: 0, m180: 0 };
      ch.persist(true);
    }
    sfx('ui_open');
    toast('Can doldu, beceriler hazır.', 'success');
  }
}
