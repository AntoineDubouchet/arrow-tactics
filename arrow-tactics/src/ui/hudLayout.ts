/**
 * Calibration du HUD (2026-11-02, outil de composition pour Antoine).
 *
 * - Disposition officielle : ui/hudDefaultLayout.ts (meme format que
 *   l'export, variante compacte pour un ecran etroit), appliquee a tout bloc
 *   sans reglage local ; « Reinitialiser » y revient. Un bloc absent de ce
 *   layout garde sa position CSS.
 * - VERROUILLE par defaut : MAJ ne fait rien, ni poignee ni guide.
 *   Parametres > HUD > « Deverrouiller la disposition du HUD » rend l'outil
 *   ci-dessous disponible, a l'identique.
 * - MAJ maintenue : mode calibration (contour, nom, poignee de taille des
 *   blocs, barre d'action fantome, grille si l'option est active).
 * - MAJ + glisser le fond ou le cadre d'un bloc : deplacement (jamais depuis
 *   un bouton, un sort, un item d'un bloc compose ; un bloc bouton se saisit
 *   par le bouton lui-meme, sans le declencher). Relacher le clic ou MAJ pose.
 * - MAJ + glisser la poignee (coin bas droit) : taille. Blocs structures :
 *   echelle uniforme (HUD_SCALE_MIN..MAX) ; barre d'action et XP : largeur
 *   (et hauteur de la barre) independantes, bornees.
 * - Pendant un glisser : guides (centre de l'ecran, bords et centres des
 *   autres blocs), espacements egaux (trois blocs sur une meme ligne ou
 *   colonne), distances au voisin et aux bords, infobulle (position, taille,
 *   echelle). Aimantation legere (HUD_SNAP px) ; ALT maintenue : aucune.
 * - Position : ANCRAGE par axe (debut, centre, fin selon le tiers du
 *   viewport) + decalage en px (marges exactes a toute resolution), et
 *   fraction de la place libre en repli ; echelle, largeur et hauteur
 *   personnalisees. Au moins EDGE_KEEP px restent a l'ecran.
 * - Preference locale (run/userSettings.ts), jamais dans la simulation ;
 *   export / import JSON (Parametres > HUD).
 */
export type HudResize =
  | { mode: 'scale' }
  /** Largeur (et hauteur de `heightTarget`, sinon du bloc) independantes. */
  | { mode: 'size'; minW: number; maxW: number; minH: number; maxH: number; heightTarget?: HTMLElement };

export interface HudBlockDef {
  id: string;
  /** Nom affiche pendant la calibration. */
  label: string;
  element: HTMLElement;
  /** Bloc bouton : le glisser part du bouton (`handle`) lui-meme. */
  handle?: HTMLElement;
  /** Bloc etire par ses ancrages CSS (barre d'XP) : largeur figee une fois
   *  deplace. */
  keepWidth?: boolean;
  resize?: HudResize;
}

export type HudAnchor = 'start' | 'center' | 'end';

export interface HudBlockState {
  /** Coin haut gauche en fraction de (viewport - taille du bloc). */
  fx: number;
  fy: number;
  /** Ancrage par axe (tiers du viewport ou se trouve le centre du bloc) et
   *  decalage en px : depuis le bord gauche / haut (`start`), depuis le bord
   *  droit / bas (`end`), du centre du bloc au centre du viewport
   *  (`center`). Prioritaire sur fx / fy : marges exactes a toute resolution. */
  ax?: HudAnchor;
  ay?: HudAnchor;
  ox?: number;
  oy?: number;
  /** Taille affichee a la pose (repli si le bloc est cache). */
  w: number;
  h: number;
  scale?: number;
  width?: number;
  height?: number;
}

export type HudLayoutSave = Record<string, HudBlockState>;

/** Valeurs PROVISOIRES. */
export const HUD_SCALE_MIN = 0.65;
export const HUD_SCALE_MAX = 1.75;
const HUD_SNAP = 8;
const EDGE_KEEP = 24;
/** Distances affichees : voisin a moins de NEAR_GAP px, bord a moins de NEAR_EDGE px. */
const NEAR_GAP = 240;
const NEAR_EDGE = 160;
const LABELS_DELAY_MS = 400;
const INTERACTIVE = 'button, input, select, textarea, a, [draggable="true"], .hero-action-slot, .inventory-cell, .build-menu-panel';

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
  w: number;
  h: number;
}

