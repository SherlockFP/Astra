import * as THREE from 'three';
import { G } from '../game/G';
import type { World } from '../world/World';
import { TrainingDummy } from '../entities/interactables';
import { TEST_AREA, TEST_DUMMIES } from '../data/betaTest';

/**
 * Beta test corner of the town (systems/BetaTest.ts): a fenced "Test Alanı" with a single-target dummy (DPS readout), an AoE pack
 * of five dummies and a tank dummy that hits back, plus a sign. The guide NPC (Beta Rehberi) is an ordinary town NPC (data/betaTest.ts).
 * Spawned by TownScene only for beta characters. The fence is decor: the dummies and the guide keep their own collision.
 * OWNER: scenes module.
 */

const WOOD = 0x6b4a2b;
/** Distance between two fence posts (m). */
const POST_EVERY = 3;
/** Half width of the entrance gap in the south fence (m). */
const GATE_HALF = 2.2;

/** Fence rectangle around the area: posts every few metres, two rails per side, a gap in the middle of the south side. */
function buildFence(parent: THREE.Object3D, groundY: (x: number, z: number) => number): void {
  const { cx, cz, halfW, halfD } = TEST_AREA;
  const mat = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.9 });
  const group = new THREE.Group();
  const corners: [number, number][] = [[cx - halfW, cz - halfD], [cx + halfW, cz - halfD], [cx + halfW, cz + halfD], [cx - halfW, cz + halfD]];
  const sides: [[number, number], [number, number]][] = [
    [corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]],
  ];
  const SOUTH = 2; // sides[2] runs along the south edge (z = cz + halfD), its gate is in the middle
  sides.forEach(([a, b], si) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    // posts
    const n = Math.max(1, Math.round(len / POST_EVERY));
    for (let i = 0; i <= n; i++) {
      const x = a[0] + (b[0] - a[0]) * (i / n), z = a[1] + (b[1] - a[1]) * (i / n);
      if (si === SOUTH && Math.abs(x - cx) < GATE_HALF) continue;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 6), mat);
      post.position.set(x, groundY(x, z) + 0.65, z);
      post.castShadow = true;
      group.add(post);
    }
    // rails: one run per side, the south side split around the gate
    const runs: [number, number][] = si === SOUTH ? [[0, len / 2 - GATE_HALF], [len / 2 + GATE_HALF, len]] : [[0, len]];
    for (const [s0, s1] of runs) {
      for (const h of [0.45, 0.95]) {
        const L = s1 - s0;
        const mx = a[0] + dx * (s0 + s1) / 2, mz = a[1] + dz * (s0 + s1) / 2;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.07, 0.07), mat);
        rail.position.set(mx, groundY(mx, mz) + h, mz);
        rail.rotation.y = -Math.atan2(dz, dx);
        group.add(rail);
      }
    }
  });
  parent.add(group);
  // sign at the gate
  try {
    const sign = new THREE.Object3D();
    sign.position.set(cx, groundY(cx, cz + halfD) + 2.1, cz + halfD + 0.4);
    parent.add(sign);
    G.ui.addWorldLabel(sign, '<div class="efs-wl"><div class="n" style="color:#ffd27a">TEST ALANI</div><div class="s">Beta karakterlere özel</div></div>', { offsetY: 0, className: 'efs-wl-wrap', maxDistance: 40 });
  } catch {
    /* labels are optional */
  }
}

/** Spawns the fence, the three dummy setups and the sign. Resolves when every dummy model is in the world. Returns the dummy count. */
export async function spawnBetaArea(world: World, parent: THREE.Object3D): Promise<number> {
  buildFence(parent, (x, z) => world.groundY(x, z));
  const jobs: Promise<void>[] = [];
  let count = 0;
  const place = (x: number, z: number, kind: 'normal' | 'small' | 'tank'): void => {
    const d = new TrainingDummy(world.allocLocalId(), kind);
    d.position.set(x, world.groundY(x, z), z);
    count++;
    jobs.push(
      d.loadModel().then(
        () => {
          world.add(d);
        },
        (err) => console.warn('[beta] dummy failed to load', err),
      ),
    );
  };
  place(TEST_DUMMIES.single.x, TEST_DUMMIES.single.z, TEST_DUMMIES.single.kind);
  const { x: px, z: pz, count: n, ring } = TEST_DUMMIES.pack;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    place(px + Math.cos(a) * ring, pz + Math.sin(a) * ring, 'small');
  }
  place(TEST_DUMMIES.tank.x, TEST_DUMMIES.tank.z, TEST_DUMMIES.tank.kind);
  await Promise.all(jobs);
  return count;
}
