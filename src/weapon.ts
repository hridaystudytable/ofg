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
import { playGunshotSound, playHitSound, playPlayerHurtSound, playSwitchSound } from './audio';
import { OfficeMap } from './office';
import { NetworkManager } from './network';

export interface GunConfig {
  name: string;
  type: 'smg' | 'ar' | 'sniper';
  dmg: number;
  fireInterval: number; // seconds between shots
  scopedFov: number;
  recoil: number;
  tracerColor: number;
  soundType: 'smg' | 'ar' | 'sniper';
  description: string;
}

export const GUN_LOADOUTS: GunConfig[] = [
  {
    name: 'SMG-9 TACTICAL',
    type: 'smg',
    dmg: 25,
    fireInterval: 0.12, // fast ~8.3 shots/sec
    scopedFov: 44,
    recoil: 0.06,
    tracerColor: 0xffe28a,
    soundType: 'smg',
    description: 'High rate of fire, low recoil, rapid burst'
  },
  {
    name: 'M4A1 CARBINE',
    type: 'ar',
    dmg: 38,
    fireInterval: 0.18, // ~5.5 shots/sec
    scopedFov: 36,
    recoil: 0.10,
    tracerColor: 0x38bdf8,
    soundType: 'ar',
    description: 'High damage, mid-range precision assault rifle'
  },
  {
    name: 'AWM SNIPER',
    type: 'sniper',
    dmg: 85,
    fireInterval: 0.85, // Heavy single-shot bolt action
    scopedFov: 18, // High-magnification telescopic zoom
    recoil: 0.22,
    tracerColor: 0xf43f5e,
    soundType: 'sniper',
    description: 'Heavy bolt-action, extreme zoom, 85 DMG'
  }
];

export class WeaponSystem {
  camera: PerspectiveCamera;
  scene: Scene;
  office: OfficeMap;
  network: NetworkManager;

  currentGunIndex = 0;
  gunGroup: Group;
  private gunModels: Group[] = [];
  private muzzleFlashes: Mesh[] = [];
  baseGunPos: Vector3;
  adsGunPos: Vector3;

  // Aim Down Sights (ADS) state
  isAiming = false;
  readonly defaultFov = 70;

  recoilZ = 0;
  recoilRotX = 0;
  fireCooldown = 0;

  tracers: { line: LineSegments; life: number }[] = [];
  onWeaponChange?: (gun: GunConfig, index: number) => void;

  constructor(
    camera: PerspectiveCamera,
    scene: Scene,
    office: OfficeMap,
    network: NetworkManager,
    onWeaponChange?: (gun: GunConfig, index: number) => void
  ) {
    this.camera = camera;
    this.scene = scene;
    this.office = office;
    this.network = network;
    this.onWeaponChange = onWeaponChange;

    this.gunGroup = new Group();
    this.baseGunPos = new Vector3(0.24, -0.22, -0.45);
    this.adsGunPos = new Vector3(0.0, -0.16, -0.38);
    this.gunGroup.position.copy(this.baseGunPos);

    this.buildWeaponModels();

    this.camera.add(this.gunGroup);
    this.scene.add(this.camera);

    this.setupInputs();
  }

  get currentGun(): GunConfig {
    return GUN_LOADOUTS[this.currentGunIndex];
  }

