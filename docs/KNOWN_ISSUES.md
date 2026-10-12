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
| KI-01 | Cache des bornes d'obstacles et emprises de bâtiments modifiées en place | À vérifier |
| KI-02 | Placement en jeu insensible aux trous de cellules | Dette |
| KI-03 | Bâtiment potentiellement inatteignable | À vérifier |
| KI-04 | Contrat implicite « ordre de spawn = ordre de l'armée » | Dette |
| KI-05 | L'undo d'un déplacement au gizmo peut réorienter un décor | Confirmé (lecture du code) |
| KI-06 | R / « Tourner 90° » : hors historique et départ à 0° | Confirmé (lecture du code) |
| KI-07 | « Tester le scénario » sans bâtiments gameplay | Dette |
| KI-08 | Commentaire de Maître de la forge : « jamais sous 1 rune » | Confirmé |
| KI-09 | Descriptions de talents aux valeurs codées en dur | Dette |
| KI-10 | Commentaire inexact du bouton d'achat ×5 | Dette |
| KI-11 | Nom trompeur `MAGE_UNLOCK_WAVE` | Dette |
| KI-12 | Sens implicite du « record de vague » | Dette |
| KI-13 | Commentaires de code périmés | Dette |
| KI-15 | Aucune suite de tests automatisée | Dette |
| KI-16 | Assets inutilisés copiés dans le build | Confirmé (mesuré) |
| KI-19 | Raccourcis clavier actifs pendant la saisie dans un champ | Confirmé (lecture du code) |
| KI-20 | Validation partielle des positions dans l'éditeur | Dette |
| KI-21 | Justificatifs de provenance et de droits des assets non archivés | Dette |
| KI-22 | Assets suivis directement par Git, sans Git LFS | Dette |

