import * as THREE from 'three';

/**
 * Retour visuel des DEGATS d'un batiment gameplay (2026-11-01) : fumee selon
 * les PV restants, puis effondrement a la destruction. Rendu seul : la
 * simulation considere le batiment detruit des que ses PV tombent a zero ;
 * son vestige visuel termine ici son animation.
 *
 * - <= DAMAGE_SMOKE_LIGHT (75 %) : fumee legere, intermittente ;
 * - <= DAMAGE_SMOKE_HEAVY (40 %) : fumee epaisse et sombre, plus de foyers.
 *   Foyers, debit et taille des volutes suivent l'emprise du modele : une
 *   Maison fume moins qu'une Eglise.
 * - destruction : secousse et affaissement du modele, nuage de poussiere,
 *   quelques debris low-poly, puis disparition.
 *
 * Hasard purement visuel, mais deterministe : generateur a graine par
 * batiment (position), jamais Math.random. Le temps est celui de l'ecran ;
 * l'appelant passe dt = 0 pendant la pause (tout se fige).
 */
export const DAMAGE_SMOKE_LIGHT = 0.75;
export const DAMAGE_SMOKE_HEAVY = 0.4;
/** Duree de l'effondrement (s) avant la disparition du modele. */
export const COLLAPSE_DURATION = 0.9;
/** Volutes vivantes au plus par batiment (borne le cout des grands foyers). */
const MAX_PUFFS = 48;

interface Puff {
  sprite: THREE.Sprite;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size0: number;
  size1: number;
  alpha: number;
}

interface Chunk {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  age: number;
}

let puffTexture: THREE.Texture | null = null;

