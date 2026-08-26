/**
 * Donnees pures, comme units.ts/items.ts/talents.ts : aucune logique ici.
 *
 * Premiere VRAIE capacite d'unite generique (2026-08-10, demande explicite
 * d'Antoine : "la Charge doit etre la premiere vraie capacite d'unite
 * generique, pas un morceau de code special Cavalier... quand on creera le
 * Porte-bouclier, un soigneur, un mage, les mini-boss, etc., Claude pourra
 * ensuite leur donner des capacites sans reconstruire le moteur a chaque
 * nouvelle unite"). D'ou `AbilityDef` deja une UNION (un seul membre pour
 * l'instant, `ChargeAbility`) plutot qu'une interface figee — un futur soin/
 * buff/capacite a zone s'ajoutera comme un nouveau membre de cette union,
 * jamais comme un champ special sur UnitDef.
 *
 * Une capacite est CONFIGUREE directement sur l'unite qui la possede
 * (UnitDef.abilities, voir units.ts) plutot que reference par id depuis un
 * catalogue partage (contrairement a data/talents.ts/items.ts) : deux unites
 * differentes pourraient vouloir "le meme type de capacite" avec des reglages
 * differents (ex. la charge du futur Chevalier lourd, plus devastatrice mais
 * probablement plus lente a recharger, que celle du Cavalier leger) — un
 * catalogue partage aurait force soit des doublons d'entrees, soit un
 * mecanisme de "surcharge" superflu pour un si petit nombre de champs.
 */

export interface ChargeAbility {
  type: 'charge';
  /** Secondes avant de pouvoir redeclencher la capacite. */
  cooldown: number;
  /** Distance maximale (en CASES, coherent avec attackRange/aggroRange —
   *  voir CLAUDE.md "Unite de mesure : la case") a laquelle une cible peut
   *  etre chargee. */
  maxRangeTiles: number;
  /** Degats a l'impact, echelle interne x10 comme UnitStats.damage. */
  damage: number;
  /** Vitesse de la ruee elle-meme (cases/seconde) — voir CHARGE_DASH_SPEED
   *  dans config/constants.ts, INDEPENDANTE de UnitStats.moveSpeed. */
  dashSpeed: number;
}

/**
 * Attaque de zone TELEGRAPHIEE a position VERROUILLEE (2026-08-11, premiere
 * unite : le Mage, "Boule de feu" — voir CLAUDE.md pour la demande complete
 * d'Antoine). Generique par construction : n'importe quelle future capacite
 * "incante -> verrouille un point -> projectile -> degats de zone au point"
 * (catapulte, mini-boss, sort de bataille...) reutilise cette meme forme,
 * jamais une nouvelle capacite figee sur une seule unite.
 *
 * Sequence : recherche de cible -> choix de zone (voir
 * sim/systems/abilities.ts, findBestAreaImpact) -> incantation (castTime,
 * position deja verrouillee et NE bouge plus) -> projectile (travel) ->
 * impact -> degats de zone -> cooldown. Le cooldown demarre au DEBUT de
 * l'incantation (comme la Charge demarre le sien au declenchement), pas a
 * l'impact — sinon rien n'empeche techniquement un enchainement plus rapide
 * que prevu si castTime variait un jour.
 */
