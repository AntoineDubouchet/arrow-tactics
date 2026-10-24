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
| `core/` | Boucle à pas fixe, petites maths, RNG à graine, calcul pur du déplacement d'unités sur la grille (`gridGroupMove.ts`), découpage pur du tracé de murailles (`wallTrace.ts`) |
| `config/` | Constantes de réglage, types `ObstacleDef`, format de map `MapDef`, territoire par cases (`territory.ts`), arène du Mode survie (`maps/survivalArena.ts`) |
| `data/` | Définitions déclaratives : unités, bâtiments, objets, talents, capacités, upgrades (avec quelques lookups et calculs purs) |
| `sim/` | Simulation de bataille |
| `run/` | État d'une run, méta-progression, réglages, calcul des effets de talents/upgrades, statistiques effectives du joueur (`playerUnitStats.ts`, `ballistaStats.ts`), adaptateur de la fiche d'entité (`entityInfo.ts`), expansion de map |
| `render/` | Tout ce qui touche à Three.js : caméra, plateau, silhouettes, VFX |
| `ui/` | Overlays HTML/CSS par-dessus le canvas |
| `editor/` | Éditeur de maps (état, scène, UI, historique, sérialisation) |
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
| `audio/` | `run/userSettings` |
| `main.ts` | tout, dont `core/gridGroupMove.ts` pour le déplacement d'unités de l'éditeur et de la préparation, et `core/wallTrace.ts` pour le tracé de murailles |

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
  `iceNovaZones` (zones persistantes), `shadowProjectiles`, `playerArrow`
  (cooldown et vols de la flèche du joueur).

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

- ne garde que les obstacles collidables (`isCollidableObstacle` : les props
  décoratifs sont exclus de la simulation, mais restent rendus) ;
- dérive des dimensions symétriques à partir des cellules de terrain
  (`resolveMapCells`, `computeMapCellBounds`, `config/mapDef.ts`) ;
- transforme chaque cellule absente en obstacle « vide » synthétique. Un trou
  dans la carte bloque ainsi exactement comme un rocher, sans que mouvement,
  ligne de tir ou pathfinding connaissent la notion de cellule.

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
  `run/playerUnitStats.ts` (§10), à chaque site d'apparition : bataille,
  « Tester le scénario », production de la Caserne et du Camp d'archerie.
- Pour un ennemi, `main.ts` les calcule à partir de
  `computeEnemyUnitUpgradeEffects` (`run/unitUpgradeEffects.ts`).

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
    trajet tient dans un sous-pas. Seul le pas d'ouverture de la bataille
    l'utilise (`openBattleWithFormationStep`, `main.ts` : un pas d'une case
    pour tout le camp du joueur si toutes les destinations sont libres,
    sinon aucun ; puis Garde, comme les unités produites par une Caserne).
- **Pathfinding** (`sim/pathfinding.ts`) : grille par case reconstruite à
  chaque appel du système de déplacement, A* en 8 directions sans couper les
  coins, et repli sur la case libre la plus proche si la case visée est
  bloquée.
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

## 7. Combat, capacités et dégâts

**Point d'entrée unique des dégâts** : `applyDamageToEntity` (`sim/damage.ts`).
Le bouclier absorbe d'abord, puis les PV baissent. Les appelants :

| Source | Fichier |
|---|---|
| Attaque automatique | `sim/systems/combat.ts` |
| Boule de feu (zone) | `sim/systems/abilities.ts` (`advanceBlasts`) |
| Charge | `sim/systems/abilities.ts` (`advanceDash`) |
| Zones persistantes (Blizzard) | `sim/systems/persistentAreaEffects.ts` |
| Projectiles d'ombre | `sim/systems/shadowProjectiles.ts` |
| Flèche du joueur | `sim/playerArrow.ts` |

- **Combat** : le raté et l'esquive passent par la RNG. La ligne de tir est
  testée par `findBlockingObstacle` ; un tir bloqué provoque un petit
  déplacement latéral (*sidestep*).
