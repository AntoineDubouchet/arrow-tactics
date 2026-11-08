import {
  FANTASSIN_ATTACK_COOLDOWN,
  HP_PER_PIP,
  SENTINEL_ATTACK_COOLDOWN_MULTIPLIER,
  SENTINEL_INITIAL_TAUNT_LOCKOUT,
  SENTINEL_MOVE_SPEED_MULTIPLIER,
  SHIELD_DURATION,
  SHIELD_PER_TAUNTED_ENEMY,
  TAUNT_COOLDOWN,
  TAUNT_DURATION,
} from '../config/constants';
import type { VisualFaction } from '../config/factions';
import type { AbilityDef } from './abilities';

/**
 * Donnees pures. Aucune logique ici.
 * Creer une nouvelle unite = ajouter une entree dans ce fichier, rien d'autre.
 *
 * Rappel d'echelle : toutes les valeurs de PV et de degats sont x10.
 * Un fantassin a 50 PV internes, affiches comme 5 coeurs.
 */

export interface UnitStats {
  maxHp: number;
  damage: number;
  /** Distance a laquelle l'unite s'arrete et frappe. */
  attackRange: number;
  /** Distance a laquelle l'unite remarque un ennemi et le choisit pour cible. */
  aggroRange: number;
  /** Unites de monde par seconde. */
  moveSpeed: number;
  /** Secondes entre deux attaques. */
  attackCooldown: number;
  /** 0.12 = 12% de chances de rater. Volontairement bas : le miss doit etre
   *  une information lisible, pas du bruit. */
  missChance: number;
  /** Chance QUE LA CIBLE esquive un coup qui aurait touche (distinct de
   *  missChance, qui est le taux de rate DE L'ATTAQUANT) — voir
   *  sim/systems/combat.ts. Toujours 0 dans les stats de BASE ci-dessous :
   *  c'est un talent permanent (arbre de talents, branche "armee") qui
   *  l'augmente via un statOverride passe a World.spawn, jamais une stat de
   *  base lue en dur ici. */
  dodgeChance: number;
  /** Rayon du corps, utilise pour la separation entre unites. */
  radius: number;
  /** Exception reservee a la charge du chevalier. */
  canAttackWhileMoving: boolean;
  /** Elan de l'attaque de base (s), 0 ou absent = coup resolu des le depart
   *  (toutes les unites d'avant 2026-11). Sinon le coup (rate, esquive,
   *  degats) n'est resolu qu'a la fin de l'elan, et un ordre de deplacement
   *  pendant l'elan l'annule (sim/systems/combat.ts). Toujours inferieur a
   *  attackCooldown. */
  attackWindup?: number;
  /** Distance (cases) a laquelle movementSystem arrete de POURSUIVRE une
   *  cible verrouillee — absent = retombe sur `attackRange` (comportement
   *  IDENTIQUE a avant l'introduction de ce champ pour toute unite qui ne le
   *  definit pas). Sert aux unites dont l'attaque PRINCIPALE a une portee
   *  bien plus grande que leur `attackRange` de repli au corps a corps (voir
   *  le Mage, 2026-08-11) : `attackRange` continue de gouverner UNIQUEMENT
   *  combatSystem (l'attaque de repli), pendant qu'`engageRange` gouverne
   *  QUAND l'unite s'arrete d'avancer — sans ce champ, il faudrait choisir
   *  entre "s'arrete trop tard" (attackRange = melee) et "le corps-a-corps
   *  de repli porte bien trop loin" (attackRange = portee principale). */
  engageRange?: number;
  /** Immunite generique a la Provocation (Sentinelle, voir data/abilities.ts
   *  TauntAbility) — absent/false pour TOUTES les unites actuelles (demande
   *  explicite d'Antoine : "ne crée pas inutilement une immunité sur les
   *  unités actuelles"), reserve pour un futur boss. */
  tauntImmune?: boolean;
  /** Franchit l'eau (cases d'une surface d'eau, voir
   *  config/groundSurfaces.ts, isWaterSurface) : trajets, collision et
   *  destinations l'ignorent. Absent/false pour TOUTES les unites actuelles
   *  (2026-11-01) ; reserve a de futures unites (volantes, amphibies). */
  canTraverseWater?: boolean;
}

