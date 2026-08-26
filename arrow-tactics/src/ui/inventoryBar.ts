import { getItem, ITEM_CATEGORY_ORDER } from '../data/items';
import { INVENTORY_CAPACITY, type OwnedItem } from '../run/runState';
import { createItemIcon } from './itemIcons';

export interface InventoryBarHandlers {
  /** Clic sur un emplacement occupe — n'arme/n'utilise rien lui-meme,
   *  main.ts decide (utilisable seulement pendant la bataille, voir
   *  inBattlePhase). Recoit toujours l'index REEL dans RunState.inventory
   *  (voir refresh, "Tri d'affichage"), jamais la position visuelle. */
  onSelectSlot: (index: number) => void;
}

/** Compare deux objets pour le TRI D'AFFICHAGE (2026-08-14, demande
 *  d'Antoine : "trier l'inventaire pour que les sorts similaires soient les
 *  uns à côté des autres, éviter que cela fasse brouillon") — d'abord par
 *  categorie (ordre fixe, voir ITEM_CATEGORY_ORDER), puis par id d'objet
 *  (regroupe les exemplaires identiques). Stable par construction
 *  (Array.prototype.sort est stable) : deux objets de meme id restent dans
 *  leur ordre d'acquisition d'origine, jamais melanges arbitrairement. */
