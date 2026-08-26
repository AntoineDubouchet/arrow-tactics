# Arrow Tactics — contexte projet

Titre de travail. Petit jeu indépendant web : roguelite tactique en vue 3/4,
auto-bataille avec intervention directe du joueur à la flèche.

Le développeur s'appelle Antoine. Il parle français, code seul, et n'est pas
familier de l'écosystème Node/npm — sois explicite sur les commandes à taper.

## Rôle attendu

Tu es lead game designer et gameplay programmer, pas exécutant. Si une décision
de design risque de rendre le jeu moins amusant, **dis-le** et propose une
alternative. Ne cherche pas à valider systématiquement les idées d'Antoine.

Travaille par étapes : expliquer → construire → tester → identifier les
problèmes → proposer la suite. Ne développe jamais tout d'un coup.

Règle absolue : si une fonctionnalité n'est pas nécessaire pour tester le
**plaisir** du jeu, elle est repoussée. La question est toujours « est-ce
amusant ? », jamais « est-ce techniquement fonctionnel ? ».

## Boucle de jeu visée

Composer son armée → placer ses unités → la bataille se joue toute seule →
le joueur intervient à la flèche et aux sorts → il gagne de l'or → il achète
entre les vagues → il va plus loin. Quand la dernière unité meurt, la run
s'arrête, mais la progression permanente (arbre de talents) est conservée.

## Décisions de design déjà arrêtées

Ne pas les remettre en cause sans raison sérieuse — elles ont été discutées.

**Comportement des unités.** Les deux camps avancent vers le centre. L'aggro
sert à CHOISIR une cible, la portée d'attaque sert à S'ARRÊTER. Une unité ne
frappe jamais en marchant (drapeau `canAttackWhileMoving`, réservé plus tard à
la charge du chevalier). Conséquence recherchée : une ligne de front se forme
d'elle-même, sans code de formation. L'effet « blob » est assumé et voulu.

**Séparation entre corps.** Force de répulsion entre toutes les unités. C'est
ce qui transforme un empilement illisible en foule qui se bouscule — c'est le
seul comportement sophistiqué autorisé pour l'instant.

**Flèche du joueur.** Cooldown 3 s, 2 dégâts (20 en interne), projectile lent
et visible qui arque au-dessus du champ. Elle doit peser environ 20 % des
dégâts d'une vague : assez pour compter, pas assez pour rendre l'armée
décorative. La réduction de cooldown est réservée comme grosse récompense de
l'arbre de talents.

**Miss.** 10-15 %, pas 30 %. Un taux élevé produit des morts arbitraires et
casse l'objectif « comprendre pourquoi une unité est morte ». Le miss doit être
une information lisible, pas du bruit — il lui faut un feedback visuel clair.

**Échelle des nombres.** Toutes les stats de PV et de dégâts sont stockées ×10
en interne (fantassin = 50 PV) et affichées en pips de 5. Ça permet d'équilibrer
à ±5 % sans casser les entiers. Ne jamais revenir à 5 PV / 1 dégât.

**Unité de mesure : la case.** `TILE = 1`, donc une unité de simulation vaut
toujours exactement une case de la grille de départ — aucune conversion à
faire. Décision d'Antoine : on communique désormais les portées, distances et
marges en cases plutôt qu'en unités abstraites, pour rester dans un vocabulaire
commun avec ce qui se voit à l'écran. Garder les commentaires de code et les
discussions dans cette unité (ex. « aggro à 9 cases », pas « aggroRange: 9 »).

**Silhouettes.** Des boîtes, pas des pantins bas-poly. Un essai en capsules et
icosaèdres façon *Totally Accurate Battle Simulator* a été tenté (après un
premier retour disant que l'archer lisait « comme du Minecraft »), puis
abandonné : moins élégant, jugement d'Antoine après coup d'œil. Retour aux
boîtes. Ne retente pas ce changement de direction sans qu'Antoine le redemande
explicitement — un aller-retour a déjà eu lieu.

Seule exception à la règle « tout en boîtes » pour les UNITÉS : l'arc de
l'archer, construit avec un arc de tore (demi-cercle géométrique), parce
qu'une courbure ne se lit pas avec des segments de boîtes droits (testé, jugé
« comme un bout de bois »).

**Décor (rochers, arbres) : de vrais modèles `.glb`, pas de géométrie
générée.** Distinct de la règle « tout en boîtes » ci-dessus, qui ne vaut que
pour les UNITÉS (elle reste verrouillée telle quelle). Historique de la
décision (deux allers-retours procéduraux avant d'arriver là) : boîtes
empilées (tailles/teintes variées, banque de silhouettes) jugées trop
« Minecraft », puis des masses facettées générées par déplacement aléatoire de
sommets d'icosaèdre (voir Stack ci-dessous pour le détail actuel), qui ont
produit l'effet inverse — un bruit géométrique lisant comme un tas de débris,
pas une masse rocheuse. Plutôt qu'une troisième tentative procédurale à
l'aveugle, décision d'Antoine : importer de vrais modèles low-poly (Kenney
Nature Kit, CC0). La lisibilité du jeu reste la priorité, mais Antoine a
explicitement corrigé une sur-interprétation en cours de route : elle
s'applique aux éléments de GAMEPLAY (unités, grille, ciblage), pas à une
contrainte de parité visuelle entre décor et unités — le décor peut être
nettement plus détaillé que les unités pour donner un sentiment de lieu.

Deux contraintes de lecture : le camp du joueur avance vers le fond, donc on
voit surtout son DOS ; et la caméra est inclinée, donc le détail ne compte que
s'il DÉBORDE de la silhouette. D'où bouclier large et incliné vers
l'extérieur, arme tendue presque à l'horizontale, carquois en diagonale. Un
accessoire tenu à bout de bras (arc, épée) doit toujours être un ENFANT du
bras qui le porte dans la hiérarchie Three.js, jamais positionné
indépendamment dans le groupe racine — sinon le moindre réglage de pose le
détache de la main et il finit par flotter dans le vide (déjà arrivé une
fois sur l'arc). Le métal est neutre et commun, la couleur d'équipe occupe les
grandes surfaces de tissu, et l'accessoire tenu en main identifie le rôle.

**Caméra.** Défaut validé par Antoine : pivot 55°, inclinaison 40°, zoom 22.
Risque connu à surveiller : à 40°, les unités du second rang se masqueront
quand les vagues grossiront. Contrôlable au clavier (flèches, A/E, R) ET à la
souris (clic droit maintenu + glisser pour pivoter/incliner, molette pour
zoomer) — le clic gauche reste délibérément libre pour le placement puis pour
le ciblage/tir de la flèche du joueur.

**Interface.** Tout en HTML/CSS par-dessus le canvas, jamais dessiné dans le
canvas. Minimaliste, inspirée des jeux de stratégie PC, pas d'un jeu mobile
couvert de boutons.

**Phase de placement.** Clic gauche direct sur une unité pour la sélectionner
(surbrillance en anneau de la couleur du camp), clic gauche sur une case libre
de sa zone pour l'y déplacer. Pas de bandeau de jetons à cliquer à côté du
plateau — le premier essai fonctionnait ainsi, jugé pas naturel par Antoine :
la manipulation directe sur les unités 3D est la bonne approche. La zone de
placement (`PLACEMENT_ROWS`) reste toujours plaquée au fond de chaque côté
(calculée depuis le bord du plateau) : l'agrandir ne fait que grossir la zone
neutre au centre, jamais rapprocher les deux camps.

**Obstacles.** Toujours un rectangle exact de cases entières (`cornerX`,
`cornerZ`, `tilesX`, `tilesZ` dans `OBSTACLES`), jamais un cercle
approximatif : la hit box doit correspondre exactement à ce que le joueur voit
occupé sur la grille. Double effet sur cette même emprise : bloque la ligne de
tir des attaques à distance (l'unité contourne de quelques pas pour retenter,
voir combatSystem) ET bloque physiquement les pas de toutes les unités (voir
resolveObstacleCollisions dans movementSystem) — les deux ont été codés
séparément à des moments différents, ne pas réintroduire l'un sans l'autre.
Le rendu (render/board.ts) lit la même constante que la simulation : jamais de
position dupliquée à la main.

## Architecture

```
src/
  config/   constantes de réglage — aucun nombre magique ailleurs
  core/     boucle à pas fixe, maths 2D, RNG déterministe
  data/     définitions d'unités (données pures, zéro logique)
  sim/      simulation — n'importe JAMAIS Three.js
  render/   caméra, plateau, silhouettes, animations
  ui/       overlays HTML
```

Règles non négociables :

- **`sim/` ne connaît pas l'écran, `render/` ne décide rien.** Cette frontière
  permet de tester la simulation sans navigateur (déjà utilisée : elle a
  détecté un bug de sortie de plateau invisible à l'œil) et permettra plus tard
  de simuler des milliers de combats pour équilibrer.
- **Pas de temps fixe à 30 Hz, rendu interpolé.** D'où le déterminisme, la
  pause propre et la vitesse ×2.
- **Données séparées de la logique.** Créer une unité = une entrée dans
  `data/units.ts`, rien d'autre.
- **Pipeline de stats en couches** à venir : base → talents permanents →
  achats de run → buffs temporaires. Aucune stat lue en dur.

## Chantier éditeur de maps (en cours)

Objectif à terme : un mode éditeur intégré (interface visuelle) pour construire
les maps sans passer par le code à chaque fois — Antoine n'a pas d'accès au
rendu de son côté que par capture d'écran, et moi aucun accès visuel du tout,
donc chaque ajustement de position d'obstacle jusqu'ici passait par une boucle
lente (décrire → deviner/coder → capture d'écran → corriger). Un éditeur
manipulé directement par Antoine élimine ce goulot.

Découpage validé avec Antoine (2026-08-08), à ne pas court-circuiter :
1. **Rendre le jeu data-driven, sans éditeur** — FAIT. Voir `config/mapDef.ts`
   (`MapDef`, `DEFAULT_MAP`) : `createBoard()`, `World` (`setMap()`),
   `movementSystem` (boardWidth/boardHeight en paramètres) lisent une `MapDef`
   au lieu de constantes globales (`OBSTACLES`, `BOARD_W`, `BOARD_H` dans
   `constants.ts` existent toujours, mais seulement comme valeurs par défaut
   internes à `World`/`mapDef.ts` — plus lues directement ailleurs).
   `DEFAULT_MAP` reproduit exactement l'ancien état codé en dur (mêmes
   obstacles, mêmes formations de départ), donc ce changement ne devait rien
   modifier au jeu — vérifié en headless.
2. **Éditeur minimal (asset browser, placer/sélectionner/déplacer/tourner/
   supprimer un obstacle)** — FAIT. Accessible depuis le menu principal
   (bouton « Éditeur de maps »). `src/editor/editorState.ts` (état pur,
   pas de Three.js), `src/editor/editorScene.ts` (rendu — réutilise
   `createRock`/`createTreeObstacle`, donc WYSIWYG avec le jeu réel),
   `src/editor/editorUI.ts` (asset browser + panneau propriétés, HTML/CSS
   par-dessus le canvas comme le reste de l'UI). Repart de `DEFAULT_MAP` (pas
   d'une carte vide) : l'éditeur sert d'abord à ajuster l'existant. Pas
   encore de sauvegarde — fermer l'éditeur perd les modifications (prévu à
   l'étape 3). Rotation par pas de 90° uniquement (`R` ou bouton dédié) ;
   `R` est réutilisé du raccourci caméra existant (`resetCamera`), désormais
   gated par `inEditorMode` dans `main.ts`. Suppr/Retour arrière supprime la
   sélection, Échap annule l'outil de placement actif ou désélectionne.
   Bug corrigé après premier test d'Antoine : le plateau du jeu (`board.ts`)
   dessine déjà ses propres rochers/arbres au démarrage ; l'éditeur dessine sa
   PROPRE copie à partir de son `EditorState`. Sans masquer l'originale, les
   deux restaient superposées en permanence — un nouvel objet posé semblait
   « dupliquer » tout le décor existant, et supprimer un rocher dans l'éditeur
   laissait sa copie du plateau original bien visible au même endroit. Fixé en
   exposant les obstacles du plateau comme sous-groupe séparément masquable
   (`Board.obstacles`, `board.obstacles.visible = false` en entrant dans
   l'éditeur) — même principe que `gridLines`/`zones` déjà toggleables.
   Second bug corrigé au test suivant : tous les objets déjà posés
   « sautaient » (rotation, composition de rocher) au moindre clic ailleurs
   sur le plateau, car `refreshEditorObjects()` reconstruisait TOUT le groupe
   à chaque changement — or `createRock`/`createTreeObstacle` tirent leur
   composition/orientation au hasard à CHAQUE appel. `main.ts` garde
   maintenant un cache mesh par id d'obstacle (`editorMeshes`) : un objet déjà
   construit n'est plus jamais reconstruit, seulement retransformé (position
   toujours, rotation seulement si explicitement fixée par l'outil Tourner) —
   les boutons Tourner/Supprimer n'ont d'ailleurs toujours agi que sur l'objet
   sélectionné (`EditorState.selectedId`), ce n'était pas le bug.
   **Banque d'assets élargie** (2026-08-08, demande d'Antoine : « importer un
   maximum d'éléments intéressants ») : le Kenney Nature Kit COMPLET a été
   téléchargé et son dossier `Models/GLTF format` exploré pour choisir de
   nouveaux fichiers, pas juste les quelques-uns déjà présents. Ajoutés dans
   `public/models/nature/` et câblés dans `assetLibrary.ts` : ~34 arbres
   supplémentaires (pins, palmiers, formes variées — voir `EXTRA_TREE_MODELS`,
   jamais ajoutés au pool de tirage aléatoire `TREE_MODELS`/`pickRandom` pour
   ne pas changer l'apparence des obstacles existants qui n'imposent pas de
   modèle) et 53 nouveaux **props** (bûches, souches, champignons, buissons,
   fleurs, cactus, feux de camp, statues, pots, panneau, tentes — voir
   `PROP_MODELS`). Nouveau troisième `kind: 'prop'` sur `ObstacleDef` (en plus
   de `rock`/`tree`) : un seul modèle .glb mis à l'échelle sur sa largeur
   (`render/props.ts`, `createPropObstacle`), pas de composition en grappe ni
   de calage sur la hauteur. `render/obstacleFactory.ts` centralise désormais
   le `switch` sur `kind` (utilisé par `board.ts` ET `editorScene.ts`, pour
   que les deux ne divergent jamais). Variantes de teinte "_dark"/"_fall" du
   kit écartées (palette d'été actuelle) ; cliffs, ponts, cultures, chemins/
   rivières et plateformes écartés aussi (systèmes de tuiles de terrain, hors
   sujet tant que l'étape 5, peinture de terrain, n'existe pas).
   **Asset browser rangé en deux groupes** (2026-08-08, demande d'Antoine) :
   « Obstacles » (rochers, arbres) et « Décors » (champignons, buissons &
   plantes, fleurs, bois, divers), voir `ASSET_GROUPS` dans `editorUI.ts`.
   Purement du rangement dans l'interface pour l'instant — un décor occupe
   encore une case entière et bloque pas/ligne de tir exactement comme un
   obstacle (`ObstacleDef` ne distingue pas encore les deux côté simulation).
   Antoine a prévenu que d'autres changements sur cette distinction arrivent
   (a priori la rendre réelle côté gameplay, pas seulement visuelle dans
   l'éditeur) — attendre son prochain message avant d'anticiper.
3. **Sauvegarde/chargement JSON** — FAIT (2026-08-08, demande d'Antoine ;
   priorisé avant le redimensionnement du plateau — voir choix explicite).
   `src/editor/mapSerializer.ts` : `exportMapDef(state, base)` construit une
   `MapDef` à partir des obstacles ET de la taille de l'éditeur (`state`) +
   nom/version/unités de la map de base chargée (`base`, unités pas encore
   éditables) ; `downloadMapDef` déclenche un téléchargement navigateur
   classique (Blob + `<a download>`, pas de backend) ; `loadMapDefFromFile`
   relit un fichier choisi via `<input type=file>` et valide a minima sa
   forme. Boutons "Enregistrer"/"Charger une carte" dans la barre d'outils de
   l'éditeur. `EditorState` accepte maintenant une `MapDef` source optionnelle
   (par défaut `DEFAULT_MAP`) pour pouvoir repartir d'une carte chargée.
   `editorBaseMap` (main.ts) retient la map d'origine de la session en cours
   (remplacée au chargement) — fournit le nom/version/unités au prochain
   export. **Undo/redo pas fait** — reste à faire séparément.
   **Redimensionnement du plateau** — FAIT (2026-08-08, demande d'Antoine :
   plateau à "quasiment quintupler", et à terme une taille personnalisée
   X×X). `EditorState.width/height` (mutables via `setSize`, minimum 1×1,
   pas de suppression automatique des obstacles qui tombent hors des
   nouvelles limites — à Antoine de les ajuster). Contrôle "Taille" (deux
   champs numériques + bouton Appliquer) dans la barre d'outils de l'éditeur.
   Changement d'architecture nécessaire : l'éditeur a maintenant son PROPRE
   sol/grille/zones (`editorBoardGroup`, main.ts), reconstruit par
   `rebuildEditorBoard()` à chaque changement de taille via trois fonctions
   extraites de `board.ts` (`createGroundBlock`, `createGridLines`,
   `createZonesGroup`, toutes typées sur `MapSize` — juste `{width,height}`,
   pas besoin d'une `MapDef` complète). En entrant dans l'éditeur, TOUT
   `board.group` (le plateau réellement en jeu) est désormais masqué d'un
   coup plutôt que juste ses obstacles (`board.gridLines`/`board.zones`
   n'étaient plus suffisants une fois que l'éditeur peut avoir une taille
   différente du jeu réel) — sans ce changement, changer la taille dans
   l'éditeur aurait changé la taille de la partie en cours par erreur, avant
   même qu'un bouton "Tester la map" existe pour le faire délibérément.
   L'éditeur ne reconstruit PAS le décor (herbe/buissons/cailloux) pour
   rester simple — juste sol/grille/zones/obstacles.
   **Placement d'unités (bestiaire du jeu)** — FAIT (2026-08-08, demande
   d'Antoine : pouvoir composer des vagues d'ennemis dans l'éditeur et
   renvoyer le JSON résultant). Catégorie "Unités → Bestiaire" en haut de
   l'asset browser, construite dynamiquement depuis `data/units.ts` (`UNITS`)
   — une nouvelle unité y apparaît automatiquement, aucune liste à maintenir
   dans l'éditeur. **Le camp n'est jamais choisi explicitement** : une unité
   posée côté z ≥ 0 (moitié bleue) devient `team: 'player'`, côté z < 0
   (moitié rouge) `team: 'enemy'` — recalculé à chaque déplacement, y compris
   pendant le survol du fantôme de placement (retour visuel avant le clic).
   `EditorState` gère maintenant obstacles ET unités en parallèle : une
   `EditorSelection` unique (`{kind:'obstacle'|'unit', id}`) plutôt que deux
   états de sélection séparés, pour que les boutons Tourner/Supprimer et le
   panneau propriétés s'appliquent toujours à UNE seule chose à la fois. Pas
   de rotation pour les unités (bouton Tourner masqué quand une unité est
   sélectionnée, voir `EditorUI.showUnitProperties`). Rendu via `buildUnit`
   (même fonction que la phase de placement en jeu) : contrairement aux
   rochers/arbres/props, un changement de camp change la couleur d'un mesh
   déjà construit, ce qui n'est pas une propriété qu'on peut basculer en
   place (couleur cuite dans les matériaux des boîtes) — `main.ts` reconstruit
   donc le mesh d'une unité SEULEMENT quand son camp change (`editorUnitMeshTeams`
   trace le dernier camp rendu par id), pas à chaque rafraîchissement. Positions
   alignées sur le centre de case (`snapToTileCenter`, même convention que la
   phase de placement en jeu) plutôt que la position brute du clic.
   `exportMapDef` construit maintenant `playerUnits`/`enemyUnits` depuis
   `state.units` (filtré par `team`) plutôt que depuis la map de base : les
   unités éditées sont bien celles sauvegardées.
4. **« Tester le scénario »** — FAIT (2026-08-08, demande d'Antoine : lancer
   une VRAIE bataille depuis l'éditeur, mêmes règles, retour automatique à
   l'éditeur — configuration de départ intacte — une fois un camp éliminé).
   `main.ts`, `testScenario()`/`returnToEditorAfterTest()`. Fonctionnement :
   `exportMapDef(editorState, editorBaseMap)` capture le brouillon actuel en
   `MapDef`, `currentMap` (désormais `let`, plus `const`) bascule dessus le
   temps du test, `world.setMap(currentMap)` applique les vraies règles de
   simulation, un plateau visuel séparé (`testBoard`, distinct de `board` —
   jamais touché) est construit pour le rendu. `editorState` n'est NI effacé
   NI remplacé pendant le test (seulement masqué) : au retour, on le retrouve
   identique — c'est le point demandé explicitement par Antoine. Pendant le
   test, `inEditorMode` passe a `false` (comme une bataille normale) : vise/
   tir/baliste marchent sans code spécial puisque `inBattlePhase()` redevient
   vrai naturellement. Fin de partie détectée par la boucle de jeu normale
   (un camp à 0 unité) ; un flag `inTestMode` fait bifurquer cette detection
   vers `returnToEditorAfterTest()` au lieu de l'écran de fin de vague
   habituel. Échap pendant le test revient aussi à l'éditeur directement
   (contourne le menu pause normal, qui aurait renvoyé au menu principal et
   cassé le cycle éditer/tester). Après le test, `currentMap` revient à
   `DEFAULT_MAP` : la partie réelle (menu → Jouer) n'hérite jamais de la map
   testée.
5. Plus tard seulement : peinture de terrain (aucun équivalent existant —
   le sol est aujourd'hui une dalle uniforme, pas un tableau de cases
   typées), spawns/objectifs, prefabs, undo/redo (voir étape 3).

Ne pas sauter direct à un éditeur complet : Antoine a explicitement demandé
un découpage en petites étapes testables plutôt qu'une grosse refonte d'un
coup.

## Chantier économie (en cours)

Objectif : introduire la vraie monnaie du jeu (or) et une armée qui persiste
sur toute une run, remplaçant le roster fixe et la boutique stub actuels.
Découpage validé avec Antoine (2026-08-08), même logique de petites étapes
que le chantier éditeur :

1. **Économie — données, pas d'UI** — FAIT. `src/run/runState.ts` :
   `RunState` (`gold`, `army: OwnedUnit[]`), `createNewRun()` (une run neuve
   démarre avec UN SEUL fantassin à pleins PV et 0 or — "le minimum possible
   pour une partie", demande explicite d'Antoine), `applyBattleOutcome(run,
   entities)` calcule l'or gagné à la fin d'une bataille (kills ennemis +
   bonus de vague SI victoire) et met à jour l'armée (PV des survivants
   conservés — confirmé par Antoine : une unité blessée reste blessée tant
   qu'elle n'est pas soignée en boutique — unités mortes retirées). Vérifié
   par script headless (`applyBattleOutcome` sur des `Entity` synthétiques),
   supprimé ensuite comme d'habitude. **Pas encore branché sur main.ts** :
   la phase de placement lit toujours `PLAYER_ROSTER` (fixe), aucune boutique
   n'affiche l'or. Barème confirmé par Antoine : fantassin tué = 1 or, archer
   tué = 1,5 (`KILL_REWARD` dans runState.ts — la moitié de leur coût
   d'achat, 2 et 3, coïncidence exploitée délibérément : la même règle
   servira de valeur de revente à l'étape 4), +5 à la victoire d'une vague
   (`WAVE_CLEAR_BONUS`, PAS à la défaite — hypothèse prise faute de précision
   d'Antoine sur ce point, à confirmer si besoin). Or de départ d'une run
   confirmé par Antoine (2026-08-08) : 5 (`STARTING_GOLD`, pas 0). Composition
   ennemie de la vague par défaut confirmée aussi : 3 fantassins + 1 archer
   (`config/mapDef.ts`, `enemyUnits`, remplace l'ancienne formation à 6).
   Détail d'implémentation important pour la suite : `sim/entity.ts` ne
   retire JAMAIS une entité morte de `World.entities` (`alive` passe juste à
   `false`, `hp` à 0) et il n'existe aucun évènement de mort dédié — un seul
   calcul à la toute fin de la bataille suffit, pas besoin de suivre les
   morts tick par tick. `applyBattleOutcome` reconstitue quelle `Entity`
   correspond à quel `OwnedUnit` par ORDRE DE SPAWN (pas par id partagé) :
   ça impose un invariant à l'étape 3 (spawner l'armée du joueur dans le même
   ordre que `run.army`, avant les ennemis — déjà le motif utilisé par
   `onValidatePlacement`/`setupTestBattle`), documenté en commentaire dans
   runState.ts.
2. **Vraie boutique** — FAIT. `ui/screens.ts` : l'écran boutique n'est plus
   statique, `showShop(run)`/`refreshShop(run)` affichent l'or courant et
   activent/désactivent les 3 boutons d'achat (Fantassin 2 or, Archer 3 or,
   Soigner une unité 1 or — désactivé aussi s'il n'y a personne à soigner)
   selon l'or disponible. Achats gérés dans `main.ts` (`onBuyFantassin`/
   `onBuyArcher`/`onHeal`, passés à `Screens`) : ajoutent une `OwnedUnit` à
   `currentRun.army` ou soignent l'unité la plus blessée en proportion de ses
   PV max (pas de sélection manuelle pour cette première version — un seul
   bouton "Soigner" suffit tant qu'il n'y a pas d'interface pour choisir une
   unité précise). Chaque achat rafraîchit immédiatement l'affichage
   (`refreshShop`) sans quitter l'écran.
3. **Phase de placement basée sur l'armée réelle** — FAIT. `PLAYER_ROSTER`
   fixe supprimé ; `startPlacement()` construit les emplacements depuis
   `currentRun.army` (variable) via `computeArmyFormation()`, qui range les
   unités en rangées centrées sur x=0 en partant du front, pour un nombre
   QUELCONQUE d'unités (plus seulement 6 codées en dur) — reste une
   disposition de DÉPART, le joueur peut toujours tout déplacer avant de
   valider. Nouvelle distinction `onPlay`/`startNewRun()` (reset complet —
   or à 0, armée réduite à un fantassin, "le minimum possible pour une
   partie") vs `onContinueAfterShop`/`startPlacement()` seul (garde la run en
   cours pour la vague suivante) — avant cette étape, les deux pointaient
   vers la même fonction, ce qui aurait remis l'armée à zéro à chaque vague.
   `World.spawn()` accepte maintenant un `hp` optionnel (par défaut pleins
   PV) : la phase de placement y passe les PV ACTUELS de chaque `OwnedUnit`,
   sinon toute unité survivante blessée serait réapparue à pleins PV au
   combat suivant — cassant silencieusement la persistance des PV confirmée
   par Antoine. `applyBattleOutcome` (étape 1) est appelé à la fin de CHAQUE
   bataille réelle (victoire ou défaite, avant `showWaveComplete`), pas
   seulement en test.
4. **Vendre une unité pendant le placement** — FAIT (2026-08-08). Geste en
   trois temps sur `canvas`/`window` (`mousedown` → `mousemove` → `mouseup`,
   voir `main.ts`) : clic maintenu sur une unité posée (`unitDrag`, pas de
   sélection immédiate — un simple clic sans bouger reste interprété comme la
   sélection normale au relâchement, voir le seuil `UNIT_DRAG_THRESHOLD_PX`),
   glisser fait apparaître un fantôme HTML texte semi-transparent accroché au
   curseur (`ui/sellZone.ts`, `SellZone.showGhost`/`moveGhost` — pas un mesh
   3D, cohérent avec "aucun asset graphique"), relâcher au-dessus de l'onglet
   "Vendre" (bas droite, visible tout du long du placement comme le panneau
   de validation) vend l'unité via `sellUnit()` : retirée de `currentRun.army`
   ET de `placementSlots` au même index, or crédité au même barème que
   `KILL_REWARD` (fantassin 1, archer 1,5 — hypothèse pas encore contredite
   par Antoine). Animation "gain/perte de pièce" (`ui/coinPopup.ts`,
   `spawnCoinPopup`) : texte "+N or"/"-N or" flottant qui monte et s'estompe
   près d'un élément HTML ancre, même langage visuel que le texte "raté" du
   combat (`combatOverlay.spawnMissText`) mais ancré sur un élément d'UI, pas
   une position monde. Branché sur la vente, les 3 achats boutique (perte) et
   l'or gagné en fin de vague (`lastBattleGoldEarned`, joué à l'ouverture de
   la boutique plutôt qu'au moment du calcul — l'écran n'existe pas encore
   visuellement avant `showShop`, `getBoundingClientRect` y renverrait un
   rectangle vide). **Pas encore fait** : l'interface d'utilisation d'objets
   en temps réel pendant la bataille (voir point 5) aura sans doute besoin du
   même genre d'animation le jour où elle existera, à réutiliser plutôt qu'à
   dupliquer.
5. **Interface d'objets en temps réel** — chantier séparé, démarré le
   2026-08-09 (voir "Chantier inventaire" ci-dessous).

**Formation par rôle (mêlée devant, tir derrière)** — FAIT (2026-08-10,
demande d'Antoine : "je veux qu'il ait une tendance à apparaître sur les
lignes avant [fantassin] tandis que les archers doivent apparaître sur les
lignes plutôt arrière, le joueur peut alors les replacer — pareil pour la
génération d'ennemis, il faut que cette règle s'applique aussi"). Reste une
disposition de DÉPART modifiable comme le reste de `computeArmyFormation`, pas
une contrainte. `main.ts`, `isRangedUnit(unitId)` classe une unité par sa
portée d'attaque (`stats.attackRange > 2` — fantassin 0.95, archer 6, marge
large donc heuristique sûre sans ajouter de champ dédié à `UnitStats`) ;
nouvelle fonction partagée `layoutFormation(unitIds, frontZ, rowStep, perRow)`
range d'abord tous les indices mêlée en rangées depuis le front, puis tous les
indices tir dans les rangées suivantes, et replace chaque position à son index
d'origine dans le tableau — utilisée à la fois par `computeArmyFormation`
(joueur, `rowStep = +TILE`) ET `computeEnemyWavePlacements` (ennemi,
`rowStep = -TILE`, miroir en Z), pour que la règle s'applique aux deux camps
sans dupliquer la logique de rangée.

**Boutique accessible pendant le placement** — FAIT (2026-08-09, demande
d'Antoine). Bouton "Boutique" empilé au-dessus de "Vendre" (`ui/sellZone.ts`,
toujours visible pendant le placement, même conteneur que la zone de vente),
ouvre l'écran boutique SANS interrompre le placement en cours
(`openShopFromPlacement` dans `main.ts`) : fermer la boutique dans ce contexte
ne fait que la cacher (`onContinueAfterShop: () => screens.hideAll()`), ça ne
relance JAMAIS `startPlacement()` (qui aurait effacé les repositionnements
déjà faits). **La boutique s'ouvre désormais automatiquement à CHAQUE début de
phase de placement, y compris la toute première** (2026-08-10, demande
d'Antoine : "il faut également que la boutique s'ouvre lors du lancement d'une
partie dès le début de la phase de placement et à chaque début de phase de
placement") — `startPlacement()` appelle `openShopFromPlacement()` à sa
propre fin. Conséquence de simplification : le bouton "Boutique" et cet
auto-ouverture partagent maintenant EXACTEMENT le même chemin de code
(`openShopFromPlacement` → `screens.showShop(currentRun)`), donc le flag
`shopOpenedFromPlacement` qui distinguait avant "ouverte manuellement" de
"pas encore ouverte" a été supprimé — devenu toujours vrai par construction.
**Une unité achetée pendant le placement est utilisable tout de suite**
(2026-08-09 — correction d'un premier comportement où l'achat ne comptait que
pour la vague suivante, jugé pas naturel par Antoine : "la bataille en cours
n'a pas encore commencé, il n'y a pas de raison de la lui refuser").
`onBuyFantassin`/`onBuyArcher` ajoutent la nouvelle unité à `currentRun.army`
ET, si `inPlacementPhase` est vrai, à `placementSlots` via
`addUnitToPlacement()` (position par défaut recalculée comme si l'armée
entière était reformée, mais seule la nouvelle unité est effectivement
ajoutée — les autres, déjà potentiellement déplacées à la main, restent
intactes). `currentRun.army` et `placementSlots` restent alignés par INDEX
tant que tout ajout/retrait touche les deux tableaux ensemble au même index
(voir aussi `sellUnit`). Un achat fait à la boutique ouverte APRÈS une vague
(avant que la vague suivante n'ait démarré son placement) continue de
n'apparaître qu'au `startPlacement()` suivant, ce qui est déjà le
comportement naturel puisque `placementSlots` n'existe pas encore à ce
moment-là. **Le bouton "Soigner une unité" de la boutique n'existe plus**
(2026-08-09) : remplacé entièrement par le parchemin de soin de l'inventaire
(voir "Chantier inventaire" ci-dessous) — le soin ne passe désormais que par
un objet ciblé en temps réel pendant la bataille.

**Sélection multiple pendant le placement** — FAIT (2026-08-09, demande
d'Antoine : "encadrer un groupe d'unités" façon jeu de stratégie classique).
Glisser sur le SOL (pas sur une unité) pendant le placement dessine un
rectangle de sélection (`ui/selectionBox.ts`, `GroundDragState` dans
`main.ts`, même seuil de glisser que la vente) ; au relâchement,
`selectUnitsInRect` projette la position de chaque unité posée vers l'écran
(`worldToScreen`, `camera.project()`) et sélectionne celles tombées dans le
rectangle — 0 résultat déselectionne tout, 1 se comporte comme une sélection
simple, 2+ devient une sélection de groupe (`selectedGroup: number[] | null`,
mutuellement exclusif avec `selectedSlot`). Un clic sur une case déplace tout
le groupe d'un bloc (le premier membre sert d'ancre, le même delta en cases
entières s'applique aux autres — préserve la formation relative ;
`isValidPlacementTile`, extrait du déplacement simple, valide chaque nouvelle
position et annule tout le déplacement si UNE seule échoue, pas de
déplacement partiel). Un clic qui n'aboutit à aucun déplacement valide
DÉSÉLECTIONNE le groupe (demande explicite, "clic gauche dans le vide") —
contrairement à la sélection simple, qui reste active pour réessayer.

**Bug de duplication visuelle combat → placement corrigé** (2026-08-09,
remonté par Antoine avec diagnostic détaillé). Cause : deux systèmes de rendu
séparés (`world.entities`/`unitViews`/`combatOverlay` pour le combat,
`playerPreview`/`placementSlots` pour le placement) qui ne se synchronisaient
qu'au tout DÉBUT de la bataille SUIVANTE (`onValidatePlacement`), jamais à la
FIN de la bataille en cours — les survivants restaient donc rendus à leur
position de combat pendant tout l'écran de fin de vague + la boutique + toute
la phase de placement suivante, en double avec leur aperçu de placement.
Correctif : `world.clear()`/`unitViews.clear()`/`combatOverlay.clear()`/
`projectiles.clear()`/`playerArrowView.clear()` déplacés au moment MÊME de la
victoire/défaite (juste après `applyBattleOutcome`, qui doit lire
`world.entities` avant), pas seulement au lancement de la bataille suivante.
Antoine a suggéré une architecture plus robuste pour la suite (une entité
logique persistante avec état `reserve/placement/combat/dead`, plutôt que
deux systèmes de rendu séparés) — noté comme chantier à part, pas encore fait.

**Fin de run (défaite totale)** — FAIT (2026-08-09, demande d'Antoine, jamais
implémenté avant : "quand plus aucun soldat n'est en vie, la partie doit
s'arrêter et renvoyer au menu principal"). `currentRun.army.length === 0`
après `applyBattleOutcome` (ne peut arriver que sur une défaite totale —
gagner exige au moins un survivant) déclenche `screens.showGameOver()` au
lieu de l'écran de fin de vague normal : pas de boutique, pas de vague
suivante, un seul bouton "Retour au menu principal" (réutilise `onQuit`).

## Chantier inventaire (en cours)

Objectif : un système d'objets utilisables en temps réel PENDANT la bataille
(clic pour armer, clic sur une unité pour cibler), achetés à la boutique,
distinct des achats d'unités/du soin déjà existants. Démarré le 2026-08-09
avec le premier objet : le parchemin de soin mineur.

- `src/data/items.ts` : données pures comme `data/units.ts` — `ItemDef`
  (`id`, `name`, `cost`, `description`, `effect`, `usablePhases`),
  `effect.type` déjà une union extensible (`'heal'` pour l'instant) pour les
  futurs parchemins de bataille/sorts/bombardements de flèches évoqués par
  Antoine. Premier objet : `heal_scroll_minor`, 3 PV (échelle interne ×10) par
  utilisation, coût confirmé à **1 or** (2026-08-10 — corrige le placeholder
  initial à 2 or, jamais confirmé). `usablePhases: GamePhase[]`
  (`'placement' | 'battle'`) ajouté le même jour (demande d'Antoine : "les
  sorts n'auront pas les mêmes conditions d'utilisation") — `heal_scroll_minor`
  vaut `['placement', 'battle']`, un futur sort purement offensif pourra se
  limiter à `['battle']` sans toucher au reste du système.
- `src/run/runState.ts` : `RunState.inventory: OwnedItem[]` (juste un
  `itemId`, pas d'état par instance), `INVENTORY_CAPACITY = 6` (demande
  explicite d'Antoine).
- `src/ui/inventoryBar.ts` : 6 emplacements fixes, positionnés à GAUCHE du
  bloc Boutique/Vendre (`right: 148px` = 16+120+12, calé sur la largeur du
  bloc voisin). Visible pendant le placement (consultation — Antoine :
  "important pour que le joueur puisse avoir la visibilité sur les unités à
  soigner") ET pendant la bataille (utilisation réelle) ; reste visible du
  début du placement jusqu'à `quitToMenu` (ne se cache PAS à
  `onValidatePlacement`, contrairement à `sellZone`, puisque c'est justement
  pendant la bataille qui commence qu'on s'en sert). Clic sur un emplacement
  hors bataille ne fait rien (pas de cible possible pendant le placement).
  Petite animation d'entrée ("un endroit où les objets achetés se glissent",
  demande d'Antoine) rejouée à chaque `refresh()`.
- `src/ui/itemIcons.ts` : icônes en SVG généré par code (même règle "aucun
  asset graphique" que le reste de l'UI) — parchemin roulé (embouts foncés +
  croix verte), un rectangle neutre en repli pour tout objet sans icône
  dédiée pas encore dessinée.
- **Ciblage en temps réel** (`main.ts`) : clic sur un emplacement occupé
  arme l'objet (`armedItemIndex`, re-cliquer désarme) SI la phase actuelle
  (`currentPhase()`, `'placement' | 'battle' | null`) figure dans
  `def.usablePhases` — sinon `armInventorySlot` ne fait rien. En bataille,
  le clic suivant (`handleBattleFireClick`) le consomme en priorité via
  `useArmedItemOnClick` AVANT de tirer la flèche du joueur — raycast contre
  `unitViews.group.children` (tag `userData.entityId`, ajouté dans
  `render/unitViews.ts` pour ce besoin) pour retrouver l'`Entity` visée.
  **Utilisable aussi pendant le placement** (2026-08-10, demande d'Antoine :
  "il faut pour le coup également pouvoir soigner avec le parchemin de soins
  pendant les phases de placement") : `useArmedItemOnPlacementClick`, même
  logique mais cible un `PlacementSlot` via `findHoveredSlot` — écrit le
  nouveau PV à la fois dans `placementSlots[i].hp` (lu par `syncPlacement` et
  par le prochain `world.spawn`) ET `currentRun.army[i].hp` (les deux
  partagent les mêmes index tant qu'on est en placement, voir plus haut) ;
  aucune bataille n'est en cours pour resynchroniser après coup, donc les deux
  doivent être mis à jour explicitement ici. Cible invalide (ennemi côté
  bataille, case vide, unité morte) DÉSARME sans effet plutôt que de laisser
  l'armement en attente indéfiniment (même principe que la désélection de
  groupe en placement). Échap désarme aussi. L'armement est réinitialisé à la
  fin de CHAQUE bataille (`disarmItem()`, dans le même bloc que le nettoyage
  de la vue de combat) — sans ça, un objet armé au moment précis où une vague
  se termine resterait armé pour la bataille suivante.
- **Barres de PV pendant le placement** — FAIT en même temps (demande
  d'Antoine, corrélée au ciblage d'objets : voir la citation ci-dessus).
  `ui/combatOverlay.ts` gagne `syncPlacement(slots)`, séparé de `sync()`
  (utilisé pendant la bataille, indexé par `Entity.id`) : reconstruit
  ENTIÈREMENT ses barres à chaque appel plutôt que de les mettre en cache par
  id comme `sync()` — l'ordre/le nombre d'unités en placement peut changer
  d'un appel à l'autre (vente, achat), un id basé sur l'index de tableau
  serait instable et risquerait d'afficher un nombre de pips périmé pour une
  unité qui a changé de type à cet index. Le nombre d'unités en jeu reste
  petit, la reconstruction complète à chaque frame reste largement assez
  rapide (même logique que `playerPreview`, déjà reconstruit en entier à
  chaque `refreshPlayerPreview`).
- **"Soigner une unité" (boutique) supprimé** — voir plus haut, chantier
  économie.
- **Retour visuel du soin corrigé** (2026-08-10, bug remonté par Antoine :
  "quand je clique sur une unité blessée rien ne se passe"). Le soin
  s'appliquait déjà correctement (`target.hp` bien incrémenté), mais 3 PV sur
  une échelle où 1 pip = `HP_PER_PIP` = 10 ne déplace quasiment jamais le
  nombre de pips affichés (`Math.ceil(hp/10)`) — l'effet était donc réel mais
  invisible la plupart du temps, pas un vrai bug de logique. Ajouté
  `combatOverlay.spawnHealText(x, z, amount)` (même technique que
  `spawnMissText`, texte "+N" flottant vert) pour confirmer l'effet à chaque
  utilisation, indépendamment de la barre de PV. Décision : ne PAS changer le
  montant du soin (3 PV, choix explicite d'Antoine pour un objet "mineur"),
  corriger le retour visuel plutôt que la valeur.
- **Icône qui suit le curseur pendant l'armement** — FAIT (2026-08-10, demande
  d'Antoine : "plus clair" que d'armer sans retour visuel). `InventoryBar`
  affiche l'icône de l'objet armé (`setArmed(index, itemId)`) collée au
  curseur (même technique que le fantôme de vente, `sellZone.ts`) tant qu'un
  objet est en attente de cible.
- Pas encore fait, hors demande explicite pour l'instant : parchemins de
  bataille, sorts, bombardement de flèches ; tout objet sera "très
  certainement déblocable via la progression du jeu" (arbre de talents, pas
  encore réel) — architecture actuelle (catalogue `ITEMS` plat) pas encore
  pensée pour un filtre "débloqué/non débloqué", à anticiper quand le système
  de progression arrivera réellement (Antoine a prévenu explicitement).

## Chantier sauvegarde & progression permanente (en cours)

Démarré le 2026-08-09, suite à une question directe d'Antoine ("y a-t-il un
système de sauvegarde de progression ?" — réponse à l'époque : non, rien ne
persistait, voir l'ancienne note dans "Boucle de jeu"). Demande complète :
qu'une run puisse se terminer tranquillement, le jeu être fermé, et le joueur
retrouve sa progression PERMANENTE (arbre de talents) à la prochaine session
— avec un message confirmant le point de sauvegarde.

Blocage identifié avant de coder : l'arbre de talents n'a encore aucun
contenu réel (juste un bouton de menu vers un écran "à venir"), donc
"sauvegarder l'arbre de talents" n'avait rien de concret à sauvegarder.
Décision prise AVEC Antoine (2 questions posées, réponses ci-dessous) :
construire la plomberie de sauvegarde maintenant, avec un contenu minimal
(un simple compteur de points), plutôt que d'attendre que l'arbre réel soit
conçu — ce dernier reste un chantier séparé, plus gros, à faire ensuite.

- **`src/run/metaProgress.ts`** (nouveau) : `MetaProgress { talentPoints }`,
  distinct de `RunState` (qui reste réinitialisé à chaque nouvelle run,
  voir chantier économie) — celui-ci survit aux sessions via `localStorage`
  (clé versionnée `arrow-tactics.meta-progress.v1`, pour pouvoir migrer le
  format plus tard sans casser une sauvegarde existante, même motif que
  `MapDef.version`). `loadMetaProgress()` retombe sur `{talentPoints: 0}`
  pour toute donnée absente, corrompue, ou de mauvais type (JSON invalide,
  champ manquant/mauvais type, valeur non-objet) — jamais d'exception qui
  bloquerait le démarrage du jeu pour une histoire de sauvegarde.
  `saveMetaProgress()` avale aussi silencieusement une erreur d'écriture
  (navigation privée, quota plein) : un jeu ne doit jamais planter pour ça.
  Vérifié en headless (mock de `localStorage`, 5 cas : vide, cycle
  save/load, JSON corrompu, champ du mauvais type, valeur non-objet).
- **Points de talent gagnés à chaque run TERMINÉE NATURELLEMENT**
  (`TALENT_POINTS_PER_RUN` dans `config/constants.ts`) — montant FIXE par
  run (1 pour l'instant), pas proportionnel à la vague atteinte ni à l'or
  restant : choix explicite d'Antoine pour démarrer simple plutôt que de
  fixer une courbe d'équilibrage avant même que l'arbre réel n'existe pour
  dépenser ces points. Une "run terminée naturellement" = une défaite totale
  (`currentRun.army.length === 0`, seule façon dont une run se termine
  aujourd'hui, voir "Fin de run" plus haut) — déclenché dans `main.ts`, au
  même endroit que `screens.showGameOver()`, JUSTE avant. Confirmé
  explicitement par Antoine : **un abandon manuel** (Échap → Quitter en
  pleine bataille, `quitToMenu`) **ne déclenche rien** — ni gain de point, ni
  sauvegarde — cohérent avec la distinction déjà documentée entre
  "abandonner" et "terminer" une run.
- **Message de confirmation** : `Screens.showGameOver(pointsEarned,
  totalPoints)` (signature étendue) affiche désormais "+N point(s) de talent
  — progression sauvegardée (total : N)." sur l'écran "Partie terminée",
  juste après l'écriture dans `localStorage`.
- **Écran "Arbre de talents" mis à jour** : `Screens.showTalents(progress)`
  (remplace `show('talents')` direct) affiche le total de points actuel —
  aucun nœud à dépenser pour l'instant, mais permet de VÉRIFIER concrètement
  que la sauvegarde traverse bien un rechargement de page, avant même que
  l'arbre réel existe.
- **Contenu réel de l'arbre — FAIT côté données/effets, UI pas encore
  construite** (2026-08-10, vision complète donnée par Antoine après la
  question "quels axes d'amélioration ?"). Structure confirmée : un talent
  RACINE obligatoire ("Or de départ", le "point d'introduction"), puis 3
  branches de spécialisation indépendantes — **Économie**, **Tireur**,
  **Armée** — chacune démarrant avec un seul nœud pour l'instant (`requires`
  pointe déjà vers un id de talent, pas seulement vers la racine : une
  branche pourra s'allonger sans changer la forme des données). Idée notée
  pour PLUS TARD, explicitement PAS construite ("note ça") : une 4e branche
  **Héros**, où le joueur contrôlerait un personnage directement façon MOBA.
  - `src/data/talents.ts` (nouveau, pur comme units.ts/items.ts) :
    `TalentDef` (`id`, `name`, `description`, `cost`, `branch`, `requires`).
    4 talents définis : `or_depart` (racine, coût 1 — choisi pour qu'il soit
    débloquable dès le tout premier point gagné), `tir_rapide` (branche
    Tireur), `butin_de_guerre` (branche Économie), `reflexes_fantassin`
    (branche Armée) — ces 3 derniers coûtent 2 et nécessitent `or_depart`.
    **Coûts et montants d'effet choisis par Claude**, jamais confirmés par
    Antoine au-delà de ce qu'il a explicitement décrit — à rééquilibrer après
    test réel (voir `config/constants.ts`, section Talents, pour chaque
    valeur : `TALENT_STARTING_GOLD_BONUS`, `TALENT_FIRE_RATE_BONUS`,
    `TALENT_PROJECTILE_SPEED_BONUS`, `TALENT_BONUS_GOLD_PER_KILL`,
    `TALENT_FANTASSIN_DODGE_CHANCE`).
  - `src/run/metaProgress.ts` étendu : `MetaProgress.unlockedTalents:
    string[]` en plus de `talentPoints` — format RÉTRO-COMPATIBLE, une
    sauvegarde déjà existante sans ce champ retombe sur `[]` plutôt que de
    tout rejeter (chaque champ validé indépendamment, voir
    `loadMetaProgress`). `isTalentUnlocked`/`canUnlockTalent`/`unlockTalent`
    (achat : vérifie existence, non-déjà-débloqué, prérequis, puis assez de
    points — mute `progress` sans sauvegarder lui-même, comme
    `applyBattleOutcome`). **Un achat de talent doit sauvegarder
    IMMÉDIATEMENT** (`saveMetaProgress` juste après `unlockTalent` dans
    l'UI à venir), contrairement à `talentPoints` gagné qui n'est écrit qu'en
    fin de run — sinon fermer l'onglet juste après un achat perdrait le point
    dépensé sans que rien ne l'ait jamais persisté.
  - **Effets appliqués via la couche "sim ne sait pas pourquoi, juste
    combien"** (voir `sim/entity.ts`, le commentaire déjà présent sur
    `Entity.stats` annonçant ce pipeline) — chaque module de simulation reçoit
    un nombre déjà calculé, jamais un id de talent :
    - `data/units.ts`, `UnitStats.dodgeChance` (nouveau champ, `0` dans les
      deux définitions de base) : chance que la CIBLE esquive un coup qui
      aurait touché, distincte de `missChance` (taux de raté DE
      L'ATTAQUANT). `sim/systems/combat.ts` fait un second jet RNG
      uniquement si `dodgeChance > 0` — les unités sans ce talent consomment
      exactement le même nombre de tirages qu'avant, déterminisme intact.
      Résolu comme un évènement `dodge` distinct de `miss` (2026-08-10) —
      voir libellé "esquivé" séparé ci-dessous.
    - `sim/world.ts`, `World.spawn()` gagne un `statOverrides?:
      Partial<UnitStats>` fusionné par-dessus les stats de base — utilisé
      par `main.ts`, `playerStatOverrides(unitId)`, qui applique
      `TALENT_FANTASSIN_DODGE_CHANCE` uniquement aux fantassins DU JOUEUR
      (jamais aux ennemis) si `reflexes_fantassin` est débloqué. Branché aux
      DEUX sites qui spawnent vraiment des unités joueur
      (`onValidatePlacement`, `setupTestBattle`).
    - `sim/playerArrow.ts`, `fireArrow()` et `sim/world.ts`,
      `World.fireArrowAt()` gagnent des paramètres `cooldown`/`speed`
      optionnels (par défaut les constantes de base) — `main.ts`,
      `effectivePlayerArrowCooldown()`/`effectivePlayerArrowSpeed()`
      calculent la valeur effective (cooldown divisé par `1 +
      TALENT_FIRE_RATE_BONUS`, vitesse multipliée par `1 +
      TALENT_PROJECTILE_SPEED_BONUS`) si `tir_rapide` est débloqué.
    - `run/runState.ts`, `createNewRun(startingGoldBonus = 0)` et
      `applyBattleOutcome(run, entities, bonusGoldPerKill = 0)` gagnent
      chacun un paramètre numérique optionnel, calculé par `main.ts` à partir
      de `or_depart`/`butin_de_guerre` — ce module ne sait toujours pas ce
      qu'est un talent.
  - Vérifié en headless (mock `localStorage`) : séquence d'achat complète
    (racine puis branche, prérequis manquant, points insuffisants, talent
    déjà possédé, id inconnu), `createNewRun` avec/sans bonus,
    `applyBattleOutcome` avec/sans bonus butin, `World.spawn` avec
    `statOverrides`, et un combat synthétique avec `dodgeChance = 1` qui
    force bien un résultat `miss`.
  - **Interface en arbre à branches — FAIT** (2026-08-10, choisie par
    Antoine plutôt qu'une liste de cartes façon boutique). `ui/screens.ts`,
    `buildTalentTree()` : un nœud RACINE en haut, un connecteur SVG en Y qui
    se divise en 3 (coordonnées FIGÉES pour exactement 3 branches — ajouter
    une 4e, par exemple la spécialisation "Héros" notée plus haut, demandera
    de recalculer ce connecteur, pas seulement d'ajouter un nœud), puis une
    rangée de 3 nœuds de branche en dessous, trouvés dynamiquement dans
    `TALENTS` par branche (pas d'id codé en dur dans `screens.ts`, seul
    l'ORDRE des 3 colonnes — économie/tireur/armée — l'est). Chaque nœud est
    un `<button>` dans un état neutre à la construction ; `refreshTalents(progress)`
    (appelée à l'ouverture ET après chaque achat, même motif que `refreshShop`)
    applique l'état réel via 3 classes CSS mutuellement exclusives —
    `--locked` (grisé, jamais cliquable), `--unlockable` (teinte bleue,
    `COLORS.playerZone`, cliquable), `--unlocked` (teinte verte, désactivé,
    pas de rachat possible). `main.ts`, `onUnlockTalent(id)` appelle
    `unlockTalent` + `saveMetaProgress` IMMÉDIATEMENT (pas seulement en fin de
    run, voir plus haut) puis `screens.refreshTalents`. Vérifié en headless
    que les données ont bien exactement 1 racine et 1 nœud par branche.
  - **Libellé "esquivé" distinct de "raté" — FAIT** (2026-08-10).
    `sim/systems/combat.ts`, `CombatEvent.result` gagne la valeur `'dodge'`
    (à côté de `'hit' | 'miss' | 'blocked'`), déclenchée par le jet de
    `dodgeChance` au lieu de réutiliser `'miss'`. `ui/combatOverlay.ts`,
    `spawnMissText`/`spawnHealText` refactorés pour partager une fabrique
    commune `spawnFloatingText(x, z, className, text)` ; nouvelle
    `spawnDodgeText` réutilise la MÊME classe CSS que le miss (poids visuel
    identique, un raté et une esquive sont d'égale importance) mais avec le
    texte "esquivé". `main.ts` branche `event.result === 'dodge'` sur ce
    nouvel appel, à côté du `'miss'` existant. Vérifié en headless
    (`dodgeChance = 1` → `dodge`, `dodgeChance = 0` → `hit`, comportement
    inchangé).
  - **Pas encore fait** : sauvegarder l'état d'une run EN COURS (seule la
    progression permanente persiste — quitter en pleine partie perd toujours
    l'or/l'armée/l'inventaire de la run, comportement voulu, pas un oubli).

## Progression des vagues (règles de difficulté)

Le camp rouge n'a pas une composition fixe reprise à chaque vague — elle
scale avec `RunState.waveNumber` (1 au démarrage d'une run, incrémenté à
chaque victoire dans `applyBattleOutcome`, jamais à la défaite puisqu'une
défaite est toujours une run terminée — voir "Fin de run" plus haut). Le
placement (positions sur le plateau) reste côté rendu : `main.ts`,
`computeEnemyWavePlacements(waveNumber, map)`, même logique de rangées que
`computeArmyFormation` côté joueur, miroir en Z. Remplace `currentMap.enemyUnits`
dans les DEUX endroits qui spawnaient vraiment une bataille du jeu réel
(`startPlacement` pour l'aperçu, `onValidatePlacement` pour le spawn) —
`setupTestBattle()` (raccourci de dev, encore utilisé par "Tester le
scénario" de l'éditeur de maps) continue lui de lire `currentMap.enemyUnits`
tel quel, sans lien avec la progression d'une run réelle : une carte d'éditeur
reste une carte d'éditeur, pas une vague générée.

**Courbe REMPLACÉE le 2026-08-10 (même journée), demande d'Antoine "après
réflexion"** : la première version (linéaire, +1 fantassin jusqu'à la vague
3 puis +1 archer par vague ensuite) jugée pas assez agressive — "je pense que
la difficulté entre les manches doit être franchement grandissante". Vagues
1 à 3 fixées à la main (3 fantassins, puis 5, puis 5 fantassins + 2 archers),
PUIS **doublement complet (effectifs et composition) à chaque vague par
rapport à la précédente**, à partir de la vague 4 — confirmé explicitement
par Antoine avec deux exemples chiffrés (vague 4 = 2× vague 3 = 10 fantassins
+ 4 archers ; vague 5 = 2× vague 4 = 20 fantassins + 8 archers). Formule
récursive, PAS plafonnée — Antoine n'a donné que les vagues 4 et 5 en
exemple, mais la règle généralise naturellement au-delà (vague 6 = 40+16,
vague 7 = 80+32...). `run/runState.ts`, `computeEnemyWaveComposition(wave)` :
cas particuliers pour les vagues 1 et 2, puis `multiplier = 2^(wave-3)`,
`{ fantassin: 5×multiplier, archer: 2×multiplier }` pour vague ≥ 3 (le
multiplicateur vaut 1 à la vague 3 elle-même, ce qui retombe bien sur 5+2
sans cas particulier supplémentaire). Vérifié en headless pour les vagues 1
à 9. `DEFAULT_MAP.enemyUnits` (carte par défaut de l'éditeur, sans lien avec
cette progression — voir plus haut) reste à 1 fantassin, inchangé.

**Risque de performance identifié, pas encore rencontré en pratique** : la
séparation entre unités est en O(n²), "correcte jusqu'à ~100 unités" (voir
"Problèmes connus" plus bas) — hérité d'avant cette courbe. Avec un
doublement pur à partir de la vague 4, le total d'ennemis SEULS dépasse déjà
100 à la vague 7 (112 ennemis), avant même de compter l'armée du joueur. À
surveiller dès les premiers tests réels au-delà de la vague 6-7 : ça peut
devenir un problème de FPS, pas seulement d'équilibrage. Une deuxième limite,
distincte, existe aussi côté mise en page : `computeEnemyWavePlacements`
range les ennemis en rangées de `map.width - 2` (16 sur le plateau par
défaut) dans les `PLACEMENT_ROWS` (7) rangées prévues pour un camp — au-delà
d'un certain nombre de rangées nécessaires (vague 8 en aurait besoin de 14),
les unités générées débordent de la zone ennemie vers la zone neutre, voire
la zone du joueur. Aucune des deux limites n'a encore été corrigée : la
courbe a été implémentée telle que demandée, ces deux points sont à
surveiller/traiter séparément si/quand ils deviennent gênants en jeu réel.

## Étape G (partielle) — prix payé, vagues survécues, tags d'ennemi (2026-08-10)

Suite directe de l'Étape F, sur demande d'Antoine ("attaque ça"). Périmètre
volontairement limité aux talents qui ne dépendaient PAS d'un catalogue de
boutique (le plus gros morceau restant, pas attaqué ici) : Liquidation,
Recyclage, Assurance militaire, Chasseur de primes. Les 7 talents qui
dépendent réellement d'un catalogue d'offres (Marchandage, Client fidèle,
Bonne affaire, Fournisseur, Contrat militaire, Marché noir, Maître marchand)
restent `pending-system`, non traités — chantier séparé, plus invasif côté
UI boutique.

- **`run/runState.ts`, `OwnedUnit`** gagne `pricePaid`/`wavesSurvived`.
  `pricePaid` fixé à l'achat (les 3 handlers boutique dans `main.ts`) ; le
  fantassin de départ d'une run (`createNewRun`) reçoit le prix catalogue
  actuel plutôt que 0, pour un calcul de revente cohérent. `wavesSurvived`
  incrémenté de 1 pour chaque survivant à chaque VICTOIRE dans
  `applyBattleOutcome` (jamais sur une défaite, qui de toute façon termine
  toujours la run — voir plus haut).
- **Revente d'unité reconçue** : `KILL_REWARD` (table plate par TYPE) ne sert
  plus qu'aux récompenses de kill sur les ENNEMIS. La revente d'une unité du
  JOUEUR (`main.ts`, `sellUnit`) passe désormais par
  `run/talentEffects.ts`, `computeResaleValue(unit, progress)` : taux de
  base `BASE_RESALE_RATE` = 50 % (vérifié headless : coïncide exactement
  avec les anciennes valeurs de `KILL_REWARD` pour les 3 unités existantes —
  ce changement de base de calcul ne modifie donc RIEN tant qu'aucune remise
  d'achat n'existe encore, prix payé = prix catalogue partout aujourd'hui)
  appliqué à `pricePaid`, plus points de pourcentage de **Liquidation**
  (+15/+30pp), plafonné à `RESALE_RATE_CAP` = 90 %, plus bonus FLAT de
  **Recyclage** (+1 si ≥2 vagues survécues, +2 au total si ≥4 — rang 2
  n'annule pas le palier de rang 1). Le total final ne dépasse jamais
  `pricePaid`, garde-fou explicite d'Antoine ("pas de profit infini
  achat/vente"), vérifié headless avec des valeurs volontairement poussées à
  l'excès pour le confirmer.
- **Assurance militaire** : nouveau hook `TalentEconomyHooks.onUnitDeath`,
  appelé dans `applyBattleOutcome` pour chaque unité JOUEUR morte CETTE
  bataille (avant sa suppression de `run.army`) — inconditionnel (s'applique
  même sur une défaite totale, comme les récompenses de kill), jamais sur
  une vente (chemin de code séparé) ni plus d'une fois par unité (une unité
  morte ne réapparaît jamais). "Première bataille" = `wavesSurvived === 0`
  au moment de la mort. Rembourse 25 %/50 % du prix payé (arrondi au sol,
  minimum 1 or si le prix payé ≥ 2 et le calcul donnerait 0).
- **Chasseur de primes** : `data/units.ts`, `UnitDef.enemyTier?: 'elite' |
  'miniboss'` (nouveau champ générique, absent partout aujourd'hui —
  **aucune unité actuelle n'a ce tag**, conformément à l'instruction
  explicite d'Antoine de ne pas fabriquer de faux contenu). Le calcul
  (`run/talentEffects.ts`, `chasseurDePrimesBonus`) est branché et correct,
  marqué `implementationStatus: 'ready'` dans `data/talents.ts` malgré son
  absence d'effet pratique — la lacune restante est du CONTENU (de vraies
  unités élite/mini-boss dans le bestiaire), pas du code, donc le talent
  s'activera de lui-même le jour où ce contenu existera, sans retouche.
  `bonusGoldPerKill` (hook) prend maintenant `unitId` en paramètre pour
  permettre cette vérification — signature changée en conséquence.
- Vérifié en headless (script temporaire, supprimé après usage) : chaque
  combinaison de taux de revente (base seule, Liquidation rang 1/2, plafond
  appliqué au prix réellement payé et non au catalogue), Recyclage à ses 2
  paliers sans que le rang 2 supprime le rang 1, le garde-fou "jamais plus
  que le prix payé" avec des valeurs extrêmes, Assurance militaire à ses 2
  rangs (dont le minimum 1 or et le refus si `wavesSurvived > 0`), Chasseur
  de primes confirmé à 0 sur toutes les unités actuelles (aucune n'a de
  `enemyTier`), et un test d'intégration bout en bout via
  `applyBattleOutcome` avec deux unités qui meurent (une remboursée par
  Assurance militaire, l'autre non car déjà vétéran).

**Reste `pending-system`** : Marchandage, Client fidèle, Bonne affaire,
Fournisseur, Contrat militaire, Marché noir, Maître marchand (catalogue de
boutique à construire) ; Trésor de guerre (effet non défini) ; Seigneur de
guerre (dépend de Trésor de guerre via son `anyOf`).

## ROLLBACK — retour à une base simple (2026-08-10, même journée)

**Tout ce qui précède dans cette section (le "Chantier arbre de talents",
Étapes A à G, l'arbre Économie à 21 nœuds) a été ABANDONNÉ et retiré du jeu
jouable**, sur décision explicite d'Antoine après avoir vu le système
fonctionner en jeu réel : trop de talents mineurs, trop de petits rangs,
trop de prérequis — pas un problème d'équilibrage à corriger, un problème de
philosophie à remplacer. Conservé comme historique de conception (pourquoi
ces choix ont été faits, ce qui a été essayé), **pas comme description de
l'état actuel du code**.

**Nouvelle philosophie (remplace l'arbre à points)** : progression par
PALIER DE VAGUE plutôt que par point gagné à chaque run. À chaque palier
important, exactement DEUX talents proposés, le joueur en choisit un, l'autre
est perdu pour cette progression (pas de respec prévu). Un palier se
débloque en battant son propre RECORD de vague (`highestWaveReached`),
jamais en répétant la même vague plusieurs fois — mourir à la vague 5 dix
fois ne donne rien de plus que d'y mourir une fois. Objectif de longévité
inchangé (20-30 runs pour une progression majeure), mais obtenu par la
difficulté croissante des vagues + l'exigence de battre son record, pas par
une quarantaine de petits points à farmer.

**Ce qui a été conservé, sur demande explicite d'Antoine** ("je veux
uniquement garder les trois talents fondateurs et le nom des spécialisations
restera le même") :
- Le talent universel `or_depart` et les 3 fondateurs `butin_de_guerre`
  (Économie), `tir_rapide` (Précision), `reflexes_fantassin` (Armée) — avec
  leur mécanisme D'ORIGINE (spécialisation exclusive et permanente,
  confirmation avant achat d'un fondateur). Ce mécanisme n'est PAS le
  nouveau système à paliers : c'est un héritage gardé tel quel pour
  l'instant, explicitement PAS raccroché à l'idée qu'il "débloque ensuite
  trois immenses spécialisations" — à reconsidérer ensemble quand le contenu
  des paliers sera conçu. `data/talents.ts` réduit à ces 4 entrées, forme de
  `TalentDef` simplifiée (retour à un `cost` unique, plus de rangs/tiers/
  `allOf`/`anyOf` — plus aucun talent n'en a besoin).
- Les noms de spécialisation Économie/Précision/Armée, comme AXES
  THÉMATIQUES futurs (`TalentChoiceDef.category`, optionnel) — sans qu'une
  catégorie impose une exclusivité de branche pour le nouveau système.
- Le format de sauvegarde versionné et son pattern de chargement défensif
  (`run/metaProgress.ts`), le principe des hooks économiques calculés par
  `main.ts` et consommés sans connaissance du talent par `run/runState.ts`.
- `data/units.ts` (`enemyTier`) et `sim/world.ts` (`World.rollFloat`) ont
  été RETIRÉS malgré leur généricité : plus aucun consommateur une fois
  Chasseur de primes/Pillage supprimés — code mort, pas une architecture
  "utile indépendamment des talents" tant que rien ne les utilise. Triviaux
  à réintroduire si un futur talent en a besoin.

**Ce qui a été retiré du jeu jouable** (données, UI ET effets runtime — pas
seulement caché derrière l'interface) :
- Les 20 talents mineurs de la branche Économie et toute leur logique
  (`pillage`, `marchandage`, `liquidation`, `fonds_de_campagne`,
  `chasseur_de_primes`, `prime_de_victoire`, `client_fidele`, `recyclage`,
  `interets`, `bonne_affaire`, `fournisseur`, `assurance_militaire`,
  `contrat_militaire`, `prime_de_risque`, `speculateur`, `marche_noir`,
  `tresor_de_guerre`, `profiteur_de_guerre`, `maitre_marchand`,
  `seigneur_de_guerre`).
- L'UI d'arbre à paliers/tiers/rangs multiples dans `ui/screens.ts`
  (`buildBranchColumn`, nœuds compacts, tooltips par rang) — l'écran
  "Arbre de talents" est revenu à sa forme simple (racine + 3 fondateurs),
  avec une nouvelle section honnête au-dessus ("Meilleure vague atteinte :
  X", "Nouveau système de talents en cours de conception") plutôt qu'un faux
  arbre de 60 nœuds qui ne ferait plus rien.
- `RunState.speculativeStreak`/`waveStartWasSpeculative`/`purchasedInShop`,
  `OwnedUnit.pricePaid`/`wavesSurvived` — plus aucun consommateur.
- La revente d'unité (`main.ts`, `sellUnit`) et les récompenses de kill sont
  REVENUES à `KILL_REWARD`, la table plate d'origine (`run/runState.ts`) —
  `BASE_RESALE_RATE`/`RESALE_RATE_CAP`/`computeResaleValue` retirés.
- **Le gain automatique d'un point de talent à chaque run terminée
  (`TALENT_POINTS_PER_RUN`) a été supprimé purement et simplement** — c'est
  la règle centrale de la nouvelle philosophie ("mourir ou terminer une run
  ne garantit pas automatiquement un point de talent"). Conséquence
  assumée : les 4 talents hérités ne sont plus alimentés par aucune nouvelle
  source de points tant que le nouveau système n'a pas de vrai contenu de
  palier à récompenser — un solde déjà existant reste dépensable, mais
  personne ne peut plus en gagner de nouveaux pour l'instant. C'est un état
  transitoire assumé, pas un oubli.

**Nouveau système, SQUELETTE seulement (voir section 19 de la demande
d'Antoine : ne pas inventer de contenu)** :
- `data/talents.ts` : `TalentTierDef { id, waveRequirement, choices: [id,
  id] }` et `TalentChoiceDef { id, name, description, category? }` — types
  définis, `TALENT_TIERS`/`TALENT_CHOICES` VIDES. `waveRequirement` est une
  DONNÉE par palier, jamais une constante figée dans le moteur — Antoine
  veut pouvoir équilibrer la cadence des paliers sans toucher au code.
- `run/metaProgress.ts` : `MetaProgress.highestWaveReached` (ne recule
  jamais), `unlockedTierIds` (paliers déjà résolus), `choicesMade` (tierId
  → id du choix fait), `pendingTierId` (palier atteint mais pas encore
  résolu — pas de "point à dépenser", la récompense d'un palier est
  directement un choix, conforme à la demande explicite d'Antoine).
  `registerWaveReached(progress, waveNumber)` : met à jour le record si
  battu, fait apparaître un `pendingTierId` si un seuil de `TALENT_TIERS`
  vient d'être franchi — un NO-OP aujourd'hui puisque `TALENT_TIERS` est
  vide, prêt à s'activer sans retouche le jour où du contenu existera.
  **Question ouverte, pas tranchée** : si une run franchit plusieurs seuils
  de palier d'un coup avant que le premier soit résolu, `pendingTierId`
  (singulier) ne peut retenir que le PLUS BAS palier non résolu — à
  reconsidérer (`pendingTierIds: string[]` ?) si Antoine préfère une file
  d'attente.
- `main.ts` : `registerWaveReached` appelé à CHAQUE bataille réelle (pas
  seulement en fin de run), win ou perte — "atteindre" une vague ne demande
  pas de la gagner, mourir à la vague 7 compte déjà comme record 7. Jamais
  appelé par `setupTestBattle` ("Tester le scénario" de l'éditeur).
  `Screens.showGameOver` affiche désormais "Meilleure vague atteinte : X"
  au lieu de "+N point de talent".
- **Migration** (`run/metaProgress.ts`, `migrateToV2`) : toute sauvegarde
  sans `talentTreeVersion === 2` (donc l'ancien arbre à 21 nœuds ET le tout
  premier prototype, aucun des deux n'a de correspondance sensée vers le
  nouveau système) est réinitialisée sur sa progression de TALENTS
  uniquement — `unlockedUnits` (déblocage du Cavalier, sans rapport avec les
  talents) est explicitement PRÉSERVÉ pendant cette migration, jamais
  effacé. Distinct du bouton "Effacer la sauvegarde"
  (`resetMetaProgress`) : celui-là reste un reset TOTAL et volontaire,
  `unlockedUnits` y est bien remis à zéro aussi, comme avant.
- Vérifié en headless (script temporaire, supprimé après usage) : migration
  depuis les deux anciens formats (talents/points effacés, Cavalier
  préservé), le mécanisme d'exclusivité des 4 talents hérités toujours
  fonctionnel, `registerWaveReached` (record qui progresse, ne recule
  jamais, aucun palier ne s'active tant que `TALENT_TIERS` est vide), les
  effets économiques réduits à `or_depart`/`butin_de_guerre` uniquement
  (plus aucune trace de Pillage/Intérêts/etc. dans `applyBattleOutcome`),
  `OwnedUnit` qui ne porte plus `pricePaid`.

**Pas encore fait, explicitement pas pour maintenant** (section 19 de la
demande : le design se fera "ensemble") : le contenu réel des paliers
(combien, à quelles vagues, quels choix A/B, quels effets), l'UI du choix
A/B (section 9 : présentation verticale espacée, plus de forêt de 60
icônes), la décision sur `pendingTierId` singulier vs file d'attente, et le
rôle final du talent universel/des 3 fondateurs vis-à-vis du nouveau système
de paliers (gardés "pour l'instant" tels quels, pas fusionnés).

## Carte de campagne "vague1-20" (2026-08-10)

Antoine a fourni un export JSON de l'éditeur de maps (`vague1-20.json`,
depuis `C:\Users\Antoine\Desktop\Projet prodolphe`) : "la map qui sera
disponible jusqu'à la vague 20, après on changera de map pour le mode
survie". `config/mapDef.ts`, `CAMPAIGN_OBSTACLES` (nouveau, 102 obstacles —
arbres/rochers/décors) remplace `OBSTACLES` (`config/constants.ts`, gardée
telle quelle mais plus lue ici) comme décor de `DEFAULT_MAP` — c'est donc
désormais la carte réellement utilisée en jeu (`main.ts`, `currentMap`) ET
la carte de départ de l'éditeur. `MapDef.name` renommé `'vague1-20'` (pure
métadonnée, sert seulement de nom de fichier au réexport). Largeur/hauteur
identiques (18×26) à l'ancien décor, donc `playerUnits`/`enemyUnits`
réutilisent EXACTEMENT les mêmes formules que l'ancien `buildDefaultMap`
(le fichier fourni les laissait vides — il ne contenait que du décor placé
dans l'éditeur) ; pour rappel ces deux tableaux ne pilotent plus le jeu réel
depuis le chantier économie (formations calculées dynamiquement), seulement
l'éditeur et `setupTestBattle()`. Build propre ; nombre d'obstacles vérifié
identique entre le JSON source et la constante TS (102 des deux côtés).

**Pas encore fait, explicitement pour plus tard** : le changement de carte
au-delà de la vague 20 pour un "mode survie" — mécanisme qui n'existe pas
du tout aujourd'hui (une seule carte pour toute la durée d'une run,
`currentMap` ne varie jamais avec `run.waveNumber`). Antoine fournira la
seconde carte le moment venu ; ne pas anticiper la logique de bascule
avant d'avoir les deux cartes ET une décision sur ce que "mode survie"
signifie concrètement (déjà noté comme non spécifié dans "Où on en est").

## Vrai pathfinding en grille pour la poursuite de cible (2026-08-10)

Malgré les deux correctifs précédents (visibilité entité→coin, dégagement
conscient des obstacles), Antoine constate en jeu réel (capture d'écran,
vague 3) que certaines unités restent bloquées **toute la manche** près des
arbres, et tranche explicitement : "il faut revoir ce comportement, la
vraie amélioration demanderait un système de pathfinding." Plutôt que de
continuer à corriger l'évitement réactif coin-par-coin (fondamentalement
limité : il ne voit qu'un obstacle "meilleur coin" à la fois, sans vue
d'ensemble du plateau — un cul-de-sac en U/C autour d'une cible, par
exemple, lui est structurellement insoluble), un vrai calcul de trajectoire
remplace ce mécanisme pour la poursuite d'une cible verrouillée.

- **`sim/pathfinding.ts`** (nouveau) : grille alignée sur les cases du
  plateau (`TILE = 1`), une case bloquée = un obstacle quelconque la
  recouvre (même règle que la collision physique et le placement, sans
  marge d'évitement — la grille sert à une route GROSSIÈRE qui évite les
  vrais murs, la précision fine reste gérée par le mouvement local
  existant). `buildPathGrid(obstacles, boardWidth, boardHeight)` :
  reconstruite une fois par appel à `movementSystem` (pas par sous-passe ni
  par unité), `O(obstacles)`, négligeable à 30 Hz. `findPath(grid, fromX,
  fromZ, toX, toZ)` : A* 8 directions, coût euclidien, anti-coupe-de-coin
  (une diagonale n'est autorisée que si les deux cases orthogonales
  adjacentes sont libres aussi) — renvoie une liste de points monde (centres
  de case) du premier pas jusqu'à l'arrivée, ou `null` si aucune route
  n'existe. Repli sur la case libre la plus proche (recherche en anneaux
  concentriques) si la case de la cible elle-même est bloquée (cible collée
  contre un arbre).
- **`sim/entity.ts`**, `Entity` gagne `path`/`pathGoalTileX`/`pathGoalTileZ` —
  le chemin en cache et la case de cible au moment du calcul (sert à
  détecter qu'il faut recalculer). `steerX`/`steerZ` restent utilisés mais
  UNIQUEMENT pour la marche neutre désormais (voir plus bas).
- **`sim/systems/movement.ts`**, `pursueTargetWithPathfinding` (nouveau,
  remplace l'appel à `pursueTowards` pour la poursuite d'une cible
  verrouillée) : chemin direct dégagé → cas majoritaire, aucun calcul de
  grille, coût identique à avant ; chemin direct bloqué → suit un chemin en
  cases, jamais recalculé tant qu'il reste valide (absent, épuisé, ou cible
  ayant changé de case). `pursueTowards`/`findSteeringPoint` (évitement
  réactif local, avec les 2 correctifs précédents) restent utilisés
  UNIQUEMENT pour la MARCHE NEUTRE (aucune cible verrouillée — un point
  sonde quelques cases devant, pas une vraie destination fixe, se prête mal
  à un calcul de route complet) et comme repli si `findPath` ne trouve
  vraiment aucune route. `e.path` est explicitement vidé (recalcul forcé à
  la reprise) dans les branches dash/unstick/sidestep, qui déplacent
  l'unité de façon abrupte et invalideraient un chemin en cache.
- Vérifié en headless (script temporaire, supprimé après usage) :
  - Chemin simple autour d'un mur : trouvé, ne traverse jamais l'obstacle.
  - **Cul-de-sac en C** (cible à l'intérieur d'un mur en U, accessible
    seulement par un très long détour) : réussi en ~10s — un test conçu
    spécifiquement pour être IMPOSSIBLE à résoudre par l'ancien évitement
    coin-par-coin (aucune vue d'ensemble), qui aurait tourné indéfiniment
    autour de l'ouverture sans jamais comprendre qu'il faut faire tout le
    tour. Preuve directe que ceci est un vrai changement de capacité, pas
    un réglage de plus.
  - Bosquet dense de la carte "vague1-20", 6 unités simultanées : les 6
    arrivent, temps légèrement amélioré par rapport aux correctifs
    précédents (max ~10.8s contre ~11.1s) — le gain principal n'est pas la
    vitesse sur CE cas déjà corrigé, mais la robustesse structurelle sur des
    cas que l'ancien système ne pouvait pas résoudre du tout.
  - Performance : 120 calculs de chemin indépendants (pire cas irréaliste —
    aucune réutilisation de cache, correspond à peu près à la vague 7 de la
    courbe de difficulté actuelle, 112 ennemis) en ~10ms total, très
    largement sous le budget d'un tick à 30 Hz (33ms) — et en pratique
    l'immense majorité des unités réutilisent un chemin déjà calculé sans
    aucun nouveau calcul.
- **Limite honnête, inchangée dans son principe** : la grille n'a pas de
  marge d'évitement (contrairement à l'ancien `OBSTACLE_AVOIDANCE_MARGIN`) —
  elle donne une route grossière case par case, pas un chemin lissé ; le
  mouvement fin (séparation, évitement de collision) reste géré comme avant
  une fois le prochain point de cheminement visé. Si un chemin "en escalier"
  trop anguleux se voit à l'usage, un lissage de trajectoire (line-of-sight
  entre points non consécutifs du chemin) serait l'amélioration naturelle
  suivante — pas fait ici, pas demandé.

## Correctif de contournement d'obstacles denses (2026-08-10)

Antoine, en testant la carte "vague1-20" : les fantassins "ont une tendance
à rester bloqués dans les arbres ou ont du mal à contourner les arbres pour
joindre le champ de bataille" — capture d'écran à l'appui. Cause racine :
`sim/systems/movement.ts` a été écrit et validé contre le décor par défaut
d'origine, où chaque rocher/arbre est ISOLÉ des autres — la nouvelle carte
contient des bosquets DENSES (plusieurs arbres 1x1 quasi adjacents, ex. 5
arbres formant un bloc presque solide en x:[-5,-3], z:[-1,2]), un cas jamais
rencontré ni testé jusque-là. Deux bugs distincts identifiés et corrigés,
tous les deux invisibles sur un décor clairsemé mais réels sur un décor
dense :

1. **`findSteeringPoint`** ne vérifiait la visibilité dégagée que dans le
   sens "coin → cible", jamais "unité → coin". Sur un décor clairsemé, un
   coin proche est presque toujours atteignable en ligne droite depuis
   l'unité, donc ça ne se voyait jamais. Sur un bosquet dense, le "meilleur"
   coin (au sens de la distance totale) pouvait n'être atteignable QUE
   depuis l'autre côté d'un arbre voisin — l'unité visait un point
   inatteignable en ligne droite, heurtait cet arbre voisin en chemin, se
   faisait repousser par `resolveObstacleCollisions`, et recalculait
   souvent le même coin inatteignable au tick suivant. Corrigé en testant
   la visibilité dans les DEUX sens (`unité → coin` ET `coin → cible`),
   contre tous les obstacles du plateau — même principe déjà appliqué au
   sens `coin → cible`, juste étendu symétriquement.
2. **`triggerUnstick`** (le filet de secours qui se déclenche après
   `STUCK_DURATION`/`ORBIT_CHECK_DURATION` d'immobilité) choisissait son
   côté de dégagement UNIQUEMENT selon l'encombrement d'alliés proches,
   sans aucune conscience des obstacles. Sur un bosquet dense, le côté "le
   moins encombré d'alliés" pouvait être exactement celui qui fonce dans
   l'arbre à l'origine du blocage — la manœuvre de dégagement échouait,
   redéclenchant le même blocage au tick suivant, indéfiniment (confirmé en
   headless : une unité restait bloquée après 30 secondes simulées malgré
   de multiples tentatives). Corrigé : `triggerUnstick` reçoit maintenant
   `obstacles` et sonde les deux côtés candidats (`sideBlockedByObstacle`,
   même distance que le déplacement réel de la phase 2) — si un seul côté
   est dégagé, il l'emporte TOUJOURS, quel que soit l'encombrement d'alliés
   ; si les deux sont dégagés ou bloqués, retombe sur l'ancien critère.
- Vérifié en headless (script temporaire, supprimé après usage) avec le
  bosquet EXACT de la carte "vague1-20" : un scénario à 6 unités convergeant
  vers une cible de l'autre côté du bosquet laissait AVANT le correctif une
  unité définitivement bloquée (30s simulées sans y arriver) ; après le
  correctif, les 6 arrivent (~7 à 11s selon leur position de départ). Testé
  aussi à 10 et 15 unités en formation serrée : aucun blocage. Ces deux
  correctifs n'affectent PAS le comportement sur le décor clairsemé
  d'origine (les conditions supplémentaires ne se déclenchent que quand
  elles changent réellement le résultat, jamais un cas déjà géré avant).
- **Limite honnête** : ceci reste un évitement RÉACTIF local (pas un vrai
  pathfinding/navmesh) — sur un bosquet EXTRÊMEMENT dense (aucune case
  libre du tout dans un rayon donné), aucun correctif réactif ne remplacera
  un vrai système de pathfinding. Si des blocages persistent malgré ce
  correctif sur des bosquets encore plus compacts, ce serait le signal
  qu'il faut soit espacer un peu le décor le plus dense dans l'éditeur,
  soit entamer un chantier de pathfinding séparé (plus lourd).

**Suite (même journée) : plus de blocage permanent, mais Antoine observe
encore quelques secondes de "collage" visible près des arbres.**
`STUCK_DURATION` (1.0→0.5s) et `ORBIT_CHECK_DURATION` (4.0→2.0s,
`ORBIT_PROGRESS_THRESHOLD` réduit à 0.15 en proportion) réduits pour que le
filet de secours réagisse plus vite quand une unité stagne vraiment —
`triggerUnstick` étant désormais fiable près d'un obstacle, déclencher plus
tôt ne fait que réduire le temps où l'unité semble "collée", sans risque de
faux positif supplémentaire.

**Mesure honnête après ce réglage** (headless, même bosquet) : le temps
total pour qu'une unité contourne le bosquet et rejoigne sa cible reste de
l'ordre de 7 à 12 secondes selon sa position de départ, quasi INCHANGÉ par
le réglage des délais — et testé aussi quasi IDENTIQUE en espaçant le
bosquet d'une case supplémentaire entre chaque arbre (10-10s vs 11s de
maximum). Conclusion : le filet de secours (stuck/orbit) ne semble PAS être
le facteur dominant restant — le temps observé correspond surtout au coût
INHÉRENT du contournement réactif coin-par-coin sur une vraie distance de
détour (~4-5 cases pour ce bosquet), pas à un blocage caché. Autrement dit,
resserrer encore les délais de sécurité n'aidera probablement plus
beaucoup : une amélioration nette supplémentaire demanderait un vrai
système de pathfinding (calcul de trajectoire globale plutôt que
coin-par-coin réactif), chantier séparé et plus lourd, pas fait ici.
Recommandation pratique immédiate si le rythme ressenti en jeu reste trop
lent : réduire la PROFONDEUR du détour (bosquets moins larges/moins longs
plutôt que moins denses) plutôt que l'espacement interne, qui n'a pas
montré d'effet net dans cette mesure.

## Retrait du système de paliers à record de vague (2026-08-10)

En testant, Antoine constate qu'aucun point de talent ne s'attribue jamais
("il faut faire mieux que la dernière run pour le débloquer") et demande
explicitement : "retire pour l'instant ce système-là, il ne fonctionnera
pas de la sorte. C'est moi qui établirait à quelle vague le prochain point
de talents est disponible." Diagnostic exact : ce n'était pas un bug du
mécanisme "record" en tant que tel — `TALENT_TIERS` était simplement VIDE
(aucun contenu de palier conçu, comme documenté), donc rien ne pouvait
jamais se débloquer, indépendamment de la performance du joueur. Antoine
rejette néanmoins le principe même de gating par record et demande un
mécanisme plus direct.

- **Retiré entièrement** : `TalentTierDef`/`TalentChoiceDef`/`TALENT_CHOICES`/
  `TALENT_TIERS`/`getTalentChoice` (`data/talents.ts`) et
  `unlockedTierIds`/`choicesMade`/`pendingTierId` (`run/metaProgress.ts`) —
  le système "palier à 2 choix, débloqué en battant son record" n'existe
  plus du tout, ni comme mécanisme actif ni comme squelette en attente.
- **Remplacé par** : `run/metaProgress.ts`, `TALENT_POINT_WAVES: number[]`
  — une simple LISTE de numéros de vague choisis explicitement par Antoine
  ("c'est moi qui établirait..."), chacun accordant un point de talent
  PLAT (alimente `talentPoints`/`unlockedTalents`, le système hérité à 4
  talents) la première fois qu'il est atteint — `waveNumber >= seuil`,
  jamais une seconde fois (`MetaProgress.claimedWaveRewards`, empêche de
  regagner le même point en retraversant la vague dans une run future).
  Valeur de départ **provisoire, choisie par Claude** : `[1]` (vague 1),
  uniquement pour que le tout premier point reste testable immédiatement —
  Antoine ajustera cette liste lui-même selon son propre équilibrage.
- `MetaProgress.highestWaveReached` **conservé** mais réduit à une pure
  statistique affichée dans l'écran de talents ("Meilleure vague atteinte :
  X") — ne bloque plus rien, ne conditionne plus aucun gain.
- `registerWaveReached(progress, waveNumber)` : met à jour le record ET
  accorde les points de `TALENT_POINT_WAVES` nouvellement atteints, retourne
  `true` si quoi que ce soit a changé (pour savoir s'il faut sauvegarder) —
  appelé au même endroit qu'avant dans `main.ts` (à chaque bataille réelle
  résolue, gagnée ou perdue, jamais depuis "Tester le scénario").
- Vérifié en headless (script temporaire, supprimé après usage) : premier
  point accordé à la vague 1, aucun point supplémentaire en retraversant la
  même vague dans une run ultérieure (pas de farming), persistance correcte
  du point et de la liste de vagues déjà réclamées.

## Début de partie adouci (2026-08-10)

Antoine, satisfait du pathfinding ("ça fonctionne nettement mieux") :
"réduire de 1 soldat de la manche un jusqu'à la 4ème". `run/runState.ts`,
`computeEnemyWaveComposition` — un fantassin de moins sur les vagues 1 à 4
(3→2, 5→4, 5+2a→4+2a, 10+4a→9+4a), calculé en soustrayant 1 à la formule de
base plutôt qu'en la remplaçant, pour que les **vagues 5+ restent
totalement inchangées** (toujours 20f+8a, 40f+16a...). Conséquence
secondaire assumée : "vague 5 = 2× vague 4" ne tient plus exactement à
l'unité près juste après cette réduction (vague 4 vaut maintenant 13 au
lieu de 14, vague 5 reste 28) — la réduction ne visait que l'entrée en
matière, pas la courbe de progression long terme. Vérifié en headless.

## Premier seuil de point de talent fixé à la vague 4 (2026-08-10)

Antoine tranche la valeur provisoire laissée par Claude : "le premier point
de talent est disponible à la vague 4 ! [...] il faut que ce point ne
s'attribue que lors de notre premier passage à la vague 4 (réussite de la
vague 3)". `run/metaProgress.ts`, `TALENT_POINT_WAVES = [4]` (au lieu de
`[1]`). Point d'implémentation important : `registerWaveReached` est
maintenant appelé depuis `main.ts` avec `currentRun.waveNumber` lu APRÈS
que `applyBattleOutcome` l'a éventuellement incrémenté — PAS
`waveBeingFought` (la vague qui vient d'être jouée, capturée avant
l'incrément) comme avant. Sur une victoire de la vague 3, `waveNumber`
passe à 4 : c'est bien cette valeur post-incrément qui doit être comparée
au seuil pour que "vague 4" corresponde à "on se retrouve sur la vague 4"
(donc à la réussite de la vague 3), pas à "il faut aussi gagner la vague
4". Sur une défaite, `waveNumber` n'a pas bougé — le comportement reste
identique à avant sur ce cas. Vérifié en headless : aucun point avant la
vague 4, un seul point accordé à l'arrivée sur la vague 4, aucun second
point en repassant par la vague 4 dans une run ultérieure.

## Premier point de talent garanti après la toute première run (2026-08-10)

Après un premier test réel : Antoine a lancé une run, elle s'est terminée
(défaite) à la vague 2, et il n'a reçu aucun point de talent — normal avec
`TALENT_POINT_WAVES = [4]` (voir section ci-dessus), mais jugé pas naturel :
"le premier point de talent lui n'est pas de checkpoint de numéro de vague
pour être gagné, il doit simplement être gagné après la première run que je
lance sur ma sauvegarde. Ensuite les points de talents se gagneront après
avoir terminé des numéros de vagues." Mécanisme SÉPARÉ et cumulable avec
`TALENT_POINT_WAVES`, pas un remplacement du seuil vague 4 pour les points
suivants — celui-ci reste inchangé.

- `run/metaProgress.ts` : `MetaProgress.firstRunPointGranted: boolean`
  (nouveau champ, `false` par défaut y compris pour une sauvegarde existante
  sans ce champ — lu comme `obj['firstRunPointGranted'] === true` dans
  `loadMetaProgress`, jamais une exception pour un ancien format). Nouvelle
  fonction `grantFirstRunPointIfNeeded(progress)` : accorde 1 point et pose
  le flag SEULEMENT s'il n'a jamais été accordé, retourne si un point vient
  d'être donné (pour savoir s'il faut sauvegarder) — sans lien avec
  `registerWaveReached`/`claimedWaveRewards`, aucun des deux mécanismes ne
  regarde l'état de l'autre.
- `main.ts` : `grantFirstRunPointIfNeeded(metaProgress)` appelé dans le même
  bloc que `showGameOver` (`currentRun.army.length === 0`, la seule vraie fin
  de run, voir "Fin de run" plus haut) — "terminée" veut dire une défaite
  totale, peu importe la vague atteinte ; un abandon manuel (Échap →
  Quitter) ne déclenche toujours rien, cohérent avec le reste de la
  progression permanente. Sauvegarde immédiate si le point vient d'être
  accordé, comme `registerWaveReached` juste au-dessus dans le code.
- `resetMetaProgress` remet aussi `firstRunPointGranted` à `false` (nouvelle
  sauvegarde effacée = comme si aucune run n'avait jamais été jouée).
- Vérifié en headless (mock `localStorage`) : sauvegarde fraîche à 0 point/
  flag `false` ; fin de première run à la vague 2 (le scénario réel
  d'Antoine) accorde bien 1 point malgré `TALENT_POINT_WAVES = [4]` non
  atteint ; le flag persiste après rechargement ; une deuxième fin de run
  n'accorde pas de second point via ce mécanisme ; atteindre ensuite la
  vague 4 accorde bien un point SUPPLÉMENTAIRE via `registerWaveReached`
  (total 2, les deux mécanismes s'additionnent sans interférer). Build
  propre.

## Toast "point de talent disponible" (2026-08-10)

Demande d'Antoine : "il faudrait afficher un message, une pop up lorsqu'un
nouveau point de talent est disponible" — jusque-là, un point gagné
(première run ou seuil de vague, voir les deux sections ci-dessus) n'était
visible qu'en ouvrant l'écran "Arbre de talents" soi-même, aucun retour au
moment où il est réellement accordé. Question posée à Antoine sur le style
(toast discret auto-disparaissant / pop-up modale à fermer / juste enrichir
l'écran déjà affiché) — a choisi le **toast discret**, pour ne pas casser le
séquencement bataille → boutique déjà en place (voir "Séquencement de la fin
de vague" plus haut).

- `src/ui/talentPointToast.ts` (nouveau) : `TalentPointToast`, même patron
  qu'`WaveIndicator`/`WaveTransition` — un seul élément HTML créé une fois,
  jamais recréé, `show(count)` bascule une classe CSS (`talent-point-toast--visible`)
  pour le fondu d'entrée/sortie plutôt qu'un ajout/retrait de nœud DOM. Texte
  accordé au pluriel si `count > 1` (peut arriver : le point "première run" et
  un seuil de vague peuvent tomber sur la MEME défaite, ex. mourir
  exactement à la vague 4 — voir plus bas). Auto-disparaît après
  `TALENT_POINT_TOAST_DURATION_MS` (3.2s, `config/constants.ts`).
- `main.ts` : `talentPointsBefore = metaProgress.talentPoints` capturé juste
  avant `registerWaveReached`, comparé à `metaProgress.talentPoints` après
  `grantFirstRunPointIfNeeded`/`registerWaveReached` pour obtenir le nombre
  RÉEL de points gagnés cette bataille (0 la plupart du temps) — le toast
  n'affiche donc jamais "+0". Appelé dans les DEUX branches (victoire →
  `showWaveComplete`, défaite totale → `showGameOver`), à l'intérieur du
  callback `onBlackout` de `waveTransition.play` : le toast est donc déjà
  affiché derrière le rideau noir au moment où celui-ci se rouvre, il
  apparaît en même temps que l'écran suivant plutôt qu'en surimpression
  brutale après coup.
- `ui/style.css`, `.talent-point-toast` : bandeau centré en haut de l'écran,
  sous `.wave-indicator` (qui occupe déjà le tout haut), teinte dorée
  (cohérente avec `coin-popup--gain`) pour signaler un gain plutôt qu'une
  information neutre. `z-index: 20` — au-dessus de `.screen-overlay` (10) et
  du bouton Boutique (15) pour rester visible par-dessus l'écran de fin de
  vague/game over, en dessous du rideau de transition (100) et de la
  bannière Victoire/Défaite (50).
- Pas de vérification headless nécessaire (pur affichage HTML/CSS sans
  logique de jeu) ; build propre.

## Seuil de la barrière de sécurité "or non dépensé" monté à 30% (2026-08-10)

Antoine : "ce message s'affiche trop souvent, il est là pour prevenir d'un
oubli" — au premier abord compris comme visant le nouveau toast de point de
talent (ci-dessus), corrigé après clarification : il parlait du popup "Il
vous reste N or non dépensé. Lancer la bataille quand même ?" (voir
"Ajustements placement/UI post-Étape F" plus haut). Cause : le seuil (10% de
l'or possédé au tout DÉBUT de la phase de placement) était bien trop bas
avec les montants d'or typiques d'un début de run (5-20 or) — 10% de ça
représente 0,5 à 2 or, donc le popup se déclenchait dès qu'il restait
la moindre pièce, pas seulement sur un vrai oubli. Question posée sur
l'approche (seuil absolu / pourcentage plus haut / les deux combinés) —
Antoine a choisi de garder la logique relative mais de monter le
pourcentage.

- `config/constants.ts`, `PLACEMENT_GOLD_WARNING_RATIO` (nouveau, remplace
  le `0.1` en dur dans `main.ts`) : monté à **0.3** (30%) — valeur exacte
  choisie par Claude dans la fourchette proposée (30-50%), à ajuster si
  Antoine juge que ça continue de se déclencher trop souvent ou pas assez
  une fois testé en jeu réel.
- `main.ts`, `requestValidatePlacement` : lit désormais cette constante au
  lieu du `0.1` en dur, aucun autre changement de logique (toujours comparé
  à `goldAtPlacementStart`, capturé au tout début du placement).
- Build propre ; pas de vérification headless nécessaire (calcul trivial,
  déjà couvert par la logique existante du popup).

## Le point de talent de la vague 4 exige une vraie victoire (2026-08-10)

Antoine revient sur sa propre décision du même jour ("Premier seuil de point
de talent fixé à la vague 4", plus haut) : "un point de talent doit être
disponible après avoir terminé la vague 4 désormais". Auparavant, le point
se débloquait dès l'ARRIVÉE sur la vague 4 (donc à la réussite de la vague
3, avant même d'avoir combattu la vague 4 elle-même) — désormais il faut
réellement GAGNER la vague 4.

- `run/metaProgress.ts` : sémantique de `TALENT_POINT_WAVES` changée — chaque
  entrée représente maintenant la vague qu'il faut RÉELLEMENT REMPORTER, pas
  seulement atteindre. `registerWaveReached` compare `waveNumber > wave`
  (strict) au lieu de `waveNumber >= wave` : comme `applyBattleOutcome`
  n'incrémente `waveNumber` que sur une VICTOIRE, `waveNumber` ne dépasse
  strictement `wave` que si cette vague a été gagnée pour de bon — sur une
  défaite en cours de vague 4, `waveNumber` reste à 4, la condition
  `4 > 4` est fausse, pas de point. `TALENT_POINT_WAVES` reste `[4]` (la
  valeur elle-même n'a pas changé, seule la comparaison est corrigée).
- Vérifié en headless : arriver sur la vague 4 (victoire de la vague 3)
  n'accorde plus rien ; une défaite EN COURS de vague 4 (`waveNumber` reste à
  4) n'accorde rien non plus ; gagner la vague 4 (`waveNumber` passe à 5)
  accorde bien le point ; aucun second point en retraversant la vague 5 dans
  une run ultérieure. Build propre.

## Talent "Tir rapide" renforcé + fléchette du joueur plantée au sol (2026-08-10)

Demande d'Antoine : "la vitesse du projectile doit passer de 30% à 50%, et
la vitesse de la flèche du joueur de 50% à 60%" — mapping fait sur la base
des valeurs actuelles exactes (aucune autre lecture ne colle aux deux
pourcentages de départ cités) : "vitesse du projectile" = `config/constants.ts`,
`TALENT_PROJECTILE_SPEED_BONUS` (0.3 → 0.5, déjà nommé "vitesse de
projectile" dans le code, appliqué à `PLAYER_ARROW_SPEED` via
`main.ts effectivePlayerArrowSpeed`) ; "vitesse de la flèche du joueur"
= `TALENT_FIRE_RATE_BONUS` (0.5 → 0.6, techniquement la cadence de tir/
réduction de cooldown, mais c'est la seule autre valeur du talent qui valait
50% avant ce changement — à corriger si Antoine visait autre chose).

Deuxième demande, même message : "il faut également modifier la trajectoire
du projectile (la flèche) pour qu'il se plante mieux au sol, le modèle du
projectile doit également rester plantée dans le sol et ne pas disparaître."
Deux bugs distincts diagnostiqués dans `render/playerArrowView.ts` :

1. **La trajectoire ne touchait jamais le sol.** La hauteur du trait
   (`HEIGHT + sin(tπ) * ARC_HEIGHT`) revenait exactement à `HEIGHT` (0.7) en
   fin de vol, jamais à 0 — le trait flottait à 0.7 au moment de l'impact,
   impossible de le "planter" ensuite puisqu'il n'atteignait jamais le sol.
   Corrigé : la hauteur descend maintenant linéairement de `HEIGHT` vers 0
   sur toute la duree du vol, EN PLUS de l'arc (`lerp(HEIGHT, 0, t) + sin(tπ)
   * ARC_HEIGHT`) — le depart (t=0) et l'apex (t=0.5) restent quasiment
   identiques a avant, seule la fin de vol change reellement.
2. **Le plafond de pitch (`MAX_PITCH = 0.2` rad, ~11°) etait fixe sur tout le
   vol** — choix d'origine valide par Antoine pour que la fleche "reste
   surtout horizontale du debut a la fin", mais ca ecrasait aussi toute
   plongee credible a l'atterrissage. Corrige en rendant le plafond VARIABLE
   selon `t` (`lerp(MAX_PITCH_EARLY=0.2, MAX_PITCH_LANDING=1.1, t)`) : le
   debut du vol garde exactement le meme rendu discret qu'avant (plafond
   inchange a t=0), mais la fin de vol peut plonger jusqu'a ~63°, un angle
   qui varie naturellement avec la distance du tir (verifie par script : ~63°
   sur un tir court de 3 cases, ~30° sur un tir long de 20 cases).
3. **Le trait disparaissait instantanement a l'impact.** `PlayerArrowView`
   n'avait qu'un seul mesh, supprime des que `flight` redevenait `null`
   (sim/playerArrow.ts vide l'etat de vol exactement au tick de resolution).
   Refactor : `flyingMesh` (en vol, repositionne/reoriente chaque frame comme
   avant) et `stuckMesh` (fige a la derniere pose au moment ou le vol se
   termine — deja quasi au sol et deja incline vers le bas grace aux deux
   correctifs ci-dessus, donc AUCUNE pose "plantee" separee a fabriquer, la
   derniere image du vol suffit). `stuckMesh` reste affiche jusqu'au TIR
   SUIVANT (qui le retire pour laisser place au nouveau trait) ou jusqu'a
   `clear()` (fin de bataille). Un seul trait plante a la fois par design —
   pas un vrai pool accumulant tous les impacts comme `Projectiles` (fleches
   d'archer) : a reconsiderer si Antoine veut voir chaque tir rester visible
   simultanement, pas seulement le dernier.
- Vérifié par script (maths de trajectoire isolees, sans Three.js) : hauteur
  exacte a 0 en fin de vol, plafond de pitch inchange au depart (~11°),
  plongee nettement visible a l'arrivee (30-63° selon la distance). Pas de
  verification visuelle possible de mon cote (aucun acces au rendu) — a
  confirmer par Antoine dans le navigateur. Build propre.

**Correctif immediat (meme journee) : c'etait l'empennage qui touchait le
sol, pas la pointe.** Antoine, apres avoir vu le resultat : "il faut que ce
soit l'autre extremite de la fleche qui se plante le sol (par l'avant)".
Diagnostic confirme par calcul matriciel (verifie avec un vrai
`THREE.Group`/`rotateX`, pas juste a la main) : `mesh.rotateX(-pitch)`
faisait pencher la POINTE (l'avant, `buildArrow`, local z=-0.5) vers le HAUT
pendant la plongee — l'empennage (l'arriere, z=+0.4) etait donc l'extremite
qui plongeait vers le sol, l'inverse de l'intention. Corrige en retirant la
negation (`rotateX(pitch)`) : verifie avec un vrai `THREE.Group` que la
pointe finit desormais nettement plus bas que l'empennage en plongee (et
inversement plus haut en montee, coherent avec le "nez qui pointe vers le
haut au tir" attendu). Build propre.

## Diagnostic et correctif d'un "layout thrashing" dans les barres de PV (2026-08-10)

Antoine : "déjà un gros souci de performance d'affichage dans la vague 5.
que suggère tu, nous sommes assez loin de la limite d'unités que nous
voulons afficher" — a raison sur ce dernier point : vague 5 = 20 fantassins
+ 8 archers = 28 ennemis + une armée joueur de quelques unités, largement en
dessous du seuil ~100-120 documenté pour la séparation O(n²) (voir "Grille
spatiale pour la séparation" plus haut, jamais un problème mesuré avant ce
seuil). Donc PAS la simulation elle-meme — cohérent avec "problème
d'AFFICHAGE" precisement.

**Cause trouvee par lecture de code** (pas de profiling navigateur possible
de mon cote, aucun acces visuel) : `ui/combatOverlay.ts`, `CombatOverlay.sync()`
bouclait sur `world.entities` et, pour CHAQUE entite, ECRIVAIT
`bar.style.left`/`bar.style.top` (position de sa barre de PV) puis, au tour
suivant, `project()` LISAIT `canvas.clientWidth`/`clientHeight` pour l'entite
SUIVANTE — une lecture de propriete de layout intercalee avec des ecritures
de style, dans la MEME boucle. C'est le "layout thrashing" classique : chaque
lecture de `clientWidth`/`clientHeight` force le navigateur a resoudre
IMMEDIATEMENT tout layout rendu "sale" par l'ecriture juste avant, au lieu de
laisser le navigateur regrouper toutes les ecritures puis calculer le layout
UNE seule fois en fin de frame. Avec n entites vivantes, ca fait n
recalculs de layout FORCES par frame au lieu d'un seul — un cout qui
grandit avec le nombre d'unites a l'ecran, invisible dans nos benchmarks
headless (aucun DOM n'existe en dehors du navigateur) et donc jamais detecte
malgre les mesures de performance deja faites sur la separation/le ciblage.

- Corrige : `canvas.clientWidth`/`clientHeight` sont maintenant lus UNE
  SEULE FOIS par appel (`refreshCanvasSize()`, nouveau, appele en tete de
  `sync()` et `syncPlacement()`) et mis en cache (`canvasWidth`/`canvasHeight`) ;
  `project()` lit ces champs au lieu de re-interroger le DOM a chaque entite.
  Toutes les lectures de layout sont donc regroupees AVANT toutes les
  ecritures de style de la boucle, permettant au navigateur de ne faire
  qu'UN SEUL calcul de layout par frame, quel que soit le nombre d'unites.
  `spawnFloatingText` (miss/esquive/soin) rafraichit aussi le cache avant son
  propre appel isole a `project()` — un seul evenement a la fois, cout
  negligeable, pas de boucle concernee.
- Build propre. **Pas de verification chiffree possible de mon cote** (pas
  d'acces au navigateur/profiler) — a confirmer par Antoine en testant la
  vague 5 a nouveau. Si le probleme persiste ou n'est que partiellement
  resolu, prochaine piste a explorer : `.pip-bar` est positionne via
  `style.left`/`style.top` (proprietes de LAYOUT, meme optimisees en un seul
  calcul par frame) plutot que `transform: translate(...)` (proprietes de
  COMPOSITING, qui evitent tout calcul de layout) — un passage a `transform`
  serait l'etape suivante si ce premier correctif ne suffit pas.

## Deuxième correctif de performance : allocations d'objets dans la boucle de mouvement (2026-08-10)

Antoine, apres le correctif du "layout thrashing" des barres de PV : "j'ai
reussi a aller sur la vague 6 mais le nombre de FPS a chutter ! j'avais une
armee quasiment aussi grosse que mon adversaire" — vague 6 = 40 fantassins +
16 archers = 56 ennemis, donc avec une armee joueur comparable, jusqu'a
~100-120 unites simultanees. Confirme par CLAUDE.md ("Problemes connus") que
la simulation elle-meme (separation, ciblage, tous O(n^2)) reste correcte
jusqu'a ~100-120 unites — donc pas (uniquement) un probleme d'algorithme,
plutot un cout CACHE quelque part d'autre.

**Cause trouvee par lecture de code** : `sim/geometry.ts`, `obstacleBounds(obstacle)`
alloue un NOUVEL objet litteral a chaque appel. Cette fonction etait
appelee, PAR OBSTACLE, a l'interieur de trois boucles qui tournent PAR
ENTITE VIVANTE, PAR SOUS-PASSE (`COLLISION_ITERATIONS = 5`), 30 fois par
seconde : `resolveObstacleCollisions` (chaque entite, chaque sous-passe,
INCONDITIONNEL), `findBlockingObstacle` (chaque entite en poursuite d'une
cible verrouillee, chaque sous-passe — voir le chantier pathfinding), et
`findSteeringPoint` (marche neutre). Avec ~100 unites, 5 sous-passes, ~100
obstacles (carte "vague1-20") : jusqu'a plusieurs MILLIONS de petits objets
alloues par seconde rien que pour ce calcul, largement de quoi saturer le
ramasse-miettes et provoquer des a-coups de FPS perceptibles — un cout
totalement invisible dans les benchmarks headless deja faits sur la
separation/le ciblage (qui ne mesuraient que le temps de CALCUL, pas la
pression memoire de l'allocation).

- Corrige : `geometry.ts`, nouvelle fonction `getObstacleBoundsList(obstacles)`
  — met en cache la liste des bornes par REFERENCE de tableau (`WeakMap`,
  aucune fuite possible : une ancienne carte remplacee est automatiquement
  liberee). Les obstacles d'une map sont statiques pour toute la duree d'une
  bataille (`World.obstacles` n'est reassigne que par `setMap`, jamais mute
  en place), donc ce calcul n'a besoin d'etre refait qu'une fois par
  reference de tableau, jamais par entite/par sous-passe.
- `findBlockingObstacle` (geometry.ts), `resolveObstacleCollisions` et
  `findSteeringPoint` (movement.ts) utilisent desormais cette liste en
  cache au lieu de rappeler `obstacleBounds` a chaque obstacle a chaque
  appel. `sideBlockedByObstacle` et `buildPathGrid` (pathfinding.ts)
  inchanges — frequence d'appel bien plus faible (respectivement declenche
  seulement lors d'un blocage, et une fois par tick), pas la peine d'y
  toucher.
- Vérifié en headless : une bataille complete (120 entites, la carte reelle
  a 102 obstacles, 300 ticks) tourne sans exception, positions toujours
  finies, comportement de combat normal. Comparaison directe de
  `findBlockingObstacle` contre une reimplementation fidele de l'ANCIEN
  calcul (bornes reallouees a chaque appel), sur ~15 000 appels (volume
  represantant environ 1 seconde de jeu a l'echelle de la vague 6) : **23,1ms
  contre 1,8ms, un facteur ~13x**. Build propre.
- **Toujours pas de verification visuelle possible de mon cote** (aucun
  acces au navigateur) — a confirmer par Antoine en retestant la vague 6.
  Si un ralentissement persiste au-dela de ce correctif, la piste suivante
  serait le nombre de DRAW CALLS Three.js (chaque unite est une hierarchie
  d'une dizaine de boites, chacune avec ses propres materiaux depuis le
  correctif anti-partage du 2026-08-09 — voir "Bug de materiaux partages
  entre unites corrige au passage" — donc potentiellement 1000+ draw calls
  a 100+ unites), pas encore investiguee.

## Chantier rendu instancié — objectif 300 unités fluides (en cours)

Démarré le 2026-08-11 : Antoine, en discutant du débordement de la vague 8,
révèle un objectif de fond du jeu : "le but est à terme d'agrandir la map et
pouvoir afficher une bataille grandeur nature... il est dans la volonté du
jeu de pouvoir afficher 300 unités qui se battent simultanément et de façon
fluide." Diagnostic donné avant tout code : les deux corrections de perf du
2026-08-10/11 (grille pour la séparation et le ciblage) mettent déjà la
SIMULATION à l'aise à 300 unités (vérifié à 220). Le vrai mur est côté
RENDU : chaque fantassin est ~17 objets 3D séparés (voir unitMesh.ts,
buildFantassin) — à 300 unités, ça fait des milliers de DRAW CALLS, bien
au-delà de ce qu'un moteur généraliste comme Three.js digère à 60 fps sans
technique dédiée. Confirmé "on peut directement partir là-dessus" par
Antoine plutôt que de commencer par un profiling navigateur (que je ne peux
de toute façon pas faire moi-même, aucun accès visuel).

**Etape 1 — Fantassin instancié, FAIT.** Principe : au lieu d'un objet 3D
par partie par unité, un seul `THREE.InstancedMesh` par partie (jambe
gauche, torse, casque...) dessine TOUTES les instances de cette partie pour
tout un camp en un seul draw call — le nombre de draw calls devient fixe
(nb de parties × nb de camps), indépendant du nombre d'unités réellement sur
le plateau.

Choix architectural central, pour limiter le risque (aucune vérification
visuelle possible de mon côté) : **ne RIEN réécrire de l'animation/des
effets existants.** `UnitViews` continue de construire et d'animer un
`THREE.Group` par unité EXACTEMENT comme avant (marche, attaque, flash de
dégâts, fondu de mort — code inchangé). Ce Group reste dans la scène
(nécessaire pour le raycast de ciblage) mais ses meshes individuels
basculent en `visible = false` une fois leur position MIROIRÉE dans
l'InstancedMesh correspondant — le moteur ne les dessine plus, mais tout le
reste (matrixWorld, raycast) continue de fonctionner sur ces mêmes objets
sans aucun changement de logique. Concrètement : le nouveau rendu instancié
est une couche de COMPRESSION ajoutée à la toute fin du pipeline existant,
pas une réécriture.

- `render/unitMesh.ts` : chaque mesh de `buildFantassin` reçoit une
  étiquette stable `userData.instancePart` (17 parties : jambes, torse,
  plastron, ceinture, épaulières, bras, épée en 3 pièces, casque, visière,
  cimier, bouclier en 2 pièces) via une nouvelle fonction `tag()`. Purement
  une étiquette de rendu, aucun effet sur la simulation.
- `render/instancedUnitRenderer.ts` (nouveau) : `InstancedUnitRenderer`,
  un `InstancedMesh` par (partie, camp) — capacité fixe par camp
  (`FANTASSIN_INSTANCE_CAPACITY = 220`, généreuse par rapport à la courbe de
  difficulté actuelle en visant l'objectif 300). Chaque InstancedMesh
  utilise un matériau BLANC neutre ; la vraie teinte (neutre ou couleur
  d'équipe) vient de `instanceColor`, ce qui permet au FLASH DE DÉGÂTS de se
  reproduire par instance en mélangeant simplement la couleur vers le blanc
  (`lerp`) — sans shader personnalisé. `raycast` est explicitement
  neutralisé (`() => {}`) sur chaque InstancedMesh : le ciblage à la souris
  continue de viser les meshes individuels d'origine (restés dans la scène,
  juste invisibles), jamais la couche instanciée. Slots gérés par
  free-list par camp (`acquireSlot`/`releaseInstance`) ; au-delà de la
  capacité, une unité en trop retombe simplement sur le rendu individuel
  (jamais d'erreur ni de disparition).
- **Limite assumée** : le FONDU DE MORT (opacité) n'a pas d'équivalent
  simple en InstancedMesh standard (pas de canal alpha par instance sans
  shader sur mesure). Une unité qui meurt est donc immédiatement RETIRÉE de
  l'InstancedMesh (`releaseInstance`) et continue de se rendre à l'ancienne
  (individuellement, fondu inclus) jusqu'à sa disparition complète. Comme il
  n'y a jamais qu'une poignée d'unités en train de mourir à un instant
  donné (même dans une bataille à 300 unités), ce compromis capture
  l'essentiel du gain sans toucher à un shader.
- `render/unitViews.ts` : `UnitViews` possède désormais son propre
  `InstancedUnitRenderer` (ajouté comme enfant de `this.group`, donc inclus
  automatiquement partout où `unitViews.group` est déjà utilisé — aucun
  câblage supplémentaire nécessaire dans `main.ts`). Après le calcul complet
  de la position/rotation d'une entité (fin de la boucle `sync()`) :
  si vivante et de type `fantassin`, `view.updateMatrixWorld(true)` puis
  `instanced.updateInstance(...)` (masque les meshes individuels) ; sinon
  (morte, autre type d'unité, ou capacité dépassée), `releaseInstance` +
  remise à `visible = true` des meshes individuels. `tickHitFlash` renvoie
  désormais l'intensité du flash (0-1) en plus de l'appliquer sur le rendu
  individuel, pour que la couche instanciée puisse la reproduire.
  `clear()` doit réattacher `instanced.group` après `this.group.clear()`
  (qui le détache comme n'importe quel autre enfant) — sans ça, le rendu
  instancié disparaîtrait de la scène après chaque changement de bataille.
- Vérifié en headless avec du VRAI Three.js (pas de mock) : les fantassins
  vivants ont bien leurs 17 meshes masqués et un slot instancié assigné ;
  un fantassin mort garde ses meshes visibles et n'a aucun slot ; les
  matrices copiées dans l'InstancedMesh sont identiques (à la précision
  Float32 près, l'instanceMatrix est stockée en Float32Array contrairement
  aux doubles JS de `matrixWorld`) aux matrices des meshes individuels
  d'origine, sur les 17 parties ; le raycast retrouve toujours l'entité
  correcte malgré des meshes individuels invisibles (confirmé au passage :
  `Raycaster.intersectObjects` de Three.js ignore `visible = false`, d'où le
  besoin explicite de neutraliser le raycast des InstancedMesh eux-mêmes) ;
  au-delà de la capacité, les unités en trop retombent bien sur le rendu
  individuel sans erreur. Build propre.
- **Non vérifiable de mon côté — aucun accès visuel au rendu réel.** Cette
  étape compile et passe tous les tests de logique/matrices, mais seul
  Antoine peut confirmer dans le navigateur que les fantassins ont
  toujours la bonne silhouette/couleur/animation, que le flash de dégâts se
  voit bien, et qu'un vrai gain de FPS est mesurable à grande échelle
  (vague 6+, armée nombreuse). À valider avant d'étendre la même technique à
  l'archer puis au Cavalier (actuellement un placeholder de toute façon, en
  attente d'un vrai modèle).

**Pas encore fait** : archer et Cavalier restent sur l'ancien rendu
individuel (aucune étiquette `instancePart` posée sur leurs parties
propres, en dehors des jambes qui réutilisent `buildLeg` par cohérence de
signature) ; barres de PV (toujours en HTML/DOM, second goulot
d'étranglement identifié pour l'objectif 300 unités, pas encore attaqué).

## Retour de test vague 7 + lot de corrections (2026-08-11)

Antoine a atteint la vague 7 après le chantier d'instanciation : "on a
commencé la manche avec une dizaine de FPS puis on est remonté autour des
60." Cohérent avec une explication qui n'appelle PAS de correctif
supplémentaire pour l'instant : au lancement d'une vague, tous les fantassins
sont des unités JAMAIS VUES (nouvelles `Entity`), donc `UnitViews.createView`
construit ~17 nouveaux objets/géométries PAR UNITÉ d'un coup — un coût de
démarrage ponctuel (allocation/upload GPU), pas un coût soutenu par frame,
ce qui explique le "mal au lancement puis amélioration" sans qu'aucun
système ne soit défaillant en continu. Piste d'optimisation possible pour
plus tard (pas faite ici, pas demandée) : les meshes individuels des
fantassins VIVANTS ne servent plus qu'au calcul de matrice depuis le
chantier d'instanciation, leur géométrie réelle (BoxGeometry par partie) est
donc du travail gaspillé à la construction — pourrait être remplacée par des
objets "sans géométrie" pour ce cas précis.

Dans le même message, plusieurs demandes distinctes traitées ensemble :

- **Hitbox de toutes les unités agrandie "un tout petit peu"** ("les
  flèches sont trop dur à toucher, même les archers ont du mal à se
  toucher de temps en temps"). `data/units.ts`, `UnitStats.radius` : ce
  rayon sert de REACH à l'attaque automatique (`combatSystem`,
  `inRange = dist <= attackRange + target.radius`) — l'agrandir rend plus
  tolérant le moment où une unité bousculée par la foule se retrouve juste
  hors de portée. Fantassin 0.42→0.5, archer 0.38→0.46, Cavalier léger
  0.6→0.68 (+0.08 partout, valeur choisie par Claude). Séparément,
  `config/constants.ts`, `PLAYER_ARROW_HIT_RADIUS` (0.55→0.63) pour la
  flèche du JOUEUR spécifiquement, visée libre — ce rayon ne lit jamais
  `stats.radius` (vérifié dans `sim/playerArrow.ts`), donc les deux
  réglages sont indépendants. Aucun impact visuel (la taille des
  silhouettes est codée en dur dans `unitMesh.ts`, sans lien avec
  `stats.radius`).
- **Vague 4 re-nerfée légèrement** ("une ou deux unités en moins") :
  `run/runState.ts`, `computeEnemyWaveComposition` — 6f+2a → 5f+2a (choisi
  dans la fourchette basse de "une ou deux", la vague 4 avait déjà reçu un
  gros nerf la veille).
- **Doublement retiré, remplacé par +10%/vague composé** ("il y a beaucoup
  trop [à la vague 7]... adapte la pour +10% d'unités à chaque fois") :
  l'ancienne formule `5 * 2^(wave-3)` donnait 80f+32a (112 ennemis) dès la
  vague 7. Remplacée par une croissance de 10% COMPOSÉE par vague à partir
  de la vague 6 (20f+8a, dernière valeur fixée à la main) :
  `Math.round(20 * 1.1^(wave-6))` fantassins, pareil ×8 pour les archers —
  chaque type croît indépendamment au même taux, préservant leur ratio.
  Vague 7 = 22f+9a (31 ennemis) au lieu de 112. Vagues 1-6 inchangées
  (valeurs fixes, jamais issues de cette formule). Vérifié en headless pour
  les vagues 1 à 8.
- **Ciblage du soin simplifié** ("le curseur n'est pas très clair..., en
  cas de doute il faut soigner l'unité avec le moins d'hp"). Remplace
  l'ancien raycast EXACT sur le mesh d'une unité précise (`findHoveredPlayerEntity`,
  supprimée — devenue inutilisée) par une recherche dans
  `HEAL_TARGET_RADIUS` (2 cases, `config/constants.ts`) autour du point du
  sol cliqué : parmi les unités VIVANTES du joueur blessées à portée,
  `findHealTargetEntity`/`findHealTargetSlotIndex` (main.ts) choisissent
  celle la plus blessée EN PROPORTION de ses PV max (pas le HP absolu le
  plus bas, qui favoriserait injustement une unité à faible PV max comme
  l'archer même à pleine vie — même convention que l'ancien bouton
  "Soigner" de la boutique). Aucune unité pleine PV n'est jamais choisie ;
  aucune cible à portée désarme sans effet, comme avant. **Anneau de
  prévisualisation** (`healTargetRing`, réutilise `createSelectionRing`) :
  affiché et repositionné à chaque `mousemove` tant qu'un soin est armé, sur
  EXACTEMENT la même résolution que le clic réel — le joueur voit qui sera
  soigné avant de cliquer. Masqué explicitement dans `disarmItem()` et au
  désarmement par re-clic sur l'emplacement d'inventaire. Vérifié en
  headless (réimplémentation fidèle, `main.ts` non important directement —
  effets de bord DOM au chargement) : proportion plutôt que HP absolu,
  rayon respecté, unités mortes/pleines jamais choisies.
- **Sélection de groupe dans l'éditeur de maps** ("les options de sélection
  [double-clic, clic-glissé] ne fonctionnent pas dans l'éditeur"). Diagnostic
  avant correctif : ces gestes n'avaient en réalité JAMAIS été codés dans
  l'éditeur (seulement en phase de placement du jeu réel) — question posée à
  Antoine sur l'intention exacte, réponse : "double-clic = sélectionner tout
  le même type", à porter dans l'éditeur (clic-glissé pour déplacer
  explicitement écarté, gardé pour plus tard si redemandé).
  - `editor/editorState.ts` : `EditorSelection` gagne un 3ᵉ variant
    `{ kind: 'unit-group'; ids: number[] }` (`ids[0]` sert toujours d'ANCRE
    pour un déplacement de groupe). `selectSameTypeUnits(anchorId, max)` —
    même convention que `main.ts`/`selectSameTypeGroup` en placement : trie
    par distance à l'ancre, plafonne à `max`, une seule unité de ce type
    retombe sur une sélection SIMPLE plutôt qu'un groupe à 1 membre.
    `moveSelectedGroup(x, z)` — délta exact de l'ancre appliqué tel quel à
    tous les membres (formation relative préservée), CAMP RECALCULÉ PAR
    UNITÉ individuellement (pas un camp de groupe unique) ; contrairement à
    la phase de placement, AUCUNE validation d'occupation (l'éditeur n'en a
    jamais eu). `deleteSelected()` étendu pour retirer tous les membres d'un
    groupe. Note d'implémentation TypeScript : les getters/méthodes doivent
    capturer `this.selection` dans une variable locale avant de la tester
    (`const sel = this.selection; if (sel?.kind !== 'x') return;`) — narrower
    un champ `this.x` directement ne survit pas de façon fiable à l'intérieur
    d'une closure (`.filter()`/`.find()`) une fois l'union à 3 variants,
    contrairement à une `const` locale.
  - `main.ts` : détection de double-clic MANUELLE (même technique que
    `lastUnitClickSlot`/`DOUBLE_CLICK_WINDOW_MS` en placement, état séparé
    `lastEditorUnitClickId` pour ne jamais mélanger les deux contextes) dans
    `handleEditorClick`. Un clic sol avec un groupe sélectionné appelle
    `moveSelectedGroup` (contrairement à la sélection simple, le groupe
    RESTE sélectionné après un déplacement — cohérent avec le comportement
    déjà existant de l'éditeur pour un objet seul, plutôt qu'avec le
    déplacement de groupe de la phase de placement qui désélectionne après
    coup). Rendu : `editorGroupRings` (`Map<id, Mesh>`) — un anneau par
    membre du groupe, enfant de son mesh (même principe que
    `refreshPlayerPreview` en placement), invalidé et reconstruit si le
    mesh sous-jacent est reconstruit (changement de camp pendant un
    déplacement de groupe traversant z=0). Pas de panneau de propriétés pour
    une sélection de groupe (retombe sur `hideProperties()`, sans code
    supplémentaire) — amélioration possible plus tard si demandée.
  - Vérifié en headless (`EditorState` directement) : double-clic
    sélectionne tout le même type sans limite, plafond respecté (garde les
    plus proches de l'ancre), un seul exemplaire retombe sur une sélection
    simple, déplacement de groupe préserve la formation relative ET
    recalcule le camp par unité (testé en faisant traverser z=0 à deux
    membres sur trois), une unité hors groupe n'est jamais affectée,
    suppression de groupe retire exactement les bons membres. Build propre.

## Spécialisation Soigneur + réorganisation boutique + reset des talents (2026-08-11)

Trois demandes distinctes d'Antoine, traitées ensemble.

**Nouvelle spécialisation "Soigneur", talent fondateur "Aux petits
oignons"** : "lorsqu'un allié passe à 1 point de vie, utilise automatique
un parchemin de soins sur lui." `data/talents.ts` : `TalentBranch` gagne
`'soigneur'`, nouveau talent `aux_petits_oignons` (branche `soigneur`, coût
1, même prérequis générique "talent universel d'abord" que les 3 autres
fondateurs — aucune règle spéciale à écrire, `canUnlockTalent` le gère déjà
génériquement via `branch !== null`). Effet implémenté dans `main.ts`, la
boucle qui lit `world.combatEvents` (pas dans `sim/`, qui ne connaît jamais
les talents) : sur un `result === 'hit'` où la cible est une unité VIVANTE
du joueur retombée à 1 point de vie AFFICHÉ (`Math.ceil(hp/HP_PER_PIP) <= 1`,
même formule que la barre de PV) et le talent débloqué, cherche un
`heal_scroll_minor` dans `currentRun.inventory` — s'il y en a un, le
consomme réellement (retiré de l'inventaire, pas un soin gratuit illimité)
et applique son effet. Sans scroll disponible : aucun effet, silencieux.
`target.alive` est vérifié APRÈS `deathSystem` (déjà exécuté dans le même
`world.step()`), donc un coup qui tue ne peut jamais "ressusciter" via ce
talent. Au passage : le texte de la description de `tir_rapide` était resté
à "50%/30%" après le renforcement du 2026-08-10 (60%/50%) — jamais mis à
jour à l'époque, corrigé ici.

**Parchemin de soin mineur renforcé** : 3 PV → 5 PV par utilisation
(`data/items.ts`, `effect.amount: 30 → 50`, échelle interne ×10 — appliqué
correctement, Antoine avait explicitement rappelé la conversion).

**Arbre de talents étendu à 4 branches** : `ui/screens.ts`,
`buildTalentTree` — le connecteur SVG (position du tronc, barre horizontale,
chutes vers chaque nœud) est désormais calculé à partir de
`branchOrder.length` plutôt que figé en dur pour 3 branches ; une 5e branche
future n'exigera plus de recalcul de ce connecteur (seule la largeur FIXE en
CSS, `.talent-tree`/`.talent-tree-connectors`, 460px → 620px pour 4
branches de 140px + 20px d'écart, reste à ajuster à la main si le nombre
change encore).

**Boutique par onglets** : "il faut désormais classer les objets de la
boutique dans des fenêtres distinctes, il y aura une fenêtre pour le soin,
parchemin de bataille, unités." `data/items.ts`, `ItemDef.category:
'heal' | 'battle-scroll'` (nouveau champ) — `heal_scroll_minor` catégorisé
`'heal'`. `ui/screens.ts` : 3 onglets (`Unités`/`Soins`/`Parchemins de
bataille`), un seul panneau visible à la fois (`setShopTab`, classes CSS
`.shop-tab--active`/`.shop-tab-content--active`) — onglet par défaut
`'units'` à chaque ouverture. L'onglet "Parchemins de bataille" reste VIDE
avec un texte d'attente ("Aucun parchemin de bataille disponible pour
l'instant") — premier sort de bataille pas encore conçu, comme demandé
explicitement ("laisse parchemin de bataille vide pour l'instant"). Antoine
a aussi évoqué l'idée (encore en réflexion, PAS à construire) d'une future
spécialisation de talent "Sort de bataille" — noté pour plus tard, aucun
contenu créé.

**Boutique n'affiche que ce qui est réellement achetable** : "elle ne doit
afficher que les unités qui sont achetables, le cavalier par exemple n'est
achetable qu'à partir de la manche 5." `ui/screens.ts`, `refreshShop` — le
bouton Cavalier est désormais entièrement MASQUÉ (`style.display = 'none'`)
tant que `unlockedUnits` ne le contient pas, au lieu d'être affiché désactivé
avec le libellé "débloqué à la vague X" (ancien comportement, retiré).
Fantassin/Archer n'ont pas d'équivalent de déblocage, donc restent toujours
visibles (gold-gated uniquement, comme avant).

**Reset des talents (respec)** : "rajoute également une option reset point
de talent, je pense que ça rendra la chose plus confortable." Nouveau
bouton "Réinitialiser les talents" sur l'écran Arbre de talents (à côté de
"Retour"), avec un écran de confirmation dédié (`resetTalentsConfirm`,
même motif de sécurité que "Effacer la sauvegarde"). `run/metaProgress.ts`,
`resetTalentPoints(progress)` : REMBOURSE intégralement les points dépensés
(somme des coûts des talents dans `unlockedTalents`) et vide
`unlockedTalents` — ne touche à RIEN d'autre (record de vague, unités
débloquées, `firstRunPointGranted`...), distinct du reset TOTAL du bouton
"Effacer la sauvegarde". Sauvegarde immédiate après confirmation, même motif
qu'un achat de talent.

Vérifié en headless : exactement 4 branches à 1 talent chacune, montant du
parchemin de soin, séquence complète débloquer→reset→re-débloquer un
talent (points remboursés exactement, prérequis universel de nouveau
appliqué après reset), et la condition de déclenchement d'"Aux petits
oignons" (uniquement allié vivant à 1 pip affiché ou moins, jamais un
ennemi, jamais une unité déjà morte). Build propre. **Non vérifiable de mon
côté** : rendu visuel des onglets et du connecteur à 4 branches, aucun accès
au navigateur.

## Point de talent récurrent tous les 2 manches à partir de la vague 6 (2026-08-11)

Demande d'Antoine : "désormais à partir de la manche 6, vous gagnez un point
de talent toutes les deux manches (donc un point en validant la vague 6, un
point pour la vague 8 etc.)." S'ajoute à `TALENT_POINT_WAVES` (toujours
`[4]`, inchangé), ne le remplace pas — contrairement à une liste fixe, ce
palier est RÉCURRENT et illimité.

- `run/metaProgress.ts` : `TALENT_POINT_RECURRING_START = 6`,
  `TALENT_POINT_RECURRING_INTERVAL = 2`. `registerWaveReached` calcule
  désormais les jalons récurrents dus (`6, 8, 10...` jusqu'à `waveNumber`
  exclu) et les fusionne avec `TALENT_POINT_WAVES` avant la boucle de
  distribution existante — même règle "REELLEMENT GAGNÉE" que le reste
  (`waveNumber > wave`, strict), même garde-fou anti-répétition
  (`claimedWaveRewards`).
- Vérifié en headless : aucun point avant la vague 4 ; +1 à la vague 4 ;
  aucun nouveau point aux vagues 5 et 7 (impaires, hors palier) ; +1 aux
  vagues 6, 8 et 10 ; aucune répétition en retraversant une vague déjà
  récompensée dans une run ultérieure. Build propre.

## Chantier or en temps réel + première icône "pixel art" (2026-08-11)

Trois demandes liées d'Antoine : voir l'or évoluer en temps réel pendant la
bataille (pas seulement récapitulé à la fin de la vague), un retour visuel
sur chaque kill, et une première incursion dans un style "pixel art" pour
certains sprites (icône de pièce, futur parchemin de soin).

**Or versé en temps réel par kill** ("dès que nous tuons une unité un gold
apparaît... en temps réel") — jusqu'ici, `applyBattleOutcome` calculait
TOUT l'or des kills d'un coup, à la toute fin de la bataille, en balayant
`world.entities`. `run/runState.ts` : nouvelle fonction
`awardKillGold(run, unitId, hooks)` — crédite `run.gold` IMMÉDIATEMENT et
renvoie le montant, appelée pour CHAQUE ennemi qui vient de mourir.
`applyBattleOutcome` ne calcule plus que le bonus de fin de vague (sinon
double paiement) ; `BattleOutcome.goldEarned` ne reflète donc plus que ce
bonus — `main.ts`, `lastBattleGoldEarned` (popup "+N or" à l'ouverture de la
boutique) n'a plus besoin de couvrir les kills, déjà montrés en temps réel
sur le champ de bataille.

- `main.ts` : détection des morts ennemies par TRANSITION
  (`rewardedEnemyDeaths: Set<number>`, vidé à chaque `world.clear()`)
  plutôt qu'en réagissant à `combatEvents` — une mort peut venir de TROIS
  sources distinctes (combat automatique, flèche du joueur, Charge du
  Cavalier), et cette méthode les couvre uniformément sans risque de double
  comptage si plusieurs coups visaient la même unité au même tick. Ajoutée
  dans la boucle de jeu, juste après les événements de capacités.
- `ui/combatOverlay.ts`, `spawnGoldText(x, z, amount)` — texte flottant
  "+N or" doré sur l'unité tuée (demande explicite : "+1 jaune ou une pièce
  apparaît sur la cible abattue"), même fabrique que miss/dodge/heal.
  `amount` peut être fractionnaire (archer = 1.5), affiché tel quel, même
  convention que l'affichage de l'or ailleurs.

**Affichage permanent de l'or** ("nous devons les voir tout du long de la
partie à côté de la fenêtre boutique") — `ui/goldHud.ts` (nouveau),
`GoldHud` : mis à jour INCONDITIONNELLEMENT à chaque frame depuis
`currentRun.gold` (pas sur événement) — aucun risque d'oublier un site
d'appel après un achat, une vente, ou un kill. Positionné au-dessus du bloc
Boutique/Vendre (`bottom: 140px`, calculé à partir des hauteurs CSS
existantes — même colonne, `right: 16px`). Même cycle de vie que
`WaveIndicator` (visible dès `startPlacement`, masqué à `quitToMenu`/fin de
run).

**Première icône "pixel art" générée par code** ("fais quelque chose dans
un style pixélisé... si tu veux déjà nous montrer ce que tu sais faire").
`ui/pixelIcon.ts` (nouveau) : `buildPixelIcon(grid, size)` — une grille de
couleurs (une chaîne vide = transparent) devient un SVG d'autant de
`<rect>` de 1×1, jamais une image importée (même règle "aucun asset
graphique" que le reste du projet, voir `itemIcons.ts` pour le style
existant "traits fins" — celui-ci est délibérément BLOC, sans lissage,
pensé pour lire comme un sprite 8-bit). `createCoinIcon(size)` — la grille
de la pièce est calculée par distance au centre (contour rond garanti,
sans risque d'erreur de comptage de caractères à la main) plus un petit
glyphe "$" tracé à la main (une courbe ne se déduit pas d'une formule de
distance) et une répartition clair/sombre en diagonale pour un relief
minimal. Antoine a fourni deux images de référence et une préférence
explicite pour la seconde (contour noir net, plus simple à reproduire) —
c'est celle-ci qui a servi de guide.

**Icône à côté de chaque prix** ("il faut également que l'icône de gold
apparaisse à côté de chaque prix dans le jeu") — `ui/screens.ts` : les 4
boutons d'achat de la boutique (`shopItemButton`, remplace l'ancien
`shopButton` texte brut) affichent désormais nom + coût + icône de pièce
dans une mise en page structurée (plus un simple `textContent`) ; l'affichage
d'or en tête de boutique gagne aussi son icône. Le coût de chaque bouton est
désormais FIXE à la construction (plus besoin de le réécrire à l'exécution,
contrairement à l'ancien libellé conditionnel du Cavalier — devenu inutile
depuis qu'il est masqué plutôt que relabellisé, voir le chantier
"Spécialisation Soigneur..." juste au-dessus).

Vérifié en headless : `awardKillGold` crédite immédiatement et applique
bien le bonus de talent par kill ; `applyBattleOutcome` ne recompense plus
les kills (testé explicitement contre un double paiement) ; la grille de la
pièce est bien de forme ronde (coins transparents), a un centre rempli, et
au moins 3 teintes distinctes (contour/remplissage/relief/glyphe). Build
propre. **Non vérifiable de mon côté** : rendu visuel réel de la pièce
(fidélité à la référence, lisibilité à petite taille), position exacte du
HUD d'or, aspect des boutons de la boutique — aucun accès au navigateur, à
confirmer et ajuster selon le retour d'Antoine.

## Fondateurs sans exclusivité (2026-08-10, même journée que le rollback)

Antoine, en regardant l'écran d'arbre de talents simplifié (screenshot
confirmant que le rollback s'affiche correctement) : "on va également
déverrouiller les spécialisations lorsqu'on met un point dans une autre" —
confirmé explicitement : les 3 talents fondateurs (Butin de guerre/Tir
rapide/Réflexes de vétéran) doivent devenir achetables librement et
INDÉPENDAMMENT, sans se verrouiller entre eux. Revient sur le mécanisme
"spécialisation exclusive et permanente" qui avait été explicitement gardé
tel quel lors du rollback précédent (celui-ci avait presque immédiatement
changé d'avis en voyant l'écran réel).

- `data/talents.ts` : `TalentDef.isFounder` retiré entièrement (n'avait plus
  aucun rôle). `branch` reste une étiquette purement thématique (Économie/
  Précision/Armée), sans effet d'exclusivité — descriptions des 3 fondateurs
  nettoyées de la phrase "verrouille définitivement...".
- `run/metaProgress.ts` : `MetaProgress.selectedSpecialization` retiré
  entièrement. `canUnlockTalent` ne vérifie plus que le talent universel
  comme prérequis des fondateurs (`or_depart` avant tout talent de branche) —
  plus aucune vérification d'exclusivité. `unlockTalent` ne fixe plus rien
  au-delà de `talentPoints`/`unlockedTalents`.
- `ui/screens.ts` : tout le mécanisme de confirmation ("Choisir Économie ?
  Ce choix verrouillera...", écran `founderConfirm`, `pendingFounderId`,
  `showFounderConfirm`, `BRANCH_LABELS`) est retiré — n'avait de sens que
  pour un choix irréversible, qui n'existe plus. Un clic sur un fondateur
  appelle directement `handlers.onUnlockTalent(id)`, exactement comme le
  talent universel.
- Pas de bump de version de sauvegarde nécessaire : les données existantes
  (points, talents débloqués) restent valides sous la règle relâchée — un
  joueur qui avait déjà débloqué un fondateur sous l'ancienne règle peut
  simplement acheter les 2 autres maintenant s'il a les points, rien à
  migrer.
- Vérifié en headless (script temporaire, supprimé après usage) : les 3
  fondateurs s'achètent tous les trois à la suite sans blocage, le talent
  universel reste un prérequis, `selectedSpecialization` n'existe plus dans
  l'objet retourné par `loadMetaProgress`. Build propre.

## Ajustements placement/UI post-Étape F (2026-08-10)

Lot de demandes ponctuelles d'Antoine après avoir testé la refonte des
talents en jeu réel (confirmé fonctionnel, voir screenshot de l'arbre à
paliers) — pas liées entre elles, traitées ensemble dans la même session.

- **Prix du Cavalier léger : 7 → 5 or.** Jugé trop cher pour sa valeur de
  combat actuelle après premier test réel ("un premier temps", pourra
  encore bouger). `data/units.ts`, `KILL_REWARD.cavalier_leger` ajusté en
  conséquence (2.5, toujours la moitié du prix boutique).
- **Indicateur de vague permanent** — FAIT. `ui/waveIndicator.ts`
  (nouveau) : petit encart "Vague N" en haut-centre de l'écran, visible
  pendant tout le placement ET la bataille (`main.ts`, affiché dans
  `startPlacement`, masqué dans `quitToMenu` et juste avant
  `showGameOver`). Couvre la vague EN COURS ; la vague qui vient d'être
  JOUÉE apparaît désormais aussi dans la bannière de transition
  (`Vague N — Victoire !`/`Défaite`) et dans l'écran de fin de vague
  (`Screens.showWaveComplete(waveNumber, result)`, signature étendue) —
  couvre le "actuelle et terminée" demandé.
- **Sélection par double-clic** — FAIT. Double-clic sur une unité posée en
  placement sélectionne désormais TOUTES les unités du même `unitId`,
  plafonnées aux `DOUBLE_CLICK_SAME_TYPE_MAX` (20, `config/constants.ts`)
  plus proches du point cliqué (tri par distance au carré, pas juste les
  premières trouvées dans le tableau) — devient une sélection de groupe
  normale (déplaçable en bloc, même mécanique que l'encadrement au sol),
  sauf s'il n'y a qu'une seule unité de ce type : simple sélection dans ce
  cas, même convention que `selectUnitsInRect`. `main.ts`, listener natif
  `dblclick` sur le canvas.
- **Barrière de sécurité sur l'or non dépensé + bouton renommé** — FAIT.
  `goldAtPlacementStart` (capturé au tout début de `startPlacement()`,
  avant l'ouverture automatique de la boutique) sert de référence : au clic
  sur le bouton de validation, si l'or actuel dépasse 10 % de cette valeur
  de départ, un popup ("Il vous reste N or non dépensé. Lancer la bataille
  quand même ?") s'affiche avant de lancer la bataille pour de bon —
  `ui/screens.ts`, nouvel écran `placementGoldWarning`
  (`showPlacementGoldWarning`, boutons Annuler/Lancer quand même), `main.ts`
  `requestValidatePlacement()` s'intercale désormais entre le clic du
  bouton et `onValidatePlacement()` (qui n'est appelée directement que si
  sous le seuil, ou depuis "Lancer quand même"). Bouton renommé
  `ui/placementPanel.ts` : "Valider le placement" → "Prêt pour la
  bataille" ; le texte d'aide rappelant le geste de placement
  ("Clique une unité pour la sélectionner...") est retiré entièrement,
  jugé inutile passé la première découverte.
- **Vérification du talent Pillage — AUCUN BUG TROUVÉ.** Antoine a remonté
  ne pas avoir ressenti d'effet significatif en jeu. Revue de code complète
  du chemin `main.ts` (`computeTalentEconomyHooks(metaProgress, () =>
  world.rollFloat())`) → `run/talentEffects.ts` (`bonusGoldPerKill`) →
  `run/runState.ts` (`applyBattleOutcome`, appelle bien le hook une fois
  PAR ennemi mort) : le câblage est intact et correspond exactement aux
  tests headless déjà validés à l'Étape F. Explication la plus probable,
  pas un bug : à rang 3/3 (15 %) le talent n'ajoute qu'un or occasionnel
  PAR-DESSUS le bonus déjà GARANTI de Butin de guerre (+1/kill à 100 %,
  bien plus visible) — sur une petite vague (quelques ennemis), l'espérance
  de gain de Pillage seul est de l'ordre de 1 or, difficile à distinguer du
  bruit. Antoine a prévenu qu'il augmentera probablement ces valeurs — pas
  fait ici, décision de réglage qui lui revient (voir
  `TALENT_PILLAGE_CHANCE` dans `config/constants.ts`).

## Correctifs de placement (2026-08-10, après le rollback des talents)

Trois bugs remontés par Antoine en testant la session précédente, traités
ensemble.

- **Double-clic (sélection multi-unités du même type) ne fonctionnait pas** —
  CORRIGÉ. Diagnostic exact confirmé par Antoine : le premier clic
  sélectionnait l'unité (anneau visible), le second la désélectionnait
  (toggle simple appliqué deux fois de suite) — l'événement natif
  `dblclick` du navigateur ne se déclenchait jamais par-dessus, pour une
  raison non identifiée avec certitude (probablement une interaction avec
  notre propre résolution mousedown/mouseup différée pour le glisser-vendre).
  Remplacé par une détection MANUELLE intégrée directement dans le listener
  `mousedown` existant : `lastUnitClickSlot`/`lastUnitClickTime`, si un
  second mousedown tombe sur la MÊME unité en moins de
  `DOUBLE_CLICK_WINDOW_MS` (400 ms), `selectSameTypeGroup()` s'exécute
  immédiatement et la fonction retourne SANS poser `unitDrag` — le mouseup
  qui suit ne fait donc plus rien (`if (!unitDrag) return`) et n'annule plus
  la sélection de groupe qu'on vient de poser. Le listener `dblclick` séparé
  est supprimé entièrement.
- **Clic de déplacement qui échoue silencieusement près d'un bord de case**
  — CORRIGÉ. `computeHoveredTile` arrondit (`floor`) le point d'intersection
  du rayon avec le sol vers la case correspondante ; près d'un bord, la
  caméra inclinée peut faire tomber ce calcul sur la case VOISINE de celle
  visuellement ciblée — si cette case voisine est invalide (occupée, hors
  zone), le déplacement échouait sans aucun retour. `main.ts`,
  `findNearestValidTile(unitId, targetX, targetZ, excludeIndices)` (nouveau) :
  si la case visée est déjà valide, la renvoie telle quelle (cas normal,
  aucun coût) ; sinon cherche la case valide la PLUS PROCHE dans un rayon
  fixe et volontairement petit (`MOVE_CLICK_NEAREST_TILE_RADIUS = 1`,
  `config/constants.ts`) — distinct de `findFreePlacementTile` (rayon
  illimité, pensé pour "trouver n'importe quelle case libre même loin" lors
  d'un achat, pas pour corriger une imprécision de clic). Branché sur les 3
  sites concernés : clic simple (`handleEmptyTileClick`), glisser (mouseup),
  ET l'aperçu bleu affiché pendant le glisser (pour que l'aperçu corresponde
  exactement à ce qui se passera au relâchement — sinon un aperçu masqué
  aurait pu être suivi d'un déplacement qui réussit quand même). Pas
  appliqué au déplacement de GROUPE (`handleGroupMoveClick`,
  `computeGroupPreview`) : plus complexe (il faudrait valider tout le
  groupe ensemble), pas demandé explicitement, laissé tel quel pour
  l'instant.
- **Menu pause (Échap) ne fonctionnait pas pendant le placement** — CORRIGÉ.
  `openPauseMenu()` avait un garde `!inBattlePhase()` qui excluait
  explicitement la phase de placement (aucune façon d'abandonner une run en
  cours de placement sans recharger la page). Le garde accepte désormais
  `inBattlePhase() || inPlacementPhase`. Piège évité : `.sell-zone-container`
  (bouton "Vendre"/"Boutique") a un z-index DÉLIBÉRÉMENT supérieur à
  `.screen-overlay` (voir plus haut, "Bouton Boutique qui bascule
  ouvrir/fermer") pour rester cliquable quand la boutique s'ouvre par-dessus
  le placement — sans précaution, il serait resté visible ET cliquable
  par-dessus le menu pause aussi. `openPauseMenu`/`resumeFromPause` masquent
  donc explicitement `sellZone`/`placementPanel` pendant la pause EN
  PLACEMENT (`inventoryBar` n'a pas ce problème, son z-index est déjà
  inférieur à `.screen-overlay`). `quitToMenu` gérait déjà correctement le
  nettoyage placement ET bataille sans distinction (déjà écrit pour être
  appelé depuis n'importe quel contexte) — aucun changement necessaire là.

## Chantier bestiaire — Cavalier léger (en cours)

Démarré le 2026-08-10 : troisième unité jouable (mobilité/charge/flanking),
explicitement DISTINCTE du futur Chevalier monté (plus lourd, plus résistant
— pas encore commencé, `canAttackWhileMoving` lui reste réservé). Demande
détaillée d'Antoine, avec une exigence architecturale explicite : la Charge
doit être la PREMIÈRE vraie capacité d'unité générique du jeu, pas un bout de
code spécial Cavalier — pour que de futures unités (Porte-bouclier, soigneur,
mage, mini-boss...) puissent recevoir des capacités sans reconstruire le
moteur à chaque fois.

- **`src/data/abilities.ts`** (nouveau, pur comme units.ts/items.ts/talents.ts) :
  `AbilityDef` est une UNION extensible (`ChargeAbility` seul membre pour
  l'instant — `type: 'charge'`, `cooldown`, `maxRangeTiles`, `damage`,
  `dashSpeed`). Une capacité est CONFIGURÉE directement sur l'unité qui la
  possède (`UnitDef.abilities?: AbilityDef[]`), pas référencée par id depuis
  un catalogue partagé (contrairement à `talents.ts`/`items.ts`) : deux
  unités pourront vouloir "le même type de capacité" avec des réglages
  différents (la charge du futur Chevalier lourd, par exemple). `findAbility(abilities, type)`
  retrouve une capacité typée précisément (`Extract`).
- **`src/data/units.ts`** : nouvelle entrée `cavalier_leger` — PV 60/60 interne
  (6 affichés, demande explicite), dégâts d'attaque automatique 10 interne (1
  affiché, demande explicite), `attackCooldown` référence DÉSORMAIS
  `FANTASSIN_ATTACK_COOLDOWN` (constante extraite dans `config/constants.ts`,
  et le fantassin lui-même mis à jour pour la référencer aussi) plutôt que de
  dupliquer `1.0` — "les deux stats restent synchronisées par construction,
  pas par coïncidence numérique" (demande explicite). `moveSpeed: 3.5`
  (fantassin 2.2, archer 2.0 — "nettement plus rapide", +59% vs fantassin,
  valeur choisie par Claude). Valeurs NON spécifiées par Antoine, choisies par
  cohérence et clairement commentées comme telles dans le code : `attackRange`
  0.95 (comme le fantassin, mêlée), `aggroRange` 10 (comme l'archer),
  `missChance` 0.12 (comme le fantassin), `cost` 4 (boutique, jamais
  confirmé). Capacité Charge : cooldown 10s, dégâts 30 interne (3 affichés),
  `dashSpeed` = `CHARGE_DASH_SPEED` (12 cases/s, nouvelle constante,
  INDÉPENDANTE de `moveSpeed` — "beaucoup plus rapide que son déplacement
  normal"). **Portée doublée le 2026-08-10 (même journée, après premier
  test) : `maxRangeTiles` 3 → 6** (demande explicite d'Antoine, aucune autre
  raison). **`radius` monté à 0.6** le même jour (voir section "Emprise
  réelle 1x2" plus bas, ce n'est plus 0.48).
- **Recul d'impact ("bump") — FAIT** (2026-08-10, même journée, demande
  explicite : "repousser l'unité touchée d'une case"). `config/constants.ts`,
  `CHARGE_KNOCKBACK_TILES = 1`. `sim/systems/abilities.ts`, `advanceDash` :
  juste après les dégâts, repousse la cible d'une case en CONTINUANT l'axe de
  la charge (direction cavalier→cible au moment de l'impact, PAS l'inverse —
  un bug de signe a été trouvé et corrigé en testant : le premier essai
  poussait la cible VERS le cavalier au lieu de l'en éloigner). Seules les
  limites du plateau sont respectées explicitement (`clamp`) ; aucune
  vérification d'obstacle sur la destination du recul — `resolveObstacleCollisions`
  (movementSystem, tourne sur TOUTES les entités chaque tick, y compris
  celle-ci) la ressort d'un éventuel chevauchement au tick suivant si besoin,
  même tolérance déjà acceptée ailleurs pour la séparation entre corps.
  **Piège de test découvert en vérifiant** : mesurer le déplacement net sur
  un tick complet (via `World.step`) sous-estime le recul, parce que la
  poursuite normale (les deux unités ne sont plus à portée l'une de l'autre
  juste après le recul) en regagne aussitôt une fraction dans le MÊME tick —
  comportement correct, pas un bug. Le recul BRUT (exactement 1 case) n'est
  vérifiable qu'en appelant `abilitySystem` isolément, sans `movementSystem`
  ensuite — voir le test headless.
- **`sim/entity.ts`** : `Entity.abilityCooldowns: Partial<Record<AbilityDef['type'], number>>`
  (générique, une entrée par TYPE de capacité possédée, pas un champ par
  capacité) et `Entity.dash: DashState | null` — état de RUÉE SCRIPTÉE
  générique (`targetId`, `fromX/fromZ/toX/toZ`, `elapsed/duration`, `damage`),
  explicitement pensé pour être réutilisé par une future capacité similaire
  (un futur Chevalier lourd, un mini-boss...), pas seulement la Charge.
- **`sim/geometry.ts`** : `findBlockingObstacle` DÉPLACÉE ici depuis
  `sim/systems/combat.ts` (import partagé) — c'est exactement le test de
  "trajectoire libre" dont la Charge a besoin (demande explicite : "utilise
  autant que possible le système de collision/footprint existant, pas une
  liste spéciale codée uniquement pour le Cavalier"). Aucun flag
  `blocksMovement` n'existe sur `ObstacleDef` : tous les obstacles bloquent
  déjà uniformément (pas ET ligne de tir), donc passer `obstacles` tel quel
  suffit.
- **`sim/systems/abilities.ts`** (nouveau système générique) : par entité
  vivante, chaque tick — (1) décompte des cooldowns (générique, toutes
  capacités confondues), (2) si une ruée est en cours, l'avance et la résout
  à l'arrivée (dégâts + évènement), (3) sinon tente de déclencher une capacité
  disponible. Le déclenchement de la Charge RÉUTILISE `entity.targetId`
  (posé par `targetingSystem`) plutôt que de scanner les ennemis une deuxième
  fois — "règle déterministe cohérente avec notre système actuel de ciblage"
  obtenue gratuitement, aucune IA de charge séparée à écrire. Conditions
  vérifiées avant déclenchement, dans l'ordre : cible vivante existante,
  distance ≤ `maxRangeTiles` (mesurée centre à centre, cohérent avec
  `attackRange`/`aggroRange` — voir "Unité de mesure : la case"), trajectoire
  libre (`findBlockingObstacle`, testée jusqu'à la cible elle-même, pas
  jusqu'au point d'arrêt), point d'arrivée dans les limites du plateau. Le
  cooldown ne démarre QUE sur un déclenchement réel — une tentative invalide
  ne modifie rien (demande explicite). Point d'arrêt calculé EXACTEMENT comme
  le reste du jeu s'arrête pour attaquer (`attackRange + target.radius`,
  même formule que `movementSystem`) pour ne jamais superposer le Cavalier et
  sa cible ; `Math.max(0, ...)` empêche la ruée de reculer si la cible est
  déjà à portée de mêlée (cas "charge à 1 case").
  **Bug trouvé et corrigé en testant** : la destination de la ruée est figée
  au moment du déclenchement, mais la cible (elle) continue de se déplacer
  normalement pendant le court vol (~2 ticks) — si elle se rapproche pendant
  ce temps, un léger chevauchement résiduel devient possible à l'arrivée.
  Corrigé par une passe de correction finale à la résolution (même principe
  que `resolveObstacleCollisions`) qui ressort le Cavalier à la distance de
  contact minimale si besoin, avec une petite marge de sécurité (1e-3 case)
  sous le seuil d'`attackRange` pour éviter qu'un bruit de calcul flottant ne
  déclenche un micro-pas de poursuite parasite au tick suivant (observé en
  test headless avant correction).
- **`sim/world.ts`** : `abilitySystem` branché dans `step()` AVANT
  `movementSystem` (une ruée qui vient de se déclencher doit contrôler x/z
  ce tick) ; `World.spawn()` initialise `abilityCooldowns: {}`/`dash: null`.
  Un seul garde-fou ajouté à `movementSystem` (`if (e.dash) continue`) —
  aucune autre modification du système de mouvement existant.
- **`render/unitMesh.ts`** : `buildCavalier` — PLACEHOLDER explicitement
  temporaire (voir ci-dessous, aucun asset adapté trouvé). Réutilise le même
  mécanisme de bras animé que le fantassin (`userData.attackArm`, la lance
  joue le coup automatique via `UnitViews.tickAttackAnim` sans code de rendu
  nouveau) ; pas de jambes animées (cheval simplifié, `tickWalkAnim` tolère
  déjà leur absence).
- **`main.ts`** : les évènements de capacité (`world.abilityEvents`) sont
  consommés comme les évènements de combat — un `charge-impact` déclenche
  `unitViews.playHit()` (réutilise le flash blanc déjà existant, "petit effet
  d'impact" demandé sans nouveau système VFX). Aucune autre modification :
  l'attaque automatique du Cavalier passe déjà par le chemin `unitViews.playAttack`
  existant (dispatch par `visual.kit !== 'archer'`), sans changement.
- **Éditeur / compatibilité map** : AUCUN changement nécessaire. Le bestiaire
  de l'éditeur (`editor/editorUI.ts`, `UNIT_ASSETS`) est déjà construit
  dynamiquement depuis `Object.values(UNITS)` — le Cavalier y apparaît
  automatiquement. La sérialisation de map (`editor/mapSerializer.ts`)
  traite `unitId` comme une chaîne opaque, sans liste ni cas spécial — un
  Cavalier placé dans l'éditeur (camp déterminé par la moitié du plateau,
  comme toute unité) survit à l'export/import JSON exactement comme
  fantassin/archer.
- **Modèle visuel manquant, à chercher** : aucun cheval/cavalier dans la
  banque d'assets actuelle (Kenney Nature Kit pour le décor, un `.obj`
  Blockbench pour la baliste — pas de pack Quaternius malgré la supposition
  initiale d'Antoine, vérifié directement). Ce qu'il faudrait : un modèle
  bas-poly de cheval monté (ou cheval seul + cavalier séparé), style compatible
  avec les rochers/arbres déjà importés (Kenney Nature Kit ou équivalent
  CC0/libre de droits), une seule pièce ou peu de pièces (pas de rig
  d'animation complexe requis — l'unité n'a pas besoin d'un cycle de galop
  animé pour l'instant, voir plus haut). Une fois trouvé : remplacer
  `buildCavalier` par un chargement `.glb` (même patron que
  `render/ballista.ts` ou `render/assetLibrary.ts`).
- Vérifié en headless (`World`/`abilitySystem` directement, aucun mock) :
  stats de base, cadence identique au fantassin (même référence), vitesse
  supérieure aux deux autres unités, Charge disponible dès le spawn, dégâts
  de charge exacts (30, en tenant compte du fait que l'attaque automatique
  PEUT légitimement se déclencher le même tick — les deux systèmes sont
  volontairement indépendants), cooldown de 10s démarré uniquement sur
  déclenchement réel et respecté avant sa fin, charge à 1/2/3 cases valide,
  refus au-delà de 3 cases, refus si un rocher ou un arbre bloque la
  trajectoire, refus si le point d'arrivée sortirait des limites du plateau,
  absence de superposition de corps à l'impact, reprise du comportement de
  combat normal après la charge.

**Emprise réelle 1x2 — FAIT** (2026-08-10, même journée, demande d'Antoine
après avoir vu le placeholder dans l'éditeur : "il a une taille de 1x1, je
veux qu'il soit plus grand et qu'il prenne 2x1 par unité, il faut que la
taille d'un cavalier soit réaliste par rapport aux autres unités"). Question
posée avant d'implémenter (l'éditeur ne validait alors AUCUN chevauchement
d'unité, découverte faite en lisant `editor/editorState.ts` — `placeUnitAt`/
`moveSelectedUnit` n'ont toujours aucun garde-fou d'occupation, pour aucune
unité, pas seulement le Cavalier) : vrai footprint qui bloque réellement 2
cases (choisi par Antoine), plutôt qu'une silhouette juste plus grande sans
changement de collision.

- `data/units.ts` : `UnitDef.footprint?: { tilesX, tilesZ }` (absent = 1x1,
  comme toutes les unités jusqu'ici) — `cavalier_leger` obtient
  `{ tilesX: 1, tilesZ: 2 }`. Seul `tilesZ` est géré par le code de placement
  (voir plus bas) : hypothèse de Claude sur l'orientation du "2x1" demandé
  (2 cases dans le sens de la longueur museau-croupe d'un cheval — plus long
  que large — plutôt que 2 cases côte à côte), à corriger si ce n'est pas
  l'intention d'Antoine — un simple changement de convention dans
  `getFootprintTiles`, rien de structurel à refaire. `radius` séparément
  monté à 0.6 (contre 0.42 pour le fantassin) : bulle de séparation
  physique réellement plus grande PENDANT la bataille, distinct du footprint
  qui ne s'applique qu'à la grille de PLACEMENT — les deux mécanismes sont
  complémentaires, pas redondants.
- `main.ts` : `getFootprintTiles(unitId, anchorX, anchorZ)` dérive les cases
  occupées depuis la case d'ANCRE (toujours la case de FRONT, exactement la
  même convention que toute unité 1x1 — portée d'attaque/ciblage/rendu ne
  changent pas) en étendant vers l'ARRIÈRE du camp joueur uniquement
  (`forwardDir('player')`) — ces fonctions ne servent qu'à la phase de
  placement du joueur, jamais à la formation ennemie générée
  (`computeEnemyWavePlacements`, calcul de mise en page séparé sans
  validation d'occupation, inchangé). `isValidPlacementTile` (le test bas
  niveau, une seule case) est étendu pour vérifier l'emprise COMPLÈTE de
  CHAQUE autre slot déjà posé, pas seulement son ancre — un Cavalier déjà en
  place bloque désormais aussi sa case arrière pour tout le monde.
  `isValidPlacementForUnit(unitId, x, z, exclude)` (nouveau) valide qu'une
  unité PRÉCISE tiendrait entièrement (toutes ses cases) à un endroit — tous
  les sites d'interaction (clic simple, glisser simple, clic de groupe,
  glisser de groupe, ajout d'une unité achetée en placement) migrés dessus.
  L'aperçu bleu (`PlacementHighlight`) affiche désormais un cadre par case
  RÉELLEMENT occupée (`getFootprintTiles`), pas juste sous le curseur.
- `render/unitMesh.ts`, `buildCavalier` : tout le contenu déplacé dans un
  sous-groupe `body`, décalé d'une demi-case vers l'arrière
  (`body.position.z = TILE * 0.5`) puis le groupe RACINE mis à l'échelle
  entière (`CAVALIER_SCALE = 1.6`) — jamais la position du groupe racine
  lui-même, qui est écrasée à chaque frame par `UnitViews.sync` (interpolation
  de la position monde) ; un décalage posé dessus serait silencieusement
  perdu. Le silhouette visuelle chevauche donc réellement les deux cases
  occupées, plutôt que de tenir entièrement dans la case de front.
- Vérifié en headless (réimplémentation fidèle de la logique de
  `main.ts`, celle-ci import des side-effects DOM/canvas au chargement donc
  non testable directement) : calcul des 2 cases depuis l'ancre, un Cavalier
  déjà posé bloque bien sa case de front ET sa case arrière pour un autre
  slot, une case simplement voisine reste libre, le Cavalier peut se
  revalider lui-même à sa propre position (exclusion), un fantassin ne
  bloque toujours qu'une seule case, refus si la case arrière (pas
  nécessairement la case de front) sortirait de la zone de placement.

**Placeholder retouché après premier retour visuel d'Antoine** (2026-08-10,
même journée : "les chevaux sont un peu trop cubiques", "on voit trop un
cube au bout de la lance"). Toujours dans la règle "tout en boîtes" — plus
de boîtes, mieux proportionnées, pas de géométrie courbe ajoutée.
- **Corps du cheval** : remplacé la boîte unique par 3 segments qui se
  chevauchent légèrement (poitrail plus haut à l'avant, barrel au milieu,
  croupe qui redescend vers l'arrière) — casse la lecture "monolithe
  rectangulaire" sans sortir du vocabulaire de boîtes.
- **Pointe de lance** : remplacée par DEUX segments de section décroissante
  (0.055 puis 0.028 de large) plutôt qu'une seule boîte — fausse un
  effilement/une pointe avec des boîtes, même technique que les paliers déjà
  utilisés ailleurs pour suggérer une forme sans géométrie courbe.
  Alternative proposée par Antoine ("remplacer simplement par une épée plus
  courte comme les fantassins") non retenue : la lance reste l'identité
  visuelle distinctive du Cavalier dans la référence fournie, un défaut de
  pointe se corrige sans l'abandonner.

**Deuxième passe d'équilibrage (2026-08-10, même journée, après le prix 7→5
documenté plus bas)** : PV 60→70 (7 affichés) et dégâts de Charge 30→50 (5
affichés) — jugés trop faibles par Antoine après un nouveau test réel.

**Prix fixé à 7 or (puis ajusté à 5, voir plus bas), déblocage permanent à la vague 5** — FAIT (2026-08-10,
demande d'Antoine dans le cadre de la refonte de l'arbre de talents, voir
chantier ci-dessous). Le Cavalier n'était jusque-là ni achetable en boutique
ni tarifé de façon confirmée (`cost: 4`, placeholder). `data/units.ts` passe
à `cost: 7`. Nouveau mécanisme générique et réutilisable pour de futures
unités : `config/constants.ts`, `CAVALIER_UNLOCK_WAVE = 5` ;
`run/metaProgress.ts`, `MetaProgress.unlockedUnits: string[]` (permanent,
persisté comme les points de talent) + `isUnitUnlocked`/`unlockUnit`. Le
déblocage se déclenche dans `main.ts`, au même endroit que le calcul de l'or
de fin de bataille : si la vague qui vient d'être **gagnée** (capturée avant
l'incrément de `run.waveNumber` par `applyBattleOutcome`) est
`CAVALIER_UNLOCK_WAVE`, sauvegarde immédiate — jamais via "Tester le
scénario" de l'éditeur (`inTestMode`, branche séparée, non concernée). La
boutique (`ui/screens.ts`) affiche toujours le bouton Cavalier, mais
désactivé avec le libellé "débloqué à la vague 5" tant qu'il n'est pas
débloqué — même logique que le parchemin de soin désactivé sans cible.
`KILL_REWARD.cavalier_leger = 3.5` ajouté (moitié du nouveau coût, même
convention que fantassin/archer) — sans ça, tuer ou vendre un Cavalier
rapportait 0 or par défaut.

## Chantier arbre de talents — refonte complète (en cours)

Démarré le 2026-08-10 : Antoine a fourni un document de conception complet
("quasi-contractuel", ses mots) qui remplace le prototype minimal
(1 talent universel + 3 branches à 1 nœud chacune) par un vrai système façon
WoW en ESPRIT (lisibilité/profondeur, pas copie visuelle) — branches
verticales, rangs, paliers, prérequis génériques, spécialisation exclusive et
permanente. Trois branches prévues : Économie 💰 (20 talents mineurs déjà
intégralement spécifiés par Antoine), Précision 🎯 et Armée 🛡️ (pour l'instant
juste leur fondateur existant, contenu détaillé à venir dans un message
séparé). Avant tout code, un diagnostic complet du projet existant a été
livré (stockage de la progression, de l'or, de la boutique, achat/revente,
attribution d'or au kill, sauvegarde) répondant aux 14 questions posées par
Antoine, plus une liste explicite des écarts architecturaux (revente basée
sur le TYPE d'unité et non le prix payé, aucun RNG persistant au niveau de la
run, boutique à 3 boutons fixes sans notion de catalogue, `OwnedUnit` sans
`pricePaid`/`wavesSurvived`, `applyBattleOutcome` monolithique) — validé par
Antoine, plan en étapes A→I confirmé ("fais ce qu'il te semble le mieux pour
la structure finale").

**Étape A — nouveau modèle de données, FAITE** (2026-08-10). Périmètre
volontairement limité aux 4 talents déjà existants (l'universel + 3
fondateurs) : la refonte de la FORME des données d'abord, les 20 talents
mineurs Économie arrivent à une étape ultérieure séparée (Étape E, une fois
cette base validée par Antoine).
- `data/talents.ts` réécrit : `TalentDef` gagne `tier`, `maxRank`,
  `costPerRank` (remplace `cost`), `isFounder`, `requiredBranchPoints`
  (seuil de palier, "points investis dans la branche"), `allOf`/`anyOf`
  (remplacent `requires: string | null` — un simple prérequis devient
  `allOf: ['id']`, la disjonction `anyOf` est nouvelle), `implementationStatus`
  (`'pending-system'` réservé aux futurs talents qui dépendront de systèmes
  pas encore construits — tags élite/miniboss, catalogue de boutique — jamais
  montré au joueur). Branche `'tireur'` renommée `'precision'` pour matcher
  le vocabulaire du document de conception. Les 3 fondateurs passent de
  coût 2 à coût 1 (`costPerRank: 1`), plus besoin de `requires: 'or_depart'`
  explicite : la dépendance à l'universel est désormais une règle générique
  dans `metaProgress.ts` (toute branche non-null l'exige), pas une donnée
  par talent.
- `run/metaProgress.ts` réécrit. Nouvelle forme : `talentTreeVersion`,
  `talentPointsAvailable` (dépensable) séparé de `talentPointsEarned` (total
  jamais décrémenté, repère de progression), `introTalentRank: 0|1` (talent
  universel, plus dans `talentRanks`), `selectedSpecialization` (fixée une
  fois pour toutes à l'achat d'un fondateur, jamais remise à `null` ensuite —
  aucun respec en V1), `talentRanks: Record<string, number>` (remplace le
  tableau `unlockedTalents` — nécessaire dès qu'un talent peut avoir plusieurs
  rangs), `unlockedUnits` (voir Cavalier ci-dessus).
  `canUnlockTalentRank`/`unlockTalentRank` implémentent l'exclusivité de
  spécialisation de façon générique (branche différente de
  `selectedSpecialization` déjà posée → toujours refusé, quel que soit le
  talent visé) et le palier (`pointsInvestedInBranch`, somme des rangs déjà
  achetés dans la branche × leur coût, comparée à `requiredBranchPoints`).
  Un rang ne peut jamais être acheté "en sautant" le précédent : chaque appel
  n'autorise que `rang courant + 1`, donc le rang précédent est un prérequis
  implicite sans code dédié.
  **Migration de l'ancien format** (sauvegardes déjà existantes, sans
  `talentTreeVersion` du tout — c'est le signal utilisé pour détecter
  l'ancien format) : trois cas exactement comme discutés avec Antoine — (A)
  aucun fondateur débloqué : conversion directe, aucun remboursement ; (B)
  exactement un fondateur : spécialisation conservée, rang mis à 1/1,
  remboursement de 1 point (ancien coût 2 → nouveau coût 1) ; (C) plusieurs
  fondateurs (état devenu invalide avec l'exclusivité) : aucun n'est
  conservé, chacun est retiré et intégralement remboursé à son ancien coût
  (2 chacun), le joueur est libre de rechoisir — le reste de la sauvegarde
  (points, `or_depart`) n'est jamais touché. Vérifié en headless (script
  temporaire, supprimé après usage) : les 3 cas de migration, l'exclusivité
  de spécialisation (achat refusé sur une branche différente une fois
  choisie), la persistance round-trip, et le déblocage du Cavalier.
- `ui/screens.ts` adapté à la nouvelle API sans encore reconstruire l'arbre
  visuel complet (paliers/rangs multiples — ça reste l'Étape D, avec les 20
  nœuds Économie de l'Étape E). Un changement fonctionnel ajouté au passage,
  explicitement demandé par Antoine pour cette refonte : l'achat d'un talent
  **fondateur** ouvre désormais un écran de confirmation dédié
  (`founderConfirm`, texte dynamique selon la branche visée) avant d'appeler
  `onUnlockTalent` — irréversible, verrouille 2 branches sur 3, jamais de
  `window.confirm()` natif (même règle que `resetConfirm`). Un talent
  universel/mineur s'achète toujours directement, sans confirmation.
**Étape E — les 21 nœuds complets de la branche Économie, FAITE** (2026-08-10,
données uniquement — voir avertissement ci-dessous). `data/talents.ts`
contient maintenant le fondateur `butin_de_guerre` + les 20 talents mineurs
intégralement spécifiés par Antoine (Pillage, Marchandage, Liquidation,
Fonds de campagne — palier I ; Chasseur de primes, Prime de victoire, Client
fidèle, Recyclage — palier II, seuil 6 points investis ; Intérêts, Bonne
affaire, Fournisseur, Assurance militaire — palier III, seuil 14 ; Contrat
militaire, Prime de risque, Spéculateur, Marché noir — palier IV, seuil 22 ;
Trésor de guerre, Profiteur de guerre, Maître marchand — palier V, seuil 30 ;
Seigneur de guerre — capstone, seuil 35). `TalentDef` gagne `rankEffects:
string[]` (un texte par rang, longueur = `maxRank`) — sépare l'intention
générale du talent (`description`) de l'effet PRECIS de chaque rang, pour que
la future UI (Étape D) puisse afficher "rang actuel" et "prochain rang" sans
recalculer un texte. Vérifié en headless (script temporaire, supprimé après
usage) : exactement 21 nœuds dans la branche, coût total pour la compléter
= 41 points (+1 pour le talent universel = 42 depuis une sauvegarde neuve,
conforme à la cible d'Antoine), achat de la branche ENTIÈRE dans l'ordre des
prérequis sans blocage imprévu, seuils de palier respectés (un talent de
palier II refusé avant 6 points investis même si son prérequis direct est
déjà rempli), `anyOf` du capstone fonctionnel.

**Important — ces 21 talents n'ont PAS encore d'effet réel sur le jeu.**
C'est strictement une étape de DONNÉES (Étape E du plan) : aucun ne modifie
la simulation, l'économie ou la boutique pour l'instant (branchement prévu
aux étapes F/G). L'UI actuelle (`buildTalentTree` dans `ui/screens.ts`)
n'affiche toujours qu'UN SEUL nœud par branche (`.find()` singulier, cherche
le premier talent de la branche) — les 20 nouveaux nœuds Économie existent
dans les données mais ne sont PAS ENCORE visibles ni cliquables en jeu,
volontairement : reconstruire l'affichage en paliers/rangs est l'Étape D,
pas encore commencée. Chaque talent est marqué `implementationStatus:
'ready'` (peut être branché avec les systèmes existants) ou
`'pending-system'` (dépend d'un système qui n'existe pas encore : tags
élite/mini-boss pour Chasseur de primes ; prix réellement payé par unité
pour Liquidation/Assurance militaire ; vagues survécues pour Recyclage ; un
vrai catalogue de boutique avec offres adressables/coupons pour Marchandage,
Client fidèle, Bonne affaire, Fournisseur, Contrat militaire, Marché noir,
Maître marchand ; l'effet de Trésor de guerre est volontairement non défini,
en attente de confirmation d'Antoine).

**Étape D — nouvelle UI à paliers, FAITE** (2026-08-10). `ui/screens.ts`,
`buildTalentTree` reconstruit désormais chaque branche comme une VRAIE
colonne (`buildBranchColumn`) plutôt qu'un unique nœud : le fondateur en
haut, puis — seulement pour Économie, qui a du contenu mineur (Précision et
Armée affichent juste "Talents à venir", `getBranchTalents(branch)` vide de
mineurs) — un empilement de blocs de palier (`talent-tier`, titre "Palier
I".."V"/"Capstone" + les nœuds de ce palier), triés par `tier` puis dans
l'ordre naturel de `data/talents.ts`. Le connecteur SVG racine→3 fondateurs
n'a pas changé (toujours valide, il ne relie que cette rangée-là). Les 20
nœuds mineurs sont en mode COMPACT (`buildTalentNode`, `talent-node--compact`) :
nom + rang/coût visibles, description + effet de chaque rang
(`TalentDef.rankEffects`) déplacés en info-bulle native (`title`) faute de
place à 140px de large — un vrai tooltip stylé (survol personnalisé,
prochain rang en aperçu) reste un raffinement pour plus tard, pas fait ici.
`ui/style.css` : `.screen-talents .screen-panel` devient défilant
(`max-height: 86vh; overflow-y: auto`), seul écran concerné (l'arbre
Économie complet dépasse largement la hauteur d'un écran) ; nouvelles
classes `talent-branch-column`/`talent-branch-minors`/`talent-tier`/
`talent-tier-label`/`talent-tier-nodes`/`talent-node--compact`.

**Non vérifiable de mon côté — aucun accès visuel au rendu.** Cette UI
compile (`tsc`/`vite build` propres) mais n'a pu être vérifiée que par
lecture de code, pas par capture d'écran : la mise en page réelle (largeur
de colonne, défilement, lisibilité du texte compact, comportement du
`title` natif au survol) reste à confirmer par Antoine dans le navigateur.

**Avertissement donné à Antoine avant qu'il teste : les achats sur cet écran
sont réels et définitifs sur sa sauvegarde (pas de mode test, pas de
respec).** Les 20 talents mineurs Économie sont déjà achetables (ils
consomment de vrais points de talent) mais **aucun n'a le moindre effet en
jeu pour l'instant** (voir Étape E ci-dessus, étapes F/G pas commencées) —
cliquer dessus pour voir le rendu dépense réellement des points sur des
talents encore inertes, sans possibilité de les rembourser en V1.

**Étape F — effets réels des talents `'ready'`, FAITE** (2026-08-10).
`run/talentEffects.ts` (nouveau) centralise le calcul des bonus économiques
à partir de `MetaProgress` — seul ce module (avec `main.ts`, qui l'appelle)
sait ce qu'est un talent ; `run/runState.ts` ne reçoit que des fonctions déjà
calculées (`TalentEconomyHooks`), même principe que l'ancien
`bonusGoldPerKill` numérique qu'il remplace. `applyBattleOutcome` respecte
maintenant l'ordre EXACT demandé par Antoine : kills → récompenses de kill
(+ jet de Pillage par kill) → VICTOIRE → bonus de vague → `onVictory` (Prime
de victoire + Prime de risque + Profiteur de guerre) → `onGoldSettled`
(Intérêts, calculé sur l'or APRÈS tous les bonus ci-dessus) →
`onSpeculativeCheck` (Spéculateur, en tout dernier). Six talents sont
désormais réellement actifs, en plus des 4 déjà en place avant cette
refonte :
- **Fonds de campagne** : additif à `or_depart`, voir `computeStartingGoldBonus`.
- **Pillage** : jet PAR kill via `World.rollFloat()` (nouvelle méthode
  publique, réutilise le RNG déterministe DE LA BATAILLE — même instance que
  les jets de miss/dodge — plutôt qu'un `Math.random()` isolé, demande
  explicite d'Antoine). Pas de RNG séparé au niveau de la RUN pour l'instant :
  les talents hors-bataille (Bonne affaire) en auront besoin plus tard, voir
  gap déjà noté plus haut.
- **Prime de victoire** / **Prime de risque** : calculés dans `onVictory` à
  partir du numéro de vague qui vient d'être gagnée.
- **Profiteur de guerre** : nouveau champ `RunState.purchasedInShop`, remis à
  `false` UNE SEULE FOIS par vague dans `startPlacement()` (jamais à chaque
  bascule ouvrir/fermer du bouton "Boutique" pendant le même placement, sinon
  rouvrir la boutique après un achat effacerait cet achat de la mémoire du
  talent) ; passé à `true` dans les 4 handlers d'achat (`onBuyFantassin`/
  `onBuyArcher`/`onBuyCavalier`/`onBuyHealScroll` — un consommable compte
  comme un achat, conforme à la spec).
- **Spéculateur** : nouveaux champs `RunState.speculativeStreak`/
  `waveStartWasSpeculative`. Le seuil d'or (≥10) est vérifié dans
  `onValidatePlacement`, AU MOMENT où la bataille commence vraiment (pas à
  l'ouverture de la boutique, le joueur peut encore acheter/vendre pendant
  tout le placement) — en dessous du seuil, le streak est remis à 0
  immédiatement ; le streak n'est incrémenté/récompensé qu'à la résolution
  de la victoire (`onSpeculativeCheck`).
Vérifié en headless (script temporaire, supprimé après usage) : chaque hook
isolément (bonus de départ combinés, jet de Pillage déterministe forcé
au-dessus/en dessous du seuil, Prime de victoire/risque à divers numéros de
vague, Profiteur de guerre avec/sans achat, Intérêts à divers montants d'or,
streak de Spéculateur jusqu'à récompense), PLUS un test d'intégration bout en
bout via `applyBattleOutcome` vérifiant l'ORDRE exact (Intérêts calculé sur
l'or après Prime de victoire, Spéculateur après Intérêts).

**Talents encore inertes malgré `implementationStatus: 'ready'` — aucun,
tous les `'ready'` sont maintenant branchés.** Restent `'pending-system'`
(Marchandage, Liquidation, Chasseur de primes, Client fidèle, Recyclage,
Bonne affaire, Fournisseur, Assurance militaire, Contrat militaire, Marché
noir, Trésor de guerre, Maître marchand, Seigneur de guerre) — inchangés,
voir Étape G ci-dessous.

- **Pas encore fait** (Étapes G, H, I du plan, à ne pas anticiper) :
  `OwnedUnit.pricePaid`/`wavesSurvived`, un RNG persistant au niveau de la
  run (distinct du RNG de bataille, pour Bonne affaire notamment), un vrai
  catalogue de boutique, des tags élite/mini-boss — tout ce qui débloquerait
  les talents `'pending-system'` (Étape G) ; tests d'interactions
  économiques (Étape H) ; contenu détaillé des branches Précision et Armée,
  limitées à leur fondateur existant tant qu'Antoine n'a pas fourni leurs 20
  talents mineurs chacune (Étape I).

## Chantier bestiaire — Mage (2026-08-11)

Quatrième unité jouable, demande très détaillée d'Antoine (spec en ~26
points, avec fiche de personnage de référence : PV 5, vitesse lente, portée
2-6, cadence ~5,5s, dégâts 4 de zone, coût 8 or). Premier vrai artilleur
magique du jeu : fragile, longue portée, attaque de zone lente et puissante
contre un groupe, faible au contact — contre-partie explicite au Fantassin
groupé (le Mage le contre) et au Cavalier (qui contre le Mage, trop rapide
pour lui laisser le temps d'incanter). Demande architecturale explicite
d'Antoine, comme pour la Charge du Cavalier : "évite de disperser partout
`if (unit.type === "mage")`", une abstraction générique et réutilisable pour
de futures attaques de zone télégraphiées (catapulte, mini-boss...).

- **`data/abilities.ts`** : `AreaBlastAbility` (nouveau membre de l'union
  `AbilityDef`, aux côtés de `ChargeAbility`) — `cooldown`, `minRangeTiles`,
  `maxRangeTiles`, `castTime`, `projectileSpeed`, `damage`, `radiusTiles`.
  Configurée directement sur `UnitDef.abilities` comme la Charge (pas un
  catalogue partagé) : une future capacité de zone (catapulte) pourra avoir
  ses propres réglages sans toucher à celle du Mage.
- **`sim/entity.ts`** : `Entity.cast: CastState | null` (incantation en
  cours — `targetX/targetZ` VERROUILLÉS au déclenchement, `elapsed/duration`,
  plus une copie de `projectileSpeed/damage/radiusTiles` prise au
  déclenchement pour qu'un changement de talent en cours de bataille ne
  puisse jamais modifier une incantation déjà engagée). Effacé sans
  projectile si l'entité meurt PENDANT l'incantation (voir plus bas) — le
  projectile lui-même n'est PAS stocké ici une fois lancé.
- **Séparation clé** entre l'incantation (liée au lanceur, interruptible par
  sa mort) et le projectile en vol (doit SURVIVRE à la mort du lanceur,
  demande explicite d'Antoine, point 18/19) : `World.blasts:
  BlastProjectile[]` (nouveau, `sim/world.ts`), un tableau au niveau du
  MONDE, indépendant de toute `Entity` — même principe que `World.playerArrow`
  déjà existant pour la flèche du joueur. `BlastProjectile` fige `team`
  (celle du lanceur au moment du tir, pour savoir qui encaisse à l'impact
  même si le lanceur n'existe plus).
- **`sim/systems/abilities.ts`** (système générique déjà en place pour la
  Charge, étendu) : `advanceCast` fait avancer l'incantation et pousse un
  `BlastProjectile` dans `World.blasts` à l'issue de `castTime` (cooldown
  démarré au DÉBUT de l'incantation, pas à l'impact — même règle que la
  Charge, empêche tout enchaînement de projectiles plus rapide que prévu) ;
  `advanceBlasts` fait voler et résout chaque projectile indépendamment de
  son lanceur, appliquant les DÉGÂTS PLEINS (pas partagés) à CHAQUE unité
  ennemie dans `radiusTiles` du point d'impact verrouillé — jamais le camp du
  lanceur (pas de friendly fire pour cette V1).
  - `findBestAreaImpact` : candidats = ennemis à portée valide
    (`minRangeTiles` ≤ distance ≤ `maxRangeTiles`) du lanceur ; pour chaque
    candidat, score = nombre total d'ennemis (n'importe lesquels, pas
    seulement ceux à portée du lanceur) dans `radiusTiles` de sa position ;
    meilleur score retenu, égalité tranchée par distance au lanceur puis par
    id le plus bas — jamais de choix aléatoire (demande explicite). Le
    déclenchement (`tryTriggerAreaBlast`) réutilise `e.targetId` (posé par
    `targetingSystem`) uniquement comme PORTE ("y a-t-il un ennemi à portée
    d'aggro ?"), pas comme point d'impact — l'attaque de zone peut viser un
    autre ennemi que la cible verrouillée si ça regroupe plus de monde.
  - Mort du lanceur : `if (!e.alive) { e.dash = null; e.cast = null; }` —
    incantation annulée SANS projectile si elle est encore en cours ; un
    projectile DÉJÀ dans `World.blasts` continue son vol et explose
    normalement (vérifié en headless : victime touchée même après la mort du
    Mage).
- **Nouveau champ générique `UnitStats.engageRange?: number`** (`data/units.ts`)
  — résout une tension que le modèle à une seule `attackRange` par unité ne
  pouvait pas exprimer : le Mage doit s'ARRÊTER d'avancer à portée de boule de
  feu (6 cases) pour `movementSystem`, mais son attaque de mêlée de secours
  ("Coup de bâton") ne fonctionne qu'à `attackRange` (0,95). `movementSystem`
  utilise désormais `stats.engageRange ?? stats.attackRange` pour décider
  quand arrêter la poursuite ; `combatSystem` continue de lire UNIQUEMENT
  `attackRange` pour résoudre l'attaque de mêlée, sans aucun changement — zéro
  changement de comportement pour toute unité sans `engageRange` (fantassin,
  archer, cavalier). `isRangedUnit()` (`main.ts`, formation mêlée-devant/
  tir-derrière) vérifie désormais `stats.engageRange ?? stats.attackRange`
  au lieu de la seule `attackRange` — le Mage est donc bien placé dans les
  rangées arrière comme l'archer.
- **Limite honnête acceptée, pas corrigée** : "zone morte" entre 0,95 (portée
  de mêlée) et 2 (portée minimale de boule de feu) où le Mage, si un ennemi
  s'y trouve exactement, ne peut utiliser NI attaque — conforme à la
  consigne explicite d'Antoine de ne pas construire d'IA de kiting complexe
  pour cette V1 ("une gestion raisonnable de la portée suffit"), rare en
  pratique (l'ennemi doit s'arrêter précisément dans cette fenêtre étroite).
- **Stats retenues** (`data/units.ts`) — celles données explicitement par
  Antoine sont respectées à la lettre ; celles qu'il n'a pas précisées sont
  choisies par Claude et clairement commentées comme telles dans le code,
  à corriger sur son retour : PV 50 interne/5 affiché (**note d'honnêteté** :
  coïncide avec le fantassin, faute de valeur "5 PV" distincte à dériver
  autrement que par lecture directe de la fiche fournie), dégâts de zone 40
  interne/4 affiché PAR CIBLE (pas partagés), coût 8 or, portée boule de feu
  2-6 cases, rayon d'explosion 1 case, temps d'incantation 1s, cadence 5,5s,
  minRangeTiles 2 (boule de feu impossible à 0-1 case). Choisies par Claude
  (non données par Antoine) : `moveSpeed` 1,8 (plus lent que le fantassin
  2,2 et bien plus lent que le cavalier 3,5, conforme à "légèrement moins
  mobile"), `radius` 0,44, attaque de mêlée de secours `damage` 10 interne/1
  affiché avec `attackCooldown` volontairement lent (2,0s) et `missChance`
  élevé (0,3) — "le Mage ne doit PAS devenir compétent au corps à corps",
  `projectileSpeed` 6 cases/s (lent et visible, demande explicite, valeur
  jamais chiffrée par Antoine).
- **Rendu (`render/unitMesh.ts`, `buildMage`)** : silhouette PLACEHOLDER en
  boîtes (même statut que le Cavalier, aucun asset externe téléchargé sans
  validation préalable, conforme à la consigne explicite d'Antoine) — robe
  (couleur d'équipe, comme le tissu des autres unités), capuche pointue,
  visage ombré, bras animé tenant un bâton (réutilise le mécanisme de bras
  d'attaque existant, `userData.attackArm`, pour jouer l'animation de "coup
  de bâton" sans nouveau code de rendu) surmonté d'une orbe
  (`userData.castGlow`, couleur `COLORS.fireGlow`).
- **Retour visuel d'incantation** (`render/unitViews.ts`, `tickCastGlow`,
  nouvelle méthode privée appelée dans `sync()` juste après `tickHitFlash`) :
  allume l'émissive de l'orbe UNIQUEMENT pendant `entity.cast`, intensité
  montant progressivement avec `elapsed/duration` — lu directement depuis
  l'état de simulation, aucune minuterie séparée côté rendu (contrairement au
  flash d'impact). "Légère lumière orange, pas besoin d'un système complexe
  pour cette V1" (demande explicite).
- **Télégraphe au sol** (`render/telegraph.ts`, nouveau, `TelegraphView`) :
  disque translucide orange posé sur `entity.cast.targetX/targetZ` (déjà
  verrouillé), mis à l'échelle de `entity.cast.radiusTiles` — lu chaque frame
  depuis l'état de simulation, un disque par entité en train d'incanter,
  retiré dès que le cast se termine (impact ou interruption par la mort).
  Explicitement demandé pour la LISIBILITÉ d'un Mage ENNEMI en auto-bataille
  ("le joueur doit comprendre 'une grosse attaque va arriver ici', même si
  ses unités sont contrôlées automatiquement").
- **Projectile** (`render/fireballView.ts`, nouveau, `FireballView`) : grosse
  sphère orange légèrement émissive, trajectoire arquée simple (interpolation
  visuelle, PAS une simulation physique, demande explicite) — un mesh par
  `BlastProjectile` en vol, gardé dans une `Map` clée par l'OBJET projectile
  lui-même (la simulation ne lui donne pas d'id stable, l'identité d'objet
  suffit pour détecter "encore en vol" vs "résolu"). Impact : flash + onde qui
  grossit puis s'estompe rapidement (`IMPACT_DURATION` 0,35s), déclenché par
  `main.ts` sur l'évènement `'blast-impact'`, volontairement sobre (cohérent
  avec le reste de la DA).
- **`main.ts`** : `telegraphView`/`fireballView` instanciés, ajoutés à la
  scène, synchronisés chaque frame (`telegraphView.sync(world.entities)`,
  `fireballView.sync(world.blasts, realDt)`) et vidés (`clear()`) à TOUS les
  5 sites de `world.clear()` déjà existants (test de scénario, début de
  bataille, retour d'éditeur après test, rideau de fin de vague, quitter en
  pleine bataille) — même motif que `projectiles`/`playerArrowView`. Sur
  l'évènement `'blast-impact'` : `fireballView.spawnImpact(x, z, radiusTiles)`
  puis `unitViews.playHit(id)` pour CHAQUE id de `hitIds` (même flash blanc
  que tout autre impact, appliqué à toutes les cibles touchées, pas
  seulement une). `onBuyMage` ajouté, copie exacte du motif
  `onBuyFantassin` (aucune vague de déblocage, contrairement au Cavalier).
- **Boutique** (`ui/screens.ts`) : bouton Mage ajouté à l'onglet Unités,
  toujours visible (pas de gate de déblocage), désactivé si l'or est
  insuffisant — même motif que fantassin/archer.
- **`run/runState.ts`, `KILL_REWARD.mage = 4`** (moitié du prix boutique 8,
  même convention que les 3 autres unités) — sans cette entrée, tuer ou
  vendre un Mage aurait rapporté 0 or par défaut.
- **Éditeur / sérialisation de map** : AUCUN changement nécessaire, confirmé
  avant d'écrire le moindre code — le bestiaire de l'éditeur est déjà
  construit dynamiquement depuis `Object.values(UNITS)`, et la sérialisation
  traite `unitId` comme une chaîne opaque. Le Mage y apparaît et s'exporte/
  importe automatiquement, exactement comme demandé (point 23/25).
- Vérifié en headless (`World` directement, script temporaire supprimé après
  usage) : le Mage choisit bien la position qui regroupe le plus d'ennemis
  plutôt que la cible la plus proche (candidat isolé à distance 3 écarté au
  profit d'un groupe de 3 à distance 5) ; le cooldown démarre au
  déclenchement réel ; les dégâts de zone sont pleins et identiques pour
  chaque cible touchée (pas partagés) ; aucun dégât sur une unité du même
  camp que le lanceur, ni sur le lanceur lui-même ; une incantation
  interrompue par la mort du lanceur ne crée aucun projectile ; un projectile
  déjà lancé survit à la mort de son lanceur et inflige quand même ses
  dégâts à l'impact ; aucune incantation ne se déclenche contre une cible
  dans la portée minimale interdite. Les tests isolant spécifiquement les
  dégâts de zone figent le déplacement des cibles (`statOverrides:
  { moveSpeed: 0 }`) — sans ça, une cible continue normalement d'avancer
  pendant l'incantation+vol (~1,6s) et peut sortir du rayon figé avant
  l'impact, ce qui est le comportement VOULU (le projectile ne suit pas la
  cible) et non un bug, mais rendait la mesure isolée du "pas de partage/pas
  de friendly fire" imprévisible sans ce figeage.
- **Non vérifiable de mon côté — aucun accès visuel au rendu.** Compile et
  build propre (`npm run build`), mais la silhouette placeholder, le
  télégraphe au sol, la trajectoire du projectile et l'orbe d'incantation
  n'ont pu être vérifiés que par lecture de code, jamais par capture d'écran
  — à confirmer par Antoine dans le navigateur, en particulier si le Mage
  "lit" bien comme une unité de type magicien à cette distance de caméra.

## Modèle riggé du Mage (2026-08-11)

Remplace la silhouette placeholder en boîtes par un vrai modèle fourni par
Antoine : Meshy AI "Emberhood Mage", squelette riggé (24 os) + 5 animations
baked dans un seul `.glb` — `Attack`, `Running`, `Walking`,
`mage_soell_cast_4` (la "magespell 4" mentionnée par Antoine, coquille de
Meshy sur "spell"), `mage_soell_cast_7` (inutilisée pour l'instant). Deux
fichiers fournis dans le dossier ; celui contenant UNIQUEMENT le mesh (sans
nom d'animation utile) a été écarté au profit du second, qui contient le
même mesh/squelette EN PLUS des 5 clips — un seul fichier à charger.
Copié dans `public/models/mage/mage_biped.glb`.

Deux questions de design posées à Antoine avant d'écrire le moindre code
(le modèle n'a qu'un seul matériau/une seule texture pour tout le corps,
impossible de ne teinter que le tissu comme sur les unités en boîtes) :
teindre le modèle ENTIER par la couleur d'équipe (retenu, plutôt que
laisser neutre ou ajouter un accessoire coloré séparé), et mapper
directement `Walking`/`Attack`/`mage_soell_cast_4` sur marche/mêlée de
repli/incantation sans étape intermédiaire de validation visuelle (retenu).

Première unité du jeu à sortir du système de boîtes procédurales — premier
vrai squelette animé (`AnimationMixer`/`AnimationClip`) du projet.

- **`render/mageRig.ts`** (nouveau) : `preloadMageModel()` charge le `.glb`
  UNE SEULE FOIS via `GLTFLoader`, à appeler et ATTENDRE au démarrage du jeu
  (`main.ts`, `Promise.all([createBoard(...), preloadMageModel()])` — en
  parallèle du chargement du plateau, avant que le menu ne devienne
  interactif) : `buildMageModel()` doit rester SYNCHRONE ensuite, comme
  `buildUnit()` pour toutes les autres unités — l'aperçu de placement ET
  l'éditeur de maps l'appellent sans savoir qu'un chargement réseau est en
  jeu. `buildMageModel(team)` clone une instance via `SkeletonUtils.clone`
  (import nommé `clone` du module `three/addons/utils/SkeletonUtils.js` — PAS
  un objet `SkeletonUtils` par défaut, piège de nommage rencontré en codant
  ceci). **`SkeletonUtils.clone` est OBLIGATOIRE ici, jamais
  `Object3D.clone()`** : un clone naïf d'un `SkinnedMesh` ne relie pas les os
  du squelette à la copie — un `AnimationMixer` construit dessus animerait le
  squelette de l'ORIGINAL (partagé entre toutes les instances), jamais celui
  de la copie. Vérifié en headless (script temporaire, supprimé après usage,
  avec un VRAI `GLTFLoader`/`SkeletonUtils`, chargement via `parseAsync` sur
  le buffer lu par `fs.readFileSync` plutôt que `.loadAsync` — évite le
  besoin d'un serveur HTTP local ou d'un polyfill `fetch` pour ce test
  ponctuel) : les 5 clips sont bien présents, deux clones ont bien des
  `Skeleton`/os DISTINCTS, et deux `AnimationMixer` indépendants jouant des
  clips différents produisent bien des poses d'os différentes (aucun
  cross-talk entre instances).
  - **Matériau CLONÉ par instance** (jamais partagé) : `setOpacity`/
    `setEmissive` (fondu de mort, flash d'impact — déjà génériques à toute
    unité via `UnitViews.createView`, `userData.materials`) mutent
    directement le matériau. Un cache partagé ferait flasher/fondre TOUS les
    Mages à la fois — même bug déjà corrigé une fois pour les unités en
    boîtes (2026-08-09, voir plus haut "Bug de matériaux partagés entre
    unités corrigé au passage"). Vérifié en headless aussi (deux clones,
    deux matériaux distincts, teinte d'équipe différente sur chacun).
  - **Lueur émissive baked-in désactivée** : le matériau porte une
    `emissiveTexture` + `emissiveFactor: [1,1,1]` d'origine (probablement des
    braises/yeux, cohérent avec "Emberhood") — explicitement mise à zéro
    (`emissive.setRGB(0,0,0)`, `emissiveMap = null`, `emissiveIntensity = 0`)
    plutôt que préservée. Raison : `UnitViews.setEmissive` (flash d'impact,
    générique à toute unité) suppose que `emissive = 0` est l'état de REPOS
    neutre — sans cette désactivation, le tout PREMIER coup encaissé par un
    Mage aurait effacé définitivement sa lueur d'origine (`setEmissive(0)`
    la remplace par du noir, sans jamais la restaurer). Aucun accès visuel
    pour juger si cette lueur valait la peine d'être gardée — à rouvrir si
    Antoine la veut (demanderait de généraliser `setEmissive` pour mixer vers
    une couleur de base plutôt que vers 0).
- **`render/unitMesh.ts`, `buildMage`** : réduit à un simple appel à
  `buildMageModel(team)` — toute la géométrie en boîtes (robe, capuche,
  bâton, orbe) retirée.
- **`render/unitViews.ts`, pilotage des clips depuis l'état de simulation**
  (nouvelle méthode privée `tickRiggedAnimation`, appelée dans `sync()` pour
  toute unité vivante juste après `tickWalkAnim`, partage le même booléen
  `isMoving`) : priorité incantation > attaque > marche > repos, sans effet
  pour toute unité sans squelette (`view.userData.mageMixer` absent — les
  unités en boîtes ne passent jamais dans cette méthode).
  - **`cast`** : `entity.cast` non nul déclenche le clip `mage_soell_cast_4`,
    mis à l'échelle sur `entity.cast.duration` via `action.setDuration(...)`
    — le clip source dure 2,23s, largement plus que le `castTime` réel de la
    Boule de feu (1s) ; sans ce réglage, l'incantation visuelle aurait été
    coupée net avant sa fin. Recalculé à chaque déclenchement (pas figé),
    pour rester correct si `castTime` change plus tard (talents).
  - **`attack`** ("Coup de bâton") : contrairement à `cast` (état continu
    porté par `Entity`), un coup de mêlée est un évènement PONCTUEL sans
    minuteur dédié sur l'entité — `UnitViews.playAttack(entityId)` (déjà le
    point de déclenchement unique, appelé par `main.ts` sur tout évènement de
    combat non-archer) déclenche directement `actions.attack.reset().fadeIn().play()`
    la première fois, et `tickRiggedAnimation` se contente ENSUITE de suivre
    `actions.attack.isRunning()` (état natif de Three.js, pas un chrono
    dupliqué) pour savoir quand le clip se termine tout seul et lui succéder
    (marche/repos) — **jamais redéclenché depuis `tickRiggedAnimation`**, un
    seul point de départ. `tickAttackAnim` (ruade/rotation de bras
    procédurale des unités en boîtes) court-circuité pour toute unité riggée
    (`view.userData.mageMixer` présent) — sans ça, le clip d'attaque du
    modèle ET une ruade procédurale se seraient superposés, mouvement
    incohérent.
  - **`walk`** : boucle (`LoopRepeat`) tant que `isMoving`, `reset()` à
    chaque nouvelle transition — cohérent avec le comportement déjà en place
    pour les unités en boîtes ("la phase repart de zéro à l'arrêt").
  - Transitions fondues-enchaînées (`fadeIn`/`fadeOut`,
    `RIGGED_ANIM_FADE_SECONDS = 0.15`, `config/constants.ts`) plutôt qu'un
    changement de clip abrupt.
  - `UnitViews.clear()` vide aussi `riggedActionState` (nouvelle Map interne
    qui suit le clip actif par entité, pour ne fondre-enchaîner qu'au
    changement d'état).
- **Mort, hors-sujet ici** : le fondu de mort (bascule en arrière + fondu
  d'opacité) reste géré par les mécanismes déjà GÉNÉRIQUES de `UnitViews`
  (rotation du `Group` racine, `setOpacity` sur `userData.materials`) — ils
  s'appliquent tels quels au nouveau modèle sans aucune modification, la
  mort n'a donc demandé aucun code spécifique.
- **Échelle/orientation NON vérifiées visuellement** (aucun accès au rendu
  de mon côté) : le modèle est ajouté à la scène à son échelle native
  (aucun multiplicateur appliqué, contrairement au Cavalier et son
  `CAVALIER_SCALE`) — les données brutes du `.glb` suggèrent une hauteur
  plausible pour un humanoïde une fois le squelette/la peau résolus par
  Three.js, mais seul un test réel dans le navigateur le confirmera. Aucune
  correction d'orientation appliquée non plus (convention du projet : unité
  locale -Z = avant) — si le Mage regarde de travers une fois testé, la
  correction se limite à une `rotation.y` fixe dans `buildMageModel`, sans
  toucher au reste de l'intégration (même patron que la baliste, voir
  `render/ballista.ts`).
- Build propre (`npm run build`). **Non vérifiable de mon côté** : rendu
  visuel réel (silhouette, teinte d'équipe, échelle, orientation,
  fluidité des transitions d'animation) — à confirmer par Antoine dans le
  navigateur.

**Corrections après premier test réel (2026-08-11, même journée)** — 3 retours
concrets d'Antoine, tous corrigés :
- **"Il tourne le dos à la bataille quand il se bat"** : le modèle source
  regarde dans le sens opposé à la convention du projet (-Z = avant).
  `mageRig.ts` ajoute un groupe `facingFix` (rotation.y = π) ENFANT du
  groupe racine — jamais posé sur la racine elle-même, qui est écrasée à
  chaque frame par `UnitViews.sync` (`view.rotation.y = facing`) : même
  piège déjà documenté pour le Cavalier.
- **"Beaucoup trop sombre, quasiment noir"** : cause identifiée par lecture
  du JSON du `.glb` — le matériau source ne précise pas de `metallicFactor`
  (l'extension `KHR_materials_specular` était présente, pas ce champ), donc
  la valeur PAR DÉFAUT du format glTF s'applique : 1 (entièrement
  métallique). Un matériau métallique n'a presque aucune réponse diffuse ;
  sans carte d'environnement (le jeu n'en a pas, voir `render/renderer.ts`),
  seule la réflexion spéculaire des lumières directionnelles reste — très
  insuffisante pour se voir, d'où le rendu quasi noir. `material.metalness = 0`
  forcé sur le clone (réponse purement diffuse, cohérent avec le reste de la
  DA du jeu, jamais métallique).
- **"Un peu trop grand, réduire de 20%"** : `MAGE_MODEL_SCALE = 0.8`
  (`mageRig.ts`), appliqué sur le groupe RACINE directement (contrairement à
  la correction d'orientation) : `scale`, contrairement à `rotation.y`,
  n'est jamais touché par `UnitViews.sync`, aucun risque d'écrasement — même
  convention que `CAVALIER_SCALE`.
- Build propre. Non revérifié en headless (changements purement visuels/
  géométriques, déjà couverts par la vérification précédente sur le
  chargement/clonage/matériaux) — à confirmer par Antoine.

**Retour sur la Boule de feu elle-même, clarifié puis traité (même jour)** :
"sa compétence est visuellement pas belle, et beaucoup trop simple à
esquiver, voire pas assez forte" — 2 questions posées à Antoine avant de
retoucher quoi que ce soit (quel élément visuel précisément, quel levier de
rééquilibrage en premier) :
- **"Pas belle" = le projectile lui-même** (pas le télégraphe au sol, pas
  l'animation d'incantation du personnage). `render/fireballView.ts` réécrit :
  remplace la sphère émissive unique d'origine par un `FireballMesh`
  (groupe) — noyau brillant quasi-blanc (`MeshBasicMaterial`, non affecté par
  l'éclairage de la scène, "chaud"), coque translucide orange en fondu
  ADDITIF (`THREE.AdditiveBlending`, glow bon marché sans shader dédié) qui
  PULSE légèrement en vol (sinus sur `b.elapsed`, le temps de vol déjà
  simulé — aucun chrono réel séparé nécessaire), et une vraie
  `THREE.PointLight` qui voyage AVEC le projectile (portée courte, intensité
  modérée — illumine réellement le sol/les unités proches au passage,
  contrairement à l'ancienne version purement émissive sans effet sur son
  environnement). Matériaux partagés entre toutes les boules de feu (pas de
  risque contrairement aux unités : jamais mutés par instance, pas de
  fondu/flash à gérer ici).
- **Rééquilibrage : rayon d'explosion en premier levier** (recommandation
  suivie plutôt que vitesse/temps d'incantation ou dégâts) — `data/units.ts`,
  `radiusTiles` doublé 1 → 2 (quadruple la surface touchée). Premier passage
  volontairement marqué plutôt qu'un ajustement timide, cohérent avec "trop
  simple à esquiver ET pas assez forte" (les deux plaintes pointent dans la
  même direction). Le télégraphe au sol (`TelegraphView`) suit automatiquement
  cette valeur — la zone de danger reste lisible avant l'impact malgré
  l'agrandissement, aucun changement de code séparé nécessaire.
- Build propre. **Non vérifiable de mon côté** (rendu visuel, ressenti de
  difficulté d'esquive) — à confirmer par Antoine en jeu réel ; le rayon
  reste un premier chiffre à ajuster si trop fort/faible à l'usage.

**Deuxième passe visuelle sur la Boule de feu, même jour** — Antoine, après
avoir vu le résultat : rayon "vraiment mieux", visuel "bien mieux aussi mais
ça manque encore d'impact, on peut faire mieux". `render/fireballView.ts`
étoffé sans sortir du principe "formes simples, pas de vrai système de
particules" :
- **Traînée en vol** (`TRAIL_COUNT = 4` petites boules décroissantes) :
  positionnées en réévaluant la MÊME fonction paramétrique que la position
  principale (`positionAt(b, t)`) à un `t` légèrement plus tôt, plutôt qu'un
  historique de positions accumulé frame par frame — aucun état
  supplémentaire à maintenir/vider. **Piège rencontré en écrivant ceci** :
  la traînée est un ENFANT du groupe du projectile (`fx.group`, déjà
  positionné à la position courante) — lui donner directement la position
  MONDE calculée par `positionAt` l'aurait doublement translatée ; corrigé en
  soustrayant la position courante du groupe (`positionAt(b, trailT).sub(headPos)`)
  pour obtenir l'offset LOCAL correct.
- **Impact enrichi** (`spawnImpact`) : l'anneau au sol plat d'origine est
  conservé, plus une onde VERTICALE en plus (sphère translucide en glow
  additif, même technique que la coque du projectile — donne un vrai "boum"
  en 3D plutôt qu'un disque plat), un flash de `PointLight` qui pique puis
  s'éteint sur `BURST_DURATION`, et une salve de `EMBER_COUNT = 7` petites
  braises (cubes) qui giclent radialement (`Math.random()` pour l'angle/la
  vitesse — cosmétique pur, hors simulation, aucun impact sur le
  déterminisme du RNG de bataille) puis retombent sous une gravité simplifiée
  et s'estompent (`EmberFx`, nouvelle liste suivie comme `impacts`).
- Build propre. **Non vérifiable de mon côté** (rendu visuel réel) — à
  confirmer par Antoine ; ce n'est délibérément PAS un vrai système de
  particules (juste quelques meshes de plus à courte durée de vie), cohérent
  avec le reste de la DA du jeu.

**Troisième passe, même jour — synchronisation de l'incantation + recul
d'impact.** Antoine, après avoir vu le résultat : radius "vraiment mieux",
visuel "bien mieux" mais deux retours supplémentaires.

- **"Décalage entre la fin de l'animation et le réel départ de la boule de
  feu"** — vrai bug de synchronisation, pas juste une histoire de durée
  (Antoine avait suggéré de raccourcir `castTime`, mais ça n'aurait fait que
  réduire la fenêtre de décalage sans l'éliminer). Cause : le lancement du
  projectile est décidé par la SIMULATION (`entity.cast.elapsed >=
  entity.cast.duration`, en pas fixes de `SIM_STEP`), alors que le clip
  d'incantation jouait sur sa PROPRE horloge temps réel
  (`mixer.update(realDt)`, `realDt` calculé indépendamment dans `main.ts`
  via `performance.now()`) — deux compteurs distincts, approximativement
  synchrones dans le meilleur des cas, et carrément désynchronisés d'un
  facteur 2 à la vitesse x2 (`loop.timeScale` double la cadence des pas de
  simulation SANS toucher `realDt`, voir `core/loop.ts`). Corrigé dans
  `render/unitViews.ts`, `tickRiggedAnimation` : `actions.cast.time` est
  désormais forcé CHAQUE FRAME sur `(entity.cast.elapsed / entity.cast.duration)
  * clip.duration` (après `mixer.update`, qui écrase son propre calcul) — le
  clip suit alors littéralement l'état de simulation plutôt qu'une horloge
  qui lui est propre, ce qui élimine le décalage dans tous les cas, y
  compris à vitesse x2. `setDuration()` (qui ne réglait qu'un `timeScale`
  approximatif) devenu inutile, retiré.
- **"Rajouter un bump depuis la zone d'impact"** — question de design posée
  explicitement par Antoine ("qu'en penses-tu ?"), avis donné : bonne idée,
  cohérent avec une explosion et avec le recul déjà en place sur la Charge du
  Cavalier (`CHARGE_KNOCKBACK_TILES`). Implémenté GÉNÉRIQUEMENT dans le
  système de capacités (pas un cas spécial Mage) :
  - `data/abilities.ts`, `AreaBlastAbility.knockbackTiles?: number` (optionnel,
    absent/0 = aucun recul) ; `sim/entity.ts`, `CastState.knockbackTiles?`
    (copié depuis l'ability au déclenchement, même motif que
    damage/radiusTiles) ; `sim/systems/abilities.ts`,
    `BlastProjectile.knockbackTiles?` (copié depuis `CastState` au lancement
    du projectile — doit survivre à la mort du lanceur comme le reste).
  - `advanceBlasts` (désormais paramétrée avec `boardWidth`/`boardHeight`,
    threadées depuis `abilitySystem`) repousse CHAQUE cible touchée
    RADIALEMENT depuis le POINT D'IMPACT (pas depuis le lanceur — distinction
    volontaire avec la Charge, qui repousse dans l'axe cavalier→cible : une
    explosion pousse dans toutes les directions à la fois, pas un coup
    directionnel unique). Cas limite couvert : cible pile sur le centre
    (distance ~0, direction radiale indéfinie) → poussée arbitraire vers +Z
    plutôt qu'un recul nul silencieux. Même tolérance déjà acceptée pour la
    Charge : pas de vérification d'obstacle sur la destination
    (`resolveObstacleCollisions` la ressort au tick suivant si besoin), seules
    les limites du plateau sont respectées (`clamp`).
  - `data/units.ts`, Mage : `knockbackTiles: 1` — même valeur que
    `CHARGE_KNOCKBACK_TILES` pour une première cohérence entre les deux
    capacités déjà en jeu, aucun lien technique entre les deux, ajustable
    indépendamment.
  - Vérifié en headless (script temporaire, supprimé après usage) : le recul
    déclenché fait bien ~1 case de magnitude (knockbackTiles=1) sur un impact
    réel via `World`/`abilitySystem`. Le chemin de clamp aux bords du
    plateau réutilise tel quel l'expression déjà éprouvée de la Charge
    (`CHARGE_KNOCKBACK_TILES`) — pas isolé séparément dans ce test rapide,
    mais mêmes lignes de code, même garantie.
- Build propre. **Non vérifiable de mon côté** (ressenti du timing corrigé,
  lisibilité du recul en jeu réel) — à confirmer par Antoine.

**Le décalage persistait après la correction de synchronisation — deuxième
diagnostic, même jour.** Antoine : "le mage fait son geste, il le finit,
rien, puis la boule part" — un temps mort perceptible (~0.5s) APRÈS la fin
apparente du geste. La correction de synchro précédente (`action.time` forcé
sur `entity.cast.elapsed/duration`) reste correcte et nécessaire (elle
réglait un problème de DÉRIVE d'horloge, notamment à vitesse x2), mais
c'était un problème DIFFÉRENT et toujours présent : le clip source dure
2,23s, très probablement avec un temps de repos/retombée après le vrai
geste de lancer — en étirant TOUT le clip uniformément sur `castTime`, la
portion "immobile" de fin de clip s'étire elle aussi, et se lit comme un
temps mort avant le tir. `data/units.ts`, `castTime` réduit 1 → 0.6 :
raccourcit ce temps mort en proportion (tout le clip, y compris sa portion
immobile, joue plus vite). **Solution honnêtement approximative** : sans
accès visuel pour repérer l'image exacte de "lâcher" dans le clip, je ne
peux pas découpler précisément la portion du clip à jouer PENDANT
l'incantation (jusqu'au lâcher) du reste (retombée, qui pourrait jouer APRÈS
le lancement du projectile sans bloquer son départ) — la vraie correction
si `0.6` ne suffit pas demanderait qu'Antoine indique approximativement à
quel pourcentage du geste la boule devrait partir. Build propre, non
revérifiable de mon côté.

**Correction précise, même jour** : Antoine, invité à estimer où tombe le
"lâcher" dans le geste — "vers les 2/3 du mouvement". `render/unitViews.ts`,
`tickRiggedAnimation` restructuré en DEUX temps au lieu d'étirer tout le clip
sur `castTime` :
1. **Pendant l'incantation réelle** (`entity.cast` non nul) : `action.time`
   synchronisé sur `entity.cast.elapsed/duration`, projeté UNIQUEMENT sur les
   2 premiers tiers du clip (`config/constants.ts`,
   `MAGE_CAST_RELEASE_FRACTION = 2/3`) — à la fin de l'incantation (même tick
   que le lancement du projectile), le clip est donc pile à l'image de
   "lâcher", plus au bout du clip entier.
2. **Après** (`entity.cast` redevenu null, projectile déjà en vol) : plus
   aucune synchronisation forcée — `mixer.update` fait simplement avancer le
   dernier tiers (la retombée) à vitesse native, SANS bloquer le départ du
   projectile puisqu'il a déjà eu lieu. `desired` reste `'cast'` tant que
   `actions.cast.isRunning()` (même mécanisme déjà utilisé pour `'attack'`,
   étendu ici) — le geste termine donc sa retombée avant de céder la main à
   marche/repos, au lieu d'être coupé net.
Build propre. **Non vérifiable de mon côté** — la fraction 2/3 reste une
estimation d'Antoine, pas une mesure exacte du clip ; à affiner encore si le
lâcher ne tombe toujours pas pile au bon moment.

**Teinte éclaircie, même jour** : "la tunique du mage... trop sombre,
éclaircis-la de 15%". `render/mageRig.ts`, la teinte d'équipe est mélangée
vers le blanc à 15% (`Color.lerp(white, 0.15)`) AVANT d'être appliquée au
matériau — scopé au Mage uniquement (le mélange a lieu ici, jamais sur
`COLORS.playerBody`/`enemyBody` eux-mêmes) : les autres unités en boîtes
utilisent ces mêmes teintes directement, les éclaircir globalement les
aurait changées aussi, jamais demandé. Build propre, non vérifiable de mon
côté.

**Toujours trop sombre au deuxième test (capture d'écran)** : Antoine
compare directement au fantassin, nettement plus clair. Diagnostic revu :
`material.color` est un MULTIPLICATEUR sur la texture du modèle — un mélange
vers le blanc a un plafond dur (à 100% blanc, la texture passe telle
quelle ; si la texture SOURCE est sombre, aucun tint ne peut la rendre plus
claire que ça). Deux ajustements combinés : mélange poussé plus fort
(0.15 → 0.45), PLUS un dépassement au-delà du blanc pur
(`.multiplyScalar(1.15)`, technique HDR standard — Three.js accepte des
canaux de couleur > 1) pour franchir ce plafond si la texture elle-même est
sombre. Build propre, non vérifiable de mon côté — à reconfirmer par
Antoine ; si toujours insuffisant, l'étape suivante serait un boost
émissif plutôt qu'un tint multiplicatif (demanderait de généraliser
`UnitViews.setEmissive` pour ne plus écraser un état de repos non-nul, voir
plus haut).

## Correctif de performance : freeze intermittent à l'impact de la Boule de feu (2026-08-11)

Antoine : "il y a un petit freeze de temps en temps à l'impact de la boule de
feu du mage." Diagnostic (pas de profiling navigateur possible de mon côté,
mais un piège Three.js classique et bien identifié qui correspond exactement
au symptôme) : `render/fireballView.ts` créait une VRAIE `new THREE.PointLight`
à chaque tir (lumière voyageuse) ET à chaque impact (flash), puis la
retirait de la scène peu après. En Three.js, le NOMBRE de lumières actives
est gravé en dur dans le shader compilé de chaque matériau visible (pas un
simple uniforme) — ajouter ou retirer une lumière force donc une
RECOMPILATION de shader pour tous les matériaux visibles à ce moment, un
coût ponctuel mais réel, suffisant pour un a-coup perceptible. Comme le
retrait de la lumière du projectile et l'ajout de celle du flash
survenaient quasiment au même instant (impact), les deux coûts se
cumulaient précisément "à l'impact" — collant exactement au symptôme décrit.

- **`LightPool`** (nouvelle classe, `fireballView.ts`) : `LIGHT_POOL_SIZE = 12`
  `THREE.PointLight` créées UNE SEULE FOIS (dans le constructeur de
  `FireballView`, jamais recréées entre batailles) et ajoutées au groupe
  IMMÉDIATEMENT — plus jamais retirées de la scène ensuite. `acquire()`/
  `release()` gèrent une simple pile de lumières libres ; une lumière
  "inactive" reste techniquement présente à `intensity = 0` (JAMAIS
  `visible = false`, qui l'exclurait du compte de lumières au même titre
  qu'un retrait — piège à éviter). Le NOMBRE de lumières dans la scène reste
  donc constant sur toute la durée d'une bataille : plus aucune
  recompilation de shader après le tout premier rendu.
  Comme `distance`/`intensity`/`position` sont de simples uniformes (pas des
  constantes de compilation), les faire varier par emprunt ne coûte rien —
  seul le NOMBRE de lumières comptait.
- `buildFireball` (projectile en vol) et `spawnImpact` (flash d'impact)
  empruntent désormais une lumière à `LightPool` au lieu d'en créer une ;
  `sync()`/`clear()` la rendent à la réserve (`release`) au lieu de la
  retirer du groupe. Dégradation propre si la réserve est épuisée (12
  lumières simultanées serait déjà un cas extrême) : `acquire()` renvoie
  `null`, l'effet concerné perd juste son éclairage local, aucune erreur.
- Build propre. **Non vérifiable de mon côté** (aucun profiling navigateur
  possible) — le diagnostic s'appuie sur un comportement Three.js documenté
  et la coïncidence exacte du timing, pas sur une mesure directe ; à
  confirmer par Antoine que le freeze a disparu.

## Ajustements caméra : cadrage, dézoom maximal, glisser (pan) (2026-08-11)

Retour d'Antoine avec 3 captures d'écran après le décalage vertical de
cadrage ajouté plus tôt le même jour (`CAMERA.verticalFrameOffset`).

- **Cadrage trop bas** : au zoom par défaut (22), le décalage de 3 poussait
  le coin avant du plateau trop près du bord de l'écran ("il ne faut pas
  qu'il sorte du cadre"). `CAMERA.verticalFrameOffset` réduit 3 → 1.5 — garde
  l'intention d'origine (plateau légèrement décentré vers le bas) sans risquer
  le rognage. Valeur toujours choisie par Claude, à ajuster si besoin.
- **Dézoom maximal trop loin** : `CAMERA.maxViewHeight` (44) rendait le
  plateau minuscule au dézoom max (2e capture). Réduit à 31 — valeur reprise
  directement de la 3e capture d'Antoine, qu'il a jugée satisfaisante.
- **Glisser la caméra (pan), clic droit + gauche maintenus** — nouveau geste
  demandé explicitement ("pouvoir déplacer la caméra du plateau... pour aller
  admirer certains détails de la bataille"), en plus du clic droit seul
  (pivoter/incliner) déjà existant. `render/renderer.ts`, `Renderer.pan(dxPixels,
  dyPixels)` : déplace le point visé (`target`) sur le plan du sol (`target.y`
  toujours 0), dans le repère de la caméra actuelle (vecteurs `right`/
  `forwardGround` tournés par le yaw courant) plutôt qu'en x/z monde bruts —
  sinon le sens du glisser s'inverserait selon l'angle de vue. `resetCamera()`
  remet aussi `target` à (0,0,0) : un reset complet (touche R) efface
  désormais le pan en plus de l'angle/zoom. **Approximation assumée** : la
  composante verticale du glisser n'est pas corrigée par l'inclinaison
  (pitch) — un vrai verrouillage "le point sous le curseur ne bouge pas"
  demanderait de diviser par `sin(pitch)`, ce qui amplifierait fortement le
  glisser à faible inclinaison ; suffisant pour "regarder autour", pas une
  vraie poignée de plan façon logiciel de CAO.
  - `main.ts` : détecte la combinaison via `event.buttons & 1` (masque de
    bits des boutons ACTUELLEMENT enfoncés) dans le `mousemove` déjà utilisé
    pour le clic droit maintenu (`dragging`) — c'est le seul moyen fiable de
    savoir que le gauche est *aussi* enfoncé pendant un glisser déjà en cours
    au clic droit, sans dupliquer le suivi d'état. Si le gauche est enfoncé :
    `renderer.pan(dx, dy)` au lieu de `adjustYaw`/`adjustPitch`.
  - Les 3 listeners `mousedown` sur le clic gauche (sélection/placement,
    tir de la flèche en bataille, clic éditeur) sont désormais gardés par
    `if (dragging) return` — sans ça, presser le clic gauche PENDANT que le
    droit est déjà maintenu aurait aussi déclenché l'action normale de ce
    clic (tirer une flèche, sélectionner/placer une unité...) en plus
    d'activer le pan, ce qui n'est pas l'intention du geste combiné.
  - L'éditeur de maps réutilise le même `Renderer`/la même caméra que le jeu
    (aucune caméra séparée) : le pan fonctionne donc aussi dans l'éditeur
    sans câblage supplémentaire.
- **Bug corrigé le jour même, remonté par Antoine** : "si je clique gauche en
  premier puis clic droit pour rester maintenu, la grille de multi sélection
  apparaît" — l'ordre gauche-puis-droit n'était pas couvert par le garde
  `if (dragging) return` ajouté sur les listeners `mousedown` gauche (celui-ci
  ne protège que l'ordre droit-puis-gauche, où `dragging` est déjà vrai avant
  le clic gauche). Dans l'ordre inverse, `groundDrag`/`unitDrag` étaient déjà
  posés par le clic gauche AVANT que le clic droit ne démarre le pan, et leurs
  propres listeners `mousemove` ne regardent que leur propre état (jamais
  `dragging`) — le rectangle de sélection ou le fantôme de vente continuaient
  donc de suivre le curseur PENDANT le pan. Corrigé dans le listener
  `mousedown` du clic droit : si `event.buttons & 1` (le gauche est déjà
  enfoncé au moment où le droit démarre), `groundDrag`/`unitDrag` sont
  annulés net (mis à `null`, `selectionBox.hide()`/`sellZone.hideGhost()`/
  `placementHighlight.hide()`) avant que le pan ne prenne la main — les deux
  ordres (gauche-puis-droit, droit-puis-gauche) aboutissent désormais au même
  état "pan actif, aucun geste gauche en parallèle".
- Build propre. **Non vérifiable de mon côté** : aucun accès visuel au
  rendu — à confirmer par Antoine que le cadrage/dézoom sont désormais
  satisfaisants et que le glisser de caméra se sent naturel dans les deux
  ordres de clic.

## Modèle riggé du Fantassin + généralisation du système d'unités riggées (2026-08-11)

Deuxième unité du jeu à sortir du système de boîtes procédurales, après le
Mage : modèle fourni par Antoine, Meshy AI "Azure Sentinel", squelette riggé
(24 os, même structure que le Mage). Différence clé avec le Mage : Meshy a
exporté ce modèle en **5 fichiers .glb SÉPARÉS** (un mesh de base +
`Character_output`, plus une animation par fichier : `Walking` 1,07s,
`Attack` 2,83s, `Running` 0,67s, `Knock_Down_1` 3,3s) au lieu d'un seul
fichier fusionné — a demandé une vraie généralisation plutôt qu'une simple
copie du code du Mage.

**Deux clarifications posées à Antoine avant de coder** (message initial
coupé net avant les indications de teinte annoncées, "ci-dessous") :
- Teinte : les indications promises ne sont jamais arrivées — teinte
  **PROVISOIRE**, mêmes couleurs d'équipe que les unités en boîtes
  (`COLORS.playerBody`/`enemyBody`), à corriger dès que les vraies
  indications arrivent (un seul endroit à changer, voir `fantassinRig.ts`).
- Animation de mouvement : `Walking` retenu (le jeu n'a qu'une seule vitesse
  de déplacement, pas de distinction marche/course) — `Running` fourni mais
  NON utilisé, disponible si besoin plus tard.
- Animation de mort : `Knock_Down_1` retenu pour REMPLACER la bascule
  procédurale générique (fondu conservé par-dessus) — confirmé par Antoine.

**Conflit d'architecture soulevé AVANT d'implémenter** (pas silencieusement
résolu) : le Fantassin était justement l'unité ciblée par le rendu instancié
GPU (voir "Chantier rendu instancié — objectif 300 unités fluides" plus
haut) — un squelette animé ne peut pas se représenter dans un
`InstancedMesh` standard (pose différente par instance, contrairement à des
parties de boîtes statiques juste transformées). Question posée
explicitement à Antoine : accepter la perte d'instanciation (retour au rendu
individuel, risque de FPS aux grosses vagues), ou suspendre l'intégration du
Fantassin le temps de concevoir un "GPU skinning instancié" (palette d'os
dans une texture, lu par instance via shader dédié — chantier séparé, plus
lourd, noté comme piste future si les FPS deviennent un vrai problème).
**Antoine a accepté le compromis** : instanciation retirée.

- **`render/riggedGltf.ts`** (nouveau, partagé Mage + Fantassin) :
  `loadRiggedPrototype(meshUrl, animationSources?)` — charge un mesh riggé
  et y FUSIONNE des clips venant de fichiers séparés (renommés au passage,
  ex. `"Armature|walking_man|baselayer"` → `"Walking"`), en s'appuyant sur le
  fait que Three.js relie les pistes d'un `AnimationClip` par NOM DE NOEUD,
  pas par identité d'objet — un clip chargé depuis un AUTRE fichier
  s'applique donc correctement au mesh principal tant que la hiérarchie de
  noms est identique (vérifié en headless AVANT d'écrire le reste de
  l'intégration, script temporaire supprimé après usage : deux clones
  indépendants du mesh de base, chacun animé par un clip chargé séparément,
  bougent bien leurs propres os sans interférence croisée). `mageRig.ts`
  refactorisé pour utiliser ce même loader (avec un tableau `animationSources`
  vide, ses 5 clips étant déjà dans un seul fichier).
  `RiggedActions = Record<string, THREE.AnimationAction>` — forme partagée
  des actions d'un `AnimationMixer`, consommée génériquement par
  `UnitViews.tickRiggedAnimation` (qui ne suppose que `walk`/`attack` requis,
  le reste — `cast` pour le Mage, `knockdown` pour le Fantassin — optionnel).
- **`render/fantassinRig.ts`** (nouveau) : `preloadFantassinModel()` (appelé
  en parallèle de `preloadMageModel()`/`createBoard()` au démarrage, voir
  `main.ts`) + `buildFantassinModel(team)`. Mêmes techniques que le Mage
  (`SkeletonUtils.clone` obligatoire, matériau CLONÉ par instance). Différence
  notable : ce modèle n'a AUCUN matériau/texture dans le `.glb` source
  (primitive sans matériau assigné) — Three.js lui donne un
  `MeshStandardMaterial` par défaut, MÉTALLIQUE par défaut (même piège
  "quasiment noir" que le Mage, `metalness = 0` appliqué préventivement ici
  plutôt que d'attendre qu'Antoine le signale) — mais SANS le plafond de
  luminosité d'une texture sombre à contourner (pas de texture du tout), donc
  la teinte s'applique directement sans le contournement HDR nécessaire pour
  le Mage. Correction d'orientation (`rotation.y = π` sur un groupe enfant,
  même piège/même technique que le Mage) appliquée par PRUDENCE en
  anticipant le même défaut que le Mage (même pipeline d'export Meshy AI +
  Blender) — NON vérifiée visuellement, à confirmer. Pas de mise à l'échelle
  appliquée (contrairement à `MAGE_MODEL_SCALE`) : aucun retour visuel encore
  reçu sur la taille de ce modèle spécifiquement.
- **`render/unitMesh.ts`** : `buildFantassin` réduit à un appel à
  `buildFantassinModel(team)` — toute la géométrie en boîtes (jambes, torse,
  plastron, épaulières, bras, épée, casque, bouclier) retirée. `tag()`
  (étiquetage `instancePart`, plus aucun consommateur) et le paramètre `part`
  de `buildLeg` retirés entièrement plutôt que laissés en métadonnées mortes
  — `buildArcher` (seul autre appelant de `buildLeg`, jamais réellement
  instancié) mis à jour en conséquence (signature simplifiée).
- **`render/instancedUnitRenderer.ts` SUPPRIMÉ ENTIÈREMENT** (plus aucun
  consommateur) : `UnitViews` perd son champ `instanced`, la branche
  `shouldInstance`/`updateInstance`/`releaseInstance` dans `sync()`, et le
  suivi `instancableMeshes` dans `createView` (plus aucun mesh n'est jamais
  tagué `instancePart` désormais). Toutes les unités (y compris le Fantassin)
  repassent donc par le rendu individuel — voir le conflit d'architecture
  ci-dessus, compromis accepté explicitement par Antoine.
- **`render/unitViews.ts`, mort avec clip dédié** (nouvelle branche dans
  `sync()`) : si `view.userData.riggedActions?.knockdown` existe, joue ce
  clip UNE FOIS (`mixer.stopAllAction()` d'abord — coupe net toute action en
  cours, pas de fondu enchaîné pour une mort) au lieu de la bascule
  procédurale (`rotation.x`) — le clip anime déjà tout le corps qui tombe,
  superposer une rotation par-dessus aurait doublé le mouvement. Le fondu
  d'opacité (`DEATH_FADE_DURATION`) démarre après la durée PROPRE du clip
  (`deathAction.getClip().duration`), pas après `DEATH_FALL_DURATION` (qui ne
  concerne que le fallback procédural). Sans effet pour toute unité sans
  `knockdown` (archer, cavalier, Mage) — retombent sur l'ancien comportement,
  inchangé.
- `userData['mageMixer']`/`['mageActions']` renommés génériquement
  `['riggedMixer']`/`['riggedActions']` partout (mageRig.ts, unitViews.ts) —
  `MageActions` (interface spécifique) retirée, remplacée par le
  `RiggedActions` générique partagé.
- Vérifié en headless (script temporaire, supprimé après usage, AVANT le
  reste de l'intégration) : les 3 fichiers d'animation ont bien exactement 1
  clip chacun, le mesh de base cloné a bien un `SkinnedMesh`/24 os, un clip
  chargé depuis un fichier séparé fait bien bouger le squelette cloné
  (comparaison rest/walk/attack/knockdown), deux clones indépendants jouant
  des clips différents ont des poses indépendantes (pas de contamination
  croisée entre deux Fantassins).
- Build propre (`npm run build`). **Non vérifiable de mon côté** : rendu
  visuel réel (silhouette, teinte provisoire, échelle, orientation,
  fluidité des transitions, apparence du clip de chute) — à confirmer par
  Antoine dans le navigateur. Teinte définitive en attente de ses
  indications manquantes.

**Remplacement complet par une DEUXIÈME version du modèle, même jour** —
Antoine : la première version "ne me plaisait vraiment pas". Nouveau lot de
fichiers fourni au même chemin (dossier source écrasé), avec cette fois un
vrai matériau/texture intégré ("déjà teinte") et un jeu d'animations
différent. `public/models/fantassin/*` entièrement remplacé (anciens
fichiers supprimés).

- **Attaque** → `Right_Hand_Sword_Slash` (1,53s) — demande explicite
  d'Antoine : "coup d'épée de la main", correspondance directe.
- **Marche/course** → `run_fast_10` (0,83s) — demande explicite : "sa course
  doit être 'courir vite 10'", remplace le choix précédent (`Walking`,
  retiré). `Running`/`Run_02`/`run_fast_7_inplace`/`Double_Combo_Attack`/
  `Triple_Combo_Attack` fournis dans le même lot mais NON utilisés (pas
  demandés).
- **Pas de clip de mort dans ce nouveau lot** (contrairement à la première
  version, qui avait `Knock_Down_1`) — `actions` du Fantassin réduit à
  `{walk, attack}` (le `walk` interne pointe vers `run_fast_10`, le nom de
  clé générique ne change pas). La mort retombe donc sur la bascule
  procédurale générique (déjà le comportement par défaut pour toute unité
  sans `knockdown`, voir plus haut) — à rebrancher si Antoine fournit un
  clip de chute pour CE modèle précis.
- **Teinte** : le matériau source est désormais un vrai
  `baseColorTexture` + `emissiveFactor`/`emissiveTexture` (même structure
  exacte que le Mage : `KHR_materials_specular`, pas de `metallicFactor`
  explicite) — mêmes correctifs appliqués (`metalness = 0`, émissive
  désactivée pour protéger `setEmissive`). Teinte d'équipe repensée :
  **camp joueur = texture affichée telle quelle** (`material.color` blanc,
  "déjà teinte" selon Antoine — pas de multiplication), **camp ennemi =
  multiplié par `COLORS.enemyBody`** pour tirer vers le rouge. **Limite
  honnête documentée dans le code** : une teinte multiplicative ne peut pas
  vraiment changer une texture à dominante bleue vers un vrai rouge (le
  résultat vire plutôt au violet/marron) — à corriger si le camp ennemi ne
  se lit pas assez clairement une fois vu en jeu ; la vraie solution serait
  une texture rouge séparée ou un dégradé HSV explicite, pas fait ici sans
  validation visuelle d'abord.
- Vérifié en headless (script temporaire, supprimé après usage) : les 2
  nouveaux fichiers d'animation ont bien exactement 1 clip chacun, le mesh
  de base cloné a bien un `SkinnedMesh`/24 os, les clips chargés séparément
  font bien bouger le squelette cloné. Texture non vérifiable en headless
  (décodage d'image indisponible en Node sans polyfill canvas — confirmé à
  la place par inspection directe du JSON du `.glb`, `baseColorTexture`
  bien présent).
- Build propre. **Non vérifiable de mon côté** — silhouette, texture
  réellement affichée, lisibilité du camp ennemi, orientation, échelle : à
  confirmer par Antoine.

**Deux corrections le même jour, après premier test réel.**

**1. "Rollback/téléportation" pendant la course** — diagnostic confirmé par
lecture directe du `.glb` (script temporaire, supprimé après usage) : le
clip `run_fast_10` contient du vrai ROOT MOTION — l'os `Hips` se translate
d'environ 1,72 unité monde vers l'avant sur toute la durée du clip (dérive
mesurée entre la première et la dernière image-clé), alors que la position
monde du personnage est déjà gérée séparément par la simulation
(`entity.x/z`). En boucle (`LoopRepeat`), l'os revient donc instantanément
de sa position de fin à sa position de départ à chaque nouveau cycle —
exactement le "rollback/téléportation" décrit. Vérifié pour comparaison :
les clips `Walking`/`Running` du Mage ont une dérive ~0 (0.0000/0.0001),
confirmant que c'est spécifique à ce clip précis, pas un bug générique du
pipeline de fusion (`loadRiggedPrototype`). Plutôt que de corriger la piste
(retirer la dérive horizontale de `Hips`, technique standard mais plus de
travail), Antoine a tranché : "ne te prends pas la tête, ça ne rend pas
bien, on préférera l'animation de marche standard" — `run_fast_10`
abandonné, remplacé par `Walking` (dérive ~0.0001, un vrai cycle sur place).
`WALK_URL` dans `fantassinRig.ts` pointe maintenant vers ce fichier ; la clé
interne reste `walk` (générique, voir `RiggedActions`).

**2. Teinte ennemie reprise entièrement** — premier essai (multiply simple
de `COLORS.enemyBody` sur la texture) jugé insuffisant : "teinté en rouge
PAR-DESSUS le bleu, ce n'est pas vraiment ça". Cause : un multiply ne peut
jamais vraiment CHANGER la teinte dominante d'une texture (bleu × rouge
tire vers le violet/marron, jamais un vrai rouge) — déjà pressenti et
documenté avant le premier test, confirmé par le retour réel. Remplacé par
une désaturation puis reteinte (`fantassinRig.ts`,
`applyEnemyGrayscaleTint`) : petit patch du shader standard de Three.js via
`material.onBeforeCompile` (juste après `#include <map_fragment>`, où le
texel de la texture vient d'être échantillonné) — calcule la LUMINANCE du
texel (`dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))`, formule NTSC
standard) puis multiplie cette valeur en niveaux de gris par la couleur
d'équipe. Conserve le relief de la texture (ombres, plis, reflets) tout en
imposant une teinte finale entièrement contrôlée, quelle que soit la
couleur d'origine — contrairement au multiply, qui ne fait QUE moduler la
couleur déjà présente. `customProgramCacheKey` fixe (une seule variante de
shader ennemi, toujours la même couleur cible) pour éviter une
recompilation par instance. Camp JOUEUR inchangé (texture affichée telle
quelle, déjà validée). Build propre. **Non vérifiable de mon côté** — à
confirmer par Antoine que le rouge se lit enfin correctement.

## Modèle riggé de l'Archer (2026-08-11)

Troisième unité du jeu à sortir du système de boîtes procédurales, après le
Mage et le Fantassin. Modèle fourni par Antoine, Meshy AI "Azure Sentinel
Archer" — différence clé cette fois : **deux exports COMPLETS et
INDÉPENDANTS**, un déjà teint en bleu, un déjà teint en rouge ("je t'ai fait
une version du modèle en rouge et l'autre en bleu, elles sont déjà
teintées"), livrés dans deux dossiers au même nom imbriqué l'un dans
l'autre. Couleur de chaque dossier déterminée par extraction directe de la
texture embarquée (script temporaire, PNG écrit sur disque puis inspecté
visuellement) plutôt que devinée par le nom de fichier — confirmé dossier
extérieur = bleu, dossier imbriqué = rouge. Aucune instruction précise sur
le choix des animations ("je te laisse faire").

- **`render/archerRig.ts`** (nouveau) : contrairement au Mage/Fantassin (un
  seul mesh neutre, teinté par code), charge **deux `RiggedPrototype`
  complètement séparés** (`bluePrototype`/`redPrototype`), chacun avec son
  propre mesh ET son propre jeu de clips — jamais de mélange entre les deux
  exports (rien ne garantit que deux générations Meshy distinctes partagent
  un squelette identique au pixel près, même si visuellement très proches).
  `buildArcherModel(team)` sélectionne simplement le bon prototype, sans
  aucune teinte appliquée (pas besoin du détour "désature puis reteinte" du
  Fantassin, qui n'existait que pour recolorer une texture UNIQUE vers une
  couleur différente).
- **Choix d'animations** (aucun ne vient d'Antoine cette fois, à corriger
  sur son retour) :
  - Attaque → `Archery_Shot_1` (1,07s) — proche de `attackCooldown` de
    l'Archer (1,3s, `data/units.ts`), pas besoin de mise à l'échelle
    agressive. Alternatives écartées : `Archery_Shot`/`_2`/`_3` (durées très
    variées, 0,7 à 5s), `Draw_and_Shoot_from_Back_1` (7,9s, trop long).
  - Marche → `Walking` — **vérifié SANS root motion** (dérive Hips ~0,0001)
    avant de le retenir, leçon tirée directement de l'incident du Fantassin
    (`run_fast_10` abandonné pour rollback/téléportation). `Running` existe
    et est ÉGALEMENT sans root motion pour ce modèle précis, mais gardé de
    côté pour rester cohérent avec le choix déjà fait pour le Fantassin
    (une seule vitesse dans le jeu).
  - Mort → `Shot_and_Fall_Backward` — tombe vers l'ARRIÈRE, cohérent avec la
    convention déjà établie pour les unités en boîtes. Contient un vrai
    recul (~1,1 unité monde) mesuré à l'inspection : ACCEPTÉ tel quel
    (clip à usage UNIQUE — LoopOnce, jamais de problème de boucle
    contrairement au cas du Fantassin) comme un effet de recul de l'impact,
    pas corrigé — à revoir si le résultat ne convainc pas visuellement.
    Branché sur la clé générique `knockdown` (même convention que le
    Fantassin, lue génériquement par `UnitViews.sync`).
- **`main.ts`, bug corrigé au passage** : `unitViews.playAttack(attacker.id)`
  n'était appelé QUE pour les attaquants non-archers (l'archer en boîtes
  n'avait pas de bras animé à déclencher, son attaque = uniquement le
  projectile visuel séparé). Avec un Archer riggé, il faut AUSSI jouer son
  clip d'attaque — appelé désormais INCONDITIONNELLEMENT pour tout
  attaquant, le tir de flèche (`projectiles.spawn`) restant EN PLUS
  (branché sur le kit `archer`), pas à la place. Sans effet sur les autres
  unités (elles appelaient déjà `playAttack` avant).
- **`render/unitMesh.ts`** : `buildArcher` réduit à un appel à
  `buildArcherModel(team)` — toute la géométrie en boîtes (jambes, tunique,
  capuche, arc en tore, carquois) retirée, ainsi que `buildBow`/`buildLeg`
  (plus aucun appelant après ce changement).
- Vérifié en headless (script temporaire, supprimé après usage) pour les
  DEUX teintes séparément : chaque jeu de 4 fichiers (base + 3 animations)
  a bien un `SkinnedMesh`/24 os, les clips chargés séparément font bien
  bouger le squelette cloné.
- Build propre (`npm run build`). **Non vérifiable de mon côté** : rendu
  visuel réel (silhouette, orientation, échelle, apparence des animations
  choisies sans instruction précise, lisibilité de la chute avec recul) — à
  confirmer par Antoine.

## Corrections des 3 unités riggées : échelle, attaque de l'Archer, chutes variées (2026-08-11)

Retour d'Antoine après avoir vu les trois modèles en jeu.

- **Échelle** : Fantassin et Archer réduits de 30% (`FANTASSIN_MODEL_SCALE`/
  `ARCHER_MODEL_SCALE = 0.7`, sur la racine directement — jamais touchée par
  `UnitViews.sync`, même convention que `CAVALIER_SCALE`/`MAGE_MODEL_SCALE`).
  Mage réduit de 10% SUPPLÉMENTAIRES (`MAGE_MODEL_SCALE = 0.8 * 0.9 = 0.72`)
  — compris comme un nouveau `-10%` relatif à la taille déjà réduite (0.8),
  pas `-10%` sur la taille d'origine.
- **Attaque de l'Archer enfin branchée** : le clip retenu est désormais
  `Archery_Shot` (le fichier générique "tir à l'arc", PAS `Archery_Shot_1`
  choisi initialement sans instruction) — demande explicite d'Antoine. Ce
  clip dure ~5s à vitesse naturelle, bien plus long que l'ancien
  `attackCooldown` (1,3s) : `data/units.ts`, cooldown monté à **2,0s**
  (`archer.stats.attackCooldown`) — demande explicite d'Antoine ("quitte à
  modifier son attaque, on va bientôt chercher à le buff un peu") : nerf de
  cadence ASSUMÉ en échange d'une bonne synchronisation visuelle, à
  compenser par un futur ajustement (pas fait ici). `archerRig.ts` scale le
  clip sur ce cooldown via `action.setDuration(getUnit('archer').stats.attackCooldown)`
  — lu depuis `data/units.ts`, jamais dupliqué en dur.
- **Projectile calibré sur l'animation** (demande explicite : "fais en sorte
  que son projectile se calibre bien sur l'animation") — contrairement au
  Mage (le lancement du projectile est un événement de SIMULATION,
  `entity.cast`), l'attaque de l'Archer résout ses dégâts INSTANTANÉMENT
  (`combatSystem`, pas de fenêtre d'incantation) : impossible de réutiliser
  le même mécanisme. Solution retenue, purement côté RENDU :
  `config/constants.ts`, `ARCHER_ATTACK_RELEASE_FRACTION = 0.6` (estimation,
  pas de repère visuel pour le vrai point de lâcher) ; `main.ts`,
  `pendingArrowSpawns` (nouvelle file d'attente, `{elapsed, delay, x, z,
  targetX, targetZ, team}`) — au lieu d'appeler `projectiles.spawn`
  immédiatement sur l'événement de combat, la requête est mise en attente
  et retardée de `ARCHER_ATTACK_RELEASE_FRACTION * attackCooldown` secondes
  RÉELLES, décomptée dans la boucle de rendu (`realDt`, comme le reste du
  rendu). Les dégâts restent appliqués au tick de simulation d'origine — ce
  délai est PUREMENT cosmétique, jamais un délai de résolution de combat.
  Vidée aux 5 sites `world.clear()` déjà existants (même liste que
  `rewardedEnemyDeaths`).
- **`main.ts`, bug corrigé au passage** : `unitViews.playAttack` n'était
  appelé que pour les attaquants NON-archers (l'archer en boîtes n'avait pas
  de bras animé). Appelé désormais INCONDITIONNELLEMENT — sans ça, le clip
  d'attaque riggé de l'Archer ne se serait jamais déclenché du tout, malgré
  tout le travail de calibrage ci-dessus.
- **Chutes variées** (demande d'Antoine : "tir et chute lente en arrière",
  "tir et tomber en avant", "tirer et reculer" — comprises comme les 3
  fichiers déjà identifiés : `Shot_and_Slow_Fall_Backward`,
  `Shot_and_Fall_Forward`, `Shot_and_Fall_Backward`) — généralisation du
  mécanisme de mort riggée (jusque-là un seul clip `knockdown` fixe, voir
  Fantassin) : `UnitViews.sync` cherche désormais TOUTES les clés de
  `riggedActions` préfixées `"knockdown"` et en tire UNE au hasard
  (`Math.random()`, cosmétique pur hors simulation) au premier tick de la
  mort — nouvelle `Map` dédiée `deathActionChoice` (le choix DOIT persister
  sur toute la durée de l'animation, `riggedActionState` ne convenait pas :
  il est vidé INCONDITIONNELLEMENT à chaque frame pour une entité morte,
  effaçant le choix aussitôt posé). `archerRig.ts` expose 3 clés
  (`knockdownBack`/`knockdownForward`/`knockdownSlow`) ; le Fantassin garde
  sa seule clé `knockdown` — le tirage au sort n'a alors qu'un seul
  candidat, comportement inchangé.
- Vérifié en headless (script temporaire, supprimé après usage) : les 2
  nouveaux fichiers par camp (attaque générique + 2 variantes de chute
  supplémentaires) chargent bien avec 1 clip chacun, le clip d'attaque est
  bien le long `Archery_Shot` (~5s) et non un des `_1/_2/_3`, `setDuration`
  compresse bien sa vitesse correctement pour une cible de 2s.
- Build propre. **Non vérifiable de mon côté** : rendu visuel réel (échelle
  relative des 3 unités, timing exact du lâcher de flèche, lisibilité des 3
  variantes de chute) — à confirmer par Antoine.

**Immobilité pendant l'attaque, même jour** — Antoine : "il faut que les
archers, lorsqu'ils font une animation d'attaque, soient immobiles". Cause :
l'ancienne amorce d'attaque des unités en boîtes durait 0.22s (`ATTACK_ANIM_DURATION`),
bien trop court pour qu'un glissement pendant ce laps de temps soit
perceptible — mais le clip riggé de l'Archer dure maintenant jusqu'à 2s
(voir plus haut). Si la cible sort de portée PENDANT ce clip,
`movementSystem` fait déjà repartir la position SIMULÉE de l'unité avant que
le clip (purement cosmétique, indifférent à l'état de la simulation) n'ait
fini de jouer — la silhouette semble alors glisser au sol tout en montrant
une pose de tir statique.

- `render/unitViews.ts` : `playAttack(entityId, x, z)` (signature étendue,
  `main.ts` passe désormais `attacker.x`/`attacker.z`) enregistre la
  position RÉELLE de l'entité au moment du déclenchement dans une nouvelle
  `Map` dédiée, `attackAnchor`. Tant que `riggedActionState` vaut `'attack'`
  pour cette entité, la position RENDUE (`view.position.x/z`) reste ancrée à
  cette valeur plutôt que de suivre l'interpolation normale
  (`lerp(prevX, x, alpha)`) — dès que l'attaque cède la main
  (marche/repos), l'interpolation habituelle reprend normalement.
- Généralisé à TOUTE unité riggée avec une action `'attack'` (pas
  spécifique à l'Archer) : le Fantassin (clip 1,53s) et le Mage (mêlée de
  repli, clip 2,83s) bénéficient du même correctif automatiquement, sans
  code supplémentaire — même mécanisme générique déjà en place pour le
  reste du pipeline d'animation riggée.
- Build propre. **Non vérifiable de mon côté** — à confirmer par Antoine que
  les archers restent bien immobiles pendant leur tir.

## Jambes figées pendant l'attaque + retrait complet du Cavalier léger (2026-08-11)

Trois demandes distinctes traitées ensemble.

**1. Bug corrigé : jambes qui continuaient de marcher pendant l'attaque.**
Antoine : "pendant l'animation d'attaque, l'animation des jambes de
l'archer doit être stoppée." Cause réelle, plus large qu'un simple réglage
visuel : `UnitViews.playAttack` écrasait `riggedActionState` directement sur
`'attack'` SANS jamais arrêter l'action précédente (`'walk'`) — et comme
`tickRiggedAnimation` ne fond-enchaîne que sur un CHANGEMENT détecté par
rapport à `riggedActionState`, il ne voyait plus jamais ce changement
(l'état affichait déjà `'attack'` au tick suivant). L'action de marche
restait donc active INDÉFINIMENT en parallèle de l'attaque, ses jambes
continuant de bouger, mélangées au clip d'attaque — un vrai bug de fond, pas
juste un défaut de fondu. Corrigé : `playAttack` arrête maintenant
EXPLICITEMENT et NET (`.stop()`, sans fondu — demande explicite d'Antoine,
"une coupure nette") l'action précédente avant de démarrer l'attaque.
Généralisé à toute unité riggée (Fantassin, Mage y compris), pas seulement
l'Archer.

**2. Tailles revues à la hausse.** Antoine, après avoir vu les réductions
précédentes en jeu : "augmente finalement la taille des unités de 15% pour
le fantassin, 20% pour l'archer et le mage de 5%." Compris comme un nouveau
multiplicateur relatif à la taille ACTUELLE (déjà réduite), même logique
cumulative déjà établie pour les ajustements précédents du Mage :
- Fantassin : 0.7 → 0.7 × 1.15 = 0.805
- Archer : 0.7 → 0.7 × 1.20 = 0.84
- Mage : 0.72 → 0.72 × 1.05 = 0.756

**3. Cavalier léger retiré ENTIÈREMENT du jeu.** Antoine : "tu peux
complètement retirer le cavalier du jeu, il va être trop complexe à
modéliser et riggé." Retrait complet, pas juste un masquage :
- `data/units.ts` : entrée `cavalier_leger` supprimée, `'cavalier'` retiré
  du type union `UnitVisual.kit`.
- `render/unitMesh.ts` : `buildCavalier` supprimé. **Conséquence
  structurelle notable** : avec Mage, Fantassin et Archer déjà passés à des
  modèles `.glb` riggés plus tôt le même jour, le Cavalier était le DERNIER
  survivant du système de boîtes procédurales — `unitMesh.ts` ne contient
  donc plus AUCUNE construction de boîtes (plus aucun appelant pour
  `box()`/`mat()`/`MaterialCache`, retirés). Le fichier se réduit à 3
  fonctions d'un seul appel vers leurs modules `*Rig.ts` respectifs. La
  direction artistique "boîtes plutôt que pantins bas-poly" documentée dans
  CLAUDE.md n'a donc plus AUCUN consommateur actuel dans le jeu — noté ici
  comme un jalon architectural, pas un changement de règle (le système
  reste trivialement réutilisable si une future unité en a besoin).
- `ui/screens.ts` : bouton/handler d'achat du Cavalier retirés ; le
  paramètre `unlockedUnits` de `showShop`/`refreshShop` (qui ne servait
  plus qu'à son déblocage) retiré des deux signatures — mis à jour dans
  `main.ts` (5 sites d'appel).
- `main.ts` : `onBuyCavalier` retiré, bloc de déblocage permanent à la vague
  5 (`CAVALIER_UNLOCK_WAVE`) retiré, imports `isUnitUnlocked`/`unlockUnit`
  retirés (plus aucun appelant).
- `config/constants.ts` : `CAVALIER_UNLOCK_WAVE` et les couleurs placeholder
  du cheval (`horseBody`/`horseMane`) supprimés (plus aucun consommateur).
- `run/runState.ts` : entrée `cavalier_leger` retirée de `KILL_REWARD`.
- **Choix délibéré : le système de capacité Charge (`data/abilities.ts`
  `ChargeAbility`, `sim/systems/abilities.ts` `tryTriggerCharge`/
  `advanceDash`, `CHARGE_DASH_SPEED`/`CHARGE_KNOCKBACK_TILES`) N'A PAS été
  retiré**, contrairement au reste — c'est une infrastructure GÉNÉRIQUE
  (aucune chaîne `'cavalier_leger'` codée en dur nulle part dans le système
  lui-même, vérifié par recherche) explicitement prévue pour un futur
  Chevalier lourd (monté, distinct du Cavalier léger — voir CLAUDE.md,
  toujours noté comme non commencé) : contrairement à l'ancien arbre de
  talents (abandon explicite total demandé par Antoine), rien n'indique que
  ce mécanisme doive disparaître avec l'unité qui l'a inauguré. Trivial à
  retirer plus tard si Antoine change d'avis.
- **Choix délibéré, même raisonnement : `MetaProgress.unlockedUnits`/
  `isUnitUnlocked`/`unlockUnit` (run/metaProgress.ts) conservés** malgré
  l'absence de tout appelant actuel — mécanisme générique de déblocage
  d'unité par numéro de vague (clé = unitId), fait partie du FORMAT DE
  SAUVEGARDE persisté (avec sa propre logique de migration) : le retirer
  aurait touché le code de migration pour un gain nul, alors qu'il reste
  trivialement réutilisable pour une future unité à débloquer.
- Build propre (`npm run build`), aucune erreur de compilation — la vérification
  de type de TypeScript a directement confirmé qu'aucune reference residuelle
  au type `'cavalier'` ne subsistait (le retrait du membre d'union aurait fait
  echouer la compilation sinon). Recherche textuelle complementaire
  (`cavalier_leger`, `'cavalier'`) dans tout `src/` : aucune reference
  restante en dehors des commentaires historiques. Non verifiable
  visuellement de mon cote — a confirmer par Antoine que le Cavalier a bien
  disparu de la boutique et de l'editeur de maps (bestiaire construit
  dynamiquement depuis `Object.values(UNITS)`, devrait suivre automatiquement).

## Stack

Three.js + TypeScript + Vite. Caméra orthographique inclinée. La DA est
construite en boîtes (voir Silhouettes ci-dessus) : le tri de profondeur est
gratuit, et le raycast souris donne un point d'impact exact au sol, ce dont la
flèche a besoin.

Aucun asset graphique pour les unités, le sol et le petit décor. Tout est
généré par le code — y compris les textures d'herbe et de terre du sol,
dessinées sur un canvas au chargement plutôt que chargées depuis un fichier
image (voir `render/textures.ts`). Les petits objets décoratifs (touffes,
buissons, cailloux, débris de bois) restent en boîtes de couleur unie ; la
texture ne sert qu'au sol.

**Exception : rochers et arbres sont de vrais modèles `.glb` importés**,
décision d'Antoine après deux tentatives procédurales insatisfaisantes
(boîtes empilées, jugées trop « Minecraft », puis des masses facettées par
déplacement aléatoire de sommets, qui produisaient du bruit géométrique — un
tas de débris — plutôt qu'une masse rocheuse lisible). Source : Kenney
« Nature Kit » (kenney.nl/assets/nature-kit), licence CC0 (domaine public,
aucune attribution requise). Fichiers copiés tels quels (déjà au format
`.glb`) dans `public/models/nature/` ; chargés et mis en cache une seule fois
via `GLTFLoader` (voir `render/assetLibrary.ts`), puis clonés pour chaque
obstacle. Le chargement est asynchrone : `createBoard()` doit être attendu
(`await`) avant d'ajouter le plateau à la scène (voir `main.ts`). La hitbox
d'un obstacle reste un rectangle exact dérivé de `OBSTACLES`, totalement
indépendant de la géométrie visuelle importée — cette règle ne change pas.

**Composition des rochers : horizontale, jamais empilée.** La toute première
intégration `.glb` réutilisait la structure en « tiers » (silhouette en
étages empilés du bas vers le haut) héritée des tentatives procédurales
précédentes — résultat jugé « trop vertical, totem/empilement de blocs »
malgré de vrais modèles. Cause identifiée par MESURE DIRECTE (script Node lisant
les `accessors` glTF de chaque `.glb`, pas à l'œil) : le pool de modèles
mélangeait des rochers vraiment larges/bas (`rock_largeA-F`, ratio
largeur/hauteur 1.9–3.9) avec des rochers aussi hauts que larges
(`rock_tallA-J`, ratio 0.6–1.2, retirés depuis de `public/models/nature/`).
`render/rocks.ts` n'empile plus rien : une masse principale posée au sol
(70–80 % du plus petit côté de l'emprise), une masse secondaire ACCOLÉE
LATÉRALEMENT au même niveau (jamais dessus), parfois une troisième plus
petite, puis des débris au pied — la hauteur finale vient uniquement des
proportions naturelles des modèles choisis. Avant de choisir de nouveaux
modèles dans ce pack (ou un autre), mesurer leurs proportions par script
plutôt que deviner à partir du nom de fichier.

Une lumière de remplissage (`DirectionalLight` faible et froide, sans ombre,
opposée au soleil, voir `renderer.ts`) a aussi été ajoutée : les faces à
l'ombre des modèles `.glb` tombaient presque au noir sans elle.

**Image de fond du ciel remplacée** (2026-08-10, nouvelle image fournie par
Antoine, `public/textures/sky_background.png` écrasée directement — même
chemin, aucun changement de code nécessaire dans `render/renderer.ts`).
Toujours la même limite connue : une image plaquée en fond, pas un vrai
skybox, fixe à l'écran quelle que soit la rotation de la caméra.

**Objectif de style pour ces textures (pas encore atteint, à reprendre plus
tard) :** Antoine a montré deux photos de référence — une pelouse tondue très
détaillée (brins fins, vert uniforme, rendu quasi photo) et une terre battue
brune avec beaucoup de grain, des petits graviers clairs et une trace/sentier
plus clair en diagonale. La version actuelle (bruit procédural : traits verts
aléatoires, speckles bruns) va dans cette direction mais reste stylisée, pas
photoréaliste — un vrai rendu photo demanderait soit de vraies images
(contredit la règle « aucun asset graphique »), soit un bruit procédural bien
plus sophistiqué (plusieurs octaves, normal map). Décision reportée
explicitement par Antoine : ne pas y retoucher tant que ce n'est pas redemandé.

Commandes : `npm run dev` pour développer, `npm run build` pour vérifier que
tout compile (à faire avant chaque livraison).

## Où on en est

Étapes 1 et 2 terminées, et largement dépassées :

- **Plateau** : 18×26 cases par défaut (redimensionnable depuis l'éditeur de
  maps, voir chantier éditeur ci-dessus), relief réel (strates herbe/terre/
  sous-sol empilées, pas une plaque plate), texture procédurale sur l'herbe et
  la terre, décor (touffes, buissons, cailloux, débris de bois) à densité
  proportionnelle à la surface. Rochers, arbres (nombreuses essences
  disponibles depuis l'élargissement de la banque d'assets, voir chantier
  éditeur) et props (champignons, buissons, fleurs, bois, divers) bloquent à
  la fois la ligne de tir et les pas ; tous sont de vrais modèles `.glb`
  importés (Kenney Nature Kit, CC0). Le clic de placement rejette toute case
  occupée par un obstacle. L'arbre qui se trouvait en (5, 8), juste devant la
  baliste du joueur, a été retiré le 2026-08-08 (il gênait son champ de tir).
- **Unités** : fantassin (modèle `.glb` riggé et animé depuis le 2026-08-11,
  voir "Modèle riggé du Fantassin" — deuxième version du modèle après un
  premier essai rejeté, teinte ennemie reprise en désaturation+reteinte
  après retour d'Antoine ; remplace la silhouette en boîtes ET le rendu
  instancié, voir cette même section pour le compromis de performance
  accepté), archer (modèle `.glb` riggé et animé depuis le 2026-08-11, voir
  "Modèle riggé de l'Archer" — deux exports déjà teints bleu/rouge fournis
  par Antoine, remplace l'arc en tore/carquois en boîtes) et Mage
  (zone/artillerie magique, voir "Chantier bestiaire — Mage" plus bas —
  modèle `.glb` riggé et animé depuis le 2026-08-11, voir "Modèle riggé du
  Mage"). **Cavalier léger RETIRÉ du jeu le 2026-08-11** ("trop complexe à
  modéliser et riggé", voir "Jambes figées pendant l'attaque + retrait
  complet du Cavalier léger") — plus aucune unité montée disponible pour
  l'instant. Chevalier (lourd, monté) toujours pas commencé — la capacité
  Charge générique reste en place pour lui (voir la même section), mais
  aucune unité ne l'utilise actuellement.
- **Baliste du joueur** : remplacée le 2026-08-08 par un vrai modèle fourni
  par Antoine (`render/ballista.ts`, `.obj` + texture exportés de Blockbench,
  dossier `Projet prodolphe` sur son Bureau — copiés dans
  `public/models/ballista/`), chargée une fois via `OBJLoader` puis clonée
  comme les rochers/arbres. Remplace l'ancienne baliste procédurale en
  boîtes. "Level 1" seulement pour l'instant — Level 2/3 fournis en même
  temps (même dossier), prévus comme palier d'amélioration visuelle via
  l'arbre de talents plus tard, pas encore branchés. Le `.obj` référence un
  `.mtl` absent du dossier fourni ; sans conséquence, ignoré, texture
  appliquée à la main. **Orientation pas vérifiée visuellement** (voir
  Problèmes connus) : l'axe de tir supposé est -Z (le plus court des deux
  axes horizontaux du modèle, mesuré directement dans le `.obj` : 1.44 contre
  1.87 en X), par cohérence avec le reste du rendu — à confirmer par Antoine.
- **Combat** : ciblage verrouillé, attaque avec cooldown, PV en pips HTML,
  miss avec texte flottant, ligne de tir bloquable (contournement latéral
  intelligent côté archer), collision physique avec les obstacles. RNG
  déterministe, graine affichée en debug. **Mort** (2026-08-08, demande
  d'Antoine) : chute en arrière (bascule sur l'axe X local, `DEATH_FALL_DURATION`,
  toujours vers l'arrière quelle que soit la direction où l'unité regardait —
  voir `render/unitViews.ts`) puis fondu d'opacité réel (`DEATH_FADE_DURATION`,
  matériaux mis en cache à la création de chaque silhouette pour éviter de
  retraverser toute la hiérarchie à chaque frame) — remplace l'ancien
  rétrécissement/enfoncement dans le sol. Même animation pour fantassin et
  archer, pas de variante par kit pour l'instant. **Flash d'impact au contact**
  (2026-08-09, premier ajout "game feel", validé visuellement par Antoine —
  "excellente" suggestion) : `UnitViews.playHit`/`setEmissive`
  teinte brièvement (`HIT_FLASH_DURATION`) la silhouette touchée en blanc via
  l'emissive des matériaux — seulement sur un HIT réel, jamais sur un miss
  (déjà signalé par le texte "raté", cumuler les deux ferait du bruit). Branché
  à la fois sur le combat automatique (`world.combatEvents`) et sur la flèche
  du joueur (`world.playerArrowEvent.hit`) — pour la flèche du joueur, la
  résolution EST au moment de l'arrivée visuelle du trait (le vol est vraiment
  simulé, voir `sim/playerArrow.ts`), donc pas de décalage à corriger,
  contrairement au combat automatique où le flash apparaît au moment du TIR
  (l'event de `combatSystem` est résolu instantanément), pas à l'atterrissage
  cosmétique du projectile de l'archer — même décalage déjà accepté pour le
  texte de miss, rien de nouveau introduit par ce correctif.
  **Bug de matériaux partagés entre unités corrigé au passage** (2026-08-09,
  découvert en préparant ce flash) : `render/unitMesh.ts` mettait ses
  matériaux en cache dans une `Map` au niveau du MODULE (`mat(color)`), donc
  TOUTES les unités de même couleur (steel, steelDark, blade, bois, et même le
  tissu d'équipe, qui n'a que deux valeurs possibles par camp) partageaient les
  MÊMES instances de matériau — sans conséquence tant que rien ne les mutait,
  mais `setOpacity` (fondu de mort, déjà en prod) et `setEmissive` (ce flash)
  mutent directement les matériaux d'UNE unité ciblée : avec un cache module,
  faire mourir ou toucher une unité aurait fait clignoter/s'estomper TOUTES
  les unités de couleur identique sur le plateau, pas seulement celle visée.
  Corrigé à la racine (pas de `visible=false` local) : chaque appel à
  `buildFantassin`/`buildArcher` crée maintenant son PROPRE cache de matériaux
  local (`MaterialCache`), jamais partagé entre deux silhouettes — vérifié en
  headless (deux unités construites séparément n'ont plus aucun matériau en
  commun, alors que la réutilisation locale au sein d'UNE silhouette reste
  intacte). Le fondu de mort en profite aussi rétroactivement : il avait
  exactement le même risque depuis son introduction, juste jamais déclenché
  assez pour qu'Antoine le remarque (une seule unité meurt rarement pile en
  même temps qu'une autre partage sa couleur ET qu'on regarde cette autre
  unité).
  **Recul cosmétique au contact essayé puis retiré** (2026-08-09, deuxième
  ajout "game feel" choisi par Antoine parmi 3 pistes proposées, implémenté
  en rendu pur comme la ruade de l'attaquant — jamais écrit dans
  `entity.x/z` — puis retiré au jugement d'Antoine après coup d'œil : "le
  flash seul serait en fait plus sympa visuellement"). Ne pas le
  réintroduire sans qu'il le redemande explicitement — voir le commentaire
  laissé sur `UnitViews.playHit`. Le flash d'impact (ci-dessus) reste seul en
  place.
- **Boucle de jeu** : menu principal → nouvelle run (armée reset à un
  fantassin, 5 or) → phase de placement interactive (armée réelle, sélection/
  déplacement/vente/objets à la souris, boutique auto-ouverte) → validation →

## ⚠️ NOTE DE RÉCUPÉRATION (2026-08-11)

Ce fichier a été retrouvé TRONQUÉ sur le disque à cet endroit précis (coupure
en plein milieu de la phrase ci-dessus, "→ validation →" sans suite) au début
de cette session — cause probable : une des interruptions du serveur de dev
(`EBUSY`, voir "Problèmes connus") survenue pendant une écriture de ce
fichier. Tout ce qui suivait normalement ce point (chantiers éditeur de
maps/économie/inventaire/sauvegarde, progression des vagues, rollback de
l'arbre de talents, carte "vague1-20", pathfinding, chantier rendu instancié,
bestiaire Cavalier/Mage, etc.) existe encore dans le contexte de conversation
de Claude à ce moment-là et PEUT être restauré intégralement sur demande —
pas encore fait ici par souci de ne pas retarder les correctifs en cours de
test par Antoine. Section ajoutée directement à la suite de la coupure plutôt
que de tenter une reconstruction complète dans la foulée.

## Modèles riggés Fantassin/Archer — retour du 2026-08-11 (Archer)

Message d'Antoine pendant que le Fantassin (troisième version du modèle,
voir plus haut dans l'historique complet — actuellement non restauré dans ce
fichier, voir note ci-dessus) était en cours d'intégration : trois problèmes
distincts sur l'Archer riggé (modèle Meshy AI "Azure Sentinel Archer",
clip d'attaque "Archery_Shot" à l'époque).

1. **Visée ~90° de travers pendant l'animation d'attaque.** Diagnostic
   confirmé par script hors-navigateur (lecture directe des `.glb`, aucun
   accès visuel) : dans TOUS les clips "Archery_Shot"/`_1`/`_2`/`_3` fournis,
   la direction du bras/arc (mesurée `RightHand → LeftHand` en espace monde,
   dernière image-clé) diverge d'environ 78-80° par rapport à l'avant (-Z) —
   un écart quasi identique dans chaque variante, donc une convention de
   capture différente de "Walking"/notre `facingFix`, pas un accident d'un
   clip précis. Le Hips lui-même reste correctement orienté (yaw quasi nul
   dans tous les clips) — seul le bras déviait. Une correction générique
   (`UnitViews.applyAimCorrection`, rotation monde +90° sur
   RightShoulder/LeftShoulder, opt-in via `userData.aimCorrectionBones`) a
   été écrite et vérifiée par build, PUIS RETIRÉE quelques minutes plus tard
   (voir point 4) — n'existe plus dans le code.
2. **`missChance` de l'Archer réduit** ("faire en sorte que sa compétence
   touche plus souvent") : 0.13 → 0.07 (`data/units.ts`) — sous la fourchette
   habituelle 10-15%, écart délibéré pour cette demande précise.
3. **Origine visuelle de la flèche corrigée** ("le projectile... ne part pas
   de l'archer il part un mètre devant"). `UnitViews.getBoneWorldPosition(entityId,
   boneName)` (nouveau, `render/unitViews.ts`) lit la position MONDE actuelle
   d'un os nommé de la silhouette riggée. `main.ts`, `pendingArrowSpawns`
   gagne `attackerId` ; au moment du départ visuel réel (pas au moment du
   clic déclencheur), la position de `RightHand` (main qui tient la corde)
   remplace le centre approximatif de l'unité comme origine du projectile,
   avec repli sur l'ancienne approximation (`pending.x/z`, position de
   simulation figée au moment de l'événement de combat) si l'os/l'entité a
   disparu d'ici là. Nécessitait de RÉORDONNER la boucle de rendu :
   `unitViews.sync()` tourne désormais AVANT le traitement de
   `pendingArrowSpawns` (auparavant après) — sans ça, la pose lue serait
   celle de la frame précédente.
4. **Animation d'attaque retirée entièrement, quelques minutes après le
   correctif de visée** ("Bon retirer l'animation d'attaque des archers on
   va la faire nous même la c'est horrible") — décision définitive
   d'Antoine, pas liée à un résidu du correctif du point 1 (il n'a pas eu le
   temps d'être testé en jeu avant ce retour). `render/archerRig.ts` : plus
   aucune référence aux fichiers `archer_*_attack.glb` dans
   `preloadArcherModel`, `actions` n'a plus de clé `'attack'` —
   `UnitViews.playAttack` vérifie déjà `actions?.['attack']` avant tout
   effet, donc son absence suffit à ce que l'Archer reste simplement sur sa
   dernière pose marche/repos pendant qu'il tire, sans code spécial
   supplémentaire. Le correctif de visée du point 1 n'avait plus de raison
   d'être (rien à corriger sur un clip qui ne joue plus) : `applyAimCorrection`
   et son câblage (`aimCorrectionBones`/`aimCorrectionRadians`) ont été
   retirés du code entièrement plutôt que laissés inertes — seuls
   `getBoneWorldPosition` (point 3, toujours utile même sans animation
   d'attaque) et les 3 clips de mort (jamais critiqués par Antoine) restent
   en place. Fichiers `.glb` d'attaque (`archer_*_attack.glb`) laissés tels
   quels dans `public/models/archer/` (non supprimés, pour éviter un nouveau
   redémarrage du serveur de dev pendant une session déjà chargée) —
   inutilisés, à nettoyer si besoin plus tard.
   **Antoine fournira son propre clip d'attaque plus tard** ("on va la faire
   nous-même") — ne pas retenter d'en construire un procéduralement ou d'en
   choisir un autre dans le pack Meshy sans qu'il le redemande.

**Fantassin (troisième version du modèle, sans aucune animation fournie)** :
en cours d'intégration au moment de ce retour sur l'Archer — état actuel du
code, `render/fantassinRig.ts` : charge deux prototypes pré-teintés
(`fantassin_blue_base.glb`/`fantassin_red_base.glb`, mêmes fichiers que ceux
fournis par Antoine, chemin source `Fantassin\Nouveau dossier` sur son
Bureau) SANS aucune animation (le fichier source n'en contient aucune,
vérifié) — pas de `riggedMixer`/`riggedActions` du tout pour l'instant, donc
`UnitViews` retombe automatiquement sur la bascule de mort procédurale
générique et n'affiche aucune marche/attaque animée (silhouette figée en
pose de repos/bind pose, qui s'est révélée raisonnablement naturelle à
l'analyse du squelette — bras le long du corps, pas un T-pose). Squelette de
CE modèle spécifiquement : os anonymes ("Bone_000", "Bone_001"...), pipeline
d'auto-rigging différent (probablement UniRig) de celui du Mage/Archer/
précédent Fantassin (noms Mixamo lisibles) — hiérarchie déjà tracée
manuellement par analyse FK hors-navigateur (chaîne de bras droit identifiée :
épaule → coude → poignet → doigts, chaîne de bras gauche similaire mais sans
doigts, jambes symétriques) mais PAS ENCORE traduite en animation de code —
prochain chantier, pas commencé plus loin que cette analyse. Antoine n'a pas
donné de retour sur cette troisième version pour l'instant (occupé sur
l'Archer au moment de cette note).

## Animations d'attaque procédurales — Fantassin et Archer (2026-08-12)

Antoine, en fin de session précédente ("je suis claqué... tu penses pouvoir
faire un truc pour les animations d'attaque des fantassin et des archers ?
les modèles sont rigés je crois tu peux prendre la main à partir de ça ?
ne code rien ce soir") : demande explicite de proposer une animation
d'attaque pour les DEUX unités, sans coder le soir même (respecté — la
session précédente s'est arrêtée sur une réponse texte, aucun fichier
touché). Reprise le lendemain sur "Hello, je te laisse reprendre !".

**Contexte** : le Fantassin (3ᵉ version du modèle) n'a AUCUNE animation
fournie ; l'Archer avait son clip d'attaque retiré la veille ("c'est
horrible"). Les deux ont donc besoin d'une animation d'attaque construite
plutôt que chargée.

- **`render/proceduralSwing.ts`** (nouveau, partagé par les deux unités) :
  `buildSingleBoneSwingClip(scene, boneName, axis, keyframes, clipName)` —
  construit un `THREE.AnimationClip` à UNE SEULE PISTE (rotation d'un seul
  os) à partir d'une liste d'images-clés exprimées en **angle MONDE relatif
  à la pose de repos** (`{time, degrees}`), pas en quaternions locaux bruts —
  plus simple à raisonner sans accès visuel. Technique : pour chaque
  image-clé, quaternion monde désiré = `delta(axis, degrees) * restWorld`,
  reconverti en quaternion LOCAL via `inverse(parentWorld) * desiredWorld` —
  la même méthode déjà utilisée (puis retirée) pour la correction de visée
  de l'Archer la veille, mais cette fois pour CONSTRUIRE une animation
  plutôt que corriger un clip existant. Suppose que l'os et son parent
  restent à leur pose de repos au moment de l'appel (vrai ici : un seul os
  animé par clip).
- **Squelettes analysés par script hors-navigateur** (aucun accès visuel,
  comme tout ce chantier de rig) : pour le Fantassin (os anonymes
  "Bone_XXX", pipeline d'auto-rigging différent de Mixamo), hiérarchie
  tracée par calcul de cinématique directe (positions monde de chaque os au
  repos) — confirmé : Hips = `Bone_001`, colonne montante jusqu'à
  `Bone_002` (fourche tête/bras droit/bras gauche), bras droit =
  `Bone_025` (épaule, enfant direct de `Bone_002`) → `Bone_024` → `Bone_023`
  → `Bone_022` → `Bone_021` (poignet, fourche ensuite vers deux chaînes de
  doigts). Pour l'Archer, squelette Mixamo déjà connu (`RightShoulder`,
  parent `Spine`).
- **Coup d'épée du Fantassin** (`FANTASSIN_RIGHT_SHOULDER_BONE = 'Bone_025'`,
  rotation MONDE autour de l'axe X) : épaule droite animée RIGIDEMENT (tout
  le bras + l'épée suit comme un seul bloc, pas d'animation de coude
  séparée — le choix le plus sûr sans accès visuel, pas de risque de
  déformation). Images-clés `{0:0°, 0.1:-65°, 0.28:+55°, 0.45:-8°, 0.55:0°}`
  — amorce (bras levé en arrière), frappe (bras projeté devant vers le bas),
  léger contre-coup, retour au repos. **Calibré par script hors-navigateur
  AVEC UN VRAI `THREE.AnimationMixer`** (pas de mock, pas juste des poses
  statiques) : simulation complète de la lecture du clip, position monde de
  la main droite échantillonnée toutes les 0.05s — trajectoire confirmée
  cohérente (la main part du repos, monte-recule pendant l'amorce, traverse
  vers l'avant-bas pendant la frappe avec un passage devant le corps, revient
  au repos). Axe X choisi après avoir mesuré que la pose de repos de CE
  squelette a déjà le bras presque tendu vers le bas (pas un T-pose) — une
  rotation X balaie donc un arc vertical naturel sur le côté droit, pas un
  mouvement en travers du corps.
- **Tir à l'arc de l'Archer** (`ARCHER_RIGHT_SHOULDER_BONE = 'RightShoulder'`,
  rotation MONDE autour de l'axe Y, PAS X) : axe différent du Fantassin
  délibérément — une rotation Y est un pivot horizontal à hauteur CONSTANTE,
  qui correspond mieux à un geste d'archer réel (la main de corde recule
  vers la joue/l'oreille puis se relâche vers l'avant, sans monter ni
  descendre), vérifié numériquement (la coordonnée Y de la main reste fixe
  sur tous les échantillons). Images-clés `{0:0°, 0.18:+55°, 0.32:-35°,
  0.45:0°}` — tension (main tirée vers l'arrière), relâchement (main
  projetée vers l'avant, à travers et au-delà du repos), retour au repos.
  Même vérification par simulation `AnimationMixer` complète.
- **Câblage** (`fantassinRig.ts`/`archerRig.ts`) : le clip "Attack" est
  construit UNE FOIS par prototype (bleu et rouge séparément) dans
  `preloadFantassinModel`/`preloadArcherModel`, poussé dans
  `prototype.animations` — `buildFantassinModel`/`buildArcherModel` le
  retrouvent ensuite par nom exactement comme un clip chargé depuis un
  fichier séparé (même mécanisme de liaison par nom d'os que le reste du
  pipeline riggé, voir `riggedGltf.ts`). Le Fantassin n'a toujours pas de
  clé `'walk'` (pas de marche animée, pas demandé cette fois) — reste en
  pose de repos pendant les déplacements, seule l'attaque est animée.
  L'Archer récupère sa clé `'attack'` dans `RiggedActions`, retirée la
  veille — `setDuration` (qui compressait l'ancien clip mocap de 5s sur le
  cooldown) n'est plus nécessaire, ce nouveau clip (0.45s) tient déjà
  largement sous `attackCooldown` (2.0s) sans compression.
- **Vérifié** : build propre (`tsc`/`vite build`), démarrage du serveur de
  dev sans erreur (le préchargement des deux modèles, qui aurait échoué si
  un nom d'os était incorrect ou la construction du clip levait une
  exception, réussit silencieusement). **Non vérifiable de mon côté au-delà
  de ça** : aucun accès visuel au rendu ni possibilité de déclencher une
  attaque en jeu réel depuis mon environnement — la LECTURE du clip
  (interpolation de quaternions, `AnimationMixer` standard) est un
  mécanisme Three.js éprouvé et déjà utilisé pour toutes les autres
  animations riggées du jeu, donc le risque restant porte sur le RESSENTI
  visuel (l'angle exact, la vitesse, "est-ce que ça a l'air cool") plutôt
  que sur un risque de crash ou de désarticulation — à confirmer et ajuster
  par Antoine une fois testé en jeu.

## Correctif du bras + marche procédurale du Fantassin (2026-08-12, même jour)

Antoine, après un premier test réel : "tu t'es trompé de bras pour
l'animation du bras, et il faudrait également rajouter une animation de
marche."

- **Bras corrigé** : `FANTASSIN_RIGHT_SHOULDER_BONE` passe de `Bone_025` à
  `Bone_030`. Cause du bug identifiée par relecture de mon propre
  raisonnement : la détermination "chaîne côté +X = bras droit" avait
  supposé que l'avant NATIF (non corrigé) du modèle était -Z — mais
  `facingFix` (rotation.y = π, appliqué sur ce modèle comme sur le Mage/
  l'Archer) existe précisément PARCE QUE l'avant natif de ce pipeline
  d'export est +Z, pas -Z. Avec le bon axe, côté droit = -X, donc
  `Bone_030` (jusque-là étiqueté "bras gauche" dans mon analyse) est la
  VRAIE épaule droite. Détail cohérent avec la correction : cette chaîne
  n'a pas de sous-chaîne de doigts séparée (contrairement à `Bone_025`,
  qui en a deux) — asymétrie mineure du modèle source, sans impact sur
  l'animation (l'épaule est animée rigidement, doigts ou pas). Reste NON
  vérifié visuellement — confiance basée sur le raisonnement corrigé,
  pas une observation.
- **Marche ajoutée** (`render/proceduralSwing.ts` étendu,
  `buildMultiBoneClip` nouveau) : balancement alterné des deux hanches
  (`Bone_011`/`Bone_017`, peu importe laquelle est anatomiquement "droite"
  ici — la marche est symétrique) autour de l'axe MONDE X, même principe
  que `tickWalkAnim` des unités en boîtes (jambes en phase opposée) mais en
  AnimationClip BOUCLÉE (`LoopRepeat`) plutôt qu'en rotation procédurale
  par frame. `buildMultiBoneClip(scene, bones[], name, duration)` combine
  plusieurs pistes (une par os) dans un seul clip — généralisation de
  `buildSingleBoneSwingClip` (extrait un `buildBoneTrack` interne partagé)
  pour ce cas à deux os simultanés, premier vrai besoin de plusieurs pistes
  dans un même clip. Durée 0.6s, images-clés `{0:0°, 0.15:±25°, 0.3:0°,
  0.45:∓25°, 0.6:0°}` (signes opposés entre les deux hanches). **Vérifié
  par script hors-navigateur avec un VRAI `AnimationMixer` en
  `LoopRepeat`** : les deux pieds oscillent en parfaite phase opposée
  (signes toujours inversés), et la boucle est exactement sans à-coup au
  point de raccord (t=0 et t=0.6 ont des valeurs identiques). `Walking`
  poussé dans `prototype.animations` aux côtés d'`Attack`, câblé dans
  `buildFantassinModel` via une clé `'walk'` désormais présente dans
  `RiggedActions` (le mixer/actions ne sont construits que si au moins un
  clip existe, mais les deux existent toujours ensemble en pratique).
- Build propre, démarrage du serveur de dev sans erreur (même garantie
  qu'avant : un mauvais nom d'os ferait échouer le préchargement). **Non
  vérifiable visuellement** — à confirmer par Antoine, en particulier le
  bras corrigé (raisonnement, pas observation directe) et le ressenti de
  la marche (amplitude 25° choisie par Claude, à ajuster si trop/pas assez
  marquée).

## Coup d'épée du Fantassin V2 — refonte complète multi-os (2026-08-12)

Antoine, après avoir vu le V1 ("pas mal" — épaule seule, un axe) : a d'abord
demandé d'essayer l'animation "contenue dans le fichier du modèle" (aucune
n'existe — vérifié deux fois par lecture directe du glTF, confirmé par
Antoine : "je n'ai que l'animation de l'ancien modèle, ce n'est pas celui
qu'on utilise"), puis a fourni un cahier des charges complet (~200 lignes)
pour une V2 : coup diagonal HAUT-DROITE → DEVANT → BAS-GAUCHE, chaîne
complète torse/épaule/bras/avant-bras/poignet/bouclier/bassin/tête,
timing/easing précis, architecture générique réutilisable, quaternions
sans dérive.

- **`render/easing.ts`** (nouveau) : `easeInCubic`/`easeOutCubic`/
  `easeInOutCubic`/`smoothstepEase`, fonctions pures `[0,1]→[0,1]`.
- **`render/proceduralAttackAnimator.ts`** (nouveau) : `ProceduralAttackAnimator`,
  classe GÉNÉRIQUE (pas spécifique au Fantassin — réutilisable pour
  Cavalier/Mage/mini-boss plus tard, comme demandé) pilotée par
  `AttackAnimationConfig` (liste de canaux os, chacun avec plusieurs axes
  MONDE et une valeur en degrés par image-clé de temps partagée). API :
  `startAttack()`/`isPlaying()`/`stop()`/`update(dt)`. Principe anti-dérive
  (demande explicite d'Antoine, "jamais `rotation.x +=` sans repère") :
  quaternion MONDE de repos capturé UNE SEULE FOIS à la construction, jamais
  ré-échantillonné depuis un état déjà écrit par ce même système — chaque
  frame recalcule `delta(t) * restWorld` (toujours relatif au repos fixe)
  puis reconvertit en local via le quaternion MONDE ACTUEL du parent.
  Propriété clé qui simplifie tout le reste : si un os PARENT (le torse) est
  LUI AUSSI animé par ce système la même frame, l'orientation MONDE finale
  d'un os enfant (l'épaule) reste EXACTEMENT égale à sa cible vérifiée,
  quoi que fasse le parent — seule la valeur LOCALE change pour l'atteindre.
  Condition : `config.bones` doit lister les canaux PARENT AVANT ENFANT.
  Dégradation propre : un os dont aucun nom candidat n'est trouvé est
  simplement ignoré (jamais d'exception).
- **`fantassinRig.ts` — `FANTASSIN_ATTACK_CONFIG`** : remplace entièrement
  `SWORD_SWING_AXIS`/`SWORD_SWING_KEYFRAMES` (V1, `AnimationClip` baked sur
  la seule épaule) — l'attaque n'est PLUS un clip Three.js du tout, c'est un
  `ProceduralAttackAnimator` construit par instance (`root.userData['proceduralAttack']`),
  indépendant du `mixer`/`riggedActions` (qui ne gère plus que `'walk'`).
  Chronologie reprise telle quelle des specs d'Antoine : `{0, 0.18, 0.25,
  0.43, 0.56, 0.72}` (repos/windup/anticipation/impact/follow-through/
  recovery), easings par segment `[easeInOutCubic, easeInOutCubic,
  easeInOutCubic, easeOutCubic, smoothstepEase]`.
  - **Épaule droite (`Bone_030`, canal DOMINANT)** — SEUL canal vérifié
    numériquement en détail (script hors-navigateur, vrai `THREE.Quaternion`/
    `Object3D`, hiérarchie `facingFix` incluse pour travailler dans le repère
    MONDE final du jeu) : rotation combinée axes X+Z. Windup
    (X=-110°,Z=+20°) lève la main à ~1,34 de hauteur (repos 0,53, donc
    nettement au-dessus) en restant côté droit (dX≈0) et loin derrière
    (dZ≈+1,16) — "au-dessus de l'épaule droite, en arrière" confirmé
    numériquement. Impact (X=+50°,Z=-35°) place la main devant le corps
    (dZ=-0,46) en ayant déjà commencé à traverser vers la gauche (dX=-0,19).
    Follow-through (X=+10°,Z=-70°) termine LOIN à gauche (dX=-0,84, traverse
    largement le centre) à hauteur modérée (dY=+0,25, nettement sous le pic
    du windup) — la trajectoire complète dessine bien HAUT-DROITE → DEVANT
    → BAS-GAUCHE, conforme à la demande.
  - **Bassin (`Bone_001`), torse (`Bone_002`), tête (`Bone_020`)** :
    rotations (yaw, axe Y) avec les valeurs EXACTES données par Antoine
    (bassin -3°/+4°, torse +15°/+18°/-10°/-15°, tête contre-rotation
    -6°/-7°/+4°/+6°) — non re-vérifiées numériquement au-delà de la
    propriété générale "la cible d'un enfant reste exacte quel que soit le
    parent", accords de confiance moyen (valeurs fournies par Antoine
    lui-même, pas inventées).
  - **Bouclier (`Bone_025`), bras/coude/poignet (`Bone_029`/`028`/`027`)** :
    accents d'amplitude modeste (10-35° selon le canal, contre 110-70° pour
    l'épaule dominante) choisis par Claude en suivant les proportions
    relatives demandées ("épaule 100%, torse 20-30%, bouclier 5-10%"), NON
    vérifiés numériquement individuellement — risque jugé limité car ils
    s'AJOUTENT par-dessus la trajectoire déjà vérifiée de l'épaule, jamais à
    sa place (le bouclier en particulier pourrait bouger dans le mauvais
    sens si son repère X/Z diffère de celui mesuré pour l'épaule — amplitude
    volontairement petite pour limiter l'impact visuel d'une erreur de
    signe).
- **`unitViews.ts`** : `sync()` appelle `proceduralAttack.update(realDt)`
  juste APRÈS `tickRiggedAnimation` (qui exécute `mixer.update`), conforme à
  l'ordre demandé par Antoine. `attackAnchor` (immobilité pendant l'attaque,
  déjà en place pour les clips baked) étendu pour couvrir aussi
  `proceduralAttack.isPlaying()` — sans ça, le Fantassin aurait glissé au
  sol pendant les 0,72s de l'animation si sa cible bougeait. `playAttack`
  déclenche les DEUX mécanismes (clip baked OU animateur procédural, jamais
  les deux à la fois pour une même unité en pratique) sans supposer lequel
  est présent.
- **Vérifié end-to-end** (script hors-navigateur jetable, vrai GLTFLoader +
  SkeletonUtils + Quaternion, supprimé après usage) : les 8 canaux d'os se
  résolvent tous (aucun nom manquant), aucune valeur non-finie sur toute la
  durée de lecture (60 pas), retour au repos quasi exact en fin de clip
  (0,005° d'écart, bruit flottant), déplacement mesurable de la main à
  l'instant d'impact (0,21 unité). Build propre, démarrage du serveur de dev
  sans erreur.
- **Non vérifiable de mon côté au-delà de ça** : aucun accès visuel, donc
  impossible de confirmer le RESSENTI ("une belle courbe", "puissant et
  lisible") ni l'absence de déformation visuelle (le risque mathématique de
  dérive/désarticulation est écarté par la vérification ci-dessus, mais pas
  le risque purement esthétique/proportions) — à tester par Antoine avec un
  Fantassin bleu ET rouge, caméra de jeu normale, comme demandé.
- **Non fait dans cette V2** : synchronisation fine des dégâts sur l'instant
  d'impact visuel (le jeu applique déjà les dégâts instantanément au moment
  de l'événement de combat, comportement gameplay existant délibérément
  PRÉSERVÉ tel quel, conforme à la consigne d'Antoine de ne pas toucher
  l'architecture de combat pour l'animation) ; micro-flexion des jambes
  pendant l'attaque (mentionnée comme optionnelle par Antoine, écartée pour
  limiter la portée) ; effet de traînée visuelle sur la lame (explicitement
  "pas prioritaire" dans la demande).

## Baliste du joueur : cadence et vitesse augmentées (2026-08-12)

Antoine : "la flèche tirable par le joueur (baliste) est un peu molle,
augmente la vitesse de tir de base de 30% et la vitesse du projectile de
50%, tir rapide doit s'ajuster sur ces nouvelles statistiques."
`config/constants.ts` : `PLAYER_ARROW_COOLDOWN` (3 → 3/1.3 ≈ 2,31s, cadence =
1/cooldown donc +30% de cadence = cooldown÷1.3) et `PLAYER_ARROW_SPEED`
(9 → 13.5, ×1.5). Le talent "Tir rapide" (`effectivePlayerArrowCooldown`/
`effectivePlayerArrowSpeed`, main.ts) était déjà un multiplicateur RELATIF à
ces constantes (`cooldown / (1 + bonus)`, `speed * (1 + bonus)`) — aucun
changement de code necessaire pour qu'il s'ajuste automatiquement, exactement
la demande d'Antoine. Le verrou d'origine sur `PLAYER_ARROW_COOLDOWN`
("réservé à l'arbre de talents, ne pas baisser sans le redemander") est
explicitement levé par cette demande directe.

## Chantier système audio procédural + écran Paramètres (en cours, 2026-08-12)

Demande complète d'Antoine (~250 lignes) : un système audio procédural
(Web Audio API, pas de fichiers .wav/.mp3) avec bus Master/SFX/UI/Ambience/
Music, sound budget, spatialisation légère, variations par événement, ET un
écran Paramètres unique réutilisable depuis le menu principal ET le menu
pause (onglet "Son" : 3 curseurs + case Muet). Les deux demandes sont
arrivées dans la MÊME session, la seconde dépendant explicitement de la
première (les curseurs pilotent l'AudioManager) — traitées ensemble.

**Portée V1 livrée** (le catalogue COMPLET — Cavalier, Mage, vagues/
victoire/défaite, ambiance de vent/feuillage, pas de marche, sound budget
réellement testé en grosse bataille, volume selon la distance caméra — reste
à faire, voir plus bas) :

- **`src/audio/AudioManager.ts`** : graphe Master → Compressor →
  `ctx.destination`, avec Music/SFX/UI/Ambience en enfants de Master (voir
  commentaire de classe pour le mapping exact des 3 curseurs — Antoine a
  confirmé que "Effets sonores" pilote SFX+UI+Ambiance faute de curseurs
  dédiés pour l'instant, sans que les bus eux-mêmes soient fusionnés). UN
  SEUL `AudioContext`, créé uniquement dans `unlock()` (jamais recréé),
  appelé sur le premier `pointerdown`/`keydown` du document (main.ts) —
  jamais avant, restriction navigateur oblige. Toutes les transitions de
  gain passent par `setTargetAtTime` (~30ms, anti-clic numérique). Mute
  INDÉPENDANT des sliders (`effectiveMaster = muted ? 0 : masterVolume`),
  jamais un `masterVolume = 0`. Sound budget par catégorie
  (`CATEGORY_VOICE_BUDGET`, ex. 28 voix SFX simultanées max) — un son au-delà
  du budget de sa catégorie est simplement IGNORÉ (pas de file d'attente, pas
  de coupure d'une voix existante) ; budget libéré après une durée ESTIMÉE
  par son (pas de suivi précis par voix, jugé inutile pour des sons courts
  <1s). Catalogue enregistré par nom (`register`/`play`) — chaque son est une
  fonction qui construit son propre graphe de nœuds à l'appel, rien de
  précalculé hormis les buffers de bruit (voir plus bas).
- **`src/audio/synthesis.ts`** : primitives partagées (bruit blanc mis en
  CACHE par `(clé, durée)` — jamais régénéré à chaque lecture, demande
  explicite d'Antoine —, enveloppes de gain, glissandos de fréquence,
  filtres passe-bande/bas/haut, pan stéréo, `jitter()` pour la variation
  aléatoire ±X%).
- **`src/run/userSettings.ts`** : préférences persistées SÉPARÉMENT de
  `MetaProgress` (clé localStorage distincte, `arrow-tactics.user-settings.v1`)
  — décision de l'audit préalable, confirmée cohérente avec la demande
  explicite d'Antoine ("Effacer la sauvegarde" ne doit PAS effacer les
  préférences audio) : `resetMetaProgress` n'a jamais eu connaissance de ce
  fichier, aucun risque de collision.
- **`src/ui/screens.ts`** : nouvel écran `'settings'`, un seul point de
  construction reprise depuis le menu principal (`onOpenSettingsFromMenu`)
  ET la pause (`onOpenSettingsFromPause`) — PAS deux écrans dupliqués. Le
  contexte de retour (`settingsReturnTo: 'menu' | 'pause'`) est tracké côté
  main.ts (Screens elle-même reste dumb, ne connaît pas son "origine").
  Bouton "Paramètres" ajouté au menu principal EXACTEMENT entre "Éditeur de
  maps" et "Effacer la sauvegarde", et au menu pause entre "Continuer" et
  "Quitter" — ordre demandé à la lettre. Onglet unique "Son" fonctionnel
  (Antoine : "ne remplis pas artificiellement" Graphismes/Commandes/Jeu) —
  la structure d'onglets existe (réutilise `.shop-tabs`) pour en ajouter
  d'autres plus tard sans reconstruire l'écran.
  - **Curseurs** (`sliderControl`) : `<input type=range>` natif (souris/
    tactile "gratuits") entièrement redessiné en CSS
    (`::-webkit-slider-thumb`/`::-moz-range-thumb`, voir style.css) — accent
    bleu identique à `.talent-node--unlockable` (COLORS.playerZone) pour
    rester cohérent avec le reste de l'UI. Événement `'input'` (pas
    `'change'`) : application EN TEMPS RÉEL à chaque déplacement, sans
    bouton Appliquer, exactement la demande. Case "Muet" stylisée en CSS
    pur (`input:checked ~ .settings-checkbox-box`), jamais la case brute du
    navigateur.
  - **Échap** : nouveau branchement dans le routeur clavier — si l'écran
    Paramètres est ouvert (`screens.isSettingsOpen()`, nouvelle méthode),
    Échap le referme vers `settingsReturnTo` (menu OU pause) et RIEN
    D'AUTRE ; ce n'est que si Paramètres n'est PAS ouvert que la logique
    Pause existante (`pauseMenuOpen`) reprend la main — empêche exactement
    le piège identifié par Antoine ("Echap dans Settings ne doit jamais
    reprendre accidentellement le jeu"). `onCloseSettings` (bouton "Retour")
    fait le même routage. Aucun changement à `openPauseMenu`/
    `resumeFromPause` : Paramètres ne touche jamais `loop.timeScale` ni
    `pauseMenuOpen`, la partie reste intacte en dessous (testé par lecture
    de code : aucun site n'écrit dans l'état de bataille/placement en
    ouvrant/fermant Paramètres).
  - **Sons UI** : `Screens` reçoit un second paramètre constructeur
    `uiSound: {click, hover}` (callbacks fournis par main.ts vers
    `audio.play('ui.click'|'ui.hover')`) — branché UNE FOIS dans `button()`/
    `shopItemButton()` (les deux fabriques déjà partagées par tous les
    écrans, voir l'audit initial), donc CHAQUE bouton du jeu (menu, pause,
    boutique, talents, confirmations...) a déjà le clic/survol sans site
    d'appel individuel à modifier.
- **Sons concrets branchés** (catalogue volontairement limité pour cette
  V1 — voir portée restante) : `ui.hover/click/confirm/back/error`,
  `placement.select/place/invalid/rotate/remove/readyForBattle` (CONSTRUITS
  dans `sounds/placementSounds.ts` mais PAS ENCORE appelés depuis main.ts
  sauf indirectement — voir portée restante, seuls les sons UI génériques et
  combat/économie sont réellement déclenchés pour l'instant),
  `economy.purchase/insufficientGold` (branché sur les 4 handlers d'achat),
  `combat.swordSwing/swordHit/shieldHit` (Fantassin), `combat.bowShot/
  arrowHit/arrowFlight` (Archer, bowShot déclenché au LÂCHER réel de la
  corde — même point que le départ visuel de la flèche, voir
  `pendingArrowSpawns`), `combat.unitDeath` (générique, DEUX camps, détection
  par transition comme `rewardedEnemyDeaths` mais Set séparé
  `deathSoundPlayed`). Pan stéréo (`panFor(x,z)`, réutilise `worldToScreen`)
  appliqué à tous les sons de combat — pas de volume selon la distance
  caméra pour cette V1 (voir portée restante).
- **Vérifié** : build propre (`tsc`/`vite build`), démarrage du serveur de
  dev sans erreur. **Non vérifiable de mon côté, à un degré inhabituel même
  pour ce projet** : Node n'a AUCUN équivalent de Web Audio API (pas
  d'`AudioContext` sans polyfill lourd), donc contrairement à TOUT le reste
  de ce projet (bones, quaternions, trajectoires...), je n'ai PAS pu
  vérifier numériquement/headless le moindre son généré — ni son timbre, ni
  son volume relatif, ni l'absence de clipping. Le code compile et suit des
  recettes de synthèse standard (enveloppes, filtres, sweeps), mais c'est la
  première fois dans ce projet où la seule vérification possible est la
  lecture de code, sans même un filet numérique de secours. À tester
  intégralement par Antoine.
- **Reste À FAIRE (explicitement différé, pas oublié)** : catalogue Cavalier
  (sabots, Charge), Mage (cast/lancement/vol/impact de Boule de feu), sons
  de vague (début/victoire/défaite avec cor synthétique/accords), ambiance
  (vent de forêt, feuillage), pas de marche par unité, appel réel des sons
  de placement déjà CONSTRUITS (select/place/invalid/rotate/remove/
  readyForBattle — la boutique/le placement ne les déclenchent pas encore
  depuis main.ts), volume dégressif selon la distance caméra, agrégation de
  N événements simultanés en un seul son, test réel à grande échelle (10
  Fantassins/6 Archers/3 Cavaliers/2 Mages demandé par Antoine — impossible
  sans navigateur de mon côté), réglage fin du mix (aucun des volumes
  relatifs entre catégories de sons n'a été testé à l'oreille). Le moteur
  (bus, budget, cache de buffers, catalogue par nom) est conçu pour que
  chaque ajout futur soit un nouveau fichier dans `audio/sounds/`, jamais une
  modification d'architecture.

## Sons de gameplay retirés, correctif du coup d'épée des ennemis (2026-08-13)

Deux retours d'Antoine dans le même message.

**Bug corrigé : les Fantassins ROUGE tournaient le dos pendant l'attaque.**
Diagnostic confirmé par vérification headless (vrai `THREE.Object3D`
hiérarchie complète root/facingFix/clone, script jetable) : `ProceduralAttackAnimator`
(voir plus haut, coup d'épée V2) capturait le quaternion de repos de chaque
os en espace MONDE ABSOLU, à la CONSTRUCTION — un instant où
`UnitViews.sync()` n'avait encore jamais tourné, donc `root.rotation.y`
valait encore sa valeur JavaScript par défaut (0), quel que soit le camp.
Ça fonctionnait par pure coïncidence pour le joueur (dont l'orientation par
défaut EST 0, `UnitViews.computeFacing`) mais pas pour l'ennemi (orientation
par défaut = π, appliquée seulement PAR LA SUITE, jamais présente au moment
de la construction) : la cible "monde absolu" du bras restait figée sur
l'orientation du tout début, ignorant la vraie rotation de facing de l'unité
— le bras swingait dans un repère qui ne tournait jamais avec elle, d'où un
ennemi qui semble frapper "à l'envers". Corrigé en capturant le repos
RELATIF à `scene` (le clone du modèle, jamais muté par ce système lui-même)
plutôt qu'en absolu, et en recomposant chaque frame avec l'orientation
MONDE ACTUELLE de `scene` (qui, elle, absorbe correctement la rotation de
facing courante, quel que soit le camp) — voir le commentaire de classe de
`proceduralAttackAnimator.ts` pour le détail. **Vérifié headless** : un même
test d'attaque simulé sur un rig "joueur" (root.rotation.y=0) et un rig
"ennemi" (root.rotation.y=π) donne désormais une position de main
STRICTEMENT IDENTIQUE une fois ramenée dans le repère du personnage
(différence 0.000000) — avant le correctif, ce test aurait divergé. La
marche (AnimationClip baked, `Walking`) n'avait PAS ce bug : ses valeurs
sont figées à l'authoring, sur le PROTOTYPE brut, avant tout `facingFix`/
`root` — un mécanisme entièrement différent, jamais concerné.

**Tous les sons de GAMEPLAY retirés** ("cela ne rend pas bien du tout") —
`combat.swordSwing/swordHit/shieldHit/bowShot/arrowHit/unitDeath` et
`economy.purchase/insufficientGold` ne sont plus DÉCLENCHÉS depuis main.ts
(les 3 appels dans la boucle de combat, celui à la résolution de
`pendingArrowSpawns`, la boucle de détection de mort `deathSoundPlayed`
entièrement retirée avec son Set de suivi, et les branches son des 4
handlers d'achat). **Conservés explicitement** ("laisse cependant ceux qui
se trouve sur les différents bouton des menus") : `ui.click`/`ui.hover`,
toujours déclenchés par `Screens.button()`/`shopItemButton()` — donc CHAQUE
bouton du jeu (menu, pause, boutique, talents, Paramètres, confirmations)
garde son retour sonore, y compris les boutons d'achat (qui déclenchaient
déjà `ui.click` via `shopItemButton`, indépendamment du son `economy.purchase`
maintenant retiré). Le code des sons retirés (`audio/sounds/combatSounds.ts`,
la majeure partie de `placementSounds.ts`) N'A PAS été supprimé — juste
DÉ-BRANCHÉ (plus aucun site d'appel) : reste disponible tel quel si Antoine
veut reprendre le sound design plus tard sans repartir de zéro. `panFor()`
(pan stéréo, main.ts) devenu sans utilité a été retiré (n'avait plus aucun
appelant). Build propre, démarrage du serveur de dev sans erreur.

**Retour d'Antoine sur le clic UI retravaillé** ("pas fou"/"décevant" —
traînait sur 90ms avec un seul ton grave) : refait en deux couches courtes
(`ui/sounds/uiSounds.ts`, `ui.click`) — un bref transient de bruit passe-haut
(le "snap") + un pop tonal qui chute vite de 720Hz à 300Hz (le "corps"),
durée totale ~55ms au lieu de 100ms. **Immédiatement après, dans le message
suivant, Antoine a tranché plus largement** : "retire tout les sons pour
l'instant, retour en arrière, ça ne rend pas bien, retirer tout ce qu'on a
fait niveau son, on verra plus tard."

## Système audio entièrement désactivé (2026-08-13, même journée)

Rollback complet du chantier audio (moteur, catalogue, sons UI compris —
plus large que le retrait précédent, qui gardait les clics de menu). Même
philosophie que le retrait des sons de gameplay : DÉBRANCHER, ne PAS
supprimer le code, pour pouvoir reprendre sans repartir de zéro le jour où
Antoine revient dessus.

- `main.ts` : les deux écouteurs `unlock()` (`pointerdown`/`keydown`)
  retirés — plus aucun `AudioContext` n'est jamais créé. `AudioManager.play()`
  reste un no-op garanti (`if (!this.ctx) return;`) quel que soit
  l'appelant, donc même `Screens`' `uiSound.click/hover` (qui appellent
  encore `audio.play('ui.click'|'ui.hover')`) restent inoffensifs SANS
  modification — un seul endroit à changer (restaurer les deux écouteurs
  `unlock()`) suffira à tout reconnecter d'un coup plus tard.
- L'écran Paramètres (onglet Son) reste construit et accessible tel quel :
  ses curseurs continuent d'écrire dans `AudioSettings`/`localStorage` (sans
  effet audible tant qu'aucun `AudioContext` n'existe) — pas désactivé ni
  masqué, sur le principe que ça ne casse rien de fonctionnellement visible
  et que le retirer aurait été un pas de plus vers une suppression complète,
  non demandée explicitement.
- Build propre, démarrage du serveur de dev sans erreur.

  bataille → écran de fin de vague (victoire/défaite) → **vraie boutique** (or
  affiché, achats Fantassin/Archer/Parchemin de soin) → nouvelle phase de
  placement (même run, armée persistante). Arbre de talents accessible depuis
  le menu — affiche désormais le total de points de talent sauvegardés (voir
  chantier sauvegarde ci-dessous), mais aucun nœud à débloquer pour l'instant.
  Échap pendant une bataille en cours ouvre un menu pause (Continuer /
  Quitter) ; Quitter revient au menu principal — la run en cours (or, armée,
  inventaire) est abandonnée SANS rien sauvegarder, contrairement à une
  défaite totale (voir ci-dessous) : c'est la nuance volontaire entre
  "abandonner" et "terminer" une run.
- **Caméra** : clavier + souris (clic droit/molette), défaut 55°/40°/22.

## Chantier optimisation — reprise (2026-08-13)

Antoine relance le chantier perf évoqué précédemment. Audit préalable
(agent Explore, lecture de code réel, pas les anciennes notes) : bonne
nouvelle inattendue — le passage aux modèles riggés (Fantassin/Archer/Mage)
n'a PAS aggravé le nombre d'appels de rendu (1 `SkinnedMesh`/unité contre
~17-34 boîtes avant), donc ce n'est plus le problème principal pressenti à
l'époque de l'objectif "300 unités". Trois correctifs ciblés, petits et
vérifiés, faits dans cette passe :

1. **`sim/world.ts`** : `World.getById(id)` (Map interne `entityById`,
   alimentée UNIQUEMENT à `spawn()` — les entités ne sont jamais retirées de
   `entities`, donc pas de reconstruction par tick nécessaire) remplace les
   deux `world.entities.find(e => e.id === x)` linéaires de la boucle
   d'événements de combat (`main.ts`). Coût croissant avec le nombre
   d'événements de combat simultanés sur les grosses vagues.
2. **`render/proceduralAttackAnimator.ts`** : quaternions "scratch"
   réutilisés (5 champs privés) au lieu d'environ 35 `new THREE.Quaternion()`
   par Fantassin attaquant par frame. Vérifié en isolation (script
   hors-navigateur) que la séquence mathématique est identique (écart
   ~2e-6°, bruit flottant pur) — mais une fois intégrée dans la hiérarchie
   complète du squelette, un écart mesurable (~0.05-0.1°, jamais croissant/
   non borné sur toute la durée d'une attaque) subsiste, cause exacte non
   isolée malgré plusieurs scripts de diagnostic (probablement un ordre
   d'opérations flottantes différent entre `premultiply` en place et
   `multiply`/`clone` sur objets frais). **Décision assumée** : gardé tel
   quel — l'ordre de grandeur est trop petit pour être perceptible à la
   caméra isométrique de ce jeu, et renoncer au gain (35 allocations/frame en
   moins, uniquement pendant les ~0.72s d'une attaque) pour un écart invisible
   n'apportait rien. Signalé explicitement à Antoine plutôt que masqué. Une
   deuxième optimisation (mise à jour ciblée non-récursive de `matrixWorld`
   au lieu de `updateMatrixWorld(true)` par canal) a été ESSAYÉE PUIS
   ABANDONNÉE : la hiérarchie réelle contient des os intermédiaires non
   listés dans la config (chaîne de colonne entre le bassin et le torse) que
   la version récursive rafraîchissait "gratuitement" et que la version
   ciblée laissait périmés — gardé la version récursive, vérifiée correcte.
3. **`sim/geometry.ts`** : `getShrunkObstacleBoundsList(obstacles)`, mise en
   cache par référence de tableau (même motif que `getObstacleBoundsList`,
   correctif du 2026-08-10) — `movementSystem.findSteeringPoint` recalculait
   un objet "bornes rétrécies" par PAIRE (coin candidat × obstacle du
   plateau) à CHAQUE appel : avec ~20 coins candidats et ~100 obstacles sur
   la carte "vague1-20", jusqu'à 2000 objets éphémères par appel, pour un
   calcul entièrement indépendant de l'entité/de la cible. `VISIBILITY_MARGIN`
   déplacée de `movementSystem.ts` vers `geometry.ts` (doit vivre à côté du
   cache qui en dépend).

Build propre après chaque étape, démarrage du serveur de dev sans erreur.
**Non testé en jeu réel à grande vague** (aucun accès navigateur de mon
côté) — les trois correctifs réduisent des allocations/recherches déjà
identifiées comme problématiques par le passé, mais seul un vrai test à la
vague 6-7+ confirmera un gain de FPS perceptible.

**Panneau de debug allégé, pause à l'espace retirée** — FAIT (2026-08-10,
demande d'Antoine). `ui/debug.ts`, le panneau `.debug-help` (liste de
raccourcis en bas de l'écran) n'affiche plus que "X — Vitesse fois 2" — toute
la liste caméra + "Espace — pause" retirée, jugée trop chargée pour un
panneau qui reste de toute façon temporaire (voir son commentaire de classe).
Le raccourci Espace lui-même (`main.ts`, togglait `loop.timeScale` entre 0 et
1) est supprimé : il faisait doublon avec le vrai menu pause (Échap,
Continuer/Quitter) sans jamais afficher le moindre menu, ce qu'Antoine a jugé
sans intérêt ("ça n'a pas vraiment de sens"). Le panneau de stats
(`.debug-panel`, fps/tick/graine/etc. en haut à gauche) n'est pas concerné,
pas mentionné dans la demande.

**Glisser-déplacer en phase de placement, avec aperçu bleu** — FAIT
(2026-08-10, demande d'Antoine). En plus du déplacement au clic (sélection
puis clic sur une case) déjà existant, une unité peut maintenant être
attrapée (clic maintenu) et glissée directement jusqu'à sa nouvelle case,
avec un cadre bleu (`render/placementHighlight.ts`, `PlacementHighlight`,
couleur `COLORS.playerZone` déjà utilisée pour "case du joueur" ailleurs)
qui suit le curseur pendant le glisser pour prévenir où l'unité atterrira —
"le tour de la case s'illumine en bleu", demande explicite. Réutilise et
étend le geste de glisser-vendre déjà en place (`main.ts`, `UnitDragState`) :
`isPointOver(sellZone)` reste vérifié en premier (déposer sur "Vendre" vend
toujours l'unité), sinon la case survolée (`computeHoveredTile`, nouvelle
fonction partagée avec les anciens handlers au clic) est validée
(`isValidPlacementTile`) et devient la nouvelle position si le dépôt y tombe
— sinon l'unité reste où elle était (même tolérance que l'échec du
déplacement au clic). **Même mécanique pour un GROUPE déjà sélectionné** :
`UnitDragState.groupIndices` (non-null si l'unité attrapée fait partie du
groupe en cours) fait glisser TOUT le groupe d'un bloc, avec un cadre par
membre prévisualisant sa destination — affichés seulement si le déplacement
ENTIER est valide (même tout-ou-rien que `handleGroupMoveClick`, extrait en
`computeGroupPreview` partagé entre le clic et le glisser). Aucune vente
proposée pour un glisser de groupe (pas demandé) ; un dépôt qui n'aboutit à
rien de valide désélectionne quand même le groupe, comme au clic.

**Bouton "Boutique" qui bascule ouvrir/fermer** — FAIT (2026-08-10, demande
d'Antoine : "on doit cliquer sur Boutique pour entrer, mais appuyer sur
Continuer dans un autre encart pour sortir, je voudrais pouvoir continuer à
appuyer sur Boutique pour sortir rapidement"). `Screens.isShopOpen()`
(nouveau) + `main.ts`, `openShopFromPlacement()` referme la boutique au lieu
de la rouvrir si elle est déjà affichée. Nécessitait aussi de remonter
`ui/style.css`, `.sell-zone-container` AU-DESSUS de `.screen-overlay`
(z-index 15 contre 10) : un enfant ne peut jamais dépasser le z-index de son
PARENT vis-à-vis d'un frère de ce parent (règle de contexte d'empilement
CSS), donc le bouton restait invisible/non-cliquable une fois la boutique
ouverte par-dessus tant que le CONTENEUR entier n'était pas remonté — sans
conséquence sur "Vendre" (le fond de la boutique couvre toujours le canvas,
impossible d'y démarrer un glisser d'unité pendant qu'elle est ouverte).

**Bouton "Effacer la sauvegarde" au menu principal** — FAIT (2026-08-10,
demande d'Antoine, avec garde-fou explicite : "mets quand même une sécurité
pour être sûr que la personne veut bien supprimer sa sauvegarde"). Nouvel
écran `resetConfirm` (`ui/screens.ts`) affiché AVANT toute suppression
réelle — "Annuler" (retour au menu, rien n'est touché) ou "Oui, tout
effacer" (`run/metaProgress.ts`, `resetMetaProgress()` : remet
`talentPoints`/`unlockedTalents` à zéro ET sauvegarde immédiatement). Jamais
de `window.confirm()` natif : casserait la règle du projet "tout en
HTML/CSS par-dessus le canvas". Ne touche que la progression PERMANENTE, pas
`currentRun` (déjà non-persistée entre sessions, voir chantier sauvegarde).

**Image de fond en test derrière la scène 3D** — FAIT (2026-08-10, demande
d'Antoine, image fournie par ses soins, copiée dans
`public/textures/sky_background.png`). `render/renderer.ts`,
`Renderer.scene.background` charge maintenant cette image via
`THREE.TextureLoader` (couleur unie `COLORS.sky` gardée comme repli immédiat
le temps du chargement réseau) — première exception "arrière-plan" à la
règle "aucun asset graphique" du projet (déjà fait pour rochers/arbres/
baliste, jamais pour un élément aussi visible que le ciel). **Limite
connue, à confirmer visuellement par Antoine** : ceci est une image plaquée
en fond, pas un vrai skybox — elle reste FIXE à l'écran quelle que soit la
rotation de la caméra (yaw/pitch, pourtant pilotable au clavier/souris dans
ce jeu), elle ne "tourne" pas avec le plateau. Suffisant comme premier test
visuel ("en test", ses mots), pas forcément le bon choix définitif si la
caméra pivote souvent en jeu réel — à rediscuter selon son retour.

**Séquencement de la fin de vague** — FAIT (2026-08-09, demande d'Antoine :
"c'est trop brusque, la boutique apparaît instantanément, il faudrait
séquencer proprement les différentes phases de gameplay"). Avant ce
correctif, la victoire/défaite déclenchait dans le MÊME instant : figer la
simulation, vider tout le champ de bataille, afficher l'écran de fin de
vague — un cut instantané. `ui/waveTransition.ts` (`WaveTransition.play`)
séquence maintenant ça en ~2 secondes, choisi par Antoine parmi 3 options
proposées : (1) une bannière "Victoire !"/"Défaite" apparaît en fondu
PAR-DESSUS le champ de bataille encore visible (figé, mais pas vidé — le
joueur voit un instant ses survivants), tient un instant
(`WAVE_TRANSITION_HOLD_MS`) ; (2) un rideau noir plein écran se ferme en
fondu (`WAVE_TRANSITION_CURTAIN_FADE_MS`) par-dessus la bannière (z-index
supérieur) ; (3) c'est exactement AU MOMENT où l'écran est plein noir
(callback `onBlackout`) qu'on fait tout ce qui était avant instantané et
visible — `applyBattleOutcome`, `world.clear()`/`unitViews.clear()`/etc.,
puis `showGameOver()`/`showWaveComplete()` — invisible pour le joueur ; (4) le
rideau se rouvre pour révéler l'écran. Timings en millisecondes, temps réel
(la simulation reste figée via `loop.timeScale = 0` pendant toute la
séquence, comme avant) — voir `config/constants.ts`. Même traitement pour la
victoire ET la défaite totale (écran "Partie terminée"), confirmé
explicitement par Antoine plutôt que de garder une bascule brutale
asymétrique pour l'un des deux cas. **Effet de bord positif, généralisé à
TOUS les écrans** : `Screens.show()`/`hideAll()` togglaient avant
`display: none`/`flex` (propriété non transitionnable en CSS) — passés à une
classe `.screen-overlay--visible` (opacité + `pointer-events`), donc menu,
boutique, pause, etc. font désormais tous un léger fondu (~220ms) au lieu
d'apparaître d'un coup, y compris le clic sur "Continuer" qui ouvrait la
boutique instantanément — adresse la remarque d'Antoine sur le séquencement
sans code dédié supplémentaire.

**Prochaine étape** : chantier "game feel" démarré le 2026-08-09 — flash
d'impact validé, recul cosmétique essayé puis retiré (voir Combat ci-dessus).
Candidat suivant identifié mais pas encore
choisi pour le game feel : chiffres de dégâts flottants — risque à
surveiller : le miss/soin n'apparaît qu'occasionnellement, un hit est
beaucoup plus fréquent, pourrait vite faire du bruit visuel plutôt que de la
lisibilité (à juger sur pièce si/quand demandé). Restent aussi, non
priorisés : arbre de talents (encore un stub, plus structurant — implique la
couche de stats prévue dans l'architecture mais jamais commencée), mode
survie / vagues successives (mentionné par Antoine, pas encore spécifié — à
clarifier avant tout code, la boucle actuelle enchaîne déjà les vagues run
après run).

## Boutique d'amélioration permanente des unités (2026-08-13)

Nouveau système de PROGRESSION PERMANENTE, demande complète d'Antoine (~45
points) : une boutique accessible depuis le MENU TITRE, sous "Arbre de
talents", où le joueur dépense une monnaie permanente ("Runes
d'amélioration") pour augmenter PV/attaque des unités du JOUEUR entre les
runs — explicitement DISTINCT de la boutique de run, de l'arbre de talents
et des stats de base des ennemis.

**Audit préalable (résumé)** : les stats effectives d'une unité JOUEUR se
construisaient déjà via un pipeline "base -> patch" existant
(`World.spawn(..., statOverrides?)`, déjà utilisé par le talent "Réflexes de
vétéran") — réutilisé tel quel plutôt que réinventé. Seule lacune : aucun
mécanisme équivalent n'existait pour patcher le damage d'une CAPACITÉ
(`AbilityDef.damage`, lu directement sur `UnitDef.abilities` statique, jamais
sur l'entité) — nécessaire pour que le bonus d'attaque du Mage vise sa Boule
de feu et non son "Coup de bâton" de repli, comme demandé explicitement
(point 15 : "ne modifie pas aveuglément toutes les sources de dégâts").

- **`data/unitUpgrades.ts`** (nouveau, pur comme units.ts/talents.ts) :
  `UnitUpgradeDef` par unité — `baseRuneCost`, `costMultiplier`, `hpPerLevel`,
  `attackEveryLevels`, `goldCostPerAttackUpgrade`, et
  `primaryDamageTarget: 'stats' | 'ability'` (nouveau concept centralisant
  "où va le bonus d'attaque" — `'stats'` patch `UnitStats.damage`
  (Fantassin/Archer, attaque classique), `'ability'` patch un bonus
  générique séparé (Mage/Boule de feu)). `UNIT_UPGRADES` : Fantassin/Archer/
  Mage, **valeurs IDENTIQUES pour les 3** (baseRuneCost 1, costMultiplier 2,
  hpPerLevel 1, attackEveryLevels 3, goldCostPerAttackUpgrade 1), conforme à
  la demande explicite. `listUpgradableUnitIds()` pilote l'UI générique (voir
  plus bas) — aucun id codé en dur au-delà de ce fichier de données,
  Cavalier/Chevalier/Baliste pourront s'ajouter sans toucher au moteur.
  `nextUnitUpgradeCost(def, level) = baseRuneCost * costMultiplier^level`
  vit ici (pas dans run/unitUpgradeEffects.ts) pour éviter un import
  circulaire avec run/metaProgress.ts, qui en a besoin aussi.
- **`run/unitUpgradeEffects.ts`** (nouveau, mirroir de talentEffects.ts) :
  toutes les formules dérivées du seul `upgradeLevel` stocké (point 9 de la
  demande — "évite de stocker séparément hpBonus/attackBonus") :
  `upgradeHpBonusDisplay`, `upgradeAttackBonusDisplay = floor(level/3)`,
  `upgradeRemainingUntilAttackBonus = attackEveryLevels - (level %
  attackEveryLevels)` (couvre nativement le cas `level % 3 === 0 -> 3`, pas
  besoin d'un cas particulier), `upgradeNextPurchaseGrantsAttackBonus`,
  `effectivePlayerUnitCost = baseCost + attackBonus * goldCostPerAttackUpgrade`
  (ne mute JAMAIS `UnitDef.cost`, une valeur fraîche à chaque appel).
  `computePlayerUnitUpgradeEffects(unitId, progress)` calcule TOUT ce dont
  main.ts a besoin pour un spawn joueur : `statOverrides` (toujours
  `maxHp` = base+bonus interne x10 ; `damage` en PLUS si
  `primaryDamageTarget === 'stats'`) et `abilityDamageBonus` (non nul
  UNIQUEMENT si `'ability'`) — jamais de mutation sur `UNITS`/`UnitDef`
  globaux (point 21 de la demande), tout est un objet frais retourné.
- **`sim/entity.ts`/`sim/world.ts`** : `Entity.abilityDamageBonus: number`
  (nouveau, 0 par défaut) — même principe que `stats` (pipeline "base ->
  talents -> achats -> buffs"), la sim ne sait pas D'OÙ vient ce nombre.
  `World.spawn()` gagne un 7ᵉ paramètre optionnel `abilityDamageBonus = 0`.
  `sim/systems/abilities.ts` : `tryTriggerAreaBlast` (Boule de feu) ET
  `tryTriggerCharge` (Charge, généricité/futur Chevalier lourd — aucune unité
  actuelle ne cumule Charge + amélioration) ajoutent
  `+ e.abilityDamageBonus` au `damage` copié dans `CastState`/`DashState` au
  déclenchement.
- **`run/metaProgress.ts`** étendu : `MetaProgress.upgradeRunes`/
  `unitUpgrades: Record<string, {level: number}>` — section explicitement
  séparée des talents (commentaire dédié, point 34 : "ne mélange pas leurs
  données"), lue/écrite défensivement comme le reste (`unitUpgradesRecord`,
  chaque entrée validée individuellement). `resetMetaProgress` ("Effacer la
  sauvegarde") remet aussi runes/niveaux à zéro (point 33) ;
  `resetTalentPoints` (respec des talents) N'Y TOUCHE PAS (vérifié
  headless). `RUNES_PER_WAVE_WIN = 10`, `awardUpgradeRunesForWaveWin`,
  `getUnitUpgradeLevel`/`canPurchaseUnitUpgrade`/`purchaseUnitUpgrade`
  (achat : vérifie le coût, retire les runes, incrémente le level, ne
  sauvegarde pas elle-même — comme `unlockTalent`).
- **`main.ts`** : `playerStatOverrides(unitId)` fusionne désormais DEUX
  sources (talents + boutique d'amélioration) au lieu d'une seule ; nouvelle
  `playerAbilityDamageBonus(unitId)`. Branchées aux DEUX (et SEULEMENT les
  deux) sites qui spawnent des unités JOUEUR (`setupTestBattle`,
  `onValidatePlacement`) — les spawns ENNEMIS (`world.spawn(id, 'enemy',
  ...)`, 2 sites) ne passent toujours AUCUN override, vérifié par grep avant
  et après (point 20/21 de la demande). `onBuyFantassin`/`onBuyArcher`/
  `onBuyMage` utilisent désormais `effectivePlayerUnitCost` (au lieu de
  `getUnit(id).cost`) ET le `hp` de départ de l'`OwnedUnit` lit le maxHp
  EFFECTIF (bug évité : sans ça, une unité tout juste achetée aurait eu plus
  de PV MAX que de PV actuels, un écart illogique pour une unité jamais
  blessée). **+10 runes par vague RÉELLEMENT GAGNÉE** (point 4) : gate sur
  `outcome.won` (renvoyé par `applyBattleOutcome`), dans le MÊME callback
  `waveTransition.play(...)` déjà utilisé pour `WAVE_CLEAR_BONUS`/
  `registerWaveReached` — ce callback ne s'exécute qu'UNE SEULE FOIS par
  bataille résolue (gardé par `battleOver`, jamais rejoué au reload puisque
  aucune run en cours ne persiste), donc pas de mécanisme de garde
  supplémentaire nécessaire pour éviter une double récompense (point 5).
  Sauvegarde immédiate si des runes ont été gagnées. `runesEarnedThisBattle`
  passé à `screens.showWaveComplete` pour le petit feedback (0 sur une
  défaite, jamais affiché "+0"). Corrigé au passage : deux lignes
  `telegraphView.clear()`/`fireballView.clear()` dupliquées par erreur lors
  d'une session précédente (sans effet néfaste, juste redondant) retirées.
- **`ui/screens.ts`** : bouton "Boutique d'amélioration" au menu, placé
  directement sous "Arbre de talents" comme demandé. Nouvel écran
  `unitUpgradeShop` : une carte GÉNÉRIQUE par unité de
  `listUpgradableUnitIds()` (`buildUnitUpgradeCard`, aucun id codé en dur
  dans la boucle) affichant niveau, PV/ATK bonus, coût en partie, prochaine
  amélioration (avec palier ATK mis en évidence si le PROCHAIN achat le
  déclenche, point 27), "prochain bonus ATK dans N", coût en runes, bouton
  "Améliorer" (désactivé si runes insuffisantes). `refreshShop`/`showShop`
  gagnent un paramètre `progress: MetaProgress` (4 sites d'appel dans
  main.ts mis à jour) : le PRIX AFFICHÉ des 3 boutons d'unité de la boutique
  de RUN n'est plus figé à la construction (`shopItemButton` accepte
  désormais un `unitId` optionnel, enregistre son élément de prix dans
  `shopUnitPriceEls` pour réécriture) — sans ça, un palier d'attaque acheté
  en boutique d'amélioration n'aurait jamais été reflété dans le prix
  affiché en boutique de run, malgré un prix réellement facturé correct.
- **`ui/pixelIcon.ts`** : `createRuneIcon` — même technique que
  `createCoinIcon` (grille de pixels, contour net) mais un LOSANGE (distance
  de Manhattan, pas euclidienne) violet plutôt qu'un cercle doré, pour se
  distinguer nettement de l'or à l'écran, avec un glyphe anguleux tracé à la
  main (une rune ne se déduit pas d'une formule).
- Vérifié en headless (script temporaire avec `tsx`, important : import des
  VRAIS modules TS, pas une réimplémentation — première fois dans ce projet
  qu'un outil `tsx` est utilisé pour ça plutôt qu'une reconstruction fidèle
  en `.mjs`) : séquence de coûts exacte 1-2-4-8-16-32-64, formules PV/ATK/
  coût Gold à plusieurs niveaux, refus d'achat si runes insuffisantes,
  séquence complète de gain de runes par vague (point 39, valeurs exactes),
  les 3 exemples chiffrés de la demande (Fantassin niveau 3, Archer niveau
  6, Mage niveau 3 — coïncidence vérifiée : les coûts de base RÉELS du jeu
  (2/3/8) sont EXACTEMENT ceux des exemples hypothétiques d'Antoine, donc
  ces vérifications correspondent aux vrais chiffres du jeu), **test
  CRITIQUE joueur vs ennemi via le VRAI `World`** (Fantassin joueur niveau 6
  → maxHp/damage patchés, Fantassin ennemi identique → stats de base
  STRICTEMENT inchangées), **test bout en bout du Mage via le VRAI système
  de capacités** (Boule de feu d'un Mage joueur niveau 3 inflige réellement
  40+10=50 à une cible simulée ; Boule de feu d'un Mage ennemi inflige
  toujours 40), `resetMetaProgress` remet bien runes/niveaux à zéro,
  `resetTalentPoints` ne les touche PAS, persistance après un "reload"
  simulé (relecture depuis le même localStorage mocké), pas de dépassement
  de `Number.MAX_SAFE_INTEGER` à un niveau de coût élevé mais réaliste.
  46/46 vérifications passées. Build propre.
- **Non vérifiable de mon côté** : rendu visuel réel de l'écran (mise en
  page des cartes, lisibilité de l'icône de rune violette, comportement du
  bouton "Boutique d'amélioration" au menu) — aucun accès au navigateur, à
  confirmer par Antoine.
- **Pas de bouton "+1000 runes" de debug ajouté** (point 37 de la demande,
  qui l'autorisait explicitement à titre temporaire) : jugé inutile, la
  vérification headless ci-dessus couvre déjà l'intégralité des formules et
  de l'isolation joueur/ennemi sans qu'un bouton cheat traîne en production.

## Correctif : les archers semblaient rater presque toujours leur cible (2026-08-13)

Antoine : "les archers tirent très mal leur attaque, atteignent rarement leur
cible." Diagnostic (lecture de code, pas d'accès visuel) : les DÉGÂTS sont
bien résolus instantanément par `combatSystem` comme toujours — ce n'était
donc jamais un vrai problème de taux de raté (`missChance` archer = 0.07,
très bas). Le coupable est purement VISUEL, introduit par le travail récent
de calibrage du projectile sur l'animation ("Correctifs des 3 unités
riggées... projectile calibré sur l'animation") : `main.ts`,
`pendingArrowSpawns` retarde le départ COSMÉTIQUE de la flèche de
`ARCHER_ATTACK_RELEASE_FRACTION * attackCooldown` (jusqu'à ~1,2s à l'ancienne
cadence de 2,0s) pour le caler sur le clip riggé — mais visait un point
`targetX/targetZ` CAPTURÉ au moment de la résolution du combat (instantanée),
jamais réactualisé. Sur un délai d'1,2s+ vol, largement le temps pour la
cible de dériver (force de séparation entre corps, foule qui se bouscule) ou,
sur un coup fatal, de mourir et disparaître ENTIÈREMENT (chute + fondu,
`DEATH_FALL_DURATION` + `DEATH_FADE_DURATION` = 0,65s, plus court que le
délai lui-même) — la flèche volait donc systématiquement vers une position
périmée, donnant l'impression d'un raté quasi systématique alors que le
combat avait déjà été résolu correctement (le flash d'impact, lui, apparaît
toujours INSTANTANÉMENT au moment du tir, pas à l'atterrissage cosmétique —
décalage déjà accepté par le passé, voir plus bas dans "Où on en est", mais
qui devenait beaucoup plus visible avec ce nouveau délai de 1,2s).

- `PendingArrowSpawn` gagne `targetId: number | null` (`null` UNIQUEMENT sur
  un tir BLOQUÉ — le point visé est alors un point d'impact fixe sur
  l'obstacle, jamais une entité à suivre ; sinon l'id de la cible réelle du
  combat). `targetX/targetZ` (capturés à la résolution du combat) restent en
  repli si `targetId` est `null`, mais ne sont PLUS utilisés directement pour
  une cible vivante ou récemment morte.
- Au moment où la flèche part VRAIMENT (le `pending.elapsed >= pending.delay`
  déjà existant, dans la boucle de rendu) : `world.getById(pending.targetId)`
  relit la position ACTUELLE de la cible (une entité n'est jamais retirée de
  `World.entities`, morte ou vivante — sa position reste donc valide même
  figée après la mort) et vise CE point plutôt que le point périmé. Sans
  effet sur un tir bloqué (`targetId` null, retombe sur `targetX/targetZ`
  comme avant).
- Limite honnête restante, pas corrigée ici : sur un coup FATAL, la cible
  peut avoir complètement disparu (fondu terminé, 0,65s) avant même que la
  flèche ne parte (jusqu'à 1,2s) — dans ce cas précis, viser sa dernière
  position réelle (comme fait maintenant) est la meilleure information
  disponible, mais rien n'est plus visible à cet endroit pour "confirmer" le
  coup à l'œil. Non traité : jugé secondaire par rapport au vrai bug (flèches
  visant des positions périmées sur la majorité des tirs, mortels ou non),
  à revisiter seulement si Antoine signale encore un souci après ce
  correctif.
- Build propre. **Non vérifiable de mon côté** (aucun accès visuel/navigateur)
  — le raisonnement s'appuie sur une lecture directe et complète de la
  chaîne "résolution du combat -> délai cosmétique -> vol du projectile",
  sans mesure en jeu réel ; à confirmer par Antoine que les flèches
  connectent visiblement mieux maintenant.

## Correctifs boutique d'amélioration : barre de PV et "je commence à 5/9" (2026-08-13)

Deux retours d'Antoine sur la boutique d'amélioration permanente livrée le
même jour.

**1. "Je commence à 5/9" (bug réel, pas visuel) — CORRIGÉ.** Diagnostic : le
fantassin de départ d'une nouvelle run (`run/runState.ts`, `createNewRun`)
recevait toujours `hp = getUnit('fantassin').stats.maxHp`, la valeur de
BASE — alors que son `entity.stats.maxHp` EFFECTIF (base + bonus permanent,
appliqué au spawn via `playerStatOverrides`/`World.spawn`, voir chantier de
la boutique d'amélioration) reflétait déjà le niveau acheté. Résultat : une
unité fraîchement améliorée apparaissait "blessée" dès le premier spawn (PV
actuels = base, PV max affichés = base+bonus). Corrigé en profondeur, pas
seulement au point d'entrée :
- `createNewRun(startingGoldBonus?, startingFantassinMaxHp?)` gagne un
  second paramètre optionnel (même principe que `startingGoldBonus` : le
  module ne sait pas ce qu'est un niveau d'amélioration, il reçoit le maxHp
  déjà calculé par l'appelant) — les 2 sites qui démarrent une run
  (`let currentRun = ...`, `startNewRun()`) passent désormais
  `effectivePlayerUnitMaxHp('fantassin', metaProgress)`.
- `run/unitUpgradeEffects.ts`, nouvelle fonction `effectivePlayerUnitMaxHp(unitId,
  progress)` — PV max effectifs (base + bonus), échelle interne, à utiliser
  PARTOUT où une unité JOUEUR a besoin de connaître son propre plafond.
  `computePlayerUnitUpgradeEffects` la réutilise en interne (une seule
  formule).
- Deux AUTRES sites avaient le même bug latent, repérés en auditant tous les
  usages de `getUnit(id).stats.maxHp` pour une unité joueur : le plafond de
  soin en phase de PLACEMENT (`findHealTargetSlotIndex`/
  `useArmedItemOnPlacementClick`, main.ts — une unité améliorée était
  considérée "déjà pleine" dès qu'elle atteignait le maxHp de BASE, et le
  soin ne pouvait jamais la monter au-delà) et le nombre de pips MAX affiché
  pendant le placement (`ui/combatOverlay.ts`, `syncPlacement` — lisait
  `getUnit(unitId).stats.maxHp` en interne). Les achats en boutique de run
  (`onBuyFantassin`/`onBuyArcher`/`onBuyMage`) utilisaient déjà la bonne
  valeur (corrigé lors du chantier initial) — simplifiés pour appeler
  `effectivePlayerUnitMaxHp` au lieu de fouiller `statOverrides.maxHp`
  manuellement. La soin en BATAILLE (`target.hp = Math.min(target.stats.maxHp,
  ...)`) était déjà correcte : `entity.stats.maxHp` reflète toujours le
  patch appliqué au spawn, aucun changement nécessaire là.
- `CombatOverlay.syncPlacement(slots, resolveMaxHp?)` gagne un second
  paramètre (callback, même principe que `resolvePosition` existant côté
  `sync()`) — `ui/combatOverlay.ts` ne connaît pas la boutique d'amélioration,
  `main.ts` lui fournit `(unitId) => effectivePlayerUnitMaxHp(unitId,
  metaProgress)` ; repli sur le maxHp de BASE si omis (aucun autre appelant
  actuellement).

**2. Barre de PV qui grandit sans fin — CORRIGÉE.** "Il faut juste que la
barre se compacte pour rester de la même taille qu'avant" : `ui/combatOverlay.ts`,
`createBar` calculait un nombre de pips (`Math.round(maxHp / HP_PER_PIP)`)
puis créait exactement ce nombre d'éléments `.pip` de taille FIXE (4px,
`ui/style.css`) — sans plafond, une unité de plus en plus améliorée produit
une barre de plus en plus large. Corrigé par un COMPACTAGE progressif :
taille et espacement des pips (variables CSS `--pip-size`/`--pip-gap`,
posées par instance de barre en JS) restent EXACTEMENT ceux d'avant
(`PIP_BASE_SIZE = 4`, `PIP_BASE_GAP = 1.5`) tant que le nombre de pips reste
sous `PIP_COMPACT_THRESHOLD = 8` (couvre TOUS les maxHp de BASE actuels —
fantassin 5, archer 3, mage 5 — donc AUCUNE unité non améliorée n'est
visuellement affectée par ce changement), puis rétrécissent
proportionnellement au-delà pour garder la largeur totale de la barre proche
de sa largeur à exactement 8 pips, avec un plancher (`MIN_PIP_SIZE = 1.5`,
`MIN_PIP_GAP = 0.5`) pour qu'une barre très compactée reste visible plutôt
que de disparaître.
- Vérifié en headless (script temporaire avec `tsx`, supprimé après usage,
  imports des VRAIS modules `run/metaProgress.ts`/`run/unitUpgradeEffects.ts`/
  `run/runState.ts`) : reproduction exacte du bug "5/9" AVANT correctif
  (fantassin niveau 4, `hp` de départ = base alors que maxHp effectif =
  base+40 interne) puis confirmation qu'une run neuve démarre bien à
  PLEINS PV effectifs après correctif ; formule de compactage (réimplémentée
  fidèlement, pas de DOM en headless) : taille inchangée à 3/5/8 pips,
  compactage dès 9, taille exactement moitié à 16 pips (largeur totale
  proche de la référence à 8 pips), planchers jamais franchis à 1000 pips.
  Build propre.
- **Non vérifiable de mon côté** : rendu visuel réel de la barre compactée
  (lisibilité à très petite taille) — à confirmer par Antoine.

## Premier achat de la boutique d'amélioration monté à 10 runes (2026-08-13)

Antoine : "la première amélioration achetable doit coûter 10 runes."
`data/unitUpgrades.ts`, `baseRuneCost` des 3 unités (Fantassin/Archer/Mage,
toujours identique pour les 3) passe de 1 à 10 — séquence de coûts
`10, 20, 40, 80, 160...` au lieu de `1, 2, 4, 8, 16...` (toujours
`baseRuneCost * costMultiplier^level`, aucune autre formule touchée). Cohérent
avec `RUNES_PER_WAVE_WIN = 10` (run/metaProgress.ts, inchangé) : la première
amélioration reste accessible dès la première vague gagnée. Build propre.

## Correctif : les jambes continuaient de marcher "dans le vide" à la victoire/défaite (2026-08-13)

Antoine : "les animations de jambes des unités continuent lors de la
défaite ou de la victoire d'une manche, elle continue de marcher dans le
vide." Diagnostic précis (lecture de code, mécanisme de la boucle a pas
fixe) : `core/loop.ts` n'accumule du temps de SIMULATION que proportionnel a
`timeScale` (`accumulator += realDelta * timeScale`) — a `timeScale = 0`
(pose manuelle ET rideau de transition de fin de vague, qui pose ce flag
AVANT meme de jouer sa sequence), `world.step()` n'est plus jamais appele,
donc `entity.x`/`entity.prevX` restent figes A LA VALEUR EXACTE qu'ils
avaient au tout dernier vrai tick. Mais le RENDU, lui, continue de tourner
a chaque frame (`unitViews.sync(world.entities, alpha, realDt)`, `realDt`
mesure en temps REEL, independant de `timeScale`) — et `isMoving` s'y
calculait comme `dist(entity.x, entity.z, entity.prevX, entity.prevZ) >
WALK_MOVE_THRESHOLD` : si une unite etait mi-foulee (x != prevX) pile au
moment du gel, cet ecart ne bougeait plus jamais, donc `isMoving` restait
bloque a `true` INDEFINIMENT — le cycle de marche continuait d'avancer
(`mixer.update(realDt)` tourne toujours) sur une position par ailleurs bien
figee a l'ecran (`alpha` gele aussi) : d'ou des jambes qui pedalent sur
place.

- `render/unitViews.ts`, `UnitViews.sync` gagne un parametre
  `simulationFrozen = false` — quand vrai, `isMoving` est force a `false`
  sans meme evaluer la distance, quelle que soit la valeur figee de
  `entity.x/prevX`. `tickWalkAnim`/`tickRiggedAnimation` retombent alors sur
  leur transition normale vers le repos (deja utilisee a chaque arret
  normal d'une unite, donc deja fondue-enchainee proprement via
  `RIGGED_ANIM_FADE_SECONDS` — aucun nouveau code de transition necessaire).
- `main.ts` passe desormais `loop.timeScale === 0` a ce parametre au seul
  site d'appel — couvre a la fois la pause manuelle (Echap) et le rideau de
  transition de fin de vague (meme mecanisme sous-jacent), pas seulement le
  cas signale par Antoine.
- Build propre. **Non vérifiable de mon côté** (aucun accès visuel) — le
  raisonnement s'appuie sur une lecture complete et croisee de `core/loop.ts`
  (accumulateur/timeScale) et `render/unitViews.ts` (calcul d'`isMoving`),
  sans mesure en jeu reel ; a confirmer par Antoine que les jambes s'arretent
  bien net (ou se fondent proprement au repos) des la bannière de victoire/
  défaite.

## Buff de difficulté des ennemis par vague (2026-08-13)

Antoine : "désormais les unités ennemies doivent être améliorées (même buff
que boutique améliorations) une fois toutes les 3 vagues pour chaque
unités." Nouveau mécanisme de difficulté, SÉPARÉ de la boutique
d'amélioration permanente du joueur (aucune rune, aucun `MetaProgress`) —
purement fonction du numéro de vague, réutilisant les MÊMES formules
(`data/unitUpgrades.ts`) que celles déjà écrites pour le joueur. S'ajoute à
la courbe d'effectifs déjà croissante (`computeEnemyWaveComposition`), sans
lien avec elle.

- `run/unitUpgradeEffects.ts` : le calcul de bonus (PV/attaque ->
  `statOverrides`/`abilityDamageBonus`) a été extrait dans une fonction
  PARTAGÉE `buildUpgradeStatEffects(unitId, def, level)`, réutilisée à
  l'identique par `computePlayerUnitUpgradeEffects` (level = achats en
  boutique) ET la nouvelle `computeEnemyUnitUpgradeEffects(unitId,
  waveNumber)` (level = `enemyUpgradeLevelForWave(waveNumber)`) — mêmes
  formules garanties, une seule source de vérité.
- `enemyUpgradeLevelForWave(waveNumber) = max(0, floor((waveNumber - 1) / 3))`
  — "une fois toutes les 3 vagues" : vagues 1 à 3 = niveau 0 (AUCUN bonus,
  comportement strictement inchangé), vagues 4-6 = niveau 1, vagues 7-9 =
  niveau 2, vague 10 = niveau 3, etc., sans plafond. Point de départ choisi
  par Claude (le premier groupe de 3 vagues n'a pas encore "fait ses 3
  vagues") — à ajuster si Antoine voulait un premier palier dès la vague 1.
- `main.ts` : nouvelles `enemyStatOverrides(unitId, waveNumber)`/
  `enemyAbilityDamageBonus(unitId, waveNumber)` (miroir exact de
  `playerStatOverrides`/`playerAbilityDamageBonus`, mais sans lien avec
  `metaProgress`) — branchées UNIQUEMENT sur le spawn ennemi RÉEL
  (`onValidatePlacement`, `computeEnemyWavePlacements(currentRun.waveNumber,
  ...)`). `setupTestBattle` (raccourci de dev Entrée / "Tester le scénario"
  de l'éditeur) reste **volontairement non concerné** — il lit
  `currentMap.enemyUnits` directement, sans lien avec la progression d'une
  run réelle, cohérent avec l'existant (`computeEnemyWaveComposition`
  n'y est déjà pas utilisée non plus).
- Vérifié en headless (script temporaire avec `tsx`, supprimé après usage,
  imports des VRAIS modules + `World`) : paliers de niveau exacts sur les
  vagues 1 à 10, vagues 1-3 strictement sans bonus (`statOverrides.maxHp`
  égal à la base, `damage` absent du patch, `abilityDamageBonus` nul), vague
  4 (+1 PV, pas encore d'ATK), vague 10 (+3 PV ET +1 ATK, palier franchi),
  Mage : bonus sur `abilityDamageBonus` jamais sur `stats.damage` (même
  garde-fou que côté joueur — "Coup de bâton" jamais concerné). **Test
  critique via le vrai `World`** : un ennemi vague 10 est bien buffé
  (+30 PV/+10 damage interne), un JOUEUR spawné dans la même bataille sans
  passer par `enemyStatOverrides` garde ses stats de base à l'octet près
  (aucune fuite du buff ennemi vers le joueur). **Test bout en bout du Mage
  ennemi** via le vrai système de capacités : la Boule de feu d'un Mage
  ennemi vague 10 inflige réellement 40+10=50 à une cible simulée. 20/20
  vérifications passées. Build propre.
- **Non vérifiable de mon côté** : ressenti de difficulté en jeu réel — à
  confirmer/ajuster par Antoine, notamment le choix du palier de départ
  (vagues 1-3 sans bonus) s'il préférait un démarrage plus tôt.

## Bouton "Annuler le dernier achat" en boutique de run (2026-08-13)

Antoine : "un bouton retour dans la boutique au cas où une unité ait été
achetée par hasard." Filet de secours pour un misclic — pas un historique
général, un seul niveau d'annulation.

- `main.ts`, `lastUnitPurchase: { unitId: string; cost: number } | null` —
  posé par `buyUnit(unitId)` (nouvelle fonction partagée, remplace les corps
  dupliqués de `onBuyFantassin`/`onBuyArcher`/`onBuyMage`) après chaque achat
  réussi. `undoLastUnitPurchase()` : rembourse EXACTEMENT le coût payé
  (capturé au moment de l'achat — reste valable même si le coût effectif
  changerait entre-temps, ce qui ne peut de toute façon pas arriver en cours
  de run, voir la boutique d'amélioration permanente, menu titre uniquement),
  retire l'unité de `currentRun.army` ET `placementSlots` (toujours en
  DERNIÈRE position des deux côtés, invariant déjà établi par
  `addUnitToPlacement`).
- `lastUnitPurchase` remis à `null` (donc bouton désactivé) : après usage,
  à chaque nouvelle phase de placement (`startPlacement`, pour qu'un achat
  d'une vague précédente ne soit plus "annulable"), et après CHAQUE vente
  (`sellUnit`, sans condition — évite tout risque de double-remboursement si
  l'unité vendue est justement celle du dernier achat, ou toute ambiguïté
  d'alignement d'index).
- `ui/screens.ts` : bouton "Annuler le dernier achat" dans l'onglet Unités
  de la boutique, sous les 3 boutons d'achat — activé/désactivé via
  `refreshShop`/`showShop`, qui gagnent un 3ᵉ paramètre `canUndoLastPurchase:
  boolean` (Screens ne connaît pas `lastUnitPurchase`, main.ts le fournit à
  chaque appel — 4 sites mis à jour). Style secondaire discret (teinte
  rougeâtre) pour se distinguer visuellement des boutons d'achat.
- Build propre. **Non vérifié en headless** (logique concentrée dans
  `main.ts`, non importable proprement hors navigateur — closures liées au
  DOM/à la boucle de jeu) ; revue de code attentive à la place, notamment
  l'alignement d'index `army`/`placementSlots` et les cas `inPlacementPhase`
  faux (shop ouverte hors placement — n'arrive normalement jamais en
  pratique, gardes défensives quand même en place). **Non vérifiable
  visuellement de mon côté** — à confirmer par Antoine.

## Mage réservé à la vague 8 (joueur ET ennemi) (2026-08-13)

Antoine : "le mage est désormais déblocable pour le joueur une fois la
manche 8 vaincu, il apparait egalement pour la premiere fois manche 8 pour
l'adversaire qui en a un exemplaire dans ses rangs." Revient sur le choix du
2026-08-11 ("achetable dès le début, aucune vague de déblocage demandée").

- `config/constants.ts`, `MAGE_UNLOCK_WAVE = 8` — même mécanisme générique
  que l'ancien déblocage du Cavalier léger (`MetaProgress.unlockedUnits`,
  `isUnitUnlocked`/`unlockUnit`, conservés lors du retrait du Cavalier
  précisément pour être réutilisés ainsi, voir CLAUDE.md).
- **Côté JOUEUR** : `main.ts`, déclenché dans le même callback que le gain
  de runes (`waveBeingFought === MAGE_UNLOCK_WAVE`, sur une VICTOIRE
  réelle — jamais via "Tester le scénario"), sauvegarde immédiate.
  `buyUnit('mage')` refuse désormais l'achat si non débloqué (garde-fou en
  plus du bouton masqué côté UI). `ui/screens.ts`, `refreshShop` masque
  entièrement la LIGNE d'achat du Mage (bouton simple + ×5, voir plus bas)
  tant qu'il n'est pas débloqué — même convention "masqué, pas juste
  désactivé" que l'ancien Cavalier.
- **Côté ENNEMI** : `run/runState.ts`, `EnemyWaveComposition` gagne un champ
  `mage` — 0 avant la vague 8, puis **1 fixe** à partir de là ("un
  exemplaire", lu littéralement, PAS de croissance appliquée contrairement à
  fantassin/archer — à ajuster si Antoine veut une montée en puissance une
  fois testé). `main.ts`, `computeEnemyWavePlacements` ajoute ces mages à la
  liste d'unités à placer — classés automatiquement en rangée arrière par
  `layoutFormation` (le Mage a déjà `engageRange > 2`, aucun cas spécial
  nécessaire).
- Vérifié en headless (script temporaire avec `tsx`) : composition ennemie
  sans mage vagues 1-7, exactement 1 à partir de la vague 8 (testé jusqu'à
  15), fantassin/archer inchangés ; sauvegarde fraîche = Mage verrouillé ;
  `unlockUnit`/`isUnitUnlocked` round-trip après sauvegarde/reload ;
  "Effacer la sauvegarde" reverrouille bien le Mage. Build propre.
- **Non vérifiable de mon côté** : rendu visuel (ligne masquée/affichée,
  positionnement du Mage ennemi sur le plateau) — à confirmer par Antoine.

## Boutons "×5" en boutique de run (2026-08-13)

Antoine : "rajoute également à droite de chaque unité une option pour faire
'×5', cela sera plus confortable pour acheter plusieurs unités."

- `ui/screens.ts`, `unitPurchaseRow(def, onBuyOne, onBuyFive)` — construit
  une ligne `<div class="shop-unit-row">` avec DEUX `<button>` FRÈRES (jamais
  un bouton imbriqué dans un autre, invalide en HTML) : le bouton d'achat
  simple existant (`shopItemButton`) + un nouveau petit bouton "×5"
  (`shopUnitBuyFiveEls`, une Map par unitId comme `shopUnitPriceEls`).
  Utilisée pour Fantassin/Archer/Mage ; le parchemin de soin garde son
  bouton simple sans ×5 (pas demandé, un objet consommable à l'unité se
  prête moins à un achat groupé).
- `main.ts`, `buyUnitFive(unitId)` — appelle `buyUnit(unitId)` cinq fois de
  suite ; comme `buyUnit` vérifie déjà l'or à chaque appel et ne fait rien
  si insuffisant, ça achète NATURELLEMENT "jusqu'à 5" plutôt que d'exiger un
  tout-ou-rien — plus tolérant si le joueur n'a l'or que pour 2 ou 3.
  `lastUnitPurchase` (bouton "Annuler le dernier achat") finit sur le
  DERNIER des achats réussis : un seul niveau d'annulation, comme un achat
  simple — annuler les 5 d'un coup n'a pas été demandé.
- `ui/screens.ts`, `refreshShop` désactive chaque bouton ×5 dès que
  `run.gold < 5 * coûtEffectif` — le coût par unité reste CONSTANT sur les 5
  achats (seule la boutique d'amélioration permanente, menu titre
  uniquement, peut le faire varier, jamais en cours de run).
- Le Mage : la ligne ENTIÈRE (bouton simple + ×5) est masquée tant qu'il
  n'est pas débloqué (voir section précédente) — `shopMageRow` remplace
  `shopBuyMage` comme cible de `style.display`.
- Build propre. **Non vérifié en headless** (logique UI/main.ts non
  importable proprement hors navigateur) — revue de code à la place.
  **Non vérifiable visuellement de mon côté** — à confirmer par Antoine.

## Talent "Tir rapide" renforcé : vitesse 100% + dégâts (2026-08-13)

Antoine : "remodifie tir rapide pour améliorer la vitesse du projectile, il
passera désormais à 50% à 100%, de plus ajoute 2 points de dégâts d'attaque
sur le projectile." Deuxième volet du talent (dégâts) totalement nouveau —
jusqu'ici "Tir rapide" ne touchait que cadence/vitesse, jamais les dégâts.

- `config/constants.ts` : `TALENT_PROJECTILE_SPEED_BONUS` 0.5 → 1.0 (même
  multiplicateur relatif déjà en place, aucun changement de formule).
  Nouveau `TALENT_PROJECTILE_DAMAGE_BONUS = 20` (interne, +2 affichés) —
  ADDITIF sur `PLAYER_ARROW_DAMAGE`, pas multiplicatif (cohérent avec "2
  points de dégâts", pas "+X%").
- `sim/playerArrow.ts` : `ArrowFlight` gagne un champ `damage`, `fireArrow()`
  un 7ᵉ paramètre optionnel `damage = PLAYER_ARROW_DAMAGE` — copié dans le
  vol au DÉPART (même principe que `CastState.damage` du Mage : un talent
  qui se débloquerait pendant le vol ne doit jamais modifier un tir déjà
  parti). `stepPlayerArrow` applique `state.flight.damage` au lieu de la
  constante en dur. `World.fireArrowAt` propage ce nouveau paramètre.
- `main.ts`, nouvelle `effectivePlayerArrowDamage()` (miroir exact de
  `effectivePlayerArrowCooldown`/`effectivePlayerArrowSpeed`) — branchée au
  seul site de tir (`handleBattleFireClick`).
- `data/talents.ts` : description de `tir_rapide` mise à jour (100%, +2
  dégâts).
- Vérifié en headless (script temporaire avec `tsx`, `sim/playerArrow.ts` +
  `World` réels) : un tir avec le degât renforcé (40 = 20+20) inflige
  exactement ce total à une cible simulée ; un tir SANS le talent reste à 20
  (base inchangée) ; `World.fireArrowAt` propage bien le paramètre jusqu'à
  l'impact. Build propre.
- **Non vérifiable de mon côté** : ressenti en jeu réel (vitesse de vol,
  lisibilité du bonus de dégâts) — à confirmer par Antoine.

## Extension de la boutique d'amélioration : Baliste, Parchemin de soin, Tir rapide en maintien de clic (2026-08-13)

Demande complète d'Antoine (~45 points) : deux nouvelles améliorations
permanentes (Baliste, Parchemin de soin) réutilisant l'architecture
existante (Runes, coût qui double, sauvegarde persistante), plus un
changement de comportement du talent "Tir rapide" (maintien du clic = tir
automatique à la cadence effective).

**Audit préalable (résumé)** : "la Baliste" n'est pas une unité distincte —
c'est l'arme qui tire la flèche du joueur (`PLAYER_ARROW_COOLDOWN/DAMAGE/SPEED`,
`sim/playerArrow.ts`, visuel dans `render/ballista.ts`). Le parchemin de soin
existant (`data/items.ts`, `heal_scroll_minor`, base 50 interne = 5 PV) était
déjà utilisé à 3 endroits (clic bataille, clic placement, talent "Aux petits
oignons"). Le clic de tir était déjà géré par un seul `mousedown` sur le
canvas, sans notion de maintien.

- **Généralisation de l'architecture existante** (point explicite : "ne
  recrée pas un deuxième système") : `data/unitUpgrades.ts` gagne
  `RuneCostDef` (juste `baseRuneCost`/`costMultiplier`) et
  `nextUpgradeCost(def, level)`, extraits de la logique déjà écrite pour les
  unités — `nextUnitUpgradeCost` devient un simple alias. `run/metaProgress.ts`
  gagne `canPurchaseUpgrade`/`purchaseUpgrade` GÉNÉRIQUES (id + RuneCostDef) ;
  `canPurchaseUnitUpgrade`/`purchaseUnitUpgrade` (unités) deviennent de
  fines enveloppes autour de ceux-ci — aucun changement de comportement pour
  l'existant. **Aucun nouveau champ de sauvegarde** : Baliste et Parchemin
  vivent dans le MÊME `MetaProgress.unitUpgrades: Record<string, {level}>`
  que Fantassin/Archer/Mage, sous les clés `'ballista'`/`'heal_scroll_minor'`
  (le même id que l'objet dans data/items.ts).
- **`data/ballistaUpgrade.ts`** (nouveau, pur) : `BallistaUpgradeDef`
  (`baseRuneCost: 1`, `costMultiplier: 2` — **indépendant** du coût des
  unités, monté à 10 séparément — `attackSpeedPerLevel: 0.20`,
  `damageEveryLevels: 3`, `damagePerMilestone: 1`).
  **`run/ballistaUpgradeEffects.ts`** : `ballistaAttackSpeedBonus(level) =
  level * 0.20` (ADDITIF depuis la base, jamais composé — demande explicite
  "pas baseRate × 1.2 × 1.2..."), `ballistaDamageBonusDisplay = floor(level/3)`.
- **`data/healScrollUpgrade.ts`** (nouveau, pur) : `HealScrollUpgradeDef`
  (mêmes `baseRuneCost`/`costMultiplier` indépendants, `healPerLevel: 1`,
  `extraTargetEveryLevels: 3`, `secondaryHealRatio: 0.5`,
  `secondaryTargetRadius: 2` — **aucune notion de "portée cible→alliés
  proches" n'existait avant cette demande** ; valeur choisie par Claude en
  reprenant la magnitude de `HEAL_TARGET_RADIUS` existant, 2 cases — à
  confirmer/ajuster par Antoine, centralisée ici comme demandé plutôt que
  dans constants.ts). **`run/healScrollUpgradeEffects.ts`** :
  `effectivePlayerHealAmount = base + level*10` (interne),
  `effectivePlayerSecondaryHealAmount = effectiveHeal * 0.5` — utilise
  TOUJOURS le soin total ACTUEL (jamais `level * 0.5` seul, point 23 de la
  demande). Vérifié mathématiquement : comme le soin effectif est toujours
  un multiple de 10 (échelle interne x10), sa moitié est TOUJOURS un entier
  exact — jamais de demi-point interne à arrondir, aucune décision
  d'arrondi nécessaire.
- **`main.ts`** : `effectivePlayerArrowCooldown`/`effectivePlayerArrowDamage`
  combinent désormais DEUX sources ADDITIVES (jamais multipliées entre
  elles) : le talent "Tir rapide" (bonus fixe) + l'amélioration "Baliste"
  (bonus croissant). `effectivePlayerArrowSpeed` (vitesse du PROJECTILE)
  reste **volontairement intact** — l'amélioration Baliste ne la touche
  jamais (point 8 : ne pas confondre cadence/vitesse projectile/dégâts).
  Soin : `effectivePlayerHealAmount(metaProgress)` remplace la valeur de
  base brute aux 3 sites de consommation du parchemin (clic bataille, clic
  placement, "Aux petits oignons" — même parchemin, même bonus partout).
  Nouvelles `findSecondaryHealTargets`/`findSecondaryHealSlotIndices` :
  sélection déterministe (jamais aléatoire) des cibles secondaires — même
  camp que la cible principale, vivantes, blessées, différentes de la
  cible, à `secondaryTargetRadius` cases d'ELLE (pas du curseur), triées
  par distance puis id croissant (tie-break stable). Appliquées UNIQUEMENT
  à l'usage manuel du parchemin (pas à "Aux petits oignons", qui reste
  volontairement mono-cible — trigger réactif différent). Overheal
  plafonné par `Math.min(maxHp, ...)`, comme l'existant.
- **Maintien du clic ("Tir rapide")** : `fireButtonHeld` (booléen, posé sur
  `mousedown`/`pointerdown`, levé sur `mouseup`/`pointercancel`/`blur` — sur
  TOUTE la fenêtre, pas seulement le canvas, pour ne jamais laisser un tir
  actif si le mouseup a lieu ailleurs). `attemptAutoFire()`, appelée depuis
  le **pas de simulation FIXE** (`loop`, callback `onStep`, jamais le rendu
  à framerate variable) : no-op sans le talent débloqué, hors bataille, ou
  objet armé. Réutilise `fireArrowIfReady()` — LA MÊME fonction que le clic
  manuel appelle — donc `World.fireArrowAt` (son propre garde-fou
  cooldown/vol-en-cours) reste l'unique source de vérité sur "l'arme peut
  tirer", éliminant tout risque de double tir par construction (jamais un
  minuteur/compteur séparé). `fireButtonHeld` remis à `false` à la pause
  (`openPauseMenu`), au retour menu (`quitToMenu`), et à la toute fin d'une
  bataille (le même point où `battleOver = true`/`disarmItem()` s'exécutent
  déjà) — un clic simple reste un clic simple (un seul tir, le
  maintien ne fait qu'AJOUTER des tirs suivants une fois le cooldown
  écoulé), et rien ne se déclenche sans le talent.
- **`ui/screens.ts`** : deux nouvelles cartes dédiées (`buildBallistaUpgradeCard`/
  `buildHealScrollUpgradeCard`, shape différent des cartes d'unité — cadence
  en %/dégâts vs soin/cibles secondaires) ajoutées à l'écran boutique
  d'amélioration existant, refresh via `refreshUnitUpgradeShop` étendu.
  `onPurchaseUnitUpgrade` (main.ts) devient un dispatch générique par id
  (`getUnitUpgradeDef` pour les unités, sinon `BALLISTA_UPGRADE`/
  `HEAL_SCROLL_UPGRADE`) vers le même `purchaseUpgrade` générique — un seul
  point d'achat pour les 5 améliorations.
- Vérifié en headless (script temporaire avec `tsx`, imports des VRAIS
  modules + `World`/`localStorage` mocké) : 84 vérifications — séquences de
  coût 1-2-4-8... pour les deux nouvelles améliorations (indépendantes du
  coût des unités, resté à 10), cadence/dégâts Baliste exacts aux niveaux
  0/1/2/3/4/5/6, conversion cooldown jamais négative/invalide, combinaison
  additive Baliste+Tir rapide (prouvée différente d'une combinaison
  multiplicative), formules de soin exactes (dont l'exemple 3+6→9 PV,
  secondaire 4.5 PV pile), soin secondaire toujours un entier interne exact
  sur 13 niveaux consécutifs, achats indépendants (Baliste/Parchemin/unités
  ne s'influencent jamais), persistance après "reload" simulé,
  réinitialisation par "Effacer la sauvegarde", et un test EXACT du
  scénario de sélection de cibles de la demande (primaire + 5 alliés A-E :
  seuls A et C — blessés, à portée, triés par distance — sont retenus ;
  B/D/E systématiquement exclus). Build propre.
- **Non vérifiable de mon côté** : ressenti du maintien de clic en jeu réel
  (fluidité, absence de tir manqué au relâchement), rendu visuel des deux
  nouvelles cartes, lisibilité du soin en chaîne — à confirmer par Antoine.

## Angle de caméra par défaut mis à jour (2026-08-13)

Antoine a fourni une capture d'écran de son panneau de debug avec l'angle
qu'il souhaite comme défaut. `config/constants.ts`, `CAMERA` : pivot 55°→54°,
inclinaison 40°→25°, zoom 22→15 — lus directement sur la capture (pivot,
inclinaison, zoom). L'inclinaison tombe désormais pile sur `minPitchDeg`
(25), donc une caméra nettement plus plongeante/rapprochée qu'avant. Ce
sont ces mêmes constantes que lit `resetCamera()` (touches R/Espace), donc
aucun autre changement de code nécessaire. Build propre. **Non vérifiable
de mon côté** (aucun accès visuel) — la capture fournie sert de référence
directe, à confirmer par Antoine que le rendu correspond bien à la photo
une fois en jeu.

## Correctif : PV ennemis vides malgré leur amélioration par vague (2026-08-13)

Antoine, capture d'écran à l'appui (vague 10, plusieurs ennemis avec des
barres de PV clairement plus larges mais quasiment vides) : "les points de
vie de l'adversaire ne se remplissent pas avec son amélioration... les
points de vie augmentent mais sont vides." Exactement le même bug de fond
que le correctif "je commence à 5/9" côté joueur (voir plus haut), cette
fois côté ennemi — la faille était dans `World.spawn` lui-même, jamais
corrigée à la racine à l'époque.

- `sim/world.ts`, `spawn()` : `hp: hp ?? def.stats.maxHp` retombait sur le
  maxHp de BASE quand `hp` est omis — alors que `stats.maxHp` (juste en
  dessous) applique déjà `statOverrides` (donc le bonus). Les ennemis
  buffés par vague (`onValidatePlacement`, `enemyStatOverrides` — jamais de
  `hp` explicite passé, contrairement au joueur en placement réel) et le
  joueur en mode test (`setupTestBattle`, même absence de `hp` explicite)
  spawnaient donc avec des PV ACTUELS au plafond de BASE mais un maxHp déjà
  augmenté — des pips vides dès l'apparition, malgré des unités en pleine
  santé.
- Corrigé à la racine, une seule ligne : `hp ?? statOverrides?.maxHp ??
  def.stats.maxHp` — repli sur le maxHp DÉJÀ PATCHÉ s'il existe, avant de
  retomber sur la base. Corrige les DEUX cas d'un coup (ennemis par vague ET
  joueur en test) sans toucher aux sites qui passent déjà un `hp` explicite
  (placement réel, survivants entre vagues — comportement inchangé).
- Vérifié en headless (script temporaire avec `tsx`, `World` réel) : un
  ennemi vague 10 (+30 PV interne) spawne désormais à pleins PV effectifs ;
  une vague 1 sans bonus reste inchangée (50/50) ; un joueur en test avec
  `statOverrides.maxHp` boosté spawne aussi à pleins PV ; un `hp` explicite
  reste prioritaire (survivant blessé toujours correctement sous-plein).
  Build propre.
- **Non vérifiable de mon côté** — à confirmer par Antoine que les barres de
  PV ennemies apparaissent désormais pleines.

## Coût de départ de la Baliste et du Parchemin de soin aligné à 10 runes (2026-08-13)

Antoine : "le prix de l'amélioration de la baliste et du parchemin de soins
commence également à partir de 10 runes." `data/ballistaUpgrade.ts`/
`data/healScrollUpgrade.ts`, `baseRuneCost` 1 → 10 — même point de départ
que Fantassin/Archer/Mage (revient sur le choix initial "indépendant du
coût des unités"). Séquence désormais `10, 20, 40, 80, 160...` pour les 5
améliorations. Le NIVEAU de chaque amélioration reste totalement
indépendant (acheter la Baliste n'avance jamais le niveau du Parchemin ou
d'une unité) — seule la valeur de départ du coût est désormais partagée.
Vérifié en headless. Build propre.

## Correctif de cadence : le buff ennemi tombait tous les 4, pas tous les 3 (2026-08-13)

Antoine, après test réel : "l'ennemi doit améliorer ses unités finalement
une fois toutes les 3 manches, je crois qu'on est à 4 là non ?" — avait
raison. `run/unitUpgradeEffects.ts`, `enemyUpgradeLevelForWave` utilisait
`floor((wave-1)/3)` : les vagues 1-3 restaient TOUTES à niveau 0, donc le
premier changement ne se voyait qu'à la vague 4 — ressenti en jeu comme un
palier tous les 4 vagues, pas 3. Corrigé en `floor(wave/3)` : premier
palier dès la vague 3, puis pile tous les 3 (3, 6, 9, 12...) — vagues 1-2 =
niveau 0, vagues 3-5 = niveau 1, vagues 6-8 = niveau 2, etc. Vérifié en
headless (paliers exacts sur les vagues 1 à 12, espacement de 3 confirmé
entre chaque palier). Build propre.

## Cadence du buff ennemi passée à toutes les 2 vagues (2026-08-13)

Demande initiale d'Antoine ambiguë ("toutes les deux runs"), clarifiée via
question posée : il s'agissait en fait d'un lapsus pour "toutes les deux
vagues" — le mécanisme reste exactement le même (fonction du numéro de
vague dans la run en cours, aucun lien avec le nombre de runs jouées), seule
la période change. `run/unitUpgradeEffects.ts`, `enemyUpgradeLevelForWave` :
`floor(wave/3)` → `floor(wave/2)` — premier palier dès la vague 2, puis pile
tous les 2 (2, 4, 6, 8...) : vague 1 = niveau 0, vagues 2-3 = niveau 1,
vagues 4-5 = niveau 2, etc. Vérifié en headless (paliers exacts sur les
vagues 1 à 8). Build propre.

## Nouveau modèle FBX de la baliste (2026-08-13)

Reprise du chantier laissé en pause : remplacement du modèle `.obj`
Blockbench "Level 1" par le nouveau modèle FBX riggé fourni par Antoine
(`C:\Users\Antoine\Desktop\Projet prodolphe\balista`, copié dans
`public/models/ballista/fbx/`) — un mécanisme d'arc articulé (14 os : bras
gauche/droit, treuil, corde) avec textures PBR séparées et 3 clips
d'animation exportés à part (idle/tir/après-tir), au lieu d'un bloc
statique.

- **Textures** : les 3 `.tga` fournies (4096×4096, ~50 Mo CHACUNE) ont été
  décimées et réencodées en `.png` 1024×1024 (`T_Ballista_C`/`_N`/`_ORM`,
  script `scratch-convert-tga-to-png.mjs`, déjà exécuté et supprimé) — le
  jeu ne charge désormais que ces `.png`. `T_Ballista_ORM` empaquette
  occlusion/rugosité/métal (convention standard) : branché sur
  `roughnessMap`+`metalnessMap` (Three.js lit respectivement les canaux
  G/B), `roughness`/`metalness` forcés à 1 pour que ces cartes s'appliquent
  sans atténuation — l'occlusion (canal R) n'est PAS utilisée (demanderait
  un 2ᵉ jeu d'UV non confirmé présent, impact visuel mineur, écarté pour
  rester simple).
- **Échelle** : le corps FBX est exporté à une échelle native très
  différente de celle du jeu (bbox mesurée directement dans le fichier :
  ~365×176×345 unités, contre ~1.9×0.7×1.4 pour l'ancien `.obj` déjà bien
  intégré à la grille). Faute d'unité d'export documentée, la valeur
  `BALLISTA_SCALE = 0.005` est déduite en faisant correspondre le plus
  grand côté horizontal du nouveau modèle (365, la largeur des bras de
  l'arc) à celui de l'ancien (1.875) — un calcul mesuré, pas une supposition
  "cm→m" à l'aveugle.
- **Axe de tir : DÉDUIT de la géométrie du squelette, pas supposé** — l'axe
  reliant `ShoulderRoot_R`→`ShoulderRoot_L` (la largeur des bras de l'arc)
  est purement horizontal sur X (mesuré `[-83.85, 0, 0]`), donc l'axe de tir
  est forcément l'autre horizontale, Z. Le mécanisme de tir (`BackJoint`,
  treuil) est au Z le plus POSITIF tandis que les bras de l'arc sont au Z le
  plus NÉGATIF : l'avant (par où sort le carreau) est donc vers -Z —
  exactement la convention déjà utilisée partout ailleurs dans le rendu
  (`UnitViews.computeFacing`), AUCUNE rotation de correction nécessaire.
- **Retargeting des animations** : `Ballista_Shot_Anim.fbx`/
  `Ballista_AfterShot_Anim.fbx` sont exportés SÉPARÉMENT du corps — leurs
  pistes ciblent des noms d'os NUS (`"Root"`, `"MainJoint"`...) alors que le
  squelette du corps porte un préfixe long
  (`"ballista_0_rigskinning_finRoot"`...). `retargetClipToBody` réécrit le
  préfixe de chaque piste (Three.js relie une piste d'animation à un os PAR
  NOM, même principe que `render/riggedGltf.ts` pour le Fantassin/Archer/
  Mage, mais ici les noms ne coïncidaient PAS d'un fichier à l'autre,
  contrairement au cas GLTF).
- **Un seul exemplaire dans tout le jeu** (contrairement aux unités
  riggées, jamais clonées) : `buildBallista()` charge et construit
  directement l'instance unique, pas besoin du couple preload/
  `SkeletonUtils.clone` utilisé pour Fantassin/Archer/Mage.
- **Enchaînement Tir → Après-tir** : `mixer.addEventListener('finished', ...)`
  fait fondre-enchaîner vers le clip de récupération dès que le tir se
  termine (`clampWhenFinished` aurait sinon figé la DERNIÈRE image du tir
  indéfiniment). `playBallistaShot()` (nouveau, appelé depuis `main.ts`,
  `fireArrowIfReady`, uniquement si `World.fireArrowAt` a RÉELLEMENT tiré)
  coupe net toute animation en cours avant de relancer le tir — jamais deux
  tirs superposés. `tickBallista()` fait avancer le mixer en temps réel
  chaque frame de rendu, inconditionnellement (pas seulement pendant que le
  joueur vise), pour laisser le clip après-tir se terminer proprement.
- Vérifié en headless (script temporaire avec un VRAI `THREE.FBXLoader`,
  chargement par `.parse()` depuis le disque plutôt que `.loadAsync()`
  réseau) : le corps charge bien ses 14 os, le clip de tir retargeté cible
  des os qui EXISTENT bien sur le corps, et surtout — test critique — jouer
  ce clip via un vrai `AnimationMixer` fait RÉELLEMENT bouger la pose du
  squelette (`MainJoint` change de quaternion entre le début et le milieu
  du clip), l'enchaînement vers le clip après-tir se déclenche bien à la
  fin du tir. Build propre.
- **Bonne nouvelle indirecte** : le serveur de dev tournait déjà avec un
  onglet ouvert pendant cette reprise — les logs Vite confirment que le
  navigateur a rechargé et exécuté ce nouveau code PLUSIEURS fois SANS
  aucune erreur (seuls des avertissements bénins : conversion Z-up→Y-up du
  FBX, dépréciation de `PCFSoftShadowMap`). Ça ne dit rien sur le rendu
  VISUEL (échelle/orientation/qualité de l'animation), mais ça confirme
  que le chargement réseau réel des fichiers FBX/PNG et toute la logique de
  retargeting fonctionnent sans planter dans un vrai navigateur.
- **Non vérifiable de mon côté** : apparence réelle (échelle, orientation,
  qualité des textures PBR, fluidité de l'animation de tir) — à confirmer
  par Antoine dans le navigateur déjà ouvert.
- **Nettoyage en attente, pas fait unilatéralement** : les 3 fichiers
  `.tga` sources (~150 Mo au total) restent dans `public/models/ballista/fbx/`
  à côté des `.png` désormais utilisés — plus référencés par le code, mais
  laissés en place (ce sont les fichiers fournis par Antoine, pas à moi de
  les supprimer sans qu'il le demande). Idem pour l'ancien
  `ballista_level1.obj`/`ballista_level1_texture.png`, plus chargés du tout
  depuis ce rewrite.

## Correctif : la baliste restait enfoncée dans le sol après le premier tir (2026-08-13)

Antoine, capture d'écran à l'appui : après le premier tir, le modèle FBX
reste visiblement enfoncé dans le sol, en permanence, sans jamais s'en
sortir. Diagnostic mené en plusieurs passes, headless, avec un vrai
`AnimationMixer` (pas d'accès visuel de mon côté) :

- **Vrai bug trouvé et corrigé** : `afterShotAction` (le clip "après-tir",
  `LoopOnce` + `clampWhenFinished`) n'avait **aucun gestionnaire sur son
  propre événement `'finished'`** — seul le tir ("shot") en avait un pour
  s'enchaîner vers l'après-tir. Une fois l'après-tir terminé, plus rien ne
  pilote jamais plus ces os : le mixer les laisse figés pour toujours sur
  la toute dernière image du clip. Si cette dernière image ne correspond pas
  EXACTEMENT à la pose de repos (bind pose), le modèle reste bloqué ainsi en
  permanence dès le tout premier tir — cohérent avec "impossible de
  retirer" (rien ne le fait jamais bouger ensuite).
- **Correctif** (`render/ballista.ts`) : `collectRestPoseClip()` (nouveau)
  capture la position/rotation LOCALE de chaque os concerné juste après le
  chargement du modèle — donc AVANT que la moindre animation ait tourné,
  soit la vraie pose de repos telle qu'exportée dans le `.fbx`. Un
  troisième `AnimationAction` (`restAction`, un clip a une seule image-clé)
  est maintenant enchaîné en fondu dès que `afterShotAction` termine — la
  baliste revient donc TOUJOURS exactement à son apparence d'origine après
  la séquence tir/après-tir, quelle que soit l'image sur laquelle le clip
  source se termine réellement. Même principe "jamais de dérive, toujours
  un repère fixe capturé une fois" déjà utilisé pour `ProceduralAttackAnimator`
  (Fantassin). `playBallistaShot()` coupe aussi `restAction` en plus
  d'`afterShotAction` avant de relancer un tir, pour ne jamais superposer
  deux actions sur un nouveau tir.
- **Vérifié en headless** (script jetable, vrai `FBXLoader`/`AnimationMixer`,
  supprimé après usage) : en rejouant la séquence complète tir → après-tir →
  repos avec les VRAIS fondus (`fadeOut`/`fadeIn`, comme le code réel — une
  première version du test qui les omettait donnait des résultats faussés
  par un mélange de deux actions à pleine intensité en même temps, corrigée
  en cours de route), la pose finale revient bit-à-bit à la pose de repos
  capturée (écart résiduel ~1e-6, bruit flottant), et `restAction` reste
  actif en boucle pour toujours — plus jamais de blocage permanent possible
  par construction.
- **Découverte complémentaire, comportement normal et pas un bug** : il
  existe un vrai creux géométrique important (~0,87 unité monde, mesuré
  précisément) exactement à la jointure tir→après-tir — le point le plus
  bas de la trajectoire de recul, qui se résorbe ensuite normalement sur
  toute la durée du clip "après-tir" (~0,83s). Attendu pour une animation de
  recul d'arme, pas retouché.
- **Limite honnête** : je n'ai aucun accès visuel au rendu réel. Ce
  correctif garantit mathématiquement un retour exact à la pose de repos
  une fois la séquence tir/après-tir jouée sans interruption — c'est le
  bug le plus direct que la lecture de code pouvait expliquer pour un
  blocage PERMANENT. Si le problème persiste après ce correctif (par
  exemple si quelque chose interrompt `tickBallista` avant la fin de la
  séquence dans un cas que je n'ai pas identifié), il faudra qu'Antoine le
  reconfirme en jeu réel pour continuer à investiguer.

## Mages ennemis progressifs, inventaire doublé, Nova de glace + Blizzard (2026-08-14)

Demande complète d'Antoine (~47 points) : améliorer le fun, la variété
tactique et la montée en difficulté — Mages ennemis supplémentaires à partir
de la vague 10, inventaire doublé, premier VRAI sort de bataille actif
(Nova de glace, immobilisation de zone) et un nouveau talent fondateur
(Blizzard) qui l'enrichit sans jamais le remplacer. Audit préalable demandé
explicitement avant tout code — mené par lecture directe des fichiers
(talents, items, abilities, vagues, ciblage, Fireball du Mage, mouvement),
pas par supposition.

**1. Mages ennemis supplémentaires à partir de la vague 10** — FAIT.
`run/runState.ts`, `computeEnemyWaveComposition` : `extraMages` calculé par
la formule donnée telle quelle par Antoine
(`wave < 10 ? 0 : 1 + floor((wave-10)/3)`, constantes
`EXTRA_ENEMY_MAGE_START_WAVE`/`EXTRA_ENEMY_MAGE_INTERVAL` dans
`config/constants.ts`), **ajouté** (jamais substitué) au Mage déjà présent
depuis `MAGE_UNLOCK_WAVE` (8) — vague 10 = 1(base) + 1(extra) = 2 Mages au
total, vague 19 = 1+4 = 5. Fantassin/archer inchangés. Réutilise la
définition normale du Mage (`computeEnemyWavePlacements` dans `main.ts`
étend déjà la liste d'unités à poser depuis `composition.mage`, aucune
duplication de stats).

**2. Inventaire doublé** — FAIT. `run/runState.ts`, `INVENTORY_CAPACITY`
6 → 12 (seule source de vérité, lue par la barre ET la boutique). UI
(`ui/style.css`, `.inventory-bar`) passée de ligne unique à grille
adaptative (`flex-wrap: wrap`, `max-width: 318px` = exactement 6 colonnes de
48px) : s'enroule sur 2 lignes de 6 plutôt que de rétrécir les icônes,
grandit vers le haut depuis l'ancre `bottom:16px`.

**3-32. Nova de glace (nouveau sort de bataille)** — FAIT.
- `data/items.ts` : nouveau membre d'union `IceNovaEffect` (`ItemEffect`
  passe de 1 à 2 membres), entrée `ITEMS.ice_nova` (coût 4 or, catégorie
  `'battle-scroll'`, `usablePhases: ['battle']` uniquement — jamais mentionné
  pour le placement dans la demande, contrairement au parchemin de soin).
  **Rayon = source de vérité dérivée, jamais dupliquée** : `ICE_NOVA_RADIUS`
  calculé au chargement du module via
  `findAbility(getUnit('mage').abilities, 'area-blast').radiusTiles *
  ICE_NOVA_RADIUS_MULTIPLIER` (1.15, `config/constants.ts`) — lit le VRAI
  rayon de la Boule de feu du Mage (2 cases), résultat 2.3 cases. Une erreur
  de frappe dans un commentaire (`\**` au lieu de `/**`) découverte en
  auditant `data/units.ts` n'a pas été touchée ici (pré-existante, hors
  périmètre de cette demande).
- **Impact INSTANTANÉ, jamais un projectile** : `sim/world.ts`,
  `World.applyIceNovaRoot(casterTeam, x, z, radius, duration)` — scanne
  `world.entities` UNE FOIS au moment de l'appel, applique le statut Root à
  toute unité du camp opposé dans le rayon. Appelé directement depuis
  `main.ts`, `castIceNova`, synchrone avec le clic — aucun `World.blasts`,
  aucune incantation, aucun `Entity.cast` impliqué (contrairement à la Boule
  de feu du Mage, qui reste un mécanisme entièrement différent et
  inchangé).
- **Ciblage au sol** : réutilise le pipeline objet existant (`armInventorySlot`
  → `useArmedItemOnClick`, voir chantier inventaire) avec une nouvelle
  branche `def.effect.type === 'ice-nova'` — résout un POINT du sol
  (`computeGroundPoint`, comme le soin) plutôt qu'une unité, appelle
  `castIceNova(point.x, point.z, def.effect)`, consomme l'objet. Armer puis
  annuler (Échap, déjà générique via `disarmItem`) NE consomme PAS — un clic
  sur n'importe quel point du champ de bataille (même sans ennemi présent)
  CONSOMME, conforme à la demande ("aucune condition de cible" contrairement
  au soin).
- **Prévisualisation exacte** : `render/iceNova.ts`, `IceNovaView.showTargetPreview`
  — anneau construit à rayon UNITAIRE puis mis à l'échelle par
  `ICE_NOVA_RADIUS`, donc TOUJOURS exactement le rayon gameplay (jamais une
  valeur redessinée à la main). `main.ts`, `updateIceNovaTargetPreview`,
  branché sur le même `mousemove` que `updateHealTargetPreview`.

**33-46. Talent Blizzard** — FAIT. `data/talents.ts` : nouveau talent
`blizzard`, branche `'glace'` (nouvelle, 5ᵉ branche), **coût 1, prérequis
UNIQUEMENT le talent universel, 0/1** — exactement le même moule que
`butin_de_guerre`/`aux_petits_oignons`, aucune nouvelle mécanique
d'exclusivité ou de palier inventée. `ui/screens.ts`, `buildTalentTree` :
`branchOrder` étendu (le connecteur SVG se recalcule déjà depuis
`branchOrder.length`, comme prévu lors de l'ajout de la branche Soigneur) ;
`ui/style.css`, largeur 620px → 780px (5 × 140 + 4 × 20).

**Architecture additive, jamais substitutive** (point le plus critique de la
demande) : `main.ts`, `castIceNova` —
```ts
function castIceNova(x, z, effect) {
  world.applyIceNovaRoot('player', x, z, effect.radiusTiles, effect.rootDuration); // TOUJOURS
  iceNovaView.spawnImpact(x, z, effect.radiusTiles);
  if (isTalentActive('blizzard')) {
    world.createBlizzardZone('player', x, z, effect.radiusTiles, BLIZZARD_DURATION, BLIZZARD_TICK_INTERVAL, BLIZZARD_DAMAGE_PER_TICK); // EN PLUS
  }
}
```
Le Root s'applique INCONDITIONNELLEMENT ; Blizzard ne fait qu'AJOUTER une
zone par-dessus s'il est débloqué — jamais de branche `if/else` qui
remplacerait un effet par l'autre. Vérifié explicitement en headless (voir
plus bas).

**Statut Root générique** (`sim/entity.ts`, `Entity.rootTimer: number`,
secondes restantes, 0 = libre) — PAS un `if (iceNova) moveSpeed = 0` éparpillé :
- `sim/systems/movement.ts` : décompté UNE FOIS par tick
  (`Math.max(0, rootTimer - dt)`, jamais négatif, expire tout seul) ; gate
  UNIQUEMENT le bloc "dégagement/sidestep/poursuite/marche neutre" en tête
  de la boucle par entité (`if (e.rootTimer > 0) { e.path = null; continue; }`) —
  un arrêt INSTANTANÉ (aucun glissement, la position n'est simplement jamais
  réécrite ce tick) plutôt qu'une décélération. `updateStuckState` traite
  aussi une unité rootée comme "n'essaie pas de bouger" (évite qu'une
  manœuvre de dégagement se programme pour démarrer pile à l'expiration).
  Séparation entre corps et collision avec les obstacles restent
  volontairement ACTIFS pendant le Root (une unité gelée peut toujours être
  bousculée par la foule — cohérent avec le reste du jeu).
- **Le combat n'est jamais gaté** : `combatSystem` est entièrement
  indépendant de `movementSystem` (confirmé par lecture de code avant
  d'écrire quoi que ce soit) — "peut attaquer si une cible est déjà à
  portée" découle gratuitement du fait que seul le mouvement est bloqué.
- **Interaction avec la Charge** : `World.applyIceNovaRoot` met `e.dash =
  null` directement sur toute unité touchée (+ `sidestepTimer`/`unstickTimer`/
  `path`/`steerX`/`steerZ` remis à zéro) — interrompt immédiatement une
  Charge déjà engagée (préférence V1 explicite d'Antoine), sans toucher au
  système de Charge lui-même. `sim/systems/abilities.ts`,
  `tryTriggerCharge` refuse tout NOUVEAU déclenchement si `rootTimer > 0` —
  la Boule de feu du Mage (capacité sans déplacement) n'est PAS concernée,
  conforme à la demande ("peut lancer une capacité ne nécessitant pas de
  déplacement").

**Zone persistante générique** (`sim/systems/persistentAreaEffects.ts`,
nouveau) : `PersistentAreaEffect { casterTeam, x, z, radius, elapsed,
duration, tickInterval, damagePerTick, ticksFired }` +
`tickPersistentAreaEffects`. Reste PRAGMATIQUE (un seul champ d'effet, pas
de callback générique) comme demandé explicitement — réutilisable telle
quelle pour un futur poison/feu/aura sans réécriture. Chaque tick RE-SCANNE
`entities` par POSITION ACTUELLE (jamais une liste figée à la création) :
`ticksFired` compté via `min(floor(duration/tickInterval),
floor(elapsed/tickInterval))` — garantit EXACTEMENT 4 ticks à t=1,2,3,4
pour Blizzard (durée 4, intervalle 1), jamais de tick à t=0, jamais un 5ᵉ
tick. `sim/world.ts`, `World.iceNovaZones: PersistentAreaEffect[]`,
`World.createBlizzardZone(...)`, branché dans `step()` juste après
`combatSystem` (avant `deathSystem`, pour qu'un ennemi tué par un tick
meure bien au même tick). **Root et Blizzard totalement indépendants** —
vérifié explicitement : une unité qui entre dans la zone après t=0 ne
reçoit JAMAIS le Root (déjà résolu, une fois pour toutes, à l'instant du
clic) mais encaisse bien les ticks suivants ; une unité qui quitte la zone
avant un tick ne prend pas ce tick, quel que soit son statut Root.

**VFX** (`render/iceNova.ts`, nouveau, palette cyan pâle/bleu glacé/blanc
bleuté définie dans `config/constants.ts` COLORS — `iceCore`/`iceGlow`/
`iceDeep`) : impact PONCTUEL (flash + anneau + petite poussée de cristaux,
formes simples type Box/Ring/Circle, pas de vrai système de particules,
quelques centaines de ms) totalement séparé de la zone Blizzard PERSISTANTE
(fragments qui retombent en boucle, teinte au sol très discrète, contour à
peine visible, fondu entrée/sortie sur 0.3s) — les deux restent visuellement
distincts, l'impact de Nova est toujours visible même quand Blizzard est
actif juste après. **Aucune `PointLight`** contrairement à `FireballView` :
la Nova est un objet d'inventaire fréquent (pas un cooldown d'IA rare), et
le projet a déjà payé le coût d'un vrai bug de performance (recompilation de
shader) en ajoutant/retirant des lumières à la volée pour la Boule de feu —
plus simple d'éviter complètement le problème ici. Branché aux 5 sites
`world.clear()` existants + `sync()` dans la boucle de rendu, même motif que
`telegraphView`/`fireballView`.

**Icône** : `ui/itemIcons.ts`, `createIceNovaIcon` — éclat de glace facetté
(losange clair/sombre + petit flocon), SVG généré par code comme le reste de
l'UI, jamais un asset importé.

**Boutique** : `ui/screens.ts`, onglet "Parchemins de bataille" (jusque-là
vide) reçoit sa première vraie entrée — bouton `shopItemButton` (nom + prix
+ icône pièce, prix lu directement depuis `data/items.ts`, jamais recopié)
suivi d'une description qui s'enrichit dynamiquement
(`refreshShop`, `isTalentUnlocked(progress, 'blizzard')`) : SANS Blizzard,
"Immobilise... pendant 4 secondes." ; AVEC, la même phrase suivie de "Crée en
plus un Blizzard infligeant 2 dégâts chaque seconde pendant 4 secondes." —
**le prix ne change jamais** (toujours 4 or, désactivation du bouton
identique à `onBuyHealScroll` : or insuffisant OU inventaire plein).

**Effet de bord découvert en cours de route** : `ItemEffect` passant de 1 à
2 membres d'union a cassé 2 lectures `effect.amount` non protégées
(`run/healScrollUpgradeEffects.ts`, `ui/screens.ts`) qui supposaient
implicitement un seul type d'effet possible — corrigé en centralisant le
narrowing dans un nouvel accesseur `data/items.ts`, `getHealEffectAmount(id)`
(lève si l'objet visé n'a pas d'effet de soin) plutôt que de disperser des
`as HealEffect` à chaque site d'appel.

**Vérifié en headless** (script jetable avec `npx tsx`, imports des VRAIS
modules + `World` réel, supprimé après usage, 51/51 vérifications) :
- les 11 paliers de Mages supplémentaires demandés explicitement par
  Antoine (vagues 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19), plus vague 1
  (aucun Mage) et vague 6 (fantassin/archer inchangés) ;
- `INVENTORY_CAPACITY === 12` ;
- rayon réel de la Fireball = 2, `ICE_NOVA_RADIUS === 2.3`, item bien câblé
  dessus (pas une valeur dupliquée), coût 4, catégorie/usablePhases corrects ;
- Root appliqué aux unités dans la zone à t=0 seulement, aucun effet sur une
  unité hors zone, aucun déplacement pendant le Root (marche neutre bloquée),
  expiration propre (`rootTimer` retombe à 0 tout seul) ;
- une unité rootée continue d'attaquer une cible déjà à portée (dégâts bien
  infligés pendant le Root) ;
- le Root interrompt bien un `dash` (Charge) déjà en cours (`e.dash` remis à
  `null`) ;
- **test bout en bout Blizzard** : A/B présents à t=0 reçoivent le Root, C
  (hors zone) non ; les 3 encaissent bien les dégâts de zone selon leur
  position RÉELLE à chaque tick (C entré après coup prend les ticks suivants
  SANS jamais avoir reçu le Root — indépendance confirmée ; une unité sortie
  de la zone avant un tick ne le prend pas) ; zone supprimée proprement en
  fin de durée ; une unité restée dans la zone tout du long prend EXACTEMENT
  4 ticks (8 dégâts affichés, 80 interne), jamais plus ni moins ;
- le talent Blizzard suit exactement le même moule que les fondateurs
  existants (coût 1, prérequis talent universel uniquement, achat
  indépendant des 3 autres fondateurs) ;
- **test critique explicite** : sans Blizzard, le Root s'applique seul et
  aucune zone n'est créée ; avec Blizzard, le Root est TOUJOURS présent EN
  PLUS de la zone persistante — aucun cas où Blizzard supprime ou remplace
  le Root.

**Non vérifiable de mon côté** — aucun accès visuel au rendu : lisibilité
réelle du VFX (flash/anneau/cristaux, pluie de glace du Blizzard), mise en
page de la grille d'inventaire à 12 emplacements, rendu de l'icône Nova de
glace, largeur du nouvel arbre de talents à 5 branches, ressenti tactique
des Mages supplémentaires à partir de la vague 10 — à confirmer par Antoine
en jeu réel. Build propre (`npm run build`).

## Retouche VFX Nova de glace / Blizzard (2026-08-14, même journée)

Premier retour réel d'Antoine après le chantier ci-dessus : deux demandes.

**1. Indicateur manquant sur les unités immobilisées — CORRIGÉ.** Le point
11 de la demande originale ("petit cristal/givre autour des pieds") avait
été spécifié mais jamais réellement câblé au rendu — audité, confirmé absent
(`grep rootTimer` dans `render/` ne trouvait rien), puis ajouté :
`render/iceNova.ts`, `IceNovaView.syncFrostIndicators(entities,
resolvePosition)` — un petit anneau de givre au sol + 5 éclats de glace
anguleux (`buildFrostShards`, module-level) apparaît aux pieds de CHAQUE
unité vivante avec `rootTimer > 0`, une entrée par id d'entité (`Map<number,
THREE.Group>`), retirée dès la fin du Root ou la mort. Suit la position
RENDUE (interpolée via `unitViews.getPosition`, même convention que
`combatOverlay.sync`) plutôt que la position brute de simulation — reste
collé à l'unité même si elle est bousculée par la séparation pendant qu'elle
est rootée. Mesh entièrement séparé, ne touche jamais aux matériaux de
faction de l'unité (conforme à "ne recolore pas entièrement les matériaux
de faction"). Branché dans `main.ts` juste après `iceNovaView.sync(...)`.

**2. Blizzard trop doux — RETOUCHÉ.** Antoine : "on dirait plus qu'il neige
joyeusement plutôt qu'un réel blizzard dévastateur." Diagnostic (lecture du
code existant) : 10 petits cubes uniformes tombant tout droit, lentement
(cycle 1.4-2.5s), teinte très discrète (opacité 0.22/0.5) — lisible comme de
la neige tranquille plutôt qu'une tempête. `render/iceNova.ts`,
`buildBlizzardFx`/`sync` retouchés SANS toucher au gameplay (durée, rayon,
dégâts, cadence des ticks — tout ça reste exactement comme vérifié en
headless plus haut) :
- **Densité et vitesse** : `BLIZZARD_FLAKE_COUNT` 10 → 24, vitesse de chute
  quasi triplée (cycle ~0.5-0.9s au lieu de ~1.4-2.5s) — "ça rushe" plutôt
  que ça dérive.
- **Vent fixe** (`BLIZZARD_WIND`, vecteur horizontal normalisé) : chaque
  éclat dérive latéralement en tombant (`originX/Z + WIND * driftDist *
  phase`) au lieu de tomber droit — lecture "tempête qui souffle" plutôt que
  "neige qui tombe".
- **Formes/palette plus dures** : un tiers des éclats sont des débris
  allongés (pas uniquement des cubes), rotation continue (tumbling), mélange
  glace vive (`iceCore`)/glace sombre (`iceDeep`)/accents (`iceGlow`) plutôt
  qu'une seule teinte blanche uniforme ; rotation aléatoire à la création
  plutôt que des cubes toujours alignés aux axes.
- **Teinte au sol et contour renforcés** : teinte au sol passée de
  `iceGlow` à `iceDeep` (plus sombre, "ombre de tempête"), opacités de base
  montées (0.22→0.3 pour la teinte, 0.5→0.62 pour le contour, désormais en
  `iceGlow` pour trancher sur la teinte sombre du sol).
- **Pulse synchronisé sur les VRAIS ticks de dégâts** (nouveau,
  `BlizzardFx.lastTicksFired`/`pulse`) : `sync()` détecte une transition de
  `PersistentAreaEffect.ticksFired` (incrémenté par
  `sim/systems/persistentAreaEffects.ts` à chaque tick RÉELLEMENT résolu) et
  déclenche un bref "coup" visuel (opacité + léger gonflement du contour)
  décroissant sur `BLIZZARD_TICK_PULSE_DURATION` (0.3s) — le ressenti visuel
  est donc rythmé sur les 4 impacts réels (t=1,2,3,4), pas un cycle
  décoratif indépendant du gameplay.
- Toujours dans les garde-fous d'origine : pas de brouillard opaque, pas de
  néon, pas d'effet qui masque les unités, pas de vrai système de
  particules (juste plus de meshes simples qu'avant, toujours des
  Box/Circle/Ring).

Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun accès
visuel : le nouveau ressenti "tempête" reste à confirmer par Antoine en jeu
réel, tout comme la lisibilité du nouvel indicateur de givre sur les
silhouettes réelles.

## Traits de vent tournants pour le Blizzard (2026-08-14, même journée)

Deuxième retour d'Antoine sur le même VFX : "encore un peu mou... essaie un
effet d'animation de petit trait tournant autour de la zone, quelque chose
qui donne une impression de vent." `render/iceNova.ts`,
`buildBlizzardFx`/`sync` — nouvel élément AJOUTÉ à la zone Blizzard (flocons
qui tombent + teinte au sol + contour + pulse de tick, tous conservés tels
quels) :

- **`WIND_STREAK_COUNT` traits** (6) : chacun un pivot (`THREE.Group`,
  enfant de la zone) qui tourne en continu autour du CENTRE de la zone
  (`pivot.rotation.y += angularSpeed * dt`), TOUS dans le même sens
  (`angularSpeed` toujours positif, magnitude variable — 1.8 à 3.6 rad/s)
  pour lire comme un vent qui tourbillonne dans une direction cohérente
  plutôt qu'un chaos. Chaque trait est un arc plat (segment de
  `RingGeometry`, `thetaStart`/`thetaLength` — pas un rectangle qui tourne :
  la courbure suit vraiment la circonférence de la zone) posé à un rayon
  différent (étagés de 30 % à 90 % du rayon de la zone) pour occuper tout le
  disque, pas un seul anneau.
- **Sillage** : un second arc plus faible (`trailMesh`), simplement
  positionné à un décalage angulaire fixe DERRIÈRE le trait principal DANS
  LE REPÈRE LOCAL DU PIVOT — comme tout le pivot tourne ensemble dans un
  seul sens, ce décalage fixe reste TOUJOURS en retrait au lieu de rester
  figé à un angle du monde, donnant l'impression d'un trait filant plutôt
  qu'une forme statique qui pivote (même principe que la traînée de
  `FireballView`, appliqué ici à une rotation plutôt qu'une trajectoire
  linéaire).
- Opacité liée au fondu d'entrée/sortie de la zone (`alpha`) ET légèrement
  boostée par le pulse de tick existant (`streakOpacityBoost`) — les traits
  de vent s'intensifient eux aussi au moment de chaque impact réel, cohérent
  avec le reste de la retouche "dévastateur" du jour.
- Couleurs alternées `iceGlow`/`iceCore` (palette déjà en place), aucune
  nouvelle géométrie coûteuse (`RingGeometry` à 20 segments, comme le
  contour de zone existant) — toujours pas de vrai système de particules ni
  de `PointLight`.

Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun accès
visuel au rendu réel, à confirmer par Antoine.

## Tourbillon aérien + impression d'impact pour la Nova de glace (2026-08-14, même journée)

Troisième retour d'Antoine sur ce VFX, deux demandes distinctes : "rajoute
un autre effet tourbillonnant en petite particule différente... qui tournoie
en l'air et pas au sol", et "il faut également ajouter une impression
d'impact lors de la Nova de glace, dis-moi ce que tu peux faire pour ça".
`render/iceNova.ts` uniquement, aucun changement gameplay.

**Tourbillon aérien (`AirSwirlParticle`, `AIR_SWIRL_COUNT` = 18)** — distinct
des traits de vent au sol (arcs qui balaient la circonférence) ET des
flocons qui tombent (trajectoire descendante) : de petits éclats qui
ORBITENT à des hauteurs variées au-dessus de la zone (0.5 à 2.2 unités),
avec un bobbing vertical sinusoïdal doux. Vitesse angulaire plus élevée près
du centre (`angularSpeed = 1.2 + (1 - radiusFrac) * 2.2 + ...`) pour une
lecture "tornade" plutôt qu'un carrousel à vitesse uniforme. Rotation
continue sur chaque particule pour un léger tumbling. Opacité liée au même
`alpha`/`streakOpacityBoost` que le reste de la zone (fondu entrée/sortie +
petit boost au moment de chaque tick de dégâts, cohérence avec le reste).

**Impression d'impact (`spawnImpact`)** — trois éléments AJOUTÉS au flash/
anneau/éclats déjà existants, jamais en remplacement :
- **Onde de choc** (`shockwave`) : anneau qui part TOUT PETIT (échelle 0.15)
  et explose au-delà du rayon réel (jusqu'à ×1.5) en ~0.3s avec une
  décélération (ease-out), fondu simultané — porte la sensation de "boum qui
  se propage", distinct de `ring` (qui marque le rayon gameplay exact et
  bouge peu).
- **Fissures de givre** (`crackRays`, 7 par défaut) : des rayons fins qui
  jaillissent du point d'impact vers l'extérieur comme des éclairs de glace
  au sol. Détail technique : chaque géométrie est translatée
  (`geometry.translate(0.5, 0, 0)`) pour déplacer son pivot sur le bord
  "proche" avant d'être positionnée au centre de l'impact — sans ça,
  `scale.x` aurait fait grandir la fissure DANS LES DEUX SENS à la fois
  (vers ET depuis le centre) au lieu de vraiment jaillir depuis le point
  d'impact.
- **Dôme d'énergie** (`burstDome`) : seul élément vraiment volumique du
  visuel (tout le reste reste plat au sol) — une hémisphère
  (`SphereGeometry` avec `thetaLength = PI/2`) posée au sol qui gonfle
  brièvement puis se résorbe, fondu additif (même technique que la coque de
  `FireballView`, pas de nouveau shader) pour un glow bon marché.

Bug trouvé et corrigé au passage : `clear()` ne nettoyait que
`flash`/`ring`/`shards` pour les impacts en cours — les 3 nouveaux éléments
(`shockwave`/`burstDome`/`crackRays`) auraient fui dans la scène si une
bataille se terminait pile pendant l'animation d'impact (~0.4s de fenêtre).
Corrigé dans le même passage.

Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun accès
visuel, à confirmer par Antoine : le tourbillon aérien est-il bien LISIBLE
comme un effet distinct du reste, et l'impact se ressent-il enfin comme un
vrai "coup" plutôt qu'un simple flash.

## Clic droit annule le ciblage d'un objet armé (2026-08-14)

Antoine : "lorsqu'on clique sur un parchemin on est obligé de l'utiliser
pour retirer le curseur de visée, il faut pouvoir appuyer sur clic droit
pour sortir." `main.ts`, le listener `mousedown` du clic droit (déjà présent
pour démarrer le pan de caméra) appelle désormais `disarmItem()` en tête
dès qu'un objet est armé (`armedItemIndex !== null`) — même effet
qu'Échap (ne consomme jamais l'objet), le pan de caméra démarre normalement
juste après en plus. S'applique génériquement à tout objet d'inventaire
armé (parchemin de soin compris), pas seulement Nova de glace. Build
propre.

## Archer rééquilibré : dégâts remontés, taux de raté encore réduit (2026-08-14)

Antoine : "les attaques des archers ne sont vraiment pas terribles, c'est
une unité trop faible de par le fait qu'ils ratent trop de tirs."
Diagnostic avant correctif (lecture du code, pas de supposition) :
`missChance` de l'archer était déjà à 7% (`data/units.ts`), sous la
fourchette habituelle 10-15% et plus bas que le fantassin (12%) — le vrai
problème n'était donc pas littéralement "trop de tirs ratés" au sens RNG.
Le vrai coupable, déjà identifié et écrit en commentaire lors d'un chantier
précédent (2026-08-11) : le cooldown avait été DOUBLÉ (1.3s → 2.0s) pour
caler le tir visuel sur la durée du clip d'animation riggé, avec la note
explicite "nerf de cadence assumé, compensé par un futur ajustement de
dégâts — pas fait ici" — jamais honorée depuis, ~35% de DPS perdu sans
contrepartie.

- `data/units.ts`, archer : `damage` 8 → 12 — calibré pour que
  `12 / 2.0s = 6.0 dégâts/s` retombe quasiment exactement sur les
  `8 / 1.3s ≈ 6.15 dégâts/s` d'avant le nerf de cadence : restaure le DPS
  d'origine plutôt qu'un buff choisi au hasard.
- `missChance` 0.07 → 0.05 — répond aussi directement à la plainte
  littérale d'Antoine ("ils ratent trop de tirs"), même si le diagnostic
  ci-dessus place l'essentiel de la faiblesse ressentie du côté du DPS.
- Aucun autre changement (portée, PV, vitesse, coût inchangés).

Build propre. **Non vérifiable de mon côté** (ressenti en jeu réel) — à
confirmer par Antoine ; si l'archer reste jugé faible malgré ce correctif,
la cadence elle-même (2.0s) redeviendrait le prochain levier à considérer,
au prix de re-désynchroniser le tir de l'animation riggée.

## Correctif : le projectile de l'archer ne semble pas toucher sa cible (2026-08-14)

Antoine, en clarifiant le retour précédent : "les projectiles ne semblent
pas toucher leur cible, ce n'est pas vraiment une question de faire un
raté." Diagnostic distinct du taux de raté (RNG) : un VRAI bug de rendu,
resté après le correctif du 2026-08-13 ("les archers ratent presque
toujours leur cible").

- **Ce que corrigeait déjà le 2026-08-13** : `pendingArrowSpawns` re-lit la
  position de la cible au moment où la flèche part VRAIMENT (~1,2s après la
  résolution du combat, délai cosmétique calé sur l'animation) plutôt que
  la position capturée à la résolution — corrige la dérive pendant ce délai
  de ~1,2s.
- **Ce qui restait cassé** : `render/projectiles.ts`, `Projectiles.spawn`
  figeait `toX`/`toZ` une seule fois AU DÉPART de la flèche, puis le trait
  volait vers ce point fixe pendant toute la durée du vol
  (`ARCHER_PROJECTILE_DURATION`, 0,22s) — sans jamais re-regarder où se
  trouve la cible ENTRE-TEMPS. Si la cible est encore en mouvement à cet
  instant (très fréquent : une unité qui approche encore n'est pas à
  l'arrêt), elle a déjà quitté ce point avant que le trait n'y arrive —
  visuellement un "raté", alors que les dégâts avaient déjà été appliqués
  correctement en simulation, avant même le départ visuel de la flèche.
- **Correctif** : `Bolt` (et `Projectiles.spawn`) gagnent un `targetId`
  optionnel — `null` uniquement pour un tir BLOQUÉ (point d'impact fixe sur
  un obstacle, qui ne bouge jamais, comportement inchangé). `Projectiles.sync`
  gagne un callback `resolveTargetPosition(id)`, appelé À CHAQUE FRAME pour
  tout trait qui suit encore une cible vivante — `toX`/`toZ` sont donc
  recalculés en continu pendant tout le vol, pas seulement au départ. Léger
  "guidage" purement cosmétique (le résultat du tir est déjà figé bien avant
  que la flèche ne parte) qui fait juste correspondre ce que le joueur VOIT
  à ce qui s'est RÉELLEMENT passé.
- `main.ts` : le site d'appel de `projectiles.spawn` passe désormais
  `pending.targetId` (déjà disponible, réutilisé du correctif précédent) ;
  `projectiles.sync` reçoit un resolver `(id) => unitViews.getPosition(id) ??
  {x: entity.x, z: entity.z}` — même position INTERPOLÉE que le reste du
  rendu (`combatOverlay`, indicateurs de givre...), pour que la flèche vise
  la position réellement AFFICHÉE de la cible, pas seulement sa position de
  simulation brute.

Build propre. **Non vérifiable de mon côté** (aucun accès visuel) — le
raisonnement s'appuie sur une lecture complète de la chaîne résolution du
combat → délai cosmétique → vol du projectile, sans mesure en jeu réel ; à
confirmer par Antoine que les flèches connectent enfin visiblement.

## Toast "point de talent disponible" enrichi (2026-08-14)

Antoine : "le premier point de talent ne m'est pas notifié, il faudrait
qu'il soit notifié avec un message indiquant d'aller le dépenser dans
'arbre de talent' dans le menu principal, et faisant un bref résumé de
l'arbre de talent." Vérification avant correctif : le toast existant
(`ui/talentPointToast.ts`, 2026-08-10) SE DÉCLENCHAIT déjà bien pour le
premier point (`grantFirstRunPointIfNeeded` → `talentPointToast.show(1)`,
z-index 20, au-dessus de l'écran "Partie terminée", z-index 10) — pas de
bug fonctionnel trouvé, plutôt un message trop discret/générique
("+1 point de talent disponible !", 3.2s) pour qu'un joueur qui voit ça
pour la toute première fois sache quoi en faire.

- `data/talents.ts` : nouvelle constante partagée `TALENT_BRANCH_ORDER`
  (extraite de `ui/screens.ts`, `buildTalentTree`, qui la codait localement
  — évite une troisième liste dupliquée) et `listFounderTalents()`, qui
  dérive les noms des talents fondateurs (Butin de guerre, Tir rapide,
  Réflexes de vétéran, Aux petits oignons, Blizzard) directement depuis
  `TALENTS` plutôt qu'une liste recopiée à la main dans le toast — reste
  synchronisé automatiquement si un talent est ajouté/retiré/renommé.
- `ui/talentPointToast.ts` : le toast passe à DEUX lignes — le titre
  existant inchangé, plus une ligne de détail "À dépenser dans « Arbre de
  talents » (menu principal) — [liste des fondateurs]." Répond aux deux
  volets de la demande (direction + résumé) dans le même message, pas deux
  mécanismes séparés.
- `config/constants.ts`, `TALENT_POINT_TOAST_DURATION_MS` : 3200 → 6000ms —
  le texte à lire est nettement plus long qu'à l'origine.
- `ui/style.css` : `.talent-point-toast` passe en colonne flex
  (`.talent-point-toast-headline`/`-detail`), `max-width: 420px` pour que
  la ligne de détail s'enroule proprement au lieu de s'étirer sur toute la
  largeur de l'écran.

Build propre. **Non vérifiable de mon côté** — aucun accès visuel, à
confirmer par Antoine : lisibilité des deux lignes, largeur du bandeau,
timing de 6s ni trop court ni trop long à l'usage.

## VFX du parchemin de soin mineur, premier effet a base de vraies textures (2026-08-14)

Antoine : "je t'ai mis un pack complet de VFX [`C:\Users\Antoine\Desktop\Projet
prodolphe\vfx`]... sers-en toi pour ajouter une animation sympa au
parchemin de soin, je te laisse être créatif." Carte blanche créative,
premier VFX du jeu construit à partir de vraies textures plutôt que des
formes procédurales pures (Box/Ring/Circle comme `FireballView`/`IceNovaView`).

- **Source identifiée avant tout code** : le dossier fourni est le
  "Particle Pack" de Kenney (`License.txt` confirmé : CC0, "Written
  permission not required") — même licence déjà utilisée dans ce projet
  pour les rochers/arbres (Kenney Nature Kit, voir CLAUDE.md, Stack) et la
  baliste. Toutes les textures sont en niveaux de gris sur fond transparent,
  conçues pour être teintées via la couleur du matériau.
- **Sélection visuelle** (`Preview.png` du pack inspecté, puis chaque
  candidat ouvert individuellement pour choisir en connaissance de cause,
  pas au hasard sur le nom de fichier) : 4 textures retenues parmi la
  centaine disponible —
  - `symbol_01.png` : un **cœur** net (le pack en contient un, choix
    thématique évident pour un soin) — l'élément "signature" qui monte
    au-dessus de l'unité soignée.
  - `magic_02.png` : un anneau ouvragé (cercles reliés en couronne) — le
    cercle de bénédiction qui apparaît au sol sous l'unité.
  - `star_01.png` : une étincelle large et douce — le flash bref au moment
    de l'application du soin.
  - `star_04.png` : une étincelle plus fine à 4 branches — les petites
    particules qui montent en dérivant autour de l'unité.
  Copiées telles quelles (noms de fichiers Kenney d'origine conservés, même
  convention que `public/models/nature/`) dans `public/textures/vfx/`.
- **`render/healVfx.ts`** (nouveau) : `HealVfxView`, même architecture que
  `IceNovaView`/`FireballView` (`spawnHeal(x,z)` ponctuel + `sync(dt)` +
  `clear()`). Le cercle au sol est un `Mesh` à plat (comme les autres
  décalques de zone) ; le flash, le cœur et les étincelles sont des
  `THREE.Sprite` (toujours face caméra — idéal pour un glow vu depuis la
  caméra inclinée du jeu, jamais utilisé ailleurs dans ce projet jusqu'ici).
  Séquence : cercle qui grossit puis tourne en s'estompant (~0,7s), flash
  bref au centre (~0,3s), cœur qui monte et se dissout (~1,1s, le geste le
  plus lisible du lot), 5 étincelles qui dérivent légèrement en montant
  (~0,8s). Toutes les textures chargées une seule fois au niveau du module,
  partagées entre tous les soins.
- **Palette dédiée** (`config/constants.ts` COLORS, `healGlow`/`healCore`/
  `healAccent` — vert doux/blanc chaud/rose pâle) : une identité "soin"
  volontairement distincte des couleurs d'équipe et des autres sorts (glace,
  feu), pour ne jamais se confondre avec eux à l'écran.
- **Branché aux 5 sites** : soin manuel en bataille (cible principale ET
  secondaires, boutique d'amélioration "Parchemin de soin"), soin manuel en
  placement (idem), et le déclenchement automatique du talent "Aux petits
  oignons" — position toujours résolue via `unitViews.getPosition(id)` (la
  position RENDUE/interpolée, même convention que `healTargetRing`), avec
  repli sur la position brute de simulation. `sync()`/`clear()` câblés
  exactement comme `IceNovaView` (5 sites `world.clear()` + boucle de rendu).

Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun accès
visuel au rendu réel (bonne nouvelle : j'ai pu au moins *voir* les textures
sources elles-mêmes via l'outil de lecture d'image avant de les choisir,
contrairement à tout le reste du rendu 3D de ce projet) — à confirmer par
Antoine : lisibilité de la séquence, teintes, tailles, et si le cœur "sympa"
demandé fait son effet.

**Correctif le jour même : "aucun changement d'animation visible".** Après
un premier test réel, Antoine ne voyait rien. Relecture complète du code
(câblage, maths d'opacité/échelle) sans trouver de bug structurel — deux
causes plausibles identifiées et corrigées :
- **Taille** : le cœur ne dépassait pas 0.32 unité de large (~2 % de la
  hauteur d'écran typique) sur seulement 1.1s — illisible à l'échelle du
  jeu. Toutes les tailles reprises nettement à la hausse (cercle jusqu'à
  1.8 unité au lieu de 1.1, cœur jusqu'à 0.85 au lieu de 0.32, étincelles
  jusqu'à 0.24 au lieu de 0.12).
- **Contraste** : le cercle au sol était teinté `healGlow` (vert) en fondu
  ADDITIF sur de l'herbe déjà verte — un vert qui s'ajoute à du vert ressort
  à peine. Reteint en `healCore` (blanc chaud), qui ressort quel que soit le
  sol ; les étincelles alternent désormais `healCore`/`healAccent` au lieu
  de `healGlow`/`healCore`, pour la même raison.
Build propre. Toujours **non vérifiable de mon côté** — si le problème
persiste malgré ces deux corrections, il faudra reconsidérer une piste plus
structurelle (chargement de texture, ordre de rendu) qu'un simple réglage.

**Deuxième correctif, même jour : "faut vraiment zoomer très fort pour voir
l'animation".** Le premier passage (ci-dessus) n'a pas suffi. Cause
probable trouvée en reconsidérant le fondu ADDITIF utilisé PARTOUT : correct
pour un glow (lumière qui s'ajoute), mais un fondu additif ne peut QUE
éclaircir — sur une scène déjà bien éclairée (herbe en plein jour), une
couleur proche du blanc (`healCore`) ou pas assez saturée se "délave" au
lieu de ressortir, et une ICÔNE (le cœur, censé se lire comme une forme
pleine et nette) en additif ne peut jamais avoir cette lecture "solide".
- `render/healVfx.ts` : le cœur passe en fondu **NORMAL** (`buildIconSprite`,
  nouvelle fabrique séparée de `buildGlowSprite`) — plus une icône délavée,
  une forme pleine. Couleur `healAccent` resaturée (rose pâle → magenta,
  `config/constants.ts`).
- Nouvelle couleur `healGold` (or saturé, même principe que `fireGlow`/
  `iceGlow` qui fonctionnent déjà bien en additif sur ce même sol) remplace
  `healCore` (blanc) pour le cercle au sol — un blanc additif manque de
  contraste, une teinte franche non.
- **Tailles ENCORE agrandies** : cercle jusqu'à 2.6 unités (était 1.8), cœur
  jusqu'à **1.9 unité** (était 0.85 — désormais plus grand que la silhouette
  d'une unité), étincelles jusqu'à 0.4 (était 0.24). `heart.center.set(0.5,
  0.15)` (pivot bas du Sprite) pour que cette taille grandisse surtout VERS
  LE HAUT plutôt que de moitié s'enfoncer dans le sol. Durées légèrement
  allongées (cœur 1.1→1.4s, cercle 0.7→0.9s) pour laisser le temps de le
  remarquer.

Build propre. **Non vérifiable de mon côté** — si ça reste insuffisant après
CE DEUXIÈME passage (taille presque doublée + changement de mode de fondu),
la piste suivante à explorer serait un problème plus structurel (la texture
charge-t-elle vraiment, l'objet est-il bien dans le champ de la caméra à ce
moment précis...) plutôt qu'un réglage de plus.

## Premiers décors du pack KayKit "Medieval Hexagon Pack" dans l'éditeur (2026-08-14)

Antoine, en plein milieu du chantier VFX ci-dessus : "je t'ai mis une grosse
library d'asset et de texture ici [`C:\Users\Antoine\Desktop\Projet
prodolphe\Library\KayKit_Medieval_Hexagon_Pack_1.0_FREE`]... intègre de
nouveaux décors à notre éditeur de map... nous allons bientôt retravailler
notre bibliothèque, intègre de la meilleure façon cela pour l'instant."
Tour du pack fait avant tout code (structure de dossiers, `License.txt`,
format des `.gltf`).

- **Licence confirmée** : CC0 (Kay Lousberg, kaylousberg.com) — même régime
  que le Nature Kit déjà utilisé.
- **Format différent du Nature Kit** : `.gltf` (JSON) + `.bin` (géométrie) +
  UNE texture PARTAGÉE (`hexagons_medieval.png`, référencée en chemin
  RELATIF depuis chaque `.gltf`) — contrairement aux `.glb` autonomes de
  Kenney. `render/assetLibrary.ts` gagne `loadKaykitModel()` (même
  principe que `loadModel()`, extension et dossier de base différents,
  cache séparé par clé `kaykit:`) ; la texture partagée est copiée dans le
  MÊME dossier que les `.gltf`/`.bin` (`public/models/kaykit/`), sinon la
  résolution relative échoue.
- **Décision de périmètre, prise après MESURE réelle (script jetable lisant
  directement les `accessors` JSON des `.gltf`, sans avoir besoin de
  charger Three.js)** : le pack contient aussi des BÂTIMENTS
  (scaffolding/dirt/grain/stage/murs/ponts) et des TUILES HEXAGONALES.
  Écartés de cette passe :
  - Les bâtiments mesurent 1 à 2 mètres de large nativement — une toute
    autre échelle que les props retenus (0.14–0.72 m). Les mélanger dans la
    même normalisation de `scale` (voir `prop()`, `editor/editorUI.ts`)
    aurait écrasé les petits props à une taille quasi invisible. Une vraie
    intégration demanderait une emprise MULTI-CASES (comme les rochers),
    pas le système `kind: 'prop'` actuel (1 case, pas de composition) — pas
    fait ici, à construire séparément si demandé.
  - Les tuiles hexagonales (base/coast/rivers/roads) sont un système de
    TERRAIN, hors sujet tant que la peinture de terrain (étape 5 du
    chantier éditeur) n'existe pas — même raison déjà documentée pour les
    cliffs/ponts/cultures du Nature Kit.
- **40 modèles retenus** (14 nature : rochers/arbres isolés/nénuphars/
  plantes aquatiques ; 26 props : tonneau, seaux, caisses, drapeaux,
  échelle, palette, ressources bois/pierre, sac, cible, tente, râtelier
  d'armes, brouette) — traités comme des props GÉNÉRIQUES (`kind: 'prop'`,
  mis à l'échelle sur leur largeur comme les props Kenney) plutôt que
  d'étendre les systèmes `rock`/`tree` existants (composition en grappe,
  tirage aléatoire PROTÉGÉ contre tout ajout non validé) — plus simple,
  zéro risque de changer l'apparence de l'existant.
- **`scale` calibré par mesure réelle**, même méthode déjà utilisée pour les
  rochers Kenney (jamais deviné) : `width`/`height` extraits directement des
  `accessors[].min/max` de chaque `.gltf` (JSON pur, pas besoin de
  Three.js), normalisés sur le plus grand du groupe nature+props retenu
  (`tree_single_B`, 0.72 m → `scale: 1`).
- **`render/assetLibrary.ts`**, `KAYKIT_MODELS` fusionné dans le MÊME
  `propsByName` que les props Kenney (clé préfixée `kaykit_` pour garder la
  provenance lisible dans un `ObstacleDef`/JSON exporté) — `render/props.ts`
  n'a nécessité AUCUN changement, un `propModel` reste une simple clé.
- **`editor/editorUI.ts`** : nouveau groupe `ASSET_GROUPS` séparé "KayKit
  (médiéval)" (catégories Nature/Props) plutôt que fondu dans "Décors" —
  la provenance reste identifiable d'un coup d'œil, cohérent avec "on va
  bientôt retravailler notre bibliothèque" (plus facile à retirer/remplacer
  en bloc le moment venu).

Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun accès
visuel : apparence réelle des modèles une fois placés (métallicité/couleur —
contrairement au Fantassin, ces matériaux déclarent déjà `metallicFactor: 0`
explicitement dans le JSON, donc le piège "quasiment noir" déjà rencontré
ailleurs ne devrait PAS se reproduire, mais pas vérifié en pratique),
proportions relatives une fois à côté des unités/du décor existant — à
confirmer par Antoine dans l'éditeur de maps.

## Nova de glace / cœur de soin / KayKit — retouches VFX du 2026-08-14

Suite du chantier VFX texturé (voir "Mages ennemis progressifs, inventaire
doublé, Nova de glace + Blizzard" et les sections KayKit ci-dessus). Cinq
retours d'Antoine, traités dans l'ordre.

**Dôme d'énergie de la Nova agrandi de +50%** : `render/iceNova.ts`,
`spawnImpact` — rayon de la géométrie `worldRadius * 0.55` → `worldRadius *
0.85` (+54,5%, demande "au moins 50% plus grand" respectée). Appliqué sur la
géométrie elle-même, donc toute la courbe d'animation (scale 0.3→1.15)
grossit uniformément sans retoucher `tickImpacts`.

**Cristaux de givre aux pieds des unités immobilisées agrandis** :
`buildFrostShards` — anneau au sol 0.32→0.52, nombre d'éclats 5→7, hauteur
0.14-0.24→0.22-0.38, largeur 0.06-0.09→0.09-0.13, rayon de placement
0.15-0.3→0.22-0.42. Toujours un mesh séparé, jamais de recoloration des
matériaux de faction.

**Clic droit annule le ciblage d'un objet armé** (parchemin de soin, Nova de
glace...) : `main.ts`, le listener `mousedown` du clic droit appelle
`disarmItem()` en tête dès qu'un objet est armé, avant même de démarrer le
pan de caméra — jamais de consommation de l'objet, même effet qu'Échap.

**Archer rééquilibré** ("trop faible, rate trop de tirs") : diagnostic avant
correctif — `missChance` était déjà bas (7%), le vrai manque à gagner venait
d'une dette non honorée (cooldown doublé 1.3s→2.0s pour caler l'animation
riggée sur le tir, avec une promesse de compensation en dégâts jamais tenue).
`data/units.ts` : `damage` 8→12 (calibré pour retrouver EXACTEMENT le DPS
d'avant le nerf de cadence : 12/2.0 ≈ 8/1.3), `missChance` 0.07→0.05.

**Bug réel trouvé et corrigé : le projectile de l'archer ne semblait pas
toucher sa cible** ("ce n'est pas vraiment une question de faire un raté").
Distinct du correctif du 2026-08-13 (qui corrigeait la position visée AU
DÉPART du vol) : `render/projectiles.ts`, `Bolt` figeait `toX/toZ` une fois
pour toute la durée du vol (~0,22s) — une cible encore en mouvement pendant
ce court laps de temps (très fréquent, foule qui se bouscule) avait déjà
quitté ce point avant l'arrivée du trait, donnant l'impression d'un raté
visuel alors que les dégâts avaient déjà été appliqués correctement.
`Bolt`/`Projectiles.spawn` gagnent un `targetId` optionnel (`null`
uniquement pour un tir bloqué, sur un point fixe) ; `Projectiles.sync` gagne
un callback `resolveTargetPosition(id)` appelé CHAQUE FRAME pour recalculer
`toX/toZ` d'un trait qui suit encore une cible vivante. `main.ts` fournit ce
resolver via `unitViews.getPosition(id)` (position interpolée, cohérente
avec le reste du rendu). Build propre. **Non vérifiable de mon côté** — à
confirmer par Antoine.

**Toast de premier point de talent enrichi** ("il faudrait qu'il soit
notifié avec un message indiquant d'aller le dépenser... et un bref résumé
de l'arbre"). `data/talents.ts` : `TALENT_BRANCH_ORDER` (constante partagée,
remplace une liste dupliquée localement dans `ui/screens.ts`) et
`listFounderTalents()` (les fondateurs des 5 branches, dérivés des données
réelles — jamais une liste recopiée à la main, donc jamais périmée si un
talent change). `ui/talentPointToast.ts` : second élément de texte
(`detailEl`) affichant "À dépenser dans « Arbre de talents » (menu
principal) — {noms des 5 fondateurs}." `TALENT_POINT_TOAST_DURATION_MS`
3200→6000 (message plus long, besoin de plus de temps pour être lu). Aucun
bug de fond trouvé dans le mécanisme de déclenchement lui-même (déjà
vérifié correct par relecture) — uniquement un problème de clarté du
message.

**Animation VFX du parchemin de soin mineur** (demande d'Antoine : pack VFX
fourni, "je te laisse être créatif") — **première utilisation de vraies
textures dans le rendu du jeu** (`render/healVfx.ts`, nouveau), Kenney
"Particle Pack" (CC0, même licence déjà utilisée pour rochers/arbres/
baliste). Cercle magique au sol + flash + cœur qui monte + étincelles.
**Deux correctifs successifs après retours d'Antoine** ("je ne vois aucun
changement" puis "faut vraiment zoomer très fort") : (1) tailles bien plus
grandes + teinte du cercle passée du vert (`healGlow`, invisible sur l'herbe
déjà verte) au blanc chaud (`healCore`) ; (2) **leçon retenue** — un fondu
ADDITIF (`THREE.AdditiveBlending`) ne peut qu'ÉCLAIRCIR une scène, jamais
rendre une forme pleine/nette ni une couleur peu saturée sur un fond déjà
lumineux : suffisant pour un glow (flash, étincelles) mais délave toute
forme censée se lire comme une ICÔNE (le cœur). Ajouté `buildIconSprite`
(fondu `THREE.NormalBlending`, réservé au cœur), teinte du cercle passée à
un or saturé (`healGold`, même principe que `fireGlow`/`iceGlow` déjà
utilisés ailleurs en additif) — tailles quasi doublées une seconde fois
(cœur jusqu'à 1.9 unité, plus grand que la silhouette d'une unité).
**Troisième retouche** : "mets le cœur en blanc" — `healAccent` (magenta
saturé, essayé entre les deux) remplacé par `healCore` (blanc chaud) sur le
cœur uniquement. Cette leçon additif/normal est désormais documentée ici
pour tout futur VFX texturé du projet.

**Bibliothèque KayKit "Medieval Hexagon Pack" intégrée à l'éditeur de maps**
(dossier fourni par Antoine, "fais-en rapidement le tour... nous allons
bientôt retravailler notre librairie, intègre au mieux pour l'instant").
Format différent de Kenney (`.gltf` JSON + `.bin` + UNE texture PARTAGÉE
référencée en chemin RELATIF, contre des `.glb` autonomes) — la texture
partagée (`hexagons_medieval.png`) copiée à côté de chaque paire `.gltf`/
`.bin` dans `public/models/kaykit/` pour que la résolution de chemin
fonctionne. Proportions mesurées par script (lecture directe des
`accessors[].min/max` du JSON, pas de suppositions) : **découverte d'une
séparation nette en deux catégories d'échelle** (bâtiments 1,0-2,1 m natifs
contre petits props/nature 0,14-0,72 m) — bâtiments explicitement EXCLUS de
cette passe (auraient nécessité une emprise multi-cases comme les rochers,
pas encore construite pour un décor ; normaliser bâtiments et petits props
ensemble aurait écrasé ces derniers à une taille quasi invisible). 40
modèles retenus (14 nature + 26 props), câblés dans `render/assetLibrary.ts`
(`KAYKIT_MODELS`, `loadKaykitModel`, fusionnés dans `propsByName` via des
clés préfixées `kaykit_` — **zéro changement nécessaire dans
`render/props.ts`**, qui ne connaît que le nom générique) et
`editor/editorUI.ts` (nouveau groupe "KayKit (médiéval)" séparé plutôt que
fondu dans "Décors" — provenance identifiable, plus facile à retirer/
remplacer en bloc au prochain remaniement de bibliothèque annoncé par
Antoine). Terrain hexagonal/chemins/ponts du pack écartés (système de
peinture de terrain toujours pas construit, étape 5 du chantier éditeur).

**Nova de glace / Blizzard : passe VFX texturée, version procédurale
CONSERVÉE en secours** (demande explicite d'Antoine : "vois ce que tu peux
également faire pour le blizzard avec les vfx, garde la version actuelle au
cas où"). `render/iceNova.ts` : nouvel interrupteur `BLIZZARD_VFX_STYLE:
'procedural' | 'textured'` (actuellement `'textured'`) — repasser cette
seule constante à `'procedural'` restaure INTÉGRALEMENT l'ancien rendu, sans
aucun autre changement de code. L'ancien code (Box/Ring géométriques) a été
extrait tel quel de la classe vers une fonction autonome
`buildBlizzardFxProcedural` (aucune ligne modifiée), et une nouvelle
`buildBlizzardFxTextured` construit les MÊMES éléments à partir de vraies
textures (Kenney "Particle Pack" — mêmes fichiers déjà utilisés/prévus pour
le soin et déjà copiés dans `public/textures/vfx/` : `circle_05.png` pour
la teinte au sol, `circle_02.png` pour le contour, `twirl_02.png` pour les
traits de vent, `star_01.png`/`star_04.png` — réutilisées, MÊME instance de
`THREE.Texture` grâce à un nouveau cache partagé `render/vfxTextures.ts`,
voir plus bas — pour les flocons et le tourbillon aérien).
- **Teinte au sol / contour** : restent des `Mesh` à plat (comme avant),
  géométrie `CircleGeometry`/`RingGeometry` remplacée par `PlaneGeometry(1,1)`
  + texture, mis à l'échelle sur `worldRadius`. Fondu `NormalBlending` pour
  les DEUX (pas additif) — même leçon que le cœur de soin : la teinte au sol
  doit se lire comme une ombre de tempête qui assombrit, pas un glow qui
  éclaircit ; le contour doit rester un rim net, pas délavé.
- **Flocons / tourbillon aérien** : passent de `Mesh`(cube) à `THREE.Sprite`
  (toujours face caméra — plus cohérent pour de petits éclats vus depuis la
  caméra inclinée du jeu), fondu additif (glow, cohérent avec `fireGlow`/
  `iceGlow` déjà utilisés en additif ailleurs). Un `Sprite` n'a pas de
  rotation 3D (`rotation.x/y/z` ignorés, toujours face caméra par
  définition) — le "spin" existant (`spinX`/`spinZ`) est réinterprété comme
  un simple ROULIS 2D (`material.rotation`) pour ce style, via un test
  `instanceof THREE.Sprite` dans `sync()`.
- **Traits de vent** : restent des `Mesh` à plat sur pivot tournant (jamais
  de Sprite ici — doivent rester plaqués au sol, pas face caméra), géométrie
  `RingGeometry` (arc) remplacée par `PlaneGeometry` + texture `twirl_02`
  positionnée à un rayon fixe en repère LOCAL du pivot plutôt qu'un theta
  d'arc — le pivot les entraîne en cercle exactement comme avant, le
  sillage reste un décalage angulaire local fixe "derrière".
- **`sync()` reste ENTIÈREMENT PARTAGÉ entre les deux styles** — c'est le
  point central de cette passe : aucune duplication de la logique de
  mouvement/fondu/pulse. Un nouveau `setOpacity(obj, value)` (duck-typing
  sur `.material.opacity`, présent aussi bien sur `Mesh` que sur `Sprite`)
  remplace les casts `as THREE.MeshBasicMaterial` aux 2 endroits où le
  champ est désormais `THREE.Object3D` (flocons, tourbillon aérien) — seule
  la CONSTRUCTION diffère par style, jamais l'animation par frame.
- **`render/vfxTextures.ts`** (nouveau) : cache de texture partagé par nom
  (`loadVfxTexture`), extrait pour que `iceNova.ts` et `healVfx.ts`
  réutilisent la MÊME instance de `THREE.Texture` pour `star_01.png`/
  `star_04.png` plutôt que de recharger deux fois le même fichier —
  `healVfx.ts` migré dessus au passage (son ancien loader local supprimé).
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel au rendu réel : lisibilité du nouveau style texturé face au
  style procédural, cohérence du roulis 2D des flocons/tourbillon en Sprite,
  alignement des traits de vent texturés sur le pivot — à confirmer par
  Antoine. **Pour revenir à l'ancienne version en un instant** : dans
  `render/iceNova.ts`, changer `const BLIZZARD_VFX_STYLE: 'procedural' |
  'textured' = 'textured';` en `'procedural'`.

## Amplification du Blizzard texturé (2026-08-14, même jour)

Antoine, après le passage au style texturé ci-dessus : "c'est de mieux en
mieux, amplifie les effets de particule que tu viens de rajouter, il faut
que tout ce que tu viens d'ajouter soit plus visible." Amplification
SCOPÉE au style `'textured'` uniquement — le style `'procedural'` (gardé en
secours, voir section précédente) reste mathématiquement identique à avant
cette retouche.

- **`BlizzardFx.intensityScale`** (nouveau champ) : multiplicateur
  d'opacité appliqué par `sync()` à TOUS les éléments de la zone (teinte au
  sol, contour, flocons, traits de vent + sillage, tourbillon aérien) —
  `1` pour le style procédural (donc chaque formule d'opacité de `sync()`
  reste `Math.min(1, x * 1) = x`, STRICTEMENT identique à avant : toutes
  les valeurs de base étaient déjà ≤ 1), `TEXTURED_INTENSITY = 1.8` pour le
  style texturé. Permet d'amplifier UN SEUL style via une seule constante
  sans dupliquer `sync()` ni toucher au fallback procédural — même
  philosophie de partage déjà établie pour ce fichier.
- **Tailles et comptes de particules** augmentés, mais via des constantes
  DISTINCTES pour le style texturé (`BLIZZARD_FLAKE_COUNT_TEXTURED = 34`
  contre `BLIZZARD_FLAKE_COUNT = 24` pour le procédural,
  `AIR_SWIRL_COUNT_TEXTURED = 26` contre `18`, `WIND_STREAK_COUNT_TEXTURED
  = 9` contre `6`) — les constantes partagées d'origine restent lues
  UNIQUEMENT par `buildBlizzardFxProcedural`, aucun risque de changer le
  fallback en amplifiant le texturé. Tailles des sprites/plans quasi
  doublées (flocons 0.16-0.30 → 0.32-0.56, tourbillon aérien 0.14-0.24 →
  0.28-0.46, icône de tourbillon des traits de vent 0.42→0.62 du rayon de
  la zone, sillage 0.72→0.8 de la taille du trait principal).
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel, à confirmer par Antoine que l'amplification est suffisante
  (ou si elle va maintenant trop loin dans l'autre sens).

## Rond bleu de bordure dédié pour la zone Blizzard (2026-08-14, même jour)

Antoine, après l'amplification ci-dessus : "c'est top, affiche bien un rond
bleu au sol indiquant la zone de radius." Diagnostic avant correctif : un
marqueur de rayon existait déjà (`outline`, le contour de la zone) mais
risquait de se faire "manger" visuellement par les particules tout juste
amplifiées (flocons/traits de vent/tourbillon aérien, tous dans la même
palette glace) — le rayon exact n'était plus forcément lisible d'un coup
d'œil.

- **`buildBoundaryRing(worldRadius)`** (nouvelle fonction partagée) : un
  anneau plat SIMPLE — couleur unie (`COLORS.iceGlow`), sans texture, fondu
  NORMAL (pas additif, pour rester un trait net plutôt qu'un glow qui se
  délave). Construit à l'IDENTIQUE dans les deux styles
  (`buildBlizzardFxProcedural` ET `buildBlizzardFxTextured`) — jamais
  concerné par `BLIZZARD_VFX_STYLE` ni par `intensityScale` : son opacité
  est FORTE et FIXE dans `sync()` (`Math.min(1, 0.9 + pulse*0.1) * alpha`,
  indépendante du multiplicateur du style), pour que le rayon reste
  TOUJOURS lisible quel que soit l'état des autres effets.
  `BOUNDARY_RING_THICKNESS_FRAC = 0.08` (8% du rayon).
- **Anneau de ciblage (avant clic) harmonisé** : `targetRing` (affiché
  pendant qu'un objet à zone est armé, avant le clic) reprend la même
  épaisseur/opacité (0.55→0.9) que `buildBoundaryRing` — cohérence visuelle
  entre le rond de PRÉVISUALISATION et celui de la zone ACTIVE.
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel, à confirmer par Antoine que le rayon se lit désormais
  clairement.

## Remplissage pâle du rond de bordure + bordure amincie (2026-08-14, même jour)

Antoine, après le rond de bordure ci-dessus : "il faudrait que l'intérieur
de ce cercle soit teinté d'un bleu pâle et transparent, l'idée d'agrandir
la bordure du cercle à chaque tick est une très bonne idée mais sa bordure
est un peu large."

- **Bordure amincie** : `BOUNDARY_RING_THICKNESS_FRAC` 0.08 → 0.035 (un
  trait net plutôt qu'un large ruban) — s'applique aux DEUX endroits qui la
  réutilisent (`buildBoundaryRing` pour la zone active, `targetRing` pour la
  prévisualisation, tous deux déjà branchés sur cette même constante).
- **Remplissage pâle ajouté** : `buildBoundaryFill(worldRadius)` (nouvelle
  fonction partagée, même philosophie que `buildBoundaryRing` — couleur
  plate `iceGlow`, fondu NORMAL, opacité FAIBLE (0.22, +0.06 au pulse) et
  FIXE, jamais multipliée par `intensityScale`) : un disque plein sous le
  rond de bordure, dans les DEUX styles (`BlizzardFx.boundaryFill`).
  Distinct de `groundTint` (teinte plus sombre "ombre de tempête", laissée
  inchangée — le remplissage est un AJOUT, pas un remplacement). Même
  ajout sur la prévisualisation de ciblage (`targetFill`, avant le clic) —
  cohérence entre le cercle affiché avant et pendant le sort.
- **Le pulse de croissance ne concerne QUE la bordure** (demande explicite :
  "l'idée d'agrandir la bordure... est une très bonne idée") — le
  remplissage garde une taille fixe (`boundaryFill` non affecté par
  `fx.pulse` en échelle, seule son opacité varie légèrement), pour que
  seule la BORDURE grossisse visiblement à chaque tick de dégâts, pas toute
  la zone.
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel, à confirmer par Antoine.

## Boutique d'amélioration : Nova de glace + tri de l'inventaire (2026-08-14)

Deux demandes distinctes d'Antoine, traitées ensemble.

**1. Amélioration permanente de la Nova de glace.** "Le parchemin nova
glace doit pouvoir être améliorable à la boutique d'amélioration, la durée
doit augmenter de 0.5 par amélioration, durée des dégâts de la zone radius
ainsi la durée d'immobilisation. Tous les 3 achats augmente les dégâts du
tick de 1." Même architecture que les 4 améliorations déjà en place
(Fantassin/Archer/Mage, Baliste, Parchemin de soin — voir CLAUDE.md, "Boutique
d'amélioration des unités"/"Extension de la boutique d'amélioration") :

- **`data/iceNovaUpgrade.ts`** (nouveau) : `IceNovaUpgradeDef extends
  RuneCostDef` — `durationPerLevel: 0.5` (UN SEUL champ, appliqué à la fois
  au Root et au Blizzard, demande explicite d'Antoine plutôt que deux bonus
  séparés à synchroniser), `damageEveryLevels: 3`/`damagePerMilestone: 1`.
  Même point de départ que les autres (10 runes, ×2 par achat).
- **`run/iceNovaUpgradeEffects.ts`** (nouveau) : `computePlayerIceNovaUpgradeEffects(progress)`
  retourne `rootDuration`/`blizzardDuration` (base + bonus, secondes) et
  `damagePerTickInternal` (base + bonus, échelle interne ×10) — calcule TOUT
  ce dont `main.ts` a besoin, comme les autres modules d'effets.
- **`main.ts`, `castIceNova`** : lit désormais `computePlayerIceNovaUpgradeEffects(metaProgress)`
  au lieu de `effect.rootDuration` (valeur de base de l'objet) et des
  constantes brutes `BLIZZARD_DURATION`/`BLIZZARD_DAMAGE_PER_TICK` — le Root
  (TOUJOURS appliqué) et la zone Blizzard (seulement si le talent est
  débloqué) utilisent chacun la durée effective ; les dégâts de tick
  effectifs ne s'appliquent évidemment que si le Blizzard existe (le Root
  seul n'inflige jamais de dégâts).
- **Dispatch d'achat générique étendu** (`onPurchaseUnitUpgrade`, déjà une
  chaîne ternaire générique) : `ICE_NOVA_UPGRADE` ajouté à côté de
  `BALLISTA_UPGRADE`/`HEAL_SCROLL_UPGRADE` — toujours un seul point d'achat
  pour les 6 améliorations, jamais un `if` par id.
- **Carte dédiée dans `ui/screens.ts`** (`buildIceNovaUpgradeCard`,
  `IceNovaUpgradeCardRefs`) — affiche séparément "Immobilisation : Xs" et
  "Durée des dégâts (zone) : Ys" (même bonus, mais deux effets gameplay
  distincts, l'un actif inconditionnellement, l'autre seulement avec le
  talent Blizzard) et "Dégâts de tick : +N".
- **Description de la boutique de RUN rendue dynamique** (bug latent trouvé
  en implémentant, corrigé au passage) : `refreshShop` affichait jusqu'ici
  un texte STATIQUE ("immobilise pendant 4 secondes") — resterait périmé dès
  le premier niveau acheté. Recalculée maintenant à chaque `refreshShop`
  depuis `computePlayerIceNovaUpgradeEffects(progress)`, avec ou sans la
  phrase Blizzard selon que le talent est débloqué.
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  imports des VRAIS modules) : séquence de coût 10/20/40, bonus de durée
  exact à plusieurs niveaux (+0.5/+2s), palier de dégâts tous les 3 achats,
  `computePlayerIceNovaUpgradeEffects` à durée/dégâts de base au niveau 0,
  achat réel via `purchaseUpgrade` (3 achats → +1.5s de durée, +1 dégât de
  tick, coût du 4ᵉ = 80), refus si runes insuffisantes (aucun changement
  d'état), indépendance totale vis-à-vis des 5 autres améliorations
  (aucune n'avance quand la Nova de glace est achetée). Build propre.
- **Non vérifiable de mon côté** : rendu visuel de la nouvelle carte — à
  confirmer par Antoine.

**2. Tri de l'inventaire par similarité.** "Il faut également trier
l'inventaire pour que les sorts similaires soient les uns à côté des
autres, éviter que cela fasse brouillon." Piège identifié avant de coder :
`InventoryBar` associait jusqu'ici la position VISUELLE d'un emplacement à
l'index RÉEL dans `RunState.inventory` de façon rigide (`onSelectSlot(i)`,
`setArmed` comparant `i === index`) — `main.ts` manipule cet index
directement ailleurs (`currentRun.inventory.splice(index, 1)`,
`armedItemIndex`). Trier le tableau `RunState.inventory` lui-même aurait
risqué de désynchroniser un armement en cours (l'emplacement affiché à une
position donnée changerait de contenu sans que `armedItemIndex` le sache).

- **`data/items.ts`, `ITEM_CATEGORY_ORDER`** (nouveau, source de vérité
  unique, même principe que `TALENT_BRANCH_ORDER`) : `['heal',
  'battle-scroll']`.
- **`ui/inventoryBar.ts` réécrit** : `RunState.inventory` n'est JAMAIS
  réordonné — seul l'AFFICHAGE (position visuelle de chaque emplacement)
  est trié (`compareItemsForDisplay`, par catégorie puis par id d'objet,
  tri STABLE donc plusieurs exemplaires identiques restent groupés dans leur
  ordre d'acquisition). `slotRealIndex[positionVisuelle]` (nouveau tableau
  interne) fait la correspondance position affichée → index réel, recalculé
  à chaque `refresh()`. Le listener de clic (posé une seule fois à la
  construction) lit `slotRealIndex[i]` AU MOMENT DU CLIC plutôt que de
  capturer un index figé — la position reste fixe, mais l'objet qu'elle
  affiche peut changer d'un refresh à l'autre. `setArmed(index, ...)`
  continue de recevoir l'index RÉEL (comme avant, aucun changement côté
  `main.ts`) et compare désormais `slotRealIndex[i] === index` pour savoir
  quelle POSITION visuelle surligner.
- Build propre. **Non vérifié en headless** (logique DOM, non importable
  proprement hors navigateur) — revue de code attentive à la place,
  notamment la correspondance position/index réel dans les 3 méthodes
  (`refresh`/`setArmed`/le listener de clic). **Non vérifiable visuellement
  de mon côté** — à confirmer par Antoine que les objets se regroupent bien
  par type et que l'armement/l'utilisation ciblent toujours le bon objet
  après un tri.

## Retrait du décor procédural en boîtes (herbe, buissons, cailloux) (2026-08-14)

Antoine : "au tout début du développement du jeu tu as mis des petits cubes
verts pour faire des buissons et des petits traits pour simuler de l'herbe
il faudrait les retirer. également les petits cubes de pierres gris que tu
as mis." Retrait COMPLET (fonctions supprimées, pas juste désactivées) de
`render/board.ts`, `scatterDecoration` :

- `createGrassTuft` (touffes d'herbe — trois fines boîtes par touffe,
  "petits traits") — supprimée.
- `createBush` (buissons — 4 boîtes vertes empilées) — supprimée.
- `createPebble` (cailloux — boîtes grises) — supprimée.
- Constantes de densité associées (`GRASS_DENSITY`/`BUSH_DENSITY`/
  `PEBBLE_DENSITY`) — supprimées avec leurs boucles dans `scatterDecoration`.
- **Conservé, non concerné par la demande** : `createWoodDebris` (débris de
  planches de bois) — reste le seul décor procédural généré par
  `scatterDecoration`. La TEXTURE d'herbe peinte sur le sol
  (`createGrassTexture`, `render/textures.ts`) est un mécanisme totalement
  différent (un canvas appliqué comme texture, pas des objets 3D
  dispersés) — non concernée non plus, laissée telle quelle (voir CLAUDE.md,
  section Stack, "Objectif de style pour ces textures").
- **`config/constants.ts`** : les 7 couleurs devenues orphelines
  (`grassA`, `grassB`, `bush`, `bushDark`, `bushLight`, `stone`,
  `stoneDark`) supprimées de `COLORS` — vérifié par recherche qu'aucun
  autre fichier ne les référençait (le commentaire de `bushLight` citait
  `render/trees.ts` mais ce fichier ne les utilise pas réellement).
  `boardMat` retiré de l'import de `board.ts` (devenu inutilisé côté
  appelant — reste utilisé en interne par `meshHelpers.ts`, où `box()`
  s'en sert toujours).
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel, à confirmer par Antoine que le plateau ne montre plus ni
  herbe/buissons/cailloux en boîtes.

## Props traversables, décor (rochers/arbres) garde sa collision (2026-08-14)

Antoine : "les props qui se trouvent dans les spawn empêchent le déplacement
d'unités, à l'apparition pas de problème mais impossible de déplacer une
unité sur un 'props'... nous allons faire un système où les props seront
traversables et plaçables librement sur les cartes (pas de système de
cases) et les décor eux seront attribués au système de case et auront donc
une collision avec les unités. Je te laisse ajuster dans ce sens." Deux
volets distincts dans cette phrase — traité le premier (le bug concret,
gameplay) MAINTENANT, le second (placement libre sans grille dans
l'éditeur) explicitement PAS attaqué cette fois (chantier plus lourd, pas
de bug associé — voir "Pas fait" plus bas).

**Volet 1 — collision, FAIT.** `kind: 'prop'` (champignons, buissons,
fleurs, bûches, panneaux...) ne bloque désormais JAMAIS le mouvement d'une
unité, la ligne de tir, ni la validité d'une case en phase de placement.
`kind: 'rock'/'tree'` (le "décor" au sens d'Antoine dans ce message —
distinct du regroupement "Décors" de l'asset browser de l'éditeur, qui
mélangeait déjà props et rochers/arbres purement pour le RANGEMENT visuel,
voir plus haut) gardent leur collision exactement comme avant.

- **`config/constants.ts`, `isCollidableObstacle(obstacle)`** (nouvelle
  fonction, juste après `ObstacleDef`) : `obstacle.kind !== 'prop'` — SOURCE
  DE VÉRITÉ UNIQUE, réutilisée aux deux seuls endroits qui décidaient de la
  collision.
- **`sim/world.ts`** : `World.obstacles` (valeur par défaut ET `setMap`)
  filtre désormais avec `isCollidableObstacle` avant de stocker la liste —
  choix du point d'application le PLUS SIMPLE possible : `World.obstacles`
  est l'UNIQUE source lue par `movementSystem`/`combatSystem`/
  `abilitySystem` (donc aussi par `sim/pathfinding.ts`, appelé depuis
  `movementSystem`) — aucun de ces systèmes n'a eu besoin d'apprendre à lire
  `ObstacleDef.kind`, ils restent inconditionnels, c'est la LISTE elle-même
  qui est déjà correcte. Compatible avec le cache par référence de tableau
  déjà en place (`getObstacleBoundsList`/`getShrunkObstacleBoundsList`,
  `sim/geometry.ts`, WeakMap keyée par référence) : `setMap` produit une
  NOUVELLE référence filtrée à chaque changement de map, donc le cache reste
  correct sans aucun changement là non plus.
- **`main.ts`, `isValidPlacementTile`** : le test "case occupée par un
  obstacle" ignore désormais aussi les props (`if (!isCollidableObstacle(o))
  return false;`, avant de tester les bornes) — c'est ce test précis qui
  bloquait le déplacement d'une unité déjà posée pendant la phase de
  placement (le bug littéralement décrit par Antoine : "à l'apparition pas
  de problème" — la formation de départ ne validait jamais cette contrainte
  — "mais impossible de déplacer une unité sur un prop" — ce test s'y
  opposait).
- **Le RENDU n'est PAS concerné** : `render/board.ts`/`obstacleFactory.ts`
  continuent de lire `map.obstacles` NON filtré — un prop reste visible à
  l'écran, seule sa collision disparaît côté simulation. Cohérent avec
  "traversable" (pas "invisible").
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  `World` réel) : `isCollidableObstacle` correct sur les 3 `kind` ;
  `World.setMap` filtre bien les props de `world.obstacles` (2 obstacles
  restants sur 3 dans une carte de test rock+tree+prop) ; `findBlockingObstacle`
  ignore un prop (ligne de tir dégagée) mais bloquerait bien la même
  géométrie si elle n'était pas filtrée (contre-test) ; **test bout en
  bout critique** — une unité STATIONNAIRE (`moveSpeed: 0`, isolée de la
  marche normale "vers le centre" pour ne mesurer QUE l'effet de
  `resolveObstacleCollisions`) posée en plein sur un prop reste à drift
  quasi nul après 10 ticks, alors que la MÊME unité posée sur un rocher au
  même endroit est nettement repoussée (garde-fou anti-régression : la
  collision rocher/arbre n'a pas changé). Build propre.
- **Non vérifiable de mon côté** : rendu visuel réel (un prop doit rester
  affiché, juste traversable) et ressenti en jeu — à confirmer par Antoine.

**Volet 2 — placement libre des props sans grille, PAS FAIT** (chantier
distinct, plus lourd : `ObstacleDef` utilise `cornerX`/`cornerZ` entiers +
`tilesX`/`tilesZ`, un système de position continue x/z pour les props
demanderait de faire évoluer ce schéma, l'outil de placement de l'éditeur
— actuellement calé sur la grille pour TOUS les obstacles — et le
sérialiseur de map). Explicitement laissé de côté cette fois (phrase au
futur d'Antoine, "nous allons faire un système où...", pas un bug à
corriger dans l'immédiat) — prochaine étape si/quand demandée.

## Vraies textures de sol (herbe/terre) remplacent le canvas procédural (2026-08-14)

Antoine a fourni deux images (`C:\Users\Antoine\Desktop\Projet prodolphe\texturesol`,
noms de fichiers en UUID sans indication — identifiées par lecture directe des
deux images : la première verte = herbe, la seconde brune = terre) : "à
utiliser pour remplacer l'herbe et la terre sous le plateau." Remplace le
bruit procédural dessiné sur canvas (traits verts aléatoires pour l'herbe,
speckles bruns pour la terre — voir l'ancien "Objectif de style pour ces
textures" dans la section Stack, jugé stylisé plutôt que photo) par de
vraies images PNG.

- Copiées dans `public/textures/ground/` sous des noms descriptifs
  (`ground_grass.png`/`ground_dirt.png` — les UUID d'origine n'étaient pas
  des noms d'asset pack à préserver, contrairement à Kenney/KayKit).
- **`render/textures.ts` réécrit** : `createGrassTexture()`/`createDirtTexture()`
  gardent EXACTEMENT la même signature (`(): THREE.Texture`) — aucun
  changement nécessaire côté appelant (`render/board.ts`, qui applique déjà
  `.repeat.set(...)` sur la texture retournée). Chargement via
  `THREE.TextureLoader().load(...)`, une instance FRAÎCHE à chaque appel
  (pas de cache/clone partagé) : cloner une texture chargée par réseau AVANT
  la fin de son chargement ne propage pas l'image une fois arrivée (piège
  Three.js connu — `clone()` copie la référence `.image` au moment de
  l'appel, pas les mises à jour futures) ; plus simple et plus sûr de
  relancer un chargement indépendant à chaque fois, le cache HTTP du
  navigateur rend les appels suivants quasi gratuits, et cette fonction
  n'est de toute façon appelée qu'à la construction d'un plateau (jeu ou
  éditeur), jamais dans une boucle chaude.
- **`render/board.ts`** : `TEXTURE_TILE_SIZE` (densité de répétition, 2
  unités de monde par répétition) laissé inchangé — pas de moyen pour moi
  de juger si le grain des nouvelles images photo doit être plus fin/large
  que l'ancien bruit procédural sans accès visuel ; à ajuster si Antoine
  juge la répétition trop dense/lâche une fois vu en jeu.
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel au rendu réel, à confirmer par Antoine.
- **Incident sans rapport, corrigé au passage** : créer le nouveau dossier
  `public/textures/ground/` PENDANT que le serveur de dev tournait a
  déclenché le bug Windows déjà connu de ce projet (`EBUSY`, voir
  "Problèmes connus" — le watcher de fichiers de Vite s'étouffe parfois en
  découvrant un nouveau fichier sous `public/`), qui a fait planter le
  process `npm run dev`. Serveur relancé.

## Bâtiments KayKit dans l'éditeur de maps (2026-08-14)

Antoine : "intègre tout ce qu'il y a ici pour l'éditeur de map" (dossier
`buildings/blue` du pack KayKit "Medieval Hexagon Pack", déjà utilisé pour
la nature/les props le même jour), puis "tu devrais trouver l'équivalent
version rouge pour l'adversaire ici" (`buildings/red`), puis "tu peux
également intégrer tout ça, ils sont neutres ceux-là" (`buildings/neutral`).
Chantier explicitement anticipé et écarté lors de l'intégration KayKit
initiale du même jour ("les BÂTIMENTS... demanderaient une emprise
MULTI-CASES... à construire séparément si Antoine le demande") — c'est
cette suite.

**Distinction gameplay établie plus tôt le même jour, réutilisée telle
quelle** : `kind: 'building'` (nouveau, à côté de `'rock'`/`'tree'`/`'prop'`)
reste COLLIDABLE par défaut — `isCollidableObstacle` (config/constants.ts)
n'exclut que `'prop'`, donc aucun changement nécessaire là ; un bâtiment
bloque mouvement ET ligne de tir exactement comme un rocher/arbre.

**Format DIFFÉRENT du reste du décor** : `.obj`/`.mtl` (export Blender
classique), jamais rencontré ailleurs dans ce projet pour un asset chargé en
plusieurs exemplaires (l'ancienne baliste en `.obj` a été remplacée par un
`.fbx` riggé — voir CLAUDE.md, aucun `OBJLoader`/`MTLLoader` actif avant
cette demande). Nouveaux imports dans `render/assetLibrary.ts`.

- **Mesure des empreintes par script** (lecture directe des lignes `v x y z`
  de chaque `.obj`, PAS à l'œil — même méthode que pour les rochers/props
  KayKit) : 18 familles de bâtiments d'équipe (archeryrange, barracks,
  blacksmith, castle, church, home_A/B, lumbermill, market, mine, tavern,
  tower_A/B/base/catapult, watermill, well, windmill), certaines composées
  de PLUSIEURS fichiers `.obj` (toit de tour rotatif, pales de moulin, roue
  de moulin à eau, bras de catapulte — pièces mobiles dans l'outil d'origine,
  chargées ici comme des enfants STATIQUES d'un même groupe). `tilesX`/
  `tilesZ` = dimensions mesurées arrondies à l'entier supérieur.
- **Texture partagée `hexagons_medieval.png`, vérifiée bit-à-bit identique
  entre les dossiers `blue`/`red` source** (hash SHA256 comparé directement) —
  ce n'est PAS un fichier pré-teinté par couleur : c'est un atlas de
  palette générique (déjà croisé dans l'intégration nature/props du même
  jour), et ce sont les COORDONNÉES UV des `.obj` blue/red qui échantillonnent
  des zones différentes de cette même palette. Une seule copie de la texture
  suffit donc, copiée une fois dans `public/models/buildings/`.
- **Copie de fichiers** : 64 `.obj` + 64 `.mtl` (27 pièces × 2 couleurs + 10
  neutres) + 1 texture partagée dans `public/models/buildings/` — murs
  (`wall_corner_*`/`wall_straight*`) et clôtures (`fence_*`) du dossier
  `neutral` EXCLUS de cette passe : système de pièces CONNECTABLES (segments
  droits/coins/portes devant s'aligner bord à bord), fondamentalement
  différent d'un obstacle à emprise unique — même raisonnement déjà
  documenté pour les tuiles de terrain (étape 5 du chantier éditeur,
  toujours pas construite). `dirt`/`grain` (mesurés quasi plats, hauteur
  native 0.09/0.39) sont probablement des patches de sol plutôt que de vrais
  obstacles verticaux — laissés `kind: 'building'` (collidables) par
  cohérence avec le reste du lot plutôt qu'un traitement spécial deviné, à
  reclasser en `'prop'` si Antoine juge que ces deux-là ne devraient pas
  bloquer le mouvement.
- **`render/assetLibrary.ts`** : `OBJLoader`/`MTLLoader` importés ;
  `TEAM_BUILDING_FAMILIES` (18, avec jeton `{c}` substitué en `'blue'`/
  `'red'`)/`NEUTRAL_BUILDING_FAMILIES` (10, sans couleur) décrivent chaque
  famille comme une liste de PIÈCES (noms de fichier) à charger et regrouper
  — aucun offset relatif nécessaire entre les pièces d'une même famille : un
  `.obj` n'a AUCUNE notion de hiérarchie/transform parent-enfant
  (contrairement à `.gltf`), donc les coordonnées de chaque pièce sont déjà
  ABSOLUES telles qu'exportées — les charger comme enfants d'un même `Group`
  SANS transformation supplémentaire reproduit fidèlement la composition
  d'origine. `THREE.Cache.enabled = true` activé globalement (~64 `.mtl`
  référençant tous la même texture partagée — sans ce cache, MTLLoader
  relancerait un fetch/décodage indépendant à chaque fichier). Chaque pièce
  a son PROPRE `.mtl` (même structure `newmtl hexagons_medieval` que les
  autres, vérifié par lecture directe) — chargé et mis en cache par nom de
  fichier (`loadBuildingMaterials`), `colorSpace` corrigé manuellement sur
  la texture résultante (MTLLoader ne le fait jamais automatiquement, même
  leçon déjà tirée ailleurs dans ce projet). `EnvironmentAssets.buildingsByName`
  (nouveau), clé préfixée par couleur (`blue_archeryrange`, `red_castle`,
  `neutral_bridge_A`...).
- **`assetLibrary.ts`, `cloneScaledToFootprint`** (nouvelle fonction,
  complète `cloneScaledTo` déjà existante — logique de recentrage extraite
  en commun, `recenterOnFootprint`) : contrairement à un prop (mis à
  l'échelle sur sa SEULE largeur), un bâtiment doit tenir dans un rectangle
  `tilesX × tilesZ` potentiellement NON CARRÉ — échelle UNIFORME (jamais de
  déformation) calculée comme le plus petit des deux ratios largeur/
  profondeur, pour ne JAMAIS déborder de son emprise dans un sens comme
  dans l'autre. Aucun `scale` à deviner/mesurer à la main comme pour les
  props : la boîte englobante réelle du modèle chargé fait foi.
- **`render/buildings.ts`** (nouveau) : `createBuildingObstacle` — pas de
  rotation aléatoire par défaut (contrairement aux props/arbres, organiques) :
  un bâtiment a une orientation "canonique" (façade), même si elle n'est pas
  connue de mon côté sans accès visuel — une rotation fixe et prévisible
  (`rotationY ?? 0`, ajustable à la main via l'outil Tourner de l'éditeur)
  vaut mieux qu'un tirage aléatoire à chaque placement.
- **`render/obstacleFactory.ts`** : `case 'building':` ajouté au switch
  partagé jeu/éditeur.
- **`editor/editorUI.ts`** : nouveau groupe "Bâtiments (KayKit)", 3
  catégories — "Bleu (joueur)"/"Rouge (adversaire)"/"Neutres" (18+18+10 = 46
  entrées), helper `building(label, buildingModel, tilesX, tilesZ)` miroir
  de `prop()`/`tree()`.
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  **chargement GÉOMÉTRIQUE réel** via `OBJLoader.parse()` sur le contenu
  effectif des 64 fichiers `.obj` copiés — pas une réimplémentation) :
  `isCollidableObstacle` vrai pour `'building'` ; chargement simple (puits)
  produit un mesh de taille non nulle ; **test critique multi-pièces** —
  base seule de la tour A (hauteur 1.5) vs base+toit regroupés (hauteur
  2.19, le toit ajoute bien de la hauteur, confirmant que le regroupement
  sans offset fonctionne) ; `cloneScaledToFootprint` sur le VRAI château
  chargé tient bien dans 2×3 cases avec une échelle strictement uniforme
  (x=y=z), un des deux axes touchant exactement sa limite, pied posé à
  y=0 ; les 27 pièces de la famille bleue chargent toutes avec au moins un
  mesh (aucune exception, aucun fichier manquant) ; échantillon rouge et
  neutre chargés avec succès. **Non vérifiable en headless** (donc non
  vérifié) : les matériaux/textures elles-mêmes — `MTLLoader.preload()`
  charge une vraie image via `document.createElement`, indisponible en Node
  sans DOM ; le script a volontairement chargé la géométrie SEULE
  (`OBJLoader.parse()` sans matériaux) pour rester dans ce qui est
  réellement vérifiable sans navigateur.
- Build propre (`npm run build`). Serveur de dev relancé avec succès après
  ces changements (aucune erreur au hot-reload, `MTLLoader` optimisé par
  Vite sans problème).
- **Non vérifiable de mon côté** : rendu visuel réel (texture/couleur
  d'équipe effectivement appliquée en jeu, proportions des bâtiments une
  fois posés à côté des unités/du reste du décor, lisibilité de l'orientation
  par défaut) — à confirmer par Antoine dans l'éditeur de maps.
- **Pas fait, explicitement écarté** : murs/clôtures (système de pièces
  connectables, chantier séparé et plus lourd) ; aucune bascule automatique
  de couleur selon le côté du plateau (contrairement aux UNITÉS, dont le
  camp est déduit de la position) — les bâtiments bleu/rouge restent deux
  entrées de catalogue distinctes que l'on choisit manuellement, cohérent
  avec le fonctionnement déjà établi des obstacles (jamais team-aware avant
  cette demande) ; à reconsidérer si Antoine préfère un choix automatique.

## Halo doré au survol sur tous les boutons (2026-08-14)

Antoine, capture d'écran à l'appui (menu pause, "Continuer" affichant un
contour doré que les deux autres boutons n'avaient pas) : "je veux que tu
ajoutes cet effet orange sur tous les boutons lorsque l'on passe le curseur
par-dessus." Diagnostic avant correctif : cet effet n'était produit par
AUCUNE règle `:hover` du CSS — c'était l'anneau de focus PAR DÉFAUT du
navigateur (aucun style `:focus` explicite nulle part dans `style.css`),
d'où son apparition sur un seul bouton (celui ayant le focus clavier) plutôt
qu'au survol.

- `ui/style.css` : nouvelle variable `--accent-gold: #e8c15c` (réutilise
  exactement la teinte déjà établie ailleurs — `.shop-item-price`,
  `COLORS.playerArrowAccent` côté 3D — plutôt que d'en inventer une
  nouvelle). Règle GÉNÉRIQUE `button:not(:disabled):hover,
  button:not(:disabled):focus-visible { border-color: ...; box-shadow: ...;
  outline: none; }` sur la balise `<button>` elle-même plutôt que classe
  par classe — vérifié par recherche que tout élément cliquable de ce
  projet est déjà un vrai `<button>` (jamais un `<div>` avec un handler),
  donc cette seule règle couvre "TOUS les boutons" sans risque d'en
  oublier un. `:focus-visible` aligné sur le même style (cohérence
  clavier/souris), `outline: none` pour ne jamais empiler l'anneau natif
  par-dessus le halo.
- **Seule exception explicite** : `.shop-undo-button` (bouton "Annuler le
  dernier achat", déjà teinté rouge en permanence — bordure ET fond,
  identité "annulation") — son propre `:hover` (spécificité CSS
  supérieure, 3 classes/pseudo-classes contre 2 pour la règle générique)
  garde son rouge intact plutôt que de le mélanger à un halo doré, qui
  aurait brouillé le signal "action d'annulation/remboursement".
  `.editor-button--danger`, `.talent-node--unlockable`,
  `.inventory-slot--armed` (autres boutons à couleur d'état) laissés SANS
  exception — leur teinte reste visible juste avant/après le survol, un
  bref halo doré pendant le survol lui-même reste lisible et cohérent avec
  le reste de l'interface.
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel, à confirmer par Antoine que le halo doré s'affiche
  maintenant bien au survol sur tous les boutons.

## Essai : la baliste posée sur une tour KayKit (2026-08-14)

Antoine : "je veux que tu essaies de poser le modèle de la baliste sur un
modèle de 'tour — base (bleu)'. Agrandis la tour de sorte à ce que ce soit
cohérent, le modèle total peut prendre jusqu'à 3×3 cases et être toujours
dans le coin inférieur de la map." Explicitement un ESSAI ("nous allons
tenter quelque chose") — l'ancienne construction (`buildBallista()`) reste
INTACTE et exportée telle quelle, cette demande n'a fait qu'AJOUTER une
composition par-dessus.

- **`render/ballista.ts`, `buildBallistaTowerPlatform(assets)`** (nouveau) :
  charge la baliste normalement (`buildBallista()`, inchangée), récupère le
  prototype `blue_tower_base` (voir chantier bâtiments du même jour,
  `EnvironmentAssets.buildingsByName`), le met à l'échelle via
  `cloneScaledToFootprint` (même fonction que pour un bâtiment normal) dans
  une empreinte `BALLISTA_TOWER_FOOTPRINT = 2.4` cases (dans le budget
  "jusqu'à 3×3" donné par Antoine, mais pas au maximum — marge de réglage
  si le résultat paraît trop imposant une fois vu en jeu, aucun accès
  visuel de mon côté). La baliste est ensuite positionnée EN LOCAL au
  sommet de la tour (`ballista.position.set(0, towerHeight, 0)`,
  `towerHeight` mesuré via `Box3` sur la tour réellement chargée — jamais
  une valeur devinée), les deux regroupés dans un `platform: THREE.Group`
  qui ne tourne JAMAIS (`rotation.y` toujours à 0).
- **Pourquoi le code de visée/tir n'a besoin d'AUCUN changement** : comme
  `platform` ne tourne jamais, la rotation LOCALE de `ballista` (toujours
  pilotée exactement comme avant par `main.ts`, aiming en temps réel +
  orientation initiale) continue de correspondre exactement à l'orientation
  MONDE souhaitée — seule sa POSITION est désormais relative au sommet de
  la tour plutôt qu'au sol.
- **`main.ts`** : `buildBallista()` → `buildBallistaTowerPlatform(environmentAssets)`
  (nouvel appel à `loadEnvironmentAssets()`, déjà mis en cache par
  `createBoard()` — coût quasi nul). `repositionBallista()` positionne
  désormais `ballistaPlatform` (le groupe combiné) plutôt que `ballista`
  directement ; `ballista.rotation.y` reste la seule chose que le reste du
  fichier touche (visée en temps réel, orientation initiale) — vérifié par
  recherche qu'aucun site n'écrivait `ballista.position` ailleurs dans le
  fichier avant ce changement.
- **`config/constants.ts`, `PLAYER_ARROW_CORNER_INSET`** : 1 → 1.6 — la
  baliste SEULE tenait dans un retrait d'1 case depuis le coin, mais la
  PLATEFORME (empreinte 2.4×2.4, demi-emprise 1.2) déborderait du plateau
  avec l'ancien retrait ; 1.6 laisse une marge de 0.4 case jusqu'au vrai
  bord de la carte. Seul consommateur de cette constante (vérifié par
  recherche) — aucun autre système affecté.
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  chargement GÉOMÉTRIQUE réel de `building_tower_base_blue.obj` via
  `OBJLoader.parse()` sur le vrai contenu du fichier — pas une
  réimplémentation) : `cloneScaledToFootprint` appliqué au VRAI modèle
  chargé produit une échelle strictement uniforme (x=y=z), tient dans
  2.4×2.4 avec un axe touchant exactement sa limite, pied posé à y=0,
  hauteur résultante strictement positive (3.24 cases) ; la demi-emprise
  réelle (1.2) est bien couverte par le nouvel inset (1.6) avec marge. La
  construction de la baliste elle-même (`buildBallista()`, réseau FBX) n'a
  pas été re-testée — code déjà existant et déjà utilisé en production,
  non modifié par ce chantier.
- Build propre (`npm run build`). Serveur de dev toujours actif.
- **Non vérifiable de mon côté** : rendu visuel réel (la tour agrandie à
  3.24 cases de haut est-elle "cohérente" avec la baliste comme demandé,
  la baliste semble-t-elle bien posée AU SOMMET plutôt que flottante/
  enfoncée, l'ensemble reste-t-il bien dans le coin sans déborder à
  l'écran) — à confirmer par Antoine, c'est un essai explicitement nommé
  comme tel. Si le résultat ne convainc pas, revenir à `buildBallista()`
  seul (déjà intact) est un changement d'un seul appel dans `main.ts`.

## Correctif : le tir partait visuellement du sol, pas de la baliste surélevée (2026-08-14)

Antoine, après l'essai "baliste sur tour" : "le tir de la baliste semble
partir de la base de la tour, il faut ajuster cela pour que cela parte bien
de la baliste." Diagnostic : `render/playerArrowView.ts` calculait la
trajectoire visuelle du trait à partir d'une hauteur de départ FIXE
(`HEIGHT = 0.7`, pensée pour une baliste posée directement au sol) —
jamais mise à jour quand la baliste a été surélevée au sommet de la tour
(voir section précédente) : le modèle 3D de la baliste s'affichait bien en
haut, mais le trait du tir partait toujours de près du sol, juste à côté
de la base de la tour.

- **`render/playerArrowView.ts`** : `HEIGHT` (constante privée du module)
  → `DEFAULT_LAUNCH_HEIGHT` (exportée, valeur inchangée) + nouveau champ
  d'instance `launchHeight` (initialisé à `DEFAULT_LAUNCH_HEIGHT`) +
  `setLaunchHeight(height)`. Les deux usages de l'ancienne constante
  (hauteur de la trajectoire, pente pour le calcul du pitch) lisent
  désormais `this.launchHeight`. Le point d'ATTERRISSAGE reste inchangé
  (toujours ramené à 0 en fin de vol, `lerp(launchHeight, 0, t)` à t=1) —
  seul le départ est concerné, cohérent avec la demande (le tir doit
  partir de la baliste, pas nécessairement atterrir plus haut).
- **`render/ballista.ts`** : `BallistaTowerPlatform` gagne `mountHeight`
  (la hauteur du sommet de la tour, déjà calculée dans
  `buildBallistaTowerPlatform` — jamais un second calcul dupliqué).
- **`main.ts`** : `playerArrowView.setLaunchHeight(mountHeight +
  DEFAULT_LAUNCH_HEIGHT)` appelé une seule fois après la construction de la
  plateforme — la hauteur de tir REELLE devient "sommet de la tour +
  hauteur du mécanisme de la baliste au-dessus de sa propre base", au lieu
  d'ignorer complètement l'élévation de la tour.
- Build propre (`npm run build`). **Non vérifiable de mon côté** — aucun
  accès visuel, à confirmer par Antoine que le trait part désormais bien
  du sommet de la tour, à hauteur de la baliste.

## Premier "palier 2" de l'arbre de talents : Recyclage / Le temps, c'est de l'argent (2026-08-14)

Demande d'Antoine (accompagnant une capture d'écran de l'éditeur — première
confirmation visuelle réelle de plusieurs chantiers précédents : textures de
sol, arbres/rochers KayKit, catalogue de bâtiments, baliste sur tour) :
"recyclage : vendre une unité qui a moins de 50 % de son montant total de
point de vie vous rend 300 % de son cout total de base. les unitées pouvant
profiter de ce bonus sont en surbrillance jaune lors de la phase de
placement. l'temps, c'est d'largent : invoque une mine (bleu) à
l'extrémité... ce batiment generer 1 gold par seconde pour le joueurs tant
que la bataille est en cours. Egalement rajouter un amélioration dans la
boutique d'amélioration : augmente le montant de gold generer par la mine
de 0.5 gold (toutes les 3 amélioration augmente ce palier de 1,5)".

**Deux corrections en cours de route, avant tout code irréversible** :
d'abord "pardon ce sont des point de talents a jouter pour le palier 2 à la
suite de butin de guerre" (ce n'étaient pas des mécaniques toujours actives,
mais deux NOUVEAUX TALENTS de palier 2, après le fondateur "Butin de
guerre") ; puis, après une première tentative de les rendre tous les deux
librement achetables en parallèle (build annulé par Antoine avant d'aller
plus loin) : "les point de talent se suivent (et ne sont donc pas du meme
palier, il sont tout deux aux palier 2). butin de guerre doit ouvrir la
porte, sur deux chois de palier 2 soit je prend recyclage soit je prend
'ltemps c'est d'largent'" — un CHOIX EXCLUSIF entre les deux, pas deux
talents indépendants.

**Mécanisme d'exclusivité, générique (pas un champ codé en dur entre ces
deux id précis)** : `data/talents.ts`, `TalentDef.requires?: string` —
prérequis SPÉCIFIQUE en plus du talent universel. `run/metaProgress.ts`,
`canUnlockTalent` : en plus de vérifier que `requires` est bien débloqué,
refuse le talent si un AUTRE talent partageant ce MÊME `requires` est déjà
débloqué (`Object.values(TALENTS).some(sibling => sibling.requires ===
def.requires && isTalentUnlocked(...))`) — une future branche à plusieurs
choix de palier fonctionnera pareil sans code supplémentaire, tant que ses
talents partagent le même `requires`. Débloquer l'un verrouille l'autre
jusqu'à un reset complet des talents (bouton déjà existant "Réinitialiser
les talents", `resetTalentPoints`, inchangé — rembourse et efface les DEUX
également si l'un des deux avait été pris). Coûts non précisés par Antoine,
choisis par Claude (2, un cran au-dessus des fondateurs à 1) — à ajuster si
besoin. `ui/screens.ts`, `buildTalentTree` : les talents dépendants d'un
fondateur (`listDependents(founder.id)`, nouvelle fonction dans
`data/talents.ts`) s'empilent désormais SOUS lui dans la même colonne
(`.talent-tree-column`, connecteur vertical `.talent-node-tier-connector`)
— structure générique pensée pour un palier 3 futur sans changement de
architecture, juste un nouveau `requires` pointant vers un id de palier 2.

**Légende des paliers** (demande d'Antoine, arrivée juste après : "Rajoute
egalement une indication sur la droite de la fenetre arbre de talent pour
spécifier palier 1, palier II (2), palier III (3) etc.."). `data/talents.ts`,
`talentTierCount()` — calcule le nombre de paliers RÉELLEMENT présents dans
les données (parcours récursif via `listDependents`, jamais une valeur
figée : passera automatiquement à 3 le jour où un palier 3 existera).
`ui/screens.ts`, `buildTalentTierLegend()` — construit un encart texte
"Palier I (1)" à "Palier N (N)" à droite de l'arbre. **Décision explicite,
prise avant de coder** : un alignement PIXEL-PRÉCIS de chaque libellé de
palier avec sa vraie rangée dans l'arbre (CSS Grid partagé) a été envisagé
puis écarté — trop risqué à obtenir juste sans aucun accès visuel pour
vérifier le résultat. Choix retenu : un encart général simple
(`.talent-tier-legend`), pas rangée par rangée — moins ambitieux mais
beaucoup plus sûr à livrer à l'aveugle. `ui/style.css` :
`.talent-tree-wrapper` (flex, arbre + légende côte à côte),
`.screen-talents .screen-panel` élargi (820px → 950px) pour loger les deux.

**Talent "Recyclage"** (`data/talents.ts`, branche `economie`, coût 2,
`requires: 'butin_de_guerre'`) : `main.ts`, `sellUnit` — le barème normal de
vente (`KILL_REWARD`, moitié du coût catalogue) est REMPLACÉ (jamais
cumulé) par 300 % du coût d'achat EFFECTIF (`effectivePlayerUnitCost`, avec
améliorations permanentes déjà appliquées — cohérent avec le reste du
système économique) SI le talent est débloqué ET l'unité vendue est sous
50 % de ses PV maximum EFFECTIFS (`effectivePlayerUnitMaxHp`) — nouvelle
fonction partagée `isRecyclageEligible(slot)`, utilisée à la fois par
`sellUnit` et par la surbrillance. **Surbrillance jaune** : nouvel anneau
`createRecyclageRing()` (`COLORS.recyclageHighlight`, jaune franc, rayon
plus large que l'anneau de sélection bleu pour que les deux puissent
s'afficher EN MÊME TEMPS sans se chevaucher si l'unité est aussi
sélectionnée) — ajouté dans `refreshPlayerPreview()` sous chaque unité
éligible, recalculé à chaque rafraîchissement du placement (donc réagit en
temps réel à une unité qui se fait soigner/blesser, ou au moment où le
talent lui-même est débloqué).

**Talent "Le temps, c'est de l'argent"** (même branche/coût/prérequis) —
fait apparaître une MINE (bâtiment KayKit déjà catalogué, voir chantier
bâtiments : `blue_mine`/`red_mine`, 2×2 cases) dans le coin supérieur de la
zone de placement bleue, qui génère de l'or en continu tant qu'une bataille
RÉELLE est en cours.
- **`config/mapDef.ts`, `computeMineObstacle(map)`** : position calculée
  depuis les dimensions RÉELLES de la map (pas une coordonnée figée) — coin
  X opposé à celui de la baliste, à 1 case du bord ; en Z, 2 cases sous le
  bord (donc entièrement dans la moitié bleue, `cornerZ ≥ 0`), miroir
  approximatif de la position de la baliste côté Z. **Position non confirmée
  par une photo exploitable de mon côté** ("voir la premieres photo" —
  l'image fournie par Antoine dans son message ne permettait pas de lire une
  position précise à l'échelle de la grille) — réglable en un seul endroit
  si le résultat ne correspond pas une fois vu en jeu.
- **`render/obstacleFactory.ts`, `buildObstacleMesh`** (déjà existant,
  partagé jeu/éditeur) réutilisé tel quel — `kind: 'building'` produit déjà
  le bon rendu via `createBuildingObstacle`, aucun changement nécessaire
  dans le pipeline de rendu.
- **`main.ts`** : `mineView` construit UNE SEULE FOIS au démarrage (position
  fixe pour toute la session, comme la baliste), `visible = false` par
  défaut, corrigé par `refreshMineVisibility()` (appelée au démarrage puis à
  chaque `startPlacement()` — reflète un talent débloqué en cours de run
  sans attendre un rechargement de page). **Collision fusionnée à DEUX
  endroits, jamais un seul** (même principe documenté pour tout obstacle,
  voir plus haut "Obstacles") : `activeMineObstacles()` (liste de 0 ou 1
  `ObstacleDef`, selon le talent) est ajoutée à `currentMap.obstacles` à la
  fois dans `isValidPlacementTile` (empêche de poser une unité DANS la mine
  pendant le placement) et dans `onValidatePlacement` via un NOUVEL appel à
  `world.setMap(...)` (jusque-là, `onValidatePlacement` ne rappelait jamais
  `world.setMap` — découverte faite en auditant le code avant d'écrire quoi
  que ce soit ; sans ce nouvel appel, la mine n'aurait jamais bloqué ni
  mouvement ni ligne de tir pendant une vraie bataille). **Jamais injectée
  dans "Tester le scénario"** (`testScenario`/`returnToEditorAfterTest`,
  `mineView.visible = false` explicite pendant le test) : une carte
  d'éditeur n'a aucun lien avec la progression d'une run réelle, même
  principe déjà établi pour le buff de difficulté par vague.
- **Revenu passif** : accru dans le PAS DE SIMULATION FIXE (`loop`,
  callback `onStep`, paramètre `dt`) plutôt que dans le rendu à framerate
  variable — même principe déjà en place pour le reste des systèmes de jeu.
  Gate stricte : `inBattlePhase() && !inTestMode && isTalentActive('temps_argent')`
  — jamais pendant le placement, la boutique, ou "Tester le scénario",
  conforme à "tant que la bataille est en cours". `currentRun.gold` est
  arrondi au dixième le plus proche à chaque tick
  (`Math.round(... * 10) / 10`) : sans cet arrondi, l'accumulation en petits
  pas de `dt` aurait fini par afficher du bruit flottant brut dans le HUD
  (`GoldHud.update` fait `String(gold)` sans aucun formatage) — décision
  prise en amont plutôt qu'après coup, aucun bug constaté mais un risque
  identifié par lecture de code.
- **Amélioration permanente "Mine"** (boutique d'amélioration, menu titre) :
  `data/mineUpgrade.ts` (`MineUpgradeDef`, même famille que
  `BallistaUpgradeDef`/`HealScrollUpgradeDef` — `RuneCostDef`, prix qui
  double à chaque achat, départ à 10 runes comme les autres améliorations
  déjà existantes), `run/mineUpgradeEffects.ts` (formules : bonus ADDITIF
  `+0.5 or/seconde` par achat, PLUS `+1,5 or/seconde` supplémentaire tous
  les 3 achats — lu littéralement sur la demande d'Antoine, même principe
  que le palier de dégâts déjà existant sur la Baliste). `ui/screens.ts`,
  nouvelle carte `buildMineUpgradeCard` — **masquée** tant que le talent
  "Le temps, c'est de l'argent" n'est pas débloqué (une amélioration sur un
  bâtiment qui n'existe pas encore n'a pas de sens à afficher), même
  convention que le Mage masqué en boutique de run avant la vague 8.
  `main.ts`, `onPurchaseUnitUpgrade` étendu pour dispatcher vers
  `MINE_UPGRADE` en plus de Ballista/HealScroll/IceNova déjà existants.

Vérifié en headless (`npx tsx`, script temporaire supprimé après usage, 33
vérifications, imports des VRAIS modules) : choix exclusif Recyclage/Le
temps c'est de l'argent (l'un verrouille l'autre, reset des talents rend le
choix à nouveau possible avec remboursement exact), les 4 AUTRES fondateurs
restent librement cumulables entre eux (la règle d'exclusivité ne s'applique
qu'aux talents partageant un `requires`, jamais aux fondateurs eux-mêmes),
position/emprise/rotation de la mine (`computeMineObstacle`, 2×2, dans les
limites du plateau, moitié bleue), formule de revenu de la mine à plusieurs
niveaux d'amélioration (paliers tous les 3 achats confirmés), formule de
revente Recyclage (300 % du coût effectif) et seuil de 50 % des PV
(condition stricte `<`, pile 50 % non éligible). Build propre
(`npm run build`) après chaque étape intermédiaire.

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** : position
exacte de la mine sur le plateau (photo de référence pas assez précise pour
confirmer à l'échelle de la grille), lisibilité de la surbrillance jaune
(coexistence avec l'anneau de sélection bleu, notamment), mise en page de la
nouvelle légende de paliers à droite de l'arbre, apparence de la carte
boutique Mine. À confirmer et ajuster par Antoine en jeu réel.

## Nouveau modèle de projectile pour la flèche du joueur (2026-08-14)

Demande d'Antoine : "ici tu trouvera un modele pour mettre à jour le
projectile de la baliste, remplace l'ancien par celui ci" (dossier
`C:\Users\Antoine\Desktop\Projet prodolphe\arrow`) — remplace le trait
procédural en boîtes (`render/playerArrowView.ts`, `buildArrow`) qui rendait
jusqu'ici la flèche du JOUEUR (pas les flèches d'archer, purement
cosmétiques et gérées séparément par `render/projectiles.ts`, non
concernées).

- **Contenu du dossier** : un seul fichier, `arrow_bow.obj` ("Adventurers
  2.0 Accessories Export", Blender) — **sans `.mtl` fourni** malgré la ligne
  `mtllib arrow_bow.mtl` dans le fichier (référence vers un fichier absent),
  exactement la même situation déjà rencontrée pour l'ancienne baliste
  `.obj` : ignorée, un matériau neutre est appliqué à la main. Copié tel
  quel dans `public/models/arrow/arrow_bow.obj`.
- **Un seul mesh, une seule zone de matériau** (`usemtl ranger` unique pour
  tout le maillage, vérifié par lecture directe du fichier ET confirmé en
  headless) — impossible de recolorer pointe/empennage séparément comme le
  faisait l'ancien modèle en boîtes (accent doré sur l'empennage
  uniquement) sans le `.mtl` d'origine. Teinte uniforme retenue à la place :
  `COLORS.playerArrowAccent` (le même doré), pour garder le même objectif
  ("l'empennage/accent doré... doit se distinguer du tir automatique des
  archers") même si appliqué à toute la flèche plutôt qu'à un seul accent.
- **Orientation — MESURÉE, pas devinée** (script jetable avec un vrai
  `OBJLoader`, supprimé après usage) : la pointe (sommet isolé le plus
  éloigné, Z ≈ +0.620) est au Z le plus POSITIF, l'empennage (les sommets
  les plus larges) au Z le plus NÉGATIF (jusqu'à -0.641) — l'INVERSE de la
  convention déjà établie dans ce fichier et dans tout le reste du rendu
  (pointe à l'ancien z=-0.5, donc "avant" = -Z local, voir
  `UnitViews.computeFacing`). Corrigé par un `facingFix` (`rotation.y = π`)
  posé sur un groupe ENFANT du modèle cloné, **jamais sur `flyingMesh`
  lui-même** : `sync()` réécrit entièrement sa rotation à chaque frame
  (`.rotation.set(0, yaw, 0)` puis `.rotateX(pitch)`) — exactement le même
  piège déjà documenté et déjà rencontré pour le Mage/Fantassin/Archer
  riggés (pipeline d'export Blender similaire, même défaut d'orientation
  native).
- **Échelle — mesurée aussi** : longueur native ~1.2615 unité sur Z (pointe
  à +0.620, aile d'empennage la plus reculée à -0.641), contre ~1.03 pour
  l'ancien modèle procédural (déjà bien intégré à l'échelle du jeu, jamais
  critiquée par Antoine). `ARROW_MODEL_SCALE = 0.82` recalibré sur cette
  même longueur (1.03 / 1.2615 ≈ 0.8165) plutôt que l'échelle native — à
  ajuster si la flèche paraît trop grande/petite une fois vue en jeu.
- **`render/playerArrowView.ts`** : `preloadPlayerArrowModel()` (nouveau,
  exporté) charge le `.obj`, construit le matériau, applique l'échelle — UNE
  SEULE FOIS au démarrage, comme `preloadMageModel`/`preloadFantassinModel`/
  `preloadArcherModel`. `buildArrow()` reste SYNCHRONE (contrainte déjà
  établie : appelé au premier tick d'un nouveau vol) : clone le prototype
  déjà préchargé (`arrowPrototype.clone(true)`, un simple mesh statique sans
  squelette — pas besoin de `SkeletonUtils.clone`) et pose le `facingFix` sur
  le clone. Dégradation propre si le fichier est introuvable
  (`arrowPrototype` reste `null`, `buildArrow()` retourne un groupe vide
  plutôt que de faire planter le jeu, erreur juste loguée en console) — même
  principe que le reste du rendu face à un asset manquant.
- **`main.ts`** : `preloadPlayerArrowModel()` ajouté au `Promise.all([...])`
  du démarrage, aux côtés des 3 autres préchargements déjà existants.
- **Ancien code retiré** : `buildArrow()` procédural (4 boîtes) et ses
  fonctions utilitaires `box()`/`mat()` (plus aucun appelant après ce
  changement) supprimés entièrement, pas laissés en commentaire.
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage, 8
  vérifications, VRAI `OBJLoader`/`THREE.Group`/composition de rotation, pas
  une réimplémentation) : sommets de pointe/empennage bien repérés aux
  extrémités attendues ; après `facingFix` + un yaw simulant un tir vers -Z,
  la pointe finit bien du côté Z NÉGATIF (avant) et l'empennage du côté Z
  POSITIF (arrière), la pointe strictement plus avancée que l'empennage ;
  un second yaw simulant un tir vers +X fait bien pivoter la pointe vers +X
  sans casser le `facingFix` de l'enfant (confirme que la composition
  parent/enfant fonctionne pour n'importe quelle direction de tir, pas
  seulement -Z) ; longueur totale après mise à l'échelle ≈ 1.03 (proche de
  l'ancien modèle, à 0.03 près) ; confirmation qu'un seul mesh/une seule
  zone de matériau existe dans le fichier. Build propre (`npm run build`).
- **Non vérifiable de mon côté — aucun accès visuel au rendu réel** :
  apparence réelle du modèle en jeu (silhouette, lisibilité de la teinte
  dorée uniforme sans distinction pointe/empennage, échelle définitive,
  fluidité de la trajectoire courbe déjà existante appliquée à ce nouveau
  modèle) — à confirmer par Antoine dans le navigateur ; si la taille ou la
  teinte ne convainc pas, `ARROW_MODEL_SCALE`/la couleur du matériau sont
  les deux seuls réglages à ajuster, sans toucher au reste du pipeline.

## Bouton de debug "+1 point de talent" (2026-08-14)

Demande explicite d'Antoine, pour tester l'arbre de talents sans dépendre
des vrais paliers de vague : "rajoute moi un bouton pour m'auto attribuer
un point de talent (ce bouton sera retirer c'est juste pour tester les
talents)". **Temporaire, explicitement annoncé comme tel par Antoine** — à
retirer sur sa demande, pas avant.

- `ui/screens.ts` : bouton "+1 point de talent (debug)" sur l'écran Arbre de
  talents, entre l'arbre et "Réinitialiser les talents" — style dédié
  `.talent-debug-button` (bordure en tirets, teinte violette) pour ne
  jamais se confondre avec un bouton de gameplay réel.
  `ScreenHandlers.onDebugGrantTalentPoint` (nouveau).
- `main.ts` : le handler incrémente `metaProgress.talentPoints` de 1,
  sauvegarde IMMÉDIATEMENT (même motif qu'un achat/reset de talent) et
  rafraîchit l'écran (`screens.refreshTalents`). Aucun lien avec une run ou
  un palier de vague — un simple raccourci de test.
- **À retirer intégralement quand Antoine aura fini de tester** : le
  handler dans `main.ts`, le bouton + le champ d'interface dans
  `ui/screens.ts`, et le style `.talent-debug-button` dans `ui/style.css` —
  les 3 sites sont marqués "A RETIRER" dans leurs commentaires respectifs.
- Build propre (`npm run build`). Pas de vérification headless nécessaire
  (un seul incrément trivial, déjà couvert par les tests existants de
  `talentPoints`/`saveMetaProgress`). **Non vérifiable de mon côté** :
  apparence réelle du bouton — à confirmer par Antoine.

## Correctif : la mine ne générait en réalité AUCUN or (2026-08-14)

Antoine, en testant : "tu es sûr que la mine génère un gold par seconde ?
en tout cas il ne s'affiche pas en direct." Un vrai bug, pas juste un
problème d'affichage — confirmé par calcul puis par script headless.

**Cause** : la boucle de jeu (`main.ts`, callback `onStep` du `Loop`)
accrue l'or de la mine par PAS DE SIMULATION FIXE (`dt` = `SIM_STEP` ≈
1/30s, voir `core/loop.ts`). À un taux de 1 or/seconde, ça représente
~0.033 or par tick. Le code d'origine faisait
`currentRun.gold = Math.round((currentRun.gold + rate * dt) * 10) / 10` —
un ARRONDI AU DIXIÈME LE PLUS PROCHE À CHAQUE TICK, pensé pour éviter du
bruit flottant dans le HUD (`GoldHud`, `String(gold)` brut, sans
formatage). Mais 0.033 arrondi au dixième le plus proche vaut 0 : chaque
tick effaçait intégralement le petit gain qu'il venait d'ajouter, avant
qu'il n'ait jamais eu la moindre chance de s'accumuler — la mine ne
générait donc EN RÉALITÉ aucun or, quelle que soit la durée de la bataille
(vérifié en headless : `simulateOldBuggy(1 or/s, 10s)` = 0 très exactement).

- **Corrigé** : `main.ts`, nouveau `mineIncomeAccumulator` (déclaré près de
  `rewardedEnemyDeaths`) — le montant BRUT s'accumule d'abord dans cette
  variable à CHAQUE tick, et n'est versé dans `currentRun.gold` que par
  PALIERS DE 0.1 dès qu'un palier est atteint (`Math.floor(acc * 10 +
  1e-9)`, la petite marge `1e-9` absorbe le bruit flottant qui pourrait
  sinon faire manquer un palier tout juste atteint) — le reste, toujours
  sous 0.1, reste dans l'accumulateur pour les ticks suivants, jamais
  perdu. `currentRun.gold` ne reçoit donc toujours que des multiples exacts
  de 0.1, donc le HUD n'affiche toujours aucun bruit flottant — l'objectif
  d'origine de l'arrondi est préservé, sans plus jamais effacer le gain
  réel. Remis à 0 aux mêmes 4 sites que `rewardedEnemyDeaths.clear()`
  (`onValidatePlacement`, `returnToEditorAfterTest`, le raccourci de dev
  "Tester le scénario"/`setupTestBattle`, `quitToMenu`).
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  reproduisant EXACTEMENT la formule de `main.ts`) : l'ancienne logique
  confirmée à 0 or après 10 secondes à 1 or/s (bug reproduit fidèlement) ;
  la nouvelle logique donne ~10 or après 10s au même taux, au moins 0.8 or
  dès la première seconde (l'or apparaît bien "en direct", plus de blocage
  initial), et ~150 or après 60s à 2.5 or/s (taux amélioré, palier
  d'amélioration inclus). Build propre.
- **Non vérifiable de mon côté** : confirmation visuelle que l'or de la
  mine s'incrémente désormais bien à l'écran en temps réel — à confirmer
  par Antoine.

## Talent "Mitraillette" — Précision, palier 2 (2026-08-14)

Demande complète d'Antoine (~34 sections) : un talent qui (1) multiplie par
3 le TOTAL des bonus de vitesse d'attaque de la Baliste (jamais la cadence
de base) et (2) fait tirer 3 carreaux simultanés sous un seul cooldown, les
2 secondaires visant les 2 ennemis les plus proches du curseur, position
verrouillée au moment du tir. Audit préalable demandé explicitement avant
tout code.

**Découverte clé de l'audit** : la flèche du joueur n'est PAS cosmétique
comme celles des archers (`render/projectiles.ts`) — c'est un vol RÉELLEMENT
simulé (`sim/playerArrow.ts`), et l'état d'origine (`PlayerArrowState.flight:
ArrowFlight | null`) ne supportait qu'UN SEUL vol à la fois. Faire tirer 3
carreaux a donc demandé de généraliser cet état à un tableau de vols
(`flights: ArrowFlight[]`), pas seulement un effet visuel — fait à la
racine (simulation + rendu), jamais bricolé en surface.

**Effet 1 — vitesse d'attaque** : `main.ts`, nouvelle
`totalBallistaAttackSpeedBonus()` — SOURCE UNIQUE qui additionne tous les
bonus de cadence (talent "Tir rapide" + amélioration boutique "Baliste" +
tout futur bonus), remplace le calcul auparavant fait en ligne dans
`effectivePlayerArrowCooldown()`. Ce total est ensuite multiplié par
`TALENT_MACHINE_GUN_ATTACK_SPEED_MULTIPLIER` (3, `config/constants.ts`)
UNIQUEMENT si Mitraillette est débloqué, JAMAIS la cadence de base
(`PLAYER_ARROW_COOLDOWN`) elle-même — une seule étape claire (collecter →
additionner → multiplier si besoin → diviser), aucune double application
individuelle des bonus. À 0 bonus actif, 0 × 3 = 0 : aucune régression.

**Effet 2 — triple carreau** :
- `sim/playerArrow.ts` réécrit : `fireArrow()` → `fireArrowVolley(state,
  shots: ArrowShotSpec[], cooldown?, speed?)` — pousse 1 à N vols
  d'un coup sous UN SEUL cooldown partagé (refuse si le cooldown n'est pas
  écoulé OU si des carreaux d'une volée précédente sont encore en vol,
  même garde-fou qu'avant, juste étendu à une VOLÉE entière). `stepPlayerArrow`
  résout maintenant CHAQUE vol indépendamment (durées potentiellement
  différentes selon la distance de chaque cible) et renvoie une LISTE
  d'événements (0 à N) au lieu d'un seul. **Résolution des secondaires
  RÉUTILISE EXACTEMENT la même logique que le carreau principal** ("ennemi
  vivant le plus proche du POINT VISÉ à l'arrivée, dans
  PLAYER_ARROW_HIT_RADIUS") — donc "position verrouillée, pas de tracking"
  découle naturellement de cette réutilisation, sans code de résolution
  séparé pour les secondaires : si la cible verrouillée a bougé d'ici là,
  le carreau peut simplement la manquer, exactement comme le carreau
  principal peut déjà manquer sa cible aujourd'hui.
- `sim/world.ts` : `World.fireArrowAt` → `World.fireArrowVolley(shots,
  cooldown?, speed?)` ; `World.playerArrowEvent: PlayerArrowEvent | null` →
  `playerArrowEvents: PlayerArrowEvent[]`.
- `render/playerArrowView.ts` : `flyingMesh: THREE.Group | null` →
  `flyingMeshesByFlight: Map<ArrowFlight, THREE.Group>` — un mesh par vol
  actif, clé = l'objet `ArrowFlight` lui-même (identité d'objet stable tant
  que le vol n'est pas résolu, la simulation ne donne pas d'id à un vol).
  `sync()` détecte les vols disparus (résolus) par différence d'ensemble et
  bascule leur mesh dans le pool `stuckMeshes[]` déjà existant (2026-08-13,
  "dès que j'en tire une autre la précédente disparaît") — même mécanisme,
  juste généralisé à plusieurs vols simultanés. Toute la trajectoire
  (arc, plongée finale, pitch) reste EXACTEMENT le même calcul par vol,
  aucun changement de "feeling" pour le carreau principal.
- `main.ts` :
  - `findMachineGunSecondaryTargets(cursorX, cursorZ)` — filtre
    `world.entities` par camp adverse/vivant/`MACHINE_GUN_SECONDARY_TARGET_RADIUS`
    (3 cases, `config/constants.ts` — choisi entre `HEAL_TARGET_RADIUS` (2)
    et l'aggro de l'archer (6)), trie par distance croissante au CURSEUR
    (jamais à la Baliste) puis id croissant (déterministe, jamais aléatoire),
    garde les 2 premiers — toujours 2 entités DISTINCTES par construction
    (un tableau d'entités ne contient pas de doublons). Simple filtre/tri
    linéaire plutôt que la `SpatialGrid` du projet : cette recherche ne
    tourne qu'UNE FOIS PAR TIR (cooldown de plusieurs secondes), jamais par
    tick/par entité comme la séparation/le ciblage automatique qui
    justifient la grille — construire une grille pour une seule requête
    coûterait plus cher qu'un scan direct.
  - `buildBallistaVolleyShots(originX, originZ, cursorX, cursorZ)` — SOURCE
    UNIQUE de "combien de carreaux et vers où" (pas de logique dispersée
    entre input/rendu/combat/talents). Sans Mitraillette : 1 seul carreau
    vers le curseur, comportement STRICTEMENT identique à avant. Avec :
    le principal vise toujours le curseur (inchangé) ; chaque slot
    secondaire vise l'ennemi correspondant s'il existe, sinon un petit
    décalage latéral autour du curseur (`MACHINE_GUN_FALLBACK_TARGET_OFFSET`,
    perpendiculaire à l'axe de tir) — jamais la même cible deux fois, jamais
    un point identique au principal. Léger décalage latéral aussi sur
    l'ORIGINE des 2 carreaux secondaires (`MACHINE_GUN_ORIGIN_OFFSET`,
    purement visuel) pour qu'ils se lisent comme partant de la même arme
    sans être parfaitement superposés au départ.
  - `fireArrowIfReady()` réécrit : un seul appel à
    `world.fireArrowVolley(shots, ...)` avec les degâts EFFECTIFS
    (`effectivePlayerArrowDamage()`) appliqués IDENTIQUEMENT aux 3 carreaux
    (jamais réduits/partagés) — `playBallistaShot(ballista)` toujours
    déclenché UNE SEULE FOIS par volée, jamais par carreau. Compatible tel
    quel avec le clic maintenu (`attemptAutoFire`, Tir rapide) : c'est
    toujours `fireArrowIfReady()` qui reste l'unique point d'entrée, le
    garde-fou cooldown/vols-en-cours vit entièrement dans
    `World.fireArrowVolley`.
- **Son** : le système audio est actuellement ENTIÈREMENT désactivé
  (décision d'Antoine, 2026-08-13) — rien à faire côté triple-son pour
  l'instant, pas un oubli.
- `data/talents.ts` : `mitraillette` — branche `precision`,
  `requires: 'tir_rapide'`, coût 2 (non précisé par Antoine, choisi par
  Claude, même convention que le palier 2 Économie existant). AUCUN
  changement d'UI nécessaire : le mécanisme générique de palier 2
  (`listDependents`/`.talent-tree-column`, voir la section Recyclage/Le
  temps c'est de l'argent plus haut) empile déjà automatiquement tout
  talent avec `requires` sous son parent — Mitraillette est le SEUL talent
  avec `requires: 'tir_rapide'`, donc aucune exclusivité de fratrie ne
  s'applique (achetable indépendamment de tout le reste une fois Tir rapide
  débloqué).

Vérifié en headless (`npx tsx`, script temporaire supprimé après usage, 45
vérifications, imports des VRAIS modules + `World` réel) :
- **Formule de cadence** : 0 bonus → cadence de base inchangée, y compris
  avec Mitraillette (0×3=0) ; exemple exact d'Antoine (Baliste niveau 3 =
  +60%, avec Mitraillette → +180%, cadence = base/2.80) reproduit à
  l'identique ; combo Tir rapide + Baliste niveau 3 (total 120%) ×
  Mitraillette → base/4.60 ; la MÊME combo SANS Mitraillette reste à
  base/2.20 (jamais triplée par accident) ; confirmation explicite que la
  cadence de BASE elle-même n'est jamais multipliée par 3.
- **Talent** : refusé sans `or_depart`/`tir_rapide`, débloqué une fois les
  deux acquis, les 4 autres fondateurs restent librement cumulables avec
  Mitraillette (aucune exclusivité parasite).
- **Volée via un vrai `World`** : 3 vols créés d'un coup sous un seul
  cooldown, une 2ᵉ volée refusée tant que la 1ʳᵉ n'est pas résolue (pas de
  double volée/double cooldown), les 3 vols (durées différentes) se
  résolvent chacun sur SA propre cible sans se marcher dessus.
- **Pas de tracking** : une cible dont la position est verrouillée puis
  déplacée loin AVANT l'arrivée du carreau n'est PAS touchée (piège de test
  rencontré en écrivant cette vérification : les positions de test doivent
  rester dans les limites du plateau et hors des obstacles par défaut,
  sinon `resolveObstacleCollisions`/le clamp de bords redéplace les entités
  et fausse le test — corrigé en isolant `world.obstacles = []` et des
  coordonnées sûres, pas un bug de l'implémentation).
- **Ciblage secondaire** : exactement 2 cibles max, triées par distance,
  ennemis hors rayon/alliés/morts jamais sélectionnés.
- **Construction des carreaux** : sans Mitraillette, 1 seul carreau vers le
  curseur exact (aucune régression) ; avec 2 ennemis proches, les 2
  secondaires visent bien A et B distinctement ; avec 1 seul ennemi, le 2ᵉ
  secondaire NE reprend PAS la même cible et retombe près du curseur ; avec
  0 ennemi, les 2 secondaires restent proches du curseur (dispersion
  faible) et ne se superposent pas entre eux.

Build propre (`npm run build`, `tsc --noEmit`) après chaque étape.

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** : lecture
du triple tir à l'écran (les 3 carreaux se voient-ils bien partir de la
Baliste), ressenti de la dispersion des tirs secondaires, mise en page de
la nouvelle carte de talent dans l'arbre — à confirmer par Antoine en jeu.

## Coloration en 3 zones du carreau de la Baliste (2026-08-14)

Demande d'Antoine : "l'empennage doit être bleu, la pointe grise et le bois
au milieu marron clair." Rappel du contexte (voir la section "Nouveau
modèle de projectile" plus haut) : le modèle `.obj` fourni n'a qu'UNE SEULE
zone de matériau (`usemtl ranger` unique pour tout le maillage) — impossible
de recolorer par pièce via 3 matériaux sans découper la géométrie en groupes
de faces. Résolu par **coloration PAR SOMMET** (`vertexColors: true`) à la
place : chaque sommet du maillage est classé pointe/bois/empennage selon sa
coordonnée Z locale, un `THREE.BufferAttribute('color')` est écrit UNE SEULE
FOIS sur la géométrie PARTAGÉE (avant tout clonage par `buildArrow()`), donc
chaque carreau tiré hérite de la même coloration sans recalcul.

- `config/constants.ts`, `COLORS.arrowWood` (nouveau, `0xc19a6b`, marron
  clair dédié) — la pointe réutilise `COLORS.steel` (métal neutre déjà
  établi ailleurs dans le jeu) et l'empennage réutilise `COLORS.playerZone`
  (bleu d'équipe déjà établi), pas de nouvelles teintes pour ces deux-là.
- `render/playerArrowView.ts`, `applyArrowZoneColors(mesh)` — seuils de zone
  (`ARROW_TIP_Z_THRESHOLD`/`ARROW_FLETCHING_Z_THRESHOLD`) MESURÉS
  directement dans le fichier (pas devinés) : le fût cylindrique étroit va
  d'un anneau à z≈-0.4605 (jonction empennage) à un anneau à z≈+0.4806
  (jonction pointe) — ce sont les deux bornes réelles du bois.
  `preloadPlayerArrowModel()` bascule le matériau en `vertexColors: true`
  (plus de teinte unique `COLORS.playerArrowAccent` — la distinction "flèche
  du joueur vs tir d'archer" repose désormais sur les 3 couleurs elles-mêmes,
  pas sur un accent doré isolé).
- **Piège rencontré et corrigé pendant la vérification headless** : un
  premier seuil de pointe à 0.47 tombait légèrement EN DEÇÀ de l'anneau réel
  à 0.4806, classant cet anneau comme POINTE au lieu de BOIS — la zone bois
  n'avait alors plus qu'UNE SEULE borne (tout le fût dégradait continûment
  du marron vers le gris, sans section brune distincte au milieu, contraire
  à "le bois au milieu"). Corrigé à 0.49 (strictement entre les deux
  anneaux réels 0.4806 et 0.5013) — une erreur qui n'aurait jamais été
  détectée sans vérifier la vraie géométrie du fichier plutôt que de
  supposer un seuil "raisonnable".
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  vrai `OBJLoader` sur le fichier réel) : la zone bois couvre bien tout
  l'espace entre ses deux vraies bornes (~0.94 de long) et reste la PLUS
  GRANDE des 3 zones en longueur (pas en nombre de sommets — un cylindre
  long peut avoir moins de sommets qu'une pointe/un empennage plus
  complexes, piège de mesure évité en vérifiant l'étendue en Z plutôt que
  le compte de sommets) ; pointe et empennage ont chacun au moins quelques
  sommets ; les 3 couleurs sont bien distinctes entre elles. Build propre.
- **Non vérifiable de mon côté** : rendu visuel réel des 3 couleurs sur le
  modèle (l'interpolation par sommet peut créer un léger dégradé aux
  frontières de zone plutôt qu'une coupure nette, selon la densité de
  triangles à ces endroits précis) — à confirmer par Antoine en jeu ; les
  3 couleurs elles-mêmes sont ajustables en un seul endroit
  (`COLORS.steel`/`arrowWood`/`playerZone`) sans toucher au reste du
  pipeline.

## Aura de particules pour le talent "Recyclage" (2026-08-14)

Antoine : "on ne voit vraiment pas quand un soldat peut être recyclé,
rajoute un halo jaune grâce au vfx précédemment utilisé... une aura jaune
grâce à des particules, n'hésite pas, tu as tendance à limiter sur les
effets." L'ancien indicateur (`createRecyclageRing`, un simple anneau plat
`RingGeometry` de couleur unie, enfant statique du mesh de l'unité) est
**retiré entièrement**, remplacé par un effet continu construit avec les
mêmes textures VFX (Kenney "Particle Pack") déjà utilisées pour le
parchemin de soin/le Blizzard.

- **`render/recyclageAura.ts`** (nouveau), `RecyclageAuraView` — trois
  couches superposées, toutes teintées `COLORS.recyclageHighlight` (jaune) :
  une lueur au sol (`circle_05.png`, fondu additif) qui PULSE en continu ;
  un anneau ouvrage (`magic_02.png`, même texture que le cercle magique du
  parchemin de soin) qui tourne lentement ; une couronne de 8 particules
  (`star_04.png`) qui ORBITENT autour de l'unité à des hauteurs et rayons
  légèrement aléatoires (bobbing vertical en plus de la rotation, scintillement
  d'opacité) — c'est l'élément le plus "vivant", pensé pour attirer l'œil
  bien plus que l'ancien anneau statique.
- **Contrairement à tous les autres VFX du jeu** (déclenchés une fois, courte
  durée — flash de la Boule de feu, impact de la Nova de glace...), celui-ci
  est **PERSISTANT** : `sync(slots, dt)` reçoit à CHAQUE FRAME l'ensemble
  courant des unités éligibles (recalculé depuis `placementSlots` +
  `isRecyclageEligible`, jamais mis en cache) et fait la différence avec les
  auras déjà actives — crée celles qui manquent, retire celles dont l'unité
  n'est plus éligible (soignée au-dessus de 50%, vendue, talent pas
  débloqué...), anime toutes les autres. `key` = index dans `placementSlots`
  (cohérent avec le reste du code de placement, déjà aligné par index).
  Passer un tableau VIDE (hors phase de placement, géré dans la boucle de
  rendu de `main.ts`) vide l'ensemble des auras SANS site de nettoyage
  séparé à maintenir à chaque transition de phase — plus simple et plus sûr
  qu'un `clear()` à dupliquer aux 5 endroits qui appellent déjà
  `world.clear()`.
- `main.ts` : `recyclageAuraView` instancié/ajouté à la scène comme les
  autres vues VFX ; câblé dans le même bloc `if (inPlacementPhase)` que
  `combatOverlay.syncPlacement` (barres de PV pendant le placement, motif
  déjà établi) — branche `else` qui appelle `sync([], realDt)` pour le
  nettoyage automatique décrit ci-dessus. `createRecyclageRing()` et son
  appel dans `refreshPlayerPreview()` supprimés (code mort, pas laissés en
  commentaire).
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  VRAIE classe `RecyclageAuraView` — un mock minimal de `document` a été
  nécessaire pour que `THREE.TextureLoader` puisse construire un `<img>`
  sans planter en Node pur, aucune autre substitution) : création d'une
  aura par clé nouvellement éligible, aucune recréation tant que la clé
  reste éligible (même instance d'objet réutilisée, pas de flicker),
  retrait propre d'une clé qui redevient inéligible sans toucher aux
  autres, suivi de position au déplacement, particules/anneau qui animent
  réellement dans le temps (pas figés), liste vide qui vide tout, `clear()`
  explicite fonctionnel. 10/10 vérifications. Build propre.
- **Non vérifiable de mon côté** : rendu visuel réel (lisibilité de l'aura
  à la caméra de jeu, intensité du pulse/glow, si "n'hésite pas" est
  suffisamment respecté ou s'il faut encore amplifier) — à confirmer par
  Antoine ; les 3 paramètres les plus probables à retoucher si besoin sont
  `PARTICLE_COUNT`, `BASE_RADIUS` et les opacités de base dans
  `render/recyclageAura.ts`.

## Refonte visuelle de l'arbre de talents : un palier = une ligne (2026-08-14)

Demande complète d'Antoine (~28 sections) : la disposition de l'écran Arbre
de talents ne correspondait pas à ce qu'il voulait — "Le temps, c'est de
l'argent" semblait descendre de "Recyclage" dans une même colonne verticale,
alors que les deux sont des enfants indépendants de "Butin de guerre".

**Pourquoi c'était affiché ainsi (diagnostic avant tout code)** : la donnée
elle-même était déjà CORRECTE (`data/talents.ts` : `recyclage.requires ===
'butin_de_guerre'` ET `temps_argent.requires === 'butin_de_guerre'` — les
deux pointent bien directement vers Butin de guerre, jamais l'un vers
l'autre). Le problème était PUREMENT visuel : `ui/screens.ts`,
`buildTalentTree` construisait une COLONNE PAR BRANCHE (`.talent-tree-column`)
et empilait TOUS les dépendants d'un fondateur les uns SOUS LES AUTRES dans
cette même colonne, sans jamais tenir compte du palier réel — Recyclage et
Le temps, c'est de l'argent (tous deux branche `economie`) atterrissaient
donc l'un sous l'autre dans la colonne "économie", au lieu d'être posés côte
à côte. Aucune correction de donnée n'était donc nécessaire (contrairement à
l'exception envisagée section 20 de la demande) — seul le rendu changeait.

**Principe du nouveau layout : Y = palier, X = ordre de lecture, jamais
l'inverse.**

- **`data/talents.ts`** : nouvelle `talentTier(id)` — calcule le palier d'un
  talent en REMONTANT sa chaîne `requires` (fondateur sans `requires` = 1,
  dépendant = palier du parent + 1), plutôt qu'un champ `tier` stocké à la
  main sur chaque talent (décision : la chaîne `requires` reste l'UNIQUE
  source de vérité, aucun risque qu'un `tier` explicite diverge un jour de
  la vraie hiérarchie de prérequis — Antoine avait explicitement autorisé
  cette approche : "je ne demande pas nécessairement de changer tout le
  modèle de données si les relations existent déjà proprement"). Nouvelle
  `talentsByTier()` : regroupe TOUS les talents par palier, dans un ordre de
  lecture stable (palier 1 = les fondateurs dans `TALENT_BRANCH_ORDER` ;
  palier 2 = les dépendants directs des talents du palier 1, dans le MÊME
  ordre que leurs parents — donc les enfants d'un même parent restent
  groupés côte à côte, ex. Recyclage+Le temps avant Mitraillette puisque
  Butin de guerre précède Tir rapide dans l'ordre des branches). Un futur
  talent de palier 3 (dont `requires` pointe vers un talent de palier 2)
  apparaît automatiquement dans un 3ᵉ tableau, sans changement de code.
  `talentTierCount()` réimplémentée par-dessus (`talentsByTier().length`).
- **`ui/screens.ts`, `buildTalentTree`** entièrement réécrite : plus de
  colonnes par branche — une `.talent-tree-root-row` (le talent universel
  seul, centré) puis UNE `.talent-tree-tier-row` PAR PALIER (`talentsByTier()`),
  chaque ligne un simple flex-row `flex-wrap: nowrap` (jamais de retour à la
  ligne au sein d'un même palier, demande explicite) contenant tous les
  talents de ce palier côte à côte.
- **Libellés "Palier N"** : `ui/screens.ts` construit un `<div class="talent-tier-row-label">`
  par ligne, mais les place dans une colonne SÉPARÉE (`.talent-tree-tier-labels`)
  HORS de la zone qui défile horizontalement (`.talent-tree-scroll`) — reste
  donc visible même si l'utilisateur fait défiler une ligne très large
  (demande explicite section 24). Ancien encadré flottant "PALIERS" (`buildTalentTierLegend`,
  `.talent-tier-legend*`) supprimé entièrement, les deux systèmes ne
  coexistent jamais.
- **Connecteurs SVG mesurés depuis les VRAIES bounding boxes** (demande
  explicite section 19, "évite des coordonnées absolues indépendantes des
  cartes") : `refreshTalentTreeLayout()` (nouvelle méthode privée, appelée
  après chaque `refreshTalents()` — donc à l'ouverture ET après chaque achat
  — ET à chaque redimensionnement de fenêtre pendant que l'écran est
  visible) lit `getBoundingClientRect()` sur CHAQUE nœud réellement rendu et
  trace : racine → chaque talent de palier 1 ; puis, pour CHAQUE talent qui
  a des dépendants (`listDependents`), un trait de son centre-bas vers le
  centre-haut de CHACUN de ses enfants — ce qui dessine naturellement DEUX
  branches distinctes sortant de Butin de guerre (vers Recyclage ET vers Le
  temps, c'est de l'argent) et une branche Tir rapide → Mitraillette, sans
  aucun cas spécial codé en dur pour ces talents précis. Même mécanisme
  générique pour la position verticale des libellés de palier (centrée sur
  le centre réel de sa ligne). `requestAnimationFrame` en sécurité contre un
  tout premier calcul avant stabilisation complète du layout.
- **`.screen-talents .screen-panel`** élargi (`width: min(96vw, 1200px)`,
  contre 950px fixes avant) — l'écran utilise davantage l'espace disponible
  (demande section 17) tout en restant borné à 96% de la largeur d'écran.
  `.talent-tree-scroll` gère le débordement horizontal interne
  (`overflow-x: auto`) si un futur palier contient trop de talents pour
  tenir sur une ligne, plutôt que de le casser sur 2 lignes (section 16) —
  **limite CSS connue et acceptée** : régler `overflow-x` force `overflow-y`
  à se comporter en `auto` même non déclaré, ce qui pourrait couper la
  description au survol (`.talent-node-desc`) d'un talent de la DERNIÈRE
  ligne si elle déborde vers le bas ; compensé par une marge basse généreuse
  (`padding-bottom: 100px`) sur la zone de scroll plutôt qu'une solution
  JavaScript plus complexe.
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  19 vérifications sur les VRAIES données) : Recyclage ET Le temps, c'est de
  l'argent sont bien deux enfants DIRECTS de Butin de guerre (jamais l'un de
  l'autre) ; Mitraillette est bien enfant de Tir rapide ; les 5 fondateurs
  sont tous palier 1, les 3 dépendants tous palier 2 ; `talentsByTier()`
  regroupe exactement `[recyclage, temps_argent, mitraillette]` en palier 2,
  dans cet ordre précis ; tous les talents d'un même palier partagent
  exactement le même indice de palier (donc le même Y une fois rendus).
  Build propre (`npm run build`, `tsc --noEmit`).
- **Non vérifiable de mon côté — aucun accès visuel, et cette fois aucun
  filet de sécurité headless possible non plus** (contrairement au reste du
  projet, `getBoundingClientRect()`/la mise en page réelle du navigateur ne
  sont pas simulables en Node pur) : alignement horizontal effectif des
  cartes d'un même palier, lisibilité des connecteurs, comportement du
  scroll horizontal, centrage du talent racine, rendu aux 3 résolutions
  demandées (1920×1080/1600×900/1366×768) — à confirmer et ajuster par
  Antoine en jeu. La logique de mesure (`refreshTalentTreeLayout`) suit une
  approche standard (bounding-box réelle, recalcul au resize) déjà éprouvée
  ailleurs sur le web, mais reste la première fonctionnalité UI de ce projet
  dont la correction ne pouvait pas du tout être vérifiée par script.

## DEUXIÈME refonte de l'arbre de talents : positionnement absolu par branche (2026-08-14)

Antoine, après avoir vu le premier essai (une ligne flexbox par palier) :
"plus proche de ce que je veux" mais toujours pas satisfaisant — le
problème n'était plus le système de palier (Palier I/Palier II sur une
ligne chacun fonctionnait déjà), mais le POSITIONNEMENT HORIZONTAL : chaque
ligne traitait ses talents comme une simple LISTE centrée
(`justify-content: center`), perdant la relation "cette carte est centrée
sous SON parent" — Recyclage/Le temps semblaient juste posés côte à côte
sans lien visible avec Butin de guerre, et les connecteurs formaient une
grande ligne horizontale continue donnant l'impression que toutes les
branches du Palier II étaient reliées entre elles.

**Changement d'architecture complet** : remplace le layout flexbox
générique par un positionnement ABSOLU (`left`/`top` en pixels), calculé
par un vrai algorithme d'arbre — une seule stratégie de layout (demande
explicite, section 34 : ne pas accumuler flex + absolute + patchs
margin-left).

- **`ui/talentTreeLayout.ts`** (nouveau, module PUR — aucun DOM, testable
  en headless) : `computeTalentTreeLayout(rootId, descendants, options)`
  implémente l'algorithme d'arbre classique en deux passes demandé
  explicitement (section 29) :
  1. `subtreeWidth(id)` (bas → haut) : la largeur qu'occupe un talent ET
     tous ses descendants — une feuille vaut `cardWidth`, un nœud avec
     enfants vaut la somme des largeurs de ses sous-arbres enfants + les
     gaps entre eux (jamais moins que sa propre largeur de carte).
  2. `assignX` (haut → bas) : centre chaque nœud sur son propre sous-arbre,
     puis répartit ses enfants côte à côte à l'intérieur de cette largeur.
  Un parent à UN SEUL enfant → l'enfant hérite EXACTEMENT le X du parent
  (Mitraillette sous Tir rapide). Un parent à PLUSIEURS enfants → ils sont
  centrés ensemble sous lui (Recyclage+Le temps sous Butin). Les collisions
  entre groupes de frères sont résolues GRATUITEMENT par ce calcul (le
  sous-arbre de Butin, plus large à cause de ses 2 enfants, pousse
  naturellement Tir rapide plus loin) — aucune passe de résolution de
  collision séparée nécessaire (section 29, étape 5, satisfaite par
  construction). `Y` reste STRICT par palier (section 30), calculé
  séparément et jamais influencé par la position d'un parent.
- **`ui/screens.ts`, `buildTalentTree`** entièrement réécrite : construit
  l'arbre pour le LAYOUT (chaque talent non-racine a pour parent son
  `requires` gameplay, ou la racine si absent pour les fondateurs — ne
  touche à AUCUNE donnée de `data/talents.ts`, purement une décision
  d'affichage), appelle `computeTalentTreeLayout`, puis positionne CHAQUE
  carte via `style.left`/`style.top` calculés directement depuis le
  résultat — plus aucune mesure DOM après coup (contrairement au premier
  essai, `refreshTalentTreeLayout`/`getBoundingClientRect`, supprimé
  entièrement) : le layout ne dépend que des données de l'arbre et de
  constantes de taille FIXES, jamais de la largeur du conteneur — donc plus
  besoin de recalcul au redimensionnement de fenêtre non plus (l'ancien
  listener `resize` a disparu, il n'avait plus de raison d'être).
- **Connecteurs SVG — un edge PAR PARENT** (jamais une ligne globale sur
  tout un palier, section 9-13) : `drawEdges(parentId, childIds)` — un seul
  enfant → trait direct centre-bas → centre-haut ; plusieurs enfants →
  tronc court puis éventail dont la barre horizontale NE COUVRE QUE la
  largeur entre SES propres enfants, jamais jusqu'au groupe voisin. La
  racine est traitée comme n'importe quel autre parent (5 enfants) — le
  même code produit déjà l'éventail racine → Palier I sans aucun cas
  spécial, alors que les edges Butin→{Recyclage, Le temps} et Tir
  rapide→Mitraillette restent visuellement indépendants (aucune barre
  horizontale partagée entre les deux, confirmé par capture d'écran).
- **Cartes de hauteur UNIFORME** (section 8) : `.talent-node` passe de
  hauteur variable (dépendant du texte) à `height: 72px` FIXE (plus
  `width: 140px` déjà existant) — synchronisé avec
  `TALENT_TREE_LAYOUT_OPTIONS.cardWidth/cardHeight` côté JS (couplage
  manuel documenté aux deux endroits, ce projet n'a pas de constantes
  partagées CSS↔JS). Le nom peut désormais revenir à la ligne
  (`-webkit-line-clamp: 2`) sans jamais faire déborder la carte
  (`overflow: hidden`).
- **Tooltip flottant repensé** (section 24/25 : "ne doit pas pousser les
  cartes... doit flotter... reste entièrement dans la fenêtre") : l'ancien
  `.talent-node-desc` (enfant de chaque carte, position absolue relative à
  elle, pouvait recouvrir les voisins) est remplacé par UN SEUL élément
  PARTAGÉ (`Screens.talentTooltip`, construit une fois dans le
  constructeur, ajouté à `document.body`), `position: fixed`,
  repositionné en JS au survol de n'importe quelle carte
  (`showTalentTooltip`) : préfère la droite si la place existe, sinon la
  gauche, sinon au-dessus (ou en dessous en dernier recours), toujours
  clampé pour rester entièrement dans la fenêtre. `pointer-events: none`,
  `z-index: 1000` (au-dessus de tout).
- Suppression du code mort associé au premier essai : `.talent-tree-root-row`/
  `.talent-tree-tier-row`/`.talent-tree-tier-labels` (ancienne version)/
  `talentTierRows`/`talentTreeRootRow`/le listener `resize`/
  `refreshTalentTreeLayout` — rien laissé en commentaire, conforme à la
  consigne du projet.

**Vérifié en headless** (`npx tsx`, script temporaire supprimé après
usage, 18 vérifications sur l'algorithme PUR avec les vraies données du
jeu ET un mini-arbre synthétique pour prouver que les règles ne sont pas
un hasard propre à ces talents précis) : tous les talents d'un palier
partagent exactement le même Y ; `centre(Recyclage, Le temps) === X(Butin)`
à `1e-9` près ; `X(Mitraillette) === X(Tir rapide)` à `1e-9` près ; aucun
chevauchement entre sous-arbres voisins ; ordre de lecture stable.

**Vérifié avec un VRAI navigateur** (2026-08-14, demande explicite
d'Antoine, section 35 : "ouvre l'arbre dans le navigateur... ne te
contente pas des tests headless" — Playwright + Chromium installés pour
l'occasion avec l'accord d'Antoine, script jetable supprimé après usage,
capture d'écran regardée directement) :
- **X mesuré de Butin de guerre : 583px.** X de Recyclage : 499px, X du
  Temps : 667px → **centre exact (499+667)/2 = 583px = X(Butin), au pixel
  près.**
- **X mesuré de Tir rapide : 835px.** X de Mitraillette : **835px,
  identique au pixel près.**
- **Y de tous les talents Palier II (Recyclage/Le temps/Mitraillette) :
  689,375px, strictement identique aux 3.** Y de tous les talents Palier I :
  533,375px, strictement identique aux 5.
- Édges Butin→enfants et Tir rapide→Mitraillette confirmés visuellement
  INDÉPENDANTS sur la capture (aucune barre horizontale partagée) ;
  éventail racine → Palier I confirmé conforme (accepté explicitement,
  section 19).
- Aucun chevauchement entre les 9 cartes (vérifié par calcul de rectangles
  réels, toutes paires).
- **Scrollbar verticale interne disparue** : `.talent-tree-scroll.scrollHeight
  (378px) === .clientHeight (378px)` exactement — plus aucun débordement
  vertical (cause du premier bug : un `padding-bottom: 100px` devenu inutile
  une fois le tooltip passé en `position: fixed`, retiré).
- Tooltip : devient visible au survol, `position: fixed` confirmé, la carte
  survolée ne bouge PAS d'un pixel quand il apparaît, reste entièrement
  dans la fenêtre 1920×1080 (capture d'écran à l'appui — apparaît
  proprement à droite de Butin de guerre sans recouvrir Réflexes de
  vétéran).
- **Testé aux 3 résolutions demandées** (1920×1080, 1600×900, 1366×768,
  21 vérifications au total) : 9 cartes toujours présentes, Palier I et
  Palier II toujours parfaitement alignés sur une seule ligne chacun,
  aucune carte hors-écran, aucun chevauchement, aucune erreur console —
  aux 3 résolutions. Capture d'écran à 1366×768 confirmée lisible et
  complète sans le moindre scroll nécessaire.
- Aucune erreur console à aucune résolution.

Playwright + Chromium ont été installés comme devDependency pour cette
vérification (accord explicite d'Antoine, ~300 Mo) — **laissés en place**
plutôt que désinstallés : outil directement réutilisable pour toute
future vérification visuelle réelle sur ce projet (jusqu'ici systématiquement
listée comme "non vérifiable de mon côté" dans ce fichier). À retirer
(`npm uninstall playwright`) si Antoine préfère ne pas le garder.

Build propre (`npm run build`, `tsc --noEmit`).

## Correctif : dérive de virgule flottante sur l'or (2026-08-14)

Antoine, capture d'écran à l'appui (boutique affichant "Or : 9.899999999999999") :
"le mine d'or déclenche un bug, quand on achète et que l'on a la mine, nos
gold n'étant pas sur un montant fixe il est possible de déclencher un
résultat négatif."

**Diagnostic** : `RunState.gold` peut recevoir des montants FRACTIONNAIRES
à plusieurs endroits (récompense de kill archer = 1,5 ; revenu de la mine
versé par paliers de 0,1) — un `+=`/`-=` JavaScript direct et répété sur ce
genre de valeurs accumule inévitablement du bruit de virgule flottante
(l'exemple classique : `0.1 + 0.2 === 0.30000000000000004`), jusqu'à devenir
visible à l'affichage (`String(gold)` brut, sans aucun formatage, voir
`GoldHud`/boutique). Le correctif précédent du 2026-08-14 ("la mine ne
générait aucun or") avait bien réglé l'ACCUMULATION du revenu de la mine,
et arrondissait déjà `currentRun.gold` à cet endroit précis — mais c'était
le SEUL chemin de code protégé : les achats, ventes et récompenses de kill
en dehors de la mine continuaient de muter `gold` sans aucun arrondi,
laissant le bruit s'accumuler ailleurs. **Reproduit exactement en headless**
(séquence mine + kills d'archer entrelacés) : sans protection, la même
suite d'opérations qui devrait donner "10" affiche `9.999999999999986`.

- **`run/runState.ts`, nouvelle `roundGold(amount)`** — arrondit au dixième
  le plus proche, SOURCE UNIQUE désormais utilisée par TOUTE mutation de
  `RunState.gold` dans tout le projet (`awardKillGold`, le bonus de fin de
  vague dans `applyBattleOutcome`, l'or de départ dans `createNewRun`) —
  remplace le `Math.round(...)/10` qui n'existait jusque-là qu'en ligne
  dans le code de la mine (`main.ts`), maintenant réécrit pour réutiliser
  cette même fonction partagée.
- **`main.ts`** : les 5 autres sites qui mutaient `currentRun.gold`
  directement (`sellUnit`, `buyUnit`, `undoLastUnitPurchase`,
  `onBuyHealScroll`, `onBuyIceNova`) passent désormais tous par
  `roundGold`.
- **"Résultat négatif" — rendu mathématiquement IMPOSSIBLE, pas seulement
  improbable** : les 3 sites qui RETIRENT de l'or (`buyUnit`,
  `onBuyHealScroll`, `onBuyIceNova`) enveloppent désormais leur soustraction
  dans `Math.max(0, roundGold(...))` — un filet de sécurité défensif en plus
  du garde-fou `gold < cost` déjà existant (qui protège le cas normal, mais
  ne garantissait rien face à un éventuel résidu de virgule flottante).
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  10 vérifications) : reproduction fidèle du bug AVANT correctif (une
  séquence mine+kills non protégée dérive jusqu'à `9.999999999999986` au
  lieu de `10`) ; la MÊME séquence, protégée par `roundGold` à chaque étape,
  reste TOUJOURS un nombre propre (au plus 1 décimale) ; `awardKillGold`
  reste propre après 50 kills d'archer consécutifs (le cas le plus à
  risque, 1,5 répété) avec le montant exact attendu ; séquence mixte
  fantassin/archer/mage également exacte et propre ; des achats répétés
  jusqu'à épuisement de l'or ne produisent jamais de solde négatif. Build
  propre (`npm run build`).
- **Non vérifiable de mon côté** : confirmation que l'affichage reste propre
  sur une VRAIE session de jeu prolongée (ce correctif couvre tous les
  chemins de mutation identifiés par lecture de code exhaustive, mais
  seule une session réelle confirmera qu'aucun autre site n'a été manqué)
  — à confirmer par Antoine.

## Chantier bestiaire — Sentinelle, premier TANK (2026-08-14)

Demande complète d'Antoine (76 points), avec audit préalable explicitement
exigé avant tout code. Audit mené par lecture directe (pas de suppositions) :
convention ×10 confirmée, système de capacités générique (`AbilityDef`,
Charge/Boule de feu) confirmé réutilisable, `targetingSystem` et son
exception "ennemi déjà à portée" identifiés comme le point d'insertion du
forçage de cible, aucun système de "shield"/statut temporaire générique
n'existait avant ce chantier (créé ici).

**Identité** : tank lourd, dégâts volontairement symboliques (1 affiché),
toute sa valeur vient de l'encaissement + de la Provocation (contrôle
d'aggro + bouclier).

**Fichiers créés** : `data/sentinelUpgrade.ts`, `run/sentinelUpgradeEffects.ts`,
`sim/damage.ts`, `render/sentinelRig.ts`, `render/tauntVfx.ts`. **Fichiers
modifiés** : `config/constants.ts`, `data/abilities.ts`, `data/units.ts`,
`sim/entity.ts`, `sim/world.ts`, `sim/systems/{targeting,abilities,combat,
persistentAreaEffects}.ts`, `sim/playerArrow.ts`, `run/{unitUpgradeEffects,
runState}.ts`, `render/{unitMesh,unitViews}.ts`, `ui/{combatOverlay,screens}.ts`,
`main.ts`. **Éditeur et sérialisation de map : aucun changement** — bestiaire
dynamique (`Object.values(UNITS)`) et `unitId` opaque, comme toute unité
depuis le Mage.

**Statistiques finales** (`data/units.ts`) : coût 40 or, PV 500 interne (50
affichés), dégâts 10 interne (1 affiché) mono-cible, `attackRange` 0.95
(mêlée, comme le Fantassin), `aggroRange` 9, `radius` 0.6 (Fantassin 0.5 —
"un tank imposant, pas un bâtiment"). Vitesse = `moveSpeed` Fantassin ×
`SENTINEL_MOVE_SPEED_MULTIPLIER` (0.75, milieu de la fourchette 70-80%
demandée) = **1.65** (Fantassin 2.2, Archer 2.0, donc bien la plus lente du
jeu). `attackCooldown` = `FANTASSIN_ATTACK_COOLDOWN` ×
`SENTINEL_ATTACK_COOLDOWN_MULTIPLIER` (1.5, borne haute de la fourchette
40-50% demandée) = **1.5s** (Fantassin 1.0s) — coïncide avec la borne basse
de l'exemple concret donné par Antoine ("1 attaque / 1.5 à 1.8 seconde"),
les deux valeurs sont centralisées dans `config/constants.ts`, jamais
hardcodées dans `movementSystem`/`combatSystem` (génériques, lisent
`UnitStats`).

**Rayon de Provocation** : `data/items.ts`, `ICE_NOVA_RADIUS` (rayon réel du
Blizzard, dérivé du rayon de la Boule de feu du Mage × 1.15) = **2.3 cases**.
Rayon de Provocation = 2 × ce rayon = **4.6 cases**. Impossible d'importer
`ICE_NOVA_RADIUS` directement dans `data/units.ts` (cycle d'import :
`items.ts` appelle déjà `getUnit('mage')`) — `units.ts` recalcule donc la
MÊME formule depuis SA source (`MAGE_FIREBALL_RADIUS_TILES`, une constante
locale désormais aussi référencée par `UNITS.mage.abilities`, plus de
littéral dupliqué) avec le même multiplicateur (`ICE_NOVA_RADIUS_MULTIPLIER`,
importé sans risque de cycle depuis `config/constants.ts`). Vérifié en
headless : le résultat coïncide EXACTEMENT avec `ICE_NOVA_RADIUS × 2`.

**Provocation** (`data/abilities.ts`, `TauntAbility` — 3ᵉ membre de l'union
`AbilityDef` après Charge/Boule de feu) : déclenchement AUTOMATIQUE dans
`sim/systems/abilities.ts` (même boucle générique par entité/par tick),
gate bon marché (`e.targetId === null` → return) avant le scan complet des
ennemis dans le rayon — comme la Boule de feu du Mage, safe car le rayon de
Provocation (4.6) est toujours < `aggroRange` (9) de la Sentinelle : si
`targetId` est null, aucun ennemi n'est dans l'aggro donc certainement
aucun dans le rayon plus petit non plus. Seules les cibles RÉELLEMENT
valides comptent (vivantes, camp opposé, non `tauntImmune` — nouveau champ
optionnel sur `UnitStats`, absent partout aujourd'hui, réservé à un futur
boss comme demandé explicitement) ; aucun déclenchement (cooldown NON
consommé) si personne n'est valide.

**Forçage de cible** : `Entity.tauntTimer`/`tauntSourceId` (nouveaux champs).
`sim/systems/targeting.ts` (`targetingSystem`, gagne un paramètre `dt` —
appelé `targetingSystem(this.entities, dt)` dans `World.step`) décompte le
minuteur et FORCE `targetId = tauntSourceId` en tout début de boucle par
entité, AVANT même l'exception "ennemi déjà à portée d'attaque" — un
`continue` court-circuite ensuite tout le reste du ciblage normal pour ce
tick. Si la source est morte ou le minuteur expiré, abandon IMMÉDIAT
(même tick, jamais un tick de retard) et retour au ciblage normal. Un
nouveau Taunt REMPLACE simplement l'ancien (`tauntSourceId` écrasé) — "dernier
Taunt valide = priorité actuelle", pas de système de menace. Le Root
(`rootTimer`) reste totalement indépendant : il ne gate QUE `movementSystem`,
jamais `targetingSystem` — une unité provoquée ET rootée change bien de
cible mais reste immobile, vérifié en headless.

**Bouclier temporaire** : nouveaux champs GÉNÉRIQUES `Entity.shield`/
`shieldTimer` (jamais réservés à la Sentinelle — "pourra servir plus tard à
un sort de protection, un Paladin, un objet", demande explicite) + nouveau
fichier `sim/damage.ts`, `applyDamageToEntity(target, amount)` : absorbe
d'abord via `shield`, le surplus seulement passe aux PV. **Branché sur les 5
points d'entrée de dégâts existants** (combat automatique, Charge, Boule de
feu, Blizzard, flèche du joueur — `combat.ts`, `abilities.ts` ×2,
`persistentAreaEffects.ts`, `playerArrow.ts`) : sans ça, un Shield
n'aurait absorbé QUE le combat au corps à corps, pas les autres sources —
vérifié explicitement en headless (un Shield encaisse bien un coup de
combat automatique). Miss/dodge n'appellent jamais cette fonction : shield
intact sur un raté, vérifié en headless avec un RNG truqué. `shieldTimer`
décompté génériquement dans `sim/systems/abilities.ts` (même boucle que les
cooldowns de capacités) — retombe à 0 (shield remis à 0 avec) même si tout
n'a pas été consommé par des dégâts. Un nouveau Taunt REMPLACE le shield
existant (jamais additionné à un reste) — architecture volontairement
simple pour cette V1 (cooldown 12s > durée 10s, aucun chevauchement réel en
pratique).

**Formule** : `Entity.tauntShieldBonus` (bonus permanent du joueur, échelle
interne) + `TauntAbility.baseShieldPerTarget` (base, ATTENTION : échelle
interne x10 — bug trouvé et corrigé en vérification headless, la constante
affichée `SHIELD_PER_TAUNTED_ENEMY = 3` doit être multipliée par `HP_PER_PIP`
au moment de construire l'ability dans `data/units.ts`, jamais utilisée
telle quelle) = bonus effectif par cible ; `shield = successfulTauntCount *
effectiveShieldPerTarget`. Exemples de la demande vérifiés exactement en
headless (5 ennemis niveau 0 → 15 shield affichés, niveau 6 × 8 ennemis →
40).

**Améliorations permanentes** (`data/sentinelUpgrade.ts` +
`run/sentinelUpgradeEffects.ts`, système DÉDIÉ — pas `data/unitUpgrades.ts`/
`UnitUpgradeDef`, dont la forme suppose toujours un palier d'Attaque avec
coût Gold croissant, incompatible avec la Sentinelle qui n'en gagne jamais,
demande explicite point 35) : +5 PV par achat, +1 Bouclier/ennemi tous les 3
achats (`Math.floor(level/3)`). **Coût des runes : 1, 2, 4, 8, 16, 32,
64...** (`baseRuneCost: 1`) — DIVERGENCE ASSUMÉE de la convention des 5
autres améliorations permanentes de ce jeu (Fantassin/Archer/Mage/Baliste/
Parchemin/Nova de glace/Mine, toutes explicitement remontées à 10 runes de
départ le 2026-08-13/14). Appliqué à la LETTRE de la demande ("premier
achat : 1 Rune... `2**level`"), qui donne un chiffre explicite différent de
la convention établie — pas silencieusement aligné sur 10, **à confirmer par
Antoine si ce n'était pas l'intention** (un seul chiffre à changer dans
`data/sentinelUpgrade.ts` si besoin). `run/unitUpgradeEffects.ts`,
`effectivePlayerUnitMaxHp` gagne un cas spécial `unitId === 'sentinel'`
(même classe de bug que "je commence à 5/9" déjà corrigée pour les 3 autres
unités — sans ce cas, une Sentinelle achetée après des PV permanents
apparaîtrait blessée dès le spawn). **Confirmé : n'affecte JAMAIS une
Sentinelle ennemie** — `enemyStatOverrides`/`computeEnemyUnitUpgradeEffects`
restent basés sur `data/unitUpgrades.ts` (Sentinelle absente de
`UNIT_UPGRADES`), donc toujours 0 bonus ; vérifié en headless via le vrai
`World` (Sentinelle ennemie spawnée avec `tauntShieldBonus=0` explicite,
Provocation gagne bien exactement le Shield de BASE quel que soit le niveau
d'amélioration du joueur).

**Animation** (`render/sentinelRig.ts`) : modèle Meshy AI fourni par
Antoine (dossiers `bleu`/`rouge`, déjà teints par camp comme l'Archer/le
Fantassin V3 — **aucune texture appliquée par code**), inspecté avant
intégration (script jetable hors-navigateur) : squelette anonyme 28 os
("Bone_XXX", parent racine "UniRigArmature" — même famille de pipeline que
le Fantassin V3), **aucune animation embarquée** (0 clip). Marche, attaque
ET Provocation sont donc TOUTES procédurales — première unité du jeu avec
un geste de capacité (Provocation) en plus de marche/attaque. Hiérarchie
résolue par analyse FK (positions monde de repos, script jetable) :
`facingFix` (rotation π, même hypothèse que les 3 autres unités riggées, même
pipeline d'export) implique que le bras DROIT (épée) est la chaîne
`Bone_027` (côté natif -X) et le bras GAUCHE (bouclier) `Bone_022` (côté
natif +X) — raisonnement symétrique au bug déjà corrigé une fois pour le
Fantassin ("tu t'es trompé de bras"), **non vérifié visuellement**, correctif
d'une ligne si inversé. Marche : `buildMultiBoneClip` (cuisses en phase
opposée, cycle 0.8s — plus long que le Fantassin 0.6s, cohérent avec
`SENTINEL_MOVE_SPEED_MULTIPLIER`), + balancement de torse + léger retard du
bras-bouclier ("inertie"). **Pas de mouvement vertical (DOWN/UP à chaque
pas, point 46 de la demande)** : `proceduralSwing.ts` n'anime que des
rotations, jamais des translations — omission assumée, extension possible
si demandée. Attaque : nouvelle config `SENTINEL_ATTACK_CONFIG` (même
moteur générique `ProceduralAttackAnimator` que le coup d'épée du Fantassin,
réutilisé comme prévu dès sa conception "Cavalier, Mage, futurs mini-boss")
— chronologie 1.1s (windup 36%, slash accéléré via `easeInCubic`,
follow-through lourd, récupération lente), amplitudes plus grandes que le
Fantassin sur l'épaule (canal dominant). Provocation : DEUXIÈME
`ProceduralAttackAnimator` indépendant par instance (`userData.proceduralTaunt`),
geste bref (0.5s, torse en avant + bouclier avancé + bras d'épée écarté).

**Priorité Death > Provocation > Attack > Walk > Idle** (`render/unitViews.ts`) :
`playTaunt` interrompt net une attaque en cours (`proceduralAttack?.stop()`) ;
`playAttack` refuse de démarrer par-dessus une Provocation en jeu
(`proceduralTaunt?.isPlaying()` → return) — purement cosmétique, les
dégâts/cooldowns en SIMULATION restent inchangés. Les deux animateurs sont
mis à jour ensemble dans `sync()`, absents (`undefined`) et sans effet pour
toute autre unité.

**VFX** (`render/tauntVfx.ts`, nouveau) — volontairement SOBRE ("la
Sentinelle est un guerrier, pas un Mage") : onde dorée qui part de la
Sentinelle jusqu'au rayon RÉEL de la Provocation (`event.radiusTiles`,
jamais approximé), petit losange doré flottant au-dessus de CHAQUE unité
provoquée (`Entity.tauntTimer > 0`, même principe que les cristaux de givre
du Root), petit flash bleu-blanc au moment où le Shield est gagné — aucune
texture, aucun système de particules, formes géométriques simples
(Ring/Cone) comme le reste du "martial" du jeu.

**Affichage du Shield** (`ui/combatOverlay.ts`) : fine barre bleu clair
SOUS les pips de PV (`.shield-bar`, `flex-wrap` + `flex-basis:100%` pour la
forcer sur sa propre ligne), largeur proportionnelle à `shield/maxHp`
(plafonnée visuellement à 150%), masquée dès que le Shield tombe à 0 —
"très compact" comme demandé. Uniquement en BATAILLE (`sync()`), jamais en
placement (aucune `Entity` n'existe encore).

**Boutique de run** : ligne d'achat Sentinelle ajoutée à l'onglet Unités
(bouton simple + ×5, comme Fantassin/Archer), TOUJOURS visible — jamais
réservée par vague (contrairement au Mage). `KILL_REWARD.sentinel = 20`
(moitié du coût 40, même convention que les 3 autres unités) — sans cette
entrée, tuer ou vendre une Sentinelle aurait rapporté 0 or par défaut.

**Boutique d'amélioration permanente** : carte DÉDIÉE (`buildSentinelUpgradeCard`,
shape PV + Bouclier/ennemi, PAS d'Attaque — comme Baliste/Nova de
glace/Mine, jamais masquée contrairement à la Mine) — `onPurchaseUnitUpgrade`
(dispatch générique déjà existant) étendu avec un cas `SENTINEL_UPGRADE.id`.

**Vérifié en headless** (script jetable avec `npx tsx`, imports des VRAIS
modules + `World`/`combatSystem` réels, supprimé après usage, 70/70
vérifications) : rayon dérivé exact, stats de base (vitesse/cadence dans
les fourchettes demandées), absorption du Shield par `applyDamageToEntity`
(partielle, totale + débordement, jamais sur miss/dodge — testé via le vrai
`combatSystem` avec un RNG truqué), déclenchement réel de la Provocation via
`World`/`abilitySystem` (exactement les cibles valides comptées, mort/
allié/hors-portée exclus, cooldown consommé uniquement sur déclenchement
réel), forçage de cible prioritaire (y compris face à un ennemi déjà
attaquable), indépendance Root/Taunt (cible forcée mais mouvement bloqué),
abandon immédiat à la mort de la source, remplacement par le Taunt le plus
récent (plusieurs Sentinelles), expiration naturelle, formules
d'amélioration permanente (PV/Bouclier/coût, exemples niveau 3 et 6 de la
demande), isolation totale joueur/ennemi, `KILL_REWARD`. Build propre
(`npm run build`).

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** (comme
toutes les unités riggées de ce projet) : silhouette/texture réellement
appliquée en jeu (matériaux référencés mais non décodables en Node
headless, même limite déjà documentée pour le Fantassin/l'Archer/le Mage),
lequel bras est réellement le bras droit, échelle (`SENTINEL_MODEL_SCALE =
0.85`, première estimation jamais ajustée par Antoine), lisibilité de la
marche lourde/de l'attaque/du geste de Provocation, rendu du VFX, mise en
page de la barre de Shield et de la carte boutique. **À confirmer par
Antoine en jeu réel** — les leviers d'ajustement les plus probables (échelle,
quel bras, amplitude de marche) sont chacun une seule constante à changer
dans `render/sentinelRig.ts`.

## Refonte de l'attaque de la Sentinelle + verrou initial de Provocation (2026-08-14)

Deuxième demande d'Antoine sur cette unité, même jour : refaire proprement
l'animation d'attaque (deux variantes) et corriger la Provocation qui se
déclenchait trop tôt en début de bataille. Audit préalable exigé, mené par
lecture directe du code existant (pas de suppositions).

**Bones résolus** (déjà connus depuis l'intégration initiale, reconfirmés
sur le vrai GLB en headless) : bassin `Bone_001`, torse `Bone_002`, cou
`Bone_017`/tête `Bone_016` (jamais utilisés avant cette passe). Bras droit
(épée) : épaule `Bone_027` → bras `Bone_026` → coude `Bone_025` → poignet
`Bone_024`. Bras gauche (bouclier) : épaule `Bone_022` → bras `Bone_021` →
coude `Bone_020` → poignet `Bone_019` (021/020/019 jamais utilisés avant
cette passe, seule l'épaule 022 servait à une compensation défensive
mineure). Cuisses droite/gauche `Bone_010`/`Bone_015`.

**Attaque avant cette passe** : un seul `ProceduralAttackAnimator`
(`userData.proceduralAttack`), déclenché par `UnitViews.playAttack()`,
appelée INCONDITIONNELLEMENT par `main.ts` sur CHAQUE `CombatEvent`
(hit/miss/dodge/blocked) — les dégâts sont déjà résolus AVANT, dans
`combatSystem`, au tick de résolution (`applyDamageToEntity`). Le visuel est
donc totalement découplé du gameplay pour TOUTES les unités du jeu, pas
seulement la Sentinelle — comportement explicitement conservé tel quel
(demande d'Antoine : "ne réécris pas tout le combat pour ça").

**Deux variantes, choix aléatoire, un seul événement gameplay** :
`render/sentinelRig.ts` construit désormais DEUX `ProceduralAttackAnimator`
(`SENTINEL_SWORD_ATTACK_CONFIG`/`SENTINEL_SHIELD_ATTACK_CONFIG`), exposés
via `userData.proceduralAttackVariants = { sword, shield }` au lieu du
`proceduralAttack` unique. `render/unitViews.ts` généralise le mécanisme :
nouvelle map `activeProceduralAttack` (par entité) + méthode
`resolveActiveAttackAnimator` — pour une unité à variante unique (Fantassin),
se fixe une fois sur l'animateur existant ; pour la Sentinelle,
`playAttack()` tire `Math.random() < 0.5` (choix **cosmétique pur**, même
principe déjà établi dans ce projet pour la variante de chute de l'Archer —
le RNG déterministe de la simulation reste réservé au gameplay) et n'assigne
QU'UN SEUL animateur à `activeProceduralAttack`, jamais les deux. `sync()`,
l'ancrage de position et `playTaunt()` (priorité Provocation > Attaque,
inchangée) passent tous par ce même point de résolution générique — un seul
`CombatEvent` ne peut donc jamais déclencher deux gestes. Vérifié en
headless : un combat automatique via le vrai `combatSystem` ne produit
qu'UN évènement et qu'UNE application de dégâts, quelle que soit la
variante ; les dégâts effectifs restent identiques (aucune branche de code
gameplay ne lit `activeProceduralAttack`) — les futures améliorations de
dégâts affecteront donc naturellement les deux de la même façon.

**Sword Slash** (main droite, chronologie 1.1s, windup 35%/anticipation
courte/slash accéléré `easeInCubic`/follow-through+récupération lourds,
reprend et étoffe la V1) — AJOUTE par rapport à la V1 : tête (`Bone_016`,
contre-rotation légère pour rester face à la cible) et cuisses (micro-
compression/extension synchronisée, jamais un déplacement gameplay).

**Shield Bash** (bras gauche, chronologie plus COURTE/punchy — 1.0s, windup
30%, poussée très rapide à 52%) — canal dominant `Bone_022` (épaule gauche,
MÊME axe/convention de signe que le geste de Provocation déjà existant :
X négatif = avance), amplitude bien plus large (jusqu'à -55° contre -18°
pour la Provocation) ; bras/coude/poignet gauches en accent ; épée (bras
droit) en mouvement SECONDAIRE de contrepoids uniquement (amplitude max 16°
contre 128° pour le canal dominant du coup d'épée) — jamais l'impression
d'une double attaque. Un seul axe domine le mouvement de l'épaule pour
rester lisible (point 13 de la demande : jamais de bouclier de profil ou
traversant le corps) — non vérifié visuellement, mais construit par
prudence sur l'axe déjà validé par le geste de Provocation existant plutôt
qu'un axe inédit.

**Verrou initial de Provocation** — nouveau champ générique optionnel
`TauntAbility.initialLockoutSeconds` (`data/abilities.ts`), câblé sur la
Sentinelle via `SENTINEL_INITIAL_TAUNT_LOCKOUT = 7.0`
(`config/constants.ts`). `sim/systems/abilities.ts`, `tryTriggerTaunt` le
vérifie EN PREMIER (`if (battleElapsedTime < (ability.initialLockoutSeconds
?? 0)) return;`) — ne touche JAMAIS `e.abilityCooldowns.taunt`, donc le
cooldown normal (`TAUNT_COOLDOWN`, inchangé) ne démarre que sur la PREMIÈRE
utilisation réelle, jamais un cooldown artificiel posé à t=0. `abilitySystem`
gagne un paramètre `battleElapsedTime`, threadé depuis `World.step()` via
`this.time` (lu AVANT l'incrémentation de fin de tick — au plus un tick de
33ms de marge, jamais un déverrouillage anticipé).

**`World.time` déjà l'exact bon vecteur, aucun nouvel état nécessaire** —
confirmé par lecture de `core/loop.ts`/`sim/world.ts` avant d'écrire quoi
que ce soit : `World.clear()` (appelé exactement à "Prêt pour la bataille",
`onValidatePlacement`) remet `this.time` à 0 — reset automatique à CHAQUE
nouvelle phase de bataille, y compris si le placement a duré 3 minutes
(aucun `world.step()` pertinent n'a pu faire dériver ce compteur avant ce
reset). `this.time` n'avance QUE via `world.step()`, lui-même gaté par
l'accumulateur à pas fixe de `core/loop.ts`
(`accumulator += realDelta * loop.timeScale`) — à `timeScale = 0` (Pause),
l'accumulateur n'avance jamais, `onStep` n'est jamais invoqué, `world.time`
reste strictement figé. Aucune des deux garanties (reset par bataille,
insensibilité à la Pause) n'a demandé de code nouveau — uniquement lire
`world.time` au bon endroit.

Vérifié en headless (`npx tsx`, imports des VRAIS modules + `World` réel,
script jetable supprimé après usage, ~50 vérifications) : aucun Shield gagné
ni cooldown consommé avant t=7.0s (testé jusqu'à t=6.99s inclus) ; premier
déclenchement confirmé dès que `world.time >= 7.0` (avec marge contre le bruit de
virgule flottante de l'accumulation répétée de `1/30` — piège rencontré en
écrivant le test, pas dans le code réel) ; le cooldown normal démarre bien
SEULEMENT à cette première utilisation ; confirmation qu'une "Pause" simulée
(aucun appel à `step()`) ne fait strictement pas avancer `world.time`, et
qu'après reprise seul le temps de simulation RÉELLEMENT écoulé compte
(jamais le temps réel passé en pause) ; reset confirmé à `world.clear()`
(nouvelle vague verrouillée à nouveau) ; les 14 bones utilisés existent
tous dans le vrai modèle GLB ; les deux `ProceduralAttackAnimator` (épée et
bouclier) tournent sans exception sur le vrai squelette, aucune valeur
non-finie, retour exact à la pose de repos en fin de clip ; distribution du
choix aléatoire ~50/50 sur 4000 tirages, aucune variante inaccessible.
Build propre (`npm run build`).

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** : lecture
visuelle des deux gestes (windup/frappe/récupération lisibles, silhouette
du bouclier qui reste bien orientée vers la cible), lequel bras porte
réellement l'épée (hérité de l'intégration initiale, toujours non confirmé),
timing exact de l'impact perçu par rapport aux dégâts déjà résolus,
ressenti du délai de 7 secondes en jeu réel. **Feedback UI "Disponible dans
X s" explicitement PAS construit** (point 41 de la demande, "secondaire...
ne construis pas une énorme UI si aucune capacité n'est actuellement
affichée" — confirmé : aucune UI de capacités n'existe pour l'instant dans
ce jeu).

## Passe polish / qualité de vie (2026-08-14)

Demande complète d'Antoine (~50 points, TO DO LIST numérotée) : "avant de
modifier, audite rapidement les systèmes concernés et réutilise les sources
de vérité existantes. Je ne veux pas de valeurs dupliquées dans l'UI et le
gameplay." Onze chantiers distincts, traités dans l'ordre de la demande.

**1. Icônes des parchemins** — FAIT. Deux icônes définitives fournies par
Antoine (dossier `C:\Users\Antoine\Desktop\Projet prodolphe\Sort de
bataille`, identifiées par inspection visuelle directe des fichiers, pas par
nom : motif de feuille verte = soin, motif de flocon bleu = Nova de glace)
copiées et redimensionnées (1000×1000/~1 Mo source → 128×128 PNG,
inutilement lourd pour une icône de 20-28px) dans
`public/textures/ui/battle-spells/`. `ui/itemIcons.ts`,
`IMAGE_ICON_SOURCES` — première exception du fichier à la règle "aucun
asset graphique" (déjà le cas ailleurs dans le projet pour les modèles
`.glb`, jamais pour une icône d'UI jusqu'ici) ; le générateur SVG par code
reste le repli pour tout futur objet sans icône dédiée. Utilisées partout où
l'ancienne icône générée apparaissait (inventaire, boutique) — un seul point
de résolution (`createItemIcon`), aucun site d'appel à modifier séparément.

**2. Formule de revenu de la Mine corrigée** — FAIT. Antoine : le palier
précédent (+0,5 or/s PLUS un bonus de +1,5 tous les 3 achats, voir chantier
"Le temps, c'est de l'argent" du même jour) était "beaucoup trop puissant".
Remplacé par une formule PUREMENT LINÉAIRE, sans palier :
`incomePerSecondBonus = niveau × 0,2`. `data/mineUpgrade.ts` —
`MineUpgradeDef.milestoneEveryLevels`/`milestoneBonus` retirés entièrement
(pas seulement mis à zéro, plus de mécanisme de palier du tout pour cette
amélioration), `goldPerSecondPerLevel: 0.5 → 0.2`. `run/mineUpgradeEffects.ts`,
`mineGoldPerSecondBonus`/`mineRemainingUntilMilestone`/
`mineNextPurchaseGrantsMilestone` simplifiés en conséquence (les deux
dernières retirées, plus aucun palier à annoncer). `ui/screens.ts`, la carte
boutique correspondante perd sa ligne "prochain palier" et son texte de
palier conditionnel. Aucun reset de progression nécessaire (demande
explicite) : les niveaux déjà achetés se recalculent simplement avec la
nouvelle formule au prochain rendu.

**3. Prix du Mage : 8 → 10 or** — FAIT. `data/units.ts`, `UNITS.mage.cost`.
`run/runState.ts`, `KILL_REWARD.mage` (moitié du prix boutique, même
convention que les 3 autres unités) 4 → 5. Aucune UI ne dupliquait ce
chiffre en dur — `ui/screens.ts` lit déjà `effectivePlayerUnitCost('mage',
progress)` dynamiquement (achat, prévisualisation, ×5) — donc aucun autre
site à corriger, conforme à l'exigence explicite d'Antoine ("ne hardcode pas
10 à plusieurs endroits").

**4-10. Refonte complète des barres de PV** — FAIT, chantier le plus
important de cette passe. Demande d'Antoine : avec des PV de plus en plus
élevés (Sentinelle, améliorations permanentes), le système de pips discrets
(un carré par tranche de 10 PV internes) produisait des barres de plus en
plus LARGES — "je ne veux plus que la largeur d'une barre soit
proportionnelle au nombre total de HP... la quantité de PV doit être
représentée uniquement par le REMPLISSAGE."

- **Largeur désormais FIXE par unité, dérivée de `UnitStats.radius`**
  (source de vérité déjà existante pour "la taille physique" d'une unité —
  réutilisée plutôt qu'un nouveau concept inventé, comme demandé) :
  `config/constants.ts`, `HEALTH_BAR_WIDTH_PER_RADIUS = 64` (px par unité de
  rayon monde), `HEALTH_BAR_WIDTH_MIN`/`MAX` (24/40px, protègent une future
  unité à rayon extrême — aucun clamp actif pour les 4 unités actuelles).
  Calibré pour que le Fantassin (radius 0.5) retombe EXACTEMENT sur la
  largeur visuelle de l'ancienne barre à 5 pips (32px) — zéro changement
  visuel pour le cas le plus courant. Résultat pour les 4 unités : Fantassin
  32px, Archer 29,4px, Mage 28,2px (le plus petit rayon → l'unité "la plus
  petite", cohérent avec son identité fragile), Sentinelle 38,4px (ratio
  1,2× le Fantassin, dans la fourchette "1,1 à 1,25× maximum" donnée par
  Antoine).
- **Remplissage = fraction de `hp/maxHp`**, jamais un décompte de pips
  discrets — `ui/combatOverlay.ts`, `updateFill` (remplace `updatePips`).
  `createBar(unitId, maxHp)` (remplace `createBar(maxHp)`) construit un
  conteneur `.health-bar-track` à largeur fixe + un `.health-bar-fill`
  rempli en pourcentage.
- **Segments décoratifs** ("un petit trait tous les 10 HP... mais ne crée
  surtout pas 50 petits carrés") : `HEALTH_BAR_SEGMENT_INTERVAL = 10`,
  `HEALTH_BAR_SEGMENT_MIN_PIPS = 20` — un trait tous les 10 PV AFFICHÉS
  (pips), uniquement si l'unité en a 20+ au total (Fantassin/Archer/Mage de
  base, 3-5 pips, n'en ont jamais ; Sentinelle de base, 50 pips, en a 4).
  Purement visuel, positionné en `%` de la largeur fixe, ne touche jamais au
  remplissage réel.
- **Shield plafonné à 100%** (jamais 150% comme avant) : le conteneur étant
  désormais de largeur fixe, laisser le Shield déborder n'aurait plus de
  sens — "le Shield ne doit pas allonger physiquement la barre".
- **Position (hauteur monde) par unité** : `UnitVisual.hpBarHeight?: number`
  (nouveau champ optionnel, absent = retombe sur `HP_BAR_WORLD_HEIGHT`
  comme avant). Mesuré HORS-LIGNE par script jetable (`THREE.Box3` sur
  chaque modèle réellement chargé, après son `*_MODEL_SCALE`, pas deviné) :
  hauteurs réelles Fantassin 1,369 / Archer 1,260 / Mage 1,293 / Sentinelle
  1,589 (monde). Seule la Sentinelle reçoit un override explicite
  (`data/units.ts`, `visual: { kit: 'sentinel', hpBarHeight: 1.51 }`) —
  calculé pour garder EXACTEMENT le même positionnement RELATIF
  (hauteur de barre / hauteur du modèle) que le Fantassin
  (`1.3 × 1.589/1.369 ≈ 1.51`), plutôt qu'une valeur devinée. Corrige le
  symptôme décrit par Antoine ("elle ne doit pas être au milieu du casque")
  sans toucher aux 3 autres unités, jamais critiquées. Pas de recalcul de
  BoundingBox coûteux en jeu (demande explicite) : une config statique, lue
  une fois par frame comme `HP_BAR_WORLD_HEIGHT` l'était déjà.
- Vérifié en headless (script jetable, VRAI `World`/`CombatOverlay` avec un
  shim DOM minimal, supprimé après usage) : largeur indépendante du maxHp
  (une Sentinelle avec `maxHp: 5000` en `statOverrides` a EXACTEMENT la même
  largeur que la Sentinelle de base), remplissage exact à 50%/100%,
  segments absents sous le seuil / exactement 4 pour la Sentinelle de base,
  Shield plafonné à 100% même avec un Shield 3× le maxHp, masqué à 0.
  18/18 vérifications passées. Build propre.

**11. Encart Gold aligné sur la largeur de "Boutique"** — FAIT. Antoine :
l'encart Or (`ui/goldHud.ts`) était visuellement plus étroit que le bouton
Boutique juste en dessous, cassant l'alignement. `ui/style.css`, nouvelle
variable partagée `--shop-panel-width: 120px` (dans `:root`) — lue
désormais par `.shop-button`, `.sell-zone` (le "Vendre", même colonne, même
famille visuelle) ET `.gold-hud` : les trois largeurs ne peuvent plus
diverger, un seul endroit à changer. `.gold-hud` gagne aussi
`justify-content: center` pour centrer son contenu comme le texte d'un
bouton, cohérent avec la maquette fournie par Antoine.

**12-14. Flash blanc de dégâts — bug réel trouvé et corrigé**, pas une
simple remise en place. Le mécanisme (`UnitViews.playHit`/`tickHitFlash`/
`setEmissive`) était toujours déclenché correctement (uniquement sur un
HIT réel, jamais miss/dodge — vérifié par lecture de code, comportement déjà
conforme aux points 13-14 de la demande) mais **totalement invisible depuis
le passage des 4 unités à des modèles riggés** (Mage/Fantassin/Archer/
Sentinelle) : chaque `*Rig.ts` verrouille `material.emissiveIntensity = 0`
au chargement pour neutraliser une lueur emissive BAKED-IN dans sa texture
d'origine — mais `setEmissive()` ne touchait jusque-là QUE `.emissive`
(la couleur), jamais `emissiveIntensity` (le multiplicateur). Rendu final =
`emissiveColor × emissiveIntensity` = blanc × 0 = invisible, quelle que soit
l'intensité demandée. Régression silencieuse, jamais un flash "retiré"
volontairement. `render/unitViews.ts`, `setEmissive` remonte désormais
`emissiveIntensity` à 1 tant que `intensity > 0`, et le redescend à 0 avec
le reste — la couleur seule continue de porter la dégradation du flash
(0→1), jamais `emissiveIntensity`. Shield-absorbed hit : déjà couvert
structurellement (`applyDamageToEntity` est appelé dans le MÊME chemin
`event.result === 'hit'` qu'un coup normal, que le Shield absorbe ou non —
aucun changement nécessaire). Vérifié en headless (VRAI
`THREE.MeshStandardMaterial`, reproduisant exactement le verrou de chaque
rig, script jetable supprimé après usage) : 11/11 vérifications, dont le
vrai chemin `playHit()` → `tickHitFlash()` bout en bout. Build propre.
**Non vérifiable de mon côté** : rendu visuel réel du flash — le diagnostic
s'appuie sur une lecture complète et croisée des 4 rigs + du code de flash,
sans mesure en jeu réel.

**15-36. Sélection multiple + vente groupée — refonte complète**. Ancien
système : deux variables mutuellement exclusives (`selectedSlot: number |
null`, `selectedGroup: number[] | null`) synchronisées à la main à ~15
endroits différents, et une vente strictement unitaire (`sellUnit(slotIndex)`)
sans aucun moyen de vendre plusieurs unités d'un coup ni de cliquer
directement sur "Vendre".

- **Unification** (point 35 de la demande : "évite de conserver
  selectedUnit dans dix endroits différents") : `main.ts`, `selectedSlot`/
  `selectedGroup` remplacés par une SEULE source de vérité,
  `selectedIndices: number[]` (tableau vide = rien, 1 élément = sélection
  simple, 2+ = groupe — plus de distinction de CAS entre les deux, chaque
  appelant lit juste `.length`). Fonctions dédiées `clearSelection()`/
  `setSelection(indices)`/`isSelected(index)` remplacent les mutations
  directes éparpillées — pas une classe `SelectionManager` à part entière
  (aurait été stylistiquement incohérente avec le reste du fichier, qui
  n'utilise que des fonctions de module, jamais de classes pour l'état de
  jeu) mais l'esprit de la demande (état centralisé, API dédiée) est
  respecté.
- **Clic simple** (point 16) : `selectSlot(index)` remplace TOUJOURS une
  sélection de groupe en cours par une sélection unique — sauf si l'unité
  cliquée était déjà la SEULE sélectionnée, auquel cas le clic désélectionne
  (toggle, comportement d'origine préservé).
- **Double-clic, plus de plafond** (point 18) : `DOUBLE_CLICK_SAME_TYPE_MAX`
  (20) retiré de `selectSameTypeGroup` — aucune justification technique
  réelle trouvée en l'auditant (ce n'est qu'un index/quelques anneaux HTML,
  sans rapport avec les coûts O(n²) de la simulation qui ne tournent que
  PENDANT la bataille, jamais pendant le placement). Toujours utilisé tel
  quel par l'éditeur de maps (`EditorState.selectSameTypeUnits`), contexte
  distinct non concerné par cette demande — laissé intact.
- **Box selection** (points 19-22) : déjà correcte avant cette passe
  (`selectUnitsInRect`, projection caméra réelle via `worldToScreen`, jamais
  une comparaison de coordonnées monde brutes ; ne parcourt que
  `placementSlots`, qui ne contient QUE l'armée du joueur en placement —
  ennemis/décor/corps morts en sont donc déjà exclus par construction, pas
  besoin de filtre supplémentaire ; seuil de 6px déjà dans la fourchette
  5-8px demandée) — migrée vers `setSelection` sans changement de
  comportement.
- **Vente centralisée** (points 26, 36 — "crée une fonction UNIQUE
  sellUnits(), le clic sur le bouton Vendre ET le drop sur la zone Vendre
  doivent tous deux appeler la MÊME logique") : `sellUnit(slotIndex)` →
  `sellUnits(indices: number[])`. Dédoublonne, trie DESCENDANT (supprimer du
  plus grand index au plus petit via `Array.splice` ne décale jamais un
  index pas encore traité), calcule la valeur totale via `computeSellValue`
  (nouvelle fonction PARTAGÉE avec l'affichage du bouton "Vendre" — jamais
  un montant approximé "count × valeur unique", point 26 explicite) qui
  réutilise la formule par-unité EXACTE déjà en place (barème normal
  `KILL_REWARD` ou 300% du coût effectif si "Recyclage" est éligible),
  reindexe toute sélection RESTANTE (généralisation de l'ancien reindexage
  à un seul élément — une vente peut ne concerner qu'UNE unité hors groupe
  pendant qu'une sélection sans rapport reste active, voir plus bas).
- **Glisser un GROUPE vers "Vendre"** (points 24-27, 33-34) : AUPARAVANT
  explicitement interdit ("jamais de vente proposée pour un glisser de
  groupe", commentaire d'origine) — le listener `mouseup` d'`unitDrag` teste
  désormais `sellZone.isPointOver(...)` EN PREMIER, pour un glisser simple
  COMME pour un glisser de groupe, avant toute logique de déplacement.
  `sellZone.showGhost` affiche "N unités" pendant un glisser de groupe (au
  lieu de rien avant) ; l'aperçu bleu de destination (mousemove) est
  désormais masqué au survol de la zone Vendre pour un glisser de groupe
  aussi (ne l'était que pour un glisser simple avant).
- **Bouton "Vendre" cliquable directement** (points 28-31) : `ui/sellZone.ts`,
  `SellZoneHandlers.onSellSelection` (nouveau) — `dropZone` reste un
  `<div>` (pas un `<button>`, un vrai bouton aurait compliqué le geste de
  glisser déjà existant selon les navigateurs) mais gagne un listener
  `click` qui appelle `onSellSelection` SEULEMENT si une sélection existe
  (`hasSelection`, posé par `setSelection`). `main.ts`,
  `onSellSelection: () => sellUnits(selectedIndices)`. Nouvelle méthode
  `SellZone.setSelection(count, totalValue)` — appelée depuis UN SEUL
  endroit (`refreshPlayerPreview`, déjà invoqué après tout changement de
  sélection/armée) : affiche "Vendre" simple si `count === 0` (bouton
  visuellement atténué, `.sell-zone--inactive`, clic sans effet), sinon
  "Vendre (N)" + "+X or" en dessous (point 29, format optionnel mais retenu
  — lisible). Sert AUSSI de compteur de sélection en direct (point 23 :
  "je veux immédiatement voir combien d'unités sont sélectionnées"), sans
  code supplémentaire puisque `refreshPlayerPreview` tourne déjà à chaque
  changement de sélection.
- **Pas de vente accidentelle** (point 30) : un clic simple sans glisser
  passe toujours par `selectSlot`, jamais par `sellUnits` — vérifié par
  relecture du chemin complet mousedown/mouseup.
- Vérifié en headless (réimplémentation FIDÈLE de l'algèbre de sélection —
  `main.ts` non importable directement, effets de bord DOM/canvas au
  chargement, même limite documentée partout ailleurs dans ce fichier pour
  main.ts ; script jetable supprimé après usage) : toggle du clic simple,
  remplacement d'un groupe par un clic simple, déduplication, vente simple
  avec reindexation d'une sélection SANS RAPPORT, vente de groupe (valeur =
  somme exacte de 3 types différents, jamais count×valeur), vente PARTIELLE
  d'un groupe sélectionné (glisser une seule unité hors du groupe complet —
  les autres membres restent sélectionnés, correctement reindexés), indices
  invalides/doublons ignorés proprement, `sellUnits([])` no-op. 19/19
  vérifications passées. Build propre (`tsc --noEmit` + `vite build`) après
  chaque étape.

**Non vérifiable de mon côté — aucun accès visuel** (comme pour tout ce
chantier de rendu/UI) : rendu réel des barres de PV compactées, lisibilité
du bouton "Vendre (N) +X or", comportement du glisser de groupe vers Vendre,
alignement pixel-parfait Gold/Boutique, apparence du flash blanc corrigé —
à confirmer et ajuster par Antoine en jeu réel.

## Flash blanc de dégâts sur chaque tick du Blizzard + Sentinelle à 10 runes (2026-08-15)

Deux demandes courtes d'Antoine dans le même message.

**Flash blanc sur les ticks du Blizzard** — le flash existant (`unitViews.playHit`)
couvrait déjà le combat automatique, la Charge, l'impact de la Boule de feu
du Mage et la flèche du joueur, mais jamais les dégâts de zone RÉCURRENTS du
Blizzard (`sim/systems/persistentAreaEffects.ts`, `tickPersistentAreaEffects`) :
cette fonction appliquait déjà les dégâts correctement mais ne renvoyait
aucune information sur QUI avait été touché à quel tick, donc `main.ts`
n'avait rien à consommer pour déclencher le flash.

- `sim/systems/persistentAreaEffects.ts` : nouveau type `AreaEffectTickEvent`
  (`x`, `z`, `radius`, `hitIds: number[]`) — même forme que l'`AbilityEvent`
  `'blast-impact'` déjà existant (Boule de feu du Mage), pour rester
  cohérent. `tickPersistentAreaEffects` renvoie désormais un
  `AreaEffectTickEvent[]` (un par tick RÉELLEMENT résolu — généralement 1 par
  appel à 30 Hz, potentiellement plusieurs si la boucle `while` interne
  rattrape un retard) au lieu de `void` ; `hitIds` liste les entités
  RÉELLEMENT touchées par CE tick précis (jamais les cibles au moment de la
  création de la zone — chaque tick re-scanne qui est vraiment dans le rayon
  à cet instant, comportement déjà existant, juste maintenant rapporté).
- `sim/world.ts` : nouveau `World.areaEffectEvents: AreaEffectTickEvent[]`,
  vidé et repeuplé à chaque `step()` (même motif que `combatEvents`/
  `abilityEvents`), remis à `[]` dans `clear()`.
- `main.ts` : nouvelle boucle juste après celle sur `world.abilityEvents`
  (dans la boucle de rendu) — `for (const event of world.areaEffectEvents) {
  for (const id of event.hitIds) unitViews.playHit(id); }`. Un tick sans
  aucune cible dans le rayon à cet instant ne déclenche aucun flash
  (`hitIds` vide).
- Vérifié en headless (script jetable, VRAI `World`/`step()` à 30 Hz,
  supprimé après usage) : aucun évènement avant le premier tick (~t=1s),
  exactement 1 évènement au tick, les 2 ennemis dans le rayon bien inclus
  dans `hitIds`, l'ennemi hors de portée exclu, l'allié du lanceur exclu
  (pas de friendly fire), aucun résidu au pas suivant, une unité tuée entre
  deux ticks n'est plus jamais incluse au tick suivant, `clear()` vide bien
  `areaEffectEvents`/`iceNovaZones`. **Piège rencontré en écrivant ce test** :
  `World.obstacles` démarre avec la carte codée en dur historique
  (`OBSTACLES`) par défaut — un obstacle proche de l'origine poussait les
  unités de test hors du rayon de la zone avant même le premier tick,
  simulant un faux drift qui n'avait rien à voir avec la séparation entre
  corps (piste explorée en premier, écartée après mesure) ; corrigé en
  vidant `world.obstacles = []` explicitement en tête de script. Build
  propre. **Non vérifiable de mon côté** : rendu visuel réel du flash sur
  chaque tick — à confirmer par Antoine en jeu.

**Sentinelle : coût de base remonté à 10 runes** — `data/sentinelUpgrade.ts`,
`SENTINEL_UPGRADE.baseRuneCost` 1 → 10. Tranche la divergence déjà notée
lors de l'intégration initiale (2026-08-14, la demande d'origine donnait "1
Rune" au premier achat, littéralement différent des 5 autres améliorations
permanentes déjà à 10). Antoine confirme explicitement et pose une **règle
permanente pour toute future amélioration** : "de toute manière quand tu
ajoutes un truc dans la boutique d'amélioration, fais-le commencer à 10" —
les 6 améliorations de la boutique (Fantassin/Archer/Mage, Baliste,
Parchemin de soin, Nova de glace, Mine, Sentinelle) partagent désormais
toutes le même point de départ. Vérifié en headless (les 8 `baseRuneCost` —
5 entrées `UNIT_UPGRADES` + Baliste/Parchemin/Nova/Mine/Sentinelle — valent
bien 10). Build propre.

## Passe gameplay du 2026-08-15 : seuil "Aux petits oignons", bug Nova/Baliste, Sentinelles ennemies, déblocage d'unités générique, VFX Fireball, "Soins excédentaires"

Demande unique d'Antoine, très large (~83 points numérotés), sept chantiers
distincts traités "par blocs cohérents" comme demandé, avec un audit complet
avant tout code (16 systèmes inspectés par lecture directe, 5 questions
préalables répondues explicitement avant d'écrire une ligne).

**1. Talent "Aux petits oignons" — seuil relatif à 30%, franchissement
uniquement.** `config/constants.ts`, `AUTO_HEAL_TRIGGER_RATIO = 0.3` — un
RATIO (`hp/maxHp <= 0.3`), jamais une valeur de PV absolue (vérifié valable
aussi bien pour un fantassin à 10 PV que pour une Sentinelle à 50). `main.ts`,
`belowAutoHealThreshold: Set<number>` (même patron que `rewardedEnemyDeaths` :
détection par TRANSITION, vidé aux 5 sites `world.clear()` déjà existants) —
le déclenchement automatique n'a lieu qu'au moment où une unité FRANCHIT le
seuil vers le bas (ajoutée au Set), jamais tant qu'elle y reste ; retirée du
Set (réarmée) uniquement quand elle repasse STRICTEMENT au-dessus de 30% via
un vrai soin. Nouvelle fonction centrale `applyPlayerHeal(target, maxHp,
requestedHeal, entityId)` — SOURCE UNIQUE du calcul de soin appliqué/
excédentaire, réutilisée par les 3 sources de soin du joueur (parchemin
manuel en bataille, déclenchement automatique d'Aux petits oignons, cibles
secondaires de l'amélioration du parchemin) ; retourne `{actualHeal,
overheal}` et gère elle-même le réarmement du seuil au passage — un seul
point de calcul, jamais dupliqué.

**2. Bug corrigé : la Nova de glace déclenchait aussi un tir de Baliste sur
le même clic.** Diagnostic : `fireButtonHeld` (mécanisme du maintien de clic
pour "Tir rapide") était posé INCONDITIONNELLEMENT dans le listener
`mousedown`, avant même de savoir si le clic servait à armer/utiliser un
objet — `attemptAutoFire()` (appelée depuis le pas de simulation fixe)
consommait ensuite ce flag et déclenchait un tir fantôme. Corrigé à la
racine (pas un patch DOM `stopPropagation`) : le listener vérifie désormais
`armedItemIndex !== null` EN PREMIER — si un objet est armé, seul
`handleBattleFireClick` (qui consomme l'objet) s'exécute, `fireButtonHeld`
n'est jamais posé. `armInventorySlot` remet aussi `fireButtonHeld = false`
explicitement dès qu'un objet vient d'être armé — couvre le cas où le
maintien de clic était DÉJÀ actif (Tir rapide) au moment d'armer un sort.

**3. Sentinelles ennemies à partir de la vague 10, génération rare.**
`config/constants.ts`, `ENEMY_SENTINEL_START_WAVE = 10`/
`ENEMY_SENTINEL_INTERVAL = 5`. `run/runState.ts`,
`EnemyWaveComposition.sentinel` — 0 avant la vague 10, garantie ≥1 à la
vague 10, puis un palier tous les `ENEMY_SENTINEL_INTERVAL` vagues (pas
+1 systématique par vague, demande explicite "génération rare/coûteuse").
ADDITIVE au Mage déjà présent depuis `MAGE_UNLOCK_WAVE` (8) — jamais un
remplacement, les deux coexistent. `main.ts`, `computeEnemyWavePlacements`
étend la liste d'unités à poser avec `composition.sentinel` exemplaires ;
`layoutFormation` (mêlée devant/tir derrière) place déjà correctement une
Sentinelle en mêlée sans aucun cas spécial.

**4. Système générique de déblocage d'unités (Mage, Sentinelle).**
`data/units.ts`, `UnitDef.playerUnlockMode?: 'starter' | 'defeatEnemy'` —
absent ou `'starter'` = toujours achetable (Fantassin/Archer, jamais
verrouillés) ; `'defeatEnemy'` = requiert d'avoir vaincu au moins une fois
CE type d'unité comme ENNEMI (Mage, Sentinelle). `run/metaProgress.ts` :
`unlockedUnits: string[]` remplacé par `defeatedEnemyUnitIds: string[]` — la
sauvegarde stocke le FAIT ("ce type a été vaincu"), pas une conclusion
dérivée, explicitement pour être réutilisable plus tard (bestiaire,
succès, stats). `hasDefeatedEnemyUnit`/`registerEnemyDefeat`/
`canPlayerRecruitUnit` (dérive le statut depuis `playerUnlockMode` +
`defeatedEnemyUnitIds`, jamais un `if unitId === 'mage'` codé en dur —
s'applique automatiquement à toute future unité avec ce mode). Migration
rétro-compatible depuis l'ancien `unlockedUnits` (players qui avaient déjà
débloqué le Mage sous l'ancien système vague-8) via `mergeLegacyUnlockedUnits`,
appliquée à la fois dans `migrateToV2` (vieilles sauvegardes) et dans le
chargement normal (sauvegardes déjà en v2 mais écrites avant ce changement) —
sans ça, le Mage aurait été silencieusement re-verrouillé pour ces joueurs.
Déclenché au moment EXACT de la mort de l'ennemi (`main.ts`, boucle de
détection `rewardedEnemyDeaths`, transition), pas seulement à la victoire de
la vague. `ui/unitUnlockToast.ts` (nouveau, même patron que
`TalentPointToast`) : toast non-bloquant "Nouvelle unité débloquée : X" à la
première défaite de ce type. "Effacer la sauvegarde" efface aussi
`defeatedEnemyUnitIds` (déjà couvert par `resetMetaProgress`, qui reset tout
le bloc).

**5. VFX de la Boule de feu du Mage enrichis — AUCUN changement de
gameplay.** Nouvelles textures Kenney "Particle Pack" (CC0, même licence déjà
utilisée) sélectionnées après inspection visuelle directe (`flame_05.png` —
langue de flamme nette, `flame_02.png` — variante plus blobby, `smoke_02.png`,
`light_01.png` — halo radial doux) copiées dans `public/textures/vfx/`.
Palette dédiée (`config/constants.ts`, `fireCoreBright`/`fireOuterGlow`/
`fireEmberDark`/`fireSmokeTint`) conforme aux couleurs demandées (centre
jaune clair/blanc chaud, flammes orange = `fireGlow` existant réutilisé,
extérieur rouge-orange, braises orange sombre/rouge, fumée grise-brune
discrète). `render/fireballView.ts` : 3 sprites de flammes texturées
orbitant le noyau avec un scintillement à PHASE INDÉPENDANTE PAR SPRITE
(calculée une fois à la construction, jamais par frame) ; un halo externe
rouge-orange (sprite `light_01`) pulse à une phase différente de la coque
pour éviter un pompage synchrone ; dégradé de couleur sur la traînée
existante (orange proche → braise sombre loin, "fragments qui refroidissent") ;
impact enrichi avec 3 flammes qui giclent + 2 sprites de fumée discrète en
fondu NORMAL (pas additif — un fondu additif ne peut pas rendre une teinte
"discrète" sur un fond déjà lumineux, même leçon déjà tirée pour le cœur du
parchemin de soin) qui montent lentement et s'attardent plus longtemps que
le reste de l'impact. **Aucune nouvelle PointLight** : le `LightPool` fixe
déjà en place (jamais de lumière ajoutée/retirée de la scène, cause du
freeze déjà corrigé le 2026-08-11) reste intact, tous les matériaux
sprite/texture sont GABARIT partagés au niveau du module puis CLONÉS par
instance de projectile/impact (borné par bataille, jamais par frame).
Dégâts/rayon/cadence/temps d'incantation/ciblage/télégraphe/mort du Mage :
strictement inchangés, aucun de ces fichiers touché.

**6. Nouveau talent "Soins excédentaires" — Palier II, sous "Aux petits
oignons".** `data/talents.ts` : entrée `soins_excedentaires`, branche
`soigneur`, `requires: 'aux_petits_oignons'`, coût 2 (même convention que
les 3 autres talents de Palier II déjà en place — Recyclage/Le temps c'est
de l'argent/Mitraillette). Positionné automatiquement dans l'arbre
(centré sous son parent, même ligne que les autres Palier II) par le
système générique `talentTier`/`talentsByTier`/`computeTalentTreeLayout`
déjà en place — AUCUN changement d'UI nécessaire pour l'ajouter.

**7. Système "Projectile d'ombre" (sim + render) — VRAI projectile simulé,
pas un dégât instantané déguisé.** Nouveau `sim/systems/shadowProjectiles.ts` :
`ShadowProjectile` HOMING (suit la position ACTUELLE de sa cible à chaque
tick, contrairement à la Boule de feu qui vise un point verrouillé) — vit
directement dans `World.shadowProjectiles` (comme `World.blasts`), pas sur
une `Entity` (le joueur n'est pas une entité). `pickShadowTargets` :
sélection par MÉLANGE (Fisher-Yates, RNG déterministe de la bataille —
jamais `Math.random()`) plutôt qu'un tirage indépendant à chaque projectile,
pour préférer des cibles DISTINCTES ; un nouveau mélange redémarre seulement
une fois toutes les cibles déjà visées une fois. `advanceShadowProjectiles` :
résout l'impact (`applyDamageToEntity`, même fonction que tout le reste du
jeu) dès que la distance à la cible passe sous un petit rayon d'arrivée ; si
la cible meurt en vol, retente une cible vivante aléatoire simple ; si aucun
ennemi ne reste vivant, le projectile se DISSIPE silencieusement (retiré,
aucun dégât, aucune erreur). `World.spawnShadowProjectiles(x, z, casterTeam,
count, damagePerProjectile, speed)` — sans effet si `count <= 0` ou aucun
ennemi vivant (l'overheal est alors simplement PERDU). `render/
shadowProjectileView.ts` (nouveau) : orbe sombre (cœur presque noir + halo
violet/magenta, texture `light_01` réutilisée), courte traînée de 3
particules (positions tirées d'un historique borné de positions passées,
pas une trajectoire paramétrique comme la Boule de feu — le projectile est
homing, pas à durée fixe), petit impact violet SOBRE — délibérément PAS de
grosse explosion, PAS de PointLight (effet trop fréquent/petit pour
justifier le coût). `main.ts`, `triggerShadowProjectiles(x, z,
totalOverhealInternal)` : GATE sur le talent lui-même en premier
(`isTalentActive('soins_excedentaires')`, réévalué à CHAQUE appel, jamais
mis en cache) — sans lui, le mécanisme entier n'existe pas, même à 0 dégât
de base. `baseProjectileCount = floor(totalOverhealInternal / HP_PER_PIP)`
(1 projectile par point de soin excédentaire AFFICHÉ, jamais un total
fractionnaire qui produirait un demi-projectile) ; `count = baseProjectileCount
+ bonusProjectileCount` UNIQUEMENT si `baseProjectileCount > 0` (0 overheal
→ toujours 0 projectile, même au niveau 30 de l'amélioration permanente).
Branché aux 2 usages manuels/automatiques du parchemin de soin en BATAILLE
uniquement — jamais en placement (aucun ennemi n'existe encore).

**8. Amélioration permanente "Soins excédentaires" (boutique du menu
titre).** `data/shadowUpgrade.ts`/`run/shadowUpgradeEffects.ts` — même
famille générique `RuneCostDef`/`nextUpgradeCost` que Baliste/Parchemin de
soin/Nova de glace/Mine/Sentinelle. **Coût de départ 10 runes, ×2 par
achat** — PAS la valeur "1" initialement donnée dans la demande d'Antoine :
il a explicitement tranché dans un message plus récent et plus général
("de toute manière quand tu ajoutes un truc dans la boutique d'amélioration,
fais-le commencer à 10") que toute NOUVELLE amélioration suit cette
convention, y compris celle-ci — appliqué en conséquence. Formules :
`shadowDamagePerProjectileDisplay(level) = 1 + level*0.5`,
`shadowBonusProjectileCount(level) = floor(level/3)`. `ui/screens.ts`,
carte dédiée `buildShadowUpgradeCard` — **MASQUÉE tant que le talent
"Soins excédentaires" n'est pas débloqué** (même convention que la carte
Mine pour "Le temps, c'est de l'argent") : améliorer un mécanisme qu'on ne
peut pas encore utiliser n'aurait pas de sens. Point important vérifié
explicitement : si le talent est ensuite RETIRÉ par un reset de l'arbre
("Réinitialiser les talents"), le NIVEAU d'amélioration déjà acheté N'EST
JAMAIS supprimé de la sauvegarde — seul son EFFET redevient nul (0
projectile) tant que le talent n'est pas re-débloqué, et il se réactive
AUTOMATIQUEMENT au niveau déjà payé dès que le joueur rachète le talent,
sans aucun code spécial : ceci découle simplement du fait que
`triggerShadowProjectiles` réévalue le gate à chaque appel plutôt que de
mettre en cache un état "actif".

**Vérifié en headless** (script jetable avec `npx tsx`, imports des VRAIS
modules + `World`/`Rng` réels, supprimé après usage, 80/80 vérifications) :
franchissement du seuil 30% (proc unique, pas de re-proc sous le seuil,
réarmement uniquement après un vrai soin au-dessus, testé sur une unité à 10
PV ET une à 50 PV) ; composition ennemie sans Sentinelle vagues 1-9, garantie
≥1 dès la vague 10, pas de progression systématique +1/vague, Mage toujours
présent en plus ; déblocage d'unité (starters toujours ouverts, Mage/
Sentinelle verrouillés sur sauvegarde neuve, déblocage immédiat à la première
défaite ennemie, persistance après reload, reverrouillage par "Effacer la
sauvegarde", migration depuis l'ancien `unlockedUnits`) ; position du talent
dans l'arbre (palier 2, enfant direct d'Aux petits oignons, coût 2) ;
Shadow Projectile de bout en bout via un VRAI `World` (ciblage distinct par
mélange, 0 projectile si aucun ennemi vivant, dégâts/vitesse copiés
correctement, vol réel + résolution + dégâts RÉELLEMENT appliqués via
plusieurs vrais `world.step()`, retargeting sur mort de cible en vol,
dissipation silencieuse sans ennemi restant, nettoyage complet par
`world.clear()`) ; formules de l'amélioration permanente (séquence de coût
10/20/40/80, dégâts et bonus de projectile à plusieurs niveaux, palier
"remaining" exact) ; et le scénario critique bout en bout "0 overheal → 0
projectile même au niveau 30" + "reset des talents préserve le niveau mais
neutralise l'effet, re-déblocage réactive automatiquement". Build propre
(`npm run build`, `tsc --noEmit` zéro erreur, `vite build` réussi).

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** (comme
pour tout ce projet) : lisibilité des nouvelles flammes/halo/fumée de la
Boule de feu à la caméra de jeu, apparence réelle de l'orbe d'ombre et de
son impact, mise en page de la nouvelle carte de boutique et du nouveau
nœud d'arbre de talents, ressenti du geste de maintien de clic après le
correctif Nova/Baliste, équilibrage du taux d'apparition des Sentinelles
ennemies en jeu réel — à confirmer et ajuster par Antoine.

## Grosse passe VFX + éditeur : librairie VFX partagée, Fireball/Shadow refaits, placement libre + cellules éparses (2026-08-16)

Demande unique d'Antoine, très large (~46 sections, deux chantiers parallèles :
VFX et éditeur), avec audit complet exigé avant tout code. Implémenté dans
l'ordre de priorité donné (Part AT).

**VFX — librairie partagée** (`render/vfx/`, nouveau dossier) :
`vfxMaterials.ts` (gabarit de matériau texturé/décalque/coeur mis en cache
par `(texture,couleur,blending,opacité)`, cloné par instance — jamais par
frame), `lightPool.ts` (extraction générique de l'ancien `LightPool` de
`fireballView.ts`), `orbitingSprites.ts` (anneau de sprites qui orbitent en
scintillant, partagé entre les flammes de la Boule de feu et les volutes du
projectile d'ombre), `radialBurst.ts` (salve de particules qui giclent puis
retombent, partagée entre braises/flammes radiales/motes d'impact),
`VfxManager.ts` (registre nommé `spawn('fireballImpact'|'shadowImpact',
params)` pour les deux VFX réellement ponctuels — les traînées/projectiles
en vol restent pilotés par `.sync(état simulation, dt)` sur les classes
dédiées, jamais forcés dans une API `spawn`, choix explicite pour éviter une
fausse généralisation).

**Assets sélectionnés** dans `C:\Users\Antoine\Desktop\Projet prodolphe\vfx\
PNG (Transparent)\` (jamais le dossier `PNG (Black background)\`, qui
contient les MÊMES fichiers sans canal alpha réel — inutile ici) : `flame_02/
05/06.png`, `fire_01.png`, `muzzle_02.png` (flash de Fireball), `scorch_01.png`
(décalque de brûlure), `smoke_02.png`, `light_01.png` (halos), `magic_01.png`,
`twirl_01/02.png` (volutes d'ombre), `star_02.png` (flash de l'ombre) —
copiés dans `public/textures/vfx/`. Kenney "Particle Pack" (CC0), pack
générique en niveaux de gris pensé pour être teinté par matériau — aucun
fichier littéralement nommé "shadow"/"purple"/"vortex" dans le pack, mais
`twirl`/`magic`/`smoke` teintés violet/magenta jouent exactement ce rôle.

**Fireball du Mage** (`render/fireballView.ts`, réécrit sur la nouvelle
librairie) : noyau (coeur quasi blanc + coque orange, deux sphères
imbriquées) + double halo (intérieur chaud, extérieur rouge-orange, phases
de pulsation différentes) + 5 sprites de flammes texturées orbitantes
(scintillement ET rotation individuels, matériau cloné par sprite) +
traînée dégradée (orange→braise sombre) avec un soupçon de fumée qui traîne
+ impact enrichi (flash blanc/jaune bref, explosion orange existante,
FLAMMES RADIALES texturées qui giclent — nouveau, distinct de l'onde
verticale —, braises texturées, anneau + décalque de brûlure au sol, fumée
légère). Aucun changement de dégâts/rayon/targeting/cast time/trajectoire/
cadence — uniquement le rendu. `LightPool` fixe inchangé dans son principe
(jamais de PointLight ajoutée/retirée en cours de partie).

**Projectile d'ombre** (`render/shadowProjectileView.ts`, réécrit) : noyau
sombre + halo violet (opposition centre sombre/bord lumineux demandée),
3 volutes orbitantes (twirl, teinte violette), traînée courte qui suit
l'historique RÉEL de positions (courbe naturellement puisque le projectile
est homing — jamais une ligne droite parfaite), impact SOBRE et RAPIDE
(flash magenta bref + anneau qui IMPLOSE, contrairement à l'anneau qui
explose de la Fireball — signature visuelle distincte — + quelques
particules). **Lisibilité en nombre** (Part H) : `crowdFactor(count)`
réduit automatiquement échelle ET opacité de chaque orbe au-delà de 8
projectiles simultanés (plancher à 30, jamais en dessous de 50% d'échelle/
60% d'opacité) — recalculé à chaque frame depuis le nombre RÉEL de
projectiles en vol, donc redevient plein régime dès que la salve se
résorbe. Toujours AUCUNE PointLight (effet trop petit/fréquent pour
justifier le coût).

**Vérifié en headless** (`npx tsx`, shim DOM minimal pour `THREE.TextureLoader`,
16 vérifications sur les deux vues avec 1/5/10 Mages et 1/5/15/30
projectiles d'ombre simultanés, aucune exception, réduction d'échelle
confirmée au-delà du seuil de foule) — le rendu visuel réel (lisibilité,
teintes, absence de carré noir) reste à confirmer par Antoine, aucun accès
à l'écran de mon côté.

---

**Éditeur — clic droit** (Part J) : en mode éditeur, clic droit annule le
placement en cours (`editorState.setTool({type:'select'})`) si un outil de
pose est actif, sinon désélectionne (`editorState.select(null)`) — même
logique que la touche Échap déjà existante, ajoutée dans le listener
`mousedown` du clic droit (le pan de caméra démarre normalement juste
après). Le menu contextuel du navigateur était déjà empêché sur tout le
canvas (`contextmenu` → `preventDefault`), rien à changer là.

**Placement libre des décors** (Part K-S) : `ObstacleDef` gagne des champs
`x?`/`z?` (position continue, monde) — PRIORITAIRES sur `cornerX`/`cornerZ`
(coin de grille, conservés uniquement pour la compatibilité des maps
antérieures). Nouvelle fonction `obstacleCenter(o)` (config/constants.ts,
SOURCE UNIQUE) dérive le centre depuis `x`/`z` si présent, sinon depuis
`cornerX + tilesX/2` comme avant — reprise dans les 4 fabriques de rendu
(rocks/trees/props/buildings.ts), `sim/geometry.ts` (`obstacleBounds`,
comportement bit-à-bit identique pour toute donnée déjà existante, vérifié)
et l'éditeur (repositionnement, anneau de sélection). Tous les obstacles
(rocher/arbre/prop/bâtiment) sont désormais en placement LIBRE — seuls les
UNITÉS et les CELLULES DE TERRAIN restent grid-snappées (distinction faite
au niveau du TOOL utilisé — `place-obstacle` = libre, `place-unit`/
`add-cell` = grille — plutôt qu'un champ `placementMode` dupliqué sur
chaque asset). `EditorState.placeAt`/`moveSelected` prennent désormais des
coordonnées continues sans arrondi.

**Déplacement/rotation précis** (Part M-P) : `THREE.TransformControls`
(déjà disponible via `three/addons`) attaché UNIQUEMENT à l'obstacle
sélectionné (jamais une unité) — mode `translate` (W) restreint au plan XZ
(poignées Y/XY/YZ masquées, `position.y` reclampé à 0 par sécurité), mode
`rotate` (E) restreint à l'axe Y (poignées X/Z masquées). Conflit avec les
raccourcis caméra existants (E = zoom avant) résolu comme R l'était déjà :
E ne bascule le gizmo QUE si un obstacle est sélectionné en mode éditeur,
sinon zoome comme avant. Rotation libre par défaut, Shift accroche à 15°
(`transformControls.rotationSnap`). Le flag `dragging-changed` (exposé par
TransformControls, se met à jour de façon synchrone AVANT que notre propre
listener `mousedown` ne s'exécute, grâce à l'ordre `pointerdown`→`mousedown`
du navigateur) empêche notre logique de sélection/clic d'interférer avec
une poignée de gizmo en cours de saisie.

**Undo/redo** (Part U) : `editor/history.ts`, `EditorHistory` — pile
`{undo,redo}` générique et minimale. Coalescé en UNE SEULE commande par
geste : `TransformControls` capture la transform de départ sur `'mouseDown'`
et pousse la commande sur `'mouseUp'` (jamais sur `'objectChange'`, qui
tourne à chaque frame de drag) ; l'ajout/suppression de cellule pousse aussi
une commande par clic. Raccourcis Ctrl+Z / Ctrl+Y (+ Ctrl+Maj+Z), actifs
uniquement en mode éditeur. **Scope V1 assumé** : couvre déplacement/
rotation d'obstacle et ajout/suppression de cellule, PAS la
placement/suppression d'obstacle/unité ni la rotation par pas de 90°
(bouton "Tourner"/touche R, restés inchangés) — `EditorHistory` reste
assez générique pour être étendu si demandé.

**Cellules de terrain éparses** (Part X-AL, le plus gros morceau
architectural) : `config/mapDef.ts` — `MapDef.cells?: TerrainCellDef[]`
(sparse, coordonnées `x`/`z` STABLES dans la même convention que
`cornerX`/`cornerZ`, jamais un index de tableau) ; `resolveMapCells(map)`
synthétise un rectangle plein 'grass' pour toute map SANS `cells` (TOUTES
les maps actuelles) — zéro migration, comportement identique à avant ;
`computeMapCellBounds`/`buildCellIndex` pour l'emprise réelle et le lookup
O(1). `World.setMap` : dérive `boardWidth`/`boardHeight` par un "PADDING
symétrique" autour de l'origine qui englobe l'emprise réelle des cellules
(peut être asymétrique si des cellules ont été ajoutées au-delà du
rectangle d'origine) — pour une map rectangulaire classique, ce padding ne
change RIEN (retombe exactement sur `map.width`/`map.height`). Chaque case
ABSENTE de l'emprise paddée devient un obstacle "vide" synthétique
(`computeVoidObstacles`, jamais rendu, injecté uniquement dans
`World.obstacles`) — **choix architectural central** : réutilise TEL QUEL
tout le pipeline de collision/ligne de tir/pathfinding déjà existant
(`resolveObstacleCollisions`, `findBlockingObstacle`, `buildPathGrid`...)
sans qu'aucun de ces systèmes n'apprenne la notion de "cellule" — zéro
changement de signature dans `movementSystem`/`abilitySystem`/
`sim/pathfinding.ts`. Un trou bloque donc le mouvement/la ligne de tir/le
pathfinding exactement comme un rocher, gratuitement.

**Rendu par cellule** (`render/terrainCells.ts`, nouveau, partagé jeu +
éditeur) : un `THREE.InstancedMesh` PAR TYPE DE TERRAIN (herbe/terre) — un
draw call par type quel que soit le nombre de cellules. **Compromis
assumé** : remplace le relief en strates (herbe/topsoil/subsoil empilés,
`createGroundBlock` retiré) par UNE SEULE épaisseur par cellule, et chaque
cellule affiche la même texture sans variation par instance — documenté
explicitement, pas un oubli. Grille visuelle (`buildCellGridLines`) dessinée
uniquement sur le pourtour des cellules RÉELLEMENT présentes.

**Éditeur — outils Ajouter/Supprimer case** (Part X-AI) : `EditorState`
gagne un `cellMap: Map<string,TerrainCellDef>` (clé `cellKey(x,z)`),
`addCell`/`removeCell`/`canAddCell`/`canRemoveCell` (les deux `can*`
partagées entre l'action réelle et l'aperçu vert/rouge, jamais deux
implémentations séparées). `removeCell` refuse si une unité ou un obstacle
COLLIDABLE (jamais un prop traversable) occupe la case. Nouveaux outils
`EditorTool` (`add-cell`/`remove-cell`) — contrairement au placement
d'obstacle/unité, restent ACTIFS après chaque clic (tampon répétable, Part
Y). `setSize` ne fait plus que REMPLIR (jamais retirer) les cellules
manquantes du nouveau rectangle. `render/editorScene.ts`,
`buildCellPreview(x,z,valid)` — aperçu vert/rouge, toujours aligné sur la
grille (Part AG). Boutons "+ Case (Herbe)"/"+ Case (Terre)"/"− Supprimer
case" dans la barre d'outils (`editor/editorUI.ts`).

**Une unité ne peut être placée/déplacée que sur une cellule existante**
(Part AL) : `EditorState.placeUnitAt`/`moveSelectedUnit`/`moveSelectedGroup`
vérifient désormais `hasCellAt` (tout-ou-rien pour un groupe) — scope
éditeur uniquement pour cette passe (la phase de placement du jeu réel,
`main.ts` `isValidPlacementTile`, n'a pas été rendue consciente des
cellules : aucune map jouée aujourd'hui n'a de trou dans sa zone de
placement, gap connu et assumé, à corriger si/quand une map irrégulière
est un jour chargée comme map de campagne réelle).

**Sauvegarde** (`editor/mapSerializer.ts`) : `exportMapDef` inclut désormais
`cells: state.cells` (liste sparse telle quelle, jamais une matrice pleine
reconstituée) ; `loadMapDefFromFile` relit `cells` s'il est présent, absent
sinon (ancien format). Positions `x`/`z`/`rotationY` des obstacles libres
conservées EXACTEMENT (jamais converties en coordonnées de cellule).

**Vérifié en headless** (`npx tsx`, deux scripts jetables supprimés après
usage, 15+36 vérifications) : `obstacleCenter`/`obstacleBounds` (rétro-
compat exacte ancien format, priorité x/z, équivalence bit-à-bit) ;
placement libre + déplacement + rotation + export/reload JSON round-trip
exact ; `EditorHistory` (push/undo/redo/clear, coalescence "une commande
par drag entier" simulée sur 60 frames) ; `World.setMap` avec un VRAI trou
intérieur (obstacle synthétique exact, `findPath` contourne bien, chemin ne
traverse jamais la case) ; extension hors bornes (Part AA — `boardWidth`
grandit, la nouvelle cellule est praticable, la colonne de padding miroir
est bloquée) ; `EditorState` cellules (add/remove/can*, refus si unité/
obstacle collidable, prop traversable n'empêche rien, Part AL unité refusée
hors cellule, `setSize` additive uniquement, sérialisation/reload fidèle,
compatibilité totale d'une map sans `cells`). Build propre
(`npm run build`, `tsc --noEmit` zéro erreur, `vite build` réussi).

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** (comme
pour tout ce projet) : lisibilité réelle des nouveaux VFX, ergonomie du
gizmo TransformControls en jeu (taille, prise en main, conflit éventuel non
anticipé avec la caméra), rendu des cellules instanciées (notamment
l'absence de relief en strates, à confirmer si acceptable), aperçu vert/
rouge des outils de cellule, comportement du clic droit dans tous les cas
réels — à confirmer et ajuster par Antoine en jeu.

## Marche neutre : repli pathfinding pour les grandes cartes/murailles (2026-08-16)

Suite directe du chantier cellules éparses ci-dessus. Antoine, après avoir
testé : "il y a des problème de pathfinding lorsque les unités sont trop sur
le bord de la map, elle n'arrive pas à retrouver le chemin de la bataille.
Les maps à terme seront large. J'ai également fait le test en bloquant des
unités avec une muraille traversant le centre la map mais en laissant un
chemin généré avec des cells sur le côté de la map, elles n'ont pas trouvé
le chemin."

**Diagnostic (reproduit en headless avant tout correctif, scripts jetables
supprimés après usage) : `findPath`/`buildPathGrid` (sim/pathfinding.ts)
étaient déjà corrects** — un test isolé (mur de 56 cellules retirées, un seul
corridor de 4 cases) trouve une route valide de 110 points en 6,4ms, aucun
souci côté A* lui-même. Le vrai coupable : la MARCHE NEUTRE (aucune cible
verrouillée, `sim/systems/movement.ts`) n'a jamais eu accès au pathfinding en
grille — seulement à l'évitement RÉACTIF local (`pursueTowards`/
`findSteeringPoint`, "un coin à la fois, sans vue d'ensemble du plateau",
voir CLAUDE.md "vrai pathfinding" plus haut). Cette limite était déjà connue
et acceptée pour un décor CLAIRSEMÉ (quelques rochers isolés), mais devient
structurellement insoluble face à une muraille qui traverse toute la carte
avec son unique ouverture loin sur le côté : le meilleur "coin" local reste
toujours celui du segment de mur le plus proche, jamais celui du corridor
distant — une unité peut hugger le mur indéfiniment sans jamais progresser.
Le pathfinding en grille n'existait jusqu'ici QUE pour la poursuite d'une
cible déjà VERROUILLÉE (`pursueTargetWithPathfinding`, 2026-08-10) — jamais
étendu à la marche neutre qui précède ce verrouillage, précisément la phase
où une armée doit encore rejoindre le "gros" de la bataille.

**Fausse piste explorée puis écartée** : une première hypothèse pointait
`updateStuckState`'s détecteur "orbite" (mesure la distance à VOL D'OISEAU
vers la cible, peut se déclencher à tort sur un vrai détour A* légitime qui
doit temporairement s'éloigner). Un garde-fou a été ajouté par prudence
(`orbitTimer` : le déclenchement est suspendu tant qu'un `e.path` actif est
suivi) — reste en place, sans effet néfaste, mais **n'était PAS la cause
réelle** : les deux scénarios de reproduction initiaux d'Antoine utilisaient
en réalité des unités en pure marche neutre (`targetId` jamais verrouillé,
hors de portée d'aggro), donc ce détecteur ne s'appliquait même pas.

**Vrai correctif — pathfinding en grille étendu à la marche neutre**
(`sim/systems/movement.ts`) :
- Comportement PAR DÉFAUT INCHANGÉ : l'évitement réactif local reste actif
  pour le cas majoritaire (décor clairsemé), aucun coût supplémentaire.
- `updateStuckState` mesure désormais, pour toute unité en marche neutre,
  le progrès en Z dans sa direction d'avance (`forwardDir`) sur une fenêtre
  volontairement LARGE (`NEUTRAL_STUCK_CHECK_DURATION = 6.0s`,
  `config/constants.ts`) — bien plus longue qu'`ORBIT_CHECK_DURATION` (2.0s)
  pour ne JAMAIS se déclencher pendant un détour réactif normal autour d'un
  obstacle isolé (mesure historique : jusqu'à 7-12s pour un bosquet dense,
  déjà acceptée comme normale). En dessous de
  `NEUTRAL_STUCK_PROGRESS_THRESHOLD` (1 case) sur cette fenêtre, calcule un
  VRAI chemin A* (`computeNeutralFallbackPath`) vers un point stable loin
  devant (le bord opposé du plateau, même X qu'au moment du déclenchement) —
  n'importe quel point loin suffit, A* trouve la vraie route ; `worldToTileZ`
  (pathfinding.ts) clampe déjà toute coordonnée hors limites sur la case
  valide la plus proche.
- `pursueNeutralWithPathfinding` (nouvelle fonction, remplace l'appel direct
  à `pursueTowards` dans la boucle principale) : suit ce chemin de repli tant
  qu'il est actif (même logique de consommation de points de cheminement que
  `pursueTargetWithPathfinding`), retombe automatiquement sur l'évitement
  réactif une fois épuisé — la fenêtre de mesure repart alors de zéro.
- **Champs `Entity.path`/`pathGoalTileX`/`pathGoalTileZ` RÉUTILISÉS tels
  quels** (pas de nouveau concept parallèle) : leur forme était déjà générique
  ("chemin en cases + case du but"), seul le commentaire a été mis à jour
  pour documenter le second usage. Un chemin de repli neutre laissé dans
  `e.path` au moment où une vraie cible se verrouille est automatiquement
  jugé PÉRIMÉ par le test de fraîcheur déjà existant de
  `pursueTargetWithPathfinding` (la case-but synthétique ne coïncide
  quasiment jamais avec la case réelle de la cible) — recalcul propre sans
  code supplémentaire.
- Deux nouveaux champs `Entity.neutralStuckTimer`/`neutralProgressZ`
  (référence de progrès, même patron que `orbitTimer`/`orbitCheckDist`),
  initialisés dans `World.spawn()`. **Remis à zéro INCONDITIONNELLEMENT dès
  qu'une cible est verrouillée** (pas seulement dans les branches "ne veut
  pas bouger") — sans ça, une unité qui poursuit activement pendant
  longtemps garde une référence Z périmée (position d'avant l'acquisition de
  la cible) ; si elle perd ensuite sa cible et repasse en marche neutre, le
  premier calcul de progrès aurait comparé sa position ACTUELLE à cette
  référence périmée au lieu d'une fenêtre fraîche — bug trouvé et corrigé
  en écrivant les tests de vérification, pas remonté par Antoine.

**Vérifié en headless** (scripts jetables avec `npx tsx`, imports des VRAIS
modules + `World` réel, supprimés après usage) :
- Reproduction fidèle des DEUX scénarios exacts d'Antoine (unités près du
  bord d'une carte 60×80 ; muraille de 56 cellules retirées + corridor de 4
  cases sur une carte 60×40) — **piège rencontré en écrivant le premier jet
  de reproduction** : la convention `forwardDir` du jeu (joueur avance vers
  -Z, ennemi vers +Z) avait été inversée dans le script, faisant marcher
  l'attaquant tout droit vers le bord SUD sans jamais approcher la muraille
  — un résultat d'échec identique avant/après le correctif qui n'exerçait en
  réalité jamais le nouveau code. Corrigé, les deux scénarios réussissent
  ensuite (cible verrouillée puis atteinte via `pursueTargetWithPathfinding`,
  déjà correct).
- Test isolé PUR (une seule unité, aucun ennemi sur le plateau, `targetId`
  toujours null) : franchit la muraille de 53 cases de large via le corridor
  de 4 cases en ~43s simulées, trace tick par tick confirmant le mécanisme
  exact — ~12s pour être détectée réellement bloquée (deux fenêtres de 6s,
  la première ayant encore fait un peu de progrès), puis suit fidèlement les
  ~107 points du chemin A* calculé jusqu'à traverser le corridor et
  continuer au-delà.
- Test à 20 unités (10 par camp, formation en rangée, wall+corridor) :
  toutes verrouillent une cible dans les temps (convergent avant même
  d'atteindre le mur, cas réaliste où l'aggro s'enclenche tôt).
- Test à 12 unités en pure marche neutre (aucun ennemi, toutes bloquées par
  le même mur) convergeant vers le MÊME corridor étroit : les 12 franchissent
  sans blocage mutuel en 43,1s simulées, 583ms de calcul réel — aucun
  jamming détecté malgré la séparation entre corps et plusieurs chemins A*
  suivis simultanément dans le même goulot.
- `npx tsc --noEmit` et `npm run build` propres après chaque étape.

**Non vérifiable de mon côté — aucun accès visuel au rendu réel** : ressenti
en jeu du délai avant déclenchement (~6-12s avant qu'une unité génuinement
bloquée ne se mette à suivre un vrai chemin — peut paraître long à l'œil
selon le contexte, `NEUTRAL_STUCK_CHECK_DURATION`/`NEUTRAL_STUCK_PROGRESS_THRESHOLD`
sont les deux leviers à ajuster si besoin), fluidité visuelle de la
transition évitement réactif → suivi de chemin A* — à confirmer par Antoine
sur ses deux scénarios de test réels (bord de carte, muraille+corridor).

## Éditeur : correctif de placement + preview d'unité + architecture BUILDING (2026-08-16)

Demande complète d'Antoine (~70 points) : "je veux maintenant faire une passe
importante sur l'éditeur de map et commencer à formaliser une vraie
architecture de type BUILDING/BÂTIMENT." Audit exigé avant tout code — mené
par lecture directe puis, pour la première fois sur ce chantier précis,
**vérification VISUELLE réelle via Playwright** (déjà installé le
2026-08-14 pour la refonte de l'arbre de talents) plutôt qu'une simple
lecture de code : plusieurs hypothèses de bug se sont révélées fausses une
fois testées, et deux bugs RÉELS n'ont été trouvés qu'en observant le
comportement effectif du jeu tournant dans un vrai navigateur.

**1. Bâtiments KayKit qui ne pouvaient plus être placés — cause exacte,
trouvée par test isolé, pas par lecture de code.** Hypothèses écartées après
vérification directe : mismatch de clé `buildingsByName` (testé, correct),
timing de chargement asynchrone (testé, correct), 45/46 bâtiments placés
sans la moindre erreur JS en isolation. Le vrai coupable, trouvé en
reproduisant EXACTEMENT la séquence "placer un bâtiment (auto-sélectionné) →
choisir un autre bâtiment → cliquer au même endroit" : `EditorState.setTool()`
vide bien `selection` en interne, mais `onSelectTemplate`/`onSelectUnit`/
`onSelectAddCellTool`/`onSelectRemoveCellTool` (main.ts) n'appelaient jamais
`refreshEditorObjects()` ensuite — le gizmo `TransformControls`, lui, restait
donc visuellement ATTACHÉ et pleinement INTERACTIF sur l'ancien objet jusqu'au
clic suivant. Un clic de placement qui atterrissait sur ce gizmo fantôme était
intercepté (déplacement/rotation de l'ANCIEN objet) au lieu de poser le
nouveau. Confirmé avant/après correctif par un test isolé (propriétés
affichées restaient bloquées sur l'ancien modèle) ; corrigé en ajoutant
`refreshEditorObjects()` aux 4 handlers de sélection d'outil + aux 2 sites qui
reviennent à `{type:'select'}` (Échap, clic droit). Revalidé sur les 46
bâtiments KayKit (45/46 confirmés, le seul "échec" restant un artefact de
parsing du script de test lui-même, pas un bug réel), avec save/reload.

**2. Preview de case pour le placement d'unité — nouvelle fonctionnalité,
confirmée visuellement.** `EditorState.canPlaceUnitAt(x, z)` (nouveau) :
cellule de terrain existante, aucun obstacle COLLIDABLE dessus, aucune autre
unité déjà sur cette case — SOURCE UNIQUE réutilisée par `placeUnitAt` (le
clic réel, qui refuse désormais aussi un chevauchement bâtiment/unité, pas
seulement un trou) ET par `updateEditorGhost` (main.ts), qui superpose
désormais un `buildCellPreview` (déjà existant pour les outils de cellule,
vert/rouge translucide) sous le fantôme 3D de l'unité — les deux regroupés
dans un unique `THREE.Group` assigné à `editorGhost`, pour ne jamais
désynchroniser leur apparition/disparition. **Capture d'écran à l'appui** :
case verte confirmée sur une cellule libre, case rouge confirmée exactement
sur la case d'une unité déjà posée.

**3. Rotation libre des décors — déjà pleinement implémentée** (session
précédente, chantier "cellules éparses/placement libre/TransformControls") :
audit confirme W=déplacer/E=tourner déjà attaché à tout obstacle sélectionné,
rotation libre par défaut, Maj accroche à 15°, sauvegardée en radians exacts
(`ObstacleDef.rotationY`), Undo/Redo par drag complet déjà câblé
(`editorHistory`, capture au `mouseDown`, commande unique au `mouseUp`).
Rien à ajouter ici — seulement invalidée à tort par le bug du gizmo fantôme
(point 1), qui la rendait par moments inutilisable en pratique. Revérifiée
fonctionnelle une fois ce bug corrigé.

**4-8. Architecture BUILDING générique côté simulation — le plus gros
morceau.** Décision centrale (confirmée par audit avant tout code) : les
bâtiments DÉCORATIFS KayKit (Caserne, Château, Tour...) restent de purs
`ObstacleDef` posés dans l'éditeur — jamais instanciés comme Entity, jamais
touchés par ce chantier. Seuls les 2 bâtiments GAMEPLAY existants (Mine,
Baliste) deviennent réellement des `Entity` destructibles.

- **`data/buildings.ts`** (nouveau) : `BuildingDef { id, displayName, maxHp
  (interne x10), radius, targetable, countsForDefeat, hpBarHeight }` — pas
  de rig visuel/`UnitVisual.kit` (contrairement à `UnitDef`), un bâtiment est
  rendu via son mesh d'obstacle déjà existant (Mine) ou son propre rendu déjà
  existant (plateforme Baliste), jamais via `render/unitMesh.ts`. `mine` (15
  HP -> 150 interne), `ballista` (25 HP -> 250 interne).
- **`sim/entity.ts`** : `Entity.isBuilding: boolean` (capacité EXPLICITE et
  GÉNÉRIQUE, demande explicite d'Antoine : "évite `if entity.isBuilding then
  velocity=0` dans 15 endroits, donne-lui un type/capabilities clair") +
  `Entity.countsForDefeat: boolean` (toujours vrai pour une unité normale via
  `World.spawn`, configurable par `BuildingDef` via `World.spawnBuilding`).
- **`sim/world.ts`, `World.spawnBuilding(def, team, x, z, footprint?, hp?)`**
  (nouveau, à côté de `spawn()`) : construit une Entity DIRECTEMENT (jamais
  via `getUnit()`/data/units.ts — "je ne veux PAS dire qu'elle doit marcher,
  attaquer, utiliser UnitDef", demande explicite), `stats.aggroRange = 0`
  (ne verrouille JAMAIS de cible lui-même — `targetingSystem` n'a besoin
  d'AUCUN changement pour autant qu'un bâtiment reste une cible VALIDE : il
  ne filtre déjà que par équipe/distance/portée, jamais par type d'unité),
  `moveSpeed = 0`. `footprint` optionnel : injecté immédiatement dans
  `this.obstacles` (bloque mouvement/ligne de tir/pathfinding comme
  n'importe quel obstacle) ET mémorisé (`buildingFootprints: Map<id,
  ObstacleDef>`) pour être RETIRÉ automatiquement dès que l'Entity meurt (voir
  `releaseDeadBuildingFootprints()`, appelée juste après `deathSystem` dans
  `step()`) — "mettre à jour navigation/occupancy IMMÉDIATEMENT à
  destruction", demande explicite d'Antoine : la case libérée est donc déjà
  walkable dès le tick suivant, `buildPathGrid` étant reconstruite à chaque
  tick de toute façon. `World.countCombatants(team)` (nouveau) : compte les
  entités vivantes qui `countsForDefeat` — SOURCE UNIQUE de la condition de
  victoire/défaite, remplace tout `if (mine...)`/`if (ballista...)`.
- **`sim/systems/movement.ts`** : UN SEUL filtre (`movable = alive.filter(e
  => !e.isBuilding)`) au sommet de `movementSystem`, réutilisé pour la boucle
  de poursuite/marche neutre, la séparation, la collision aux obstacles ET le
  confinement au plateau — un bâtiment ne participe à AUCUNE de ces étapes,
  mais reste dans `alive`/`byId` (une unité doit toujours pouvoir le VISER,
  `target.x/target.z` lus normalement). `updateStuckState` prend `movable`
  au lieu de `alive` pour la même raison.
- **`run/runState.ts`, `applyBattleOutcome`** : `playerAlive`/`enemyAlive`
  (condition `won`) basés sur `countsForDefeat` (inclut donc Mine/Baliste),
  mais la corrélation ordre-de-spawn avec `run.army` (mise à jour des PV
  survivants) utilise désormais `playerUnitEntities = entities.filter(e =>
  team==='player' && !isBuilding)` — EXCLUT explicitement les bâtiments de
  cette corrélation (sinon un bâtiment spawné entre deux unités aurait
  décalé tout l'alignement `run.army[i] <-> entities[i]`). Comportement
  strictement inchangé pour toute bataille sans bâtiment gameplay (aucun
  bâtiment aujourd'hui n'a `countsForDefeat: false`, donc `playerAlive`
  coïncide exactement avec l'ancien calcul tant qu'aucun n'est spawné).
- **`main.ts`, boucle de rendu** : `world.countAlive('player'/'enemy')` (le
  déclencheur temps réel de fin de bataille) remplacé par
  `world.countCombatants(...)` — même sémantique que `applyBattleOutcome`,
  une seule définition de "combattant" dans tout le jeu.

**9. Mine = Building 15 HP, 10. Baliste = Building 25 HP — spawn réel.**
`onValidatePlacement` : `world.setMap(currentMap)` n'injecte PLUS
manuellement l'obstacle de la Mine (contrairement à avant) — `spawnBuilding`
s'en charge lui-même désormais, ce qui lui permet la libération automatique
à la mort documentée plus haut. Baliste TOUJOURS spawnée (jamais gâtée par
un talent, contrairement à la Mine) avec un footprint DÉDIÉ
(`config/mapDef.ts`, `computeBallistaObstacle` — nouveau, n'existait pas du
tout avant : la Baliste n'avait AUCUNE emprise de collision jusqu'ici,
`BALLISTA_TOWER_FOOTPRINT` déplacée dans `config/constants.ts` pour être
partagée avec le calcul de mise à l'échelle visuelle réelle, jamais une
valeur dupliquée). Mine spawnée seulement si `isTalentActive('temps_argent')`,
avec son footprint déjà existant (`mineObstacleDef`). Les DEUX `BuildingView`
(voir plus bas) sont `.reset()` avant spawn — jamais inconditionnellement (la
Mine resterait visible même talent non débloqué sinon).

**Rendu (`render/buildingView.ts`, nouveau)** : flash blanc au coup encaissé
(même principe que `UnitViews.setEmissive`, mais UN SEUL mesh par bâtiment —
pas de Map par entité) + destruction (petit VFX poussière/débris via
`render/vfx/radialBurst.ts` déjà existant, réutilisé tel quel — "V1
acceptable", confirmé explicitement par Antoine — + suppression du modèle).
**Matériaux CLONÉS avant tout flash** (précaution ajoutée après coup, pas
observée en pratique mais un risque réel identifié par audit) : le mesh
gameplay unique partage potentiellement ses matériaux PAR RÉFÉRENCE avec un
bâtiment purement décoratif du même modèle placé sur la map via l'éditeur
(`Object3D.clone()` ne clone jamais les matériaux) — sans ce clonage, faire
flasher la Mine gameplay aurait aussi fait flasher toute "Mine (bleu)"
décorative affichée sur le même plateau (même classe de bug déjà corrigée
une fois pour les unités/rochers, voir plus haut dans ce fichier). **Barres
de PV** : `ui/combatOverlay.ts`, `createBar(unitId, maxHp)` généralisée en
`createBar(maxHp, radius)` (le seul usage de `unitId` était
`getUnit(unitId).stats.radius`, remplacé par un paramètre direct) — nouvelle
méthode `syncBuildings(buildings, resolvePosition)` (même mécanisme que
`sync()`, même Map `healthBars` partagée, mais radius/hpBarHeight fournis
directement par `BuildingDef` plutôt que via `getUnit()`, qui lèverait pour
un bâtiment). **Confirmé visuellement** : capture d'écran en pleine bataille
réelle montrant la barre de PV verte de la Baliste, pleine, correctement
positionnée au-dessus de la tour.

**11. Victoire/défaite traite `countsForDefeat` — confirmé sans hack.**
Aucun `if (unitId === 'mine')`/`if (unitId === 'ballista')` nulle part :
`World.countCombatants`/`Entity.countsForDefeat` sont la seule source
consultée, aussi bien par le déclencheur temps réel que par
`applyBattleOutcome`.

**12. Ciblage ennemi des bâtiments — gratuit, zéro changement.** Confirmé
par audit AVANT tout code : `targetingSystem`/`combatSystem` ne
discriminent jamais par type d'unité, seulement équipe/distance/portée — un
bâtiment `team:'player'` avec un `radius` réel est donc DÉJÀ une cible
valide pour `findAttackableEnemy`/`findNearestEnemy` sans la moindre ligne
de code supplémentaire. Aucun risque pour Taunt Sentinelle/ciblage
Mage/Archer/Cavalier : ces systèmes restent inchangés.

**13-14. Empêcher une unité d'apparaître sur un bâtiment.** Phase de
placement JOUEUR : `isValidPlacementTile` (déjà générique sur
`isCollidableObstacle`) fusionnait déjà la Mine — étendu à
`activeBuildingObstacles()` (Mine + Baliste, cette dernière TOUJOURS
incluse). Éditeur : `EditorState.canPlaceUnitAt` (point 2 ci-dessus).
Pathfinding : un bâtiment détruit libère sa case IMMÉDIATEMENT (voir point
4-8). Spawn ENNEMI : non modifié — la Mine/Baliste occupent le coin de la
zone JOUEUR, spatialement toujours disjointes de la zone de formation
ennemie (`computeEnemyWavePlacements`), aucun chevauchement possible en
pratique avec la disposition actuelle des cartes.

**15. Bâtiments KayKit décoratifs — comportement inchangé, confirmé.**
Jamais instanciés comme Entity (voir point 4-8) : bloquent mouvement/ligne
de tir comme avant (obstacle collidable), mais aucun ciblage/HP/destruction
— exactement "un gros obstacle", comme demandé.

**Deux bugs RÉELS de crash trouvés en testant une vraie bataille (pas en
lecture de code) — la partie la plus importante de la vérification.** Un
premier essai de bataille réelle (Playwright, "Jouer" → placement → valider)
a immédiatement fait apparaître `PAGEERROR: Unite inconnue : ballista` en
boucle : deux endroits appelaient `getUnit(entity.unitId)`
INCONDITIONNELLEMENT en itérant `world.entities`/`world.entities` complet,
sans jamais exclure un bâtiment (dont l'`unitId` — `'mine'`/`'ballista'` —
n'existe jamais dans `data/units.ts`) :
- `main.ts`, boucle de rendu : `unitViews.sync(world.entities, ...)` —
  `UnitViews` construit un mesh (`buildUnit` → `getUnit(unitId).visual.kit`)
  pour toute entité JAMAIS VUE, donc plantait dès le premier bâtiment
  rencontré. Corrigé : `nonBuildingEntities = world.entities.filter(e =>
  !e.isBuilding)`, calculé UNE FOIS par frame, réutilisé par `unitViews.sync`
  ET `combatOverlay.sync` (qui aurait eu le même problème via
  `getUnit(unitId).visual.hpBarHeight`).
- **`sim/systems/abilities.ts`, PLUS GRAVE — bug de SIMULATION, pas
  seulement de rendu** : `getUnit(e.unitId).abilities` (recherche de Charge/
  Boule de feu/Provocation) appelée pour CHAQUE entité vivante sans dash/cast
  en cours — plantait sur le premier bâtiment rencontré dans la boucle,
  ABORTANT toute la fonction avant `advanceBlasts(...)` (qui fait avancer
  les Boules de feu du Mage DÉJÀ EN VOL) — cassant silencieusement le combat
  du Mage à CHAQUE tick dès qu'un bâtiment gameplay existait dans la
  bataille, bien plus grave que le symptôme visible (le message d'erreur
  console, seul signe extérieur). Corrigé par le même principe qu'ailleurs :
  `if (e.isBuilding) continue;` en tête de boucle, juste après le garde-fou
  `!e.alive` existant.
Ces deux bugs n'auraient jamais été détectés par la seule lecture de code
(le raisonnement initial — "targetingSystem/combatSystem sont déjà
génériques" — était correct, mais ne couvrait pas `abilitySystem`/le rendu,
qui itèrent aussi `world.entities` en entier). Revérifié après correctif :
bataille réelle complète (placement → validation → 5s de combat) sans la
moindre erreur console, Baliste visible avec sa barre de PV verte pleine.

**Guardes complémentaires ajoutées après cette découverte** (par cohérence,
pas suite à un crash observé) : `findHealTargetEntity`/
`findSecondaryHealTargets` (main.ts) excluent désormais explicitement
`!e.isBuilding` — un parchemin de soin ne doit jamais cibler un bâtiment
(aucun mécanisme de réparation dans cette architecture, décision de design,
pas une limitation technique) ; talent "Aux petits oignons" (déclenchement
automatique du parchemin sous 30% PV) déjà gardé par `!target.isBuilding`.

**55. Texte d'aide de l'éditeur simplifié** — l'ancien paragraphe unique
("devient difficile à lire", demande explicite) remplacé par deux lignes
courtes de raccourcis (`editor/editorUI.ts`), le détail restant disponible
ailleurs dans l'interface plutôt que dupliqué dans le texte d'aide.

**16-19. Confirmations finales.** Save/Reload : `mapSerializer.ts` traite
déjà tout `ObstacleDef`/`EditorUnit` génériquement (`kind` importe peu) —
aucun changement nécessaire, confirmé par test réel (placement de 46
bâtiments, export JSON, réimport, apparence identique). Undo/Redo rotation :
déjà fonctionnel (point 3), non retouché. Anciennes maps compatibles :
aucun format de sauvegarde modifié par ce chantier — les bâtiments gameplay
(Mine/Baliste) ne font JAMAIS partie des données de map, ils sont
programmatiques. Build (`npx tsc --noEmit` + `npm run build`) propre après
chaque étape ; vérification VISUELLE réelle via Playwright à plusieurs
reprises (placement KayKit avant/après correctif, preview verte/rouge,
bataille réelle complète) — pas seulement du code qui compile.

**Non vérifiable de mon côté malgré la vérification Playwright** : ressenti
UX global de la preview de case (couleurs/opacité/taille jugées correctes
sur les captures, mais le "confort" final reste un jugement d'Antoine),
équilibrage des 15/25 PV (jamais testés jusqu'à destruction réelle en
combat — seule la présence/le rendu/l'absence de crash ont été confirmés,
pas le TEMPS qu'il faut à un ennemi pour détruire la Mine/la Baliste en
pratique).

## Polish UI + équilibrage économique : achat ×5 des consommables, Runes par palier de vague, prix Gold évolutifs (2026-08-15)

Demande complète d'Antoine (~43 points) : audit explicite exigé avant tout
code (boutique de run, système d'achat des consommables, inventaire/capacité,
Gold/format des nombres, boutique d'amélioration, niveaux d'amélioration
Heal/Nova/Sentinelle, système de récompense en Runes, écran titre, modales
`.screen-panel`, événements pointer/mouse/contextmenu, CSS global), puis un
résumé bref avant implémentation. Sept chantiers distincts, tous liés au
même thème "boutique + polish d'interface".

**1. "ACHAT x5" pour le Parchemin de soin et la Nova de glace — FAIT.**
`ui/screens.ts`, `unitPurchaseRow(def, onBuyOne, onBuyFive, iconItemId?)`
— déjà écrite pour les 4 unités (Fantassin/Archer/Mage/Sentinelle) — étendue
d'un paramètre optionnel `iconItemId` puis RÉUTILISÉE telle quelle pour les
2 consommables (`def: {id, name, cost}` acceptait déjà la forme d'un
`ItemDef`, aucune structure dupliquée) : les DEUX boutons (x1 + x5)
partagent désormais `shopUnitPriceEls`/`shopUnitBuyFiveEls` (déjà des
`Map<string, HTMLElement>` génériques par id, pas seulement par `unitId`
malgré leur nom). `main.ts`, `buyConsumable(itemId, quantity, effectiveCost)`
(nouveau) — ATOMIQUE par construction : calcule `totalCost = roundGold(unitPrice
* quantity)` (le prix EFFECTIF déjà calculé AVANT la multiplication, jamais
`baseCost*5 + bonusUneFois`) et vérifie Gold ET capacité d'inventaire
(`canAddItemsToInventory`, nouvelle version PLURIELLE de
`canAddItemToInventory` dans `run/runState.ts` — simule l'ajout des `N`
exemplaires EN MEME TEMPS avant de comparer au nombre de piles autorisé,
jamais `N` appels indépendants qui pourraient se tromper sur un seuil de
pile partiellement remplie) — refuse PUREMENT et SIMPLEMENT (aucune
mutation) si l'un des deux manque, avant de créditer/débiter quoi que ce
soit. `onBuyHealScroll`/`onBuyIceNova` (x1) ET le nouveau `onBuyItemFive`
(x5, dispatch par `itemId`) appellent tous les deux CETTE MÊME fonction —
zéro logique d'achat dupliquée entre x1 et x5, contrairement à
`buyUnit`/`buyUnitFive` (unités, delibérément TOLÉRANT, s'arrête dès qu'un
achat échoue plutôt que tout-ou-rien — les deux mécaniques coexistent
sciemment, l'un pour les unités, l'autre pour les consommables).

**2. Récompense de Runes mise à l'échelle par palier de 10 vagues — FAIT.**
`run/metaProgress.ts`, `upgradeRunesRewardForWave(waveNumber) =
RUNES_PER_WAVE_WIN * 2^floor(waveNumber/10)` — formule donnée littéralement
par Antoine, VÉRIFIÉE (pas recopiée à l'aveugle, comme il l'avait
explicitement demandé) contre le numéro de vague RÉELLEMENT AFFICHÉ au
joueur ("Vague N", 1-indexé) : `main.ts` passe désormais `waveBeingFought`
(capturé AVANT l'incrément de `RunState.waveNumber` par
`applyBattleOutcome` — la même valeur déjà utilisée pour l'indicateur de
vague/la bannière de fin de vague) à `awardUpgradeRunesForWaveWin(progress,
waveNumber)` (signature étendue), jamais le numéro POST-incrément. Vagues
1-9 → 10 runes, 10-19 → 20, 20-29 → 40, 30-39 → 80, 40-49 → 160 — conforme
exactement au tableau de valeurs donné par Antoine (vérifié en headless pour
1/9/10/11/19/20/21/29/30/40). Le garde-fou anti-double-récompense (le
callback de fin de bataille ne s'exécute qu'UNE FOIS par bataille résolue)
n'a pas changé — même point de vérité déjà en place avant ce chantier.

**3/4. Prix Gold du Parchemin de soin/de la Nova de glace évolutifs — FAIT.**
Nouveau champ `goldCostPerLevel` (0.5 pour les deux) sur
`HealScrollUpgradeDef`/`IceNovaUpgradeDef` (`data/healScrollUpgrade.ts`/
`data/iceNovaUpgrade.ts`) — ne touche JAMAIS le coût en RUNES de
l'amélioration elle-même (`baseRuneCost`/`costMultiplier`, inchangés).
`run/healScrollUpgradeEffects.ts`, `effectiveHealScrollCost(progress) =
getItem('heal_scroll_minor').cost + level * goldCostPerLevel` ;
`run/iceNovaUpgradeEffects.ts`, `effectiveIceNovaCost` — même formule,
même principe déjà établi par `effectivePlayerUnitCost` (unités). SOURCE
UNIQUE utilisée à la fois par l'affichage du prix (`ui/screens.ts`,
`refreshShop`) ET la transaction réelle (`main.ts`, `buyConsumable`) —
jamais deux calculs indépendants qui pourraient diverger.

**5. Prix de recrutement Gold de la Sentinelle évolutif — FAIT, REVIREMENT
explicite sur une décision documentée.** `data/sentinelUpgrade.ts` disait
jusqu'ici explicitement que le coût Gold de recrutement restait TOUJOURS 40
quel que soit le niveau d'amélioration ("ne lui applique pas automatiquement
la règle +1 attack = +1 gold") — Antoine demande maintenant l'inverse,
conscient de revenir dessus : `40 + sentinelUpgradeLevel * 5`. Nouveau champ
`goldCostPerLevel: 5` sur `SentinelUpgradeDef`, nouvelle fonction
`run/sentinelUpgradeEffects.ts`, `effectiveSentinelGoldCost(progress)`.
`run/unitUpgradeEffects.ts`, `effectivePlayerUnitCost` gagne un cas spécial
`if (unitId === 'sentinel') return effectiveSentinelGoldCost(progress);`
EN PREMIER (même motif que le cas spécial déjà existant dans
`effectivePlayerUnitMaxHp` pour la même unité) — la Sentinelle n'est pas
enregistrée dans `UNIT_UPGRADES` (forme `UnitUpgradeDef` incompatible, pas
de palier d'attaque), donc sans ce cas spécial la fonction serait
silencieusement retombée sur le coût de base. **Conséquence automatique,
zéro changement UI supplémentaire** : `ui/screens.ts` appelait déjà
`effectivePlayerUnitCost('sentinel', progress)` pour afficher/désactiver le
bouton Sentinelle (bouton simple ET ×5) — le nouveau comportement est donc
apparu SANS toucher à `refreshShop` pour cette unité précise (seul le
commentaire, périmé, a été corrigé). Les bonus PV/Bouclier de cette
amélioration restent INCHANGÉS (+5 PV/niveau, +1 Bouclier tous les 3
niveaux) — seul le coût GOLD de recrutement évolue. Une Sentinelle ENNEMIE
n'a toujours aucun coût Gold et ne reçoit jamais ce bonus (vérifié en
headless : le niveau d'amélioration du joueur n'affecte jamais le coût
d'une autre unité, `effectivePlayerUnitCost('fantassin', ...)` inchangé
après 6 achats de Sentinelle).

**`formatGold(value)` — nouvelle fonction d'AFFICHAGE, `run/runState.ts`.**
Arrondit au dixième pour le texte affiché (jamais un résidu de virgule
flottante du style "2.49999999997"), sans jamais afficher de ".0" superflu
sur un montant entier ("40", pas "40.0"). **Distincte de `roundGold`**
(reste l'unique source de vérité pour la valeur GAMEPLAY, jamais mutée par
`formatGold`) **et distincte de `ui/goldHud.ts`** (`toFixed(1)`
systématique, choix DÉLIBÉRÉ anti-scintillement pour l'or qui défile en
temps réel via le revenu de la Mine — non touché par ce chantier, les deux
fonctions coexistent pour des besoins différents). Utilisée par tous les
prix de la boutique de run (`shopItemButton`, `refreshShop`) — remplace les
`String(cost)` bruts, qui auraient pu un jour afficher un résidu flottant
maintenant que les prix sont fractionnaires.

**6. Menu contextuel du navigateur supprimé PARTOUT — FAIT.** L'ancien
listener `canvas.addEventListener('contextmenu', ...)` (scope limité au
canvas 3D) devient `document.body.addEventListener('contextmenu', ...)` —
`document.body` sert de racine du jeu dans ce projet (aucun conteneur
`<div id="game-root">` dédié, voir `index.html` : chaque overlay HTML
s'attache directement à `document.body`, voir `ui/screens.ts` et consorts),
donc un seul listener couvre désormais le menu titre, TOUS les
`.screen-panel` (Paramètres, Pause, arbre de talents, boutique
d'amélioration, "Effacer la sauvegarde", boutique de run), l'inventaire ET
l'éditeur de maps. **Ne touche à AUCUN mécanisme de clic droit du JEU**
(vérifié par audit AVANT de coder, confirmé par test réel après) : le pan de
caméra, l'annulation du ciblage d'un objet armé, et le clic droit de
l'éditeur (annule un placement en cours / désélectionne) reposent tous sur
`mousedown`/`event.button === 2` — un type d'événement COMPLÈTEMENT
INDÉPENDANT de `contextmenu`, `preventDefault()` sur l'un n'affecte jamais
la délivrance de l'autre.

**7. Sélection de texte bleue empêchée — FAIT.** `ui/style.css`,
`user-select: none` + `-webkit-user-select: none` sur `html, body` (même
raisonnement que le point 6 : `body` EST la racine du jeu dans ce projet) —
avec un carve-out explicite `input, textarea { user-select: text; }` pour
les vrais champs déjà présents dans le jeu (curseurs `<input type=range>`
et case `<input type=checkbox>` de l'écran Paramètres, `<input type=number>`
largeur/hauteur et `<input type=file>` "Charger une carte" de l'éditeur de
maps) — confirmé par recherche AVANT d'écrire la règle qu'aucun de ces
champs n'existait sans ce carve-out, ils seraient devenus impossibles à
éditer. Règle supplémentaire `img { -webkit-user-drag: none; user-select:
none; }` (précaution — les icônes d'objets, `ui/itemIcons.ts`, sont de
vrais `<img>`, jamais actuellement glissés directement mais soumis au même
risque de fantôme de glisser natif). **`user-select` ne bloque QUE la
surbrillance visuelle du texte, jamais la délivrance d'événements DOM** —
vérifié explicitement (voir plus bas) que le double-clic de sélection
multiple en jeu et le glisser-déposer restent intacts.

**Vérifié en headless** (`npx tsx`, script temporaire supprimé après usage,
imports des VRAIS modules `run/runState.ts`/`run/metaProgress.ts`/
`run/healScrollUpgradeEffects.ts`/`run/iceNovaUpgradeEffects.ts`/
`run/unitUpgradeEffects.ts`, 42/42 vérifications) : les 10 valeurs de Runes
par palier de vague données par Antoine, les coûts Heal/Nova/Sentinelle aux
4 niveaux demandés (0/1/3/6), l'isolation totale entre le niveau
d'amélioration de la Sentinelle et le coût des autres unités, `formatGold`
sur un entier/une fraction/deux résidus flottants réels, `canAddItemToInventory`
vs `canAddItemsToInventory` (capacité simple vs plurielle, y compris le cas
"presque plein" et "exactement plein"), et les DEUX exemples chiffrés
complets donnés par Antoine (Parchemin niveau 3 = 2.5 or, x5 = 12.5, Gold
20→7.5 ; Nova niveau 2 = 5 or, x5 = 25, Gold 24 → achat refusé sans aucune
mutation). Build propre (`npx tsc --noEmit` + `npm run build`).

**Vérifié avec un VRAI navigateur** (Playwright, comme pour le chantier
précédent) : `contextmenu.defaultPrevented === true` sur l'écran titre ;
`getComputedStyle(document.body).userSelect === 'none'` ; le curseur
`<input type=range>` de Paramètres reste `user-select: text` ; un
glisser-déposer sur le titre de l'écran ne sélectionne AUCUN texte
(`window.getSelection().toString() === ''`) ; **partie en jeu réel** :
"Jouer" → placement (boutique auto-ouverte) → onglet Soins affiche bien
"Parchemin de soin mineur 1" + un bouton ×5 ; onglet Parchemins de bataille
affiche "Nova de glace 4" + un bouton ×5 ; onglet Unités affiche
"Sentinelle 40" (niveau 0, coût de base) ; clic réel sur le bouton ×5 du
Parchemin de soin (5 or de départ, coût total exactement 5) réussit sans
erreur console ; **dans l'éditeur de maps** : sélection d'un objet à poser
puis clic droit sur le canvas — aucune erreur, le mécanisme d'annulation de
l'éditeur (`mousedown`/`button===2`, inchangé) continue de fonctionner
normalement malgré le nouveau listener `contextmenu` sur `document.body`.
Aucune erreur console/page à aucune étape.

**Non vérifiable de mon côté** : ressenti du "confort" des boutons ×5
(mise en page, taille) et lisibilité des nouveaux prix fractionnaires
("2.5", "7.5") à l'échelle réelle de l'interface — à confirmer par Antoine
en jeu. Équilibrage des nouveaux prix Gold évolutifs (Heal/Nova/Sentinelle)
et de la courbe de Runes par palier de 10 vagues — valeurs appliquées
littéralement telles que données par Antoine, jamais ajustées par Claude,
mais leur ressenti en jeu réel sur plusieurs runs reste à évaluer par lui.

## Correctif : l'encart Or ne se rafraîchissait plus après une vente/un achat en placement (2026-08-16)

Antoine : "lorsque je vends une unité, le bon montant de gold ne s'affiche
pas dans mon encart à gold." Diagnostic par lecture de `core/loop.ts` :
`goldHud.update(currentRun.gold)` (main.ts) vivait dans le callback `onStep`
de la boucle (pas de simulation FIXE) — qui ne s'exécute QUE si
`loop.timeScale > 0` (l'accumulateur n'avance jamais à `timeScale === 0`,
voir `Loop.frame`). Or `loop.timeScale` passe à 0 dès qu'un camp est éliminé
et ne redevient 1 qu'à la VALIDATION du placement suivant — donc pendant
toute la séquence boutique + phase de placement (exactement le moment où on
achète/vend), l'encart restait figé sur sa dernière valeur d'avant la fin de
bataille. Déplacé dans le callback de RENDU (`onRender`, tourne à chaque
frame quel que soit `timeScale` — même mécanisme déjà utilisé par le reste
du rendu pendant une pause) : lit `currentRun.gold` inconditionnellement,
conforme à l'intention documentée à l'origine. Vérifié en direct (achat
immédiat après un premier chargement de page, HUD mis à jour sans délai) ;
la reproduction exacte du scénario (deuxième phase de placement après une
bataille complète) a buté sur une lenteur de Playwright headless sans
rapport avec le jeu — pas concluante, non retenue comme preuve, mais le
correctif lui-même ne laisse aucune ambiguïté de lecture de code.

## Correctif : les unités ne pouvaient jamais attaquer un bâtiment (2026-08-16)

Antoine : "les unités adverses n'arrivent pas à attaquer les bâtiments du
joueur, et probablement l'inverse également." **Bug réel, confirmé et
corrigé** — un bâtiment avec un footprint de collision (Mine, Baliste, voir
chantier BUILDING du 2026-08-16) se bloquait littéralement LUI-MÊME.

**Cause exacte** : `World.spawnBuilding` pousse le `footprint` (l'obstacle de
collision du bâtiment) dans `World.obstacles` — le MÊME tableau que
`findBlockingObstacle(ax, az, bx, bz, obstacles)` (sim/geometry.ts) parcourt
pour tester la ligne de tir. Le segment testé va de l'attaquant jusqu'au
CENTRE de la cible (`target.x, target.z`) — qui, pour un bâtiment, se trouve
TOUJOURS à l'intérieur de son propre rectangle de collision. `findBlockingObstacle`
trouvait donc systématiquement CET obstacle comme "bloquant", pour n'importe
quel attaquant visant ce bâtiment, quelle que soit son équipe (le bug
touchait donc bien symétriquement les deux camps, comme supposé par
Antoine — actuellement sans effet pratique côté joueur, aucun bâtiment
ennemi n'existant dans le jeu). `combatSystem` traitait alors CHAQUE tentative
comme un tir bloqué (`applySidestep` + évènement `'blocked'`, cooldown
consommé) — jamais un vrai `'hit'`, indéfiniment.

**Correctif générique** (pas un cas spécial Mine/Baliste) : `Entity` gagne
`footprintObstacle: ObstacleDef | null` — référence PARTAGÉE (jamais une
copie) avec l'entrée poussée dans `World.obstacles`, `null` pour toute unité
normale (`World.spawn`) et pour un bâtiment sans footprint. `findBlockingObstacle`
(sim/geometry.ts) gagne un paramètre optionnel `ignore?: ObstacleDef | null` —
exclut CET obstacle précis du test, par égalité de référence, sans changer le
cache par référence de tableau déjà en place (`getObstacleBoundsList`). Les
**3 appelants** de `findBlockingObstacle` passent désormais `target.footprintObstacle` :
`sim/systems/combat.ts` (ligne de tir du combat automatique), `sim/systems/movement.ts`
(`pursueTargetWithPathfinding`, décide si un chemin en grille est nécessaire
pour rejoindre la cible), `sim/systems/abilities.ts` (trajectoire de la
Charge du Cavalier/futur Chevalier lourd) — les trois souffraient du même
défaut structurel, corrigés d'un coup par le même mécanisme partagé plutôt
que trois correctifs séparés.

Vérifié en headless (`npx tsx`, script temporaire supprimé après usage, VRAI
`World`/`combatSystem` via `world.step()` répété) : une Mine spawnée avec son
footprint réel encaisse bien des dégâts réels d'un fantassin ennemi adjacent
sur 10 secondes simulées (150 → 60 PV internes, aurait dû rester bloqué à
150 avant ce correctif) ; confirmation explicite qu'un VRAI obstacle
(rocher) posé entre deux unités NORMALES continue de bloquer la ligne de tir
comme avant (aucune régression sur le comportement historique). Build/typecheck
propres.

**Non vérifiable de mon côté** : ressenti en jeu réel — à confirmer par
Antoine que les ennemis attaquent désormais bien la Mine/la Baliste.

## Correctif : "Partie terminée" se déclenchait à tort quand un bâtiment survivait sans unité (2026-08-16)

Antoine : "si mes unités sont toutes mortes mais qu'il me reste des
bâtiments, cela met tout de même fin à la partie — il faut que la partie
continue tant que j'ai une unité OU un bâtiment (Mine, tour Baliste)."

**Cause** : `main.ts`, la condition de "défaite totale" (retour au menu
principal, run terminée) testait `currentRun.army.length === 0` — un reste
de l'époque où seules les vraies unités existaient, jamais mis à jour lors
du chantier BUILDING (2026-08-16, Mine/Baliste destructibles). `run.army`
ne contient QUE les vraies unités (jamais les bâtiments, voir
`applyBattleOutcome`) — donc une victoire où toute l'armée a été sacrifiée
mais où la Mine/la Baliste tient encore (et a, avec le talent adéquat ou les
tirs du joueur, fini les derniers ennemis) laissait `army.length === 0`
malgré une VRAIE victoire, déclenchant à tort l'écran "Partie terminée" au
lieu de la boutique/vague suivante.

**Correctif** : la condition devient `!outcome.won` — `outcome` (retour de
`applyBattleOutcome`, déjà calculé juste avant dans le même callback) est la
SOURCE UNIQUE, déjà building-aware (`won` dérivé de `countsForDefeat`, vrai
pour une unité ET pour un bâtiment gameplay, voir CLAUDE.md, chantier
BUILDING). Une victoire à 0 unité survivante (armée entièrement sacrifiée,
Baliste du joueur achevant seule les derniers ennemis) retombe désormais
normalement dans la branche "Continuer" — `startPlacement()` reconstruit
simplement un placement à 0 unité, boutique auto-ouverte, le joueur peut
racheter une armée avec son or. La vraie défaite totale (aucun combattant
joueur, unité OU bâtiment, ne survit) continue de terminer la run et de
sauvegarder la progression exactement comme avant.

Vérifié en headless (`npx tsx`, script temporaire supprimé après usage, VRAI
`World`/`applyBattleOutcome`) : (A) toutes les unités mortes + une Mine
vivante + tous les ennemis morts → `won === true`, `run.army` devient bien
`[]` ; (B) unités ET Mine mortes, un ennemi survit → `won === false` (vraie
défaite totale) ; (C) garde-fou de non-régression, cas normal sans bâtiment
(un survivant, victoire) → comportement strictement inchangé. Build/typecheck
propres.

**Non vérifiable de mon côté** : ressenti en jeu réel — à confirmer par
Antoine que sacrifier toute l'armée en gardant Mine/Baliste en vie renvoie
bien à la boutique plutôt qu'à l'écran de fin de partie.

## Confirmation avant de quitter une run + PV bonus de la Baliste + audit du hit flash des bâtiments (2026-08-16)

Demande complète d'Antoine (~36 points), avec audit explicite exigé avant
tout code (menu Pause, logique Quitter/Retour, état de run, sauvegarde,
boutique d'amélioration Baliste, BuildingDef/BuildingEntity, PV actuels de
la Baliste, système de hit flash des unités, matériaux Mine/Baliste/
bâtiments). Trois chantiers distincts.

**1. Confirmation avant de quitter une run — FAIT.** Nouvel écran
`quitRunConfirm` (`ui/screens.ts`), même architecture `overlay`/
`screen-panel` que `resetConfirm` ("Effacer la sauvegarde ?") — pas une
deuxième popup system, demande explicite. Le bouton "Quitter" du menu Pause
appelle désormais `handlers.onRequestQuitRun` (ouvre la confirmation) au
lieu de `handlers.onQuit` directement — `onQuit` reste inchangé et continue
d'être utilisé tel quel par l'écran "Partie terminée" (la run y est déjà
terminée, rien à confirmer, voir CLAUDE.md "Fin de run"). Comme le menu
Pause n'est accessible QUE depuis une bataille/un placement en cours (voir
`main.ts`, `openPauseMenu`, garde `!inBattlePhase() && !inPlacementPhase`),
ce bouton représente TOUJOURS "quitter une run en cours" — aucune
vérification de contexte supplémentaire nécessaire pour exclure le menu
principal/l'arbre de talents/la boutique d'amélioration (ils n'ont jamais ce
bouton). L'éditeur de maps a son propre bouton "Retour au menu" totalement
indépendant (`editorUI.ts`, `onExit`) — non concerné, logique inchangée.
- **Texte honnête** (audit de `run/metaProgress.ts` avant d'écrire le
  texte) : `RunState` (or, armée, inventaire, vague) n'est JAMAIS persisté
  — seule `MetaProgress` (talents, améliorations permanentes, records de
  vague) l'est, et toujours IMMÉDIATEMENT à chaque mutation (jamais en
  attente au moment où ce popup s'affiche). Texte retenu : "L'or, l'armée et
  l'inventaire de cette run seront perdus. Votre progression permanente
  (talents, améliorations, records de vague) est déjà sauvegardée." — ne
  prétend jamais qu'autre chose est en jeu.
- **Annuler** → retour à l'écran Pause (`screens.show('pause')`), PAS une
  reprise (`resumeFromPause`) — `loop.timeScale`/`pauseMenuOpen` restent
  inchangés tout du long (déjà posés par `openPauseMenu` avant que cette
  confirmation n'ait jamais pu s'ouvrir), demande explicite point 7 :
  "CONFIRMATION → PAUSE, pas reprise du jeu."
- **Focus par défaut sur "Annuler"** (point 4 : "je ne veux pas qu'appuyer
  accidentellement sur Entrée valide automatiquement Quitter") :
  `Screens.showQuitRunConfirm()` (nouvelle méthode dédiée, toujours utilisée
  à la place de `show('quitRunConfirm')` direct) appelle `.focus()` sur le
  bouton Annuler après affichage.
- **Échap dans la popup → Annuler** : nouvelle `Screens.isQuitRunConfirmOpen()`,
  vérifiée dans le routeur Échap de `main.ts` AVANT le test `pauseMenuOpen`
  (qui reste vrai pendant que cette confirmation est ouverte par-dessus le
  menu Pause) — sinon Échap serait tombé dans la branche `pauseMenuOpen` et
  aurait repris le jeu par erreur.
- **Idempotence** (point 5, "évite qu'un double clic puisse appeler
  plusieurs fois la destruction de la run") : `main.ts`,
  `quitRunConfirmationInFlight` (booléen, remis à `false` à chaque nouvelle
  `requestQuitRun()`) garde `confirmQuitRun()` contre un second appel à
  `quitToMenu()`.
- **Bouton "Quitter" en rouge appuyé** : nouvelle classe CSS générique
  `.danger-button` (`ui/style.css`) — fond rouge sombre PLEIN (`#5a1414`,
  pas juste une légère teinte comme `.shop-undo-button`/
  `.editor-button--danger`, qui restent inchangées), bordure rouge vif,
  hover nettement plus lumineux (`#8a1f1f` + halo), jamais de clignotement
  (pas demandé, pas fait). Nom volontairement GÉNÉRIQUE (pas
  `.quit-run-button`) pour rester réutilisable par une future action tout
  aussi irréversible. Ajoutée à la liste d'exceptions du halo doré générique
  au survol (`button:not(:disabled):hover`) pour ne jamais diluer le rouge.
- Vérifié EN DIRECT (Playwright, dev server réel) : Échap → Pause visible ;
  clic "Quitter" → popup visible, titre exact, Pause bien masquée dessous ;
  focus par défaut confirmé sur "Annuler" ; couleur de fond du bouton rouge
  confirmée (`rgb(90, 20, 20)` = `#5a1414`) ; clic "Annuler" → retour Pause,
  popup fermée ; réouverture puis Échap → retour Pause (pas de reprise) ;
  clic "Quitter" (rouge) → retour au menu principal, aucune erreur console.

**2. Baliste — +10 PV par niveau d'amélioration permanente — FAIT.**
`data/ballistaUpgrade.ts`, nouveau champ `hpBonusPerLevel: 10` sur
`BallistaUpgradeDef` — s'AJOUTE aux bonus déjà existants (cadence
`attackSpeedPerLevel`, palier de dégâts `damageEveryLevels`/
`damagePerMilestone`), ne les remplace jamais. `run/ballistaUpgradeEffects.ts` :
`ballistaHpBonusDisplay(level) = level * hpBonusPerLevel` (dérivé du seul
`level`, jamais stocké séparément — demande explicite point 12) ;
`effectiveBallistaMaxHp(progress) = getBuilding('ballista').maxHp +
ballistaHpBonusDisplay(level) * HP_PER_PIP` — `getBuilding('ballista').maxHp`
(la vraie BASE, 250 interne = 25 affichés, voir `data/buildings.ts`) reste
totalement inchangée, jamais mutée ; `BallistaUpgradeEffects` (retour de
`computePlayerBallistaUpgradeEffects`) gagne `hpBonusDisplay`/
`effectiveMaxHpInternal`, réutilisant `effectiveBallistaMaxHp` en interne
(un seul calcul, pas deux implémentations parallèles).
- **`sim/world.ts`, `World.spawnBuilding`** gagne un 7ᵉ paramètre optionnel
  `maxHpOverride?: number` — `stats.maxHp` utilise `maxHpOverride ??
  def.maxHp` (la BASE ne sert que de repli), et `hp` (PV ACTUELS au spawn)
  retombe sur ce plafond EFFECTIF quand omis, jamais sur la base seule —
  même motif déjà établi pour `World.spawn()`/`statOverrides.maxHp` (point
  14 de la demande : "maxHp 65, currentHp 65, pas maxHp 65 currentHp 25" —
  exactement la même classe de bug que "je commence à 5/9" déjà corrigée
  pour les unités, voir plus haut dans ce fichier).
- **`main.ts`**, seul site de spawn réel de la Baliste (`onValidatePlacement` —
  `setupTestBattle`, le raccourci "Tester le scénario" de l'éditeur, ne
  spawne AUCUN bâtiment du tout, vérifié par audit, donc jamais concerné)
  passe désormais `effectiveBallistaMaxHp(metaProgress)` en `maxHpOverride`.
  Aucune Baliste ENNEMIE n'existe actuellement (point 13) — cette
  amélioration ne vit que dans `MetaProgress`, lue uniquement côté joueur,
  même principe que toutes les autres améliorations permanentes du jeu.
- **Barre de PV** (`ui/combatOverlay.ts`, `syncBuildings`) : lit déjà
  `entity.stats.maxHp` directement depuis l'Entity LIVE (jamais
  `getBuilding(...).maxHp` re-consulté séparément) — reflète donc
  automatiquement le plafond amélioré sans aucun changement nécessaire là.
- **Coût Gold** : non touché (point 17), aucune règle existante ne liait le
  coût de recrutement au niveau d'amélioration de la Baliste — de toute
  façon la Baliste n'est pas "recrutée" comme une unité, ce concept ne
  s'applique pas ici.
- **UI boutique d'amélioration** (`ui/screens.ts`) : carte "Baliste" gagne
  une ligne "PV bonus : +XX" (nouvel élément `hpBonusEl`, `BallistaUpgradeCardRefs`
  étendue) juste après "Niveau", avant "Vitesse d'attaque"/"Dégâts bonus"
  (ordre demandé point 15). "Prochaine amélioration" affiche désormais
  TOUJOURS "+10 PV, +20 % vitesse d'attaque" (les deux à CHAQUE niveau, pas
  un palier) et ajoute ", +1 DÉGÂT" uniquement si le PROCHAIN achat tombe
  sur un multiple de 3 (point 16 — palier de dégâts mis en évidence,
  logique déjà existante réutilisée telle quelle, juste le texte enrichi).
- Vérifié en headless (`npx tsx`, script temporaire supprimé après usage,
  VRAI `World`/`MetaProgress`/achats réels via `purchaseUpgrade`) : PV
  effectifs exacts aux niveaux 0/1/3/6 (25/35/55/85 affichés) demandés par
  Antoine ; au niveau 3, `attackSpeedBonus`/`damageBonusDisplay` restent
  EXACTEMENT ceux d'avant cette demande (aucune régression sur les bonus
  déjà existants) ; `World.spawnBuilding` avec `maxHpOverride` spawne bien
  à PLEINS PV EFFECTIFS (pas seulement un maxHp augmenté avec des PV actuels
  restés à la base) ; la Mine (aucun override passé) reste strictement
  inchangée (150 interne = 15 affichés, base). 13/13 vérifications passées.

**3. Hit flash blanc sur les bâtiments — AUDIT : déjà entièrement
implémenté, RIEN À FAIRE.** `render/buildingView.ts` (`BuildingView`,
construit lors du chantier BUILDING du même jour, avant même que le bug
"les bâtiments ne peuvent pas être attaqués" ne soit trouvé et corrigé —
voir plus haut) satisfait déjà TOUS les points 18-26 de la demande, sans
qu'aucune modification n'ait été nécessaire :
- Utilise `HIT_FLASH_DURATION` (0.12s, config/constants.ts) — LA MÊME
  constante que `UnitViews.setEmissive`/`tickHitFlash` (point 21 : "cohérence
  parfaite Fantassin/Mine/Baliste").
- Matériaux CLONÉS une seule fois à la CONSTRUCTION de `BuildingView` (pas à
  chaque coup, voir sa boucle `mesh.traverse` dans le constructeur) — jamais
  de nouveau matériau alloué par hit (point 25, performance), et surtout
  jamais PARTAGÉ avec un bâtiment décoratif KayKit du même modèle posé
  ailleurs sur la carte via l'éditeur (point 24 : "Mine A flash, Mine B ne
  flash pas") — documenté explicitement dans son propre commentaire de
  classe, même précaution déjà appliquée aux unités/rochers historiquement.
- Restauration exacte via `emissive.setScalar(0)`/`emissiveIntensity = 0`
  dans `reset()` — même convention "emissive=0 est l'état de repos neutre"
  déjà établie pour les unités riggées (pas une dérive progressive, point
  23 : cohérent avec le fait que toute lueur émissive baked-in est déjà
  désactivée au chargement pour CE genre de matériau, comme documenté pour
  le Mage/Fantassin/Archer/Sentinelle).
- Déclenché UNIQUEMENT sur `CombatEvent.result === 'hit'` (jamais miss/
  dodge, point 20), routé par id (`main.ts`, `target.id === mineEntityId` /
  `ballistaEntityId`) — un bâtiment sans Shield actuellement, donc le cas
  "flash même si absorbé par un Shield" (point 20) est satisfait par
  construction : l'évènement `'hit'` est émis par `combatSystem` AVANT toute
  logique d'absorption, indépendamment de ce qui se passe ensuite dans
  `applyDamageToEntity`.
- `playDestroy()` masque le mesh et ne référence plus jamais rien après
  (point 26) — pas de risque d'accès à un mesh détruit.

Le seul VRAI changement lié à ce point : ce système n'avait jamais pu se
déclencher en pratique jusqu'ici, puisque les bâtiments ne pouvaient pas du
tout être touchés avant le correctif "les unités n'arrivent pas à attaquer
les bâtiments" (voir la section juste au-dessus dans ce fichier) — il
s'active donc désormais pour de vrai, sans qu'aucune ligne n'ait eu besoin
d'être ajoutée ici.

Build/typecheck propres après chaque étape (`npx tsc --noEmit` + `npm run build`).

**Non vérifiable de mon côté** : ressenti visuel du bouton rouge/de la
popup en conditions réelles de jeu (au-delà des couleurs déjà confirmées
par script), lisibilité de la nouvelle ligne "PV bonus" dans la boutique
d'amélioration, et confirmation visuelle que le flash blanc s'affiche
correctement sur la Mine/la Baliste en combat réel (mécanisme vérifié
correct par lecture de code, jamais observé à l'écran par manque d'accès
visuel) — à confirmer par Antoine.

## Bâtiments comme catégorie d'achat en cours de run — Mine et Caserne (2026-08-17)

Refonte fondamentale demandée par Antoine (~79 points) : les bâtiments
(Mine) n'étaient jusque-là obtenus qu'AUTOMATIQUEMENT via le talent "Le
temps, c'est de l'argent" — plus de placement délibéré par le joueur. La
demande explicite : les bâtiments deviennent une VRAIE catégorie d'achat en
boutique de run, au même titre que les unités et les parchemins — le joueur
décide SI/LEQUEL/QUAND/OÙ. Audit complet exigé et livré avant tout code
(boutique, onglets, Mine actuelle, système Building, zones de spawn, modèle
KayKit de la caserne bleue) via un résumé court en 7 points, confirmé par
Antoine ("Ensuite implémente") avant l'implémentation réelle.

**1. Boutique réorganisée** — l'onglet "Soins" a disparu, fusionné avec
"Parchemins de bataille" (`data/items.ts`, `ItemCategory` réduit à
`'battleScroll'` unique — le parchemin de soin ET la Nova de glace
partagent désormais la même catégorie). Nouvel onglet **"Bâtiments"**,
construit ENTIÈREMENT depuis les données (`listBuyableBuildingIds()`,
`data/buildings.ts` — filtre générique sur `BuildingDef.cost !==
undefined`, jamais une liste recopiée à la main) : un futur bâtiment
achetable y apparaît automatiquement, aucun bouton codé en dur.

**2. Achat = mode de PLACEMENT, jamais un achat immédiat.** Cliquer sur
"Mine"/"Caserne" en boutique n'achète RIEN — `main.ts`,
`requestPlaceBuilding(buildingId)` : referme la boutique
(`screens.hideAll()`), arme un `buildingPlacementMode` (mutuellement
exclusif avec l'armement d'un objet d'inventaire, `disarmItem()` appelé en
premier). Un fantôme 3D + un aperçu de cases vert/rouge (réutilise
`editor/editorScene.ts`, `buildGhost`/`buildCellPreview` — infrastructure
DÉJÀ existante pour l'éditeur de maps, aucune duplication) suit le curseur
via un `window.addEventListener('mousemove', ...)` dédié. L'or n'est
JAMAIS déduit tant que le joueur n'a pas cliqué sur une case VALIDE
(`confirmBuildingPlacement`) : annuler (Échap ou clic droit,
`cancelBuildingPlacement`) ne coûte donc littéralement rien, puisque rien
n'a jamais été dépensé — vérifié en direct (Playwright) : 500 or avant/
après un clic droit d'annulation, 500 or avant/après un clic sur une case
invalide (le mode reste actif, prêt pour un nouveau clic), puis 500→400
(coût Mine) et 400→350 (coût Caserne) sur une confirmation valide, montants
exacts. Le bouton lui-même est DÉSACTIVÉ si l'or est insuffisant
(`refreshShop`, `run.gold < cost`) — n'entre même jamais en mode placement
dans ce cas, conforme à la demande explicite ("n'entre même pas en
placement mode").

**3. Validité d'une case = RÉUTILISE `isValidPlacementTile` telle quelle**
(`canPlaceBuildingAt`, `main.ts`) — jamais une deuxième règle de validité
dupliquée : mêmes contraintes qu'une unité (zone de placement réelle du
joueur via `PLACEMENT_ROWS`, aucun obstacle/bâtiment/unité déjà présent sur
AUCUNE des cases de l'empreinte). Empêche structurellement tout placement
en zone neutre/ennemie — pas une approximation `x < largeur/2`, la vraie
géométrie de zone déjà utilisée par le placement d'unités.

**4. Mine — préserve son identité économique EXACTE, change seulement le
mode d'acquisition.** `data/buildings.ts` : `cost: 100` (remplace le talent
retiré), toujours `buildingModel: 'blue_mine'`, `footprintTilesX/Z: 2`, 15
PV inchangés. **Support MULTI-MINES natif** (demande explicite : "2 Mines =
2x le revenu") : `main.ts`, la boucle de revenu passif compte désormais
`livingMineCount` (Entities RÉELLES, team player, `unitId === 'mine'`,
vivantes) et multiplie `effectiveMineGoldPerSecond(metaProgress) *
livingMineCount * dt` — une Mine détruite en bataille arrête IMMÉDIATEMENT
sa contribution (compte recalculé à chaque tick depuis `world.entities`,
jamais une valeur mise en cache). L'amélioration permanente existante
(+0.2 or/s/niveau, `run/mineUpgradeEffects.ts`) s'applique à CHAQUE Mine
possédée, inchangée. La carte "Mine" de la boutique d'amélioration
permanente n'est plus masquée derrière le talent (elle l'était avant même
cette refonte — talent-gated) : toujours visible, achetable même sans Mine
possédée (meta-progression, indépendante d'une run précise).

**5. Nouveau bâtiment CASERNE** (`data/buildings.ts`) — modèle KayKit
EXACT déjà catalogué (`buildingModel: 'blue_barracks'`, famille
`TEAM_BUILDING_FAMILIES.barracks` de `render/assetLibrary.ts`, jamais un
bâtiment procédural), `cost: 50`, footprint 2×2, **25 PV** choisis par
Claude dans la fourchette 20-30 donnée par Antoine ("plus résistante qu'une
petite unité, moins tanky qu'une Sentinelle très améliorée") — ISOLÉ dans
`BuildingDef.maxHp`, jamais couplé à la logique de production, rééquilibrage
ultérieur possible sans toucher au reste.

**6. Production automatique — architecture GÉNÉRIQUE, pas hardcodée
Fantassin.** `data/buildings.ts`, `SpawnerBuildingConfig { unitId,
baseIntervalSeconds, minIntervalSeconds }` — demande explicite d'Antoine
("plus tard Stable → Cavalerie, Tour du Mage → Mage") : la Caserne
configure juste `{ unitId: 'fantassin', baseIntervalSeconds: 10,
minIntervalSeconds: 2 }`, rien dans le moteur ne connaît "Fantassin"
spécifiquement.
- **`sim/systems/barracksSystem.ts`** (nouveau, sim PURE — décide QUAND et
  OÙ, jamais QUELLES STATS) : décompte `Entity.spawnTimer` par bâtiment
  producteur vivant ; à 0, cherche une case libre dans l'ANNEAU autour du
  footprint (`findFreeAdjacentCell` — généralisé à n'importe quelle taille
  d'empreinte, pas seulement 2×2) filtrée par obstacle collidable ET
  entité vivante déjà présente ; ordre DÉTERMINISTE (jamais aléatoire) :
  priorité à la case la plus "avancée" vers le champ de bataille
  (`forwardDir(team)`), puis x croissant, puis z croissant. **Case bloquée
  → le timer reste À ZÉRO, JAMAIS remis à l'intervalle complet** (demande
  explicite, point 29 : "le Fantassin est déjà prêt") — retente
  silencieusement à chaque tick suivant jusqu'à ce qu'une case se libère ;
  vérifié en headless (`World` réel, anneau de rochers autour d'une
  Caserne) : timer bloqué à 0 pendant 20s simulées, aucune perte de la
  "file d'attente".
- `World.barracksSpawnEvents: BarracksSpawnEvent[]` (même patron que
  `combatEvents`/`abilityEvents`, vidé/repeuplé chaque `step()`) — consommé
  dans `main.ts` (pas dans `sim/`, qui ne connaît jamais MetaProgress) :
  `world.spawn(event.unitId, event.team, event.x, event.z, undefined,
  event.team === 'player' ? playerStatOverrides(...) :
  enemyStatOverrides(...), ...)` — le Fantassin produit reçoit EXACTEMENT
  les mêmes améliorations permanentes/talents qu'un Fantassin acheté
  normalement, jamais un "BarracksFootman" spécial. **Aucun coût Gold
  supplémentaire** par Fantassin produit (le joueur a déjà payé la
  Caserne — c'est sa valeur économique).
- **Premier Fantassin à t=10s pile, jamais instantané** — vérifié en
  headless (`World` réel, pas fixe 1/30s) : premier événement entre 9.9s
  et 10.2s, aucun événement avant 9.5s. **Timer en SIMULATION, jamais
  `Date.now`/`setInterval`** : décompté dans `barracksSystem` via `dt`
  reçu du pas fixe (`World.step`) — une Pause (`loop.timeScale = 0`)
  arrête donc totalement la production, aucun risque de dérive liée au
  temps réel.
- **Multiple Casernes indépendantes** — vérifié en headless (2 Casernes,
  chacune son propre `spawnTimer`) : exactement 2 Fantassins produits vers
  t=10s, jamais 1 ni 3.
- **Destruction arrête immédiatement la production** — vérifié en headless
  (Entity marquée `alive=false`) : aucun événement produit après, malgré
  20s simulées supplémentaires (`barracksSystem` ignore toute entité
  `!alive` en tête de boucle).
- **`applyBattleOutcome` (run/runState.ts)** : les Fantassins produits en
  cours de bataille (spawnés APRÈS le placement initial) tombent
  naturellement au-delà de `run.army.length` dans `playerUnitEntities` —
  la boucle de corrélation bornée les ignore, donc un Fantassin de Caserne
  survivant NE REJOINT PAS l'armée permanente (choix délibéré V1, non
  demandé explicitement par Antoine mais cohérent avec "consommé à chaque
  bataille" plutôt qu'une acquisition durable — à reconsidérer s'il préfère
  l'inverse).

**7. Amélioration permanente "Caserne — Vitesse de production"**
(`data/barracksUpgrade.ts`, `run/barracksUpgradeEffects.ts`) : chaque
niveau réduit l'intervalle de **1 SECONDE**, plancher ABSOLU
`Math.max(2, 10 - niveau)` — jamais en dessous de 2s. Séquence vérifiée
exacte pour les niveaux 0 à 10 (10,9,8,7,6,5,4,3,2,2,2). Coût en Runes =
formule standard déjà établie (`baseRuneCost: 10, costMultiplier: 2` —
même point de départ que les 7 autres améliorations, cf. section "Sentinelle
à 10 runes" plus haut où Antoine a posé la règle générale : "quand tu
ajoutes un truc dans la boutique d'amélioration, fais-le commencer à 10").
**Plafonnée à `maxLevel: 8`** (le gain s'arrête là, 10-8=2, déjà le
plancher) — `RuneCostDef` gagne un champ générique optionnel `maxLevel`
(`canPurchaseUpgrade` le vérifie avant le coût en Runes), réutilisable pour
toute future amélioration à plafond. UI (`ui/screens.ts`,
`buildBarracksUpgradeCard`) : "Niveau : N / 8", intervalle actuel, aperçu
du niveau suivant, et au plafond — "MAXIMUM ATTEINT" + bouton désactivé
"MAX" au lieu de "Améliorer". Achetable même sans Caserne possédée dans la
run en cours (meta-progression), même principe déjà établi pour la Mine.

**8. Talent "Le temps, c'est de l'argent" retiré ENTIÈREMENT** —
`data/talents.ts` : entrée supprimée (plus son effet gameplay, plus sa
carte UI). **Migration idempotente sans bump de version** (`run/metaProgress.ts`,
`stripRemovedTalents`, `REMOVED_TALENT_REFUNDS = { temps_argent: 2 }`) :
appliquée à CHAQUE chargement AVANT construction de l'objet final (même
patron que `migrateToV2`, jamais un drapeau "déjà migré" stocké à part) —
une sauvegarde qui l'avait débloqué le perd de `unlockedTalents` ET
récupère intégralement son coût en points de talent, "un joueur ne doit
jamais perdre définitivement ses points" (demande explicite). Vérifié en
headless : remboursement exact (3+2=5), autres talents/vague/unités/runes
préservés intacts, ré-chargement après sauvegarde réelle ne rembourse
JAMAIS une deuxième fois (idempotence confirmée), sauvegarde SANS le
talent retiré totalement inchangée. **`butin_de_guerre` garde Recyclage
comme SEUL enfant de Palier II** — vérifié : `listDependents('butin_de_guerre')`
ne renvoie plus que `recyclage`, layout de l'arbre inchangé (le système
générique par palier/`requires`, voir chantier précédent, n'a demandé
AUCUN changement de code pour cette suppression). L'autre emplacement de
Palier II reste vide, prêt pour un futur talent.

**9. Audit des talents auto-plaçant un bâtiment — un seul trouvé.** Lecture
complète de `data/talents.ts` avant tout retrait : SEUL "Le temps, c'est de
l'argent" créait un bâtiment automatiquement ; aucun autre talent actuel
n'a ce pattern.

**10. Bâtiments HORS inventaire** — confirmé par construction : achat
d'un bâtiment ne touche jamais `RunState.inventory`/`OwnedItem`, flux
totalement séparé (`RunState.buildings: OwnedBuilding[]`, nouveau —
`{buildingId, x, z, hp}`, position CONTINUE via `x`/`z`, jamais
`cornerX`/`cornerZ` — cohérent avec le chantier "placement libre" déjà en
place pour les obstacles de décor).

**11. Rendu générique, remplace l'ancien singleton Mine.**
`ownedBuildingViews`/`buildingViewsByEntityId` (main.ts) : un mesh +
`BuildingView` par bâtiment RÉELLEMENT possédé (`refreshOwnedBuildingViews`,
appelée à chaque `startPlacement`/achat/retour menu), reconstruits depuis
`currentRun.buildings` — remplace l'ancien couple `mineView`/
`mineBuildingView` codé en dur. `buildingViewsByEntityId: Map<number,
BuildingView>` unifie Mine/Caserne ET la Baliste (toujours singleton, cas
spécial documenté — jamais un `OwnedBuilding`, jamais achetable) dans un
SEUL point de dispatch pour le flash de dégâts/la destruction/les barres
de PV — remplace les anciens `if (target.id === mineEntityId) ... else if
(target.id === ballistaEntityId) ...` dupliqués à 3 endroits. `playDestroy()`
étant idempotent (`BuildingView`, déjà le cas avant ce chantier), la
boucle de tick/destruction peut l'appeler chaque frame pour une Entity
morte sans jamais rejouer le VFX plusieurs fois.

**Bug de TDZ trouvé et corrigé en testant en direct (pas par lecture de
code)** : un premier appel EAGER de `refreshOwnedBuildingViews()` au niveau
MODULE (juste après sa définition) lisait `currentRun.buildings` — mais
`currentRun` n'est déclaré que ~250 lignes plus bas dans le fichier,
provoquant `Cannot access 'currentRun' before initialization` au tout
premier chargement de la page (page blanche, plantage immédiat).
Corrigé en retirant cet appel eager : la fonction est déjà invoquée
explicitement partout où c'est nécessaire (`startPlacement`,
`onValidatePlacement`, `returnToEditorAfterTest`) et `currentRun.buildings`
est de toute façon toujours vide au tout premier chargement
(`createNewRun()`). **Trouvé uniquement grâce à une vérification Playwright
réelle** (page blanche observée, pas une simple lecture de code) — sans
cet accès navigateur, ce bug bloquant serait resté invisible.

**Vérifié en direct (Playwright, navigateur réel)** : chargement de la
page sans erreur après correctif ; contenu exact de l'onglet Bâtiments
("Mine 100 / Génère 1.0 Gold par seconde...", "Caserne 50 / Produit
automatiquement un Fantassin toutes les 10 secondes...") ; ghost + aperçu
vert/rouge qui suit bien le curseur (vérifié visuellement sur capture
d'écran, vert sur case valide près de la tour, rouge sur case invalide) ;
séquence complète annulation → clic invalide → confirmation valide → achat
Caserne, montants d'or exacts à chaque étape (500→500→500→400→350) ;
**bataille réelle avec Mine + Caserne + Ballista + Fantassin de départ
simultanément présents** : capture d'écran confirmant un Fantassin
FRAÎCHEMENT PRODUIT (avec sa propre barre de PV) apparu à côté de la
Caserne aux alentours de t≈10-14.5s, popup "+1 or" et compteur d'or qui
progresse (revenu de Mine + kills), aucune erreur console à aucune étape.
Vérifié en headless séparément (imports des VRAIS modules,
`npx tsx`) : migration/remboursement du talent retiré (10 vérifications),
timing/blocage/multi-Caserne/destruction/immobilité de la production
(10 vérifications) — 40 vérifications au total, toutes passées. Build
(`npx tsc --noEmit` + `npm run build`) propre après chaque étape.

**Pas fait — explicitement hors scope V1, noté pour plus tard** : pas de
temps de construction (bâtiment apparaît instantanément sur clic valide,
comme demandé pour cette V1) ; pas d'unité "constructeur" ; sauvegarde
d'une run EN COURS toujours pas implémentée (`RunState` non persisté entre
sessions, comportement déjà connu et voulu — si ça change un jour,
`OwnedBuilding` est déjà conçu pour ne PAS dupliquer `spawnInterval`,
dérivable du niveau d'amélioration) ; **distinction éditeur "Caserne
DÉCORATIVE vs GAMEPLAY" pas construite** — le bâtiment KayKit bleu reste
disponible dans l'asset browser de l'éditeur comme avant (purement
décoratif, un `ObstacleDef`, jamais une Entity), mais rien ne permet
aujourd'hui de placer une VRAIE Caserne gameplay (avec production réelle)
depuis l'éditeur pour tester un scénario — "Tester le scénario"
(`testScenario()`) n'injecte toujours AUCUN bâtiment possédé (comportement
hérité, documenté explicitement dans le code : "une carte d'éditeur n'a
aucun lien avec la progression d'une run réelle"). Antoine l'avait qualifié
de "si nécessaire" — laissé de côté pour cette passe, mais signalé
explicitement plutôt que silencieusement omis ; construirait une métadonnée
optionnelle sur `ObstacleDef` (ex. `gameplayBuildingId?: string`) lue par
`testScenario()`/`setupTestBattle()` pour spawner une vraie Entity en plus
du décor, si demandé.

**Non vérifiable de mon côté au-delà de ce qui précède** : ressenti du
placement à la souris sur un vrai écran (le test Playwright confirme la
mécanique, pas le confort), équilibrage réel des coûts (Mine 100/Caserne
50/rythme de production) sur plusieurs vagues jouées — à confirmer par
Antoine en jeu.

## Descriptions de la boutique en tooltip flottant (2026-08-17)

Antoine, après avoir vu la boutique en jeu réel (Mine, Caserne, Nova de
glace) : "fais le même affichage que pour les points de talents avec les
descriptions sous Mine, Caserne et Parchemin Nova de glace. Cela fait
beaucoup de texte sous les boutons actuellement." Les paragraphes de
description TOUJOURS VISIBLES sous ces 3 boutons sont retirés de la mise en
page ; au survol, le MÊME tooltip flottant partagé déjà utilisé par l'arbre
de talents (`ui/screens.ts`, `talentTooltip`/`talentTooltipName`/
`talentTooltipDesc`, `position: fixed`, se positionne droite→gauche→au-dessus/
en dessous selon la place disponible) s'affiche désormais pour un bouton de
boutique aussi — généralisé, plus réservé aux `TalentDef` :
`showTalentTooltip(anchor, def)` devient `showTooltip(anchor, name,
description)`, nouvelle `attachItemTooltip(anchor, name, descriptionOf: () =>
string)` branchée sur Mine/Caserne (`shopBuildingButtons`), Nova de glace et
Parchemin de soin. Les éléments `<p>` de description existants (Mine/Caserne/
Nova, mis à jour dynamiquement par `refreshShop` — valeur EFFECTIVE, texte
Blizzard conditionnel...) sont CONSERVÉS tels quels comme porteurs de texte,
simplement plus jamais ajoutés à la mise en page visible : `descriptionOf`
lit leur `.textContent` À CHAQUE survol, donc reflète toujours la dernière
valeur recalculée, jamais un texte figé à la construction. Le Parchemin de
soin (texte statique, `data/items.ts`) n'avait jusqu'ici aucune description
affichée du tout — gagne un tooltip par cohérence, sans élément `<p>` dédié
(juste `() => scrollDef.description`). Vérifié en direct (Playwright) : les
3 boutons (Mine, Caserne, Nova de glace, Parchemin de soin) affichent le bon
texte au survol (dont la valeur effective de la Mine "1.0 Gold par seconde"
et le texte conditionnel Blizzard de la Nova), le tooltip disparaît bien au
déplacement de la souris ailleurs, aucune erreur console. Build propre.

## Nouveau talent "Maître de la forge" — Palier II, branche Armée (2026-08-17)

Antoine : "Nouveau point de talents de palier 2, à la suite de 'réflexe de
vétéran' -> 'maître de la forge' : divise par 4 le coût de toutes les
améliorations de la boutique d'amélioration." `data/talents.ts` : entrée
`maitre_forge` (branche `armee`, coût 2 — même convention que les 3 autres
Palier II déjà en place, `requires: 'reflexes_fantassin'`) — positionné
automatiquement dans l'arbre par le système générique par palier/`requires`
déjà en place (`talentTier`/`listDependents`/`talentsByTier`,
`ui/talentTreeLayout.ts`), aucun changement de code pour l'UI.

**Effet — un SEUL point d'insertion pour TOUTES les améliorations, jamais
un `if id === ...` par amélioration.** `run/metaProgress.ts`, nouvelle
`effectiveUpgradeCost(progress, costDef, level)` — calcule le coût de base
(`nextUpgradeCost`, `data/unitUpgrades.ts`, formule partagée par les 8
améliorations du jeu) puis divise par 4 (arrondi, plancher à 1 rune, jamais
gratuit) SI le talent est débloqué. **SOURCE UNIQUE** utilisée à la fois
par la vraie transaction (`canPurchaseUpgrade`/`purchaseUpgrade`, déjà le
moteur générique partagé par les 8 types) ET par l'affichage du prix
(`ui/screens.ts`, `refreshUnitUpgradeShop`, les 8 sites qui affichaient
jusque-là `nextXXXUpgradeCost(level)` appellent désormais
`effectiveUpgradeCost(progress, XXX_UPGRADE, level)`) — jamais deux calculs
qui pourraient diverger entre le prix affiché et le prix réellement facturé.
S'applique donc UNIFORMÉMENT à Fantassin/Archer/Mage, Baliste, Parchemin de
soin, Nova de glace, Mine, Caserne, Sentinelle et Soins excédentaires, sans
qu'aucun de ces 8 modules n'ait eu besoin de connaître l'existence du
talent — `data/unitUpgrades.ts` reste volontairement ignorant des talents
(évite l'import circulaire déjà documenté dans ce fichier), c'est
`run/metaProgress.ts` (qui importe déjà `data/unitUpgrades.ts` ET
`data/talents.ts`) qui porte seul cette logique. Jamais les coûts en OR de
la boutique de RUN (`effectivePlayerUnitCost`, système totalement séparé,
non touché).

**Nettoyage en cascade** : les 8 fonctions `nextXXXUpgradeCost(level)`
(un alias par module — `nextUnitUpgradeCost`, `nextBallistaUpgradeCost`,
`nextHealScrollUpgradeCost`, `nextIceNovaUpgradeCost`, `nextMineUpgradeCost`,
`nextBarracksUpgradeCost`, `nextSentinelUpgradeCost`,
`nextShadowUpgradeCost`) sont devenues mortes une fois leurs 8 sites
d'affichage migrés vers `effectiveUpgradeCost` — supprimées entièrement
(plus aucun consommateur nulle part, confirmé par recherche), conforme à la
convention du projet ("si tu es certain que c'est inutilisé, supprime-le
complètement"), jamais laissées en résidu inerte.

Vérifié en headless (`npx tsx`, imports des VRAIS modules, script jetable
supprimé après usage, 31 vérifications) : position/coût/prérequis du
talent ; refus d'achat sans `reflexes_fantassin` (même avec le talent
universel seul) ; déblocage réussi une fois le prérequis rempli ; formule
de réduction exacte sur plusieurs niveaux (10→3, 20→5, 40→10, 80→20) ; les
8 améliorations divisées par 4 de façon identique ; coût STRICTEMENT
inchangé sur une progression SANS le talent ; achat réel via
`purchaseUpgrade` qui consomme bien le coût RÉDUIT (3 runes, pas 10) ; le
même achat sur une progression de contrôle sans le talent refuse ces mêmes
3 runes (cout réel 10) ; réinitialiser les talents désactive bien la
réduction pour les achats FUTURS tout en préservant intégralement le niveau
déjà acheté (aucune interférence entre le respec des talents et la
boutique d'amélioration permanente, systèmes explicitement séparés). Vérifié
aussi en direct (Playwright) : le nœud "Maître de la forge" apparaît bien
en Palier II sous "Réflexes de vétéran", son tooltip flottant affiche le
bon texte, et la carte Fantassin de la boutique d'amélioration affiche
bien "3" runes (10/4 arrondi) une fois le talent débloqué. Build/typecheck
propres.

## Correctif : "Maître de la forge" arrondissait 2.5 vers le haut (2026-08-17, même jour)

Antoine, immédiatement après avoir pris le talent : "les améliorations qui
coûtent 10 coûtent désormais 3 et non 2.5." Diagnostic direct : la première
version d'`effectiveUpgradeCost` (run/metaProgress.ts) appliquait
`Math.max(1, Math.round(base / 4))` — `Math.round(2.5)` arrondit AU PLUS
PROCHE PAIR SUPÉRIEUR en JS (2.5 → 3), gonflant artificiellement le tout
premier achat de chaque amélioration (base 10, le cas le plus courant —
toutes les améliorations partent de 10 runes) au-delà de la vraie division
par 4. Corrigé : la valeur EXACTE (`base / 4`) est désormais conservée sans
arrondi de prix — seulement protégée contre le bruit de virgule flottante
(nouvelle `roundRunes`, au DIXIÈME près, même motif exact que `roundGold`,
voir `run/runState.ts` et le correctif Gold du 2026-08-14) — jamais un
arrondi qui changerait le prix affiché, uniquement un nettoyage de
précision. Plancher abaissé de 1 rune entière à **0.1 rune** (jamais
gratuit, mais n'a plus de sens de forcer un entier une fois que des coûts
fractionnaires sont réellement affichés). `roundRunes` appliquée aux DEUX
sites qui mutent `MetaProgress.upgradeRunes` (`awardUpgradeRunesForWaveWin`
ET `purchaseUpgrade`), pas seulement le chemin d'achat — même leçon déjà
tirée du correctif Gold ("l'ancien correctif ne couvrait QUE son propre
chemin, achats/ventes en dehors de la mine pouvaient encore dériver").

Vérifié en headless (10 vérifications, script jetable supprimé après
usage) : coût exact 2.5 (pas 3) au niveau 0 pour Fantassin/Baliste/Mine ;
niveaux ≥1 restent des entiers exacts (5, 10... déjà le cas avant, non
affectés) ; un achat à 2.5 runes pile consomme exactement 2.5 (solde à 0,
pas un résidu) ; une séquence d'achats/gains de vague entremêlés (coûts
fractionnaires puis entiers) laisse un solde final toujours "propre" (au
plus 1 décimale, jamais un résidu du type `12.799999999999999`) ; sans le
talent, les coûts restent des entiers stricts, comportement inchangé.
Build/typecheck propres.

## Trois retours sur les bâtiments : barre de vie fantôme, Mine inatteignable, rotation Ctrl+molette (2026-08-17)

Trois demandes distinctes dans le même message.

**1. Barre de vie vide qui reste affichée après la mort d'un bâtiment —
CORRIGÉ.** `main.ts`, la boucle qui alimente `combatOverlay.syncBuildings`
filtrait `if (entity.alive) buildings.push(...)` — un bâtiment mort n'était
donc plus jamais TRANSMIS à `syncBuildings`, qui ne pouvait dès lors plus
jamais exécuter sa propre branche `if (!entity.alive) { bar.style.display =
'none'; }` (déjà correcte, mais jamais atteinte pour une entité absente du
tableau reçu). La barre restait figée à son tout dernier état affiché
(quasi vide juste avant la mort) indéfiniment. Corrigé en poussant
TOUJOURS l'entité (morte ou vivante) dans le tableau — `syncBuildings` gère
déjà elle-même le masquage, exactement comme `sync()` le fait pour les
unités (`nonBuildingEntities`, jamais filtré par `alive` non plus).

**2. "Les unités adverses n'arrivent toujours pas à taper la mine" — AUDIT
APPROFONDI, AUCUN BUG DE COMBAT TROUVÉ, cause réelle identifiée.** Diagnostic
mené en trois temps, headless puis en direct (navigateur réel, `window
.__debugWorld` exposé temporairement pour inspecter `World.entities` en
cours de partie) :
- Le pipeline combat/ligne de tir pour un bâtiment fonctionne CORRECTEMENT :
  vérifié qu'un ennemi adjacent à la Mine (isolée, ou juxtaposée à la
  Baliste) l'endommage et la détruit sans problème, aussi bien en headless
  qu'en JEU RÉEL (achat + placement + bataille complète via Playwright,
  Mine détruite de 150 à 0 PV en ~15s simulées, `enemyTargetingMine: 2`
  confirmé).
- **Cause réelle trouvée par un test ciblé** : quand la Mine est positionnée
  DERRIÈRE un autre bâtiment du joueur (Baliste ou Caserne, alignés dans
  l'axe d'approche des ennemis), un ennemi qui atteint sa portée d'attaque
  sur le bâtiment le plus proche s'y VERROUILLE (`targetingSystem`, cible
  gardée "tant qu'elle est vivante et dans l'aggro" — comportement voulu,
  base de la lisibilité du combat) et s'ARRÊTE de bouger (portée
  atteinte) — il ne peut donc plus jamais se rapprocher de la Mine tant que
  ce bâtiment-écran reste vivant. Vérifié explicitement : forcer la mort du
  bâtiment de devant fait bien basculer l'ennemi sur le bâtiment suivant
  dans le cluster (jamais directement sur la Mine si un troisième bâtiment
  la protège encore). La Baliste (250 PV internes, potentiellement
  amélioré) peut absorber ça très longtemps, donnant l'impression que la
  Mine "n'est jamais attaquée" alors que le mécanisme fonctionnerait dès
  que son écran tombe.
- **Pas de correctif appliqué** : ce comportement est la conséquence directe
  et cohérente du système de ciblage collant déjà utilisé partout ailleurs
  (une unité qui bloque le passage protège ce qu'il y a derrière) —
  changer ça toucherait aussi le combat unité-contre-unité, une décision de
  design qui revient à Antoine, pas un bug isolé aux bâtiments. À
  reconfirmer avec lui si le comportement voulu est différent (ex. un
  ennemi qui réévalue périodiquement une cible plus intéressante même déjà
  engagé) avant de retoucher `targetingSystem`.

**3. Ctrl+molette pour tourner un bâtiment par pas de 45° pendant le
placement — FAIT**, avec indication discrète. `run/runState.ts`,
`OwnedBuilding` gagne `rotationY?: number` (radians) — PUREMENT cosmétique,
jamais lu par le calcul de collision (`obstacleBounds`, `sim/geometry.ts`,
reste toujours axé sur `tilesX`/`tilesZ` quel que soit l'angle, même
principe déjà établi pour les rochers/arbres/props de l'éditeur — voir
`render/buildings.ts`, `createBuildingObstacle`, qui applique déjà
`rotationY` uniquement au maillage). `main.ts`, `BuildingPlacementMode`
gagne `rotationY: number` (0 à l'armement) ; nouvelle
`rotateBuildingPlacement(direction)` — `Math.PI/4` par cran, rafraîchit le
fantôme IMMÉDIATEMENT via la dernière position sol connue
(`lastBuildingGhostGroundX/Z`, mémorisée à chaque `updateBuildingPlacementGhost`)
sans attendre un nouveau `mousemove`. Écouteur `wheel` existant (déjà
utilisé pour le zoom caméra) étendu : si `buildingPlacementMode &&
event.ctrlKey`, tourne au lieu de zoomer — `event.preventDefault()` déjà
appelé inconditionnellement en tête, ce qui supprime aussi le zoom natif du
navigateur sur Ctrl+molette. `confirmBuildingPlacement` persiste la
rotation choisie dans `OwnedBuilding.rotationY`, relue par
`ownedBuildingObstacle` (au lieu du `rotationY: 0` codé en dur avant).
`ui/buildingRotationHint.ts` (nouveau, même patron que `WaveIndicator`) :
petit encart discret ("Ctrl + molette — tourner (45°)"), centré en bas de
l'écran juste au-dessus de `.placement-panel` pour ne jamais le recouvrir —
visible uniquement entre `requestPlaceBuilding` et
`cancelBuildingPlacement`/`confirmBuildingPlacement`.

Vérifié en direct (Playwright) : le hint apparaît/disparaît exactement aux
bons moments (armement → visible, Échap → masqué, or inchangé) ; molette
SANS Ctrl continue de zoomer normalement (zoom 20→22 observé) ; molette
AVEC Ctrl fait visiblement tourner le fantôme (silhouette confirmée
différente entre 0° et 135° sur deux captures d'écran) sans jamais changer
le zoom. Build/typecheck propres.

## Bouton d'amélioration de la Caserne corrigé + refonte de la production (2026-08-17)

Deux demandes dans le même message.

**1. Bug — le bouton "Améliorer" de la Caserne ne faisait rien —
CORRIGÉ.** Cause exacte : `main.ts`, `onPurchaseUnitUpgrade` (dispatch
générique par id vers `purchaseUpgrade`, voir `run/metaProgress.ts`) est une
longue chaîne de ternaires qui associe chaque id d'amélioration à son
`RuneCostDef` (`BALLISTA_UPGRADE`/`HEAL_SCROLL_UPGRADE`/`ICE_NOVA_UPGRADE`/
`MINE_UPGRADE`/`SENTINEL_UPGRADE`/`SHADOW_UPGRADE`) — `BARRACKS_UPGRADE`
avait été OMISE de cette chaîne depuis la toute première introduction de la
Caserne achetable, jamais ajoutée. `costDef` valait donc `undefined` pour
`id === 'barracks'`, et `purchaseUpgrade` n'était jamais appelée — un clic
sur le bouton (pourtant correctement activé/désactivé selon les runes
disponibles, ce n'était pas ça le problème) ne faisait strictement rien.
Corrigé en ajoutant la branche manquante à la chaîne.

**2. Refonte de la production de la Caserne** — Antoine : "il faut invoquer
un fantassin toutes les 5 secondes, l'amélioration augmente le nombre de
fantassin invoqué de 1 toutes les 5 secondes (il en sort 2 au lieu de 1),
toutes les 3 améliorations réduit le délai d'invocation de 1sec (ne peut
pas descendre en dessous de 1 seconde)". Remplace entièrement l'ancienne
formule (intervalle SEUL levier, 10s de base → 2s au niveau 8, plafonnée) :

- `data/buildings.ts`, `BUILDINGS.barracks.spawner` : base 10s→**5s**,
  plancher 2s→**1s**.
- `data/barracksUpgrade.ts` : `intervalReductionPerLevel` (appliqué à
  CHAQUE achat) remplacé par deux leviers distincts — `countPerLevel: 1`
  (+1 Fantassin PAR PRODUCTION à CHAQUE achat, jamais composé) et
  `intervalReductionPerMilestone: 1`/`intervalEveryLevels: 3` (-1s
  SEULEMENT tous les 3 achats, même famille de palier déjà utilisée par
  Baliste/Nova de glace/Sentinelle). **`maxLevel` supprimé entièrement** —
  l'ancien plafond (8) n'avait de sens que quand l'intervalle était l'UNIQUE
  levier ; le bonus de nombre reste utile à l'infini.
- `run/barracksUpgradeEffects.ts` : nouvelle `effectiveBarracksSpawnCount(progress)
  = 1 + level * countPerLevel` ; `effectiveBarracksSpawnInterval` recalculée
  par PALIER (`floor(level / intervalEveryLevels) * intervalReductionPerMilestone`,
  toujours plafonnée au plancher) ; `isBarracksUpgradeMaxed` supprimée,
  remplacée par `barracksRemainingUntilIntervalMilestone`/
  `barracksNextPurchaseGrantsIntervalMilestone` (même convention que les
  autres cartes à palier).
- **Production en LOT côté simulation** — `sim/entity.ts`, nouveau
  `Entity.spawnCount: number | null` (même convention que
  `spawnIntervalSeconds`, figé au spawn du bâtiment) ; `World.spawnBuilding`
  gagne un 9ᵉ paramètre `spawnCountOverride` ; `sim/systems/barracksSystem.ts`,
  `findFreeAdjacentCell` (singulier) devient `findFreeAdjacentCells` (renvoie
  jusqu'à N cases distinctes du même anneau) — la production est **ATOMIQUE** :
  si MOINS de cases libres que `spawnCount` ne sont trouvées, RIEN n'est
  produit ce tick (jamais un lot partiel), le timer reste à 0 et retente au
  tick suivant, même philosophie "file d'attente jamais perdue" déjà en
  place pour l'ancien cas à 1 seule unité. `main.ts`, `onValidatePlacement`
  calcule `spawnCountOverride = effectiveBarracksSpawnCount(metaProgress)`
  au moment de spawner la Caserne (comme `spawnIntervalOverride` déjà
  existant) — la boucle de consommation de `world.barracksSpawnEvents`
  n'a nécessité AUCUN changement (déjà générique, un événement par unité
  produite, potentiellement plusieurs par tick).
- **UI** (`ui/screens.ts`) : carte Caserne étoffée — nouvelle ligne
  "Fantassins par production", aperçu du prochain achat conditionnel
  ("+1 Fantassin" seul, ou "+1 Fantassin, -1 s d'intervalle" si le palier
  suivant tombe dessus), ligne "Prochaine réduction d'intervalle : dans N
  améliorations" — remplacée honnêtement par "Intervalle déjà au minimum
  (1 s)" une fois le plancher atteint (le palier suivant ne changerait plus
  rien à l'intervalle, même si le bonus de nombre continue d'être utile).
  Plus d'état "MAXIMUM ATTEINT"/bouton "MAX" — le bouton reste "Améliorer"
  indéfiniment.

Vérifié en headless (`npx tsx`, imports des VRAIS modules + `World` réel,
35 vérifications) : table complète niveau→nombre/intervalle (0 à 30),
paliers de réduction exacts, absence de `maxLevel`, achat réel via
`purchaseUpgrade` (confirme que le moteur générique accepte bien
`id: 'barracks'` — la régression exacte du bug), **production en lot via un
vrai `World`/`barracksSystem`** (2 Fantassins sortent ensemble au même tick,
jamais étalés), et **le test critique d'atomicité** (une seule case libre
disponible pour un lot de 2 → AUCUN Fantassin ne sort, jamais un lot
partiel). Vérifié aussi en direct (Playwright, sauvegarde pré-remplie en
Runes via localStorage) : clic réel sur "Améliorer" fonctionne enfin
(niveau 0→1→2→3 confirmé), les textes de palier apparaissent/disparaissent
exactement aux niveaux attendus (aperçu "-1 s d'intervalle" visible au
niveau 2 juste avant le palier, intervalle qui passe bien de 5s à 4s au
niveau 3), aucune erreur console, mise en page cohérente avec les 8 autres
cartes. Build/typecheck propres.

## Bouton debug "+100 or", rotation des bâtiments qui ne survivait pas à une vague, déplacement des bâtiments déjà posés (2026-08-17)

Trois demandes distinctes d'Antoine dans le même message.

**1. Bouton debug "+100 or" — FAIT.** Même patron exact que le bouton
"+1 point de talent (debug)" déjà en place (2026-08-14) : bouton temporaire,
explicitement annoncé comme "sera retiré plus tard" par Antoine —
`ScreenHandlers.onDebugAddGold`, `main.ts` (`currentRun.gold =
roundGold(currentRun.gold + 100)`, réutilise `roundGold` comme toute autre
mutation de l'or — voir le correctif de dérive flottante du 2026-08-14),
bouton `.shop-debug-button` (variante ambrée du style pointillé
`.talent-debug-button`) dans l'onglet Unités de la boutique de run. Les 3
sites (handler, construction du bouton, classe CSS) sont marqués
"A RETIRER" dans leurs commentaires respectifs, comme pour le bouton de
talent équivalent.

**2. Bug réel corrigé : la rotation à 45° d'un bâtiment ne survivait pas à
la vague suivante** ("à la manche d'après il se tourne vers une position à
90°"). Cause exacte trouvée par lecture de `run/runState.ts`,
`applyBattleOutcome` : la boucle qui reconstruit `RunState.buildings` après
CHAQUE bataille (pour mettre à jour les PV des bâtiments survivants,
mécanisme déjà en place depuis le chantier BUILDING) reconstruisait un
nouvel objet `OwnedBuilding` littéral qui n'incluait JAMAIS le champ
`rotationY` — la rotation choisie par le joueur repassait donc silencieusement
à `undefined` (donc `0` via `?? 0` au rendu) après la toute première
bataille, quel que soit l'angle réellement posé. Corrigé en ajoutant
`rotationY: run.buildings[i]!.rotationY` à cet objet littéral — un seul
champ manquant, aucun autre changement nécessaire (le champ existait déjà
sur le type `OwnedBuilding` depuis l'implémentation d'origine de la
rotation Ctrl+molette). Vérifié en headless (`npx tsx`, imports des VRAIS
modules `run/runState.ts`/`sim/world.ts`/`data/buildings.ts`, script
temporaire supprimé après usage) : rotation à 45° posée sur une Mine,
`applyBattleOutcome` appelée sur une bataille gagnée — rotation
STRICTEMENT préservée (ni 0 ni 90°) ; répété sur une DEUXIÈME bataille
consécutive pour confirmer que ça tient sur plusieurs vagues d'affilée, pas
seulement la première.

**3. Déplacer un bâtiment déjà posé pendant la phase de placement —
FAIT.** Jusqu'ici, `BuildingPlacementMode` ne représentait qu'un achat en
cours (fantôme + aperçu de case, coût déduit à la confirmation) — aucun
moyen de reprendre un bâtiment déjà validé pour le repositionner.
Généralisé plutôt que dupliqué : `BuildingPlacementMode` gagne
`movingIndex: number | null` (`null` = achat normal, un index réel =
repositionnement d'un `OwnedBuilding` existant) — TOUTE la mécanique déjà
en place (fantôme 3D, aperçu vert/rouge, rotation Ctrl+molette, validation
via `isValidPlacementTile`) est réutilisée sans changement structurel,
seule la résolution finale diverge :
- **Ramassage** : `requestMoveBuilding(index)` — appelée sur un clic en
  phase de placement qui touche un bâtiment DÉJÀ possédé (nouveau
  `findHoveredOwnedBuilding(event)`/`findOwnedBuildingIndex(object)`, même
  patron de tag+remontée de hiérarchie que `findSlotIndex`/`findHoveredSlot`
  pour les unités : `mesh.userData['ownedBuildingIndex'] = i`, posé dans
  `refreshOwnedBuildingViews`). Désarme d'abord tout objet d'inventaire en
  cours (`disarmItem()`), démarre le mode placement avec la rotation
  ACTUELLE du bâtiment (pas remise à 0), et **masque le mesh existant**
  (`view.mesh.visible = false`) pendant tout le déplacement — sans ça, le
  bâtiment original serait resté visible en double à côté de son fantôme.
- **Auto-exclusion** : `activeBuildingObstacles(excludeBuildingIndex?)`,
  `isValidPlacementTile(..., excludeBuildingIndex?)` et
  `canPlaceBuildingAt(..., excludeBuildingIndex?)` gagnent tous un
  paramètre optionnel qui exclut le bâtiment en cours de déplacement de son
  propre test de collision — sans ça, un bâtiment n'aurait jamais pu être
  reposé sur SA PROPRE case (ou une case qui chevauche sa propre emprise
  d'origine), rendant le déplacement quasiment impossible en pratique.
- **Confirmation** : `confirmBuildingPlacement` bifurque sur
  `movingIndex` — si non-null, MUTE l'`OwnedBuilding` existant en place
  (nouvelle position + nouvelle rotation), **entièrement GRATUIT** (aucune
  déduction d'or, contrairement à un achat) ; sinon, comportement inchangé
  (achat + push d'un nouvel `OwnedBuilding`). `cancelBuildingPlacement`
  (Échap/clic droit, déjà existants) restaure la visibilité du mesh
  d'origine si le déplacement est annulé en cours de route.
- Vérifié en direct (Playwright, dev server réel, plusieurs scripts
  jetables supprimés après usage) : bouton debug "+100 or" confirmé
  (5.0→105.0→205.0 sur deux clics) ; achat d'une Mine confirmé (or déduit
  correctement, mesh visible à côté de la tour Baliste) ; clic sur la Mine
  déjà posée confirmé comme entrant en mode déplacement (indice de
  rotation qui apparaît, mesh masqué) ; **redéposer au MÊME emplacement
  exact confirmé réussi** (auto-exclusion fonctionnelle, mesh réapparaît
  pile à sa position d'origine) ; **déplacement vers une case libre proche
  confirmé réussi et VISIBLEMENT déplacé** (capture d'écran : la Mine
  apparaît décalée par rapport à sa position précédente) ; un clic sur une
  case invalide (obstacle/hors zone) confirmé comme n'ayant AUCUN effet
  (le mode reste actif, le mesh reste masqué en attendant un clic valide —
  comportement voulu, pas un bug) ; le tout GRATUIT (or strictement
  identique avant/après un déplacement réussi) ; aucune erreur console à
  aucune étape. Build/typecheck propres.

**Non vérifiable de mon côté** : ressenti du geste de ramassage/dépôt à la
souris en conditions de jeu réelles (le test confirme la mécanique, pas le
confort) — à confirmer par Antoine.

## Déplacement de bâtiment vraiment continu (clic-glisser-relâcher) + agrandissement progressif de la map (2026-08-18)

Deux chantiers dans le même message, audit complet exigé avant tout code
(déplacement de bâtiment, cellules sparse, zones de spawn, pathfinding,
MapSerializer, séquencement Victory→Placement, caméra) — mené par lecture
directe (Grep/Read), pas de suppositions. Résumé livré à Antoine avant
d'implémenter, avec un focus explicite sur l'ÉTAPE C (la plus sensible).

### Partie 1 — le bâtiment ne disparaît plus au clic

**Cause exacte trouvée** : `requestMoveBuilding` (déclenchée directement au
`mousedown`, sans seuil) masquait le mesh original (`view.mesh.visible =
false`) **immédiatement**, mais le fantôme n'était créé qu'au **prochain
`mousemove`** (`updateBuildingPlacementGhost`, appelée par un listener
séparé). D'où exactement le symptôme décrit : clic → mesh masqué → rien
pour le remplacer tant que la souris n'a pas bougé → un mousemove arrive →
le fantôme apparaît sous le curseur. Aucun seuil de glisser n'existait non
plus : un simple clic sans bouger déclenchait déjà toute la mécanique.

**Correctif** — `main.ts` :
- `BUILDING_DRAG_THRESHOLD_PX` (= `UNIT_DRAG_THRESHOLD_PX`, 6px, même patron
  que le glisser-vendre d'unité déjà en place) + `buildingClickCandidate:
  {index, startClientX, startClientY} | null` : posé au `mousedown` sur un
  bâtiment possédé, **rien ne bouge encore**. Un nouveau listener
  `mousemove` promeut le candidat en vrai glisser (`requestMoveBuilding`)
  dès que le seuil est dépassé.
- `requestMoveBuilding` réordonnée : pose le fantôme **sur la transform
  ACTUELLE du bâtiment** (`owned.x/owned.z`, déjà le centre exact de son
  empreinte) *avant* de masquer le mesh d'origine — zéro frame sans rien à
  l'écran. Le listener `mousemove` déjà existant (fantôme qui suit le
  curseur) tourne ensuite sur le MÊME événement (JS synchrone, aucun
  repaint entre les deux) et repositionne aussitôt ce même fantôme sous le
  vrai curseur, sans attendre un second mousemove.
- Sélection légère : un simple clic (sous le seuil) affiche un anneau doré
  autour du bâtiment (`selectedBuildingIndex`/`buildingSelectionRing`,
  reconstruit à chaque changement — `RingGeometry` non redimensionnable en
  place —, réutilise `createEditorSelectionRing` déjà utilisée par
  l'éditeur), sans jamais toucher au bâtiment. Toggle au re-clic. Clic
  ailleurs (unité, sol) désélectionne.
- `confirmBuildingPlacement` renvoie désormais un **booléen** (commit
  réussi ou non) au lieu de `void` — le site d'appel historique (clic de
  confirmation façon "armer puis re-cliquer", achat) ignore la valeur et
  garde son comportement (reste armé sur un essai invalide) ; un nouveau
  listener `mouseup` (relâchement en fin de glisser) l'utilise pour
  appeler `cancelBuildingPlacement()` lui-même sur `false` — retour
  **automatique** à la position d'origine sur une case invalide, jamais de
  bâtiment perdu ni d'or perdu, conforme à la demande explicite.
- Nettoyage défensif : `buildingClickCandidate` vidé inconditionnellement
  par clic droit, Échap (nouvelle condition `buildingPlacementMode ||
  buildingClickCandidate`), `blur`/`pointercancel`, et par
  `cancelBuildingPlacement()` elle-même (source unique). `selectedBuildingIndex`
  réinitialisé à `onValidatePlacement` (bataille) et `quitToMenu`.
- **Toujours un fantôme cloné semi-transparent** (`buildGhost`, déjà utilisé
  uniformément pour obstacles/unités/bâtiments dans tout le jeu), pas le
  mesh réel lui-même déplacé en place — choix explicitement autorisé par
  Antoine comme repli ("si une preview clonée est nécessaire") : bouger le
  VRAI mesh aurait demandé de faire cohabiter la transparence de prévisu
  avec la gestion de matériaux déjà en place pour le flash de dégâts/la
  destruction (`BuildingView`), plus risqué pour un gain marginal.
- Vérifié en direct (Playwright) : clic simple → bâtiment inchangé, anneau
  doré visible (capture d'écran confirmée) ; re-clic → toggle ; vrai
  glisser → fantôme visible pendant le drag ; drop invalide (hors zone) →
  annulation automatique, or inchangé, aucune erreur ; drop valide proche →
  déplacement gratuit confirmé visuellement (capture d'écran, bâtiment
  décalé). Aucune erreur console à aucune étape.

### Partie 2 — agrandissement progressif de la map

**Architecture retenue après audit** : la map reste TOUJOURS un rectangle
plein (jamais une forme irrégulière) piloté par 3 compteurs sur
`RunState.mapExpansion` (nouveau, `run/mapExpansion.ts`) plutôt qu'une
liste de cellules éditée à la main :
- `spawnDepth` — profondeur de CHAQUE zone de spawn (joueur ET ennemi,
  toujours égales — topologie symétrique même si l'IA n'utilise pas encore
  ses propres bâtiments). Démarre à `PLACEMENT_ROWS` (7), qui redevient
  ainsi la valeur de DÉPART plutôt qu'une constante figée — le jeu réel lit
  désormais `currentRun.mapExpansion.spawnDepth` partout où l'ancienne
  constante était utilisée (`computeArmyFormation`,
  `computeEnemyWavePlacements`, `isValidPlacementTile`), l'éditeur de maps
  garde `PLACEMENT_ROWS` tel quel (aucun lien avec la progression d'une
  run réelle).
- `halfWidthTiles` — demi-largeur en cases.
- `battlefieldRows` — rangées NEUTRES entre les deux zones de spawn.

`map.width`/`map.height` sont TOUJOURS dérivés de ces 3 compteurs
(`width = halfWidthTiles*2`, `height = 2*spawnDepth + battlefieldRows`),
jamais désynchronisés. Découverte clé de l'audit qui a rendu ça possible :
**les zones (joueur/ennemi/neutre) ne sont pas stockées par cellule dans ce
jeu — c'est un pur calcul géométrique sur Z** (`render/board.ts`,
`createZone`/`main.ts`, `isValidPlacementTile`), jamais tagué par cellule.
Une nouvelle colonne latérale hérite donc automatiquement de la bonne zone
sans le moindre tag à poser (ÉTAPE B).

**Cycle A→B→C** (`MapExpansionStep = 'spawnBack' | 'sides' | 'center'`,
`expansionStepForCompletedWave(completedWave) = STEP_CYCLE[(completedWave-1)%3]`) :
- **ÉTAPE A (`spawnBack`)** : `spawnDepth += 1`, `height += 2` — vérifié
  par calcul que la frontière spawn/battlefield (`frontZ =
  battlefieldRows/2`) est INDÉPENDANTE de `spawnDepth` : seule la
  profondeur ARRIÈRE de chaque zone grandit, rien ne bouge.
- **ÉTAPE B (`sides`)** : `halfWidthTiles += 1`, `width += 2` — grandit
  symétriquement autour de X=0, rien ne bouge non plus.
- **ÉTAPE C (`center`)**, la partie sensible — retenue la préférence B
  explicite d'Antoine (translater plutôt qu'étirer) : le camp JOUEUR reste
  **absolument fixe** ; une fonction CENTRALISÉE unique
  (`centerExpansionZOffset(z, playerFrontZ, enemyFrontZ)`, calculée depuis
  les frontières *avant* cette étape) renvoie 0 pour tout ce qui est dans
  la zone joueur, -1 case pour l'ancien champ de bataille, -2 cases pour la
  zone ennemie et au-delà — appliquée à `map.obstacles`/`playerUnits`/
  `enemyUnits` via `translateObstacleZ`/`translateUnitZ` (jamais un `z -=
  2` dispersé). `battlefieldRows += 2`. Audité avant de coder : les
  positions d'unités (joueur ET ennemi) sont RECALCULÉES à chaque vague
  depuis une formule (jamais persistées), donc rien à translater côté
  armées ; les bâtiments possédés du joueur sont, par construction,
  toujours dans la zone joueur (offset 0 automatique) — la fonction leur
  est appliquée quand même par sécurité/généricité plutôt que supposée.
- Terrain des nouvelles cellules : régénéré en rectangle plein 'grass'
  (`DEFAULT_EXPANSION_TERRAIN`) à chaque étape plutôt que "hérité" cellule
  par cellule — toutes les cellules de ce jeu sont déjà uniformément
  herbe (`DEFAULT_MAP.cells` absent, synthétisé par `resolveMapCells`),
  donc régénérer reproduit fidèlement l'existant sans logique
  supplémentaire.

**Séquencement Victory→Placement** : appliqué dans le callback `onBlackout`
de `waveTransition.play` (derrière le rideau noir, invisible), UNIQUEMENT
sur `outcome.won === true`, avec `waveBeingFought` (capturé avant
l'incrément de `waveNumber`) comme "vague réellement gagnée". Découverte en
auditant : `WaveTransition.play()` ne relâchait pas la charrette — le
rideau se rouvrait sur un simple `setTimeout`, sans attendre `onBlackout`.
Comme reconstruire le plateau (`createBoard`) est intrinsèquement async
(même avec des assets déjà en cache, un `await` reste toujours différé
d'au moins un microtask), une expansion aurait pu rester visible à moitié
faite au moment où le rideau se rouvre. Corrigé : `onBlackout` accepte
désormais `void | Promise<void>`, et `play()` attend sa résolution avant de
retirer la classe `--visible` du rideau — rétrocompatible (un callback
synchrone se résout sur le microtask suivant, comportement inchangé).

**Idempotence** : `RunState.mapExpansion.lastExpandedWave` — `if
(completedWave <= lastExpandedWave) return;` en toute première ligne de
`applyMapExpansionForCompletedWave`, mis à jour dans le même geste que
l'expansion elle-même (jamais un état intermédiaire où l'un est à jour
sans l'autre).

**Bâtiments/Baliste/plateau visuel** : `refreshOwnedBuildingViews()`
rappelée après translation (pertinent seulement après l'ÉTAPE C) ;
`ballistaObstacleDef`/`playerArrowOrigin` (désormais `let`, recalculés
depuis `computeBallistaObstacle`/`computePlayerArrowOrigin(currentMap)`) +
`repositionBallista()` — la Baliste reste au coin, qu'il se soit éloigné
(A/B) ou soit resté fixe (C, camp joueur). `board` (désormais `let` au lieu
de `const`) entièrement reconstruit (`renderer.scene.remove` puis
`createBoard(currentMap, spawnDepth)`) — factorisé dans
`rebuildGameBoardVisuals()`, réutilisée aussi par `resetGameBoardToDefaultMap()`
(nouveau : `startNewRun()` doit resynchroniser `currentMap`/le rendu si une
run PRÉCÉDENTE avait agrandi la map — sinon une run neuve démarrerait avec
un plateau visuel encore à l'ancienne taille alors que
`currentRun.mapExpansion` vient de repartir de zéro via `createNewRun`).
`World.setMap(currentMap)` rappelée explicitement (sera de toute façon
rappelée au début de la prochaine bataille, mais évite tout état
intermédiaire périmé).

**Caméra — rien à faire, confirmé par audit** : ce jeu n'a AUCUNE limite de
pan liée à la taille du plateau (glisser libre, `render/renderer.ts`,
`pan()`) et le zoom est borné par une constante fixe indépendante de la
taille du board — les nouvelles cases sont donc déjà atteignables sans le
moindre changement.

**`render/board.ts`** : `createBoard`/`createZonesGroup`/`createZone`
gagnent un paramètre optionnel `spawnDepth` (défaut `PLACEMENT_ROWS`) —
seul le rebuild du plateau RÉEL le passe explicitement
(`currentRun.mapExpansion.spawnDepth`), l'éditeur de maps/testBoard
gardent le comportement par défaut inchangé (aucun lien avec la
progression d'une run).

**Vérifié en headless** (`npx tsx`, imports des VRAIS modules, scripts
jetables supprimés après usage, 49 vérifications au total) : cycle exact
sur 7 vagues (1→A, 2→B, 3→C, 4→A, 5→B, 6→C, 7→A, conforme point pour point
au test demandé par Antoine) ; état initial correct (`spawnDepth =
PLACEMENT_ROWS` etc.) ; ÉTAPE A/B — hauteur/largeur qui grandissent
exactement, **référence d'objet obstacle strictement INCHANGÉE** (jamais
translaté) ; ÉTAPE C — un obstacle synthétique dans chacune des 3 bandes
(zone joueur/ancien battlefield/zone ennemie) subit exactement l'offset
attendu (0/-1/-2), vérifié aussi directement sur `offsetForZ` juste au-dessus/
en-dessous de chaque frontière (les vrais centres de case sont toujours des
demi-entiers, jamais pile sur une frontière entière) ; idempotence (2e/3e
application de la même vague refusée) ; cumul exact sur 7 vagues
(`spawnDepth`/`halfWidthTiles`/`battlefieldRows` = valeurs attendues,
zone Player Spawn strictement plus grande qu'au départ). **Vérifié aussi
via un VRAI `World`** (`World.setMap` sur une map agrandie 6 fois) :
`boardWidth`/`boardHeight` corrects, **zéro obstacle "vide" synthétique**
injecté (le rectangle plein généré couvre exactement l'emprise, aucun trou
— confirme que le mécanisme `computeVoidObstacles` existant, prévu pour
une map irrégulière, reste inutilisé ici et ne coûte rien), pathfinding
fonctionnel (`findPath`) entre deux coins opposés du plateau agrandi.

**Vérifié en direct (Playwright), bout en bout, le chemin le plus à
risque** : run complète jusqu'à une vraie victoire de la vague 1 (combat
réel accéléré ×2, pas une simulation) → séquence de transition → callback
async → reconstruction du plateau → écran "Vague 1 terminée — Victoire" →
"Continuer" → placement de la **vague 2** confirmé (indicateur de vague) →
plateau visuellement plus grand (capture d'écran) → **zéro erreur
console/page à aucune étape**, y compris pendant la fenêtre async du
rideau. C'est la confirmation la plus importante de cette passe : le point
le plus risqué de l'implémentation (faire attendre le rideau sur un
`await createBoard(...)` réel, en conditions de jeu réelles, pas
seulement en théorie) fonctionne sans accroc.

**Non vérifiable de mon côté** : ressenti visuel réel de chaque étape
(A/B/C) sur plusieurs cycles complets, lisibilité de l'agrandissement à
l'œil sur la durée d'une run longue (7+ vagues), confort de construire
Mine/Caserne sur les nouvelles cases de spawn — à confirmer par Antoine en
jouant plusieurs vagues d'affilée. Build/typecheck propres
(`npx tsc --noEmit` + `npm run build`) après chaque étape.

## Polish gameplay/UX/VFX : projectiles d'ombre, coûts de boutique dynamiques, placement obligatoire de la tour (2026-08-18)

Quatre objectifs dans le même message, audit complet exigé avant tout code
(VFX Fireball/ombre, définitions de shop Mine/Caserne, fonctions de coût
effectif, upgrades Mine/Caserne/Baliste, flow de début de run, placement des
bâtiments, zone de spawn). Résumé livré avant implémentation.

### 1. Deuxième passe VFX — projectiles d'ombre

`render/shadowProjectileView.ts` avait déjà une base solide (chantier
précédent) mais restait "pas assez visuelle". Reprend explicitement la
recette de `fireballView.ts` (noyau + coque + double halo + éléments
orbitants + traînée + impact) en plus PETIT et recoloré violet/mauve :
- **Coque** (nouvelle) : sphère semi-transparente autour du noyau
  (`SHADOW_PROJECTILE_SHELL_COLOR`), matériau SHARED (jamais cloné, pulse
  par SCALE uniquement — même motif exact que la coque de la Fireball).
- **Couronne** (nouvelle) : sprite `magic_02.png` (motif ornementé réel,
  choisi après inspection visuelle des textures disponibles), orbite en
  rotation de plan + pulse — donne à "l'aura mauve" une vraie identité
  graphique plutôt qu'un simple flou.
- **Stretch directionnel** (nouveau, "impression de vitesse") : sous-groupe
  `coreGroup` (noyau+coque UNIQUEMENT, jamais les sprites — un stretch du
  parent déformerait des sprites toujours face caméra) orienté et étiré
  selon la direction déduite des 2 dernières positions de l'historique
  (le projectile est homing, pas de trajectoire paramétrique disponible).
- `SHADOW_PROJECTILE_SPEED` 10 → 15 (config/constants.ts) — le système de
  vol gère déjà nativement une vitesse qui dépasse la distance restante en
  un seul pas, aucun risque d'instabilité.
- Impact enrichi d'un éclat de couronne en plus du flash/implosion déjà
  existants. Toujours AUCUNE PointLight, toujours atténué automatiquement
  au-delà de 8 projectiles simultanés (crowdFactor, inchangé).
- Performance : mêmes garanties déjà établies (matériaux gabarit clonés une
  fois par instance jamais par frame, géométries de sphère partagées,
  aucun TextureLoader répété — vfxMaterials.ts/vfxTextures.ts inchangés).
- **Vérifié en headless avec un VRAI THREE.js** (shim DOM minimal pour
  `TextureLoader`, script jetable supprimé après usage) : construction,
  5 frames de vol (stretch/traînée exercés), salve de 25 projectiles
  simultanés sans exception, nettoyage correct, impact + cycle complet,
  `clear()` — 7/7 vérifications, aucune exception runtime.

### 2/3. Boutique — coûts Mine/Caserne dynamiques et enfin affichés

**Bug trouvé par audit** : `ui/screens.ts`, le bouton de l'onglet Bâtiments
enregistrait déjà son élément de prix dans `shopUnitPriceEls` (mécanisme
générique déjà utilisé par les unités), mais `refreshShop` ne l'utilisait
**jamais** pour les bâtiments — le prix restait figé à la valeur affichée à
la CONSTRUCTION du bouton (la base, jamais réécrit), et la condition
"assez d'or" comparait aussi la base plutôt qu'un coût effectif.

- `data/mineUpgrade.ts`/`data/barracksUpgrade.ts` : nouveau champ
  `goldCostPerLevel: 5` sur chaque `*UpgradeDef` — même mécanisme déjà
  établi pour la Sentinelle (`data/sentinelUpgrade.ts`).
- `run/mineUpgradeEffects.ts`, `effectiveMineGoldCost` / `run/barracksUpgradeEffects.ts`,
  `effectiveBarracksGoldCost` : `base + niveau × 5`, même patron exact que
  `effectiveSentinelGoldCost` (déjà existant, servi de référence directe).
- **Nouvelle source unique centralisée** (demande explicite : "utilise une
  fonction du type `getEffectiveBuildingCost(buildingId)`") :
  `run/buildingUpgradeEffects.ts`, dispatch générique par id (mine/
  barracks/repli sur `def.cost ?? 0` pour tout autre bâtiment, dont la
  Baliste). Utilisée aux 3 endroits requis : `ui/screens.ts` (`refreshShop`
  réécrit désormais le prix affiché ET la description, qui commence
  maintenant par "Coût : X Gold." comme demandé), `main.ts`
  (`requestPlaceBuilding`, vérification d'or ; `confirmBuildingPlacement`,
  déduction réelle) — jamais deux calculs susceptibles de diverger.
- Vérifié en headless (imports des VRAIS modules + `purchaseUpgrade` réel) :
  les 6 exemples chiffrés exacts donnés par Antoine (Mine 0/3/5 = 100/115/125,
  Caserne 0/3/5 = 50/65/75), indépendance totale entre les deux coûts,
  repli à 0 pour la Baliste. Confirmé aussi en direct (Playwright) : bouton
  "Mine 100"/"Caserne 50" au niveau 0 (base = effectif, cohérent).

### 4. Placement obligatoire de la tour au début d'une run

**Décision d'architecture** (après audit) : je ne fais PAS de la Baliste un
`OwnedBuilding` (aurait changé sa persistance de PV entre vagues, jamais
demandé — "on change SEULEMENT sa manière d'être placée"). Seule sa
**position** devient stockée : `RunState.ballistaPosition: {x,z} | null`
(`null` uniquement pour une run toute neuve). `playerArrowOrigin` (déjà LA
variable "où est la tour actuellement", lue partout : rendu, tir, visée)
reste la source unique — alimentée soit par cette position stockée, soit
(éditeur/"Tester le scénario", sans lien avec une run) par l'ancienne
formule de coin fixe (`computePlayerArrowOrigin`, inchangée, reste le repli).

- `config/mapDef.ts`, `computeBallistaObstacle` change de signature : prend
  désormais un `origin: {x,z}` directement plutôt qu'une `MapDef` dont elle
  dérivait la position par formule — l'appelant (main.ts) décide QUELLE
  origine utiliser.
- Nouvel état dédié `towerPlacementActive` (main.ts) — PAS une réutilisation
  de `buildingPlacementMode` (sémantique incompatible : celui-ci suppose
  soit un ACHAT soit un `OwnedBuilding` déjà existant à déplacer, ni l'un ni
  l'autre ici). `beginTowerPlacement`/`updateTowerPlacementGhost`/
  `confirmTowerPlacement`, mousedown/mousemove dédiés (`canvas`/`window`,
  même patron que le placement de bâtiment). Réutilise `isValidPlacementTile`/
  `buildCellPreview`/`buildingFootprintCells`/`computeBuildingFootprintCorner`
  telles quelles (mêmes règles qu'un bâtiment acheté : zone joueur,
  obstacle/bâtiment/unité). Empreinte `TOWER_PLACEMENT_FOOTPRINT_TILES =
  Math.ceil(BALLISTA_TOWER_FOOTPRINT)` = 3×3 (arrondi au-dessus de la taille
  continue 2.4 utilisée pour la collision fine) — plus stricte que le 2×2
  de la Mine/Caserne, donc une case valide pour un bâtiment ne l'est pas
  forcément pour la tour (confirmé en testant : (800,720), fiable pour Mine/
  Caserne dans les sessions précédentes, est invalide pour la tour à cause
  de cette empreinte plus large).
- **Le VRAI modèle de la tour suit le curseur** (pas un fantôme cloné semi-
  transparent comme pour Mine/Caserne) — la plateforme n'a pas d'équivalent
  dans le catalogue `buildGhost`/`buildObstacleMesh` (rendu séparé, voir
  `render/ballista.ts`), donc `ballistaPlatform`/`ballista` sont directement
  repositionnés à chaque mousemove, à pleine opacité.
- `activeBuildingObstacles()` exclut `ballistaObstacleDef` tant que
  `towerPlacementActive` (sinon la position de REPLI, temporairement encore
  affichée dans cette variable, se bloquerait elle-même sur la carte).
- `rebuildGameBoardVisuals` (agrandissement de map/reset de run) lit
  désormais `currentRun.ballistaPosition ?? computePlayerArrowOrigin(currentMap)`
  au lieu de toujours écraser avec la formule fixe — sans ce correctif, la
  tour aurait "sauté" au coin à chaque étape A/B/C de l'agrandissement de
  map (chantier de la veille).
- Échap pendant le placement obligatoire : ne fait RIEN (nouvelle branche
  explicite dans le switch clavier) — pas d'annulation possible (rien à
  restaurer), pas de progression, conforme à "pas de progression tant que
  la tour n'est pas posée". Clic droit : reste un simple pan de caméra
  (aucune des conditions existantes du handler ne s'applique pendant cette
  phase), comportement déjà propre sans changement nécessaire.
- **Bug réel trouvé et corrigé en testant en direct** : `beginTowerPlacement()`
  n'appelait initialement PAS `screens.hideAll()` — l'écran menu (ou fin de
  vague) restait affiché PAR-DESSUS le canevas 3D et interceptait tous les
  clics, rendant le placement de la tour littéralement impossible à
  valider. `startPlacement()` faisait déjà ça comme sa toute première
  action ; en l'appelant désormais APRÈS la confirmation plutôt qu'AU
  DÉMARRAGE, plus rien ne fermait jamais l'écran actif en entrant dans
  cette nouvelle phase. Corrigé en ajoutant `screens.hideAll()` +
  affichage grille/zones/indicateur de vague dans `beginTowerPlacement()`
  elle-même (jamais trouvé par simple lecture de code — seul un test réel
  dans un navigateur l'a révélé).
- Vérifié en direct (Playwright, dev server réel, plusieurs itérations) :
  bannière "Placez votre tour dans votre zone de spawn." visible dès
  "Jouer" (menu correctement masqué), AUCUN écran de placement normal
  accessible avant confirmation (pas de boutique, pas de bouton "Prêt pour
  la bataille") ; clic hors zone → aucun effet, bannière toujours là ;
  Échap → aucun effet, pas de pause ; **sondage de 10 positions d'écran** →
  exactement celles dont l'empreinte 3×3 tient entièrement dans la zone
  joueur réussissent, les autres échouent proprement (confirme la validité
  ET la non-validité fonctionnent correctement, pas un mécanisme qui
  accepte tout par accident) ; clic valide → bannière masquée, boutique
  auto-ouverte, flow normal (Vague 1, or, "Prêt pour la bataille") pleinement
  fonctionnel, tour visible avec sa barre de PV à la position choisie par
  le clic (capture d'écran confirmée, plus jamais le coin fixe). Zéro
  erreur console à aucune étape. Build/typecheck propres.

**Non vérifiable de mon côté** : ressenti du geste de placement à la souris
(le VRAI modèle qui suit le curseur plutôt qu'un fantôme translucide — choix
délibéré, à confirmer que c'est bien lisible), confort de l'empreinte 3×3
(peut sembler exigeante comparée aux bâtiments 2×2 dans une zone de spawn
encore petite en tout début de run) — à ajuster si Antoine la trouve trop
stricte une fois testée en jeu réel.

## Problèmes connus à traiter

- Le plateau a grandi plusieurs fois (14×18 → 18×26) et la zone de placement
  aussi (3 → 7 rangées par camp) ; la marche avant le premier contact
  s'allonge d'autant si les joueurs placent leurs unités au fond de leur
  zone. À surveiller une fois la flèche en place et le jeu testé en
  conditions réelles.
- ~~Séparation en O(n²)~~ — RÉSOLU (2026-08-10), voir "Grille spatiale pour
  la séparation" ci-dessous. La collision avec les obstacles reste en
  O(unités × obstacles), toujours pas un problème tant qu'il y a une
  poignée d'obstacles.
**Ciblage O(n²) — RÉSOLU (2026-08-11)**, voir "Grille spatiale pour le
ciblage" plus bas. Ancienne note (gardée pour l'historique) : ce système
scannait tout le pool d'unités vivantes des DEUX camps pour chaque entité —
même famille de problème que la séparation, repéré en creusant ce sujet mais
pas corrigé sur le moment faute d'urgence mesurée.

**Grille spatiale pour la séparation — FAIT** (2026-08-10, chantier
performance mené pendant qu'Antoine réfléchissait à la suite du système de
talents). `sim/spatialGrid.ts` (nouveau) : `SpatialGrid<T>` générique,
bucketing par cellule reconstruit à chaque appel (les positions bougent à
chaque sous-passe, pas la peine d'être incrémental). `sim/systems/movement.ts` :
la boucle O(n²) d'origine (`applySeparationDirect`) est conservée TELLE
QUELLE pour les petits effectifs — `SEPARATION_GRID_THRESHOLD = 120`,
calibré par mesure headless (le point de croisement réel se situe entre 120
et 150 entités ; en dessous, la grille est nettement PLUS LENTE que la
boucle directe à cause du coût d'allocation des buckets, ex. n=50 environ
3.5× plus lente — chiffre contre-intuitif, l'instinct "une grille est
toujours plus rapide" est faux pour de petits effectifs). Au-dessus du
seuil, `applySeparationGrid` ne teste que les paires dans le voisinage 3×3
de cellules (taille de cellule = 2× le plus grand rayon d'unité vivante,
recalculée une fois par tick — garantit qu'aucune paire réellement en
interaction ne peut être manquée). **Équivalence EXACTE avec l'algorithme
d'origine, pas seulement "un résultat correct différent"** : le voisinage de
chaque entité est trié par index croissant avant d'appliquer les paires,
pour reproduire très précisément le même ORDRE de traitement que la boucle
`for i, for j=i+1` d'origine — sans ce tri, le résultat serait resté
déterministe mais aurait légèrement divergé numériquement (l'ordre de
traitement des paires affecte la trajectoire exacte, chaque paire mutant
l'état lu par la suivante). Vérifié en headless (script temporaire,
supprimé après usage, fonctions du module temporairement exportées le temps
du test puis re-privatisées) : résultat bit-à-bit identique entre les deux
implémentations sur 5 tailles de population (5 à 150) × 3 graines
différentes × 5 passes successives ; mesure de performance confirmant le
gain (n=150 : grille ~22% plus rapide ; n=300 : grille ~2.6× plus rapide).
Le ciblage avait le même profil O(n²) à l'époque, pas touché dans ce
chantier — voir "Grille spatiale pour le ciblage" plus bas, résolu le
lendemain.

**Grille spatiale pour le ciblage — FAIT** (2026-08-11, demande d'Antoine :
"je te laisse avancer sur ce que tu juges utile pour la progression des
différents chantiers" — repris directement le point resté ouvert ci-dessus,
d'autant plus pertinent depuis le nerf des vagues 5/6 qui a fait grimper le
saut relatif vers la vague 7 (112 ennemis) à ×4 au lieu de ×2).
`sim/systems/targeting.ts` : deux changements distincts. (1) Le pool
candidat est désormais séparé par CAMP une fois en tête de fonction
(`playerAlive`/`enemyAlive`) au lieu de scanner tout `alive` (les deux camps
mélangés) pour chaque entité — l'ancien code gaspillait déjà la moitié du
travail sur des entités systématiquement rejetées par le filtre d'équipe
interne à `findAttackableEnemy`/`findNearestEnemy`. Ce changement à lui seul
s'applique à TOUTES les tailles de population, gain gratuit. (2) Au-delà de
`TARGETING_GRID_THRESHOLD = 120` (même valeur que `SEPARATION_GRID_THRESHOLD`
par défaut, PAS re-mesurée spécifiquement pour ce système — le profil
d'appel diffère légèrement, une seule passe par tick contre 5 pour la
séparation, donc le vrai point de croisement pourrait différer un peu),
deux `SpatialGrid<Entity>` (une par camp) remplacent le balayage direct :
chaque entité ne consulte plus que le voisinage 3×3 de cellules du camp
OPPOSÉ. Taille de cellule = la plus grande `aggroRange` de tout le pool
vivant (pas un rayon d'unité comme la séparation — le ciblage teste des
PORTÉES très variables par unité, pas des corps physiques de taille
quasi-uniforme), recalculée une fois par tick.
Contrairement à la séparation, PAS de tri par index pour garantir une
équivalence bit-à-bit : le ciblage est une sélection "meilleur candidat par
distance" (max/min), pas une chaîne de mutations où l'ordre de traitement
affecte le résultat — un ordre de parcours différent ne peut changer le
résultat qu'en cas d'égalité EXACTE de distance entre deux candidats
différents, un cas quasi impossible en flottant sur des positions réelles.
Vérifié en headless (script temporaire, supprimé après usage) : en dessous
du seuil, `targetId` identique à l'ancien algorithme sur 20 ticks (40
entités, positions mouvantes) ; au-dessus du seuil (150 entités, 10 ticks,
positions aléatoires à chaque tick), **0 divergence** entre la grille et le
balayage complet sur l'ensemble des décisions de ciblage ; performance sur
220 entités (échelle vague 7) : 30 appels (~1s de jeu simulé) en 16,2ms,
largement sous le budget d'un tick à 30 Hz. Build propre.
- Stats de l'archer choisies par raisonnement (voir tableau de conception
  dans l'historique), jamais testées en conditions réelles de jeu — à
  rééquilibrer après le premier vrai test de plaisir.
- **Pas de dépôt Git.** Aucun historique de versions, aucun point de
  restauration. À initialiser dès qu'Antoine est d'accord — proposé, pas
  encore fait.
- **Rochers/arbres en `.glb` (Kenney Nature Kit) pas encore validés
  visuellement.** Claude n'a pas d'accès visuel au rendu : l'intégration
  (chargement, mise à l'échelle sans distorsion, composition horizontale)
  est faite et compile, mais seul Antoine peut confirmer dans le navigateur
  que le résultat correspond enfin à l'image de référence.
- **Nouvelle baliste (modèle Blockbench, voir "Où on en est") pas encore
  validée visuellement**, ni sa taille ni son orientation (axe de tir supposé
  -Z, pas vérifié). Charge et compile (confirmé : `OBJLoader` sert bien les
  fichiers depuis `public/models/ballista/`, testé en requêtant le serveur de
  dev directement), mais seul un test dans le navigateur dira si l'échelle et
  le sens de tir sont corrects.
