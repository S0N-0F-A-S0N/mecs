import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MeshScanner } from '../../src/library/MeshScanner';

describe('MeshScanner', () => {
  it('should scan and add debug lines to the scene', () => {
    // Setup Scene
    const scene = new THREE.Scene();

    // Setup CharacterManager mock
    const characterManagerMock = {
      getCurrentCharacterModel: vi.fn(),
    };

    // Setup a simple model
    const characterModel = new THREE.Group();

    // Create bones
    const boneMap = {};

    // Helper to create bones
    const createBone = (name, pos) => {
        const bone = new THREE.Bone();
        bone.name = name;
        bone.position.copy(pos);
        // We need updateMatrixWorld for raycaster to work correctly with transforms
        bone.updateMatrixWorld(true);
        boneMap[name] = bone;
        return bone;
    };

    const rootBone = createBone("hips", new THREE.Vector3(0,0,0));
    const spine = createBone("spine", new THREE.Vector3(0, 0.5, 0));

    // Arm chain
    const leftUpperArm = createBone("leftUpperArm", new THREE.Vector3(0.5, 1.5, 0));
    const leftLowerArm = createBone("leftLowerArm", new THREE.Vector3(1.5, 1.5, 0)); // Length 1
    const leftHand = createBone("leftHand", new THREE.Vector3(2.5, 1.5, 0)); // Length 1

    rootBone.add(spine);
    spine.add(leftUpperArm);
    leftUpperArm.add(leftLowerArm);
    leftLowerArm.add(leftHand);

    // Create a mesh (Cylinder) along the arm
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 4, 16);
    // Rotate cylinder to align with X axis (since arm is along X)
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(1.5, 1.5, 0);

    // Add skinning attributes required for SkinnedMesh raycasting
    const position = geometry.attributes.position;
    const vertexCount = position.count;

    const skinIndices = [];
    const skinWeights = [];

    for (let i = 0; i < vertexCount; i++) {
        // Simple skinning: just use root bone (index 0) for all vertices
        skinIndices.push(0, 0, 0, 0);
        skinWeights.push(1, 0, 0, 0);
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(rootBone); // Add skeleton to mesh
    mesh.bind(new THREE.Skeleton([rootBone, spine, leftUpperArm, leftLowerArm, leftHand]));

    // Update matrices
    rootBone.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);

    characterModel.add(mesh);
    characterManagerMock.getCurrentCharacterModel.mockReturnValue(characterModel);

    // Instantiate Scanner
    const scanner = new MeshScanner(characterManagerMock, scene);

    // Run Scan
    scanner.scanCharacter();

    // Verify Debug Root
    const debugRoot = scene.getObjectByName("MeshScannerDebug");
    expect(debugRoot).toBeDefined();

    // Expect children (lines/tubes)
    // We expect rings and longitudinal lines.
    console.log(`Debug lines generated: ${debugRoot.children.length}`);
    expect(debugRoot.children.length).toBeGreaterThan(0);
  });
});
