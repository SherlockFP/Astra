"""clipmap.py - curated UAL clip names for the Bestiary monsters (plain data, no bpy: also imported by make_doc.py).

(final clip name, source UAL clip, loop?, note)
A source of 'LayToIdle!' means the clip is time-reversed (derived clip).
Not present in UAL 1/2 (nothing was invented): Kick, Roar, Strafe_L/Strafe_R, Hit_Back.
"""

CURATED = [
    # idles / locomotion (loops)
    ('Idle',            'Idle_Loop',               True,  'neutral breathing idle'),
    ('Idle_Combat',     'Sword_Idle',              True,  'guard stance with a weapon, use while aggroed'),
    ('Idle_Zombie',     'Zombie_Idle_Loop',        True,  'hunched, swaying idle (undead / brutish look)'),
    ('Walk',            'Walk_Loop',               True,  'normal walk'),
    ('Walk_Zombie',     'Zombie_Walk_Fwd_Loop',    True,  'shambling walk, arms forward'),
    ('Run',             'Jog_Fwd_Loop',            True,  'jog'),
    ('Sprint',          'Sprint_Loop',             True,  'full sprint'),
    ('Crouch_Idle',     'Crouch_Idle_Loop',        True,  'ambush / sneak idle'),
    ('Crouch_Walk',     'Crouch_Fwd_Loop',         True,  'sneak walk'),
    # melee
    ('Attack_1H_1',     'Sword_Regular_A',         False, 'fast one-hand slash 1 (0.43 s)'),
    ('Attack_1H_2',     'Sword_Regular_B',         False, 'one-hand slash 2 (0.53 s)'),
    ('Attack_1H_3',     'Sword_Regular_C',         False, 'one-hand slash 3 / finisher (2.0 s with recovery)'),
    ('Attack_1H_Combo', 'Sword_Regular_Combo',     False, 'three-hit one-hand combo in one clip'),
    ('Attack_2H',       'Sword_Attack',            False, 'single heavy swing (1.5 s)'),
    ('Attack_2H_Combo', 'Sword_Heavy_Combo',       False, 'heavy multi-swing combo (4.3 s)'),
    ('Punch',           'Punch_Jab',               False, 'jab'),
    ('Punch_2',         'Punch_Cross',             False, 'cross'),
    ('Punch_Hook',      'Melee_Hook',              False, 'hook punch'),
    ('Shield_Bash',     'Shield_OneShot',          False, 'shield / forearm bash'),
    ('Charge',          'Shield_Dash',             False, 'shoulder-down rush (move the body forward in code)'),
    ('Dash',            'Sword_Dash',              False, 'lunging dash attack'),
    # magic / ranged
    ('Cast_Start',      'Spell_Simple_Enter',      False, 'raise hands'),
    ('Cast_Loop',       'Spell_Simple_Idle_Loop',  True,  'channel loop'),
    ('Spellcast',       'Spell_Simple_Shoot',      False, 'release a spell (0.53 s)'),
    ('Cast_End',        'Spell_Simple_Exit',       False, 'lower hands'),
    ('Throw',           'OverhandThrow',           False, 'overhand throw (spear, rock, bomb)'),
    # reactions
    ('Hit_Front',       'Hit_Chest',               False, 'flinch from a hit to the chest'),
    ('Hit_Head',        'Hit_Head',                False, 'head snap'),
    ('Hit_Knockback',   'Hit_Knockback',           False, 'knocked backwards'),
    ('Stagger',         'Idle_Shield_Break',       False, 'staggered / guard broken'),
    ('Death_A',         'Death01',                 False, 'falls dead, holds the last pose (play once, clamp)'),
    ('Death_B',         'LayToIdle!',              False, 'derived: LayToIdle reversed, sinks down and lies on the floor'),
    ('Taunt',           'Idle_Rail_Call',          False, 'calling / shouting gesture (best match for roar / taunt)'),
    ('Block',           'Sword_Block',             False, 'raise guard and take the hit'),
    ('Block_Idle',      'Idle_Shield_Loop',        True,  'shield guard loop'),
    ('Dodge',           'Roll',                    False, 'forward roll (move the body in code)'),
    ('GetUp',           'LayToIdle',               False, 'rise from the floor (also use as spawn / wake-up)'),
]

LOOPS = {c[0] for c in CURATED if c[2]}
