# Textures de sol exploratoires

`generate.mjs` produit le lot de 10 textures de cases comparées en jeu
(`src/render/groundSurfaces.ts`). Génération procédurale en Node, sans
dépendance : graine fixe par texture, aucun `Math.random`. Deux exécutions
produisent les mêmes fichiers. Toutes les textures sont raccordables : le
bruit est périodique et les traits bouclent sur les bords.

```bash
node tools/ground-textures/generate.mjs                    # depuis arrow-tactics/
node tools/ground-textures/generate.mjs --sheet planche.png # + planche 2 × 2 de chaque texture
```

Le script affiche pour chaque texture un indice de raccord : l'écart moyen
entre la dernière et la première colonne ou ligne, divisé par l'écart entre
deux colonnes voisines au milieu. Une valeur proche de 1 signifie qu'on ne
voit pas la jointure.

| Fichier (`public/textures/ground/variants/`) | Famille | Taille | Cases par cycle |
|---|---|---|---|
| `herbe-classique.png` | Herbe propre | 256 | 2 |
| `herbe-prairie.png` | Herbe claire | 256 | 2 |
| `herbe-dense.png` | Herbe dense / sauvage (touffes) | 256 | 2 |
| `herbe-stylisee.png` | Herbe stylisée (aplats, touffes en V) | 256 | 2 |
| `herbe-pixel-net.png` | Herbe pixelisée, blocs (16 texels par case) | 32 | 2 |
| `herbe-pixel-touffes.png` | Herbe pixelisée, touffes (32 texels par case) | 64 | 2 |
| `terre-battue.png` | Terre nue, cailloux | 256 | 2 |
| `terre-strates.png` | Terre de flanc, strates horizontales | 256 | 2 |
| `mixte-taches.png` | Herbe et taches de terre (≈ 15 %) | 512 | 4 |
| `mixte-usee.png` | Herbe usée (≈ 45 % de terre) | 512 | 4 |

`terre-strates` est dessinée pour les flancs, dont les UV suivent le bord et la
hauteur. Les strates y sont horizontales ; sur un dessus de case, elles
deviendraient des rayures.

Le nombre de cases par cycle est déclaré dans `GROUND_TEXTURES`
(`src/config/groundSurfaces.ts`), avec l'identifiant, les libellés de
l'éditeur et la famille de chaque texture. Le filtrage au plus proche des
textures pixelisées y est aussi déclaré (`nearest`).
