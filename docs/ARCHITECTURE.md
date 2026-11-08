# Architecture d'Arrow Tactics

Ce document décrit comment le code d'Arrow Tactics est organisé **aujourd'hui**.
Il a été vérifié contre le code de la branche `reprise-2026`. Le code reste la
source de vérité : en cas de doute, vérifier dans les fichiers cités.

Il ne couvre ni l'équilibrage, ni les intentions de game design, ni les
décisions futures (voir les autres documents de `docs/`).

## Sommaire

1. Vue d'ensemble et dépôt
2. Couches et règles de dépendance
3. Boucle de jeu et pas fixe
4. Le monde de simulation (`World`)
5. Entités : unités et bâtiments
6. Ciblage, déplacement, collisions, pathfinding
7. Combat, capacités et dégâts
8. Circulation des événements simulation → rendu/UI
9. Système BUILDING
10. État de run, méta-progression, réglages
11. Rendu
12. UI HTML
13. Éditeur de maps
13 bis. Atelier de personnage
14. Audio
15. Points chauds techniques
16. Pièges techniques confirmés
17. Vérifier une modification

---

## 1. Vue d'ensemble et dépôt

Le dépôt a deux niveaux :

```
<racine git>/
  CLAUDE.md, docs/, .claude/
  arrow-tactics/            ← projet npm
    package.json, index.html, vite.config.ts, tsconfig.json
    src/                    ← tout le code du jeu
    public/                 ← assets statiques (models/, textures/)
```

- Toutes les commandes npm se lancent depuis `arrow-tactics/`.
- Stack : **Three.js**, **TypeScript** (mode strict, `noUncheckedIndexedAccess`),
  **Vite**. Playwright est présent en devDependency. Les versions exactes sont
  dans `arrow-tactics/package.json`.
- Scripts : `dev` (serveur Vite), `build` (`tsc --noEmit && vite build`),
  `preview`. Il n'y a **pas** de script de test.
- Point d'entrée : `src/main.ts`, chargé par `index.html`.

## 2. Couches et règles de dépendance

| Dossier | Rôle |
|---|---|
| `core/` | Boucle à pas fixe, petites maths, RNG à graine, calcul pur du déplacement d'unités sur la grille (`gridGroupMove.ts`), géométrie pure des murs V2 (`wallLine.ts` : découpage A → B, capsules, cases A*, aimantation, vérification de pose) |
| `config/` | Constantes de réglage, types `ObstacleDef`, format de map `MapDef`, territoire par cases (`territory.ts`), arène du Mode survie (`maps/survivalArena.ts`) |
| `data/` | Définitions déclaratives : unités, bâtiments, objets, talents, capacités, upgrades (avec quelques lookups et calculs purs) |
| `sim/` | Simulation de bataille |
| `run/` | État d'une run, méta-progression, réglages, calcul des effets de talents/upgrades, statistiques effectives du joueur (`playerUnitStats.ts`, `ballistaStats.ts`), adaptateur de la fiche d'entité (`entityInfo.ts`), expansion de map |
| `render/` | Tout ce qui touche à Three.js : caméra, plateau, silhouettes, VFX |
| `ui/` | Overlays HTML/CSS par-dessus le canvas |
| `editor/` | Éditeur de maps (état, scène, UI, historique, sérialisation) |
| `workshop/` | Atelier de personnage : outil interne de composition des unités Toon RTS (§13 bis) |
| `audio/` | Moteur audio procédural (actuellement déconnecté, voir §14) |
| `main.ts` | Orchestration : assemble toutes les couches |

Dépendances observées dans le code :

| Dossier | Importe |
|---|---|
| `core/` | `config` (constantes de la boucle) |
| `sim/` | `config`, `core`, `data` |
| `data/` | `config` |
| `run/` | `config`, `data`, types de `sim` |
| `render/` | `config`, `core` (petites maths), `data`, types de `sim` (plus `forwardDir` et `isCommandable`) |
| `ui/` | `config`, `core`, `data`, `run` (calculs d'affichage), `render`, types de `sim` |
| `editor/` | `config`, `data` (catalogue des unités), `render` (fabriques de meshes), types de `sim` |
| `workshop/` | `three` (et ses addons), `data/units` (noms des unités), `render/toonUnitRig` (matériau teinté, textures, presets fixes) |
| `audio/` | `run/userSettings` |
| `main.ts` | tout, dont `core/gridGroupMove.ts` pour le déplacement d'unités de l'éditeur, et `core/wallLine.ts` pour la pose des murs (jeu et éditeur) |

Règle forte, vérifiée : **`sim/` n'importe jamais `three`, `render/`, `ui/`,
`editor/` ni `audio/`**. Elle n'accède ni au DOM, ni à `localStorage`, ni à
`Math.random`. Il en va de même pour `config/` et `data/`. C'est ce qui rend la
simulation exécutable sans navigateur (scripts Node ponctuels).

## 3. Boucle de jeu et pas fixe

`core/loop.ts` implémente une boucle à accumulateur :

- `onStep(SIM_STEP)` est appelé 0 à 8 fois par frame (`SIM_STEP = 1/SIM_HZ`,
  30 Hz). Au-delà de 8 pas, l'accumulateur est remis à zéro pour éviter la
  « spirale de la mort ».
- `onRender(alpha)` est appelé une fois par frame, avec `alpha` = fraction
  du pas suivant, pour interpoler l'affichage.
- `realDelta` est plafonné par `MAX_FRAME_DELTA`.
- `timeScale` multiplie le temps accumulé : `0` = pause (aucun tick de
  simulation, le rendu continue), `2` = vitesse ×2.

Dans `main.ts` (`new Loop(...)`) :

- **`onStep(dt)`** : `world.step(dt)`, puis tir de la flèche : maintien de
  Q avec le talent Tir rapide en mode MANUEL (`attemptAutoFire`), tir du
  mode AUTO de la Baliste (`attemptBallistaAutoFire`, cible et point
  anticipé par `sim/ballistaAuto.ts`) ; les deux passent par le même
  `fireArrowIfReady` et la même recharge (`World.fireArrowVolley`). Puis
  lecture des événements du tick (§8).
- **`onRender(alpha)`** : synchronisation des vues avec la simulation
  (interpolation `prevX/prevZ → x/z`), animations et VFX en temps réel
  (`realDt`), puis `renderer.render()`.

Les minuteurs de **gameplay** vivent dans la simulation (temps simulé). Les
animations et VFX utilisent le temps réel. Une pause gèle donc le gameplay
sans figer l'affichage.

## 4. Le monde de simulation (`World`)

`sim/world.ts`, classe `World` :

- `entities` : toutes les entités de la bataille. Une entité n'est **jamais
  retirée** du tableau : à sa mort, `alive` passe à `false`. `getById(id)` est
  un lookup O(1) via un index alimenté au spawn.
- `obstacles`, `boardWidth`, `boardHeight` : la géométrie de la carte chargée.
- Une RNG à graine (`core/rng.ts`, `seed` exposée pour le debug).
- L'état persistant entre deux ticks : `blasts` (projectiles de zone),
  `playerArrow` (cooldown et vols de la flèche du joueur). Les zones
  persistantes (`iceNovaZones`) et les projectiles d'ombre
  (`shadowProjectiles`) ont été retirés le 2026-11-04 avec les parchemins
  de bataille (`DESIGN_DECISIONS.md` G40).

Ordre de `World.step(dt)` :

```
prevX/prevZ ← x/z
targetingSystem → abilitySystem → movementSystem → combatSystem
→ zones persistantes → flèche du joueur → projectiles d'ombre
→ buildingProductionSystem → deathSystem → libération des emprises de bâtiments morts
→ renforts ennemis (stepEnemyReinforcements)
tick++, time += dt
```

`abilitySystem` passe avant `movementSystem` : une ruée en cours contrôle seule
la position de son entité pendant le tick.

**`setMap(map)`** :

- ne garde que les objets de la carte qui bloquent (`isBlockingMapObstacle`,
  `config/constants.ts` : seuls les « Obstacles / structures » de
  `BLOCKING_STRUCTURE_MODELS`) ; tout décor est exclu de la simulation mais
  reste rendu, à la hauteur de la surface sous son point d'ancrage
  (`buildObstacleMesh`, jamais stockée). Les obstacles synthétiques ajoutés
  ensuite (trous, falaises, emprises de bâtiments et de la Baliste) bloquent
  toujours : les systèmes qui lisent `World.obstacles` ne filtrent plus rien ;
- dérive des dimensions symétriques à partir des cellules de terrain
  (`resolveMapCells`, `computeMapCellBounds`, `config/mapDef.ts`) ;
- transforme chaque cellule absente en obstacle « vide » synthétique. Un trou
  dans la carte bloque ainsi exactement comme un rocher, sans que mouvement,
  ligne de tir ou pathfinding connaissent la notion de cellule ;
- relief (`MapDef.elevationCells`, voir §6) : ajoute une **falaise** par arête
  infranchissable entre deux cases existantes (`computeCliffObstacles`,
  `config/terrainElevation.ts`). Carte plate : aucune falaise, liste
  d'obstacles identique à avant le relief.

**`clear(seed?)`** réinitialise l'état de bataille (entités, projectiles,
événements, temps, RNG). Il ne change pas la carte chargée.

**Déterminisme** : la simulation n'utilise que sa RNG à graine
(`core/rng.ts` ne tire au hasard que la graine). Une bataille est reproductible
à graine **et** entrées du joueur identiques. Les actions du joueur sont
injectées par `main.ts` entre deux ticks, et il n'existe pas de mécanisme
d'enregistrement ou de rejeu.

## 5. Entités : unités et bâtiments

Une seule forme, `Entity` (`sim/entity.ts`), sert aux unités **et** aux
bâtiments. Elle regroupe :

