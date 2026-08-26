import { createCoinIcon } from './pixelIcon';

/**
 * Affichage PERMANENT de l'or possédé (2026-08-11, demande d'Antoine :
 * "nous devons les voir tout du long de la partie à côté de la fenêtre
 * boutique et en temps réel... représenté par une petite pièce dans sa
 * fenêtre") — visible pendant le placement ET la bataille, mis à jour
 * inconditionnellement à chaque frame (voir main.ts) plutôt que sur
 * événement : aucun risque d'oublier un site d'appel après un achat, une
 * vente, ou un kill (voir run/runState.ts, awardKillGold, versé en temps
 * réel pendant la bataille).
 *
 * Positionné au-dessus du bloc Boutique/Vendre (voir sellZone.ts,
 * `.sell-zone-container`, bottom:16px) — même coin, "à côté de la fenêtre
 * boutique". Même cycle de vie que WaveIndicator : visible dès
 * `startPlacement`, masqué à `quitToMenu`/fin de run.
 */
export class GoldHud {
  private readonly root: HTMLElement;
  private readonly amountEl: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'gold-hud';

    const icon = createCoinIcon(20);
    icon.classList.add('gold-hud-icon');

    this.amountEl = document.createElement('span');
    this.amountEl.className = 'gold-hud-amount';

    this.root.append(icon, this.amountEl);
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  update(gold: number): void {
    // Toujours 1 décimale (2026-08-14, correctif demandé par Antoine) :
    // String(gold) affichait tantôt "15" tantôt "15.1" selon que l'or
    // tombe pile sur un multiple de 0.1 affichable sans reste — l'encart
    // (largeur auto, ancré à right:16px) se rétrécissait/élargissait donc
    // brusquement à chaque tick, surtout avec le revenu continu de la mine
    // (voir run/runState.ts, roundGold). toFixed(1) garde une largeur de
    // texte stable.
    this.amountEl.textContent = gold.toFixed(1);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }
}