- **Capacités** : `AbilityDef` est une union (`charge` | `area-blast` |
  `taunt`, `data/abilities.ts`), configurée directement sur chaque unité dans
  `data/units.ts`. Elle est exécutée par le système générique
  `sim/systems/abilities.ts`. Les projectiles de zone sont stockés dans
  `World` et non sur leur lanceur : ils survivent à sa mort.
- **Hors entités** : la flèche du joueur (`sim/playerArrow.ts`, une volée de
  un ou plusieurs carreaux sous un cooldown commun) et les effets déclenchés
  depuis `main.ts` via `World` (`applyIceNovaRoot`, `createBlizzardZone`,
  `spawnShadowProjectiles`).
- **Mort** : `sim/systems/death.ts` passe `alive` à `false`.

## 8. Circulation des événements simulation → rendu/UI

La simulation émet des **faits** ; `main.ts` décide des réactions (visuelles,
économiques, de progression).

- **Tableaux d'événements, vidés et remplis à chaque tick** :
  `combatEvents`, `abilityEvents`, `areaEffectEvents`, `playerArrowEvents`,
  `shadowProjectileEvents`, `productionSpawnEvents`, `enemyReinforcementSpawns`,
  `buildingAttackEvents`.
- **État lu directement par le rendu** : `entities`, `blasts`,
  `shadowProjectiles`, `playerArrow.flights`, `buildingProjectiles`,
  `iceNovaZones`.

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
  - `blocksShots: false` (muraille) : l'emprise bloque le déplacement mais pas
    la ligne de tir (`findBlockingObstacle(..., forShot)`, utilisé par
    `combatSystem` ; la trajectoire de Charge et la poursuite restent
    bloquées).
  - `passableForTeam` / `passageOpen` (porte de muraille, `BuildingDef.gate`) :
    `World.spawnBuilding` pose le camp de la porte ; `gateSystem`
    (`sim/systems/gates.ts`, au pas fixe avant le mouvement) fait évoluer
    `Entity.gate` (fermée / ouverture / ouverte / fermeture, `openness`) et
    ouvre ou ferme le passage par `World.setGatePassage`, qui **remplace**
    `World.obstacles`. Deux listes par camp, en cache par identité de
    tableau (`sim/geometry.ts`) :
    - `obstaclesBlockingTeam` (trajets : A*, ligne droite, contournement) :
      sans les portes du camp, même fermées ;
    - `obstaclesCollidingTeam` (collision, trajectoire de Charge) : sans les
      portes du camp seulement si `passageOpen`.
    Sans porte, les deux camps partagent la même liste. Les murs n'ont aucun
    passage : ils bloquent tout le monde.
  - `footprintFollowsRotation` (muraille) : `tilesX` / `tilesZ` sont l'emprise
    déjà tournée par quarts de tour (`buildingFootprintTiles`) ; le rendu
    cale le modèle sur l'emprise d'origine avant de le tourner.
  - Orientation du tracé : `traceInteriorSign` (polygone fermé, sinon
    Baliste) et `wallPieceFacing` (`core/wallTrace.ts`) ; `main.ts`
    (`planTracedWallLeg`, `reorientTracedBuildings`) l'enregistre dans
    `rotationY` et dans le `buildingId` du virage — préparation et éditeur
    (même entrée d'historique que la portion).
  - `nativeModelPose` (virage de muraille) : modèle à échelle native et pose
    fixe dans la case, au lieu d'être calé sur l'emprise.
  - Champs purement visuels d'une muraille : `modelFacingYaw` (face
    extérieure vers les hostiles) et `wallJoin` (raccord des virages,
    `wallEndJoins` de `core/wallTrace.ts`), posés par
    `gameplayBuildingObstacle` (`main.ts`). Les battants d'une porte sont
    animés par `BuildingView.setGateOpenness` d'après `Entity.gate`
    (interpolé entre deux pas).
- **Tracé de murailles** : `core/wallTrace.ts` (pur) calcule la disposition
  COMPLÈTE d'un tracé (`traceLayout` : virages, segments 2 × 1,
  demi-segments, cases en attente ; modes `open`, `final`, `closed`) ;
  valider une portion ou terminer le tracé (`finalizeWallTrace`) = passer
  d'une disposition à l'autre (`main.ts` : `wallTraceStep`, pièces retirées
  / posées, coût par case). Utilisé par le mode Muraille de la préparation
  et par l'éditeur.
