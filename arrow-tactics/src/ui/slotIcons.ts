import type { EquipmentSlot } from '../data/equipment';

/**
 * Icones d'equipement (2026-11-05, G47) : UNE table `EquipmentSlot -> icone`,
 * seule source pour l'inventaire, la recompense de vague et l'Editeur d'items.
 * Le type `Record<EquipmentSlot, ...>` oblige chaque nouvel emplacement a avoir
 * son pictogramme : aucun repli possible. Les deux items d'un meme emplacement
 * partagent le pictogramme (provisoire, pas d'artwork par item).
 *
 * Trace : chemin SVG (viewBox 24 x 24), silhouette pleine, utilisee comme
 * masque CSS (`.inventory-icon`) et teintee par `color` (couleur de rarete).
 */
export const SLOT_ICON_PATHS: Readonly<Record<EquipmentSlot, string>> = {
  // Epee en diagonale, pointe en haut a droite.
  mainHand: 'M19 2l3 1-1 3-11 11-3-3zM5 15l4 4-2 2-1-1-2 2-2-2 2-2-1-1z',
  // Dague : lame courte, garde, poignee, pommeau.
  offHand: 'M12 1.5l2.6 3.2V14H9.4V4.7zM6 14.5h12v2.2H6zM10.6 16.7h2.8v3.6h-2.8zM9.4 20.3h5.2v2.2H9.4z',
  // Ecu.
  shield: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  // Casque ouvert sur le visage.
  helmet: 'M12 3c5 0 8 4 8 9v6h-5v-5H9v5H4v-6c0-5 3-9 8-9z',
  // Deux epaulieres arrondies de part et d'autre du col.
  shoulders: 'M10.4 5.5C5.6 5.8 2 9.2 2 14v4.5h6.2V14c0-1.6.9-2.9 2.2-3.5zM13.6 5.5c4.8.3 8.4 3.7 8.4 8.5v4.5h-6.2V14c0-1.6-.9-2.9-2.2-3.5zM10.4 3h3.2v4.5h-3.2z',
  // Plastron : epaules, encolure et buste.
  chest: 'M8 3l4 2 4-2 6 4-3 4-2-1v11H7V10l-2 1-3-4z',
  // Gantelet : quatre doigts, paume, manchette.
  arms: 'M6.6 10V4.6a1.1 1.1 0 012.2 0V10zM9.6 10V3a1.1 1.1 0 012.2 0v7zM12.6 10V3.4a1.1 1.1 0 012.2 0V10zM15.6 11V5.6a1.1 1.1 0 012.2 0V11zM6.6 10.8h11.2v4.4l-2 2.6H8.6l-2-2.6zM7.8 18.8h8.8V22H7.8z',
  // Pantalon : ceinture et deux jambes.
  legs: 'M6 2h12v3H6zM6 6h12l1.2 16h-5.4L12 11.2 10.2 22H4.8z',
  // Cape : agrafe au col, pan evase jusqu'au sol.
  cape: 'M8.6 2h6.8v2.6h-6.8zM8.4 5.4h7.2c3.2 3.4 4.8 9.6 5.4 16.6-2-.8-3.4-.8-5 0-1.4-.8-2.6-.8-4 0-1.4-.8-2.6-.8-4 0-1.6-.8-3-.8-5 0 .6-7 2.2-13.2 5.4-16.6z',
};

/** Valeur CSS `--icon` (masque) d'un emplacement. */
export function slotIconCssUrl(slot: EquipmentSlot): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${SLOT_ICON_PATHS[slot]}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
}

/** Icone d'un emplacement, a la couleur `color` (texte courant sinon). */
export function createSlotIcon(slot: EquipmentSlot, color?: string): HTMLElement {
  const icon = document.createElement('i');
  icon.className = `inventory-icon inventory-icon--slot-${slot}`;
  icon.style.setProperty('--icon', slotIconCssUrl(slot));
  if (color) icon.style.color = color;
  return icon;
}
