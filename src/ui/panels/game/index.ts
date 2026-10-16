import { G } from '../../../game/G';
import type { UI } from '../../UI';
import type { GamePanel } from './base';
import { TalentsPanel } from './talents';
import { KeystonePanel } from './keystone';
import { RunSummaryPanel, currentXpPoint, noteRunStart, type RunSummaryData } from './runSummary';
import { installRunTally, runKeyOf } from './runTally';
import { MplusInfoPanel } from './mplusInfo';
import { SettingsPanel } from './settings';
import { PartyPanel } from './party';
import { MapPanel, installMapTracker } from './map';
import { DeathPanel } from './death';
import { GameMenuPanel } from './gameMenu';
import { BountyPanel, TrainerPanel } from './bounty';
import { CreditsPanel } from './credits';
import { QuestLogPanel, QuestDialogPanel } from './quests';
import { WaypointsPanel } from './waypoints';
import { FinderPanel } from './finder';
import { GuidePanel } from './guide';
import { WelcomePanel } from './welcome';
import { MarketOpenPanel, MarketStallPanel, MarketSearchPanel } from './market';
import { AchievementsPanel } from './achievements';
import { CollectionPanel } from './collection';
import { ProfessionsPanel } from './professions';
import { GuildPanel } from './guild';
import { PvpBoardPanel } from './pvpBoard';
import { ArenaRankPanel } from './arenaRank';
import { BetaGuidePanel } from './betaGuide';

/**
 * OWNER: panels-game module.
 * Panel ids: talents, keystone, runSummary, mplusInfo, settings, party, map, death, gameMenu, bounty, trainer, credits,
 * questlog (quest log), dialog (quest giver, Av Defteri), waypoints (Işınlayıcı, fast travel),
 * finder (Grup Bulucu, I), guide (Ne Yapmalıyım?, .), welcome (Hoş Geldin; UX-02 stubs),
 * marketOpen (Tezgâh kur / yönet + Bohça Al), marketStall (alıcı penceresi), marketSearch (Pazar Arama) - CM14 Pazar, ./market/*,
 * guild (Lonca: kur / üye listesi / davet; WP-05, ./guild.ts), arenaRank (Sıralama: arena kademeleri, sezon geçmişi; ./arenaRank.ts),
 * betaGuide (Beta Rehberi: beta karakterin ışınlanma menüsü, ./betaGuide.ts).
 * Besides registering the panels this module reacts to a few game events on its own:
 *   player:died (local)   -> opens 'death' after a short beat; player:revived / scene:leaving -> closes it
 *   run:started           -> remembers the M+ rating (for the summary's rating gain)
 *   run:completed         -> opens 'runSummary' (duplicate opens of the same run are ignored)
 * and keeps a fog-of-war exploration tracker running for the map.
 */
const registry = new Map<string, GamePanel>();
let disposers: (() => void)[] = [];

/** Direct access to a panel instance (dev pages / tests). */
export function getGamePanel(id: string): GamePanel | undefined {
  return registry.get(id);
}

export { GAME_VERSION } from './gameMenu';
export type { RunSummaryData } from './runSummary';

export function registerGamePanels(ui: UI): void {
  registry.clear();
  const panels: GamePanel[] = [
    new TalentsPanel(),
    new KeystonePanel(),
    new RunSummaryPanel(),
    new MplusInfoPanel(),
    new SettingsPanel(),
    new PartyPanel(),
    new MapPanel(),
    new DeathPanel(),
    new GameMenuPanel(),
    new BountyPanel(),
    new TrainerPanel(),
    new CreditsPanel(),
    new QuestLogPanel(),
    new QuestDialogPanel(),
    new WaypointsPanel(),
    new FinderPanel(),
    new GuidePanel(),
    new WelcomePanel(),
    new MarketOpenPanel(),
    new MarketStallPanel(),
    new MarketSearchPanel(),
    new AchievementsPanel(),
    new CollectionPanel(),
    new ProfessionsPanel(),
    new GuildPanel(),
    new PvpBoardPanel(),
    new ArenaRankPanel(),
    new BetaGuidePanel(),
  ];
  for (const p of panels) {
    registry.set(p.id, p);
    ui.registerPanel(p);
  }
  installAutoBehaviour();
}

function openVia(id: string, data?: unknown): void {
  try {
    G.ui.openPanel(id, data);
  } catch {
    /* ui not ready */
  }
  // UI registry might be a stub or might not have opened it: make sure it is visible.
  const p = registry.get(id);
  if (p && !p.isOpen) p.open(data);
}

function closeVia(id: string): void {
  try {
    G.ui.closePanel(id);
  } catch {
    /* ignore */
  }
  const p = registry.get(id);
  if (p?.isOpen) p.close();
}

function installAutoBehaviour(): void {
  for (const d of disposers) d();
  disposers = [];
  const ev = G.events;
  if (!ev) {
    // events not created yet (very early registration): retry once the engine tick exists
    window.setTimeout(() => G.events && installAutoBehaviour(), 0);
    return;
  }
  let deathTimer = 0;
  disposers.push(
    ev.on('player:died', (p) => {
      if (!p.local) return;
      window.clearTimeout(deathTimer);
      deathTimer = window.setTimeout(() => {
        const pl = G.player as unknown as { isDead?: boolean } | null;
        if (pl && pl.isDead === false) return; // already revived (e.g. phoenix mantle)
        openVia('death');
      }, 1100);
    }),
    ev.on('player:revived', (p) => {
      if (!p.local) return;
      window.clearTimeout(deathTimer);
      closeVia('death');
    }),
    ev.on('scene:leaving', () => {
      window.clearTimeout(deathTimer);
      const death = registry.get('death');
      if (death instanceof DeathPanel) death.markLeaving(true); // let the close through even though the player is still dead
      closeVia('death');
    }),
    ev.on('scene:changed', () => {
      const death = registry.get('death');
      if (death instanceof DeathPanel) death.markLeaving(false);
    }),
    ev.on('run:started', () => noteRunStart()),
    ev.on('run:completed', (payload) => {
      window.setTimeout(() => {
        const data: RunSummaryData = { state: payload.state, record: payload.record, rewards: payload.rewards };
        openVia('runSummary', data);
      }, 2200);
    }),
    // XP / gold / pickups of the run (the summary's tally); finished on run:completed, before the card opens
    installRunTally(ev, currentXpPoint, runKeyOf),
    installMapTracker(),
  );
}
