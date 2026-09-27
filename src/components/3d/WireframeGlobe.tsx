import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GlowingGlobe: React.FC = () => {
  const sphereRef = useRef<THREE.Mesh>(null!);
  const innerSphereRef = useRef<THREE.Mesh>(null!);
  const ring1Ref = useRef<THREE.Mesh>(null!);
  const ring2Ref = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y += delta * 0.12;
    }
    if (innerSphereRef.current) {
      innerSphereRef.current.rotation.y += delta * 0.08;
      innerSphereRef.current.rotation.x += delta * 0.03;
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += delta * 0.15;
      ring1Ref.current.rotation.x += delta * 0.05;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z -= delta * 0.12;
      ring2Ref.current.rotation.y += delta * 0.08;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Outer Luminous Wireframe Sphere */}
      <mesh ref={sphereRef}>
        <sphereGeometry args={[2.3, 32, 32]} />
        <meshBasicMaterial wireframe color="#22d3ee" transparent opacity={0.22} />
      </mesh>

      {/* Inner Deep Blue Core */}
      <mesh ref={innerSphereRef}>
        <sphereGeometry args={[2.1, 24, 24]} />
        <meshBasicMaterial wireframe color="#0284c7" transparent opacity={0.15} />
      </mesh>

      {/* Satellite Orbit Rings */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 3, 0, 0]}>
        <ringGeometry args={[2.7, 2.74, 64]} />
        <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.4} />
      </mesh>

      <mesh ref={ring2Ref} rotation={[-Math.PI / 4, Math.PI / 6, 0]}>
        <ringGeometry args={[3.1, 3.14, 64]} />
        <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

export const WireframeGlobe: React.FC = () => {
  return (
    <div className="w-full h-full absolute inset-0 pointer-events-none flex items-center justify-center">
      <Canvas camera={{ position: [0, 0, 6.8], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.8} />
        <GlowingGlobe />
      </Canvas>
    </div>
  );
};
