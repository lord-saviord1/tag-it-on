"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/**
 * Mounts once in the root layout. Drives the whole page's inertial smooth scroll —
 * this is the "premium/cinematic" scroll feel from Bullet's site.
 *
 * To add a literal infinite/looping scroll later: Lenis exposes `scroll` and `limit`
 * on every `scroll` event — wrap content in a duplicated track and use those values to
 * jump the scroll position back by one track-height when you cross a boundary, the same
 * way the header marquee loops today via CSS. Keeping Lenis as the single scroll driver
 * now means that loop logic only has to live in one place later.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const id = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
    };
  }, []);

  return null;
}
