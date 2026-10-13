import * as THREE from 'three';
import type { EntityId, EntityKind } from '../types/common';
import type { World } from '../world/World';

/**
 * Base of everything that lives in a World. Position/rotation live on `object3d`
 * (yaw = rotation around +Y; models face +Z when yaw = 0).
 */
export abstract class Entity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly object3d: THREE.Group = new THREE.Group();
  /** Collision / selection radius on the XZ plane. */
  radius = 0.5;
  /** Height used for health bars, damage numbers and projectile aim. */
  height = 2;
  /** False once dead/destroyed; `removed` entities are dropped by the World at end of frame. */
  alive = true;
  removed = false;
  world: World | null = null;
  /** True when this peer simulates the entity (host for enemies, owner for players). */
  authority = true;

  constructor(id: EntityId, kind: EntityKind) {
    this.id = id;
    this.kind = kind;
    this.object3d.userData.entityId = id;
  }

  get position(): THREE.Vector3 {
    return this.object3d.position;
  }

  get yaw(): number {
    return this.object3d.rotation.y;
  }
  set yaw(v: number) {
    this.object3d.rotation.y = v;
  }

  /** World-space point at a fraction of the entity height (0 = feet, 1 = top). */
  pointAt(heightFrac: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.object3d.position).setY(this.object3d.position.y + this.height * heightFrac);
  }

  /** Called by World.add(). */
  onAdded(world: World): void {
    this.world = world;
    world.scene.add(this.object3d);
  }

  /** Called by World when removed. Free GPU resources owned exclusively by this entity here. */
  onRemoved(): void {
    this.object3d.removeFromParent();
    this.world = null;
  }

  /** Mark for removal at end of frame. */
  destroy(): void {
    this.removed = true;
  }

  abstract update(dt: number): void;
}
