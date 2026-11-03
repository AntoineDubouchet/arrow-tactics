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
6 ter. Équipement, items et butin du Héros
6 quater. Camps neutres et coffres
6 quinquies. Inventaire unique, or physique, HUD et contrôles
6 sexies. Barils, production, ralliement, réparation
6 septies. Niveau d'unité, cartes de survie, sol du village
6 octies. Palissade V2 (murs géométriques)
6 nonies. Or monnaie, Forge et outils, gisements, Maison A/B, Sanctuaire, Écurie
6 decies. Tourbillon du Paladin (prototype)
6 undecies. Cargo économique : inventaire RPG ≠ sac de ressources
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
16 ter. Éditeur d'items
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
  guerre**, gagne de l'XP, récolte du **bois**, de la **pierre** et de l'or
  des gisements dans son **sac de ressources** (cargo de 10, séparé de
  l'inventaire RPG), les **dépose à un point de collecte** (Baliste pour
  tout, Scierie pour le bois, Camp de mineur pour la pierre et l'or
  extrait : seul chemin vers le stock, §6 undecies ; le stock s'ajoute à
  l'or dans le prix des bâtiments) et
  bâtit en bataille les **chantiers**.
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
   Mage → Sanctuaire, Oracle et Vengeur → Église, Cavalier léger → Écurie
   (2026-11-03, §6 nonies). Maison + Caserne ou Maison +
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
| Villageois (2026-11-03) | 5 | 2,5 | 0,2 | 0,95 / 1,5 | 1,6 s | 25 % |
| Cavalier léger (Écurie, 2026-11-03) | 15 | 18 | 3 | 1,2 / 10 | 1,3 s | 10 % |

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
  - Le **Mage** exige en plus au moins un **Sanctuaire** possédé (Église
    jusqu'au 2026-11-03), selon la même règle que le Fantassin et l'Archer
    (« Nécessite un Sanctuaire »). Les Mages possédés restent si le dernier
    Sanctuaire est détruit.
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
  (`countsForDefeat`), comme les unités et la Baliste — sauf les pièces de
  mur (Palissade, §6 octies).

**Murs** : le **Wall V1** (muraille case par case, porte KayKit, virages,
tracé sur grille) est **supprimé** depuis le 2026-11-02. Le seul mur jouable
est la **Palissade V2**, géométrique et sans grille : voir §6 octies.

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
- **Améliorations** : depuis le 2026-11-03, les parchemins sont au
  **Sanctuaire** (« Parchemins du Sanctuaire », §6 nonies) ; l'Église n'a
  plus d'écran d'améliorations.
- **Recrutement** : posséder au moins une Église débloque le recrutement
  de l'Oracle et du Vengeur (§4) ; le Mage est au Sanctuaire.
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
et le **cœur de la base** : sa destruction est une défaite immédiate
(2026-11-02).

**Héros** (`hero`) :

- unique, gratuit, hors population, jamais vendu. Il reste dans l'armée de
  la run même s'il est à terre en fin de manche, et revient alors à pleins
  PV ; vivant, il garde ses PV comme les autres unités (l'Église le soigne
  jusqu'aux PV de son niveau) ;
- stats affichées : 30 PV, 2,5 dégâts, portée 1, aggro 9, cadence 1,1 s,
  5 % de raté, vitesse **4,16** (2,6 avant le 2026-11-02 : +60 %, demande
  d'Antoine), rayon 0,6 ;
- **niveaux** (2026-11-02, provisoire, `data/hero.ts`) : **niveau 100
  maximum** (3 avant). XP pour le niveau suivant : 50 × niveau jusqu'au
  niveau 10 (50, 100, 150… 450 : niveaux 2 et 3 toujours à 50 et 150 XP),
  puis 100 XP de plus à chaque niveau (10 → 11 : 550, 20 → 21 : 1 550). Total :
  niveau 10 à 2 250 XP, 20 à 12 250, 50 à 102 250, 100 à 452 250. Gains par
  niveau, par tranche (`heroLevelBonus`, provisoire) : niveaux 2 à 10, +7,5 PV
  et +0,6 dégât ; 11 à 25, +4 et +0,3 ; 26 à 50, +2 et +0,15 ; 51 à 100, +1
  et +0,08. Vitesse +0,24 aux niveaux 2 et 3 seulement (figée ensuite).
  Totaux : niveau 10, 97,5 PV et 7,9 dégâts ; 25, 157,5 et 12,4 ; 50, 207,5
  et 16,15 ; 100, 257,5 et 20,15. Médaillon du portrait : rond jusqu'à 99,
  pilule un peu plus large à 100 ;
- **montée de niveau** (2026-11-02, VFX **provisoire**,
  `render/levelUpVfx.ts`) : effet 3D d'environ 1,3 s sur le Héros (flash
  blanc-doré, onde au sol dorée et bleue, colonne de lumière, particules
  qui montent, étincelles), qui suit sa position affichée ; le médaillon
  pulse, la barre d'XP brille et « NIVEAU N » apparaît brièvement au-dessus
  du portrait (rien n'interrompt la partie ; l'ancien bandeau « Héros :
  niveau N ! » est retiré). **Agrégation** : plusieurs niveaux d'un même pas
  = un seul effet, niveau final ; un niveau pendant l'effet le relance (un
  seul effet par Héros). Héros à terre : badge seulement, pas d'effet 3D.
  Déclenché par l'événement de simulation `levelUp` existant ; le rendu
  est remplaçable sans toucher à l'XP (`LevelUpEffect`) ;
- **XP en zone partagée** : chaque unité adverse (pas un bâtiment) morte à
  6 cases ou moins du Héros vivant lui donne max(4, coût × 4) XP, **30 au
  plus par mort**, quel que soit le tueur (Maraudeur 8, Traqueur 12,
  Féticheur, Colosse, Ravageur et Razzieur 30). XP, niveau et morts sont
  gardés sur toute la run ;
- **mort** : retour près de la Baliste après 15 s (première mort de la run),
  30 s, 60 s, puis 90 s au plus, à pleins PV et en Garde, tant que la
  Baliste tient. **Défaite** dès que la Baliste est détruite, Héros vivant
  ou mort (2026-11-02) ;
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
  d'incantation, **+15 PV** (5 PV avant le 2026-11-02, demande d'Antoine ;
  sans dépasser le maximum), portée 5 cases, sur
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
- **visuel** : Toon RTS (`human_hero.glb`, local, hors Git), échelle 1,4 ;
  config de l’Atelier d’Antoine (mise à jour du 2026-11-03) : tête WK « H »
  (barbu à capuche, ×0,9), corps barbare E (×0,8), bras barbares C, jambes
  WK C (×1,1), épaulières barbares B, **marteau barbare ×1,4** ; hache et
  pioche WK pour couper et miner, marteau sinon.
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

**Ressources, transport et dépôt** (⚠️ règle du 2026-11-03 : le transport
passe par le **cargo économique**, jamais par l'inventaire RPG, voir
§6 undecies ; les mentions de « sac » ci-dessous désignent ce cargo) :

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
- **récolte avancée** (règle du 2026-11-03, §6 nonies) : couper les arbres
  demande la **Hache de bûcheron**, exploiter les gros gisements de pierre
  et d'or la **Pioche de mineur** ; les deux outils sont donnés par une
  **Forge terminée** (`BuildingDef.unlocksTools`). La Scierie et le Camp de
  mineur ne contrôlent plus rien (ce sont des points de collecte, §6
  undecies). Un chantier ne débloque rien ; il suffit
  d'un bâtiment terminé ; les droits sont recalculés avant chaque pas d'après les
  bâtiments du joueur présents dans le monde (Survie générée, carte
  dessinée, « Tester le scénario »). Dernier bâtiment détruit pendant une
  récolte : le Héros finit l'unité en cours d'extraction, puis s'arrête ; en
  chemin, il s'arrête aussitôt ; tout nouvel ordre de récolte est refusé.
  Points de collecte : Baliste (tout), Scierie (bois), Camp de mineur
  (pierre, or extrait), §6 undecies. La **Mine** (or toutes les 60 s) est
  inchangée. **Clic droit sur un arbre ou un
  rocher verrouillé** (2026-11-02, règle d'Antoine : « interaction reconnue +
  déplacement autorisé », jamais « clic consommé ») : la source est
  sélectionnée (anneau jaune, étiquette), la raison est rappelée (« Couper
  les arbres / Exploiter ce gisement : il faut une Forge (outil) »), et le Héros **va au pied de la
  ressource** (point d'approche de son côté) sans la récolter. Avec le droit
  de récolte : même sélection, puis déplacement à portée et récolte
  automatique (hache pour un arbre, pioche pour un gisement). La récolte
  remplit le sac (1 unité / 1,5 s, piles de 5), jamais le stock ; sac plein :
  seulement ce qui entre, rien n'est perdu (la source garde le reste) ; un
  arbre étant bloquant, sa portée se mesure jusqu'à sa case ;
- **gros gisements de pierre** (2026-11-02) : **40 pierre** chacun
  (`STONE_DEPOSIT_AMOUNT`, provisoire ; inépuisables avant), même logique que
  les arbres (`HARVEST_NODE_KINDS`, `data/resources.ts`). Sélection :
  « **Gisement de pierre — 40 pierre** » (quantité restante). À 0 : extraction
  arrêtée, rocher retiré, **gravats** décoratifs à sa place. Depuis le
  2026-11-03, les gros gisements (pierre et or) **bloquent** le déplacement
  et la construction comme les arbres ; épuisés, leurs cases sont libérées
  (pathfinding recalculé, construction possible). KI-41 est remplacé ;
- **arbres** (2026-11-02) : chaque arbre (arbre isolé ou bosquet) vaut
  **20 bois** en tout (`TREE_WOOD_AMOUNT`, provisoire), décomptés par la
  simulation à chaque unité coupée (`World.resourceNodeAmounts`). **À 0,
  l'arbre est abattu** (décision d'Antoine) : la coupe s'arrête définitivement,
  l'arbre disparaît et une **souche** décorative le remplace (une par case
  libérée d'un bosquet) ; ses cases ne bloquent plus et redeviennent
  constructibles ; le pathfinding en tient compte dès le pas suivant
  (`World.fellTree`). Volontaire : abattre une forêt peut ouvrir un chemin,
  aux vagues aussi. Une case partagée par deux arbres reste bloquée tant que
  l'autre est debout. **Sélection** : clic gauche sur un arbre
  exploré (tronc ou feuillage) → **anneau jaune** autour (même anneau que le
  dépôt et les tas) et « **Arbre — 20 bois** » (bois restant) ; gisement
  exploré : même anneau, « **Gisement de pierre — 40 pierre** » ; un second clic, un clic
  ailleurs ou une nouvelle sélection d'unités le retire (le clic droit du
  Héros sélectionné le garde) ;
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
| Scierie (10 or, 3 × 3, 15 PV ; point de collecte : bois) | 8 | — | 8 s |
| Camp de mineur (10 or, 3 × 3, 15 PV ; point de collecte : pierre, or extrait) | 6 | 4 | 8 s |
| Sanctuaire (25 or, 2 × 2, 20 PV) | 8 | 8 | 10 s |
| Écurie (20 or, 3 × 3, 25 PV) | 12 | — | 10 s |
| Palissade (par case de longueur) | 0,5 | — | 1,5 s |
| Porte de palissade | 4 | — | 4 s |

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
  chantier, palissade, Baliste, unité) : règle unique
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

