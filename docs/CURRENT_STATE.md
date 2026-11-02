# État actuel d'Arrow Tactics

Ce document décrit ce que le jeu **contient et fait aujourd'hui**, d'après le
code de la branche `reprise-2026`. Les valeurs sont celles observées dans le
code au moment de la rédaction : **en cas d'écart, les fichiers sources cités
font foi**.

Les PV et dégâts sont donnés en **valeurs affichées au joueur**. En interne,
ils sont multipliés par 10 (`HP_PER_PIP`, `config/constants.ts`).

Pour l'organisation technique, voir `ARCHITECTURE.md`. Ce document ne
contient ni intentions de design ni décisions futures.

## Sommaire

1. Résumé
2. Déroulé d'une run
3. Unités
4. Déblocage des unités
5. La Baliste (tour du joueur)
6. Bâtiments gameplay : Mine, Caserne, Camp d'archerie, Forge, Tour et Église
6 bis. Héros, ressources, carte procédurale
7. Économie d'or
8. Boutique de run
9. Inventaire et parchemins de bataille
10. Vagues ennemies
11. Arène, territoire et expansion de la carte
12. Talents
13. Méta-progression : points de talent
14. Améliorations de Forge et d’Église
15. Sauvegarde : ce qui persiste
16. Éditeur de maps
16 bis. Atelier de personnage
17. Audio
18. Outils de debug présents
19. Absent ou retiré

---

## 1. Résumé

Roguelite tactique web en vue 3/4. Le mode jouable, le **Mode survie**, se
joue en **temps réel continu** (2026-11-01, §6 bis) sur une grande carte
procédurale (une par run ; l'ancienne arène reste accessible par
`?map=arena`) : le joueur explore, récolte, construit, produit et combat
sans changement de phase ; les vagues sont des événements dans le temps. Il intervient avec la Baliste et
des parchemins de bataille.

- L'**Or** est la monnaie principale de la run. Il sert à recruter des unités,
  acheter des parchemins, construire des bâtiments et acheter des
  améliorations : à la **Forge**, ou sur la fiche d'une Mine ou d'une
  Caserne.
- **Direction Hero RTS** (provisoire, §6 bis) : la run commence avec le
  **Héros** seul et la **Baliste**. Le Héros explore sous un **brouillard de
  guerre**, gagne de l'XP, ramasse de petits tas de **bois** et de **pierre**
  qu'il **dépose à la Baliste** (seul le dépôt remplit le stock, qui s'ajoute
  à l'or dans le prix des bâtiments) et bâtit en bataille les **chantiers**
  achetés en préparation.
- La run continue tant que le joueur gagne ; elle s'arrête à la première
  défaite.
- Seuls les talents et la progression générale (record, ennemis vaincus…)
  sont conservés entre les runs. Les améliorations sont propres à la run.
  Il n'y a plus de Runes.

## 2. Déroulé d'une run

Fonctions concernées dans `main.ts` : `startNewRun`, `startPlacement`,
`onValidatePlacement`, fin de bataille dans la boucle de jeu.

> **Depuis le 2026-11-01, la Survie n'a plus de préparation** (§6 bis,
> « Survie en temps réel continu ») : `startNewRun` lance directement le jeu
> (`startSurvivalRealtime`), les vagues arrivent par compte à rebours et une
> vague repoussée ne change plus de phase. Ce qui suit sur la préparation,
> la Boutique et la fin de manche décrit le code **legacy**, conservé mais
> plus emprunté par la Survie.

