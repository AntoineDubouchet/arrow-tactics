/**
 * REFONTE 2026-08-10 (demande d'Antoine) : retour a une base simple apres
 * l'abandon de l'arbre Economie a 21 nœuds (paliers/rangs/prerequis, voir
 * historique CLAUDE.md).
 *
 * Les 20 talents mineurs Economie et toute leur logique (rangs, paliers,
 * allOf/anyOf, RNG de bataille pour Pillage, prix reellement paye pour
 * Liquidation/Assurance militaire...) ont ete retires entierement — pas
 * caches derriere l'UI, supprimes du jeu jouable.
 *
 * Le systeme de PALIERS A DEUX CHOIX envisage dans un premier temps
 * (TalentTierDef/TalentChoiceDef, gate par le record de vague du joueur) a
 * lui aussi ete retire le jour meme : Antoine a juge que le declenchement
 * "il faut battre son record" ne fonctionnerait pas ainsi et a demande a
 * choisir lui-meme, explicitement, a quelle(s) vague(s) un point de talent
 * devient disponible — voir run/metaProgress.ts, TALENT_POINT_WAVES.
 *
 * Conserves explicitement, sur demande d'Antoine ("je veux uniquement
 * garder les trois talents fondateurs et le nom des specialisations restera
 * le meme") : le talent universel et les 3 talents "fondateurs". `branch`
 * reste une etiquette PUREMENT THEMATIQUE (Economie/Precision/Armee comme
 * axes narratifs) — plus d'exclusivite entre elles : acheter un fondateur
 * n'empeche plus d'acheter les 2 autres (2026-08-10, demande explicite
 * d'Antoine, revient sur le mecanisme "specialisation exclusive et
 * permanente" garde a la passe precedente). Seul le talent universel reste
 * un prerequis des 3 fondateurs.
 *
 * PASSE DE MODERNISATION 1 (2026-11-04, decision d'Antoine) : les talents
 * sans effet dans le Hero RTS temps reel ont ete retires — Aux petits
 * oignons, Blizzard et Soins excedentaires (ils dependaient des parchemins de
 * bataille, eux-memes retires) et Recyclage (revente d'unites, retiree avec
 * la Boutique de run). Les branches Soigneur et Glace disparaissent avec eux.
 * Les sauvegardes qui les avaient debloques sont remboursees au chargement
 * (run/metaProgress.ts, REMOVED_TALENT_REFUNDS). Restent les cinq talents
 * actifs : Or de depart, Butin de guerre, Tir rapide, Mitraillette,
 * Reflexes de veteran.
 */

export type TalentBranch = 'economie' | 'precision' | 'armee';

export interface TalentDef {
  id: string;
  name: string;
  description: string;
  /** null = talent universel (racine, hors specialisation) ; sinon
   *  etiquette thematique uniquement, voir en-tete de fichier — n'impose
   *  aucune exclusivite entre branches. */
  branch: TalentBranch | null;
  cost: number;
  /** Prerequis SPECIFIQUE, en plus du talent universel — 2026-08-14, premier
   *  "palier 2" (Recyclage/Le temps, c'est de l'argent, demande d'Antoine :
   *  "ce sont des points de talents à ajouter pour le palier 2 à la suite
   *  de butin de guerre"). Absent = comportement inchange (juste le talent
   *  universel comme pour un fondateur). Verifie par canUnlockTalent
   *  (run/metaProgress.ts) en PLUS du garde-fou universel existant, jamais a
   *  sa place. */
  requires?: string;
}

export const TALENTS: Record<string, TalentDef> = {
  or_depart: {
    id: 'or_depart',
    name: 'Or de départ',
    description: 'Chaque run commence avec plus d’or.',
    branch: null,
    cost: 1,
  },
  butin_de_guerre: {
    id: 'butin_de_guerre',
    name: 'Butin de guerre',
    description: 'Chaque unité ennemie tuée rapporte 1 or supplémentaire.',
    branch: 'economie',
    cost: 1,
  },
  tir_rapide: {
    id: 'tir_rapide',
    // 2026-08-13 : vitesse de projectile 50% -> 100%, + nouveau volet degats
    // (+2, voir config/constants.ts TALENT_PROJECTILE_DAMAGE_BONUS), demande
    // explicite d'Antoine.
    name: 'Tir rapide',
    description:
      'Augmente la vitesse de tir de la flèche du joueur de 60 %, la vitesse du projectile de 100 %, et ajoute 2 points de dégâts.',
    branch: 'precision',
    cost: 1,
  },
  reflexes_fantassin: {
    id: 'reflexes_fantassin',
    name: 'Réflexes de vétéran',
    description: 'Vos hommes d’armes ont 30 % de chances supplémentaires d’esquiver une attaque.',
    branch: 'armee',
    cost: 1,
  },
  // Palier 2 de la branche Precision (2026-08-14, demande d'Antoine) — SEUL
  // talent avec `requires: 'tir_rapide'` pour l'instant, donc aucune
  // exclusivite de fratrie ne s'applique (voir le commentaire generique
  // sur `requires` en tete de fichier) : achetable des que Tir rapide est
  // debloque, independamment de tout le reste. Cout NON precise par
  // Antoine, choisi par Claude (2, meme convention que l'ancien palier 2
  // Economie, Recyclage, retire le 2026-11-04) — a ajuster si besoin.
  mitraillette: {
    id: 'mitraillette',
    name: 'Mitraillette',
    // Effet implante dans main.ts :
    //  1. totalBallistaAttackSpeedBonus() reste la SEULE source de verite
    //     pour le total des bonus de vitesse d'attaque (Tir rapide +
    //     amelioration boutique + tout futur bonus) ; ce talent MULTIPLIE
    //     CE TOTAL par TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER (3),
    //     jamais la cadence de base elle-meme (voir
    //     effectivePlayerArrowCooldown) — a 0 bonus actif, 0 x 3 = 0,
    //     aucune regression.
    //  2. buildBallistaVolleyShots() fait tirer 3 carreaux au lieu d'1 sous
    //     un seul cooldown partage (voir sim/playerArrow.ts,
    //     fireArrowVolley) : le principal vise toujours le curseur
    //     (inchange), les 2 secondaires visent les 2 ennemis vivants les
    //     plus proches du curseur (MACHINE_GUN_SECONDARY_TARGET_RADIUS),
    //     position VERROUILLEE au moment du tir (pas de tracking) — meme
    //     logique de resolution "ennemi le plus proche du point vise a
    //     l'arrivee" que le carreau principal, juste appliquee par vol.
    description:
      'Multiplie par 3 tous les bonus de vitesse d’attaque de votre Baliste. Elle tire désormais 3 carreaux à la fois : les deux carreaux supplémentaires visent les deux ennemis les plus proches de votre curseur.',
    branch: 'precision',
    cost: 2,
    requires: 'tir_rapide',
  },
};

