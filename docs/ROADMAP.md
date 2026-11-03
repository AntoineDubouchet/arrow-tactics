# Roadmap d'Arrow Tactics

Ce document décrit les **grandes directions de développement restantes** et
leur ordre approximatif. Il est organisé par horizons, pas par dates.

Rien ici n'est une fonctionnalité garantie. Pour l'existant, voir
`CURRENT_STATE.md` ; pour les bugs et dettes, `KNOWN_ISSUES.md` ; pour le
fonctionnement technique, `ARCHITECTURE.md`.

**Légende**

- **Direction forte** : chantier voulu, dont la forme précise reste à définir.
- **Expérimentation** : piste à essayer, à confirmer ou abandonner selon le
  résultat.
- **Décision ouverte** : question à trancher avant de pouvoir avancer.

## Sommaire

1. Vision directrice
2. Court terme
3. Moyen terme
4. Long terme
5. Technique / maintenance
6. Décisions ouvertes
7. En attente volontaire

---

## 1. Vision directrice

Arrow Tactics vise à devenir un **roguelite de survie** : l'objectif d'une run
est d'aller le plus loin possible dans des vagues potentiellement infinies.

L'intérêt doit venir :

- du **buildcraft** : composition de l'armée, bâtiments, sorts, talents ;
- de la **progression permanente** : talents, collection ;
- de la **rejouabilité** : des runs qui ne se ressemblent pas.

Les intentions de design détaillées relèvent de `GAME_DESIGN.md`.

---

## 2. Court terme

Remettre la base documentaire et technique au propre, puis préparer les
systèmes de progression.

### C1 — Restructuration documentaire — *Terminé*

- **Résultat** :
  - documents créés dans `docs/` : `ARCHITECTURE.md`, `CURRENT_STATE.md`,
    `KNOWN_ISSUES.md`, `ROADMAP.md`, `EDITOR.md`, `ASSETS.md`,
    `GAME_DESIGN.md`, `DESIGN_DECISIONS.md` ;
  - ancien `CLAUDE.md` archivé dans `docs/archive/CLAUDE_LEGACY_2026.md` ;
  - nouveau `CLAUDE.md` réécrit comme guide de travail court.
- **Hors de C1** : le README et les réglages Claude du projet
  (`.claude/settings.json`) ont été nettoyés séparément.

### C2 — Socle de vérification et harnais de simulation — *Direction forte*

- **Objectif** :
  - premiers tests automatisés sur la logique pure (`run/`, `data/`) et sur
    `World` ;
  - un harnais capable de simuler des batailles sans rendu, en grand nombre.
- **Pourquoi** :
  - l'architecture le permet déjà ;
  - c'est le **prérequis du réglage chiffré sérieux** et des simulations
    massives d'équilibrage ;
  - il ne bloque pas la *conception* des futurs systèmes, qui peut avancer en
    parallèle.
- **Dépendances** : aucune.
- **Décisions ouvertes** : outil de test ; métriques à suivre (durée de
  bataille, survie, or gagné et dépensé…).
- **Ce qui doit attendre** : une couverture exhaustive. On commence par ce qui
  sert l'équilibrage.

### C3 — Faciliter l'ajout de contenu — *Direction forte*

- **Objectif** : rendre moins coûteux l'ajout d'une unité, d'un bâtiment, d'un
  sort ou d'un talent.
- **Pourquoi** : aujourd'hui, une nouvelle unité touche plusieurs endroits (rig,
  récompense, boutique, carte d'amélioration). Les boutiques construisent leurs
  éléments un par un. Les chantiers de contenu multiplieraient ce coût.
- **Dépendances** : C2 utile, non bloquant.
- **Décisions ouvertes** : jusqu'où piloter le contenu par les données ; ce qui
  reste spécifique à chaque unité (modèle, animations).
- **Ce qui doit attendre** : une refonte globale du code. On n'extrait que ce
  qui freine l'ajout de contenu.

### C4 — Lever les problèmes connus qui gênent la suite — *Direction forte*

