# Décisions de design

Ce document répond à une question :

> Quelles décisions importantes ont été prises au cours du développement,
> pourquoi, et quel est leur statut aujourd'hui ?

Il sert à éviter qu'un développeur ou un agent **répète une ancienne
direction** ou **prenne une ancienne intention pour une règle actuelle**.

**Règles de lecture**

- **Le code fait foi pour l'état actuel.** L'archive
  `docs/archive/CLAUDE_LEGACY_2026.md` sert seulement à comprendre le
  « pourquoi ».
- Une ancienne intention n'est **jamais** une décision actuelle par défaut
  (voir « Anciennes intentions non actées »).
- Pas de dates précises : seul l'ordre des événements est indiqué, quand il
  est sûr.
- Ce n'est pas une chronologie exhaustive. Les réglages d'équilibrage isolés
  n'ont pas de fiche.

Documents liés : `CURRENT_STATE.md` (état actuel), `GAME_DESIGN.md` (vision et
principes), `ROADMAP.md` (chantiers), `ARCHITECTURE.md` (organisation du
code).

## Statuts

| Statut | Signification |
|---|---|
| **Active** | Décision encore cohérente avec le jeu et la vision actuels |
| **Remplacée / abandonnée** | Ancienne décision volontairement remplacée par autre chose |
| **Historique** | Utile pour comprendre le projet, mais ce n'est pas une règle actuelle |
| **Ouverte** | Arbitrage identifié, mais pas encore tranché |

Une fiche peut porter deux statuts quand une décision a deux volets, par
exemple un ancien choix remplacé par un nouveau qui, lui, est actif.

## Format d'une fiche

- **Statut**
- **Contexte** : le problème de départ.
- **Décision** : ce qui a été choisi.
- **Raison connue** : seulement ce que l'archive établit ; sinon, la raison est
  marquée comme non documentée.
- **Aujourd'hui** : l'état actuel, vérifié dans le code ou dans
  `CURRENT_STATE.md`.
- **À ne pas faire** : quand une réintroduction automatique serait une erreur.
- **Sources** : où lire l'historique, où vérifier l'état actuel.

## Index

