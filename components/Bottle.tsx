"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import * as THREE from "three";
import { makeLabelTexture } from "@/lib/bottleLabel";

type BottleMeshProps = {
  topColor: string;
  bottomColor: string;
  label: string;
  badge: string;
};

function BottleMesh({ topColor, bottomColor, label, badge }: BottleMeshProps) {
  const labelTexture = useMemo(() => makeLabelTexture(bottomColor, label), [bottomColor, label]);

  return (
    <group>
      {/* cap */}
      <mesh position={[0, 1.62, 0]} castShadow>
        <sphereGeometry args={[0.34, 32, 32]} />
        <meshPhysicalMaterial color={topColor} roughness={0.18} clearcoat={0.9} clearcoatRoughness={0.15} />
      </mesh>
      {/* neck */}
      <mesh position={[0, 1.34, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.36, 0.22, 32]} />
        <meshPhysicalMaterial color={topColor} roughness={0.18} clearcoat={0.9} clearcoatRoughness={0.15} />
      </mesh>
      {/* upper white body */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.5, 0.9, 32]} />
        <meshPhysicalMaterial color={topColor} roughness={0.18} clearcoat={0.9} clearcoatRoughness={0.15} />
      </mesh>
      {/* lower labeled body */}
      <mesh position={[0, -0.32, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.48, 1.15, 32]} />
        <meshPhysicalMaterial map={labelTexture} roughness={0.28} clearcoat={0.6} clearcoatRoughness={0.25} />
      </mesh>
      {/* base */}
      <mesh position={[0, -0.95, 0]} castShadow>
        <cylinderGeometry args={[0.48, 0.46, 0.12, 32]} />
        <meshPhysicalMaterial color={topColor} roughness={0.18} clearcoat={0.9} clearcoatRoughness={0.15} />
      </mesh>

      {badge && (
        <Billboard position={[0.95, 0.9, 0.4]}>
          <mesh>
            <planeGeometry args={[1.5, 0.5]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.96} />
          </mesh>
          <Text fontSize={0.16} color="#12141a" anchorX="center" anchorY="middle" maxWidth={1.3}>
            {badge.toUpperCase()}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

export type BottleStageProps = {
  topColor?: string;
  bottomColor?: string;
  label?: string;
  badge?: string;
  className?: string;
};

/** Drop-in 3D bottle canvas. Pauses its own render loop when scrolled out of view
 *  (`frameloop`) so five of these on one page stay light. */
export default function BottleStage({
  topColor = "#ffffff",
  bottomColor = "#1c3fff",
  label = "TAG",
  badge = "",
  className = "",
}: BottleStageProps) {
  const [inView, setInView] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.05,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`bottle-3d-stage ${className}`}
      ref={wrapRef}
      onPointerDown={() => {
        setAutoRotate(false);
        clearTimeout(resumeTimer.current);
      }}
      onPointerUp={() => {
        resumeTimer.current = setTimeout(() => setAutoRotate(true), 1800);
      }}
    >
      <Canvas
        camera={{ position: [0, 0.25, 5.4], fov: 30 }}
        dpr={[1, 2]}
        frameloop={inView ? "always" : "demand"}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 4]} intensity={1.5} />
        <directionalLight position={[-4, 2, -3]} intensity={0.85} color="#88aaff" />
        <pointLight position={[-2, -1, 3]} intensity={0.35} />
        <BottleMesh topColor={topColor} bottomColor={bottomColor} label={label} badge={badge} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI / 2 - 0.5}
          maxPolarAngle={Math.PI / 2 + 0.35}
          autoRotate={autoRotate}
          autoRotateSpeed={1.6}
          target={[0, 0.15, 0]}
        />
      </Canvas>
    </div>
  );
}
