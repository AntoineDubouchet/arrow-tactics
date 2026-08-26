import { getTalent, TALENTS } from '../data/talents';
import { getUnitUpgradeDef, nextUpgradeCost, type RuneCostDef } from '../data/unitUpgrades';
import { getUnit } from '../data/units';

const STORAGE_KEY = 'arrow-tactics.meta-progress.v1';

/** Version 2 (2026-08-10) : abandon de l'arbre a 21 nœuds/rangs/paliers de
 *  points au profit d'une progression par palier de vague (voir
 *  data/talents.ts) — aucune correspondance sensee n'existe entre un ancien
 *  "rang 2/3 en Pillage" et un futur "choix A du palier 3", donc la
 *  migration ne PORTE PAS ces donnees : elle les efface proprement (voir
 *  migrateToV2) sans toucher au reste (unlockedUnits notamment, qui n'a
 *  jamais eu de rapport avec les talents). */
export const TALENT_TREE_VERSION = 2;

/**
 * Vagues qui doivent etre TERMINEES (gagnees) pour accorder un point de
 * talent la PREMIERE FOIS — une seule fois pour toujours (voir
 * claimedWaveRewards), pas a chaque run qui les retraverse. REFONTE
 * 2026-08-10 (meme journee) : Antoine a explicitement retire le mecanisme
 * precedent ("il faut faire mieux que la derniere run pour le debloquer...
 * ca ne fonctionnera pas de la sorte") — plus de comparaison a un record
 * historique (highestWaveReached, garde seulement comme statistique
 * affichee, ne bloque plus rien) ni de systeme de "palier a 2 choix"
 * (TalentTierDef/TalentChoiceDef retires entierement, n'avaient de toute
 * facon aucun contenu). A la place : une simple LISTE de vagues, choisie par
 * Antoine ("c'est moi qui etablirait a quelle vague le prochain point de
 * talent est disponible").
 *
 * Semantique CORRIGEE le meme jour, plus tard : la premiere version
 * accordait le point des l'ARRIVEE sur la vague listee (donc a la reussite
 * de la vague PRECEDENTE) — Antoine a explicitement change d'avis : "un
 * point de talent doit etre disponible après avoir terminé la vague 4
 * désormais". Chaque entree represente donc maintenant la vague qu'il faut
 * REELLEMENT GAGNER (pas seulement atteindre) pour debloquer le point —
 * voir registerWaveReached, comparaison `waveNumber > wave` (strict, pas
 * `>=`). Sur une DEFAITE a la vague listee elle-meme, waveNumber ne bouge
 * pas (applyBattleOutcome n'incremente que sur victoire) : le point n'est
 * donc PAS accorde tant que la vague n'est pas reellement remportee, meme si
 * le joueur l'a jouee jusqu'au bout.
 */
export const TALENT_POINT_WAVES: number[] = [4];

/**
 * Palier RECURRENT (2026-08-11, demande explicite d'Antoine : "désormais à
 * partir de la manche 6, vous gagnez un point de talent toutes les deux
 * manches (donc un point en validant la vague 6, un point pour la vague 8
 * etc.)") — s'ajoute a TALENT_POINT_WAVES (fixe, une seule entree pour
 * l'instant : la vague 4), ne le remplace pas. Meme regle "REELLEMENT
 * GAGNEE" que ci-dessus (voir registerWaveReached) : gagner la vague 6
 * donne un point, gagner la vague 7 n'en redonne pas, gagner la vague 8 en
 * redonne un, etc. — a l'infini, aucun plafond.
 */
export const TALENT_POINT_RECURRING_START = 6;
export const TALENT_POINT_RECURRING_INTERVAL = 2;

/**
 * PRECISION d'Antoine (2026-08-10, apres avoir teste une premiere run
 * terminee des la vague 2 sans recevoir de point) : le tout PREMIER point de
 * talent d'une sauvegarde ne doit dependre d'AUCUN palier de vague — "il
 * doit simplement etre gagne apres la premiere run que je lance sur ma
 * sauvegarde [...] ensuite les points de talents se gagneront apres avoir
 * termine des numeros de vagues" (TALENT_POINT_WAVES ci-dessus, inchange
 * pour les points SUIVANTS). Mecanisme totalement independant de
 * registerWaveReached — voir grantFirstRunPointIfNeeded, MetaProgress.firstRunPointGranted.
 * "Terminee" = la run s'arrete pour de bon (defaite totale,
 * currentRun.army.length === 0, voir main.ts) — peu importe la vague
 * atteinte, un abandon manuel (Echap -> Quitter) ne compte toujours pas
 * (coherent avec le reste de la progression permanente).
 */