export interface UnitVisual {
  /** Quel constructeur de silhouette utiliser dans render/unitMesh.ts */
  kit: 'fantassin' | 'archer' | 'mage' | 'sentinel' | 'oracle' | 'piquier' | 'vengeur' | 'hero' | 'cavalier' | 'cavalier_barbare' | 'villageois';
  /** Famille d'assets (config/factions.ts), independante du camp : absent =
   *  humains. `barbarian` : modele Toon RTS barbare du meme role (kit). */
  faction?: VisualFaction;
  /** Hauteur monde (voir config/constants.ts, HP_BAR_WORLD_HEIGHT) a
   *  laquelle ancrer la barre de PV de CETTE unite specifiquement — absent
   *  = retombe sur HP_BAR_WORLD_HEIGHT (comportement inchange pour toute
   *  unite qui ne le definit pas). Config statique, jamais une BoundingBox
   *  recalculee en jeu (2026-08-14, demande explicite d'Antoine : "pas
   *  besoin de recalculer une BoundingBox couteuse chaque frame, fais-le au
   *  chargement/setup si necessaire") — valeur mesuree UNE FOIS hors-ligne
   *  (script jetable, THREE.Box3 sur le modele reellement charge, apres
   *  application de son *_MODEL_SCALE) plutot que devinee. */
  hpBarHeight?: number;
}

export interface UnitDef {
  id: string;
  /** Nom affiche (couche de nom propre : l'identifiant technique ne change
   *  pas, ex. `fantassin` affiche « Homme d'armes »). */
  name: string;
  /** Pluriel affiche, si le `s` final ne suffit pas (voir unitPluralName). */
  pluralName?: string;
  /** Unite du camp NEUTRE (occupants de la carte, PvE) : toujours du cote
   *  adverse, quel que soit le territoire ; jamais recrutee par le joueur. */
  neutral?: boolean;
  /** Cout en credits lors de la composition d'armee. */
  cost: number;
  /** Places de population occupees par une unite du joueur (voir
   *  data/population.ts) ; source unique pour l'equilibrage. */
  populationCost: number;
  stats: UnitStats;
  visual: UnitVisual;
  /** Capacites speciales de l'unite (voir data/abilities.ts) — absent ou
   *  tableau vide pour une unite qui n'en a aucune (fantassin, archer).
   *  La Charge (data/abilities.ts) n'est portee par aucune unite depuis le
   *  retrait du Cavalier leger. */
  abilities?: AbilityDef[];
  /** Unite economique (Villageois, 2026-11-03) : recolte
   *  (sim/systems/workers.ts), tout credite directement au stock. Absent :
   *  unite de combat. */
  worker?: boolean;
  /** Le Heros (data/hero.ts) : progression propre (niveau, equipement),
   *  jamais une unite militaire (voir isMilitaryUnit). */
  hero?: boolean;
  /** Emprise au placement (voir main.ts, getFootprintTiles/isValidPlacementForUnit)
   *  — absent = 1x1 comme toutes les unites jusqu'ici. Seul `tilesZ` est
   *  actuellement supporte (extension vers l'ARRIERE du camp, jamais vers
   *  l'avant ni lateralement) : aucune unite n'a encore besoin d'une emprise
   *  plus large (tilesX), donc `isValidPlacementForUnit` ne gere que la
   *  profondeur pour l'instant — a etendre le jour ou une unite plus large
   *  que haute en aura besoin. La case d'ANCRE (`x`/`z` du placement, comme
   *  toute autre unite) reste la case de FRONT, jamais celle du milieu ou de
   *  l'arriere — la portee d'attaque/le ciblage/le rendu s'appuient tous sur
   *  cette meme convention pour toutes les unites, footprint ou pas. */
  footprint?: { tilesX: number; tilesZ: number };
}

/**
 * Rayon (cases) de la Boule de feu du Mage — SEULE definition ; reference
 * aussi bien par UNITS.mage.abilities ci-dessous QUE par le calcul du rayon
 * de Provocation de la Sentinelle (demande explicite d'Antoine : "2 x rayon
 * Blizzard", 2026-08-14).
 */
const MAGE_FIREBALL_RADIUS_TILES = 2;
/** Rayon de Provocation = 2 x l'ancien rayon du Blizzard, soit 2 x (rayon de
 *  la Boule de feu x 1,15). Le Blizzard et sa constante ont ete retires avec
 *  les parchemins (2026-11-04) ; le facteur 1,15 reste ecrit ici tel quel
 *  pour que la valeur (4,6 cases) ne change pas. */
const SENTINEL_TAUNT_RADIUS_TILES = MAGE_FIREBALL_RADIUS_TILES * 1.15 * 2;

