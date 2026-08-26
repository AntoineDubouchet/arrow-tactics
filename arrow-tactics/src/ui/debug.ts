import type { Loop } from '../core/loop';
import type { Renderer } from '../render/renderer';
import type { World } from '../sim/world';

/**
 * Toute l'interface du jeu sera en HTML/CSS par-dessus le canvas, jamais dessinee
 * dans le canvas. C'est bien plus rapide a construire et bien plus propre a lire.
 * Ce panneau est temporaire : il sert a valider la boucle et a trouver l'angle de
 * camera qui te plait.
 */
export class DebugPanel {
  private readonly el: HTMLElement;
  private accum = 0;

  constructor(
    private readonly loop: Loop,
    private readonly world: World,
    private readonly renderer: Renderer,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'debug-panel';
    document.body.appendChild(this.el);

    // Reduit au strict minimum (demande d'Antoine, 2026-08-10) : la liste
    // complete des raccourcis camera/simulation encombrait l'ecran pour un
    // panneau qui n'est de toute facon que temporaire (voir commentaire de
    // classe). "Espace — pause" retire en meme temps que le raccourci
    // lui-meme (voir main.ts) : il faisait doublon avec le vrai menu pause
    // (Echap) sans jamais l'afficher, ce qui n'avait pas de sens.
    const help = document.createElement('div');
    help.className = 'debug-help';
    help.innerHTML = 'X — Vitesse fois 2';
    document.body.appendChild(help);
  }

  update(realDelta: number): void {
    this.accum += realDelta;
    if (this.accum < 0.15) return;
    this.accum = 0;

    const rows: [string, string][] = [
      ['fps', Math.round(this.loop.fps).toString()],
      ['tick', this.world.tick.toString()],
      ['temps sim', `${this.world.time.toFixed(1)} s`],
      ['vitesse', this.loop.timeScale === 0 ? 'pause' : `x${this.loop.timeScale}`],
      ['joueur', this.world.countAlive('player').toString()],
      ['ennemis', this.world.countAlive('enemy').toString()],
      ['graine', this.world.seed.toString(16)],
      ['pivot', `${Math.round(this.renderer.yawDeg)}°`],
      ['inclinaison', `${Math.round(this.renderer.pitchDeg)}°`],
      ['zoom', this.renderer.viewHeight.toFixed(0)],
    ];

    this.el.innerHTML = rows
      .map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`)
      .join('');
  }
}
