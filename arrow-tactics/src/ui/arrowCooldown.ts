import { PLAYER_ARROW_COOLDOWN } from '../config/constants';
import { clamp } from '../core/math';

/**
 * Indicateur minimaliste du cooldown de la fleche du joueur : une barre qui
 * se remplit, visible seulement pendant la bataille. Le reticule de vise
 * (voir main.ts) donne deja un retour immediat (opacite reduite hors
 * cooldown) ; cette barre ajoute une estimation du temps restant, utile pour
 * anticiper le prochain tir sans avoir a fixer le reticule.
 */
export class ArrowCooldownIndicator {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'arrow-cooldown';
    this.fill = document.createElement('div');
    this.fill.className = 'arrow-cooldown-fill';
    this.root.appendChild(this.fill);
    document.body.appendChild(this.root);
  }

  update(cooldown: number): void {
    const ratio = 1 - clamp(cooldown / PLAYER_ARROW_COOLDOWN, 0, 1);
    this.fill.style.width = `${ratio * 100}%`;
    this.root.classList.toggle('arrow-cooldown--ready', cooldown <= 0);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}