export interface MetaProgress {
  talentTreeVersion: number;

  // --- Heritage conserve (demande explicite d'Antoine, 2026-08-10 : "je
  // veux uniquement garder les trois talents fondateurs et le nom des
  // specialisations restera le meme") — talent universel + 3 fondateurs,
  // voir data/talents.ts. Plus d'exclusivite entre eux depuis la meme
  // journee (deuxieme demande : "on va deverrouiller les specialisations
  // [...] quand on met un point dans une autre") — achetables librement et
  // independamment, chacun pour son propre cout. Alimente par
  // firstRunPointGranted (le tout premier point) puis TALENT_POINT_WAVES
  // (les suivants) — plus de gain automatique "1 point par run".
  talentPoints: number;
  unlockedTalents: string[];
  /** Vrai des que le point "premiere run" a ete accorde — empeche de le
   *  redonner a chaque run suivante. Voir grantFirstRunPointIfNeeded. */
  firstRunPointGranted: boolean;

  /** Meilleure vague JAMAIS atteinte, toutes runs confondues — PURE
   *  STATISTIQUE affichee dans l'ecran de talents, ne bloque plus rien
   *  depuis le 2026-08-10 (voir TALENT_POINT_WAVES). Ne recule jamais. */
  highestWaveReached: number;
  /** Vagues de TALENT_POINT_WAVES deja recompensees — empeche de regagner
   *  un point en retraversant la meme vague dans une run future. */
  claimedWaveRewards: number[];

  // --- Sans rapport avec les talents, NE JAMAIS toucher lors d'une
  // migration/reset de la progression de talents ci-dessus.
  /** Ids d'unites ENNEMIES deja vaincues au moins UNE FOIS, toutes runs
   *  confondues (2026-08-15, refonte "vaincre pour débloquer" — remplace
   *  l'ancien `unlockedUnits`/deblocage specifique au Mage a la vague 8).
   *  Stocke le FAIT PERMANENT (jamais retire, meme apres un "Effacer la
   *  sauvegarde" complet suivi d'une nouvelle victoire) — demande explicite
   *  d'Antoine, point 21 : "je préfère stocker le fait réel... on peut plus
   *  tard utiliser cette donnée pour bestiaire/succès/statistiques". Le
   *  DEBLOCAGE cote joueur est TOUJOURS DERIVE de ce fait (voir
   *  canPlayerRecruitUnit), jamais stocke separement. */
  defeatedEnemyUnitIds: string[];

  // --- Boutique d'AMELIORATION PERMANENTE des unites (2026-08-13, demande
  // d'Antoine, point 34 : "TalentProgression et UnitUpgradeProgression
  // séparés... ne mélange pas leurs données") — systeme totalement
  // independant des talents ci-dessus : ni resetTalentPoints (respec des
  // talents) ni la logique de migration des talents ne doivent y toucher.
  // Voir data/unitUpgrades.ts (config par unite) et
  // run/unitUpgradeEffects.ts (calcul des bonus reels a partir du level).
  /** Monnaie permanente "Runes d'amélioration" — jamais convertie
   *  depuis/vers l'or de run ou les points de talent. */
  upgradeRunes: number;
  /** level = nombre TOTAL d'achats effectues pour cette unite (cle =
   *  UnitDef.id) — SEULE valeur stockee par unite, hpBonus/attackBonus/
   *  nextCost se derivent tous depuis ce nombre (point 9 de la demande,
   *  voir run/unitUpgradeEffects.ts). */
  unitUpgrades: Record<string, UnitUpgradeState>;
}

/** Etat permanent d'amelioration d'UNE unite (voir MetaProgress.unitUpgrades). */
export interface UnitUpgradeState {
  level: number;
}

export const DEFAULT_META_PROGRESS: MetaProgress = {
  talentTreeVersion: TALENT_TREE_VERSION,
  talentPoints: 0,
  unlockedTalents: [],
  firstRunPointGranted: false,
  highestWaveReached: 0,
  claimedWaveRewards: [],
  defeatedEnemyUnitIds: [],
  upgradeRunes: 0,
  unitUpgrades: {},
};

