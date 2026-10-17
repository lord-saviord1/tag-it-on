const ROWS = [
  { cls: "far", dir: "left", text: "DON'T TROLL · JUST TAG IT ON · " },
  {
    cls: "mid",
    dir: "right",
    text: "COOL BREEZE · TURBO · WHITENING · POWERFUL DEFENSE · FRESH MINT · SENSITIVE SKIN · ROMANTIC CHARM · ",
  },
  { cls: "near", dir: "left", text: "UP TO 48H · ULTRA DRY · ROLL-ON · #TAGITON · " },
];

/** A marquee with depth: three rows of type at different distances. The far row is big,
 *  faint and blurred; the near row is crisp and fast; blue haze sits between them. */
export default function DepthMarquee() {
  return (
    <section className="depth-marquee" aria-label="TAG ticker" data-world="#1a0f4d" data-haze="0.5" data-space="1">
      <div className="dm-stage">
        {ROWS.map((r) => (
          <div key={r.cls} className={`dm-row ${r.cls} ${r.dir}`} aria-hidden="true">
            <div className="dm-track">
              <span>{r.text.repeat(4)}</span>
              <span>{r.text.repeat(4)}</span>
            </div>
          </div>
        ))}
        <div className="dm-haze" aria-hidden="true" />
      </div>
    </section>
  );
}
