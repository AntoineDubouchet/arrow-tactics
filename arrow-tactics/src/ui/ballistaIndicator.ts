import { clamp } from '../core/math';

/** Etat de la Baliste affiche pendant la bataille. `reloading` : temps de
 *  recharge restant et duree totale de la recharge en cours (secondes de
 *  simulation), pour le texte et la barre. `inFlight` : recharge terminee
 *  mais volee precedente encore en vol, ce qui bloque aussi le tir (voir
 *  sim/playerArrow.ts). */
export type BallistaStatus =
  | { kind: 'ready' }
  | { kind: 'reloading'; cooldownSeconds: number; totalSeconds: number }
  | { kind: 'inFlight' }
  | { kind: 'destroyed' };

const STATE_LABELS: Record<Exclude<BallistaStatus['kind'], 'reloading'>, string> = {
  ready: 'PRÊTE',
  inFlight: 'EN VOL',
  destroyed: 'DÉTRUITE',
};

/**
 * HUD unique de la Baliste pendant la bataille (tir sur Q), en bas au
 * centre : "[Q] BALISTE — <etat>", une barre de recharge integree (pleine
 * quand la Baliste est prete ou en vol, vide si elle est detruite) et, en
 * dessous, discretement, le nombre d'unites selectionnees. Les elements
 * HTML ne sont modifies que lorsque leur valeur affichee change (texte au
 * dixieme de seconde, barre au demi-pourcent).
 */
export class BallistaIndicator {
  private readonly root: HTMLElement;
  private readonly state: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly selection: HTMLElement;
  private shownVisible = false;
  private shownState = '';
  private shownFill = -1;
  private shownSelection = '';
  private shownKind: BallistaStatus['kind'] | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'ballista-indicator';

    const line = document.createElement('div');
    line.className = 'ballista-indicator-line';
    line.textContent = '[Q] BALISTE — ';
    this.state = document.createElement('span');
    this.state.className = 'ballista-indicator-state';
    line.appendChild(this.state);

    const bar = document.createElement('div');
    bar.className = 'ballista-indicator-bar';
    this.fill = document.createElement('div');
    this.fill.className = 'ballista-indicator-fill';
    bar.appendChild(this.fill);

    this.selection = document.createElement('div');
    this.selection.className = 'ballista-indicator-selection';

    this.root.append(line, bar, this.selection);
    document.body.appendChild(this.root);
    this.root.style.display = 'none';
  }

  update(visible: boolean, status: BallistaStatus, selectedCount: number): void {
    if (visible !== this.shownVisible) {
      this.shownVisible = visible;
      this.root.style.display = visible ? '' : 'none';
    }
    if (!visible) return;

    const state =
      status.kind === 'reloading'
        ? `${Math.max(0.1, Math.ceil(status.cooldownSeconds * 10) / 10).toFixed(1)} s`
        : STATE_LABELS[status.kind];
    if (state !== this.shownState) {
      this.shownState = state;
      this.state.textContent = state;
    }

    const ratio =
      status.kind === 'reloading'
        ? 1 - clamp(status.cooldownSeconds / Math.max(status.totalSeconds, 1e-6), 0, 1)
        : status.kind === 'destroyed'
          ? 0
          : 1;
    const fill = Math.round(ratio * 200) / 2;
    if (fill !== this.shownFill) {
      this.shownFill = fill;
      this.fill.style.width = `${fill}%`;
    }

    const selection = selectedCount > 0 ? `${selectedCount} sélectionnée${selectedCount > 1 ? 's' : ''}` : '';
    if (selection !== this.shownSelection) {
      this.shownSelection = selection;
      this.selection.textContent = selection;
      this.selection.style.display = selection ? '' : 'none';
    }

    if (status.kind !== this.shownKind) {
      this.shownKind = status.kind;
      for (const kind of ['ready', 'reloading', 'inFlight', 'destroyed'] as const) {
        this.root.classList.toggle(`ballista-indicator--${kind}`, status.kind === kind);
      }
    }
  }
}
