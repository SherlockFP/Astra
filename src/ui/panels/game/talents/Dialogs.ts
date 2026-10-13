/**
 * GDD_TALENTS §5.6 / §5.10 talents/Dialogs.ts (panels-game, T14): the modal dialogs of the `N` window. Each flow asks here
 * and reports the answer; the rules stay in systems/Talents.ts. A dialog is a layer inside the panel root (the askConfirm
 * look): the spec picker and switch confirm (§2.4), the Apply confirm with its cost line (§5.6 step 3), the Önerilen and
 * Sıfırla confirms, the loadout menu (Yükle, Yeniden Adlandır, Çoğalt, Sil), the save-name prompt (max 8 loadouts, names
 * ≤ 24 characters), the export dialog (EFT1 string + copy), the import dialog ("Geçersiz yapı dizesi") and the
 * unsaved-changes prompt. Owner: panels-game.
 *
 * Wiring (not in this file): `const dialogs = new TalentDialogs(() => this.el)`, then `new TreeTab(() => this.el, dialogs.hooks)`.
 * The shell awaits `dialogs.confirmApply(diff)` before `commit()` when `diff.removedPoints > 0`, and may use
 * `dialogs.askUnsaved()` in place of its inline prompt. `dialogs.dismissAll()` closes an open dialog with the window.
 */
import { G } from '../../../../game/G';
import { ROLE_TR } from '../../../../combat/specs';
import { getSpec } from '../../../../data/specs';
import { MAX_LOADOUT_NAME, MAX_SAVED_LOADOUTS, type TalentDiff } from '../../../../systems/Talents';
import { emit } from '../../../../systems/notify';
import type { TalentLoadout } from '../../../../types/talents';
import type { SpecId } from '../../../../types/v2';
import { button, fmtInt, h, sfx, toast, type Kids } from '../base';
import { ROLE_COLORS } from './shared';
import type { TreeTabHooks } from './TreeView';

/** A dialog that is open. `close` removes it silently; `dismiss` removes it and runs its dismiss callback (Esc, outside click, Vazgeç). */
export interface DialogHandle {
  close(): void;
  dismiss(): void;
}

interface OpenOpts {
  title: string;
  cls?: string;
  body: (m: DialogHandle) => Kids;
  actions: (m: DialogHandle) => Kids;
  onDismiss?: () => void;
}

const FALLBACK_ROLE_COLOR = '#e8c25a';
const ERR_FORMAT = 'Geçersiz yapı dizesi';

function specName(id: SpecId): string {
  return getSpec(id)?.name ?? id;
}

/** Warning toast and error sound for a refused action. */
function refuse(reason: string | null | undefined): void {
  sfx('ui_error', 0.6);
  toast(reason || 'Bu işlem yapılamadı.', 'warning');
}

function newLoadoutId(): string {
  return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** "<name> 2", "<name> 3", … for a copy: at most MAX_LOADOUT_NAME characters and not a name already in use. */
function copyName(base: string, used: readonly string[]): string {
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const name = base.slice(0, MAX_LOADOUT_NAME - suffix.length) + suffix;
    if (!used.includes(name)) return name;
  }
}

/** Name field of a loadout dialog (at most MAX_LOADOUT_NAME characters). */
function nameField(value: string): HTMLInputElement {
  const input = h('input.pg-input.pt-dlg-input');
  input.type = 'text';
  input.maxLength = MAX_LOADOUT_NAME;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = value;
  return input;
}

/** Copies the build string: the Clipboard API, else the selected field and execCommand. Never throws. */
async function copyBuild(field: HTMLInputElement, text: string): Promise<void> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      toast('Yapı dizesi panoya kopyalandı.', 'success');
      return;
    }
  } catch {
    /* clipboard blocked: fall back to the selected field */
  }
  field.focus();
  field.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  if (ok) toast('Yapı dizesi panoya kopyalandı.', 'success');
  else toast('Dize seçildi: Ctrl+C ile kopyalayabilirsin.', 'info');
}

