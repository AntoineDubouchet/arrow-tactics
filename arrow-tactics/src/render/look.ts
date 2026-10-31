import * as THREE from 'three';
import type { GroundSurfaceId } from './groundSurfaces';

/**
 * PRESETS DE LOOKDEV (`?look=`, passe du 2026-10-30, `stylized` retenu avec
 * `?groundLook=living`) :
 * jusqu'ou palette, materiaux et eclairage existants rapprochent le terrain
 * des modeles KayKit, sans nouvelle texture, sans shader, sans toucher a la
 * geometrie (Faceted+, Irregular), aux cartes ni au jeu. Purement visuel,
 * jamais enregistre.
 *
 * `baseline` (defaut) : le rendu actuel, AUCUN reglage applique (identique
 * par construction). Les autres ne donnent que des ecarts a ce rendu :
 * intensites des lumieres de render/renderer.ts (couleurs et directions
 * inchangees), fond, et multiplicateurs (lineaires) des surfaces du sol, en
 * plus de GROUND_SURFACES[id].color. Seules les surfaces de l'arene ronde et
 * les flancs sont reglees ; les autres textures du lot restent telles
 * quelles.
 *
 * Multiplicateurs calibres a la camera de jeu (arene ronde, cadrage
 * d'Espace) pour des couleurs percues visees : herbe plus claire et plus
 * chaude, terre nettement plus claire que l'herbe (valeur, pas seulement
 * teinte), flancs brun-gris clair. Leurs grands facteurs sur le bleu viennent
 * des PNG de terre, presque sans bleu. Tone mapping essaye (Neutral, ACES) et
 * ecarte : ombres plus sombres, aucun gain sur le terrain.
 */
export type LookPreset = 'baseline' | 'stylized' | 'stylized-strong';
export const LOOK_PRESETS: readonly LookPreset[] = ['baseline', 'stylized', 'stylized-strong'];

type Rgb = readonly [number, number, number];

export interface LookSettings {
  /** Intensites des lumieres (absent : celle de render/renderer.ts). */
  hemisphereIntensity?: number;
  sunIntensity?: number;
  fillIntensity?: number;
  /** scene.backgroundIntensity de l'image de fond. */
  backgroundIntensity?: number;
  /** Voile uni devant l'image de fond, jamais devant le plateau. */
  backgroundVeil?: { color: number; opacity: number };
  /** Multiplicateurs par surface du sol (absent : [1, 1, 1]). */
  surfaceTints?: Partial<Record<GroundSurfaceId, Rgb>>;
}

export const LOOK_SETTINGS: Readonly<Record<LookPreset, LookSettings>> = {
  baseline: {},
  // Ambiance 1 -> 0,6, soleil 1,7 -> 2,1, remplissage inchange : plus d'ecart
  // entre faces eclairees et faces a l'ombre, meme eclairement d'un sol plat.
  stylized: {
    hemisphereIntensity: 0.6,
    sunIntensity: 2.1,
    backgroundIntensity: 0.8,
    surfaceTints: {
      grass: [3.09, 2.26, 2.08],
      'herbe-classique': [1.98, 1.93, 1.91],
      'herbe-dense': [2.22, 2.03, 2.12],
      'terre-battue': [3.55, 4.55, 6.5],
      flank: [4.66, 8.42, 24.81],
      // Catalogue elargi (2026-10-31) : textures dessinees a leur couleur ; seul
      // l'eclairement d'un sol plat (environ x 1,36) est compense.
      sable: [0.69, 0.67, 0.64],
      'roche-sol': [1.1, 1.04, 0.96],
      'sol-volcanique': [1.38, 1.4, 1.36],
    },
  },
  // Plus loin dans la meme direction : ambiance 0,35, soleil 2,6, remplissage
  // 0,45 -> 0,55 (les faces a l'ombre gardent un modele), fond voile.
  'stylized-strong': {
    hemisphereIntensity: 0.35,
    sunIntensity: 2.6,
    fillIntensity: 0.55,
    backgroundIntensity: 0.75,
    backgroundVeil: { color: 0x56636b, opacity: 0.3 },
    surfaceTints: {
      grass: [3.0, 2.36, 2.0],
      'herbe-classique': [1.83, 1.89, 1.74],
      'herbe-dense': [2.03, 2.06, 1.97],
      'terre-battue': [3.52, 4.79, 7.27],
      flank: [4.91, 9.35, 29.7],
      sable: [0.69, 0.67, 0.64],
      'roche-sol': [1.1, 1.04, 0.96],
      'sol-volcanique': [1.38, 1.4, 1.36],
    },
  },
};

let look: LookPreset = 'baseline';

/** Preset applique aux plateaux construits ensuite (main.ts : `?look=`). */
export function setLookPreset(next: LookPreset): void {
  look = next;
}

export function lookSettings(): LookSettings {
  return LOOK_SETTINGS[look];
}

/** Multiplicateur du preset courant pour une surface du sol. */
export function lookSurfaceTint(id: GroundSurfaceId): Rgb {
  return LOOK_SETTINGS[look].surfaceTints?.[id] ?? [1, 1, 1];
}

/** Voile du fond : quad plein ecran pose au fond du champ de la camera,
 *  teste en profondeur — il ne couvre que les pixels ou rien n'a ete dessine
 *  (l'image de fond), jamais le plateau ni les unites. Suit la camera a
 *  chaque image ; jamais touche par un lancer de rayons. */
export function createBackgroundVeil(veil: { color: number; opacity: number }): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ color: veil.color, transparent: true, opacity: veil.opacity, depthWrite: false }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.raycast = () => {};
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    mesh.position
      .copy(camera.position)
      .addScaledVector(forward, camera.far * 0.98)
      .addScaledVector(right, (camera.left + camera.right) / 2)
      .addScaledVector(up, (camera.top + camera.bottom) / 2);
    mesh.quaternion.copy(camera.quaternion);
    mesh.scale.set(((camera.right - camera.left) / 2) * 1.02, ((camera.top - camera.bottom) / 2) * 1.02, 1);
    mesh.updateMatrixWorld();
  };
  return mesh;
}
