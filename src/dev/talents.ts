/**
 * DEV PAGE for the talent system (GDD_TALENTS T18, dev/talents.html). A fake character (class, level, spec, gold) and
 * the real TalentsPanel (`N` window) on the harness scene. Buttons: autoBuild (both trees staged in the draft),
 * export / import round trip, give 100k gold, rest zone on / off (removals, spec switch, string import), print fx
 * (collectFx), cancel the draft. The character is never saved: persist() is a no-op on this page.
 */
import { G } from '../game/G';
import { bootHarness } from './harness';
import { CharacterState } from '../systems/CharacterState';
import { TalentsPanel } from '../ui/panels/game/talents';
import { CLASS_ORDER, classOfSpec, getTree, specsOfClass } from '../data/talentTrees/index';
import { collectFx } from '../systems/StatCalc';
import type { ClassId } from '../types/common';
import type { SpecId } from '../types/v2';
import type { TalentSystem } from '../systems/Talents';
import '../ui/styles/panels-talents-shell.css';
import '../ui/styles/panels-talents-tree.css';
import '../ui/styles/panels-talents-web.css';
import '../ui/styles/panels-talents-skills.css';
import '../ui/styles/panels-talents-dialogs.css';

const REST_REASON = 'Şehir/köy dışında yalnızca puan eklenebilir.';

interface CanEdit {
  add: boolean;
  remove: boolean;
  reason?: string;
}

const out = document.getElementById('dev-out') as HTMLPreElement;
const bar = document.getElementById('dev-bar') as HTMLElement;
let panel: TalentsPanel | null = null;
let restZone = true;

function say(text: string): void {
  out.textContent = text;
}

function talentsOf(): TalentSystem {
  const t = G.talents;
  if (!t) throw new Error('[dev] G.talents is missing (createServices did not run)');
  return t;
}

/** Re-opens the panel so it re-reads the character and the draft. */
function refresh(): void {
  panel?.open();
}

function className(classId: ClassId): string {
  return getTree('class', classId)?.name ?? classId;
}

function specName(specId: SpecId): string {
  return getTree('spec', specId)?.name ?? specId;
}

/** Creates the fake character. Only the first spec of the class is taken when none was picked (level 10+ required). */
function buildCharacter(classId: ClassId, level: number, spec: SpecId | '', gold: number): void {
  const c = CharacterState.create('Efsuncu', classId, 1);
  c.save.level = level;
  c.save.gold = gold;
  // dev page: never write a real save slot
  (c as unknown as { persist: (immediate?: boolean) => void }).persist = () => {};
  G.character = c;
  const t = talentsOf();
  t.cancel();
  if (level >= 10) {
    const pick = spec && classOfSpec(spec) === classId ? spec : specsOfClass(classId)[0];
    if (pick) t.setSpec(pick);
  }
  say(`Karakter: ${className(classId)} · seviye ${level} · altın ${gold} · uzmanlık ${c.save.spec ?? 'yok'}`);
  refresh();
}

/** Stages the greedy build (Önerilen) of both trees in the draft. */
function autoStage(): void {
  const t = talentsOf();
  if (!t.specId) return say('Önce bir uzmanlık seç (seviye 10 veya üstü).');
  t.beginDraft();
  const cls = t.stageTree('class', t.autoBuild('class'));
  const spec = t.stageTree('spec', t.autoBuild('spec'));
  const d = t.diff();
  say(`autoBuild: sınıf ${cls ? 'tamam' : 'reddedildi'} · uzmanlık ${spec ? 'tamam' : 'reddedildi'}\n`
    + `eklenen ${d.addedPoints} · kaldırılan ${d.removedPoints} · bedel ${d.cost} altın\n`
    + `${t.lastReason ?? ''}`);
  refresh();
}

/** export → import → export of the working build: the strings must match and the draft must hold the loaded build. */
function roundTrip(): void {
  const t = talentsOf();
  const before = t.exportBuild();
  if (!before) return say('Önce bir uzmanlık seç.');
  t.cancel();
  const r = t.importBuild(before);
  const after = t.exportBuild();
  const verdict = after === before ? 'EŞİT' : `FARKLI: ${after}`;
  say(`export: ${before}\nimport: ${r.ok ? 'tamam' : r.error ?? 'reddedildi'}\nround trip: ${verdict}`);
  refresh();
}

