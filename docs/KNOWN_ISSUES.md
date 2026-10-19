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
| KI-02 | Placement en jeu sans test direct des cellules | Dette (atténuée) |
| KI-03 | Bâtiment potentiellement inatteignable | À vérifier |
| KI-04 | Contrat implicite « ordre de spawn = ordre de l'armée » | Dette |
| KI-07 | « Tester le scénario » sans Mine ni Caserne | Dette |
| KI-09 | Descriptions de talents aux valeurs codées en dur | Dette |
| KI-10 | Commentaire inexact du bouton d'achat ×5 | Dette |
| KI-11 | Nom trompeur `MAGE_UNLOCK_WAVE` | Dette |
| KI-12 | Sens implicite du « record de vague » | Dette |
| KI-13 | Commentaires de code périmés | Dette |
| KI-15 | Aucune suite de tests automatisée | Dette |
| KI-16 | Assets inutilisés copiés dans le build | Confirmé (mesuré) |
| KI-20 | Validation partielle des positions dans l'éditeur | Dette |
| KI-21 | Justificatifs de provenance et de droits des assets non archivés | Dette |
| KI-22 | Assets suivis directement par Git, sans Git LFS | Dette |
| KI-23 | Raycast sur un modèle animé avant son premier rendu | Dette |
| KI-24 | Espace réactive le bouton qui a gardé le focus | Confirmé (éditeur) / À vérifier (jeu) |
| KI-25 | Bordure neutre asymétrique après l'étape C de l'agrandissement | Confirmé (mesuré) |

Les identifiants ne sont pas réutilisés : une entrée traitée est retirée
(c'est le cas de KI-05, KI-06, KI-08, KI-14, KI-17, KI-18 et KI-19).

Retirées lors de la refonte de l'éditeur, résolues côté code :

- **KI-06** (R / « Tourner 90° » hors historique et départ à 0°) : R et
  « +90° (R) » partent de l'orientation réellement affichée et créent une
  entrée d'historique ; annuler la première rotation rend son orientation
  d'origine à un décor jamais tourné (`EDITOR.md` §9 et §11).
- **KI-19** (raccourcis actifs pendant la saisie) : une garde centrale en
  tête de l'écouteur `keydown` de `main.ts` (`isTypingInField`) ignore tous
  les raccourcis du jeu et de l'éditeur quand le focus est dans un champ ;
  seul Échap fait sortir du champ, puis garde son rôle habituel.

Retirée avec l'arène du Mode survie, résolue côté code :

- **KI-05** (l'annulation d'un déplacement au gizmo réorientait un décor) :
  l'annulation et le rétablissement restaurent maintenant exactement la
  rotation précédente, y compris son absence pour un décor jamais tourné, et
  le décor retrouve son aspect d'origine (aspect fixé par la position,
  `DESIGN_DECISIONS.md` E6). Aucun `rotationY = 0` n'est plus écrit.

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
- **Impact actuel** : aucun constaté. L'arène du Mode survie a 64 trous et
  un territoire dessiné, mais aucune case de territoire ne tombe sur un
  trou, au départ comme après chaque étape A/B/C (l'agrandissement
  transforme cases et territoire ensemble). La simulation bloque déjà les
  trous (`computeVoidObstacles`, `sim/world.ts`).
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
  exclus de la correspondance.
- **Vérification** : relire `onValidatePlacement` et `applyBattleOutcome` à
  chaque modification de l'un des deux.
- **Piste** : un identifiant explicite reliant `OwnedUnit` et entité.

### KI-25 — Bordure neutre asymétrique après l'étape C de l'agrandissement

- **Statut** : Confirmé (mesuré par script sur l'arène du Mode survie).
- **Symptôme** : à chaque étape C, la bordure neutre derrière la zone joueur
  s'épaissit d'une rangée, et celle derrière la zone ennemie disparaît dès
  la première étape C (la zone ennemie touche alors le bord du plateau).
- **Cause** : le plateau reste centré (il grandit d'une rangée à chaque
  bout), alors que l'étape C garde le camp joueur fixe et recule le camp
  ennemi de deux cases (`centerExpansionZOffset`, `run/mapExpansion.ts`).
- **Impact actuel** : visuel. Aucun décor ne sort du plateau, la Baliste et
  les bâtiments restent dans la zone joueur, et la zone joueur ne perd
  aucune case.
- **Piste** : une étape C qui ne recentre pas le plateau, ou qui décale les
  deux camps symétriquement. C'est une décision de design (`DESIGN_DECISIONS.md`
  E4 : camp joueur fixe).

