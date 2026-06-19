/**
 * FormCheck — main app.
 * Views: splash → camera → history / settings / summary.
 * Camera: MediaPipe PoseLandmarker → PoseEngine → skeleton + rep counter + form feedback.
 */

import { PoseEngine } from "./pose.js";
import { WorkoutTracker } from "./tracker.js";
import { getExerciseList, EXERCISES } from "./exercises.js";
import { getTutorial, getAllTutorials } from "./tutorial.js";
import { getProgram, getProgramList } from "./programs.js";
import { getCustomPrograms, saveCustomProgram, deleteCustomProgram, createNewProgram } from "./custom-programs.js";
import { recordCalAngle, isCalibrated, finalizeCalibration, clearCalibration, getCalibrationStatus } from "./calibration.js";
import { say, sayRep, sayFeedback } from "./audio.js";
import { getEncouragement, getFormFeedback, getStreakMessage } from "./messages.js";
import { playRepSound, playMilestoneSound, playErrorSound, playSuccessSound, playWorkoutCompleteSound, playCountdownBeep } from "./sounds.js";

// ---- MediaPipe ----
import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35";

const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const POSE_MODEL_LITE_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

// ---- Tracker ----
const tracker = new WorkoutTracker();

// ---- DOM: Views ----
const splashView = document.getElementById("splashView");
const cameraView = document.getElementById("cameraView");
const historyView = document.getElementById("historyView");
const settingsView = document.getElementById("settingsView");
const summaryView = document.getElementById("summaryView");

// ---- DOM: Splash ----
const onboardingStep1 = document.getElementById("onboardingStep1");
const returningUser = document.getElementById("returningUser");
const userNameInput = document.getElementById("userName");
const welcomeName = document.getElementById("welcomeName");
const splashStreak = document.getElementById("splashStreak");
const startBtn = document.getElementById("startBtn");
const onboardingNext = document.getElementById("onboardingNext");
const splashNote = document.getElementById("splashNote");

// ---- DOM: Camera ----
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const octx = overlay.getContext("2d");
const exercisePicker = document.getElementById("exercisePicker");
const repCount = document.getElementById("repCount");
const repDisplay = document.getElementById("repDisplay");
const weightDisplay = document.getElementById("weightDisplay");
const weightInput = document.getElementById("weightInput");
const weightUnit = document.getElementById("weightUnit");
const statusBadge = document.getElementById("statusBadge");
const feedbackText = document.getElementById("feedbackText");
const feedbackDetail = document.getElementById("feedbackDetail");
const feedbackPanel = document.getElementById("feedbackPanel");
const debugState = document.getElementById("debugState");
const debugAngles = document.getElementById("debugAngles");
const holdTimer = document.getElementById("holdTimer");
const holdTime = document.getElementById("holdTime");
const holdTarget = document.getElementById("holdTarget");
const holdProgressBar = document.getElementById("holdProgressBar");
const repLabel = document.getElementById("repLabel");
const toast = document.getElementById("toast");

// ---- DOM: History ----
const sessionList = document.getElementById("sessionList");

// ---- DOM: Settings ----
const settingsName = document.getElementById("settingsName");
const settingAudio = document.getElementById("settingAudio");
const settingSkeleton = document.getElementById("settingSkeleton");
const settingAngles = document.getElementById("settingAngles");
const settingRestTimer = document.getElementById("settingRestTimer");
const settingDarkMode = document.getElementById("settingDarkMode");

// ---- State ----
let poseLandmarker = null;
let engine = new PoseEngine();
let running = false;
let lastVideoTime = -1;
const INF_W = 480;
const infCanvas = document.createElement("canvas");
const ictx = infCanvas.getContext("2d");

// Hold timer state
let holdStartTime = 0;
let holdGoodFrames = 0; // consecutive frames in good hold position
let lastHoldSecond = 0; // for audio cues
let isHoldExercise = false;

// Calibration state
let isCalibrating = false;
let calPhase = "waiting"; // waiting | top | bottom | done
let calRepCount = 0;
let calAngles = {};

// Performance: cache settings, throttle debug updates
let _cachedSettings = null;
let _settingsCacheTime = 0;
let _debugFrameCount = 0;

function getCachedSettings() {
  const now = Date.now();
  if (!_cachedSettings || now - _settingsCacheTime > 5000) {
    _cachedSettings = tracker.getSettings();
    _settingsCacheTime = now;
  }
  return _cachedSettings;
}

// ==================== VIEW MANAGEMENT ====================
function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(viewId).classList.remove("hidden");
}

// ==================== SPLASH / ONBOARDING ====================
function initSplash() {
  const profile = tracker.getProfile();
  if (profile.name) {
    // Returning user
    onboardingStep1.classList.add("hidden");
    returningUser.classList.remove("hidden");
    welcomeName.textContent = profile.name;
    const streak = tracker.getStreak();
    if (streak > 0) {
      splashStreak.textContent = getStreakMessage(streak);
    } else {
      splashStreak.textContent = getStreakMessage(0);
    }
    buildProgramPicker();
    buildQuickStart();
    showProgressPreview();
    showTodaySummary();
  } else {
    // New user
    onboardingStep1.classList.remove("hidden");
    returningUser.classList.add("hidden");
  }
}

initSplash();

