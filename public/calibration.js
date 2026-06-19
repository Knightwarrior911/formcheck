/**
 * Calibration system.
 * Learns per-user angle thresholds by having them do 3 reps.
 * Stores in localStorage. Used to override default exercise thresholds.
 */

const CAL_KEY = "formcheck_calibration";

function loadCal() {
  try {
    const raw = localStorage.getItem(CAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function saveCal(data) {
  localStorage.setItem(CAL_KEY, JSON.stringify(data));
}

/**
 * Record angles during a calibration rep.
 * @param {string} exerciseId
 * @param {object} angles — { knee: 165, hip: 170, ... }
 * @param {string} phase — "top" | "bottom" | "mid"
 */
export function recordCalAngle(exerciseId, angles, phase) {
  const cal = loadCal();
  if (!cal[exerciseId]) {
    cal[exerciseId] = { top: {}, bottom: {}, mid: {}, reps: 0, calibrated: false };
  }
  const exCal = cal[exerciseId];

  // Record min/max for each angle
  for (const [name, val] of Object.entries(angles)) {
    if (val == null) continue;
    if (!exCal[phase][name]) {
      exCal[phase][name] = { min: val, max: val, values: [val] };
    } else {
      const range = exCal[phase][name];
      range.values.push(val);
      range.min = Math.min(range.min, val);
      range.max = Math.max(range.max, val);
    }
  }

  if (phase === "bottom") {
    exCal.reps++;
  }

  saveCal(cal);
}

/**
 * Check if calibration is complete (3+ reps recorded).
 */
export function isCalibrated(exerciseId) {
  const cal = loadCal();
  const exCal = cal[exerciseId];
  return exCal && exCal.calibrated && exCal.reps >= 3;
}

/**
 * Get calibrated thresholds for an exercise.
 * Returns null if not calibrated.
 */
export function getCalibratedThresholds(exerciseId) {
  const cal = loadCal();
  const exCal = cal[exerciseId];
  if (!exCal || !exCal.calibrated || exCal.reps < 3) return null;

  const thresholds = {};
  for (const [name, topData] of Object.entries(exCal.top)) {
    const bottomData = exCal.bottom[name];
    if (!bottomData) continue;

    // Use averages with some margin
    const topAvg = topData.values.reduce((a, b) => a + b, 0) / topData.values.length;
    const bottomAvg = bottomData.values.reduce((a, b) => a + b, 0) / bottomData.values.length;

    thresholds[name] = {
      standing: Math.round(topAvg - 10), // slightly below top
      bottom: Math.round(bottomAvg + 10), // slightly above bottom
      range: Math.round(topAvg - bottomAvg),
    };
  }
  return thresholds;
}

/**
 * Finalize calibration — mark as complete.
 */
export function finalizeCalibration(exerciseId) {
  const cal = loadCal();
  if (cal[exerciseId] && cal[exerciseId].reps >= 3) {
    cal[exerciseId].calibrated = true;
    saveCal(cal);
    return true;
  }
  return false;
}

/**
 * Clear calibration for an exercise (or all).
 */
export function clearCalibration(exerciseId) {
  const cal = loadCal();
  if (exerciseId) {
    delete cal[exerciseId];
  } else {
    // Clear all
    for (const key of Object.keys(cal)) delete cal[key];
  }
  saveCal(cal);
}

/**
 * Get calibration status for all exercises.
 */
export function getCalibrationStatus() {
  const cal = loadCal();
  return Object.entries(cal).map(([id, data]) => ({
    exerciseId: id,
    reps: data.reps || 0,
    calibrated: data.calibrated || false,
  }));
}
