import { WAVE_TRANSITION_CURTAIN_FADE_MS, WAVE_TRANSITION_HOLD_MS } from '../config/constants';

/**
 * Sequence de fin de vague (demande d'Antoine, 2026-08-09 : la bascule
 * bataille -> boutique etait instantanee, "trop brusque" — il fallait
 * "sequencer proprement les differentes phases de gameplay"). Voir
 * WAVE_TRANSITION_* dans config/constants.ts pour le detail des durees.
 *
 * Deux elements HTML plein ecran, purement en CSS (transitions d'opacite) —
 * aucun lien avec la simulation, comme le reste de l'interface :
 * - une banniere de texte qui apparait PAR-DESSUS le champ de bataille encore
 *   visible (le joueur voit un instant ses survivants tenir le terrain) ;
 * - un rideau noir qui se referme ensuite, recouvre la banniere au passage
 *   (z-index superieur), puis se rouvre sur l'ecran suivant.
 */
export class WaveTransition {
  private readonly banner: HTMLElement;
  private readonly curtain: HTMLElement;

  constructor() {
    this.banner = document.createElement('div');
    this.banner.className = 'wave-transition-banner';
    document.body.appendChild(this.banner);

    this.curtain = document.createElement('div');
    this.curtain.className = 'wave-transition-curtain';
    document.body.appendChild(this.curtain);
  }

  /**
   * Joue la sequence complete. `onBlackout` est appele exactement au moment
   * ou l'ecran est plein noir : c'est la qu'il faut vider le champ de
   * bataille et afficher l'ecran suivant (boutique, fin de vague, game over),
   * invisible pour le joueur au moment ou ca se produit.
   *
   * `onBlackout` peut desormais renvoyer une Promise (2026-08-18,
   * agrandissement progressif de la map entre deux vagues : reconstruire le
   * plateau visuel implique un `await`, meme sur des assets deja en cache) —
   * le rideau n'est rouvert qu'UNE FOIS cette promesse resolue, pour qu'aucune
   * reconstruction ne puisse jamais transparaitre a l'ecran. Un appelant
   * SYNCHRONE (qui ne renvoie rien) n'est pas affecte : `Promise.resolve(undefined)`
   * se resout sur le microtask suivant, le rideau se rouvre donc toujours au
   * meme instant logique qu'avant.
   */
  play(label: string, onBlackout: () => void | Promise<void>): void {
    this.banner.textContent = label;
    // Repart de 0 avant de reafficher : au cas ou une vague s'enchainerait
    // plus vite que la sequence precedente n'a fini de se nettoyer (forcer un
    // reflow entre les deux relance bien la transition CSS au lieu de rester
    // bloque a opacite 1 si la classe n'a jamais ete retiree).
    this.banner.classList.remove('wave-transition-banner--visible');
    void this.banner.offsetWidth;
    this.banner.classList.add('wave-transition-banner--visible');

    setTimeout(() => {
      this.curtain.classList.add('wave-transition-curtain--visible');

      setTimeout(() => {
        this.banner.classList.remove('wave-transition-banner--visible');
        void Promise.resolve(onBlackout()).then(() => {
          this.curtain.classList.remove('wave-transition-curtain--visible');
        });
      }, WAVE_TRANSITION_CURTAIN_FADE_MS);
    }, WAVE_TRANSITION_HOLD_MS);
  }
}
