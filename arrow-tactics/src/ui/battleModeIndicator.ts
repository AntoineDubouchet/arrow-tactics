export type BattleControlMode = 'ballista' | 'command';

const LABELS: Record<BattleControlMode, string> = {
  ballista: 'Mode : Baliste',
  command: 'Mode : Commandement',
};

/**
 * Indicateur provisoire du contexte de controle pendant la bataille
 * (prototype RTS). Un seul element HTML, mis a jour seulement quand
 * l'etat affiche change.
 */
export class BattleModeIndicator {
  private readonly root: HTMLElement;
  private shownMode: BattleControlMode | null = null;
  private shownVisible = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'battle-mode-indicator';
    document.body.appendChild(this.root);
    this.root.style.display = 'none';
  }

  update(visible: boolean, mode: BattleControlMode): void {
    if (visible !== this.shownVisible) {
      this.shownVisible = visible;
      this.root.style.display = visible ? '' : 'none';
    }
    if (mode !== this.shownMode) {
      this.shownMode = mode;
      this.root.textContent = `${LABELS[mode]} — B pour basculer`;
      this.root.classList.toggle('battle-mode-indicator--command', mode === 'command');
    }
  }
}
