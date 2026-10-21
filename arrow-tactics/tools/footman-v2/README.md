# Outils Footman V2

Ces scripts produisent les assets légers du Fantassin V2, chargés par le jeu
(`src/render/fantassinV2Rig.ts`), à partir des exports Meshy bruts. Les
exports Meshy pèsent environ 620 Mo (FBX avec textures 4K embarquées, une
copie complète du personnage dans chaque animation) ; les assets produits
pèsent environ 58 Mo.

| Script | Rôle |
|---|---|
| `build-models.mjs` | GLB sans textures (personnages bleu et rouge, épée, boucliers) et clips d'animation JSON prêts pour le jeu |
| `build-textures.cjs` | Textures 4096 → 2048 (base color, normal, metallic, roughness) |
| `verify-models.mjs` | Compare les assets produits aux exports Meshy : os, sommets, skin, clips, équipements |
| `footman-config.mjs` | Chemins par défaut, arguments, liste des fichiers Meshy attendus |
| `meshy.mjs` | Lecture des FBX dans Node, préparation des clips |

## Ce que font les scripts

- **Modèles** : le personnage est exporté avec son squelette, sa hiérarchie et
  sa skin, sans aucune texture ni matériau utile (le jeu reconstruit les
  matériaux depuis les PNG). Les équipements sont exportés avec leur géométrie
  déjà normalisée (échelle 100 et rotation −90° X du FBX appliquées).
- **Clips** : seules les animations sont extraites des FBX `_withSkin`. Les
  pistes `mixamorig*` sont renommées en `smartrig*` (noms d'os du Character),
  celles sans cible sont retirées (racine d'armature, Icosphere parasite, os
  `_end`), et le Left Slash est découpé de 0,45 à 1,65 s. Le jeu les charge
  tels quels.
- **Textures** : redimensionnement par le navigateur via Playwright, sur les
  valeurs brutes (sans conversion de couleur ni prémultiplication), puis
  réencodage PNG avec le même type que la source (niveaux de gris ou RVB).
  Les espaces de couleur restent ceux du jeu : base color en sRGB, les autres
  cartes en linéaire.

La génération est déterministe : deux exécutions produisent les mêmes fichiers.

## Sources Meshy attendues

Par défaut dans `arrow-tactics/.source-assets/footman_v2/`, dossier local
ignoré par Git (les exports sont trop lourds pour être versionnés) :

```
.source-assets/footman_v2/
  Meshy_AI_footman_blue/
    Meshy_AI_footman_blue_3d_biped_Character_output.fbx
    Meshy_AI_footman_blue_3d_biped_Animation_Walking_withSkin.fbx
    Meshy_AI_footman_blue_3d_biped_Animation_Left_Slash_withSkin.fbx
    Meshy_AI_footman_blue_3d_biped_Animation_Spartan_Kick_withSkin.fbx
    Meshy_AI_footman_blue_3d_biped_texture_0.png            (+ _normal, _metallic, _roughness)
  Meshy_AI_footman_red/
    Meshy_AI_footman_red_remesh_3k_biped_Character_output.fbx
    Meshy_AI_footman_red_remesh_3k_biped_Animation_*_withSkin.fbx   (mêmes trois clips)
    Meshy_AI_footman_red_remesh_3k_biped_texture_0.png      (+ _metallic, _roughness ; pas de normal map)
  Meshy_AI_footman_sword_cartoon_fbx/        (FBX + PNG : base, _normal, _metallic, _roughness)
  Meshy_AI_footman_shield_blue_fbx/          (idem)
  Meshy_AI_footman_shield_red_fbx/           (idem)
```

Les noms exacts sont dans `footman-config.mjs`. Chaque animation doit être
exportée **depuis le modèle de son camp** : les rigs bleu et rouge sont
différents, un clip bleu ne s'applique pas au rouge.

## Générer les assets du jeu

Depuis `arrow-tactics/` :

```bash
node tools/footman-v2/build-models.mjs
node tools/footman-v2/build-textures.cjs
```

Sortie par défaut : `public/assets/units/footman_v2/`. Options :

- `--source <dossier>` : exports Meshy (défaut `.source-assets/footman_v2`) ;
- `--out <dossier>` : dossier de sortie (défaut `public/assets/units/footman_v2`) ;
- `--channel <canal>` : navigateur Playwright pour les textures (défaut
  `msedge` ; par exemple `chrome`).

Les chemins relatifs partent du dossier courant. Pour comparer sans toucher
au jeu, générer dans un autre dossier avec `--out`.

## Vérifier

```bash
node tools/footman-v2/verify-models.mjs
```

Le script recharge les GLB et les clips produits et les compare au chemin
FBX d'origine : noms et parents des os, nombre de sommets, absence de texture
embarquée, emprise (pieds au sol), sommets déformés au repos et sur onze
instants de chaque clip, géométrie et UV des équipements. Il se termine avec
le code 1 si un écart dépasse les tolérances.

## Après un nouvel export Meshy

1. Déposer les fichiers dans `.source-assets/footman_v2/` en gardant la
   structure ci-dessus (ou adapter `footman-config.mjs`).
2. Relancer les deux scripts de génération, puis `verify-models.mjs`.
3. Vérifier en jeu ; les réglages visuels (échelle, timeScale, équipements,
   bouclier) sont dans `src/render/fantassinV2Rig.ts`, pas dans les assets.