function cloneDefault(): MetaProgress {
  return {
    ...DEFAULT_META_PROGRESS,
    unlockedTalents: [],
    claimedWaveRewards: [],
    defeatedEnemyUnitIds: [],
    unitUpgrades: {},
  };
}

/** Fusionne l'ancien champ `unlockedUnits` (retire le 2026-08-15, ne servait
 *  qu'au deblocage du Mage/Cavalier) dans `defeatedEnemyUnitIds` — une
 *  sauvegarde ou le Mage etait deja "unlockedUnits" sous l'ancien systeme
 *  (base sur la vague, pas sur une victoire) doit continuer a le montrer
 *  disponible plutot que de faire regresser un joueur qui l'avait deja
 *  gagne. Deduplique par securite (`Set`). Appelee a la fois par la
 *  migration (tres vieilles sauvegardes) et par le chargement normal (une
 *  sauvegarde DEJA en V2, ecrite AVANT cette refonte, peut tres bien avoir
 *  `unlockedUnits: ["mage"]`). */
function mergeLegacyUnlockedUnits(obj: Record<string, unknown>, defeatedEnemyUnitIds: string[]): string[] {
  const raw = obj['unlockedUnits'];
  const legacy = Array.isArray(raw) && raw.every((u) => typeof u === 'string') ? (raw as string[]) : [];
  return Array.from(new Set([...defeatedEnemyUnitIds, ...legacy]));
}

/**
 * Migration vers le nouveau format (voir TALENT_TREE_VERSION ci-dessus).
 * Deux provenances possibles pour une sauvegarde "ancienne" :
 *  - le tout premier format, avant meme l'arbre a paliers (talentPoints +
 *    unlockedTalents plats, pas de talentTreeVersion du tout) ;
 *  - le format v1 "arbre a 21 nœuds" (talentPointsAvailable/talentRanks/
 *    introTalentRank, talentTreeVersion absent lui aussi car ce champ
 *    n'existait pas encore a ce moment-la — seule la V2 introduit un
 *    numero de version explicite).
 * Dans les DEUX cas : la progression de talents proprement dite est
 * remise a zero (aucune correspondance sensee vers le nouveau systeme,
 * voir le commentaire sur TALENT_TREE_VERSION) — mais l'ancien
 * `unlockedUnits` (Cavalier leger/Mage, sans rapport avec les talents) est
 * fusionne dans `defeatedEnemyUnitIds` si present (voir
 * mergeLegacyUnlockedUnits).
 */
/**
 * Talents RETIRES du jeu jouable, avec leur ancien cout (2026-08-17 : "Le
 * temps, c'est de l'argent" remplace par la Mine achetable en boutique de
 * run, voir data/buildings.ts — le talent n'existe plus du tout dans
 * data/talents.ts, `getTalent()` leverait si `unlockedTalents` le contenait
 * encore). Cout ecrit en DUR ici (2, valeur de l'ancienne definition
 * retiree) puisqu'il n'y a plus nulle part ailleurs ou le relire. Une
 * sauvegarde qui l'avait deja debloque est migree a CHAQUE chargement (voir
 * stripRemovedTalents) : le talent disparait de `unlockedTalents`, son cout
 * est REMBOURSE en points de talent (demande explicite d'Antoine, point 44 :
 * "je ne veux pas qu'un joueur perde définitivement ses points").
 */
const REMOVED_TALENT_REFUNDS: Record<string, number> = { temps_argent: 2 };

/**
 * Retire tout talent de `REMOVED_TALENT_REFUNDS` de `unlockedTalents` et
 * rembourse son cout — IDEMPOTENT PAR CONSTRUCTION (meme principe que
 * migrateToV2) : derive a partir des donnees BRUTES a CHAQUE chargement,
 * jamais un drapeau "deja migre" stocke a part. Une fois qu'une sauvegarde
 * REELLE survient (n'importe quelle action qui appelle saveMetaProgress —
 * achat de talent, palier de vague...), le talent retire disparait du JSON
 * persiste et ce remboursement ne se redeclenche plus jamais aux
 * chargements suivants. Sans effet (retourne les memes valeurs) si aucun
 * talent retire n'est present.
 */
function stripRemovedTalents(unlockedTalents: string[], talentPoints: number): { unlockedTalents: string[]; talentPoints: number } {
  let refund = 0;
  const filtered = unlockedTalents.filter((id) => {
    const cost = REMOVED_TALENT_REFUNDS[id];
    if (cost === undefined) return true;
    refund += cost;
    return false;
  });
  return { unlockedTalents: filtered, talentPoints: talentPoints + refund };
}

