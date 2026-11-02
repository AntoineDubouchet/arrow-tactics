/**
 * Equipement des Heros (2026-11-02, items / loot) : donnees pures. Un item
 * decrit son emplacement, sa rarete, son visuel (piece d'un catalogue Toon
 * RTS, meme format que les mains de l'Atelier), ses bonus de stats, ses
 * effets speciaux et sa valeur de vente. Aucune exception par id : la
 * simulation ne recoit que des bonus deja resolus (run/heroEquipment.ts).
 *
 * Unites : les stats et effets sont en points AFFICHES (comme la fiche :
 * « +3 degats » = 3 points, soit 30 internes, HP_PER_PIP) ; vitesse
 * d'attaque en % ; vitesse de deplacement en cases/s ; regeneration de mana
 * par seconde. Valeurs PROVISOIRES.
 *
 * Catalogue editable sans code : Editeur d'items (src/itemEditor), qui
 * exporte une entree de ce format.
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
export type EquipmentSlot = 'mainHand' | 'offHand' | 'shield' | 'helmet' | 'shoulders' | 'cape';

export interface EquipmentSlotDef {
  id: EquipmentSlot;
  label: string;
  hand: 'right' | 'left' | null;
  bodySlot: 'head' | 'shoulderpads' | 'helmet' | 'cape' | null;
  exclusiveWith: readonly EquipmentSlot[];
}

export const EQUIPMENT_SLOTS: Readonly<Record<EquipmentSlot, EquipmentSlotDef>> = {
  mainHand: { id: 'mainHand', label: 'Arme principale', hand: 'right', bodySlot: null, exclusiveWith: [] },
  offHand: { id: 'offHand', label: 'Main secondaire', hand: 'left', bodySlot: null, exclusiveWith: ['shield'] },
  shield: { id: 'shield', label: 'Bouclier', hand: 'left', bodySlot: null, exclusiveWith: ['offHand'] },
  helmet: { id: 'helmet', label: 'Casque', hand: null, bodySlot: 'head', exclusiveWith: [] },
  shoulders: { id: 'shoulders', label: 'Épaulières', hand: null, bodySlot: 'shoulderpads', exclusiveWith: [] },
  cape: { id: 'cape', label: 'Cape', hand: null, bodySlot: 'cape', exclusiveWith: [] },
};
export const EQUIPMENT_SLOT_ORDER: readonly EquipmentSlot[] = ['mainHand', 'offHand', 'shield', 'helmet', 'shoulders', 'cape'];

export type EquipmentType = 'weapon' | 'shield' | 'offhand' | 'armor' | 'accessory';
export const EQUIPMENT_TYPES: Readonly<Record<EquipmentType, string>> = {
  weapon: 'Arme',
  shield: 'Bouclier',
  offhand: 'Objet de main secondaire',
  armor: 'Armure',
  accessory: 'Accessoire',
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

/** Bonus de stats (points affiches, voir l'en-tete). */
export interface EquipmentStats {
  maxHp?: number;
  maxMana?: number;
  manaRegen?: number;
  damage?: number;
  /** Vitesse d'attaque, en % (10 = 10 % de coups en plus par seconde). */
  attackSpeed?: number;
  moveSpeed?: number;
}
export type EquipmentStatKey = keyof EquipmentStats;

export const EQUIPMENT_STAT_DEFS: readonly { key: EquipmentStatKey; label: string; unit: string; step: number }[] = [
  { key: 'maxHp', label: 'PV max', unit: 'PV', step: 1 },
  { key: 'maxMana', label: 'Mana max', unit: '', step: 1 },
  { key: 'manaRegen', label: 'Régénération de mana', unit: '/ s', step: 0.1 },
  { key: 'damage', label: 'Dégâts de mêlée', unit: '', step: 0.5 },
  { key: 'attackSpeed', label: "Vitesse d'attaque", unit: '%', step: 1 },
  { key: 'moveSpeed', label: 'Vitesse de déplacement', unit: 'cases/s', step: 0.1 },
];

/** Effets speciaux (donnees generiques, jamais un test sur l'id d'un item).
 *  Aujourd'hui : degats de feu a chaque coup qui touche. Prevus (non
 *  implementes) : vol de vie, bonus contre un type d'ennemi, regeneration,
 *  bonus de recolte. */
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
  visual: EquipmentVisual | null;
  stats: EquipmentStats;
  effects: EquipmentEffects;
  /** Valeur de vente (or), pour le futur Marche. */
  sellValue: number;
}

/** Catalogue des items. PROVISOIRE (items de demonstration). */
export const EQUIPMENT: Readonly<Record<string, EquipmentDef>> = {
  starter_sword: {
    id: 'starter_sword',
    name: 'Épée du débutant',
    description: 'Une lame simple mais fiable, plus vive que le marteau.',
    rarity: 'common',
    type: 'weapon',
    slot: 'mainHand',
    visual: { source: 'western_kingdoms', piece: 'WK_weapon_sword_A', scale: 1.1, rotation: [0, 0, 0], offset: [0, 0, 0] },
    stats: { damage: 3 },
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
    visual: { source: 'barbarian', piece: 'BRB_weapon_sword_B', scale: 1.15, rotation: [0, 0, 0], offset: [0, 0, 0] },
    stats: { damage: 4 },
    effects: { onHit: { fireDamage: 3 } },
    sellValue: 12,
  },
  sturdy_shield: {
    id: 'sturdy_shield',
    name: 'Bouclier robuste',
    description: 'Un écu épais cerclé de fer.',
    rarity: 'uncommon',
    type: 'shield',
    slot: 'shield',
    visual: { source: 'western_kingdoms', piece: 'WK_Shield_B', scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] },
    stats: { maxHp: 8 },
    effects: {},
    sellValue: 10,
  },
  guard_pauldrons: {
    id: 'guard_pauldrons',
    name: 'Épaulières de garde',
    description: 'Des épaulières de cuir clouté.',
    rarity: 'common',
    type: 'armor',
    slot: 'shoulders',
    visual: { source: 'barbarian', piece: 'BRB_shoulderpads_C', scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] },
    stats: { maxHp: 4, moveSpeed: 0.1 },
    effects: {},
    sellValue: 3,
  },
};

export function getEquipment(id: string): EquipmentDef {
  const item = EQUIPMENT[id];
  if (!item) throw new Error(`Item inconnu : ${id}`);
  return item;
}
