# Problèmes connus

Ce fichier recense les bugs, limitations techniques, incohérences entre
documentation et code, et fragilités connues d'Arrow Tactics, d'après le code
de la branche `reprise-2026`.

Il ne contient ni fonctionnalités futures (voir la roadmap) ni questions de
game design.

**Statuts**

- **Confirmé** : comportement incorrect démontré par le code ou par une
  mesure. Quand une entrée n'a été établie que par lecture du code, sans
  reproduction en jeu, c'est indiqué.
- **À vérifier** : suspicion sérieuse, pas encore reproduite. Ne pas traiter
  comme un bug établi.
- **Dette** : fonctionne aujourd'hui, mais fragile ou source probable de
  dérive.

Les pistes de correction sont indicatives : rien n'est implémenté ici.

## Tableau récapitulatif

| ID | Titre | Statut |
|---|---|---|
| KI-02 | Placement en jeu sans test direct des cellules | Dette (atténuée) |
| KI-03 | Bâtiment potentiellement inatteignable | À vérifier |
| KI-04 | Contrat implicite « ordre de spawn = ordre de l'armée » | Dette |
| KI-09 | Descriptions de talents aux valeurs codées en dur | Dette (réduite à 2 talents) |
| KI-11 | Nom trompeur `MAGE_UNLOCK_WAVE` | Dette |
| KI-12 | Sens implicite du « record de vague » | Dette |
| KI-15 | Aucune suite de tests automatisée | Corrigé en partie (2026-11-04 : `tests/`, `npm test`) |
| KI-16 | Assets inutilisés copiés dans le build | Confirmé (mesuré) |
| KI-20 | Validation partielle des positions dans l'éditeur | Dette |
| KI-21 | Justificatifs de provenance et de droits des assets non archivés | Dette |
| KI-22 | Assets suivis directement par Git, sans Git LFS | Dette |
| KI-23 | Raycast sur un modèle animé avant son premier rendu | Dette |
| KI-24 | Espace réactive le bouton qui a gardé le focus | Confirmé (éditeur) / Corrigé en jeu pour Espace |
| KI-26 | Arbres et props pivotent autour de l'origine de leur modèle | Dette (lecture du code) |
| KI-27 | L'agrandissement de run ne déplace ni le relief ni les surfaces | Sans objet (agrandissement retiré le 2026-11-04, G40) |
| KI-28 | Faces de raccord sombres aux coins d'un bord qui change de niveau | Confirmé (rendu par défaut ; absent de `?relief=`) |
| KI-29 | Lave peignable mais franchissable (eau corrigée le 2026-11-01) | Limite assumée (lave : rendu seulement) |
| KI-30 | Cadence d'attaque allongée d'un pas par l'arrondi flottant | Confirmé (mesuré) |
| KI-31 | Ennemis officiels toujours rouges alors que le camp adverse est Neutre (brun) | Limite assumée (GLB pré-teintés) |
| KI-32 | Héros sans son GLB local : modèle de Sentinelle, sans outils ni gestes de travail | Limite assumée (assets hors Git) |
| KI-33 | Chantier semi-transparent sans écriture de profondeur | À vérifier (rendu) |
| KI-34 | Grande carte : un maillage par décor, des milliers d'appels de dessin | Atténué (décors instanciés, mesuré) |
| KI-35 | Brouillard v1 : silhouettes d'arbres au bord, tir automatique hors vision | Corrigé (2026-11-01) |
| KI-36 | FBX modulaire de cavalerie illisible par l'import Blender | Confirmé (contourné) |
| KI-37 | Toon RTS : une seule zone de couleur d'équipe | Limite assumée (masque à un canal) |
| KI-38 | Objet tenu en miroir dans la main gauche : gestes de bouclier des clips | Limite assumée (observé dans l'Atelier) |
| KI-39 | Rampe d'une case : infranchissable pour un corps de rayon > 0,5 (Héros, Cavalier) | Corrigé (2026-11-02) |
| KI-40 | Carte générée : ~2 000 cases vides en obstacles 1 × 1, coût par pas de simulation | Corrigé (2026-11-02, mesuré) |
| KI-41 | Gros rochers (décors non bloquants) : un bâtiment s'y pose | Remplacé (2026-11-03 : gisements bloquants, G25) |
| KI-42 | Héros : aucun clip d'incantation dans son GLB (Soin en garde de combat) | Limite assumée (assets) |
| KI-43 | Carte générée : pas d'ombres portées au-delà d'environ 21 cases du centre | Confirmé (observé) |
| KI-44 | Équipement : casque, épaulières, torse, bras, jambes et objets de main secondaire sans visuel en jeu (modèle du Héros fusionné ; banque de 18 items depuis le 2026-11-05, G46) | Limite assumée |
| KI-46 | Camps neutres : état non sauvegardé si le monde était reconstruit en cours de run | Hypothèse (pas de cas aujourd'hui) |
| KI-47 | Or au sol non ramassé : les tas restent toute la run (aucune disparition) | Voulu (Antoine) ; fusion des tas proches à envisager |
| KI-51 | Baril : pas encore posable dans l'éditeur de maps (`MapDef.destructibles` prêt) | À faire |
| KI-52 | Éditeur : `survivalRules` et niveaux des unités de scénario non modifiables (camps : posables, déplaçables, niveau modifiable depuis le 2026-11-04) | À faire (en partie fait) |
| KI-53 | Sol du plateau en morceaux : ~35 morceaux (169 meshes) ; repeinte de 25 à 47 ms à la pose d'un bâtiment | Limite assumée (à surveiller) |
| KI-55 | Palissade : les vagues frappent le premier mur ou la première porte rencontrés (une porte ouverte les bloque aussi), sans choisir leur cible ; un mur ennemi de carte les bloquerait sans être attaqué | Limite assumée |
| KI-56 | Palissade : éditeur sans retrait d'une porte ni édition partielle d'une ligne (supprimer la ligne entière) ; aucun mur en préparation (legacy) | À faire (si besoin) |
| KI-57 | Palissade : sur un terrain irrégulier, les traverses vont droit d'un bout à l'autre du segment (pieux au sol) ; pas d'ombre de contact au pied | Limite assumée (visuel provisoire) |
| KI-58 | Cartes dessinées : leurs `rock` deviennent des gisements bloquants ; carte générée : placement des gisements changé (mêmes graines, autres cartes) | Limite assumée (2026-11-03) |
| KI-59 | Écurie : modèle KayKit 2 × 3 ajusté à l'emprise 3 × 3, un peu petit et plat ; gisement d'or : pépites procédurales | Limite assumée (visuels provisoires) |
| KI-60 | Maison B : variante seulement pour les Maisons posées en jeu ; une Maison de scénario de l'éditeur reste A | Limite assumée |
| KI-62 | Tourbillon : rotation du modèle entier (5 tours/s), sans clip dédié (arme et jambes figées dans le clip courant) ; VFX procédural provisoire (arcs, cercle de zone) | Limite assumée (prototype) |
| KI-64 | Villageois : coupe et minage sur les clips Worker du Héros depuis le 2026-11-05 (G43) ; ramassage et dépôt toujours sur la pose de repos, sans geste accroupi dédié | Limite assumée (assets), réduite |
| KI-66 | Pathfinding : la grille A* ignore le rayon des corps ; un passage d'une case (posé à la main dans l'éditeur : gisement, arbre, baril contre un obstacle ou une falaise) paraît praticable et le Héros y oscille ; le générateur n'en produit plus (G39) | Limite assumée |

Les identifiants ne sont pas réutilisés : une entrée traitée est retirée
(c'est le cas de KI-05, KI-06, KI-07, KI-08, KI-13, KI-14, KI-17, KI-18, KI-19,
KI-25 et KI-45, butin couché depuis le 2026-11-02 ; KI-48, comportement
voulu par Antoine : une unité militaire sélectionnée reçoit les ordres ;
KI-54, arbre épuisé : abattu, souche, cases libérées depuis le 2026-11-02 ;
KI-49 et KI-50, sans objet depuis la suppression du Wall V1 le 2026-11-02 :
la Palissade V2 est au menu Construire du temps réel, à tout angle ;
KI-61, Villageois avec son propre modèle, ses outils et son sac depuis le
2026-11-03, G32 ; KI-63, piles de ressources retirées de l'inventaire RPG le
2026-11-03, G33 ; KI-65, passages d'une case des cartes générées supprimés le
2026-11-04, G39 : `camp.mts` et `camp-boucle.cjs` repassent ; KI-10,
`buyUnitFive` supprimé avec la Boutique le 2026-11-04, G40 ; KI-67, KI-68
et KI-69, résolus le 2026-11-05 par G41 : déblocage par victoire retiré,
démarrage direct sans pas d'ouverture, Camp d'archerie Niv. 2 = Archers
+2 PV, +1 dégâts ; KI-70 et KI-71, tranchés le 2026-11-05 : amélioration
placeholder de l'Église retirée, plafond Niv. 5 de la Baliste).

Retirées lors de la refonte de l'éditeur, résolues côté code :

- **KI-06** (R / « Tourner 90° » hors historique et départ à 0°) : R et
  « +90° (R) » partent de l'orientation réellement affichée et créent une
  entrée d'historique ; annuler la première rotation rend son orientation
  d'origine à un décor jamais tourné (`EDITOR.md` §9 et §11).
- **KI-19** (raccourcis actifs pendant la saisie) : une garde centrale en
  tête de l'écouteur `keydown` de `main.ts` (`isTypingInField`) ignore tous
  les raccourcis du jeu et de l'éditeur quand le focus est dans un champ ;
  seul Échap fait sortir du champ, puis garde son rôle habituel.

Retirée avec les bâtiments de scénario de l'éditeur, résolue côté code :

- **KI-07** (« Tester le scénario » sans Mine ni Caserne) : la carte peut
  désormais contenir des bâtiments gameplay de scénario (`MapDef.buildings`,
  groupe « Bâtiments » de l'éditeur) — Mine, Caserne, Forge, Maison, Tour,
  Église. `setupTestBattle` les instancie comme de vrais bâtiments au
  niveau 1 (PV, collision, sélection et fiche, fonction : la Tour tire, la
  Caserne produit…), en plus des unités de la carte et de la Baliste
  (`EDITOR.md` §15-§16). La Mine n'y produit pas d'or, le test n'ayant pas
  de run.

Retirée avec l'arène du Mode survie, résolue côté code :

- **KI-05** (l'annulation d'un déplacement au gizmo réorientait un décor) :
  l'annulation et le rétablissement restaurent maintenant exactement la
  rotation précédente, y compris son absence pour un décor jamais tourné, et
  le décor retrouve son aspect d'origine (aspect fixé par la position,
  `DESIGN_DECISIONS.md` E6). Aucun `rotationY = 0` n'est plus écrit.

Retirées avec MapV2 et l'étape C symétrique, résolues côté code :

- **KI-25** (bordure neutre asymétrique après l'étape C) : l'étape C recule
  désormais chaque camp d'une case vers son bord (`centerExpansionZOffset`,
  `run/mapExpansion.ts` ; `DESIGN_DECISIONS.md` E4). Vérifié par script sur
  l'arène jusqu'à la vague 12 : bordure neutre d'une case des quatre côtés
  de chaque zone, deux zones de même taille, territoire seulement sur des
  cases existantes, Baliste et bâtiments dans la zone joueur.
- **KI-13** (commentaires de code périmés) : les commentaires listés (talent
  « Le temps, c'est de l'argent », Cavalier léger, plafond de la Caserne,
  `PLAYER_ARROW_SPEED = 9`, `License.txt`, en-têtes de `render/board.ts` et
  `config/territory.ts`, `ASSET_GROUPS`) ont été corrigés ou ont disparu
  avec le code qu'ils décrivaient, ainsi que ceux qui décrivaient encore le
  placement manuel de la tour, `DEFAULT_MAP` comme carte de l'éditeur ou
  l'arène 20 × 36.

---

## A. Simulation et gameplay

### KI-01 — Cache des bornes d'obstacles et emprises de bâtiments modifiées en place

- **Statut** : **Résolu** (confirmé puis corrigé avec les murailles du Wall
  V1 : une muraille détruite continuait de repousser les unités ; même
  mécanisme pour les pièces de la Palissade V2). `spawnBuilding` et
  `releaseDeadBuildingFootprints` remplacent désormais le tableau
  `World.obstacles`. Entrée conservée pour l'historique ci-dessous ; à
  retirer au prochain tri.
- **Statut d'origine** : À vérifier. Hypothèse tirée de la lecture du code,
  non reproduite.
- **Risque** : après la destruction d'un bâtiment en cours de bataille :
  - son emprise pourrait continuer à bloquer physiquement les unités ;
  - la ligne de tir pourrait lire des bornes décalées pour d'autres
    obstacles ;
  - le pathfinding, lui, considérerait déjà la case comme libre.
- **Code concerné** :
  - `sim/geometry.ts` : `getObstacleBoundsList` / `getShrunkObstacleBoundsList`
    mettent les bornes en cache par **référence de tableau** (`WeakMap`) ;
  - `sim/world.ts` : `spawnBuilding` (`push`) et
    `releaseDeadBuildingFootprints` (`splice`) modifient ce même tableau
    `World.obstacles` en place ;
  - `sim/systems/movement.ts`, `resolveObstacleCollisions`, parcourt la liste
    en cache ; `findBlockingObstacle` associe `obstacles[i]` à
    `boundsList[i]` ;
  - `sim/pathfinding.ts`, `buildPathGrid`, recalcule à chaque appel, sans
    cache.
- **Impact actuel** : ne concernerait que les batailles où un bâtiment est
  détruit, et seulement jusqu'à la bataille suivante (`setMap` recrée le
  tableau).
- **Vérification** : script Node jetable utilisant un vrai `World` :
  1. spawner un bâtiment avec emprise, puis faire un `step` ;
  2. tuer le bâtiment, puis faire un `step` ;
  3. placer une unité dans l'ancienne emprise, puis faire un `step` ;
  4. observer si l'unité est repoussée, et tester `findBlockingObstacle` à
     travers l'ancienne emprise.
- **Piste** : invalider le cache quand la liste change (nouveau tableau au
  lieu d'une mutation en place, ou clé de version).

### KI-02 — Placement en jeu sans test direct des cellules

- **Statut** : Dette, atténuée par le territoire.
- **Risque** : `isValidPlacementTile` (`main.ts`) vérifie le placement des
  unités et des bâtiments. Il teste les obstacles et le
  **territoire** (la case doit appartenir au joueur), jamais `MapDef.cells`
  directement.
- **Atténuation** : un trou n'a normalement pas de territoire, donc il est
  refusé :
  - le repli historique (`deriveLegacyTerritory`) ne couvre que les cases
    existantes ;
  - dans l'éditeur, supprimer une case retire aussi son entrée de territoire
    explicite.
- **Reste possible** : un `territory` explicite écrit à la main (ou issu d'un
  autre outil) peut couvrir une case absente ; le chargement ne le vérifie
  pas. On pourrait alors poser un élément au-dessus d'un vide.
- **Impact actuel** : aucun constaté. L'arène du Mode survie (MapV2, 21 × 36)
  a 64 trous et un territoire dessiné, mais aucune case de territoire ne
  tombe sur un trou, au départ comme après chaque étape A/B/C (vérifié par
  script jusqu'à la vague 12 ; l'agrandissement transforme cases et
  territoire ensemble). La simulation bloque déjà les trous
  (`computeVoidObstacles`, `sim/world.ts`).
- **Vérification** : par script, comparer le territoire et les cases de la
  carte courante après chaque étape d'agrandissement.
- **Piste** : faire tenir compte des cellules à `isValidPlacementTile`
  (`buildCellIndex`, `config/mapDef.ts`), ou filtrer le territoire sur les
  cellules au chargement.

### KI-03 — Bâtiment potentiellement inatteignable

- **Statut** : À vérifier.
- **Risque** : un bâtiment entouré d'autres bâtiments ou d'obstacles pourrait
  n'avoir aucune case d'approche. Des ennemis verrouillés sur lui pourraient
  alors stagner.
- **Code concerné** :
  - `sim/systems/targeting.ts` : une cible verrouillée est gardée tant
    qu'elle reste valide ;
  - `sim/pathfinding.ts` : `findPath` se rabat sur la « case libre la plus
    proche ».
- **Impact actuel** : inconnu.
- **Vérification** : en jeu, entourer une Mine de bâtiments, puis observer si
  des ennemis restent bloqués sans jamais l'atteindre ni changer de cible.
- **Piste** : à définir seulement si le blocage est reproduit.

### KI-04 — Contrat implicite « ordre de spawn = ordre de l'armée »

- **Statut** : Dette.
- **Risque** : `applyBattleOutcome` (`run/runState.ts`) associe chaque entité
  du joueur à son `OwnedUnit` par **index**. Un changement de l'ordre de spawn
  dans `onValidatePlacement` (`main.ts`) décalerait silencieusement les PV des
  survivants.
- **Impact actuel** : aucun. L'ordre est respecté, et les bâtiments sont
  exclus de la correspondance de l'armée.
- **Même contrat pour les bâtiments** : `applyBattleOutcome` reporte leurs
  PV, et `main.ts` (`ownedBuildingIndexByEntityId`) relie chaque Mine ou
  Caserne de la bataille à son niveau propre, tous deux par l'ordre de spawn
  de `currentRun.buildings`.
- **Vérification** : relire `onValidatePlacement` et `applyBattleOutcome` à
  chaque modification de l'un des deux.
- **Piste** : un identifiant explicite reliant `OwnedUnit` et entité.

### KI-27 — L'agrandissement de run ne déplace ni le relief ni les surfaces

- **Statut** : **Sans objet depuis le 2026-11-04** : l'agrandissement a été
  retiré du code (`run/mapExpansion.ts` supprimé, `DESIGN_DECISIONS.md`
  G40). L'entrée reste pour mémoire, au cas où un agrandissement serait
  réintroduit depuis l'historique Git. Avant : Confirmé, mesuré sur
  l'arène candidate (`config/maps/islandArena.ts`) avec les fonctions du
  jeu (`applyMapExpansionStep`). Sans effet sur l'arène officielle, plate
  et sans surface peinte.
- **Cause** : `expandedMap` transforme `cells`, `territory`, décors et
  unités, mais recopie `elevationCells`, `reliefLogic` et `surfaceCells`
  sans les déplacer (`EDITOR.md`, « Surfaces et agrandissement de run »).
  Le relief et les chemins restent sur leurs anciennes coordonnées pendant
  que des rangées et des colonnes de cases sont décalées ou dupliquées.
- **Mesure** (arène candidate, départ : 14 arêtes de falaise, une seule zone
  accessible) :
  - étape A (vague 1) : rien ne bouge, aucun dégât ;
  - étape B (vague 2) : 55 arêtes de falaise, 13 zones dont 12 poches
    isolées, 4 cases de chemin hors carte, 2 décors au-dessus du vide ;
  - étape C (vague 3) : 63 arêtes de falaise, 6 poches isolées.
- **Impact** : falaises inattendues, poches de terrain inaccessibles,
  chemins décalés par rapport aux pentes, silhouette de plus en plus
  rectangulaire. Bloque l'adoption d'une arène avec relief ou surfaces
  peintes en Mode survie.
- **Piste** : faire suivre au relief et aux surfaces les déplacements de
  cases, ou repenser l'agrandissement pour une arène ronde (décision de
  design, à trancher avec la passe des zones de spawn).

### KI-30 — Cadence d'attaque allongée d'un pas par l'arrondi flottant

- **Statut** : Confirmé, mesuré le 2026-11-01 (duel contre une cible
  passive, pas de 1/30 s).
- **Cause** : `combatSystem` (`sim/systems/combat.ts`) retire `dt` de
  `attackTimer` à chaque pas et n'attaque que lorsque `attackTimer > 0` est
  faux. Selon le cooldown, la soustraction répétée laisse un reste positif
  infime et l'attaque part un pas plus tard.
- **Mesure** : Fantassin 1 s → 31 pas (1,033 s) ; Vengeur 0,6 s → 19 pas
  (0,633 s) ; Sentinelle 1,5 s → 45 pas, Archer 2 s → 60 pas et Piquier
  1,2 s → 36 pas tombent juste.
- **Impact** : cadences réelles légèrement plus lentes que les valeurs
  affichées, de façon déterministe. Les gestes du Vengeur (0,58 s) tiennent
  dans sa période réelle.
- **Piste** : comparer à une tolérance (`attackTimer > 1e-9`). Cela changerait
  le rythme de combat existant (Fantassin), donc à décider avec Antoine.

## B. Éditeur de maps

### KI-20 — Validation partielle des positions dans l'éditeur

- **Statut** : Dette. Confirmé par lecture du code.
- **Emprises de plusieurs cases réduites à leur case centrale** :
  - `canPlaceUnitAt` (`editor/editorState.ts`) compare uniquement la case
    qui contient le **centre** d'un obstacle bloquant
    (`floor(obstacleCenter(o))`) à la case testée ;
  - `canRemoveCell` refuse désormais la case sous le centre de **tout**
    décor (props traversables compris), mais seulement cette case ;
  - la pose et le déplacement d'un décor (`canPlaceObstacleAt`) n'exigent
    qu'une case existante sous son **centre** ;
  - conséquence : on peut retirer une case de terrain sous le bord d'un
    rocher ou d'un bâtiment de plusieurs cases, y poser ou y déplacer une
    unité, ou poser un gros décor qui déborde sur un trou ou hors du
    plateau.
- **Résolu** : l'ancienne asymétrie entre pose et déplacement d'unités a
  disparu. Les déplacements utilisent désormais `canPlaceUnitAt` (voir
  `EDITOR.md` §8), et deux unités ne peuvent plus finir sur la même case.
- **Impact actuel** : une carte peut contenir des unités posées sur le bord
  d'un gros obstacle, sans avertissement.
- **Vérification** : poser ou déplacer une unité sur une case de bord d'un
  rocher 2×2 ; retirer une case au bord d'un bâtiment 2×2.
- **Piste** : tester toute l'emprise d'un obstacle (`obstacleBounds`). Pour
  les décors, l'arène actuelle compte des rochers de bordure qui débordent
  volontairement du plateau : une règle d'emprise complète devrait en tenir
  compte.
- **Hors de cette entrée** : la Baliste teste toute son emprise
  (`obstacleBounds`), et le jeu réel aussi (`isValidPlacementTile`) ; la
  divergence ne concerne que les règles de l'éditeur citées plus haut.
- Voir aussi `EDITOR.md` §8 et §18.

### KI-24 — Espace réactive le bouton qui a gardé le focus

- **Mise à jour** (2026-11-01) : en jeu, Espace est devenu une touche de jeu
  (Héros ↔ Baliste). Constaté en test : après « Lancer quand même »,
  Espace réactivait ce bouton. Corrigé pour Espace en jeu (le bouton perd
  le focus avant la bascule) ; l'éditeur n'a pas changé.

- **Statut** : Confirmé dans l'éditeur (reproduit dans le navigateur) ; à
  vérifier sur les boutons du jeu.
- **Mécanisme** : un bouton HTML cliqué à la souris garde le focus. Espace
  réinitialise la caméra (écouteur `keydown` de `main.ts`), mais le
  navigateur active aussi le bouton qui a le focus, comme un second clic.
- **Cas connus** :
  - éditeur, reproduit : cliquer une catégorie du catalogue puis appuyer sur
    Espace la referme aussitôt. Les autres boutons de la colonne de gauche
    (outils, valeurs du territoire) sont dans la même situation ;
  - pas concernés : les chevrons de repli des panneaux (ils rendent le focus
    après un clic souris) et les boutons du panneau de propriétés quand leur
    action reconstruit le panneau (par exemple « +90° (R) ») ;
  - jeu : boutique, Forge ou autres boutons cliqués juste avant Espace,
    effet non vérifié.
- **Impact actuel** : action répétée involontaire ; gêne surtout dans
  l'éditeur, où Espace sert souvent.
- **Vérification** : dans l'éditeur, ouvrir la catégorie « Fleurs » à la
  souris, puis appuyer sur Espace.
- **Piste** : rendre le focus après un clic souris sur ces boutons, ou
  empêcher l'action par défaut d'Espace quand elle sert à la caméra.

### KI-29 — Lave peignable mais franchissable (eau corrigée)

- **Statut** : limite assumée pour la lave ; **l'eau est infranchissable
  depuis le 2026-11-01** (`DESIGN_DECISIONS.md` E9, tests ciblés de la
  passe : contournement, destination refusée, pose refusée, tirs libres).
- **Constat** : la lave est animée mais ne bloque rien : une unité la
  traverse, et on peut y poser une unité, un bâtiment, un mur ou la
  Baliste.
- **Impact** : une coulée se lit comme un obstacle qui n'en est pas un.
  L'eau comme la lave suivent le dessus de la case : sur une pente, elles
  sont en pente.
- **Suite** : `ROADMAP.md` §7 (lave) ; décision d'Antoine (bloque ou
  blesse).

