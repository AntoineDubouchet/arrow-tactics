import type { AudioManager } from '../AudioManager';
import { applyGainEnvelope, createHighpass, createNoiseSource, createOscillator, jitter, semitonesToRatio, withPan } from '../synthesis';

/**
 * Sons d'interface (2026-08-12) — jamais spatialises (bus 'ui', pas de pan
 * par defaut), toujours courts et discrets. Direction : bois/metal/parchemin,
 * jamais de "BEEP" informatique (demande explicite d'Antoine).
 */
export function registerUiSounds(audio: AudioManager): void {
  // Survol : tres leger, presque subliminal.
  audio.register(
    'ui.hover',
    'ui',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'sine', jitter(900, 0.05));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.0001 },
        { t: 0.01, value: 0.05 * (opts.volumeScale ?? 1) },
        { t: 0.05, value: 0.0001 },
      ]);
      osc.connect(gain).connect(withPan(ctx, gain, opts.pan));
      gain.connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    },
    0.06,
  );

  // Clic (2026-08-13, retravaille — le premier essai "trainait" trop, jugé
  // "pas fou"/"decevant" par Antoine : un seul ton grave qui glissait sur
  // 90ms, sans vrai "snap"). Deux couches courtes plutot qu'un seul ton :
  // un transient de bruit tres bref (le "clic" mecanique) + un pop tonal qui
  // chute vite (le "corps" du son) — duree totale ~55ms, beaucoup plus net.
  audio.register(
    'ui.click',
    'ui',
    (ctx, output, opts) => {
      const vol = opts.volumeScale ?? 1;

      const noise = createNoiseSource(ctx, 'ui-click', 0.02, 1);
      const noiseFilter = createHighpass(ctx, 3800);
      const noiseGain = ctx.createGain();
      applyGainEnvelope(noiseGain, ctx, [
        { t: 0, value: 0.16 * vol },
        { t: 0.018, value: 0.0001 },
      ]);
      noise.connect(noiseFilter).connect(noiseGain);

      const osc = createOscillator(ctx, 'triangle', jitter(720, 0.04));
      const oscGain = ctx.createGain();
      applyGainEnvelope(oscGain, ctx, [
        { t: 0, value: 0.26 * vol },
        { t: 0.05, value: 0.0001 },
      ]);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
      osc.connect(oscGain);

      withPan(ctx, oscGain, opts.pan).connect(output);
      noiseGain.connect(output);

      noise.start();
      noise.stop(ctx.currentTime + 0.03);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    },
    0.06,
  );

  // Confirmation : deux notes courtes montantes.
  audio.register(
    'ui.confirm',
    'ui',
    (ctx, output, opts) => {
      const notes = [440, 660];
      notes.forEach((freq, i) => {
        const osc = createOscillator(ctx, 'sine', jitter(freq, 0.02));
        const gain = ctx.createGain();
        const start = i * 0.07;
        applyGainEnvelope(gain, ctx, [
          { t: start, value: 0.0001 },
          { t: start + 0.015, value: 0.2 * (opts.volumeScale ?? 1) },
          { t: start + 0.12, value: 0.0001 },
        ]);
        osc.connect(gain).connect(output);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.13);
      });
    },
    0.22,
  );

  // Retour/annulation : une note courte descendante.
  audio.register(
    'ui.back',
    'ui',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'sine', jitter(420, 0.03));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.18 * (opts.volumeScale ?? 1) },
        { t: 0.12, value: 0.0001 },
      ]);
      osc.frequency.exponentialRampToValueAtTime(260, ctx.currentTime + 0.12);
      osc.connect(gain).connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    },
    0.13,
  );

  // Erreur : petite double-impulsion grave, jamais un bip electronique.
  audio.register(
    'ui.error',
    'ui',
    (ctx, output, opts) => {
      for (const start of [0, 0.09]) {
        const osc = createOscillator(ctx, 'square', 110 * semitonesToRatio(jitter(0, 2)));
        const gain = ctx.createGain();
        applyGainEnvelope(gain, ctx, [
          { t: start, value: 0.0001 },
          { t: start + 0.01, value: 0.14 * (opts.volumeScale ?? 1) },
          { t: start + 0.07, value: 0.0001 },
        ]);
        osc.connect(gain).connect(output);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.08);
      }
    },
    0.18,
  );
}
