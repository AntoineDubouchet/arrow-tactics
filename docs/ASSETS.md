# Assets visuels

Ce document décrit les assets visuels d'Arrow Tactics **tels qu'ils existent
aujourd'hui** dans la branche `reprise-2026` : provenance, rangement,
chargement, conventions et pièges. En cas d'écart, le code et le contenu de
`public/` font foi.

Pour le pipeline de rendu en général, voir `ARCHITECTURE.md`. Pour le catalogue
de l'éditeur de maps, voir `EDITOR.md`. Pour les problèmes connus, voir
`KNOWN_ISSUES.md`.

## Sommaire

1. Vue d'ensemble
2. Arborescence de `public/`
3. Assets du jeu, famille par famille
4. Assets inutilisés / legacy
5. Chargement et cache
6. Conventions d'import et de rendu
7. Qui utilise quoi : jeu, éditeur, bâtiments gameplay
8. Sources et droits
9. Ajouter un nouvel asset
10. Pièges connus

**Trois statuts** sont utilisés dans tout le document :

| Statut | Signification |
|---|---|
| **Utilisé** | Affiché en partie normale : unités, Baliste, flèche, sol, ciel, VFX, icônes, décor de la carte de campagne, bâtiments gameplay |
| **Référencé / disponible** | Déclaré dans le code et chargé au démarrage, proposé dans le catalogue de l'éditeur, mais absent de la carte de campagne actuelle |
| **Inutilisé / legacy** | Présent dans `public/`, mais jamais chargé par le code |

---

## 1. Vue d'ensemble

> Les poids et nombres de fichiers de ce document sont un **instantané de
> l'audit actuel**. Ils changeront dès qu'un asset sera ajouté ou retiré.

- `public/` : environ **287 Mo**, **374 fichiers**.
- **Copie dans le build** : Vite copie `public/` tel quel dans `dist/`, sans
  tri. Le build pèse donc environ **288 Mo**, assets inutilisés compris (voir
  §4 et KI-16).
- **Versionnement** : tous les fichiers de `public/` sont suivis directement
  par Git. Le dépôt ne suit aucun fichier avec Git LFS et ne contient aucun
  `.gitattributes`.
- **Formats présents** : `.glb`, `.gltf` + `.bin`, `.obj` + `.mtl`, `.fbx`,
  `.png`, `.tga`. Les `.tga` ne sont jamais chargés.

## 2. Arborescence de `public/`

| Dossier | Fichiers | Poids | Formats | Contenu |
|---|---|---|---|---|
| `models/archer/` | 12 | ~78 Mo | .glb | Archer bleu / rouge : base, marche, 3 morts, attaque |
| `models/fantassin/` | 2 | ~19 Mo | .glb | Fantassin bleu / rouge |
| `models/sentinel/` | 2 | ~20,5 Mo | .glb | Sentinelle bleue / rouge |
| `models/mage/` | 1 | ~4,4 Mo | .glb | Mage (maillage + 5 clips) |
| `models/ballista/fbx/` | 11 | ~150,7 Mo | .fbx, .png, .tga | Baliste actuelle, animations, textures |
| `models/ballista/` | 2 | ~0,02 Mo | .obj, .png | Ancienne baliste |
| `models/arrow/` | 1 | <0,01 Mo | .obj | Flèche du joueur |
| `models/nature/` | 110 | ~1 Mo | .glb | Décor Kenney |
| `models/kaykit/` | 81 | ~0,4 Mo | .gltf, .bin, .png | Décor KayKit (40 modèles + texture partagée) |
| `models/buildings/` | 129 | ~7,5 Mo | .obj, .mtl, .png | Bâtiments KayKit (64 pièces + texture partagée) |
| `textures/ground/` | 2 | ~3 Mo | .png | Herbe, terre |
| `textures/` (racine) | 1 | ~1,5 Mo | .png | `sky_background.png` |
| `textures/vfx/` | 18 | ~1 Mo | .png | Textures d'effets |
| `textures/ui/battle-spells/` | 2 | ~0,04 Mo | .png | Icônes des parchemins |

