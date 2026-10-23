/**
 * Petit rappel discret affiche UNIQUEMENT pendant un placement de batiment
 * (2026-08-17, demande explicite d'Antoine : "affiche une petite indication
 * discrete" pour signaler Ctrl+molette = rotation 45°) — meme patron que
 * WaveIndicator (un seul element cree une fois, jamais recree, juste
 * montre/cache). Masque par defaut, jamais visible en dehors du mode de
 * placement de batiment (voir main.ts, requestPlaceBuilding/
 * cancelBuildingPlacement/confirmBuildingPlacement).
 */
export class BuildingRotationHint {
  private readonly root: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'building-rotation-hint';
    this.root.textContent = 'Ctrl + molette — tourner (45°)';
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  /** Texte de l'indication (rotation, ou etape et cout d'une ligne de
   *  murailles). */
  setText(text: string): void {
    this.root.textContent = text;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
