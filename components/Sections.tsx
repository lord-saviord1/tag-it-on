import { scents } from "@/lib/scents";
import { links, socialLabels } from "@/lib/links";

export function Story() {
  return (
    <section className="intro" id="story">
      <div className="wrap">
        <div className="kicker reveal">THE IDEA</div>
        <h2 className="reveal">TAG is the friend who plugs you.</h2>
        <p className="reveal">
          TAG is a roll-on deodorant from Imperio International, made for young Nigerians who want to
          look good, feel good and step out with confidence. It&apos;s premium, it&apos;s affordable,
          and it comes in seven fragrances so you can pick the one that fits your mood. So instead of
          trolling someone, just TAG it on.
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
        <div className="range-photo reveal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tag-range.jpeg"
            alt="The TAG Ultra Dry roll-on range: Cool Breeze, Turbo, Whitening, Powerful Defense, Fresh Mint, Sensitive Skin and Romantic Charm"
          />
          <p>Product photography belongs to TAG / Imperio International. Shown here for showcase purposes only.</p>
        </div>
      </div>
      <div className="range-grid">
        {scents.map((r) => (
          <a href={`#scent-${r.slug}`} className="range-card reveal" key={r.slug}>
            <div>
              <div className="swatch" style={{ background: r.accent }} />
              <div className="name">{r.name}</div>
            </div>
            <div className="desc">{r.tagline}</div>
          </a>
        ))}
        <a href={links.jumia} target="_blank" rel="noopener noreferrer" className="range-card reveal">
          <div className="name">Buy on Jumia</div>
          <div className="desc">Shop TAG online →</div>
        </a>
      </div>
    </section>
  );
}

export function Proof() {
  const cards = [
    {
      big: "#TAGItOn",
      cap: "The Don't Troll, Just TAG It On rally took over Falomo, Surulere, Tejuosho, Maryland and Ikeja Underbridge with a message of kindness over trolling.",
    },
    {
      big: "Campus-first",
      cap: "TAG takes the brand to students, like the Yaba College of Technology activation with dance, skipping and snooker competitions.",
    },
    {
      big: "Affordable luxury",
      cap: "Premium quality at a pocket-friendly price. You don't have to break the bank to own one, or to gift one.",
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
          Shop TAG roll-ons on Jumia Nigeria, or take the quiz to find your fragrance first.
        </p>
        <div className="hero-actions reveal" style={{ justifyContent: "center" }}>
          <a href={links.jumia} target="_blank" rel="noopener noreferrer" className="btn-primary">
            Buy on Jumia
          </a>
          <button className="btn-ghost" data-open-quiz="">
            Find your scent
          </button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const socials = Object.entries(links.social).filter(([, url]) => url);
  return (
    <footer>
      <div className="wrap">
        <div className="foot-top">
          <div>
            <div className="foot-logo">TAG</div>
            <p style={{ maxWidth: 240, opacity: 0.6 }}>
              Ultra Dry roll-on deodorant, by Imperio International Limited.
            </p>
          </div>
          <div className="foot-cols">
            <div className="foot-col">
              <h4>Explore</h4>
              <a href="#fragrances">Fragrances</a>
              <a href="#range">The Range</a>
              <a href="#story">The Idea</a>
              <a href="#find">Where to Buy</a>
            </div>
            <div className="foot-col">
              <h4>Shop</h4>
              <a href={links.jumia} target="_blank" rel="noopener noreferrer">
                TAG on Jumia
              </a>
            </div>
            {socials.length > 0 && (
              <div className="foot-col">
                <h4>Follow</h4>
                {socials.map(([key, url]) => (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer">
                    {socialLabels[key] ?? key}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="showcase-note">
          Independent showcase site prepared as a design proposal for Imperio International Ltd / TAG.
          This is not an official TAG website and is not made for commercial activity.
        </p>
        <div className="foot-bottom">
          <span>
            Showcase design by <a href="https://cipherpr.tech" target="_blank" rel="noopener noreferrer">Cipher PR</a>
          </span>
          <span>Don&apos;t Troll, Just TAG It On.</span>
        </div>
      </div>
    </footer>
  );
}
