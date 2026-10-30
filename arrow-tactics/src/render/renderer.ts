import * as THREE from 'three';
import { BOARD_H, BOARD_W, CAMERA, COLORS } from '../config/constants';
import { clamp, degToRad } from '../core/math';
import { createBackgroundVeil, type LookSettings } from './look';

/** Marges en pixels CSS entre les bords de la fenetre et la zone libre. */
export interface ViewportInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Emprise au sol a cadrer, plus une hauteur pour les objets poses. */
export interface FrameBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

/** Marges en pixels CSS, par cote, entre la zone d'affichage et l'emprise cadree. */
export interface FrameMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Corrige un point vise propose (x, z) ; null = aucune limite. */
export type CameraTargetConstraint = (x: number, z: number) => { x: number; z: number } | null;

export interface CameraViewState {
  yawDeg: number;
  pitchDeg: number;
  viewHeight: number;
  targetX: number;
  targetZ: number;
}

/**
 * Camera orthographique inclinee.
 *
 * Pourquoi de la 3D pour un jeu qui ressemble a de la 2D isometrique : la
 * direction artistique est en boites, donc on utilise de vrais volumes. Le
 * tri de profondeur devient gratuit (le GPU s'en charge), la visee souris
 * devient un raycast exact sur le sol, et faire pivoter un chevalier qui
 * charge devient trivial. En 2D isometrique, ces trois choses coutent cher.
 */
