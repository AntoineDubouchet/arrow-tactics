/**
 * Toutes les valeurs de reglage du jeu. Aucun nombre magique ailleurs dans le code.
 * Regle d'or : les stats sont stockees x10 en interne (50 PV = 5 coeurs affiches)
 * pour pouvoir equilibrer a +/- 5% sans casser les entiers.
 */

// --- Simulation ---
export const SIM_HZ = 30;
export const SIM_STEP = 1 / SIM_HZ;
/** Au-dela, on considere que l'onglet etait en arriere-plan : on ne rattrape pas. */
export const MAX_FRAME_DELTA = 0.25;

// --- Plateau ---
export const TILE = 1;
export const BOARD_W = 18;
export const BOARD_H = 26;
/** Nombre de rangees de placement de chaque cote. */
export const PLACEMENT_ROWS = 7;
/** Rayon (en cases) de recherche d'une case de repli quand la case visee
 *  par une unite deplacee sur la grille est invalide ou deja prise (editeur
 *  et preparation, voir core/gridGroupMove.ts) : la case valide et libre la
 *  plus proche dans ce rayon est retenue, sinon le deplacement est refuse.
 *  Couvre l'imprecision d'un clic pres d'un bord de case (camera inclinee)
 *  et les unites d'un groupe bloquees par un obstacle ou un bord. Passe de 1
 *  a 2 avec le deplacement de groupe centre : a 1, une formation compacte
 *  contre un arbre n'avait souvent aucune case de repli. */
export const GRID_MOVE_SEARCH_RADIUS = 2;
/** Seuil de la barriere de securite "il vous reste de l'or non depense"
 *  (voir main.ts, requestValidatePlacement) — proportion de l'or possede au
 *  DEBUT de la phase de placement (goldAtPlacementStart) au-dela de laquelle
 *  le popup de confirmation s'affiche avant de lancer la bataille. Monte de
 *  10% a 30% (2026-08-10, demande d'Antoine : "trop souvent" a 10% — avec de
 *  petits montants d'or en debut de run, meme 1-2 or restants (largement pas
 *  un oubli) depassaient deja le seuil). Valeur exacte (30%, pas 40/50)
 *  choisie par Claude dans la fourchette proposee, a ajuster si Antoine juge
 *  que ca continue de se declencher trop souvent ou pas assez. */
export const PLACEMENT_GOLD_WARNING_RATIO = 0.3;
/** Population maximale du joueur sans Maison (voir data/population.ts) ;
 *  chaque Maison y ajoute son `populationBonus` (data/buildings.ts). */
export const PLAYER_BASE_POPULATION = 5;
// --- Affichage des PV ---
export const HP_PER_PIP = 10;

/**
 * Barres de PV — refonte 2026-08-14 (demande d'Antoine : la Sentinelle et
 * ses ameliorations permanentes peuvent porter le maxHp affiche bien
 * au-dela des unites de base, et la largeur de barre ne doit PLUS jamais
 * dependre du nombre de PV — seul le REMPLISSAGE doit varier). La largeur
 * depend desormais de la taille PHYSIQUE de l'unite (`UnitStats.radius`,
 * deja la source de verite existante pour "a quel point cette unite est
 * grosse" — reutilisee plutot que d'inventer un second concept de taille),
 * jamais du maxHp.
 *
 * HEALTH_BAR_WIDTH_PER_RADIUS calibre pour que le Fantassin (radius 0.5)
 * retombe tres exactement sur la largeur visuelle de l'ANCIENNE barre a 5
 * pips (5 * 4px de pip + 4 * 1.5px de gap + 2 * 3px de padding = 32px) —
 * zero changement visuel pour le cas le plus courant, jamais critique par
 * Antoine. Verifie par calcul pour les 4 unites actuelles (radius : 0.5 /
 * 0.46 / 0.44 / 0.6) : Fantassin 32px, Archer 29.4px, Mage 28.2px (rayon le
 * plus petit -> unite la "plus petite", coherent avec son identite fragile),
 * Sentinelle 38.4px (ratio 1.2x le Fantassin, dans la fourchette "1.1 a
 * 1.25x maximum" explicitement demandee) — aucun clamp necessaire pour les
 * 4 unites actuelles, MIN/MAX ne servent qu'a proteger une future unite au
 * rayon extreme.
 */
export const HEALTH_BAR_WIDTH_PER_RADIUS = 64;
export const HEALTH_BAR_WIDTH_MIN = 24;
export const HEALTH_BAR_WIDTH_MAX = 40;
/** Un trait de segment tous les N PV AFFICHES (pips) — purement decoratif,
 *  ne change jamais le remplissage reel. Uniquement au-dela de
 *  HEALTH_BAR_SEGMENT_MIN_PIPS pips pour ne pas surcharger les petites
 *  unites (Fantassin 5 pips, Archer 3, Mage 5 restent sans segment ;
 *  Sentinelle 50 pips de base en a 4, un tous les 10). */
export const HEALTH_BAR_SEGMENT_INTERVAL = 10;
export const HEALTH_BAR_SEGMENT_MIN_PIPS = 20;

/** Vague a partir de laquelle le Mage apparait dans les rangs ENNEMIS (voir
 *  run/runState.ts, computeEnemyWaveComposition). N'a PLUS aucun rapport
 *  avec le deblocage COTE JOUEUR depuis le 2026-08-15 (refonte "vaincre pour
 *  debloquer", voir data/units.ts UnitDef.playerUnlockMode/
 *  run/metaProgress.ts canPlayerRecruitUnit) — auparavant les deux etaient
 *  lies (meme valeur, "le Mage devient achetable une fois la manche 8
 *  vaincue"), desormais le Mage devient achetable des qu'un EXEMPLAIRE
 *  ENNEMI a ete vaincu au moins une fois, independamment du numero de vague
 *  ou cette premiere rencontre a lieu. */
export const MAGE_UNLOCK_WAVE = 8;

/** Pression magique croissante (2026-08-14, demande d'Antoine — voir
 *  run/runState.ts, computeEnemyWaveComposition) : a partir de cette vague,
 *  des Mages ennemis SUPPLEMENTAIRES s'ajoutent a la composition normale
 *  (qui contient deja 1 Mage depuis MAGE_UNLOCK_WAVE), par palier de
 *  EXTRA_ENEMY_MAGE_INTERVAL vagues. Formule donnee explicitement par
 *  Antoine : `1 + floor((wave - EXTRA_ENEMY_MAGE_START_WAVE) / EXTRA_ENEMY_MAGE_INTERVAL)`. */
export const EXTRA_ENEMY_MAGE_START_WAVE = 10;
export const EXTRA_ENEMY_MAGE_INTERVAL = 3;

/** Sentinelles ennemies (2026-08-15, demande explicite d'Antoine : "je veux
 *  désormais voir des Sentinelles ennemies à partir de la vague 10... au
 *  moins 1 rencontre garantie") — MEME formule que la pression magique
 *  ci-dessus (`1 + floor((wave - START) / INTERVAL)`), mais un intervalle
 *  bien PLUS LARGE (5 au lieu de 3) : "la Sentinelle est une unité très
 *  chère et très résistante, donne-lui un poids de génération élevé... une
 *  présence raisonnable plutôt que +1 à chaque vague". Vague 10-14 : 1
 *  Sentinelle. Vague 15-19 : 2. Etc., sans plafond (meme principe que le
 *  reste de la courbe de difficulte). S'AJOUTE a fantassin/archer/Mage,
 *  jamais a la place (voir computeEnemyWaveComposition) — une vague avancee
 *  contient donc bien une variete de composition (point 15 de la demande). */
export const ENEMY_SENTINEL_START_WAVE = 10;
export const ENEMY_SENTINEL_INTERVAL = 5;

// --- Nova de glace / Blizzard (2026-08-14) ---
// Sort de bataille : impact instantane (aucun projectile, aucun temps de
// vol) qui immobilise les ennemis d'une zone. Le RAYON n'a pas de valeur
// propre ici : il se calcule depuis le rayon REEL de la Boule de feu du
// Mage (voir data/items.ts, ICE_NOVA_RADIUS — lu via findAbility sur
// data/units.ts, jamais duplique) pour eviter deux sources de verite.
/** Multiplicateur applique au rayon de la Boule de feu du Mage pour obtenir
 *  le rayon de la Nova de glace (demande explicite d'Antoine : "un tout
 *  petit peu plus grande", +15 %). */
