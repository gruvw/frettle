"""Builds web/accidentals.woff2, the font Frettle draws ♯ ♭ 𝄪 𝄫 with.

The four signs follow Noto Music's shapes (thin stems, thick sharp bars, a
flat's loop broad where it leaves the stem, a double sharp on the baseline),
lighter than the letters, sized to sit with the system sans (on Inter: cap
height 727, stems 90 at weight 400 to 170 at 800), as a variable font with a
weight axis from 400 to 800. Every outline is a function of the letters'
stem width, so both masters have the same points and interpolate.

  pip install fonttools brotli
  python3 tools/accidentals.py web/accidentals.woff2
"""
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor
from fontTools import varLib
from fontTools.ttLib import TTFont
from fontTools.pens.reverseContourPen import ReverseContourPen
OVERLAP_SIMPLE = 0x40

UPM = 1000
NAME = 'Frettle Accidentals'

def rect(x0, y0, x1, y1): return [('M', (x0, y0)), ('L', (x1, y0)), ('L', (x1, y1)), ('L', (x0, y1))]
def poly(pts): return [('M', pts[0])] + [('L', p) for p in pts[1:]]

# The flat as Noto Music draws it (its points, from its stem's right edge,
# on a stem 31 wide and a bowl 168 wide), scaled up to sit with letters
# (K), the bowl a little wider and its counter a little smaller as the
# weight goes up: the loop's top end broad where it leaves the stem, as a
# pen draws it, thin at the tail
FLAT_OUT = [(0, 225), ('q', 37, 262), (84, 262), ('q', 116, 262), ('q', 168, 219), (168, 178),
            ('q', 168, 146), ('q', 130, 92), (98, 65), (29, 6), ('q', 10, -10), ('q', -20, -41), ('tail', -55)]
FLAT_IN = [(0, 12), ('q', 26, 40), ('q', 62, 87), (72, 105), ('q', 83, 124), ('q', 94, 156), (94, 170),
           ('q', 94, 198), ('q', 68, 223), (53, 223), ('q', 37, 223), ('q', 6, 200), (0, 180)]
K = 1.03

def weight(s): return (s - 90) / 80             # 0 at 400, 1 at 800
def stem(s): return round(0.42 * s + 7)        # the sharp's stems (whole units)
def flat_stem(s): return round(1.15 * stem(s))  # the flat's: a little thicker, to look as heavy as the sharp (it has one stem, not two)

def contour(points):
    """[(x, y) on, ('q', x, y) off, ...] → segments: a run of offs, then an on"""
    segs, offs = [], []
    for p in points:
        if p[0] == 'q': offs.append(p[1:]); continue
        if not segs: segs.append(('M', p))
        elif offs: segs.append(('QQ', *offs, p))
        else: segs.append(('L', p))
        offs = []
    return segs

def flat(x0, s):
    w = weight(s)
    sw = flat_stem(s)                    # the stem
    R = x0 + sw
    fx = K * 1.36 * (1 + 0.12 * w)       # the bowl: wider than Noto Music's (easier to see small), and as it gets heavier
    c = 1.10 - 0.26 * w                  # the counter, smaller
    cy = 117                             # (its middle's height; across, it keeps to the stem)
    ky = K * 1.14                        # the bowl's height: taller than Noto Music's, so it leaves the stem higher
    top = 640
    out = [(x0, top), (R, top)]
    # The bowl's bottom, from (98, 65) to the tail at the stem's bottom left:
    # Noto Music's run between those two points, turned and stretched to
    # end at this stem (wider, heavier), so it runs straight into it
    A, B = (98, 65), (-31, -55)
    A2, B2 = (R + fx * A[0], ky * A[1]), (x0, K * B[1])
    def run(x, y):
        ux, uy = B[0] - A[0], B[1] - A[1]; L2 = ux * ux + uy * uy
        a = ((x - A[0]) * ux + (y - A[1]) * uy) / L2; b = ((x - A[0]) * -uy + (y - A[1]) * ux) / L2
        vx, vy = B2[0] - A2[0], B2[1] - A2[1]
        return (A2[0] + a * vx - b * vy, A2[1] + a * vy + b * vx)
    bottom = False
    for p in FLAT_OUT:
        if p[0] == 'tail': out.append(B2); continue
        q = p[0] == 'q'; x, y = p[1:] if q else p
        pt = run(x, y) if bottom else (R + fx * x, ky * y)
        bottom = bottom or (x, y) == A
        out.append(('q', *pt) if q else pt)
    inn = []
    for p in FLAT_IN:
        q = p[0] == 'q'; x, y = p[1:] if q else p
        x, y = x * c, cy + (y - cy) * c
        pt = (R + fx * x, ky * y)
        inn.append(('q', *pt) if q else pt)
    return [(contour(out), 'outer'), (contour(inn), 'hole')], R + fx * 168

def sharp(x0, s):
    w = weight(s)
    W = 1.27 * (290 + 0.40 * s)          # wider than Noto Music's (easier to see small)
    sv = stem(s)                         # stems, thin
    t = 0.76 * s + 20                    # bars, thick
    rise = 0.25 * W
    xl, xr = x0 + 0.30 * W, x0 + 0.70 * W
    c = []
    xl, xr = round(xl - sv / 2), round(xr - sv / 2)   # (their left edges)
    c.append((rect(xl, -70, xl + sv, 610), 'outer'))
    c.append((rect(xr, -40, xr + sv, 640), 'outer'))
    for yc in (152, 418):
        y0 = yc - rise / 2 - t / 2
        c.append((poly([(x0, y0), (x0 + W, y0 + rise), (x0 + W, y0 + rise + t), (x0, y0 + t)]), 'outer'))
    return c, x0 + W

