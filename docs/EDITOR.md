# Éditeur de maps

Ce document décrit l'éditeur de maps d'Arrow Tactics **tel qu'il fonctionne
aujourd'hui**, d'après le code de la branche `reprise-2026`. En cas d'écart,
le code fait foi.

Pour l'organisation technique générale, voir `ARCHITECTURE.md` ; pour les bugs
et limitations, `KNOWN_ISSUES.md`.

## Sommaire

1. Ouvrir et quitter l'éditeur
2. L'interface
3. Plateau : taille et cases de terrain
4. Objets disponibles
5. Unités
6. Sélection
7. Déplacement
8. Rotation des décors
9. Supprimer
10. Annuler / rétablir
11. Panneau de propriétés
12. Caméra
13. Enregistrer et charger
14. Tester le scénario
15. Bâtiments décoratifs, bâtiments gameplay et Baliste
16. Cartes à trous
17. Limitations connues
18. Pour les développeurs
19. Récapitulatif des contrôles

---

## 1. Ouvrir et quitter l'éditeur

- **Ouvrir** : menu principal → **Éditeur de maps**.
- **Contenu au démarrage** : l'éditeur s'ouvre toujours sur la **carte de
  campagne par défaut** (« vague1-20 »), avec un historique d'annulation vide.
- **Quitter** : **« ← Retour au menu »** abandonne le brouillon en cours. Rien
  n'est conservé si la carte n'a pas été enregistrée (§13).
- **Indépendance** : l'éditeur affiche son propre plateau. La partie réelle
  n'est pas modifiée par ce qui se passe dans l'éditeur.

## 2. L'interface

- **En haut**, la barre d'outils :
  - « ← Retour au menu », « Enregistrer », « Charger une carte » ;
  - réglage de la taille ;
  - outils de terrain ;
  - « Tester le scénario ».
- **À gauche**, le catalogue d'assets, rangé par groupes.
- **À droite**, le panneau de propriétés, affiché quand un décor ou une unité
  est sélectionné.
- **En bas**, un rappel des principaux raccourcis.

## 3. Plateau : taille et cases de terrain

**Taille**

- Deux champs (largeur × hauteur) et le bouton **Appliquer**. Le minimum est
  de 1×1.
- Agrandir **ajoute** des cases d'herbe.
- Réduire **ne supprime ni cases ni objets** existants : ils restent en place,
  éventuellement hors des nouvelles dimensions.
- Le redimensionnement ne peut pas être annulé avec Ctrl+Z.

**Cases de terrain**

- Outils : **+ Case (Herbe)**, **+ Case (Terre)**, **− Supprimer case**.
- Ce sont des outils **répétables** : ils restent actifs jusqu'à Échap, un
  clic droit ou le choix d'un autre outil.
- Un aperçu vert ou rouge indique sous le curseur si l'action est possible.
- **Ajout** : refusé si une case existe déjà à cet endroit.
- **Suppression** : refusée si une unité ou un obstacle bloquant occupe la
  case, ou si la case est sous l'empreinte de la Baliste (§15). Un prop
  décoratif n'empêche pas la suppression.

## 4. Objets disponibles

Catalogue (groupes dépliables) :

| Groupe | Contenu |
|---|---|
| Obstacles | Rochers, arbres |
| Décors | Champignons, buissons et plantes, fleurs, bois (bûches, souches), divers |
| KayKit (médiéval) | Nature, props |
| Bâtiments (KayKit) | Bleu, rouge, neutres |
| Unités | Bestiaire du jeu (construit automatiquement depuis `data/units.ts`) |

- **Pose libre** : un clic pose l'objet exactement sous le curseur, sans
  alignement sur une case. Un fantôme semi-transparent montre l'objet avant
  le clic. Après la pose, l'éditeur revient à l'outil de sélection et l'objet
  posé est sélectionné.
- **Collisions en bataille** : les props sont traversables ; les rochers, les
  arbres et les bâtiments bloquent le passage et la ligne de tir.

## 5. Unités

- **Pose** : alignée au **centre d'une case**, avec un aperçu de case vert ou
  rouge.