function migrateToV2(obj: Record<string, unknown>): MetaProgress {
  const fresh = cloneDefault();
  fresh.defeatedEnemyUnitIds = mergeLegacyUnlockedUnits(obj, []);
  return fresh;
}

export function loadMetaProgress(): MetaProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefault();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return cloneDefault();
    const obj = parsed as Record<string, unknown>;

    if (obj['talentTreeVersion'] !== TALENT_TREE_VERSION) return migrateToV2(obj);

    const num = (key: string, fallback: number) =>
      typeof obj[key] === 'number' && Number.isFinite(obj[key] as number) ? (obj[key] as number) : fallback;
    const strArray = (key: string): string[] => {
      const raw = obj[key];
      return Array.isArray(raw) && raw.every((v) => typeof v === 'string') ? (raw as string[]) : [];
    };
    const numArray = (key: string): number[] => {
      const raw = obj[key];
      return Array.isArray(raw) && raw.every((v) => typeof v === 'number' && Number.isFinite(v)) ? (raw as number[]) : [];
    };
    // Chaque entree validee individuellement (meme prudence que strArray/
    // numArray) : une cle corrompue ou un `level` du mauvais type est
    // simplement ignoree plutot que de rejeter toute la sauvegarde.
    const unitUpgradesRecord = (key: string): Record<string, UnitUpgradeState> => {
      const raw = obj[key];
      if (typeof raw !== 'object' || raw === null) return {};
      const result: Record<string, UnitUpgradeState> = {};
      for (const [unitId, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value !== 'object' || value === null) continue;
        const level = (value as Record<string, unknown>)['level'];
        if (typeof level === 'number' && Number.isFinite(level)) result[unitId] = { level };
      }
      return result;
    };

    // Migration "talent retire" (2026-08-17 — voir stripRemovedTalents) :
    // s'applique a CHAQUE chargement, avant de construire l'objet final —
    // idempotente par construction, aucun risque de double remboursement une
    // fois la sauvegarde reelle ecrite (voir son commentaire de fonction).
    const { unlockedTalents, talentPoints } = stripRemovedTalents(strArray('unlockedTalents'), num('talentPoints', 0));

    return {
      talentTreeVersion: TALENT_TREE_VERSION,
      talentPoints,
      unlockedTalents,
      firstRunPointGranted: obj['firstRunPointGranted'] === true,
      highestWaveReached: num('highestWaveReached', 0),
      claimedWaveRewards: numArray('claimedWaveRewards'),
      // Fusionne l'ancien `unlockedUnits` (2026-08-15, voir mergeLegacyUnlockedUnits) :
      // une sauvegarde V2 ecrite AVANT cette refonte peut deja contenir
      // "mage" sous l'ancienne cle — ne jamais faire regresser ce joueur.
      defeatedEnemyUnitIds: mergeLegacyUnlockedUnits(obj, strArray('defeatedEnemyUnitIds')),
      upgradeRunes: num('upgradeRunes', 0),
      unitUpgrades: unitUpgradesRecord('unitUpgrades'),
    };
  } catch {
    return cloneDefault();
  }
}

export function saveMetaProgress(progress: MetaProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {}
}

export function isTalentUnlocked(progress: MetaProgress, id: string): boolean {
  return progress.unlockedTalents.includes(id);
}

/** Heritage conserve (voir en-tete de fichier) : les 3 fondateurs d'origine
 *  sont achetables librement et independamment (plus d'exclusivite entre
 *  eux depuis le 2026-08-10) — seul le talent universel reste leur
 *  prerequis. Etendu le 2026-08-14 (premier "palier 2", Recyclage/Le temps
 *  c'est de l'argent, demande explicite d'Antoine : "butin de guerre doit
 *  ouvrir la porte, sur deux choix de palier 2 soit je prends recyclage
 *  soit je prends 'le temps c'est d'l'argent'") : `def.requires` ajoute un
 *  prerequis SPECIFIQUE en plus du talent universel, ET tout talent
 *  partageant ce MEME prerequis direct devient un CHOIX EXCLUSIF — en
 *  debloquer un verrouille tous ses "freres" jusqu'a un reset complet des
 *  talents (resetTalentPoints). Regle GENERIQUE (pas un champ d'exclusion
 *  code en dur entre deux id precis) : une future branche a plusieurs choix
 *  de palier fonctionnera pareil sans code supplementaire, tant que ses
 *  talents partagent le meme `requires`. */
