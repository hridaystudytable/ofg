import {
  Group,
  Mesh,
  BoxGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Scene,
  Vector3,
  Sprite,
  SpriteMaterial,
  CanvasTexture
} from 'three';

export interface PlayerAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function createNameSprite(name: string): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  // Background pill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  const r = 16;
  const w = 256;
  const h = 50;
  const y0 = 7;
  ctx.beginPath();
  ctx.moveTo(r, y0);
  ctx.lineTo(w - r, y0);
  ctx.quadraticCurveTo(w, y0, w, y0 + r);
  ctx.lineTo(w, y0 + h - r);
  ctx.quadraticCurveTo(w, y0 + h, w - r, y0 + h);
  ctx.lineTo(r, y0 + h);
  ctx.quadraticCurveTo(0, y0 + h, 0, y0 + h - r);
  ctx.lineTo(0, y0 + r);
  ctx.quadraticCurveTo(0, y0, r, y0);
  ctx.closePath();
  ctx.fill();

  // Border outline
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Name text
  ctx.font = 'bold 26px "Courier New", monospace, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(name.slice(0, 16), 128, y0 + h / 2);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true
  });

  const sprite = new Sprite(material);
  sprite.scale.set(1.2, 0.3, 1);
  return sprite;
}

export class RemotePlayer {
  id: string;
  name: string;
  group: Group;
  private visualWrapper: Group; // Container for agent model
  private nameSprite: Sprite;
  targetPos: Vector3;
  targetYaw: number;
  currentYaw = 0;
  health = 100;
  isDead = false;

  private leftLeg: Mesh;
  private rightLeg: Mesh;
  private leftArm: Mesh;
  private bodyMesh: Mesh;
  private walkCycle = 0;

  private bodyMat: MeshLambertMaterial;
  private origColor: number;
  private flashTimer = 0;

  constructor(id: string, name: string, scene: Scene, colorHex = 0x2563eb) {
    this.id = id;
    this.name = name;
    this.origColor = colorHex;
    this.group = new Group();
    this.targetPos = new Vector3(0, 0, 0);
    this.targetYaw = 0;

    // The visual model is built looking toward -Z (natural Three.js forward)
    this.visualWrapper = new Group();
    this.group.add(this.visualWrapper);

    // Floating nametag above head
    this.nameSprite = createNameSprite(name);
    this.nameSprite.position.set(0, 1.85, 0);
    this.group.add(this.nameSprite);

    // Materials
    this.bodyMat = new MeshLambertMaterial({ color: colorHex });
    const vestMat = new MeshLambertMaterial({ color: 0x1e242b });
    const skinMat = new MeshLambertMaterial({ color: 0xf5d0b0 });
    const pantsMat = new MeshLambertMaterial({ color: 0x181c22 });
    const bootMat = new MeshLambertMaterial({ color: 0x0f1114 });
    const visorMat = new MeshBasicMaterial({ color: 0x38bdf8 });
    const gunMat = new MeshLambertMaterial({ color: 0x14171a });

    // 1. Torso & Tactical Vest
    const torsoGeo = new BoxGeometry(0.48, 0.62, 0.28);
    this.bodyMesh = new Mesh(torsoGeo, this.bodyMat);
    this.bodyMesh.position.y = 0.94;
    this.visualWrapper.add(this.bodyMesh);

    const vestGeo = new BoxGeometry(0.5, 0.44, 0.31);
    const vest = new Mesh(vestGeo, vestMat);
    vest.position.set(0, 0.96, 0);
    this.visualWrapper.add(vest);

    const padGeo = new BoxGeometry(0.14, 0.08, 0.18);
    const leftPad = new Mesh(padGeo, vestMat);
    leftPad.position.set(-0.28, 1.2, 0);
    this.visualWrapper.add(leftPad);

    const rightPad = new Mesh(padGeo, vestMat);
    rightPad.position.set(0.28, 1.2, 0);
    this.visualWrapper.add(rightPad);

    // 2. Head & Visor (Looking towards -Z)
    const headGeo = new BoxGeometry(0.28, 0.28, 0.28);
    const head = new Mesh(headGeo, skinMat);
    head.position.y = 1.42;
    this.visualWrapper.add(head);

    const helmetGeo = new BoxGeometry(0.31, 0.14, 0.31);
    const helmet = new Mesh(helmetGeo, vestMat);
    helmet.position.y = 1.54;
    this.visualWrapper.add(helmet);

    // Visor at -Z (front of the face)
    const visorGeo = new BoxGeometry(0.25, 0.07, 0.06);
    const visor = new Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.43, -0.14);
    this.visualWrapper.add(visor);

    // 3. Legs & Combat Boots
    const legGeo = new BoxGeometry(0.16, 0.58, 0.18);
    legGeo.translate(0, -0.28, 0);

    this.leftLeg = new Mesh(legGeo, pantsMat);
    this.leftLeg.position.set(-0.13, 0.62, 0);
    this.visualWrapper.add(this.leftLeg);

    this.rightLeg = new Mesh(legGeo, pantsMat);
    this.rightLeg.position.set(0.13, 0.62, 0);
    this.visualWrapper.add(this.rightLeg);