### KI-31 — Ennemis officiels rouges, camp adverse Neutre brun

- **Statut** : limite assumée (2026-11-01, `DESIGN_DECISIONS.md` G2).
- **Constat** : le côté adverse a la palette Neutre (anneaux, barres de vie,
  territoire, unités Toon et neutres en brun / gris), mais les modèles
  officiels humains (Fantassin, Archer, Mage, Sentinelle) sont des GLB
  pré-teintés bleu / rouge : un ennemi officiel reste rouge.
- **Suite** : teinte par palette pour ces modèles, ou vagues composées
  d'unités neutres (décision d'Antoine).

### KI-32 — Héros sans son GLB local

- **Statut** : limite assumée (2026-11-01, `DESIGN_DECISIONS.md` G4).
- **Constat** : `human_hero.glb` dérive d'un pack commercial et reste hors
  Git. Sur un clone neuf, le Héros prend le modèle de la Sentinelle, sans
  hache, pioche, marteau visible ni gestes de travail. La simulation est
  identique.
- **Suite** : reconstruire le GLB (`tools/toon-units/`), ou un modèle
  définitif du Héros.

### KI-34 — Grande carte : un maillage par décor, des milliers d'appels de dessin

- **Statut** : confirmé (mesuré le 2026-11-01, Edge, carte procédurale
  96 × 96, graine 12345).
