import { EQUIPMENT_ARCHETYPES, EQUIPMENT_SLOTS, EQUIPMENT_STAT_DEFS, RARITIES } from '../data/equipment';
import type { WaveRewardChoice } from '../run/waveRewards';

/**
 * Recompense de vague (2026-11-05, G46) : petit panneau non bloquant
 * « Récompense de vague N » avec deux cartes (nom, niveau, emplacement,
 * orientation, stats principales). La partie continue ; le joueur clique
 * quand il veut. Un clic sur une carte choisit l'item ; sac plein : les
 * cartes restent affichees avec « Inventaire plein », rien n'est perdu.
 * Element unique cree une fois (meme pattern que les autres panneaux) ; le
 * contenu n'est reconstruit que si la recompense affichee change.
 */
export interface WaveRewardView {
  wave: number;
  choices: readonly WaveRewardChoice[];
  /** Nombre de recompenses encore en file apres celle-ci. */
  queued: number;
  inventoryFull: boolean;
}

export class WaveRewardPanel {
  private readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly cardsEl: HTMLElement;
  private readonly footEl: HTMLElement;
  private key = '';

  constructor(private readonly onChoose: (choice: WaveRewardChoice, wave: number) => void) {
    this.el = document.createElement('div');
    this.el.className = 'wave-reward';
    this.el.hidden = true;
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'wave-reward-title';
    this.cardsEl = document.createElement('div');
    this.cardsEl.className = 'wave-reward-cards';
    this.footEl = document.createElement('div');
    this.footEl.className = 'wave-reward-foot';
    this.el.append(this.titleEl, this.cardsEl, this.footEl);
    document.body.appendChild(this.el);
  }

  isVisible(): boolean {
    return !this.el.hidden;
  }

  /** Chaque image : null masque le panneau. */
  sync(view: WaveRewardView | null): void {
    if (!view) {
      if (!this.el.hidden) this.el.hidden = true;
      this.key = '';
      return;
    }
    const key = `${view.wave}:${view.choices.map((c) => `${c.itemId}@${c.level}`).join(',')}:${view.queued}:${view.inventoryFull}`;
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = false;
    this.titleEl.textContent = `Récompense de vague ${view.wave}`;
    this.cardsEl.replaceChildren(...view.choices.map((c) => this.card(c, view)));
    this.footEl.textContent = view.inventoryFull ? 'Inventaire plein : libérez une case pour choisir.' : view.queued > 0 ? `Choisissez un équipement · ${view.queued} récompense${view.queued > 1 ? 's' : ''} en attente ensuite` : 'Choisissez un équipement';
    this.footEl.classList.toggle('wave-reward-foot--full', view.inventoryFull);
  }

  private card(c: WaveRewardChoice, view: WaveRewardView): HTMLElement {
    const rarity = RARITIES[c.def.rarity];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wave-reward-card';
    card.dataset['itemId'] = c.itemId;
    card.dataset['level'] = String(c.level);
    card.style.setProperty('--rarity', rarity.color);
    card.disabled = view.inventoryFull;
    const name = document.createElement('div');
    name.className = 'wave-reward-card-name';
    name.textContent = c.def.name;
    name.style.color = rarity.color;
    const meta = document.createElement('div');
    meta.className = 'wave-reward-card-meta';
    meta.textContent = `Niveau ${c.level} · ${EQUIPMENT_SLOTS[c.def.slot].label} · ${EQUIPMENT_ARCHETYPES[c.def.archetype]}`;
    const stats = document.createElement('ul');
    stats.className = 'wave-reward-card-stats';
    for (const def of EQUIPMENT_STAT_DEFS) {
      const v = c.stats[def.key];
      if (!v) continue;
      const li = document.createElement('li');
      const n = String(Math.round(v * 100) / 100).replace('.', ',');
      li.textContent = `${v > 0 ? '+' : ''}${n}${def.unit === '%' ? ' %' : ''} ${def.label}`;
      stats.appendChild(li);
    }
    const fire = c.def.effects.onHit?.fireDamage;
    if (fire) {
      const li = document.createElement('li');
      li.textContent = `Feu : +${String(fire).replace('.', ',')} dégâts à chaque coup`;
      stats.appendChild(li);
    }
    card.append(name, meta, stats);
    card.addEventListener('click', () => this.onChoose(c, view.wave));
    return card;
  }
}
