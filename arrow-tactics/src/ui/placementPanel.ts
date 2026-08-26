export interface PlacementPanelHandlers {
  onValidate: () => void;
}

/**
 * Bandeau de la phase de placement : le bouton qui lance la bataille. La
 * selection et le deplacement se font directement sur les unites 3D (voir
 * main.ts) — ce panneau ne fait qu'exposer l'action de lancer la bataille.
 * Le rappel textuel du geste (cliquer/glisser/encadrer) a ete retire
 * (2026-08-10, demande d'Antoine) : jugee inutile passe la premiere
 * decouverte, la manipulation directe sur les unites 3D se comprend seule.
 */
export class PlacementPanel {
  private readonly root: HTMLElement;

  constructor(handlers: PlacementPanelHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'placement-panel';

    const validate = document.createElement('button');
    validate.type = 'button';
    validate.className = 'placement-validate';
    // Libelle sobre (2026-08-10, demande d'Antoine, remplace "Valider le
    // placement") — le controle de securite sur l'or non depense (voir
    // main.ts, requestValidatePlacement) reste hors de ce composant : ce
    // bouton relaie juste le clic, la decision d'avertir ou non appartient a
    // l'appelant.
    validate.textContent = 'Prêt pour la bataille';
    validate.addEventListener('click', () => handlers.onValidate());
    this.root.appendChild(validate);

    document.body.appendChild(this.root);
    this.hide();
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
  }
}
