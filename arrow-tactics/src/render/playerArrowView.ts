import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { COLORS, PLAYER_ARROW_ARC_HEIGHT } from '../config/constants';
import { clamp, lerp } from '../core/math';
import type { ArrowFlight } from '../sim/playerArrow';

/** Hauteur de depart du tir au-dessus de la base de la baliste — valeur
 *  d'origine pour une baliste posee au sol (mecanisme a hauteur de
 *  poitrine). Exportee (2026-08-14, essai "baliste sur tour", voir
 *  render/ballista.ts) : main.ts l'utilise comme point de depart pour
 *  calculer la hauteur EFFECTIVE quand la baliste est surelevee, plutot que
 *  de redupliquer ce nombre. */
export const DEFAULT_LAUNCH_HEIGHT = 0.7;

/**
 * Vue de la fleche du joueur : contrairement a Projectiles (fleches d'archer,
 * purement cosmetiques), cette trajectoire suit l'etat SIMULE
 * (sim/playerArrow.ts) — le vol a un vrai sens gameplay (l'impact resout les
 * degats a la fin), donc le rendu se contente d'interpoler entre
 * prevElapsed/elapsed comme pour la position des unites, jamais un chrono
 * cosmetique independant.
 *
 * PLUSIEURS traits peuvent desormais etre EN VOL en meme temps (2026-08-14,
 * talent "Mitraillette" — voir sim/playerArrow.ts, PlayerArrowState.flights)
 * — un mesh par vol actif, suivi dans `flyingMeshesByFlight` (cle = l'objet
 * ArrowFlight lui-meme, stable tant que le vol n'est pas resolu : identite
 * d'objet suffisante, la simulation ne donne pas d'id a un vol). TOUS les
 * traits plantes restent visibles simultanement (2026-08-13, bug remonte
 * par Antoine : "des que j'en tire une autre la precedente disparait" — un
 * vrai pool `stuckMeshes[]`). Vide uniquement a clear() (fin de bataille) —
 * jamais retire au fil des tirs.
 */
export class PlayerArrowView {
  readonly group = new THREE.Group();
  private readonly flyingMeshesByFlight = new Map<ArrowFlight, THREE.Group>();
  private readonly stuckMeshes: THREE.Group[] = [];
  /** Hauteur de depart REELLE du tir (voir DEFAULT_LAUNCH_HEIGHT) — modifiable
   *  via setLaunchHeight (2026-08-14, "le tir de la baliste semble partir de
   *  la base de la tour... il faut que cela parte bien de la baliste") : la
   *  baliste, desormais surelevee au sommet d'une tour (voir
   *  render/ballista.ts, buildBallistaTowerPlatform), doit tirer visuellement
   *  depuis SA hauteur reelle, pas depuis le sol. */
  private launchHeight = DEFAULT_LAUNCH_HEIGHT;

  /** A appeler une fois apres avoir positionne la baliste (voir main.ts) —
   *  jamais par tir, la hauteur de la baliste ne change pas en cours de
   *  partie. */
  setLaunchHeight(height: number): void {
    this.launchHeight = height;
  }

