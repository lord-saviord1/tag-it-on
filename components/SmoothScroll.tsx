"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { driver } from "@/lib/lenisDriver";

/**
 * Mounts once in the root layout. Drives the page's inertial smooth scroll.
 * Normally the 3D scene calls lenis.raf() (see SceneCanvas) so scroll and bottles
 * stay frame-perfect; this loop only steps in if the scene is not running.
 * Also makes every #anchor link glide to its section.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
    driver.lenis = lenis;

    let id = 0;
    const loop = (time: number) => {
      if (performance.now() - driver.lastExternal > 120) {
        lenis.raf(time);
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a[href^='#']") as HTMLAnchorElement | null;
      if (!a) return;
      const hash = a.getAttribute("href");
      if (!hash || hash === "#") {
        e.preventDefault();
        return;
      }
      const el = document.querySelector(hash) as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -64 });
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(id);
      driver.lenis = null;
      lenis.destroy();
    };
  }, []);

  return null;
}
