import * as THREE from 'three';
import {
  HEALTH_BAR_SEGMENT_INTERVAL,
  HEALTH_BAR_SEGMENT_MIN_PIPS,
  HEALTH_BAR_WIDTH_MAX,
  HEALTH_BAR_WIDTH_MIN,
  HEALTH_BAR_WIDTH_PER_RADIUS,
  HP_BAR_WORLD_HEIGHT,
  HP_PER_PIP,
  MISS_TEXT_DURATION,
} from '../config/constants';
import { getUnit } from '../data/units';
import type { Renderer } from '../render/renderer';
import { teamColor } from '../render/unitSelectionRing';
import type { Entity, Team } from '../sim/entity';
import { surfaceY } from '../render/terrainSurface';

/** Position monde (x, z) a utiliser pour ancrer la barre au-dessus d'une unite. */
export type PositionResolver = (entity: Entity) => { x: number; z: number };

/** Vrai si la barre de cette entite doit etre affichee (main.ts : entite
 *  selectionnee, inspectee ou blessee). Les autres barres restent creees,
 *  masquees. */
export type HealthBarFilter = (entity: Entity) => boolean;

/** Un seul emplacement DOM par barre de PV — voir createBar. Regroupe les
 *  references dont sync()/syncPlacement() ont besoin a CHAQUE frame, pour ne
 *  jamais re-parcourir le DOM (`querySelector`) comme avant ce refonte. */
interface HealthBarRefs {
  bar: HTMLElement;
  fillEl: HTMLElement;
  shieldFill: HTMLElement;
}

/** Ce dont syncPlacement a besoin d'un emplacement de placement — pas une
 *  Entity complete (aucune n'existe encore avant le debut de la bataille). */
export interface PlacementHpSubject {
  unitId: string;
  x: number;
  z: number;
  hp: number;
  /** PV maximum de CETTE unite (niveau de production compris). */
  maxHp: number;
}

/** Bâtiment (Mine, Caserne, Forge, Baliste) en phase de placement : aucune
 *  Entity non plus, l'appelant fournit PV, plafond et gabarit de BuildingDef. */
export interface PlacementBuildingHpSubject {
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  radius: number;
  hpBarHeight: number;
}

/**
 * PV et texte de miss sont du HTML par-dessus le canvas, jamais dessines dans
 * la scene 3D : c'est la regle d'interface du projet. On projette donc la
 * position monde de chaque unite a l'ecran a chaque frame de rendu.
 *
 * Le miss ne change aucun PV : sans ce texte, rien ne distinguerait un coup
 * rate d'un coup qui touche.
 */
export class CombatOverlay {
  private readonly root: HTMLElement;
  /** Une entree par ENTITE vivante rencontree pendant la bataille — voir
   *  HealthBarRefs. Remplace l'ancienne paire pipBars/shieldFills (2026-08-14,
   *  refonte largeur clampee) : un seul Map, une seule recherche par entite. */
  private readonly healthBars = new Map<number, HealthBarRefs>();
  /** Barres de PV de la phase de PLACEMENT (demande d'Antoine, 2026-08-09:
   *  le joueur doit voir l'etat de sante de son armee avant de valider, pas
   *  seulement pendant la bataille) — reconstruites entierement a chaque
   *  appel plutot que mises en cache par id comme healthBars : l'ordre/le
   *  nombre d'unites peut changer d'un appel a l'autre (vente, achat) pendant
   *  le placement, un id base sur l'index serait instable. Le nombre d'unites
   *  reste petit, la simplicite l'emporte sur la reutilisation d'elements DOM
   *  (meme logique que playerPreview, reconstruit en entier a chaque
   *  refreshPlayerPreview). */
  private readonly placementPipBars: HTMLElement[] = [];
  private readonly scratch = new THREE.Vector3();
  /** Taille du canvas, mise en cache UNE FOIS par appel a sync()/syncPlacement()
   *  plutot que relue a chaque entite dans project() — voir le correctif de
   *  performance ci-dessous. */
  private canvasWidth = 0;
  private canvasHeight = 0;

