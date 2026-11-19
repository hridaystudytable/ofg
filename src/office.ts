import {
  Scene,
  BoxGeometry,
  MeshLambertMaterial,
  MeshBasicMaterial,
  Mesh,
  Float32BufferAttribute,
  Group
} from 'three';

export interface ObstacleAABB {
  minX: number;
  maxX: number;
  minY?: number;
  maxY?: number;
  minZ: number;
  maxZ: number;
}

export interface OfficeMap {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  obstacles: ObstacleAABB[];
  isWalkable(x: number, z: number, radius?: number): boolean;
  raycastBoxes(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDist: number
  ): { hit: boolean; dist: number; pointX: number; pointY: number; pointZ: number } | null;
}

export function buildOffice(scene: Scene): OfficeMap {
  const roomWidth = 36;
  const roomDepth = 36;
  const roomHeight = 3.3;

  // 1. Floor: Polished Ceramic Tiles (#eae6df) with Baked Edge AO
  const segs = 20;
  const floorGeo = new BoxGeometry(roomWidth, 0.2, roomDepth, segs, 1, segs);
  floorGeo.translate(0, -0.1, 0);

  const posAttr = floorGeo.attributes.position;
  const colors: number[] = [];
  const halfW = roomWidth / 2;
  const halfD = roomDepth / 2;

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);

    const distToEdgeX = halfW - Math.abs(x);
    const distToEdgeZ = halfD - Math.abs(z);
    const minDist = Math.min(distToEdgeX, distToEdgeZ);

    const ao = Math.min(1.0, 0.72 + Math.min(minDist / 2.5, 0.28));
    colors.push(0.92 * ao, 0.90 * ao, 0.86 * ao);
  }

  floorGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const floorMat = new MeshLambertMaterial({ vertexColors: true });
  const floorMesh = new Mesh(floorGeo, floorMat);
  scene.add(floorMesh);

  // 2. Ceiling with Recessed Light Panels
  const ceilGeo = new BoxGeometry(roomWidth, 0.2, roomDepth);
  ceilGeo.translate(0, roomHeight + 0.1, 0);
  const ceilMat = new MeshLambertMaterial({ color: 0xeeeeee });
  const ceilMesh = new Mesh(ceilGeo, ceilMat);
  scene.add(ceilMesh);

  const lightPanelGeo = new BoxGeometry(1.6, 0.04, 1.6);
  const lightPanelMat = new MeshBasicMaterial({ color: 0xfffaea });
  for (let x = -13.5; x <= 13.5; x += 4.5) {
    for (let z = -13.5; z <= 13.5; z += 4.5) {
      const panel = new Mesh(lightPanelGeo, lightPanelMat);
      panel.position.set(x, roomHeight - 0.02, z);
      scene.add(panel);
    }
  }

  // Overhead AC Cassette
  const acBoxGeo = new BoxGeometry(2.4, 0.25, 2.4);
  const acBoxMat = new MeshLambertMaterial({ color: 0xd9d3c5 });
  const acBox = new Mesh(acBoxGeo, acBoxMat);
  acBox.position.set(0, roomHeight - 0.12, 0);
  scene.add(acBox);

  // 3. Walls
  const wallMat = new MeshLambertMaterial({ color: 0xf4f3ef });
  const wallThickness = 0.5;

  const createWall = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
    const geo = new BoxGeometry(w, h, d);
    const mesh = new Mesh(geo, wallMat);
    mesh.position.set(px, py, pz);
    scene.add(mesh);
  };

  const hH = roomHeight / 2;
  createWall(roomWidth, roomHeight, wallThickness, 0, hH, -halfD);
  createWall(roomWidth, roomHeight, wallThickness, 0, hH, halfD);
  createWall(wallThickness, roomHeight, roomDepth, -halfW, hH, 0);

  // Windows wall on East
  const windowFrameMat = new MeshLambertMaterial({ color: 0x22252a });
  const windowGlassMat = new MeshBasicMaterial({ color: 0xcde2f2, transparent: true, opacity: 0.65 });

  const windowWall = new Mesh(new BoxGeometry(wallThickness, roomHeight, roomDepth), wallMat);
  windowWall.position.set(halfW, hH, 0);
  scene.add(windowWall);

  for (let z = -12; z <= 12; z += 6) {
    const glass = new Mesh(new BoxGeometry(0.1, 2.2, 4.2), windowGlassMat);
    glass.position.set(halfW - 0.2, 1.6, z);
    scene.add(glass);

    const frame = new Mesh(new BoxGeometry(0.12, 2.25, 4.3), windowFrameMat);
    frame.position.set(halfW - 0.22, 1.6, z);
    scene.add(frame);
  }

  // 4. White Structural Pillars
  const pillarMat = new MeshLambertMaterial({ color: 0xf8f7f4 });
  const obstacles: ObstacleAABB[] = [];

  const addPillar = (px: number, pz: number, size = 1.4) => {
    const geo = new BoxGeometry(size, roomHeight, size);
    const mesh = new Mesh(geo, pillarMat);
    mesh.position.set(px, hH, pz);
    scene.add(mesh);

    obstacles.push({
      minX: px - size / 2,
      maxX: px + size / 2,
      minZ: pz - size / 2,
      maxZ: pz + size / 2
    });
  };

  addPillar(-6, -6, 1.5);
  addPillar(6, -6, 1.5);
  addPillar(-6, 6, 1.5);
  addPillar(6, 6, 1.5);

  // 5. Workstations & Cubicles (Accurately Oriented)
  // Desks run longitudinally North-South or East-West:
  // Here, divider glass is between back-to-back desks, with chairs facing inwards toward the desk and aisle behind.
  const deskWoodMat = new MeshLambertMaterial({ color: 0xd2ab7a });
  const frameBlackMat = new MeshLambertMaterial({ color: 0x1f2327 });
  const screenTealMat = new MeshLambertMaterial({ color: 0x82a9ab });
  const whiteBoardMat = new MeshLambertMaterial({ color: 0xe8eef0 });
  const cabinetWoodMat = new MeshLambertMaterial({ color: 0xcfa470 });
  const handleMat = new MeshBasicMaterial({ color: 0xdfe3e6 });
  const chairMat = new MeshLambertMaterial({ color: 0x181a1d });

  const cubicleGroup = new Group();

  const deskTopGeo = new BoxGeometry(2.2, 0.06, 1.1);
  const underFrameGeo = new BoxGeometry(2.18, 0.72, 0.04);
  const pedestalGeo = new BoxGeometry(0.48, 0.68, 0.75);
  const handleGeo = new BoxGeometry(0.16, 0.02, 0.02);
  const frostedScreenGeo = new BoxGeometry(2.2, 0.62, 0.05);
  const screenTrimGeo = new BoxGeometry(2.22, 0.04, 0.06);
  const endPartitionGeo = new BoxGeometry(0.06, 1.25, 1.15);

  // Corrected Orientation:
  // facingNorth = true: Desk is placed with divider partition on NORTH (+Z direction from chair),
  // chair is placed SOUTH (sitting and looking North into the computer monitor).
  const addOfficeWorkstation = (cx: number, cz: number, facingNorth = true) => {
    // 1. Desk top
    const desk = new Mesh(deskTopGeo, deskWoodMat);
    desk.position.set(cx, 0.75, cz);
    cubicleGroup.add(desk);

    // 2. Modesty panel underneath
    const modestyZ = facingNorth ? cz - 0.48 : cz + 0.48;
    const modesty = new Mesh(underFrameGeo, frameBlackMat);
    modesty.position.set(cx, 0.36, modestyZ);
    cubicleGroup.add(modesty);

    // 3. Wooden drawer pedestal under desk
    const pedX = cx + 0.72;
    const pedZ = facingNorth ? cz - 0.12 : cz + 0.12;
    const ped = new Mesh(pedestalGeo, cabinetWoodMat);
    ped.position.set(pedX, 0.34, pedZ);
    cubicleGroup.add(ped);

    // Silver handles facing the user/chair
    const handleZ = facingNorth ? pedZ + 0.38 : pedZ - 0.38;
    for (let y = 0.22; y <= 0.55; y += 0.16) {
      const hndl = new Mesh(handleGeo, handleMat);
      hndl.position.set(pedX, y, handleZ);
      cubicleGroup.add(hndl);
    }

    // 4. Privacy Screen (Glass Divider placed between back-to-back desks)
    // For facingNorth, the glass divider is behind the desk (cz - 0.55).
    // For facingSouth, the glass divider is behind the desk (cz + 0.55).
    const dividerZ = facingNorth ? cz - 0.55 : cz + 0.55;
    const frostedScreen = new Mesh(frostedScreenGeo, screenTealMat);
    frostedScreen.position.set(cx, 1.05, dividerZ);
    cubicleGroup.add(frostedScreen);

    const trim = new Mesh(screenTrimGeo, frameBlackMat);
    trim.position.set(cx, 1.37, dividerZ);
    cubicleGroup.add(trim);

    // Side partition divider
    const sidePart = new Mesh(endPartitionGeo, whiteBoardMat);
    sidePart.position.set(cx - 1.1, 0.85, cz);
    cubicleGroup.add(sidePart);

    // 5. Office Chair (Positioned in the open aisle facing the desk)
    const chairZ = facingNorth ? cz + 0.45 : cz - 0.45;
    const chairBase = new Mesh(new BoxGeometry(0.52, 0.45, 0.52), chairMat);
    chairBase.position.set(cx - 0.15, 0.25, chairZ);
    cubicleGroup.add(chairBase);

    const chairBackZ = facingNorth ? chairZ + 0.22 : chairZ - 0.22;
    const chairBack = new Mesh(new BoxGeometry(0.48, 0.52, 0.08), chairMat);
    chairBack.position.set(cx - 0.15, 0.72, chairBackZ);
    cubicleGroup.add(chairBack);

    // 6. Laptop placed on desk facing the chair
    const laptop = new Mesh(new BoxGeometry(0.38, 0.02, 0.28), frameBlackMat);
    laptop.position.set(cx - 0.15, 0.79, cz);
    cubicleGroup.add(laptop);

    const screenZ = facingNorth ? cz - 0.12 : cz + 0.12;
    const screen = new Mesh(new BoxGeometry(0.38, 0.26, 0.02), frameBlackMat);
    screen.position.set(cx - 0.15, 0.92, screenZ);
    screen.rotation.x = facingNorth ? -0.2 : 0.2;
    cubicleGroup.add(screen);

    obstacles.push({
      minX: cx - 1.15,
      maxX: cx + 1.15,
      minZ: cz - 0.6,
      maxZ: cz + 0.6
    });
  };

  // 6. End Storage Credenzas / Cabinets (Matches photo foreground)
  const cabinetGeo = new BoxGeometry(1.2, 1.25, 2.4);
  const addEndCabinet = (cx: number, cz: number) => {
    const cab = new Mesh(cabinetGeo, cabinetWoodMat);
    cab.position.set(cx, 0.625, cz);
    cubicleGroup.add(cab);

    const cap = new Mesh(new BoxGeometry(0.04, 1.24, 2.38), whiteBoardMat);
    cap.position.set(cx + 0.61, 0.625, cz);
    cubicleGroup.add(cap);

    obstacles.push({
      minX: cx - 0.65,
      maxX: cx + 0.65,
      minZ: cz - 1.25,
      maxZ: cz + 1.25
    });
  };

  // Pod Arrays:
  // Pod 1 & 2 (North Hall) - Two desks facing each other back-to-back across the frosted glass divider
  for (let col = -2; col <= 1; col++) {
    const x = col * 2.35 - 3.5;
    addOfficeWorkstation(x, -9.0, false); // Chair is at -9.45, looking North towards desk
    addOfficeWorkstation(x, -7.8, true);  // Chair is at -7.35, looking South towards desk
  }
  addEndCabinet(-9.4, -8.4);

  for (let col = -1; col <= 2; col++) {
    const x = col * 2.35 + 5.5;
    addOfficeWorkstation(x, -9.0, false);
    addOfficeWorkstation(x, -7.8, true);
  }
  addEndCabinet(11.4, -8.4);

  // Pod 3 & 4 (South Hall)
  for (let col = -2; col <= 1; col++) {
    const x = col * 2.35 - 3.5;
    addOfficeWorkstation(x, 7.8, false);
    addOfficeWorkstation(x, 9.0, true);
  }
  addEndCabinet(-9.4, 8.4);

  for (let col = -1; col <= 2; col++) {
    const x = col * 2.35 + 5.5;
    addOfficeWorkstation(x, 7.8, false);
    addOfficeWorkstation(x, 9.0, true);
  }
  addEndCabinet(11.4, 8.4);

  scene.add(cubicleGroup);

  const bounds = {
    minX: -halfW + 0.6,
    maxX: halfW - 0.6,
    minZ: -halfD + 0.6,
    maxZ: halfD - 0.6
  };

  return {
    bounds,
    obstacles,
    isWalkable(x: number, z: number, radius = 0.35) {
      if (
        x - radius < bounds.minX ||
        x + radius > bounds.maxX ||
        z - radius < bounds.minZ ||
        z + radius > bounds.maxZ
      ) {
        return false;
      }
      for (const obs of obstacles) {
        if (
          x + radius > obs.minX &&
          x - radius < obs.maxX &&
          z + radius > obs.minZ &&
          z - radius < obs.maxZ
        ) {
          return false;
        }
      }
      return true;
    },
    raycastBoxes(ox, oy, oz, dx, dy, dz, maxDist) {
      let closestDist = maxDist;
      let hit = false;
      let hitX = 0, hitY = 0, hitZ = 0;

      const wallBoxes: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }[] = [
        { minX: bounds.minX, maxX: bounds.maxX, minY: 0, maxY: roomHeight, minZ: bounds.minZ - 0.2, maxZ: bounds.minZ + 0.1 },
        { minX: bounds.minX, maxX: bounds.maxX, minY: 0, maxY: roomHeight, minZ: bounds.maxZ - 0.1, maxZ: bounds.maxZ + 0.2 },
        { minX: bounds.minX - 0.2, maxX: bounds.minX + 0.1, minY: 0, maxY: roomHeight, minZ: bounds.minZ, maxZ: bounds.maxZ },
        { minX: bounds.maxX - 0.1, maxX: bounds.maxX + 0.2, minY: 0, maxY: roomHeight, minZ: bounds.minZ, maxZ: bounds.maxZ },
        { minX: bounds.minX, maxX: bounds.maxX, minY: -0.2, maxY: 0.05, minZ: bounds.minZ, maxZ: bounds.maxZ },
        { minX: bounds.minX, maxX: bounds.maxX, minY: roomHeight - 0.05, maxY: roomHeight + 0.2, minZ: bounds.minZ, maxZ: bounds.maxZ }
      ];

      const allBoxes = [
        ...wallBoxes,
        ...obstacles.map((obs) => ({
          minX: obs.minX,
          maxX: obs.maxX,
          minY: obs.minY ?? 0,
          maxY: obs.maxY ?? 1.45,
          minZ: obs.minZ,
          maxZ: obs.maxZ
        }))
      ];

      for (const b of allBoxes) {
        const invDx = 1 / (dx || 1e-8);
        const invDy = 1 / (dy || 1e-8);
        const invDz = 1 / (dz || 1e-8);

        const t1 = (b.minX - ox) * invDx;
        const t2 = (b.maxX - ox) * invDx;
        const t3 = (b.minY - oy) * invDy;
        const t4 = (b.maxY - oy) * invDy;
        const t5 = (b.minZ - oz) * invDz;
        const t6 = (b.maxZ - oz) * invDz;

        const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
        const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

        if (tmax >= 0 && tmin <= tmax && tmin < closestDist && tmin > 0.1) {
          closestDist = tmin;
          hit = true;
          hitX = ox + dx * tmin;
          hitY = oy + dy * tmin;
          hitZ = oz + dz * tmin;
        }
      }

      if (hit) {
        return { hit: true, dist: closestDist, pointX: hitX, pointY: hitY, pointZ: hitZ };
      }
      return null;
    }
  };
}
