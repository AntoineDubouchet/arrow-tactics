import { HP_PER_PIP } from '../config/constants';
import { EQUIPMENT, EQUIPMENT_SLOTS, type EquipmentSlot } from '../data/equipment';
import { HERO_INVENTORY_SLOTS } from '../data/hero';
import { NO_EQUIPMENT_BONUS, type HeroEquipmentBonus } from './entity';

/**
 * Inventaire RPG du Heros (2026-11-02) : une seule verite pour les objets
 * qu'il porte. HERO_INVENTORY_SLOTS cases (sac) contenant chacune un
 * equipement (butin, futurs consommables), et les emplacements d'equipement
 * (un item porte ne prend pas de case). Les ressources economiques (bois,
 * pierre, or extrait) n'y entrent JAMAIS : elles vont dans le cargo
 * (Entity.cargo, sim/systems/cargo.ts ; KI-63 close le 2026-11-03).
 * Donnees pures et serialisables (ids), deterministes : les fonctions
 * renvoient un NOUVEL inventaire (ou null si l'operation est impossible) et
 * ne perdent ni ne dupliquent jamais rien.
 *
 * Etat de simulation (Entity.hero.inventory) : le ramassage d'un objet au
 * sol l'utilise dans le pas fixe ; l'interface passe par
 * World.queueInventoryAction (applique au debut du pas suivant).
 */
export type InventorySlot = { kind: 'item'; itemId: string } | null;

export interface HeroInventory {
  slots: InventorySlot[];
  equipped: Partial<Record<EquipmentSlot, string>>;
}

/** Action de l'interface sur l'inventaire (World.queueInventoryAction). */
export type InventoryAction =
  /** Deplacer ou echanger deux cases du sac. */
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

export function freeSlotCount(inv: HeroInventory): number {
  return inv.slots.filter((s) => s === null).length;
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

/** Deplace la case `from` vers `to` : case vide -> deplacement, sinon
 *  echange. Indices invalides : inventaire inchange. */
export function moveSlot(inv: HeroInventory, from: number, to: number): HeroInventory {
  const n = inv.slots.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n || inv.slots[from] === null) return inv;
  const next = copy(inv);
  const a = next.slots[from]!;
  const b = next.slots[to] ?? null;
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
