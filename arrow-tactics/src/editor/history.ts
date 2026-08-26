/**
 * Undo/redo GÉNÉRIQUE pour l'éditeur (2026-08-16, demande d'Antoine, Part U :
 * "le déplacement précis doit être compatible avec Undo/Redo... pendant un
 * drag de 2 secondes, ne crée pas 300 entrées Undo"). Chaque commande sait
 * s'annuler/se refaire elle-même — `EditorHistory` ne connaît RIEN du
 * contenu édité (obstacle, unité, cellule...), juste une pile de paires
 * `{undo, redo}`. Reste volontairement minimal (pas de "merge intelligent
 * de commandes", pas de limite de profondeur) — le vrai travail de
 * coalescence (une seule commande par DRAG entier, jamais une par frame) se
 * fait à l'appelant (voir main.ts, TransformControls 'mouseDown'/'mouseUp') :
 * une commande n'est poussée qu'UNE FOIS, au relâchement, jamais pendant le
 * mouvement (voir 'objectChange').
 */
export interface EditorCommand {
  undo: () => void;
  redo: () => void;
}

export class EditorHistory {
  private readonly undoStack: EditorCommand[] = [];
  private readonly redoStack: EditorCommand[] = [];

  /** Empile une commande DÉJÀ appliquée par l'appelant — cette méthode
   *  n'exécute rien elle-même, elle enregistre juste comment
   *  annuler/refaire ce qui vient de se passer. Toute nouvelle commande
   *  vide la pile de redo (une action normale après un undo efface le
   *  "futur" annulé, comme dans n'importe quel éditeur). */
  push(command: EditorCommand): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.redo();
    this.undoStack.push(command);
    return true;
  }

  /** Vide les deux piles — à appeler en changeant de carte (charger un
   *  fichier, entrer/sortir de l'éditeur) : annuler vers une carte qui n'est
   *  plus celle en cours d'édition n'aurait aucun sens. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
