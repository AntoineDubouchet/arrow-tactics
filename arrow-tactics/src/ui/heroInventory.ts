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
 *
 * Deplacable par le joueur (2026-11-02) : clic maintenu sur le fond de la
 * fenetre puis glisser (jamais depuis une case, un item ou un bouton) ;
 * toujours au moins WINDOW_KEEP px a l'ecran, en-tete jamais au-dessus du
 * bord haut ; position memorisee localement (preference, comme le HUD).
 */
type DragSource = { from: 'bag'; index: number } | { from: 'body'; slot: EquipmentSlot };

/** Position de la fenetre (coin haut gauche, px). */
export interface InventoryWindowPosition {
  x: number;
  y: number;
}

/** Part minimale de la fenetre gardee a l'ecran (px). PROVISOIRE. */
const WINDOW_KEEP = 80;
/** Le glisser de la fenetre ne part jamais de ces elements. */
const WINDOW_NO_DRAG = 'button, input, select, textarea, a, [draggable="true"], .inventory-cell';

export class HeroInventoryPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tooltip: HTMLElement;
  private shown = '';
  private info: HeroSheetInfo | null = null;
  private drag: DragSource | null = null;
  /** Glisser de la fenetre en cours (pointeur, decalage au coin). */
  private move: { pointerId: number; dx: number; dy: number } | null = null;
  private position: InventoryWindowPosition | null;

  constructor(
    onClose: () => void,
    private readonly onAction: (action: InventoryAction) => void,
    savedPosition: InventoryWindowPosition | null = null,
    private readonly savePosition: (position: InventoryWindowPosition) => void = () => {},
  ) {
    this.position = savedPosition;
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
    this.root.addEventListener('pointerdown', (e) => this.startMove(e));
    this.root.addEventListener('pointermove', (e) => this.moveTo(e));
    this.root.addEventListener('pointerup', (e) => this.endMove(e));
    this.root.addEventListener('pointercancel', (e) => this.endMove(e));
    window.addEventListener('resize', () => {
      if (this.isOpen()) this.place();
    });
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  open(info: HeroSheetInfo): void {
    this.update(info);
    this.root.hidden = false;
    this.place();
  }

  // --- Deplacement de la fenetre -------------------------------------------

  private startMove(e: PointerEvent): void {
    if (e.button !== 0 || this.move) return;
    const target = e.target as Element | null;
    if (!target || target.closest(WINDOW_NO_DRAG)) return;
    const r = this.root.getBoundingClientRect();
    // Barre de defilement de la fenetre : pas un glisser.
    if (target === this.root && e.clientX - r.left >= this.root.clientWidth) return;
    this.move = { pointerId: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    this.root.setPointerCapture(e.pointerId);
    this.root.classList.add('hero-inventory--moving');
    this.tooltip.hidden = true;
    e.preventDefault();
  }

  private moveTo(e: PointerEvent): void {
    if (!this.move || e.pointerId !== this.move.pointerId) return;
    this.position = { x: e.clientX - this.move.dx, y: e.clientY - this.move.dy };
    this.place();
  }

  private endMove(e: PointerEvent): void {
    if (!this.move || e.pointerId !== this.move.pointerId) return;
    this.move = null;
    this.root.classList.remove('hero-inventory--moving');
    if (this.root.hasPointerCapture(e.pointerId)) this.root.releasePointerCapture(e.pointerId);
    if (!this.position) return;
    // Position retenue = position affichee (bornee a l'ecran).
    this.position = { x: parseFloat(this.root.style.left), y: parseFloat(this.root.style.top) };
    this.savePosition(this.position);
  }

  /** Applique la position choisie (CSS par defaut sinon), bornee a l'ecran. */
  private place(): void {
    if (!this.position) return;
    const w = this.root.offsetWidth;
    const x = Math.min(Math.max(this.position.x, WINDOW_KEEP - w), innerWidth - WINDOW_KEEP);
    const y = Math.min(Math.max(this.position.y, 0), innerHeight - WINDOW_KEEP);
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(y)}px`;
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
    const goldText = `🪙 ${Math.floor(info.gold ?? 0)}`;
    if (this.gold.textContent !== goldText) this.gold.textContent = goldText;
    const cargoText = info.cargo ? `Ressources transportées : ${info.cargo}` : '';
    if (this.cargo.textContent !== cargoText) this.cargo.textContent = cargoText;
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
  /** Or du joueur (monnaie, 2026-11-02) : sous la grille, jamais une case. */
  private readonly gold = el('div', 'hero-inventory-gold');
  /** Cargo economique (2026-11-03) : « Ressources transportées : 7 / 10 ». */
  private readonly cargo = el('div', 'hero-inventory-cargo');

  private build(): void {
    this.built = true;
    const left = el('div', 'hero-inventory-character');
    left.append(el('div', 'hero-inventory-section', 'Équipement'), this.doll, el('div', 'hero-inventory-section', 'Statistiques'), this.stats, el('div', 'hero-inventory-section', 'Sorts'), this.spells);
    const right = el('div', 'hero-inventory-bag');
    this.gold.title = 'Or du joueur (monnaie) : même valeur que le HUD en haut à droite';
    this.cargo.title = 'Bois, pierre et or extrait transportés (séparés du sac) : déposés à la Baliste';
    right.append(this.bagTitle, this.grid, this.gold, this.cargo, el('div', 'hero-inventory-detail hero-inventory-hint', 'Glisser-déposer : ranger, fusionner, équiper. Double-clic : équiper / retirer. Bois, pierre et or extrait voyagent dans le sac de ressources, déposé à la Baliste ; l’or de butin est une monnaie.'));
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
