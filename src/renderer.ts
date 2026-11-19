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
  const bgAndFogColor = new Color(0xd0d5db); // Soft office daylight tone
  scene.background = bgAndFogColor;
  scene.fog = new FogExp2(bgAndFogColor, 0.035);

  const camera = new PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 0); // ~1.6m standing eye-height

  // Low-end laptop & iGPU optimization:
  // Cap devicePixelRatio at 1.25 to prevent fill-rate bottlenecks on high-DPI displays.
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
  const renderer = new WebGLRenderer({
    powerPreference: 'high-performance',
    antialias: true
  });
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // One static directional shadow map baked once, no real-time recalculation
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;

  container.appendChild(renderer.domElement);

  // Lighting: 1 HemisphereLight + 1 DirectionalLight (minimal shader overhead)
  const hemiLight = new HemisphereLight(0xffffff, 0x8a929a, 0.9);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const dirLight = new DirectionalLight(0xfff5e6, 0.6);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 25;
  dirLight.shadow.camera.left = -12;
  dirLight.shadow.camera.right = 12;
  dirLight.shadow.camera.top = 12;
  dirLight.shadow.camera.bottom = -12;
  scene.add(dirLight);

  // Resize handler
  window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  });

  return { renderer, scene, camera };
}