export class TalentDialogs {
  /** The dialog that is open. One at a time: a new dialog dismisses the old one. */
  private current: DialogHandle | null = null;
  /** The panel root the layers are appended to, and the watcher that dismisses a dialog when that root hides. */
  private watched: HTMLElement | null = null;
  private watcher: MutationObserver | null = null;

  /** Hooks of the loadout bar (TreeTab). Each hook opens a dialog and returns at once. */
  readonly hooks: TreeTabHooks;

  /** @param host the panel root; dialog layers are appended to it (each layer covers it). */
  constructor(private readonly host: () => HTMLElement | null) {
    this.hooks = {
      chooseSpec: (id, mode) => this.chooseSpec(id, mode),
      saveLoadout: () => this.saveDialog(),
      loadoutMenu: (id) => this.loadoutMenu(id),
      recommended: () => this.recommended(),
      reset: () => this.reset(),
      exportDialog: () => this.exportDialog(),
      importDialog: () => this.importDialog(),
    };
  }

  /** Closes the open dialog without an answer (the window closes, or the character changes). */
  dismissAll(): void {
    this.current?.dismiss();
  }

  /**
   * The Apply confirm (§5.6 step 3): "3 puan geri alınacak · 1.440 altın". Resolves true at once when nothing is removed
   * (adding points is free), else asks. Resolves false on Vazgeç.
   */
  confirmApply(diff: TalentDiff): Promise<boolean> {
    if (diff.removedPoints <= 0) return Promise.resolve(true);
    const lines: Node[] = diff.removed.slice(0, 8).map((c) => h('div.pt-diff-rem', null, `− ${c.name}`));
    if (diff.removed.length > 8) lines.push(h('div.pt-diff-none', null, `…ve ${diff.removed.length - 8} satır daha`));
    return this.ask({
      title: 'Değişiklikleri Uygula',
      body: [
        h('p', null, `${diff.removedPoints} puan geri alınacak · ${fmtInt(diff.cost)} altın`),
        diff.cost === 0 ? h('small.pt-dlg-note', null, 'İlk geri alma ücretsiz.') : null,
        diff.addedPoints > 0 ? h('small.pt-dlg-note', null, `${diff.addedPoints} yeni puan da eklenecek.`) : null,
        lines.length ? h('div.pt-dlg-list-ro', null, ...lines) : null,
      ],
      ok: 'Uygula',
    });
  }

  /**
   * The unsaved-changes prompt (§5.5): "Kaydedilmemiş değişiklikler var." [Uygula] [At] [Geri dön]. Esc and a click
   * outside are Geri dön. Resolves the choice; the caller runs the Apply (which may still refuse) or the cancel.
   */
  askUnsaved(): Promise<'apply' | 'discard' | 'stay'> {
    return new Promise<'apply' | 'discard' | 'stay'>((resolve) => {
      let answered = false;
      const answer = (v: 'apply' | 'discard' | 'stay'): void => {
        if (answered) return;
        answered = true;
        resolve(v);
      };
      this.open({
        title: 'Kaydedilmemiş değişiklikler var.',
        cls: 'pt-dlg-unsaved',
        body: () => [h('p', null, 'Uygula taslağı kaydeder; At taslağı atar.')],
        onDismiss: () => answer('stay'),
        actions: (m) => [
          button('Uygula', () => {
            answer('apply');
            m.close();
          }, { variant: 'primary' }),
          button('At', () => {
            answer('discard');
            m.close();
          }, { variant: 'danger' }),
          button('Geri dön', () => m.dismiss(), { variant: 'ghost' }),
        ],
      });
    });
  }

  /* ---------------------------------------------------------------- spec */

