import * as THREE from 'three';
import { obstacleBounds, obstacleCenter, type ObstacleDef } from '../config/constants';
import { cellKey, computeMapCellBounds, type TerrainCellDef } from '../config/mapDef';
import type { TerrainHeightField } from '../config/terrainElevation';
import type { OrientedBox } from '../core/orientedBox';
import { hillHeightAt } from './hillShape';
import { groundMistMode, MIST_GLSL, mistShared } from './groundMist';

/**
 * CARTE DE CONTACT (rendu officiel 2026-11-07, Graphic Lab « ancrage et lumiere » clos,
 * DESIGN_DECISIONS.md A5 : contact map plutot que SSAO, faux soft intersection plutot que depth
 * prepass).
 *
 * Une seule texture en espace monde (4 texels par case) qui porte, par texel :
 * - R : ombre de contact (1 = rien, plus bas = plus sombre), tamponnee en douceur autour des
 *   arbres, rochers, props, batiments, pieces de palissade et tas de ressources (disques accumules,
 *   ellipses, rectangles a bord rentre et capsules en union : voir ContactStamp) ;
 * - G : hauteur du sol affiche (render/hillShape.ts), pour savoir a quelle hauteur au-dessus du sol
 *   est un fragment ;
 * - B : couverture de la carte (1 sur les cases existantes, 0 ailleurs), fondu de bord.
 *
 * Les materiaux eclaires du monde (sol, touffes, obstacles et decors instancies, palissades,
 * batiments, tas, coffres, or, eau, lisieres) recoivent un meme morceau de shader
 * (applyContactShading) qui lit cette texture a la position monde du fragment :
 * - ombre de contact : la couleur est assombrie par R, de toute sa force au sol, plus du tout au-dela
 *   de CONTACT_HEIGHT au-dessus du sol : le sol se creuse au pied des objets ET le bas des objets
 *   s'assombrit (ancrage), sans halo noir ni contour. Toujours active ;
 * - voile de brume (sauf `?groundMist=off`) : les nappes de render/groundMist.ts (memes uniforms,
 *   meme GLSL) sont appliquees au fragment lui-meme selon sa hauteur au-dessus du sol : un tronc ou
 *   un pieu se fond progressivement dans la nappe au lieu d'etre coupe par un plan.
 *
 * Statique (carte) + dynamique (batiments poses, tas) : refresh() re-tamponne les empreintes
 * dynamiques sur la base statique quand main.ts le demande. Jamais lu par la simulation. Les UNITES
 * ne recoivent jamais l'ombre de contact (silhouettes d'abord) et ne sont voilees que sur leurs 30
 * premiers centimetres, a demi-force. Valeurs PROVISOIRES.
 */
const RES = 4;
/** Hauteur (monde) au-dela de laquelle l'ombre de contact ne touche plus un objet. */
const CONTACT_HEIGHT = 0.8;
/** Force globale de l'ombre de contact (1 = celle de la texture). */
const CONTACT_STRENGTH = 1;
/** Plancher de l'assombrissement cumule (plusieurs empreintes). */
const AO_FLOOR = 0.4;

/**
 * Formes des empreintes (2026-11-08, correctif « empreintes rectangulaires » : avant, rochers,
 * structures et pieces de mur recevaient la boite ENGLOBANTE de leur emprise, pleine force jusqu'au
 * bord puis un fondu large ; sur le terrain on lisait des carres sous les rochers, des bandes et des
 * carres sous la palissade, plus sombres a chaque jonction). Deux familles :
 * - `disc` (arbres, props, tas) : ACCUMULATION, plusieurs empreintes s'assombrissent entre elles
 *   (sous-bois) ;
 * - `ellipse` (rochers), `box` (batiments, structures : rectangle oriente, pleine force seulement a
 *   `inset` du bord, fondu `feather` au-dela, coins arrondis) et `capsule` (pieces de mur : le
 *   segment reel, `halfWidth` plein puis fondu) : UNION, c'est le maximum qui compte, jamais une
 *   somme ; deux pieces jointives ou un mur contre un socle ne foncent pas a la jonction.
 */
