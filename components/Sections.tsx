import { fullRange } from "@/lib/scents";

export function Story() {
  return (
    <section className="intro" id="story">
      <div className="wrap">
        <div className="kicker reveal">OUR STORY</div>
        <h2 className="reveal">Kindness smells better than a comeback.</h2>
        <p className="reveal">
          TAG started as a fragrance built for people on the move — traders, students, dancers,
          anyone whose day doesn&apos;t stop at 9 to 5. Twenty years on, we&apos;re still making
          the same promise: real protection, real fragrance, priced for real life. No troll
          deserves your energy. Save it, and TAG it on instead.
        </p>
      </div>
    </section>
  );
}

export function RangeGrid() {
  return (
    <section className="range" id="range">
      <div className="wrap">
        <div className="kicker reveal">THE FULL RANGE</div>
        <h2 className="reveal">Seven scents. One protection promise.</h2>
      </div>
      <div className="range-grid">
        {fullRange.map((r) => (
          <div className="range-card reveal" key={r.name}>
            <div>
              <div className="swatch" style={{ background: r.color }} />
              <div className="name">{r.name}</div>
            </div>
            <div className="desc">{r.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Proof() {
  const cards = [
    {
      big: "#TAGItOn",
      cap: "Rallied across Falomo, Surulere, Yaba and Ikeja — a street campaign built on one idea: don't troll, TAG it on instead.",
    },
    {
      big: "Campus-first",
      cap: "From YabaTech to Ikeja City Mall, TAG shows up where young Nigerians actually are — not just on shelves.",
    },
    {
      big: "Pocket-friendly",
      cap: "Premium protection at street prices. You shouldn't have to choose between smelling good and getting through the month.",
    },
  ];
  return (
    <section className="proof">
      <div className="wrap">
        {cards.map((c) => (
          <div className="proof-card reveal" key={c.big}>
            <div className="big">{c.big}</div>
            <div className="cap">{c.cap}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Cta() {
  return (
    <section className="cta" id="find">
      <div className="wrap">
        <h2 className="reveal">
          TAG IT
          <br />
          ON
        </h2>
        <p className="reveal">
          Find your fragrance at any Jumia store, roadside vendor, or the nearest supermarket near
          you.
        </p>
        <div className="hero-actions reveal" style={{ justifyContent: "center" }}>
          <button className="btn-primary">Find a store</button>
          <button className="btn-ghost">Take the scent quiz</button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-top">
          <div>
            <div className="foot-logo">TAG</div>
            <p style={{ maxWidth: 220, opacity: 0.6 }}>
              Imperio International Ltd — Lagos, Nigeria. Est. 2005.
            </p>
          </div>
          <div className="foot-cols">
            <div className="foot-col">
              <h4>Explore</h4>
              <a href="#fragrances">Fragrances</a>
              <a href="#range">The Range</a>
              <a href="#story">Our Story</a>
              <a href="#find">Where to Buy</a>
            </div>
            <div className="foot-col">
              <h4>Contact</h4>
              <a href="mailto:hello@tagitonng.com">hello@tagitonng.com</a>
              <p>Lagos, Nigeria</p>
            </div>
            <div className="foot-col">
              <h4>Follow</h4>
              <a href="#">Instagram</a>
              <a href="#">TikTok</a>
              <a href="#">Twitter/X</a>
            </div>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 TAG. All rights reserved.</span>
          <span>Don&apos;t Troll, Just TAG It On.</span>
        </div>
      </div>
    </footer>
  );
}