- **Ciblage** : un bâtiment n'acquiert jamais de cible (`targetingSystem`) ;
  la Tour tire par `buildingAttack`.
- **Survie d'un camp** : `countsForDefeat` (porté par la `BuildingDef`) fait
  compter un bâtiment dans `countCombatants`.
- **Production** (Caserne, Camp d'archerie) : une `BuildingDef` avec
  `production` (`unitId`, `unitsPerWaveByLevel`) donne à l'entité un quota
  pour la manche (`productionRemaining`), fixé par `World.spawnBuilding`
  depuis le niveau propre du bâtiment (`unitsProducedPerWave`). Aucun
  minuteur : `sim/systems/buildingProduction.ts` consomme ce quota dès que
  la population et les cases libres autour de l'emprise le permettent (lot
  partiel possible, cases réservées au fil du tick), sans jamais le
  renouveler, et passe par `productionSpawnEvents` (§8).
- **Recrutement débloqué** (Caserne → Fantassin, Camp d'archerie → Archer,
  Église → Mage) : champ `recruitmentUnlock` de la `BuildingDef`, distinct
  de `production`. `run/recruitment.ts` (hors simulation) en est la seule
  lecture, partagée par la boutique (`ui/screens.ts`) et l'achat
  (`buyUnit`, `main.ts`).
- **Rendu** :
  - `render/buildingView.ts` gère le flash, la destruction et les débris, sur
    des matériaux clonés ;
  - `main.ts` maintient `buildingViewsByEntityId` ;
  - la Baliste est un singleton au rendu dédié (`render/ballista.ts`).
- **Run** : `RunState.buildings` (`OwnedBuilding`) conserve position,
  rotation, PV et niveau propre (Mine, Caserne, Camp d'archerie, Tour,
  Église) entre les vagues. La
  position de la Baliste, `RunState.ballistaPosition`, est fixée au
  démarrage de la run depuis la carte de départ (`resolveBallistaOrigin`,
  voir §10). Seule l'étape C de l'agrandissement la déplace, comme les
  bâtiments (`offsetForZ`, `main.ts`).
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
    `unitUpgrades`) sont ignorées.
  - Migrations appliquées à chaque chargement (`migrateToV2`,
    `stripRemovedTalents`, `mergeLegacyUnlockedUnits`). `stripRemovedTalents`
    retire les talents supprimés de l'arbre et rembourse leur coût
    (`REMOVED_TALENT_REFUNDS` : `temps_argent`, `maitre_forge`).
  - Les fonctions de mutation ne sauvegardent jamais elles-mêmes : l'appelant
    appelle `saveMetaProgress`.
- **Réglages** (`run/userSettings.ts`) : clé `localStorage` séparée, non
  touchée par l'effacement de la sauvegarde.