- **Pose refusée** :
  - sans case de terrain ;
  - sur un obstacle bloquant ;
  - sur une autre unité ;
  - dans l'empreinte de la Baliste (§15).

  Les déplacements d'unités appliquent les mêmes règles (§7).
- **Camp** : déduit automatiquement de la moitié du plateau. `z ≥ 0` donne le
  camp joueur, sinon le camp ennemi. Le camp est recalculé à chaque
  déplacement, et rien ne restreint la pose aux zones de spawn.
- **Rotation** : les unités ne se tournent pas. Le bouton « Tourner » est
  masqué pour elles, et l'anneau de rotation ne sert qu'aux décors.

## 6. Sélection

- **Décor ou Baliste** : un clic gauche le sélectionne, dès l'appui. Un décor
  (neutre) est entouré d'un anneau doré. La Baliste, qui reste un objet
  distinct des unités, est entourée d'un anneau à la couleur de son camp
  propriétaire, aujourd'hui le bleu du joueur (même règle de couleur que
  l'anneau des unités).
- **Unités** : mêmes gestes qu'en préparation et en bataille. Les unités des
  deux camps sont sélectionnables.

| Geste | Effet |
|---|---|
| Clic gauche sur une unité | Sélection simple : elle devient la seule sélectionnée |
| Maj + clic sur une unité | L'ajoute à la sélection ou l'en retire |
| Maj + clic dans le vide | Rien : la sélection reste |
| Glisser (rectangle), depuis le sol ou une unité | Remplace la sélection par les unités encadrées, des deux camps. Avec Maj, remplace aussi. Jamais quand la Baliste est sélectionnée (§7) |
| Double-clic sur une unité | Unités du même type **et du même camp** visibles à l'écran (projetées dans le canvas), jamais celles hors champ |

- **Rectangle** : il ne sélectionne jamais un décor ni la Baliste. Un vrai
  glisser n'est jamais pris pour un clic au relâchement, et un clic droit
  ajouté pendant le rectangle l'annule (déplacement de la caméra, §12).