interface DragState {
  kind: 'move' | 'resize';
  block: HudBlockDef;
  x0: number;
  y0: number;
  left0: number;
  top0: number;
  w0: number;
  h0: number;
  scale0: number;
  width0: number;
  height0: number;
  moved: boolean;
}

const rectOf = (el: HTMLElement): Rect => {
  const b = el.getBoundingClientRect();
  return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
};
const mk = (l: number, t: number, w: number, h: number): Rect => ({ l, t, r: l + w, b: t + h, w, h });
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class HudLayout {
  private readonly blocks: HudBlockDef[];
  private state: HudLayoutSave;
  private drag: DragState | null = null;
  private suppressClick = false;
  private calibrating = false;
  private labelsTimer: number | null = null;
  private grid: boolean;
  private unlocked: boolean;
  /** Layout officiel (ui/hudDefaultLayout.ts) selon la largeur de l'ecran,
   *  et sa version lue (par bloc) pour la derniere source rendue. */
  private readonly officialFor: (viewportWidth: number) => unknown;
  private officialSource: unknown = null;
  private official: HudLayoutSave = {};
  private readonly overlay: HTMLElement;
  private readonly info: HTMLElement;

  constructor(
    blocks: HudBlockDef[],
    saved: HudLayoutSave,
    private readonly save: (layout: HudLayoutSave) => void,
    options: { grid: boolean; saveGrid: (on: boolean) => void; unlocked: boolean; saveUnlocked: (on: boolean) => void; defaults: (viewportWidth: number) => unknown },
  ) {
    this.blocks = blocks;
    this.state = { ...saved };
    this.grid = options.grid;
    this.saveGrid = options.saveGrid;
    this.unlocked = options.unlocked;
    this.saveUnlocked = options.saveUnlocked;
    this.officialFor = options.defaults;
    for (const b of blocks) {
      b.element.classList.add('hud-draggable');
      b.element.dataset['hudLabel'] = b.label;
      if (b.resize) {
        const handle = document.createElement('span');
        handle.className = 'hud-handle';
        handle.title = 'MAJ + glisser : taille';
        b.element.appendChild(handle);
      }
    }
    this.overlay = document.createElement('div');
    this.overlay.className = 'hud-guides';
    this.info = document.createElement('div');
    this.info.className = 'hud-info';
    this.info.hidden = true;
    document.body.append(this.overlay, this.info);
    document.addEventListener('pointerdown', (e) => this.onDown(e), true);
    document.addEventListener('pointermove', (e) => this.onMove(e), true);
    document.addEventListener('pointerup', () => this.end(), true);
    document.addEventListener('click', (e) => {
      // Le clic qui termine le glisser d'un bloc bouton ne le declenche pas.
      if (!this.suppressClick) return;
      this.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift' && this.unlocked) this.setCalibrating(true);
      // ALT (sans aimantation) : pas de focus du menu du navigateur.
      if (e.key === 'Alt' && this.calibrating) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key !== 'Shift') return;
      this.setCalibrating(false);
      this.end();
    });
    window.addEventListener('blur', () => {
      this.setCalibrating(false);
      this.end();
    });
    window.addEventListener('resize', () => this.applyAll());
    // Bloc qui change de taille (affiche apres un chargement ou il etait
    // cache, contenu qui varie) : repose sur son ancrage, sauf pendant son
    // glisser.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const b = this.blocks.find((x) => x.element === entry.target);
        if (b && this.drag?.block !== b) this.applyOne(b);
      }
    });
    for (const b of blocks) observer.observe(b.element);
    this.applyAll();
  }

  private readonly saveGrid: (on: boolean) => void;
  private readonly saveUnlocked: (on: boolean) => void;

  /** Vrai si l'outil de calibration est disponible (Parametres > HUD). */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Verrouiller : retour immediat au comportement de jeu normal. */
  setUnlocked(on: boolean): void {
    this.unlocked = on;
    this.saveUnlocked(on);
    if (!on) {
      this.end();
      this.setCalibrating(false);
    }
  }

  /** Vrai pendant le glisser d'un bloc (deplacement ou taille). */
  isDragging(): boolean {
    return this.drag !== null;
  }

  /** Vrai tant que MAJ est maintenue (mode calibration). */
  isCalibrating(): boolean {
    return this.calibrating;
  }

  gridEnabled(): boolean {
    return this.grid;
  }

  setGrid(on: boolean): void {
    this.grid = on;
    this.saveGrid(on);
    document.body.classList.toggle('hud-grid', this.calibrating && on);
  }

  /** Layout officiel (ui/hudDefaultLayout.ts, CSS pour les autres blocs),
   *  reglages locaux effaces. */
  reset(): void {
    this.state = {};
    for (const b of this.blocks) this.clearInline(b);
    this.applyAll();
    this.save(this.state);
  }

  /** Etat sauvegarde (tests, outil). */
  layout(): HudLayoutSave {
    return JSON.parse(JSON.stringify(this.state)) as HudLayoutSave;
  }

  /** Disposition lisible a copier (Parametres > Interface) : pour chaque
   *  bloc, ancrage (`bottom-left`...), decalages `ox` / `oy` en px depuis
   *  ce bord (ou du centre au centre), x et y (fraction de la place libre :
   *  0 = bord gauche / haut, 1 = bord droit / bas, 0,5 = centre), echelle,
   *  largeur et hauteur personnalisees. */
  exportLayout(): string {
    const blocks: Record<string, Record<string, number | string>> = {};
    for (const b of this.blocks) {
      const r = rectOf(b.element);
      const s = this.effective(b);
      const w = r.w || s?.w || 0;
      const h = r.h || s?.h || 0;
      // Position affichee ; bloc cache : celle que lui donnerait son reglage
      // (ancrage d'abord, comme applyOne), jamais la seule fraction de repli.
      const shown = r.w > 0 || !s;
      const left = shown ? r.l : s.ax !== undefined && s.ox !== undefined ? fromAnchor(s.ax, s.ox, w, innerWidth) : s.fx * (innerWidth - w);
      const top = shown ? r.t : s.ay !== undefined && s.oy !== undefined ? fromAnchor(s.ay, s.oy, h, innerHeight) : s.fy * (innerHeight - h);
      const fx = frac(left, innerWidth - w);
      const fy = frac(top, innerHeight - h);
      const a = anchorOf(left, top, w, h);
      const entry: Record<string, number | string> = {
        anchor: `${a.ay === 'start' ? 'top' : a.ay === 'end' ? 'bottom' : 'middle'}-${a.ax === 'start' ? 'left' : a.ax === 'end' ? 'right' : 'center'}`,
        ox: Math.round(a.ox),
        oy: Math.round(a.oy),
        x: round(fx, 4),
        y: round(fy, 4),
        scale: round(s?.scale ?? 1, 3),
      };
      if (s?.width !== undefined) entry['width'] = Math.round(s.width);
      if (s?.height !== undefined) entry['height'] = Math.round(s.height);
      blocks[b.id] = entry;
    }
    return JSON.stringify({ version: 1, viewport: { w: innerWidth, h: innerHeight }, blocks }, null, 2);
  }

  /** Charge une disposition exportee (texte JSON) : valeurs bornees, blocs
   *  inconnus ignores. Renvoie le nombre de blocs charges ; leve une erreur
   *  lisible si le texte est invalide. */
  importLayout(text: string): number {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('JSON illisible');
    }
    const source = layoutBlocks(raw);
    if (!source) throw new Error('Aucun bloc dans ce texte');
    let n = 0;
    for (const b of this.blocks) {
      const st = parseBlockState(b, source[b.id]);
      if (!st) continue;
      this.clearInline(b);
      this.applySize(b, st);
      const r = rectOf(b.element);
      st.w = r.w;
      st.h = r.h;
      this.state[b.id] = st;
      n++;
    }
    if (n === 0) throw new Error('Aucun bloc reconnu');
    this.applyAll();
    this.save(this.state);
    return n;
  }

  // --- Mode calibration -------------------------------------------------------

  private setCalibrating(on: boolean): void {
    this.calibrating = on;
    document.body.classList.toggle('hud-calibrating', on);
    document.body.classList.toggle('hud-grid', on && this.grid);
    if (!on) {
      document.body.classList.remove('hud-calibrating-labels');
      if (this.labelsTimer !== null) window.clearTimeout(this.labelsTimer);
      this.labelsTimer = null;
      this.clearGuides();
    } else if (this.labelsTimer === null) {
      this.labelsTimer = window.setTimeout(() => document.body.classList.add('hud-calibrating-labels'), LABELS_DELAY_MS);
    }
  }

  private onDown(e: PointerEvent): void {
    if (!this.unlocked || !e.shiftKey || e.button !== 0) return;
    const target = e.target as Element | null;
    if (!target) return;
    const block = this.blocks.find((b) => b.element.contains(target));
    if (!block) return;
    let kind: DragState['kind'] = 'move';
    if (target.closest('.hud-handle') && block.resize) kind = 'resize';
    else if (block.handle) {
      if (!block.handle.contains(target)) return;
    } else {
      const interactive = target.closest(INTERACTIVE);
      if (interactive && block.element.contains(interactive)) return;
    }
    this.pin(block);
    const r = rectOf(block.element);
    const s = this.state[block.id];
    const sizeEl = block.resize?.mode === 'size' ? block.resize.heightTarget ?? block.element : null;
    this.drag = {
      kind,
      block,
      x0: e.clientX,
      y0: e.clientY,
      left0: r.l,
      top0: r.t,
      w0: r.w,
      h0: r.h,
      scale0: s?.scale ?? 1,
      width0: s?.width ?? r.w,
      height0: s?.height ?? (sizeEl ? sizeEl.getBoundingClientRect().height : r.h),
      moved: false,
    };
    block.element.style.zIndex = '60';
    e.preventDefault();
    e.stopPropagation();
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    // MAJ ou bouton relache : le bloc reste ou il est.
    if (!e.shiftKey || (e.buttons & 1) === 0) {
      this.end();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    d.moved = true;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    const b = d.block;
    if (d.kind === 'resize') {
      const st = this.stateOf(b);
      if (b.resize?.mode === 'scale') st.scale = clamp(d.scale0 * ((d.w0 + dx) / Math.max(d.w0, 1)), HUD_SCALE_MIN, HUD_SCALE_MAX);
      else if (b.resize?.mode === 'size') {
        st.width = clamp(d.width0 + dx, b.resize.minW, Math.min(b.resize.maxW, innerWidth));
        st.height = clamp(d.height0 + dy, b.resize.minH, b.resize.maxH);
      }
      this.applySize(b, st);
      const r = rectOf(b.element);
      this.placeAt(b, d.left0, d.top0, r.w, r.h);
      this.drawGuides(b, rectOf(b.element), [], []);
      return;
    }
    let left = d.left0 + dx;
    let top = d.top0 + dy;
    const others = this.otherRects(b);
    const snap = computeSnap(mk(left, top, d.w0, d.h0), others, e.altKey);
    left += snap.dx;
    top += snap.dy;
    this.placeAt(b, left, top, d.w0, d.h0);
    this.drawGuides(b, rectOf(b.element), others, snap.equal);
  }

  private end(): void {
    const d = this.drag;
    if (!d) return;
    d.block.element.style.zIndex = '';
    if (d.moved) {
      this.suppressClick = d.kind === 'move' && !!d.block.handle;
      const r = rectOf(d.block.element);
      const st = this.stateOf(d.block);
      st.w = r.w;
      st.h = r.h;
      st.fx = frac(r.l, innerWidth - r.w);
      st.fy = frac(r.t, innerHeight - r.h);
      Object.assign(st, anchorOf(r.l, r.t, r.w, r.h));
      this.save(this.state);
    }
    this.drag = null;
    this.clearGuides();
  }

  // --- Position et taille -----------------------------------------------------

  /** Layout officiel pour la largeur actuelle, lu une fois par source. */
  private defaults(): HudLayoutSave {
    const source = this.officialFor(innerWidth);
    if (source !== this.officialSource) {
      this.officialSource = source;
      this.official = {};
      const blocks = layoutBlocks(source);
      for (const b of this.blocks) {
        const st = blocks ? parseBlockState(b, blocks[b.id]) : null;
        if (st) this.official[b.id] = st;
      }
    }
    return this.official;
  }

  /** Reglage local du bloc, sinon son layout officiel, sinon rien (CSS). */
  private effective(b: HudBlockDef): HudBlockState | undefined {
    return this.state[b.id] ?? this.defaults()[b.id];
  }

  /** Reglage local du bloc, cree au premier glisser depuis ce qui est
   *  affiche (layout officiel compris : echelle, largeur, hauteur). */
  private stateOf(b: HudBlockDef): HudBlockState {
    let st = this.state[b.id];
    if (!st) {
      const r = rectOf(b.element);
      st = { ...this.defaults()[b.id], fx: frac(r.l, innerWidth - r.w), fy: frac(r.t, innerHeight - r.h), w: r.w, h: r.h };
      this.state[b.id] = st;
    }
    return st;
  }

  /** Bloc pose en coordonnees libres a sa position affichee actuelle. */
  private pin(b: HudBlockDef): void {
    if (b.element.style.left) return;
    const r = rectOf(b.element);
    this.placeAt(b, r.l, r.t, r.w, r.h);
  }

  private applyAll(): void {
    for (const b of this.blocks) this.applyOne(b);
  }

  private applyOne(b: HudBlockDef): void {
    const st = this.effective(b);
    if (!st) return;
    this.applySize(b, st);
    const r = rectOf(b.element);
    const w = r.w || st.w;
    const h = r.h || st.h;
    const left = st.ax !== undefined && st.ox !== undefined ? fromAnchor(st.ax, st.ox, w, innerWidth) : st.fx * (innerWidth - w);
    const top = st.ay !== undefined && st.oy !== undefined ? fromAnchor(st.ay, st.oy, h, innerHeight) : st.fy * (innerHeight - h);
    this.placeAt(b, left, top, w, h);
  }

  private applySize(b: HudBlockDef, st: HudBlockState): void {
    const el = b.element;
    if (b.resize?.mode === 'scale') {
      el.style.transformOrigin = '0 0';
      el.style.transform = st.scale !== undefined && st.scale !== 1 ? `scale(${st.scale})` : 'none';
    } else {
      el.style.transform = 'none';
      if (b.resize?.mode === 'size') {
        // Bloc etire (XP) : largeur enregistree a la pose, meme si le HUD est
        // encore cache au chargement (largeur affichee nulle).
        const width = st.width ?? (b.keepWidth && st.w > 0 ? st.w : undefined);
        if (width !== undefined) el.style.width = `${Math.round(width)}px`;
        if (st.height !== undefined) (b.resize.heightTarget ?? el).style.height = `${Math.round(st.height)}px`;
      }
    }
  }

  /** Coin haut gauche a (left, top), borne pour rester recuperable. */
  private placeAt(b: HudBlockDef, left: number, top: number, w: number, h: number): void {
    const el = b.element;
    const r = el.getBoundingClientRect();
    if (b.keepWidth && r.width > 0 && !el.style.width) el.style.width = `${Math.round(r.width)}px`;
    if (!el.style.transform) el.style.transform = 'none';
    el.style.left = `${Math.round(clamp(left, EDGE_KEEP - w, innerWidth - EDGE_KEEP))}px`;
    el.style.top = `${Math.round(clamp(top, EDGE_KEEP - h, innerHeight - EDGE_KEEP))}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  private clearInline(b: HudBlockDef): void {
    for (const p of ['left', 'top', 'right', 'bottom', 'transform', 'transformOrigin', 'width', 'height', 'zIndex'] as const) b.element.style[p] = '';
    if (b.resize?.mode === 'size' && b.resize.heightTarget) b.resize.heightTarget.style.height = '';
  }

  private otherRects(active: HudBlockDef): Rect[] {
    const out: Rect[] = [];
    for (const b of this.blocks) {
      if (b === active) continue;
      const r = rectOf(b.element);
      if (r.w > 0 && r.h > 0) out.push(r);
    }
    return out;
  }

  // --- Guides, mesures, infobulle ---------------------------------------------

  private clearGuides(): void {
    this.overlay.replaceChildren();
    this.info.hidden = true;
  }

  private drawGuides(b: HudBlockDef, r: Rect, others: Rect[], equal: EqualSpacing[]): void {
    const parts: HTMLElement[] = [];
    const line = (vertical: boolean, at: number, center: boolean): void => {
      const el = document.createElement('div');
      el.className = `hud-guide hud-guide--${vertical ? 'v' : 'h'}${center ? ' hud-guide--center' : ''}`;
      el.style[vertical ? 'left' : 'top'] = `${Math.round(at)}px`;
      parts.push(el);
    };
    const measure = (vertical: boolean, from: number, to: number, at: number, text: string, strong = false): void => {
      if (Math.abs(to - from) < 1) return;
      const el = document.createElement('div');
      el.className = `hud-measure hud-measure--${vertical ? 'v' : 'h'}${strong ? ' hud-measure--equal' : ''}`;
      const a = Math.min(from, to);
      const len = Math.abs(to - from);
      if (vertical) Object.assign(el.style, { left: `${Math.round(at)}px`, top: `${Math.round(a)}px`, height: `${Math.round(len)}px` });
      else Object.assign(el.style, { top: `${Math.round(at)}px`, left: `${Math.round(a)}px`, width: `${Math.round(len)}px` });
      const label = document.createElement('span');
      label.textContent = text;
      el.appendChild(label);
      parts.push(el);
    };
    if (others.length > 0 || this.drag?.kind === 'move') {
      // Alignements exacts : centre de l'ecran, bords et centres des autres blocs.
      const cx = (r.l + r.r) / 2;
      const cy = (r.t + r.b) / 2;
      const vx = innerWidth / 2;
      const vy = innerHeight / 2;
      if (Math.abs(cx - vx) < 0.75) line(true, vx, true);
      if (Math.abs(cy - vy) < 0.75) line(false, vy, true);
      const vLines = new Set<number>();
      const hLines = new Set<number>();
      for (const o of others) {
        for (const p of [r.l, cx, r.r]) for (const q of [o.l, (o.l + o.r) / 2, o.r]) if (Math.abs(p - q) < 0.75) vLines.add(Math.round(q));
        for (const p of [r.t, cy, r.b]) for (const q of [o.t, (o.t + o.b) / 2, o.b]) if (Math.abs(p - q) < 0.75) hLines.add(Math.round(q));
      }
      for (const x of vLines) line(true, x, false);
      for (const y of hLines) line(false, y, false);
      // Espacements egaux.
      for (const eq of equal) {
        const text = `${Math.round(eq.gap)} px = ${Math.round(eq.gap)} px`;
        for (const [a, c] of eq.segments) measure(eq.vertical, a, c, eq.at, text, true);
      }
      // Voisin le plus proche de chaque cote (meme ligne / colonne).
      if (equal.length === 0) {
        const row = others.filter((o) => o.t < r.b && o.b > r.t);
        const col = others.filter((o) => o.l < r.r && o.r > r.l);
        const left = row.filter((o) => o.r <= r.l + 0.5).sort((p, q) => q.r - p.r)[0];
        const right = row.filter((o) => o.l >= r.r - 0.5).sort((p, q) => p.l - q.l)[0];
        const up = col.filter((o) => o.b <= r.t + 0.5).sort((p, q) => q.b - p.b)[0];
        const down = col.filter((o) => o.t >= r.b - 0.5).sort((p, q) => p.t - q.t)[0];
        if (left && r.l - left.r <= NEAR_GAP) measure(false, left.r, r.l, cy, `${Math.round(r.l - left.r)} px`);
        if (right && right.l - r.r <= NEAR_GAP) measure(false, r.r, right.l, cy, `${Math.round(right.l - r.r)} px`);
        if (up && r.t - up.b <= NEAR_GAP) measure(true, up.b, r.t, cx, `${Math.round(r.t - up.b)} px`);
        if (down && down.t - r.b <= NEAR_GAP) measure(true, r.b, down.t, cx, `${Math.round(down.t - r.b)} px`);
      }
      // Distances aux bords de l'ecran, si proches.
      if (r.l <= NEAR_EDGE) measure(false, 0, r.l, cy + 10, `${Math.round(r.l)} px`);
      if (innerWidth - r.r <= NEAR_EDGE) measure(false, r.r, innerWidth, cy + 10, `${Math.round(innerWidth - r.r)} px`);
      if (r.t <= NEAR_EDGE) measure(true, 0, r.t, cx + 10, `${Math.round(r.t)} px`);
      if (innerHeight - r.b <= NEAR_EDGE) measure(true, r.b, innerHeight, cx + 10, `${Math.round(innerHeight - r.b)} px`);
    }
    this.overlay.replaceChildren(...parts);
    // Infobulle : nom, centre en % du viewport, taille, echelle.
    const st = this.effective(b);
    this.info.replaceChildren(
      Object.assign(document.createElement('b'), { textContent: b.label }),
      Object.assign(document.createElement('div'), { textContent: `X ${pct((r.l + r.r) / 2, innerWidth)}  Y ${pct((r.t + r.b) / 2, innerHeight)}` }),
      Object.assign(document.createElement('div'), { textContent: `L ${Math.round(r.w)} px  H ${Math.round(r.h)} px` }),
      Object.assign(document.createElement('div'), { textContent: `Scale ${Math.round((st?.scale ?? 1) * 100)} %` }),
    );
    this.info.hidden = false;
    const iw = this.info.offsetWidth;
    const ih = this.info.offsetHeight;
    this.info.style.left = `${Math.round(clamp(r.l, 4, innerWidth - iw - 4))}px`;
    this.info.style.top = `${Math.round(r.t - ih - 8 >= 4 ? r.t - ih - 8 : Math.min(innerHeight - ih - 4, r.b + 8))}px`;
  }
}

interface EqualSpacing {
  vertical: boolean;
  gap: number;
  /** Segments [debut, fin] mesures sur l'axe, a la coordonnee `at`. */
  segments: [number, number][];
  at: number;
}

/**
 * Aimantation d'un rectangle deplace : plus petite correction (<= HUD_SNAP)
 * vers le centre de l'ecran, un bord ou un centre d'un autre bloc, ou un
 * espacement egal (trois blocs sur la meme ligne / colonne). `bypass` (ALT) :
 * aucune correction, mais les espacements exactement egaux sont signales.
 */
export function computeSnap(r: Rect, others: Rect[], bypass: boolean): { dx: number; dy: number; equal: EqualSpacing[] } {
  const best = (cands: number[]): number => {
    let pick = 0;
    let dist = Infinity;
    for (const c of cands) if (Math.abs(c) <= HUD_SNAP && Math.abs(c) < dist) {
      dist = Math.abs(c);
      pick = c;
    }
    return pick;
  };
  const xs: number[] = [];
  const ys: number[] = [];
  const pointsX = [r.l, (r.l + r.r) / 2, r.r];
  const pointsY = [r.t, (r.t + r.b) / 2, r.b];
  for (const p of pointsX) xs.push(innerWidth / 2 - p);
  for (const p of pointsY) ys.push(innerHeight / 2 - p);
  for (const o of others) {
    for (const p of pointsX) for (const q of [o.l, (o.l + o.r) / 2, o.r]) xs.push(q - p);
    for (const p of pointsY) for (const q of [o.t, (o.t + o.b) / 2, o.b]) ys.push(q - p);
  }
  xs.push(...spacingCorrections(r, others, false));
  ys.push(...spacingCorrections(r, others, true));
  const dx = bypass ? 0 : best(xs);
  const dy = bypass ? 0 : best(ys);
  const final = mk(r.l + dx, r.t + dy, r.w, r.h);
  return { dx, dy, equal: [...equalSpacings(final, others, false), ...equalSpacings(final, others, true)] };
}

/** Voisins d'une meme ligne (axe X) ou colonne (axe Y), du plus proche au
 *  plus loin, de chaque cote du rectangle. */
function neighbours(r: Rect, others: Rect[], vertical: boolean): { before: Rect[]; after: Rect[] } {
  const lo = (x: Rect) => (vertical ? x.t : x.l);
  const hi = (x: Rect) => (vertical ? x.b : x.r);
  const overlap = (o: Rect) => (vertical ? o.l < r.r && o.r > r.l : o.t < r.b && o.b > r.t);
  const line = others.filter(overlap);
  return {
    before: line.filter((o) => hi(o) <= lo(r) + 0.5).sort((a, b) => hi(b) - hi(a)),
    after: line.filter((o) => lo(o) >= hi(r) - 0.5).sort((a, b) => lo(a) - lo(b)),
  };
}

/** Corrections qui egaliseraient deux espacements (entre deux voisins, ou
 *  dans le prolongement de deux voisins du meme cote). */
function spacingCorrections(r: Rect, others: Rect[], vertical: boolean): number[] {
  const lo = (x: Rect) => (vertical ? x.t : x.l);
  const hi = (x: Rect) => (vertical ? x.b : x.r);
  const { before, after } = neighbours(r, others, vertical);
  const out: number[] = [];
  const [b1, b2] = before;
  const [a1, a2] = after;
  if (b1 && a1) out.push(((lo(a1) - hi(r)) - (lo(r) - hi(b1))) / 2);
  if (b1 && b2) out.push(lo(b1) - hi(b2) - (lo(r) - hi(b1)));
  if (a1 && a2) out.push(lo(a1) - hi(r) - (lo(a2) - hi(a1)));
  return out;
}

/** Espacements egaux (a 0,75 px pres) autour du rectangle : segments a
 *  dessiner et valeur commune. */
function equalSpacings(r: Rect, others: Rect[], vertical: boolean): EqualSpacing[] {
  const lo = (x: Rect) => (vertical ? x.t : x.l);
  const hi = (x: Rect) => (vertical ? x.b : x.r);
  const at = vertical ? (r.l + r.r) / 2 : (r.t + r.b) / 2;
  const { before, after } = neighbours(r, others, vertical);
  const [b1, b2] = before;
  const [a1, a2] = after;
  const out: EqualSpacing[] = [];
  const push = (g1: [number, number], g2: [number, number]): void => {
    const d1 = g1[1] - g1[0];
    const d2 = g2[1] - g2[0];
    if (d1 > 0.5 && Math.abs(d1 - d2) < 0.75) out.push({ vertical, gap: d1, segments: [g1, g2], at });
  };
  if (b1 && a1) push([hi(b1), lo(r)], [hi(r), lo(a1)]);
  if (b1 && b2) push([hi(b2), lo(b1)], [hi(b1), lo(r)]);
  if (a1 && a2) push([hi(r), lo(a1)], [hi(a1), lo(a2)]);
  return out;
}

/** Blocs d'une disposition (export complet `{ blocks }` ou blocs seuls),
 *  null si ce n'est pas un objet. */
function layoutBlocks(raw: unknown): Record<string, unknown> | null {
  const source = raw && typeof raw === 'object' && 'blocks' in raw ? (raw as { blocks: unknown }).blocks : raw;
  return source && typeof source === 'object' ? (source as Record<string, unknown>) : null;
}

/** Reglage d'un bloc lu dans une disposition exportee : valeurs bornees,
 *  null si le bloc n'y figure pas (x et y obligatoires). Taille affichee
 *  (w, h) inconnue ici : mesuree a l'application. */
function parseBlockState(b: HudBlockDef, raw: unknown): HudBlockState | null {
  const v = raw as Record<string, unknown> | undefined;
  if (!v || typeof v !== 'object' || typeof v['x'] !== 'number' || typeof v['y'] !== 'number') return null;
  const st: HudBlockState = { fx: clamp(v['x'], -0.5, 1.5), fy: clamp(v['y'], -0.5, 1.5), w: 0, h: 0 };
  const anchor = typeof v['anchor'] === 'string' ? /^(top|middle|bottom)-(left|center|right)$/.exec(v['anchor']) : null;
  if (anchor && typeof v['ox'] === 'number' && typeof v['oy'] === 'number') {
    st.ay = anchor[1] === 'top' ? 'start' : anchor[1] === 'bottom' ? 'end' : 'center';
    st.ax = anchor[2] === 'left' ? 'start' : anchor[2] === 'right' ? 'end' : 'center';
    st.ox = clamp(v['ox'], -4000, 4000);
    st.oy = clamp(v['oy'], -4000, 4000);
  }
  if (typeof v['scale'] === 'number' && b.resize?.mode === 'scale') st.scale = clamp(v['scale'], HUD_SCALE_MIN, HUD_SCALE_MAX);
  if (b.resize?.mode === 'size') {
    if (typeof v['width'] === 'number') st.width = clamp(v['width'], b.resize.minW, b.resize.maxW);
    if (typeof v['height'] === 'number') st.height = clamp(v['height'], b.resize.minH, b.resize.maxH);
  }
  return st;
}

/** Ancrage d'un rectangle (tiers du viewport ou se trouve son centre) et
 *  decalages en px correspondants. */
function anchorOf(l: number, t: number, w: number, h: number): { ax: HudAnchor; ay: HudAnchor; ox: number; oy: number } {
  const axis = (start: number, size: number, total: number): { a: HudAnchor; o: number } => {
    const c = start + size / 2;
    if (c < total / 3) return { a: 'start', o: start };
    if (c > (total * 2) / 3) return { a: 'end', o: total - (start + size) };
    return { a: 'center', o: c - total / 2 };
  };
  const x = axis(l, w, innerWidth);
  const y = axis(t, h, innerHeight);
  return { ax: x.a, ay: y.a, ox: x.o, oy: y.o };
}

/** Bord gauche / haut a partir d'un ancrage et d'un decalage. */
function fromAnchor(a: HudAnchor, o: number, size: number, total: number): number {
  return a === 'start' ? o : a === 'end' ? total - o - size : total / 2 + o - size / 2;
}

function frac(pos: number, room: number): number {
  return room > 0 ? pos / room : 0;
}

function round(v: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

function pct(v: number, total: number): string {
  return `${(Math.round((v / Math.max(total, 1)) * 1000) / 10).toFixed(1).replace('.', ',')} %`;
}