export const UNITS: Record<string, UnitDef> = {
  fantassin: {
    id: 'fantassin',
    // Nom affiche « Homme d'armes » (2026-11-01, direction Hero RTS) ;
    // identifiant technique `fantassin` conserve (cartes, sauvegardes).
    name: 'Homme d’armes',
    pluralName: 'Hommes d’armes',
    cost: 2,
    populationCost: 1,
    stats: {
      maxHp: 50,
      damage: 10,
      attackRange: 0.95,
      aggroRange: 9,
      moveSpeed: 2.2,
      attackCooldown: FANTASSIN_ATTACK_COOLDOWN,
      missChance: 0.12,
      dodgeChance: 0,
      // Rayon monte 0.42 -> 0.5 (2026-08-11, demande d'Antoine, "un tout
      // petit peu" : "les archers ont du mal a se toucher de temps en
      // temps"). Ce rayon sert de reach a l'ATTAQUE (voir combatSystem,
      // inRange = dist <= attackRange + target.radius) : l'agrandir rend
      // plus tolerant le moment ou une unite bousculee par la foule se
      // retrouve juste hors de portee de sa cible verrouillee. N'affecte PAS
      // la taille visuelle (silhouette codee en dur dans unitMesh.ts, sans
      // lien avec stats.radius).
      radius: 0.5,
      canAttackWhileMoving: false,
    },
    visual: { kit: 'fantassin' },
  },
  archer: {
    id: 'archer',
    name: 'Archer',
    cost: 3,
    populationCost: 1,
    stats: {
      maxHp: 30,
      // 8 -> 12 (2026-08-14, demande d'Antoine : "unite trop faible, ils
      // ratent trop de tirs" — diagnostic reel : missChance etait deja bas
      // (7%, voir plus bas), le vrai coupable est la cadence DOUBLEE le
      // 2026-08-11 pour caler le tir sur l'animation riggee (1.3s -> 2.0s,
      // ~35% de DPS en moins), jamais compensee depuis malgre le commentaire
      // qui le promettait explicitement ("compense par un futur ajustement
      // de degats... pas fait ici"). 12/2.0s = 6.0 degats/s, quasiment
      // identique aux 8/1.3s = 6.15 degats/s d'avant le nerf de cadence —
      // restaure le DPS d'origine plutot qu'un buff arbitraire.
      damage: 12,
      /** Bien plus grande que le fantassin : l'archer ne rentre jamais au contact. */
      attackRange: 6,
      aggroRange: 10,
      moveSpeed: 2.0,
      // 1.3 -> 2.0 (2026-08-11, demande explicite d'Antoine : "calibrer le
      // projectile sur l'animation, quitte à modifier son attaque, on va
      // bientôt chercher à le buff un peu") — le clip d'attaque riggé
      // ("tir à l'arc", voir render/archerRig.ts) dure ~5s a vitesse
      // naturelle ; le compresser sur l'ancien cooldown (1.3s) aurait
      // demande une acceleration extreme (~3.9x). 2.0s reste une
      // compression notable (~2.5x, du meme ordre que celle deja acceptee
      // pour le Mage) sans etre deraisonnable. Nerf de cadence desormais
      // compense par le degat remonte ci-dessus (2026-08-14).
      attackCooldown: 2.0,
      // 0.13 -> 0.07 (2026-08-11) -> 0.05 (2026-08-14, meme demande
      // qu'au-dessus : "ils ratent trop de tirs"). Deja tres bas avant ce
      // changement (7%, sous la fourchette habituelle 10-15% — voir le
      // commentaire de UnitStats.missChance) : la vraie faiblesse ressentie
      // venait surtout du DPS (voir `damage` ci-dessus), mais reduire encore
      // le taux de rate repond aussi directement a la demande.
      missChance: 0.05,
      dodgeChance: 0,
      // Rayon monte 0.38 -> 0.46 (2026-08-11, meme demande que le fantassin,
      // voir son commentaire). Sert de reach a l'attaque comme partout.
      radius: 0.46,
      canAttackWhileMoving: false,
    },
    visual: { kit: 'archer' },
  },
  // Premiere unite d'artillerie magique / degats de zone (2026-08-11, demande
  // complete d'Antoine — voir CLAUDE.md). Identite : fragile, longue portee,
  // attaque lente, tres fort contre les groupes, tres faible au contact.
  // Cout eleve (10 or, 2026-08-14 : 8 -> 10, demande explicite d'Antoine)
  // coherent avec fantassin=2/archer=3.
  mage: {
    id: 'mage',
    name: 'Mage',
    cost: 10,
    populationCost: 3,
    // Produit par le Sanctuaire (data/buildings.ts) ; plus aucun deblocage
    // par victoire (2026-11-05). MAGE_UNLOCK_WAVE ne gouverne que
    // l'apparition du Mage dans les rangs ennemis (run/runState.ts).
    stats: {
      // "PV maximum : 5" (echelle affichee) donne par Antoine tel quel ->
      // 50 interne, exactement comme le fantassin. Note honnete : ca ne
      // rend pas le Mage plus fragile qu'un fantassin en PV bruts — la
      // fragilite recherchee ("tres vulnerable aux unites rapides") vient
      // plutot de son incapacite a se defendre au contact (voir attackRange/
      // damage ci-dessous) que d'un pool de PV reduit. A rediscuter si
      // Antoine voulait un nombre de PV plus bas pour V1.
      maxHp: 50,
      // "Coup de bâton" : l'attaque de REPLI au contact (voir abilities plus
      // bas pour l'attaque PRINCIPALE, la Boule de feu) — utilise le meme
      // profil que combatSystem (mono-cible, classique), volontairement
      // mauvais ("le Mage ne doit PAS devenir competent au corps a corps") :
      // 1 degat affiche (10 interne, comme pour toutes les unites),
      // cadence lente, taux de rate eleve. Valeurs de detail (cooldown,
      // missChance) non donnees par Antoine, choisies par Claude pour
      // rendre ce repli clairement mediocre sans etre totalement inutile.
      damage: 10,
      attackRange: 0.95,
      aggroRange: 10,
      // Legerement en retrait de l'archer
      // (2.0)/fantassin (2.2) — "légèrement moins mobile", valeur choisie
      // par Claude apres comparaison explicite des vitesses existantes,
      // comme demande.
      moveSpeed: 1.8,
      attackCooldown: 2.0,
      missChance: 0.3,
      dodgeChance: 0,
      radius: 0.44,
      canAttackWhileMoving: false,
      // Portee d'ENGAGEMENT (voir UnitStats.engageRange) = portee MAXIMALE de
      // la Boule de feu (6) : le Mage arrete de s'approcher des qu'un ennemi
      // entre dans sa portee principale, independamment de sa portee de
      // repli au contact (0.95 ci-dessus) qui ne sert qu'une fois immobilise
      // et rattrape. Limite honnete assumee (pas de vraie IA de kiting pour
      // cette V1, comme demande) : entre 0.95 et 2 cases (sous la portee
      // MINIMALE de la Boule de feu), le Mage reste immobile sans pouvoir
      // utiliser ni attaque — une "zone morte" rare en pratique (les ennemis
      // traversent generalement cet intervalle en un tick), non traitee ici.
      engageRange: 6,
    },
    visual: { kit: 'mage' },
    abilities: [
      {
        type: 'area-blast',
        // "environ une attaque toutes les 5,5 secondes" — demarre au DEBUT
        // de l'incantation (voir data/abilities.ts, AreaBlastAbility), donc
        // cette valeur couvre deja le castTime, pas besoin de l'additionner.
        cooldown: 5.5,
        minRangeTiles: 2,
        maxRangeTiles: 6,
        // 1 -> 0.6 (2026-08-11, deuxieme retour d'Antoine : "il y a bien un
        // retard avant que la boule ne parte" une fois le geste visuellement
        // fini). Diagnostic : le clip source (2.23s) contient probablement
        // un temps de repos/retombee apres le vrai geste de lancer — en
        // etirant TOUT le clip sur castTime (voir UnitViews.tickRiggedAnimation,
        // `action.time = progress * clip.duration`), la portion "immobile"
        // de fin de clip s'etire elle aussi, lisible comme un temps mort
        // avant le tir. Reduire castTime raccourcit ce temps mort en
        // proportion (le clip entier joue plus vite, donc la portion immobile
        // aussi) — solution la plus sure sans acces visuel pour reperer
        // precisement l'image de "lacher" dans le clip. Si le temps mort
        // reste sensible a l'usage, la vraie correction demanderait de
        // decoupler la portion du clip jouee PENDANT l'incantation (jusqu'a
        // l'image de lacher) du reste (retombee, jouee APRES le lancement du
        // projectile, sans bloquer son depart) — a faire si Antoine confirme
        // approximativement a quel % du geste la boule devrait partir.
        castTime: 0.6,
        // "relativement lent, beaucoup plus gros qu'une fleche" — pas donnee
        // precisement par Antoine, choisie par Claude : plus lent que la
        // carreau de la Baliste (PLAYER_ARROW_SPEED = 13,5) pour un temps de vol
        // nettement lisible sur toute la plage 2-6 cases (~0.33 a 1s).
        projectileSpeed: 6,
        // 4 degats affiches = 40 internes (meme convention que les PV)
        // — PAR CIBLE touchee dans le rayon, pas reparti entre elles.
        damage: 40,
        // 1 -> 2 (2026-08-11, retour d'Antoine apres premier test reel :
        // "beaucoup trop simple a esquiver, voire pas assez forte" — rayon
        // choisi comme premier levier plutot que vitesse/degats). Double le
        // rayon (quadruple la surface touchee) : premier passage volontairement
        // marque plutot qu'un ajustement timide, a rediscuter si trop fort a
        // l'usage. Le telegraphe au sol (TelegraphView) suit automatiquement
        // cette valeur, donc la zone de danger reste toujours lisible avant
        // l'impact malgre l'agrandissement. Reference MAGE_FIREBALL_RADIUS_TILES
        // (= 2) plutot qu'un litteral (2026-08-14) : c'est desormais la
        // SEULE definition de ce rayon, reutilisee par le calcul du rayon de
        // Provocation de la Sentinelle ci-dessus.
        radiusTiles: MAGE_FIREBALL_RADIUS_TILES,
        // Recul radial a l'impact (2026-08-11, demande d'Antoine apres avoir
        // vu l'explosion en jeu : "rajouter un bump depuis la zone d'impact")
        // — 1 case, meme valeur que CHARGE_KNOCKBACK_TILES (Cavalier) pour
        // une premiere coherence entre les deux capacites deja en jeu, a
        // ajuster independamment si besoin (rien ne les lie techniquement).
        knockbackTiles: 1,
      },
    ],
  },
  // Premiere unite TANK du jeu (2026-08-14, demande complete d'Antoine) :
  // encaisser enormement, attirer les attaques (Provocation), proteger
  // indirectement les unites fragiles, tenir une position. PAS une source de
  // DPS — degats volontairement symboliques (1 affiche), toute son identite
  // vient de sa survie/son controle de l'aggro.
  sentinel: {
    id: 'sentinel',
    name: 'Sentinelle',
    // 40 -> 20 (2026-11-01, decision de design d'Antoine) ; le reste inchange.
    cost: 20,
    populationCost: 5,
    // Unite DORMANTE cote joueur (2026-11-05) : definie, mais produite par
    // aucun batiment tant que son batiment, son role et son cout ne sont
    // pas decides (docs/ROADMAP.md). Cote ennemi : a partir de
    // ENEMY_SENTINEL_START_WAVE (run/runState.ts).
    stats: {
      // "50 HP" affiche -> 500 interne (convention x10 verifiee, pas supposee).
      maxHp: 500,
      // "1 degat" affiche -> 10 interne, mono-cible, meme philosophie que le
      // Fantassin (aucune AoE de base, demande explicite).
      damage: 10,
      attackRange: 0.95,
      // Comme le Fantassin — rien d'indique dans la demande qu'elle doive
      // remarquer les ennemis de plus loin ou moins loin.
      aggroRange: 9,
      // SENTINEL_MOVE_SPEED_MULTIPLIER = 0.75 (milieu de la fourchette "70 a
      // 80% du Fantassin" demandee) x moveSpeed du Fantassin (2.2) = 1.65 —
      // centralise dans config/constants.ts, jamais hardcode ici ni dans
      // movementSystem (qui ne lit que UnitStats.moveSpeed, generique).
      moveSpeed: 2.2 * SENTINEL_MOVE_SPEED_MULTIPLIER,
      // SENTINEL_ATTACK_COOLDOWN_MULTIPLIER = 1.5 (borne haute de la
      // fourchette "40 a 50% plus lente" demandee, coincide avec l'exemple
      // concret d'Antoine "1 attaque / 1.5 a 1.8 seconde") x cooldown du
      // Fantassin (1.0s) = 1.5s.
      attackCooldown: FANTASSIN_ATTACK_COOLDOWN * SENTINEL_ATTACK_COOLDOWN_MULTIPLIER,
      // Pas de raison de la faire rater plus/moins souvent que le Fantassin
      // — pas demande explicitement, meme valeur par coherence.
      missChance: 0.12,
      dodgeChance: 0,
      // Legerement plus grand que le Fantassin (0.5) — "un tank imposant,
      // pas un batiment" (demande explicite) : reach d'attaque un peu plus
      // genereux, sans risquer de blocages sur la grille (meme ordre de
      // grandeur que l'ancien Cavalier leger, 0.6, deja valide sans probleme
      // dans ce moteur).
      radius: 0.6,
      canAttackWhileMoving: false,
    },
    // hpBarHeight = 1.51 (2026-08-14, correctif "la barre ne doit pas etre
    // au milieu du casque") : mesure hors-ligne (script jetable, THREE.Box3
    // sur sentinel_blue.glb apres SENTINEL_MODEL_SCALE = 0.935) donne une
    // hauteur reelle de 1.589 monde, contre 1.369 pour le Fantassin (dont la
    // barre a la hauteur PAR DEFAUT, HP_BAR_WORLD_HEIGHT = 1.3, n'a jamais
    // ete critiquee). Valeur choisie pour garder EXACTEMENT le meme
    // positionnement RELATIF (hauteur de barre / hauteur du modele) que le
    // Fantassin plutot qu'une valeur devinee : 1.3 * (1.589 / 1.369) = 1.51.
    visual: { kit: 'sentinel', hpBarHeight: 1.51 },
    abilities: [
      {
        type: 'taunt',
        cooldown: TAUNT_COOLDOWN,
        radiusTiles: SENTINEL_TAUNT_RADIUS_TILES,
        tauntDuration: TAUNT_DURATION,
        shieldDuration: SHIELD_DURATION,
        // SHIELD_PER_TAUNTED_ENEMY (3) est la valeur AFFICHEE — l'echelle
        // interne (x10, meme convention que damage/maxHp) s'applique ICI,
        // au point de construction, pas dans TauntAbility elle-meme (bug
        // trouve en verification headless : sans ce x10, le Shield gagne en
        // jeu valait 10x moins que prevu).
        baseShieldPerTarget: SHIELD_PER_TAUNTED_ENEMY * HP_PER_PIP,
        // 2026-08-14 (deuxieme demande, "elle se declenche trop tot au
        // debut d'une bataille") : verrou initial, DISTINCT du cooldown
        // normal ci-dessus — voir TauntAbility.initialLockoutSeconds.
        initialLockoutSeconds: SENTINEL_INITIAL_TAUNT_LOCKOUT,
      },
    ],
  },
  // Oracle (2026-11-01, demande d'Antoine) : soutien fragile recrute a
  // l'Eglise. Soigne l'allie le plus blesse a portee, a la FIN d'une
  // incantation (data/abilities.ts, HealAbility). Cout 15 or decide par
  // Antoine ; toutes les autres valeurs sont PROVISOIRES (fiche B7,
  // docs/DESIGN_DECISIONS.md). Joueur seulement : absent des vagues ennemies.
  oracle: {
    id: 'oracle',
    name: 'Oracle',
    cost: 15,
    populationCost: 2,
    stats: {
      // 3 PV, comme l'Archer : tombe vite au contact.
      maxHp: 30,
      // Coup de baton de repli, 0,5 : il ne doit pas tenir une ligne.
      damage: 5,
      attackRange: 0.95,
      aggroRange: 10,
      moveSpeed: 2.0,
      attackCooldown: 2.0,
      missChance: 0.3,
      dodgeChance: 0,
      radius: 0.44,
      canAttackWhileMoving: false,
      // Reste en retrait : s'arrete a 3,5 cases de sa cible ennemie, assez
      // pres de la melee pour que les allies au contact soient a portee de soin.
      engageRange: 3.5,
    },
    visual: { kit: 'oracle' },
    abilities: [
      // 2 PV toutes les 4 s (0,5 PV/s), incantation de 1 s.
      { type: 'heal', cooldown: 4, rangeTiles: 4.5, endRangeMarginTiles: 1, castTime: 1, amount: 20 },
    ],
  },
  // Piquier (2026-11-01, demande d'Antoine) : soldat de base de la Caserne,
  // lance et petit bouclier. Plus faible seul que le Fantassin, moins cher,
  // fiable (peu de rates) ; sa lance porte assez loin pour frapper depuis le
  // deuxieme rang. Valeurs PROVISOIRES (fiche B8, docs/DESIGN_DECISIONS.md).
  // Joueur seulement.
  piquier: {
    id: 'piquier',
    name: 'Piquier',
    cost: 1.5,
    populationCost: 1,
    stats: {
      maxHp: 40,
      damage: 8,
      // Lance : 1,4 contre 0,95 (reste du corps a corps, MELEE_CONTACT_RANGE).
      attackRange: 1.4,
      aggroRange: 9,
      moveSpeed: 2.0,
      attackCooldown: 1.2,
      // Estoc resolu 0,3 s apres le debut du geste (impact du clip, voir
      // UnitStats.attackWindup) ; un ordre de deplacement l'annule avant.
      attackWindup: 0.3,
      missChance: 0.08,
      dodgeChance: 0,
      radius: 0.45,
      canAttackWhileMoving: false,
    },
    visual: { kit: 'piquier' },
  },
  // Villageois (2026-11-03, demande d'Antoine) : premiere unite economique,
  // produite a l'Hotel de ville (2026-11-08 ; a l'Auberge avant). Fragile, presque inutile au combat, vitesse
  // raisonnable, population 1 ; recolte bois, pierre et or avec les outils de
  // la Forge, credites directement au stock (sim/systems/workers.ts). Pas
  // d'XP, de mana ni d'equipement. Aucun modele de paysan dans les assets :
  // habille du Piquier (PROVISOIRE). Valeurs PROVISOIRES.
  villageois: {
    id: 'villageois',
    name: 'Villageois',
    pluralName: 'Villageois',
    cost: 5,
    populationCost: 1,
    // Aucune attaque (2026-11-03, demande d'Antoine : unite economique, pas
    // militaire) : degats 0, aucune acquisition de cible (aggro 0). Reste
    // ciblable et tuable.
    stats: {
      maxHp: 25,
      damage: 0,
      attackRange: 0.95,
      aggroRange: 0,
      moveSpeed: 2.2,
      attackCooldown: 1.6,
      missChance: 0,
      dodgeChance: 0,
      radius: 0.4,
      canAttackWhileMoving: false,
    },
    // Modele dedie `human_villager` (2026-11-03, Atelier d'Antoine) : peon
    // sans arme, hache / pioche temporaires au travail.
    visual: { kit: 'villageois' },
    worker: true,
  },
  // Vengeur (2026-11-01, demande d'Antoine) : combattant religieux de
  // l'Eglise, deux epees, DPS de melee brutal et tres rapide ; ni tank ni bon
  // marche. Valeurs PROVISOIRES (fiche B9). Joueur seulement.
  vengeur: {
    id: 'vengeur',
    name: 'Vengeur',
    cost: 25,
    populationCost: 3,
    stats: {
      // 10 PV : deux fois un Fantassin, cinq fois moins qu'une Sentinelle.
      maxHp: 100,
      // 2 par coup toutes les 0,6 s : environ 3,3 par seconde.
      damage: 20,
      attackRange: 0.95,
      aggroRange: 9,
      moveSpeed: 2.6,
      attackCooldown: 0.6,
      // Impact 0,2 s apres le debut du geste (voir UnitStats.attackWindup).
      attackWindup: 0.2,
      missChance: 0.1,
      dodgeChance: 0,
      radius: 0.5,
      canAttackWhileMoving: false,
    },
    visual: { kit: 'vengeur' },
  },
};

