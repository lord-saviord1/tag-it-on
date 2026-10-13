import * as THREE from "three";

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws a shield-style product label (TAG banner, ULTRA DRY band, variant name, 48H)
 *  to a canvas texture. This is a stand-in drawn in code; swap it for a real label
 *  image with THREE.TextureLoader once official artwork is available. */
export function makeLabelTexture(name: string, accent: string): THREE.CanvasTexture {
  const W = 560;
  const H = 470;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  // white shield body
  roundRectPath(ctx, 30, 20, W - 60, H - 40, 40);
  ctx.fillStyle = "#fdfdfb";
  ctx.fill();

  // dark TAG banner (clipped to the shield)
  ctx.save();
  roundRectPath(ctx, 30, 20, W - 60, H - 40, 40);
  ctx.clip();
  ctx.fillStyle = "#12141a";
  ctx.fillRect(30, 20, W - 60, 130);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 92px Arial";
  ctx.fillText("TAG", W / 2, 117);

  // accent band
  ctx.fillStyle = accent;
  ctx.fillRect(30, 150, W - 60, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 36px Arial";
  ctx.fillText("ULTRA DRY", W / 2, 191);
  ctx.restore();

  // variant name (one or two lines)
  const words = name.toUpperCase().split(" ");
  const lines = words.length > 1 ? [words[0], words.slice(1).join(" ")] : [words[0]];
  ctx.fillStyle = "#12141a";
  ctx.font = lines.length > 1 ? "700 62px Arial" : "700 78px Arial";
  const lineH = 70;
  const startY = lines.length > 1 ? 288 : 318;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH));

  // footer line + 48H badge
  ctx.fillStyle = "#6b6f78";
  ctx.font = "700 20px Arial";
  ctx.fillText("ANTI-ODOR  ·  ANTI-PERSPIRANT", W / 2 - 40, 415);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  roundRectPath(ctx, W - 160, 388, 90, 40, 8);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = "700 26px Arial";
  ctx.fillText("48H", W - 115, 418);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
