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
6. Bâtiments gameplay : Mine, Caserne et Forge
7. Économie d'or
8. Boutique de run
9. Inventaire et parchemins de bataille
10. Vagues ennemies
11. Territoire et expansion de la carte
12. Talents
13. Méta-progression : points de talent
14. Améliorations de Forge
15. Sauvegarde : ce qui persiste
16. Éditeur de maps
17. Audio
18. Outils de debug présents
19. Absent ou retiré

---

## 1. Résumé

Roguelite tactique web en vue 3/4. Le joueur pose sa tour, place son armée,
puis la bataille se déroule automatiquement. Il intervient avec la Baliste et
des parchemins de bataille.

- L'**Or** est la seule monnaie de la run. Il sert à recruter des unités,
  acheter des parchemins, construire des bâtiments et acheter des
  améliorations à la **Forge**.
- La run continue tant que le joueur gagne ; elle s'arrête à la première
  défaite.
- Seuls les talents et la progression générale (record, ennemis vaincus…)
  sont conservés entre les runs. Les améliorations de Forge sont propres à
  la run. Il n'y a plus de Runes.

## 2. Déroulé d'une run

Fonctions concernées dans `main.ts` : `startNewRun`, `beginTowerPlacement`,
`startPlacement`, `onValidatePlacement`, fin de bataille dans la boucle de jeu.

1. **Nouvelle run** (menu → Jouer, `createNewRun`) :
   - armée de départ : 1 Fantassin ;
   - or de départ : 15 (`STARTING_GOLD`), 20 avec le talent Or de départ
     (+5, `TALENT_STARTING_GOLD_BONUS`) ;
   - inventaire et bâtiments vides, aucune amélioration (`upgrades = {}`),
     vague 1.
2. **Placement obligatoire de la tour**. Une bannière demande de placer la
   tour (« Placez votre tour dans votre zone de spawn. »). Son empreinte de
   3×3 cases doit être entièrement en territoire joueur (§11). Échap est
   sans effet tant que la tour n'est pas posée. La tour est validée au
   **relâchement** du clic gauche, sur le plateau : si un clic droit
   s'ajoute avant le relâchement (geste clic gauche + clic droit pour
   déplacer la caméra), rien n'est posé.
3. **Phase de placement**. La boutique s'ouvre automatiquement. Le joueur
   peut :
   - déplacer, sélectionner et vendre ses unités ;
   - acheter, poser et déplacer des bâtiments ;
   - ouvrir une Forge possédée pour acheter des améliorations (§14) ;
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
     prioritaire. Les ennemis ne sont pas inspectables ;
   - chaque unité sélectionnée porte l'**anneau de sélection commun**,
     identique en préparation et dans l'éditeur. Sa couleur est celle du
     camp de l'unité (bleu pour le joueur, rouge pour l'ennemi), pas une
     couleur de validation. La cible d'un ordre d'attaque a son propre
     anneau rouge ;
   - **clic droit** : ordre aux unités sélectionnées (attaque si un ennemi
     est sous le curseur, sinon déplacement de groupe) ;
   - **S** : Stop, les unités sélectionnées passent en Garde ;
   - **Q** : tir de la Baliste (voir §5) ;
   - caméra : Maj + clic droit pour pivoter, clic gauche + clic droit pour
     déplacer, molette pour zoomer (détail dans `EDITOR.md`, §13).
5. **Fin de bataille**, dès qu'un camp n'a plus de combattant (unités et
   bâtiments du joueur comptent tous les deux) :
   - **Victoire** : bonus d'or, étape d'expansion de la carte, écran de fin
     de vague, puis placement de la vague suivante.
   - **Défaite** : écran « Partie terminée », puis retour au menu.
6. **Abandon** (Échap → Quitter → confirmation) : retour au menu. Les gains de
   méta-progression déjà obtenus pendant la run restent acquis (ils sont
   sauvegardés au fil des batailles), mais **aucune récompense supplémentaire
   n'est accordée à l'abandon**.

### Fiche d'entité

Sources : `run/entityInfo.ts`, `ui/entityInfoPanel.ts`, `main.ts`
(`currentEntityInfo`, `updateEntityInfoPanel`).

Une fiche compacte décrit ce que le joueur a sélectionné, en préparation et
en bataille. Elle n'existe pas dans l'éditeur.

