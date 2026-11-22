import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RobotMaterials } from './materials';

export interface RobotRig {
  root: THREE.Group;      // everything, including the pedestal
  body: THREE.Group;      // yaws with scroll and pointer
  bob: THREE.Group;       // idle bob
  head: THREE.Group;      // pivot at the neck
  shoulders: THREE.Group[]; // [left, right]
  forearms: THREE.Group[];  // [left, right]
}

const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
const box = (w: number, h: number, d: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
};
const sphere = (r: number, mat: THREE.Material) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), mat);
  m.castShadow = true;
  return m;
};
const cyl = (r: number, h: number, mat: THREE.Material, seg = 32) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.castShadow = true;
  return m;
};

function roundedRectPath(path: THREE.Path | THREE.Shape, w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

/** Remap UVs to the geometry's x/y bounds so a texture wraps the whole frame. */
function planarUVs(geo: THREE.BufferGeometry) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const w = bb.max.x - bb.min.x || 1;
  const h = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - bb.min.x) / w;
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / h;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function frame(outer: [number, number, number], inner: [number, number, number], depth: number, bevel: number, mat: THREE.Material) {
  const shape = roundedRectPath(new THREE.Shape(), ...outer) as THREE.Shape;
  shape.holes.push(roundedRectPath(new THREE.Path(), ...inner) as THREE.Path);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  });
  planarUVs(geo);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/** Deterministic pseudo-random so the circuit pattern is the same on every load. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function buildHead(mat: RobotMaterials): THREE.Group {
  const head = new THREE.Group();
  const c = 0.78; // head centre above the neck pivot

  const skull = rbox(1.5, 1.42, 1.3, 0.2, mat.shell);
  skull.position.y = c;
  head.add(skull);

  const back = rbox(1.28, 1.14, 0.9, 0.12, mat.dark);
  back.position.set(0, c - 0.02, -0.34);
  head.add(back);

  // ~26 tiny "circuit" bars over the back block and the back of the skull's top
  const rand = rng(7);
  for (let i = 0; i < 26; i++) {
    const onTop = i % 3 === 0;
    const horizontal = rand() > 0.5;
    const len = 0.08 + rand() * 0.26;
    const bar = box(horizontal ? len : 0.03, onTop ? 0.02 : horizontal ? 0.03 : len, onTop ? (horizontal ? 0.03 : len) : 0.02, mat.deep);
    if (onTop) {
      bar.position.set((rand() - 0.5) * 1.0, c + 0.715, -0.15 - rand() * 0.45);
    } else {
      bar.position.set((rand() - 0.5) * 1.05, c + (rand() - 0.5) * 0.9, -0.8);
    }
    head.add(bar);
  }

  const ring = frame([1.5, 1.44, 0.3], [1.08, 1.02, 0.2], 0.1, 0.03, mat.ring);
  ring.position.set(0, c, 0.6);
  head.add(ring);

  const bezel = frame([1.1, 1.04, 0.21], [0.95, 0.89, 0.15], 0.06, 0.01, mat.shellLight);
  bezel.position.set(0, c, 0.62);
  head.add(bezel);

  const screenShape = roundedRectPath(new THREE.Shape(), 0.9, 0.84, 0.14) as THREE.Shape;
  const screenGeo = new THREE.ShapeGeometry(screenShape, 24);
  planarUVs(screenGeo);
  const screen = new THREE.Mesh(screenGeo, mat.screen);
  screen.position.set(0, c, 0.66);
  head.add(screen);

  // Ears with caps
  for (const s of [-1, 1]) {
    const ear = cyl(0.22, 0.14, mat.shellLight);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(s * 0.81, c, 0);
    head.add(ear);
    const cap = cyl(0.13, 0.06, mat.dark);
    cap.rotation.z = Math.PI / 2;
    cap.position.set(s * 0.9, c, 0);
    head.add(cap);
  }
  // Cable looping down from the right ear
  const cable = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 12, 40, Math.PI), mat.dark);
  cable.castShadow = true;
  cable.rotation.set(0, Math.PI / 2, Math.PI);
  cable.position.set(0.92, c - 0.02, -0.32);
  head.add(cable);

  return head;
}

function buildArm(side: -1 | 1, mat: RobotMaterials) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.72, 0.66, 0);
  shoulder.rotation.z = side * 0.16;

  shoulder.add(sphere(0.15, mat.dark));
  const upper = rbox(0.26, 0.5, 0.3, 0.1, mat.shell);
  upper.position.y = -0.32;
  shoulder.add(upper);
  const elbow = sphere(0.11, mat.dark);
  elbow.position.y = -0.6;
  shoulder.add(elbow);

  const forearm = new THREE.Group();
  forearm.position.y = -0.6;
  forearm.rotation.x = -0.35;
  const hand = rbox(0.28, 0.34, 0.3, 0.09, mat.shellLight);
  hand.position.y = -0.27;
  forearm.add(hand);
  const thumb = rbox(0.08, 0.15, 0.1, 0.035, mat.shellLight);
  thumb.position.set(-side * 0.16, -0.22, 0.04);
  forearm.add(thumb);
  shoulder.add(forearm);

  return { shoulder, forearm };
}

export function buildRobot(mat: RobotMaterials): RobotRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const bob = new THREE.Group();
  body.add(bob);
  root.add(body);

  // Pedestal (static, receives shadows)
  const pedestal = box(1.7, 1.6, 1.7, mat.pedestal);
  pedestal.position.y = -2.22;
  pedestal.receiveShadow = true;
  pedestal.castShadow = false;
  root.add(pedestal);

  // Legs
  for (const s of [-1, 1]) {
    const foot = rbox(0.42, 0.18, 0.56, 0.07, mat.shellLight);
    foot.position.set(s * 0.27, -1.33, 0.05);
    bob.add(foot);
    const ankle = cyl(0.1, 0.12, mat.dark);
    ankle.position.set(s * 0.27, -1.18, 0);
    bob.add(ankle);
    const leg = rbox(0.36, 0.62, 0.42, 0.12, mat.shell);
    leg.position.set(s * 0.27, -0.85, 0);
    bob.add(leg);
    const hip = sphere(0.14, mat.dark);
    hip.position.set(s * 0.27, -0.46, 0);
    bob.add(hip);
  }

  const pelvis = rbox(0.9, 0.22, 0.7, 0.08, mat.dark);
  pelvis.position.y = -0.36;
  bob.add(pelvis);

  // Torso
  const torso = rbox(1.22, 1.12, 0.92, 0.24, mat.shell);
  torso.position.y = 0.3;
  bob.add(torso);
  const chestTop = rbox(1.08, 0.16, 0.84, 0.07, mat.shellLight);
  chestTop.position.y = 0.84;
  bob.add(chestTop);

  mat.leds.forEach((m, i) => {
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), m);
    led.position.set((i - 1) * 0.16, 0.5, 0.462);
    bob.add(led);
  });
  for (const s of [-1, 1]) {
    const slot = box(0.07, 0.32, 0.02, mat.dark);
    slot.position.set(s * 0.3, 0.08, 0.462);
    bob.add(slot);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 10, 20, Math.PI), mat.dark);
    lip.position.set(s * 0.3, 0.27, 0.465);
    bob.add(lip);
  }

  const neck = cyl(0.16, 0.26, mat.dark);
  neck.position.y = 0.98;
  bob.add(neck);

  const head = buildHead(mat);
  head.position.y = 1.05;
  bob.add(head);

  const left = buildArm(-1, mat);
  const right = buildArm(1, mat);
  bob.add(left.shoulder, right.shoulder);

  return {
    root,
    body,
    bob,
    head,
    shoulders: [left.shoulder, right.shoulder],
    forearms: [left.forearm, right.forearm],
  };
}
