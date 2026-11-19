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
  // Expanded office floor: 40m x 40m
  const roomWidth = 40;
  const roomDepth = 40;
  const roomHeight = 3.2;

  // Floor with fake AO vertex coloring
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

    const ao = Math.min(1.0, 0.65 + Math.min(minDist / 2.5, 0.35));
    // Carpet tint: subtle office slate/grey
    colors.push(0.36 * ao, 0.38 * ao, 0.42 * ao);
  }

  floorGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));

  const floorMat = new MeshLambertMaterial({ vertexColors: true });
  const floorMesh = new Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Ceiling
  const ceilGeo = new BoxGeometry(roomWidth, 0.2, roomDepth);
  ceilGeo.translate(0, roomHeight + 0.1, 0);
  const ceilMat = new MeshLambertMaterial({ color: 0xdfdfdf });
  const ceilMesh = new Mesh(ceilGeo, ceilMat);
  scene.add(ceilMesh);

  // Emissive Ceiling Light Panels in regular grid
  const lightPanelGeo = new BoxGeometry(2.2, 0.04, 1.2);
  const lightPanelMat = new MeshBasicMaterial({ color: 0xfffcf0 });
  for (let x = -15; x <= 15; x += 6) {
    for (let z = -15; z <= 15; z += 6) {
      const panel = new Mesh(lightPanelGeo, lightPanelMat);
      panel.position.set(x, roomHeight - 0.02, z);
      scene.add(panel);
    }
  }

  // Outer Perimeter Walls
  const wallMat = new MeshLambertMaterial({ color: 0xdcd8d0 });
  const wallThickness = 0.5;

  const createWall = (w: number, h: number, d: number, px: number, py: number, pz: number) => {
    const geo = new BoxGeometry(w, h, d);
    const mesh = new Mesh(geo, wallMat);
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  const hH = roomHeight / 2;
  createWall(roomWidth, roomHeight, wallThickness, 0, hH, -halfD);
  createWall(roomWidth, roomHeight, wallThickness, 0, hH, halfD);
  createWall(wallThickness, roomHeight, roomDepth, -halfW, hH, 0);
  createWall(wallThickness, roomHeight, roomDepth, halfW, hH, 0);

  // Cubicle clusters setup
  const obstacles: ObstacleAABB[] = [];
  const cubicleGroup = new Group();

  const deskMat = new MeshLambertMaterial({ color: 0xbaa996 });
  const partMat = new MeshLambertMaterial({ color: 0x4a5d6e });
  const chairMat = new MeshLambertMaterial({ color: 0x2e3238 });
  const monitorMat = new MeshLambertMaterial({ color: 0x1f2326 });
  const screenMat = new MeshBasicMaterial({ color: 0x8ab4f8 });

  // Shared geometry instances for efficiency
  const deskGeo = new BoxGeometry(2.0, 0.08, 1.0);
  const partGeo = new BoxGeometry(2.2, 1.25, 0.08);
  const chairGeo = new BoxGeometry(0.55, 0.8, 0.55);
  const monBaseGeo = new BoxGeometry(0.35, 0.3, 0.08);
  const screenGeo = new BoxGeometry(0.55, 0.35, 0.04);

  const addSingleCubicle = (cx: number, cz: number, facingNorth = true) => {
    // Desk surface
    const desk = new Mesh(deskGeo, deskMat);
    desk.position.set(cx, 0.75, cz);
    desk.castShadow = true;
    desk.receiveShadow = true;
    cubicleGroup.add(desk);

    // Partition divider behind desk
    const partZ = facingNorth ? cz - 0.54 : cz + 0.54;
    const part = new Mesh(partGeo, partMat);
    part.position.set(cx, 0.65, partZ);
    part.castShadow = true;
    cubicleGroup.add(part);

    // Office Chair
    const chairZ = facingNorth ? cz + 0.45 : cz - 0.45;
    const chair = new Mesh(chairGeo, chairMat);
    chair.position.set(cx, 0.4, chairZ);
    chair.castShadow = true;
    cubicleGroup.add(chair);

    // Desk Monitor
    const mon = new Mesh(monBaseGeo, monitorMat);
    mon.position.set(cx, 0.95, facingNorth ? cz - 0.25 : cz + 0.25);
    mon.castShadow = true;
    cubicleGroup.add(mon);

    const screen = new Mesh(screenGeo, screenMat);
    screen.position.set(cx, 1.05, facingNorth ? cz - 0.22 : cz + 0.22);
    cubicleGroup.add(screen);

    // Add AABB obstacle for collision and ray hits
    obstacles.push({
      minX: cx - 1.15,
      maxX: cx + 1.15,
      minZ: cz - 0.65,
      maxZ: cz + 0.65
    });
  };

  // Generate 4 large office pods (each pod has 6 cubicles = 24 cubicles total)
  const podCenters = [
    { x: -10, z: -10 },
    { x: 10, z: -10 },
    { x: -10, z: 10 },
    { x: 10, z: 10 }
  ];

  for (const pod of podCenters) {
    for (let col = -1; col <= 1; col++) {
      const xOffset = col * 2.6;
      addSingleCubicle(pod.x + xOffset, pod.z - 0.7, true);
      addSingleCubicle(pod.x + xOffset, pod.z + 0.7, false);
    }
  }

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
    // Fast Slab ray-AABB intersection test for instant bullet hit registration
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
          minY: 0,
          maxY: 1.4,
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