def double_sharp(x0, s):
    """Noto Music's: a square on the baseline with a round bite out of the
    middle of each side, leaving an X with square ends"""
    w = weight(s)
    H = 1.25 * (300 + 0.30 * s)          # bigger than Noto Music's (easier to see small)
    e = (0.31 + 0.06 * w) * H            # the corners' size, the bites' depth
    x1, y1 = x0 + H, H
    def bite(a, b, n, depth_dir):
        """a, b: the bite's two edge points; n: inward unit vector; its
        end rounded"""
        (ax, ay), (bx, by) = a, b
        nx, ny = n
        r = min(abs(bx - ax) + abs(by - ay), 2 * e) / 2
        da, db = (ax + nx * (e - r), ay + ny * (e - r)), (bx + nx * (e - r), by + ny * (e - r))
        mid = ((ax + bx) / 2 + nx * e, (ay + by) / 2 + ny * e)
        return [a, da, ('q', ax + nx * e, ay + ny * e), mid, ('q', bx + nx * e, by + ny * e), db, b]
    pts = [(x0, 0)]
    pts += bite((x0 + e, 0), (x1 - e, 0), (0, 1), 0)
    pts += [(x1, 0)]
    pts += bite((x1, e), (x1, y1 - e), (-1, 0), 0)
    pts += [(x1, y1)]
    pts += bite((x1 - e, y1), (x0 + e, y1), (0, -1), 0)
    pts += [(x0, y1)]
    pts += bite((x0, y1 - e), (x0, e), (1, 0), 0)
    return [(contour(pts), 'outer')], x1

def double_flat(x0, s):
    a, right = flat(x0, s)
    second, right2 = flat(right - flat_stem(s), s)   # (its stem on the first one's bowl)
    return a + second, right2

GLYPHS = {'flat': (0x266D, flat), 'sharp': (0x266F, sharp), 'dblsharp': (0x1D12A, double_sharp), 'dblflat': (0x1D12B, double_flat)}
SIDE = {'flat': (40, 35), 'sharp': (35, 35), 'dblsharp': (35, 35), 'dblflat': (40, 35)}

def area(pts):
    return sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts))) / 2

def draw(pen, contour, kind):
    pts = []
    for seg in contour: pts.extend(seg[1:])
    cw = area(pts) < 0                     # (y up: negative, clockwise)
    if cw != (kind == 'outer'): pen = ReverseContourPen(pen)   # TrueType: outer clockwise, holes counter
    for seg in contour:
        if seg[0] == 'M': pen.moveTo(seg[1])
        elif seg[0] == 'L': pen.lineTo(seg[1])
        else: pen.qCurveTo(*seg[1:])
    pen.closePath()

def master(s, path):
    order = ['.notdef', 'space'] + list(GLYPHS)
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({0x20: 'space', **{cp: g for g, (cp, _) in GLYPHS.items()}})
    glyphs, metrics = {}, {}
    p = TTGlyphPen(None); glyphs['.notdef'] = p.glyph(); metrics['.notdef'] = (500, 0)
    p = TTGlyphPen(None); glyphs['space'] = p.glyph(); metrics['space'] = (260, 0)
    for g, (cp, fn) in GLYPHS.items():
        lsb, rsb = SIDE[g]
        contours, right = fn(lsb, s)
        pen = TTGlyphPen(None)
        for c, kind in contours: draw(pen, [(k, *[(round(x), round(y)) for (x, y) in pts]) for (k, *pts) in c], kind)
        gl = pen.glyph(); gl.flags[0] |= OVERLAP_SIMPLE
        glyphs[g] = gl
        metrics[g] = (round(right + rsb), lsb)
    fb.setupGlyf(glyphs)
    for g in GLYPHS: glyphs[g].recalcBounds(fb.font['glyf'])
    fb.setupHorizontalMetrics({g: (metrics[g][0], getattr(glyphs[g], 'xMin', 0)) for g in order})
    fb.setupHorizontalHeader(ascent=930, descent=-240)
    fb.setupNameTable({'familyName': NAME, 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=930, sTypoDescender=-240, sTypoLineGap=0, usWinAscent=930, usWinDescent=240, fsSelection=0x80, usWeightClass=400, version=4)
    fb.setupPost()
    fb.save(path)

import os, tempfile
tmp = tempfile.mkdtemp()
M400, M800 = os.path.join(tmp, 'm400.ttf'), os.path.join(tmp, 'm800.ttf')
master(90, M400); master(170, M800)
ds = DesignSpaceDocument()
ax = AxisDescriptor(); ax.tag = 'wght'; ax.name = 'Weight'; ax.minimum = 400; ax.default = 400; ax.maximum = 800; ds.addAxis(ax)
for path, w in ((M400, 400), (M800, 800)):
    src = SourceDescriptor(); src.path = path; src.location = {'Weight': w}; ds.addSource(src)
vf, _, _ = varLib.build(ds)
vf.flavor = 'woff2'
vf.save(sys.argv[1] if len(sys.argv) > 1 else 'accidentals.woff2')
