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
  - KI-01 : résolu avec les murailles ;
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
  bâtiments. Le Cavalier n'est **pas** réintroduit d'office.
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
  - retour éventuel du Cavalier ou d'un Chevalier ;
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

## 7. En attente volontaire

- **Contenu ennemi massif** : en attente du générateur de vagues (M1).
- **Réglages chiffrés définitifs** : en attente du harnais (C2).
- **Refonte globale de `main.ts`** : remplacée par des extractions au fil des
  besoins (T4).
- **Travail audio** : en attente d'une direction (L6).
- **Réécriture de `CLAUDE.md`** : en dernier, après les autres documents (C1).
