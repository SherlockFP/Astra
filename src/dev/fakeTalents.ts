import { TALENT_NODES, type TalentNode } from '../data/talents';
import type { ClassId } from '../types/common';
import type { StatBlock } from '../types/stats';
import { statName, statLine } from '../ui/panels/game/base';

/**
 * DEV ONLY: generates a 125-node passive tree with the GDD geometry (4 class starts on the diagonals at r=420,
 * hubs, three arms per class, cross links, bridge arcs) when data/talents.ts is still empty.
 */
interface ClassSpec {
  p: string;
  cls: ClassId;
  deg: number;
  arms: { a: string[]; m: string[]; b: string[] };
  keyA: [string, string, string];
  keyM: [string, string, string];
  main: string;
}

const SPECS: ClassSpec[] = [
  { p: 'mg', cls: 'mage', deg: -45, main: 'int', arms: { a: ['fireDamagePct', 'castSpeed', 'dotPct'], m: ['maxResource', 'resourceRegenPct', 'arcaneDamagePct'], b: ['frostDamagePct', 'ccDurationPct', 'castSpeed'] }, keyA: ['ks_glass_cannon', 'Cam Top', '%35 DAHA FAZLA hasar. Maks. can %30 DAHA AZ.'], keyM: ['ks_mind_shield', 'Zihin Kalkanı', "Alınan hasarın %30'u önce manadan düşülür."] },
  { p: 'rg', cls: 'rogue', deg: 45, main: 'dex', arms: { a: ['dodgeChance', 'moveSpeedPct', 'critChance'], m: ['attackSpeed', 'critDamage', 'poisonDamagePct'], b: ['physicalDamagePct', 'dotPct', 'armorPen'] }, keyA: ['ks_shadow_dance', 'Gölge Dansı', 'Kaçış Yuvarlanması +1 şarj. Maks. can %15 DAHA AZ.'], keyM: ['ks_perfect_agony', 'Kusursuz İşkence', 'Kanama ve Zehir kritik atabilir.'] },
  { p: 'bb', cls: 'barbarian', deg: 135, main: 'str', arms: { a: ['lifeSteal', 'maxHpPct', 'hpRegen'], m: ['physicalDamagePct', 'attackSpeed', 'critChance'], b: ['bossDamagePct', 'armor', 'damagePct'] }, keyA: ['ks_blood_sacrifice', 'Kan Kurban', 'Can çalma ×2. Doğal can yenilenmesi yok.'], keyM: ['ks_berserker_soul', 'Çılgın Ruh', 'Eksik canın her %1\'i için %1 DAHA FAZLA hasar.'] },
  { p: 'kn', cls: 'knight', deg: 225, main: 'str', arms: { a: ['physicalDamagePct', 'critChance', 'attackSpeed'], m: ['armorPct', 'blockChance', 'maxHpPct'], b: ['holyDamagePct', 'resAll', 'hpRegen'] }, keyA: ['ks_steady_hand', 'Sabit El', 'Kritik vuruş yapamazsın. %30 DAHA FAZLA hasar.'], keyM: ['ks_iron_fortress', 'Demir Kale', 'Blok şansın ×2. Kaçınma şansın 0 olur.'] },
];

const polar = (r: number, deg: number): [number, number] => [Math.round(Math.cos((deg * Math.PI) / 180) * r), Math.round(Math.sin((deg * Math.PI) / 180) * r)];

const SMALL_VAL: Record<string, number> = { fireDamagePct: 0.08, frostDamagePct: 0.08, arcaneDamagePct: 0.08, physicalDamagePct: 0.08, poisonDamagePct: 0.08, holyDamagePct: 0.08, castSpeed: 0.04, attackSpeed: 0.04, dotPct: 0.1, critChance: 0.01, critDamage: 0.1, dodgeChance: 0.02, moveSpeedPct: 0.03, maxResource: 5, resourceRegenPct: 0.1, ccDurationPct: 0.1, lifeSteal: 0.01, maxHpPct: 0.05, hpRegen: 2, bossDamagePct: 0.06, armor: 40, armorPct: 0.06, damagePct: 0.04, blockChance: 0.03, resAll: 0.04, armorPen: 0.04 };

