# Arrow Tactics — guide pour Claude Code

Guide opérationnel pour travailler dans ce dépôt. Il ne décrit pas le jeu en
détail : pour cela, voir les documents de `docs/`.

## 1. Le projet en bref

Arrow Tactics est un roguelite tactique de survie à vagues, en Three.js,
TypeScript et Vite. Les batailles se jouent automatiquement, et le joueur
intervient directement (Baliste, sorts).

**Collaboration**

- Répondre en français.
- Quand une commande Git ou npm est nécessaire, fournir la commande exacte et
  expliquer brièvement son rôle.
- Sur une question de design, donner un avis argumenté. Signaler quand une
  idée risque de rendre le jeu moins amusant.
- Ne pas trancher seul une décision ouverte : la présenter, recommander, puis
  laisser Antoine décider.

## 2. Où trouver la vérité

| Question | Source |
|---|---|
| Que fait le jeu aujourd'hui ? | Code + `docs/CURRENT_STATE.md` |
| Comment le code est-il organisé ? | Code + `docs/ARCHITECTURE.md` |
| Quelle expérience recherche-t-on ? | `docs/GAME_DESIGN.md` |
| Pourquoi telle décision, et est-elle toujours valable ? | `docs/DESIGN_DECISIONS.md` |
| Bugs, dettes, hypothèses | `docs/KNOWN_ISSUES.md` |
| Travaux futurs | `docs/ROADMAP.md` |
| Éditeur de maps | `docs/EDITOR.md` |
| Assets visuels (import, rigs, licences) | `docs/ASSETS.md` |

- **Le code fait foi** pour ce que le programme fait réellement.
- Si le code contredit une documentation factuelle, **signaler l'écart**. Ne
  corriger en silence ni la documentation ni le comportement.
- `docs/archive/CLAUDE_LEGACY_2026.md` est **uniquement historique**. Il peut
  aider à comprendre une origine, mais ne suffit jamais à établir une règle
  actuelle : toute information qu'on en tire doit être revalidée dans le code
  ou dans les documents ci-dessus.

## 3. Organisation du dépôt

```
<racine Git>/
  CLAUDE.md
  docs/               documentation (et docs/archive/)
  .claude/
  arrow-tactics/      projet npm
    package.json
    index.html
    src/
    public/           modèles, textures (copiés tels quels dans dist/)
```

- Les commandes **Git** se lancent depuis la racine Git.
- Les commandes **npm** se lancent depuis `arrow-tactics/`.

Dossiers de `arrow-tactics/src/` :

| Dossier | Rôle |
|---|---|
| `config/` | Constantes, format des cartes (`MapDef`) |
| `core/` | Boucle à pas fixe, maths, RNG à graine |
| `data/` | Définitions pures : unités, objets, talents, bâtiments, améliorations |
| `sim/` | Simulation du combat (aucun rendu) |
| `run/` | État de run, méta-progression, sauvegarde, calcul des effets |
| `render/` | Three.js : plateau, unités, effets, caméra |
| `ui/` | Interface HTML/CSS par-dessus le canvas |
| `editor/` | Éditeur de maps |
| `audio/` | Moteur audio (actuellement déconnecté) |
| `main.ts` | Point d'entrée, orchestration des couches |

Détails et dépendances autorisées : `docs/ARCHITECTURE.md`.

## 4. Commandes

Depuis `arrow-tactics/` :

```bash
npm run dev       # serveur de développement Vite
npm run build     # tsc --noEmit puis vite build : vérification de référence
npm run preview   # sert le build localement (facultatif)
```

**Il n'existe actuellement aucun script `test`** ni suite de tests
automatisée. Ne jamais affirmer avoir « lancé les tests ». Indiquer
précisément ce qui a été vérifié : build, script ponctuel, vérification
manuelle ou rien.

Depuis la racine Git :

```bash
git status              # état du dépôt
git diff                # changements non indexés
git diff --check        # espaces en fin de ligne et conflits oubliés
git diff --cached       # changements indexés, avant commit
git branch --show-current
```

La branche de travail n'est pas fixée : la vérifier quand c'est utile.

## 5. Invariants architecturaux

Ces règles protègent la testabilité et le déterminisme. Ne pas les
contourner sans en discuter d'abord.