// Level picker on splash
document.querySelectorAll("#onboardingStep1 .level-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#onboardingStep1 .level-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

onboardingNext.addEventListener("click", () => {
  const name = userNameInput.value.trim() || "Athlete";
  const levelBtn = document.querySelector("#onboardingStep1 .level-btn.active");
  userLevel = levelBtn ? levelBtn.dataset.level : "intermediate";
  tracker.setProfile({ name, level: userLevel });
  document.getElementById("onboardingStep1").classList.add("hidden");
  document.getElementById("onboardingStep2").classList.remove("hidden");
  const recName = document.getElementById("recProgramName");
  const recDesc = document.getElementById("recProgramDesc");
  if (userLevel === "beginner") {
    recName.textContent = "Core Blast";
    recDesc.textContent = "3 exercises · ~10 minutes · Low intensity";
    currentProgram = getProgram("core");
  } else if (userLevel === "advanced") {
    recName.textContent = "HIIT Quick";
    recDesc.textContent = "5 exercises · ~15 minutes · High intensity";
    currentProgram = getProgram("hiit");
  } else {
    recName.textContent = "Full Body";
    recDesc.textContent = "5 exercises · ~15 minutes";
    currentProgram = getProgram("full_body");
  }
  currentProgramIndex = 0;
});

document.getElementById("onboardingStart").addEventListener("click", () => {
  document.getElementById("onboardingStep2").classList.add("hidden");
  returningUser.classList.remove("hidden");
  onboardingStep1.classList.add("hidden");
  buildProgramPicker();
  buildQuickStart();
  showProgressPreview();
});

// ==================== EXERCISE PICKER ====================
let activeCategory = "all";

function selectExercise(exId) {
  document.querySelectorAll(".exercise-btn").forEach((b) => b.classList.remove("active"));
  const btn = document.querySelector(`.exercise-btn[data-exercise="${exId}"]`);
  if (btn) btn.classList.add("active");
  engine.setExercise(exId);
  repCount.textContent = "0";
  const exData = EXERCISES.find((e) => e.id === exId);
  showToast(`Exercise: ${exData ? exData.name : exId}`);

  if (tracker.getCurrentSession()) tracker.switchExercise(exId);

  isHoldExercise = exData && exData.type === "hold";
  if (isHoldExercise) {
    repDisplay.classList.add("hidden");
    holdTimer.classList.remove("hidden");
    weightDisplay.classList.add("hidden");
    holdTarget.textContent = (exData.holdTargetSeconds || 60) + "s";
    holdStartTime = 0; holdGoodFrames = 0; lastHoldSecond = 0;
    repLabel.textContent = "hold";
  } else {
    repDisplay.classList.remove("hidden");
    holdTimer.classList.add("hidden");
    weightDisplay.classList.remove("hidden");
    repLabel.textContent = "reps";
    holdStartTime = 0; holdGoodFrames = 0; lastHoldSecond = 0;
  }
}

function buildExercisePicker() {
  const categories = [
    { id: "all", name: "All", icon: "🏋️" },
    { id: "legs", name: "Legs", icon: "🦵" },
    { id: "push", name: "Push", icon: "💪" },
    { id: "pull", name: "Pull", icon: "🏋️" },
    { id: "core", name: "Core", icon: "🎯" },
    { id: "cardio", name: "Cardio", icon: "❤️" },
  ];
  exercisePicker.innerHTML = "";

  // Category filter tabs
  const tabsEl = document.createElement("div");
  tabsEl.className = "exercise-tabs";
  categories.forEach((cat) => {
    const tab = document.createElement("button");
    tab.className = "exercise-tab" + (activeCategory === cat.id ? " active" : "");
    tab.dataset.cat = cat.id;
    tab.textContent = cat.icon + " " + cat.name;
    tab.addEventListener("click", () => {
      activeCategory = cat.id;
      document.querySelectorAll(".exercise-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderExerciseList();
    });
    tabsEl.appendChild(tab);
  });
  exercisePicker.appendChild(tabsEl);

  // Exercise list container
  const listEl = document.createElement("div");
  listEl.className = "exercise-list";
  listEl.id = "exerciseList";
  exercisePicker.appendChild(listEl);

  renderExerciseList();
}

function renderExerciseList() {
  const listEl = document.getElementById("exerciseList");
  if (!listEl) return;
  const filtered = activeCategory === "all"
    ? EXERCISES
    : EXERCISES.filter((e) => e.category === activeCategory);

  listEl.innerHTML = "";
  filtered.forEach((ex) => {
    const btn = document.createElement("button");
    btn.className = "exercise-btn" + (ex.id === engine.exerciseId ? " active" : "");
    btn.dataset.exercise = ex.id;
    const typeIcon = ex.type === "hold" ? "⏱" : "🔄";
    btn.textContent = typeIcon + " " + ex.name;
    btn.addEventListener("click", () => selectExercise(ex.id));
    listEl.appendChild(btn);
  });
}

buildExercisePicker();

// ==================== WORKOUT PROGRAMS ====================
let currentProgram = null;
let currentProgramIndex = 0;
let restInterval = null;
let userLevel = "intermediate";

function buildProgramPicker() {
  const picker = document.getElementById("programPicker");
  const programs = getProgramList();
  picker.innerHTML = "";
  programs.forEach((p) => {
    const div = document.createElement("div");
    div.className = "program-option";
    div.dataset.program = p.id;
    div.innerHTML = `
      <div class="program-option-name">${p.name}</div>
      <div class="program-option-desc">${p.description}</div>
    `;
    div.addEventListener("click", () => {
      document
        .querySelectorAll(".program-option")
        .forEach((d) => d.classList.remove("active"));
      div.classList.add("active");
      currentProgram = getProgram(p.id);
      currentProgramIndex = 0;
    });
    picker.appendChild(div);
  });
  // Select first by default
  if (programs.length > 0) {
    currentProgram = getProgram(programs[0].id);
    currentProgramIndex = 0;
    picker.querySelector(".program-option").classList.add("active");
  }
}

function buildQuickStart() {
  const container = document.getElementById("recentExercises");
  const recent = tracker.getRecentExercises(5);
  const allExercises = getExerciseList();

  if (recent.length === 0) {
    // No history — show popular exercises
    container.innerHTML = allExercises
      .slice(0, 4)
      .map(
        (ex) =>
          `<button class="recent-exercise-btn" data-exercise="${ex.id}">${ex.name}</button>`
      )
      .join("");
  } else {
    container.innerHTML = recent
      .map((exId) => {
        const ex = allExercises.find((e) => e.id === exId);
        return `<button class="recent-exercise-btn" data-exercise="${exId}">${ex ? ex.name : exId}</button>`;
      })
      .join("");
  }

  // Click to select
  container.querySelectorAll(".recent-exercise-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container
        .querySelectorAll(".recent-exercise-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentProgram = null; // No program — single exercise
      engine.setExercise(btn.dataset.exercise);
      repCount.textContent = "0";
    });
  });
}

function showProgressPreview() {
  const lastExId = tracker.getLastExercise();
  const progress = tracker.getProgressForExercise(lastExId);
  if (!progress || progress.sessions < 2) return;

  const allExercises = getExerciseList();
  const ex = allExercises.find((e) => e.id === lastExId);
  const exName = ex ? ex.name : lastExId;

  // Insert progress card after quick start
  const quickStart = document.getElementById("quickStart");
  const existing = document.getElementById("progressPreview");
  if (existing) existing.remove();

  const trendIcon = progress.trend === "up" ? "📈" : progress.trend === "down" ? "📉" : "➡️";
  const div = document.createElement("div");
  div.id = "progressPreview";
  div.style.cssText = "margin-top:12px;padding:10px;background:rgba(91,140,255,0.08);border:1px solid rgba(91,140,255,0.2);border-radius:10px;font-size:12px;text-align:left;";
  div.innerHTML = `
    <div style="font-weight:600;color:var(--accent);margin-bottom:4px">${trendIcon} ${exName} Progress</div>
    <div style="color:var(--muted)">Last: ${progress.lastReps} reps · Best: ${progress.bestReps} · Avg form: ${progress.avgForm}%</div>
    ${progress.suggestion ? `<div style="margin-top:4px;color:var(--text)">💡 ${progress.suggestion.message}</div>` : ""}
  `;
  quickStart.appendChild(div);
}