    // Boots facing -Z (front of feet)
    const bootGeo = new BoxGeometry(0.18, 0.14, 0.24);
    const leftBoot = new Mesh(bootGeo, bootMat);
    leftBoot.position.set(0, -0.52, -0.02);
    this.leftLeg.add(leftBoot);

    const rightBoot = new Mesh(bootGeo, bootMat);
    rightBoot.position.set(0, -0.52, -0.02);
    this.rightLeg.add(rightBoot);

    // 4. Arms & Two-handed Weapon stance pointing towards -Z
    const armGeo = new BoxGeometry(0.12, 0.5, 0.13);
    armGeo.translate(0, -0.22, 0);

    this.leftArm = new Mesh(armGeo, this.bodyMat);
    this.leftArm.position.set(-0.31, 1.18, 0);
    this.leftArm.rotation.x = Math.PI / 4;
    this.leftArm.rotation.z = -0.2;
    this.visualWrapper.add(this.leftArm);

    const rightArm = new Mesh(armGeo, this.bodyMat);
    rightArm.position.set(0.31, 1.18, 0);
    rightArm.rotation.x = Math.PI / 2.8;
    rightArm.rotation.y = 0.25;
    this.visualWrapper.add(rightArm);

    // SMG in hands pointing towards -Z (forward aim)
    const gunBodyGeo = new BoxGeometry(0.07, 0.09, 0.32);
    const gun = new Mesh(gunBodyGeo, gunMat);
    gun.position.set(0.16, 1.05, -0.38);
    this.visualWrapper.add(gun);

    const magGeo = new BoxGeometry(0.04, 0.12, 0.06);
    const mag = new Mesh(magGeo, vestMat);
    mag.position.set(0.16, 0.94, -0.35);
    this.visualWrapper.add(mag);

    scene.add(this.group);
  }

  getAABB(): PlayerAABB {
    const pos = this.group.position;
    return {
      minX: pos.x - 0.35,
      maxX: pos.x + 0.35,
      minY: pos.y,
      maxY: pos.y + 1.7,
      minZ: pos.z - 0.35,
      maxZ: pos.z + 0.35
    };
  }

  takeDamageVisual() {
    this.bodyMat.color.setHex(0xffffff);
    this.flashTimer = 0.08;
  }

  setDead(dead: boolean) {
    this.isDead = dead;
    this.group.visible = !dead;
  }

  teleport(pos: Vector3, yaw: number) {
    this.group.position.copy(pos);
    this.targetPos.copy(pos);
    this.currentYaw = yaw;
    this.targetYaw = yaw;
    this.group.rotation.y = yaw;
    this.leftLeg.rotation.x = 0;
    this.rightLeg.rotation.x = 0;
  }

  updateInterpolation(delta: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.bodyMat.color.setHex(this.origColor);
      }
    }

    if (this.isDead) return;

    const prevPos = this.group.position.clone();

    if (this.group.position.distanceToSquared(this.targetPos) > 16) {
      this.group.position.copy(this.targetPos);
    } else {
      const t = Math.min(1.0, delta * 22);
      this.group.position.lerp(this.targetPos, t);
    }

    // Exact heading interpolation
    let diff = this.targetYaw - this.currentYaw;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.currentYaw += diff * Math.min(1.0, delta * 22);
    this.group.rotation.y = this.currentYaw;

    // Detect if remote player is crouching
    const isCrouched = this.group.position.y < -0.25;
    if (isCrouched) {
      this.bodyMesh.scale.set(1.0, 0.75, 1.0);
      this.bodyMesh.position.y = 0.8;
      this.leftLeg.scale.set(1.0, 0.6, 1.0);
      this.rightLeg.scale.set(1.0, 0.6, 1.0);
    } else {
      this.bodyMesh.scale.set(1.0, 1.0, 1.0);
      this.leftLeg.scale.set(1.0, 1.0, 1.0);
      this.rightLeg.scale.set(1.0, 1.0, 1.0);
    }

    // Walking animation
    const moveDist = this.group.position.distanceTo(prevPos);
    const speed = moveDist / (delta || 0.016);

    if (speed > 0.4) {
      this.walkCycle += delta * 12;
      const legSwing = Math.sin(this.walkCycle) * 0.45;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;
      this.leftArm.rotation.x = Math.PI / 4 + legSwing * 0.25;
      if (!isCrouched) {
        this.bodyMesh.position.y = 0.94 + Math.abs(Math.sin(this.walkCycle * 2)) * 0.03;
      }
    } else {
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
      if (!isCrouched) {
        this.bodyMesh.position.y = 0.94;
      }
    }
  }

  setName(newName: string) {
    if (this.name === newName) return;
    this.name = newName;
    this.group.remove(this.nameSprite);
    if (this.nameSprite.material.map) this.nameSprite.material.map.dispose();
    this.nameSprite.material.dispose();
    this.nameSprite = createNameSprite(newName);
    this.nameSprite.position.set(0, 1.85, 0);
    this.group.add(this.nameSprite);
  }

  destroy(scene: Scene) {
    if (this.nameSprite) {
      if (this.nameSprite.material.map) this.nameSprite.material.map.dispose();
      this.nameSprite.material.dispose();
    }
    scene.remove(this.group);
  }
}
