/**
 * Algorithme de mise en page de l'arbre de talents — PUR (aucun DOM, aucun
 * Three.js, testable en headless) — 2026-08-14, deuxieme refonte visuelle
 * demandee par Antoine : le premier essai (flexbox, une ligne par palier
 * avec `justify-content: center`) traitait chaque palier comme une simple
 * liste centree, perdant la relation "cette carte est centree sous SON
 * parent" (Recyclage/Le temps sous Butin, Mitraillette sous Tir rapide).
 *
 * Principe ("section 29-32" de la demande) :
 *   - Y = uniquement le palier (tier), jamais influence par le parent.
 *   - X = calcule par un algorithme d'arbre CLASSIQUE en deux passes :
 *     1. `subtreeWidth(id)` (bas vers le haut) — la largeur qu'occupe un
 *        nœud ET tous ses descendants, feuille = CARD_WIDTH, nœud avec
 *        enfants = somme des largeurs de sous-arbres enfants + les gaps
 *        entre eux (jamais moins que sa propre largeur de carte).
 *     2. `assignX` (haut vers le bas) — centre chaque nœud sur son propre
 *        sous-arbre, puis repartit ses enfants cote a cote a l'interieur de
 *        cette largeur, chacun centre sur SA PROPRE portion.
 *   Un parent a un seul enfant => l'enfant herite exactement le X du parent
 *   (section 6/31). Un parent a plusieurs enfants => ils sont centres
 *   ensemble sous le parent (section 5). Les collisions entre groupes de
 *   freres sont resolues GRATUITEMENT par ce calcul (un parent avec des
 *   enfants nombreux a un sous-arbre plus large, ce qui pousse naturellement
 *   ses voisins plus loin) — pas de passe de resolution de collision
 *   separee necessaire (section 29, etape 5).
 */

export interface TalentTreeLayoutNode {
  /** id du talent, ou identifiant du talent racine. */
  id: string;
  /** null uniquement pour la racine. */
  parentId: string | null;
}

export interface TalentTreeLayoutOptions {
  cardWidth: number;
  cardHeight: number;
  /** Espace horizontal entre deux sous-arbres freres adjacents. */
  siblingGap: number;
  /** Espace vertical entre le bas des cartes d'un palier et le haut des
   *  cartes du palier suivant. */
  tierGap: number;
  /** Espace vertical entre le bas de la racine et le haut du palier 1 —
   *  separe du tierGap normal pour pouvoir laisser plus (ou moins) de place
   *  a l'eventail racine -> palier 1, qui relie generalement plus de
   *  talents a la fois. */
  rootGap: number;
}

export interface TalentNodeLayout {
  id: string;
  /** Palier — 0 pour la racine, 1 pour le palier I, 2 pour le palier II... */
  tier: number;
  centerX: number;
  centerY: number;
}

export interface TalentTreeLayoutResult {
  nodes: Map<string, TalentNodeLayout>;
  /** Largeur totale du sous-arbre RACINE — utile pour dimensionner le
   *  conteneur (voir ui/screens.ts). */
  totalWidth: number;
  /** Bas de la derniere carte du dernier palier (pas de marge ajoutee ici,
   *  a l'appelant d'ajouter sa propre marge de respiration si besoin). */
  totalHeight: number;
}

export function computeTalentTreeLayout(
  rootId: string,
  descendants: TalentTreeLayoutNode[],
  options: TalentTreeLayoutOptions,
): TalentTreeLayoutResult {
  const { cardWidth, cardHeight, siblingGap, tierGap, rootGap } = options;

  const childrenOf = new Map<string, string[]>();
  for (const node of descendants) {
    if (node.parentId === null) continue;
    const list = childrenOf.get(node.parentId);
    if (list) list.push(node.id);
    else childrenOf.set(node.parentId, [node.id]);
  }

  const subtreeWidthCache = new Map<string, number>();
  function subtreeWidth(id: string): number {
    const cached = subtreeWidthCache.get(id);
    if (cached !== undefined) return cached;
    const kids = childrenOf.get(id) ?? [];
    let width: number;
    if (kids.length === 0) {
      width = cardWidth;
    } else {
      const sum = kids.reduce((acc, k) => acc + subtreeWidth(k), 0) + (kids.length - 1) * siblingGap;
      width = Math.max(cardWidth, sum);
    }
    subtreeWidthCache.set(id, width);
    return width;
  }

  // Palier de chaque id, calcule en meme temps que l'arbre children/parent
  // (root = 0), pour connaitre le Y sans dependre d'un ordre externe.
  const tierOf = new Map<string, number>([[rootId, 0]]);
  {
    // BFS depuis la racine — jamais de recursion illimitee meme si les
    // donnees contenaient (par erreur) un cycle.
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const tier = tierOf.get(id)!;
      for (const kid of childrenOf.get(id) ?? []) {
        if (tierOf.has(kid)) continue;
        tierOf.set(kid, tier + 1);
        queue.push(kid);
      }
    }
  }
  const maxTier = Math.max(0, ...tierOf.values());

  const tierCenterY: number[] = [cardHeight / 2];
  if (maxTier >= 1) tierCenterY[1] = cardHeight + rootGap + cardHeight / 2;
  for (let t = 2; t <= maxTier; t++) {
    tierCenterY[t] = tierCenterY[t - 1]! + cardHeight + tierGap;
  }

  const nodes = new Map<string, TalentNodeLayout>();
  function assignX(id: string, centerX: number): void {
    nodes.set(id, { id, tier: tierOf.get(id) ?? 0, centerX, centerY: tierCenterY[tierOf.get(id) ?? 0]! });
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return;
    const totalKidsWidth = kids.reduce((acc, k) => acc + subtreeWidth(k), 0) + (kids.length - 1) * siblingGap;
    let cursor = centerX - totalKidsWidth / 2;
    for (const kid of kids) {
      const w = subtreeWidth(kid);
      assignX(kid, cursor + w / 2);
      cursor += w + siblingGap;
    }
  }

  const totalWidth = subtreeWidth(rootId);
  assignX(rootId, totalWidth / 2);

  return { nodes, totalWidth, totalHeight: tierCenterY[maxTier]! + cardHeight / 2 };
}
