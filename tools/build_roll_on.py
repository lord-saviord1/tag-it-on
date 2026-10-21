#!/usr/bin/env python3
"""
Builds the web-ready TAG roll-on from the sculpt (base.fbx) and the official product renders.

  python3 tools/build_roll_on.py <folder with base.fbx and the TAG*.png renders>

Writes:
  public/models/roll-on-hi.glb   (about 27k triangles, used for the main roll-on)
  public/models/roll-on-lo.glb   (about 4k triangles, used for the far background roll-ons)
  public/textures/<fragrance>.webp  (the front of each real product render, wrapped onto the model)

Needs: numpy, scipy, opencv-python, pillow.
"""
import json, os, struct, sys, zlib
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS = os.path.join(ROOT, "public", "models")
TEXTURES = os.path.join(ROOT, "public", "textures")
os.makedirs(MODELS, exist_ok=True)
os.makedirs(TEXTURES, exist_ok=True)

RENDERS = {
    "cool-breeze": "TAGCOOLBREEZE-1.png",
    "turbo": "TAGTURBO-1.png",
    "whitening": "TAGWHITENINIG.png",
    "powerful-defense": "TAGPOWERFULDEFENCE-1.png",
    "fresh-mint": "TAGFRESHMINT-1.png",
    "sensitive-skin": "TAGSENSITIVESKIN-1.png",
    "romantic-charm": "TAGROMANTICHARM-1.png",
    "3x-whitening": "TAG3XWHITENINIG-2.png",  # a further product; not used on the site yet
}
TEX_W, IMG_H, STRIP_H = 640, 1280, 40
TEX_H = IMG_H + STRIP_H


# ---------------------------------------------------------------- reading the sculpt
def read_fbx_vertices(path):
    b = open(path, "rb").read()
    ver = struct.unpack("<I", b[23:27])[0]

    def prop(p):
        t = chr(b[p]); p += 1
        if t in "YFDIL":
            fmt = {"Y": "<h", "F": "<f", "D": "<d", "I": "<i", "L": "<q"}[t]
            return struct.unpack(fmt, b[p:p + struct.calcsize(fmt)])[0], p + struct.calcsize(fmt)
        if t == "C":
            return b[p], p + 1
        if t in "fdilb":
            n, enc, clen = struct.unpack("<III", b[p:p + 12]); p += 12
            data = b[p:p + clen]; p += clen
            if enc == 1:
                data = zlib.decompress(data)
            return np.frombuffer(data, dtype={"f": "<f4", "d": "<f8", "i": "<i4", "l": "<i8", "b": "u1"}[t], count=n), p
        if t in "SR":
            n = struct.unpack("<I", b[p:p + 4])[0]; p += 4
            return b[p:p + n], p + n
        raise ValueError(t)

    def node(p):
        if ver >= 7500:
            end, npr, plen, nlen = struct.unpack("<QQQB", b[p:p + 25]); p += 25
        else:
            end, npr, plen, nlen = struct.unpack("<IIIB", b[p:p + 13]); p += 13
        if end == 0:
            return None, p
        name = b[p:p + nlen].decode(errors="replace"); p += nlen
        props = []
        for _ in range(npr):
            v, p = prop(p); props.append(v)
        kids = []
        while p < end:
            c, p = node(p)
            if c is None:
                break
            kids.append(c)
        return (name, props, kids), end

    pos, top = 27, []
    while pos < len(b) - 200:
        n, pos = node(pos)
        if n is None:
            break
        top.append(n)
    objs = [n for n in top if n[0] == "Objects"][0]
    geo = [c for c in objs[2] if c[0] == "Geometry"][0]
    return [x for x in geo[2] if x[0] == "Vertices"][0][1][0].reshape(-1, 3).astype(np.float64)


