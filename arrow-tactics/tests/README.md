# Tests d'Arrow Tactics

Petite suite de vérification, reprise des scripts des passes précédentes et
mise dans le dépôt le 2026-11-04 (passe de modernisation 1,
`docs/DESIGN_DECISIONS.md` G40). Ce n'est pas une couverture complète :
chaque script fixe un contrat observable (démarrage, production, talents,
Forge, défaite, cargo, camps, murs, générateur) et échoue si ce contrat
change.

Toutes les commandes se lancent depuis `arrow-tactics/`.

| Commande | Contenu | Durée indicative |
|---|---|---|
| `npm run test:sim` | `tests/sim/*.mts` : Node seul, sans navigateur ni Vite | environ 80 s |
| `npm run test:game` | `tests/game/*.cjs` : Playwright + Edge, Vite dédié | plusieurs minutes |
| `npm test` | les deux, dans cet ordre | |

Un seul script : `node tests/run-sim.mjs modernisation` ou
`node tests/run-game.mjs forge` (filtre sur le nom de fichier ; plusieurs
mots possibles).

## Prérequis

- **Node 24 ou plus** : les scripts `.mts` importent directement les
  sources TypeScript (`src/sim`, `src/run`, `src/data`, `src/config`) grâce
  à la suppression native des types (`tests/ts-register.mjs`,
  `tests/ts-hooks.mjs`).
