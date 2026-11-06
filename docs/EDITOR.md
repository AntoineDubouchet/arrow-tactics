# Éditeur de maps

Ce document décrit l'éditeur de maps d'Arrow Tactics **tel qu'il fonctionne
aujourd'hui**, d'après le code de la branche `reprise-2026`. En cas d'écart,
le code fait foi.

Pour l'organisation technique générale, voir `ARCHITECTURE.md` ; pour les bugs
et limitations, `KNOWN_ISSUES.md`. L'Éditeur d'items est un outil distinct :
`CURRENT_STATE.md` §16 ter (effets déclenchés depuis G47).

**Grille et placement libre** (2026-11-06, G48) : l'éditeur et le générateur gardent
leur grille. Le placement continu, avec empreinte tournée, ne concerne que les bâtiments
construits pendant la partie et ceux du camp de départ en vraie run. Un bâtiment de
carte posé ici garde son emprise alignée, sa rotation reste visuelle, y compris dans
« Tester le scénario », où le camp de départ est aussi rendu ainsi.

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
1 bis. Carte procédurale, vue globale, éléments de Survie
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
  sur une **carte vierge** (ci-dessous ; depuis le 2026-11-02, plus sur
  l'arène historique). L'historique est vide et la carte est considérée
  comme enregistrée (§14) : pas d'indicateur « non enregistré » à
  l'ouverture.
- **Quitter** : **« ← Retour au menu »**. Si la carte a des modifications
  non enregistrées, une confirmation est demandée (§14).
- **Nouvelle carte** (barre du haut) : remplace le brouillon par une carte
  **réellement vierge** (2026-11-04, même carte qu'à l'ouverture), après
  confirmation si le brouillon n'est pas enregistré :
  - disque de 96 × 96 cases d'herbe plate (même emprise que la carte
    procédurale), sans eau ni relief ;
  - aucun obstacle, aucune unité, aucun camp, territoire explicitement
    vide ;
  - **aucun Départ Survie** : la Baliste n'est plus imposée au centre ; il
    se pose avec l'outil **Départ Survie** (§1 bis) et « Tester le
    scénario » le refuse tant qu'il manque (§15) ;
  - règles de la Survie Hero RTS (`survivalRules: 'hero-rts'`) ;
  - `version: 1`, nom « Nouvelle carte (96 × 96) » ;
  - historique vide, carte **non enregistrée** jusqu'au premier Enregistrer.
- **Nom de la carte** : il n'est pas modifiable dans l'interface. Une
  nouvelle carte s'enregistre donc sous le nom « Nouvelle carte ».
- **Indépendance** : l'éditeur affiche son propre plateau. La partie réelle
  n'est pas modifiée par ce qui se passe dans l'éditeur, et la caméra du jeu
  est restaurée en sortant (§13).

## 1 bis. Carte procédurale, vue globale, éléments de Survie (2026-11-03)

