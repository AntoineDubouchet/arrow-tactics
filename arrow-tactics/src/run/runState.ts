import {
  ENEMY_SENTINEL_INTERVAL,
  ENEMY_SENTINEL_START_WAVE,
  EXTRA_ENEMY_MAGE_INTERVAL,
  EXTRA_ENEMY_MAGE_START_WAVE,
  MAGE_UNLOCK_WAVE,
} from '../config/constants';
import { DEFAULT_HERO_ID, getHero } from '../data/heroes';
import { createHeroInventory, type HeroInventory } from './heroEquipment';
import { getUnit } from '../data/units';
import type { ResourceKind } from '../config/resourceNodes';
import type { RunUpgradeLevels } from './runUpgrades';
import { rollWaveReward, type WaveReward } from './waveRewards';

/**
 * Arrondit au dixieme le plus proche — SOURCE UNIQUE utilisee par TOUTE
 * mutation de RunState.gold, dans ce module ET dans main.ts (2026-08-14,
 * bug remonte par Antoine : "Or : 9.899999999999999" affiche, avec un
 * risque de resultat negatif). Cause : l'or peut recevoir des montants
 * FRACTIONNAIRES (revenu de la mine par paliers de 0.1...) — un `+=`/`-=`
 * direct, repete au fil d'une run, accumule inevitablement du bruit de
 * virgule flottante (0.1+0.2 = 0.30000000000000004 est l'exemple classique)
 * jusqu'a devenir visible a l'affichage. Arrondir apres CHAQUE mutation,
 * partout, empeche ce bruit de jamais s'accumuler.
 */
export function roundGold(amount: number): number {
  return Math.round(amount * 10) / 10;
}

/**
 * Debit d'Or centralise : refuse un montant invalide (non fini ou negatif) ou
 * superieur a l'Or disponible, sans rien modifier ; sinon retire le montant
 * (arrondi au dixieme, roundGold) et renvoie true. Ne rend jamais l'Or
 * negatif. Utilise par l'achat des ameliorations de run (run/runUpgrades.ts)
 * et des ameliorations de batiment (run/buildingUpgrades.ts) ; les achats
 * de main.ts (production, batiments, reparation) gardent pour l'instant leur
 * propre debit, avec la meme regle.
 */
export function spendGold(run: RunState, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  if (run.gold < amount) return false;
  run.gold = Math.max(0, roundGold(run.gold - amount));
  return true;
}

/**
 * Formate un montant d'or pour l'AFFICHAGE (2026-08-15). Distinct de
 * `roundGold` : ne mute JAMAIS la valeur GAMEPLAY (roundGold reste l'unique
 * source de verite pour ca), uniquement le TEXTE affiche — jamais un residu
 * de virgule flottante du style "2.49999999997" a l'ecran, jamais de ".0"
 * superflu sur un montant entier (40, pas "40.0").
 */
export function formatGold(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Etat persistant d'une RUN (Survie Hero RTS, temps reel continu) : or,
 * stock, batiments et unites possedes, progression du Heros, vague en cours.
 * Distinct de sim/entity.ts, Entity : une Entity n'existe que le temps d'une
 * partie, cet etat vit du lancement de la run a sa fin (defaite ou abandon).
 *
 * PASSE DE MODERNISATION 1 (2026-11-04) : l'inventaire de parchemins, la
 * prime de kill directe (KILL_REWARD), le bilan de manche (applyBattleOutcome)
 * et l'agrandissement de carte entre manches (mapExpansion) ont ete retires
 * avec le jeu en manches. L'or des kills est physique (tas au sol,
 * data/loot.ts), le bonus de vague repoussee reste (applyWaveVictory).
 */

export interface OwnedUnit {
  unitId: string;
  /** PV actuels (echelle interne x10, comme UnitStats.maxHp). */
  hp: number;
  // Plus de niveau propre a l'unite (2026-11-05) : la progression de la run
  // (technologies, niveaux de producteurs) est globale et retroactive, voir
  // run/playerUnitStats.ts.
}

/**
 * Un batiment GAMEPLAY pose par le joueur (Mine, Caserne — 2026-08-17,
 * chantier "bâtiments achetables") — meme role que OwnedUnit pour l'armee :
 * possede pour toute la duree de la run ; retire de `buildings` des sa
 * destruction en jeu (main.ts, pruneDestroyedOwnedBuildings). La Baliste
 * n'est JAMAIS un OwnedBuilding : elle reste hors-run, toujours presente,
 * geree separement (voir main.ts, spawnBallistaBuilding).
 */
