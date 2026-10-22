/**
 * Population du joueur, « 7 / 15 », juste au-dessus de l'or (voir
 * goldHud.ts) : meme colonne, meme cycle de vie (preparation et bataille).
 * Mise a jour a chaque image depuis main.ts ; le DOM n'est reecrit que si
 * une valeur change. Un depassement (Maison detruite, unites conservees)
 * s'affiche en couleur d'alerte, par exemple « 14 / 10 ».
 */
export class PopulationHud {
  private readonly root: HTMLElement;
  private readonly amountEl: HTMLElement;
  private shown = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'population-hud';
    this.root.title = 'Population : unités du joueur / maximum (+5 par Maison)';

    const label = document.createElement('span');
    label.className = 'population-hud-label';
    label.textContent = 'Pop.';

    this.amountEl = document.createElement('span');
    this.amountEl.className = 'population-hud-amount';

    this.root.append(label, this.amountEl);
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  update(used: number, max: number): void {
    const text = `${used} / ${max}`;
    if (text === this.shown) return;
    this.shown = text;
    this.amountEl.textContent = text;
    this.root.classList.toggle('population-hud--full', used === max);
    this.root.classList.toggle('population-hud--over', used > max);
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }
}
