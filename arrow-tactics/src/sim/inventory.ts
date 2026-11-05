import { HP_PER_PIP } from '../config/constants';
import { EQUIPMENT, EQUIPMENT_SLOTS, ITEM_EFFECTS, ITEM_LEVEL_MIN, statsAtLevel, type EquipmentSlot } from '../data/equipment';
import { HERO_INVENTORY_SLOTS } from '../data/hero';
import { canHeroEquipItem } from '../data/heroes';
import { NO_EQUIPMENT_BONUS, type HeroEquipmentBonus } from './entity';

/**
 * Inventaire RPG du Heros (2026-11-02) : une seule verite pour les objets
 * qu'il porte. HERO_INVENTORY_SLOTS cases (sac) contenant chacune un
 * equipement (butin, futurs consommables), et les emplacements d'equipement
 * (un item porte ne prend pas de case). Les ressources economiques (bois,
 * pierre, or extrait) n'y entrent JAMAIS : elles vont dans le cargo
 * (Entity.cargo, sim/systems/cargo.ts ; KI-63 close le 2026-11-03).
 * Donnees pures et serialisables (ids et niveaux), deterministes : les
 * fonctions renvoient un NOUVEL inventaire (ou null si l'operation est
 * impossible) et ne perdent ni ne dupliquent jamais rien.
 *
 * Niveau d'item (2026-11-05, G46) : chaque exemplaire porte son niveau
 * (ItemInstance : definition fixe + niveau, stats deterministes par
 * statsAtLevel) ; les items portes gardent leur niveau dans
 * `equippedLevels`. Un inventaire sans niveaux (ancienne sauvegarde) vaut
 * niveau 1 partout.
 *
 * Acquisition (2026-11-05, G47) : une seule regle, acquireItem /
 * acquisitionPlan (recompense de vague, butin ramasse, futurs drops) : piece
 * portable + emplacement vide = equipee ; sinon sac ; jamais de remplacement.
 *
 * Etat de simulation (Entity.hero.inventory) : le ramassage d'un objet au
 * sol l'utilise dans le pas fixe ; l'interface passe par
 * World.queueInventoryAction (applique au debut du pas suivant).
 */
export type InventorySlot = { kind: 'item'; itemId: string; level: number } | null;

