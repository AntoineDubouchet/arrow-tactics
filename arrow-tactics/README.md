# Arrow Tactics

Arrow Tactics est un prototype de roguelite tactique de survie à vagues. Le
joueur y construit son armée, puis intervient directement dans la bataille
avec sa Baliste et ses sorts.

Il est développé avec **Three.js**, **TypeScript** et **Vite**.

**Statut** : prototype en développement actif. Le jeu évolue encore beaucoup,
et aucune version n'a été publiée.

## Organisation du dépôt

Le projet npm se trouve dans ce dossier, `arrow-tactics/`. La documentation du
projet est rangée un niveau au-dessus, dans `../docs/`.

Toutes les commandes npm ci-dessous se lancent depuis `arrow-tactics/`.

## Prérequis

- **Node.js** avec **npm**. La version de Vite utilisée actuellement demande
  Node.js 20.19 ou plus récent, ou 22.12 ou plus récent. Cette exigence suivra
  les mises à jour des outils.
- **Git**, seulement pour cloner le dépôt.

## Installation et lancement

```bash
npm install       # installe les dépendances (à faire une première fois)
npm run dev       # lance le serveur de développement ; l'adresse s'affiche dans le terminal
```

## Vérification

```bash
npm run build     # vérifie les types (tsc --noEmit) puis construit le jeu dans dist/
npm run preview   # facultatif : sert localement le résultat du build
```

Il n'existe actuellement **aucun script de tests automatisés**. `npm run build`
est la seule vérification automatique.

## Structure

```
arrow-tactics/
  index.html      page d'entrée
  src/            code du jeu (simulation, rendu, interface, éditeur de maps)
  public/         modèles 3D et textures, copiés tels quels dans le build
```

## Documentation

- [État actuel du jeu](../docs/CURRENT_STATE.md)
- [Game design : vision et principes](../docs/GAME_DESIGN.md)
- [Architecture du code](../docs/ARCHITECTURE.md)
- [Roadmap](../docs/ROADMAP.md)
- [Problèmes connus](../docs/KNOWN_ISSUES.md)
- [Éditeur de maps](../docs/EDITOR.md)
- [Assets : provenance, droits, conventions](../docs/ASSETS.md)
- [Décisions de design et leur statut](../docs/DESIGN_DECISIONS.md)
