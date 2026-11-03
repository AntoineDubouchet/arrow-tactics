/**
 * Bouton « Construire » (2026-11-02, Survie en temps reel) : a la place de
 * l'ancien bloc Boutique / Vendre, en bas a droite. Actif quand le Heros est
 * selectionne ; un clic ouvre un petit panneau des batiments (nom, cout,
 * disponible ou non) ; choisir un batiment lance le mode de placement
 * existant (main.ts, requestPlaceBuilding). Donnees deja mises en forme par
 * main.ts.
 */
export interface BuildChoice {
  id: string;
  name: string;
  /** Cout lisible (« 20 or, 10 bois »). */
  cost: string;
  enabled: boolean;
  /** Raison d'indisponibilite. */
  hint?: string;
  /** Description courte (« Débloque la coupe des arbres »). */
  description?: string;
}

export class BuildMenu {
  private readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private shown = '';

  constructor(
    private readonly onToggle: () => void,
    private readonly onChoose: (buildingId: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'build-menu';
    this.panel = document.createElement('div');
    this.panel.className = 'build-menu-panel';
    this.panel.hidden = true;
    this.button = document.createElement('button');
    this.button.className = 'build-menu-button';
    this.button.textContent = 'Construire';
    this.button.addEventListener('click', () => this.onToggle());
    this.root.append(this.panel, this.button);
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.close();
  }

  /** Bouton actif (Heros selectionne et vivant) ; inactif, le panneau se ferme. */
  setEnabled(enabled: boolean, hint: string): void {
    this.button.disabled = !enabled;
    this.button.title = enabled ? 'Choisir un bâtiment à construire' : hint;
    if (!enabled) this.close();
  }

  isOpen(): boolean {
    return !this.panel.hidden;
  }

  open(choices: readonly BuildChoice[]): void {
    this.refresh(choices);
    this.panel.hidden = false;
    // Panneau AU-DESSUS du bouton (2026-11-02 : a sa gauche, il recouvrait la
    // barre des sorts), aligne sur son bord gauche ; sur son bord droit s'il
    // depasserait l'ecran (bouton deplace pres du bord droit).
    const button = this.button.getBoundingClientRect();
    this.root.classList.toggle('build-menu--align-right', button.left + this.panel.offsetWidth > innerWidth - 8);
    this.button.classList.add('build-menu-button--open');
  }

  close(): void {
    this.panel.hidden = true;
    this.button.classList.remove('build-menu-button--open');
  }

  /** Met a jour la liste (couts, disponibilite) sans la reconstruire si rien n'a change. */
  refresh(choices: readonly BuildChoice[]): void {
    const key = JSON.stringify(choices);
    if (key === this.shown) return;
    this.shown = key;
    this.panel.replaceChildren();
    const title = document.createElement('div');
    title.className = 'build-menu-title';
    title.textContent = 'Bâtiments';
    this.panel.appendChild(title);
    for (const choice of choices) {
      const item = document.createElement('button');
      item.className = 'build-menu-item';
      item.disabled = !choice.enabled;
      if (choice.hint) item.title = choice.hint;
      const name = document.createElement('span');
      name.className = 'build-menu-name';
      name.textContent = choice.name;
      const cost = document.createElement('span');
      cost.className = 'build-menu-cost';
      cost.textContent = choice.cost;
      item.append(name, cost);
      if (choice.description) {
        const description = document.createElement('span');
        description.className = 'build-menu-hint build-menu-description';
        description.textContent = choice.description;
        item.appendChild(description);
      }
      if (!choice.enabled && choice.hint) {
        const hint = document.createElement('span');
        hint.className = 'build-menu-hint';
        hint.textContent = choice.hint;
        item.appendChild(hint);
      }
      item.addEventListener('click', () => {
        if (!choice.enabled) return;
        this.close();
        this.onChoose(choice.id);
      });
      this.panel.appendChild(item);
    }
    if (choices.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'build-menu-hint';
      empty.textContent = 'Aucun bâtiment disponible';
      this.panel.appendChild(empty);
    }
  }
}