/** Disque doux (degrade radial), partage par toutes les volutes. */
function smokeTexture(): THREE.Texture {
  if (puffTexture) return puffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

/** Generateur pseudo-aleatoire a graine (mulberry32), dans [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BuildingDamageFx {
  private readonly puffs: Puff[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly random: () => number;
  /** Etendue du modele (monde), lue a la premiere fumee ou a l'effondrement. */
  private box: THREE.Box3 | null = null;
  private emitAccumulator = 0;
  private damage = 1;
  private collapseAge = -1;
  private collapseBase: { y: number; x: number; z: number; rx: number; rz: number; sy: number } | null = null;

  constructor(
    private readonly mesh: THREE.Object3D,
    private readonly vfxGroup: THREE.Group,
  ) {
    const p = mesh.position;
    this.random = seeded(Math.imul(Math.round(p.x * 16) | 0, 73856093) ^ Math.imul(Math.round(p.z * 16) | 0, 19349663) ^ 0x5bd1e995);
  }

  /** PV restants / PV max (0 a 1), a chaque image. */
  setHealthFraction(fraction: number): void {
    this.damage = Math.min(1, Math.max(0, fraction));
  }

  /** Niveau de fumee actuel : 0 aucune, 1 legere, 2 epaisse. */
  smokeLevel(): 0 | 1 | 2 {
    if (this.collapseAge >= 0) return 0;
    return this.damage <= DAMAGE_SMOKE_HEAVY ? 2 : this.damage <= DAMAGE_SMOKE_LIGHT ? 1 : 0;
  }

  /** Nombre de volutes de fumee et de poussiere en vol (tests, nettoyage). */
  liveParticles(): number {
    return this.puffs.length + this.chunks.length;
  }

  /** Lance l'effondrement (une seule fois). */
  collapse(): void {
    if (this.collapseAge >= 0) return;
    this.collapseAge = 0;
    const box = this.measure();
    const p = this.mesh.position;
    this.collapseBase = { y: p.y, x: p.x, z: p.z, rx: this.mesh.rotation.x, rz: this.mesh.rotation.z, sy: this.mesh.scale.y };
    const size = box.getSize(new THREE.Vector3());
    const footprint = Math.max(1, size.x * size.z);
    // Poussiere : un anneau de grosses volutes au pied, nombre selon l'emprise.
    const dust = Math.min(18, 6 + Math.round(footprint * 1.5));
    const center = box.getCenter(new THREE.Vector3());
    for (let i = 0; i < dust; i++) {
      const a = (i / dust) * Math.PI * 2 + this.random() * 0.5;
      const r = Math.sqrt(footprint) * 0.35 * (0.5 + this.random() * 0.5);
      this.spawnPuff(center.x + Math.cos(a) * r, box.min.y + 0.15 + this.random() * 0.3, center.z + Math.sin(a) * r, 0x8a7d6c, 0.75, Math.cos(a) * 0.8, 0.5 + this.random() * 0.6, Math.sin(a) * 0.8, 1.2 + this.random() * 0.6, 0.5 + Math.sqrt(footprint) * 0.25, 1.4 + Math.sqrt(footprint) * 0.45);
    }
    // Debris : petits blocs low-poly projetes, nombre selon l'emprise.
    const count = Math.min(16, 5 + Math.round(footprint));
    const material = new THREE.MeshLambertMaterial({ color: 0x6b5a4a });
    for (let i = 0; i < count; i++) {
      const s = 0.1 + this.random() * 0.14;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.6 + this.random()), s), i === 0 ? material : material.clone());
      mesh.position.set(center.x + (this.random() - 0.5) * size.x * 0.6, box.min.y + size.y * (0.3 + this.random() * 0.4), center.z + (this.random() - 0.5) * size.z * 0.6);
      const a = this.random() * Math.PI * 2;
      const v = 1 + this.random() * 1.8;
      this.vfxGroup.add(mesh);
      this.chunks.push({ mesh, velocity: new THREE.Vector3(Math.cos(a) * v, 1.5 + this.random() * 2, Math.sin(a) * v), spin: new THREE.Vector3(this.random() * 8, this.random() * 8, this.random() * 8), age: 0 });
    }
  }

  /** Vrai une fois l'effondrement termine (modele masque). */
  get collapsed(): boolean {
    return this.collapseAge >= COLLAPSE_DURATION;
  }

  /** Une image. `dt` : temps ecran, 0 pendant la pause. */
  tick(dt: number): void {
    if (dt <= 0) return;
    const level = this.smokeLevel();
    if (level === 0) this.emitAccumulator = 0;
    else this.emitSmoke(dt, level);
    if (this.collapseAge >= 0 && this.collapseAge < COLLAPSE_DURATION) this.tickCollapse(dt);
    this.tickPuffs(dt);
    this.tickChunks(dt);
  }

  /** Etat de depart (nouvelle bataille, modele reutilise) : modele remis en
   *  place, fumee et poussiere retirees. */
  reset(): void {
    this.restoreMesh();
    this.collapseAge = -1;
    this.collapseBase = null;
    this.damage = 1;
    this.emitAccumulator = 0;
    this.box = null;
    this.clearParticles();
  }

  dispose(): void {
    this.clearParticles();
  }

  private measure(): THREE.Box3 {
    if (!this.box) {
      const box = new THREE.Box3().setFromObject(this.mesh);
      // Vue sans modele (boite vide) : une case de haut par defaut.
      if (box.isEmpty()) {
        const p = this.mesh.position;
        box.set(new THREE.Vector3(p.x - 0.5, p.y, p.z - 0.5), new THREE.Vector3(p.x + 0.5, p.y + 1.1, p.z + 0.5));
      }
      this.box = box;
    }
    return this.box;
  }

  private emitSmoke(dt: number, level: 1 | 2): void {
    const box = this.measure();
    const size = box.getSize(new THREE.Vector3());
    const footprint = Math.max(0.6, size.x * size.z);
    // Foyers : 1 a 3 en fumee legere, 2 a 5 en fumee epaisse, selon l'emprise.
    const sources = level === 1 ? Math.min(3, 1 + Math.floor(footprint / 4)) : Math.min(5, 2 + Math.floor(footprint / 4));
    // Debits et opacites releves le 2026-11-01 (fumee jugee trop discrete) :
    // legere 0,9 -> 2 bouffees/s/foyer, alpha 0,35 -> 0,8, gris clair ;
    // epaisse 2,4 -> 3,4, alpha 0,6 -> 0,85, plus sombre, colonne plus haute.
    const rate = (level === 1 ? 2 : 3.4) * sources;
    const scale = Math.min(2.2, 0.55 + Math.sqrt(footprint) * 0.22);
    this.emitAccumulator += dt * rate;
    while (this.emitAccumulator >= 1) {
      this.emitAccumulator -= 1;
      if (this.puffs.length >= MAX_PUFFS) continue;
      // Foyer tire parmi `sources` points fixes du toit (graine stable par foyer).
      const k = Math.floor(this.random() * sources);
      const fx = ((k * 0.618034 + 0.31) % 1) - 0.5;
      const fz = ((k * 0.381966 + 0.73) % 1) - 0.5;
      const x = box.min.x + size.x * (0.5 + fx * 0.7) + (this.random() - 0.5) * 0.15;
      const z = box.min.z + size.z * (0.5 + fz * 0.7) + (this.random() - 0.5) * 0.15;
      const y = box.min.y + size.y * (0.65 + this.random() * 0.25);
      const color = level === 1 ? 0xd2cfca : this.random() < 0.5 ? 0x2e2a27 : 0x45403b;
      const alpha = level === 1 ? 0.8 : 0.85;
      this.spawnPuff(x, y, z, color, alpha, (this.random() - 0.5) * 0.15 + 0.12, 0.6 + this.random() * 0.35, (this.random() - 0.5) * 0.15, (level === 1 ? 2.2 : 3.0) + this.random() * 0.8, 0.35 * scale, (level === 1 ? 1.5 : 1.9) * scale);
    }
  }

  private spawnPuff(x: number, y: number, z: number, color: number, alpha: number, vx: number, vy: number, vz: number, life: number, size0: number, size1: number): void {
    const material = new THREE.SpriteMaterial({ map: smokeTexture(), color, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size0);
    sprite.material.rotation = this.random() * Math.PI * 2;
    this.vfxGroup.add(sprite);
    this.puffs.push({ sprite, vx, vy, vz, age: 0, life, size0, size1, alpha });
  }

  private tickPuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.vfxGroup.remove(p.sprite);
        p.sprite.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y += p.vy * dt * (1 - t * 0.5);
      p.sprite.position.z += p.vz * dt;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * Math.sqrt(t));
      // Apparition rapide, disparition lente.
      p.sprite.material.opacity = p.alpha * Math.min(1, t * 6) * (1 - t);
    }
  }

  private tickChunks(dt: number): void {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i]!;
      c.age += dt;
      c.velocity.y -= 9 * dt;
      c.mesh.position.addScaledVector(c.velocity, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      const floor = this.collapseBase?.y ?? 0;
      if (c.mesh.position.y < floor) {
        c.mesh.position.y = floor;
        c.velocity.set(c.velocity.x * 0.3, 0, c.velocity.z * 0.3);
        c.spin.multiplyScalar(0.3);
      }
      const mat = c.mesh.material as THREE.MeshLambertMaterial;
      const fade = Math.max(0, (c.age - 1.4) / 0.8);
      mat.transparent = fade > 0;
      mat.opacity = 1 - fade;
      if (fade >= 1) {
        this.vfxGroup.remove(c.mesh);
        c.mesh.geometry.dispose();
        mat.dispose();
        this.chunks.splice(i, 1);
      }
    }
  }

  private tickCollapse(dt: number): void {
    this.collapseAge = Math.min(COLLAPSE_DURATION, this.collapseAge + dt);
    const base = this.collapseBase!;
    const t = this.collapseAge / COLLAPSE_DURATION;
    const height = this.measure().getSize(new THREE.Vector3()).y;
    // Secousse decroissante, puis affaissement (enfoncement et tassement).
    const shake = (1 - t) * 0.06;
    this.mesh.position.x = base.x + Math.sin(this.collapseAge * 47) * shake;
    this.mesh.position.z = base.z + Math.cos(this.collapseAge * 39) * shake;
    const sink = t * t;
    this.mesh.position.y = base.y - sink * height * 0.55;
    this.mesh.scale.y = base.sy * (1 - sink * 0.35);
    this.mesh.rotation.x = base.rx + sink * 0.08;
    this.mesh.rotation.z = base.rz - sink * 0.05;
    if (this.collapseAge >= COLLAPSE_DURATION) this.mesh.visible = false;
  }

  private restoreMesh(): void {
    const base = this.collapseBase;
    if (!base) return;
    this.mesh.position.set(base.x, base.y, base.z);
    this.mesh.rotation.x = base.rx;
    this.mesh.rotation.z = base.rz;
    this.mesh.scale.y = base.sy;
  }

  private clearParticles(): void {
    for (const p of this.puffs) {
      this.vfxGroup.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.puffs.length = 0;
    for (const c of this.chunks) {
      this.vfxGroup.remove(c.mesh);
      c.mesh.geometry.dispose();
      (c.mesh.material as THREE.Material).dispose();
    }
    this.chunks.length = 0;
  }
}