Les identifiants ne sont pas réutilisés : une entrée traitée est retirée
(c'est le cas de KI-14, KI-17 et KI-18).

---

## A. Simulation et gameplay

### KI-01 — Cache des bornes d'obstacles et emprises de bâtiments modifiées en place

- **Statut** : À vérifier. Hypothèse tirée de la lecture du code, non
  reproduite.
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

### KI-02 — Placement en jeu insensible aux trous de cellules

- **Statut** : Dette.
- **Risque** : `isValidPlacementTile` (`main.ts`) vérifie le placement des
  unités, des bâtiments et de la tour. Il ne teste que le rectangle de zone
  et les obstacles, jamais `MapDef.cells`. Sur une carte à trous, on pourrait
  poser un élément au-dessus d'un vide.
- **Impact actuel** : aucun. La carte de départ et l'expansion A/B/C
  produisent toujours un rectangle plein de cellules. La simulation bloque
  déjà les trous (`computeVoidObstacles`, `sim/world.ts`).
- **Vérification** : pas faisable sans modification, car le jeu réel ne
  charge pas encore de carte à trous.
- **Piste** : faire tenir compte des cellules à `isValidPlacementTile`
  (`buildCellIndex`, `config/mapDef.ts`).

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
  exclus de la correspondance.
- **Vérification** : relire `onValidatePlacement` et `applyBattleOutcome` à
  chaque modification de l'un des deux.
- **Piste** : un identifiant explicite reliant `OwnedUnit` et entité.

## B. Éditeur de maps

### KI-05 — L'undo d'un déplacement au gizmo peut réorienter un décor

- **Statut** : Confirmé par lecture du code, non reproduit manuellement.
- **Symptôme** : on déplace au gizmo un décor jamais tourné (sans
  `rotationY`, orientation aléatoire d'origine), puis on fait Ctrl+Z. Le décor
  revient à sa position, mais son orientation passe à 0°.
- **Code concerné** :
  - `main.ts`, écouteurs `mouseDown` / `mouseUp` de `TransformControls` : la
    rotation est capturée comme `obstacle.rotationY ?? 0` ;
  - les commandes `undo` / `redo` réécrivent cette valeur via
    `EditorState.setObstacleTransform` ;
  - `refreshEditorObjects` applique ensuite `rotation.y = 0`.
- **Impact actuel** : saut visuel. Un `rotationY = 0` finit aussi dans la
  carte enregistrée.
- **Vérification** : poser un arbre ou un prop sans le tourner, le déplacer
  avec les flèches, faire Ctrl+Z, puis comparer l'orientation.
- **Piste** : capturer l'orientation réelle (`currentObstacleRotation`,
  `main.ts`), ou faire en sorte que l'undo d'une translation ne restaure que
  la position.

### KI-06 — R / « Tourner 90° » : hors historique et départ à 0°

- **Statut** : Confirmé par lecture du code, non reproduit manuellement.
- **Symptômes** :
  1. un décor jamais tourné passe à 90° **absolus** au premier appui, au lieu
     de pivoter de +90° depuis son orientation actuelle ;
  2. l'action n'est pas enregistrée dans l'historique : Ctrl+Z annule
     l'action précédente.
- **Code concerné** :
  - `editor/editorState.ts`, `rotateSelected` : `(rotationY ?? 0) + delta` ;
  - `main.ts` (bouton `onRotate` et touche R) : pas d'appel à
    `editorHistory.push`.
- **Impact actuel** : comportement incohérent avec la rotation par l'anneau
  et par Ctrl+molette, qui partent de l'orientation réelle et sont
  annulables.
- **Vérification** : poser un arbre, appuyer sur R, regarder l'angle affiché,
  puis faire Ctrl+Z.
- **Piste** : réutiliser `currentObstacleRotation` et
  `pushObstacleRotationCommand` (déjà présents dans `main.ts`).

### KI-07 — « Tester le scénario » sans bâtiments gameplay

- **Statut** : Dette (limitation).
- **Symptôme** : pendant un test depuis l'éditeur, aucune Mine, Caserne ni
  Baliste destructible n'est créée. La tour ne peut pas être détruite, et les
  bâtiments ne peuvent pas être testés depuis l'éditeur.
- **Code concerné** :
  - `setupTestBattle` (`main.ts`) ne fait apparaître que les unités de la
    carte ;
  - `MapDef` n'a aucune notion de bâtiment gameplay.
- **Impact actuel** : limite les tests d'équilibrage faits dans l'éditeur.
- **Vérification** : lancer un test et constater l'absence de barre de PV sur
  la tour.
- **Piste** : une métadonnée optionnelle sur les obstacles
  `kind: 'building'`, ou une option du test.

### KI-19 — Raccourcis clavier actifs pendant la saisie dans un champ

- **Statut** : Confirmé par lecture du code, non reproduit manuellement.
- **Certain dans le code** :
  - `main.ts` n'a qu'un seul écouteur `keydown`, posé sur `window` ;
  - il ne filtre pas la cible de l'événement : rien dans `src/` ne teste
    `event.target`, `tagName` ou `document.activeElement` ;
  - les champs exposés sont les deux `<input type=number>` « Taille » de
    l'éditeur (`editor/editorUI.ts`) et les contrôles de l'écran Paramètres
    (`ui/screens.ts`).
- **Effets attendus, non observés à l'écran** :
  - Retour arrière ou Suppr dans un champ « Taille » supprimerait aussi le
    décor ou l'unité sélectionné ;
  - les flèches modifieraient la valeur du champ et feraient en plus pivoter
    ou incliner la caméra ;
  - A, E et Espace agiraient sur la caméra ;
  - R tournerait la sélection dans l'éditeur.
- **Impact actuel** : risque de suppression ou de mouvement de caméra
  involontaire pendant une saisie.
- **Vérification** : sélectionner un décor dans l'éditeur, cliquer dans le
  champ « Taille », appuyer sur Retour arrière, puis vérifier si le décor
  existe toujours.
- **Piste** : ignorer les raccourcis quand le focus est sur un champ de saisie.

### KI-20 — Validation partielle des positions dans l'éditeur

- **Statut** : Dette. Le premier point est confirmé par lecture du code.
- **Point 1 — emprises de plusieurs cases réduites à leur case centrale** :
  - `canRemoveCell` et `canPlaceUnitAt` (`editor/editorState.ts`) comparent
    uniquement la case qui contient le **centre** d'un obstacle bloquant
    (`floor(obstacleCenter(o))`) à la case testée ;
  - conséquence : on peut retirer une case de terrain sous le bord d'un
    rocher ou d'un bâtiment de plusieurs cases, ou y poser une unité.
- **Point 2 — déplacer une unité est moins strict que la poser** :
  - `canPlaceUnitAt` refuse une case occupée par un obstacle bloquant ou par
    une autre unité ;
  - `moveSelectedUnit` et `moveSelectedGroup` vérifient seulement que la case
    de terrain existe ;
  - un commentaire du code présente cette absence de contrôle d'occupation
    comme un choix historique de l'éditeur (laisser l'utilisateur ajuster à la
    main). C'est donc une **asymétrie**, pas un bug de gameplay établi.
- **Impact actuel** : une carte peut contenir des unités superposées ou posées
  sur un obstacle, sans avertissement.
- **Vérification** : poser une unité, la déplacer sur un rocher ou sur une
  autre unité ; retirer une case au bord d'un bâtiment 2×2.
