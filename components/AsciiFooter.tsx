"use client";

import { useEffect, useRef } from "react";

const CELL = 8;
const GAP = 3;
const STEP = CELL + GAP;
const CHARS = "TAGITON48ULTRADRY0123456789";
const HOVER_RADIUS = 10;
const HOVER_PUSH = 7;
const SCATTER_RANGE = 20;
const GRAVITY = 0.05;
const BOUNCE = 0.25;
const STAGGER = 18;

type Phase = "logo" | "scattered" | "fallen" | "returning";
type Cell = {
  col: number;
  row: number;
  ch: string;
  color: string;
  ox: number;
  oy: number;
  fall: number;
  wait: number;
  sx: number;
  sy: number;
};

/** The TAG wordmark made of letters and numbers. Hover pushes them away; click to scatter,
 *  click again to drop them, and once more to bring them home. Desktop only (phones show plain text). */
export default function AsciiFooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let cells: Cell[] = [];
    let rows = 0;
    let W = 0;
    let H = 0;
    let phase: Phase = "logo";
    const cursor = { col: -999, row: -999 };
    let raf = 0;
    let visible = false;

    const build = () => {
      if (window.innerWidth < 1000) {
        cells = [];
        return;
      }
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      if (W < 10 || H < 10) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.floor(W / STEP);
      rows = Math.floor(H / STEP);

      const sampler = document.createElement("canvas");
      sampler.width = cols;
      sampler.height = rows;
      const s = sampler.getContext("2d")!;
      s.fillStyle = "#fff";
      s.textAlign = "center";
      s.textBaseline = "middle";
      let fs = rows * 1.05;
      s.font = `900 ${fs}px Anton, Impact, "Arial Black", sans-serif`;
      const w = s.measureText("TAG").width;
      if (w > cols * 0.9) {
        fs *= (cols * 0.9) / w;
        s.font = `900 ${fs}px Anton, Impact, "Arial Black", sans-serif`;
      }
      s.fillText("TAG", cols / 2, rows / 2 + fs * 0.04);
      const data = s.getImageData(0, 0, cols, rows).data;

      const lit = new Set<string>();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (data[(r * cols + c) * 4 + 3] > 128) {
            lit.add(`${c},${r}`);
            lit.add(`${c + 1},${r}`);
          }
        }
      }
      cells = [];
      lit.forEach((key) => {
        const [col, row] = key.split(",").map(Number);
        const t = rows > 1 ? row / (rows - 1) : 0;
        const rr = Math.round(207 + (59 - 207) * t);
        const gg = Math.round(230 + (130 - 230) * t);
        cells.push({
          col,
          row,
          ch: CHARS[Math.floor(Math.random() * CHARS.length)],
          color: `rgb(${rr},${gg},255)`,
          ox: 0,
          oy: 0,
          fall: 0,
          wait: 0,
          sx: (Math.random() - 0.5) * SCATTER_RANGE,
          sy: (Math.random() - 0.5) * SCATTER_RANGE,
        });
      });
    };

    const ease = (c: Cell, tx: number, ty: number, e: number) => {
      c.ox += (tx - c.ox) * e;
      c.oy += (ty - c.oy) * e;
    };
    const stagger = () => cells.forEach((c) => (c.wait = Math.floor(Math.random() * STAGGER)));

    const update = () => {
      let home = phase === "returning";
      for (const c of cells) {
        if (c.wait > 0) {
          c.wait--;
          home = false;
          continue;
        }
        if (phase === "scattered") {
          ease(c, c.sx, c.sy, 0.075);
        } else if (phase === "fallen") {
          const floor = rows - 1 - c.row;
          c.fall += GRAVITY;
          c.oy += c.fall;
          if (c.oy > floor) {
            c.oy = floor;
            c.fall *= -BOUNCE;
          }
        } else if (phase === "returning") {
          ease(c, 0, 0, 0.05);
          if (Math.abs(c.ox) > 0.05 || Math.abs(c.oy) > 0.05) home = false;
        } else {
          let tx = 0;
          let ty = 0;
          const dx = c.col - cursor.col;
          const dy = c.row - cursor.row;
          const d = Math.hypot(dx, dy);
          if (d < HOVER_RADIUS && d > 0) {
            const push = (1 - d / HOVER_RADIUS) * HOVER_PUSH;
            tx = (dx / d) * push;
            ty = (dy / d) * push;
          }
          ease(c, tx, ty, 0.1);
        }
      }
      if (home) phase = "logo";
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${CELL + 2}px monospace`;
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      for (const c of cells) {
        ctx.fillStyle = c.color;
        ctx.fillText(c.ch, (c.col + c.ox) * STEP + CELL / 2, (c.row + c.oy) * STEP);
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible || cells.length === 0) return;
      update();
      draw();
    };

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      cursor.col = (e.clientX - r.left) / STEP;
      cursor.row = (e.clientY - r.top) / STEP;
    };
    const onLeave = () => {
      cursor.col = -999;
      cursor.row = -999;
    };
    const onClick = () => {
      if (cells.length === 0) return;
      if (phase === "logo") {
        phase = "scattered";
        stagger();
      } else if (phase === "scattered") {
        phase = "fallen";
        cells.forEach((c) => (c.fall = 0));
      } else if (phase === "fallen") {
        phase = "returning";
        stagger();
      }
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting), { threshold: 0.05 });
    io.observe(canvas);
    const ro = new ResizeObserver(() => build());
    ro.observe(canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
    else build();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div className="ascii-footer" data-no-bottle="">
      <canvas ref={canvasRef} />
      <div className="ascii-fallback" aria-hidden="true">
        TAG
      </div>
      <p className="ascii-hint">Hover to push the letters. Click to scatter, drop and reset.</p>
    </div>
  );
}
