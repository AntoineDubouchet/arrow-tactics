import {
  EQUIPMENT_ARCHETYPES,
  EQUIPMENT_SLOTS,
  EQUIPMENT_STAT_DEFS,
  EQUIPMENT_TYPES,
  ITEM_EFFECTS,
  RARITIES,
  type EquipmentArchetype,
  type EquipmentDef,
  type ItemEffectId,
  type TriggeredEffect,
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
/** Effet propose par « + Ajouter un effet » : feu a chaque attaque. */
export function defaultEffect(): TriggeredEffect {
  return { every: 1, repeat: 1, effect: 'fireDamage', amount: 1 };
}

export function defaultItem(): EquipmentDef {
  return {
    id: 'nouvel_item',
    name: 'Nouvel item',
    description: '',
    rarity: 'common',
    type: 'weapon',
    slot: 'mainHand',
    archetype: 'physical',
    visual: { source: 'western_kingdoms', piece: 'WK_weapon_sword_A', scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0] },
    stats: {},
    scaling: {},
    effects: [],
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
  const scaling: EquipmentStats = {};
  for (const { key } of EQUIPMENT_STAT_DEFS) {
    const v = item.stats[key];
    if (v) stats[key] = round(v);
    const s = item.scaling?.[key];
    if (s) scaling[key] = round(s);
  }
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    rarity: item.rarity,
    type: item.type,
    slot: item.slot,
    archetype: item.archetype,
    visual: item.visual
      ? { source: item.visual.source, piece: item.visual.piece, scale: round(item.visual.scale), rotation: item.visual.rotation.map(round) as [number, number, number], offset: item.visual.offset.map(round) as [number, number, number] }
      : null,
    stats,
    scaling,
    // N et K entiers >= 1 ; un effet sans degats n'est pas exporte.
    effects: item.effects.filter((e) => e.amount > 0).map((e) => ({ every: Math.max(1, Math.floor(e.every)), repeat: Math.max(1, Math.floor(e.repeat)), effect: e.effect, amount: round(e.amount) })),
    ...(item.allowedHeroes && item.allowedHeroes.length > 0 ? { allowedHeroes: [...item.allowedHeroes] } : {}),
    sellValue: round(Math.max(0, item.sellValue)),
  };
}

/** Texte exporte : `{ "<id>": <item> }`, pret pour le catalogue. */
export function exportItem(item: EquipmentDef): string {
  const clean = cleanItem(item);
  return JSON.stringify({ [clean.id]: clean }, null, 2);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Effets d'un item relu : nouveau format (tableau), ou ancien champ
 *  `effects.onHit.fireDamage` converti (N = 1, K = 1, feu). L'export n'ecrit
 *  que le nouveau format. */
function readEffects(raw: unknown): TriggeredEffect[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((e): TriggeredEffect[] => {
      const r = (e ?? {}) as Record<string, unknown>;
      const id = r['effect'];
      if (typeof id !== 'string' || !(id in ITEM_EFFECTS) || !isNumber(r['amount'])) return [];
      return [{ every: isNumber(r['every']) ? r['every'] : 1, repeat: isNumber(r['repeat']) ? r['repeat'] : 1, effect: id as ItemEffectId, amount: r['amount'] }];
    });
  }
  const legacy = ((raw ?? {}) as Record<string, Record<string, unknown> | undefined>)['onHit']?.['fireDamage'];
  return isNumber(legacy) && legacy > 0 ? [{ every: 1, repeat: 1, effect: 'fireDamage', amount: legacy }] : [];
}
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
  const readStats = (source: unknown): EquipmentStats => {
    const rawStats = (source ?? {}) as Record<string, unknown>;
    const out: EquipmentStats = {};
    for (const { key } of EQUIPMENT_STAT_DEFS) if (isNumber(rawStats[key])) out[key] = rawStats[key] as number;
    // Ancien format (avant le 2026-11-05) : `damage` = degats physiques.
    if (isNumber(rawStats['damage']) && !isNumber(rawStats['physicalDamage'])) out.physicalDamage = rawStats['damage'] as number;
    return out;
  };
  const stats = readStats(raw['stats']);
  const scaling = readStats(raw['scaling']);
  const archetype = (typeof raw['archetype'] === 'string' && raw['archetype'] in EQUIPMENT_ARCHETYPES ? raw['archetype'] : base.archetype) as EquipmentArchetype;
  const allowed = raw['allowedHeroes'];
  return cleanItem({
    id: typeof raw['id'] === 'string' && raw['id'] ? raw['id'] : itemIdFromName(raw['name']),
    name: raw['name'],
    description: typeof raw['description'] === 'string' ? raw['description'] : '',
    rarity,
    type,
    slot,
    archetype,
    visual,
    stats,
    scaling,
    effects: readEffects(raw['effects']),
    ...(Array.isArray(allowed) ? { allowedHeroes: allowed.filter((h): h is string => typeof h === 'string') } : {}),
    sellValue: isNumber(raw['sellValue']) ? raw['sellValue'] : base.sellValue,
  });
}
