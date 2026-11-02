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
- `--atelier <dossier>` : catalogue de l'**Atelier de personnage**, pour
  chaque source qui déclare `atelier_animations`. Le jeu le lit dans
  `public/assets/units/toon/atelier` (voir « Sorties »).
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
  `castB`. Le préfixe `<pack>_<dossier>_` est retiré, et une variante
  placée avant le numéro est gardée : `WK_worker_bag_07_attack` (dossier
  `Worker`) → `bagAttack`, distinct de `attack`. Plages et boucles : celles
  de l'import Unity du pack (`.meta`).
- `pieces.offhand_weapon` (facultatif) : pièce de **main droite** copiée en
  miroir dans la main gauche (`L_hand_container`). Le plan de symétrie est
  celui des deux mains du squelette, et les normales sont retournées. Le
  résultat reste un seul maillage, poids 1 sur l'os porteur. Exemple : le
  Vengeur, `"weapon": "WK_weapon_sword_B", "offhand_weapon":
  "WK_weapon_sword_B"`. Les gestes d'un dossier prévu pour un bouclier
  laissent cette main assez passive.
- `pieces.hands` (facultatif, format de l'Atelier) : mains totalement
  libres. `{"right": {...}, "left": {...}}`, chaque main recevant
  `{"piece": <pièce tenue>, "scale": 1, "rotation": [x, y, z],
  "offset": [x, y, z]}`. Toute pièce portée par un os (arme, bouclier,
  bâton, arc) peut aller dans l'une ou l'autre main :
  - **main d'origine** : la pièce reste sur son os porteur ;
  - **autre main** : la pièce est copiée en miroir sur l'os symétrique
    (`R_hand_container` ↔ `L_hand_container`). À défaut d'os symétrique,
    elle va sur celui du parent (bouclier à droite : `Bip001_R_Hand`) ;
  - **ajustement** : appliqué autour de la prise (tête de l'os porteur), en
    axes glTF du modèle (X droite, Y haut, Z avant), rotations en degrés,
    décalage en unités du modèle.

  La même pièce peut aller dans les deux mains (double hache). Une entrée
  exportée par l'Atelier se colle telle quelle dans `units` ; son bloc
  `atelier` (couleur, échelle, clip d'aperçu) est ignoré par le script.
- **Pièce d'une autre source, échelle d'une pièce** (Atelier, facultatif) :
  un emplacement (`head`, `body`, `arms`, `legs`, `shoulderpads`, `helmet`,
  `cape`) ou un extra peut s'écrire `{"piece": "BRB_head_B", "source":
  "barbarian", "scale": 1.1}` au lieu d'un nom. Les deux champs sont
  facultatifs : par défaut, la source de l'unité et l'échelle 1. Une main
  (`pieces.hands`) accepte aussi `"source"`. Un nom seul garde son sens
  historique.
  - **Unité mixte** : le FBX de chaque autre source est importé à côté. Ses
    pièces passent sur l'armature de l'unité (même squelette Biped, mêmes
    noms d'os, même repos). Le squelette et les clips sont ceux de la source
    de l'unité.
  - **Matériaux d'une unité mixte** : un matériau par source, sans fusion
    d'atlas. Le premier garde le nom de l'unité ; les suivants s'appellent
    `<unité>__<préfixe des textures>` (par exemple `test_mixte__brb`).
    Leurs textures sont celles de chaque source (`brb_albedo.png`,
    `brb_team_mask.png`).
  - **Échelle d'une pièce** : chaque sommet est mis à l'échelle autour de la
    moyenne, pondérée par ses poids de skinning (les 4 plus forts,
    normalisés), des articulations qui le portent, au repos. Le squelette,
    les poids et les clips ne changent pas : la pièce grossit autour de ses
    os et les suit dans toutes les poses. Les articulations ne bougent pas :
    des jambes ×1,2 grossissent autour de leurs os sans rallonger le
    squelette (la semelle descend un peu sous la cheville). L'Atelier fait
    exactement le même calcul (`scaledSkinnedGeometry`).
- `extra_animations` (facultatif) : quelques clips d'autres dossiers,
  renommés, par exemple `[{ "folder": "animation/Worker", "clips":
  { "attack": "attackDouble" } }]`.
- `material_parts` (facultatif, au niveau de l'unité) : {matériau du FBX:
  partie} ; les faces de ce matériau deviennent un maillage séparé
  `part_<partie>`, que le jeu habille de sa propre texture (`ToonUnitDef.parts`).
  La source déclare la texture dans `extra_textures` ({partie: image du
  pack}), exportée en `<textures>_<partie>.png` (taille native si elle est
  plus petite que `--texture`). Exemple : le cheval de la cavalerie humaine.
- **Cavalerie** : le FBX modulaire de cavalerie ne s'importe pas (KI-36) ;
  les sources `western_kingdoms_cavalry` et `barbarian_cavalry` pointent vers
  les FBX « single mesh » (une pièce : `"pieces": { "body": "<nom>" }`). Noms
  de clips à préfixe multiple : `WK_cavalry_spear_07_attack` → `attack`.
- `pieces.tools` (facultatif) : outils interchangeables, chacun exporté
  comme un **maillage skinné séparé** nommé `tool_<nom>` (non fusionné au
  corps), porté par l'os prévu dans le FBX. Côté jeu, `setToonTool(racine,
  nom)` n'en montre qu'un. `pieces.tool_scale` agrandit un outil (facteur
  par nom). Exemple : le Héros, `"tools": { "hammer": "WK_weapon_hammer_B",
  "axe": "WK_weapon_axe_A", "pick": "WK_weapon_pick" }`, `"tool_scale":
  { "hammer": 1.6 }`, et les clips `workingA` / `workingB` / `workingC` du
  dossier `Worker`.

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

**Barbarians** (source `barbarian`, 2026-11-01) : ajoutée de cette façon,
sans changer le script. Le pack suit l'architecture de Western Kingdoms :
- même squelette (29 os, mêmes noms, positions de repos identiques) et
  mêmes os porteurs ;
- mêmes dossiers d'animations, aux clips identiques (mêmes trajectoires,
  mesuré) ;
- 8 atlas de couleur dont `BRB_Standard_Units_white.tga`.

Les cinq barbares reprennent donc les rôles et recadençages de l'unité
humaine qu'ils habillent (`skins` dans `TOON_UNITS`).

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
| `human_hero.glb` | Héros (tête E, corps D, épaulières B) : corps 219 sommets, 390 triangles ; outils séparés `tool_hammer` (38 triangles, ×1,6), `tool_axe` (34), `tool_pick` (30) ; 29 os, 14 clips (`Infantry` + `workingA/B/C` du `Worker`), 504 Ko ; échelle 1,3 en jeu |
| `human_light_cavalry.glb` | Cavalier léger (source `western_kingdoms_cavalry`, `WK_SM_Cavalry_Light_B`, single mesh) : cavalier 456 triangles + `part_horse` 330 triangles, 46 os, 10 clips (`Cavalry_Spear`), 702 Ko |
| `wk_horse.png` | texture du cheval humain (`WK_Horse_A`, 512), sans teinte d'équipe |
| `barbarian_light_cavalry.glb` | Razzieur (source `barbarian_cavalry`, `BRB_SM_cavalry_light_B`) : 448 sommets GPU, 811 triangles, 46 os, 10 clips, 700 Ko |
| `wk_albedo.png` | atlas neutre du pack (`WK_StandardUnits_white`), 2048 → 1024, **partagé** |
| `wk_team_mask.png` | zones de couleur d'équipe (pixels qui varient entre les 8 atlas de couleur), 1024, **partagé** |
| `barbarian_warrior.glb` | Guerrier (hache, bouclier rond en bois), `Infantry` : 483 sommets GPU, 517 triangles, 29 os, 11 clips, 410 Ko |
| `barbarian_berserker.glb` | Berserker (deux haches, `offhand_weapon`), `Infantry` + `attackDouble` : 495 sommets GPU, 512 triangles, 12 clips, 445 Ko |
| `barbarian_hunter.glb` | Chasseur (arc, carquois), `Archer` : 484 sommets GPU, 520 triangles, 9 clips, 348 Ko |
| `barbarian_shaman.glb` | Chaman (robe, bâton à crâne), `Mage` : 549 sommets GPU, 602 triangles, 14 clips, 492 Ko |
| `barbarian_brute.glb` | Brute (casque à cornes, épaulières lourdes, marteau), `Infantry` : 760 sommets GPU, 744 triangles, 11 clips, 426 Ko ; échelle 1,15 en jeu |
| `brb_albedo.png`, `brb_team_mask.png` | atlas neutre et zones d'équipe des Barbares (`BRB_Standard_Units_white`), 1024, **partagés** |
| `atelier/<source>_atelier.glb` | Atelier (`--atelier`) : toutes les pièces du FBX modulaire, séparées, et les clips de tous les dossiers `atelier_animations`, préfixés par le dossier (`Infantry_attackA`, `Worker_workingA`). `western_kingdoms` : 42 pièces, 64 clips, ~2,3 Mo ; `barbarian` : 47 pièces, 64 clips, ~2,4 Mo |
| `atelier/<source>_atelier.json` | catalogue lu par l'Atelier : pièces (emplacement, os porteur, main d'origine, sommets, triangles), clips (dossier, durée, boucle), presets (unités de la source dans `units.json`) |

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