- **Sélections prises en charge** :
  - préparation : unité seule, groupe, Mine, Caserne, Forge, Baliste ;
  - bataille : unité alliée seule, groupe allié, Mine, Caserne, Forge,
    Baliste (bâtiments inspectés, voir ci-dessus).
- **Valeurs** : ce sont celles réellement utilisées par le jeu, à l'**échelle
  du joueur** (PV et dégâts divisés par 10, comme les barres de vie), jamais
  les valeurs internes ×10. En préparation, elles sont recalculées avec les
  mêmes fonctions que l'apparition en bataille. En bataille, elles sont lues
  sur l'entité.
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
  - **Mine** : PV et revenu par seconde (amélioration comprise) ;
  - **Caserne** : PV, unité produite, intervalle, unités par production. En
    bataille, aussi la prochaine production, ou « En attente » quand le lot
    attend des cases libres ;
  - **Forge** : PV seulement. En préparation, la fiche porte le bouton
    **« Ouvrir la Forge »** (§14) ; en bataille, aucun bouton ;
  - **Baliste** : PV, dégâts par carreau, recharge, carreaux par volée.
    Aucune portée, le tir n'en a pas. En préparation : PV max / max et
    « Prête pour la bataille ». En bataille : PV de l'entité et état
    dynamique `PRÊTE`, `RECHARGE x.x s`, `EN VOL` ou `DÉTRUITE`, issu de la
    même source que le HUD de la Baliste ;
  - **Groupe** : nombre d'unités, composition par classe (« 3 Fantassins »),
    PV cumulés actuels / max et nombre de blessées. Aucune moyenne de
    dégâts, de portée ou de vitesse. En bataille, seules les unités vivantes
    encore sélectionnées comptent.
- **Durées** : au dixième, sans « .0 » superflu (`0.4 s`, `5.5 s`, `12 s`).
  Les durées restantes suivent le format du HUD de la Baliste (`1.7 s`).
- **Emplacement** : en haut à gauche (`left: 12px; top: 12px`), environ
  236 px de large, même style sombre que le HUD de la Baliste, liseré à la
  couleur du camp.
- **Visibilité** : masquée sans sélection, en pause, sous la boutique ou la
  Forge,
  pendant le placement de la tour ou d'un bâtiment, pendant la transition de
  fin de vague, dans les menus et dans l'éditeur.
- **Mise à jour** : immédiate à chaque changement de sélection, sinon environ
  10 fois par seconde. Le DOM n'est reconstruit que si la forme de la fiche
  change.
- **Morts et destructions** : une unité morte quitte la sélection et la fiche
  disparaît. Une Mine, une Caserne ou une Forge détruite n'est plus
  inspectée. La
  Baliste détruite reste inspectable, avec l'état `DÉTRUITE`.

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
- Le coût payé en partie est toujours le coût de base : les améliorations de
  Forge (§14) ne le modifient pas.

## 4. Déblocage des unités

Sources : `data/units.ts` (`playerUnlockMode`), `run/metaProgress.ts`
(`canPlayerRecruitUnit`, `registerEnemyDefeat`).

- **Fantassin et Archer** : toujours recrutables.
- **Mage et Sentinelle** (`defeatEnemy`) : recrutables après avoir vaincu au
  moins un exemplaire **ennemi** de ce type.
  - Le déblocage est permanent, enregistré dès la mort de l'ennemi
    (`defeatedEnemyUnitIds`) et signalé par un toast.
  - Tant qu'elles ne sont pas débloquées, ces unités sont masquées dans la
    boutique.
- `MAGE_UNLOCK_WAVE` (`config/constants.ts`) ne règle que l'**apparition des
  Mages ennemis**, pas leur déblocage pour le joueur.

## 5. La Baliste (tour du joueur)

Sources : `config/constants.ts` (`PLAYER_ARROW_*`, `TALENT_*`,
`MACHINE_GUN_*`), `data/buildings.ts`, `run/ballistaStats.ts` (valeurs
effectives du tir), `sim/playerArrow.ts`, `main.ts`.

- **Bâtiment** : 25 PV de base. La Baliste compte pour la survie du camp
  joueur. Une fois détruite, elle ne tire plus.
