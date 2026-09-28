import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { DEPTH_LEVELS } from '../../utils/oceanPhysics';

function tempColor(t: number): string {
  const r = Math.max(0, Math.min(1, (t - 6) / 24));
  const g = Math.max(0, Math.min(1, 0.35 + r * 0.4));
  const b = Math.max(0, Math.min(1, 1 - r * 0.55));
  return `rgb(${Math.round(30 + r * 225)}, ${Math.round(80 + g * 140)}, ${Math.round(80 + b * 175)})`;
}

interface ThermalColumnProps {
  temperatures: number[];
}

export const ThermalColumn: React.FC<ThermalColumnProps> = ({ temperatures }) => {
  const discs = useMemo(
    () =>
      DEPTH_LEVELS.map((depth: number, i: number) => ({
        depth,
        temp: temperatures[i] ?? 8,
        y: 2.4 - (depth / 1000) * 4.8,
        scale: 0.55 + (1 - depth / 1000) * 0.55,
      })),
    [temperatures],
  );

  return (
    <div className="w-full h-full min-h-[280px] rounded-xl overflow-hidden bg-[#030914] border border-navy-border">
      <Canvas camera={{ position: [4.2, 0.4, 5.2], fov: 42 }}>
        <color attach="background" args={['#030914']} />
        <ambientLight intensity={0.55} />
        <pointLight position={[4, 6, 4]} intensity={1.2} color="#67e8f9" />
        <pointLight position={[-3, -4, -2]} intensity={0.5} color="#0284c7" />
        {discs.map((d: { depth: number; temp: number; y: number; scale: number }) => (
          <mesh key={d.depth} position={[0, d.y, 0]}>
            <cylinderGeometry args={[d.scale, d.scale * 0.92, 0.16, 28]} />
            <meshStandardMaterial
              color={tempColor(d.temp)}
              emissive={tempColor(d.temp)}
              emissiveIntensity={0.25}
              metalness={0.15}
              roughness={0.35}
            />
          </mesh>
        ))}
        <mesh position={[0, -2.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 1.35, 40]} />
          <meshBasicMaterial color="#164e63" transparent opacity={0.35} />
        </mesh>
        <OrbitControls enablePan={false} minDistance={4} maxDistance={9} />
      </Canvas>
    </div>
  );
};