- **Constat** : chaque arbre, rocher ou petit décor est un clone de modèle
  (2 907 maillages, 239 k triangles ; plateau construit en ~650 ms contre
  62 ms pour l'arène). Vue de jeu (camp) : 969 appels de dessin, 6,4 ms par
  frame ; carte entière : 3 578 appels, 13,2 ms. La passe de brouillard et
  sa mise à jour (0,05 ms) sont négligeables.
- **Suite** : décors instanciés ou fusionnés par modèle et par morceau de
  16 cases ; plateau de jeu en morceaux (`ChunkedTerrainView` de l'éditeur) ;
  puis chargement par zones si la carte grandit au-delà de 96 cases.
- **Mise à jour** (2026-11-01) : décors **instanciés** par (géométrie,
  matériau, morceau de 32 cases) sur la carte générée
  (`render/decorInstancing.ts`). Mesuré (même graine, même méthode) :
  maillages 2 907 → 432 ; vue de jeu 969 → ~500 appels, 6,4 → 4,1 ms ; carte
  entière 3 578 → 715 appels, 13,2 → 4,1 ms ; construction du plateau
  ~650 → ~790 ms. Reste : plateau d'un seul tenant, unités et ombres ; le
  morceau de 16 cases donnait 1 195 appels (moins bon que 32 ici).

### KI-35 — Brouillard v1 : silhouettes d'arbres au bord, tir automatique hors vision

- **Statut** : limite assumée (2026-11-01, `DESIGN_DECISIONS.md` G6).
- **Constat** : la passe noircit le décor jamais exploré mais garde sa
  forme : en vue très large, les arbres du bord du disque dessinent des
  silhouettes noires sur le ciel. La simulation ignore le brouillard : la
  Baliste en tir automatique peut viser un ennemi hors vision.
- **Suite** : masquer les décors jamais explorés (ou un voile au-dessus) ;
  décider si le tir automatique doit respecter la vision (règle de
  simulation, à trancher).
- **Corrigé** (2026-11-01) : les décors d'une case jamais explorée ne sont
  plus dessinés (instances masquées jusqu'à l'exploration) ; la Baliste en
  AUTO n'acquiert que des cibles vues (vision gameplay `sim/vision.ts`,
  G10). Restent : les unités acquièrent encore leurs cibles à leur portée
  d'aggro sans regarder la vision ; vision gameplay au point près, brouillard
  à la case près (écart d'une demi-case possible au bord).

### KI-36 — FBX modulaire de cavalerie illisible par l'import Blender

- **Statut** : confirmé, contourné (2026-11-01).
- **Constat** : `WK_Cavalry_customizable.FBX` (et l'équivalent barbare) fait
  échouer l'import FBX de Blender 5.2 (`KeyError: Bip001Model`). Les
  cavaleries utilisent les FBX « single mesh » `*_Light_B` : pièces fixes
  (lance, petit bouclier), pas d'assemblage pièce par pièce.
- **Suite** : réparer l'import (conversion intermédiaire, ou correctif du
  lien armature-maillage). En attendant, l'Atelier de personnage
  (CURRENT_STATE.md §16 bis) montre le Cavalier léger et le Razzieur en
  presets fixes, sans édition des pièces ni des mains.

### KI-37 — Toon RTS : une seule zone de couleur d'équipe

- **Statut** : limite assumée (2026-11-01).
- **Constat** : `<textures>_team_mask.png` n'a qu'un canal : les pixels qui
  varient entre les atlas de couleur du pack. Le shader fait `rgb *=
  mix(1, teinte, masque × intensité)`, donc une teinte pour toute la zone.
  Dans l'Atelier, la « seconde couleur » et le « mélange » donnent une
  teinte uniforme intermédiaire, pas deux zones.
- **Suite** (architecture proposée, rien n'est construit) :
  - un masque à plusieurs canaux (R, G, B = zones : tabard, bordures,
    métal…), dérivé des atlas de couleur du pack quand leurs différences
    le permettent, sinon peint à la main ;
  - N teintes en uniformes ;
  - l'export de l'Atelier écrirait une couleur par zone.

### KI-38 — Objet tenu en miroir dans la main gauche : gestes de bouclier des clips

- **Statut** : limite assumée (observé dans l'Atelier, 2026-11-01).
- **Constat** : une arme de main droite tenue en miroir dans la main gauche
  (`offhand_weapon`, ou `pieces.hands.left` dans l'Atelier) suit le bras de
  bouclier des clips `Infantry` : au repos et en attaque, elle pointe vers
  le haut ou reste passive. C'est le même mécanisme que le Vengeur du jeu.
  Aucun clip du pack n'est prévu pour deux armes.
- **Suite** : corriger la pose avec la rotation de main de l'Atelier (par
  configuration), choisir un dossier de clips adapté (`Worker` pour
  `attackDouble`), ou animer une variante à deux armes.

### KI-39 — Rampe d'une case : infranchissable pour un corps de rayon > 0,5

- **Statut** : confirmé (mesuré en simulation, 2026-11-02), antérieur aux
  arbres bloquants.
- **Constat** : la rampe d'une colline fait une case de large, entre deux
  falaises. Le Fantassin (rayon 0,5) y passe ; le Héros (0,6) et le
  Cavalier (0,7) restent bloqués au pied, alors que A* (grille par case)
  trouve la route. Constaté en envoyant un Héros au sommet d'une colline de
  la carte générée (graine 7).
- **Corrigé** (2026-11-02) : rampes de 3 cases dans le générateur, abords
  dégagés ; une colline sans place pour sa rampe n'est pas créée. Mesuré :
  rayons 0,5 / 0,6 / 0,7 et un groupe de 4 montent et descendent les 10
  collines de 3 graines (240 essais). Les rampes d'une case restent
  possibles dans l'éditeur (même limite pour les gros corps).

### KI-40 — Carte générée : ~2 000 cases vides en obstacles 1 × 1

- **Statut** : dette, mesurée en simulation sans navigateur (2026-11-02).
- **Constat** : hors du disque de la carte générée, chaque case absente
  devient un obstacle synthétique 1 × 1 (`computeVoidObstacles`, environ
  2 050), que chaque unité parcourt à chaque sous-pas (collision, ligne
  droite, contournement). Avec 60 ennemis en marche : environ 21 ms par pas
  sans arbres bloquants, 25 à 28 ms avec (les arbres ajoutent environ 20 à
  30 %).
- **Corrigé** (2026-11-02) : cases vides fusionnées par rangée
  (`rowSpanObstacles`, règle commune du vide, de l'eau et des arbres) :
  environ 2 555 obstacles de simulation ramenés à environ 662 ; pas à 60
  ennemis : environ 28 ms → 8,7 ms. Grille A*, chemins et trajectoires des
  vagues identiques à la représentation 1 × 1 (mesuré, 3 et 6 graines).

### KI-41 — Gros rochers : un bâtiment s'y pose

- **Statut** : **remplacé** le 2026-11-03 : les gros gisements (pierre et
  or) bloquent déplacement et construction, comme les arbres
  (`DESIGN_DECISIONS.md` G25). Historique ci-dessous.
- **Statut d'origine** : limite assumée (mesurée en jeu, 2026-11-02).
- **Constat** : les 26 gros rochers de la carte générée sont des décors non
  bloquants (règle E8 du 2026-10-28) : ni la simulation ni la pose ne les
  voient. Depuis que la construction n'est plus limitée au territoire, une
  Maison se pose sur un gros rocher (test en jeu, graine 12345).
- **Suite** : à trancher par Antoine : rochers bloquants pour la pose
  (comme les arbres), ou acceptés tels quels.

### KI-42 — Héros sans clip d'incantation

- **Statut** : limite assumée (assets).
- **Constat** : `human_hero.glb` n'a pas de clip de sort ; le Soin joue la
  garde de combat (`combatIdle`, clip cloné pour une action propre) sur les
  2 s, avec un cercle runique au sol (`render/spellCastVfx.ts`).
- **Suite** : un clip d'incantation dans le pipeline Toon RTS
  (`tools/toon-units`), si un pack en fournit un.

### KI-44 — Casque et épaulières sans visuel en jeu

- **Statut** : limite assumée (2026-11-02).
- **Constat** : le GLB du Héros fusionne ses pièces de corps ; un item de
  corps ne peut pas remplacer une pièce en jeu. Ses stats s'appliquent ;
  l'aperçu de l'Éditeur d'items le montre (composition de l'Atelier).
- **Suite** : composer le Héros en jeu à partir du catalogue (comme
  l'Atelier), ou exporter les pièces de corps séparées par le pipeline.

### KI-47 — Or au sol qui s'accumule

- **Statut** : limite assumée (2026-11-02).
- **Constat** : chaque ennemi abattu laisse un tas d'or ; un tas non
  ramassé reste jusqu'à la fin de la run (`World.resourcePiles` grandit
  d'une entrée par mort, parcourue chaque frame par le rendu). Depuis le
  2026-11-05 (G42) le Héros les ramasse au contact en passant, ce qui
  réduit l'accumulation sans la supprimer. Sans effet mesurable aux
  volumes actuels ; à revoir (fusion des tas proches, disparition, aimant)
  si les vagues grossissent.

### KI-51 — Baril dans l'éditeur

- **Statut** : à faire (2026-11-02).
- **Constat** : les barils viennent de la carte générée
  (`MapDef.destructibles`) ; l'éditeur ne les propose pas encore.

### KI-52 — Cartes de survie dans l'éditeur

- **Statut** : à faire, **en grande partie fait** : 2026-11-03, camps,
  petits tas, barils, `survivalRules` et `generator` lus, affichés,
  supprimables et réenregistrés, tas et barils posables ; 2026-11-04 (G34),
  camps **posés, déplacés, supprimés d'un bloc, niveau modifiable**, Départ
  Survie explicite, validation. Restent : `survivalRules` et niveaux des
  **unités** de scénario non modifiables dans l'interface.
- **Constat d'origine** : le format porte les niveaux (`MapUnitPlacement.level`,
  `MapCampDef.level`, postes) et les règles (`MapDef.survivalRules`),
  mais l'éditeur ne lit ni n'écrit les camps ni `survivalRules`, et ne
  permet pas de modifier un niveau (il conserve seulement celui des unités
  au chargement et à la sauvegarde). Une carte de survie dessinée passe
  aujourd'hui par le JSON.

### KI-66 — Pathfinding sans rayon : passages d'une case

- **Statut** : limite assumée (2026-11-04).
- **Constat** : la grille A* (`sim/pathfinding.ts`) marque une case bloquée
  ou libre, sans tenir compte du rayon de l'unité (Héros 0,6, Cavalier
  0,7). Un passage d'une case entre deux obstacles (ou un obstacle et une
  falaise) est donc proposé comme chemin, mais le corps n'y passe pas : il
  oscille sur place. Le générateur n'en produit plus (G39, vérifié sur 12
  graines : 0 passage d'une case contre un gisement, chaque gisement et
  chaque camp atteint en vrai déplacement) ; une carte dessinée à la main
  peut encore en contenir.
- **Piste** : grille d'accessibilité par rayon (ou dilatation des
  obstacles) dans le pathfinding, à discuter (coût, comportements de
  mouvement existants) ; ou une alerte de l'éditeur.

