/**
 * Custom program builder.
 * Users can create, edit, and delete their own workout routines.
 * Stored in localStorage under 'formcheck_custom_programs'.
 */

const CUSTOM_PROGRAMS_KEY = "formcheck_custom_programs";

function loadCustomPrograms() {
  try {
    const raw = localStorage.getItem(CUSTOM_PROGRAMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveCustomPrograms(programs) {
  localStorage.setItem(CUSTOM_PROGRAMS_KEY, JSON.stringify(programs));
}

export function getCustomPrograms() {
  return loadCustomPrograms();
}

export function getCustomProgram(id) {
  return loadCustomPrograms().find((p) => p.id === id) || null;
}

export function saveCustomProgram(program) {
  const programs = loadCustomPrograms();
  const idx = programs.findIndex((p) => p.id === program.id);
  if (idx >= 0) {
    programs[idx] = program;
  } else {
    programs.push(program);
  }
  saveCustomPrograms(programs);
}

export function deleteCustomProgram(id) {
  const programs = loadCustomPrograms().filter((p) => p.id !== id);
  saveCustomPrograms(programs);
}

export function createNewProgram(name, description) {
  return {
    id: "custom_" + Date.now().toString(36),
    name: name || "My Routine",
    description: description || "",
    isCustom: true,
    exercises: [],
    createdAt: Date.now(),
  };
}
