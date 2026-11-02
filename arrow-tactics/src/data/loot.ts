/**
 * Butin (2026-11-02, FONDATION) : sources et tables de butin, donnees pures.
 * Rien n'est encore branche (ni ennemi, ni coffre, ni camp, ni boss ne
 * lachent d'item) : seul le format est pose, avec un tirage deterministe.
 * Un item lache devient un item au sol (World.dropItem) que le Heros ramasse
 * (ordre `pickupItem`) vers son inventaire de run (run/heroEquipment.ts).
 */
export type LootSourceKind = 'enemy' | 'chest' | 'camp' | 'boss';

export interface LootEntry {
  itemId: string;
  /** Poids relatif dans la table. */
  weight: number;
}

export interface LootTable {
  id: string;
  /** Qui lache cette table (camp neutre, coffre, ennemi, boss). */
  source: LootSourceKind;
  /** Chance (0..1) qu'un item tombe. */
  chance: number;
  entries: readonly LootEntry[];
}

/** Tables de butin : aucune pour l'instant (pas de tables de drop). */
export const LOOT_TABLES: Readonly<Record<string, LootTable>> = {};

/** Tirage d'une table avec un generateur fourni (RNG du monde ou graine) :
 *  un id d'item, ou null. Deterministe : deux tirages par appel au plus. */
export function rollLoot(table: LootTable, next: () => number): string | null {
  if (table.entries.length === 0 || next() >= table.chance) return null;
  const total = table.entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  let pick = next() * total;
  for (const entry of table.entries) {
    pick -= Math.max(0, entry.weight);
    if (pick < 0) return entry.itemId;
  }
  return table.entries[table.entries.length - 1]!.itemId;
}
