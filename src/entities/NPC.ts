import * as THREE from 'three';
import '../ui/styles/world-markers.css';
import { Entity } from './Entity';
import type { Interactable } from './Interactable';
import type { Player } from './Player';
import { AnimController } from './AnimController';
import type { World } from '../world/World';
import type { TownDef } from '../types/dungeons';
import type { WorldLabelHandle } from '../ui/UI';
import type { BubbleHandle } from '../ui/widgets/Bubbles';
import { G } from '../game/G';
import { RNG, dampAngle, dist2D, hashString } from '../core/utils';
import { setAccessories, tintObject } from '../scenes/CharacterVisual';
import { inView } from './ViewCull';
import { charLodPlan, getGfxQuality, type CharLodPlan } from '../world/WorldPerf';
import { nearerCount, registerCharLod, tierFor, type CharTier } from './CharacterLod';
import { characterBillboard } from './CharacterBillboard';
import { ambientLodPlan, sampleRoute } from './AmbientRoute';

export type NpcRole = TownDef['npcs'][number]['role'];
export type NpcDef = TownDef['npcs'][number];
/** Quest marker over an NPC: 'offer' = '!' yellow, 'turnin' = '?' gold, 'locked' = grey '!' (level gate). */
export type NpcQuestMark = 'offer' | 'turnin' | 'locked';

/** How an NPC looks and behaves (GDD_CONTENT 2.3). Keyed by npc id; falls back to a per-role preset. */
export interface NpcPreset {
  /** 'Knight' | 'Barbarian' | 'Mage' | 'Rogue' | 'Rogue_Hooded' | 'King' | 'Worker' or a GLB url. */
  base: string;
  /** KayKit accessory nodes to show (everything else is hidden). */
  show?: string[];
  tint?: number;
  scale?: number;
  title?: string;
  idle?: string;
  interactClip?: string;
  periodic?: { clip: string; every: number; speed?: number; offset?: number };
  barks?: string[];
  greeting?: string;
  /** Closed walking loop (world metres) walked in `lap` seconds; `phase` 0..1 shifts the start along the loop. */
  patrol?: { path: [number, number][]; lap: number; phase: number };
  /** Ambient shouts (see TownNpc.shouts), one is picked per call. */
  shouts?: string[];
}

/** A circular patrol loop (16 points) used by guard presets that the content module did not give an explicit path. */
function circlePatrol(cx: number, cz: number, r: number, lap: number, phase: number): NonNullable<NpcPreset['patrol']> {
  const path: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16 + phase) * Math.PI * 2;
    path.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return { path, lap, phase: 0 };
}

const GUARD_SHOW = ['1H_Sword', 'Rectangle_Shield', 'Knight_Helmet', 'Knight_Cape'];

