import type { HeroSheetInfo, HeroSheetItem } from '../run/entityInfo';

/**
 * Inventaire du Heros (2026-11-02) : ouvert par la touche I ou le bouton du
 * HUD du Heros, il remplace sa fiche (qui ne s'affiche plus a sa selection).
 * Statistiques effectives, sorts, equipement porte (un emplacement par
 * ligne, « Retirer ») et items du sac (« Equiper »), nom a la couleur de la
 * rarete. Le jeu continue pendant qu'il est ouvert ;
 * main.ts le met a jour a intervalle regulier. Donnees deja mises en forme
 * (run/entityInfo.ts, heroSheetInfo).
 */
export class HeroInventoryPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private shown = '';

  constructor(
    onClose: () => void,
    private readonly onEquip: (itemId: string) => void,
    private readonly onUnequip: (slot: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hero-inventory';
    this.root.hidden = true;
    const header = document.createElement('div');
    header.className = 'hero-inventory-header';
    this.title = document.createElement('div');
    this.title.className = 'hero-inventory-title';
    const close = document.createElement('button');
    close.className = 'hero-inventory-close';
    close.textContent = '×';
    close.title = 'Fermer (I ou Échap)';
    close.addEventListener('click', onClose);
    header.append(this.title, close);
    this.body = document.createElement('div');
    this.root.append(header, this.body);
    document.body.appendChild(this.root);
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  open(info: HeroSheetInfo): void {
    this.update(info);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  update(info: HeroSheetInfo): void {
    const key = JSON.stringify(info);
    if (key === this.shown) return;
    this.shown = key;
    this.title.textContent = info.title;
    this.body.replaceChildren();

    const hpLine = document.createElement('div');
    hpLine.className = 'hero-inventory-row';
    hpLine.append(span('PV'), span(`${info.hp.current} / ${info.hp.max}`));
    const hpBar = document.createElement('div');
    hpBar.className = 'hero-inventory-hp';
    const hpFill = document.createElement('div');
    hpFill.style.width = `${Math.round(info.hp.fraction * 1000) / 10}%`;
    hpBar.appendChild(hpFill);
    this.body.append(section('Statistiques'), hpLine, hpBar);
    for (const row of info.rows) {
      const line = document.createElement('div');
      line.className = 'hero-inventory-row';
      line.append(span(row.label), span(row.value));
      this.body.appendChild(line);
    }

    this.body.appendChild(section('Sorts'));
    for (const spell of info.spells) {
      const item = document.createElement('div');
      item.className = 'hero-inventory-item';
      const name = document.createElement('b');
      name.textContent = spell.name;
      const detail = document.createElement('span');
      detail.className = 'hero-inventory-detail';
      detail.textContent = spell.detail;
      const description = document.createElement('div');
      description.className = 'hero-inventory-detail';
      description.textContent = spell.description;
      item.append(name, ' ', detail, description);
      this.body.appendChild(item);
    }

    this.body.appendChild(section('Équipement'));
    for (const entry of info.equipment) {
      const line = document.createElement('div');
      line.className = 'hero-inventory-slot';
      const label = document.createElement('span');
      label.className = 'hero-inventory-detail';
      label.textContent = entry.label;
      line.appendChild(label);
      if (entry.item) {
        line.appendChild(itemCard(entry.item, 'Retirer', () => this.onUnequip(entry.slot)));
      } else {
        const empty = document.createElement('span');
        empty.className = 'hero-inventory-detail';
        empty.textContent = '—';
        line.appendChild(empty);
      }
      this.body.appendChild(line);
    }

    this.body.appendChild(section(`Sac d'objets (${info.capacity})`));
    if (info.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hero-inventory-detail';
      empty.textContent = 'Aucun objet : le butin récupéré pendant la run apparaîtra ici.';
      this.body.appendChild(empty);
    }
    info.items.forEach((item) => this.body.appendChild(itemCard(item, 'Équiper', () => this.onEquip(item.id))));
  }
}

/** Carte d'un item : nom (couleur de rarete), cadre, lignes, bouton. */
function itemCard(item: HeroSheetItem, action: string, onClick: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'hero-inventory-card';
  card.style.borderColor = item.color;
  const head = document.createElement('div');
  head.className = 'hero-inventory-card-head';
  const name = document.createElement('b');
  name.textContent = item.name;
  name.style.color = item.color;
  const button = document.createElement('button');
  button.className = 'hero-inventory-action';
  button.textContent = action;
  button.addEventListener('click', onClick);
  head.append(name, button);
  const meta = document.createElement('div');
  meta.className = 'hero-inventory-detail';
  meta.textContent = `${item.rarity} · ${item.slot} · vente ${item.sellValue} or`;
  card.append(head, meta);
  for (const line of item.lines) {
    const l = document.createElement('div');
    l.className = 'hero-inventory-card-line';
    l.textContent = line;
    card.appendChild(l);
  }
  return card;
}

function span(text: string): HTMLElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}

function section(title: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hero-inventory-section';
  el.textContent = title;
  return el;
}
