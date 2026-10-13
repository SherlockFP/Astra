import { G } from '../../../game/G';
import { PROF_IDS, PROFESSIONS, SKILL_COLOR_HEX, SKILL_MAX, recipesOf, tierOfSkill } from '../../../data/professions';
import { MATERIALS } from '../../../data/materials';
import { profName } from '../../../systems/Professions';
import type { RecipeDef } from '../../../types/professions';
import { GamePanel, bar, button, h, toast, windowFrame } from './base';
import { emptyState } from '../../kit';
import '../../styles/panels-professions.css';

const TIER_NAMES = ['Çırak', 'Kalfa', 'Usta', 'Ehil', 'Üstat', 'Kadim Usta'];

/**
 * Meslekler (GDD_LIFE §1.13, MVP): skill bars of Madencilik and Bitki Toplama with the tier name, and the six starter recipes
 * with their inputs in the bag and a Yap button. Opened from the game menu. OWNER: panels-game module.
 */
export class ProfessionsPanel extends GamePanel {
  private listEl!: HTMLElement;

  constructor() {
    super('professions', { backdropClose: true });
  }

  protected build(): void {
    const { win, body, foot } = windowFrame({
      title: 'Meslekler',
      icon: '/assets/icons/item-ore.svg',
      cls: 'pg-prof',
      size: 'M',
      onClose: () => this.requestClose(),
    });
    this.listEl = h('div.pg-prof-list');
    body.append(this.listEl);
    foot.append(button('Kapat', () => this.requestClose(), { variant: 'ghost' }));
    this.el.append(win);
  }

  protected onOpen(): void {
    this.listen('profession:skillUp', () => this.render());
    this.listen('gather:done', () => this.render());
    this.listen('loot:pickedUp', () => this.render());
    this.render();
  }

  private render(): void {
    this.listEl.innerHTML = '';
    const ch = G.character;
    if (!ch) {
      this.listEl.append(emptyState({ icon: '/assets/icons/item-ore.svg', title: 'Karakter seçili değil', text: 'Meslekler bir karakter seçildiğinde görünür.' }));
      return;
    }
    for (const prof of PROF_IDS) {
      const def = PROFESSIONS[prof];
      const skill = G.professions?.skill(prof) ?? 1;
      const tier = tierOfSkill(skill);
      this.listEl.append(
        h('div.pg-prof-head', null, h('b', null, profName(prof)), h('span', null, `${TIER_NAMES[tier - 1]} · ${skill} / ${SKILL_MAX}`)),
        h('div.pg-prof-desc', null, def.desc),
        bar(skill / SKILL_MAX, def.color, `${skill} / ${SKILL_MAX}`),
        h('div.pg-prof-sub', null, 'Tarifler'),
      );
      for (const r of recipesOf(prof)) this.listEl.append(this.recipeRow(r));
    }
    this.listEl.append(h('div.pg-prof-hint', null, 'Toplama: dünyadaki damar ve bitkilere yaklaş, F tuşunu basılı tut.'));
  }

  private recipeRow(r: RecipeDef): HTMLElement {
    const ch = G.character;
    const gate = G.professions?.gate(r.prof, r.skillReq);
    const check = G.professions?.canCraft(r.id) ?? { ok: false, reason: 'Meslek sistemi yok.' };
    const color = gate ? SKILL_COLOR_HEX[gate.color] : '#ffffff';
    const ings = r.inputs.map((i) => `${MATERIALS[i.id]?.name ?? i.id} ${ch?.material(i.id) ?? 0}/${i.count}`).join(' · ');
    const outId = 'id' in r.output ? r.output.id : '';
    const outName = MATERIALS[outId]?.name ?? outId;
    const main = h(
      'div.pg-prof-rmain',
      null,
      h('b', null, `${r.name} (${r.skillReq})`),
      h('span', null, `${ings} → ${outName}`),
    );
    main.querySelector('b')!.style.color = color;
    if (gate && !gate.ok) main.append(h('em.pg-prof-lock', null, gate.reason ?? ''));
    else if (!check.ok) main.append(h('em.pg-prof-lock', null, check.reason ?? ''));
    return h(
      'div.pg-prof-recipe',
      null,
      main,
      button('Yap', () => this.craft(r.id), { disabled: !(gate?.ok && check.ok) }),
    );
  }

  private craft(id: string): void {
    const res = G.professions?.craft(id);
    if (res && !res.ok) toast(res.reason ?? 'Üretilemedi.', 'warning');
    this.render();
  }
}
