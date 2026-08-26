import { UNIT_UNLOCK_TOAST_DURATION_MS } from '../config/constants';

/**
 * Toast discret et non-bloquant (2026-08-15, demande d'Antoine, point 26 :
 * "quand une unité est vaincue pour la première fois, affiche un petit
 * message... pas une grosse popup interrompant le combat, un toast suffit")
 * — declenche des qu'une unite ennemie dont `playerUnlockMode === 'defeatEnemy'`
 * meurt pour la PREMIERE FOIS (voir main.ts, registerEnemyDefeat). Meme
 * patron que TalentPointToast (element unique cree une fois, jamais recree,
 * une classe CSS bascule le fondu d'entree/sortie) mais volontairement plus
 * simple : une seule ligne, pas de resume.
 */
export class UnitUnlockToast {
  private readonly el: HTMLElement;
  private hideTimer: number | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'unit-unlock-toast';
    document.body.appendChild(this.el);
  }

  show(unitName: string): void {
    this.el.textContent = `Nouvelle unité débloquée : ${unitName.toUpperCase()}`;

    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.el.classList.remove('unit-unlock-toast--visible');
    void this.el.offsetWidth;
    this.el.classList.add('unit-unlock-toast--visible');

    this.hideTimer = window.setTimeout(() => {
      this.el.classList.remove('unit-unlock-toast--visible');
      this.hideTimer = null;
    }, UNIT_UNLOCK_TOAST_DURATION_MS);
  }
}
