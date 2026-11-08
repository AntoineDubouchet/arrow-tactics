import * as THREE from 'three';
import type { MapDef } from '../config/mapDef';

/**
 * GROUND MIST OFFICIELLE (2026-11-07, Graphic Lab « ancrage et lumiere » clos, DESIGN_DECISIONS.md
 * A5 ; prototype des nappes 2026-11-06) : une brume basse, irreguliere et tres douce, qui derive
 * tres lentement au ras du terrain. Rien a voir avec la brume de distance (THREE.Fog, render/look.ts),
 * qui reste en place, ni avec le brouillard de guerre (render/fogOfWar.ts), qui s'applique par-dessus
 * en lisant la profondeur du sol : la brume ne revele jamais une case.
 *
 * Technique (« soft intersection ») : aucun plan. Ce module ne tient que la DEFINITION des nappes :
 * des uniforms partages (mistShared) et des fonctions GLSL (MIST_GLSL) que chaque materiau eclaire du
 * monde recoit par render/contactMap.ts (applyContactShading) et evalue au fragment, selon sa hauteur
 * au-dessus du sol : un pieu, un tronc ou un socle se fond progressivement dans la nappe au lieu
 * d'etre coupe par une ligne. Deux couches (basse et plus haute, plus faible) donnent un peu
 * d'epaisseur ; l'alpha vient de trois bruits de valeur a basse frequence (grande forme, forme
 * moyenne, leger bruit qui casse les contours), seuilles en douceur. Aucune texture, aucune
 * particule, aucun draw call propre. Jamais d'ombre, jamais de pointage, jamais enregistre.
 *
 * Modes (`?groundMist=`, lu a l'import du module : des materiaux partages sont crees avant main.ts
 * et leur programme depend du mode) : `fog` (DEFAUT, rendu officiel) | `off` (aucun voile, pour
 * comparer) | `on` (densite uniforme, sans lecture du brouillard) | `strong` (limites). Purement
 * visuel. Valeurs PROVISOIRES.
 *
 * Mode `fog` : le shader lit la grille du brouillard de guerre (FogOfWar.texture, la meme que la
 * passe plein ecran, via setFogOfWar) et module l'alpha par case : zone VISIBLE, voile discret (le
 * camp reste lisible) ; zone EXPLOREE hors vision, nappes denses et larges avec un leger bruit
 * mouvant en plus (monde plus froid, humide) ; zone INEXPLOREE, rien du tout (la passe la noircit de
 * toute facon). Lecture seule de la grille : aucune visibilite modifiee, rien revele. Transition
 * adoucie par cinq lectures de la grille (environ deux cases). Sans brouillard actif (editeur, test
 * de scenario), `fog` se comporte comme `on`.
 *
 * Lumiere dans la brume (setMistLights) : jusqu'a quatre sources (feux des camps, render/campViews.ts ;
 * sources chaudes du camp, render/warmLights.ts), les plus proches du point vise, rechauffent et
 * eclaircissent localement le voile. Plafond de 4 conserve a dessein (A5).
 *
 * Cout (passe d'optimisation 2026-11-07, image inchangee) : les uniforms sont des valeurs simples
 * (vec4, vec2, mat4), jamais des tableaux de vecteurs — three.js met en cache les premieres et
 * n'envoie que ce qui change, alors qu'il renvoie un tableau a chaque changement de materiau (des
 * centaines par image). Les quatre sources tiennent dans deux mat4 (une colonne par source). Dans le
 * shader, les sorties anticipees sont EXACTES (le resultat aurait ete 0) : voir contactMap.ts.
 */
export type GroundMistMode = 'off' | 'on' | 'strong' | 'fog';
export const GROUND_MIST_MODES: readonly GroundMistMode[] = ['off', 'on', 'strong', 'fog'];

const urlMode = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('groundMist') : null;
const mode: GroundMistMode = GROUND_MIST_MODES.find((m) => m === urlMode) ?? 'fog';

export function groundMistMode(): GroundMistMode {
  return mode;
}

/** Grille du brouillard de guerre telle que la lit le shader : texture (0 inexplore, 128 explore,
 *  255 visible) et rectangle monde (coin minX/minZ, taille en cases), comme FogOfWarPass. */
export interface GroundMistFogGrid {
  readonly texture: THREE.Texture;
  readonly minX: number;
  readonly minZ: number;
  readonly width: number;
  readonly height: number;
}

