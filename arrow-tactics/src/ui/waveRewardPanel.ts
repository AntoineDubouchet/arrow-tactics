import { describeTriggeredEffect, EQUIPMENT_ARCHETYPES, EQUIPMENT_SLOTS, EQUIPMENT_STAT_DEFS, RARITIES } from '../data/equipment';
import type { WaveRewardChoice } from '../run/waveRewards';
import { createSlotIcon } from './slotIcons';

/**
 * Recompense de vague (2026-11-05, G46) : petit panneau non bloquant
 * « Récompense de vague N » avec deux cartes (nom, niveau, emplacement,
 * orientation, stats principales). La partie continue ; le joueur clique
 * quand il veut. Un clic sur une carte choisit l'item. Sac plein : une carte
 * dont l'item ne peut aller nulle part est desactivee (« Inventaire plein »),
 * rien n'est perdu ; une carte qui remplit un emplacement vide reste possible.
 * Mention jaune (G47) : ce que dit la regle d'acquisition (acquisitionPlan,
 * sim/inventory.ts), jamais une prediction a part.
 * Element unique cree une fois (meme pattern que les autres panneaux) ; le
 * contenu n'est reconstruit que si la recompense affichee change.
 */
export interface WaveRewardCard {
  choice: WaveRewardChoice;
  /** Emplacement vide et piece portable : sera equipee automatiquement. */
  autoEquip: boolean;
  /** Ni emplacement vide ni case libre : choix impossible pour l'instant. */
  disabled: boolean;
}

export interface WaveRewardView {
  wave: number;
  cards: readonly WaveRewardCard[];
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
    const key = `${view.wave}:${view.cards.map((c) => `${c.choice.itemId}@${c.choice.level}:${c.autoEquip}:${c.disabled}`).join(',')}:${view.queued}:${view.inventoryFull}`;
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = false;
    this.titleEl.textContent = `Récompense de vague ${view.wave}`;
    this.cardsEl.replaceChildren(...view.cards.map((c) => this.card(c, view.wave)));
    this.footEl.textContent = view.inventoryFull ? (view.cards.every((c) => c.disabled) ? 'Inventaire plein : libérez une case pour choisir.' : 'Inventaire plein : seule une pièce pour un emplacement vide peut être choisie.') : view.queued > 0 ? `Choisissez un équipement · ${view.queued} récompense${view.queued > 1 ? 's' : ''} en attente ensuite` : 'Choisissez un équipement';
    this.footEl.classList.toggle('wave-reward-foot--full', view.inventoryFull);
  }

  private card(entry: WaveRewardCard, wave: number): HTMLElement {
    const c = entry.choice;
    const rarity = RARITIES[c.def.rarity];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'wave-reward-card';
    card.dataset['itemId'] = c.itemId;
    card.dataset['level'] = String(c.level);
    card.style.setProperty('--rarity', rarity.color);
    card.disabled = entry.disabled;
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
    for (const effect of c.def.effects) {
      const li = document.createElement('li');
      li.textContent = describeTriggeredEffect(effect);
      stats.appendChild(li);
    }
    card.append(createSlotIcon(c.def.slot, rarity.color), name, meta, stats);
    if (entry.autoEquip) {
      const auto = document.createElement('div');
      auto.className = 'wave-reward-card-auto';
      auto.textContent = 'Emplacement vide — sera équipé automatiquement';
      card.appendChild(auto);
    }
    card.addEventListener('click', () => this.onChoose(c, wave));
    return card;
  }
}
