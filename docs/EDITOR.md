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
« Tester le scénario » (§15) ; ses unités (`playerUnits`, `enemyUnits`) et
ses bâtiments de scénario (`buildings`, §16) ne définissent ni l'armée de
départ, ni les bâtiments, ni les vagues d'une run.

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
  toujours sur l'**arène officielle du Mode survie** (`SURVIVAL_ARENA_MAP`,
  « MapV2 », 21 × 36) au complet : terrain, décors, territoire, unités de
  scénario (un Fantassin de chaque camp) et Baliste. C'est une copie de travail : l'arène du jeu n'est jamais
  modifiée. L'historique est vide et la carte est considérée comme
  enregistrée (§14) : pas d'indicateur « non enregistré » à l'ouverture.
- **Quitter** : **« ← Retour au menu »**. Si la carte a des modifications
  non enregistrées, une confirmation est demandée (§14).
- **Nouvelle carte** (barre du haut) : remplace le brouillon par une carte
  vierge, après confirmation si le brouillon n'est pas enregistré :
  - 18×26 cases (dimensions de l'ancienne carte « vague1-20 »,
    `DEFAULT_MAP`), rectangle plein de cases d'herbe ;
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
  - **Surface** : outil « Peindre la surface », taille et liste des textures
    de sol (§3, « Surface ») ; l'explication (visuel uniquement) est dans
    l'infobulle de l'outil et dans la ligne d'état ;
  - **Territoire** : outil « Peindre le territoire » et valeur Joueur /
    Ennemi / Neutre (§4) ; la signification des camps est dans l'infobulle
    de l'outil ;
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
  clic droit ou le choix d'un autre outil.
- Ce sont des **pinceaux**, comme « Peindre le territoire » : un clic traite
  une case ; clic maintenu et glisser traite chaque case survolée, une seule
  fois par trait. Une case déjà présente n'est pas ajoutée deux fois.