export const NPC_PRESETS: Record<string, NpcPreset> = {
  npc_demirci: {
    base: 'Barbarian', show: ['1H_Axe'], tint: 0xb08060, title: 'Demirci', idle: 'Idle',
    periodic: { clip: '1H_Melee_Attack_Chop', every: 3.2, speed: 1.1 },
    greeting: 'Demir sıcakken dövülür, yiğidim. Ne getirdin?',
    barks: ['Silahın +15 olsun da gör...', 'Örsüm susmaz, demir dinlenmez.', 'Bozulmaktan korkan, yükselemez!'],
  },
  npc_cirak: {
    base: 'Worker', scale: 1.15, title: 'Çırak', idle: 'Interact', barks: ['Usta bugün çok sinirli...', 'Bileği taşı yine bozuldu!'],
    greeting: 'Usta bugün çok sinirli... Ona yaklaşmasan iyi olur.',
  },
  npc_efsuncu: {
    base: 'Mage', show: ['1H_Wand', 'Spellbook_open', 'Mage_Hat'], tint: 0x7040a0, title: 'Efsuncu', idle: 'Idle',
    periodic: { clip: 'Spellcast_Raise', every: 8 },
    greeting: 'Efsun, sabır ister. Ve biraz da altın.',
    barks: ['Kaderin iplerini yeniden ören biriyim.', 'Her efsun bir kumardır.'],
  },
  npc_tuccar: {
    base: 'Rogue_Hooded', show: ['Rogue_Cape'], tint: 0x406080, title: 'Tüccar', idle: 'Idle', interactClip: 'Interact',
    greeting: 'Her şeyin bir fiyatı var. Senin de.',
    barks: ['Bak, ne güzel mallar!', 'Altınını say, sonra konuşuruz.', 'Bu fiyata bulamazsın!'],
  },
  npc_simyaci: {
    base: 'Mage', show: ['1H_Wand'], tint: 0x40a060, title: 'Simyacı', idle: 'Idle',
    periodic: { clip: 'Spellcasting', every: 6 },
    greeting: 'Bu yeşil olanı içme. Henüz.',
    barks: ['İksirler! Taze kaynamış iksirler!', 'Kazan bugün huysuz...'],
  },
  npc_depocu: {
    base: 'Barbarian', show: ['Mug'], tint: 0x806040, title: 'Depocu', idle: 'Idle', periodic: { clip: 'Use_Item', every: 7 },
    greeting: 'Eşyaların bende güvende. Çoğu zaman.',
    barks: ['Sandıklar dolu, hafıza boş.', 'Eşyalarını bana emanet et.'],
  },
  npc_anahtar_ustasi: {
    base: 'Knight', show: ['Badge_Shield', 'Knight_Cape'], tint: 0xc0a060, title: 'Anahtar Ustası', idle: 'Idle',
    periodic: { clip: 'Use_Item', every: 9 },
    greeting: 'Anahtar taşı seni seçti. Kehanet Taşı\'na götür onu.',
    barks: ['Her anahtar bir sınavdır.', 'Haftalık efsunlara dikkat et.'],
  },
  npc_lord_tarhan: {
    base: 'King', scale: 1.15, title: 'Kadim Hazine', idle: 'Idle_Neutral', periodic: { clip: 'Wave', every: 10 },
    greeting: 'Kuzgunkale cesurları ödüllendirir.',
    barks: ['Haftalık hazine seni bekliyor.', 'Cesaretin bu şehrin gururu.'],
  },
  npc_egitmen: {
    base: 'Knight', show: ['2H_Sword'], tint: 0x808080, title: 'Eğitmen', idle: '2H_Melee_Idle',
    periodic: { clip: '2H_Melee_Attack_Slice', every: 5 },
    greeting: 'Ağacın köklerini söküp yeniden dikmek mi? Bedeli var.',
    barks: ['Kuklalara vur, öğren!', 'Kombo yapmayı unutma.'],
  },
  npc_muhtar: {
    base: 'Barbarian', show: [], tint: 0x705030, title: 'Muhtar', idle: 'Idle', interactClip: 'Interact',
    greeting: 'Zindanlar yine kıpırdıyor. İş var, ödül var.',
    barks: ['İlan tahtasına bir göz at!', 'Günlük görevler seni bekler.'],
  },
  npc_gizemli_tuccar: {
    base: 'Rogue_Hooded', show: ['Throwable'], tint: 0x30203a, title: 'Kumarbaz', idle: 'Idle', interactClip: 'Interact',
    periodic: { clip: 'Throw', every: 6, offset: 3 },
    greeting: 'Psst... Kesende ne var, bilmeden alırım. Belki bir efsane çıkar. Belki çıkmaz.',
    barks: ['Şansını dene, yiğidim...', 'Kapalı kutu, açık kader.', 'Kazanan hep evdir. Ama bazen sen kazanırsın.'],
  },
  npc_muhurdar: {
    base: 'Knight', show: ['Badge_Shield'], tint: 0x506070, title: 'Mühürdar', idle: 'Idle', interactClip: 'Interact',
    greeting: 'Mührünü getir, ödülünü al.',
    barks: ['Av Mührü biriktir, boş dönme.', 'Günlük işlerin ödülü burada geçer.', 'Her mühür bir iş, her iş bir ödül.'],
  },
  npc_meyhaneci: {
    base: 'Barbarian', show: ['Mug'], tint: 0x9a6a40, title: 'Meyhaneci', idle: 'Idle', periodic: { clip: 'Use_Item', every: 8 },
    greeting: 'Zindandan sağ döneni bir içki benden!', barks: ['Bir kupa daha?', 'Hikâyeni anlat bakalım!'],
  },
};

const ROLE_DEFAULT: Record<NpcRole, NpcPreset> = {
  blacksmith: NPC_PRESETS.npc_demirci,
  merchant: NPC_PRESETS.npc_tuccar,
  alchemist: NPC_PRESETS.npc_simyaci,
  stash: NPC_PRESETS.npc_depocu,
  keystone: NPC_PRESETS.npc_anahtar_ustasi,
  trainer: NPC_PRESETS.npc_egitmen,
  bounty: NPC_PRESETS.npc_muhtar,
  lobby: { base: 'Knight', show: [], title: 'Buluşma', idle: 'Idle' },
  guard: { base: 'Knight', show: GUARD_SHOW, tint: 0x8090b0, title: 'Kale Muhafızı', idle: 'Blocking', greeting: 'Kapıdan çıkarsan kendi başınasın.', barks: ['Gözümüz üzerinde.', 'Huzur bozmayın!'] },
  citizen: { base: 'Rogue', show: [], title: 'Köylü', idle: 'Idle', barks: ['Zindanlardan haberler kötü...', 'Güzel bir akşam, değil mi?'] },
  portal: { base: 'Knight', show: [], idle: 'Idle' },
  // open-world roles (GDD_OPENWORLD §9.1): defaults only, no town NPC uses them yet
  quest: { base: 'Knight', show: [], title: 'Görev Veren', idle: 'Idle' },
  teleporter: { base: 'Mage', show: [], title: 'Yol Gösterici', idle: 'Idle' },
  stable: { base: 'Barbarian', show: [], title: 'Ahır Görevlisi', idle: 'Idle' },
  // GDD_V2 roles (WP1): defaults only, placed by WP7/WP8 (Kâtip, Set Ustası, Zanaat Tezgâhı); no town NPC uses them yet
  codex: { base: 'Mage', show: [], title: 'Kâtip', idle: 'Idle' },
  tierset: { base: 'Knight', show: [], title: 'Set Ustası', idle: 'Idle' },
  crafting: { base: 'Barbarian', show: [], title: 'Zanaat Ustası', idle: 'Idle' },
  // GDD_ITEMS_V2 §5.2.1 (IT-00): Emlakçı Rıza, the house agent (typing default only; no town NPC uses it yet)
  home: { base: 'Rogue', show: [], title: 'Emlakçı', idle: 'Idle' },
  // GDD_PVP_FINDER §4.4: PvP vendors (Savaş Ustası, Fetih Muhafızı) are placed in town data; this is the typing default
  pvp: { base: 'Knight', show: [], title: 'Savaş Ustası', idle: 'Idle' },
};

