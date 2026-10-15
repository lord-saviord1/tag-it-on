"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { makeLabelTexture } from "@/lib/bottleLabel";
import { driver } from "@/lib/lenisDriver";

const CAM_Z = 20;
const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360); // tan(fov / 2)
const TWO_PI = Math.PI * 2;
const LAYER_Z = [-4, -8.5, -14]; // near, middle and far layers of background roll-ons
const UI_SELECTOR = "a, button, input, textarea, select, label, header, .quiz-overlay, [data-open-quiz]";
// a roll-on is approximated by three circles stacked on its long axis: [x, y, radius], model units
const CIRCLES: [number, number, number][] = [
  [0, 0.8, 0.64],
  [0, 0.05, 0.52],
  [0, -0.75, 0.72],
];

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
type Slot = Colors & { el: HTMLElement; accent: string; deep: string; label: string; fx: number };
type World = { el: HTMLElement; color: THREE.Color; haze: number };
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
};
type Phys = { dx: number; dy: number; vx: number; vy: number; rot: number; spinV: number; ang: number; angV: number };
type ScreenInfo = { sx: number; sy: number; hw: number; hh: number; z: number };
type Grab = { i: number; pointerType: string; startX: number; startY: number; moved: boolean };
type Geos = { shell: THREE.LatheGeometry; bowl: THREE.LatheGeometry; seg: number };
type MatRefs = {
  body: RefObject<THREE.MeshStandardMaterial>;
  ball: RefObject<THREE.MeshStandardMaterial>;
  base: RefObject<THREE.MeshStandardMaterial>;
  trim: RefObject<THREE.MeshStandardMaterial>;
  label: RefObject<THREE.MeshStandardMaterial>;
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

  const mainGroup = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const bgRefs = useRef<(THREE.Group | null)[]>([]);
  const fxMeshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const fxMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const fxAlpha = useRef<number[]>(FX_TYPES.map(() => 0));
  const fxTint = useRef(new THREE.Color("#ffffff"));
  const fxCount = useRef(FX_COUNT);

  const bodyMat = useRef<THREE.MeshStandardMaterial>(null);
  const ballMat = useRef<THREE.MeshStandardMaterial>(null);
  const baseMat = useRef<THREE.MeshStandardMaterial>(null);
  const trimMat = useRef<THREE.MeshStandardMaterial>(null);
  const labelMat = useRef<THREE.MeshStandardMaterial>(null);
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
    far: CAM_Z + 26,
    farTarget: CAM_Z + 26,
  });
  const fogTarget = useRef(new THREE.Color("#2244ff"));
  const haloTarget = useRef(new THREE.Color("#ffffff"));
  const [bg, setBg] = useState<BgSpec[]>([]);

  /** Put the main roll-on into the look of slot `idx` (colours, label, halo). */
  const applyLook = (idx: number) => {
    const sl = slots.current[idx];
    if (!sl) return;
    bodyMat.current?.color.set(sl.body);
    ballMat.current?.color.set(sl.ball);
    baseMat.current?.color.set(sl.base);
    trimMat.current?.color.set(sl.trim);
    const lm = labelMat.current;
    if (lm) {
      lm.map = textures.current[idx] ?? null;
      lm.needsUpdate = true;
    }
    haloTarget.current.set(sl.accent).lerp(new THREE.Color("#ffffff"), 0.45);
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
    }));
    textures.current = slots.current.map((s) => makeLabelTexture(s.label, s.accent));

    worlds.current = Array.from(document.querySelectorAll<HTMLElement>("[data-world]")).map((el) => ({
      el,
      color: new THREE.Color(el.dataset.world ?? "#2244ff"),
      haze: parseFloat(el.dataset.haze ?? "1"),
    }));

    const small = window.innerWidth < 700;
    fxCount.current = small ? 24 : FX_COUNT;
    fxMeshes.current.forEach((m) => {
      if (m) m.count = fxCount.current;
    });

    // roll-ons: some hang in place, a few slowly drift across, on three depth layers
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const list = slots.current;
    const pool = list.length > 1 ? list.slice(1) : list;
    const nHang = reduce ? 0 : small ? 7 : 8;
    const nDrift = reduce ? 0 : small ? 2 : 3;
    const perLayer = Math.max(1, Math.ceil(nHang / 3));
    const rnd = mulberry32(11);
    const specs: BgSpec[] = [];
    const make = (layer: number, k: number, i: number, driftSpeed: number) => {
      const slot = pool[(i * 2 + layer) % pool.length];
      const tex = textures.current[list.indexOf(slot)];
      // background roll-ons are 10% smaller than before
      const s0 = (layer === 0 ? 1.5 + rnd() * 0.6 : layer === 1 ? 1.1 + rnd() * 0.5 : 0.9 + rnd() * 0.4) * 0.9;
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
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      textures.current.forEach((t) => t.dispose());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state) => {
    // 1. advance smooth scroll first, so everything below reads this frame's scroll position
    const now = performance.now();
    driver.lastExternal = now;
    if (driver.lenis) driver.lenis.raf(now);

    const s = st.current;
    const g = mainGroup.current;
    const list = slots.current;
    if (!g || list.length === 0) return;

    const dt = s.last ? clamp((now - s.last) / 1000, 0.001, 0.05) : 0.016;
    s.last = now;
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
          s.rotTarget = (s.dir > 0 ? Math.ceil(turns) + 1 : Math.floor(turns) - 1) * TWO_PI;
          s.rotY = s.rotTarget - s.dir * TWO_PI * 1.2;
        } else if (best !== s.index) {
          // leaving: slide out of the side it is on, spinning faster and faster
          s.mode = "out";
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
      rate = 9;
      s.omega = Math.min(22, s.omega + 60 * dt);
      s.rotY += s.dir * s.omega * dt;
      if (Math.abs(s.x) >= offX * 0.97) {
        // it has left the screen: swap to the new fragrance, then spin in from the side it will sit on
        applyLook(best);
        s.index = best;
        s.x = (slotX >= 0 ? 1 : -1) * offX;
        s.mode = "in";
        const turns = s.rotY / TWO_PI;
        s.rotTarget = (s.dir > 0 ? Math.ceil(turns) + 1 : Math.floor(turns) - 1) * TWO_PI;
        targetX = slotX;
        rate = 7;
      }
    } else if (s.mode === "in") {
      if (best !== s.index) {
        applyLook(best);
        s.index = best;
      }
      targetX = slotX;
      rate = 7;
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
      h.visible = s.glow > 0.01;
      h.position.set(s.x, s.y, -2.5);
      h.scale.setScalar(s.h * 1.7 + 0.0001);
      hm.color.lerp(haloTarget.current, 0.12);
      hm.opacity = 0.6 * s.glow;
    }

    // 4. atmosphere: distant things fade into the colour of the section behind them
    const ws = worlds.current;
    for (let i = 0; i < ws.length; i++) {
      const r = ws[i].el.getBoundingClientRect();
      if (r.top <= vh / 2 && r.bottom > vh / 2) {
        fogTarget.current.copy(ws[i].color);
        s.farTarget = CAM_Z + 8 + 18 * ws[i].haze;
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
        for (const [, ly1, r1] of CIRCLES) {
          const ax = px[a] - ly1 * sinA * A.s0;
          const ay = py[a] + ly1 * cosA * A.s0;
          const ar = r1 * A.s0;
          for (const [, ly2, r2] of CIRCLES) {
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
        fxTint.current.set(sl.accent).lerp(new THREE.Color("#ffffff"), 0.6);
      }
    }
    for (let k = 0; k < FX_TYPES.length; k++) {
      const mesh = fxMeshes.current[k];
      const mat = fxMats.current[k];
      if (!mesh || !mat) continue;
      fxAlpha.current[k] += ((k === s.fxActive ? 1 : 0) - fxAlpha.current[k]) * ease(3);
      const a = fxAlpha.current[k];
      mesh.visible = a > 0.02;
      if (!mesh.visible) continue;
      mat.opacity = 0.8 * a;
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