export type ContactStamp =
  | { kind: 'disc'; x: number; z: number; inner: number; outer: number; strength: number }
  /** Rayons de l'ellipse ; `inner` et `outer` en fraction du rayon (1 = bord de l'emprise). */
  | { kind: 'ellipse'; x: number; z: number; rx: number; rz: number; inner: number; outer: number; strength: number }
  | { kind: 'box'; box: OrientedBox; inset: number; feather: number; strength: number }
  | { kind: 'capsule'; ax: number; az: number; bx: number; bz: number; halfWidth: number; feather: number; strength: number };

/** Empreintes de contact des obstacles d'une carte (arbres, rochers, props, structures). */
export function obstacleStamps(obstacles: readonly ObstacleDef[]): ContactStamp[] {
  const out: ContactStamp[] = [];
  for (const o of obstacles) {
    const c = obstacleCenter(o);
    const scale = o.scale ?? 1;
    // Forces validees le 2026-11-07 (A5 ; reduites en fin de lab pour le contraste Heros/Villageois
    // au camp : arbres 0,65 -> 0,52, props 0,5 -> 0,42, rochers 0,55 -> 0,48, structures 0,6 -> 0,48).
    // Ne pas renforcer. Formes revues le 2026-11-08 (voir ContactStamp), forces inchangees.
    if (o.kind === 'tree') out.push({ kind: 'disc', x: c.x, z: c.z, inner: 0.3 * scale, outer: 1.5 * scale, strength: 0.52 });
    else if (o.kind === 'prop') out.push({ kind: 'disc', x: c.x, z: c.z, inner: 0.3 * scale, outer: 1 * scale, strength: 0.42 });
    else if (o.kind === 'rock') {
      // Rocher : le modele remplit son emprise (render/rocks.ts, obstacleFactory) ; ombre ovale
      // pleine au coeur, eteinte juste au-dela du bord de l'emprise.
      const b = obstacleBounds(o);
      out.push({ kind: 'ellipse', x: c.x, z: c.z, rx: (b.maxX - b.minX) / 2, rz: (b.maxZ - b.minZ) / 2, inner: 0.45, outer: 1.15, strength: 0.48 });
    } else out.push(boxStamp(o, BUILDING_INSET, BUILDING_FEATHER, 0.48));
  }
  return out;
}

/** Rectangle des batiments et structures : pleine force jusqu'a `inset` en dedans du bord de
 *  l'emprise, fondu sur `feather` au-dela (l'ombre reste collee au socle, coins arrondis). */
export const BUILDING_INSET = 0.4;
export const BUILDING_FEATHER = 0.45;
/** Capsule des pieces de mur : pleine force sur la demi-epaisseur de la ligne, fondu au-dela. */
export const WALL_FEATHER = 0.5;

/** Empreinte rectangulaire (orientee si l'obstacle en a une) : voir ContactStamp `box`. */
export function boxStamp(o: ObstacleDef, inset: number, feather: number, strength: number): ContactStamp {
  if (o.footprint) return { kind: 'box', box: o.footprint, inset, feather, strength };
  const b = obstacleBounds(o);
  return { kind: 'box', box: { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, halfW: (b.maxX - b.minX) / 2, halfD: (b.maxZ - b.minZ) / 2, cos: 1, sin: 0 }, inset, feather, strength };
}

/** Distance d'un point au segment AB. */
function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Empreinte d'une piece de mur (segment ou porte) : capsule sur son segment reel. */
export function wallStamp(line: { ax: number; az: number; bx: number; bz: number; halfWidth: number }, strength: number): ContactStamp {
  return { kind: 'capsule', ax: line.ax, az: line.az, bx: line.bx, bz: line.bz, halfWidth: line.halfWidth, feather: WALL_FEATHER, strength };
}

export class ContactMap {
  readonly texture: THREE.DataTexture;
  /** minX, minZ, largeur, hauteur (monde). */
  readonly rect = new THREE.Vector4();
  private readonly cols: number;
  private readonly rows: number;
  private readonly minX: number;
  private readonly minZ: number;
  /** Couche statique (carte) : accumulation des disques (facteur, 1 = rien) et union des formes
   *  de structures (assombrissement, 0 = rien). */
  private readonly staticAcc: Float32Array;
  private readonly staticUni: Float32Array;
  private readonly data: Uint8Array;