export interface OwnedBuilding {
  buildingId: string;
  x: number;
  z: number;
  /** PV actuels (echelle interne x10) — meme convention que OwnedUnit.hp. */
  hp: number;
  /** Orientation (radians), par pas de 15° a la pose (2026-11-06, G48, voir
   *  main.ts, rotateBuildingPlacement) : l'empreinte reelle du batiment la suit
   *  (ObstacleDef.footprint). x, z et rotationY sont conserves tels quels, jamais
   *  arrondis a la grille. Absente = 0. */
  rotationY?: number;
  /** Variante visuelle choisie a la pose (index dans
   *  BuildingDef.modelVariants, 2026-11-03), conservee telle quelle :
   *  absente = premiere variante. */
  modelVariant?: number;
  /** Niveau d'amelioration PROPRE a ce batiment (Mine, Caserne), interne :
   *  0 = aucune amelioration, affiche « Niv. 1 ». Achete depuis sa fiche,
   *  voir run/buildingUpgrades.ts. Absent = 0. */
  level?: number;
  /** CHANTIER (2026-11-01, direction Hero RTS) : avancement 0..1 tant que le
   *  Heros ne l'a pas construit (sans aucun effet : production, tir,
   *  population, deblocages, ameliorations). Absent = batiment construit. */
  constructionProgress?: number;
}

/** Vrai pour un batiment construit (pas un chantier). */
export function isBuildingBuilt(b: Pick<OwnedBuilding, 'constructionProgress'>): boolean {
  return b.constructionProgress === undefined;
}

/** Progression du Heros sur la run (data/hero.ts) : Heros choisi
 *  (data/heroes.ts), XP totale, niveau, nombre de morts (delai de
 *  resurrection), mana, inventaire RPG. */
export interface HeroProgress {
  heroId: string;
  xp: number;
  level: number;
  deaths: number;
  mana: number;
  /** Inventaire unique (2026-11-02, sim/inventory.ts) : equipements du sac,
   *  items equipes. Recopie depuis l'entite du Heros a chaque image en jeu
   *  (main.ts, updateHeroUi). */
  inventory: HeroInventory;
}

/** Stock de depart de bois et de pierre d'une run : rien (2026-11-01,
 *  demande d'Antoine) — le joueur doit explorer et deposer a la Baliste avant
 *  tout chantier. PROVISOIRE. */
export const STARTING_RESOURCES: Readonly<Record<ResourceKind, number>> = { wood: 0, stone: 0 };

export interface RunState {
  gold: number;
  /** Armee de DEPART de la run (Heros, unites du camp de depart) : lue une
   *  seule fois au lancement (main.ts, startSurvivalWorld) pour creer les
   *  entites ; les unites produites ensuite ne sont jamais ajoutees ici
   *  (elles ne vivent que comme entites). */
  army: OwnedUnit[];
  /** Batiments POSSEDES par le joueur (2026-08-17) — voir OwnedBuilding.
   *  Jamais la Baliste (toujours presente hors de ce tableau). */
  buildings: OwnedBuilding[];
  /** Numero de la vague EN COURS (ou a venir) — 1 au demarrage d'une run,
   *  incremente a chaque vague repoussee (voir applyWaveVictory). Pilote la
   *  composition ennemie, voir computeEnemyWaveComposition. */
  waveNumber: number;
  /** Position de la Baliste pour la run : fixee au depart depuis la carte
   *  (MapDef.ballista, voir startNewRun) — le joueur ne la place pas.
   *  `null` seulement avant ce depart. La Baliste reste un SINGLETON hors de
   *  `buildings` (voir OwnedBuilding) — seule sa POSITION est stockee ici. */
  ballistaPosition: { x: number; z: number } | null;
  /** Niveaux d'amelioration de CETTE run (voir run/runUpgrades.ts) : seule
   *  source des niveaux lue par les formules d'effet pendant la run.
   *  Instantane propre a la run, jamais partage avec MetaProgress : le
   *  modifier ne touche pas la progression permanente, et inversement. */
  upgrades: RunUpgradeLevels;
  /** Heros : progression de la run (2026-11-01). */
  hero: HeroProgress;
  /** Bois et pierre en stock (DEPOSES a un point de collecte, couts des
   *  batiments et des murs). */
  resources: Record<ResourceKind, number>;
  /** Quantites restantes des petits tas deja entames de la carte
   *  (MapDef.resourcePiles, id -> quantite) : un tas vide ne revient pas. */
  resourcePileAmounts: Record<number, number>;
  /** Graine de la carte procedurale de la run (0 sur une carte dessinee). */
  mapSeed: number;
  /** Exemplaires poses pendant la run, par type de batiment (2026-11-03) :
   *  alternance des variantes visuelles (BuildingDef.modelVariants), sans
   *  effet retroactif d'une destruction. */
  placedBuildingCounts: Record<string, number>;
  /** Recompenses de vague en attente de choix (2026-11-05, G46), dans
   *  l'ordre des vagues ; traitees une par une par l'interface. Une
   *  sauvegarde les conserve (donnees pures). */
  pendingRewards: WaveReward[];
}

