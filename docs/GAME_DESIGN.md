# Game design d'Arrow Tactics

Ce document décrit **l'expérience recherchée** et les **principes** qui doivent
guider les futurs choix de gameplay. Il exprime avant tout la vision d'Antoine.

Il ne remplace pas les autres documents :

| Pour… | Voir |
|---|---|
| ce que le jeu fait aujourd'hui (règles, valeurs) | `CURRENT_STATE.md` |
| les grands chantiers à venir | `ROADMAP.md` |
| l'historique des choix et leurs raisons | `DESIGN_DECISIONS.md` |
| les bugs et dettes | `KNOWN_ISSUES.md` |

Il ne contient volontairement ni valeurs d'équilibrage ni calendrier. Une idée
qui n'est pas encore tranchée est signalée comme question ouverte (§15).

## Sommaire

1. Intention
2. Piliers de design
3. La boucle centrale
4. Survie sans fin et montée de la difficulté
5. Le bestiaire : un ennemi, une question tactique
6. L'armée du joueur et le buildcraft
7. L'intervention directe du joueur
8. Économie de run et décisions entre les vagues
9. Progression permanente : rôle de chaque système
10. Achievements et collection
11. Lisibilité
12. Rejouabilité
13. Évaluer une nouvelle idée
14. Écarts actuels avec la vision
15. Questions de design ouvertes

---

## 1. Intention

**Arrow Tactics est un roguelite tactique de survie.**

À chaque run, le joueur construit progressivement une armée et un build pour
tenir le plus longtemps possible face à des vagues de plus en plus difficiles.
Le combat se joue en grande partie tout seul ; le joueur y intervient
ponctuellement, notamment avec sa Baliste et ses sorts.

Il n'y a pas de « vraie fin » à atteindre. La défaite finit toujours par
arriver. Ce qui compte, c'est jusqu'où l'on est allé, pourquoi on est tombé, et
l'envie de recommencer autrement.

## 2. Piliers de design

1. **Survivre le plus longtemps possible.** La run n'a pas de fin obligatoire.
   Le record de progression fait partie de la motivation.
2. **Construire, puis regarder son build agir.** Le cœur du plaisir est la
   préparation : composer son armée, acheter, placer. Le combat automatique
   est le verdict de ces décisions.
3. **Garder la main au bon moment.** Le joueur dispose de décisions actives
   ponctuelles qui comptent pendant la bataille.
4. **Des builds différents, pas seulement plus de contenu.** Chaque ajout doit
   ouvrir ou renforcer une manière de jouer. La richesse se mesure aux
   synergies, pas au nombre d'éléments.
5. **Des menaces variées et lisibles.** La difficulté vient de nouvelles
   questions tactiques, et le joueur comprend pourquoi il gagne ou perd.
6. **Une progression qui donne envie de relancer.** Chaque système permanent
   donne une raison différente de faire « une run de plus ».

## 3. La boucle centrale

**Pendant une run :**

1. **Préparation** : achats, organisation de l'armée, placement des unités et
   des bâtiments.
2. **Vague** : la bataille se joue automatiquement ; le joueur intervient
   directement quand c'est utile.
3. **Survie** : si au moins un combattant du joueur tient, la vague est gagnée.
4. **Récompenses** : ressources de run, et éventuellement progression
   permanente.
5. **Nouvelles décisions de build** : renforcer, réorienter, réparer, prendre
   un risque.
6. Retour à la préparation, face à une vague plus exigeante.

**Entre les runs :**

1. **Défaite** : la run s'arrête.
2. **Progression permanente** : ce qui a été gagné ou débloqué reste acquis.
3. **Nouvelle run** : avec de nouvelles possibilités et l'envie de battre son
   record ou d'essayer un autre build.

Chaque étape doit produire une **décision intéressante**. Une étape qui se
réduit à une formalité est un signal d'alerte.

## 4. Survie sans fin et montée de la difficulté

- La survie est **potentiellement infinie** : aucune vague n'est la dernière
  par principe.
