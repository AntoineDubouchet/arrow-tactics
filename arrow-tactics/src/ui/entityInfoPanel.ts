import { teamColor } from '../render/unitSelectionRing';
import type { EntityInfoAction, EntityInfoRow, EntityInfoViewModel } from '../run/entityInfo';

const TEAM_LABELS = { player: 'Allié', enemy: 'Ennemi' } as const;

interface RowRefs {
  value: HTMLElement;
}

interface PanelRefs {
  title: HTMLElement;
  hpValue: HTMLElement;
  hpFill: HTMLElement;
  shieldBar: HTMLElement;
  shieldFill: HTMLElement;
  composition: HTMLElement[];
  rows: RowRefs[];
  sectionRows: RowRefs[][];
  status: HTMLElement | null;
  actions: HTMLButtonElement[];
}

/**
 * Fiche de l'entite selectionnee (unite, groupe, Mine, Caserne, Baliste), en
 * haut a gauche. Ne calcule rien : affiche le
 * modele prepare par run/entityInfo.ts. La structure DOM n'est reconstruite
 * que si la FORME du modele change (type, libelles, sections, actions) ;
 * sinon seuls les textes et largeurs qui ont change sont reecrits. Un clic
 * sur une action transmet seulement son `id` a `onAction` (main.ts).
 */
export class EntityInfoPanel {
  private readonly root: HTMLElement;
  private refs: PanelRefs | null = null;
  private shownStructure = '';
  private shownVisible = false;
  private readonly shownText = new WeakMap<HTMLElement, string>();

  constructor(private readonly onAction: (id: EntityInfoAction['id']) => void) {
    this.root = document.createElement('div');
    this.root.className = 'entity-info';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  update(vm: EntityInfoViewModel | null): void {
    const visible = vm !== null;
    if (visible !== this.shownVisible) {
      this.shownVisible = visible;
      this.root.style.display = visible ? '' : 'none';
    }
    if (!vm) return;

    const structure = structureKey(vm);
    if (structure !== this.shownStructure || !this.refs) {
      this.shownStructure = structure;
      this.refs = this.build(vm);
    }
    const refs = this.refs;

    this.setText(refs.title, vm.title);
    this.setText(refs.hpValue, `${vm.hp.current} / ${vm.hp.max}`);
    this.setWidth(refs.hpFill, vm.hp.fraction);
    const hasShield = vm.hp.shield !== undefined;
    refs.shieldBar.style.display = hasShield ? '' : 'none';
    if (hasShield) this.setWidth(refs.shieldFill, vm.hp.shieldFraction ?? 0);

    if (vm.kind === 'group') vm.composition.forEach((line, i) => this.setText(refs.composition[i]!, line));
    vm.rows.forEach((row, i) => this.setText(refs.rows[i]!.value, row.value));
    vm.sections.forEach((section, s) => section.rows.forEach((row, i) => this.setText(refs.sectionRows[s]![i]!.value, row.value)));
    if (refs.status && vm.status) {
      this.setText(refs.status, vm.status.label);
      const tone = `entity-info-status entity-info-status--${vm.status.tone}`;
      if (refs.status.className !== tone) refs.status.className = tone;
    }
    (vm.actions ?? []).forEach((action, i) => {
      const button = refs.actions[i]!;
      if (button.disabled !== !action.enabled) button.disabled = !action.enabled;
      const hint = action.hint ?? '';
      if (button.title !== hint) button.title = hint;
    });
  }

  private build(vm: EntityInfoViewModel): PanelRefs {
    this.root.replaceChildren();
    this.root.className = `entity-info entity-info--${vm.kind}`;
    this.root.style.setProperty('--entity-team-color', `#${teamColor(vm.team).toString(16).padStart(6, '0')}`);

    const header = el('div', 'entity-info-header');
    const title = el('div', 'entity-info-title');
    const team = el('div', 'entity-info-team');
    team.textContent = TEAM_LABELS[vm.team];
    header.append(title, team);

    const hp = el('div', 'entity-info-hp');
    const hpLine = el('div', 'entity-info-row');
    const hpLabel = el('span', 'entity-info-label');
    hpLabel.textContent = 'PV';
    const hpValue = el('span', 'entity-info-value');
    hpLine.append(hpLabel, hpValue);
    // Memes classes que les barres de PV en jeu (ui/combatOverlay.ts).
    const track = el('div', 'health-bar-track');
    const hpFill = el('div', 'health-bar-fill');
    track.appendChild(hpFill);
    const shieldBar = el('div', 'shield-bar');
    const shieldFill = el('div', 'shield-bar-fill');
    shieldBar.appendChild(shieldFill);
    hp.append(hpLine, track, shieldBar);

    this.root.append(header);
    const composition: HTMLElement[] = [];
    if (vm.kind === 'group') {
      const list = el('div', 'entity-info-composition');
      for (let i = 0; i < vm.composition.length; i++) {
        const line = el('div', 'entity-info-composition-line');
        list.appendChild(line);
        composition.push(line);
      }
      this.root.appendChild(list);
    }
    this.root.appendChild(hp);

    const rows = this.buildRows(this.root, vm.rows);
    const sectionRows = vm.sections.map((section) => {
      const box = el('div', 'entity-info-section');
      const sectionTitle = el('div', 'entity-info-section-title');
      sectionTitle.textContent = section.title;
      box.appendChild(sectionTitle);
      this.root.appendChild(box);
      return this.buildRows(box, section.rows);
    });

    let status: HTMLElement | null = null;
    if (vm.status) {
      status = el('div', 'entity-info-status');
      this.root.appendChild(status);
    }
    const actions = (vm.actions ?? []).map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'entity-info-action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        // Le focus ne doit pas rester sur le bouton : Espace/Entree le
        // redeclencheraient.
        button.blur();
        this.onAction(action.id);
      });
      return button;
    });
    if (actions.length > 0) {
      const box = el('div', 'entity-info-actions');
      box.append(...actions);
      this.root.appendChild(box);
    }
    return { title, hpValue, hpFill, shieldBar, shieldFill, composition, rows, sectionRows, status, actions };
  }

  private buildRows(parent: HTMLElement, rows: EntityInfoRow[]): RowRefs[] {
    return rows.map((row) => {
      const line = el('div', 'entity-info-row');
      const label = el('span', 'entity-info-label');
      label.textContent = row.label;
      const value = el('span', 'entity-info-value');
      line.append(label, value);
      parent.appendChild(line);
      return { value };
    });
  }

  private setText(target: HTMLElement, text: string): void {
    if (this.shownText.get(target) === text) return;
    this.shownText.set(target, text);
    target.textContent = text;
  }

  private setWidth(target: HTMLElement, fraction: number): void {
    const width = `${Math.round(fraction * 1000) / 10}%`;
    if (this.shownText.get(target) === width) return;
    this.shownText.set(target, width);
    target.style.width = width;
  }
}

/** Forme du modele : tout ce qui decide des elements DOM, jamais les
 *  valeurs qui changent pendant la bataille. */
function structureKey(vm: EntityInfoViewModel): string {
  return JSON.stringify([
    vm.kind,
    vm.team,
    vm.kind === 'group' ? vm.composition.length : 0,
    vm.rows.map((r) => r.label),
    vm.sections.map((s) => [s.title, s.rows.map((r) => r.label)]),
    vm.status !== null,
    (vm.actions ?? []).map((a) => [a.id, a.label]),
  ]);
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
