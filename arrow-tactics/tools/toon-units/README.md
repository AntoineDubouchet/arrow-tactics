# Outil unités Toon RTS

`build_toon_unit.py` produit les assets des unités Toon RTS chargées par le
jeu en laboratoire (`src/render/toonUnitRig.ts`, `?toonUnits=human`) et de
l'Oracle (par défaut, faute de modèle officiel), à
partir des packs Toon RTS (Unity Asset Store). Le jeu ne dépend ni de Unity
ni de Blender : le script est lancé une fois, ses sorties sont des fichiers
glTF et PNG.

Les sources commerciales restent hors du dépôt (`C:\Users\antoi\ToonRTS_Test\`).
Les sorties de `public/assets/units/toon/` en sont dérivées : elles sont
ignorées par Git (`.gitignore` à la racine, le dépôt est public) et se
reconstruisent avec la commande ci-dessous (voir `docs/ASSETS.md`, § 3.1 et
§ 8). Ne jamais copier de FBX, TGA ou PSD du pack dans le dépôt.

## Lancer

Depuis `arrow-tactics/` (Blender 5.2) :

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python-exit-code 1 ^
  --python tools/toon-units/build_toon_unit.py -- ^
  --config tools/toon-units/units.json --out public/assets/units/toon --all
```

- `--unit human_archer` (répétable) au lieu de `--all` : une seule unité.
- `--catalogue <dossier>` : GLB d'étude avec **toutes** les pièces du FBX
  modulaire, séparées, pour choisir un assemblage (jamais dans le jeu).
- `--atlas <dossier>` : atlas de couleur du pack en PNG, pour comparer.
- `--rapport <fichier.json>` : inventaire (pièces, triangles, clips).
- `--python-exit-code 1` est nécessaire : sans lui, Blender rend 0 même si
  le script échoue.

Deux exécutions produisent les mêmes triangles (tous attributs), les mêmes
clips et les mêmes textures. L'exporteur glTF peut toutefois ranger les
sommets dans un autre ordre (constaté pour l'Archer et le Mage) : le contenu
est le même, les octets du GLB peuvent différer.

## Définir une unité (`units.json`)

```json
"human_archer": {
  "source": "western_kingdoms",
  "pieces": {
    "head": "WK_Units_head_I", "body": "WK_Units_Body_A", "arms": "WK_Units_Arms_A", "legs": "WK_Units_Legs_A",
    "shoulderpads": null, "weapon": null, "offhand": "WK_weapon_Bow", "extras": ["WK_Xtra_quiver"]
  },
  "animations": "animation/Archer"
}
```

- `pieces` : noms d'objets du FBX modulaire de la source ; `null` = aucune
  pièce. `weapon` et `offhand` ne fixent pas la main : chaque arme est portée
  par l'os prévu dans le FBX (`R_hand_container`, `L_hand_container`,
  `L_shield_container`, `Quiver_container`). Changer une pièce = changer son
  nom, puis relancer le script.
- `animations` : dossier de clips FBX. **Tous** ses clips sont exportés, noms
  normalisés : `WK_infantry_07_attack_A` → `attackA`, `WK_mage_11_cast_B` →
  `castB`. Plages et boucles : celles de l'import Unity du pack (`.meta`).
- `pieces.offhand_weapon` (facultatif) : pièce de **main droite** copiée en
  miroir dans la main gauche (`L_hand_container`). Le plan de symétrie est
  celui des deux mains du squelette, et les normales sont retournées. Le
  résultat reste un seul maillage, poids 1 sur l'os porteur. Exemple : le
  Vengeur, `"weapon": "WK_weapon_sword_B", "offhand_weapon":
  "WK_weapon_sword_B"`. Les gestes d'un dossier prévu pour un bouclier
  laissent cette main assez passive.
- `extra_animations` (facultatif) : quelques clips d'autres dossiers,
  renommés, par exemple `[{ "folder": "animation/Worker", "clips":
  { "attack": "attackDouble" } }]`.

Côté jeu, une entrée de `TOON_UNITS` (`toonUnitRig.ts`) associe le GLB, le
préfixe des textures et les rôles du jeu (`idle`, `combatIdle`, `walk`,
`attack`, `attackAlt` (second geste alterné), `cast`, `knockdownA/B`) à un
clip et une vitesse de lecture visuelle, ou à un recadençage (`retime`)
qui place l'impact du clip sur la fin de l'élan de l'unité.

## Ajouter une faction (Barbares, Orcs…)

1. Une entrée dans `sources` : `pack` (dossier du pack), `model` (FBX
   modulaire), `team_color_atlases` (dossier des atlas de couleur),
   `neutral_atlas` (atlas de base de la teinte : le plus neutre, souvent
   blanc), `textures` (préfixe des PNG partagés, par exemple `brb`),
   `catalogue_animations` (clips du catalogue).
2. Ses unités dans `units`, avec `"source": "<nouvelle source>"`.
3. Côté jeu : leurs entrées dans `TOON_UNITS` et un groupe dans `TOON_GROUPS`
   (`?toonUnits=barbarian`). Les palettes (`TOON_PALETTES`) sont communes à
   toutes les sources.

Le pipeline suppose, pour chaque source, un modèle et des clips qui partagent
les noms d'os (cas des packs Toon RTS : squelette Biped `Bip001`). Pour une
source au squelette différent, seul `arrowHandBone` (main de corde de
l'archer) est à adapter côté jeu.

## Sorties (`public/assets/units/toon/`)

| Fichier | Contenu |
|---|---|
| `human_footman.glb` | 1 maillage skinné, 474 sommets GPU, 476 triangles, 29 os, 11 clips, 410 Ko |
| `human_archer.glb` | 1 maillage skinné, 398 sommets GPU, 429 triangles, 29 os, 9 clips, 343 Ko |
| `human_mage.glb` | 1 maillage skinné, 392 sommets GPU, 468 triangles, 29 os, 14 clips, 483 Ko |
| `human_sentinel.glb` | 1 maillage skinné, 476 triangles, 29 os, 11 clips (`Infantry`), 410 Ko ; affichée à l'échelle 1,15 en jeu |
| `human_oracle.glb` | 1 maillage skinné, 409 sommets GPU, 490 triangles, 29 os, 14 clips (`Mage`), 484 Ko |
| `human_pikeman.glb` | Piquier : 1 maillage skinné, 375 sommets GPU, 412 triangles, 29 os, 10 clips (`Spearman`), 372 Ko |
| `human_avenger.glb` | Vengeur (deux épées, `offhand_weapon`) : 1 maillage skinné, 407 sommets GPU, 454 triangles, 29 os, 12 clips (`Infantry` + `attackDouble` du `Worker`), 440 Ko |
| `wk_albedo.png` | atlas neutre du pack (`WK_StandardUnits_white`), 2048 → 1024, **partagé** |
| `wk_team_mask.png` | zones de couleur d'équipe (pixels qui varient entre les 8 atlas de couleur), 1024, **partagé** |

## Étapes du script

1. **Modèle** : FBX modulaire, sans les pièces non choisies. Les pièces
   rigides (portées par un os) sont fusionnées dans le maillage skinné avec
   un poids 1 sur leur os : un seul maillage, un seul matériau, deux draw
   calls par unité (avec l'ombre). 4 influences au plus par sommet.
2. **Clips** : chaque FBX d'animation a sa propre pose de repos et anime
   aussi l'objet armature (centre de gravité du Biped). La pose de chaque os
   est recopiée en espace monde sur le squelette du modèle, image par image.
3. **Export** : GLB sans image ; textures de la source écrites une fois,
   jamais dupliquées dans les GLB.

## Clips des humains (Western Kingdoms)

La Sentinelle utilise les clips `Infantry`, comme le Fantassin (épée ou
marteau et bouclier). L'Oracle (capuche, robe, bâton doré `staff_B`) utilise
les clips `Mage` ; son soin joue `castB` (le pack n'a pas de dossier de
prêtre ; `Worker` ne contient que des gestes d'outil).

Le Piquier (lance et petit bouclier) utilise les clips `Spearman`, faits
pour cet équipement. Le Vengeur (deux épées) garde les gestes `Infantry`
et ajoute la frappe à deux mains du `Worker` (`attackDouble`), alternée en
jeu avec `attackB`. Aucun clip du pack n'est prévu pour deux armes.

Armes : chaque pièce d'arme est portée par l'os prévu dans le FBX (épée,
hache, marteau, pioche, lance : `R_hand_container` ; bâtons et arc :
`L_hand_container` ; boucliers : `L_shield_container`). Changer d'arme dans
la même main ne demande qu'un nom de pièce. Une seconde arme dans la main
gauche passe par `offhand_weapon`.

| Clip | Fantassin (`Infantry`) | Archer (`Archer`) | Mage (`Mage`) |
|---|---|---|---|
| `idle` | 3,33 s, boucle | 3,33 s, boucle | 3,33 s, boucle |
| `walk` | 1,2 s, boucle | 1,2 s, boucle | 1,2 s, boucle |
| `run` | 1,0 s, boucle | 1,0 s, boucle | 1,0 s, boucle |
| `charge` | 0,83 s, boucle | — | 0,83 s, boucle |
| `combatIdle` | 1,67 s, boucle | 1,67 s, boucle | 1,67 s, boucle |
| `combatWalk` | 1,2 s, boucle | 1,17 s, boucle | 1,2 s, boucle |
| attaques | `attackA`, `attackB` (1,33 s) | `attack` (tir, 1,33 s) | `attackA`, `attackB` (1,33 s) |
| `takeDamage` | 0,67 s | 0,67 s | 0,67 s |
| `deathA`, `deathB` | 1,67 s | 1,67 s | 1,67 s |
| sorts | — | — | `castA`, `castB` (1,33 s), `castC` (1,67 s, boucle) |

Tous les clips sont sur place. La course (`run`) avance d'environ 2,0 cases/s
à vitesse 1 (pied d'appui mesuré à l'échelle du jeu), la marche d'environ
0,65 case/s.