/** HEROS (2026-11-01, direction Hero RTS Survival) : personnage principal du
 *  joueur, axe de la micro-gestion (combat, recolte, construction ; voir
 *  data/hero.ts). Fiche PROVISOIRE, nettement au-dessus d'une unite
 *  standard : 6 fois les PV d'un Homme d'armes, 2,5 fois ses degats, plus
 *  rapide, plus gros. Jamais achete (cout 0) ni compte dans la population. */
UNITS['hero'] = {
  id: 'hero',
  name: 'Héros',
  pluralName: 'Héros',
  cost: 0,
  populationCost: 0,
  // Vitesse +60 % (2026-11-02, demande d'Antoine) : 2,6 -> 4,16 cases/s.
  stats: { maxHp: 300, damage: 25, attackRange: 1.0, aggroRange: 9, moveSpeed: 4.16, attackCooldown: 1.1, missChance: 0.05, dodgeChance: 0, radius: 0.6, canAttackWhileMoving: false },
  visual: { kit: 'hero', hpBarHeight: 2.0 },
  hero: true,
};

/** Cavalerie legere (2026-11-01, Hero RTS) : cheval, lance legere, petit
 *  bouclier ; tres mobile, fragile pour son prix. Couts, PV et degats
 *  imposes par Antoine (15 or, 18 PV, 3 degats) ; cadence, portee, vitesse,
 *  rayon et rate PROVISOIRES. Aucun bonus contre un type d'unite. Bestiaire
 *  et editeur seulement : ni recrutement ni vagues (choix d'Antoine). */
