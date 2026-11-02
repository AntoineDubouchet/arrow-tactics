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

let svgUid = 0;

/** Soin du Paladin (2026-11-02, cree pour le sort, demande d'Antoine) :
 *  bouclier argente frappe d'une croix doree, rayons de lumiere sacree, sur
 *  fond bleu nuit borde d'or. Genere par code, lisible des 28 px. */
function createPaladinHealIcon(size: number): SVGSVGElement {
  const id = `paladin-heal-${++svgUid}`;
  const svg = svgEl('svg', { viewBox: '0 0 64 64', width: String(size), height: String(size) });
  const defs = svgEl('defs', {});
  const gradient = (tag: 'radialGradient' | 'linearGradient', gid: string, attrs: Record<string, string>, stops: [string, string, string?][]): void => {
    const g = svgEl(tag, { id: `${id}-${gid}`, ...attrs });
    for (const [offset, color, opacity] of stops) g.appendChild(svgEl('stop', { offset, 'stop-color': color, ...(opacity ? { 'stop-opacity': opacity } : {}) }));
    defs.appendChild(g);
  };
  gradient('radialGradient', 'bg', { cx: '50%', cy: '42%', r: '65%' }, [['0', '#3d5fbf'], ['1', '#0c1636']]);
  gradient('radialGradient', 'glow', { cx: '50%', cy: '50%', r: '50%' }, [['0', '#fff8d2', '1'], ['0.45', '#ffd66a', '0.6'], ['1', '#ffd66a', '0']]);
  gradient('linearGradient', 'shield', { x1: '0', y1: '0', x2: '0', y2: '1' }, [['0', '#f2f5fb'], ['1', '#97a3bb']]);
  gradient('linearGradient', 'gold', { x1: '0', y1: '0', x2: '0', y2: '1' }, [['0', '#fff3ad'], ['1', '#d8951c']]);
  const clip = svgEl('clipPath', { id: `${id}-clip` });
  clip.appendChild(svgEl('rect', { x: '3', y: '3', width: '58', height: '58', rx: '9' }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  svg.appendChild(svgEl('rect', { x: '3', y: '3', width: '58', height: '58', rx: '9', fill: `url(#${id}-bg)` }));
  // Rayons de lumiere autour du bouclier.
  const rays = svgEl('g', { fill: '#ffe08a', opacity: '0.5', 'clip-path': `url(#${id}-clip)` });
  const cx = 32, cy = 31, r = 34, half = (4.5 * Math.PI) / 180;
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 6 + Math.PI / 12;
    const p = (t: number): string => `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t)).toFixed(1)}`;
    rays.appendChild(svgEl('polygon', { points: `${cx},${cy} ${p(a - half)} ${p(a + half)}` }));
  }
  svg.appendChild(rays);
  svg.appendChild(svgEl('circle', { cx: String(cx), cy: String(cy), r: '24', fill: `url(#${id}-glow)` }));
  // Bouclier (ecu) et croix doree.
  svg.appendChild(svgEl('path', { d: 'M32 11 L48 16 V30 C48 40.5 41.5 47.5 32 53 C22.5 47.5 16 40.5 16 30 V16 Z', fill: `url(#${id}-shield)`, stroke: '#4d5a78', 'stroke-width': '2', 'stroke-linejoin': 'round' }));
  svg.appendChild(svgEl('path', { d: 'M29 17 H35 V26 H43 V32 H35 V46 H29 V32 H21 V26 H29 Z', fill: `url(#${id}-gold)`, stroke: '#7d520c', 'stroke-width': '1.3', 'stroke-linejoin': 'round' }));
  // Etincelles.
  const star = (x: number, y: number, s: number): void => {
    svg.appendChild(svgEl('path', { d: `M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z`, fill: '#fffbe6' }));
  };
  star(50, 13, 5);
  star(13, 49, 3.5);
  svg.appendChild(svgEl('rect', { x: '3', y: '3', width: '58', height: '58', rx: '9', fill: 'none', stroke: '#e8c15c', 'stroke-width': '3' }));
  return svg;
}

/** Icones dessinees par code (aucun fichier image). */
const SVG_ICON_BUILDERS: Record<string, (size: number) => SVGSVGElement> = {
  paladin_heal: createPaladinHealIcon,
};

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
  const builder = SVG_ICON_BUILDERS[itemId];
  if (builder) return builder(size);

  return createFallbackIcon(size);
}
