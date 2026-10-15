/** A pen-sketch of the TAG roll-on (double outline, hatching for volume) that draws itself in. */
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

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = [number, number];

/** Catmull-Rom smoothing of a list of points into many small steps. */
function smooth(points: P[], per = 8): P[] {
  const out: P[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const toPath = (pts: P[]) => "M" + pts.map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join(" L");
const wobble = (pts: P[], amp: number, seed: number): P[] => {
  const r = rng(seed);
  return pts.map(([x, y]) => [x + (r() - 0.5) * amp, y + (r() - 0.5) * amp]);
};

export default function SketchRollOn() {
  const right = PROFILE;
  const left = [...PROFILE].reverse().map(([r, y]) => [-r, y] as P);
  const outline = smooth([...right, ...left.slice(1)], 7);

  const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 48): P[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P;
    });

  const paths: { d: string; w?: number }[] = [];
  paths.push({ d: toPath(wobble(outline, 0.014, 1)), w: 1.2 });
  paths.push({ d: toPath(wobble(outline, 0.02, 2)), w: 0.8 });
  paths.push({ d: toPath(wobble(ellipse(0, -0.5, 0.6, 0.6), 0.016, 3)), w: 1 });
  paths.push({ d: toPath(wobble(ellipse(0, -0.5, 0.6, 0.6), 0.02, 4)), w: 0.7 });
  // label
  const label: P[] = [
    [-0.42, 1.18],
    [0.42, 1.18],
    [0.42, 0.28],
    [-0.42, 0.28],
    [-0.42, 1.18],
  ];
  paths.push({ d: toPath(wobble(smooth(label, 6), 0.012, 5)), w: 1 });
  paths.push({ d: toPath(wobble([[-0.42, 0.95], [0.42, 0.95]] as P[], 0.01, 6)), w: 0.8 });
  // collar
  paths.push({ d: toPath(wobble([[-0.52, 0.04], [-0.2, 0.0], [0.2, 0.0], [0.52, 0.04]] as P[], 0.01, 7)), w: 0.8 });

  // hatching on the shadow side for volume
  const r = rng(9);
  const hatch: string[] = [];
  for (let y = -1.3; y < 1.5; y += 0.085) {
    const x1 = 0.08 + r() * 0.08;
    const x2 = 0.72;
    hatch.push(
      toPath([
        [x1, y],
        [x2, y + 0.24 + r() * 0.05],
      ] as P[])
    );
  }
  // cross-hatch the base and the ball's underside
  for (let y = -1.35; y < -0.2; y += 0.1) {
    hatch.push(
      toPath([
        [-0.7, y + 0.2],
        [0.0, y - 0.05 + r() * 0.04],
      ] as P[])
    );
  }

  return (
    <div className="sketch" aria-hidden="true">
      <svg viewBox="-0.95 -1.8 1.9 3.4" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="sketch-clip">
            <path d={toPath(outline)} />
          </clipPath>
        </defs>
        <g clipPath="url(#sketch-clip)">
          {hatch.map((d, i) => (
            <path key={`h${i}`} d={d} pathLength={1} className="hatch" style={{ transitionDelay: `${1.2 + i * 0.03}s` }} />
          ))}
        </g>
        {paths.map((p, i) => (
          <path key={i} d={p.d} pathLength={1} style={{ transitionDelay: `${i * 0.18}s`, strokeWidth: 0.012 * (p.w ?? 1) }} />
        ))}
        <text x="0" y="-0.78" textAnchor="middle" className="sketch-text">
          TAG
        </text>
      </svg>
    </div>
  );
}
