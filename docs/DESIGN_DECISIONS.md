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
| B1 | Retrait du Cavalier léger | Remplacée (cavalerie revenue, G8) |
| B2 | PV et dégâts stockés ×10, affichés en pips | Active |
| B3 | La case comme unité de mesure | Active |
| B4 | Identité du combat automatique | Historique (intention d'origine) / Ouverte (évolution) |
| B5 | Début de bataille défensif pour le joueur | Active |
| B6 | Vagues ennemies en mini-groupes | Active (mécanique) / Ouverte (courbe des vagues tardives) |
| B7 | Oracle, soutien soigneur de l'Église | Active (rôle, Église, 15 or, soin en fin d'incantation) / Ouverte (autres valeurs, apparence) |
| B8 | Piquier, recrue de base de la Caserne | Active (rôle, Caserne Niv. 1 / Fantassin Niv. 2, production) / Ouverte (valeurs) |
| B9 | Vengeur, combattant à deux épées de l'Église | Active (rôle, Église, deux épées) / Ouverte (valeurs, animations) |
| B10 | Ordre de déplacement prioritaire sur l'attaque de base, élan opt-in | Active (règle) / Ouverte (élan des unités existantes) |
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
| E2 | Collision des décors : emprise rectangulaire, props traversables | Remplacée (décors bloquants) / Active (emprise rectangulaire des obstacles) |
| E3 | Rotation des décors dans l'éditeur | Remplacée (W/E) / Active (anneau et Ctrl+molette) |
| E4 | Agrandissement progressif de la carte | Active (cycle A/B/C, étape C symétrique) / Remplacée (camp joueur fixe à l'étape C) / Ouverte (runs longues) |
| E5 | Territoire par cases, couche séparée du terrain | Active (territoire de la carte, suit l'expansion) / Ouverte (territoire de run) |
| E6 | Aspect des décors fixé par leur position | Active |
| E7 | Relief 2.5D : falaises infranchissables, pentes, combat 2D | Active (prototype) / Ouverte (avantage de hauteur, ligne de vue, grande carte) |
| E8 | Décors purement visuels, traversables, adaptatifs au relief | Active / Remplacée pour les arbres (G11) |
| F1 | Intégration audio mise en pause après expérimentation | Historique / Ouverte |
| G11 | Arbres bloquants, ressources rares, vagues reliées au camp, Mine toutes les 60 s | Active (valeurs provisoires) |
| H1 | Atelier de personnage : outil interne, export vers `units.json` | Active |

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
- **Suite** (2026-11-01) : à la **demande explicite d'Antoine**, une
  cavalerie légère revient sous une forme nouvelle (G8) : modèle Toon riggé
  (la raison du retrait ne tient plus), bestiaire et éditeur seulement.
- **À ne pas faire** : ne pas étendre la cavalerie (recrutement, vagues,
  Charge) sans décision d'Antoine.
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
  - cadence **logarithmique** : `clamp(5,8 − 1,05 × ln G, 1,3 ; 4,8)` s
    entre deux arrivées (ajustée en octobre 2026 : plus de respiration en
    milieu de run, chevauchement conservé en fin de run ; à réévaluer avec
    la future carte circulaire) ;
  - **chevauchement autorisé** : un groupe n'attend pas la mort du
    précédent ;
  - **1,5 s de terrain vide** fait arriver le groupe suivant plus tôt ;
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

### B7 — Oracle, soutien soigneur de l'Église

- **Statut** : Active (rôle, Église, 15 or, soin appliqué à la fin de
  l'incantation). Ouverte : toutes les autres valeurs et règles ci-dessous,
  **PROVISOIRES** tant qu'elles n'ont pas été jouées, et l'apparence.
- **Contexte** : aucune unité de soutien ; les soins ne venaient que du
  joueur (parchemins, soin de l'armée à l'Église).
- **Décision** (demande d'Antoine, 2026-11-01) :
  - unité humaine **Oracle**, recrutée à l'**Église** (avec le Mage),
    **15 or** ; soutien fragile, presque pur, qui soigne ses alliés ;
  - le soin est appliqué par la simulation **à la fin de l'incantation**,
    jamais au début ; déterministe, sans hasard, au pas fixe de 30 Hz ;
  - pas de changement de phase.
- **Valeurs et règles PROVISOIRES** (proposées à l'implémentation) :
  - population 2 ; 3 PV ; 2 cases/s ; rayon 0,44 ; joueur seulement (absent
    des vagues ennemies) ; aucun niveau de production à la Forge ;
  - soin de 2 PV, portée 4,5 cases, incantation 1 s, recharge 4 s comptée
    depuis le **début** de l'incantation (0,5 PV/s par Oracle) ;
  - cible : allié vivant et blessé à portée, jamais lui-même ni un
    bâtiment ; priorité à la plus faible part de PV, puis aux PV les plus
    bas, puis au plus proche, puis au plus petit id. Les soins déjà en
    incantation par un autre Oracle comptent comme rendus ;
  - sans allié blessé : pas d'incantation, recharge non consommée. Il se
    tient à 3,5 cases de son ennemi (`engageRange`) et ne frappe qu'au
    contact (0,5, 30 % de ratés) ;
  - fin d'incantation : cible morte, devenue invalide ou à plus de
    5,5 cases (portée + 1 de tolérance) → soin **perdu**, recharge
    conservée, aucune autre cible ; Oracle mort pendant l'incantation →
    incantation annulée ;
  - PV plafonnés aux PV max, aucun surplus ; ne déclenche pas « Soins
    excédentaires » ; peut faire repasser une unité au-dessus du seuil
    d'« Aux petits oignons » ;
  - apparence Toon RTS (capuche, robe, bâton doré), proche du Mage par la
    robe ; sans l'asset local, il reprend le modèle du Mage.
- **Raison connue** : demande d'Antoine pour le rôle, le bâtiment, le coût
  et le moment du soin. Les autres valeurs ne sont pas encore validées.
- **Aujourd'hui** : `data/units.ts` (`oracle`), `data/abilities.ts`
  (`HealAbility`), `sim/systems/abilities.ts` (`findHealTarget`,
  `tryTriggerHeal`, `resolveHeal`), `sim/damage.ts` (`applyHealToEntity`),
  `data/buildings.ts` (`recruitmentUnlock.unitIds`), `CURRENT_STATE.md` §3
  et §4.
- **À ne pas faire** : appliquer le soin au début de l'incantation ; tirer
  la cible au hasard ; modifier des PV de simulation hors de
  `applyHealToEntity` / `applyDamageToEntity`.
- **Sources** : demande d'Antoine du 2026-11-01 ; code ci-dessus.

### B8 — Piquier, recrue de base de la Caserne

- **Statut** : Active (rôle, lance et petit bouclier, Caserne : verrou du
  Fantassin et production). Ouverte : valeurs **PROVISOIRES** (validées
  pour le prototype).
- **Décision** (demande d'Antoine, 2026-11-01) : soldat de base de la
  Caserne, lance et petit bouclier, plus léger et plus commun que le
  Fantassin ; à terme, le Fantassin devient une unité plus avancée. Pas de
  mécanique anti-cavalerie pour l'instant. Armée de départ inchangée.
- **Valeurs PROVISOIRES** : 1,5 or, population 1, 4 PV, 0,8 dégât toutes
  les 1,2 s (élan 0,3 s, B10), portée 1,4, 8 % de ratés, 2 cases/s, rayon
  0,45 ; joueur seulement.
  - Plus faible seul que le Fantassin (5 PV, 1 dégât par seconde) et moins
    cher ; fiable (peu de ratés).
  - Intéressant en nombre : sa portée lui permet de frapper depuis le
    deuxième rang.
- **Caserne** (décision d'Antoine, 2026-11-01) : Niv. 1, Piquier
  recrutable et Fantassin verrouillé, production d'1 Piquier par manche ;
  Niv. 2, Fantassin recrutable, production d'1 Piquier et d'1 Fantassin.
  Les 4 Fantassins de l'armée de départ restent (soldats déjà
  disponibles). Verrou : `RecruitmentUnlockConfig.minLevels` ; production :
  `UnitProductionConfig.unitsByLevel`.
- **Sources** : `data/units.ts` (`piquier`), `data/buildings.ts`
  (`barracks`), `run/recruitment.ts`, `CURRENT_STATE.md` §3 et §4.

### B9 — Vengeur, combattant à deux épées de l'Église

- **Statut** : Active (rôle, Église, une épée dans chaque main). Ouverte :
  valeurs **PROVISOIRES**, choix des animations.
- **Décision** (demande d'Antoine, 2026-11-01) : combattant religieux
  offensif, rapide, DPS de mêlée brutal ; ni tank, ni bon marché ;
  branche offensive de l'Église, qui ne soigne pas.
- **Valeurs PROVISOIRES** : 25 or, population 3, 10 PV, 2 dégâts toutes les
  0,6 s (élan 0,2 s, B10 ; cadence réelle 0,633 s, KI-30), portée 0,95,
  10 % de ratés, 2,6 cases/s, rayon 0,5 ; aucun prérequis au-delà de
  l'Église ; joueur seulement.
  - Avantages : meilleurs dégâts par seconde au contact, rapide.
  - Faiblesses : cher en or et en population, 10 PV sans bouclier ni
    capacité (la Sentinelle en a 50), aucune attaque à distance.
- **Animations** : le pack n'a pas de clip à deux armes. Retenus :
  - gestes de l'Infantry (repos, garde, course, morts) ;
  - attaque alternée, côté rendu seulement : la frappe à deux mains du
    Worker (les deux lames montent et retombent ensemble), puis le revers
    `attackB` de l'Infantry ;
  - limites : main gauche passive dans la garde et dans le revers ;
    acceptée pour le prototype (Antoine, 2026-11-01), à reprendre en
    polish.
- **Sources** : `data/units.ts` (`vengeur`), `render/toonUnitRig.ts`,
  `tools/toon-units/units.json` (`offhand_weapon`, `extra_animations`).

### B10 — Ordre de déplacement prioritaire sur l'attaque de base, élan opt-in

- **Statut** : Active (règle). Ouverte : donner un élan aux unités
  existantes.
- **Contexte** : une attaque de base était résolue dès son premier pas
  (dégâts, raté, esquive), puis l'animation se jouait après coup. La flèche
  visible de l'Archer partait environ 1,2 s après ses dégâts. Il n'existait
  aucune phase « avant impact » à annuler.
- **Décision** (Antoine, 2026-11-01, option « élan opt-in ») :
  - nouvelle stat `attackWindup` (0 par défaut) : le coup est résolu à la
    fin de l'élan. Un ordre de déplacement pendant l'élan l'annule sans
    dégât ni tirage et rend la recharge. Une cible sortie du contact de plus
    de 0,2 case à la fin de l'élan fait rater le coup (sans tirage).
    Activée seulement pour le Piquier et le Vengeur, calée sur l'impact de
    leur clip ;
  - toutes les unités : sous un ordre de déplacement, l'animation d'attaque
    est coupée net et la flèche visuelle en attente d'un Archer est
    supprimée. Les dégâts déjà validés restent ;
  - sorts, soin de l'Oracle et Provocation ne sont pas concernés.
- **Aujourd'hui** : les batailles sans Piquier ni Vengeur sont identiques à
  avant la règle (vérifié par instantanés à graine fixe).
- **Sources** : `sim/systems/combat.ts`, `render/unitViews.ts`, `main.ts`,
  `CURRENT_STATE.md` §2 et §3.

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
- **Aujourd'hui** : Mine : 3 à 7 or toutes les 60 s de simulation au niveau
  1 (Survie en temps réel, G11), +2 / +2 par niveau, sans plafond ; Caserne et Camp
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
  - **départ** : 20 or, **3 Hommes d'armes** (unité `fantassin` renommée à
    l'affichage, 2026-11-01 ; 4 Fantassins avant) de niveau 1, population maximale
    **5** (`PLAYER_BASE_POPULATION`), aucun bâtiment. La run commence donc à
    **4 / 5** (2026-11-01 : 3 / 5 avec 3 Hommes d'armes et le Héros, puis
    0 / 5 avec le Héros seul et la Baliste, G6) ;
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
    maximum, sans PV ni autre bonus. Depuis le 2026-11-01 (B8) : Piquier au
    Niv. 1 (1 Piquier produit), Fantassin au Niv. 2 (1 Piquier et 1
    Fantassin produits) ;
  - **Camp d'archerie** : mêmes règles pour l'Archer (15 or, 3 × 3, 1 puis
    2 Archers par manche, amélioration 20 or, Niv. 2 maximum) ;
  - **production** : une fois par manche, au début de la bataille, sans
    minuteur. Le quota est limité par la population et les cases libres ;
    un **lot partiel est volontaire** (une place pour un quota de 2 →
    1 unité produite, l'autre attend et sort si une place se libère pendant
    la bataille). Le quota restant est perdu à la fin de la bataille, sans
    report ;
  - **Église** : 35 or ; elle débloque désormais le recrutement du Mage,
    en plus de son soin et de ses améliorations (et ceux de l'Oracle et du
    Vengeur depuis le 2026-11-01, B7 et B9). Depuis le 2026-11-01, la
    Caserne débloque le Piquier, et le Fantassin seulement au Niv. 2 (B8,
    PROVISOIRE).
- **Raison connue** :
  - le départ à 4 / 5 force un choix immédiat : Maison + Caserne ou Maison
    + Camp d'archerie (20 or ; 16 et 14 bois depuis G5, à ramasser et
    déposer d'abord depuis G6 / G7). Caserne + Camp d'archerie (30 or) est
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

- **Statut** : Active (mécanique). Ouverte : le coût par case.
- **2026-11-01 — unité canonique d'une case** (demande d'Antoine, migration
  choisie par lui) : **1 segment logique = 1 case** (données, PV, pose,
  sauvegarde, sélection, destruction) ; 25 PV et 0,5 or par case (même
  densité, même prix) ; la **porte** reste une pièce de 2 cases posée sur
  deux cases de mur alignées ; le rendu apparie deux cases voisines d'une
  ligne avec le modèle long natif ; les anciennes cartes sont migrées au
  chargement. Les points ci-dessous qui parlent de segments 2 × 1 et de
  demi-segments sont historiques.
- **Décision** (demande d'Antoine, choix tranchés avec lui) :
  - murailles KayKit du dossier « neutral » = constructions du **joueur**
    (visuel non teinté), 50 PV, rôle unique : bloquer le déplacement ;
  - segment droit **2 × 1** à l'échelle native (historique, voir ci-dessus), pose par **tracé continu**
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
  - **reprise** d'une extrémité existante (préparation et éditeur) :
    connecteurs dérivés des pièces posées (aucun champ de sauvegarde), même
    découpage qu'un tracé en une fois, coût net, PV en pourcentage
    conservés ; pas de jonction en T ; une porte n'est jamais recomposée ;
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

- **Statut** : Remplacée pour les décors par E8 (plus aucun décor ne
  bloque) ; Active pour l'emprise rectangulaire des obstacles qui bloquent
  encore (« Obstacles / structures »).
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
  étape. Son rôle sur les runs longues reste ouvert. **Désactivé dans
  toute la Survie** depuis le passage en temps réel continu (choix
  d'Antoine, 2026-11-01, G6 puis G10), arène comprise (`?map=arena`) ; le
  code de `run/mapExpansion.ts` reste.
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

### E7 — Relief 2.5D : falaises infranchissables, pentes, combat 2D

- **Statut** : Active (prototype). Ouverte : avantage de hauteur, ligne de
  vue en 3D, usage sur la future grande carte circulaire.
- **Contexte** : préparer une grande carte circulaire avec du relief, sans
  toucher aux vagues, au combat ni à l'équilibrage.
- **Décision** (cahier des charges d'Antoine) :
  - une altitude par case (niveaux 0 à 2 au départ, 0 à 3 depuis le
    2026-10-29 ; un niveau = une demi-case), jamais
    d'empilement ; champ `elevationCells` optionnel et sparse, toute carte
    ancienne reste plate ;
  - falaise infranchissable entre deux niveaux, pente traversable d'un
    niveau au suivant dans les deux sens, quatre orientations ; pathfinding
    déterministe qui connaît les deux ;
  - **continuité dérivée des coins** (correction d'Antoine) : chaque case a
    une hauteur à ses coins NW, NE, SW, SE ; deux cases se raccordent si
    leur arête commune a les mêmes hauteurs aux deux extrémités, sinon c'est
    une falaise. Aucune règle propre aux côtés de pente : deux pentes
    parallèles forment une rampe large ; une diagonale n'est franchissable
    que si les quatre arêtes autour du coin se raccordent ;
  - **pas de corps à corps à travers une falaise**, même critère d'arête ;
  - bâtiments, murailles, portes et Baliste seulement sur une emprise plate
    à un seul niveau ; une portion de muraille ne change pas de niveau ;
  - **aucun avantage de hauteur** et **ligne de tir 2D** : le combat est
    inchangé, seule la trajectoire visuelle des projectiles suit le relief ;
  - pas de pont, d'escalier ni de chute ;
  - **pentes de coin** (demande d'Antoine, dessin de référence) : un coin
    haut, triangulation coin extérieur bas ↔ coin intérieur haut, hauteur
    gameplay calculée sur les mêmes triangles que le mesh ; premier outil :
    pinceau « Plateau niv.1 — 4×4 » (générateur générique, seul 4 × 4 / 0 → 1
    exposé ; depuis remplacé par Surélever / Abaisser) ;
  - **pinceau continu et autotiling** (demande d'Antoine, validés) : la
    forme est l'union des cœurs peints, le contour est re-tuilé par un
    autotiler unique fondé sur les hauteurs de coins ;
  - **UX de sculpture** (demande d'Antoine) : deux outils principaux,
    **+1 Surélever** / **−1 Abaisser** (une couche par trait, empilables
    trait après trait, 0 à 2 à l'époque), qui fabriquent eux-mêmes
    plateaux, pentes et coins ; Pente, Coin extérieur et Coin intérieur
    deviennent des ajustements secondaires (retirés depuis, voir
    2026-10-29 ci-dessous) ; Monter / Descendre retirés de l'interface ;
    un seul algorithme (`sculptRelief`) pour butte et creux ; une liaison
    diagonale bloquée par une case occupée refuse le tampon (plus de
    falaise silencieuse) ;
  - **coins intérieurs** NEi / NWi / SEi / SWi (un coin bas, validés par
    Antoine) : au creux d'une forme en L, la case de transition a 3 coins
    hauts, sans forme sans falaise parmi les autres types ; ~~posables aussi à
    la main (outils Coin extérieur / Coin intérieur)~~ (outils retirés, voir
    ci-dessous) ;
  - **Décidé** par Antoine (2026-10-29) : **quatre niveaux, 0 à 3**
    (`TERRAIN_LEVEL_MAX` = 3, pas inchangé : niveau 3 à y = 1,5), sans type
    spécial pour le niveau 3 ; **2026-11-01 : Monter une case, Descendre une
    case et Pente restaurés** (demande d'Antoine, en complément des pinceaux,
    sur le même modèle de cases et le même verrou, sans autotuilage) ;
    outils manuels **Pente**, **Coin extérieur**
    et **Coin intérieur** retirés de l'éditeur : l'autotiling de la
    sculpture est la seule façon de produire pentes et coins. Les formes
    (pentes cardinales, coins extérieurs et intérieurs) restent dans le
    moteur, et une ancienne carte qui en contient se charge à l'identique.
- **Validé provisoirement** : une « selle » (deux zones de plateau qui ne se
  touchent que par un coin) est comblée en plateau plutôt que d'ajouter un
  type ; la case comblée est signalée dans l'aperçu (orange).
- **Validé** par Antoine (coins manuels) : l'outil exige que les quatre
  arêtes se raccordent (pentes cardinales avant le coin) ; deux outils
  (Coin extérieur, Coin intérieur), déduction limitée à la famille choisie.
- **Décidé** par Antoine (sculpture) : +1 / −1 réellement réversibles et
  terrain canonique (il ne dépend que des hauteurs logiques, pas de
  l'historique) ; tailles 1×1 et 4×4 ; sculpture autorisée jusqu'au bord de
  carte, pinceau coupé à la carte, bord vertical accepté — **annule** la
  décision précédente « transition hors carte = tampon refusé » ;
  ~~propagation dans le sens du trait, +1 jusqu'au point haut d'une pente~~
  (passe précédente) : remplacés par les couches logiques par case.
- **Validé** par Antoine (sculpture) : hauteur logique **par case** (une
  couche par trait ; par sommet de grille, elle créait une arête de niveau 2
  à la jonction de deux traits voisins) ; géométrie entièrement dérivée des
  couches ; changement de côté d'une pente lors d'une canonicalisation,
  s'il est visible dans l'aperçu ; +1 au niveau 2 sans effet, puis −1 =
  descente normale ; **sculpter une zone ancienne la normalise** (une
  falaise ancienne touchée devient définitivement canonique) ; un **trou**
  n'est plus jamais bloquant : bord local, comme le bord de carte (face
  verticale, aucune transition ni donnée dans le trou, toujours
  infranchissable) — **annule** « transition touchant un trou = tampon
  refusé ».
- **Choix d'implémentation à valider** (sculpture) :
  - où vont les pentes (règle du rendu canonique) : une zone enclavée garde
    son plat, les pentes vont dans la zone qui l'entoure (profondeur depuis
    le bord ou un trou) ; à égalité, la plus haute garde son plat. Effets :
    rogner le bord d'un plateau (zone ouverte sur la plaine) met la pente
    dans la case rognée ; un creux qui finit par rejoindre la plaine, le
    bord ou un trou change de côté de pente sur tout son pourtour (visible
    dans l'aperçu) ;
  - donnée persistante minimale : `MapDef.reliefLogic`, seulement les cases
    dont la couche diffère de celle déduite du relief (niveau d'une case
    plate, bas d'une pente) ;
  - pendant un trait, le pinceau vise le terrain du début du trait ; dans
    le vide (hors carte, trou), il suit un plan de travail à la hauteur des
    cases voisines ; un pinceau entièrement dans le vide est
    neutre (ni aperçu, ni refus, ni entrée d'historique).
- **Choix d'implémentation à valider** (pris pendant le chantier) :
  - une case portant un objet (bâtiment, Baliste, obstacle / structure,
    unité) ne change pas d'altitude dans l'éditeur (règle recommandée par
    Antoine) ; depuis E8, un décor ne verrouille plus rien ;
  - ~~les côtés d'une pente sont des falaises sur toute leur longueur~~ :
    **annulé** par Antoine, remplacé par la continuité dérivée des coins ;
  - seuil de raccord physique `SLOPE_SIDE_BLOCK_THRESHOLD` (un quart de
    niveau, **validé provisoirement** par Antoine) :
    le mur de collision commence là où l'écart l'atteint (pas de mur
    invisible au pied d'un flanc de pente) ; le pathfinding bloque l'arête
    entière ;
  - corps à corps = portée d'attaque ≤ `MELEE_CONTACT_RANGE` (1,5 case,
    aucun champ dédié dans `data/units.ts`), via `isMeleeAttack` ; plateau
    sans rampe hors d'atteinte du corps à corps : **validé** par Antoine ;
  - ~~outil Pente : orientation déduite des voisins quand une seule
    convient~~ (outil retiré le 2026-10-29) ;
  - falaises sans épaisseur (segments) : une pente d'une case laisse passer
    exactement un Fantassin (rayon 0,5) ;
  - les plateaux sont éclaircis de 15 % par niveau pour rester lisibles vus
    du dessus ;
  - lisibilité sans grille : flancs (falaises, bord, trous) en terre sombre
    assombrie vers le pied, au lieu de l'herbe ; pentes voilées de 18 % à
    pleine inclinaison (sinon une pente face au soleil se confond avec un
    plat) ; éclairage de la scène inchangé ;
  - surfaces visuelles du sol séparées du relief (`render/groundSurfaces.ts`),
    choix automatique déterministe par case ; palette
    **classique** par défaut ; lot exploratoire de 10 textures générées
    (`tools/ground-textures/`) et palettes `variee`, `stylisee`, `pixel`,
    `catalogue` seulement pour comparaison (`?sol=`). **Ouvert** : textures
    et palette à garder (tranché pour la matière `living`, voir plus bas) ;
  - **peinture manuelle des surfaces** dans l'éditeur (2026-10-29, outil
    Surface) : donnée optionnelle et clairsemée (`MapDef.surfaceCells`,
    seulement les cases peintes, identifiants stables) ; la surface
    peinte prime, `?sol=` ne sert plus que de repli de debug sur les cases
    non peintes ; la peinture n'habille que le **dessus** des cases, les
    flancs gardent leur logique propre (une falaise ne change pas quand on
    peint le plateau) ; « Par défaut » = la surface d'origine du jeu, jamais
    écrite ; `terre-strates` seulement dans la section Expérimental (elle
    raye un dessus de case). Purement visuel, sans effet de jeu ;
  - **rendu du terrain** (2026-10-29, `?terrain=`) : « grille logique ≠
    silhouette visuelle », même carte et mêmes règles, seul le mesh affiché
    change. **Décidé** (Antoine) : `faceted-plus` (bords et trous facettés,
    jupe des vraies ruptures intérieures) est le rendu par défaut ; la jupe
    ne traite que les vraies ruptures verticales, les anneaux de pentes de
    la sculpture et les rampes restent fidèles ; `organic` (facettes sur les
    plats) abandonné, gain invisible à la caméra de jeu ; `grid` et
    `faceted` restent des témoins de comparaison et de debug.
    **Ouvert** : ombres portées du terrain (`faceted-plus-shadow`,
    expérimental, jamais par défaut), à juger sur une vraie carte chargée ;
  - **transitions entre surfaces** (2026-10-29, `?surfaceBlend=`) : rendu
    seulement, dérivé de `surfaceCells` (aucune donnée, outil Surface
    inchangé) ; **priorité visuelle** centralisée (`BLEND_PRIORITY`,
    `render/surfaceBlend.ts`) : terre au-dessus des herbes, herbes
    travaillées au-dessus de l'herbe par défaut, jamais l'ordre de peinture.
    **Décidé** (Antoine) : `irregular` (bord net, polygonal, sans
    transparence) est la transition par défaut ; `feather` (fondu) abandonné,
    trop flou pour la direction low-poly ; `hard` reste un témoin. Largeur
    visée d'un chemin 1×1 : environ 1,1 à 1,3 case (emprise logique encore
    crédible) ; une surface peinte jusqu'au bord ou jusqu'à un trou continue
    sur la lèvre facettée, la falaise garde le matériau de flanc ;
  - **matière du sol** (2026-10-30, `?groundLook=`, `?look=`) : rendu
    seulement, rien n'est enregistré. **Décidé** (Antoine) : `living` est la
    direction retenue — variation macro en coordonnées monde, seconde
    lecture de texture, Irregular, herbes unifiées (herbe classique ; dense
    et prairie claire sont des états de la même herbe), terre battue comme
    terre principale, accents matière, usure discrète au bord des chemins,
    palette Surface simplifiée aux vignettes calculées. Combinaison de
    référence : `?look=stylized&groundLook=living`, toujours par l'URL (le
    rendu sans paramètre n'a pas changé). Les paramètres de debug
    (`look=baseline`, `stylized`, `stylized-strong` ; `groundLook=baseline`,
    `layered`, `living`) restent tant que la direction artistique n'est pas
    terminée ; `groundLook=macro`, étape intermédiaire, existe encore (son
    retrait n'est pas décidé). Les anciens identifiants de surface, masqués
    dans la palette `living`, se chargent, se rendent et s'enregistrent sans
    migration ni changement de sens. **Règle artistique** : pas d'accents
    3D automatiques ; seulement quelques rochers KayKit posés à la main,
    rares, d'au moins 0,6 case environ ; fleurs, champignons, plantes
    Kenney, plantes aquatiques et cailloux Kenney ne sont pas utilisés pour
    l'instant. Points parqués : `ROADMAP.md` §7 ;
  - **habillage du relief** (2026-10-31, `?relief=`) : rendu seulement,
    dessus inchangés (sol logique exact), rien n'est enregistré.
    Direction provisoire (Antoine, 2026-10-31) : `hybrid` (collines et
    roche de `massif`, bords d'île de la profondeur de `roche`).
    **Ouvert** : ombres du relief activées ou non (`&reliefShadows=`) ;
    `roche` et `massif` restent en comparaison ; le rendu par défaut reste
    `baseline` tant qu'Antoine n'a pas validé ;
  - **catalogue élargi, richesse et lisières** (2026-10-31) : pavés, sable,
    sol rocheux, sol volcanique, lave et eau sont des surfaces comme les
    autres (rendu seulement, identifiants stables dans `surfaceCells`).
    **Règle maintenue** : une surface ne bloque rien, eau et lave comprises ;
    les rendre bloquantes changerait cette règle (cadrage : `ROADMAP.md`,
    surfaces bloquantes). Direction visuellement validée (Antoine,
    2026-10-31) : `look=stylized`, `groundLook=rich`, `surfaceBlend=lisiere`,
    `relief=hybrid` ; consolidée le même jour (biseaux low-poly, diagonales
    continues, alternance de deux tons, coût de l'éditeur). `lisiere` est retenue
    devant `melange` (qui reste un témoin). **Décidé** (Antoine,
    2026-11-02) : rendu **par défaut** `look=stylized`, `groundLook=rich`,
    `surfaceBlend=organic`, `relief=hybrid`, `surfaceBorder=marquee`
    (`main.ts`, `OFFICIAL_LOOK`) ; les paramètres restent des surcharges de
    laboratoire ; `hills=organic` reste expérimental, jamais par défaut.
    **En comparaison** (2026-10-31) : `surfaceBlend=organic` (mêmes
    frontières que `lisiere`, transition douce choisie par couple de
    matières) et `groundLook=organic` (`rich`, herbe un peu plus variée).
    **Ouvert** : les retenir à la place de `lisiere` et `rich` ;
    **en comparaison** (2026-10-31) avec `organic` : `surfaceBorder=subtile`
    ou `marquee` (bordure de contact : herbe plus sombre au bord des autres
    matières, liseré clair de l'eau, croûte de la lave ; jamais de trait).
    **Ouvert** : la retenir, et à quelle intensité ;
  - **éditeur** : le sol est découpé en morceaux pour qu'un coup de pinceau
    Surface ne reconstruise que la zone touchée ; organisation du rendu
    seulement, sans incidence sur la carte ni le jeu.
- **Conséquences acceptées** : une falaise n'arrête aucun tir ; un
  plateau sans rampe est hors d'atteinte du corps à corps (seuls les tirs
  l'atteignent).
- **Limites connues du prototype** : deux ordres de déplacement qui arrivent
  ensemble devant un passage d'une case (rampe d'une case, comme tout
  passage étroit) peuvent se bloquer, les ordres de déplacement n'ayant pas
  de manœuvre de dégagement (la poursuite en a une) — préférer des rampes
  de deux cases ; les disques d'effets au sol restent plats, à la hauteur
  de leur centre, et coupent le relief sur une pente ou au bord d'une
  falaise.
- **À ne pas faire** : ne pas faire lire la hauteur à `sim/` hors des
  obstacles de falaise ; ne pas ajouter de bonus de hauteur ni de ligne de
  vue 3D sans décision d'Antoine ; ne pas disperser automatiquement des
  accents 3D (plantes, rochers) sur le sol.
- **Sources** : `config/terrainElevation.ts`, `sim/world.ts`,
  `sim/pathfinding.ts`, `render/terrainSurface.ts`,
  `render/terrainCells.ts`, `render/groundLook.ts`, `EDITOR.md` §3,
  `CURRENT_STATE.md` §11.

---

### E8 — Décors purement visuels, traversables, adaptatifs au relief

- **Statut** : Active, sauf pour les **arbres** : leurs cases bloquent le
  passage depuis le 2026-11-02 (G11, demande d'Antoine).
- **Contexte** : des éléments posés pour embellir la carte (arbres,
  rochers, structures) créaient des obstacles invisibles, détournaient les
  unités et bloquaient l'édition du relief.
- **Décision** (Antoine, familles choisies par lui) :
  - « Décor » = purement visuel : jamais bloquant (passage, trajets, tirs,
    placement), il n'empêche pas d'éditer le relief et suit la hauteur du
    terrain à son point d'ancrage (pente comprise, sans inclinaison) ;
  - deviennent des décors : arbres et rochers, relief et forêts, structures
    décoratives, militaire (les buissons, fleurs et accessoires l'étaient
    déjà) ;
  - reclassés en « Obstacles / structures » (bloquants, verrou du relief) :
    angles de muraille décoratifs et clôtures
    (`BLOCKING_STRUCTURE_MODELS`).
- **Conséquences acceptées** : l'arène du Mode survie perd ses 24 arbres et
  7 rochers bloquants (passage, tirs, placement) — changement
  d'équilibrage ; un bâtiment ou une unité peut se poser sur un décor (le
  modèle peut alors traverser visuellement le bâtiment).
- **À ne pas faire** : ne pas redonner une collision à un décor ; un objet
  qui doit bloquer va dans « Obstacles / structures ». Ne pas enregistrer
  d'altitude de décor.
- **Sources** : `config/constants.ts` (`isBlockingMapObstacle`,
  `BLOCKING_STRUCTURE_MODELS`), `sim/world.ts`, `editor/editorState.ts`,
  `editor/editorUI.ts` (`OBSTACLE_CATALOG`), `EDITOR.md` §3 et §6.

### E9 — L'eau, surface infranchissable mais transparente aux tirs

- **Statut** : Active.
- **Contexte** : eau et lave étaient peignables mais franchissables
  (`KNOWN_ISSUES.md` KI-29) ; un lac se lisait comme un obstacle qui n'en
  était pas un.
- **Décision** (Antoine) : l'eau devient un obstacle de **déplacement**,
  sans être confondue avec un bâtiment ou un mur :
  - famille de surfaces `eau` extensible (`isWaterSurface`) ;
  - infranchissable pour toute unité sans `UnitStats.canTraverseWater`
    (faux par défaut pour toutes les unités actuelles) : trajets,
    destination d'un ordre, IA, apparitions ;
  - ne bloque **jamais** les tirs ni la ligne de vue ;
  - aucune unité, aucun bâtiment, aucune muraille, pas de Baliste sur
    l'eau (règles centrales de pose étendues).
- **Conséquence** : la règle « une surface ne bloque rien » (E7) a désormais
  une exception, l'eau ; la simulation lit les cases d'eau de la carte
  (`World.setMap`). La lave reste visuelle (ouverte, `ROADMAP.md` §7).
- **À ne pas faire** : ne pas rendre l'eau bloquante pour les tirs ; ne pas
  ajouter de variante d'eau hors de la famille `eau` (elle ne bloquerait
  pas).
- **Sources** : `config/groundSurfaces.ts`, `sim/world.ts`, `sim/geometry.ts`,
  `sim/orders.ts`, `main.ts` (`isValidPlacementTile`), `editor/editorState.ts`.

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

## G. Direction « Hero RTS Survival »

### G1 — Direction future : Héros, ressources physiques, économie RTS

- **Statut** : Ouverte (direction d'architecture). Une première fondation
  est construite (G4, G5) ; le reste demeure une direction.
- **Direction** (Antoine, 2026-11-01) : le joueur commencera probablement
  avec un **Héros**, quelques soldats et peu ou pas de base. Le Héros
  combat, explore, récupère des ressources, porte une grande part de la
  microgestion et permet l'expansion de la ville. Ressources envisagées :
  **bois, pierre, or**. À terme, économie plus classique de RTS : bâtiments,
  production, améliorations, ressources physiques.
- **Conséquences** : la Boutique actuelle n'est probablement **pas** le
  modèle final ; ne pas l'étendre d'une façon qui la rendrait difficile à
  remplacer.
- **À ne pas faire maintenant** : ne pas retirer la Boutique ; pas
  d'économie RTS complète, de multi-joueur ni de monde ouvert
  (`ROADMAP.md` §6 bis). Héros, bois et pierre : fondation provisoire
  depuis le 2026-11-01 (G4, G5).

### G2 — Camps : quatre couleurs joueur et un camp Neutre ; allégeance séparée de la faction visuelle

- **Statut** : Active (fondations).
- **Décision** (Antoine, 2026-11-01) : camps joueurs **Rouge, Bleu, Vert,
  Jaune** ; camp **Neutre** (occupants de la carte, camps PvE, unités à
  farmer, à terme ressources ou objectifs), couleurs **brun + gris**, jamais
  une couleur choisie par un joueur. L'**allégeance** (à qui appartient une
  unité) est séparée de la **faction visuelle** (famille d'assets : humains,
  barbares, plus tard squelettes, orcs...). Palettes centralisées
  (`config/factions.ts`).
- **Choix d'architecture** (option retenue par Antoine) : la simulation
  garde ses deux côtés (`player` / `enemy`) ; une couche d'allégeance les
  traduit (joueur = Bleu, côté adverse = Neutre). Aucune migration de carte
  ni de sauvegarde. Les GLB officiels pré-teintés restent bleu / rouge
  (`KNOWN_ISSUES.md` KI-31).
- **À ne pas faire** : ne pas lier « barbare » à un camp ou à une couleur.

### G3 — Unités neutres provisoires

- **Statut** : Active, **provisoire**.
- **Décision** (Antoine, 2026-11-01) : les cinq modèles barbares deviennent
  des unités **Neutres** aux noms de jeu propres : Maraudeur (Guerrier /
  Pillard), Ravageur (Berserker), Traqueur (Chasseur), Féticheur (Chaman),
  Colosse (Brute). Couche de nom affiché ; fichiers et identifiants des
  modèles inchangés. Stats, capacités et comportement : ceux du rôle habillé,
  provisoires. Toujours du camp Neutre dans l'éditeur (option retenue par
  Antoine), posables en territoire ennemi ou neutre.
- **Sources** : `data/units.ts` (`NEUTRAL_UNIT_IDS`), `render/unitMesh.ts`,
  `editor/editorState.ts` (`unitTeamAt`).

### G4 — Héros : fondation provisoire

- **Statut** : Active, **provisoire** (valeurs et visuel).
- **Décisions d'Antoine** (2026-11-01) :
  - départ **1 Héros + 3 Hommes d'armes** ; Héros très lisible, grand
    marteau, stats fortes ;
  - **XP en zone partagée, gardée sur la run** : toute unité adverse tuée
    près du Héros lui donne de l'XP, même tuée par un allié ;
  - **mort** : délai de retour pendant lequel le joueur ne peut plus
    l'utiliser, 15 s la première fois, 30 s la deuxième, 1 min la troisième,
    puis 1 min 30 au plus ; XP et niveaux gardés ; il revient à la Baliste ;
    **Héros et Baliste à terre = partie perdue**.
- **Choix provisoires** (non validés) : 30 PV, 2,5 dégâts, vitesse 2,6
  (portée à 4,16 le 2026-11-02, +60 %, demande d'Antoine ; bonus de niveau
  0,24 / 0,48) ;
  niveaux 2 et 3 à 50 et 150 XP ; XP = max(4, coût × 4) dans un rayon de
  6 cases, **plafonnée à 30 par mort** (demande d'Antoine, 2026-11-01) ; morts comptées **sur la run** (pas par bataille) ; Héros hors
  population, gratuit, invendable ; visuel Toon (tête E, corps D,
  épaulières B, marteau B ×1,6, échelle 1,3).
- **Sources** : `data/hero.ts`, `data/units.ts`, `sim/systems/hero.ts`,
  `sim/world.ts` (`spawnHero`, `isHeroDefeat`), `ui/heroHud.ts`.
- **À ne pas faire** : pas d'arbre de compétences ni de capacités du Héros
  dans cette fondation.

### G5 — Bois, pierre et chantiers bâtis par le Héros

- **Statut** : Active, **provisoire** (valeurs).
- **Décisions d'Antoine** (2026-11-01) :
  - **bois et pierre en plus de l'or** dans le prix des bâtiments ;
    murailles en pierre, case par case ; stock affiché, gardé sur la run,
    avec un stock de départ ;
  - **chantiers bâtis en bataille** : un bâtiment acheté en préparation est
    posé en chantier non fonctionnel ; en bataille, le Héros le construit
    (clic droit). Sans Héros vivant, rien ne se construit. Murailles
    incluses, case par case. La Boutique est conservée.
- **Choix provisoires** : coûts et durées (`CURRENT_STATE.md` §6 bis),
  chantier à 25 % de PV, enchaînement à 3 cases. **Remplacé par G6 / G7**
  (2026-11-01) : départ 0 / 0, petits tas finis, transport et dépôt à la
  Baliste ; arbres et rochers verrouillés.
- **Sources** : `config/resourceNodes.ts`, `data/buildings.ts`,
  `run/runState.ts`, `main.ts` (paiement, clic droit), `sim/orders.ts`
  (ordres `harvest` et `build`).
- **Ouvert** : épuisement des sources, transport et porteurs, ouvriers,
  récolte hors bataille (`ROADMAP.md` §6 bis).

### G6 — Départ Héros + Baliste, carte procédurale, brouillard de guerre

- **Statut** : Active, **provisoire** (valeurs).
- **Demande d'Antoine** (2026-11-01) : départ avec **1 Héros et 1 Baliste**
  seulement, stock 0 / 0 pour forcer l'exploration ; grande carte de Survie
  **procédurale**, ronde, déterministe par graine, camp au centre, monde de
  plus en plus sauvage ; **brouillard de guerre** à trois états, Héros à
  +50 % de vision d'une unité.
- **Choix d'Antoine** (questions de la passe) : vagues sur un **anneau
  proche dont la direction tourne** à chaque vague ; **E4 désactivé** sur la
  carte procédurale (il reste sur l'arène) ; exploration et ramassage
  **pendant la bataille** (la boucle des manches ne change pas).
- **Choix provisoires** : 96 × 96, centre de 11 cases, territoire de 8, anneau
  à 22 cases, vision 6 / 8 / 9 (unité / Baliste / Héros ; Baliste et Tour
  36 depuis G11), une graine par run.
  Le brouillard est un système de présentation : la simulation ne le lit
  pas. Depuis G10, la simulation a sa propre **vision gameplay**
  (`sim/vision.ts`, mêmes rayons, positions simulées) pour le tir
  automatique de la Baliste.
- **Sources** : `config/maps/proceduralSurvival.ts`, `render/fogOfWar.ts`,
  `main.ts`.

### G7 — Transport et dépôt ; récolte avancée verrouillée

- **Statut** : Active, **provisoire** (valeurs). Remplace la récolte directe
  de G5 (arbres et rochers inépuisables, crédit immédiat au stock).
- **Demande d'Antoine** (2026-11-01) : au début, le Héros ne ramasse que de
  **petits tas** de planches et de cailloux, finis ; il les **porte** et les
  **dépose à la Baliste** ; seul le dépôt remplit le stock, et seul le stock
  déposé paie les chantiers. Couper les arbres et exploiter les gros
  gisements reste **verrouillé** (`canHarvestTrees`, `canMineDeposits`),
  pour une future **Scierie** et un futur **Camp de mineur**.
- **Choix provisoires** : sac de 6 unités, ramassage 0,6 s, dépôt de tout le
  sac d'un coup, sac gardé à la mort ; crochet `BuildingDef.unlocksHarvest`
  lu par `run/harvestPermissions.ts`, transmis résolu à la simulation
  (`World.harvestPermissions`) ; dépôt = `BuildingDef.resourceDepot` (la
  Baliste).
- **À ne pas faire** : ne pas créer l'économie de la Scierie ni du Camp de
  mineur sans décision (`ROADMAP.md` §6 bis).

### G8 — Cavaleries légères (humaine et barbare)

- **Statut** : Active, **provisoire** (stats non imposées, place dans le jeu).
- **Demande d'Antoine** (2026-11-01) : un **Cavalier léger** humain et une
  **cavalerie légère barbare**, deux unités réellement distinctes (pas un
  habillage) : 15 or, 18 PV, 3 dégâts imposés ; pas de bonus contre un type
  d'unité. Choix de la passe : **bestiaire et éditeur seulement** (ni
  recrutement ni vagues).
- **Choix provisoires** : nom « Razzieur » pour la cavalerie barbare ; portée
  1,2, cadence 1,3 s, vitesse 3,6, rayon 0,7, 10 % de raté, population 2 ;
  modèles « Light B » (lance, petit bouclier) en « single mesh » (le FBX
  modulaire de cavalerie ne s'importe pas dans Blender, KI-36).
- **Sources** : `data/units.ts`, `render/toonUnitRig.ts`,
  `tools/toon-units/units.json`.

### G9 — Orientation des unités et caméra Espace

- **Statut** : Active.
- **Demande d'Antoine** (2026-11-01) : plus de marche à reculons — une unité
  regarde dans le sens de son déplacement, garde ce cap à l'arrêt, se tourne
  vers sa cible en attaque, reste figée à la mort. **Espace** bascule entre
  le Héros (sélection, centrage, suivi) et la Baliste.
- **Choix de la passe** : virage progressif (10 rad/s) ; un déplacement
  manuel de la caméra lâche le suivi, et le prochain Espace ramène au Héros
  (comportement à valider par Antoine).
- **Sources** : `render/unitViews.ts` (`renderedFacing`), `main.ts`
  (`toggleHeroCamera`, `updateHeroCameraLock`).

### G10 — Survie en temps réel continu

- **Statut** : Active ; valeurs **provisoires**.
- **Décision d'Antoine** (2026-11-01) : la direction est définitivement un
  Hero RTS Survival en **temps réel continu** : plus de boucle préparation →
  bataille → préparation ; explorer, récolter, construire, produire,
  combattre et améliorer sans changement de phase. Les vagues restent, comme
  **événements** dans le temps.
- **Choix d'Antoine** (questions de la passe) : première vague à **120 s**,
  puis **90 s** après chaque vague ; **tout en temps réel**, quelle que soit
  la carte (E4 désactivé partout en Survie) ; améliorations, Forge et Église
  **sur la fiche, en direct** (écran Forge / Église = jeu en pause) ;
  **murailles reportées**.
- **Règles de la passe** : construction = commandes du Héros (fiche),
  chantier payé et créé en direct ; production = commandes du bâtiment
  (fiche), une à la fois, durée par unité (`data/production.ts`) ; la
  Boutique globale est legacy et masquée en Survie ; la Baliste n'acquiert
  que des cibles vues (vision gameplay déterministe, `sim/vision.ts`).
- **À ne pas faire** : ne pas réintroduire de phase de préparation en
  Survie ; ne pas faire dépendre la simulation du brouillard du rendu.
- **Sources** : `main.ts`, `data/production.ts`, `sim/vision.ts`,
  `sim/systems/buildingProduction.ts` (`tickProductionOrders`).

## H. Outils internes

### H1 — Atelier de personnage : outil interne, export vers `units.json`

- **Statut** : Active.
- **Contexte** : composer une unité Toon RTS demandait d'écrire des noms de
  pièces dans `units.json` à l'aveugle, puis de relancer Blender pour voir
  le résultat.
- **Décision** (demande d'Antoine, 2026-11-01) : un écran dédié, ouvert
  depuis le menu principal (pas l'éditeur de maps) :
  - aperçu 3D, pièces par emplacement, mains totalement libres avec
    échelle, rotation et décalage, couleurs, échelle, animations et
    presets ;
  - export d'une entrée `units.json` que le pipeline construit tel quel ;
  - pas d'éditeur d'items.
- **Choix de la passe** :
  - le catalogue est **produit par le pipeline** (`--atelier`) et lu par
    l'Atelier, sans liste en dur : une nouvelle source se déclare dans
    `units.json` (`atelier_animations`) ;
  - le format `pieces.hands` (une pièce, une échelle, une rotation et un
    décalage par main) généralise `weapon` / `offhand` /
    `offhand_weapon`. Les anciennes entrées restent valides et sont lues
    par l'Atelier ;
  - l'aperçu reproduit le calcul du pipeline (miroir des mains, ajustement
    autour de la prise) : même géométrie au repos, vérifiée.
- **Suite (demande d'Antoine, 2026-11-01)** : source **All** et échelle par
  pièce.
  - Une pièce connaît sa source. Le format de `units.json` est étendu sur
    place : un nom reste un nom (source de l'unité, échelle 1), sinon
    `{"piece", "source", "scale"}`. Il n'y a pas de structure parallèle.
  - Mélange libre des packs : un matériau par source, sans fusion d'atlas.
    La fidélité aperçu = Blender passe avant `1 maillage / 1 matériau`.
  - Échelle d'une pièce skinnée autour de ses articulations (moyenne
    pondérée par les poids) : os, poids et clips inchangés, correcte dans
    toutes les poses. Elle ne rallonge pas le squelette.
- **À ne pas faire** :
  - ne pas faire dépendre une run de l'Atelier ou de ses catalogues ;
  - ne pas présenter le mélange de couleurs comme une seconde zone (KI-37).
- **Sources** : `src/workshop/`, `tools/toon-units/build_toon_unit.py`
  (`build_atelier`, `hand_piece`), CURRENT_STATE.md §16 bis.

---

### G11 — Arbres bloquants, ressources rares, vagues reliées au camp, Mine toutes les 60 s

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02, passe Hero RTS) :
  - **arbres** : la case d'un arbre bloque les unités terrestres (Héros,
    infanterie, cavalerie, neutres), sans changer encore les futures unités
    spéciales ; les bosquets bloquent toutes leurs cases. Remplace E8 pour
    les arbres ;
  - **générateur** : forêts en massifs séparés par sentiers, clairières et
    passages, jamais de mur infranchissable ; connexité contrôlée avec
    l'eau, le relief et les arbres ;
  - **vagues** : apparition seulement sur une route vers le camp (sinon un
    autre point), recalcul propre si la route devient invalide, diagnostic
    si une unité n'a vraiment aucun chemin ; jamais de suppression
    automatique d'un ennemi ;
  - **ressources** : petits tas environ trois fois plus rares, garantie de
    départ raisonnable, scintillement discret selon le brouillard,
    indicateur au clic ;
  - **vision** : Baliste environ 36 cases, Tour une grande vision ; portées
    d'attaque inchangées (ramenées à 18 / 18 par G12) ;
  - **Mine** : une tranche toutes les 60 s de simulation, sans plafond
    (l'ancien quota par manche venait du jeu en manches) ;
  - **sac** du Héros sur le dos, **fond** noir.
- **Choix de la passe** :
  - arbres : obstacles de **déplacement** (comme l'eau), pas de tir ; la
    pose y est refusée depuis la passe corrective ;
  - Tour terminée : même rayon que la Baliste (36), lecture de « la même
    chose pour la Tour » ;
  - ennemi sans cible : marche vers la Baliste par A* sur le terrain
    (bâtiments exclus), au lieu de la marche « vers +z » du jeu en couloirs,
    cause des vagues qui ne finissaient pas ;
  - garantie de départ : au moins 10 bois et 6 pierres à 9–18 cases ;
  - passe corrective (2026-11-02) : rampes de 3 cases (KI-39), 34 à 36 tas
    (au moins trois fois plus rares), et une case d'arbre refuse aussi toute
    pose (bâtiment, chantier, muraille, Baliste, unité) ;
  - forêt : goulet d'une case comblé dans une forêt, élargi ailleurs ;
    poche isolée de moins de 8 cases comblée, sinon couloir de 2 cases.
- **Effets d'équilibrage à surveiller** : la Mine rapporte bien moins
  qu'avant (3 à 7 or par minute contre jusqu'à 35 or par vague) ; une vision
  de 36 cases découvre l'essentiel de la carte dès le lancement, ce qui
  réduit l'exploration voulue par la rareté des tas.
- **À ne pas faire** : ne pas supprimer un ennemi bloqué pour finir une
  vague ; ne pas redonner aux ennemis la marche vers +z en Survie.
- **Sources** : `sim/world.ts` (`computeTreeObstacles`, `assaultGoal`),
  `sim/systems/movement.ts` (`marchToGoal`), `sim/pathfinding.ts`,
  `sim/systems/enemyReinforcements.ts`, `config/maps/proceduralSurvival.ts`,
  `data/vision.ts`, `data/mineUpgrade.ts`, `render/resourcePiles.ts`.

### G12 — Choix du Héros, mana et Soin, HUD du Héros, construction libre

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02, passe « UX du Héros ») :
  - écran « Choisir votre Héros » avant la Survie, un seul choix (Paladin,
    le Héros actuel), structure prête pour plusieurs héros (id, nom,
    portrait, modèle, stats, mana, sorts, équipement de départ) ;
  - **mana** pour les héros seulement : Paladin 100 max, 100 au départ,
    +2 / s, dans la simulation déterministe, figé en pause ;
  - sort **Soin** : 2 s d'incantation, +5 PV, portée environ 5 cases, sur
    soi ou un allié ; un ordre de déplacement pendant l'incantation
    l'annule sans effet ; préférence : mana rendu ;
  - **HUD** permanent en haut à droite (portrait rond gris, PV vert, mana
    bleu, rien d'autre), barre d'XP violette fine tout en bas ; retirer
    « Auto Baliste prête » et les 6 emplacements d'inventaire ;
  - bouton **Construire** à la place de Boutique / Vendre, petit panneau de
    bâtiments, même pose qu'avant ;
  - **construction** n'importe où sur une case valide (plus de territoire) ;
    zones bleues / rouges retirées, camps gardés ;
  - **vision** Baliste 18, Tour 18 ; disque **exploré** d'environ 22 cases
    au départ ;
  - tas plus gros (bois +40 %, pierre +60 %), sélectionnables (anneau
    jaune), pulse au ramassage, éclats refaits ; légère baisse de lumière.
- **Choix de la passe** :
  - coût du Soin : **20 mana** (proposé, accepté par la demande) ;
  - mana **retenu au début** de l'incantation, **rendu** à toute annulation
    avant l'effet : tout nouvel ordre accepté (même un nouveau Soin, qui
    repart de zéro), mort, Provocation, cible morte, cible à plus de
    5 + 1 cases à la fin (soin perdu) ;
  - le Héros s'approche à 5 cases puis incante **sur place** ; les dégâts
    reçus n'interrompent pas ;
  - mana **plein** au retour après une mort (comme les PV) ;
  - le Soin réutilise l'incantation de l'Oracle (`Entity.cast`,
    `abilitySystem`) ; l'annulation est vérifiée juste après les commandes,
    **avant** `abilitySystem` (aucun soin fantôme possible) ;
  - pas de clip d'incantation dans le GLB du Héros : garde de combat
    parcourue pendant les 2 s, cercle runique au sol ;
  - pose de bâtiment : refus hors carte, eau, arbre, obstacle bloquant,
    bâtiment / chantier, unité, sol non plat ; le territoire ne sert plus
    qu'au placement des unités en préparation (legacy) ;
  - impulsion au sol du clic de ramassage remplacée par le pulse de
    l'anneau jaune ;
  - lumière : un facteur unique 0,92 sur les trois lumières ;
  - suites de la même passe (demandes d'Antoine) : Héros sans fiche à sa
    sélection, **inventaire** (touche I) pour ses statistiques, ses sorts
    et son futur équipement ; **barre d'action** 1 à 6 en bas à gauche
    (sorts du Héros, Soin en 1, mêmes touches que l'ancien inventaire) ;
    anneau jaune et pulse sur le dépôt ; éclats plus gros, plus fréquents,
    répartis sur le tas ; sac +25 % ; vitesse du Héros +60 % ;
  - choix de la passe : le bouton Soin quitte l'encart du Héros pour la
    barre d'action ; l'inventaire ne met pas le jeu en pause ;
  - ensuite (demandes d'Antoine) : modèle du Héros composé dans l'Atelier
    (pièces barbares, marteau barbare ×1,4 ; hache, pioche et gestes de
    travail gardés) ; essai du clip `charge` pour son déplacement ;
    **mana 20 au niveau 1**, **Soin 12 mana**, icône propre au Paladin ;
    barre de progression de l'action au-dessus de l'XP ; **dépôt 0,5 s par
    unité** (unité par unité, interruptible) ;
  - choix : un nouveau sort pendant une incantation compte le mana qui va
    être rendu (sinon le premier sort continuait faute de mana) ; l'échelle
    1,4 du bloc `atelier` reste un réglage d'aperçu (le jeu garde 1,3).
- **Effets d'équilibrage et de ressenti à surveiller** : le Soin rend le
  Héros plus durable : avec 20 mana et un Soin à 12, un Soin d'avance puis
  un toutes les 6 s (+2 / s) ; le dépôt de 3 s par sac ralentit l'économie ; la construction
  libre permet des tours avancées loin du camp ; la vision 18 (contre 36)
  rend l'exploration plus nécessaire.
- **Ouvert** : mana des niveaux 2 et 3 (inchangé pour l'instant).
- **Sources** : `data/heroes.ts`, `data/spells.ts`, `data/vision.ts`,
  `sim/systems/hero.ts` (`interruptHeroSpells`, `heroSpellSystem`),
  `sim/orders.ts` (ordre `cast`), `ui/heroSelect.ts`, `ui/heroHud.ts`,
  `ui/buildMenu.ts`, `render/spellCastVfx.ts`, `render/resourcePiles.ts`,
  `render/renderer.ts` (`LIGHT_LEVEL`), `main.ts`.

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