  sync(flights: readonly ArrowFlight[], alpha: number): void {
    // Vols termines depuis le dernier sync() (plus dans `flights`) : leur
    // mesh garde sa derniere pose (deja pres du sol, deja incline vers le
    // bas grace au plafond de pitch ci-dessous) au lieu de disparaitre —
    // AJOUTE au pool plutot que d'ecraser un slot unique, voir le
    // commentaire de classe.
    const active = new Set(flights);
    for (const [flight, mesh] of this.flyingMeshesByFlight) {
      if (active.has(flight)) continue;
      this.stuckMeshes.push(mesh);
      this.flyingMeshesByFlight.delete(flight);
    }

    for (const flight of flights) {
      let mesh = this.flyingMeshesByFlight.get(flight);
      if (!mesh) {
        mesh = buildArrow();
        this.group.add(mesh);
        this.flyingMeshesByFlight.set(flight, mesh);
      }

      const t = clamp(lerp(flight.prevElapsed, flight.elapsed, alpha) / flight.duration, 0, 1);
      // Descend jusqu'au sol (0) a l'arrivee au lieu de revenir a HEIGHT —
      // correctif du 2026-08-10 (demande d'Antoine, "il faut modifier la
      // trajectoire [...] pour qu'il se plante mieux au sol") : avant ce
      // changement, le trait flottait a HEIGHT en fin de vol et ne touchait
      // donc jamais reellement le sol, impossible de le "planter" ensuite.
      const height = lerp(this.launchHeight, 0, t) + Math.sin(t * Math.PI) * PLAYER_ARROW_ARC_HEIGHT;
      mesh.position.set(lerp(flight.fromX, flight.toX, t), height, lerp(flight.fromZ, flight.toZ, t));

      // Inclinaison selon la tangente de la trajectoire — plafond VARIABLE
      // selon t (correctif du 2026-08-10) : quasi-horizontal au debut et
      // pendant la montee (MAX_PITCH_EARLY, comme valide par Antoine avant
      // ce correctif — "elle reste surtout horizontale du debut a la fin"),
      // mais nettement plus permissif en fin de vol (MAX_PITCH_LANDING) pour
      // que le trait ait vraiment l'air de plonger vers le sol juste avant
      // de s'y planter, plutot qu'un angle mineur constant tout du long.
      const dx = flight.toX - flight.fromX;
      const dz = flight.toZ - flight.fromZ;
      const yaw = Math.atan2(-dx, -dz);
      const horizontal = Math.max(0.001, Math.hypot(dx, dz));
      const climbSlope = (-this.launchHeight + Math.PI * PLAYER_ARROW_ARC_HEIGHT * Math.cos(t * Math.PI)) / horizontal;
      const MAX_PITCH_EARLY = 0.2; // ~11 degres
      const MAX_PITCH_LANDING = 1.1; // ~63 degres
      const maxPitch = lerp(MAX_PITCH_EARLY, MAX_PITCH_LANDING, t);
      const pitch = clamp(Math.atan(climbSlope), -maxPitch, maxPitch);
      mesh.rotation.set(0, yaw, 0);
      // Correctif (2026-08-10, Antoine : "il faut que ce soit l'autre
      // extremite de la fleche qui se plante le sol (par l'avant)") :
      // rotateX(-pitch) faisait pencher la POINTE (l'avant, local z=-0.5,
      // voir buildArrow) vers le HAUT pendant la plongee — c'est
      // l'empennage (l'arriere) qui touchait le sol en premier, l'inverse
      // de ce qui est vise. Sans la negation, un pitch negatif (plongee, en
      // fin de vol) penche la pointe vers le BAS comme attendu ; un pitch
      // positif (montee, en debut de vol) la penche vers le haut, toujours
      // coherent avec l'ancien rendu (change de signe compense).
      mesh.rotateX(pitch);
    }
  }

  clear(): void {
    for (const mesh of this.flyingMeshesByFlight.values()) this.group.remove(mesh);
    this.flyingMeshesByFlight.clear();
    for (const mesh of this.stuckMeshes) this.group.remove(mesh);
    this.stuckMeshes.length = 0;
  }
}

const ARROW_MODEL_PATH = '/models/arrow/arrow_bow.obj';