**Trois façons de faire une carte** (aucune n'est encore « la » carte de la
Survie : l'éditeur sert à comparer et à décider, `DESIGN_DECISIONS.md` G27) :

- **dessinée (authored)** : **Nouvelle carte** (carte vierge), puis outils ;
- **procédurale** : champ **Graine**, bouton **Générer** (ou **Nouvelle
  graine**, qui tire une graine au hasard et génère) ;
- **hybride** : générer, retoucher avec les outils habituels, **Enregistrer**.

**Générer** : demande confirmation si le brouillon n'est pas enregistré,
puis remplace la carte éditée par celle du **vrai générateur de la Survie**
(`generateSurvivalMap`, aucune copie de l'algorithme) : même graine = même
carte qu'en jeu (vérifié par test, à l'ordre des listes près). Tout ce que
produit le générateur arrive dans l'éditeur : cases (disque 96 × 96), eau,
relief et rampes, sols, forêts, gisements de pierre et d'or, décors, petits
tas, camps (leur décor est fait de décors ordinaires), barils, territoire,
position de la Baliste. La carte générée est une **MapDef ordinaire** :
sélection, suppression, ajout, outils de terrain, enregistrement, « Tester
le scénario » fonctionnent comme sur une carte dessinée. **Historique remis
à zéro** : la génération est un nouveau point de départ (Ctrl+Z ne revient
pas à la carte précédente). Générations successives : rien ne reste de la
carte précédente (maillages, marqueurs, sélection, historique).

**Ce qui est dans la carte, ce qui ne l'est pas** : la carte décrit le
**monde** (terrain, décors, ressources, camps, barils, position de la
Baliste, territoire, `survivalRules`). Le Héros, les vagues, les minuteurs,
le brouillard et l'or de départ **ne sont pas** dans la carte : ils naissent
au lancement d'une partie. La graine est gardée comme métadonnée
(`generator.seed`) ; la carte enregistrée contient son **état concret**,
jamais une simple graine à régénérer.

**Panneau d'informations** (haut de la vue, **toujours affiché** depuis le
2026-11-04) : graine (— sans générateur) et Départ Survie (position ou
« absent »), arbres, gisements de pierre et d'or, petits tas (bois,
pierre), barils (ceux des camps compris), camps (petits, grands, plage de
niveaux), cases surélevées et rampes. Il reflète **l'état en cours
d'édition** (ajout, suppression, déplacement, génération, chargement),
jamais une statistique figée de la graine. Dessous, la **validation de
Survie** : **erreurs** en rouge (aucun Départ Survie ; Départ invalide ;
camp invalide, avec la raison) qui bloquent « Tester le scénario », et
**avertissements** en orange (aucun camp, aucune ressource, aucune
palissade, celle du camp de départ comptant) qui ne bloquent rien.

**Vue globale** (bouton de la barre du haut, même cadrage qu'Espace) : la
caméra cadre la carte entière dans l'espace libre de l'écran, calculé
depuis l'emprise réelle des cases et la taille de la fenêtre (vérifié en
1600 × 900 et 1280 × 720) ; la molette rezoome ensuite normalement (zoom
linéaire : depuis la vue globale, plusieurs crans sont nécessaires).
L'éditeur n'a jamais de brouillard de guerre : toute la carte est visible
(la Survie garde le sien).

**Éléments de Survie** (Départ Survie, camps, petits tas, barils), groupe
**Survie** du catalogue (2026-11-04, `DESIGN_DECISIONS.md` G34) :

- **Départ Survie** : la position de la **Baliste principale** et, depuis
  le 2026-11-04, le **camp de départ préconstruit** qui l'entoure (preset
  `basic-camp` : deux Maisons A et B, Auberge, enceinte **arrondie** de
  Palissade V2 (dodécagone de rayon 15 cases, 36 pièces, depuis le
  2026-11-05 ; 10,5 et 25 avant) avec quatre portes
  ouvertes, une par côté (G48), Héros et deux Villageois dans la cour). Un seul par carte : l'outil pose la Baliste au clic (emprise 3 × 3
  calée sur la grille) et **remplace** l'ancien départ ; l'outil revient à
  Sélection, départ sélectionné. Depuis G50, le Départ est le centre du camp, sous l'**Hôtel de ville**, et
  la Baliste suit à sa place dans le noyau (cliquer sur l'un ou l'autre sélectionne le Départ). L'**aperçu** montre la Baliste, l'**emprise
  réservée** du camp (disque : enceinte + 2 cases, rayon 17, vert /
  rouge) et l'enceinte. Le
  camp dérivé est **affiché** sous le marqueur (bâtiments, palissade, 4 portes,
  Héros, Villageois et, depuis le 2026-11-05, les **deux gisements
  garantis** — pierre et or — et le **bosquet garanti** de sept arbres,
  qui suivent le Départ et ne sont jamais
  enregistrés dans la carte : des rochers et des arbres dérivés, pas des
  objets de l'éditeur ; leurs cases comptent comme occupées dans la
  validation du Départ) avec le contour bleu de son emprise (rayon 17 ; un
  camp neutre doit être à 21 cases au moins du Départ). Validation :
  avertissement « Aucun gisement d'or visible hors de l'enceinte au
  départ » si aucun gisement d'or n'est à la fois hors de l'enceinte et
  dans la vision initiale de la Baliste (le générateur en garantit un) ;
  un clic sur
  n'importe laquelle de ses pièces sélectionne le Départ. Départ déjà
  sélectionné, un clic sur le camp (hors Baliste) le déplace à cet endroit,
  même de deux cases. La porte s'ouvre
  du côté le plus dégagé, recalculé à chaque pose ou déplacement (Ctrl+Z
  rend aussi l'ancienne orientation). Refus : cases manquantes, eau, relief,
  obstacle ou gisement, bâtiment ou unité sous la Baliste ; dans toute
  l'emprise du camp : hors carte, eau, relief, arbre ou gisement, objet
  bloquant, bâtiment, palissade, camp neutre ; unité posée sous une Maison,
  l'Auberge ou la palissade du camp (ailleurs dans l'emprise, une unité
  reste permise) ; camp à moins de 17 cases. Le territoire joueur n'est plus exigé. Sans Départ Survie, aucune
  Baliste ni camp n'est affiché. Une carte enregistrée n'écrit que le Départ
  (`ballista`) et le preset avec sa rotation (`startingBase`) : bâtiments,
  murs et unités du camp ne sont jamais écrits.
