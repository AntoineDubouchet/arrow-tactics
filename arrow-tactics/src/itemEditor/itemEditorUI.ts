import * as THREE from 'three';
import { EQUIPMENT, EQUIPMENT_SLOT_ORDER, EQUIPMENT_SLOTS, EQUIPMENT_STAT_DEFS, EQUIPMENT_TYPES, RARITIES, RARITY_ORDER, type EquipmentDef, type EquipmentStatKey } from '../data/equipment';
import { describeEquipment } from '../run/heroEquipment';
import { configFromEntry, type BodySlot, type WorkshopConfig } from '../workshop/workshopConfig';
import { loadCatalogue, WorkshopModel, type LoadedCatalogue } from '../workshop/workshopModel';
import { WorkshopStage } from '../workshop/workshopStage';
import { cleanItem, defaultItem, exportItem, importItem, itemIdFromName } from './itemEditorConfig';

/**
 * Editeur d'items (2026-11-02, outil interne, menu principal) : compose un
 * equipement du Heros sans code — nom, description, rarete, type,
 * emplacement, visuel (source, piece, echelle, rotation, decalage), stats,
 * effets, valeur de vente — avec un apercu du Paladin qui le porte. Reutilise
 * l'Atelier : scene (WorkshopStage), composition (WorkshopModel), preset du
 * Heros (catalogue, units.json) et placement des objets tenus. Export :
 * `{ "<id>": <item> }` (data/equipment.ts, EQUIPMENT), copie, fichier JSON,
 * rechargement d'un texte colle.
 */
const SOURCES = [
  { id: 'western_kingdoms', label: 'Humains (Western Kingdoms)' },
  { id: 'barbarian', label: 'Barbares' },
] as const;

/** Type propose a chaque emplacement (modifiable ensuite). */
const SLOT_TYPES: Readonly<Record<EquipmentDef['slot'], EquipmentDef['type']>> = {
  mainHand: 'weapon',
  offHand: 'offhand',
  shield: 'shield',
  helmet: 'armor',
  shoulders: 'armor',
  chest: 'armor',
  arms: 'armor',
  legs: 'armor',
  cape: 'armor',
};