const LIGHT_CAVALRY_STATS: UnitStats = {
  maxHp: 180,
  damage: 30,
  attackRange: 1.2,
  aggroRange: 10,
  moveSpeed: 3.6,
  attackCooldown: 1.3,
  missChance: 0.1,
  dodgeChance: 0,
  radius: 0.7,
  canAttackWhileMoving: false,
};

UNITS['cavalier'] = {
  id: 'cavalier',
  name: 'Cavalier léger',
  pluralName: 'Cavaliers légers',
  cost: 15,
  populationCost: 2,
  stats: LIGHT_CAVALRY_STATS,
  visual: { kit: 'cavalier', hpBarHeight: 2.1 },
};

/** Unite NEUTRE habillee d'un modele d'une autre faction visuelle : memes
 *  stats, capacites et comportement (kit) que le role `role`, PROVISOIRES
 *  (aucune fiche de jeu definitive) ; jamais recrutable par le joueur. */
function neutralUnit(id: string, name: string, role: string, faction: VisualFaction): UnitDef {
  const base = UNITS[role]!;
  return { id, name, cost: base.cost, populationCost: base.populationCost, stats: base.stats, ...(base.abilities ? { abilities: base.abilities } : {}), visual: { ...base.visual, faction }, neutral: true };
}

/** Unites neutres (2026-11-01) : les cinq barbares Toon RTS, noms de jeu
 *  PROVISOIRES. Identifiants techniques propres ; fichiers et identifiants
 *  des modeles (`barbare_*`, render/toonUnitRig.ts) inchanges. */
