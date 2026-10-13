"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeLabelTexture } from "@/lib/bottleLabel";
import { driver } from "@/lib/lenisDriver";

const CAM_Z = 20;
const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360); // tan(fov / 2)
const PN = 150; // floating particles

type Colors = { body: string; ball: string; base: string; trim: string };
type Slot = Colors & { el: HTMLElement; accent: string; deep: string; label: string };
type BgSpec = {
  fx: number;
  fy: number;
  z: number;
  s0: number;
  spin: number;
  phase: number;
  tilt: number;
  colors: Colors;
  map: THREE.Texture;
};
type Geos = { shell: THREE.LatheGeometry; bowl: THREE.LatheGeometry; seg: number };
type MatRefs = {
  body: RefObject<THREE.MeshStandardMaterial>;
  ball: RefObject<THREE.MeshStandardMaterial>;
  base: RefObject<THREE.MeshStandardMaterial>;
  trim: RefObject<THREE.MeshStandardMaterial>;
  label: RefObject<THREE.MeshStandardMaterial>;
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (v: number, r: number) => ((((v + r / 2) % r) + r) % r) - r / 2;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth surface of revolution from [radius, height] control points. */
function makeLathe(points: [number, number][], seg: number) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getPoints(56).map((p) => new THREE.Vector2(Math.max(p.x, 0.0001), p.y));
  return new THREE.LatheGeometry(pts, seg);
}

function buildGeos(seg: number): Geos {
  return {
    seg,
    shell: makeLathe(
      [
        [0.5, -0.05],
        [0.52, 0.15],
        [0.58, 0.45],
        [0.63, 0.85],
        [0.6, 1.2],
        [0.46, 1.42],
        [0.24, 1.53],
        [0.0, 1.56],
      ],
      seg
    ),
    bowl: makeLathe(
      [
        [0.0, -1.35],
        [0.42, -1.35],
        [0.58, -1.3],
        [0.68, -1.15],
        [0.7, -0.95],
        [0.66, -0.78],
        [0.6, -0.7],
      ],
      seg
    ),
  };
}

function makeRadialTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One TAG roll-on, shaped like the real product: rounded body on top, big roll-on
 *  ball and base bowl below, curved label on the front. */
