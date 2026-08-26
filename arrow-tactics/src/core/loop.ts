import { MAX_FRAME_DELTA, SIM_STEP } from '../config/constants';

/**
 * Boucle a pas de temps fixe (accumulateur).
 *
 * Pourquoi : la simulation avance toujours par pas de 1/30s identiques, quelle que
 * soit la machine. Ca nous donne le determinisme (rejouer une bataille a l'identique),
 * la pause propre, la vitesse x2, et plus tard la possibilite de simuler 10 000
 * combats sans affichage pour equilibrer.
 *
 * Le rendu, lui, tourne a la frequence de l'ecran et interpole entre le tick
 * precedent et le tick courant grace a `alpha`. C'est ce qui garde 144 Hz fluide
 * avec une simulation a 30 Hz.
 */
export class Loop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  /** Multiplicateur de vitesse. 0 = pause, 2 = double vitesse. */
  timeScale = 1;

  /** Statistiques d'affichage. */
  fps = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(
    private readonly onStep: (dt: number) => void,
    private readonly onRender: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    const realDelta = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DELTA);
    this.lastTime = now;

    this.fpsAccum += realDelta;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.accumulator += realDelta * this.timeScale;

    // Garde-fou : si on prend trop de retard, on abandonne les ticks en trop
    // plutot que d'entrer dans une spirale de la mort.
    let steps = 0;
    while (this.accumulator >= SIM_STEP && steps < 8) {
      this.onStep(SIM_STEP);
      this.accumulator -= SIM_STEP;
      steps++;
    }
    if (steps === 8) this.accumulator = 0;

    this.onRender(this.accumulator / SIM_STEP);
  };
}