- **Objectif** : traiter en priorité les entrées de `KNOWN_ISSUES.md` qui
  influencent la planification :
  - KI-01 : résolu avec les murailles (Wall V1, supprimé depuis ; même
    mécanisme pour la Palissade V2) ;
  - KI-09, avant d'agrandir l'arbre de talents ;
  - KI-16, qui alourdit chaque build.
- **Pourquoi** : éviter de construire de nouveaux systèmes sur une base
  fragile.
- **Ce qui doit attendre** : les autres entrées suivent leur propre rythme.

### C5 — Territoire statique et refonte de l'éditeur — *Terminé*

- **Résultat** :
  - **territoire par cases** (`config/territory.ts`, `MapDef.territory`),
    avec repli sur les bandes historiques pour les cartes qui n'en ont pas ;
    il pilote le placement en préparation et le rendu des zones
    (`DESIGN_DECISIONS.md` E5) ;
  - **éditeur de territoire** : peinture Joueur / Ennemi / Neutre, camp des
    unités fixé par le territoire, Baliste 3×3 en territoire joueur ;
  - **refonte de l'éditeur** (étapes E0 à E6) : mise en page en barres et
    panneaux, outils et ligne d'état, catalogue par catégories avec
    recherche, panneau de propriétés, annuler / rétablir complet, état non
    enregistré et Nouvelle carte, caméra cadrée dans l'espace libre et
    panneaux repliables. Détail dans `EDITOR.md`.
- **Reste hors de C5** : le territoire de run (M5), les limitations listées
  en T5.

### C6 — Arène officielle du Mode survie — *Terminé*

- **Résultat** :
  - le mode jouable s'appelle **Mode survie** ; il part d'une arène fixe
    fournie par Antoine (`config/maps/survivalArena.ts`, aujourd'hui
    « MapV2 », 21 × 36) : terrain avec trous, décors, territoire dessiné et
    position de la Baliste. Les unités de scénario de la carte sont
    ignorées ;
  - plus de placement manuel de la tour : la Baliste est créée à
    `MapDef.ballista` et la préparation commence directement
    (`DESIGN_DECISIONS.md` D3, remplacée) ;
  - l'agrandissement A/B/C conserve la forme de l'arène et fait suivre son
    territoire dessiné ; l'étape C est symétrique et garde une bordure
    neutre d'une case autour de chaque zone (`DESIGN_DECISIONS.md` E4) ;
  - les zones restent visibles en bataille ;
  - aspect des décors identique dans l'éditeur et en jeu
    (`DESIGN_DECISIONS.md` E6).
- **Reste hors de C6** : territoire de run (M5), bibliothèque de cartes et
  choix de carte ou de mode.

---

## 3. Moyen terme

Système de vagues infinies, équilibrage, premiers ajouts de contenu et de
buildcraft.

### M1 — Système de vagues infinies — *Direction forte (forme ouverte)*

- **Objectif** : une génération de vagues qui reste intéressante sans limite de
  numéro de vague.