- La difficulté **ne doit pas reposer uniquement** sur l'augmentation du
  nombre d'ennemis ou de leurs points de vie. Ce levier seul rend les vagues
  monotones, finit par nuire à la lisibilité, et récompense un seul type de
  build.
- Pistes à explorer pour faire monter la pression autrement :
  - des **compositions** plus complexes ;
  - de **nouveaux rôles** ennemis (§5) ;
  - une meilleure **qualité** d'ennemis plutôt qu'une plus grande quantité ;
  - des **élites**, mini-boss ou boss éventuels ;
  - des **règles ou modificateurs** de vague ;
  - une **pression qui varie selon le build** du joueur, pour mettre ses
    choix à l'épreuve.
- **Résultat recherché** : quand le joueur perd, c'est parce qu'une menace a
  dépassé son build, pas seulement parce que les chiffres sont devenus trop
  grands.

Le système exact de génération des vagues n'est pas encore décidé (§15).

## 5. Le bestiaire : un ennemi, une question tactique

**Principe** : chaque nouveau type d'ennemi devrait poser une **nouvelle
question tactique** au joueur. Une version d'un ennemi existant avec plus de
statistiques ne justifie pas, à elle seule, un nouveau type.

Rôles possibles, à discuter (aucun n'est engagé) :

| Rôle | Question posée au joueur |
|---|---|
| Pression de mêlée | Ma ligne de front tient-elle ? |
| Distance | Puis-je atteindre ce qui me tire dessus ? |
| Zone | Mes unités sont-elles trop groupées ? |
| Tank / provocation | Mes dégâts vont-ils au bon endroit ? |
| Attaque de la backline | Mes unités fragiles sont-elles protégées ? |
| Anti-bâtiment | Mon économie et mes bâtiments sont-ils exposés ? |
| Soutien / soin | Qui dois-je éliminer en premier ? |
| Invocation | Puis-je gérer un flux d'ennemis qui grossit ? |
| Protection d'autres ennemis | Comment percer une défense ? |

Un bon bestiaire mélange ces rôles dans des compositions qui se répondent,
pour que la même armée ne suffise pas contre toutes les vagues.

## 6. L'armée du joueur et le buildcraft

**Principe** : une bonne run doit permettre **différentes manières de devenir
puissant**, et ces manières doivent se ressentir différemment en jeu.

Archétypes possibles (exemples, pas des décisions) :

- **Baliste / intervention directe** : la puissance passe par le joueur
  lui-même.
- **Armée nombreuse** : submerger par le nombre.
- **Unités d'élite** : peu d'unités, très investies.
- **Économie / bâtiments** : investir maintenant pour être fort plus tard.
- **Production** : des bâtiments qui fournissent des renforts en continu.
- **Soins / projectiles d'ombre** : tenir plus longtemps et convertir le
  surplus de soin en dégâts.
- **Glace / contrôle** : maîtriser le rythme et la position des ennemis.
- D'autres archétypes à venir.

**Ce qui fait un archétype** :

- il s'appuie sur **plusieurs systèmes à la fois** (unités, talents,
  boutique, Runes, sorts, bâtiments) ;
- il a des **forces et des faiblesses** identifiables face à certaines
  menaces ;
- il fait naître des **synergies** : deux choix valent plus ensemble que
  séparément ;
- il reste **compréhensible** : le joueur voit ce que son build produit.

Mélanger des archétypes doit rester possible ; être cohérent doit être
récompensé.

## 7. L'intervention directe du joueur

Le combat est en grande partie automatique, mais le joueur garde des
**décisions actives** :

- la **Baliste** ;
- les **sorts et parchemins** ;
- éventuellement d'autres mécaniques futures.

**Principe** : l'intervention directe du joueur doit être **suffisamment
importante pour compter, sans rendre l'armée secondaire**.

Ce que l'on cherche :

- des moments où intervenir **change réellement l'issue** : sauver une unité,
  casser une menace, retourner une situation ;
- des décisions de **timing et de ciblage**, plutôt qu'une action répétée
  mécaniquement ;