function showTodaySummary() {
  const sessions = tracker.getSessions();
  const today = new Date();
  const todayStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  const todaySessions = sessions.filter((s) => {
    const d = new Date(s.startTime);
    const dStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    return dStr === todayStr;
  });

  if (todaySessions.length === 0) return;

  const totalReps = todaySessions.reduce((sum, s) => sum + (s.reps || 0), 0);
  const exercises = [...new Set(todaySessions.map((s) => s.exerciseId))];
  const allExercises = getExerciseList();
  const exerciseNames = exercises
    .map((id) => allExercises.find((e) => e.id === id)?.name || id)
    .join(", ");

  const existing = document.getElementById("todaySummary");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.id = "todaySummary";
  div.style.cssText = "width:100%;max-width:360px;margin:12px auto 0;padding:12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:12px;text-align:center;";
  div.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--good)">Today's Workout</div>
    <div style="font-size:24px;font-weight:800;color:var(--text);margin:4px 0">${totalReps} reps</div>
    <div style="font-size:11px;color:var(--muted)">${exerciseNames}</div>
    <div style="font-size:11px;color:var(--muted);margin-top:4px">${todaySessions.length} session${todaySessions.length > 1 ? "s" : ""} completed</div>
  `;
  returningUser.insertBefore(div, returningUser.querySelector(".divider"));
}

function buildWorkoutFlow() {
  const flow = document.getElementById("workoutFlow");
  if (!currentProgram) {
    flow.classList.add("hidden");
    return;
  }
  flow.classList.remove("hidden");
  flow.innerHTML = currentProgram.exercises
    .map((ex, i) => {
      const exData = EXERCISES.find((e) => e.id === ex.exerciseId);
      const name = exData ? exData.name : ex.exerciseId;
      const cls = i < currentProgramIndex ? "done" : i === currentProgramIndex ? "active" : "";
      return `<div class="flow-step ${cls}" title="${name}">${i + 1}</div>`;
    })
    .join("");
}

function startProgramExercise() {
  if (!currentProgram || currentProgramIndex >= currentProgram.exercises.length) {
    // Program complete!
    endWorkoutFlow();
    return;
  }
  const ex = currentProgram.exercises[currentProgramIndex];
  engine.setExercise(ex.exerciseId);
  repCount.textContent = "0";
  buildWorkoutFlow();

  // Set up UI for rep vs hold
  const exerciseData = EXERCISES.find((e) => e.id === ex.exerciseId);
  isHoldExercise = exerciseData && exerciseData.type === "hold";
  if (isHoldExercise) {
    repDisplay.classList.add("hidden");
    holdTimer.classList.remove("hidden");
    weightDisplay.classList.add("hidden");
    holdTarget.textContent = (exerciseData.holdTargetSeconds || ex.targetReps || 60) + "s";
    holdStartTime = 0; holdGoodFrames = 0; lastHoldSecond = 0;
    repLabel.textContent = "hold";
  } else {
    repDisplay.classList.remove("hidden");
    holdTimer.classList.add("hidden");
    weightDisplay.classList.remove("hidden");
    repLabel.textContent = "reps";
    holdStartTime = 0; holdGoodFrames = 0; lastHoldSecond = 0;
  }
}

function advanceProgram() {
  if (!currentProgram) return;
  currentProgramIndex++;

  if (currentProgramIndex >= currentProgram.exercises.length) {
    endWorkoutFlow();
    return;
  }

  // Show rest timer
  const nextEx = currentProgram.exercises[currentProgramIndex];
  const restSeconds = nextEx.restSeconds || 60;
  const nextExData = EXERCISES.find((e) => e.id === nextEx.exerciseId);
  const nextName = nextExData ? nextExData.name : nextEx.exerciseId;

  showRestTimer(restSeconds, nextName);
}

function showRestTimer(seconds, nextExerciseName) {
  const overlay = document.getElementById("restOverlay");
  const timer = document.getElementById("restTimer");
  const next = document.getElementById("restNext");
  overlay.classList.remove("hidden");
  next.textContent = `Next: ${nextExerciseName}`;

  let remaining = seconds;
  timer.textContent = remaining;

  if (restInterval) clearInterval(restInterval);

  restInterval = setInterval(() => {
    remaining--;
    timer.textContent = remaining;
    // Countdown beeps for last 3 seconds
    const settings = getCachedSettings();
    if (settings.audioEnabled) playCountdownBeep(remaining);
    if (remaining <= 0) {
      clearInterval(restInterval);
      restInterval = null;
      overlay.classList.add("hidden");
      startProgramExercise();
    }
  }, 1000);

  document.getElementById("btnSkipRest").onclick = () => {
    clearInterval(restInterval);
    restInterval = null;
    overlay.classList.add("hidden");
    startProgramExercise();
  };
}

function endWorkoutFlow() {
  currentProgram = null;
  currentProgramIndex = 0;
  document.getElementById("workoutFlow").classList.add("hidden");
  // End the session
  const session = tracker.endSession();
  stopCamera();
  if (session) {
    renderSummary(session);
    showView("summaryView");
  } else {
    showView("splashView");
    initSplash();
  }
}

// Quick start button
document.getElementById("btnQuickStart").addEventListener("click", () => {
  currentProgram = null;
  const lastEx = tracker.getLastExercise();
  engine.setExercise(lastEx);
  repCount.textContent = "0";
  startCamera();
});

// Override startBtn to use program flow
startBtn.addEventListener("click", () => {
  if (currentProgram) {
    currentProgramIndex = 0;
    startProgramExercise();
    startCamera();
  } else {
    // No program selected — just start single exercise
    startCamera();
  }
});

// End workout button in program mode advances to next exercise
document.getElementById("btnEndWorkout").addEventListener("click", () => {
  if (currentProgram && currentProgramIndex < currentProgram.exercises.length - 1) {
    const remaining = currentProgram.exercises.length - currentProgramIndex - 1;
    showConfirm("You have " + remaining + " exercise" + (remaining > 1 ? "s" : "") + " remaining. End workout now?", () => {
      endWorkout();
    });
  } else {
    endWorkout();
  }
});

function showConfirm(desc, onConfirm) {
  const overlay = document.getElementById("confirmOverlay");
  document.getElementById("confirmDesc").textContent = desc;
  overlay.classList.remove("hidden");
  document.getElementById("btnCancelEnd").onclick = () => overlay.classList.add("hidden");
  document.getElementById("btnConfirmEnd").onclick = () => {
    overlay.classList.add("hidden");
    onConfirm();
  };
}

function endWorkout() {
  if (restInterval) {
    clearInterval(restInterval);
    restInterval = null;
    document.getElementById("restOverlay").classList.add("hidden");
  }
  const session = tracker.endSession();
  stopCamera();
  if (session) {
    renderSummary(session);
    showView("summaryView");
  } else {
    showView("splashView");
    initSplash();
  }
}

// ==================== UI HELPERS ====================
function showToast(msg, { error = false, spinner = false, sticky = false } = {}) {
  toast.className = "toast" + (error ? " error" : "");
  toast.innerHTML = spinner
    ? `<span class="spinner"></span><span>${msg}</span>`
    : msg;
  toast.classList.remove("hidden");
  if (!sticky) {
    clearTimeout(showToast._t);
    showToast._t = setTimeout(
      () => toast.classList.add("hidden"),
      error ? 4000 : 2000
    );
  }
}

function setBadge(text, cls) {
  statusBadge.textContent = text;
  statusBadge.className = "status-badge " + (cls || "");
}

// ==================== ENGINE CALLBACKS ====================
engine.onRep((count) => {
  const prevCount = parseInt(repCount.textContent) || 0;
  repCount.textContent = count;
  repCount.style.transform = "scale(1.4)";
  setTimeout(() => (repCount.style.transform = "scale(1)"), 200);

  const settings = getCachedSettings();
  if (settings.audioEnabled) {
    sayRep(count);
    // Also play a short beep
    playRepSound();
    // Milestone chime
    if ([5, 10, 15, 20, 25, 30, 50].includes(count)) {
      setTimeout(() => playMilestoneSound(), 150);
    }
  }

  // Record rep in tracker
  const currentFeedback = engine._lastFeedback || [];
  const hasError = currentFeedback.some((f) => f.severity === "bad");
  tracker.recordRep(hasError ? "bad" : "good");

  // Show encouragement on milestones
  const msg = getEncouragement(engine.state, count, prevCount);
  if (msg) {
    feedbackText.textContent = msg;
    feedbackDetail.textContent = "";
    feedbackPanel.className = "feedback-panel good";
  }
});

engine.onFeedback((feedback, state) => {
  engine._lastFeedback = feedback;

  if (!feedback || feedback.length === 0) {
    feedbackText.textContent =
      state.charAt(0).toUpperCase() + state.slice(1);
    feedbackDetail.textContent = "";
    feedbackPanel.className = "feedback-panel";
    return;
  }

  const priority = { bad: 0, warn: 1, good: 2 };
  feedback.sort((a, b) => priority[a.severity] - priority[b.severity]);

  const top = feedback[0];
  // Use varied messages for good feedback, keep specific warnings/errors
  const displayMsg = top.severity === "good" ? getFormFeedback(top.severity, top.msg) : top.msg;
  feedbackText.textContent = displayMsg || top.msg;
  feedbackDetail.textContent = feedback.length > 1 ? feedback[1].msg : "";
  feedbackPanel.className = "feedback-panel " + top.severity;

  const settings = getCachedSettings();
  if (settings.audioEnabled) {
    sayFeedback(top.severity, top.msg);
    if (top.severity === "bad") playErrorSound();
  }
});

engine.onAngles((angles, state) => {
  // Throttle debug updates to every 30 frames (~1 sec at 30fps)
  _debugFrameCount++;
  if (_debugFrameCount % 30 === 0) {
    debugState.textContent = "State: " + state;
    const lines = Object.entries(angles).map(
      ([k, v]) => k + ": " + (v != null ? Math.round(v) + "°" : "N/A")
    );
    debugAngles.textContent = lines.join(" | ");
  }
});

// ==================== CAMERA ====================
let cameraInitialized = false;
let cameraInitializing = false;

async function initCamera() {
  if (cameraInitialized && video.srcObject) return true;
  if (cameraInitializing) return cameraInitializing;

  cameraInitializing = (async () => {
    let modelLoaded = false;
    try {
      // Step 1: Load MediaPipe model
      updateLoadingDetail("Downloading pose model (~5MB)…");
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(WASM_URL);
      } catch (err) {
        console.error("[FormCheck] WASM load failed:", err);
        throw new Error("MODEL_LOAD_FAILED");
      }

      updateLoadingDetail("Initializing pose detector…");
      const make = (delegate, modelUrl) =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: modelUrl, delegate },
          numPoses: 1,
          runningMode: "VIDEO",
          minPoseDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });

      // Try models in order: lite CPU (fastest), lite GPU, full CPU, full GPU
      const modelAttempts = [
        { delegate: "CPU", url: POSE_MODEL_LITE_URL },
        { delegate: "GPU", url: POSE_MODEL_LITE_URL },
        { delegate: "CPU", url: POSE_MODEL_URL },
        { delegate: "GPU", url: POSE_MODEL_URL },
      ];
      let modelError = null;
      for (const attempt of modelAttempts) {
        try {
          updateLoadingDetail("Loading " + (attempt.url.includes("lite") ? "lite" : "full") + " model (" + attempt.delegate + ")…");
          poseLandmarker = await Promise.race([
            make(attempt.delegate, attempt.url),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
          ]);
          modelLoaded = true;
          console.log("[FormCheck] Model loaded:", attempt.url, attempt.delegate);
          break;
        } catch (err) {
          modelError = err;
          console.warn("[FormCheck] Model attempt failed:", attempt.url, err.message);
        }
      }
      if (!modelLoaded) {
        throw new Error("MODEL_LOAD_FAILED");
      }
      modelLoaded = true;

      // Step 2: Start camera
      updateLoadingDetail("Requesting camera access…");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        console.error("[FormCheck] camera error:", err);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          throw new Error("CAMERA_PERMISSION_DENIED");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          throw new Error("CAMERA_NOT_FOUND");
        } else if (err.name === "NotReadableError" || err.name === "OverconstrainedError") {
          throw new Error("CAMERA_IN_USE");
        }
        throw new Error("CAMERA_ERROR");
      }

      video.srcObject = stream;
      await video.play();

      // Wait for video metadata
      await new Promise((r) => {
        if (video.videoWidth) return r();
        video.onloadedmetadata = () => r();
      });

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      infCanvas.width = INF_W;
      infCanvas.height = Math.max(1, Math.round((INF_W * vh) / vw));

      cameraInitialized = true;
      return true;
    } catch (err) {
      console.error("[FormCheck] initCamera error:", err);
      // Clean up partial state
      if (video.srcObject) {
        video.srcObject.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
      }
      // Show specific error
      const errorMsg = getCameraErrorMessage(err.message);
      showLoadingError(errorMsg.title, errorMsg.detail);
      return false;
    } finally {
      cameraInitializing = false;
    }
  })();

  return cameraInitializing;
}

function showLoading(title, detail, pct) {
  showView("loadingView");
  document.getElementById("loadingTitle").textContent = title || "Loading…";
  document.getElementById("loadingDetail").textContent = detail || "";
  document.getElementById("loadingBarFill").style.width = (pct || 0) + "%";
  document.getElementById("loadingRetry").classList.add("hidden");
}

function showLoadingError(title, detail) {
  showView("loadingView");
  document.getElementById("loadingTitle").textContent = title || "Error";
  document.getElementById("loadingDetail").textContent = detail || "";
  document.getElementById("loadingBarFill").style.width = "0%";
  document.getElementById("loadingRetry").classList.remove("hidden");
}

function updateLoadingDetail(text) {
  const el = document.getElementById("loadingDetail");
  if (el) el.textContent = text;
}

function getCameraErrorMessage(code) {
  switch (code) {
    case "CAMERA_PERMISSION_DENIED":
      return {
        title: "Camera access denied",
        detail: "Click the camera icon in your browser's address bar and allow camera access, then click Retry.",
      };
    case "CAMERA_NOT_FOUND":
      return {
        title: "No camera found",
        detail: "Make sure your webcam is connected and not being used by another app.",
      };
    case "CAMERA_IN_USE":
      return {
        title: "Camera in use",
        detail: "Another app is using your camera. Close other camera apps and click Retry.",
      };
    case "MODEL_LOAD_FAILED":
      return {
        title: "Model download failed",
        detail: "Could not download the pose model. Check your internet connection and click Retry.",
      };
    default:
      return {
        title: "Camera failed",
        detail: "Could not access camera or load model. Check permissions and internet, then click Retry.",
      };
  }
}

async function startCamera() {
  // Reset any stuck state from previous attempts
  if (cameraInitializing) {
    cameraInitializing = false;
  }

  showLoading("Loading pose model…", "Downloading MediaPipe WASM + model (~5MB)", 10);

  try {
    tracker.startSession(engine.exerciseId);

    const ok = await initCamera();
    if (!ok) {
      // Error already shown by initCamera's catch block
      document.getElementById("loadingRetry").onclick = () => startCamera();
      return;
    }

    showLoading("Starting camera…", "Almost ready…", 90);

    // Small delay for video to stabilize
    await new Promise((r) => setTimeout(r, 500));

    showView("cameraView");
    running = true;
    setBadge("Loading…", "loading");
    loop();
  } catch (err) {
    console.error("[FormCheck] startCamera error:", err);
    showLoadingError("Something went wrong", err.message || "Unknown error");
    document.getElementById("loadingRetry").onclick = () => startCamera();
  }
}

function pauseCamera() {
  running = false;
  // Don't stop the stream — just pause the loop
}

function resumeCamera() {
  if (!cameraInitialized) {
    startCamera();
    return;
  }
  showView("cameraView");
  running = true;
  loop();
}

function stopCamera() {
  running = false;
  // Clear rest timer if running
  if (restInterval) {
    clearInterval(restInterval);
    restInterval = null;
  }
  // Stop camera stream
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  // Reset state
  cameraInitialized = false;
  cameraInitializing = false;
  lastVideoTime = -1;
  // Clear canvas
  octx.clearRect(0, 0, overlay.width, overlay.height);
}

// ==================== MAIN LOOP ====================
function loop() {
  if (!running) return;
  try {
    const now = performance.now();
    if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
      lastVideoTime = video.currentTime;
      ictx.drawImage(video, 0, 0, infCanvas.width, infCanvas.height);
      const result = poseLandmarker.detectForVideo(infCanvas, now);

      const w = window.innerWidth;
      const h = window.innerHeight;

      const settings = getCachedSettings();

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];
        const { angles, state, feedback } = engine.process(landmarks, now);

        if (settings.showSkeleton) {
          engine.drawSkeleton(octx, landmarks, w, h);
        } else {
          octx.clearRect(0, 0, w, h);
        }

        if (settings.showAngles) {
          engine.drawAngles(octx, landmarks, angles, w, h);
        }

        setBadge("● Tracking", "tracking");

        // Hold timer logic
        if (isHoldExercise) {
          const isGoodPosition = feedback.some((f) => f.severity === "good");
          if (isGoodPosition) {
            holdGoodFrames++;
            if (holdGoodFrames >= 10) {
              // User has been in good position for ~10 frames (~300ms)
              if (holdStartTime === 0) {
                holdStartTime = Date.now();
                lastHoldSecond = 0;
              }
              const elapsed = Math.floor((Date.now() - holdStartTime) / 1000);
              const mins = Math.floor(elapsed / 60);
              const secs = elapsed % 60;
              holdTime.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;

              // Progress bar
              const exerciseData = EXERCISES.find((e) => e.id === engine.exerciseId);
              const target = exerciseData?.holdTargetSeconds || 60;
              const pct = Math.min(100, (elapsed / target) * 100);
              holdProgressBar.style.width = pct + "%";

              // Color change as you approach target
              if (elapsed >= target) {
                holdTime.style.color = "var(--warn)";
                holdProgressBar.style.background = "var(--warn)";
              }

              // Audio cue every 5 seconds
              if (elapsed > 0 && elapsed % 5 === 0 && elapsed !== lastHoldSecond) {
                lastHoldSecond = elapsed;
                const settings = getCachedSettings();
                if (settings.audioEnabled) say(`${elapsed} seconds`);
              }
            }
          } else {
            // Reset if form breaks
            holdGoodFrames = 0;
            holdStartTime = 0;
            holdTime.textContent = "0:00";
            holdProgressBar.style.width = "0%";
            holdTime.style.color = "var(--good)";
            holdProgressBar.style.background = "var(--good)";
          }
        }

        // Calibration
        if (isCalibrating) {
          runCalibration(landmarks, now);
        }
      } else {
        octx.clearRect(0, 0, w, h);
        setBadge("No pose detected", "loading");
        // Rotate through helpful messages
        const noPoseMessages = [
          ["Step back", "I need to see your full body"],
          ["Check lighting", "Make sure your room is well lit"],
          ["Face the camera", "Stand facing your webcam"],
          ["Move back", "Stand 6-8 feet from the camera"],
          ["Full body visible", "Head to toe should be in frame"],
        ];
        const msgIdx = Math.floor(Date.now() / 3000) % noPoseMessages.length;
        const msg = noPoseMessages[msgIdx];
        feedbackText.textContent = msg[0];
        feedbackDetail.textContent = msg[1];
        feedbackPanel.className = "feedback-panel";
        holdGoodFrames = 0;
        holdStartTime = 0;
      }
    }
  } catch (e) {
    console.error("loop error:", e);
  }
  requestAnimationFrame(loop);
}

// ==================== BOTTOM CONTROLS ====================
document.getElementById("btnHistory").addEventListener("click", () => {
  pauseCamera();
  renderHistory();
  showView("historyView");
});

document.getElementById("btnSettings").addEventListener("click", () => {
  pauseCamera();
  renderSettings();
  showView("settingsView");
});


// ==================== HISTORY ====================
function renderHistory() {
  const sessions = tracker.getSessions();
  document.getElementById("statSessions").textContent = tracker.getTotalSessions();
  document.getElementById("statReps").textContent = tracker.getTotalReps();
  document.getElementById("statStreak").textContent = tracker.getStreak();
  document.getElementById("statForm").textContent = tracker.getAverageFormScore() + "%";

  // Render progress chart
  renderProgressChart(sessions);

  if (sessions.length === 0) {
    sessionList.innerHTML = '<div class="empty-state">No workouts yet. Start your first session!</div>';
    return;
  }

  sessionList.innerHTML = sessions
    .map((s) => {
      const ex = getExerciseList().find((e) => e.id === s.exerciseId);
      const formClass = s.formScore >= 70 ? "good" : s.formScore >= 40 ? "warn" : "bad";
      return `
        <div class="session-item">
          <div class="session-info">
            <div class="session-exercise">${ex ? ex.name : s.exerciseId}</div>
            <div class="session-meta">${s.date} · ${s.durationMin}min · ~${tracker.estimateCalories(s.exerciseId, s.reps)} cal${s.weight ? " · " + s.weight + " " + (s.weightUnit || "kg") : ""}</div>
          </div>
          <div class="session-stats">
            <div class="session-reps">${s.reps} reps</div>
            <div class="session-form ${formClass}">${s.formScore || 0}% form</div>
          </div>
        </div>
      `;
    })
    .join("");
}

// ==================== PROGRESS CHART ====================
let chartRange = 7;

function renderProgressChart(sessions) {
  const canvas = document.getElementById("progressChart");
  if (!canvas || sessions.length === 0) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  // Filter sessions by range
  const now = Date.now();
  const rangeMs = chartRange === "all" ? Infinity : chartRange * 86400000;
  const filtered = sessions.filter((s) => now - s.startTime <= rangeMs);

  // Aggregate by day
  const dayMap = {};
  filtered.forEach((s) => {
    const d = new Date(s.startTime);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    if (!dayMap[key]) dayMap[key] = { reps: 0, form: 0, count: 0 };
    dayMap[key].reps += s.reps || 0;
    dayMap[key].form += s.formScore || 0;
    dayMap[key].count++;
  });

  const days = Object.keys(dayMap).sort();
  if (days.length === 0) {
    ctx.fillStyle = "var(--muted)";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No data for this period", w / 2, h / 2);
    return;
  }

  const maxReps = Math.max(...days.map((d) => dayMap[d].reps), 10);
  const padding = { top: 20, right: 15, bottom: 25, left: 35 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // Draw grid
  ctx.strokeStyle = "var(--stroke)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    // Y-axis labels
    const val = Math.round(maxReps - (maxReps / 4) * i);
    ctx.fillStyle = "var(--muted)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(String(val), padding.left - 4, y + 3);
  }

  // Draw bars
  const barWidth = Math.max(4, Math.min(20, (chartW / days.length) - 4));
  const gap = (chartW - barWidth * days.length) / (days.length + 1);

  days.forEach((day, i) => {
    const data = dayMap[day];
    const barH = (data.reps / maxReps) * chartH;
    const x = padding.left + gap + i * (barWidth + gap);
    const y = padding.top + chartH - barH;

    // Bar color based on form score
    const avgForm = data.count > 0 ? data.form / data.count : 0;
    let barColor = "var(--good)";
    if (avgForm < 40) barColor = "var(--bad)";
    else if (avgForm < 70) barColor = "var(--warn)";

    ctx.fillStyle = barColor;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, 2);
    ctx.fill();

    // X-axis label (every Nth day)
    const labelStep = Math.max(1, Math.floor(days.length / 6));
    if (i % labelStep === 0 || i === days.length - 1) {
      const date = new Date(day);
      const label = (date.getMonth() + 1) + "/" + date.getDate();
      ctx.fillStyle = "var(--muted)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, x + barWidth / 2, h - 5);
    }
  });

  // Legend
  const legendEl = document.getElementById("chartLegend");
  if (legendEl) {
    legendEl.innerHTML = `
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--good)"></span> Good form</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--warn)"></span> Okay</div>
      <div class="chart-legend-item"><span class="chart-legend-dot" style="background:var(--bad)"></span> Needs work</div>
    `;
  }
}

// Chart range buttons
document.getElementById("chartControls")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".chart-btn");
  if (!btn) return;
  document.querySelectorAll(".chart-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  chartRange = btn.dataset.range === "all" ? "all" : parseInt(btn.dataset.range);
  renderHistory();
});

document.getElementById("historyBack").addEventListener("click", () => {
  resumeCamera();
});

// ==================== SETTINGS ====================
function renderSettings() {
  const profile = tracker.getProfile();
  const settings = getCachedSettings();
  settingsName.value = profile.name || "";
  settingAudio.checked = settings.audioEnabled;
  settingSkeleton.checked = settings.showSkeleton;
  settingAngles.checked = settings.showAngles;
  settingRestTimer.value = settings.restTimerSeconds;

  // Level buttons
  document.querySelectorAll("#settingsView .level-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.level === profile.level);
  });
}

document.querySelectorAll("#settingsView .level-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll("#settingsView .level-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "" : "light");
}

function saveSettings() {
  const levelBtn = document.querySelector("#settingsView .level-btn.active");
  const darkMode = settingDarkMode ? settingDarkMode.checked : true;
  tracker.setProfile({
    name: settingsName.value.trim(),
    level: levelBtn ? levelBtn.dataset.level : "intermediate",
  });
  tracker.setSettings({
    audioEnabled: settingAudio.checked,
    showSkeleton: settingSkeleton.checked,
    showAngles: settingAngles.checked,
    restTimerSeconds: parseInt(settingRestTimer.value) || 60,
    darkMode,
  });
  applyTheme(darkMode);
  showToast("Settings saved ✓");
}

settingsName.addEventListener("change", saveSettings);
settingAudio.addEventListener("change", saveSettings);
settingSkeleton.addEventListener("change", saveSettings);
settingAngles.addEventListener("change", saveSettings);
settingRestTimer.addEventListener("change", saveSettings);
if (settingDarkMode) settingDarkMode.addEventListener("change", saveSettings);

  // Weight input
  if (weightInput) weightInput.addEventListener('input', () => {
    const val = parseFloat(weightInput.value) || null;
    const unit = weightUnit ? weightUnit.value : 'kg';
    tracker.setWeight(val, unit);
  });
  if (weightUnit) weightUnit.addEventListener('change', () => {
    const val = parseFloat(weightInput.value) || null;
    tracker.setWeight(val, weightUnit.value);
  });

  // Init theme from saved settings
const savedSettings = tracker.getSettings();
if (savedSettings.darkMode === false) {
  applyTheme(false);
  if (settingDarkMode) settingDarkMode.checked = false;
}

document.getElementById("settingsBack").addEventListener("click", () => {
  saveSettings();
  resumeCamera();
});

document.getElementById("btnExportData").addEventListener("click", () => {
  const data = tracker.exportData();
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `formcheck-data-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Data exported ✓");
});