- position et position précédente (pour l'interpolation), PV, `alive` ;
- `stats` : copie modifiable de `UnitStats`, éventuellement patchée au spawn ;
- l'état de ciblage et de déplacement (cible, chemin, anti-blocage) ;
- les capacités (`abilityCooldowns`, `dash`, `cast`) et les statuts
  (`rootTimer`, `tauntTimer`, `shield`) ;
- les drapeaux de bâtiment (`isBuilding`, `countsForDefeat`,
  `footprintObstacle`, champs de production).

**`World.spawn(unitId, team, x, z, hp?, statOverrides?, abilityDamageBonus?, tauntShieldBonus?)`**
crée une unité depuis `data/units.ts`, avec `stats = { ...def.stats,
...statOverrides }`. Les bonus (talents, améliorations de Forge de la run,
renforcement des ennemis par vague) sont calculés hors de la simulation. Ils arrivent sous
forme de nombres finaux : la simulation ne sait jamais *pourquoi* une stat
diffère de la base.

- Pour une unité du joueur, ces trois paramètres viennent de
  `run/playerUnitStats.ts` (§10, `computePlayerUnitStats`), à chaque site
  d'apparition : lancement, « Tester le scénario », production des
  bâtiments ; et sont **réappliqués** aux unités présentes quand la
  progression de la run change (`World.applyUnitStats`, PV à la même
  fraction ; 2026-11-05).
- Pour un ennemi, `main.ts` les calcule à partir de
  `computeEnemyUnitUpgradeEffects` (`run/enemyWaveEffects.ts`).

Les capacités d'une unité sont lues à chaque tick via
`getUnit(e.unitId).abilities` (`sim/systems/abilities.ts`). Les bâtiments
sont explicitement exclus de cette boucle, puisque leur `unitId` n'existe pas
dans `data/units.ts`.

**`World.spawnBuilding(...)`** crée un bâtiment depuis une `BuildingDef` :
voir §9.

## 6. Ciblage, déplacement, collisions, pathfinding

- **Ciblage** (`sim/systems/targeting.ts`) :
  - une cible verrouillée est conservée tant qu'elle reste valide, et une
    provocation (`tauntTimer`) la force en priorité ;
  - balayage direct par camp, avec une grille spatiale (`sim/spatialGrid.ts`)
    au-delà d'un seuil d'entités vivantes ;
  - un bâtiment a une portée d'aggro nulle : ce système ne lui donne jamais
    de cible, mais il est ciblable. Les bâtiments défensifs (Tour) ont leur
    propre ciblage, voir §9.
- **Déplacement** (`sim/systems/movement.ts`) :
  - les bâtiments sont filtrés une seule fois en tête de système ;
  - pour une cible verrouillée : ligne directe si elle est dégagée, sinon un
    chemin A* en cache (recalculé si la cible change de case) ;
  - sans cible (« marche neutre ») : évitement local, avec un repli A* si la
    progression stagne ;
  - puis séparation entre corps (directe ou par grille), collision avec les
    obstacles (`resolveObstacleCollisions`) et limites du plateau ;
  - un `Root` bloque le mouvement, mais pas l'attaque.
  - un ordre `move` marqué `exact` (`sim/orders.ts`) arrive au point près :
    `followMoveOrder` pose l'unité sur sa destination quand le reste du
    trajet tient dans un sous-pas. Plus aucun appelant dans `main.ts` depuis
    le retrait du pas d'ouverture (2026-11-05, G41) ; primitive conservée.
- **Pathfinding** (`sim/pathfinding.ts`) : grille par case reconstruite à
  chaque appel du système de déplacement, A* en 8 directions sans couper les
  coins, et repli sur la case libre la plus proche si la case visée est
  bloquée. Le relief y ajoute des **arêtes bloquées** (`PathGrid.edges`, un
  masque de 4 bits par case) : un obstacle `terrainCliff` ne bloque aucune
  case, seulement le passage entre ses deux voisines ; une diagonale exige
  les quatre arêtes autour du coin franchi libres.
- **Relief 2.5D** (`config/terrainElevation.ts`, module pur partagé par
  `sim/`, `render/` et `editor/`) :
  - données : `MapDef.elevationCells`, liste **sparse** `{x, z, level,
    slope?}` (case absente = plate au niveau 0) ; niveaux 0 à
    `TERRAIN_LEVEL_MAX` (3, limite unique : sculpture, validation du
    chargement, plan de pointage), `TERRAIN_ELEVATION_STEP` = 0,5 case ; une pente
    monte de `level` à `level + 1` : cardinale (`slope` N / E / S / W, N = −Z)
    ou de **coin** (`slope` NE / NW / SE / SW : seul ce coin est haut) ;
    hauteurs des 4 coins (NW, NE, SW, SE) = `cornerHeightsOf`, seule source de
    vérité géométrique ;
  - triangulation (`cellTriangles`) : diagonale NE ↔ SW, sauf pente de coin
    haut NW / SE (NW ↔ SE), pour relier le coin extérieur bas au coin
    intérieur haut. `heightAt` interpole dans le triangle qui contient le
    point (`surfaceHeightInCell`), jamais en bilinéaire : la hauteur gameplay
    est exactement le mesh (vérifié par rayons verticaux, écart < 1e-15) ;
  - coins intérieurs (`slope` NEi / NWi / SEi / SWi : trois coins hauts, un
    seul bas, qui donne son nom) : nécessaires au creux d'un contour concave ;
    diagonale par le coin « différent », comme les coins extérieurs ;
  - `classifyCellFromCornerLevels` : forme d'une case d'après les niveaux de
    ses 4 coins (plate, cardinale, coin, coin intérieur, ou « selle ») —
    inverse exact de `cornerHeightsOf` sur les 12 formes ;
  - sculpture : source de vérité = **hauteur logique de chaque case**
    (`ReliefLogic`, en niveaux, 0 par défaut). `sculptRelief(ctx, painted,
    delta)` ajoute ou retire une couche aux cases peintes (une fois par
    trait, bornée 0..2, mesurée sur le début du trait) : ±1 est un inverse
    exact. La surface est le **rendu canonique** `renderReliefLogic(logic,
    cells)`, qui ne dépend que des couches et des cases existantes : (1)
    régions de même hauteur (4-connexité), profondeur depuis le vide (bord,
    trou) ; (2) chaque sommet prend la hauteur de la case la plus
    prioritaire qui le touche (profondeur, puis hauteur) — une région
    enclavée garde son plat, les transitions vont dans celle qui l'entoure,
    butte comme creux ; (3) écart de plus d'un niveau : les sommets les
    moins prioritaires sont rapprochés (deux anneaux) ; selle : la paire la
    moins prioritaire s'aligne (liaison diagonale). Le vide n'impose rien
    (face verticale au bord). Seules les cases dont le rendu change sont
    réécrites ; une case verrouillée rend `blocked` ; le vide (hors carte,
    trou) n'impose rien et ne reçoit jamais de donnée. Pur, déterministe ;
  - couches au chargement : `deriveReliefLogic(field, cells)` (niveau d'une
    case plate, bas d'une pente), corrigé par `MapDef.reliefLogic` (seules
    les cases dont la couche diffère de cette déduction — sous les pentes
    d'un creux, autour d'un sommet 2) ;
  - pinceau : `ReliefBrushSize` (1 ou 4), `reliefBrushOrigin`,
    `reliefBrushCore` (cœur logique : 1 case ou 2 × 2). Éditeur :
    `renderedRelief` (rendu en cache),
    `reliefStrokeStart`, `reliefBrushPlan` / `reliefBrushPlanAt` (cœur
    coupé aux cases de terrain existantes, aperçu, niveaux, refus, limites : source unique de
    l'aperçu et de la pose), `applyReliefCells`, `setReliefLogic`,
    `reliefLogicEntries` (export) ; les instantanés d'historique incluent
    les couches. Trait `ReliefStroke` dans `main.ts` (début figé, taille,
    tampons interpolés, tampon refusé ignoré, relief appliqué en direct,
    pointage sur le terrain de départ via `intersectTerrain(ray, target,
    field)`, une entrée d'historique au relâchement) ;
  - `TerrainHeightField` (`resolveMapHeightField(map)`, en cache par
    tableau) : hauteurs des 4 coins d'une case, `heightAt(x, z)` (linéaire
    sur une pente), `edgeMatches` (même hauteur aux deux extrémités de
    l'arête commune = passage à pied), `flatLevelOver` (emprise plate à un
    seul niveau) ;
  - simulation : la seule connaissance du relief est la liste de falaises
    injectée par `World.setMap`. Une falaise est une arête dont les profils
    ne se raccordent pas (`edgeProfile` / `edgeMatches` : hauteurs des deux
    cases aux deux extrémités de l'arête, dérivées des coins NW, NE, SW, SE ;
    aucune règle propre aux « côtés de pente » : plat ↔ plat, plat ↔ pente
    et pente ↔ pente suivent le même test, deux pentes parallèles se
    raccordent). Ce sont des obstacles **sans épaisseur** (`kind: 'rock'`,
    `terrainCliff: true`, `blocksShots: false`) posés sur la partie de
    l'arête où l'écart atteint `SLOPE_SIDE_BLOCK_THRESHOLD` (un quart de niveau :
    rien au pied d'un flanc de pente, où l'écart est nul), fusionnés par
    ligne : collision cercle / segment exacte (une pente d'une case garde
    toute sa largeur, soit le diamètre d'un Fantassin), trajets
    (`findBlockingObstacle`, contournement local, A* qui bloque l'arête
    entière), ruée de Charge. La **ligne de tir reste 2D** (falaise ignorée
    par `findBlockingObstacle(..., forShot)`), et aucun système de combat ne
    lit la hauteur ;
  - corps à corps (`isMeleeAttack`, seul point de décision : `attackRange` ≤
    `MELEE_CONTACT_RANGE`, 1,5 case, `config/constants.ts`) : `combatSystem` ne frappe jamais à travers une falaise
    (`crossesTerrainCliff`, mêmes segments) et `movementSystem`
    (`isEngaged`) ne considère pas une unité de corps à corps comme
    engagée dans ce cas : elle continue de chercher une rampe ;
  - ligne droite ou A* (`followMoveOrder`, `pursueTargetWithPathfinding`) :
    pour les falaises seulement, le test tient compte du **corps**
    (`bodyPathNearTerrainCliff`, rayon moins 0,05) : une ligne entre centres
    qui frôle le bout d'un mur de flanc passe par l'A* (centres de case)
    au lieu de buter dessus. Une unité au contact d'une autre au début du
    tick (`touchingEntityIds`) garde le test entre centres, comme avant le
    relief : sinon deux unités côte à côte devant une rampe d'une case
    visent le même point de passage et se bloquent ;
  - production (`buildingProduction.ts`) : une case libre séparée de
    l'emprise par une falaise n'est jamais choisie ;
  - la simulation reste en 2D (x, z) : la hauteur d'une unité n'existe que
    dans le rendu.
- **Géométrie** (`sim/geometry.ts`) :
  - `obstacleBounds` (`config/constants.ts`) donne le rectangle exact d'un
    obstacle. Cette fonction pure vit dans `config/`, à côté
    d'`obstacleCenter`, parce qu'elle est partagée par la simulation,
    l'éditeur (validation de la Baliste) et `main.ts`. L'éditeur ne dépend
    donc toujours de `sim/` que pour des types ;
  - `obstacleCenter` (`config/constants.ts`) préfère la position libre
    `x`/`z` à l'ancien coin de grille `cornerX`/`cornerZ` ;
  - `findBlockingObstacle` teste la ligne de tir (méthode des tranches), avec
    un paramètre `ignore` pour exclure l'emprise de la cible elle-même.

### Arbres bloquants, marche des vagues (2026-11-02)

- `World.setMap` ajoute un obstacle synthétique `terrainResource` (ex-
  `terrainTree`, 2026-11-03 : arbres ET gros gisements de pierre et d'or)
  par rangée de cases de source (`config/resourceNodes.ts`,
  `resourceNodeCellKeys` / `resourceNodeCells` : cases dont le centre est
  dans l'emprise ; `World.resourceCells` = sources debout) :
  collision et trajets, jamais les tirs. La même règle refuse la pose
  (`main.ts`, `buildingPlacementWorld`). Vide hors carte, eau et arbres
  passent par une seule fusion par rangée (`rowSpanObstacles`, KI-40).
- `sim/pathfinding.ts` : A* à tas binaire (même ordre que l'ancien tableau
  trié : f puis rang d'insertion, chemins identiques, mesuré), grilles en
  cache par référence de tableau d'obstacles (`cachedPathGrid`),
  accessibilité par inondation (`reachableTiles`).
- `World.assaultGoal` (posé par `main.ts` en Survie : la Baliste) : un
  ennemi en assaut sans cible marche vers ce point
  (`sim/systems/movement.ts`, `marchToGoal`) sur le terrain seul
  (`terrainObstacles` : sans emprises de bâtiments). Un chemin en cache est
  recalculé dès qu'une de ses cases devient bloquée ; la tolérance d'un
  point de cheminement grandit avec le rayon au-delà de 0,5.
- Renforts (`sim/systems/enemyReinforcements.ts`) : seules les cases reliées
  au but comptent ; zones de repli fournies par `main.ts`
  (`ringSpawnSectors`). Diagnostics du pas : `World.pathFailures`,
  `World.blockedReinforcementGroup`, écrits en console par `main.ts`.
- Générateur (`config/maps/proceduralSurvival.ts`, `shapeForests`) :
  goulets, poches et couloirs sur une grille typée, règles de pas
  (eau, colline, rampe) propres au générateur ; la connexité réelle est
  vérifiée en test avec la grille de la simulation.

### Héros : mana et sorts (2026-11-02)

- Données : `data/heroes.ts` (`HeroDef` : unité, modèle et portrait, mana,
  sorts, équipement de départ ; `heroKit` résout mana et sorts) et
  `data/spells.ts` (`SpellDef`). `World.spawnHero` reçoit le kit résolu et
  le copie dans `Entity.hero` (`heroId`, `mana`, `maxMana`, `manaRegen`,
  `spells`, `spellCast`) : la simulation ne relit jamais `HEROES`.
- Ordre `cast` (`sim/orders.ts`) : ordre de travail (ni ciblage ni
  combat), validé à l'application (sort connu, mana — en comptant celui
  d'une incantation en cours, rendu par ce nouvel ordre —, cible alliée
  vivante ;
  refus `no-mana` / `invalid-target`). `workGoal` mène le Héros à portée ;
  `heroWorkSystem` lance l'incantation (`startSpell` : mana retenu,
  `Entity.cast.heal`).
- Ordre d'un pas : commandes → `interruptHeroSpells` (ordre changé, mort,
  Provocation, cible morte : annulation, mana rendu) → `abilitySystem`
  (avance l'incantation, donne le soin, événement `heal` / `heal-lost`) →
  `heroSpellSystem` (fin du sort, mana rendu si perdu, Garde ;
  régénération du mana) → déplacement → travail. Événements
  `spellStart` / `spellCancel` / `spellEnd` (`HeroEvent`).
- Rendu et UI : `render/spellCastVfx.ts` (cercle au sol, lu sur
  `Entity.cast`), rôle `cast` du Héros (`render/toonUnitRig.ts`),
  `ui/heroHud.ts` (portrait `render/toonThumbnail.ts`,
  `toonUnitPortrait` ; barre d'action, touches 1 à 6 via
  `inventoryShortcutSlot`), `ui/heroInventory.ts` (feuille
  `run/entityInfo.ts`, `heroSheetInfo`), `ui/heroSelect.ts`,
  `ui/buildMenu.ts`, `ui/worldLabel.ts`, anneau du dépôt
  (`render/resourcePiles.ts`, `DepotTargetRing`) ; orchestration dans
  `main.ts` (ciblage du sort, bouton Construire, tas sélectionné, Héros
  sans fiche).

## 7. Combat, capacités et dégâts

**Point d'entrée unique des dégâts** : `applyDamageToEntity` (`sim/damage.ts`),
avec un **type** (`DamageType` : `physical` | `magic`, 2026-11-05, G46 ;
mêlée, armes, projectiles de bâtiment, flèche du joueur, Charge et Tourbillon
physiques ; Boule de feu et effets d'arme magiques ; aucune résistance :
même quantité brute, le type est porté par les événements) et, pour un dégât
magique, une **école** facultative (`DamageSchool`, `data/damageTypes.ts`,
G47). Les effets d'arme passent par `advanceWeaponProcs` (`systems/combat.ts`,
appelé seulement en fin de `resolveStrike`), §13 octodecies.
Le bouclier absorbe d'abord, puis les PV baissent. Les appelants :

| Source | Fichier |
|---|---|
| Attaque automatique | `sim/systems/combat.ts` |
| Boule de feu (zone) | `sim/systems/abilities.ts` (`advanceBlasts`) |
| Charge | `sim/systems/abilities.ts` (`advanceDash`) |
| Flèche du joueur | `sim/playerArrow.ts` |
| Tir de la Tour | `sim/systems/buildingAttack.ts` |

- **Combat** : le raté et l'esquive passent par la RNG. La ligne de tir est
  testée par `findBlockingObstacle` ; un tir bloqué provoque un petit
  déplacement latéral (*sidestep*).
- **Élan** (`UnitStats.attackWindup`, opt-in) : au départ du coup,
  `Entity.pendingAttack` verrouille la cible ; le jet et les dégâts arrivent
  à la fin de l'élan. Sans cible (ordre de déplacement), l'élan est annulé
  et la recharge rendue. Événements `windup` (début du geste, joué par le
  rendu) et `cancelled` ; les coups issus d'un élan portent `windup: true`.
  Côté rendu, `UnitViews` coupe l'attaque visible d'une unité sous ordre de
  déplacement, et `main.ts` supprime la flèche visuelle en attente d'un
  Archer parti.
- **Capacités** : `AbilityDef` est une union (`charge` | `area-blast` |
  `taunt` | `heal`, `data/abilities.ts`), configurée directement sur chaque unité dans
  `data/units.ts`. Elle est exécutée par le système générique
  `sim/systems/abilities.ts`. Les projectiles de zone sont stockés dans
  `World` et non sur leur lanceur : ils survivent à sa mort.
- **Soins de simulation** : `applyHealToEntity` (`sim/damage.ts`), seul
  point d'entrée ; utilisé par le soin de l'Oracle, appliqué à la fin de son
  incantation (`Entity.cast.heal`, événements `heal` / `heal-lost`), par le
  Soin du Héros et par le soin de l'Église (`main.ts`). `applyPlayerHeal`
  (`sim/damage.ts`, soin de zone des anciens parchemins) n'a plus
  d'appelant depuis le 2026-11-04.
- **Hors entités** : la flèche du joueur (`sim/playerArrow.ts`, une volée de
  un ou plusieurs carreaux sous un cooldown commun). Les effets des
  parchemins déclenchés depuis `main.ts` (`applyIceNovaRoot`,
  `createBlizzardZone`, `spawnShadowProjectiles`) ont été retirés le
  2026-11-04 ; `Entity.rootTimer` (immobilisation) reste comme statut
  générique, sans source aujourd'hui.
- **Mort** : `sim/systems/death.ts` passe `alive` à `false`.

## 8. Circulation des événements simulation → rendu/UI

La simulation émet des **faits** ; `main.ts` décide des réactions (visuelles,
économiques, de progression).

- **Tableaux d'événements, vidés et remplis à chaque tick** :
  `combatEvents`, `abilityEvents`, `playerArrowEvents`,
  `productionSpawnEvents`, `productionUpgradeEvents`,
  `enemyReinforcementSpawns`, `buildingAttackEvents`, `heroEvents`,
  `resourceDepletedEvents`, `cargoEvents`, `campEvents`, `lootEvents`,
  `orderEvents`. (`areaEffectEvents` et `shadowProjectileEvents` ont
  disparu le 2026-11-04 avec les parchemins.)
- **État lu directement par le rendu** : `entities`, `blasts`,
  `playerArrow.flights`, `buildingProjectiles`.

Consommation dans `main.ts` (`onStep`, après `world.step`) :

- **Flash de dégâts** : `playHitFlash(entityId)` route vers la vue du
  bâtiment (`BuildingView`) si l'id en est un, sinon vers `UnitViews`. Toutes
  les sources de dégâts passent par ce point.
- **Textes et VFX d'impact** : textes « raté » / « esquivé »
  (`combatOverlay`), impacts via `VfxManager` (`render/vfx/`).
- **Or par kill** : détecté par **transition** `alive → false` (un ensemble
  d'ids déjà récompensés), quelle que soit la source de la mort ; aucun
  événement de mort n'est émis.
- **Production des bâtiments** (Caserne, Camp d'archerie) : la simulation
  décide *quand* et *où* ;
  `main.ts` appelle `world.spawn` avec les stats effectives
  (`run/playerUnitStats.ts`).
- **Renforts ennemis** (mini-vagues) : `main.ts` construit le plan de la
  vague (`computeEnemyWavePlan` : groupes de `run/enemyWaveGroups.ts`,
  positions de formation, délais en ticks, zone de spawn) et le passe à
  `World.startEnemyReinforcements`, qui renvoie le premier groupe. Ensuite,
  `sim/systems/enemyReinforcements.ts` décide à chaque tick si le groupe
  suivant arrive (délai atteint ou 1 s de terrain vide) et sur quelles cases
  libres ; `main.ts` crée les entités (`spawnEnemyReinforcements`, stats de
  la vague). État explicite : `World.enemyReinforcements`
  (`nextGroupIndex`, `nextSpawnTick`, `emptySinceTick`),
  `pendingEnemyGroups()`, `allEnemyGroupsSpawned()`.
- **Fin de bataille** : `world.countCombatants(team)` détecte qu'un camp
  n'a plus de combattant ; la victoire exige aussi
  `world.allEnemyGroupsSpawned()`. Puis `applyBattleOutcome`
  (`pendingEnemyGroups` en paramètre, même règle)
  (`run/runState.ts`), puis une séquence de transition (`ui/waveTransition.ts`)
  dont le callback `onBlackout` peut être asynchrone.

## 9. Système BUILDING

- **Entité** : un bâtiment gameplay (Mine, Caserne, Forge, Baliste) est une vraie
  `Entity` (`isBuilding: true`), créée par `World.spawnBuilding` depuis une
  `BuildingDef` (`data/buildings.ts`), jamais depuis `data/units.ts`. Ses stats
  sont neutres : aggro, vitesse et dégâts nuls.
- **Tir** (Tour) : une `BuildingDef` avec `attack` donne à l'entité un
  `buildingAttack` (dégâts du niveau propre, portée, cadence, cible).
  `sim/systems/buildingAttack.ts` (après `combatSystem`) choisit l'unité
  ennemie la plus proche à portée, tire des flèches simulées
  (`World.buildingProjectiles`) et applique les dégâts à l'impact via
  `applyDamageToEntity`. Le rendu (`Projectiles.syncSimulated`) les affiche
  avec le modèle de flèche de l'Archer.
- **Emprise** : l'`ObstacleDef` du bâtiment est ajoutée à `World.obstacles`
  (même référence que `Entity.footprintObstacle`). Elle bloque ainsi
  mouvement, ligne de tir et pathfinding. Elle est retirée à la mort par
  `releaseDeadBuildingFootprints`, juste après `deathSystem`. Ajout et
  retrait **remplacent** le tableau `World.obstacles` (jamais de mutation en
  place) : les bornes sont mises en cache par identité de tableau
  (`sim/geometry.ts`).
  - `blocksShots: false` (pièces de mur, eau, arbres) : l'emprise bloque le
    déplacement mais pas la ligne de tir (`findBlockingObstacle(..., forShot)`,
    utilisé par `combatSystem` ; la trajectoire de Charge et la poursuite
    restent bloquées).
  - `line` (pièce de mur V2, 2026-11-02) : emprise en **capsule** (segment
    A → B, demi-épaisseur), `x`/`z`/`tilesX`/`tilesZ` = sa boîte
    englobante (caches, tests grossiers). Lue exactement par la collision
    des corps (`movementSystem`, `pushOutOfCapsule`), la ligne dégagée
    (`findBlockingObstacle` → `segmentHitsCapsule`), la grille A*
    (`buildPathGrid` → `wallLineCells` : ligne et épaisseur, sans les bouts
    arrondis) et le test « corps contre mur » de la ligne droite
    (`bodyPathNearStructure`). Voir §13 octies.
  - `door` (porte de mur V2) : propriétaire et état, même objet que
    `Entity.wall.door` ; l'emprise reste **toujours** dans
    `World.obstacles`. `obstaclesForUnit(obstacles, unit, crossesWater)`
    (en cache par tableau et par camp) retire l'eau pour une unité qui la
    traverse et les portes qu'elle peut franchir :
    `canUnitPassGate(unit, door)` (`sim/relations.ts`) = porte ouverte ET
    `areAllied(unit.team, door.owner)`. Aucun camp codé en dur :
    `areAllied` (même camp aujourd'hui) est le point d'extension des
    factions / alliances.
- **Ciblage** : un bâtiment n'acquiert jamais de cible (`targetingSystem`) ;
  la Tour tire par `buildingAttack`.
- **Survie d'un camp** : `countsForDefeat` (porté par la `BuildingDef`) fait
  compter un bâtiment dans `countCombatants`.
- **Production** (Caserne, Camp d'archerie, Sanctuaire, Église, Écurie,
  Auberge) : une seule règle depuis le 2026-11-04, la **file payée** en
  temps réel. `main.ts` (`produceAtInspectedBuilding`) débite l'or et
  appelle `World.queueProduction(entityId, { kind: 'unit', unitId }, durée)`
  (durée de `data/production.ts`, au plus `PRODUCTION_QUEUE_MAX` ordres) ;
  `tickProductionOrders` (`sim/systems/buildingProduction.ts`) décompte
  les durées et pousse les unités prêtes dans `Entity.productionQueue`
  (tampon d'attente) ; `buildingProductionSystem` les fait sortir dès que
  la population (`productionWaitingForPopulation`) et une case libre
  autour de l'emprise le permettent, et émet `productionSpawnEvents`
  (§8). Les améliorations de bâtiment passent par la même file
  (`{ kind: 'upgrade' }`, `handleProductionUpgrades`). L'ancien quota
  gratuit « par manche » (`UnitProductionConfig`, `unitsByLevel`,
  `productionRemaining`, `unitsProducedPerWave`, surcharge `production`
  de `spawnBuilding`) a été retiré (`DESIGN_DECISIONS.md` G40).
- **Unités productibles** : champ `recruitmentUnlock` de la `BuildingDef`
  (`unitIds`, `minLevels`), lu par `producibleUnits` (`data/production.ts`)
  pour les boutons « Produire » de la fiche (`main.ts`) et par
  `World.setRallyPoint` (un point de ralliement n'a de sens que sur un
  bâtiment qui produit ; avant le 2026-11-04, la garde lisait `production`
  et refusait à tort le ralliement de l'Auberge, du Sanctuaire, de
  l'Église et de l'Écurie). `run/recruitment.ts` a disparu avec la
  Boutique.
- **Rendu** :
  - `render/buildingView.ts` gère le flash, la destruction et les débris, sur
    des matériaux clonés ;
  - `main.ts` maintient `buildingViewsByEntityId` ;
  - la Baliste est un singleton au rendu dédié (`render/ballista.ts`).
- **Run** : `RunState.buildings` (`OwnedBuilding`) conserve position,
  rotation, PV, niveau propre et avancement de chantier de chaque bâtiment
  de la run ; `startSurvivalWorld` (`main.ts`) les instancie au démarrage
  et `ownedBuildingIndexByEntityId` relie ensuite chaque entité à son
  `OwnedBuilding`. La position de la Baliste, `RunState.ballistaPosition`,
  est fixée au démarrage de la run depuis la carte de départ
  (`resolveBallistaOrigin`, voir §10) ; plus rien ne la déplace depuis le
  retrait de l'agrandissement (2026-11-04).
- **Production de la Mine** : gérée par `main.ts` en bataille réelle
  (minuteur `mineProductionIntervalSeconds`, montant `rollMineGold` de
  `run/mineUpgradeEffects.ts`, tiré d'un `Rng` dérivé de la graine du
  `World`), pas par la simulation.
- **Bâtiments décoratifs** : dans l'éditeur et sur les cartes, ce sont de
  simples `ObstacleDef` `kind: 'building'`, jamais des entités.

## 10. État de run, méta-progression, réglages

- **`RunState`** (`run/runState.ts`) : or, armée possédée, inventaire, vague,
  bâtiments, position de la Baliste, état d'expansion de la carte, niveaux
  d'amélioration de la run (`upgrades`). En mémoire uniquement, **jamais
  sauvegardé**. `createNewRun` part de `upgrades = {}` ; `spendGold(run,
  montant)` est le débit centralisé (refus si montant invalide ou Or
  insuffisant, jamais d'Or négatif), utilisé par l'achat d'améliorations.
- **Contrat d'ordre de spawn** : `applyBattleOutcome` recolle chaque `Entity`
  du joueur à son `OwnedUnit` par **ordre de spawn**. Les unités du joueur
  doivent être spawnées dans l'ordre de `run.army` ; les bâtiments sont
  exclus de cette correspondance. Ce contrat est implicite, documenté
  seulement par un commentaire.
- **`MetaProgress`** (`run/metaProgress.ts`) : progression **permanente**
  seulement — talents et points de talent, record de vague, paliers de
  points accordés, ennemis vaincus. Il ne contient aucune amélioration ni
  monnaie (plus de Runes).
  - Stocké dans `localStorage` sous une clé versionnée.
  - Chargement défensif : retour aux valeurs par défaut en cas de donnée
    invalide. Les clés inconnues d'une ancienne sauvegarde (`upgradeRunes`,
    `unitUpgrades`, `unlockedUnits`, `defeatedEnemyUnitIds`) sont ignorées.
  - Migrations appliquées à chaque chargement (`migrateToV2`,
    `stripRemovedTalents`). `stripRemovedTalents`
    retire les talents supprimés de l'arbre et rembourse leur coût
    (`REMOVED_TALENT_REFUNDS` : `temps_argent`, `maitre_forge`).
  - Les fonctions de mutation ne sauvegardent jamais elles-mêmes : l'appelant
    appelle `saveMetaProgress`.
- **Réglages** (`run/userSettings.ts`) : clé `localStorage` séparée, non
  touchée par l'effacement de la sauvegarde.
- **Améliorations de run** (`run/runUpgrades.ts`) : niveaux de toutes les
  progressions **globales à la run** (2026-11-05, G41) — Baliste
  (`ballista`), technologies (`data/technologies.ts`) et niveaux des
  producteurs à portée « run » (id = id du bâtiment).
  - `RunUpgradeLevels` (id → niveau), `runUpgradeLevel(levels, id)` (0 si
    absent), `grantRunUpgradeLevel` (niveau + 1, déjà payé).
  - Séparation explicite des deux sources de progression :

    ```
    PlayerProgression
    ├── talents: MetaProgress        (permanent)
    └── upgrades: RunUpgradeLevels   (RunState.upgrades, propre à la run)
    ```

    `main.ts` la construit à la demande (`playerProgression()`, jamais
    stockée) ; « Tester le scénario » se joue avec `upgrades = {}`.
  - Baliste : `ballistaUpgradeGoldCost(niveau)` = 1 × 2^niveau
    (`BALLISTA_UPGRADE_GOLD_COST_BASE` / `_GROWTH`), `canBallistaLevelUp`
    (`BALLISTA_UPGRADE.maxLevel`, absent = sans plafond). Aucun talent
    n'intervient.
  - Niveaux affichés : les niveaux internes partent de 0 ;
    `displayedUpgradeLevel` (niveau + 1) est la seule conversion vers
    l'affichage « Niv. N ».
- **Technologies** (`data/technologies.ts`, `run/technologies.ts`) :
  définitions pures (site, coût or + stock, durée, effets `UnitBonus` sur
  les unités militaires ou une unité nommée, niveau de site requis) ;
  `isTechnologyAcquired`, `isTechnologyAvailable`, `canAffordTechnology`,
  `technologyStatusesAt(site, run, niveau, pending)` (fiche),
  `technologyUnitBonus(levels, unitId)` (bonus cumulé).
- **Améliorations de bâtiment** (`run/buildingUpgrades.ts`,
  `BuildingDef.upgradeScope`) : portée « instance » (`OwnedBuilding.level` :
  Mine, Tour) ou « run » (`RunState.upgrades[buildingId]` :
  producteurs) ; `buildingLevelOf(levels, owned)` donne le niveau effectif.
  - Coût `buildingUpgradeGoldCost(buildingId, niveau)` =
    `upgradeGoldCostBase` × 2^niveau ; plafond facultatif
    `BuildingDef.maxUpgradeLevel` (`isBuildingAtMaxLevel`) ;
    `canAffordBuildingUpgrade`, `applyBuildingUpgrade(levels, owned, id)`
    (niveau + 1 de l'exemplaire ou du type, déjà payé).
  - Effets : `run/mineUpgradeEffects.ts`, `run/buildingUpgradeEffects.ts`
    (PV, dégâts), `data/production.ts` (unités débloquées),
    `BuildingDef.rosterBonusPerLevel` (bonus du roster, via
    `run/playerUnitStats.ts`).
- **Commandes de la file** (`run/productionOrders.ts`, 2026-11-05) :
  SOURCE UNIQUE du paiement, de la mise en file, de l'annulation et de la
  fin pour les quatre sortes de commandes de `Entity.productionOrders`
  (unité, amélioration de bâtiment, amélioration de la Baliste, recherche) :
  `queueUnitOrder`, `queueBuildingUpgradeOrder`, `queueBallistaUpgradeOrder`,
  `queueTechnologyOrder`, `cancelOrder` (tout rendu), `isBuildingUpgradePending`
  (exemplaire ou type), `isTechnologyPending`, `completeOrders` (applique
  niveaux et technologies depuis `World.productionUpgradeEvents`, puis
  `refreshPlayerUnitStats` si la progression des unités a changé) ;
  `OrderLedger` (id → or, bois, pierre payés). Pur de tout DOM : les
  tests sans navigateur l'exercent (`tests/sim/technologies.mts`).
  `main.ts` ne fait que relayer les actions de fiche
  (`realtimeBuildingAction`) et les événements (`handleProductionUpgrades`,
  annonces).
  - `ownedBuildingIndexByEntityId` (`main.ts`) relie chaque entité de
    bâtiment à son `OwnedBuilding`, par l'ordre de spawn.
- Le bilan de fin de vague (`run/battleSummary.ts`, `showWaveComplete`)
  a été retiré le 2026-11-04 avec la boucle en manches ; l'écran de la
  Forge (`unitUpgradeShop`, jeu figé) et `run/churchHeal.ts` le 2026-11-05.
- **Calcul des effets** (`run/*Effects.ts`, `run/talentEffects.ts`) :
  seuls `run/` et `main.ts` connaissent talents, technologies et
  niveaux. Les prix de bâtiments (`getEffectiveBuildingCost`) et d'unités
  (`UnitDef.cost`) ne dépendent d'aucun niveau. L'achat et l'affichage
  utilisent les mêmes fonctions. `computeEnemyUnitUpgradeEffects`
  (`run/enemyWaveEffects.ts`) utilise un barème séparé
  (`ENEMY_WAVE_UPGRADES`, `data/enemyWaveUpgrades.ts`) pour le
  renforcement par vague, indépendant du joueur.
- **Statistiques effectives du joueur** : fonctions pures de la progression,
  source commune du gameplay et de l'interface. Elles combinent talents
  permanents et progression de la run ; aucune de ces formules n'est
  dupliquée dans `ui/` ni dans `main.ts`.
  - `run/playerUnitStats.ts` — **une seule hiérarchie** (2026-11-05) :
    - `computePlayerUnitStats(unitId, progression)` : base + talents
      (esquive) + bonus du producteur × niveau de run + technologies
      acquises ; bonus fixes puis pourcentages ; renvoie `statOverrides`
      (pour `World.spawn` / `World.applyUnitStats`), `abilityDamageBonus`
      (Boule de feu), `tauntShieldBonus` (0), `maxHp`, `mainAttack`,
      `bonus` (affichage) ;
    - `playerUnitRunBonus(levels, unitId)`, `playerUnitMaxHp` ;
    - la progression est **globale et rétroactive** : aucune unité ne porte
      plus de niveau propre (`OwnedUnit.productionLevel` retiré).
  - `run/ballistaStats.ts` :
    - `effectivePlayerArrowDamage`, `effectivePlayerArrowCooldown` et
      `totalBallistaAttackSpeedBonus` reçoivent une `PlayerProgression`
      (talents Tir rapide et Mitraillette, amélioration de la Baliste) ;
      `effectivePlayerArrowSpeed` et `playerArrowBoltsPerVolley` ne
      dépendent que des talents (`MetaProgress`) ;
    - le type `BallistaStatus`, ses libellés (`BALLISTA_STATUS_LABELS`) et
      le format de la recharge restante (`formatBallistaCooldownSeconds`),
      partagés par le HUD de la Baliste et la fiche d'entité.
  - Restent dans `main.ts` : l'état courant de la Baliste
    (`currentBallistaStatus`, qui lit le `World`), la géométrie d'une volée
    (`buildBallistaVolleyShots`) et les bonus des ennemis.
- **Fiche d'entité** (`run/entityInfo.ts`) : adaptateur **pur**, sans DOM ni
  Three.js (voir §12).
  - Il reçoit explicitement ses données : emplacement de préparation
    (`unitId`, PV), bâtiment possédé, entité de simulation, progression,
    état de la Baliste.
  - Il rend un `EntityInfoViewModel` (`UnitInfo | GroupInfo | BuildingInfo
    | BallistaInfo`) : `kind`, titre, camp, PV (texte et fraction), lignes,
    sections (capacités), statut ; composition pour un groupe ; `actions`
    facultatives (données pures : `id`, libellé, activé). Seules les fiches
    de préparation en portent : `openForge` (Forge), `upgradeBuilding`
    (Mine, Caserne, Tour, Église), `healArmy` et `openChurchUpgrades`
    (Église) ; en bataille, seule la Baliste en porte (`toggleBallistaMode`).
  - Il n'affiche un niveau (`displayedUpgradeLevel`) que pour ce qui en a
    un : unités et Baliste du joueur (niveau de la Forge), Mine et Caserne
    (niveau propre), ennemis renforcés en bataille réelle.
  - En préparation, il recalcule les valeurs avec les fonctions ci-dessus
    (même fusion que `World.spawn`). En bataille, il lit l'entité (`stats`,
    `hp`, `abilityDamageBonus`, `tauntShieldBonus`, `abilityCooldowns`,
    `shield`, champs de production).
  - Il convertit les PV et dégâts internes en points affichés
    (`HP_PER_PIP`) et formate les durées.
- **Carte de départ du Mode survie** (`config/maps/survivalArena.ts`) :
  `SURVIVAL_ARENA_MAP` est la transcription exacte de la carte exportée de
  l'éditeur ; `SURVIVAL_BASE_MAP` en est la version jouée, sans unités de
  scénario (`playerUnits`/`enemyUnits` vides), avec cases, décors,
  territoire et `ballista`. `main.ts` part de `currentMap =
  SURVIVAL_BASE_MAP` ; `startNewRun` fixe `currentRun.ballistaPosition`
  depuis cette carte, remet la carte de départ si une run précédente l'avait
  agrandie, cadre la caméra (`frameRunCamera`) puis lance la préparation.
  `createInitialMapExpansionState` part de ses dimensions. L'éditeur s'ouvre
  sur `SURVIVAL_ARENA_MAP` (`enterEditor`, copie de travail dans
  `EditorState`). `DEFAULT_MAP` (`config/mapDef.ts`) ne fournit plus que les
  dimensions de « Nouvelle carte » (et le paramètre par défaut, inutilisé, du
  constructeur d'`EditorState`). Aucune de ces cartes n'est jamais mutée.
  `config/maps/islandArena.ts` (`ISLAND_ARENA_MAP`) : arène candidate, même
  convention (transcription d'un export de l'éditeur) ; `main.ts` la prend
  comme carte de départ du Mode survie (`survivalBaseMap`) seulement avec le
  paramètre de débogage `?map=island`, et la passe à `createNewRun` pour les
  compteurs d'agrandissement ; voir `CURRENT_STATE.md` §11.
- **Expansion de map** : retirée le 2026-11-04 (`run/mapExpansion.ts`
  supprimé, `RunState.mapExpansion` disparu, `DESIGN_DECISIONS.md` G40).
  La carte d'une run ne change plus après le démarrage ; `MapDef.spawnDepth`
  et le territoire restent ceux de la carte.
- **Territoire** (`config/territory.ts`, module pur sans DOM ni Three.js) :
  - `TerritoryCell = { x, z, team: 'player' | 'enemy' }`, dans la
    convention de `MapDef.cells` (coin entier de la case). Une case sans
    entrée est neutre ; neutre n'est pas un `TerritoryTeam`. Le type est un
    littéral local, structurellement identique à `Team` (`config/`
    n'importe jamais `sim/`) ;
  - `MapDef.buildings?` (`MapBuildingPlacement` : `buildingId`, `team`,
    centre `x`, `z`) : bâtiments gameplay de scénario de l'éditeur,
    séparés des décors (`obstacles`) et de la Baliste (`ballista`) ; absent
    = aucun. Instanciés par `setupTestBattle` (« Tester le scénario ») via
    `World.spawnBuilding`, au niveau 1 ; ignorés par le Mode survie ;
  - `MapDef.territory?` : absent = repli historique ; `[]` = territoire
    explicitement vide, sans repli. `resolveMapTerritory(map, spawnDepth)`
    est la **seule** source du repli (`deriveLegacyTerritory` : bandes de
    `spawnDepth` rangées comptées depuis l'emprise réelle des cellules,
    limitées aux cellules existantes) ;
  - `buildTerritoryIndex` (lookup O(1)), `territoryOwnerAtPoint`,
    `isFootprintOwnedBy` (toute l'empreinte doit appartenir au camp).
- **Territoire courant du jeu** : depuis le 2026-11-02 (construction libre,
  G12) la pose en jeu n'est plus limitée au territoire, et l'index de
  territoire de `main.ts` (`currentTerritory`,
  `rebuildCurrentTerritoryIndex`), qui ne servait qu'au placement, a été
  retiré le 2026-11-04 avec lui (G40). La pose d'un bâtiment (`checkBuildingPlacement`,
  G48) ne teste que les obstacles, les bâtiments, l'eau, les sources debout, les
  murs, les unités et l'existence des cases. Le territoire d'une carte (`MapDef.territory`)
  sert au rendu des zones, au camp des unités de l'éditeur et aux
  vagues ; il n'existe pas de `RunState.territory`. La simulation ne
  connaît pas le territoire.

## 11. Rendu

- **Caméra** : `render/renderer.ts`, caméra orthographique inclinée (yaw,
  pitch, zoom, déplacement).
  - Zone d'affichage partielle, utilisée par l'éditeur seulement :
    `setViewportInsets` (marges en pixels mesurées sur le DOM) centre la vue
    dans l'espace libre ; le frustum couvre toujours tout le canvas, donc le
    raycast et les projections ne changent pas. `frameBox` cadre une
    emprise sans changer l'orientation, et la recadre au changement de zone
    tant que la caméra n'a pas été touchée.
  - `getViewState` / `setViewState` : l'éditeur sauvegarde la vue du jeu à
    l'entrée et la restaure à la sortie. Sans marges, le calcul est celui du
    jeu.
  - Au démarrage d'une run, `frameRunCamera` (`main.ts`) remet l'angle par
    défaut puis appelle `frameBox` sur toute la carte de départ (sans
    marges) : l'arène 21 × 36 dépasse le zoom par défaut.
- **Unités** :
  - `render/unitViews.ts` crée une vue par entité, interpole sa position,
    joue les animations, le flash de dégâts et la mort ;
  - `render/unitMesh.ts` délègue aux rigs (`*Rig.ts`, modèles glTF riggés
    chargés via `riggedGltf.ts`) ;
  - attaques procédurales : `proceduralAttackAnimator.ts`, `proceduralSwing.ts`.
- **Plateau** : `render/board.ts` (sol, grille, zones), `terrainCells.ts`
  (géométrie du sol : une fusionnée par surface présente, plus une pour
  tous les flancs), `groundSurfaces.ts` (surfaces visuelles), `textures.ts`.
  - Cases : chaque case n'a que son dessus (deux triangles `cellTriangles` :
    plat, en pente ou en pente de coin, à la hauteur de
    son niveau) et ses faces latérales visibles — vers une voisine plus
    basse (falaise, entre les deux hauteurs) ou vers une case absente (bord,
    trou : jusqu'à −`CELL_THICKNESS`, 0,45). Aucune face cachée, aucune
    dalle superposée. Forme et apparence séparées : le dessus prend la
    surface visuelle de la case (`groundSurfaceAt` : la surface **peinte**
    de la case si elle en a une, `MapDef.surfaceCells` passé par
    `buildSurfaceIndex` au paramètre `painted` de `buildTerrainCellsView` ;
    sinon la palette active, `setGroundPalette`, choisie par `main.ts`
    d'après `?sol=` ; bruit de valeur déterministe sur x, z, jamais
    `Math.random`), les flancs la
    surface de flanc de la palette (`groundFlankSurface` ; par défaut
    `ground_dirt.png` teinte (1, 0,9, 0,8)), assombrie vers le pied. Une
    palette choisit la surface de l'herbe, de la terre et des flancs ;
    toute texture du lot est aussi une palette à elle seule. Le lot est
    défini **une seule fois** dans `config/groundSurfaces.ts`
    (`GROUND_TEXTURES` : identifiant stable, libellés, famille, fichier,
    cycle, filtrage), lu par le rendu, l'éditeur (liste, vignettes) et la
    sauvegarde (validation). UV en coordonnées monde divisées par le cycle de la
    surface (cases par répétition) : dessus (x, −z) (continu, pente et coin
    compris), flancs (position le long du bord, y).
    Couleur de sommet du dessus : +15 % par niveau (rien sous y = 0),
    −`SLOPE_SHADE` (18 %) proportionnel à l'inclinaison. Matériaux
    `MeshLambertMaterial` par clé (`TerrainMaterials` : dessus d'une
    surface, flancs, transition), un seul par clé pour tout un plateau ;
    textures partagées jamais libérées (PNG chargés une fois ; lot
    exploratoire `public/textures/ground/variants/` via
    `loadGroundVariantTexture`, `NearestFilter` en agrandissement pour les
    pixelisées). Plateau du jeu (`board.ts`) : un seul morceau, un draw call
    par surface présente plus un pour les flancs et un par surface qui
    déborde (transitions).
  - Construction par morceau : `buildTerrainChunk(cells, ctx)` dessine les
    cases `cells` en lisant la carte entière par un `TerrainContext`
    (`terrainContext` : présence des cases, surface visuelle, champ de
    hauteur, matériaux) ; `buildTerrainCellsView` = un morceau couvrant
    tout. Tout calcul de voisinage (sommets décalés, arêtes libres, jupes,
    transitions) est une fonction de la carte et de positions monde : un
    morceau a exactement les triangles du plateau d'un seul tenant.
  - Sol de l'éditeur (`render/terrainChunks.ts`, `ChunkedTerrainView`) :
    morceaux de `TERRAIN_CHUNK_SIZE` (16) cases de côté, matériaux partagés.
    `rebuild` (forme, relief, chargement : `rebuildEditorBoard`, qui garde
    désormais la même vue) refait tout, sauf si seules des hauteurs ont
    changé (mêmes cases, mêmes surfaces) : il ne refait alors que les
    morceaux à `RELIEF_REACH` (4) cases ou moins d'une case changée ;
    `updateSurfaces` (coup de pinceau Surface, annuler / rétablir :
    `refreshEditorTerrainSurfaces`, `main.ts`) compare les surfaces au
    dernier rendu et ne refait que les morceaux contenant une case
    repeinte ou une voisine (rayon 1 : ce que lit une transition ; 2 en
    `lisiere`, `melange`, `organic` et en `living`). Ni
    grille, ni zones, ni objets, ni relief, ni rien de la simulation ne
    sont recalculés. Précondition : forme et relief inchangés depuis le
    dernier `rebuild`. Mesuré (Edge, 64×64 très peinte, `faceted-plus` +
    `irregular`) : un coup de pinceau 1×1 coûte environ 5 ms (pire cas
    15 ms) contre 100 ms quand tout le sol était reconstruit ; un long
    trait, environ 4 ms par case, sans dérive ; une reconstruction
    complète, environ 55 ms. Contrepartie : un mesh par surface et par
    morceau (84 meshes et environ 60 draw calls de plus sur cette carte).
  - Modes de rendu (`TerrainRenderMode`, `setTerrainRenderMode`, choisi
    par `main.ts` d'après `?terrain=`) : `faceted-plus` (défaut),
    `faceted` et `faceted-plus-shadow` = `render/terrainStylized.ts`
    (`buildStylizedTerrain`, réglages centralisés dans
    `TERRAIN_STYLE_PARAMS`) ; `grid` (témoin) = le code case par case
    ci-dessus. Bande irrégulière (« lèvre », exportée par case pour les
    transitions : `TerrainLips`) vers le vide sur chaque arête
    libre (sommets de bord décalés une fois, partagés ; débord réduit dans
    un vide d'une case de large), falaise facettée jusqu'à
    −`CELL_THICKNESS`, falaises intérieures subdivisées. `faceted-plus` :
    jupe des ruptures intérieures d'au moins un niveau (arête horizontale
    des deux côtés ; sommets décalés vers la case basse seulement si les 4
    cases sont plates et ne prennent que deux hauteurs), pied enfoncé de
    2 cm dans le sol bas ; flanc de rampe inchangé. `faceted-plus-shadow` :
    `castShadow` sur les meshes du terrain. Hash déterministe, aucun T de
    jonction sur les arêtes de la grille, mêmes matériaux et mêmes surfaces
    que `grid`. Rien d'autre ne
    lit ce mode : le pointage (`intersectTerrain`), la pose et les hauteurs
    d'objets restent sur `TerrainHeightField`.
  - Transitions (`render/surfaceBlend.ts`, `setSurfaceBlendMode`,
    `?surfaceBlend=`) : `appendSurfaceBlend` ajoute, après le dessus (tout
    mode de terrain), un mesh par surface qui déborde : sous-grille 6 × 6
    des cases voisines d'une surface prioritaire (`BLEND_PRIORITY`), alignée
    sur leur diagonale (sol exact), alpha par sommet (distance aux cases
    prioritaires, arrondi des coins rentrants, bruit déterministe ; coupé
    par `alphaTest`), texture et ombrage de la surface, décalage de
    profondeur croissant avec la priorité. Réglages centralisés
    (`SURFACE_BLEND_PARAMS`). Les lèvres facettées d'une case (bord de
    carte, trou, jupe) sont subdivisées de même, leur alpha étant celui du
    point ramené sur le bord de la case. Débord seulement à travers un
    raccord continu, jamais hors du dessus dessiné. `irregular` (défaut) ;
    `hard` (témoin) : rien. `lisiere` et `melange` (`appendLisiere`) : dans
    chaque case dont le voisinage 3 × 3 continu porte plusieurs surfaces,
    score par surface au sommet de la sous-grille (part des cases après flou
    gaussien séparable, flou propre à la matière ; débord, bruit propre ;
    ponts le long des diagonales et biseaux des coins, propriétés des
    sommets dont les quatre cases sont au même niveau), alpha = 0,5 + marge
    sur le meilleur des autres : chaque surface est redessinée là où elle
    l'emporte, celle de la case seulement dans sa bande de lisière ; teinte
    de lisière par sommet selon la famille de la voisine
    (`SURFACE_EDGE_STYLES`, `SURFACE_LISIERE_PARAMS`). Coût : valeurs par
    point d'une zone calculées une fois (`PointCache`) ; contextes des
    morceaux de l'éditeur (`TerrainContext.reuseCells`) : triangles d'une
    case mémorisés avec la signature des surfaces à 2 cases ou moins, rejoués
    à l'identique. `organic` : mêmes scores et mêmes alphas que `lisiere`
    (mêmes contours) ; seule la teinte des sommets change, par couple de
    familles (`SURFACE_ORGANIC_EDGES`, `SURFACE_ORGANIC_PARAMS`) : contact
    selon la marge, zone selon la distance octogonale du point aux cases de
    la voisine (fenêtre 3 × 3, jamais plus de `reach` < 1 case : une case
    hors de portée n'est jamais redessinée), bruits en coordonnées monde ; la
    surface de la case est redessinée là où sa teinte n'est pas neutre.
    Bordure de contact (`setSurfaceBorder`, `?surfaceBorder=` lu par
    `main.ts`, `organic` seulement) : teinte par matière
    (`SURFACE_BORDER_TINTS`, `SURFACE_BORDER_PARAMS`) selon la vraie
    distance du point au contour de sa surface (marge nulle), extrait par
    carrés de la sous-grille de la case prolongée de 2 points (1/3 de case)
    dans les cases voisines continues ; mêmes lectures que les ponts et
    biseaux, donc même signature de mémo et même portée.
    `surfaceBlendReach()` : 2 en `lisiere`, `melange` et `organic` (ponts et
    biseaux lus à 2 cases), lu avec `groundRepaintReach()` par
    `ChunkedTerrainView.updateSurfaces`.
  - Lookdev (`render/look.ts`, `setLookPreset`, `?look=` lu par
    `main.ts`) : `LOOK_SETTINGS` ne donne que des écarts au rendu actuel
    (`baseline` : aucun). `Renderer.applyLook` règle les intensités des
    lumières, `scene.backgroundIntensity` et le voile du fond
    (`createBackgroundVeil` : quad au fond du champ de la caméra, testé en
    profondeur, jamais raycasté) ; `lookSurfaceTint` multiplie la couleur
    des matériaux du sol (`groundMaterial`, matériaux de transition) à leur
    création, lu au travers de `groundLookTint` (`render/groundLook.ts`).
    Rien d'autre ne le lit.
  - Matière du sol (`render/groundLook.ts`, `setGroundLook`, `?groundLook=`
    lu par `main.ts`) : `groundSurfaceDef(id)` remplace `GROUND_SURFACES[id]`
    pour la texture, le cycle et la couleur de base des dessus (matériaux,
    UV des dessus, des lèvres et des transitions) ; en `macro` et `layered`,
    une herbe ou une terre prend la matière principale de sa famille à sa
    propre couleur moyenne (linéaire, mesurée sur le PNG, `TEXTURE_MEAN`).
    `groundMacro(id, x, z)` multiplie la couleur de sommet des dessus, des
    lèvres et des transitions : champs de bruit de valeur lissés, réseau
    tourné, en coordonnées monde (réglages : `GROUND_LOOK_PARAMS`).
    `applyGroundLayer` (`layered`) : `onBeforeCompile` du matériau, seconde
    lecture de `map` dans le même repère UV. Flancs exclus ; `baseline` : ni
    remplacement, ni variation, ni shader modifié.
    `living` :
    - `groundRenderSurface(id)` : surface dessinée (toutes les herbes, puis
      toutes les terres, ne font qu'une ; meshes, matériaux et rangs des
      transitions).
    - `groundLookTint(id)` : une teinte par famille.
    - `GroundStates` : attribut de sommet `groundState`, calculé aux coins de
      la grille depuis la carte entière (part dense, part prairie, proximité
      d'une terre) et interpolé ; absent hors de `living`.
    - `applyGroundLayer` : en plus, contour bruité des états, usure et
      accents en polygones (hash entier de la position monde, uniformes par
      matériau et partagés dans `material.userData.groundLiving`).
    - `groundRepaintReach()` : rayon de reconstruction des morceaux de
      l'éditeur (`render/terrainChunks.ts`).
    - `groundSwatchUrl(id)` : vignette de la palette simplifiée
      (`GROUND_SURFACE_PALETTE`, `config/groundSurfaces.ts`, lue par
      `editor/editorUI.ts`). Elle utilise l'éclairement d'un sol plat que
      `main.ts` reçoit de `Renderer.groundIrradiance()`.
    `rich` (`groundLookIsLiving()` vrai, comme `living`) : `applyGroundLayer`
    définit `GROUND_PATCHES` (plaques de matière, `GROUND_LOOK_PARAMS.rich`).
    `organic` : de même, avec les tons d'herbe de
    `GROUND_LOOK_PARAMS.organicGrass` (uniformes seulement, mêmes sommets).
    Matières minérales (pavés, sable, roche, sol volcanique) : variation
    macro et seconde lecture (sauf pavés et roche) en `living` et `rich`.
    Eau et lave (`applyLiquid`, tous les modes) : shader animé ;
    `attachGroundClock(group)` (appelé par `buildTerrainChunk`) avance
    l'horloge partagée avant le rendu de leurs meshes ; au bord, la marge
    portée par l'alpha des sommets (`lisiere`, `melange`, `organic`) donne
    l'écume et la croûte refroidie.
  - Ancrage et brume (2026-11-07, `DESIGN_DECISIONS.md` A5) :
    `render/contactMap.ts` (`ContactMap` : texture en espace monde construite
    par `createBoard` à partir des obstacles de la carte, `refresh` avec les
    empreintes dynamiques que `main.ts` calcule depuis les bâtiments et les
    tas du `World` ; `applyContactShading` : morceau de shader injecté par
    `onBeforeCompile` dans les matériaux éclairés, ombre de contact puis
    voile de brume ; `setActiveContactMap` : uniforms partagés) ;
    `render/groundMist.ts` (mode `?groundMist=` lu à l'import du module car
    des matériaux partagés sont créés avant `main.ts` ; `mistShared` et
    `MIST_GLSL` : uniforms et fonctions des nappes de bruit, partagés par tous
    les matériaux ; `GroundMist` : configuration d'un plateau, activée par
    `setActiveGroundMist` ; `setFogOfWar` : lecture seule de la grille du
    brouillard ; `setMistLights` : 4 sources au plus) ;
    `render/warmLights.ts` (`WarmLights` : deux `PointLight` du camp du
    joueur, placées depuis `startingBaseLayoutOf`, sources pour la brume).
    Le rendu ne lit le `World` que pour les empreintes et les feux ; la
    simulation ignore tout cela.
  - Mist Clouds et repères depth-aware (2026-11-08, `DESIGN_DECISIONS.md`
    A6) : `render/mistClouds.ts` (modes `?mistClouds=` et `?mistCloudsRes=`
    lus à l'import ; `mistCloudUniforms` ; `MIST_CLOUDS_GLSL` : fonctions
    GLSL `cloudFogLevel` (facteur de densité par état de la grille du
    brouillard de guerre, `tCloudFog` et `uCloudFogRect` remplis par la
    passe : visible faible, exploré hors vision fort, inexploré sur le noir
    avec surface ignorée ; lecture au point et en cinq points, seuils
    ondulés), `mistCloudsLayers` (couleur prémultipliée et couverture des
    trois couches situées devant la surface) et `mistClouds` ;
    `setMistCloudsScene` : graine, appelé par `main.ts` au chargement d'une
    carte ; `tickMistClouds` : horloge cosmétique ; les 4 sources chaudes de
    `mistShared` sont lues, rien d'autre n'est partagé avec la Ground Mist :
    voile au sol par matériau d'un côté, masses aériennes dans la passe de
    l'autre). **Aucun mesh** : les nappes sont évaluées dans `FogOfWarPass`
    (`render/fogOfWar.ts`) à partir de la DepthTexture de la scène et
    composées **avant** l'assombrissement du brouillard de guerre
    (assombries comme le sol couvert ; en inexploré, posées atténuées,
    `uCloudUnseen`, sur la couleur du noir). Traitement half-res (défaut)
    : `cloudMaterial` rend les couches dans `cloudTarget` (HalfFloat, moitié
    de la taille, recréé au redimensionnement), puis `halfMaterial` compose
    l'image : lecture du brouillard d'abord (rien n'est relu sur un pixel
    jamais exploré), `cloudsUpsample` (4 texels, poids bilinéaires atténués
    par l'écart de profondeur), repli exact `mistCloudsLayers` sur les pixels
    de contour sans voisin compatible. `material` reste la composition pleine
    résolution (`?mistCloudsRes=full` ; `cloudsHalfRes` commutable à chaud) ;
    en `?mistClouds=off`, le shader historique est inchangé. Couche gameplay
    overlay : `GAMEPLAY_OVERLAY_LAYER` (couche 1) ; `markGameplayOverlay(objet,
    facteur)` met un objet sur cette couche et rend ses matériaux depth-aware
    (`makeOverlayDepthAware` : `onBeforeCompile`, `discard` du fragment situé
    derrière la profondeur opaque lue dans `overlayDepthUniforms`, biais
    `OVERLAY_DEPTH_BIAS` converti en profondeur normalisée et multiplié par
    le facteur du matériau, uniform `uOverlayBiasScale` : 1 par défaut, 0,1
    pour les anneaux d'unité ; un matériau cloné doit être re-marqué).
    `FogOfWarPass.render` rend la couche 0 dans sa cible, compose, puis rend
    la couche 1 par-dessus avec la DepthTexture de la cible, et coupe le test
    ensuite. Sans passe (éditeur, test de scénario), la caméra a la couche 1
    activée (`Renderer`) et ces objets se rendent comme les autres. Utilisé
    par `render/unitSelectionRing.ts` (qui expose aussi `selectionPulseScale`
    : échelle du flash de sélection, appliquée par `BattleSelection.sync`
    après `pulse()` et par `main.ts` sur les anneaux d'inspection),
    `render/resourcePiles.ts`, `render/rallyMarkers.ts` et la plaque de
    placement (`main.ts`). Tests : `tests/game/overlay-profondeur-jeu.cjs`,
    `mist-clouds-fog-jeu.cjs`, `selection-flash-jeu.cjs`.
  - Sources chaudes avec supports (2026-11-08) : `render/fireProps.ts`
    (`buildCampfire`, `buildTorch` : un mesh éclairé fusionné à couleurs par
    sommet et un mesh de flammes par objet ; `flameMaterial` partagé, cônes
    animés en vertex shader par `tickFlames` ; `disposeFireProp` ; matériaux
    partagés marqués `userData.sharedMaterial`, jamais libérés par
    `disposeWallPieceView`). `render/palisade.ts` ajoute deux torches par
    porte dans un sous-groupe `palisade_torches`, face intérieure des
    montants (−Z local, côté des traverses). `render/warmLights.ts` pose le
    feu de camp depuis la disposition du camp (`place`), reçoit chaque image
    les portes vivantes du joueur (`syncGates`, `main.ts`) et le point visé
    (`setFocus`), affecte un réservoir de deux PointLights aux portes les plus
    proches (`animate`), et fournit feu et portes comme `MistLightSource`
    (`sources`). Le rendu ne lit du `World` que les segments de porte
    vivants.
  - Habillage du relief (`render/reliefLook.ts`, `setReliefLook`,
    `?relief=` lu par `main.ts`), rendu `faceted-plus` seulement :
    `reliefParams()` (null en `baseline` : aucun calcul, rendu inchangé ;
    `setReliefShadows`, `&reliefShadows=on|off`, n'en force que
    `castShadow`). `reliefShadingOf(ctx, ...)` : un ombrage par contexte de
    terrain, partagé par les morceaux d'une même carte.
    `buildStylizedTerrain` émet alors les parois en roche (`rockFacetColor`,
    matériau `rock` sans texture, couleur par facette) au lieu des flancs :
    bords libres (`emitRockEdge`), jupes et autres ruptures ; une bande
    d'herbe sous la crête (dessus de la case, assombri) ; un sommet de bord
    verrouillé n'est plus décalé. `reliefShading` donne, aux coins des cases
    et par hauteur (surface continue), un facteur de couleur (contact au
    pied d'une falaise, creux et bosses) et une normale lissée, interpolés
    dans le triangle de la case ; `buildStylizedTerrain` les applique aux
    dessus et aux lèvres, `appendSurfaceBlend` aux transitions (même
    valeur au même point). Les sommets des dessus ne bougent jamais.
  - Surface active (`render/terrainSurface.ts`) : le champ de hauteur de la
    carte affichée (brouillon de l'éditeur, sinon `currentMap`), fixé par
    `syncActiveTerrain` (`main.ts`) à chaque image et à chaque changement
    de carte ou de relief. Tout élément posé au sol part de `surfaceY(x, z)` :
    unités (`unitViews`, à la position rendue), barres de PV
    (`combatOverlay.project`), décors et bâtiments (`buildObstacleMesh`),
    Baliste, anneaux, apercus de l'éditeur (`buildCellPreview` épouse la
    case par `cellSurfaceMatrix`), zones, grille, débris (cases plates
    seulement), projectiles (départ et arrivée au-dessus de leur sol),
    effets au sol. `intersectTerrain` remplace l'ancien plan y = 0 pour tout
    le pointage à la souris (marche le long du rayon puis bissection ; plan
    exact sur une carte plate). Pinceaux de relief : `intersectSculptSurface`
    (même marche, `marchToSurface`, jusqu'au bas des flancs) : le vide —
    hors carte, trou — est transparent pour le terrain et prolongé par un
    plan de travail à la hauteur des cases voisines (moyenne pondérée par
    l'inverse du carré de la distance, 2 cases de portée,
    `nearestCellHeight`), sinon du dernier point visé (`main.ts`,
    `pickReliefPoint`, `reliefPlaneY`) ; le plan passe devant une case
    touchée plus loin sur le rayon (face d'un flanc vue depuis le vide).
    Renvoie 'terrain' ou 'void', jamais d'interruption du trait. Flèche de la Baliste terminée : posée à sa
    pose d'arrivée (`PlayerArrowView.pose(…, 1)`, fichée au sol de l'impact),
    plus à la dernière image affichée, qui pouvait la laisser en l'air.
    Effets au sol (Soin, Nova, Boule de feu) : disques plats à la hauteur de
    leur centre.
  - Débris de bois décoratifs (`render/board.ts`) : semés seulement sur des
    cases existantes, avec une marge, jamais au-dessus d'un trou.
  - Textures du sol : une seule instance par texture, chargée au premier
    appel puis partagée par tous les plateaux, jamais libérée. Un nouveau
    chargement à chaque reconstruction rendait le sol noir le temps du
    décodage (flash à chaque case ajoutée ou supprimée dans l'éditeur).
    `rebuildEditorBoard` (`main.ts`) libère les géométries et matériaux des
    anciennes dalles et de l'ancienne grille, pas les textures ni les
    ressources partagées des zones.
  - Zones : `createZonesGroup(cells, field)` rend un territoire déjà résolu,
    deux triangles par case sur la surface (`appendCellSurfaceTriangles`,
    mêmes triangles que le sol) et une géométrie par camp, aux couleurs de
    `teamColor`. Partagé par le plateau du jeu (`createBoard`, même
    résolution que la validation du placement) et celui de l'éditeur.
  - Visibilité sur le plateau du jeu : zones visibles en préparation, en
    bataille et pendant la transition de victoire (seule la grille est
    masquée en bataille) ; masquées au retour au menu. Le plateau de
    « Tester le scénario » (`testBoard`) les masque.
- **Décor** : `render/assetLibrary.ts` (chargement et cache des modèles
  glTF/OBJ/FBX) et `obstacleFactory.ts` (construction selon `kind`), partagés
  par le jeu et l'éditeur.
  - Pose : `buildObstacleMesh` mémorise le décalage de pose du modèle
    (recentrage X/Z, base posée au sol en Y, `cloneScaledTo`) ;
    `placeObstacleMesh` place la racine au centre + ce décalage, à la hauteur
    de la surface. Seule fonction de pose (plateau, éditeur, gizmo) : la base
    du modèle est exactement sur le sol, dans l'éditeur comme en jeu.
  - Aspect déterministe : `buildObstacleMesh` crée un `Rng` (`core/rng.ts`)
    à partir de `obstacleAppearanceSeed` (`config/constants.ts` :
    `appearanceSeed` s'il est fixé, sinon hachage du type, du modèle, de la
    taille et de la position du centre). Les fabriques (`rocks.ts`,
    `trees.ts`, `props.ts`, `pickRandom`) tirent tout leur hasard de ce
    générateur : orientation sans `rotationY`, composition des rochers,
    hauteur et modèle des arbres. Une `rotationY` explicite reste
    prioritaire. Le hasard purement cosmétique du plateau (débris au sol)
    reste libre.
- **VFX** : `render/vfx/` (`VfxManager`, `lightPool`, `orbitingSprites`,
  `radialBurst`, `vfxMaterials`) et les vues dédiées (`fireballView`,
  `healVfx`, `tauntVfx`, `telegraph`, `projectiles`, `playerArrowView`,
  `levelUpVfx`, `buildingDamageFx`). `iceNova`, `shadowProjectileView` et
  `recyclageAura` ont été retirés le 2026-11-04 ; `VfxManager` ne gère
  plus que l'impact de Boule de feu.
- **Préchargement** : les modèles riggés sont préchargés au démarrage
  (`main.ts`), pour que la construction d'une silhouette reste synchrone
  ensuite.
- **Sélection et déplacement des unités** :
  - `render/unitSelectionRing.ts` : l'anneau de sélection commun aux unités,
    utilisé par l'éditeur, la préparation et `BattleSelection`.
    - Sa couleur est celle du camp ; la table camp → couleur est le seul
      point à étendre pour d'autres joueurs.
    - La géométrie est partagée, avec un matériau par couleur jamais modifié.
    - L'anneau ignore les rayons, et l'échelle à la racine des modèles est
      compensée.
    - Décors, Baliste et parchemins gardent leurs propres indicateurs. La
      cible d'un ordre d'attaque clignote avec la même géométrie d'anneau
      (`render/attackOrderFeedback.ts`). L'anneau de la Baliste dans l'éditeur garde sa
      forme, mais prend la couleur de son camp via `teamColor` (même règle
      que les unités) ; celui des décors reste doré.
    - Un bâtiment ou la Baliste sélectionnés en préparation
      (`updateBuildingSelectionRing`) ou inspectés en bataille
      (`syncBattleInspection`) portent le même anneau que l'éditeur
      (`createSelectionRing` de `editor/editorScene.ts`, appelé par
      `main.ts`), à la couleur du camp.
  - `render/unitMovePreview.ts` : l'aperçu de déplacement (éditeur et
    préparation).
    - Il affiche des empreintes vertes ou rouges (deux matériaux partagés) et
      des silhouettes translucides, gardées en réserve par classe et par
      camp, réutilisées et masquées, jamais reconstruites au survol.
    - Les matériaux des silhouettes sont des **clones** : une vraie unité
      n'est jamais rendue translucide.
  - `core/gridGroupMove.ts` : le calcul pur et déterministe du plan
    (centre de la formation au point visé, repli dans
    `GRID_MOVE_SEARCH_RADIUS`, tout ou rien). `main.ts` l'appelle avec les
    règles de chaque contexte (`isValidPlacementForUnit` en préparation,
    `canPlaceUnitAt` dans l'éditeur). L'aperçu et le clic utilisent le même
    plan.
  - L'aperçu est recalculé une fois par image, **après** le rendu (voir
    §16 et KI-23).
  - Coût : avec environ 40 unités animées sélectionnées en préparation,
    l'aperçu fait passer d'environ 130-180 à 75-90 images par seconde. Ce
    coût vient du rendu des silhouettes, pas du calcul du plan (moins de
    0,1 ms).

## 12. UI HTML

- Toute l'UI est en DOM par-dessus le canvas, stylée par `ui/style.css`.
- **`Screens`** (`ui/screens.ts`) : menus, choix du Héros, arbre de
  talents, paramètres, confirmations, fin de run. Il reçoit des callbacks
  (`ScreenHandlers`) depuis `main.ts` et lit `MetaProgress` pour
  l'affichage. La Boutique de run, l'écran de fin de manche et
  l'avertissement d'or restant ont été retirés le 2026-11-04 (G40) ;
  l'écran de la Forge (`unitUpgradeShop`, jeu figé) le 2026-11-05 (G41) :
  les améliorations, technologies et la Baliste se commandent depuis les
  fiches (`run/entityInfo.ts` : `ownedBuildingInfo(owned, level, run,
  queue)`, `battleBallistaInfo(…, upgrade)` ; actions `upgradeBuilding`,
  `research`, `upgradeBallista`, `cancelProduction`), sans rien figer.
- **HUD et composants** : `economyHud` (or, bois, pierre, population ;
  `goldElement` ancre les popups de pièces), `heroHud`, `waveIndicator`,
  `buildMenu`, `selectionBox`, toasts, `combatOverlay`
  (barres de PV et textes flottants positionnés par projection monde →
  écran ; les textes flottants partagent la classe `floating-text` et la
  durée `MISS_TEXT_DURATION`), `ballistaIndicator` (HUD de la Baliste), `entityInfoPanel`
  (fiche d'entité), `debug` (panneau de debug).
- **Fiche d'entité** : un flux à sens unique.

  ```
  état du jeu (sélection, emplacements, RunState, MetaProgress, World)
    → run/entityInfo.ts (adaptateur pur, §10)
    → EntityInfoViewModel
    → ui/entityInfoPanel.ts (rendu DOM)
  ```

  - `ui/entityInfoPanel.ts` ne calcule aucune statistique : il reçoit
    `EntityInfoViewModel | null`, crée, met à jour ou masque le panneau. Il
    ne reconstruit le DOM que si la forme du modèle change (type, libellés,
    sections) ; sinon il ne réécrit que les textes et largeurs modifiés. La
    barre de PV réutilise les classes de `combatOverlay`
    (`health-bar-track`, `shield-bar`). Les `actions` du modèle deviennent
    des boutons (seuls éléments cliquables du panneau) ; un clic transmet
    seulement l'`id` au rappel fourni par `main.ts` (`onEntityInfoAction`).
  - `main.ts` choisit la sélection courante (`currentEntityInfo`) et décide
    de la visibilité (`isEntityInfoContextActive`). `updateEntityInfoPanel`,
    appelé dans `onRender`, recalcule la fiche immédiatement quand la
    sélection change, sinon au plus toutes les 100 ms.
  - L'inspection d'un bâtiment en bataille (`battleInspectedEntityId`) est
    distincte de `BattleSelection` : un bâtiment n'entre jamais dans la
    sélection RTS, donc dans aucun ordre. `pickBattleInspectableBuilding`
    retient une Mine, une Caserne ou une Forge pointée, ou le bâtiment dont l'empreinte
    au sol contient le point visé (seul critère pour la Baliste) ; une unité
    sous le curseur passe avant. L'id est abandonné hors bataille, puisque
    les ids repartent de 1 après `world.clear()`.
  - L'éditeur n'utilise pas la fiche.
- **Disposition** (Survie, 2026-11-02) : HUD du Héros en haut à gauche,
  indicateur de vague en haut au centre, debug replié (FPS) en haut à
  droite avec la fiche dessous, barre d'XP du Héros en bas sur toute la
  largeur, bouton Construire en bas à droite, HUD économique à côté ; dans
  « Tester le scénario » : HUD de la Baliste en bas au centre. Les HUD
  d'or et de population séparés, le panneau de placement, la zone
  « Vendre » et la barre d'inventaire (`goldHud`, `populationHud`,
  `placementPanel`, `sellZone`, `inventoryBar`, `unitUnlockToast`) ont
  été supprimés le 2026-11-04.
- **Règles transversales** :
  - pas de dialogue natif (`alert`/`confirm`), sauf dans l'éditeur : alerte
    de carte invalide, confirmation avant de perdre une carte non
    enregistrée, et avertissement `beforeunload` du navigateur ;
  - menu contextuel du navigateur désactivé sur `document.body` (`main.ts`) ;
  - `user-select: none` global, sauf pour les champs de saisie.

## 13. Éditeur de maps

| Fichier | Rôle |
|---|---|
| `editor/editorState.ts` | État pur : obstacles, unités, bâtiments de scénario (`buildings`, emprise lue dans `data/buildings.ts`, `canPlaceBuildingAt`), cellules, territoire explicite (`territory`, `undefined` tant qu'il n'a pas été modifié) avec index résolu en cache (`territoryOwnerAt`, invalidé à chaque changement de cellule ou de territoire), position de la Baliste (`ballista`, `ballistaExplicit`), sélection, outil actif ; instantanés pour l'historique (`objectsSnapshot`, `mapShapeSnapshot`, `territorySnapshot`) |
| `editor/editorScene.ts` | Construction des meshes (réutilise les fabriques du jeu), fantômes des outils de pose, aperçus de cellule, anneau de sélection des décors (doré) et de la Baliste (couleur de son camp, fixée par `main.ts`) |
| `editor/editorUI.ts` | Interface DOM : barre du haut, colonne de gauche (outils, catalogue `DECOR_CATALOG`, recherche), panneau de propriétés, ligne d'état, panneaux repliables, mesure de l'espace libre (`getViewportInsets`) |
| `editor/history.ts` | Pile de commandes undo/redo (`{undo, redo}`) ; la coalescence d'un geste en une commande est faite par l'appelant |
| `editor/mapSerializer.ts` | `MapDef` ↔ JSON (export par téléchargement, import par fichier) ; `territory` et `ballista` écrits seulement s'ils sont explicites, `buildings`, `elevationCells` et `surfaceCells` (triés par z puis x, entrées invalides écartées au chargement) seulement s'il y en a |

L'orchestration reste dans `main.ts` :

- cache de meshes par id d'obstacle, réutilisés tant que le décor ne bouge
  pas ; après un déplacement au gizmo (et son annulation ou rétablissement),
  le mesh est reconstruit (`rebuildEditorObstacleMesh`) pour montrer
  l'aspect qu'aura le décor à sa nouvelle position. L'annulation remet
  aussi l'absence de `rotationY` (`applyEditorObstacleTransform`) ;
- `TransformControls` en translation seule ;
- rotation par l'anneau de sélection, Ctrl+molette, boutons du panneau et R ;
- historique : une commande par geste, par instantanés de l'état
  (`pushEditorObjectsCommand`, `pushObstacleRotationCommand`,
  `applyEditorMapShape` pour la Taille) ;
- relief : `EditorState` garde `elevationMap` (sparse) et un
  `heightField()` en cache ; la sculpture (`reliefBrushPlanAt` →
  `sculptRelief`, `isLocked`) refuse de changer une case occupée
  (`isCellOccupied` : bâtiment, Baliste, obstacle / structure, unité) ; `canPlaceBuildingAt`,
  `canPlaceBallistaAt` et `canPlaceObstacleFootprintAt` (décor de plus d'une
  case) exigent une emprise plate (`flatLevelOver`) ; `mapShapeSnapshot`
  inclut le relief. Murs V2 : les cases de leur ligne verrouillent le relief
  (`isCellOccupied`) ; une ligne ne franchit jamais une falaise
  (`checkWallLine`, `crossesCliff`) ;
- pinceaux (Territoire, + Case, − Case) : un seul mécanisme de trait
  (`startBrushStroke`, `brushAt`, `endBrushStroke`). Chaque case survolée est
  traitée une fois par trait, le plateau n'est reconstruit que si une case
  change, et le relâchement crée une seule commande d'historique
  (instantanés `territorySnapshot`, plus `mapShapeSnapshot` pour les
  cases) ;
- camp des unités : `EditorState.territoryOwnerAt` à la pose et au
  déplacement ; une case neutre est refusée par `canPlaceUnitAt` ;
- état non enregistré : `editorCleanExport` mémorise l'export (JSON, cases
  et territoire triés) du dernier état enregistré ; `isEditorDirty` le
  compare à l'export courant, recalculé au plus une fois par image.
  `confirmDiscardEditorDraft` centralise les confirmations ; l'historique
  n'intervient pas dans ce calcul ;
- cadrage : `updateEditorViewport` transmet les marges de l'interface à la
  caméra (ouverture, repli d'un panneau, redimensionnement, retour de test),
  `frameEditorMap` cadre la carte ;
- sélection et déplacement des unités :
  - clic, Maj + clic, rectangle et double-clic ;
  - plan calculé par `core/gridGroupMove.ts` avec `canPlaceUnitAt` ;
  - une commande d'historique par déplacement de groupe ;
  - `editor/` lui-même n'importe pas `core/` ;
- « Tester le scénario » bascule temporairement `currentMap` et lance une
  vraie bataille. La Baliste y est créée par la même fonction qu'en partie
  (`spawnBallistaBuilding`), à `resolveBallistaOrigin(map)` (`config/mapDef.ts`) ;
- le modèle unique de la Baliste (`ballistaPlatform`) est partagé entre le
  jeu, l'éditeur et le test : il est replacé à chaque transition.

Le détail d'usage relève de `EDITOR.md`.

## 13 bis. Atelier de personnage

Outil interne (CURRENT_STATE.md §16 bis), indépendant d'une run.

| Fichier | Rôle |
|---|---|
| `workshop/workshopConfig.ts` | Types purs : emplacements, catalogue, `WorkshopConfig` (pièces `PieceRef` : nom, source, échelle) ; conversion entrée `units.json` ↔ config (`configFromEntry`, `entryFromConfig`), export / import texte |
| `workshop/workshopModel.ts` | Chargement d'un catalogue (`<source>_atelier.json` + `.glb`), `WorkshopModel` : squelette et clips de la source de base, pièces des autres sources liées aux os de même nom (un matériau par source), échelle par pièce (`scaledSkinnedGeometry`), objets tenus (rigides, attachés à l'os : `boneInverse · ajustement · (miroir) · bindMatrix`), teinte, mixer, statistiques |
| `workshop/workshopUI.ts` | `CharacterWorkshop` : écran DOM, renderer et caméra orbitale propres, presets (dont presets fixes de cavalerie via `buildToonUnitModel`) |

- `main.ts` crée l'Atelier à la première ouverture (`openCharacterWorkshop`)
  et revient au menu à sa fermeture. Le menu ne l'expose que par
  `ScreenHandlers.onOpenWorkshop`.
- Le pipeline (`tools/toon-units/build_toon_unit.py`, `hand_piece`) et
  l'aperçu font le même calcul : miroir par le plan sagittal des mains au
  repos, ajustement `T(prise + décalage) · Rx · Ry · Rz · S · T(−prise)`
  en axes glTF du modèle. Même chose pour l'échelle d'une pièce
  (`scale_piece` / `scaledSkinnedGeometry`) : `v' = c + s·(v − c)`, où `c`
  est la moyenne des articulations au repos pondérée par les poids du
  sommet (4 plus forts, normalisés). Les os ne changent pas.
- Unité mixte : le pipeline importe le FBX de chaque autre source et passe
  ses pièces sur l'armature de l'unité, avec un matériau par source. Dans
  l'aperçu, les maillages des autres sources sont liés aux os de base en
  liaison « attached », ce qui rend leur place dans la scène sans effet.
- Le renderer de l'Atelier tourne seulement quand l'écran est ouvert ; la
  boucle du jeu n'est pas modifiée.

## 13 ter. Équipement, items, butin, Éditeur d'items

- Données : `data/equipment.ts` (raretés, emplacements, format d'item,
  **banque** `EQUIPMENT` : 2 items par emplacement, `archetype`, `stats`
  au niveau 1 + `scaling` par niveau, `statsAtLevel`, `ItemInstance` ;
  2026-11-05, G46), `data/loot.ts` (sources et tables de butin, tirage
  déterministe).
- Récompense de vague : `run/waveRewards.ts` (`rollWaveReward(seed, wave)`
  déterministe, `waveRewardChoices`), `RunState.pendingRewards` (file),
  `applyWaveVictory(run, seed)` / `takeWaveReward` ; interface
  `ui/waveRewardPanel.ts` synchronisée chaque image par `main.ts`
  (`updateHeroUi`), choix → `InventoryAction` `acquire` avec `level` (règle
  unique d'acquisition, §13 octodecies).
- Run : `run/heroEquipment.ts` (inventaire pur et sérialisable,
  `resolveEquipmentBonus` → `HeroEquipmentBonus` en unités internes,
  visuels tenus, description des items).
- Simulation : `Entity.hero.equipment` (bonus résolus, jamais d'id
  d'item), `World.queueHeroEquipment` (appliqué au début du pas suivant),
  `refreshHeroStats` (`sim/systems/hero.ts`), `Entity.onHit` (compteurs des
  effets d'arme, `combatSystem`), `World.itemDrops` / `dropItem` et ordre `pickupItem`.
- Rendu : `render/toonCatalogue.ts` (catalogues et objets tenus, partagé
  avec l'Atelier : `createHeldPiece`), `render/heroEquipmentView.ts` (arme
  / bouclier du Héros, outil temporaire), `render/itemDropViews.ts`.
- Outils : `workshop/workshopStage.ts` (scène d'aperçu partagée Atelier /
  Éditeur d'items), `itemEditor/` (`itemEditorConfig.ts` pur, UI).

## 13 quater. Camps neutres et coffres

- Carte : `MapDef.camps` (`MapCampDef`, objet **sémantique** depuis le
  2026-11-04 : `kind`, `x`, `z`, `level?`, `facing?` = dos du camp,
  `guardOverrides?`), produit par `placeCamps`
  (`config/maps/proceduralSurvival.ts`, liste `CAMP_SITES`) ou posé dans
  l'éditeur. **Tout le dérivé** (rayon `CAMP_CLEAR_RADIUS`, coffre, postes
  de garde, décor en props traversables, barils) vient d'une seule fonction,
  `campLayoutOf` (`data/campLayout.ts`), partagée par le générateur,
  l'éditeur et le jeu ; `expandMapCamps(map)` ajoute décor et barils aux
  listes concrètes **une fois**, à la consommation (`survivalMapFor`, carte
  de « Tester le scénario »), jamais dans le fichier. Un fichier plus ancien
  (coffre, postes, décor écrits) est converti par `mapSerializer.ts`
  (`readLegacyCampCleanup`). `CampKindDef.layout` (`small` / `large`) et
  `shortName` (catalogue) complètent `data/camps.ts`.
- Données : `data/camps.ts` (`CAMP_KINDS` : gardes, détection, laisse,
  régénération, table du coffre, or), `data/loot.ts` (tables,
  `ENEMY_LOOT_TABLES`).
- Résolution : `run/camps.ts` (`campSpecOf` : objet sémantique + type +
  `campLayoutOf` → `CampSpec`, niveau des gardes = override, sinon niveau
  du camp, sinon 1), appelée par `main.ts` à la mise en place de la
  bataille.
- Simulation : `sim/systems/camps.ts` (`campSystem` avant le ciblage,
  `campClearSystem` après les morts, `isChestLocked`),
  `World.addCamp / camps / chests / campEvents / lootEvents`, butin à la
  mort (`Entity.lootTableId`, tiré une fois), ordre `openChest` (travail
  du Héros). Champs génériques d'entité : `campGuard` (poste, retour,
  calme), `huntZone` (zone de chasse lue par `targetingSystem` à la place
  de l'aggro).
- Rendu : `render/campViews.ts` (flammes, lumière, coffres). La
  découverte d'un camp (brouillard) reste côté `main.ts`.
- Extensible : plusieurs camps par carte (ids = indices), types de camp
  et tables par niveau, coffres sans camp (`Chest.campId` null).

## 13 quinquies. Inventaire unique, économie, contrôles

- `sim/inventory.ts` : inventaire RPG pur (cases d'équipement seulement :
  aucune ressource, KI-63 close le 2026-11-03 ; les ressources vont dans
  `Entity.cargo`, §13 nonies), actions (`InventoryAction`),
  `resolveEquipmentBonus` (données fixes des items au niveau de l'exemplaire :
  `InventorySlot.level`, `equippedLevels` ; `HeroEquipmentBonus.damage` =
  physique, `magicDamage` à part ; un inventaire sans niveaux vaut 1). État : `Entity.hero.inventory` ; l'interface
  passe par `World.queueInventoryAction` (pas suivant) ; `run/heroEquipment`
  ne garde que descriptions et visuels.
- Données : `data/resources.ts` (sources, outils, cargo), `data/hero.ts`
  (`HERO_INVENTORY_SLOTS`), `data/loot.ts` (`ENEMY_GOLD_DROPS`),
  `data/equipment.ts` (`BODY_LAYOUT`, torse / bras / jambes).
- Or au sol : `World.dropGold` (tas = `resourcePiles`, ressource `gold`),
  `World.goldDropBonus` (talent résolu par `main.ts`).
- Interface : `ui/economyHud.ts`, `ui/heroInventory.ts` (grille,
  silhouette, glisser-déposer HTML5, infobulle) ; `main.ts` :
  `rtsCommandIds` (unités sélectionnées seulement depuis G47), `updateEdgeScroll`, cercle du Soin,
  `arrowEconomy` (console). `run/userSettings.ts` : vitesse caméra (clé
  propre). `config/maps/blankMap.ts` : carte vierge de l'éditeur.

## 13 sexies. Destructibles, production, réparation

- Barils : `BUILDINGS.barrel`, `World.addDestructible` (entité bâtiment
  de l'équipe adverse, `Entity.destructible`), butin `DESTRUCTIBLE_LOOT`
  (`World.dropResource`), ciblage automatique exclu (`targeting.ts`),
  rendu `render/destructibleViews.ts`. Carte : `MapDef.destructibles`.
- Production : `buildingProduction.ts` (cases devant le bâtiment),
  `Entity.rally`, `World.queueRallyPoint`, `ProductionSpawnEvent.rally`
  (ordre de déplacement donné par `main.ts` à l'apparition) ;
  `render/rallyMarkers.ts`.
- Réparation : ordre `repair` (travail du Héros, `HeroState.repairJob`,
  événement `repairEnd`), coût `run/buildingRepair.ts`, paiement et
  remboursement dans `main.ts` (registre par `repairId`, refus de commande
  remboursé).
- Murailles diagonales : supprimées avec le Wall V1 (2026-11-02, §13 octies).
- Défaite : `World.isBaseLost`. HUD : `ui/actionProgress.ts`.

## 13 septies. Niveau d'unité, règles de survie, sol du village, HUD officiel

- Niveau d'unité : `data/unitLevels.ts` (`normalizeUnitLevel`,
  `resolveUnitLevel` : explicite > règle > 1, `unitLevelFromUpgradeLevel`),
  `Entity.level`. La simulation reçoit un niveau **résolu** et n'en dérive
  aucune stat : `World.spawn` / `spawnBuilding` → 1, `spawnHero` →
  niveau de la progression (synchronisé par `gainHeroXp`), `addCamp` →
  `CampSpec.guards[].level`. Résolution : `run/camps.ts` (`campSpecOf` :
  poste > camp > 1), `main.ts` (`rememberPlayerUnitLevel`,
  `rememberEnemyUnitLevel`, `setupTestBattle` pour `MapUnitPlacement.level`).
  Fiche : `run/entityInfo.ts` (`battleUnitInfo`, `battleGroupInfo` lisent
  `Entity.level` ; l'ancienne table `battleUnitLevels` de `main.ts` est
  supprimée).
- Format de carte : `MapUnitPlacement.level`, `MapCampDef.level`,
  `guardPosts[].level`, `MapDef.survivalRules` et `usesHeroRtsRules`
  (`config/mapDef.ts`). Les règles de la Survie Hero RTS se lisent par
  `usesHeroRtsRules`, jamais par `MapDef.generator` (graine seulement).
  Générateur : `config/maps/proceduralSurvival.ts` (`generatedCampLevel`,
  point d'entrée d'une future difficulté procédurale). Éditeur :
  `editor/editorState.ts` et `editor/mapSerializer.ts` conservent le niveau
  des unités.
- Sol du village : `render/settlementGround.ts` (calcul pur des cases),
  `Board.terrain` = `ChunkedTerrainView` (`render/board.ts`,
  `render/terrainChunks.ts`, `updateSurfaces` : morceaux touchés
  seulement), `main.ts` (`updateSettlementGround` toutes les 0,2 s en
  temps réel, emprises dans l'ordre de pose, remise à zéro à chaque run).
- HUD : `ui/hudDefaultLayout.ts` (`officialHudLayout(largeur)`, format de
  l'export), `ui/hudLayout.ts` (verrou, layout officiel par bloc,
  `ResizeObserver` : un bloc qui change de taille est reposé sur son ancre,
  export depuis la position affichée), `run/userSettings.ts`
  (`arrow-tactics.hud-unlocked.v1`, `arrow-tactics.inventory-window.v1`),
  `ui/heroInventory.ts` (déplacement de la fenêtre), `ui/buildMenu.ts`
  (panneau au-dessus du bouton), `render/spellTargetFeedback.ts` (flash de
  cible validée, groupe `spell-target-feedback`).
- Arbres : `TREE_WOOD_AMOUNT` (`data/resources.ts`),
  `World.resourceNodeAmounts` (bois restant par source, arbres seulement),
  décompte dans `heroWorkSystem` (`HeroWorkContext.nodeAmounts`), ordre
  refusé sur un arbre épuisé (`applyCommands`). Sélection d'une source
  (arbre ou rocher) : `main.ts` (`selectedResourceNodeId`,
  `resourceNodeAtClick` : feuillage à l'écran puis sol, anneau
  `DepotTargetRing`).
- Sources de ressources (2026-11-02) : `HARVEST_NODE_KINDS`, `canHarvestResource`,
  `STONE_DEPOSIT_AMOUNT` (`data/resources.ts`) ; droits :
  `World.harvestPermissions`, à sa valeur de départ (hache et pioche, or
  compris) depuis le 2026-11-05 — aucun bâtiment n'en ajoute plus
  (`run/harvestPermissions.ts` retiré) ; `HeroWorkContext.canHarvest`
  (`workGoal` : outil absent = arrêt, sauf l'unité en cours d'extraction,
  règle générique conservée) ; épuisement générique
  `World.depleteResourceNode` (toute source : obstacles recalculés depuis
  les sources debout, cases libérées) →
  `World.resourceDepletedEvents` → `main.ts` (`handleDepletedResources` :
  souche ou gravats).
- Arbres abattus : `World.fellTree` (appelé quand la récolte vide un arbre,
  `HeroWorkContext.depleted`) → `World.felledTrees`, `World.treeCells` (cases
  d'arbre debout : construction dans `main.ts`), obstacles `terrainTree`
  recalculés et `World.obstacles` remplacé (grille de pathfinding et cases
  reliées au camp recalculées, caches par tableau) ;
  `World.treeFelledEvents` → `main.ts` (`handleFelledTrees` : décor retiré par
  `InstancedDecor.hide`, souche `stump_roundDetailed` ajoutée au plateau).
- Héros : `heroLevelBonus` (`data/hero.ts`, tranches `HERO_LEVEL_GAINS`),
  seule source des gains par niveau.
- Vagues : `WAVE_UNIT_BY_ROLE` (`data/units.ts`) ; `spawnEnemyReinforcements`
  (`main.ts`) crée le barbare et résout renfort, niveau, or
  (`Entity.goldDrop`, lu par `World.rollDeathLoot`) et butin
  (`Entity.lootTableId`) d'après le rôle.
- File de production : `Entity.productionOrders` (`ProductionOrder` :
  unité ou amélioration), `World.queueProduction` / `cancelProduction`,
  `tickProductionOrders` (seule la tête avance) →
  `World.productionUpgradeEvents` ; `PRODUCTION_QUEUE_MAX`,
  `BUILDING_UPGRADE_SECONDS` (`data/production.ts`). Paiement, annulation
  et niveau appliqué : `main.ts` (`productionPayments`,
  `handleProductionUpgrades`, `applyOwnedBuildingUpgrade` dans
  `run/buildingUpgrades.ts`).

## 13 octies. Murs V2 (Palissade) et VFX de montée de niveau

**Wall V1 supprimé** (2026-11-02) : `core/wallTrace.ts`,
`render/wallVisuals.ts`, `sim/systems/gates.ts`, les bâtiments `wall*`,
les champs `placementMode`, `placeOverBuildingId`, `traceCorners`,
`traceHalf`, `modelLengthScale`, `nativeModelPose`,
`outerFaceTowardHostiles`, `footprintFollowsRotation`, `gate`
(`BuildingDef`), `passableForTeam`, `passageOpen`, `modelFacingYaw`,
`wallJoin` (`ObstacleDef`), `Entity.gate`, le mode Muraille de la
préparation et le tracé de l'éditeur. Les modèles KayKit `neutral_wall_*`
restent comme décors (« Obstacles / structures »).

**Palissade V2, géométrique et sans grille** :

| Couche | Rôle |
|---|---|
| `core/wallLine.ts` | pur : `segmentWallLine` (n = ⌊L / nominal⌋ segments égaux), `wallSegmentObstacle` (capsule), distances et intersections, `wallLineCells` (cases A*), `snapWallPoint` / `planWallLine` / `checkWallLine` (aimantation, refus), `wallSegmentAt` (porte, sélection). Aucune donnée de jeu : longueurs et épaisseurs en paramètres. |
| `data/walls.ts` | familles (`WALL_TYPES`, `WallTypeDef`) : épaisseur, segment nominal, longueurs, PV, coût et durée par case, porte. Extensible (pierre, fortifié…) sans code propre. |
| `data/buildings.ts` | pièces `palisade` / `palisade_gate` (`BuildingDef.wallPiece`), pour tout le générique bâtiment (fiche, PV, ciblage, réparation, mort). Sans `cost` : jamais en boutique. |
| `config/mapDef.ts` | `MapDef.walls` (`WallLineDef` : famille, A, B, camp, rangs des portes) ; `dropLegacyWalls` retire les pièces V1 au chargement (journal `[map] anciens murs ignorés`). |
| `sim/world.ts` | `spawnWallLine` (une entité par segment, `Entity.wall` : ligne, rang, A, B, porte), `replaceWallSegmentWithGate`, `setDoorWanted` (camp demandeur allié du propriétaire), `refreshDoorPassages` (nouveau tableau d'obstacles, même contenu). |
| `sim/systems/doors.ts` | portes au pas fixe, avant le mouvement : ouverture immédiate ; fermeture différée tant qu'un corps allié touche la capsule ; chaque changement remplace `World.obstacles` (caches par camp). |
| `sim/relations.ts` | `areAllied` (relation entre camps, extensible) et `canUnitPassGate` (porte ouverte et alliée). |
| `sim/geometry.ts` | `targetDistance` (portée jusqu'à la ligne d'une pièce de mur, ciblage / combat / Tour / engagement), `bodyPathNearStructure`, capsule dans `findBlockingObstacle`. |
| `sim/systems/movement.ts` | collision capsule ; `findPathFrom` (départ A* hors d'une case bloquée, du bon côté) ; `wallApproachPoint` (poursuite d'une pièce de mur : point du mur le plus proche, de son côté, loin des jonctions). |
| `sim/systems/hero.ts` | portée de chantier jusqu'à la capsule ; enchaînement sur le segment suivant de la même ligne (A → B). |
| `render/palisade.ts` | rendu procédural (un mesh fusionné par segment, porte refaite le 2026-11-05 : deux montants sans linteau + deux vrais vantaux `*_door_left/right` construits chacun dans son sens, animés par `BuildingView.setDoorOpenness`), aperçu teinté (`tintWallGhost`). |
| `main.ts` | menu Construire (`wallChoices`), mode de pose (`wallPlacement`, `runtimeWallContext`, aperçu, paiement sur le stock), vues (`wallViews`), `spawnMapWalls`, fiche « Ouvrir / Fermer » (`doorAction`, action `toggleDoor`) ; éditeur : outils `place-wall` / `place-wall-gate`, groupe `editorWallsGroup`. |
| `editor/editorState.ts` | `walls` (historique : `objectsSnapshot`), `wallPieces`, `wallPlacementContext`, `planWallTo`, `wallClick`, `placeGateAt`, sélection `wall`. Même `core/wallLine.ts` que le jeu. |
| `run/buildingRepair.ts` | coût de réparation d'une pièce de mur au prorata de sa longueur. |
| `render/battleSelection.ts` | clic sur une pièce de mur : distance au segment projeté. |

**VFX de montée de niveau** (PROVISOIRE, remplaçable) : la simulation émet
déjà `HeroEvent` `levelUp` (`gainHeroXp`) ; `main.ts`
(`handleHeroEvents` → `playLevelUps`) agrège les niveaux d'un même pas
par Héros, fait réagir le badge (`HeroHud.pulseLevelUp`) et lance
`levelUpVfx.play` (Héros vivant seulement). `render/levelUpVfx.ts`
expose l'interface `LevelUpEffect` (`play`, `tick`, `clear`) et une
implémentation procédurale (`createProceduralLevelUpEffect`, `three`
seul) ; remplacer l'effet = fournir une autre implémentation, sans toucher
à l'XP ni à la simulation.

## 13 nonies. Or monnaie, outils de la Forge, variantes, Sanctuaire, Écurie (2026-11-03)

- **Cargo économique** (2026-11-03, remplace le stock direct) :
  `data/resources.ts` (`CargoResource` = wood | stone | minedGold,
  `ResourceCargo`, `CARGO_CAPACITY`, `cargoResourceOf`), `Entity.cargo`
  (`CargoState` : compteurs, capacité, `returnTo` = tâche à reprendre après
  un dépôt automatique, `auto` = dépôt lancé par la boucle, qui enchaîne
  sur d'autres points). `sim/systems/cargo.ts` (`cargoWork`) : une seule
  boucle récolte → plein → dépôt → retour, partagée par le Héros
  (`heroWorkSystem` appelle `cargoWork` **avant** son repli « cible perdue
  → Garde », pour que le cargo gère lui-même un point détruit) et le
  Villageois (`workerSystem`) ; mort : `loseCargoOnDeath`. **Points de
  collecte par données** : `BuildingDef.dropOff` (Baliste : tout ; Scierie :
  bois ; Camp de mineur : pierre, or extrait), `nearestDropOff(e, entités,
  ressource)` (allié, terminé, vivant, le plus proche), aucun test d'id ;
  `goDeposit` essaie les ressources portées de la plus à la moins portée et
  prend le premier point trouvé ; fin d'un dépôt automatique partiel
  (`auto`) → `goDeposit(…, 'chain')` vers le point suivant, silencieux
  sans point ; point perdu en chemin → `goDeposit(…, 'reroute')`.
  `sim/orders.ts` remet `returnTo` et `auto` à zéro sur tout ordre manuel.
  La simulation ne crédite jamais : elle publie
  `World.cargoEvents` (`cargoDeposit`, `lootGold`, `pilePickup`,
  `cargoFullNoDropOff`, `cargoLost`) ; `main.ts` (`handleCargoEvents`,
  `creditStock`) crédite `RunState.resources` ou `RunState.gold` ; le
  clic droit sur un point de collecte n'envoie `deposit` qu'aux unités qui
  portent une ressource acceptée (sinon message). L'inventaire RPG
  (`sim/inventory.ts`) ne connaît plus les ressources (KI-63 close).
  Rendu : `updateCarryBundle(view, cargo)` ; fiche : `dropOffRows`
  (`run/entityInfo.ts`).
- **Outils** : `data/resources.ts` (`HARVEST_TOOLS` : `axe`, `pickaxe` ;
  `STARTING_HARVEST_TOOLS` = les deux, à tout camp dès le départ, l'or des
  gisements à la pioche depuis le 2026-11-05 (G37) ;
  `STARTING_HARVEST_PERMISSIONS`, valeur par défaut de
  `World.harvestPermissions` ; `HARVEST_NODE_KINDS` : outil, geste, unité,
  quantité). Plus de `goldPickaxe`, de `BuildingDef.unlocksTools` ni
  d'annonce d'outil ; la simulation ne lit que `World.harvestPermissions`.
- **Gisement d'or** : `ObstacleDef.ore: 'gold'` sur un `rock` ; rendu
  `render/rocks.ts` (Rocher E + pépites procédurales, graine = position).
- **Variantes visuelles** : `BuildingDef.modelVariants`,
  `OwnedBuilding.modelVariant`, `RunState.placedBuildingCounts` ;
  `gameplayBuildingObstacle(…, modelVariant)` choisit le modèle.
- **Technologies et niveaux de producteurs** (2026-11-05, G41) :
  `TechnologyDef.site` (id du bâtiment), `BuildingDef.upgradeScope` et
  `rosterBonusPerLevel` ; action de fiche `research` ; voir §10.
- **Producteurs** : tout bâtiment à `recruitmentUnlock` produit par sa file
  (`data/production.ts`) et reçoit le ralliement ; Sanctuaire, Écurie et
  Auberge n'ajoutent aucun code de production.
- **Villageois** : `UnitDef.worker: true` → `Entity.worker` (`WorkerState` :
  geste, minuteur) et `Entity.cargo` (capacité 10, `CARGO_CAPACITY`, 5
  avant le 2026-11-05). Temps par unité : `HARVEST_NODE_KINDS[r].seconds`
  (`data/resources.ts`), × `HERO_HARVEST_FACTOR` (`data/hero.ts`) pour le
  Héros, lus par `cargoWork` ; cadence des clips chop / mine calée dessus
  par `UnitViews` (`HARVEST_STROKES_PER_UNIT`). `sim/systems/workers.ts`
  (`workerSystem`, après `heroWorkSystem`) appelle `cargoWork` ;
  `sim/orders.ts` accepte `harvest`, `pickup` et `deposit` des entités à
  `worker`. Aucune attaque : `damage` 0, `aggroRange` 0 (`data/units.ts`).
  Rendu : kit `villageois` (`toonUnitRig.ts`, `human_villager.glb`, outils
  `tool_axe` / `tool_pick` montrés par `setWorkerTool` selon `working` ;
  rôles `chop` / `mine` sur l'estoc, `gather` / `deposit` sur le repos) ;
  un clip partagé par plusieurs rôles reçoit une action par rôle
  (`buildToonUnitModel`), pour que `UnitViews` distingue l'attaque du
  geste de travail.

## 13 decies. Tourbillon (2026-11-03)

- Données : `data/spells.ts` (`SpellDef.whirlwind`, `WhirlwindEffect`,
  `targeting: 'self'`), `data/heroes.ts` (Paladin : `['heal', 'whirlwind']`).
- Simulation : `HeroState.whirlwind` (`WhirlwindState` : temps, frappes,
  dégâts figés). Lancement (2026-11-05) : `applyCommands` (`sim/orders.ts`)
  ne remplace PAS l'ordre du Héros pour un sort `whirlwind` : il pose
  `HeroState.pendingWhirlwind`, que `heroWhirlwindSystem` (après
  `movementSystem`, avant `heroWorkSystem`) démarre au même pas (mana,
  snapshot, `spellStart`), après avoir avancé les effets en cours ; le
  déplacement et le chemin continuent. Frappes toutes les
  `pulseSeconds` (0,5 s, 10 par effet) par `applyDamageToEntity` ;
  `combatSystem` saute un Héros en Tourbillon ; `applyCommands` refuse
  `cast` et le travail (`'channeling'`), et un sort en recharge
  (`'cooldown'`). Recharge : `SpellDef.cooldownSeconds`,
  `HeroState.spellCooldowns` (posée à la fin de l'effet, décomptée dans
  `heroWhirlwindSystem` pour tout Héros, vivant ou à terre). Événements `spellStart`,
  `whirlwindPulse` (`hits` : cibles touchées, d'où le flash blanc par
  cible dans `main.ts`, `playHitFlash`), `whirlwindEnd`.
- Rendu : `render/whirlwindVfx.ts` (`WhirlwindEffect`, implémentation
  procédurale remplaçable, comme `LevelUpEffect`) ; rotation visuelle dans
  `UnitViews` (`whirlwindSpin`, ajoutée à `rotation.y`, jamais à
  `facing`), vitesse partagée avec les arcs de l'effet
  (`WHIRLWIND_SPIN_RAD_PER_S`). UI : `main.ts` (`heroHudState`, `heroActionProgress`,
  sort sur soi lancé sans ciblage), icône `paladin_whirlwind`
  (`ui/itemIcons.ts`).

## 13 undecies. Éditeur : carte procédurale et éléments de Survie (2026-11-03)

- `main.ts` (`generateEditorMap`) appelle `generateSurvivalMap`
  (`config/maps/proceduralSurvival.ts`) puis `resetEditorWithMap` : une
  seule implémentation du générateur pour le jeu et l'éditeur.
- `EditorState.features` (`EditorFeature` : camp, tas, destructible),
  sélection `{ kind: 'feature' }`, gabarits `EditorFeatureTemplate`
  (`pile-wood`, `pile-stone`, `barrel`, `start`, `camp:<kind>` ;
  `campKindOfTemplate`), `placeFeatureAt` (camp : `campPlacementIssue`,
  niveau 1, `campFacingFrom` à l'opposé du Départ ; `start` :
  `moveBallista`), `moveFeatureTo` (camp entier, tas, baril ; nouvel objet,
  jamais une mutation, pour les instantanés), `setCampLevel`,
  `startPlacementIssue` (`canMoveBallistaTo` ne demande plus le
  territoire), `survivalValidation` (erreurs / avertissements), constantes
  PROVISOIRES `CAMP_MIN_SPACING`, `CAMP_START_CLEARANCE`,
  `CAMP_RING_OPEN_MIN` ; `survivalRules` et `generator` gardés tels quels.
  `exportMapDef` réécrit `camps` (sémantiques), `resourcePiles`,
  `destructibles` ; `loadMapDefFromFile` les relit (entrées invalides
  écartées, anciens camps convertis).
- Vues : `editorFeaturesGroup` (`syncEditorFeatureViews`, clé = liste,
  positions, niveaux, sélection, Départ) ; un camp = marqueurs (clairière,
  mât) + décor dérivé (`buildObstacleMesh`), coffre, gardes (`buildUnit`),
  barils, tous sous un groupe tagué `featureId` (clic sur une pièce =
  camp entier, avant les décors) ; seuls les marqueurs tagués
  `editorMarker` sont libérés. Marqueur du Départ Survie
  (`editorStartMarker`) ; `ballistaPlatform` visible seulement si
  `ballistaExplicit`. Aperçus : `buildCampPreview`, `buildStartPreview`,
  `updateEditorFeatureMovePreview`. Panneau d'informations :
  `editorInfoLines(state)` + validation (`refreshEditorInfo`, à chaque
  `refreshEditorObjects`). Fiche : `PropertiesSubject` `feature`, champ
  `fields` (`campLevel`, handler `onSetCampLevel`). « Nouvelle carte » =
  `createBlankMap` (sans `ballista`, règles `hero-rts`). Vue globale =
  `resetEditorCamera` (`Renderer.frameBox` sur l'emprise des cases).
- « Tester le scénario » (`testScenario`) : `survivalValidation` bloque sur
  erreur ; carte = `expandMapCamps(exportMapDef(...))` ; `setupTestBattle`
  crée camps et barils comme `startBattle`, et le Héros à côté du Départ
  (`computeArmyFormation`) sur une carte `hero-rts` sans Héros de
  scénario ; la fin « plus de combattant adverse » est ignorée en test sur
  une carte `hero-rts` (défaite ou Échap seulement).

## 13 duodecies. Camp de départ, vitesse, générateur (2026-11-04)

- **Vitesse** : `UNIT_MOVE_SPEED_MULTIPLIER` et `withEffectiveMoveSpeed`
  (`data/units.ts`) appliqués là où la simulation résout les stats d'une
  entité : `World.spawn` (base + overrides d'amélioration) et
  `refreshHeroStats` (niveau + équipement) ; toute lecture de
  `Entity.stats.moveSpeed` (mouvement, prédiction de la Baliste, fiches)
  voit donc la vitesse finale ; `UNITS` garde les valeurs de base. Rendu :
  `UnitViews.createView` multiplie le `timeScale` du clip `walk` de tout
  kit riggé ; cycle procédural (`WALK_CYCLE_SPEED`) idem.
- **Camp de départ** : `config/startingBase.ts` (dans `config/`, car le
  générateur s'en sert ; aucun import de `data/`) : `STARTING_BASE_PRESETS`
  (`basic-camp` : bâtiments relatifs avec façade et variante, enceinte
  polygonale `enclosure = { type, sides, radius, gateLength }` dont les
  lignes de mur V2 sont dérivées (porte = ligne dédiée centrée sur +z,
  `gates: [0]`, `openGates`), unités, Héros), `DEFAULT_STARTING_BASE_PRESET`,
  `STARTING_BASE_MARGIN` ;
  `startingBaseLayoutAt(origin, preset, rotation)` (quarts de tour) ;
  `startingBaseLayoutOf(map)` (`MapDef.ballista` + `MapDef.startingBase`,
  défaut pour une carte `hero-rts`, `none` = aucun) ;
  `startingBaseRotationFor(origin, preset, isOpen)` (porte vers le côté le
  plus dégagé) ; zone réservée en **disque** (`StartingBaseDisc`,
  `startingBaseReservedAt`, `reservedCells`, `reservedContainsCell`,
  `reservedOverlapsDisc`), `bounds` = boîte englobante ; gisements et
  bosquet garantis (2026-11-05 : `preset.deposits` → `layout.deposits`,
  `preset.trees` → `layout.trees` (centres de cases entières, ≥ 6),
  `startingBaseObstacles(layout)` = obstacles ordinaires `rock` 2 × 2
  (`ore: 'gold'` pour l'or) et `tree` 1 × 1, quantités de
  `data/resources.ts`) ;
  `expandStartingBase(map)` (enceinte ajoutée à `MapDef.walls`, gisements
  et arbres à `MapDef.obstacles` à la consommation, comme `expandMapCamps` ;
  rien n'est sérialisé). Éditeur : `editorStartMarker` (`main.ts`) affiche
  les rochers (`userData.startDeposit`) et les arbres
  (`userData.startTree`) ; `startPlacementIssue` compte leurs cases comme
  occupées.
  `WallLineDef.openGates` → `World.spawnWallLine(…, { openGates })`
  (`spawnMapWalls`). Consommateurs : `survivalMapFor` (murs) ;
  `applyStartingBaseToRun` (`main.ts` : bâtiments → `RunState.buildings`
  à pleins PV avec `modelVariant` et `placedBuildingCounts`, unités →
  `RunState.army`) ; `computeArmyFormation` (places du Héros et des
  unités du preset) ; `setupTestBattle` (mêmes bâtiments en bâtiments de
  scénario, mêmes unités) ; éditeur (`EditorState.startingBase`,
  `startingBaseLayoutFor`, `startingBaseLayout`, `startPlacementIssue`
  sur toute l'emprise, `campPlacementIssue` refuse l'emprise ;
  `editorStartMarker` affiche le camp dérivé et le contour, groupe tagué
  `startMarker` = sélection du Départ, ignoré par `pickEditorObjectAt`
  quand le Départ est déjà sélectionné (le clic devient un déplacement) ; `buildStartPreview` montre
  l'emprise et l'enceinte ; `setBallista` restaure la rotation ;
  sérialiseur : `startingBase` lu / écrit, `openGates` des murs conservé).
- **Générateur** (`config/maps/proceduralSurvival.ts`) : zone du camp de
  départ (toutes rotations) en `keepClear`, sans décor ni tas ;
  gisements posés **après** une première `shapeForests` et **avant** une
  seconde qui les voit comme de l'eau (obstacles fixes), avec un anneau
  d'une case gardé dégagé et deux cases sans eau, relief, rampe ni autre
  gisement ; candidat refusé déplacé localement (spirale de 4 cases) ;
  goulets : un « mur » est toute case non accessible depuis le passage
  (flancs de rampe compris) ; `reached` recalculé avec arbres **et**
  gisements ; camps neutres : abords stricts (2,5 cases sans eau, colline,
  rampe ni bord), recherche fine puis repli, arbres retirés jusqu'à 2 cases
  au-delà de la clairière, écart entre camps mesuré de centre à centre ;
  `MapDef.startingBase` écrit avec la rotation choisie.

## 13 sedecies. Passe gameplay du 2026-11-05 (Villageois autonomes, or au contact)

- **Villageois autonomes** : `sim/systems/workers.ts` (`workerSystem`,
  `chooseWork`) ; état dans `WorkerState` (`idleSeconds`, `autoRetryIn`,
  `autoNodeId`, `autoWorked`) ; constantes `WORKER_IDLE_SECONDS` (1) et
  `WORKER_AUTO_RETRY_SECONDS` (5) dans `data/hero.ts`. Inactif = ordre
  `guard`, aucun geste, `cargo.returnTo` nul. Choix : parmi les sources
  valides **et visibles** (`HeroWorkContext.isVisible(x, z)`, 2026-11-05,
  G43), ressource la moins
  travaillée (recolte / dépôt / tas dont la boucle revient à une source),
  puis source visible valide la plus proche, puis id ; ordre `harvest` posé
  directement avec `resetNavigation` (exportée de `sim/orders.ts`). Aucun
  pathfinding spéculatif : un échec (rien récolté) écarte la source au
  prochain essai, après `WORKER_AUTO_RETRY_SECONDS`.
- **Visibilité résolue par l'orchestration** (G43) : `World.visibility`
  (`((x, z) => boolean) | null`, null = tout visible) est posée par
  `main.ts` avant chaque `world.step` à partir du brouillard de guerre du
  rendu (`fogActive()` → `fogOfWar.isVisible`), comme
  `harvestPermissions` ; `World.heroWork()` l'expose en `isVisible`. La
  simulation ne connaît ni `render/fogOfWar.ts` ni l'origine de la
  visibilité ; sans brouillard (tests, « Tester le scénario »), tout est
  visible. Aucun second système de vision.
- **Récolte au contact** (G43) : `workGoal` (`sim/systems/hero.ts`) rend
  aussi `box` (cases bloquantes de la source) et une tolérance par unité
  (`WORKER_HARVEST_REACH` 0,3 pour un Villageois, `HARVEST_REACH` 0,7 pour
  le Héros, `data/hero.ts`) ; `movementSystem` vise `harvestStandPoint`
  (`sim/systems/movement.ts`) : milieu d'une case libre contre un côté de
  la boîte, à `rayon + HARVEST_STAND_GAP` (0,15) du bord, la plus proche de
  l'unité (jamais un coin, jamais le centre : plus d'oscillation en
  diagonale) ; le point retenu doit être **atteignable** : ligne droite
  dégagée, sinon sa case est reliée à l'unité (`reachableHarvestStand`, même grille
  et mêmes obstacles que la poursuite, aucun A* depuis G49, une
  seule fois par ordre, résultat mémorisé dans `NavState`). Aucun côté
  libre ou atteignable (source enfermée, région coupée), ou route perdue
  en chemin : aucun point de travail,
  l'ordre s'arrête au premier pas — ordre manuel (Héros ou Villageois) :
  `finishOrder` avec `OrderEndEvent` `harvest` / `failed` / `unreachable`,
  message « Aucun accès à cette ressource » (`main.ts`, après `world.step`) ;
  source choisie seule par un Villageois : retour en Garde sans événement,
  `autoNodeId` gardé et `autoWorked` faux, donc évitée au choix suivant
  (`workerSystem`), qui a lieu aussitôt après 1 s d'inactivité.
- **Orientation et gestes de travail** (G43, rendu) :
  `UnitViews.setWorkTargetResolver` (posé par `main.ts` : position de la
  source de l'ordre `harvest` dans `World.resourceNodes`) ; `renderedFacing`
  vise cette source dès que l'unité est à l'arrêt en `chop` / `mine` (cap
  fixe, virage progressif, ni `forwardDir` ni animation ne l'écrasent).
  `ClipRole.from` (`render/toonUnitRig.ts`) prête un clip du GLB d'une
  autre unité humaine du pack (mêmes os) : le Villageois joue `workingA`
  (hache) et `workingB` (pioche) du GLB du Héros à 0,65 ; `clipsOfFile`
  charge et met en cache les animations d'un fichier une seule fois.
- **Or de butin au contact** : `heroWorkSystem` (`sim/systems/hero.ts`),
  avant `workGoal` : tout tas `gold` à `rayon + PICKUP_REACH` est vidé,
  événement `lootGold` (`World.cargoEvents`, crédité par `main.ts`
  `handleCargoEvents`), un ordre `pickup` sur ce tas s'achève ; `cargoWork`
  ne ramasse plus l'or (un Villageois qui y est envoyé repasse en Garde).

## 13 septdecies. Passe du 2026-11-05 (G46) : XP, camp agrandi, constructeurs, ergonomie, dégâts, loot

- **XP** : `HERO_XP_RANGE` (`data/hero.ts`, 12) remplace
  `HERO_XP_SHARE_RADIUS`.
- **Camp de départ** : preset `basic-camp` rayon 15 (`config/startingBase.ts`,
  éléments repoussés en périphérie, `nearbyGold.distance`) ; générateur :
  zone de départ définie avant collines et mares (celles qui mordraient sur
  la zone réservée sont abandonnées après le tirage, sans changer les
  autres), or proche posé après le choix de la rotation (hors axe de la
  porte, 4 × 4 libre, sans couper de chemin), gisements injoignables
  reposés, **zigzags d'une case** entre arbres élargis (un corps de rayon
  0,6 s'y coinçait), `CAMP_START_CLEARANCE` 21 dans l'éditeur ; camps
  neutres : site strict sans gisement ni tas à 2,5 cases ;
  `expandMapCamps` omet un baril qui pincerait un gisement (KI-65) ;
  `VISION_RADIUS.ballista` 21, `INITIAL_EXPLORED_RADIUS` 25.
- **Villageois constructeurs** : `applyCommands` accepte `build` pour un
  `worker` ; `constructSite` (`sim/systems/hero.ts`) partagé par
  `heroWorkSystem` et `workerSystem` (événement `built`, `heroId` = unité
  constructrice) ; `WorkerState.working` accepte `build` ; rendu : rôle
  `build` du Villageois (`workingC` du Héros), hache en main.
- **main.ts** : `builderIds()` (Héros ou Villageois commandés) pour le
  menu Construire et l'ordre de construction ; `confirmBuildingPlacement`
  garde le mode avec Maj (`event.shiftKey`) et vérifie à nouveau le coût ;
  double-clic bâtiment : `inspectVisibleSameTypeBuildings`,
  `battleInspectedGroupIds` (groupe homogène, anneaux par
  `syncBattleInspectionGroup`, titre « ×N »), actions sur le principal ;
  crochets console `arrowRewards`, `arrowInspection`.
- **Item Editor** : `archetype`, section « Progression par niveau »,
  export / import avec `scaling` ; ancien champ `damage` relu comme
  `physicalDamage`.

## 13 octodecies. Passe du 2026-11-05 (G47) : acquisition, sélection, files, ralliement, effets d'arme

- **Acquisition** : `acquisitionPlan(inv, itemId, heroId)` (`'equip' | 'bag' |
  null`) et `acquireItem` (`sim/inventory.ts`) sont la seule règle ; le plan
  sert à la mention de la carte (`main.ts`, `ui/waveRewardPanel.ts`), qui ne
  peut donc pas diverger. Consommateurs : action `acquire`
  (`applyInventoryAction`), ramassage (`sim/systems/hero.ts`, événement
  `itemPickup` avec `equipped`). L'action `add` reste « vers le sac ».
  Portabilité : `canHeroEquipItem(heroId, item)` (`data/heroes.ts`), contrôlée
  aussi par `equipFromSlot`. `World` transmet `hero.hero.heroId` et recalcule
  les bonus si `equipped` **ou** `equippedLevels` change.
- **Icônes** : `ui/slotIcons.ts`, `SLOT_ICON_PATHS: Record<EquipmentSlot, string>`,
  masque CSS `--icon`. Le type impose une icône par emplacement, sans repli.
- **Sélection** : `rtsCommandIds()` ne renvoie que la sélection ; plus
  d'`implicitId` dans `render/battleSelection.ts`. `hasBattleSelection()` décide
  de l'Échap. `builderIds()` n'a plus de repli sur le Héros. `followHero()`
  sélectionne (lancement, Espace, portrait).
- **Ralliement** : `issueRightClickOrder` → sans unité,
  `setRallyOfSelectedProducers` (`selectedProducerIds()` : fiche inspectée ou
  groupe du double-clic, même règle que le bouton), qui passe par
  `World.queueRallyPoint`. `render/rallyMarkers.ts` reçoit un ensemble d'ids.
- **Barres** : `ui/actionProgress.ts` expose `createProgressBar` /
  `setProgressBar`, utilisés par `ActionProgressBar` et `entityInfoPanel`.
  `.progress-track` porte le visuel, `.hero-progress` et
  `.entity-info-progress` le placement. `orderProgress`
  (`run/productionOrders.ts`) calcule l'avancement ; `EntityInfoAction.progress`
  le transporte ; `structureKey` n'en retient que la présence.
- **Clics d'interface** : `.entity-info` en `pointer-events: auto` ;
  `heroInventory.rightClick` fait `preventDefault` et `stopPropagation`. Le
  `contextmenu` global existant sur `document.body` est conservé.
- **Effets d'arme** : données `TriggeredEffect { every, repeat, effect, amount }`,
  `ITEM_EFFECTS`, union extensible par `kind` (`data/equipment.ts`). `sim/` ne
  voit pas les items : `resolveEquipmentBonus` produit
  `HeroEquipmentBonus.procs` (`ResolvedWeaponProc`, clé
  `slot:id:index`, montant en unités internes). `refreshHeroStats` reconstruit
  `Entity.onHit` (`WeaponProcState`) et garde le compteur des clés encore
  portées. Événement `{ result: 'proc', damage, damageType: 'magic',
  damageSchool }`, un par déclenchement ; `main.ts` l'affiche
  (`CombatOverlay.spawnSchoolText`, flash). Déterministe, sans RNG, pas de
  récursion : le déclenchement n'appelle pas `resolveStrike`.
- **Item Editor** : `readEffects` (tableau, ou ancien `onHit.fireDamage`) et
  `cleanItem` (`itemEditor/itemEditorConfig.ts`) ; champs `effect-N-*`.

## 13 novodecies. Passe du 2026-11-06 (G48) : placement libre, chantiers, 4 portes, mort du Héros

- **Principe** : **placement continu, navigation en grille dérivée**. Carte,
  génération, terrain, ressources, camps et A* restent en cases.
- **Géométrie** : `core/orientedBox.ts` (pur) : `OrientedBox` (centre, demi-tailles,
  cos / sin de la rotation Three.js), `ContinuousFootprint` (+ `navigationPadding`),
  chevauchement par axes séparateurs, distance, segment, poussée d'un cercle.
- **Données** : `buildingFootprint(id)` (`data/buildings.ts`) lit largeur et
  profondeur dans `footprintTilesX / Z`, sans les dupliquer ;
  `BUILDING_PLACEMENT_PADDING`, `BUILDING_NAVIGATION_PADDING` (0,2) ;
  `BUILDING_ROTATION_STEP` (15°) ; `AUTO_CONSTRUCT_RANGE` (`data/hero.ts`).
- **Obstacle** : `ObstacleDef.footprint` (`buildingContinuousFootprint`) n'est posé
  que par `ownedBuildingObstacle` (`main.ts`) : bâtiments possédés, camp de départ
  compris. Sans lui, `rotationY` reste visuelle et l'emprise reste alignée
  (décors, bâtiments de carte de l'éditeur et de « Tester le scénario »).
  `obstacleBounds` rend sa boîte englobante, simple filtre ; le test exact est dans
  `findBlockingObstacle`, `resolveObstacleCollisions`, `buildPathGrid`,
  `distanceToSite`, `obstacleContainsPoint` (sélection). Conservateur par sa boîte :
  sortie de production, terre battue, tracé de mur près d'un bâtiment tourné.
- **Validation** : `run/buildingPlacement.ts`, `checkBuildingPlacement` (pure, renvoie
  la raison du refus) ; `buildingPlacementWorld()` (`main.ts`) fournit le terrain.
- **Grille** : `rasterizeFootprint` (`sim/pathfinding.ts`) bloque toute case touchée
  par l'empreinte + marge. `bodyPathNearStructure` (`sim/geometry.ts`, ex
  `bodyPathNearWall`) force A* quand la ligne droite passe mais pas le corps. Voir aussi
  §13 vicies.
  `findPathFrom` cherche un départ libre jusqu'à 3 anneaux. `pursueTargetWithPathfinding` :
  case libre la plus proche fermée par les voisins → `nearestReachableTile` ; déjà
  sur la bonne case et ligne libre → approche directe (l'évitement réactif oscillait).
- **Chantiers** : `nextBuildOrder` (`sim/systems/hero.ts`), appelée par
  `constructSite` et quand un autre constructeur a fini le chantier visé ;
  `canReachSite` : inondation depuis l'unité, case libre reliée à moins de 2,5 cases
  du chantier, sans obstacle entre les deux (`HeroWorkContext.canReachSite`).
- **4 portes** : `enclosureLines` (`config/startingBase.ts`) découpe un côté sur
  `sides / 4` ; `inGateApproach` et `GATE_APPROACH_*` (générateur) gardent les couloirs
  en `keepClear` ; `placeCamps` (site strict) évite les axes. `startingBaseRotationFor`
  n'oriente plus que la cour.
- **Mort du Héros** : événement `death` (avec `x`, `z`), `createHeroDeathEffect`
  (`render/heroDeathVfx.ts`, même forme que `levelUpVfx`) ; `main.ts` lance `play`, `tick`
  et `clear`. Aucune dépendance de la simulation vers le rendu.

## 13 vicies. Passe corrective du 2026-11-06 (G49) : aucune boucle de navigation

- **Cause mesurée** : `pursueTargetWithPathfinding` relançait A* à chaque sous-pas tant
  qu'il n'y avait pas de chemin (150 fois par seconde pour une unité, ~5 ms par échec sur
  96 × 96) ; `wallApproachPoint` recalculait le point visé et son côté à chaque sous-pas ;
  les ordres de travail échappaient à toute détection de blocage. Avant : 14 cas sur 60
  sans fin en 25 s ; 3 750 A* et 19 s de calcul pour 25 s de jeu dans le pire.
- **Régions** : `walkRegions` (`sim/pathfinding.ts`), en cache sur la grille, donc
  recalculées seulement quand les obstacles changent. `findPath` rejette un but d'une
  autre région sans recherche. `pathSearchStats` compte, aucune règle ne le lit.
- **Point de travail** : `sim/workStand.ts`, `chooseWorkStand` : candidats autour de la
  cible, `bodyFitsAt`, `bodyPathClear` (le corps passe, pas seulement la ligne de vue),
  coût = distance à pied (`walkDistances`, une inondation, aucun A*) ; à défaut, toute case
  reliée à portée de travail. La case de route (`routeX`, `routeZ`) est le but d'A*, la
  fin se fait en ligne droite. `canReachSite` suit la même règle.
- **État** : `NavState` (`sim/systems/movement.ts`, WeakMap par unité) : point gardé par clé
  ordre + cible (`workStandKey`), points en échec, recherches, watchdog. Revalidé une fois
  quand la liste d'obstacles change (bâtiment posé, porte fermée). Choix bornés
  (`WORK_STAND_MAX_CHOICES`). Attaque d'un mur : `wallApproachPoint` reste, limité par A*.
- **Watchdog** : `navigationWatchdog`, une fois par pas, `movementGoal` décide si l'unité doit
  avancer. Se termine toujours : seule une route plus courte que la meilleure de l'ordre
  (`orderBest`) annule un blocage. Il ne lance aucune recherche. `orderMadeNoProgress` ne
  sert plus qu'à l'attaque. Abandon : `abandonOrder` (silencieux pour `auto`, Villageois).
- **Limite A*** : `mayRepath` + `routedPath`, `PATH_SEARCH_COOLDOWN`,
  `MAX_PATH_SEARCHES_PER_STEP`. Une unité sans recherche permise garde son chemin ou attend.
- **Feedback** : `OrderEndEvent` couvre tous les ordres de travail ; `flashUnreachableOrders`
  (`main.ts`), un message à la fois, 3 s au moins entre deux.

## 13 unvicies. Passe du 2026-11-06 (G50) : noyau de départ, stands de récolte, raccourcis

- **Départ ≠ Baliste** : `MapDef.ballista` reste le **Départ Survie**, centre du camp et de
  l'Hôtel de ville. La vraie Baliste vient du preset (`StartingBasePreset.ballista`,
  `StartingBaseLayout.ballista`, `startingBaseBallistaAt`), et `resolveBallistaOrigin`
  (`config/mapDef.ts`) reste la source unique : run, « Tester le scénario » et l'éditeur la
  lisent. Restent sur le centre : anneau des vagues, cadrage, exploration initiale, or proche.
  Le but de marche des vagues (`assaultGoal`) est l'entité Baliste.
- **Décalages entiers** dans le noyau : une emprise bloque toute case qu'elle touche
  (`buildPathGrid`), et un couloir étroit que la ligne droite accepte mais pas A* fait osciller
  entre les deux (G49 l'arrête, mais l'ordre est perdu) : deux cases avec un centre de case au
  milieu, dans les quatre rotations (`tests/sim/noyau-depart.mts`).
- **Stands** : `sim/harvestStands.ts`. État par unité (`WeakMap<Entity, HarvestReservation>`,
  comme `NavState`), aucune table par monde : les prises se relisent sur les entités à chaque
  choix. `syncHarvestReservations` (une fois par pas, `movementSystem`) libère tout ce qui n'a plus
  lieu d'être. `workGoal` (`sim/systems/hero.ts`) ne déclare une source bloquante atteinte qu'à son
  emplacement ; `settleOnHarvestStand` finit le placement ; `applySeparationPair` ancre
  (`isHarvestAnchored`). Choix : `usableStands` puis `walkDistances` (une inondation, aucun A*,
  seulement s'il reste une place). `nav.stand` n'est qu'un point d'approche avant la
  réservation. Plus de place : `findRedirectHarvestSource` (une inondation, aucun A*, ordre manuel), sinon
  `abandonOrder` ; aucune attente depuis G52. `harvestSourceSaturated` : `chooseWork`, `nextNode`, ce report.
- **Raccourcis** : `activateProductionHotkey` (`main.ts`, avant le `switch` du clavier) lit
  l'action `produceUnit` de `currentEntityInfo()` (`hotkey`) et passe par `onEntityInfoAction` :
  aucune seconde voie de production, aucune règle par bâtiment.
- **Fiche Héros** : `HeroCardInfo` (`kind: 'hero'`, `run/entityInfo.ts`), sans bloc PV au panneau.
- **Tas** : `placePile(..., placed)`, `PILE_DRAWS` : le budget décide des tas posés, les tirages et
  `pileCells` restent ceux de l'ancien budget (camps et or proche lisent `pileCells`).

## 14. Audio

- `audio/` contient un moteur complet : `AudioManager` (bus, budget de voix,
  catalogue de sons nommés), `synthesis.ts`, `sounds/*`.
- Il est **présent mais déconnecté** : `main.ts` n'appelle jamais `unlock()`.
  Aucun `AudioContext` n'est créé et `play()` ne fait rien.
- Les volumes sont lus et écrits via `run/userSettings.ts` (écran
  Paramètres).

## 15. Points chauds techniques

- **`main.ts`** est de loin le plus gros fichier du projet (8 068 lignes
  le 2026-11-04 après la passe de modernisation 1 ; 10 536 avant). Il
  contient :
  - l'état global de session (`world`, `currentRun`, `currentMap`,
    `metaProgress`) ;
  - tous les écouteurs d'entrée ;
  - le démarrage et la fin d'une run de Survie (`startSurvivalWorld`,
    `endSurvivalRun`) ;
  - les sélections et le branchement de la fiche d'entité ;
  - la consommation des événements de simulation ;
  - chantiers, files de production, murs, Forge, Église ;
  - le Héros (sorts, récolte, cargo, inventaire) ;
  - l'orchestration de l'éditeur.

  Beaucoup d'états de module y sont partagés, et l'ordre de déclaration y
  compte (initialisation au chargement du module). Le code de l'ancienne
  boucle en manches (placement, Boutique, fin de manche, agrandissement,
  parchemins ; `inPlacementPhase` apparaissait 32 fois) a été retiré le
  2026-11-04.
- **`ui/screens.ts`** est le deuxième plus gros fichier : il regroupe tous
  les écrans et leurs calculs d'affichage (prix, effets).
- Autres fichiers volumineux : `sim/systems/movement.ts` (déplacement,
  évitement, anti-blocage, collisions) et `ui/style.css`.

## 16. Pièges techniques confirmés

- **Matériaux partagés** : `Object3D.clone()` ne clone pas les matériaux.
  Toute vue qui modifie un matériau (flash, fondu, transparence) clone d'abord
  les siens (`buildingView.ts`, rigs, fantômes de l'éditeur, silhouettes de
  `unitMovePreview.ts`).
- **Rigs** :
  - `SkeletonUtils.clone` est obligatoire pour un modèle riggé (un clone
    simple partagerait le squelette) ;
  - la correction d'orientation se pose sur un **enfant**, jamais sur la
    racine, que `UnitViews` réécrit à chaque frame.
- **Modèles glTF** : `metalness` est forcé, et l'émissive intégrée est
  neutralisée (le flash de dégâts suppose une émissive de repos nulle).
- **Lumières** : aucune `PointLight` n'est ajoutée ni retirée en cours de
  partie (réserve fixe, `render/vfx/lightPool.ts`). Changer le nombre de
  lumières force une recompilation des shaders.
- **Montants fractionnaires** : l'or passe par `roundGold` pour éviter la
  dérive de virgule flottante.
- **Raycast** : `THREE.Raycaster` ignore `visible`. Un mesh invisible reste
  donc touchable (c'est le principe de la zone de saisie de l'anneau de
  l'éditeur). Les indicateurs qui ne doivent pas l'être (anneaux de
  sélection d'unité, silhouettes et empreintes de l'aperçu) neutralisent
  leur méthode `raycast`.
- **Raycast avant le premier rendu d'un modèle animé** : ne jamais lancer de
  rayon sur un modèle riggé tout juste créé, avant qu'il ait été rendu. Sa
  sphère englobante peut être calculée avec des os pas encore mis à jour,
  puis gardée en cache, et le modèle devient impossible à toucher. Voir
  **KI-23**.
- **État de session hors `RunState`** (vues, sélections, minuteurs de
  Mine, correspondances entité ↔ bâtiment possédé) : il est remis à zéro à
  chaque nouvelle run et à chaque fin de run (`resetRunViews`,
  `clearBattleWorld`, `main.ts`).
- **Cache des bornes d'obstacles** (`sim/geometry.ts`) : les bornes sont
  mises en cache par **référence de tableau**, ce qui suppose une liste
  d'obstacles stable pendant une bataille. Or les emprises de bâtiments sont
  ajoutées et retirées **en place** dans `World.obstacles`. Hypothèse **non
  testée** : après la destruction d'un bâtiment en cours de bataille, les
  collisions et la ligne de tir pourraient encore lire des bornes périmées.
  À vérifier.

## 17. Vérifier une modification

- `npm run build` (depuis `arrow-tactics/`) vérifie les types puis construit
  le bundle. C'est la vérification de référence.
- **Tests dans le dépôt** (depuis le 2026-11-04, `arrow-tactics/tests/`,
  mode d'emploi dans `tests/README.md`) :
  - `npm run test:sim` : scripts `tests/sim/*.mts` exécutés par Node
    (24+, suppression native des types via `tests/ts-register.mjs`), sans
    navigateur ni Vite, qui importent directement `src/sim`, `src/run`,
    `src/data` et `src/config` (le générateur de carte compris). Environ
    80 s. `node tests/run-sim.mjs nom` filtre par nom de fichier ;
  - `npm run test:game` : scripts `tests/game/*.cjs` (Playwright, Edge
    par `channel: 'msedge'`) : le lanceur démarre un Vite dédié sur le
    port `TEST_VITE_PORT` (5177), sauf si `VITE_BASE` est défini, et
    l'arrête à la fin ; chaque script ouvre le jeu et pilote le DOM et
    `window.__world`. Plusieurs minutes ; `node tests/run-game.mjs nom`
    filtre ;
  - `npm test` enchaîne les deux. Un test échoue si son processus sort en
    erreur ou si sa sortie contient « ECHEC ». Les captures vont dans
    `tests/game/out/` (ignoré par Git).
  - Ce n'est **pas** une couverture complète : les tests fixent des
    contrats (démarrage, production, talents, technologies et
    améliorations — `tests/sim/technologies.mts`, `tests/game/forge-jeu.cjs`
    —, défaite, cargo, camps, murs, générateur) ; une modification
    d'équilibrage peut légitimement en changer un, à documenter.
- Playwright est installé comme dépendance, mais son navigateur ne l'est pas
  forcément sur la machine. Sous Windows, `channel: 'msedge'` permet
  d'utiliser Edge à la place ; c'est ce que font les tests.
