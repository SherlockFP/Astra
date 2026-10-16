import { G } from '../../game/G';
import type { UI, UIMode } from '../UI';
import { div, h, setClass, setStyle } from '../widgets/dom';
import '../styles/hud-edit.css';
import { ActionBar } from './ActionBar';
import { BannerQueue, CountdownBanner, InteractPrompt, LevelUpBanner, QuestBanner, ZoneBanner } from './Banners';
import { BossFrame } from './BossFrame';
import { Chat } from './Chat';
import { CombatCues } from './CombatCues';
import { ComboCounter } from './ComboCounter';
import { ComboRouteBanner } from './ComboRoute';
import { DeathRecapCard } from './DeathRecap';
import { GoldWidget, LootFeed, MicroMenu } from './Corner';
import { Crosshair, findHoverTarget } from './Crosshair';
import { DamageMeter } from './DamageMeter';
import { EditMode, type EditFrame } from './EditMode';
import { ExtraBars, EXTRA_BARS } from './ExtraBars';
import { AimHint, DamageDirection, DodgeCharges, PerfectDodgeText, ReadyCheck } from './Extras';
import { Minimap } from './Minimap';
import { MinionFrames } from './MinionFrames';
import { ArenaHud } from './ArenaHud';
import { MatchFoundPopup, QueueBar } from './QueueBar';
import { MythicTracker } from './MythicTracker';
import { QuestTracker } from './QuestTracker';
import { Vignette } from './Overlays';
import { PartyFrames } from './PartyFrames';
import { PipBar } from './PipBar';
import { PlayerCastBar, PlayerFrame } from './PlayerFrame';
import { PerfOverlay } from '../widgets/PerfOverlay';
import { SpellOverlay } from './SpellOverlay';
import { TargetFrame } from './TargetFrame';
import { ContextTracker } from './Tracker';
import { FlaskRow } from './FlaskRow';
import { ObjectiveArrow } from './ObjectiveArrow';
import { QuestFeed } from './QuestFeed';
import { adviceAvailable, adviceLine } from '../panels/game/guideEngine';
import { TipCards } from './TipCards';
import { CastErrors } from './CastErrors';
import { FirstKillHint } from './FirstKillHint';
import { GuideCard } from './Onboarding';
import { ControlsOverlay } from './ControlsOverlay';
import { XpStrip } from './XpStrip';
import type { HudCtx, HudDensity, HudWidget, HudZones } from './types';
// last on purpose: the ElvUI skin overrides every earlier HUD sheet (docs/UI_WOW_CLASSIC.md)
import '../styles/hud-elvui.css';

export interface HudApi {
  update(dt: number): void;
  setVisible(v: boolean): void;
  flashEdge(color: string, strength?: number): void;
  readonly chat: Chat;
  /** Size class of the HUD (§2.2), mirrored on the root as `data-density`. */
  readonly density: HudDensity;
  /** Zone containers of §2.5 (see styles/hud.css and the split zone sheets). */
  readonly zones: HudZones;
  /** The top-right tracker column (M+ tracker and quest tracker for now; UX-12 makes it the context tracker). */
  readonly tracker: ContextTracker;
  /** The tip card slot (§4.7). */
  readonly tips: TipCards;
  /** NPC id the guide highlights (§4.3), or null. Stored here; the world marker reads it in UX-21. */
  readonly guideTarget: string | null;
  setGuideTarget(npcId: string | null): void;
  /** One-line advice for the tracker `hint` pane. Assigned by the guide module (UX-21); absent until then. */
  adviceLine?: () => string;
  /** True when the advice is a quest not accepted yet ("Alınacak" in the tracker). */
  adviceAvailable?: () => boolean;
  /** Entity id of the boss shown in the boss frame, if any. */
  readonly bossEntityId: number | null;
  readonly root: HTMLElement;
  /** Current HUD zoom factor (screen px per HUD css px). */
  readonly scale: number;
  /** Enemy under the crosshair / cursor this frame. */
  readonly hover: import('../../entities/Actor').Actor | null;
  /** Recompute the HUD zoom (window size or the user's UI scale changed). */
  rescale(): void;
  /** Bottom HUD style: always 'elvui' from UX-10 on (the parked 'metin2' and 'orbs' skins are not mounted). */
  readonly hudStyle: HudStyle;
  /** No-op since UX-10: the ElvUI grid is the only bottom HUD; the parked skins are kept as backlog options (UX-70). */
  setHudStyle(style: HudStyle): void;
  /** True while the WoW-style layout editor (frames + extra bars) is open. */
  readonly editing: boolean;
  /** Open the layout editor (town / dungeon only). */
  startEdit(): void;
  /** Close the layout editor: save = commit the new frame layout, otherwise revert to the committed one. */
  stopEdit(save: boolean): void;
}

