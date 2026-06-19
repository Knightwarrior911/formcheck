/**
 * Encouragement and feedback messages.
 * Adds variety and personality to the app.
 */

// Streak messages
export const STREAK_MESSAGES = {
  1: ["First workout! 🎉", "Great start! 💪", "Day 1 — let's go! 🔥"],
  3: ["3 day streak! 🔥", "Building momentum! 💪", "You're on fire! 🔥"],
  5: ["5 day streak! 🏆", "Consistency king/queen! 👑", "5 and counting! 🚀"],
  7: ["One week strong! 💪", "7 day streak! 🏅", "Week warrior! ⚔️"],
  10: ["10 day streak! 🌟", "Double digits! 🎯", "Unstoppable! 💥"],
  14: ["Two weeks! 🏅", "14 days of gains! 💪", "Habit forming! 🧠"],
  21: ["21 days — that's a habit! 🧠", "3 weeks strong! 🎯", "Habit unlocked! 🔓"],
  30: ["30 day streak! 🏆", "One month! 🌟", "Legendary consistency! 👑"],
  50: ["50 days! 💥", "Half century! 🎊", "Absolute unit! 🏋️"],
  100: ["100 DAY STREAK! 🎊🏆💯", "Century club! 👑", "LEGENDARY! 🔥💥🚀"],
};

// Milestone messages (by rep count within a session)
export const MILESTONE_MESSAGES = {
  5: ["5 reps! Solid start! 💪", "Nice! Keep going! 🔥"],
  10: ["10 reps! Double digits! 🎯", "Perfect 10! 💯", "You're in the zone! 🌟"],
  15: ["15 reps! Still going strong! 💪", "Unstoppable! 🚀"],
  20: ["20 reps! Beast mode! 🦁", "Incredible endurance! 🏆"],
  25: ["25 reps! Quarter century! 🎊", "You're crushing it! 💥"],
  30: ["30 reps! Powerhouse! ⚡", "Absolute legend! 👑"],
  50: ["50 REPS! 🎊🏊", "HALF CENTURY! 💪🔥", "You're a machine! 🤖"],
};

// Encouragement messages during workout
export function getEncouragement(state, reps, prevReps) {
  // Milestone crossed
  const milestones = [5, 10, 15, 20, 25, 30, 50];
  for (const m of milestones) {
    if (prevReps < m && reps >= m) {
      const msgs = MILESTONE_MESSAGES[m] || ["Milestone! 🎯"];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }
  }

  // State-based encouragement
  if (state === "ascending" || returnToStart(state, reps)) {
    const encouragements = [
      "Great rep! 💪", "Keep it up! 🔥", "Nice form! ✓",
      "You're doing great! ⭐", "Strong! 💥", "Perfect! ✅",
      "Yes! 💪", "Crushing it! 🔥", "Beautiful! ✨",
    ];
    return encouragements[Math.floor(Math.random() * encouragements.length)];
  }

  return null;
}

function returnToStart(state, reps) {
  return (state === "standing" || state === "up") && reps > 0;
}

// Form feedback variety
export function getFormFeedback(severity, issue) {
  if (severity === "good") {
    const good = [
      "Perfect form! ✓", "Beautiful! ✨", "Nailed it! 💪",
      "Textbook! 📖", "Clean! ✅", "Excellent! ⭐",
    ];
    return good[Math.floor(Math.random() * good.length)];
  }
  if (severity === "warn") {
    return issue; // Keep specific warnings
  }
  if (severity === "bad") {
    return issue; // Keep specific errors
  }
  return null;
}

// Streak message for splash
export function getStreakMessage(streak) {
  if (streak <= 0) return "Start a workout today to begin your streak!";
  // Find the highest matching threshold
  const thresholds = Object.keys(STREAK_MESSAGES).map(Number).sort((a, b) => b - a);
  for (const t of thresholds) {
    if (streak >= t) {
      const msgs = STREAK_MESSAGES[t];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }
  }
  return `🔥 ${streak} day streak!`;
}
