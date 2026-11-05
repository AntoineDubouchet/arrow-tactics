/**
 * Equipement des Heros (2026-11-02, items / loot) : donnees pures. Un item
 * decrit son emplacement, sa rarete, son archetype, son visuel (piece d'un
 * catalogue Toon RTS, meme format que les mains de l'Atelier), ses bonus de
 * stats au niveau 1, sa progression par niveau, ses effets speciaux et sa
 * valeur de vente. Aucune exception par id : la simulation ne recoit que des
 * bonus deja resolus (run/heroEquipment.ts).
 *
 * BANQUE D'ITEMS UNIQUE (2026-11-05, decision d'Antoine, G46) : tout le loot
 * vient de ce catalogue concu a la main, identifie par un id stable. AUCUNE
 * stat aleatoire : un item a un niveau donne a TOUJOURS les memes stats
 * (statsAtLevel : base + progression x (niveau - 1)). Le hasard ne porte
 * que sur le CHOIX de l'item (RNG deterministe du jeu). Exactement deux
 * items par emplacement pour l'instant ; les trois orientations (tank,
 * degats physiques, degats magiques) sont presentes dans la banque.
 *
 * Unites : les stats et effets sont en points AFFICHES (comme la fiche :
 * « +3 degats » = 3 points, soit 30 internes, HP_PER_PIP) ; vitesse
 * d'attaque en % ; vitesse de deplacement en cases/s ; regeneration de mana
 * par seconde. Valeurs PROVISOIRES.
 *
 * Catalogue editable sans code : Editeur d'items (src/itemEditor), qui
 * exporte une entree de ce format (progression comprise).
 */

export type EquipmentRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RarityDef {
  id: EquipmentRarity;
  name: string;
  /** Couleur du nom et du cadre (#rrggbb). */
  color: string;
}

