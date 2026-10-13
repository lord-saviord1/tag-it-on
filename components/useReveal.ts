"use client";

import { useEffect } from "react";

/** Call once per page. Observes every .reveal element currently in the DOM and
 *  adds .in the first time each one crosses into view — mirrors the prototype's
 *  scroll-reveal behaviour. Re-runs on route change if you add more pages later. */
export function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 6) * 0.05}s`;
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
}
