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
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly notice: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'wave-indicator';
    this.title = document.createElement('span');
    this.detail = document.createElement('span');
    this.detail.className = 'wave-indicator-detail';
    this.notice = document.createElement('div');
    this.notice.className = 'wave-indicator-notice';
    this.root.append(this.title, this.detail, this.notice);
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  /** `detail` : ligne compacte facultative (total et groupes de la vague,
   *  renforts restants). */
  update(waveNumber: number, detail?: string): void {
    this.title.textContent = `Vague ${waveNumber}`;
    this.detail.textContent = detail ? ` · ${detail}` : '';
  }

  /** Message bref sous l'indicateur (arrivee de renforts), en fondu CSS :
   *  ni popup, ni interruption. */
  flash(message: string): void {
    this.notice.textContent = message;
    this.notice.classList.remove('wave-indicator-notice--visible');
    void this.notice.offsetWidth;
    this.notice.classList.add('wave-indicator-notice--visible');
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
