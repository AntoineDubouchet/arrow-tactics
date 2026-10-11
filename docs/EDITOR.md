# Éditeur de maps

Ce document décrit l'éditeur de maps d'Arrow Tactics **tel qu'il fonctionne
aujourd'hui**, d'après le code de la branche `reprise-2026`. En cas d'écart,
le code fait foi.

Pour l'organisation technique générale, voir `ARCHITECTURE.md` ; pour les bugs
et limitations, `KNOWN_ISSUES.md`.

## Sommaire

1. Ouvrir et quitter l'éditeur
2. L'interface
3. Plateau : taille et cases de terrain
4. Objets disponibles
5. Unités
6. Sélection
7. Déplacement
8. Rotation des décors
9. Supprimer
10. Annuler / rétablir
11. Panneau de propriétés
12. Caméra
13. Enregistrer et charger
14. Tester le scénario
15. Bâtiments décoratifs et bâtiments gameplay
16. Cartes à trous
17. Limitations connues
18. Pour les développeurs
19. Récapitulatif des contrôles

---

## 1. Ouvrir et quitter l'éditeur

- **Ouvrir** : menu principal → **Éditeur de maps**.
- **Contenu au démarrage** : l'éditeur s'ouvre toujours sur la **carte de
  campagne par défaut** (« vague1-20 »), avec un historique d'annulation vide.
- **Quitter** : **« ← Retour au menu »** abandonne le brouillon en cours. Rien
  n'est conservé si la carte n'a pas été enregistrée (§13).
- **Indépendance** : l'éditeur affiche son propre plateau. La partie réelle
  n'est pas modifiée par ce qui se passe dans l'éditeur.

## 2. L'interface

- **En haut**, la barre d'outils :
  - « ← Retour au menu », « Enregistrer », « Charger une carte » ;
  - réglage de la taille ;
  - outils de terrain ;
  - « Tester le scénario ».
- **À gauche**, le catalogue d'assets, rangé par groupes.
- **À droite**, le panneau de propriétés, affiché quand un décor ou une unité
  est sélectionné.
- **En bas**, un rappel des principaux raccourcis.

## 3. Plateau : taille et cases de terrain

**Taille**

- Deux champs (largeur × hauteur) et le bouton **Appliquer**. Le minimum est
  de 1×1.
- Agrandir **ajoute** des cases d'herbe.
- Réduire **ne supprime ni cases ni objets** existants : ils restent en place,
  éventuellement hors des nouvelles dimensions.
- Le redimensionnement ne peut pas être annulé avec Ctrl+Z.

**Cases de terrain**

- Outils : **+ Case (Herbe)**, **+ Case (Terre)**, **− Supprimer case**.
- Ce sont des outils **répétables** : ils restent actifs jusqu'à Échap, un
  clic droit ou le choix d'un autre outil.
- Un aperçu vert ou rouge indique sous le curseur si l'action est possible.
- **Ajout** : refusé si une case existe déjà à cet endroit.
- **Suppression** : refusée si une unité ou un obstacle bloquant occupe la
  case. Un prop décoratif n'empêche pas la suppression.

## 4. Objets disponibles

Catalogue (groupes dépliables) :

| Groupe | Contenu |
|---|---|
| Obstacles | Rochers, arbres |
| Décors | Champignons, buissons et plantes, fleurs, bois (bûches, souches), divers |
| KayKit (médiéval) | Nature, props |
| Bâtiments (KayKit) | Bleu, rouge, neutres |
| Unités | Bestiaire du jeu (construit automatiquement depuis `data/units.ts`) |

- **Pose libre** : un clic pose l'objet exactement sous le curseur, sans
  alignement sur une case. Un fantôme semi-transparent montre l'objet avant
  le clic. Après la pose, l'éditeur revient à l'outil de sélection et l'objet
  posé est sélectionné.
- **Collisions en bataille** : les props sont traversables ; les rochers, les
  arbres et les bâtiments bloquent le passage et la ligne de tir.

## 5. Unités

- **Pose** : alignée au **centre d'une case**, avec un aperçu de case vert ou
  rouge.
- **Pose refusée** :
  - sans case de terrain ;
  - sur un obstacle bloquant ;
  - sur une autre unité.
