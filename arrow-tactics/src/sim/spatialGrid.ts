/**
 * Grille spatiale uniforme generique (2026-08-10, voir CLAUDE.md,
 * "Problemes connus" — la separation entre corps etait en O(n^2), un risque
 * deja identifie avec la courbe de vagues actuelle : vague 7 = 112 ennemis a
 * elle seule). Accelere les recherches de voisins proches pour tout systeme
 * qui teste des paires d'entites a portee (aujourd'hui : la separation dans
 * movement.ts ; le ciblage dans targeting.ts a le meme profil O(n^2) mais
 * n'a pas encore ete migre, voir CLAUDE.md).
 *
 * Reconstruite a chaque appel plutot qu'incrementale : les positions
 * bougent a chaque tick/sous-passe, et une reconstruction complete reste
 * largement assez rapide (O(n)) tant que le nombre d'entites reste
 * raisonnable — c'est justement le O(n^2) des PAIRES qu'on elimine, pas le
 * parcours des entites elles-memes.
 */
export class SpatialGrid<T extends { x: number; z: number }> {
  private readonly cellSize: number;
  private readonly cells = new Map<string, T[]>();

  constructor(cellSize: number) {
    this.cellSize = cellSize > 0 ? cellSize : 1;
  }

  private cellKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private cellOf(x: number, z: number): readonly [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  insert(item: T): void {
    const [cx, cz] = this.cellOf(item.x, item.z);
    const key = this.cellKey(cx, cz);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(item);
  }

  /**
   * Renvoie tous les items du voisinage 3x3 de cellules autour de (x, z) —
   * suffisant pour trouver TOUT item a une distance reelle inferieure a
   * `cellSize`, A CONDITION que `cellSize` (passe au constructeur) ait ete
   * choisie >= a la plus grande distance d'interaction possible entre deux
   * items (voir l'appelant : la separation utilise 2x le plus grand rayon
   * d'unite). Peut renvoyer des items en realite plus loin que `cellSize` —
   * a l'appelant de refiltrer par distance reelle, exactement comme il
   * l'aurait fait sur la liste complete avant.
   */
  queryNeighborhood(x: number, z: number): T[] {
    const [cx, cz] = this.cellOf(x, z);
    const results: T[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const bucket = this.cells.get(this.cellKey(cx + dx, cz + dz));
        if (bucket) results.push(...bucket);
      }
    }
    return results;
  }
}