  constructor(private readonly renderer: Renderer) {
    this.root = document.createElement('div');
    this.root.className = 'combat-overlay';
    document.body.appendChild(this.root);
  }

  /**
   * `resolvePosition` doit renvoyer la position visuelle REELLE de l'unite
   * (celle du maillage affiche, ruade d'attaque incluse — voir
   * UnitViews.getPosition) et non recalculee a partir de prevX/x : sinon la
   * barre se detache du modele a chaque attaque, quand il avance puis recule.
   */
  sync(entities: Entity[], resolvePosition: PositionResolver, isShown: HealthBarFilter = () => true): void {
    // Correctif de performance (2026-08-10, "gros souci de performance
    // d'affichage" remonte par Antoine des la vague 5, ~28 ennemis + armee) :
    // project() lisait canvas.clientWidth/clientHeight a CHAQUE entite, DANS
    // la meme boucle qui ecrit bar.style.left/top juste apres — un classique
    // "layout thrashing" (lecture qui force la synchronisation d'un layout
    // rendu sale par l'ecriture precedente, repete a chaque entite). Avec 28+
    // unites, ca fait autant de reflows forces PAR FRAME, largement suffisant
    // pour saturer un budget de frame bien avant que la simulation
    // elle-meme (O(n^2) mais correcte jusqu'a ~100, voir CLAUDE.md) ne soit
    // en cause. Lire la taille UNE SEULE FOIS ici, avant la boucle, regroupe
    // toutes les lectures avant toutes les ecritures : un seul layout par
    // frame au lieu d'un par unite.
    this.refreshCanvasSize();
    for (const entity of entities) {
      let refs = this.healthBars.get(entity.id);

      if (!entity.alive || !isShown(entity)) {
        if (refs) refs.bar.style.display = 'none';
        continue;
      }

      if (!refs) {
        refs = this.createBar(entity.stats.maxHp, entity.stats.radius, entity.team);
        this.healthBars.set(entity.id, refs);
        this.root.appendChild(refs.bar);
      }

      const { x, z } = resolvePosition(entity);
      const barHeight = getUnit(entity.unitId).visual.hpBarHeight ?? HP_BAR_WORLD_HEIGHT;
      const screen = this.project(x, barHeight, z);

      if (!screen) {
        refs.bar.style.display = 'none';
        continue;
      }

      refs.bar.style.display = '';
      refs.bar.style.left = `${screen.x}px`;
      refs.bar.style.top = `${screen.y}px`;
      this.updateFill(refs.fillEl, entity.hp, entity.stats.maxHp);
      // Shield temporaire (Provocation, 2026-08-14) — voir Entity.shield.
      // Compact et discret (demande explicite : "je préfère que cela reste
      // très compact") : une fine barre bleu clair sous les PV, largeur
      // proportionnelle au Shield par rapport au maxHp de l'unite, plafonnee
      // a 100% (2026-08-14 : le conteneur est desormais une largeur FIXE,
      // plus question de la laisser deborder), masquee des que le Shield
      // tombe a 0.
      this.updateShield(refs.shieldFill, entity.shield, entity.stats.maxHp);
    }
  }

  /**
   * Barres de PV des BATIMENTS gameplay (Mine, Baliste — 2026-08-16, voir
   * data/buildings.ts) : meme mecanisme que sync() ci-dessus (memes
   * createBar/updateFill/updateShield/healthBars — un batiment gameplay
   * partage donc naturellement clear() avec les unites), mais sans jamais
   * passer par getUnit() (un batiment n'est pas dans data/units.ts) —
   * `radius`/`hpBarHeight` viennent directement de BuildingDef, fournis par
   * l'appelant (main.ts).
   */
  syncBuildings(buildings: { entity: Entity; radius: number; hpBarHeight: number }[], resolvePosition: PositionResolver, isShown: HealthBarFilter = () => true): void {
    this.refreshCanvasSize();
    for (const { entity, radius, hpBarHeight } of buildings) {
      let refs = this.healthBars.get(entity.id);

      if (!entity.alive || !isShown(entity)) {
        if (refs) refs.bar.style.display = 'none';
        continue;
      }

      if (!refs) {
        refs = this.createBar(entity.stats.maxHp, radius, entity.team);
        this.healthBars.set(entity.id, refs);
        this.root.appendChild(refs.bar);
      }

      const { x, z } = resolvePosition(entity);
      const screen = this.project(x, hpBarHeight, z);

      if (!screen) {
        refs.bar.style.display = 'none';
        continue;
      }

      refs.bar.style.display = '';
      refs.bar.style.left = `${screen.x}px`;
      refs.bar.style.top = `${screen.y}px`;
      this.updateFill(refs.fillEl, entity.hp, entity.stats.maxHp);
      this.updateShield(refs.shieldFill, entity.shield, entity.stats.maxHp);
    }
  }

