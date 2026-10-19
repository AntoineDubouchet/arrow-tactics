import {
  ENEMY_SENTINEL_INTERVAL,
  ENEMY_SENTINEL_START_WAVE,
  EXTRA_ENEMY_MAGE_INTERVAL,
  EXTRA_ENEMY_MAGE_START_WAVE,
  MAGE_UNLOCK_WAVE,
} from '../config/constants';
import { getItem } from '../data/items';
import { getUnit } from '../data/units';
import type { Entity } from '../sim/entity';
import { createInitialMapExpansionState, type MapExpansionState } from './mapExpansion';
import type { RunUpgradeLevels } from './runUpgrades';
import { SURVIVAL_BASE_MAP } from '../config/maps/survivalArena';

/**
 * Arrondit au dixieme le plus proche — SOURCE UNIQUE utilisee par TOUTE
 * mutation de RunState.gold, dans ce module ET dans main.ts (2026-08-14,
 * bug remonte par Antoine : "Or : 9.899999999999999" affiche dans la
 * boutique, avec un risque de resultat negatif). Cause : l'or peut recevoir
 * des montants FRACTIONNAIRES (recompense de kill archer = 1.5, revenu de
 * la mine par paliers de 0.1...) — un `+=`/`-=` direct, repete au fil d'une
 * run, accumule inevitablement du bruit de virgule flottante (0.1+0.2 =
 * 0.30000000000000004 est l'exemple classique) jusqu'a devenir visible a
 * l'affichage (`String(gold)` brut, sans formatage). Arrondir apres CHAQUE
 * mutation, partout, empeche ce bruit de jamais s'accumuler au lieu de le
 * corriger une fois de temps en temps sur un seul chemin de code (l'ancien
 * correctif de l'or de la mine, 2026-08-14, ne couvrait QUE son propre
 * chemin — les achats/ventes/recompenses de kill en dehors de la mine
 * pouvaient encore deriver).
 */
export function roundGold(amount: number): number {
  return Math.round(amount * 10) / 10;
}

/**
 * Debit d'Or centralise : refuse un montant invalide (non fini ou negatif) ou
 * superieur a l'Or disponible, sans rien modifier ; sinon retire le montant
 * (arrondi au dixieme, roundGold) et renvoie true. Ne rend jamais l'Or
 * negatif. Utilise par l'achat des ameliorations de run (run/runUpgrades.ts) ;
 * les achats plus anciens (unites, bâtiments, parchemins, main.ts) gardent
 * pour l'instant leur propre debit, avec la meme regle.
 */
export function spendGold(run: RunState, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  if (run.gold < amount) return false;
  run.gold = Math.max(0, roundGold(run.gold - amount));
  return true;
}

/**
 * Formate un montant d'or pour l'AFFICHAGE (2026-08-15, chantier polish/
 * equilibrage — prix des consommables desormais fractionnaires, ex. 2.5 or
 * pour un parchemin de soin ameliore). Distinct de `roundGold` : ne mute
 * JAMAIS la valeur GAMEPLAY (roundGold reste l'unique source de verite pour
 * ca), uniquement le TEXTE affiche — jamais un residu de virgule flottante
 * du style "2.49999999997" a l'ecran, jamais de ".0" superflu sur un montant
 * entier (40, pas "40.0"). Distinct aussi de `ui/goldHud.ts` (`toFixed(1)`
 * systematique, choix DELIBERE anti-scintillement pour l'or qui defile en
 * temps reel via la Mine — ne pas reutiliser cette fonction-la pour un texte
 * de prix de boutique, ni l'inverse).
 */
