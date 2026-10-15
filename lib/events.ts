/** Names of the browser events the loader and the 3D scene use to talk to each other. */
export const EVT = {
  sceneReady: "tag:scene-ready", // the 3D scene drew its first frame
  burst: "tag:burst", // warp the starfield (explosion, page-to-page moves)
  entered: "tag:entered", // the intro finished and the site is live
};

declare global {
  interface Window {
    __tagSceneReady?: boolean;
  }
}

export {};
