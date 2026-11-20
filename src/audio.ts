// Ultra-compact WebAudio procedural sound synthesizer (inspired by ZzFX principles)
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Procedural gunshot with weapon-specific punch, mechanical crack, and realistic bass thump
export function playGunshotSound(weaponType: 'smg' | 'ar' | 'sniper' = 'smg') {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 1. Initial transient crack & explosive white noise
    const noiseDuration = weaponType === 'sniper' ? 0.18 : (weaponType === 'ar' ? 0.12 : 0.08);
    const bufferSize = Math.floor(ctx.sampleRate * noiseDuration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const decayRate = weaponType === 'sniper' ? 0.04 : (weaponType === 'ar' ? 0.025 : 0.018);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decayRate));
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // Highpass filter for the crisp metallic crack
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(weaponType === 'sniper' ? 1400 : (weaponType === 'ar' ? 1800 : 2200), now);
    noiseFilter.Q.setValueAtTime(1.2, now);

    const noiseGain = ctx.createGain();
    const peakVolume = weaponType === 'sniper' ? 1.0 : (weaponType === 'ar' ? 0.85 : 0.7);
    noiseGain.gain.setValueAtTime(peakVolume, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.005, now + noiseDuration);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(now);

    // 2. Heavy Sub/Bass Thump (body punch)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'triangle';
    const startFreq = weaponType === 'sniper' ? 240 : (weaponType === 'ar' ? 200 : 160);
    const endFreq = weaponType === 'sniper' ? 25 : (weaponType === 'ar' ? 30 : 38);
    const thumpDuration = weaponType === 'sniper' ? 0.22 : (weaponType === 'ar' ? 0.16 : 0.11);

    subOsc.frequency.setValueAtTime(startFreq, now);
    subOsc.frequency.exponentialRampToValueAtTime(endFreq, now + thumpDuration);

    subGain.gain.setValueAtTime(weaponType === 'sniper' ? 1.0 : 0.85, now);
    subGain.gain.exponentialRampToValueAtTime(0.005, now + thumpDuration);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + thumpDuration);

    // 3. Mechanical bolt click (tactical realism)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(3200, now);
    clickOsc.frequency.exponentialRampToValueAtTime(800, now + 0.015);
    clickGain.gain.setValueAtTime(0.3, now);
    clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.015);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.015);
  } catch {
    // Ignored if blocked
  }
}

// Weapon switch mechanical rack sound
export function playSwitchSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.06);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);

    // Secondary latch click
    setTimeout(() => {
      try {
        const cNow = ctx.currentTime;
        const cOsc = ctx.createOscillator();
        const cGain = ctx.createGain();
        cOsc.type = 'sine';
        cOsc.frequency.setValueAtTime(1400, cNow);
        cOsc.frequency.exponentialRampToValueAtTime(500, cNow + 0.04);
        cGain.gain.setValueAtTime(0.25, cNow);
        cGain.gain.exponentialRampToValueAtTime(0.01, cNow + 0.04);
        cOsc.connect(cGain);
        cGain.connect(ctx.destination);
        cOsc.start(cNow);
        cOsc.stop(cNow + 0.04);
      } catch {
        // ignore
      }
    }, 45);
  } catch {
    // ignore
  }
}

// Low tick for impact hit
export function playHitSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // Fallback
  }
}

// Hit confirmation ding (when you shoot an enemy player)
export function playPlayerHurtSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch {
    // Fallback
  }
}

// Death thud
export function playDeathSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    // Fallback
  }
}

// Grenade detonation explosion sound
export function playExplosionSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Heavy blast noise
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.1));
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(350, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(now);

    // Deep sub-bass boom
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(100, now);
    subOsc.frequency.exponentialRampToValueAtTime(20, now + 0.5);

    subGain.gain.setValueAtTime(1.0, now);
    subGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.5);
  } catch {
    // Fallback
  }
}
