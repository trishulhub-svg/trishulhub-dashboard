"use client";

import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

interface ParticleCanvasProps {
  shapeIndex: number;
  mode: string;
}

/* ── Shape generators ── */
function generateSpherePositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 2.5;
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function generateCubePositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const s = 2;
  for (let i = 0; i < count; i++) {
    // Distribute on cube surface
    const face = Math.floor(Math.random() * 6);
    const u = (Math.random() - 0.5) * 2 * s;
    const v = (Math.random() - 0.5) * 2 * s;
    switch (face) {
      case 0: positions[i*3]=s; positions[i*3+1]=u; positions[i*3+2]=v; break;
      case 1: positions[i*3]=-s; positions[i*3+1]=u; positions[i*3+2]=v; break;
      case 2: positions[i*3]=u; positions[i*3+1]=s; positions[i*3+2]=v; break;
      case 3: positions[i*3]=u; positions[i*3+1]=-s; positions[i*3+2]=v; break;
      case 4: positions[i*3]=u; positions[i*3+1]=v; positions[i*3+2]=s; break;
      case 5: positions[i*3]=u; positions[i*3+1]=v; positions[i*3+2]=-s; break;
    }
  }
  return positions;
}

function generatePyramidPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const h = 3;
  const base = 2.2;
  const apex = [0, h * 0.6, 0];
  const corners = [
    [-base, -h * 0.4, -base],
    [base, -h * 0.4, -base],
    [base, -h * 0.4, base],
    [-base, -h * 0.4, base],
  ];

  for (let i = 0; i < count; i++) {
    const face = Math.floor(Math.random() * 4);
    const c0 = corners[face];
    const c1 = corners[(face + 1) % 4];

    // Random barycentric coords on triangle face
    let r1 = Math.random();
    let r2 = Math.random();
    if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    const r3 = 1 - r1 - r2;

    positions[i * 3] = r1 * c0[0] + r2 * c1[0] + r3 * apex[0];
    positions[i * 3 + 1] = r1 * c0[1] + r2 * c1[1] + r3 * apex[1];
    positions[i * 3 + 2] = r1 * c0[2] + r2 * c1[2] + r3 * apex[2];
  }
  return positions;
}

function generateTorusPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const R = 2.2; // major radius
  const r = 0.8; // minor radius
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI * 2;
    positions[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
    positions[i * 3 + 1] = r * Math.sin(v);
    positions[i * 3 + 2] = (R + r * Math.cos(v)) * Math.sin(u);
  }
  return positions;
}

function generateGalaxyPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const arms = 3;
  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    const armAngle = (arm / arms) * Math.PI * 2;
    const dist = Math.random() * 3;
    const angle = armAngle + dist * 1.5;
    const spread = (0.3 + dist * 0.15) * (Math.random() - 0.5) * 2;
    const spreadY = (Math.random() - 0.5) * 0.3;

    positions[i * 3] = Math.cos(angle) * dist + spread;
    positions[i * 3 + 1] = spreadY;
    positions[i * 3 + 2] = Math.sin(angle) * dist + spread;
  }
  return positions;
}

function generateWavePositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 6;
    const z = (Math.random() - 0.5) * 6;
    const y = Math.sin(x * 1.5) * Math.cos(z * 1.5) * 0.8;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

const PARTICLE_COUNT = 4000;
const shapeGenerators = [
  generateSpherePositions,
  generateCubePositions,
  generatePyramidPositions,
  generateTorusPositions,
  generateGalaxyPositions,
  generateWavePositions,
];

export default function ParticleCanvas({ shapeIndex, mode }: ParticleCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    particles: THREE.Points;
    targetPositions: Float32Array;
    mouse: { x: number; y: number };
    frameId: number;
    clock: THREE.Clock;
  } | null>(null);

  const getParticleColor = useCallback(() => {
    if (mode === "light") return new THREE.Color("#2563eb");
    if (mode === "bluelight") return new THREE.Color("#f59e0b");
    return new THREE.Color("#00d4ff");
  }, [mode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Particles
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);

    // Initialize with first shape
    const initialPositions = shapeGenerators[0](PARTICLE_COUNT);
    positions.set(initialPositions);

    const baseColor = getParticleColor();
    const accentColor = new THREE.Color("#a855f7");
    if (mode === "bluelight") {
      accentColor.set("#fbbf24");
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const mix = Math.random();
      const c = baseColor.clone().lerp(accentColor, mix * 0.4);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = Math.random() * 3 + 1;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Custom shader material for better-looking particles
    const vertexShader = `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    const fragmentShader = `
      varying vec3 vColor;
      void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
        gl_FragColor = vec4(vColor, alpha * 0.8);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const targetPositions = new Float32Array(initialPositions);
    const mouse = { x: 0, y: 0 };
    const clock = new THREE.Clock();

    // Store refs
    sceneRef.current = {
      scene, camera, renderer, particles, targetPositions, mouse, frameId: 0, clock,
    };

    // Mouse handler
    const onMouseMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMouseMove);

    // Resize handler
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Animation loop
    const animate = () => {
      const ref = sceneRef.current;
      if (!ref) return;
      const { particles: pts, targetPositions: targets, camera: cam } = ref;
      const posAttr = pts.geometry.attributes.position;
      const posArr = posAttr.array as Float32Array;

      // Lerp positions toward target
      for (let i = 0; i < posArr.length; i++) {
        posArr[i] += (targets[i] - posArr[i]) * 0.02;
      }
      posAttr.needsUpdate = true;

      // Gentle rotation + mouse influence
      const time = clock.getElapsedTime();
      pts.rotation.y += 0.001;
      pts.rotation.x += 0.0005;
      cam.position.x += (mouse.x * 0.8 - cam.position.x) * 0.02;
      cam.position.y += (mouse.y * 0.5 - cam.position.y) * 0.02;
      cam.lookAt(0, 0, 0);

      renderer.render(scene, cam);
      ref.frameId = requestAnimationFrame(animate);
    };

    ref.frameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(sceneRef.current?.frameId || 0);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getParticleColor]);

  // Update target positions when shape changes
  useEffect(() => {
    const ref = sceneRef.current;
    if (!ref) return;
    const newPositions = shapeGenerators[shapeIndex % shapeGenerators.length](PARTICLE_COUNT);
    ref.targetPositions.set(newPositions);

    // Update colors based on shape
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const baseColor = getParticleColor();
    const accentColor = new THREE.Color("#a855f7");
    if (mode === "bluelight") accentColor.set("#fbbf24");

    const shapeColors = [
      new THREE.Color("#00d4ff"), // sphere - cyan
      new THREE.Color("#6366f1"), // cube - indigo
      new THREE.Color("#10b981"), // pyramid - emerald
      new THREE.Color("#ec4899"), // torus - pink
      new THREE.Color("#8b5cf6"), // galaxy - violet
      new THREE.Color("#f59e0b"), // wave - amber
    ];

    const shapeBase = mode === "light"
      ? new THREE.Color("#1e40af")
      : mode === "bluelight"
      ? new THREE.Color("#d97706")
      : shapeColors[shapeIndex % shapeColors.length];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const mix = Math.random();
      const c = shapeBase.clone().lerp(accentColor, mix * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    ref.particles.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }, [shapeIndex, mode, getParticleColor]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
