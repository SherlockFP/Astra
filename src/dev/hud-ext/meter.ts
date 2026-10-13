/**
 * UX-12 dev hook for the damage meter (dev only). `fillMeterDev()` puts five fake party members of five classes into the
 * meter (DPS 226,9K … 50,5K, HPS 189,0K … 5,0K) and gives one of them a death. Wire it from dev/hud.ts (a key or
 * `window.dev`); nothing in the game calls it. The numbers are fed through the normal G.events intake.
 * OWNER: hud module.
 */
import { G } from '../../game/G';
import { PARTY_ID_BASE, type ClassId, type EntityId } from '../../types/common';
import { meterDevRoster } from '../../ui/hud/DamageMeter';

const FAKE: { name: string; classId: ClassId; dps: number; hps: number }[] = [
  { name: 'Ahmet', classId: 'knight', dps: 226900, hps: 189000 },
  { name: 'Kurt', classId: 'mage', dps: 217200, hps: 147300 },
  { name: 'Selin', classId: 'rogue', dps: 196300, hps: 15200 },
  { name: 'Emre', classId: 'archer', dps: 138700, hps: 10100 },
  { name: 'Zeynep', classId: 'monk', dps: 50500, hps: 5000 },
];

/** Fills the meter with the fake fight. All damage lands in one frame, so every per-second value equals its total. */
export function fillMeterDev(): void {
  meterDevRoster.clear();
  FAKE.forEach((f, i) => {
    const id = (PARTY_ID_BASE + 1 + i) as EntityId;
    meterDevRoster.set(id, { id, name: f.name, classId: f.classId, spec: null });
    // a target outside the party range stands for an enemy
    G.events.emit('damage', { targetId: 9000 + i, sourceId: id, amount: f.dps, crit: false, type: 'physical', kind: 'normal', pos: [0, 0, 0] });
    G.events.emit('heal', { targetId: id, sourceId: id, amount: f.hps, pos: [0, 0, 0] });
  });
  // after one repaint, so the death row already knows the fake name
  const victim = (PARTY_ID_BASE + 3) as EntityId;
  setTimeout(() => G.events.emit('player:died', { entityId: victim, local: false }), 300);
}