- **Historique** : un trait complet (de l'appui au relâchement) est **une
  seule entrée** ; Ctrl+Z l'annule entièrement et Ctrl+Y le rétablit
  entièrement.
- Un aperçu vert ou rouge indique sous le curseur si l'action est possible,
  y compris pendant le glisser.
- **Ajout** : refusé si une case existe déjà à cet endroit. Une case ajoutée
  est neutre si le territoire est explicite ; avec le repli historique, les
  bandes sont recalculées sur les cases présentes (§4).
- **Suppression** : refusée si une unité occupe la case, si le **centre d'un
  décor** est dessus (décors traversables compris, pour qu'aucun ne reste
  suspendu dans le vide ; seule la case du centre compte, **KI-20**), ou si
  la case est sous l'empreinte de la Baliste (§16). Supprimer une case
  retire aussi son entrée de territoire explicite, et son relief.

**Relief**

La catégorie « Relief » ne contient que deux outils, **+1 Surélever** et
**−1 Abaisser**, et leur taille. On ne pose jamais une pente ou un coin à la
main : la sculpture les produit automatiquement.

- **Niveaux** : quatre, 0 (sol), 1, 2 et 3 ; un niveau vaut une demi-case
  de hauteur (niveau 3 : y = 1,5). Une pente ne relie jamais que deux
  niveaux voisins (N ↔ N + 1). L'infobulle des deux boutons le rappelle.
- **+1 Surélever / −1 Abaisser** : pinceaux continus. L'appui commence le
  trait, le glisser l'étend, le relâchement le termine. Le designer modifie
  des **couches** (hauteur logique de chaque case) ; plateaux, pentes
  cardinales, coins extérieurs et coins intérieurs sont produits
  automatiquement autour de la forme peinte (ligne, rectangle, L,
  diagonale, forme libre).
  - **TAILLE** : sélection **[1×1] [4×4]** sous les deux boutons, commune à
    +1 et −1. **4×4** : cœur logique 2 × 2 centré sur l'intersection la
    plus proche, transitions dans la couronne (grandes formes, sculpture
    rapide). **1×1** : la seule case sous le curseur, transitions calculées
    autour (retouches fines, rogner un coin, ajouter ou enlever une case).
    Même moteur pour les deux tailles ; on passe librement de l'une à
    l'autre.
  - **Une couche par trait** : repasser plusieurs fois sur une case pendant
    le même trait ne la monte (ou ne la descend) qu'une fois. Pour la
    couche suivante, relâcher puis repeindre (nouveau trait) : 0 → 1, puis
    1 → 2, puis 2 → 3 ; 3 → 2, puis 2 → 1, puis 1 → 0.
  - **Réversible** : −1 sur les cases d'un +1 redonne exactement le terrain
    d'avant (niveaux, pentes, coins, liaisons diagonales ; les décors
    retrouvent leur hauteur) ; +1 +1 +1 −1 −1 −1 aussi. Le terrain ne dépend que
    des couches, jamais de l'ordre des traits.
  - **Limites** : rien au-delà du niveau 3 en montant ; rien sous le
    niveau 0 en descendant (ni niveau négatif, ni trou). Ligne d'état :
    « limite atteinte » ; aucune entrée d'historique.
  - **Où vont les pentes** : une zone entourée garde son plat jusqu'à son
    bord, les pentes vont dans la zone qui l'entoure — une butte a ses
    pentes au pied, un creux sur son pourtour (fond plat). Un sommet de
    niveau 3 sur du niveau 0 reçoit trois anneaux (pente 2 → 3, puis 1 → 2,
    puis 0 → 1), sans palier entre eux ; des paliers plats apparaissent si
    l'on peint des zones de plus en plus petites (une grande à +1, une plus
    petite à +2…). Un creux de plusieurs niveaux aussi, vers l'extérieur.
  - **Bord de carte et trous** : le pinceau peut **dépasser** de la carte
    ou chevaucher un trou ; seule sa partie sur des cases de terrain est
    appliquée (rien n'est refusé pour cela). Il n'y a pas de terrain
    au-delà du bord ni dans un trou : un relief collé au bord ou à un trou
    se termine par une **face verticale** jusqu'au vide, et seules les
    transitions entre cases existantes sont créées (coins compris). Rien
    n'est jamais créé dans un trou ; il reste infranchissable.
  - Le trait vise le terrain **tel qu'il était à l'appui** : le relief qui
    monte sous le curseur ne fait pas dériver le pinceau.
  - **Dans le vide** (hors carte, au-dessus d'un trou) : le pinceau suit
    toujours le curseur, sur un plan de travail à la hauteur des cases de
    terrain voisines (sortir d'un plateau ne le fait pas sauter ; loin de la
    carte, il garde sa dernière hauteur). Une case visible au-delà d'un trou
    reste toujours atteignable. Un
    trait peut commencer hors de la carte, longer le bord à moitié dans le
    vide, contourner un coin ou traverser un trou sans être interrompu :
    seules les cases de terrain sous le pinceau changent. Pinceau
    entièrement dans le vide : rien n'est affiché ni refusé (ligne d'état
    « aucune case de terrain sous le pinceau ») ; un trait resté dans le
    vide ne modifie rien et ne crée aucune entrée d'historique.
  - Un mouvement rapide est interpolé tampon par tampon (aucun trou).
  - **Aperçu** : la surface finale de toutes les cases que le trait change,
    transitions comprises (vert), coupée au bord de la carte ; tampon refusé
    ou à la limite : son carré dans la carte en rouge ; rien dans le vide. Ligne d'état :
    « Surélever +1 (4×4) : niveau 0 → 1 », « Abaisser −1 (1×1) : niveau 2 →
    1 »… ou « plusieurs niveaux, une couche de plus chacun ».
  - **Liaison diagonale** : deux zones qui ne se toucheraient que par un
    coin sont reliées par la case entre elles (entre buttes comme entre
    creux). Cette case est en **orange** dans l'aperçu et la ligne d'état
    l'annonce (« liaison diagonale comblée : N cases »). Une case
    théorique hors de la carte ne compte pas.
  - **Refus** : un tampon est refusé (aperçu rouge, raison et case dans la
    ligne d'état) si une case dont la surface devrait changer — liaison
    diagonale comprise — porte un bâtiment, une muraille, une porte, la
    Baliste, une unité ou un obstacle / structure. Le vide (hors carte,
    trou) n'est jamais une contrainte. Un tampon refusé est simplement
    sauté : le reste du trait est conservé.
  - Seules les cases dont la surface change sont recalculées : **sculpter
    une zone ancienne la normalise** (une falaise de carte ancienne y
    devient définitivement canonique), visible dans
    l'aperçu ; jamais à distance.
  - Reprendre une carte rechargée donne le même résultat qu'une édition
    continue (les couches sont enregistrées, voir `reliefLogic`).
  - Un trait = une seule entrée d'historique (Ctrl+Z / Ctrl+Y), quel que
    soit le nombre de cases, pentes, coins et décors touchés, même le long
    de tout un bord.
- **Case occupée** (bâtiment de scénario, muraille ou porte, Baliste,
  obstacle / structure dont le centre est sur la case ou dont l'emprise la
  chevauche, unité) : son relief ne change jamais (Surélever et Abaisser
  refusés), pour ne jamais laisser un objet flotter ou
  s'enfoncer ; l'objet n'est jamais déplacé verticalement. Retirer l'objet
  d'abord.
- **Décors** : jamais un refus. Le relief se modifie sous un décor, qui
  reste en place (X/Z) et suit la nouvelle surface à son point d'ancrage
  (pente comprise, sans inclinaison), y compris en annuler / rétablir et
  au rechargement : sa hauteur n'est jamais enregistrée.
- **Falaise** : toute arête entre deux cases dont les hauteurs ne se
  raccordent pas aux deux extrémités (niveaux différents, flanc d'une pente
  contre un plat). Les unités ne la franchissent pas et ne frappent pas au
  corps à corps à travers (« Tester le scénario ») ; les tirs passent.
- **Pose sur le relief** : bâtiments, murailles, portes et Baliste exigent
  une emprise **plate à un seul niveau** (aperçu rouge sinon) ; une portion
  de muraille ne change jamais de niveau (le tracé devient rouge s'il
  franchit une falaise ou une pente). Un obstacle / structure de plus d'une
  case exige aussi une emprise plate. Un décor se pose partout, quelle que
  soit sa taille : il suit la hauteur sous son point d'ancrage, sans
  inclinaison. Les unités se posent sur toute case, pente comprise.
- Le pointage vise la surface **visible** : sur un plateau, le curseur
  désigne la case du plateau ; en visant la face d'une falaise, la case du
  haut.

**Surface**

Le groupe « Surface » habille le **dessus** des cases avec une texture de
sol. C'est **purement visuel** : une surface ne change ni la hauteur, ni la
pente, ni les coins, ni les collisions, ni les trajets, ni le territoire, ni
les règles de pose, et la simulation ne la lit jamais.

- **Outil** : « Peindre la surface », puis une vignette :
  - **Par défaut** : efface la peinture ; la case reprend la surface par
    défaut du jeu (l'herbe ou la terre d'origine selon son type) ;
  - **Herbe** : Classique, Prairie, Dense, Stylisée, Pixel touffes, Pixel
    nette ;
  - **Terre** : Terre battue ;
  - **Mixte** : Taches, Usée ;
  - **Pierre et sable** : Pavés, Sable, Roche (2026-10-31) ;
  - **Volcanique** : Volcan, Lave (2026-10-31) ;
  - **Eau** : Eau (2026-10-31) ;
  - **Expérimental** : Terre strates, dessinée pour les flancs. Sur le dessus
    d'une case, elle forme des rayures (infobulle).
  - Rendu `?groundLook=living` (direction retenue) et `rich` : palette
    simplifiée, Par défaut puis Herbe, Herbe dense, Prairie claire, Terre
    battue, Pavés, Sable, Sol rocheux, Sol volcanique, Lave, Eau. Eau et
    lave sont animées mais, comme toute surface, ne bloquent rien (leur
    infobulle le rappelle). Les
    vignettes sont calculées à la couleur rendue en jeu, sur la même texture
    pour toutes les herbes. Les autres surfaces ne sont plus proposées, mais
    une carte qui les contient se charge, se rend et s'enregistre telle
    quelle.
- **Taille** : 1×1 (détails) ou 4×4 (grandes zones), propre à Surface. Le
  carré 4×4 est centré sur l'intersection de grille la plus proche du
  curseur.
- **Geste** : clic ou glisser, comme le pinceau Relief. Un trait n'a jamais
  de trou, même si la souris va vite. Il peut commencer ou passer hors de la
  carte et au-dessus d'un trou : ces cases sont ignorées, le trait continue.
  Une case trou ne reçoit jamais de surface.
- **Objets** : la peinture passe sous les décors, bâtiments, murailles, la
  Baliste et les unités, sans être refusée ni rien déplacer. On peut donc
  peindre une cour en terre sous et autour d'une Caserne.
- **Aperçu** : un contour clair et un voile très léger sur les cases qui
  seront peintes, sans masquer la texture actuelle. La texture change dès
  l'appui.
- **Dessus seulement** : les flancs (falaises, bord de carte, bord d'un trou)
  gardent leur propre surface. Peindre de la terre sur un plateau ne change
  donc pas sa falaise. Une case peinte jusqu'au bord colore aussi la petite
  lèvre facettée qui déborde au-dessus du vide.
- **Transitions** : à la frontière de deux surfaces, la plus prioritaire
  (terre au-dessus des herbes) déborde légèrement sur sa voisine, avec un
  bord irrégulier ; les marches d'un chemin en escalier sont arrondies.
  Purement visuel : la case peinte reste celle qui est enregistrée.
  Témoin sans transition : `?surfaceBlend=hard`. En comparaison
  (2026-10-31) : `?surfaceBlend=lisiere` (frontière organique dans les deux
  sens, avec une lisière) et `melange` (plus de petits îlots) ; la case
  peinte reste celle qui est enregistrée.
- **Relief indépendant** : une surface est attachée à la case (x, z), pas à
  sa forme. Elle suit la case si on la sculpte ensuite (plat → pente →
  plateau), et on peut peindre un relief déjà sculpté. Supprimer une case
  efface sa surface ; l'annulation la restaure.
- **Annuler** : un trait complet est **une** entrée d'historique, quelle que
  soit sa longueur.
- **Enregistrement** : seules les cases peintes sont écrites
  (`surfaceCells`, §14), jamais la surface par défaut.

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
  un fantôme du modèle. La pose est **continue** : l'outil et son aperçu
  restent actifs, chaque clic valide pose une nouvelle unité ; clic droit ou
  Échap reviennent à Sélection.
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
  - dans l'empreinte de la Baliste ou d'un bâtiment de scénario (§16).

  Les déplacements d'unités appliquent les mêmes règles (§8).
- **Unités anciennes** : une unité chargée, ou laissée par un changement de
  territoire, sur une case neutre ou adverse est **conservée telle quelle**,
  avec son camp, jusqu'à ce qu'elle soit déplacée.
- **Rotation** : les unités ne se tournent pas ; les actions de rotation ne
  s'affichent que pour les décors.
- **Rôle** : ces unités forment le scénario de « Tester le scénario » (§15),
  pas l'armée d'une run.

## 6. Catalogue des décors

Rubrique **« Obstacles / structures »** (au-dessus des décors) : les seuls
objets posés qui **bloquent** — catégorie « Murailles et clôtures » (angles
de muraille décoratifs, clôtures en pierre et en bois). Ils gardent le
verrou du relief.

Rubrique **« Décors »** : tout le reste, **purement visuel et
traversable**, rangé par catégories dépliables (seule « Arbres et rochers »
est ouverte au départ) :

| Catégorie | Contenu |
|---|---|
| Arbres et rochers | Rochers, arbres |
| Végétation | Buissons et plantes, champignons |
| Fleurs | Fleurs |
| Bois | Bûches, souches |
| Accessoires | Accessoires KayKit |
| Nature | Éléments de nature KayKit |
| Relief et forêts | Collines, montagnes, bosquets |
| Militaire | Charrettes, catapulte, canon, navire, bannière |
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
  clic, avec la case sous son centre en vert ou en rouge. La pose est
  refusée si ce **centre** ne tombe pas sur une case existante (trou ou hors
  du plateau ; seul le centre compte, **KI-20**). Après la pose, l'outil
  revient à Sélection et le décor posé est sélectionné.
- **Aspect fixe** : l'aspect d'un décor (orientation s'il n'a pas de
  `rotationY`, forme d'un rocher, hauteur d'un arbre) dépend de sa position.
  Il est identique dans l'éditeur, dans « Tester le scénario », dans le Mode
  survie et d'une session à l'autre. Déplacer un décor lui donne un nouvel
  aspect, visible dès le relâchement ; une `rotationY` explicite (§9) reste
  prioritaire.
- **Collisions en bataille** : aucun décor n'a de collision (passage,
  trajets, tirs, placement) ; seuls les obstacles / structures bloquent le
  passage et la ligne de tir.
- **Structures décoratives ≠ bâtiments gameplay** : une Forge, une Mine ou
  une Caserne du catalogue n'est qu'un **décor** traversable, sans PV ni
  effet (§16).

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
  - déplacement libre sur le plan horizontal ; un déplacement qui amènerait
    le centre du décor au-dessus du vide est refusé, le décor restant à sa
    dernière position valide ;
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
  suppriment la sélection : un décor, une unité, un groupe ou un bâtiment
  de scénario.
- La suppression est **annulable** : Ctrl+Z restaure les objets et la
  sélection.
- **La Baliste ne se supprime pas** : Suppr est sans effet sur elle, tout
  comme R.

## 11. Annuler / rétablir

- **Raccourcis** : **Ctrl+Z** pour annuler, **Ctrl+Y** ou **Ctrl+Maj+Z** pour
  rétablir.
- **Opérations historisées**, une entrée par geste :
  - pose d'une unité, d'un bâtiment de scénario ou d'un décor ;
  - suppression d'un décor, d'une unité, d'un groupe ou d'un bâtiment ;
  - déplacement d'unités (une entrée pour tout le groupe, positions et
    camps) ;
  - déplacement d'un décor au gizmo ;
  - rotation à l'anneau, par Ctrl+molette (une entrée par cran), par
    −15° / +15° et par R / +90° ;
  - déplacement de la Baliste (position **et** statut « position définie »,
    §16) ;
  - trait d'ajout ou de suppression de cases (cases et territoire) ;
  - trait de peinture du territoire ;
  - trait de peinture de surface (toutes les cases du trait) ;
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
    vérifiée ; les entrées de relief invalides (`elevationCells` : niveau
    hors de 0 à 3, pente au niveau 3, direction inconnue) sont écartées.
    Une ancienne carte limitée aux niveaux 0 à 2 se charge à l'identique,
    sans migration.
- **Relief** : `elevationCells` n'est écrit que si une case n'est pas plate
  au niveau 0, trié par z puis x ; une carte plate garde exactement son
  fichier d'avant le relief.
- **Surfaces** : `surfaceCells` n'est écrit que si au moins une case est
  peinte, trié par z puis x, une entrée par case peinte. Au chargement, les
  entrées invalides (identifiant inconnu, coordonnées non entières) sont
  écartées avec un avertissement en console, et celles qui tombent sur un
  trou sont ignorées : aucune n'est réécrite.

**État non enregistré**

- **Référence** : le dernier état considéré comme enregistré, c'est-à-dire
  la carte à l'ouverture de l'éditeur, après un chargement réussi ou après
  le dernier Enregistrer. Une nouvelle carte n'a pas de référence : elle
  reste non enregistrée jusqu'au premier Enregistrer.
- **Règle** : la carte est non enregistrée quand son **export** diffère de
  celui de la référence. L'ordre des cases et du territoire ne compte pas.
  - Comptent : unités (pose, suppression, déplacement, camp), bâtiments de
    scénario (pose, suppression), décors (position, rotation), cases,
    Taille, territoire, Baliste, surfaces peintes.
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
| `surfaceCells` | Surfaces peintes : liste de `{ x, z, surface }`, `surface` étant un identifiant stable (`herbe-classique`, `terre-battue`…, `config/groundSurfaces.ts`), jamais un libellé. Optionnel et clairsemé : une case absente garde la surface par défaut. Purement visuel |

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
- **Bâtiments de scénario** (`buildings`, §16) : chacun devient un **vrai
  bâtiment** à sa position, au **niveau 1** (PV, collision, sélection, fiche
  « Nom — Niv. 1 », fonction : la Tour tire, la Caserne et le Camp
  d'archerie produisent leur unité de la manche, la Maison
  compte pour la population…). La Mine n'y produit pas d'or (le test n'a pas
  de run).
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
  - il n'accorde aucune récompense de méta-progression.

## 16. Structures décoratives, bâtiments gameplay et Baliste

- **Structures décoratives** (catégorie du catalogue, bâtiments KayKit
  bleus, rouges et neutres) : ce sont de **simples obstacles**. Ils bloquent
  le passage et la ligne de tir, mais ne peuvent être ni ciblés, ni détruits,
  ni produire quoi que ce soit. Leur teinte est purement visuelle.
- **Bâtiments de scénario** (groupe **« Bâtiments »** de la bibliothèque,
  juste après « Unités ») : Mine, Caserne, Camp d'archerie, Forge, Maison,
  Tour, Église, les vrais bâtiments gameplay (liste et emprises lues dans
  `data/buildings.ts`).
  - **Pose continue** : choisir un bâtiment, puis cliquer autant de fois que
    voulu ; l'aperçu montre son emprise réelle (2×2, 3×3…), verte ou rouge,
    et le modèle. Clic droit ou Échap reviennent à Sélection.
  - **Pose refusée** si une case de l'emprise manque (hors du plateau ou
    trou), ou si elle chevauche un autre bâtiment de scénario, la Baliste, un
    décor bloquant ou le centre d'une unité. **Aucune règle de territoire** :
    l'éditeur crée des scénarios, contrairement à la préparation du Mode
    survie.
  - Camp : **joueur** pour cette première version (le format prévoit
    `team`).
  - Sélection au clic (anneau à la couleur du camp, panneau de propriétés),
    suppression, annuler / rétablir et état non enregistré comme les autres
    objets. Aucune unité ne peut être posée dans leur emprise, ni aucune case
    supprimée dessous.
  - Enregistrés dans `MapDef.buildings` (`buildingId`, `team`, centre
    `x`, `z`), séparés des décors ; champ absent = aucun bâtiment. Le Mode
    survie ne lit pas ce champ.
  - **La Baliste n'y figure pas** : unique et toujours présente, elle garde
    son outil dédié ci-dessous et sa seule source, `ballista`.