/**
 * Modele de fleche fourni par Antoine (2026-08-14, remplace le modele
 * procedural en boites precedent — "ici tu trouvera un modele pour mettre
 * à jour le projectile de la baliste, remplace l'ancien par celui ci") : un
 * seul .obj ("Adventurers 2.0 Accessories Export", Blender), SANS .mtl
 * fourni — meme situation deja rencontree pour l'ancienne baliste .obj
 * (voir render/ballista.ts, historique) : un materiau neutre est applique a
 * la main plutot que de tenter de charger un fichier absent. Le modele n'a
 * qu'UNE SEULE zone de materiau (`usemtl ranger` unique pour tout le
 * maillage, verifie par lecture directe du fichier) — impossible de
 * recolorer pointe/empennage/bois separement via 3 materiaux (aurait
 * demande de decouper la geometrie en groupes de faces par zone). Colore a
 * la place PAR SOMMET (2026-08-14, demande d'Antoine : "l'empennage doit
 * etre bleu, la pointe grise et le bois au milieu marron clair") — voir
 * applyArrowZoneColors : chaque sommet est classe par sa coordonnee Z LOCALE
 * (mesuree directement dans le fichier, voir plus bas) en pointe/bois/
 * empennage, un `color` BufferAttribute est ecrit une seule fois sur la
 * geometrie PARTAGEE (avant tout clonage), et le materiau bascule en
 * `vertexColors: true` — chaque instance clonee herite donc de la meme
 * coloration sans recalcul.
 *
 * Precharge UNE SEULE FOIS au demarrage (voir preloadPlayerArrowModel,
 * appele en parallele des autres precharges dans main.ts, meme motif que
 * preloadMageModel/preloadFantassinModel/preloadArcherModel) — buildArrow()
 * doit rester SYNCHRONE ensuite (appele au tout premier tick d'un nouveau
 * vol, dans sync() ci-dessus).
 *
 * Orientation — MESUREE directement dans le fichier (pas devinee, script
 * jetable avec un vrai OBJLoader, supprime apres usage) : la pointe (sommet
 * isole le plus eloigne, proche de "v 0.000006 -0.000000 0.619998") est au Z
 * le plus POSITIF (jusqu'a +0.620), l'empennage (les sommets les plus
 * larges) au Z le plus NEGATIF (jusqu'a -0.641) — l'INVERSE de la convention
 * deja etablie dans ce fichier et le reste du rendu (pointe a l'ancien
 * z=-0.5, donc "avant" = -Z local, voir UnitViews.computeFacing). Corrige
 * via un `facingFix` (rotation.y = π) pose sur un groupe ENFANT du modele,
 * JAMAIS sur `flyingMesh` lui-meme : sync() ci-dessus reecrit entierement sa
 * rotation chaque frame (`.rotation.set(0, yaw, 0)` puis `.rotateX(pitch)`),
 * exactement le meme piege deja documente pour le Mage/Fantassin/Archer
 * riggés.
 *
 * Echelle — mesuree aussi : longueur native ~1.2615 unite sur Z (pointe a
 * +0.620, aile d'empennage la plus reculee a -0.641), contre ~1.03 pour
 * l'ancien modele procedural (deja bien integre a l'echelle du jeu, jamais
 * critiquee par Antoine sur sa taille). ARROW_MODEL_SCALE recalibre sur
 * cette meme longueur (1.03 / 1.2615 ≈ 0.8165, arrondi a 0.82) plutot que de
 * garder l'echelle native au hasard — a ajuster si la fleche parait trop
 * grande/petite une fois vue en jeu (aucun acces visuel de mon cote).
 */
const ARROW_MODEL_SCALE = 0.82;