### KI-53 — Sol du plateau en morceaux

- **Statut** : limite assumée (2026-11-02), à surveiller.
- **Constat** : pour repeindre la terre battue à chaud, le sol du plateau
  est découpé en morceaux de 16 × 16 (comme l'éditeur) : environ 35
  morceaux et 169 meshes sur la carte générée, au lieu d'un sol d'un seul
  tenant. Une pose de bâtiment reconstruit 2 à 4 morceaux, 25 à 47 ms
  mesurés (Edge, machine de test). Ni la fréquence d'images en partie ni
  l'à-coup ressenti n'ont été mesurés sur la machine d'Antoine.

### KI-55 — Vagues et portes de palissade

- **Statut** : limite assumée (2026-11-02).
- **Constat** : la marche des vagues vers le camp ignore les emprises
  d'entités (`terrainObstacles`) : elles foncent tout droit, butent sur la
  première palissade ou la première porte et la frappent jusqu'à la
  brèche. Depuis le 2026-11-02, une porte **ouverte** du joueur les bloque
  comme le mur (elle ne laisse passer que ses alliés) ; elles ne choisissent
  pas pour autant la porte plutôt qu'un segment, ni un détour. Un mur du
  camp ennemi posé sur une carte (`MapDef.walls`, `team: 'enemy'`) les
  arrêterait sans être attaqué (aucune carte n'en a).

### KI-56 — Palissade : édition fine

- **Statut** : à faire si besoin (2026-11-02).
- **Constat** : dans l'éditeur, une porte ne se retire pas seule et une
  ligne ne se modifie pas en partie (déplacer A ou B) : il faut la
  supprimer et la retracer.

### KI-58 — Gisements bloquants sur les cartes existantes

- **Statut** : limite assumée (2026-11-03).
- **Constat** : tout obstacle `rock` d'une carte dessinée devient un
  gisement de pierre bloquant (250 pierre depuis G43) ; le générateur place
  autrement ses gisements (bloc 4 × 4 libre, 6 d'or), donc une graine
  donne une autre carte qu'avant.
- **À retenir** : **les anciennes graines ne garantissent plus exactement
  la même géométrie qu'avant la refonte des ressources** (2026-11-03). Ce
  n'est pas un bug à corriger maintenant ; quand le générateur sera
  stabilisé, son algorithme pourra être versionné (par exemple
  `generator.version`) si des cartes doivent rester reproductibles.

### KI-59 — Visuels provisoires (Écurie, gisement d'or)

- **Statut** : limite assumée.
- **Constat** : l'Écurie (modèle 2 × 3) est ajustée à l'emprise 3 × 3 des
  producteurs ; le gisement d'or est le Rocher E avec des pépites
  procédurales (aucun asset dédié).

### KI-60 — Maison A/B hors de la Survie

- **Statut** : limite assumée.
- **Constat** : l'alternance s'applique aux Maisons posées pendant une run ;
  les Maisons de scénario de l'éditeur gardent le modèle A (« Maison B »
  reste disponible comme décor).

### KI-64 — Villageois : gestes empruntés au Piquier

- **Statut** : limite assumée (assets), réduite le 2026-11-03 (G33) puis
  le 2026-11-05 (G43).
- **Constat** : le set Spearman du Villageois n'a ni coup de hache, ni coup
  de pioche, ni geste accroupi. Depuis le 2026-11-05, la coupe et le
  minage jouent les clips Worker du GLB du Héros (`workingA` coup vertical,
  `workingB` coup penché, prêtés au rig : mêmes os ; `ClipRole.from`) ;
  plus d'estoc de lance. Reste : le ramassage d'un tas et le dépôt jouent
  la pose de repos. Un futur set d'ouvrier dédié (ou `workingC` du Héros,
  1,33 s, non retenu) remplacerait les rôles `gather` / `deposit` du kit
  `villageois`. Une source sans aucun côté libre n'est pas travaillée :
  abandon immédiat (autonomie : source évitée ; ordre manuel : « Aucun
  accès à cette ressource »).

### KI-57 — Palissade : rendu sur relief

- **Statut** : limite assumée (2026-11-02), visuel provisoire.
- **Constat** : chaque pieu est posé à la hauteur du sol sous lui, mais les
  deux traverses vont en ligne droite d'un bout du segment à l'autre : sur
  une pente irrégulière, elles peuvent flotter ou entrer un peu dans le sol.

### KI-46 — État des camps non sauvegardé

- **Statut** : hypothèse (2026-11-02), aucun cas aujourd'hui.
- **Constat** : camps nettoyés et coffres ouverts vivent dans `World` ; la
  Survie en temps réel ne reconstruit pas le monde pendant une run, donc
  aucun retour des gardes. Si un jour le monde est reconstruit en cours de
  run (sauvegarde, manches), il faudra garder cet état dans la run (comme
  `resourcePileAmounts`).

### KI-43 — Ombres limitées au centre de la carte générée

- **Statut** : confirmé (observé en jeu, 2026-11-02, graine 12345).
- **Constat** : la caméra d'ombre du soleil est fixe, centrée sur l'origine,
  ±20,8 cases (`render/renderer.ts` : 0,8 × max(BOARD_W, BOARD_H), réglée
  pour l'ancienne arène). Sur le disque de 96 cases, un bosquet à 15 cases
  porte ses ombres, un bosquet à 40 cases n'en porte aucune.
- **Suite** : caméra d'ombre qui suit le point visé par la caméra de jeu
  (même taille, texels stables), ou cascades ; à traiter avec l'éclairage
  (cycle jour / nuit, ROADMAP).

### KI-33 — Chantier semi-transparent sans écriture de profondeur

- **Statut** : à vérifier (lecture du code, non observé en jeu).
- **Constat** : un chantier est dessiné transparent (opacité 0,3 à 0,8
  selon l'avancement), sans écriture de profondeur
  (`BuildingView.setConstruction`). Des parties du modèle, ou des
  volutes de fumée, peuvent se dessiner dans un ordre approximatif.
- **Suite** : contrôler en jeu ; sinon, un effet d'échafaudage opaque.

## C. Incohérences entre documentation et code

### KI-09 — Descriptions de talents aux valeurs codées en dur

- **Statut** : Dette.
- **Risque** : les textes de `data/talents.ts` écrivent leurs valeurs en dur :
  - Tir rapide : 60 % et 100 % ;
  - Réflexes de vétéran : 30 %.

  (Aux petits oignons, Recyclage et Blizzard ont été retirés le 2026-11-04,
  G40.) Ces textes ne suivent pas les constantes de `config/constants.ts`.
- **Impact actuel** : les textes sont exacts pour les valeurs **de base**.
- **Vérification** : comparer chaque description aux constantes
  correspondantes.
- **Piste** : construire les descriptions à partir des constantes.

### KI-11 — Nom trompeur `MAGE_UNLOCK_WAVE`

- **Statut** : Dette.
- **Écart** : `MAGE_UNLOCK_WAVE` (`config/constants.ts`) ne règle que
  l'**apparition des Mages ennemis**. Le Mage du joueur vient du
  Sanctuaire, sans déblocage (2026-11-05).
- **Impact actuel** : risque de confusion à la lecture.
- **Piste** : renommer la constante pour refléter son rôle réel.

### KI-12 — Sens implicite du « record de vague »

- **Statut** : Dette.
- **Écart** : `registerWaveReached` (`run/metaProgress.ts`) reçoit
  `currentRun.waveNumber` **après** l'incrément dû à une victoire. Après avoir
  gagné la vague 5, le record vaut donc 6, une vague pas encore jouée.
  L'affichage parle de « meilleure vague atteinte ».
- **Impact actuel** : affichage seulement, cohérent avec le mot « atteinte ».
  Le sens n'est documenté nulle part ailleurs.
- **Piste** : fixer et documenter un sens explicite.

## D. Outillage et dépôt

### KI-15 — Aucune suite de tests automatisée

- **Statut** : Corrigé en partie (2026-11-04, G40).
- **État** : `arrow-tactics/tests/` contient les scripts repris des passes
  précédentes et ceux de la passe de modernisation : `npm run test:sim`
  (Node, sans navigateur, ~80 s), `npm run test:game` (Playwright + Edge,
  Vite dédié sur le port 5177, plusieurs minutes), `npm test` (les deux).
  Voir `ARCHITECTURE.md` §17 et `tests/README.md`.
- **Reste** : pas de couverture systématique ; aucun test unitaire fin ;
  les tests en jeu dépendent d'Edge installé et de temporisations.

### KI-16 — Assets inutilisés copiés dans le build

- **Statut** : Confirmé (mesuré).
- **Fichiers** :
  - `public/models/ballista/fbx/T_Ballista_C.tga`, `T_Ballista_N.tga`,
    `T_Ballista_ORM.tga` : environ 48 Mo chacun, le code charge les
    versions `.png` ;
  - `public/models/archer/archer_blue_attack.glb` et
    `archer_red_attack.glb` : environ 13 Mo au total, l'attaque de l'Archer
    est procédurale ;
  - `public/models/ballista/ballista_level1.obj` et sa texture, remplacés par
    le modèle FBX ;
  - `public/models/ballista/fbx/Ballista_Idle_Anim.fbx` et
    `Ballista_Arrow.fbx` : jamais chargés ;
  - `public/textures/vfx/fire_01.png` et `magic_01.png` : jamais référencés.
- **Détail** : voir `ASSETS.md` §4.
- **Impact actuel** : Vite copie tout `public/` dans `dist/`. Le build mesuré
  pèse environ 288 Mo, dont environ 150 Mo jamais chargés. Le dépôt Git est
  alourdi d'autant.
- **Vérification** : taille de `dist/` après `npm run build`, et absence de
  référence à ces fichiers dans `src/`.
- **Piste** : retirer ces fichiers de `public/`, ou les archiver ailleurs.

### KI-21 — Justificatifs de provenance et de droits des assets non archivés

- **Statut** : Dette (documentaire).
- **Écart** :
  - la provenance et les droits d'usage sont connus pour plusieurs familles
    d'assets (voir `ASSETS.md` §8) : modèles Meshy avec droits commerciaux
    confirmés par Antoine, packs Kenney et KayKit, autres assets dont
    l'utilisation dans le jeu est confirmée ;
  - aucun justificatif n'est archivé dans le dépôt : pas de fichier `LICENSE`,
    `License.txt` ou `CREDITS` à côté des assets, aucune trace des pages de
    licence ni de l'historique Meshy.
- **Impact actuel** : aucun sur le jeu. Ces preuves seront nécessaires avant
  une commercialisation publique.
- **Piste** : archiver les licences des packs et les preuves de provenance
  (historique Meshy, pages de licence), et compléter les provenances encore
  non documentées dans `ASSETS.md` §8.

### KI-22 — Assets suivis directement par Git, sans Git LFS

- **Statut** : Dette.
- **Écart** :
  - aucun suivi Git LFS n'est configuré et aucun `.gitattributes`
    correspondant n'existe ;
  - les fichiers d'assets de `public/` sont suivis directement par Git :
    374 fichiers d'assets au moment de l'audit.
- **Ordres de grandeur** (instantané de l'audit) : environ 287 Mo pour le
  dossier `public/`, environ 169 Mo pour le stockage compressé de Git (pack).
  Ce sont deux mesures distinctes.
- **Impact actuel** : le dépôt grossit à chaque ajout ou remplacement d'un
  asset lourd, et l'historique conserve les anciennes versions.
- **Piste** : décider d'un mode de stockage des assets lourds (Git LFS ou
  autre) avant d'en ajouter beaucoup d'autres. Indépendant de KI-16.

## E. Rendu

### KI-23 — Raycast sur un modèle animé avant son premier rendu

- **Statut** : Dette (précaution technique). Le piège a été reproduit
  pendant le développement de l'aperçu de déplacement, puis évité. Aucun
  effet n'est visible aujourd'hui en jeu.
- **Mécanisme** :
  - un modèle riggé (`SkinnedMesh`) calcule sa sphère englobante au premier
    raycast, avec les matrices de ses os, puis la garde en cache ;
  - avant le premier rendu, ces matrices ne sont pas encore à jour ;
  - un raycast lancé à ce moment calcule une sphère dégénérée, et le
    modèle peut ensuite rester **impossible à sélectionner** (les rayons le
    manquent).
- **Cas rencontré** : les modèles de la préparation sont reconstruits à
  chaque changement de sélection (`refreshPlayerPreview`). Un calcul d'aperçu
  lancé juste après cette reconstruction rendait l'unité impossible à
  cliquer : Maj + clic ne la retirait plus de la sélection.
- **Protection actuelle** : l'aperçu de déplacement est recalculé une fois
  par image, **après** `renderer.render()` (indicateur `movePreviewDirty`,
  `main.ts`). Les clics, eux, ne visent que des modèles déjà affichés.
- **Risque futur** : tout nouveau code qui lancerait un rayon sur un modèle
  riggé tout juste créé (pendant un rafraîchissement, dans le même
  gestionnaire d'événement) reproduirait le problème.
- **Piste** : différer le raycast après le rendu, ou forcer la mise à jour
  des matrices et du squelette (`updateMatrixWorld`, `skeleton.update`)
  avant le premier raycast.
- Voir aussi `ARCHITECTURE.md` §16.

### KI-26 — Arbres et props pivotent autour de l'origine de leur modèle

- **Statut** : Dette. Établi par lecture du code ; l'ampleur visible dépend
  du pivot de chaque modèle et n'a pas été mesurée.
- **Mécanisme** : `cloneScaledTo` (`render/assetLibrary.ts`) recentre un
  modèle en décalant sa **position** ; `createTreeObstacle` et
  `createPropObstacle` appliquent ensuite la rotation à ce même objet. Il
  tourne donc autour de l'origine de son fichier, pas du centre de son
  emprise : un pivot excentré déplace le décor quand on le tourne.
  - Dans l'éditeur, `refreshEditorObjects` réécrit ensuite la position d'un
    décor déjà construit au centre exact, ce qui annule ce recentrage : le
    même décor peut s'afficher légèrement différemment dans l'éditeur et en
    jeu.
- **Corrigé pour les bâtiments** : `createBuildingObstacle`
  (`render/buildings.ts`) place le modèle recentré dans un groupe posé au
  centre exact de l'emprise ; c'est ce groupe qui tourne (`ASSETS.md`).
- **Impact actuel** : aucun signalé ; les arbres et props sont petits et la
  plupart des modèles ont un pivot proche de leur centre.
- **Piste** : le même emballage que les bâtiments pour les arbres et les
  props.

### KI-28 — Faces de raccord sombres aux coins d'un bord qui change de niveau

- **Statut** : Confirmé (2026-10-31, rayon lancé depuis la caméra sur la
  carte labo du relief).
- **Symptôme** : de petits carrés presque noirs au bord de l'île, là où des
  terrasses de niveaux différents arrivent au bord (labo : bord ouest des
  terrasses 0 → 3).
- **Mécanisme** : un sommet de bord « verrouillé » (deux hauteurs le long
  du bord) qui est aussi un coin rentrant est décalé en diagonale
  (`render/terrainStylized.ts`, `dispAt`) ; la face de raccord verticale
  qui comble l'écart regarde alors exactement vers la caméra de jeu (lacet
  45°), sans soleil ni lumière de remplissage.
- **Impact** : cosmétique, visible à la caméra normale sur les cartes à
  terrasses en bord d'île.
- **Correction disponible** : les variantes `?relief=roche`,
  `?relief=massif` et `?relief=hybrid` (`render/reliefLook.ts`) laissent
  ces sommets en place, sans face de raccord. Le rendu par défaut n'est pas modifié tant
  qu'aucune variante n'est retenue.
