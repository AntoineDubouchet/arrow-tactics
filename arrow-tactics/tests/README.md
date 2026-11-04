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

`tests/sim/` : `camp.mts`, `camps-authored.mts`, `cargo.mts`,
`collecte.mts`, `depart-camp.mts`, `file-prod.mts`, `heros-niveaux.mts`,
`mana-soin.mts`, `palissade.mts`, `porte-alliee.mts`, `tourbillon.mts`,
`vitesse.mts`, et `modernisation.mts` (contrats de la passe : file payée
et ralliement, Forge seul site d'améliorations, talents retirés
remboursés et actifs appliqués, défaite = Baliste, cargo inchangé).

`tests/game/` : `baliste-reparation.cjs`, `camp-boucle.cjs`,
`cargo-jeu.cjs`, `depart-jeu.cjs`, `editeur-procedural.cjs`,
`equipement-jeu.cjs`, `inventaire.cjs`, `villageois-jeu.cjs`, et
`forge-jeu.cjs` (chantier de Forge, écran Forge en jeu, achat Baliste,
Sanctuaire sans parchemins) et `defaite-jeu.cjs` (Héros mort → la run
continue ; Baliste détruite → « Partie terminée », retour au menu).
`lib.cjs` est la bibliothèque commune (lancement, ouverture de la Survie,
caméra, captures).