export const RARITIES: Readonly<Record<EquipmentRarity, RarityDef>> = {
  common: { id: 'common', name: 'Commune', color: '#e6e6e6' },
  uncommon: { id: 'uncommon', name: 'Peu commune', color: '#4fd16a' },
  rare: { id: 'rare', name: 'Rare', color: '#4a9cff' },
  epic: { id: 'epic', name: 'Épique', color: '#b26cff' },
  legendary: { id: 'legendary', name: 'Légendaire', color: '#ff9a2e' },
};
export const RARITY_ORDER: readonly EquipmentRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** Emplacements d'equipement. Extensible : un nouvel emplacement = une entree
 *  ici. `hand` : objet tenu (droite / gauche) ; `bodySlot` : piece de corps
 *  remplacee (emplacement de l'Atelier) ; `exclusiveWith` : emplacements qui
 *  occupent la meme main. */
export type EquipmentSlot = 'mainHand' | 'offHand' | 'shield' | 'helmet' | 'shoulders' | 'chest' | 'arms' | 'legs' | 'cape';

export interface EquipmentSlotDef {
  id: EquipmentSlot;
  label: string;
  hand: 'right' | 'left' | null;
  bodySlot: 'head' | 'shoulderpads' | 'helmet' | 'body' | 'arms' | 'legs' | 'cape' | null;
  exclusiveWith: readonly EquipmentSlot[];
}

export const EQUIPMENT_SLOTS: Readonly<Record<EquipmentSlot, EquipmentSlotDef>> = {
  mainHand: { id: 'mainHand', label: 'Arme principale', hand: 'right', bodySlot: null, exclusiveWith: [] },
  offHand: { id: 'offHand', label: 'Main secondaire', hand: 'left', bodySlot: null, exclusiveWith: ['shield'] },
  shield: { id: 'shield', label: 'Bouclier', hand: 'left', bodySlot: null, exclusiveWith: ['offHand'] },
  helmet: { id: 'helmet', label: 'Casque', hand: null, bodySlot: 'head', exclusiveWith: [] },
  shoulders: { id: 'shoulders', label: 'Épaulières', hand: null, bodySlot: 'shoulderpads', exclusiveWith: [] },
  // Torse, bras, jambes (2026-11-02) : stats et interface ; visuel en jeu
  // pas encore (modele du Heros fusionne, KI-44).
  chest: { id: 'chest', label: 'Torse', hand: null, bodySlot: 'body', exclusiveWith: [] },
  arms: { id: 'arms', label: 'Bras', hand: null, bodySlot: 'arms', exclusiveWith: [] },
  legs: { id: 'legs', label: 'Jambes', hand: null, bodySlot: 'legs', exclusiveWith: [] },
  cape: { id: 'cape', label: 'Cape', hand: null, bodySlot: 'cape', exclusiveWith: [] },
};
export const EQUIPMENT_SLOT_ORDER: readonly EquipmentSlot[] = ['mainHand', 'offHand', 'shield', 'helmet', 'shoulders', 'chest', 'arms', 'legs', 'cape'];

/** Emplacements de la fiche du personnage, disposes comme le corps
 *  (2026-11-02) : la main gauche accepte main secondaire ou bouclier. */
export const BODY_LAYOUT: readonly { id: string; label: string; accepts: readonly EquipmentSlot[] }[] = [
  { id: 'head', label: 'Tête', accepts: ['helmet'] },
  { id: 'shoulders', label: 'Épaules', accepts: ['shoulders'] },
  { id: 'chest', label: 'Torse', accepts: ['chest'] },
  { id: 'arms', label: 'Bras', accepts: ['arms'] },
  { id: 'right', label: 'Main droite', accepts: ['mainHand'] },
  { id: 'left', label: 'Main gauche', accepts: ['offHand', 'shield'] },
  { id: 'legs', label: 'Jambes', accepts: ['legs'] },
  { id: 'cape', label: 'Cape', accepts: ['cape'] },
];

export type EquipmentType = 'weapon' | 'shield' | 'offhand' | 'armor' | 'accessory';
export const EQUIPMENT_TYPES: Readonly<Record<EquipmentType, string>> = {
  weapon: 'Arme',
  shield: 'Bouclier',
  offhand: 'Objet de main secondaire',
  armor: 'Armure',
  accessory: 'Accessoire',
};

/** Orientation d'un item (2026-11-05) : tank (PV, defense), degats physiques
 *  (attaque de base, Tourbillon), degats magiques (sorts offensifs, mana). */
export type EquipmentArchetype = 'tank' | 'physical' | 'magic';
export const EQUIPMENT_ARCHETYPES: Readonly<Record<EquipmentArchetype, string>> = {
  tank: 'Tank',
  physical: 'Dégâts physiques',
  magic: 'Dégâts magiques',
};

/** Visuel : piece d'un catalogue Toon RTS (`western_kingdoms`, `barbarian`,
 *  futures sources), echelle, rotation (degres) et decalage autour de la
 *  prise — meme format que les mains de l'Atelier (HandConfig). */
export interface EquipmentVisual {
  source: string;
  piece: string;
  scale: number;
  rotation: [number, number, number];
  offset: [number, number, number];
}

/** Bonus de stats (points affiches, voir l'en-tete). Deux familles de degats
 *  (2026-11-05, DamageType) : `physicalDamage` s'ajoute a l'attaque de base
 *  (melee, Tourbillon qui la fige) ; `magicDamage` aux sorts offensifs
 *  (aucun pour le Heros aujourd'hui : porte par les donnees pour l'avenir),
 *  jamais a l'attaque de base. */
export interface EquipmentStats {
  maxHp?: number;
  maxMana?: number;
  manaRegen?: number;
  physicalDamage?: number;
  magicDamage?: number;
  /** Vitesse d'attaque, en % (10 = 10 % de coups en plus par seconde). */
  attackSpeed?: number;
  moveSpeed?: number;
}
export type EquipmentStatKey = keyof EquipmentStats;

export const EQUIPMENT_STAT_DEFS: readonly { key: EquipmentStatKey; label: string; unit: string; step: number }[] = [
  { key: 'maxHp', label: 'PV max', unit: 'PV', step: 1 },
  { key: 'maxMana', label: 'Mana max', unit: '', step: 1 },
  { key: 'manaRegen', label: 'Régénération de mana', unit: '/ s', step: 0.1 },
  { key: 'physicalDamage', label: 'Dégâts physiques', unit: '', step: 0.5 },
  { key: 'magicDamage', label: 'Dégâts magiques', unit: '', step: 0.5 },
  { key: 'attackSpeed', label: "Vitesse d'attaque", unit: '%', step: 1 },
  { key: 'moveSpeed', label: 'Vitesse de déplacement', unit: 'cases/s', step: 0.1 },
];

/** Effets speciaux (donnees generiques, jamais un test sur l'id d'un item).
 *  Aujourd'hui : degats de feu a chaque coup qui touche (degats MAGIQUES,
 *  2026-11-05). Prevus (non implementes) : vol de vie, bonus contre un type
 *  d'ennemi, regeneration, bonus de recolte. */
export interface EquipmentEffects {
  onHit?: {
    /** Degats de feu ajoutes a chaque coup de melee qui touche (points). */
    fireDamage?: number;
  };
}

export interface EquipmentDef {
  id: string;
  name: string;
  description: string;
  rarity: EquipmentRarity;
  type: EquipmentType;
  slot: EquipmentSlot;
  archetype: EquipmentArchetype;
  visual: EquipmentVisual | null;
  /** Stats au niveau 1. */
  stats: EquipmentStats;
  /** Progression par niveau au-dela du 1 (points affiches par niveau) :
   *  deterministe, statsAtLevel. Vide : item fixe. */
  scaling: EquipmentStats;
  effects: EquipmentEffects;
  /** Valeur de vente (or), pour le futur Marche. */
  sellValue: number;
}

/** Niveau minimal d'un exemplaire (ItemInstance.level). */
export const ITEM_LEVEL_MIN = 1;

/** Exemplaire d'un item : definition fixe + niveau. Deux exemplaires du meme
 *  item au meme niveau sont identiques. */
export interface ItemInstance {
  itemId: string;
  level: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Stats d'un item a `level` : base + progression x (niveau - 1), sans
 *  aucun hasard. Niveau borne a ITEM_LEVEL_MIN. */
export function statsAtLevel(def: Pick<EquipmentDef, 'stats' | 'scaling'>, level: number): EquipmentStats {
  const steps = Math.max(ITEM_LEVEL_MIN, Math.floor(level)) - ITEM_LEVEL_MIN;
  const out: EquipmentStats = {};
  for (const { key } of EQUIPMENT_STAT_DEFS) {
    const v = (def.stats[key] ?? 0) + (def.scaling[key] ?? 0) * steps;
    if (v) out[key] = round2(v);
  }
  return out;
}

const wk = (piece: string, scale = 1): EquipmentVisual => ({ source: 'western_kingdoms', piece, scale, rotation: [0, 0, 0], offset: [0, 0, 0] });
const brb = (piece: string, scale = 1): EquipmentVisual => ({ source: 'barbarian', piece, scale, rotation: [0, 0, 0], offset: [0, 0, 0] });

/** Catalogue des items : la banque (2 par emplacement). PROVISOIRE. Les
 *  pieces de corps (torse, bras, jambes, cape, casque) n'ont pas encore de
 *  visuel en jeu (KI-44) ; les objets de main secondaire non plus. */
export const EQUIPMENT: Readonly<Record<string, EquipmentDef>> = {
  // ---- Arme principale
  starter_sword: {
    id: 'starter_sword',
    name: 'Épée du débutant',
    description: 'Une lame simple mais fiable, plus vive que le marteau.',
    rarity: 'common',
    type: 'weapon',
    slot: 'mainHand',
    archetype: 'physical',
    visual: wk('WK_weapon_sword_A', 1.1),
    stats: { physicalDamage: 3 },
    scaling: { physicalDamage: 0.5 },
    effects: {},
    sellValue: 4,
  },
  ember_blade: {
    id: 'ember_blade',
    name: 'Lame des braises',
    description: 'Une épée barbare encore chaude de la forge : chaque coup brûle.',
    rarity: 'uncommon',
    type: 'weapon',
    slot: 'mainHand',
    archetype: 'physical',
    visual: brb('BRB_weapon_sword_B', 1.15),
    stats: { physicalDamage: 4 },
    scaling: { physicalDamage: 0.5 },
    effects: { onHit: { fireDamage: 3 } },
    sellValue: 12,
  },
  // ---- Main secondaire
  hunting_dagger: {
    id: 'hunting_dagger',
    name: 'Dague de chasse',
    description: 'Courte et nerveuse : des coups plus rapprochés.',
    rarity: 'common',
    type: 'offhand',
    slot: 'offHand',
    archetype: 'physical',
    visual: null,
    stats: { physicalDamage: 1.5, attackSpeed: 10 },
    scaling: { physicalDamage: 0.3, attackSpeed: 1 },
    effects: {},
    sellValue: 5,
  },
  spell_focus: {
    id: 'spell_focus',
    name: 'Orbe de concentration',
    description: 'Un globe de verre qui canalise le mana.',
    rarity: 'uncommon',
    type: 'offhand',
    slot: 'offHand',
    archetype: 'magic',
    visual: null,
    stats: { magicDamage: 3, maxMana: 5 },
    scaling: { magicDamage: 0.5, maxMana: 1 },
    effects: {},
    sellValue: 10,
  },
  // ---- Bouclier
  sturdy_shield: {
    id: 'sturdy_shield',
    name: 'Bouclier robuste',
    description: 'Un écu épais cerclé de fer.',
    rarity: 'uncommon',
    type: 'shield',
    slot: 'shield',
    archetype: 'tank',
    visual: wk('WK_Shield_B'),
    stats: { maxHp: 8 },
    scaling: { maxHp: 1 },
    effects: {},
    sellValue: 10,
  },
  runic_ward: {
    id: 'runic_ward',
    name: 'Targe runique',
    description: 'Une petite targe gravée de runes qui nourrit le mana.',
    rarity: 'rare',
    type: 'shield',
    slot: 'shield',
    archetype: 'magic',
    visual: wk('WK_Shield_D', 0.9),
    stats: { maxHp: 3, maxMana: 6, manaRegen: 0.3 },
    scaling: { maxHp: 0.5, maxMana: 1, manaRegen: 0.05 },
    effects: {},
    sellValue: 18,
  },
  // ---- Casque
  iron_helm: {
    id: 'iron_helm',
    name: 'Heaume de fer',
    description: 'Un heaume lourd qui encaisse les coups.',
    rarity: 'common',
    type: 'armor',
    slot: 'helmet',
    archetype: 'tank',
    visual: null,
    stats: { maxHp: 6 },
    scaling: { maxHp: 1 },
    effects: {},
    sellValue: 5,
  },
  sage_circlet: {
    id: 'sage_circlet',
    name: 'Diadème du sage',
    description: 'Un cercle d\'argent qui aiguise l\'esprit.',
    rarity: 'uncommon',
    type: 'armor',
    slot: 'helmet',
    archetype: 'magic',
    visual: null,
    stats: { maxMana: 6, manaRegen: 0.3, magicDamage: 1 },
    scaling: { maxMana: 1, manaRegen: 0.05, magicDamage: 0.3 },
    effects: {},
    sellValue: 9,
  },
  // ---- Epaulieres
  guard_pauldrons: {
    id: 'guard_pauldrons',
    name: 'Épaulières de garde',
    description: 'Des épaulières de cuir clouté.',
    rarity: 'common',
    type: 'armor',
    slot: 'shoulders',
    archetype: 'tank',
    visual: brb('BRB_shoulderpads_C'),
    stats: { maxHp: 4, moveSpeed: 0.1 },
    scaling: { maxHp: 0.5 },
    effects: {},
    sellValue: 3,
  },
  berserker_spaulders: {
    id: 'berserker_spaulders',
    name: 'Spallières du berserker',
    description: 'Des épaulières barbares faites pour frapper plus fort.',
    rarity: 'uncommon',
    type: 'armor',
    slot: 'shoulders',
    archetype: 'physical',
    visual: brb('BRB_shoulderpads_C', 1.1),
    stats: { physicalDamage: 1.5, attackSpeed: 5 },
    scaling: { physicalDamage: 0.3, attackSpeed: 0.5 },
    effects: {},
    sellValue: 9,
  },
  // ---- Torse
  plate_cuirass: {
    id: 'plate_cuirass',
    name: 'Cuirasse de plates',
    description: 'La pièce maîtresse d\'une armure lourde.',
    rarity: 'rare',
    type: 'armor',
    slot: 'chest',
    archetype: 'tank',
    visual: null,
    stats: { maxHp: 10 },
    scaling: { maxHp: 1.5 },
    effects: {},
    sellValue: 20,
  },
  battle_mail: {
    id: 'battle_mail',
    name: 'Cotte de bataille',
    description: 'Une cotte de mailles qui laisse les bras libres.',
    rarity: 'common',
    type: 'armor',
    slot: 'chest',
    archetype: 'physical',
    visual: null,
    stats: { maxHp: 4, physicalDamage: 2 },
    scaling: { maxHp: 0.5, physicalDamage: 0.3 },
    effects: {},
    sellValue: 6,
  },
  // ---- Bras
  heavy_gauntlets: {
    id: 'heavy_gauntlets',
    name: 'Gantelets lourds',
    description: 'Des gantelets de fer : chaque coup pèse.',
    rarity: 'common',
    type: 'armor',
    slot: 'arms',
    archetype: 'physical',
    visual: null,
    stats: { physicalDamage: 2 },
    scaling: { physicalDamage: 0.4 },
    effects: {},
    sellValue: 5,
  },
  weaver_sleeves: {
    id: 'weaver_sleeves',
    name: 'Manches du tisseur',
    description: 'Des manches brodées de fils de mana.',
    rarity: 'uncommon',
    type: 'armor',
    slot: 'arms',
    archetype: 'magic',
    visual: null,
    stats: { magicDamage: 2, manaRegen: 0.2 },
    scaling: { magicDamage: 0.4, manaRegen: 0.05 },
    effects: {},
    sellValue: 9,
  },
  // ---- Jambes
  march_greaves: {
    id: 'march_greaves',
    name: 'Grèves de marche',
    description: 'Des jambières solides pour tenir la ligne.',
    rarity: 'common',
    type: 'armor',
    slot: 'legs',
    archetype: 'tank',
    visual: null,
    stats: { maxHp: 5, moveSpeed: 0.2 },
    scaling: { maxHp: 1 },
    effects: {},
    sellValue: 5,
  },
  swift_leggings: {
    id: 'swift_leggings',
    name: 'Chausses légères',
    description: 'Du cuir souple : on frappe et on bouge plus vite.',
    rarity: 'uncommon',
    type: 'armor',
    slot: 'legs',
    archetype: 'physical',
    visual: null,
    stats: { attackSpeed: 8, moveSpeed: 0.3, physicalDamage: 1 },
    scaling: { attackSpeed: 1, physicalDamage: 0.2 },
    effects: {},
    sellValue: 9,
  },
  // ---- Cape
  wool_cloak: {
    id: 'wool_cloak',
    name: 'Cape de laine',
    description: 'Une cape épaisse qui tient chaud et amortit.',
    rarity: 'common',
    type: 'accessory',
    slot: 'cape',
    archetype: 'tank',
    visual: null,
    stats: { maxHp: 5, manaRegen: 0.1 },
    scaling: { maxHp: 1 },
    effects: {},
    sellValue: 4,
  },
  arcane_mantle: {
    id: 'arcane_mantle',
    name: 'Mante arcanique',
    description: 'Une cape brodée de symboles qui vibrent de mana.',
    rarity: 'rare',
    type: 'accessory',
    slot: 'cape',
    archetype: 'magic',
    visual: null,
    stats: { magicDamage: 3, maxMana: 8 },
    scaling: { magicDamage: 0.5, maxMana: 1.5 },
    effects: {},
    sellValue: 18,
  },
};

export function getEquipment(id: string): EquipmentDef {
  const item = EQUIPMENT[id];
  if (!item) throw new Error(`Item inconnu : ${id}`);
  return item;
}

/** Ids de la banque, dans un ordre stable (celui du catalogue). */
export function equipmentIds(): string[] {
  return Object.keys(EQUIPMENT);
}