export function formatGold(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Etape A du chantier economie (demande d'Antoine, 2026-08-08) : l'etat
 * persistant d'une RUN — l'or et l'armee reellement possedee par le joueur,
 * qui survivent d'une vague a l'autre (roguelite classique, confirme par
 * Antoine : une unite blessee reste blessee tant qu'elle n'est pas soignee
 * en boutique, une unite morte est perdue pour de bon). Distinct de
 * sim/entity.ts, Entity : une Entity n'existe que le temps d'UNE bataille
 * (recreee a chaque World.spawn), OwnedUnit existe pour toute la duree de
 * la run.
 *
 * REFONTE 2026-08-10 (voir CLAUDE.md) : les champs `pricePaid`/`wavesSurvived`
 * et le calcul de revente base dessus (Liquidation/Recyclage/Assurance
 * militaire) ont ete retires avec l'arbre de talents a 21 nœuds qui les
 * necessitait — retour a KILL_REWARD, une table plate, pour la revente
 * comme pour les recompenses de kill.
 */

export interface OwnedUnit {
  unitId: string;
  /** PV actuels (echelle interne x10, comme UnitStats.maxHp) — un survivant
   *  blesse reste blesse jusqu'au soin, voir CLAUDE.md "Echelle des nombres". */
  hp: number;
}

/** Un objet possede, achete a la boutique (voir data/items.ts) — pas encore
 *  d'etat propre par instance (pas de "charge restante" etc.), juste un id ;
 *  la quantite se lit dans la longueur du tableau RunState.inventory. */
export interface OwnedItem {
  itemId: string;
}

/**
 * Un batiment GAMEPLAY achete et place par le joueur (Mine, Caserne —
 * 2026-08-17, chantier "bâtiments achetables") — meme role que OwnedUnit
 * pour l'armee : possede pour toute la duree de la run (survit d'une vague a
 * l'autre), mute par applyBattleOutcome (PV des survivants, batiments
 * detruits retires). Position FIXE une fois construit (contrairement a une
 * unite, jamais repositionnable apres coup — pas demande). La Baliste n'est
 * JAMAIS un OwnedBuilding : elle reste hors-run, toujours presente, geree
 * separement (voir main.ts, inchangee par ce chantier).
 */
export interface OwnedBuilding {
  buildingId: string;
  x: number;
  z: number;
  /** PV actuels (echelle interne x10) — un batiment blesse reste blesse
   *  jusqu'a la fin de la run, meme convention que OwnedUnit.hp. */
  hp: number;
  /** Orientation VISUELLE (radians), 2026-08-17 : Ctrl+molette pendant le
   *  placement fait tourner le fantome par pas de 45° (voir main.ts,
   *  requestPlaceBuilding/confirmBuildingPlacement) — PUREMENT cosmetique,
   *  jamais lue par le calcul de collision/empreinte (obstacleBounds,
   *  sim/geometry.ts, reste toujours axe sur tilesX/tilesZ quel que soit
   *  l'angle, meme principe deja etabli pour les rochers/arbres/props de
   *  l'editeur — voir render/buildings.ts, createBuildingObstacle). Absente
   *  = 0 (compatibilite avec une sauvegarde/un format anterieur a ce champ). */
  rotationY?: number;
}

export interface RunState {
  gold: number;
  army: OwnedUnit[];
  inventory: OwnedItem[];
  /** Batiments POSSEDES par le joueur (2026-08-17) — voir OwnedBuilding.
   *  Jamais la Baliste (toujours presente hors de ce tableau). */
  buildings: OwnedBuilding[];
  /** Numero de la vague EN COURS (ou sur le point de commencer) — 1 au
   *  demarrage d'une run, incremente a chaque victoire (voir
   *  applyBattleOutcome). Pilote la composition ennemie, voir
   *  computeEnemyWaveComposition. */
  waveNumber: number;
  /** Agrandissement progressif du champ de bataille (2026-08-18) — voir
   *  run/mapExpansion.ts. Repart toujours de zero avec une nouvelle run,
   *  comme l'or/l'armee/l'inventaire. */
  mapExpansion: MapExpansionState;
  /** Position CHOISIE PAR LE JOUEUR de la tour/Baliste (2026-08-18, "la
   *  première chose à faire... doit être PLACER SA TOUR") — `null`
   *  UNIQUEMENT pour une run toute neuve, jamais reinitialise ensuite (la
   *  tour garde sa position pour TOUTE la duree de la run, comme l'or/
   *  l'armee). Remplace l'ancienne position FIXE (coin du plateau, voir
   *  config/mapDef.ts computePlayerArrowOrigin — reste utilisee comme repli
   *  pour l'editeur de maps/"Tester le scenario", sans lien avec une run
   *  reelle). Note volontaire : la Baliste reste un SINGLETON hors de
   *  `buildings` (voir OwnedBuilding) — seule sa POSITION est desormais
   *  stockee ici, ses PV/son cycle de vie de bataille restent geres
   *  exactement comme avant (jamais un OwnedBuilding, voir main.ts). */
  ballistaPosition: { x: number; z: number } | null;
  /** Niveaux d'amelioration de CETTE run (voir run/runUpgrades.ts) : seule
   *  source des niveaux lue par les formules d'effet pendant la run.
   *  Instantane propre a la run, jamais partage avec MetaProgress : le
   *  modifier ne touche pas la progression permanente, et inversement. */
  upgrades: RunUpgradeLevels;
}

/** Nombre d'emplacements de l'inventaire (demande d'Antoine, 2026-08-09).
 *  Double le 2026-08-14 (demande explicite : "doubler la taille actuelle de
 *  l'inventaire du joueur", 6 -> 12) — voir ui/inventoryBar.ts (grille qui
 *  s'enroule sur plusieurs lignes plutot que de retrecir les icones) et
 *  ui/style.css, `.inventory-bar`. */
export const INVENTORY_CAPACITY = 12;

/**
 * Nombre d'EMPLACEMENTS VISUELS reellement consommes par un inventaire
 * (2026-08-14, chantier stack) : `inventory` reste un tableau plat
 * d'instances (aucun changement de donnees, voir OwnedItem), mais plusieurs
 * instances du MEME objet se regroupent desormais dans un seul emplacement
 * de la barre (voir data/items.ts, ItemDef.maxStack, et ui/inventoryBar.ts
 * pour le regroupement d'AFFICHAGE identique) — `INVENTORY_CAPACITY` limite
 * donc ce compte de PILES, pas le nombre brut d'instances. Regroupe par id
 * (l'ordre n'affecte pas la somme des ceil(compte/maxStack), donc pas besoin
 * de reproduire ici le chunking par ordre d'acquisition de la barre).
 */
export function countInventoryStacks(inventory: OwnedItem[]): number {
  const countsById = new Map<string, number>();
  for (const owned of inventory) countsById.set(owned.itemId, (countsById.get(owned.itemId) ?? 0) + 1);
  let stacks = 0;
  for (const [itemId, count] of countsById) stacks += Math.ceil(count / getItem(itemId).maxStack);
  return stacks;
}

/**
 * Y a-t-il de la place pour UN exemplaire de plus de `itemId` ? Vrai sans
 * condition si une pile deja existante de ce meme objet n'est pas encore
 * pleine (l'ajout ne cree alors AUCUN nouvel emplacement) ; sinon, vrai
 * seulement si le nombre total de piles reste sous INVENTORY_CAPACITY une
 * fois la nouvelle pile creee. Source UNIQUE partagee par main.ts (achat
 * reel) et ui/screens.ts (bouton desactive) — ne jamais dupliquer ce calcul.
 */
export function canAddItemToInventory(inventory: OwnedItem[], itemId: string): boolean {
  const maxStack = getItem(itemId).maxStack;
  const currentCount = inventory.reduce((n, owned) => n + (owned.itemId === itemId ? 1 : 0), 0);
  if (currentCount % maxStack !== 0) return true;
  return countInventoryStacks(inventory) < INVENTORY_CAPACITY;
}

/**
 * Version PLURIELLE de canAddItemToInventory (2026-08-15, achat ×5 des
 * consommables — voir main.ts, buyConsumable) : y a-t-il de la place pour
 * `quantity` exemplaires de PLUS de `itemId`, TOUS EN MEME TEMPS ? Simule
 * l'inventaire final (piles completes de `quantity` instances ajoutees) et
 * compare son nombre de piles a INVENTORY_CAPACITY — jamais un simple
 * `canAddItemToInventory` repete `quantity` fois (une pile partiellement
 * remplie par le 1er exemplaire simule pourrait a tort sembler "gratuite"
 * pour le 2e alors qu'elle ne l'est plus une fois vraiment remplie). Achat
 * ATOMIQUE : verifie la capacite AVANT toute mutation, jamais un ajout
 * partiel silencieux.
 */
export function canAddItemsToInventory(inventory: OwnedItem[], itemId: string, quantity: number): boolean {
  if (quantity <= 0) return true;
  const currentCount = inventory.reduce((n, owned) => n + (owned.itemId === itemId ? 1 : 0), 0);
  const otherStacks = countInventoryStacks(inventory.filter((owned) => owned.itemId !== itemId));
  const maxStack = getItem(itemId).maxStack;
  const stacksForThisItem = Math.ceil((currentCount + quantity) / maxStack);
  return otherStacks + stacksForThisItem <= INVENTORY_CAPACITY;
}

/**
 * Recompense en or a la mort d'une unite ENNEMIE, ET valeur de revente d'une
 * unite du JOUEUR (meme table pour les deux, demande d'Antoine) —
 * coincidence deliberement exploitee : vaut la moitie du cout d'achat de
 * l'unite (fantassin 2 -> 1, archer 3 -> 1.5, voir data/units.ts).
 */
export const KILL_REWARD: Record<string, number> = {
  fantassin: 1,
  archer: 1.5,
  mage: 5, // moitie du prix boutique (10, voir data/units.ts), meme convention
  sentinel: 20, // moitie du prix boutique (40, voir data/units.ts), meme convention
};

/** Bonus fixe a la VICTOIRE d'une vague (pas a la defaite — "terminee" est
 *  compris comme "vaincue", a confirmer si Antoine voulait autre chose). */
export const WAVE_CLEAR_BONUS = 5;

function rewardForKill(unitId: string): number {
  return KILL_REWARD[unitId] ?? 0;
}

/** Or de depart d'une toute nouvelle run (15 ; 5 a l'origine). */
export const STARTING_GOLD = 15;

/** Etat de depart d'une toute nouvelle run : un seul fantassin a pleins PV —
 *  "le minimum possible pour une partie" (Antoine). `startingGoldBonus`
 *  optionnel (par defaut 0) : talent permanent "Or de depart" (voir
 *  data/talents.ts, config/constants.ts TALENT_STARTING_GOLD_BONUS) — ce
 *  module ne sait pas ce qu'est un talent, il recoit juste le bonus deja
 *  calcule par l'appelant (main.ts). `startingFantassinMaxHp` optionnel
 *  (par defaut le maxHp de BASE du fantassin) : boutique d'amelioration
 *  permanente (2026-08-13, voir run/unitUpgradeEffects.ts) — meme principe,
 *  ce module ne sait pas ce qu'est un niveau d'amelioration, il recoit juste
 *  le maxHp EFFECTIF deja calcule par l'appelant. Correctif d'un bug remonte
 *  par Antoine ("je commence a 5/9") : sans ce parametre, le fantassin de
 *  depart avait toujours le maxHp de BASE en PV ACTUELS mais un maxHp
 *  EFFECTIF (deja boost) une fois spawne en combat (voir main.ts,
 *  playerStatOverrides) — l'unite apparaissait donc blessee des le debut.
 *  `upgrades` optionnel (par defaut aucun niveau) : niveaux d'amelioration
 *  de depart de la run, COPIES (jamais la meme reference que l'objet recu). */
export function createNewRun(startingGoldBonus = 0, startingFantassinMaxHp = getUnit('fantassin').stats.maxHp, upgrades: RunUpgradeLevels = {}): RunState {
  return {
    gold: roundGold(STARTING_GOLD + startingGoldBonus),
    army: [{ unitId: 'fantassin', hp: startingFantassinMaxHp }],
    inventory: [],
    buildings: [],
    waveNumber: 1,
    // Compteurs d'expansion de la carte de depart du Mode survie.
    mapExpansion: createInitialMapExpansionState(SURVIVAL_BASE_MAP),
    ballistaPosition: null,
    upgrades: { ...upgrades },
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
 * Composition ennemie de la vague N — REMPLACE la courbe lineaire du
 * 2026-08-10 (Antoine, apres reflexion, 2026-08-10 toujours meme journee) :
 * "je pense que la difficulte entre les manches doit etre franchement
 * grandissante". Vagues 1-3 fixees a la main (3f, 5f, 5f+2a), puis DOUBLEMENT
 * (effectifs ET composition) a chaque vague a partir de la 4 par rapport a la
 * PRECEDENTE — confirme explicitement : vague 4 = 2x vague 3 (10f+4a), vague
 * 5 = 2x vague 4 (20f+8a), et ainsi de suite (regle recursive, pas plafonnee
 * — Antoine n'a donne que 4 et 5 en exemple mais la formule generalise
 * naturellement au-dela). Juste les EFFECTIFS ici — le placement (positions
 * sur le plateau) reste cote rendu, voir main.ts.
 *
 * ATTENTION, risque deja identifie dans CLAUDE.md ("Problemes connus") : la
 * separation entre unites est en O(n^2), correcte jusqu'a ~100 unites. Cette
 * courbe double le nombre d'ennemis a chaque vague des la 4 : vague 7 =
 * 80f+32a = 112 ennemis a elle seule (+ l'armee du joueur). A surveiller des
 * les premiers tests reels au-dela de la vague 6-7, avant meme une question
 * d'equilibrage — ca peut devenir un probleme de PERFORMANCE.
 *
 * Debut de partie adouci (2026-08-10, meme journee, demande explicite
 * d'Antoine : "reduire de 1 soldat de la manche un jusqu'a la 4eme") : un
 * fantassin de moins sur les vagues 1 a 4 par rapport a la formule
 * ci-dessus (3->2, 5->4, 5+2a->4+2a, 10+4a->9+4a). Vagues 5+ INCHANGEES —
 * la reduction ne touche que le tout debut de partie, la courbe de
 * doublement continue de se calculer normalement a partir de la formule de
 * base (pas de la valeur DEJA reduite de la vague precedente), donc "vague
 * 5 = 2x vague 4" ne tient plus exactement a l'unite pres a partir d'ici —
 * assume, la reduction ne visait que l'entree en matiere.
 *
 * Vague 4 renerfee GRANDEMENT (2026-08-10, meme journee, apres test reel :
 * "la vague 4 est bien trop dur. nerf la grandement") : 9f+4a (13 ennemis,
 * quasiment le double de la vague 3) etait encore trop dur meme apres la
 * premiere reduction ci-dessus. Remplace desormais la formule de doublement
 * par une valeur fixe bien plus basse : 6f+2a (8 ennemis, +2 fantassins
 * seulement par rapport a la vague 3, memes archers) — cassé exprès du
 * calcul recursif plutot qu'un nouvel ajustement de "-1" qui resterait
 * insuffisant. Vagues 5+ INCHANGEES, memes raisons que ci-dessus : la courbe
 * de doublement repart de la formule de BASE (pas de cette valeur reduite),
 * donc le saut relatif vague4->vague5 (8 -> 28 ennemis, x3.5) devient plus
 * marque qu'avant — assume, pas demande de lisser au-dela de la vague 4 pour
 * l'instant. Valeur exacte (6f+2a, pas 5 ou 7) choisie par Claude, a
 * ajuster si Antoine la juge encore trop dure ou desormais trop facile.
 *
 * Vagues 5 et 6 nerfees de MOITIE (2026-08-11, demande explicite d'Antoine :
 * "on nerfera ensuite les vagues 5 et 6 grandement (moitie moins
 * d'unites)", suite au correctif de FPS documente plus haut). Vague 5 :
 * 20f+8a (28 ennemis) -> 10f+4a (14). Vague 6 : 40f+16a (56 ennemis) ->
 * 20f+8a (28). Meme technique que la vague 4 ci-dessus : valeur FIXE qui
 * casse le calcul recursif plutot qu'un facteur applique en plus de la
 * formule.
 *
 * Vague 4 renerfee une deuxieme fois, plus legerement (2026-08-11, apres
 * avoir atteint la vague 7 en jeu reel : "la vague 4 est egalement a nerf
 * un tout petit peu (une ou deux unites en moins)") : 6f+2a -> 5f+2a — un
 * seul fantassin de moins cette fois (choisi dans la fourchette basse de
 * "une ou deux", vu que la vague 4 avait deja recu un gros nerf la veille).
 *
 * DOUBLEMENT RETIRE (2026-08-11, meme retour : "il y a beaucoup trop [a la
 * vague 7], retire la regle qui double les unites a chaque manche et
 * adapte la pour +10% d'unites a chaque fois"). La formule
 * `5 * 2^(wave-3)` faisait 80f+32a (112 ennemis) des la vague 7, jugee bien
 * trop nombreuse. Remplacee par une croissance de +10% COMPOSEE par vague,
 * a partir de la vague 6 (20f+8a, la derniere valeur fixee a la main
 * ci-dessus) : vague 7 = vague6 * 1.1, vague 8 = vague6 * 1.1^2, etc. —
 * chaque type d'unite (fantassin/archer) croit independamment au meme
 * taux, ce qui preserve leur ratio sans calcul supplementaire. Arrondi au
 * plus proche (`Math.round`) : vague 7 = 22f+9a (31 ennemis, contre 112
 * avant) — une reduction drastique, coherente avec "beaucoup trop".
 * Vagues 1-6 INCHANGEES (valeurs fixes ci-dessus, jamais issues de cette
 * formule).
 *
 * Mage ennemi ajoute a partir de MAGE_UNLOCK_WAVE (2026-08-13, voir
 * EnemyWaveComposition.mage) : `mage` vaut 0 pour toute vague < MAGE_UNLOCK_WAVE,
 * puis 1 a partir de la — une addition INDEPENDANTE des effectifs fantassin/
 * archer ci-dessus (ne modifie ni leurs valeurs ni leur formule).
 *
 * Pression magique croissante a partir de la vague 10 (2026-08-14, demande
 * explicite d'Antoine : "je veux augmenter la variete et le danger des
 * vagues... a partir de la vague 10, l'adversaire doit recevoir des Mages
 * SUPPLEMENTAIRES", formule donnee telle quelle) — s'AJOUTE au Mage unique
 * deja present depuis MAGE_UNLOCK_WAVE (8), ne le remplace pas :
 *   vague < 10        : +0
 *   vague 10, 11, 12   : +1
 *   vague 13, 14, 15   : +2
 *   vague 16, 17, 18   : +3
 *   vague 19, 20, 21   : +4
 *   etc. (pas de plafond, comme le reste de la courbe de difficulte).
 * Formule exacte : `1 + floor((wave - 10) / 3)` pour wave >= 10, 0 sinon.
 *
 * Sentinelles ennemies a partir de ENEMY_SENTINEL_START_WAVE (2026-08-15,
 * voir EnemyWaveComposition.sentinel) — meme forme que la pression magique
 * ci-dessus mais un intervalle bien plus large (poids de generation eleve,
 * "présence raisonnable plutôt que +1 à chaque vague") : 0 avant la vague de
 * depart, puis 1 + floor((wave - START) / INTERVAL) — garantit AU MOINS 1
 * Sentinelle des la premiere vague concernee. S'ADDITIONNE a fantassin/
 * archer/Mage, ne remplace jamais rien : une vague avancee contient donc
 * bien fantassins + archers + Mages + Sentinelles (point 15 de la demande,
 * "davantage de variete de composition").
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

export interface BattleOutcome {
  goldEarned: number;
  won: boolean;
}

/**
 * Point d'ancrage economique generique pour les talents (voir CLAUDE.md,
 * chantier talents ; run/talentEffects.ts pour le calcul reel a partir de
 * MetaProgress). Ce module ne sait toujours pas ce qu'est un talent — il
 * recoit juste une fonction deja calculee par l'appelant (main.ts). Absent =
 * no-op (talent non debloque = cout nul).
 */
export interface TalentEconomyHooks {
  /** Appele UNE FOIS PAR ennemi tue (Butin de guerre). */
  bonusGoldPerKill?(): number;
}

/**
 * Recompense en or pour la mort d'une unite ennemie de type `unitId` —
 * DESORMAIS VERSEE EN TEMPS REEL a chaque kill pendant la bataille
 * (2026-08-11, demande d'Antoine : "dès que nous tuons une unité un gold
 * apparait dans notre petite fenêtre à gold, en temps réel"), plutot qu'en
 * un seul calcul groupe a la toute fin (voir applyBattleOutcome ci-dessous,
 * qui ne gere plus que le bonus de fin de vague). `hooks.bonusGoldPerKill`
 * (Butin de guerre) s'applique ICI, PAR kill, exactement comme avant —
 * seul le MOMENT du versement a change, pas le montant total sur une
 * bataille complete. Mute `run.gold` directement et renvoie le montant
 * verse (pour l'animation de gain, voir main.ts).
 */
export function awardKillGold(run: RunState, unitId: string, hooks: TalentEconomyHooks = {}): number {
  const amount = rewardForKill(unitId) + (hooks.bonusGoldPerKill?.() ?? 0);
  run.gold = roundGold(run.gold + amount);
  return amount;
}

/**
 * Applique le resultat d'une bataille TERMINEE a une RunState : bonus de
 * vague (si victoire) et armee mise a jour (PV des survivants, unites
 * mortes retirees). L'or des KILLS n'est plus calcule ici depuis le
 * 2026-08-11 (voir awardKillGold) — deja verse en temps reel pendant la
 * bataille, ce serait un double paiement de le refaire ici. Mute `run`
 * directement et retourne le detail du gain (le bonus de vague uniquement
 * desormais — voir main.ts, lastBattleGoldEarned, qui n'a plus besoin de
 * refleter les kills puisqu'ils ont deja leur propre retour visuel en temps
 * reel).
 *
 * Prend `entities` tel quel a la fin de la bataille (voir World.entities —
 * les unites mortes y restent pour toujours avec alive=false, jamais
 * retirees).
 *
 * IMPORTANT — invariant a respecter par l'appelant : les entites JOUEUR
 * doivent avoir ete spawnees dans le MEME ORDRE que `run.army` (index i <->
 * index i), et AVANT les entites ennemies — exactement le motif deja utilise
 * par onValidatePlacement/setupTestBattle. C'est cet ordre de spawn, pas un
 * id partage, qui permet de recoller chaque Entity a l'OwnedUnit dont elle
 * est issue. Les BATIMENTS gameplay (Mine, Baliste — voir sim/entity.ts,
 * Entity.isBuilding) ne font PAS partie de cet ordre : `run.army` ne suit
 * que les vraies unites achetees/possedees, jamais un batiment — peu importe
 * a quel moment ils sont spawnes par rapport aux unites.
 *
 * Victoire/defaite (2026-08-16, architecture BUILDING) : ne se limite plus a
 * "au moins une UNITE vivante" — une entite compte pour la survie de sa
 * faction si `countsForDefeat` (toujours vrai pour une unite, configurable
 * pour un batiment via BuildingDef, voir World.spawnBuilding) est vrai.
 * Aucun `if (unitId === 'mine')` ici : la Mine/la Baliste maintiennent la
 * faction du joueur "en vie" exactement comme une unite, par cette seule
 * propriete generique.
 */
export function applyBattleOutcome(run: RunState, entities: Entity[]): BattleOutcome {
  const enemyAlive = entities.some((e) => e.team === 'enemy' && e.alive && e.countsForDefeat);
  const playerAlive = entities.some((e) => e.team === 'player' && e.alive && e.countsForDefeat);
  const won = playerAlive && !enemyAlive;

  let goldEarned = 0;
  if (won) {
    goldEarned = WAVE_CLEAR_BONUS;
    run.gold = roundGold(run.gold + goldEarned);
    run.waveNumber += 1;
  }

  // Correlation ordre-de-spawn UNIQUEMENT avec les vraies unites (jamais un
  // batiment gameplay, voir le commentaire de fonction ci-dessus). Inclut
  // aussi bien les unites de depart de placement QUE les Fantassins produits
  // en cours de bataille par une Caserne (2026-08-17) — ces derniers,
  // spawnes APRES le placement initial, tombent au-dela de `run.army.length`
  // dans `playerUnitEntities` : la boucle bornee sur `run.army.length`
  // ci-dessous les ignore donc naturellement, meme un survivant ne rejoint
  // PAS l'armee permanente (choix delibere V1 — un Fantassin de Caserne est
  // "consomme" a chaque bataille, pas une acquisition durable).
  const playerUnitEntities = entities.filter((e) => e.team === 'player' && !e.isBuilding);
  const updatedArmy: OwnedUnit[] = [];
  for (let i = 0; i < run.army.length; i++) {
    const entity = playerUnitEntities[i];
    if (entity?.alive) updatedArmy.push({ unitId: run.army[i]!.unitId, hp: entity.hp });
  }
  run.army = updatedArmy;

  // Correlation ordre-de-spawn des BATIMENTS achetes par le joueur
  // (2026-08-17, Mine/Caserne — voir OwnedBuilding) — MEME principe que
  // l'armee ci-dessus. La Baliste (`unitId === 'ballista'`) en est TOUJOURS
  // exclue : jamais un OwnedBuilding, geree separement (voir main.ts,
  // inchangee par ce chantier) — sa position dans l'ordre de spawn n'affecte
  // donc jamais cette correlation, quel que soit le moment ou elle est
  // spawnee par rapport aux autres batiments.
  const playerBuildingEntities = entities.filter((e) => e.team === 'player' && e.isBuilding && e.unitId !== 'ballista');
  const updatedBuildings: OwnedBuilding[] = [];
  for (let i = 0; i < run.buildings.length; i++) {
    const entity = playerBuildingEntities[i];
    if (entity?.alive) {
      updatedBuildings.push({
        buildingId: run.buildings[i]!.buildingId,
        x: run.buildings[i]!.x,
        z: run.buildings[i]!.z,
        hp: entity.hp,
        // BUG CORRIGE (2026-08-17, remonte par Antoine : "à la manche
        // d'après il se tourne") — cet objet reconstruit un OwnedBuilding
        // FRAIS a chaque bataille, `rotationY` avait ete OUBLIEE ici :
        // toujours retombee a `undefined` (donc 0 via `?? 0` a la lecture,
        // voir main.ts ownedBuildingObstacle) des la premiere bataille,
        // quelle que soit la rotation reellement choisie par le joueur.
        rotationY: run.buildings[i]!.rotationY,
      });
    }
  }
  run.buildings = updatedBuildings;

  return { goldEarned, won };
}
