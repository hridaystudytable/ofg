import {
  Group,
  Mesh,
  BoxGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Scene,
  Vector3
} from 'three';

export interface PlayerAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export class RemotePlayer {
  id: string;
  name: string;
  group: Group;
  targetPos: Vector3;
  targetYaw: number;
  currentYaw = 0;
  health = 100;
  isDead = false;

  private bodyMat: MeshLambertMaterial;
  private origColor: number;
  private flashTimer = 0;

  constructor(id: string, name: string, scene: Scene, colorHex = 0x3b82f6) {
    this.id = id;
    this.name = name;
    this.origColor = colorHex;
    this.group = new Group();
    this.targetPos = new Vector3(0, 0, 0);
    this.targetYaw = 0;

    // Materials
    this.bodyMat = new MeshLambertMaterial({ color: colorHex });
    const headMat = new MeshLambertMaterial({ color: 0xf5d0b0 });
    const tieMat = new MeshLambertMaterial({ color: 0xd9534f });
    const hairMat = new MeshLambertMaterial({ color: 0x2b2b2b });
    const visorMat = new MeshBasicMaterial({ color: 0x111111 });

    // Torso
    const torsoGeo = new BoxGeometry(0.5, 0.65, 0.28);
    const torso = new Mesh(torsoGeo, this.bodyMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    this.group.add(torso);

    // Red necktie
    const tieGeo = new BoxGeometry(0.08, 0.35, 0.04);
    const tie = new Mesh(tieGeo, tieMat);
    tie.position.set(0, 0.98, 0.15);
    this.group.add(tie);

    // Head
    const headGeo = new BoxGeometry(0.3, 0.3, 0.28);
    const head = new Mesh(headGeo, headMat);
    head.position.y = 1.45;
    head.castShadow = true;
    this.group.add(head);

    // Hair / hat
    const hairGeo = new BoxGeometry(0.32, 0.1, 0.3);
    const hair = new Mesh(hairGeo, hairMat);
    hair.position.y = 1.62;
    this.group.add(hair);

    // Sunglasses / visor
    const visorGeo = new BoxGeometry(0.24, 0.06, 0.05);
    const visor = new Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.47, 0.15);
    this.group.add(visor);

    // Legs
    const legGeo = new BoxGeometry(0.18, 0.65, 0.22);
    const legMat = new MeshLambertMaterial({ color: 0x20242b });
    const leftLeg = new Mesh(legGeo, legMat);
    leftLeg.position.set(-0.14, 0.325, 0);
    leftLeg.castShadow = true;
    this.group.add(leftLeg);

    const rightLeg = new Mesh(legGeo, legMat);
    rightLeg.position.set(0.14, 0.325, 0);
    rightLeg.castShadow = true;
    this.group.add(rightLeg);

    // Arms & held gun
    const armGeo = new BoxGeometry(0.12, 0.55, 0.14);
    const leftArm = new Mesh(armGeo, this.bodyMat);
    leftArm.position.set(-0.32, 0.95, 0);
    this.group.add(leftArm);

    const rightArm = new Mesh(armGeo, this.bodyMat);
    rightArm.position.set(0.32, 0.95, 0.12);
    rightArm.rotation.x = -Math.PI / 3;
    this.group.add(rightArm);

    const gunGeo = new BoxGeometry(0.06, 0.08, 0.22);
    const gunMat = new MeshLambertMaterial({ color: 0x1f2327 });
    const gun = new Mesh(gunGeo, gunMat);
    gun.position.set(0.32, 1.08, 0.32);
    this.group.add(gun);

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
    this.bodyMat.color.setHex(0xffffff); // White damage flash
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
  }

  updateInterpolation(delta: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) {
        this.bodyMat.color.setHex(this.origColor);
      }
    }

    if (this.isDead) return;

    // Fast-snap if distance is too large (e.g. initial spawn or respawn teleport)
    if (this.group.position.distanceToSquared(this.targetPos) > 16) {
      this.group.position.copy(this.targetPos);
    } else {
      // 20x delta lerp for instantaneous, smooth tracking
      const t = Math.min(1.0, delta * 20);
      this.group.position.lerp(this.targetPos, t);
    }

    let diff = this.targetYaw - this.currentYaw;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.currentYaw += diff * Math.min(1.0, delta * 20);
    this.group.rotation.y = this.currentYaw;
  }

  destroy(scene: Scene) {
    scene.remove(this.group);
  }
}