- **Camp** : déduit automatiquement de la moitié du plateau. `z ≥ 0` donne le
  camp joueur, sinon le camp ennemi. Le camp est recalculé à chaque
  déplacement, et rien ne restreint la pose aux zones de spawn.
- **Rotation** : les unités ne se tournent pas. Le bouton « Tourner » est
  masqué pour elles, et l'anneau ne sert qu'aux décors.

## 6. Sélection

- **Clic gauche** sur un décor ou une unité : le sélectionne.
- **Double-clic** sur une unité : sélectionne les unités du même type, au plus
  20, en partant des plus proches.
- **Une seule sélection à la fois** : un décor, une unité ou un groupe
  d'unités.
- **Pas de sélection rectangulaire** dans l'éditeur.
- **Désélectionner** : clic droit, Échap, ou clic gauche dans le vide.
- Avec un **décor** sélectionné, un clic gauche sur le sol le désélectionne.

## 7. Déplacement

- **Décors** :
  - uniquement avec les **flèches du gizmo** ;
  - déplacement libre sur le plan horizontal ;
  - un glisser complet compte comme **une seule opération** d'historique.
- **Unités** : sélectionner l'unité, puis cliquer sur une case. La position
  est alignée sur la grille.
- **Groupes d'unités** :
  - même geste que pour une unité ;
  - le groupe garde sa formation relative ;
  - le déplacement est refusé en bloc si une case cible n'existe pas.
- **Règle de validité** : le déplacement d'une unité vérifie seulement que la
  case cible existe. Il est donc moins strict que la pose (§5).

## 8. Rotation des décors

Quatre façons de tourner un décor sélectionné :

| Moyen | Effet |
|---|---|
| Glisser l'**anneau jaune** autour de l'objet | Rotation libre autour de l'axe vertical |
| **Ctrl + molette** | ±15° par cran |
| **Ctrl + Maj + molette** | ±1° par cran |
| **R** ou bouton **« Tourner 90° (R) »** | +90° |

- **Point de départ** : l'anneau et Ctrl+molette partent de l'orientation
  **réelle** du décor, y compris l'orientation aléatoire d'un décor jamais
  tourné.
- **Pas de saut** au passage 0° / 360°.
- **Annulation** : un glisser de l'anneau = une opération d'historique ;
  chaque cran de molette = une opération.
- **Ce qui a changé** : il n'existe plus de mode rotation W/E. W ne fait rien
  et E sert au zoom.
- **À ne pas confondre** : le **Ctrl+molette par pas de 45°** concerne le
  placement des bâtiments **en partie**, pas l'éditeur.
- **R / « Tourner 90° »** se comporte différemment de l'anneau et de
  Ctrl+molette : voir **KI-06**.

## 9. Supprimer

- **Suppr**, **Retour arrière** ou le bouton **« Supprimer (Suppr) »**
  suppriment la sélection : un décor, une unité ou un groupe.
- La suppression ne peut pas être annulée avec Ctrl+Z.

## 10. Annuler / rétablir

- **Raccourcis** : **Ctrl+Z** pour annuler, **Ctrl+Y** ou **Ctrl+Maj+Z** pour
  rétablir.

| Annulable | Non annulable |
|---|---|
| Déplacement d'un décor au gizmo | Pose d'un objet ou d'une unité |
| Rotation à l'anneau | Suppression |
| Rotation par Ctrl+molette (par cran) | Déplacement d'une unité ou d'un groupe |
| Ajout ou suppression d'une case | Redimensionnement du plateau |
| | R / « Tourner 90° » (KI-06) |

- **Remise à zéro** : l'historique est vidé à l'ouverture de l'éditeur, au
  chargement d'un fichier et à la sortie.
- **Particularité** : l'annulation d'un déplacement peut modifier
  l'orientation d'un décor jamais tourné, voir **KI-05**.

## 11. Panneau de propriétés

- **Décor sélectionné** :
  - type et modèle ;
  - position, avec deux décimales ;
  - emprise en cases ;
  - rotation, toujours affichée entre 0 et 359° ;
  - rappel « Ctrl + molette : ±15° • Maj : ±1° » sous la rotation ;
  - boutons « Tourner 90° (R) » et « Supprimer (Suppr) ».