export const ICE_NOVA_RADIUS_MULTIPLIER = 1.15;
/** Duree du statut Root applique par la Nova (secondes). */
export const ICE_NOVA_ROOT_DURATION = 4.0;
/** Duree de vie de la zone persistante creee par le talent Blizzard
 *  (secondes) — memes centre/rayon que la Nova qui l'a declenchee (voir
 *  main.ts, castIceNova), jamais un second cercle independant. */
export const BLIZZARD_DURATION = 4.0;
/** Interval entre deux ticks de degats du Blizzard (secondes) — avec
 *  BLIZZARD_DURATION = 4.0, ca donne exactement 4 ticks (t=1,2,3,4), jamais
 *  de tick a t=0 (demande explicite d'Antoine : "le premier dégât arrive
 *  après une seconde"). */
export const BLIZZARD_TICK_INTERVAL = 1.0;
/** Degats internes (x10) par tick de Blizzard : 2 degats affiches. */
export const BLIZZARD_DAMAGE_PER_TICK = 20;

/** Rayon de recherche (cases) autour du point clique pour resoudre la cible
 *  d'un objet d'inventaire cible comme le parchemin de soin (2026-08-11,
 *  demande d'Antoine : "le soin doit etre plus simple a utiliser, le
 *  curseur n'est pas tres clair... en cas de doute il faut soigner l'unite
 *  avec le moins d'hp") — remplace l'exigence d'un raycast EXACT sur le
 *  mesh d'une unite precise (trop punitif a l'echelle d'une silhouette de
 *  quelques dizaines de cm) par une recherche generreuse autour du point
 *  vise, resolue par "l'unite la plus blessee EN PROPORTION dans ce rayon"
 *  (voir main.ts, findHealTarget*) plutot que la plus proche du curseur. */
export const HEAL_TARGET_RADIUS = 2;

/** Seuil de PV (fraction de maxHp) en-dessous duquel le talent "Aux petits
 *  oignons" peut se declencher (2026-08-15, demande explicite d'Antoine :
 *  "désormais... lorsqu'un allié tombe à 30% de ses PV ou moins", remplace
 *  l'ancien seuil fixe "1 point de vie affiche"). Seuil INCLUSIF (`<=`) —
 *  toujours compare a `currentHp / maxHp`, jamais une valeur de PV absolue
 *  codee en dur (fonctionne donc identiquement pour un Fantassin a 50 PV
 *  internes ou une Sentinelle a 500). Voir main.ts, belowAutoHealThreshold
 *  pour le mecanisme de FRANCHISSEMENT (pas de re-proc tant que l'unite ne
 *  repasse pas strictement au-dessus). */
export const AUTO_HEAL_TRIGGER_RATIO = 0.3;

// --- Sentinelle / Provocation (2026-08-14) ---
// Premiere unite TANK du jeu (demande complete d'Antoine) : encaisse
// enormement, attire les attaques (Provocation), protege indirectement les
// unites fragiles. Priorite absolue : survie + controle de l'aggro, jamais
// les degats.
/** Vitesse de deplacement = ce ratio x FANTASSIN, voir data/units.ts —
 *  "70 a 80% de la vitesse du Fantassin" (demande explicite), milieu de
 *  fourchette. Centralise ici plutot que hardcode dans movementSystem (qui
 *  ne lit que UnitStats.moveSpeed, generique, aucun changement necessaire
 *  la-bas). */
export const SENTINEL_MOVE_SPEED_MULTIPLIER = 0.75;
/** Cooldown d'attaque = FANTASSIN_ATTACK_COOLDOWN x ce ratio — "attaque
 *  environ 40 a 50% plus lente que le Fantassin" (demande explicite),
 *  borne haute de la fourchette (1.5s, coincide avec l'exemple concret
 *  donne par Antoine : "1 attaque / 1.5 a 1.8 seconde"). */
export const SENTINEL_ATTACK_COOLDOWN_MULTIPLIER = 1.5;
/** Provocation : secondes avant de pouvoir redeclencher. */
export const TAUNT_COOLDOWN = 12.0;
/** Provocation : duree pendant laquelle une cible provoquee garde la
 *  Sentinelle comme cible FORCEE (voir sim/systems/targeting.ts). */
export const TAUNT_DURATION = 5.0;
/** Duree de vie du bouclier temporaire gagne par Provocation (secondes) —
 *  distincte de TAUNT_DURATION (demande explicite). */
export const SHIELD_DURATION = 10.0;
/** Points de bouclier AFFICHES (pas l'echelle interne) gagnes PAR ENNEMI
 *  effectivement provoque, avant amelioration permanente (voir
 *  data/unitUpgrades.ts, +1 par niveau de production de la Sentinelle). */
export const SHIELD_PER_TAUNTED_ENEMY = 3;
/** Verrou initial de Provocation (2026-08-14, demande d'Antoine : "elle se
 *  declenche actuellement trop tot au debut d'une bataille") — secondes de
 *  TEMPS DE SIMULATION (voir World.time, jamais Date.now()/performance.now())
 *  depuis le debut REEL de la phase de bataille (World.clear(), appele a
 *  "Prêt pour la bataille") pendant lesquelles Provocation est INTERDITE,
 *  quelles que soient les autres conditions (cooldown pret, ennemis dans le
 *  rayon). DISTINCT du cooldown normal (TAUNT_COOLDOWN) — ne le remplace
 *  jamais, ne consomme jamais artificiellement le cooldown reel (voir
 *  sim/systems/abilities.ts, tryTriggerTaunt). world.time n'avance jamais
 *  pendant le placement (World.clear() le remet a 0 exactement au bon
 *  moment) ni pendant la Pause (loop.timeScale=0 empeche l'accumulateur a
 *  pas fixe d'avancer, voir core/loop.ts) — aucun code special necessaire
 *  pour ces deux garanties, elles decoulent directement de l'architecture
 *  existante. */
export const SENTINEL_INITIAL_TAUNT_LOCKOUT = 7.0;

// --- Progression permanente ---
/** REFONTE 2026-08-10 (voir CLAUDE.md) : plus de point de talent gagne
 *  automatiquement a chaque run — la progression passe desormais par le
 *  record de vague (voir run/metaProgress.ts, highestWaveReached/
 *  registerWaveReached, data/talents.ts TALENT_TIERS). Les 4 talents
 *  heredites ci-dessous (universel + 3 fondateurs) restent achetables avec
 *  un solde de points deja existant, mais plus aucune nouvelle source ne les
 *  alimente tant que de vrais paliers n'existent pas.
 *
 *  Montants d'effet des 4 talents CONSERVES (voir data/talents.ts) —
 *  regroupes ici comme le reste des reglages du jeu ("aucun nombre magique
 *  ailleurs"). Valeurs choisies par Claude, jamais confirmees par Antoine
 *  au-dela de ce qu'il a explicitement decrit. */
/** or_depart : bonus applique a STARTING_GOLD (5 depuis la passe
 *  economique d'avant playtest ; 3 auparavant). */
export const TALENT_STARTING_GOLD_BONUS = 5;
/** tir_rapide : +60% de vitesse de tir = cooldown divise par (1 + ce taux).
 *  Monte de 50% a 60% (2026-08-10, demande d'Antoine). */
export const TALENT_FIRE_RATE_BONUS = 0.6;
/** tir_rapide : +100% de vitesse de projectile (fleche du joueur, voir
 *  main.ts effectivePlayerArrowSpeed) = vitesse multipliee par (1 + ce
 *  taux). Monte de 30% a 50% (2026-08-10) puis de 50% a 100% (2026-08-13,
 *  demande d'Antoine : "il passera desormais 50% à 100%"). */
export const TALENT_PROJECTILE_SPEED_BONUS = 1.0;
/** tir_rapide : +2 degats affiches (+20 internes) AJOUTES au degat de la
 *  fleche du joueur (2026-08-13, demande d'Antoine : "ajoute 2 point de
 *  degats d'attaque sur le projectile") — nouveau volet du talent, en plus
 *  de la cadence/vitesse ci-dessus. Voir main.ts, effectivePlayerArrowDamage. */