- **Anneau des unités** : chaque unité sélectionnée a l'anneau commun aux
  unités, comme en préparation et en bataille. Sa couleur est celle de son
  camp (bleu pour le joueur, rouge pour l'ennemi), jamais une couleur de
  validation (le vert et le rouge de l'aperçu de déplacement, §7).
- **Une seule sélection à la fois** : un décor, la Baliste, ou un ensemble
  d'unités. Ils ne se mélangent jamais. Maj + clic sur une unité alors qu'un
  décor ou la Baliste est sélectionné démarre une nouvelle sélection
  d'unités.
- **Désélectionner** :
  - clic droit ou Échap ;
  - clic gauche dans le vide, sans Maj, quand ni unité ni Baliste n'est
    sélectionnée. Avec des unités ou la Baliste sélectionnées, ce clic est
    un déplacement (§7).
- Avec un **décor** sélectionné, un clic gauche sur le sol le désélectionne.

## 7. Déplacement

- **Décors** :
  - uniquement avec les **flèches du gizmo** ;
  - déplacement libre sur le plan horizontal ;
  - un glisser complet compte comme **une seule opération** d'historique.
- **Unités et groupes** : même geste et même calcul qu'en préparation.
  - **Aperçu au survol** : avec une ou plusieurs unités sélectionnées, le
    survol du terrain montre leur destination avant le clic. Chaque unité a
    une **empreinte** au sol, **verte** si sa destination est valide,
    **rouge** sinon, et une **silhouette translucide** de son modèle,
    dans le camp qu'elle aura à l'arrivée. Les vraies unités restent
    visibles avec leur anneau.
  - **Clic gauche au sol** : applique **exactement** la disposition
    affichée. Le clic refait le même calcul, au point de relâchement.
  - **Calcul** (`core/gridGroupMove.ts`, partagé avec la préparation) :
    - le centre de la formation vient au point visé, avec un décalage d'un
      nombre entier de cases. L'ordre de sélection n'a aucune influence ;
    - chaque unité garde sa place dans la formation si sa case est valide et
      libre ;
    - une unité bloquée prend la case valide et libre la plus proche, dans
      un rayon de **2 cases** (`GRID_MOVE_SEARCH_RADIUS`), selon un ordre
      fixe ;
    - deux unités ne finissent jamais sur la même case.
  - **Tout ou rien** : si une seule unité n'a pas de destination, l'aperçu
    la montre en rouge et le clic ne déplace personne.
  - **Après un déplacement réussi**, d'une unité ou d'un groupe : la
    sélection est vidée et l'aperçu disparaît aussitôt. Il ne reste ni
    silhouette, ni empreinte, ni anneau.
  - **Après un refus** : rien ne bouge, la sélection et l'aperçu restent
    disponibles pour une nouvelle tentative.
  - **Aperçu masqué** :
    - quand le curseur est sur un objet qu'un clic sélectionnerait ;
    - pendant un rectangle de sélection, un geste caméra, le gizmo ou la
      rotation à l'anneau ;
    - avec un outil de pose ;
    - quand le plan ne déplacerait aucune unité.

    Un décor ou la Baliste sélectionnés n'affichent jamais de silhouette
    d'unité.
- **Règle de validité** : celle de la pose (§5, `canPlaceUnitAt`). La case
  doit exister, ne pas être dans l'empreinte de la Baliste, ni sur un
  obstacle bloquant (seule la case du centre de l'obstacle compte, voir
  **KI-20**), ni sur une autre unité. Les cases actuelles des unités
  déplacées ne comptent pas.
- **Camp** : recalculé pour chaque unité déplacée selon la moitié du plateau
  (`teamForZ`, règle inchangée). Franchir la ligne médiane fait donc changer
  une unité de camp ; l'aperçu le montre déjà.
- **Baliste** : la sélectionner, puis cliquer au sol. Le déplacement est
  tenté **dès l'appui** au sol (sans Maj). Un glisser au sol ne démarre donc
  pas de rectangle de sélection d'unités tant que la Baliste est
  sélectionnée ; le rectangle reste disponible dans les autres cas. La
  position est calée sur une grille de 3×3 cases. Un emplacement invalide
  est refusé sans rien changer, et la Baliste reste sélectionnée. Détail
  dans §15.

## 8. Rotation des décors

Quatre façons de tourner un décor sélectionné :

| Moyen | Effet |
|---|---|
| Glisser l'**anneau jaune** autour de l'objet | Rotation libre autour de l'axe vertical |
| **Ctrl + molette** | ±15° par cran |
| **Ctrl + Maj + molette** | ±1° par cran |
| **R** ou bouton **« Tourner 90° (R) »** | +90° |

- **Point de départ** : l'anneau et Ctrl+molette partent de l'orientation
  **réelle** du décor, y compris l'orientation aléatoire d'un décor jamais
  tourné.
- **Pas de saut** au passage 0° / 360°.
- **Annulation** : un glisser de l'anneau = une opération d'historique ;
  chaque cran de molette = une opération.
- **Ce qui a changé** : il n'existe plus de mode rotation W/E. W ne fait rien
  et E sert au zoom.
- **À ne pas confondre** : le **Ctrl+molette par pas de 45°** concerne le
  placement des bâtiments **en partie**, pas l'éditeur.
- **R / « Tourner 90° »** se comporte différemment de l'anneau et de
  Ctrl+molette : voir **KI-06**.

## 9. Supprimer

- **Suppr**, **Retour arrière** ou le bouton **« Supprimer (Suppr) »**
  suppriment la sélection : un décor, une unité ou un groupe.
- **La Baliste ne se supprime pas** : Suppr est sans effet sur elle, tout
  comme R.
- La suppression ne peut pas être annulée avec Ctrl+Z.

## 10. Annuler / rétablir

- **Raccourcis** : **Ctrl+Z** pour annuler, **Ctrl+Y** ou **Ctrl+Maj+Z** pour
  rétablir.

| Annulable | Non annulable |
|---|---|
| Déplacement d'un décor au gizmo | Pose d'un objet ou d'une unité |
| Rotation à l'anneau | Suppression |
| Rotation par Ctrl+molette (par cran) | Redimensionnement du plateau |
| Ajout ou suppression d'une case | R / « Tourner 90° » (KI-06) |
| Déplacement de la Baliste (position **et** statut « position définie », §15) | |
| Déplacement d'unités : **une seule entrée** pour tout le groupe, qui restaure la position **et le camp** de chaque unité | |

- **Remise à zéro** : l'historique est vidé à l'ouverture de l'éditeur, au
  chargement d'un fichier et à la sortie.
- **Particularité** : l'annulation d'un déplacement peut modifier
  l'orientation d'un décor jamais tourné, voir **KI-05**.

## 11. Panneau de propriétés

- **Décor sélectionné** :
  - type et modèle ;
  - position, avec deux décimales ;
  - emprise en cases ;
  - rotation, toujours affichée entre 0 et 359° ;
  - rappel « Ctrl + molette : ±15° • Maj : ±1° » sous la rotation ;
  - boutons « Tourner 90° (R) » et « Supprimer (Suppr) ».
- **Unité sélectionnée** : type, camp, position, bouton « Supprimer ». Pas de
  bouton « Tourner ».
- **Groupe d'unités** et **Baliste** : pas de panneau.

## 12. Caméra

Mêmes contrôles qu'en partie, avec deux différences dans l'éditeur.

| Contrôle | Effet |
|---|---|
| Maj + clic droit maintenu + glisser | Pivoter / incliner |
| Clic gauche + clic droit maintenus + glisser (dans n'importe quel ordre) | Déplacer la caméra |
| Molette | Zoom |
| ← → / ↑ ↓ | Pivoter / incliner |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser la caméra |

Le geste est décidé au moment où le clic droit est enfoncé, jamais selon
la distance parcourue par la souris :

- **Clic droit seul** : ne bouge jamais la caméra, même si la souris glisse
  un peu. C'est une action ponctuelle selon le contexte. Dans l'éditeur,
  elle annule l'outil actif, sinon désélectionne. En partie, elle désarme un
  parchemin, annule le placement d'un bâtiment, ou donne un ordre RTS aux
  unités sélectionnées pendant la bataille.
- **Maj + clic droit** : reste une rotation jusqu'au relâchement, même si
  Maj est relâché en cours de geste. Il ne déclenche ni action ponctuelle ni
  ordre, et ne désélectionne donc rien.
- **Clic gauche + clic droit** : déplace la caméra. Le geste du clic gauche
  en cours (rectangle de sélection, etc.) est annulé, et aucun ordre ni
  aucune sélection n'est produit.
- **Bouton du milieu** (clic molette) : non utilisé.

Différences avec la partie :

- **R** tourne le décor sélectionné au lieu de réinitialiser la caméra. Dans
  l'éditeur, c'est **Espace** qui la réinitialise.
- **Ctrl + molette** tourne le décor sélectionné au lieu de zoomer. Sans décor
  sélectionné, la molette zoome normalement.

## 13. Enregistrer et charger

- **Enregistrer** : télécharge un fichier `<nom de la carte>.json`. Il n'y a
  pas de serveur ; le fichier arrive dans les téléchargements du navigateur.
- **Charger une carte** :
  - ouvre un `.json` et **remplace** le brouillon en cours ;
  - vide l'historique ;
  - un fichier invalide affiche une alerte et le brouillon reste intact ;
  - la validation est minimale : seule la présence des champs principaux est
    vérifiée.

**Vue pratique du format `MapDef`**

Ce résumé n'est pas une spécification exhaustive. Le format complet est
défini dans `config/mapDef.ts` et `config/constants.ts` (`ObstacleDef`) ;
voir aussi `ARCHITECTURE.md`.

| Champ | Contenu |
|---|---|
| `name`, `version` | Nom (sert de nom de fichier) et version |
| `width`, `height` | Taille de référence du plateau |
| `cells` | Liste des cases présentes, avec leur type de terrain. Optionnel : absent = rectangle plein d'herbe |
| `obstacles` | Décors : `kind` (rocher, arbre, prop, bâtiment), modèle, emprise `tilesX` × `tilesZ`, position `x` / `z` (ou ancien coin `cornerX` / `cornerZ`), `rotationY` optionnel |
| `playerUnits`, `enemyUnits` | Unités : `unitId`, `x`, `z` |
| `ballista` | Centre de la Baliste en coordonnées monde : `{ x, z }`. Optionnel : absent = repli historique (coin +X +Z, `computePlayerArrowOrigin`) |

- **Camp des unités** : ce n'est pas un champ. Il est porté par la liste
  (`playerUnits` ou `enemyUnits`) dans laquelle l'unité est enregistrée.
- **`ballista`** : écrit **seulement** si la position de la Baliste a été
  définie explicitement (déplacée dans l'éditeur, ou déjà présente dans la
  carte chargée). Au chargement, il n'est conservé que si `x` et `z` sont des
  nombres finis. Enregistrer puis recharger conserve la position.
- **Non enregistrés** : les identifiants internes de l'éditeur.
- **Compatibilité** : les anciennes cartes, sans `cells`, avec des coins de
  grille ou sans `ballista`, se chargent toujours. Une carte sans `ballista`
  rouverte puis réenregistrée sans déplacer la Baliste reste **sans** ce
  champ.

## 14. Tester le scénario

- **Ce que fait le test** : il lance une **vraie bataille** sur la carte en
  cours d'édition, avec les mêmes règles qu'en partie.
- **Baliste** : une **vraie** Baliste est créée, comme en partie. C'est un
  bâtiment de simulation avec ses PV (améliorations permanentes comprises),
  sa collision (les unités ne la traversent pas) et sa destruction : HUD
  `[Q] BALISTE — DÉTRUITE`, tir Q bloqué, collision libérée.
  - **Position** : celle de la carte (`ballista`), sinon le repli historique.
    Le modèle affiché, l'origine des tirs, le bâtiment et sa collision sont
    tous exactement à cette position.
  - Elle compte pour la survie du camp joueur : le test ne s'arrête pas à la
    mort de la dernière unité alliée tant que la tour tient.
- **Retour à l'éditeur** : automatique dès qu'un camp n'a plus de combattant,
  ou avec **Échap**. Le brouillon est retrouvé intact, et la tour réapparaît
  à sa position d'édition, même si elle a été détruite. Un deuxième test
  repart avec une Baliste neuve.
- **Ce que le test ne fait pas** :
  - il n'utilise ni l'or, ni l'armée, ni les bâtiments d'une run ;
  - il n'accorde aucune récompense de méta-progression ;
  - il ne crée **ni Mine ni Caserne**, voir **KI-07**.

## 15. Bâtiments décoratifs, bâtiments gameplay et Baliste

- **Bâtiments du catalogue** (KayKit bleu, rouge, neutres) : ce sont de
  **simples obstacles**. Ils bloquent le passage et la ligne de tir, mais ne
  peuvent être ni ciblés, ni détruits, ni produire quoi que ce soit.
- **Mine et Caserne** (bâtiments gameplay) : elles n'existent qu'en partie,
  achetées et posées par le joueur. On ne peut pas les placer depuis
  l'éditeur.

**La Baliste**

La tour de la Baliste est toujours présente dans l'éditeur, et sa position
fait partie de la carte (`ballista`, §13).

- **Position par défaut** : une carte sans `ballista` affiche la Baliste au
  repli historique (coin +X +Z). Tant qu'elle n'a pas été déplacée, elle suit
  ce coin si la taille du plateau change.
- **Sélection** : clic gauche sur la tour. Elle est entourée d'un anneau à
  la couleur de son camp (bleu, le joueur).
- **Déplacement** : Baliste sélectionnée, puis clic au sol, pris en compte
  dès l'appui (un glisser ne trace pas de rectangle d'unités). Le centre est
  calé sur la même **grille de 3×3 cases** que le placement obligatoire de la
  tour en partie. Le modèle suit immédiatement : la position enregistrée et
  la tour affichée sont toujours au même endroit.
- **Déplacement refusé** (rien ne change, la Baliste reste sélectionnée) si,
  dans l'empreinte réelle de la tour (carré de 2,4 cases, la même collision
  qu'en bataille) :
  - une case manque : la tour sortirait du plateau ou recouvrirait un trou ;
  - un obstacle bloquant chevauche l'empreinte (un simple contact de bord est
    accepté) ;
  - le centre d'une unité est dans l'empreinte.
- **Aucune restriction de moitié** : la Baliste peut être posée des deux côtés
  du plateau ; cette règle dépendra du futur chantier de zone constructible.
- **Gardes** : une fois la Baliste en place, aucune unité ne peut être posée
  ni déplacée dans son empreinte, et aucune case sous elle ne peut être
  supprimée. Les décors en placement libre peuvent encore la chevaucher.
- **Suppr et R** : sans effet sur elle.
- **Annuler / rétablir** : chaque déplacement est annulable ; Ctrl+Z et
  Ctrl+Y restaurent la position **et** le statut « position définie ». Une
  carte ramenée au repli ne réécrit donc pas le champ.
- **Position invalide dans un fichier** (modifié à la main, par exemple) :
  elle est remplacée par la position valide la plus proche sur la grille,
  avec un avertissement en console. La recherche est déterministe. Si aucune
  position valide n'existe, la position est conservée et un avertissement est
  affiché. Le repli d'une carte sans champ n'est jamais déplacé
  automatiquement.
- **Partie réelle** : sans effet. Une run garde son **placement obligatoire**
  de la tour en début de partie, indépendant de cette position.

## 16. Cartes à trous

- Supprimer des cases crée des trous dans la carte.
- **En bataille** (y compris « Tester le scénario »), un trou bloque comme un
  obstacle.
- **Dans l'éditeur**, une unité ne peut pas être posée ni déplacée hors d'une
  case existante, et la Baliste ne peut pas être déplacée au-dessus d'un trou.
- Le placement du jeu réel ne tient pas compte des trous (**KI-02**). C'est
  sans effet aujourd'hui : le jeu réel n'utilise pas de carte issue de
  l'éditeur.

## 17. Limitations connues

Détaillées dans `KNOWN_ISSUES.md` :

- **KI-05** : l'annulation d'un déplacement peut réorienter un décor.
- **KI-06** : R / « Tourner 90° » est hors historique et part de 0°.
- **KI-07** : « Tester le scénario » ne crée ni Mine ni Caserne.
- **KI-02** : le placement en jeu est insensible aux trous de cellules.
- **KI-19** : des raccourcis clavier restent actifs pendant la saisie dans
  un champ (par exemple Retour arrière dans le champ « Taille » avec un objet
  sélectionné).
- **KI-20** : certaines règles ne testent que la **case centrale** d'un
  obstacle (suppression d'une case, pose et déplacement d'unités). Un gros
  rocher ne bloque donc que sa case centrale.

Limites de l'aperçu de déplacement, sans conséquence sur le résultat :

- une silhouette rouge peut s'afficher hors du plateau, à la case visée ;
- l'outil « poser une unité » garde son propre fantôme (case verte ou rouge
  et modèle translucide), distinct de l'aperçu de déplacement.