- **Unité sélectionnée** : type, camp, position, bouton « Supprimer ». Pas de
  bouton « Tourner ».
- **Groupe d'unités** : pas de panneau.

## 12. Caméra

Mêmes contrôles qu'en partie, avec deux différences dans l'éditeur.

| Contrôle | Effet |
|---|---|
| Clic droit maintenu + glisser | Pivoter / incliner |
| Clic droit + clic gauche maintenus + glisser | Déplacer la caméra |
| Molette | Zoom |
| ← → / ↑ ↓ | Pivoter / incliner |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser la caméra |

Différences avec la partie :

- **R** tourne le décor sélectionné au lieu de réinitialiser la caméra. Dans
  l'éditeur, c'est **Espace** qui la réinitialise.
- **Ctrl + molette** tourne le décor sélectionné au lieu de zoomer. Sans décor
  sélectionné, la molette zoome normalement.

## 13. Enregistrer et charger

- **Enregistrer** : télécharge un fichier `<nom de la carte>.json`. Il n'y a
  pas de serveur ; le fichier arrive dans les téléchargements du navigateur.
- **Charger une carte** :
  - ouvre un `.json` et **remplace** le brouillon en cours ;
  - vide l'historique ;
  - un fichier invalide affiche une alerte et le brouillon reste intact ;
  - la validation est minimale : seule la présence des champs principaux est
    vérifiée.

**Vue pratique du format `MapDef`**

Ce résumé n'est pas une spécification exhaustive. Le format complet est
défini dans `config/mapDef.ts` et `config/constants.ts` (`ObstacleDef`) ;
voir aussi `ARCHITECTURE.md`.

| Champ | Contenu |
|---|---|
| `name`, `version` | Nom (sert de nom de fichier) et version |
| `width`, `height` | Taille de référence du plateau |
| `cells` | Liste des cases présentes, avec leur type de terrain. Optionnel : absent = rectangle plein d'herbe |
| `obstacles` | Décors : `kind` (rocher, arbre, prop, bâtiment), modèle, emprise `tilesX` × `tilesZ`, position `x` / `z` (ou ancien coin `cornerX` / `cornerZ`), `rotationY` optionnel |
| `playerUnits`, `enemyUnits` | Unités : `unitId`, `x`, `z` |

- **Camp des unités** : ce n'est pas un champ. Il est porté par la liste
  (`playerUnits` ou `enemyUnits`) dans laquelle l'unité est enregistrée.
- **Non enregistrés** : les identifiants internes de l'éditeur.
- **Compatibilité** : les anciennes cartes, sans `cells` ou avec des coins de
  grille, se chargent toujours.

## 14. Tester le scénario

- **Ce que fait le test** : il lance une **vraie bataille** sur la carte en
  cours d'édition, avec les mêmes règles qu'en partie.
- **Retour à l'éditeur** : automatique dès qu'un camp n'a plus de combattant,
  ou avec **Échap**. Le brouillon est retrouvé intact.
- **Ce que le test ne fait pas** :
  - il n'utilise ni l'or, ni l'armée, ni les bâtiments d'une run ;
  - il n'accorde aucune récompense de méta-progression ;
  - il ne crée aucun bâtiment gameplay. La tour est placée à une position de
    repli, voir **KI-07**.

## 15. Bâtiments décoratifs et bâtiments gameplay

- **Bâtiments du catalogue** (KayKit bleu, rouge, neutres) : ce sont de
  **simples obstacles**. Ils bloquent le passage et la ligne de tir, mais ne
  peuvent être ni ciblés, ni détruits, ni produire quoi que ce soit.
- **Bâtiments gameplay** (Mine, Caserne, Baliste) : ils n'existent qu'en
  partie, achetés ou posés par le joueur. On ne peut pas les placer depuis
  l'éditeur.

## 16. Cartes à trous

- Supprimer des cases crée des trous dans la carte.
- **En bataille** (y compris « Tester le scénario »), un trou bloque comme un
  obstacle.
- **Dans l'éditeur**, une unité ne peut pas être posée ni déplacée hors d'une
  case existante.
- Le placement du jeu réel ne tient pas compte des trous (**KI-02**). C'est
  sans effet aujourd'hui : le jeu réel n'utilise pas de carte issue de
  l'éditeur.