- **Améliorations de run** (`run/runUpgrades.ts`) : niveaux, coûts et achat
  en Or des améliorations de la Forge.
  - `RunUpgradeLevels` (id d'amélioration → niveau) et
    `runUpgradeLevel(levels, id)` (0 si absent).
  - Séparation explicite des deux sources de progression :

    ```
    PlayerProgression
    ├── talents: MetaProgress        (permanent)
    └── upgrades: RunUpgradeLevels   (RunState.upgrades, propre à la run)
    ```

    `main.ts` la construit à la demande (`playerProgression()`, jamais
    stockée) ; « Tester le scénario » se joue avec `upgrades = {}`.
  - Coût : `runUpgradeGoldCost(id, niveau)` = coût de départ × 2^niveau,
    avec `RUN_UPGRADE_GOLD_COST_BASE` (1) et
    `RUN_UPGRADE_GOLD_COST_GROWTH` (2), identique pour toutes les
    améliorations de la Forge. Aucun talent n'intervient.
  - Niveaux affichés : les niveaux internes partent de 0 ;
    `displayedUpgradeLevel` (niveau + 1) est la seule conversion vers
    l'affichage « Niv. N ».
  - Achat : `canPurchaseRunUpgrade` / `purchaseRunUpgrade(run, id)` (id
    connu via `isRunUpgradeId`, `maxLevel` éventuel de la définition,
    débit par `spendGold`, puis niveau + 1 ; tout ou rien).
  - Les définitions (`data/*Upgrade.ts`, type commun `UpgradeDefBase`) ne
    portent que les effets et un `maxLevel` facultatif, jamais de prix.
- **Améliorations par bâtiment** (`run/buildingUpgrades.ts`) : chaque
  bâtiment améliorable a son niveau (`OwnedBuilding.level`, 0 si absent), hors
  de `RunState.upgrades`.
  - Coût `buildingUpgradeGoldCost(buildingId, niveau)` =
    `upgradeGoldCostBase` × 2^niveau ; plafond facultatif
    `BuildingDef.maxUpgradeLevel` (`isBuildingAtMaxLevel`) ; achat
    `canUpgradeOwnedBuilding` / `upgradeOwnedBuilding(run, index)` (débit
    par `spendGold`, tout ou rien).
  - `main.ts` déclenche l'achat depuis l'action `upgradeBuilding` de la
    fiche, en préparation seulement. Les effets se lisent dans
    `run/mineUpgradeEffects.ts`, `run/buildingUpgradeEffects.ts` et
    `unitsProducedPerWave` (`data/buildings.ts`).
  - En bataille, `ownedBuildingIndexByEntityId` (`main.ts`) relie chaque
    entité de bâtiment à son `OwnedBuilding`, par l'ordre de spawn.
- **Bilan de fin de vague** (`run/battleSummary.ts`) : compteur pur des
  ennemis vaincus par type et de l'Or gagné pendant la bataille. `main.ts`
  le remet à zéro au début de chaque bataille réelle et l'alimente (Or des
  ennemis tués, production des Mines, bonus de fin de vague) ;
  `defeatedLines` donne les lignes affichées, sans zéro, dans l'ordre de
  `UNITS`. L'écran est rendu par `showWaveComplete` (`ui/screens.ts`).
- **Calcul des effets** (`run/*UpgradeEffects.ts`, `run/talentEffects.ts`) :
  seuls `run/` et `main.ts` connaissent talents et améliorations. Les
  modules `*UpgradeEffects.ts` reçoivent les niveaux de la run
  (`RunUpgradeLevels`) ; les prix de bâtiments et de parchemins
  (`getEffectiveBuildingCost`…) ne dépendent d'aucun niveau, le prix d'une
  unité dépend de son niveau de production (`effectivePlayerUnitCost`,
  `playerUnitProductionCost`). L'achat et l'affichage utilisent les mêmes
  fonctions. `computeEnemyUnitUpgradeEffects` utilise un barème séparé
  (`ENEMY_WAVE_UPGRADES`) pour le renforcement par vague, indépendant du
  joueur.
