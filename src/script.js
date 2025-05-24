import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@mediapipe/pose";
import { OneEuroFilter } from "1eurofilter";

console.log({ poseDetection });
console.log({ OneEuroFilter });
/**
 * Base
 */
// Debug
const gui = new GUI({ width: 300 });

// Canvas
const canvas = document.querySelector("canvas.webgl");

// Scene
const scene = new THREE.Scene();

// Detector with model MoveNet and MediaPipe runtime
const model = poseDetection.SupportedModels.BlazePose;
const detectorConfig = {
  runtime: "mediapipe", // or 'tfjs'
  modelType: "full",
  solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/pose", // required!
};

const detector = await poseDetection.createDetector(model, detectorConfig);
const video = document.getElementById("video");
const estimationConfig = { enableSmoothing: true };

let poses = null;

const joints = [];
const jointGeometry = new THREE.SphereGeometry(0.02);
const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff });

for (let i = 0; i < 33; i++) {
  const sphere = new THREE.Mesh(jointGeometry, jointMaterial);
  scene.add(sphere);
  joints.push(sphere);
}

const edges = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 12],
  [12, 24],
  [11, 23],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

/**
 * One Euro Filter
 */
const NUM_KEYPOINTS = 33;
const CONFIDENCE_THRESHOLD = 0.2; // Your existing threshold
const MAX_FRAMES_TO_HOLD = 5; // Grace period: e.g., 5 frames. Tune this value!

// Parameters for OneEuroFilter: minCutoff, beta (speed coefficient)
// You'll need to tune these!
const videoFrameRate = 60; // An estimate of your video/detection rate
const frequency = 10; //120; // Hz, estimated signal frequency
const filterMinCutoff = 1.0; // Lower for more smoothing, higher for less lag
const filterBeta = 0.1; // Higher for more smoothing of high-speed motion
const filterDerivCutoff = 1.0; /// videoFrameRate; // Cutoff for derivative, default is 1.0

const keypointStates = [];
for (let i = 0; i < NUM_KEYPOINTS; i++) {
  keypointStates.push({
    filterX: new OneEuroFilter(frequency, filterMinCutoff, filterBeta, filterDerivCutoff),
    filterY: new OneEuroFilter(frequency, filterMinCutoff, filterBeta, filterDerivCutoff),
    filterZ: new OneEuroFilter(frequency, filterMinCutoff, filterBeta, filterDerivCutoff),
    lastFilteredPosition: new THREE.Vector3(), // Stores the most recent filtered output
    // For temporal consistency
    framesSinceLastGoodDetection: 0, // Counter for low-confidence frames
    hadRecentGoodDetection: false, // Was it good recently within the hold window?
    isVisibleForRender: false, // Final decision: render this keypoint this frame?
  });
}

/**
 * Skeleton
 */
const boneMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff });
const boneGeometry = new THREE.BufferGeometry();
const bonePositions = new Float32Array(edges.length * 6); // 2 points per edge
boneGeometry.setAttribute("position", new THREE.BufferAttribute(bonePositions, 3));
const skeleton = new THREE.LineSegments(boneGeometry, boneMaterial);
scene.add(skeleton);

/**
 * Particle system
 */
const parameters = {};
parameters.count = 10000;
parameters.size = 0.02;
parameters.radius = 3;
parameters.distance = 1.3;
parameters.maxDistortionForce = 1;
parameters.jointForceMultiplier = 0.2;
parameters.particleReturnStrength = 0.01;

parameters.randomness = 0.2;
parameters.randomnessPower = 3;
parameters.insideColor = "#ff6030";
parameters.outsideColor = "#1b3984";
parameters.restartVideo = () => {
  const video = document.getElementById("video");
  video.currentTime = 0;
  video.play();
  lastDetectionTime = 0; // Good, you have this

  // Reset keypoint states and filters
  for (let i = 0; i < NUM_KEYPOINTS; i++) {
    keypointStates[i].filterX.reset(); // Assuming 1eurofilter has a .reset() or re-instantiate
    keypointStates[i].filterY.reset();
    keypointStates[i].filterZ.reset();
    keypointStates[i].lastFilteredPosition.set(0, 0, 0); // Or some initial sensible value
    keypointStates[i].framesSinceLastGoodDetection = 0;
    keypointStates[i].hadRecentGoodDetection = false;
    keypointStates[i].isVisibleForRender = false;
  }

  if (poses) poses = null; // Clear last known poses
};