- **`sim/` est isolé.** Il n'importe jamais `three`, `render/`, `ui/`,
  `editor/`, `audio/` ni `run/`. Il n'accède ni au DOM ni à `localStorage`. Il
  peut importer `config/`, `core/` et `data/`.
- **`sim/` reçoit des paramètres de gameplay déjà résolus.** Il ne dépend pas
  directement des talents, des améliorations, de la méta-progression, de l'UI
  ou du rendu. L'endroit où ces paramètres sont calculés peut évoluer ; la
  règle, c'est que la simulation ne sache pas d'où ils viennent.
- **Déterminisme.** Le hasard de la simulation passe par la RNG du `World`,
  jamais par `Math.random`. Le hasard purement cosmétique, côté rendu, peut
  utiliser `Math.random`.
- **Pas fixe.** La simulation avance par pas fixes (`core/loop.ts`) et le
  rendu interpole. Pas de temps réel, de `Date.now` ni de `setTimeout` dans la
  logique de simulation.
- **Dégâts centralisés.** Tout dégât passe par `applyDamageToEntity`
  (`sim/damage.ts`). Pas de soustraction de PV dispersée.
- **Données séparées de la logique.** Une nouvelle unité, un objet ou un
  talent commence par une entrée dans `data/`.
- **`main.ts` orchestre.** Son rôle central ne justifie pas de créer des
  dépendances inverses entre couches.
- **Conventions de rendu des assets** (clonage des rigs, correction
  d'orientation, matériaux) : voir `docs/ASSETS.md` avant tout import ou
  toute modification d'un modèle.

## 6. Façon de travailler

1. Comprendre la demande ; poser une question si un choix appartient à
   Antoine.
2. Lire le code concerné et le document pertinent (§2).
3. Distinguer un **bug confirmé**, une **hypothèse** et une **décision de
   design**.
4. Pour toute modification non triviale, **proposer un plan avant de
   modifier**.
5. Modifier le minimum nécessaire. Pas de refactor opportuniste ni de
   nettoyage non demandé.
6. Lancer les vérifications adaptées (§7).
7. Montrer les fichiers modifiés et le diff.
8. **Ne jamais commiter sans demande explicite.**

## 7. Vérifier et commiter

- **Modification TypeScript** : `npm run build` doit passer.
- **Tâche uniquement documentaire** : pas de build nécessaire.
- **Effet visuel ou ressenti** : s'il n'a pas été observé, le dire
  explicitement plutôt que le présenter comme vérifié.
- **Avant un commit demandé** :
  - lancer `git diff --check` ;
  - n'indexer que les fichiers concernés ;
  - relire `git diff --cached`.
- **Messages de commit** : courts, avec le préfixe de l'historique (`feat:`,
  `fix:`, `docs:`…).
- Ne pas changer de branche, réécrire l'historique ni pousser sans demande.

## 8. Discipline de game design

- `CURRENT_STATE.md` décrit ce qui existe, `GAME_DESIGN.md` ce qui est
  recherché, `ROADMAP.md` ce qui pourrait être développé, et
  `DESIGN_DECISIONS.md` les décisions et leur statut.
- Ne pas prendre une ancienne valeur ou intention de l'archive pour une
  décision actuelle.
- Ne pas trancher seul une question marquée **Ouverte**.
- Ne pas réintroduire automatiquement une fonctionnalité retirée (par
  exemple le Cavalier ; voir `DESIGN_DECISIONS.md`).
- Une modification qui change l'équilibrage ou le ressenti du jeu se
  signale comme telle, même quand elle est demandée.
- Pour juger une nouvelle idée : grille de `GAME_DESIGN.md` §13.

## 9. Éditeur et assets

- Comportement, contrôles et limites de l'éditeur de maps : `docs/EDITOR.md`.
- Provenance, droits, formats, chargement et pièges d'import des assets :
  `docs/ASSETS.md`.

## 10. Points chauds

- `main.ts` et `ui/screens.ts` sont très volumineux : les modifier
  localement et éviter toute refonte non demandée.
- Autres zones sensibles : `docs/ARCHITECTURE.md` §15 et
  `docs/KNOWN_ISSUES.md`.
