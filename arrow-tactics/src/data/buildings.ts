import { HP_PER_PIP } from '../config/constants';

/**
 * Architecture générique BUILDING (2026-08-16, demande d'Antoine) — un
 * bâtiment GAMEPLAY (Mine, Baliste) est une Entity comme une unité (voir
 * sim/entity.ts, Entity.isBuilding) mais configurée depuis CE fichier plutôt
 * que data/units.ts : il n'a ni déplacement, ni portée d'attaque, ni ciblage
 * propre — seulement des PV, un rayon (reach de l'attaque adverse), et deux
 * drapeaux qui pilotent son rôle dans la partie.
 *
 * Distinct des bâtiments DÉCORATIFS KayKit (voir editor/editorUI.ts,
 * DECOR_CATALOG, catégorie « Structures décoratives ») : ceux-là restent de purs `ObstacleDef`
 * (kind:'building') posés dans l'éditeur — jamais spawnés comme Entity,
 * jamais dans ce fichier. La distinction "gameplay vs décoratif" n'est donc
 * pas un champ à cocher sur un objet générique : c'est simplement le fait
 * qu'un bâtiment gameplay est réellement instancié via World.spawnBuilding,
 * un décor KayKit ne l'est jamais.
 */
/**
 * Production automatique d'unites (2026-08-17, Caserne — voir
 * sim/systems/barracksSystem.ts) — GENERIQUE, jamais hardcode a un seul type
 * d'unite (demande explicite d'Antoine, point 73 : "il serait interessant
 * que la production ne soit pas hardcodee exclusivement a Footman... ainsi
 * plus tard Stable -> Cavalry, Mage Tower -> Mage"). N'implemente RIEN
 * au-dela de la Caserne aujourd'hui — juste la FORME, deja reutilisable.
 */
export interface SpawnerBuildingConfig {
  /** Unite REELLEMENT produite (voir data/units.ts) — reçoit les memes
   *  ameliorations/talents permanents que toute unite joueur normale, voir
   *  main.ts, consommation de World.barracksSpawnEvents. */
  unitId: string;
  /** Intervalle de BASE (secondes) entre deux productions — voir
   *  run/barracksUpgradeEffects.ts pour la valeur EFFECTIVE (base - niveau
   *  d'amelioration permanente, plafonnee a minIntervalSeconds). */
  baseIntervalSeconds: number;
  /** Plancher ABSOLU (secondes), jamais franchi quel que soit le niveau
   *  d'amelioration permanente — voir CLAUDE.md, demande explicite : "jamais
   *  1 sec, 0 sec, valeur negative". */
  minIntervalSeconds: number;
}

export interface BuildingDef {
  id: string;
  displayName: string;
  /** PV max, échelle INTERNE (x10, comme UnitStats.maxHp). */
  maxHp: number;
  /** Rayon du corps — même rôle que UnitStats.radius : reach de l'attaque
   *  adverse (dist <= attackRange + target.stats.radius) et séparation. */
  radius: number;
  /** Peut être visé et endommagé par le combat automatique. Actuellement
   *  toujours vrai pour les 3 bâtiments gameplay existants (Mine, Baliste,
   *  Caserne) — champ conservé pour un futur bâtiment gameplay non ciblable
   *  plutôt que consommé activement par targetingSystem aujourd'hui (voir
   *  World.spawnBuilding, qui refuse de spawner une Entity si
   *  targetable=false : un bâtiment non ciblable qui reste une pure
   *  décoration collidante n'a jamais besoin d'exister comme Entity, il
   *  reste un simple ObstacleDef). */
  targetable: boolean;
  /** Compte comme un combattant dont la survie maintient sa faction "en vie"
   *  pour la condition de victoire/défaite (voir World.countCombatants,
   *  run/runState.ts applyBattleOutcome) — remplace tout `if (mine...)`/
   *  `if (ballista...)` disséminé par une propriété générique lue une seule
   *  fois. */
  countsForDefeat: boolean;
  /** Hauteur monde d'ancrage de la barre de PV — même rôle que
   *  UnitVisual.hpBarHeight. */
  hpBarHeight: number;
  /** Coût Gold en boutique de RUN (2026-08-17, chantier "bâtiments
   *  achetables") — ABSENT = jamais proposé à l'achat (la Baliste : toujours
   *  présente, jamais recrutée). SOURCE UNIQUE du prix, lue à la fois par
   *  l'affichage (ui/screens.ts) et la transaction réelle (main.ts). */
  cost?: number;
  /** Clé du modèle KayKit (voir render/assetLibrary.ts, EnvironmentAssets.buildingsByName)
   *  — TOUJOURS teinté bleu (`blue_...`) : seul le camp JOUEUR peut acheter
   *  un bâtiment via ce système pour l'instant, même convention déjà établie
   *  pour la Mine avant cette refonte (jamais de bâtiment ennemi équivalent
   *  aujourd'hui). Requis si `cost` est présent. */
  buildingModel?: string;
  /** Empreinte de collision/placement — requis si `cost` est présent (voir
   *  main.ts, canPlaceBuildingAt/onValidatePlacement). */
  footprintTilesX?: number;
  footprintTilesZ?: number;
  /** Production automatique d'unités — voir SpawnerBuildingConfig ci-dessus.
   *  Absent pour la Mine/la Baliste. */
  spawner?: SpawnerBuildingConfig;
}

