export type Scent = {
  slug: string;
  fx: string; // the shape that drifts through this fragrance's world
  index: string;
  name: string;
  tagline: string;
  description: string;
  // bottle colors (matched to the real TAG Ultra Dry range)
  body: string; // main shell
  ball: string; // roll-on ball
  base: string; // base bowl under the ball
  trim: string; // collar ring
  // section background gradient
  accent: string;
  accentDeep: string;
  glow: string; // bright colour that glows in the corner of the section
  facts: { num: string; label: string }[];
  flip?: boolean;
};

const facts = [
  { num: "UP TO 48H", label: "PROTECTION" },
  { num: "ULTRA DRY", label: "QUICK-DRY FORMULA" },
  { num: "ROLL-ON", label: "FORMAT" },
];

export const scents: Scent[] = [
  {
    slug: "cool-breeze",
    fx: "drop",
    index: "01",
    name: "Cool Breeze",
    tagline: "Aquatic, light, all-day",
    description:
      "Aquatic and light, made for humid afternoons when the AC is off and the day isn't. Cool Breeze keeps you dry without going quiet.",
    body: "#1f78d1",
    ball: "#2b86e6",
    base: "#f4f6f8",
    trim: "#bcd7f5",
    accent: "#2a8be8",
    accentDeep: "#0d4fa8",
    glow: "#5fd0ff",
    facts,
  },
  {
    slug: "turbo",
    fx: "bolt",
    index: "02",
    name: "Turbo",
    tagline: "Bold, dark, built for speed",
    description:
      "Dark, sharp and built for speed. Made for game days, generator hum and the walk from the last bus stop. Turbo doesn't fade when your day speeds up.",
    body: "#2b2d31",
    ball: "#4a4c52",
    base: "#c9ccd1",
    trim: "#d0262d",
    accent: "#262932",
    accentDeep: "#07080b",
    glow: "#ff3b30",
    facts,
    flip: true,
  },
  {
    slug: "whitening",
    fx: "sparkle",
    index: "03",
    name: "Whitening",
    tagline: "Clean, fresh, whitening care",
    description:
      "For people who want their underarm care to do a little more than keep them fresh. Clean, light and made to be worn every day.",
    body: "#f5f5f6",
    ball: "#f7f7f8",
    base: "#c8143f",
    trim: "#f2a5bd",
    accent: "#d81b57",
    accentDeep: "#7d0a2c",
    glow: "#ff9ab8",
    facts,
  },
  {
    slug: "powerful-defense",
    fx: "shield",
    index: "04",
    name: "Powerful Defense",
    tagline: "Strong protection, warm energy",
    description:
      "Warm, confident and built for the hardest days. Powerful Defense is for the long commute, the full timetable and everything after.",
    body: "#f08a1c",
    ball: "#f6a21f",
    base: "#e5531b",
    trim: "#ffd27a",
    accent: "#ff9a2e",
    accentDeep: "#d4540f",
    glow: "#ffd24d",
    facts,
    flip: true,
  },
  {
    slug: "fresh-mint",
    fx: "leaf",
    index: "05",
    name: "Fresh Mint",
    tagline: "Cold mint, sharp finish",
    description:
      "A cold-water burst that cuts through Monday traffic and Friday deadlines alike. Our sharpest, cleanest scent, built for mornings you need to move fast.",
    body: "#17996a",
    ball: "#1fa874",
    base: "#f3f7f5",
    trim: "#8fd6b8",
    accent: "#1fb583",
    accentDeep: "#0a6a49",
    glow: "#7dffd0",
    facts,
  },
  {
    slug: "sensitive-skin",
    fx: "bubble",
    index: "06",
    name: "Sensitive Skin",
    tagline: "Gentle on skin, calm scent",
    description:
      "A calmer, softer take for skin that doesn't like fuss. All the Ultra Dry protection, with a gentler scent you can wear all day.",
    body: "#b4b7c0",
    ball: "#bfc2ca",
    base: "#6a2a8c",
    trim: "#e6e7ec",
    accent: "#8f4fb5",
    accentDeep: "#4a1a66",
    glow: "#d9a6ff",
    facts,
    flip: true,
  },
  {
    slug: "romantic-charm",
    fx: "petal",
    index: "07",
    name: "Romantic Charm",
    tagline: "Floral musk, evening wear",
    description:
      "Soft florals over warm musk. Layer it under your favourite perfume or wear it alone. Romantic Charm is built for the nights that matter.",
    body: "#d4587f",
    ball: "#dc6a8f",
    base: "#f0705a",
    trim: "#f4b6c8",
    accent: "#ff7aa6",
    accentDeep: "#b02a5b",
    glow: "#ffc2d9",
    facts,
  },
];

/** Blend two #rrggbb colours. Used to tell the 3D scene what colour each section's background is. */
export function mixHex(a: string, b: string, t = 0.5) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
}