let geometry = null;
let material = null;
let points = null;
let originalPositions = null;

const generateParticles = () => {
  // Destroy old particles
  if (points !== null) {
    geometry.dispose();
    material.dispose();
    scene.remove(points);
  }

  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(parameters.count * 3);
  originalPositions = new Float32Array(parameters.count * 3);
  const colors = new Float32Array(parameters.count * 3);

  const colorInside = new THREE.Color(parameters.insideColor);
  const colorOutside = new THREE.Color(parameters.outsideColor);

  for (let i = 0; i < parameters.count; i++) {
    const i3 = i * 3;
    const phi = Math.acos(1 - 2 * Math.random());
    const theta = Math.random() * 2 * Math.PI;
    const r = Math.random() * parameters.radius;

    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = r * Math.cos(phi);

    originalPositions[i3] = positions[i3];
    originalPositions[i3 + 1] = positions[i3 + 1];
    originalPositions[i3 + 2] = positions[i3 + 2];

    // Color
    const mixedColor = colorInside.clone();
    mixedColor.lerp(colorOutside, 0, parameters.radius);
    colors[i3 + 0] = mixedColor.r;
    colors[i3 + 1] = mixedColor.g;
    colors[i3 + 2] = mixedColor.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  material = new THREE.PointsMaterial({
    size: parameters.size,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });

  points = new THREE.Points(geometry, material);
  scene.add(points);
};
generateParticles();

// Tweaks
gui
  .add(parameters, "count")
  .min(1000)
  .max(100000)
  .step(100)
  .onFinishChange(generateParticles);
gui
  .add(parameters, "size")
  .min(0.001)
  .max(0.1)
  .step(0.001)
  .onFinishChange(generateParticles);

gui.add(parameters, "radius").min(1).max(20).step(0.1).onFinishChange(generateParticles);
gui.add(parameters, "distance").min(0).max(5).step(0.1).onFinishChange(generateParticles);
gui
  .add(parameters, "maxDistortionForce")
  .min(0)
  .max(5)
  .step(0.1)
  .onFinishChange(generateParticles);
gui
  .add(parameters, "jointForceMultiplier")
  .min(0)
  .max(3)
  .step(0.01)
  .onFinishChange(generateParticles);
gui
  .add(parameters, "particleReturnStrength")
  .min(0)
  .max(0.02)
  .step(0.001)
  .onFinishChange(generateParticles);
gui
  .add(parameters, "randomness")
  .min(0)
  .max(1)
  .step(0.001)
  .onFinishChange(generateParticles);
gui
  .add(parameters, "randomnessPower")
  .min(1)
  .max(10)
  .step(0.001)
  .onFinishChange(generateParticles);
gui.addColor(parameters, "insideColor").onFinishChange(generateParticles);
gui.addColor(parameters, "outsideColor").onFinishChange(generateParticles);
gui.add(parameters, "restartVideo").name("Restart Video");

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100);
camera.position.x = 1;
camera.position.y = 1;
camera.position.z = 1;
scene.add(camera);

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

/**
 * Video
 */
document.addEventListener("dblclick", () => {
  const video = document.getElementById("video");
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
});
video.addEventListener("timeupdate", () => {
  if (video.currentTime >= 40) {
    video.pause();
    video.currentTime = 40; // optional: clamp exactly to 40s
  }
});

/**
 * Animate
 */

const clock = new THREE.Clock();
const detectionInterval = 100; // ms, for 10 FPS
let lastDetectionTime = 0;

