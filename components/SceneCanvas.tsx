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
const LAYER_Z = [-4, -8.5, -14]; // near, middle and far layers of background roll-ons
const UI_SELECTOR = "a, button, input, textarea, select, label, header, .quiz-overlay, [data-open-quiz]";

type Colors = { body: string; ball: string; base: string; trim: string };
type Slot = Colors & { el: HTMLElement; accent: string; deep: string; label: string };
type World = { el: HTMLElement; color: THREE.Color; haze: number };
type BgSpec = {
  fx: number;
  fy: number;
  z: number;
  s0: number;
  r: number; // collision radius, world units
  layer: number;
  spin: number;
  phase: number;
  tilt: number;
  colors: Colors;
  map: THREE.Texture;
};
type Phys = { dx: number; dy: number; vx: number; vy: number; rot: number; spinV: number };
type ScreenInfo = { sx: number; sy: number; rpx: number; z: number };
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

/** The whole immersive world, in ONE WebGL scene, in three clear layers:
 *  1. BACK: roll-ons floating on three depth layers (near / middle / far) that fade into the
 *     section colour with distance. They drift with scroll, push away from the cursor, can be
 *     dragged and thrown with a mouse (tapped on a phone) and bump into each other.
 *  2. MIDDLE: the main roll-on. It stays put while sections scroll past and only moves when
 *     the product changes: it glides across, spins once and swaps to the new fragrance.
 *  3. FRONT: the page text (HTML, above the canvas). */