- **Microsoft Edge** installé (les tests en jeu utilisent Playwright avec
  `channel: 'msedge'` ; aucun navigateur Playwright n'est téléchargé).
- Le port **5177** libre (ou `TEST_VITE_PORT=…`). Avec un serveur de
  développement déjà lancé, `VITE_BASE=http://localhost:5174/ npm run
  test:game` réutilise ce serveur et n'en démarre aucun.

## Règles

- Un test **échoue** si son processus sort en erreur ou si sa sortie
  contient « ECHEC ». Chaque vérification imprime `OK` ou `ECHEC` avec son
  libellé et, en cas d'échec, les valeurs observées.
- Les captures d'écran vont dans `tests/game/out/` (ignoré par Git).
- Les scripts en jeu lisent `window.__world`, `window.arrowEconomy`,
  `window.__R` et `window.__S`, exposés par `main.ts` en développement.
- Ne pas réécrire une attente de test pour la faire passer : si le contrat
  change volontairement (équilibrage, règle), le dire dans le rapport et
  dans `docs/`.

## Scripts

`tests/sim/` : `camp.mts`, `camps-authored.mts`, `cargo.mts`, `couts.mts`,
`loot-bank.mts` (G46 : banque de 18 items, 2 par emplacement, stats
déterministes par niveau, orientations, tables de butin, éditeur d'items),
`degats-types.mts` (G46 : physique / magique par source, bonus
d'équipement physique et magique séparés), `recompense.mts` (G46 :
récompense de vague, file, inventaire plein, niveaux)
(G45 : échelle des coûts, débit exact, refus sans ressources), `economie.mts`
(G44 : mesure légère sur le camp de départ, temps à la source, cycle,
rendement, Héros plus lent, répartition à 3 Villageois),
`collecte.mts`, `depart-camp.mts`, `file-prod.mts`, `heros-niveaux.mts`,
`mana-soin.mts`, `palissade.mts`, `porte-alliee.mts`, `tourbillon.mts`,
`vitesse.mts`, `modernisation.mts` (contrats de la passe 1 : file payée
et ralliement, talents retirés remboursés et actifs appliqués, défaite =
Baliste, cargo inchangé ; mis à jour par la passe 2) et
`technologies.mts` (passe 2, 2026-11-05 : technologies de la Forge,
niveaux de producteurs rétroactifs, Caserne, Baliste depuis sa fiche,
file unique, annulation, destruction pendant une recherche, deux Forges,
Héros et Villageois exclus), `villageois-autonomie.mts` (G42 : travail
autonome après 1 s, ressource la moins travaillée, ordre manuel
prioritaire, aucune source, source épuisée, cycle, déterminisme ; G43 :
sources visibles seulement, portée au contact, quantités 75 / 250 / 250,
décompte, épuisement, tas inchangés) et
`or-butin.mts` (G42 : or de butin ramassé au contact du Héros, jamais par
un Villageois, or extrait = cargo), `acquisition.mts` (G47 : auto-équipement,
sac, non portable, sac plein, échange, ramassage, icônes) et
`effets-arme.mts` (G47 : N, K, six écoles, bonus magique, compteurs, rate et
esquive, Tourbillon, migration et export de l'Éditeur d'items). `file-prod.mts`
couvre aussi la progression affichée (G47). G48 : `placement-libre.mts` (pose à
coordonnées flottantes, marge, rotation, refus, rasterisation, passages large et étroit,
tous les bâtiments standards), `auto-construction.mts` (enchaînement, portée, égalité,
inaccessible, ordre manuel, plusieurs constructeurs, grappe serrée, événement de mort)
et `camp-portes.mts` (4 portes, graines 1, 42, 12345, 99999 : angles, axes, sortie par
chacune, porte fermée, ennemi, or proche, camps). G49 : `navigation-boucle.mts` (palissade
entre des bâtiments, point verrouillé, 40 cas tirés dans le vrai camp, route perdue, watchdog
cas A à E, foule, charge et limite d'A*). G50 : `farm-stands.mts` (emplacements, 4 sur un arbre,
8 sur un gisement, surplus manuel et autonome, libération, retour du dépôt, Héros, charge à 20,
déterminisme) et `noyau-depart.mts` (noyau dans les 4 rotations, Hôtel de ville, aire libre, or
visible, trajets autour du noyau, Maison +5, A Z E R structurels, tas / 2 sans toucher au reste).

`tests/game/` : `baliste-reparation.cjs`, `camp-boucle.cjs`,
`cargo-jeu.cjs`, `depart-jeu.cjs`, `editeur-procedural.cjs`,
`equipement-jeu.cjs`, `inventaire.cjs`, `villageois-jeu.cjs`, et
`forge-jeu.cjs` (passe 2 : chantier de Forge, recherche depuis la fiche
sans écran modal, simulation en marche, Archer présent amélioré, Baliste et
Camp d'archerie depuis leurs fiches), `defaite-jeu.cjs` (Héros mort →
la run continue ; Baliste détruite → « Partie terminée », retour au menu),
`porte-jeu.cjs` (G42 : structure de la porte refaite, ouverture /
fermeture, captures extérieur / intérieur / ouverte / trois-quarts) et
`tourbillon-jeu.cjs` (G42 : flash de dégâts par cible à chaque tic,
lancement pendant un déplacement), `construction-jeu.cjs` (G46 : Villageois
constructeur, Maj + pose répétée, double-clic sur les bâtiments du même
type visibles), `recompense-jeu.cjs` (G46 : panneau de récompense de vague,
choix, sac plein, file) et `recolte-jeu.cjs` (G43 : récolte au
contact depuis plusieurs côtés, Villageois face à sa source, clips
`workingA` / `workingB`, outils, cadence, captures hache / pioche pierre /
pioche or), `ergonomie-jeu.cjs` (G47 : sélection et désélection du Héros, HUD,
ralliement au clic droit, simple et groupé, barres de file, clic droit
d'inventaire, capture des icônes) et `item-editeur.cjs` (G47 : effets
déclenchés dans la vraie interface, aller-retour strict, migration du feu),
`placement-jeu.cjs` (G48 : fantôme continu, R, Maison 3,27 / 8,63 à 15°, Maj, Villageois,
double-clic, ralliement et production d'un bâtiment tourné, captures) et
`mort-heros-jeu.cjs` (G48 : effet à la position, montée, durée, unicité, partie qui
continue, capture au milieu), `navigation-jeu.cjs` (G49 : Paladin et palissade entre deux
Maisons posées au menu, A* et image la plus longue mesurés, chantier enfermé, destination
impossible, message unique), `noyau-jeu.cjs` (G50 : base complète en image, Hôtel de ville, Pop.
2 / 15, Maison détruite, A Z E R au clavier, champ texte, unité 4, R en placement, fiche du Héros,
six Villageois autour d'un arbre au clic droit, surplus et message), `townhall-face-jeu.cjs` (biais de 27° de
l'Hôtel de ville, 4 rotations du camp, normale lue sur le modèle ; cadrage 28, Espace, R, captures),
`baliste-portee-jeu.cjs` (Baliste en AUTO, ennemi touché devant chacune des 4 portes, 2 rotations),
`overlay-profondeur-jeu.cjs` (repères prioritaires rendus après la passe du brouillard : matériaux
depth-aware, anneau du Héros masqué derrière l'Hôtel de ville, intact devant, captures),
`mist-clouds-fog-jeu.cjs` (Mist Clouds pilotées par la grille du brouillard de guerre : couverture
des nappes lue dans la cible demi-résolution, faible en zone visible, forte en zone explorée hors
vision comme en zone inexplorée ; un Villageois ou un Fantassin téléporté dans une zone explorée la
dégage puis la brume revient ; captures),
`selection-flash-jeu.cjs` (flash de sélection : l'anneau d'une unité cliquée, ou d'un bâtiment
inspecté, gonfle puis revient en ~240 ms ; aucun pulse tant que la sélection est seulement
maintenue ; échelle échantillonnée image par image, aucun pixel).
`camp-boucle.cjs` a 3 vérifications en échec, antérieures à G47 (KI-72).
`lib.cjs` est la bibliothèque commune (lancement, ouverture de la Survie,
caméra, captures).
