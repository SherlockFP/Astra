import { G } from './G';
import { Engine } from '../core/Engine';
import { EventBus } from '../core/EventBus';
import { Input } from '../core/Input';
import { Assets } from '../core/Assets';
import { Settings } from '../core/Settings';
import { Save } from '../core/Save';
import { SceneManager } from '../core/SceneManager';
import { Audio } from '../audio/Audio';
import { VFX } from '../vfx/VFX';
import { UI } from '../ui/UI';
import { NetSession } from '../net/NetSession';
import { Combat } from '../combat/Combat';
import { SkillSystem } from '../combat/SkillSystem';
import { Minions } from '../combat/Minions';
import { HitShapes } from '../combat/HitShapes';
import { LootSystem } from '../systems/LootSystem';
import { Progression } from '../systems/Progression';
import { MythicPlus } from '../systems/MythicPlus';
import { QuestSystem } from '../systems/Quests';
import { TalentSystem } from '../systems/Talents';
import { ProcEngine } from '../combat/Procs';
import { Auras } from '../combat/Auras';
import { Corpses } from '../combat/Corpses';
import { installSocial } from '../systems/Social';
import { LoadingScene } from '../scenes/LoadingScene';
import { MenuScene } from '../scenes/MenuScene';
import { TownScene } from '../scenes/TownScene';
import { DungeonScene } from '../scenes/DungeonScene';
import { installGraphics } from './graphics';

/**
 * Boot: creates every service into G, wires the frame loop and starts at the loading scene.
 * Frame order (Engine.onUpdate order; [label] = row in G.engine.profile.cpu):
 *   -100 net.update          [net]      (drain network, apply remote state)
 *      0 scenes.update       [scenes]   (scene: controller -> world.update -> camera)
 *     10 skills/combat/hitShapes/mplus/loot updates [combat] (only while a world exists)
 *     50 vfx.update, audio.update [vfx/audio]
 *    100 ui.update          [ui]
 *   1000 input.endFrame     [inputEnd]
 */
/** Create every service into G (shared by the real game and dev harness pages). */
export function createServices(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root') as HTMLElement;

  G.events = new EventBus();
  G.settings = new Settings();
  G.save = new Save();
  G.engine = new Engine(canvas);
  G.input = new Input(canvas);
  G.assets = new Assets();
  G.scenes = new SceneManager(uiRoot);
  G.audio = new Audio();
  G.vfx = new VFX();
  G.ui = new UI();
  G.net = new NetSession();
  G.combat = new Combat();
  G.skills = new SkillSystem();
  G.minions = new Minions();
  G.auras = new Auras();
  G.corpses = new Corpses();
  G.hitShapes = new HitShapes();
  // QuestSystem before LootSystem: LootSystem creates one itself if missing (avoid a duplicate subscriber)
  G.quests = new QuestSystem();
  G.loot = new LootSystem();
  G.progression = new Progression();
  // GDD_TALENTS (T0): stubs until T4 (ProcEngine) and T5 (TalentSystem) replace the classes.
  G.procs = new ProcEngine();
  G.talents = new TalentSystem();
  G.mplus = new MythicPlus();
  installSocial(); // G.presence + Genel / Ticaret / fisilti on the global lobby

  // saved key bindings for the active control scheme (CONTROLS_WOW §2.3)
  applyStoredBindings();
  G.settings.onChange((key) => {
    if (key === 'controlScheme' || key === 'bindings' || key === 'schemeBindings') applyStoredBindings();
    G.events.emit('settings:changed', { key: String(key) });
  });
  // CONTROLS_WOW §2.4: one-time hint after the migration, on the first town or dungeon scene.
  G.events.on('scene:changed', ({ to }) => {
    if ((to !== 'town' && to !== 'dungeon') || G.settings.data.controlsHintShown) return;
    G.settings.set('controlsHintShown', true);
    G.ui.toast('Kontrol şeması WoW oldu. Eski düzene dönmek için Ayarlar → Kontroller → Kontrol Şeması: Aksiyon.', 'info');
  });
  G.events.on('hitstop', ({ ms }) => G.engine.hitStop(ms));

  installGraphics();
  G.ui.init(uiRoot);
}

/** Rebuilds the input bindings from the stored settings: the active scheme's defaults, shared overrides, then this scheme's overrides. */
function applyStoredBindings(): void {
  const d = G.settings.data;
  G.input.applyScheme(d.controlScheme, d.bindings, d.schemeBindings[d.controlScheme]);
}

/** Per-frame service updates (everything except scenes). */
export function installServiceUpdates(): void {
  const e = G.engine;
  e.onUpdate((dt) => G.net.update(dt), -100, 'net');
  e.onUpdate((dt) => {
    if (!G.world) return;
    G.skills.update(dt);
    G.auras?.update(dt);
    G.combat.update(dt);
    G.minions.update(dt);
    G.corpses?.update(dt);
    G.hitShapes.update(dt);
    G.mplus.update(dt);
    G.loot.update(dt);
  }, 10, 'combat');
  e.onUpdate((dt) => {
    G.vfx.update(dt);
    G.audio.update(dt);
  }, 50, 'vfx/audio');
  e.onUpdate((dt) => G.ui.update(dt), 100, 'ui');
  e.onUpdate(() => G.input.endFrame(), 1000, 'inputEnd');
}

export async function bootGame(): Promise<void> {
  createServices();

  G.scenes.onView = (scene, camera) => {
    G.engine.setView(scene, camera);
    G.vfx.attach(scene, camera);
  };
  G.scenes.onChange = (from, to) => {
    G.input.gameScene = to === 'town' || to === 'dungeon'; // GDD_V2: F2-F5 party keys are swallowed only in game scenes
    G.events.emit('scene:changed', { from, to });
  };
  G.scenes.onLeaving = (from, to) => G.events.emit('scene:leaving', { from, to });
  G.scenes.onError = (id) => {
    G.ui.toast(`Sahne yüklenemedi (${id}). Geri dönülüyor...`, 'error');
    return id === 'menu' ? null : G.character ? (id === 'town' ? 'menu' : 'town') : 'menu';
  };

  G.scenes.register('loading', () => new LoadingScene());
  G.scenes.register('menu', () => new MenuScene());
  G.scenes.register('town', () => new TownScene());
  G.scenes.register('dungeon', () => new DungeonScene());

  G.engine.onUpdate((dt) => G.scenes.update(dt), 0, 'scenes');
  installServiceUpdates();

  // Audio needs a user gesture; init is safe to call early and unlocks on first input.
  G.audio.init().catch((err) => console.warn('[audio] init failed', err));
  await G.vfx.init().catch((err) => console.warn('[vfx] init failed', err));

  G.engine.start();
  await G.scenes.go('loading');
}