- **Pourquoi** :
  - c'est le cœur du positionnement « survie » ;
  - la progression actuelle (premières vagues fixées, puis croissance
    exponentielle du nombre d'ennemis) ne peut pas tenir sur une run longue.

  *Snapshot de la formule actuelle, à titre indicatif et non comme une cible :*
  une centaine d'ennemis vers la vague 20, plusieurs centaines au-delà de la
  vague 30. La difficulté devra probablement reposer sur autre chose que le
  seul nombre d'unités.
- **Dépendances** : T3 (performance aux grands effectifs). M2 pour le réglage
  chiffré. La conception peut commencer sans attendre le harnais (C2).
- **Décisions ouvertes** : voir §6 (modèle de génération, plafond d'effectif,
  évolution de la carte, durée des runs).
- **Ce qui doit attendre** : l'ajout massif d'ennemis (L1), tant que le
  générateur n'existe pas.

### M2 — Rééquilibrage global — *Direction forte*

- **Objectif** : un rythme de difficulté et d'économie cohérent sur une run
  longue : or, coûts des bâtiments et des améliorations de Forge,
  renforcement des ennemis, puissance des talents.
- **Pourquoi** : plusieurs courbes progressent de façon exponentielle et
  indépendante ; leur interaction sur une run très longue n'a jamais été
  mesurée.
- **Dépendances** : C2 pour le réglage chiffré ; M1.
- **Décisions ouvertes** : barème de l'Or (bâtiments, améliorations de Forge),
  durée de run visée, arbitrages d'équilibrage listés au §6.
- **Ce qui doit attendre** : les réglages chiffrés définitifs, tant que le
  harnais n'est pas disponible.

### M3 — Premiers contenus de run — *Expérimentation*

- **Objectif** : quelques ajouts ciblés pour tester le buildcraft : une ou deux
  unités joueur, un ou deux sorts ou parchemins actifs, un bâtiment
  supplémentaire.
- **Pourquoi** : valider la boucle « choix → build → résultat » avant d'investir
  massivement dans le contenu.
- **Dépendances** : C3 ; M1 au moins dans une première version.
- **Décisions ouvertes** : quelles unités, quels sorts, quel rôle pour les
  bâtiments. Le Cavalier léger est revenu sur demande d'Antoine (G8),
  bestiaire et éditeur seulement ; sa place dans le jeu reste à décider.
- **Ce qui doit attendre** : la quantité. La variété des choix passe d'abord.

### M4 — Premières synergies et archétypes de builds — *Direction forte*

- **Objectif** : deux ou trois archétypes identifiables et viables.
- **Pourquoi** : la rejouabilité d'un roguelite naît de builds différents qui
  fonctionnent tous.
- **Dépendances** : M3 ; en partie L2 (talents).
- **Décisions ouvertes** : quels archétypes ; comment le jeu oriente le joueur
  vers eux (boutique, talents, offres).

### M5 — Territoire de run (fief) — *Décision ouverte*

- **Objectif** : un territoire propre à la run, qui grandit ou se conquiert
  au fil des vagues, au lieu de la transformation mécanique de l'arène par
  l'agrandissement A/B/C.
- **Pourquoi** : le territoire de la carte (C5) et son suivi de
  l'agrandissement (C6) en posent la base ; un fief qui grandit pourrait
  porter l'expansion de la carte et le placement des bâtiments.
- **Dépendances** : C5, C6. La Baliste part déjà de la position définie
  par la carte (D3 remplacée), cœur initial du fief.
- **Décisions ouvertes** :
  - `RunState.territory` et la règle de croissance ou de conquête ;
  - devenir de l'agrandissement A/B/C sur les runs longues (l'étape C est
    désormais symétrique, `DESIGN_DECISIONS.md` E4).

---

## 4. Long terme

Richesse du bestiaire, talents, boutique de run et Forge, achievements, nouveaux archétypes,
rejouabilité.

### L1 — Bestiaire ennemi enrichi — *Direction forte*

- **Objectif** : de nouveaux ennemis aux rôles distincts (élites, mini-boss,
  unités qui contrent certains builds).
- **Pourquoi** : renouveler la menace sur une run longue et obliger le joueur à
  adapter son build.
- **Dépendances** : M1 (le générateur doit savoir doser les ennemis), C3, T3.
- **Décisions ouvertes** : rôles visés ; ennemis propres ou miroirs des unités
  du joueur ; bâtiments ennemis.

### L2 — Arbre de talents étendu — *Direction forte*

- **Objectif** : plus de paliers et de talents, au service des archétypes.
- **Pourquoi** : c'est le principal levier de progression permanente et de
  diversité des builds.