document.getElementById("btnImportData").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const ok = tracker.importData(ev.target.result);
    if (ok) {
      showToast("Data imported successfully ✓");
      renderHistory();
    } else {
      showToast("Invalid data file", { error: true });
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // reset so same file can be re-imported
});

document.getElementById("btnClearData").addEventListener("click", () => {
  if (confirm("Clear all workout data? This cannot be undone.")) {
    tracker.clearAll();
    showToast("All data cleared");
    renderHistory();
  }
});

// Tutorial list in settings
const tutorialList = document.getElementById("tutorialList");
const allTutorials = getAllTutorials();
tutorialList.innerHTML = allTutorials
  .map(
    (t) =>
      `<div class="session-item" style="cursor:pointer" data-tutorial="${t.id}">
        <div class="session-info">
          <div class="session-exercise">${t.name}</div>
          <div class="session-meta">${t.muscles.join(" · ")}</div>
        </div>
        <div class="session-stats"><span style="color:var(--accent)">View →</span></div>
      </div>`
  )
  .join("");

tutorialList.addEventListener("click", (e) => {
  const item = e.target.closest("[data-tutorial]");
  if (item) {
    saveSettings();
    renderTutorial(item.dataset.tutorial);
    showView("tutorialView");
  }
});

document.getElementById("btnDebugLog").addEventListener("click", (e) => {
  e.preventDefault();
  console.log("[FormCheck] === DEBUG LOG ===");
  console.log("Profile:", tracker.getProfile());
  console.log("Settings:", tracker.getSettings());
  console.log("Sessions:", tracker.getSessions());
  console.log("Current engine state:", engine.state);
  console.log("==================");
  showToast("Debug log printed to console (F12)");
});