const VILLAGER_TINTS = [0xa08060, 0x6080a0, 0x80a060, 0xa06060];
const VILLAGER_BASES = ['Knight', 'Barbarian', 'Rogue', 'Mage'];
const VILLAGER_BARKS = ['Bu akşam meyhane dolu.', 'Kuzgunkale\'de huzur var.', 'Zindan mı? Ben burada kalırım.', 'Duydun mu, Kemik Mahzeni yine uyanmış.'];

/**
 * tintObject sets the material colour to the NPC tint and the texture is multiplied by it, so a dark tint (Kumarbaz 0x30203a,
 * Tüccar 0x406080, Simyacı 0x40a060) turned the KayKit textures into near-black silhouettes in the town. The tint is lifted
 * 40 % towards white before it is applied: the costume colour still reads, the figure stays visible.
 */
function liftNpcTint(hex: number): number {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.4).getHex();
}

/**
 * Clips that put a standing NPC on the ground: death and lie poses, the floor sit (hips about 0.08 m against 0.39 m standing
 * on the KayKit rigs, which reads as lying from the town camera) and the single-frame `_Pose` holds. An NPC never plays them.
 * Content may still name one (the tavern villager asks for Sit_Floor_Idle): the NPC then stands on its normal idle instead.
 */
const GROUND_CLIP = /^(Death|Lie_|Sit_Floor|T-Pose)|_Pose$/;

/**
 * View margin (m) of an NPC's sphere. It covers the head label and speech bubble (about 4 m above the feet) and the shadow
 * reach of the body under the town sun (about 6 m at 25 degrees), so an NPC is only hidden where nothing of it can be seen.
 */
export const NPC_VIEW_MARGIN = 7;

// Draw distance, ambient cap and the full / mid tiers of a town character: charLodPlan (WorldPerf.ts) and CharacterLod.ts.

const BASE_URL: Record<string, string> = {
  Knight: '/assets/models/characters/Knight.glb',
  Barbarian: '/assets/models/characters/Barbarian.glb',
  Mage: '/assets/models/characters/Mage.glb',
  Rogue: '/assets/models/characters/Rogue.glb',
  Rogue_Hooded: '/assets/models/characters/Rogue_Hooded.glb',
  King: '/assets/models/npcs/King.glb',
  Worker: '/assets/models/npcs/Worker.glb',
};

export function npcModelUrl(base: string): string {
  return BASE_URL[base] ?? (base.includes('/') || base.endsWith('.glb') ? base : BASE_URL.Knight);
}

/** Resolve the look/behaviour for a town NPC definition (content fields of the TownDef win over the built-in presets). */
export function resolvePreset(def: NpcDef): NpcPreset {
  const p: NpcPreset = { ...resolveBasePreset(def) };
  if (def.model && BASE_URL[def.model]) p.base = def.model;
  if (def.title) p.title = def.title;
  if (def.scale) p.scale = def.scale;
  if (def.tint !== undefined) p.tint = def.tint;
  if (def.show) p.show = def.show;
  if (def.idle) p.idle = def.idle;
  if (def.loop) p.periodic = { clip: def.loop.clip, every: def.loop.every, offset: def.loop.offset };
  if (def.lines?.length) {
    p.greeting = def.lines[0];
    p.barks = def.lines.length > 1 ? def.lines.slice(1) : def.lines;
  }
  if (def.patrol && def.patrol.path.length >= 2) p.patrol = { path: def.patrol.path, lap: Math.max(4, def.patrol.lap), phase: def.patrol.phase ?? 0 };
  if (def.shouts?.length) p.shouts = def.shouts;
  return p;
}