  /** Spec picker (choose) and switch confirm (§2.4 / §5.6 step 2). Switching is free in a rest zone; the shell gates it. */
  private chooseSpec(id: SpecId, mode: 'choose' | 'switch'): void {
    const T = G.talents;
    if (!T) return;
    const name = specName(id);
    const cur = T.specId;
    const text =
      mode === 'switch' && cur
        ? `${specName(cur)} → ${name}. Aktif yapın kaydedilir; bu uzmanlığın yapısı yüklenir (ücretsiz).`
        : `${name} seçilsin mi? Değiştirmek için bir şehir/köy gerekir.`;
    this.ask({
      title: mode === 'switch' ? 'Uzmanlık Değiştir' : 'Uzmanlık Seç',
      body: [h('p', null, text), this.specCard(id)],
      ok: mode === 'switch' ? 'Değiştir' : 'Uzmanlığı Seç',
    }).then((ok) => {
      if (!ok) return;
      const T2 = G.talents;
      if (!T2) return;
      if (!T2.setSpec(id)) {
        refuse(T2.lastReason ?? 'Uzmanlık değiştirilemedi.');
        return;
      }
      sfx('spec_choose', 0.8);
      toast(`${name} uzmanlığı seçildi.`, 'success');
    });
  }

  /** The identity of a spec in a dialog: name, role and its one-line description. */
  private specCard(id: SpecId): HTMLElement {
    const sd = getSpec(id);
    const card = h(
      'div.pt-dlg-spec',
      null,
      h('b', null, sd?.name ?? id),
      sd ? h('span.pt-dlg-role', null, ROLE_TR[sd.role]) : null,
      sd?.desc ? h('p', null, sd.desc) : null,
    );
    const color = sd ? ROLE_COLORS[sd.role] : undefined;
    card.style.setProperty('--role', color ?? FALLBACK_ROLE_COLOR);
    return card;
  }

  /* ---------------------------------------------------------------- staging */

  /** Önerilen (§2.7): replaces the draft of both trees with autoBuild, after a confirm. The Apply charges the removals. */
  private recommended(): void {
    const T = G.talents;
    if (!T || !T.specId) {
      refuse('Önce bir uzmanlık seç.');
      return;
    }
    this.ask({
      title: 'Önerilen Yapı',
      body: [h('p', null, 'Önerilen yapı taslağa yazılır ve açık taslağın yerini alır. Uygula ile onaylanır.')],
      ok: 'Önerilen',
    }).then((ok) => {
      if (!ok) return;
      const T2 = G.talents;
      if (!T2) return;
      const a = T2.stageTree('class', T2.autoBuild('class'));
      const b = a && T2.stageTree('spec', T2.autoBuild('spec'));
      if (!a || !b) {
        refuse(T2.lastReason ?? 'Önerilen yapı taslağa yazılamadı.');
        return;
      }
      toast('Önerilen yapı taslağa eklendi. Uygula ile onaylanır.', 'info');
      emit('talents:changed', {});
    });
  }

  /** Sıfırla (§5.6 step 4): clears both trees of the active spec in the draft, after a confirm with the first-free note. */
  private reset(): void {
    const T = G.talents;
    if (!T || !T.specId) {
      refuse('Önce bir uzmanlık seç.');
      return;
    }
    const points = T.pointsSpent('class') + T.pointsSpent('spec');
    if (points === 0) {
      toast('Sıfırlanacak puan yok.', 'info');
      return;
    }
    const cost = T.wowRespecCost(points);
    this.ask({
      title: 'Uzmanlığı Sıfırla',
      body: [
        h('p', null, 'Bu uzmanlığın iki ağacındaki tüm puanlar taslakta sıfırlanır.'),
        h('small.pt-dlg-note', null, `${points} puan geri alınacak · ${cost > 0 ? `Bedel ${fmtInt(cost)} altın (Uygula sırasında)` : 'İlk geri alma ücretsiz'}.`),
      ],
      ok: 'Sıfırla',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      const T2 = G.talents;
      if (!T2) return;
      T2.reset();
      toast('Taslak sıfırlandı. Uygula ile onaylanır.', 'info');
      emit('talents:changed', {});
    });
  }

  /* ---------------------------------------------------------------- loadouts */

