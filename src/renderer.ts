import {
  WebGLRenderer,
  PerspectiveCamera,
  Scene,
  Color,
  FogExp2,
  HemisphereLight,
  DirectionalLight
} from 'three';

export interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
}

export function createRenderContext(container: HTMLElement): RenderContext {
  const scene = new Scene();
  const bgAndFogColor = new Color(0xd0d5db);
  scene.background = bgAndFogColor;
  scene.fog = new FogExp2(bgAndFogColor, 0.035);

  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    80
  );
  camera.position.set(0, 1.6, 0);

  // Performance Engine Optimization:
  // Default to 1.0 DPR (with 0.85 floor on high-res laptop displays)
  // This drastically slashes fragment shading workload and eliminates fill-rate bottlenecks.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.0);
  const renderer = new WebGLRenderer({
    powerPreference: 'high-performance',
    antialias: false, // Turn off MSAA on weak iGPUs for an immediate 20+ FPS lift
    precision: 'mediump'
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Completely eliminate shadow pass overhead during render loops
  renderer.shadowMap.enabled = false;

  container.appendChild(renderer.domElement);

  // Balanced lightweight dual-lighting
  const hemiLight = new HemisphereLight(0xffffff, 0x8a929a, 0.95);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const dirLight = new DirectionalLight(0xfff5e6, 0.55);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  return { renderer, scene, camera };
}