export const NEUTRAL_UNIT_IDS = ['maraudeur', 'ravageur', 'traqueur', 'feticheur', 'colosse', 'razzieur'] as const;
UNITS['maraudeur'] = neutralUnit('maraudeur', 'Maraudeur', 'fantassin', 'barbarian');
UNITS['ravageur'] = neutralUnit('ravageur', 'Ravageur', 'vengeur', 'barbarian');
UNITS['traqueur'] = neutralUnit('traqueur', 'Traqueur', 'archer', 'barbarian');
UNITS['feticheur'] = neutralUnit('feticheur', 'Féticheur', 'mage', 'barbarian');
UNITS['colosse'] = neutralUnit('colosse', 'Colosse', 'sentinel', 'barbarian');
/** Cavalerie legere barbare (2026-11-01) : unite propre (kit
 *  `cavalier_barbare`, modele barbare dedie), pas un habillage du Cavalier
 *  humain ; memes valeurs provisoires (18 PV, 3 degats, valeur 15 or). */
UNITS['razzieur'] = {
  id: 'razzieur',
  name: 'Razzieur',
  cost: 15,
  populationCost: 2,
  stats: { ...LIGHT_CAVALRY_STATS },
  visual: { kit: 'cavalier_barbare', faction: 'barbarian', hpBarHeight: 2.1 },
  neutral: true,
};

