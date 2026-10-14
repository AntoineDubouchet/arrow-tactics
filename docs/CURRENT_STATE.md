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
6. Bâtiments gameplay : Mine et Caserne
7. Économie d'or
8. Boutique de run
9. Inventaire et parchemins de bataille
10. Vagues ennemies
11. Expansion de la carte
12. Talents
13. Méta-progression : points de talent et Runes
14. Améliorations permanentes
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

- Chaque vague rapporte de l'or, dépensé dans la boutique de run.
- Chaque victoire rapporte aussi des Runes, dépensées en améliorations
  permanentes.
- La run continue tant que le joueur gagne ; elle s'arrête à la première
  défaite.
- Talents, Runes et améliorations sont conservés entre les runs.

## 2. Déroulé d'une run

Fonctions concernées dans `main.ts` : `startNewRun`, `beginTowerPlacement`,
`startPlacement`, `onValidatePlacement`, fin de bataille dans la boucle de jeu.

1. **Nouvelle run** (menu → Jouer, `createNewRun`) :
   - armée de départ : 1 Fantassin ;
   - or de départ : 5 (+3 avec le talent Or de départ) ;
   - inventaire et bâtiments vides, vague 1.
2. **Placement obligatoire de la tour**. Une bannière demande de placer la
   tour dans la zone de spawn. Son empreinte de 3×3 cases doit tenir
   entièrement dans la zone joueur. Échap est sans effet tant que la tour
   n'est pas posée. La tour est validée au **relâchement** du clic gauche,
   sur le plateau : si un clic droit s'ajoute avant le relâchement (geste
   clic gauche + clic droit pour déplacer la caméra), rien n'est posé.
3. **Phase de placement**. La boutique s'ouvre automatiquement. Le joueur
   peut :
   - déplacer, sélectionner et vendre ses unités ;
   - acheter, poser et déplacer des bâtiments ;
   - utiliser un parchemin de soin.

   « Prêt pour la bataille » lance le combat. Une confirmation est demandée
   s'il reste plus de 30 % de l'or du début du placement
   (`PLACEMENT_GOLD_WARNING_RATIO`).
4. **Bataille automatique**. Le joueur intervient avec la Baliste et les
   parchemins de bataille.
5. **Fin de bataille**, dès qu'un camp n'a plus de combattant (unités et
   bâtiments du joueur comptent tous les deux) :
   - **Victoire** : bonus d'or, Runes, étape d'expansion de la carte, écran de
     fin de vague, puis placement de la vague suivante.
   - **Défaite** : écran « Partie terminée », puis retour au menu.
6. **Abandon** (Échap → Quitter → confirmation) : retour au menu. Les gains de
   méta-progression déjà obtenus pendant la run restent acquis (ils sont
   sauvegardés au fil des batailles), mais **aucune récompense supplémentaire
   n'est accordée à l'abandon**.

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
- Le coût réellement payé en partie peut être supérieur au coût de base, à
  cause des améliorations permanentes (§14).

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
`MACHINE_GUN_*`), `data/buildings.ts`, `sim/playerArrow.ts`, `main.ts`.

- **Bâtiment** : 25 PV de base. La Baliste compte pour la survie du camp
  joueur. Une fois détruite, elle ne tire plus.
- **Position** : choisie par le joueur en début de run, puis conservée pour
  toute la run.
- **Tir** : un clic tire un carreau en arc vers le curseur.
  - Valeurs de base : 2 dégâts, recharge d'environ 2,31 s
    (`PLAYER_ARROW_COOLDOWN = 3 / 1.3`).
  - Vitesse 13,5 cases/s, rayon d'impact 0,63.
- **Avec le talent Tir rapide** :
  - cadence +60 %, vitesse du projectile +100 %, +2 dégâts ;
  - maintenir le clic tire automatiquement à la cadence effective.
- **Avec le talent Mitraillette** :
  - le total des bonus de cadence est multiplié par 3 ;
  - chaque tir envoie 3 carreaux sous une seule recharge. Les deux
    supplémentaires visent les deux ennemis les plus proches du curseur, dans
    un rayon de 3.
- **Amélioration permanente** : voir §14.
- Quand un parchemin est armé, le clic sert au parchemin : aucun tir de
  Baliste ne part en même temps.

## 6. Bâtiments gameplay : Mine et Caserne

Sources : `data/buildings.ts`, `run/mineUpgradeEffects.ts`,
`run/barracksUpgradeEffects.ts`, `run/buildingUpgradeEffects.ts`,
`sim/systems/barracksSystem.ts`, `main.ts`.