  private buildWeaponModels() {
    const darkMetal = new MeshLambertMaterial({ color: 0x1f2328 });
    const gunGrey = new MeshLambertMaterial({ color: 0x374151 });
    const desertTan = new MeshLambertMaterial({ color: 0xb5996e });
    const greenSightMat = new MeshBasicMaterial({ color: 0x10b981 });
    const redSightMat = new MeshBasicMaterial({ color: 0xef4444 });
    const sniperBodyMat = new MeshLambertMaterial({ color: 0x164e63 });
    const sniperScopeGlass = new MeshBasicMaterial({ color: 0x0284c7 });

    // 1. SMG-9 Tactical Model
    const smgModel = new Group();
    const smgBody = new Mesh(new BoxGeometry(0.065, 0.08, 0.28), gunGrey);
    smgBody.position.set(0, 0.02, 0);
    smgModel.add(smgBody);

    const smgBarrel = new Mesh(new BoxGeometry(0.038, 0.038, 0.12), darkMetal);
    smgBarrel.position.set(0, 0.02, -0.19);
    smgModel.add(smgBarrel);

    const smgGrip = new Mesh(new BoxGeometry(0.052, 0.14, 0.07), darkMetal);
    smgGrip.position.set(0, -0.07, 0.05);
    smgGrip.rotation.x = 0.22;
    smgModel.add(smgGrip);

    const smgMag = new Mesh(new BoxGeometry(0.045, 0.16, 0.055), darkMetal);
    smgMag.position.set(0, -0.09, -0.03);
    smgModel.add(smgMag);

    const smgSight = new Mesh(new BoxGeometry(0.008, 0.008, 0.008), greenSightMat);
    smgSight.position.set(0, 0.085, -0.04);
    smgModel.add(smgSight);

    const smgFlash = new Mesh(new BoxGeometry(0.12, 0.12, 0.02), new MeshBasicMaterial({ color: 0xffea79 }));
    smgFlash.position.set(0, 0.02, -0.26);
    smgFlash.visible = false;
    smgModel.add(smgFlash);

    // 2. M4A1 Carbine Model
    const arModel = new Group();
    const arReceiver = new Mesh(new BoxGeometry(0.07, 0.09, 0.38), darkMetal);
    arReceiver.position.set(0, 0.02, 0);
    arModel.add(arReceiver);

    const arHandguard = new Mesh(new BoxGeometry(0.066, 0.075, 0.22), desertTan);
    arHandguard.position.set(0, 0.02, -0.22);
    arModel.add(arHandguard);

    const arLongBarrel = new Mesh(new BoxGeometry(0.036, 0.036, 0.18), darkMetal);
    arLongBarrel.position.set(0, 0.02, -0.38);
    arModel.add(arLongBarrel);

    const arStock = new Mesh(new BoxGeometry(0.06, 0.11, 0.18), desertTan);
    arStock.position.set(0, 0.01, 0.24);
    arModel.add(arStock);

    const arMagCurved = new Mesh(new BoxGeometry(0.048, 0.19, 0.08), darkMetal);
    arMagCurved.position.set(0, -0.09, -0.06);
    arMagCurved.rotation.x = 0.18;
    arModel.add(arMagCurved);

    const arGrip = new Mesh(new BoxGeometry(0.052, 0.15, 0.07), darkMetal);
    arGrip.position.set(0, -0.08, 0.09);
    arGrip.rotation.x = 0.26;
    arModel.add(arGrip);

    const arSightHolo = new Mesh(new BoxGeometry(0.045, 0.04, 0.08), darkMetal);
    arSightHolo.position.set(0, 0.085, -0.05);
    arModel.add(arSightHolo);

    const arSightDot = new Mesh(new BoxGeometry(0.008, 0.008, 0.008), redSightMat);
    arSightDot.position.set(0, 0.092, -0.05);
    arModel.add(arSightDot);

    const arFlash = new Mesh(new BoxGeometry(0.16, 0.16, 0.02), new MeshBasicMaterial({ color: 0xffe28a }));
    arFlash.position.set(0, 0.02, -0.48);
    arFlash.visible = false;
    arModel.add(arFlash);

    // 3. AWM Sniper Rifle Model
    const sniperModel = new Group();
    const sniperBody = new Mesh(new BoxGeometry(0.075, 0.10, 0.52), sniperBodyMat);
    sniperBody.position.set(0, 0.02, 0.04);
    sniperModel.add(sniperBody);

    const sniperBarrel = new Mesh(new BoxGeometry(0.038, 0.038, 0.35), darkMetal);
    sniperBarrel.position.set(0, 0.02, -0.38);
    sniperModel.add(sniperBarrel);

    const sniperMuzzleBrake = new Mesh(new BoxGeometry(0.06, 0.06, 0.08), darkMetal);
    sniperMuzzleBrake.position.set(0, 0.02, -0.57);
    sniperModel.add(sniperMuzzleBrake);

    // Telescopic Scope Tube
    const scopeTube = new Mesh(new BoxGeometry(0.05, 0.05, 0.28), darkMetal);
    scopeTube.position.set(0, 0.11, -0.02);
    sniperModel.add(scopeTube);

    const scopeLens = new Mesh(new BoxGeometry(0.042, 0.042, 0.01), sniperScopeGlass);
    scopeLens.position.set(0, 0.11, -0.16);
    sniperModel.add(scopeLens);

    const sniperStock = new Mesh(new BoxGeometry(0.068, 0.12, 0.24), sniperBodyMat);
    sniperStock.position.set(0, -0.01, 0.36);
    sniperModel.add(sniperStock);

    const sniperBoltHandle = new Mesh(new BoxGeometry(0.08, 0.025, 0.025), darkMetal);
    sniperBoltHandle.position.set(0.06, 0.07, 0.08);
    sniperModel.add(sniperBoltHandle);

    const sniperFlash = new Mesh(new BoxGeometry(0.24, 0.24, 0.03), new MeshBasicMaterial({ color: 0xffffff }));
    sniperFlash.position.set(0, 0.02, -0.62);
    sniperFlash.visible = false;
    sniperModel.add(sniperFlash);

    // Store references
    this.gunModels = [smgModel, arModel, sniperModel];
    this.muzzleFlashes = [smgFlash, arFlash, sniperFlash];

    this.gunModels.forEach((m, idx) => {
      m.visible = (idx === this.currentGunIndex);
      this.gunGroup.add(m);
    });
  }