- **Position** : choisie par le joueur en début de run, puis conservée pour
  toute la run. Dans l'éditeur et « Tester le scénario », c'est la position
  enregistrée dans la carte (`MapDef.ballista`), sinon le repli historique du
  coin (§16, `EDITOR.md` §16) ; elle n'a aucun effet sur une run.
- **Tir** : un appui sur **Q** tire un carreau en arc vers le point du sol
  sous le curseur, recalculé au moment de l'appui (la caméra a pu bouger
  depuis le dernier mouvement de souris).
  - Valeurs de base : 2 dégâts, recharge d'environ 2,31 s
    (`PLAYER_ARROW_COOLDOWN = 3 / 1.3`).
  - Vitesse 13,5 cases/s, rayon d'impact 0,63.
  - Le tir est refusé pendant la recharge et tant que la volée précédente
    est encore en vol.
  - Q est sans effet hors bataille, en pause, pendant la transition de fin
    de vague et quand le focus est dans un champ de saisie. La répétition
    automatique du clavier ne déclenche pas de tir.
  - Tirer ne modifie ni la sélection des unités, ni un rectangle de
    sélection en cours, et n'émet aucun ordre.
- **Avec le talent Tir rapide** :
  - cadence +60 %, vitesse du projectile +100 %, +2 dégâts ;
  - maintenir Q tire automatiquement à la cadence effective. Sans le
    talent, maintenir Q ne tire qu'une fois.
- **Avec le talent Mitraillette** :
  - le total des bonus de cadence est multiplié par 3 ;
  - chaque tir envoie 3 carreaux sous une seule recharge. Les deux
    supplémentaires visent les deux ennemis les plus proches du curseur, dans
    un rayon de 3.
- **Amélioration de Forge « Baliste »** : voir §14.
- **Parchemin armé** : le clic gauche sert au parchemin. Q tire quand même
  avec la Baliste, et le parchemin reste armé.
- **Réticule** : un anneau doré discret suit le sol sous le curseur pendant
  la bataille, plus visible quand la Baliste est prête, presque transparent
  pendant la recharge, masqué si elle est détruite. La Baliste s'oriente
  vers lui.
- **HUD de la Baliste** (`ui/ballistaIndicator.ts`), unique, en bas au
  centre, visible en bataille hors pause :
  - `[Q] BALISTE — <état>`, avec l'état `PRÊTE`, le temps de recharge
    restant (`1.4 s`), `EN VOL` (recharge terminée mais volée précédente
    encore en vol) ou `DÉTRUITE` (bloc grisé) ;
  - une barre de recharge intégrée, calculée sur la recharge **effective**
    (bonus de cadence compris) : pleine et dorée quand la Baliste est
    prête, pleine en vol, vide si elle est détruite ;
  - en petit, le nombre d'unités sélectionnées (ligne masquée quand rien
    n'est sélectionné).

## 6. Bâtiments gameplay : Mine, Caserne et Forge

Sources : `data/buildings.ts`, `run/mineUpgradeEffects.ts`,
`run/barracksUpgradeEffects.ts`, `run/buildingUpgradeEffects.ts`,
`sim/systems/barracksSystem.ts`, `main.ts`.

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
- **Survie du camp** : les trois bâtiments comptent pour la défaite
  (`countsForDefeat`), comme les unités et la Baliste.