/** Vague repoussee (Survie en temps reel continu, main.ts
 *  completeSurvivalWave) : une recompense d'equipement (deux propositions au
 *  niveau de la vague, run/waveRewards.ts) mise en attente, et vague
 *  suivante, sans changement de phase. L'ancien bonus fixe de +5 or
 *  (WAVE_CLEAR_BONUS) est supprime depuis le 2026-11-05 (G46) : l'or ne
 *  vient plus que des gisements, des tas laches, de la Mine et des camps.
 *  Renvoie la recompense ajoutee. */
export function applyWaveVictory(run: RunState, seed: number): WaveReward {
  const reward = rollWaveReward(seed, run.waveNumber);
  run.pendingRewards.push(reward);
  run.waveNumber += 1;
  return reward;
}

/** Retire la recompense wave de la file (choix fait) ; false si absente. */
export function takeWaveReward(run: RunState, wave: number): boolean {
  const index = run.pendingRewards.findIndex((r) => r.wave === wave);
  if (index < 0) return false;
  run.pendingRewards.splice(index, 1);
  return true;
}

/** Or de depart d'une toute nouvelle run (20 ; 15 puis 5 avant). */
export const STARTING_GOLD = 20;

/** Hommes d'armes (identifiant `fantassin`) de l'armee de depart : aucun
 *  depuis la passe Hero RTS du 2026-11-01 (Heros et Baliste seuls ; 3 puis 4
 *  avant). Pop. 0 / 5 au depart (le Heros ne compte pas) ; le camp de depart
 *  (config/startingBase.ts) ajoute ensuite ses Villageois. */
export const STARTING_FANTASSIN_COUNT = 0;

/** Etat de depart d'une toute nouvelle run : le Heros choisi, a pleins PV.
 *  `startingGoldBonus` optionnel (par defaut 0) : talent permanent "Or de
 *  depart" (voir data/talents.ts, config/constants.ts
 *  TALENT_STARTING_GOLD_BONUS) — ce module ne sait pas ce qu'est un talent,
 *  il recoit juste le bonus deja calcule par l'appelant (main.ts).
 *  `upgrades` optionnel (par defaut aucun niveau) : niveaux d'amelioration
 *  de depart de la run, COPIES (jamais la meme reference que l'objet recu).
 *  Les Hommes d'armes de depart (STARTING_FANTASSIN_COUNT, 0) partiraient
 *  avec les PV max de BASE de l'unite. */
export function createNewRun(startingGoldBonus = 0, upgrades: RunUpgradeLevels = {}, heroId: string = DEFAULT_HERO_ID): RunState {
  const hero = getHero(heroId);
  return {
    gold: roundGold(STARTING_GOLD + startingGoldBonus),
    army: [{ unitId: hero.unitId, hp: getUnit(hero.unitId).stats.maxHp }, ...Array.from({ length: STARTING_FANTASSIN_COUNT }, () => ({ unitId: 'fantassin', hp: getUnit('fantassin').stats.maxHp }))],
    buildings: [],
    waveNumber: 1,
    ballistaPosition: null,
    upgrades: { ...upgrades },
    hero: { heroId: hero.id, xp: 0, level: 1, deaths: 0, mana: hero.mana.initial, inventory: createHeroInventory() },
    resources: { ...STARTING_RESOURCES },
    resourcePileAmounts: {},
    mapSeed: 0,
    placedBuildingCounts: {},
    pendingRewards: [],
  };
}