export interface AreaBlastAbility {
  type: 'area-blast';
  /** Secondes entre deux DECLENCHEMENTS (debut d'incantation), pas entre deux
   *  impacts — voir le commentaire ci-dessus. Inclut donc implicitement le
   *  temps d'incantation. */
  cooldown: number;
  /** Distance minimale (cases) : en-dessous, l'attaque est REFUSEE (trop
   *  proche pour etre utilisee) — voir UnitStats.engageRange pour la logique
   *  de repli au corps a corps quand un ennemi est plus proche que ca. */
  minRangeTiles: number;
  /** Distance maximale (cases) a laquelle une cible peut etre visee. */
  maxRangeTiles: number;
  /** Secondes d'incantation avant le depart du projectile — la position
   *  d'impact est verrouillee des le DEBUT de cette periode (voir
   *  Entity.cast), jamais mise a jour ensuite meme si les cibles bougent. */
  castTime: number;
  /** Vitesse du projectile apres l'incantation (cases/seconde) — determine
   *  la duree du vol visuel ET logique (l'impact ne se resout qu'a
   *  l'arrivee, jamais avant). */
  projectileSpeed: number;
  /** Degats a l'impact, echelle interne x10 — appliques A CHAQUE unite
   *  ennemie touchee (pas repartis entre elles). */
  damage: number;
  /** Rayon (cases) autour du point d'impact verrouille dans lequel toute
   *  unite ennemie encaisse `damage`. */
  radiusTiles: number;
  /** Recul ("bump d'impact", 2026-08-11 — meme principe que
   *  CHARGE_KNOCKBACK_TILES pour la Charge du Cavalier, demande d'Antoine
   *  apres avoir vu l'explosion en jeu) inflige a CHAQUE cible touchee, en
   *  CASES, radialement depuis le point d'impact (pas depuis le lanceur) —
   *  optionnel, absent/0 = aucun recul. */
  knockbackTiles?: number;
}

/**
 * Provocation (Sentinelle, 2026-08-14, demande complete d'Antoine) —
 * declenchement AUTOMATIQUE (comme la Charge/la Boule de feu) des qu'au
 * moins un ennemi valide est dans `radiusTiles`, voir sim/systems/abilities.ts,
 * tryTriggerTaunt. Contrairement a Charge/AreaBlast, aucun etat de vol/
 * incantation : l'effet (forcer la cible + gagner du Shield) est INSTANTANE
 * au moment du declenchement.
 */
export interface TauntAbility {
  type: 'taunt';
  /** Secondes avant de pouvoir redeclencher. */
  cooldown: number;
  /** Rayon (cases) de recherche des ennemis a provoquer. */
  radiusTiles: number;
  /** Secondes pendant lesquelles une cible provoquee garde la Sentinelle
   *  comme cible FORCEE (voir Entity.tauntTimer/tauntSourceId,
   *  sim/systems/targeting.ts). */
  tauntDuration: number;
  /** Duree de vie du bouclier temporaire gagne (secondes) — distincte de
   *  tauntDuration. */
  shieldDuration: number;
  /** Points de bouclier, echelle INTERNE (x10, meme convention que
   *  UnitStats.damage/maxHp) gagnes PAR ENNEMI EFFECTIVEMENT provoque — voir
   *  Entity.tauntShieldBonus (meme echelle) pour le bonus permanent AJOUTE a
   *  cette base (boutique d'amelioration). Construit dans data/units.ts a
   *  partir de la constante AFFICHEE SHIELD_PER_TAUNTED_ENEMY x HP_PER_PIP —
   *  jamais un litteral affiche directement ici. */
  baseShieldPerTarget: number;
  /** Verrou initial (secondes de temps de simulation DEPUIS LE DEBUT DE LA
   *  BATAILLE, voir World.time) pendant lesquelles cette capacite est
   *  INTERDITE, quelles que soient les autres conditions — absent/0 =
   *  aucun verrou (comportement par defaut pour toute future unite a
   *  Provocation qui n'en voudrait pas). Generique par construction :
   *  tryTriggerTaunt (sim/systems/abilities.ts) le lit sans jamais savoir
   *  quelle unite le possede. DISTINCT de `cooldown` (le cooldown normal
   *  APRES chaque utilisation, jamais remplace ni artificiellement
   *  consomme par ce verrou). */
  initialLockoutSeconds?: number;
}

/** Union extensible : un futur type ('heal', 'buff'...) s'ajoute ici,
 *  jamais comme champ special sur UnitDef ou logique dispersee ailleurs. */
export type AbilityDef = ChargeAbility | AreaBlastAbility | TauntAbility;

/** Retrouve, parmi les capacites d'une unite, celle d'un type donne — typee
 *  precisement (Extract) plutot qu'un simple `.find()` qui retomberait sur
 *  `AbilityDef | undefined` generique. */
export function findAbility<T extends AbilityDef['type']>(
  abilities: AbilityDef[] | undefined,
  type: T,
): Extract<AbilityDef, { type: T }> | undefined {
  return abilities?.find((a): a is Extract<AbilityDef, { type: T }> => a.type === type);
}
