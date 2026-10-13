import type Lenis from "lenis";

/** Shared between SmoothScroll (creates Lenis) and SceneCanvas (the WebGL scene).
 *  The scene advances Lenis itself, inside its own render frame, so the DOM scroll
 *  position and the 3D bottle are always updated in the same frame (no jitter).
 *  If the scene is not running, SmoothScroll falls back to advancing Lenis itself. */
export const driver: { lenis: Lenis | null; lastExternal: number } = {
  lenis: null,
  lastExternal: 0,
};
