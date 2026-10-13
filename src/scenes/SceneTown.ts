import type * as THREE from 'three';
import type { BuiltTown } from '../world/TownBuilder';

/**
 * What TownScene needs from a town build: the world module's BuiltTown (optional additions may be missing in older builds)
 * or our own FallbackTown.
 */
export type SceneTown = Pick<BuiltTown, 'root' | 'nav' | 'spawn' | 'spawnYaw' | 'update' | 'dispose'> &
  Partial<Pick<BuiltTown, 'lightsActive' | 'arrival' | 'arrivalYaw' | 'anchors' | 'groundY' | 'pois'>> & {
    sunFollow?(p: THREE.Vector3): void;
  };
