#!/usr/bin/env python3
"""Checks the text/background colour pairs the site uses against the WCAG AA readability rules.
   python3 tools/contrast_check.py"""
import re, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
def lum(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
def mix(a, b, t):
    pa, pb = int(a[1:], 16), int(b[1:], 16)
    ch = lambda s: round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
    return "#" + "".join(f"{ch(s):02x}" for s in (16, 8, 0))

TEXT, MUTED, ACCENT2 = "#f6f3ff", "#c4bbee", "#a58bff"
BG, BG2 = "#0b0727", "#120b36"

pairs = [
    ("body text on page", TEXT, BG, 4.5),
    ("muted text on page", MUTED, BG, 4.5),
    ("small labels (accent) on page", ACCENT2, BG, 4.5),
    ("muted text on cards / proof", MUTED, BG2, 4.5),
    ("muted text on call to action", MUTED, "#160d45", 4.5),
    ("muted text in footer", MUTED, "#06041a", 4.5),
    ("white button text (dark on white)", BG, "#ffffff", 4.5),
    ("menu button text (white on violet)", "#ffffff", "#7a4dff", 4.5),
    ("quiz text on white card", BG, "#ffffff", 4.5),
    ("quiz small label (violet on white)", "#7a4dff", "#ffffff", 4.5),
    ("ticker front row (white on violet)", "#ffffff", "#1a0f4d", 3.0),
]
src = open(os.path.join(ROOT, "lib", "scents.ts")).read()
for m in re.finditer(r'name: "([^"]+)".*?glow: "(#[0-9a-fA-F]{6})"', src, re.S):
    bg = mix(BG, m.group(2), 0.2)
    pairs.append((f"{m.group(1)}: text", TEXT, bg, 4.5))
    pairs.append((f"{m.group(1)}: muted labels", MUTED, bg, 4.5))

worst, fails = 99, 0
for name, fg, bg, need in pairs:
    r = ratio(fg, bg)
    ok = r >= need
    fails += 0 if ok else 1
    worst = min(worst, r)
    print(f"{'PASS' if ok else 'FAIL'}  {r:5.2f}  (needs {need})  {name}   {fg} on {bg}")
print(f"\n{len(pairs) - fails}/{len(pairs)} pairs pass. Lowest contrast: {worst:.2f}")