const tick = async () => {
  const elapsedTime = clock.getElapsedTime();
  const timestamp = video.currentTime; // More accurate for video frame content than elapsedTime for filter

  const cond = detector && timestamp - lastDetectionTime > detectionInterval / 1000;

  if (cond && !video.paused && !video.ended) {
    lastDetectionTime = timestamp;
    poses = await detector.estimatePoses(video, estimationConfig);
  }

  if (poses && poses.length > 0 && poses[0].keypoints3D) {
    const kps = poses[0].keypoints3D;

    // Update joints
    kps.forEach((kp, i) => {
      const state = keypointStates[i];

      if (kp && kp.score > CONFIDENCE_THRESHOLD) {
        // Good detection!
        // Update filters with new raw data
        // Remember MediaPipe's Y is often inverted for typical 3D viewing

        state.lastFilteredPosition.x = state.filterX.filter(kp.x, timestamp);
        state.lastFilteredPosition.y = state.filterY.filter(-kp.y, timestamp);
        state.lastFilteredPosition.z = state.filterZ.filter(-kp.z, timestamp);

        state.framesSinceLastGoodDetection = 0;
        state.hadRecentGoodDetection = true;
        state.isVisibleForRender = true;
      } else {
        // Low confidence or no detection for this keypoint
        state.framesSinceLastGoodDetection++;

        if (
          state.framesSinceLastGoodDetection <= MAX_FRAMES_TO_HOLD &&
          state.hadRecentGoodDetection
        ) {
          // Within grace period AND it was recently good: Hold the last filtered position.
          // The filter itself is not updated with new (bad) data, so lastFilteredPosition
          // still holds the value from the last good update.
          state.isVisibleForRender = true;
        } else {
          // Grace period expired or it was never good recently
          state.isVisibleForRender = false;
          state.hadRecentGoodDetection = false; // Ensure this is reset
        }
      }

      // Update the Three.js joint object
      joints[i].visible = state.isVisibleForRender;
      if (state.isVisibleForRender) {
        joints[i].position.copy(state.lastFilteredPosition);
      }
    });

    // Update bones based on the new isVisibleForRender status
    const bonePositions = skeleton.geometry.attributes.position.array;
    edges.forEach((edge, idx) => {
      const [idx1, idx2] = edge;
      const state1 = keypointStates[idx1];
      const state2 = keypointStates[idx2];

      if (state1.isVisibleForRender && state2.isVisibleForRender) {
        bonePositions.set(
          [
            state1.lastFilteredPosition.x,
            state1.lastFilteredPosition.y,
            state1.lastFilteredPosition.z,
            state2.lastFilteredPosition.x,
            state2.lastFilteredPosition.y,
            state2.lastFilteredPosition.z,
          ],
          idx * 6
        );
      } else {
        // Hide the bone if either connected joint is not rendered
        bonePositions.set([0, 0, 0, 0, 0, 0], idx * 6); // Or set to NaN, or manage visibility differently
      }
    });
    skeleton.geometry.attributes.position.needsUpdate = true;

    const p_pos = points.geometry.attributes.position.array;

    for (let i = 0; i < p_pos.length; i += 3) {
      let fx = 0;
      let fy = 0;
      let fz = 0;

      // Influence from joints
      joints.forEach((joint) => {
        if (!joint.visible) return;

        const dx = p_pos[i] - joint.position.x;
        const dy = p_pos[i + 1] - joint.position.y;
        const dz = p_pos[i + 2] - joint.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < parameters.distance) {
          const force = (1 - distance) * parameters.maxDistortionForce;
          fx += (dx / distance) * force;
          fy += (dy / distance) * force;
          fz += (dz / distance) * force;
        }
      });

      // Apply joint force or restore to origin
      if (Math.abs(fx) > 0.001 || Math.abs(fy) > 0.001 || Math.abs(fz) > 0.001) {
        p_pos[i] += fx * parameters.jointForceMultiplier;
        p_pos[i + 1] += fy * parameters.jointForceMultiplier;
        p_pos[i + 2] += fz * parameters.jointForceMultiplier;
      } else {
        p_pos[i] += (originalPositions[i] - p_pos[i]) * parameters.particleReturnStrength;
        p_pos[i + 1] +=
          (originalPositions[i + 1] - p_pos[i + 1]) * parameters.particleReturnStrength;
        p_pos[i + 2] +=
          (originalPositions[i + 2] - p_pos[i + 2]) * parameters.particleReturnStrength;
      }
    }

    skeleton.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.position.needsUpdate = true;
  } else if (
    poses &&
    poses.length === 0 &&
    keypointStates.some((s) => s.isVisibleForRender)
  ) {
    // No person detected at all, hide all keypoints if any were visible
    keypointStates.forEach((state) => {
      state.isVisibleForRender = false;
      state.hadRecentGoodDetection = false; // Reset tracking
    });

    joints.forEach((joint) => (joint.visible = false));
    const bonePositions = skeleton.geometry.attributes.position.array;
    for (let i = 0; i < bonePositions.length; i++) {
      // A way to clear all bones
      bonePositions[i] = 0;
    }
    skeleton.geometry.attributes.position.needsUpdate = true;
  }

  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