- **Statistiques effectives du joueur** : fonctions pures de la progression,
  source commune du gameplay et de l'interface. Elles combinent talents
  permanents et améliorations de la run ; aucune de ces formules n'est
  dupliquée dans `ui/` ni dans `main.ts`.
  - `run/playerUnitStats.ts` :
    - `playerUnitStatOverrides(unitId, productionLevel, progression)` :
      surcharges de stats passées à `World.spawn` (esquive du talent, PV et
      dégâts du niveau de production) ;
    - `playerUnitAbilityDamageBonus(unitId, productionLevel)` : bonus de
      dégâts de capacité (Boule de feu du Mage) ;
    - `playerUnitTauntShieldBonus(unitId, productionLevel)` : bonus de
      bouclier par ennemi provoqué (Sentinelle) ;
    - `productionLevel` est celui de l'unité (`OwnedUnit.productionLevel`,
      fixé à sa création), jamais le niveau courant de la Forge : une
      amélioration n'est pas rétroactive.
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
- **Expansion de map** (`run/mapExpansion.ts`) : fonctions pures sur `MapDef`
  et un état d'expansion. `main.ts` les applique derrière l'écran de
  transition, après une victoire.
  - Les frontières des camps (`expansionAnchors`) viennent du territoire
    explicite s'il existe, sinon des bords du plateau et de `spawnDepth`
    (comportement historique).
  - Chaque nouvelle case reprend l'état (case ou trou, terrain, camp) de
    l'ancienne case dont l'image par les déplacements de l'étape est la plus
    proche (`expandCells`) : la forme de la carte et son territoire
    explicite suivent l'agrandissement. A et B repoussent vers l'extérieur
    ce qui est au-delà des zones, sans déplacer les objets ; C déplace
    cases, territoire et objets par `centerExpansionZOffset`, de façon
    symétrique : le camp du joueur recule d'une case vers +z, le camp ennemi
    d'une case vers −z, le champ de bataille ne bouge pas. `main.ts`
    applique le même `offsetForZ` aux bâtiments possédés et à la Baliste.
  - Un objet déplacé reçoit une `appearanceSeed` figée, pour garder son
    aspect (voir §11).
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
- **Territoire courant du jeu** (`main.ts`, `currentTerritory`) : index
  construit depuis `currentMap` et `currentRun.mapExpansion.spawnDepth`,
  reconstruit par `rebuildCurrentTerritoryIndex` à chaque changement de l'un
  des deux (nouvelle run, expansion, test du scénario et retour), jamais par
  image. `isValidPlacementTile` le lit pour unités et bâtiments ; un index
  périmé est détecté et reconstruit avec un avertissement. Le territoire
  explicite de l'arène est porté par `currentMap` et transformé par
  l'expansion ; il n'existe pas de `RunState.territory` (territoire propre
  à la run). La simulation ne connaît pas le territoire.

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
  (un `InstancedMesh` par type de terrain), `textures.ts`.
  - Dalles : chaque case est une dalle d'épaisseur `CELL_THICKNESS` (0,45),
    dont le dessus reste à y = 0 ; l'épaisseur est purement visuelle.
  - Débris de bois décoratifs (`render/board.ts`) : semés seulement sur des
    cases existantes, avec une marge, jamais au-dessus d'un trou.
  - Textures du sol : une seule instance par texture, chargée au premier
    appel puis partagée par tous les plateaux, jamais libérée. Un nouveau
    chargement à chaque reconstruction rendait le sol noir le temps du
    décodage (flash à chaque case ajoutée ou supprimée dans l'éditeur).
    `rebuildEditorBoard` (`main.ts`) libère les géométries et matériaux des
    anciennes dalles et de l'ancienne grille, pas les textures ni les
    ressources partagées des zones.
  - Zones : `createZonesGroup(cells)` rend un territoire déjà résolu, une
    instance par case et un `InstancedMesh` par camp, aux couleurs de
    `teamColor`. Partagé par le plateau du jeu (`createBoard`, même
    résolution que la validation du placement) et celui de l'éditeur.
  - Visibilité sur le plateau du jeu : zones visibles en préparation, en
    bataille et pendant la transition de victoire (seule la grille est
    masquée en bataille) ; masquées au retour au menu. Le plateau de
    « Tester le scénario » (`testBoard`) les masque.
- **Décor** : `render/assetLibrary.ts` (chargement et cache des modèles
  glTF/OBJ/FBX) et `obstacleFactory.ts` (construction selon `kind`), partagés
  par le jeu et l'éditeur.
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
  `iceNova`, `shadowProjectileView`, `healVfx`, `tauntVfx`, `telegraph`,
  `projectiles`, `playerArrowView`, `recyclageAura`).
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
- **`Screens`** (`ui/screens.ts`) : menus, boutique de run, arbre de talents,
  boutique de la Forge, paramètres, confirmations. Il reçoit des callbacks
  (`ScreenHandlers`) depuis `main.ts` et lit `RunState` / `MetaProgress`
  pour l'affichage (prix calculés via `run/`).
  - L'écran de victoire (`showWaveComplete`) affiche le bilan de vague
    fourni par `main.ts` (`run/battleSummary.ts`, §10).
  - Les améliorations de run de la Forge et de l'Église partagent l'overlay
    d'id interne `unitUpgradeShop` (`showForge(run, progress, site)` /
    `refreshForge`) : titre et cartes filtrés par site
    (`runUpgradeSite`, `run/runUpgrades.ts`), Or de la run, niveaux de
    `RunState.upgrades`, prix `runUpgradeGoldCost`, boutons activés par
    `canPurchaseRunUpgrade`. `main.ts` l'ouvre (`openForge(site)`,
    préparation uniquement, au moins un bâtiment de ce site possédé),
    réalise l'achat (`purchaseForgeUpgrade`, refusé hors du site ouvert) et
    la ferme (`closeForge`, « Retour » ou Échap, prioritaire sur la pause).
  - Le soin de l'armée à l'Église est calculé et appliqué par
    `run/churchHeal.ts` (PV manquants via `playerUnitMaxHp`, coût, tout ou
    rien) ; la fiche l'affiche et `main.ts` le déclenche.
