/**
 * Indicateur permanent "Vague N" (2026-08-10, demande d'Antoine : "afficher
 * les differentes vagues d'ennemi, actuelle et terminee"). Visible pendant
 * le placement ET la bataille (voir main.ts, startPlacement/quitToMenu) —
 * la banniere de fin de vague (Screens.showWaveComplete) affiche deja le
 * numero de la vague qui vient d'etre jouee ; ceci couvre le "actuelle",
 * consultable a tout moment sans attendre la fin de la vague.
 */
export class WaveIndicator {
  private readonly root: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'wave-indicator';
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  update(waveNumber: number): void {
    this.root.textContent = `Vague ${waveNumber}`;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
