import {
  Scene,
  Mesh,
  BoxGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Vector3
} from 'three';
import { playExplosionSound, playPlayerHurtSound } from './audio';
import { OfficeMap } from './office';
import { NetworkManager } from './network';

export interface ActiveGrenade {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
}

export class GrenadeSystem {
  scene: Scene;
  office: OfficeMap;
  network: NetworkManager;
  grenades: ActiveGrenade[] = [];
  grenadeCount = 3;
  cooldown = 0;

  // Reusable materials
  private grenadeGeo = new BoxGeometry(0.12, 0.16, 0.12);
  private grenadeMat = new MeshLambertMaterial({ color: 0x3f6212 }); // Army olive green
  private blastGeo = new BoxGeometry(0.6, 0.6, 0.6);
  private blastMat = new MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 });

  constructor(scene: Scene, office: OfficeMap, network: NetworkManager) {
    this.scene = scene;
    this.office = office;
    this.network = network;
  }

  throwGrenade(origin: Vector3, forward: Vector3): boolean {
    if (this.grenadeCount <= 0 || this.cooldown > 0) return false;

    this.grenadeCount--;
    this.cooldown = 0.8;

    const mesh = new Mesh(this.grenadeGeo, this.grenadeMat);
    mesh.position.copy(origin).addScaledVector(forward, 0.5);
    this.scene.add(mesh);

    // Initial velocity: forward impulse + arc upwards
    const velocity = forward.clone().multiplyScalar(14).add(new Vector3(0, 4.5, 0));

    this.grenades.push({
      mesh,
      velocity,
      life: 2.2 // 2.2s fuse time
    });

    return true;
  }

  update(
    delta: number,
    localPlayerPos?: Vector3,
    onLocalDamage?: (dmg: number, attackerName: string, attackerId: string, attackerPos?: { x: number; z: number }) => void
  ) {
    if (this.cooldown > 0) {
      this.cooldown -= delta;
    }

    const gravity = -18;

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.life -= delta;

      // Physics integration
      g.velocity.y += gravity * delta;
      const nextX = g.mesh.position.x + g.velocity.x * delta;
      const nextY = g.mesh.position.y + g.velocity.y * delta;
      const nextZ = g.mesh.position.z + g.velocity.z * delta;

      // Floor bounce
      if (nextY <= 0.1) {
        g.mesh.position.y = 0.1;
        g.velocity.y = -g.velocity.y * 0.45;
        g.velocity.x *= 0.75;
        g.velocity.z *= 0.75;
      } else {
        g.mesh.position.y = nextY;
      }

      // Wall bounce
      if (this.office.isWalkable(nextX, g.mesh.position.z, 0.15)) {
        g.mesh.position.x = nextX;
      } else {
        g.velocity.x = -g.velocity.x * 0.5;
      }

      if (this.office.isWalkable(g.mesh.position.x, nextZ, 0.15)) {
        g.mesh.position.z = nextZ;
      } else {
        g.velocity.z = -g.velocity.z * 0.5;
      }

      // Tumbling rotation
      g.mesh.rotation.x += delta * 8;
      g.mesh.rotation.z += delta * 6;

      // Detonation
      if (g.life <= 0) {
        this.detonate(g.mesh.position, localPlayerPos, onLocalDamage);
        this.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  private detonate(
    pos: Vector3,
    localPlayerPos?: Vector3,
    onLocalDamage?: (dmg: number, attackerName: string, attackerId: string, attackerPos?: { x: number; z: number }) => void
  ) {
    playExplosionSound();

    // Visual blast flash
    const blast = new Mesh(this.blastGeo, this.blastMat.clone());
    blast.position.copy(pos);
    this.scene.add(blast);

    let scale = 1;
    const expandAnim = setInterval(() => {
      scale += 0.8;
      blast.scale.set(scale, scale, scale);
      (blast.material as MeshBasicMaterial).opacity -= 0.15;
      if (scale >= 4.5) {
        clearInterval(expandAnim);
        this.scene.remove(blast);
        blast.geometry.dispose();
      }
    }, 25);

    const blastRadius = 6.0;

    // 1. Self-damage to local player if caught in blast radius
    if (localPlayerPos && onLocalDamage) {
      const localDist = localPlayerPos.distanceTo(pos);
      if (localDist < blastRadius) {
        // Up to 100 damage if right on top of the grenade
        const selfDamage = Math.round((1 - localDist / blastRadius) * 100);
        if (selfDamage > 5) {
          onLocalDamage(selfDamage, 'Self (Grenade)', this.network.localId, { x: pos.x, z: pos.z });
        }
      }
    }

    // 2. Splash damage against remote players
    for (const player of this.network['remotePlayers'].values()) {
      if (player.isDead) continue;
      const dist = player.group.position.distanceTo(pos);
      if (dist < blastRadius) {
        const damage = Math.round((1 - dist / blastRadius) * 100);
        if (damage > 5) {
          player.takeDamageVisual();
          playPlayerHurtSound();
          this.network.sendDamage(player.id, damage, { x: pos.x, z: pos.z });
        }
      }
    }
  }

  resetGrenades() {
    this.grenadeCount = 3;
    for (const g of this.grenades) {
      this.scene.remove(g.mesh);
    }
    this.grenades = [];
  }
}
