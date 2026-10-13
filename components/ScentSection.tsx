import BottleStage from "./Bottle";
import type { Scent } from "@/lib/scents";

export default function ScentSection({ scent, id }: { scent: Scent; id?: string }) {
  return (
    <section className={`scent ${scent.className} ${scent.flip ? "flip" : ""}`} id={id}>
      <div className="wrap">
        <div className="scent-copy">
          <div className="scent-tag reveal">FRAGRANCE {scent.index}</div>
          <h3 className="reveal">{scent.name}</h3>
          <p className="reveal">{scent.description}</p>
          <a href="#" className="scent-link reveal">
            See the range →
          </a>
          <div className="scent-facts reveal">
            {scent.facts.map((f) => (
              <div key={f.label}>
                <div className="f-num">{f.num}</div>
                <div className="f-lbl">{f.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="scent-art reveal">
          <BottleStage
            topColor={scent.topColor}
            bottomColor={scent.bottomColor}
            label={scent.name}
            badge={scent.badge}
          />
        </div>
      </div>
    </section>
  );
}