- **HUD et composants** : `goldHud`, `waveIndicator`, `inventoryBar`,
  `sellZone`, `placementPanel`, `selectionBox`, toasts, `combatOverlay`
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
- **Disposition** : fiche en haut à gauche, indicateur de vague en haut au
  centre, debug replié (FPS) en haut à droite, HUD de la Baliste ou panneau
  de placement en bas au centre, or, boutique, vente et inventaire en bas à
  droite, aide de vitesse en bas à gauche.
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
| `editor/mapSerializer.ts` | `MapDef` ↔ JSON (export par téléchargement, import par fichier) ; `territory` et `ballista` écrits seulement s'ils sont explicites, `buildings` seulement s'il y en a |

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

## 14. Audio

- `audio/` contient un moteur complet : `AudioManager` (bus, budget de voix,
  catalogue de sons nommés), `synthesis.ts`, `sounds/*`.
- Il est **présent mais déconnecté** : `main.ts` n'appelle jamais `unlock()`.
  Aucun `AudioContext` n'est créé et `play()` ne fait rien.
- Les volumes sont lus et écrits via `run/userSettings.ts` (écran
  Paramètres).

## 15. Points chauds techniques

- **`main.ts`** est de loin le plus gros fichier du projet. Il contient :
  - l'état global de session (`world`, `currentRun`, `currentMap`,
    `metaProgress`) ;
  - tous les écouteurs d'entrée ;
  - la phase de placement et la tour ;
  - les sélections (préparation et bataille) et le branchement de la fiche
    d'entité ;
  - la consommation des événements de simulation ;
  - achats, ventes et inventaire ;
  - bâtiments et expansion de map ;
  - l'orchestration de l'éditeur.

  Beaucoup d'états de module y sont partagés, et l'ordre de déclaration y
  compte (initialisation au chargement du module).
- **`ui/screens.ts`** est le deuxième plus gros fichier : il regroupe tous
  les écrans et leurs calculs d'affichage (prix, effets).
- Autres fichiers volumineux : `sim/systems/movement.ts` (déplacement,
  évitement, anti-blocage, collisions) et `render/iceNova.ts` (VFX de la Nova
  et du Blizzard).

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
- **État de placement hors `RunState`** (emplacements, sélection, glisser en
  cours) : il est remis à zéro à chaque nouvelle run
  (`resetRunPlacementState`, `main.ts`).
- **Cache des bornes d'obstacles** (`sim/geometry.ts`) : les bornes sont
  mises en cache par **référence de tableau**, ce qui suppose une liste
  d'obstacles stable pendant une bataille. Or les emprises de bâtiments sont
  ajoutées et retirées **en place** dans `World.obstacles`. Hypothèse **non
  testée** : après la destruction d'un bâtiment en cours de bataille, les
  collisions et la ligne de tir pourraient encore lire des bornes périmées.
  À vérifier.

## 17. Vérifier une modification

- `npm run build` (depuis `arrow-tactics/`) vérifie les types puis construit
  le bundle. C'est la seule vérification automatique.
- Il n'existe **aucune suite de tests**. Les vérifications « headless »
  passées étaient des scripts jetables, non conservés.
- Playwright est installé comme dépendance, mais son navigateur ne l'est pas
  forcément sur la machine. Sous Windows, `channel: 'msedge'` permet
  d'utiliser Edge à la place.
