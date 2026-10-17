import { getTalent, TALENTS } from '../data/talents';
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

  // Les ameliorations ne font PAS partie de la progression permanente : elles
  // s'achetent en Or a la Forge et vivent dans RunState.upgrades (voir
  // run/runUpgrades.ts). Les anciennes cles `upgradeRunes`/`unitUpgrades`
  // d'une sauvegarde sont ignorees au chargement et disparaissent a la
  // sauvegarde suivante.
}

export const DEFAULT_META_PROGRESS: MetaProgress = {
  talentTreeVersion: TALENT_TREE_VERSION,
  talentPoints: 0,
  unlockedTalents: [],
  firstRunPointGranted: false,
  highestWaveReached: 0,
  claimedWaveRewards: [],
  defeatedEnemyUnitIds: [],
};

function cloneDefault(): MetaProgress {
  return {
    ...DEFAULT_META_PROGRESS,
    unlockedTalents: [],
    claimedWaveRewards: [],
    defeatedEnemyUnitIds: [],
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
 * "Maître de la forge" (maitre_forge, 2 points) : retire avec les Runes,
 * dont il divisait le cout ; les ameliorations s'achetent desormais en Or.
 */
const REMOVED_TALENT_REFUNDS: Record<string, number> = { temps_argent: 2, maitre_forge: 2 };

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
  saveMetaProgress(progress);
}