1. **Nouvelle run** (menu → **Mode survie**, `createNewRun`) :
   - armée de départ : le **Héros** seul (§6 bis), avec la Baliste
     (`STARTING_FANTASSIN_COUNT` = 0 Homme d'armes ; 3 puis 4 avant). Le
     Héros ne compte pas dans la population. « Homme d'armes » est le nom affiché de l'unité `fantassin`
     (identifiant, stats et cartes inchangés) ;
   - or de départ : **20** (`STARTING_GOLD`), 25 avec le talent Or de départ
     (+5, `TALENT_STARTING_GOLD_BONUS`) ;
   - population : **0 / 5** (base `PLAYER_BASE_POPULATION` = 5, voir
     ci-dessous) ;
   - stock de départ : **0 bois, 0 pierre** (`STARTING_RESOURCES`,
     provisoire) : il faut explorer et déposer avant tout chantier ;
   - inventaire et bâtiments vides, aucune amélioration (`upgrades = {}`),
     vague 1.

   **Début de run** : 20 or, 0 bois, 0 pierre, le Héros et la Baliste,
   Pop. 0 / 5, aucun bâtiment. Aucun chantier n'est possible avant le
   premier dépôt de ressources. Recruter exige un bâtiment (§4) : Fantassin → Caserne,
   Piquier → Caserne (Fantassin → Caserne Niv. 2), Archer → Camp d'archerie,
   Mage, Oracle et Vengeur → Église. Maison + Caserne ou Maison +
   Camp d'archerie tiennent dans les 20 or (16 et 14 bois, à ramasser
   d'abord) ; Caserne + Camp d'archerie (30 or) non. Tout bâtiment acheté est
   d'abord un chantier, bâti par le Héros en bataille (§6 bis).

   **Population** (`data/population.ts`, `run/population.ts`) : maximum
   5 + 2 par Maison possédée (5, 7, 9, 11…) ; en bataille, par Maison
   vivante ; chaque
   unité en occupe `populationCost` (Piquier, Fantassin et Archer 1,
   Oracle 2, Mage et Vengeur 3, Sentinelle 5). Affichée par le HUD « Pop. N / M » et dans la boutique.
   Un recrutement qui dépasserait le maximum est refusé ; la production
   des bâtiments est limitée de la même façon (§6).
2. **Démarrage direct**. La run part de l'arène officielle (§11) remise à
   neuf. La Baliste est créée directement à la position définie par la
   carte (`MapDef.ballista`, (0.5, 15.5) pour l'arène) : il n'y a plus de
   placement manuel de la tour. La caméra reprend son angle par défaut et
   cadre toute la carte, puis la préparation commence.
3. **Phase de placement**. La boutique s'ouvre automatiquement. Le joueur
   peut :
   - déplacer, sélectionner et vendre ses unités ;
   - acheter, poser et déplacer des bâtiments ;
   - ouvrir une Forge possédée pour acheter des améliorations (§14) ;
   - améliorer une Mine ou une Caserne depuis sa fiche (§6) ;
   - utiliser un parchemin de soin.

   **Sélection des unités**, avec les mêmes gestes qu'en bataille et dans
   l'éditeur :
   - clic gauche pour une sélection simple ;
   - Maj + clic pour ajouter ou retirer (Maj + clic dans le vide ne change
     rien) ;
   - glisser depuis le sol pour un rectangle de sélection (depuis une
     unité, le glisser la déplace ou la vend) ;
   - double-clic pour les unités du même type **visibles à l'écran**.

   **Déplacement des unités** :
   - au survol du terrain, un aperçu montre la destination de chaque unité
     sélectionnée : une empreinte verte (valide) ou rouge (invalide) et une
     silhouette translucide ;
   - un clic au sol, ou le glisser d'une unité, applique exactement le plan
     affiché :
     - au clic, le centre du groupe vient au point visé ;
     - au glisser, l'unité saisie arrive sous le curseur et le groupe suit ;
   - les unités bloquées prennent la case libre la plus proche (2 cases au
     plus), sans jamais se superposer ;
   - le déplacement est tout ou rien ;
   - après un déplacement réussi (unité seule ou groupe, au clic comme au
     glisser), la sélection est vidée et l'aperçu disparaît aussitôt ;
   - après un refus, rien ne bouge : la sélection et l'aperçu restent
     disponibles pour une nouvelle tentative ;
   - glisser une unité ou un groupe sur « Vendre » le vend, comme avant.

   Ce mécanisme est détaillé dans `EDITOR.md` §8. Les cases de destination
   doivent appartenir au territoire joueur (§11).

   **Sélection des bâtiments et de la Baliste** :
   - un clic sur une Mine, une Caserne ou une Forge possédée la sélectionne ;
     un second clic la désélectionne. Un glisser la déplace (§6) ;
   - la Baliste se sélectionne par un clic sur sa **base** (son empreinte au
     sol), jamais par le haut de la tour. Elle ne se déplace pas en
     préparation ;
   - l'élément sélectionné est entouré d'un anneau à la couleur du camp ;
   - les sélections sont **exclusives** : unités, un bâtiment ou la Baliste,
     jamais deux familles à la fois. Sélectionner l'une vide les autres.

   « Prêt pour la bataille » lance le combat. Une confirmation est demandée
   s'il reste plus de 30 % de l'or du début du placement
   (`PLACEMENT_GOLD_WARNING_RATIO`).
4. **Bataille automatique**. Le joueur intervient avec la Baliste, les
   parchemins de bataille et des ordres à ses unités. Le contrôle RTS est
   **permanent** pendant la bataille ; il n'y a pas de mode à basculer :
   - **clic gauche** : sélectionner une unité alliée, Maj + clic pour
     ajouter ou retirer, glisser pour un rectangle de sélection, double-clic
     pour les unités visibles du même type ; si un parchemin est armé, le
     clic gauche sert à l'utiliser ;
   - **clic gauche sur une Mine, une Caserne, une Forge ou la Baliste alliée** :
     inspection seule (fiche d'entité, ci-dessous), avec un anneau à la
     couleur du camp. Un bâtiment inspecté n'est **jamais commandable** : il
     ne reçoit ni ordre au clic droit ni Stop. L'inspection vide la sélection
     d'unités, et un clic sur une unité ou un rectangle la retire. Un second
     clic sur le même bâtiment la retire aussi. La Baliste n'est retenue que
     par son empreinte au sol, et une unité sous le curseur reste
     prioritaire ;
   - **clic gauche sur une unité ennemie** : inspection seule (fiche), un
     second clic la retire. Un **rectangle de sélection** qui contient au
     moins une unité alliée ne sélectionne que les alliés ; sans allié, il
     inspecte tous les ennemis encadrés. Un ennemi inspecté n'est **jamais
     commandable** (ni clic droit, ni S, ni ordre de groupe). Sélection
     alliée et inspection (ennemis ou bâtiment) ne coexistent jamais :
     l'une remplace l'autre ;
   - chaque unité sélectionnée ou ennemi inspecté porte l'**anneau d'unité
     commun**, identique en préparation et dans l'éditeur, proportionnel au
     rayon de l'unité. Sa couleur est celle du camp (bleu pour le joueur,
     rouge pour l'ennemi), pas une couleur de validation. Un ordre d'attaque
     accepté fait **clignoter** brièvement (environ 1 s) un anneau rouge de
     même taille sous la cible ; il n'y a plus d'anneau permanent sous une
     cible ;
   - **barres de PV** (unités, bâtiments et Baliste, des deux camps, en
     préparation comme en bataille) : visibles seulement pour une entité
     **blessée** ou **sélectionnée / inspectée** ; une entité intacte et non
     sélectionnée n'en a pas. Le remplissage prend la couleur du camp ;
   - **clic droit** : ordre aux unités sélectionnées (attaque si un ennemi
     est sous le curseur, sinon déplacement de groupe) ;
   - **ordre de déplacement > attaque de base** (2026-11-01) : l'unité
     n'attaque plus en chemin, et son attaque de base visible est coupée
     net (animation quittée à la frame suivante, fondu de 0,05 s) :
     - attaque **à élan** (`attackWindup` : Piquier, Vengeur) encore en
       cours : annulée **avant l'impact**, sans dégât ni tirage, recharge
       rendue ;
     - attaque déjà résolue (toutes les autres unités, dont le coup part au
       premier pas, ou élan terminé) : dégâts conservés ; la flèche visuelle
       qu'un Archer n'a pas encore lâchée est supprimée ;
     - la Provocation reste prioritaire sur l'ordre ; sorts (Boule de feu,
       soin de l'Oracle) et Provocation ne sont pas interrompus ;
   - **S** : Stop, les unités sélectionnées passent en Garde ;
   - **Q** : tir de la Baliste en mode MANUEL, sans effet en AUTO (voir §5) ;
   - caméra : Maj + clic droit pour pivoter, clic gauche + clic droit pour
     déplacer, molette pour zoomer (détail dans `EDITOR.md`, §13).

   **Début de bataille** (vraie bataille et « Tester le scénario ») : les
   ennemis avancent (en Mode survie, seul le premier groupe de la vague est
   présent, les autres arrivent en renfort, §10) ; les unités du joueur présentes au lancement font un
   pas d'ouverture d'exactement **une case** vers l'ennemi, formation
   conservée, puis passent en **Garde** : elles restent sur place et ne
   réagissent qu'à un ennemi entrant dans leur aggro, ou à un ordre. Le pas
   est tout ou rien : si une seule case d'arrivée est invalide (hors terrain,
   obstacle, bâtiment, Baliste, unité immobile), tout le groupe reste en
   place et passe directement en Garde. Les unités produites ensuite par
   une Caserne ou un Camp d'archerie passent directement en Garde, sans ce
   pas.
5. **Fin de bataille**, dès qu'un camp n'a plus de combattant (unités et
   bâtiments du joueur comptent tous les deux). La **victoire** exige en plus
   que tous les groupes ennemis de la vague soient apparus (§10) ; la
   défaite reste immédiate :
   - **Victoire** : une bannière, puis un rideau noir, derrière lequel sont
     versés le bonus d'or et appliquée l'étape d'expansion de la carte ;
     ensuite l'écran de bilan de la manche (ci-dessous), puis le placement
     de la vague suivante.
   - **Défaite** : écran « Partie terminée », puis retour au menu.
6. **Abandon** (Échap → Quitter → confirmation) : retour au menu. Les gains de
   méta-progression déjà obtenus pendant la run restent acquis (ils sont
   sauvegardés au fil des batailles), mais **aucune récompense supplémentaire
   n'est accordée à l'abandon**.

### Bilan de fin de vague

Sources : `run/battleSummary.ts`, `ui/screens.ts` (`showWaveComplete`),
`main.ts`.

Après une victoire, l'écran de fin de vague présente :

- « **VICTOIRE** », d'abord seul, puis « Vague N terminée » ;
- une ligne par type d'ennemi réellement vaincu pendant la manche
  (« Fantassins vaincus 8 », « Sentinelles vaincues 1 »), dans l'ordre
  Fantassin, Archer, Mage, Sentinelle (puis Oracle, Piquier et Vengeur,
  jamais ennemis aujourd'hui) ; aucune ligne à 0 ;
- « **Or gagné cette manche** », en dernier ;
- le bouton « Continuer », vers la préparation suivante.

Les lignes apparaissent une à une (environ 0,4 s d'écart), puis l'or, puis
le bouton ; l'écran reste affiché jusqu'au clic.

- **Ennemis vaincus** : comptés à leur mort réelle dans la simulation, une
  seule fois par unité (même détection que l'or des kills).
- **Or gagné cette manche** : tout l'or **gagné** pendant la manche, soit
  la récompense de chaque ennemi tué (Butin de guerre compris), chaque
  production de Mine et le bonus de victoire. N'y entrent ni l'or possédé
  au départ, ni les achats, reventes, annulations ou le bouton de debug.
  Le compteur repart de zéro au lancement de chaque vraie bataille.

### Fiche d'entité

Sources : `run/entityInfo.ts`, `ui/entityInfoPanel.ts`, `main.ts`
(`currentEntityInfo`, `updateEntityInfoPanel`).

Une fiche compacte décrit ce que le joueur a sélectionné, en préparation et
en bataille. Elle n'existe pas dans l'éditeur.

- **Sélections prises en charge** :
  - préparation : unité seule, groupe, Mine, Caserne, Forge, Baliste ;
  - bataille : unité alliée seule, groupe allié, unité ennemie inspectée,
    groupe d'ennemis inspectés, Mine, Caserne, Forge, Baliste (voir
    ci-dessus).
- **Valeurs** : ce sont celles réellement utilisées par le jeu, à l'**échelle
  du joueur** (PV et dégâts divisés par 10, comme les barres de vie), jamais
  les valeurs internes ×10. En préparation, elles sont recalculées avec les
  mêmes fonctions que l'apparition en bataille. En bataille, elles sont lues
  sur l'entité.
- **Niveau** : le titre devient « Nom — Niv. N » pour une entité qui a
  réellement un niveau d'amélioration : unités du joueur (niveau de
  production propre à chaque unité, §14), Baliste (niveau de Forge), chaque
  Mine et Caserne (niveau propre, §6), et en vraie
  bataille les Fantassins, Archers et Mages ennemis (niveau de vague,
  §10). Le niveau interne commence à 0 ; l'affichage commence à **Niv. 1**.
  Pas de niveau pour la Forge, la Sentinelle ennemie, ni les ennemis de
  « Tester le scénario ». Un groupe d'un seul type reprend ce niveau sur sa
  ligne de composition, seulement si tous ses membres ont le même. Une
  unité du joueur affiche aussi son **coût** (celui de son niveau) et sa
  population.
- **Contenu** (titre, camp, PV actuels / max avec une barre de PV) :
  - **Fantassin, Archer, Sentinelle, Piquier, Vengeur** : dégâts, portée (« Mêlée » ou en
    cases), cadence, vitesse, et l'esquive quand elle est non nulle. Ni rayon,
    ni aggro, ni chance de rater ;
  - **Mage** : PV et vitesse, puis la section **Attaque — Boule de feu**,
    son attaque affichée : dégâts (amélioration comprise), portée 2–6 cases,
    recharge. Son coup de repli au contact n'est pas affiché ;
  - **Sentinelle** : section **Provocation** : recharge, rayon, bouclier
    par ennemi provoqué (amélioration comprise) ;
  - **Oracle** : dégâts de repli, portée, cadence et vitesse comme le
    Fantassin, puis la section **Soin** : soin, portée, incantation,
    recharge ;
  - en bataille, chaque capacité indique son état (Prête, Recharge x.x s,
    Incantation, « Dans x.x s » pendant le verrou initial de la
    Provocation), et un bouclier actif s'affiche sous la barre de PV ;
  - **Mine** : PV, production (« 3 à 7 or »), fréquence (« toutes les
    60 s »), en jeu « Prochaine tranche : dans N s », et emprise. En préparation, aussi l'effet du niveau suivant et le bouton
    **« Améliorer la mine — N or »** (§6) ;
  - **Caserne / Camp d'archerie** : « Nom — Niv. N », PV, production
    (« 1 Piquier par manche »), recrutement débloqué (« Recrutement de
    Piquiers et de Fantassins (Niv. 2) », « Recrutement d'Archers ») et emprise. En préparation, au
    Niv. 1, aussi l'effet du Niv. 2 (« 1 Piquier et 1 Fantassin par manche ») et le
    bouton **« Améliorer — 20 or »** ; au Niv. 2, « Niveau maximum » et plus
    de bouton. En bataille, « En attente : N (population pleine) » ou
    « (aucune case libre) » tant que le quota de la manche n'est pas
    produit ;
  - **Forge** : PV et emprise. En préparation, la fiche porte le bouton
    **« Ouvrir la Forge »** (§14) ; en bataille, aucun bouton ;
  - **Tour** : « Tour — Niv. N », PV, dégâts, portée, cadence (« 1 tir /
    2.5 s ») et emprise. En préparation, aussi l'effet du niveau suivant
    (« +5 PV, +2 dégâts ») et le bouton **« Améliorer — N or »** (§6) ;
  - **Église** : « Église — Niv. N », PV, soin (« 5 PV par or »),
    recrutement débloqué (« Recrutement de Mages, d’Oracles et de Vengeurs ») et emprise. En préparation, aussi les PV manquants de l'armée, l'effet du
    niveau suivant (« +5 PV, +2 PV par or ») et les boutons **« Soigner
    l'armée — N or »**, **« Améliorer — N or »** et **« Améliorations de
    l'Église »** (§6, §14). En bataille, « En préparation uniquement » ;
  - **Baliste** : PV, dégâts par carreau, portée (« 18 cases »), recharge,
    carreaux par volée. En préparation : PV max / max,
    « Mode : Automatique au début de la bataille » et « Prête pour la
    bataille ». En bataille : PV de l'entité, mode de tir (« Automatique ·
    Cible : Ennemi le plus proche » ou « Manuel · Tir : Q vers le
    curseur »), bouton **« Passer en manuel » / « Passer en
    automatique »** (désactivé si elle est détruite), et état dynamique
    `PRÊTE`, `RECHARGE x.x s`, `EN VOL` ou `DÉTRUITE`, issu de la même
    source que le HUD de la Baliste ;
  - **Groupe** (allié sélectionné ou ennemis inspectés) : nombre d'unités,
    composition par classe (« 3 Fantassins »), PV cumulés actuels / max et
    nombre de blessées. Aucune moyenne de dégâts, de portée ou de vitesse.
    En bataille, seules les unités vivantes encore sélectionnées ou
    inspectées comptent.
- **Durées** : au dixième, sans « .0 » superflu (`0.4 s`, `5.5 s`, `12 s`).
  Les durées restantes suivent le format du HUD de la Baliste (`1.7 s`).
- **Héros** (2026-11-02) : **aucune fiche** quand il est sélectionné seul (un
  groupe qui le contient garde la fiche du groupe) ; ses statistiques sont
  dans son **inventaire** (touche **I** ou bouton « Inventaire (I) » de son
  encart) : PV, mana, dégâts, portée, cadence, vitesse, expérience, sac,
  sorts, et une section **Équipement** (vide : « les objets récupérés
  pendant la run apparaîtront ici »). Le jeu continue pendant qu'il est
  ouvert ; I, Échap ou × le referment (`ui/heroInventory.ts`).
- **Emplacement** : en haut à **droite** depuis le 2026-11-02, sous le compteur
  FPS (`right: 12px; top: 40px` ; en haut à gauche avant), 354 px de
  large, même style sombre que le HUD de la Baliste, liseré à la couleur du
  camp. Le titre est en grand (18 px) ; les lignes et les boutons sont à la
  taille du reste de l'interface (13 px).
- **Visibilité** : masquée sans sélection, en pause, sous la boutique ou la
  Forge,
  pendant le placement d'un bâtiment, pendant la transition de
  fin de vague, dans les menus et dans l'éditeur.
- **Mise à jour** : immédiate à chaque changement de sélection, sinon environ
  10 fois par seconde. Le DOM n'est reconstruit que si la forme de la fiche
  change.
- **Morts et destructions** : une unité morte quitte la sélection ou
  l'inspection, avec son anneau et sa barre ; la fiche disparaît quand plus
  rien n'est sélectionné. Une Mine, une Caserne ou une Forge détruite n'est
  plus inspectée. La Baliste détruite reste inspectable, avec l'état
  `DÉTRUITE`.

## 3. Unités

Sources : `data/units.ts`, `run/runState.ts` (`KILL_REWARD`).

Sept unités existent. Les quatre premières sont communes au joueur et à
l'ennemi ; l'Oracle, le Piquier et le Vengeur sont réservés au joueur. Le
**Héros**, unique et gratuit, est décrit au §6 bis, comme les deux
cavaleries (Cavalier léger, Razzieur), présentes seulement dans le
bestiaire et l'éditeur.

| Unité | Coût de base | PV | Dégâts | Portée / aggro | Cadence | Raté |
|---|---|---|---|---|---|---|
| Fantassin | 2 | 5 | 1 | 0,95 / 9 | 1,0 s | 12 % |
| Archer | 3 | 3 | 1,2 | 6 / 10 | 2,0 s | 5 % |
| Mage | 10 | 5 | 1 (mêlée de repli) | 0,95 / 10 | 2,0 s | 30 % |
| Sentinelle | 20 | 50 | 1 | 0,95 / 9 | 1,5 s | 12 % |
| Oracle | 15 | 3 | 0,5 (mêlée de repli) | 0,95 / 10 | 2,0 s | 30 % |
| Piquier | 1,5 | 4 | 0,8 | 1,4 / 9 | 1,2 s (élan 0,3 s) | 8 % |
| Vengeur | 25 | 10 | 2 | 0,95 / 9 | 0,6 s (élan 0,2 s) | 10 % |

- **Mage** :
  - s'arrête à 6 cases de sa cible (`engageRange`) ;
  - capacité **Boule de feu** : 4 dégâts à chaque ennemi touché, rayon 2,
    portée 2 à 6, recharge 5,5 s, incantation 0,6 s, recul d'une case.
- **Sentinelle**, capacité **Provocation** :
  - force les ennemis proches à la cibler (rayon dérivé de celui de la
    Boule de feu, environ 4,6 cases) ;
  - gagne un bouclier de 3 par ennemi provoqué, pendant 10 s ;
  - recharge 12 s, et indisponible pendant les 7 premières secondes de la
    bataille.
- **Oracle** (2026-11-01, valeurs PROVISOIRES sauf le coût, voir
  `DESIGN_DECISIONS.md` B7) : population 2, vitesse 2 cases/s, rayon 0,44 ;
  s'arrête à 3,5 cases de sa cible ennemie (`engageRange`) ; capacité
  **Soin** :
  - soigne l'allié blessé à 4,5 cases ou moins dont la part de PV est la
    plus faible (puis le moins de PV, le plus proche, le plus petit id) ;
    jamais lui-même ni un bâtiment ; un soin déjà en incantation par un
    autre Oracle compte comme rendu ;
  - incantation de 1 s, puis **2 PV rendus à la fin** de l'incantation
    (plafonnés aux PV max) ; recharge 4 s depuis le début de l'incantation ;
  - cible morte, invalide ou à plus de 5,5 cases à la fin : soin perdu,
    recharge conservée. Oracle tué pendant l'incantation : rien n'est
    soigné ;
  - sans allié blessé, il n'incante pas et garde sa recharge ;
  - effets du parchemin (halo doré, « +2 ») sur l'allié soigné, Oracle
    tourné vers lui pendant l'incantation ; pas de télégraphe au sol ; ne
    déclenche pas « Soins excédentaires ».
- **Piquier** (2026-11-01, valeurs PROVISOIRES, `DESIGN_DECISIONS.md` B8) :
  population 1, 2 cases/s, rayon 0,45. Lance et petit bouclier ; sa portée
  de 1,4 lui permet de frapper depuis le deuxième rang. Coup d'estoc
  résolu 0,3 s après le début du geste (élan).
- **Vengeur** (2026-11-01, valeurs PROVISOIRES, B9) : population 3,
  2,6 cases/s, rayon 0,5. Deux épées ; coup résolu 0,2 s après le début du
  geste, environ 3 dégâts par seconde (cadence réelle 0,633 s, voir
  `KNOWN_ISSUES.md` KI-30). Ni bouclier ni capacité.
- **Élan** (`attackWindup`, Piquier et Vengeur seulement) : le rate,
  l'esquive et les dégâts arrivent à la fin de l'élan, sur la cible
  verrouillée au départ, si elle est vivante et à portée (+0,2 case) ;
  sinon le coup est perdu. Le cooldown part au début du geste. Un ordre
  de déplacement pendant l'élan l'annule (§2). Les autres unités frappent
  toujours au premier pas.
- **Valeur au kill et à la revente** (`KILL_REWARD`) : Fantassin 1, Archer
  1,5, Mage 5, Sentinelle 20, Oracle 7,5, Piquier 0,75, Vengeur 12,5.
- Le coût payé en partie est le coût de base **plus le surcoût du niveau
  de production courant** de l'unité (§14) : Fantassin et Archer +1 or,
  Mage +3, Sentinelle +10 par niveau ; l'Oracle, le Piquier et le Vengeur
  n'ont pas de niveau de production (coût fixe). La boutique affiche ce coût, le niveau
  (« Niv. N ») et, en infobulle, les stats de la prochaine recrue.

## 4. Déblocage des unités

Sources : `data/units.ts` (`playerUnlockMode`), `run/metaProgress.ts`
(`canPlayerRecruitUnit`, `registerEnemyDefeat`).

- **Fantassin et Archer** : recrutables seulement si le joueur possède au
  moins une **Caserne** (Fantassin) ou un **Camp d'archerie** (Archer)
  (`run/recruitment.ts`, d'après `BuildingDef.recruitmentUnlock`). Sinon,
  le bouton reste visible mais désactivé, avec « Nécessite une Caserne » ou
  « Nécessite un Camp d'archerie » en infobulle, et l'achat est refusé.
  L'armée de départ n'est pas concernée. Les unités déjà possédées restent. Un bâtiment détruit en
  bataille bloque le recrutement à la préparation suivante s'il était le
  dernier ; en construire un le débloque aussitôt.
- **Mage et Sentinelle** (`defeatEnemy`) : recrutables après avoir vaincu au
  moins un exemplaire **ennemi** de ce type.
  - Le **Mage** exige en plus au moins une **Église** possédée, selon la
    même règle que le Fantassin et l'Archer (« Nécessite une Église »). Les
    Mages possédés restent si la dernière Église est détruite.
  - La Sentinelle n'exige aucun bâtiment.
  - Le déblocage est permanent, enregistré dès la mort de l'ennemi
    (`defeatedEnemyUnitIds`) et signalé par un toast.
  - Tant qu'elles ne sont pas débloquées, ces unités sont masquées dans la
    boutique.
- **Oracle** (`starter`) : recrutable dès la première run, à condition de
  posséder au moins une **Église** (« Nécessite une Église »). Sans Église,
  sa ligne de boutique est masquée (`refreshShop`).
- **Vengeur** (`starter`) : même règle que l'Oracle (Église).
- **Piquier** (`starter`) : recrutable avec une **Caserne** ; il est en tête
  de la boutique. Le **Fantassin** exige désormais une **Caserne Niv. 2**
  (`RecruitmentUnlockConfig.minLevels`, décision d'Antoine ; « Nécessite
  une Caserne Niv. 2 ») ; sa ligne est masquée en dessous. L'armée de
  départ garde ses 4 Fantassins (soldats déjà disponibles en début de run).
- `MAGE_UNLOCK_WAVE` (`config/constants.ts`) ne règle que l'**apparition des
  Mages ennemis**, pas leur déblocage pour le joueur.

## 5. La Baliste (tour du joueur)

Sources : `config/constants.ts` (`PLAYER_ARROW_*`, `TALENT_*`,
`MACHINE_GUN_*`), `data/buildings.ts`, `run/ballistaStats.ts` (valeurs
effectives du tir), `sim/playerArrow.ts`, `sim/ballistaAuto.ts` (mode
AUTO), `main.ts`.

- **Bâtiment** : 25 PV de base. La Baliste compte pour la survie du camp
  joueur. Une fois détruite, elle ne tire plus.
- **Position** : celle de la carte (`MapDef.ballista`, sinon le repli
  historique du coin), dans le Mode survie comme dans l'éditeur et « Tester
  le scénario ». Pour l'arène du Mode survie : (0.5, 15.5). Le joueur ne la
  place ni ne la déplace ; pendant la run, elle ne bouge qu'à l'étape C de
  l'agrandissement, en reculant d'une case avec le camp joueur (§11).
  Voir `EDITOR.md` §16 pour l'éditeur.
- **Tir** : un carreau en arc vers un point du sol, résolu à l'arrivée
  (ennemi le plus proche du point visé dans le rayon d'impact).
  - Valeurs de base : 2 dégâts, recharge d'environ 2,31 s
    (`PLAYER_ARROW_COOLDOWN = 3 / 1.3`).
  - Vitesse 13,5 cases/s, rayon d'impact 0,63.
  - **Portée maximale fixe de 18 cases** (`PLAYER_ARROW_RANGE`), la même en
    AUTO et en MANUEL, mesurée du centre de la Baliste au point visé : la
    moitié de la profondeur de l'arène (36 cases). Depuis sa position, elle
    porte un peu au-delà du milieu du terrain, sans atteindre la zone de
    départ ennemie. Un tir hors de portée est refusé sans toucher à la
    recharge.
  - Le tir est refusé pendant la recharge et tant que la volée précédente
    est encore en vol.
  - La Baliste ne tire jamais hors bataille, en pause ni pendant la
    transition de fin de vague.
- **Modes de tir** : chaque bataille commence en **AUTO** (y compris
  « Tester le scénario »), quel que soit le mode de la bataille précédente.
  Le joueur bascule entre AUTO et **MANUEL** depuis la fiche de la Baliste
  (clic sur sa base). Les deux modes utilisent la **même fonction de tir**
  et la **même recharge** de la simulation : changer de mode ne modifie
  jamais la recharge et ne donne aucun tir supplémentaire.
- **Mode AUTO** (`sim/ballistaAuto.ts`, décidé à chaque pas fixe) :
  - cible l'unité ennemie vivante valide la plus proche de la Baliste **dans
    sa portée** (jamais un bâtiment ; égalité tranchée par l'id) ; personne
    à portée : aucun tir ;
  - une cible acquise est conservée tant qu'elle reste valide et à portée ;
    à sa mort ou si elle sort de portée, la plus proche suivante à portée
    est choisie ;
  - un point anticipé au-delà de la portée n'est pas tiré : la Baliste
    attend le pas suivant ;
  - tir anticipé déterministe : la vitesse de la cible est celle observée
    au dernier pas fixe (`(x − prevX) / dt`, plafonnée à 2 × sa vitesse
    de marche) ; la prédiction résout l'interception carreau / cible en
    ligne droite (plus petite racine positive de
    `|P + V·t − O| = vitesse du carreau × t`, repli sur distance / vitesse
    sans solution) et vise `P + V·t`, avec `t` plafonné à 2,5 s. Une
    cible qui change de direction après le tir peut être ratée ;
  - Q est sans effet ; le réticule est masqué et la Baliste s'oriente vers
    sa cible.
- **Mode MANUEL** : aucun tir automatique. Un appui sur **Q** tire vers le
  point du sol sous le curseur, recalculé au moment de l'appui (la caméra a
  pu bouger depuis le dernier mouvement de souris).
  - Point visé au-delà de la portée : tir refusé, recharge intacte ; le
    réticule devient rouge.
  - Q est sans effet quand le focus est dans un champ de saisie. La
    répétition automatique du clavier ne déclenche pas de tir.
  - Tirer ne modifie ni la sélection des unités, ni un rectangle de
    sélection en cours, et n'émet aucun ordre.
- **Avec le talent Tir rapide** :
  - cadence +60 %, vitesse du projectile +100 %, +2 dégâts ;
  - en MANUEL, maintenir Q tire en continu à la cadence effective. Sans
    le talent, maintenir Q ne tire qu'une fois.
- **Avec le talent Mitraillette** :
  - le total des bonus de cadence est multiplié par 3 ;
  - chaque tir envoie 3 carreaux sous une seule recharge. Les deux
    supplémentaires visent les deux ennemis les plus proches du point visé
    (le curseur en MANUEL, le point anticipé en AUTO), dans un rayon de 3.
- **Amélioration de Forge « Baliste »** : voir §14.
- **Parchemin armé** : le clic gauche sert au parchemin. En MANUEL, Q tire
  quand même avec la Baliste, et le parchemin reste armé.
- **Réticule** (MANUEL seulement) : un anneau doré discret suit le sol sous
  le curseur pendant la bataille, plus visible quand la Baliste est prête,
  presque transparent pendant la recharge, masqué si elle est détruite. La
  Baliste s'oriente vers lui.
- **HUD de la Baliste** (`ui/ballistaIndicator.ts`), unique, en bas au
  centre, visible en bataille hors pause :
  - `AUTO BALISTE — <état>` (préfixe vert) en AUTO, `[Q] BALISTE — <état>`
    en MANUEL, avec l'état `PRÊTE`, le temps de recharge
    restant (`1.4 s`), `EN VOL` (recharge terminée mais volée précédente
    encore en vol) ou `DÉTRUITE` (bloc grisé) ;
  - une barre de recharge intégrée, calculée sur la recharge **effective**
    (bonus de cadence compris) : pleine et dorée quand la Baliste est
    prête, pleine en vol, vide si elle est détruite ;
  - en petit, le nombre d'unités sélectionnées (ligne masquée quand rien
    n'est sélectionné).

## 6. Bâtiments gameplay : Mine, Caserne, Camp d'archerie, Forge, Tour et Église

Sources : `data/buildings.ts`, `data/mineUpgrade.ts`, `run/buildingUpgrades.ts`,
`run/mineUpgradeEffects.ts`, `run/recruitment.ts`,
`run/buildingUpgradeEffects.ts`, `sim/systems/buildingProduction.ts`,
`sim/systems/buildingAttack.ts` (tir de la Tour), `render/projectiles.ts`,
`run/churchHeal.ts` (soin de l'Église), `main.ts`.

Ils s'achètent en Or dans l'onglet « Bâtiments » de la boutique de run.

- **Achat** : cliquer sur le bâtiment passe en mode placement. L'or n'est
  payé qu'au clic de confirmation sur un emplacement valide, dont toute
  l'emprise est en territoire joueur ; Échap ou clic droit annule sans
  rien payer.
- **Rotation** : Ctrl+molette pendant le placement, par pas de 45°.
- **Déplacement** : un bâtiment possédé se déplace gratuitement en le
  faisant glisser pendant le placement.
- **Persistance** : les bâtiments restent d'une vague à l'autre, avec leurs
  PV. Un bâtiment détruit en bataille disparaît de la run à la fin de la
  vague. Plusieurs exemplaires de chaque bâtiment sont possibles.
- **Survie du camp** : ces bâtiments comptent pour la défaite
  (`countsForDefeat`), comme les unités et la Baliste — sauf les murailles.

**Murailles** (`wall`, `wall_gate` dans `data/buildings.ts` ; modèles KayKit
du dossier « neutral », visuel neutre non teinté, mais constructions du
**joueur**) :

- **Unité canonique : une case = un segment de mur** (2026-11-01) : données,
  PV, pose, sauvegarde, sélection et destruction se font par case.
  **Muraille** : 25 PV, emprise 1 × 1, coût **provisoire** 0,5 or par case
  (même densité et même prix qu'avant). **Porte de muraille** : seule pièce
  de 2 cases (modèle à battants), 50 PV, 1 or, posée sur **deux cases de mur
  alignées**, qu'elle remplace. Rendu : deux cases voisines d'une même ligne
  (même orientation, même camp) affichent ensemble le modèle KayKit à sa
  longueur native ; une case seule, le modèle comprimé à une case
  (`render/wallVisuals.ts`). Une case d'une paire qui tombe : les deux sont
  redessinées seules. Anciennes cartes : un segment de 2 cases est migré en
  deux cases au chargement (`migrateLegacyWalls`, PV partagés).
  Aucune attaque, aucun effet, aucune population, aucune amélioration ; ne
  comptent pas pour la défaite.
- **Muraille** : bloque le déplacement de **toutes** les unités, son camp
  compris (contourner ou passer par une porte). Les **tirs passent**
  par-dessus (`blocksShots: false`), pour le mur comme pour la porte.
- **Porte de muraille** (`BuildingDef.gate`, `sim/systems/gates.ts`) : vraie
  porte de son camp.
  - Ses unités la comptent toujours comme un passage dans leurs trajets, même
    fermée (pas de détour) ; elle s'ouvre quand l'une d'elles est à moins de
    **1,5 case** de son emprise, en **0,5 s** ; les unités ne la franchissent
    physiquement qu'à partir de **60 %** d'ouverture (avant, elles attendent
    contre les battants) ; elle reste ouverte tant qu'une unité alliée est
    proche ou dedans, puis se referme **1 s** après le dernier passage (en
    0,5 s), jamais sur une unité. Réglages centralisés dans `data/buildings.ts`.
  - États fermée / ouverture / ouverte / fermeture, au pas fixe, sans hasard :
    la simulation décide, le rendu anime les deux battants du modèle.
  - Pour le camp adverse, elle reste **toujours fermée**, même ouverte pour un
    allié : il ne peut que l'attaquer. Détruite (0 PV), le passage est libre
    pour tout le monde.
- **Ennemis** : un mur ou une porte est ciblable comme tout bâtiment (cible
  la plus proche dans l'aggro) ; une enceinte fermée est donc attaquée,
  jamais un blocage éternel. Détruit (0 PV), il disparaît et sa case
  redevient franchissable.
- **Tracé continu** (mode Muraille de la préparation ; même tracé dans
  l'éditeur, voir `EDITOR.md`) : choisir « Muraille » en boutique ; le
  premier clic fixe le point de départ, chaque clic suivant construit la
  **portion** de l'ancre au point cliqué (horizontale ou verticale selon
  l'**axe dominant**, jamais de diagonale) puis son extrémité devient la
  nouvelle ancre : A, B, C, D, A trace un carré fermé à 4 virages.
  - **Structure** : tronçons droits et **virages** (une case, vraie pièce
    de coin KayKit) à chaque changement de direction : `ligne — virage —
    ligne`. Un carré fermé = 4 côtés + 4 virages.
  - **Longueur exacte** : une portion couvre exactement les cases demandées
    (clic de A à B = toutes les cases de A à B), une case par segment. Un
    second clic sur la case de départ pose une muraille d'une case.
  - **Cases en attente** (contour sans modèle) pendant le tracé : l'ancre
    (virage ou prolongement droit, décidé au clic suivant), le point de
    départ (virage à la fermeture). Elles sont payées avec leur portion.
  - **Fin du tracé sans fermeture** (Échap, clic droit, autre bâtiment choisi
    en boutique, sortie du mode, début de bataille) : les cases en attente
    deviennent des pièces droites — une ligne, un L ou un U ouverts restent
    complets.
  - **Reprise d'une muraille existante** : en mode Muraille, chaque
    extrémité ouverte des murailles du joueur porte un petit repère doré.
    Un premier clic sur l'extrémité (ou sur la case libre juste après) s'y
    aimante (« reprendre la muraille ici ») : le tracé repart de là, avec la
    direction et l'orientation de la muraille existante. Prolonger tout
    droit la continue sans jonction ; tourner pose un vrai virage à la place
    de la pièce terminale. Le dernier clic peut aussi s'aimanter sur
    l'extrémité d'une AUTRE muraille (« relie les murailles ») ou sur l'autre
    bout de la muraille reprise (« ferme l'enceinte »).
  - La disposition est recalculée sur la chaîne COMPLÈTE (même découpage
    qu'un tracé fait en une fois : à géométrie égale, résultat identique) ;
    seules les pièces qui changent sont recomposées. **Coût net** :
    nouvelles pièces − valeur des pièces remplacées (½ or par case droite,
    1 or par virage), affiché dans l'aperçu (« dont X or de raccord »). **PV**
    : une pièce recomposée garde le pourcentage de PV des cases qu'elle
    reprend (jamais de réparation gratuite) ; une case neuve part à 100 %.
  - **Refusés** : démarrer ou passer sur une muraille ailleurs qu'à une
    extrémité, une jonction en T au milieu d'un segment, et tout raccord qui
    transformerait une **porte** (il faut prolonger droit d'abord). Un
    virage existant en extrémité ne se prolonge que dans l'axe de son bras
    libre.
  - Aperçu de la portion **avant** le clic : segments, virage qui prendra la
    jonction précédente (et virages D et A à la fermeture), cases en
    attente ; vert ou rouge, nombre de cases et coût. Tout ou rien par
    portion : une portion invalide (hors territoire, obstacle, bâtiment,
    unité, or insuffisant) ne pose rien, le reste du tracé est intact.
  - **Fermeture** : un clic sur le point de départ ou une case voisine (si
    l'ancre lui est alignée) se cale sur lui, pose le dernier côté et les
    virages D et A, et termine le tracé (« ferme l'enceinte ») ; le mode
    reste actif. Elle exige un virage en A (sinon aperçu rouge).
  - **Coût** (provisoire) : ½ or par case droite (case en attente comprise),
    1 or par virage. La finalisation d'un tracé ouvert ne coûte rien de
    plus. Un virage a 50 PV, une case droite 25 PV ; tous deux bloquent les
    deux camps, laissent passer les tirs ; emprise 1 × 1.
- **Dégâts et destruction des bâtiments** (2026-11-01,
  `render/buildingDamageFx.ts`, rendu seul) : fumée légère à 75 % de PV ou
  moins, épaisse et sombre à 40 % ou moins ; foyers, débit et taille des
  volutes proportionnés à l'emprise du modèle. Renforcée le 2026-11-01 :
  légère, gris clair, 1 à 3 foyers, 2 volutes / s / foyer, opacité 0,8
  (gris moyen, 1 à 2 foyers, 0,9 volute / s et 0,35 avant) ; épaisse,
  3,4 volutes / s / foyer, opacité 0,85, plus sombre, plus haute et plus
  large (2,4 et 0,6 avant) ; 48 volutes au plus par bâtiment. À la destruction : secousse,
  affaissement, nuage de poussière, débris low-poly, puis disparition (la
  simulation a déjà retiré le bâtiment). Hasard visuel à graine ; flash,
  fumée et effondrement figés pendant la pause.
  - **Créneaux vers l'extérieur** : un seul côté intérieur pour tout le
    tracé (continuité). Enceinte fermée : l'intérieur du polygone (dans les
    deux sens de dessin). Tracé ouvert : le côté de la **Baliste** par
    rapport à la portion la plus proche d'elle. Les segments droits ont leurs
    créneaux à l'opposé ; un virage qui tourne autour de l'intérieur prend
    la variante `outside` (créneaux sur le côté bombé), un virage rentrant la
    variante `inside`. Tout le tracé est réorienté à chaque portion validée
    (seules rotation et variante de virage changent). Une porte posée sur un
    mur reprend son orientation (`ASSETS.md` §3.5).
  - **Échap / clic droit** pendant un tracé : termine le tracé (aperçu de la
    portion suivante abandonné, cases en attente construites) ; le mode
    reste actif. Sans tracé en cours, Échap / clic droit quittent le mode.
- **Porte** : outil séparé, posée à l'unité (Ctrl + molette : 90°). Posée
  **exactement** sur un segment de mur (même emprise), elle le **remplace** :
  mur — porte — mur sans trou ; on paie la porte, le mur n'est pas remboursé.

| | Mine | Caserne | Camp d'archerie | Maison | Forge | Tour | Église |
|---|---|---|---|---|---|---|---|
| Coût en partie | 20 | 15 | 15 | 5 | 10 | 20 | 35 |
| PV / emprise | 15 / 2×2 | 25 / 3×3 | 25 / 3×3 | 10 / 2×2 | 15 / 2×2 | 15 / 2×2 | 15 / 2×2 |
| Effet | Produit de l'or pendant la bataille (voir ci-dessous) | Débloque le recrutement des Piquiers (Fantassins au Niv. 2) ; produit 1 Piquier par manche, plus 1 Fantassin au Niv. 2 (voir ci-dessous) | Débloque le recrutement des Archers et en produit (voir ci-dessous) | +2 population maximale (§2) | Accès aux améliorations de production des unités et de la Baliste (§14) ; aucun effet passif | Tire des flèches sur les unités ennemies (voir ci-dessous) | Soigne l'armée contre de l'or ; débloque le recrutement du Mage, de l'Oracle et du Vengeur (§4) ; accès aux améliorations des parchemins et de Soins excédentaires (voir ci-dessous et §14) |

Le coût d'achat est fixe : il ne dépend d'aucune amélioration (une Mine
coûte toujours 20, une Caserne toujours 15).

**Amélioration de la Mine, de la Caserne, du Camp d'archerie, de la Tour et
de l'Église** :

- chaque Mine, Caserne, Camp d'archerie, Tour et Église a son **propre
  niveau**
  (`OwnedBuilding.level`), affiché à partir de « Niv. 1 » ; deux bâtiments
  du même type peuvent avoir des niveaux différents ;
- il s'achète depuis la fiche du bâtiment, en préparation seulement
  (« Améliorer la mine — N or », « Améliorer — N or » pour les autres ;
  bouton désactivé si l'or manque). Il n'agit que sur ce bâtiment ;
- prix : base × 2^niveau, la base étant propre au bâtiment
  (`BuildingDef.upgradeGoldCostBase`) : 25 / 50 / 100 / 200… or pour la
  Mine, 5 / 10 / 20 / 40… pour la Tour et l'Église. La Caserne et le Camp
  d'archerie n'ont qu'**une** amélioration, Niv. 1 → Niv. 2 pour 20 or
  (`BuildingDef.maxUpgradeLevel`) ; elle n'ajoute ni PV ni autre bonus.
  Indépendant du prix des améliorations d'unités à la Forge ;
- un niveau qui augmente les PV max (Tour, Église) augmente aussi les PV actuels du
  même écart : les PV manquants restent les mêmes ;
- le niveau suit le bâtiment d'une vague à l'autre, et disparaît avec lui
  s'il est détruit.

Production de la Mine (Survie en temps réel, 2026-11-02) :

- toutes les **60 s de simulation**, chaque Mine **terminée** et vivante
  produit un montant entier tiré dans la tranche de son niveau : 3 à 7 or au
  niveau 1, puis +2 / +2 par niveau (5 à 9, 7 à 11…) ; premier versement
  60 s après la fin du chantier, puis indéfiniment, **sans plafond** ni lien
  avec les vagues ; la pause arrête le minuteur ;
- le tirage est pseudo-aléatoire et déterministe (générateur à graine,
  re-semé depuis la graine de la bataille) ;
- « +N or » s'affiche au-dessus de la Mine ;
- l'ancien plafond de 5 productions par manche et la pause entre deux
  groupes de renforts (jeu en manches) n'existent plus. La fiche indique
  « Prochaine tranche : dans N s » ;
- un chantier de Mine ne produit rien ; jamais dans « Tester le
  scénario » ; une Mine détruite s'arrête aussitôt.

Production de la Caserne et du Camp d'archerie :

- **Une fois par manche** : au début de chaque bataille, chaque bâtiment
  reçoit la liste d'unités de son niveau (`UnitProductionConfig.unitsByLevel`),
  produite dans l'ordre, gratuitement, dès que possible :
  - Caserne : **1 Piquier** au Niv. 1, **1 Piquier puis 1 Fantassin** au
    Niv. 2 (2026-11-01) ;
  - Camp d'archerie : 1 Archer au Niv. 1, 2 au Niv. 2.

  Aucun minuteur, aucune production répétée Aucun minuteur, aucune production répétée
  pendant la bataille. Chaque bâtiment produit son propre quota.
- **Population** : le quota est limité aux places libres ; ce qui manque
  attend et réessaie pendant la bataille (une mort libère une place).
  L'ordre est gardé : une Caserne Niv. 2 avec une seule place produit le
  Piquier, le Fantassin attend. Un
  quota non produit à la fin de la bataille est perdu, sans cumul.
- **Cases** : les unités apparaissent sur des cases libres autour de
  l'emprise, les plus avancées vers le champ de bataille d'abord ; si
  toutes sont occupées, le quota attend une case libre.
- **Lot partiel, volontaire** : un Camp Niv. 2 (quota 2) avec une seule
  place produit 1 Archer et garde l'autre en attente. Plusieurs bâtiments
  se servent dans l'ordre stable des entités (ordre d'achat) : avec une
  seule place, la Caserne achetée en premier produit, le Camp attend la
  prochaine place libérée.
- **Bonus** : les unités produites reçoivent les mêmes bonus qu'une unité
  achetée : talents, et niveau de production courant **au moment de leur
  apparition** (§14).
- **Comportement** : ils passent directement en Garde, sans pas
  d'ouverture (§2).
- **Persistance** : ils **ne rejoignent pas** l'armée qui persiste entre les
  vagues.
- **Modèles** : `blue_barracks` et `blue_archeryrange` (KayKit), ajustés à
  l'emprise 3×3. Aucun des deux n'est posé automatiquement sur la carte du
  Mode survie.

Tir de la Tour (modèle `blue_tower_A`, affiché à 0,8 de son emprise
pour rester à la hauteur de la Caserne et de la tour de la Baliste) :

- **Valeurs** (provisoires, playtest), centralisées dans
  `BuildingDef.attack` : 4 dégâts au niveau 1, +2 et +5 PV par niveau
  (15 PV · 4 dégâts, puis 20 · 6, 25 · 8, 30 · 10…) ; portée 12 cases,
  que les niveaux ne changent pas (Archer : 6 ; Baliste : 18) ; 1 tir
  toutes les 2,5 s (Archer :
  2,0 s ; Baliste : 2,31 s).
- **Ciblage** : l'unité ennemie vivante la plus proche à portée (jamais un
  bâtiment ; égalité tranchée par l'id), conservée tant qu'elle reste
  vivante et à portée ; sinon la plus proche suivante. Aucun mode manuel.
- **Flèche** : vrai projectile simulé (18 cases/s), qui part sous
  l'avant-toit, du côté de la cible, et suit sa cible comme une flèche
  d'Archer. Les dégâts s'appliquent **à l'impact**, si la cible vit encore ;
  morte entre-temps, la flèche est perdue. Pas de jet de raté ni de ligne de
  tir : déterministe.
- **Destruction** : une Tour détruite ne tire plus et oublie sa cible ; ses
  flèches déjà en vol arrivent normalement.
- La Tour n'apporte aucune population.

Soin de l'Église (modèle `blue_church`, ajusté à l'emprise 2 × 2) :

- **Action** « Soigner l'armée — N or » sur sa fiche, **en préparation
  uniquement** (en bataille, la fiche indique « En préparation
  uniquement », sans bouton) : rend à toutes les unités possédées du joueur
  leurs PV manquants, jusqu'au maximum propre à chacune (niveau de
  production compris). Jamais les bâtiments, la Baliste ni les ennemis.
- **Coût** : `ceil(PV manquants de toute l'armée / efficacité)`, avec
  l'efficacité de **cette** Église à son niveau : 5 PV par or au niveau 1,
  +2 par niveau (5, 7, 9, 11…) ; elle gagne aussi +5 PV max par niveau
  (15, 20, 25, 30…). Exemple : 23 PV manquants à 5 PV/or → 5 or.
- **Tout ou rien** : pas de soin partiel ; bouton désactivé (coût affiché)
  si l'or manque ; « Armée déjà au maximum », désactivé, si personne n'est
  blessé (aucun or dépensé). Plusieurs Églises ne cumulent rien : chacune
  soigne avec sa propre efficacité.
- **Améliorations** : « Améliorations de l'Église » ouvre les améliorations
  de run des parchemins et de Soins excédentaires (§14).
- **Recrutement** : posséder au moins une Église débloque le recrutement
  du Mage, de l'Oracle et du Vengeur (§4).
- Une Église détruite disparaît de la run comme les autres bâtiments.

La Forge (modèle `blue_blacksmith`) est un vrai bâtiment : ciblable,
destructible, collidable. Elle n'a ni production ni revenu ; toutes les
Forges ouvrent la **même** boutique d'améliorations, sans bonus par
exemplaire. Elle n'améliore plus la Mine ni la Caserne. Si toutes les Forges sont détruites, les améliorations déjà
achetées restent actives, mais aucun nouvel achat n'est possible tant
qu'une Forge n'est pas reconstruite.

## 6 bis. Héros, ressources, carte procédurale (direction Hero RTS, provisoire)

Sources : `data/hero.ts`, `sim/systems/hero.ts`, `config/resourceNodes.ts`,
`config/maps/proceduralSurvival.ts`, `run/runState.ts`,
`run/harvestPermissions.ts`, `render/fogOfWar.ts`, `render/resourcePiles.ts`,
`ui/heroHud.ts`, `main.ts` (`toggleHeroCamera`, `updateFogOfWar`,
`ringEnemyWavePlan`). Choix d'Antoine et valeurs provisoires :
`DESIGN_DECISIONS.md` G4 à G9.

**Départ** : le **Héros** seul, avec la **Baliste** au centre de la carte.
Aucun Homme d'armes, stock **0 bois, 0 pierre**, 20 or, Pop. 0 / 5. La
Baliste est le cœur du camp : point de dépôt des ressources, point de vision,
et l'un des deux éléments de la défaite par le Héros.

**Héros** (`hero`) :

- unique, gratuit, hors population, jamais vendu. Il reste dans l'armée de
  la run même s'il est à terre en fin de manche, et revient alors à pleins
  PV ; vivant, il garde ses PV comme les autres unités (l'Église le soigne
  jusqu'aux PV de son niveau) ;
- stats affichées : 30 PV, 2,5 dégâts, portée 1, aggro 9, cadence 1,1 s,
  5 % de raté, vitesse **4,16** (2,6 avant le 2026-11-02 : +60 %, demande
  d'Antoine), rayon 0,6 ;
- **niveaux** : niveau 2 à 50 XP (+7,5 PV, +0,6 dégât, +0,24 vitesse),
  niveau 3 à 150 XP (+15 PV, +1,2 dégât, +0,48 vitesse, cumulés ; bonus de
  vitesse augmentés de 60 % avec la base). Niveau 3
  maximum ;
- **XP en zone partagée** : chaque unité adverse (pas un bâtiment) morte à
  6 cases ou moins du Héros vivant lui donne max(4, coût × 4) XP, **30 au
  plus par mort**, quel que soit le tueur (Maraudeur 8, Traqueur 12,
  Féticheur, Colosse, Ravageur et Razzieur 30). XP, niveau et morts sont
  gardés sur toute la run ;
- **mort** : retour près de la Baliste après 15 s (première mort de la run),
  30 s, 60 s, puis 90 s au plus, à pleins PV et en Garde. **Défaite** si le
  Héros est à terre et que la Baliste est détruite ;
- **Héros joué** (2026-11-02) : choisi sur l'écran « Choisir votre Héros »
  avant chaque partie Survie (`ui/heroSelect.ts`, données `data/heroes.ts`) ;
  un seul aujourd'hui, le **Paladin** (le Héros ci-dessus), présélectionné ;
- **mana** (2026-11-02, PROVISOIRE) : Paladin **20** au niveau 1 (100 le
  matin même), 20 au départ, **+2 / s** de simulation (figé en pause), plein
  au retour après une mort ; les niveaux 2 et 3 ne le changent pas encore ;
  porté par le Héros seul (`Entity.hero.mana`), gardé dans la run
  (`HeroProgress.mana`) ;
- **Soin** (2026-11-02, PROVISOIRE, `data/spells.ts`) : **12 mana** (20
  avant), icône propre (bouclier argenté, croix dorée, rayons de lumière
  sacrée ; SVG dessiné par code, `ui/itemIcons.ts`, `paladin_heal`), 2 s
  d'incantation, **+5 PV** (sans dépasser le maximum), portée 5 cases, sur
  le Héros lui-même ou une unité alliée vivante (jamais un bâtiment).
  **Barre d'action** (emplacement 1, touche **1**, ou clic) → clic sur la
  cible (ou sur le portrait du HUD pour le Héros) ; clic droit / Échap :
  annule.
  Le Héros s'approche à 5 cases, puis incante sur place (garde de combat,
  cercle runique au sol, anneau sous la cible, « Soin » et sa jauge dans le
  HUD). Le mana est **retenu au début** de l'incantation et **rendu** si
  elle est annulée avant son effet : nouvel ordre (déplacement, arrêt,
  autre Soin…), mort du Héros, Provocation, cible morte, ou cible à plus de
  6 cases à la fin (soin perdu). Aucun soin après une annulation ;
- **HUD** (2026-11-02, `ui/heroHud.ts`) : encart **permanent en haut à
  gauche** (la fiche de sélection est à droite), même si autre chose est
  sélectionné :
  portrait rond sur fond gris (rendu du modèle, `toonUnitPortrait` ; clic :
  sélectionne le Héros), **PV** (barre verte), **mana** (barre bleue), sort
  en cours, bouton « Inventaire (I) » ; à terre, portrait grisé et compte
  à rebours. **Barre d'action** en bas à gauche, au-dessus de la barre
  d'XP : 6 emplacements, touches **1 à 6** (les mêmes que l'ancien
  inventaire de parchemins), sorts du Héros dans l'ordre de
  `data/heroes.ts` : **Soin** en 1 (icône du parchemin de soin, coût 20),
  grisé sans mana ou pendant l'incantation (voile qui descend avec
  l'avancement), 2 à 6 vides. **Barre d'XP**
  violette en bas, presque toute la largeur (« Niv. N … X / Y XP ») ;
  juste au-dessus, au centre, une **barre de progression** dorée de
  l'action en cours du Héros (incantation, ramassage, cycle de récolte,
  construction, dépôt) : avancement et secondes restantes, jamais le nom de
  l'action ; masquée sans action. Barre d'XP :
  12 px de haut, à 18 px du bas, légèrement transparente (opacité 0,8). Encart des
  ressources (colonne de droite) : **sac** et stocks déposés ;
- **visuel** : Toon RTS (`human_hero.glb`, local, hors Git), échelle 1,3 ;
  depuis le 2026-11-02, config de l'Atelier d'Antoine : tête, corps, bras,
  jambes et épaulières **barbares** (tête ×0,9, corps ×0,8), **marteau
  barbare ×1,4** ; hache et pioche WK pour couper et miner, marteau sinon.
  Chaque pièce garde l'atlas de sa source (unité mixte, voir
  `docs/ASSETS.md`). Déplacement : **essai** du clip `charge` au lieu de
  `run` (×1,3, à confirmer) ;
  geste accroupi pour construire et ramasser ; **sac de toile sur le dos**
  quand le sac n'est pas vide (2026-11-02) : attaché à un os du dos, il suit
  repos, course, attaque, travail et chute ; planches et cailloux dépassent
  de son ouverture, il grossit un peu avec la charge, **+25 %** depuis le
  2026-11-02 (demande d'Antoine) ; masqué quand le sac
  est vide (rendu, `render/resourcePiles.ts`). Sans le GLB : modèle de la
  Sentinelle ;
- absent de la palette d'unités de l'éditeur.

**Ressources, transport et dépôt** :

- **petits tas au sol** (`MapDef.resourcePiles`) : planches (bois) et petits
  cailloux (pierre), **finis** (1 à 4 unités), générés avec la carte. Les
  seules ressources accessibles au début ;
- **lisibilité** (2026-11-02, refaite à la passe suivante) : tas affichés
  plus gros (**bois ×1,4, pierre ×1,6**, visuel seulement) ; un tas
  **visible** (vision actuelle) a des **éclats** ponctuels : toutes les 0,9
  à 2,2 s, 2 ou 3 étoiles blanches apparaissent vite à des **endroits
  différents** du tas, grossissent (jusqu'à 0,62 case), dérivent un peu et
  s'éteignent (≈ 0,55 s) ; rien sur un tas jamais exploré ni hors de la
  vision. **Clic gauche** sur un tas exploré :
  sélection, **anneau jaune** et étiquette « Bois — N » / « Pierre — N ».
  **Clic droit** accepté (ramassage) : **bref pulse** de l'anneau jaune,
  puis anneau fixe tant que l'ordre dure (plus de clignotement). Même
  anneau jaune et même pulse sur la **Baliste** (dépôt) au clic droit de
  dépôt, à la taille de son emprise, fixe pendant le trajet, retiré après
  le dépôt (`DepotTargetRing`) ;
- **boucle** : clic droit du Héros sur un tas → il y va → ramassage
  (0,6 s) → **sac** (6 unités au plus, bois et pierre confondus) → clic droit
  sur la **Baliste** → dépôt **unité par unité, 0,5 s chacune** (3 s pour
  un sac de 6, geste accroupi ; un autre ordre l'interrompt, ce qui est
  versé reste versé ; annonce « Dépôt terminé — stock : … » à la fin) →
  stock de la run. Le stock
  n'augmente **qu'au dépôt** ; un tas vidé disparaît et ne revient pas
  (quantités gardées dans la run). Sac plein : le Héros s'arrête et un
  message invite à déposer. Le sac est gardé à la mort et entre les manches ;
- **constructions** : elles se paient avec le stock **déposé**, jamais avec
  le sac ;
- **récolte avancée verrouillée** : couper les vrais arbres
  (`canHarvestTrees`) et exploiter les gros rochers (`canMineDeposits`) est
  refusé (« il faut une Scierie / un Camp de mineur »). Un bâtiment **bâti**
  dont la fiche porte `unlocksHarvest` (`trees` ou `deposits`) les ouvrira ;
  aucun n'existe encore. Une fois débloquée, la coupe remplit le sac
  (1 unité / 1,5 s), comme le reste ; un arbre étant bloquant, sa portée se
  mesure jusqu'à sa case ;
- seul le Héros ramasse et dépose, et seulement en bataille.

**Coûts des bâtiments** (en plus de l'or) et **durées de construction** :

| Bâtiment | Bois | Pierre | Construction |
|---|---|---|---|
| Mine | 5 | — | 6 s |
| Caserne | 10 | — | 8 s |
| Camp d'archerie | 8 | — | 8 s |
| Forge | 5 | 5 | 8 s |
| Maison | 6 | — | 5 s |
| Tour | 5 | 10 | 10 s |
| Église | 10 | 10 | 12 s |
| Muraille (par case) | — | 1 | 1,2 s |
| Porte de muraille | 3 | — | 3 s |

**Chantiers** : posés en temps réel depuis le bouton **Construire** (ci-dessous),
25 % de leurs PV, semi-transparents, sans aucune fonction tant que le Héros
ne les a pas bâtis ; attaquables pendant la construction. Le Héros enchaîne
sur le chantier voisin (3 cases).

**Carte procédurale** (`config/maps/proceduralSurvival.ts`) :

- disque de 96 × 96 cases (6 785 cases), **une nouvelle graine par run**
  (`?seed=N` la fixe ; `?map=arena` rend l'ancienne arène, `?map=island`
  l'arène candidate) ; même graine = même carte ;
- **centre** : plaine plate et sèche de 11 cases de rayon, sans arbre ni
  rocher ; territoire du joueur = disque de 8 cases (donnée gardée, ni
  affichée ni exigée pour construire depuis le 2026-11-02) ; Baliste en
  (0,5 ; 0,5) ;
- **monde extérieur**, de plus en plus sauvage : forêts par plaques (plus
  denses au loin), jusqu'à 10 collines (niveau 1), jusqu'à 6 mares, 26 gros
  rochers, petits décors, plaques de terre ;
- **rampes** (2026-11-02, KI-39 corrigé) : chaque colline a une rampe de
  **3 cases de large** sur son côté tourné vers le camp (plateau complété
  au-dessus si sa bordure y est plus étroite), bords parfois évasés par une
  pente de coin, abords dégagés (ni arbre ni eau sur la rangée devant ni sur
  deux rangées de plateau). Une colline sans place pour sa rampe n'est pas
  créée. Le Fantassin (0,5), le Héros (0,6), le Cavalier (0,7) et un groupe
  montent et descendent toutes les collines (mesuré, 3 graines) ;
- **construction** : une case d'arbre refuse toute pose (bâtiment,
  chantier, muraille, porte, Baliste, unité) : règle unique
  `treeCellKeys` (`config/resourceNodes.ts`), partagée avec la simulation ;
- **arbres bloquants** (2026-11-02) : les forêts forment des massifs pleins
  séparés par des **sentiers** naturels et des clairières ; un goulet d'une
  case est comblé dans une forêt ou élargi ailleurs (un arbre retiré) ; une
  poche praticable isolée par les arbres est comblée (moins de 8 cases) ou
  reliée au camp par un **couloir de 2 cases**. Contrôle : eau, relief et
  arbres. Mesuré sur 6 graines : aucune case praticable non reliée au camp
  (grille de la simulation). L'anneau d'apparition des vagues est plus clair ;
- **petits tas** : **34 à 35** (111 avant le 2026-11-02, soit trois fois
  plus rares), toujours sur une case reliée au camp ; **garantie de départ** : des tas à 9–18 cases du centre
  jusqu'à au moins 10 bois et 6 pierres (Mine, Caserne, Forge) ; le reste
  dispersé, un peu plus fourni au loin ;
- pas de débris de planches décoratifs (on les confondrait avec les tas) ;
- **vagues** : sur un anneau à 22 cases du centre, gardé sans colline ni eau ;
  la direction tourne à chaque vague (angle d'or), zone de 9 × 9 cases.
  2026-11-02 : une unité n'apparaît que sur une case **reliée au camp** à
  pied ; sinon le groupe prend le secteur de repli suivant (11 autour de
  l'anneau). Sans cible, un ennemi **marche vers la Baliste** par le plus
  court chemin (A* sur le terrain, bâtiments exclus : il attaque ce qu'il
  trouve en arrivant), au lieu de l'ancienne marche « vers l'avant » (+z),
  héritée du jeu en couloirs, qui envoyait une vague apparue au nord vers le
  bord de la carte (vague qui ne finissait jamais). Chemin recalculé si une
  case de la route devient bloquée ou si l'unité ne progresse plus. Une unité
  sans aucun chemin ou un groupe sans case reliée est signalé dans la console
  (`[vagues]`), jamais supprimé ;
- **pas d'agrandissement E4** en Survie (temps réel continu) ;
- cadrage au lancement : le camp, pas tout le disque.

**Brouillard de guerre** (`render/fogOfWar.ts`, présentation seulement, jamais
lu par la simulation) :

- trois états par case : **jamais explorée** (noire), **explorée hors
  vision** (terrain mémorisé, assombri et désaturé), **visible** ;
- vision (cases) : unité 6, **Baliste 18**, **Tour terminée 18**
  (2026-11-02 ; 36 à la passe précédente ; portées d'attaque inchangées),
  **Héros 9** (+50 %), autre bâtiment 4, chantier 3 (`data/vision.ts`). En
  préparation : Baliste, emplacements de l'armée, bâtiments ;
- **abords du camp** : au lancement, un disque de **22 cases** autour de la
  Baliste est déjà **exploré** (terrain mémorisé, assombri), sans être
  visible (`INITIAL_EXPLORED_RADIUS`, `FogOfWar.exploreDisc`) ;
- une unité adverse hors vision n'est ni affichée, ni sélectionnable, ni
  dotée de barre de vie ; un tas jamais exploré n'est pas affiché ;
- rendu par une passe plein écran qui relit la profondeur (tout le décor,
  sans toucher aux matériaux) ; actif sur la carte procédurale, hors
  éditeur et « Tester le scénario » ; remis à zéro à chaque run ;
- les **décors** (arbres, rochers, petits décors) d'une case jamais explorée
  ne sont pas dessinés du tout (plus de silhouettes noires) ; ils
  apparaissent à l'exploration (`render/decorInstancing.ts`).

**Espace** (en jeu) : bascule **Héros ↔ Baliste**. Côté Héros : sélection du
Héros, caméra centrée et **suivi**. Côté Baliste : suivi lâché, caméra sur la
Baliste. Déplacer la caméra à la main (glisser, clavier) lâche le suivi ; le
prochain appui ramène alors au Héros. Le bouton qui gardait le focus le perd
d'abord (KI-24). Dans l'éditeur, Espace recadre comme avant ; R garde la
caméra par défaut.

**Orientation des unités** (rendu) : une unité regarde dans le sens réel de
son déplacement (virage progressif), garde ce cap à l'arrêt, se tourne vers
sa cible quand elle attaque, lance un sort ou attend à l'arrêt, et reste
figée à sa mort. Vaut pour tous les modèles (Toon et officiels).

**Cavaleries** (bestiaire et éditeur seulement : ni recrutement ni vagues) :

| Unité | Camp | Coût | PV | Dégâts | Portée | Cadence | Vitesse | Rayon | Raté | Pop. |
|---|---|---|---|---|---|---|---|---|---|---|
| Cavalier léger (`cavalier`) | joueur (éditeur) | 15 | 18 | 3 | 1,2 | 1,3 s | 3,6 | 0,7 | 10 % | 2 |
| Razzieur (`razzieur`) | Neutre | 15 (valeur) | 18 | 3 | 1,2 | 1,3 s | 3,6 | 0,7 | 10 % | 2 |

Deux unités distinctes (identifiants, kits `cavalier` / `cavalier_barbare`,
modèles). Aucun bonus contre un type d'unité. Modèles Toon RTS « Light B »
(cheval, lance, petit bouclier), clips `Cavalry_Spear` : repos, garde, galop,
coup de lance, deux chutes. Le cheval humain a sa propre texture.

**Fond** (2026-11-02) : noir uni, plus d'image de ciel (montagnes, forêt,
horizon) derrière la carte ronde ; même rendu dans l'éditeur.

**Survie en temps réel continu** (2026-11-01, `main.ts` :
`startSurvivalRealtime`, `stepSurvivalWaves`, `completeSurvivalWave`,
`withRealtimeActions`) :

- **lancement** : après le choix du Héros (« Mode survie » → « Choisir
  votre Héros » → « Lancer la partie », Entrée / double-clic ; Échap ou
  « Retour » : menu), Héros et Baliste apparaissent et la simulation tourne
  aussitôt ; aucun écran de préparation ni de Boutique. On peut tout de suite déplacer le Héros, explorer, ramasser,
  déposer, construire, combattre ;
- **vagues** : la première arrive **120 s** de simulation après le
  lancement, puis **90 s** après la fin de chaque vague (indicateur
  « Vague N · dans X s » ; la pause fige le compte). Une vague repoussée
  donne son bonus d'or (5), passe à la suivante et enregistre le record,
  sans rien arrêter. Seule la défaite termine la run ;
- **construction** (2026-11-02) : bouton **Construire** en bas à droite (à
  la place de l'ancien bloc Boutique / Vendre), actif quand le Héros est
  sélectionné ; il ouvre un petit panneau des bâtiments (nom, coût or /
  bois / pierre, disponible ou non ; pas d'icône, aucune n'existe). Choisir
  arme la pose (stock **déposé** uniquement) ; un clic gauche pose le
  chantier (payé, créé tout de suite dans la simulation), le Héros vivant
  part le construire ; clic droit / Échap : annule. **N'importe où sur la
  carte** : plus de limite de territoire ; refusé hors carte, sur l'eau, une
  case d'arbre, un obstacle bloquant, un bâtiment ou chantier, une unité,
  un sol non plat (pente, rampe). Les gros rochers, décors non bloquants,
  l'acceptent (règle du 2026-10-28, inchangée). La fiche du Héros n'a plus
  la liste « Construire : … ». **Murailles et portes reportées** (absentes
  du menu, choix d'Antoine) ;
- **production** (`data/production.ts`) : la fiche d'un bâtiment bâti
  propose « Produire : <unité> — or · durée » pour les unités qu'il
  débloque (Caserne : Piquier, + Homme d'armes au Niv. 2 ; Camp d'archerie :
  Archer ; Église : Mage, Oracle, Vengeur). Une commande à la fois ; payée en
  or (prix de l'unité) ; l'unité sort à la fin de sa durée (Piquier 6 s,
  Homme d'armes 8 s, Archer 9 s, Mage et Oracle 14 s, Vengeur 16 s,
  provisoires), près du bâtiment, en Garde, si la population le permet. La
  production automatique de début de manche n'est plus utilisée ;
- **améliorations, Forge, Église** : depuis la fiche du bâtiment bâti, en
  temps réel. Une amélioration s'applique tout de suite (PV max, dégâts de
  la Tour) ; l'écran de la Forge / de l'Église met le jeu en pause tant qu'il
  est ouvert ; le soin de l'Église rend leurs PV aux unités vivantes ;
- **Boutique globale** : absente de la Survie (bouton masqué) ; parchemins
  et achat d'unités ne passent plus par elle (voir `ROADMAP.md` §6 quater) ;
- **inventaire** (6 emplacements) et encart **« AUTO BALISTE — prête »** :
  masqués en Survie (2026-11-02) ; l'encart de la Baliste reste dans
  « Tester le scénario » ;
- **Baliste en mode AUTO** : n'acquiert et ne garde que des cibles **vues**
  par le camp du joueur (vision gameplay `sim/vision.ts`, mêmes rayons que
  le brouillard, positions simulées). Sa vision (18) égale sa portée (18).
  Un carreau déjà tiré poursuit sa course ;
- **Espace** : même bascule Héros ↔ Baliste en permanence ;
- **décors instanciés** (KI-34) : sur la carte générée, arbres, rochers et
  petits décors sont regroupés par modèle et par morceau de 32 cases.

## 7. Économie d'or

Sources : `run/runState.ts`, `run/talentEffects.ts`, `run/runUpgrades.ts`,
`main.ts`.

L'Or est la **monnaie principale** de la run. Il sert à recruter des unités,
acheter des parchemins, construire des bâtiments et acheter des
améliorations (Forge §14, Mine et Caserne §6). Bois et pierre s'y ajoutent
pour les bâtiments (§6 bis).

Gains :

- or de départ (§2) ;
- **kill ennemi** : `KILL_REWARD`, versé en temps réel ; +1 avec Butin de
  guerre ;
- **Mines** : une tranche toutes les 60 s de simulation par Mine terminée,
  sans plafond (§6) ;
- **victoire** : +5 (`WAVE_CLEAR_BONUS`) ; rien à la défaite ;
- **ventes** d'unités.

Revente d'unités (phase de placement uniquement) :

- **Geste** : glisser une unité ou un groupe vers « Vendre », ou cliquer sur
  « Vendre » pour vendre la sélection.
- **Barème** : `KILL_REWARD`.
- **Avec le talent Recyclage** : une unité sous 50 % de ses PV maximum
  rapporte `round(3 × coût)` au lieu du barème normal, où le coût est
  celui du niveau de production de l'unité vendue. Les unités concernées
  sont surlignées en jaune.

Tous les montants d'or sont arrondis au dixième (`roundGold`).

## 8. Boutique de run

> **Legacy depuis le 2026-11-01** : la Survie en temps réel continu n'ouvre
> plus la Boutique (§6 bis). Le code reste, pour la conversion à venir.

Sources : `ui/screens.ts`, `main.ts` (`buyUnit`, `buyUnitFive`,
`buyConsumable`, `undoLastUnitPurchase`).

- **Accès** : la boutique s'ouvre automatiquement au début de chaque
  placement, et reste disponible via le bouton « Boutique ».
- **Onglets** : Unités, Bâtiments, Parchemins de bataille.
- **Unités** :
  - achat ×1, ou ×5 (achète jusqu'à 5 exemplaires tant que l'or suffit) ;
  - une unité achetée pendant le placement est utilisable immédiatement ;
  - « Annuler le dernier achat » rembourse le dernier achat d'unité (un seul
    niveau d'annulation).
- **Parchemins** : achat ×1 ou ×5. L'achat est tout-ou-rien : l'or **et** la
  place en inventaire doivent suffire.

## 9. Inventaire et parchemins de bataille

Sources : `data/items.ts`, `run/runState.ts` (`INVENTORY_CAPACITY`,
`canAddItemToInventory`), `run/healScrollUpgradeEffects.ts`,
`run/iceNovaUpgradeEffects.ts`, `main.ts`.

- **Capacité** : 12 emplacements. Les objets identiques s'empilent
  (`maxStack` : 10 pour le soin, 3 pour la Nova) ; un emplacement contient
  une pile.
- **Utilisation** : cliquer sur l'emplacement arme l'objet, puis un clic
  cible. Échap ou clic droit désarme sans consommer.
- **Raccourcis 1 à 6** : les six emplacements de la première ligne (numéro
  dans leur coin, vides compris) répondent aux touches du rang supérieur du
  clavier (`KeyboardEvent.code` `Digit1` à `Digit6`, mêmes touches en
  AZERTY). Une touche fait exactement comme un clic sur l'emplacement (même
  vérification de phase) ; un emplacement vide ne fait rien. Ignorées en
  appui maintenu, avec Maj / Ctrl / Alt, pendant une saisie, dans l'éditeur
  et quand un écran recouvre le jeu (boutique, Forge, pause, fin de vague).

| Objet | Coût en partie | Utilisable | Effet de base |
|---|---|---|---|
| Parchemin de soin mineur | 1 | placement et bataille | Soigne 5 PV à l'unité alliée blessée la plus touchée (en proportion de ses PV max) dans un rayon de 2 autour du clic |
| Nova de glace | 4 | bataille | Immobilise pendant 4 s les ennemis présents dans un rayon d'environ 2,3 (1,15 × rayon de la Boule de feu) |

Effets liés aux talents :

- **Blizzard** : la Nova de glace crée en plus une zone de 4 s qui inflige 2
  dégâts par seconde aux ennemis présents.
- **Aux petits oignons** : quand un allié passe sous 30 % de ses PV maximum,
  un parchemin de soin de l'inventaire est consommé automatiquement sur lui.
- **Soins excédentaires** : la part d'un soin qui dépasse le maximum de PV
  génère des projectiles d'ombre vers des ennemis.

Un parchemin de soin ne cible jamais un bâtiment.

## 10. Vagues ennemies

Sources : `run/runState.ts` (`computeEnemyWaveComposition`),
`run/unitUpgradeEffects.ts` (`enemyUpgradeLevelForWave`,
`computeEnemyUnitUpgradeEffects`), `config/constants.ts`
(`MAGE_UNLOCK_WAVE`, `EXTRA_ENEMY_MAGE_*`, `ENEMY_SENTINEL_*`).

Fantassins et Archers :

| Vague | 1 | 2 | 3 | 4 | 5 | 6 | 7 et plus |
|---|---|---|---|---|---|---|---|
| Fantassins | 2 | 4 | 4 | 5 | 10 | 20 | `round(20 × 1,1^(v − 6))` |
| Archers | 0 | 0 | 2 | 2 | 4 | 8 | `round(8 × 1,1^(v − 6))` |

- **Mages** : 1 à partir de la vague 8. À partir de la vague 10, s'y ajoutent
  `1 + floor((v − 10) / 3)` Mages supplémentaires.
- **Sentinelles** : `1 + floor((v − 10) / 5)` à partir de la vague 10.
- **Renforcement par vague** : les ennemis reçoivent un niveau d'amélioration
  égal à `floor(v / 2)`, avec les mêmes formules que les améliorations du
  joueur.
  - Ce renforcement s'applique aux Fantassins, Archers et Mages.
  - Il ne s'applique pas à la Sentinelle, qui n'a pas d'entrée dans
    `UNIT_UPGRADES`.
  - La fiche d'un ennemi inspecté affiche ce niveau à partir de 1
    (`floor(v / 2) + 1`), en vraie bataille seulement.
- **Formation** : mêlée devant, unités à distance derrière, pour chaque
  groupe (voir ci-dessous).

**Mini-vagues** (`run/enemyWaveGroups.ts`,
`sim/systems/enemyReinforcements.ts`, constantes `ENEMY_GROUP_*` et
`ENEMY_EMPTY_FIELD_SPAWN_SECONDS` de `config/constants.ts`). Une vague reste
une seule vague (même total, même composition, même niveau), mais ses
ennemis arrivent par groupes :

- **Groupes** : `G = ceil(total / 5)`, tailles **équilibrées** (écart d'au
  plus 1, les plus grands d'abord) : 2 → [2], 6 → [3, 3], 7 → [4, 3],
  14 → [5, 5, 4], 28 → [5, 5, 5, 5, 4, 4].
- **Répartition des types**, déterministe : Sentinelles puis Mages dans le
  groupe le moins chargé (poids S 20, M 5, A 1,5, F 1, rapporté à la taille
  du groupe), au plus près de leur place régulière dans la vague ; Archers
  au prorata de la place restante ; Fantassins pour compléter. Un Mage et
  une Sentinelle évitent le même groupe ; le premier groupe reste léger.
- **Cadence** : le premier groupe est présent au lancement ; les suivants
  arrivent toutes les `clamp(5,8 − 1,05 × ln G, 1,3 ; 4,8)` secondes,
  arrondies en ticks (30 Hz) : 4,8 s pour 2 groupes, 4,65 s pour 3, 3,92 s
  pour 6, 3,49 s pour 9, 2,96 s pour 15, 2,51 s pour 23, 1,54 s pour 58.
  Un groupe **n'attend pas** la mort du précédent (chevauchement).
- **Terrain vide** : après **1,5 s** sans aucun ennemi vivant, le groupe
  suivant arrive sans attendre son délai ; le délai suivant repart de cette
  arrivée.
- **Positions** : chaque groupe garde sa formation, centrée au front de la
  zone de spawn ennemie ; une unité dont la case est prise (obstacle, trou,
  unité) prend la case libre la plus proche de la zone, dans un ordre
  stable. Sans place pour tout le groupe, il réessaie au tick suivant.
- **Victoire** : seulement quand plus aucun ennemi n'est en vie **et** que
  tous les groupes sont apparus.
- **Récompenses inchangées** : or au kill, Butin de guerre, bonus de
  victoire et bilan portent sur la vague entière (pas de bilan
  intermédiaire).
- **Interface** : en préparation, seul le premier groupe est visible sur la
  carte ; l'indicateur affiche « Vague N · X ennemis · G groupes ». En
  bataille, il affiche les groupes restants, et « Renforts ennemis »
  apparaît brièvement à chaque arrivée.
- « Tester le scénario » n'a pas de mini-vagues (ennemis de la carte).

## 11. Arène, territoire et expansion de la carte

Sources : `config/maps/survivalArena.ts`, `config/territory.ts`,
`run/mapExpansion.ts`, `main.ts` (`startNewRun`, `isValidPlacementTile`,
`rebuildCurrentTerritoryIndex`).

Depuis le 2026-11-01, le Mode survie se joue par défaut sur la **carte
procédurale** (§6 bis : disque de 96 cases, territoire central fixe, sans
agrandissement). Cette section décrit l'**arène** dessinée, toujours
accessible par `?map=arena`, sur laquelle E4 reste actif.

**Arène du Mode survie**

- Carte officielle (« MapV2 », fournie par Antoine depuis l'éditeur) :
  21 × 36 cases, dont 64 trous (le champ de bataille central est plus
  étroit que les bases), 100 décors (24 arbres, 7 rochers, 69 props), tous
  **traversables** depuis le 2026-10-28 : ils ne bloquent plus ni le passage
  ni les tirs ni le placement (changement d'équilibrage de l'arène, voir
  `DESIGN_DECISIONS.md` E8). Exception depuis le 2026-11-02 : la case d'un
  **arbre** bloque le passage (pas les tirs), ici aussi, et la pose de
  bâtiments, chantiers, murailles et unités. `SURVIVAL_ARENA_MAP` est la carte complète ;
  `SURVIVAL_BASE_MAP` est la même, sans unités de scénario.
- Le Mode survie en lit le terrain (`cells`), les décors (`obstacles`), le
  territoire dessiné (`territory`) et la position de la Baliste
  (`ballista`, (0.5, 15.5)). Il **ignore** `playerUnits` et `enemyUnits`
  (1 Fantassin allié en (0.5, 10.5), 1 Fantassin ennemi en (0.5, −14.5)),
  réservées au scénario de test de l'éditeur : l'armée de départ et les
  vagues restent celles du mode (§2, §10).
- La carte officielle n'est jamais modifiée : chaque run repart d'elle, sans
  bâtiment, destruction ni agrandissement d'une run précédente.
- La carte historique « vague1-20 » (18 × 26, `DEFAULT_MAP`) n'est plus
  utilisée en run ni à l'ouverture de l'éditeur, qui affiche l'arène
  complète (unités de scénario comprises, `SURVIVAL_ARENA_MAP`) ; elle ne
  fournit plus que les dimensions de « Nouvelle carte ».

**Arène candidate (île ronde)** — `config/maps/islandArena.ts`,
`ISLAND_ARENA_MAP`, 2026-10-30, transcription d'un export de l'éditeur.
**Pas utilisée par défaut** : le Mode survie part de l'arène ci-dessus.
Débogage : `?map=island` (par exemple `http://localhost:5173/?map=island`)
fait partir le Mode survie de l'arène candidate, sans ses unités de
scénario ; combinable avec `?terrain=` et `?surfaceBlend=`. L'éditeur
s'ouvre toujours sur l'arène officielle.

- 34 × 34, 860 cases, silhouette ronde irrégulière (avancées, anses), 3 trous
  (crevasse au nord-est).
- Relief 0 à 3 : massif ouest (niveau 1, crête de niveau 2, sommet rocheux
  de niveau 3), colline est (niveaux 1 et 2), deux petites hauteurs de
  niveau 1. Plusieurs versants praticables par relief ; 14 arêtes de
  falaise, sur les faces nord (posées dans `elevationCells` : l'éditeur les
  conserve à l'enregistrement mais ne sait pas en créer).
- Camp joueur au sud : territoire joueur de 159 cases, toutes plates
  (111 emplacements 3×3) ; Baliste en (0.5, 14.5) ; aucun territoire
  ennemi. Chemins et aire tassée en terre battue, herbes de zone, 59 décors
  composés à la main (32 arbres KayKit, 3 bosquets, 17 rochers, 7 petits).
- Testée en Mode survie réel sans modifier le dépôt : construction de tous
  les bâtiments et d'une enceinte avec porte dans le camp, pas d'ouverture
  des unités conforme (§2), vague 1 gagnée.
- **Bloque son adoption** : l'agrandissement de run ne déplace ni le relief
  ni les surfaces (`KNOWN_ISSUES.md` KI-27). Les ennemis apparaissent
  toujours dans la bande nord (§10) : les autres accès de l'île ne servent
  pas encore.

**Territoire**

- Chaque case appartient au joueur, à l'ennemi, ou à personne (neutre).
- En préparation, le **territoire joueur** est la zone de placement des
  unités. Les **bâtiments** (toute l'emprise) se posent depuis le 2026-11-02
  sur **toute case de la carte**, sans limite de territoire (contraintes
  physiques gardées, voir §6 bis).
- Arène : territoire dessiné, 152 cases par camp. Zone joueur : rangées
  z 9 à 16, colonnes x −9 à 9 ; zone ennemie symétrique (z −17 à −10). Une
  bordure neutre d'une case entoure chaque zone.
- Une carte sans territoire utilise le **repli historique** : deux bandes de
  7 rangées à l'arrière de chaque camp, le centre neutre.
- **Affichage** : les zones bleue et rouge du plateau de jeu sont
  **retirées** (2026-11-02, demande d'Antoine ; `render/board.ts`, groupe
  vide). Le territoire reste une donnée de la carte ; l'éditeur l'affiche
  toujours pour le peindre. Les camps (Rouge, Bleu, Vert, Jaune, Neutre)
  ne changent pas.

**Expansion**

- **Après chaque victoire**, la carte s'agrandit d'une étape, selon un cycle
  A → B → C. Avec le territoire dessiné de l'arène :
  - **A** : une rangée de plus à l'arrière de chaque camp ; la bordure
    neutre arrière recule d'une case et la zone reprend la rangée libérée ;
  - **B** : une colonne de plus de chaque côté ; les zones s'élargissent de
    même. Les encoches latérales de l'arène se creusent : le champ de
    bataille central garde sa largeur ;
  - **C** : le champ de bataille s'allonge de deux rangées. Chaque camp
    recule d'une case vers son bord, avec son territoire et ses décors (et,
    côté joueur, ses bâtiments et la Baliste) ; les deux nouvelles rangées
    vont au champ de bataille.
- Zone de chaque camp : 152 cases au départ, puis 171 (A), 189 (B), 189 (C),
  les deux camps restant de même taille. La bordure neutre d'une case est
  conservée à chaque étape, des deux côtés.
- Les trous et le terrain de la carte sont conservés à chaque étape ; aux
  étapes A et B, aucun décor ne bouge ; aucun centre de décor ne sort du
  terrain.
- Une carte sans territoire dessiné garde le comportement historique : bandes
  recalculées à chaque étape.
- Pas de territoire propre à la run : il n'y a ni `RunState.territory`, ni
  croissance ou conquête réelle du territoire au fil des vagues.
- La carte repart de son état initial à chaque nouvelle run.

**Relief (2.5D)**

Sources : `config/terrainElevation.ts`, `sim/world.ts` (`setMap`),
`sim/pathfinding.ts`, `render/terrainCells.ts`, `render/terrainSurface.ts`.

- Une carte peut définir une altitude par case (`elevationCells`) : niveaux
  0, 1, 2 et 3, un niveau valant une demi-case de hauteur (niveau 3 :
  y = 1,5). Une case est plate
  ou en **pente** (d'un niveau au suivant, dans une direction). L'arène du
  Mode survie est entièrement plate ; seule l'arène candidate
  (`islandArena.ts`, utilisée en run seulement avec `?map=island`) en a.
  Sinon, le relief ne se voit en jeu qu'avec une carte de l'éditeur
  (« Tester le scénario »).
- **Raccord** : chaque case a une hauteur à ses quatre coins ; deux cases
  voisines se raccordent si leur arête commune a la même hauteur aux deux
  extrémités (plat ↔ plat au même niveau, pied et sommet d'une pente,
  pentes parallèles côte à côte).
- **Falaise** : toute arête qui ne se raccorde pas (niveaux différents,
  flanc d'une pente contre un plat ou une pente d'une autre orientation).
  Infranchissable à pied, pour les deux camps ; le pathfinding contourne par
  les pentes. Sans pente, une unité en bas ne monte jamais (vérifié en
  simulation). Au pied d'un flanc de pente, là où l'écart de hauteur est
  presque nul (moins d'un quart de niveau), il n'y a pas de mur de
  collision : une unité qui entre de biais ne bute pas sur le coin.
- **Pente de coin** : un seul coin haut (NE, NW, SE ou SW) ; elle raccorde deux
  pentes perpendiculaires au coin d'un plateau (aucune falaise, aucun saut),
  praticable dans tous les sens, y compris pour monter directement par le
  coin. **Coin intérieur** (un seul coin bas) : au creux d'un plateau en L.
  Produites par les pinceaux Surélever / Abaisser (contour automatique),
  jamais posées à la main.
- **Pente** : quatre orientations (montée vers le nord, l'est, le sud ou
  l'ouest), praticable dans les deux sens ; l'unité s'élève progressivement.
  Des pentes parallèles côte à côte forment une rampe large (2, 3 cases…) :
  déplacement latéral libre, un groupe y monte de front. Une pente d'une
  case est un passage exact pour un Fantassin (rayon 0,5).
- **Combat** : aucun bonus de hauteur ; ligne de tir et portées restent 2D
  (une falaise n'arrête pas les tirs). **Corps à corps** (portée ≤ 1,5 case :
  Fantassin, Sentinelle, repli du Mage) : aucun coup à travers une falaise ;
  l'unité cherche une rampe au lieu de s'arrêter au pied. Projectiles :
  trajectoire visuelle seulement ajustée aux hauteurs de départ et
  d'arrivée.
- **Pose** : tous les bâtiments (Maison, Mine, Caserne, Camp d'archerie,
  Forge, Tour, Église, murailles, portes) et la Baliste exigent une emprise
  plate à un seul niveau (ni pente, ni falaise sous l'emprise) ; une portion
  de muraille reste sur un seul niveau. Les unités se posent sur n'importe
  quelle case, pente comprise. Une unité produite n'apparaît jamais de
  l'autre côté d'une falaise collée à son bâtiment.
- **Flanc de pente** : une unité qui entre de biais au pied ne bute pas ; une
  unité poussée contre le milieu ou le haut d'un flanc ne le traverse jamais
  (vérifié en simulation, foule comprise).
- **Affichage** : plateaux, pentes et falaises en géométrie low-poly ;
  dessus en herbe (ou terre), légèrement plus clairs par niveau (+15 %),
  pentes légèrement voilées (−18 % à pleine inclinaison, en plus de
  l'éclairage) ; flancs (falaises, bord de carte, trous) en terre sombre,
  assombrie vers le pied ; unités, barres de PV, anneaux,
  bâtiments, décors, zones, grille, aperçus et effets suivent la hauteur ;
  le pointage à la souris vise la surface visible.
- **Camps et factions** (2026-11-01, `config/factions.ts`) : quatre couleurs
  de joueur (Rouge, Bleu, Vert, Jaune) et le camp **Neutre** (brun + gris),
  palettes centralisées. La simulation garde deux côtés ; le joueur est Bleu,
  le côté adverse est le Neutre (anneaux, barres de vie, territoire, teinte
  des unités Toon). La faction visuelle d'une unité (`UnitVisual.faction` :
  humains, barbares) est indépendante de son camp. Unités **neutres**
  (`data/units.ts`, provisoires) : Maraudeur, Ravageur, Traqueur,
  Féticheur, Colosse, modèles barbares Toon RTS, stats et comportement du
  rôle habillé (Homme d'armes, Vengeur, Archer, Mage, Sentinelle) ; jamais
  recrutées par le joueur.
- **Collines arrondies, EXPÉRIMENTAL** (`?hills=organic`,
  `render/hillShape.ts`, 2026-11-01 ; rendu facetté seulement) : pentes
  en S (épaule et pied adoucis), coins de colline arrondis (profil radial
  autour du coin) ; une arête de pente qui touche une falaise, un flanc de
  rampe, un bord ou un trou garde son profil linéaire, d'où des raccords
  inchangés. Rendu seulement : niveaux, falaises, trajets et simulation
  identiques (vérifié), unités et décors posés sur le sol affiché. Coût :
  dessus d'une pente en sous-grille 6 × 6 (celle des transitions), environ
  +45 à +170 % de triangles de sol selon la part de pentes, construction
  du sol environ ×1,7 à ×3. Défaut inchangé (`grid`).
- **Arbres ×1,4** (2026-11-01, `render/trees.ts`, `TREE_VISUAL_SCALE`) :
  arbres Kenney, arbres isolés KayKit et bosquets ; souches inchangées.
  Rendu seul.
- **Mort d'une unité** (2026-11-01, `render/unitViews.ts`) : lacet et
  position figés à la première image de la mort ; la chute (clip
  deathA/deathB, knockdown ou bascule procédurale) se joue sur place, sans
  se tourner vers une cible encore vivante ni glisser vers la position
  simulée.
- **Surfaces visuelles du sol** (`render/groundSurfaces.ts`) : apparence du
  dessus des cases, indépendante du relief et sans effet de jeu (passage,
  trajets, hauteur, territoire). Par défaut, palette **classique** : l'herbe
  `ground_grass.png` partout, comme avant. Lot exploratoire de 10
  textures (6 herbes dont 2 pixelisées, 2 terres, 2 mixtes ;
  `public/textures/ground/variants/`, générées par
  `tools/ground-textures/generate.mjs`), comparables dans l'URL :
  `?sol=variee` (herbes classique, prairie et dense en plaques, taches de
  terre), `?sol=stylisee`, `?sol=pixel`, `?sol=catalogue` (les 10 en
  bandes de 2 cases) ou une texture seule (`?sol=herbe-dense`…) ; flancs
  en `terre-strates` hors défaut. Choix automatique et déterministe par
  case (bruit sur x, z, plaques de 4 cases) : même sol à chaque chargement.
- **Peinture des surfaces** (outil Surface de l'éditeur, `EDITOR.md` §3) :
  le designer peint le **dessus** des cases avec l'une des 16 textures
  (10 d'origine, plus pavés, sable, sol rocheux, sol volcanique, lave et
  eau depuis le 2026-10-31 ; pinceau 1×1 ou 4×4, « Par défaut » pour
  effacer). La carte enregistre
  seulement les cases peintes (`MapDef.surfaceCells`, `{ x, z, surface }`,
  identifiants de `config/groundSurfaces.ts`). Une surface peinte l'emporte
  toujours ; `?sol=` ne décide que des cases non peintes. Les flancs gardent
  la surface de flanc de la palette. Purement visuel : ni hauteur, ni
  trajets, ni territoire, ni règles de pose, **sauf l'eau** (ci-dessous).
  L'arène du Mode survie n'a pas de `surfaceCells` : son sol est
  inchangé.
- **Eau infranchissable** (2026-11-01) : toute surface de la famille `eau`
  (`isWaterSurface`, `config/groundSurfaces.ts` ; une seule variante
  aujourd'hui, une nouvelle = une entrée de plus dans cette famille) est un
  obstacle de déplacement, jamais un obstacle de tir :
  - `World.setMap` injecte des obstacles synthétiques `terrainWater`
    (`blocksShots: false`, rangées de cases contiguës fusionnées) : trajets
    A*, contournement, collision, ruée de Charge, apparitions (renforts,
    production, pas d'ouverture) les évitent ;
  - destination d'un ordre de déplacement sur l'eau refusée
    (`invalid-destination`) ; une destination de groupe tombée dans l'eau
    est ramenée au point sec le plus proche (`sim/orders.ts`) ;
  - pose refusée sur l'eau : unités, bâtiments et murailles en préparation
    (`isValidPlacementTile`), et dans l'éditeur unités, bâtiments,
    murailles, Baliste ; l'éditeur ne peint jamais d'eau sous une unité, un
    bâtiment, une structure bloquante ou la Baliste ;
  - `UnitStats.canTraverseWater` (absent = faux pour toutes les unités
    actuelles) retire l'eau des trajets, de la collision et du refus de
    destination, pour de futures unités ;
  - la lave reste visuelle.
- **Lumière globale** (2026-11-02) : les trois lumières de la scène (ambiance,
  remplissage, soleil) sont multipliées par **0,92** (`Renderer.LIGHT_LEVEL`,
  preset compris) : stylized 0,6 / 0,45 / 2,1 → 0,552 / 0,414 / 1,932.
  Luminance moyenne de la vue du camp : −3,8 % (mesurée). Couleurs, ombres et
  matériaux inchangés ; l'éditeur partage ce rendu ;
- **Direction graphique officielle par défaut** (2026-11-02, choix
  d'Antoine) : `look=stylized`, `groundLook=rich`, `surfaceBlend=organic`,
  `relief=hybrid`, `surfaceBorder=marquee`, sans aucun paramètre d'URL
  (`main.ts`, `OFFICIAL_LOOK`), en jeu comme dans l'éditeur, carte générée
  comprise (mêmes surfaces, frontières, eau, relief : aucun chemin propre à
  une arène). Chaque paramètre reste une surcharge de laboratoire :
  `?look=baseline&groundLook=baseline&surfaceBlend=irregular&relief=baseline&surfaceBorder=off`
  rend l'ancien rendu. `?hills=organic` reste expérimental, jamais par
  défaut. Fond noir. Les « par défaut » des paragraphes suivants décrivent
  les valeurs d'avant cette date.
- **Rendu du terrain** (`render/terrainStylized.ts`, 2026-10-29) : par
  défaut `faceted-plus`, en jeu comme dans l'éditeur (arène du Mode survie
  comprise). Les bords libres (bord de carte, trous) reçoivent une bande
  irrégulière qui prolonge le dessus vers le vide (sa « lèvre »), et une
  falaise facettée ; les falaises intérieures sont subdivisées ; une vraie
  rupture de niveau intérieure (falaise d'au moins un niveau, comme dans
  une ancienne carte) reçoit une jupe facettée qui déborde de quelques
  centimètres au-dessus de la case basse ; les anneaux de pentes produits
  par la sculpture et les flancs de rampe restent fidèles. Témoins de
  comparaison : `?terrain=grid` (l'ancien rendu case par case, inchangé),
  `?terrain=faceted` (sans jupe) et `?terrain=faceted-plus-shadow` (même
  géométrie, le terrain projette ses ombres ; expérimental, jamais activé
  par défaut). (La piste `organic`, facettes sur les plats, a été retirée.)
  Purement visuel : carte, cases, relief logique, surfaces, pointage, règles
  de pose, grille, territoire et simulation sont identiques dans tous les
  modes.
- **Transitions entre surfaces** (`render/surfaceBlend.ts`, 2026-10-29) :
  par défaut `irregular`. À une frontière, la surface prioritaire (terre
  au-dessus des herbes, herbes travaillées au-dessus de l'herbe par défaut)
  déborde sur sa voisine avec un bord net, polygonal, de largeur variable
  (un chemin peint en 1×1 paraît large de 1,1 à 1,3 case) ; un coin
  rentrant (marche d'escalier, intérieur d'un virage) est arrondi. Le
  débord suit exactement le sol (pentes et coins compris), jamais
  par-dessus une falaise ; au bord de la carte et autour d'un trou, il
  continue sur la lèvre facettée de la case, jamais dans le vide ; le cœur
  des zones reste intact. Témoin : `?surfaceBlend=hard` (frontière case par
  case). (`feather`, bande de fondu, a été abandonné.) Tout se déduit de
  `surfaceCells` : rien de nouveau n'est enregistré, l'outil Surface est
  inchangé.
- **Lookdev** (`render/look.ts`, 2026-10-30) : par défaut
  `baseline`, le rendu actuel, sans aucun réglage. `?look=stylized` et
  `?look=stylized-strong` (par exemple
  `http://localhost:5173/?map=island&look=stylized`) changent seulement
  l'intensité des trois lumières (couleurs et directions inchangées),
  celle de l'image de fond (`stylized-strong` : plus un voile uni devant le
  fond, jamais devant le plateau) et la couleur des surfaces de l'arène
  ronde (herbe par défaut, classique, dense, terre battue) et des flancs.
  Mêmes textures, aucun shader ni tone mapping ; géométrie, cartes et jeu
  inchangés. Les autres textures du lot ne sont pas réglées. Purement
  visuel, éditeur compris. `stylized` est le preset de la combinaison de
  référence (voir Matière du sol) ; `baseline` et `stylized-strong` restent
  des témoins de debug.
- **Matière du sol** (`render/groundLook.ts`, 2026-10-30) : par
  défaut `baseline`, le rendu actuel, rien ne change. `?groundLook=macro` :
  les herbes et les terres prennent leur matière principale (herbe
  classique, terre battue) à la couleur moyenne de la surface peinte, et
  une variation de grande échelle (4 à 12 cases), calculée en coordonnées
  monde, les éclaircit, les assombrit, les réchauffe ou les sèche par larges
  zones douces (couleur de sommet : même point, même valeur, quels que
  soient la case, le morceau, la pente ou la lèvre). `?groundLook=layered`
  ajoute une seconde lecture de la même texture, tournée et plus grande
  (deux lectures de texture au lieu d'une), et de rares accents larges.
  Flancs, textures mixtes et terre en strates inchangés. Rien n'est
  enregistré dans la carte ; vaut aussi dans l'éditeur (en `macro` et
  `layered`, les vignettes de l'outil Surface montrent toujours les PNG
  d'origine).
  `?groundLook=living` (seconde passe, même jour) : `layered`, plus :
  - une seule herbe : herbe par défaut, classique, dense, prairie et herbes
    écartées sous la même texture et la même teinte (celle de l'herbe par
    défaut). Dense (plus sombre, plus riche) et prairie (plus claire, plus
    sèche) sont des états portés par les sommets, au contour doux et
    irrégulier ; plus aucune transition Irregular entre deux herbes. La
    terre par défaut est rendue comme la terre battue ;
  - de rares accents de 1,5 à 5 cases, calculés au pixel en coordonnées
    monde (plaque sèche, herbe plus claire, herbe usée ; terre tassée, plus
    claire, plus rouge). Ils couvrent environ 10 % de l'herbe, avec des
    zones calmes, et 20 % de la terre ;
  - une herbe un peu plus sèche, par endroits seulement, au bord des terres
    (chemins, cours).

  Mixtes et terre en strates gardent leur PNG. Dans l'éditeur, `living`
  propose une palette Surface simplifiée (Herbe, Herbe dense, Prairie
  claire, Terre battue), aux vignettes calculées depuis la matière rendue.
  Les autres surfaces restent valides dans les cartes : elles se chargent,
  se rendent et s'enregistrent telles quelles.

  **Direction retenue** (Antoine, 2026-10-30) : `living`. Combinaison de
  référence : `?look=stylized&groundLook=living` (par exemple
  `http://localhost:5173/?map=island&look=stylized&groundLook=living`),
  toujours par l'URL : le rendu sans paramètre n'a pas changé. Les autres
  valeurs restent comme témoins de debug. Aucun accent 3D n'est posé
  automatiquement (règle : `DESIGN_DECISIONS.md` E7) ; points parqués :
  `ROADMAP.md` §7.
- **Catalogue élargi, richesse et lisières** (2026-10-31, en comparaison) :
  - six surfaces nouvelles, peignables dans tous les modes (palette `living`
    comprise) : **Pavés**, **Sable**, **Sol rocheux**, **Sol volcanique**,
    **Lave**, **Eau** (`config/groundSurfaces.ts`, textures générées par
    `tools/ground-textures/generate.mjs`). Accordées au preset `stylized`.
    L'eau (reflets qui glissent) et la lave (croûte qui dérive, fissures
    incandescentes qui pulsent) sont animées. La lave ne bloque rien ;
    l'eau est infranchissable depuis le 2026-11-01 (ci-dessus) ;
  - `?groundLook=rich` : `living`, plus des plaques de matière à
    l'intérieur de chaque surface, au pixel, en coordonnées monde, jamais
    par case. Calibrage du 2026-10-31 (consolidation) : l'herbe et la terre
    alternent deux tons proches par grandes formes calmes d'environ 4 cases
    (herbe plus verte / plus olive, avec de rares zones plus claires ;
    terre tassée / sèche, avec de rares zones plus rouges) ; le sable aussi,
    plus doucement ; tons propres aux pavés, à la roche et au sol
    volcanique ; léger mouchetis ;
  - `?surfaceBlend=lisiere` : frontières organiques dans les deux sens,
    toujours nettes, avec une **lisière** selon les deux surfaces (herbe
    plus sèche au bord d'un chemin, plus grasse au bord de l'eau, roussie
    près de la lave ; terre tassée, bordure de pavés, sable mouillé, écume,
    croûte refroidie). Direction low-poly (consolidation) : les coins sont
    **biseautés** plutôt qu'arrondis (un angle reste un angle, une case
    isolée devient un octogone, un escalier une bande droite) ; un chemin
    en diagonale (cases qui se touchent par un coin) reste un tracé continu
    de largeur régulière ; la forme dépend des deux matières : rivages de
    l'eau et de la lave plus arrondis, sable plus doux, chemins et pierre
    plus nets. `?surfaceBlend=melange` : la même chose, plus de petits îlots
    épars des deux surfaces près de la frontière (suit les réglages de
    `lisiere`).
  - surfaces (consolidation) : pavés plus gros (environ 0,3 case) aux
    joints plus fins et moins contrastés ; sol rocheux en grandes masses
    aux fissures rares (plus de dallage), de la teinte des falaises
    `hybrid` ; sol volcanique moins sombre ; reflets de l'eau plus fins.
  - `?surfaceBlend=organic` (2026-10-31, en comparaison avec `lisiere`) :
    les mêmes frontières (mêmes formes), mais la lisière devient une
    **zone de transition par couple de matières**, en deux teintes douces :
    un **contact** étroit collé à la frontière et une **zone** plus large
    (jusqu'à environ 0,6 case), de profondeur et de force irrégulières (par
    taches). Herbe moins verte, plus terreuse au bord d'un chemin, chemin
    plus sombre et tassé à son bord ; pavés salis de terre au bord ; herbe
    poussiéreuse près du sable, sable un peu plus sombre face à l'herbe ;
    herbe plus grasse, terre boueuse et sable mouillé au bord de l'eau, eau
    plus claire au bord (avec l'écume) ; sol brûlé autour de la lave, sol
    volcanique plus chaud à son contact ; un peu de mousse au bord de la
    roche. Jamais de contour noir ni de trait.
  - `&surfaceBorder=subtile` et `&surfaceBorder=marquee` (2026-10-31, en
    comparaison, avec `?surfaceBlend=organic` seulement ; `off` par
    défaut) : **bordure de contact** qui rend les limites plus lisibles,
    sans trait. Une bande douce, mesurée depuis la frontière visible
    (environ 0,2 case en `subtile`, 0,32 case en `marquee`), pleine au bord
    et fondue vers l'intérieur ; le centre des surfaces ne change pas.
    Herbe plus sombre près de toute autre matière (le chemin, la roche, la
    berge s'y posent), sable un peu plus chaud au bord, liseré clair de
    l'eau, croûte plus sombre de la lave, roche à peine. Une teinte par
    matière (pas par couple). Même nombre de draw calls et de programmes ;
    quelques triangles de plus (moins de 1 % sur l'île, 2 % sur la vitrine)
    et une construction du sol plus longue (environ 25 %).
  - `?groundLook=organic` (2026-10-31, en comparaison avec `rich`) : `rich`,
    l'herbe un peu plus variée (vert plus franc, olive plus chaud, ton rare
    terreux au lieu de clair) ; le reste identique.
  Les dessus restent le sol logique ; carte, relief, trajets, pose et
  simulation inchangés ; rien de nouveau n'est enregistré (les surfaces
  nouvelles s'écrivent dans `surfaceCells` avec leur identifiant). Le rendu
  sans paramètre n'a pas changé. Combinaison proposée :
  `http://localhost:5173/?map=island&look=stylized&groundLook=rich&surfaceBlend=lisiere&relief=hybrid`.
  Proposition en comparaison (transitions par couple, herbe plus variée) :
  `http://localhost:5173/?map=island&look=stylized&groundLook=organic&surfaceBlend=organic&relief=hybrid`.
  Avec la bordure de contact :
  `http://localhost:5173/?map=island&look=stylized&groundLook=rich&surfaceBlend=organic&relief=hybrid&surfaceBorder=marquee`.
- **Habillage du relief** (`render/reliefLook.ts`, 2026-10-31, en
  comparaison) : par défaut `baseline`, le rendu actuel, rien ne change.
  Trois variantes du rendu `faceted-plus`, par exemple
  `http://localhost:5173/?map=island&look=stylized&groundLook=living&relief=massif` :
  - `?relief=roche` : falaises, bords d'île et trous en roche low-poly
    (facettes à plat, couleur par facette, gris chaud proche des rochers
    KayKit, terre sous la crête, pied plus sombre) ; bande d'herbe qui
    déborde sous la crête, crête légèrement arrondie ; bords d'île plus
    profonds (environ 0,85 case sous le sol) au pied irrégulier ; ombre de
    contact au pied des falaises ; collines à l'ombrage à moitié lissé
    (arêtes de pente adoucies, facettes encore lisibles) ;
  - `?relief=massif` : la même roche, plus massive (bords d'île profonds
    d'environ 1,55 case qui se resserrent vers le bas, strates) ; collines
    à l'ombrage lissé (les anneaux de pente ne se lisent presque plus),
    creux plus sombres et bosses plus claires ; le relief projette ses
    ombres ;
  - `?relief=hybrid` : `massif` (collines, ombrage, roche, falaises
    intérieures, ombres), mais des bords d'île et de trous de la
    profondeur de `roche` (environ 0,85 case), au pied irrégulier et à la
    base un peu resserrée.

  `&reliefShadows=off` (ou `on`) force les ombres du relief de la variante,
  sans autre différence (comparaison). Les dessus restent exactement le sol
  logique (mêmes triangles : unités, grille, pose et pointage inchangés) ;
  seuls l'ombrage des dessus et les parois changent. Carte, relief,
  collisions, trajets et simulation inchangés ; rien n'est enregistré. Vaut
  aussi dans l'éditeur. Les trois variantes corrigent les faces de raccord
  sombres (KI-28).
- **Sol de l'éditeur en morceaux** (`render/terrainChunks.ts`) : découpé en
  carrés de 16 × 16 cases ; un coup de pinceau Surface (ou son annulation)
  ne reconstruit que les morceaux qui contiennent une case repeinte ou une
  voisine (à deux cases en `?groundLook=living`). Depuis le 2026-10-31
  (consolidation) : une sculpture ne reconstruit que les morceaux à moins
  de 4 cases d'une case dont le relief a changé (une modification de forme
  reconstruit toujours tout) ; dans un morceau reconstruit, une case dont
  les surfaces voisines n'ont pas changé rejoue ses transitions déjà
  calculées ; l'ombrage du relief est partagé par tous les morceaux. Même
  sol, triangle pour triangle, que le plateau d'un seul tenant du jeu.

## 12. Talents

Sources : `data/talents.ts`, `run/metaProgress.ts` (`canUnlockTalent`,
`resetTalentPoints`).

- **Racine** : **Or de départ** (coût 1). Il doit être débloqué avant tout
  autre talent.

Palier I (coût 1 chacun, débloquables indépendamment les uns des autres) :

| Branche | Talent | Effet |
|---|---|---|
| Économie | Butin de guerre | +1 or par ennemi tué |
| Précision | Tir rapide | Voir §5 |
| Armée | Réflexes de vétéran | +30 % de chance d'esquive pour les Fantassins du joueur |
| Soigneur | Aux petits oignons | Soin automatique sous 30 % de PV (voir §9) |
| Glace | Blizzard | Zone de dégâts ajoutée à la Nova de glace (voir §9) |

Palier II (coût 2, prérequis = le talent de Palier I de la même branche) :

| Talent | Prérequis | Effet |
|---|---|---|
| Recyclage | Butin de guerre | Revente améliorée (voir §7) |
| Mitraillette | Tir rapide | Voir §5 |
| Soins excédentaires | Aux petits oignons | Projectiles d'ombre (voir §9) |

- **Talent retiré** : « Maître de la forge » (qui divisait le coût en Runes
  des améliorations) n'existe plus. Une sauvegarde qui l'avait débloqué le
  perd au chargement et récupère ses 2 points (`REMOVED_TALENT_REFUNDS`,
  `run/metaProgress.ts`) ; les autres talents sont conservés.
- **Exclusivité** : une exclusivité existe entre talents qui partagent le
  même prérequis ; aucun talent actuel n'est concerné.
- **Réinitialisation** : « Réinitialiser les talents » rembourse tous les
  points dépensés.

## 13. Méta-progression : points de talent

Source : `run/metaProgress.ts`.

Points de talent (chaque source est accordée une seule fois par sauvegarde) :

- **+1** à la toute première fin de run de la sauvegarde. Il s'agit d'une
  défaite : un abandon ne compte pas.
- **+1** la première fois que la vague 4 est gagnée (`TALENT_POINT_WAVES`).
- **+1** la première fois que chacune des vagues 6, 8, 10, 12… est gagnée
  (`TALENT_POINT_RECURRING_START`, `TALENT_POINT_RECURRING_INTERVAL`).

Autres éléments :

- **Record** : le plus haut numéro de vague atteint est conservé et affiché.

## 14. Améliorations de Forge et d’Église

Sources : `run/runUpgrades.ts` (niveaux, coûts, achat), `data/*Upgrade.ts`,
`run/*UpgradeEffects.ts`, `ui/screens.ts` (overlay), `main.ts`
(`openForge`, `purchaseForgeUpgrade`).

Les améliorations sont **propres à la run** : niveaux stockés dans
`RunState.upgrades`, remis à `{}` à chaque nouvelle run, jamais
sauvegardés. Elles s'achètent en Or, depuis une Forge ou une Église
(`runUpgradeSite`) : la **Forge** propose la production des unités et la
Baliste, l'**Église** le Parchemin de soin, la Nova de glace et Soins
excédentaires. Le bâtiment n'est qu'un point d'accès : les niveaux restent
ceux de la run, partagés par toutes les Forges ou Églises possédées
(plusieurs Églises ne permettent aucun achat supplémentaire). La Mine, la
Caserne, la Tour et l'Église elle-même s'améliorent depuis leur fiche (§6).

- **Accès** : en préparation, sélectionner une Forge possédée puis
  « Ouvrir la Forge », ou une Église possédée puis « Améliorations de
  l'Église ». En bataille, ces écrans sont inaccessibles.
- **Overlay** : même écran pour les deux, titre « Forge » ou « Église »,
  seules les cartes du bâtiment ouvert ; Or actuel, une carte par amélioration avec
  son niveau (affiché à partir de 1), ses effets et le coût du niveau
  suivant. « Retour » ou Échap
  ramène à la préparation, le bâtiment toujours sélectionné. Pendant
  l'overlay, « Vendre », « Boutique » et « Prêt pour la bataille » sont
  masqués.
- **Achat** : Or débité, niveau +1, effet immédiat (fiches, unités recrutées
  ensuite, prochaine bataille). Bouton désactivé si l'Or ne suffit pas.
- **Niveau de production des unités** (`data/unitUpgrades.ts`,
  `run/unitUpgradeEffects.ts`) :
  - améliorer une unité à la Forge élève le niveau auquel les **futures**
    unités de ce type sont produites (boutique, Caserne, Camp d'archerie,
    Tester le scénario) ;
  - chaque unité possédée garde à vie le niveau de sa création
    (`OwnedUnit.productionLevel`) : ses PV, dégâts, bouclier et coût en
    dérivent. Une amélioration ne modifie jamais une unité déjà créée, ni
    ses PV actuels ;
  - chaque niveau augmente aussi le coût de recrutement des futures
    recrues (tableau ci-dessous) ; la population ne change pas ;
  - la carte de la Forge montre le niveau de production, les stats et le
    coût de la prochaine unité, et le gain du niveau suivant.
- **Coût** (`runUpgradeGoldCost(id, niveau)`) : `7 × 2^niveau` pour les
  unités (7 / 14 / 28 / 56…) ; 1 / 2 / 4 / 8 / 16… pour la Baliste et les
  parchemins. Aucun talent ne modifie ce coût.
- **Plafond** : aucune amélioration n'a de niveau maximum.
- **Prix** : les améliorations de la Baliste et des parchemins
  n'augmentent pas le prix de ce qu'elles améliorent ; celles des unités,
  si (surcoût de recrutement par niveau).

| Amélioration (accès) | Effet par niveau |
|---|---|
| Fantassin | +3 PV, +1 attaque ; recrutement +1 or |
| Archer | +2 PV, +1 attaque ; recrutement +1 or |
| Mage | +3 PV, +2 Boule de feu ; recrutement +3 or |
| Sentinelle | +15 PV, +1 bouclier par ennemi provoqué (jamais d'attaque) ; recrutement +10 or |
| Baliste (Forge) | +20 % de cadence (additif), +10 PV ; +1 dégât tous les 3 niveaux |
| Parchemin de soin (Église) | +1 PV soigné ; une cible secondaire de plus tous les 3 niveaux (moitié du soin, à 2 cases de la cible) |
| Nova de glace (Église) | +0,5 s d'immobilisation et de Blizzard ; +1 dégât de Blizzard tous les 3 niveaux |
| Soins excédentaires (Église) | +0,5 dégât par projectile ; +1 projectile tous les 3 niveaux |

La carte « Soins excédentaires » n'apparaît qu'avec le talent du même nom.

## 15. Sauvegarde : ce qui persiste

Sources : `run/metaProgress.ts`, `run/userSettings.ts`.

**Persistant** (dans le navigateur, `localStorage`) :

- points de talent et talents débloqués ;
- record de vague ;
- types d'ennemis déjà vaincus (déblocages) ;
- paliers de points de talent déjà accordés ;
- réglages (clé séparée).

**Non persistant** : toute la run en cours (or, bois et pierre, armée,
XP, niveau, morts et sac du Héros, inventaire, bâtiments, leurs niveaux et
l'avancement des chantiers, améliorations de Forge, vague, graine et état
de la carte, tas entamés, exploration du brouillard).
Quitter ou recharger la page la fait perdre.

Une ancienne sauvegarde contenant des Runes (`upgradeRunes`) ou des niveaux
d'amélioration permanents (`unitUpgrades`) se charge normalement : ces clés
sont ignorées, puis disparaissent à la sauvegarde suivante.

**« Effacer la sauvegarde »** (menu principal) remet toute la
méta-progression à zéro, après confirmation. Les réglages sont conservés.

## 16. Éditeur de maps

Accessible depuis le menu principal ; le détail d'usage est dans
`EDITOR.md`. 2026-11-01 (suite) : section **Neutres** du bestiaire (cinq
unités posables, toujours du camp Neutre), outils **Monter une case**,
**Descendre une case** et **Pente** restaurés, murailles d'une case.
2026-11-01 : pinceau **Forêt** (et gomme à arbres),
section **Eau** de l'outil Surface, bestiaire en deux sections (Humains ;
Barbares — aperçu, cinq fiches non posables). Une run ne charge aucune carte enregistrée depuis l'éditeur :
ces cartes servent à « Tester le scénario ». L'arène du Mode survie est une
carte exportée de l'éditeur puis intégrée au code (§11).

- **Relief** : catégorie « Relief » réduite à deux pinceaux continus,
  **+1 Surélever** et **−1 Abaisser**, taille **1×1** (une case) ou **4×4**
  (cœur 2 × 2) ; une couche par trait, niveaux 0 à 3, réversibles (−1 sur
  un +1 redonne le terrain exact, +1 ×3 puis −1 ×3 aussi) ; un sommet 3
  sur du 0 reçoit trois anneaux de pentes (2 → 3, 1 → 2, 0 → 1) ; plateaux,
  pentes, coins extérieurs et intérieurs automatiques, butte comme creux ;
  liaisons diagonales comblées et signalées en orange ; le pinceau peut
  dépasser de la carte ou chevaucher un trou (seules les cases de terrain
  s'appliquent ; un relief collé au bord ou à un trou s'arrête sur une face
  verticale) ; le pinceau suit le curseur dans le vide (plan de travail à
  la hauteur des cases voisines) : un trait peut commencer
  hors carte, contourner un coin ou traverser un trou ; un trait resté dans
  le vide ne fait rien (aucune entrée d'historique) ; tampon refusé
  seulement si une case à changer est occupée. Les outils manuels Pente,
  Coin extérieur et Coin intérieur ont été retirés (2026-10-29) : pentes et
  coins viennent uniquement de la sculpture ; les formes restent dans le
  moteur et les anciennes cartes qui en contiennent se chargent à
  l'identique. Une case portant un bâtiment, la
  Baliste, un obstacle / structure ou une unité ne change pas d'altitude ; un décor ne
  verrouille rien et suit la nouvelle surface ; enregistré dans la carte
  (`elevationCells`), annulable, testé par « Tester le scénario ». Détail :
  `EDITOR.md` §3.

- **Décors et obstacles** : tout le catalogue « Décors » (arbres, rochers,
  végétation, relief et forêts, structures décoratives, militaire,
  accessoires…) est purement visuel et traversable ; seule la rubrique
  « Obstacles / structures » (angles de muraille décoratifs, clôtures)
  bloque. Exception (2026-11-02) : dans « Tester le scénario » comme en
  jeu, la case d'un **arbre** (arbre, arbre isolé, bosquet : toutes ses
  cases) bloque le passage des unités terrestres. La hauteur d'un décor dérive du relief (pente comprise, sans
  inclinaison), jamais enregistrée.

- **Aspect des décors** : un même décor a le même aspect (orientation,
  forme des rochers, hauteur des arbres) dans l'éditeur, dans « Tester le
  scénario », dans le Mode survie et d'une session à l'autre. Sans
  `rotationY`, son orientation dépend de sa position ; une `rotationY`
  explicite reste prioritaire.

- **Interface** : barre du haut (Retour au menu, Nouvelle carte, Enregistrer,
  Charger, Tester le scénario, nom de la carte et indicateur « non
  enregistré »), colonne de gauche (Sélection, Carte, Territoire, Unités,
  catalogue des décors avec recherche), panneau de propriétés à droite,
  ligne d'état en bas. Les deux panneaux latéraux se replient ; la caméra
  cadre le plateau dans l'espace libre restant.
- **Territoire** : peint case par case (Joueur, Ennemi, Neutre) et
  enregistré dans la carte. Une carte qui n'en définit pas utilise le repli
  historique, matérialisé seulement au premier coup de pinceau.
- **État non enregistré** : comparaison avec le dernier export enregistré ;
  confirmation avant Retour au menu, Charger et Nouvelle carte ;
  avertissement du navigateur à la fermeture de l'onglet.
- **Historique** : annuler / rétablir couvre toutes les modifications de la
  carte (poses, suppressions, déplacements, rotations, Baliste, cases,
  territoire, Taille).

- **Décors** : rochers, arbres, props et bâtiments décoratifs, en placement
  libre (position et rotation). Le **centre** d'un décor doit tomber sur une
  case existante, à la pose comme au déplacement : jamais au-dessus d'un
  trou ni hors du plateau (`KNOWN_ISSUES.md`, KI-20, pour les grosses
  emprises).
- **Unités** : du bestiaire, alignées sur la grille. Leur camp est celui du
  territoire de la case où elles sont posées ; une case neutre est
  interdite.
  - **Sélection** : mêmes gestes qu'en préparation et en bataille (clic,
    Maj + clic, rectangle), pour les deux camps. Le double-clic prend les
    unités visibles du même type et du même camp. Décors et Baliste restent
    des sélections distinctes, jamais mélangées aux unités.
  - **Déplacement** : même aperçu et même calcul qu'en préparation.
    - Un déplacement réussi vide la sélection et masque l'aperçu ; un
      refus conserve la sélection et l'aperçu.
    - Deux unités ne peuvent plus finir sur la même case.
    - Un déplacement de groupe est **une seule entrée** d'annuler /
      rétablir, qui restaure positions et camps.
    - Le camp est recalculé à l'arrivée selon le territoire : une unité
      amenée en territoire adverse change de camp. Une unité déjà posée garde
      son camp tant qu'elle n'est pas déplacée.
- **Terrain** : ajout et suppression de cellules au pinceau (clic maintenu
  et glisser ; un trait = une seule entrée d'annuler / rétablir, territoire
  des cases supprimées compris), taille du plateau modifiable. Une case ne
  peut pas être supprimée sous une unité, sous la Baliste, ni sous le centre
  d'un décor (props compris).
- **Baliste** : sélectionnable et déplaçable, calée sur une grille de 3×3
  cases. Le déplacement est refusé si l'empreinte 3×3 n'est pas entièrement
  en territoire joueur, ou si la tour sortirait du plateau ou recouvrirait un
  trou, un obstacle bloquant ou une unité. Une Baliste chargée hors du
  territoire joueur est conservée telle quelle. Aucune unité ne
  peut ensuite être posée ou déplacée dans son empreinte, ni aucune case
  supprimée sous elle ; Suppr et R sont sans effet sur elle.
  - Sélectionnée, elle est entourée d'un anneau à la couleur de son camp
    (bleu, le joueur) ; les décors gardent leur anneau doré. Elle reste un
    objet distinct des unités.
  - Avec la Baliste sélectionnée, un appui au sol tente aussitôt de la
    déplacer : un glisser ne trace pas de rectangle de sélection d'unités.
  - Son centre est enregistré dans `MapDef.ballista?: { x, z }`, écrit
    seulement si la position a été définie explicitement. Une carte sans ce
    champ garde le repli historique du coin, et reste sans champ si on la
    réenregistre sans déplacer la Baliste.
  - Annuler / rétablir restaure la position et ce statut ; enregistrer puis
    charger conserve la position.
- **Outils** : annuler / rétablir ; nouvelle carte ; enregistrer et
  charger une carte en JSON.
- **« Tester le scénario »** : lance une vraie bataille sur la carte éditée,
  puis revient à l'éditeur.
  - La Baliste y est un **vrai bâtiment** (PV, collision, destruction, état
    `DÉTRUITE` du HUD), à la position de la carte : modèle, origine des tirs,
    bâtiment et collision coïncident exactement.
  - Les bâtiments de scénario de la carte y deviennent de vrais
    bâtiments, au niveau 1 (voir ci-dessous).
- **Bâtiments de scénario** : groupe « Bâtiments » de la bibliothèque (Mine,
  Caserne, Camp d'archerie, Forge, Maison, Tour, Église) ; pose continue selon l'emprise réelle
  du bâtiment, refusée hors du plateau, sur un trou, sur un autre bâtiment,
  la Baliste, un décor bloquant ou une unité, sans règle de territoire ;
  camp joueur ; enregistrés dans `MapDef.buildings` (absent = aucun),
  ignorés par le Mode survie. La Baliste garde son outil dédié.
- **Pose d'unités** : continue, l'outil reste actif après chaque pose ; clic
  droit ou Échap reviennent à Sélection.

## 16 bis. Atelier de personnage

Outil interne de conception (2026-11-01, `src/workshop/`) : composer une
unité Toon RTS pièce par pièce, puis en exporter la configuration pour
`tools/toon-units/units.json`. **Aucune incidence sur une run** : aperçu
seulement, aucune donnée de jeu ni sauvegarde modifiée.

- **Accès** : bouton « Atelier de personnage » du menu principal, après
  « Éditeur de maps ». Il ouvre un écran dédié : panneau de réglages à
  gauche, aperçu 3D à droite. « Fermer » revient au menu.
- **Aperçu** :
  - renderer et canvas propres ;
  - caméra orbitale (OrbitControls) avec zoom et rotation automatique
    facultative ;
  - fond neutre gris-bleu et disque de sol ;
  - lumière hémisphérique, soleil avec ombres et lumière d'appoint.
- **Source** : « Humains — Western Kingdoms », « Barbares —
  Barbarians » ou **« All — toutes les sources »**. Le catalogue est lu
  dans `assets/units/toon/atelier/<source>_atelier.json` et `.glb`,
  produits par le pipeline (`--atelier`, ASSETS.md §3.1), sans liste de
  pièces en dur.
  - **All** : chaque liste (emplacements, extras, mains) contient les
    pièces des deux sources, groupées par source et étiquetées `[Humain]` /
    `[Barbare]`, sans restriction de mélange. Passer en All garde le
    personnage affiché.
  - Repasser sur une source seule garde le personnage s'il n'utilise que ses
    pièces ; sinon, le premier preset de cette source est chargé.
  - Chaque pièce connaît sa source. Le squelette et les clips sont ceux de
    la **source de base** (celle du preset) ; les pièces des autres sources
    s'y rattachent par nom d'os (même squelette Biped, même repos).
- **Emplacements** :
  - tête, corps, bras, jambes et épaulières, chacun avec « Aucun » ;
  - **échelle par pièce** : curseur de 0,5 à 2, saisie libre (minimum
    0,05), valeur affichée (×1.100) et « Reset » par emplacement, plus
    « Échelles des pièces : tout à 1 ». Chaque sommet est mis à l'échelle
    autour des articulations qui le portent (moyenne pondérée par ses
    poids). Le squelette, les poids et les clips ne changent pas, et la
    pièce suit ses os dans toutes les poses. Le calcul est le même que dans
    le pipeline ;
  - casque et cape : emplacements présents mais désactivés, signalés
    « Aucune pièce séparée dans ce pack » (casques et capuches sont des
    têtes) ;
  - accessoires (sac, carquois, bois) par cases à cocher ;
  - tout changement est immédiat.
- **Mains libres** :
  - main droite et main gauche acceptent n'importe quelle pièce tenue du
    pack (armes, boucliers, bâtons, arc), y compris la même dans les deux
    mains ;
  - une pièce placée dans l'autre main que la sienne est affichée en miroir
    sur l'os symétrique, comme `offhand_weapon` ;
  - par main : échelle, rotation X/Y/Z (degrés), décalage X/Y/Z, et
    « Réinitialiser ».
- **Échelle du personnage** : saisie libre et raccourcis 0,8 / 1 / 1,1 /
  1,2 / 1,3, aperçu seulement. Un preset prend l'échelle de jeu de l'unité
  (Sentinelle 1,15, Héros 1,3…).
- **Couleurs** :
  - palettes du jeu (`TOON_PALETTES` : rouge, bleu, vert, jaune, neutre
    brun / gris, violet, orange, gris clair, brun, ocre, noir) ou couleur
    libre (« Personnalisée ») ;
  - seconde couleur et mélange de 0 à 1 : mélange **uniforme** des deux
    teintes, pas une seconde zone ;
  - intensité de 0 (atlas neutre) à 1 ;
  - **une seule zone d'équipe** : le masque n'a qu'un canal (KI-37) ;
  - personnage mixte : un matériau par source utilisée, avec son atlas et
    son masque d'équipe ; la même teinte s'applique à tous.
- **Animations** : les 64 clips des dossiers `Infantry`, `Spearman`,
  `Archer`, `Mage` et `Worker`, groupés par dossier (repos, repos de combat,
  marche, course, attaques, sorts, mort, travail…).
- **Infos techniques** : sources utilisées (« Sources : Humain +
  Barbare ») et source de base, triangles, sommets, os, matériaux, clips,
  échelle du personnage et des pièces, noms des pièces affichées.
- **Presets** :
  - Humains : Homme d'armes, Archer, Mage, Sentinelle, Oracle, Piquier,
    Vengeur et Héros ;
  - Barbares : Maraudeur, Ravageur, Traqueur, Féticheur et Colosse ;
  - lus dans `units.json`. Chaque preset composé a exactement les
    triangles de son GLB de jeu ;
  - **Cavalier léger** et **Razzieur** : presets **fixes**, affichés depuis
    leur GLB de jeu. Pièces et mains non éditables (FBX modulaire illisible,
    KI-36) ; couleurs, échelle et animation réglables.
- **Export** :
  - « Copier la config » (presse-papiers) et « Exporter (.json) »
    (téléchargement `<nom>.json`) produisent le même texte : `{"<nom>":
    <entrée units.json>}`, avec `source`, `pieces` (dont `pieces.hands`),
    `animations` (dossier du clip d'aperçu) et un bloc `atelier` (couleur,
    échelle, clip, `toutes_sources`), que le pipeline ignore ;
  - une pièce de la source de base à l'échelle 1 reste un nom (format
    historique, anciennes configs compatibles). Sinon elle devient
    `{"piece", "source"?, "scale"?}`, et une main reçoit `"source"` si elle
    vient d'une autre source ;
  - « Charger » relit une config collée dans la zone de texte et
    reproduit le personnage à l'identique, sélecteur All compris ;
  - une config exportée, construite par le pipeline, donne la même
    géométrie que l'aperçu. C'est vérifié sur une double hache, et sur une
    config mixte avec échelles au repos et en idle, course, attaque et mort.
- **Limites** (KNOWN_ISSUES.md KI-37, KI-38) :
  - une seule zone de couleur ;
  - une unité mixte construite par le pipeline a deux matériaux. Le jeu
    (`render/toonUnitRig.ts`) n'applique qu'un atlas par unité : il n'est
    pas encore prêt à afficher une unité mixte ;
  - un objet tenu dans la main gauche en miroir suit les gestes de bouclier
    des clips `Infantry` (même mécanisme que le Vengeur du jeu) ;
  - pas d'éditeur d'items (ROADMAP.md §6 ter).

## 17. Audio

- Un moteur audio procédural est présent dans `audio/`, mais il est
  **déconnecté** : le jeu est actuellement silencieux.
- L'onglet Paramètres > Son existe et enregistre les volumes, sans effet
  audible.

## 18. Outils de debug présents

- **Panneau de debug** permanent en haut à droite (`ui/debug.ts`) :
  - replié par défaut, il n'affiche que le FPS (`FPS 240 ▾`) ;
  - un clic le déplie vers le bas avec le détail : fps, tick, temps sim,
    vitesse, joueur, ennemis, graine, pivot, inclinaison, zoom. Un nouveau
    clic le replie ;
  - les valeurs restent calculées comme avant, replié ou non ;
  - la boutique, les menus et la barre d'outils de l'éditeur le recouvrent.
- **Touche X** : bascule la vitesse de jeu entre ×1 et ×2. Son aide « X —
  Vitesse fois 2 », en bas à gauche, est masquée dans l'éditeur (pas pendant
  un test).
- **Bouton « +1 point de talent (debug) »** dans l'écran des talents.
- **Bouton « +100 or (debug) »** dans la boutique de run.

## 19. Absent ou retiré

Cette liste sert à éviter les confusions avec d'anciennes versions du jeu ou
de la documentation. L'historique des retraits relèvera de
`DESIGN_DECISIONS.md`.

- **Unités** :
  - pas de Chevalier. Le Cavalier léger est revenu le 2026-11-01, à la
    demande d'Antoine, sous une forme nouvelle (modèle Toon, bestiaire et
    éditeur seulement, §6 bis ; `DESIGN_DECISIONS.md` B1, G8) ;
  - la capacité Charge existe dans le code, mais aucune unité ne la possède.
- **Ennemis** : pas de bâtiments ennemis.
- **Talents** : « Le temps, c'est de l'argent » n'existe plus (la Mine est un
  bâtiment acheté), ni « Maître de la forge » (§12). Les points des
  anciennes sauvegardes sont remboursés.
- **Économie** : plus de Runes, ni de gain de Runes en fin de vague, ni de
  boutique d'amélioration permanente dans le menu principal. Les
  améliorations s'achètent en Or à la Forge et sont propres à la run (§14).
- **Boutique** : pas d'onglet « Soins » ni de bouton « Soigner une unité » ;
  le soin passe uniquement par le parchemin.
- **Cartes** : pas de succession de cartes prédéfinies distinctes au fil des
  vagues, ni de choix de carte. Le Mode survie part toujours de la même
  arène ; seule l'expansion A/B/C la modifie.
- **Baliste** : plus de placement manuel de la tour en début de run ; sa
  position vient de la carte (§5).
- **Sauvegarde** : pas de sauvegarde d'une run en cours.
- **Contrôles en bataille** : pas de mode Commandement / Baliste, et la
  touche B n'a plus de fonction. La Baliste ne tire plus au clic gauche,
  seulement avec Q. Il n'y a plus d'indicateur de mode ni de barre de
  recharge séparée en bas à droite : un seul HUD de Baliste (§5).
- **Éditeur** : pas de mode rotation W/E. La rotation se fait par l'anneau
  de sélection et par Ctrl+molette.
- **Tests** : pas de tests automatisés (voir `ARCHITECTURE.md`, §17).
