/**
 * Petite etiquette HTML posee au-dessus d'un point du monde (2026-11-02 :
 * tas de ressources selectionne, « Bois — 3 »). main.ts fournit la position
 * ecran a chaque frame ; aucun etat de jeu lu ici.
 */
export class WorldLabel {
  private readonly root: HTMLElement;
  private text = '';

  constructor(className: string) {
    this.root = document.createElement('div');
    this.root.className = `world-label ${className}`;
    this.root.hidden = true;
    document.body.appendChild(this.root);
  }

  show(text: string, screenX: number, screenY: number): void {
    if (text !== this.text) {
      this.text = text;
      this.root.textContent = text;
    }
    this.root.style.transform = `translate(${Math.round(screenX)}px, ${Math.round(screenY)}px) translate(-50%, -100%)`;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