function setRestZone(on: boolean): void {
  restZone = on;
  say(`Dinlenme bölgesi: ${on ? 'açık (çıkarma ve uzmanlık değişimi serbest)' : 'kapalı (yalnızca ekleme)'}`);
  refresh();
}

function printFx(): void {
  const c = G.character;
  if (!c) return say('Karakter yok.');
  const fx = collectFx(c.save);
  console.log('[dev] collectFx', fx);
  const grants = fx.grants.join(', ') || '-';
  const bespoke = Object.keys(fx.bespoke).join(', ') || '-';
  say(`collectFx: stat ${Object.keys(fx.stats).length} · mod ${fx.mods.length} · proc ${fx.procs.length} · grant ${grants} · özel ${bespoke}\n`
    + JSON.stringify(fx, null, 1).slice(0, 6000));
}

/** The bar: class / level / spec / gold selectors and the buttons. */
function buildBar(): void {
  const classSel = document.createElement('select');
  for (const c of CLASS_ORDER) classSel.append(new Option(className(c), c));
  const levelIn = document.createElement('input');
  Object.assign(levelIn, { type: 'range', min: 10, max: 60, value: 60, step: 1 });
  const levelLabel = document.createElement('span');
  const specSel = document.createElement('select');
  const goldIn = document.createElement('input');
  Object.assign(goldIn, { type: 'range', min: 0, max: 200000, value: 100000, step: 1000 });
  const goldLabel = document.createElement('span');

  const fillSpecs = (): void => {
    specSel.innerHTML = '';
    specSel.append(new Option('(seçilmedi)', ''));
    for (const s of specsOfClass(classSel.value as ClassId)) specSel.append(new Option(specName(s), s));
  };
  const sync = (): void => {
    levelLabel.textContent = ` seviye ${levelIn.value} `;
    goldLabel.textContent = ` altın ${Number(goldIn.value).toLocaleString('tr-TR')} `;
  };
  classSel.addEventListener('change', fillSpecs);
  levelIn.addEventListener('input', sync);
  goldIn.addEventListener('input', sync);
  fillSpecs();
  sync();

  const add = (label: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    bar.append(b);
    return b;
  };
  const restBtn = add('Dinlenme: açık', () => {
    setRestZone(!restZone);
    restBtn.textContent = `Dinlenme: ${restZone ? 'açık' : 'kapalı'}`;
  });

  bar.append(classSel, levelIn, levelLabel, specSel, goldIn, goldLabel);
  add('Karakteri kur', () => buildCharacter(classSel.value as ClassId, Number(levelIn.value), specSel.value as SpecId | '', Number(goldIn.value)));
  add('autoBuild', autoStage);
  add('dışa / içe aktar', roundTrip);
  add('100k altın ver', () => {
    G.character?.addGold(100000);
    say(`Altın: ${G.character?.save.gold ?? 0}`);
    refresh();
  });
  add('taslağı iptal', () => {
    talentsOf().cancel();
    say('Taslak iptal edildi.');
    refresh();
  });
  add('fx yazdır', printFx);
  add('pencereyi aç', () => refresh());
}

async function main(): Promise<void> {
  await bootHarness({ floor: false, orbit: false });
  (G.engine.canvas as HTMLCanvasElement).style.background = '#0b0907';

  // the rest-zone toggle: removals, spec switch and string import follow `restZone`
  (talentsOf() as unknown as { canEditHere: () => CanEdit }).canEditHere = (): CanEdit =>
    restZone ? { add: true, remove: true } : { add: true, remove: false, reason: REST_REASON };

  buildBar();
  panel = new TalentsPanel();
  buildCharacter('knight', 60, '', 100000);
  say(`${out.textContent}\nHazır: "autoBuild", "dışa / içe aktar" veya "fx yazdır" dene.`);
}

main().catch((e) => {
  console.error('[dev] talents page failed', e);
  say(`Hata: ${String((e as Error)?.message ?? e)}`);
});