- **Petit camp**, **Grand camp** (un par type de `data/camps.ts`, mêmes
  rosters qu'en jeu : 4 et 6 gardes) : un camp est **un seul objet** (type,
  centre, niveau, orientation). Coffre, postes de garde, feu, tente,
  bannières, caisses, râtelier et barils sont **dérivés** et affichés
  dans l'éditeur ; ils suivent le camp, se suppriment et s'annulent avec
  lui, et ne sont jamais écrits dans la carte. Pose : clic sur le centre
  voulu (centre de case), aperçu de la clairière (3,5 cases) vert / rouge.
  Refus : hors carte, eau, relief (falaise ou pente), bâtiment, palissade,
  Départ Survie, unité, arbre, gros gisement ou obstacle dans la
  clairière ; clairière qui touche l'emprise du camp de départ ; autre camp
  à moins de 10 cases ; Départ Survie à moins de 17 cases ; abords fermés (moins de 12 cases libres dans la couronne de 2
  cases : zone manifestement inaccessible). Un décor traversable posé à la
  main dans la clairière ne gêne pas et **reste** après la suppression du
  camp. Niveau 1 par défaut, modifiable dans la fiche (§12) ; les gardes
  prennent le niveau du camp. Dos du camp tourné à l'opposé du Départ
  Survie (sinon de l'origine).
- **Tas de bois (5)**, **Tas de pierre (5)**, **Baril** : pose continue sur
  la case visée, hors eau, une par case ; un baril posé ici est
  **indépendant** (il ne suit aucun camp).

Clic sur un élément (ou sur n'importe quelle partie d'un camp : garde,
coffre, tente, feu, baril, bannière…) : sélection (jaune) ; **clic au sol** :
déplacement (§8) ; **Suppr** : suppression (§10) ; Ctrl+Z rétablit. Les
camps du **générateur** sont les mêmes objets : sélectionnables,
déplaçables, supprimables, niveau modifiable.

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
    diagonale comprise — porte un bâtiment, un mur (palissade), la
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
- **Case occupée** (bâtiment de scénario, case d'une ligne de mur, Baliste,
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
- **Pose sur le relief** : bâtiments et Baliste exigent une emprise
  **plate à un seul niveau** (aperçu rouge sinon) ; une palissade suit le
  relief mais son aperçu devient rouge si elle franchit une falaise. Un obstacle / structure de plus d'une
  case exige aussi une emprise plate. Un décor se pose partout, quelle que
  soit sa taille : il suit la hauteur sous son point d'ancrage, sans
  inclinaison. Les unités se posent sur toute case, pente comprise.
- Le pointage vise la surface **visible** : sur un plateau, le curseur
  désigne la case du plateau ; en visant la face d'une falaise, la case du
  haut.

**Outils explicites d'une case** (restaurés le 2026-11-01, en complément des
pinceaux) : **Monter une case** (clic : la case devient un plat un niveau
plus haut ; une pente devient le plat de son sommet), **Descendre une case**
(un niveau plus bas ; une pente devient le plat de son pied), **Pente**
(glisser dans le sens de la montée ; un simple clic oriente la pente vers la
seule voisine plus haute, sinon refus « orientation ambiguë »). Même modèle
de cases et même champ logique que la sculpture, même verrou (case
occupée), niveaux 0 à 3, **sans autotuilage** (une case montée seule fait
une marche avec falaises). Aperçu vert / rouge de la case visée, refus dans
la ligne d'état ; une entrée d'historique par geste ; enregistré comme le
reste du relief.

**Surface**

Le groupe « Surface » habille le **dessus** des cases avec une texture de
sol. C'est **purement visuel** : une surface ne change ni la hauteur, ni la
pente, ni les coins, ni les collisions, ni les trajets, ni le territoire, ni
les règles de pose. **Exception : l'eau** (2026-11-01, ci-dessous), seule
surface lue par la simulation.

- **Outil** : « Peindre la surface », puis une vignette :
  - **Par défaut** : efface la peinture ; la case reprend la surface par
    défaut du jeu (l'herbe ou la terre d'origine selon son type) ;
  - **Herbe** : Classique, Prairie, Dense, Stylisée, Pixel touffes, Pixel
    nette ;
  - **Terre** : Terre battue ;
  - **Mixte** : Taches, Usée ;
  - **Pierre et sable** : Pavés, Sable, Roche (2026-10-31) ;
  - **Volcanique** : Volcan, Lave (2026-10-31) ;
  - **Eau** : toutes les variantes d'eau (aujourd'hui une seule, « Eau »).
    Une case d'eau est **infranchissable** pour les unités (trajets,
    destination d'un ordre, contournement par l'IA), **interdite à la pose**
    (unité, bâtiment, mur, Baliste) et **transparente aux tirs** ;
  - **Expérimental** : Terre strates, dessinée pour les flancs. Sur le dessus
    d'une case, elle forme des rayures (infobulle).
  - Rendu `?groundLook=living` (direction retenue), `rich` et `organic` : palette
    simplifiée, Par défaut puis Herbe, Herbe dense, Prairie claire, Terre
    battue, Pavés, Sable, Sol rocheux, Sol volcanique, Lave, puis une
    section **Eau** (toutes les variantes d'eau). La lave est animée mais ne
    bloque rien ; l'eau bloque comme ci-dessus (infobulles). Les
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
- **Objets** : la peinture passe sous les décors, bâtiments, murs, la
  Baliste et les unités, sans être refusée ni rien déplacer. On peut donc
  peindre une cour en terre sous et autour d'une Caserne. **Sauf l'eau** :
  elle n'est jamais peinte sous une unité, un bâtiment, une structure
  bloquante ou la Baliste (même règle que le verrou du relief) ; ces cases
  sont ignorées, le trait continue.
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
  sens, avec une lisière), `melange` (plus de petits îlots) et `organic`
  (mêmes frontières que `lisiere`, transition douce selon le couple de
  matières), avec ou sans `&surfaceBorder=subtile|marquee` (bordure de
  contact plus sombre ou plus claire selon la matière) ; la case peinte
  reste celle qui est enregistrée.
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
- **Bestiaire** (2026-11-01) : deux sections.
  - **Humains** : les unités du jeu, posables comme ci-dessus.
  - **Neutres** (repliée, `UnitDef.neutral`) : Maraudeur, Ravageur,
    Traqueur, Féticheur, Colosse — les cinq modèles barbares Toon RTS, noms
    **provisoires** — et le **Razzieur** (cavalerie légère barbare, unité
    propre et non un habillage : rôle « unité propre »). Côté **Humains**, le
    **Cavalier léger** ; le Héros n'est pas posable (il vient de la run). Chaque carte montre une vignette du modèle, le camp et
    le rôle ; sa « Fiche » donne l'apparence et les stats (celles du rôle
    habillé : Homme d'armes, Vengeur, Archer, Mage, Sentinelle),
    **provisoires**. Une carte choisit l'outil de pose : une unité neutre est
    **toujours du camp Neutre** (côté adverse), quel que soit le territoire,
    posable en territoire ennemi ou neutre, jamais en territoire joueur.
    Sans les modèles (assets hors Git), vignette grisée et modèle humain du
    rôle en jeu.

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
| Arbres et rochers | Rochers, arbres ; « Gisement de pierre (2×2 / 3×3) » et « Gisement d’or (2×2) » (2026-11-03 : bloquants, Rocher E ; pas de bâtiment posable dessus) |
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
- **Taille des arbres** (2026-11-01) : tous les arbres sont affichés
  **×1,4** (arbres Kenney, arbres isolés KayKit, bosquets ; pas les
  souches), en plus de la petite variation de hauteur propre à chaque arbre.
  Rendu seul : emprise et collisions inchangées.

