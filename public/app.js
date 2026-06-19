/**
 * FormCheck — main app.
 * Views: splash → camera → history / settings / summary.
 * Camera: MediaPipe PoseLandmarker → PoseEngine → skeleton + rep counter + form feedback.
 */

import { PoseEngine } from "./pose.js";
import { WorkoutTracker } from "./tracker.js";
import { getExerciseList } from "./exercises.js";
import { getTutorial, getAllTutorials } from "./tutorial.js";
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
    });
    exercisePicker.appendChild(btn);
  });
}

buildExercisePicker();

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
async function startCamera() {
  showView("cameraView");

  // Start tracker session
  tracker.startSession(engine.exerciseId);

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
    return;
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
    return;
  }

  await new Promise((r) => {
    if (video.videoWidth) return r();
    video.onloadedmetadata = () => r();
  });

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  infCanvas.width = INF_W;
  infCanvas.height = Math.max(1, Math.round((INF_W * vh) / vw));

  running = true;
  setBadge("Loading…", "loading");
  loop();
}

function stopCamera() {
  running = false;
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
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
      } else {
        octx.clearRect(0, 0, w, h);
        setBadge("No pose detected", "loading");
        feedbackText.textContent = "Step into frame";
        feedbackDetail.textContent = "Stand 6-8 feet from camera, full body visible";
        feedbackPanel.className = "feedback-panel";
      }
    }
  } catch (e) {
    console.error("loop error:", e);
  }
  requestAnimationFrame(loop);
}

// ==================== BOTTOM CONTROLS ====================
document.getElementById("btnHistory").addEventListener("click", () => {
  stopCamera();
  renderHistory();
  showView("historyView");
});

document.getElementById("btnSettings").addEventListener("click", () => {
  stopCamera();
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
  showView("splashView");
  initSplash();
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
  showView("splashView");
  initSplash();
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
  showView("cameraView");
  // Restart camera loop
  if (video.srcObject) {
    running = true;
    loop();
  }
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

// ==================== PWA ====================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
