/**
 * Icones d'objets pour l'inventaire/la boutique. Deux icones DEFINITIVES
 * fournies par Antoine (2026-08-14, dossier "Sort de bataille" sur son
 * Bureau — identifiees par inspection visuelle directe, pas par nom de
 * fichier : parchemin a motif de feuille verte = soin, parchemin a motif de
 * flocon bleu = Nova de glace) remplacent desormais les icones SVG generees
 * par code utilisees jusque-la pour CES DEUX objets precis — copiees dans
 * public/textures/ui/battle-spells/ (redimensionnees a 128x128, les fichiers
 * source faisaient ~1000x1000/~1 Mo chacun, inutilement lourd pour une icone
 * de 20-28px) plutot que de referencer le chemin absolu Windows d'origine.
 * PREMIERE exception de ce fichier a la regle "aucun asset graphique" (voir
 * CLAUDE.md, Stack) — deja le cas ailleurs dans le projet pour les modeles
 * .glb (rochers/arbres/unites riggees), jamais pour une icone d'UI jusqu'ici.
 *
 * Le generateur SVG par code reste le REPLI pour tout futur objet sans icone
 * dediee (voir `ICON_BUILDERS`/fallback ci-dessous) — pas retire, juste
 * detrone pour ces deux ids precis.
 */

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

/** Chemins publics (jamais un chemin absolu Windows) vers les icones
 *  DEFINITIVES fournies par Antoine — voir le commentaire d'en-tete. */
const IMAGE_ICON_SOURCES: Record<string, string> = {
  heal_scroll_minor: '/textures/ui/battle-spells/heal_scroll_minor.png',
  ice_nova: '/textures/ui/battle-spells/ice_nova.png',
};

function createImageIcon(src: string, size: number): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.width = size;
  img.height = size;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.style.objectFit = 'contain';
  return img;
}

/** Rectangle neutre en repli — un futur objet sans icone dediee (ni image,
 *  ni generateur SVG specifique) atterrit ici plutot que de casser le rendu. */
function createFallbackIcon(size: number): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 32 32', width: String(size), height: String(size) });
  svg.appendChild(svgEl('rect', { x: '6', y: '6', width: '20', height: '20', rx: '3', fill: '#8b8577' }));
  return svg;
}

/** Construit l'icone d'un objet par son id — image dediee si elle existe
 *  (voir IMAGE_ICON_SOURCES), sinon un rectangle neutre en repli. `size` en
 *  pixels (carre), 28 par defaut (taille historique des icones SVG qu'elle
 *  remplace). */
export function createItemIcon(itemId: string, size = 28): Element {
  const imageSrc = IMAGE_ICON_SOURCES[itemId];
  if (imageSrc) return createImageIcon(imageSrc, size);

  return createFallbackIcon(size);
}