/** Couleur des nappes (gris-vert froid, un peu bleute, jamais blanc) : proche de la brume
 *  `atmospheric` (#9db2a8), legerement plus claire. */
const MIST_COLOR = 0xa8bdb9;

interface LayerSettings {
  /** Hauteur de reference au-dessus du terrain (unites monde) : regle le profil du voile. */
  lift: number;
  /** Alpha maximal au coeur des nappes les plus denses. */
  strength: number;
  /** Taille (cases) de la grande forme du bruit. */
  scale: number;
  /** Seuils du fondu (bruit combine 0..1) : en dessous rien, au-dessus plein. */
  low: number;
  high: number;
  /** Decalage du bruit (cases) : deux couches jamais superposees. */
  offset: readonly [number, number];
  /** Derive (cases par seconde) : tres lente. */
  drift: readonly [number, number];
}

const LAYERS: readonly LayerSettings[] = [
  { lift: 0.32, strength: 0.3, scale: 17, low: 0.5, high: 0.75, offset: [0, 0], drift: [0.05, 0.028] },
  { lift: 0.7, strength: 0.12, scale: 23, low: 0.53, high: 0.8, offset: [137, 61], drift: [-0.034, 0.046] },
];

/** `strong` : nappes plus denses et plus larges, uniquement pour voir les limites. */
const STRONG = { strength: 1.9, low: -0.1 };

/** `fog` : gain d'alpha en zone visible (0,35 -> 0,50 le 2026-11-07, finalisation : un peu plus de
 *  brume dans la cour et autour des objets, sans transformer le camp en brouillard), gain et
 *  decalage du seuil bas en zone exploree hors vision (proche de `strong`), poids du bruit mouvant
 *  ajoute en zone exploree. PROVISOIRE. */
const FOG = { visibleGain: 0.5, exploredGain: 1.3, exploredLow: -0.06, exploredLive: 0.1 };

/** Lumieres dans la brume : part de la teinte de la source au coeur de son rayon, et supplement
 *  d'alpha (la brume eclairee parait plus dense). Plafond de sources envoyees au shader. PROVISOIRE. */
const MIST_LIGHT = { tint: 0.8, alphaBoost: 0.8, maxLights: 4 };

const zeroMatrix = (): THREE.Matrix4 => new THREE.Matrix4().fromArray(new Array<number>(16).fill(0));

/** Uniforms PARTAGES par tous les materiaux voiles (contactMap.ts) : un seul objet par uniform, tout
 *  le monde voit la meme valeur. Remplis par setActiveGroundMist, setFogOfWar et setMistLights.
 *  Jamais de tableau de vecteurs (voir l'en-tete, cout). */
export const mistShared = {
  uTime: { value: 0 },
  tFog: { value: null as THREE.Texture | null },
  fogRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uFogOn: { value: 0 },
  uVisibleGain: { value: 1 },
  uExploredGain: { value: FOG.exploredGain },
  uExploredLow: { value: FOG.exploredLow },
  uExploredLive: { value: FOG.exploredLive },
  uMistColor: { value: new THREE.Color(MIST_COLOR) },
  /** Couche basse / haute : scale, low, high, strength (strength 0 : aucun voile). */
  uMistP0: { value: new THREE.Vector4(1, 0, 1, 0) },
  uMistP1: { value: new THREE.Vector4(1, 0, 1, 0) },
  /** Couche basse / haute : offset.xy, drift.xy. */
  uMistOD0: { value: new THREE.Vector4() },
  uMistOD1: { value: new THREE.Vector4() },
  /** Lift des deux couches. */
  uMistLift: { value: new THREE.Vector2(LAYERS[0]!.lift, LAYERS[1]!.lift) },
  /** Sources, une colonne chacune : x, y, z, rayon (0 = aucune). */
  uMistLightPos: { value: zeroMatrix() },
  /** Sources, une colonne chacune : couleur x intensite relative, 0. */
  uMistLightCol: { value: zeroMatrix() },
  uMistTint: { value: MIST_LIGHT.tint },
  uMistAlphaBoost: { value: MIST_LIGHT.alphaBoost },
};

