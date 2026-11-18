const SOUND_STORAGE_KEY = 'cubenet-lab-sound-v1';

let sharedAudioCtx: AudioContext | null = null;
let sharedNoiseBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctx();
    } catch {
      return null;
    }
  }

  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {
      // Ignore autoplay blocks until user gesture unlocks audio context
    });
  }

  return sharedAudioCtx;
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (sharedNoiseBuffer && sharedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return sharedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // Exponentially decaying white noise burst for crisp plastic click
    const env = Math.pow(1 - i / length, 2.2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  sharedNoiseBuffer = buffer;
  return buffer;
}

export function loadSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage errors in restricted environments
  }
}

/**
 * Unlocks Web Audio on explicit user gesture (such as clicking Play, Next, or Unmute).
 */
export function primeCubeAudio(): void {
  try {
    getAudioContext();
  } catch {
    // Safe no-op
  }
}

/**
 * Synthesizes a crisp mechanical speedcube turn + magnetic detent click.
 */
export function playTurnSnap(pitchOffset = 0): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Tactile ABS plastic click transient (filtered noise burst)
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(1950 + pitchOffset * 180, now);
    bandpass.Q.setValueAtTime(2.4, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.14, now + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.032);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.036);

    // 2. Hollow cube core resonant thud / magnet snap
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const startFreq = 265 + pitchOffset * 22;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.034);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.001, now);
    bodyGain.gain.linearRampToValueAtTime(0.095, now + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.038);

    osc.connect(bodyGain);
    bodyGain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.042);
  } catch {
    // Ignore audio synthesis failures gracefully
  }
}

/**
 * Plays a clean, subtle harmonic chord when the final solving move locks the cube.
 */
export function playSolvedChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, delay: 0, peak: 0.065, dur: 0.42 }, // C5
      { freq: 659.25, delay: 0.055, peak: 0.055, dur: 0.44 }, // E5
      { freq: 783.99, delay: 0.11, peak: 0.06, dur: 0.52 }, // G5
      { freq: 1046.5, delay: 0.165, peak: 0.042, dur: 0.56 }, // C6
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.delay);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now + n.delay);
      gain.gain.linearRampToValueAtTime(n.peak, now + n.delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + n.delay + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.delay);
      osc.stop(now + n.delay + n.dur + 0.02);
    }
  } catch {
    // Ignore audio synthesis failures gracefully
  }
}