/** Seuils de zone (coordonnee Z LOCALE, avant mise a l'echelle) — MESURES
 *  directement dans le fichier (script jetable avec un vrai OBJLoader,
 *  supprime apres usage), pas devines : le fut cylindrique etroit (rayon
 *  ~0.026, meme rayon aux deux bouts) va d'un anneau a z≈-0.4605 (jonction
 *  avec l'empennage) a un anneau a z≈+0.4806 (jonction avec la pointe) — ce
 *  sont les DEUX bornes reelles du bois. Au-dela de +0.4806, la geometrie
 *  s'elargit franchement (anneau a z≈0.5013, rayon ~0.05-0.054) avant de
 *  finir en un seul sommet apex a z≈+0.620 : c'est la pointe. Au-dela de
 *  -0.4605 (en negatif), les ailerons de l'empennage s'ecartent largement
 *  (jusqu'a rayon ~0.09) entre z≈-0.52 et z≈-0.64.
 *  **Piege rencontre en verifiant ceci** : un premier seuil de pointe a 0.47
 *  (legerement EN DECA de l'anneau reel a 0.4806) classait ce dernier comme
 *  pointe au lieu de bois — la zone bois n'avait alors plus qu'UNE SEULE
 *  borne (le fut entier degradait continument du bois vers le gris de la
 *  pointe, sans section brune distincte). Corrige a 0.49 (strictement ENTRE
 *  les deux anneaux reels 0.4806 et 0.5013) — verifie en headless que la
 *  zone bois couvre alors bien tout l'espace entre ses deux vraies bornes
 *  (~0.94 de long, la plus grande des 3 zones). */
const ARROW_TIP_Z_THRESHOLD = 0.49;
const ARROW_FLETCHING_Z_THRESHOLD = -0.47;

/** Colore CHAQUE SOMMET de la geometrie selon sa zone (voir les seuils
 *  ci-dessus) — un seul BufferAttribute 'color' remplace toute notion de
 *  materiau par piece, compatible avec un modele a une seule zone de
 *  materiau (voir le commentaire de tete de fichier). Appele UNE SEULE FOIS
 *  au prechargement, sur la geometrie PARTAGEE avant tout clonage — chaque
 *  instance tiree ensuite (buildArrow) herite de la meme coloration sans
 *  recalcul. */
function applyArrowZoneColors(mesh: THREE.Mesh): void {
  const position = mesh.geometry.getAttribute('position');
  if (!position) return;
  const tip = new THREE.Color(COLORS.steel);
  const wood = new THREE.Color(COLORS.arrowWood);
  const fletching = new THREE.Color(COLORS.playerZone);
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const zoneColor = z > ARROW_TIP_Z_THRESHOLD ? tip : z < ARROW_FLETCHING_Z_THRESHOLD ? fletching : wood;
    colors[i * 3] = zoneColor.r;
    colors[i * 3 + 1] = zoneColor.g;
    colors[i * 3 + 2] = zoneColor.b;
  }
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

let arrowPrototype: THREE.Object3D | null = null;

/** A appeler UNE FOIS au demarrage (voir main.ts, Promise.all avec les
 *  autres precharges) — construit le materiau et met le modele a l'echelle
 *  UNE SEULE FOIS ; chaque tir clone ensuite ce prototype deja pret (voir
 *  buildArrow). Echoue silencieusement si le fichier est introuvable
 *  (`arrowPrototype` reste null, buildArrow() retourne alors un groupe vide
 *  plutot que de faire planter le jeu) — degradation propre, meme principe
 *  que le reste du rendu face a un asset manquant. */
export async function preloadPlayerArrowModel(): Promise<void> {
  try {
    const loader = new OBJLoader();
    const model = await loader.loadAsync(ARROW_MODEL_PATH);
    // vertexColors: true — la teinte finale vient du BufferAttribute 'color'
    // ecrit par applyArrowZoneColors, pas de `color` de base ici (le blanc
    // par defaut de MeshStandardMaterial laisse les couleurs de sommet
    // s'appliquer sans les teinter).
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      applyArrowZoneColors(mesh);
      mesh.material = material;
    });
    model.scale.setScalar(ARROW_MODEL_SCALE);
    arrowPrototype = model;
  } catch (err) {
    console.error('Impossible de charger le modele de fleche du joueur :', err);
  }
}

function buildArrow(): THREE.Group {
  const g = new THREE.Group();
  if (arrowPrototype) {
    const model = arrowPrototype.clone(true);
    model.rotation.y = Math.PI; // facingFix — voir commentaire ci-dessus.
    g.add(model);
  }
  return g;
}