| | Mine | Caserne | Forge |
|---|---|---|---|
| Coût en partie | 20 | 25 | 10 |
| PV / emprise | 15 / 2×2 | 25 / 2×2 | 15 / 2×2 |
| Effet | +1 or/s par Mine vivante pendant la bataille (+0,2 or/s par niveau d'amélioration Mine) | Produit des Fantassins (voir ci-dessous) | Accès à la boutique des améliorations de la run (§14) ; aucun effet passif |

Les coûts sont fixes : une amélioration de Forge ne les augmente pas (une
Mine améliorée coûte toujours 20, une Caserne améliorée toujours 25).

Production de la Caserne :

- **Rythme** : base de 1 Fantassin toutes les 5 s. Chaque niveau
  d'amélioration Caserne ajoute 1 Fantassin par production, et retire 1 s
  d'intervalle tous les 3 niveaux (minimum 1 s).
- **Production atomique** : si les cases libres autour d'elle ne suffisent
  pas pour tout le lot, rien n'est produit et la production attend.
- **Bonus** : les Fantassins produits reçoivent les mêmes bonus (talents et
  améliorations de la run) qu'un Fantassin acheté.
- **Persistance** : ils **ne rejoignent pas** l'armée qui persiste entre les
  vagues.

La Forge (modèle `blue_blacksmith`) est un vrai bâtiment : ciblable,
destructible, collidable. Elle n'a ni production ni revenu ; toutes les
Forges ouvrent la **même** boutique d'améliorations, sans bonus par
exemplaire. Si toutes les Forges sont détruites, les améliorations déjà
achetées restent actives, mais aucun nouvel achat n'est possible tant
qu'une Forge n'est pas reconstruite.

## 7. Économie d'or

Sources : `run/runState.ts`, `run/talentEffects.ts`, `run/runUpgrades.ts`,
`main.ts`.

L'Or est la **seule monnaie** de la run. Il sert à recruter des unités,
acheter des parchemins, construire des bâtiments et acheter des
améliorations à la Forge (§14).

Gains :

- or de départ (§2) ;
- **kill ennemi** : `KILL_REWARD`, versé en temps réel ; +1 avec Butin de
  guerre ;
- **Mines** : revenu continu pendant la bataille ;
- **victoire** : +5 (`WAVE_CLEAR_BONUS`) ; rien à la défaite ;
- **ventes** d'unités.

Revente d'unités (phase de placement uniquement) :

- **Geste** : glisser une unité ou un groupe vers « Vendre », ou cliquer sur
  « Vendre » pour vendre la sélection.
- **Barème** : `KILL_REWARD`.
- **Avec le talent Recyclage** : une unité sous 50 % de ses PV maximum
  rapporte `round(3 × coût)` au lieu du barème normal (coût de base, que
  les améliorations ne changent pas). Les unités concernées sont surlignées
  en jaune.

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
- **Formation** : mêlée devant, unités à distance derrière.

## 11. Territoire et expansion de la carte

Sources : `config/territory.ts`, `run/mapExpansion.ts`, `main.ts`
(`isValidPlacementTile`, `rebuildCurrentTerritoryIndex`).

**Territoire**

- Chaque case appartient au joueur, à l'ennemi, ou à personne (neutre).
- En préparation, le **territoire joueur** est la zone de placement : unités,
  bâtiments (toute l'emprise) et tour (toute l'empreinte 3×3) doivent y être.
- Les zones bleue et rouge affichées sur le plateau sont ce même territoire,
  case par case ; une case neutre n'a pas de zone.
- Une carte peut définir son territoire (`MapDef.territory`). La carte de
  départ ne le fait pas : son territoire est le **repli historique**, deux
  bandes de 7 rangées (la zone de spawn) à l'arrière de chaque camp, le
  centre neutre.

**Expansion**

- **Carte de départ** de chaque run : « vague1-20 » (18×26 cases, zone de
  spawn de 7 rangées par camp).
- **Après chaque victoire**, la carte s'agrandit d'une étape, selon un cycle
  A → B → C :
  - **A** : les zones de spawn s'agrandissent vers l'arrière ;
  - **B** : la carte s'élargit des deux côtés ;
  - **C** : le champ de bataille central s'agrandit. Le camp joueur reste
    fixe, le camp ennemi recule.
- Le territoire de repli est recalculé à chaque étape : il suit l'expansion.
  Un territoire **explicite** resterait statique et ne suivrait pas A, B ni
  C ; aucune run n'en utilise aujourd'hui.
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

## 14. Améliorations de Forge

Sources : `run/runUpgrades.ts` (niveaux, coûts, achat), `data/*Upgrade.ts`,
`run/*UpgradeEffects.ts`, `ui/screens.ts` (overlay), `main.ts`
(`openForge`, `purchaseForgeUpgrade`).

Les améliorations sont **propres à la run** : niveaux stockés dans
`RunState.upgrades`, remis à `{}` à chaque nouvelle run, jamais
sauvegardés. Elles s'achètent en Or, uniquement depuis une Forge.

- **Accès** : en préparation, sélectionner une Forge possédée, puis
  « Ouvrir la Forge » sur sa fiche. En bataille, la Forge reste inspectable
  mais la boutique est inaccessible.
- **Overlay** : titre « Forge », Or actuel, une carte par amélioration avec
  son niveau, ses effets et le coût du niveau suivant. « Retour » ou Échap
  ramène à la préparation, la Forge toujours sélectionnée. Pendant
  l'overlay, « Vendre », « Boutique » et « Prêt pour la bataille » sont
  masqués.
- **Achat** : Or débité, niveau +1, effet immédiat (fiches, unités recrutées
  ensuite, prochaine bataille). Bouton désactivé si l'Or ne suffit pas.
- **PV max** : quand un achat augmente les PV max d'une unité déjà possédée,
  ses PV actuels augmentent du même écart (5/5 → 6/6, 3/5 → 4/6).
- **Coût** (`runUpgradeGoldCost(id, niveau)`) : coût de départ × 2^niveau.
  - Cas général : 1 / 2 / 4 / 8 / 16…
  - Mine et Caserne : 25 / 50 / 100 / 200… (`RUN_UPGRADE_GOLD_COST_BASE_BY_ID`),
    parce qu'elles accélèrent directement l'économie ou l'armée.
  - Aucun talent ne modifie ce coût.
- **Plafond** : aucune amélioration n'a de niveau maximum.
- **Prix indépendants** : une amélioration n'augmente jamais le prix de ce
  qu'elle améliore (unité, bâtiment, parchemin).

| Amélioration | Effet par niveau |
|---|---|
| Fantassin, Archer, Mage | +1 PV ; +1 attaque tous les 3 niveaux (pour le Mage, sur la Boule de feu) |
| Sentinelle | +5 PV ; +1 bouclier par ennemi provoqué tous les 3 niveaux |
| Baliste | +20 % de cadence (additif), +10 PV ; +1 dégât tous les 3 niveaux |
| Parchemin de soin | +1 PV soigné ; une cible secondaire de plus tous les 3 niveaux (moitié du soin, à 2 cases de la cible) |
| Nova de glace | +0,5 s d'immobilisation et de Blizzard ; +1 dégât de Blizzard tous les 3 niveaux |
| Mine | +0,2 or/s |
| Caserne | +1 Fantassin par production ; −1 s d'intervalle tous les 3 niveaux (minimum 1 s) |
| Soins excédentaires | +0,5 dégât par projectile ; +1 projectile tous les 3 niveaux |

La carte « Soins excédentaires » n'apparaît qu'avec le talent du même nom.

## 15. Sauvegarde : ce qui persiste

Sources : `run/metaProgress.ts`, `run/userSettings.ts`.

**Persistant** (dans le navigateur, `localStorage`) :

- points de talent et talents débloqués ;
- record de vague ;
- types d'ennemis déjà vaincus (déblocages) ;
- paliers de points de talent déjà accordés ;
- réglages (clé séparée).

**Non persistant** : toute la run en cours (or, armée, inventaire, bâtiments,
améliorations de Forge, vague, position de la tour, état de la carte).
Quitter ou recharger la page la fait perdre.

Une ancienne sauvegarde contenant des Runes (`upgradeRunes`) ou des niveaux
d'amélioration permanents (`unitUpgrades`) se charge normalement : ces clés
sont ignorées, puis disparaissent à la sauvegarde suivante.

**« Effacer la sauvegarde »** (menu principal) remet toute la
méta-progression à zéro, après confirmation. Les réglages sont conservés.

## 16. Éditeur de maps

Accessible depuis le menu principal ; le détail d'usage est dans
`EDITOR.md`. Une run ne charge jamais une carte de l'éditeur : ses cartes
servent à « Tester le scénario ».

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
  libre (position et rotation).
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
- **Terrain** : ajout et suppression de cellules, taille du plateau
  modifiable.
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
  - Ni Mine ni Caserne ne sont créées (`KNOWN_ISSUES.md`, KI-07).

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
  vagues. La carte de départ est toujours la même ; seule l'expansion A/B/C
  la modifie.
- **Sauvegarde** : pas de sauvegarde d'une run en cours.
- **Contrôles en bataille** : pas de mode Commandement / Baliste, et la
  touche B n'a plus de fonction. La Baliste ne tire plus au clic gauche,
  seulement avec Q. Il n'y a plus d'indicateur de mode ni de barre de
  recharge séparée en bas à droite : un seul HUD de Baliste (§5).
- **Éditeur** : pas de mode rotation W/E. La rotation se fait par l'anneau
  de sélection et par Ctrl+molette.
- **Tests** : pas de tests automatisés (voir `ARCHITECTURE.md`, §17).
