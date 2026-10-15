"use client";

import { useEffect, useRef, useState } from "react";
import { driver } from "@/lib/lenisDriver";
import { EVT } from "@/lib/events";

type Phase = "loading" | "ready" | "exploding" | "panel" | "closing" | "done";

const TWO_PI = Math.PI * 2;
// colours of the roll-on drawn by the loader: body, label, ball, base, collar
const PALETTE = ["#2a4bff", "#ffffff", "#3b82ff", "#dfe9ff", "#7dd3ff"];
// right-hand outline of the roll-on, [radius, height], top to bottom (the same shape as the 3D model)
const PROFILE: [number, number][] = [
  [0, 1.56],
  [0.24, 1.53],
  [0.46, 1.42],
  [0.6, 1.2],
  [0.63, 0.85],
  [0.58, 0.45],
  [0.52, 0.15],
  [0.5, -0.05],
  [0.56, -0.25],
  [0.64, -0.5],
  [0.68, -0.8],
  [0.7, -0.95],
  [0.68, -1.15],
  [0.58, -1.3],
  [0.42, -1.35],
  [0, -1.35],
];

type Cell = {
  hx: number;
  hy: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  c: number;
  row: number;
  delay: number;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const PALETTE_RGB = PALETTE.map(hexToRgb);

/** A tiny roll-on: the "character" every cell of the loader is made of. */
function makeGlyph(color: string, step: number, dpr: number) {
  const g = Math.round(step * 1.5 * dpr);
  const c = document.createElement("canvas");
  c.width = g;
  c.height = g;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.strokeStyle = "#0a1450";
  x.lineWidth = Math.max(1, g * 0.07);
  x.lineJoin = "round";
  x.beginPath();
  x.arc(g * 0.5, g * 0.3, g * 0.2, 0, TWO_PI);
  x.fill();
  x.stroke();
  x.beginPath();
  x.arc(g * 0.5, g * 0.66, g * 0.26, 0, TWO_PI);
  x.fill();
  x.stroke();
  x.fillRect(g * 0.38, g * 0.42, g * 0.24, g * 0.12);
  return c;
}

/** Loading screen: a TAG roll-on drawn out of hundreds of tiny roll-ons that fills as the site loads.
 *  Tap it and it explodes; a navigation panel then opens up into the site (like the Awwwards nav). */
export default function Loader() {
  const [phase, setPhaseState] = useState<Phase>("loading");
  const [open, setOpen] = useState(false);
  const phaseRef = useRef<Phase>("loading");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: -999, y: -999 });
  const explodeRef = useRef<((x: number, y: number) => void) | null>(null);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const finish = () => {
    document.documentElement.classList.remove("is-loading");
    driver.lenis?.start();
    window.dispatchEvent(new Event(EVT.entered));
  };

  const skip = () => {
    window.dispatchEvent(new CustomEvent(EVT.burst));
    finish();
    go("closing");
  };

  // the canvas animation
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      document.documentElement.classList.remove("is-loading");
      go("done");
      return;
    }

    let stopTries = 0;
    const tryStop = () => {
      if (driver.lenis) driver.lenis.stop();
      else if (stopTries++ < 90) requestAnimationFrame(tryStop);
    };
    tryStop();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    let step = 13;
    let rows = 1;
    let cells: Cell[] = [];
    let sprites: HTMLCanvasElement[] = [];
    let bgStars: { x: number; y: number; r: number; ph: number }[] = [];
    let raf = 0;
    let tExplode = 0;
    let progress = 0;
    const flags = { fonts: false, load: false, scene: false };

    // readiness: fonts, the page, and the 3D scene
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => (flags.fonts = true));
    else flags.fonts = true;
    if (document.readyState === "complete") flags.load = true;
    else window.addEventListener("load", () => (flags.load = true), { once: true });
    if (window.__tagSceneReady) flags.scene = true;
    const onScene = () => (flags.scene = true);
    window.addEventListener(EVT.sceneReady, onScene);
    const failSafe = window.setTimeout(() => {
      flags.fonts = flags.load = flags.scene = true;
    }, 7000);

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      step = W < 700 ? 11 : 13;
      const targetH = Math.min(H * 0.6, 560);
      rows = Math.max(20, Math.floor(targetH / step));
      const cols = Math.max(10, Math.round(rows * 0.52));

      // draw the roll-on silhouette (with its label, ball and base) small, then turn each pixel into a cell
      const sampler = document.createElement("canvas");
      sampler.width = cols;
      sampler.height = rows;
      const s = sampler.getContext("2d")!;
      const mx = (x: number) => ((x + 0.75) / 1.5) * cols;
      const my = (y: number) => ((1.58 - y) / 2.95) * rows;
      const trace = () => {
        s.beginPath();
        PROFILE.forEach(([r, y], i) => (i === 0 ? s.moveTo(mx(r), my(y)) : s.lineTo(mx(r), my(y))));
        for (let i = PROFILE.length - 1; i >= 0; i--) s.lineTo(mx(-PROFILE[i][0]), my(PROFILE[i][1]));
        s.closePath();
      };
      trace();
      s.fillStyle = PALETTE[0];
      s.fill();
      s.save();
      trace();
      s.clip();
      s.fillStyle = PALETTE[2]; // roll-on ball
      s.beginPath();
      s.ellipse(mx(0), my(-0.5), (0.6 / 1.5) * cols, (0.6 / 2.95) * rows, 0, 0, TWO_PI);
      s.fill();
      s.fillStyle = PALETTE[3]; // base
      s.fillRect(0, my(-0.85), cols, my(-1.45) - my(-0.85));
      s.fillStyle = PALETTE[1]; // label
      s.fillRect(mx(-0.42), my(1.18), mx(0.42) - mx(-0.42), my(0.28) - my(1.18));
      s.fillStyle = PALETTE[0]; // TAG banner on the label
      s.fillRect(mx(-0.42), my(1.18), mx(0.42) - mx(-0.42), my(0.95) - my(1.18));
      s.fillStyle = PALETTE[4]; // collar
      s.fillRect(0, my(0.06), cols, my(-0.08) - my(0.06));
      s.restore();

      const data = s.getImageData(0, 0, cols, rows).data;
      const ox = W / 2 - (cols * step) / 2;
      const oy = H * 0.45 - (rows * step) / 2;
      cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = (r * cols + c) * 4;
          if (data[i + 3] < 110) continue;
          let best = 0;
          let bd = Infinity;
          for (let k = 0; k < PALETTE_RGB.length; k++) {
            const d =
              (data[i] - PALETTE_RGB[k][0]) ** 2 +
              (data[i + 1] - PALETTE_RGB[k][1]) ** 2 +
              (data[i + 2] - PALETTE_RGB[k][2]) ** 2;
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
          const hx = ox + c * step + step / 2;
          const hy = oy + r * step + step / 2;
          const ang = Math.random() * TWO_PI;
          const rad = Math.max(W, H) * (0.5 + Math.random() * 0.6);
          cells.push({
            hx,
            hy,
            sx: W / 2 + Math.cos(ang) * rad,
            sy: H / 2 + Math.sin(ang) * rad,
            x: hx,
            y: hy,
            ox: 0,
            oy: 0,
            vx: 0,
            vy: 0,
            rot: 0,
            vr: 0,
            c: best,
            row: r,
            delay: Math.random() * 900,
          });
        }
      }
      sprites = PALETTE.map((col) => makeGlyph(col, step, dpr));
      bgStars = Array.from({ length: 70 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.6 + Math.random() * 1.4,
        ph: Math.random() * TWO_PI,
      }));
    };
    build();
    const onResize = () => {
      if (phaseRef.current === "loading" || phaseRef.current === "ready") build();
    };
    window.addEventListener("resize", onResize);

    explodeRef.current = (px, py) => {
      tExplode = performance.now();
      for (const cell of cells) {
        const dx = cell.x - px;
        const dy = cell.y - py;
        const d = Math.hypot(dx, dy) || 1;
        const speed = (5 + Math.random() * 11) * (1 + 120 / (d + 60));
        cell.vx = (dx / d) * speed + (Math.random() - 0.5) * 3;
        cell.vy = (dy / d) * speed - 3;
        cell.vr = (Math.random() - 0.5) * 0.5;
      }
    };

    const gw = () => step * 1.5;
    const t0 = performance.now();
    let last = t0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - t0) / 1000;
      const ph = phaseRef.current;
      ctx.clearRect(0, 0, W, H);

      // a few twinkling stars behind the roll-on
      for (const st of bgStars) {
        ctx.globalAlpha = 0.15 + 0.3 * (0.5 + 0.5 * Math.sin(elapsed * 1.5 + st.ph));
        ctx.fillStyle = "#cfe6ff";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, TWO_PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (ph === "loading") {
        const cap = 0.12 + (flags.fonts ? 0.22 : 0) + (flags.load ? 0.26 : 0) + (flags.scene ? 0.4 : 0);
        const target = Math.min(cap, elapsed / 2.4);
        progress += (target * 100 - progress) * (1 - Math.exp(-4 * dt));
        if (target >= 0.999 && progress > 99.4) {
          progress = 100;
          phaseRef.current = "ready";
          setPhaseState("ready");
        }
      }
      if (pctRef.current) pctRef.current.textContent = String(Math.floor(progress)).padStart(2, "0") + "%";

      const size = gw();
      if (ph === "exploding" || ph === "panel" || ph === "closing") {
        const te = (now - tExplode) / 1000;
        const alpha = Math.max(0, Math.min(1, 1 - (te - 0.5) / 1.0));
        if (alpha <= 0) return;
        const k = dt * 60;
        for (const cell of cells) {
          cell.x += cell.vx * k;
          cell.y += cell.vy * k;
          cell.vy += 0.18 * k;
          cell.vx *= 0.995;
          cell.rot += cell.vr * k;
          ctx.globalAlpha = alpha;
          ctx.save();
          ctx.translate(cell.x, cell.y);
          ctx.rotate(cell.rot);
          ctx.drawImage(sprites[cell.c], -size / 2, -size / 2, size, size);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        return;
      }

      const fill = ph === "loading" ? progress / 100 : 1;
      for (const cell of cells) {
        const a = Math.max(0, Math.min(1, (elapsed * 1000 - cell.delay) / 900));
        const e = 1 - Math.pow(1 - a, 3);
        let cx = cell.sx + (cell.hx - cell.sx) * e;
        let cy = cell.sy + (cell.hy - cell.sy) * e;
        // the cursor pushes the tiny roll-ons away
        const dxp = cx - pointer.current.x;
        const dyp = cy - pointer.current.y;
        const dd = Math.hypot(dxp, dyp);
        let tx = 0;
        let ty = 0;
        if (dd < 110 && dd > 0) {
          const push = (1 - dd / 110) * 28;
          tx = (dxp / dd) * push;
          ty = (dyp / dd) * push;
        }
        cell.ox += (tx - cell.ox) * 0.12;
        cell.oy += (ty - cell.oy) * 0.12;
        cx += cell.ox;
        cy += cell.oy;
        cell.x = cx;
        cell.y = cy;
        const lit = (rows - 1 - cell.row) / (rows - 1) <= fill + 0.001; // fills from the bottom up
        ctx.globalAlpha = (lit ? 1 : 0.16) * e;
        const pulse = ph === "ready" ? 1 + 0.07 * Math.sin(elapsed * 3 + cell.row * 0.3) : 1;
        const sz = size * pulse;
        ctx.drawImage(sprites[cell.c], cx - sz / 2, cy - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(failSafe);
      window.removeEventListener(EVT.sceneReady, onScene);
      window.removeEventListener("resize", onResize);
      explodeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the sequence after the tap: explosion, panel opens, loader fades away
  useEffect(() => {
    if (phase === "exploding") {
      window.dispatchEvent(new CustomEvent(EVT.burst));
      const t = window.setTimeout(() => go("panel"), 800);
      return () => window.clearTimeout(t);
    }
    if (phase === "panel") {
      const a = window.setTimeout(() => {
        setOpen(true);
        window.dispatchEvent(new CustomEvent(EVT.burst));
      }, 700);
      const b = window.setTimeout(() => {
        finish();
        go("closing");
      }, 2100);
      return () => {
        window.clearTimeout(a);
        window.clearTimeout(b);
      };
    }
    if (phase === "closing") {
      const c = window.setTimeout(() => go("done"), 700);
      return () => window.clearTimeout(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const tap = (x: number, y: number) => {
    if (phaseRef.current !== "ready") return;
    explodeRef.current?.(x, y);
    go("exploding");
  };

  if (phase === "done") return null;

  return (
    <div
      className={`loader ${phase === "closing" ? "is-closing" : ""}`}
      role="dialog"
      aria-label="TAG is loading. Tap to enter."
      tabIndex={0}
      onPointerDown={(e) => tap(e.clientX, e.clientY)}
      onPointerMove={(e) => {
        pointer.current.x = e.clientX;
        pointer.current.y = e.clientY;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") tap(window.innerWidth / 2, window.innerHeight / 2);
      }}
    >
      <canvas ref={canvasRef} className="loader-canvas" />
      <div className="loader-ui">
        <div className="loader-top">DON&apos;T TROLL, JUST TAG IT ON</div>
        <div className="loader-bottom">
          <div className="loader-pct" ref={pctRef}>
            00%
          </div>
          <div className={`loader-hint ${phase === "ready" ? "is-ready" : ""}`}>
            {phase === "loading" ? "LOADING" : "TAP THE ROLL-ON TO ENTER"}
          </div>
        </div>
      </div>
      <button
        className="loader-skip"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          skip();
        }}
      >
        Skip
      </button>

      {(phase === "panel" || phase === "closing") && (
        <div className={`intro-panel ${open ? "open" : ""}`} aria-hidden="true">
          <div className="ip-links ip-left">
            <span>Fragrances</span>
            <span>The Range</span>
          </div>
          <div className="ip-links ip-right">
            <span>The Idea</span>
            <span>Where to Buy</span>
          </div>
          <div className="ip-logo">TAG</div>
        </div>
      )}
    </div>
  );
}