Les chemins sont servis depuis la racine du site (`/models/...`,
`/textures/...`).

## 3. Assets du jeu, famille par famille

### 3.1 Unités riggées — utilisées

Quatre unités jouables, toutes des `.glb` avec squelette (`SkinnedMesh`) :

| Unité | Fichiers chargés | Teinte d'équipe | Animations |
|---|---|---|---|
| Fantassin | `fantassin_{blue,red}_base.glb` | Deux exports déjà teintés | Marche et attaque générées par le code |
| Archer | `archer_{blue,red}_base.glb` + `_walk`, `_death`, `_death_forward`, `_death_slow` | Deux exports déjà teintés | Marche et 3 morts depuis les fichiers ; attaque générée par le code |
| Mage | `mage_biped.glb` | Teinte par le code (couleur d'équipe éclaircie) | `Walking`, `Attack`, `mage_soell_cast_4` depuis le fichier |
| Sentinelle | `sentinel_{blue,red}.glb` | Deux exports déjà teintés | Marche, attaques et Provocation générées par le code |

- Le fichier du Mage contient aussi `Running` et `mage_soell_cast_7`, qui ne
  sont pas utilisés.
- Fichiers : `render/fantassinRig.ts`, `archerRig.ts`, `mageRig.ts`,
  `sentinelRig.ts`, et `render/riggedGltf.ts` pour le chargement commun.

### 3.2 Baliste et tour — utilisées

- **Baliste** :
  - fichiers chargés dans `models/ballista/fbx/` : `Ballista.fbx` (corps riggé),
    `Ballista_Shot_Anim.fbx`, `Ballista_AfterShot_Anim.fbx` ;
  - textures : `T_Ballista_C.png` (couleur), `T_Ballista_N.png` (normales),
    `T_Ballista_ORM.png` (occlusion / rugosité / métal) ;
  - code : `render/ballista.ts`.
- **Tour** : la Baliste est posée au sommet du bâtiment KayKit
  `blue_tower_base` (§3.6).

### 3.3 Flèche du joueur — utilisée

- `models/arrow/arrow_bow.obj`, sans `.mtl`. Le fichier mentionne un
  `arrow_bow.mtl` absent ; il est ignoré.
- La couleur est posée par le code, sommet par sommet : pointe, bois,
  empennage. Code : `render/playerArrowView.ts`.

### 3.4 Décor Kenney (`models/nature/`)

- Les 110 fichiers sont déclarés dans `render/assetLibrary.ts` et **chargés au
  démarrage**.
- **Utilisés sur la carte de campagne** :
  - rochers (pools de masses, d'accents plats et de débris) ;
  - arbres (pool aléatoire `TREE_MODELS` + modèles imposés, surtout des pins) ;
  - props : buissons, plantes, fleurs, souches, bûches, champignons, feux de
    camp, pot, panneau.
- **Référencés / disponibles** : les autres arbres et props, posables depuis
  l'éditeur.

### 3.5 Décor KayKit (`models/kaykit/`)

- 40 modèles `.gltf` + `.bin` (rochers, arbres, plantes aquatiques, caisses,
  tonneaux, drapeaux, tente…) et une texture partagée,
  `hexagons_medieval.png`.
- **Référencés / disponibles** : tous sont chargés au démarrage et proposés
  dans l'éditeur (groupe « KayKit (médiéval) »). Aucun n'est posé sur la carte
  de campagne actuelle.

### 3.6 Bâtiments KayKit (`models/buildings/`)

- 64 pièces `.obj` + `.mtl` (27 bleues, 27 rouges, 10 neutres) et une texture
  partagée, `hexagons_medieval.png` (même image que celle de `kaykit/`).
- Elles forment 46 bâtiments : 18 familles × 2 couleurs + 10 neutres. Une
  famille peut regrouper plusieurs pièces, par exemple un toit ou les pales
  d'un moulin.
- **Utilisés en jeu** :
  - `blue_tower_base` : la tour de la Baliste ;
  - `blue_mine` : le bâtiment gameplay Mine ;
  - `blue_barracks` : le bâtiment gameplay Caserne.
- **Référencés / disponibles** : tous les autres, posables comme simples
  obstacles décoratifs dans l'éditeur.
- Les **murs et clôtures** du pack d'origine n'ont pas été importés.

### 3.7 Textures — utilisées

| Fichier(s) | Usage | Code |
|---|---|---|
| `textures/ground/ground_grass.png`, `ground_dirt.png` | Sol du plateau (texture répétée) | `render/textures.ts` |
| `textures/sky_background.png` | Fond fixe de la scène (pas un vrai skybox) | `render/renderer.ts` |
| `textures/vfx/*.png` (16 sur 18) | Effets : Boule de feu, projectiles d'ombre, soin, Nova de glace, Blizzard, aura Recyclage | `render/vfxTextures.ts` et les vues d'effets |
| `textures/ui/battle-spells/*.png` | Icônes du parchemin de soin et de la Nova de glace | `ui/itemIcons.ts` |

### 3.8 Ce qui reste généré par le code

Ces éléments n'ont aucun fichier d'asset :

- icône de pièce (SVG pixel, `ui/pixelIcon.ts`) ;
- icônes de repli des objets sans image (SVG, `ui/itemIcons.ts`) ;
- anneaux de sélection, télégraphes, aperçus de cases, fantômes de placement ;
- la plupart des formes des effets (sphères, anneaux), en complément des
  textures VFX ;
- les animations de marche et d'attaque citées en §3.1.

## 4. Assets inutilisés / legacy

Fichiers présents dans `public/` mais jamais chargés par le code. Ils sont
copiés dans `dist/` à chaque build, environ **150 Mo** au total (instantané).

| Fichier(s) | Poids | Constat |
|---|---|---|
| `models/ballista/fbx/T_Ballista_C.tga`, `_N.tga`, `_ORM.tga` | 3 × 48 Mo | Textures sources ; le jeu charge les versions PNG réduites |
| `models/archer/archer_blue_attack.glb`, `archer_red_attack.glb` | ~13 Mo | Clip retiré, l'attaque est générée par le code |
| `models/ballista/fbx/Ballista_Idle_Anim.fbx` | ~0,09 Mo | Jamais chargé |
| `models/ballista/fbx/Ballista_Arrow.fbx` | ~0,05 Mo | Jamais chargé |
| `models/ballista/ballista_level1.obj`, `ballista_level1_texture.png` | ~0,02 Mo | Ancienne baliste (Blockbench) |
| `textures/vfx/fire_01.png`, `magic_01.png` | ~0,18 Mo | Jamais référencés |

Ce document ne propose aucun nettoyage. Le sujet est suivi dans
`KNOWN_ISSUES.md` (KI-16).

## 5. Chargement et cache

Détail du préchargement et de l'ordre de démarrage : voir `ARCHITECTURE.md`.

- **Décor et bâtiments** : `loadEnvironmentAssets()`
  (`render/assetLibrary.ts`).
  - Charge **une seule fois** tous les modèles Kenney, KayKit et les bâtiments
    (une promesse en cache).
  - Chaque objet posé est ensuite un **clone** ; le même objet n'est jamais
    ajouté deux fois à la scène.
  - `THREE.Cache.enabled = true` : la texture KayKit partagée n'est téléchargée
    qu'une fois.
- **Unités et flèche** : préchargées au démarrage dans `main.ts`, en parallèle
  de la construction du plateau.
  - Fonctions : `preloadMageModel`, `preloadFantassinModel`,
    `preloadArcherModel`, `preloadSentinelModel`, `preloadPlayerArrowModel`.
  - Ensuite, `build*Model()` est **synchrone** et lève une erreur si le
    préchargement n'a pas eu lieu.
- **Baliste** : instance unique, construite par `buildBallistaTowerPlatform`
  après `loadEnvironmentAssets`. Elle n'est jamais clonée.
- **Textures VFX** : cache partagé par nom de fichier (`loadVfxTexture`).
- **Textures du sol** : une instance neuve à chaque construction de plateau.

## 6. Conventions d'import et de rendu

### Formats et chargeurs

| Format | Chargeur | Utilisé pour | Particularité |
|---|---|---|---|
| `.glb` | `GLTFLoader` | Kenney, unités | Fichier autonome |
| `.gltf` + `.bin` | `GLTFLoader` | KayKit | La texture est référencée en chemin relatif : elle doit être dans le **même dossier** |
| `.obj` + `.mtl` | `OBJLoader` + `MTLLoader` | Bâtiments | Pièces regroupées sans décalage (coordonnées déjà absolues) |
| `.obj` seul | `OBJLoader` | Flèche | Matériau entièrement posé par le code |
| `.fbx` | `FBXLoader` | Baliste | Matériau PBR reconstruit à partir des PNG ; textures d'origine ignorées |

### Squelettes et animations

- **Clips dans des fichiers séparés** : `loadRiggedPrototype`
  (`render/riggedGltf.ts`) fusionne des clips venant d'autres `.glb`. Les
  pistes se lient **par nom d'os**, il faut donc des noms identiques.
- **Baliste** : les noms d'os des clips ne correspondent pas à ceux du corps.
  `retargetClipToBody` réécrit leur préfixe.
- **Clonage** : `SkeletonUtils.clone` est **obligatoire** pour toute unité
  riggée. Un `Object3D.clone()` laisserait le clone animer le squelette de
  l'original.

### Orientation

- Convention du projet : **-Z = avant**.
- **Unités riggées** : les quatre modèles reçoivent une rotation de π
  (`facingFix`). Elle a été constatée nécessaire pour le Mage, et appliquée
  par cohérence aux trois autres, issus du même pipeline d'export. Elle est
  posée sur un **groupe enfant**, jamais sur la racine : `UnitViews.sync`
  réécrit `rotation.y` de la racine à chaque frame.
- **Flèche** : rotation de π posée sur le clone, à l'intérieur d'un groupe
  parent.
- **Baliste** : aucune correction ; l'axe de tir est déduit du squelette.

### Échelle

- **Unités** : une constante par modèle (`MAGE_MODEL_SCALE`,
  `FANTASSIN_MODEL_SCALE`, `ARCHER_MODEL_SCALE`, `SENTINEL_MODEL_SCALE`),
  appliquée à la **racine**, que `UnitViews.sync` ne modifie pas.
- **Flèche** : `ARROW_MODEL_SCALE`.
- **Baliste** : `BALLISTA_SCALE = 0,005`, car l'unité native du FBX est très
  différente.
- **Décor** :
  - `cloneScaledTo` met à l'échelle sur la largeur ou la hauteur (rochers,
    arbres, props) ;
  - `cloneScaledToFootprint` fait tenir le modèle dans une emprise en cases
    (bâtiments) ;
  - dans les deux cas, l'échelle est **uniforme**, le modèle est recentré en
    X/Z et son point le plus bas posé à `y = 0`.
- Le facteur `scale` des props dans le catalogue de l'éditeur a été mesuré
  dans les fichiers.

### Matériaux

- **Unités riggées** (les 4) :
  - matériau **cloné pour chaque instance**, car le flash d'impact et le fondu
    de mort le modifient ;
  - `metalness = 0` : les quatre `.glb` n'ont pas de `metallicFactor`, et glTF
    vaut alors 1 par défaut, ce qui rend le modèle quasi noir sans carte
    d'environnement ;
  - émissif remis à 0 (`emissive`, `emissiveMap`, `emissiveIntensity`), car le
    flash d'impact suppose un émissif nul au repos. Le Mage et l'Archer ont un
    émissif dans leur fichier ; le Fantassin et la Sentinelle n'en ont pas, la
    remise à 0 est sans effet pour eux.
- **Espace couleur** :
  - `SRGBColorSpace` pour les textures de couleur : sol, ciel, VFX, texture
    des bâtiments (que `MTLLoader` ne règle pas), couleur de la Baliste ;
  - les cartes de normales et ORM de la Baliste restent en espace linéaire.
- **Bâtiments gameplay** : `BuildingView` clone les matériaux de la Mine et de
  la Caserne, pour que leur flash ne touche pas un bâtiment décoratif du même
  modèle.

## 7. Qui utilise quoi : jeu, éditeur, bâtiments gameplay

| Catégorie | Données | Rendu | Dans l'éditeur |
|---|---|---|---|
| Décor (rocher, arbre, prop, bâtiment décoratif) | `ObstacleDef` (`config/constants.ts`) | `render/obstacleFactory.ts`, partagé par le plateau du jeu **et** l'éditeur | Posable |
| Unités | `data/units.ts` | `buildUnit` (`render/unitMesh.ts`), partagé par le combat, l'aperçu de placement et l'éditeur | Posable |
| Bâtiments gameplay (Mine, Caserne) | `data/buildings.ts` | Modèles KayKit `blue_mine` / `blue_barracks` + `BuildingView` | Non posables |
| Baliste et tour | Instance unique | `render/ballista.ts` | Non posable, mais déplaçable (`EDITOR.md`, §16) |

Un bâtiment KayKit posé dans l'éditeur est un **simple obstacle**, même s'il
utilise le même modèle que la Mine ou la Caserne (voir `EDITOR.md`, §16).

## 8. Sources et droits

**Dans le dépôt** : aucun fichier de licence ni de crédits n'est archivé
(pas de `LICENSE`, `License.txt` ni `CREDITS` à côté des assets).

**Confirmé par Antoine** :
- les modèles Meshy proviennent de son compte, avec l'option d'usage commercial
  sélectionnée à la génération ;
- les autres assets ont été choisis parce qu'ils autorisaient leur
  utilisation dans le jeu.

| Assets | Provenance | Droits d'usage | Licence exacte | Preuve |
|---|---|---|---|---|
| Fantassin, Archer, Mage, Sentinelle | Compte Meshy d'Antoine | Droits commerciaux confirmés par Antoine lors de la génération | Non précisée (pas de mention CC0 confirmée) : on s'en tient à « droits commerciaux confirmés » | Générations retrouvables dans l'historique du compte Meshy |
| `models/nature/` | Kenney, Nature Kit | Autorisés | CC0 selon les commentaires du code | Aucun fichier de licence archivé dans le dépôt |
| `textures/vfx/` | Kenney, Particle Pack | Autorisés | CC0 selon les commentaires du code | Aucun fichier de licence archivé dans le dépôt |
| `models/kaykit/`, `models/buildings/` | KayKit (Kay Lousberg), Medieval Hexagon Pack | Autorisés | CC0 selon les commentaires du code | Aucun fichier de licence archivé dans le dépôt |
| Baliste (`models/ballista/fbx/`) | Non documentée dans le dépôt (le corps a été exporté depuis Maya, les animations avec un exporteur FBX d'Unreal) | Utilisation dans le jeu autorisée (confirmé par Antoine) | Non documentée | À archiver |
| Flèche (`arrow_bow.obj`) | Non documentée (fichier issu d'un projet Blender « Adventurers_2.0_Accessories_Export ») | Utilisation dans le jeu autorisée (confirmé par Antoine) | Non documentée | À archiver |
| Sol, ciel, icônes de parchemins | Fournis par Antoine | Utilisation dans le jeu autorisée (confirmé par Antoine) | Non documentée | À archiver |
| Ancienne baliste (`ballista_level1.*`, inutilisée) | Blockbench, fournie par Antoine | Sans objet tant qu'elle reste inutilisée | — | — |

> Avant une commercialisation publique, conserver/archiver les justificatifs
> de provenance et de droits des assets importants (historique Meshy, pages de
> licence des packs, fichiers LICENSE, etc.).

## 9. Ajouter un nouvel asset

Pratique actuelle, telle qu'elle se dégage du code :

- **Décor (rocher, arbre, prop)** :
  1. copier le fichier dans `public/models/nature/` (`.glb`) ou
     `public/models/kaykit/` (`.gltf` + `.bin`, à côté de la texture
     partagée) ;
  2. ajouter son nom à la liste correspondante de `render/assetLibrary.ts` ;
  3. ajouter une entrée au tableau d'assets correspondant de
     `editor/editorUI.ts`, rangé dans une catégorie de `DECOR_CATALOG`
     (voir `EDITOR.md` §6).
- **Bâtiment** : copier les `.obj` / `.mtl` dans `public/models/buildings/`,
  puis déclarer la famille et ses pièces dans `TEAM_BUILDING_FAMILIES` ou
  `NEUTRAL_BUILDING_FAMILIES`. L'emprise en cases se déclare dans le
  catalogue de l'éditeur.
- **Ne pas** ajouter de modèle aux pools tirés au hasard (`TREE_MODELS`,
  pools de rochers) : les objets déjà placés sans modèle imposé changeraient
  d'apparence.
- **Unité riggée** : suivre le modèle d'un fichier `*Rig.ts` existant :
  - préchargement ;
  - `SkeletonUtils.clone` ;
  - matériau cloné, `metalness = 0`, émissif à 0 ;
  - `facingFix` sur un enfant, échelle sur la racine ;
  - appel du préchargement dans `main.ts`.
- **Texture d'effet** : copier le PNG dans `public/textures/vfx/` et le charger
  par `loadVfxTexture(nom)`.
- **Droits** : noter la provenance et archiver la preuve de droits dès l'ajout
  (§8).

## 10. Pièges connus

| Symptôme | Cause | Parade appliquée |
|---|---|---|
| Unité riggée quasi noire | `metallicFactor` absent : glTF le considère à 1 | `metalness = 0` sur le matériau cloné |
| Tous les exemplaires flashent ou s'estompent ensemble | Matériau partagé entre instances | Cloner le matériau par instance |
| Le clone n'anime pas son propre squelette | `Object3D.clone()` sur un `SkinnedMesh` | `SkeletonUtils.clone` |
| L'unité tourne le dos ou la correction d'orientation disparaît | Rotation posée sur la racine, réécrite à chaque frame | `facingFix` sur un groupe enfant |
| La lueur d'origine disparaît au premier coup reçu | Le flash suppose un émissif nul au repos | Émissif mis à 0 au chargement |
| Un clip venant d'un autre fichier ne bouge rien | Noms d'os différents | Noms identiques, ou réécriture des pistes (Baliste) |
| Texture KayKit introuvable | `.gltf` et texture dans des dossiers différents | Texture copiée à côté des `.gltf` |
| Couleurs délavées ou trop sombres | Espace couleur incorrect | `SRGBColorSpace` sur les textures de couleur uniquement |
| Texture vide après un clone | Texture clonée avant la fin de son chargement | Une instance neuve par chargement (sol) ou un cache par nom (VFX) |
| Rocher en « totem », décor qui change au hasard | Mauvais modèles dans un pool aléatoire | Pools restreints, modèles mesurés |
| Modèle déformé | Échelle non uniforme | Toujours `setScalar` |
| Clip d'animation qui « téléporte » en boucle | Déplacement intégré au clip (root motion) | Préférer un clip de marche sur place |