/** Vagues ennemies (2026-11-02, demande d'Antoine) : chaque role de la
 *  composition (run/runState.ts, computeEnemyWaveComposition) est joue par le
 *  barbare de meme role (memes stats et capacites, modele barbare). Le
 *  renfort de vague, l'or et le butin restent ceux du role (main.ts) : les
 *  vagues gardent leur equilibrage. */
export const WAVE_UNIT_BY_ROLE: Readonly<Record<string, string>> = {
  fantassin: 'maraudeur',
  archer: 'traqueur',
  mage: 'feticheur',
  sentinel: 'colosse',
};

/** Pluriel affiche d'une unite (« Hommes d'armes », « Archers »). */
export function unitPluralName(def: UnitDef): string {
  return def.pluralName ?? (/[sx]$/.test(def.name) ? def.name : `${def.name}s`);
}

/** Vitesse de deplacement (2026-11-04, demande d'Antoine) : TOUTES les
 *  unites mobiles (Heros, Villageois, armee, neutres, gardes des camps,
 *  vagues) vont 40 % plus vite, proportions relatives conservees.
 *  Multiplicateur UNIQUE, applique a la vitesse FINALE quand la simulation
 *  resout les stats d'une entite (World.spawn : base + ameliorations ;
 *  refreshHeroStats : niveau + equipement), jamais a la main par unite ; les
 *  donnees UNITS gardent leurs valeurs de base. Ne touche ni l'attaque, ni
 *  les sorts, ni la recolte, ni la construction, ni les projectiles, ni les
 *  recharges, ni la Charge (vitesse propre, config/constants.ts). Le rendu
 *  accelere d'autant les clips de marche (render/unitViews.ts). PROVISOIRE. */