export const TALENT_PROJECTILE_DAMAGE_BONUS = 20;
/** butin_de_guerre : or supplementaire par unite ennemie tuee, en plus de
 *  KILL_REWARD (voir run/runState.ts). */
export const TALENT_BONUS_GOLD_PER_KILL = 1;
/** reflexes_fantassin : ajoute a UnitStats.dodgeChance (base 0) des
 *  fantassins DU JOUEUR uniquement, voir main.ts. */
export const TALENT_FANTASSIN_DODGE_CHANCE = 0.3;

// --- Camera ---
export const CAMERA = {
  /** Angle valide par Antoine : le plateau se lit ni comme un rectangle plat
   *  (0°) ni comme un losange isometrique classique (45°), un entre-deux.
   *  55°/40°/22 -> 54°/25°/15 -> 45°/28°/20 (2026-08-14, demande d'Antoine :
   *  "la camera doit desormais etre ainsi par defaut" — valeurs lues
   *  directement sur son panneau de debug, capture d'ecran fournie : pivot
   *  45°, inclinaison 28°, zoom 20). */
  yawDeg: 45,
  pitchDeg: 28,
  /** Hauteur de monde visible a l'ecran, en unites. Plus petit = plus zoome. */
  viewHeight: 20,
  minViewHeight: 12,
  // Plafonne le dezoom maximal (2026-08-11, retour d'Antoine avec captures
  // d'ecran : le dezoom max precedent, 44, montrait un plateau trop petit/
  // eloigne — 31 correspond a la valeur qu'il a lui-meme jugee satisfaisante
  // sur sa 3e capture).
  maxViewHeight: 31,
  minPitchDeg: 25,
  maxPitchDeg: 85,
  /** Degres de pivot par pixel glisse, clic droit maintenu. */
  mouseYawSensitivity: 0.25,
  /** Degres d'inclinaison par pixel glisse, clic droit maintenu. */
  mousePitchSensitivity: 0.2,
  /** Unites de zoom par cran de molette. */
  wheelZoomStep: 1.5,
  /** Decalage vertical du CADRAGE (2026-08-11, demande d'Antoine : "le
   *  plateau est un peu haut par rapport a la camera, decentre-le un peu
   *  vers le bas") — decale le frustum orthographique (top ET bottom de la
   *  meme valeur, voir renderer.ts updateCamera) sans toucher au point vise
   *  ni au zoom : le plateau glisse visuellement plus bas a l'ecran, rien
   *  ne change en 3D (angle, distance, taille apparente). Reduit de 3 a 1.5
   *  le meme jour, retour d'Antoine avec capture d'ecran : au zoom par
   *  defaut, 3 poussait le coin avant du plateau trop pres du bord de
   *  l'ecran ("il ne faut pas qu'il sorte du cadre") — valeur toujours
   *  choisie par Claude, a ajuster si le compromis ne convient pas. */
  verticalFrameOffset: 1.5,
  /** Distance maximale (en cases) entre le point vise par la camera et la
   *  case de terrain existante la plus proche, quand le joueur deplace la
   *  camera (voir core/cameraBounds.ts) : assez de liberte pour regarder les
   *  bords, jamais de plateau perdu hors de l'ecran. */
  maxTargetDistanceFromTerrain: 6,
  /** Marges (pixels CSS) du cadrage de la carte en jeu (debut de run,
   *  Espace) : le haut et le bas laissent la place au HUD (indicateur de
   *  vague, panneaux du bas). */
  gameFrameMarginsPx: { top: 56, right: 24, bottom: 100, left: 24 },
};

// --- Palette ---
export const COLORS = {
  sky: 0x1b1f26,
  gridLine: 0x2f3a26,
  playerZone: 0x4a90d9,
  enemyZone: 0xd9614a,
  playerBody: 0x4a86c8,
  playerHead: 0x7fb2e6,
  enemyBody: 0xc85a45,
  enemyHead: 0xe89078,
  steel: 0x9aa3b2,
  steelDark: 0x565e6d,
  blade: 0xc9d1de,
  wood: 0x6b4a2a,
  bark: 0x4a3320,
  dirtPatch: 0x503924,
  /** Empennage/accent dore de la fleche du joueur : doit se distinguer du
   *  tir automatique des archers (couleur d'equipe) puisque c'est le seul
   *  geste que le joueur controle directement. */
  playerArrowAccent: 0xe8c15c,
  /** Orbe/Boule de feu du Mage (2026-08-11) — orange lumineux, partage entre
   *  la silhouette (orbe au bout du baton), le telegraphe au sol, le
   *  projectile et le flash d'impact, pour que les 4 se lisent comme UNE
   *  seule identite visuelle ("boule de feu"), pas 4 effets disparates. */
  fireGlow: 0xff8c3c,
  /** Palette elargie de la Boule de feu (2026-08-15, amelioration VFX
   *  demandee par Antoine — purement visuelle, voir render/fireballView.ts,
   *  AUCUN changement de degats/rayon/cadence). `fireCoreBright` = centre
   *  jaune clair/blanc chaud, les flammes elles-memes reutilisent `fireGlow`
   *  (orange) tel quel, `fireOuterGlow` = halo externe rouge-orange,
   *  `fireEmberDark` = braises orange sombre/rouge, `fireSmokeTint` = fumee
   *  grise-brune discrete (fondu NORMAL, pas additif — un fondu additif ne
   *  peut pas rendre une teinte "discrete", meme lecon deja tiree pour le
   *  coeur du parchemin de soin). */
  fireCoreBright: 0xfff6d2,
  fireOuterGlow: 0xe8501f,
  fireEmberDark: 0xb23a12,
  fireSmokeTint: 0x6b5a4a,
  /** Nova de glace / Blizzard (2026-08-14) — palette cyan pale/bleu glace/
   *  blanc bleute demandee explicitement par Antoine ("évite : néon
   *  sci-fi... énorme bloom"), volontairement sobre. `iceCore` = flash/
   *  cristaux (quasi-blanc bleute), `iceGlow` = anneau/teinte principale
   *  (cyan), `iceDeep` = accents plus sombres (contour de zone, facettes). */
  iceCore: 0xeaffff,
  iceGlow: 0x7fd8e6,
  iceDeep: 0x3f8fae,
  /** Parchemin de soin mineur (2026-08-14) — palette "soin" distincte du
   *  reste du jeu (jamais confondue avec les couleurs d'equipe, la Nova de
   *  glace ou la Boule de feu) : vert doux (vie/nature), blanc chaud
   *  (lumiere/benediction), rose pale (le cœur qui monte). */
  healGlow: 0x8be089,
  healCore: 0xfff6d8,
  /** Rose/magenta SATURE (2026-08-14, correctif "faut vraiment zoomer pour
   *  voir l'animation") — 0xffb3d1 (rose tres pale) etait trop proche du
   *  blanc pour bien ressortir, meme en fondu normal (pas additif). Sert au
   *  cœur, l'element "icone" de l'effet. */
  healAccent: 0xff5f96,
  /** Or chaud (2026-08-14, meme correctif) — le cercle au sol utilisait
   *  healCore (blanc chaud) en fondu additif : correct/lisible sur un sol
   *  sombre, mais un blanc additif sur une scene deja bien eclairee (herbe
   *  en plein jour) se "delave" et perd son contraste, contrairement a une
   *  teinte franchement coloree (meme principe que fireGlow/iceGlow qui
   *  fonctionnent bien en additif malgre le meme type de sol). */
  healGold: 0xffcf6b,
  /** Surbrillance jaune du talent "Recyclage" (2026-08-14) — anneau distinct
   *  de l'anneau de selection (couleur du camp), affiche sous une unite
   *  eligible a la revente bonifiee (< 50% PV) pendant le placement. Jaune
   *  franc, jamais confondu avec les autres palettes du jeu (soin, glace,
   *  feu, equipe). */
  recyclageHighlight: 0xffe34d,
  /** Fleche du joueur en 3 zones (2026-08-14, demande d'Antoine : "l'empennage
   *  doit etre bleu, la pointe grise et le bois au milieu marron clair") —
   *  voir render/playerArrowView.ts, coloration par sommet (le modele .obj
   *  n'a qu'UNE SEULE zone de materiau, impossible de recolorer par piece
   *  sans .mtl, voir historique). `arrowTip` reutilise COLORS.steel (metal
   *  neutre deja etabli ailleurs dans le jeu), `arrowFletching` reutilise
   *  COLORS.playerZone (bleu d'equipe deja etabli) — seul `arrowWood` est
   *  une teinte dediee, plus claire que COLORS.wood (reserve au decor). */
  arrowWood: 0xc19a6b,
  /** Provocation de la Sentinelle (2026-08-14) — "cri de guerre / onde de
   *  commandement", volontairement sobre et martial (pas un gros VFX
   *  magique, demande explicite : "la Sentinelle est un guerrier, pas un
   *  Mage"). Or/jaune franc pour l'onde et l'indicateur au-dessus des
   *  cibles provoquees, distinct des autres palettes du jeu (Recyclage,
   *  soin, glace, feu). */
  tauntGold: 0xe0a83c,
  /** Flash de bouclier gagne (Provocation) — bleu-blanc pale, evoque un
   *  eclat metallique plutot qu'une bulle magique. */
  shieldFlash: 0xdce8f2,
} as const;

