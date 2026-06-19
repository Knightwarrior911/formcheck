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
import { say, sayRep, sayFeedback } from "./audio.js";

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

// ==================== VIEW MANAGEMENT ====================
function showView(viewId) {
  [splashView, cameraView, historyView, settingsView, summaryView].forEach(
    (v) => v.classList.add("hidden")
  );
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
      splashStreak.textContent = `🔥 ${streak} day streak! Keep it going!`;
    } else {
      splashStreak.textContent = "Start a workout today to begin your streak!";
    }
    buildProgramPicker();
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
  const levelBtn = document.querySelector(
    "#onboardingStep1 .level-btn.active"
  );
  const level = levelBtn ? levelBtn.dataset.level : "intermediate";
  tracker.setProfile({ name, level });
  startCamera();
});

startBtn.addEventListener("click", startCamera);

// ==================== EXERCISE PICKER ====================
function buildExercisePicker() {
  const exercises = getExerciseList();
  exercisePicker.innerHTML = "";
  exercises.forEach((ex) => {
    const btn = document.createElement("button");
    btn.className = "exercise-btn" + (ex.id === engine.exerciseId ? " active" : "");
    btn.dataset.exercise = ex.id;
    btn.textContent = ex.name;
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".exercise-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      engine.setExercise(ex.id);
      repCount.textContent = "0";
      showToast(`Exercise: ${ex.name}`);

      // Set up UI for rep vs hold exercise
      const exerciseData = EXERCISES.find((e) => e.id === ex.id);
      isHoldExercise = exerciseData && exerciseData.type === "hold";
      if (isHoldExercise) {
        repDisplay.classList.add("hidden");
        holdTimer.classList.remove("hidden");
        holdTarget.textContent = (exerciseData.holdTargetSeconds || 60) + "s";
        holdStartTime = 0;
        holdGoodFrames = 0;
        lastHoldSecond = 0;
        repLabel.textContent = "hold";
      } else {
        repDisplay.classList.remove("hidden");
        holdTimer.classList.add("hidden");
        repLabel.textContent = "reps";
      }
    });
    exercisePicker.appendChild(btn);
  });
}

buildExercisePicker();

// ==================== WORKOUT PROGRAMS ====================
let currentProgram = null;
let currentProgramIndex = 0;
let restInterval = null;

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
    holdTarget.textContent = (exerciseData.holdTargetSeconds || ex.targetReps || 60) + "s";
    holdStartTime = 0;
    holdGoodFrames = 0;
    lastHoldSecond = 0;
    repLabel.textContent = "hold";
  } else {
    repDisplay.classList.remove("hidden");
    holdTimer.classList.add("hidden");
    repLabel.textContent = "reps";
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

  restInterval = setInterval(() => {
    remaining--;
    timer.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(restInterval);
      overlay.classList.add("hidden");
      startProgramExercise();
    }
  }, 1000);
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
    // Not the last exercise — advance
    if (restInterval) {
      clearInterval(restInterval);
      document.getElementById("restOverlay").classList.add("hidden");
    }
    advanceProgram();
  } else {
    // Last exercise or no program — end workout
    if (restInterval) {
      clearInterval(restInterval);
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
});

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
  repCount.textContent = count;
  repCount.style.transform = "scale(1.4)";
  setTimeout(() => (repCount.style.transform = "scale(1)"), 200);

  const settings = tracker.getSettings();
  if (settings.audioEnabled) sayRep(count);

  // Record rep in tracker
  const currentFeedback = engine._lastFeedback || [];
  const hasError = currentFeedback.some((f) => f.severity === "bad");
  tracker.recordRep(hasError ? "bad" : "good");
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
  feedbackText.textContent = top.msg;
  feedbackDetail.textContent = feedback.length > 1 ? feedback[1].msg : "";
  feedbackPanel.className = "feedback-panel " + top.severity;

  const settings = tracker.getSettings();
  if (settings.audioEnabled) sayFeedback(top.severity, top.msg);
});

engine.onAngles((angles, state) => {
  debugState.textContent = `State: ${state}`;
  const lines = Object.entries(angles).map(
    ([k, v]) => `${k}: ${v != null ? Math.round(v) + "°" : "N/A"}`
  );
  debugAngles.textContent = lines.join(" | ");
});

// ==================== CAMERA ====================
let cameraInitialized = false;

async function initCamera() {
  if (cameraInitialized && video.srcObject) return true;

  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate, modelUrl) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        numPoses: 1,
        runningMode: "VIDEO",
        minPoseDetectionConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });

    try {
      poseLandmarker = await make("GPU", POSE_MODEL_URL);
    } catch {
      try {
        poseLandmarker = await make("CPU", POSE_MODEL_URL);
      } catch {
        try {
          poseLandmarker = await make("GPU", POSE_MODEL_LITE_URL);
        } catch {
          poseLandmarker = await make("CPU", POSE_MODEL_LITE_URL);
        }
      }
    }
  } catch (err) {
    console.error(err);
    showToast("Failed to load pose model. Check internet.", { error: true });
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error(err);
    showToast("Camera permission denied.", { error: true });
    return false;
  }

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
}