  /** Kaydet: a name prompt. Saves the working build (the open draft, else the active build) under the name. */
  private saveDialog(): void {
    const T = G.talents;
    if (!T || !T.specId) {
      refuse('Önce bir uzmanlık seç.');
      return;
    }
    if (T.loadoutCount() >= MAX_SAVED_LOADOUTS) {
      refuse(`En fazla ${MAX_SAVED_LOADOUTS} yapı kaydedilebilir.`);
      return;
    }
    const input = nameField(`Yapı ${T.loadoutCount() + 1}`);
    const submit = (m: DialogHandle): void => {
      const T2 = G.talents;
      if (!T2) return;
      try {
        const l = T2.saveLoadout(input.value.trim());
        toast(`"${l.name}" kaydedildi.`, 'success');
        m.close();
      } catch (e) {
        console.warn('[talents] saveLoadout failed', e);
        refuse('Yapı kaydedilemedi.');
      }
    };
    const dlg = this.open({
      title: 'Yapıyı Kaydet',
      body: () => [
        h('p', null, 'Yapının adı (en fazla 24 karakter):'),
        input,
        h('small.pt-dlg-note', null, T.draft ? 'Açık taslak kaydedilir.' : 'Aktif yapı kaydedilir.'),
      ],
      actions: (m) => [
        button('Vazgeç', () => m.dismiss(), { variant: 'ghost' }),
        button('Kaydet', () => submit(m), { variant: 'primary' }),
      ],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit(dlg);
    });
    input.focus();
    input.select();
  }

  /** Düzenle on a saved loadout: Yükle (free, rest zone), Yeniden Adlandır, Çoğalt (max 8), Sil (after a confirm). */
  private loadoutMenu(id: string): void {
    const T = G.talents;
    if (!T || !T.specId) {
      refuse('Önce bir uzmanlık seç.');
      return;
    }
    const l = T.savedLoadouts().find((x) => x.id === id);
    if (!l) {
      refuse('Yapı bulunamadı.');
      return;
    }
    const edit = T.canEditHere();
    this.open({
      title: l.name,
      cls: 'pt-dlg-menu',
      body: (m) => [
        h('p', null, 'Kayıtlı yapı için bir işlem seç.'),
        h(
          'div.pt-dlg-list',
          null,
          button(
            'Yükle',
            () => {
              m.close();
              this.loadInto(id);
            },
            { variant: 'ghost', disabled: !edit.remove, title: edit.remove ? 'Taslağa yükler; ücretsiz, Uygula ile onaylanır.' : edit.reason ?? '' },
          ),
          button(
            'Yeniden Adlandır',
            () => {
              m.close();
              this.renameDialog(id, l.name);
            },
            { variant: 'ghost' },
          ),
          button(
            'Çoğalt',
            () => {
              m.close();
              this.duplicate(id);
            },
            { variant: 'ghost' },
          ),
          button(
            'Sil',
            () => {
              m.close();
              this.deleteDialog(id, l.name);
            },
            { variant: 'danger' },
          ),
        ),
      ],
      actions: (m) => [button('Kapat', () => m.dismiss(), { variant: 'ghost' })],
    });
  }

  /** Yükle: the saved loadout goes into the draft (free, rest zone). Uygula applies it. */
  private loadInto(id: string): void {
    const T = G.talents;
    if (!T) return;
    if (!T.loadLoadout(id)) {
      refuse(T.lastReason);
      return;
    }
    sfx('ui_tab', 0.7);
    toast('Yapı taslağa yüklendi. Uygula ile onaylanır.', 'info');
    emit('talents:changed', {});
  }

  /** Yeniden Adlandır: a name prompt, the name is not empty and at most MAX_LOADOUT_NAME characters. */
  private renameDialog(id: string, current: string): void {
    const input = nameField(current);
    const submit = (m: DialogHandle): void => {
      const name = input.value.trim();
      if (!name) {
        refuse('Yapı adı boş olamaz.');
        return;
      }
      const T = G.talents;
      if (!T) return;
      T.renameLoadout(id, name);
      const saved = T.savedLoadouts().find((x) => x.id === id)?.name ?? name;
      toast(`Yapı "${saved}" olarak adlandırıldı.`, 'success');
      m.close();
    };
    const dlg = this.open({
      title: 'Yapıyı Yeniden Adlandır',
      body: () => [input],
      actions: (m) => [
        button('Vazgeç', () => m.dismiss(), { variant: 'ghost' }),
        button('Kaydet', () => submit(m), { variant: 'primary' }),
      ],
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit(dlg);
    });
    input.focus();
    input.select();
  }

