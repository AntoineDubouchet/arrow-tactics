import { TALENT_POINT_TOAST_DURATION_MS } from '../config/constants';
import { listFounderTalents } from '../data/talents';

/**
 * Toast discret et auto-disparaissant (demande d'Antoine, 2026-08-10 :
 * "afficher un message, une pop-up lorsqu'un nouveau point de talent est
 * disponible") — bandeau en haut de l'ecran, choisi plutot qu'une modale a
 * fermer pour ne pas interrompre le sequencement bataille -> boutique deja en
 * place (voir waveTransition.ts). Element unique cree une fois (meme pattern
 * que WaveIndicator/WaveTransition), jamais recree — un nouvel appel a
 * show() pendant que le toast precedent est encore visible relance juste sa
 * propre transition (forcer un reflow), au lieu d'empiler plusieurs bandeaux.
 *
 * Message enrichi en deux lignes (2026-08-14, demande d'Antoine : "le
 * premier point de talent ne m'est pas notifié, il faudrait qu'il soit
 * notifié avec un message indiquant d'aller le dépenser dans 'arbre de
 * talent' dans le menu principal, et faisant un bref résumé de l'arbre de
 * talent") — la premiere ligne reste le titre existant, la seconde ajoute la
 * direction ("Arbre de talents", menu principal) et un resume DERIVE de
 * data/talents.ts (listFounderTalents) plutot qu'une liste recopiee a la
 * main, qui aurait pu diverger du vrai contenu de l'arbre au premier talent
 * ajoute/retire.
 */
export class TalentPointToast {
  private readonly el: HTMLElement;
  private readonly headlineEl: HTMLElement;
  private readonly detailEl: HTMLElement;
  private hideTimer: number | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'talent-point-toast';

    this.headlineEl = document.createElement('div');
    this.headlineEl.className = 'talent-point-toast-headline';
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'talent-point-toast-detail';
    this.el.append(this.headlineEl, this.detailEl);

    document.body.appendChild(this.el);
  }

  /** `count` = nombre de points gagnes d'un coup (peut valoir 2 si le point
   *  "premiere run" et un seuil de vague tombent sur la meme fin de bataille,
   *  voir main.ts) — le texte s'accorde en consequence. */
  show(count: number): void {
    if (count <= 0) return;

    this.headlineEl.textContent = `+${count} point${count > 1 ? 's' : ''} de talent disponible${count > 1 ? 's' : ''} !`;
    const founderNames = listFounderTalents()
      .map((t) => t.name)
      .join(', ');
    this.detailEl.textContent = `À dépenser dans « Arbre de talents » (menu principal) — ${founderNames}.`;

    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.el.classList.remove('talent-point-toast--visible');
    void this.el.offsetWidth;
    this.el.classList.add('talent-point-toast--visible');

    this.hideTimer = window.setTimeout(() => {
      this.el.classList.remove('talent-point-toast--visible');
      this.hideTimer = null;
    }, TALENT_POINT_TOAST_DURATION_MS);
  }
}
