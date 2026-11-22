import * as THREE from 'three';

/** Pink → coral → orange → amber → orange → coral → pink, as a 512px conic gradient. */
function ringTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const stops: [number, string][] = [
    [0, '#ff3d8b'],
    [1 / 6, '#ff5a5f'],
    [2 / 6, '#ff8a3d'],
    [3 / 6, '#ffb347'],
    [4 / 6, '#ff8a3d'],
    [5 / 6, '#ff5a5f'],
    [1, '#ff3d8b'],
  ];
  if (typeof g.createConicGradient === 'function') {
    const grad = g.createConicGradient(-Math.PI / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
  } else {
    const grad = g.createLinearGradient(0, 0, size, size);
    stops.forEach(([o, col]) => grad.addColorStop(o, col));
    g.fillStyle = grad;
  }
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface RobotMaterials {
  shell: THREE.MeshPhysicalMaterial;
  shellLight: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  deep: THREE.MeshStandardMaterial;
  pedestal: THREE.MeshStandardMaterial;
  ring: THREE.MeshPhysicalMaterial;
  screen: THREE.MeshPhysicalMaterial;
  leds: THREE.MeshStandardMaterial[];
  textures: THREE.Texture[];
}

export function createMaterials(faceTexture: THREE.Texture): RobotMaterials {
  const ringTex = ringTexture();
  const clear = { clearcoat: 0.45, clearcoatRoughness: 0.3 };
  return {
    shell: new THREE.MeshPhysicalMaterial({ color: '#eeebe6', roughness: 0.38, ...clear }),
    shellLight: new THREE.MeshPhysicalMaterial({ color: '#f8f6f2', roughness: 0.34, ...clear }),
    dark: new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.55, metalness: 0.3 }),
    deep: new THREE.MeshStandardMaterial({ color: '#0f0f12', roughness: 0.5, metalness: 0.25 }),
    pedestal: new THREE.MeshStandardMaterial({ color: '#2a2928', roughness: 0.9 }),
    ring: new THREE.MeshPhysicalMaterial({
      map: ringTex,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: ringTex,
      emissiveIntensity: 0.22,
      roughness: 0.5,
      clearcoat: 0.35,
    }),
    screen: new THREE.MeshPhysicalMaterial({
      color: '#050506',
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: faceTexture,
      emissiveIntensity: 1.6,
    }),
    leds: ['#ff8a3d', '#ff5a5f', '#ff3d8b'].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 1.4, roughness: 0.3 }),
    ),
    textures: [ringTex],
  };
}
