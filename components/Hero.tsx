import BottleSlot from "./BottleSlot";
import { scents, mixHex } from "@/lib/scents";

const stats = [
  { num: "48HRS", lbl: "of protection, up to, in every fragrance" },
  { num: "7", lbl: "fragrances for different moods" },
  { num: "ULTRA DRY", lbl: "quick-dry formula" },
  { num: "#TAGItOn", lbl: "Don't Troll, Just TAG It On" },
];

export default function Hero() {
  const base = scents.find((x) => x.slug === "whitening") ?? scents[0];
  const colors = { ...base, accent: "#2a4bff", accentDeep: "#0f1f8f" };
  return (
    <section className="hero" data-world={mixHex("#2a4bff", "#0f1f8f")} data-haze="0.9">
      <div className="wrap hero-top">
        <div>
          <div className="hero-eyebrow reveal">ULTRA DRY ROLL-ON · BY IMPERIO INTERNATIONAL</div>
          <h1 className="reveal">
            DON&apos;T
            <br />
            TROLL,
            <br />
            <span className="outline">JUST TAG</span>
            <br />
            IT ON
          </h1>
        </div>
        <div className="hero-bottle-wrap">
          <BottleSlot colors={colors} label="TAG" />
        </div>
      </div>
      <div className="wrap reveal">
        <p className="hero-lead">
          Seven fragrances for seven moods. Every TAG roll-on has an ultra-dry, quick-dry formula and up
          to 48 hours of protection, at a price that doesn&apos;t break the bank.
        </p>
      </div>
      <div className="wrap hero-actions reveal">
        <a href="#range" className="btn-primary">
          Shop the range
        </a>
        <button className="btn-ghost" data-open-quiz="">
          Find your scent
        </button>
      </div>
      <div className="wrap hero-stats reveal">
        {stats.map((s) => (
          <div key={s.lbl}>
            <div className="num">{s.num}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