  /**
   * Çoğalt: a copy of a saved loadout under a new name, in a free slot (§2.7, at most MAX_SAVED_LOADOUTS). TalentSystem has
   * no duplicate, so the copy is one more entry of the same saved list (the only direct write of the dialogs).
   */
  private duplicate(id: string): void {
    const T = G.talents;
    const spec = T?.specId;
    const save = G.character?.save;
    const list: TalentLoadout[] = spec && save?.tb ? (save.tb.saved[spec] ?? []) : [];
    const src = list.find((x) => x.id === id);
    if (!T || !spec || !save || !src) {
      refuse('Yapı bulunamadı.');
      return;
    }
    if (list.length >= MAX_SAVED_LOADOUTS) {
      refuse(`En fazla ${MAX_SAVED_LOADOUTS} yapı kaydedilebilir.`);
      return;
    }
    const copy: TalentLoadout = {
      id: newLoadoutId(),
      name: copyName(src.name, list.map((x) => x.name)),
      cls: src.cls.slice(),
      spc: src.spc.slice(),
      skl: src.skl.slice(),
      at: Date.now(),
    };
    list.push(copy);
    emit('loadout:changed', { specId: spec });
    G.character?.persist();
    toast(`"${copy.name}" çoğaltıldı.`, 'success');
  }

  /** Sil: a confirm, then the loadout is removed (the active build is never affected). */
  private deleteDialog(id: string, name: string): void {
    this.ask({
      title: 'Yapıyı Sil',
      body: [h('p', null, `"${name}" silinsin mi?`)],
      ok: 'Sil',
      danger: true,
    }).then((ok) => {
      if (!ok) return;
      const T = G.talents;
      if (!T) return;
      T.deleteLoadout(id);
      toast(`"${name}" silindi.`, 'info');
    });
  }

  /* ---------------------------------------------------------------- strings */

  /** Dışa Aktar: the working build as an EFT1 string, with a copy button. */
  private exportDialog(): void {
    const T = G.talents;
    const text = T ? T.exportBuild() : '';
    if (!T || !text) {
      refuse('Önce bir uzmanlık seç.');
      return;
    }
    const field = h('input.pg-input.pt-dlg-input.pt-dlg-code') as HTMLInputElement;
    field.readOnly = true;
    field.spellcheck = false;
    field.value = text;
    this.open({
      title: 'Yapı Dizesini Dışa Aktar',
      body: () => [
        h('p', null, 'Dizeyi kopyala ve başka bir karaktere ya da yedeğe yapıştır.'),
        field,
        h('small.pt-dlg-note', null, T.draft ? 'Açık taslağın dizesi.' : 'Aktif yapının dizesi.'),
      ],
      actions: (m) => [
        button('Kapat', () => m.dismiss(), { variant: 'ghost' }),
        button('Panoya Kopyala', () => void copyBuild(field, text), { variant: 'primary' }),
      ],
    });
    field.focus();
    field.select();
  }

