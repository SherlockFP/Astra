import { G } from '../../../game/G';
import { DEATH_PENALTY_SEC } from '../../../data/mythicAffixes';
import { expandKeys } from '../../widgets/controlHints';
import { pvp } from '../../../systems/Pvp';
import { GamePanel, button, fmtInt, h, icon, inOpenWorld, mmss, openPanel, sfx, toast } from './base';

const TIPS = [
  'Takla ({k:dodge}) ile düşman saldırılarından kaç. Kırmızı alanlardan uzak dur!',
  'Can iksirlerini ({k:potionHp}) kritik anlar için sakla.',
  'Zırhın ve dirençlerin yükseldikçe Mitik+ anahtarları kolaylaşır.',
  'Bir kombo zincirini bozmadan vurursan hasar bonusu kazanırsın.',
  'Grup arkadaşın seni dirilttiğinde savaşa kısa bir dokunulmazlıkla dönersin.',
  'Boss savaşlarında yere çizilen uyarı daireleri hasar vermeden önce dolar. Dikkat et!',
  'Kilit Taşı (keystone) düğümleri oyun tarzını tamamen değiştirir.',
  'Mitik+ koşusunda ölmek süreye ceza ekler. Temkinli oyna, ama cesaretini de kaybetme.',
  'Takla atarken kısa süre dokunulmazsın. Doğru anda kullanırsan en ölümcül saldırıdan sıyrılırsın.',
];

/** Seconds a player has to wait before "Burada Diril" unlocks (GDD 6.6). */
const REVIVE_HERE_DELAY = 5;

/**
 * "Öldün" screen: darkened world stays visible, only the card captures the mouse.
 * Esc must never remove the card while the player is still dead (UI closes the top panel on Esc):
 * it opens the game menu instead, so the release button can always be found again.
 */
export class DeathPanel extends GamePanel {
  private card!: HTMLElement;
  private noteEl!: HTMLElement;
  private reviveEl!: HTMLElement;
  private tipEl!: HTMLElement;
  private releaseBtn!: HTMLButtonElement;
  private hereBtn!: HTMLButtonElement;
  private hereLabel!: HTMLElement;
  private t0 = 0;
  private timer = 0;
  private labelAcc = 0;
  private leaving = false;
  private done = false;
  /** XP lost to this death (open world only, GDD 6.6); applied once per time the card opens. */
  private xpLost = 0;
  private penaltyDone = false;

  constructor() {
    super('death', { passthrough: true, cls: 'pg-death' });
  }

  /** index.ts: a scene change is under way (every panel is being closed), let the close through. */
  markLeaving(v: boolean): void {
    this.leaving = v;
  }

  protected build(): void {
    const bg = h('div.pg-death-bg');
    this.noteEl = h('div.pg-death-note');
    this.reviveEl = h('div.pg-death-revive');
    this.tipEl = h('div.pg-death-tip');
    this.releaseBtn = button('Ruhunu Serbest Bırak', () => this.release(), { variant: 'danger', cls: 'pg-big', icon: '/assets/icons/ui-tombstone.svg' });
    this.hereBtn = button('Burada Diril', () => this.reviveHere(), { variant: 'normal', icon: '/assets/icons/ui-hourglass.svg', cls: 'pg-death-here' });
    this.hereLabel = this.hereBtn.querySelector('span') as HTMLElement;
    this.card = h(
      'div.pg-card.pg-death-card',
      null,
      icon('/assets/icons/ui-skull.svg', 'pg-death-skull'),
      h('div.pg-death-title', null, 'ÖLDÜN'),
      this.noteEl,
      this.reviveEl,
      this.releaseBtn,
      this.hereBtn,
      this.tipEl,
    );
    this.card.classList.add('panel');
    this.el.append(bg, this.card);
  }

