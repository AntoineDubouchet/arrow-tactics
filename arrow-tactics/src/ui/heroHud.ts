import { RESOURCE_KINDS, RESOURCE_LABELS, type ResourceKind } from '../config/resourceNodes';
import { HERO_LEVELS, HERO_MAX_LEVEL } from '../data/hero';

/**
 * Encart du HEROS (2026-11-01, direction Hero RTS) : niveau, barre d'XP
 * VIOLETTE dediee, compte a rebours de resurrection, sac (bois et pierre
 * portes, capacite) et stocks de bois et de pierre DEPOSES a la Baliste. Visible pendant le placement et la bataille (meme cycle de vie que
 * GoldHud), mis a jour a chaque frame par main.ts.
 */
export interface HeroHudState {
  level: number;
  xp: number;
  /** Secondes avant resurrection (Heros a terre), sinon null. */
  respawnIn: number | null;
  resources: Readonly<Record<ResourceKind, number>>;
  /** Ressources portees par le Heros (pas encore deposees) et capacite. */
  carry: Readonly<Record<ResourceKind, number>>;
  capacity: number;
}

export class HeroHud {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly status: HTMLElement;
  private readonly carry: HTMLElement;
  private readonly amounts = new Map<ResourceKind, HTMLElement>();
  private last = '';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hero-hud';
    this.title = document.createElement('div');
    this.title.className = 'hero-hud-title';
    const bar = document.createElement('div');
    bar.className = 'hero-hud-xp';
    this.fill = document.createElement('div');
    this.fill.className = 'hero-hud-xp-fill';
    bar.appendChild(this.fill);
    this.xpText = document.createElement('div');
    this.xpText.className = 'hero-hud-xp-text';
    this.status = document.createElement('div');
    this.status.className = 'hero-hud-status';
    this.carry = document.createElement('div');
    this.carry.className = 'hero-hud-carry';
    const stock = document.createElement('div');
    stock.className = 'hero-hud-stock';
    stock.title = 'Stock déposé à la Baliste (seul utilisable pour construire)';
    for (const kind of RESOURCE_KINDS) {
      const item = document.createElement('span');
      item.className = `hero-hud-resource hero-hud-resource--${kind}`;
      const amount = document.createElement('b');
      item.append(`${RESOURCE_LABELS[kind]} `, amount);
      this.amounts.set(kind, amount);
      stock.appendChild(item);
    }
    this.root.append(this.title, bar, this.xpText, this.status, this.carry, stock);
    document.body.appendChild(this.root);
    this.setVisible(false);
  }

  update(state: HeroHudState): void {
    const key = JSON.stringify([state.level, state.xp, state.respawnIn === null ? null : Math.ceil(state.respawnIn), state.resources, state.carry, state.capacity]);
    if (key === this.last) return;
    this.last = key;
    const current = HERO_LEVELS.find((l) => l.level === state.level) ?? HERO_LEVELS[0]!;
    const next = HERO_LEVELS.find((l) => l.level === state.level + 1);
    this.title.textContent = `Héros — Niv. ${state.level}`;
    const ratio = next ? (state.xp - current.xp) / (next.xp - current.xp) : 1;
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    this.xpText.textContent = state.level >= HERO_MAX_LEVEL ? `XP ${state.xp} (niveau max)` : `XP ${state.xp} / ${next!.xp}`;
    this.status.textContent = state.respawnIn === null ? '' : `À terre — retour à la Baliste dans ${Math.ceil(state.respawnIn)} s`;
    this.status.hidden = state.respawnIn === null;
    const carried = state.carry.wood + state.carry.stone;
    this.carry.textContent = `Sac ${carried} / ${state.capacity} — bois ${state.carry.wood}, pierre ${state.carry.stone}`;
    this.carry.classList.toggle('hero-hud-carry--full', carried >= state.capacity);
    for (const [kind, el] of this.amounts) el.textContent = String(state.resources[kind]);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }
}
