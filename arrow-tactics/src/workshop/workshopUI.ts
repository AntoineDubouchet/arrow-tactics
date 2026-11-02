import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UNITS } from '../data/units';
import { buildToonUnitModel, createToonTintMaterial, ensureToonUnitPrototype, toonFactionKind, toonUnitClips, TOON_PALETTES, TOON_UNITS, type ToonUnitKind } from '../render/toonUnitRig';
import {
  BODY_SLOT_LABELS,
  BODY_SLOTS,
  configFromEntry,
  configSources,
  defaultLook,
  emptyHand,
  exportConfigText,
  importConfigText,
  round,
  type BodySlot,
  type CataloguePiece,
  type Hand,
  type HandConfig,
  type WorkshopConfig,
} from './workshopConfig';
import { loadCatalogue, WorkshopModel, type LoadedCatalogue } from './workshopModel';

/**
 * Atelier de personnage (2026-11-01) : ecran INTERNE de conception ouvert
 * depuis le menu principal, distinct de l'editeur de cartes et de toute
 * partie (aucune incidence de jeu). Scene 3D dediee (son propre rendu),
 * pieces du catalogue du pipeline, mains libres, teinte, echelle, animation,
 * presets des unites existantes, export / reimport d'une entree units.json.
 */
const SOURCES = [
  { id: 'western_kingdoms', label: 'Humains — Western Kingdoms', tag: 'Humain' },
  { id: 'barbarian', label: 'Barbares — Barbarians', tag: 'Barbare' },
] as const;

/** Selecteur « All » : pieces de toutes les sources, melangeables (meme squelette). */
const ALL = 'all';

const sourceTag = (id: string): string => SOURCES.find((s) => s.id === id)?.tag ?? id;

/** Plage du curseur d'echelle d'une piece ; la saisie numerique n'est pas bornee (minimum 0,05). */
const PIECE_SCALE_MIN = 0.5;
const PIECE_SCALE_MAX = 2;

/** Valeur d'une option de piece : `source:piece` (All), sinon le nom seul. */
function parsePieceValue(value: string, fallback: string): { piece: string; source: string } {
  const at = value.indexOf(':');
  return at < 0 ? { piece: value, source: fallback } : { piece: value.slice(at + 1), source: value.slice(0, at) };
}

/** Presets fixes : unites en « single mesh » (cavalerie, KI-36), pieces non
 *  editables ; teinte, echelle et animation restent reglables. */
const FIXED_PRESETS: readonly { kind: ToonUnitKind; source: string }[] = [
  { kind: 'cavalier', source: 'western_kingdoms' },
  { kind: 'barbare_cavalier', source: 'barbarian' },
];

const PALETTE_LABELS: Readonly<Record<string, string>> = {
  red: 'Rouge', blue: 'Bleu', green: 'Vert', yellow: 'Jaune', faction_neutral: 'Neutre (brun / gris)',
  purple: 'Violet', orange: 'Orange', neutral: 'Gris clair', brown: 'Brun', tan: 'Ocre', black: 'Noir', custom: 'Personnalisée',
};

/** Nom de jeu d'un GLB Toon (`human_footman` -> « Homme d'armes »). */
function gameNameForFile(file: string): string {
  for (const def of Object.values(UNITS)) {
    const kind = def.visual.faction === 'barbarian' ? toonFactionKind(def.visual.kit, 'barbarian') : def.visual.kit in TOON_UNITS ? (def.visual.kit as ToonUnitKind) : null;
    if (kind && TOON_UNITS[kind].file === `${file}.glb`) return def.name;
  }
  return file;
}

/** Echelle de jeu d'un GLB Toon (Sentinelle 1,15, Heros 1,3...). */
function gameScaleForFile(file: string): number {
  const def = Object.values(TOON_UNITS).find((d) => d.file === `${file}.glb`);
  return def?.scale ?? 1;
}

