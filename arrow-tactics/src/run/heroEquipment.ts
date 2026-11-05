import { describeTriggeredEffect, EQUIPMENT_SLOTS, EQUIPMENT_STAT_DEFS, getEquipment, type EquipmentDef, type EquipmentSlot, type EquipmentVisual } from '../data/equipment';

/**
 * Equipement du Heros cote run (2026-11-02) : l'inventaire unique (sac de
 * HERO_INVENTORY_SLOTS cases, ressources en piles, equipements, items
 * portes) est un etat de simulation (sim/inventory.ts, Entity.hero.inventory),
 * recopie dans la run (HeroProgress.inventory). Ce module garde la
 * description des items et leurs visuels tenus, pour l'interface et le rendu.
 */
import type { HeroInventory } from '../sim/inventory';
export { createHeroInventory, resolveEquipmentBonus, type HeroInventory } from '../sim/inventory';

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
  for (const effect of def.effects) lines.push(describeTriggeredEffect(effect));
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