function Scene() {
  const hiGeo = useMemo(() => buildGeos(64), []);
  const loGeo = useMemo(() => buildGeos(28), []);
  const radialTex = useMemo(() => makeRadialTexture(), []);

  const mainGroup = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const haloMat = useRef<THREE.MeshBasicMaterial>(null);
  const bgRefs = useRef<(THREE.Group | null)[]>([]);
  const posAttr = useRef<THREE.BufferAttribute>(null);

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
    pending: -1,
    swapAt: 0,
    spin: 0,
    tilt: 0,
    lastScroll: 0,
    last: 0,
    x: 0,
    y: 0,
    h: 0,
    glow: 0,
    init: false,
    far: CAM_Z + 26,
    farTarget: CAM_Z + 26,
  });
  const fogTarget = useRef(new THREE.Color("#2244ff"));
  const haloTarget = useRef(new THREE.Color("#ffffff"));
  const [bg, setBg] = useState<BgSpec[]>([]);

  const particles = useMemo(() => {
    const rnd = mulberry32(5);
    const base = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) {
      base[i * 3] = rnd() * 2 - 1;
      base[i * 3 + 1] = rnd();
      base[i * 3 + 2] = rnd() * 18 - 16;
    }
    return { base, positions: new Float32Array(PN * 3) };
  }, []);

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
      if (Math.hypot(cx - sc.sx, cy - sc.sy) < sc.rpx && sc.z > bestZ) {
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
    }));
    textures.current = slots.current.map((s) => makeLabelTexture(s.label, s.accent));

    worlds.current = Array.from(document.querySelectorAll<HTMLElement>("[data-world]")).map((el) => ({
      el,
      color: new THREE.Color(el.dataset.world ?? "#2244ff"),
      haze: parseFloat(el.dataset.haze ?? "1"),
    }));

    // roll-ons floating on three depth layers behind the content
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const list = slots.current;
    const pool = list.length > 1 ? list.slice(1) : list;
    const n = reduce ? 0 : window.innerWidth < 700 ? 9 : 12;
    const perLayer = Math.max(1, Math.ceil(n / 3));
    const rnd = mulberry32(11);
    const specs: BgSpec[] = [];
    for (let i = 0; i < n; i++) {
      const layer = i % 3;
      const k = Math.floor(i / 3);
      const slot = pool[(i * 2 + layer) % pool.length];
      const tex = textures.current[list.indexOf(slot)];
      const s0 = layer === 0 ? 1.5 + rnd() * 0.6 : layer === 1 ? 1.1 + rnd() * 0.5 : 0.9 + rnd() * 0.4;
      const fxRaw = ((k + 0.5) / perLayer) * 2 - 1 + layer * 0.37 + (rnd() - 0.5) * 0.3;
      specs.push({
        fx: wrap(fxRaw, 2),
        fy: (k / perLayer + layer * 0.31 + rnd() * 0.1) % 1,
        z: LAYER_Z[layer],
        s0,
        r: s0 * 0.95,
        layer,
        spin: (0.15 + rnd() * 0.45) * (rnd() < 0.5 ? -1 : 1),
        phase: rnd() * 6.28,
        tilt: (rnd() - 0.5) * 0.9,
        colors: { body: slot.body, ball: slot.ball, base: slot.base, trim: slot.trim },
        map: tex,
      });
    }
    phys.current = specs.map(() => ({ dx: 0, dy: 0, vx: 0, vy: 0, rot: 0, spinV: 0 }));
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

    // 3. main roll-on: it only transitions when the product changes
    if (active && best !== s.index) {
      if (s.index < 0) {
        applyLook(best);
      } else {
        s.spin = Math.PI * 2; // one full turn while it glides across...
        s.pending = best; // ...and swaps to the new fragrance part-way through
        s.swapAt = now + 180;
      }
      s.index = best;
    }
    if (s.pending >= 0 && now >= s.swapAt) {
      applyLook(s.pending);
      s.pending = -1;
    }

    const slotH = bestRect.height * upp;
    const parkX = TAN * CAM_Z * aspect + slotH * 0.9; // just off the right edge of the screen
    const tx = active ? (bestRect.left + bestRect.width / 2 - vw / 2) * upp : parkX;
    const cyPx = bestRect.top + bestRect.height / 2 - vh / 2;
    const ty = active ? -clamp(cyPx, -0.1 * vh, 0.1 * vh) * upp : 0;
    if (!s.init) {
      s.x = tx;
      s.y = ty;
      s.h = slotH;
      s.init = true;
    }
    s.x += (tx - s.x) * 0.1;
    s.y += (ty - s.y) * 0.12;
    s.h += (slotH - s.h) * 0.1;
    s.glow += ((active ? 1 : 0) - s.glow) * 0.1;

    const vel = scrollY - s.lastScroll;
    s.lastScroll = scrollY;
    s.tilt += (clamp(vel * 0.006, -0.45, 0.45) - s.tilt) * 0.1;
    s.spin *= 0.94;

    g.visible = true;
    g.position.set(s.x, s.y + Math.sin(t * 1.4) * 0.12, 0);
    g.scale.setScalar(Math.max(s.h / 3.0, 0.0001));
    g.rotation.y = s.spin + Math.sin(t * 0.7) * 0.55 + Math.sin(scrollY * 0.003) * 0.35 + mouse.current.x * 0.4;
    g.rotation.x = mouse.current.y * 0.1 + s.tilt;
    g.rotation.z = Math.sin(t * 0.8) * 0.03 - ((tx - s.x) / Math.max(slotH, 0.001)) * 0.4;

    const h = halo.current;
    const hm = haloMat.current;
    if (h && hm) {
      h.visible = s.glow > 0.01;
      h.position.set(s.x, s.y, -2.5);
      h.scale.setScalar(s.h * 1.7 + 0.0001);
      hm.color.lerp(haloTarget.current, 0.12);
      hm.opacity = 0.6 * s.glow;
    }

    // 4. atmosphere: distant roll-ons fade into the colour of the section behind them
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

    // 5. background roll-ons: scroll parallax + physics (cursor push, drag, throw, collisions)
    const specs = bg;
    const ph = phys.current;
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
      const homeX = b.fx * halfW * 0.95 + mouse.current.x * -b.z * 0.05;
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
      posX.current[i] = homeX + p.dx;
      posY.current[i] = homeY + p.dy;
    }

    // roll-ons on the same layer bump into each other
    for (let a = 0; a < specs.length; a++) {
      for (let c = a + 1; c < specs.length; c++) {
        if (specs[a].layer !== specs[c].layer) continue;
        const pa = ph[a];
        const pc = ph[c];
        if (!pa || !pc) continue;
        const ddx = posX.current[a] - posX.current[c];
        const ddy = posY.current[a] - posY.current[c];
        const d = Math.hypot(ddx, ddy);
        const minD = specs[a].r + specs[c].r;
        if (d < minD && d > 0.0001) {
          const nx = ddx / d;
          const ny = ddy / d;
          const ov = (minD - d) / 2;
          pa.dx += nx * ov;
          pa.dy += ny * ov;
          pc.dx -= nx * ov;
          pc.dy -= ny * ov;
          posX.current[a] += nx * ov;
          posY.current[a] += ny * ov;
          posX.current[c] -= nx * ov;
          posY.current[c] -= ny * ov;
          const rel = (pa.vx - pc.vx) * nx + (pa.vy - pc.vy) * ny;
          if (rel < 0) {
            const imp = -rel * 0.95;
            pa.vx += nx * imp;
            pa.vy += ny * imp;
            pc.vx -= nx * imp;
            pc.vy -= ny * imp;
            pa.spinV += (Math.random() - 0.5) * 3;
            pc.spinV += (Math.random() - 0.5) * 3;
          }
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
      el.position.set(posX.current[i], posY.current[i], b.z);
      el.scale.setScalar(b.s0);
      el.rotation.set(Math.sin(t * 0.4 + b.phase) * 0.25, t * b.spin + b.phase + p.rot, b.tilt);
      screen.current[i] = {
        sx: (posX.current[i] / halfW) * 0.5 * vw + vw * 0.5,
        sy: vh * 0.5 - (posY.current[i] / halfH) * 0.5 * vh,
        rpx: (b.r * vh) / (2 * halfH),
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

    // 6. drifting particles
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
          map={radialTex}
          size={0.28}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
          color="#ffffff"
        />
      </points>

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
