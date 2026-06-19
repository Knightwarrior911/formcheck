/**
 * Exercise definitions — plugin architecture.
 *
 * MediaPipe PoseLandmarker indices (33 landmarks):
 *   0=nose, 11=left_shoulder, 12=right_shoulder,
 *   13=left_elbow, 14=right_elbow, 15=left_wrist, 16=right_wrist,
 *   23=left_hip, 24=right_hip,
 *   25=left_knee, 26=right_knee,
 *   27=left_ankle, 28=right_ankle
 *
 * Note: video is mirrored (scaleX(-1)), so landmark "left" = user's right side.
 * We use the side closer to camera (left landmarks = user's right leg) for
 * single-leg-dominant exercises.
 */

export const EXERCISES = [
  {
    id: "squat",
    name: "Squat",
    joints: {
      knee: [23, 25, 27],   // hip-knee-ankle (left side = user's right leg)
      hip:  [11, 23, 25],   // shoulder-hip-knee
    },
    // Wider thresholds — knee > 140 = standing, < 100 = bottom
    states: [
      { name: "standing",   detect: (a) => a.knee > 140 },
      { name: "descending", detect: (a) => a.knee <= 140 && a.knee > 100 },
      { name: "bottom",     detect: (a) => a.knee <= 100 },
      { name: "ascending",  detect: (a) => a.knee > 100 && a.knee <= 140 },
    ],
    repTransition: { from: "ascending", to: "standing" },
    rules: [
      {
        id: "depth",
        check: (a, state) => {
          if (state === "bottom" && a.knee > 110)
            return { ok: false, msg: "Go deeper!", severity: "warn" };
          if (state === "bottom" && a.knee <= 100)
            return { ok: true, msg: "Good depth!", severity: "good" };
          return null;
        },
      },
      {
        id: "torso",
        check: (a) => {
          if (a.hip < 55)
            return { ok: false, msg: "Keep chest up!", severity: "warn" };
          return null;
        },
      },
    ],
  },

  {
    id: "pushup",
    name: "Push-up",
    joints: {
      elbow: [11, 13, 15],   // shoulder-elbow-wrist
      hip:   [11, 23, 25],   // shoulder-hip-knee
    },
    states: [
      { name: "up",        detect: (a) => a.elbow > 140 },
      { name: "descending", detect: (a) => a.elbow <= 140 && a.elbow > 80 },
      { name: "bottom",    detect: (a) => a.elbow <= 80 },
      { name: "ascending", detect: (a) => a.elbow > 80 && a.elbow <= 140 },
    ],
    repTransition: { from: "ascending", to: "up" },
    rules: [
      {
        id: "depth",
        check: (a, state) => {
          if (state === "bottom" && a.elbow > 90)
            return { ok: false, msg: "Go lower!", severity: "warn" };
          if (state === "bottom" && a.elbow <= 80)
            return { ok: true, msg: "Full ROM!", severity: "good" };
          return null;
        },
      },
      {
        id: "hip_sag",
        check: (a) => {
          if (a.hip < 150)
            return { ok: false, msg: "Hips sagging!", severity: "bad" };
          return null;
        },
      },
    ],
  },

  {
    id: "lunge",
    name: "Lunge",
    joints: {
      front_knee: [23, 25, 27],  // hip-knee-ankle
      hip:        [11, 23, 25],
    },
    states: [
      { name: "standing",   detect: (a) => a.front_knee > 140 },
      { name: "descending", detect: (a) => a.front_knee <= 140 && a.front_knee > 90 },
      { name: "bottom",     detect: (a) => a.front_knee <= 90 },
      { name: "ascending",  detect: (a) => a.front_knee > 90 && a.front_knee <= 140 },
    ],
    repTransition: { from: "ascending", to: "standing" },
    rules: [
      {
        id: "depth",
        check: (a, state) => {
          if (state === "bottom" && a.front_knee > 100)
            return { ok: false, msg: "Lower your front knee!", severity: "warn" };
          if (state === "bottom" && a.front_knee <= 90)
            return { ok: true, msg: "Good depth!", severity: "good" };
          return null;
        },
      },
    ],
  },

  {
    id: "deadlift",
    name: "Deadlift",
    joints: {
      hip:  [11, 23, 25],
      knee: [23, 25, 27],
    },
    states: [
      { name: "standing",   detect: (a) => a.hip > 140 && a.knee > 140 },
      { name: "descending", detect: (a) => a.hip <= 140 && a.hip > 80 },
      { name: "bottom",     detect: (a) => a.hip <= 80 },
      { name: "ascending",  detect: (a) => a.hip > 80 && a.hip <= 140 },
    ],
    repTransition: { from: "ascending", to: "standing" },
    rules: [
      {
        id: "back_round",
        check: (a) => {
          if (a.hip < 60)
            return { ok: false, msg: "Back rounding!", severity: "bad" };
          return null;
        },
      },
    ],
  },

  {
    id: "ohp",
    name: "Overhead Press",
    joints: {
      elbow:    [11, 13, 15],
      shoulder: [23, 11, 13],
    },
    states: [
      { name: "down",      detect: (a) => a.elbow > 130 },
      { name: "pressing",  detect: (a) => a.elbow <= 130 && a.elbow > 50 },
      { name: "lockout",   detect: (a) => a.elbow <= 50 },
    ],
    repTransition: { from: "pressing", to: "down" },
    rules: [
      {
        id: "lockout",
        check: (a, state) => {
          if (state === "lockout" && a.elbow > 60)
            return { ok: false, msg: "Lock out fully!", severity: "warn" };
          if (state === "lockout" && a.elbow <= 50)
            return { ok: true, msg: "Locked!", severity: "good" };
          return null;
        },
      },
    ],
  },
];

  {
    id: "plank",
    name: "Plank",
    joints: {
      hip:   [11, 23, 25],   // shoulder-hip-knee — should be ~180° (straight line)
      knee:  [23, 25, 27],   // hip-knee-ankle
    },
    // Plank is static hold — states are based on hold time, not movement
    states: [
      { name: "holding",    detect: (a) => a.hip > 160 && a.knee > 150 },
      { name: "hip_sag",    detect: (a) => a.hip <= 160 && a.hip > 140 },
      { name: "hip_high",   detect: (a) => a.hip > 190 },
      { name: "broken",     detect: (a) => a.hip <= 140 || a.knee < 140 },
    ],
    repTransition: null, // plank doesn't count reps — counts hold time
    rules: [
      {
        id: "hip_sag",
        check: (a) => {
          if (a.hip < 155)
            return { ok: false, msg: "Hips sagging — tighten core!", severity: "bad" };
          if (a.hip > 195)
            return { ok: false, msg: "Hips too high!", severity: "warn" };
          return { ok: true, msg: "Good plank!", severity: "good" };
        },
      },
    ],
  },

  {
    id: "bicep_curl",
    name: "Bicep Curl",
    joints: {
      elbow:    [11, 13, 15],   // shoulder-elbow-wrist
      shoulder: [23, 11, 13],   // hip-shoulder-elbow — should stay stable
    },
    states: [
      { name: "down",      detect: (a) => a.elbow > 140 },
      { name: "curling",   detect: (a) => a.elbow <= 140 && a.elbow > 50 },
      { name: "top",       detect: (a) => a.elbow <= 50 },
    ],
    repTransition: { from: "curling", to: "down" },
    rules: [
      {
        id: "full_curl",
        check: (a, state) => {
          if (state === "top" && a.elbow > 60)
            return { ok: false, msg: "Curl higher!", severity: "warn" };
          if (state === "top" && a.elbow <= 50)
            return { ok: true, msg: "Good squeeze!", severity: "good" };
          return null;
        },
      },
      {
        id: "elbow_drift",
        check: (a) => {
          // Shoulder angle should stay near 180 (arm close to body)
          if (a.shoulder < 150)
            return { ok: false, msg: "Keep elbows at sides!", severity: "warn" };
          return null;
        },
      },
    ],
  },

  {
    id: "lateral_raise",
    name: "Lateral Raise",
    joints: {
      shoulder: [23, 11, 13],   // hip-shoulder-elbow
      elbow:    [11, 13, 15],   // shoulder-elbow-wrist
    },
    states: [
      { name: "down",      detect: (a) => a.shoulder < 30 },
      { name: "raising",   detect: (a) => a.shoulder >= 30 && a.shoulder < 80 },
      { name: "top",       detect: (a) => a.shoulder >= 80 },
    ],
    repTransition: { from: "raising", to: "down" },
    rules: [
      {
        id: "full_raise",
        check: (a, state) => {
          if (state === "top" && a.shoulder < 70)
            return { ok: false, msg: "Raise higher!", severity: "warn" };
          if (state === "top" && a.shoulder >= 80)
            return { ok: true, msg: "Good height!", severity: "good" };
          return null;
        },
      },
      {
        id: "elbow_bend",
        check: (a) => {
          // Elbow should stay relatively straight (> 150°)
          if (a.elbow < 140)
            return { ok: false, msg: "Keep arms straighter!", severity: "warn" };
          return null;
        },
      },
    ],
  },

  {
    id: "situp",
    name: "Sit-up",
    joints: {
      hip:  [11, 23, 25],   // shoulder-hip-knee
      knee: [23, 25, 27],   // hip-knee-ankle
    },
    states: [
      { name: "lying",     detect: (a) => a.hip > 140 },
      { name: "curling",   detect: (a) => a.hip <= 140 && a.hip > 80 },
      { name: "top",       detect: (a) => a.hip <= 80 },
    ],
    repTransition: { from: "curling", to: "lying" },
    rules: [
      {
        id: "full_situp",
        check: (a, state) => {
          if (state === "top" && a.hip > 90)
            return { ok: false, msg: "Curl up more!", severity: "warn" };
          if (state === "top" && a.hip <= 80)
            return { ok: true, msg: "Good crunch!", severity: "good" };
          return null;
        },
      },
      {
        id: "knee_bend",
        check: (a) => {
          // Knees should stay bent (~90°) throughout
          if (a.knee > 120)
            return { ok: false, msg: "Keep knees bent!", severity: "warn" };
          return null;
        },
      },
    ],
  },

];

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

export function getExerciseList() {
  return EXERCISES.map(({ id, name }) => ({ id, name }));
}
