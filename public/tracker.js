/**
 * Workout session tracker.
 * localStorage-based persistence. Tracks sessions, reps, form scores, streaks.
 */

const STORAGE_KEY = "formcheck_data";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.error("[Tracker] load error:", e); }
  return { sessions: [], profile: {}, settings: {} };
}

function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { console.error("[Tracker] save error:", e); }
}

export class WorkoutTracker {
  constructor() {
    this.data = loadData();
    this._currentSession = null;
  }

  // ---- Profile ----
  getProfile() {
    return this.data.profile || { name: "", level: "beginner", goals: "" };
  }

  setProfile(profile) {
    this.data.profile = { ...this.getProfile(), ...profile };
    saveData(this.data);
  }

  // ---- Settings ----
  getSettings() {
    return this.data.settings || {
      audioEnabled: true,
      restTimerSeconds: 60,
      repSensitivity: "normal", // low, normal, high
      showSkeleton: true,
      showAngles: true,
    };
  }

  setSettings(settings) {
    this.data.settings = { ...this.getSettings(), ...settings };
    saveData(this.data);
  }

  // ---- Recent exercises ----
  getRecentExercises(limit = 5) {
    const sessions = this.data.sessions || [];
    const recent = [];
    const seen = new Set();
    for (let i = sessions.length - 1; i >= 0 && recent.length < limit; i--) {
      const exId = sessions[i].exerciseId;
      if (!seen.has(exId)) {
        seen.add(exId);
        recent.push(exId);
      }
    }
    return recent;
  }

  getLastExercise() {
    const recent = this.getRecentExercises(1);
    return recent[0] || "squat";
  }

  // ---- Session management ----
  startSession(exerciseId) {
    this._currentSession = {
      id: Date.now().toString(36),
      exerciseId,
      startTime: Date.now(),
      endTime: null,
      reps: 0,
      formScores: [],
      duration: 0,
      weight: null,
      weightUnit: "kg",
      exercises: [{ exerciseId, reps: 0, formScores: [], weight: null, weightUnit: "kg" }],
      currentExerciseIndex: 0,
    };
    return this._currentSession;
  }

  setWeight(val, unit) {
    if (!this._currentSession) return;
    this._currentSession.weight = val;
    this._currentSession.weightUnit = unit || "kg";
    // Also set on current exercise
    const idx = this._currentSession.currentExerciseIndex;
    if (this._currentSession.exercises[idx]) {
      this._currentSession.exercises[idx].weight = val;
      this._currentSession.exercises[idx].weightUnit = unit || "kg";
    }
  }

  switchExercise(exerciseId) {
    if (!this._currentSession) return;
    // Finalize current exercise's form score
    const scores = this._currentSession.formScores;
    const goodCount = scores.filter((s) => s.ok).length;
    const formScore = scores.length > 0 ? Math.round((goodCount / scores.length) * 100) : 0;

    // Save form score to the exercise we're leaving
    const prevIdx = this._currentSession.currentExerciseIndex;
    if (this._currentSession.exercises[prevIdx]) {
      this._currentSession.exercises[prevIdx].formScore = formScore;
    }

    // Add new exercise to the list
    this._currentSession.exercises.push({
      exerciseId,
      reps: 0,
      formScores: [],
    });
    this._currentSession.currentExerciseIndex = this._currentSession.exercises.length - 1;
    this._currentSession.exerciseId = exerciseId;
    this._currentSession.formScores = [];
  }

  recordRep(severity) {
    if (!this._currentSession) return;
    this._currentSession.reps++;
    this._currentSession.formScores.push({
      ok: severity === "good",
      severity,
      timestamp: Date.now(),
    });
    // Also track per-exercise
    const idx = this._currentSession.currentExerciseIndex;
    if (this._currentSession.exercises[idx]) {
      this._currentSession.exercises[idx].reps++;
      this._currentSession.exercises[idx].formScores.push({
        ok: severity === "good",
        severity,
        timestamp: Date.now(),
      });
    }
  }

  endSession() {
    if (!this._currentSession) return null;
    this._currentSession.endTime = Date.now();
    this._currentSession.duration =
      this._currentSession.endTime - this._currentSession.startTime;

    // Calculate overall form score
    const scores = this._currentSession.formScores;
    const goodCount = scores.filter((s) => s.ok).length;
    this._currentSession.formScore =
      scores.length > 0 ? Math.round((goodCount / scores.length) * 100) : 0;

    // Calculate per-exercise form scores
    this._currentSession.exercises.forEach((ex) => {
      const exScores = ex.formScores || [];
      const exGood = exScores.filter((s) => s.ok).length;
      ex.formScore = exScores.length > 0 ? Math.round((exGood / exScores.length) * 100) : 0;
    });

    // Save
    this.data.sessions.push({ ...this._currentSession });
    saveData(this.data);

    const session = { ...this._currentSession };
    this._currentSession = null;
    return session;
  }

  getCurrentSession() {
    return this._currentSession;
  }

