/**
 * Butin (2026-11-02) : sources et tables de butin, donnees pures, tirage
 * deterministe (RNG du monde). Branche : coffre des camps neutres (table du
 * type de camp, data/camps.ts) et Maraudeur (ENEMY_LOOT_TABLES). Un item lache
 * devient un item au sol (World.dropItem) que le Heros ramasse (ordre
 * `pickupItem`) vers son inventaire de run (run/heroEquipment.ts).
 * Poids PROVISOIRES.
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

export const LOOT_TABLES: Readonly<Record<string, LootTable>> = {
  /** Coffre d'un petit camp : toujours un item. Commune 60 %, Peu commune
   *  30 %, Rare 10 %. */
  camp_chest_small: {
    id: 'camp_chest_small',
    source: 'chest',
    chance: 1,
    entries: [
      { itemId: 'starter_sword', weight: 35 },
      { itemId: 'guard_pauldrons', weight: 25 },
      { itemId: 'sturdy_shield', weight: 18 },
      { itemId: 'ember_blade', weight: 12 },
      { itemId: 'raider_axe', weight: 10 },
    ],
  },
  /** Coffre d'un grand camp : Commune 30 %, Peu commune 50 %, Rare 20 %. */
  camp_chest_large: {
    id: 'camp_chest_large',
    source: 'chest',
    chance: 1,
    entries: [
      { itemId: 'starter_sword', weight: 15 },
      { itemId: 'guard_pauldrons', weight: 15 },
      { itemId: 'sturdy_shield', weight: 25 },
      { itemId: 'ember_blade', weight: 25 },
      { itemId: 'raider_axe', weight: 20 },
    ],
  },
  /** Maraudeur abattu : rarement un item commun (le coffre reste la
   *  recompense principale d'un camp). */
  maraudeur: {
    id: 'maraudeur',
    source: 'enemy',
    chance: 0.12,
    entries: [
      { itemId: 'starter_sword', weight: 1 },
      { itemId: 'guard_pauldrons', weight: 1 },
    ],
  },
};

/** Or lache au sol a la mort d'un ennemi (2026-11-02), par type d'unite :
 *  tas de min..max pieces (RNG du monde), a ramasser, porter et deposer.
 *  Deduit de l'ancienne prime par kill (KILL_REWARD, arrondie) ; unites
 *  neutres ajoutees. PROVISOIRE. */
export const ENEMY_GOLD_DROPS: Readonly<Record<string, { min: number; max: number }>> = {
  fantassin: { min: 1, max: 1 },
  archer: { min: 1, max: 2 },
  mage: { min: 4, max: 6 },
  sentinel: { min: 15, max: 25 },
  oracle: { min: 6, max: 9 },
  piquier: { min: 1, max: 1 },
  vengeur: { min: 10, max: 15 },
  cavalier: { min: 3, max: 5 },
  maraudeur: { min: 1, max: 1 },
  traqueur: { min: 1, max: 2 },
  feticheur: { min: 2, max: 3 },
  ravageur: { min: 3, max: 4 },
  colosse: { min: 5, max: 8 },
  razzieur: { min: 2, max: 3 },
};

/** Table de butin lachee a la mort d'un ennemi, par type d'unite (UNITS). */
export const ENEMY_LOOT_TABLES: Readonly<Record<string, string>> = {
  maraudeur: 'maraudeur',
};

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