  /** Barres de PV pendant la phase de placement — voir placementPipBars.
   *  Le PLAFOND de PV d'une unite JOUEUR depend de son niveau de production
   *  (voir run/unitUpgradeEffects.ts) — ce module ne connait pas ce systeme,
   *  il recoit le nombre deja calcule par l'appelant (main.ts) dans chaque
   *  sujet, meme principe que `resolvePosition` ci-dessus. `buildings` :
   *  bâtiments du joueur a afficher, reconstruits de la meme facon.
   *  L'appelant ne passe que les sujets dont la barre doit etre visible. */
  syncPlacement(slots: PlacementHpSubject[], buildings: PlacementBuildingHpSubject[] = []): void {
    this.refreshCanvasSize();
    for (const bar of this.placementPipBars) bar.remove();
    this.placementPipBars.length = 0;

    for (const slot of slots) {
      const maxHp = slot.maxHp;
      const barHeight = getUnit(slot.unitId).visual.hpBarHeight ?? HP_BAR_WORLD_HEIGHT;
      const screen = this.project(slot.x, barHeight, slot.z);
      if (!screen) continue;

      // Pas de Shield pendant le placement (aucune Entity n'existe encore,
      // voir PlacementHpSubject — le Shield ne peut exister qu'en bataille).
      const { bar, fillEl } = this.createBar(maxHp, getUnit(slot.unitId).stats.radius, 'player');
      bar.style.left = `${screen.x}px`;
      bar.style.top = `${screen.y}px`;
      this.updateFill(fillEl, slot.hp, maxHp);
      this.root.appendChild(bar);
      this.placementPipBars.push(bar);
    }

    for (const building of buildings) {
      const screen = this.project(building.x, building.hpBarHeight, building.z);
      if (!screen) continue;
      const { bar, fillEl } = this.createBar(building.maxHp, building.radius, 'player');
      bar.style.left = `${screen.x}px`;
      bar.style.top = `${screen.y}px`;
      this.updateFill(fillEl, building.hp, building.maxHp);
      this.root.appendChild(bar);
      this.placementPipBars.push(bar);
    }
  }

  /** Fait apparaitre le texte "rate" au-dessus d'un point du plateau. */
  spawnMissText(x: number, z: number): void {
    this.spawnFloatingText(x, z, 'miss-text', 'raté');
  }

  /** Meme retour visuel que spawnMissText (texte flottant, meme classe CSS —
   *  un raté et une esquive pesent pareil visuellement), mais un libelle
   *  distinct : esquive DE LA CIBLE (talent "Réflexes de vétéran", voir
   *  sim/systems/combat.ts, CombatEvent 'dodge') plutot que rate DE
   *  L'ATTAQUANT. */
  spawnDodgeText(x: number, z: number): void {
    this.spawnFloatingText(x, z, 'miss-text', 'esquivé');
  }

  /** Texte flottant "+N" au-dessus d'une unite soignee (objet d'inventaire,
   *  voir main.ts useArmedItemOnClick) — meme retour que spawnMissText, pour
   *  confirmer l'effet meme quand le gain est trop petit pour deplacer la
   *  barre de PV (1 pip = HP_PER_PIP, un soin plus fin que ca ne change
   *  souvent rien a l'affichage bien qu'il s'applique correctement). */
  /** `secondary` (2026-08-13, boutique d'amelioration "Parchemin de soin") :
   *  variante VISUELLEMENT plus discrete (voir .heal-text--secondary) pour
   *  les cibles secondaires d'un soin en chaine — la cible principale garde
   *  le retour normal, point 29 de la demande : "légèrement plus petit /
   *  discret", jamais un gros effet identique repete pour chaque allie. */
  spawnHealText(x: number, z: number, amount: number, secondary = false): void {
    this.spawnFloatingText(x, z, secondary ? 'heal-text heal-text--secondary' : 'heal-text', `+${amount}`);
  }