  protected onOpen(): void {
    this.t0 = performance.now();
    this.done = false;
    // open world (Sisli Koru): from level 10 lose 5% of the level's XP, never de-level (Progression.applyDeathPenalty)
    if (!this.penaltyDone && inOpenWorld() && !pvp.active && this.stillDead()) {
      this.penaltyDone = true;
      try {
        this.xpLost = G.progression.applyDeathPenalty();
      } catch (e) {
        console.warn('[death] death penalty failed', e);
      }
    }
    this.labelAcc = 1;
    this.releaseBtn.disabled = true;
    this.releaseBtn.classList.add('is-wait');
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.releaseBtn.disabled = false;
      this.releaseBtn.classList.remove('is-wait');
    }, 1400);
    sfx('player_death', 0.7);
    this.fill();
    this.listen('run:playerDeath', () => this.fill());
    this.listen('party:changed', () => this.fill());
  }

  protected onClose(): void {
    window.clearTimeout(this.timer);
    this.leaving = false;
    this.penaltyDone = false;
    this.xpLost = 0;
  }

  /** Esc / closeAll while still dead: keep the card, show the game menu on top instead. */
  close(): void {
    if (this.isOpen && !this.leaving && !this.done && this.stillDead()) {
      try {
        openPanel('gameMenu');
      } catch {
        /* ignore */
      }
      return;
    }
    super.close();
  }

  private stillDead(): boolean {
    const p = G.player as unknown as { isDead?: boolean } | null;
    return !!p && p.isDead === true;
  }

  private inTown(): boolean {
    return G.scenes?.current?.id === 'town';
  }

  /** 'Burada Diril' exists where there is no checkpoint to run back from: the town and the open world. */
  private canReviveHere(): boolean {
    return (this.inTown() || inOpenWorld()) && !pvp.active;
  }

  private fill(): void {
    const st = G.mplus?.state;
    const mplus = !!st && st.difficulty === 'mythicplus' && !st.completed && !st.failed;
    this.noteEl.innerHTML = '';
    if (mplus && st) {
      this.noteEl.append(
        icon('/assets/icons/ui-hourglass.svg'),
        h('span', null, `Mitik+ ölüm cezası: süreye ${DEATH_PENALTY_SEC} sn eklendi. `, h('b', null, `Toplam ölüm: ${st.deaths}`), st.deathPenaltySec ? ` (+${mmss(st.deathPenaltySec)})` : ''),
      );
      this.noteEl.style.display = 'flex';
    } else if (this.xpLost > 0) {
      this.noteEl.append(
        icon('/assets/icons/ui-skull.svg'),
        h('span', null, 'Açık dünyada ölmenin bedeli: ', h('b', null, `-${fmtInt(this.xpLost)} TP`), ' kaybettin. Seviye kaybetmezsin; eşya ve altın gitmez.'),
      );
      this.noteEl.style.display = 'flex';
    } else {
      this.noteEl.style.display = 'none';
    }

    const remote = (G.world?.players ?? []).filter((p) => !p.isLocal && !(p as { isDead?: boolean }).isDead).length;
    const partyAlive = remote > 0 || [...G.net.peers.values()].some((p) => p.peerId !== G.net.selfId);
    this.reviveEl.innerHTML = '';
    if (partyAlive) {
      const key = (() => {
        try {
          return G.input.bindingLabel('revive');
        } catch {
          return 'Z';
        }
      })();
      this.reviveEl.append(
        h('span.pg-kbd', null, key),
        h('span', null, mplus ? 'Grup arkadaşların cesedinin yanında basılı tutarak seni savaşın ortasında bile diriltebilir. Beklemek istersen serbest bırakma.' : 'Grup arkadaşların cesedinin yanında basılı tutarak seni diriltebilir. Beklemek istersen serbest bırakma.'),
      );
      this.reviveEl.style.display = 'flex';
    } else {
      this.reviveEl.style.display = 'none';
    }
    this.hereBtn.style.display = this.canReviveHere() ? '' : 'none';
    this.tipEl.textContent = 'İpucu: ' + expandKeys(TIPS[Math.floor(Math.random() * TIPS.length)]);
  }

  protected tick(dt: number): void {
    // WP-07 Kızıl Sınır: the release button is a countdown to the nation's graveyard (the scene releases the player itself)
    if (pvp.active) {
      this.labelAcc += dt;
      if (this.labelAcc < 0.2) return;
      this.labelAcc = 0;
      const left = pvp.runtime?.respawnLeft() ?? 0;
      this.releaseBtn.disabled = left > 0.05;
      const sp = this.releaseBtn.querySelector('span');
      if (sp) sp.textContent = left > 0.05 ? `Karargâhta dirilmene ${Math.ceil(left)} sn` : 'Ruhunu Serbest Bırak';
      return;
    }
    if (!this.canReviveHere()) return;
    this.labelAcc += dt;
    if (this.labelAcc < 0.25) return;
    this.labelAcc = 0;
    const wait = Math.max(0, REVIVE_HERE_DELAY - (performance.now() - this.t0) / 1000);
    let cost = 0;
    try {
      cost = G.progression.reviveHereCost();
    } catch {
      cost = 50 * (G.character?.level ?? 1);
    }
    const gold = G.character?.save.gold ?? 0;
    const poor = gold < cost;
    this.hereBtn.disabled = wait > 0 || poor;
    this.hereBtn.title = poor ? 'Yeterli altının yok.' : '';
    this.hereLabel.textContent = wait > 0 ? `Burada Diril (${Math.ceil(wait)})` : `Burada Diril · ${fmtInt(cost)} altın`;
  }

  private release(): void {
    sfx('ui_click');
    // the active scene teleports + revives the player and closes this card itself (releaseLocalPlayer)
    this.done = true;
    G.events.emit('player:releaseRequested', {});
    this.done = false;
    if (this.isOpen && !this.stillDead()) this.requestClose();
  }

  /** Open-world "Burada Diril": 50 x level gold, 50% HP, 3 s immunity. */
  private reviveHere(): void {
    const c = G.character;
    if (!c || !this.canReviveHere()) return;
    let cost = 50 * c.level;
    try {
      cost = G.progression.reviveHereCost();
    } catch {
      /* default */
    }
    if (!c.spendGold(cost)) {
      sfx('ui_error');
      return void toast('Yeterli altının yok.', 'warning');
    }
    sfx('ui_click');
    try {
      const p = G.player;
      G.combat.reviveLocalPlayer(0.5);
      p?.statuses.apply('invulnerable', 3, { sourceId: null });
      G.audio?.play('player_revive');
      if (p) G.vfx.spawn('respawn', p.position.clone().setY(0.05), { scale: 1.1 });
      G.events.emit('camera:shake', { intensity: 0.08, duration: 0.3 });
    } catch (e) {
      console.warn('[death] revive here failed', e);
    }
    if (this.isOpen && !this.stillDead()) this.requestClose();
  }
}
