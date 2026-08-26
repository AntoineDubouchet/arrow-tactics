export interface SellZoneHandlers {
  /** Bouton "Boutique", place juste au-dessus de "Vendre" (demande d'Antoine,
   *  2026-08-08) : ouvre la boutique SANS quitter le placement en cours — les
   *  achats n'y comptent que pour la manche suivante (voir main.ts,
   *  openShopFromPlacement). */
  onOpenShop: () => void;
  /** Clic direct sur "Vendre" (2026-08-14, demande d'Antoine, points 28-31 :
   *  "je veux désormais aussi pouvoir sélectionner une ou plusieurs unités
   *  puis cliquer sur le bouton Vendre") — vend la selection COURANTE,
   *  n'importe laquelle (main.ts lit selectedIndices au moment du clic).
   *  Ne fait rien si rien n'est selectionne (voir setSelection, qui desactive
   *  visuellement le bouton dans ce cas). */
  onSellSelection: () => void;
}

/**
 * Coin bas-droite de l'ecran pendant la phase de placement : bouton
 * "Boutique" (toujours visible) empile au-dessus de l'onglet "Vendre" (idem).
 * Vendre : clic maintenu sur une unite puis glisser jusqu'ici pour la vendre.
 * Le fantome qui suit le curseur pendant le glisser est un simple texte HTML
 * semi-transparent (pas un mesh 3D) — la regle "aucun asset graphique" du
 * projet n'a pas besoin d'etre contournee pour un retour visuel aussi
 * simple, et ca reste au-dessus du canvas comme tout le reste de l'UI.
 */
export class SellZone {
  private readonly container: HTMLElement;
  private readonly dropZone: HTMLElement;
  private readonly label: HTMLElement;
  private readonly amount: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly shopButton: HTMLButtonElement;
  private hasSelection = false;

  constructor(handlers: SellZoneHandlers) {
    this.container = document.createElement('div');
    this.container.className = 'sell-zone-container';

    this.shopButton = document.createElement('button');
    this.shopButton.type = 'button';
    this.shopButton.className = 'shop-button';
    this.shopButton.textContent = 'Boutique';
    this.shopButton.addEventListener('click', handlers.onOpenShop);
    this.container.appendChild(this.shopButton);

    this.dropZone = document.createElement('div');
    this.dropZone.className = 'sell-zone';
    // Reste un simple clic maintenu+glisse (drop target) ET desormais aussi
    // un bouton cliquable direct (2026-08-14, points 28-31 de la demande) —
    // toujours un <div>, pas un <button> : deja utilise comme zone de drop
    // avant cette demande, un vrai <button> aurait complique le geste de
    // glisser existant (drag sur un <button> se comporte differemment selon
    // les navigateurs). `setSelection` desactive l'apparence/le clic quand
    // rien n'est selectionne, meme intention qu'un bouton disabled.
    this.dropZone.addEventListener('click', () => {
      if (this.hasSelection) handlers.onSellSelection();
    });
    this.label = document.createElement('div');
    this.label.className = 'sell-zone-label';
    this.label.textContent = 'Vendre';
    this.amount = document.createElement('div');
    this.amount.className = 'sell-zone-amount';
    this.dropZone.append(this.label, this.amount);
    this.container.appendChild(this.dropZone);

    document.body.appendChild(this.container);
    this.setVisible(false);

    this.ghost = document.createElement('div');
    this.ghost.className = 'sell-ghost';
    document.body.appendChild(this.ghost);
    this.hideGhost();
  }

  /** Reflete la selection courante (2026-08-14, points 28-29 de la demande :
   *  "VENDRE (5)" + montant total optionnel) — appelee a chaque
   *  rafraichissement de l'apercu de placement (voir main.ts,
   *  refreshPlayerPreview), jamais depuis un site d'appel individuel. `count`
   *  = 0 dimme/desactive visuellement le bouton ET son clic (voir le listener
   *  du constructeur). */
  setSelection(count: number, totalValue: number): void {
    this.hasSelection = count > 0;
    this.dropZone.classList.toggle('sell-zone--inactive', count === 0);
    if (count === 0) {
      this.label.textContent = 'Vendre';
      this.amount.textContent = '';
    } else {
      this.label.textContent = count === 1 ? 'Vendre (1)' : `Vendre (${count})`;
      this.amount.textContent = `+${totalValue} or`;
    }
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'flex' : 'none';
  }

  /** Pendant la bataille (2026-08-14, demande d'Antoine) : "Boutique"/"Vendre"
   *  restent visibles mais inutilisables plutot que de disparaitre entierement
   *  — bouton grise et desactive, glisser-vendre neutralise via
   *  pointer-events (aucune unite posee n'existe de toute facon en bataille,
   *  mais garde-fou explicite plutot qu'implicite). */
  setEnabled(enabled: boolean): void {
    this.shopButton.disabled = !enabled;
    this.container.classList.toggle('sell-zone-container--disabled', !enabled);
  }

  /** Active visuellement la zone quand une unité est en train d'être
   *  glissée au-dessus, pour confirmer que le lâcher la vendra bien. */
  setArmed(armed: boolean): void {
    this.dropZone.classList.toggle('sell-zone--armed', armed);
  }

  showGhost(label: string): void {
    this.ghost.textContent = label;
    this.ghost.style.display = 'block';
  }

  hideGhost(): void {
    this.ghost.style.display = 'none';
  }

  moveGhost(clientX: number, clientY: number): void {
    this.ghost.style.left = `${clientX}px`;
    this.ghost.style.top = `${clientY}px`;
  }

  isPointOver(clientX: number, clientY: number): boolean {
    const rect = this.dropZone.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  get element(): HTMLElement {
    return this.dropZone;
  }
}
