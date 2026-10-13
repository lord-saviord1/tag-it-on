import * as THREE from "three";

function shade(hex: string, percent: number) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + Math.round((255 * percent) / 100);
  let g = ((num >> 8) & 0x00ff) + Math.round((255 * percent) / 100);
  let b = (num & 0x0000ff) + Math.round((255 * percent) / 100);
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return "#" + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function wrapCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  lineHeight: number,
  maxWords: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    lines.push(words.slice(i, i + maxWords).join(" "));
  }
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
}

/** Builds a CanvasTexture for the lower (colored) half of a bottle: a scent-colored
 *  gradient with the fragrance name and a small TAG lockup. Swap this out for a real
 *  product-label photo/texture (THREE.TextureLoader) once real assets are available. */
export function makeLabelTexture(bottomColor: string, label: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, bottomColor);
  grad.addColorStop(1, shade(bottomColor, -18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 44px Arial";
  wrapCenteredText(ctx, label.toUpperCase(), 256, 250, 46, 3);

  ctx.font = "700 20px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("TAG · 50ML", 256, 400);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
