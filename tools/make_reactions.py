#!/usr/bin/env python3
"""
Generates the five placeholder streamer-reaction images used by ReactionCam.

  assets/reactions/src/<state>.svg   (editable vector source)
  assets/reactions/<state>.png       (640x480, what the game loads)

The PNG conversion uses macOS `qlmanage` + `sips` (no Python packages needed).
On other systems the SVGs are still written; convert them with any tool, or
simply drop your own 4:3 PNGs with the same names into assets/reactions/.

Usage:  python3 tools/make_reactions.py
"""
import os
import shutil
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_PNG = os.path.join(ROOT, "assets", "reactions")
OUT_SVG = os.path.join(OUT_PNG, "src")

SKIN = "#e9b98a"
SKIN_DARK = "#c98f63"
HAIR = "#2b1b12"
LIP = "#7a3b2e"

# Per-expression parameters.
EXPRESSIONS = {
    "normal": dict(brow=(186, 184), eye=(22, 13), pupil=9, look=(0, 1), mouth="smile",
                   blush=0.35, sweat=[], tint=None, shake=False),
    "expectant": dict(brow=(170, 166), eye=(23, 18), pupil=9, look=(-5, 4), mouth="o",
                      blush=0.25, sweat=[], tint=None, shake=False),
    "stressed": dict(brow=(188, 172), eye=(22, 16), pupil=8, look=(-4, 3), mouth="wavy",
                     blush=0.15, sweat=[(428, 168)], tint=None, shake=False),
    "very_stressed": dict(brow=(192, 164), eye=(24, 19), pupil=6, look=(-3, 2), mouth="teeth",
                          blush=0.0, sweat=[(428, 160), (214, 176)], tint=("#9fd8c0", 0.18),
                          shake=False),
    "extreme_nervous": dict(brow=(178, 156), eye=(27, 26), pupil=4, look=(0, 0), mouth="scream",
                            blush=0.0, sweat=[(432, 150), (208, 168), (440, 236), (200, 246)],
                            tint=("#ff3b3b", 0.22), shake=True),
}


def drop(x, y, s=1.0):
    return (f'<path d="M{x} {y} C{x + 11 * s} {y + 16 * s}, {x + 11 * s} {y + 30 * s}, {x} {y + 30 * s} '
            f'C{x - 11 * s} {y + 30 * s}, {x - 11 * s} {y + 16 * s}, {x} {y} Z" fill="#8fdcff" '
            f'stroke="#ffffff" stroke-width="2.5" opacity="0.95"/>')


def mouth_svg(kind):
    if kind == "smile":
        return f'<path d="M288 280 Q320 306 352 280" fill="none" stroke="{LIP}" stroke-width="7" stroke-linecap="round"/>'
    if kind == "o":
        return '<ellipse cx="320" cy="290" rx="11" ry="13" fill="#5a1f1a"/>'
    if kind == "wavy":
        return (f'<path d="M290 292 Q300 283 310 292 T330 292 T350 292" fill="none" stroke="{LIP}" '
                'stroke-width="6" stroke-linecap="round"/>')
    if kind == "teeth":
        return ('<rect x="288" y="278" width="64" height="26" rx="9" fill="#fff" stroke="#5a1f1a" stroke-width="4"/>'
                '<line x1="288" y1="291" x2="352" y2="291" stroke="#8a6a60" stroke-width="2"/>'
                + "".join(f'<line x1="{x}" y1="280" x2="{x}" y2="302" stroke="#8a6a60" stroke-width="2"/>'
                          for x in (304, 320, 336)))
    # scream
    return ('<ellipse cx="320" cy="298" rx="27" ry="32" fill="#3a0f0f"/>'
            '<rect x="301" y="268" width="38" height="9" rx="3" fill="#fff"/>'
            '<ellipse cx="320" cy="318" rx="15" ry="8" fill="#e06666"/>')


