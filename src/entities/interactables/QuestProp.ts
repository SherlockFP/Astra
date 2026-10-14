import * as THREE from 'three';
import { InteractableProp } from './InteractableProp';
import type { Player } from '../Player';
import { G } from '../../game/G';
import { RNG } from '../../core/utils';
import { getMaterial } from '../../data/materials';
import { toast } from '../../systems/notify';

/**
 * Quest props (WoW-style "interact with N objects" and "use an item at a location"), placed by scenes/world/WorldQuestProps.ts.
 * - interact (qo_*): F on a sack, crystal or banner counts one `interact` objective (QuestSystem.onEvent). Each prop is empty for
 *   RESPAWN_SEC after a use; the empty timer is per character (save flag `qprop.<key>`), so party members do not share it.
 *   Only counts while an active quest still wants the target (QuestSystem.wants).
 * - use (qt_*): an altar. F with the quest item in the bag runs QuestSystem.useItem (one item per use).
 * Voxel models built in code (no asset), like GatherNode. OWNER: scenes module.
 */

export type QuestPropKind = 'sack' | 'crystal' | 'banner' | 'altar';

/** Objective target -> prop kind: qo_sack / qo_crystal / qo_banner (interact) and qt_* (use location). Null = not a prop. */
export function questPropKind(target: string): QuestPropKind | null {
  if (target === 'qo_sack') return 'sack';
  if (target === 'qo_crystal') return 'crystal';
  if (target === 'qo_banner') return 'banner';
  if (target.startsWith('qt_')) return 'altar';
  return null;
}

export const QUEST_PROP_LABEL: Record<QuestPropKind, string> = { sack: 'Çuval', crystal: 'Kristal', banner: 'Sancak', altar: 'Kutsama Taşı' };
/** Seconds an interact prop stays empty after one use (per character). */
export const QUEST_PROP_RESPAWN_SEC = 60;

const CUBE = new THREE.BoxGeometry(1, 1, 1);

export interface QuestPropOpts {
  /** Stable key (region, target and index): the save key of the empty timer. */
  key: string;
  target: string;
  kind: QuestPropKind;
  /** altar: the quest item used on it (data/materials.ts id). */
  item?: string;
}

export class QuestProp extends InteractableProp {
  readonly key: string;
  readonly target: string;
  readonly propKind: QuestPropKind;
  readonly item: string | undefined;
  /** Epoch ms when the prop is back (0 = available). */
  private emptyUntil = 0;

  constructor(id: number, o: QuestPropOpts) {
    super(id);
    this.key = o.key;
    this.target = o.target;
    this.propKind = o.kind;
    this.item = o.item;
    this.interactRange = 2.8;
    this.radius = 0.5;
    this.height = 1.2;
  }

  /** Only a prop an active quest still wants is interactable (PlayerController skips the others). */
  canInteract(_p: Player): boolean {
    return !!G.quests?.wants(this.propKind === 'altar' ? 'use' : 'interact', this.target);
  }

  get interactPrompt(): string {
    const label = QUEST_PROP_LABEL[this.propKind];
    if (this.propKind === 'altar') {
      const name = this.item ? getMaterial(this.item)?.name ?? this.item : 'eşya';
      return G.character?.material(this.item ?? '') ? `${label} – ${name} kullan [F]` : `${label} – ${name} gerekli`;
    }
    if (!G.quests?.wants('interact', this.target)) return `${label} – görevle ilgisi yok`;
    return this.isEmpty() ? `${label} – boş` : `${label} – incele [F]`;
  }

  async load(): Promise<void> {
    const root = this.buildModel();
    this.object3d.add(root);
    this.model = root;
    const saved = Number(G.character?.save.flags[this.flag()] ?? 0);
    this.emptyUntil = saved > Date.now() ? saved : 0;
    this.applyScale();
  }

  interact(_p: Player): void {
    if (this.propKind === 'altar') {
      if (!this.item || !G.quests?.useItem(this.item, this.target)) {
        toast('Burada kullanılacak bir eşya yok.', 'info');
        return;
      }
      toast(`${QUEST_PROP_LABEL.altar}: eşya kullanıldı.`, 'success');
      return;
    }
    if (!G.quests?.wants('interact', this.target)) {
      toast('Bu nesnenin bir görevle ilgisi yok.', 'info');
      return;
    }
    if (this.isEmpty()) {
      toast(`${QUEST_PROP_LABEL[this.propKind]} boş. Biraz sonra tekrar bak.`, 'info');
      return;
    }
    this.emptyUntil = Date.now() + QUEST_PROP_RESPAWN_SEC * 1000;
    const ch = G.character;
    if (ch) {
      ch.save.flags[this.flag()] = this.emptyUntil;
      ch.persist();
    }
    this.applyScale();
    G.quests.onEvent('interact', this.target);
  }

  update(dt: number): void {
    super.update(dt);
    if (this.emptyUntil > 0 && Date.now() >= this.emptyUntil) {
      this.emptyUntil = 0;
      this.applyScale();
    }
  }

  private flag(): string {
    return `qprop.${this.key}`;
  }

  private isEmpty(): boolean {
    return this.emptyUntil > Date.now();
  }

  private applyScale(): void {
    if (this.model) this.model.scale.setScalar(this.propKind === 'altar' ? 1 : this.isEmpty() ? 0.6 : 1);
  }

  /** Voxel model per kind. Deterministic per key. */
  private buildModel(): THREE.Group {
    const g = new THREE.Group();
    const rng = new RNG(`${this.key}:qprop`);
    const block = (color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, emissive = 0): THREE.Mesh => {
      const m = new THREE.Mesh(CUBE, new THREE.MeshLambertMaterial({ color, emissive }));
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = true;
      g.add(m);
      return m;
    };
    if (this.propKind === 'sack') {
      for (let i = 0; i < 4; i++) block(0x8a6a3a, (rng.next() - 0.5) * 0.5, 0.2 + rng.next() * 0.1, (rng.next() - 0.5) * 0.5, 0.42, 0.36, 0.4, rng.next() * 3);
      block(0x6a4e28, 0, 0.5, 0, 0.18, 0.12, 0.18);
    } else if (this.propKind === 'crystal') {
      for (let i = 0; i < 4; i++) block(0x9a6ad8, (rng.next() - 0.5) * 0.4, 0.35 + rng.next() * 0.25, (rng.next() - 0.5) * 0.4, 0.16, 0.7 + rng.next() * 0.3, 0.16, rng.next() * 3, 0x3a1a60);
    } else if (this.propKind === 'banner') {
      block(0x5a4a3a, 0, 0.85, 0, 0.1, 1.7, 0.1);
      block(0xb83a2a, 0.22, 1.35, 0, 0.44, 0.5, 0.04);
    } else {
      block(0x7a7e86, 0, 0.3, 0, 1.2, 0.6, 1.2);
      block(0x9ad8ff, 0, 0.66, 0, 0.6, 0.06, 0.6, 0, 0x2a5a80);
    }
    return g;
  }
}