Ils s'achètent dans l'onglet « Bâtiments » de la boutique de run.

- **Achat** : cliquer sur le bâtiment passe en mode placement. L'or n'est
  payé qu'au clic de confirmation sur un emplacement valide de la zone
  joueur ; Échap ou clic droit annule sans rien payer.
- **Rotation** : Ctrl+molette pendant le placement, par pas de 45°.
- **Déplacement** : un bâtiment possédé se déplace gratuitement en le
  faisant glisser pendant le placement.
- **Persistance** : les bâtiments restent d'une vague à l'autre, avec leurs
  PV. Plusieurs exemplaires de chaque bâtiment sont possibles.

| | Mine | Caserne |
|---|---|---|
| Coût en partie | 100 + 5 × niveau d'amélioration | 50 + 5 × niveau d'amélioration |
| PV / emprise | 15 / 2×2 | 25 / 2×2 |
| Effet pendant la bataille | +1 or/s par Mine vivante (+0,2 or/s par niveau d'amélioration) | Produit des Fantassins (voir ci-dessous) |

Production de la Caserne :

- **Rythme** : base de 1 Fantassin toutes les 5 s. Chaque niveau
  d'amélioration ajoute 1 Fantassin par production, et retire 1 s
  d'intervalle tous les 3 niveaux (minimum 1 s).
- **Production atomique** : si les cases libres autour d'elle ne suffisent
  pas pour tout le lot, rien n'est produit et la production attend.
- **Bonus** : les Fantassins produits reçoivent les mêmes bonus permanents
  qu'un Fantassin acheté.
- **Persistance** : ils **ne rejoignent pas** l'armée qui persiste entre les
  vagues.

## 7. Économie d'or

Sources : `run/runState.ts`, `run/talentEffects.ts`, `main.ts`.

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
  rapporte `round(3 × coût effectif)` au lieu du barème normal. Les unités
  concernées sont surlignées en jaune.

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
| Parchemin de soin mineur | 1 + 0,5 × niveau d'amélioration | placement et bataille | Soigne 5 PV à l'unité alliée blessée la plus touchée (en proportion de ses PV max) dans un rayon de 2 autour du clic |
| Nova de glace | 4 + 0,5 × niveau d'amélioration | bataille | Immobilise pendant 4 s les ennemis présents dans un rayon d'environ 2,3 (1,15 × rayon de la Boule de feu) |

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

## 11. Expansion de la carte

Source : `run/mapExpansion.ts`.

- **Carte de départ** de chaque run : « vague1-20 » (18×26 cases, zone de
  spawn de 7 rangées par camp).
- **Après chaque victoire**, la carte s'agrandit d'une étape, selon un cycle
  A → B → C :
  - **A** : les zones de spawn s'agrandissent vers l'arrière ;
  - **B** : la carte s'élargit des deux côtés ;
  - **C** : le champ de bataille central s'agrandit. Le camp joueur reste
    fixe, le camp ennemi recule.
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
| Maître de la forge | Réflexes de vétéran | Coût en Runes des améliorations divisé par 4 (minimum 0,1 Rune) |

- **Exclusivité** : une exclusivité existe entre talents qui partagent le
  même prérequis ; aucun talent actuel n'est concerné.
- **Réinitialisation** : « Réinitialiser les talents » rembourse tous les
  points dépensés.

## 13. Méta-progression : points de talent et Runes

Source : `run/metaProgress.ts`.

Points de talent (chaque source est accordée une seule fois par sauvegarde) :

- **+1** à la toute première fin de run de la sauvegarde. Il s'agit d'une
  défaite : un abandon ne compte pas.
- **+1** la première fois que la vague 4 est gagnée (`TALENT_POINT_WAVES`).
- **+1** la première fois que chacune des vagues 6, 8, 10, 12… est gagnée
  (`TALENT_POINT_RECURRING_START`, `TALENT_POINT_RECURRING_INTERVAL`).

Autres éléments :

- **Runes** : à chaque vague gagnée, `10 × 2^floor(v / 10)`, soit 10 pour les
  vagues 1 à 9, 20 pour les vagues 10 à 19, 40 pour les vagues 20 à 29…
  (`upgradeRunesRewardForWave`).
- **Record** : le plus haut numéro de vague atteint est conservé et affiché.

## 14. Améliorations permanentes

Sources : `data/*Upgrade.ts`, `run/*UpgradeEffects.ts`,
`run/metaProgress.ts` (`effectiveUpgradeCost`).

Elles sont accessibles depuis le menu principal (boutique d'amélioration).

- **Coût en Runes** : 10 pour le premier niveau, puis doublé à chaque niveau.
  Le talent Maître de la forge divise ce coût par 4.
- **Plafond** : aucune amélioration n'a de niveau maximum.

| Amélioration | Effet par niveau | Effet sur le coût en partie |
|---|---|---|
| Fantassin, Archer, Mage | +1 PV ; +1 attaque tous les 3 niveaux (pour le Mage, sur la Boule de feu) | +1 or à chaque palier d'attaque |
| Sentinelle | +5 PV ; +1 bouclier par ennemi provoqué tous les 3 niveaux | +5 or par niveau |
| Baliste | +20 % de cadence (additif), +10 PV ; +1 dégât tous les 3 niveaux | — |
| Parchemin de soin | +1 PV soigné ; une cible secondaire de plus tous les 3 niveaux (moitié du soin, à 2 cases de la cible) | +0,5 or par niveau |
| Nova de glace | +0,5 s d'immobilisation et de Blizzard ; +1 dégât de Blizzard tous les 3 niveaux | +0,5 or par niveau |
| Mine | +0,2 or/s | +5 or par niveau |
| Caserne | +1 Fantassin par production ; −1 s d'intervalle tous les 3 niveaux (minimum 1 s) | +5 or par niveau |
| Soins excédentaires | +0,5 dégât par projectile ; +1 projectile tous les 3 niveaux | — |

Dans la boutique d'améliorations permanentes, toutes les cartes sont visibles
en permanence, sauf « Soins excédentaires », qui n'apparaît qu'une fois le
talent du même nom débloqué. Réinitialiser les talents ne touche pas aux
niveaux d'amélioration déjà achetés : la carte est seulement masquée, puis
retrouve ses niveaux quand le talent est de nouveau débloqué.

## 15. Sauvegarde : ce qui persiste

Sources : `run/metaProgress.ts`, `run/userSettings.ts`.

**Persistant** (dans le navigateur, `localStorage`) :

- points de talent et talents débloqués ;
- Runes et niveaux d'amélioration ;
- record de vague ;
- types d'ennemis déjà vaincus (déblocages) ;
- paliers de points de talent déjà accordés ;
- réglages (clé séparée).

**Non persistant** : toute la run en cours (or, armée, inventaire, bâtiments,
vague, position de la tour, état de la carte). Quitter ou recharger la page la
fait perdre.

**« Effacer la sauvegarde »** (menu principal) remet toute la
méta-progression à zéro, après confirmation. Les réglages sont conservés.

## 16. Éditeur de maps

Le détail d'usage relèvera de `EDITOR.md`. Il est accessible depuis le menu
principal.

- **Décors** : rochers, arbres, props et bâtiments décoratifs, en placement
  libre (position et rotation).
- **Unités** : du bestiaire, alignées sur la grille. Leur camp est déduit de
  la moitié du plateau où elles sont posées.
- **Terrain** : ajout et suppression de cellules, taille du plateau
  modifiable.
- **Outils** : annuler / rétablir ; enregistrer et charger une carte en
  JSON.
- **« Tester le scénario »** : lance une vraie bataille sur la carte éditée,
  sans bâtiment gameplay, puis revient à l'éditeur.

## 17. Audio

- Un moteur audio procédural est présent dans `audio/`, mais il est
  **déconnecté** : le jeu est actuellement silencieux.
- L'onglet Paramètres > Son existe et enregistre les volumes, sans effet
  audible.

## 18. Outils de debug présents

- **Panneau de debug** permanent en haut à gauche : FPS, tick, graine,
  caméra… (`ui/debug.ts`).
- **Touche X** : bascule la vitesse de jeu entre ×1 et ×2.
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
  bâtiment acheté). Les points des anciennes sauvegardes sont remboursés.
- **Boutique** : pas d'onglet « Soins » ni de bouton « Soigner une unité » ;
  le soin passe uniquement par le parchemin.
- **Cartes** : pas de succession de cartes prédéfinies distinctes au fil des
  vagues. La carte de départ est toujours la même ; seule l'expansion A/B/C
  la modifie.
- **Sauvegarde** : pas de sauvegarde d'une run en cours.
- **Éditeur** : pas de mode rotation W/E. La rotation se fait par l'anneau
  de sélection et par Ctrl+molette.
- **Tests** : pas de tests automatisés (voir `ARCHITECTURE.md`, §17).
