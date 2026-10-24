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
17. Audio
18. Outils de debug présents
19. Absent ou retiré

---

## 1. Résumé

Roguelite tactique web en vue 3/4. Le mode jouable, le **Mode survie**, se
joue sur une arène fixe : le joueur place son armée et ses bâtiments, puis
la bataille se déroule automatiquement. Il intervient avec la Baliste et
des parchemins de bataille.

- L'**Or** est la seule monnaie de la run. Il sert à recruter des unités,
  acheter des parchemins, construire des bâtiments et acheter des
  améliorations : à la **Forge**, ou sur la fiche d'une Mine ou d'une
  Caserne.
- La run continue tant que le joueur gagne ; elle s'arrête à la première
  défaite.
- Seuls les talents et la progression générale (record, ennemis vaincus…)
  sont conservés entre les runs. Les améliorations sont propres à la run.
  Il n'y a plus de Runes.

## 2. Déroulé d'une run

Fonctions concernées dans `main.ts` : `startNewRun`, `startPlacement`,
`onValidatePlacement`, fin de bataille dans la boucle de jeu.

1. **Nouvelle run** (menu → **Mode survie**, `createNewRun`) :
   - armée de départ : **4 Fantassins** de niveau 1
     (`STARTING_FANTASSIN_COUNT`), présents même sans Caserne ;
   - or de départ : **20** (`STARTING_GOLD`), 25 avec le talent Or de départ
     (+5, `TALENT_STARTING_GOLD_BONUS`) ;
   - population : **4 / 5** (base `PLAYER_BASE_POPULATION` = 5, voir
     ci-dessous) ;
   - inventaire et bâtiments vides, aucune amélioration (`upgrades = {}`),
     vague 1.

   **Début de run** : 20 or, 4 Fantassins, Pop. 4 / 5, aucun bâtiment.
   Une seule place est libre : une Maison (5 or, +2 population) est le
   premier levier. Recruter exige un bâtiment (§4) : Fantassin → Caserne,
   Archer → Camp d'archerie, Mage → Église. Maison + Caserne ou Maison +
   Camp d'archerie tiennent dans les 20 or ; Caserne + Camp d'archerie
   (30 or) non.

   **Population** (`data/population.ts`, `run/population.ts`) : maximum
   5 + 2 par Maison possédée (5, 7, 9, 11…) ; en bataille, par Maison
   vivante ; chaque
   unité en occupe `populationCost` (Fantassin et Archer 1, Mage 3,
   Sentinelle 5). Affichée par le HUD « Pop. N / M » et dans la boutique.
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
  Fantassin, Archer, Mage, Sentinelle ; aucune ligne à 0 ;
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
  - **Fantassin, Archer, Sentinelle** : dégâts, portée (« Mêlée » ou en
    cases), cadence, vitesse, et l'esquive quand elle est non nulle. Ni rayon,
    ni aggro, ni chance de rater ;
  - **Mage** : PV et vitesse, puis la section **Attaque — Boule de feu**,
    son attaque affichée : dégâts (amélioration comprise), portée 2–6 cases,
    recharge. Son coup de repli au contact n'est pas affiché ;
  - **Sentinelle** : section **Provocation** : recharge, rayon, bouclier
    par ennemi provoqué (amélioration comprise) ;
  - en bataille, chaque capacité indique son état (Prête, Recharge x.x s,
    Incantation, « Dans x.x s » pendant le verrou initial de la
    Provocation), et un bouclier actif s'affiche sous la barre de PV ;
  - **Mine** : PV, production (« 3 à 7 or »), fréquence (« toutes les 5 s »)
    et emprise. En préparation, aussi l'effet du niveau suivant et le bouton
    **« Améliorer la mine — N or »** (§6) ;
  - **Caserne / Camp d'archerie** : « Nom — Niv. N », PV, production
    (« 1 Fantassin par manche »), recrutement débloqué (« Recrutement de
    Fantassins », « Recrutement d'Archers ») et emprise. En préparation, au
    Niv. 1, aussi l'effet du Niv. 2 (« 2 Fantassins par manche ») et le
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
    recrutement débloqué (« Recrutement de Mages ») et emprise. En préparation, aussi les PV manquants de l'armée, l'effet du
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
- **Emplacement** : en haut à gauche (`left: 12px; top: 12px`), 354 px de
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

Quatre unités existent, communes au joueur et à l'ennemi.

| Unité | Coût de base | PV | Dégâts | Portée / aggro | Cadence | Raté |
|---|---|---|---|---|---|---|
| Fantassin | 2 | 5 | 1 | 0,95 / 9 | 1,0 s | 12 % |
| Archer | 3 | 3 | 1,2 | 6 / 10 | 2,0 s | 5 % |
| Mage | 10 | 5 | 1 (mêlée de repli) | 0,95 / 10 | 2,0 s | 30 % |
| Sentinelle | 40 | 50 | 1 | 0,95 / 9 | 1,5 s | 12 % |

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
- **Valeur au kill et à la revente** (`KILL_REWARD`) : Fantassin 1, Archer
  1,5, Mage 5, Sentinelle 20.
- Le coût payé en partie est le coût de base **plus le surcoût du niveau
  de production courant** de l'unité (§14) : Fantassin et Archer +1 or,
  Mage +3, Sentinelle +10 par niveau. La boutique affiche ce coût, le niveau
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

- **Muraille** (segment droit) et **Porte de muraille** : 50 PV, emprise
  2 × 1 à l'échelle native du modèle, coût **provisoire** 1 or par segment.
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
    (clic de A à B = toutes les cases de A à B). Un tronçon droit est fait de
    segments 2 × 1 et, s'il a un nombre impair de cases, d'un **demi-segment**
    d'une case (`wall_half`), placé de préférence à une extrémité ouverte,
    sinon contre un virage. Un second clic sur la case de départ pose une
    muraille d'une case.
  - **Cases en attente** (contour sans modèle) pendant le tracé : l'ancre
    (virage ou prolongement droit, décidé au clic suivant), le point de
    départ (virage à la fermeture) et au plus une case de leur tronçon. Elles
    sont payées avec leur portion.
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
  - **Coût** (provisoire, inchangé : 1 or le segment 2 × 1) : ½ or par case
    droite (segment, demi-segment ou case en attente), 1 or par virage
    (compté comme un segment). La finalisation d'un tracé ouvert ne coûte
    rien de plus ; un re-découpage d'un tronçon n'est jamais facturé deux
    fois. Un virage a 50 PV (pièce complète), un demi-segment 25 PV (même
    densité qu'un segment : 25 PV par case) ; tous deux bloquent les deux
    camps, laissent passer les tirs ; emprise 1 × 1.
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
| Effet | Produit de l'or pendant la bataille (voir ci-dessous) | Débloque le recrutement des Fantassins et en produit (voir ci-dessous) | Débloque le recrutement des Archers et en produit (voir ci-dessous) | +2 population maximale (§2) | Accès aux améliorations de production des unités et de la Baliste (§14) ; aucun effet passif | Tire des flèches sur les unités ennemies (voir ci-dessous) | Soigne l'armée contre de l'or ; débloque le recrutement du Mage (§4) ; accès aux améliorations des parchemins et de Soins excédentaires (voir ci-dessous et §14) |

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

Production de la Mine :

- toutes les **5 s** de bataille, chaque Mine vivante produit un montant
  entier tiré dans la tranche de son niveau : 3 à 7 or au niveau 1, puis
  +2 / +2 par niveau (5 à 9, 7 à 11…) ;
- le tirage est pseudo-aléatoire et déterministe (générateur à graine,
  re-semé depuis la graine de la bataille) ;
- « +N or » s'affiche au-dessus de la Mine ;
- **5 productions au plus par Mine et par manche** (`maxProductionsPerWave`,
  `data/mineUpgrade.ts`) : chaque Mine a son propre compteur, remis à 0 à
  chaque bataille ; une fois à 5, elle ne produit plus jusqu'à la manche
  suivante. Sa fiche indique « Par manche : 5 productions au plus » en
  préparation, « Productions : N / 5 » en bataille ;
- la minuterie est **en pause** quand aucun ennemi n'est en vie alors que
  des renforts sont attendus (temps mort entre deux groupes, §10) ; elle
  reprend dès l'arrivée du groupe ;
- jamais dans « Tester le scénario » ; une Mine détruite s'arrête aussitôt.

Production de la Caserne (Fantassins) et du Camp d'archerie (Archers) :

- **Une fois par manche** : au début de chaque bataille, chaque bâtiment
  reçoit un quota de **1 unité au Niv. 1, 2 au Niv. 2**, produit
  gratuitement dès que possible. Aucun minuteur, aucune production répétée
  pendant la bataille. Chaque bâtiment produit son propre quota.
- **Population** : le quota est limité aux places libres ; ce qui manque
  attend et réessaie pendant la bataille (une mort libère une place). Un
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
  du Mage (§4).
- Une Église détruite disparaît de la run comme les autres bâtiments.

La Forge (modèle `blue_blacksmith`) est un vrai bâtiment : ciblable,
destructible, collidable. Elle n'a ni production ni revenu ; toutes les
Forges ouvrent la **même** boutique d'améliorations, sans bonus par
exemplaire. Elle n'améliore plus la Mine ni la Caserne. Si toutes les Forges sont détruites, les améliorations déjà
achetées restent actives, mais aucun nouvel achat n'est possible tant
qu'une Forge n'est pas reconstruite.

## 7. Économie d'or

Sources : `run/runState.ts`, `run/talentEffects.ts`, `run/runUpgrades.ts`,
`main.ts`.

L'Or est la **seule monnaie** de la run. Il sert à recruter des unités,
acheter des parchemins, construire des bâtiments et acheter des
améliorations (Forge §14, Mine et Caserne §6).

Gains :

- or de départ (§2) ;
- **kill ennemi** : `KILL_REWARD`, versé en temps réel ; +1 avec Butin de
  guerre ;
- **Mines** : une production toutes les 5 s pendant la bataille, 5 au plus
  par Mine et par manche (§6) ;
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
  arrivent toutes les `clamp(5,5 − 1,2 × ln G, 0,9 ; 4,5)` secondes,
  arrondies en ticks (30 Hz) : 4,5 s pour 2 groupes, 3,35 s pour 6, 2,86 s
  pour 9, 1,74 s pour 23. Un groupe **n'attend pas** la mort du précédent
  (chevauchement).
- **Terrain vide** : après **1 s** sans aucun ennemi vivant, le groupe
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

**Arène du Mode survie**

- Carte officielle (« MapV2 », fournie par Antoine depuis l'éditeur) :
  21 × 36 cases, dont 64 trous (le champ de bataille central est plus
  étroit que les bases), 100 décors (24 arbres et 7 rochers bloquants, 69
  props traversables). `SURVIVAL_ARENA_MAP` est la carte complète ;
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

**Territoire**

- Chaque case appartient au joueur, à l'ennemi, ou à personne (neutre).
- En préparation, le **territoire joueur** est la zone de placement : unités
  et bâtiments (toute l'emprise) doivent y être.
- Arène : territoire dessiné, 152 cases par camp. Zone joueur : rangées
  z 9 à 16, colonnes x −9 à 9 ; zone ennemie symétrique (z −17 à −10). Une
  bordure neutre d'une case entoure chaque zone.
- Une carte sans territoire utilise le **repli historique** : deux bandes de
  7 rangées à l'arrière de chaque camp, le centre neutre.
- **Affichage** : les zones bleue et rouge sont ce même territoire, case par
  case (une case neutre n'a pas de zone). Elles restent visibles en
  préparation, en bataille et pendant la transition de victoire, avec le
  même filtre discret. Elles disparaissent au retour au menu ; « Tester le
  scénario » ne les affiche pas.

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

**Non persistant** : toute la run en cours (or, armée, inventaire, bâtiments
et leurs niveaux, améliorations de Forge, vague, état de la carte).
Quitter ou recharger la page la fait perdre.

Une ancienne sauvegarde contenant des Runes (`upgradeRunes`) ou des niveaux
d'amélioration permanents (`unitUpgrades`) se charge normalement : ces clés
sont ignorées, puis disparaissent à la sauvegarde suivante.

**« Effacer la sauvegarde »** (menu principal) remet toute la
méta-progression à zéro, après confirmation. Les réglages sont conservés.

## 16. Éditeur de maps

Accessible depuis le menu principal ; le détail d'usage est dans
`EDITOR.md`. Une run ne charge aucune carte enregistrée depuis l'éditeur :
ces cartes servent à « Tester le scénario ». L'arène du Mode survie est une
carte exportée de l'éditeur puis intégrée au code (§11).

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
  - pas de Cavalier ni de Chevalier ;
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