| # | Décision | Statut |
|---|---|---|
| A1 | Unités : des boîtes aux modèles riggés | Remplacée (boîtes) / Active (modèles riggés) |
| A2 | Décor : du procédural aux assets importés | Remplacée |
| A3 | Rendu instancié des unités retiré | Historique |
| A4 | Retour d'impact : flash conservé, recul retiré | Active (flash) / Remplacée (recul) |
| B1 | Retrait du Cavalier léger | Remplacée |
| B2 | PV et dégâts stockés ×10, affichés en pips | Active |
| B3 | La case comme unité de mesure | Active |
| B4 | Identité du combat automatique | Historique (intention d'origine) / Ouverte (évolution) |
| B5 | Début de bataille défensif pour le joueur | Active |
| B6 | Vagues ennemies en mini-groupes | Active (mécanique) / Ouverte (courbe des vagues tardives) |
| C1 | Grand arbre de talents abandonné | Remplacée |
| C2 | Exclusivités dans l'arbre de talents | Remplacée (fondateurs) / Active (talents frères) |
| C3 | Attribution des points de talent | Active (forme actuelle) / Remplacée (formes antérieures) |
| C4 | Déblocage d'une unité en battant cet ennemi | Active |
| D1 | Bâtiments gameplay achetés plutôt qu'accordés par un talent | Active |
| D2 | Bâtiments gameplay et bâtiments décoratifs distincts | Active |
| D3 | Placement obligatoire de la tour en début de run | Remplacée (Baliste définie par la carte) |
| D4 | Sauvegarde d'une run en cours | Ouverte |
| D5 | Or monnaie unique, Runes supprimées, améliorations achetées à la Forge | Active (Forge et Or, niveau de production des unités) / Remplacée (Runes, améliorations permanentes, amélioration globale de la Mine et de la Caserne, absence de surcoût de production) |
| D6 | Améliorations de la Mine et de la Caserne propres à chaque bâtiment | Active |
| D7 | Départ de run, population et bâtiments de recrutement | Active |
| D8 | Murailles du joueur | Active (mécanique) / Ouverte (coût) |
| E1 | Manipulation directe pendant le placement | Active |
| E2 | Collision des décors : emprise rectangulaire, props traversables | Active |
| E3 | Rotation des décors dans l'éditeur | Remplacée (W/E) / Active (anneau et Ctrl+molette) |
| E4 | Agrandissement progressif de la carte | Active (cycle A/B/C, étape C symétrique) / Remplacée (camp joueur fixe à l'étape C) / Ouverte (runs longues) |
| E5 | Territoire par cases, couche séparée du terrain | Active (territoire de la carte, suit l'expansion) / Ouverte (territoire de run) |
| E6 | Aspect des décors fixé par leur position | Active |
| F1 | Intégration audio mise en pause après expérimentation | Historique / Ouverte |

Les choix d'architecture (séparation simulation / rendu, pas de temps fixe,
cartes décrites par des données `MapDef`, capacités d'unité génériques) ne
sont pas listés ici : voir `ARCHITECTURE.md`.

---

## A. Représentation et rendu

### A1 — Unités : des boîtes aux modèles riggés

- **Statut** : Remplacée (silhouettes en boîtes) / Active (modèles riggés).
- **Contexte** : les unités étaient d'abord construites en boîtes, générées par
  le code.
- **Décision** :
  - les silhouettes en boîtes ont été conservées malgré un retour les jugeant
    trop « Minecraft » ;
  - un essai en capsules et icosaèdres a été tenté puis abandonné ;
  - les unités sont ensuite passées, une par une, à des modèles riggés fournis
    par Antoine.
- **Raison connue** : l'essai en capsules a été jugé « moins élégant ». Ce qui
  a motivé le passage aux modèles riggés, et le choix de l'outil utilisé pour
  les générer, n'est pas documenté au-delà de la fourniture des modèles par
  Antoine.
- **Aujourd'hui** : les quatre unités jouables sont des modèles riggés et
  animés. Aucune unité n'est plus construite en boîtes.
- **À ne pas faire** : ne pas réappliquer l'ancienne règle « tout en boîtes
  pour les unités » ; elle est obsolète.
- **Sources** : historique dans l'archive (« Silhouettes ») ; état actuel dans
  `render/unitMesh.ts`, les fichiers `render/*Rig.ts` et `ASSETS.md`.

### A2 — Décor : du procédural aux assets importés

- **Statut** : Remplacée.
- **Contexte** : le décor (rochers, arbres, petits objets) et le sol étaient
  générés par le code.
- **Décision** :
  - après deux tentatives procédurales pour les rochers, de vrais modèles
    low-poly ont été importés ;
  - le petit décor en boîtes (herbe, buissons, cailloux) a été retiré ;
  - les textures de sol dessinées par code ont été remplacées par des images.
- **Raison connue** :
  - les boîtes empilées étaient « trop Minecraft » ;
  - les masses facettées produisaient « un tas de débris » plutôt qu'une masse
    rocheuse lisible ;
  - plutôt qu'une troisième tentative sans pouvoir voir le résultat, on a
    utilisé des modèles conçus par un artiste ;
  - le petit décor en boîtes a été retiré à la demande d'Antoine.
- **Aujourd'hui** :
  - décor issu de packs Kenney et KayKit ;
  - sol en textures PNG ;
  - seuls quelques débris de bois restent générés.
  Le décor peut être plus détaillé que les unités : la priorité de lisibilité
  porte sur les éléments de gameplay.
- **À ne pas faire** : ne pas relancer une génération procédurale de rochers
  ou d'arbres sans demande explicite.
- **Sources** : archive (« Décor : de vrais modèles », Stack) ;
  `render/assetLibrary.ts`, `render/board.ts`, `render/textures.ts`,
  `ASSETS.md`.

### A3 — Rendu instancié des unités retiré

- **Statut** : Historique.
- **Contexte** : l'objectif était d'afficher de très grands effectifs avec
  fluidité. Les unités en boîtes avaient été regroupées en rendu instancié pour
  réduire le nombre d'appels de dessin.
- **Décision** : en passant aux modèles riggés, le rendu instancié a été
  abandonné.
- **Raison connue** : un squelette animé ne se prête pas au rendu instancié
  standard. Antoine a explicitement accepté ce **compromis de performance** par
  rapport à l'ancien objectif de très grands effectifs.
- **Aujourd'hui** :
  - chaque unité est rendue individuellement ;
  - les limites réelles en nombre d'unités **n'ont pas été mesurées** et
    devront l'être ;
  - le nombre maximal d'ennemis visé reste une question ouverte
    (`GAME_DESIGN.md` §15).
- **Sources** : archive (« Chantier rendu instancié », « Modèle riggé du
  Fantassin ») ; `render/unitViews.ts`.

### A4 — Retour d'impact : flash conservé, recul retiré

- **Statut** : Active (flash blanc au coup reçu) / Remplacée (recul
  cosmétique).
- **Contexte** : il fallait que les coups se sentent davantage (« game feel »).
- **Décision** : garder le flash blanc sur un coup qui touche ; essayer un
  recul cosmétique de la cible, puis le retirer.
- **Raison connue** : au jugement d'Antoine, le flash seul était « plus sympa
  visuellement ».
- **Aujourd'hui** : flash sur les coups qui touchent, unités et bâtiments
  gameplay. Pas de recul cosmétique.
- **À ne pas faire** : ne pas réintroduire le recul cosmétique sans demande
  explicite.
- **Sources** : archive (« Où on en est », section Combat) ;
  `render/unitViews.ts`, `render/buildingView.ts`, `main.ts`.

---

## B. Unités et combat

### B1 — Retrait du Cavalier léger

- **Statut** : Remplacée.
- **Contexte** : une unité mobile de charge et de contournement avait été
  ajoutée. Elle était représentée par un placeholder en boîtes.
- **Décision** : retirer complètement le Cavalier léger : données, boutique,
  rendu, déblocage.
- **Raison connue** : « trop complexe à modéliser et à rigger ».
- **Aujourd'hui** :
  - l'unité n'existe plus ;
  - la capacité générique de Charge est conservée dans le moteur, mais aucune
    unité ne l'utilise ;
  - le retour éventuel d'une unité montée est une question ouverte.
- **À ne pas faire** : **ne pas réintroduire automatiquement le Cavalier**, ni
  le compter dans les unités disponibles.
- **Sources** : archive (« Jambes figées… retrait complet du Cavalier léger ») ;
  `data/units.ts`, `data/abilities.ts`.

### B2 — PV et dégâts stockés ×10, affichés en pips

- **Statut** : Active.
- **Contexte** : de petits nombres (quelques PV, un dégât) rendaient
  l'équilibrage grossier.
- **Décision** : stocker les PV et les dégâts multipliés par 10 en interne, et
  les afficher en pips.
- **Raison connue** : pouvoir équilibrer finement sans casser les nombres
  entiers.
- **Aujourd'hui** : appliqué partout ; la conversion se fait par une constante
  dédiée. L'affichage en barre de PV a évolué depuis, mais l'échelle interne
  reste la même.
- **À ne pas faire** : ne pas revenir à des valeurs internes non multipliées.
- **Sources** : archive (« Échelle des nombres ») ; `config/constants.ts`.

### B3 — La case comme unité de mesure

- **Statut** : Active.
- **Contexte** : les portées et distances étaient exprimées en unités
  abstraites.
- **Décision** : une unité de simulation vaut exactement une case ; portées,
  distances et marges se décrivent en cases.
- **Raison connue** : garder un vocabulaire commun avec ce qui se voit à
  l'écran.
- **Aujourd'hui** : appliqué dans le code et la documentation.
- **Sources** : archive (« Unité de mesure : la case ») ;
  `config/constants.ts`.

### B4 — Identité du combat automatique

- **Statut** : Historique (intention d'origine) / Ouverte (évolution future).
- **Contexte** : il fallait que le combat produise une bataille lisible sans
  code de formation.
- **Décision d'origine** :
  - les deux camps avancent ;
  - l'aggro choisit une cible, la portée arrête l'unité ;
  - une unité n'attaque pas en marchant ;
  - une répulsion entre corps fait se bousculer la foule.
- **Raison connue** : qu'une ligne de front se forme d'elle-même ; l'effet
  « blob » était assumé.
- **Aujourd'hui** :
  - ce comportement reste celui des ennemis ; le camp du joueur, lui,
    commence la bataille en Garde et n'avance plus de lui-même (B5) ;
  - le pathfinding en grille a été ajouté depuis pour contourner les
    obstacles ;
  - il n'a pas été reconfirmé récemment comme principe immuable :
    `GAME_DESIGN.md` le décrit comme l'identité actuelle.
- **Sources** : archive (« Comportement des unités », « Séparation entre
  corps ») ; `sim/systems/`, `GAME_DESIGN.md` §11 et §15.

### B5 — Début de bataille défensif pour le joueur

- **Statut** : Active.
- **Contexte** : au lancement de la bataille, les unités du joueur
  avançaient d'elles-mêmes vers l'ennemi, comme lui.
- **Décision** (demande d'Antoine) :
  - les ennemis avancent toujours ; les unités du joueur sont en défense :
    elles attendent qu'un ennemi entre dans leur aggro, ou un ordre ;
  - pour ne pas paraître figée, la formation fait d'abord un pas d'ouverture
    d'exactement une case vers l'ennemi, offsets conservés, puis passe en
    Garde. Ce n'est pas une charge : aucune cible ennemie n'est assignée ;
  - ce pas est tout ou rien : si une seule case d'arrivée est invalide, tout
    le groupe reste en place et passe directement en Garde, plutôt que de
    déformer la formation ;
  - les Fantassins produits ensuite par une Caserne passent directement en
    Garde, sans ce pas.
- **Aujourd'hui** : appliqué aux vraies batailles et à « Tester le
  scénario » (`CURRENT_STATE.md` §2).
- **Sources** : `main.ts` (`openBattleWithFormationStep`,
  `holdPlayerUnitsInGuard`), `sim/orders.ts`.

### B6 — Vagues ennemies en mini-groupes

- **Statut** : Active (mécanique). Ouverte : le total des vagues tardives,
  à rééquilibrer après playtest.
- **Contexte** : toute la vague apparaissait au même tick (jusqu'à 114
  ennemis à la vague 20).
- **Décision** (demande d'Antoine) :
  - total, composition, niveau et récompenses inchangés ; seule l'arrivée
    change ;
  - groupes de **5 au plus**, tailles **équilibrées** (pas de reste du type
    [5, 1]) ;
  - types répartis sur toute la vague (unités lourdes étalées, Mage et
    Sentinelle séparés, premier groupe léger), sans hasard ;
  - cadence **logarithmique** : `clamp(5,5 − 1,2 × ln G, 0,9 ; 4,5)` s
    entre deux arrivées ; vagues courtes espacées, longues en pression
    continue ;
  - **chevauchement autorisé** : un groupe n'attend pas la mort du
    précédent ;
  - **1 s de terrain vide** fait arriver le groupe suivant plus tôt ;
  - **victoire seulement après tous les groupes** ;
  - la Mine ne produit pas pendant un temps mort (aucun ennemi, renforts
    attendus).
- **Raison connue** : faire monter la pression progressivement sans faire
  apparaître des dizaines d'ennemis au même tick.
- **À ne pas faire** : ne pas déduire la fin de vague du seul nombre
  d'ennemis vivants.
- **Sources** : `run/enemyWaveGroups.ts`, `sim/systems/enemyReinforcements.ts`,
  `config/constants.ts`, `main.ts` (`computeEnemyWavePlan`),
  `CURRENT_STATE.md` §10.

---

## C. Progression

### C1 — Grand arbre de talents abandonné

- **Statut** : Remplacée.
- **Contexte** : un arbre de talents détaillé avait été construit, avec une
  branche d'une vingtaine de nœuds, des rangs multiples, des paliers et des
  prérequis.
- **Décision** : retirer ce système et revenir à un arbre compact. Seuls
  quelques talents et les noms de spécialisation ont été conservés.
- **Raison connue** : après l'avoir vu fonctionner en jeu, Antoine a jugé qu'il
  y avait « trop de talents mineurs, trop de petits rangs, trop de prérequis ».
  C'était un problème de **philosophie**, pas d'équilibrage.
- **Aujourd'hui** :
  - arbre compact : un talent racine, des fondateurs par branche et quelques
    talents de second palier ;
  - la vision demande un arbre « beaucoup plus riche », et sa forme reste
    ouverte (`GAME_DESIGN.md` §15).
- **À ne pas faire** : ne pas reconstruire un arbre dilué en nombreux petits
  bonus et rangs ; « plus riche » ne veut pas dire « plus de nœuds mineurs ».
- **Sources** : archive (« ROLLBACK — retour à une base simple ») ;
  `data/talents.ts`.

### C2 — Exclusivités dans l'arbre de talents

- **Statut** : Remplacée (fondateurs exclusifs) / Active (exclusivité entre
  talents frères).
- **Contexte** : à l'origine, choisir un fondateur verrouillait définitivement
  les autres spécialisations.
- **Décision** :
  - les fondateurs sont devenus librement cumulables ;
  - plus tard, un mécanisme a été ajouté : deux talents qui dépendent du même
    parent sont mutuellement exclusifs (un choix de second palier).
- **Raison connue** :
  - fondateurs : retour d'Antoine en voyant l'écran ;
  - exclusivité entre frères : conçue pour un choix précis entre deux talents
    de second palier, dont l'un a été retiré depuis (voir D1). **Sa pertinence
    générale n'a pas été rediscutée.**
- **Aujourd'hui** : le mécanisme entre frères existe toujours, mais il n'a
  aucun effet : chaque parent n'a actuellement qu'un seul enfant.
- **Sources** : archive (« Fondateurs sans exclusivité », « Premier palier
  2 ») ; `run/metaProgress.ts` (`canUnlockTalent`).

### C3 — Attribution des points de talent

- **Statut** : Active (forme actuelle) / Remplacée (formes antérieures).
- **Contexte** : il fallait décider comment le joueur gagne des points de
  talent entre les runs.
- **Décisions successives** :
  1. un point automatique à chaque run terminée — remplacé ;
  2. des paliers débloqués en battant son record de vague — remplacé ;
  3. des seuils de vague choisis par Antoine, plus un premier point offert
     après la toute première run — **forme actuelle**.
- **Raison connue** :
  - le système par record ne donnait jamais de point, faute de contenu, et
    Antoine en rejetait le principe (« c'est moi qui établirai à quelle vague
    le prochain point est disponible ») ;
  - le premier point existe parce que n'en recevoir aucun après une première
    run courte paraissait « pas naturel ».
- **Aujourd'hui** :
  - points accordés aux seuils définis, sans pouvoir être regagnés en
    rejouant la même vague ;
  - un abandon manuel ne donne rien ;
  - les seuils eux-mêmes relèvent de l'équilibrage.
- **Sources** : archive (« Retrait du système de paliers à record de vague »,
  « Premier point de talent garanti ») ; `run/metaProgress.ts`.

### C4 — Déblocage d'une unité en battant ce type d'ennemi

- **Statut** : Active.
- **Contexte** : certaines unités devaient se débloquer au fil de la
  progression ; au début, c'était à un numéro de vague précis.
- **Décision** : une unité marquée comme telle devient recrutable dès que le
  joueur a vaincu au moins une fois ce type d'unité **en tant qu'ennemi**.
- **Raison connue** : la sauvegarde enregistre un fait (« ce type a été
  vaincu ») plutôt qu'une conclusion. Ce fait reste réutilisable plus tard,
  par exemple pour un bestiaire ou des succès.
- **Aujourd'hui** : mécanisme générique, appliqué au Mage et à la Sentinelle.
  Le Mage exige en plus une Église possédée pour être recruté (D7).
- **Sources** : archive (« Système générique de déblocage d'unités ») ;
  `data/units.ts` (`playerUnlockMode`), `run/metaProgress.ts`.

---

## D. Économie et bâtiments

### D1 — Bâtiments gameplay achetés plutôt qu'accordés par un talent

- **Statut** : Active. L'ancien talent « Le temps, c'est de l'argent » est
  Remplacé.
- **Contexte** : la Mine apparaissait automatiquement grâce à un talent ; le
  joueur ne choisissait ni sa présence ni son emplacement.
- **Décision** :
  - les bâtiments deviennent une catégorie d'achat de la boutique de run :
    le joueur les achète puis les place lui-même ;
  - le talent est supprimé, et son coût remboursé lors du chargement des
    anciennes sauvegardes ;
  - la Caserne a été ajoutée dans le même cadre.
- **Raison connue** : le joueur doit décider **s'il** construit, **lequel**,
  **quand** et **où**.
- **Aujourd'hui** :
  - Mine, Caserne et Forge achetables et déplaçables pendant le placement ;
  - plusieurs exemplaires possibles ;
  - aucun talent ne crée de bâtiment automatiquement.
- **À ne pas faire** : ne pas recréer de talent qui place un bâtiment sans
  décision du joueur.
- **Sources** : archive (« Bâtiments comme catégorie d'achat en cours de
  run ») ; `data/buildings.ts`, `run/metaProgress.ts`
  (`REMOVED_TALENT_REFUNDS`).

### D2 — Bâtiments gameplay et bâtiments décoratifs distincts

- **Statut** : Active.
- **Contexte** : le même pack fournit des bâtiments utilisés comme décor et
  d'autres utilisés en jeu.
- **Décision** :
  - les bâtiments **gameplay** (Mine, Caserne, Forge, Baliste) sont des entités de
    simulation : ciblables, destructibles, avec des PV ;
  - les bâtiments **décoratifs** de l'éditeur restent de simples obstacles.
- **Raison connue** : garder le décor neutre ; seuls les bâtiments posés par
  le joueur participent au combat et comptent pour la défaite.
- **Aujourd'hui** :
  - la partie continue tant qu'il reste au joueur une unité **ou** un bâtiment
    gameplay ;
  - un bâtiment décoratif n'est jamais ciblé.
- **Sources** : archive (« Éditeur : correctif de placement + architecture
  BUILDING ») ; `data/buildings.ts`, `sim/world.ts`, `EDITOR.md` §16.

### D3 — Placement obligatoire de la tour en début de run

- **Statut** : Remplacée : la Baliste est désormais définie par la carte.
- **Contexte** : la tour de la Baliste était fixée dans un coin du plateau.
- **Décision d'origine** : au début de chaque run, le joueur devait placer la
  tour dans sa zone avant toute autre action. Sa position était ensuite
  conservée pendant la run.
- **Raison connue** : **insuffisamment documentée** au-delà de la demande
  d'Antoine.
- **Remplacement** : avec l'arène officielle du Mode survie, Antoine a
  décidé de supprimer ce placement manuel. La Baliste est créée directement
  à la position définie par la carte (`MapDef.ballista`, (0.5, 15.5) pour
  l'arène actuelle), qui devient le cœur initial de la base ; la préparation
  commence aussitôt. La position n'est pas recalculée (pas de « centre »
  automatique du territoire) ; elle recule seulement d'une case avec le camp
  joueur à chaque étape C de l'agrandissement (E4).
- **Aujourd'hui** : le Mode survie, l'éditeur et « Tester le scénario »
  utilisent tous la position de la carte, sinon le repli historique du coin.
  Le choix de cette position se fait dans l'éditeur (règle 3×3 en
  territoire joueur).
- **À ne pas faire** : ne pas coder la position de la Baliste en dur dans le
  jeu ; elle appartient à la carte.
- **Sources** : archive (« Placement obligatoire de la tour ») ; `main.ts`
  (`startNewRun`), `config/maps/survivalArena.ts`, `CURRENT_STATE.md` §2
  et §5.

### D4 — Sauvegarde d'une run en cours

- **Statut** : Ouverte.
- **État actuel** : seule la méta-progression est sauvegardée (talents,
  déblocages, record). Quitter en cours de run perd l'or, l'armée,
  l'inventaire, les bâtiments et les améliorations de Forge de la run.
- **Historique** : l'archive qualifie ce comportement de « voulu, pas un
  oubli », sans plus d'argument. **La raison de fond n'est pas établie.**
- **Enjeu** : la question devient particulièrement importante si les runs
  s'allongent, ce que vise la survie sans fin.
- **Sources** : archive (chantier « Sauvegarde & progression permanente ») ;
  `run/metaProgress.ts`, `CURRENT_STATE.md` §15, `GAME_DESIGN.md` §15.

### D5 — Or monnaie unique, Runes supprimées, améliorations achetées à la Forge

- **Statut** : Active (Or et Forge ; niveau de production des unités).
  Remplacée : la monnaie Rune, la boutique d'amélioration permanente du menu
  principal, le talent « Maître de la forge » et la règle « une amélioration
  n'augmente pas le prix de ce qu'elle améliore » (pour les unités).
- **Contexte** : les améliorations de statistiques s'achetaient avec des
  Runes gagnées à chaque victoire, dans une boutique du menu principal, et
  restaient acquises d'une run à l'autre. Elles ne créaient aucun arbitrage
  pendant la partie, et faisaient doublon avec la progression des talents.
- **Décision** :
  - l'**Or** est la seule monnaie de la run : recrutement, parchemins,
    bâtiments et améliorations ;
  - les Runes sont supprimées (gain, solde, prix, boutique du menu) ;
  - les améliorations deviennent **propres à la run** (`RunState.upgrades`,
    remises à zéro à chaque nouvelle run, jamais sauvegardées) ;
  - elles s'achètent uniquement depuis une **Forge**, un bâtiment construit
    par le joueur, en préparation. La Forge est un point d'accès à une
    boutique globale, pas une source de bonus : plusieurs Forges ne
    cumulent rien ; si toutes sont détruites, les améliorations acquises
    restent actives mais aucun nouvel achat n'est possible avant
    reconstruction ;
  - une amélioration n'augmente plus le prix de ce qu'elle améliore (unité,
    bâtiment, parchemin) — **remplacé pour les unités**, voir « Évolution » ;
  - « Maître de la forge », qui ne réduisait que le coût en Runes, est retiré
    de l'arbre ; ses points sont remboursés au chargement des anciennes
    sauvegardes.
- **Évolution** :
  - la Mine et la Caserne ne s'améliorent plus à la Forge, mais chacune
    depuis sa propre fiche (D6) ;
  - **niveau de production des unités** (refonte « escarmouches » : moins
    d'unités, plus puissantes) :
    - une amélioration d'unité à la Forge élève le niveau auquel les
      **futures** unités de ce type sont produites (boutique, Caserne,
      Camp d'archerie) ;
      elle ne modifie jamais une unité déjà créée ;
    - une unité conserve à vie le niveau, les statistiques et le coût de
      production de sa création (`OwnedUnit.productionLevel`) ;
    - chaque niveau est un vrai gain de puissance et **augmente le coût de
      recrutement des futures recrues** (Fantassin et Archer +1 or, Mage
      +3, Sentinelle +10 par niveau) ;
    - un niveau coûte `7 × 2^niveau` à la Forge (7 / 14 / 28…) ;
    - les bâtiments et les parchemins gardent leurs règles (pas de
      surcoût, barème 1 / 2 / 4…).
- **Raison connue** : créer une vraie tension économique pendant la run —
  investir dans une amélioration **ou** acheter des unités et des bâtiments
  pour survivre — et séparer clairement les rôles : talents pour la
  progression permanente et les règles, Forge pour l'investissement
  économique de la run.
- **Aujourd'hui** :
  - Or de départ 20 (25 avec « Or de départ », voir D7) ; Forge 10,
    Mine 20, Caserne 15, Camp d'archerie 15, Maison 5, Tour 20, Église 35 ;
  - la Forge propose les améliorations de production des unités (Fantassin,
    Archer, Mage, Sentinelle) et la Baliste ;
  - l'Église est le point d'accès aux améliorations du Parchemin de soin, de
    la Nova de glace et de Soins excédentaires. Ces trois améliorations
    restent des améliorations **globales de la run** (`RunState.upgrades`,
    partagées par toutes les Églises), pas des améliorations individuelles
    de l'Église ; le niveau propre d'une Église ne porte que sur ses PV max
    et l'efficacité de son soin (PV par or) ;
  - coût `runUpgradeGoldCost` : 7 / 14 / 28 / 56… pour les unités,
    1 / 2 / 4 / 8… pour le reste. Ces montants, comme les gains et surcoûts
    par niveau (`data/unitUpgrades.ts`), sont de l'**équilibrage
    provisoire**, pas une décision ;
  - `MetaProgress` ne contient plus que la progression permanente ; les clés
    `upgradeRunes` / `unitUpgrades` des anciennes sauvegardes sont ignorées.
- **À ne pas faire** :
  - ne pas réintroduire de monnaie permanente qui achèterait des
    améliorations de statistiques hors de la run ;
  - ne pas faire dépendre la puissance des améliorations du nombre de Forges ;
  - ne pas rendre une amélioration d'unité rétroactive : une unité garde
    le niveau de sa création ;
  - ne pas ajouter de surcoût lié au niveau aux bâtiments ni aux parchemins
    sans nouvelle décision.
- **Direction (intention, non actée)** : à terme, la Forge ne devrait plus
  améliorer que les unités ; la place des améliorations de la Baliste et des
  parchemins reste à décider.
- **Sources** : `run/runUpgrades.ts`, `data/unitUpgrades.ts`,
  `run/unitUpgradeEffects.ts`, `run/runState.ts`, `run/metaProgress.ts`
  (`REMOVED_TALENT_REFUNDS`), `data/buildings.ts`, `main.ts` (`openForge`,
  `purchaseForgeUpgrade`), `CURRENT_STATE.md` §6, §7 et §14.

### D6 — Améliorations de la Mine et de la Caserne propres à chaque bâtiment

- **Statut** : Active.
- **Contexte** : la Mine et la Caserne s'amélioraient à la Forge, d'un
  niveau global partagé par tous les exemplaires.
- **Décision** (demande d'Antoine) :
  - chaque Mine et chaque Caserne a son **propre niveau**, acheté depuis sa
    fiche, en préparation (règle étendue ensuite au Camp d'archerie, à la
    Tour et à l'Église) ;
  - deux bâtiments du même type peuvent avoir des niveaux différents ;
  - la Mine garde l'ancien barème, compté par bâtiment : 25 / 50 / 100… La
    Caserne et le Camp d'archerie n'ont plus qu'une amélioration,
    Niv. 1 → Niv. 2 pour 20 or (D7).
- **Raison connue** : les bâtiments doivent porter leur propre logique de
  fiche et d'amélioration ; la Forge doit tendre vers les améliorations
  d'unités (D5).
- **Aujourd'hui** : Mine : 3 à 7 or toutes les 5 s au niveau 1, +2 / +2 par
  niveau, 5 productions au plus par Mine et par manche ; Caserne et Camp
  d'archerie : voir D7. Ces valeurs sont de
  l'équilibrage, pas une décision.
- **Sources** : `run/buildingUpgrades.ts`, `run/mineUpgradeEffects.ts`,
  `data/buildings.ts`, `CURRENT_STATE.md` §6.

### D7 — Départ de run, population et bâtiments de recrutement

- **Statut** : Active.
- **Contexte** : la run commençait avec 1 Fantassin, 15 or et 10 places de
  population ; toutes les unités de base se recrutaient sans condition, et
  la Caserne produisait des Fantassins à intervalle régulier pendant la
  bataille.
- **Décision** (demande d'Antoine) :
  - **départ** : 20 or, **4 Fantassins** de niveau 1, population maximale
    **5** (`PLAYER_BASE_POPULATION`), aucun bâtiment. La run commence donc à
    **4 / 5** ;
  - **Maison** : 5 or, +2 de population maximale (5, 7, 9…), aucune Maison
    gratuite.
    Avec une seule place libre au départ, elle est la première réponse à la
    contrainte de population ;
  - **recrutement** : un bâtiment possédé est requis pour recruter
    certaines unités. Fantassin → Caserne, Archer → Camp d'archerie, Mage
    → Église ; la Sentinelle garde sa règle (C4). Sans le bâtiment, le
    bouton reste visible mais désactivé, avec la raison en infobulle ; la
    même règle est vérifiée à l'achat. Les unités déjà possédées, dont
    l'armée de départ, ne sont jamais retirées ;
  - **Caserne** : 15 or, 3 × 3, débloque le Fantassin et en produit 1 par
    manche au Niv. 1, 2 au Niv. 2. Une seule amélioration, 20 or, Niv. 2
    maximum, sans PV ni autre bonus ;
  - **Camp d'archerie** : mêmes règles pour l'Archer (15 or, 3 × 3, 1 puis
    2 Archers par manche, amélioration 20 or, Niv. 2 maximum) ;
  - **production** : une fois par manche, au début de la bataille, sans
    minuteur. Le quota est limité par la population et les cases libres ;
    un **lot partiel est volontaire** (une place pour un quota de 2 →
    1 unité produite, l'autre attend et sort si une place se libère pendant
    la bataille). Le quota restant est perdu à la fin de la bataille, sans
    report ;
  - **Église** : 35 or ; elle débloque désormais le recrutement du Mage,
    en plus de son soin et de ses améliorations.
- **Raison connue** :
  - le départ à 4 / 5 force un choix immédiat : Maison + Caserne ou Maison
    + Camp d'archerie (20 or). Caserne + Camp d'archerie (30 or) est
    volontairement impossible au départ ;
  - le Mage devient une unité plus tardive, derrière une Église plus chère.
- **Aujourd'hui** : valeurs dans `config/constants.ts`
  (`PLAYER_BASE_POPULATION`), `run/runState.ts` (`STARTING_GOLD`,
  `STARTING_FANTASSIN_COUNT`) et `data/buildings.ts` (`production`,
  `recruitmentUnlock`, `maxUpgradeLevel`). Le talent « Or de départ »
  ajoute toujours 5 or. Les montants restent de l'équilibrage.
- **À ne pas faire** :
  - ne pas donner de Maison gratuite au départ ;
  - ne pas réintroduire de production à intervalle régulier ;
  - ne pas disperser les conditions de recrutement dans l'interface : elles
    viennent des données (`BuildingDef.recruitmentUnlock`) et de
    `run/recruitment.ts`.
- **Sources** : `data/buildings.ts`, `run/recruitment.ts`,
  `sim/systems/buildingProduction.ts`, `run/runState.ts`,
  `config/constants.ts`, `CURRENT_STATE.md` §2, §4 et §6.

### D8 — Murailles du joueur

- **Statut** : Active (mécanique). Ouverte : le coût par segment.
- **Décision** (demande d'Antoine, choix tranchés avec lui) :
  - murailles KayKit du dossier « neutral » = constructions du **joueur**
    (visuel non teinté), 50 PV, rôle unique : bloquer le déplacement ;
  - segment droit **2 × 1** à l'échelle native, pose par **tracé continu**
    (une portion par clic, axe dominant, tout ou rien par portion, fermeture
    sur le point de départ ; préparation et éditeur) ;
  - un **mur** bloque **les deux camps** (on contourne ou on passe par une
    porte) ; les tirs passent ;
  - une **porte** est un passage pour **son** camp seulement : ouverture
    automatique à l'approche d'un allié, trajets alliés à travers même
    fermée, collision seulement une fois assez ouverte ; toujours fermée pour
    l'adversaire, qui doit la détruire. Remplaçable sur un segment de mur
    (prix de la porte, mur non remboursé) ;
  - virages = vraies pièces de coin KayKit `wall_corner_B_outside` /
    `_inside` (arc de 120° ajusté dans une case, choix d'Antoine), emprise
    1 × 1, comptées comme un segment ;
  - longueur EXACTE demandée (choix d'Antoine, remplace l'aimantage) :
    tronçon impair complété par un demi-segment d'une case (`wall_half`,
    segment KayKit comprimé à mi-longueur, le pack n'ayant aucun mur d'une
    case) ; ½ or par case droite ; extrémités d'un tracé ouvert finalisées en
    pièces droites à la sortie du tracé ;
  - créneaux vers l'**extérieur** : enceinte fermée = intérieur du
    polygone ; tracé ouvert = côté de la Baliste (portion la plus proche),
    un seul côté pour tout le tracé — **priorité à la continuité**, jamais un
    bras retourné au passage d'un coin (décision d'Antoine) ;
  - les ennemis les ciblent **comme tout bâtiment** (cible la plus proche),
    sans IA dédiée ;
  - elles ne comptent pas pour la défaite ;
  - coût **provisoire** : 1 or par segment (`BuildingDef.cost`).
- **Raison connue** : construire des enceintes sans multiplier les clics et
  sans nouvelle IA.
- **Historique** : une première version laissait les alliés traverser les
  murs (règle par équipe) ; remplacée à la demande d'Antoine par des murs
  bloquants pour tous et des portes par équipe.
- **Animation de porte** : le pack KayKit n'a **aucun** clip ; les deux
  battants du modèle sont tournés par code (décision d'Antoine, `ASSETS.md`).
- **À ne pas faire** : ne pas ajouter d'attaque, d'aura ou d'effet aux
  murailles sans nouvelle décision.
- **Sources** : `data/buildings.ts`, `core/wallTrace.ts`, `main.ts` (mode
  Muraille), `sim/systems/gates.ts`, `sim/geometry.ts`, `CURRENT_STATE.md`
  §6.

---

## E. Placement, carte et éditeur

### E1 — Manipulation directe pendant le placement

- **Statut** : Active.
- **Contexte** : le premier placement passait par un bandeau de jetons à
  cliquer, à côté du plateau.
- **Décision** : manipuler directement les unités 3D : clic pour
  sélectionner, clic sur une case pour déplacer. Le glisser-déposer, la
  sélection multiple et la vente par glisser ont été ajoutés ensuite.
- **Raison connue** : le bandeau était jugé « pas naturel ».
- **Aujourd'hui** : appliqué aux unités et aux bâtiments du joueur.
- **À ne pas faire** : ne pas revenir à un bandeau de jetons séparé du
  plateau.
- **Sources** : archive (« Phase de placement ») ; `main.ts`,
  `CURRENT_STATE.md`.

### E2 — Collision des décors : emprise rectangulaire, props traversables

- **Statut** : Active, avec une évolution.
- **Contexte** : les premiers obstacles avaient une emprise approximative ;
  plus tard, des props décoratifs bloquaient le placement.
- **Décision** :
  - la collision d'un obstacle bloquant est un **rectangle de cases** qui
    correspond à ce que le joueur voit occupé ; il bloque à la fois le
    mouvement et la ligne de tir ;
  - les **props** sont traversables ; rochers, arbres et bâtiments restent
    bloquants.
- **Raison connue** :
  - la collision doit correspondre à l'emprise visible ;
  - un prop qui empêchait de déplacer une unité était un bug, d'où la décision
    de rendre les props traversables.
- **Évolution** :
  - la position d'un décor est désormais libre (plus forcément alignée sur un
    coin de case) ;
  - sa rotation est purement visuelle ;
  - le principe « emprise rectangulaire » demeure.
- **Sources** : archive (« Obstacles », « Props traversables ») ;
  `config/constants.ts` (`isCollidableObstacle`, `obstacleCenter`,
  `obstacleBounds`), `sim/geometry.ts`.

### E3 — Rotation des décors dans l'éditeur

- **Statut** : Remplacée (mode gizmo W/E) / Active (anneau et Ctrl+molette).
- **Contexte** : la rotation libre passait par un mode du gizmo, basculé avec
  W/E, devenu inutilisable.
- **Décision** :
  - remplacer ce mode par un anneau à glisser autour du décor ;
  - ajouter Ctrl+molette (pas fin avec Maj) ;
  - conserver R / « Tourner 90° ».
- **Raison connue** : l'ancien mode n'offrait plus de poignée utilisable.
- **Aujourd'hui** : comportement décrit dans `EDITOR.md` §9. R / « +90° (R) »
  partent désormais de l'orientation affichée et sont annulables, comme
  l'anneau et Ctrl+molette.
- **Sources** : `editor/`, `main.ts`, `EDITOR.md`.

### E4 — Agrandissement progressif de la carte

- **Statut** : Active (comportement) / Ouverte (place sur les runs longues).
- **Contexte** : il fallait que la carte accompagne la croissance de la
  bataille.
- **Décision** :
  - la carte s'agrandit après chaque vague gagnée, selon un cycle de trois
    étapes (profondeur des zones de spawn, largeur, champ de bataille) ;
  - à l'étape C (champ de bataille), **chaque camp recule d'une case** vers
    son bord, avec tout ce qu'il contient (territoire, décors, bâtiments,
    Baliste) ; les deux nouvelles rangées vont au champ de bataille.
- **Remplacé** : la règle d'origine gardait le camp joueur fixe et reculait le
  camp ennemi de deux cases (Antoine préférait alors translater le camp
  ennemi plutôt qu'étirer la carte). Sur un plateau centré, elle épaississait
  la bordure derrière le joueur et rognait la zone ennemie (ancien KI-25).
  Antoine a choisi l'étape C symétrique.
- **Raison connue** : garder une bordure neutre d'une case autour de chaque
  zone de camp, et deux camps de même taille, à toutes les étapes. La logique
  d'ensemble du cycle reste **peu documentée**.
- **Aujourd'hui** : appliqué au jeu réel uniquement, sur l'arène du Mode
  survie, dont la forme (trous) et le territoire dessiné suivent chaque
  étape. Son rôle sur les runs longues reste ouvert.
- **Sources** : archive (« Agrandissement progressif de la map ») ;
  `run/mapExpansion.ts`, `CURRENT_STATE.md` §11.

### E5 — Territoire par cases, couche séparée du terrain

- **Statut** : Active (territoire de la carte et éditeur) / Ouverte
  (territoire dynamique de run).
- **Contexte** : la zone de placement du joueur était un rectangle recalculé
  à partir de la taille de la carte et de la profondeur de spawn, et le camp
  d'une unité de l'éditeur dépendait de la moitié du plateau (`z ≥ 0`). Ces
  deux règles divergeaient, et aucune ne pouvait décrire une carte
  irrégulière ni un territoire qui s'étend.
- **Décision** :
  - le territoire est une **liste creuse de cases** avec un camp
    (`MapDef.territory`), **séparée du terrain** (`cells`) et dans la même
    convention de coordonnées ;
  - une case **sans entrée est neutre** ; neutre n'est pas un troisième camp ;
  - une carte **sans** territoire garde les **bandes historiques** en repli,
    calculées à la volée ; `[]` est un territoire explicitement vide ;
  - le repli n'est **jamais matérialisé** par un simple enregistrement ; il
    l'est au premier vrai changement, puis la modification s'applique ;
  - le même territoire sert au placement en jeu, au rendu des zones et au
    camp des unités de l'éditeur ;
  - dans l'éditeur, le camp d'une unité est fixé **à la pose et au
    déplacement** par le territoire de sa case ; une case neutre est
    interdite ; les unités et la Baliste déjà présentes sont **conservées**
    telles quelles, même hors de leur territoire, jusqu'à leur prochain
    déplacement ;
  - la Baliste de l'éditeur appartient au joueur ; un déplacement exige une
    empreinte 3×3 entièrement en territoire joueur.
- **Raison connue** : retenue à l'audit du chantier Territory :
  - même grille exacte que le placement, et vérification d'une emprise case
    par case ;
  - extension future par simple ajout de cases ;
  - séparer le territoire du terrain évite de réécrire le terrain quand le
    territoire change, et de devoir synthétiser des cellules pour une carte
    qui n'en a pas ;
  - le repli et la conservation des entités existantes gardent les anciennes
    cartes valides sans les modifier en silence.
- **Aujourd'hui** :
  - appliqué au placement en préparation (unités, bâtiments), au rendu des
    zones et à l'éditeur ;
  - le Mode survie utilise le territoire dessiné de son arène. Il suit
    l'agrandissement A/B/C : la carte agrandie porte un territoire
    transformé (A et B élargissent les zones en repoussant la bordure
    neutre, C fait reculer la zone ennemie avec la partie ennemie). Une carte
    sans territoire garde le repli par bandes ;
  - les zones restent visibles en préparation et en bataille ;
  - **ouvert** : territoire propre à la run (`RunState.territory`) et
    croissance ou conquête réelle du territoire au fil des vagues.
- **À ne pas faire** :
  - ne pas revenir à un camp déduit de la position (`z ≥ 0`) ;
  - ne pas fusionner le territoire dans `cells` ;
  - ne pas matérialiser le repli à l'enregistrement, ni changer en silence
    le camp ou la position d'entités chargées.
- **Sources** : `config/territory.ts`, `config/mapDef.ts`,
  `editor/editorState.ts`, `editor/mapSerializer.ts`, `main.ts`
  (`isValidPlacementTile`), `render/board.ts`, `run/mapExpansion.ts`,
  `EDITOR.md` §4, `CURRENT_STATE.md` §11.

### E6 — Aspect des décors fixé par leur position

- **Statut** : Active.
- **Contexte** : un décor sans rotation enregistrée (la grande majorité)
  tirait au hasard son orientation, la forme d'un rocher ou la hauteur d'un
  arbre à chaque affichage. L'éditeur, « Tester le scénario » et le jeu ne
  montraient donc pas la même chose, et l'arène changeait d'une session à
  l'autre.
- **Décision** (choisie par Antoine parmi trois options) : l'aspect d'un
  décor est tiré d'une graine calculée à partir de sa position, de son type,
  de son modèle et de sa taille. Une `rotationY` explicite reste
  prioritaire.
- **Conséquence acceptée** : déplacer un décor dans l'éditeur lui donne un
  nouvel aspect ; pour fixer un angle, le tourner (il est alors enregistré).
- **Aujourd'hui** : même aspect dans l'éditeur, « Tester le scénario », le
  Mode survie et d'une session à l'autre ; l'agrandissement de la carte
  fige la graine (`appearanceSeed`) des décors qu'il déplace.
- **À ne pas faire** : ne pas réintroduire `Math.random` dans les fabriques
  de décors.
- **Sources** : `config/constants.ts` (`obstacleAppearanceSeed`),
  `render/obstacleFactory.ts`, `run/mapExpansion.ts`, `EDITOR.md` §6.

---

## F. Audio

### F1 — Intégration audio mise en pause après expérimentation

- **Statut** : Historique (mise en pause) / Ouverte (direction future).
- **Contexte** : un moteur audio procédural avait été construit, avec des
  catégories de volume et un écran Paramètres, et des sons de combat et
  d'interface ajoutés.
- **Décision** : ne pas poursuivre l'intégration pour l'instant. Les sons ont
  été débranchés **sans supprimer le moteur**.
- **Raison connue** : le rendu des sons ne convenait pas (« ça ne rend pas
  bien… on verra plus tard »).
- **Aujourd'hui** : moteur présent mais **déconnecté** ; les réglages de son
  existent encore sans effet audible.
- **À ne pas faire** : ne pas présenter l'audio comme définitivement abandonné.
- **Sources** : archive (« Système audio entièrement désactivé ») ; `audio/`,
  `main.ts`, `GAME_DESIGN.md` §15.

---

## Anciennes intentions non actées

Ces points apparaissent dans l'archive avec une valeur ou une orientation,
mais **ne sont pas des décisions actuelles**. Ce sont des questions ouvertes
ou de l'équilibrage, suivis dans `GAME_DESIGN.md` §15 et `ROADMAP.md`.

| Ancienne intention | Statut réel |
|---|---|
| Taux de raté autour de 10–15 % | Ancienne intention, non actée — question ouverte |
| Poids de la flèche du joueur (« environ 20 % des dégâts d'une vague ») et cadence d'origine | Ancienne intention, non actée — question ouverte |
| Ancienne formule de production de la Caserne | Équilibrage, remplacée depuis — pas une décision |
| Économie des Runes (coûts, gains) | Obsolète : Runes supprimées (voir D5) |
| Sentinelle ennemie renforcée ou non au fil des vagues | Question ouverte |
| Persistance des unités produites par la Caserne | Question ouverte |
| Forme exacte de la survie infinie et courbe des vagues | Question ouverte |
| Réglages historiques de la caméra | Réglage d'UX — pas une décision |
| Arc de l'archer en arc de tore, « tout en boîtes » pour les unités | Obsolète (voir A1) |
