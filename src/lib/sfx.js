// Lightweight game SFX via the Web Audio API — no asset files. Synthesised
// tones, lazily created on first play (after a user gesture, satisfying
// autoplay policy). Cheap, instant, and impossible to 404.

let ctx = null;

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, startOffset, dur, type = "sine", gain = 0.14) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + startOffset;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// Bright ascending arpeggio (C5–E5–G5).
export function playWin() {
  tone(523.25, 0, 0.18, "triangle", 0.13);
  tone(659.25, 0.09, 0.18, "triangle", 0.13);
  tone(783.99, 0.18, 0.30, "triangle", 0.14);
}

// Soft descending two-tone (Eb4–Bb3).
export function playLoss() {
  tone(311.13, 0, 0.22, "sawtooth", 0.10);
  tone(233.08, 0.13, 0.34, "sawtooth", 0.10);
}

// Short countdown tick. Caller ramps pitch + gain in the final seconds so
// the rhythm intensifies without needing separate functions.
export function playTick({ pitch = 880, gain = 0.06 } = {}) {
  tone(pitch, 0, 0.05, "square", gain);
}