  /**
   * İçe Aktar: paste a build string. A valid one goes into the draft (free, rest zone) and the dialog closes; a bad one
   * keeps the dialog open with "Geçersiz yapı dizesi" (or the rule message the system gives). Ctrl+Enter imports.
   */
  private importDialog(): void {
    const T = G.talents;
    if (!T) {
      refuse('Uzmanlık sistemi hazır değil.');
      return;
    }
    const edit = T.canEditHere();
    const area = h('textarea.pt-dlg-area');
    area.rows = 3;
    area.spellcheck = false;
    area.placeholder = 'EFT1-…';
    area.disabled = !edit.remove;
    const err = h('div.pt-dlg-err');
    const showErr = (msg: string): void => {
      err.textContent = msg;
      err.classList.toggle('is-on', msg !== '');
    };
    const importNow = (m: DialogHandle): void => {
      const T2 = G.talents;
      if (!T2) return;
      const r = T2.importBuild(area.value.trim());
      if (!r.ok) {
        sfx('ui_error', 0.6);
        showErr(r.error ?? ERR_FORMAT);
        return;
      }
      m.close();
      sfx('ui_tab', 0.7);
      toast('Yapı taslağa yüklendi. Uygula ile onaylanır.', 'info');
      emit('talents:changed', {});
    };
    const dlg = this.open({
      title: 'Yapı Dizesini İçe Aktar',
      body: () => [
        h('p', null, 'Yapı dizesini yapıştır. Geçerliyse taslağa yüklenir; Uygula ile onaylanır.'),
        area,
        err,
        edit.remove ? null : h('small.pt-dlg-note', null, edit.reason ?? 'Yapı yalnızca şehir veya köyde yüklenebilir.'),
      ],
      actions: (m) => [
        button('Vazgeç', () => m.dismiss(), { variant: 'ghost' }),
        button('İçe Aktar', () => importNow(m), { variant: 'primary', disabled: !edit.remove }),
      ],
    });
    area.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      importNow(dlg);
    });
    if (edit.remove) area.focus();
  }

  /* ---------------------------------------------------------------- shared */

  /** A yes / no dialog. Resolves true on the OK button, false on Vazgeç, Esc or a click outside. */
  private ask(o: { title: string; body: Kids; ok: string; danger?: boolean }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let answered = false;
      const answer = (v: boolean): void => {
        if (answered) return;
        answered = true;
        resolve(v);
      };
      this.open({
        title: o.title,
        body: () => o.body,
        onDismiss: () => answer(false),
        actions: (m) => [
          button('Vazgeç', () => m.dismiss(), { variant: 'ghost' }),
          button(
            o.ok,
            () => {
              answer(true);
              m.close();
            },
            { variant: o.danger ? 'danger' : 'primary' },
          ),
        ],
      });
    });
  }

  /** Dismisses the open dialog when the panel root is hidden (the window closed with a dialog up, so it never comes back). */
  private watch(root: HTMLElement): void {
    if (this.watched === root) return;
    this.watcher?.disconnect();
    this.watched = root;
    this.watcher = new MutationObserver(() => {
      if (root.style.display === 'none') this.dismissAll();
    });
    this.watcher.observe(root, { attributes: true, attributeFilter: ['style'] });
  }

  /** Builds and shows a dialog layer in the panel root. The dialog that is open is dismissed first. */
  private open(o: OpenOpts): DialogHandle {
    this.current?.dismiss();
    let alive = true;
    const end = (): boolean => {
      if (!alive) return false;
      alive = false;
      document.removeEventListener('keydown', onKey, true);
      layer.remove();
      if (this.current === dlg) this.current = null;
      return true;
    };
    const dlg: DialogHandle = {
      close: () => {
        end();
      },
      dismiss: () => {
        if (end()) o.onDismiss?.();
      },
    };
    // Esc closes this dialog only: captured here so the window behind it stays open (the same rule as the shell's prompt)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      dlg.dismiss();
    };
    const box = h(
      'div.pt-dlg.pg-confirm-box' + (o.cls ? `.${o.cls}` : ''),
      { role: 'dialog', 'aria-modal': 'true' },
      h('div.pt-dlg-title', null, o.title),
      h('div.pt-dlg-body', null, ...o.body(dlg)),
      h('div.pt-dlg-actions', null, ...o.actions(dlg)),
    );
    const layer = h('div.pg-confirm.pt-dlg-layer', null, box);
    layer.addEventListener('mousedown', (e) => {
      if (e.target === layer) dlg.dismiss();
    });
    const root = this.host() ?? document.body;
    this.watch(root);
    root.append(layer);
    document.addEventListener('keydown', onKey, true);
    this.current = dlg;
    sfx('ui_open', 0.6);
    // the confirming action takes focus; menus with no confirm action keep focus on the panel (Enter must not run an item)
    box.querySelector<HTMLButtonElement>('.pg-btn--primary:not(:disabled), .pg-btn--danger:not(:disabled)')?.focus();
    return dlg;
  }
}