function resolveBasePreset(def: NpcDef): NpcPreset {
  const byId = NPC_PRESETS[def.id];
  if (byId) return byId;
  // numbered variants: npc_muhafiz_3 / npc_koylu_2 ...
  const m = /^(npc_[a-z]+)_(\d+)$/.exec(def.id);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === 'npc_muhafiz') {
      if (n <= 2) return { ...ROLE_DEFAULT.guard, idle: 'Blocking' };
      if (n <= 4) return { ...ROLE_DEFAULT.guard, show: ['2H_Sword', 'Knight_Helmet', 'Knight_Cape'], idle: '2H_Melee_Idle', greeting: 'Kadim Kapılar yalnızca cesurlara açılır.' };
      return { ...ROLE_DEFAULT.guard, title: 'Devriye', idle: 'Walking_A', patrol: circlePatrol(0, 8, 17, 30, (n - 5) * 0.5) };
    }
    if (m[1] === 'npc_koylu') {
      const rng = new RNG(hashString(def.id));
      return {
        base: rng.pick(VILLAGER_BASES), show: [], tint: rng.pick(VILLAGER_TINTS), title: 'Köylü',
        idle: rng.chance(0.15) ? 'Cheer' : 'Idle', barks: VILLAGER_BARKS,
      };
    }
  }
  const role = ROLE_DEFAULT[def.role] ?? ROLE_DEFAULT.citizen;
  // a content-supplied model string wins when there is no id preset
  const base = def.model && (BASE_URL[def.model] || def.model.includes('/')) ? def.model : role.base;
  if (def.role === 'citizen' && !m) {
    const rng = new RNG(hashString(def.id));
    return { ...role, base: def.model && BASE_URL[def.model] ? def.model : rng.pick(VILLAGER_BASES), tint: rng.pick(VILLAGER_TINTS), barks: VILLAGER_BARKS };
  }
  return { ...role, base };
}

/** Which panel an NPC opens, by role (and id hints). */
export function panelForNpc(def: NpcDef): { id: string; data?: unknown } | null {
  // quest givers (TownNpc.quests, or role 'quest') always open the quest dialog, even when their ui.panel names another panel
  // (Muhtar Cemal's bounty board stays a separate notice board next to him)
  if ((def.quests?.length ?? 0) > 0 || def.role === 'quest') return { id: 'dialog', data: { npcId: def.id, quests: def.quests ?? [] } };
  // content-supplied panel wins (TownNpc.ui); the weekly vault (Kadim Hazine) lives inside the M+ info panel
  if (def.ui?.panel) {
    const { panel, tab, kind } = def.ui;
    if (panel === 'keystone' && tab === 'vault') return { id: 'mplusInfo' };
    if (panel === 'dialog') return { id: 'dialog', data: { npcId: def.id, quests: def.quests ?? [] } };
    const data: Record<string, unknown> = {};
    if (tab) data.tab = tab;
    if (kind) data.kind = kind;
    if (def.dungeonId) data.dungeonId = def.dungeonId;
    return { id: panel, data: Object.keys(data).length ? data : undefined };
  }
  switch (def.role) {
    case 'blacksmith':
      return { id: 'blacksmith', data: /efsun/i.test(def.id) ? { tab: 'efsun' } : undefined };
    case 'merchant':
      // the two special vendors share the merchant role: Gizemli Tüccar = blind boxes (Vendor.gamble), Mühürdar = Av Mührü shop
      if (/gizemli|kumar|gamble/i.test(def.id)) return { id: 'vendor', data: { kind: 'gamble' } };
      if (/muhurdar|seal/i.test(def.id)) return { id: 'vendor', data: { kind: 'seal_vendor' } };
      return { id: 'vendor', data: { kind: 'merchant' } };
    case 'alchemist':
      return { id: 'vendor', data: { kind: 'alchemist' } };
    case 'stash':
      return { id: 'stash' };
    case 'keystone':
      return /tarhan|vault|hazine/i.test(def.id) ? { id: 'mplusInfo' } : { id: 'keystone' };
    case 'trainer':
      return { id: 'trainer' };
    case 'bounty':
      return { id: 'bounty' };
    case 'lobby':
      return { id: 'party' };
    case 'portal':
      return { id: 'finder', data: { dungeonId: def.dungeonId } };
    // open world (GDD_OPENWORLD §2.6): the fast-travel panel (quest givers returned above)
    case 'teleporter':
      return { id: 'waypoints', data: { npcId: def.id } };
    default:
      return null;
  }
}

const NAME_COLOR: Partial<Record<NpcRole, string>> = {
  blacksmith: '#ffb46a', merchant: '#ffe28a', alchemist: '#8affb0', stash: '#c9a878', keystone: '#d9a8ff', trainer: '#ff9a8a',
  bounty: '#ffd982', lobby: '#9fd0ff', guard: '#a8c4ff', citizen: '#e0d8c0',
};

