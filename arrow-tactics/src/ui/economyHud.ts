/**
 * Ligne economique permanente (2026-11-02), tout en haut a droite : bois,
 * pierre et or STOCKES (seuls utilisables pour payer : ce que le Heros porte
 * n'y figure pas), population utilisee / maximum. Remplace le compteur FPS
 * (desormais en mode debug), l'or et la population separes, le stock du HUD
 * du Heros. Mise a jour a chaque frame, DOM touche seulement si une valeur
 * change.
 */
export interface EconomyState {
  wood: number;
  stone: number;
  /** Or stocke, deja formate (formatGold). */
  gold: string;
  popUsed: number;
  popMax: number;
}

export class EconomyHud {
  private readonly root: HTMLElement;
  private readonly values = new Map<keyof EconomyState | 'pop', HTMLElement>();
  private shown = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'economy-hud';
    const entries: [key: 'wood' | 'stone' | 'gold' | 'pop', label: string, title: string][] = [
      ['wood', 'Bois', 'Bois du joueur : crédité dès la récolte ou le ramassage'],
      ['stone', 'Pierre', 'Pierre du joueur : créditée dès la récolte ou le ramassage'],
      ['gold', 'Or', 'Or du joueur (monnaie) : tas ramassés d’un clic, gisements d’or, Mines'],
      ['pop', 'Pop.', 'Population : unités du joueur / maximum (+5 par Maison)'],
    ];
    for (const [key, label, title] of entries) {
      const item = document.createElement('span');
      item.className = `economy-hud-item economy-hud-item--${key}`;
      item.title = title;
      const icon = document.createElement('i');
      icon.className = `economy-hud-icon economy-hud-icon--${key}`;
      const value = document.createElement('b');
      value.className = 'economy-hud-value';
      item.append(icon, `${label} `, value);
      this.values.set(key, value);
      this.root.appendChild(item);
    }
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  update(state: EconomyState): void {
    const key = `${state.wood}|${state.stone}|${state.gold}|${state.popUsed}|${state.popMax}`;
    if (key === this.shown) return;
    this.shown = key;
    this.values.get('wood')!.textContent = String(state.wood);
    this.values.get('stone')!.textContent = String(state.stone);
    this.values.get('gold')!.textContent = state.gold;
    this.values.get('pop')!.textContent = `${state.popUsed} / ${state.popMax}`;
    this.root.classList.toggle('economy-hud--pop-full', state.popUsed >= state.popMax);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Ancre de l'animation de gain / perte d'or (ui/coinPopup.ts) : la
   *  valeur d'or de la ligne. */
  get goldElement(): HTMLElement {
    return this.values.get('gold')!;
  }
}
