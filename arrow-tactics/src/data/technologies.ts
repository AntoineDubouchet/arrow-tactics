import type { ResourceKind } from '../config/resourceNodes';
import type { UnitBonus } from './unitBonus';

/**
 * TECHNOLOGIES de run (2026-11-05, Pass 2) : recherches lancees depuis la
 * fiche d'un batiment (son `site`), payees a la commande (or + stock), qui
 * passent par la MEME file temps reel que les unites et les ameliorations de
 * batiment (Entity.productionOrders, commande `research`) et terminent en
 * temps reel, sans figer le jeu. Une technologie terminee est un etat de la
 * RUN (RunState.upgrades[id] = niveau, 1 = acquise), jamais d'un exemplaire
 * de batiment : deux Forges partagent la meme recherche, et reconstruire une
 * Forge detruite ne fait pas perdre une technologie acquise. Une file perdue
 * avec son batiment n'est pas remboursee (regle commune des commandes).
 *
 * Direction (docs/DESIGN_DECISIONS.md) : la Forge porte les technologies
 * militaires GLOBALES (toutes les unites militaires du joueur, presentes et
 * futures ; jamais le Heros, le Villageois, la Baliste ni les batiments) ;
 * les ameliorations propres a une unite appartiennent a son batiment
 * producteur (BuildingDef.rosterBonusPerLevel, ou une technologie dont le
 * `site` est ce producteur). Un seul palier par technologie aujourd'hui
 * (« I ») ; un palier II/III se declarerait ici comme une autre entree.
 * Valeurs PROVISOIRES.
 */
export interface TechnologyEffect {
  /** `military` : toutes les unites militaires (data/units.ts,
   *  isMilitaryUnit) ; `unit` : une seule unite. */
  target: { kind: 'military' } | { kind: 'unit'; unitId: string };
  bonus: UnitBonus;
}

export interface TechnologyDef {
  id: string;
  name: string;
  /** Batiment (data/buildings.ts) depuis lequel elle se recherche. */
  site: string;
  /** Niveau interne minimal du site (0 = Niv. 1, defaut). */
  requiresSiteLevel?: number;
  goldCost: number;
  resourceCost: Partial<Record<ResourceKind, number>>;
  /** Duree de recherche (secondes de simulation). */
  seconds: number;
  effects: readonly TechnologyEffect[];
  description: string;
}

export const TECHNOLOGIES: Readonly<Record<string, TechnologyDef>> = {
  forge_weapons: {
    id: 'forge_weapons',
    name: 'Armes forgées I',
    site: 'forge',
    // G45 (2026-11-05) : une technologie militaire coute au moins autant de
    // matiere qu'un batiment economique (20 or, 10 bois, 5 pierre avant).
    goldCost: 20,
    resourceCost: { wood: 20, stone: 10 },
    seconds: 30,
    effects: [{ target: { kind: 'military' }, bonus: { attackPercent: 10 } }],
    description: 'Unités militaires : +10 % dégâts',
  },
  forge_armor: {
    id: 'forge_armor',
    name: 'Armures forgées I',
    site: 'forge',
    // G45 : 20 or, 5 bois, 10 pierre avant.
    goldCost: 20,
    resourceCost: { wood: 10, stone: 20 },
    seconds: 30,
    effects: [{ target: { kind: 'military' }, bonus: { hpPercent: 10 } }],
    description: 'Unités militaires : +10 % PV max',
  },
  // Caserne : ancien niveau de Forge de l'Homme d'armes (+3 PV, +1 attaque,
  // 7 or), devenu une technologie de la Caserne, disponible a son Niv. 2
  // (celui qui debloque l'Homme d'armes) ; sans surcout de recrutement.
  barracks_training: {
    id: 'barracks_training',
    name: 'Entraînement des hommes d’armes',
    site: 'barracks',
    requiresSiteLevel: 1,
    // G45 : matiere ajoutee (7 or seul avant) ; l'or reste modeste.
    goldCost: 7,
    resourceCost: { wood: 10, stone: 5 },
    seconds: 20,
    effects: [{ target: { kind: 'unit', unitId: 'fantassin' }, bonus: { hp: 3, attack: 1 } }],
    description: 'Hommes d’armes : +3 PV, +1 dégâts',
  },
};

export function getTechnology(id: string): TechnologyDef {
  const def = TECHNOLOGIES[id];
  if (!def) throw new Error(`Technologie inconnue : ${id}`);
  return def;
}

export function isTechnologyId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(TECHNOLOGIES, id);
}

/** Technologies recherchees depuis le batiment `buildingId`, dans l'ordre de
 *  declaration. */
export function technologiesAt(buildingId: string): TechnologyDef[] {
  return Object.values(TECHNOLOGIES).filter((t) => t.site === buildingId);
}
