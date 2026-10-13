import type { BossScript } from './types';
import { KEMIK_SCRIPTS, KEMIK_SPAWNS } from './kemik';
import { DOKUMHANE_SCRIPTS, DOKUMHANE_SPAWNS } from './dokumhane';
import { BUZUL_SCRIPTS, BUZUL_SPAWNS } from './buzul';
import { GOLGE_SCRIPTS, GOLGE_SPAWNS } from './golge';
import { WORLD_SCRIPTS, WORLD_SPAWNS } from './world';
import { TASKASA_SCRIPTS, TASKASA_SPAWNS } from './taskasa';
import { PERI_SCRIPTS, PERI_SPAWNS } from './peri_sisleri';
import { YILDIZ_SCRIPTS, YILDIZ_SPAWNS } from './yildiz_divani';
import { YIGITLER_SARAYI_SCRIPTS, YIGITLER_SARAYI_SPAWNS } from './yigitler_sarayi';
import { LES_SCRIPTS, LES_SPAWNS } from './les_uyanisi';

/** Boss id -> script (one file per dungeon). */
export const BOSS_SCRIPTS: Record<string, BossScript> = {
  ...KEMIK_SCRIPTS,
  ...DOKUMHANE_SCRIPTS,
  ...BUZUL_SCRIPTS,
  ...GOLGE_SCRIPTS,
  ...WORLD_SCRIPTS,
  ...TASKASA_SCRIPTS,
  ...PERI_SCRIPTS,
  ...YILDIZ_SCRIPTS,
  ...YIGITLER_SARAYI_SCRIPTS,
  ...LES_SCRIPTS,
};

/** Extra enemy ids each boss spawns (asset preloading). */
export const BOSS_SPAWNS: Record<string, string[]> = {
  ...KEMIK_SPAWNS,
  ...DOKUMHANE_SPAWNS,
  ...BUZUL_SPAWNS,
  ...GOLGE_SPAWNS,
  ...WORLD_SPAWNS,
  ...TASKASA_SPAWNS,
  ...PERI_SPAWNS,
  ...YILDIZ_SPAWNS,
  ...YIGITLER_SARAYI_SPAWNS,
  ...LES_SPAWNS,
};