function BottleParts({
  geo,
  colors,
  map,
  refs,
}: {
  geo: Geos;
  colors?: Colors;
  map?: THREE.Texture | null;
  refs?: MatRefs;
}) {
  const c = colors ?? { body: "#ffffff", ball: "#ffffff", base: "#ffffff", trim: "#ffffff" };
  const s = geo.seg;
  return (
    <group position={[0, -0.1, 0]}>
      <mesh geometry={geo.shell}>
        <meshStandardMaterial ref={refs?.body} color={c.body} roughness={0.28} metalness={0.12} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.04, 10, s]} />
        <meshStandardMaterial ref={refs?.trim} color={c.trim} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh position={[0, -0.5, 0]}>
        <sphereGeometry args={[0.66, s, Math.round(s * 0.75)]} />
        <meshStandardMaterial ref={refs?.ball} color={c.ball} roughness={0.25} metalness={0.12} />
      </mesh>
      <mesh geometry={geo.bowl}>
        <meshStandardMaterial ref={refs?.base} color={c.base} roughness={0.3} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.615, 0.585, 0.95, s, 1, true, -0.95, 1.9]} />
        <meshStandardMaterial ref={refs?.label} map={map ?? null} transparent roughness={0.4} metalness={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The whole immersive world, in ONE WebGL scene:
 *  - the hero bottle that glides to whichever [data-bottle-slot] is nearest screen centre
 *  - a halo of light behind it
 *  - a field of bottles floating at different depths behind the content (parallax on
 *    scroll and mouse, fading into the section colour with distance)
 *  - drifting particles for extra depth */
function Scene() {
  const hiGeo = useMemo(() => buildGeos(64), []);
  const loGeo = useMemo(() => buildGeos(28), []);
  const radialTex = useMemo(() => makeRadialTexture(), []);

  const mainGroup = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const bgGroup = useRef<THREE.Group>(null);
  const bgRefs = useRef<(THREE.Group | null)[]>([]);
  const ptsMat = useRef<THREE.PointsMaterial>(null);
  const posAttr = useRef<THREE.BufferAttribute>(null);

  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const ballMat = useRef<THREE.MeshStandardMaterial>(null);
  const baseMat = useRef<THREE.MeshStandardMaterial>(null);
  const trimMat = useRef<THREE.MeshStandardMaterial>(null);
  const labelMat = useRef<THREE.MeshStandardMaterial>(null);
  const refs: MatRefs = { body: bodyMat, ball: ballMat, base: baseMat, trim: trimMat, label: labelMat };

  const slots = useRef<Slot[]>([]);
  const textures = useRef<THREE.CanvasTexture[]>([]);
  const mouse = useRef({ x: 0, y: 0 });
  const st = useRef({ index: -1, spin: 0, scale: 0, bg: 0, tilt: 0, lastScroll: 0 });
  const fogTarget = useRef(new THREE.Color("#2244ff"));
  const haloTarget = useRef(new THREE.Color("#ffffff"));
  const [bg, setBg] = useState<BgSpec[]>([]);

  const particles = useMemo(() => {
    const rnd = mulberry32(5);
    const base = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) {
      base[i * 3] = rnd() * 2 - 1; // x as a fraction of the visible half-width
      base[i * 3 + 1] = rnd(); // y phase
      base[i * 3 + 2] = rnd() * 18 - 16; // depth, -16 .. 2
    }
    return { base, positions: new Float32Array(PN * 3) };
  }, []);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-bottle-slot]"));
    slots.current = els.map((el) => ({
      el,
      body: el.dataset.body ?? "#1f78d1",
      ball: el.dataset.ball ?? "#2b86e6",
      base: el.dataset.base ?? "#f4f6f8",
      trim: el.dataset.trim ?? "#bcd7f5",
      accent: el.dataset.accent ?? "#2a8be8",
      deep: el.dataset.deep ?? "#0d4fa8",
      label: el.dataset.label ?? "TAG",
    }));
    textures.current = slots.current.map((s) => makeLabelTexture(s.label, s.accent));

    // bottles floating at different depths behind the content
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const list = slots.current;
    const pool = list.length > 1 ? list.slice(1) : list;
    const n = reduce ? 0 : window.innerWidth < 700 ? 6 : 12;
    const rnd = mulberry32(11);
    const specs: BgSpec[] = [];
    for (let i = 0; i < n; i++) {
      const slot = pool[i % pool.length];
      const tex = textures.current[list.indexOf(slot)];
      specs.push({
        fx: rnd() * 2 - 1,
        fy: rnd(),
        z: -(3 + rnd() * 13),
        s0: 0.9 + rnd() * 1.0,
        spin: (0.15 + rnd() * 0.45) * (rnd() < 0.5 ? -1 : 1),
        phase: rnd() * 6.28,
        tilt: (rnd() - 0.5) * 0.9,
        colors: { body: slot.body, ball: slot.ball, base: slot.base, trim: slot.trim },
        map: tex,
      });
    }
    setBg(specs);

    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      textures.current.forEach((t) => t.dispose());
    };
  }, []);

  useFrame((state) => {
    // 1. advance smooth scroll first, so everything below reads this frame's scroll position
    const now = performance.now();
    driver.lastExternal = now;
    if (driver.lenis) driver.lenis.raf(now);

    const g = mainGroup.current;
    const list = slots.current;
    if (!g || list.length === 0) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = vw / vh;
    const upp = (2 * CAM_Z * TAN) / vh; // world units per screen pixel at the z = 0 plane
    const scrollY = window.scrollY;
    const t = now / 1000;
    const s = st.current;

    // 2. nearest slot to the middle of the screen
    let best = 0;
    let bestDist = Infinity;
    let bestRect = list[0].el.getBoundingClientRect();
    for (let i = 0; i < list.length; i++) {
      const r = list[i].el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - vh / 2);
      if (d < bestDist) {
        bestDist = d;
        best = i;
        bestRect = r;
      }
    }

    if (best !== s.index) {
      s.index = best;
      s.spin = Math.PI * 2; // one full turn that settles with the label facing front
      const sl = list[best];
      bodyMat.current?.color.set(sl.body);
      ballMat.current?.color.set(sl.ball);
      baseMat.current?.color.set(sl.base);
      trimMat.current?.color.set(sl.trim);
      const lm = labelMat.current;
      if (lm) {
        lm.map = textures.current[best] ?? null;
        lm.needsUpdate = true;
      }
      fogTarget.current.set(sl.accent).lerp(new THREE.Color(sl.deep), 0.5);
      haloTarget.current.set(sl.accent).lerp(new THREE.Color("#ffffff"), 0.45);
    }

    // 3. the hero bottle: visible while its slot is near the middle, shrinks away as it leaves
    const vis = 1 - smoothstep(0.3 * vh, 0.5 * vh, bestDist);
    s.scale += (vis - s.scale) * 0.18;
    s.spin *= 0.94;

    const slotH = bestRect.height * upp;
    const unit = (slotH / 3.0) * s.scale;
    const px = (bestRect.left + bestRect.width / 2 - vw / 2) * upp;
    const py = -(bestRect.top + bestRect.height / 2 - vh / 2) * upp;

    const vel = scrollY - s.lastScroll;
    s.lastScroll = scrollY;
    s.tilt += (Math.max(-0.45, Math.min(0.45, vel * 0.006)) - s.tilt) * 0.1;

    g.visible = s.scale > 0.01;
    g.position.set(px, py + Math.sin(t * 1.4) * 0.12, 0);
    g.scale.setScalar(Math.max(unit, 0.0001));
    g.rotation.y = s.spin + Math.sin(t * 0.7) * 0.55 + Math.sin(scrollY * 0.003) * 0.35 + mouse.current.x * 0.4;
    g.rotation.x = mouse.current.y * 0.1 + s.tilt;
    g.rotation.z = Math.sin(t * 0.8) * 0.03;

    // 4. halo of light behind the bottle
    const h = halo.current;
    const hm = haloMat.current;
    if (h && hm) {
      h.visible = s.scale > 0.01;
      h.position.set(px, py, -2.5);
      h.scale.setScalar(slotH * 1.7 * s.scale + 0.0001);
      hm.color.lerp(haloTarget.current, 0.12);
      hm.opacity = 0.6 * s.scale;
    }

    // 5. fog fades distant bottles into the current section's colour
    const fog = state.scene.fog;
    if (fog instanceof THREE.Fog) fog.color.lerp(fogTarget.current, 0.1);

    // 6. the floating world is only shown while inside the fragrance sections
    const bgS = 1 - smoothstep(0.55 * vh, 0.9 * vh, bestDist);
    s.bg += (bgS - s.bg) * 0.1;
    const bgGroupEl = bgGroup.current;
    if (bgGroupEl) bgGroupEl.visible = s.bg > 0.02;

    const specs = bg;
    for (let i = 0; i < specs.length; i++) {
      const el = bgRefs.current[i];
      const b = specs[i];
      if (!el) continue;
      const dist = CAM_Z - b.z;
      const halfH = TAN * dist;
      const halfW = halfH * aspect;
      const range = halfH * 2 + 5;
      const pxz = (2 * dist * TAN) / vh;
      const f = 0.55 - -b.z * 0.028; // nearer bottles drift faster with scroll than far ones
      const y = wrap((b.fy - 0.5) * range + scrollY * f * pxz + Math.sin(t * 0.6 + b.phase) * 0.3, range);
      const x = b.fx * halfW * 0.95 + mouse.current.x * -b.z * 0.05;
      el.position.set(x, y, b.z);
      el.scale.setScalar(b.s0 * s.bg);
      el.rotation.set(Math.sin(t * 0.4 + b.phase) * 0.25, t * b.spin + b.phase, b.tilt);
    }

    // 7. drifting particles
    const attr = posAttr.current;
    if (attr) {
      const arr = attr.array as Float32Array;
      const base = particles.base;
      for (let i = 0; i < PN; i++) {
        const bz = base[i * 3 + 2];
        const dist = CAM_Z - bz;
        const halfH = TAN * dist;
        const halfW = halfH * aspect;
        const range = halfH * 2 + 2;
        const pxz = (2 * dist * TAN) / vh;
        const f = 0.12 + (bz + 16) * 0.02;
        arr[i * 3] = base[i * 3] * halfW + mouse.current.x * -bz * 0.03;
        arr[i * 3 + 1] = wrap((base[i * 3 + 1] - 0.5) * range + scrollY * f * pxz + t * 0.25, range);
        arr[i * 3 + 2] = bz;
      }
      attr.needsUpdate = true;
    }
    if (ptsMat.current) ptsMat.current.opacity = 0.6 * s.bg;
  });

  return (
    <>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={["#ffffff", "#8896c8", 0.6]} />
      <directionalLight position={[2, 3, 5]} intensity={2.2} />
      <directionalLight position={[-3, 1, -2]} intensity={1.0} color="#9bb4ff" />

      <mesh ref={halo} position={[0, 0, -2.5]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={haloMat}
          map={radialTex}
          color="#ffffff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </mesh>

      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute ref={posAttr} attach="attributes-position" args={[particles.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={ptsMat}
          map={radialTex}
          size={0.28}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
          color="#ffffff"
        />
      </points>

      <group ref={bgGroup}>
        {bg.map((b, i) => (
          <group
            key={i}
            ref={(el) => {
              bgRefs.current[i] = el;
            }}
          >
            <BottleParts geo={loGeo} colors={b.colors} map={b.map} />
          </group>
        ))}
      </group>

      <group ref={mainGroup}>
        <BottleParts geo={hiGeo} refs={refs} />
      </group>
    </>
  );
}

export default function SceneCanvas() {
  return (
    <Canvas
      flat
      dpr={[1, 1.5]}
      camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      <fog attach="fog" args={["#2244ff", CAM_Z, CAM_Z + 26]} />
      <Scene />
    </Canvas>
  );
}
