"use client";

import { useEffect, useState } from "react";
import { driver } from "@/lib/lenisDriver";
import { EVT } from "@/lib/events";

/** A very simple flat loading screen: the TAG mark and a thin line. It leaves by itself as soon as the page is ready. */
export default function Loader() {
  const [closing, setClosing] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const start = performance.now();
    let finished = false;
    const timers: number[] = [];

    const finish = () => {
      if (finished) return;
      finished = true;
      document.documentElement.classList.remove("is-loading");
      driver.lenis?.start();
      window.dispatchEvent(new Event(EVT.entered));
      setClosing(true);
      timers.push(window.setTimeout(() => setGone(true), 600));
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      finish();
      return;
    }

    let tries = 0;
    const holdScroll = () => {
      if (finished) return;
      if (driver.lenis) driver.lenis.stop();
      else if (tries++ < 60) requestAnimationFrame(holdScroll);
    };
    holdScroll();

    const ready = () => timers.push(window.setTimeout(finish, Math.max(0, 800 - (performance.now() - start))));
    if (window.__tagSceneReady) ready();
    else window.addEventListener(EVT.sceneReady, ready, { once: true });
    timers.push(window.setTimeout(finish, 4000)); // never keep anyone waiting

    return () => {
      window.removeEventListener(EVT.sceneReady, ready);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`loader ${closing ? "is-closing" : ""}`} aria-hidden="true">
      <div className="loader-mark">TAG</div>
      <div className="loader-bar">
        <span />
      </div>
    </div>
  );
}