## B. Éditeur de maps

### KI-07 — « Tester le scénario » sans Mine ni Caserne

- **Statut** : Dette (limitation), partiellement résolue.
- **Résolu** : la **Baliste** est désormais un vrai bâtiment en test (PV,
  collision, destruction), à la position de la carte (`MapDef.ballista`, ou
  le repli historique) — voir `EDITOR.md` §15-§16.
- **Symptôme restant** : aucune Mine ni Caserne n'est créée pendant un test
  depuis l'éditeur ; ces bâtiments ne peuvent pas y être testés.
- **Code concerné** :
  - `setupTestBattle` (`main.ts`) ne fait apparaître que les unités de la
    carte et la Baliste ;
  - `MapDef` ne connaît que la position de la Baliste, aucun autre bâtiment
    gameplay.
- **Impact actuel** : limite les tests d'équilibrage des bâtiments achetables
  faits dans l'éditeur.
- **Vérification** : lancer un test et constater qu'aucune Mine ni Caserne
  n'apparaît.
- **Piste** : une métadonnée optionnelle sur les obstacles
  `kind: 'building'`, ou une option du test.

### KI-20 — Validation partielle des positions dans l'éditeur

- **Statut** : Dette. Confirmé par lecture du code.
- **Emprises de plusieurs cases réduites à leur case centrale** :
  - `canRemoveCell` et `canPlaceUnitAt` (`editor/editorState.ts`) comparent
    uniquement la case qui contient le **centre** d'un obstacle bloquant
    (`floor(obstacleCenter(o))`) à la case testée ;
  - conséquence : on peut retirer une case de terrain sous le bord d'un
    rocher ou d'un bâtiment de plusieurs cases, ou y poser ou y déplacer une
    unité.
- **Résolu** : l'ancienne asymétrie entre pose et déplacement d'unités a
  disparu. Les déplacements utilisent désormais `canPlaceUnitAt` (voir
  `EDITOR.md` §8), et deux unités ne peuvent plus finir sur la même case.
- **Impact actuel** : une carte peut contenir des unités posées sur le bord
  d'un gros obstacle, sans avertissement.
- **Vérification** : poser ou déplacer une unité sur une case de bord d'un
  rocher 2×2 ; retirer une case au bord d'un bâtiment 2×2.
- **Piste** : tester toute l'emprise d'un obstacle (`obstacleBounds`).
- **Hors de cette entrée** : la Baliste teste toute son emprise
  (`obstacleBounds`), et le jeu réel aussi (`isValidPlacementTile`) ; la
  divergence ne concerne que les règles de l'éditeur citées plus haut.
- Voir aussi `EDITOR.md` §8 et §18.

### KI-24 — Espace réactive le bouton qui a gardé le focus

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

## C. Incohérences entre documentation et code

### KI-09 — Descriptions de talents aux valeurs codées en dur

- **Statut** : Dette.
- **Risque** : les textes de `data/talents.ts` écrivent leurs valeurs en dur :
  - Aux petits oignons : 5 PV ;
  - Tir rapide : 60 % et 100 % ;
  - Recyclage : 300 % et 50 % ;
  - Réflexes de vétéran : 30 % ;
  - Blizzard : 4 s et 2 dégâts.

  Ces textes ne suivent pas les constantes de `config/constants.ts` et
  `data/items.ts`, ni les améliorations de Forge. Le soin réel du
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
    arbres viennent de modèles `.glb` ;
  - `config/territory.ts` : l'en-tête affirme que ni l'éditeur ni le rendu
    n'utilisent encore le module, alors que tous deux s'en servent ;
  - `data/buildings.ts` : renvoie au catalogue `ASSET_GROUPS`
    « Bâtiments (KayKit) », remplacé par `DECOR_CATALOG` (catégorie
    « Structures décoratives »).
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
