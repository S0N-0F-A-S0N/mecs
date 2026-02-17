import * as THREE from "three";

export class MeshScanner {
  constructor(characterManager, scene) {
    this.characterManager = characterManager;
    this.scene = scene;
    this.debugRoot = new THREE.Group();
    this.debugRoot.name = "MeshScannerDebug";
    this.scene.add(this.debugRoot);

    // Default settings
    this.stepCount = 5; // Number of rings per bone
    this.raysPerStep = 8; // Number of rays per ring
    this.rayMaxDistance = 1.0; // Max ray distance
  }

  /**
   * Scans the entire character based on standard bone chains.
   */
  scanCharacter() {
    this.clearDebug();

    // Collect all SkinnedMeshes to raycast against
    const meshes = [];
    const model = this.characterManager.getCurrentCharacterModel();
    if (!model) {
      console.warn("MeshScanner: No character model found.");
      return;
    }

    model.traverse((child) => {
      if (child.isSkinnedMesh || child.isMesh) {
        if (child.visible) {
          meshes.push(child);
        }
      }
    });

    if (meshes.length === 0) {
      console.warn("MeshScanner: No meshes found to scan.");
      return;
    }

    console.log(`MeshScanner: Found ${meshes.length} meshes.`);

    // Temporarily set DoubleSide to ensure we hit backfaces if inside
    const originalSides = new Map();
    meshes.forEach(mesh => {
        if (mesh.material) {
            // Handle array materials
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            mats.forEach(mat => {
                if (!originalSides.has(mat)) {
                    originalSides.set(mat, mat.side);
                    mat.side = THREE.DoubleSide;
                }
            });
        }
    });

    try {
        // Define standard chains (VRM bone names)
        const chains = [
            ["leftUpperArm", "leftLowerArm", "leftHand"],
            ["rightUpperArm", "rightLowerArm", "rightHand"],
            ["leftUpperLeg", "leftLowerLeg", "leftFoot"],
            ["rightUpperLeg", "rightLowerLeg", "rightFoot"],
            ["hips", "spine", "chest", "upperChest", "neck", "head"]
        ];

        chains.forEach(chain => {
            this.scanChain(chain, meshes);
        });
    } finally {
        console.log("MeshScanner: Scan complete.");
        // Restore material sides
        originalSides.forEach((side, mat) => {
            mat.side = side;
        });
    }
  }

  /**
   * Scans a chain of bones.
   * @param {string[]} boneNames - Array of VRM bone names.
   * @param {THREE.Mesh[]} meshes - Meshes to raycast against.
   */
  scanChain(boneNames, meshes) {
      const model = this.characterManager.getCurrentCharacterModel();

      for (let i = 0; i < boneNames.length - 1; i++) {
          const startBoneName = boneNames[i];
          const endBoneName = boneNames[i+1];

          // Find bones in the character hierarchy
          let startBone = model.getObjectByName(startBoneName);
          let endBone = model.getObjectByName(endBoneName);

          // Fallback: If not found in character model, check the parent model or scene
          if (!startBone) startBone = this.scene.getObjectByName(startBoneName);
          if (!endBone) endBone = this.scene.getObjectByName(endBoneName);

          if (startBone && endBone) {
              this.scanBoneSegment(startBone, endBone, meshes);
          } else {
              console.warn(`MeshScanner: Could not find bones for segment ${startBoneName} -> ${endBoneName}`);
          }
      }
  }

  /**
   * Scans the segment between two bones.
   * @param {THREE.Bone} startBone
   * @param {THREE.Bone} endBone
   * @param {THREE.Mesh[]} meshes
   */
  scanBoneSegment(startBone, endBone, meshes) {
    const startPos = new THREE.Vector3();
    const endPos = new THREE.Vector3();

    startBone.getWorldPosition(startPos);
    endBone.getWorldPosition(endPos);

    const segmentVector = new THREE.Vector3().subVectors(endPos, startPos);
    const segmentLength = segmentVector.length();

    // Safety check for zero length bones
    if (segmentLength < 0.001) return;

    const axis = segmentVector.clone().normalize();

    // Create a basis for the rings (perpendicular to axis)
    let perp1 = new THREE.Vector3(0, 1, 0);
    if (Math.abs(axis.y) > 0.9) {
        perp1 = new THREE.Vector3(1, 0, 0);
    }
    const perp2 = new THREE.Vector3().crossVectors(axis, perp1).normalize();
    perp1.crossVectors(perp2, axis).normalize();

    const raycaster = new THREE.Raycaster();
    const rings = [];

    for (let i = 0; i <= this.stepCount; i++) {
        const t = i / this.stepCount;
        const center = new THREE.Vector3().copy(startPos).addScaledVector(segmentVector, t);

        const ringPoints = [];

        for (let j = 0; j < this.raysPerStep; j++) {
            const angle = (j / this.raysPerStep) * Math.PI * 2;
            const dir = new THREE.Vector3()
                .addScaledVector(perp1, Math.cos(angle))
                .addScaledVector(perp2, Math.sin(angle))
                .normalize();

            raycaster.set(center, dir);
            raycaster.near = 0;
            raycaster.far = this.rayMaxDistance;

            const intersects = raycaster.intersectObjects(meshes, false);

            if (intersects.length > 0) {
                // Find the closest intersection that is not "too close" (self-intersection issue?)
                // Since we cast from center, the first hit is the inside surface.
                ringPoints.push(intersects[0].point);
            } else {
                ringPoints.push(null);
            }
        }
        rings.push(ringPoints);
    }

    console.log(`MeshScanner: Scanned segment ${startBone.name}->${endBone.name}, generated ${rings.length} rings.`);
    this.visualizeRings(rings);
  }

  visualizeRings(rings) {
    // 1. Draw Rings
    const ringMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false });

    rings.forEach(ring => {
        const points = [];
        ring.forEach(p => {
            if (p) points.push(p);
        });

        if (points.length > 2) {
             points.push(points[0]);
             const geometry = new THREE.BufferGeometry().setFromPoints(points);
             const line = new THREE.Line(geometry, ringMaterial);
             this.debugRoot.add(line);
        }
    });

    // 2. Draw Longitudinal splines (tubes) for better visual
    const splineMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, opacity: 0.8, transparent: true, depthTest: false });

    const raysPerStep = this.raysPerStep; // Should match what was used

    for (let j = 0; j < raysPerStep; j++) {
        const points = [];
        for (let i = 0; i < rings.length; i++) {
            const p = rings[i][j];
            if (p) points.push(p);
        }

        if (points.length > 1) {
             const curve = new THREE.CatmullRomCurve3(points);
             // Create a tube or line? Line is faster for debug.
             const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(50));
             const line = new THREE.Line(geometry, splineMaterial);
             this.debugRoot.add(line);
        }
    }
  }

  clearDebug() {
    while(this.debugRoot.children.length > 0){
        const child = this.debugRoot.children[0];
        this.debugRoot.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }
  }
}