**Caméra centrée sur le Héros** (2026-11-02, demande d'Antoine) : dès le
lancement d'une run, la caméra est centrée sur le Héros et le **suit**
(position affichée interpolée : fluide, sans à-coup). Un déplacement manuel
de la caméra (défilement aux bords, glisser) lâche le suivi : la caméra
reste libre. **Espace** (en jeu) : retour au Héros — sélection, centrage et
suivi repris ; il ne bascule plus vers la Baliste (ancien comportement
retiré). Le **portrait** du HUD fait de même. Le bouton qui gardait le focus
le perd d'abord (KI-24). Dans l'éditeur et « Tester le scénario », Espace
recadre comme avant ; R garde la caméra par défaut.

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
  la liste « Construire : … ». **Palissade** et **Porte de palissade** au
  menu depuis le 2026-11-02 (tracé A → B, §6 octies) ;
- **production** (`data/production.ts`) : la fiche d'un bâtiment bâti
  propose « Produire : <unité> — or · durée » pour les unités qu'il
  débloque (Caserne : Piquier, + Homme d'armes au Niv. 2 ; Camp d'archerie :
  Archer ; Église : Mage, Oracle, Vengeur). **File de production**
  (2026-11-02) : jusqu'à **5 commandes** par bâtiment (unités et
  amélioration du bâtiment mélangées), traitées **dans l'ordre des clics**,
  l'une après l'autre ; chacune est payée au clic (or) ; la fiche liste la
  file (« 1. Piquier — 5 s ✕ », « 2. Amélioration Niv. 2 — en attente ✕ ») et
  un clic sur une commande l'annule, or **rendu** en entier ; file pleine :
  boutons « Produire » grisés. Une file perdue avec son bâtiment n'est pas
  remboursée. L'unité sort à la fin de sa durée (Piquier 6 s, Homme d'armes
  8 s, Archer 9 s, Mage et Oracle 14 s, Vengeur 16 s, provisoires), près du
  bâtiment, en Garde, si la population le permet. La production automatique
  de début de manche n'est plus utilisée ;
- **améliorations, Forge, Église** : depuis la fiche du bâtiment bâti, en
  temps réel. Bâtiment **producteur** (Caserne, Camp d'archerie, Église) :
  l'amélioration passe par sa file (20 s, provisoire ; une seule à la fois ;
  payée au clic, appliquée à sa fin). Autres bâtiments (Mine, Tour…) :
  amélioration immédiate (PV max, dégâts de la Tour). L'écran de la Forge /
  de l'Église met le jeu en pause tant qu'il est ouvert ; le soin de l'Église
  rend leurs PV aux unités vivantes ;
- **menu Construire** : un clic gauche sur le terrain le ferme, sans rien
  faire d'autre (2026-11-02) ;
- **Boutique globale** : absente de la Survie (bouton masqué) ; parchemins
  et achat d'unités ne passent plus par elle (voir `ROADMAP.md` §6 quater) ;
- **inventaire** (6 emplacements) et encart **« AUTO BALISTE — prête »** :
  masqués en Survie (2026-11-02) ; l'encart de la Baliste reste dans
  « Tester le scénario » ;
- **Baliste en mode AUTO** : n'acquiert et ne garde que des cibles **vues**
  par le camp du joueur (vision gameplay `sim/vision.ts`, mêmes rayons que
  le brouillard, positions simulées). Sa vision (18) égale sa portée (18).
  Un carreau déjà tiré poursuit sa course ;
