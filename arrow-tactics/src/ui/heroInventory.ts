import type { HeroSheetInfo } from '../run/entityInfo';

/**
 * Inventaire du Heros (2026-11-02) : ouvert par la touche I ou le bouton du
 * HUD du Heros, il remplace sa fiche (qui ne s'affiche plus a sa selection).
 * Statistiques effectives, sorts, et equipement recupere pendant la run
 * (aucun objet pour l'instant). Le jeu continue pendant qu'il est ouvert ;
 * main.ts le met a jour a intervalle regulier. Donnees deja mises en forme
 * (run/entityInfo.ts, heroSheetInfo).
 */
export class HeroInventoryPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private shown = '';

  constructor(onClose: () => void) {
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
    if (info.equipment.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hero-inventory-detail';
      empty.textContent = 'Aucun équipement : les objets récupérés pendant la run apparaîtront ici.';
      this.body.appendChild(empty);
    }
    for (const name of info.equipment) {
      const item = document.createElement('div');
      item.className = 'hero-inventory-item';
      item.textContent = name;
      this.body.appendChild(item);
    }
  }
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
