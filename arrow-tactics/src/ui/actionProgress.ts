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

/** Une barre de progression : meme markup et memes classes pour l'action du
 *  Heros et pour l'ordre courant d'une file de production (2026-11-05, G47). */
export interface ProgressBarRefs {
  root: HTMLElement;
  fill: HTMLElement;
  text: HTMLElement;
}

/** `className` : placement de la barre ; `span` : elle peut vivre dans un bouton. */
export function createProgressBar(className: string): ProgressBarRefs {
  const root = document.createElement('span');
  root.className = `progress-track ${className}`;
  const fill = document.createElement('span');
  fill.className = 'hero-progress-fill';
  const text = document.createElement('span');
  text.className = 'hero-progress-text';
  root.append(fill, text);
  return { root, fill, text };
}

export function setProgressBar(bar: ProgressBarRefs, action: ActionProgress): void {
  bar.fill.style.width = `${Math.round(Math.min(1, Math.max(0, action.progress)) * 1000) / 10}%`;
  bar.text.textContent = `${Math.max(0, action.remaining).toFixed(1).replace('.', ',')} s`;
}

export class ActionProgressBar {
  private readonly bar: ProgressBarRefs;
  private readonly root: HTMLElement;
  private visible = false;

  constructor() {
    // `hero-progress` : nom historique garde (styles, outils de test).
    this.bar = createProgressBar('action-progress hero-progress');
    this.root = this.bar.root;
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.root.hidden = true;
  }

  update(action: ActionProgress | null): void {
    this.root.hidden = !this.visible || action === null;
    if (action) setProgressBar(this.bar, action);
  }
}