## 17. Limitations connues

Détaillées dans `KNOWN_ISSUES.md` :

- **KI-05** : l'annulation d'un déplacement peut réorienter un décor.
- **KI-06** : R / « Tourner 90° » est hors historique et part de 0°.
- **KI-07** : « Tester le scénario » ne crée pas de bâtiments gameplay.
- **KI-02** : le placement en jeu est insensible aux trous de cellules.

Deux autres limitations ont été repérées et seront ajoutées à
`KNOWN_ISSUES.md` lors d'une passe séparée :

- **Saisie dans les champs** : des raccourcis clavier pourraient rester
  actifs pendant la saisie (à vérifier). Par exemple, Retour arrière dans le
  champ « Taille » avec un objet sélectionné.
- **Emprises multi-cases** : certaines règles de l'éditeur ne testent que la
  **case centrale** d'un obstacle (suppression d'une case, pose d'une unité).

## 18. Pour les développeurs

| Fichier | Rôle |
|---|---|
| `editor/editorState.ts` | État de l'éditeur et règles de validité (`canPlaceUnitAt`, `canAddCell`, `canRemoveCell`) |
| `editor/editorScene.ts` | Meshes, fantômes, aperçus de cases, anneau de sélection et sa zone de saisie |
| `editor/editorUI.ts` | Barre d'outils, catalogue (`ASSET_GROUPS`), panneau de propriétés, aide |
| `editor/history.ts` | Pile de commandes annuler / rétablir |
| `editor/mapSerializer.ts` | Export et import JSON |
| `main.ts` | Orchestration et entrées : `enterEditor`, `handleEditorClick`, rotation (`tryStartRingRotate`, `rotateSelectedObstacleBy`), `TransformControls`, `testScenario` |

Conventions actuelles :

- **Meshes réutilisés** : lors des rafraîchissements, les meshes sont
  préservés et réutilisés autant que possible via le cache par id. Certaines
  fabriques de décors tirent leur apparence au hasard ; recréer un mesh
  ferait changer l'objet à l'écran. Le mesh d'une unité est reconstruit
  seulement quand son camp change.
- **Règle de validité unique** : l'aperçu vert/rouge et le clic utilisent la
  même fonction de validité, jamais deux calculs séparés.
- **Historique** : une commande par **geste** (au relâchement, ou par cran de
  molette), jamais une par frame.
- **Source de vérité de la rotation** : `rotationY`, dans l'état de l'éditeur
  et dans le fichier enregistré.
- **Ajouter un asset au catalogue** : une entrée dans `ASSET_GROUPS`
  (`editor/editorUI.ts`), et le modèle correspondant dans
  `render/assetLibrary.ts`.

## 19. Récapitulatif des contrôles

**Souris**

| Geste | Effet |
|---|---|
| Clic gauche sur un décor / une unité | Sélectionner |
| Double-clic sur une unité | Sélectionner les unités du même type (20 max) |
| Clic gauche sur une case (unité ou groupe sélectionné) | Déplacer |
| Clic gauche (outil de pose actif) | Poser l'objet ou l'unité |
| Clic gauche (outil de case actif) | Ajouter ou supprimer une case |
| Glisser une flèche du gizmo | Déplacer le décor |
| Glisser l'anneau jaune | Tourner le décor |
| Clic droit | Annuler l'outil actif, sinon désélectionner |
| Clic droit maintenu + glisser | Pivoter / incliner la caméra |
| Clic droit + gauche maintenus + glisser | Déplacer la caméra |
| Molette | Zoom |
| Ctrl + molette | Tourner le décor de ±15° |
| Ctrl + Maj + molette | Tourner le décor de ±1° |

**Clavier**

| Touche | Effet |
|---|---|
| R | +90° au décor sélectionné |
| Suppr / Retour arrière | Supprimer la sélection |
| Échap | Annuler l'outil actif, sinon désélectionner ; pendant un test, revenir à l'éditeur |
| Ctrl+Z | Annuler |
| Ctrl+Y / Ctrl+Maj+Z | Rétablir |
| ← → / ↑ ↓ | Pivoter / incliner la caméra |
| A / E | Zoom arrière / avant |
| Espace | Réinitialiser la caméra |
| X | Vitesse ×2 (utile pendant un test) |
