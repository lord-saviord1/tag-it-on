import type { CSSProperties } from "react";
import BottleSlot from "./BottleSlot";
import { mixHex, type Scent } from "@/lib/scents";

export default function ScentSection({ scent }: { scent: Scent }) {
  // a flat, dark background with a hint of this fragrance's colour
  const bg = mixHex("#0b0727", scent.glow, 0.2);
  const vars = { "--bg-s": bg } as CSSProperties;
  return (
    <section
      className={`scent ${scent.flip ? "flip" : ""}`}
      id={`scent-${scent.slug}`}
      style={vars}
      data-world={bg}
      data-haze="1"
      data-space="0.6"
    >
      <div className="wrap">
        <div className="scent-copy">
          <div className="scent-tag reveal">FRAGRANCE {scent.index} / 08</div>
          <h3 className="reveal">{scent.name}</h3>
          <p className="reveal">{scent.description}</p>
          <a href="#range" className="scent-link reveal">
            See the full range →
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
        <div className="scent-art">
          <BottleSlot colors={scent} label={scent.name} />
        </div>
      </div>
    </section>
  );
}