export type HudStyle = 'elvui' | 'metin2' | 'orbs';

/**
 * OWNER: hud module. Builds all HUD widgets into the UI root:
 * Metin2 bar (gauges + EXP beads) or orbs, + action bar + xp (bottom), player/party frames (left), target + boss (top centre), minimap + M+ tracker (right),
 * chat, loot feed, gold, micro menu, crosshair, combo counter, banners, vignette and fps, damage meter (DamageMeter, Shift+D).
 */
export function createHUD(ui: UI): HudApi {
  const root = div('hud');
  root.dataset.hudstyle = 'elvui';
  ui.hudLayer.appendChild(root);
  const widgets: HudWidget[] = [];
  const add = <T extends HudWidget>(w: T): T => {
    widgets.push(w);
    return w;
  };

  const casts = ui.casts;

  // ---- overlays (under everything) ----
  const vignette = add(new Vignette());
  root.appendChild(vignette.el);

  // ---- zone containers (§2.5): the new ones are empty and pass-through until their widgets move in ----
  const zUf = div('hud-uf', root);
  const zXp = div('hud-xp', root);
  const zMl = div('hud-ml', root);
  const zTip = div('hud-tip', root);

  // ---- top-left: player, buffs, party ----
  const tl = div('hud-tl', root);
  const player = add(new PlayerFrame(ui));
  // UX-10 composition flip: the player frame lives in the .hud-uf zone (UX-11 positions it)
  zUf.appendChild(player.el);
  // NC36: class resource pips (Çi, Kutsal Güç, Ruh Parçası, Kombo, Rün...) in the player frame's pip slot; the old rogue-only ComboPoints widget is replaced by it
  const pips = add(new PipBar());
  player.pipsHost.appendChild(pips.el);
  // F3 / settings.showFps: performance readout, directly under the player frame (hidden = takes no room)
  const perf = add(new PerfOverlay());
  tl.appendChild(perf.el);
  // UX-11: the buff / debuff rows are children of the player frame itself (no pf-auras wrapper)
  const party = add(new PartyFrames(ui));
  tl.appendChild(party.el);
  // NC44: the local player's minions (pet, demon, golem, timed summons; the ghoul army as one "×N" row) under the party frames
  const minions = add(new MinionFrames());
  tl.appendChild(minions.el);

  // ---- top-centre: boss + target ----
  const tc = div('hud-tc', root);
  // failed-cast error line (WoW error text): top centre, not on the action bar
  root.appendChild(add(new CastErrors()).el);
  const boss = add(new BossFrame());
  tc.appendChild(boss.el);
  root.appendChild(boss.yellEl);
  const target = add(new TargetFrame(ui));
  // UX-10: the target frame moves into the .hud-uf zone next to the player frame
  zUf.appendChild(target.el);

  // ---- top-right: minimap + mythic tracker ----
  const tr = div('hud-tr', root);
  const minimap = add(new Minimap());
  tr.appendChild(minimap.el);
  // GDD_PVP_FINDER §5.3: the arena queue bar sits under the minimap (hidden while no arena queue runs)
  const queueBar = add(new QueueBar());
  tr.appendChild(queueBar.el);
  // ElvUI default: the player's buffs and debuffs sit left of the minimap (hud-elvui.css .hud-auras), not on the player frame
  const auraHost = div('hud-auras', minimap.el);
  auraHost.appendChild(player.buffs.el);
  auraHost.appendChild(player.debuffs.el);
  const mythic = add(new MythicTracker(ui));
  // open world: pinned quest (click = quest log), under the M+ tracker
  const quests = add(new QuestTracker());
  // one tracker column for now (UX-01 stub): it holds the M+ tracker and the quest tracker
  const tracker = add(new ContextTracker(ui, mythic, quests));
  tr.appendChild(tracker.el);

  // ---- combo counter + route banner (UX-01: anchored in .hud-ml, 48 px / 40 %) ----
  const combo = add(new ComboCounter());
  zMl.appendChild(combo.el);
  // combo route banner (combo:route), above the counter
  const route = add(new ComboRouteBanner());
  zMl.appendChild(route.el);

  // ---- bottom-left: chat ----
  const chat = add(new Chat());
  const bl = div('hud-bl', root);
  bl.appendChild(chat.el);

  // ---- bottom-centre (UI §2.6, UX-10): the 12-slot ElvUI grid, its extras rows and the cast bar ----
  const bc = div('hud-bc', root);
  const pcast = add(new PlayerCastBar());
  // consumable strip under the player frame (§2.6.5): potions + Panzehir here, then the equipped flasks
  const consHost = div('uf-cons', zUf);
  const bar = add(new ActionBar(ui, { cons: consHost }));
  // level-1 combat line above the action bar until the first kill (FirstKillHint.ts)
  bc.appendChild(add(new FirstKillHint()).el);
  const flasks = add(new FlaskRow());
  consHost.appendChild(flasks.el);
  // XP strip on the bottom edge (§2.6.7, .hud-xp)
  const xpStrip = add(new XpStrip(ui));
  zXp.appendChild(xpStrip.el);
  bc.appendChild(pcast.el);
  const extras = div('hb-extras', bc);
  const dodge = add(new DodgeCharges());
  extras.appendChild(dodge.el);
  bc.appendChild(bar.el);

  // ---- bottom-right column (§2.10, top -> bottom): loot feed, damage meter (out of the flow while hidden), gold, micro menu ----
  const br = div('hud-br', root);
  const loot = add(new LootFeed(ui));
  br.appendChild(loot.el);
  const meter = add(new DamageMeter(ui));
  br.appendChild(meter.el);
  const brRow = div('br-row', br);
  const gold = add(new GoldWidget());
  brRow.appendChild(gold.el);
  const micro = add(new MicroMenu(ui));
  brRow.appendChild(micro.el);

  // ---- extra action bars (Çubuk 2 / 3) and the layout editor that can move and scale every frame above ----
  const extra = new ExtraBars(ui);
  extra.mount(root);
  const edit = new EditMode({ ui, root, bars: EXTRA_BARS.map((b) => ({ id: b.id, name: b.name })) });
  const editFrames: EditFrame[] = [
    { id: 'player', name: 'Oyuncu çerçevesi', el: player.el },
    { id: 'party', name: 'Parti çerçeveleri', el: party.el },
    { id: 'minions', name: 'Yoldaş çerçeveleri', el: minions.el },
    { id: 'target', name: 'Hedef çerçevesi', el: target.el },
    { id: 'boss', name: 'Patron çerçevesi', el: boss.el },
    { id: 'minimap', name: 'Mini harita', el: minimap.el },
    { id: 'tracker', name: 'Takipçi', el: tracker.el },
    { id: 'combo', name: 'Kombo sayacı', el: combo.el },
    { id: 'chat', name: 'Sohbet', el: chat.el },
    { id: 'meter', name: 'Hasar ölçer', el: meter.el },
    { id: 'bottom', name: 'Alt çubuk', el: bc },
    { id: 'loot', name: 'Eşya akışı', el: loot.el },
    { id: 'corner', name: 'Altın ve menü', el: brRow },
    ...extra.frames,
  ];
  for (const f of editFrames) edit.register(f);
  // ---- onboarding (§4.4, §4.7): tip cards above the chat, the objective arrow over the centre ----
  const tips = add(new TipCards(ui));
  zTip.appendChild(tips.el);
  // first-10-minutes guide (systems/onboarding.ts): the card takes the tip slot while it runs; "?" opens the controls sheet
  const guide = add(new GuideCard(ui));
  zTip.appendChild(guide.el);
  root.appendChild(new ControlsOverlay().el);
  const arrow = add(new ObjectiveArrow(ui));
  root.appendChild(arrow.el);
  const feed = new QuestFeed();
  root.appendChild(feed.el);

  // ---- centre overlays (§2.11): ranks 2-5 go through one banner queue; the queue itself is a widget ----
  const banners = add(new BannerQueue());
  const zoneBanner = new ZoneBanner(banners);
  const levelBanner = new LevelUpBanner(banners);
  const questBanner = new QuestBanner(banners);
  // the banner lane sits in the top layer (above the windows, layer-panels 100): a quest dialog never hides a level-up (WoW)
  const bannerLayer = div('hud-banners', ui.topLayer);
  for (const w of [zoneBanner, levelBanner, questBanner]) {
    add(w);
    bannerLayer.appendChild(w.el);
  }
  for (const w of [new CountdownBanner(), new InteractPrompt()]) {
    add(w);
    root.appendChild(w.el);
  }
  const xh = add(new Crosshair());
  root.appendChild(xh.el);
  // CW-09: spell activation overlays (<= 3 procs) around the reticle, burst banner + edge vignette
  const spells = add(new SpellOverlay());
  root.appendChild(spells.el);
  // parry / riposte / finisher cues, guard arc, LMB prompts and the lock-on ring (all around the reticle or the hard target)
  const cues = add(new CombatCues());
  root.appendChild(cues.el);
  // death recap ("Ölüm Özeti"): right side while the local player is dead
  const recap = add(new DeathRecapCard());
  root.appendChild(recap.el);
  const dmgDir = add(new DamageDirection());
  root.appendChild(dmgDir.el);
  for (const w of [new AimHint(), new PerfectDodgeText(), new ReadyCheck()]) {
    add(w);
    root.appendChild(w.el);
  }
  // GDD_PVP_FINDER §5.5 / §5.3: arena HUD (top centre, results card) and the match-found popup (with the queue bar's state)
  for (const w of [new ArenaHud(), new MatchFoundPopup()]) {
    add(w);
    root.appendChild(w.el);
  }

  let visible = true;
  let scale = 1;
  let hover: import('../../entities/Actor').Actor | null = null;
  let lastNow = performance.now();
  let clock = 0;
  let lastW = 0;
  let lastH = 0;
  let lastUser = 0;
  let density: HudDensity = 'lg';
  let guideTarget: string | null = null;

  function computeScale(force = false): void {
    const w = window.innerWidth, h = window.innerHeight;
    const user = ui.userScale * ((G.settings?.data as unknown as { uiScale?: number } | undefined)?.uiScale ?? 1);
    if (!force && w === lastW && h === lastH && user === lastUser) return;
    lastW = w;
    lastH = h;
    lastUser = user;
    scale = Math.max(0.8, Math.min(2.2, Math.min(w / 1920, h / 1080))) * user;
    // §2.2: the HUD width in css px decides the size class; the user's UI-size slider is part of `scale`, so it counts too
    const hudW = w / scale;
    density = hudW >= 1800 ? 'lg' : hudW >= 1500 ? 'md' : 'sm';
    root.dataset.density = density;
    setStyle(root, '--hud-w', hudW.toFixed(0));
    setStyle(root, '--hud-zoom', scale.toFixed(3));
    ui.setScale(scale);
  }

  const api: HudApi = {
    root,
    chat,
    get density() {
      return density;
    },
    zones: { tl, tc, tr, bl, bc, br, uf: zUf, xp: zXp, ml: zMl, tip: zTip },
    tracker,
    tips,
    adviceLine,
    adviceAvailable,
    get guideTarget() {
      return guideTarget;
    },
    setGuideTarget(npcId: string | null) {
      guideTarget = npcId;
    },
    get scale() {
      return scale;
    },
    get bossEntityId() {
      return boss.activeEntityId;
    },
    get hover() {
      return hover;
    },
    flashEdge: (c, s) => vignette.flashEdge(c, s),
    rescale: () => computeScale(true),
    get hudStyle(): HudStyle {
      return 'elvui';
    },
    setHudStyle(_style: HudStyle) {
      // UX-10: parked (the ElvUI grid is the only bottom HUD); kept so callers keep compiling
    },
    setVisible(v: boolean) {
      if (v === visible) return;
      visible = v;
      root.style.display = v ? '' : 'none';
      if (!v) {
        edit.stop(false);
        for (const w of widgets) w.reset?.();
      }
    },
    get editing() {
      return edit.editing;
    },
    startEdit() {
      edit.start();
    },
    stopEdit(save: boolean) {
      edit.stop(save);
    },
    update(_dt: number) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      clock += dt;
      computeScale();
      if (!visible) return;
      const mode: UIMode = ui.mode;
      const ctx: HudCtx = {
        ui, dt, now, t: clock, player: G.player, world: G.world, character: G.character, mode, hover: null, casts, scale,
      };
      hover = mode === 'town' || mode === 'dungeon' ? findHoverTarget(ctx) : null;
      ctx.hover = hover;
      try {
        boss.update(ctx);
      } catch (e) {
        reportOnce(boss, e);
      }
      target.bossFrameVisible = boss.visible;
      target.bossEntityId = boss.activeEntityId;
      for (const w of widgets) {
        if (w === boss) continue;
        try {
          w.update(ctx);
        } catch (e) {
          reportOnce(w, e);
        }
      }
      setClass(root, 'has-boss', boss.visible);
      setClass(root, 'has-party', party.el.childElementCount > 0);
      try {
        extra.update(ctx);
      } catch (e) {
        console.error('[hud] extra bars failed', e);
      }
      // own guard: a failing bar must not stop the saved frame offsets from being kept inside the window
      try {
        edit.update();
      } catch (e) {
        console.error('[hud] layout editor failed', e);
      }
    },
  };
  return api;
}

const reported = new WeakSet<object>();
function reportOnce(w: object, e: unknown): void {
  if (reported.has(w)) return;
  reported.add(w);
  console.error('[hud] widget update failed (reported once):', w.constructor?.name, e);
}