/**
 * A town NPC: KayKit (or Quaternius) model with loadout/tint, idle + periodic clips, world label (name/title), proximity
 * barks in a speech bubble, and role-based interaction that opens the matching panel.
 * OWNER: scenes module.
 */
export class NPC extends Entity implements Interactable {
  readonly def: NpcDef;
  readonly preset: NpcPreset;
  interactRange = 3.8;
  name = '';
  anim: AnimController | null = null;
  private model: THREE.Object3D | null = null;
  private label: WorldLabelHandle | null = null;
  private questMark: WorldLabelHandle | null = null;
  private questMarkKind: NpcQuestMark | null = null;
  private questMarkSig = '';
  /** "▼ Buraya konuş" tag under the guide highlight (§4.3). */
  private guideTag: WorldLabelHandle | null = null;
  private markAcc = 0;
  private bubble: BubbleHandle | null = null;
  private bubbleTimer = 0;
  private baseYaw: number;
  private faceUntil = 0;
  private time = Math.random() * 5;
  private nextPeriodic: number;
  private barkCooldown = 8 + Math.random() * 10;
  private shoutIdx = 0;
  private nextShout = 0;
  private busyUntil = 0;
  private moving = false;
  private offs: (() => void)[] = [];
  private idleName = 'Idle';
  /** Precomputed patrol loop: points + cumulative lengths. */
  private route: { pts: [number, number][]; cum: number[]; total: number } | null = null;
  /** Frames still drawn after the model is attached, so its shaders compile at spawn (update). */
  private warmFrames = 3;
  /** Character LOD (CharacterLod.ts): the tier applied now, the distance / view / exemption of the last frame, the mixer's pending time. */
  private tier: CharTier = 'full';
  lodDist = Infinity;
  lodSeen = false;
  lodExempt = false;
  private lodAcc = 0;
  private castMeshes: THREE.Mesh[] = [];
  private blob: THREE.Object3D | null = null;
  /** KayKit rigs: the accessory nodes this NPC wears (null = no accessory toggling, the model is drawn as it is). */
  private accShow: string[] | null = null;
  /** The billboard stand-in (tier `billboard`), shown while the model is not. */
  private sprite: THREE.Sprite | null = null;
  /** Ambient routine (def.routine): the clock time the routine has been held (the NPC stands still while it talks to the player). */
  private routineHold = 0;
  /** Ambient routine: the walk clip of this NPC and the clip now set as its base (so the base is only changed on a switch). */
  private routineWalk = 'Walking_A';
  private routineShown = '';

  constructor(id: number, def: NpcDef) {
    super(id, 'npc');
    this.def = def;
    this.preset = resolvePreset(def);
    this.name = def.name;
    this.radius = 0.7;
    this.height = 2.4;
    this.baseYaw = ((def.rot ?? 0) * Math.PI) / 180;
    this.object3d.rotation.y = this.baseYaw;
    if (def.interactRange) this.interactRange = def.interactRange;
    const pr = this.preset.periodic;
    // content gives a phase offset so neighbours (smith + apprentice) never animate in lockstep
    this.nextPeriodic = this.time + (pr?.offset !== undefined ? pr.offset + 0.5 : 1 + Math.random() * (pr?.every ?? 5));
    // ambient shouts start 15-60 s in, so a town full of vendors does not call out in unison on the first frame
    this.nextShout = 15 + Math.random() * 45;
    const pat = this.preset.patrol;
    if (pat && pat.path.length >= 2) {
      const pts = pat.path;
      const cum: number[] = [0];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
      this.route = { pts, cum, total: Math.max(0.01, cum[cum.length - 1]) };
      this.time = 0; // start exactly at the first path point (= the placed position)
    }
  }

  get interactPrompt(): string {
    return `${this.def.name} ile konuş`;
  }

