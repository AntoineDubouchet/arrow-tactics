import { HP_PER_PIP } from '../config/constants';
import { EQUIPMENT, EQUIPMENT_SLOTS, type EquipmentSlot } from '../data/equipment';
import { HERO_INVENTORY_SLOTS } from '../data/hero';
import { RESOURCE_ITEMS, type CarriedResource } from '../data/resources';
import { NO_EQUIPMENT_BONUS, type HeroEquipmentBonus } from './entity';

/**
 * Inventaire unique du Heros (2026-11-02) : une seule verite pour tout ce
 * qu'il porte. HERO_INVENTORY_SLOTS cases (sac) contenant des piles de
 * ressources (bois, pierre, or : RESOURCE_ITEMS.maxStack par case) ou un
 * equipement (une case), et les emplacements d'equipement (un item porte ne
 * prend pas de case). Donnees pures et serialisables (ids), deterministes :
 * les fonctions renvoient un NOUVEL inventaire (ou null si l'operation est
 * impossible) et ne perdent ni ne dupliquent jamais rien.
 *
 * Etat de simulation (Entity.hero.inventory) : ramassage, recolte et depot
 * l'utilisent dans le pas fixe ; l'interface passe par
 * World.queueInventoryAction (applique au debut du pas suivant).
 */
export type InventorySlot =
  | { kind: 'resource'; resource: CarriedResource; amount: number }
  | { kind: 'item'; itemId: string }
  | null;

export interface HeroInventory {
  slots: InventorySlot[];
  equipped: Partial<Record<EquipmentSlot, string>>;
}

/** Action de l'interface sur l'inventaire (World.queueInventoryAction). */
export type InventoryAction =
  /** Deplacer, echanger ou fusionner deux cases du sac. */
  | { type: 'move'; from: number; to: number }
  /** Equiper l'item de la case `from` (emplacement `slot` s'il est donne :
   *  il doit etre le sien). */
  | { type: 'equip'; from: number; slot?: EquipmentSlot }
  /** Retirer l'item de `slot` vers la case `to` (libre) ou la premiere libre. */
  | { type: 'unequip'; slot: EquipmentSlot; to?: number }
  /** Ajouter un item (console de developpement, recompense). */
  | { type: 'add'; itemId: string };

export function createHeroInventory(items: readonly string[] = [], size = HERO_INVENTORY_SLOTS): HeroInventory {
  const slots: InventorySlot[] = Array.from({ length: size }, () => null);
  items.slice(0, size).forEach((itemId, i) => (slots[i] = { kind: 'item', itemId }));
  return { slots, equipped: {} };
}

function copy(inv: HeroInventory): HeroInventory {
  return { slots: inv.slots.map((s) => (s ? { ...s } : null)), equipped: { ...inv.equipped } };
}

export function maxStackOf(resource: CarriedResource): number {
  return RESOURCE_ITEMS[resource].maxStack;
}

/** Quantite portee d'une ressource (toutes ses piles). */
export function resourceCount(inv: HeroInventory, resource: CarriedResource): number {
  let n = 0;
  for (const s of inv.slots) if (s?.kind === 'resource' && s.resource === resource) n += s.amount;
  return n;
}

/** Unites de ressources portees (bois + pierre + or). */
export function carriedResourceTotal(inv: HeroInventory): number {
  let n = 0;
  for (const s of inv.slots) if (s?.kind === 'resource') n += s.amount;
  return n;
}

/** Unites de `resource` que le sac peut encore prendre (piles entamees,
 *  puis cases libres). */
export function roomFor(inv: HeroInventory, resource: CarriedResource): number {
  const max = maxStackOf(resource);
  let room = 0;
  for (const s of inv.slots) {
    if (s === null) room += max;
    else if (s.kind === 'resource' && s.resource === resource) room += Math.max(0, max - s.amount);
  }
  return room;
}

export function freeSlotCount(inv: HeroInventory): number {
  return inv.slots.filter((s) => s === null).length;
}

/** Ajoute jusqu'a `amount` unites : piles entamees d'abord (ordre des
 *  cases), puis nouvelles piles dans les cases libres (ordre des cases).
 *  `added` peut etre inferieur a `amount` (sac plein : le reste reste ou il
 *  etait). */
export function addResource(inv: HeroInventory, resource: CarriedResource, amount: number): { inventory: HeroInventory; added: number } {
  const max = maxStackOf(resource);
  const next = copy(inv);
  let left = Math.max(0, Math.floor(amount));
  for (const s of next.slots) {
    if (left === 0) break;
    if (s?.kind !== 'resource' || s.resource !== resource || s.amount >= max) continue;
    const take = Math.min(left, max - s.amount);
    s.amount += take;
    left -= take;
  }
  for (let i = 0; i < next.slots.length && left > 0; i++) {
    if (next.slots[i] !== null) continue;
    const take = Math.min(left, max);
    next.slots[i] = { kind: 'resource', resource, amount: take };
    left -= take;
  }
  const added = Math.max(0, Math.floor(amount)) - left;
  return { inventory: added > 0 ? next : inv, added };
}

/** Retire une unite de `resource`, prise sur sa derniere pile (ordre des
 *  cases) ; une pile videe libere sa case. null si le Heros n'en porte pas. */