// Calibration settings
function renderCalStatus() {
  const container = document.getElementById("calStatusList");
  const status = getCalibrationStatus();
  const allExercises = getExerciseList();

  if (status.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:12px">No exercises calibrated yet</div>';
    return;
  }

  container.innerHTML = status
    .map((s) => {
      const ex = allExercises.find((e) => e.id === s.exerciseId);
      const name = ex ? ex.name : s.exerciseId;
      const icon = s.calibrated ? "✓" : "○";
      const color = s.calibrated ? "var(--good)" : "var(--muted)";
      return `<div class="session-item" style="padding:8px 12px">
        <span style="color:${color}">${icon} ${name}</span>
        <span style="color:var(--muted);font-size:11px">${s.reps} reps</span>
      </div>`;
    })
    .join("");
}

// Add renderCalStatus call to saveSettings
const origSaveSettings = saveSettings;
// We'll hook into the settings render instead

document.getElementById("btnClearAllCal")?.addEventListener("click", () => {
  if (confirm("Clear all calibration data?")) {
    clearCalibration();
    renderCalStatus();
    showToast("Calibration cleared");
  }
});

// Hook into settings view
const origRenderSettings = renderSettings;
renderSettings = function() {
  origRenderSettings();
  renderCalStatus();
};

// ==================== TUTORIAL ====================
function renderTutorial(exerciseId) {
  const tutorial = getTutorial(exerciseId);
  if (!tutorial) {
    showToast("No tutorial available for this exercise");
    return;
  }

  document.getElementById("tutorialTitle").textContent = tutorial.name + " Guide";

  document.getElementById("tutorialContent").innerHTML = `
    <div class="tutorial-section">
      <h3>🎯 Setup</h3>
      <ul>${tutorial.setup.map((s) => `<li>${s}</li>`).join("")}</ul>
    </div>
    <div class="tutorial-section tips">
      <h3>✓ Form Tips</h3>
      <ul>${tutorial.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
    </div>
    <div class="tutorial-section mistakes">
      <h3>✗ Common Mistakes</h3>
      <ul>${tutorial.mistakes.map((m) => `<li>${m}</li>`).join("")}</ul>
    </div>
    <div class="tutorial-section">
      <h3>💪 Muscles Worked</h3>
      <div class="muscle-tags">${tutorial.muscles.map((m) => `<span class="muscle-tag">${m}</span>`).join("")}</div>
    </div>
  `;

  showView("tutorialView");
}