# ---------------------------------------------------------------- the real product's outline
def product_mask(rgb):
    """The renders sit on pure white: everything not connected to the border through white is the bottle."""
    near_white = (rgb.min(2) >= 253).astype(np.uint8)
    n, lab = cv2.connectedComponents(near_white, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return ~np.isin(lab, list(border))


def target_ratio():
    ratios = []
    for f in list(RENDERS.values())[:7]:
        m = product_mask(np.array(Image.open(os.path.join(SRC, f)).convert("RGB")))
        ys, xs = np.where(m)
        ratios.append((xs.max() - xs.min()) / (ys.max() - ys.min()))
    return float(np.median(ratios))


# ---------------------------------------------------------------- clean low-poly rebuild
def resample(V, n_theta, n_y, ratio, sig_t, sig_y):
    x, d, h = V[:, 0], V[:, 1], V[:, 2]  # the sculpt is Z-up: x = width, y = depth, z = height
    H = h.max() - h.min()
    y = (h - h.min()) / H - 0.5
    x = x / H
    z = d / H
    s = ratio / (x.max() - x.min())  # make the width match the real product's proportions
    x, z = x * s, z * s
    # centre of each height band
    jy = np.clip(np.round((y + 0.5) * (n_y - 1)).astype(int), 0, n_y - 1)
    cx = np.zeros(n_y); cz = np.zeros(n_y)
    for j in range(n_y):
        m = jy == j
        if m.any():
            cx[j] = (x[m].min() + x[m].max()) / 2
            cz[j] = (z[m].min() + z[m].max()) / 2
    cx = ndimage.gaussian_filter1d(cx, 2, mode="nearest")
    cz = ndimage.gaussian_filter1d(cz, 2, mode="nearest")
    rx, rz = x - cx[jy], z - cz[jy]
    r = np.hypot(rx, rz)
    th = np.arctan2(rz, rx)
    i = np.floor((th + np.pi) / (2 * np.pi) * n_theta).astype(int) % n_theta
    R = np.zeros((n_theta, n_y))
    np.maximum.at(R, (i, jy), r)  # the outermost surface in every direction
    empty = R <= 0
    if empty.any():
        idx = ndimage.distance_transform_edt(empty, return_distances=False, return_indices=True)
        R = R[tuple(idx)]
    R = ndimage.gaussian_filter(R, sigma=(sig_t, sig_y), mode=("wrap", "nearest"))
    return R, cx, cz


def build_mesh(R, cx, cz):
    n_theta, n_y = R.shape
    th = -np.pi + (np.arange(n_theta) + 0.5) * 2 * np.pi / n_theta
    ys = -0.5 + np.arange(n_y) / (n_y - 1)
    X = R * np.cos(th)[:, None] + cx[None, :]
    Z = R * np.sin(th)[:, None] + cz[None, :]
    Y = np.broadcast_to(ys[None, :], R.shape)
    pos = np.stack([X, Y, Z], -1).reshape(-1, 3)
    idx = lambda i, j: (i % n_theta) * n_y + j
    I, J = np.meshgrid(np.arange(n_theta), np.arange(n_y - 1), indexing="ij")
    a, b, c, d = idx(I, J), idx(I + 1, J), idx(I + 1, J + 1), idx(I, J + 1)
    tris = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    # flat caps at the top and the bottom
    base = len(pos)
    bot_c = np.array([cx[0], -0.5, cz[0]]); top_c = np.array([cx[-1], 0.5, cz[-1]])
    pos = np.vstack([pos, bot_c, top_c])
    cap = []
    for i in range(n_theta):
        cap.append([base, idx(i + 1, 0), idx(i, 0)])
        cap.append([base + 1, idx(i, n_y - 1), idx(i + 1, n_y - 1)])
    tris = np.concatenate([tris, np.array(cap)])
    # make the faces point outwards
    mid = pos[tris].mean(1)
    fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    axis = np.stack([np.interp(mid[:, 1], ys, cx), np.zeros(len(mid)), np.interp(mid[:, 1], ys, cz)], 1)
    outward = (mid - axis)
    outward[:, 1] = 0
    side = np.arange(len(tris)) < (len(tris) - len(cap))
    flip = (np.einsum("ij,ij->i", fn, outward) < 0) if side[0] else False
    if np.mean(np.einsum("ij,ij->i", fn[side], outward[side]) < 0) > 0.5:
        tris = tris[:, [0, 2, 1]]
    nrm = np.zeros_like(pos)
    fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
    for k in range(3):
        np.add.at(nrm, tris[:, k], fn)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    return pos, nrm, tris


def make_uv(pos, nrm):
    """glTF convention: v = 0 is the TOP of the image. The front is wrapped with a flat projection;
    the back of the bottle samples a plain strip of the shell colour at the bottom of the texture."""
    xmin, xmax = pos[:, 0].min(), pos[:, 0].max()
    u = np.clip((pos[:, 0] - xmin) / (xmax - xmin), 0.03, 0.97)
    yn = (pos[:, 1] - pos[:, 1].min()) / (pos[:, 1].max() - pos[:, 1].min())
    v = (1 - yn) * (IMG_H / TEX_H)
    t = np.clip((0.05 - nrm[:, 2]) / 0.35, 0, 1)
    t = t * t * (3 - 2 * t)  # 0 on the front, 1 on the back
    su, sv = 0.5, (IMG_H + STRIP_H / 2) / TEX_H
    return np.stack([u * (1 - t) + su * t, v * (1 - t) + sv * t], 1)


def write_glb(path, pos, nrm, uv, tris, scale=1.0):
    pos = (pos * scale).astype(np.float32); nrm = nrm.astype(np.float32); uv = uv.astype(np.float32)
    ind = tris.astype(np.uint16 if len(pos) < 65535 else np.uint32).reshape(-1)
    blobs, views, acc = [], [], []
    def add(arr, target, ctype, typ, mn=None, mx=None):
        raw = arr.tobytes()
        pad = (-len(raw)) % 4
        off = sum(len(x) for x in blobs)
        blobs.append(raw + b"\0" * pad)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw), "target": target})
        a = {"bufferView": len(views) - 1, "componentType": ctype, "count": int(arr.shape[0] if arr.ndim > 1 else arr.shape[0]), "type": typ}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        acc.append(a)
        return len(acc) - 1
    ip = add(pos, 34962, 5126, "VEC3", pos.min(0).tolist(), pos.max(0).tolist())
    inn = add(nrm, 34962, 5126, "VEC3")
    iu = add(uv, 34962, 5126, "VEC2")
    ii = add(ind, 34963, 5123 if ind.dtype == np.uint16 else 5125, "SCALAR")
    js = {
        "asset": {"version": "2.0", "generator": "tag build_roll_on.py"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "roll-on"}],
        "meshes": [{"name": "roll-on", "primitives": [{"attributes": {"POSITION": ip, "NORMAL": inn, "TEXCOORD_0": iu}, "indices": ii}]}],
        "accessors": acc, "bufferViews": views, "buffers": [{"byteLength": sum(len(x) for x in blobs)}],
    }
    jb = json.dumps(js, separators=(",", ":")).encode()
    jb += b" " * ((-len(jb)) % 4)
    bb = b"".join(blobs)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(jb), b"JSON")); f.write(jb)
        f.write(struct.pack("<I4s", len(bb), b"BIN\0")); f.write(bb)
    return os.path.getsize(path)


