/**
 * Exercise tutorial content.
 * Form tips, common mistakes, and setup instructions per exercise.
 */

export const EXERCISE_TUTORIALS = {
  squat: {
    name: "Squat",
    setup: [
      "Stand with feet shoulder-width apart",
      "Toes pointed slightly outward (15-30°)",
      "Keep chest up and core engaged",
      "Arms extended forward or at your sides",
    ],
    tips: [
      "Push hips back as if sitting in a chair",
      "Keep knees tracking over toes",
      "Go until thighs are parallel to floor (or lower)",
      "Drive through heels to stand up",
      "Keep your back straight — no rounding",
    ],
    mistakes: [
      "Knees caving inward — push them out",
      "Heels lifting — keep weight on whole foot",
      "Leaning too far forward — chest up",
      "Not going deep enough — aim for parallel",
    ],
    muscles: ["Quadriceps", "Glutes", "Hamstrings", "Core"],
  },
  pushup: {
    name: "Push-up",
    setup: [
      "Hands slightly wider than shoulders",
      "Body in a straight line from head to heels",
      "Fingers spread, middle fingers pointing forward",
      "Feet together or hip-width apart",
    ],
    tips: [
      "Lower chest to the floor (not belly)",
      "Keep elbows at 45° angle to body",
      "Squeeze glutes and brace core throughout",
      "Full lockout at the top",
      "Breathe in on the way down, out on the way up",
    ],
    mistakes: [
      "Hips sagging — tighten your core",
      "Flaring elbows out — keep them at 45°",
      "Partial reps — go all the way down",
      "Head dropping — look slightly ahead, not down",
    ],
    muscles: ["Chest", "Triceps", "Shoulders", "Core"],
  },
  lunge: {
    name: "Lunge",
    setup: [
      "Stand tall with feet hip-width apart",
      "Step forward about 2-3 feet",
      "Keep torso upright throughout",
    ],
    tips: [
      "Lower back knee toward the floor",
      "Front knee should be over ankle, not past toes",
      "Push through front heel to return to start",
      "Keep core engaged for balance",
    ],
    mistakes: [
      "Front knee going past toes — step further forward",
      "Leaning torso forward — stay upright",
      "Narrow stance — keep feet hip-width apart",
      "Back knee slamming — control the descent",
    ],
    muscles: ["Quadriceps", "Glutes", "Hamstrings", "Calves"],
  },
  deadlift: {
    name: "Deadlift",
    setup: [
      "Feet hip-width apart, toes under the bar (or imaginary bar)",
      "Grip just outside your knees",
      "Hips higher than knees, lower than shoulders",
      "Back flat, chest up, shoulders over the bar",
    ],
    tips: [
      "Push the floor away with your feet",
      "Keep the bar close to your body",
      "Hips and shoulders rise together",
      "Squeeze glutes at the top",
      "Lower by hinging at hips first, then knees",
    ],
    mistakes: [
      "Rounding your back — keep it flat",
      "Hips rising before shoulders — move together",
      "Bar drifting away from body — keep it close",
      "Hyperextending at the top — stand tall, don't lean back",
    ],
    muscles: ["Hamstrings", "Glutes", "Lower Back", "Traps"],
  },
  ohp: {
    name: "Overhead Press",
    setup: [
      "Stand with feet shoulder-width apart",
      "Hold weight at shoulder height",
      "Elbows slightly in front of the bar",
      "Core tight, glutes squeezed",
    ],
    tips: [
      "Press straight up, not forward",
      "Lock out fully at the top",
      "Keep elbows under the bar during the press",
      "Don't arch your lower back excessively",
    ],
    mistakes: [
      "Elbows flaring out — keep them slightly forward",
      "Pressing in an arc — go straight up",
      "Using momentum — control the weight",
      "Incomplete lockout — fully extend arms",
    ],
    muscles: ["Shoulders", "Triceps", "Upper Chest", "Core"],
  },
  plank: {
    name: "Plank",
    setup: [
      "Forearms on the ground, elbows under shoulders",
      "Body in a straight line from head to heels",
      "Feet hip-width apart",
      "Look at the floor, neck neutral",
    ],
    tips: [
      "Squeeze glutes and brace core",
      "Don't hold your breath — breathe steadily",
      "Keep hips level — no sagging or piking",
      "Start with 20-30 second holds and build up",
    ],
    mistakes: [
      "Hips sagging — engage core harder",
      "Hips too high — lower to straight line",
      "Holding breath — breathe normally",
      "Looking up — keep neck neutral",
    ],
    muscles: ["Core", "Shoulders", "Glutes", "Back"],
  },
  bicep_curl: {
    name: "Bicep Curl",
    setup: [
      "Stand with feet shoulder-width apart",
      "Hold weights at your sides, palms facing forward",
      "Elbows pinned to your ribs",
      "Stand tall, shoulders back",
    ],
    tips: [
      "Curl up by bending at the elbow only",
      "Squeeze bicep at the top",
      "Lower slowly — don't drop the weight",
      "Keep elbows stationary throughout",
    ],
    mistakes: [
      "Swinging the weight — use controlled motion",
      "Elbows drifting forward — keep them at sides",
      "Using momentum — slow and controlled",
      "Incomplete range — full curl up and down",
    ],
    muscles: ["Biceps", "Forearms", "Anterior Deltoid"],
  },
  lateral_raise: {
    name: "Lateral Raise",
    setup: [
      "Stand with feet shoulder-width apart",
      "Hold weights at your sides, palms facing in",
      "Slight bend in elbows throughout",
      "Stand tall, core engaged",
    ],
    tips: [
      "Raise arms out to the sides until parallel to floor",
      "Lead with elbows, not hands",
      "Control the descent — don't drop",
      "Stop at shoulder height — don't go higher",
    ],
    mistakes: [
      "Using too much weight — go lighter",
      "Shrugging shoulders — keep them down",
      "Swinging — controlled movement",
      "Raising too high — stop at shoulder level",
    ],
    muscles: ["Lateral Deltoid", "Traps", "Rotator Cuff"],
  },
  situp: {
    name: "Sit-up",
    setup: [
      "Lie on your back, knees bent at 90°",
      "Feet flat on the floor, hip-width apart",
      "Hands across chest or behind head",
      "Anchor feet under something if needed",
    ],
    tips: [
      "Curl up by contracting abs, not neck",
      "Exhale as you curl up",
      "Touch elbows to thighs at the top",
      "Lower slowly — don't flop down",
    ],
    mistakes: [
      "Pulling on neck — hands support, don't pull",
      "Using hip flexors — focus on curling torso",
      "Full sit-up not needed — curl until shoulders clear floor",
      "Momentum — slow and controlled",
    ],
    muscles: ["Rectus Abdominis", "Hip Flexors", "Obliques"],
  },

  jumping_jack: {
    name: "Jumping Jack",
    setup: [
      "Stand with feet together, arms at your sides",
      "Keep core engaged throughout",
      "Stay on the balls of your feet",
    ],
    tips: [
      "Jump feet apart while raising arms overhead",
      "Land softly on the balls of your feet",
      "Keep arms straight during the movement",
      "Maintain a steady rhythm",
    ],
    mistakes: [
      "Not raising arms fully overhead",
      "Landing with stiff legs — stay soft",
      "Holding breath — breathe steadily",
    ],
    muscles: ["Shoulders", "Calves", "Core", "Hip Flexors"],
  },

  high_knees: {
    name: "High Knees",
    setup: [
      "Stand tall with feet hip-width apart",
      "Arms at elbows 90°, hands at waist height",
      "Look ahead, not down",
    ],
    tips: [
      "Drive knees up to hip height",
      "Pump arms in opposition to legs",
      "Stay on the balls of your feet",
      "Keep core tight and chest up",
    ],
    mistakes: [
      "Knees not reaching hip height",
      "Leaning back — stay upright",
      "Flat-footed landing — stay on toes",
    ],
    muscles: ["Hip Flexors", "Quadriceps", "Calves", "Core"],
  },

  wall_sit: {
    name: "Wall Sit",
    setup: [
      "Stand with back against a wall",
      "Slide down until thighs are parallel to floor",
      "Knees at 90° angle, directly over ankles",
      "Feet flat, hip-width apart",
    ],
    tips: [
      "Keep back flat against the wall",
      "Breathe steadily — don't hold your breath",
      "Start with 20-30 seconds and build up",
      "Keep weight in your heels",
    ],
    mistakes: [
      "Knees going past toes — slide up",
      "Thighs not parallel — slide down",
      "Leaning forward — back stays on wall",
    ],
    muscles: ["Quadriceps", "Glutes", "Calves", "Core"],
  },

  superman: {
    name: "Superman",
    setup: [
      "Lie face down on the floor",
      "Arms extended forward, legs straight",
      "Forehead resting on the floor to start",
    ],
    tips: [
      "Lift chest and legs simultaneously",
      "Squeeze glutes and lower back",
      "Keep neck neutral — look at the floor",
      "Hold at the top, then lower with control",
    ],
    mistakes: [
      "Lifting too high — small controlled lift",
      "Holding breath — breathe steadily",
      "Jerking up — smooth controlled movement",
    ],
    muscles: ["Lower Back", "Glutes", "Hamstrings", "Shoulders"],
  },

};

export function getTutorial(exerciseId) {
  return EXERCISE_TUTORIALS[exerciseId] || null;
}

export function getAllTutorials() {
  return Object.entries(EXERCISE_TUTORIALS).map(([id, t]) => ({
    id,
    name: t.name,
    muscles: t.muscles,
  }));
}