async function startCamera() {
  showView("cameraView");
  tracker.startSession(engine.exerciseId);

  const ok = await initCamera();
  if (!ok) return;

  running = true;
  setBadge("Loading…", "loading");
  loop();
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
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  cameraInitialized = false;
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

      const settings = tracker.getSettings();

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
                const settings = tracker.getSettings();
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
      } else {
        octx.clearRect(0, 0, w, h);
        setBadge("No pose detected", "loading");
        feedbackText.textContent = "Step into frame";
        feedbackDetail.textContent = "Stand 6-8 feet from camera, full body visible";
        feedbackPanel.className = "feedback-panel";
        // Reset hold timer when no pose
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

document.getElementById("btnEndWorkout").addEventListener("click", () => {
  const session = tracker.endSession();
  stopCamera();
  if (session) {
    renderSummary(session);
    showView("summaryView");
  } else {
    showView("splashView");
    initSplash();
  }
});

// ==================== HISTORY ====================
function renderHistory() {
  const sessions = tracker.getSessions();
  document.getElementById("statSessions").textContent = tracker.getTotalSessions();
  document.getElementById("statReps").textContent = tracker.getTotalReps();
  document.getElementById("statStreak").textContent = tracker.getStreak();
  document.getElementById("statForm").textContent = tracker.getAverageFormScore() + "%";

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
            <div class="session-meta">${s.date} · ${s.durationMin}min · ~${tracker.estimateCalories(s.exerciseId, s.reps)} cal</div>
          </div>
          <div class="session-stats">
            <div class="session-reps">${s.reps} reps</div>
            <div class="session-form ${formClass}">${s.formScore || —}% form</div>
          </div>
        </div>
      `;
    })
    .join("");
}

document.getElementById("historyBack").addEventListener("click", () => {
  resumeCamera();
});

// ==================== SETTINGS ====================
function renderSettings() {
  const profile = tracker.getProfile();
  const settings = tracker.getSettings();
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

function saveSettings() {
  const levelBtn = document.querySelector("#settingsView .level-btn.active");
  tracker.setProfile({
    name: settingsName.value.trim(),
    level: levelBtn ? levelBtn.dataset.level : "intermediate",
  });
  tracker.setSettings({
    audioEnabled: settingAudio.checked,
    showSkeleton: settingSkeleton.checked,
    showAngles: settingAngles.checked,
    restTimerSeconds: parseInt(settingRestTimer.value) || 60,
  });
  showToast("Settings saved ✓");
}

settingsName.addEventListener("change", saveSettings);
settingAudio.addEventListener("change", saveSettings);
settingSkeleton.addEventListener("change", saveSettings);
settingAngles.addEventListener("change", saveSettings);
settingRestTimer.addEventListener("change", saveSettings);

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

// Long-press on exercise button opens tutorial
let longPressTimer;
exercisePicker.addEventListener("mousedown", (e) => {
  const btn = e.target.closest(".exercise-btn");
  if (!btn) return;
  longPressTimer = setTimeout(() => {
    renderTutorial(btn.dataset.exercise);
  }, 600);
});
exercisePicker.addEventListener("mouseup", () => clearTimeout(longPressTimer));
exercisePicker.addEventListener("mouseleave", () => clearTimeout(longPressTimer));

document.getElementById("tutorialBack").addEventListener("click", () => {
  resumeCamera();
});

// ==================== SUMMARY ====================
function renderSummary(session) {
  const ex = getExerciseList().find((e) => e.id === session.exerciseId);
  const cal = tracker.estimateCalories(session.exerciseId, session.reps);
  const pb = tracker.getPersonalBest(session.exerciseId);
  const isPB = session.reps >= pb && session.reps > 0;

  document.getElementById("summaryStats").innerHTML = `
    <div class="summary-stat">
      <div class="summary-stat-value">${ex ? ex.name : session.exerciseId}</div>
      <div class="summary-stat-label">Exercise</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value">${session.reps}</div>
      <div class="summary-stat-label">Reps</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value">${session.formScore || 0}%</div>
      <div class="summary-stat-label">Form Score</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-value">~${cal}</div>
      <div class="summary-stat-label">Est. Calories</div>
    </div>
    ${isPB ? `<div class="summary-stat" style="grid-column:span 2"><div class="summary-stat-value" style="color:var(--warn)">🏆 Personal Best!</div><div class="summary-stat-label">New record: ${session.reps} reps</div></div>` : ""}
    <div class="summary-stat" style="grid-column:span 2">
      <div class="summary-stat-value">${Math.round(session.duration / 60000 * 10) / 10}min</div>
      <div class="summary-stat-label">Duration</div>
    </div>
  `;
}

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

document.getElementById("btnCreateProgram")?.addEventListener("click", () => openBuilder());

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

document.getElementById("btnCalendar")?.addEventListener("click", () => {
  calMonth = new Date().getMonth();
  calYear = new Date().getFullYear();
  renderCalendar();
  showView("calendarView");
});

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

// ==================== PWA ====================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
