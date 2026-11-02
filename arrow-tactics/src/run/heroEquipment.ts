import { HP_PER_PIP } from '../config/constants';
import { EQUIPMENT, EQUIPMENT_SLOTS, EQUIPMENT_STAT_DEFS, getEquipment, type EquipmentDef, type EquipmentSlot, type EquipmentVisual } from '../data/equipment';
import { NO_EQUIPMENT_BONUS, type HeroEquipmentBonus } from '../sim/entity';

/**
 * Inventaire et equipement du Heros dans la run (2026-11-02) : modele de
 * donnees pur, serialisable (ids d'items), independant du heros joue
 * (`heroId` generique) et de l'interface. Les fonctions renvoient un NOUVEL
 * inventaire (aucune mutation) ; equiper, remplacer et retirer deplacent un
 * item entre le sac d'items et les emplacements, sans jamais le dupliquer ni
 * le perdre. La simulation ne recoit que `resolveEquipmentBonus`.
 */
export interface HeroInventory {
  /** Items possedes, non equipes (ids, doublons possibles), ordre d'obtention. */
  items: string[];
  /** Items equipes par emplacement. */
  equipped: Partial<Record<EquipmentSlot, string>>;
  /** Nombre maximal d'items non equipes. PROVISOIRE. */
  capacity: number;
}

export const HERO_INVENTORY_CAPACITY = 12;

export function createHeroInventory(): HeroInventory {
  return { items: [], equipped: {}, capacity: HERO_INVENTORY_CAPACITY };
}

/** Ajoute un item (loot, recompense) ; refuse (null) si le sac est plein ou
 *  l'item inconnu. */
export function addInventoryItem(inv: HeroInventory, itemId: string): HeroInventory | null {
  if (!EQUIPMENT[itemId] || inv.items.length >= inv.capacity) return null;
  return { ...inv, items: [...inv.items, itemId] };
}

/** Equipe l'item `itemId` du sac (premier exemplaire) dans son emplacement.
 *  Ce qui occupait cet emplacement, ou un emplacement exclusif (meme main :
 *  bouclier / main secondaire), retourne dans le sac. null si l'item n'est
 *  pas dans le sac. */
export function equipInventoryItem(inv: HeroInventory, itemId: string): HeroInventory | null {
  const index = inv.items.indexOf(itemId);
  if (index < 0) return null;
  const slot = getEquipment(itemId).slot;
  const items = inv.items.filter((_, i) => i !== index);
  const equipped = { ...inv.equipped };
  for (const freed of [slot, ...EQUIPMENT_SLOTS[slot].exclusiveWith]) {
    const previous = equipped[freed];
    if (previous) items.push(previous);
    delete equipped[freed];
  }
  equipped[slot] = itemId;
  return { ...inv, items, equipped };
}

/** Retire l'item de `slot` et le remet dans le sac (meme plein : un item
 *  equipe n'est jamais perdu). */
export function unequipInventorySlot(inv: HeroInventory, slot: EquipmentSlot): HeroInventory {
  const itemId = inv.equipped[slot];
  if (!itemId) return inv;
  const equipped = { ...inv.equipped };
  delete equipped[slot];
  return { ...inv, items: [...inv.items, itemId], equipped };
}

/** Bonus resolus (unites internes de la simulation) des items equipes. */
export function resolveEquipmentBonus(inv: Pick<HeroInventory, 'equipped'>): HeroEquipmentBonus {
  const bonus: HeroEquipmentBonus = { ...NO_EQUIPMENT_BONUS };
  for (const itemId of Object.values(inv.equipped)) {
    if (!itemId) continue;
    const { stats, effects } = getEquipment(itemId);
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

/** Lignes de description d'un item (stats et effets, points affiches) :
 *  inventaire du Heros, Editeur d'items. */
export function describeEquipment(def: Pick<EquipmentDef, 'stats' | 'effects'>): string[] {
  const lines: string[] = [];
  for (const stat of EQUIPMENT_STAT_DEFS) {
    const v = def.stats[stat.key];
    if (!v) continue;
    const n = String(Math.round(v * 100) / 100).replace('.', ',');
    lines.push(`${v > 0 ? '+' : ''}${n}${stat.unit === '%' ? ' %' : ''} ${stat.label}${stat.unit && stat.unit !== '%' && stat.unit !== 'PV' ? ` (${stat.unit})` : ''}`);
  }
  const fire = def.effects.onHit?.fireDamage;
  if (fire) lines.push(`Feu : +${String(fire).replace('.', ',')} dégâts à chaque coup`);
  return lines;
}

/** Visuels tenus en main (droite / gauche) des items equipes, pour le rendu. */
export function equippedHandVisuals(inv: Pick<HeroInventory, 'equipped'>): { right: EquipmentVisual | null; left: EquipmentVisual | null } {
  const out: { right: EquipmentVisual | null; left: EquipmentVisual | null } = { right: null, left: null };
  for (const [slot, itemId] of Object.entries(inv.equipped) as [EquipmentSlot, string | undefined][]) {
    const hand = EQUIPMENT_SLOTS[slot].hand;
    const visual = itemId ? getEquipment(itemId).visual : null;
    if (hand && visual) out[hand] = visual;
  }
  return out;
}
