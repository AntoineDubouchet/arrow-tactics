import type { InventoryAction } from '../sim/inventory';
import type { EquipmentSlot } from '../data/equipment';
import type { HeroSheetCell, HeroSheetInfo, HeroSheetItem } from '../run/entityInfo';

/**
 * Fenetre du personnage et inventaire unique du Heros (2026-11-02), touche I
 * ou bouton du HUD. A gauche : silhouette (tete, epaules, torse, bras, main
 * droite, main gauche, jambes, cape), statistiques, sorts. A droite : le sac,
 * grille de cases (ressources en piles avec leur quantite, equipements au
 * cadre de leur rarete). Glisser-deposer : deplacer / echanger / fusionner
 * dans le sac, equiper vers un emplacement compatible, retirer vers le sac ;
 * double-clic : equiper ou retirer. Infobulle au survol. Le jeu continue
 * pendant qu'elle est ouverte. Les actions passent par la simulation
 * (World.queueInventoryAction) ; donnees deja mises en forme
 * (run/entityInfo.ts, heroSheetInfo).
 */
type DragSource = { from: 'bag'; index: number } | { from: 'body'; slot: EquipmentSlot };

export class HeroInventoryPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tooltip: HTMLElement;
  private shown = '';
  private info: HeroSheetInfo | null = null;
  private drag: DragSource | null = null;

  constructor(
    onClose: () => void,
    private readonly onAction: (action: InventoryAction) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hero-inventory';
    this.root.hidden = true;
    const header = document.createElement('div');
    header.className = 'hero-inventory-header';
    this.title = document.createElement('div');
    this.title.className = 'hero-inventory-title';
    const close = document.createElement('button');
    close.className = 'hero-inventory-close';
    close.textContent = '×';
    close.title = 'Fermer (I ou Échap)';
    close.addEventListener('click', onClose);
    header.append(this.title, close);
    this.body = document.createElement('div');
    this.body.className = 'hero-inventory-body';
    this.root.append(header, this.body);
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'inventory-tooltip';
    this.tooltip.hidden = true;
    document.body.append(this.root, this.tooltip);
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  open(info: HeroSheetInfo): void {
    this.update(info);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
    this.tooltip.hidden = true;
  }

  update(info: HeroSheetInfo): void {
    this.info = info;
    if (!this.built) this.build();
    // Statistiques (PV, mana qui se regenere...) : seul leur bloc change ;
    // la grille et la silhouette ne sont reconstruites que si leur contenu
    // change, et jamais pendant un glisser-deposer.
    const statKey = JSON.stringify([info.title, info.hp, info.rows, info.spells]);
    if (statKey !== this.statKey) {
      this.statKey = statKey;
      this.renderStats(info);
    }
    const bagKey = JSON.stringify([info.body, info.cells, info.capacity]);
    if (bagKey !== this.shown && !this.drag) {
      this.shown = bagKey;
      this.tooltip.hidden = true;
      this.renderBag(info);
    }
  }

  private built = false;
  private statKey = '';
  private readonly doll = el('div', 'hero-inventory-doll');
  private readonly stats = el('div', 'hero-inventory-stats');
  private readonly spells = el('div', 'hero-inventory-stats');
  private readonly bagTitle = el('div', 'hero-inventory-section');
  private readonly grid = el('div', 'inventory-grid');

  private build(): void {
    this.built = true;
    const left = el('div', 'hero-inventory-character');
    left.append(el('div', 'hero-inventory-section', 'Équipement'), this.doll, el('div', 'hero-inventory-section', 'Statistiques'), this.stats, el('div', 'hero-inventory-section', 'Sorts'), this.spells);
    const right = el('div', 'hero-inventory-bag');
    right.append(this.bagTitle, this.grid, el('div', 'hero-inventory-detail hero-inventory-hint', 'Glisser-déposer : ranger, fusionner, équiper. Double-clic : équiper / retirer. Bois, pierre et or se déposent à la Baliste.'));
    this.body.replaceChildren(left, right);
    // Fin d'un glisser hors d'une case : la grille peut de nouveau suivre.
    document.addEventListener('dragend', () => (this.drag = null));
  }

  private renderStats(info: HeroSheetInfo): void {
    this.title.textContent = info.title;
    const hp = el('div', 'hero-inventory-row');
    hp.append(el('span', '', 'PV'), el('span', '', `${info.hp.current} / ${info.hp.max}`));
    const rows = info.rows.map((row) => {
      const line = el('div', 'hero-inventory-row');
      line.append(el('span', '', row.label), el('span', '', row.value));
      return line;
    });
    this.stats.replaceChildren(hp, ...rows);
    this.spells.replaceChildren(...info.spells.map((spell) => {
      const line = el('div', 'hero-inventory-detail');
      line.append(el('b', '', spell.name), ` — ${spell.detail}`);
      line.title = spell.description;
      return line;
    }));
  }

  private renderBag(info: HeroSheetInfo): void {
    // Silhouette : emplacements du corps.
    const cells: HTMLElement[] = [el('div', 'hero-inventory-figure')];
    for (const slot of info.body) {
      const cell = el('div', `inventory-cell inventory-cell--body inventory-body--${slot.id}`);
      cell.dataset['body'] = slot.id;
      if (slot.item) this.fillItem(cell, slot.item);
      else cell.appendChild(el('span', 'inventory-cell-label', slot.label));
      const wornSlot = slot.item?.slotId;
      if (wornSlot) {
        cell.draggable = true;
        cell.addEventListener('dragstart', (e) => this.startDrag(e, { from: 'body', slot: wornSlot }));
        cell.addEventListener('dblclick', () => this.onAction({ type: 'unequip', slot: wornSlot }));
      }
      this.hover(cell, () => (slot.item ? itemTooltip(slot.item) : [{ text: slot.label, strong: true }, { text: 'Emplacement vide' }]));
      this.dropTarget(cell, (src) => this.dropOnBody(src, slot.accepts));
      cells.push(cell);
    }
    this.doll.replaceChildren(...cells);
    // Sac : grille.
    this.bagTitle.textContent = `Sac (${info.capacity})`;
    this.grid.replaceChildren(...info.cells.map((c, index) => this.bagCell(c, index)));
  }

  private bagCell(c: HeroSheetCell, index: number): HTMLElement {
    const cell = el('div', 'inventory-cell');
    cell.dataset['index'] = String(index);
    if (c.kind === 'resource') {
      cell.classList.add('inventory-cell--resource', `inventory-cell--${c.resource}`);
      cell.style.borderColor = c.color;
      cell.append(el('i', `inventory-icon inventory-icon--${c.resource}`), el('span', 'inventory-cell-amount', `${c.amount}`));
      this.hover(cell, () => [{ text: c.name, strong: true, color: c.color }, { text: `Quantité : ${c.amount} / ${c.max}` }, { text: 'À déposer à la Baliste pour l\'utiliser.' }]);
    } else if (c.kind === 'item') {
      this.fillItem(cell, c.item);
      cell.addEventListener('dblclick', () => this.onAction({ type: 'equip', from: index }));
      this.hover(cell, () => itemTooltip(c.item));
    } else {
      cell.classList.add('inventory-cell--empty');
    }
    if (c.kind !== 'empty') {
      cell.draggable = true;
      cell.addEventListener('dragstart', (e) => this.startDrag(e, { from: 'bag', index }));
    }
    this.dropTarget(cell, (src) => this.dropOnBag(src, index));
    return cell;
  }

  private fillItem(cell: HTMLElement, item: HeroSheetItem): void {
    cell.classList.add('inventory-cell--item');
    cell.style.borderColor = item.color;
    cell.style.setProperty('--rarity', item.color);
    const icon = el('i', `inventory-icon inventory-icon--slot-${item.slotId}`);
    icon.style.color = item.color;
    cell.append(icon, el('span', 'inventory-cell-name', item.name));
  }

  private startDrag(e: DragEvent, source: DragSource): void {
    this.drag = source;
    this.tooltip.hidden = true;
    e.dataTransfer?.setData('text/plain', JSON.stringify(source));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  private dropTarget(cell: HTMLElement, onDrop: (source: DragSource) => void): void {
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      cell.classList.add('inventory-cell--over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('inventory-cell--over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('inventory-cell--over');
      let source = this.drag;
      try {
        const raw = e.dataTransfer?.getData('text/plain');
        if (raw) source = JSON.parse(raw) as DragSource;
      } catch {
        // Donnees de glisser etrangeres : on garde la source memorisee.
      }
      this.drag = null;
      if (source) onDrop(source);
    });
  }

  /** Depot sur un emplacement du corps : equiper un item compatible du sac. */
  private dropOnBody(source: DragSource, accepts: readonly EquipmentSlot[]): void {
    if (source.from !== 'bag' || !this.info) return;
    const c = this.info.cells[source.index];
    if (c?.kind !== 'item' || !accepts.includes(c.item.slotId)) return;
    this.onAction({ type: 'equip', from: source.index, slot: c.item.slotId });
  }

  /** Depot sur une case du sac : deplacer / fusionner / echanger, ou retirer
   *  un item porte (echange si la case contient un item du meme emplacement). */
  private dropOnBag(source: DragSource, index: number): void {
    if (!this.info) return;
    if (source.from === 'bag') {
      if (source.index !== index) this.onAction({ type: 'move', from: source.index, to: index });
      return;
    }
    const target = this.info.cells[index];
    if (target?.kind === 'item' && target.item.slotId === source.slot) this.onAction({ type: 'equip', from: index, slot: source.slot });
    else this.onAction({ type: 'unequip', slot: source.slot, to: target?.kind === 'empty' ? index : undefined });
  }

  private hover(cell: HTMLElement, lines: () => TooltipLine[]): void {
    cell.addEventListener('mouseenter', () => {
      if (this.drag) return;
      this.tooltip.replaceChildren(...lines().map((l) => {
        const line = el(l.strong ? 'b' : 'div', 'inventory-tooltip-line', l.text);
        if (l.color) line.style.color = l.color;
        return line;
      }));
      this.tooltip.hidden = false;
      const r = cell.getBoundingClientRect();
      const w = this.tooltip.offsetWidth;
      this.tooltip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right + 8))}px`;
      this.tooltip.style.top = `${Math.max(8, Math.min(innerHeight - this.tooltip.offsetHeight - 8, r.top))}px`;
    });
    cell.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
  }
}

interface TooltipLine {
  text: string;
  strong?: boolean;
  color?: string;
}

/** Infobulle d'un equipement : nom (couleur de rarete), rarete, emplacement,
 *  type, stats, effet, valeur de vente (donnees de l'Editeur d'items). */
function itemTooltip(item: HeroSheetItem): TooltipLine[] {
  return [
    { text: item.name, strong: true, color: item.color },
    { text: `${item.rarity} · ${item.slot} · ${item.type}`, color: item.color },
    ...item.lines.map((text) => ({ text })),
    { text: `Valeur de vente : ${item.sellValue} or` },
  ];
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