export const UNIT_MOVE_SPEED_MULTIPLIER = 1.4;

/** Stats avec la vitesse de deplacement effective (voir
 *  UNIT_MOVE_SPEED_MULTIPLIER) : a appliquer UNE fois, sur des stats de base. */
export function withEffectiveMoveSpeed<T extends { moveSpeed: number }>(stats: T): T {
  return { ...stats, moveSpeed: stats.moveSpeed * UNIT_MOVE_SPEED_MULTIPLIER };
}

/** Unite MILITAIRE du joueur (2026-11-05, Pass 2) : cible des technologies
 *  globales de la Forge (data/technologies.ts). Toute unite de combat
 *  recrutable — Piquier, Homme d'armes, Archer, Mage, Oracle, Vengeur,
 *  Cavalier, Sentinelle si elle est un jour produite — jamais le Heros
 *  (progression propre), le Villageois (economique) ni une unite neutre.
 *  Regle derivee des champs de la definition, pas une liste a maintenir. */
export function isMilitaryUnit(unitId: string): boolean {
  const def = getUnit(unitId);
  return !def.hero && !def.worker && !def.neutral;
}

export function getUnit(id: string): UnitDef {
  const def = UNITS[id];
  if (!def) throw new Error(`Unite inconnue : ${id}`);
  return def;
}
