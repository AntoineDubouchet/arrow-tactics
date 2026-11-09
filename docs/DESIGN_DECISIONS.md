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
| A5 | Graphic Lab « ancrage et lumière » clos : contact map, Ground Mist liée au brouillard en soft intersection, deux sources chaudes, lumière dans la brume ; `shadow` non retenu | Active (2026-11-07, valeurs provisoires) |
| A6 | Graphic Lab « Mist Clouds » clos : nappes aériennes en espace monde dans la passe du brouillard, densité pilotée par la grille du brouillard de guerre (clair, brume forte, noir), calcul half-res, repères gameplay depth-aware, feu de camp et torches réels ; relief interne, poche centrée sur le camp et masque unités non retenus. Complément 2026-11-08 : clairière esthétique des bâtiments construits (niveau cible 0,08 sous le niveau visible ; palissades et portes exclues), feu de camp recentré sous le clocher | Active (2026-11-08) |
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
| C4 | Déblocage d'une unité en battant cet ennemi | Retirée (2026-11-05, G41) |
| D1 | Bâtiments gameplay achetés plutôt qu'accordés par un talent | Active |
| D2 | Bâtiments gameplay et bâtiments décoratifs distincts | Active |
| D3 | Placement obligatoire de la tour en début de run | Remplacée (Baliste définie par la carte) |
| D4 | Sauvegarde d'une run en cours | Ouverte |
| D5 | Or monnaie unique, Runes supprimées, améliorations achetées à la Forge | Active (Or monnaie, améliorations propres à la run) / Remplacée par G41 (niveau de production des unités, surcoût de recrutement, écran de la Forge) |
| D6 | Améliorations de la Mine et de la Caserne propres à chaque bâtiment | Active (Mine, Tour) / Remplacée par G41 pour les producteurs (niveau par type, global à la run) ; Église sans amélioration |
| D7 | Départ de run, population et bâtiments de recrutement | Active |
| D8 | Murailles du joueur (Wall V1) | Abandonnée le 2026-11-02, remplacée par G23 |
| E1 | Manipulation directe pendant le placement | Remplacée (placement retiré, G40) / Active (gestes RTS directs en jeu et dans l'éditeur) |
| E2 | Collision des décors : emprise rectangulaire, props traversables | Remplacée (décors bloquants) / Active (emprise rectangulaire des obstacles) |
| E3 | Rotation des décors dans l'éditeur | Remplacée (W/E) / Active (anneau et Ctrl+molette) |
| E4 | Agrandissement progressif de la carte | Retirée du code (2026-11-04, G40) ; runs longues toujours Ouvertes |
| E5 | Territoire par cases, couche séparée du terrain | Active (territoire de la carte) / Ouverte (territoire de run) |
| E6 | Aspect des décors fixé par leur position | Active |
| E7 | Relief 2.5D : falaises infranchissables, pentes, combat 2D | Active (prototype) / Ouverte (avantage de hauteur, ligne de vue, grande carte) |
| E8 | Décors purement visuels, traversables, adaptatifs au relief | Active / Remplacée pour les arbres (G11) |
| F1 | Intégration audio mise en pause après expérimentation | Historique / Ouverte |
| G11 | Arbres bloquants, ressources rares, vagues reliées au camp, Mine toutes les 60 s | Active (valeurs provisoires) |
| G23 | Palissade V2 : murs géométriques A → B, sans grille | Active (valeurs provisoires) |
| G24 | VFX de montée de niveau du Héros | Active (provisoire, remplaçable) |
| G25 | Or monnaie, Forge = outils, gisements bloquants | Active (valeurs provisoires) |
| G26 | Maison A/B, Sanctuaire, Écurie | Active (valeurs provisoires) |
| G27 | Éditeur : maps authored, procédurales et hybrides | Direction active (génération faite ; mode définitif Ouvert) |
| G28 | Auberge et Villageois : première unité économique | Active (valeurs provisoires ; transport rétabli par G32, modèle dédié) |
| G29 | Tourbillon du Paladin (prototype) | Active (valeurs et VFX provisoires) / Amendée par G42 (10 frappes de 35 %, lancé sans interrompre le déplacement, flash par cible) |
| G30 | Stock direct : bois et pierre comme l'or | Remplacée le jour même (G32) |
| G32 | Cargo économique : inventaire RPG ≠ sac de ressources ; or de gisement = cargo, or de butin = monnaie | Active (valeurs provisoires ; amendée par G33) |
| G33 | Points de collecte spécialisés : Scierie = bois, Camp de mineur = pierre + or extrait, Baliste universelle de départ ; inventaire RPG sans ressource (KI-63) | Active (valeurs provisoires ; rôle de la Baliste à revoir) |
| G31 | Caméra de jeu verrouillée sur le Héros | Retirée (essai d'un jour, retour à la vue RTS libre) |
| G34 | Éditeur de Survie : camp = objet sémantique authorable avec niveau, Départ Survie explicite, validation | Active (valeurs provisoires) |
| G35 | Dépôt des ressources instantané au contact du point de collecte | Active |
| G36 | Vitesse de déplacement ×1,4 pour toutes les unités mobiles (multiplicateur central) | Active (valeur provisoire) |
| G37 | Bois et pierre récoltables dès le départ ; l'or aussi depuis G41 | Active (tranchée le 2026-11-05 : or libre) |
| G38 | Départ Survie = petit camp joueur préconstruit (preset dérivé), enceinte arrondie | Active (valeurs provisoires) |
| G39 | Générateur : gisements avant la mise en forme des forêts, aucun passage d'une case (KI-65) | Active |
| G40 | Passe de modernisation 1 : retrait du legacy de la boucle en manches (placement, Boutique, parchemins, fin de manche, agrandissement, quota par manche, 4 talents), tests dans le dépôt | Active (2026-11-04) |
| G41 | Passe de modernisation 2 : Forge = technologies militaires globales, améliorations d'unité = bâtiment producteur (rétroactives), recherches en temps réel par la file, Baliste depuis sa fiche, or libre, plus de pas d'ouverture ni de déblocage par victoire, plus de soin de l'armée | Active (2026-11-05, valeurs provisoires) |
| G42 | Passe gameplay : Villageois autonomes (idle > 1 s, ressource la moins travaillée), Tourbillon compatible avec le déplacement (10 tics / 5 s, 35 %, flash par tic), or de butin ramassé au contact du Héros, Porte de palissade refaite (sans arche, deux vrais vantaux), pierre + or garantis dans le camp de départ | Active (2026-11-05, valeurs provisoires) / Amendée par G43 (sources visibles seulement, récolte au contact, quantités 75 / 250 / 250, bosquet garanti) |
| G43 | Passe corrective après l'autonomie : autonomie limitée aux ressources visibles, récolte au contact visuellement crédible, Villageois regardant sa source, animation worker descendante (plus d'estoc), arbre = 75 bois, gisements = 250 pierre / 250 or, camp de départ = bosquet garanti d'au moins 6 arbres + pierre + or | Active (2026-11-05, valeurs provisoires) |
| G44 | Passe économie : cargo Villageois 10, temps par unité par ressource (bois 2 s, pierre 2,5 s, or 3 s), Héros ×1,25 plus lent, cadence visuelle depuis les données ; Mine et coûts inchangés | Active (2026-11-05, valeurs provisoires) |
| G45 | Coûts des bâtiments et technologies recalés autour d'un cargo Villageois de 10 (Maison 10 bois sans or, économique 1 à 2 cargaisons, militaire 2 à 4, avancé 3 à 6 ; bois léger / pierre lourd / mixte militaire) ; Mine 10 bois + 5 pierre ; Palissade inchangée | Active (2026-11-05, valeurs provisoires) |
| G46 | XP du Héros à 12 cases ; camp de départ de rayon 15 ; 2 gisements d'or visibles au départ ; Villageois constructeurs ; Maj = pose répétée ; double-clic = bâtiments du même type visibles ; DamageType physique / magique (Tourbillon physique) ; banque d'items curated (2 par emplacement, niveaux, tank / physique / magique) ; fin de vague = choix entre 2 items du niveau de la vague ; +5 or de vague supprimé | Active (2026-11-05, valeurs provisoires) |
| G47 | Loot portable + slot vide = auto-équipement ; clic droit inventaire = équiper / déséquiper ; une icône par EquipmentSlot ; Héros désélectionnable, HUD RPG indépendant de la sélection RTS ; ProductionOrders affiche une barre commune à celle des actions ; bâtiment producteur + clic droit terrain = ralliement ; DamageType reste physical / magic, DamageSchool magique ; effet d'arme = toutes les N attaques réussies, K déclenchements déterministes ; Feu à chaque coup devient N = 1 / K = 1 / fire | Active (2026-11-05, valeurs provisoires) |
| G48 | Map, navigation et génération restent en grille ; placement joueur des bâtiments continu ; navigation dérivée de l'empreinte continue ; rotation par pas de 15° ; fin d'un chantier : le constructeur cherche un autre chantier allié proche ; camp de départ à 4 portes ouvertes, une par côté ; mort du Héros : VFX blanc héroïque montant vers le ciel | Active (2026-11-06, valeurs provisoires) |
| G49 | Aucune unité ne reste indéfiniment dans une boucle de navigation : point de travail verrouillé, watchdog (1,5 s, 0,2 case ; premier blocage : récupération, second : abandon), A* limité ; rejet sans recherche d'une destination sans route | Active (2026-11-06, valeurs provisoires) |
| G50 | Hôtel de ville central préconstruit, Baliste dans le noyau (défaite inchangée) ; Maison +5 ; producteurs A Z E R ; stands de récolte réservés ; Héros seul : portrait + nom ; tas / 2 | Active (2026-11-06, valeurs provisoires) / Ouverte (bâtiment principal de défaite) |
| G51 | Portes automatiques : un allié qui approche ouvre, sinon un hostile proche ferme | Active (2026-11-06, valeurs provisoires) |
| G52 | Finalisation : Baliste portée 22,6 ; surplus manuel reporté aussitôt sur une source voisine du même type ; caméra de Survie à 28 ; Hôtel de ville de trois-quarts (27°) ; portes sans boutons | Active (2026-11-06, valeurs provisoires) |
| G53 | Passe gameplay du 2026-11-08 : Hôtel de ville dépôt universel et producteur du Villageois (la Baliste n'est plus un dépôt, l'Auberge ne produit plus) ; réparation au clic droit par Héros et Villageois (`canRepair`) ; pulse jaune des ordres manuels ; défense locale des bâtiments (22 cases, jamais un ordre manuel) ; portes posées fermées, AUTO ou verrouillée fermée | Active (2026-11-08, valeurs provisoires) |
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

### A5 — Graphic Lab « ancrage et lumière » clos : rendu officiel ancré et brumeux

- **Statut** : Active (Antoine, 2026-11-07). Valeurs **PROVISOIRES**.
- **Contexte** : après le choix d'`atmospheric` (E7, Graphic Lab V2), une
  image de référence d'Antoine montrait ce qui manquait encore : des objets
  posés sur une nappe plutôt qu'ancrés, une brume qui coupait les objets
  d'un trait net, aucune poche de chaleur dans un monde froid. Un laboratoire
  en trois passes (2026-11-06 et 2026-11-07, briques activables par
  `?lab=…`) a comparé sur un même état de jeu : ombre de contact, voile par
  matériau (« soft intersection »), lumière dans la brume, feux plus
  présents, ombres adoucies, sources chaudes temporaires dans le camp.
- **Décision** (Antoine) :
  - **contact map plutôt que SSAO** : une texture en espace monde
    d'empreintes douces (arbres, rochers, props, bâtiments, pièces de
    palissade, tas), lue par les matériaux éclairés et appliquée au sol et au
    bas des objets. Raison : caméra orthographique, scène basse et lisible,
    coût fixe (une texture de 4 texels par case, re-tamponnée seulement quand
    un bâtiment ou un tas change), aucune passe plein écran, aucun bruit ni
    halo sombre autour des unités. Forces réduites en fin de lab pour rendre
    du contraste au Héros et aux Villageois près des bâtiments (arbres 0,52,
    props 0,42, rochers 0,48, bâtiments 0,48, murs 0,38, tas 0,34) : ce
    niveau est validé, **ne pas le renforcer**. **Jamais d'ombre de contact
    sur les unités** (silhouettes d'abord). Forme des empreintes revue le
    2026-11-08 (carrés sous les rochers, bandes et jonctions plus sombres sous
    la palissade : rochers, structures et pièces de mur recevaient la boîte
    englobante de leur emprise) : capsule sur le segment réel d'une pièce de
    mur, ellipse sous un rocher, rectangle à bord rentré sous un bâtiment,
    et union (maximum) entre structures au lieu d'une accumulation ; forces
    inchangées, l'ombre reste collée au socle ;
  - **faux soft intersection plutôt qu'un depth prepass** : la brume n'est pas
    un plan testé contre la profondeur mais un voile que chaque matériau
    calcule à partir de sa hauteur au-dessus du sol (hauteur du sol lue dans
    la même texture) et des mêmes nappes de bruit. Raison : aucun rendu
    supplémentaire de la scène, pas de lecture de profondeur, et un fondu qui
    suit la forme de l'objet (pieu, tronc, socle) au lieu d'une ligne. Les
    plans de brume de l'ancien prototype ne sont plus dans le chemin de
    rendu ; les **unités** ne sont voilées que sur leurs 30 premiers
    centimètres, à demi-force, pour supprimer la rupture net/voilé sans
    toucher à la lisibilité ;
  - **Ground Mist liée au brouillard de guerre** (mode `fog`, défaut) :
    discrète en zone visible (gain 0,50, monté de 0,35 en fin de lab pour se
    rapprocher de la référence dans la cour), dense et vivante en zone
    explorée hors vision, nulle dans l'inexploré ; lecture seule de la
    grille, aucune logique de visibilité modifiée ;
  - **deux sources chaudes officielles** dans le camp du joueur : devant la
    porte de l'Hôtel de ville (marches, sol et tonneau réchauffés) et sur un
    montant de la porte de palissade la plus proche du Héros (bois chaud,
    contraste « civilisation chaude / extérieur froid »). `PointLight` ambre,
    portée courte, décroissance quadratique, pas d'ombre ; la source
    temporaire devant l'**Auberge** n'est **pas** retenue pour l'instant
    (parking). Indicateur : petits cônes de flamme de la famille du feu de
    camp ; aucun asset de torche ou de lanterne créé (parking) ;
  - **lumière dans la brume** (`mistlight`) : feux des camps et sources du
    camp réchauffent et éclaircissent localement le voile ; **plafond de 4
    `MistLightSource`** envoyées au shader (les plus proches du point visé),
    conservé ;
  - **pas de bloom** : la lumière existe par le sol éclairé et le halo dans la
    brume ; aucun post-traitement ;
  - **`shadow` non retenu** : soleil −15 % / ambiance +15 % n'apportait pas
    assez une fois contact et brume présents. Les ombres directionnelles
    restent exactement celles d'avant le lab ;
  - les **feux des camps neutres** gardent leurs valeurs du 2026-11-02 : le
    réglage `lights` du lab (intensité 12, portée 9) n'a été ni validé ni
    écarté ; à revoir à l'œil si besoin.
- **Contrainte documentée** : avec 14 `PointLight` déjà dans la scène (feux
  des camps, 16 avec les deux sources), le système n'est **pas** prévu pour
  une lumière par bâtiment. Si le nombre de sources chaudes augmente, passer
  par une approximation dans le shader du sol et de la brume (fausse lumière
  par position et rayon, comme le voile le fait déjà) ou limiter aux sources
  les plus proches, plutôt que d'ajouter des `PointLight`.
- **Parking** (voir aussi `ROADMAP.md` §7) : vrais assets pour les deux
  sources chaudes (un vrai petit feu de camp devant l'Hôtel de ville, une
  vraie torche ou lanterne fixée au montant de la porte ; les cônes actuels
  sont des indicateurs provisoires) ; volumétrie lumineuse verticale (halo dans l'air au-dessus du
  sol, hors de portée d'un voile au sol) ; Auberge comme troisième source à
  réévaluer ; stratégie si le nombre de lumières augmente fortement.
- **À ne pas faire** : ne pas réintroduire les plans de brume comme rendu
  normal ; ne pas ajouter d'ombre de contact aux unités ; ne pas pousser
  `shadow` ; ne pas ajouter de bloom ; ne pas multiplier les `PointLight`.
- **Sources** : `render/contactMap.ts`, `render/groundMist.ts`,
  `render/warmLights.ts`, `render/campViews.ts`, `render/board.ts`,
  `render/unitViews.ts`, `main.ts` (`syncContactMap`, `updateFogOfWar`) ;
  `CURRENT_STATE.md` §11 (rendu officiel) et §18.

### A6 — Graphic Lab « Mist Clouds » clos : nappes aériennes half-res pilotées par le brouillard, repères depth-aware, feu et torches

- **Statut** : Active (Antoine, 2026-11-08).
- **Contexte** : après A5, l'image manquait encore de grandes masses
  aériennes, de profondeur et d'environnement autour du village : la Ground
  Mist reste un voile au ras du sol. Un laboratoire en plusieurs passes
  (2026-11-08, variantes activables par `?mistClouds=`, comparées sur un
  même état de jeu et par captures) a réglé la distribution, la poche du
  village, les trois hauteurs, la couche haute, l'interaction avec les
  WarmLights, puis essayé un relief interne et un masque de densité autour
  des unités, vérifié la lisibilité gameplay, découvert et corrigé un
  comportement « rayons X » des repères, et terminé par une passe de
  performance.
- **Décision** (Antoine) :
  - **Mist Clouds officielles**, variante REFERENCE : trois couches (0,2 à
    1,0 ; 0,8 à 1,9 ; 1,5 à 2,8), alpha 0,75 / 0,5 / **0,22**, distribution
    actuelle, WarmLight alpha additionnel **0,15**, **aucun relief interne**,
    **aucun plafond de couverture**, **aucune baisse globale de densité**,
    masque unités **OFF**. Actives sans paramètre d'URL ; `off` conservé pour
    comparer ;
  - **densité pilotée par le brouillard de guerre** (règle principale,
    décidée le 2026-11-08 en deux temps : trois niveaux d'abord, puis lecture
    « clair, brume forte, noir ») : la grille déjà résolue du brouillard est
    l'unique source de vérité, aucune logique parallèle. Case **visible** par
    une source de vision alliée : nappes faibles (0,22 de REFERENCE) ; case
    **explorée hors vision** : nappes fortes (1,0), la bande atmosphérique
    principale ; case **jamais explorée** : le noir reste souverain, nappes
    atténuées posées dessus comme matière, surface ignorée. Raisons : le
    joueur doit sentir que **ses unités repoussent le brouillard parce
    qu'elles voient**, avec Héros, Villageois, soldats, bâtiments et Baliste
    sans distinction ; un camp réellement visible ne doit jamais rester noyé.
    La **poche claire centrée sur le camp**, rayon esthétique fixe, est
    retirée : elle faisait doublon et pouvait contredire la vision réelle.
    L'état intermédiaire « moyen » essayé pour la zone explorée a été
    abandonné : trop peu lisible entre le clair et le noir. La case du pixel
    fait foi pour la vision (pas de densité héritée des voisines explorées),
    le côté brume est adouci sur trois cases et ondulé par un bruit, la
    frontière gameplay de l'assombrissement reste exacte (**remplacé le
    2026-11-09** par la lisière déplacée, voir le complément ci-dessous :
    la frontière de l'assombrissement est désormais elle aussi irrégulière,
    déplacée vers l'intérieur ; seule la grille reste exacte pour le
    gameplay) ;
  - **aucun mesh ni draw call monde pour les nappes** : elles sont calculées
    dans la passe plein écran du brouillard de guerre, à partir de la
    profondeur déjà résolue. Raisons : parallaxe correcte (forme lue à la
    position monde de la couche), absorption progressive de l'épaisseur
    devant la surface sans ligne de coupe, intégration au brouillard gratuite
    (composées avant l'assombrissement : assombries ou noires comme le sol
    couvert, rien de révélé), aucun tri de transparence ni objet à gérer dans
    la scène ;
  - **calcul par pixel non retenu** : +1,8 à +2,2 ms GPU médian (1600 × 900)
    dans la session mesurée, au-dessus de l'objectif de +1,0 ms. Les
    sorties anticipées exactes n'apportaient aucun gain fiable (la couche
    basse couvre presque tout le sol) ; les couches simplifiées (1 ou 2
    octaves sur la couche haute ou moyenne) changeaient le détail interne
    partout (25 à 76 % des pixels de plus de 2 niveaux) pour un gain instable ;
    une texture de bruit précalculée aurait changé la distribution (bruit à
    rendre périodique, dérive non bornée) ;
  - **half-res retenu** : nappes évaluées dans une cible HalfFloat de la
    moitié de la taille (un draw call, un programme et une texture de plus),
    recomposées par un suréchantillonnage bilinéaire pondéré par la
    similarité de profondeur, avec une évaluation exacte pleine résolution
    sur les seuls pixels de contour : aucune frange sur les cimes, les pieux
    ni les silhouettes. Surcoût +0,2 à +0,45 ms, soit environ 80 % de moins,
    pour une image dont la masse, la distribution, les silhouettes des bancs
    et l'intégration des objets sont identiques (écart moyen inférieur à 0,4
    niveau, au niveau du bruit de mesure d'un témoin exact). **Pas de quart
    de résolution.** La mesure a été faite sur un GPU partagé avec une
    application tierce : les valeurs absolues sont contaminées, seules les
    comparaisons A/B/C entrelacées dans la même session font foi ; ce n'est
    pas un benchmark matériel universel ;
  - **pas de relief interne** : un ombrage directionnel du bruit a été
    essayé puis retiré : il ajoutait un grain interne et du coût sans
    améliorer la lecture des masses ; la grande forme et les trois couches
    suffisent ;
  - **masque unités non retenu en production** : réduction locale de la
    densité autour des unités visibles (surfaces au-dessus de leur sol
    seulement). Coût GPU d'une boucle par fragment non mesuré, ne sauvait
    pas les unités basses, cœurs opaques rares, et les informations
    prioritaires sont déjà protégées par les repères rendus après la passe.
    Les nappes très denses peuvent donc volontairement masquer fortement une
    silhouette ; **aucune exception par type d'unité**. `?mistUnitMask=on`
    reste un outil de comparaison tant que son code reste simple ;
  - **repères gameplay depth-aware via la DepthTexture existante** : plaque
    de placement, anneaux de sélection, anneau de dépôt et marqueurs de
    ralliement sont rendus après la composition brouillard + nappes (jamais
    voilés ni assombris) mais chaque matériau abandonne les fragments situés
    derrière la profondeur opaque de la scène, relue dans la DepthTexture que
    la passe possède déjà. Le comportement « rayons X » précédent (repères
    visibles à travers les bâtiments) est corrigé. **Pas de nouvelle depth
    prepass**, aucune passe, aucun draw call ni texture supplémentaire.
    **Biais par type** (2026-11-08) : 0,01 unité pour la plaque, l'anneau de
    dépôt et les marqueurs ; un dixième (0,001) pour les anneaux d'unité.
    Diagnostic : la hauteur de l'anneau (0,03), la DepthTexture, les matériaux
    et l'ordre de rendu étaient corrects ; seul le biais entier empêchait les
    pieds, à quelques millimètres de profondeur de l'arc avant de l'anneau,
    de le masquer, d'où un anneau qui semblait peint devant les jambes. La
    hauteur de l'anneau suffit à l'écarter du terrain, aucun scintillement ;
  - **flash de sélection** : à une vraie sélection du joueur (clic, Maj +
    clic, rectangle, double-clic, suivi du Héros, inspection d'un bâtiment
    ou d'un groupe), les anneaux gonflent de 22 % puis reviennent en 240 ms,
    ensemble pour un groupe ; lié à l'événement, jamais à la synchronisation
    par image : le maintien de la sélection ne pulse pas ;
  - **vrais supports pour les sources chaudes** (parking d'A5 levé) : feu de
    camp low-poly devant l'Hôtel de ville (position dérivée de l'orientation
    réelle du bâtiment, de côté pour laisser l'axe des marches aux unités,
    PointLight ancrée sur les flammes) et torche sur chaque montant de porte
    de palissade, fixée à la face **intérieure** du poteau (côté défendu,
    celui des traverses : règle valable pour toute porte, construite
    comprise), le tout dans `render/fireProps.ts`. Flammes existantes
    réutilisées (cônes additifs), fusionnées en un mesh par foyer et animées
    en vertex shader : aucun second moteur de particules, aucun registre.
    **Budget de lumières** : les torches visuelles peuvent être nombreuses,
    mais les PointLights restent un réservoir de deux lumières partagées pour
    les portes (centre de la paire de torches des deux portes les plus
    proches du point visé, hystérésis, fondu) plus une pour le feu : jamais
    une PointLight par torche, nombre constant, aucune recompilation ;
  - **barres HTML** : hors périmètre, inchangées. Elles peuvent toujours
    passer devant un bâtiment : problème préexistant et séparé (KI-77,
    parking) ;
  - **Ground Mist** : strictement inchangée. Rôles distincts et documentés :
    Ground Mist = intégration basse, pieds des objets, fog exploré, ancrage ;
    Mist Clouds = grandes masses aériennes, profondeur, environnement autour
    du village. Seuls les uniforms des 4 sources chaudes sont partagés, en
    lecture ;
  - **WarmLights** : interaction conservée, les deux sources officielles
    (Hôtel de ville, porte de palissade) colorent légèrement les nappes.
    Aucune nouvelle lumière.
- **Parking** (voir `ROADMAP.md` §7) : volumes ou filaments internes des
  nappes, seulement si un besoin apparaît à l'œil ; overlays HTML de combat
  depth-aware ; lanterne à la place d'une torche si l'œil le demande.
- **Complément du 2026-11-08 (Antoine ; validé)** : un **second facteur**
  s'ajoute à la grille du brouillard : la **présence locale de nos
  bâtiments construits** (`render/mistClearance.ts`). Antoine veut que la
  **zone bâtie donne l'impression d'être épargnée par le brouillard**.
  Règles décidées : effet **esthétique seulement** (aucune vision gameplay,
  grille, exploration, ciblage, détection et IA intacts : un bâtiment hors
  vision peut éclaircir localement les nappes d'une zone déjà explorée,
  mais cette zone reste assombrie par le vrai brouillard de guerre) ;
  bâtiments reconnus par une propriété générique (bâtiment du joueur,
  chantier terminé), **palissades et portes exclues** (les nappes viennent
  encore contre l'enceinte, pas de grand cercle propre le long des murs),
  chantiers, fantômes et destructibles exclus ; distance à l'empreinte
  réelle, fondu doux (1,75 à 5,5 cases), bordure ondulée, **union** entre
  bâtiments et jamais une somme ; chemin half-res conservé ; masque en
  espace monde recalculé au changement de la liste, aucune boucle shader
  par bâtiment. **Niveau cible officiel : 0,08** (`CLEARANCE_LEVEL`), sous
  le niveau d'une case visible (0,22) : la hiérarchie voulue est **cœur
  bâti très légèrement brumeux** → **zone visible non bâtie légèrement
  brumeuse** → **zone explorée hors vision fortement brumeuse** → **inconnu
  noir**. Un premier essai à 0,26 (au-dessus du visible, case visible
  inchangée) n'avait aucun effet dans le camp de départ, entièrement vu par
  l'Hôtel de ville et la Baliste (vision 21), et a été abandonné le même
  jour. Ce n'est pas le retour de la poche centrée sur le camp (rayon fixe,
  indépendant du bâti) : la clarté dérive de la **visibilité réelle** (grille
  du brouillard) et de la **clairière esthétique des bâtiments réellement
  construits**, deux choses distinctes.
- **Complément du 2026-11-09 (Antoine ; réglages PROVISOIRES, à valider
  en jeu) : lisière du brouillard.** Constat d'Antoine sur capture : le bord
  gris derrière les arbres laissait suivre les marches des cases, et un
  ennemi qui entrait dans sa première case visible apparaissait d'un coup,
  entièrement net. Décisions : (1) une **lisière continue et irrégulière**,
  banc de brume avec avancées et creux, qui peut déborder par endroits sur
  le terrain réellement visible ; (2) **critère principal : l'apparition
  d'un ennemi** : encore enveloppé de brume dans sa première case visible,
  silhouette qui se précise en avançant, qui se perd dans la nappe avant de
  quitter la vision en reculant, le voile couvrant le corps de l'unité ;
  (3) la **grille reste seule juge** de la visibilité gameplay (affichage,
  barres, sélection, aggro, Baliste AUTO) : un ennemi hors vision n'est
  trahi par rien, un ennemi visible peut être ciblable alors que la brume le
  voile encore ; (4) clairière 0,08 et densités de référence (0,22 visible,
  1,0 exploré hors vision, inexploré opaque) conservées loin de la lisière.
  Choix de la passe (`render/fogEdge.ts`) : distance signée à la lisière
  portée par la grille (transformée de distance CPU, recalcul seulement
  quand une case change), déplacée par un bruit en espace monde **biaisé
  vers l'intérieur** (la brume déborde sur le visible, jamais l'inverse :
  aucun terrain hors vision éclairci, aucun inexploré dévoilé), appliquée à
  l'assombrissement ET aux nappes (une seule frontière visuelle : un simple
  flou des nappes aurait laissé deviner l'escalier de l'assombrissement) ;
  densité visible atteinte à 3,5 cases à l'intérieur de la lisière
  déplacée. Ce complément remplace la règle A6 « la frontière gameplay de
  l'assombrissement reste exacte » : c'est l'état (R) qui reste exact, pas
  son dessin. **Validé par Antoine le 2026-11-09** : la forme organique de
  la lisière (amplitude 3 cases, biais 1,6) et la façon dont les ennemis
  émergent du nuage. **Retouche du même jour, PROVISOIRE jusqu'au retour
  d'Antoine sur les captures : le dégradé.** Constat : la démarcation entre
  brume légère (0,22) et brume dense (1,0) restait trop tranchée. Cause
  mesurée (profil de luminance sur une traversée) : le fondu de
  l'assombrissement, symétrique ±0,6 case, tombait là où les nappes sont
  encore à leur densité explorée ; la nappe claire (non assombrie) à
  l'intérieur et la nappe assombrie à l'extérieur se touchaient sur une case,
  d'où une bosse claire puis une chute de 30 points de luminance. Réglage :
  fondu de l'assombrissement **asymétrique**, 0,6 case vers l'extérieur
  (inchangé : la brume ne s'avance pas plus loin vers la palissade) et
  **2,4 cases vers l'intérieur** (`FOG_EDGE_DARK_FADE`), réparti dans la
  bande de 3,5 cases où la densité des nappes décroît déjà ; la bande n'a
  pas été élargie. Références loin de la transition, clairière 0,08,
  opacité de l'inexploré et règles de la grille inchangées. **Ce dégradé
  visible → exploré convient à Antoine (2026-11-09).**
- **Retouche du 2026-11-09 (suite), réglage C validé par Antoine le même
  jour : passage au noir.** Constat d'Antoine : la ligne où le noir prend le
  dessus sur la brume grise se suit encore du regard. Cause mesurée (profil
  de luminance sur le tronçon est) : le fondu du noir était symétrique
  ±0,6 case et **linéaire**, or le mélange vers le noir se fait en lumière
  linéaire : la clarté perçue variant comme la racine de la luminance, tout
  le changement perçu se concentrait contre le noir (chute de 52 points en
  1,25 case, pente maximale 18 par quart de case). Réglage
  (`FOG_EDGE_BLACK_FADE`) : fondu **asymétrique**, 0,6 case vers l'inconnu
  (inchangé : aucun élément de l'inconnu ne devient perceptible avant sa
  découverte, le noir profond reste opaque) et **2,4 cases vers le terrain
  déjà exploré**, avec une **courbe en puissance 2,5** qui répartit la
  variation perçue sur toute la largeur : pente maximale 12,7. Cinq
  réglages ont été comparés sur la même image ; 3 cases avec une courbe 3
  descend à 9,3 mais forme un halo sombre qui mange presque toute la bande
  grise du départ (4 cases d'exploré autour de la vision de 21), écarté.
  Le dégradé visible → exploré (0,6 / 2,4), le tracé organique de la
  lisière, la clairière 0,08 et les règles de la grille sont inchangés.
- **Complément du 2026-11-09 (Antoine ; validé en jeu) : le brouillard
  bouge.** La forme de la lisière et les deux dégradés sont validés ; ce qui
  accrochait l'œil, c'est le terrain qui se découvrait case par case.
  Décisions : (1) à l'ouverture, **le banc de brume se retire devant le
  Héros** d'un mouvement continu, le noir, l'assombrissement, les nappes et
  la Ground Mist ensemble, environ **0,5 s** ; si le Héros continue
  d'avancer, le mouvement repart de l'aspect déjà affiché ; (2) quand une
  portion de terrain perd sa dernière source de vision, **2 s de délai**
  local, puis **1,5 s de retour** à la brume grise, réglables séparément ;
  un demi-tour pendant l'attente ne referme rien, un retour pendant la
  reformation repart de la densité courante ; un terrain exploré revient au
  gris et garde ses décors ; (3) ces délais sont **purement visuels** : un
  ennemi hors de la vision réelle cesse à l'instant d'être affiché,
  sélectionnable et ciblable, sa barre disparaît avec lui ; rien ne se
  dévoile avant que la grille l'autorise. Choix de la passe : la texture
  porte désormais le champ **affiché**, animé par case vers sa cible, et
  `FogOfWar.state` reste seul lu par le jeu ; la lisière du visible est
  calculée sur une **vision retenue** (case vue maintenant ou depuis moins de
  2 s), recalculée seulement quand un ensemble de cases change, y compris à
  l'expiration du délai (donc jamais à chaque image) ; rampes linéaires à
  vitesse fixée au changement de cible, réparties sur la partie de la
  distance qui change réellement l'image (sinon une ouverture ou un retour
  ne dureraient visuellement qu'une fraction de leur durée) ; une case qui
  revient en vision ne se referme pas pendant 2 s, sinon elle se refermait
  devant le Héros en train de revenir. **Observation** : la barre de vie
  d'un ennemi blessé apparaît dès que la grille l'autorise, donc au plus
  0,5 s sur un terrain encore sombre ; conforme à la règle, aucune action
  prévue. **Validé par Antoine après essai en jeu (2026-11-09)** : découverte
  fluide, rythme du retour au gris retenu. Valeurs de référence de
  `FOG_EDGE_TIMING` : `open` 0,5 s pour l'ouverture, `hold` 2 s d'attente
  après la perte de la dernière source de vision, `close` 1,5 s pour le
  retour progressif à la brume grise.
- **À ne pas faire** : ne pas réintroduire le relief interne ni une poche
  claire centrée sur le camp à rayon fixe, ni une liste d'unités comme
  source de clarté (la grille du brouillard et la clairière des bâtiments
  construits sont les deux seules sources) ; ne pas remettre un niveau
  « moyen » en zone explorée ; pas de plafond de couverture ni de baisse
  globale de densité ; pas de quart de résolution ; pas de depth prepass ;
  pas de masque unités par défaut ni d'exception par type d'unité ; ne pas
  modifier la Ground Mist pour un effet qui relève des Mist Clouds ; ne pas
  ajouter de mesh de nuage dans la scène ; pas de PointLight par torche ;
  pas de pulse de sélection en boucle.
- **Sources** : `render/mistClouds.ts`, `render/fogOfWar.ts` (`FogOfWarPass`,
  `GAMEPLAY_OVERLAY_LAYER`, `makeOverlayDepthAware`, `markGameplayOverlay`),
  `render/fireProps.ts`, `render/warmLights.ts`, `render/palisade.ts`,
  `render/renderer.ts`, `render/unitSelectionRing.ts`,
  `render/battleSelection.ts`, `render/resourcePiles.ts`,
  `render/rallyMarkers.ts`, `main.ts` (`setMistCloudsScene`, plaque de
  placement, `syncGates`, flash d'inspection) ;
  `tests/game/overlay-profondeur-jeu.cjs`, `mist-clouds-fog-jeu.cjs`,
  `selection-flash-jeu.cjs` ; `CURRENT_STATE.md` §11 et §18 ;
  `ARCHITECTURE.md` §11.

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

- **Statut** : Active (Garde dès le départ) / Remplacée (le pas d'ouverture
  d'une case, retiré le 2026-11-05 par G41, KI-68 close).
- **Contexte** : au lancement de la bataille, les unités du joueur
  avançaient d'elles-mêmes vers l'ennemi, comme lui.
- **Décision** (demande d'Antoine) :
  - les ennemis avancent toujours ; les unités du joueur sont en défense :
    elles attendent qu'un ennemi entre dans leur aggro, ou un ordre ;
  - (remplacé) pour ne pas paraître figée, la formation faisait d'abord un
    pas d'ouverture d'exactement une case vers l'ennemi, tout ou rien, puis
    passait en Garde ;
  - les unités produites ensuite passent directement en Garde.
- **Aujourd'hui** : une run Hero RTS démarre directement (menu → Héros →
  monde chargé → camp de départ → caméra sur le Héros → simulation) ; les
  unités présentes sont en Garde dès le premier pas, en vraie run comme
  dans « Tester le scénario » (`CURRENT_STATE.md` §2). Une
  animation ou une introduction, si elle est voulue, sera conçue à part.
- **Sources** : `main.ts` (`startSurvivalWorld`, `setupTestBattle`,
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
  disponibles). Verrou : `RecruitmentUnlockConfig.minLevels`.
- **Aujourd'hui** (2026-11-04, G40) : la production « par manche »
  (`UnitProductionConfig.unitsByLevel`) n'existe plus ; le Piquier et, au
  Niv. 2, l'Homme d'armes se produisent dans la file payée de la Caserne.
  L'armée de départ n'a plus de Fantassin (G38).
- **Sources** : `data/units.ts` (`piquier`), `data/buildings.ts`
  (`barracks`), `data/production.ts`, `CURRENT_STATE.md` §3 et §4.

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

- **Statut** : Retirée (2026-11-05, G41, décision d'Antoine).
- **Contexte** : certaines unités devaient se débloquer au fil de la
  progression ; au début, c'était à un numéro de vague précis.
- **Décision** : une unité marquée comme telle devient recrutable dès que le
  joueur a vaincu au moins une fois ce type d'unité **en tant qu'ennemi**.
- **Raison connue** : la sauvegarde enregistre un fait (« ce type a été
  vaincu ») plutôt qu'une conclusion. Ce fait reste réutilisable plus tard,
  par exemple pour un bestiaire ou des succès.
- **Aujourd'hui** : **retiré** — `playerUnlockMode`,
  `defeatedEnemyUnitIds`, `registerEnemyDefeat`, `canPlayerRecruitUnit`,
  le toast et la migration `unlockedUnits` n'existent plus. Une unité se
  produit dès que son bâtiment existe (D7) : le Mage au Sanctuaire ; la
  Sentinelle reste définie et **dormante** (aucun bâtiment, rôle et coût à
  décider, `ROADMAP.md` §6 quater). Une ancienne sauvegarde se charge
  normalement (clés ignorées).
- **À ne pas faire** : ne pas réintroduire un déblocage par victoire sans
  nouvelle décision ; ne rien inventer pour la Sentinelle.
- **Sources** : archive (« Système générique de déblocage d'unités ») ;
  `data/units.ts`, `run/metaProgress.ts`, G41.

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

- **Statut** : Active (Or seule monnaie ; améliorations propres à la run,
  jamais sauvegardées). Remplacée : la monnaie Rune, la boutique
  d'amélioration permanente du menu principal, le talent « Maître de la
  forge » ; et, par **G41** (2026-11-05), le niveau de production des
  unités, le surcoût de recrutement et l'écran de la Forge — la Forge porte
  désormais des technologies militaires globales, les améliorations
  d'unité appartiennent au bâtiment producteur, la Baliste à sa fiche. La
  règle « une amélioration n'augmente pas le prix de ce qu'elle améliore »
  est **de nouveau active**.
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
- **Aujourd'hui** (voir G41 pour le modèle complet) :
  - Or de départ 20 (25 avec « Or de départ », voir D7) ; Forge 10,
    Mine 20, Caserne 15, Camp d'archerie 15, Maison 5, Tour 20, Église 35 ;
  - la Forge recherche Armes forgées I et Armures forgées I ; la Baliste
    s'améliore depuis sa fiche (1 / 2 / 4 / 8… or) ; les unités tirent leurs
    bonus du niveau de leur producteur et des technologies, à coût de
    recrutement fixe ;
  - `MetaProgress` ne contient plus que la progression permanente ; les clés
    `upgradeRunes` / `unitUpgrades` des anciennes sauvegardes sont ignorées.
- **À ne pas faire** :
  - ne pas réintroduire de monnaie permanente qui achèterait des
    améliorations de statistiques hors de la run ;
  - ne pas faire dépendre la puissance des améliorations du nombre de Forges ;
  - ne pas réintroduire un surcoût de recrutement lié à la puissance sans
    décision explicite (G41).
- **Sources** : `run/runUpgrades.ts`, `run/runState.ts`,
  `run/metaProgress.ts` (`REMOVED_TALENT_REFUNDS`), `data/buildings.ts`,
  `CURRENT_STATE.md` §6, §7 et §14 ; G41.

### D6 — Améliorations de la Mine et de la Caserne propres à chaque bâtiment

- **Statut** : Active pour la Mine et la Tour (niveau par exemplaire ;
  l'Église n'a plus d'amélioration) ; **remplacée par G41** (2026-11-05)
  pour les producteurs
  (Caserne, Camp d'archerie, Sanctuaire, Écurie) : un seul niveau par type,
  global à la run, qui améliore leur roster.
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
  1 (Survie en temps réel, G11), +2 / +2 par niveau, sans plafond, par la
  file de la Mine (20 s, G41) ; Caserne et Camp d'archerie : voir D7 et
  G41. Ces valeurs sont de l'équilibrage, pas une décision.
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
    viennent des données (`BuildingDef.recruitmentUnlock`, lues par
    `producibleUnits` de `data/production.ts` depuis le retrait de
    `run/recruitment.ts`, G40).
- **Sources** : `data/buildings.ts`, `data/production.ts`,
  `sim/systems/buildingProduction.ts`, `run/runState.ts`,
  `config/constants.ts`, `CURRENT_STATE.md` §2, §4 et §6.

### D8 — Murailles du joueur

- **Statut** : **Abandonnée** le 2026-11-02 (décision d'Antoine : système
  devenu trop complexe et incohérent). Tout le code du Wall V1 est supprimé
  et remplacé par la Palissade V2 (G23) ; les anciens murs des cartes sont
  ignorés au chargement, jamais convertis. Ce qui suit est **historique**.
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
- **Sources** (supprimées le 2026-11-02) : `core/wallTrace.ts`,
  `render/wallVisuals.ts`, `sim/systems/gates.ts`, mode Muraille de
  `main.ts`.

---

## E. Placement, carte et éditeur

### E1 — Manipulation directe pendant le placement

- **Statut** : Remplacée pour le placement (la phase de placement a été
  retirée du code le 2026-11-04, G40) ; Active comme principe : les
  gestes directs (clic, glisser, rectangle, double-clic) sont ceux du jeu
  en temps réel et de l'éditeur.
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

- **Statut** : **Retirée du code** le 2026-11-04 (G40 ; `run/mapExpansion.ts`
  supprimé, `RunState.mapExpansion` disparu, KI-27 sans objet). La
  question des runs longues (plusieurs cartes, biomes) reste Ouverte ; une
  réintroduction se ferait depuis l'historique Git, pas depuis ce qui
  suit, qui décrit le comportement retiré.
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
  (`isValidPlacementTile`), `render/board.ts`, `EDITOR.md` §4,
  `CURRENT_STATE.md` §11 (le suivi du territoire par
  `run/mapExpansion.ts` a disparu avec l'agrandissement, G40).

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
  `render/obstacleFactory.ts`, `EDITOR.md` §6 (le cas « objet déplacé par
  l'agrandissement » n'existe plus depuis G40).

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
  - bâtiments et Baliste seulement sur une emprise plate à un seul niveau ;
    une palissade (G23) suit le relief mais ne franchit pas une falaise ;
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
    **Décidé** (Antoine, 2026-11-06) : `groundLook=meadow` remplace `rich` comme
    rendu par défaut (herbe plus profonde, variantes organiques, touffes
    instanciées, brume atmosphérique en jeu avec fond assorti) ; `rich` reste
    disponible comme comparaison et débogage, sans touffes ni brume, et
    `?atmosphere=clear` compare sans brume. L'éditeur garde un fond noir, sans
    brume ni touffes, pour rester un outil lisible.
    **Décidé** (Antoine, 2026-11-06, Graphic Lab V2 clos) : après
    comparaison de trois presets sur le même état de jeu (`clear`,
    `atmospheric`, `moody` ; `render/visualPreset.ts`), **`atmospheric` est le
    rendu officiel par défaut**, sans paramètre d'URL : `meadow`, densité
    d'herbe actuelle (environ 3 300 à 3 500 touffes selon la graine, valeur
    de référence), brume et lumières `atmospheric` telles quelles (la brume
    est subtile à dessein), fond assorti, correction des reflets des `.obj`
    (plus de retour aux anciens highlights blancs). `clear` et `moody`
    restent des presets de développement et de comparaison, jamais le rendu
    officiel ; `moody` pourra servir plus tard de base (biome, événement,
    ambiance, variante de carte) sans qu'aucune mécanique n'en dépende. Pas
    de bloom ni de post-traitement. L'éditeur garde les lumières
    d'`atmospheric` quel que soit le preset. Les anciennes questions
    `surfaceBlend=organic` contre `lisiere`, `groundLook=organic` contre
    `rich` et `surfaceBorder` sont closes par les décisions du 2026-11-02 et
    du 2026-11-06 ci-dessus ; `lisiere`, `melange`, `rich`, `organic` et
    `subtile` restent des témoins historiques et de débogage ;
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
  - aucune unité, aucun bâtiment, aucun mur, pas de Baliste sur
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
  niveaux 2 et 3 à 50 et 150 XP (2026-11-02 : niveau 100 maximum, 50 × niveau
  jusqu'au 10 puis +100 XP par niveau ; PV et dégâts par tranches de
  niveaux, dégressifs : 2-10, 11-25, 26-50, 51-100 ; vitesse figée après le 3 ;
  demandes d'Antoine) ; XP = max(4, coût × 4) dans un rayon de
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
  **murailles reportées** (faites le 2026-11-02 : Palissade V2, G23).
- **Règles de la passe** : construction = commandes du Héros (fiche),
  chantier payé et créé en direct ; production = commandes du bâtiment
  (fiche), une à la fois, durée par unité (`data/production.ts`) ; la
  Boutique globale est legacy et masquée en Survie ; la Baliste n'acquiert
  que des cibles vues (vision gameplay déterministe, `sim/vision.ts`).
- **À ne pas faire** : ne pas réintroduire de phase de préparation en
  Survie ; ne pas faire dépendre la simulation du brouillard du rendu.
- **Sources** : `main.ts`, `data/production.ts`, `sim/vision.ts`,
  `sim/systems/buildingProduction.ts` (`tickProductionOrders`).

### G13 — Équipement du Héros, items, butin (fondation)

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02) : éditeur d'items, raretés, slots,
  visuel réutilisant l'Atelier, stats de base + bonus = finales, effet de
  feu générique, valeur de vente, items de démonstration, équiper /
  remplacer / retirer, outil de travail temporaire, fondation du butin et
  de l'inventaire ; Marché, camps, Scierie, Camp de mineur : architecture
  seulement.
- **Choix de la passe** :
  - stats et effets des items en **points affichés** (« +3 dégâts » =
    +3 points, 30 internes) : l'Épée du débutant fait passer le Paladin de
    2,5 à 5,5 dégâts ;
  - PV / mana actuels **en proportion** quand l'équipement change (pas de
    soin par équiper / retirer) ;
  - main secondaire et bouclier exclusifs (même main) ;
  - inventaire : ids d'items (doublons possibles), sac de 12 ;
  - au travail, seule l'arme principale cède sa place à l'outil (le
    bouclier reste) ;
  - pièces de corps (casque, épaulières) : stats seulement en jeu (modèle
    fusionné), visibles dans l'aperçu de l'éditeur ;
  - butin : pas de tables ; `?loot=demo` pour tester ; item non ramassé si
    le sac d'objets est plein.
- **Effets d'équilibrage** : les bonus de dégâts sont forts à l'échelle
  actuelle des unités (un Homme d'armes a 5 PV) ; à revoir avec les camps.
- **Sources** : `data/equipment.ts`, `data/loot.ts`, `run/heroEquipment.ts`,
  `sim/systems/hero.ts`, `sim/systems/combat.ts`, `render/heroEquipmentView.ts`,
  `render/itemDropViews.ts`, `src/itemEditor/`.

### G14 — Camps neutres, coffres, première boucle d'exploration

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02) : explorer → découvrir un camp →
  combattre → XP / récompense → coffre → item → l'équiper → repartir plus
  fort ; un bon camp et une architecture multiple plutôt que dix camps.
- **Choix de la passe** :
  - camps et vagues distincts : gardes hors du compte de fin de vague,
    jamais d'ordre `assault`, stats de base sans montée par vague ;
  - gardes liés au camp : détection, laisse, retour au poste,
    régénération au calme (pas d'usure par allers-retours) ;
  - **camp au calme jamais ciblé automatiquement** par le joueur : sans
    cette règle, le Héros en Garde (aggro 9 = sa vision) chargeait tout
    camp qu'il voyait, et découvrir sans combattre était impossible ;
  - coffre verrouillé tant qu'un garde vit ; ouverture d'1 s ; butin au sol
    (pas directement au sac) ;
  - or au nettoyage (8 / 15), pas de prime par kill ;
  - petit camp gagnable au niveau 1, grand camp seulement au niveau 2 avec
    un premier item (mortel avant) ;
  - décor traversable (règle du décor du 2026-10-28), une lumière par camp ;
  - un item Rare ajouté (Hache du chef pillard) pour que la table ait ses
    trois raretés.
- **Effets d'équilibrage** : nouvelles sources d'XP (58 / 100), d'or et
  d'items ; le grand camp peut tuer un Héros niveau 1 qui l'attaque.
- **Sources** : `data/camps.ts`, `data/loot.ts`, `run/camps.ts`,
  `sim/systems/camps.ts`, `sim/world.ts`, `config/maps/proceduralSurvival.ts`,
  `render/campViews.ts`, `main.ts`.
- **Validation** (2026-11-02) : Antoine valide la règle « camp au calme
  jamais ciblé automatiquement ».

### G15 — Inventaire unique, or physique, Héros permanent

- **Statut** : Active ; valeurs **provisoires**. **Or physique remplacé** le
  2026-11-03 : l’or est une monnaie (G25) ; le reste est inchangé.
- **Demande d'Antoine** (2026-11-02) : un seul inventaire de 20 cases
  (ressources empilables par 5, équipements, butin), or trouvé physique
  (sol → sac → dépôt → stock), seul le stock se dépense, Mine au stock
  directement, HUD économique, sac 3D, silhouette d'équipement et
  glisser-déposer, défilement caméra par les bords, éditeur vierge, Héros
  contrôle primaire permanent (bâtiment = contexte secondaire).
- **Choix de la passe** :
  - inventaire = état de simulation (ramassage partiel décidé dans le pas
    fixe), recopié dans la run ; l'interface agit au pas suivant ;
  - dépôt dans l'ordre bois, pierre, or ; pile retirée par la fin ;
  - or des ennemis = ancienne prime arrondie en tas (`ENEMY_GOLD_DROPS`) ;
    or du camp en tas de 5 ;
  - **restent versés au stock** : Mine, or de départ, bonus de vague
    repoussée (récompense système, pas trouvée dans le monde) — à trancher ;
  - Héros permanent : il prend les ordres dès qu'aucune unité n'est
    sélectionnée ; une unité militaire sélectionnée garde la main (pas de
    contrôle mixte Héros + armée pour l'instant) ; **remplacé par G47**
    (2026-11-05 : Héros désélectionnable, aucun ordre implicite) ;
  - encart du Héros déplacé en haut à droite sous la ligne économique
    (description d'Antoine) ;
  - vitesse caméra : défilement par les bords seulement (le glisser suit la
    souris, la rotation n'est pas un déplacement).
- **Effets d'équilibrage** : l'or n'arrive plus instantanément ; aller
  chercher l'or des vagues prend du temps et du risque ; le Héros porte au
  plus 100 unités de ressources (20 piles de 5).
- **Sources** : `sim/inventory.ts`, `data/resources.ts`, `sim/systems/hero.ts`,
  `sim/world.ts`, `ui/heroInventory.ts`, `ui/economyHud.ts`, `main.ts`.
- **Validations d'Antoine** (2026-11-02) : le bonus de vague reste versé au
  stock (récompense système, comme la Mine) ; or des ennemis, des camps et
  des destructibles physique ; une unité militaire sélectionnée reçoit les
  ordres (voulu) ; les tas d'or restent au sol jusqu'au ramassage.

### G16 — Briques RTS : destructibles, production, réparation, défaite

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02) : barils destructibles à butin, Mine
  3 × 3, sortie devant les producteurs, point de ralliement, murailles
  diagonales étanches (supprimées avec le Wall V1, G23), réparation payante par le Héros, Baliste détruite =
  défaite, HUD final (économie haut droit, Héros bas gauche, barre d'action
  centrée).
- **Choix de la passe** :
  - baril = entité bâtiment neutre (équipe adverse, hors fin de vague,
    jamais ciblé automatiquement), 4 PV, butin 30 % (1-2 ressources) ;
  - devant d'un bâtiment = face +Z du modèle tournée par `rotationY` ;
  - ralliement stocké dans le bâtiment (simulation), ordre de marche donné à
    l'apparition ;
  - diagonale = cases 1 × 1 qui se touchent par un coin (étanche), modèle
    étiré ; pas de coin KayKit aux virages diagonaux ;
  - réparation : paiement d'avance, remboursement de la part non utilisée
    (arrondi inférieur), 10 s pour 100 % ; Baliste : base de coût propre ;
  - défaite : la seule Baliste (`World.isBaseLost`).
- **Effets d'équilibrage** : réparer coûte ; la Baliste devient la cible
  décisive ; les barils ajoutent un peu de ressources dans les camps.
- **Sources** : `data/buildings.ts`, `data/loot.ts`, `sim/world.ts`,
  `sim/systems/buildingProduction.ts`, `sim/systems/hero.ts`,
  `core/wallTrace.ts` (supprimé depuis), `run/buildingRepair.ts`, `render/destructibleViews.ts`,
  `render/rallyMarkers.ts`, `ui/actionProgress.ts`, `main.ts`.

### G17 — HUD officiel verrouillé, outil de calibration conservé

- **Statut** : Active ; positions **provisoires**.
- **Demande d'Antoine** (2026-11-02) : la disposition réalisée à la main
  devient le layout officiel (Héros bas gauche ; Inventaire, sorts,
  Construire en bas ; XP pleine largeur ; Vague haut centre ; Économie haut
  droite) ; l'outil de calibration est gardé mais désactivé par défaut ;
  « Réinitialiser » revient au nouveau layout ; X2 retiré du HUD joueur.
- **Choix de la passe** :
  - layout officiel écrit dans le **format de l'export**
    (`ui/hudDefaultLayout.ts`) : un export de la disposition d'Antoine
    peut le remplacer tel quel. Sa disposition locale exacte n'a pas pu être
    lue (stockage du navigateur) : les valeurs suivent la direction écrite,
    mesurées à 1600 × 900 ;
  - variante compacte sous 1 200 px (le groupe centré toucherait l'encart du
    Héros) ;
  - panneau Construire ouvert au-dessus du bouton (signalé par Antoine : il
    recouvrait la barre des sorts) ;
  - touche X gardée comme outil de debug invisible (mode debug seulement) ;
  - fenêtre d'inventaire déplaçable par le joueur (clic maintenu sur le
    fond), indépendante de l'outil de calibration.
- **Sources** : `ui/hudDefaultLayout.ts`, `ui/hudLayout.ts`,
  `ui/heroInventory.ts`, `ui/buildMenu.ts`, `ui/screens.ts`, `main.ts`.

### G18 — Niveau d'unité générique, scaling plus tard

- **Statut** : Active.
- **Demande d'Antoine** (2026-11-02) : toute unité de combat a un niveau
  valide (1 par défaut), affiché dans sa fiche ; le niveau des unités non
  Héros est une donnée de difficulté et de présentation ; pas de
  multiplicateur de stats dans cette passe.
- **Choix de la passe** :
  - `Entity.level` porté par toute entité, résolu hors de la simulation ;
  - les niveaux d'amélioration existants deviennent ce niveau (production du
    joueur, renfort de vague ennemi : niveau = amélioration + 1), sans
    changer leurs stats : un seul niveau affiché, jamais deux vérités ;
  - le Héros garde sa progression ; son niveau d'entité en est une copie ;
  - priorité : valeur explicite de la carte > règle (future difficulté
    procédurale) > 1 ; jamais un niveau déduit de la seule distance au
    centre.
- **À ne pas faire** : multiplier les stats par le niveau sans formule
  décidée (parking : ROADMAP §6 octies).
- **Sources** : `data/unitLevels.ts`, `sim/entity.ts`, `sim/world.ts`,
  `run/camps.ts`, `run/entityInfo.ts`, `main.ts`.

### G19 — Survie : cartes dessinées et cartes générées

- **Statut** : Active (direction) ; seule la carte générée existe.
- **Demande d'Antoine** (2026-11-02) : pouvoir dessiner ses cartes de Survie
  (camps, zones, niveaux, butin) et garder la génération procédurale ; même
  format de sortie ; le gameplay ignore l'origine de la carte ; plusieurs
  cartes de survie possibles plus tard.
- **Choix de la passe** :
  - `MapDef` reste le seul format : le générateur écrit les niveaux des camps
    et `survivalRules` comme le ferait une carte dessinée ;
  - règles de la Survie Hero RTS lues dans `MapDef.survivalRules`, plus dans
    `MapDef.generator` ;
  - pas d'éditeur de zones ni de sélection de carte dans cette passe.
- **Sources** : `config/mapDef.ts`, `config/maps/proceduralSurvival.ts`,
  `main.ts`.

### G20 — Sol du village : terre battue et chemins

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02) : à la pose d'un bâtiment, terre battue
  dessous et sur une case autour ; chemin d'une case de terre battue entre
  deux bâtiments à 20 cases ou moins.
- **Choix de la passe** (validés par Antoine le 2026-11-02, terre conservée après
  destruction, Survie seulement) :
  - chaque nouveau bâtiment est relié au **plus proche** des bâtiments déjà
    posés (à 20 cases ou moins), pas à tous : un réseau en arbre plutôt
    qu'une toile de chemins ;
  - Baliste comprise ; pièces de mur exclues ;
  - chemin en ligne droite de cases reliées par un côté, qui saute l'eau ;
  - anneau aux coins arrondis ; terre battue gardée après une destruction,
    jusqu'à la run suivante ; purement visuel.
- **Sources** : `render/settlementGround.ts`, `render/board.ts`,
  `render/terrainChunks.ts`, `main.ts`.

### G21 — Arbres à 20 bois, vagues barbares, file de production

- **Statut** : Active ; valeurs **provisoires**.
- **Demandes d'Antoine** (2026-11-02) : sélectionner un arbre (anneau jaune),
  un arbre vaut 20 bois ; vagues jouées par les barbares ; Archer du Camp
  d'archerie en nouveau modèle ; menu Construire fermé par un clic sur le
  terrain ; file de production de plusieurs unités, amélioration comprise,
  dans l'ordre des clics.
- **Choix de la passe** :
  - quantité décomptée par la simulation ; arbre à 0 **abattu** (décision
    d'Antoine) : souche décorative, cases non bloquantes et constructibles,
    pathfinding mis à jour aussitôt — abattre une forêt peut ouvrir un
    chemin aux vagues ;
  - vagues (validé) : barbare du même rôle ; stats, renfort, or et butin du
    rôle de vague ; camps et vagues restent deux systèmes distincts ;
  - roster humain Toon RTS par défaut (Homme d'armes, Archer, Mage,
    Sentinelle), anciens modèles en repli ;
  - file (validé) : 5 commandes, paiement au clic, annulation avec or rendu,
    file perdue sans remboursement à la destruction ; amélioration en file
    (20 s, provisoire) pour les producteurs seulement, une à la fois ; Mine et
    Tour : amélioration immédiate ;
  - **ressource verrouillée** (arbre sans Scierie, gros gisement sans Camp de
    mineur), règle d'Antoine : clic droit = interaction reconnue + déplacement
    autorisé (sélection, raison rappelée, le Héros va au pied de la
    ressource, aucune récolte) ; jamais « interaction impossible = clic
    consommé » pour une ressource.
- **Sources** : `data/resources.ts`, `data/units.ts`, `data/production.ts`,
  `sim/world.ts`, `sim/systems/hero.ts`, `sim/systems/buildingProduction.ts`,
  `run/buildingUpgrades.ts`, `render/toonUnitRig.ts`, `main.ts`.

### G22 — Scierie et Camp de mineur

- **Statut** : **Remplacée** le 2026-11-03 par G25 pour les droits de
  récolte (la Forge donne les outils) ; Scierie et Camp de mineur sont des
  **points de collecte** depuis le même jour (G33).
- **Demande d'Antoine** (2026-11-02) : mettre en jeu la Scierie (coupe des
  arbres) et le Camp de mineur (gros gisements), gisements finis (40 pierre),
  même philosophie que l'arbre ; progression petits tas → dépôt → Scierie /
  Camp de mineur → grosses ressources.
- **Choix de la passe** :
  - 10 or + 8 bois (Scierie), 10 or + 6 bois + 4 pierre (Camp de mineur),
    3 × 3, 15 PV, 8 s ; modèles KayKit « lumbermill » et « workshop » ;
  - droits recalculés avant chaque pas d'après les bâtiments terminés du
    monde (une seule règle pour toutes les cartes) ;
  - droit perdu (dernier bâtiment détruit) : l'unité en cours d'extraction
    est finie, puis arrêt ; en chemin : arrêt immédiat ;
  - sources factorisées (`HARVEST_NODE_KINDS` : quantité, bâtiment requis,
    geste) ; gisement vidé : gravats, rien à débloquer (rochers non
    bloquants, KI-41) ;
  - pas de dépôt local : la Baliste reste le seul dépôt.
- **Sources** : `data/resources.ts`, `data/buildings.ts`,
  `run/harvestPermissions.ts`, `sim/world.ts`, `sim/systems/hero.ts`,
  `main.ts`.

### G23 — Palissade V2 : murs géométriques A → B, sans grille

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-02) : abandonner complètement la muraille
  V1 (trop complexe, incohérente) et repartir de zéro ; première famille :
  **Palissade en bois**, posée comme dans un RTS classique (clic A, aperçu,
  clic B), à n'importe quel angle, avec une porte ; constructible en Survie
  temps réel et dans l'éditeur, même architecture ; carte enregistrée de
  façon géométrique ; anciens murs ignorés, sans convertisseur ; format
  extensible (pierre, fortifié…).
- **Choix de la passe** :
  - **collision en capsule** (segment + demi-épaisseur 0,15), exacte à tout
    angle ; segments voisins à extrémités partagées (barrière continue aux
    jonctions) ; A* : cases couvertes par la ligne et son épaisseur ;
  - **segment nominal de 2 cases** (⌊L / 2⌋ segments égaux, 2 à 4 cases) :
    une brèche d'un segment laisse passer un Cavalier (rayon 0,7) ; avec
    1 case, la brèche serait plus étroite que la plupart des unités ;
  - **chantier par segment**, le Héros bâtit de A vers B ;
  - **porte = un segment remplacé** (même géométrie), ouverture / fermeture
    manuelles ; porte bâtie **fermée** ; fermeture différée tant qu'un allié
    occupe l'ouverture ;
  - **porte ouverte = passage pour le propriétaire et ses alliés seulement**
    (correctif d'Antoine, 2026-11-02, remplace « tout le monde passe ») :
    elle bloque toujours les hostiles, vagues comprises, qui contournent ou
    l'attaquent. Règle générique de relation (`sim/relations.ts` :
    `areAllied`, `canUnitPassGate`), sans camp codé en dur, compatible
    avec de futures factions ; l'ancien `passableForTeam` du V1 n'est pas
    réintroduit. Pas d'ouverture ni de fermeture automatique pour l'instant ;
  - tirs **traversants** (comme l'ancienne muraille) ;
  - coût **0,5 bois / case** (longueur au dixième, arrondi au-dessus), porte
    4 bois, stock déposé seulement ; 15 PV / case (porte 20) ; 1,5 s / case
    (porte 4 s) ;
  - jonctions bout à bout, en T et prolongement acceptées ; croisement franc
    et chevauchement refusés ; arbres, gros gisements, eau, falaises,
    bâtiments (écart 0,15) et corps d'unités refusés ;
  - portée jusqu'à la **ligne** d'une pièce de mur (`targetDistance`) ;
  - rendu procédural (aucun asset adapté), un mesh par segment.
- **Effets d'équilibrage** : les enceintes deviennent possibles en temps
  réel et bon marché en bois ; les vagues les percent (fragiles) ; une
  porte ouverte ne profite qu'au joueur.
- **Sources** : `core/wallLine.ts`, `data/walls.ts`, `data/buildings.ts`,
  `config/mapDef.ts`, `sim/world.ts`, `sim/systems/doors.ts`, `sim/relations.ts`,
  `sim/geometry.ts`, `sim/pathfinding.ts`, `sim/systems/movement.ts`,
  `render/palisade.ts`, `editor/editorState.ts`, `main.ts`.

### G24 — VFX de montée de niveau du Héros

- **Statut** : Active ; **provisoire** (sera probablement remplacé par un
  VFX acheté).
- **Demande d'Antoine** (2026-11-02) : rendre la montée de niveau
  immédiatement perceptible (flash, onde au sol, particules, colonne de
  lumière, étincelles dorées), 1 à 1,5 s, dans le monde 3D, plus une
  réaction discrète du badge ; remplaçable sans toucher au système d'XP.
- **Choix de la passe** : effet de 1,3 s qui **suit** le Héros pendant sa
  durée ; **agrégation** (un seul effet par Héros : plusieurs niveaux d'un
  même pas = un effet, niveau final ; un niveau pendant l'effet le relance) ;
  Héros à terre : badge seulement ; l'ancien bandeau « Héros : niveau N ! »
  est remplacé par « NIVEAU N » au-dessus du portrait. Interface
  `LevelUpEffect` (rendu) séparée du déclenchement (événement de
  simulation `levelUp`).
- **Sources** : `render/levelUpVfx.ts`, `ui/heroHud.ts`, `ui/style.css`,
  `main.ts` (`playLevelUps`).

### G25 — Or monnaie, Forge = outils, gisements bloquants

- **Statut** : Active ; valeurs **provisoires** ; **amendée** le
  2026-11-04 par G37 (la Forge ne débloque plus le bois ni la pierre), G39
  (placement des gisements), puis le 2026-11-05 par G41 (la Forge ne
  débloque plus rien : or libre, Forge = technologies).
- **Demande d'Antoine** (2026-11-03) :
  - **Or = monnaie** : plus un objet du sac ; tas ramassés d'un clic,
    instantanément (remplacé le même jour : le Héros va le ramasser, voir
    G30) ; gisement d'or extrait à la pioche, crédité directement ; Mine
    inchangée ;
  - **Forge = déblocage des outils** : une Forge terminée donne la Hache de
    bûcheron et la Pioche de mineur ; message unique ; sans Forge :
    sélection, message, déplacement, pas d'extraction ; dernière Forge
    détruite : l'unité en cours est finie, puis arrêt ;
  - **Scierie / Camp de mineur ne contrôlent plus les permissions** (en
    attente d'une nouvelle fonction) ;
  - gros gisements (pierre « Rocher E », or) **bloquants** pour le
    déplacement et la construction (remplace KI-41).
- **Choix de la passe** : gisement d'or 25 or, 2 × 2 ; 6 gisements d'or et
  26 de pierre sur la carte générée (bloc 4 × 4 libre autour de chacun) ;
  annonce « Nouveaux outils disponibles » une fois par partie ; pépites
  d'or procédurales (aucun asset dédié).
- **Sources** : `data/resources.ts`, `data/buildings.ts`,
  `run/harvestPermissions.ts`, `config/resourceNodes.ts`, `sim/world.ts`,
  `sim/systems/hero.ts`, `render/rocks.ts`, `main.ts`.

### G26 — Maison A/B, Sanctuaire, Écurie

- **Statut** : Active ; valeurs **provisoires**.
- **Demande d'Antoine** (2026-11-03) : Maison alternée A/B (déterministe,
  stockée) ; Sanctuaire = magie (Mage, parchemins), l'Église garde Oracle,
  Vengeur et le soin ; Écurie = Cavalier léger (unité existante),
  amélioration testée dans la file.
- **Choix de la passe** :
  - alternance d'après les Maisons **posées** dans la run (pas celles encore
    debout) : une destruction ne change rien aux autres ;
  - Sanctuaire 25 or + 8 bois + 8 pierre, 2 × 2, 20 PV, 10 s ; Écurie
    20 or + 12 bois, 3 × 3, 25 PV, 10 s ; Cavalier léger 12 s ;
    amélioration Niv. 2 de chacun : +5 PV du bâtiment (provisoire, sert
    surtout à éprouver unité → amélioration → unité) ;
  - ralliement proposé à tout producteur par file (Église comprise).
- **Rappel** : le Cavalier avait été retiré du recrutement ; il revient ici
  **sur demande explicite** d'Antoine (Écurie).
- **Sources** : `data/buildings.ts`, `data/production.ts`,
  `run/runState.ts`, `run/runUpgrades.ts`, `run/entityInfo.ts`, `main.ts`.

### G28 — Auberge et Villageois : première unité économique

- **Statut** : Active ; valeurs **provisoires**. Transport (porter 5,
  déposer, revenir) supprimé puis **rétabli le 2026-11-03** (G32, cargo de
  5) ; modèle dédié `human_villager` et aucune attaque (G32).
- **Demande d'Antoine** (2026-11-03) : Auberge (producteur standard) qui
  produit le Villageois ; récolte bois, pierre et or avec la permission de
  la Forge ; transport simple (≈ 5) au dépôt, retour à la ressource ; or
  crédité directement ; pas d'inventaire RPG, d'XP ni de mana ; pas de
  grosse IA autonome.
- **Choix de la passe** :
  - Villageois 5 or, 8 s, 2,5 PV, 0,2 dégât, vitesse 2,2, population 1,
    charge 5 ; Auberge 15 or + 8 bois, 2 × 2, 20 PV ;
  - dépôt au dépôt allié **le plus proche** (`resourceDepot`), une unité
    / 0,5 s (instantané depuis le 2026-11-04, G35) ; source épuisée : même
    type à 6 cases au plus, sinon Garde ;
  - **asymétrie provisoire** : l'or n'est jamais porté (monnaie), le bois
    et la pierre le sont ;
  - aucun modèle de paysan : modèle du Piquier en attendant.
- **Sources** : `data/units.ts`, `data/buildings.ts`,
  `sim/systems/workers.ts`, `sim/orders.ts`, `sim/world.ts`, `main.ts`.

### G29 — Tourbillon du Paladin (prototype)

- **Statut** : Active ; valeurs **provisoires** ; VFX provisoire.
- **Demande d'Antoine** (2026-11-03) : 15 mana, 5 s, une frappe par
  seconde à 75 % des dégâts d'attaque figés au lancement, rayon ≈ 2,25,
  déplacement autorisé, attaque et sorts bloqués, mort = arrêt.
- **Choix de la passe** :
  - frappes à 1, 2, 3, 4, 5 s (exactement 5 ; aucune au lancement) ;
  - portée mesurée jusqu'au **bord du corps** de la cible (2,25 + rayon) ;
  - **recharge de 15 s** à partir de la fin de l'effet (terminé ou mort),
    demande d'Antoine du 2026-11-03 (avant : aucune) ; case désactivée
    pendant la recharge (comme sans mana), la simulation refuse aussi
    (`'cooldown'`) ;
  - rotation à 5 tours/s et effet circulaire (arcs de taille, cercle de
    zone), demande d'Antoine du 2026-11-03 (« pas assez visuel ») ;
  - (remplacé par G42) la commande de lancement remplaçait l'ordre en
    cours : le Héros s'arrêtait ; depuis le 2026-11-05 l'ordre et le
    chemin sont conservés ;
  - à la fin, l'attaque de base peut reprendre dans le même pas que la
    dernière frappe ;
  - ramassage, coffres et dépôt sont aussi refusés pendant l'effet (même
    règle que le travail).
- **Sources** : `data/spells.ts`, `sim/systems/hero.ts`,
  `sim/systems/combat.ts`, `sim/orders.ts`, `render/whirlwindVfx.ts`,
  `render/unitViews.ts`, `main.ts`.

### G30 — Stock direct : bois et pierre comme l'or

- **Statut** : **Remplacée** le 2026-11-03, le jour même, par G32 (cargo
  économique) : le bois, la pierre et l'or de gisement sont de nouveau
  transportés ; seul l'or de butin reste une monnaie directe.
- **Demande d'Antoine** (2026-11-03) : le bois et la pierre n'ont plus besoin
  d'être stockés (déposés) ni empilés dans l'inventaire.
- **Choix de la passe** :
  - toute récolte (Héros, Villageois) crédite le stock à chaque unité ;
    tous les tas (bois, pierre, **or**) ramassés **en y allant** avec le
    Héros (geste de ramassage d'avant, tas entier crédité ; corrections
    d'Antoine du 2026-11-03 : rien à distance) ;
  - le sac ne contient plus que les équipements ;
  - **Villageois** : sa boucle « porter 5, déposer, revenir » (G28) est
    supprimée par cohérence (plus de dépôt) ; il récolte en continu ;
  - l'ordre `deposit` reste dans la simulation mais n'est plus émis par
    l'interface (KI-63).
- **Remplace** : l'or physique de G15 (déjà remplacé par G25), le transport
  et le dépôt de G15 et de G28.
- **Sources** : `sim/systems/hero.ts` (`HeroWorkContext.mined`),
  `sim/systems/workers.ts`, `sim/world.ts` (`minedEvents`, `collectPile`),
  `main.ts` (`creditStock`, `collectPile`, `creditMinedResources`).

### G32 — Cargo économique : inventaire RPG ≠ sac de ressources

- **Statut** : Active ; valeurs **provisoires** ; amendée le soir même par
  G33 (points de collecte spécialisés, chaînage des dépôts, inventaire RPG
  nettoyé, gestes du Villageois).
- **Demande d'Antoine** (2026-11-03) : distinguer les ressources économiques
  transportées (bois, pierre, or **extrait d'un gisement**) de l'or de
  butin (monnaie directe) ; ne pas remettre les ressources dans les 20
  cases de l'inventaire ; un sac de ressources séparé (Héros 10,
  Villageois 5, capacité totale) ; dépôt automatique au point de collecte
  le plus proche, retour à la source ; dépôt manuel ; points de collecte
  configurés par données (Baliste seule pour l'instant ; futurs Scierie et
  Camp de mineur non activés) ; pas de téléportation ; cargo perdu à la
  mort ; Villageois avec son propre modèle, sans arme, hache / pioche
  temporaires, aucune attaque.
- **Choix de la passe** :
  - un seul système (`sim/systems/cargo.ts`) pour le Héros et le Villageois,
    l'ancien dépôt du Héros (lié au sac RPG) remplacé plutôt que ressuscité ;
  - point de collecte choisi d'après la ressource la **plus portée** (à
    défaut la suivante, G33) ; les ressources non acceptées restent dans le
    cargo ;
  - source épuisée : dépôt **d'abord**, puis source voisine (Villageois) ou
    Garde (Héros) ; outil perdu : unité finie, dépôt, Garde ;
  - tout ordre manuel oublie la tâche à reprendre (cargo gardé) ;
  - mort : ressources perdues, pas de sac au sol (**PROVISOIRE**) ;
  - Villageois : dégâts 0 et aggro 0 (aucune attaque), clips Spearman, estoc
    = coup de hache / de pioche ; ramassage et dépôt sur le repos (G33).
- **Sources** : `data/resources.ts`, `data/buildings.ts` (`dropOff`),
  `data/units.ts`, `sim/entity.ts`, `sim/systems/cargo.ts`,
  `sim/systems/hero.ts`, `sim/systems/workers.ts`, `sim/world.ts`,
  `sim/orders.ts`, `render/toonUnitRig.ts`, `render/heroEquipmentView.ts`,
  `render/unitViews.ts`, `render/resourcePiles.ts`, `run/entityInfo.ts`,
  `ui/heroInventory.ts`, `main.ts`, `tools/toon-units/units.json`
  (`human_villager`).

### G33 — Points de collecte spécialisés et inventaire RPG sans ressource

- **Statut** : Active ; valeurs **provisoires**. **Ouvert** : la Baliste
  garde-t-elle son rôle de point universel une fois Scierie et Camp de
  mineur construits ? (décision d'Antoine, plus tard).
- **Demande d'Antoine** (2026-11-03, soir) : terminer KI-63 (plus aucune
  ressource économique comme `InventoryItem`, sans toucher à l'inventaire
  générique : équipements, butin, consommables, glisser-déposer) ; activer la
  Scierie (bois seul) et le Camp de mineur (pierre, or extrait) comme points
  de collecte, chantier exclu, bâtiment terminé allié seulement ; Baliste
  conservée comme point universel de départ ; choix du point valide le plus
  proche pour la ressource à déposer, par `BuildingDef.dropOff`, jamais par
  id ; cargo mixte : un point ne prend que ce qu'il accepte, dépôt
  automatique enchaîné jusqu'à cargo vide ou aucune destination (pas de
  blocage à 9 / 10) ; dépôt manuel refusé explicitement (« Aucune ressource
  acceptée »), jamais vidé en silence ; point détruit en chemin → suivant ;
  Villageois : estoc seulement pour couper et miner, geste neutre pour
  ramasser et déposer ; sac 3D du Villageois vérifié en gros plan ; fiche
  des bâtiments « Point de collecte : … » ; Forge = accès aux outils, sans
  mélange avec les points de collecte ; coûts, emprises, modèles, PV et
  réparation inchangés.
- **Direction officielle** : **Forge = accès aux outils** ; **Scierie =
  dépôt du bois** ; **Camp de mineur = dépôt de la pierre et de l'or
  extrait** ; **Baliste = dépôt universel de départ** ; **inventaire RPG ≠
  cargo économique**.
- **Choix de la passe** :
  - `sim/inventory.ts` ne connaît plus que des cases d'équipement
    (`InventorySlot` = item | null) ; `RESOURCE_ITEMS`, `CarriedResource`,
    `addResource`, `removeOneResource`, `resourceCount`, `roomFor`,
    `maxStackOf`, `carriedResourceTotal`, la fusion de piles de `moveSlot`,
    la case « ressource » de la fenêtre et son CSS, et
    `HarvestNodeKind.currency` sont retirés ; déplacer / échanger / équiper /
    retirer / ajouter inchangés ; KI-63 close ;
  - `dropOff` sur la Scierie (`['wood']`) et le Camp de mineur
    (`['stone', 'minedGold']`), rien d'autre dans leurs données ;
  - choix du point : pour chaque ressource portée, de la plus à la moins
    portée, le point allié terminé le plus proche qui l'accepte ; le premier
    trouvé gagne (une unité avec 6 pierre et 4 bois devant une Scierie seule
    y dépose son bois) ;
  - `CargoState.auto` distingue le dépôt de la boucle (chaînage) du dépôt
    manuel (un seul point) ; tout ordre manuel (`sim/orders.ts`) remet
    `returnTo` et `auto` à zéro ;
  - chaînage silencieux : une ressource sans point reste dans le cargo, la
    boucle de la source continue ; l'alerte « Aucun point de collecte pour
    déposer : … » ne sort que quand rien de ce qu'elle porte n'a de point ;
  - `heroWorkSystem` délègue au cargo **avant** son repli « cible perdue →
    Garde » (sinon le Héros passait en Garde au lieu de rejoindre le point
    suivant ; le Villageois le faisait déjà) ;
  - clic droit sur un point : l'ordre `deposit` ne part qu'aux unités qui
    portent une ressource acceptée ; message « Aucune ressource acceptée —
    Scierie : bois » ou « Rien à déposer » ;
  - fiche : ligne « Point de collecte » (Bois / Pierre, Or / Toutes
    ressources), aussi sur la Baliste ;
  - Villageois : rôles `gather` et `deposit` sur le clip `idle` (le set
    Spearman n'a pas de geste accroupi, aucune animation Blender créée) ;
    sac 3D observé en gros plan (vide : absent ; 3 / 5 et 5 / 5 : dans le
    dos, proportionné, sans traverser le corps) : aucun réglage propre au
    Villageois n'a été nécessaire, le sac du Héros est inchangé.
- **Sources** : `sim/inventory.ts`, `data/resources.ts`,
  `data/buildings.ts`, `sim/entity.ts`, `sim/world.ts`, `sim/orders.ts`,
  `sim/systems/cargo.ts`, `sim/systems/hero.ts`, `render/toonUnitRig.ts`,
  `run/entityInfo.ts`, `ui/heroInventory.ts`, `ui/style.css`, `main.ts`.

### G36 — Vitesse de déplacement ×1,4

- **Statut** : Active (2026-11-04) ; valeur **provisoire**.
- **Demande d'Antoine** : +40 % de vitesse de déplacement effective pour
  toutes les unités mobiles (Héros, Villageois, infanterie, archers, mages,
  cavalerie, neutres, barbares des camps, vagues), proportions conservées ;
  multiplicateur central plutôt qu'unité par unité ; bonus existants
  conservés ; ni attaque, ni sort, ni récolte, ni construction, ni
  projectile, ni recharge ; Héros inclus, sans croissance de vitesse après
  le niveau 3 ; animations de marche ajustées si besoin.
- **Choix de la passe** : `UNIT_MOVE_SPEED_MULTIPLIER = 1.4`
  (`data/units.ts`), appliqué à la vitesse finale quand la simulation
  résout les stats d'une entité (`World.spawn`, `refreshHeroStats`) ; les
  données gardent leurs valeurs de base ; clip `walk` et cycle
  procédural accélérés d'autant ; Charge du Cavalier inchangée (vitesse
  propre). Mesuré : vitesse réelle ×1,40 (7 unités, joueur, neutres,
  vague), même distance d'arrêt qu'avant, aucun dépassement, aucune
  oscillation, palissade jamais traversée.
- **Effet de jeu** : vagues et gardes arrivent aussi plus vite ; la
  première vague, les allers-retours de récolte et l'exploration sont plus
  courts. Change le rythme : à rejouer.
- **Sources** : `data/units.ts`, `sim/world.ts`, `sim/systems/hero.ts`,
  `run/entityInfo.ts`, `render/unitViews.ts`.

### G37 — Bois et pierre récoltables dès le départ

- **Statut** : Active (2026-11-04) ; **tranchée le 2026-11-05** (G41,
  décision d'Antoine) : l'**or des gisements est libre** lui aussi.
- **Demande d'Antoine** : la Forge ne débloque plus la coupe du bois ni
  l'extraction de la pierre ; Héros et Villageois ont hache et pioche dès le
  début ; plus de message « il faut une Forge » pour un arbre ou un
  gisement de pierre ; l'or extrait garde sa règle actuelle ; ne pas
  inventer de nouvelle fonction à la Forge.
- **Choix de la passe (2026-11-04, remplacé)** : `STARTING_HARVEST_TOOLS` =
  hache + pioche de mineur ; le gisement d'or demandait une Pioche de
  prospecteur donnée par la Forge.
- **Décision (2026-11-05)** : la Forge ne conditionne plus l'exploitation
  des gisements d'or ; Héros et Villageois les exploitent dès le début avec
  la pioche ordinaire. `goldPickaxe`, `BuildingDef.unlocksTools`,
  `run/harvestPermissions.ts`, l'annonce « Nouvel outil » et le message
  « il faut une Forge » sont retirés. La Forge devient entièrement
  militaire / technologique (G41).
- **Sources** : `data/resources.ts`, `data/buildings.ts`, `sim/world.ts`,
  `main.ts`.

### G38 — Départ Survie = petit camp joueur préconstruit

- **Statut** : Active (2026-11-04) ; composition et dimensions
  **provisoires**.
- **Demande d'Antoine** : commencer dans un petit camp construit autour du
  Départ Survie : Baliste, Auberge, deux Maisons (A et B), deux Villageois,
  petite enceinte de Palissade V2 avec une porte ouverte ; tout construit,
  gratuit, stock inchangé ; donnée sémantique (preset) dérivée plutôt que
  des objets sérialisés ; architecture extensible (autres presets plus
  tard, sans interface pour l'instant) ; aperçu de l'emprise dans
  l'éditeur ; même camp dans « Tester le scénario » ; caméra sur le Héros ;
  défaite inchangée (Baliste).
- **Choix de la passe** :
  - `STARTING_BASE_PRESETS` (`config/startingBase.ts`, preset
    `basic-camp`), `MapDef.startingBase = { preset, rotation }` ; défaut
    pour une carte de Survie sans champ ; `none` = aucun camp ;
  - layout : Baliste au centre, Maison A au nord-ouest, Maison B à
    l'ouest, Auberge à l'est (toutes contre l'enceinte), cour au sud, porte
    au milieu du côté sud (repère local) ; la rotation (quart de tour)
    ouvre la porte vers le côté le plus dégagé (générateur ; éditeur à
    chaque pose du Départ) ;
  - **enceinte arrondie** (addendum du 2026-11-04, à la place du rectangle
    de 15 × 11 cases) : dodécagone régulier de rayon 10,5 cases dérivé de
    `enclosure = { sides, radius, gateLength }`, soit un diamètre de 21,
    environ 330 cases dedans (165 avant) et 25 pièces (22 segments de
    2,7 cases, deux bouts de 1,5 et une porte de 2,4 posée ouverte) ;
    douze côtés car un quart de tour ramène le polygone sur lui-même ;
    les bâtiments restent à plus de 1,6 case des murs ; environ 310
    cases libres pour les constructions suivantes, sans sortir de
    l'enceinte ; zone réservée = disque de rayon 12,5 (enceinte + 2) ;
  - en run, les bâtiments deviennent des bâtiments **possédés** (fiche,
    production, amélioration, réparation, destruction) et les Villageois
    entrent dans l'armée ; l'enceinte vient des murs de la carte ;
  - éditeur : emprise complète (disque : enceinte + 2 cases) validée pour
    le Départ ; aucun camp neutre dedans ; camp neutre à 17 cases au moins
    du Départ (14 avant : le disque réservé plus la clairière d'un camp
    font 16) ;
  - le générateur réserve l'emprise de toutes les rotations.
- **Effet de jeu** : début de partie plus rapide et plus « base » (deux
  ouvriers, 4 places de population de plus, Auberge immédiate) ; à
  rejouer.
- **Plus tard** : départ minimal, départ fortifié, autre faction, choix du
  preset.
- **Sources** : `config/startingBase.ts`, `config/mapDef.ts`,
  `config/maps/proceduralSurvival.ts`, `main.ts`, `editor/editorState.ts`,
  `editor/mapSerializer.ts`.

### G39 — Générateur : aucun passage d'une case (KI-65)

- **Statut** : Active (2026-11-04).
- **Constat** : la grille A* ne connaît pas le rayon des corps ; un passage
  d'une case lui paraît praticable alors que le Héros (rayon 0,6) n'y passe
  pas et oscille. Trois sources sur les cartes générées : gisement posé
  avec une seule case libre contre un arbre (KI-65), arbre contre le flanc
  d'une rampe, baril de camp contre une falaise.
- **Choix de la passe** : gisements posés avant une seconde mise en forme
  des forêts qui les traite en obstacles fixes (goulets élargis en
  retirant des arbres, poches reliées) ; deux cases sans eau, relief,
  rampe ni autre gisement autour ; flanc de rampe compté comme mur dans la
  détection des goulets ; abords stricts des camps neutres ; connexité
  recalculée avec les gisements ; densité gardée par déplacement local des
  candidats. Mesuré sur 12 graines : 312 / 312 gisements de pierre, 72 / 72
  d'or, 24 camps, 457 tas contre 458, −3,9 % d'arbres, génération ~250 ms
  (~140 avant).
- **Limite** : un passage d'une case posé à la main dans l'éditeur reste
  possible (KI-66).

### G40 — Passe de modernisation 1 : retrait du legacy de la boucle en manches

- **Statut** : Active (2026-11-04).
- **Contexte** : depuis G10 (temps réel continu), la Survie n'empruntait
  plus la boucle préparation → bataille → fin de manche, mais tout son code
  restait : `main.ts` à 10 536 lignes, 32 `inPlacementPhase`, une Boutique
  masquée, un inventaire de parchemins masqué, un agrandissement désactivé,
  un quota de production « par manche » encore appliqué, quatre talents
  sans effet possible. L'audit préalable (rapport Fable 5.1) l'a listé.
- **Demande d'Antoine** : retirer ce qui est clairement mort ou trompeur,
  sans changer l'équilibrage général, sans refaire `sim/`, sans toucher à
  Cargo, Camps, Palissade V2, StartingBase, MapDef, Éditeur de Survie ni
  au pipeline de stats du Héros ; mettre d'abord un filet de sécurité
  (tests dans le dépôt).
- **Retiré** : phase de placement (emplacements, aperçus, panneau « Prêt
  pour la bataille », avertissement d'or restant) ; Boutique de run
  (achat ×1 / ×5, annulation, vente, onglets, « +100 or ») ; parchemins de
  bataille et inventaire de run (`data/items.ts`, `RunState.inventory`,
  barre d'inventaire, armement) avec leurs primitives de simulation
  (zones persistantes, projectiles d'ombre, `applyIceNovaRoot`) ; écran
  de fin de manche et bilan (`run/battleSummary.ts`) ; agrandissement de
  la carte (`run/mapExpansion.ts`, E4) ; quota gratuit « par manche »
  (`UnitProductionConfig`, `unitsProducedPerWave`) ; améliorations de
  parchemins de l'Église puis du Sanctuaire ; talents Aux petits oignons,
  Blizzard, Soins excédentaires et Recyclage (remboursés,
  `REMOVED_TALENT_REFUNDS`) ; HUD d'or et de population séparés, zone
  « Vendre », toast « Unité débloquée », `run/population.ts`,
  `run/recruitment.ts`, `render/iceNova.ts`, `render/recyclageAura.ts`,
  `render/shadowProjectileView.ts`.
- **Conservé** : l'inventaire RPG du Héros et l'Éditeur d'items ; les
  sorts du Héros ; la Forge (unités + Baliste) ; le Sanctuaire (Mage,
  Niv. 2) ; l'architecture de l'arbre de talents et ses 5 talents ;
  `Entity.rootTimer` (statut générique sans source) ; `countsForDefeat`
  (information) ; le pas d'ouverture `openBattleWithFormationStep` au
  démarrage (candidat au retrait, KI-68) et l'enregistrement du déblocage
  par victoire (C4, KI-67) — tous deux retirés ensuite par G41 (2026-11-05).
- **Corrigé au passage** (bugs latents révélés par le retrait) : la Forge
  refusait tout achat en Survie (garde de préparation) ; le point de
  ralliement était refusé sur l'Auberge, le Sanctuaire, l'Église et
  l'Écurie (garde sur `production` au lieu de `recruitmentUnlock`) ; la
  Forge n'était pas déclarée `runUpgradeSite: 'forge'`.
- **Changements de ressenti signalés** : plus d'unité gratuite au début
  d'une vague (le quota « par manche ») ; le Camp d'archerie n'est plus
  améliorable (son Niv. 2 ne faisait que doubler ce quota ; à redéfinir
  en Pass 2, KI-69) ; plus de revente d'unités.
- **Filet de sécurité** : `arrow-tactics/tests/` (`npm run test:sim`,
  `npm run test:game`, `npm test`), scripts repris des passes précédentes
  plus `tests/sim/modernisation.mts`, `tests/game/forge-jeu.cjs` et
  `tests/game/defaite-jeu.cjs` ; voir `ARCHITECTURE.md` §17.
- **Mesure** : `main.ts` 10 536 → 8 068 lignes, `inPlacementPhase` 32 → 0
  (une mention en commentaire), `ui/screens.ts` 2 333 → 1 173,
  `ui/style.css` 4 025 → 3 487.
- **À ne pas faire** : ne pas réintroduire une phase de préparation, une
  Boutique globale ou un quota gratuit par vague sans décision explicite ;
  ne pas reprendre les parchemins depuis le code supprimé sans repenser
  leur place (G10, `GAME_DESIGN.md` §7).
- **Sources** : `main.ts` (`startSurvivalWorld`, `endSurvivalRun`,
  `realtimeBuildingAction`), `run/runState.ts`, `run/runUpgrades.ts`,
  `run/metaProgress.ts`, `data/talents.ts`, `data/buildings.ts`,
  `sim/world.ts`, `tests/`.

### G41 — Passe de modernisation 2 : modèle d'améliorations du Hero RTS

- **Statut** : Active (2026-11-05). Toutes les valeurs sont
  **PROVISOIRES**.
- **Contexte** : après G40, la Forge restait une boutique d'améliorations
  par type d'unité (niveaux de production non rétroactifs, surcoût de
  recrutement, écran modal qui figeait le jeu), le Camp d'archerie n'avait
  plus de Niv. 2, le Sanctuaire et l'Écurie un Niv. 2 placeholder (+5 PV du
  bâtiment), l'Église un soin instantané de toute l'armée contre de l'or,
  l'or des gisements dépendait de la Forge (G37 ouvert), le démarrage
  gardait un pas d'ouverture (KI-68) et le déblocage par victoire était
  enregistré sans consommateur (KI-67).
- **Décisions d'Antoine** :
  - **Forge = technologies militaires globales** : « Armes forgées I »
    (+10 % dégâts) et « Armures forgées I » (+10 % PV max) pour toutes les
    unités militaires, présentes et futures ; jamais le Héros, le
    Villageois, la Baliste ni les bâtiments ; un seul palier chacune (II /
    III possibles plus tard, non implémentés) ; coûts 20 or + stock, 30 s ;
  - **améliorations spécifiques = bâtiment producteur**, un seul niveau par
    type, global à la run, rétroactif : Camp d'archerie Niv. 2 → Archers
    +2 PV, +1 dégâts (KI-69 close) ; Sanctuaire Niv. 2 → Mages +3 PV, +2
    Boule de feu ; Écurie Niv. 2 → Cavaliers +5 PV, +5 % vitesse (dans la
    chaîne normale des stats, avant le ×1,4 global) ; Caserne Niv. 2 →
    Homme d'armes, plus la technologie « Entraînement des hommes d’armes »
    (+3 PV, +1 dégâts, 7 or : l'ancien niveau de Forge, sans surcoût de
    recrutement) ;
  - **Héros = progression séparée** (niveau, équipement, futur arbre) ;
  - **or naturel exploitable dès le départ** (G37 tranchée) ;
  - **toutes les recherches en temps réel**, par la file de production du
    bâtiment (commande `research`, mêmes règles que les unités : payée à
    la commande, annulable, perdue avec le bâtiment sans remboursement) ;
    une technologie terminée reste acquise ; deux Forges partagent la
    recherche ; aucun écran ne fige le jeu (écran de la Forge retiré) ;
    Mine et Tour passent aussi par la file (20 s) ;
  - **Baliste** : amélioration depuis sa propre fiche, par sa file ; valeurs
    inchangées ; **plafond Niv. 5** (4 améliorations, `maxLevel` = 4,
    provisoire ; finalisation du 2026-11-05) : « Niveau maximum atteint »,
    aucune commande acceptée au-delà ;
  - **Église** : soin instantané de l'armée retiré (rythme de l'ancien jeu
    en manches ; Paladin, Oracle et futurs supports) ; son Niv. 2 (+5 PV du
    bâtiment) retiré lui aussi (finalisation du 2026-11-05) : bâtiment de
    production seul (Oracle, Vengeur), progression à redéfinir plus tard
    avec le gameplay soutien ;
  - **une seule hiérarchie de stats** : base + niveau explicite éventuel
    + niveau du producteur + technologies = stats finales ; le coût de
    recrutement ne dépend jamais de la puissance (l'ancien modèle
    « plus fort et plus cher » est abandonné) ; `Entity.level` reste une
    donnée sans scaling ;
  - **démarrage direct** (KI-68 close) et **déblocage par victoire retiré**
    (KI-67 close, C4) ; la Sentinelle reste dormante.
- **Retiré** : `openBattleWithFormationStep` ; `playerUnlockMode`,
  `defeatedEnemyUnitIds`, `registerEnemyDefeat`, `canPlayerRecruitUnit`,
  migration `unlockedUnits` ; `data/unitUpgrades.ts` (partie joueur),
  `OwnedUnit.productionLevel`, surcoût de recrutement ; écran de la Forge
  (`unitUpgradeShop`, CSS, handlers), `purchaseRunUpgrade` ;
  `run/churchHeal.ts`, `armyHeal`, action `healArmy` ; `goldPickaxe`,
  `unlocksTools`, `run/harvestPermissions.ts`, annonce et message
  « il faut une Forge » ; `hpPerLevel` du Sanctuaire et de l'Écurie ;
  amélioration instantanée des bâtiments.
- **Ajouté** : `data/technologies.ts`, `data/unitBonus.ts`,
  `BuildingDef.upgradeScope` / `rosterBonusPerLevel`, `UnitDef.hero`,
  `isMilitaryUnit` ; `run/technologies.ts`, `run/productionOrders.ts`
  (source unique des commandes), `run/playerUnitStats.ts` réécrit
  (`computePlayerUnitStats`), `run/buildingUpgrades.ts` réécrit
  (portées) ; commande `research` et événements typés dans
  `sim/systems/buildingProduction.ts`, `World.applyUnitStats` (PV à la
  même fraction) et `World.applyBuildingStats` ; fiches (`research`,
  `upgradeBallista`, lignes « Terminé / En recherche », « Niv. 2 |
  Archers : +2 PV, +1 dégâts », « débloque : Homme d’armes »).
- **Renommé** : `data/unitUpgrades.ts` → `data/enemyWaveUpgrades.ts`,
  `run/unitUpgradeEffects.ts` → `run/enemyWaveEffects.ts` (renfort des
  vagues, inchangé).
- **Changements de ressenti signalés** : les améliorations deviennent
  rétroactives (unités présentes incluses) ; plus de surcoût de
  recrutement ; Mine et Tour s'améliorent en 20 s au lieu d'instantanément
  ; le soin de l'Église disparaît ; l'or des gisements est disponible dès
  le départ ; la Forge coûte toujours 10 or / 5 bois / 5 pierre mais n'a
  d'intérêt qu'avec une armée militaire.
- **Filet de sécurité** : `tests/sim/technologies.mts` (données, Forge,
  destruction, deux Forges, producteurs, Caserne, Baliste, file unique,
  Héros / Villageois exclus), `tests/game/forge-jeu.cjs` réécrit (fiche de
  la Forge, recherche en jeu sans écran, Archer présent amélioré, Baliste
  et Camp d'archerie depuis leurs fiches) ; `modernisation.mts`,
  `depart-camp.mts`, `cargo.mts`, `collecte.mts`, `depart-jeu.cjs`
  adaptés aux décisions (or libre, Forge sans outil).
- **À ne pas faire** : ne pas remettre d'amélioration par type d'unité à
  la Forge ; ne pas créer de niveaux infinis de technologie (I → II → III
  se déclarent une entrée à la fois) ; ne pas figer la simulation pour une
  commande ; ne pas lier la puissance au coût de recrutement ; ne rien
  inventer pour la Sentinelle ni un arbre pour l'Église sans décision.
- **Sources** : `data/technologies.ts`, `data/unitBonus.ts`,
  `data/buildings.ts`, `data/units.ts`, `data/resources.ts`,
  `run/productionOrders.ts`, `run/playerUnitStats.ts`,
  `run/buildingUpgrades.ts`, `run/technologies.ts`, `run/runUpgrades.ts`,
  `run/entityInfo.ts`, `sim/world.ts`, `sim/systems/buildingProduction.ts`,
  `main.ts`, `CURRENT_STATE.md` §2, §4, §6 et §14, `tests/`.

### G35 — Dépôt des ressources instantané

- **Statut** : Active (2026-11-04).
- **Demande d'Antoine** : supprimer la temporisation du dépôt (1 unité /
  0,5 s) : à l'arrivée à un point de collecte valide, tout ce qu'il accepte
  est transféré **immédiatement** (Villageois avec 5 bois à la Scierie →
  +5 bois d'un coup ; Héros avec 3 pierre + 2 or au Camp de mineur → +5
  d'un coup). Aucune barre ni attente. Toutes les autres règles restent
  (acceptation par point, dépôt partiel, cargo mixte, chaînage, retour à la
  source, dépôt manuel, reroutage).
- **Choix de la passe** : `DEPOSIT_SECONDS_PER_ITEM` supprimé
  (`data/hero.ts`) ; `cargoWork` transfère au premier pas au contact, un
  évènement `cargoDeposit` par ressource avec sa quantité ; le geste
  `deposit` n'existe plus (`working` sans `'deposit'` ; le rôle d'animation
  reste défini dans les kits, inutilisé) ; la barre d'action du Héros n'a
  plus de cas « dépôt ».
- **Sources** : `sim/systems/cargo.ts`, `data/hero.ts`, `sim/entity.ts`,
  `main.ts`.

### G31 — Caméra de jeu verrouillée sur le Héros (essai retiré)

- **Statut** : **Retirée** le 2026-11-03, le jour même (demande d'Antoine :
  « avec un peu de recul, repasse sur la vue RTS libre »). Le code est
  revenu à la caméra libre d'avant (suivi du Héros lâché par les bords ou
  le pan, zoom et inclinaison libres, Maj + clic droit pour pivoter).
- **Essai** : suivi jamais lâché, vue figée (hauteur 18, inclinaison 28°),
  rotation seule au clic droit maintenu + glisser. Rien n'en reste dans
  le code.

### G27 — Éditeur : maps authored, procédurales et hybrides

- **Statut** : Direction **active** (demande d'Antoine, 2026-11-03) ;
  génération dans l'éditeur **faite** le 2026-11-03. Le mode de carte
  définitif de la Survie reste **Ouvert** (décision d'Antoine).
- **Direction** : l'éditeur doit permettre une carte dessinée (authored),
  une carte générée (procédurale, le vrai générateur de la Survie, graine
  modifiable) et une carte générée puis retouchée à la main (hybride) ; la
  carte vide, le chargement et l'édition manuelle restent.
- **Choix de la passe** : le vrai générateur est appelé (aucune copie) ;
  la carte générée est une MapDef ordinaire enregistrée avec son état
  concret, la graine n'étant qu'une métadonnée ; la carte décrit le monde,
  jamais l'état d'une partie (Héros, vagues, minuteurs) ; génération =
  nouveau point de départ de l'historique ; tas et barils posables ; camps
  posables, déplaçables et à niveau depuis G34 (2026-11-04).

### G34 — Éditeur de Survie : camps authorables, Départ Survie, validation

- **Statut** : Active ; valeurs **provisoires** (distances, rayon des
  abords, niveau par défaut).
- **Demande d'Antoine** (2026-11-04) : faire de l'éditeur un vrai outil de
  création de cartes de Survie : camps (Petit / Grand, rosters existants)
  posables, un **camp = un seul objet logique** (type, position, niveau,
  données de reconstruction ; gardes, coffre, feu, tente, barils et décor
  dérivés), architecture **partagée** avec le générateur (pas de copie),
  sélection par n'importe quelle pièce, déplacement d'un bloc validé,
  suppression entière avec Ctrl+Z, **niveau** (1 par défaut) qui circule
  jusqu'aux gardes, override futur par unité préparé sans interface, camps
  procéduraux inchangés (niveau 1, pas de « distance = niveau »),
  **Départ Survie** explicite (position de la Baliste, le Héros à côté, un
  seul, remplaçable, validé), carte vierge réellement vierge, validation
  légère (erreurs bloquantes, avertissements), sauvegarde / rechargement
  sans déplacement, panneau de statistiques vivant, propriété claire des
  décors (un décor posé à la main à côté n'est pas supprimé avec le camp),
  même pipeline pour « Tester le scénario » ; pas de scaling de
  difficulté ; pas de retouche de l'économie.
- **Direction officielle** : **Map Survie = authored, procédurale ou
  hybride** ; **Camp = objet sémantique authorable avec niveau** ;
  **Départ Survie = donnée explicite de la carte**.
- **Choix de la passe** :
  - `MapCampDef` réduit à `{ kind, x, z, level?, facing?, guardOverrides? }` ;
    `campLayoutOf` (`data/campLayout.ts`) dérive rayon, coffre, postes,
    décor et barils — **géométrie identique** à celle du générateur du
    2026-11-02 (vérifié sur la graine 12345) ; le générateur n'écrit plus
    de décor de camp, `expandMapCamps` l'ajoute à la consommation ;
  - propriété : le décor et les barils d'un camp n'existent **que** par
    dérivation (jamais dans la carte) ; un décor ou un baril posé à part
    est indépendant. Les deux petits tas près d'un camp généré restent des
    tas indépendants ;
  - anciens fichiers : type, centre et niveau repris, décor et barils de la
    clairière retirés au chargement (avertissement console) ;
  - validation de pose (`campPlacementIssue`) : mêmes critères que le
    générateur, sans sa connexité exacte (les « abords ouverts » remplacent
    le test de liaison à la Baliste) ; écarts provisoires : 10 cases entre
    camps à la main (20 au générateur), 17 cases au Départ (14 avant le
    camp de départ arrondi), 12 cases libres
    dans la couronne ; un arbre dans la clairière est refusé (le générateur
    en abattait jusqu'à 4) ;
  - Départ Survie = le champ `ballista` existant, outil dédié, marqueur
    bleu, **territoire joueur plus exigé** (une carte dessinée pose son
    départ avant de peindre) ; la Baliste n'est affichée que posée ;
    « Nouvelle carte » = disque vierge de 96 × 96, règles `hero-rts`, sans
    Départ (la carte 18 × 26 historique disparaît) ;
  - orientation : dos du camp à l'opposé du Départ (générateur : de
    l'origine) ; un camp déplacé garde son orientation ;
  - « Tester le scénario » : validation bloquante, Héros à côté du Départ,
    fin seulement par la défaite ou Échap sur une carte `hero-rts` (les
    gardes ne comptent pas) ;
  - niveau des gardes : `resolveUnitLevel(guardOverrides[i].level,
    camp.level)` ; aucune formule de difficulté, aucun scaling.
- **Ouvert** : scaling par niveau (G20), difficulté procédurale,
  `survivalRules` et niveaux des unités dans l'interface (KI-52), un
  troisième type de camp, la Baliste comme Départ définitif ou non.
- **Sources** : `config/mapDef.ts`, `data/camps.ts`, `data/campLayout.ts`,
  `config/maps/proceduralSurvival.ts`, `config/maps/blankMap.ts`,
  `run/camps.ts`, `editor/editorState.ts`, `editor/editorUI.ts`,
  `editor/mapSerializer.ts`, `main.ts`, `ui/style.css`.

---

### G42 — Passe gameplay du 2026-11-05 : Villageois autonomes, Tourbillon, or au contact, porte, gisements du camp

- **Statut** : Active (2026-11-05). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-05) :
  - **Villageois idle > 1 s → travail autonome**, priorité à la ressource
    **la moins travaillée** par les autres Villageois (bois, pierre, or ;
    comptés en récolte, dépôt ou retour vers cette ressource ; jamais le
    Héros ni un Villageois libre) ; égalités : source valide la plus
    proche, puis identifiant ; déterministe, sans `Math.random` ; aucun
    rééquilibrage une fois affecté (il garde son cycle) ; tout ordre du
    joueur reste prioritaire, autonomie 1 s après sa fin ; sans source :
    inactif, nouvel essai périodique seulement ;
  - **Tourbillon compatible avec le déplacement** : lancé sans
    interrompre l'ordre en cours (ordre et chemin conservés, aucun
    `move` recréé), tout le reste inchangé (5 s, mobile, mort = fin,
    recharge 15 s à la fin, snapshot, rayon 2,25, cibles, blocages des
    autres actions) ; **10 tics / 5 s** (toutes les 0,5 s, aucun à t = 0),
    **35 %** des dégâts d'attaque figés par tic (350 % sur la durée ;
    avant : 5 × 75 %) ; **flash blanc normal sur chaque cible à chaque
    tic** (pipeline de dégâts normal, pas de hack de rendu) ; VFX conservé
    (pulse au rythme des tics) ;
  - **or de butin : ramassage automatique du Héros au contact** (corps +
    rayon de collecte), monnaie créditée aussitôt, pile supprimée ; plus
    de geste de 0,6 s, ni barre, ni ordre obligatoire (un clic droit sur
    la pile n'y envoie que le Héros) ; seul le Héros (les Villageois ne
    détournent pas leur boucle) ; l'or **extrait** d'un gisement reste du
    cargo (`minedGold` → dépôt) ;
  - **Porte de palissade refaite** : nouveau visuel simple, bois brut,
    pieux verticaux, traverses et écharpe, **sans arche ni poutre haute**
    (dessus ouvert entre deux montants), **deux vrais vantaux** gauche /
    droite, aucune face miroir ; règles de jeu intactes (collision,
    ouverture, fermeture, passage allié, blocage ennemi, construction,
    réparation, PV, largeur) ; animation et pivots conservés ;
  - **camp de départ : pierre + or garantis dans l'enceinte**, accessibles
    tout de suite, vers la périphérie intérieure, hors bâtiments / Baliste
    / porte / places d'apparition / axe de la porte, sans se chevaucher ni
    gêner la circulation ni la construction ; dérivés du preset
    `basic-camp` (même source de vérité que la Baliste, l'Auberge, les
    Maisons, les Villageois et la Palissade), **jamais écrits dans les
    maps** (aucun doublon à l'export, au rechargement, en « Tester le
    scénario ») ; même chose en run, en test et dans l'aperçu de
    l'éditeur, où ils suivent le Départ ; gisements ordinaires (quantité,
    cargo, épuisement, gravats, cases libérées).
- **Choix de la passe** :
  - `WorkerState.idleSeconds / autoRetryIn / autoNodeId / autoWorked` ;
    `WORKER_IDLE_SECONDS` = 1, `WORKER_AUTO_RETRY_SECONDS` = 5 ; une source
    choisie qui n'a rien donné est évitée à l'essai suivant (seule
    protection contre une source injoignable, sans pathfinding
    spéculatif) ; un Stop du joueur compte comme un ordre terminé ;
  - `HeroState.pendingWhirlwind` posé par `applyCommands`, démarré par
    `heroWhirlwindSystem` au même pas (après les frappes du pas : la
    première frappe tombe exactement 0,5 s après le lancement) ;
  - or au contact dans `heroWorkSystem` (avant tout travail), portée
    `rayon + PICKUP_REACH` (0,5) ; `cargoWork` ne ramasse plus l'or ;
  - porte : `GATE_POST_HEIGHT` 1,42, vantaux de pieux (rayon 0,07,
    hauteur 0,95) ; le vantail droit s'étend vers −X dans son repère au
    lieu d'être tourné de π ;
  - gisements du camp : `preset.deposits` (pierre à (4,5 ; −5,5), or à
    (−4,5 ; 5,5) en local, coins à ≈ 8,5 cases du centre, ≈ 1,6 case libre
    devant l'enceinte, aucun passage d'une case), `expandStartingBase`
    remplace `expandStartingBaseWalls` ; l'éditeur compte leurs cases dans
    la validation du Départ.
- **Changements de ressenti signalés** : les Villageois de départ se
  mettent au travail seuls (bois d'abord s'il est le plus proche, puis
  pierre et or) ; le Tourbillon frappe plus souvent et moins fort (total
  350 % au lieu de 375 %) et ne stoppe plus le Héros ; l'or se ramasse en
  passant ; deux gisements de plus près de la Baliste au départ (25 or et
  40 pierre en plus, à portée immédiate ; 250 / 250 depuis G43).
- **Filet de sécurité** : `tests/sim/villageois-autonomie.mts`,
  `tests/sim/or-butin.mts`, `tests/sim/tourbillon.mts` (mis à jour : 10
  tics, lancement en marchant), `tests/sim/depart-camp.mts` (gisements
  garantis, 12 graines), `tests/sim/cargo.mts` (fenêtres d'observation
  sous 1 s) ; en jeu : `tests/game/porte-jeu.cjs` (structure, captures),
  `tests/game/tourbillon-jeu.cjs` (flash par cible, déplacement conservé),
  `tests/game/depart-jeu.cjs` et `tests/game/editeur-procedural.cjs`
  (gisements du camp, aperçu, déplacement du Départ, sauvegarde).
- **À ne pas faire** : ne pas faire changer de ressource un Villageois en
  cours de cycle ; ne pas recréer d'ordre `move` au lancement du
  Tourbillon ; ne pas faire ramasser l'or de butin par les Villageois ; ne
  pas écrire les gisements du camp dans une `MapDef` ; ne pas remettre de
  linteau à la porte.
- **Sources** : `sim/systems/workers.ts`, `sim/systems/hero.ts`,
  `sim/systems/cargo.ts`, `sim/orders.ts`, `sim/entity.ts`,
  `data/spells.ts`, `data/hero.ts`, `render/palisade.ts`,
  `config/startingBase.ts`, `editor/editorState.ts`, `main.ts`,
  `CURRENT_STATE.md` §6 bis, §6 nonies, §6 decies, §6 octies, §6
  duodecies, `ARCHITECTURE.md` §13 decies, §13 sedecies.

### G43 — Passe corrective du 2026-11-05 : autonomie visible, récolte au contact, gestes de travail, quantités, bosquet du camp

- **Statut** : Active (2026-11-05). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-05) :
  - **autonomie des Villageois limitée aux ressources visibles** : un
    Villageois inactif ne choisit qu'une source actuellement visible, avec
    la même vérité que le jeu (brouillard de guerre du rendu, résolu par
    l'orchestration dans `World.visibility`), sans second système de
    vision ni « radar économique » ; une ressource sans source visible ne
    participe pas au minimum ; une fois affecté, perdre la vision ne fait
    pas lâcher le travail ; ordres du joueur toujours prioritaires ; les
    ressources du camp attirent les Villageois naturellement (visibilité,
    compte, distance), sans priorité artificielle ;
  - **récolte au contact visuellement crédible** : le Villageois travaille
    presque collé au bord de la source (bord du corps à ≤ 0,3 case du bord
    géométrique de l'arbre 1 × 1 ou du gisement 2 × 2), via un point
    d'approche sur un **côté** de la source (jamais le coin, jamais le
    centre), sans frapper de loin, sans entrer dans le rocher, sans
    oscillation ; la portée du Héros (0,7) n'est pas touchée (portée
    centralisée par unité dans `workGoal`) ;
  - **le Villageois regarde toujours sa source pendant le travail** : cap
    du rendu calculé vers la source au début du geste et gardé, sans
    tremblement ; ni direction de marche, ni `forwardDir`, ni animation ne
    l'écrasent ;
  - **animation worker descendante, plus d'estoc de lance** : hache = outil
    levé puis coup vers le tronc, pioche = coup descendant vers le
    gisement ; clips retenus : `workingA` (coup vertical debout) et
    `workingB` (coup penché vers le sol) du GLB du Héros, prêtés au rig du
    Villageois (même squelette, 29 os ciblés tous présents) ; cadence 0,65
    pour suivre le rythme de récolte (≈ 1,4 s par coup, 1 unité / 1,5 s ;
    depuis G44 : cadence calculée depuis le temps par unité) ;
    outils inchangés (mains vides hors travail, hache / pioche retirées à
    la fin, sac de cargo indépendant) ; aucune chaîne Blender ;
  - **arbre = 75 bois**, **gisement de pierre = 250**, **gisement d'or =
    250** (`HARVEST_NODE_KINDS`, seule source de vérité ; tas au sol et
    règles d'épuisement inchangés) ;
  - **StartingBase = bosquet garanti d'au moins 6 arbres + pierre + or** :
    7 arbres groupés (amas irrégulier) près d'un bord intérieur, hors
    cour, porte, axe principal, Baliste, Auberge, Maisons, gisements et
    places d'apparition ; dérivés du preset `basic-camp` (ni codés dans
    `main.ts`, ni sérialisés), identiques en run, en « Tester le
    scénario » et dans l'aperçu de l'éditeur, où ils suivent le Départ ;
    validation et générateur réservent leurs cases ; navigation du camp
    préservée (aucun passage d'une case).
- **Choix de la passe** :
  - `World.visibility` (null = tout visible) posée par `main.ts` avant
    `world.step` (`fogActive() ? fogOfWar.isVisible : null`),
    `HeroWorkContext.isVisible`, filtre dans `chooseWork` ;
  - `WORKER_HARVEST_REACH` = 0,3 ; `HARVEST_STAND_GAP` = 0,15 ;
    `workGoal` rend `box`, `harvestStandPoint` dans `movementSystem` ;
    le Héros profite aussi du point d'approche (il n'oscille plus en
    diagonale) avec sa portée inchangée ; **aucun repli** : une source sans
    côté libre n'a aucun point de travail, l'ordre s'arrête au premier pas
    (manuel : événement `unreachable`, message « Aucun accès à cette
    ressource » ; autonome : abandon silencieux, source évitée, autre
    source choisie) ; ramassage et dépôt restent sur la pose de repos
    (décision d'Antoine, polish animation worker en parking) ;
  - `UnitViews.setWorkTargetResolver` + `renderedFacing` ; `ClipRole.from`
    + `clipsOfFile` dans `toonUnitRig.ts` ;
  - bosquet : `preset.trees` = (−2, −8) (−1, −8) (0, −8) (1, −8) (−2, −7)
    (−1, −7) (0, −7) en local (deux rangs décalés, 4 + 3), à 2 cases de la
    Maison A et du gisement de pierre, ≈ 1,6 case de l'enceinte ;
    `startingBaseObstacles` remplace `startingBaseDepositObstacles`.
- **Changements de ressenti signalés** : les Villageois n'explorent plus
  « à l'aveugle » (sans source visible, ils attendent) ; ils coupent et
  minent collés à la source, face à elle, avec de vrais coups de hache /
  pioche ; les sources durent beaucoup plus longtemps (×3,75 pour le bois,
  ×6,25 pierre, ×10 or : 525 bois + 250 pierre + 250 or disponibles dans
  l'enceinte dès le départ) ; le camp de départ est plus boisé.
- **Filet de sécurité** : `tests/sim/villageois-autonomie.mts` (sections 7
  à 9 : visibilité, portée, quantités / décompte / épuisement / tas),
  `tests/sim/depart-camp.mts` (bosquet : géométrie 4 rotations, 12 graines,
  chaque source atteinte, aucun passage d'une case) ; en jeu :
  `tests/game/recolte-jeu.cjs` (contact, orientation sur plusieurs côtés,
  clips `workingA` / `workingB`, outils, cadence, captures),
  `tests/game/depart-jeu.cjs` et `tests/game/editeur-procedural.cjs`
  (bosquet en run, aperçu, déplacement du Départ, sauvegarde, « Tester le
  scénario »).
- **À ne pas faire** : ne pas faire choisir une source invisible à un
  Villageois ; ne pas créer un second système de vision côté simulation ;
  ne pas réduire `HARVEST_REACH` du Héros ; ne pas coder le bosquet dans
  `main.ts` ni l'écrire dans une `MapDef` ; ne pas dupliquer 75 / 250 /
  250 hors de `data/resources.ts`.
- **Sources** : `sim/world.ts`, `sim/systems/workers.ts`,
  `sim/systems/hero.ts`, `sim/systems/movement.ts`, `data/hero.ts`,
  `data/resources.ts`, `render/unitViews.ts`, `render/toonUnitRig.ts`,
  `config/startingBase.ts`, `editor/editorState.ts`, `main.ts`,
  `CURRENT_STATE.md` §6 bis, §6 nonies, §6 duodecies, §16,
  `ARCHITECTURE.md` §13 sedecies, `EDITOR.md`, `KNOWN_ISSUES.md` KI-64.

### G44 — Passe économie du 2026-11-05 : cargo 10, temps par ressource, Héros ouvrier modéré

- **Statut** : Active (2026-11-05). Valeurs **PROVISOIRES**, pas une
  balance compétitive : une économie agréable pour continuer à développer.
- **Mesures avant** (camp de départ, graine 12345, simulation) : un
  Villageois remplissait son cargo de 5 en 7,5 s et rentrait toutes les
  9 à 10 s (≈ 30 unités / min) ; le Héros (cargo 10) faisait 25 à 37 / min
  et était le meilleur ouvrier ; un gisement de 250 se vidait en 8 min avec
  un seul Villageois, en moins de 4 min avec deux.
- **Décisions** :
  - **cargo Villageois 10** (Héros 10 inchangé) : trajets divisés par
    deux, le Villageois reste 20 à 25 s à sa source ;
  - **temps par unité par ressource** (`HARVEST_NODE_KINDS[r].seconds`) :
    bois 2 s, pierre 2,5 s, or 3 s (1,5 s pour tout avant ; or 2,5 s
    dans la première version de la passe, porté à 3 s à la finalisation :
    l'or un peu plus lent sans gonfler les réserves de toutes les cartes) ;
    un seul rythme pour tout n'était pas pertinent (le minage doit être
    plus lent que la coupe, et les gisements durer) ; la cadence de la
    pioche suit la ressource de l'ordre ;
  - **Héros ×1,25** (`HERO_HARVEST_FACTOR`) : il aide et récolte en
    exploration, les Villageois restent la vraie économie ; ses stats de
    combat ne bougent pas ;
  - **cadence visuelle** : deux coups d'outil par unité, à la vitesse
    naturelle du clip (`HARVEST_STROKES_PER_UNIT`), calculée au lancement
    du geste par le rendu ;
  - **Mine inchangée** (3 à 7 or / 60 s, ≈ 5 or / min) : passive, sans
    population ni micro-gestion, durable ; le rapport ≈ ×3 avec un mineur
    actif (16 à 17 or / min) est accepté provisoirement (Antoine) ;
  - coûts des bâtiments, Scierie, Camp de mineur, dépôt instantané,
    autonomie : inchangés.
- **Mesures après** : Villageois 26 bois / min, 20 pierre / min,
  16 à 17 or / min à 3 s (20 / min mesurés à 2,5 s ; 11 trajets en 5 min
  au lieu de 32) ; Héros 20 / 17 / 13 ;
  2 Villageois autonomes sur 5 min : 110 pierre + 110 or (ils prennent
  les deux gisements, plus proches de la cour que le bosquet) ; 3 : 125
  bois + 110 pierre + 110 or ; 5 : 245 / 110 / 220, l'or presque vide
  (29) à 5 min avec deux mineurs ; 20 Villageois autonomes : 3,1 ms par
  pas de simulation.
- **Points ouverts** : les bâtiments coûtent moins d'un trajet de
  Villageois en bois / pierre (Maison 6 bois = 12 s de coupe) : **les
  coûts bois / pierre sont trop faibles par rapport à un cargo de 10**,
  passe séparée à venir (`ROADMAP.md`) ; le gisement d'or du camp reste
  vidable en 15 min par un Villageois, 8 min par deux.
- **Filet de sécurité** : `tests/sim/economie.mts` (mesure légère :
  temps à la source, cycle, rendement, répartition à 3 Villageois),
  `cargo.mts`, `collecte.mts`, `vitesse.mts`, `modernisation.mts`,
  `depart-camp.mts`, `villageois-autonomie.mts` (durées recalées) ;
  en jeu : `cargo-jeu.cjs`, `villageois-jeu.cjs`, `recolte-jeu.cjs`
  (cadence depuis les données), `depart-jeu.cjs`.
- **Sources** : `data/resources.ts`, `data/hero.ts`, `sim/systems/cargo.ts`,
  `render/unitViews.ts`, `render/toonUnitRig.ts`, `main.ts`
  (`heroActionProgress`), `CURRENT_STATE.md` §6 bis, §6 nonies, §6
  undecies, `ARCHITECTURE.md` §13 decies.

### G45 — Coûts recalés autour d'un cargo Villageois de 10

- **Statut** : Active (2026-11-05). Valeurs **PROVISOIRES**, pas une
  balance définitive : bois et pierre doivent compter comme de vraies
  ressources RTS, l'or rester utile sans être la seule contrainte.
- **Constat** (G44) : tout bâtiment coûtait 5 à 12 bois / pierre, moins
  d'un trajet de Villageois (10 unités en 23 à 27 s) ; l'or était la seule
  contrainte, Scierie et Camp de mineur sans enjeu.
- **Échelle** : petit bâtiment économique 1 à 2 cargaisons de matière,
  militaire standard 2 à 4, avancé / spécialisé 3 à 6 ; bois pour les
  bâtiments légers (Maison, Auberge, Scierie, Camp d'archerie, Palissade),
  pierre pour les lourds (Tour, Forge, Église, Sanctuaire), mixte pour le
  militaire (Caserne, Écurie). Ordres de grandeur, pas des règles.
- **Décisions** (`data/buildings.ts`, `data/technologies.ts`) : Maison
  0 or + 10 bois ; Scierie 5 or + 15 bois ; Camp de mineur 5 or + 10 bois
  + 10 pierre ; Mine 20 or + 10 bois + 5 pierre (une Mine passive ne coûte
  pas moins de matière qu'une Maison) ; Auberge 10 or + 20 bois ; Caserne
  15 or + 20 bois + 10 pierre ; Camp d'archerie 15 or + 25 bois + 5 pierre ;
  Forge 10 or + 15 bois + 20 pierre ; Tour 15 or + 10 bois + 25 pierre ;
  Sanctuaire 25 or + 15 bois + 20 pierre ; Écurie 20 or + 25 bois + 15
  pierre ; Église 35 or + 15 bois + 25 pierre ; Armes forgées I 20 or + 20
  bois + 10 pierre ; Armures forgées I 20 or + 10 bois + 20 pierre ;
  Entraînement des hommes d'armes 7 or + 10 bois + 5 pierre. Palissade
  inchangée (0,5 bois par case : l'enceinte de départ vaut 33 bois, un peu
  plus d'un trajet). Rendements, cargo, autonomie, stats, vagues : rien.
- **Début de partie mesuré** (G44, 3 Villageois autonomes dès le départ,
  stock 20 or) : 1 min 20 bois / 20 pierre / 30 or → Maison et Scierie ;
  2 min 50 / 40 / 50 → Caserne ou Forge en plus ; 5 min 125 / 110 / 110 →
  Maison + Caserne + Forge + Tour laissent 70 bois / 55 pierre / 70 or :
  l'ensemble Caserne + Forge + Sanctuaire + Tour + Écurie (85 bois, 90
  pierre, 85 or) demande les cinq minutes complètes et des choix. Avec deux
  Villageois seuls (pierre + or, 0 bois) seule la Mine ou la Tour reste
  payable : le troisième Villageois (5 or) est la vraie première décision.
- **Non touché, à auditer plus tard** : améliorations de bâtiments
  (Caserne, Camp d'archerie, Mine, Tour, Sanctuaire, Écurie) et de la
  Baliste payées en or seul (matière absente : ajouter un coût matière
  demande un passage dans `run/productionOrders.ts`) ; coûts des unités
  en or seul (Villageois 5, Homme d'armes 2, Archer 3) cohérents avec les
  nouveaux prix, balance des unités plus tard.
- **Filet de sécurité** : `run/buildingCosts.ts` (coût matière, payable,
  débit exact ; purs) et `tests/sim/couts.mts` ; `collecte.mts`,
  `technologies.mts`, `forge-jeu.cjs` (débits exacts) recalés.
- **Sources** : `data/buildings.ts`, `data/technologies.ts`,
  `run/buildingCosts.ts`, `main.ts`, `CURRENT_STATE.md` §6 bis, §6 nonies,
  §14.

### G46 — Passe du 2026-11-05 : XP, grand camp, or visible, Villageois constructeurs, Maj, double-clic, types de dégâts, banque d'items, récompense de vague

- **Statut** : Active (2026-11-05). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-05) :
  - **XP du Héros : portée ≈ 12** (`HERO_XP_RANGE`, 6 avant) ; quantité,
    courbe, partage et règles de kill inchangés ;
  - **StartingBase beaucoup plus grande** : enceinte de rayon 15 (10,5
    avant), même langage visuel (dodécagone, porte, Baliste, Auberge, deux
    Maisons, deux Villageois, bosquet, pierre, or), éléments repoussés vers
    la périphérie, grande cour constructible (549 cases libres contre
    241) ; emprise, aperçu, validation, générateur, navigation, sauvegarde
    et « Tester le scénario » suivent le même modèle dérivé ;
  - **2 gisements d'or visibles au départ minimum** : celui de l'enceinte
    et un second dehors, accessible, hors murs, eau et falaise, à l'écart
    des camps, réellement dans la vision initiale (garantie du générateur
    `nearbyGold`, avertissement de l'éditeur sur une carte dessinée) ; la
    vision de la Baliste passe à 21 pour l'assurer ;
  - **les Villageois peuvent construire**, avec exactement les règles du
    Héros (une seule architecture de construction) ; ordre manuel
    prioritaire sur l'autonomie, qui reprend 1 s après ;
  - **Maj = placement répété** (chaque pose validée et payée séparément ;
    ressources insuffisantes → sortie propre ; Échap quitte toujours ;
    Héros et Villageois) ; tracé de Palissade inchangé ;
  - **double-clic sur un bâtiment allié = sélection des bâtiments du même
    type visibles à l'écran** (viewport, hors brouillard) ; anneaux sur
    tous, fiche « Maisons ×N » ; actions attachées au bâtiment principal
    (pas de commandes groupées dans cette passe) ;
  - **DamageType = physical / magic**, une seule voie de dégâts, sans
    résistances pour l'instant ; **Tourbillon = physique** ; Boule de feu
    et feu des coups = magiques ; le Soin n'est pas un dégât ;
  - **loot = banque d'items curated**, aucune stat aléatoire par run :
    ItemDef fixe + `itemLevel` + progression déterministe = ItemInstance ;
    **2 items par slot pour l'instant** ; **stuff tank / dégâts physiques /
    dégâts magiques** ; la banque est visible et modifiable dans l'Éditeur
    d'items ;
  - **fin de vague = choix entre 2 items du niveau de la vague**, panneau
    non bloquant (pas de retour à l'écran de fin de manche), sac plein →
    la récompense attend, plusieurs vagues → file ;
  - **ancien +5 or de vague supprimé** (loot des ennemis, Mine, camps
    inchangés).
- **Choix de la passe** : enceinte 15 plutôt que 14 (géométrie propre, 36
  pièces) avec vision 21 ; anneau des vagues laissé à 22 (un anneau à 26
  déplaçait collines et mares et cassait l'accès de 3 graines sur 12 :
  les vagues apparaissent à ~7 cases des murs, à revoir avec les Vagues
  V2) ; or proche à 18,5 cases, hors ±60° de la porte ; bonus magique
  porté par `HeroEquipmentBonus.magicDamage` sans consommateur (aucun sort
  offensif du Héros) ; Hache du chef pillard retirée (2 items par
  emplacement), remplacée par la Cuirasse de plates (rare) dans les
  coffres ; objets de main secondaire et pièces de corps sans visuel
  (KI-44) ; niveau d'item dans les cases du sac et `equippedLevels`,
  anciennes sauvegardes lues comme niveau 1 ; tirage des récompenses =
  `Rng` sur graine de carte + vague.
- **Changements de ressenti signalés** : le Héros gagne l'XP de loin ; le
  camp est bien plus vaste et les vagues arrivent plus près des murs ; la
  Baliste voit plus loin ; un second or est à portée immédiate ; les
  Villageois construisent ; plus d'or de fin de vague mais un équipement ;
  les items montent en puissance avec les vagues.
- **Filet de sécurité** : `tests/sim/loot-bank.mts`, `degats-types.mts`,
  `recompense.mts`, `heros-niveaux.mts` (portée), `villageois-autonomie.mts`
  (section 12), `depart-camp.mts` (rayon 15, or proche, cour libre),
  `camps-authored.mts`, `camp.mts`, `cargo.mts`, `mana-soin.mts`
  (recalés) ; en jeu : `construction-jeu.cjs` (Villageois constructeur,
  Maj, double-clic), `recompense-jeu.cjs`, `depart-jeu.cjs`,
  `editeur-procedural.cjs`, `equipement-jeu.cjs` (18 items).
- **À ne pas faire** : ne pas regénérer d'item à stats aléatoires ; ne pas
  créer une seconde banque ni des ItemDef invisibles à l'éditeur ; ne pas
  dédoubler la voie de dégâts ; ne pas ajouter de bonus de vitesse de
  construction à plusieurs ; ne pas remettre d'or de fin de vague.
- **Sources** : `data/hero.ts`, `data/equipment.ts`, `data/loot.ts`,
  `data/vision.ts`, `sim/damage.ts`, `sim/inventory.ts`, `sim/orders.ts`,
  `sim/systems/hero.ts`, `sim/systems/workers.ts`, `sim/systems/combat.ts`,
  `sim/systems/abilities.ts`, `sim/systems/buildingAttack.ts`,
  `sim/playerArrow.ts`, `run/runState.ts`, `run/waveRewards.ts`,
  `config/startingBase.ts`, `config/maps/proceduralSurvival.ts`,
  `data/campLayout.ts`, `editor/editorState.ts`, `ui/waveRewardPanel.ts`,
  `itemEditor/*`, `main.ts`, `CURRENT_STATE.md` §2, §6 bis, §6 ter, §6
  quinquies, §6 duodecies, §7, §16, `ARCHITECTURE.md` §7, §13 ter, §13
  quinquies, §13 septdecies, `GAME_DESIGN.md` §8.

### G47 — Passe du 2026-11-05 : acquisition, clic droit d'inventaire, icônes, Héros désélectionnable, barres de file, ralliement direct, effets d'arme

- **Statut** : Active (2026-11-05). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-05) :
  - **Loot portable + slot vide = auto-équipement** ; une seule règle
    d'acquisition pour récompense, coffre et futur drop ; **jamais** de
    remplacement d'une pièce portée ni de comparaison de puissance ; mention
    jaune « Emplacement vide — sera équipé automatiquement » avant de choisir ;
  - **Clic droit inventaire = équiper / déséquiper** ; échange dans la case
    libérée ; sac plein au retrait : refus, « Inventaire plein » ;
  - **Une icône par EquipmentSlot**, table unique, pas de nouveaux slots ;
  - **Héros désélectionnable ; HUD RPG indépendant de la sélection RTS** ;
    clic gauche sur terrain vide = aucune sélection ; aucun ordre implicite ;
    pas de resélection automatique ; politique de caméra inchangée ;
  - **ProductionOrders affiche une barre de progression commune à celle des
    actions** ; seul le premier ordre progresse ;
  - **Bâtiment producteur sélectionné + clic droit terrain = ralliement** ;
    groupe homogène : même point ; priorités UI → unités → producteurs → rien ;
  - **DamageType reste physical / magic ; DamageSchool magique = fire / frost /
    arcane / nature / holy / shadow** ; Tourbillon et attaques d'armes
    physiques ; une seule voie `applyDamageToEntity` ;
  - **Effet d'arme = toutes les N attaques réussies, K déclenchements d'un
    effet déterministe** ; dégâts par déclenchement : valeur + bonus
    `magicDamage` (provisoire) ; pas d'effet de statut ;
  - **Ancien Feu à chaque coup devient N = 1 / K = 1 / fire** ; import
    converti, export au nouveau format.
- **Choix de la passe** (à valider ou corriger) : Héros sélectionné au
  lancement ; sac plein : carte active si son emplacement est vide (aucune
  case n'est nécessaire) ; « Réparer » d'une fiche ordonne toujours au Héros ;
  sans constructeur sélectionné, Construire est grisé et un chantier existant
  attend ; `contextmenu` global conservé ; la fiche d'entité prend les clics
  (nécessaire à « UI → UI seulement ») ; montant d'un effet fixe, sans
  progression par niveau ; cible à 0 PV : compteur consommé, sans dégâts ;
  `arrowItems.give` reste vers le sac (outil de test).
- **Changements de ressenti et d'équilibrage signalés** : la première pièce de
  chaque emplacement agit sans passer par l'inventaire ; un clic sur le terrain
  désélectionne le Héros, et un clic droit ensuite ne fait rien (le plus gros
  changement d'habitude) ; plus de clic à travers la fiche, ni de zoom molette
  au-dessus ; `magicDamage` n'était lu par rien et augmente maintenant les
  déclenchements de la Lame des braises (seule arme à effet) : équilibrage
  légèrement changé dès qu'un bonus magique est porté.
- **À trancher** : aucun item magique de la banque n'a d'effet déclenché, donc
  `magicDamage` n'agit aujourd'hui que via la Lame des braises, une arme
  physique : l'orientation magique reste faible tant qu'aucune arme magique ou
  sort offensif n'existe.
- **Filet de sécurité** : `tests/sim/acquisition.mts`, `effets-arme.mts`,
  `file-prod.mts`, `degats-types.mts`, `camp.mts` ; en jeu :
  `ergonomie-jeu.cjs`, `item-editeur.cjs`, `recompense-jeu.cjs`,
  `equipement-jeu.cjs`, `forge-jeu.cjs`, `construction-jeu.cjs`,
  `camp-boucle.cjs` (KI-72).
- **À ne pas faire** : pas de seconde règle d'acquisition par source ; pas
  d'ordre implicite au Héros ; pas de nouvelle voie de dégâts ; pas de compteur
  d'effet pour un item du sac ; pas de hasard dans un déclenchement ; ne pas
  commencer les Vagues V2 ici.
- **Sources** : `data/damageTypes.ts`, `data/equipment.ts`, `data/heroes.ts`,
  `sim/inventory.ts`, `sim/damage.ts`, `sim/entity.ts`, `sim/world.ts`,
  `sim/systems/combat.ts`, `sim/systems/hero.ts`, `run/entityInfo.ts`,
  `run/heroEquipment.ts`, `run/productionOrders.ts`, `render/battleSelection.ts`,
  `render/rallyMarkers.ts`, `ui/slotIcons.ts`, `ui/heroInventory.ts`,
  `ui/actionProgress.ts`, `ui/entityInfoPanel.ts`, `ui/waveRewardPanel.ts`,
  `ui/combatOverlay.ts`, `itemEditor/*`, `main.ts`, `CURRENT_STATE.md` Fiche
  d'entité, §2, §6 ter, §6 quinquies, §6 sexies, §16 ter, `ARCHITECTURE.md` §7,
  §13 ter, §13 quinquies, §13 octodecies, `GAME_DESIGN.md` §7, §8.

### G48 — Passe du 2026-11-06 : placement libre, enchaînement des chantiers, 4 portes, mort du Héros

- **Statut** : Active (2026-11-06). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-06) :
  - **Map, navigation et génération restent en grille** ; l'éditeur et le
    générateur gardent la leur ;
  - **placement joueur des bâtiments = continu** : centre à coordonnées
    flottantes, sans snap, pour tous les bâtiments standards (Palissade non migrée) ;
  - **navigation dérivée de l'empreinte continue**, pas de navigation continue ;
  - **rotation par pas de 15°**, touche R, l'empreinte suit ; Maj réservée à la
    pose répétée ;
  - **fin d'un chantier → le constructeur cherche un autre chantier allié proche**
    (`AUTO_CONSTRUCT_RANGE` 12) : réellement inachevé, au joueur, atteignable, le plus
    proche, id le plus bas ; ordre manuel prioritaire, pas de nouveau bonus ;
  - **camp de départ = 4 portes ouvertes, une par côté**, le même système de porte ;
  - **mort du Héros = VFX blanc héroïque montant vers le ciel**, à la mort seulement,
    sans cinématique ni changement du retour ; audio parqué.
- **Choix de la passe** (à valider ou corriger) : marge de pose 0,2 ; marge de
  navigation 0,2 (0,5 + 0,2 = 0,7, rayon du Cavalier, corps le plus large) ; toute case
  touchée est bloquée (prudent, KI-73) ; `AUTO_CONSTRUCT_RANGE` mesuré depuis le
  constructeur ; Ctrl+molette gardé au même pas de 15° ; rotation conservée entre deux
  poses en Maj, remise à 0 à chaque nouveau choix au menu ; R hors pose garde la caméra ;
  empreinte continue aussi pour les bâtiments préconstruits du camp ; bâtiments de carte
  de l'éditeur non migrés ; couloirs de portes 5 × 10 cases ; or proche à plus de 25° des
  axes ; camps neutres hors de l'axe (site strict) ; barils désormais refusés sous une
  pose.
- **Changements de ressenti et d'équilibrage signalés** : base plus compacte possible,
  donc plus de bâtiments dans la même enceinte ; 4 portes ouvertes au départ, à défendre
  ou fermer une à une : les ennemis ne franchissent pas une porte ouverte mais ont quatre
  cibles de plus ; le constructeur enchaîne sur 12 cases au lieu de 3 : un Villageois peut
  partir plus loin construire plutôt que récolter ; forêts et gisements un peu différents
  pour une même graine (couloirs, or proche, camps déplacés) ; Maisons et Auberge déplacées ;
  bosquet et pierre déplacés.
- **Filet de sécurité** : `tests/sim/placement-libre.mts`, `auto-construction.mts`,
  `camp-portes.mts`, `depart-camp.mts` (recalé) ; en jeu : `placement-jeu.cjs`,
  `mort-heros-jeu.cjs`, `depart-jeu.cjs`, `editeur-procedural.cjs` (recalés).
- **À ne pas faire** : ne pas valider une pose en disant seulement « ces cases sont libres » ;
  ne pas remplacer le pathfinding par une navigation continue ; ne pas lancer de test de
  connectivité globale à chaque mouvement de souris ; ne pas migrer la Palissade ; ne pas
  dupliquer largeur et profondeur hors de `BuildingDef` ; pas de logique Three.js en `sim/` ;
  ne pas écrire les portes dans une `MapDef` ; ne pas ajouter de bonus de construction.
- **Sources** : `core/orientedBox.ts`, `config/constants.ts`, `config/startingBase.ts`,
  `config/maps/proceduralSurvival.ts`, `data/buildings.ts`, `data/hero.ts`,
  `run/buildingPlacement.ts`, `run/runState.ts`, `sim/geometry.ts`, `sim/pathfinding.ts`,
  `sim/world.ts`, `sim/systems/movement.ts`, `sim/systems/hero.ts`, `sim/systems/workers.ts`,
  `sim/systems/buildingProduction.ts`, `render/heroDeathVfx.ts`, `editor/editorScene.ts`,
  `main.ts`, `CURRENT_STATE.md` §2, §6, §6 bis, §6 duodecies, `ARCHITECTURE.md` §13
  novodecies, `GAME_DESIGN.md` §7, §8, `EDITOR.md`, `KNOWN_ISSUES.md` KI-66, KI-73.

### G49 — Passe corrective du 2026-11-06 : aucune boucle de navigation

- **Statut** : Active (2026-11-06). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-06) : aucune unité ne reste indéfiniment dans une boucle ;
  point de travail mémorisé pour les chantiers, verrouillé pour l'ordre ; watchdog générique
  1,5 s / 0,2 case ; premier blocage : une récupération, second : ordre terminé
  `failed / unreachable` ; message unique pour un ordre manuel, rien pour un ordre automatique ;
  A* limité ; pas de faux positif pendant une action.
- **Choix de la passe** (à valider ou corriger) : fenêtre doublée au contact d'une autre unité
  (`STUCK_CROWD_FACTOR`) ; second critère : route qui ne raccourcit plus depuis 6 s, pour les
  hésitations de grande amplitude que le déplacement seul ne voit pas ; déplacement arrêté à moins
  d'une case du but : arrivé, sans message ; réparation traitée comme un chantier ; 1 recherche par
  unité toutes les 0,2 s, 6 par pas ; le déplacement manuel passe au watchdog (`no-progress` ne
  concerne plus que l'attaque).
- **Changements de ressenti signalés** : une unité dont la destination est impossible s'arrête
  aussitôt avec un message, au lieu de tenter ; une destination dans un bâtiment se termine
  3 s environ après l'avoir atteint (2 s avant), et affiche maintenant le message ; dans une foule très dense et immobile, un
  ordre peut s'abandonner après 6 s ; les vagues nombreuses répartissent leurs recherches sur quelques pas.
- **Filet de sécurité** : `tests/sim/navigation-boucle.mts`, `tests/game/navigation-jeu.cjs`.
- **À ne pas faire** : ne pas recalculer le point de travail à chaque pas ; ne pas relancer A* sans
  passer par `mayRepath` ; ne pas faire lancer de recherche au watchdog ; ne pas compter un ordre
  comme bloqué pendant une action au contact.
- **Sources** : `sim/workStand.ts`, `sim/pathfinding.ts`, `sim/orders.ts`, `sim/world.ts`,
  `sim/systems/movement.ts`, `sim/systems/hero.ts`, `config/constants.ts`, `main.ts`,
  `CURRENT_STATE.md` §6, `ARCHITECTURE.md` §13 vicies, `KNOWN_ISSUES.md` KI-66, KI-73.

### G50 — Passe du 2026-11-06 : noyau de départ, Maison +5, A Z E R, stands de récolte, fiche du Héros, tas / 2

- **Statut** : Active (2026-11-06). Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** (2026-11-06) :
  - **Hôtel de ville** = nouveau bâtiment central préconstruit : cœur visuel, architecture prête
    pour plus tard, sans production, technologie, niveau, ressource passive ni nouveau menu ;
  - **Baliste déplacée** dans le noyau de bâtiments, condition de défaite inchangée
    provisoirement ; elle garde le dépôt universel, l'Hôtel de ville n'en est pas un ;
  - **Maison = +5 population**, coût inchangé (G45) ;
  - **producteurs : A Z E R** selon l'ordre réel des unités, même action que le bouton ;
    R : placement > producteur à 4 unités > caméra ;
  - **récolte multi-Villageois = stands réservés**, pas de compétition pour le même point, le
    watchdog ne sert pas de solution normale ;
  - **fiche contextuelle du Héros = portrait + nom**, le HUD RPG porte les statistiques ;
  - **tas de bois et de pierre procéduraux = quantité de spawns divisée par deux**.
- **Hôtel de ville de trois-quarts** (décision d'Antoine, 2026-11-06, capture fournie, **choix artistique, à
  ne pas ramener à 0°**), sans toucher au reste du camp : caméra de la Survie à 18°, bâtiment à 45° monde, soit
  27° de biais, porte du côté caméra. Une caméra orthographique voit la même face où qu'elle
  vise. Un carré tourné de 45° occupe un losange : collision et navigation le suivent, c'est voulu.
- **Décision provisoire confirmée par Antoine** : la Baliste reste l'unique bâtiment dont la destruction
  provoque la défaite. **Décision ouverte pour plus tard** : **Hôtel de ville ou Baliste comme bâtiment
  principal à défendre ?** L'Hôtel de ville n'a encore ni production, ni technologie, ni dépôt, ni fonction
  économique, ni capacité défensive.
- **Choix de la passe** (à valider ou corriger) :
  - noyau en tourniquet, voir `CURRENT_STATE.md` §6 duodecies : Baliste au nord-ouest, le côté qui
    change le moins les trajets vers le bosquet, la pierre et l'or ;
  - Hôtel de ville : 30 PV, vision 21, réparation 30 or, 20 bois, 20 pierre ;
  - une unité de la boucle de récolte traverse un Villageois ancré (KI-75) : un ancré bloquant
    provoquait 2 à 19 blocages en 60 s, car les chemins ne voient pas les corps ;
  - réservation à 6 cases de la source, travail à 0,2 case de son emplacement ;
  - un ordre automatique renonce tout de suite, sans attendre ;
  - raccourci conservé pour une unité pas encore débloquée (rang dans la liste complète) ;
  - tirages et cases de l'ancien budget conservés à la génération, pour que les gisements et
    les camps ne bougent pas : sans cela, 9 graines sur 12 déplaçaient un camp, et 4 l'or proche.
- **Changements d'équilibrage et de ressenti signalés** :
  - population : 2 / 15 au départ (2 / 9), chaque Maison vaut 2,5 fois plus pour le même coût ;
  - trajets au dépôt (cycle complet, un Villageois, graine 12345) : bois 23,8 → 22,8 s, pierre
    29,5 → 31,2 s, or 34,4 → 36,5 s ;
  - la Baliste décentrée de 6,4 cases, portée portée à 22,6 (voir G52) ; les vagues marchent vers elle, donc de biais ;
  - aire libre : 501 cases (526), répartie autour du noyau au lieu d'une cour centrale ;
  - 4 Villageois au plus sur un arbre, 8 sur un gisement : en bosquet serré, un arbre en a parfois
    moins (3 à 1) : le surplus se reporte aussitôt sur les arbres voisins (G52) ;
  - moins de bois et de pierre au sol : début de partie plus dépendant de la récolte ;
  - A et E ne zooment plus quand un producteur est sélectionné (la molette reste).
- **Corrections d'écarts signalés en G48** : rayon réservé **17** (12,5 restait écrit dans
  `CURRENT_STATE.md` et `EDITOR.md`) ; une vague repoussée ne donne plus d'or depuis G46
  (`GAME_DESIGN.md` §3, `CURRENT_STATE.md` §6 quinquies).
- **Filet de sécurité** : `tests/sim/farm-stands.mts`, `tests/sim/noyau-depart.mts`,
  `tests/game/noyau-jeu.cjs`.
- **À ne pas faire** : ne pas viser le même point pour deux unités ; ne pas relancer de recherche
  pendant l'attente d'un emplacement ; ne pas décaler le noyau d'une fraction de case ;
  ne pas écrire de règle de raccourci par bâtiment ; ne pas poser un dépôt ou une production sur
  l'Hôtel de ville sans nouvelle décision.
- **Sources** : `config/startingBase.ts`, `config/mapDef.ts`, `config/maps/proceduralSurvival.ts`,
  `data/buildings.ts`, `data/production.ts`, `data/hero.ts`, `data/vision.ts`, `sim/harvestStands.ts`,
  `sim/systems/movement.ts`, `sim/systems/hero.ts`, `sim/systems/workers.ts`, `sim/systems/cargo.ts`,
  `run/buildingRepair.ts`, `run/entityInfo.ts`, `ui/entityInfoPanel.ts`, `editor/editorState.ts`, `main.ts`,
  `CURRENT_STATE.md` §2, §6, §6 duodecies, `ARCHITECTURE.md` §13 unvicies, `KNOWN_ISSUES.md` KI-75, KI-76.

### G51 — Portes automatiques (2026-11-06)

- **Statut** : Active. Valeurs **PROVISOIRES**.
- **Décision d'Antoine** : un adversaire proche d'une porte alliée la ferme ; un allié qui
  approche d'une porte alliée fermée l'ouvre.
- **Choix de la passe** (à valider ou corriger) :
  - l'allié gagne si les deux conditions sont vraies : un hostile ne franchit jamais une porte,
    même ouverte, alors qu'un allié laissé dehors resterait coincé ;
  - 2,5 cases pour l'allié, 5 pour l'hostile ; un allié immobile ne retient pas la porte ;
  - sans personne, la porte reste comme elle est ; elle ne se rouvre pas au départ de l'ennemi ;
  - boutons Ouvrir / Fermer retirés depuis (G52).
- **Changement de ressenti signalé** : l'état ouvert ou fermé devient visuel pour le combat et les
  trajets. Les hostiles étaient déjà bloqués par une porte ouverte, et un allié n'est plus jamais
  bloqué par la sienne : **fermer une porte ne sert plus à garder ses unités à l'intérieur**.
- **À ne pas faire** : ne pas refaire dépendre les chemins de l'état ouvert ou fermé (une unité ne se
  dirigerait plus vers une porte fermée) ; ne pas remplacer `World.obstacles` à chaque ouverture.
- **Sources** : `sim/systems/doors.ts`, `sim/relations.ts`, `sim/world.ts`, `data/walls.ts`,
  `CURRENT_STATE.md` §6 octies.

### G52 — Finalisation avant commit (2026-11-06)

- **Statut** : Active. Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** :
  - **Baliste** : portée 18 → 22,5, 23 au plus, la plus petite valeur suffisante. Retenu : **22,6** (ennemi
    contre le bout de palissade le plus lointain : 22,58 cases). Dégâts, cadence, acquisition, vision,
    améliorations et projectiles inchangés ;
  - **surplus manuel** : plus d'attente de 8 s, report immédiat sur une source proche du même type, jamais
    d'un type à l'autre ; rien : fin d'ordre, message unique, Garde, autonomie après 1 s ;
  - **caméra de Survie** : hauteur de vue ≈ 28 au lancement et au reset, pivot 18°, inclinaison et suivi conservés ;
  - **Hôtel de ville** : biais de ≈ 27°, **choix artistique** ;
  - **portes** : entièrement automatiques, boutons retirés, aucun verrou pour l'instant ;
  - **défaite** : la Baliste seule, la question de l'Hôtel de ville reste ouverte pour plus tard.
- **Choix de la passe** (à valider ou corriger) :
  - portée de report mesurée depuis la source visée par le joueur (8 cases), et limite à pied de 16 cases :
    à vol d'oiseau, un arbre derrière la palissade restait à portée et aurait fait sortir du camp ;
  - le Héros suit la même règle de report qu'un Villageois ;
  - Espace revient au cadrage complet, en gardant le suivi ; le clic sur le portrait recentre sans changer le zoom ;
  - `World.setDoorWanted` reste, pour les tests seulement.
- **À ne pas faire** : ne pas remettre d'attente sur une source pleine ; ne pas ramener l'Hôtel de ville
  face caméra ; ne pas réaligner sa collision sur la grille ; ne pas rajouter de bouton de porte sans
  vraie décision de verrouillage.
- **Sources** : `config/constants.ts`, `sim/harvestStands.ts`, `sim/systems/movement.ts`, `sim/orders.ts`, `data/hero.ts`,
  `render/renderer.ts`, `main.ts`, `CURRENT_STATE.md` §5, §6, §6 duodecies.

### G53 — Passe gameplay du 2026-11-08 : Hôtel de ville, réparation, pulse, défense locale, portes manuelles

- **Statut** : Active. Valeurs **PROVISOIRES**.
- **Décisions d'Antoine** :
  - **dépôt** : la Baliste n'est plus un point de collecte ; l'**Hôtel de ville** reçoit bois,
    pierre et or extrait (Villageois, Héros, tout futur porteur) ; la Baliste n'est jamais un
    repli ; sans dépôt valide, le porteur garde son cargo et s'arrête proprement ;
  - **Villageois** produit à l'Hôtel de ville par la file standard (coût, durée, population,
    ralliement inchangés) ; l'entrée de l'Auberge est retirée ;
  - **réparation manuelle** : clic droit d'un Héros ou d'un constructeur sur un bâtiment allié
    endommagé ; jamais déclenchée par la proximité ; capacité générique plutôt qu'un test de type ;
  - **pulse jaune** de l'anneau de la cible pour tout ordre manuel accepté (ressource, tas,
    dépôt, réparation), jamais pour une décision automatique, jamais pour un ordre refusé ;
  - **défense locale** : un bâtiment allié qui encaisse des dégâts appelle les unités militaires
    proches (`LOCAL_DEFENSE_RADIUS = 22`, unités de simulation, jamais la caméra) ; Villageois
    exclus ; un ordre manuel n'est jamais écrasé ; réaction minimale (rejoindre le bâtiment), pas de
    révélation du brouillard ; défense bornée (ennemi éliminé, plus de menace, temps mort,
    sortie de zone) ;
  - **portes** : toutes posées **fermées**, mode **AUTO** ; le joueur peut **verrouiller fermée**
    une porte (alliés bloqués, collision et trajets la traitent comme fermée) ou la remettre en
    AUTO ; pas de mode « forcée ouverte » ; une porte à la fois ;
  - la Baliste reste la condition de défaite.
- **Choix de la passe** (à valider ou corriger) :
  - `canRepair(e)` = Héros ou Villageois (`sim/orders.ts`), source unique pour la simulation et
    `main.ts` ; la réparation garde la règle économique existante (50 % du prix pour 100 % des PV,
    payé d'avance, remboursement du reste) ; un seul réparateur et un seul paiement par bâtiment à la
    fois : au clic droit, le réparateur sélectionné le plus proche prend l'ordre, les autres unités
    se déplacent vers le point ; un bâtiment endommagé visé par un réparateur l'emporte sur le dépôt
    (un porteur avec du cargo répare d'abord) ;
  - la fiche garde le bouton « Réparer » (Héros) ;
  - l'**Auberge** reste au menu Construire sans aucune fonction (rôle à décider, `ROADMAP.md`) ;
  - **défense locale** : événement réel = `Entity.damageTaken` cumulé par `applyDamageToEntity`
    (toutes sources), consommé chaque pas, au lieu d'un balayage bâtiments × ennemis ; éligibles =
    unités non bâtiments avec `damage > 0`, sans `worker`, hors gardes de camp, en `guard` ou
    `assault`, sans cible verrouillée ni Provocation ; le Héros compte s'il est libre ; une unité en
    `defend` garde sa première intervention ; temps mort d'alerte 1 s par bâtiment ; ordre `defend`
    distinct (aucun `OrderEndEvent`, donc aucun message), suivi comme un déplacement tant qu'aucune
    cible n'est verrouillée, ciblage normal en chemin ; fin : arrivée, bâtiment perdu, 20 s, plus de
    30 cases du point, ou watchdog de navigation ; destination = bord de l'emprise du côté de
    l'unité ;
  - une porte verrouillée redevient un obstacle pour ses alliés : un allié dans l'ouverture est
    repoussé par la collision (comme tout obstacle) puis la porte se ferme ; elle ne se ferme jamais
    sur un corps ; `World.setDoorLocked` renouvelle `World.obstacles` (les trajets dépendent donc du
    verrou, pas de l'état ouvert / fermé, G51) ;
  - l'état initial fermé vaut pour tout preset de camp (`config/startingBase.ts` sans `openGates`) ;
    `MapDef.walls[].openGates` reste pris en charge pour les cartes.
- **Changements de ressenti signalés** : le Villageois qui revient de récolte marche jusqu'à
  l'Hôtel de ville (4 × 4, centre du camp) et plus jusqu'à la Baliste ; les portes fermées au
  départ s'ouvrent au premier passage d'un allié ; des unités en Garde près d'un bâtiment attaqué
  bougent désormais d'elles-mêmes (puis chassent dans leur aggro comme toute Garde) ; un allié
  sorti pendant qu'une porte est verrouillée ne rentre plus par elle.
- **À ne pas faire** : ne pas rendre à la Baliste un `dropOff` « de secours » ; ne pas tester les
  types d'unités pour la réparation (étendre `canRepair`) ; ne pas lire la caméra dans la
  simulation ; ne pas faire écraser un ordre manuel par une alerte ; ne pas ajouter de mode
  « forcée ouverte » ; ne pas pulser l'anneau pour une décision automatique.
- **Sources** : `data/buildings.ts`, `config/startingBase.ts`, `config/constants.ts`, `sim/entity.ts`,
  `sim/orders.ts`, `sim/damage.ts`, `sim/relations.ts`, `sim/systems/doors.ts`,
  `sim/systems/localDefense.ts`, `sim/systems/hero.ts`, `sim/systems/workers.ts`,
  `sim/systems/movement.ts`, `sim/world.ts`, `run/entityInfo.ts`, `main.ts`,
  `tests/sim/{hotel-de-ville,reparation,defense-locale,porte-verrou}.mts`,
  `CURRENT_STATE.md` §6 sexies, §6 octies, §6 undecies, §6 duodecies ; `ARCHITECTURE.md` §13 sexies.

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
    pose (bâtiment, chantier, mur, Baliste, unité) ;
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
  - sort **Soin** : 2 s d'incantation, +5 PV (15 PV depuis le 2026-11-02,
    demande d'Antoine), portée environ 5 cases, sur
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
    unité** (unité par unité, interruptible ; instantané depuis le
    2026-11-04, G35) ;
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
