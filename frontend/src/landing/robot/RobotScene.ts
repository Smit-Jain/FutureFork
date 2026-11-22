import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildRobot, RobotRig } from './buildRobot';
import { FaceScreen } from './faceCanvas';
import { createMaterials, RobotMaterials } from './materials';

interface Pose {
  camX: number;
  camZ: number;
  camY: number;
  lookY: number;
  bodyYaw: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
}

// Scroll states, one per landing section: intro (p=0), how it works (p=1), forks (p=2), cases (p=3).
// camX < 0 shifts the robot right on desktop so the left text column never overlaps it (ignored on narrow screens).
const INTRO: Pose = { camX: -0.75, camZ: 11.6, camY: 1.1, lookY: 0.55, bodyYaw: -0.42, headYaw: -0.6, headPitch: 0.16, headRoll: 0.22 };
// Full body, pushed to the right third so the How It Works copy has the left half
const HOW: Pose = { camX: -2.6, camZ: 11.6, camY: 1.1, lookY: 0.55, bodyYaw: -0.55, headYaw: -0.35, headPitch: 0.08, headRoll: 0.08 };
const CLOSE: Pose = { camX: -0.95, camZ: 6.9, camY: 1.95, lookY: 1.72, bodyYaw: -0.2, headYaw: -0.06, headPitch: 0.04, headRoll: 0 };
const POSES = [INTRO, HOW, CLOSE, CLOSE];
const MAX_P = POSES.length - 1;
/** The face shows the quote mark once the cases section (the last one) is mostly in view. */
const QUOTE_FROM = MAX_P - 0.45;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function poseAt(p: number): Pose {
  const i = Math.min(MAX_P - 1, Math.floor(p));
  const t = easeInOutCubic(Math.min(1, Math.max(0, p - i)));
  const a = POSES[i];
  const b = POSES[i + 1];
  return {
    camX: lerp(a.camX, b.camX, t),
    camZ: lerp(a.camZ, b.camZ, t),
    camY: lerp(a.camY, b.camY, t),
    lookY: lerp(a.lookY, b.lookY, t),
    bodyYaw: lerp(a.bodyYaw, b.bodyYaw, t),
    headYaw: lerp(a.headYaw, b.headYaw, t),
    headPitch: lerp(a.headPitch, b.headPitch, t),
    headRoll: lerp(a.headRoll, b.headRoll, t),
  };
}

/** Throws if WebGL isn't available. */
export class RobotScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private envTarget: THREE.WebGLRenderTarget;
  private pmrem: THREE.PMREMGenerator;
  private materials: RobotMaterials;
  private face: FaceScreen;
  private rig: RobotRig;
  private frame = 0;
  private running = false;
  private start = performance.now();

  private targetP = 0;
  private p = 0;
  private targetPointer = new THREE.Vector2();
  private pointer = new THREE.Vector2();
  private readonly reduced: boolean;

  constructor(canvas: HTMLCanvasElement, reduced: boolean) {
    this.reduced = reduced;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment(this.renderer);
    this.envTarget = this.pmrem.fromScene(room, 0.04);
    room.dispose();
    this.scene.environment = this.envTarget.texture;
    // three r160: scale the environment through every material's envMapIntensity
    const envIntensity = 0.9;

    this.scene.add(new THREE.HemisphereLight('#fff6ee', '#d9d2c8', 0.7));
    const key = new THREE.DirectionalLight('#fff3e6', 1.7);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0005;
    const sc = key.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 5;
    sc.bottom = -4;
    sc.near = 0.5;
    sc.far = 20;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#fff0e6', 1.2);
    rim.position.set(4, 2, -4);
    this.scene.add(rim);
    const fill = new THREE.PointLight('#ff9a6a', 2.2, 6);
    fill.position.set(-3.2, 1.2, 0.6);
    this.scene.add(fill);

    this.face = new FaceScreen(!reduced);
    this.materials = createMaterials(this.face.texture);
    for (const m of [this.materials.shell, this.materials.shellLight, this.materials.dark, this.materials.deep,
      this.materials.pedestal, this.materials.ring, this.materials.screen, ...this.materials.leds]) {
      m.envMapIntensity = envIntensity;
    }
    this.rig = buildRobot(this.materials);
    this.scene.add(this.rig.root);

    this.resize();
    this.applyPose(poseAt(0), 0);
  }

  setScroll(p: number) {
    this.targetP = Math.min(MAX_P, Math.max(0, p));
    if (this.reduced) this.p = this.targetP;
  }

  setPointer(x: number, y: number) {
    if (this.reduced) return;
    this.targetPointer.set(x, y);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.running) this.render();
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.render();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stopLoop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  private applyPose(pose: Pose, t: number) {
    const narrow = window.innerWidth < 900 ? 1.25 : 1;
    const px = this.pointer.x;
    const py = this.pointer.y;

    const offsetX = narrow > 1 ? 0 : pose.camX;
    this.camera.position.set(offsetX + px * 0.25, pose.camY - py * 0.1, pose.camZ * narrow);
    this.camera.lookAt(offsetX, pose.lookY, 0);

    const idle = this.reduced ? 0 : 1;
    const { body, bob, head, shoulders, forearms } = this.rig;
    body.rotation.y = pose.bodyYaw + px * 0.12;
    bob.position.y = Math.sin(1.4 * t) * 0.02 * idle;
    head.rotation.set(
      pose.headPitch + py * 0.18 + Math.sin(0.9 * t) * 0.02 * idle,
      pose.headYaw + px * 0.45,
      pose.headRoll + Math.sin(0.7 * t) * 0.02 * idle,
      'YXZ',
    );
    shoulders.forEach((s, i) => {
      const side = i === 0 ? -1 : 1;
      s.rotation.x = Math.sin(1.4 * t + side) * 0.05 * idle;
      forearms[i].rotation.x = -0.35 + Math.sin(1.4 * t + side) * 0.06 * idle;
    });
  }

  private render() {
    const now = performance.now();
    const t = (now - this.start) / 1000;
    if (!this.reduced) {
      this.p += (this.targetP - this.p) * 0.08;
      this.pointer.lerp(this.targetPointer, 0.06);
    }
    this.applyPose(poseAt(this.p), t);
    this.face.setMode(this.p > QUOTE_FROM ? 'quote' : 'eyes');
    this.face.update(now);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stopLoop();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    const m = this.materials;
    [m.shell, m.shellLight, m.dark, m.deep, m.pedestal, m.ring, m.screen, ...m.leds].forEach((x) => x.dispose());
    m.textures.forEach((x) => x.dispose());
    this.face.dispose();
    this.envTarget.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
