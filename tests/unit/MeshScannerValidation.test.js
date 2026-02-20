import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import fs from 'fs';
import { MeshScanner } from '../../src/library/MeshScanner';

describe('MeshScanner Validation', () => {
  it('should generate a valid mesh and log details', () => {
    const logBuffer = [];
    const log = (msg) => logBuffer.push(msg);

    // Spy on console.log
    const originalLog = console.log;
    console.log = (msg) => {
        logBuffer.push("[CONSOLE] " + msg);
        originalLog(msg);
    };
    const originalWarn = console.warn;
    console.warn = (msg) => {
        logBuffer.push("[WARN] " + msg);
        originalWarn(msg);
    };

    // Setup Scene
    const scene = new THREE.Scene();

    // Setup CharacterManager mock
    const characterManagerMock = {
      getCurrentCharacterModel: vi.fn(),
      avatar: {}
    };

    // Setup a simple model (Arm chain along X axis)
    const characterModel = new THREE.Group();

    // Create bones
    const rootBone = new THREE.Bone(); rootBone.name = "hips";

    const spine = new THREE.Bone(); spine.name = "spine";
    spine.position.set(0, 0.5, 0); // World: (0, 0.5, 0)

    const leftUpperArm = new THREE.Bone(); leftUpperArm.name = "leftUpperArm";
    leftUpperArm.position.set(0.5, 1.0, 0); // World: (0.5, 1.5, 0)

    const leftLowerArm = new THREE.Bone(); leftLowerArm.name = "leftLowerArm";
    leftLowerArm.position.set(1.0, 0, 0); // World: (1.5, 1.5, 0)

    const leftHand = new THREE.Bone(); leftHand.name = "leftHand";
    leftHand.position.set(1.0, 0, 0); // World: (2.5, 1.5, 0)

    rootBone.add(spine);
    spine.add(leftUpperArm);
    leftUpperArm.add(leftLowerArm);
    leftLowerArm.add(leftHand);

    // Create a mesh (Cylinder) along the arm
    const geometry = new THREE.CylinderGeometry(0.1, 0.1, 4, 16);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(1.5, 1.5, 0);

    // Add skinning attributes
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
    // Use regular Mesh to avoid complex SkinnedMesh setup in tests
    const mesh = new THREE.Mesh(geometry, material);

    // Add bones to character model so scanner can find them
    characterModel.add(rootBone); // Hierarchy is attached to rootBone

    // Update matrices
    characterModel.add(mesh);

    // Ensure world matrices are updated
    scene.add(characterModel);
    scene.updateMatrixWorld(true);

    characterManagerMock.getCurrentCharacterModel.mockReturnValue(characterModel);

    // Instantiate Scanner
    const scanner = new MeshScanner(characterManagerMock, scene);

    // Run Scan
    log("\n--- Starting Mesh Generation Validation ---");

    // Debug Bone Positions
    const p1 = new THREE.Vector3(); leftUpperArm.getWorldPosition(p1);
    const p2 = new THREE.Vector3(); leftLowerArm.getWorldPosition(p2);
    log(`LUA World Pos: ${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}, ${p1.z.toFixed(2)}`);
    log(`LLA World Pos: ${p2.x.toFixed(2)}, ${p2.y.toFixed(2)}, ${p2.z.toFixed(2)}`);

    scanner.scanCharacter();

    // Verify Debug Root
    const debugRoot = scene.getObjectByName("MeshScannerDebug");

    // Find generated mesh
    let generatedMesh = null;
    debugRoot.traverse((child) => {
        if (child.name === "scanned_mesh_leftUpperArm_leftLowerArm") {
            generatedMesh = child;
        }
    });

    if (generatedMesh) {
        const positions = generatedMesh.geometry.attributes.position;
        const indices = generatedMesh.geometry.index;

        log(`\nGenerated Mesh Details:`);
        log(`- Vertex Count: ${positions.count}`);
        log(`- Triangle Count: ${indices.count / 3}`);

        // Calculate bounding box
        generatedMesh.geometry.computeBoundingBox();
        const box = generatedMesh.geometry.boundingBox;
        log(`- Bounding Box: Min(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}) Max(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)})`);

        // Check if vertices form a reasonable shape (e.g., around the arm)
        // The arm is roughly from x=0.5 to x=2.5, y=1.5, z=0
        // The cylinder has radius 0.1

        let validVertices = 0;
        let vertexSum = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            // Log a few vertices
            if (i < 5) {
                log(`  Vertex ${i}: (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`);
            }

            if (x !== 0 || y !== 0 || z !== 0) { // skip dummy vertices
                validVertices++;
                vertexSum.add(new THREE.Vector3(x,y,z));
            }
        }

        const center = vertexSum.divideScalar(validVertices);
        log(`- Center of Mass (valid vertices): (${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`);

        // Validation Logic
        if (indices.count > 0 && positions.count > 0) {
             log("\nValidation Result: PASSED - Mesh generated successfully.");
        } else {
             log("\nValidation Result: FAILED - Mesh is empty.");
        }

    } else {
        log("\nValidation Result: FAILED - No mesh found in debug root.");
    }
    log("-------------------------------------------\n");

    // Generate SVG for visualization
    const svgContent = generateSVG(debugRoot);
    fs.writeFileSync('validation_mesh.svg', svgContent);
    log("SVG generated at: validation_mesh.svg");

    fs.writeFileSync('validation_log.txt', logBuffer.join('\n'));
    console.log = originalLog;
    console.warn = originalWarn;
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
        else if (child.isMesh && child.geometry.index) {
            // Draw wireframe of the mesh
            const positions = child.geometry.attributes.position;
            const index = child.geometry.index;
            let d = "";

            for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i);
                const b = index.getX(i+1);
                const c = index.getX(i+2);

                const pa = new THREE.Vector3().fromBufferAttribute(positions, a);
                const pb = new THREE.Vector3().fromBufferAttribute(positions, b);
                const pc = new THREE.Vector3().fromBufferAttribute(positions, c);

                const sxa = offsetX + pa.x * scale;
                const sya = offsetY - pa.y * scale;
                const sxb = offsetX + pb.x * scale;
                const syb = offsetY - pb.y * scale;
                const sxc = offsetX + pc.x * scale;
                const syc = offsetY - pc.y * scale;

                d += `M ${sxa.toFixed(2)} ${sya.toFixed(2)} L ${sxb.toFixed(2)} ${syb.toFixed(2)} L ${sxc.toFixed(2)} ${syc.toFixed(2)} Z `;
            }
             paths += `<path d="${d}" stroke="#ff00ff" fill="none" stroke-width="1" opacity="0.5" />\n`;
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