- **Piste** : tester toute l'emprise d'un obstacle, et décider si le
  déplacement doit appliquer la même règle que la pose.
- Voir aussi `EDITOR.md` §7 et §17.

## C. Incohérences entre documentation et code

### KI-08 — Commentaire de Maître de la forge : « jamais sous 1 rune »

- **Statut** : Confirmé.
- **Écart** : le commentaire de `data/talents.ts` (talent `maitre_forge`)
  annonce un minimum d'une Rune. Le code (`effectiveUpgradeCost`,
  `run/metaProgress.ts`) applique un minimum de **0,1** Rune et produit des
  coûts fractionnaires.
- **Impact actuel** : documentaire uniquement.
- **Piste** : corriger le commentaire.

### KI-09 — Descriptions de talents aux valeurs codées en dur

- **Statut** : Dette.
- **Risque** : les textes de `data/talents.ts` écrivent leurs valeurs en dur :
  - Aux petits oignons : 5 PV ;
  - Tir rapide : 60 % et 100 % ;
  - Recyclage : 300 % et 50 % ;
  - Réflexes de vétéran : 30 % ;
  - Blizzard : 4 s et 2 dégâts.

  Ces textes ne suivent pas les constantes de `config/constants.ts` et
  `data/items.ts`, ni les améliorations permanentes. Le soin réel du
  parchemin, par exemple, peut dépasser 5 PV.
- **Impact actuel** : les textes sont exacts pour les valeurs **de base**.
- **Vérification** : comparer chaque description aux constantes
  correspondantes.
- **Piste** : construire les descriptions à partir des constantes.

### KI-10 — Commentaire inexact du bouton d'achat ×5

- **Statut** : Dette.
- **Écart** : `buyUnitFive` (`main.ts`) appelle `buyUnit` cinq fois sans
  s'arrêter, alors que son commentaire affirme qu'il s'arrête au premier
  échec.
- **Impact actuel** : aucun, chaque appel vérifiant déjà l'or et le
  déblocage.
- **Piste** : aligner le commentaire, ou ajouter l'arrêt.

### KI-11 — Nom trompeur `MAGE_UNLOCK_WAVE`

- **Statut** : Dette.
- **Écart** : `MAGE_UNLOCK_WAVE` (`config/constants.ts`) ne règle que
  l'**apparition des Mages ennemis**. Le déblocage du Mage pour le joueur
  passe par `playerUnlockMode: 'defeatEnemy'` (`data/units.ts`).
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

### KI-13 — Commentaires de code périmés

- **Statut** : Dette.
- **Écart** : plusieurs commentaires décrivent des éléments retirés ou
  modifiés :
  - le talent « Le temps, c'est de l'argent » présenté comme source de la
    Mine ;
  - le Cavalier léger ;
  - un plafond `maxLevel` de la Caserne ;
  - `PLAYER_ARROW_SPEED = 9`.
- **Emplacements** :
  - `main.ts` : accumulateur et revenu de la Mine, `isValidPlacementTile`,
    consommation des capacités, aperçu d'emprise ;
  - `run/mineUpgradeEffects.ts`, `data/mineUpgrade.ts`,
    `data/shadowUpgrade.ts` ;
  - `ui/screens.ts`, `buildMineUpgradeCard` : la carte y est décrite comme
    masquée, alors qu'elle est toujours visible ;
  - `run/metaProgress.ts`, `canPurchaseUpgrade` : mentionne un « plafond
    Caserne » ; le mécanisme `maxLevel` reste générique mais n'est plus
    utilisé ;
  - `data/units.ts` : vitesse de la flèche dans un commentaire du Mage ;
  - `render/assetLibrary.ts` : l'en-tête affirme qu'aucun autre asset graphique
    n'est utilisé dans le jeu, et un commentaire renvoie à un `License.txt`
    « copié avec les fichiers », absent du dépôt ;
  - `render/board.ts` : un commentaire affirme que seuls les rochers et les
    arbres viennent de modèles `.glb`.
- **Impact actuel** : risque d'induire en erreur un développeur ou un agent.
- **Piste** : un passage de nettoyage des commentaires.

## D. Outillage et dépôt

### KI-15 — Aucune suite de tests automatisée

- **Statut** : Dette.
- **Écart** : `package.json` n'a pas de script `test`. Les vérifications
  « headless » passées étaient des scripts jetables, non conservés.
  `npm run build` est la seule vérification automatique.
- **Impact actuel** : les régressions de logique pure (`run/`, `sim/`) ne se
  détectent qu'à la main.
- **Piste** : des tests ciblés sur les fonctions pures et sur `World`.

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
