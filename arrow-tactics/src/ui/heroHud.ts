import { HP_PER_PIP } from '../config/constants';
import { RESOURCE_KINDS, RESOURCE_LABELS, type ResourceKind } from '../config/resourceNodes';
import { HERO_LEVELS, HERO_MAX_LEVEL } from '../data/hero';
import { createItemIcon } from './itemIcons';

/**
 * HUD du HEROS (2026-11-01, direction Hero RTS ; refait le 2026-11-02) :
 *  - encart permanent, compact, en haut a gauche : portrait rond (clic :
 *    selectionne le Heros), barre de PV verte, barre de mana bleue, sort en
 *    cours ; a terre, portrait grise et compte a rebours de resurrection ;
 *    bouton de l'inventaire (touche I) : le Heros n'a plus de fiche a sa
 *    selection ;
 *  - barre d'action du Heros en bas a gauche : 6 emplacements (touches 1 a
 *    6), ses sorts dans l'ordre de data/heroes.ts (Soin en 1) ;
 *  - barre d'XP violette, fine, tout en bas de l'ecran, niveau discret ;
 *  - barre de progression de l'action en cours (sort, ramassage, recolte,
 *    construction), au centre juste au-dessus de la barre d'XP : duree
 *    seulement, jamais la nature de l'action ;
 *  - encart des ressources (bas a droite) : sac (bois et pierre portes,
 *    capacite) et stocks DEPOSES a la Baliste.
 * Visible pendant la bataille (meme cycle de vie que GoldHud), mis a jour a
 * chaque frame par main.ts, indifferent a la selection courante.
 */
export interface HeroHudState {
  level: number;
  xp: number;
  /** PV et mana, valeurs internes (PV : HP_PER_PIP par point affiche). */
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  /** Sort en cours d'incantation : nom et avancement (0..1), sinon null. */
  cast: { name: string; progress: number } | null;
  /** Sorts du Heros, emplacement par emplacement (barre d'action) : nom,
   *  cout, icone, utilisable ou non, info-bulle, avancement de l'incantation
   *  en cours (0..1) ou null. */
  spells: { id: string; name: string; cost: number; icon?: string; enabled: boolean; hint: string; castProgress: number | null }[];
  /** Action en cours du Heros : avancement (0..1) et secondes restantes,
   *  sinon null (barre masquee). */
  action: { progress: number; remaining: number } | null;
  /** Secondes avant resurrection (Heros a terre), sinon null. */
  respawnIn: number | null;
  resources: Readonly<Record<ResourceKind, number>>;
  /** Ressources portees par le Heros (pas encore deposees) et capacite. */
  carry: Readonly<Record<ResourceKind, number>>;
  capacity: number;
}

/** Barre horizontale avec texte centre. */
function bar(className: string): { root: HTMLElement; fill: HTMLElement; text: HTMLElement } {
  const root = document.createElement('div');
  root.className = `hero-bar ${className}`;
  const fill = document.createElement('div');
  fill.className = 'hero-bar-fill';
  const text = document.createElement('div');
  text.className = 'hero-bar-text';
  root.append(fill, text);
  return { root, fill, text };
}

/** Emplacements de la barre d'action (touches 1 a 6). */
const HERO_ACTION_SLOTS = 6;

const ratio = (value: number, max: number): string => `${Math.round(Math.min(1, Math.max(0, max > 0 ? value / max : 0)) * 1000) / 10}%`;

export class HeroHud {
  private readonly panel: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly respawn: HTMLElement;
  private readonly hpBar = bar('hero-bar--hp');
  private readonly manaBar = bar('hero-bar--mana');
  private readonly castLine: HTMLElement;
  private readonly castName: HTMLElement;
  private readonly castFill: HTMLElement;
  private readonly actionBar: HTMLElement;
  private readonly slots: { root: HTMLButtonElement; icon: HTMLElement; cost: HTMLElement; cast: HTMLElement; spellId: string | null; enabled: boolean }[] = [];
  private shownSpells = '';
  private readonly progressRoot: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressText: HTMLElement;
  private readonly xpRoot: HTMLElement;
  private readonly xpLevel: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly root: HTMLElement;
  private readonly carry: HTMLElement;
  private readonly amounts = new Map<ResourceKind, HTMLElement>();
  private last = '';