- **Murailles** (groupe **« Murailles »**, juste après « Bâtiments » ; groupe
  lu dans `BuildingDef.editorGroup`) : Muraille (segment droit 2×1) et
  Porte de muraille, les constructions jouables du joueur.
  - **Muraille** : **tracé continu**, comme en préparation
    (`CURRENT_STATE.md` §6) — premier clic = point de départ, chaque clic
    pose une portion (axe dominant, tout ou rien), clic sur le point de
    départ (ou une case voisine alignée) = enceinte fermée. Mêmes virages
    KayKit automatiques, longueur exacte (demi-segments) et orientation
    (côté de la Baliste du brouillon tant que le tracé est ouvert) qu'en
    préparation. Échap, clic droit, changement d'outil et « Tester le
    scénario » terminent le tracé (extrémités construites, une entrée
    d'historique). Pas de règle de territoire ni d'or dans l'éditeur.
  - **Reprise** : comme en préparation (`CURRENT_STATE.md` §6), sur les
    murailles du camp joueur du brouillon, y compris après un rechargement
    (extrémités dérivées des pièces) ; chaque portion de reprise est une
    entrée d'historique normale (Ctrl+Z rend l'extrémité d'origine, même
    type et même rotation).
  - **Historique** : **une entrée par portion validée** (Ctrl+Z retire la
    dernière portion seule, Ctrl+Y la rétablit), plus une pour la
    finalisation d'un tracé ouvert. Ctrl+Z / Ctrl+Y pendant un tracé
    abandonnent d'abord la portion non construite (cases en attente
    comprises, sans les construire) ; Échap une seconde fois revient à
    l'outil Sélection.
  - **Enceinte fermée** : créneaux de toutes ses pièces vers l'extérieur
    (dans les deux sens de dessin), enregistrés dans `rotationY` (90, 180 ou
    270° possibles) ; virages `wall_corner_outside` / `wall_corner_inside`
    enregistrés par leur `buildingId`. L'entrée d'historique d'une portion
    inclut ses virages et la réorientation du tracé (Ctrl+Z retire la
    fermeture et rend l'orientation du tracé ouvert).
  - **Porte de muraille** : pose à l'unité ; **R** tourne l'outil d'un quart
    de tour (2×1 ↔ 1×2). Posée exactement sur un segment de mur, elle le
    remplace en reprenant son orientation (une seule entrée d'historique). La rotation est enregistrée
    (`rotationY` dans `MapDef.buildings`, écrite seulement si elle n'est pas
    nulle : les anciennes cartes restent identiques).
  - Dans « Tester le scénario » : vrais murs et portes (50 PV, camp de la
    carte, collision, ouverture des portes, destruction).
- **Décors du pack KayKit complet** (chargés à la demande au premier choix) :
  catégories « Relief et forêts » (buttes, collines, montagnes, bosquets),
  « Murailles et clôtures » (angles de muraille, décoratifs car pensés pour
  des hexagones ; clôtures) et « Militaire » ; nouveaux bâtiments d'équipe
  dans « Structures décoratives » et nouveaux props dans « Accessoires »
  (`ASSETS.md` §3.5).

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
  Baliste à la position de son arène, (0.5, 15.5), sans placement par le
  joueur ; une carte enregistrée depuis l'éditeur n'est pas encore jouable
  en run.

## 17. Cartes à trous

- Supprimer des cases crée des trous dans la carte.
- **En bataille** (y compris « Tester le scénario »), un trou bloque comme un
  obstacle.
- **Dans l'éditeur**, une unité ne peut pas être posée ni déplacée hors d'une
  case existante, le centre d'un décor non plus, la Baliste ne peut pas être
  déplacée au-dessus d'un trou, et un trou n'a pas de territoire.
- **Rendu** : seules les cases existantes sont dessinées ; les débris de
  bois décoratifs du plateau ne sont semés que sur des cases existantes.
- Le placement du jeu réel ne teste pas directement les cases (**KI-02**).

## 18. Limitations connues

Détaillées dans `KNOWN_ISSUES.md` :

- **KI-02** : le placement en jeu ne teste pas directement les cases.
- **KI-20** : certaines règles ne testent que la **case centrale** d'un
  obstacle (suppression d'une case, pose et déplacement d'unités, pose et
  déplacement de décors).
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
  encore de territoire propre à la run.
- **Aperçu de déplacement** : une silhouette rouge peut s'afficher hors du
  plateau, à la case visée ; l'outil de pose d'unité garde son propre
  fantôme.
- **Relief** : quatre niveaux (0 à 3), pas de niveau négatif ni de vrai
  trou creusé, pas d'escalier, de pont ni de chute ; ligne de tir et
  portées restent 2D ; pinceaux Surélever / Abaisser en deux tailles
  seulement (1×1, 4×4) ; pas de pose manuelle de pente ou de coin (une
  falaise d'ancienne carte se corrige en sculptant dessus) ; pendant un trait, le
  pinceau vise le terrain du début du trait (léger décalage visuel avec le
  curseur au-dessus des cases déjà modifiées par ce trait).
- **Surface** : la peinture reste attachée à des cases entières ; seul le
  rendu adoucit la limite (transition irrégulière, voir « Surface »). Un
  chemin 1×1 paraît donc un peu plus large que sa case (1,1 à 1,3), et les
  taches de « Mixte » restent coupées au bord de leur case. Pas de
  remplissage ni de pinceau plus grand que 4×4.
- **Surfaces et agrandissement de run** : `run/mapExpansion.ts` recopie
  `surfaceCells` sans les déplacer, comme `elevationCells`, alors que les
  cases et le territoire sont transformés. C'est sans effet aujourd'hui,
  puisque l'arène du Mode survie n'a ni relief ni surface peinte ; mesuré
  sur l'arène candidate (`islandArena.ts`) : falaises et poches isolées
  dès la vague 2 (`KNOWN_ISSUES.md` KI-27).
- **Falaises** : la carte peut en contenir (`elevationCells`), l'éditeur les
  conserve à l'enregistrement, mais ses pinceaux ne produisent que des
  pentes ; sculpter sur une falaise la remplace par des pentes.

## 19. Pour les développeurs

| Fichier | Rôle |
|---|---|
| `config/territory.ts` | Territoire pur : `TerritoryCell`, index (`buildTerritoryIndex`), repli (`resolveMapTerritory`, `deriveLegacyTerritory`), requêtes de case et d'empreinte |
| `config/mapDef.ts` | Format `MapDef` (dont `territory?`, `surfaceCells?`) ; `resolveBallistaOrigin`, `snapBallistaOrigin` (grille de 3×3) |
| `config/groundSurfaces.ts` | Surfaces peignables : `GROUND_TEXTURES` (identifiant, libellés, famille, fichier, cycle), sections de l'éditeur, `SurfaceCellDef`, `buildSurfaceIndex`, `surfaceBrushOrigin`. Source unique de l'éditeur, de la sauvegarde et du rendu |
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
| Clic ou glisser (outil de case actif) | Ajouter ou supprimer les cases survolées |
| Clic ou glisser (outil Territoire actif) | Peindre les cases |
| Clic ou glisser (outil Surface actif) | Peindre le dessus des cases avec la surface choisie (1×1 ou 4×4), ou l'effacer (Par défaut) |
| Clic ou glisser (+1 Surélever / −1 Abaisser) | Ajouter / retirer une couche de relief sous le pinceau (une par trait, taille 1×1 ou 4×4, jusqu'au bord de la carte) |
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
| R | +90° au décor sélectionné (sans effet sur la Baliste) ; outil de pose d'une muraille ou d'une porte : orientation suivante |
| Suppr / Retour arrière | Supprimer la sélection (sans effet sur la Baliste) |
| Échap | Revenir à l'outil Sélection, sinon désélectionner ; pendant un test, revenir à l'éditeur |
| Ctrl+Z | Annuler |
| Ctrl+Y / Ctrl+Maj+Z | Rétablir |
| ← → / ↑ ↓ | Pivoter / incliner la caméra |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser l'angle et recadrer la carte |
| X | Vitesse ×2 (utile pendant un test) |
