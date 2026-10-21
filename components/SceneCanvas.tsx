"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { makeLabelTexture } from "@/lib/bottleLabel";
import { EVT } from "@/lib/events";

const CAM_Z = 20;
const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360); // tan(fov / 2)
const TWO_PI = Math.PI * 2;
const LAYER_Z = [-4, -8.5, -14]; // near, middle and far layers of background roll-ons
const UI_SELECTOR =
  "a, button, input, textarea, select, label, header, .quiz-overlay, .loader, [data-open-quiz], [data-no-bottle]";
// a roll-on is approximated by three circles stacked on its long axis: [x, y, radius], model units
const CIRCLES: [number, number, number][] = [
  [0, 0.8, 0.64],
  [0, 0.05, 0.52],
  [0, -0.75, 0.72],
];

// starfield streaks that fly out of the middle, far behind everything; they stretch when you scroll fast
const STAR_N = 480;
const STAR_Z = -26;
const STAR_COLORS = ["#cbbcff", "#ffffff", "#9db8ff", "#b58cff", "#7dd3ff", "#ff9ad5", "#ffd9a0", "#8ff0d0"];
const STAR_PICK = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7]; // weighted towards the blues
// big soft glows far behind the stars: this is what makes the background read as deep space
const NEB: { x: number; y: number; z: number; size: number; col: string; ph: number; op: number }[] = []; // glows now live in the page background (cheaper)

const WHITE = new THREE.Color("#ffffff");
// the real roll-on model and one texture per fragrance (made from the official product renders)
const TEX_SLUGS = ["cool-breeze", "turbo", "whitening", "powerful-defense", "fresh-mint", "sensitive-skin", "romantic-charm"];
type Assets = { hi: THREE.BufferGeometry; lo: THREE.BufferGeometry; tex: Record<string, THREE.Texture> };

const FX_TYPES = ["tag", "drop", "bolt", "sparkle", "shield", "leaf", "bubble", "petal"] as const;
type FxType = (typeof FX_TYPES)[number];
const FX_COUNT = 36;
// how each themed shape moves: fall speed (negative = rises), sideways sway, spin, squash
const FX_PARAMS: Record<FxType, { fall: number; sway: number; amp: number; spin: number; sx: number; sy: number; pulse?: boolean; swing?: boolean }> = {
  tag: { fall: 0.6, sway: 0.9, amp: 0.5, spin: 0.5, sx: 1.0, sy: 1.0, swing: true },
  drop: { fall: 1.5, sway: 0.4, amp: 0.2, spin: 0, sx: 0.7, sy: 1.1 },
  bolt: { fall: 2.3, sway: 0.2, amp: 0.1, spin: 0, sx: 0.8, sy: 1.1 },
  sparkle: { fall: 0.18, sway: 0.3, amp: 0.3, spin: 0.7, sx: 1.0, sy: 1.0, pulse: true },
  shield: { fall: 0.55, sway: 0.4, amp: 0.3, spin: 0.3, sx: 0.9, sy: 1.0 },
  leaf: { fall: 0.9, sway: 1.1, amp: 0.9, spin: 1.2, sx: 1.0, sy: 1.0 },
  bubble: { fall: -0.7, sway: 0.8, amp: 0.5, spin: 0, sx: 1.0, sy: 1.0 },
  petal: { fall: 0.7, sway: 1.0, amp: 0.8, spin: 0.9, sx: 1.0, sy: 1.0 },
};