  async load(): Promise<void> {
    const p = this.preset;
    const url = npcModelUrl(p.base);
    await G.assets.load(url);
    const cartUrl = this.def.routine?.cart;
    if (cartUrl) await G.assets.load(cartUrl);
    const obj = G.assets.instantiate(url); // untinted NPCs draw the model's own materials: nothing here mutates them
    const kay = url.includes('/characters/');
    if (kay) setAccessories(obj, p.show ?? []);
    if (p.tint) tintObject(obj, liftNpcTint(p.tint));
    if (p.scale) obj.scale.setScalar(p.scale);
    if (cartUrl) {
      // a traveller's cart, pulled 2.6 m behind (it turns with the NPC; it has no collider of its own)
      const cart = G.assets.instantiate(cartUrl);
      cart.position.set(0, 0, -2.6);
      obj.add(cart);
    }
    this.castMeshes = [];
    obj.traverse((o) => {
      const mm = o as THREE.SkinnedMesh;
      if (mm.isMesh) {
        mm.castShadow = true;
        mm.receiveShadow = true;
        this.castMeshes.push(mm);
      }
      if (mm.isSkinnedMesh) mm.frustumCulled = false;
    });
    const shadow = G.vfx.blobShadow(0.8);
    if (shadow) obj.add(shadow);
    this.blob = shadow;
    this.accShow = kay ? (p.show ?? []) : null;
    this.model = obj;
    this.object3d.add(obj);
    const sc = p.scale ?? 1;
    const sprite = characterBillboard(p.tint ? liftNpcTint(p.tint) : 0xd9cbb0);
    sprite.scale.set(0.9 * sc, 2.4 * sc, 1);
    sprite.visible = false;
    this.object3d.add(sprite);
    this.sprite = sprite;
    this.anim = new AnimController(obj, G.assets.clips(url));
    // a content idle that puts the NPC on the ground (GROUND_CLIP) is replaced by the standing idle
    const wantIdle = p.idle && !GROUND_CLIP.test(p.idle) ? p.idle : undefined;
    this.idleName = this.anim.pick(wantIdle ?? 'Idle', 'Idle', 'Idle_Neutral', 'Unarmed_Idle') ?? 'Idle';
    this.anim.setBase(this.idleName, { fade: 0 });
    this.anim.mixer.setTime(Math.random() * 1.2);
    if (p.patrol) this.idleName = this.anim.pick('Walking_A', 'Walk', 'Run') ?? this.idleName;
    if (p.patrol) this.anim.setBase(this.idleName, { fade: 0 });
    if (this.def.routine) {
      const r = this.def.routine;
      const cands = r.walk ? [r.walk] : r.speed >= 3 ? ['Running_A', 'Run', 'Walking_A', 'Walk'] : ['Walking_A', 'Walk', 'Run'];
      this.routineWalk = this.anim.pick(...cands) ?? 'Walking_A';
    }
    this.makeLabel();
  }

  private makeLabel(): void {
    const col = NAME_COLOR[this.def.role] ?? '#f0e6cc';
    const title = this.preset.title && this.preset.title !== this.def.name ? `<div class="s">&lt;${this.preset.title}&gt;</div>` : '';
    try {
      this.label = G.ui.addWorldLabel(this.object3d, `<div class="efs-wl"><div class="n" style="color:${col}">${this.def.name}</div>${title}</div>`, {
        offsetY: this.height * (this.preset.scale ?? 1) + 0.55,
        className: 'efs-wl-wrap',
        maxDistance: 26,
      });
    } catch {
      this.label = null;
    }
  }

  onAdded(world: World): void {
    super.onAdded(world);
    this.offs.push(registerCharLod(this));
    // patrolling and routine NPCs walk through the nav (they never block it); a stationary town NPC blocks its own cell
    if (!this.preset.patrol && !this.def.routine) world.nav.setCircle(this.position.x, this.position.z, 0.65, false);
    if (this.def.role === 'blacksmith') {
      this.offs.push(
        G.events.on('item:upgraded', (e) => {
          if (!this.anim || this.def.id.includes('efsun')) return;
          if (e.success) this.playOnce(this.anim.pick('Cheer') ?? 'Cheer');
          else this.playOnce(this.anim.pick('Hit_B', 'Hit_A') ?? 'Hit_B');
        }),
      );
    }
  }

  private playOnce(clip: string, speed = 1, hold = 0): void {
    const a = this.anim;
    if (!a || !a.has(clip) || a.isPlayingOneShot || GROUND_CLIP.test(clip)) return;
    const dur = a.playOnce(clip, { speed, fade: 0.15, onDone: () => { this.routineShown = ''; a.setBase(this.idleName); } });
    this.busyUntil = this.time + dur + hold;
  }

  /** Ambient routine: sets the base clip (walk / dwell) when it changes. A one-shot in progress keeps the stage. */
  private setRoutineClip(name: string): void {
    const a = this.anim;
    if (!a || a.isPlayingOneShot || name === this.routineShown) return;
    const clip = a.has(name) && !GROUND_CLIP.test(name) ? name : this.idleName;
    this.routineShown = name;
    a.setBase(clip, { fade: 0.2 });
  }

  /** Applies a character tier to the model (visibility, shadow casting, attachments, blob shadow). Acts only on a change. */
  private applyTier(tier: CharTier): void {
    const m = this.model;
    if (!m || tier === this.tier) return;
    this.tier = tier;
    const full = tier === 'full';
    m.visible = tier === 'full' || tier === 'mid';
    for (const mesh of this.castMeshes) mesh.castShadow = full;
    if (this.blob) this.blob.visible = full;
    if (this.accShow) setAccessories(m, full ? this.accShow : []);
    if (this.sprite) this.sprite.visible = tier === 'billboard';
  }

  canInteract(): boolean {
    return !this.def.decor;
  }

