# TAG — Next.js + React Three Fiber

Port of the Bullet-inspired TAG landing page prototype into a proper Next.js app,
with real 3D bottle models (React Three Fiber) and Lenis-driven smooth scroll.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Structure

- `app/` — Next.js App Router: `layout.tsx` (fonts + global Lenis mount), `page.tsx` (assembles the page), `globals.css` (all design tokens/styles, ported from the prototype).
- `components/Bottle.tsx` — the actual 3D bottle: R3F `<Canvas>`, physical materials, a canvas-generated label texture, a floating badge, drag-to-orbit with idle auto-rotate. Pauses its render loop when scrolled out of view.
- `components/ScentSection.tsx` + `lib/scents.ts` — each fragrance section is generated from one data object. **Add a new scent by adding one entry to `lib/scents.ts`** — no JSX changes needed. This is the "scale it up" seam.
- `components/SmoothScroll.tsx` — mounts Lenis once in the root layout for the cinematic scroll feel.
- `components/Header.tsx` — nav with a working mobile menu (the prototype's mobile bug is fixed here).

## Open items (from our chat)

1. **Real product photography.** The bottle label is currently a generated canvas texture (color gradient + fragrance name), not a real TAG label. If you can share real product photos you have rights to use, swap them in via `THREE.TextureLoader` in `lib/bottleLabel.ts` in place of `makeLabelTexture`, and/or drop them into `public/` for use in lifestyle sections.
2. **Reference links.** Send the list of TAG-related sites whenever you're ready — I'll fold in layout/motion/structure ideas from them (not their actual assets or copy).
3. **Infinite loop scroll.** You asked for smooth scroll now, loop later. Lenis is already the single driver of page scroll, so the loop can be added by wrapping the page content in a duplicated track and using Lenis's `scroll`/`limit` values to jump back by one track-height when you cross a boundary — same trick the header marquee already uses in CSS. Flagging this as the next real feature to build, not yet implemented.

## Notes

- Versions pinned in `package.json` are current stable releases as of this build; bump as needed.
- No Tailwind — styling is plain CSS in `globals.css` to stay a direct port of the prototype. Happy to convert to Tailwind if you'd rather work that way as the project grows.