/** Declarations et fonctions GLSL des nappes (fragment), a inclure apres `#include <common>`. */
export const MIST_GLSL = /* glsl */ `
uniform float uTime;
uniform sampler2D tFog;
uniform vec4 fogRect;
uniform float uFogOn;
uniform float uVisibleGain;
uniform float uExploredGain;
uniform float uExploredLow;
uniform float uExploredLive;
uniform vec3 uMistColor;
uniform vec4 uMistP0;
uniform vec4 uMistP1;
uniform vec4 uMistOD0;
uniform vec4 uMistOD1;
uniform vec2 uMistLift;
uniform mat4 uMistLightPos;
uniform mat4 uMistLightCol;
uniform float uMistTint;
uniform float uMistAlphaBoost;

float mistHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// Bruit de valeur lisse, sans periode visible.
float mistNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), f.x), mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Etat de la case (0 inexplore, 0.5 explore, 1 visible), lu en cinq points (centre et une case
// dans chaque direction) : transition sur deux cases environ au lieu d'une.
float mistFogSeen(vec2 world) {
  if (uFogOn < 0.5) return 1.0;
  vec2 uv = (world - fogRect.xy) / fogRect.zw;
  vec2 d = 1.0 / fogRect.zw;
  float s = texture2D(tFog, uv).r * 2.0;
  s += texture2D(tFog, uv + vec2(d.x, 0.0)).r + texture2D(tFog, uv - vec2(d.x, 0.0)).r;
  s += texture2D(tFog, uv + vec2(0.0, d.y)).r + texture2D(tFog, uv - vec2(0.0, d.y)).r;
  bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  return inside ? s / 6.0 : 0.0;
}
// Alpha d'une couche au sol (sans profil de hauteur ni fondu de bord), etat de brouillard compris
// (vis : part visible, explored : part exploree hors vision, known : part connue). Bruits du moins
// cher au plus cher, avec deux sorties anticipees EXACTES : apres la grande forme, si les autres
// bruits (chacun dans [0, 1]) ne peuvent plus faire passer le seuil bas, l'alpha vaut 0 ; le bruit
// mouvant n'est calcule que la ou la zone exploree pese (ailleurs son terme vaut exactement 0).
float mistLayerAlpha(vec4 P, vec4 OD, vec2 world, float vis, float explored, float known) {
  float inv = 1.0 / P.x;
  vec2 p = world + OD.xy + OD.zw * uTime;
  // Grande forme (nappes et trous), forme moyenne (bandes), leger bruit qui casse les contours.
  float big = mistNoise(p * inv);
  float low = mix(P.y + uExploredLow, P.y, vis);
  if (big * 0.65 + 0.35 + explored * uExploredLive * 0.5 <= low) return 0.0;
  float mid = mistNoise(p * (inv / 0.36) + vec2(7.3, 2.1) + OD.wz * uTime * (0.4 * inv / 0.36));
  float fine = mistNoise(p * (inv / 0.12) + vec2(19.1, 11.7));
  float n = big * 0.65 + mid * 0.25 + fine * 0.1;
  if (explored > 0.0) {
    // Zone exploree : un bruit moyen qui derive plus vite, pour une nappe un peu vivante.
    float live = mistNoise((world + OD.xy * 0.5 + OD.wz * uTime * 4.0) * (inv / 0.3));
    n += explored * uExploredLive * (live - 0.5);
  }
  float gain = mix(uExploredGain, uVisibleGain, vis) * known;
  return smoothstep(low, P.z, n) * P.w * gain;
}
// Sources chaudes dans la brume : couleur de la nappe et facteur d'alpha au point (x, z).
vec3 mistLitColor(vec2 world, inout float alpha) {
  float warm = 0.0;
  vec3 warmColor = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 L = uMistLightPos[i];
    if (L.w <= 0.0) continue;
    float w = 1.0 - smoothstep(0.0, L.w, distance(world, L.xz));
    w *= w;
    warm += w;
    warmColor += uMistLightCol[i].rgb * w;
  }
  if (warm <= 0.0) return uMistColor;
  float t = clamp(warm, 0.0, 1.0);
  alpha *= 1.0 + uMistAlphaBoost * t;
  return mix(uMistColor, warmColor / warm, uMistTint * t);
}`;

/** Horloge cosmetique des nappes (rendu seulement, jamais la simulation) : avancee chaque frame par
 *  main.ts (updateFogOfWar). */
export function tickMistClock(): void {
  mistShared.uTime.value = (performance.now() / 1000) % 100000;
}