export function getTalent(id: string): TalentDef {
  const def = TALENTS[id];
  if (!def) throw new Error(`Talent inconnu : ${id}`);
  return def;
}

/** Ordre d'affichage des branches (2026-08-14, extrait de ui/screens.ts,
 *  buildTalentTree, qui le codait localement) — source UNIQUE, reutilisee
 *  aussi par ui/talentPointToast.ts pour resumer le contenu de l'arbre sans
 *  dupliquer cette liste a un troisieme endroit. */
export const TALENT_BRANCH_ORDER: TalentBranch[] = ['economie', 'precision', 'armee'];

/** Le talent "fondateur" de chaque branche, dans TALENT_BRANCH_ORDER — un
 *  seul par branche aujourd'hui (voir TALENTS), leve si une branche listee
 *  ici n'en a pas (ne devrait jamais arriver). */
export function listFounderTalents(): TalentDef[] {
  return TALENT_BRANCH_ORDER.map((branch) => {
    const founder = Object.values(TALENTS).find((t) => t.branch === branch);
    if (!founder) throw new Error(`Aucun talent fondateur pour la branche ${branch}`);
    return founder;
  });
}

/** Talents dont `requires` pointe vers `id` (2026-08-14, premier "palier 2"
 *  — voir Mitraillette) — utilisee par
 *  ui/screens.ts pour empiler les talents dependants sous leur parent dans
 *  l'arbre, generique a n'importe quel talent (pas seulement les
 *  fondateurs) : une future branche a plusieurs niveaux fonctionnera sans
 *  changement ici. */
export function listDependents(id: string): TalentDef[] {
  return Object.values(TALENTS).filter((t) => t.requires === id);
}

/** Palier (1-indexe) d'un talent, derive de sa chaine `requires` — un
 *  fondateur (branch != null, sans `requires`) est TOUJOURS palier 1 ; un
 *  dependant est le palier de son parent + 1. Jamais un champ `tier` stocke
 *  a la main sur chaque talent (2026-08-14, refonte visuelle de l'arbre,
 *  demande d'Antoine) : la profondeur reelle des donnees (`requires`) reste
 *  l'UNIQUE source de verite, aucun risque qu'un `tier` explicite diverge
 *  un jour de la vraie chaine de prerequis. Jamais appelee sur le talent
 *  racine (branch: null) — celui-ci n'appartient a aucun palier, voir
 *  ui/screens.ts, buildTalentTree. */
export function talentTier(id: string): number {
  const def = getTalent(id);
  return def.requires ? talentTier(def.requires) + 1 : 1;
}

/**
 * Tous les talents groupes PAR PALIER, dans un ordre de lecture stable —
 * indice 0 = palier 1 (les fondateurs, dans TALENT_BRANCH_ORDER), indice 1 =
 * palier 2 (les dependants DIRECTS des talents du palier 1, dans le MEME
 * ordre que leurs parents — donc les enfants d'un meme parent restent
 * groupes cote a cote), etc. 2026-08-14, refonte visuelle de l'arbre :
 * l'ecran affiche desormais UNE LIGNE HORIZONTALE PAR PALIER (voir
 * ui/screens.ts, buildTalentTree) plutot qu'une colonne par branche — cette
 * fonction est la SOURCE UNIQUE qui determine "quel talent va sur quelle
 * ligne, dans quel ordre horizontal". Un futur talent de palier 3 (dont
 * `requires` pointe vers un talent de palier 2) apparait automatiquement
 * dans un 3e tableau, sans aucun changement de code ici ni cote UI.
 */
export function talentsByTier(): TalentDef[][] {
  const tiers: TalentDef[][] = [listFounderTalents()];
  for (;;) {
    const previous = tiers[tiers.length - 1]!;
    const next = previous.flatMap((parent) => listDependents(parent.id));
    if (next.length === 0) break;
    tiers.push(next);
  }
  return tiers;
}

/** Nombre de paliers presents dans l'arbre — voir talentsByTier(). */
export function talentTierCount(): number {
  return talentsByTier().length;
}
