import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const SoftWireframeSphere: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.x += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2.2, 24, 24]} />
      <meshBasicMaterial wireframe color="#22d3ee" transparent opacity={0.35} />
    </mesh>
  );
};

export const WireframeGlobe: React.FC = () => {
  return (
    <div className="w-full h-full absolute inset-0 pointer-events-none flex items-center justify-center">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <SoftWireframeSphere />
      </Canvas>
    </div>
  );
};