type Colors = { body: string; ball: string; base: string; trim: string };
type Slot = Colors & { el: HTMLElement; accent: string; deep: string; label: string; fx: number; tex: string; top: number; left: number; w: number; h: number };
type World = { el: HTMLElement; color: THREE.Color; haze: number; space: number; top: number; bottom: number };
type BgSpec = {
  fx: number;
  fy: number;
  z: number;
  s0: number;
  r: number; // pointer-push radius, world units
  inertia: number;
  layer: number;
  drift: number; // sideways drift speed (0 = hangs in place)
  spin: number;
  phase: number;
  tilt: number;
  colors: Colors;
  map: THREE.Texture;
  texSlug: string;
};
type Phys = { dx: number; dy: number; vx: number; vy: number; rot: number; spinV: number; ang: number; angV: number };
type ScreenInfo = { sx: number; sy: number; hw: number; hh: number; z: number };
type Grab = { i: number; pointerType: string; startX: number; startY: number; moved: boolean };
type Geos = { shell: THREE.LatheGeometry; bowl: THREE.LatheGeometry; seg: number };
type MatRefs = {
  body: RefObject<THREE.MeshPhysicalMaterial>;
  ball: RefObject<THREE.MeshPhysicalMaterial>;
  base: RefObject<THREE.MeshPhysicalMaterial>;
  trim: RefObject<THREE.MeshPhysicalMaterial>;
  label: RefObject<THREE.MeshPhysicalMaterial>;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const wrap = (v: number, r: number) => ((((v + r / 2) % r) + r) % r) - r / 2;
const wrapAngle = (a: number) => ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;

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

/** A streak: transparent tail, bright head, soft edges. Used for the starfield. */
function makeStreakTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.3, "rgba(255,255,255,0.9)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 32);
  ctx.globalCompositeOperation = "destination-in";
  const v = ctx.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(0.5, "rgba(0,0,0,1)");
  v.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 256, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Simple white shapes for the themed falling layer. They get tinted by the section colour. */
function makeShapeTexture(type: FxType) {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0.7)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (type) {
    case "drop":
      ctx.moveTo(64, 8);
      ctx.bezierCurveTo(64, 8, 104, 58, 104, 84);
      ctx.arc(64, 84, 40, 0, Math.PI, false);
      ctx.bezierCurveTo(24, 58, 64, 8, 64, 8);
      ctx.fill();
      break;
    case "bubble":
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.arc(64, 64, 50, 0, TWO_PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(64, 64, 50, 0, TWO_PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(64, 64, 34, Math.PI * 1.1, Math.PI * 1.45);
      ctx.stroke();
      break;
    case "sparkle":
      ctx.moveTo(64, 4);
      ctx.quadraticCurveTo(64, 64, 124, 64);
      ctx.quadraticCurveTo(64, 64, 64, 124);
      ctx.quadraticCurveTo(64, 64, 4, 64);
      ctx.quadraticCurveTo(64, 64, 64, 4);
      ctx.fill();
      break;
    case "leaf":
      ctx.moveTo(18, 112);
      ctx.bezierCurveTo(14, 44, 64, 12, 114, 16);
      ctx.bezierCurveTo(118, 66, 82, 116, 18, 112);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 4;
      ctx.moveTo(24, 106);
      ctx.lineTo(96, 34);
      ctx.stroke();
      break;
    case "petal":
      ctx.moveTo(64, 8);
      ctx.bezierCurveTo(104, 30, 112, 82, 64, 120);
      ctx.bezierCurveTo(16, 82, 24, 30, 64, 8);
      ctx.fill();
      break;
    case "bolt":
      ctx.moveTo(74, 4);
      ctx.lineTo(24, 72);
      ctx.lineTo(58, 72);
      ctx.lineTo(44, 124);
      ctx.lineTo(104, 50);
      ctx.lineTo(68, 50);
      ctx.lineTo(88, 4);
      ctx.closePath();
      ctx.fill();
      break;
    case "shield":
      ctx.moveTo(64, 6);
      ctx.lineTo(114, 24);
      ctx.lineTo(114, 62);
      ctx.bezierCurveTo(114, 92, 92, 112, 64, 124);
      ctx.bezierCurveTo(36, 112, 14, 92, 14, 62);
      ctx.lineTo(14, 24);
      ctx.closePath();
      ctx.fill();
      break;
    case "tag":
      ctx.moveTo(22, 18);
      ctx.lineTo(82, 18);
      ctx.lineTo(108, 44);
      ctx.lineTo(108, 112);
      ctx.lineTo(22, 112);
      ctx.closePath();
      ctx.moveTo(86, 40);
      ctx.arc(80, 40, 6, 0, TWO_PI, true);
      ctx.fill("evenodd");
      break;
  }
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
  fancy = false,
}: {
  geo: Geos;
  colors?: Colors;
  map?: THREE.Texture | null;
  refs?: MatRefs;
  fancy?: boolean; // the main roll-on gets a glossy clear coat; the far ones stay cheap
}) {
  const cc = fancy ? 1 : 0;
  const c = colors ?? { body: "#ffffff", ball: "#ffffff", base: "#ffffff", trim: "#ffffff" };
  const s = geo.seg;
  return (
    <group position={[0, -0.1, 0]}>
      <mesh geometry={geo.shell}>
        <meshPhysicalMaterial ref={refs?.body} color={c.body} roughness={0.3} metalness={0.1} clearcoat={cc} clearcoatRoughness={0.12} envMapIntensity={0.65} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52, 0.04, 10, s]} />
        <meshPhysicalMaterial ref={refs?.trim} color={c.trim} roughness={0.3} metalness={0.2} clearcoat={cc} envMapIntensity={0.65} />
      </mesh>
      <mesh position={[0, -0.5, 0]}>
        <sphereGeometry args={[0.66, s, Math.round(s * 0.75)]} />
        <meshPhysicalMaterial ref={refs?.ball} color={c.ball} roughness={0.25} metalness={0.1} clearcoat={cc} clearcoatRoughness={0.1} envMapIntensity={0.7} />
      </mesh>
      <mesh geometry={geo.bowl}>
        <meshPhysicalMaterial ref={refs?.base} color={c.base} roughness={0.3} metalness={0.05} clearcoat={cc} envMapIntensity={0.65} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.615, 0.585, 0.95, s, 1, true, -0.95, 1.9]} />
        <meshPhysicalMaterial ref={refs?.label} map={map ?? null} transparent roughness={0.4} metalness={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** The whole immersive world, in ONE WebGL scene. The page text (HTML) always sits above it.
 *  BACK: three depth layers of roll-ons (hanging ones that can be pushed, dragged, thrown and
 *        that bump off each other's edges, plus a few that slowly drift across), and a themed
 *        layer of falling shapes (drops, bolts, leaves, petals...) that changes per fragrance.
 *  MIDDLE: the main roll-on. It stays put and only moves when the product changes: the old
 *        one spins out of the side it is on, the new one spins in from the side it will sit on. */
function Scene() {
  const hiGeo = useMemo(() => buildGeos(64), []);
  const loGeo = useMemo(() => buildGeos(28), []);
  const radialTex = useMemo(() => makeRadialTexture(), []);
  const fxTex = useMemo(() => FX_TYPES.map((t) => makeShapeTexture(t)), []);
  const fxData = useMemo(
    () =>
      FX_TYPES.map((_, k) => {
        const rnd = mulberry32(100 + k);
        return Array.from({ length: FX_COUNT }, () => ({
          fx: rnd() * 2 - 1,
          fy: rnd(),
          z: rnd() * 20 - 16,
          size: 0.7 + rnd() * 0.8,
          speed: 0.6 + rnd() * 0.8,
          phase: rnd() * 6.28,
          spin: (rnd() < 0.5 ? -1 : 1) * (0.4 + rnd() * 0.8),
        }));
      }),
    []
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const streakTex = useMemo(() => makeStreakTexture(), []);
  const starData = useMemo(() => {
    const rnd = mulberry32(777);
    return Array.from({ length: STAR_N }, () => ({
      a: rnd() * TWO_PI,
      offset: rnd(),
      len: 1.5 + rnd() * 7.5,
      w: 0.05 + rnd() * 0.06,
      c: STAR_PICK[Math.floor(rnd() * STAR_PICK.length)],
    }));
  }, []);
  const starMesh = useRef<THREE.InstancedMesh>(null);
  const starMat = useRef<THREE.MeshBasicMaterial>(null);
  const starCount = useRef(STAR_N);
  const nebMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const nebMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const tmpColor = useRef(new THREE.Color());

  const mainGroup = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const bgRefs = useRef<(THREE.Group | null)[]>([]);
  const fxMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const fxMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const fxAlpha = useRef<number[]>(FX_TYPES.map(() => 0));
  const fxTint = useRef(new THREE.Color("#ffffff"));
  const fxCount = useRef(FX_COUNT);

  const bodyMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const ballMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const baseMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const trimMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const labelMat = useRef<THREE.MeshPhysicalMaterial>(null);
  const refs: MatRefs = { body: bodyMat, ball: ballMat, base: baseMat, trim: trimMat, label: labelMat };

  const slots = useRef<Slot[]>([]);
  const worlds = useRef<World[]>([]);
  const textures = useRef<THREE.CanvasTexture[]>([]);
  const phys = useRef<Phys[]>([]);
  const screen = useRef<ScreenInfo[]>([]);
  const posX = useRef<number[]>([]);
  const posY = useRef<number[]>([]);
  const grab = useRef<Grab | null>(null);
  const mouse = useRef({ x: 0, y: 0, cx: 0, cy: 0, type: "mouse", t: 0, overUI: false });
  const cursor = useRef("");
  const st = useRef({
    index: -1,
    mode: "idle" as "idle" | "out" | "in",
    pending: -1,
    outDir: 1,
    dir: 1,
    rotY: 0,
    rotTarget: 0,
    omega: 0,
    lastScroll: 0,
    last: 0,
    x: 0,
    y: 0,
    h: 0,
    tilt: 0,
    glow: 0,
    init: false,
    fxActive: 0,
    ready: false,
    ema: 16,
    fpsFrames: 0,
    fpsT: 0,
    slow: 0,
    lowQ: false,
    starX: 0,
    starY: 0,
    starHole: 1.3,
    warp: 0,
    burst: 0,
    starPhase: 0,
    space: 0,
    spaceTarget: 0,
    far: CAM_Z + 26,
    farTarget: CAM_Z + 26,
  });
  const rectRef = useRef({ top: 0, left: 0, width: 0, height: 0 });
  const perfEl = useRef<HTMLDivElement | null>(null);
  const fogTarget = useRef(new THREE.Color("#2244ff"));
  const haloTarget = useRef(new THREE.Color("#ffffff"));
  const [bg, setBg] = useState<BgSpec[]>([]);

  const { gl, scene } = useThree();
  useEffect(() => {
    // a small built-in studio gives the glossy plastic real reflections (no download needed)
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  useEffect(
    () => () => {
      hiGeo.shell.dispose();
      hiGeo.bowl.dispose();
      loGeo.shell.dispose();
      loGeo.bowl.dispose();
      radialTex.dispose();
      streakTex.dispose();
      fxTex.forEach((t) => t.dispose());
    },
    [hiGeo, loGeo, radialTex, streakTex, fxTex]
  );

  useEffect(() => {
    // open the site with ?perf on the end of the address to see live FPS and draw calls
    if (!new URLSearchParams(window.location.search).has("perf")) return;
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:9999;font:12px/1.4 monospace;background:rgba(0,0,0,.72);color:#7dffb0;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre";
    document.body.appendChild(el);
    perfEl.current = el;
    return () => {
      el.remove();
      perfEl.current = null;
    };
  }, []);

  const [assets, setAssets] = useState<Assets | null>(null);
  const assetsRef = useRef<Assets | null>(null);
  const assetsStatus = useRef<"loading" | "ready" | "failed">("loading");
  const mainRealMat = useRef<THREE.MeshPhysicalMaterial>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const loader = new GLTFLoader();
        const texLoader = new THREE.TextureLoader();
        const geoOf = async (url: string) => {
          const gltf = await loader.loadAsync(url);
          const found: THREE.BufferGeometry[] = [];
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) found.push(m.geometry);
          });
          if (found.length === 0) throw new Error("no mesh in " + url);
          return found[0];
        };
        const [hi, lo] = await Promise.all([geoOf("/models/roll-on-hi.glb"), geoOf("/models/roll-on-lo.glb")]);
        const tex: Record<string, THREE.Texture> = {};
        await Promise.all(
          TEX_SLUGS.map(async (slug) => {
            const t = await texLoader.loadAsync(`/textures/${slug}.webp`);
            t.colorSpace = THREE.SRGBColorSpace;
            t.flipY = false; // the model's UVs use the glTF convention
            t.anisotropy = 4;
            tex[slug] = t;
          })
        );
        if (!alive) return;
        const a = { hi, lo, tex };
        assetsRef.current = a;
        assetsStatus.current = "ready";
        setAssets(a);
      } catch {
        assetsStatus.current = "failed"; // keep the roll-on built in code
      }
    })();
    return () => {
      alive = false;
      const a = assetsRef.current;
      if (a) {
        a.hi.dispose();
        a.lo.dispose();
        Object.values(a.tex).forEach((t) => t.dispose());
      }
    };
  }, []);

  useEffect(() => {
    // the model arrived after the first look was chosen: give it the right fragrance
    if (assets && st.current.index >= 0) applyLook(st.current.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  /** Put the main roll-on into the look of slot `idx` (colours, label, halo). */
  const applyLook = (idx: number) => {
    const sl = slots.current[idx];
    if (!sl) return;
    bodyMat.current?.color.set(sl.body);
    ballMat.current?.color.set(sl.ball);
    baseMat.current?.color.set(sl.base);
    trimMat.current?.color.set(sl.trim);
    const A = assetsRef.current;
    const real = mainRealMat.current;
    if (A && real) {
      const t = A.tex[sl.tex];
      if (t) {
        real.map = t;
        real.emissiveMap = t;
      }
    }
    const lm = labelMat.current;
    if (lm) {
      lm.map = textures.current[idx] ?? null;
      lm.needsUpdate = true;
    }
    haloTarget.current.set(sl.accent).lerp(WHITE, 0.45);
  };

  /** Front-most background roll-on under a screen point, or -1. */
  const hitTest = (cx: number, cy: number) => {
    let best = -1;
    let bestZ = -Infinity;
    const arr = screen.current;
    for (let i = 0; i < arr.length; i++) {
      const sc = arr[i];
      if (!sc) continue;
      const nx = (cx - sc.sx) / sc.hw;
      const ny = (cy - sc.sy) / sc.hh;
      if (nx * nx + ny * ny < 1 && sc.z > bestZ) {
        best = i;
        bestZ = sc.z;
      }
    }
    return best;
  };

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
      fx: Math.max(0, FX_TYPES.indexOf((el.dataset.fx ?? "drop") as FxType)),
      tex: el.dataset.tex ?? "cool-breeze",
      top: 0,
      left: 0,
      w: 0,
      h: 0,
    }));
    textures.current = slots.current.map((s) => makeLabelTexture(s.label, s.accent));

    worlds.current = Array.from(document.querySelectorAll<HTMLElement>("[data-world]")).map((el) => ({
      el,
      color: new THREE.Color(el.dataset.world ?? "#2244ff"),
      haze: parseFloat(el.dataset.haze ?? "1"),
      space: parseFloat(el.dataset.space ?? "0"),
      top: 0,
      bottom: 0,
    }));

    // measure where everything is once (and again when the layout changes) instead of every frame
    const measure = () => {
      const sy = window.scrollY;
      for (const sl of slots.current) {
        const r = sl.el.getBoundingClientRect();
        sl.top = r.top + sy;
        sl.left = r.left;
        sl.w = r.width;
        sl.h = r.height;
      }
      for (const w of worlds.current) {
        const r = w.el.getBoundingClientRect();
        w.top = r.top + sy;
        w.bottom = r.bottom + sy;
      }
    };
    measure();
    let measureTimer = 0;
    const remeasure = () => {
      window.clearTimeout(measureTimer);
      measureTimer = window.setTimeout(measure, 120);
    };
    const ro = new ResizeObserver(remeasure);
    ro.observe(document.body);
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);
    window.addEventListener(EVT.entered, remeasure);
    const lateMeasure = window.setTimeout(measure, 900);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    const small = window.innerWidth < 700;
    fxCount.current = small ? 7 : 14;
    starCount.current = small ? 200 : 360;
    const sm = starMesh.current;
    if (sm) {
      sm.count = starCount.current;
      const col = new THREE.Color();
      for (let i = 0; i < STAR_N; i++) {
        col.set(STAR_COLORS[starData[i].c]);
        sm.setColorAt(i, col);
      }
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
    }
    fxMeshes.current.forEach((m) => {
      if (m) m.count = fxCount.current;
    });

    // roll-ons: some hang in place, a few slowly drift across, on three depth layers
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const list = slots.current;
    const pool = list.length > 1 ? list.slice(1) : list;
    const nHang = reduce ? 0 : small ? 3 : 5;
    const nDrift = reduce ? 0 : small ? 1 : 2;
    const perLayer = Math.max(1, Math.ceil(nHang / 3));
    const rnd = mulberry32(11);
    const specs: BgSpec[] = [];
    const make = (layer: number, k: number, i: number, driftSpeed: number) => {
      const slot = pool[(i * 2 + layer) % pool.length];
      const tex = textures.current[list.indexOf(slot)];
      // background roll-ons are 10% smaller than before
      const s0 = (layer === 0 ? 1.5 + rnd() * 0.6 : layer === 1 ? 1.1 + rnd() * 0.5 : 0.9 + rnd() * 0.4) * (small ? 0.72 : 0.9);
      const fxRaw = ((k + 0.5) / perLayer) * 2 - 1 + layer * 0.37 + (rnd() - 0.5) * 0.3;
      specs.push({
        fx: wrap(fxRaw, 2),
        fy: (k / perLayer + layer * 0.31 + rnd() * 0.1) % 1,
        z: LAYER_Z[layer],
        s0,
        r: s0 * 1.0,
        inertia: 0.9 * s0 * s0,
        layer,
        drift: driftSpeed,
        spin: (0.15 + rnd() * 0.45) * (rnd() < 0.5 ? -1 : 1),
        phase: rnd() * 6.28,
        tilt: (rnd() - 0.5) * 0.6,
        colors: { body: slot.body, ball: slot.ball, base: slot.base, trim: slot.trim },
        map: tex,
        texSlug: slot.tex,
      });
    };
    for (let i = 0; i < nHang; i++) make(i % 3, Math.floor(i / 3), i, 0);
    const driftLayers = [1, 2, 0];
    for (let d = 0; d < nDrift; d++) {
      const layer = driftLayers[d % 3];
      make(layer, d, nHang + d, (0.5 + rnd() * 0.5) * (rnd() < 0.5 ? -1 : 1));
    }
    phys.current = specs.map((b) => ({ dx: 0, dy: 0, vx: 0, vy: 0, rot: 0, spinV: 0, ang: b.tilt, angV: 0 }));
    posX.current = specs.map(() => 0);
    posY.current = specs.map(() => 0);
    screen.current = [];
    setBg(specs);

    const onMove = (e: PointerEvent) => {
      const m = mouse.current;
      m.x = (e.clientX / window.innerWidth) * 2 - 1;
      m.y = (e.clientY / window.innerHeight) * 2 - 1;
      m.cx = e.clientX;
      m.cy = e.clientY;
      m.type = e.pointerType;
      m.t = performance.now();
      m.overUI = !!(e.target as HTMLElement | null)?.closest(UI_SELECTOR);
      const gr = grab.current;
      if (gr && Math.hypot(e.clientX - gr.startX, e.clientY - gr.startY) > 6) gr.moved = true;
    };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest(UI_SELECTOR)) return;
      const i = hitTest(e.clientX, e.clientY);
      if (i < 0) return;
      grab.current = { i, pointerType: e.pointerType, startX: e.clientX, startY: e.clientY, moved: false };
      if (e.pointerType === "mouse") e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const gr = grab.current;
      grab.current = null;
      if (!gr) return;
      const ph = phys.current[gr.i];
      const sc = screen.current[gr.i];
      if (!ph || !sc) return;
      if (gr.pointerType !== "mouse" || !gr.moved) {
        // a tap or click: push the roll-on away from the finger or cursor, with a spin
        let nx = sc.sx - e.clientX;
        let ny = -(sc.sy - e.clientY);
        const d = Math.hypot(nx, ny);
        if (d < 1) {
          nx = Math.random() - 0.5;
          ny = 1;
        } else {
          nx /= d;
          ny /= d;
        }
        ph.vx += nx * 9;
        ph.vy += ny * 9 + 3;
        ph.spinV += (nx >= 0 ? 1 : -1) * 7;
        ph.angV += (nx >= 0 ? -1 : 1) * 3;
      } else {
        ph.spinV += (ph.vx >= 0 ? 1 : -1) * 4; // thrown: keep its momentum and add a spin
      }
    };
    const onBurst = () => {
      st.current.burst = Math.max(st.current.burst, 1.6);
    };
    window.addEventListener(EVT.burst, onBurst);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener(EVT.burst, onBurst);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      ro.disconnect();
      window.clearTimeout(measureTimer);
      window.clearTimeout(lateMeasure);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("load", remeasure);
      window.removeEventListener(EVT.entered, remeasure);
      textures.current.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state) => {
    const now = performance.now();

    const s = st.current;
    const g = mainGroup.current;
    const list = slots.current;
    if (!g || list.length === 0) return;

    const rawDt = s.last ? (now - s.last) / 1000 : 0.016;
    const dt = clamp(rawDt, 0.001, 0.05);
    s.last = now;
    s.fpsFrames++;
    s.fpsT += rawDt;
    if (s.fpsT >= 0.5) {
      const el = perfEl.current;
      if (el) {
        const info = state.gl.info;
        el.textContent =
          `${Math.round(s.fpsFrames / s.fpsT)} fps  ${((s.fpsT / s.fpsFrames) * 1000).toFixed(1)} ms\n` +
          `draw calls ${info.render.calls}  triangles ${info.render.triangles}\n` +
          `geometries ${info.memory.geometries}  textures ${info.memory.textures}\n` +
          `quality ${s.lowQ ? "reduced" : "full"}`;
      }
      s.fpsFrames = 0;
      s.fpsT = 0;
    }
    s.ema += (dt * 1000 - s.ema) * 0.05;
    if (!s.lowQ) {
      s.slow = s.ema > 26 ? s.slow + dt : Math.max(0, s.slow - dt);
      if (s.slow > 2.5) {
        s.lowQ = true;
        state.gl.setPixelRatio(1);
        starCount.current = Math.min(starCount.current, 180);
      }
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = vw / vh;
    const upp = (2 * CAM_Z * TAN) / vh; // world units per screen pixel at the z = 0 plane
    const scrollY = window.scrollY;
    const t = now / 1000;
    const ease = (rate: number) => 1 - Math.exp(-rate * dt);

    // 2. which fragrance slot is nearest the middle of the screen
    let best = 0;
    let bestDist = Infinity;
    const bestRect = rectRef.current;
    bestRect.top = list[0].top - scrollY;
    bestRect.left = list[0].left;
    bestRect.width = list[0].w;
    bestRect.height = list[0].h;
    for (let i = 0; i < list.length; i++) {
      const sl = list[i];
      const top = sl.top - scrollY;
      const d = Math.abs(top + sl.h / 2 - vh / 2);
      if (d < bestDist) {
        bestDist = d;
        best = i;
        bestRect.top = top;
        bestRect.left = sl.left;
        bestRect.width = sl.w;
        bestRect.height = sl.h;
      }
    }
    const active = bestDist < 0.6 * vh;

    const vel = scrollY - s.lastScroll;
    s.lastScroll = scrollY;
    if (Math.abs(vel) > 0.5) s.dir = vel > 0 ? 1 : -1; // scrolling down spins one way, up spins the other
    s.tilt += (clamp(vel * 0.006, -0.45, 0.45) - s.tilt) * 0.1;

    const slotH = bestRect.height * upp;
    const offX = TAN * CAM_Z * aspect + slotH * 0.95; // just past the edge of the screen
    const slotX = (bestRect.left + bestRect.width / 2 - vw / 2) * upp;
    const cyPx = bestRect.top + bestRect.height / 2 - vh / 2;
    const slotY = -clamp(cyPx, -0.1 * vh, 0.1 * vh) * upp;
    if (!s.init) {
      s.x = active ? slotX : offX;
      s.y = slotY;
      s.h = slotH;
      s.init = true;
      if (active) {
        applyLook(best);
        s.index = best;
      }
    }
    s.y += (slotY - s.y) * ease(7);
    s.h += (slotH - s.h) * ease(6);

    // 3. the main roll-on: it only transitions when the product changes
    const parked = Math.abs(s.x - offX) < 0.6;
    if (s.mode === "idle") {
      if (active) {
        if (s.index < 0) {
          applyLook(best);
          s.index = best;
        } else if (parked) {
          // coming back into view: slide in from the edge it left by, spinning
          applyLook(best);
          s.index = best;
          s.mode = "in";
          s.rotY = 0;
          const turns = 0;
          s.rotTarget = (s.dir > 0 ? Math.ceil(turns + 0.4) : Math.floor(turns - 0.4)) * TWO_PI;
          s.rotY = s.rotTarget - s.dir * TWO_PI * 1.2;
        } else if (best !== s.index) {
          // leaving: slide out of the side it is on, spinning faster and faster
          s.mode = "out";
          s.burst = Math.max(s.burst, 0.9); // warp the stars while the roll-on changes
          s.pending = best;
          s.outDir = s.x >= 0 ? 1 : -1;
          s.omega = 4;
        }
      }
    }

    let targetX = active ? slotX : offX;
    let rate = 6.5;
    if (s.mode === "out") {
      s.pending = best;
      targetX = s.outDir * (offX + slotH * 0.8);
      rate = 6.5;
      s.omega = Math.min(12, s.omega + 34 * dt);
      s.rotY += s.dir * s.omega * dt;
      if (Math.abs(s.x) >= offX * 0.97) {
        // it has left the screen: swap to the new fragrance, then spin in from the side it will sit on
        applyLook(best);
        s.index = best;
        s.x = (slotX >= 0 ? 1 : -1) * offX;
        s.mode = "in";
        const turns = s.rotY / TWO_PI;
        s.rotTarget = (s.dir > 0 ? Math.ceil(turns + 0.4) : Math.floor(turns - 0.4)) * TWO_PI;
        targetX = slotX;
        rate = 5.5;
      }
    } else if (s.mode === "in") {
      if (best !== s.index) {
        applyLook(best);
        s.index = best;
      }
      targetX = slotX;
      rate = 5.5;
      s.rotY += (s.rotTarget - s.rotY) * ease(5.5);
      if (Math.abs(s.x - slotX) < slotH * 0.05 && Math.abs(s.rotTarget - s.rotY) < 0.06) {
        s.mode = "idle";
        s.rotY = 0;
        s.rotTarget = 0;
      }
    }
    s.x += (targetX - s.x) * ease(rate);
    s.glow += ((active && s.mode !== "out" ? 1 : 0) - s.glow) * ease(6);

    g.rotation.order = "ZYX";
    g.visible = true;
    g.position.set(s.x, s.y + Math.sin(t * 1.4) * 0.12, 0);
    g.scale.setScalar(Math.max(s.h / 3.0, 0.0001));
    g.rotation.y = s.rotY + Math.sin(t * 0.7) * 0.55 + Math.sin(scrollY * 0.003) * 0.35 + mouse.current.x * 0.4;
    g.rotation.x = mouse.current.y * 0.1 + s.tilt;
    g.rotation.z = Math.sin(t * 0.8) * 0.03 - clamp((targetX - s.x) / Math.max(slotH, 0.001), -1.5, 1.5) * 0.25;

    const h = halo.current;
    const hm = haloMat.current;
    if (h && hm) {
      h.visible = s.glow > 0.01 && !s.lowQ;
      h.position.set(s.x, s.y, -2.5);
      h.scale.setScalar(s.h * 1.45 + 0.0001);
      hm.color.lerp(haloTarget.current, 0.12);
      hm.opacity = 0.6 * s.glow;
    }

    // 4. atmosphere: distant things fade into the colour of the section behind them
    const ws = worlds.current;
    for (let i = 0; i < ws.length; i++) {
      if (ws[i].top - scrollY <= vh / 2 && ws[i].bottom - scrollY > vh / 2) {
        fogTarget.current.copy(ws[i].color);
        s.farTarget = CAM_Z + 8 + 18 * ws[i].haze;
        s.spaceTarget = ws[i].space;
        break;
      }
    }
    const fog = state.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.lerp(fogTarget.current, 0.08);
      s.far += (s.farTarget - s.far) * 0.08;
      fog.far = s.far;
    }

    // 5. background roll-ons: scroll parallax + physics (cursor push, drag, throw, edge collisions)
    const specs = bg;
    const ph = phys.current;
    const px = posX.current;
    const py = posY.current;
    const mouseActive = mouse.current.type === "mouse" && now - mouse.current.t < 2500 && !mouse.current.overUI;
    for (let i = 0; i < specs.length; i++) {
      const b = specs[i];
      const p = ph[i];
      if (!p) continue;
      const dist = CAM_Z - b.z;
      const halfH = TAN * dist;
      const halfW = halfH * aspect;
      const range = halfH * 2 + 8;
      const pxz = (2 * dist * TAN) / vh;
      const f = 0.55 - -b.z * 0.028; // nearer layers drift faster with scroll than far ones
      const par = mouse.current.x * -b.z * 0.05;
      const homeX =
        b.drift !== 0
          ? wrap(b.fx * halfW * 0.95 + t * b.drift, halfW * 2 + 2 * (2.2 * b.s0 + 1)) + par
          : b.fx * halfW * 0.95 + par;
      const homeY = wrap((b.fy - 0.5) * range + scrollY * f * pxz, range) + Math.sin(t * 0.6 + b.phase) * 0.3;
      const X = homeX + p.dx;
      const Y = homeY + p.dy;

      // personal space: nothing else drifts into the main roll-on's area (strict on phones)
      if (s.glow > 0.2) {
        const kk = dist / CAM_Z;
        const ex = X - s.x * kk;
        const ey = Y - s.y * kk;
        const ed = Math.hypot(ex, ey);
        const R = (s.h * 0.62 * kk + b.r * 0.9) * (vw < 700 ? 1 : 0.55);
        if (ed < R && ed > 0.0001) {
          const pen = R - ed;
          p.vx += (ex / ed) * pen * 9 * dt;
          p.vy += (ey / ed) * pen * 9 * dt;
          p.dx += (ex / ed) * pen * 0.12;
          p.dy += (ey / ed) * pen * 0.12;
        }
      }
      const pwx = mouse.current.x * halfW; // the pointer, at this layer's depth
      const pwy = -mouse.current.y * halfH;

      const gr = grab.current;
      if (gr && gr.i === i && gr.pointerType === "mouse") {
        p.vx = (pwx - X) * 14; // being dragged: follow the cursor
        p.vy = (pwy - Y) * 14;
      } else {
        p.vx += -p.dx * 1.2 * dt; // gentle spring back to where it floats
        p.vy += -p.dy * 1.2 * dt;
        if (mouseActive) {
          const ddx = X - pwx;
          const ddy = Y - pwy;
          const d = Math.hypot(ddx, ddy);
          const R = b.r * 1.7;
          if (d < R && d > 0.0001) {
            const k = (1 - d / R) * 26 * dt; // cursor pushes nearby roll-ons away
            p.vx += (ddx / d) * k;
            p.vy += (ddy / d) * k;
          }
        }
      }
      const damp = Math.exp(-1.6 * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.dx = clamp(p.dx + p.vx * dt, -halfW * 1.3, halfW * 1.3);
      p.dy = clamp(p.dy + p.vy * dt, -halfH * 1.3, halfH * 1.3);
      p.rot += p.spinV * dt;
      p.spinV *= Math.exp(-1.4 * dt);
      // tumbling: it rotates when knocked, then eases back upright
      p.angV += wrapAngle(b.tilt - p.ang) * 1.5 * dt;
      p.angV = clamp(p.angV * Math.exp(-1.3 * dt), -8, 8);
      p.ang += p.angV * dt;
      px[i] = homeX + p.dx;
      py[i] = homeY + p.dy;
    }

    // roll-ons on the same layer collide off their real edges (three circles each), with spin
    for (let a = 0; a < specs.length; a++) {
      for (let c = a + 1; c < specs.length; c++) {
        const A = specs[a];
        const C = specs[c];
        if (A.layer !== C.layer) continue;
        const pa = ph[a];
        const pc = ph[c];
        if (!pa || !pc) continue;
        const bx = px[a] - px[c];
        const by = py[a] - py[c];
        const reach = (A.s0 + C.s0) * 1.9;
        if (bx * bx + by * by > reach * reach) continue;
        const sinA = Math.sin(pa.ang);
        const cosA = Math.cos(pa.ang);
        const sinC = Math.sin(pc.ang);
        const cosC = Math.cos(pc.ang);
        let bestPen = 0;
        let nx = 0;
        let ny = 0;
        let cxp = 0;
        let cyp = 0;
        for (let ia = 0; ia < CIRCLES.length; ia++) {
          const ly1 = CIRCLES[ia][1];
          const r1 = CIRCLES[ia][2];
          const ax = px[a] - ly1 * sinA * A.s0;
          const ay = py[a] + ly1 * cosA * A.s0;
          const ar = r1 * A.s0;
          for (let ib = 0; ib < CIRCLES.length; ib++) {
            const ly2 = CIRCLES[ib][1];
            const r2 = CIRCLES[ib][2];
            const qx = px[c] - ly2 * sinC * C.s0;
            const qy = py[c] + ly2 * cosC * C.s0;
            const qr = r2 * C.s0;
            const dx = ax - qx;
            const dy = ay - qy;
            const d = Math.hypot(dx, dy);
            const pen = ar + qr - d;
            if (pen > bestPen && d > 0.0001) {
              bestPen = pen;
              nx = dx / d;
              ny = dy / d;
              cxp = ax - nx * (ar - pen / 2);
              cyp = ay - ny * (ar - pen / 2);
            }
          }
        }
        if (bestPen <= 0) continue;
        // push apart
        const push = bestPen * 0.55;
        pa.dx += nx * push;
        pa.dy += ny * push;
        pc.dx -= nx * push;
        pc.dy -= ny * push;
        px[a] += nx * push;
        py[a] += ny * push;
        px[c] -= nx * push;
        py[c] -= ny * push;
        // impulse at the contact point: changes both speed and spin
        const rax = cxp - px[a];
        const ray = cyp - py[a];
        const rcx = cxp - px[c];
        const rcy = cyp - py[c];
        const vax = pa.vx - pa.angV * ray;
        const vay = pa.vy + pa.angV * rax;
        const vcx = pc.vx - pc.angV * rcy;
        const vcy = pc.vy + pc.angV * rcx;
        const rel = (vax - vcx) * nx + (vay - vcy) * ny;
        if (rel < 0) {
          const raN = rax * ny - ray * nx;
          const rcN = rcx * ny - rcy * nx;
          const inv = 2 + (raN * raN) / A.inertia + (rcN * rcN) / C.inertia;
          const j = (-(1 + 0.55) * rel) / inv;
          pa.vx += j * nx;
          pa.vy += j * ny;
          pa.angV += (raN * j) / A.inertia;
          pc.vx -= j * nx;
          pc.vy -= j * ny;
          pc.angV -= (rcN * j) / C.inertia;
        }
      }
    }

    // apply the positions to the 3D objects and remember where they are on screen (for clicking)
    for (let i = 0; i < specs.length; i++) {
      const b = specs[i];
      const el = bgRefs.current[i];
      const p = ph[i];
      if (!el || !p) continue;
      const dist = CAM_Z - b.z;
      const halfH = TAN * dist;
      const halfW = halfH * aspect;
      el.rotation.order = "ZYX";
      el.position.set(px[i], py[i], b.z);
      el.scale.setScalar(b.s0);
      el.rotation.set(Math.sin(t * 0.4 + b.phase) * 0.25, t * b.spin + b.phase + p.rot, p.ang);
      const pxPerUnit = vh / (2 * halfH);
      screen.current[i] = {
        sx: (px[i] / halfW) * 0.5 * vw + vw * 0.5,
        sy: vh * 0.5 - (py[i] / halfH) * 0.5 * vh,
        hw: 0.78 * b.s0 * pxPerUnit,
        hh: 1.5 * b.s0 * pxPerUnit,
        z: b.z,
      };
    }

    // cursor feedback: open hand over a roll-on, closed hand while dragging
    let want = "";
    if (grab.current && grab.current.pointerType === "mouse") want = "grabbing";
    else if (mouseActive && hitTest(mouse.current.cx, mouse.current.cy) >= 0) want = "grab";
    if (want !== cursor.current) {
      cursor.current = want;
      document.body.style.cursor = want;
    }

    // 6. themed falling layer: the shape changes with the fragrance, fading between shapes
    if (active || s.index >= 0) {
      const sl = list[best];
      if (sl && active) {
        s.fxActive = sl.fx;
        fxTint.current.set(sl.accent).lerp(WHITE, 0.6);
      }
    }
    for (let k = 0; k < FX_TYPES.length; k++) {
      const mesh = fxMeshes.current[k];
      const mat = fxMats.current[k];
      if (!mesh || !mat) continue;
      fxAlpha.current[k] += ((k === s.fxActive && !s.lowQ ? 1 : 0) - fxAlpha.current[k]) * ease(3);
      const a = fxAlpha.current[k];
      mesh.visible = a > 0.02;
      if (!mesh.visible) continue;
      mat.opacity = 0.55 * a;
      mat.color.lerp(fxTint.current, 0.08);
      const P = FX_PARAMS[FX_TYPES[k]];
      const data = fxData[k];
      for (let i = 0; i < fxCount.current; i++) {
        const d = data[i];
        const dist = CAM_Z - d.z;
        const halfH = TAN * dist;
        const halfW = halfH * aspect;
        const range = halfH * 2 + 4;
        const pxz = (2 * dist * TAN) / vh;
        const f = 0.2 + (d.z + 16) * 0.02; // nearer ones move faster with scroll
        const y = wrap((d.fy - 0.5) * range - P.fall * d.speed * t + scrollY * f * pxz, range);
        const x = d.fx * halfW + Math.sin(t * P.sway + d.phase) * P.amp + mouse.current.x * -d.z * 0.03;
        let rot = P.spin * d.spin * t + d.phase;
        if (P.swing) rot = Math.sin(t * 1.2 + d.phase) * 0.5;
        if (FX_TYPES[k] === "bolt") rot = 0.35;
        const pulse = P.pulse ? 0.7 + 0.3 * Math.sin(t * 2 + d.phase) : 1;
        dummy.position.set(x, y, d.z);
        dummy.rotation.set(0, 0, rot);
        dummy.scale.set(d.size * P.sx * pulse, d.size * P.sy * pulse, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    // 7. deep space: glow clouds far behind, and a starfield that streaks when you scroll or move between sections
    s.space += (s.spaceTarget - s.space) * ease(3);
    const warpTarget = clamp(Math.abs(vel / dt) / 3000, 0, 1.2);
    s.warp += (warpTarget + s.burst - s.warp) * ease(4);
    s.burst *= Math.exp(-1.4 * dt);
    s.starPhase += (0.025 + Math.min(s.warp, 1.8) * 0.9) * dt;

    const sm = starMesh.current;
    if (sm) {
      sm.visible = s.space > 0.02;
      if (sm.visible) {
        const distS = CAM_Z - STAR_Z;
        const halfHS = TAN * distS;
        const halfWS = halfHS * aspect;
        const maxD = Math.hypot(halfWS, halfHS) * 1.2;
        const kS = distS / CAM_Z;
        const onBottle = active && s.glow > 0.2;
        s.starX += ((onBottle ? s.x * kS : 0) - s.starX) * ease(4);
        s.starY += ((onBottle ? s.y * kS : 0) - s.starY) * ease(4);
        s.starHole += ((onBottle ? clamp(s.h * kS * 0.42, 1.3, 7.5) : 1.3) - s.starHole) * ease(4);
        const hole = s.starHole;
        const w = Math.min(s.warp, 1.6);
        const n = starCount.current;
        sm.count = n;
        for (let i = 0; i < n; i++) {
          const sd = starData[i];
          const travel = (((s.starPhase * 4 - sd.offset) % 1) + 1) % 1;
          const head = hole + travel * (maxD - hole);
          const len = sd.len * (0.12 + w) * (0.3 + travel * 0.9);
          const tail = Math.max(hole, head - len);
          const cd = (head + tail) / 2;
          const ramp = clamp((head - hole) / 4, 0, 1);
          dummy.position.set(s.starX + Math.cos(sd.a) * cd, s.starY + Math.sin(sd.a) * cd, STAR_Z);
          dummy.rotation.set(0, 0, sd.a);
          dummy.scale.set(Math.max(head - tail, 0.001), sd.w * (0.5 + travel * 0.9) * ramp, 1);
          dummy.updateMatrix();
          sm.setMatrixAt(i, dummy.matrix);
        }
        sm.instanceMatrix.needsUpdate = true;
        if (starMat.current) starMat.current.opacity = 0.95 * s.space;
      }
    }

    for (let i = 0; i < NEB.length; i++) {
      const m = nebMeshes.current[i];
      const mt = nebMats.current[i];
      if (!m || !mt) continue;
      const nb = NEB[i];
      m.visible = s.space > 0.02;
      if (!m.visible) continue;
      m.position.set(
        nb.x + Math.sin(t * 0.05 + nb.ph) * 2 + mouse.current.x * -nb.z * 0.03,
        nb.y + Math.sin(scrollY * 0.0007 + nb.ph) * 5 + Math.cos(t * 0.04 + nb.ph) * 1.5,
        nb.z
      );
      m.rotation.z = t * 0.01 * (nb.ph > 3 ? -1 : 1);
      // each glow keeps its own hue but leans towards the colour of the section you are in
      tmpColor.current.set(nb.col).lerp(fogTarget.current, 0.35);
      mt.color.lerp(tmpColor.current, 0.05);
      mt.opacity = nb.op * s.space;
    }

    if (!s.ready && assetsStatus.current !== "loading") {
      s.ready = true;
      window.__tagSceneReady = true;
      window.dispatchEvent(new Event(EVT.sceneReady));
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#ffffff", "#8896c8", 0.35]} />
      <directionalLight position={[2, 3, 5]} intensity={1.7} />
      <directionalLight position={[-3, 1, -2]} intensity={0.8} color="#9bb4ff" />

      {NEB.map((n, i) => (
        <mesh
          key={i}
          ref={(m) => {
            nebMeshes.current[i] = m;
          }}
          position={[n.x, n.y, n.z]}
          scale={[n.size, n.size, 1]}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={(m) => {
              nebMats.current[i] = m;
            }}
            map={radialTex}
            color={n.col}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            fog={false}
          />
        </mesh>
      ))}

      <instancedMesh ref={starMesh} args={[undefined, undefined, STAR_N]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          ref={starMat}
          map={streakTex}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          fog={false}
        />
      </instancedMesh>

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

      {FX_TYPES.map((type, k) => (
        <instancedMesh
          key={type}
          ref={(m) => {
            fxMeshes.current[k] = m;
          }}
          args={[undefined, undefined, FX_COUNT]}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={(m) => {
              fxMats.current[k] = m;
            }}
            map={fxTex[k]}
            transparent
            opacity={0}
            depthWrite={false}
            color="#ffffff"
          />
        </instancedMesh>
      ))}

      <group>
        {bg.map((b, i) => (
          <group
            key={i}
            ref={(el) => {
              bgRefs.current[i] = el;
            }}
          >
            {assets ? (
              <mesh geometry={assets.lo}>
                <meshStandardMaterial
                  color="#555555"
                  map={assets.tex[b.texSlug]}
                  emissive="#ffffff"
                  emissiveMap={assets.tex[b.texSlug]}
                  emissiveIntensity={0.8}
                  roughness={0.45}
                  metalness={0}
                  envMapIntensity={0.4}
                />
              </mesh>
            ) : (
              <BottleParts geo={loGeo} colors={b.colors} map={b.map} />
            )}
          </group>
        ))}
      </group>

      <group ref={mainGroup}>
        {assets ? (
          <mesh geometry={assets.hi}>
            <meshPhysicalMaterial
              ref={mainRealMat}
              color="#555555"
              map={assets.tex["whitening"]}
              emissive="#ffffff"
              emissiveMap={assets.tex["whitening"]}
              emissiveIntensity={0.8}
              roughness={0.4}
              metalness={0}
              clearcoat={0.4}
              clearcoatRoughness={0.2}
              envMapIntensity={0.5}
            />
          </mesh>
        ) : (
          <BottleParts geo={hiGeo} refs={refs} fancy />
        )}
      </group>
    </>
  );
}

export default function SceneCanvas() {
  // sections without a roll-on cover the scene with solid backgrounds, so stop drawing it there
  const [show, setShow] = useState(true);
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-space]")).filter(
      (el) => parseFloat(el.dataset.space ?? "0") > 0.05
    );
    let boxes: { top: number; bottom: number }[] = [];
    const check = () => {
      const sy = window.scrollY;
      const vh = window.innerHeight;
      const vis = boxes.length === 0 || boxes.some((b) => b.bottom > sy - 0.5 * vh && b.top < sy + 1.5 * vh);
      setShow((prev) => (prev === vis ? prev : vis));
    };
    const measure = () => {
      const sy = window.scrollY;
      boxes = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + sy, bottom: r.bottom + sy };
      });
      check();
    };
    measure();
    let timer = 0;
    const later = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    };
    const ro = new ResizeObserver(later);
    ro.observe(document.body);
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", later);
    window.addEventListener("load", later);
    window.addEventListener(EVT.entered, later);
    const t1 = window.setTimeout(measure, 900);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(t1);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", later);
      window.removeEventListener("load", later);
      window.removeEventListener(EVT.entered, later);
    };
  }, []);

  return (
    <Canvas
      frameloop={show ? "always" : "never"}
      flat
      dpr={[1, 1.25]}
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