  private setupInputs() {
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

    window.addEventListener('keydown', (e) => {
      if (!document.pointerLockElement) return;

      if (e.code === 'Digit1') {
        this.switchWeapon(0);
      } else if (e.code === 'Digit2') {
        this.switchWeapon(1);
      } else if (e.code === 'Digit3') {
        this.switchWeapon(2);
      } else if (e.code === 'KeyQ') {
        // Quick switch to next weapon
        this.switchWeapon((this.currentGunIndex + 1) % GUN_LOADOUTS.length);
      }
    });

    // Mouse scroll wheel weapon switch
    window.addEventListener('wheel', (e) => {
      if (!document.pointerLockElement) return;
      if (e.deltaY > 0) {
        this.switchWeapon((this.currentGunIndex + 1) % GUN_LOADOUTS.length);
      } else if (e.deltaY < 0) {
        this.switchWeapon((this.currentGunIndex - 1 + GUN_LOADOUTS.length) % GUN_LOADOUTS.length);
      }
    }, { passive: true });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  public switchWeapon(index: number) {
    if (index === this.currentGunIndex || index < 0 || index >= GUN_LOADOUTS.length) return;
    this.currentGunIndex = index;

    this.gunModels.forEach((m, idx) => {
      m.visible = (idx === this.currentGunIndex);
    });

    this.isAiming = false;
    this.fireCooldown = 0.25; // brief switch cooldown
    playSwitchSound();

    this.onWeaponChange?.(this.currentGun, this.currentGunIndex);
  }

  get muzzleFlash(): Mesh {
    return this.muzzleFlashes[this.currentGunIndex];
  }

  shoot() {
    if (this.fireCooldown > 0) return;
    const gun = this.currentGun;
    this.fireCooldown = gun.fireInterval;

    // Recoil (slightly dampened when scoped)
    const recoilFactor = this.isAiming ? 0.6 : 1.0;
    this.recoilZ = gun.recoil * recoilFactor;
    this.recoilRotX = (gun.recoil * 1.8) * recoilFactor;

    const flash = this.muzzleFlash;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;

    playGunshotSound(gun.soundType);

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
      70
    );

    const maxTestDist = envHit ? envHit.dist : 70;

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
      // Send damage with attacker origin position for directional hit marker
      this.network.sendDamage(playerHit.hitPlayer.id, gun.dmg, { x: origin.x, z: origin.z });
    } else if (envHit) {
      targetPos.set(envHit.pointX, envHit.pointY, envHit.pointZ);
      playHitSound();
    } else {
      targetPos.copy(origin).addScaledVector(forward, 45);
    }

    const muzzleWorld = new Vector3();
    flash.getWorldPosition(muzzleWorld);
    this.spawnTracer(muzzleWorld, targetPos, gun.tracerColor);
  }

  spawnTracer(start: Vector3, end: Vector3, colorHex: number) {
    const geo = new BufferGeometry().setFromPoints([start, end]);
    const mat = new LineBasicMaterial({ color: colorHex, linewidth: 2 });
    const line = new LineSegments(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  update(delta: number) {
    const gun = this.currentGun;
    if (this.fireCooldown > 0) {
      this.fireCooldown -= delta;
      if (this.fireCooldown < gun.fireInterval * 0.6) {
        this.muzzleFlash.visible = false;
      }
    }

    // Smooth FOV zoom transition for scope
    const targetFov = this.isAiming ? gun.scopedFov : this.defaultFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, delta * 20);
      this.camera.updateProjectionMatrix();
    }

    // Smooth Gun Position transition (Hip vs ADS)
    const targetGunPos = this.isAiming ? this.adsGunPos : this.baseGunPos;
    const lerpSpeed = Math.min(1.0, delta * 20);
    this.gunGroup.position.lerp(targetGunPos, lerpSpeed);

    // Apply recoil on top of gun position
    this.recoilZ = Math.max(0, this.recoilZ - delta * 0.9);
    this.recoilRotX = Math.max(0, this.recoilRotX - delta * 2.0);

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