**Pinceau Forêt** (2026-11-01, groupe « Forêt » des outils)

- **Outils** : « Pinceau Forêt » (planter) et « Gomme à arbres ».
- **Réglages** (chacun active le pinceau) : **Type** (Mixte, Feuillus,
  Pins, Coniques, Palmiers : chaque type tire ses modèles dans sa liste),
  **Taille** (disque de 1, 3, 5 ou 7 cases de diamètre), **Densité**
  (Clairsemée, Moyenne, Dense). Valeurs proposées, **provisoires**.
- **Geste** : clic ou glisser ; une souris rapide ne laisse aucun trou.
  **Un trait = une seule entrée d'annulation** (Ctrl+Z retire tout le
  trait, Ctrl+Y le remet à l'identique).
- **Placement organique et déterministe** : la densité varie par zones
  (bosquets et clairières, jamais une grille) ; une case retenue reçoit un
  arbre, parfois deux (petits groupes) ; jamais au centre exact de la case,
  toujours dans la case ; rotation et taille (±10 %) propres à chaque arbre.
  Tout dérive de la case : même carte + même trait = mêmes arbres.
- **Cases ignorées** : case d'eau, case qui porte déjà un arbre (repasser
  n'empile pas), case occupée par une unité, un bâtiment, une structure
  bloquante ou la Baliste.
