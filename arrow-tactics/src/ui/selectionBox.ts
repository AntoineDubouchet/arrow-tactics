export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Rectangle de selection multiple pendant la phase de placement (demande
 * d'Antoine, 2026-08-08 : "encadrer un groupe d'unites", meme mecanique que
 * dans un jeu de stratégie classique type Age of Empire). Purement visuel —
 * la logique de "qui est dedans" reste dans main.ts (projection des unites a
 * l'ecran, voir worldToScreen), ce composant ne fait que dessiner le
 * rectangle HTML entre le point de depart du glisser et la position actuelle
 * de la souris.
 */
export class SelectionBox {
  private readonly root: HTMLElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'selection-box';
    document.body.appendChild(this.root);
  }

  show(): void {
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  update(startX: number, startY: number, currentX: number, currentY: number): void {
    const rect = this.toRect(startX, startY, currentX, currentY);
    this.root.style.left = `${rect.left}px`;
    this.root.style.top = `${rect.top}px`;
    this.root.style.width = `${rect.right - rect.left}px`;
    this.root.style.height = `${rect.bottom - rect.top}px`;
  }

  toRect(startX: number, startY: number, currentX: number, currentY: number): ScreenRect {
    return {
      left: Math.min(startX, currentX),
      top: Math.min(startY, currentY),
      right: Math.max(startX, currentX),
      bottom: Math.max(startY, currentY),
    };
  }
}