export function canUnlockTalent(progress: MetaProgress, id: string): boolean {
  const def = TALENTS[id];
  if (!def) return false;
  if (isTalentUnlocked(progress, id)) return false;
  if (def.branch !== null && !isTalentUnlocked(progress, 'or_depart')) return false;
  if (def.requires) {
    if (!isTalentUnlocked(progress, def.requires)) return false;
    const siblingUnlocked = Object.values(TALENTS).some(
      (sibling) => sibling.id !== id && sibling.requires === def.requires && isTalentUnlocked(progress, sibling.id),
    );
    if (siblingUnlocked) return false;
  }
  return progress.talentPoints >= def.cost;
}

export function unlockTalent(progress: MetaProgress, id: string): boolean {
  if (!canUnlockTalent(progress, id)) return false;
  const def = getTalent(id);
  progress.talentPoints -= def.cost;
  progress.unlockedTalents.push(id);
  return true;
}

/**
 * Reinitialise les talents DEBLOQUES et REMBOURSE integralement les points
 * depenses (2026-08-11, demande d'Antoine : "rajoute également une option
 * reset point de talent, je pense que ça rendra la chose plus
 * confortable") — un vrai respec, pas une perte : `talentPoints` remonte
 * exactement de la somme des couts des talents retires, aucun point n'est
 * gagne ni perdu au passage. Ne touche a RIEN d'autre (highestWaveReached,
 * claimedWaveRewards, defeatedEnemyUnitIds, firstRunPointGranted) — distinct du
 * "Effacer la sauvegarde" du menu principal (resetMetaProgress), qui reste
 * un reset TOTAL et volontaire.
 */
export function resetTalentPoints(progress: MetaProgress): void {
  const refund = progress.unlockedTalents.reduce((sum, id) => sum + getTalent(id).cost, 0);
  progress.talentPoints += refund;
  progress.unlockedTalents = [];
}

/**
 * Met a jour le record de vague (pure statistique, voir MetaProgress.highestWaveReached)
 * et accorde un point de talent pour CHAQUE vague REELLEMENT GAGNEE pour la
 * premiere fois (`waveNumber > wave`, strict — waveNumber ne depasse `wave`
 * que si cette vague a ete remportee, voir applyBattleOutcome qui
 * n'incremente que sur victoire ; jamais retraverse une seconde fois, voir
 * claimedWaveRewards) parmi DEUX sources : la liste fixe TALENT_POINT_WAVES,
 * et le palier RECURRENT (TALENT_POINT_RECURRING_START, +INTERVAL —
 * 2026-08-11, "tous les 2 manches a partir de la 6") — les deux
 * s'additionnent, aucune ne remplace l'autre. Retourne true si quoi que ce
 * soit a change (record avance et/ou point(s) accorde(s)), pour que
 * l'appelant sache s'il doit sauvegarder.
 */
export function registerWaveReached(progress: MetaProgress, waveNumber: number): boolean {
  let changed = false;

  if (waveNumber > progress.highestWaveReached) {
    progress.highestWaveReached = waveNumber;
    changed = true;
  }

  const recurringMilestones: number[] = [];
  for (let w = TALENT_POINT_RECURRING_START; w < waveNumber; w += TALENT_POINT_RECURRING_INTERVAL) {
    recurringMilestones.push(w);
  }

  for (const wave of [...TALENT_POINT_WAVES, ...recurringMilestones]) {
    if (waveNumber > wave && !progress.claimedWaveRewards.includes(wave)) {
      progress.claimedWaveRewards.push(wave);
      progress.talentPoints += 1;
      changed = true;
    }
  }

  return changed;
}

/**
 * Accorde le point de talent "premiere run" (voir MetaProgress.firstRunPointGranted
 * et le commentaire en tete de fichier) — a appeler UNE FOIS a chaque fin de
 * run reelle (defaite totale, currentRun.army.length === 0, voir main.ts),
 * AVANT ou APRES registerWaveReached, peu importe l'ordre : les deux
 * mecanismes sont independants et s'additionnent. Ne fait rien et retourne
 * false si le point a deja ete accorde par le passe (n'importe quelle run
 * suivante). Retourne true si un point vient d'etre accorde, pour que
 * l'appelant sache s'il doit sauvegarder.
 */
