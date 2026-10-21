import type { AudioManager } from '../AudioManager';
import {
  applyFrequencySweep,
  applyGainEnvelope,
  createBandpass,
  createHighpass,
  createLowpass,
  createNoiseSource,
  createOscillator,
  jitter,
  withPan,
} from '../synthesis';

/**
 * Sons de combat "premiere vague" (2026-08-12) — Fantassin (epee), Archer
 * (arc/fleche), mort generique. Le catalogue complet (Mage, Sentinelle,
 * vagues/victoire/defaite, ambiance) reste a faire dans une passe separee
 * (voir CLAUDE.md) — periemetre volontairement limite ici pour livrer un
 * moteur audio TESTABLE plutot qu'un enorme lot d'un coup.
 */
export function registerCombatSounds(audio: AudioManager): void {
  // --- Fantassin : epee -------------------------------------------------

  // Whoosh : bruit + bande-passante + glissando de frequence, synchronise
  // sur la partie RAPIDE du slash (voir main.ts, declenche au moment de
  // l'impact/frappe de l'animation d'epee, pas au windup).
  audio.register(
    'combat.swordSwing',
    'sfx',
    (ctx, output, opts) => {
      const duration = jitter(0.17, 0.15);
      const noise = createNoiseSource(ctx, 'sword-swing', duration, jitter(1, 0.08));
      const filter = createBandpass(ctx, 1200, 1.4);
      applyFrequencySweep(filter.frequency, ctx, jitter(700, 0.1), jitter(2400, 0.1), duration);
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.0001 },
        { t: duration * 0.35, value: 0.22 * (opts.volumeScale ?? 1) },
        { t: duration, value: 0.0001 },
      ]);
      noise.connect(filter).connect(gain);
      withPan(ctx, gain, opts.pan).connect(output);
      noise.start();
      noise.stop(ctx.currentTime + duration + 0.02);
    },
    0.22,
  );

  // Impact : transient + noise burst + petit impact grave + clink metallique
  // — compact, "TCHK/CLNK", pas une explosion.
  audio.register(
    'combat.swordHit',
    'sfx',
    (ctx, output, opts) => {
      const vol = opts.volumeScale ?? 1;
      const noise = createNoiseSource(ctx, 'sword-hit', 0.06, jitter(1, 0.08));
      const noiseFilter = createBandpass(ctx, jitter(2200, 0.1), 2.2);
      const noiseGain = ctx.createGain();
      applyGainEnvelope(noiseGain, ctx, [
        { t: 0, value: 0.22 * vol },
        { t: 0.05, value: 0.0001 },
      ]);
      noise.connect(noiseFilter).connect(noiseGain);

      const low = createOscillator(ctx, 'sine', jitter(140, 0.08));
      const lowGain = ctx.createGain();
      applyGainEnvelope(lowGain, ctx, [
        { t: 0, value: 0.18 * vol },
        { t: 0.07, value: 0.0001 },
      ]);
      low.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.07);
      low.connect(lowGain);

      const clink = createOscillator(ctx, 'triangle', jitter(2800, 0.1));
      const clinkGain = ctx.createGain();
      applyGainEnvelope(clinkGain, ctx, [
        { t: 0.005, value: 0.0001 },
        { t: 0.012, value: 0.1 * vol },
        { t: 0.05, value: 0.0001 },
      ]);
      clink.connect(clinkGain);

      withPan(ctx, noiseGain, opts.pan).connect(output);
      lowGain.connect(output);
      clinkGain.connect(output);

      noise.start();
      noise.stop(ctx.currentTime + 0.07);
      low.start();
      low.stop(ctx.currentTime + 0.08);
      clink.start(ctx.currentTime + 0.005);
      clink.stop(ctx.currentTime + 0.06);
    },
    0.09,
  );

  // Impact bouclier/armure : transient metallique aigu, decay rapide + bruit.
  audio.register(
    'combat.shieldHit',
    'sfx',
    (ctx, output, opts) => {
      const vol = opts.volumeScale ?? 1;
      const osc = createOscillator(ctx, 'triangle', jitter(1600, 0.08));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.2 * vol },
        { t: 0.09, value: 0.0001 },
      ]);
      osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.09);
      osc.connect(gain);

      const noise = createNoiseSource(ctx, 'shield-hit', 0.05, 1);
      const noiseFilter = createHighpass(ctx, 1800);
      const noiseGain = ctx.createGain();
      applyGainEnvelope(noiseGain, ctx, [
        { t: 0, value: 0.1 * vol },
        { t: 0.04, value: 0.0001 },
      ]);
      noise.connect(noiseFilter).connect(noiseGain);

      withPan(ctx, gain, opts.pan).connect(output);
      noiseGain.connect(output);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
      noise.start();
      noise.stop(ctx.currentTime + 0.05);
    },
    0.1,
  );

  // --- Archer : arc / fleche --------------------------------------------

  // Tir : petite tension + TWANG + claquement, declenche au lacher de corde
  // (voir main.ts, pendingArrowSpawns).
  audio.register(
    'combat.bowShot',
    'sfx',
    (ctx, output, opts) => {
      const vol = opts.volumeScale ?? 1;
      const twang = createOscillator(ctx, 'triangle', jitter(520, 0.06));
      const twangGain = ctx.createGain();
      applyGainEnvelope(twangGain, ctx, [
        { t: 0, value: 0.2 * vol },
        { t: 0.12, value: 0.0001 },
      ]);
      twang.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12);
      twang.connect(twangGain);

      const click = createNoiseSource(ctx, 'bow-shot-click', 0.02, 1);
      const clickFilter = createHighpass(ctx, 3000);
      const clickGain = ctx.createGain();
      applyGainEnvelope(clickGain, ctx, [
        { t: 0, value: 0.14 * vol },
        { t: 0.02, value: 0.0001 },
      ]);
      click.connect(clickFilter).connect(clickGain);

      withPan(ctx, twangGain, opts.pan).connect(output);
      clickGain.connect(output);
      twang.start();
      twang.stop(ctx.currentTime + 0.13);
      click.start();
      click.stop(ctx.currentTime + 0.03);
    },
    0.13,
  );

  // Vol de fleche : optionnel, tres discret — non branche par defaut (voir
  // main.ts) pour eviter un son par fleche en permanence, disponible si
  // besoin plus tard pour les fleches proches de la camera.
  audio.register(
    'combat.arrowFlight',
    'sfx',
    (ctx, output, opts) => {
      const noise = createNoiseSource(ctx, 'arrow-flight', 0.12, 1);
      const filter = createBandpass(ctx, 3500, 3);
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.0001 },
        { t: 0.03, value: 0.05 * (opts.volumeScale ?? 1) },
        { t: 0.12, value: 0.0001 },
      ]);
      noise.connect(filter).connect(gain);
      withPan(ctx, gain, opts.pan).connect(output);
      noise.start();
      noise.stop(ctx.currentTime + 0.13);
    },
    0.13,
  );

  // Impact fleche sur unite : petit "THK", bois + impact sec.
  audio.register(
    'combat.arrowHit',
    'sfx',
    (ctx, output, opts) => {
      const vol = opts.volumeScale ?? 1;
      const noise = createNoiseSource(ctx, 'arrow-hit', 0.05, jitter(1, 0.08));
      const filter = createLowpass(ctx, jitter(1500, 0.1));
      const gain = ctx.createGain();
      applyGainEnvelope(gain, ctx, [
        { t: 0, value: 0.18 * vol },
        { t: 0.05, value: 0.0001 },
      ]);
      noise.connect(filter).connect(gain);

      const thump = createOscillator(ctx, 'sine', jitter(200, 0.08));
      const thumpGain = ctx.createGain();
      applyGainEnvelope(thumpGain, ctx, [
        { t: 0, value: 0.1 * vol },
        { t: 0.04, value: 0.0001 },
      ]);
      thump.connect(thumpGain);

      withPan(ctx, gain, opts.pan).connect(output);
      thumpGain.connect(output);
      noise.start();
      noise.stop(ctx.currentTime + 0.06);
      thump.start();
      thump.stop(ctx.currentTime + 0.05);
    },
    0.06,
  );

  // --- Mort generique (toutes unites, 2026-08-12) ------------------------
  // Volontairement ABSTRAIT/stylise (jamais de cri) : petit impact de corps
  // + armure + cloth/noise, plus discret qu'une attaque principale.
  audio.register(
    'combat.unitDeath',
    'sfx',
    (ctx, output, opts) => {
      const vol = (opts.volumeScale ?? 1) * 0.8; // toujours en retrait des attaques
      const thud = createOscillator(ctx, 'sine', jitter(100, 0.1));
      const thudGain = ctx.createGain();
      applyGainEnvelope(thudGain, ctx, [
        { t: 0, value: 0.22 * vol },
        { t: 0.14, value: 0.0001 },
      ]);
      thud.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.14);
      thud.connect(thudGain);

      const clink = createOscillator(ctx, 'triangle', jitter(1500, 0.12));
      const clinkGain = ctx.createGain();
      applyGainEnvelope(clinkGain, ctx, [
        { t: 0.05, value: 0.0001 },
        { t: 0.06, value: 0.08 * vol },
        { t: 0.12, value: 0.0001 },
      ]);
      clink.connect(clinkGain);

      const cloth = createNoiseSource(ctx, 'unit-death-cloth', 0.15, 1);
      const clothFilter = createLowpass(ctx, 900);
      const clothGain = ctx.createGain();
      applyGainEnvelope(clothGain, ctx, [
        { t: 0, value: 0.06 * vol },
        { t: 0.15, value: 0.0001 },
      ]);
      cloth.connect(clothFilter).connect(clothGain);

      withPan(ctx, thudGain, opts.pan).connect(output);
      clinkGain.connect(output);
      clothGain.connect(output);
      thud.start();
      thud.stop(ctx.currentTime + 0.15);
      clink.start(ctx.currentTime + 0.05);
      clink.stop(ctx.currentTime + 0.13);
      cloth.start();
      cloth.stop(ctx.currentTime + 0.16);
    },
    0.16,
  );
}