- une intervention qui peut devenir un **archétype à part entière** (§6),
  sans être obligatoire pour réussir.

La puissance exacte de la Baliste et des sorts reste ouverte (§15).

## 8. Économie de run et décisions entre les vagues

Le temps entre les vagues est celui des **choix de build**. On y cherche :

- des **arbitrages réels** : renforcer l'armée, investir dans l'économie,
  préparer une intervention, soigner ;
- des choix **conséquents** : un achat oriente la suite de la run ;
- la possibilité de **corriger** un build en difficulté, sans que tout soit
  réversible gratuitement ;
- un **placement** qui compte, en particulier face à des menaces qui ciblent
  certaines positions.

**Orientation UX actuelle**, sans statut de pilier : une interface sobre,
superposée au champ de bataille, inspirée des jeux de stratégie sur PC, avec
une manipulation directe des unités.

## 9. Progression permanente : rôle de chaque système

**Séparation conceptuelle recherchée** — chaque système doit avoir un rôle
distinct pour ne pas faire doublon :

| Système | Rôle recherché |
|---|---|
| **Talents** | Orienter le style de jeu ; ouvrir ou renforcer des archétypes |
| **Runes / améliorations permanentes** | Progression permanente graduelle |
| **Déblocages** | Élargir les possibilités : nouvelles unités, nouveaux sorts, nouveaux bâtiments… |
| **Achievements** | Proposer des objectifs et des défis |
| **Collection** | Conserver une trace des découvertes et des accomplissements |

**Principes** :

- la progression permanente doit donner envie de relancer **sans rendre les
  premières vagues triviales** ni remplacer les décisions de run ;
- un talent doit être un **choix qui se ressent en jeu**, pas un petit bonus
  de plus ;
- la progression doit aussi **élargir les options**, pas seulement augmenter
  les chiffres.

La **répartition exacte** des récompenses et des déblocages entre ces
systèmes reste ouverte (§15).

## 10. Achievements et collection

Les achievements font partie de la direction du jeu. **Pourquoi ils
existent :**

- donner des **objectifs au-delà du record** de vague ;
- pousser à **essayer d'autres builds** et d'autres façons de jouer ;
- **valoriser la découverte** du contenu (ennemis rencontrés, unités jouées,
  synergies trouvées) ;
- laisser une **trace** de ce que le joueur a accompli, qui rend sa
  progression visible.

**Formes possibles**, non décidées :

- simples succès ;
- trophées visibles, voire une salle des trophées ;
- un codex ou un bestiaire ;
- des récompenses cosmétiques ;
- des déblocages gameplay ;
- aucune récompense autre que la collection elle-même.

La forme doit être choisie **en fonction de ces objectifs**, pas l'inverse.

## 11. Lisibilité

Même avec beaucoup d'unités et de systèmes, le joueur doit pouvoir comprendre :

- **ce qui menace** son armée ;
- **pourquoi** il gagne ou perd une vague ;
- **ce que produisent** ses choix de build ;
- **quand** son intervention directe est utile.

**Principes** :

- la mort d'une unité doit pouvoir **s'expliquer** ;
- le **hasard doit rester lisible** : un raté, une esquive, un effet
  déclenché doivent se voir ;
- la lisibilité concerne d'abord ce qui **change une décision** : un détail
  décoratif peut être riche, un élément de gameplay doit être clair ;
- la lisibilité doit être **pensée à l'échelle** : ce qui marche avec
  quelques unités doit encore marcher quand la bataille grossit.

**Identité actuelle du combat automatique**, décrite ici comme le
comportement en place et non comme une règle immuable (fonctionnement
détaillé dans `CURRENT_STATE.md`) :

- les deux camps avancent l'un vers l'autre ;
- l'aggro choisit une cible ;
- la portée arrête l'unité ;
- une unité n'attaque pas en marchant ;
- une ligne de front se forme naturellement.

## 12. Rejouabilité

La richesse du jeu doit produire des **runs différentes**, pas seulement une
progression linéaire plus longue.

Une run est différente quand :