export interface HeroInventory {
  slots: InventorySlot[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  /** Niveau de chaque item porte (absent : niveau 1). */
  equippedLevels: Partial<Record<EquipmentSlot, number>>;
}

/** Action de l'interface sur l'inventaire (World.queueInventoryAction). */
export type InventoryAction =
  /** Deplacer ou echanger deux cases du sac. */
  | { type: 'move'; from: number; to: number }
  /** Equiper l'item de la case `from` (emplacement `slot` s'il est donne :
   *  il doit etre le sien). */
  | { type: 'equip'; from: number; slot?: EquipmentSlot }
  /** Retirer l'item de `slot` vers la case `to` (libre) ou la premiere libre. */
  | { type: 'unequip'; slot: EquipmentSlot; to?: number }
  /** Ajouter un item au sac, sans jamais l'equiper (console de developpement). */
  | { type: 'add'; itemId: string; level?: number }
  /** Acquerir un item (recompense, butin) : acquireItem, la seule regle
   *  d'acquisition (auto-equipement sur un emplacement vide, sinon sac). */
  | { type: 'acquire'; itemId: string; level?: number };

const levelOf = (level: number | undefined): number => Math.max(ITEM_LEVEL_MIN, Math.floor(level ?? ITEM_LEVEL_MIN));

export function createHeroInventory(items: readonly string[] = [], size = HERO_INVENTORY_SLOTS): HeroInventory {
  const slots: InventorySlot[] = Array.from({ length: size }, () => null);
  items.slice(0, size).forEach((itemId, i) => (slots[i] = { kind: 'item', itemId, level: ITEM_LEVEL_MIN }));
  return { slots, equipped: {}, equippedLevels: {} };
}

function copy(inv: HeroInventory): HeroInventory {
  return { slots: inv.slots.map((s) => (s ? { ...s, level: levelOf(s.level) } : null)), equipped: { ...inv.equipped }, equippedLevels: { ...(inv.equippedLevels ?? {}) } };
}

export function freeSlotCount(inv: HeroInventory): number {
  return inv.slots.filter((s) => s === null).length;
}

/** Ajoute un equipement (niveau `level`) dans la premiere case libre ; null
 *  si le sac est plein ou l'item inconnu. */
export function addItem(inv: HeroInventory, itemId: string, level = ITEM_LEVEL_MIN): HeroInventory | null {
  if (!EQUIPMENT[itemId]) return null;
  const index = inv.slots.indexOf(null);
  if (index < 0) return null;
  const next = copy(inv);
  next.slots[index] = { kind: 'item', itemId, level: levelOf(level) };
  return next;
}

/** Emplacement libre : ni l'emplacement de l'item ni ceux qui occupent la
 *  meme main (bouclier et main secondaire). */
function slotIsFree(inv: Pick<HeroInventory, 'equipped'>, slot: EquipmentSlot): boolean {
  return [slot, ...EQUIPMENT_SLOTS[slot].exclusiveWith].every((s) => !inv.equipped[s]);
}

/** Destination d'une piece acquise (2026-11-05, G47), SEULE regle partagee
 *  par l'acquisition et par ce que l'interface annonce : `equip` si le Heros
 *  peut la porter et que son emplacement est libre (jamais de remplacement,
 *  aucune comparaison de puissance) ; `bag` s'il reste une case ; null sinon
 *  (sac plein, item inconnu). */
export function acquisitionPlan(inv: HeroInventory, itemId: string, heroId: string): 'equip' | 'bag' | null {
  const def = EQUIPMENT[itemId];
  if (!def) return null;
  if (canHeroEquipItem(heroId, def) && slotIsFree(inv, def.slot)) return 'equip';
  return inv.slots.includes(null) ? 'bag' : null;
}

/** Acquisition d'un item (recompense de vague, butin ramasse, futur drop) :
 *  auto-equipe s'il est portable et que son emplacement est vide, sinon dans
 *  le sac ; null si rien n'est possible (l'appelant garde l'item). */
export function acquireItem(inv: HeroInventory, itemId: string, level: number, heroId: string): { inventory: HeroInventory; equipped: boolean } | null {
  const plan = acquisitionPlan(inv, itemId, heroId);
  if (plan === null) return null;
  if (plan === 'bag') {
    const inventory = addItem(inv, itemId, level);
    return inventory ? { inventory, equipped: false } : null;
  }
  const slot = EQUIPMENT[itemId]!.slot;
  const inventory = copy(inv);
  inventory.equipped[slot] = itemId;
  inventory.equippedLevels[slot] = levelOf(level);
  return { inventory, equipped: true };
}

/** Deplace la case `from` vers `to` : case vide -> deplacement, sinon
 *  echange. Indices invalides : inventaire inchange. */
export function moveSlot(inv: HeroInventory, from: number, to: number): HeroInventory {
  const n = inv.slots.length;
  if (from === to || from < 0 || to < 0 || from >= n || to >= n || inv.slots[from] === null) return inv;
  const next = copy(inv);
  const a = next.slots[from]!;
  const b = next.slots[to] ?? null;
  next.slots[to] = a;
  next.slots[from] = b;
  return next;
}

/** Equipe l'item de la case `from` (son emplacement, ou `slot` qui doit etre
 *  le sien). Ce qu'il remplace (meme emplacement, ou emplacement exclusif de
 *  la meme main) retourne dans le sac avec son niveau : d'abord dans la case
 *  liberee, puis dans la premiere case libre. Atomique : null si impossible.
 *  `heroId` : Heros qui l'equipe ; un item qu'il ne peut pas porter est refuse. */
export function equipFromSlot(inv: HeroInventory, from: number, slot?: EquipmentSlot, heroId?: string): HeroInventory | null {
  const s = inv.slots[from];
  if (s?.kind !== 'item') return null;
  const def = EQUIPMENT[s.itemId];
  if (!def || (slot !== undefined && slot !== def.slot)) return null;
  if (heroId !== undefined && !canHeroEquipItem(heroId, def)) return null;
  const next = copy(inv);
  next.slots[from] = null;
  const freed: { itemId: string; level: number }[] = [];
  for (const occupied of [def.slot, ...EQUIPMENT_SLOTS[def.slot].exclusiveWith]) {
    const previous = next.equipped[occupied];
    if (previous) freed.push({ itemId: previous, level: levelOf(next.equippedLevels[occupied]) });
    delete next.equipped[occupied];
    delete next.equippedLevels[occupied];
  }
  next.equipped[def.slot] = s.itemId;
  next.equippedLevels[def.slot] = levelOf(s.level);
  for (const item of freed) {
    const index = next.slots[from] === null ? from : next.slots.indexOf(null);
    if (index < 0) return null;
    next.slots[index] = { kind: 'item', ...item };
  }
  return next;
}

/** Retire l'item de `slot` vers la case `to` (libre) ou la premiere case
 *  libre ; null si aucune place (l'item reste porte). */
export function unequipSlot(inv: HeroInventory, slot: EquipmentSlot, to?: number): HeroInventory | null {
  const itemId = inv.equipped[slot];
  if (!itemId) return null;
  const index = to !== undefined && inv.slots[to] === null ? to : inv.slots.indexOf(null);
  if (index < 0) return null;
  const next = copy(inv);
  const level = levelOf(next.equippedLevels[slot]);
  delete next.equipped[slot];
  delete next.equippedLevels[slot];
  next.slots[index] = { kind: 'item', itemId, level };
  return next;
}

/** Applique une action de l'interface ; null si elle est impossible.
 *  `heroId` : Heros qui agit (portabilite ; absent : aucune restriction). */
export function applyInventoryAction(inv: HeroInventory, action: InventoryAction, heroId?: string): HeroInventory | null {
  switch (action.type) {
    case 'move': {
      const next = moveSlot(inv, action.from, action.to);
      return next === inv ? null : next;
    }
    case 'equip':
      return equipFromSlot(inv, action.from, action.slot, heroId);
    case 'unequip':
      return unequipSlot(inv, action.slot, action.to);
    case 'add':
      return addItem(inv, action.itemId, action.level);
    case 'acquire':
      return acquireItem(inv, action.itemId, action.level ?? ITEM_LEVEL_MIN, heroId ?? '')?.inventory ?? null;
  }
}

/** Equipements possedes dans le sac (ordre des cases). */
export function inventoryItems(inv: HeroInventory): string[] {
  const out: string[] = [];
  for (const s of inv.slots) if (s?.kind === 'item') out.push(s.itemId);
  return out;
}

/** Niveau d'un item porte (1 si inconnu). */
export function equippedLevel(inv: Pick<HeroInventory, 'equippedLevels'>, slot: EquipmentSlot): number {
  return levelOf(inv.equippedLevels?.[slot]);
}

/** Bonus resolus (unites internes de la simulation) des items equipes, a
 *  leur niveau (statsAtLevel : deterministe). `damage` = degats PHYSIQUES
 *  (attaque de base, Tourbillon) ; `magicDamage` = degats magiques (sorts
 *  offensifs et effets declenches, jamais l'attaque de base). Effets
 *  declenches : `procs`, en unites internes, un par effet porte. */
export function resolveEquipmentBonus(inv: Pick<HeroInventory, 'equipped' | 'equippedLevels'>): HeroEquipmentBonus {
  const procs: HeroEquipmentBonus['procs'][number][] = [];
  const bonus: HeroEquipmentBonus = { ...NO_EQUIPMENT_BONUS, procs };
  for (const [slot, itemId] of Object.entries(inv.equipped) as [EquipmentSlot, string | undefined][]) {
    const def = itemId ? EQUIPMENT[itemId] : undefined;
    if (!def) continue;
    const stats = statsAtLevel(def, equippedLevel(inv, slot));
    bonus.maxHp += (stats.maxHp ?? 0) * HP_PER_PIP;
    bonus.maxMana += stats.maxMana ?? 0;
    bonus.manaRegen += stats.manaRegen ?? 0;
    bonus.damage += (stats.physicalDamage ?? 0) * HP_PER_PIP;
    bonus.magicDamage += (stats.magicDamage ?? 0) * HP_PER_PIP;
    bonus.attackSpeed += (stats.attackSpeed ?? 0) / 100;
    bonus.moveSpeed += stats.moveSpeed ?? 0;
    def.effects.forEach((effect, i) => {
      const kind = ITEM_EFFECTS[effect.effect];
      if (kind.kind === 'schoolDamage') procs.push({ key: `${slot}:${def.id}:${i}`, every: effect.every, repeat: effect.repeat, school: kind.school, amount: effect.amount * HP_PER_PIP });
    });
  }
  return bonus;
}
