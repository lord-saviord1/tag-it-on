# 3D notes

## See real performance numbers
Add `?perf` to the end of the site address (for example `https://your-site/?perf`).
A small box appears in the top-left corner showing:

- fps and milliseconds per frame (aim for 55+ fps on a laptop, 60 is ideal)
- draw calls (keep under 100) and triangles
- geometries and textures held in memory
- quality: "reduced" means the site noticed your machine struggling and switched off the extras by itself

Send a screenshot of that box from your laptop and from your phone and I can tell exactly what to trim.

## Where the 3D only draws
Sections without a roll-on (the idea, the marquee, the range, the proof, the footer) have solid backgrounds
that sit over the 3D scene. The scene stops drawing entirely while you are inside them, and starts again just
before you reach the hero, a fragrance section or the final call to action.

## Using the real roll-on model later
The bottle is currently built in code. To use the real shape and details:

1. **Get a model.** Best: ask Imperio / TAG for the 3D file of the bottle. Otherwise generate one from the product
   photo with an image-to-3D tool (Meshy, Tripo or Rodin), or model it in Blender. Check the tool's licence for commercial use.
2. **Keep the original** somewhere safe (do not overwrite it).
3. **Name the parts** in the file: `body`, `ball`, `base`, `collar`, `label`. Then each fragrance can recolour its own parts.
4. **Shrink it** (keep it under about 2 MB and 30,000 triangles):
   `npx @gltf-transform/cli optimize roll-on.glb public/models/roll-on.glb --compress meshopt --texture-compress webp`
5. Put the result in `public/models/` and send it to me. I will load it with `useGLTF` (preloaded), recolour the named
   parts per fragrance, and keep the current procedural bottle as a fallback.

## Left out on purpose
- **Post-processing (bloom, vignette, depth of field).** Each effect adds a full-screen pass. On an integrated laptop GPU
  that is exactly the kind of cost that made scrolling stutter. If `?perf` shows a steady 55+ fps, a light bloom on
  the main roll-on is worth trying.
- **Skeletal / clip animation.** The bottle moves procedurally, so there is nothing to play back until a real model exists.
