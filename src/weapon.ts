import {
  PerspectiveCamera,
  Scene,
  Group,
  Mesh,
  BoxGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Vector3,
  LineSegments,
  LineBasicMaterial,
  BufferGeometry
} from 'three';
import { playGunshotSound, playHitSound, playPlayerHurtSound } from './audio';
import { OfficeMap } from './office';
import { NetworkManager } from './network';

export class WeaponSystem {
  camera: PerspectiveCamera;
  scene: Scene;
  office: OfficeMap;
  network: NetworkManager;

  gunGroup: Group;
  muzzleFlash: Mesh;
  baseGunPos: Vector3;
  adsGunPos: Vector3;

  // Aim Down Sights (ADS) state
  isAiming = false;
  readonly defaultFov = 70;
  readonly scopedFov = 42;

  recoilZ = 0;
  recoilRotX = 0;
  fireCooldown = 0;
  readonly fireInterval = 0.14; // ~7 shots/sec

  tracers: { line: LineSegments; life: number }[] = [];

  constructor(camera: PerspectiveCamera, scene: Scene, office: OfficeMap, network: NetworkManager) {
    this.camera = camera;
    this.scene = scene;
    this.office = office;
    this.network = network;

    this.gunGroup = new Group();
    // Hip-fire viewmodel position (lower right)
    this.baseGunPos = new Vector3(0.24, -0.22, -0.45);
    // Scoped ADS position (centered in camera view)
    this.adsGunPos = new Vector3(0.0, -0.16, -0.38);
    this.gunGroup.position.copy(this.baseGunPos);

    const slideMat = new MeshLambertMaterial({ color: 0x22252a });
    const frameMat = new MeshLambertMaterial({ color: 0x363a40 });
    const detailMat = new MeshLambertMaterial({ color: 0x111315 });
    const sightMat = new MeshBasicMaterial({ color: 0x10b981 }); // Glowing green reflex sight

    // Gun body
    const slideGeo = new BoxGeometry(0.065, 0.08, 0.3);
    const slide = new Mesh(slideGeo, slideMat);
    slide.position.set(0, 0.02, 0);
    this.gunGroup.add(slide);

    // Barrel
    const barrelGeo = new BoxGeometry(0.04, 0.04, 0.1);
    const barrel = new Mesh(barrelGeo, detailMat);
    barrel.position.set(0, 0.02, -0.18);
    this.gunGroup.add(barrel);

    // Grip
    const gripGeo = new BoxGeometry(0.055, 0.14, 0.08);
    const grip = new Mesh(gripGeo, frameMat);
    grip.position.set(0, -0.07, 0.06);
    grip.rotation.x = 0.22;
    this.gunGroup.add(grip);

    // Reflex scope frame & illuminated reticle dot
    const scopeMountGeo = new BoxGeometry(0.04, 0.03, 0.08);
    const scopeMount = new Mesh(scopeMountGeo, detailMat);
    scopeMount.position.set(0, 0.075, -0.04);
    this.gunGroup.add(scopeMount);

    const sightDotGeo = new BoxGeometry(0.008, 0.008, 0.008);
    const sightDot = new Mesh(sightDotGeo, sightMat);
    sightDot.position.set(0, 0.09, -0.04);
    this.gunGroup.add(sightDot);

    // Muzzle flash
    const flashGeo = new BoxGeometry(0.12, 0.12, 0.02);
    const flashMat = new MeshBasicMaterial({ color: 0xffea79 });
    this.muzzleFlash = new Mesh(flashGeo, flashMat);
    this.muzzleFlash.position.set(0, 0.02, -0.24);
    this.muzzleFlash.visible = false;
    this.gunGroup.add(this.muzzleFlash);

    this.camera.add(this.gunGroup);
    this.scene.add(this.camera);

    // Mouse input listeners (Left click = Fire, Right click = Scope)
    window.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement) return;

      if (e.button === 0) {
        this.shoot();
      } else if (e.button === 2) {
        this.isAiming = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.isAiming = false;
      }
    });

    // Prevent default context menu
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  shoot() {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.fireInterval;

    // Recoil (slightly dampened when scoped)
    const recoilFactor = this.isAiming ? 0.6 : 1.0;
    this.recoilZ = 0.07 * recoilFactor;
    this.recoilRotX = 0.14 * recoilFactor;
    this.muzzleFlash.visible = true;
    this.muzzleFlash.rotation.z = Math.random() * Math.PI;

    playGunshotSound();

    const origin = new Vector3();
    const forward = new Vector3(0, 0, -1);
    this.camera.getWorldPosition(origin);
    forward.applyQuaternion(this.camera.quaternion);

    // 1. Raycast environment
    const envHit = this.office.raycastBoxes(
      origin.x,
      origin.y,
      origin.z,
      forward.x,
      forward.y,
      forward.z,
      60
    );

    const maxTestDist = envHit ? envHit.dist : 60;

    // 2. Raycast players
    const playerHit = this.network.raycastPlayers(
      origin.x,
      origin.y,
      origin.z,
      forward.x,
      forward.y,
      forward.z,
      maxTestDist
    );

    const targetPos = new Vector3();

    if (playerHit) {
      targetPos.set(playerHit.pointX, playerHit.pointY, playerHit.pointZ);
      playPlayerHurtSound();
      playerHit.hitPlayer.takeDamageVisual();
      this.network.sendDamage(playerHit.hitPlayer.id, 25);
    } else if (envHit) {
      targetPos.set(envHit.pointX, envHit.pointY, envHit.pointZ);
      playHitSound();
    } else {
      targetPos.copy(origin).addScaledVector(forward, 40);
    }

    const muzzleWorld = new Vector3();
    this.muzzleFlash.getWorldPosition(muzzleWorld);
    this.spawnTracer(muzzleWorld, targetPos);
  }

  spawnTracer(start: Vector3, end: Vector3) {
    const geo = new BufferGeometry().setFromPoints([start, end]);
    const mat = new LineBasicMaterial({ color: 0xffe28a, linewidth: 2 });
    const line = new LineSegments(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.06 });
  }

  update(delta: number) {
    if (this.fireCooldown > 0) {
      this.fireCooldown -= delta;
      if (this.fireCooldown < this.fireInterval * 0.6) {
        this.muzzleFlash.visible = false;
      }
    }

    // Smooth FOV zoom transition for scope
    const targetFov = this.isAiming ? this.scopedFov : this.defaultFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, delta * 18);
      this.camera.updateProjectionMatrix();
    }

    // Smooth Gun Position transition (Hip vs ADS)
    const targetGunPos = this.isAiming ? this.adsGunPos : this.baseGunPos;
    const lerpSpeed = Math.min(1.0, delta * 18);
    this.gunGroup.position.lerp(targetGunPos, lerpSpeed);

    // Apply recoil on top of gun position
    this.recoilZ = Math.max(0, this.recoilZ - delta * 0.8);
    this.recoilRotX = Math.max(0, this.recoilRotX - delta * 1.8);

    this.gunGroup.position.z += this.recoilZ;
    this.gunGroup.rotation.x = this.recoilRotX;

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= delta;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
