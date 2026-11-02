/**
 * Barre d'action globale (2026-11-02) : avancement de l'action en cours
 * (sort, ramassage, recolte, depot, construction, reparation, ouverture d'un
 * coffre...), centree en bas de l'ecran juste au-dessus de la barre d'XP,
 * independante de l'encart du Heros (future source : interactions,
 * batiments). Sans nature de l'action : seulement la duree. Mise a jour a
 * chaque image par main.ts.
 */
export interface ActionProgress {
  /** Avancement 0..1. */
  progress: number;
  /** Secondes restantes. */
  remaining: number;
}

export class ActionProgressBar {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly text: HTMLElement;
  private visible = false;

  constructor() {
    this.root = document.createElement('div');
    // `hero-progress` : nom historique garde (styles, outils de test).
    this.root.className = 'action-progress hero-progress';
    this.fill = document.createElement('div');
    this.fill.className = 'hero-progress-fill';
    this.text = document.createElement('div');
    this.text.className = 'hero-progress-text';
    this.root.append(this.fill, this.text);
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.root.hidden = true;
  }

  update(action: ActionProgress | null): void {
    this.root.hidden = !this.visible || action === null;
    if (!action) return;
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, action.progress)) * 1000) / 10}%`;
    this.text.textContent = `${Math.max(0, action.remaining).toFixed(1).replace('.', ',')} s`;
  }
}