export interface EnemyWaveComposition {
  fantassin: number;
  archer: number;
  /** Nombre de Mages ennemis (2026-08-13, demande d'Antoine : "il apparait
   *  également pour la première fois manche 8 pour l'adversaire qui en a un
   *  exemplaire dans ses rangs") — 0 avant MAGE_UNLOCK_WAVE, puis 1 fixe (pas
   *  de croissance appliquee pour l'instant, contrairement a fantassin/archer
   *  — "un exemplaire", lu litteralement ; a ajuster si Antoine veut une
   *  croissance ici aussi une fois teste). */
  mage: number;
  /** Nombre de Sentinelles ennemies (2026-08-15, demande explicite d'Antoine :
   *  "je veux désormais voir des Sentinelles ennemies à partir de la vague
   *  10... au moins 1 rencontre garantie") — 0 avant ENEMY_SENTINEL_START_WAVE,
   *  puis croissance lente (voir ENEMY_SENTINEL_INTERVAL, poids de generation
   *  volontairement eleve). S'AJOUTE a fantassin/archer/Mage, jamais a la
   *  place. */
  sentinel: number;
}

/**
 * Composition ennemie de la vague N (roles : Homme d'armes, Archer, Mage,
 * Sentinelle ; joues par les barbares en Survie, voir data/units.ts
 * WAVE_UNIT_BY_ROLE). Historique des reglages (aout 2026, jeu en manches) :
 * vagues 1 a 6 fixees a la main apres plusieurs nerfs (3f, 5f, 5f+2a puis
 * reductions ; doublement retire au profit de +10 % compose par vague a
 * partir de la 6) ; Mage ennemi a partir de MAGE_UNLOCK_WAVE, Mages
 * supplementaires `1 + floor((vague - 10) / 3)` des la vague 10 ;
 * Sentinelles `1 + floor((vague - START) / INTERVAL)` des la vague 10.
 * Juste les EFFECTIFS ici — le placement (secteurs autour de la Baliste)
 * reste cote orchestration, voir main.ts computeEnemyWavePlan.
 *
 * ATTENTION, risque deja identifie (docs/KNOWN_ISSUES.md) : la separation
 * entre unites est en O(n^2), correcte jusqu'a ~100 unites ; a surveiller
 * au-dela de la vague 12 environ (20 x 1,1^6 + 8 x 1,1^6 + Mages +
 * Sentinelles).
 */
export function computeEnemyWaveComposition(waveNumber: number): EnemyWaveComposition {
  const extraMages = waveNumber < EXTRA_ENEMY_MAGE_START_WAVE ? 0 : 1 + Math.floor((waveNumber - EXTRA_ENEMY_MAGE_START_WAVE) / EXTRA_ENEMY_MAGE_INTERVAL);
  const mage = (waveNumber >= MAGE_UNLOCK_WAVE ? 1 : 0) + extraMages;
  const sentinel =
    waveNumber < ENEMY_SENTINEL_START_WAVE ? 0 : 1 + Math.floor((waveNumber - ENEMY_SENTINEL_START_WAVE) / ENEMY_SENTINEL_INTERVAL);
  if (waveNumber === 1) return { fantassin: 2, archer: 0, mage, sentinel };
  if (waveNumber === 2) return { fantassin: 4, archer: 0, mage, sentinel };
  if (waveNumber === 3) return { fantassin: 4, archer: 2, mage, sentinel };
  if (waveNumber === 4) return { fantassin: 5, archer: 2, mage, sentinel };
  if (waveNumber === 5) return { fantassin: 10, archer: 4, mage, sentinel };
  if (waveNumber === 6) return { fantassin: 20, archer: 8, mage, sentinel };

  const growth = 1.1 ** (waveNumber - 6);
  return { fantassin: Math.round(20 * growth), archer: Math.round(8 * growth), mage, sentinel };
}

/**
 * Point d'ancrage economique generique pour les talents (voir
 * run/talentEffects.ts pour le calcul reel a partir de MetaProgress). Ce
 * module ne sait toujours pas ce qu'est un talent — il recoit juste une
 * fonction deja calculee par l'appelant (main.ts). Absent = no-op (talent
 * non debloque = bonus nul).
 */
export interface TalentEconomyHooks {
  /** Or supplementaire dans le tas lache par chaque ennemi tue (Butin de
   *  guerre) — pose sur World.goldDropBonus au lancement de la run. */
  bonusGoldPerKill?(): number;
}
