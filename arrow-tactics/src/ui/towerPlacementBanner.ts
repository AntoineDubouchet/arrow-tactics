/**
 * Bannière d'instruction affichée UNIQUEMENT pendant le placement
 * OBLIGATOIRE de la tour/Baliste au tout début d'une run (2026-08-18,
 * demande explicite d'Antoine : "afficher un message clair au joueur...
 * visible, simple, propre, non ambigu") — même patron que
 * BuildingRotationHint/WaveIndicator (un seul élément créé une fois,
 * jamais recréé, juste montré/caché), mais un style plus PROMINENT (voir
 * ui/style.css, `.tower-placement-banner`) puisqu'il s'agit ici d'une
 * instruction bloquante, pas d'un simple rappel discret.
 */
export class TowerPlacementBanner {
  private readonly root: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'tower-placement-banner';
    this.root.textContent = 'Placez votre tour dans votre zone de spawn.';
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