// Long-press on exercise button opens tutorial (mouse + touch)
let longPressTimer;
function startLongPress(e) {
  const btn = e.target.closest(".exercise-btn");
  if (!btn) return;
  longPressTimer = setTimeout(() => {
    renderTutorial(btn.dataset.exercise);
  }, 600);
}
function cancelLongPress() { clearTimeout(longPressTimer); }
exercisePicker.addEventListener("mousedown", startLongPress);
exercisePicker.addEventListener("mouseup", cancelLongPress);
exercisePicker.addEventListener("mouseleave", cancelLongPress);
exercisePicker.addEventListener("touchstart", startLongPress, { passive: true });
exercisePicker.addEventListener("touchend", cancelLongPress);
exercisePicker.addEventListener("touchcancel", cancelLongPress);

document.getElementById("tutorialBack").addEventListener("click", () => {
  resumeCamera();
});

// ==================== SUMMARY ====================
function renderSummary(session) {
  // Play workout complete sound
  const settings = getCachedSettings();
  if (settings.audioEnabled) {
    setTimeout(() => playWorkoutCompleteSound(), 300);
  }

  const exercises = getExerciseList();
  const cal = tracker.estimateCalories(session.exerciseId, session.reps);
  const pb = tracker.getPersonalBest(session.exerciseId);
  const isPB = session.reps >= pb && session.reps > 0;

  let exerciseBreakdown = "";
  if (session.exercises && session.exercises.length > 1) {
    exerciseBreakdown = "<div style='grid-column:span 2;margin-top:8px;text-align:left;'>";
    exerciseBreakdown += "<div style='font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px'>Exercise Breakdown</div>";
    session.exercises.forEach(function(ex) {
      const exData = exercises.find(function(e) { return e.id === ex.exerciseId; });
      const name = exData ? exData.name : ex.exerciseId;
      const fc = ex.formScore >= 70 ? "good" : ex.formScore >= 40 ? "warn" : "bad";
      exerciseBreakdown += "<div style='display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--stroke)'>";
      exerciseBreakdown += "<span>" + name + "</span>";
      exerciseBreakdown += "<span>" + ex.reps + " reps · <span style='color:var(--" + fc + ")'>" + (ex.formScore || 0) + "%</span></span>";
      exerciseBreakdown += "</div>";
    });
    exerciseBreakdown += "</div>";
  }

  const mainEx = exercises.find(function(e) { return e.id === session.exerciseId; });

  document.getElementById("summaryStats").innerHTML = [
    '<div class="summary-stat">',
      '<div class="summary-stat-value">' + (mainEx ? mainEx.name : session.exerciseId) + '</div>',
      '<div class="summary-stat-label">' + (session.exercises && session.exercises.length > 1 ? "Last Exercise" : "Exercise") + '</div>',
    '</div>',
    '<div class="summary-stat">',
      '<div class="summary-stat-value">' + session.reps + '</div>',
      '<div class="summary-stat-label">Total Reps</div>',
    '</div>',
    '<div class="summary-stat">',
      '<div class="summary-stat-value">' + (session.formScore || 0) + '%</div>',
      '<div class="summary-stat-label">Form Score</div>',
    '</div>',
    '<div class="summary-stat">',
      '<div class="summary-stat-value">~' + cal + '</div>',
      '<div class="summary-stat-label">Est. Calories</div>',
    '</div>',
    isPB ? '<div class="summary-stat" style="grid-column:span 2"><div class="summary-stat-value" style="color:var(--warn)">&#127942; Personal Best!</div><div class="summary-stat-label">New record: ' + session.reps + ' reps</div></div>' : '',
    '<div class="summary-stat" style="grid-column:span 2">',
      '<div class="summary-stat-value">' + (Math.round(session.duration / 60000 * 10) / 10) + 'min</div>',
      '<div class="summary-stat-label">Duration</div>',
    '</div>',
    exerciseBreakdown
  ].join("");

  const progress = tracker.getProgressForExercise(session.exerciseId);
  if (progress && progress.suggestion) {
    const suggestionHtml = [
      '<div style="margin-top:16px;padding:12px;background:rgba(91,140,255,0.1);border:1px solid rgba(91,140,255,0.3);border-radius:10px;grid-column:span 2">',
        '<div style="font-size:13px;font-weight:600;color:var(--accent)">&#128200; ' + progress.suggestion.message + '</div>',
        '<div style="font-size:11px;color:var(--muted);margin-top:4px">',
          progress.sessions + ' sessions tracked · Best: ' + progress.bestReps + ' reps · Avg form: ' + progress.avgForm + '%',
        '</div>',
      '</div>'
    ].join("");
    document.getElementById("summaryStats").insertAdjacentHTML("beforeend", suggestionHtml);
  }
}

