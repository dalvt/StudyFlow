import type { PomodoroSoundType } from './settings-utils.ts';
export type { PomodoroSoundType };

/**
 * Web Audio API synthesizer for StudyFlow Assistant.
 * Synthesizes peaceful tones and tactile audio without external audio dependencies.
 */
export function playPomodoroSound(
  sound: PomodoroSoundType = 'bell',
  type: 'work' | 'break' = 'work',
  volume: number = 0.7
): void {
  if (sound === 'silent') return;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    const clampedVol = Math.max(0, Math.min(1, volume));
    masterGain.gain.setValueAtTime(clampedVol, now);
    masterGain.connect(ctx.destination);

    if (sound === 'click') {
      // Tactile mechanical click sound
      const osc = ctx.createOscillator();
      const clickGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(type === 'work' ? 1200 : 900, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.025);

      clickGain.gain.setValueAtTime(0.5, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.connect(clickGain);
      clickGain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.03);

      window.setTimeout(() => {
        try {
          ctx.close().catch(() => {
            // Ignore audio context close error
          });
        } catch {
          // Ignore audio context close error
        }
      }, 100);
      return;
    }

    if (sound === 'soft') {
      // Gentle, warm dual sine tone
      const freqs = type === 'work' ? [440.0, 528.0] : [396.0, 440.0];
      const duration = 1.6;

      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const targetGain = 0.25 / freqs.length;
        noteGain.gain.setValueAtTime(0.0001, now);
        noteGain.gain.exponentialRampToValueAtTime(targetGain, now + 0.08);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(now);
        osc.stop(now + duration + 0.05);
      });

      window.setTimeout(() => {
        try {
          ctx.close().catch(() => {
            // Ignore audio context close error
          });
        } catch {
          // Ignore audio context close error
        }
      }, 2000);
      return;
    }

    // Default 'bell': Harmonic singing bowl / chime chords
    const frequencies =
      type === 'work'
        ? [523.25, 659.25, 783.99, 1046.5]
        : [440.0, 554.37, 659.25];

    const noteDuration = 2.4;

    frequencies.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.07);

      const startTime = now + index * 0.07;
      const targetGain = 0.28 / frequencies.length;

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.05);
    });

    window.setTimeout(() => {
      try {
        ctx.close().catch(() => {
          // Ignore audio context close error
        });
      } catch {
        // Ignore audio context close error
      }
    }, 3200);
  } catch (err) {
    console.warn('StudyFlow: Error synthesizing audio sound:', err);
  }
}

/**
 * Backward compatibility alias for playPomodoroSound('bell', ...)
 */
export function playPomodoroChime(type: 'work' | 'break' = 'work', volume: number = 0.7): void {
  playPomodoroSound('bell', type, volume);
}