- **Espace** : retour au Héros et suivi (2026-11-02 ; plus de bascule vers la Baliste) ;
- **décors instanciés** (KI-34) : sur la carte générée, arbres, rochers et
  petits décors sont regroupés par modèle et par morceau de 32 cases.

## 6 ter. Équipement, items et butin du Héros

Depuis le 2026-11-02 (valeurs PROVISOIRES) :

- **items** (`data/equipment.ts`) : id, nom, description, **rareté**
  (Commune blanc, Peu commune vert, Rare bleu, Épique violet, Légendaire
  orange : couleur du nom et du cadre), type, **emplacement** (arme
  principale, main secondaire, bouclier, casque, épaulières, cape ; main
  secondaire et bouclier partagent la main gauche), **visuel** (source de
  pièces — Western Kingdoms, Barbares, futures —, pièce, échelle, rotation,
  décalage : format des mains de l'Atelier), **stats** en points affichés
  (PV max, mana max, régénération de mana, dégâts de mêlée, vitesse
  d'attaque en %, vitesse de déplacement), **effets** (aujourd'hui : feu à
  chaque coup qui touche), **valeur de vente** (or, futur Marché) ;
- **items de démonstration** : Épée du débutant (Commune, +3 dégâts),
  Lame des braises (Peu commune, +4 dégâts, feu +3 à chaque coup), Bouclier
  robuste (Peu commun, +8 PV max), Épaulières de garde (Commune, +4 PV,
  +0,1 vitesse) ;
- **inventaire** : depuis le 2026-11-02, inventaire unique de 20 cases
  (`sim/inventory.ts`, §6 quinquies) : équipements et ressources dans les
  mêmes cases, items équipés par emplacement ; équiper, remplacer (l'ancien
  revient au sac), retirer ; jamais d'item perdu ni dupliqué ;
- **stats finales** = fiche du niveau + bonus d'équipement, recalculées
  d'un bloc (`refreshHeroStats`) : rien ne se cumule ; PV et mana actuels
  gardent la même proportion du maximum quand l'équipement change (équiper
  puis retirer ne soigne jamais), augmentent du même écart à la montée de
  niveau ; mort et retour gardent l'équipement ;
- **feu** : à chaque coup de mêlée qui touche, dégâts normaux puis dégâts de
  feu (`Entity.onHit`, `applyDamageToEntity`) ; rien sur un raté, une
  esquive ou un élan annulé ; petit texte orange « 🔥3 » à l'impact ;
- **interface** : inventaire du Héros (touche I) avec ses emplacements
  (« Retirer ») et son sac d'objets (« Équiper »), cartes à la couleur de la
  rareté. Console : `arrowItems.give / equip / unequip / list`.
  `?items=demo` met les items du catalogue dans le sac au lancement ;
- **visuel en jeu** : l'arme et le bouclier équipés apparaissent dans les
  mains du Héros (même placement que l'Atelier, pièces de toute source). Au
  travail, l'outil (hache, pioche, marteau de chantier) remplace l'arme le
  temps du travail ; sans arme, le marteau du Paladin reste son arme. Les
  pièces de corps (casque, épaulières) ne sont **pas encore** affichées en
  jeu (KI-44) : leurs stats s'appliquent ;
- **butin (fondation)** : item au sol (`World.dropItem`), pièce de l'item,
  anneau et colonne de lumière à la couleur de la rareté, caché tant que
  sa case n'est pas explorée ; clic droit du Héros → ramassage (0,6 s,
  barre de progression) → sac d'objets (« Butin : … ») ; sac plein : l'item
  reste au sol. `?loot=demo` pose les items du catalogue autour de la
  Baliste. La pièce est couchée sur sa face la plus large, légèrement
  inclinée, orientation fixe tirée de son id (KI-45 corrigé le 2026-11-02) ;
- **butin branché** (2026-11-02, `data/loot.ts`, RNG du monde) : coffres
  des camps neutres (§6 quater) et Maraudeur abattu (12 %, item commun,
  une fois par mort) ; l'item tombe au sol et se ramasse comme ci-dessus ;
- **Hache du chef pillard** (Rare, 2026-11-02) : +4 dégâts, +15 % vitesse
  d'attaque, +4 PV max, vente 20 or ; butin rare des coffres de camp.

## 6 quater. Camps neutres et coffres

Première boucle d'exploration (2026-11-02, valeurs PROVISOIRES,
`DESIGN_DECISIONS.md` G14) :

- **génération** (`placeCamps`, carte procédurale seulement) : un **petit
  camp** (toujours) et un **grand camp** (sur la plupart des graines, à
  plus de 20 cases du petit), à 31-38 cases du centre : hors de la zone
  explorée au départ (22) et de l'anneau des vagues, loin du bord.
  Clairière de rayon 3,5 sans eau, relief, rampe, rocher ni tas ; au plus
  4 arbres, retirés ; abords ouverts et reliés à pied à la Baliste.
  Déterministe sans tirer dans la RNG de la carte : le reste du terrain
  d'une graine est inchangé. Deux petits tas (3 bois, 2 pierre) à côté ;
- **décor** : feu de camp, tente, bannière, caisses, tonneau, tas de bois,
  râtelier d'armes (seconde tente et seconde bannière pour le grand camp),
  en props **traversables** comme tout décor ; flammes et **une lumière
  ponctuelle** par camp, éteinte tant que le camp n'est pas découvert ;
- **gardes** (`data/camps.ts`) : petit camp 2 Maraudeurs, 1 Traqueur,
  1 Féticheur ; grand camp 2 Maraudeurs, 1 Ravageur, 2 Traqueurs,
  1 Féticheur. Stats de base (pas de montée par vague). Ils ne comptent
  pas pour la fin d'une vague et ne marchent jamais vers la Baliste ;
- **comportement** (`sim/systems/camps.ts`) : au calme, à leur poste ; un
  adversaire dans la **zone de détection** (6 / 6,5 cases du centre) ou un
  garde blessé met le camp en **alerte** : tous les gardes chassent dans la
  **laisse** (11 / 12 cases) ; l'alerte retombe quand plus personne n'y est,
  les gardes **rentrent** à leur poste (adversaires ignorés en chemin) et
  s'y régénèrent (10 % des PV max par seconde) ;
- **camp au calme** : jamais ciblé automatiquement par les unités du
  joueur (un Héros en Garde qui voit un camp ne fonce pas dessus) ; un
  ordre d'attaque, l'entrée dans la zone de détection ou une blessure
  lancent le combat ;
- **brouillard** : rien du camp n'est visible avant exploration (gardes,
  coffre, flammes, lumière ; le décor est noirci par la passe de
  brouillard) ; ensuite mémoire normale, gardes visibles seulement dans la
  vision ; annonce « Camp de pillards découvert ! » ;
- **états** : non découvert (présentation, `main.ts`), actif, nettoyé
  (tous les gardes morts : annonce, **or** 8 / 15, pas de retour des gardes
  pendant la run) ;
- **XP** : système existant (zone de partage, plafond par kill) : 58 XP
  pour le petit camp (le Paladin passe niveau 2). Pas de prime d'or par
  kill pour ces unités (barème `KILL_REWARD` sans elles) ;
