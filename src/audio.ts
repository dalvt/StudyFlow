/**
 * Web Audio API chime sound generator for StudyFlow Assistant.
 * Synthesizes peaceful, harmonic tones without external audio file dependencies.
 */

export function playPomodoroChime(type: 'work' | 'break' = 'work', volume: number = 0.7): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

    // Harmonic singing bowl / chime chords:
    // Work complete: Uplifting harmonic chime (C5, E5, G5, C6)
    // Break complete: Gentle meditative gong (A4, C#5, E5)
    const frequencies = type === 'work'
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

      // Smooth attack and natural exponential acoustic decay
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + noteDuration + 0.05);
    });

    // Automatically close AudioContext when playback ends to free system audio resources
    window.setTimeout(() => {
      try {
        ctx.close().catch(() => {});
      } catch {}
    }, 3200);
  } catch (err) {
    console.warn('StudyFlow: Error synthesizing audio chime:', err);
  }
}
