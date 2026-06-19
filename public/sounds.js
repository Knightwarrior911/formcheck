/**
 * Sound effects using Web Audio API.
 * Short audio cues for reps, milestones, and form feedback.
 * No external files needed — generates tones programmatically.
 */

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq, duration, type, volume) {
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Audio not supported — fail silently
  }
}

/** Short beep for each rep */
export function playRepSound() {
  playTone(880, 0.08, "sine", 0.12);
}

/** Two-tone chime for milestones (5, 10, 15, 20, 25, 30, 50) */
export function playMilestoneSound() {
  playTone(660, 0.1, "sine", 0.15);
  setTimeout(() => playTone(880, 0.15, "sine", 0.15), 100);
}

/** Low buzz for form errors */
export function playErrorSound() {
  playTone(220, 0.15, "square", 0.08);
}

/** Success chime for calibration complete */
export function playSuccessSound() {
  playTone(523, 0.1, "sine", 0.12);
  setTimeout(() => playTone(659, 0.1, "sine", 0.12), 120);
  setTimeout(() => playTone(784, 0.15, "sine", 0.12), 240);
}

/** Rest timer countdown beep (last 3 seconds) */
export function playCountdownBeep(remaining) {
  if (remaining <= 3 && remaining > 0) {
    playTone(440 + (3 - remaining) * 100, 0.05, "sine", 0.1);
  }
}

/** Workout complete fanfare */
export function playWorkoutCompleteSound() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.15, "sine", 0.12), i * 150);
  });
}