export function grantFirstRunPointIfNeeded(progress: MetaProgress): boolean {
  if (progress.firstRunPointGranted) return false;
  progress.firstRunPointGranted = true;
  progress.talentPoints += 1;
  return true;
}

/** Sans rapport avec les talents (voir MetaProgress.defeatedEnemyUnitIds). */
export function hasDefeatedEnemyUnit(progress: MetaProgress, unitId: string): boolean {
  return progress.defeatedEnemyUnitIds.includes(unitId);
}

/** Enregistre qu'une unite ENNEMIE de type `unitId` vient d'etre vaincue
 *  (2026-08-15, systeme generique de deblocage — voir data/units.ts,
 *  UnitDef.playerUnlockMode) — stocke le FAIT PERMANENT, jamais retire.
 *  Retourne true SEULEMENT la toute premiere fois (jamais de doublon) : sert
 *  a savoir s'il faut sauvegarder et afficher le toast "nouvelle unite
 *  débloquée" (voir main.ts). Independant de `playerUnlockMode` — le fait
 *  "cette unite a ete vaincue" est enregistre pour N'IMPORTE QUELLE unite
 *  (meme une unite 'starter'), reutilisable plus tard pour un bestiaire/des
 *  succes, meme si seul `playerUnlockMode: 'defeatEnemy'` en tire un
 *  deblocage concret aujourd'hui. */
export function registerEnemyDefeat(progress: MetaProgress, unitId: string): boolean {
  if (progress.defeatedEnemyUnitIds.includes(unitId)) return false;
  progress.defeatedEnemyUnitIds.push(unitId);
  return true;
}

/** Fonction GENERIQUE demandee explicitement par Antoine (point 24 :
 *  "canPlayerRecruitUnit(unitId)") — la boutique de run (et tout futur
 *  consommateur) n'a plus jamais besoin de connaitre un id d'unite precis :
 *  une unite 'starter' (ou sans playerUnlockMode, valeur par defaut) est
 *  toujours recrutable, une unite 'defeatEnemy' seulement si elle a deja ete
 *  vaincue au moins une fois (voir registerEnemyDefeat). */
export function canPlayerRecruitUnit(progress: MetaProgress, unitId: string): boolean {
  const mode = getUnit(unitId).playerUnlockMode ?? 'starter';
  if (mode === 'starter') return true;
  return hasDefeatedEnemyUnit(progress, unitId);
}

export function resetMetaProgress(progress: MetaProgress): void {
  const fresh = cloneDefault();
  progress.talentTreeVersion = fresh.talentTreeVersion;
  progress.talentPoints = fresh.talentPoints;
  progress.unlockedTalents = fresh.unlockedTalents;
  progress.firstRunPointGranted = fresh.firstRunPointGranted;
  progress.highestWaveReached = fresh.highestWaveReached;
  progress.claimedWaveRewards = fresh.claimedWaveRewards;
  // "Effacer la sauvegarde" doit effacer ces deblocages (point 27 de la
  // demande) — meme reset total que le reste de cette fonction.
  progress.defeatedEnemyUnitIds = fresh.defeatedEnemyUnitIds;
  // Boutique d'amelioration (2026-08-13) : progression du joueur au meme
  // titre que les talents/unites debloquees ci-dessus, contrairement aux
  // parametres audio (voir CLAUDE.md) — "Effacer la sauvegarde" doit donc
  // aussi remettre les runes et tous les niveaux d'amelioration a zero
  // (point 33 de la demande d'Antoine).
  progress.upgradeRunes = fresh.upgradeRunes;
  progress.unitUpgrades = fresh.unitUpgrades;
  saveMetaProgress(progress);
}

// --- Boutique d'amelioration permanente des unites (2026-08-13) -----------
//
// Systeme separe des talents ci-dessus (voir le commentaire sur
// MetaProgress.upgradeRunes) : gain de runes a chaque VICTOIRE de vague
// (awardUpgradeRunesForWaveWin) + achat par unite (canPurchaseUnitUpgrade/
// purchaseUnitUpgrade). Le calcul des BONUS reels (PV/attaque/cout Gold) vit
// dans run/unitUpgradeEffects.ts, qui lit `getUnitUpgradeLevel` ci-dessous —
// ce fichier-ci ne connait que le stockage/l'achat, jamais le gameplay.

