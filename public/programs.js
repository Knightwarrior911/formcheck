/**
 * Workout programs / routines.
 * Pre-built + custom routines with multiple exercises, sets, rest periods.
 */

export const PROGRAMS = [
  {
    id: "full_body",
    name: "Full Body",
    description: "Hit every major muscle group",
    exercises: [
      { exerciseId: "squat", targetReps: 12, restSeconds: 60 },
      { exerciseId: "pushup", targetReps: 10, restSeconds: 60 },
      { exerciseId: "deadlift", targetReps: 10, restSeconds: 90 },
      { exerciseId: "ohp", targetReps: 10, restSeconds: 60 },
      { exerciseId: "plank", targetReps: 60, restSeconds: 60 }, // 60s hold
    ],
  },
  {
    id: "upper_body",
    name: "Upper Body",
    description: "Chest, shoulders, arms, core",
    exercises: [
      { exerciseId: "pushup", targetReps: 12, restSeconds: 60 },
      { exerciseId: "ohp", targetReps: 10, restSeconds: 60 },
      { exerciseId: "bicep_curl", targetReps: 12, restSeconds: 45 },
      { exerciseId: "lateral_raise", targetReps: 12, restSeconds: 45 },
      { exerciseId: "plank", targetReps: 45, restSeconds: 60 },
    ],
  },
  {
    id: "lower_body",
    name: "Lower Body",
    description: "Legs and glutes",
    exercises: [
      { exerciseId: "squat", targetReps: 15, restSeconds: 60 },
      { exerciseId: "lunge", targetReps: 12, restSeconds: 60 },
      { exerciseId: "deadlift", targetReps: 10, restSeconds: 90 },
      { exerciseId: "squat", targetReps: 12, restSeconds: 60 },
    ],
  },
  {
    id: "core",
    name: "Core Blast",
    description: "Abs and stability",
    exercises: [
      { exerciseId: "plank", targetReps: 60, restSeconds: 30 },
      { exerciseId: "situp", targetReps: 20, restSeconds: 30 },
      { exerciseId: "plank", targetReps: 45, restSeconds: 30 },
      { exerciseId: "situp", targetReps: 15, restSeconds: 30 },
    ],
  },
  {
    id: "hiit",
    name: "HIIT Quick",
    description: "High intensity, 15 minutes",
    exercises: [
      { exerciseId: "squat", targetReps: 15, restSeconds: 30 },
      { exerciseId: "pushup", targetReps: 10, restSeconds: 30 },
      { exerciseId: "lunge", targetReps: 10, restSeconds: 30 },
      { exerciseId: "situp", targetReps: 20, restSeconds: 30 },
      { exerciseId: "plank", targetReps: 30, restSeconds: 30 },
    ],
  },
];

export function getProgram(id) {
  return PROGRAMS.find((p) => p.id === id) || null;
}

export function getProgramList() {
  return PROGRAMS.map(({ id, name, description }) => ({ id, name, description }));
}
