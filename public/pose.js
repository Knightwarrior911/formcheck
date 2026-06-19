/**
 * Pose tracking engine.
 * MediaPipe PoseLandmarker → 33 landmarks → angle calc → exercise state machine → rep counter + form feedback.
 */

import { getExercise } from "./exercises.js";
import { PointFilter } from "./filters.js";

// ---- Angle math ----
function angle3pt(a, b, c) {
  const rad = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let deg = Math.abs((rad * 180) / Math.PI);
  return deg > 180 ? 360 - deg : deg;
}

// ---- Skeleton connections for drawing ----
const POSE_CONNECTIONS = [
  // Torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15],
  // Right arm
  [12, 14], [14, 16],
  // Left leg
  [23, 25], [25, 27],
  // Right leg
  [24, 26], [26, 28],
  // Shoulders to nose
  [11, 0], [12, 0],
];

// Minimum visibility threshold for a landmark to be considered valid
const MIN_VISIBILITY = 0.5;

export class PoseEngine {
  constructor() {
    this.exerciseId = "squat";
    this.exercise = getExercise("squat");
    this.state = "standing";
    this.reps = 0;
    this.filters = {};
    this.lastRepTime = 0;
    this.repCooldown = 1500; // ms between reps — 1.5s minimum
    this.feedbackCb = null;
    this.repCb = null;
    this.angleCb = null;
    this._frameCount = 0; // for throttled debug logging
  }

  setExercise(id) {
    this.exerciseId = id;
    this.exercise = getExercise(id);
    this.state = this.exercise.states[0].name;
    this.reps = 0;
    this.lastRepTime = 0;
    this.filters = {}; // reset filters on exercise change
  }

  onFeedback(cb) { this.feedbackCb = cb; }
  onRep(cb) { this.repCb = cb; }
  onAngles(cb) { this.angleCb = cb; }

  ensureFilters(landmarkIndices) {
    for (const idx of landmarkIndices) {
      if (!this.filters[idx]) {
        this.filters[idx] = {
          x: new PointFilter({ minCutoff: 1.0, beta: 0.04, dCutoff: 1.0 }),
          y: new PointFilter({ minCutoff: 1.0, beta: 0.04, dCutoff: 1.0 }),
        };
      }
    }
  }

  filterLandmark(idx, pt, now) {
    this.ensureFilters([idx]);
    return {
      x: this.filters[idx].x.filter(pt.x, now),
      y: this.filters[idx].y.filter(pt.y, now),
    };
  }

  // Check if all required landmarks are visible enough
  landmarksValid(landmarks) {
    for (const [name, [a, b, c]] of Object.entries(this.exercise.joints)) {
      if (!landmarks[a] || !landmarks[b]) return false;
      if (landmarks[a].visibility < MIN_VISIBILITY) return false;
      if (landmarks[b].visibility < MIN_VISIBILITY) return false;
      if (c !== b && landmarks[c] && landmarks[c].visibility < MIN_VISIBILITY) return false;
    }
    return true;
  }

  calcAngles(landmarks, now) {
    const angles = {};
    for (const [name, [a, b, c]] of Object.entries(this.exercise.joints)) {
      if (!landmarks[a] || !landmarks[b]) {
        angles[name] = null;
        continue;
      }
      if (c === b) {
        const pa = this.filterLandmark(a, landmarks[a], now);
        const pb = this.filterLandmark(b, landmarks[b], now);
        const vertical = { x: pb.x, y: pb.y - 0.1 };
        angles[name] = angle3pt(pa, pb, vertical);
      } else {
        const pa = this.filterLandmark(a, landmarks[a], now);
        const pb = this.filterLandmark(b, landmarks[b], now);
        const pc = landmarks[c] ? this.filterLandmark(c, landmarks[c], now) : { x: pb.x, y: pb.y - 0.1 };
        angles[name] = angle3pt(pa, pb, pc);
      }
    }
    return angles;
  }

