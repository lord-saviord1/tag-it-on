import BottleSlot from "./BottleSlot";
import { scents } from "@/lib/scents";

/** Clean, flat hero: one headline, one sentence, two buttons, one roll-on. */
export default function Hero() {
  const base = scents.find((x) => x.slug === "whitening") ?? scents[0];
  const colors = { ...base, fx: "tag", accent: "#7a4dff", accentDeep: "#2a1a7a" };
  return (
    <section className="hero" data-world="#0b0727" data-haze="0.9" data-space="1">
      <div className="wrap hero-top">
        <div className="hero-copy">
          <div className="hero-eyebrow reveal">Ultra dry roll-on · by Imperio International</div>
          <h1 className="reveal">
            Don&apos;t troll,
            <br />
            <span className="outline">just TAG</span>
            <br />
            it on
          </h1>
          <p className="hero-lead reveal">
            Eight roll-on fragrances for different moods. Ultra-dry formula and 48 hours of non-stop efficacy, at a
            price that doesn&apos;t break the bank.
          </p>
          <div className="hero-actions reveal">
            <a href="#range" className="btn-primary">
              Shop the range
            </a>
            <button className="btn-ghost" data-open-quiz="">
              Find your scent
            </button>
          </div>
        </div>
        <div className="hero-bottle-wrap">
          <BottleSlot colors={colors} label="TAG" />
        </div>
      </div>
    </section>
  );
}
