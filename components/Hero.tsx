import BottleStage from "./Bottle";

const stats = [
  { num: "48HRS", lbl: "protection, guaranteed" },
  { num: "7", lbl: "fragrances, one for every mood" },
  { num: "₦1,300", lbl: "starting price, no compromise" },
  { num: "20+", lbl: "years on Nigerian shelves" },
];

export default function Hero() {
  return (
    <section className="hero">
      <div className="wrap">
        <div>
          <div className="hero-eyebrow reveal">EST. 2005 — LAGOS, NIGERIA</div>
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
        <div className="hero-bottle-wrap reveal">
          <BottleStage topColor="#ffffff" bottomColor="#1c3fff" label="TAG" badge="EST. 2005" />
        </div>
      </div>
      <div className="wrap hero-copy reveal">
        Seven fragrances built for Lagos heat, campus deadlines and everything after. 48-hour
        protection, priced so you never have to choose between smelling good and getting by.
      </div>
      <div className="wrap hero-actions reveal">
        <button className="btn-primary">Shop the range</button>
        <button className="btn-ghost">Take the scent quiz</button>
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