/** +10 runes pour CHAQUE vague REELLEMENT GAGNEE (point 4 de la demande —
 *  pas seulement en fin de run). L'appelant (main.ts) est responsable de
 *  n'appeler ceci QU'UNE SEULE FOIS par victoire reelle — voir le commentaire
 *  au site d'appel (meme point de verite deja utilise pour WAVE_CLEAR_BONUS/
 *  registerWaveReached : le callback de fin de bataille ne s'execute jamais
 *  plus d'une fois par bataille resolue, jamais rejoue au reload). */
export const RUNES_PER_WAVE_WIN = 10;

/**
 * Recompense de runes MISE A L'ECHELLE par palier de 10 vagues (2026-08-15,
 * chantier polish/equilibrage, demande explicite d'Antoine) — double tous
 * les 10 numeros de vague : `RUNES_PER_WAVE_WIN * 2^floor(waveNumber/10)`.
 * `waveNumber` est le numero de vague REELLEMENT AFFICHE au joueur ("Vague
 * N", 1-indexe) — voir main.ts, `waveBeingFought` (capture AVANT
 * l'incrementation de RunState.waveNumber par applyBattleOutcome, la meme
 * valeur deja utilisee pour l'indicateur de vague et la banniere de fin de
 * vague), jamais le numero POST-incrementation. Verifie contre le tableau de
 * valeurs demande par Antoine : vagues 1-9 -> 10, 10-19 -> 20, 20-29 -> 40,
 * 30-39 -> 80, 40-49 -> 160.
 */
export function upgradeRunesRewardForWave(waveNumber: number): number {
  return RUNES_PER_WAVE_WIN * Math.pow(2, Math.floor(waveNumber / 10));
}

/** `waveNumber` : la vague REELLEMENT GAGNEE (voir upgradeRunesRewardForWave
 *  ci-dessus) — l'appelant (main.ts) reste responsable de n'appeler ceci
 *  QU'UNE SEULE FOIS par victoire reelle (meme garde-fou qu'avant ce
 *  changement, non modifie ici). */
export function awardUpgradeRunesForWaveWin(progress: MetaProgress, waveNumber: number): number {
  const reward = upgradeRunesRewardForWave(waveNumber);
  progress.upgradeRunes = roundRunes(progress.upgradeRunes + reward);
  return reward;
}

/** Nombre d'achats DEJA effectues pour `unitId` — 0 si jamais achete. */
export function getUnitUpgradeLevel(progress: MetaProgress, unitId: string): number {
  return progress.unitUpgrades[unitId]?.level ?? 0;
}

/** Version GENERIQUE (2026-08-13, extension Baliste/Parchemin de soin) —
 *  n'importe quelle amelioration a base de runes (id + RuneCostDef), pas
 *  seulement les unites. `canPurchaseUnitUpgrade`/`purchaseUnitUpgrade`
 *  ci-dessous restent des enveloppes minces autour de celle-ci pour les
 *  appelants existants (ecran boutique d'amelioration, main.ts) — ne
 *  cassent rien, meme comportement qu'avant. */
/** Arrondit un montant de Runes au DIXIEME le plus proche (2026-08-17,
 *  meme motif exact que roundGold, voir run/runState.ts) — le talent
 *  "Maître de la forge" introduit des couts FRACTIONNAIRES (10/4 = 2.5,
 *  le tout premier achat de chaque amelioration, base=10) : sans ce garde-
 *  fou, des soustractions repetees sur `progress.upgradeRunes` finiraient
 *  par accumuler du bruit de virgule flottante (meme classe de bug deja
 *  rencontree et corrigee pour l'or de run — voir CLAUDE.md, "Correctif :
 *  derive de virgule flottante sur l'or"). Applique a CHAQUE mutation de
 *  `progress.upgradeRunes` (awardUpgradeRunesForWaveWin ET purchaseUpgrade),
 *  pas seulement au chemin le plus a risque — meme lecon tiree du
 *  correctif Gold ("l'ancien correctif ne couvrait QUE son propre
 *  chemin"). */
function roundRunes(amount: number): number {
  return Math.round(amount * 10) / 10;
}

