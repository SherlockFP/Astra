import { G } from '../game/G';
import type { PlayerController } from '../game/PlayerController';
import type { Player } from '../entities/Player';

/**
 * "Ruhunu Serbest Bırak": teleport the (dead) local player to `x,z`, revive with 50% HP (WoW corpse-run revive) and grant 2 s of invulnerability.
 * Shared by TownScene and DungeonScene.
 */
export function releaseLocalPlayer(controller: PlayerController | null, player: Player | null, x: number, z: number, yaw: number): void {
  if (!player || !player.isLocal) return;
  if (controller) controller.teleport(x, z, yaw);
  else {
    player.position.set(x, player.world?.groundY(x, z) ?? 0, z);
    player.yaw = yaw;
    G.camera?.snap();
  }
  G.combat.reviveLocalPlayer(0.5);
  player.statuses.apply('invulnerable', 2, { sourceId: null });
  G.ui.closePanel('death');
  G.audio.play('buff');
}