  /** Texte flottant "+N or" au-dessus d'une unite ENNEMIE qui vient d'etre
   *  tuee (2026-08-11, demande d'Antoine : "on doit voir +1 jaune ou une
   *  piece apparaitre sur la cible abattue") — meme fabrique que
   *  spawnMissText/spawnHealText, teinte doree (voir .gold-text). `amount`
   *  peut etre fractionnaire (ex. 1.5 pour un archer) : affiche tel quel,
   *  meme convention que l'affichage de l'or dans la boutique. */
  spawnGoldText(x: number, z: number, amount: number): void {
    this.spawnFloatingText(x, z, 'gold-text', `+${amount} or`);
  }

  /** Fabrique commune aux textes flottants ci-dessus : meme projection ecran,
   *  meme duree de vie/animation, seuls la classe CSS et le libelle changent. */
  private spawnFloatingText(x: number, z: number, className: string, text: string): void {
    // Appel isole (pas dans une boucle sur plusieurs entites) : relire la
    // taille ici a chaque fois reste negligeable, contrairement a
    // l'ancien appel depuis project() dans sync() (voir plus haut).
    this.refreshCanvasSize();
    const screen = this.project(x, HP_BAR_WORLD_HEIGHT, z);
    if (!screen) return;

    const el = document.createElement('div');
    // Base commune (position, animation, contour de lisibilite) + variante.
    el.className = `floating-text ${className}`;
    el.textContent = text;
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y}px`;
    el.style.animationDuration = `${MISS_TEXT_DURATION}s`;
    this.root.appendChild(el);

    setTimeout(() => el.remove(), MISS_TEXT_DURATION * 1000);
  }

  clear(): void {
    this.healthBars.clear();
    this.placementPipBars.length = 0;
    this.root.innerHTML = '';
  }

  /** Construit une barre de PV a largeur FIXE (2026-08-14, refonte demandee
   *  par Antoine : "je ne veux plus que la largeur d'une barre soit
   *  proportionnelle au nombre total de HP... la quantite de PV doit etre
   *  representee uniquement par le REMPLISSAGE"). La largeur ne depend plus
   *  du tout de `maxHp` — seulement de la taille PHYSIQUE de l'unite
   *  (`UnitStats.radius`, deja la source de verite existante pour la
   *  "grosseur" d'une unite — voir HEALTH_BAR_WIDTH_PER_RADIUS dans
   *  config/constants.ts pour le detail du calibrage). `maxHp` ne sert plus
   *  qu'a decider du nombre de SEGMENTS decoratifs (voir plus bas), jamais
   *  de la largeur. */
  private createBar(maxHp: number, radius: number, team: Team): HealthBarRefs {
    const bar = document.createElement('div');
    bar.className = 'health-bar';

    const widthPx = Math.min(HEALTH_BAR_WIDTH_MAX, Math.max(HEALTH_BAR_WIDTH_MIN, radius * HEALTH_BAR_WIDTH_PER_RADIUS));
    bar.style.setProperty('--bar-width', `${widthPx}px`);

    const track = document.createElement('div');
    track.className = 'health-bar-track';
    const fillEl = document.createElement('div');
    fillEl.className = 'health-bar-fill';
    // Couleur = camp (source commune des anneaux et de la fiche), longueur =
    // PV restants : jamais de teinte selon la sante.
    fillEl.style.background = `#${teamColor(team).toString(16).padStart(6, '0')}`;
    track.appendChild(fillEl);