  constructor(
    onPortraitClick: () => void,
    private readonly onSpell: (spellId: string) => void,
    onInventory: () => void,
  ) {
    // Encart du Heros, haut a gauche.
    this.panel = document.createElement('div');
    this.panel.className = 'hero-panel';
    this.portrait = document.createElement('button');
    this.portrait.className = 'hero-portrait hero-panel-portrait';
    this.portrait.title = 'Sélectionner le Héros';
    this.portrait.addEventListener('click', onPortraitClick);
    this.respawn = document.createElement('div');
    this.respawn.className = 'hero-panel-respawn';
    this.portrait.appendChild(this.respawn);
    const bars = document.createElement('div');
    bars.className = 'hero-panel-bars';
    this.castLine = document.createElement('div');
    this.castLine.className = 'hero-panel-cast';
    this.castName = document.createElement('span');
    const castBar = document.createElement('div');
    castBar.className = 'hero-panel-cast-bar';
    this.castFill = document.createElement('div');
    this.castFill.className = 'hero-panel-cast-fill';
    castBar.appendChild(this.castFill);
    this.castLine.append(this.castName, castBar);
    // Inventaire (les sorts sont dans la barre d'action).
    const actions = document.createElement('div');
    actions.className = 'hero-panel-actions';
    const inventory = document.createElement('button');
    inventory.className = 'hero-panel-button';
    inventory.textContent = 'Inventaire (I)';
    inventory.title = 'Statistiques, sorts et équipement du Héros';
    inventory.addEventListener('click', onInventory);
    actions.append(inventory);

    // Barre d'action, bas a gauche : 6 emplacements, touches 1 a 6.
    this.actionBar = document.createElement('div');
    this.actionBar.className = 'hero-actions';
    for (let i = 0; i < HERO_ACTION_SLOTS; i++) {
      const root = document.createElement('button');
      root.className = 'hero-action-slot hero-action-slot--empty';
      const key = document.createElement('span');
      key.className = 'hero-action-key';
      key.textContent = String(i + 1);
      const icon = document.createElement('span');
      icon.className = 'hero-action-icon';
      const cost = document.createElement('span');
      cost.className = 'hero-action-cost';
      const cast = document.createElement('span');
      cast.className = 'hero-action-cast';
      root.append(icon, cast, key, cost);
      const slot = { root, icon, cost, cast, spellId: null as string | null, enabled: false };
      root.addEventListener('click', () => this.activateSlot(i));
      this.slots.push(slot);
      this.actionBar.appendChild(root);
    }
    bars.append(this.hpBar.root, this.manaBar.root, this.castLine, actions);
    this.panel.append(this.portrait, bars);

    // Progression de l'action, au centre, au-dessus de la barre d'XP.
    this.progressRoot = document.createElement('div');
    this.progressRoot.className = 'hero-progress';
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'hero-progress-fill';
    this.progressText = document.createElement('div');
    this.progressText.className = 'hero-progress-text';
    this.progressRoot.append(this.progressFill, this.progressText);
    this.progressRoot.hidden = true;

    // Barre d'XP, tout en bas.
    this.xpRoot = document.createElement('div');
    this.xpRoot.className = 'hero-xp';
    const xpLine = document.createElement('div');
    xpLine.className = 'hero-xp-line';
    this.xpLevel = document.createElement('span');
    this.xpLevel.className = 'hero-xp-level';
    this.xpText = document.createElement('span');
    this.xpText.className = 'hero-xp-text';
    xpLine.append(this.xpLevel, this.xpText);
    const xpBar = document.createElement('div');
    xpBar.className = 'hero-xp-bar';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'hero-xp-fill';
    xpBar.appendChild(this.xpFill);
    this.xpRoot.append(xpLine, xpBar);

    // Ressources (sac et stocks), bas a droite.
    this.root = document.createElement('div');
    this.root.className = 'hero-hud';
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
    this.root.append(this.carry, stock);
    document.body.append(this.panel, this.xpRoot, this.root, this.actionBar, this.progressRoot);
    this.setVisible(false);
  }