  constructor(cells: readonly TerrainCellDef[], field: TerrainHeightField, obstacles: readonly ObstacleDef[]) {
    const bounds = computeMapCellBounds([...cells]);
    this.minX = bounds.minX - 1;
    this.minZ = bounds.minZ - 1;
    const w = bounds.maxX - bounds.minX + 3;
    const h = bounds.maxZ - bounds.minZ + 3;
    this.cols = w * RES;
    this.rows = h * RES;
    this.rect.set(this.minX, this.minZ, w, h);
    this.staticAcc = new Float32Array(this.cols * this.rows).fill(1);
    this.staticUni = new Float32Array(this.cols * this.rows);
    this.data = new Uint8Array(this.cols * this.rows * 4);
    const present = new Set(cells.map((c) => cellKey(c.x, c.z)));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.minX + (c + 0.5) / RES;
        const z = this.minZ + (r + 0.5) / RES;
        const i = (r * this.cols + c) * 4;
        const cx = Math.floor(x);
        const cz = Math.floor(z);
        const inside = present.has(cellKey(cx, cz));
        // Couverture : 1 au coeur, 0.5 sur une case de bord (voisine manquante), 0 dehors.
        let cover = 0;
        if (inside) {
          cover = 1;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!present.has(cellKey(cx + dx, cz + dz))) cover = 0.5;
        }
        this.data[i + 1] = Math.round(THREE.MathUtils.clamp((inside ? hillHeightAt(field, x, z) : 0) / 10, 0, 1) * 255);
        this.data[i + 2] = Math.round(cover * 255);
        this.data[i + 3] = 255;
      }
    }
    this.stamp(this.staticAcc, this.staticUni, obstacleStamps(obstacles));
    this.texture = new THREE.DataTexture(this.data, this.cols, this.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.refresh([]);
  }

  /** Empreintes dynamiques (batiments poses, pieces de palissade, tas) par-dessus la base statique :
   *  ombre finale = accumulation des disques x (1 - union des structures), plancher AO_FLOOR. */
  refresh(dynamic: readonly ContactStamp[]): void {
    const acc = Float32Array.from(this.staticAcc);
    const uni = Float32Array.from(this.staticUni);
    this.stamp(acc, uni, dynamic);
    for (let i = 0; i < acc.length; i++) this.data[i * 4] = Math.round(Math.max(AO_FLOOR, acc[i]! * (1 - uni[i]!)) * 255);
    this.texture.needsUpdate = true;
  }

  private stamp(acc: Float32Array, uni: Float32Array, stamps: readonly ContactStamp[]): void {
    const smooth = THREE.MathUtils.smoothstep;
    for (const s of stamps) {
      let minX: number, maxX: number, minZ: number, maxZ: number;
      if (s.kind === 'disc') {
        minX = s.x - s.outer; maxX = s.x + s.outer; minZ = s.z - s.outer; maxZ = s.z + s.outer;
      } else if (s.kind === 'ellipse') {
        minX = s.x - s.rx * s.outer; maxX = s.x + s.rx * s.outer; minZ = s.z - s.rz * s.outer; maxZ = s.z + s.rz * s.outer;
      } else if (s.kind === 'box') {
        const reach = Math.hypot(s.box.halfW, s.box.halfD) + s.feather;
        minX = s.box.x - reach; maxX = s.box.x + reach; minZ = s.box.z - reach; maxZ = s.box.z + reach;
      } else {
        const reach = s.halfWidth + s.feather;
        minX = Math.min(s.ax, s.bx) - reach; maxX = Math.max(s.ax, s.bx) + reach; minZ = Math.min(s.az, s.bz) - reach; maxZ = Math.max(s.az, s.bz) + reach;
      }
      const c0 = Math.max(0, Math.floor((minX - this.minX) * RES));
      const c1 = Math.min(this.cols - 1, Math.ceil((maxX - this.minX) * RES));
      const r0 = Math.max(0, Math.floor((minZ - this.minZ) * RES));
      const r1 = Math.min(this.rows - 1, Math.ceil((maxZ - this.minZ) * RES));
      for (let r = r0; r <= r1; r++) {
        const z = this.minZ + (r + 0.5) / RES;
        for (let c = c0; c <= c1; c++) {
          const x = this.minX + (c + 0.5) / RES;
          const i = r * this.cols + c;
          if (s.kind === 'disc') {
            const a = 1 - smooth(Math.hypot(x - s.x, z - s.z), s.inner, s.outer);
            if (a > 0) acc[i] = acc[i]! * (1 - s.strength * a);
            continue;
          }
          let a: number;
          if (s.kind === 'ellipse') {
            a = 1 - smooth(Math.hypot((x - s.x) / s.rx, (z - s.z) / s.rz), s.inner, s.outer);
          } else if (s.kind === 'box') {
            // Distance signee au rectangle oriente : negative dedans (jusqu'au bord), euclidienne
            // dehors (coins arrondis) ; pleine force a -inset, nulle a +feather.
            const dx = x - s.box.x;
            const dz = z - s.box.z;
            const ax = Math.abs(dx * s.box.cos - dz * s.box.sin) - s.box.halfW;
            const az = Math.abs(dx * s.box.sin + dz * s.box.cos) - s.box.halfD;
            const sd = ax > 0 || az > 0 ? Math.hypot(Math.max(ax, 0), Math.max(az, 0)) : Math.max(ax, az);
            a = 1 - smooth(sd, -s.inset, s.feather);
          } else {
            a = 1 - smooth(distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz), s.halfWidth, s.halfWidth + s.feather);
          }
          if (a > 0) uni[i] = Math.max(uni[i]!, s.strength * a);
        }
      }
    }
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** Uniforms partages par tous les materiaux patches ; la carte active les remplit (setActiveContactMap). */
const contactUniforms = {
  uContactMap: { value: null as THREE.Texture | null },
  uContactRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uContactOn: { value: 0 },
  uContactHeight: { value: CONTACT_HEIGHT },
  uContactStrength: { value: CONTACT_STRENGTH },
};

