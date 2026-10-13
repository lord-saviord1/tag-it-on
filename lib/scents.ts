export type Scent = {
  slug: string;
  index: string;
  name: string;
  description: string;
  topColor: string;
  bottomColor: string;
  badge: string;
  facts: { num: string; label: string }[];
  className: string; // matches a .scent.<className> gradient in globals.css
  flip?: boolean;
};

export const scents: Scent[] = [
  {
    slug: "fresh-mint",
    index: "01",
    name: "Fresh Mint",
    description:
      "A cold-water burst that cuts through Monday traffic and Friday deadlines alike. Our sharpest, cleanest scent — built for mornings you need to move fast.",
    topColor: "#ffffff",
    bottomColor: "#1c3fff",
    badge: "48H FRESH",
    facts: [
      { num: "48H", label: "ANTI-ODOR" },
      { num: "0.4s", label: "QUICK DRY" },
      { num: "50ML", label: "ROLL-ON" },
    ],
    className: "mint",
  },
  {
    slug: "turbo",
    index: "02",
    name: "Turbo",
    description:
      "Citrus and spice, tuned for game days, generator hum and the walk from the last bus stop. Turbo doesn't fade when your day speeds up.",
    topColor: "#ffffff",
    bottomColor: "#ff5b3c",
    badge: "HIGH ENERGY",
    facts: [
      { num: "48H", label: "ANTI-ODOR" },
      { num: "HIGH", label: "INTENSITY" },
      { num: "50ML", label: "ROLL-ON" },
    ],
    className: "turbo",
    flip: true,
  },
  {
    slug: "cool-breeze",
    index: "03",
    name: "Cool Breeze",
    description:
      "Aquatic and light, made for humid afternoons when the AC is off and the day isn't. Cool Breeze keeps you dry without going quiet.",
    topColor: "#ffffff",
    bottomColor: "#12c7b4",
    badge: "AQUA NOTES",
    facts: [
      { num: "48H", label: "ANTI-ODOR" },
      { num: "AQUA", label: "NOTES" },
      { num: "50ML", label: "ROLL-ON" },
    ],
    className: "breeze",
  },
  {
    slug: "romantic-charm",
    index: "04",
    name: "Romantic Charm",
    description:
      "Soft florals over warm musk. Layer it under your favourite perfume or wear it alone — Romantic Charm is built for the nights that matter.",
    topColor: "#ffffff",
    bottomColor: "#ff4f9a",
    badge: "EVENING WEAR",
    facts: [
      { num: "48H", label: "ANTI-ODOR" },
      { num: "FLORAL", label: "MUSK" },
      { num: "50ML", label: "ROLL-ON" },
    ],
    className: "charm",
    flip: true,
  },
];

export const fullRange = [
  { name: "Fresh Mint", desc: "Cold mint, sharp finish", color: "#1c3fff" },
  { name: "Turbo", desc: "Citrus, spice, high-energy", color: "#ff5b3c" },
  { name: "Cool Breeze", desc: "Aquatic, light, all-day", color: "#12c7b4" },
  { name: "Romantic Charm", desc: "Floral musk, evening wear", color: "#ff4f9a" },
  { name: "Sport Power", desc: "Woody, built for training", color: "#ffb84d" },
  { name: "Midnight", desc: "Deep amber, after-hours", color: "#8a5bff" },
  { name: "Lucky Day", desc: "Green tea, everyday fresh", color: "#3ddc84" },
  { name: "Ultra Dry", desc: "Unscented, maximum dry", color: "#ffffff" },
];
