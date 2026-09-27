import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const OceanWaveMesh: React.FC<{ activeTarget: string }> = ({ activeTarget }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const particlesRef = useRef<THREE.Points>(null!);

  // Generate 3D bathymetric wave vertices
  const { geometry, count } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(16, 9, 64, 48);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // create oceanic trench and thermal ridge topology
      const z = Math.sin(x * 0.5) * Math.cos(y * 0.6) * 0.8 - Math.exp(-((x - 1) ** 2 + y ** 2) * 0.5) * 1.2;
      pos.setZ(i, z);
    }
    geo.computeVertexNormals();
    return { geometry: geo, count: pos.count };
  }, []);

  // Bioluminescent depth particles
  const particleGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(200 * 3);
    for (let i = 0; i < 200; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2 - 0.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      const pos = meshRef.current.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const u = pos.getX(i);
        const v = pos.getY(i);
        const wave = Math.sin(u * 0.6 + t * 0.8) * Math.cos(v * 0.7 + t * 0.6) * 0.25;
        const ridge = Math.exp(-((u - 1.5) ** 2 + v ** 2) * 0.3) * (0.8 + Math.sin(t * 1.5) * 0.15);
        pos.setZ(i, wave + ridge - 0.8);
      }
      pos.needsUpdate = true;
      meshRef.current.geometry.computeVertexNormals();
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.z = t * 0.04;
    }
  });

  return (
    <group position={[0, -0.2, 0]} rotation={[-Math.PI / 3.4, 0, 0]}>
      {/* 3D Dynamic Oceanic Bathymetry Surface */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshStandardMaterial
          color="#0284c7"
          roughness={0.2}
          metalness={0.8}
          wireframe={false}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Wireframe Grid Overlay for Tactical Tech aesthetic */}
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color="#22d3ee"
          wireframe
          transparent
          opacity={0.25}
        />
      </mesh>

      {/* Bioluminescent Float Drift Particles */}
      <points ref={particlesRef} geometry={particleGeo}>
        <pointsMaterial size={0.06} color="#38bdf8" transparent opacity={0.6} />
      </points>
    </group>
  );
};

export const OceanTerrain3D: React.FC<{ activeTarget: string }> = ({ activeTarget }) => {
  return (
    <div className="w-full h-full absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, -3.2, 5.2], fov: 48 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 8, 5]} intensity={1.4} color="#38bdf8" />
        <pointLight position={[-3, -2, 2]} intensity={2.0} color="#06b6d4" />
        <pointLight position={[2, 0, 1]} intensity={activeTarget === 'WP3' ? 4.0 : 1.5} color="#ef4444" />
        <OceanWaveMesh activeTarget={activeTarget} />
      </Canvas>
    </div>
  );
};