export const BUILDINGS: Record<string, BuildingDef> = {
  // "15 HP" (Antoine) -> 150 interne, échelle x10 vérifiée comme partout
  // ailleurs (voir CLAUDE.md, "Échelle des nombres").
  mine: {
    id: 'mine',
    displayName: 'Mine',
    maxHp: 15 * HP_PER_PIP,
    // Comparable au footprint 2x2 de son ObstacleDef (voir
    // ownedBuildingObstacle, main.ts) sans être identique — juste le
    // reach d'attaque adverse, pas la hitbox de collision physique (gérée
    // séparément par l'obstacle). Valeur choisie par Claude, non donnée par
    // Antoine.
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 1.6,
    // Prix de base en Or (20 ; 100 avant la refonte economique autour de
    // la Forge). Remplace l'ancienne acquisition automatique
    // via le talent "Le temps, c'est de l'argent" (retiré, voir
    // data/talents.ts).
    cost: 20,
    buildingModel: 'blue_mine',
    footprintTilesX: 2,
    footprintTilesZ: 2,
  },
  // "25 HP" (Antoine) -> 250 interne.
  ballista: {
    id: 'ballista',
    displayName: 'Baliste',
    maxHp: 25 * HP_PER_PIP,
    // Légèrement plus grand que la Mine — la baliste+tour est visuellement
    // plus imposante (voir render/ballista.ts, BALLISTA_TOWER_FOOTPRINT =
    // 2.4). Valeur choisie par Claude, non donnée par Antoine.
    radius: 1.2,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.2,
    // Pas de `cost` : jamais achetable/replaçable, toujours présente une
    // fois pour toutes (voir main.ts, onValidatePlacement) — inchangé par ce
    // chantier.
  },
  // Caserne (2026-08-17, demande explicite d'Antoine) — nouveau bâtiment
  // GAMEPLAY achetable, produit automatiquement des Fantassins pendant la
  // bataille (voir sim/systems/barracksSystem.ts). PV V1 choisis par Claude
  // (fourchette "20 à 30 HP" donnée par Antoine, "plus résistante qu'une
  // petite unité mais moins tanky qu'une Sentinelle très améliorée") : 25 HP,
  // à mi-chemin de la fourchette — ISOLÉE ici pour rééquilibrage ultérieur,
  // JAMAIS liée au fonctionnement de la production (voir CLAUDE.md, point 22
  // de la demande).
  barracks: {
    id: 'barracks',
    displayName: 'Caserne',
    maxHp: 25 * HP_PER_PIP,
    // Empreinte 3x3 (demande d'Antoine) : rayon d'atteinte et hauteur de
    // barre agrandis dans la meme proportion que le modele (x1,5, ajuste a
    // l'empreinte par cloneScaledToFootprint). Ancien 2x2 : 1.1 / 1.8.
    radius: 1.6,
    targetable: true,
    countsForDefeat: true,
    hpBarHeight: 2.7,
    // Prix de base en Or (25 : plus cher que la Forge et la Mine, puisqu'elle
    // produit ensuite des unites sans autre depense ; 50 avant la refonte
    // economique autour de la Forge).
    cost: 25,
    buildingModel: 'blue_barracks',
    footprintTilesX: 3,
    footprintTilesZ: 3,
    // REFONTE 2026-08-17 (meme jour, retour d'Antoine apres test) : base
    // 10s -> 5s ("il faut invoquer un fantassin toutes les 5 secondes"),
    // plancher 2s -> 1s ("ne peut pas descendre en dessous de 1 seconde") —
    // voir data/barracksUpgrade.ts pour la formule d'amelioration (nombre de
    // Fantassins ET intervalle desormais tous les deux ameliorables).
    spawner: {
      unitId: 'fantassin',
      baseIntervalSeconds: 5,
      minIntervalSeconds: 1,
    },
  },
  // Forge (refonte economique) — batiment allie achetable, sans production,
  // revenu ni effet passif pour l'instant : ciblable, destructible et
  // collidable comme la Mine. Plusieurs exemplaires possibles.
  forge: {
    id: 'forge',
    displayName: 'Forge',
    maxHp: 15 * HP_PER_PIP,
    // Modele (KayKit blacksmith) plus bas et plus compact que la Caserne :
    // meme rayon que la Mine.
    radius: 1.0,
    targetable: true,
    countsForDefeat: true,
    // Modele d'environ 1,5 de haut une fois ajuste a l'empreinte 2x2 :
    // barre juste au-dessus du toit, comme la Mine.
    hpBarHeight: 1.7,
    cost: 10,
    buildingModel: 'blue_blacksmith',
    footprintTilesX: 2,
    footprintTilesZ: 2,
  },
};

/** Ids de bâtiments réellement ACHETABLES en boutique de run (2026-08-17) —
 *  filtre générique sur `cost !== undefined`, jamais une liste recopiée à la
 *  main (voir ui/screens.ts, l'onglet "Bâtiments") : un futur bâtiment avec
 *  un `cost` défini y apparaît automatiquement. */
export function listBuyableBuildingIds(): string[] {
  return Object.values(BUILDINGS)
    .filter((def) => def.cost !== undefined)
    .map((def) => def.id);
}

export function getBuilding(id: string): BuildingDef {
  const def = BUILDINGS[id];
  if (!def) throw new Error(`Bâtiment inconnu : ${id}`);
  return def;
}