- **Gomme** : retire tous les arbres (décors « arbre ») des cases du disque,
  quelle que soit leur origine. La sélection + Suppr reste possible (§10).
- **Arbres posés** : des décors « arbre » ordinaires, enregistrés comme
  les autres (position, modèle, rotation, taille). Traversables dans
  l'éditeur ; en « Tester le scénario » et en jeu, la case d'un arbre
  bloque le passage des unités terrestres (2026-11-02,
  `DESIGN_DECISIONS.md` G11).
- **Coût** : seuls les nouveaux arbres sont construits ; le sol et les
  autres objets ne sont pas reconstruits.

## 7. Sélection

- **Décor ou Baliste** : un clic gauche le sélectionne, dès l'appui. Un décor
  est entouré d'un anneau doré. La Baliste (Départ Survie), qui reste un
  objet distinct des unités, est entourée d'un anneau à la couleur de son
  camp (le bleu du joueur) ; sans Départ Survie posé, il n'y a rien à
  cliquer.
- **Élément de Survie** (2026-11-04) : un clic sur son marqueur, ou sur
  n'importe quelle pièce dérivée d'un camp (garde, coffre, tente, feu,
  baril, bannière, caisse, râtelier), sélectionne **le camp logique
  entier** (ou le tas, le baril). Ces pièces passent avant les décors au
  clic.
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

- **Éléments de Survie** (2026-11-04) : élément sélectionné + **clic au
  sol** → déplacement sur le centre de la case visée, dès l'appui (comme la
  Baliste), avec aperçu au survol (clairière verte / rouge pour un camp,
  case pour un tas ou un baril). Un **camp** se déplace **d'un bloc** :
  coffre, gardes, feu, tente, bannières, caisses et barils dérivés suivent ;
  la nouvelle position est validée avec les règles de la pose (le camp
  s'ignore lui-même) ; refusée, rien ne bouge. Son orientation et son
  niveau sont conservés. Une entrée d'historique par déplacement.
- **Départ Survie (Baliste)** : clic au sol, emprise 3 × 3 calée, mêmes
  règles qu'à la pose (§1 bis : plat, hors eau, sans obstacle, loin des
  camps) ; le territoire joueur n'est plus exigé.
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
  suppriment la sélection : un décor, une unité, un groupe, un bâtiment
  de scénario, un mur, ou un **élément de Survie** (2026-11-04 : un camp
  disparaît **avec** ses gardes, son coffre, son feu, sa tente, ses
  bannières, ses caisses et ses barils dérivés ; un décor ou un baril posé
  à la main à côté reste).