    // Segments decoratifs (2026-08-14, demande explicite : "un petit trait
    // tous les 10 HP... mais ne cree surtout pas 50 petits carres") — un
    // trait tous les HEALTH_BAR_SEGMENT_INTERVAL PV AFFICHES (pips), jamais
    // en dessous de HEALTH_BAR_SEGMENT_MIN_PIPS pips au total pour ne pas
    // surcharger les petites unites (Fantassin/Archer/Mage de base restent
    // sans segment). Purement decoratif : positionne en % de la largeur
    // FIXE du conteneur, ne touche jamais au remplissage reel.
    const pipCount = Math.round(maxHp / HP_PER_PIP);
    if (pipCount >= HEALTH_BAR_SEGMENT_MIN_PIPS) {
      for (let hp = HEALTH_BAR_SEGMENT_INTERVAL; hp < pipCount; hp += HEALTH_BAR_SEGMENT_INTERVAL) {
        const tick = document.createElement('div');
        tick.className = 'health-bar-segment';
        tick.style.left = `${(hp / pipCount) * 100}%`;
        track.appendChild(tick);
      }
    }
    bar.appendChild(track);

    // Shield temporaire (Provocation de la Sentinelle, 2026-08-14) — fine
    // barre bleu clair SOUS la barre de PV (voir ui/style.css, .shield-bar),
    // masquee par defaut (Entity.shield = 0 pour toute unite sans bouclier
    // actif — voir updateShield). Toujours construite (meme pour une unite
    // qui n'aura jamais de Shield) : plus simple que de la construire a la
    // demande, cout negligeable (un `div` de plus par barre de PV). Largeur
    // desormais TOUJOURS 100% du conteneur FIXE (jamais plus, voir
    // updateShield) — "le Shield ne doit pas allonger physiquement la barre".
    const shieldBar = document.createElement('div');
    shieldBar.className = 'shield-bar';
    shieldBar.style.display = 'none';
    const shieldFill = document.createElement('div');
    shieldFill.className = 'shield-bar-fill';
    shieldBar.appendChild(shieldFill);
    bar.appendChild(shieldBar);

    return { bar, fillEl, shieldFill };
  }

  /** Remplissage = fraction de maxHp, jamais un nombre de pips discrets —
   *  c'est desormais la SEULE chose qui varie avec les PV (voir createBar,
   *  la largeur du conteneur ne bouge plus jamais). */
  private updateFill(fillEl: HTMLElement, hp: number, maxHp: number): void {
    const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
    fillEl.style.width = `${ratio * 100}%`;
  }

  /** Largeur proportionnelle au Shield par rapport au maxHp de l'unite,
   *  PLAFONNEE a 100% (2026-08-14 : le conteneur est une largeur FIXE
   *  desormais, plus une raison de le laisser deborder comme avant) —
   *  masquee des que le Shield tombe a 0 (expire ou entierement consomme). */
  private updateShield(shieldFill: HTMLElement, shield: number, maxHp: number): void {
    const shieldBar = shieldFill.parentElement;
    if (!shieldBar) return;
    if (shield <= 0) {
      shieldBar.style.display = 'none';
      return;
    }
    shieldBar.style.display = '';
    const ratio = Math.max(0, Math.min(1, shield / Math.max(1, maxHp)));
    shieldFill.style.width = `${ratio * 100}%`;
  }

  /** Lit canvas.clientWidth/clientHeight (voir project()) — a appeler UNE
   *  SEULE FOIS avant une boucle sur plusieurs entites, jamais depuis
   *  l'interieur de project() lui-meme (voir le commentaire dans sync()). */
  private refreshCanvasSize(): void {
    const canvas = this.renderer.renderer.domElement;
    this.canvasWidth = canvas.clientWidth;
    this.canvasHeight = canvas.clientHeight;
  }

  /** `y` : hauteur AU-DESSUS du sol ; la surface du relief au point (x, z)
   *  s'y ajoute (render/terrainSurface.ts). */
  private project(x: number, y: number, z: number): { x: number; y: number } | null {
    this.scratch.set(x, y + surfaceY(x, z), z).project(this.renderer.camera);
    if (this.scratch.z > 1) return null;

    return {
      x: (this.scratch.x * 0.5 + 0.5) * this.canvasWidth,
      y: (this.scratch.y * -0.5 + 0.5) * this.canvasHeight,
    };
  }
}
