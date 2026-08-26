import type { AudioManager } from '../AudioManager';
import { applyGainEnvelope, createNoiseSource, createLowpass, createOscillator, jitter, withPan } from '../synthesis';

/**
 * Phase de placement + boutique (2026-08-12) — "comme si on posait une
 * figurine sur une table" (demande explicite d'Antoine). Bus 'sfx'
 * (spatialisable si besoin plus tard), volumes modestes.
 */
export function registerPlacementSounds(audio: AudioManager): void {
  // Selection d'unite : petit "tok" tres leger.
  audio.register(
    'placement.select',
    'sfx',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'triangle', jitter(520, 0.06));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.16 * (opts.volumeScale ?? 1) },
        { t: 0.05, value: 0.0001 },
      ]);
      const target = withPan(ctx, gain, opts.pan);
      osc.connect(gain);
      target.connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    },
    0.06,
  );

  // Pose d'unite : petit impact "THUMP" court (figurine posee sur la table).
  audio.register(
    'placement.place',
    'sfx',
    (ctx, output, opts) => {
      const thump = createOscillator(ctx, 'sine', jitter(110, 0.06));
      const thumpGain = ctx.createGain();
      applyGainEnvelope(thumpGain, ctx, [
        { t: 0, value: 0.3 * (opts.volumeScale ?? 1) },
        { t: 0.09, value: 0.0001 },
      ]);
      thump.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.09);
      thump.connect(thumpGain);

      const noise = createNoiseSource(ctx, 'placement-place', 0.05, jitter(1, 0.05));
      const noiseFilter = createLowpass(ctx, 1200);
      const noiseGain = ctx.createGain();
      applyGainEnvelope(noiseGain, ctx, [
        { t: 0, value: 0.12 * (opts.volumeScale ?? 1) },
        { t: 0.05, value: 0.0001 },
      ]);
      noise.connect(noiseFilter).connect(noiseGain);

      withPan(ctx, thumpGain, opts.pan).connect(output);
      noiseGain.connect(output);

      thump.start();
      thump.stop(ctx.currentTime + 0.1);
      noise.start();
      noise.stop(ctx.currentTime + 0.06);
    },
    0.1,
  );

  // Placement invalide : petit "duk" grave, pas electronique.
  audio.register(
    'placement.invalid',
    'sfx',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'triangle', jitter(140, 0.04));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.2 * (opts.volumeScale ?? 1) },
        { t: 0.1, value: 0.0001 },
      ]);
      osc.frequency.exponentialRampToValueAtTime(95, ctx.currentTime + 0.1);
      osc.connect(gain).connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.11);
    },
    0.11,
  );

  // Rotation (editeur de maps) : tick tres court.
  audio.register(
    'placement.rotate',
    'ui',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'square', jitter(700, 0.08));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.08 * (opts.volumeScale ?? 1) },
        { t: 0.03, value: 0.0001 },
      ]);
      osc.connect(gain).connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    },
    0.04,
  );

  // Vente/suppression : petit son descendant.
  audio.register(
    'placement.remove',
    'sfx',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'triangle', jitter(500, 0.05));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.18 * (opts.volumeScale ?? 1) },
        { t: 0.15, value: 0.0001 },
      ]);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.15);
      osc.connect(gain).connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    },
    0.16,
  );

  // "Pret pour la bataille" : impact court + ton heroique discret.
  audio.register(
    'placement.readyForBattle',
    'sfx',
    (ctx, output, opts) => {
      const thump = createOscillator(ctx, 'sine', 90);
      const thumpGain = ctx.createGain();
      applyGainEnvelope(thumpGain, ctx, [
        { t: 0, value: 0.28 * (opts.volumeScale ?? 1) },
        { t: 0.1, value: 0.0001 },
      ]);
      thump.connect(thumpGain).connect(output);

      const horn = createOscillator(ctx, 'triangle', 220);
      const hornGain = ctx.createGain();
      applyGainEnvelope(hornGain, ctx, [
        { t: 0.03, value: 0.0001 },
        { t: 0.08, value: 0.16 * (opts.volumeScale ?? 1) },
        { t: 0.35, value: 0.0001 },
      ]);
      horn.frequency.setValueAtTime(220, ctx.currentTime + 0.03);
      horn.frequency.linearRampToValueAtTime(280, ctx.currentTime + 0.35);
      horn.connect(hornGain).connect(output);

      thump.start();
      thump.stop(ctx.currentTime + 0.11);
      horn.start(ctx.currentTime + 0.03);
      horn.stop(ctx.currentTime + 0.36);
    },
    0.36,
  );

  // Achat : petite piece + confirmation.
  audio.register(
    'economy.purchase',
    'sfx',
    (ctx, output, opts) => {
      const coin = createOscillator(ctx, 'triangle', jitter(1400, 0.04));
      const coinGain = ctx.createGain();
      applyGainEnvelope(coinGain, ctx, [
        { t: 0, value: 0.001 },
        { t: 0.008, value: 0.2 * (opts.volumeScale ?? 1) },
        { t: 0.16, value: 0.0001 },
      ]);
      coin.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.16);
      coin.connect(coinGain).connect(output);

      const click = createOscillator(ctx, 'square', 2200);
      const clickGain = ctx.createGain();
      applyGainEnvelope(clickGain, ctx, [
        { t: 0, value: 0.05 * (opts.volumeScale ?? 1) },
        { t: 0.015, value: 0.0001 },
      ]);
      click.connect(clickGain).connect(output);

      coin.start();
      coin.stop(ctx.currentTime + 0.17);
      click.start();
      click.stop(ctx.currentTime + 0.02);
    },
    0.17,
  );

  // Or insuffisant : petit son sec, different de l'erreur UI, pas agressif.
  audio.register(
    'economy.insufficientGold',
    'sfx',
    (ctx, output, opts) => {
      const osc = createOscillator(ctx, 'triangle', jitter(200, 0.05));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.16 * (opts.volumeScale ?? 1) },
        { t: 0.08, value: 0.0001 },
      ]);
      osc.frequency.exponentialRampToValueAtTime(140, ctx.currentTime + 0.08);
      osc.connect(gain).connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    },
    0.09,
  );
}