/** Carte de contact lue par les materiaux (plateau en cours), ou null (rien : facteurs neutres). */
export function setActiveContactMap(map: ContactMap | null): void {
  contactUniforms.uContactMap.value = map ? map.texture : null;
  contactUniforms.uContactOn.value = map ? 1 : 0;
  if (map) contactUniforms.uContactRect.value.copy(map.rect);
}

const CONTACT_VERTEX_HEAD = /* glsl */ `
varying vec3 vContactWorld;`;

const CONTACT_VERTEX_BODY = /* glsl */ `
	{
		vec4 contactPos = vec4( transformed, 1.0 );
		#ifdef USE_INSTANCING
			contactPos = instanceMatrix * contactPos;
		#endif
		vContactWorld = ( modelMatrix * contactPos ).xyz;
	}`;

const CONTACT_FRAGMENT_HEAD = /* glsl */ `
varying vec3 vContactWorld;
uniform sampler2D uContactMap;
uniform vec4 uContactRect;
uniform float uContactOn;
uniform float uContactHeight;
uniform float uContactStrength;`;

/** Avant `#include <fog_fragment>` : AO de contact puis voile de brume, sur la couleur eclairee.
 *  Voile : du moins cher au plus cher, avec des sorties anticipees EXACTES (le resultat aurait ete 0) :
 *  1. couverture de la carte et profil vertical (ALU seulement) : un fragment hors carte, ou plus haut
 *     que les deux couches (cime, toit, haut d'un mur, torse d'une unite), ne lit ni la grille du
 *     brouillard ni les bruits ;
 *  2. etat du brouillard (cinq lectures) : une case inexploree n'a aucun voile ;
 *  3. bruits par couche (groundMist.ts, mistLayerAlpha, avec leurs propres sorties) ;
 *  4. sources chaudes seulement si le fragment recoit effectivement du voile. */