- **Dépendances** : M4 ; KI-09 ; règles de gain de points revues avec M2.
- **Décisions ouvertes** : profondeur de l'arbre ; exclusivités ; nouvelles
  branches (l'idée « Héros » est notée, non engagée).

### L3 — Boutique de run et améliorations de Forge — *Implémenté (équilibrage à poursuivre)*

- **État** : le système est en place (Forge construite en Or, améliorations
  propres à la run achetées en Or ; voir `CURRENT_STATE.md` §6 et §14). La
  Mine et la Caserne s'améliorent désormais chacune depuis sa fiche
  (`DESIGN_DECISIONS.md` D6). Le barème reste provisoire et son équilibrage
  est à poursuivre avec M2.
- **Objectif** : enrichir la variété de la boutique de run et des
  améliorations achetables en Or à la Forge.
- **Pourquoi** : multiplier les arbitrages économiques pendant la run
  (investir ou survivre) et différencier les runs entre elles. Les Runes, qui
  portaient l'ancienne progression permanente par la boutique, sont supprimées
  (`DESIGN_DECISIONS.md` D5) ; la progression permanente relève des talents
  (L2) et des achievements (L4).
- **Dépendances** : M2, C3.
- **Décisions ouvertes** : barème de l'Or ; plafonds de niveau ; boutique fixe
  ou à offres aléatoires ; déblocage de contenu par achievements ou autre ;
  recentrage de la Forge sur les améliorations d'unités, et nouvelle place
  des améliorations de la Baliste et des parchemins (`DESIGN_DECISIONS.md`
  D5).

### L4 — Achievements et progression collectionnable — *Direction forte (forme ouverte)*

- **Objectif** : un système d'achievements / trophées et de progression
  collectionnable.
- **Pourquoi** : donner des objectifs au-delà du record de vague et
  récompenser la diversité des parties.
- **Dépendances** : persistance de la méta-progression (avec migration du
  format de sauvegarde) ; M1 pour les succès liés aux records.
- **Décisions ouvertes** :
  - présentation exacte ;
  - éventuelle salle des trophées ;
  - récompenses ou non ;
  - cosmétiques et/ou déblocages ;
  - liens avec le bestiaire vaincu ou les records.

### L5 — Diversité et rejouabilité des runs — *Expérimentation*

- **Objectif** : des runs qui ne se ressemblent pas : modificateurs de run,
  événements, choix de route, variété de terrains.
- **Pourquoi** : sur des vagues infinies, la répétition est le principal risque.
- **Dépendances** : M1, M4.
- **Décisions ouvertes** : quels leviers ; évolution de la carte au fil d'une
  run (voir §6).

### L6 — Direction audio — *Décision ouverte*

- **Objectif** : décider du devenir du moteur audio présent mais déconnecté :
  le reprendre, le remplacer par des sons enregistrés, ou rester sans son.
- **Dépendances** : aucune technique ; la décision précède tout travail.
- **Ce qui doit attendre** : tout travail audio, tant que la direction n'est pas
  choisie.

---

## 5. Technique / maintenance

Chantiers continus, menés au fil des besoins plutôt qu'en blocs isolés.

- **T1 — Tests et harnais** : prolongement de C2 à chaque nouveau système.
- **T2 — Assets** : retirer les fichiers inutilisés (KI-16) ; poser des
  conventions d'import et de poids des modèles, qui seront documentées dans
  `ASSETS.md`.
- **T3 — Performance** : mesurer le coût du rendu des unités riggées (rendu
  individuel, non instancié) et de la simulation à grand effectif. C'est un
  prérequis de toute ambition sur les vagues longues (M1, L1).
- **T4 — Structure du code** : extraire progressivement de `main.ts` et
  `ui/screens.ts` ce que les chantiers touchent (boutique, placement,
  bâtiments). Jamais de refonte isolée sans besoin concret.
- **T5 — Outils** :
  - éditeur de maps : KI-20, KI-24, nom de carte modifiable, priorité de
    clic des petits décors traversables ;
  - lecture des résultats du harnais d'équilibrage ;
  - retrait des boutons de debug au moment opportun.

---

## 6. Décisions ouvertes

Questions à trancher par Antoine. Elles ne sont pas des engagements.

### Principales

- **Vagues infinies** :
  - modèle de génération (budget de menace, paliers, compositions variées,
    vagues spéciales) ;
  - plafond d'effectif simultané ;
  - part de la difficulté portée par le nombre, par les statistiques et par
    les règles.
- **Durée des runs** : durée et vague « moyennes » visées.
- **Sauvegarde d'une run en cours** : nécessaire ou non pour des runs longues.
- **Évolution de la carte** : carte unique qui s'étend, succession de cartes,
  ou variété de terrains.
- **Territoire de run** : forme de la croissance ou de la conquête du fief,
  voir M5.
- **Économie de l'Or** : rythme de gain, coûts des bâtiments et des
  améliorations de Forge (barème actuel provisoire), plafonds éventuels.
- **Nouveaux types de contenu** :
  - quelles unités joueur et quels ennemis ;
  - quels sorts ;
  - quels bâtiments ;
  - place des cavaleries légères (G8), Chevalier éventuel ;
  - bâtiments ennemis.
- **Talents** : profondeur de l'arbre, exclusivités, nouvelles branches.
- **Achievements** : récompenses et présentation (voir L4).
- **Audio** : direction globale (voir L6).

### Arbitrages d'équilibrage déjà repérés

- Taux de raté actuels de certaines unités face à l'intention passée de
  10-15 %.
- Rôle et poids de la flèche de la Baliste dans les dégâts d'une vague.
- Fantassins produits par la Caserne : rejoignent-ils l'armée persistante ?
- Renforcement par vague de la Sentinelle ennemie.

### Secondaires (faible priorité)

- Caméra par défaut.
- Sens exact du « record de vague ».
- Sens de rotation de Ctrl+molette dans l'éditeur.

---

## 6 bis. Parking « Hero RTS Survival » (fondation construite, le reste en attente)

Voir `DESIGN_DECISIONS.md` G1 à G9. **Construit le 2026-11-01**, en version
provisoire : le Héros (XP, niveaux 1 à 3, mort et retour à la Baliste,
construction), départ Héros + Baliste, carte procédurale 96 × 96,
brouillard de guerre, petits tas finis portés et déposés à la Baliste,
verrous de récolte avancée, cavaleries légères (bestiaire, éditeur),
chantiers bâtis en bataille (`CURRENT_STATE.md` §6 bis). À ne pas
construire avant une décision explicite d'Antoine :

- le reste de l'économie de la **Scierie** et du **Camp de mineur** (points
  de collecte depuis le 2026-11-03, G33) ;
