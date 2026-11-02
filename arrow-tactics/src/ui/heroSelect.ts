/**
 * Ecran « Choisir votre Heros » (2026-11-02) : avant chaque partie Survie,
 * une carte par heros jouable (data/heroes.ts), presélection, puis
 * lancement. Un seul heros aujourd'hui (Paladin) ; la liste suit HEROES.
 * Donnees deja mises en forme par main.ts ; aucun etat de jeu lu ici.
 */
export interface HeroChoice {
  id: string;
  name: string;
  description: string;
  /** Lignes courtes (PV, degats, mana, sorts). */
  details: string[];
  /** Portrait (data URL), absent si le modele manque. */
  portrait: Promise<string> | null;
}

export class HeroSelectScreen {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly launch: HTMLButtonElement;
  private selectedId: string | null = null;
  private readonly cards = new Map<string, HTMLElement>();

  constructor(
    private readonly onLaunch: (heroId: string) => void,
    private readonly onBack: () => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hero-select';
    this.root.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'hero-select-panel';
    const title = document.createElement('h1');
    title.className = 'hero-select-title';
    title.textContent = 'Choisir votre Héros';
    this.list = document.createElement('div');
    this.list.className = 'hero-select-list';
    const actions = document.createElement('div');
    actions.className = 'hero-select-actions';
    const back = document.createElement('button');
    back.className = 'hero-select-back';
    back.textContent = 'Retour';
    back.addEventListener('click', () => this.onBack());
    this.launch = document.createElement('button');
    this.launch.className = 'hero-select-launch';
    this.launch.textContent = 'Lancer la partie';
    this.launch.addEventListener('click', () => this.confirm());
    actions.append(back, this.launch);
    panel.append(title, this.list, actions);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
    document.addEventListener('keydown', (event) => {
      if (this.root.hidden) return;
      if (event.key === 'Enter') this.confirm();
      else if (event.key === 'Escape') this.onBack();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  show(choices: readonly HeroChoice[], selectedId: string): void {
    this.list.replaceChildren();
    this.cards.clear();
    for (const choice of choices) {
      const card = document.createElement('button');
      card.className = 'hero-select-card';
      card.dataset['heroId'] = choice.id;
      const portrait = document.createElement('div');
      portrait.className = 'hero-portrait hero-select-portrait';
      void choice.portrait?.then((url) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        portrait.appendChild(img);
      }).catch(() => undefined);
      const name = document.createElement('div');
      name.className = 'hero-select-name';
      name.textContent = choice.name;
      const description = document.createElement('div');
      description.className = 'hero-select-description';
      description.textContent = choice.description;
      const details = document.createElement('ul');
      details.className = 'hero-select-details';
      for (const line of choice.details) {
        const li = document.createElement('li');
        li.textContent = line;
        details.appendChild(li);
      }
      card.append(portrait, name, description, details);
      card.addEventListener('click', () => this.select(choice.id));
      card.addEventListener('dblclick', () => {
        this.select(choice.id);
        this.confirm();
      });
      this.cards.set(choice.id, card);
      this.list.appendChild(card);
    }
    this.select(this.cards.has(selectedId) ? selectedId : (choices[0]?.id ?? null));
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
  }

  isOpen(): boolean {
    return !this.root.hidden;
  }

  private select(id: string | null): void {
    this.selectedId = id;
    for (const [heroId, card] of this.cards) card.classList.toggle('hero-select-card--selected', heroId === id);
    this.launch.disabled = id === null;
  }

  private confirm(): void {
    if (this.selectedId !== null) this.onLaunch(this.selectedId);
  }
}
