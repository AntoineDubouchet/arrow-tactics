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
- de la **progression permanente** : Runes, talents, collection ;
- de la **rejouabilité** : des runs qui ne se ressemblent pas.

Les intentions de design détaillées relèveront de `GAME_DESIGN.md`.

---

## 2. Court terme

Remettre la base documentaire et technique au propre, puis préparer les
systèmes de progression.

### C1 — Finir la restructuration documentaire — *Direction forte*

- **Objectif** : terminer la nouvelle documentation, dans cet ordre :
  `ROADMAP.md` → `EDITOR.md` → `ASSETS.md` → `GAME_DESIGN.md` →
  `DESIGN_DECISIONS.md`. Réécrire `CLAUDE.md` en dernier, comme simple guide de
  travail. Appliquer au passage la correction documentaire KI-18.
- **Pourquoi** : sans intentions de design écrites, les chantiers suivants
  n'ont pas de critère de réussite clair.
- **Dépendances** : aucune.
- **Décisions ouvertes** : le contenu de `GAME_DESIGN.md`, à écrire ou valider
  par Antoine.
- **Ce qui doit attendre** : tout nouveau contenu de jeu d'envergure, jusqu'à
  ce que la vision soit écrite.

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
  bataille, survie, or et Runes gagnés…).
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
  - KI-01 (à vérifier), avant d'enrichir les bâtiments ;
  - KI-09, avant d'agrandir l'arbre de talents ;
  - KI-16, qui alourdit chaque build.
- **Pourquoi** : éviter de construire de nouveaux systèmes sur une base
  fragile.
- **Ce qui doit attendre** : les autres entrées suivent leur propre rythme.

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
  longue : or, Runes, coûts des améliorations, renforcement des ennemis,
  puissance des talents.
- **Pourquoi** : plusieurs courbes progressent de façon exponentielle et
  indépendante ; leur interaction sur une run très longue n'a jamais été
  mesurée.
- **Dépendances** : C2 pour le réglage chiffré ; M1.
- **Décisions ouvertes** : économie des Runes, durée de run visée, arbitrages
  d'équilibrage listés au §6.
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

---

## 4. Long terme

Richesse du bestiaire, talents, Runes, achievements, nouveaux archétypes,
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

### L3 — Boutique et progression par les Runes — *Direction forte*

- **Objectif** : enrichir ce que les Runes permettent d'obtenir et la variété de
  la boutique de run.
- **Pourquoi** : donner à chaque run un intérêt durable au-delà de la run
  elle-même.
- **Dépendances** : M2, C3.
- **Décisions ouvertes** : économie des Runes ; plafonds ; boutique fixe ou à
  offres aléatoires ; déblocage de contenu par Runes ou par achievements.

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
  - éditeur de maps : KI-05, KI-06, test de scénario avec bâtiments (KI-07) ;
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
- **Économie des Runes** : rythme de gain, coûts, plafonds éventuels.
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