  /** Portrait du Heros joue (render/toonThumbnail.ts, toonUnitPortrait). */
  setPortrait(url: string | null): void {
    this.portrait.querySelector('img')?.remove();
    if (!url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    this.portrait.prepend(img);
  }

  update(state: HeroHudState): void {
    // Progression : a chaque image (barre fluide), hors de la cle ci-dessous.
    this.progressRoot.hidden = this.panel.hidden || state.action === null;
    if (state.action) {
      this.progressFill.style.width = ratio(state.action.progress, 1);
      this.progressText.textContent = `${Math.max(0, state.action.remaining).toFixed(1).replace('.', ',')} s`;
    }
    const key = JSON.stringify([
      state.level, state.xp, Math.ceil(state.hp / HP_PER_PIP), state.maxHp, Math.floor(state.mana), state.maxMana,
      state.cast ? [state.cast.name, Math.round(state.cast.progress * 50)] : null,
      state.respawnIn === null ? null : Math.ceil(state.respawnIn), state.resources, state.carry, state.capacity, state.spells,
    ]);
    if (key === this.last) return;
    this.last = key;

    const spellsKey = JSON.stringify(state.spells.map((s) => [s.id, s.icon]));
    if (spellsKey !== this.shownSpells) {
      // Icones : seulement quand la liste des sorts change.
      this.shownSpells = spellsKey;
      this.slots.forEach((slot, i) => {
        const spell = state.spells[i];
        slot.icon.replaceChildren(spell ? (spell.icon ? createItemIcon(spell.icon, 34) : document.createTextNode(spell.name)) : '');
      });
    }
    this.slots.forEach((slot, i) => {
      const spell = state.spells[i];
      slot.spellId = spell?.id ?? null;
      slot.enabled = spell?.enabled ?? false;
      slot.root.classList.toggle('hero-action-slot--empty', !spell);
      slot.root.classList.toggle('hero-action-slot--off', !!spell && !spell.enabled);
      slot.root.title = spell ? `${spell.hint} — touche ${i + 1}` : `Emplacement ${i + 1} (vide)`;
      slot.cost.textContent = spell ? String(spell.cost) : '';
      slot.cast.style.height = spell?.castProgress != null ? `${Math.round((1 - spell.castProgress) * 100)}%` : '0';
    });

    const dead = state.respawnIn !== null;
    this.panel.classList.toggle('hero-panel--down', dead);
    this.respawn.textContent = dead ? `${Math.ceil(state.respawnIn!)} s` : '';
    this.portrait.title = dead ? `À terre — retour à la Baliste dans ${Math.ceil(state.respawnIn!)} s` : 'Sélectionner le Héros';
    const hp = dead ? 0 : Math.ceil(state.hp / HP_PER_PIP);
    this.hpBar.fill.style.width = dead ? '0%' : ratio(state.hp, state.maxHp);
    this.hpBar.text.textContent = `${hp} / ${Math.round(state.maxHp / HP_PER_PIP)}`;
    this.manaBar.fill.style.width = ratio(state.mana, state.maxMana);
    this.manaBar.text.textContent = `${Math.floor(state.mana)} / ${state.maxMana}`;
    this.castLine.hidden = state.cast === null;
    if (state.cast) {
      this.castName.textContent = state.cast.name;
      this.castFill.style.width = ratio(state.cast.progress, 1);
    }

    const current = HERO_LEVELS.find((l) => l.level === state.level) ?? HERO_LEVELS[0]!;
    const next = HERO_LEVELS.find((l) => l.level === state.level + 1);
    this.xpLevel.textContent = `Niv. ${state.level}`;
    this.xpFill.style.width = next ? ratio(state.xp - current.xp, next.xp - current.xp) : '100%';
    this.xpText.textContent = state.level >= HERO_MAX_LEVEL ? `${state.xp} XP (niveau max)` : `${state.xp} / ${next!.xp} XP`;

    const carried = state.carry.wood + state.carry.stone;
    this.carry.textContent = `Sac ${carried} / ${state.capacity} — bois ${state.carry.wood}, pierre ${state.carry.stone}`;
    this.carry.classList.toggle('hero-hud-carry--full', carried >= state.capacity);
    for (const [kind, el] of this.amounts) el.textContent = String(state.resources[kind]);
  }

  /** Emplacement `index` (0 a 5) de la barre d'action : clic ou touche 1 a 6.
   *  Sans effet sur un emplacement vide ou un sort inutilisable. */
  activateSlot(index: number): void {
    const slot = this.slots[index];
    if (!slot || this.actionBar.hidden || !slot.spellId || !slot.enabled) return;
    this.onSpell(slot.spellId);
  }

  setVisible(visible: boolean): void {
    if (!visible) this.progressRoot.hidden = true;
    this.actionBar.hidden = !visible;
    this.panel.hidden = !visible;
    this.xpRoot.hidden = !visible;
    this.root.hidden = !visible;
  }
}