  interact(player: Player): void {
    // turn toward the player and react
    this.faceUntil = this.time + 6;
    const need = this.def.unlockLevel ?? 0;
    if (need > 0 && (G.character?.level ?? 1) < need) {
      this.say(`Seviye ${need} olmadan seninle iş yapmam, evlat.`, 4.5);
      G.ui.toast(`${this.def.name}: Seviye ${need} gerekli.`, 'warning');
      G.audio.play('ui_error', { volume: 0.6 });
      return;
    }
    const a = this.anim;
    const clip = this.preset.interactClip ?? (a?.pick('Interact', 'Wave', 'Use_Item') ?? null);
    if (a && clip && !this.preset.patrol && this.def.role !== 'guard') this.playOnce(clip);
    this.say(this.preset.greeting ?? 'Merhaba, yolcu.', 5);
    G.audio.play('ui_open', { volume: 0.6 });
    const panel = panelForNpc(this.def);
    if (panel) {
      // a talk objective of the active quests counts when the dialog opens (systems/Quests.ts)
      if (panel.id === 'dialog') G.quests?.onEvent('talk', this.def.id);
      G.ui.openPanel(panel.id, panel.data);
      G.ui.bindNpcPanel(panel.id, this); // walking away from this NPC closes its talk window (WoW)
    }
    void player;
  }

  /**
   * Quest marker over the head (open world and town): '!' yellow = a quest is on offer, '?' gold = a quest is ready to turn in,
   * '!' grey = the next quest of this giver waits for the level. null hides it. Driven by scenes/world/QuestMarks.ts.
   */
  setQuestMark(kind: NpcQuestMark | null): void {
    // UX-21: the main-story (large) marker is also worn by the guide NPC while it is the HUD's guide target (§4.3)
    const main = kind !== null && G.ui?.hud?.guideTarget === this.def.id;
    const sig = kind ? `${kind}|${main ? 1 : 0}` : '';
    if (sig === this.questMarkSig) return;
    this.questMarkSig = sig;
    this.questMarkKind = kind;
    this.setGuideTag(main);
    if (!kind) {
      this.questMark?.setVisible(false);
      return;
    }
    const glyph = kind === 'turnin' ? '?' : '!';
    const cls = `qm qm--${kind}${main ? ' qm--main' : ''}`;
    const html = `<div class="${cls}"><i class="qm-glow"></i><b class="qm-glyph">${glyph}</b></div>`;
    try {
      if (this.questMark) {
        this.questMark.setText(html);
        this.questMark.setVisible(true);
      } else {
        this.questMark = G.ui.addWorldLabel(this.object3d, html, {
          offsetY: this.height * (this.preset.scale ?? 1) + 1.0,
          className: 'efs-wl-wrap',
          maxDistance: 40,
        });
      }
    } catch {
      this.questMark = null;
    }
  }

  /** Shows / hides the guide tag (§4.3). The label is created on first use only. */
  private setGuideTag(on: boolean): void {
    try {
      if (!this.guideTag) {
        if (!on) return;
        this.guideTag = G.ui.addWorldLabel(this.object3d, '<div class="guide-tag">▼ Buraya konuş</div>', {
          offsetY: this.height * (this.preset.scale ?? 1) + 2.3,
          className: 'efs-wl-wrap',
          maxDistance: 60,
        });
      }
      this.guideTag.setVisible(on);
    } catch {
      this.guideTag = null;
    }
  }

  /**
   * Speech bubble above the head (UX-30 §5.2): the flat npc bubble with the gold name line, 120 characters, lifetime `seconds`.
   * Shares the BubbleLayer stacking and budget with the player bubbles (the old .efs-bark DOM is gone).
   */
  say(text: string, seconds = 4.5, kind: 'npc' | 'say' = 'npc'): void {
    this.bubble?.remove();
    try {
      this.bubble = G.ui.say(this.object3d, {
        kind,
        text,
        name: this.def.name,
        color: 'var(--gold-1)',
        seconds,
        offsetY: this.height * (this.preset.scale ?? 1) + 1.35,
      });
      this.bubbleTimer = seconds;
    } catch {
      this.bubble = null;
    }
  }