- **coffre** (`World.chests`) : low-poly (bois, ferrures, serrure dorée) ;
  camp défendu → clic droit refusé (« Camp encore défendu ») ; nettoyé →
  anneau doré qui pulse, clic droit → le Héros y va et l'ouvre en **1 s**
  (barre d'action), couvercle relevé, une seule fois ; l'item tiré de la
  table du camp tombe au sol devant le coffre (« Coffre ouvert : … ») ;
- **tables** : petit coffre Commune 60 %, Peu commune 30 %, Rare 10 % ;
  grand coffre 30 / 50 / 20 %. Toujours un item ;
- **difficulté mesurée** (simulation, Paladin seul) : petit camp gagné au
  niveau 1 avec 55-69 % des PV ; grand camp mortel au niveau 1, gagné au
  niveau 2 avec l'Épée du débutant (~40 % des PV).
- Règle **validée par Antoine** (2026-11-02) : un camp au calme n'est jamais
  ciblé automatiquement par les unités du joueur.

## 6 quinquies. Inventaire unique, or physique, HUD et contrôles

Depuis le 2026-11-02 (valeurs PROVISOIRES, `DESIGN_DECISIONS.md` G15) :

- **inventaire unique du Héros** (`sim/inventory.ts`, `Entity.hero.inventory`,
  recopié dans la run) : **20 cases** ; bois, pierre et or en **piles de 5**
  (`RESOURCE_ITEMS.maxStack`), un équipement par case ; les items portés
  sont dans les emplacements et ne prennent pas de case. Plus de sac de 6
  ni de sac d'objets de 12. Ajout : piles entamées d'abord (ordre des
  cases), puis cases libres ; sac plein : ramassage **partiel**, le reste
  reste au sol ; un équipement exige une case libre ; rien ne disparaît ;
- **or** : depuis le 2026-11-03, l'or est une **monnaie** (§6 nonies) : un
  tas d'or au sol se ramasse **d'un clic droit, instantanément**, sans
  déplacement, sans sac ni dépôt. (Avant : or physique porté puis déposé à
  la Baliste.) Ennemis : tas à leur mort
  (`ENEMY_GOLD_DROPS`, RNG du monde ; plus de prime versée au stock ; talent
  « Butin de guerre » : +1 par tas). Camp nettoyé : 8 / 15 or en tas de 5
  près du feu. **Exceptions** (versées au stock) : Mine (infrastructure,
  tranche toutes les 60 s), or de départ, bonus de vague repoussée ;
- **dépôt** à la Baliste : **supprimé le 2026-11-03** (§6 undecies) ; les
  équipements restent dans le sac ;
- **stock** : bâtiments, recrutement, améliorations ne lisent que le stock
  (bois, pierre, or) ; jamais le sac ni le sol ;
- **HUD** (layout officiel du 2026-11-02, `ui/hudDefaultLayout.ts`) :
  ligne économique permanente en haut à droite (Bois | Pierre | Or | Pop.
  utilisée / maximum, valeurs **stockées**), seule en haut à droite avec la
  fiche d'une sélection dessous ; **Vague** en haut au centre ; **encart du
  Héros en bas à gauche** juste au-dessus de la barre d'XP (portrait rond
  avec **médaillon du niveau** à cheval sur son bord bas droit, PV, mana) ;
  en bas, bouton **Inventaire** (sac, touche I), **barre des 6 sorts**
  centrée, bouton **Construire**, à 12 px les uns des autres, boutons
  centrés sur la barre des sorts ; **barre d'action globale**
  (`ui/actionProgress.ts`) juste au-dessus des sorts, même largeur,
  absente sans action ; **barre d'XP** presque pleine largeur tout en bas
  (niveau à gauche, progression à droite). Sous 1 200 px de large,
  Inventaire, sorts et Construire s'alignent à 12 px après l'encart du
  Héros au lieu d'être centrés (variante compacte, même ordre). Le panneau
  **Construire** s'ouvre au-dessus du bouton, aligné sur son bord gauche
  (sur son bord droit près du bord de l'écran) : il ne recouvre plus la
  barre des sorts ;
- **disposition du HUD verrouillée** par défaut (2026-11-02) : MAJ ne
  fait rien, ni poignée ni guide. Paramètres > **HUD** > « Disposition du
  HUD » : « **Déverrouiller la disposition du HUD** » (décochée par défaut,
  mémorisée localement) rend disponible l'**outil de calibration**
  (`ui/hudLayout.ts`), inchangé : MAJ maintenue = mode calibration (cadre
  léger, noms des blocs après 0,4 s, poignée de taille, barre d'action
  fantôme, grille optionnelle). MAJ + glisser le fond ou le cadre d'un bloc
  (Héros, Sorts, Action, Inventaire, Construire, Économie, Vague, XP) le
  déplace ; jamais depuis un bouton, un sort ou un item d'un bloc composé.
  Poignée bas droit : échelle uniforme 65–175 % (Héros, Sorts, Inventaire,
  Construire, Économie, Vague), largeur 160–900 et hauteur 8–32 px
  (Action), largeur 200–4000 et hauteur de barre 6–24 px (XP). Pendant le
  glisser : guides du centre de l'écran, alignements sur les bords et
  centres des autres blocs, équidistance entre 3 blocs (« N px = N px »),
  distances au voisin et aux bords, infobulle (X/Y en %, L/H en px,
  échelle) ; aimantation à 8 px, ALT = sans aimantation. Réglage d'un bloc
  sauvegardé en ancre (début, centre, fin par axe) + décalage en px, au
  moins 24 px à l'écran, sauvegarde locale automatique ; un réglage local
  passe avant le layout officiel, bloc par bloc. « Réinitialiser la
  disposition du HUD » revient au **layout officiel** (pas à l'ancien) ;
  « Copier la disposition du HUD » (JSON, même format que le layout
  officiel, position affichée de chaque bloc), « Charger une
  disposition », grille de calibration (10 px). Pas de défilement caméra
  pendant MAJ (déverrouillé) ni pendant le glisser. Valeurs provisoires ;
  compteur FPS seulement en mode debug (`?debug` ou F3) ;
- **fenêtre du personnage** (I) : silhouette (tête, épaules, torse, bras,
  main droite, main gauche = main secondaire ou bouclier, jambes, cape),
  statistiques, sorts, sac en grille 5 × 4 (icône, quantité, cadre de
  rareté), infobulles (ressource : nom, quantité ; équipement : nom,
  rareté, emplacement, type, stats, effet, valeur). Glisser-déposer :
  déplacer, échanger, fusionner les piles ; équiper vers un emplacement
  compatible ; remplacer (l'ancien item revient dans la case d'origine) ;
  retirer vers le sac ; double-clic : équiper / retirer. Emplacements
  torse, bras, jambes : données, stats et interface (pas de visuel, KI-44) ;
  **déplaçable** par le joueur (2026-11-02) : clic maintenu sur son fond
  puis glisser (jamais depuis une case, un item ou un bouton) ; au moins
  80 px à l'écran, en-tête jamais au-dessus du bord haut ; position
  mémorisée localement ;
- **Héros permanent** : sans unité alliée sélectionnée, le clic droit et S
  commandent le Héros, même quand un bâtiment est inspecté (sa fiche reste
  ouverte) ; son anneau reste affiché ; Construire est disponible. Une
  unité militaire sélectionnée explicitement garde la main jusqu'à ce que
  la sélection soit vidée. Portrait : sélectionne le Héros, recentre la
  caméra et reprend le suivi (comme Espace) ;
- **caméra** : défilement par les bords (4 bords, coins), temps réel,
  limites de la caméra ; jamais sur un panneau d'interface, ni avec
  l'inventaire, un menu ou les Paramètres ouverts. Paramètres > Caméra :
  « Vitesse de déplacement de la caméra » (25 à 250 %, sauvegardée) ;
- **Soin** : curseur normal entouré d'un petit cercle jaune pendant que
  le joueur cherche sa cible ; dès la validation, ce cercle disparaît (plus
  de pulse : il dérivait vers la droite) et un **bref flash jaune** de
  l'anneau d'unité, sous la cible, confirme le clic (0,25 s, à la position
  rendue de l'unité, suit une cible qui bouge ;
  `render/spellTargetFeedback.ts`) ; l'incantation prend le relais ;
- **sac 3D** : Paladin à l'échelle visuelle 1,4 (rayon de jeu inchangé) ;
  sac plus gros, attaché à l'os du dos, visible dès que le Héros porte du
  bois, de la pierre ou de l'or ;
- **Éditeur de maps** : ouverture sur une carte vierge 96 × 96 (disque de
  la carte Hero RTS, herbe plate, rien d'autre que la Baliste au centre) ;
  les anciennes cartes restent chargeables.

## 6 sexies. Barils, production, ralliement, réparation

Depuis le 2026-11-02 (valeurs PROVISOIRES, `DESIGN_DECISIONS.md` G16) :

- **barils** (`barrel`, `MapDef.destructibles`) : objets neutres
  destructibles, une case bloquante, 4 PV (le Paladin les casse en deux
  coups), jamais ciblés automatiquement (seulement sur ordre d'attaque),
  ni XP, ni prime, hors du compte de fin de vague. Petit tremblement à
  chaque coup, éclats de bois à la destruction. Visibles une fois la case
  explorée. **Butin** : 30 % de chance d'une ressource au sol (1 ou 2 bois,
  pierre ou or, RNG du monde), sinon rien ; jamais d'équipement. Placés
  dans les camps (2 au petit, 3 au grand) ;
- **Mine 3 × 3** : emprise logique (collision, pose, chantier, sélection,
  pathfinding, destruction) et modèle calé sur l'emprise ; production
  inchangée (tranche toutes les 60 s) ;
- **sortie de production** : une unité produite apparaît DEVANT son
  bâtiment (face +Z du modèle tournée par sa rotation), case la plus proche
  du milieu de la façade ; façade bloquée : deuxième rangée devant, puis les
  côtés ; derrière en dernier recours ;
- **point de ralliement** (`Entity.rally`, simulation) : bouton
  « Ralliement » (petit carré translucide) sous la fiche d'un producteur,
  puis clic sur le terrain ; chaque unité produite sort devant puis y
  marche. Gardé jusqu'à un nouveau point, « Retirer le ralliement » ou la
  destruction du bâtiment. Drapeau au sol et ligne pointillée quand le
  bâtiment est sélectionné, marqueur très discret sinon ;
- **murailles diagonales** : supprimées avec tout le Wall V1 le
  2026-11-02 (remplacé par la Palissade V2, §6 octies) ;
- **réparation** : bouton « Réparer — coût » sur la fiche d'un bâtiment
  allié bâti et endommagé (Baliste comprise). Coût : 50 % du prix de
  construction pour 100 % des PV, proportionnel aux PV manquants (or au
  demi supérieur, bois et pierre arrondis ; Baliste : base 30 or, 10 bois,
  10 pierre), payé d'avance sur le stock. Le Héros va au bâtiment et le
  répare (geste de chantier, barre d'action), 10 s pour 100 %. Ordre
  manuel, mort du Héros ou perte du bâtiment : arrêt, et la part non
  utilisée est rendue (or au dixième, bois et pierre à l'unité
  inférieure) ;
- **défaite** : Baliste détruite = défaite immédiate.

## 6 septies. Niveau d'unité, cartes de survie, sol du village

Depuis le 2026-11-02 (valeurs PROVISOIRES, `DESIGN_DECISIONS.md` G18 à
G20) :

- **niveau d'unité** (`Entity.level`, `data/unitLevels.ts`) : toute
  entité a un niveau entier d'au moins 1 (1 par défaut ; une valeur
  absente, nulle, négative ou invalide retombe à 1). Donnée de
  **difficulté et de présentation** : aucune stat n'en dépend pour
  l'instant (aucun multiplicateur). Origine :
  - Héros : copie de sa progression (XP, niveaux 1 à 100), suit ses montées
    de niveau ;
  - unité du joueur : niveau de production + 1 (améliorations de Forge ;
    niveau 1 sans amélioration), unités produites en temps réel comprises ;
  - ennemi de vague : niveau de renfort de vague + 1 (stats du renfort
    calculées comme avant) ;
  - garde de camp : niveau de son poste (`guardPosts[i].level`), sinon du
    camp (`MapCampDef.level`), sinon 1 ; les deux camps générés sont au
    niveau 1 ;
  - unité placée par une carte (`MapUnitPlacement.level`, « Tester le
    scénario ») : sa valeur, sinon 1 ; l'éditeur la conserve au chargement
    et à la sauvegarde, sans permettre de la modifier ;
  - bâtiments : 1, jamais affiché (leur niveau d'amélioration reste côté
    run).
  Fiche d'inspection : « Maraudeur — Niv. 1 », « Piquier — Niv. 1 », pour
  toute unité (avant : seulement les types améliorables) ; groupe d'un seul
  type et d'un seul niveau : niveau rappelé. Aucun label permanent au-dessus
  des unités ; le Héros garde son médaillon ;
- **cartes de survie dessinées ou générées** : les règles de la Survie Hero
  RTS (formation autour de la Baliste, vagues sur l'anneau qui marchent vers
  elle, brouillard de guerre, pas d'agrandissement E4, cadrage du camp) se
  lisent dans `MapDef.survivalRules: 'hero-rts'` (`usesHeroRtsRules`),
  plus dans l'origine de la carte : `MapDef.generator` ne sert plus qu'à
  la graine et à la nouvelle carte de chaque run. Le générateur écrit ce
  champ et le niveau de chaque camp dans le même format qu'une carte
  dessinée. Aujourd'hui : une seule carte générée (`?map=arena` et
  `?map=island` gardent les règles historiques), aucune sélection de
  carte ; l'éditeur n'écrit ni camps ni `survivalRules` (KI-52) ;
- **sol du village** (`render/settlementGround.ts`) : à la pose d'un
  bâtiment du joueur (chantier compris ; Baliste comprise, dès le
  lancement), le sol est repeint en **terre battue** sous son emprise et sur
  un anneau d'une case autour (coins arrondis) ; un **chemin** de terre
  battue d'une case de large (cases reliées par un côté) relie chaque
  nouveau bâtiment au plus proche des bâtiments déjà posés, s'il est à
  **20 cases** ou moins. Jamais sur l'eau ni hors de la carte (un chemin
  saute les cases d'eau) ; palissades et portes : ni terre battue ni chemin.
  Purement visuel (ni simulation, ni pathfinding, ni `MapDef`). Un bâtiment
  détruit garde sa terre battue jusqu'à la run suivante. Plateau de la
  Survie seulement (ni éditeur, ni « Tester le scénario »). Le sol du
  plateau est désormais découpé en morceaux de 16 × 16 cases
  (`Board.terrain`, comme dans l'éditeur) : une pose ne reconstruit que
  les morceaux touchés (25 à 47 ms mesurés, 2 à 4 morceaux ; KI-53).

## 6 nonies. Or monnaie, Forge et outils, gisements, Maison A/B, Sanctuaire, Écurie

Depuis le 2026-11-03 (valeurs PROVISOIRES) :

- **Or = monnaie** : `RunState.gold`, jamais un objet du sac (le sac ne
  contient que bois et pierre ; aucune case d'or). Affiché sous la grille de
  l'inventaire (« 🪙 N », même valeur que le HUD). Tas d'or au sol (ennemis,
  camps nettoyés, barils) : depuis le 2026-11-03 (fin de journée), **le
  Héros va le ramasser** comme un tas de bois (geste de ramassage), puis
  l'or est crédité (avant : crédit immédiat au clic, sans déplacement).
  Mine inchangée (versement toutes les
  60 s). Toutes les dépenses lisent le même or.
- **Gisement d'or** : gros rocher (« Rocher E ») veiné d'or, 2 × 2,
  **25 or** (`HARVEST_NODE_KINDS.gold`), extrait à la pioche, 1 or / 1,5 s
  **crédité directement** (`World.goldMinedEvents`, `creditMinedGold`),
  jamais porté. Étiquette « Gisement d'or — N or ». Épuisé : gravats, cases
  libérées. Carte procédurale : 6 gisements d'or (anneau 26 à 44 cases du
  centre) et 26 de pierre, chacun avec un bloc 4 × 4 libre autour.
  Éditeur : « Gisement d'or (2×2) » (`ore: 'gold'` sur un `rock`).
- **Gisement de pierre** : nouveau visuel « Rocher E » KayKit (40 pierre,
  inchangé). Les gros gisements **bloquent** déplacement et construction
  (cellules `terrainResource`, `config/resourceNodes.ts`), y compris dans
  l'éditeur.
- **Forge = outils** : une Forge **terminée** donne la Hache de bûcheron et
  la Pioche de mineur à tout le camp (`run/harvestPermissions.ts`).
  Première fois : « Nouveaux outils disponibles : Hache de bûcheron et
  Pioche de mineur. » (une fois par partie). Sans Forge : sélection,
  message et déplacement, aucune extraction. Dernière Forge détruite :
  nouveaux ordres refusés, l'unité en cours est finie, puis arrêt.
- **Scierie et Camp de mineur** : **points de collecte** spécialisés depuis
  le 2026-11-03 (Scierie : bois ; Camp de mineur : pierre et or extrait ;
  §6 undecies). Coûts, emprises, modèles et PV inchangés.
- **Maison A / B** : même bâtiment de jeu, modèle alterné à la pose
  (1re A, 2e B, 3e A…) d'après le nombre de Maisons posées dans la run
  (`RunState.placedBuildingCounts`) ; la variante est stockée sur le
  bâtiment (`OwnedBuilding.modelVariant`) et conservée d'une vague à
  l'autre ; une destruction ne change aucune autre Maison.
- **Sanctuaire** (`blue_shrine`, 2 × 2) : producteur standard (chantier,
  file de 5, ralliement, amélioration Niv. 2 par la file, réparation, terre
  battue). Produit le **Mage** (retiré de l'Église) ; « Parchemins du
  Sanctuaire » ouvre les améliorations de run des parchemins (soin, Nova de
  glace, Ombre ; avant : à l'Église).
- **Église** : soin de l'armée, Oracle et Vengeur (inchangés).
- **Écurie** (`blue_stables`, 3 × 3) : producteur standard ; produit le
  **Cavalier léger** (unité `cavalier` existante, 15 or, 12 s) ;
  amélioration Niv. 2 par la file (+5 PV du bâtiment), qui s'intercale
  entre deux unités (unité → amélioration → unité vérifié).
- **Ralliement** : proposé à tout bâtiment qui produit des unités par sa
  file (Église et Sanctuaire compris), plus seulement aux producteurs
  legacy.
- **Auberge** (`blue_tavern`, 2 × 2, 15 or + 8 bois, 20 PV, 8 s) :
  producteur standard du **Villageois** (5 or, 8 s).
- **Villageois** (première unité économique) : humain fragile (2,5 PV),
  **aucune attaque** (dégâts 0, aucune acquisition de cible ; ciblable et
  tuable), vitesse 2,2, population 1 ; ni XP, ni mana, ni équipement.
  Modèle dédié `human_villager` (2026-11-03, Atelier d'Antoine : tête WK A,
  corps barbare D, bras et jambes WK A, ni épaulière ni arme, clips
  Spearman) : **mains vides** au repos et en marche ; **hache** en main
  pendant la coupe, **pioche** pendant le minage (pierre, or), retirées dès
  la fin du travail ; l'estoc du set sert de coup de hache / de pioche ;
  ramassage d'un tas et dépôt sur la pose de repos (aucun geste dédié,
  KI-64). Se sélectionne et se commande comme une unité. **Clic droit**
  sur un arbre, un gisement de pierre ou d'or : récolte (même permission
  que le Héros : Forge terminée) ; sur un tas de bois / pierre :
  ramassage ; sur un point de collecte qui accepte ce qu'il porte : dépôt.
  Cargo de **5** (§6 undecies) : plein → dépôt automatique au point de
  collecte le plus proche (Scierie pour le bois, Camp de mineur pour la
  pierre et l'or, Baliste sinon) → retour à la source. Source
  épuisée : dépôt du cargo, puis la source voisine du même type à 6 cases,
  sinon Garde. Outil perdu : l'unité en cours est finie, dépôt, Garde.
  Fiche : « Transport : 3 / 5 — Pierre 3 ».

## 6 decies. Tourbillon du Paladin (prototype)

Depuis le 2026-11-03 (valeurs PROVISOIRES, `DESIGN_DECISIONS.md` G29) :

- **Case 2** de la barre des sorts (icône provisoire dessinée par code) ;
  un clic (ou la touche 2) le lance **sur le Héros**, sans ciblage.
- **15 mana**, retirés une fois au lancement, jamais rendus ; refus si le
  mana est insuffisant.
- **Recharge de 15 s** (demande d'Antoine) qui commence quand l'effet
  **s'arrête** (5e frappe ou mort du Héros), jamais au lancement ; elle
  court aussi pendant la résurrection. Case grisée avec les secondes
  restantes au centre, infobulle « Recharge : N s ».
- **5 s**, **5 frappes** à 1, 2, 3, 4 et 5 s après le lancement (pas fixe de
  la simulation), puis fin. Chaque frappe touche **une fois** chaque
  hostile vivant dont le corps est à **2,25 cases** (ni le Héros, ni les
  alliés, ni les barils, ni un bâtiment non ciblable), pour **75 % des
  dégâts d'attaque finaux figés au lancement** (niveau et équipement ; un
  changement d'équipement pendant l'effet ne change rien), par
  `applyDamageToEntity` (morts et XP comme d'habitude).
- Pendant l'effet : le Héros **peut se déplacer** (un clic droit ne coupe
  pas l'effet, qui suit le Héros) ; **pas** d'attaque de base, de Soin,
  d'autre sort, de récolte, de construction, de réparation, de ramassage
  (« Tourbillon en cours »). À la fin : contrôles normaux (l'attaque de
  base peut reprendre dès le pas de la dernière frappe).
- **Mort** du Héros : arrêt immédiat, aucune frappe ensuite, aucun effet
  visuel pendant la résurrection.
- Rendu : le modèle tourne sur lui-même à **5 tours/s** (2,5 avant ;
  rotation **visuelle** seulement : orientation logique, déplacement et
  emprises inchangés ; orientation normale dès la fin) ; **effet
  circulaire** : deux arcs de taille lumineux (lame et traînée) à hauteur
  d'arme qui tournent avec le modèle, cercle de la zone de frappe
  (2,25 cases) au sol qui palpite ; anneau de poussière, traits de vent,
  onde brève à chaque frappe (`render/whirlwindVfx.ts`, provisoire). Ligne « Tourbillon » sous la barre de mana et barre d'action
  globale (temps restant).

## 6 undecies. Cargo économique : inventaire RPG ≠ sac de ressources

Depuis le 2026-11-03 (demande d'Antoine, `DESIGN_DECISIONS.md` G32 ; remplace
le « stock direct » G30 du même jour) :

- **Deux sacs distincts.** L'**inventaire RPG** du Héros (20 cases) ne
  contient que des équipements et du butin : aucun bois, aucune pierre,
  aucun or n'y apparaît jamais. Le **sac de ressources** (cargo,
  `Entity.cargo` : `wood`, `stone`, `minedGold`, `capacity`) transporte les
  ressources économiques ; capacité **totale** PROVISOIRE : **Héros 10**,
  **Villageois 5** (6 bois + 3 pierre + 1 or = plein).
- **Or de gisement ≠ or de butin.** L'or **extrait d'un gisement** est une
  ressource transportée (`minedGold`) : il ne devient de la monnaie qu'au
  dépôt. L'or de **butin** (monstres, coffres, barils, récompenses) reste une
  monnaie créditée dès qu'il est récupéré : le Héros va le ramasser (geste
  0,6 s), puis « +N or » ; il ne passe jamais dans le cargo.
- **Récolte** (arbre : hache ; gisement de pierre ou d'or : pioche, Forge
  terminée) : chaque unité (1 / 1,5 s) entre dans le cargo, le **stock et le
  HUD ne bougent pas**. Cargo plein → **dépôt automatique** au point de
  collecte allié le plus proche qui accepte la ressource la **plus portée**
  (à défaut la suivante) → retour à la source → reprise. Un ordre manuel
  pendant le trajet annule la boucle (le cargo est gardé).
- **Petits tas** de bois / pierre : clic droit → déplacement, geste 0,6 s,
  autant que le cargo peut prendre ; le reste attend au sol, dépôt, retour
  au tas, fin du tas.
- **Points de collecte** (`BuildingDef.dropOff`, liste des ressources
  acceptées par un bâtiment **terminé et allié** ; un chantier ne compte
  pas ; jamais le butin RPG), depuis le 2026-11-03 soir (G33) :
  - **Baliste** : bois, pierre, or extrait (point **universel de départ**,
    conservé quand on construit les autres ; son maintien dans ce rôle
    reste à décider) ;
  - **Scierie** : **bois** seulement ;
  - **Camp de mineur** : **pierre** et **or extrait** seulement ;
  - la **Forge** n'en est pas un (elle donne les outils).
  Aucune règle par bâtiment dans la simulation : seule la liste `dropOff`
  compte. Fiche du bâtiment : « Point de collecte : Bois » / « Pierre, Or »
  / « Toutes ressources ».
- **Dépôt** : automatique (sac plein, source épuisée, outil perdu) ou
  **manuel** (clic droit sur un point de collecte qui accepte au moins une
  ressource portée ; « Rien à déposer » à cargo vide ; « Aucune ressource
  acceptée — Scierie : bois » quand il n'accepte rien de ce qu'on porte :
  rien n'est jamais vidé en silence) ; une unité / 0,5 s ; le stock (HUD)
  monte à chaque unité ; « Dépôt terminé — stock : … » à la fin ; retour à
  la tâche en cours s'il y en avait une.
- **Cargo mixte** (ex. 4 bois, 3 pierre, 2 or) : un point ne prend que ce
  qu'il accepte, le reste demeure dans le cargo. Dépôt **manuel** : ce
  point seulement (Scierie → les 4 bois, puis Garde). Dépôt
  **automatique** : après un dépôt partiel, l'unité enchaîne sur le prochain
  point acceptant ce qui reste (Scierie → Camp de mineur), jusqu'à cargo
  vide ou aucune destination, puis retourne à sa source ; une ressource
  sans point reste dans le cargo sans bloquer la boucle (pas d'arrêt à
  9 / 10).
- **Aucun point valide** pour ce qu'elle porte : l'unité garde son cargo,
  s'arrête pleine, rien n'est perdu (« Aucun point de collecte pour
  déposer : 10 pierre ») ; un point détruit en chemin → le suivant pour
  ces ressources (Scierie détruite → Baliste), sinon Garde.
- **Mort** avec un cargo : ressources **perdues** (message), aucun sac au
  sol ; le Héros revient à cargo vide. PROVISOIRE.
- **Affichage** : sac 3D sur le dos dès qu'une ressource est transportée
  (Héros et Villageois) ; fenêtre du Héros : « Ressources transportées :
  7 / 10 — Bois 4 · Pierre 2 · Or 1 » sous la grille ; fiche du Héros,
  ligne « Ressources transportées » ; fiche du Villageois, ligne
  « Transport ».
- **Réparation de la Baliste** (correctif du 2026-11-03) : sa fiche propose
  « Réparer » quand elle est endommagée ; coût : 50 % de 30 or, 10 bois,
  10 pierre, au prorata des PV manquants.

## 6 octies. Palissade V2 (murs géométriques)

Depuis le 2026-11-02 (valeurs PROVISOIRES, `DESIGN_DECISIONS.md` G23). Le
Wall V1 (muraille et porte KayKit case par case, virages, diagonales, tracé
sur grille) est supprimé ; ses anciens murs ne sont jamais convertis.

- **Familles** (`data/walls.ts`, `WALL_TYPES`) : une seule aujourd'hui, la
  **Palissade** en bois. Pièces : `palisade` (segment) et `palisade_gate`
  (porte), bâtiments de `data/buildings.ts` (`BuildingDef.wallPiece`).
- **Pose en jeu** (menu **Construire**, Héros sélectionné) : « Palissade »,
  puis clic gauche au point **A** (aimanté à moins de 0,6 case d'une
  extrémité ou d'un flanc de palissade existante), aperçu de toute la ligne
  **A → curseur** (segments réels, vert ou rouge, indication « L cases — N
  bois », « jonction », raison d'un refus), second clic au point **B**. Tout
  angle, sans grille ni directions cardinales. Le mode reste actif pour une
  nouvelle ligne ; clic droit / Échap annulent le point A, puis quittent le
  mode.
- **Segmentation interne** (`core/wallLine.ts`, `segmentWallLine`) :
  n = max(1, ⌊L / 2⌋) segments égaux (2 à 4 cases ; une ligne de moins de
  2 cases = un segment). Chaque segment est une entité (PV, chantier,
  destruction, réparation) ; le joueur voit une ligne continue.
- **Coût** : 0,5 bois par case de longueur (longueur au dixième, arrondi
  au-dessus sur la ligne entière), prélevé sur le **stock déposé**
  uniquement (jamais le sac). Porte : 4 bois. Aucun or.
- **Chantiers** : chaque segment est un chantier (25 % des PV, 1,5 s par
  case) ; le Héros reçoit l'ordre de bâtir le segment de A, puis enchaîne
  sur le segment suivant de la même ligne (A → B), puis sur le chantier
  voisin. Un chantier bloque déjà le passage (sans fumée de dégâts).
- **PV** : 15 PV par case (segment nominal de 2 cases : 30 PV) ; porte :
  20 PV par case. Ne compte pas pour la défaite.
- **Collision** (`ObstacleDef.line`, capsule de demi-épaisseur 0,15) :
  vrai obstacle terrestre pour tous (Héros, infanterie, Cavalier, ennemis,
  vagues), à tout angle ; deux segments voisins partagent leur extrémité,
  la barrière est continue aux jonctions et aux angles. Les **tirs
  passent** par-dessus (`blocksShots: false`). Grille A* : cases couvertes
  par la ligne et son épaisseur ; une unité collée au mur repart du bon
  côté ; un passage plus étroit que l'unité entre deux murs est contourné.
- **Portée** : une pièce de mur se frappe sur toute sa longueur (distance
  à sa ligne, `targetDistance`) ; on la poursuit vers le point du mur le
  plus proche, de son côté.
- **Brèche** : un segment détruit disparaît seul (effondrement), son
  emprise est retirée, le passage et le pathfinding s'ouvrent aussitôt
  (une brèche de 2 cases laisse passer un Cavalier).
- **Vagues** : elles marchent sur le camp en ignorant les murs, butent sur
  la palissade ou une porte (même ouverte), les ciblent, ouvrent une brèche
  et entrent.
- **Porte** : « Porte de palissade » au menu (une palissade doit exister),
  puis clic sur un segment : il est remplacé par une porte de même
  géométrie, en chantier. Porte bâtie : **fermée** (bloque tout le monde,
  comme le mur) ; fiche « **Ouvrir la porte** » / « **Fermer la porte** ».
  **Ouverte** : passage pour son **propriétaire et ses alliés** seulement ;
  elle reste un obstacle pour les **hostiles** (vagues comprises), qui la
  contournent si une route existe, sinon l'attaquent comme la palissade
  (`sim/relations.ts`, `canUnitPassGate`). Un ennemi peut donc être bloqué
  par une porte visuellement ouverte (prototype). Détruite : vraie brèche,
  tout le monde passe. Fermeture demandée avec un allié dans l'ouverture :
  elle **attend** (« Fermeture en attente — passage occupé ») et se fait au
  premier pas libre, sans écraser ni pousser personne ; un hostile plaqué
  contre la porte ne la retient pas. Ni ouverture ni fermeture
  automatiques. Battants animés (0,35 s).
- **Refus de pose** : moins d'une case ou plus de 30, hors carte, eau,
  falaise, arbre debout, gros gisement de pierre, structure bloquante, à
  moins de 0,15 case d'un bâtiment ou chantier (Baliste comprise), corps
  d'une unité sur le tracé, **croisement** franc d'une palissade,
  **chevauchement** (ligne trop proche d'une autre ailleurs qu'à une
  jonction). Jonctions acceptées : bout à bout, en T, prolongement (angle
  d'au moins ~18°). Les bâtiments ne se posent pas sur une palissade.
- **Réparation** : bouton « Réparer » générique (50 % du prix du segment ou
  de la porte pour 100 % des PV).
- **Rendu** (`render/palisade.ts`, procédural) : pieux taillés en pointe
  (hauteurs légèrement variées), deux traverses côté intérieur, poteau plus
  massif à chaque extrémité (partagé aux jonctions) ; porte à deux battants
  de planches, linteau. Un mesh par segment (trois par porte).
- **Carte** : `MapDef.walls` enregistre chaque ligne de façon géométrique
  (famille, A, B, camp, rangs des portes) ; la segmentation est
  reconstruite au chargement. Posées bâties (portes fermées) en Survie et
  dans « Tester le scénario ».
- **Anciennes cartes** : les pièces du Wall V1 (`wall`, `wall_gate`,
  `wall_half`, virages) sont retirées au chargement avec le journal
  « [map] anciens murs ignorés : système de muraille V1 supprimé » ; la
  carte se charge normalement.
- **Préparation (legacy)** : aucun mur.

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
  bâtiments, chantiers, palissades et unités. `SURVIVAL_ARENA_MAP` est la carte complète ;
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
  Forge, Tour, Église) et la Baliste exigent une emprise plate à un seul
  niveau (ni pente, ni falaise sous l'emprise) ; une palissade suit le
  relief (chaque pieu au niveau du sol) mais ne franchit jamais une falaise. Les unités se posent sur n'importe
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
  recrutées par le joueur. **Vagues** (2026-11-02) : chaque rôle de la
  composition est joué par le barbare de même rôle (Fantassin → Maraudeur,
  Archer → Traqueur, Mage → Féticheur, Sentinelle → Colosse,
  `WAVE_UNIT_BY_ROLE`) ; renfort de vague, niveau, or et butin restent ceux
  du rôle (équilibrage des vagues inchangé : un Maraudeur de vague ne lâche
  pas d'objet, un Féticheur de vague lâche l'or d'un Mage).
- **roster humain en Toon RTS par défaut** (2026-11-02) : Homme d'armes
  (`human_footman.glb`), Archer, Mage, Sentinelle, comme le Piquier, le
  Vengeur, l'Oracle, le Cavalier et le Héros. Les anciens modèles (Footman
  V2 / V1, Archer, Mage et Sentinelle Meshy) ne sont plus que des replis si
  un fichier Toon manque.
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
  - pose refusée sur l'eau : unités et bâtiments en préparation
    (`isValidPlacementTile`), palissades (`checkWallLine`), et dans
    l'éditeur unités, bâtiments, palissades, Baliste ; l'éditeur ne peint jamais d'eau sous une unité, un
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
`EDITOR.md`. **2026-11-03** (`EDITOR.md` §1 bis) : **Générer** une carte
procédurale (vrai générateur de la Survie, champ Graine, Nouvelle graine,
panneau d'informations), **Vue globale**, camps / petits tas / barils
affichés, sélectionnables, supprimables et enregistrés (tas et barils
posables), `survivalRules` et `generator` conservés ; le chargement garde
désormais camps, tas, barils, règles et graine ; « Tester le scénario »
crée les camps et les barils de la carte (avant : ignorés). 2026-11-01 (suite) : section **Neutres** du bestiaire (cinq
unités posables, toujours du camp Neutre), outils **Monter une case**,
**Descendre une case** et **Pente** restaurés, murailles d'une case (Wall V1,
supprimé le 2026-11-02).
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

## 16 ter. Éditeur d'items

Outil interne (2026-11-02, `src/itemEditor`), bouton « Éditeur d'items »
du menu principal, écran distinct de l'Atelier et de l'éditeur de maps :

- champs : partir d'un item du catalogue, nom, identifiant, description,
  rareté, type, emplacement (le type et une pièce plausible suivent),
  valeur de vente, source, pièce (objets tenus ou pièces de corps de
  l'emplacement), échelle, rotation et décalage (objets tenus), six stats,
  feu à chaque coup ;
- aperçu : le Paladin (preset `human_hero` du catalogue) porte l'item, dans
  la scène de l'Atelier ; carte de l'item (nom et cadre à la couleur de la
  rareté, lignes de stats, valeur) ;
- **Copier la config**, **Exporter JSON** (`<id>.json`), **Charger config**
  (texte collé, validé : valeurs inconnues remplacées par défaut, texte
  illisible refusé avec un message). Format : `{ "<id>": <item> }`, celui de
  `EQUIPMENT` (data/equipment.ts), prêt à y être collé.

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
- **Touche X** (mode debug seulement : `?debug` ou F3, 2026-11-02) :
  bascule la vitesse de jeu entre ×1 et ×2. Plus aucune aide « X — Vitesse
  fois 2 » à l'écran, ni dans le HUD joueur ni en mode debug ; la vitesse
  courante se lit dans le détail du compteur FPS.
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