- les **camps PvE** de la carte, la place des cavaleries (recrutement,
  vagues) ;
- **performance de la grande carte** (KI-34) : décors instanciés ou fusionnés
  par morceau, plateau de jeu en morceaux de 16 cases, puis chargement par
  zones si la carte grandit encore ;

- les **capacités du Héros** au-delà du Soin (autres sorts, objets,
  équipement de départ), **d'autres héros** à l'écran de choix (structure
  prête : `data/heroes.ts`), et des niveaux au-delà du 3 ;
- un **vrai inventaire** du Héros (les 6 emplacements legacy sont masqués
  en Survie) ; des **icônes** de bâtiments pour le panneau Construire ;
- **cycle jour / nuit et lumières locales** (torches, braseros, Baliste) :
  voir l'audit d'éclairage de la passe du 2026-11-02 (rapport) ; à
  construire sur `Renderer` (lumières centralisées, `LIGHT_LEVEL`) ;
- une **économie de ressources physiques** au-delà du sac du Héros :
  porteurs, ouvriers, récolte hors bataille, or récolté, réapparition des
  tas ;
- l'économie de RTS associée (production, améliorations) au-delà des coûts
  actuels ;
- le **remplacement de la Boutique** actuelle (ni retrait ni extension
  incompatible d'ici là) ;
- plusieurs joueurs réels (Rouge, Vert, Jaune) dans la simulation, au-delà
  de la couche d'allégeance actuelle ;
- des camps neutres de carte au-delà des deux camps générés (G14) :
  objectifs, camps à farmer, factions.

## 6 quater. Survie en temps réel continu — ce qui reste legacy

La Survie n'emprunte plus la préparation (`DESIGN_DECISIONS.md` G10). Reste
à convertir ou à retirer :

- **Boutique** : parchemins de bataille (plus achetables en Survie),
  recrutement direct, « Vendre » ; à remplacer par des commandes de
  bâtiment ou du Héros, puis retirer la Boutique ;
- **file de production** au-delà d'une entrée, annulation et remboursement ;
- améliorations de la **Baliste** et des unités déjà en jeu (appliquées à
  l'apparition seulement), production de la Caserne par niveau (legacy
  `unitsProducedPerWave`) ;
- code de préparation (`startPlacement`, emplacements, aperçus, panneau
  « Prêt pour la bataille », écran de fin de manche, `applyBattleOutcome`
  hors défaite) et agrandissement E4 : conservés, plus utilisés par la
  Survie ;
- acquisition des **unités** selon la vision (aujourd'hui : portée d'aggro) ;
- **unités spéciales** capables de traverser les forêts (arbres bloquants
  depuis G11 ; même principe que `canTraverseWater`) ;
- couper un arbre pour libérer sa case (passage et construction) ;
- trajets selon la taille du corps (les rampes d'une case restent possibles
  dans l'éditeur).

## 6 septies. Briques RTS — suites

Construit le 2026-11-02 (`DESIGN_DECISIONS.md` G16). À faire :

- barils dans l'éditeur, ruines et autres destructibles (KI-51) ;
- ralliement sur une cible (ressource, unité), plusieurs points ;
- réparation par d'autres unités (ouvriers) ;
- fusion des tas d'or proches (KI-47).

## 6 decies. Murs V2 (Palissade) — suites

Wall V1 supprimé et Palissade V2 construite le 2026-11-02
(`DESIGN_DECISIONS.md` G23). À voir :

- autres familles (`data/walls.ts`) : mur de pierre, mur fortifié, avec
  leurs propres PV, coût (pierre), épaisseur et rendu ; amélioration
  palissade → pierre ;
- porte : ouverture automatique pour les alliés, verrouillage, passage
  réservé à un camp ; vagues qui cherchent une porte ouverte ou un détour
  (KI-55) ;
- éditeur : retirer une porte, déplacer une extrémité (KI-56) ;
- visuel définitif (asset acheté ou modélisé) ; traverses qui suivent le
  relief (KI-57) ; instancing si les murs se comptent par centaines
  (aujourd'hui un mesh par segment, mesuré à 100 segments) ;
- tirs bloqués ou non par certains murs (aujourd'hui tous traversants) ;
- tours et chemins de ronde sur les murs.

## 6 nonies. Scierie et Camp de mineur — suites

Construits le 2026-11-02 (`DESIGN_DECISIONS.md` G22). Depuis le 2026-11-03,
ils ne contrôlent plus la récolte (Forge = outils, G25) et sont des
**points de collecte** (Scierie : bois ; Camp de mineur : pierre, or
extrait ; G33). À voir aussi :

- visuel dédié du Camp de mineur (aujourd'hui l'atelier KayKit : outils,
  sans pierre) ;
- ~~dépôt local (Scierie, Camp de mineur)~~ : fait le 2026-11-03 (G33) ; à
  décider : la Baliste garde-t-elle son rôle de dépôt universel ?
- ~~gros rochers bloquants ou non (KI-41)~~ : bloquants depuis le
  2026-11-03 (G25) ;
- ouvriers / récolte par d'autres unités que le Héros : Auberge et
  Villageois faits le 2026-11-03 (G28, modèle dédié G32) ; à suivre :
  gestes de travail dédiés (KI-64), construction par les Villageois ;
- amélioration de l'Écurie et du Sanctuaire plus parlante que +5 PV
  (G26) ;
- ~~éditeur : génération procédurale (graine) et vue globale (G27)~~ :
  faites le 2026-11-03 ; ~~poser / déplacer un camp à la main, niveau des
  camps~~ : faits le 2026-11-04 (G34, Départ Survie, validation) ; à
  suivre : `survivalRules` et niveaux des unités modifiables (KI-52),
  versionner le générateur une fois stabilisé (KI-58), gisements qui
  ferment un couloir (KI-65), un troisième type de camp.

## 6 octies. Niveaux, cartes de survie, village — suites

Construit le 2026-11-02 (`DESIGN_DECISIONS.md` G17 à G20). Parking :

- **scaling par niveau** (rien n'est appliqué aujourd'hui) : PV, dégâts,
  éventuellement précision, vitesse ou cadence (avec beaucoup de prudence),
  XP donnée, butin, rareté des tables. À décider : formule, unités
  concernées, lien avec les renforts de vague existants ;
- **difficulté procédurale** : le générateur proposerait un niveau par
  tier, distance ou type de zone (exemple d'Antoine : tier 1 → niveaux 1-2,
  tier 2 → 2-4, tier 3 → 4-6), point d'entrée `generatedCampLevel` ; une
  valeur explicite de la carte reste prioritaire ;
- **cartes de survie dessinées** : ~~camps et niveaux de camp dans
  l'éditeur~~ (G34, 2026-11-04) ; zones, niveaux des unités et
  `survivalRules` dans l'éditeur (KI-52) ; plusieurs cartes (Survie 1,
  Survie 2, presets de génération) et leur sélection ;
- **niveau modifié en jeu** : améliorations, bâtiments, technologies,
  vétérans ;
- **village** : chemins qui contournent l'eau et le relief, réseau plus
  riche (plusieurs voisins), terre battue des camps neutres ;
- HUD : remplacer le layout officiel par l'export exact d'Antoine
  (`ui/hudDefaultLayout.ts`).

## 6 sexies. Économie et contrôles — suites

Inventaire unique, or physique et Héros permanent construits le 2026-11-02
(`DESIGN_DECISIONS.md` G15). À faire :

- tas d'or : fusion / disparition / aimant si accumulation (KI-47) ;
- contrôle Héros + armée, groupes (une unité sélectionnée reçoit les ordres : voulu) ;
- consommables dans l'inventaire (cases déjà génériques) ;
- vitesse caméra : autres déplacements au clavier s'ils sont ajoutés.

## 6 quinquies. Équipement et butin — suites

Fondation construite le 2026-11-02 (`DESIGN_DECISIONS.md` G13) ; premiers
camps neutres et coffres le même jour (G14 : petit et grand camp, tables de
coffre, drop du Maraudeur). À faire :

- plus de camps par graine, difficulté liée à la distance au centre,
  tables par niveau de camp, coffres rares isolés (`Chest.campId` null),
  boss, camps d'autres factions (`CAMP_SITES`, `CAMP_KINDS`) ;
- **Marché** : vendre items (`sellValue`) et ressources, acheter ;
- visuel des pièces de corps en jeu (KI-44) ;
- effets suivants : vol de vie, bonus contre un type d'ennemi,
  régénération, bonus de récolte (champ `effects`) ;
- ~~**Scierie** et **Camp de mineur**~~ : points de collecte depuis le
  2026-11-03 (G33) ;
- items propres à d'autres héros (`heroId` générique).

## 6 ter. Outils internes de conception

**Atelier de personnage** : **construit** (2026-11-01, CURRENT_STATE.md
§16 bis, DESIGN_DECISIONS.md H1). Pistes restantes, sans décision :

- plusieurs zones de couleur (KI-37) ;
- cavalerie décomposable, une fois le FBX modulaire importable (KI-36) ;
- pose des objets en miroir dans la main gauche (KI-38) ;
- construction directe depuis l'Atelier (aujourd'hui : copier l'entrée
  dans `units.json`, puis lancer le pipeline) ;
- unités mixtes **en jeu** : `render/toonUnitRig.ts` n'applique qu'un atlas
  par unité. Il faudrait reconnaître les matériaux `<unité>__<préfixe>` du
  pipeline et leur donner l'atlas et le masque de leur source ;
- allongement réel d'un membre (échelle des os) : non fait, car il
  changerait les clips et toutes les pièces portées par ces os.

**Parking** (documentation seulement, rien n'est construit, à reprendre sur
décision d'Antoine) :

**Éditeur d'items** (équipements du Héros) : un item définit un
identifiant, un nom, un type (épée, marteau, casque, bouclier, cape…), une
rareté, un modèle / une pièce visuelle, un emplacement d'équipement, des
stats, une valeur de vente et un éventuel effet spécial. Exemple :
« Épée du débutant », épée, commune, +3 dégâts de mêlée, valeur de vente X ;
plus tard « +3 dégâts de feu à chaque coup ». Changer d'item change le
modèle porté. Pas de système de loot dans cette étape. Les emplacements de
l'Atelier préparent cette suite : main droite (arme principale), main
gauche (seconde arme / bouclier), tête (casques du pack), épaulières, cape.
`pieces.hands` décrit déjà une pièce visuelle par main, avec son
ajustement.

**Ne pas figer le Héros** : aujourd'hui `human_hero.glb` fusionne tête, corps,
bras, jambes et épaulières en un maillage, et seuls les outils (marteau,
hache, pioche) sont des maillages séparés commutables (`pieces.tools`,
`setToonTool`). La voie prévue pour les emplacements remplaçables (arme
principale, seconde arme / bouclier, casque, épaulières, cape) est la même :
exporter chaque emplacement comme maillage séparé nommé (comme
`tool_<nom>`), choisi à l'exécution par l'item équipé. Les stats d'item
passeront par le pipeline de stats existant (base → talents → achats →
buffs), jamais par la simulation directement.

## 7. En attente volontaire

- **Contenu ennemi massif** : en attente du générateur de vagues (M1).
- **Réglages chiffrés définitifs** : en attente du harnais (C2).
- **Refonte globale de `main.ts`** : remplacée par des extractions au fil des
  besoins (T4).
- **Travail audio** : en attente d'une direction (L6).
- **Réécriture de `CLAUDE.md`** : en dernier, après les autres documents (C1).
- **Sol : points parqués** (après le choix de `?groundLook=living`,
  2026-10-30 ; voir `DESIGN_DECISIONS.md` E7) :
  1. **contact visuel au pied des bâtiments et des murs** : sur l'herbe, un
     bâtiment ou un mur paraît posé sur une nappe. Une cour ou un tablier
     de terre battue et quelques rochers aident déjà, mais rien n'assombrit
     le contact ; il faudrait un rendu qui connaisse les bâtiments (le sol
     ne lit que la carte) ;
  2. **palette des petites plantes 3D** : plantes Kenney et plantes
     aquatiques KayKit lisibles à partir d'environ 0,6 case, mais d'un vert
     bleuté sombre qui tranche sur l'herbe ; fleurs, champignons et
     cailloux Kenney invisibles à la caméra de jeu ou hors palette. À
     reprendre avec une teinte accordée à l'herbe ;
  3. **coût du shader `living` sur GPU modeste** : états et accents
     calculés au pixel ; +0,3 à 0,6 ms mesurés sur une RTX 2070 seulement.
     À mesurer sur une puce graphique intégrée ; si besoin, précalculer les
     accents dans une petite texture.
  4. **surfaces bloquantes** : **eau faite** (2026-11-01,
     `DESIGN_DECISIONS.md` E9) ; reste la **lave** (visuelle) : à Antoine de
     dire si elle bloque comme l'eau ou blesse. Écart avec le cadrage du
     2026-10-31 : `World.setMap` lit lui-même les `surfaceCells` d'eau (via
     `config/groundSurfaces.ts`, aucune dépendance au rendu), au lieu d'une
     fonction partagée appelée hors simulation.
  5. **relief `hybrid` : grandes facettes planes aux coins rentrants**
     des parois (noté lors de la passe relief, revu le 2026-10-31) : les
     colonnes de roche restent verticales aux sommets rentrants pour que les
     parois voisines partagent leurs sommets ; la paroi y forme une grande
     facette plane. Pas de correctif simple et sûr : à reprendre avec le
     découpage des parois (`emitRockEdge`, `render/terrainStylized.ts`).