// --- Obstacles ---
/** Un obstacle occupe toujours un nombre entier de cases : `cornerX`/`cornerZ`
 *  sont le coin bas-gauche de son emprise (toujours un entier, sur une ligne
 *  de grille), `tilesX`/`tilesZ` sa largeur et sa profondeur en cases. La hit
 *  box (ligne de tir ET collision physique) est calquee exactement sur cette
 *  emprise — jamais un cercle approximatif — pour que ce qu'on voit soit
 *  exactement ce qui bloque.
 *
 *  `kind` distingue deux comportements cote GAMEPLAY depuis le 2026-08-14
 *  (demande explicite d'Antoine, voir isCollidableObstacle ci-dessous) :
 *  `'rock'`/`'tree'`/`'building'` (le "décor" au sens gameplay) restent
 *  attribues au systeme de case et gardent une collision (mouvement ET ligne
 *  de tir) ; `'prop'` est purement visuel — traversable, jamais de
 *  collision. Avant cette date, `kind` ne servait qu'au rendu et la
 *  simulation traitait tous les obstacles de la meme facon — ce n'est plus
 *  vrai, voir isCollidableObstacle. */
export interface ObstacleDef {
  kind: 'rock' | 'tree' | 'prop' | 'building';
  /** Position CONTINUE (centre de l'emprise, monde) — 2026-08-16, placement
   *  libre des décors dans l'éditeur (voir CLAUDE.md, chantier VFX + éditeur).
   *  PRIORITAIRE sur `cornerX`/`cornerZ` dès qu'elle est présente : tout
   *  nouvel obstacle posé depuis l'éditeur l'utilise désormais
   *  EXCLUSIVEMENT (voir editor/editorState.ts, placeAt/moveSelected).
   *  `cornerX`/`cornerZ` restent lus pour la compatibilité des maps
   *  sauvegardées AVANT cette date (voir `obstacleCenter` ci-dessous — repli
   *  automatique, aucune migration manuelle nécessaire, voir Part T de la
   *  demande d'Antoine). */
  x?: number;
  z?: number;
  /** Coin de grille (case entière) — représentation HISTORIQUE, voir `x`/`z`
   *  ci-dessus. Reste la seule position pour un obstacle sans `x`/`z` (maps
   *  antérieures au 2026-08-16). Un bâtiment gameplay acheté en cours de run
   *  (Mine, Caserne — voir main.ts, confirmBuildingPlacement) utilise
   *  toujours `x`/`z` (position libre), jamais `cornerX`/`cornerZ`. */
  cornerX?: number;
  cornerZ?: number;
  tilesX: number;
  tilesZ: number;
  /** Force un modele precis (voir render/assetLibrary.ts, TREE_MODELS) au
   *  lieu du tirage aleatoire habituel — utile quand Antoine designe un arbre
   *  par son apparence et veut le meme partout, plutot que de laisser le
   *  hasard decider. Ignore pour les rochers et les props. */
  treeModel?: string;
  /** Modele impose pour un obstacle `kind: 'prop'` (voir render/props.ts,
   *  PROP_MODELS) : buche, souche, champignon, buisson, fleur, cactus, feu de
   *  camp, statue, pot, panneau, tente — un seul modele .glb, mis a l'echelle
   *  pour tenir dans l'emprise, sans la composition en grappe des rochers ni
   *  le calage sur la hauteur des arbres. */
  propModel?: string;
  /** Modele impose pour un obstacle `kind: 'building'` (2026-08-14, voir
   *  render/buildings.ts/assetLibrary.ts, BUILDINGS) : caserne, forge,
   *  château, tavern, tour, moulin... KayKit "Medieval Hexagon Pack",
   *  export .obj/.mtl (pas .glb/.gltf comme le reste du decor). Cle prefixee
   *  par la couleur d'equipe (`blue_`/`red_`) pour les batiments d'equipe,
   *  `neutral_` pour les batiments sans camp (pont, ruine, échafaudage...). */
  buildingModel?: string;
  /** Multiplicateur de taille optionnel (1 = taille normale) pour varier
   *  deliberement la stature d'un arbre ou d'un prop precis, en plus de la
   *  petite variation aleatoire deja tiree a chaque instance. Ignore pour les
   *  rochers. */
  scale?: number;
  /** Orientation forcee (radians, autour de l'axe vertical) au lieu du
   *  tirage aleatoire habituel — utilisee par l'editeur de maps pour que la
   *  rotation choisie par Antoine survive au lieu d'etre re-tiree au hasard
   *  a chaque rendu. Si absent, orientation fixee par la graine d'aspect
   *  (voir obstacleAppearanceSeed). */
  rotationY?: number;
  /** Graine d'aspect figée (orientation sans rotationY, forme d'un rocher,
   *  hauteur d'un arbre). Absente : dérivée de la position, voir
   *  obstacleAppearanceSeed. Écrite par l'agrandissement de la carte quand
   *  il déplace un décor, pour qu'il garde le même aspect. */
  appearanceSeed?: number;
}

/** Graine de l'aspect d'un décor : `appearanceSeed` s'il est fixé, sinon un
 *  hachage de son type, de son modèle, de sa taille et de la position de son
 *  centre. Le même décor a donc toujours le même aspect, dans l'éditeur comme
 *  en jeu ; déplacé dans l'éditeur, il en change. La rotation n'entre pas
 *  dans le calcul. */