def face_svg(p):
    bo, bi = p["brow"]
    erx, ery = p["eye"]
    lx, ly = p["look"]
    parts = []
    # ----- background: streamer room -----
    parts.append('''
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2b1a52"/><stop offset="1" stop-color="#0c0a18"/>
  </linearGradient>
  <linearGradient id="led" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ff3ea5"/><stop offset="0.5" stop-color="#8b5cff"/><stop offset="1" stop-color="#00e5ff"/>
  </linearGradient>
  <radialGradient id="skin" cx="0.45" cy="0.4" r="0.7">
    <stop offset="0" stop-color="#f3c79b"/><stop offset="1" stop-color="#dca577"/>
  </radialGradient>
  <filter id="glow" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="640" height="480" fill="url(#bg)"/>
<rect x="40" y="58" width="560" height="10" rx="5" fill="url(#led)" filter="url(#glow)" opacity="0.9"/>
<rect x="40" y="60" width="560" height="5" rx="2.5" fill="url(#led)"/>
<circle cx="88" cy="330" r="46" fill="#ff3ea5" opacity="0.18" filter="url(#soft)"/>
<circle cx="560" cy="300" r="58" fill="#00e5ff" opacity="0.14" filter="url(#soft)"/>
<rect x="480" y="120" width="120" height="8" rx="3" fill="#3a2a5e"/>
<rect x="492" y="92" width="18" height="28" rx="3" fill="#ffcc4d" opacity="0.8"/>
<rect x="514" y="98" width="14" height="22" rx="3" fill="#ff6b6b" opacity="0.8"/>
<rect x="532" y="88" width="22" height="32" rx="3" fill="#6bd6ff" opacity="0.7"/>
<rect x="56" y="110" width="84" height="110" rx="6" fill="#1a1433" stroke="#4b3a7a" stroke-width="3"/>
<circle cx="98" cy="165" r="26" fill="none" stroke="#0e8a4a" stroke-width="7"/>
<circle cx="98" cy="165" r="26" fill="none" stroke="#c0392b" stroke-width="7" stroke-dasharray="8 8"/>
''')
    # ----- body -----
    parts.append('<path d="M96 480 C108 404, 196 362, 272 352 L368 352 C444 362, 532 404, 544 480 Z" fill="#3b2f8f"/>')
    parts.append('<path d="M272 352 C290 392, 350 392, 368 352" fill="#2d2370"/>')
    parts.append('<line x1="300" y1="380" x2="296" y2="440" stroke="#d9d4ff" stroke-width="4" stroke-linecap="round"/>')
    parts.append('<line x1="340" y1="380" x2="344" y2="440" stroke="#d9d4ff" stroke-width="4" stroke-linecap="round"/>')
    parts.append(f'<rect x="286" y="300" width="68" height="62" rx="20" fill="{SKIN_DARK}"/>')
    # ----- ears + head -----
    parts.append(f'<ellipse cx="214" cy="228" rx="18" ry="26" fill="{SKIN_DARK}"/>')
    parts.append(f'<ellipse cx="426" cy="228" rx="18" ry="26" fill="{SKIN_DARK}"/>')
    parts.append('<ellipse cx="320" cy="222" rx="106" ry="122" fill="url(#skin)"/>')
    if p["tint"]:
        c, a = p["tint"]
        parts.append(f'<ellipse cx="320" cy="222" rx="106" ry="122" fill="{c}" opacity="{a}"/>')
    # ----- hair -----
    parts.append(f'<path d="M214 205 C200 112, 268 82, 330 86 C404 88, 446 132, 428 208 '
                 f'C414 168, 384 146, 334 152 C300 144, 262 150, 246 176 C236 168, 222 184, 214 205 Z" fill="{HAIR}"/>')
    # ----- blush -----
    if p["blush"] > 0:
        for cx in (262, 378):
            parts.append(f'<ellipse cx="{cx}" cy="258" rx="17" ry="9" fill="#ff7b7b" opacity="{p["blush"]}"/>')
    # ----- eyes -----
    for cx in (280, 360):
        parts.append(f'<ellipse cx="{cx}" cy="216" rx="{erx}" ry="{ery}" fill="#fff" stroke="#3a2418" stroke-width="3"/>')
        parts.append(f'<circle cx="{cx + lx}" cy="{216 + ly}" r="{p["pupil"]}" fill="#2b1b12"/>')
        parts.append(f'<circle cx="{cx + lx + p["pupil"] * 0.35}" cy="{216 + ly - p["pupil"] * 0.4}" '
                     f'r="{max(1.6, p["pupil"] * 0.32)}" fill="#fff"/>')
    # ----- brows (outer y, inner y) -----
    parts.append(f'<path d="M254 {bo} L302 {bi}" stroke="{HAIR}" stroke-width="9" stroke-linecap="round"/>')
    parts.append(f'<path d="M338 {bi} L386 {bo}" stroke="{HAIR}" stroke-width="9" stroke-linecap="round"/>')
    # ----- nose -----
    parts.append(f'<path d="M320 232 L313 258 L326 260" fill="none" stroke="{SKIN_DARK}" stroke-width="4" '
                 'stroke-linecap="round" stroke-linejoin="round"/>')
    parts.append(mouth_svg(p["mouth"]))
    # ----- headset -----
    parts.append('<path d="M198 236 C186 70, 454 70, 442 236" fill="none" stroke="#1b1b24" stroke-width="20" stroke-linecap="round"/>')
    parts.append('<path d="M198 236 C186 70, 454 70, 442 236" fill="none" stroke="#33334a" stroke-width="6" stroke-linecap="round"/>')
    for x in (176, 420):
        parts.append(f'<rect x="{x}" y="188" width="44" height="88" rx="18" fill="#22222e"/>')
        parts.append(f'<rect x="{x + 8}" y="200" width="28" height="64" rx="12" fill="none" stroke="#00e5ff" stroke-width="3" opacity="0.85"/>')
    parts.append('<path d="M206 268 C214 318, 246 334, 276 334" fill="none" stroke="#1b1b24" stroke-width="7" stroke-linecap="round"/>')
    parts.append('<ellipse cx="284" cy="334" rx="13" ry="10" fill="#111"/>')
    # ----- sweat / stress marks -----
    for (x, y) in p["sweat"]:
        parts.append(drop(x, y))
    if p["shake"]:
        parts.append('<g stroke="#ff4d4d" stroke-width="6" stroke-linecap="round" fill="none">'
                     '<path d="M388 132 q8 8 16 0"/><path d="M388 132 q-8 8 0 16"/>'
                     '<path d="M404 132 q8 8 0 16"/><path d="M388 148 q8 -8 16 0"/></g>')
        parts.append('<g stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.7" fill="none">'
                     '<path d="M168 170 q-14 50 0 100"/><path d="M150 190 q-10 30 0 60"/>'
                     '<path d="M472 170 q14 50 0 100"/><path d="M490 190 q10 30 0 60"/></g>')
    body = "\n".join(parts)
    # Square canvas with the 640x480 scene centred vertically: qlmanage renders a
    # square thumbnail and sips crops around the centre, which yields the scene.
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 -80 640 640">{body}</svg>'


def to_png(svg_path, png_path):
    if not shutil.which("qlmanage") or not shutil.which("sips"):
        return False
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["qlmanage", "-t", "-s", "640", "-o", tmp, svg_path],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        thumb = os.path.join(tmp, os.path.basename(svg_path) + ".png")
        if not os.path.exists(thumb):
            return False
        # qlmanage renders a 640x640 square; sips crops the centred 640x480 scene.
        subprocess.run(["sips", "--cropToHeightWidth", "480", "640", thumb],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        shutil.move(thumb, png_path)
    return True


def main():
    os.makedirs(OUT_SVG, exist_ok=True)
    for name, params in EXPRESSIONS.items():
        svg_path = os.path.join(OUT_SVG, name + ".svg")
        with open(svg_path, "w") as f:
            f.write(face_svg(params))
        ok = to_png(svg_path, os.path.join(OUT_PNG, name + ".png"))
        print(f"{name:16s} svg ok, png {'ok' if ok else 'SKIPPED (no qlmanage)'}")


if __name__ == "__main__":
    main()
