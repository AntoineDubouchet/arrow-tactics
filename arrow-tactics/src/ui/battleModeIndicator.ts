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
  private shownCount = -1;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'battle-mode-indicator';
    document.body.appendChild(this.root);
    this.root.style.display = 'none';
  }

  /** `selectedCount` : nombre d'unites selectionnees, affiche seulement en
   *  mode Commandement. */
  update(visible: boolean, mode: BattleControlMode, selectedCount: number): void {
    if (visible !== this.shownVisible) {
      this.shownVisible = visible;
      this.root.style.display = visible ? '' : 'none';
    }
    if (mode !== this.shownMode || selectedCount !== this.shownCount) {
      this.shownMode = mode;
      this.shownCount = selectedCount;
      const count = mode === 'command' && selectedCount > 0 ? ` — ${selectedCount} sélectionnée${selectedCount > 1 ? 's' : ''}` : '';
      this.root.textContent = `${LABELS[mode]}${count} — B pour basculer`;
      this.root.classList.toggle('battle-mode-indicator--command', mode === 'command');
    }
  }
}