document.getElementById("summaryHome")

document.getElementById("summaryHome").addEventListener("click", () => {
  showView("splashView");
  initSplash();
});

// ==================== CUSTOM PROGRAM BUILDER ====================
let editingProgram = null;

function renderBuilder() {
  const list = document.getElementById("customProgramsList");
  const programs = getCustomPrograms();
  if (programs.length === 0) {
    list.innerHTML = '<div class="empty-state">No custom routines yet. Create one below!</div>';
  } else {
    list.innerHTML = programs
      .map(
        (p) => `
        <div class="session-item">
          <div class="session-info">
            <div class="session-exercise">${p.name}</div>
            <div class="session-meta">${p.description || ""} · ${p.exercises.length} exercises</div>
          </div>
          <div class="session-stats">
            <button class="btn small" data-edit="${p.id}">Edit</button>
            <button class="btn small ghost" data-del="${p.id}">✗</button>
          </div>
        </div>`
      )
    .join("");
  }

  // Build exercise dropdown
  const exercises = getExerciseList();
  const builderExercises = document.getElementById("builderExercises");
  const existingExercises = editingProgram ? editingProgram.exercises : [];

  builderExercises.innerHTML = existingExercises
    .map(
      (ex, i) => `
      <div class="builder-exercise-item">
        <select data-field="exerciseId" data-idx="${i}">
          ${exercises
            .map(
              (e) =>
                `<option value="${e.id}" ${e.id === ex.exerciseId ? "selected" : ""}>${e.name}</option>`
            )
            .join("")}
        </select>
        <input type="number" data-field="targetReps" data-idx="${i}" value="${ex.targetReps || 10}" min="1" max="100" placeholder="Reps" />
        <input type="number" data-field="restSeconds" data-idx="${i}" value="${ex.restSeconds || 60}" min="10" max="300" placeholder="Rest" />
        <button class="remove-btn" data-idx="${i}">✗</button>
      </div>`
    )
    .join("");
}

function openBuilder(program = null) {
  editingProgram = program
    ? { ...program }
    : createNewProgram("New Routine", "");
  document.getElementById("builderName").value = editingProgram.name;
  document.getElementById("builderDesc").value = editingProgram.description || "";
  renderBuilder();
  showView("builderView");
}

// Add "Create Custom" button to program picker
const createProgramBtn = document.createElement("div");
createProgramBtn.className = "program-option";
createProgramBtn.style.borderColor = "var(--accent)";
createProgramBtn.innerHTML = `
  <div class="program-option-name" style="color:var(--accent)">+ Create Custom Routine</div>
  <div class="program-option-desc">Build your own workout</div>
`;
createProgramBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openBuilder();
});
document.getElementById("programPicker")?.appendChild(createProgramBtn);

document.getElementById("builderAddExercise").addEventListener("click", () => {
  if (!editingProgram) return;
  editingProgram.exercises.push({
    exerciseId: "squat",
    targetReps: 10,
    restSeconds: 60,
  });
  renderBuilder();
});

document.getElementById("builderExercises").addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-btn")) {
    const idx = parseInt(e.target.dataset.idx);
    editingProgram.exercises.splice(idx, 1);
    renderBuilder();
  }
});

document.getElementById("builderSave").addEventListener("click", () => {
  if (!editingProgram) return;

  // Collect values from form
  editingProgram.name =
    document.getElementById("builderName").value.trim() || "My Routine";
  editingProgram.description =
    document.getElementById("builderDesc").value.trim();

  // Collect exercise data
  const items = document.querySelectorAll(".builder-exercise-item");
  editingProgram.exercises = Array.from(items).map((item) => ({
    exerciseId: item.querySelector('[data-field="exerciseId"]').value,
    targetReps: parseInt(item.querySelector('[data-field="targetReps"]').value) || 10,
    restSeconds: parseInt(item.querySelector('[data-field="restSeconds"]').value) || 60,
  }));

  if (editingProgram.exercises.length === 0) {
    showToast("Add at least one exercise", { error: true });
    return;
  }

  saveCustomProgram(editingProgram);
  showToast(`Routine "${editingProgram.name}" saved ✓`);
  showView("splashView");
  initSplash();
});

document.getElementById("builderBack").addEventListener("click", () => {
  showView("splashView");
});

// Edit/delete custom programs
document.getElementById("customProgramsList").addEventListener("click", (e) => {
  const editBtn = e.target.closest("[data-edit]");
  const delBtn = e.target.closest("[data-del]");
  if (editBtn) {
    const program = getCustomPrograms().find((p) => p.id === editBtn.dataset.edit);
    if (program) openBuilder(program);
  }
  if (delBtn) {
    if (confirm("Delete this routine?")) {
      deleteCustomProgram(delBtn.dataset.del);
      renderBuilder();
    }
  }
});

// ==================== CALENDAR ====================
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const monthLabel = document.getElementById("calMonth");

  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  monthLabel.textContent = `${months[calMonth]} ${calYear}`;

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();

  // Get workout days this month
  const sessions = tracker.getSessions(365);
  const workoutDays = {};
  sessions.forEach((s) => {
    const d = new Date(s.startTime);
    if (d.getMonth() === calMonth && d.getFullYear() === calYear) {
      const day = d.getDate();
      workoutDays[day] = (workoutDays[day] || 0) + (s.reps || 0);
    }
  });

  // Build grid
  const headers = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  let html = headers.map((h) => `<div class="cal-header">${h}</div>`).join("");

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  // Day cells
  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday =
      d === today.getDate() &&
      calMonth === today.getMonth() &&
      calYear === today.getFullYear();
    const reps = workoutDays[d] || 0;
    let level = 0;
    if (reps > 0) level = 1;
    if (reps > 30) level = 2;
    if (reps > 60) level = 3;

    html += `<div class="cal-day level-${level} ${isToday ? "today" : ""}" data-day="${d}">${d}</div>`;
  }

  grid.innerHTML = html;

  // Click handler for day detail
  grid.querySelectorAll(".cal-day:not(.empty)").forEach((cell) => {
    cell.addEventListener("click", () => {
      const day = parseInt(cell.dataset.day);
      const daySessions = sessions.filter((s) => {
        const d = new Date(s.startTime);
        return (
          d.getDate() === day &&
          d.getMonth() === calMonth &&
          d.getFullYear() === calYear
        );
      });
      const detail = document.getElementById("calDayDetail");
      if (daySessions.length === 0) {
        detail.classList.add("hidden");
        return;
      }
      detail.classList.remove("hidden");
      const totalReps = daySessions.reduce((sum, s) => sum + (s.reps || 0), 0);
      detail.innerHTML = `
        <div style="font-weight:700;margin-bottom:8px">${months[calMonth]} ${day}, ${calYear}</div>
        <div style="color:var(--good);font-size:24px;font-weight:800">${totalReps} total reps</div>
        <div style="margin-top:8px;color:var(--muted);font-size:12px">
          ${daySessions.map((s) => {
            const ex = getExerciseList().find((e) => e.id === s.exerciseId);
            return `${ex ? ex.name : s.exerciseId}: ${s.reps} reps`;
          }).join("<br>")}
        </div>
      `;
    });
  });
}