- les **décisions** prises diffèrent : archétype, achats, placement ;
- les **situations** rencontrées diffèrent : compositions et menaces
  ennemies ;
- le joueur a des **raisons** de jouer autrement : objectifs, nouvelles
  possibilités débloquées, envie de tester une synergie.

Ajouter du contenu ne suffit pas : il faut que ce contenu **interagisse** avec
le reste.

## 13. Évaluer une nouvelle idée

Questions à se poser avant d'ajouter une unité, un ennemi, un sort, un
talent, un bâtiment ou une Rune :

1. **Est-ce amusant ?** Cette question passe avant « est-ce techniquement
   complet ? ».
2. Quelle **décision nouvelle** cela crée-t-il pour le joueur ?
3. Quel **archétype** cela ouvre-t-il ou renforce-t-il ?
4. Avec quoi cela fait-il **synergie** ? Contre quoi est-ce faible ?
5. Pour un ennemi : quelle **question tactique** pose-t-il ?
6. Le joueur **comprendra-t-il** l'effet en le voyant en jeu ?
7. Cela reste-t-il **lisible à grande échelle** ?
8. Cela **fait-il doublon** avec un élément existant ?
9. Cela respecte-t-il le **rôle du système** concerné (§9) ?
10. Peut-on le **tester simplement** avant de l'enrichir ?

## 14. Écarts actuels avec la vision

Constat uniquement, sans plan d'action (voir `ROADMAP.md`) :

- la difficulté repose encore surtout sur le **nombre d'ennemis** et leurs
  **statistiques** ;
- le bestiaire ennemi **reprend les unités du joueur** ; aucun rôle ennemi
  dédié n'existe encore ;
- le choix d'unités et de sorts pour le joueur reste **restreint** ;
- l'arbre de talents est **réduit** et les synergies sont rares ;
- les Runes servent surtout à des **améliorations de statistiques** ;
- les archétypes existent **en ébauche**, sans identité forte ;
- **ni achievements ni collection** ;
- une seule carte, et **peu de variation** d'une run à l'autre ;
- la lisibilité **n'a pas été éprouvée** sur de très grandes batailles ;
- le **moteur audio** existe mais est **déconnecté**.

## 15. Questions de design ouvertes

Aucune de ces questions n'est tranchée.

**Survie et difficulté**

- La formule de génération des vagues infinies : place du hasard, paliers
  marquants, vagues spéciales, modificateurs.
- Le nombre maximal d'ennemis visé et le plafond de lisibilité.
- Le rapport entre quantité et qualité des ennemis.
- L'existence d'élites, de mini-boss ou de boss.

**Combat et intervention**

- Le **taux de raté**, et plus largement la place du hasard dans le combat.
- La puissance exacte de la Baliste et des sorts, et le nombre de sorts
  disponibles.
- Les éventuelles autres formes d'intervention directe.
- Si l'identité actuelle du combat automatique (§11) doit rester telle quelle
  ou évoluer.

**Armée et contenu**

- La liste des futures unités du joueur.
- Le retour éventuel du Cavalier ou d'une unité montée.
- La progression de la Sentinelle ennemie.
- Les rôles ennemis prioritaires.
- La Caserne : ses Fantassins doivent-ils persister d'une vague à l'autre ?
  Faut-il plus de persistance de l'armée en général ?

**Économie et progression**

- L'économie exacte des Runes et l'équilibre entre or et Runes.
- La forme d'un arbre de talents « beaucoup plus riche » : choix exclusifs ou
  cumulables, réinitialisation, et comment éviter la dilution en petits bonus.
- La répartition des récompenses et des déblocages entre talents, Runes,
  déblocages, achievements et collection.
- La forme des achievements et de la collection, et la nature de leurs
  récompenses.
- Si l'abandon et la défaite doivent récompenser différemment.

**Run et cadre**

- Le système de carte sur les runs longues : agrandissement, plusieurs
  cartes, biomes.
- La sauvegarde d'une run en cours.
- La direction audio : le moteur existe, il est déconnecté, et sa place dans
  l'expérience reste à définir.
