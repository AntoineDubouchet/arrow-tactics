# Arrow Tactics — v0.1 (socle)

Titre de travail. Roguelite tactique en vue 3/4, auto-bataille + flèche du joueur.

## Lancer

```bash
npm install
npm run dev
```

Puis `npm run build` pour vérifier que tout compile avant chaque commit.

## Ce qu'il y a dans cette version

Le socle uniquement : caméra orthographique, plateau quadrillé, zones de
placement, boucle à pas de temps fixe, et deux lignes de quatre fantassins qui
avancent l'une vers l'autre et s'immobilisent au contact.

Il n'y a **pas encore** de combat, de PV visibles, de flèche, ni d'or. C'est
volontaire : cette étape sert à valider l'angle de caméra et la lisibilité.

## Commandes

| Touche | Effet |
| --- | --- |
| ← → | Pivoter la caméra |
| ↑ ↓ | Incliner la caméra |
| A / E | Zoom |
| R | Réinitialiser la caméra |
| Espace | Pause |
| X | Vitesse ×2 |
| Entrée | Relancer la scène de test |

## Ce qu'il faut regarder

1. **L'angle de caméra.** Le défaut est une vue de face à 50° : le plateau se lit
   comme un rectangle, façon League of Legends. Pivote jusqu'à 45° pour comparer
   avec l'isométrique classique en losange. Note les valeurs affichées en haut à
   gauche quand tu trouves ce qui te plaît.
2. **La lisibilité du contact.** Est-ce qu'on voit clairement où se forme la ligne
   de front ?
3. **La taille des unités.** Trop grosses, trop petites, trop espacées ?

## Architecture

```
src/
  config/   constantes de réglage — aucun nombre magique ailleurs
  core/     boucle à pas fixe, maths 2D
  data/     définitions d'unités (données pures, zéro logique)
  sim/      simulation — n'importe JAMAIS Three.js
  render/   caméra, plateau, vues d'unités
  ui/       overlays HTML par-dessus le canvas
```

La règle qui tient tout : `sim/` ne connaît pas l'écran, `render/` ne décide
rien. La simulation avance par pas de 1/30 s, le rendu interpole entre deux pas.
C'est ce qui nous donnera plus tard la pause propre, la vitesse ×2, et la
possibilité de simuler des milliers de combats sans affichage pour équilibrer.

## Prochaine étape

Ciblage, attaque, PV, miss, mort. C'est là que le jeu commence à exister.