# ---------------------------------------------------------------- one texture per fragrance
def make_texture(png_path, out_path):
    rgb = np.array(Image.open(png_path).convert("RGB"))
    m = product_mask(rgb)
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop, mc = rgb[y0:y1, x0:x1], m[y0:y1, x0:x1]
    # fill the white outside the bottle with the nearest bottle colour so no white fringe shows at the edges
    core = ndimage.binary_erosion(mc, iterations=5)  # drop the pale anti-aliased fringe at the very edge
    idx = ndimage.distance_transform_edt(~core, return_distances=False, return_indices=True)
    crop = crop[idx[0], idx[1]]
    img = cv2.resize(crop, (TEX_W, IMG_H), interpolation=cv2.INTER_AREA)
    # plain colour for the back of the bottle: the shell colour near the upper left edge
    h, w = mc.shape
    band = crop[int(h * 0.52):int(h * 0.60), int(w * 0.04):int(w * 0.10)].reshape(-1, 3)
    shell = np.median(band, axis=0).astype(np.uint8)
    strip = np.tile(shell, (STRIP_H, TEX_W, 1))
    out = np.vstack([img, strip])
    Image.fromarray(out).save(out_path, "WEBP", quality=88, method=6)
    return os.path.getsize(out_path), tuple(int(c) for c in shell)


if __name__ == "__main__":
    V = read_fbx_vertices(os.path.join(SRC, "base.fbx"))
    ratio = target_ratio()
    print("real product width / height:", round(ratio, 3), " sculpt vertices:", len(V))
    for name, (nt, ny, st, sy) in {"hi": (96, 140, 1.0, 1.0), "lo": (40, 56, 0.6, 0.6)}.items():
        R, cx, cz = resample(V, nt, ny, ratio, st, sy)
        pos, nrm, tris = build_mesh(R, cx, cz)
        uv = make_uv(pos, nrm)
        size = write_glb(os.path.join(MODELS, f"roll-on-{name}.glb"), pos, nrm, uv, tris, scale=3.0)
        print(f"roll-on-{name}.glb: {len(pos)} vertices, {len(tris)} triangles, {size/1024:.0f} KB")
        np.savez(f"/tmp/roll_{name}.npz", pos=pos, nrm=nrm, uv=uv, tris=tris)
    for slug, f in RENDERS.items():
        size, shell = make_texture(os.path.join(SRC, f), os.path.join(TEXTURES, f"{slug}.webp"))
        print(f"{slug}.webp: {size/1024:.0f} KB, back colour {shell}")
