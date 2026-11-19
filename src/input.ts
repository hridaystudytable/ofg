import { Camera, Vector3, Euler } from 'three';

export interface InputController {
  update(delta: number, collisionCheck?: (newPos: Vector3) => boolean): void;
  isLocked: boolean;
  getYaw(): number;
  setAiming(aiming: boolean): void;
}

export function setupInput(
  camera: Camera,
  domElement: HTMLElement,
  blocker: HTMLElement,
  playBtn: HTMLElement,
  shouldBlockerShow: () => boolean
): InputController {
  let isLocked = false;
  let isAiming = false;
  const moveState = { forward: false, backward: false, left: false, right: false };

  const euler = new Euler(0, 0, 0, 'YXZ');
  const velocity = new Vector3();
  const direction = new Vector3();
  const proposedPos = new Vector3();

  // Pointer lock events via play button & canvas click
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    domElement.requestPointerLock();
  });

  blocker.addEventListener('click', () => {
    domElement.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === domElement) {
      isLocked = true;
      blocker.style.display = 'none';
    } else {
      isLocked = false;
      // ONLY show the ESC / Name modal if the player is NOT currently in the dead / respawning state
      if (shouldBlockerShow()) {
        blocker.style.display = 'flex';
      }
    }
  });

  // Mouse look (reduces sensitivity when scoped for precision)
  document.addEventListener('mousemove', (event) => {
    if (!isLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    const sens = isAiming ? 0.0012 : 0.0022;

    euler.setFromQuaternion(camera.quaternion);
    euler.y -= movementX * sens;
    euler.x -= movementY * sens;

    const maxPitch = Math.PI / 2 - 0.05;
    euler.x = Math.max(-maxPitch, Math.min(maxPitch, euler.x));

    camera.quaternion.setFromEuler(euler);
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        moveState.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        moveState.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        moveState.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        moveState.right = true;
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        moveState.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        moveState.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        moveState.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        moveState.right = false;
        break;
    }
  });

  const baseSpeed = 4.2;

  return {
    get isLocked() {
      return isLocked;
    },
    getYaw() {
      return euler.y;
    },
    setAiming(aiming: boolean) {
      isAiming = aiming;
    },
    update(delta: number, collisionCheck?: (newPos: Vector3) => boolean) {
      if (!isLocked) return;

      direction.z = Number(moveState.forward) - Number(moveState.backward);
      direction.x = Number(moveState.right) - Number(moveState.left);
      direction.normalize();

      const camYaw = euler.y;
      const forwardX = -Math.sin(camYaw);
      const forwardZ = -Math.cos(camYaw);
      const rightX = Math.cos(camYaw);
      const rightZ = -Math.sin(camYaw);

      const speed = isAiming ? baseSpeed * 0.65 : baseSpeed;

      velocity.x = (forwardX * direction.z + rightX * direction.x) * speed * delta;
      velocity.z = (forwardZ * direction.z + rightZ * direction.x) * speed * delta;

      proposedPos.copy(camera.position).add(velocity);

      if (!collisionCheck || collisionCheck(proposedPos)) {
        camera.position.add(velocity);
      }
    }
  };
}