function compareItemsForDisplay(idA: string, idB: string): number {
  if (idA === idB) return 0;
  const a = getItem(idA);
  const b = getItem(idB);
  const categoryDelta = ITEM_CATEGORY_ORDER.indexOf(a.category) - ITEM_CATEGORY_ORDER.indexOf(b.category);
  if (categoryDelta !== 0) return categoryDelta;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

/** Une pile visuelle : plusieurs instances du MEME objet regroupees dans un
 *  seul emplacement (2026-08-14, demande d'Antoine : "les objets peuvent
 *  desormais se stack dans l'inventaire — parchemins de soins par 10, Nova
 *  de glace par 3"). `representativeRealIndex` est l'index REEL (dans
 *  RunState.inventory) qui sera arme/consomme pour toute la pile — peu
 *  importe LEQUEL des `count` exemplaires identiques est retire au moment de
 *  l'utilisation, ils sont interchangeables (aucun etat par instance). */
interface DisplayStack {
  itemId: string;
  count: number;
  representativeRealIndex: number;
}

/** Regroupe l'inventaire REEL (jamais reordonne, voir le commentaire de
 *  classe) en piles d'affichage : d'abord trie par categorie/id
 *  (compareItemsForDisplay, deja utilise avant le chantier stack), puis
 *  decoupe les runs consecutifs de meme id en tranches d'au plus
 *  `ItemDef.maxStack` — une pile pleine cede la place a une NOUVELLE pile du
 *  meme id plutot que de deborder. */
function buildDisplayStacks(inventory: OwnedItem[]): DisplayStack[] {
  const sortedRealIndices = inventory
    .map((_, realIndex) => realIndex)
    .sort((a, b) => compareItemsForDisplay(inventory[a]!.itemId, inventory[b]!.itemId));

  const stacks: DisplayStack[] = [];
  let current: DisplayStack | null = null;
  for (const realIndex of sortedRealIndices) {
    const itemId = inventory[realIndex]!.itemId;
    const maxStack = getItem(itemId).maxStack;
    if (current && current.itemId === itemId && current.count < maxStack) {
      current.count++;
    } else {
      current = { itemId, count: 1, representativeRealIndex: realIndex };
      stacks.push(current);
    }
  }
  return stacks;
}

/**
 * Barre d'inventaire : `INVENTORY_CAPACITY` emplacements fixes, a gauche du
 * bloc Boutique/Vendre (demande d'Antoine, 2026-08-09). Affiche les objets
 * possedes (voir RunState.inventory) ; visible pendant le placement (pour
 * consulter ce qu'on a) ET la bataille (pour vraiment les utiliser) — voir
 * main.ts pour le detail des transitions de visibilite.
 *
 * Tri d'AFFICHAGE (2026-08-14) : les emplacements VISUELS sont regroupes par
 * categorie/id (voir compareItemsForDisplay), mais `RunState.inventory`
 * lui-meme n'est JAMAIS reordonne — main.ts manipule cet index REEL
 * directement (`currentRun.inventory.splice(index, 1)`, `armedItemIndex`).
 * `slotRealIndex[positionVisuelle]` fait la correspondance entre ce qui est
 * affiche a une position donnee et son VRAI index dans le tableau, mise a
 * jour a chaque `refresh()` — `onSelectSlot`/`setArmed` passent/recoivent
 * toujours cet index reel, jamais la position visuelle.
 */
export class InventoryBar {
  private readonly root: HTMLElement;
  private readonly slots: HTMLButtonElement[] = [];
  /** Icone qui suit le curseur tant qu'un objet est arme (demande d'Antoine,
   *  2026-08-10 : "un icone qui suit notre curseur... pour indiquer que nous
   *  nous appretons a soigner une unite, cela paraitra plus clair") — meme
   *  technique que le fantome de vente (voir sellZone.ts). */
  private readonly cursorIcon: HTMLElement;
  private armedIndex: number | null = null;
  /** Index REEL (dans RunState.inventory) affiche a chaque position visuelle
   *  — voir le commentaire de classe, "Tri d'affichage". `null` = emplacement
   *  vide a cette position. */
  private readonly slotRealIndex: (number | null)[] = [];

  constructor(handlers: InventoryBarHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'inventory-bar';

    for (let i = 0; i < INVENTORY_CAPACITY; i++) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'inventory-slot';
      // Lit `slotRealIndex[i]` AU MOMENT DU CLIC (pas a la construction) —
      // la position visuelle `i` reste fixe, mais l'objet reel qu'elle
      // affiche peut changer d'un refresh a l'autre (tri).
      slot.addEventListener('click', () => {
        const realIndex = this.slotRealIndex[i];
        if (realIndex !== null && realIndex !== undefined) handlers.onSelectSlot(realIndex);
      });
      this.root.appendChild(slot);
      this.slots.push(slot);
      this.slotRealIndex.push(null);
    }

    document.body.appendChild(this.root);
    this.setVisible(false);

    this.cursorIcon = document.createElement('div');
    this.cursorIcon.className = 'inventory-cursor-icon';
    document.body.appendChild(this.cursorIcon);
    this.cursorIcon.style.display = 'none';
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  /** Reconstruit l'affichage des emplacements depuis l'inventaire actuel —
   *  a appeler apres tout achat/utilisation/vague. Un emplacement visuel =
   *  une PILE (voir buildDisplayStacks, chantier stack 2026-08-14), pas
   *  forcement une seule instance ; ordre REEL de `inventory` jamais touche. */
  refresh(inventory: OwnedItem[]): void {
    const stacks = buildDisplayStacks(inventory);

    this.slots.forEach((slot, visualIndex) => {
      slot.innerHTML = '';
      const stack = stacks[visualIndex] ?? null;
      const realIndex = stack?.representativeRealIndex ?? null;
      this.slotRealIndex[visualIndex] = realIndex;
      slot.classList.toggle('inventory-slot--armed', realIndex !== null && realIndex === this.armedIndex);
      if (!stack) {
        slot.disabled = true;
        slot.title = '';
        return;
      }
      slot.disabled = false;
      const def = getItem(stack.itemId);
      slot.title = `${def.name}${stack.count > 1 ? ` ×${stack.count}` : ''} — ${def.description}`;
      slot.appendChild(createItemIcon(stack.itemId));
      // Pastille de quantite (2026-08-14, chantier stack) : seulement si
      // plusieurs exemplaires partagent cette pile, jamais "×1".
      if (stack.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'inventory-slot-count';
        badge.textContent = `×${stack.count}`;
        slot.appendChild(badge);
      }
      // Petite entree "glissee" (demande d'Antoine : "un endroit ou les
      // objets achetes se glissent") — rejouee a chaque refresh, pas
      // seulement a l'achat, mais assez discrete pour ne pas gener sur les
      // rafraichissements frequents (annulation d'armement, etc.).
      slot.classList.remove('inventory-slot--enter');
      void slot.offsetWidth; // relance l'animation CSS meme si la classe etait deja retiree
      slot.classList.add('inventory-slot--enter');
    });
  }

  /** Marque visuellement un emplacement comme "arme" (pret a etre utilise sur
   *  la prochaine cible cliquee) et fait apparaitre l'icone de l'objet pres
   *  du curseur — `index` est TOUJOURS l'index REEL (voir RunState.inventory),
   *  jamais une position visuelle ; index=null desarme tout (itemId alors
   *  ignore). */
  setArmed(index: number | null, itemId?: string): void {
    this.armedIndex = index;
    this.slots.forEach((slot, i) => slot.classList.toggle('inventory-slot--armed', this.slotRealIndex[i] !== null && this.slotRealIndex[i] === index));

    if (index === null || !itemId) {
      this.cursorIcon.style.display = 'none';
      return;
    }
    this.cursorIcon.innerHTML = '';
    this.cursorIcon.appendChild(createItemIcon(itemId));
    this.cursorIcon.style.display = 'flex';
  }

  /** A appeler sur chaque mousemove tant qu'un objet est arme — inutile de
   *  bouger l'icone quand elle est cachee, mais pas grave de le faire quand
   *  meme (juste un style.left/top sur un element display:none). */
  moveCursorIcon(clientX: number, clientY: number): void {
    this.cursorIcon.style.left = `${clientX}px`;
    this.cursorIcon.style.top = `${clientY}px`;
  }
}
