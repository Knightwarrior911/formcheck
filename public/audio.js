/**
 * Audio cues via SpeechSynthesis (built-in browser, no cloud).
 * Queues utterances to avoid overlap.
 */

let queue = [];
let speaking = false;

function speakNext() {
  if (speaking || queue.length === 0) return;
  speaking = true;
  const text = queue.shift();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.1;
  u.pitch = 1.0;
  u.volume = 0.8;
  u.onend = () => { speaking = false; speakNext(); };
  u.onerror = () => { speaking = false; speakNext(); };
  speechSynthesis.speak(u);
}

export function say(text) {
  // Deduplicate rapid repeats
  if (queue.length > 0 && queue[queue.length - 1] === text) return;
  queue.push(text);
  // Keep queue short
  if (queue.length > 3) queue = queue.slice(-3);
  speakNext();
}

export function sayRep(count) {
  say(`Rep ${count}`);
}

export function sayFeedback(severity, msg) {
  if (severity === "bad") say(msg);
  // Good/warn feedback shown visually only — avoid audio spam
}