/**
 * Cout EFFECTIF (en Runes) du PROCHAIN achat d'une amelioration — applique
 * le talent "Maître de la forge" (2026-08-17, palier 2 Armee, a la suite de
 * "Réflexes de vétéran" : "divise par 4 le coût de toutes les améliorations
 * de la boutique d'amélioration") PAR-DESSUS la formule de base
 * (nextUpgradeCost, data/unitUpgrades.ts). SOURCE UNIQUE utilisee a la fois
 * par canPurchaseUpgrade/purchaseUpgrade (la vraie transaction) ET par tout
 * affichage de prix (voir ui/screens.ts, refreshUnitUpgradeShop) — jamais
 * deux calculs qui pourraient diverger.
 *
 * CORRIGE (meme jour, retour direct d'Antoine apres un premier essai en
 * jeu : "les améliorations qui coûtent 10 coûtent désormais 3 et non
 * 2.5") — la premiere version ARRONDISSAIT AU PLUS PROCHE (`Math.round`),
 * ce qui gonflait artificiellement 2.5 -> 3 (rune la plus chere que la
 * vraie division par 4). Desormais la valeur EXACTE (base / 4) est
 * conservee, seulement protegee contre le bruit de virgule flottante
 * (roundRunes, au dixieme pres — jamais un arrondi qui CHANGERAIT le
 * prix, seulement un nettoyage de precision). Plancher a 0.1 rune (jamais
 * gratuit) — abaisse depuis l'ancien plancher a 1 rune entiere, qui n'a
 * plus de sens une fois des couts fractionnaires reellement affiches.
 * S'applique UNIFORMEMENT a TOUTE amelioration passant par ce systeme
 * (unites, Baliste, Parchemin de soin, Nova de glace, Mine, Caserne,
 * Sentinelle, Soins excedentaires) — aucun `if id === ...` special, le
 * talent n'a besoin d'aucun changement le jour ou une nouvelle
 * amelioration est ajoutee.
 */
export function effectiveUpgradeCost(progress: MetaProgress, costDef: RuneCostDef, level: number): number {
  const base = nextUpgradeCost(costDef, level);
  if (!isTalentUnlocked(progress, 'maitre_forge')) return base;
  return Math.max(0.1, roundRunes(base / 4));
}

export function canPurchaseUpgrade(progress: MetaProgress, id: string, costDef: RuneCostDef): boolean {
  const level = getUnitUpgradeLevel(progress, id);
  // Plafond explicite (2026-08-17, Caserne — voir RuneCostDef.maxLevel) :
  // refuse tout achat au-dela, quel que soit le nombre de runes disponibles.
  // Absent pour toutes les autres ameliorations de ce jeu, comportement
  // strictement inchange pour elles.
  if (costDef.maxLevel !== undefined && level >= costDef.maxLevel) return false;
  return progress.upgradeRunes >= effectiveUpgradeCost(progress, costDef, level);
}

/** Achat generique (voir canPurchaseUpgrade) : verifie le cout, retire les
 *  runes, incremente le level, ne fait RIEN si les runes sont insuffisantes
 *  (retourne false). Ne sauvegarde PAS elle-meme (meme motif qu'unlockTalent) —
 *  l'appelant sauvegarde immediatement apres. */
export function purchaseUpgrade(progress: MetaProgress, id: string, costDef: RuneCostDef): boolean {
  if (!canPurchaseUpgrade(progress, id, costDef)) return false;
  const level = getUnitUpgradeLevel(progress, id);
  progress.upgradeRunes = roundRunes(progress.upgradeRunes - effectiveUpgradeCost(progress, costDef, level));
  progress.unitUpgrades[id] = { level: level + 1 };
  return true;
}

export function canPurchaseUnitUpgrade(progress: MetaProgress, unitId: string): boolean {
  const def = getUnitUpgradeDef(unitId);
  if (!def) return false;
  return canPurchaseUpgrade(progress, unitId, def);
}

/** Achat d'un niveau d'amelioration permanente (point 11 de la demande) :
 *  verifie le cout, retire les runes, incremente le level, ne fait RIEN si
 *  les runes sont insuffisantes (retourne false — l'appelant affiche le
 *  feedback "runes insuffisantes"). Ne sauvegarde PAS elle-meme (meme motif
 *  qu'unlockTalent) — l'appelant (main.ts) sauvegarde immediatement apres,
 *  point 11.4 : "sauvegarder immédiatement". */
export function purchaseUnitUpgrade(progress: MetaProgress, unitId: string): boolean {
  const def = getUnitUpgradeDef(unitId);
  if (!def) return false;
  return purchaseUpgrade(progress, unitId, def);
}
