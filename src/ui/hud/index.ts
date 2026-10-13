import { G } from '../../game/G';
import type { UI, UIMode } from '../UI';
import { div, h, setClass, setStyle } from '../widgets/dom';
import '../styles/hud-edit.css';
import { ActionBar } from './ActionBar';
import { CountdownBanner, InteractPrompt, LevelUpBanner, WorldAnnounce, ZoneBanner } from './Banners';
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
import { AimHint, ComboPoints, DamageDirection, DodgeCharges, PerfectDodgeText, ReadyCheck } from './Extras';
import { Metin2Bar } from './Metin2Bar';
import { Minimap } from './Minimap';
import { MythicTracker } from './MythicTracker';
import { QuestTracker } from './QuestTracker';
import { OrbsWidget } from './Orbs';
import { FpsCounter, Vignette } from './Overlays';
import { PartyFrames } from './PartyFrames';
import { PlayerCastBar, PlayerFrame, XpBar } from './PlayerFrame';
import { PerfOverlay } from '../widgets/PerfOverlay';
import { SpellOverlay } from './SpellOverlay';
import { TargetFrame } from './TargetFrame';
import type { HudCtx, HudWidget } from './types';

export interface HudApi {
  update(dt: number): void;
  setVisible(v: boolean): void;
  flashEdge(color: string, strength?: number): void;
  readonly chat: Chat;
  /** Entity id of the boss shown in the boss frame, if any. */
  readonly bossEntityId: number | null;
  readonly root: HTMLElement;
  /** Current HUD zoom factor (screen px per HUD css px). */
  readonly scale: number;
  /** Enemy under the crosshair / cursor this frame. */
  readonly hover: import('../../entities/Actor').Actor | null;
  /** Recompute the HUD zoom (window size or the user's UI scale changed). */
  rescale(): void;
  /** Bottom HUD style currently shown ('metin2' stone bar with gauges + EXP beads, or the Diablo 'orbs'). */
  readonly hudStyle: HudStyle;
  /** Switch the bottom HUD style (persists the `hudStyle` setting; the HUD applies it on the next frame). */
  setHudStyle(style: HudStyle): void;
  /** True while the WoW-style layout editor (frames + extra bars) is open. */
  readonly editing: boolean;
  /** Open the layout editor (town / dungeon only). */
  startEdit(): void;
  /** Close the layout editor: save = commit the new frame layout, otherwise revert to the committed one. */
  stopEdit(save: boolean): void;
}

export type HudStyle = 'metin2' | 'orbs';

/**
 * OWNER: hud module. Builds all HUD widgets into the UI root:
 * Metin2 bar (gauges + EXP beads) or orbs, + action bar + xp (bottom), player/party frames (left), target + boss (top centre), minimap + M+ tracker (right),
 * chat, loot feed, gold, micro menu, crosshair, combo counter, banners, vignette and fps, damage meter (DamageMeter, Shift+D).
 */