export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly renderer: THREE.WebGLRenderer;

  /** Reglages de camera modifiables au clavier pour trouver le bon angle. */
  yawDeg = CAMERA.yawDeg;
  pitchDeg = CAMERA.pitchDeg;
  viewHeight = CAMERA.viewHeight;

  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly sun: THREE.DirectionalLight;

  /** Zone d'affichage logique (editeur, E6) : marges en pixels CSS de la
   *  fenetre, occupees par des panneaux. null = toute la fenetre (jeu). */
  private viewportInsets: ViewportInsets | null = null;
  /** Plafond de dezoom courant : celui du jeu, releve par frameBox quand une
   *  carte d'editeur ne tient pas dans CAMERA.maxViewHeight. */
  private maxViewHeight = CAMERA.maxViewHeight;
  /** Emprise cadree par frameBox, recadree au changement de zone tant que
   *  la camera n'a pas ete bougee a la main depuis. */
  private framedBox: FrameBox | null = null;
  private framedMargins: number | FrameMargins = 24;
  private framed = false;
  /** Limite du point vise appliquee au deplacement (pan), voir setTargetConstraint. */
  private targetConstraint: CameraTargetConstraint | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Couleur unie immediate, remplacee des que l'image charge (voir plus
    // bas) : jamais d'ecran noir/vide le temps du chargement reseau.
    this.scene.background = new THREE.Color(COLORS.sky);

    // Fond en TEST (demande d'Antoine, 2026-08-10, image fournie par ses
    // soins) — premiere exception "arriere-plan" a la regle "aucun asset
    // graphique" du projet (deja fait pour rochers/arbres/baliste, jamais
    // pour un element aussi visible que le ciel). LIMITE CONNUE, a confirmer
    // avec Antoine : ceci est une simple image plaquee en fond (scene.background
    // = Texture), pas un vrai skybox — elle reste FIXE a l'ecran quelle que
    // soit la rotation de la camera (yaw/pitch), elle ne "tourne" pas avec le
    // plateau. Suffisant pour un premier test visuel, pas pour un rendu
    // definitif si la camera pivote souvent en jeu reel.
    new THREE.TextureLoader().load('/textures/sky_background.png', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
    });

    // Lumiere d'ambiance froide par le haut, chaude par le sol : les cubes
    // gardent du volume meme sans texture. Etait descendue a 0.6 pour forcer
    // le contraste sur une tentative de geometrie procedurale, mais Antoine a
    // trouve le resultat trop sombre — remontee proche de l'original. Les
    // rochers/arbres sont maintenant de vrais modeles .glb (voir
    // render/assetLibrary.ts) avec leur propre relief et leurs propres
    // materiaux : ils n'ont pas besoin d'un ambiant faible pour se lire.
    this.hemisphere = new THREE.HemisphereLight(0xbcd4ff, 0x4a5236, 1.0);
    this.scene.add(this.hemisphere);

    // Lumiere de remplissage, opposee au soleil et sans ombre : sans elle,
    // les faces a l'ombre des modeles .glb (rochers, arbres) tombent presque
    // au noir et perdent tout leur relief — signale par Antoine sur les
    // rochers/arbres vus de certains angles. Volontairement faible et froide
    // (l'inverse du soleil chaud) pour rester une "lumiere de ciel" discrete,
    // pas une deuxieme source dramatique : les faces a l'ombre doivent rester
    // plus sombres que les faces eclairees, juste jamais illisibles.
    this.fill = new THREE.DirectionalLight(0xbcd4ff, 0.45);
    this.fill.position.set(10, 10, -8);
    this.scene.add(this.fill);

    this.sun = new THREE.DirectionalLight(0xfff2d6, 1.7);
    this.sun.position.set(-12, 20, 10);
    this.sun.castShadow = true;
    // Resolution doublee (1024 -> 2048) : des ombres de contact plus nettes
    // entre les blocs empiles d'un meme rocher/arbre, plutot qu'un flou qui
    // les fait presque disparaitre a cette echelle.
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    const span = Math.max(BOARD_W, BOARD_H) * 0.8;
    s.left = -span;
    s.right = span;
    s.top = span;
    s.bottom = -span;
    s.near = 1;
    s.far = 80;
    this.sun.shadow.bias = -0.0012;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Preset de lookdev (render/look.ts, `?look=`), une fois au demarrage :
   *  seuls les reglages presents changent (baseline : aucun). */
  applyLook(look: LookSettings): void {
    if (look.hemisphereIntensity !== undefined) this.hemisphere.intensity = look.hemisphereIntensity;
    if (look.sunIntensity !== undefined) this.sun.intensity = look.sunIntensity;
    if (look.fillIntensity !== undefined) this.fill.intensity = look.fillIntensity;
    if (look.backgroundIntensity !== undefined) this.scene.backgroundIntensity = look.backgroundIntensity;
    if (look.backgroundVeil) this.scene.add(createBackgroundVeil(look.backgroundVeil));
  }

  /** Eclairement d'un sol plat a decouvert (lineaire, divise par pi : ce que
   *  multiplie l'albedo d'un materiau Lambert), lumieres et preset courants :
   *  vignettes de l'outil Surface (render/groundLook.ts). */
  groundIrradiance(): [number, number, number] {
    const sum = this.hemisphere.color.clone().multiplyScalar(this.hemisphere.intensity);
    for (const light of [this.sun, this.fill]) {
      const up = light.position.clone().sub(light.target.position).normalize().y;
      sum.add(light.color.clone().multiplyScalar(light.intensity * Math.max(0, up)));
    }
    return [sum.r / Math.PI, sum.g / Math.PI, sum.b / Math.PI];
  }

  /** Tampon de rendu a la taille CSS × devicePixelRatio, ET taille
   *  d'affichage du canvas fixee a la taille CSS de la fenetre : sans cette
   *  derniere (ancien `setSize(w, h, false)`), le canvas s'affichait a la
   *  taille de son tampon des que l'echelle Windows depassait 100 % (125 %,
   *  150 %…), donc agrandi et rogne en bas a droite, alors que projections,
   *  cadrage et clics raisonnent en pixels CSS. */
  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.updateCamera();
  }

  adjustYaw(delta: number): void {
    this.framed = false;
    this.yawDeg = (this.yawDeg + delta + 360) % 360;
    this.updateCamera();
  }

  adjustPitch(delta: number): void {
    this.framed = false;
    this.pitchDeg = clamp(this.pitchDeg + delta, CAMERA.minPitchDeg, CAMERA.maxPitchDeg);
    this.updateCamera();
  }

  adjustZoom(delta: number): void {
    this.framed = false;
    this.viewHeight = clamp(this.viewHeight + delta, CAMERA.minViewHeight, this.maxViewHeight);
    this.updateCamera();
  }

  /** Etat complet de la vue, pour la restituer telle quelle (voir
   *  setViewState) : l'editeur ne modifie pas le cadrage du jeu. */
  getViewState(): CameraViewState {
    return { yawDeg: this.yawDeg, pitchDeg: this.pitchDeg, viewHeight: this.viewHeight, targetX: this.target.x, targetZ: this.target.z };
  }

  setViewState(state: CameraViewState): void {
    this.framed = false;
    this.yawDeg = state.yawDeg;
    this.pitchDeg = state.pitchDeg;
    this.viewHeight = state.viewHeight;
    this.target.set(state.targetX, 0, state.targetZ);
    this.updateCamera();
  }

  /** Limite le cadrage a une partie de la fenetre (editeur) : le point vise
   *  s'affiche au centre de cette zone et viewHeight y designe la hauteur de
   *  monde visible. null revient a toute la fenetre (jeu), plafond de dezoom
   *  du jeu compris. Le frustum couvre toujours tout le canvas : raycast et
   *  projections restent exacts sans changement. */
  setViewportInsets(insets: ViewportInsets | null): void {
    this.viewportInsets = insets;
    if (!insets) {
      this.maxViewHeight = CAMERA.maxViewHeight;
      this.viewHeight = Math.min(this.viewHeight, this.maxViewHeight);
      this.framedBox = null;
      this.framed = false;
    }
    if (this.framed && this.framedBox) this.frameBox(this.framedBox, this.framedMargins);
    else this.updateCamera();
  }

  /** Limite le point vise pendant les deplacements a la souris (pan) : la
   *  contrainte recoit le point propose et renvoie le point corrige, ou
   *  null pour le laisser libre. null retire toute limite. */
  setTargetConstraint(constraint: CameraTargetConstraint | null): void {
    this.targetConstraint = constraint;
  }

  /**
   * Cadre une emprise du monde dans la zone d'affichage, avec des marges en
   * pixels CSS (une valeur pour les quatre cotes, ou une par cote pour
   * laisser la place au HUD), sans changer l'orientation ni l'inclinaison :
   * seuls le point vise et le zoom sont calcules. L'emprise reste cadree au
   * redimensionnement ou au changement de zone, jusqu'au prochain geste de
   * camera.
   *
   * Tout est calcule dans les dimensions CSS de la zone d'affichage (celles
   * des projections et du raycast), jamais en pixels physiques : le resultat
   * ne depend ni de devicePixelRatio ni de la taille du tampon de rendu.
   */
  frameBox(box: FrameBox, margins: number | FrameMargins = 24): void {
    const m = typeof margins === 'number' ? { top: margins, right: margins, bottom: margins, left: margins } : margins;
    this.target.set(0, 0, 0);
    this.updateCamera();
    this.camera.updateMatrixWorld();
    const view = this.camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const p = new THREE.Vector3();
    for (const x of [box.minX, box.maxX]) {
      for (const y of [0, box.height]) {
        for (const z of [box.minZ, box.maxZ]) {
          p.set(x, y, z).applyMatrix4(view);
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      }
    }
    const { width, height } = this.viewportSize();
    const usableW = Math.max(width - m.left - m.right, 1);
    const usableH = Math.max(height - m.top - m.bottom, 1);
    const worldPerPixel = Math.max((maxX - minX) / usableW, (maxY - minY) / usableH, 1e-3);
    const fitted = worldPerPixel * height;
    this.maxViewHeight = Math.max(CAMERA.maxViewHeight, fitted);
    this.viewHeight = clamp(fitted, CAMERA.minViewHeight, this.maxViewHeight);

    // Le centre de l'emprise doit tomber au centre de la zone utile (hors
    // marges), pas au point vise : en jeu, le frustum est decale de
    // CAMERA.verticalFrameOffset (le point vise s'affiche plus bas que le
    // centre de l'ecran), et des marges inegales deplacent encore ce centre.
    // Ecart voulu, en coordonnees camera, entre le centre de l'emprise et
    // le point vise.
    const unitsPerPixel = this.viewHeight / height;
    const frustumCenterY = this.viewportInsets ? 0 : CAMERA.verticalFrameOffset;
    const desiredX = ((m.left - m.right) / 2) * unitsPerPixel;
    const desiredY = frustumCenterY - ((m.top - m.bottom) / 2) * unitsPerPixel;

    // Point du sol vise : on part de ce point en coordonnees camera et on
    // glisse le long de l'axe de vue (sans effet a l'ecran en
    // orthographique) jusqu'au plan y = 0.
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const center = right.multiplyScalar((minX + maxX) / 2 - desiredX).add(up.multiplyScalar((minY + maxY) / 2 - desiredY));
    center.addScaledVector(forward, -center.y / forward.y);
    this.target.set(center.x, 0, center.z);
    this.framedBox = box;
    this.framedMargins = margins;
    this.framed = true;
    this.updateCamera();
  }

  resetCamera(): void {
    this.framed = false;
    this.yawDeg = CAMERA.yawDeg;
    this.pitchDeg = CAMERA.pitchDeg;
    this.viewHeight = CAMERA.viewHeight;
    this.target.set(0, 0, 0);
    this.updateCamera();
  }

  /**
   * Deplace le point vise (2026-08-11, demande d'Antoine : "pouvoir deplacer
   * la camera du plateau... pour aller admirer certains details de la
   * bataille", clic droit + gauche maintenus, voir main.ts). Traduit un
   * glisser en pixels ecran en un deplacement sur le plan du sol (target.y
   * reste toujours 0), dans le repere de la camera actuelle (right/forward
   * au sol, tournes par le yaw) plutot qu'en x/z monde bruts — sinon le sens
   * du glisser s'inverserait selon l'angle de vue actuel.
   *
   * Approximation ASSUMEE : la composante verticale (dy) n'est pas corrigee
   * par l'inclinaison (pitch) pour garder le calcul simple — un vrai
   * verrouillage "le point sous le curseur ne bouge pas" demanderait de
   * diviser par sin(pitch), ce qui amplifie fortement le glisser a faible
   * inclinaison. Suffisant pour un simple "regarder autour", pas une vraie
   * poignee de plan comme un logiciel de CAO.
   */
  pan(dxPixels: number, dyPixels: number): void {
    this.framed = false;
    const scale = this.viewHeight / Math.max(this.viewportSize().height, 1);
    const yaw = degToRad(this.yawDeg);
    // Vecteurs au sol du repere camera (voir derivation dans le commentaire
    // de classe) : right est perpendiculaire a la direction de vue projetee
    // au sol, forwardGround est cette direction elle-meme (camera -> cible).
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);

    const x = this.target.x - dxPixels * scale * rightX + dyPixels * scale * forwardX;
    const z = this.target.z - dxPixels * scale * rightZ + dyPixels * scale * forwardZ;
    const limited = this.targetConstraint?.(x, z) ?? null;
    this.target.set(limited?.x ?? x, 0, limited?.z ?? z);
    this.updateCamera();
  }

  /** Dimensions en pixels de la zone d'affichage logique. */
  private viewportSize(): { width: number; height: number } {
    const i = this.viewportInsets;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!i) return { width: w, height: h };
    return { width: Math.max(w - i.left - i.right, 1), height: Math.max(h - i.top - i.bottom, 1) };
  }

  private updateCamera(): void {
    const insets = this.viewportInsets;
    if (insets) {
      // Editeur : frustum sur tout le canvas, mais decentre pour que le point
      // vise tombe au centre de la zone libre, a l'echelle de cette zone.
      const w = window.innerWidth;
      const h = window.innerHeight;
      const scale = this.viewHeight / this.viewportSize().height;
      const centerX = insets.left + (w - insets.left - insets.right) / 2;
      const centerY = insets.top + (h - insets.top - insets.bottom) / 2;
      this.camera.left = -centerX * scale;
      this.camera.right = (w - centerX) * scale;
      this.camera.top = centerY * scale;
      this.camera.bottom = -(h - centerY) * scale;
    } else {
      const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
      const halfH = this.viewHeight / 2;
      const halfW = halfH * aspect;

      // Decalage vertical du cadrage (CAMERA.verticalFrameOffset) : ajoute a
      // top ET bottom, donc le point vise (target) glisse plus BAS a l'ecran
      // sans changer le zoom (top-bottom, donc la hauteur de monde visible,
      // reste inchange) ni le point 3D regarde.
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH + CAMERA.verticalFrameOffset;
      this.camera.bottom = -halfH + CAMERA.verticalFrameOffset;
    }
    this.camera.near = 0.1;
    this.camera.far = 400;

    // En orthographique la distance n'affecte pas la taille : on la garde grande
    // pour que rien ne soit jamais coupe par le plan proche.
    const distance = 120;
    const yaw = degToRad(this.yawDeg);
    const pitch = degToRad(this.pitchDeg);
    const horizontal = Math.cos(pitch) * distance;

    this.camera.position.set(
      this.target.x + Math.sin(yaw) * horizontal,
      Math.sin(pitch) * distance,
      this.target.z + Math.cos(yaw) * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