export function installFakeTalents(): boolean {
  if (Object.keys(TALENT_NODES).length > 0) return false;
  const put = (n: TalentNode) => {
    TALENT_NODES[n.id] = n;
  };
  const link = (a: string, b: string) => {
    const A = TALENT_NODES[a];
    const B = TALENT_NODES[b];
    if (!A || !B) return;
    if (!A.links.includes(b)) A.links.push(b);
    if (!B.links.includes(a)) B.links.push(a);
  };
  const mk = (id: string, name: string, kind: TalentNode['kind'], x: number, y: number, stats?: StatBlock, special?: TalentNode['special'], extra: Partial<TalentNode> = {}) => {
    put({ id, name, kind, x, y, links: [], stats, special, ...extra });
  };

  mk('core', 'Kadim Çekirdek', 'notable', 0, 0, { damagePct: 0.05, maxHpPct: 0.05 }, undefined, { desc: '+10 Tüm Özellikler; +%5 hasar; +%5 maks. can' });

  for (const s of SPECS) {
    const [sx, sy] = polar(420, s.deg);
    mk(`${s.p}_start`, `${s.cls === 'mage' ? 'Büyücü' : s.cls === 'rogue' ? 'Haydut' : s.cls === 'barbarian' ? 'Barbar' : 'Şövalye'} Başlangıcı`, 'start', sx, sy, { [s.main]: 10 }, undefined, { classStart: s.cls, desc: 'Sınıfına özel başlangıç. Başka sınıf 1 puanla alabilir.' });
    const inward = [300, 190, 90];
    let prev = `${s.p}_start`;
    inward.forEach((r, i) => {
      const [x, y] = polar(r, s.deg);
      const id = i === 2 ? `${s.p}_hub` : `${s.p}_p${i + 1}`;
      mk(id, i === 2 ? 'Tüm Özellikler' : i === 0 ? statName(s.main) : 'Dayanıklılık', 'small', x, y, i === 2 ? { str: 5, dex: 5, int: 5, vit: 5 } : { [i === 0 ? s.main : 'vit']: 10 });
      link(prev, id);
      prev = id;
    });
    link(prev, 'core');

    const armDefs: { key: 'a' | 'm' | 'b'; off: number }[] = [
      { key: 'a', off: -25 },
      { key: 'm', off: 0 },
      { key: 'b', off: 25 },
    ];
    const radii = [520, 600, 690, 780, 860, 950];
    for (const arm of armDefs) {
      const stats = s.arms[arm.key];
      let last = `${s.p}_start`;
      radii.forEach((r, i) => {
        const [x, y] = polar(r, s.deg + arm.off);
        const id = `${s.p}_${arm.key}${i + 1}`;
        const key = stats[i % stats.length];
        const isNotable = i === 2 || (i === 5 && arm.key === 'b');
        const isKey = i === 5 && arm.key !== 'b';
        if (isKey) {
          const [kid, kname, kdesc] = arm.key === 'a' ? s.keyA : s.keyM;
          mk(kid, kname, 'keystone', x, y, undefined, { id: kid, desc: kdesc });
          link(last, kid);
          last = kid;
          return;
        }
        if (isNotable) {
          const v = (SMALL_VAL[key] ?? 0.05) * 3;
          mk(id, `${statName(key)} Ustası`, 'notable', x, y, { [key]: v }, { id: 'n_' + id, desc: `${statLine(key, v)}; kısa bir etki bonusu.` });
        } else {
          mk(id, statName(key), 'small', x, y, { [key]: SMALL_VAL[key] ?? 0.05 });
        }
        link(last, id);
        last = id;
      });
    }
    // cross links
    for (const [k, off, from, to] of [['c1', -12.5, 'a3', 'm3'], ['c2', 12.5, 'm3', 'b3']] as const) {
      const [x, y] = polar(780, s.deg + off);
      const key = s.arms.m[(k === 'c1' ? 0 : 1) % 3];
      mk(`${s.p}_${k}`, statName(key), 'small', x, y, { [key]: SMALL_VAL[key] ?? 0.05 });
      link(`${s.p}_${from}`, `${s.p}_${k}`);
      link(`${s.p}_${k}`, `${s.p}_${to}`);
    }
  }
  // hub ring
  for (let i = 0; i < 4; i++) link(`${SPECS[i].p}_hub`, `${SPECS[(i + 1) % 4].p}_hub`);
  // bridges: B arm (r600) of class i -> A arm (r600) of the next class clockwise on screen
  const order = [...SPECS].sort((a, b) => ((a.deg + 360) % 360) - ((b.deg + 360) % 360));
  for (let i = 0; i < 4; i++) {
    const from = order[i];
    const to = order[(i + 1) % 4];
    const a0 = from.deg + 25;
    let a1 = to.deg - 25;
    if (a1 < a0) a1 += 360;
    let prev = `${from.p}_b2`;
    for (let j = 0; j < 7; j++) {
      const ang = a0 + ((j + 1) / 8) * (a1 - a0);
      const [x, y] = polar(640, ang);
      const id = `br_${from.p}_${j}`;
      if (j === 3) mk(id, 'Köprü Ustası', 'notable', x, y, { allAttr: 6, damagePct: 0.06 } as StatBlock, { id: 'n_' + id, desc: '+6 Tüm Özellikler; +%6 hasar' });
      else mk(id, 'Köprü', 'small', x, y, { vit: 8 });
      link(prev, id);
      prev = id;
    }
    link(prev, `${to.p}_a2`);
  }
  return true;
}