## 18. Pour les développeurs

| Fichier | Rôle |
|---|---|
| `editor/editorState.ts` | État de l'éditeur et règles de validité (`canPlaceUnitAt`, avec les unités déplacées à ignorer, `canAddCell`, `canRemoveCell`, `canPlaceBallistaAt`) ; sélection d'unités (`selectUnits`, `toggleUnitSelection`, `selectedUnitIds`) ; déplacement et historique des unités (`moveUnits`, `setUnitStates`, `teamForZ`) ; position de la Baliste (`ballista`, `ballistaExplicit`, `moveBallista`) |
| `config/mapDef.ts` | Format `MapDef` ; `resolveBallistaOrigin` (position de la Baliste ou repli), `snapBallistaOrigin` (grille de 3×3) |
| `editor/editorScene.ts` | Meshes, fantômes des outils de pose, aperçus de cases, anneau de sélection des décors et de la Baliste et sa zone de saisie (couleur fixée par `main.ts` : dorée pour un décor, `teamColor` du camp pour la Baliste) |
| `core/gridGroupMove.ts` | Calcul pur et déterministe du déplacement d'unités sur la grille, partagé avec la préparation |
| `render/unitMovePreview.ts` | Aperçu de déplacement : empreintes vertes/rouges et silhouettes translucides réutilisées |
| `render/unitSelectionRing.ts` | Anneau de sélection commun aux unités, à la couleur du camp |
| `editor/editorUI.ts` | Barre d'outils, catalogue (`ASSET_GROUPS`), panneau de propriétés, aide |
| `editor/history.ts` | Pile de commandes annuler / rétablir |
| `editor/mapSerializer.ts` | Export et import JSON |
| `main.ts` | Orchestration et entrées : `enterEditor`, `handleEditorClick` et `pickEditorObjectAt`, sélection des unités (`resolveEditorPointerClick`, `selectEditorUnitsInRect`, `selectVisibleSameTypeEditorUnits`), déplacement (`editorUnitMoveProposal`, `applyEditorUnitMove`, `updateMovePreview`), `moveEditorBallista`, rotation (`tryStartRingRotate`, `rotateSelectedObstacleBy`), `TransformControls`, `testScenario`, `setupTestBattle` / `spawnBallistaBuilding` |