export function obstacleAppearanceSeed(o: ObstacleDef): number {
  if (o.appearanceSeed !== undefined) return o.appearanceSeed >>> 0;
  const center = obstacleCenter(o);
  const key = [o.kind, o.treeModel ?? '', o.propModel ?? '', o.buildingModel ?? '', o.tilesX, o.tilesZ, o.scale ?? 1, Math.round(center.x * 1000), Math.round(center.z * 1000)].join('|');
  // FNV-1a 32 bits.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Un `prop` (champignon, buisson, fleur, buche, panneau...) est purement
 *  decoratif : ne bloque JAMAIS le mouvement d'une unite, la ligne de tir,
 *  ni le placement (2026-08-14, demande explicite d'Antoine : "les props
 *  qui se trouvent dans les spawn empêchent le déplacement d'unités... nous
 *  allons faire un système où les props seront traversables... les décor
 *  [rochers/arbres] eux seront attribués au système de case et auront donc
 *  une collision"). Seuls `'rock'`/`'tree'` restent "attribues au systeme de
 *  case" et gardent une hit box. Source de verite UNIQUE, reutilisee par
 *  `sim/world.ts` (filtre la liste que lit toute la simulation — mouvement,
 *  ligne de tir, pathfinding, capacites) ET `main.ts` (validite d'une case
 *  en phase de placement) — jamais deux listes/regles qui pourraient
 *  diverger. Le RENDU, lui, continue d'afficher TOUS les obstacles quel que
 *  soit leur `kind` (voir render/board.ts, qui lit `map.obstacles` non
 *  filtre) : un prop reste visible, juste sans collision. */
export function isCollidableObstacle(obstacle: ObstacleDef): boolean {
  return obstacle.kind !== 'prop';
}

/** Centre (monde) de l'emprise d'un obstacle — SOURCE UNIQUE réutilisée par
 *  le rendu (rocks/trees/props/buildings.ts), l'éditeur (repositionnement,
 *  anneau de sélection) et la simulation (obstacleBounds) : ne PLUS jamais
 *  calculer `cornerX + tilesX/2` à la main à un nouvel endroit. Préfère la
 *  position CONTINUE (`x`/`z`) si présente, sinon dérive du coin de grille
 *  historique (`cornerX`/`cornerZ`) — un obstacle sans AUCUNE des deux (ne
 *  devrait jamais arriver, donnée corrompue) retombe sur le centre du
 *  plateau plutôt que de planter. */
export function obstacleCenter(o: Pick<ObstacleDef, 'x' | 'z' | 'cornerX' | 'cornerZ' | 'tilesX' | 'tilesZ'>): { x: number; z: number } {
  if (o.x !== undefined && o.z !== undefined) return { x: o.x, z: o.z };
  return { x: (o.cornerX ?? 0) + (o.tilesX * TILE) / 2, z: (o.cornerZ ?? 0) + (o.tilesZ * TILE) / 2 };
}

/** Bornes d'un obstacle en coordonnees monde, calculees une seule fois pour
 *  eviter de repeter le meme calcul dans chaque systeme qui en a besoin. */
export interface ObstacleBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** 2026-08-16 : derive desormais du CENTRE (voir obstacleCenter, qui prefere
 *  la position continue x/z si presente) plutot que directement de
 *  cornerX/cornerZ — fonctionne identiquement pour un obstacle QUELCONQUE,
 *  aligne sur la grille ou pose librement entre deux cases (voir CLAUDE.md,
 *  chantier placement libre). Le rectangle de collision reste EXACTEMENT
 *  tilesX x tilesZ cases de large, juste centre a un endroit qui n'est plus
 *  force d'etre un coin de case. Fonction pure, a cote d'obstacleCenter dans
 *  config/ (couche neutre) : partagee par la simulation, l'editeur et
 *  main.ts sans qu'aucun d'eux depende d'un autre. */
export function obstacleBounds(obstacle: ObstacleDef): ObstacleBounds {
  const center = obstacleCenter(obstacle);
  const halfW = (obstacle.tilesX * TILE) / 2;
  const halfD = (obstacle.tilesZ * TILE) / 2;
  return {
    minX: center.x - halfW,
    maxX: center.x + halfW,
    minZ: center.z - halfD,
    maxZ: center.z + halfD,
  };
}

/** Distance (en cases) a laquelle une unite en marche neutre (pas encore de
 *  cible verrouillee) sonde le terrain devant elle pour anticiper un
 *  contournement, plutot que de foncer tout droit dans un obstacle avant de
 *  reagir. La poursuite d'une cible n'a pas besoin de ce reglage : elle teste
 *  deja tout le segment jusqu'a la cible, donc elle anticipe depuis
 *  n'importe quelle distance. */
export const OBSTACLE_LOOKAHEAD = 3 * TILE;

/** Marge (en cases) ajoutee au rayon de l'unite pour decider de contourner un
 *  obstacle et pour placer le point vise pendant le detour. Volontairement
 *  plus large que le strict minimum de collision physique : une marge trop
 *  serree fait "raser" l'obstacle au lieu de vraiment l'eviter, ce qui se lit
 *  a l'ecran comme une unite qui fonce dedans avant de se corriger au dernier
 *  moment plutot qu'un contournement delibere. Voir findSteeringPoint. */
export const OBSTACLE_AVOIDANCE_MARGIN = 0.6 * TILE;

/** Obstacles fixes du plateau. Double effet, sur la meme emprise exacte :
 *  bloquent la ligne de tir des attaques a distance (une unite dont le tir
 *  traverserait un obstacle le contourne de quelques pas au lieu de tirer
 *  dans le vide, voir combatSystem) ET bloquent physiquement les pas (voir
 *  resolveObstacleCollisions dans movementSystem) — une unite ne peut pas
 *  traverser un rocher, ni un arbre, en marchant. */
export const OBSTACLES: ObstacleDef[] = [
  // Rocher lateral, a l'ecart du centre.
  { kind: 'rock', cornerX: 3, cornerZ: -1, tilesX: 2, tilesZ: 2 },
  // Gros rocher central, 3x3. Une carte de largeur paire ne peut pas centrer
  // parfaitement un bloc de largeur impaire : on penche deliberement d'une
  // case vers la gauche plutot que vers la droite.
  { kind: 'rock', cornerX: -2, cornerZ: -1, tilesX: 3, tilesZ: 3 },
  // Second gros rocher 3x3, demande par Antoine, centre exactement sur la
  // case (-5, 4) : coin en (-6, 3).
  { kind: 'rock', cornerX: -6, cornerZ: 3, tilesX: 3, tilesZ: 3 },
  // Arbres : emprise 1x1, hors des zones de placement pour ne jamais gener
  // la pose d'une unite. Deux sur les bords lateraux, un troisieme au centre
  // cote joueur (bleu), en diagonale haut-gauche du gros rocher.
  { kind: 'tree', cornerX: -8, cornerZ: 4, tilesX: 1, tilesZ: 1 },
  { kind: 'tree', cornerX: 7, cornerZ: -5, tilesX: 1, tilesZ: 1 },
  { kind: 'tree', cornerX: -4, cornerZ: 3, tilesX: 1, tilesZ: 1 },
  // (Ancien arbre en (5, 8), demande par Antoine puis retire le 2026-08-08 :
  // il se trouvait juste devant la baliste du joueur, dans son champ de tir.)
  // Deux arbres demandes par Antoine pour remplir le cote rouge, juge trop
  // vide : emplacement laisse a mon choix. L'un pres de la ligne mediane
  // cote rouge (z legerement negatif, hors de toute zone de placement),
  // l'autre dans le spawn ennemi (z entre -13 et -6), a l'ecart de la
  // formation ennemie par defaut (x -2..1) pour ne pas la recouvrir.
  // Modele force a tree_fat sur les trois, pour la meme raison que ci-dessus.
  // Tailles volontairement variees (scale) : Antoine a demande des versions
  // "un peu plus grandes" pour casser la repetition d'un meme modele repete.
  { kind: 'tree', cornerX: -6, cornerZ: -3, tilesX: 1, tilesZ: 1, treeModel: 'tree_fat' },
  { kind: 'tree', cornerX: 6, cornerZ: -10, tilesX: 1, tilesZ: 1, treeModel: 'tree_fat', scale: 1.45 },
];

// --- Separation entre corps (ce qui transforme un tas en foule) ---
export const SEPARATION_STRENGTH = 8;
/** Nombre de sous-passes par tick pour la separation entre unites ET la
 *  collision avec les obstacles, resolues ensemble a chaque sous-passe. Sans
 *  ca, les deux systemes se corrigent chacun de leur cote sans se parler :
 *  une unite coincee entre un rocher et ses voisines se fait repousser par
 *  l'un pendant que l'autre la retient, ce qui oscille au lieu de se
 *  stabiliser (tremblement observe en jeu). Plusieurs petites passes dans le
 *  meme tick laissent la foule et le decor converger avant que la poursuite
 *  ne rejuge la situation au tick suivant. */
export const COLLISION_ITERATIONS = 5;

/** Secondes sans progres significatif avant qu'une unite ne soit consideree
 *  bloquee (typiquement plusieurs allies qui se genent mutuellement en visant
 *  des cibles differentes). Ne s'applique que si l'unite essaie activement
 *  d'avancer (cible hors de portee), jamais a une unite arretee pour combattre.
 *  Reduit de 1.0 a 0.5 (2026-08-10, bosquets denses de la carte "vague1-20") :
 *  la manoeuvre de degagement elle-meme est maintenant fiable pres d'un
 *  obstacle (voir triggerUnstick, conscience des obstacles), donc declencher
 *  plus tot ne fait plus que reduire le temps ou l'unite parait "collee" a
 *  l'oeil, sans risque de faux positif supplementaire (le seuil de distance
 *  ci-dessous reste tres genereux compare a la vitesse normale d'une unite). */
export const STUCK_DURATION = 0.5;
/** Distance minimale (unites) que l'unite doit avoir parcourue sur STUCK_DURATION
 *  pour ne PAS etre consideree bloquee. */
export const STUCK_DISTANCE_THRESHOLD = 0.15;
/** Duree totale de la manoeuvre de degagement une fois declenchee : la
 *  premiere moitie est un grand pas en arriere, la seconde un pas de cote vers
 *  la zone la moins encombree d'allies. */
export const UNSTICK_DURATION = 0.8;

/** Fenetre (secondes) sur laquelle on verifie qu'une unite qui poursuit une
 *  cible hors de portee se rapproche vraiment d'elle, en plus de la simple
 *  detection d'immobilite (STUCK_DURATION). Sans ca, deux unites qui
 *  contournent le meme obstacle chacune de son cote en poursuivant chacune
 *  une cible elle-meme mobile peuvent tourner indefiniment autour de
 *  l'obstacle sans jamais se rattraper : chacune bouge bel et bien a chaque
 *  tick (stuckTimer ne voit donc rien), mais la distance a la cible ne
 *  diminue jamais sur la duree. Volontairement plus longue que
 *  STUCK_DURATION : un detour legitime peut eloigner temporairement de la
 *  cible sans que ce soit un vrai blocage. */
/** Reduit de 4.0 a 2.0 (2026-08-10, meme motif que STUCK_DURATION ci-dessus) :
 *  une unite qui grince lentement le long d'un bosquet sans faire de vrai
 *  progres net (bouge, mais pas vers sa cible) attendait jusqu'a 4 secondes
 *  entieres avant que ce filet de secours n'intervienne — visible et long a
 *  l'oeil. PROGRESS_THRESHOLD est reduit proportionnellement (moitie moins
 *  de temps => moitie moins de progres exige) pour garder le meme niveau de
 *  tolerance a un detour legitime. */
export const ORBIT_CHECK_DURATION = 2.0;
/** Distance minimale (cases) dont il faut s'etre rapproche de la cible sur
 *  ORBIT_CHECK_DURATION pour ne PAS etre considere en orbite. */
export const ORBIT_PROGRESS_THRESHOLD = 0.15;

/** Repli pathfinding pour la MARCHE NEUTRE (2026-08-16, bug remonte par
 *  Antoine : unites pres du bord d'une grande carte, ou bloquees par une
 *  muraille dont l'unique ouverture est loin sur le cote). Avant une cible
 *  verrouillee, une unite ne fait qu'un evitement REACTIF local
 *  (findSteeringPoint, movement.ts) — suffisant pour un decor clairseme mais
 *  structurellement incapable de contourner un obstacle qui s'etend bien
 *  au-dela de ce que "quelques cases devant" peut voir (voir CLAUDE.md,
 *  "vrai pathfinding" : c'est exactement ce qui avait deja motive le
 *  pathfinding en grille pour la POURSUITE d'une cible, jamais etendu a la
 *  marche neutre a l'epoque). Fenetre volontairement large (bien plus longue
 *  qu'ORBIT_CHECK_DURATION) : un detour reactif normal autour d'un obstacle
 *  isole peut legitimement prendre plusieurs secondes sans avancer en Z
 *  (mesure historique : jusqu'a 7-12s pour un bosquet dense) — ne doit
 *  jamais se declencher pour ce cas courant, seulement pour un vrai blocage
 *  prolonge. */
export const NEUTRAL_STUCK_CHECK_DURATION = 6.0;
/** Progres minimal (cases, dans la direction d'avance de l'unite) exige sur
 *  NEUTRAL_STUCK_CHECK_DURATION pour ne PAS declencher le repli pathfinding
 *  ci-dessus. */
export const NEUTRAL_STUCK_PROGRESS_THRESHOLD = 1.0;

// --- Combat ---
/** Duree d'affichage (s) de TOUS les textes flottants du combat (« raté »,
 *  « esquivé », soins, « +N or ») : montee + fondu, puis retrait du DOM.
 *  0,6 avant, allongee d'environ un tiers pour laisser le temps de lire. */
export const MISS_TEXT_DURATION = 0.8;
/** Duree de la chute en arriere d'une unite a sa mort (bascule sur le dos),
 *  AVANT le fondu — demande d'Antoine (2026-08-08) : "tomber en arriere puis
 *  disparaitre en fondu", valable pour toutes les unites (fantassin, archer). */
export const DEATH_FALL_DURATION = 0.3;
/** Duree du fondu (opacite 1 -> 0) qui suit la chute, avant que l'unite
 *  disparaisse pour de bon. */
export const DEATH_FADE_DURATION = 0.35;
/** Hauteur au-dessus du sol a laquelle ancrer les pips de PV et le texte de miss. */
export const HP_BAR_WORLD_HEIGHT = 1.3;
/** Duree de l'amorce d'attaque (coup ou rate) : sans elle, une attaque ne se
 *  voit qu'a la baisse des PV, ce qui rend le combat illisible. */
export const ATTACK_ANIM_DURATION = 0.22;
/** Distance de la ruade vers l'avant jouee pendant l'amorce d'attaque, pour
 *  toute unite SANS bras anime (attackArm) — actuellement aucune, l'archer
 *  tire une fleche et ne joue pas cette amorce. Conserve comme repli
 *  generique plutot que supprime, au cas ou une future unite au corps a
 *  corps sans arme animee en ait besoin. */
export const ATTACK_LUNGE_DISTANCE = 0.3;
/** Amplitude du coup d'epee (bras droit du fantassin) : leve puis rabattu
 *  vers l'avant en un seul mouvement rapide, sur la duree ATTACK_ANIM_DURATION.
 *  Volontairement modeste ("un petit coup") plutot qu'un grand geste theatral. */
export const ATTACK_SWING_ANGLE = Math.PI / 3;
/** Duree de vol (temps reel) d'une fleche d'archer, du tir a l'impact. Volontairement
 *  rapide et sans arc marque : c'est du tir automatique d'ambiance, pas la fleche du
 *  joueur (lente, tres visible, arquee) qui reste un geste a part. */
export const ARCHER_PROJECTILE_DURATION = 0.22;
/** Duree pendant laquelle une unite dont la ligne de tir est bloquee se
 *  deplace lateralement pour tenter de la degager, avant de retenter un tir. */
export const SIDESTEP_DURATION = 1.1;
/** Duree du flash blanc (emissive) joue sur une silhouette qui vient
 *  d'encaisser un coup — premier ajout "game feel" (2026-08-09) : sans lui,
 *  un coup qui touche ne se distingue de rien tant que la barre de PV n'a pas
 *  visiblement bouge. Volontairement tres court ("frame d'impact"), et
 *  seulement sur un HIT reel — jamais sur un miss (deja signale par le texte
 *  "rate", cumuler les deux ferait du bruit plutot que de la lisibilite). */
export const HIT_FLASH_DURATION = 0.12;

// --- Cadence de base, capacite Charge (generique) ---
/** Cadence de l'attaque automatique du fantassin — extraite en constante
 *  plutot que codee en dur, au cas ou une future unite melee voudrait s'y
 *  synchroniser (deja fait une fois pour le Cavalier leger, retire du jeu le
 *  2026-08-11 — voir CLAUDE.md). Voir data/units.ts. */
export const FANTASSIN_ATTACK_COOLDOWN = 1.0;
/** Vitesse de la RUÉE de la capacite Charge (cases/seconde, voir
 *  data/abilities.ts ChargeAbility) — INDEPENDANTE de moveSpeed. Systeme
 *  generique CONSERVE malgre le retrait du Cavalier leger (son seul
 *  consommateur, 2026-08-11 — voir CLAUDE.md) : explicitement prevu pour un
 *  futur Chevalier lourd, pas du code mort au sens habituel du terme. */
export const CHARGE_DASH_SPEED = 12;
/** Recul ("bump d'impact") inflige a la cible d'une Charge reussie, en
 *  CASES — au-dela des degats, un vrai coup qui bouscule physiquement. Pas
 *  de verification d'obstacle sur la destination : resolveObstacleCollisions
 *  (movementSystem) la ressort au tick suivant si necessaire, meme tolerance
 *  deja acceptee pour la separation entre corps. */
export const CHARGE_KNOCKBACK_TILES = 1;

// --- Transition de fin de vague ---
// Demande d'Antoine (2026-08-09) : la bascule bataille -> boutique etait
// instantanee ("trop brusque"), il fallait "sequencer proprement les
// differentes phases de gameplay". Sequence jouee par ui/waveTransition.ts,
// en millisecondes (temps reel, hors boucle de simulation deja figee a ce
// moment via loop.timeScale = 0) : la banniere "Victoire"/"Defaite" apparait
// en fondu PAR-DESSUS le champ de bataille encore visible (choix d'Antoine
// parmi 3 options proposees), tient un instant, puis un rideau noir plein
// ecran se referme — c'est au moment ou il est totalement opaque qu'on vide
// le champ de bataille et prepare l'ecran suivant (invisible pour le
// joueur), avant de rouvrir le rideau sur ce nouvel ecran. Duree totale visee
// ~2 secondes, comme demande.
export const WAVE_TRANSITION_BANNER_FADE_MS = 350;
export const WAVE_TRANSITION_HOLD_MS = 1100;
export const WAVE_TRANSITION_CURTAIN_FADE_MS = 400;

/** Duree d'affichage du toast "point de talent disponible" (voir
 *  ui/talentPointToast.ts) avant qu'il ne s'estompe tout seul — demande
 *  d'Antoine 2026-08-10 ("afficher un message, une pop-up"), choisi discret
 *  et auto-disparaissant plutot qu'une modale a fermer, pour ne pas casser le
 *  sequencement bataille -> boutique deja en place. Monte de 3200 a 6000
 *  (2026-08-14, meme toast enrichi d'une seconde ligne — direction + resume
 *  de l'arbre, voir TalentPointToast.show) : le texte a lire est nettement
 *  plus long qu'a l'origine, 3.2s ne laissait pas le temps de le parcourir. */
export const TALENT_POINT_TOAST_DURATION_MS = 6000;

/** Toast "nouvelle unité débloquée" (2026-08-15, systeme generique de
 *  deblocage — voir ui/unitUnlockToast.ts) — plus court que le toast de
 *  point de talent, message a une seule ligne (juste le nom de l'unite). */
export const UNIT_UNLOCK_TOAST_DURATION_MS = 3500;

/** Vitesse du cycle de marche (radians/seconde reelle), independante de la
 *  vitesse de deplacement reelle de l'unite : juste de quoi donner un peu de
 *  vie aux silhouettes cubiques, pas une simulation biomecanique. S'applique
 *  aussi bien en avancant qu'en reculant (ex. la manoeuvre de degagement,
 *  voir movementSystem) puisque le declencheur est "l'unite bouge", pas un
 *  sens particulier. */
export const WALK_CYCLE_SPEED = 9;
/** Amplitude du balancement des jambes (radians) : modeste, pour rester
 *  lisible sans caricature ("ne pas trop compliquer", demande d'Antoine). */
export const WALK_SWING_AMPLITUDE = 0.45;
/** Distance parcourue par tick de simulation en-dessous de laquelle une
 *  unite est consideree immobile (pas en marche) : plus haut que le bruit
 *  habituel de la separation entre corps, plus bas qu'un vrai pas de marche
 *  (~0.07 a vitesse normale), pour ne pas animer une unite juste bousculee. */
export const WALK_MOVE_THRESHOLD = 0.01;

/** Duree de fondu enchaine (secondes reelles) entre deux clips d'animation
 *  d'une unite RIGGEE (squelette + AnimationMixer — voir render/mageRig.ts,
 *  premiere unite du jeu dans ce cas, 2026-08-11) au changement d'etat
 *  (marche/attaque/incantation/repos). Les unites en boites n'utilisent pas
 *  cette valeur : leurs "animations" sont des rotations procedurales
 *  directes (tickWalkAnim/tickAttackAnim), sans notion de fondu enchaine. */
export const RIGGED_ANIM_FADE_SECONDS = 0.15;

/** Fraction du clip `mage_soell_cast_4` (voir render/mageRig.ts) qui
 *  correspond au vrai geste de lancer, AVANT la retombee/le repos qui occupe
 *  le reste du clip — voir UnitViews.tickRiggedAnimation. Antoine, invite a
 *  estimer sans acces visuel de mon cote : "vers les 2/3 du mouvement". Le
 *  projectile est lance exactement quand cette fraction est atteinte
 *  (castTime ecoule) ; le dernier tiers du clip continue de jouer APRES,
 *  sans bloquer le tir. A ajuster si le "lacher" ne tombe toujours pas au
 *  bon moment a l'usage. */
export const MAGE_CAST_RELEASE_FRACTION = 2 / 3;

/** Fraction du clip d'attaque riggé de l'Archer ("tir à l'arc", voir
 *  render/archerRig.ts) a laquelle le tir part visuellement — estimation
 *  (~60%, "vers la fin d'un cycle tension-relachement") faute d'acces
 *  visuel pour reperer l'image exacte de lacher, meme principe que
 *  MAGE_CAST_RELEASE_FRACTION. Contrairement au Mage (le lancement du
 *  projectile est un evenement de SIMULATION synchronise sur `entity.cast`),
 *  l'attaque de l'archer resout ses degats INSTANTANEMENT (combatSystem,
 *  pas de fenetre d'incantation) — cette fraction pilote seulement un DELAI
 *  cosmetique avant `projectiles.spawn` (voir main.ts, pendingArrowSpawns),
 *  jamais la simulation elle-meme. */
export const ARCHER_ATTACK_RELEASE_FRACTION = 0.6;

// --- Fleche du joueur ---
// L'etape la plus importante du projet (voir CLAUDE.md) : le seul geste de
// combat que le joueur controle directement, tire depuis une arbalete fixe
// postee dans un coin du plateau. Contrairement a la fleche d'archer
// (purement cosmetique, les degats sont deja resolus avant le tir visuel),
// le vol de CETTE fleche doit etre simule dans sim/ : les degats ne
// s'appliquent qu'a l'impact, sur quoi que ce soit qui se trouve alors au
// point vise (vise libre au sol, pas un verrouillage sur une cible — la
// cible peut donc bouger et esquiver un tir mal anticipe). Voir sim/world.ts.
/** Secondes entre deux tirs. Le verrou d'origine ("ne pas baisser sans le
 *  redemander", la reduction etait reservee a l'arbre de talents) a ete
 *  explicitement leve par Antoine le 2026-08-12 : "la fleche... est un peu
 *  molle, augmente la vitesse de tir de base de 30%" — cadence = 1/cooldown,
 *  donc +30% de cadence = cooldown / 1.3 (3 -> ~2.31s). Le talent "tir
 *  rapide" (`TALENT_FIRE_RATE_BONUS`, voir main.ts `effectivePlayerArrowCooldown`)
 *  reste un multiplicateur RELATIF a cette base, donc s'ajuste automatiquement
 *  sans changement de code — exactement ce qu'Antoine a demande.
 */
export const PLAYER_ARROW_COOLDOWN = 3 / 1.3;
/** Degats internes (x10) : 2 degats affiches, cible ~20 % des degats d'une
 *  vague — assez pour compter, pas assez pour rendre l'armee decorative. */
export const PLAYER_ARROW_DAMAGE = 20;
/** Vitesse de vol, en cases/seconde. Beaucoup plus lente qu'une fleche
 *  d'archer (quasi instantanee) : le trait doit rester visible et suivable
 *  a l'oeil tout au long de sa trajectoire, pas juste un flash.
 *  9 -> 13.5 (2026-08-12, +50% demande par Antoine, meme message que le
 *  cooldown ci-dessus) — le talent "tir rapide" (`TALENT_PROJECTILE_SPEED_BONUS`)
 *  reste lui aussi un multiplicateur relatif, s'ajuste automatiquement. */
export const PLAYER_ARROW_SPEED = 9 * 1.5;
/** Hauteur de l'arc au sommet de la trajectoire, en cases : nettement plus
 *  haut que l'arc discret de la fleche d'archer (0.3), pour qu'elle "arque
 *  au-dessus du champ" et reste lisible depuis n'importe quel point du
 *  plateau pendant son vol. */
export const PLAYER_ARROW_ARC_HEIGHT = 3.5;
/** Rayon de tolerance (cases) autour du point vise pour compter comme un
 *  impact : legerement plus genereux que le rayon de corps d'une unite, pour
 *  ne pas punir une vise a un cheveu pres tout en gardant un vrai tir de
 *  precision (vise libre, pas de verrouillage sur cible). Monte 0.55 -> 0.63
 *  (2026-08-11, demande d'Antoine : "les fleches sont trop dur a toucher"). */
export const PLAYER_ARROW_HIT_RADIUS = 0.63;
/** Portee maximale de la Baliste du joueur (cases), en AUTO comme en MANUEL :
 *  distance du centre de la Baliste au point vise (MANUEL) ou a la cible
 *  (AUTO). Valeur FIXE, independante de la taille de la carte : la moitie de
 *  la profondeur de l'arene du Mode survie (36 cases) — depuis sa position
 *  (z = 15,5), elle porte 2,5 cases au-dela du milieu du terrain et reste a
 *  6,5 cases de la zone de depart ennemie. */
export const PLAYER_ARROW_RANGE = 18;
/** Distance (en cases) entre la baliste du joueur et le coin (+X, +Z) du
 *  plateau — la position elle-meme est calculee depuis la taille REELLE du
 *  plateau (voir config/mapDef.ts, computePlayerArrowOrigin), pas une
 *  coordonnee fixe : demande d'Antoine (2026-08-08), la baliste doit rester
 *  dans le coin quelle que soit la taille de la carte chargee, agrandie ou
 *  non. Valeur choisie a l'origine pour le plateau par defaut (18×26 →
 *  coin (8, 12)), confirmee depuis par Antoine.
 *  Montee de 1 -> 1.6 le 2026-08-14 (essai "baliste sur tour", voir
 *  render/ballista.ts, buildBallistaTowerPlatform) : la baliste seule tenait
 *  dans un inset de 1 case, mais la PLATEFORME (tour agrandie a 2.4×2.4
 *  cases, demi-emprise 1.2) deborderait du plateau avec l'ancien inset —
 *  1.6 laisse une marge de 0.4 case entre le bord exterieur de la
 *  plateforme et le vrai bord de la carte. */
export const PLAYER_ARROW_CORNER_INSET = 1.6;

/** Emprise (cases, carrée) de la plateforme tour+baliste — voir
 *  render/ballista.ts, buildBallistaTowerPlatform (mise à l'échelle visuelle
 *  du modèle) ET config/mapDef.ts, computeBallistaObstacle (2026-08-16,
 *  architecture BUILDING : la Baliste devient un bâtiment gameplay
 *  destructible, footprint de collision/placement dérivé de CETTE MÊME
 *  valeur — jamais une emprise dupliquée à la main). Centrée sur
 *  computePlayerArrowOrigin. */
export const BALLISTA_TOWER_FOOTPRINT = 2.4;

// --- Talent "Mitraillette" (2026-08-14, Précision, palier 2) -----------
// Voir data/talents.ts (mitraillette) et main.ts (totalBallistaAttackSpeedBonus/
// buildBallistaVolleyShots) pour l'implementation complete.

/** Multiplicateur applique au TOTAL des bonus de vitesse d'attaque de la
 *  Baliste (Tir rapide + amelioration boutique + tout futur bonus) —
 *  JAMAIS a la cadence de base elle-meme (demande explicite d'Antoine :
 *  "je ne veux pas cadence de base x3, je veux BONUS DE VITESSE D'ATTAQUE
 *  x3"). Avec 0 bonus actif, 0 x 3 = 0 : la cadence de base reste inchangee. */
export const TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER = 3;

/** Rayon de recherche (cases) autour du CURSEUR pour les 2 cibles
 *  secondaires de Mitraillette — volontairement "proche du curseur", pas
 *  toute la carte. Choisi entre HEAL_TARGET_RADIUS (2, une seule cible
 *  alliee precise) et l'aggroRange de l'archer (6, portee d'engagement
 *  normale) : assez genereux pour trouver un petit groupe d'ennemis proche
 *  du point vise, sans jamais aller chercher a l'autre bout du plateau. A
 *  ajuster si trop restrictif/permissif une fois vu en jeu. */
export const MACHINE_GUN_SECONDARY_TARGET_RADIUS = 3;

/** Petit decalage lateral (cases) applique au point de DEPART visuel des 2
 *  carreaux secondaires (gauche/droite de l'axe de tir principal) — purement
 *  cosmetique, pour que les 3 carreaux se lisent comme partant de la meme
 *  arme sans etre parfaitement superposes au depart (demande explicite,
 *  "ils doivent clairement sembler provenir de la meme arme"). */
export const MACHINE_GUN_ORIGIN_OFFSET = 0.12;

/** Decalage lateral (cases) applique au point VISE des carreaux secondaires
 *  quand aucun ennemi valide n'est trouve pour cette cible (0 ou 1 ennemi a
 *  portee, voir buildBallistaVolleyShots) — une "dispersion extremement
 *  faible" autour du curseur (demande explicite), jamais un vrai deuxieme
 *  point de visee independant. */
export const MACHINE_GUN_FALLBACK_TARGET_OFFSET = 0.35;

// --- Talent "Soins excédentaires" (2026-08-15) ---
// Palier II de la branche Soigneur, sous "Aux petits oignons" (voir
// data/talents.ts). Chaque point de soin EXCEDENTAIRE (au-dela du plafond de
// PV, sur n'importe laquelle des 3 sources de soin du joueur — voir main.ts,
// applyPlayerHeal/triggerShadowProjectiles) genere un projectile d'ombre REEL
// (vol simule, voir sim/systems/shadowProjectiles.ts), pas un degat instantane.

/** Vitesse de vol (cases/seconde) — nom centralise comme demande, jamais un
 *  litteral duplique. Rapide mais pas instantane (voir HIT_RADIUS interne au
 *  systeme) : assez visible pour se lire comme un vrai projectile sans
 *  jamais sembler lent/mou. Montee de 10 a 15 (2026-08-18, demande explicite
 *  d'Antoine : "plus rapides, plus nerveuses visuellement") — le systeme de
 *  vol (sim/systems/shadowProjectiles.ts) gere deja nativement une vitesse
 *  qui depasse la distance restante en un seul pas (`step >= d`), aucun
 *  risque de depassement/instabilite a cette valeur plus elevee. */
export const SHADOW_PROJECTILE_SPEED = 15;

/** Degats de BASE (echelle interne x10) d'un projectile d'ombre, avant tout
 *  bonus de la boutique d'amelioration permanente (voir
 *  run/shadowUpgradeEffects.ts, shadowDamagePerProjectile = 1 + niveau*0.5,
 *  qui ajoute a cette base plutot que de la remplacer). 1 PV affiche. */
export const SHADOW_PROJECTILE_BASE_DAMAGE = 10;

/** Palette du projectile d'ombre — orbe SOMBRE, jamais une grosse explosion
 *  (demande explicite d'Antoine) : `shadowCore` = coeur presque noir,
 *  `shadowGlow` = halo violet/magenta, distincts de toutes les autres
 *  palettes du jeu (feu, glace, soin). */
export const SHADOW_PROJECTILE_CORE_COLOR = 0x140a1c;
export const SHADOW_PROJECTILE_GLOW_COLOR = 0x9a3fd9;
/** Flash/accent MAGENTA a l'impact (2026-08-16, grosse passe VFX) — distinct
 *  du violet d'aura (SHADOW_PROJECTILE_GLOW_COLOR), plus vif/chaud, pour le
 *  "flash magenta" demande explicitement sur l'impact. */
export const SHADOW_PROJECTILE_IMPACT_COLOR = 0xe85fd9;
/** Coque semi-transparente autour du noyau (2026-08-18, deuxieme passe VFX —
 *  demande explicite : "petite boule de magie violette... noyau sombre ou
 *  violet intense") — un violet plus clair/vif que le glow externe, pour un
 *  vrai degrade noyau -> coque -> halo, meme principe que la Boule de feu
 *  (coeur clair + coque teintee) mais transpose a la palette sombre/violette. */
export const SHADOW_PROJECTILE_SHELL_COLOR = 0xc76bf2;
/** "Couronne" ornee qui orbite/pulse autour du projectile (magic_02.png) —
 *  un mauve plus profond que le glow, pour se distinguer nettement du halo
 *  rond en dessous plutot que de se fondre avec lui. */
export const SHADOW_PROJECTILE_CROWN_COLOR = 0x7a2fb0;