  // ---- History ----
  getSessions(limit = 50) {
    return (this.data.sessions || [])
      .slice(-limit)
      .reverse()
      .map((s) => ({
        ...s,
        date: new Date(s.startTime).toLocaleDateString(),
        time: new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        durationMin: Math.round(s.duration / 60000 * 10) / 10,
      }));
  }

  getSessionsByExercise(exerciseId) {
    return this.getSessions().filter((s) => s.exerciseId === exerciseId);
  }

  // ---- Stats ----
  getTotalReps() {
    return (this.data.sessions || []).reduce((sum, s) => sum + (s.reps || 0), 0);
  }

  getTotalSessions() {
    return (this.data.sessions || []).length;
  }

  getTotalDurationMin() {
    return Math.round(
      (this.data.sessions || []).reduce((sum, s) => sum + (s.duration || 0), 0) / 60000
    );
  }

  getAverageFormScore() {
    const sessions = (this.data.sessions || []).filter((s) => s.formScore != null);
    if (sessions.length === 0) return 0;
    return Math.round(
      sessions.reduce((sum, s) => sum + s.formScore, 0) / sessions.length
    );
  }

  getPersonalBest(exerciseId) {
    const sessions = (this.data.sessions || []).filter(
      (s) => s.exerciseId === exerciseId
    );
    if (sessions.length === 0) return 0;
    return Math.max(...sessions.map((s) => s.reps || 0));
  }

  // ---- Streak ----
  getStreak() {
    const sessions = this.data.sessions || [];
    if (sessions.length === 0) return 0;

    // Get unique dates (YYYY-MM-DD)
    const dates = [
      ...new Set(
        sessions.map((s) => new Date(s.startTime).toISOString().slice(0, 10))
      ),
    ].sort().reverse();

    if (dates.length === 0) return 0;

    // Check if most recent session is today or yesterday
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dates[0] !== today && dates[0] !== yesterday) return 0;

    // Count consecutive days
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (prev - curr) / 86400000;
      if (diff === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // ---- Calories estimate (rough) ----
  estimateCalories(exerciseId, reps) {
    // Very rough estimates per rep
    const calPerRep = {
      squat: 0.5,
      pushup: 0.3,
      lunge: 0.4,
      deadlift: 0.6,
      ohp: 0.3,
      plank: 0.1, // per second of hold
      bicep_curl: 0.2,
      lateral_raise: 0.2,
      situp: 0.3,
    };
    return Math.round((calPerRep[exerciseId] || 0.3) * reps);
  }

  // ---- Progressive overload ----
  getProgressForExercise(exerciseId) {
    const sessions = (this.data.sessions || [])
      .filter((s) => s.exerciseId === exerciseId)
      .slice(-10); // last 10 sessions

    if (sessions.length === 0) return null;

    const reps = sessions.map((s) => s.reps || 0);
    const formScores = sessions.map((s) => s.formScore || 0);
    const lastReps = reps[reps.length - 1];
    const avgReps = Math.round(reps.reduce((a, b) => a + b, 0) / reps.length);
    const avgForm = Math.round(formScores.reduce((a, b) => a + b, 0) / formScores.length);
    const bestReps = Math.max(...reps);

    // Trend: are reps increasing?
    let trend = "flat";
    if (reps.length >= 3) {
      const recent = reps.slice(-3);
      if (recent[2] > recent[0]) trend = "up";
      else if (recent[2] < recent[0]) trend = "down";
    }

    // Suggestion
    let suggestion = null;
    if (avgForm >= 80 && lastReps >= avgReps) {
      suggestion = {
        type: "increase_reps",
        message: `Great form! Try ${lastReps + 2} reps next time.`,
        current: lastReps,
        target: lastReps + 2,
      };
    } else if (avgForm < 60) {
      suggestion = {
        type: "focus_form",
        message: "Focus on form quality over reps. Try fewer reps with better technique.",
        current: lastReps,
        target: Math.max(5, lastReps - 3),
      };
    } else if (lastReps < avgReps) {
      suggestion = {
        type: "maintain",
        message: `You're doing well. Aim for ${avgReps} reps to maintain.`,
        current: lastReps,
        target: avgReps,
      };
    }

    return {
      sessions: sessions.length,
      lastReps,
      avgReps,
      bestReps,
      avgForm,
      trend,
      suggestion,
    };
  }

  // ---- Clear all data ----
  clearAll() {
    this.data = { sessions: [], profile: {}, settings: {} };
    saveData(this.data);
  }

  // ---- Export data ----
  exportData() {
    return JSON.stringify(this.data, null, 2);
  }

  // ---- Import data ----
  importData(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.sessions || !Array.isArray(parsed.sessions)) return false;
      // Validate each session has required fields
      const validSessions = parsed.sessions.filter((s) => {
        return s && typeof s === "object" && s.exerciseId && s.startTime;
      });
      if (validSessions.length === 0) return false;
      this.data = { sessions: validSessions, profile: parsed.profile || {}, settings: parsed.settings || {} };
      saveData(this.data);
      return true;
    } catch (e) { console.error("[Tracker] import error:", e); }
    return false;
  }
}
