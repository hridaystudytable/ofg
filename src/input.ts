import { Camera, Vector3, Euler } from 'three';

export interface InputController {
  update(delta: number, collisionCheck?: (newPos: Vector3) => boolean): void;
  isLocked: boolean;
  isCrouching: boolean;
  getYaw(): number;
  setAiming(aiming: boolean): void;
}

export function setupInput(
  camera: Camera,
  domElement: HTMLElement,
  blocker: HTMLElement,
  playBtn: HTMLElement,
  shouldBlockerShow: () => boolean,
  onThrowGrenade?: () => void
): InputController {
  let isLocked = false;
  let isAiming = false;
  let isCrouching = false;

  const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    crouch: false
  };

  const euler = new Euler(0, 0, 0, 'YXZ');
  const velocity = new Vector3();
  const direction = new Vector3();
  const proposedPos = new Vector3();

  // Jump & vertical physics
  let verticalVelocity = 0;
  const gravity = -22;
  const jumpImpulse = 7.5;
  const standingEyeHeight = 1.6;
  const crouchingEyeHeight = 0.95;
  let currentTargetEyeHeight = standingEyeHeight;
  let isGrounded = true;

  // Head bobbing cycle
  let bobTimer = 0;

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
      if (shouldBlockerShow()) {
        blocker.style.display = 'flex';
      }
    }
  });

  // Responsive mouse look
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
    // Jump with Space
    if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
      if (isGrounded) {
        // If crouching, uncrouch first and leap
        isCrouching = false;
        currentTargetEyeHeight = standingEyeHeight;
        verticalVelocity = jumpImpulse;
        isGrounded = false;
      }
      e.preventDefault();
      return;
    }

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
      case 'KeyC':
      case 'ControlLeft':
      case 'ControlRight':
        // Crouch / Seat
        isCrouching = true;
        currentTargetEyeHeight = crouchingEyeHeight;
        break;
      case 'KeyG':
        // Throw Grenade
        if (isLocked) {
          onThrowGrenade?.();
        }
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
      case 'KeyC':
      case 'ControlLeft':
      case 'ControlRight':
        isCrouching = false;
        currentTargetEyeHeight = standingEyeHeight;
        break;
    }
  });

  const baseSpeed = 5.2;

  return {
    get isLocked() {
      return isLocked;
    },
    get isCrouching() {
      return isCrouching;
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

      const isMoving = direction.z !== 0 || direction.x !== 0;

      if (isMoving) {
        direction.normalize();
      }

      const camYaw = euler.y;
      const forwardX = -Math.sin(camYaw);
      const forwardZ = -Math.cos(camYaw);
      const rightX = Math.cos(camYaw);
      const rightZ = -Math.sin(camYaw);

      // Speed modifiers: Crouch = 45%, ADS = 60%, Sprint = 100%
      let speed = baseSpeed;
      if (isCrouching) {
        speed *= 0.45;
      } else if (isAiming) {
        speed *= 0.6;
      }

      velocity.x = (forwardX * direction.z + rightX * direction.x) * speed * delta;
      velocity.z = (forwardZ * direction.z + rightZ * direction.x) * speed * delta;

      proposedPos.copy(camera.position).add(velocity);

      // Smooth step test with Wall Sliding
      if (!collisionCheck || collisionCheck(proposedPos)) {
        camera.position.x += velocity.x;
        camera.position.z += velocity.z;
      } else {
        const testX = camera.position.clone();
        testX.x += velocity.x;
        if (!collisionCheck || collisionCheck(testX)) {
          camera.position.x += velocity.x;
        }

        const testZ = camera.position.clone();
        testZ.z += velocity.z;
        if (!collisionCheck || collisionCheck(testZ)) {
          camera.position.z += velocity.z;
        }
      }

      // Vertical gravity & Jump Physics
      if (!isGrounded) {
        verticalVelocity += gravity * delta;
        camera.position.y += verticalVelocity * delta;

        // Ground check
        if (camera.position.y <= currentTargetEyeHeight) {
          camera.position.y = currentTargetEyeHeight;
          verticalVelocity = 0;
          isGrounded = true;
        }
      } else {
        // Smooth transition between crouching and standing eye height
        camera.position.y += (currentTargetEyeHeight - camera.position.y) * Math.min(1.0, delta * 14);

        // Procedural Head Bobbing (only when walking on the ground)
        if (isMoving && !isAiming) {
          bobTimer += delta * (isCrouching ? 8 : 12);
          camera.position.y += Math.sin(bobTimer) * 0.03;
        }
      }
    }
  };
}