export function createHUD(ui: UI): HudApi {
  const root = div('hud');
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

  // ---- top-left: player, buffs, party ----
  const tl = div('hud-tl', root);
  const player = add(new PlayerFrame(ui));
  tl.appendChild(player.el);
  // F3 / settings.showFps: performance readout, directly under the player frame (hidden = takes no room)
  const perf = add(new PerfOverlay());
  tl.appendChild(perf.el);
  const auras = div('pf-auras', tl);
  auras.appendChild(player.buffs.el);
  auras.appendChild(player.debuffs.el);
  const party = add(new PartyFrames(ui));
  tl.appendChild(party.el);

  // ---- top-centre: boss + target ----
  const tc = div('hud-tc', root);
  const boss = add(new BossFrame());
  tc.appendChild(boss.el);
  root.appendChild(boss.yellEl);
  const target = add(new TargetFrame(ui));
  tc.appendChild(target.el);

  // ---- top-right: minimap + mythic tracker ----
  const tr = div('hud-tr', root);
  const minimap = add(new Minimap());
  tr.appendChild(minimap.el);
  const mythic = add(new MythicTracker(ui));
  tr.appendChild(mythic.el);
  // open world: pinned quest (click = quest log), under the M+ tracker
  const quests = add(new QuestTracker());
  tr.appendChild(quests.el);

  // ---- combo counter (right-middle) ----
  const combo = add(new ComboCounter());
  root.appendChild(combo.el);
  // combo route banner (combo:route), above the counter
  const route = add(new ComboRouteBanner());
  root.appendChild(route.el);

  // ---- bottom-left: chat ----
  const chat = add(new Chat());
  const bl = div('hud-bl', root);
  bl.appendChild(chat.el);

  // ---- bottom-centre: orbs + action bar + xp + cast ----
  const bc = div('hud-bc', root);
  const pcast = add(new PlayerCastBar());
  const bar = add(new ActionBar(ui));
  // xp bar + orbs are only updated while the 'orbs' style is active (the orb canvases are the costly part); the Metin2 bar otherwise
  const xp = new XpBar();
  const orbs = new OrbsWidget();
  const m2 = new Metin2Bar();
  const orbsSet: HudWidget[] = [orbs, xp];
  const m2Set: HudWidget[] = [m2];
  bc.appendChild(pcast.el);
  bc.appendChild(bar.errorEl);
  const cluster = div('hb-cluster', bc);
  cluster.appendChild(orbs.hpEl);
  const mid = div('hb-mid', cluster);
  const extras = div('hb-extras', mid);
  const dodge = add(new DodgeCharges());
  extras.appendChild(dodge.el);
  const cpoints = add(new ComboPoints());
  extras.appendChild(cpoints.el);
  mid.appendChild(bar.el);
  mid.appendChild(xp.el);
  cluster.appendChild(orbs.resEl);
  bc.appendChild(m2.el);

  // ---- bottom HUD style: the ActionBar + extras row move between the orbs cluster and the Metin2 board ----
  let hudStyle: HudStyle | null = null;
  const readStyle = (): HudStyle => (G.settings?.data.hudStyle === 'orbs' ? 'orbs' : 'metin2');
  function applyHudStyle(next: HudStyle): void {
    if (next === hudStyle) return;
    hudStyle = next;
    root.dataset.hudstyle = next;
    if (next === 'metin2') {
      m2.slotsHost.appendChild(bar.el);
      m2.extrasHost.appendChild(extras);
      m2.reset();
    } else {
      mid.insertBefore(bar.el, xp.el);
      mid.insertBefore(extras, bar.el);
    }
  }
  applyHudStyle(readStyle());

  // ---- bottom-right: loot feed, gold, micro menu, fps ----
  const br = div('hud-br', root);
  const loot = add(new LootFeed(ui));
  br.appendChild(loot.el);
  const brRow = div('br-row', br);
  const gold = add(new GoldWidget());
  brRow.appendChild(gold.el);
  const micro = add(new MicroMenu(ui));
  brRow.appendChild(micro.el);
  const fps = add(new FpsCounter());
  br.appendChild(fps.el);

  // ---- damage meter: its own absolute box, bottom-right above the loot column (Shift+D / pill) ----
  const meter = add(new DamageMeter(ui));
  root.appendChild(meter.el);

  // ---- extra action bars (Çubuk 2 / 3) and the layout editor that can move and scale every frame above ----
  const extra = new ExtraBars(ui);
  extra.mount(root);
  const edit = new EditMode({ ui, root, bars: EXTRA_BARS.map((b) => ({ id: b.id, name: b.name })) });
  const editFrames: EditFrame[] = [
    { id: 'player', name: 'Oyuncu çerçevesi', el: player.el },
    { id: 'buffs', name: 'Büff sırası', el: auras },
    { id: 'party', name: 'Parti çerçeveleri', el: party.el },
    { id: 'target', name: 'Hedef çerçevesi', el: target.el },
    { id: 'boss', name: 'Patron çerçevesi', el: boss.el },
    { id: 'minimap', name: 'Mini harita', el: minimap.el },
    { id: 'mplus', name: 'M+ takipçisi', el: mythic.el },
    { id: 'combo', name: 'Kombo sayacı', el: combo.el },
    { id: 'chat', name: 'Sohbet', el: chat.el },
    { id: 'meter', name: 'Hasar ölçer', el: meter.el },
    { id: 'bottom', name: 'Alt çubuk', el: bc },
    { id: 'loot', name: 'Eşya akışı', el: loot.el },
    { id: 'corner', name: 'Altın ve menü', el: brRow },
    ...extra.frames,
  ];
  for (const f of editFrames) edit.register(f);
  const editBtn = h('button', 'hud-edit-btn hud-interactive', brRow, 'Arayüzü Düzenle');
  editBtn.type = 'button';
  brRow.insertBefore(editBtn, brRow.firstChild);
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    api.startEdit();
  });

  // ---- centre overlays ----
  for (const w of [new ZoneBanner(), new WorldAnnounce(), new CountdownBanner(), new LevelUpBanner(), new InteractPrompt()]) {
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

  let visible = true;
  let scale = 1;
  let hover: import('../../entities/Actor').Actor | null = null;
  let lastNow = performance.now();
  let clock = 0;
  let lastW = 0;
  let lastH = 0;
  let lastUser = 0;

  function computeScale(force = false): void {
    const w = window.innerWidth, h = window.innerHeight;
    const user = ui.userScale * ((G.settings?.data as unknown as { uiScale?: number } | undefined)?.uiScale ?? 1);
    if (!force && w === lastW && h === lastH && user === lastUser) return;
    lastW = w;
    lastH = h;
    lastUser = user;
    scale = Math.max(0.75, Math.min(2.2, Math.min(w / 1920, h / 1080))) * user;
    setStyle(root, '--hud-zoom', scale.toFixed(3));
    ui.setScale(scale);
  }

  const api: HudApi = {
    root,
    chat,
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
    get hudStyle() {
      return hudStyle ?? 'metin2';
    },
    setHudStyle(style: HudStyle) {
      if (G.settings) G.settings.set('hudStyle', style);
      applyHudStyle(style);
    },
    setVisible(v: boolean) {
      if (v === visible) return;
      visible = v;
      root.style.display = v ? '' : 'none';
      if (!v) {
        edit.stop(false);
        for (const w of widgets) w.reset?.();
        m2.reset();
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
      applyHudStyle(readStyle());
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
      for (const w of hudStyle === 'orbs' ? orbsSet : m2Set) {
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
