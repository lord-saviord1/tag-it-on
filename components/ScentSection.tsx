import type { CSSProperties } from "react";
import BottleSlot from "./BottleSlot";
import { mixHex, type Scent } from "@/lib/scents";

export default function ScentSection({ scent }: { scent: Scent }) {
  const vars = { "--c1": scent.accent, "--c2": scent.accentDeep, "--g": scent.glow } as CSSProperties;
  return (
    <section
      className={`scent ${scent.flip ? "flip" : ""}`}
      id={`scent-${scent.slug}`}
      style={vars}
      data-world={mixHex(scent.accent, scent.accentDeep)}
      data-haze="1"
      data-space="0.6"
    >
      <div className="bg-word" aria-hidden="true">
        {scent.name}
      </div>
      <div className="wrap">
        <div className="scent-copy">
          <div className="scent-tag reveal">FRAGRANCE {scent.index} / 07</div>
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