- La suppression est **annulable** : Ctrl+Z restaure les objets et la
  sélection (un camp revient entier, niveau et position compris).
- **La Baliste (Départ Survie) ne se supprime pas** : Suppr est sans effet
  sur elle, tout comme R ; on la **déplace** ou on la **repose** ailleurs.

## 11. Annuler / rétablir

- **Raccourcis** : **Ctrl+Z** pour annuler, **Ctrl+Y** ou **Ctrl+Maj+Z** pour
  rétablir.
- **Opérations historisées**, une entrée par geste :
  - pose d'une unité, d'un bâtiment de scénario ou d'un décor ;
  - pose, déplacement, suppression ou changement de niveau d'un camp ;
    pose ou déplacement d'un tas, d'un baril, du Départ Survie ;
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
- **Camp** (« Petit camp » / « Grand camp », « Camp neutre (objet de
  Survie) ») : type, **niveau** (champ modifiable, entier de 1 à 99, Entrée
  ou perte du focus ; une entrée d'historique), nombre de gardes, butin
  (coffre, or du nettoyage), position, action Supprimer. Les gardes
  prennent le niveau du camp (« Tester le scénario », vraie run).
- **Tas**, **Baril** (« Survie ») : quantité (tas), position, Supprimer.
- **Départ Survie (Baliste)** (« Objectif gameplay ») : camp Joueur,
  position, rappel de la règle de placement 3 × 3. Aucune action.

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

**Camps (format, 2026-11-04)** : un camp est enregistré comme un objet
sémantique (`camps[] : { kind, x, z, level, facing, guardOverrides? }`) ;
son coffre, ses postes, son décor et ses barils ne sont **jamais** écrits
(`obstacles` et `destructibles` ne contiennent que ce qui a été posé à part).
Le Départ Survie est `ballista`, écrit seulement s'il est posé. Un fichier
plus ancien (camps avec `chest`, `guardPosts`, `radius`, décor et barils
écrits) se charge : type, centre et niveau sont repris, le décor et les
barils de la clairière de chaque camp sont retirés (le camp les dérive de
nouveau), le reste est intact ; un avertissement console le signale.
Enregistrer puis recharger ne déplace rien (vérifié : camps, Départ, décors
identiques).

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
  - **Position** : le **Départ Survie** de la carte (`ballista`). Le
    modèle, l'origine des tirs, le bâtiment et sa collision sont tous à
    cette position.
  - Elle compte pour la survie du camp joueur.
- **Validation** (2026-11-04) : une **erreur** du panneau d'informations
  (aucun Départ Survie, Départ ou camp invalide) **bloque** le test, avec
  un message qui la rappelle ; un avertissement ne bloque pas.
- **Héros** (2026-11-04) : sur une carte de Survie (`hero-rts`), le Héros
  apparaît **à côté du Départ Survie** (même formation qu'en vraie run),
  sauf si la carte le place déjà comme unité de scénario.
- **Camp de départ** (2026-11-04) : le même camp qu'en vraie run, dérivé du
  Départ (deux Maisons A et B et Auberge en bâtiments de scénario terminés,
  enceinte de 24 pièces avec la porte ouverte, deux Villageois dans la
  cour, Héros à sa place).
- **Camps** : chaque camp de la carte est créé comme en vraie partie
  (gardes au **niveau du camp**, coffre, décor et barils dérivés).
- **Retour à l'éditeur** : sur une carte de Survie, seulement par la
  **défaite** (Héros à terre et Baliste détruite, ou Baliste détruite) ou
  avec **Échap** (les gardes des camps ne comptent pas pour la fin) ; sur
  une carte historique, aussi dès qu'un camp n'a plus de combattant. Le
  brouillon est retrouvé intact : panneaux, cadrage,
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
- **Murs** (groupe **« Murs »**, juste après « Bâtiments », 2026-11-02) :
  la **Palissade V2**, mêmes règles et même code que le jeu
  (`core/wallLine.ts`, `CURRENT_STATE.md` §6 octies). Le Wall V1
  (muraille case par case, porte KayKit, tracé sur grille) est supprimé.
  - **Palissade** : premier clic = point **A** (aimanté à moins de 0,6 case
    d'une palissade existante), aperçu de la ligne A → curseur (segments
    réels, vert / rouge), second clic = point **B** ; l'outil repart pour
    une nouvelle ligne. Tout angle, sans grille. Refus : comme en jeu (hors
    carte, eau, falaise, arbre, structure bloquante, bâtiment ou Baliste
    trop proche, unité sur le tracé, croisement, chevauchement), sans coût.
    Échap / clic droit : annule le point A, puis revient à la Sélection.
    Une ligne posée = une entrée d'historique.
  - **Porte — palissade** : clic sur un segment (à moins de 0,6 case de sa
    ligne) : il devient une porte (aperçu vert sur le segment visé).
  - **Sélection** : un clic sur un mur sélectionne sa **ligne entière**
    (propriétés : longueur, segments, portes, extrémités) ; Suppr la
    retire (annulable).
  - **Enregistrement** : `MapDef.walls`, une entrée par ligne (famille,
    A, B, camp, rangs des portes), jamais les segments ; la segmentation
    est reconstruite au chargement. Posées bâties (portes fermées) en
    Survie et dans « Tester le scénario ».
  - **Ancienne carte** avec des murailles V1 : elles sont retirées au
    chargement (console : « [map] anciens murs ignorés : système de
    muraille V1 supprimé ») ; le reste de la carte se charge normalement.
  - Le relief ne se sculpte pas sous une ligne de mur (case occupée).
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

- **KI-52** : `survivalRules` et niveaux des **unités** de scénario non
  modifiables dans l'interface (camps : posables, déplaçables, niveau
  modifiable depuis le 2026-11-04).
- **KI-65** : sur certaines cartes générées, un gisement bloquant peut
  fermer un couloir et isoler une poche (le générateur relie les camps à la
  Baliste, pas chaque point intermédiaire).
- **KI-58** : les anciennes graines ne redonnent plus exactement les cartes
  d'avant la refonte des ressources.

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
- **Surfaces et agrandissement de run** : sans objet depuis le 2026-11-04,
  l'agrandissement de la carte ayant été retiré du code
  (`run/mapExpansion.ts` supprimé, `DESIGN_DECISIONS.md` G40 ; ancien
  KI-27). Les surfaces et le relief d'une carte restent tels quels toute
  la run.
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
| Clic gauche au sol (Baliste sélectionnée) | Déplacer le Départ Survie (3×3 plat, hors eau, loin des camps), dès l'appui |
| Clic sur une pièce d'un camp (garde, coffre, tente, feu, baril…) | Sélectionner le camp entier |
| Clic gauche au sol (élément de Survie sélectionné) | Déplacer le camp entier, le tas ou le baril, dès l'appui |
| Clic gauche (outil Départ Survie / Petit camp / Grand camp) | Poser le Départ (remplace l'ancien) ou le camp (aperçu vert / rouge) |
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
| R | +90° au décor sélectionné (sans effet sur la Baliste) |
| Suppr / Retour arrière | Supprimer la sélection (sans effet sur la Baliste) |
| Échap | Revenir à l'outil Sélection, sinon désélectionner ; pendant un test, revenir à l'éditeur |
| Ctrl+Z | Annuler |
| Ctrl+Y / Ctrl+Maj+Z | Rétablir |
| ← → / ↑ ↓ | Pivoter / incliner la caméra |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser l'angle et recadrer la carte |
| X | Vitesse ×2 (utile pendant un test) |