  update(dt: number): void {
    this.time += dt;
    // the guide highlight (§4.3) can change without a quest event: re-check the marker twice a second (no-op when unchanged)
    if (this.questMarkKind) {
      this.markAcc += dt;
      if (this.markAcc >= 0.5) {
        this.markAcc = 0;
        this.setQuestMark(this.questMarkKind);
      }
    }
    const t = this.time;
    const player = G.player;
    const a = this.anim;
    const p = this.preset;

    // patrol along the closed loop (constant speed)
    if (p.patrol && this.route && this.world) {
      const r = this.route;
      const s = (((t / p.patrol.lap + p.patrol.phase) % 1) + 1) % 1 * r.total;
      let i = 0;
      while (i < r.pts.length - 1 && r.cum[i + 1] < s) i++;
      const a = r.pts[i], b = r.pts[(i + 1) % r.pts.length];
      const seg = Math.max(0.0001, r.cum[i + 1] - r.cum[i]);
      const k = Math.min(1, Math.max(0, (s - r.cum[i]) / seg));
      const nx = a[0] + (b[0] - a[0]) * k, nz = a[1] + (b[1] - a[1]) * k;
      const dx = b[0] - a[0], dz = b[1] - a[1];
      if (dx * dx + dz * dz > 1e-6) this.baseYaw = Math.atan2(dx, dz);
      this.position.set(nx, this.world.groundY(nx, nz), nz);
    }

    // ambient routine (types/ambient.ts): where the walk is now, and walk or dwell clip. While the NPC talks to the player the clock holds:
    // it stands still on its idle (or its stop clip) and turns to the player below
    if (this.def.routine && this.world) {
      const talking = t < this.faceUntil;
      if (talking) this.routineHold += dt;
      const s = sampleRoute(this.def.routine, this.world.time - this.routineHold);
      this.position.set(s.x, this.world.groundY(s.x, s.z), s.z);
      const walking = s.moving && !talking;
      if (walking) this.baseYaw = s.yaw;
      this.setRoutineClip(walking ? this.routineWalk : s.clip ?? this.idleName);
    }

    // facing: the player while talking, else the placed direction
    let want = this.baseYaw;
    if (t < this.faceUntil && player) want = Math.atan2(player.position.x - this.position.x, player.position.z - this.position.z);
    this.object3d.rotation.y = dampAngle(this.object3d.rotation.y, want, 8, dt);

    // character LOD (CharacterLod.ts): distance, view and the ambient cap pick the tier. A hidden character is not drawn and its mixer
    // pauses until it comes back (the state machine below still runs)
    let tier: CharTier = 'full';
    // ambient walkers (routine) stand as billboards early: their models are the costly part of the ambient layer
    const plan: CharLodPlan = this.def.routine ? ambientLodPlan(charLodPlan(getGfxQuality())) : charLodPlan(getGfxQuality());
    if (this.model) {
      const near = player ? dist2D(player.position, this.position) : 0;
      const s = p.scale ?? 1;
      this.lodDist = near;
      this.lodExempt = near < this.interactRange + this.radius; // the NPC the player can talk to: never culled
      if (this.warmFrames > 0) {
        this.warmFrames--;
        this.lodSeen = true;
      } else {
        this.lodSeen = near < plan.hide && inView(this.position.x, this.position.y + 1.3 * s, this.position.z, 2.6 * s + NPC_VIEW_MARGIN);
      }
      tier = tierFor(near, this.lodSeen, this.lodExempt, this.lodSeen ? nearerCount(this) : 0, plan);
      this.applyTier(tier);
    }
    const seen = tier !== 'hidden';
    if (a) {
      a.paused = tier === 'billboard' || tier === 'hidden';
      // the mid tier steps the mixer at plan.mixerHz; a one-shot runs every frame so its events and onDone stay on time
      this.lodAcc += dt;
      if (tier !== 'mid' || a.isPlayingOneShot || this.lodAcc >= 1 / plan.mixerHz) {
        a.update(this.lodAcc);
        this.lodAcc = 0;
      }
      if (!p.patrol && !a.isPlayingOneShot && t > this.nextPeriodic && p.periodic && t > this.busyUntil && t >= this.faceUntil) {
        this.playOnce(p.periodic.clip, p.periodic.speed ?? 1);
        this.nextPeriodic = t + p.periodic.every * (0.8 + Math.random() * 0.4);
      }
    }

    // barks when the local player walks by
    this.barkCooldown -= dt;
    if (this.bubbleTimer > 0) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubble?.remove();
        this.bubble = null;
      }
    }
    // ambient shouts: a vendor calls its wares into a /say bubble every 60-120 s, only while it is on screen (else it waits 5 s)
    if (p.shouts?.length && t >= this.nextShout && !this.bubble && t >= this.faceUntil) {
      if (seen) {
        this.say(p.shouts[this.shoutIdx++ % p.shouts.length], 4.8, 'say');
        this.nextShout = t + 60 + Math.random() * 60;
      } else this.nextShout = t + 5;
    }
    // karakter sözleri (systems/Barks.ts): own lines first, else the role's greeting; the setting can silence them
    if (player && this.barkCooldown <= 0 && !this.bubble) {
      const d = dist2D(player.position, this.position);
      const line = d < 8 ? G.barks?.npcLine(this.def.id, this.def.role, p.barks ?? []) : null;
      if (line) {
        this.barkCooldown = 28 + Math.random() * 20;
        this.say(line, 4.2);
        G.barks?.rumor(this.def.name, line);
      }
    }
    void this.moving;
  }

  onRemoved(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.label?.remove();
    this.questMark?.remove();
    this.questMark = null;
    this.bubble?.remove();
    this.anim?.dispose();
    super.onRemoved();
  }
}
