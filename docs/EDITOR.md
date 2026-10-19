# Éditeur de maps

Ce document décrit l'éditeur de maps d'Arrow Tactics **tel qu'il fonctionne
aujourd'hui**, d'après le code de la branche `reprise-2026`. En cas d'écart,
le code fait foi.

Pour l'organisation technique générale, voir `ARCHITECTURE.md` ; pour les bugs
et limitations, `KNOWN_ISSUES.md`.

**Portée des cartes de l'éditeur** : une run ne charge aucune carte
enregistrée depuis l'éditeur. Le Mode survie part de son arène officielle,
exportée de l'éditeur puis intégrée au code (`SURVIVAL_BASE_MAP`, voir
`CURRENT_STATE.md` §11) : il en utilise le terrain, les décors, le
territoire et la position de la Baliste. Une carte de l'éditeur sert à
« Tester le scénario » (§15) ; ses unités (`playerUnits`, `enemyUnits`) ne
définissent ni l'armée de départ ni les vagues d'une run.

## Sommaire

1. Ouvrir, quitter, nouvelle carte
2. L'interface
3. Carte : taille et cases de terrain
4. Territoire
5. Unités
6. Catalogue des décors
7. Sélection
8. Déplacement
9. Rotation des décors
10. Supprimer
11. Annuler / rétablir
12. Panneau de propriétés
13. Caméra
14. Enregistrer, charger, état non enregistré
15. Tester le scénario
16. Structures décoratives, bâtiments gameplay et Baliste
17. Cartes à trous
18. Limitations connues
19. Pour les développeurs
20. Récapitulatif des contrôles

---

## 1. Ouvrir, quitter, nouvelle carte

- **Ouvrir** : menu principal → **Éditeur de maps**. L'éditeur s'ouvre
  toujours sur la **carte historique** « vague1-20 » (18 × 26,
  `DEFAULT_MAP`), qui n'est plus celle du Mode survie, avec un historique
  vide. Cette carte est considérée comme enregistrée (§14).
- **Quitter** : **« ← Retour au menu »**. Si la carte a des modifications
  non enregistrées, une confirmation est demandée (§14).
- **Nouvelle carte** (barre du haut) : remplace le brouillon par une carte
  vierge, après confirmation si le brouillon n'est pas enregistré :
  - 18×26 cases, rectangle plein de cases d'herbe ;
  - aucun obstacle, aucune unité ;
  - pas de position de Baliste explicite (repli du coin, §16) ;
  - pas de territoire explicite : le territoire affiché est le repli
    historique (§4) jusqu'au premier coup de pinceau ;
  - `version: 1`, nom « Nouvelle carte » ;
  - historique vide, carte **non enregistrée** jusqu'au premier Enregistrer.
- **Nom de la carte** : il n'est pas modifiable dans l'interface. Une
  nouvelle carte s'enregistre donc sous le nom « Nouvelle carte ».
- **Indépendance** : l'éditeur affiche son propre plateau. La partie réelle
  n'est pas modifiée par ce qui se passe dans l'éditeur, et la caméra du jeu
  est restaurée en sortant (§13).

## 2. L'interface

- **Barre du haut** (48 px, une ligne) : « ← Retour au menu », « Nouvelle
  carte », « Enregistrer », « Charger une carte », « Tester le scénario »,
  puis à droite « Éditeur de maps · *nom de la carte* », suivi de
  « • non enregistré » quand la carte a des modifications non enregistrées.
- **Colonne de gauche** (220 px), de haut en bas :
  - **Sélection** : outil par défaut, toujours visible en haut de la colonne,
    même quand le reste défile ;
  - **Carte** : Taille (§3) et outils de cases ;
  - **Territoire** : outil « Peindre le territoire », valeur Joueur / Ennemi
    / Neutre et légende (§4) ;
  - **Unités** : le bestiaire (§5) ;
  - **Décors** : recherche et catalogue par catégories (§6).
- **Panneau de droite** (240 px) : **Propriétés** de la sélection (§12).
  Il est toujours présent ; sans sélection, il affiche « Aucune sélection ».
- **Ligne d'état** (barre du bas, 44 px) : outil actif et gestes utiles,
  selon le contexte (par exemple « Outil : Territoire — Joueur · Clic /
  glisser : peindre · 1 / 2 / 3 : Joueur / Ennemi / Neutre · Échap :
  Sélection »).
- **Outil actif** : son bouton est mis en surbrillance (`aria-pressed`).
  Échap, le clic droit ou **V** ramènent à l'outil Sélection.
- **Panneaux repliables** : un petit chevron en haut du bord intérieur de
  chaque panneau latéral le replie ou le déplie (`aria-expanded`, infobulle
  « Masquer… » / « Afficher… »). Replié, le panneau disparaît et son chevron
  reste contre le bord de la fenêtre ; le plateau récupère la place.
  - Le contenu et la sélection sont conservés.
  - L'état replié tient pendant « Tester le scénario » et au retour, mais
    n'est pas sauvegardé.
  - Utile surtout à 1280×720.
