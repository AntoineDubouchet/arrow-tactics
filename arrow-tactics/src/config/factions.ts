import type { TerritoryTeam } from './territory';

/**
 * Camps et factions (2026-11-01, direction « Hero RTS Survival », voir
 * docs/DESIGN_DECISIONS.md A-FACTIONS). SOURCE UNIQUE des couleurs de camp.
 *
 * Deux notions SEPAREES :
 *  - ALLEGEANCE (a qui appartient une unite) : un des quatre camps joueurs
 *    (Rouge, Bleu, Vert, Jaune) ou le camp Neutre (occupants de la carte,
 *    camps PvE, a terme ressources et objectifs). Le Neutre n'est jamais une
 *    couleur choisie par un joueur.
 *  - FACTION VISUELLE (famille d'assets) : humains, barbares, plus tard
 *    squelettes, orcs... Une unite Neutre peut porter n'importe quelle
 *    faction visuelle ; aucune faction visuelle n'est liee a un camp ni a une
 *    couleur.
 *
 * La simulation ne connait encore que deux cotes (`player` / `enemy`,
 * sim/entity.ts Team) : allegianceOfSide les traduit. En Mode survie, le
 * joueur est Bleu et le cote adverse est le Neutre. Etendre la simulation a
 * plusieurs joueurs se fera sans toucher a ces palettes.
 */
export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow';
export const PLAYER_COLORS: readonly PlayerColor[] = ['red', 'blue', 'green', 'yellow'];

export type FactionColor = PlayerColor | 'neutral';

export interface FactionPalette {
  label: string;
  /** Couleur principale (anneaux, zones de territoire, barres de vie). */
  primary: number;
  /** Couleur secondaire (contours, accents) : gris pour le Neutre. */
  secondary: number;
  /** Teinte des zones d'equipe des unites Toon RTS (sRGB lineaire du masque,
   *  render/toonUnitRig.ts). */
  toonTint: readonly [number, number, number];
}

/** Palettes des camps. Bleu et Rouge reprennent les teintes deja etablies
 *  (zones, anneaux, atlas Toon du pack) ; Vert et Jaune sont nouvelles ;
 *  Neutre = brun + gris. PROVISOIRE pour Vert, Jaune et Neutre. */
export const FACTION_PALETTES: Readonly<Record<FactionColor, FactionPalette>> = {
  red: { label: 'Rouge', primary: 0xd9614a, secondary: 0x8a2f22, toonTint: [1, 0.217, 0.109] },
  blue: { label: 'Bleu', primary: 0x4a90d9, secondary: 0x234f80, toonTint: [0.114, 0.572, 1] },
  green: { label: 'Vert', primary: 0x5bb85a, secondary: 0x2e6b2d, toonTint: [0.069, 0.737, 0.391] },
  yellow: { label: 'Jaune', primary: 0xe0c040, secondary: 0x8a7420, toonTint: [1, 0.8, 0.12] },
  neutral: { label: 'Neutre', primary: 0x9c7450, secondary: 0x8e8e8e, toonTint: [0.67, 0.446, 0.286] },
};

export type Allegiance = { kind: 'player'; color: PlayerColor } | { kind: 'neutral' };

/** Couleur du joueur local (un seul joueur aujourd'hui). */
export const LOCAL_PLAYER_COLOR: PlayerColor = 'blue';

/** Allegeance d'un cote de la simulation : le joueur local, ou le Neutre. */
export function allegianceOfSide(side: TerritoryTeam): Allegiance {
  return side === 'player' ? { kind: 'player', color: LOCAL_PLAYER_COLOR } : { kind: 'neutral' };
}

export function factionColorOf(allegiance: Allegiance): FactionColor {
  return allegiance.kind === 'player' ? allegiance.color : 'neutral';
}

/** Palette d'un cote de la simulation. */
export function sidePalette(side: TerritoryTeam): FactionPalette {
  return FACTION_PALETTES[factionColorOf(allegianceOfSide(side))];
}

/** Familles d'assets des unites, independantes du camp. */
export type VisualFaction = 'human' | 'barbarian';
export const VISUAL_FACTIONS: Readonly<Record<VisualFaction, { label: string }>> = {
  human: { label: 'Humains' },
  barbarian: { label: 'Barbares' },
};
