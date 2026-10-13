"use client";

import { useState } from "react";

export default function Header() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "#fragrances", label: "Fragrances" },
    { href: "#range", label: "The Range" },
    { href: "#story", label: "The Idea" },
    { href: "#find", label: "Where to Buy" },
  ];

  return (
    <header>
      <div className="nav">
        <a href="#top" className="logo">
          <span className="dot" />
          TAG
        </a>
        <nav className="nav-links">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <button className="nav-cta" data-open-quiz="">
          Find your scent
        </button>
        <button className="menu-btn" aria-label="Open menu" onClick={() => setOpen((o) => !o)}>
          <span />
          <span />
          <span />
        </button>
      </div>
      <div className={`mobile-menu ${open ? "open" : ""}`}>
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        <button
          className="nav-cta"
          data-open-quiz=""
          style={{ marginTop: 10, textAlign: "center" }}
          onClick={() => setOpen(false)}
        >
          Find your scent
        </button>
      </div>
    </header>
  );
}
