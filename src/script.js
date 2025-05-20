import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@mediapipe/pose";

console.log({ poseDetection });
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
parameters.count = 3000;
parameters.size = 0.02;
parameters.radius = 10;
parameters.randomness = 0.2;
parameters.randomnessPower = 3;
parameters.insideColor = "#ff6030";
parameters.outsideColor = "#1b3984";

let geometry = null;
let material = null;
let points = null;
let originalPositions = null;

/**
 * Mouse interactions
 */

// const mouse = new THREE.Vector2();
// let prevMouse = new THREE.Vector2();
// let mouseSpeed = 0;

// document.addEventListener("mousemove", (event) => {
//   const newMouse = new THREE.Vector2(
//     (event.clientX / window.innerWidth) * 2 - 1,
//     -(event.clientY / window.innerHeight) * 2 + 1
//   );

//   mouseSpeed = newMouse.distanceTo(prevMouse);
//   prevMouse.copy(newMouse);
//   mouse.copy(newMouse);
// });

const generateParticles = () => {
  // Destroy old galaxy
  if (points !== null) {
    geometry.dispose();
    material.dispose();
    scene.remove(points);
  }

  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(parameters.count * 3);
  originalPositions = new Float32Array(parameters.count * 3);
  const radius = 1.5;
  const colors = new Float32Array(parameters.count * 3);

  const colorInside = new THREE.Color(parameters.insideColor);
  const colorOutside = new THREE.Color(parameters.outsideColor);

  for (let i = 0; i < parameters.count; i++) {
    const i3 = i * 3;
    const phi = Math.acos(1 - 2 * Math.random());
    const theta = Math.random() * 2 * Math.PI;

    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);

    originalPositions[i3] = positions[i3];
    originalPositions[i3 + 1] = positions[i3 + 1];
    originalPositions[i3 + 2] = positions[i3 + 2];

    // Color
    const mixedColor = colorInside.clone();
    mixedColor.lerp(colorOutside, radius / parameters.radius);
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
document.addEventListener("click", () => {
  const video = document.getElementById("video");
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
});

/**
 * Animate
 */
setInterval(async () => {
  if (detector) {
    poses = await detector.estimatePoses(video, estimationConfig);
  }
}, 100); // run at 10 FPS

const clock = new THREE.Clock();

const tick = async () => {
  const elapsedTime = clock.getElapsedTime();

  if (poses && !video.paused && !video.ended) {
    if (poses.length > 0 && poses[0].keypoints3D) {
      const kps = poses[0].keypoints3D;

      // Update joints
      kps.forEach((kp, i) => {
        if (kp && kp.score > 0.4) {
          joints[i].visible = true;
          joints[i].position.set(kp.x, -kp.y, -kp.z); // Adjust y/z as needed
        } else {
          joints[i].visible = false;
        }
      });

      // Update bones
      edges.forEach((edge, idx) => {
        const [i1, i2] = edge;
        const kp1 = kps[i1];
        const kp2 = kps[i2];
        const arr = skeleton.geometry.attributes.position.array;
        if (kp1 && kp2 && kp1.score > 0.4 && kp2.score > 0.4) {
          arr.set([kp1.x, -kp1.y, -kp1.z, kp2.x, -kp2.y, -kp2.z], idx * 6);
        } else {
          arr.set([0, 0, 0, 0, 0, 0], idx * 6); // Hide if low confidence
        }
      });

      const p_pos = points.geometry.attributes.position.array;
      const maxDistortionForce = 1.5;
      const jointForceMultiplier = 0.05;
      // const speedMultiplier = 20;

      for (let i = 0; i < p_pos.length; i += 3) {
        let fx = 0;
        let fy = 0;

        // Influence from joints
        joints.forEach((joint) => {
          if (!joint.visible) return;

          const dx = p_pos[i] - joint.position.x;
          const dy = p_pos[i + 1] - joint.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 0.2) {
            const force = (1 - distance) * maxDistortionForce;
            fx += (dx / distance) * force;
            fy += (dy / distance) * force;
          }
        });

        // Influence from mouse
        // const dx = p_pos[i] - mouse.x * 5;
        // const dy = p_pos[i + 1] - mouse.y * 5;
        // const distance = Math.sqrt(dx * dx + dy * dy);
        // const distortionAmount =
        //   (1 - Math.min(distance, 1)) * maxDistortionForce * mouseSpeed * speedMultiplier;

        // if (distortionAmount > 0.06) {
        //   p_pos[i] += (dx / distance) * distortionAmount;
        //   p_pos[i + 1] += (dy / distance) * distortionAmount;
        // } else {
        //   p_pos[i] += (originalPositions[i] - p_pos[i]) * 0.05;
        //   p_pos[i + 1] += (originalPositions[i + 1] - p_pos[i + 1]) * 0.05;
        //   p_pos[i + 2] += (originalPositions[i + 2] - p_pos[i + 2]) * 0.05;
        // }

        // Apply joint force or restore to origin
        if (Math.abs(fx) > 0.001 || Math.abs(fy) > 0.001) {
          p_pos[i] += fx * jointForceMultiplier;
          p_pos[i + 1] += fy * jointForceMultiplier;
        } else {
          p_pos[i] += (originalPositions[i] - p_pos[i]) * 0.05;
          p_pos[i + 1] += (originalPositions[i + 1] - p_pos[i + 1]) * 0.05;
          p_pos[i + 2] += (originalPositions[i + 2] - p_pos[i + 2]) * 0.05;
        }
      }

      skeleton.geometry.attributes.position.needsUpdate = true;
      points.geometry.attributes.position.needsUpdate = true;
    }
  }

  // Update controls
  controls.update();

  // Render
  renderer.render(scene, camera);

  // Call tick again on the next frame
  window.requestAnimationFrame(tick);
};

tick();