Conventions actuelles :

- **Meshes réutilisés** : lors des rafraîchissements, les meshes sont
  préservés et réutilisés autant que possible via le cache par id. Certaines
  fabriques de décors tirent leur apparence au hasard ; recréer un mesh
  ferait changer l'objet à l'écran. Le mesh d'une unité est reconstruit
  seulement quand son camp change.
- **Règle de validité unique** : l'aperçu vert/rouge et le clic utilisent la
  même fonction de validité, jamais deux calculs séparés. Pour un
  déplacement d'unités, l'aperçu et le clic passent aussi par le même plan
  (`core/gridGroupMove.ts`).
- **Historique** : une commande par **geste** (au relâchement, ou par cran de
  molette), jamais une par frame.
- **Source de vérité de la rotation** : `rotationY`, dans l'état de l'éditeur
  et dans le fichier enregistré.
- **Ajouter un asset au catalogue** : une entrée dans `ASSET_GROUPS`
  (`editor/editorUI.ts`), et le modèle correspondant dans
  `render/assetLibrary.ts`.

## 19. Récapitulatif des contrôles

**Souris**

| Geste | Effet |
|---|---|
| Clic gauche sur un décor / une unité / la Baliste | Sélectionner |
| Maj + clic sur une unité | Ajouter ou retirer de la sélection |
| Glisser depuis le sol ou une unité | Rectangle de sélection d'unités (des deux camps), sauf Baliste sélectionnée |
| Double-clic sur une unité | Sélectionner les unités visibles du même type et du même camp |
| Survol du terrain (unités sélectionnées) | Aperçu du déplacement (empreintes vertes/rouges, silhouettes) |
| Clic gauche au sol (unités sélectionnées) | Déplacer selon l'aperçu ; réussite : sélection vidée, refus : sélection conservée |
| Clic gauche au sol (Baliste sélectionnée) | Déplacer la Baliste (grille de 3×3), dès l'appui |
| Clic gauche (outil de pose actif) | Poser l'objet ou l'unité |
| Clic gauche (outil de case actif) | Ajouter ou supprimer une case |
| Glisser une flèche du gizmo | Déplacer le décor |
| Glisser l'anneau jaune | Tourner le décor |
| Clic droit seul | Annuler l'outil actif, sinon désélectionner (jamais de mouvement de caméra) |
| Maj + clic droit maintenu + glisser | Pivoter / incliner la caméra |
| Clic gauche + clic droit maintenus + glisser | Déplacer la caméra |
| Molette | Zoom |
| Ctrl + molette | Tourner le décor de ±15° |
| Ctrl + Maj + molette | Tourner le décor de ±1° |

**Clavier**

| Touche | Effet |
|---|---|
| R | +90° au décor sélectionné (sans effet sur la Baliste) |
| Suppr / Retour arrière | Supprimer la sélection (sans effet sur la Baliste) |
| Échap | Annuler l'outil actif, sinon désélectionner ; pendant un test, revenir à l'éditeur |
| Ctrl+Z | Annuler |
| Ctrl+Y / Ctrl+Maj+Z | Rétablir |
| ← → / ↑ ↓ | Pivoter / incliner la caméra |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser la caméra |
| X | Vitesse ×2 (utile pendant un test) |