document.getElementById("calPrev").addEventListener("click", () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});

document.getElementById("calNext").addEventListener("click", () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});

document.getElementById("calendarBack").addEventListener("click", () => {
  showView("historyView");
});

// Add calendar button to history view
const calBtn = document.createElement("button");
calBtn.className = "btn small";
calBtn.textContent = "📅 Calendar";
calBtn.style.marginLeft = "8px";
calBtn.addEventListener("click", () => {
  calMonth = new Date().getMonth();
  calYear = new Date().getFullYear();
  renderCalendar();
  showView("calendarView");
});
document.querySelector("#historyView .page-header")?.appendChild(calBtn);

// ==================================== CALIBRATION ====================

function updateCalBanner() {
  const banner = document.getElementById("calBanner");
  const nameSpan = document.getElementById("calExerciseName");
  if (!banner || !engine.exerciseId) return;

  const calibrated = isCalibrated(engine.exerciseId);
  const exData = EXERCISES.find((e) => e.id === engine.exerciseId);
  const exName = exData ? exData.name : engine.exerciseId;

  if (!calibrated && !isCalibrating) {
    banner.classList.remove("hidden");
    nameSpan.textContent = exName;
  } else {
    banner.classList.add("hidden");
  }
}

// Show calibration banner when exercise changes
const origSetExercise = engine.setExercise.bind(engine);
engine.setExercise = function(id) {
  origSetExercise(id);
  updateCalBanner();
};

document.getElementById("btnStartCal").addEventListener("click", () => {
  isCalibrating = true;
  calPhase = "top";
  calRepCount = 0;
  calAngles = {};
  document.getElementById("calOverlay").classList.remove("hidden");
  document.getElementById("calTitle").textContent =
    EXERCISES.find((e) => e.id === engine.exerciseId)?.name || engine.exerciseId;
  document.getElementById("calInstruction").textContent =
    "Stand in starting position (arms down / standing)";
  document.getElementById("calProgress").textContent = "0 / 3 reps";
});

document.getElementById("btnCancelCal").addEventListener("click", () => {
  isCalibrating = false;
  calPhase = "waiting";
  document.getElementById("calOverlay").classList.add("hidden");
  clearCalibration(engine.exerciseId);
});

// Calibration loop — runs inside the main loop
function runCalibration(landmarks, now) {
  if (!isCalibrating) return;

  const angles = engine.calcAngles(landmarks, now);
  const angleDisplay = document.getElementById("calAngles");

  // Show current angles
  const angleStr = Object.entries(angles)
    .map(([k, v]) => `${k}: ${v != null ? Math.round(v) + "°" : "N/A"}`)
    .join(" | ");
  angleDisplay.textContent = angleStr;

  // State machine for calibration
  const exerciseData = EXERCISES.find((e) => e.id === engine.exerciseId);
  if (!exerciseData) return;

  // Detect phase transitions based on angle changes
  const jointNames = Object.keys(exerciseData.joints);
  const primaryJoint = jointNames[0];
  const currentAngle = angles[primaryJoint];

  if (currentAngle == null) return;

  // Track min/max angles during calibration
  if (!calAngles.top) calAngles.top = {};
  if (!calAngles.bottom) calAngles.bottom = {};

  // Update top (standing) position — track the max angle seen
  if (!calAngles.top[primaryJoint] || currentAngle > calAngles.top[primaryJoint]) {
    calAngles.top[primaryJoint] = currentAngle;
  }
  // Update bottom position — track the min angle seen
  if (!calAngles.bottom[primaryJoint] || currentAngle < calAngles.bottom[primaryJoint]) {
    calAngles.bottom[primaryJoint] = currentAngle;
  }

  const range = (calAngles.top[primaryJoint] || 0) - (calAngles.bottom[primaryJoint] || 0);

  if (calPhase === "top") {
    document.getElementById("calInstruction").textContent =
      "Hold still at starting position... then go down";
    // Auto-transition to bottom after 2 seconds or when user moves significantly
    if (!calAngles.topTime) calAngles.topTime = now;
    if (now - calAngles.topTime > 2000 || currentAngle < (calAngles.top[primaryJoint] || 180) - 20) {
      calPhase = "bottom";
      calAngles.bottomTime = null;
    }
  } else if (calPhase === "bottom") {
    document.getElementById("calInstruction").textContent =
      "Hold at bottom position... then return up";
    // Auto-transition back to top after 2 seconds or when user returns up
    if (!calAngles.bottomTime) calAngles.bottomTime = now;
    if (now - calAngles.bottomTime > 2000 || currentAngle > (calAngles.bottom[primaryJoint] || 0) + 20) {
      // Record this rep
      recordCalAngle(engine.exerciseId, { [primaryJoint]: calAngles.top[primaryJoint] }, "top");
      recordCalAngle(engine.exerciseId, { [primaryJoint]: calAngles.bottom[primaryJoint] }, "bottom");
      calRepCount++;
      document.getElementById("calProgress").textContent = calRepCount + " / 3 reps";

      if (calRepCount >= 3) {
        finalizeCalibration(engine.exerciseId);
        isCalibrating = false;
        calPhase = "waiting";
        document.getElementById("calOverlay").classList.add("hidden");
        showToast("Calibration complete! ✓");
        playSuccessSound();
        updateCalBanner();
      } else {
        calPhase = "top";
        calAngles.topTime = null;
        calAngles.bottomTime = null;
        document.getElementById("calInstruction").textContent =
          "Stand in starting position";
      }
    }
  }
}

// Hook into main loop
const origLoop = loop;
// We need to patch the loop to include calibration
// Actually, let's add it to the existing loop function

// ==================== KEYBOARD SHORTCUTS ====================
document.addEventListener("keydown", (e) => {
  // Don't trigger shortcuts when typing in inputs
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  switch (e.key) {
    case "Escape":
      // Go back / close overlays
      if (!document.getElementById("calOverlay").classList.contains("hidden")) {
        document.getElementById("btnCancelCal").click();
      } else if (!document.getElementById("restOverlay").classList.contains("hidden")) {
        document.getElementById("btnSkipRest").click();
      }
      break;
    case " ":
    case "Enter":
      // Start/pause workout (when on splash)
      if (!splashView.classList.contains("hidden")) {
        e.preventDefault();
        startBtn.click();
      }
      break;
    case "h":
      // Toggle history
      if (!cameraView.classList.contains("hidden")) {
        document.getElementById("btnHistory").click();
      }
      break;
    case "s":
      // Toggle settings
      if (!cameraView.classList.contains("hidden")) {
        document.getElementById("btnSettings").click();
      }
      break;
    case "e":
      // End workout
      if (!cameraView.classList.contains("hidden")) {
        document.getElementById("btnEndWorkout").click();
      }
      break;
    case "m":
      // Toggle audio mute
      if (settingAudio) {
        settingAudio.checked = !settingAudio.checked;
        saveSettings();
        showToast(settingAudio.checked ? "Audio on" : "Audio off");
      }
      break;
  }
});

// ==================== PWA ====================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
