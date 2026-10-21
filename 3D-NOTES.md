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

## The real roll-on model (already in)
The site now uses the real bottle shape and the real label art:

- `public/models/roll-on-hi.glb` (about 27,000 triangles) is the main roll-on, `roll-on-lo.glb` (about 4,500) is used for the small background roll-ons.
- `public/textures/<fragrance>.webp` are the front of each official product render, wrapped onto the model (the back of the bottle gets the plain shell colour).
- If the model or textures fail to load, the site falls back to the bottle built in code.

How they were made: your `base.fbx` was rebuilt as a clean, light mesh (the original is over 130,000 vertices, far too heavy for a web page), keeping its outline,
and the shape was scaled to match the real renders (its outline sits within about 2% of them). To redo it with a new sculpt or new renders:

    pip install numpy scipy opencv-python pillow
    python3 tools/build_roll_on.py <folder containing base.fbx and the TAG*.png renders>

`3x-whitening.webp` is built too but not used yet (the site shows seven fragrances).

## Left out on purpose
- **Post-processing (bloom, vignette, depth of field).** Each effect adds a full-screen pass. On an integrated laptop GPU
  that is exactly the kind of cost that made scrolling stutter. If `?perf` shows a steady 55+ fps, a light bloom on
  the main roll-on is worth trying.
- **Skeletal / clip animation.** The bottle moves procedurally, so there is nothing to play back until a real model exists.