function paletteHex(id: string): string {
  const rgb = (TOON_PALETTES as Record<string, readonly [number, number, number]>)[id];
  return rgb ? `#${new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace).getHexString()}` : '#ffffff';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class CharacterWorkshop {
  private readonly overlay = el('div', 'workshop');
  private readonly panel = el('div', 'workshop-panel');
  private readonly view = el('div', 'workshop-view');
  private readonly canvas = el('canvas', 'workshop-canvas');
  private readonly statsBox = el('div', 'workshop-stats');
  private readonly exportBox = el('textarea', 'workshop-export');
  private readonly notice = el('div', 'workshop-notice');
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  private controls: OrbitControls | null = null;
  private readonly clock = new THREE.Clock();
  private frame = 0;
  private catalogues = new Map<string, LoadedCatalogue>();
  private model: WorkshopModel | null = null;
  /** Preset fixe affiche (cavalerie), null en composition libre. */
  private fixed: { kind: ToonUnitKind; root: THREE.Group; mixer: THREE.AnimationMixer; tint: ReturnType<typeof createToonTintMaterial>; clips: THREE.AnimationClip[]; action: THREE.AnimationAction | null } | null = null;
  private config: WorkshopConfig = { name: 'atelier_unite', source: 'western_kingdoms', allSources: false, body: { head: null, body: null, arms: null, legs: null, shoulderpads: null, helmet: null, cape: null }, extras: [], hands: { right: emptyHand('western_kingdoms'), left: emptyHand('western_kingdoms') }, look: defaultLook() };
  private open_ = false;

  constructor(private readonly onClose: () => void) {
    this.overlay.hidden = true;
    this.overlay.append(this.panel, this.view);
    this.view.append(this.canvas, this.statsBox, this.notice);
    document.body.appendChild(this.overlay);
    this.scene.background = new THREE.Color(0x2b3139);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3328, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.4);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xc8d8ff, 0.6);
    fill.position.set(-4, 3, -3);
    this.scene.add(fill);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.camera.position.set(0, 1.3, 4.2);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    this.overlay.hidden = false;
    this.open_ = true;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.target.set(0, 0.85, 0);
      this.controls.enableDamping = true;
      this.controls.minDistance = 1.2;
      this.controls.maxDistance = 9;
    }
    this.panel.replaceChildren(el('div', 'workshop-title', 'Atelier de personnage'), el('div', 'workshop-hint', 'Chargement des catalogues…'));
    try {
      for (const { id } of SOURCES) this.catalogues.set(id, await loadCatalogue(id));
    } catch (error) {
      this.panel.replaceChildren(el('div', 'workshop-title', 'Atelier de personnage'), el('div', 'workshop-hint', `Catalogue indisponible : ${(error as Error).message}`), this.closeButton());
      return;
    }
    if (!this.model && !this.fixed) this.loadPreset('western_kingdoms', 'human_footman');
    else this.renderPanel();
    this.loop();
  }

  close(): void {
    this.overlay.hidden = true;
    this.open_ = false;
    cancelAnimationFrame(this.frame);
    this.onClose();
  }

  private loop = (): void => {
    if (!this.open_ || !this.renderer) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.model?.mixer.update(dt);
    this.fixed?.mixer.update(dt);
    this.controls!.update();
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  };

  // --- Modele -------------------------------------------------------------

  private clearModel(): void {
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
      this.model = null;
    }
    if (this.fixed) {
      this.scene.remove(this.fixed.root);
      this.fixed.mixer.stopAllAction();
      this.fixed = null;
    }
  }

  /** Composition libre sur la source de base `source` (squelette, clips) ;
   *  les pieces de toutes les sources chargees restent disponibles. */
  private useSource(source: string): void {
    if (this.model?.catalogue.source === source && !this.fixed) return;
    this.clearModel();
    this.model = new WorkshopModel(this.catalogues.get(source)!, this.catalogues);
    this.scene.add(this.model.root);
  }

  /** Preset d'une unite existante (entree units.json du catalogue) ; le
   *  selecteur « All » reste actif s'il l'etait. */
  loadPreset(source: string, name: string): void {
    const entry = this.catalogues.get(source)?.catalogue.presets[name];
    if (!entry) return;
    this.useSource(source);
    const all = this.config.allSources;
    this.config = configFromEntry(name, entry, { echelle: gameScaleForFile(name), palette: this.config.look.palette, couleur: this.config.look.couleur });
    this.config.allSources ||= all;
    this.applyConfig();
  }

  /** Selecteur de source : « All » garde le personnage ; une source seule le
   *  garde aussi s'il n'utilise que ses pieces, sinon charge son premier preset. */
  private selectSource(value: string): void {
    if (value === ALL) {
      this.config.allSources = true;
      if (this.fixed) this.loadPreset(this.config.source, Object.keys(this.catalogues.get(this.config.source)!.catalogue.presets)[0]!);
      else this.renderPanel();
      return;
    }
    if (!this.fixed && configSources(this.config).every((s) => s === value)) {
      this.config.allSources = false;
      this.renderPanel();
      return;
    }
    this.config.allSources = false;
    this.loadPreset(value, Object.keys(this.catalogues.get(value)!.catalogue.presets)[0]!);
  }

  /** Preset fixe (cavalerie) : modele du jeu tel quel. */
  async loadFixed(kind: ToonUnitKind): Promise<void> {
    if (!(await ensureToonUnitPrototype(kind))) {
      this.notice.textContent = `Modèle ${TOON_UNITS[kind].file} absent (assets locaux hors Git).`;
      return;
    }
    this.clearModel();
    const root = buildToonUnitModel(kind, 'player');
    const tint = createToonTintMaterial(TOON_UNITS[kind].textures);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !mesh.name.startsWith('part_')) mesh.material = tint.material;
    });
    const mixer = root.userData['riggedMixer'] as THREE.AnimationMixer;
    mixer.stopAllAction();
    const clips = [...toonUnitClips(kind).values()];
    this.fixed = { kind, root, mixer, tint, clips, action: null };
    this.scene.add(root);
    const file = TOON_UNITS[kind].file.replace('.glb', '');
    this.config = { ...this.config, name: file, source: FIXED_PRESETS.find((f) => f.kind === kind)!.source, look: { ...this.config.look, echelle: 1, animation: 'idle' } };
    this.applyConfig();
  }

  private applyConfig(): void {
    if (this.model) {
      this.model.apply(this.config);
      if (!this.model.play(this.config.look.animation)) {
        const first = this.model.clips[0]?.name;
        if (first) {
          this.config.look.animation = first;
          this.model.play(first);
        }
      }
    }
    if (this.fixed) this.applyFixedLook();
    this.renderPanel();
  }

  private applyFixedLook(): void {
    const f = this.fixed!;
    const look = this.config.look;
    f.tint.setTint(new THREE.Color(look.couleur).lerp(new THREE.Color(look.couleurB), look.melange), look.intensite);
    // Echelle du jeu (TOON_UNIT_MODEL_SCALE) annulee : meme taille que la composition libre.
    f.root.scale.setScalar((1.557 / 1.15) * look.echelle);
    const clip = f.clips.find((c) => c.name === look.animation) ?? f.clips[0];
    if (clip && f.action?.getClip() !== clip) {
      f.action?.stop();
      f.action = f.mixer.clipAction(clip);
      f.action.reset().play();
    }
  }

  /** Reglage de teinte / echelle / animation sans reconstruire les pieces. */
  private updateLook(): void {
    if (this.model) {
      this.model.setLook(this.config);
      this.model.play(this.config.look.animation);
    }
    if (this.fixed) this.applyFixedLook();
    this.refreshOutputs();
  }

  // --- Panneau ------------------------------------------------------------

  private closeButton(): HTMLButtonElement {
    const b = el('button', 'workshop-button', 'Fermer');
    b.type = 'button';
    b.addEventListener('click', () => this.close());
    return b;
  }

  private section(title: string): HTMLDivElement {
    const s = el('div', 'workshop-section');
    s.appendChild(el('div', 'workshop-section-title', title));
    this.panel.appendChild(s);
    return s;
  }

  private row(parent: HTMLElement, label: string, control: HTMLElement): void {
    const r = el('label', 'workshop-row');
    r.append(el('span', 'workshop-label', label), control);
    parent.appendChild(r);
  }

  private select(options: readonly { value: string; label: string; group?: string }[], value: string, onChange: (v: string) => void, dataName?: string): HTMLSelectElement {
    const s = el('select', 'workshop-select');
    if (dataName) s.dataset['name'] = dataName;
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const o of options) {
      const option = el('option', undefined, o.label);
      option.value = o.value;
      if (o.group) {
        let g = groups.get(o.group);
        if (!g) {
          g = el('optgroup');
          g.label = o.group;
          groups.set(o.group, g);
          s.appendChild(g);
        }
        g.appendChild(option);
      } else s.appendChild(option);
    }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  private number(value: number, step: number, onChange: (v: number) => void, dataName?: string): HTMLInputElement {
    const input = el('input', 'workshop-number');
    input.type = 'number';
    input.step = String(step);
    input.value = String(value);
    if (dataName) input.dataset['name'] = dataName;
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onChange(v);
    });
    return input;
  }

  private button(label: string, onClick: () => void, dataName?: string): HTMLButtonElement {
    const b = el('button', 'workshop-button', label);
    b.type = 'button';
    if (dataName) b.dataset['name'] = dataName;
    b.addEventListener('click', onClick);
    return b;
  }

  private renderPanel(): void {
    this.panel.replaceChildren();
    const head = el('div', 'workshop-head');
    head.append(el('div', 'workshop-title', 'Atelier de personnage'), this.closeButton());
    this.panel.appendChild(head);
    const fixed = this.fixed !== null;
    this.notice.textContent = fixed ? 'Preset fixe : modèle « single mesh » (FBX modulaire de cavalerie illisible, KI-36) — pièces non éditables ; couleurs, échelle et animation réglables.' : '';

    // Source et presets.
    const top = this.section('Source et presets');
    const sourceOptions = [...SOURCES.map((s) => ({ value: s.id as string, label: s.label })), { value: ALL, label: 'All — toutes les sources' }];
    this.row(top, 'Source', this.select(sourceOptions, this.config.allSources && !fixed ? ALL : this.config.source, (v) => this.selectSource(v), 'source'));
    const presetOptions: { value: string; label: string; group: string }[] = [];
    for (const { id } of SOURCES) {
      const group = id === 'barbarian' ? 'Barbares / Neutres' : 'Humains';
      for (const name of Object.keys(this.catalogues.get(id)!.catalogue.presets)) presetOptions.push({ value: `${id}:${name}`, label: gameNameForFile(name), group });
      for (const f of FIXED_PRESETS.filter((x) => x.source === id)) presetOptions.push({ value: `fixe:${f.kind}`, label: `${gameNameForFile(TOON_UNITS[f.kind].file.replace('.glb', ''))} (fixe)`, group });
    }
    const current = fixed ? `fixe:${this.fixed!.kind}` : `${this.config.source}:${this.config.name}`;
    presetOptions.unshift({ value: '', label: '— Choisir un preset —', group: 'Presets' });
    this.row(top, 'Preset', this.select(presetOptions, presetOptions.some((o) => o.value === current) ? current : '', (v) => {
      if (v.startsWith('fixe:')) void this.loadFixed(v.slice(5) as ToonUnitKind);
      else if (v) {
        const [source, name] = v.split(':') as [string, string];
        this.loadPreset(source, name);
      }
    }, 'preset'));
    const nameInput = el('input', 'workshop-text');
    nameInput.value = this.config.name;
    nameInput.dataset['name'] = 'nom';
    nameInput.addEventListener('change', () => {
      this.config.name = nameInput.value.trim() || 'atelier_unite';
      this.refreshOutputs();
    });
    this.row(top, 'Nom (units.json)', nameInput);

    // Pieces : celles de la source, ou de toutes les sources (« All », groupees
    // et etiquetees par provenance).
    const all = this.config.allSources;
    const listed = (all ? SOURCES.map((s) => s.id as string) : [this.config.source]).map((id) => ({ id, catalogue: this.catalogues.get(id)!.catalogue }));
    const pieceOptions = (keep: (p: CataloguePiece) => boolean, label: (p: CataloguePiece) => string = (p) => p.name) =>
      listed.flatMap(({ id, catalogue }) => catalogue.pieces.filter(keep).map((p) => all
        ? { value: `${id}:${p.name}`, label: `[${sourceTag(id)}] ${label(p)}`, group: SOURCES.find((s) => s.id === id)!.label }
        : { value: p.name, label: label(p) }));
    const pieceValue = (ref: { piece: string | null; source: string } | null) => (ref?.piece ? (all ? `${ref.source}:${ref.piece}` : ref.piece) : '');
    const pieces = this.section(all ? 'Pièces — toutes les sources (squelette commun)' : 'Pièces');
    for (const slot of BODY_SLOTS) {
      const options = pieceOptions((p) => p.slot === slot);
      const s = this.select([{ value: '', label: options.length ? 'Aucun' : 'Aucune pièce séparée dans ce pack' }, ...options], pieceValue(this.config.body[slot]), (v) => {
        const previous = this.config.body[slot];
        this.config.body[slot] = v ? { ...parsePieceValue(v, this.config.source), scale: previous?.scale ?? 1 } : null;
        this.applyConfig();
      }, `slot-${slot}`);
      s.disabled = fixed || options.length === 0;
      this.row(pieces, BODY_SLOT_LABELS[slot], s);
      if (options.length) this.pieceScaleControls(pieces, slot, fixed);
    }
    const resetScales = this.button('Échelles des pièces : tout à 1', () => {
      for (const slot of BODY_SLOTS) {
        const ref = this.config.body[slot];
        if (ref) ref.scale = 1;
      }
      this.applyConfig();
    }, 'echelles-reset');
    resetScales.disabled = fixed;
    pieces.appendChild(resetScales);
    const extras = el('div', 'workshop-extras');
    for (const { id, catalogue } of listed) {
      for (const p of catalogue.pieces.filter((x) => x.slot === 'extra')) {
        const box = el('input');
        box.type = 'checkbox';
        const same = (r: { piece: string; source: string }) => r.piece === p.name && r.source === id;
        box.checked = this.config.extras.some(same);
        box.disabled = fixed;
        box.dataset['name'] = `extra-${p.name}`;
        box.addEventListener('change', () => {
          this.config.extras = box.checked ? [...this.config.extras, { piece: p.name, source: id, scale: 1 }] : this.config.extras.filter((r) => !same(r));
          this.applyConfig();
        });
        const l = el('label', 'workshop-check');
        l.append(box, document.createTextNode(all ? `[${sourceTag(id)}] ${p.name}` : p.name));
        extras.appendChild(l);
      }
    }
    this.row(pieces, 'Extras', extras);

    // Mains libres.
    const hands = this.section('Mains (tout objet tenu, dans l’une ou l’autre main)');
    const handOptions = pieceOptions((p) => p.slot === 'hand', (p) => `${p.name} (${p.side === 'right' ? 'main droite' : 'main gauche'} d’origine)`);
    for (const hand of ['right', 'left'] as const) this.handControls(hands, hand, handOptions, pieceValue(this.config.hands[hand]), fixed);

    // Echelle.
    const scale = this.section('Échelle du personnage (aperçu seulement)');
    const scaleInput = this.number(this.config.look.echelle, 0.05, (v) => {
      this.config.look.echelle = Math.max(0.1, v);
      this.updateLook();
    }, 'echelle');
    this.row(scale, `Échelle (${this.config.look.echelle})`, scaleInput);
    const quick = el('div', 'workshop-quick');
    for (const v of [0.8, 1, 1.1, 1.2, 1.3]) quick.appendChild(this.button(String(v), () => {
      this.config.look.echelle = v;
      this.updateLook();
      this.renderPanel();
    }, `echelle-${v}`));
    scale.appendChild(quick);

    // Couleurs.
    const colors = this.section('Couleurs (une zone : masque d’équipe)');
    this.row(colors, 'Palette', this.select(Object.keys(PALETTE_LABELS).map((id) => ({ value: id, label: PALETTE_LABELS[id]! })), this.config.look.palette, (v) => {
      this.config.look.palette = v;
      if (v !== 'custom') this.config.look.couleur = paletteHex(v);
      this.updateLook();
      this.renderPanel();
    }, 'palette'));
    const colorA = el('input');
    colorA.type = 'color';
    colorA.value = this.config.look.couleur;
    colorA.dataset['name'] = 'couleur';
    colorA.addEventListener('input', () => {
      this.config.look.couleur = colorA.value;
      this.config.look.palette = 'custom';
      this.updateLook();
    });
    this.row(colors, 'Couleur', colorA);
    const colorB = el('input');
    colorB.type = 'color';
    colorB.value = this.config.look.couleurB;
    colorB.dataset['name'] = 'couleurB';
    colorB.addEventListener('input', () => {
      this.config.look.couleurB = colorB.value;
      this.updateLook();
    });
    this.row(colors, 'Seconde couleur', colorB);
    this.row(colors, 'Mélange (0 – 1)', this.number(this.config.look.melange, 0.05, (v) => {
      this.config.look.melange = Math.min(1, Math.max(0, v));
      this.updateLook();
    }, 'melange'));
    this.row(colors, 'Intensité (0 – 1)', this.number(this.config.look.intensite, 0.05, (v) => {
      this.config.look.intensite = Math.min(1, Math.max(0, v));
      this.updateLook();
    }, 'intensite'));

    // Animation.
    const anim = this.section('Animation d’aperçu');
    const clips = this.model ? this.model.catalogue.clips.map((c) => ({ value: c.name, label: c.name.split('_').slice(1).join('_'), group: c.folder.split('/').pop()! })) : this.fixed!.clips.map((c) => ({ value: c.name, label: c.name }));
    this.row(anim, 'Clip', this.select(clips, this.config.look.animation, (v) => {
      this.config.look.animation = v;
      this.updateLook();
    }, 'animation'));
    const rotate = el('input');
    rotate.type = 'checkbox';
    rotate.checked = this.controls?.autoRotate ?? false;
    rotate.dataset['name'] = 'rotation-auto';
    rotate.addEventListener('change', () => {
      if (this.controls) this.controls.autoRotate = rotate.checked;
    });
    this.row(anim, 'Rotation automatique', rotate);

    // Export.
    const exp = this.section('Config (entrée units.json)');
    this.exportBox.spellcheck = false;
    exp.appendChild(this.exportBox);
    const actions = el('div', 'workshop-quick');
    actions.append(
      this.button('Copier la config', () => void navigator.clipboard?.writeText(exportConfigText(this.config)).catch(() => undefined), 'copier'),
      this.button('Exporter (.json)', () => this.download(), 'exporter'),
      this.button('Charger la config', () => this.importFromBox(), 'charger'),
    );
    exp.appendChild(actions);
    this.refreshOutputs();
  }

  /** Echelle propre d'une piece de corps : curseur (0,5 – 2), saisie libre,
   *  valeur exacte, Reset. Le curseur met a jour l'apercu en direct. */
  private pieceScaleControls(parent: HTMLElement, slot: BodySlot, fixed: boolean): void {
    const ref = this.config.body[slot];
    const value = ref?.scale ?? 1;
    const line = el('div', 'workshop-scale');
    const range = el('input', 'workshop-range');
    range.type = 'range';
    range.min = String(PIECE_SCALE_MIN);
    range.max = String(PIECE_SCALE_MAX);
    range.step = '0.01';
    range.value = String(value);
    range.dataset['name'] = `echelle-${slot}-curseur`;
    const shown = el('span', 'workshop-scale-value', `×${value.toFixed(3)}`);
    const input = this.number(value, 0.01, (v) => set(v, true), `echelle-${slot}`);
    const set = (v: number, rebuild: boolean) => {
      const current = this.config.body[slot];
      if (!current) return;
      current.scale = round(Math.max(0.05, v));
      shown.textContent = `×${current.scale.toFixed(3)}`;
      range.value = String(current.scale);
      input.value = String(current.scale);
      if (rebuild) this.applyConfig();
      else {
        this.model?.apply(this.config);
        this.refreshOutputs();
      }
    };
    range.addEventListener('input', () => set(Number(range.value), false));
    const reset = this.button('Reset', () => set(1, true), `echelle-${slot}-reset`);
    for (const c of [range, input, reset]) c.disabled = fixed || !ref;
    line.append(range, input, shown, reset);
    this.row(parent, `Échelle ${BODY_SLOT_LABELS[slot].toLowerCase()}`, line);
  }

  private handControls(parent: HTMLElement, hand: Hand, options: { value: string; label: string; group?: string }[], value: string, fixed: boolean): void {
    const h = this.config.hands[hand];
    const box = el('div', 'workshop-hand');
    box.appendChild(el('div', 'workshop-label', hand === 'right' ? 'Main droite' : 'Main gauche'));
    const set = (patch: Partial<HandConfig>, rebuild = true) => {
      this.config.hands[hand] = { ...this.config.hands[hand], ...patch };
      if (rebuild) this.applyConfig();
    };
    const s = this.select([{ value: '', label: 'Aucun' }, ...options], value, (v) => set(v ? parsePieceValue(v, this.config.source) : { piece: null }), `main-${hand}`);
    s.disabled = fixed;
    box.appendChild(s);
    const grid = el('div', 'workshop-transform');
    const field = (label: string, value: number, step: number, apply: (v: number) => void, name: string) => {
      const input = this.number(value, step, apply, name);
      input.disabled = fixed;
      const l = el('label', 'workshop-field');
      l.append(el('span', undefined, label), input);
      grid.appendChild(l);
    };
    field('Échelle', h.scale, 0.05, (v) => set({ scale: Math.max(0.05, v) }), `main-${hand}-echelle`);
    (['X', 'Y', 'Z'] as const).forEach((axis, i) => field(`Rot. ${axis} (°)`, h.rotation[i]!, 5, (v) => {
      const rotation = [...this.config.hands[hand].rotation] as [number, number, number];
      rotation[i] = v;
      set({ rotation });
    }, `main-${hand}-rot${axis}`));
    (['X', 'Y', 'Z'] as const).forEach((axis, i) => field(`Décal. ${axis}`, h.offset[i]!, 0.01, (v) => {
      const offset = [...this.config.hands[hand].offset] as [number, number, number];
      offset[i] = v;
      set({ offset });
    }, `main-${hand}-off${axis}`));
    box.appendChild(grid);
    const reset = this.button('Réinitialiser', () => set({ scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] }), `main-${hand}-reset`);
    reset.disabled = fixed;
    box.appendChild(reset);
    parent.appendChild(box);
  }

  private refreshOutputs(): void {
    this.exportBox.value = exportConfigText(this.config);
    const lines: string[] = [];
    if (this.model) {
      const s = this.model.stats();
      const scaled = BODY_SLOTS.filter((slot) => (this.config.body[slot]?.scale ?? 1) !== 1).map((slot) => `${BODY_SLOT_LABELS[slot].toLowerCase()} ×${this.config.body[slot]!.scale}`);
      lines.push(
        `${s.sources.length > 1 ? 'Sources' : 'Source'} : ${s.sources.map(sourceTag).join(' + ') || sourceTag(this.config.source)} (base : ${this.config.source})`,
        `Triangles : ${s.triangles} · Sommets : ${s.sommets}`,
        `Os : ${s.os} · Matériaux : ${s.materiaux} · Clips : ${s.clips}`,
        `Échelle : ${this.config.look.echelle}${scaled.length ? ` · pièces : ${scaled.join(', ')}` : ''}`,
        `Pièces : ${s.pieces.join(', ') || '—'}`,
      );
    } else if (this.fixed) {
      let triangles = 0, sommets = 0;
      const materials = new Set<string>();
      let bones = 0;
      this.fixed.root.traverse((obj) => {
        const mesh = obj as THREE.SkinnedMesh;
        if ((obj as THREE.Bone).isBone) bones++;
        if (!mesh.isMesh) return;
        const g = mesh.geometry;
        triangles += (g.index ? g.index.count : g.attributes['position']!.count) / 3;
        sommets += g.attributes['position']!.count;
        materials.add((mesh.material as THREE.Material).uuid);
      });
      lines.push(`Source : ${this.config.source} (preset fixe ${TOON_UNITS[this.fixed.kind].file})`, `Triangles : ${triangles} · Sommets : ${sommets}`, `Os : ${bones} · Matériaux : ${materials.size} · Clips : ${this.fixed.clips.length}`, `Échelle : ${this.config.look.echelle}`);
    }
    this.statsBox.replaceChildren(...lines.map((t) => el('div', undefined, t)));
  }

  private download(): void {
    const blob = new Blob([exportConfigText(this.config)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.config.name || 'atelier_unite'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** Recharge la config collee dans la zone de texte. */
  private importFromBox(): void {
    try {
      const config = importConfigText(this.exportBox.value);
      const unknown = configSources(config).find((s) => !this.catalogues.has(s));
      if (unknown) throw new Error(`Source inconnue : ${unknown}`);
      this.useSource(config.source);
      this.config = config;
      this.notice.textContent = '';
      this.applyConfig();
    } catch (error) {
      this.notice.textContent = `Config illisible : ${(error as Error).message}`;
    }
  }
}