export function removeOneResource(inv: HeroInventory, resource: CarriedResource): HeroInventory | null {
  for (let i = inv.slots.length - 1; i >= 0; i--) {
    const s = inv.slots[i];
    if (s?.kind !== 'resource' || s.resource !== resource || s.amount <= 0) continue;
    const next = copy(inv);
    const pile = next.slots[i] as Extract<InventorySlot, { kind: 'resource' }>;
    pile.amount -= 1;
    if (pile.amount === 0) next.slots[i] = null;
    return next;
  }
  return null;
}

/** Ajoute un equipement dans la premiere case libre ; null si le sac est
 *  plein ou l'item inconnu. */
export function addItem(inv: HeroInventory, itemId: string): HeroInventory | null {
  if (!EQUIPMENT[itemId]) return null;
  const index = inv.slots.indexOf(null);
  if (index < 0) return null;
  const next = copy(inv);
  next.slots[index] = { kind: 'item', itemId };
  return next;
}

/** Deplace la case `from` vers `to` : case vide -> deplacement ; meme
 *  ressource -> fusion jusqu'a la pile pleine (le reste reste en `from`) ;
 *  sinon echange. Indices invalides : inventaire inchange. */
export function moveSlot(inv: HeroInventory, from: number, to: number): HeroInventory {
  const n = inv.slots.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n || inv.slots[from] === null) return inv;
  const next = copy(inv);
  const a = next.slots[from]!;
  const b = next.slots[to] ?? null;
  if (a.kind === 'resource' && b?.kind === 'resource' && a.resource === b.resource) {
    const take = Math.min(a.amount, maxStackOf(a.resource) - b.amount);
    if (take <= 0) return inv;
    b.amount += take;
    a.amount -= take;
    if (a.amount === 0) next.slots[from] = null;
    return next;
  }
  next.slots[to] = a;
  next.slots[from] = b;
  return next;
}

/** Equipe l'item de la case `from` (son emplacement, ou `slot` qui doit etre
 *  le sien). Ce qu'il remplace (meme emplacement, ou emplacement exclusif de
 *  la meme main) retourne dans le sac : d'abord dans la case liberee, puis
 *  dans la premiere case libre. Atomique : null si impossible. */
export function equipFromSlot(inv: HeroInventory, from: number, slot?: EquipmentSlot): HeroInventory | null {
  const s = inv.slots[from];
  if (s?.kind !== 'item') return null;
  const def = EQUIPMENT[s.itemId];
  if (!def || (slot !== undefined && slot !== def.slot)) return null;
  const next = copy(inv);
  next.slots[from] = null;
  const freed: string[] = [];
  for (const occupied of [def.slot, ...EQUIPMENT_SLOTS[def.slot].exclusiveWith]) {
    const previous = next.equipped[occupied];
    if (previous) freed.push(previous);
    delete next.equipped[occupied];
  }
  next.equipped[def.slot] = s.itemId;
  for (const itemId of freed) {
    const index = next.slots[from] === null ? from : next.slots.indexOf(null);
    if (index < 0) return null;
    next.slots[index] = { kind: 'item', itemId };
  }
  return next;
}

/** Retire l'item de `slot` vers la case `to` (libre) ou la premiere case
 *  libre ; null si aucune place (l'item reste porte). */
export function unequipSlot(inv: HeroInventory, slot: EquipmentSlot, to?: number): HeroInventory | null {
  const itemId = inv.equipped[slot];
  if (!itemId) return null;
  const index = to !== undefined && inv.slots[to] === null ? to : inv.slots.indexOf(null);
  if (index < 0) return null;
  const next = copy(inv);
  delete next.equipped[slot];
  next.slots[index] = { kind: 'item', itemId };
  return next;
}

/** Applique une action de l'interface ; null si elle est impossible. */
export function applyInventoryAction(inv: HeroInventory, action: InventoryAction): HeroInventory | null {
  switch (action.type) {
    case 'move': {
      const next = moveSlot(inv, action.from, action.to);
      return next === inv ? null : next;
    }
    case 'equip':
      return equipFromSlot(inv, action.from, action.slot);
    case 'unequip':
      return unequipSlot(inv, action.slot, action.to);
    case 'add':
      return addItem(inv, action.itemId);
  }
}

/** Equipements possedes dans le sac (ordre des cases). */
export function inventoryItems(inv: HeroInventory): string[] {
  const out: string[] = [];
  for (const s of inv.slots) if (s?.kind === 'item') out.push(s.itemId);
  return out;
}

/** Bonus resolus (unites internes de la simulation) des items equipes :
 *  donnees fixes des items (data/equipment.ts), comme les stats d'unite. */
export function resolveEquipmentBonus(inv: Pick<HeroInventory, 'equipped'>): HeroEquipmentBonus {
  const bonus: HeroEquipmentBonus = { ...NO_EQUIPMENT_BONUS };
  for (const itemId of Object.values(inv.equipped)) {
    const def = itemId ? EQUIPMENT[itemId] : undefined;
    if (!def) continue;
    const { stats, effects } = def;
    bonus.maxHp += (stats.maxHp ?? 0) * HP_PER_PIP;
    bonus.maxMana += stats.maxMana ?? 0;
    bonus.manaRegen += stats.manaRegen ?? 0;
    bonus.damage += (stats.damage ?? 0) * HP_PER_PIP;
    bonus.attackSpeed += (stats.attackSpeed ?? 0) / 100;
    bonus.moveSpeed += stats.moveSpeed ?? 0;
    bonus.fireDamage += (effects.onHit?.fireDamage ?? 0) * HP_PER_PIP;
  }
  return bonus;
}