/** Configuration des nappes d'un plateau (mode et decalage du bruit propre a la graine). Ecrite dans
 *  les uniforms partages par setActiveGroundMist (plateau en cours). */
export class GroundMist {
  private readonly fogMode: boolean;
  private readonly params: THREE.Vector4[] = [];
  private readonly offsets: THREE.Vector4[] = [];
  private readonly visibleGain: number;

  constructor(map: MapDef, mode: Exclude<GroundMistMode, 'off'>) {
    this.fogMode = mode === 'fog';
    const strong = mode === 'strong';
    const seed = (map.generator?.seed ?? 0) >>> 0;
    const seedOffset: [number, number] = [(seed % 977) * 1.37, ((seed >>> 8) % 991) * 0.91];
    for (const layer of LAYERS) {
      this.params.push(new THREE.Vector4(layer.scale, layer.low + (strong ? STRONG.low : 0), layer.high, layer.strength * (strong ? STRONG.strength : 1)));
      this.offsets.push(new THREE.Vector4(layer.offset[0] + seedOffset[0], layer.offset[1] + seedOffset[1], layer.drift[0], layer.drift[1]));
    }
    this.visibleGain = this.fogMode ? FOG.visibleGain : 1;
  }

  /** Ecrit sa configuration dans les uniforms partages. */
  activate(): void {
    mistShared.uMistP0.value.copy(this.params[0]!);
    mistShared.uMistP1.value.copy(this.params[1]!);
    mistShared.uMistOD0.value.copy(this.offsets[0]!);
    mistShared.uMistOD1.value.copy(this.offsets[1]!);
    mistShared.uVisibleGain.value = this.visibleGain;
    mistShared.tFog.value = null;
    mistShared.uFogOn.value = 0;
  }

  /** Mode `fog` : grille du brouillard de guerre a lire (null : brouillard inactif, tout visible).
   *  Appel chaque frame, gratuit. Sans effet dans les autres modes. */
  setFogOfWar(fog: GroundMistFogGrid | null): void {
    if (!this.fogMode) return;
    mistShared.tFog.value = fog ? fog.texture : null;
    mistShared.uFogOn.value = fog ? 1 : 0;
    if (fog) mistShared.fogRect.value.set(fog.minX, fog.minZ, fog.width, fog.height);
  }
}

/** Nappes du plateau en cours lues par les materiaux, ou null (aucun voile : `off`, plateau sans
 *  touffes, editeur). Appele par createBoard et au retour d'un test de scenario (main.ts). */
export function setActiveGroundMist(mist: GroundMist | null): void {
  if (mist) {
    mist.activate();
    return;
  }
  mistShared.uMistP0.value.set(1, 0, 1, 0);
  mistShared.uMistP1.value.set(1, 0, 1, 0);
  mistShared.tFog.value = null;
  mistShared.uFogOn.value = 0;
}

/** Source pouvant eclairer la brume : position, rayon, couleur et intensite relative (0..1). */
export interface MistLightSource {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: THREE.Color;
  level: number;
}

/** Les quatre sources les plus proches du point vise par la camera, chaque frame (main.ts) : une
 *  colonne par source dans les deux mat4 partagees. */
export function setMistLights(sources: readonly MistLightSource[], nearX: number, nearZ: number): void {
  const picked = sources
    .filter((s) => s.level > 0)
    .map((s) => ({ s, d: Math.hypot(s.x - nearX, s.z - nearZ) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MIST_LIGHT.maxLights);
  const pos = mistShared.uMistLightPos.value.elements;
  const col = mistShared.uMistLightCol.value.elements;
  for (let i = 0; i < MIST_LIGHT.maxLights; i++) {
    const p = picked[i];
    const o = i * 4;
    if (p) {
      pos[o] = p.s.x; pos[o + 1] = p.s.y; pos[o + 2] = p.s.z; pos[o + 3] = p.s.radius;
      col[o] = p.s.color.r * p.s.level; col[o + 1] = p.s.color.g * p.s.level; col[o + 2] = p.s.color.b * p.s.level; col[o + 3] = 0;
    } else {
      pos[o] = 0; pos[o + 1] = 0; pos[o + 2] = 0; pos[o + 3] = 0;
      col[o] = 0; col[o + 1] = 0; col[o + 2] = 0; col[o + 3] = 0;
    }
  }
}
