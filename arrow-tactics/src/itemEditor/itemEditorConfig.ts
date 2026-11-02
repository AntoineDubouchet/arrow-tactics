import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_STAT_DEFS,
  EQUIPMENT_TYPES,
  RARITIES,
  type EquipmentDef,
  type EquipmentSlot,
  type EquipmentStats,
  type EquipmentType,
  type EquipmentRarity,
} from '../data/equipment';

/**
 * Editeur d'items (2026-11-02) : partie PURE (aucun DOM) — item par defaut,
 * texte exporte et relecture d'un texte colle (validation, valeurs par
 * defaut). Le format est exactement celui du catalogue (data/equipment.ts,
 * EQUIPMENT) : `{ "<id>": <item> }`, pret a y etre colle.
 */
export function defaultItem(): EquipmentDef {
  return {
    id: 'nouvel_item',
    name: 'Nouvel item',
    description: '',
    rarity: 'common',
    type: 'weapon',
    slot: 'mainHand',
    visual: { source: 'western_kingdoms', piece: 'WK_weapon_sword_A', scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] },
    stats: {},
    effects: {},
    sellValue: 1,
  };
}

/** Identifiant d'apres un nom (minuscules, sans accents, soulignes). */
export function itemIdFromName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

const round = (v: number): number => Math.round(v * 1000) / 1000;

/** Entree propre : stats et effets nuls retires, nombres arrondis. */
export function cleanItem(item: EquipmentDef): EquipmentDef {
  const stats: EquipmentStats = {};
  for (const { key } of EQUIPMENT_STAT_DEFS) {
    const v = item.stats[key];
    if (v) stats[key] = round(v);
  }
  const fire = item.effects.onHit?.fireDamage;
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    rarity: item.rarity,
    type: item.type,
    slot: item.slot,
    visual: item.visual
      ? { source: item.visual.source, piece: item.visual.piece, scale: round(item.visual.scale), rotation: item.visual.rotation.map(round) as [number, number, number], offset: item.visual.offset.map(round) as [number, number, number] }
      : null,
    stats,
    effects: fire ? { onHit: { fireDamage: round(fire) } } : {},
    sellValue: round(Math.max(0, item.sellValue)),
  };
}

/** Texte exporte : `{ "<id>": <item> }`, pret pour le catalogue. */
export function exportItem(item: EquipmentDef): string {
  const clean = cleanItem(item);
  return JSON.stringify({ [clean.id]: clean }, null, 2);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v: unknown, fallback: number): [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every(isNumber) ? [v[0] as number, v[1] as number, v[2] as number] : [fallback, fallback, fallback];

/** Relit un texte colle : `{ "<id>": item }` ou l'item seul. Leve une erreur
 *  lisible si le texte n'est pas un item. */
export function importItem(text: string): EquipmentDef {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON illisible');
  }
  if (!data || typeof data !== 'object') throw new Error('Aucun item dans ce texte');
  let raw = data as Record<string, unknown>;
  if (typeof raw['name'] !== 'string') {
    const first = Object.values(raw)[0];
    if (!first || typeof first !== 'object') throw new Error('Aucun item dans ce texte');
    raw = first as Record<string, unknown>;
  }
  if (typeof raw['name'] !== 'string') throw new Error('Item sans nom');
  const base = defaultItem();
  const rarity = (typeof raw['rarity'] === 'string' && raw['rarity'] in RARITIES ? raw['rarity'] : base.rarity) as EquipmentRarity;
  const slot = (typeof raw['slot'] === 'string' && raw['slot'] in EQUIPMENT_SLOTS ? raw['slot'] : base.slot) as EquipmentSlot;
  const type = (typeof raw['type'] === 'string' && raw['type'] in EQUIPMENT_TYPES ? raw['type'] : base.type) as EquipmentType;
  const v = raw['visual'] as Record<string, unknown> | null | undefined;
  const visual = v && typeof v['source'] === 'string' && typeof v['piece'] === 'string'
    ? { source: v['source'], piece: v['piece'], scale: isNumber(v['scale']) ? v['scale'] : 1, rotation: vec3(v['rotation'], 0), offset: vec3(v['offset'], 0) }
    : null;
  const statsRaw = (raw['stats'] ?? {}) as Record<string, unknown>;
  const stats: EquipmentStats = {};
  for (const { key } of EQUIPMENT_STAT_DEFS) if (isNumber(statsRaw[key])) stats[key] = statsRaw[key] as number;
  const onHit = ((raw['effects'] as Record<string, unknown> | undefined)?.['onHit'] ?? {}) as Record<string, unknown>;
  return cleanItem({
    id: typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : itemIdFromName(raw['name']),
    name: raw['name'],
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    rarity,
    type,
    slot,
    visual,
    stats,
    effects: isNumber(onHit['fireDamage']) ? { onHit: { fireDamage: onHit['fireDamage'] } } : {},
    sellValue: isNumber(raw['sellValue']) ? raw['sellValue'] : base.sellValue,
  });
}