/** Porteur de l'apercu : preset du Heros dans le catalogue de sa source. */
const PREVIEW_HERO = { source: 'western_kingdoms', preset: 'human_hero' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class ItemEditor {
  private readonly overlay = el('div', 'workshop item-editor');
  private readonly panel = el('div', 'workshop-panel');
  private readonly view = el('div', 'workshop-view');
  private readonly canvas = el('canvas', 'workshop-canvas');
  private readonly card = el('div', 'item-editor-card');
  private readonly notice = el('div', 'workshop-notice');
  private readonly exportBox = el('textarea', 'workshop-export');
  private readonly stage = new WorkshopStage(this.canvas);
  private readonly clock = new THREE.Clock();
  private frame = 0;
  private catalogues = new Map<string, LoadedCatalogue>();
  private model: WorkshopModel | null = null;
  private heroConfig: WorkshopConfig | null = null;
  private item: EquipmentDef = defaultItem();
  private animated = false;
  private open_ = false;

  constructor(private readonly onClose: () => void) {
    this.overlay.hidden = true;
    this.overlay.append(this.panel, this.view);
    this.view.append(this.canvas, this.card, this.notice);
    document.body.appendChild(this.overlay);
  }

  get isOpen(): boolean {
    return this.open_;
  }

  async open(): Promise<void> {
    this.overlay.hidden = false;
    this.open_ = true;
    this.stage.ensureRenderer();
    this.panel.replaceChildren(el('div', 'workshop-title', "Éditeur d'items"), el('div', 'workshop-hint', 'Chargement des catalogues…'));
    try {
      for (const { id } of SOURCES) this.catalogues.set(id, await loadCatalogue(id));
    } catch (error) {
      this.panel.replaceChildren(el('div', 'workshop-title', "Éditeur d'items"), el('div', 'workshop-hint', `Catalogue indisponible : ${(error as Error).message}`), this.closeButton());
      return;
    }
    if (!this.model) {
      const base = this.catalogues.get(PREVIEW_HERO.source)!;
      this.model = new WorkshopModel(base, this.catalogues);
      this.stage.scene.add(this.model.root);
      const entry = base.catalogue.presets[PREVIEW_HERO.preset];
      this.heroConfig = entry ? configFromEntry(PREVIEW_HERO.preset, entry) : null;
    }
    this.renderPanel();
    this.refresh();
    this.loop();
  }

  close(): void {
    this.overlay.hidden = true;
    this.open_ = false;
    cancelAnimationFrame(this.frame);
    this.onClose();
  }

  private loop = (): void => {
    if (!this.open_) return;
    this.frame = requestAnimationFrame(this.loop);
    this.model?.mixer.update(Math.min(this.clock.getDelta(), 0.1));
    this.stage.render();
  };

  // --- Item ---------------------------------------------------------------

  private set(patch: Partial<EquipmentDef>, rebuildPanel = false): void {
    this.item = { ...this.item, ...patch };
    if (rebuildPanel) this.renderPanel();
    this.refresh();
  }

  /** Apercu (Paladin portant l'item), carte et texte exporte. */
  private refresh(): void {
    const item = this.item;
    // Apercu : le preset du Heros, l'item a la place de l'emplacement vise.
    if (this.model && this.heroConfig) {
      const config: WorkshopConfig = structuredClone(this.heroConfig);
      const slot = EQUIPMENT_SLOTS[item.slot];
      const v = item.visual;
      if (slot.hand && v) config.hands[slot.hand] = { piece: v.piece, source: v.source, scale: v.scale, rotation: [...v.rotation], offset: [...v.offset] };
      if (slot.bodySlot && v) config.body[slot.bodySlot as BodySlot] = { piece: v.piece, source: v.source, scale: v.scale };
      config.allSources = true;
      this.model.apply(config);
      if (!this.animated) this.animated = this.model.play('Infantry_combatIdle') || this.model.play('Infantry_idle');
    }
    // Carte : nom a la couleur de la rarete, cadre, lignes.
    const rarity = RARITIES[item.rarity];
    this.card.style.borderColor = rarity.color;
    const name = el('div', 'item-editor-card-name', item.name || '(sans nom)');
    name.style.color = rarity.color;
    const lines = describeEquipment(item);
    this.card.replaceChildren(
      name,
      el('div', 'item-editor-card-meta', `${rarity.name} · ${EQUIPMENT_TYPES[item.type]} · ${EQUIPMENT_SLOTS[item.slot].label}`),
      ...(item.description ? [el('div', 'item-editor-card-desc', item.description)] : []),
      ...lines.map((l) => el('div', 'item-editor-card-line', l)),
      el('div', 'item-editor-card-meta', `Valeur de vente : ${item.sellValue} or`),
    );
    this.exportBox.value = exportItem(item);
  }

  // --- Panneau ------------------------------------------------------------

  private renderPanel(): void {
    const item = this.item;
    const p = this.panel;
    p.replaceChildren(el('div', 'workshop-title', "Éditeur d'items"));

    const top = this.section('Item');
    this.row(top, 'Partir de', this.select([{ value: '', label: '— item du catalogue —' }, ...Object.values(EQUIPMENT).map((e) => ({ value: e.id, label: e.name }))], '', (v) => {
      if (v) this.load(structuredClone(EQUIPMENT[v]!));
    }, 'preset'));
    this.row(top, 'Nom', this.text(item.name, (v) => this.set({ name: v, id: item.id === itemIdFromName(item.name) ? itemIdFromName(v) : item.id }), 'name'));
    this.row(top, 'Identifiant', this.text(item.id, (v) => this.set({ id: itemIdFromName(v) }), 'id'));
    const description = el('textarea', 'workshop-text');
    description.rows = 2;
    description.value = item.description;
    description.dataset['name'] = 'description';
    description.addEventListener('input', () => this.set({ description: description.value }));
    this.row(top, 'Description', description);
    const rarity = this.select(RARITY_ORDER.map((r) => ({ value: r, label: RARITIES[r].name })), item.rarity, (v) => this.set({ rarity: v as EquipmentDef['rarity'] }, true), 'rarity');
    rarity.style.color = RARITIES[item.rarity].color;
    this.row(top, 'Rareté', rarity);
    this.row(top, 'Type', this.select(Object.entries(EQUIPMENT_TYPES).map(([value, label]) => ({ value, label })), item.type, (v) => this.set({ type: v as EquipmentDef['type'] }), 'type'));
    this.row(top, 'Emplacement', this.select(EQUIPMENT_SLOT_ORDER.map((s) => ({ value: s, label: EQUIPMENT_SLOTS[s].label })), item.slot, (v) => this.changeSlot(v as EquipmentDef['slot']), 'slot'));
    this.row(top, 'Valeur de vente', this.number(item.sellValue, 1, (v) => this.set({ sellValue: Math.max(0, v) }), 'sellValue'));

    const visual = this.section('Visuel');
    const pieces = this.piecesFor(item.visual?.source ?? 'western_kingdoms');
    this.row(visual, 'Source', this.select(SOURCES.map((s) => ({ value: s.id, label: s.label })), item.visual?.source ?? 'western_kingdoms', (v) => {
      const first = this.preferredPiece(v, item.slot);
      this.set({ visual: first ? { source: v, piece: first, scale: item.visual?.scale ?? 1, rotation: item.visual?.rotation ?? [0, 0, 0], offset: item.visual?.offset ?? [0, 0, 0] } : null }, true);
    }, 'source'));
    if (pieces.length === 0) visual.appendChild(el('div', 'workshop-hint', 'Aucune pièce séparée pour cet emplacement dans ce pack : item sans visuel.'));
    this.row(visual, 'Pièce', this.select([{ value: '', label: 'Aucun visuel' }, ...pieces.map((n) => ({ value: n, label: n }))], item.visual?.piece ?? '', (v) => {
      this.set({ visual: v ? { source: item.visual?.source ?? 'western_kingdoms', piece: v, scale: item.visual?.scale ?? 1, rotation: item.visual?.rotation ?? [0, 0, 0], offset: item.visual?.offset ?? [0, 0, 0] } : null }, true);
    }, 'piece'));
    if (item.visual) {
      const v = item.visual;
      this.row(visual, 'Échelle', this.number(v.scale, 0.05, (n) => this.set({ visual: { ...v, scale: Math.max(0.05, n) } }), 'scale'));
      if (EQUIPMENT_SLOTS[item.slot].hand) {
        (['X', 'Y', 'Z'] as const).forEach((axis, i) => {
          this.row(visual, `Rotation ${axis} (°)`, this.number(v.rotation[i]!, 5, (n) => { const r = [...this.item.visual!.rotation] as [number, number, number]; r[i] = n; this.set({ visual: { ...this.item.visual!, rotation: r } }); }, `rot${axis}`));
        });
        (['X', 'Y', 'Z'] as const).forEach((axis, i) => {
          this.row(visual, `Décalage ${axis}`, this.number(v.offset[i]!, 0.01, (n) => { const o = [...this.item.visual!.offset] as [number, number, number]; o[i] = n; this.set({ visual: { ...this.item.visual!, offset: o } }); }, `off${axis}`));
        });
      }
    }

    const stats = this.section('Stats (points affichés)');
    for (const def of EQUIPMENT_STAT_DEFS) {
      this.row(stats, `${def.label}${def.unit ? ` (${def.unit})` : ''}`, this.number(item.stats[def.key] ?? 0, def.step, (n) => this.set({ stats: { ...this.item.stats, [def.key as EquipmentStatKey]: n } }), `stat-${def.key}`));
    }
    const effects = this.section('Effets spéciaux');
    this.row(effects, 'Feu à chaque coup', this.number(item.effects.onHit?.fireDamage ?? 0, 0.5, (n) => this.set({ effects: n ? { onHit: { fireDamage: n } } : {} }), 'fireDamage'));
    effects.appendChild(el('div', 'workshop-hint', 'Dégâts de feu ajoutés à chaque coup de mêlée qui touche.'));

    const io = this.section('Export / import');
    const actions = el('div', 'item-editor-actions');
    actions.append(
      this.button('Copier la config', () => {
        this.exportBox.value = exportItem(this.item);
        void navigator.clipboard?.writeText(this.exportBox.value).then(() => this.say('Config copiée.'), () => this.say('Copie impossible : texte sélectionné ci-dessous.'));
        this.exportBox.select();
      }),
      this.button('Exporter JSON', () => {
        const url = URL.createObjectURL(new Blob([exportItem(this.item)], { type: 'application/json' }));
        const a = el('a');
        a.href = url;
        a.download = `${cleanItem(this.item).id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.say(`Fichier ${a.download} exporté.`);
      }),
      this.button('Charger config', () => {
        try {
          this.load(importItem(this.exportBox.value));
          this.say('Config chargée.');
        } catch (error) {
          this.say(`Config refusée : ${(error as Error).message}`);
        }
      }),
    );
    io.append(actions, el('div', 'workshop-hint', 'Coller une config ci-dessous puis « Charger config ».'), this.exportBox);
    p.appendChild(this.closeButton());
  }

  private load(item: EquipmentDef): void {
    this.item = cleanItem(item);
    this.renderPanel();
    this.refresh();
  }

  /** Changement d'emplacement : type assorti et piece la plus plausible de
   *  la source (bouclier, arme de main droite, objet de main gauche). */
  private changeSlot(slot: EquipmentDef['slot']): void {
    const source = this.item.visual?.source ?? 'western_kingdoms';
    const piece = this.preferredPiece(source, slot);
    this.set({ slot, type: SLOT_TYPES[slot], visual: piece ? { source, piece, scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] } : null }, true);
  }

  private preferredPiece(source: string, slot: EquipmentDef['slot']): string | undefined {
    const pieces = (this.catalogues.get(source)?.catalogue.pieces ?? []).filter((p) => this.piecesForSlot(source, slot).includes(p.name));
    const shield = (n: string): boolean => /shield/i.test(n);
    const pick =
      slot === 'shield' ? pieces.find((p) => shield(p.name))
      : slot === 'mainHand' ? pieces.find((p) => p.side === 'right')
      : slot === 'offHand' ? pieces.find((p) => p.side === 'left' && !shield(p.name))
      : undefined;
    return (pick ?? pieces[0])?.name;
  }

  private piecesFor(source: string): string[] {
    return this.piecesForSlot(source, this.item.slot);
  }

  /** Pieces d'une source pour un emplacement : objets tenus (mains) ou
   *  pieces de corps de l'emplacement de l'Atelier (tete, epaulieres...). */
  private piecesForSlot(source: string, slot: EquipmentDef['slot']): string[] {
    const def = EQUIPMENT_SLOTS[slot];
    const wanted = def.hand ? 'hand' : def.bodySlot;
    return (this.catalogues.get(source)?.catalogue.pieces ?? []).filter((p) => p.slot === wanted).map((p) => p.name);
  }

  // --- Champs ---------------------------------------------------------------

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

  private select(options: readonly { value: string; label: string }[], value: string, onChange: (v: string) => void, name: string): HTMLSelectElement {
    const s = el('select', 'workshop-select');
    s.dataset['name'] = name;
    for (const o of options) {
      const option = el('option', undefined, o.label);
      option.value = o.value;
      s.appendChild(option);
    }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  private text(value: string, onChange: (v: string) => void, name: string): HTMLInputElement {
    const input = el('input', 'workshop-text');
    input.value = value;
    input.dataset['name'] = name;
    input.addEventListener('change', () => onChange(input.value));
    return input;
  }

  private number(value: number, step: number, onChange: (v: number) => void, name: string): HTMLInputElement {
    const input = el('input', 'workshop-number');
    input.type = 'number';
    input.step = String(step);
    input.value = String(value);
    input.dataset['name'] = name;
    input.addEventListener('input', () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) onChange(n);
    });
    return input;
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'workshop-button', label);
    b.addEventListener('click', onClick);
    return b;
  }

  private closeButton(): HTMLButtonElement {
    return this.button('Fermer', () => this.close());
  }

  private say(text: string): void {
    this.notice.textContent = text;
  }
}