  updateState(angles) {
    // Check states in reverse order (most specific first)
    const states = [...this.exercise.states].reverse();
    for (const s of states) {
      if (s.detect(angles)) {
        const prev = this.state;
        this.state = s.name;

        // Track which states we've passed through this cycle
        if (!this._visitedStates) this._visitedStates = new Set();
        this._visitedStates.add(this.state);

        // Check rep transition — require full cycle
        const t = this.exercise.repTransition;
        if (t && prev === t.from && this.state === t.to) {
          const now = performance.now();
          if (now - this.lastRepTime > this.repCooldown) {
            // For rep-counting exercises, verify we passed through enough states
            // (at least 3 distinct states = went down and came back up)
            const isHoldExercise = !t; // plank etc have no transition
            if (!isHoldExercise && this._visitedStates.size >= 3) {
              this.reps++;
              this.lastRepTime = now;
              if (this.repCb) this.repCb(this.reps);
              console.log(`[FormCheck] Rep ${this.reps} counted! (${this.exercise.name})`);
            }
          }
          // Reset visited states for next rep
          this._visitedStates = new Set([this.state]);
        }
        break;
      }
    }
    return this.state;
  }

  checkForm(angles, state) {
    const results = [];
    for (const rule of this.exercise.rules) {
      const r = rule.check(angles, state);
      if (r) results.push(r);
    }
    return results;
  }

  process(landmarks, now) {
    this._frameCount++;

    // Validate landmarks first
    if (!this.landmarksValid(landmarks)) {
      if (this._frameCount % 30 === 0) {
        console.log("[FormCheck] Landmarks not visible enough — step back from camera");
      }
      return { angles: {}, state: this.state, feedback: [] };
    }

    const angles = this.calcAngles(landmarks, now);
    const state = this.updateState(angles);
    const feedback = this.checkForm(angles, state);

    // Throttled debug: log angles every 60 frames (~2 sec at 30fps)
    if (this._frameCount % 60 === 0) {
      const angleStr = Object.entries(angles)
        .map(([k, v]) => `${k}=${v != null ? Math.round(v) : 'N/A'}°`)
        .join(', ');
      console.log(`[FormCheck] state=${state} | ${angleStr} | reps=${this.reps}`);
    }

    if (this.angleCb) this.angleCb(angles, state);
    if (this.feedbackCb) this.feedbackCb(feedback, state);

    return { angles, state, feedback };
  }

  drawSkeleton(ctx, landmarks, w, h) {
    ctx.clearRect(0, 0, w, h);

    // Draw connections
    ctx.strokeStyle = "rgba(91, 140, 255, 0.6)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const [a, b] of POSE_CONNECTIONS) {
      if (landmarks[a] && landmarks[b]) {
        if (landmarks[a].visibility < MIN_VISIBILITY || landmarks[b].visibility < MIN_VISIBILITY) continue;
        const pa = landmarks[a];
        const pb = landmarks[b];
        ctx.beginPath();
        ctx.moveTo((1 - pa.x) * w, pa.y * h);
        ctx.lineTo((1 - pb.x) * w, pb.y * h);
        ctx.stroke();
      }
    }

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (lm.visibility && lm.visibility < MIN_VISIBILITY) continue;
      ctx.beginPath();
      ctx.arc((1 - lm.x) * w, lm.y * h, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#5b8cff";
      ctx.fill();
    }
  }

  drawAngles(ctx, landmarks, angles, w, h) {
    for (const [name, [a, b, c]] of Object.entries(this.exercise.joints)) {
      if (!landmarks[b] || landmarks[b].visibility < MIN_VISIBILITY) continue;
      const pb = landmarks[b];
      const px = (1 - pb.x) * w;
      const py = pb.y * h;
      const val = angles[name];
      if (val == null) continue;

      let color = "#4ade80";
      if (name.includes("knee") || name.includes("elbow") || name.includes("front_knee")) {
        if (val < 60 || val > 150) color = "#ff4d4d";
        else if (val < 90 || val > 130) color = "#ffd633";
      } else if (name === "hip") {
        if (val < 60) color = "#ff4d4d";
        else if (val < 90) color = "#ffd633";
      }

      ctx.beginPath();
      ctx.arc(px, py, 20, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(Math.round(val) + "°", px, py);
    }
  }
}
