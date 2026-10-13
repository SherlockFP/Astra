/**
 * Nekromant minions (GDD_CLASSES_V2 §1.5 framework, NC24 slot). Rows are the Ordu Efendisi (necromancer_summoner) ghouls of
 * docs/kits/plate-melee.md §9b (PM-NE supersedes the NC24 skeleton list). Kit values are used as written; where the kit leaves
 * a number open it is marked below. Anims are the Skeleton_Minion rig clips (GDD §5.6 defaults).
 * PM-NE: `necro_ghoul` is auto-summoned by Ordu Efendisi (specials trait_summoner.pet, Minions.ensurePets) and carries a `taunt`
 * attack (NC42: MinionAI fires it when 2+ enemies in its radius are busy with someone else). Registered by data/minions.ts.
 */
import type { MinionDef } from '../../types/minions';

const SKEL_ANIMS = { idle: 'Idle_Combat', walk: 'Walking_A', run: 'Running_A', hit: 'Hit_A', death: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons' };
const GHOUL_TINT = 0x9fe08a;
const MINION_MODEL = '/assets/models/enemies/Skeleton_Minion.glb';

export const NECRO_MINIONS: MinionDef[] = [
  {
    // permanent pet, group pet cap 1, free respawn 10 s after death / 2 s after a scene change
    id: 'necro_ghoul', name: 'Kemik Ghul', ownerClass: 'necromancer', role: 'melee', group: 'pet',
    model: MINION_MODEL, scale: 0.95, tint: GHOUL_TINT,
    anims: SKEL_ANIMS, radius: 0.5, height: 2.0, speed: 6.0,
    hpFrac: 0.8, armorFrac: 0.3,
    attacks: [
      // claw every 1.8 s, 0.40 shadow, r 2.6 (kit §9b). Dark Transformation (x2, cleave) is a status read later, not modelled here.
      { id: 'necro_ghoul_claw', name: 'Pençe', kind: 'melee', range: 2.6, cooldown: 1.8, hitTime: 0.45, anim: '1H_Melee_Attack_Chop', animSpeed: 1.3, coef: 0.40, type: 'shadow' },
      // Kışkırtma (PM-NE, not in the kit table): pulls the enemies within 7 m that are busy with someone else for 3 s (bosses 2 s). Coef 0: no damage.
      { id: 'necro_ghoul_taunt', name: 'Kışkırtma', kind: 'taunt', range: 7, radius: 7, cooldown: 10, hitTime: 0.3, anim: 'Taunt', animSpeed: 1.2, coef: 0, type: 'shadow', params: { tauntSec: 3, minTargets: 2 } },
    ],
    aggro: 10, follow: [2, 4.5], leash: 28,
    respawn: { dead: 10, scene: 2 },
  },
  {
    // summoned by each vile_contagion stack spent (Ölüm Kırbacı), timed 8 s, group lesser cap 3
    id: 'necro_lesser_ghoul', name: 'Küçük Ghul', ownerClass: 'necromancer', role: 'melee', group: 'lesser',
    model: MINION_MODEL, scale: 0.8, tint: 0x7fc070,
    anims: SKEL_ANIMS, radius: 0.4, height: 1.6, speed: 6.0,
    hpFrac: 0.15, armorFrac: 0.1,   // armour not in the kit: 0.10 (the rabble value)
    // "3 swings coef 0.16" over 8 s: one swing every 2.4 s, so the life holds three of them (interpretation, see the kit)
    attacks: [
      { id: 'necro_lesser_ghoul_claw', name: 'Pençe', kind: 'melee', range: 2.4, cooldown: 2.4, hitTime: 0.45, anim: '1H_Melee_Attack_Chop', animSpeed: 1.3, coef: 0.16, type: 'shadow' },
    ],
    aggro: 10, follow: [2, 4.5], leash: 28,
    life: 8,
  },
  {
    // Ölüler Ordusu (m90): 8 per cast, timed 30 s, group army (uncapped)
    id: 'necro_army_ghoul', name: 'Ordu Ghulü', ownerClass: 'necromancer', role: 'melee', group: 'army',
    model: MINION_MODEL, scale: 0.9, tint: GHOUL_TINT,
    anims: SKEL_ANIMS, radius: 0.5, height: 1.9, speed: 6.8,
    hpFrac: 0.2, armorFrac: 0.1,   // armour not in the kit: 0.10 (the rabble value)
    attacks: [
      { id: 'necro_army_ghoul_claw', name: 'Pençe', kind: 'melee', range: 2.6, cooldown: 1.8, hitTime: 0.45, anim: '1H_Melee_Attack_Chop', animSpeed: 1.3, coef: 0.13, type: 'shadow' },
    ],
    aggro: 10, follow: [2, 4.5], leash: 28,
    life: 30,
  },
];