- **Pendant « Tester le scénario »** : toute l'interface de l'éditeur est
  masquée, sauf un cartouche en haut à gauche (« Test du scénario · Échap :
  revenir à l'éditeur »).

## 3. Carte : taille et cases de terrain

**Taille**

- Deux champs (largeur × hauteur) et le bouton **Appliquer**. Le minimum est
  de 1×1. Taper une valeur sans Appliquer ne change rien.
- Agrandir **ajoute** des cases d'herbe.
- Réduire **ne supprime ni cases ni objets** existants : ils restent en place,
  éventuellement hors des nouvelles dimensions. Ce comportement est
  volontaire ; pour retirer des cases, utiliser « − Supprimer case ».
- Appliquer une nouvelle taille est **annulable** (Ctrl+Z), avec les cases
  ajoutées et la position de repli de la Baliste. Appliquer la même taille
  ne crée aucune entrée d'historique.

**Cases de terrain**

- Outils : **+ Case (Herbe)**, **+ Case (Terre)**, **− Supprimer case**.
- Ce sont des outils **répétables** : ils restent actifs jusqu'à Échap, un
  clic droit ou le choix d'un autre outil. Chaque case ajoutée ou supprimée
  est une entrée d'historique.
- Un aperçu vert ou rouge indique sous le curseur si l'action est possible.
- **Ajout** : refusé si une case existe déjà à cet endroit. Une case ajoutée
  est neutre si le territoire est explicite ; avec le repli historique, les
  bandes sont recalculées sur les cases présentes (§4).
- **Suppression** : refusée si une unité ou un obstacle bloquant occupe la
  case (seule la case du centre de l'obstacle compte, **KI-20**), ou si la
  case est sous l'empreinte de la Baliste (§16). Un décor traversable
  n'empêche pas la suppression. Supprimer une case retire aussi son entrée de
  territoire explicite.

## 4. Territoire

Le territoire dit à quel camp appartient chaque case. Il est sauvegardé dans
la carte (`MapDef.territory`, §14) et sert :

- en jeu, de **zone de placement** du joueur (unités, bâtiments, tour), voir
  `CURRENT_STATE.md` §11 ;
- dans l'éditeur, à **déterminer le camp** des unités posées ou déplacées
  (§5) et à valider le déplacement de la Baliste (§16) ;
- au **rendu** des zones, case par case : bleu pour le joueur, rouge pour
  l'ennemi, rien pour une case neutre.

**Valeurs**

- Une case appartient au **joueur**, à l'**ennemi**, ou n'a pas d'entrée :
  elle est alors **neutre**. Neutre n'est pas un troisième camp, c'est
  l'absence d'entrée.

**Territoire explicite ou repli historique**

- **Carte sans champ `territory`** (anciennes cartes, nouvelle carte) : le
  territoire affiché et utilisé est le **repli historique**, deux bandes de
  7 rangées (`PLACEMENT_ROWS`), à l'arrière +z pour le joueur et à l'arrière
  −z pour l'ennemi, limitées aux cases existantes ; le centre est neutre. Ce
  repli est recalculé quand les cases changent.
- **`territory: []`** : territoire explicitement vide. Toutes les cases sont
  neutres ; le repli ne s'applique pas.
- **Ouvrir puis enregistrer** une carte sans toucher au territoire ne crée
  pas le champ : le repli n'est jamais matérialisé par un simple
  enregistrement.
- **Premier vrai changement** (coup de pinceau qui modifie une case) : le
  repli affiché est d'abord copié en territoire explicite, puis la
  modification est appliquée. Les bandes ne disparaissent donc pas.

**Outil « Peindre le territoire »**

- Choisir **Joueur**, **Ennemi** ou **Neutre** (boutons ou touches
  **1 / 2 / 3** quand l'outil est actif ; choisir une valeur active l'outil).
- **Clic** ou **glisser** sur les cases : elles prennent la valeur choisie.
  Un aperçu de case s'affiche sous le curseur. Seules les cases existantes
  se peignent.
- Un trait complet (de l'appui au relâchement) est **une seule entrée**
  d'historique.
- Peindre ne change le camp d'**aucune unité déjà posée** : une unité
  restée sur une case devenue neutre ou adverse garde son camp jusqu'à son
  prochain déplacement. Le panneau de propriétés le signale (§12).

## 5. Unités

- **Pose** : choisir une unité du bestiaire, puis cliquer. L'unité est
  alignée au **centre d'une case**, avec un aperçu de case vert ou rouge et
  un fantôme du modèle. Après la pose, l'outil revient à Sélection et l'unité
  posée est sélectionnée.
- **Camp** : celui du **territoire de la case** (§4) au moment de la pose ou
  du déplacement. Il n'y a pas de choix de camp séparé.
  - territoire joueur → unité du joueur ;
  - territoire ennemi → unité ennemie ;
  - case **neutre** → pose et déplacement **interdits**.
- **Pose refusée** :
  - sans case de terrain ;
  - sur une case neutre ;
  - sur un obstacle bloquant (seule la case du centre de l'obstacle compte,
    **KI-20**) ;
  - sur une autre unité ;
  - dans l'empreinte de la Baliste (§16).

  Les déplacements d'unités appliquent les mêmes règles (§8).
- **Unités anciennes** : une unité chargée, ou laissée par un changement de
  territoire, sur une case neutre ou adverse est **conservée telle quelle**,
  avec son camp, jusqu'à ce qu'elle soit déplacée.
- **Rotation** : les unités ne se tournent pas ; les actions de rotation ne
  s'affichent que pour les décors.
- **Rôle** : ces unités forment le scénario de « Tester le scénario » (§15),
  pas l'armée d'une run.

## 6. Catalogue des décors

Rangement du catalogue, par catégories dépliables (seule « Obstacles » est
ouverte au départ) :

| Catégorie | Contenu |
|---|---|
| Obstacles | Rochers, arbres (bloquants) |
| Végétation | Buissons et plantes, champignons |
| Fleurs | Fleurs |
| Bois | Bûches, souches |
| Accessoires | Accessoires KayKit |
| Nature | Éléments de nature KayKit |
| Structures décoratives | Bâtiments KayKit : teinte bleue, teinte rouge, neutres |
| Divers | Autres décors |

- **Carte de décor** : nom lisible, taille, et badge **Bloquant** ou
  **Traversable** (même règle de collision qu'en bataille).
- **Recherche** : le champ « Rechercher un décor… » filtre en direct, sans
  tenir compte des accents ni de la casse, sur le nom, la catégorie et
  l'identifiant technique. Les catégories qui contiennent un résultat
  s'ouvrent, les autres se masquent ; un message s'affiche si rien ne
  correspond. Effacer la recherche rétablit l'état des catégories.
- **Pose libre** : un clic pose le décor exactement sous le curseur, sans
  alignement sur une case. Un fantôme semi-transparent le montre avant le
  clic. Après la pose, l'outil revient à Sélection et le décor posé est
  sélectionné.
- **Aspect fixe** : l'aspect d'un décor (orientation s'il n'a pas de
  `rotationY`, forme d'un rocher, hauteur d'un arbre) dépend de sa position.
  Il est identique dans l'éditeur, dans « Tester le scénario », dans le Mode
  survie et d'une session à l'autre. Déplacer un décor lui donne un nouvel
  aspect, visible dès le relâchement ; une `rotationY` explicite (§9) reste
  prioritaire.
- **Collisions en bataille** : les décors traversables (fleurs, plantes,
  accessoires…) n'ont pas de collision ; rochers, arbres et structures
  bloquent le passage et la ligne de tir.
- **Structures décoratives ≠ bâtiments gameplay** : une Forge, une Mine ou
  une Caserne du catalogue n'est qu'un **décor bloquant**, sans PV ni effet
  (§16).

## 7. Sélection

- **Décor ou Baliste** : un clic gauche le sélectionne, dès l'appui. Un décor
  est entouré d'un anneau doré. La Baliste, qui reste un objet distinct des
  unités, est entourée d'un anneau à la couleur de son camp (le bleu du
  joueur).
- **Priorité** : le clic retient l'objet touché le plus proche de la caméra,
  décor, unité ou Baliste. Un petit décor traversable peut donc capter un
  clic destiné au sol ou à une unité derrière lui (§18).
- **Unités** : mêmes gestes qu'en préparation et en bataille. Les unités des
  deux camps sont sélectionnables.

| Geste | Effet |
|---|---|
| Clic gauche sur une unité | Sélection simple : elle devient la seule sélectionnée |
| Maj + clic sur une unité | L'ajoute à la sélection ou l'en retire |
| Maj + clic dans le vide | Rien : la sélection reste |
| Glisser (rectangle), depuis le sol ou une unité | Remplace la sélection par les unités encadrées, des deux camps. Avec Maj, remplace aussi. Jamais quand la Baliste est sélectionnée (§8) |
| Double-clic sur une unité | Unités du même type **et du même camp** visibles à l'écran, jamais celles hors champ |

- **Rectangle** : il ne sélectionne jamais un décor ni la Baliste. Un vrai
  glisser n'est jamais pris pour un clic au relâchement, et un clic droit
  ajouté pendant le rectangle l'annule (déplacement de la caméra, §13).
- **Anneau des unités** : celui de la préparation et de la bataille, à la
  couleur du camp de l'unité, jamais une couleur de validation.
- **Une seule sélection à la fois** : un décor, la Baliste, ou un ensemble
  d'unités. Ils ne se mélangent jamais. Maj + clic sur une unité alors qu'un
  décor ou la Baliste est sélectionné démarre une nouvelle sélection
  d'unités.
- **Désélectionner** :
  - clic droit ou Échap ;
  - clic gauche dans le vide, sans Maj, quand ni unité ni Baliste n'est
    sélectionnée. Avec des unités ou la Baliste sélectionnées, ce clic est
    un déplacement (§8).
- Avec un **décor** sélectionné, un clic gauche sur le sol le désélectionne.

## 8. Déplacement

- **Décors** :
  - uniquement avec les **flèches du gizmo** ;
  - déplacement libre sur le plan horizontal ;
  - un glisser complet compte comme **une seule entrée** d'historique.
- **Unités et groupes** : même geste et même calcul qu'en préparation.
  - **Aperçu au survol** : avec une ou plusieurs unités sélectionnées, le
    survol du terrain montre leur destination avant le clic. Chaque unité a
    une **empreinte** au sol, **verte** si sa destination est valide,
    **rouge** sinon, et une **silhouette translucide** de son modèle, dans
    le camp qu'elle aura à l'arrivée. Les vraies unités restent visibles
    avec leur anneau.
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
  - **Après un déplacement réussi** : la sélection est vidée et l'aperçu
    disparaît aussitôt.
  - **Après un refus** : rien ne bouge, la sélection et l'aperçu restent
    disponibles pour une nouvelle tentative.
  - **Aperçu masqué** :
    - quand le curseur est sur un objet qu'un clic sélectionnerait ;
    - pendant un rectangle de sélection, un geste caméra, le gizmo ou la
      rotation à l'anneau ;
    - avec un outil de pose ;
    - quand le plan ne déplacerait aucune unité.
- **Règle de validité** : celle de la pose (§5, `canPlaceUnitAt`), y compris
  le refus des cases neutres. Les cases actuelles des unités déplacées ne
  comptent pas.
- **Camp** : chaque unité déplacée prend le camp du territoire de sa case
  d'arrivée. Amenée en territoire adverse, elle change de camp ; l'aperçu le
  montre déjà. Un déplacement de groupe est **une seule entrée**
  d'historique, qui restaure positions et camps.
- **Baliste** : la sélectionner, puis cliquer au sol, voir §16.

## 9. Rotation des décors

| Moyen | Effet |
|---|---|
| Glisser l'**anneau jaune** autour du décor | Rotation libre autour de l'axe vertical |
| **Ctrl + molette** | ±15° par cran |
| **Ctrl + Maj + molette** | ±1° par cran |
| Boutons **−15°** / **+15°** du panneau | ±15° |
| **R** ou bouton **« +90° (R) »** | +90° |

- **Point de départ** : tous ces moyens partent de l'orientation **réellement
  affichée**, y compris celle, fixée par sa position, d'un décor jamais
  tourné.
- **Pas de saut** au passage 0° / 360°.
- **Historique** : un glisser de l'anneau = une entrée ; chaque cran de
  molette = une entrée ; chaque appui sur R ou sur un bouton = une entrée.
  Annuler la première rotation d'un décor jamais tourné lui rend exactement
  son orientation d'origine.
- **Ce qui n'existe plus** : le mode rotation W/E du gizmo. W ne fait rien et
  E sert au zoom.
- **À ne pas confondre** : le **Ctrl+molette par pas de 45°** concerne le
  placement des bâtiments **en partie**, pas l'éditeur.

## 10. Supprimer

- **Suppr**, **Retour arrière** ou le bouton **« Supprimer (Suppr) »**
  suppriment la sélection : un décor, une unité ou un groupe.
- La suppression est **annulable** : Ctrl+Z restaure les objets et la
  sélection.
- **La Baliste ne se supprime pas** : Suppr est sans effet sur elle, tout
  comme R.

## 11. Annuler / rétablir

- **Raccourcis** : **Ctrl+Z** pour annuler, **Ctrl+Y** ou **Ctrl+Maj+Z** pour
  rétablir.
- **Opérations historisées**, une entrée par geste :
  - pose d'une unité ou d'un décor ;
  - suppression d'un décor, d'une unité ou d'un groupe ;
  - déplacement d'unités (une entrée pour tout le groupe, positions et
    camps) ;
  - déplacement d'un décor au gizmo ;
  - rotation à l'anneau, par Ctrl+molette (une entrée par cran), par
    −15° / +15° et par R / +90° ;
  - déplacement de la Baliste (position **et** statut « position définie »,
    §16) ;
  - ajout ou suppression d'une case ;
  - trait de peinture du territoire ;
  - changement de Taille.
- **Annuler une pose ou une suppression** restaure aussi la sélection.
- **Remise à zéro** : l'historique est vidé à l'ouverture de l'éditeur, au
  chargement réussi d'un fichier, à la création d'une nouvelle carte et à la
  sortie. **Enregistrer ne le vide pas.**
- **État non enregistré** : annuler ou rétablir peut ramener exactement à la
  carte enregistrée, qui redevient alors « enregistrée » (§14).
- **Déplacement au gizmo annulé** : le décor retrouve exactement sa position,
  sa rotation (ou son absence de rotation) et son aspect d'origine.

## 12. Panneau de propriétés

Toujours affiché à droite (sauf replié, §2) ; son contenu suit la sélection.

- **Aucune sélection** : « Sélectionnez un objet ou une unité sur la carte. »
- **Décor** :
  - nom (identifiant technique en infobulle) et type (« Décor » ou
    « Structure décorative ») ;
  - catégorie, taille en cases, collision (Bloquant / Traversable) ; une
    structure décorative porte la mention « Aucun effet de jeu : simple
    obstacle » ;
  - position (deux décimales au plus) ;
  - angle affiché, toujours entre 0 et 359° ;
  - actions **−15°**, **+15°**, **+90° (R)** et **Supprimer (Suppr)**.
- **Unité** (« Unité du scénario ») : camp, position, action Supprimer. Si
  sa case appartient à un autre camp ou est neutre, une ligne « Territoire
  actuel » le signale.
- **Groupe** : nombre d'unités, composition par type, camps (et nombre
  d'unités hors de leur territoire), action Supprimer.
- **Baliste** (« Objectif gameplay ») : camp Joueur, position, rappel de la
  règle de placement 3×3 en territoire joueur. Aucune action.

## 13. Caméra

**Cadrage**

- La caméra cadre le plateau dans l'**espace libre** entre la barre du haut,
  la ligne d'état et les panneaux ouverts, jamais dans toute la fenêtre : le
  plateau ne passe plus sous les panneaux.
- **À l'ouverture, au chargement et pour une nouvelle carte**, toute la
  carte est cadrée avec une petite marge, sans changer l'orientation ni
  l'inclinaison.
- **Espace** remet l'angle par défaut et recadre toute la carte dans
  l'espace libre actuel.
- **Repli d'un panneau ou redimensionnement de la fenêtre** : tant que la
  caméra n'a pas été touchée, la carte est recadrée automatiquement. Après
  un zoom, un déplacement ou une rotation, le zoom et le point au centre de
  l'espace libre sont conservés.
- **Changement de Taille** : pas de recadrage automatique ; Espace recadre.
- **Limites de zoom** : une grande carte peut dépasser le dézoom maximal du
  jeu pour être vue entière ; une petite carte reste limitée par le zoom
  avant maximal et ne remplit pas tout l'espace.
- **En sortant** de l'éditeur, la caméra du jeu retrouve exactement l'état
  qu'elle avait avant l'ouverture.

**Contrôles**

| Contrôle | Effet |
|---|---|
| Maj + clic droit maintenu + glisser | Pivoter / incliner |
| Clic gauche + clic droit maintenus + glisser (dans n'importe quel ordre) | Déplacer la caméra |
| Molette | Zoom |
| ← → / ↑ ↓ | Pivoter / incliner |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser l'angle et recadrer la carte |

Le geste est décidé au moment où le clic droit est enfoncé, jamais selon
la distance parcourue par la souris :

- **Clic droit seul** : ne bouge jamais la caméra. Dans l'éditeur, il
  annule l'outil actif, sinon désélectionne.
- **Maj + clic droit** : reste une rotation jusqu'au relâchement, même si
  Maj est relâché en cours de geste.
- **Clic gauche + clic droit** : déplace la caméra. Le geste du clic gauche
  en cours (rectangle de sélection, etc.) est annulé.
- **Bouton du milieu** : non utilisé.

Différences avec la partie :

- **R** tourne le décor sélectionné au lieu de réinitialiser la caméra ;
  c'est **Espace** qui la réinitialise.
- **Ctrl + molette** tourne le décor sélectionné au lieu de zoomer. Sans
  décor sélectionné, la molette zoome normalement.

## 14. Enregistrer, charger, état non enregistré

**Enregistrer et charger**

- **Enregistrer** : télécharge un fichier `<nom de la carte>.json`. Il n'y a
  pas de serveur ; le fichier arrive dans les téléchargements du navigateur.
  La carte devient « enregistrée » ; l'historique est conservé.
- **Charger une carte** :
  - si la carte a des modifications non enregistrées, la confirmation est
    demandée **avant** le choix du fichier ; refuser ne change rien ;
  - annuler le choix du fichier ne change rien (la carte reste non
    enregistrée si elle l'était) ;
  - un fichier invalide affiche une alerte ; le brouillon et son état sont
    conservés ;
  - un chargement réussi remplace le brouillon, vide l'historique, recadre
    la caméra, et la carte chargée devient la référence « enregistrée » ;
  - la validation est minimale : seule la présence des champs principaux est
    vérifiée.

**État non enregistré**

- **Référence** : le dernier état considéré comme enregistré, c'est-à-dire
  la carte à l'ouverture de l'éditeur, après un chargement réussi ou après
  le dernier Enregistrer. Une nouvelle carte n'a pas de référence : elle
  reste non enregistrée jusqu'au premier Enregistrer.
- **Règle** : la carte est non enregistrée quand son **export** diffère de
  celui de la référence. L'ordre des cases et du territoire ne compte pas.
  - Comptent : unités (pose, suppression, déplacement, camp), décors
    (position, rotation), cases, Taille, territoire, Baliste.
  - Ne comptent pas : sélection, caméra, recherche, catégories ouvertes,
    outil actif, panneaux repliés, valeur tapée dans Taille sans Appliquer,
    « Tester le scénario ».
- **Annuler / rétablir** : revenir exactement à la référence rend la carte
  « enregistrée » ; rétablir une modification la rend de nouveau non
  enregistrée.
- **Indicateur** : « • non enregistré » après le nom, dans la barre du haut.
- **Confirmations** (dialogue natif du navigateur) avant de perdre des
  modifications : **Retour au menu**, **Charger une carte**, **Nouvelle
  carte**. Sans modification, aucune confirmation.
- **Fermeture ou rechargement de l'onglet** : le navigateur affiche son
  avertissement standard si la carte n'est pas enregistrée, dans l'éditeur
  comme pendant un test.
- **Limite** : la carte est marquée enregistrée dès que le téléchargement
  est lancé ; l'éditeur ne peut pas savoir si le fichier a vraiment été
  conservé.

**Vue pratique du format `MapDef`**

Ce résumé n'est pas une spécification exhaustive. Le format complet est
défini dans `config/mapDef.ts`, `config/territory.ts` et
`config/constants.ts` (`ObstacleDef`) ; voir aussi `ARCHITECTURE.md`.

| Champ | Contenu |
|---|---|
| `name`, `version` | Nom (sert de nom de fichier) et version (`1`) |
| `width`, `height` | Taille de référence du plateau |
| `cells` | Liste des cases présentes, avec leur type de terrain. Optionnel : absent = rectangle plein d'herbe |
| `obstacles` | Décors : `kind` (rocher, arbre, prop, bâtiment), modèle, emprise `tilesX` × `tilesZ`, position `x` / `z` (ou ancien coin `cornerX` / `cornerZ`), `rotationY` optionnel |
| `playerUnits`, `enemyUnits` | Unités du scénario de test : `unitId`, `x`, `z` |
| `ballista` | Centre de la Baliste : `{ x, z }`. Optionnel : absent = repli historique (coin +X +Z) |
| `territory` | Territoire : liste de `{ x, z, team }`, `team` valant `'player'` ou `'enemy'`, dans la convention de `cells` (coin entier de la case). Optionnel : absent = repli historique ; `[]` = territoire vide |

- **Camp des unités** : ce n'est pas un champ. Il est porté par la liste
  (`playerUnits` ou `enemyUnits`) dans laquelle l'unité est enregistrée.
- **`ballista`** : écrit **seulement** si la position a été définie
  explicitement (déplacée dans l'éditeur, ou déjà présente dans la carte
  chargée). Au chargement, il n'est conservé que si `x` et `z` sont des
  nombres finis.
- **`territory`** : écrit **seulement** s'il est explicite (même vide). Au
  chargement, il est conservé s'il s'agit d'un tableau ; les entrées mal
  formées (coordonnées non entières, camp inconnu) sont ignorées avec un
  avertissement en console.
- **Non enregistrés** : les identifiants internes de l'éditeur.
- **Compatibilité** : les anciennes cartes, sans `cells`, avec des coins de
  grille, sans `ballista` ou sans `territory`, se chargent toujours. Rouvertes
  puis réenregistrées sans toucher à la Baliste ni au territoire, elles
  restent **sans** ces champs.

## 15. Tester le scénario

- **Ce que fait le test** : il lance une **vraie bataille** sur la carte en
  cours d'édition, avec ses unités (`playerUnits`, `enemyUnits`) et les
  mêmes règles qu'en partie. Aucune confirmation n'est demandée.
- **Baliste** : une **vraie** Baliste est créée, comme en partie. C'est un
  bâtiment de simulation avec ses PV (de base : le test n'applique aucune
  amélioration de Forge), sa collision et sa destruction : HUD
  `[Q] BALISTE — DÉTRUITE`, tir Q bloqué, collision libérée.
  - **Position** : celle de la carte (`ballista`), sinon le repli historique.
    Le modèle, l'origine des tirs, le bâtiment et sa collision sont tous à
    cette position.
  - Elle compte pour la survie du camp joueur.
- **Retour à l'éditeur** : automatique dès qu'un camp n'a plus de combattant,
  ou avec **Échap**. Le brouillon est retrouvé intact : panneaux, cadrage,
  sélection et état non enregistré inchangés. Le test ne devient jamais la
  référence « enregistrée ». La tour réapparaît à sa position d'édition,
  même si elle a été détruite.
- **Ce que le test ne fait pas** :
  - il n'utilise ni l'or, ni l'armée, ni les bâtiments d'une run ;
  - il n'accorde aucune récompense de méta-progression ;
  - il ne crée **ni Mine ni Caserne**, voir **KI-07**.

## 16. Structures décoratives, bâtiments gameplay et Baliste

- **Structures décoratives** (catégorie du catalogue, bâtiments KayKit
  bleus, rouges et neutres) : ce sont de **simples obstacles**. Ils bloquent
  le passage et la ligne de tir, mais ne peuvent être ni ciblés, ni détruits,
  ni produire quoi que ce soit. Leur teinte est purement visuelle.
- **Mine, Caserne et Forge** (bâtiments gameplay) : elles n'existent qu'en
  partie, achetées et posées par le joueur. On ne peut pas les placer depuis
  l'éditeur.

**La Baliste**

La tour de la Baliste est toujours présente dans l'éditeur, appartient au
joueur, et sa position fait partie de la carte (`ballista`, §14).

- **Position par défaut** : une carte sans `ballista` affiche la Baliste au
  repli historique (coin +X +Z). Tant qu'elle n'a pas été déplacée, elle suit
  ce coin si la taille du plateau change.
- **Sélection** : clic gauche sur la tour. Elle est entourée d'un anneau
  bleu, la couleur du joueur.
- **Déplacement** : Baliste sélectionnée, puis clic au sol, pris en compte
  dès l'appui (un glisser ne trace pas de rectangle d'unités). Le centre est
  calé sur une **grille de 3×3 cases**.
- **Déplacement refusé** (rien ne change, la Baliste reste sélectionnée) si :
  - l'empreinte de placement de **3×3 cases** n'est pas **entièrement en
    territoire joueur** ;
  - dans l'empreinte réelle de la tour (carré de 2,4 cases, la collision de
    bataille), une case manque (bord du plateau ou trou), un obstacle
    bloquant chevauche (un simple contact de bord est accepté) ou le centre
    d'une unité se trouve.
- **Gardes** : aucune unité ne peut être posée ni déplacée dans son
  empreinte, et aucune case sous elle ne peut être supprimée. Les décors en
  placement libre peuvent encore la chevaucher.
- **Suppr et R** : sans effet sur elle.
- **Annuler / rétablir** : chaque déplacement est annulable ; Ctrl+Z et
  Ctrl+Y restaurent la position **et** le statut « position définie ». Une
  carte ramenée au repli ne réécrit donc pas le champ.
- **Baliste hors territoire** : une Baliste chargée (ou au repli) hors du
  territoire joueur est **conservée** pour compatibilité. Elle n'est jamais
  déplacée automatiquement à cause du territoire ; seul un nouveau
  déplacement doit respecter la règle.
- **Position invalide dans un fichier** (bord du plateau, trou, obstacle ou
  unité) : elle est remplacée par la position valide la plus proche sur la
  grille, avec un avertissement en console. Si aucune n'existe, elle est
  conservée avec un avertissement. Le repli d'une carte sans champ n'est
  jamais déplacé automatiquement.
- **Position initiale en partie** : cette position est la position de départ
  de la Baliste pour un mode qui utilise la carte. Le Mode survie crée sa
  Baliste à la position de son arène, (0.5, 13.5), sans placement par le
  joueur ; une carte enregistrée depuis l'éditeur n'est pas encore jouable
  en run.

## 17. Cartes à trous

- Supprimer des cases crée des trous dans la carte.
- **En bataille** (y compris « Tester le scénario »), un trou bloque comme un
  obstacle.
- **Dans l'éditeur**, une unité ne peut pas être posée ni déplacée hors d'une
  case existante, la Baliste ne peut pas être déplacée au-dessus d'un trou, et
  un trou n'a pas de territoire.
- Le placement du jeu réel ne teste pas directement les cases (**KI-02**).

## 18. Limitations connues

Détaillées dans `KNOWN_ISSUES.md` :

- **KI-07** : « Tester le scénario » ne crée ni Mine ni Caserne.
- **KI-02** : le placement en jeu ne teste pas directement les cases.
- **KI-20** : certaines règles ne testent que la **case centrale** d'un
  obstacle (suppression d'une case, pose et déplacement d'unités).
- **KI-24** : après un clic, un bouton garde le focus ; Espace peut alors le
  réactiver en plus de réinitialiser la caméra.

Limitations de l'éditeur, sans entrée dans `KNOWN_ISSUES.md` :

- **Nom de carte** non modifiable dans l'interface (§1).
- **Taille** : réduire ne supprime rien (§3).
- **Ctrl+molette** : une entrée d'historique par cran, donc plusieurs Ctrl+Z
  pour annuler une rotation faite en plusieurs crans.
- **Priorité de clic** : un petit décor traversable devant une unité ou sur
  le sol peut capter le clic (§7).
- **Territoire et expansion** : en run, l'agrandissement A/B/C transforme le
  territoire dessiné de l'arène (`CURRENT_STATE.md` §11) ; il n'y a pas
  encore de territoire propre à la run, et l'étape C rend la bordure neutre
  asymétrique (KI-25).
- **Aperçu de déplacement** : une silhouette rouge peut s'afficher hors du
  plateau, à la case visée ; l'outil de pose d'unité garde son propre
  fantôme.

## 19. Pour les développeurs

| Fichier | Rôle |
|---|---|
| `config/territory.ts` | Territoire pur : `TerritoryCell`, index (`buildTerritoryIndex`), repli (`resolveMapTerritory`, `deriveLegacyTerritory`), requêtes de case et d'empreinte |
| `config/mapDef.ts` | Format `MapDef` (dont `territory?`) ; `resolveBallistaOrigin`, `snapBallistaOrigin` (grille de 3×3) |
| `editor/editorState.ts` | État de l'éditeur et règles de validité (`canPlaceUnitAt`, `canAddCell`, `canRemoveCell`, `canPlaceBallistaAt`, `canMoveBallistaTo`) ; territoire (`territory`, `resolvedTerritory`, `territoryOwnerAt` avec index en cache, `paintTerritoryCell`) ; sélection et déplacement d'unités (`moveUnits`, `setUnitStates`) ; instantanés pour l'historique (`objectsSnapshot`, `mapShapeSnapshot`, `territorySnapshot`) ; Baliste (`ballista`, `ballistaExplicit`, `moveBallista`) |
| `editor/editorScene.ts` | Meshes, fantômes des outils de pose, aperçus de cases, anneau de sélection des décors et de la Baliste |
| `editor/editorUI.ts` | Barre du haut, colonne de gauche (outils, catalogue `DECOR_CATALOG`, recherche), panneau de propriétés, ligne d'état, panneaux repliables, mesure de l'espace libre (`getViewportInsets`) |
| `editor/history.ts` | Pile de commandes annuler / rétablir |
| `editor/mapSerializer.ts` | Export et import JSON (`territory` et `ballista` écrits seulement s'ils sont explicites) |
| `render/board.ts` | Zones de territoire rendues case par case (`createZonesGroup`), partagées avec le jeu |
| `render/renderer.ts` | Caméra ; cadrage dans une zone partielle (`setViewportInsets`, `frameBox`) et sauvegarde de la vue |
| `core/gridGroupMove.ts` | Calcul pur du déplacement d'unités sur la grille, partagé avec la préparation |
| `main.ts` | Orchestration : `enterEditor`, `exitEditor`, clics et sélection, déplacement, rotation, `TransformControls`, historique (`pushEditorObjectsCommand`, `pushObstacleRotationCommand`, traits de territoire), état non enregistré (`editorCleanExport`, `isEditorDirty`, `confirmDiscardEditorDraft`), cadrage (`updateEditorViewport`, `frameEditorMap`), `testScenario` |

Conventions actuelles :

- **Meshes réutilisés** : les meshes sont conservés par id, y compris après
  une suppression annulée. Le mesh d'un décor est reconstruit après un
  déplacement au gizmo (et son annulation), pour montrer l'aspect lié à sa
  nouvelle position ; celui d'une unité, seulement quand son camp change.
- **Règle de validité unique** : l'aperçu vert/rouge et le clic utilisent la
  même fonction de validité. Pour un déplacement d'unités, l'aperçu et le
  clic passent aussi par le même plan (`core/gridGroupMove.ts`).
- **Camp des unités** : toujours `territoryOwnerAt`, à la pose et au
  déplacement ; jamais recalculé ailleurs.
- **Historique** : une commande par **geste** (au relâchement, par cran de
  molette ou par trait de pinceau), jamais une par image.
- **Source de vérité de la rotation** : `rotationY`, dans l'état de l'éditeur
  et dans le fichier enregistré ; sans `rotationY`, l'orientation vient de
  la graine d'aspect (`obstacleAppearanceSeed`, `config/constants.ts`).
- **Ajouter un décor au catalogue** : une entrée dans le tableau d'assets
  correspondant d'`editor/editorUI.ts` (rangé dans une catégorie de
  `DECOR_CATALOG`), et le modèle dans `render/assetLibrary.ts`.

## 20. Récapitulatif des contrôles

Les raccourcis clavier sont **ignorés pendant la saisie dans un champ**
(recherche, Taille, Paramètres). Seul Échap fait sortir du champ.

**Souris**

| Geste | Effet |
|---|---|
| Clic gauche sur un décor / une unité / la Baliste | Sélectionner |
| Maj + clic sur une unité | Ajouter ou retirer de la sélection |
| Glisser depuis le sol ou une unité | Rectangle de sélection d'unités (des deux camps), sauf Baliste sélectionnée |
| Double-clic sur une unité | Sélectionner les unités visibles du même type et du même camp |
| Survol du terrain (unités sélectionnées) | Aperçu du déplacement |
| Clic gauche au sol (unités sélectionnées) | Déplacer selon l'aperçu |
| Clic gauche au sol (Baliste sélectionnée) | Déplacer la Baliste (3×3 en territoire joueur), dès l'appui |
| Clic gauche (outil de pose actif) | Poser l'unité ou le décor |
| Clic gauche (outil de case actif) | Ajouter ou supprimer une case |
| Clic ou glisser (outil Territoire actif) | Peindre les cases |
| Glisser une flèche du gizmo | Déplacer le décor |
| Glisser l'anneau jaune | Tourner le décor |
| Clic droit seul | Annuler l'outil actif, sinon désélectionner |
| Maj + clic droit maintenu + glisser | Pivoter / incliner la caméra |
| Clic gauche + clic droit maintenus + glisser | Déplacer la caméra |
| Molette | Zoom |
| Ctrl + molette | Tourner le décor de ±15° |
| Ctrl + Maj + molette | Tourner le décor de ±1° |
| Chevron d'un panneau | Replier / déplier le panneau |

**Clavier**

| Touche | Effet |
|---|---|
| V | Outil Sélection |
| 1 / 2 / 3 | Territoire Joueur / Ennemi / Neutre (outil Territoire actif) |
| R | +90° au décor sélectionné (sans effet sur la Baliste) |
| Suppr / Retour arrière | Supprimer la sélection (sans effet sur la Baliste) |
| Échap | Revenir à l'outil Sélection, sinon désélectionner ; pendant un test, revenir à l'éditeur |
| Ctrl+Z | Annuler |
| Ctrl+Y / Ctrl+Maj+Z | Rétablir |
| ← → / ↑ ↓ | Pivoter / incliner la caméra |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser l'angle et recadrer la carte |
| X | Vitesse ×2 (utile pendant un test) |