const CONTACT_FRAGMENT_BODY = /* glsl */ `
	if ( uContactOn > 0.5 ) {
		vec2 contactUv = ( vContactWorld.xz - uContactRect.xy ) / uContactRect.zw;
		vec4 contactData = texture2D( uContactMap, contactUv );
		float contactH = max( vContactWorld.y - contactData.g * 10.0, 0.0 );
		#ifdef CONTACT_AO
			float contactAo = 1.0 - ( 1.0 - contactData.r ) * uContactStrength * ( 1.0 - smoothstep( 0.0, uContactHeight, contactH ) );
			gl_FragColor.rgb *= contactAo;
		#endif
		#ifdef CONTACT_MIST
			#ifdef CONTACT_UNIT
				// Unites : seulement les 30 premiers centimetres, a demi-force (pieds absorbes, torse net).
				float mistProfile0 = ( 1.0 - smoothstep( 0.0, 0.3, contactH ) ) * 0.5;
				float mistProfile1 = mistProfile0;
			#else
				float mistProfile0 = 1.0 - smoothstep( uMistLift.x * 0.5, uMistLift.x * 2.2, contactH );
				float mistProfile1 = 1.0 - smoothstep( uMistLift.y * 0.5, uMistLift.y * 2.2, contactH );
			#endif
			float mistCover = smoothstep( 0.0, 1.0, contactData.b );
			float mistW0 = mistProfile0 * uMistP0.w;
			float mistW1 = mistProfile1 * uMistP1.w;
			if ( mistCover > 0.0 && ( mistW0 > 0.0 || mistW1 > 0.0 ) ) {
				float mistSeen = mistFogSeen( vContactWorld.xz );
				float mistKnown = clamp( mistSeen * 2.0, 0.0, 1.0 );
				if ( mistKnown > 0.0 ) {
					float mistVis = clamp( ( mistSeen - 0.5 ) * 2.0, 0.0, 1.0 );
					float mistExplored = ( 1.0 - mistVis ) * mistKnown;
					float mistA = 0.0;
					if ( mistW0 > 0.0 ) mistA = mistLayerAlpha( uMistP0, uMistOD0, vContactWorld.xz, mistVis, mistExplored, mistKnown ) * mistProfile0;
					if ( mistW1 > 0.0 ) {
						float mistA1 = mistLayerAlpha( uMistP1, uMistOD1, vContactWorld.xz, mistVis, mistExplored, mistKnown ) * mistProfile1;
						mistA = mistA + mistA1 - mistA * mistA1;
					}
					mistA *= mistCover;
					if ( mistA > 0.0 ) {
						vec3 mistColor = mistLitColor( vContactWorld.xz, mistA );
						gl_FragColor.rgb = mix( gl_FragColor.rgb, mistColor, clamp( mistA, 0.0, 1.0 ) );
					}
				}
			}
		#endif
	}`;

const patched = new WeakSet<THREE.Material>();

export interface ContactShadingOptions {
  /** Unite : jamais d'ombre de contact (silhouette intacte), voile `soft` sur les pieds seulement. */
  unit?: boolean;
}

/** Ajoute le morceau de contact a un materiau eclaire (Lambert, Phong, Standard), en conservant son
 *  eventuel onBeforeCompile : ombre de contact (sauf unites) et voile de brume (sauf
 *  `?groundMist=off`). Une seule fois par materiau. */
export function applyContactShading(material: THREE.Material, options: ContactShadingOptions = {}): void {
  const ao = !options.unit;
  const soft = groundMistMode() !== 'off';
  if ((!ao && !soft) || patched.has(material)) return;
  patched.add(material);
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  const prevText = prev ? prev.toString() : '';
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, contactUniforms, soft ? mistShared : {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${CONTACT_VERTEX_HEAD}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>${CONTACT_VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${ao ? '#define CONTACT_AO\n' : ''}${soft ? '#define CONTACT_MIST\n' : ''}${options.unit ? '#define CONTACT_UNIT\n' : ''}#include <common>${CONTACT_FRAGMENT_HEAD}${soft ? MIST_GLSL : ''}`)
      .replace('#include <fog_fragment>', `${CONTACT_FRAGMENT_BODY}\n#include <fog_fragment>`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : prevText}|contact${ao ? '-ao' : ''}${soft ? '-mist' : ''}${options.unit ? '-unit' : ''}`;
}

/** Patche tous les materiaux eclaires d'un sous-arbre (obstacles, decors, batiments, unites). */
export function applyContactShadingTo(root: THREE.Object3D, options: ContactShadingOptions = {}): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) if ('emissive' in m) applyContactShading(m, options);
  });
}
