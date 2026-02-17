import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { MeshScanner } from '../../src/library/MeshScanner';

describe('MeshScanner', () => {
  it('should scan and add debug lines to the scene (Standard VRM Names)', () => {
    // Setup Scene
    const scene = new THREE.Scene();

    // Setup CharacterManager mock
    const characterManagerMock = {
      getCurrentCharacterModel: vi.fn(),
      avatar: {}
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

    // Generate SVG for visualization
    const svgContent = generateSVG(debugRoot);
    const outputPath = path.resolve(process.cwd(), 'test_scan_output.svg');
    fs.writeFileSync(outputPath, svgContent);
    //console.log(`SVG generated at: ${outputPath}`);
  });

  it('should scan and add debug lines to the scene (Arbitrary Bone Names with VRM Mapping)', () => {
    // Setup Scene
    const scene = new THREE.Scene();

    // Setup CharacterManager mock
    const characterManagerMock = {
      getCurrentCharacterModel: vi.fn(),
      avatar: {}
    };

    // Setup a simple model
    const characterModel = new THREE.Group();

    // Create bones with Mixamo-like names
    const boneMap = {};
    const createBone = (name, pos) => {
        const bone = new THREE.Bone();
        bone.name = name;
        bone.position.copy(pos);
        bone.updateMatrixWorld(true);
        boneMap[name] = bone;
        return bone;
    };

    const rootBone = createBone("mixamorig:Hips", new THREE.Vector3(0,0,0));
    const spine = createBone("mixamorig:Spine", new THREE.Vector3(0, 0.5, 0));

    // Arm chain
    const leftUpperArm = createBone("mixamorig:LeftArm", new THREE.Vector3(0.5, 1.5, 0));
    const leftLowerArm = createBone("mixamorig:LeftForeArm", new THREE.Vector3(1.5, 1.5, 0));
    const leftHand = createBone("mixamorig:LeftHand", new THREE.Vector3(2.5, 1.5, 0));

    rootBone.add(spine);
    spine.add(leftUpperArm);
    leftUpperArm.add(leftLowerArm);
    leftLowerArm.add(leftHand);

    // Create a mesh (Cylinder) along the arm
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 4, 16);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(1.5, 1.5, 0);

    const position = geometry.attributes.position;
    const vertexCount = position.count;
    const skinIndices = [];
    const skinWeights = [];
    for (let i = 0; i < vertexCount; i++) {
        skinIndices.push(0, 0, 0, 0);
        skinWeights.push(1, 0, 0, 0);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const material = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(rootBone);
    mesh.bind(new THREE.Skeleton([rootBone, spine, leftUpperArm, leftLowerArm, leftHand]));

    rootBone.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);

    characterModel.add(mesh);
    characterManagerMock.getCurrentCharacterModel.mockReturnValue(characterModel);

    // --- MOCK VRM HUMAN NODE MAPPING ---
    const mockVRM = {
        humanoid: {
            getNormalizedBoneNode: (name) => {
                const mapping = {
                    "hips": boneMap["mixamorig:Hips"],
                    "spine": boneMap["mixamorig:Spine"],
                    "leftUpperArm": boneMap["mixamorig:LeftArm"],
                    "leftLowerArm": boneMap["mixamorig:LeftForeArm"],
                    "leftHand": boneMap["mixamorig:LeftHand"]
                };
                return mapping[name];
            }
        }
    };

    // Add VRM to avatar
    characterManagerMock.avatar = {
        "Body": {
            vrm: mockVRM
        }
    };

    // Instantiate Scanner
    const scanner = new MeshScanner(characterManagerMock, scene);

    // Run Scan
    scanner.scanCharacter();

    // Verify Debug Root
    const debugRoot = scene.getObjectByName("MeshScannerDebug");
    expect(debugRoot).toBeDefined();

    // Expect children (lines/tubes)
    // We expect rings and longitudinal lines because the scanner found the bones via VRM mapping.
    console.log(`Debug lines generated (VRM Mapping): ${debugRoot.children.length}`);
    expect(debugRoot.children.length).toBeGreaterThan(0);
  });
});

function generateSVG(object3D) {
    const width = 800;
    const height = 600;
    const scale = 100; // 1 unit = 100 pixels
    const offsetX = 100;
    const offsetY = 500; // SVG Y is down, so we flip Y by subtracting from offsetY

    let paths = "";

    object3D.traverse((child) => {
        if (child.isLine) {
            const positions = child.geometry.attributes.position.array;
            let d = "";
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                // Project to SVG coords (XY plane)
                const sx = offsetX + x * scale;
                const sy = offsetY - y * scale;

                if (i === 0) {
                    d += `M ${sx.toFixed(2)} ${sy.toFixed(2)}`;
                } else {
                    d += ` L ${sx.toFixed(2)} ${sy.toFixed(2)}`;
                }
            }

            const color = child.material.color.getHexString();
            // Default color if undefined
            const strokeColor = color ? `#${color}` : "#00ff00";

            paths += `<path d="${d}" stroke="${strokeColor}" fill="none" stroke-width="2" />\n`;
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #111;">
    <title>Mesh Scanner Debug Output</title>
    <desc>Visualisation of the scanned mesh rings and splines</desc>
    <!-- Grid -->
    <path d="M ${offsetX} 0 L ${offsetX} ${height}" stroke="#333" stroke-width="1" />
    <path d="M 0 ${offsetY} L ${width} ${offsetY}" stroke="#333" stroke-width="1" />
    ${paths}
</svg>`;
}
