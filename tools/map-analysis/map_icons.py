#!/usr/bin/env python3
"""Read a Roads zone's permanent map features from a screenshot of its map.

Chests, resource nodes and dungeon entrances are drawn as fixed sprites, so a
screenshot carries the whole feature list if the sprites can be found and named.
The steps:

  1. The play area is the dark floor inside the stone frame. Taking it from the
     floor rather than from the frame corners keeps the frame, its compass
     letters and the surrounding scenery out - all of which otherwise read as
     icons. `road_shapes.frame_corners` gives the scale, so every measurement
     below is in reference-scale pixels and zoom stops mattering.
  2. Sprites are the only bright thing left once roads are masked, so bright
     connected components are the candidate locations.
  3. Each candidate is matched against a per-type template by weighted normalised
     cross-correlation, searched over the candidate's own extent so that two
     adjacent sprites yield two peaks rather than one.
  4. Correlation subtracts the mean, so it cannot tell a gold chest from a green
     one - the three chests share a body and differ only in lid colour. Chest
     shape is matched once and the colour comes from the lid hue, which is
     tightly clustered (gold 42 degrees, green 88, blue 190).
  5. A large resource node stands in a cleared patch of ground and a small one
     does not. Measured against the map's own terrain coverage the two are
     cleanly separated: on 79 nodes where two or more rooms agreed on the split,
     small tops out at 548 and large starts at 1329.

Templates are averaged from labelled exemplars rather than hardcoded, so this
needs `--labels` before it can read anything - the same arrangement as
`road_shapes.py`. Exemplar coordinates are into the screenshots themselves, so
re-acquiring the images can invalidate them.

Usage:
    python3 map_icons.py --maps ./screenshots --labels ./icon-labels.json \
                         [--reference ./reference.json] [--out icon-results.json]

Screenshots are named <Zone-Name>.png. `--reference` is the tabulated feature
set described in feature_audit.py; supplying it prints an agreement table and
marks every disagreeing zone for review.
"""
import argparse, collections, colorsys, json, os, sys
import numpy as np
from PIL import Image

import road_shapes as rs

REF_FRAME = 682.0     # frame width every measurement is normalised to
TPL = 44              # template side, in reference-scale pixels
PAD = 6               # alignment search radius when averaging exemplars
MATCH_Q = 2           # matching runs at half reference resolution
SEP = 13              # two peaks closer than this are one sprite
ROAD = np.array([255, 176, 88])
ROAD_TOL = 60
BRIGHT = 105          # terrain never reaches this; every sprite does
MERGE_GAP = 6         # fragments this close are one sprite ...
MERGE_CAP = 50        # ... unless merging them would exceed a sprite's size

CHESTS = {'treasuresGreen', 'treasuresBlue', 'treasuresYellow'}
RESOURCES = ('wood', 'ore', 'stone', 'fibre', 'leather')

# Tuned by sweeping each against the tabulated reference; see the module docstring.
# Dungeons are flat across the whole range - their shortfall is missing icons, not
# a threshold - so they take a middling value rather than the sweep's floor.
THRESHOLDS = {'chest': 0.73, 'wood': 0.86, 'ore': 0.72, 'stone': 0.79, 'fibre': 0.67,
              'leather': 0.87, 'dungeon': 0.72, 'portal': 0.82, 'hideout': 0.82}
HUE_YELLOW_GREEN = 65.0
HUE_GREEN_BLUE = 140.0
LARGE_CLEARING = 900.0    # midway between the two populations, both far from it
PANEL_EDGE = 70.0         # a straight edge this long is a UI panel over the map


# ── locating the play area ────────────────────────────────────────────────────

def _diamond(shape, corners, shrink=1.0):
    h, w = shape
    cx = sum(p[0] for p in corners) / 4
    cy = sum(p[1] for p in corners) / 4
    pts = [(cx + (x - cx) * shrink, cy + (y - cy) * shrink) for x, y in corners]
    ys, xs = np.mgrid[0:h, 0:w]

    def side(sign):
        m = np.ones((h, w), bool)
        for i in range(4):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % 4]
            cross = (x1 - x0) * (ys - y0) - (y1 - y0) * (xs - x0)
            m &= (cross >= 0) if sign > 0 else (cross <= 0)
        return m
    a, b = side(1), side(-1)
    return a if a.sum() > b.sum() else b


def _span_fill(m):
    """Fill each row and column between its first and last set pixel."""
    def fill(x):
        out = np.zeros_like(x)
        for i in range(x.shape[0]):
            nz = np.nonzero(x[i])[0]
            if len(nz):
                out[i, nz[0]:nz[-1] + 1] = True
        return out
    return fill(m) & fill(m.T).T


def _erode(m, n=1):
    return ~rs.dilate(~m, n)


def play_area(a, corners, q=4):
    """The dark floor inside the frame, holes filled. Worked at 1/q for speed."""
    h, w = a.shape[:2]
    small = np.asarray(Image.fromarray(a.astype('uint8')).resize((w // q, h // q),
                                                                 Image.BILINEAR)).astype(np.int16)
    dia = _diamond(small.shape[:2], tuple((x / q, y / q) for x, y in corners), 0.99)
    comps = rs._components(dia & (small.max(2) < 130), 40)
    if not comps:
        return None
    big = max(comps, key=len)
    m = np.zeros(small.shape[:2], bool)
    m[big[:, 0], big[:, 1]] = True
    m = _span_fill(m)
    return np.asarray(Image.fromarray(m.astype('uint8') * 255).resize((w, h), Image.NEAREST)) > 0


# ── candidate detection ───────────────────────────────────────────────────────

def detect(path):
    """(image, pixels, candidate boxes, scale, frame quality) or None."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    corners, q = rs.frame_corners(path)
    if corners is None:
        return None
    scale = (corners[3][0] - corners[1][0]) / REF_FRAME
    play = play_area(a, corners)
    if play is None:
        return None
    play = _erode(play, max(2, int(round(4 * scale))))
    road = rs.dilate(np.abs(a - ROAD).sum(2) < ROAD_TOL, max(2, int(round(3 * scale))))
    minpx = max(12, int(round(22 * scale * scale)))
    mask = play & (a.max(2) > BRIGHT) & ~road
    boxes = []
    for c in rs._components(rs.denoise(mask, minpx), minpx):
        ys, xs = c[:, 0], c[:, 1]
        boxes.append([xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, len(c)])
    gap, cap = MERGE_GAP * scale, MERGE_CAP * scale
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                A, B = boxes[i], boxes[j]
                if not (A[0] - gap < B[2] and B[0] - gap < A[2]
                        and A[1] - gap < B[3] and B[1] - gap < A[3]):
                    continue
                u = [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3]), A[4] + B[4]]
                if u[2] - u[0] > cap or u[3] - u[1] > cap:
                    continue
                boxes[i] = u
                boxes.pop(j)
                merged = True
                break
            if merged:
                break
    return im, a, boxes, scale, q, play


def panel_edge(a, play, scale):
    """Longest straight horizontal edge inside the play area, in reference px.

    Terrain has none; a tooltip or menu drawn over the map has one the width of
    its own border, and whatever it covers cannot be read.
    """
    d = np.abs(np.diff(a, axis=0)).sum(2)
    edge = (d > 40) & play[:-1]
    best = 0
    for row in edge:
        idx = np.flatnonzero(np.diff(np.r_[0, row.view(np.int8), 0]))
        if len(idx):
            best = max(best, int((idx[1::2] - idx[0::2]).max()))
    return best / scale


# ── templates ─────────────────────────────────────────────────────────────────

class Corpus:
    """Screenshots keyed by zone name, with each one's reference scale."""

    def __init__(self, maps_dir):
        self.dir = maps_dir
        self._scale = {}

    def path(self, zone):
        return os.path.join(self.dir, zone + '.png')

    def scale(self, zone):
        if zone not in self._scale:
            corners, _ = rs.frame_corners(self.path(zone))
            self._scale[zone] = (corners[3][0] - corners[1][0]) / REF_FRAME
        return self._scale[zone]

    def patch(self, zone, cx, cy, n=TPL):
        """Crop around (cx, cy) resampled so one output pixel is one reference px."""
        s = self.scale(zone)
        im = Image.open(self.path(zone)).convert('RGB')
        half = n * s / 2
        cr = im.transform((n, n), Image.AFFINE, (s, 0, cx - half, 0, s, cy - half), Image.BILINEAR)
        return np.asarray(cr).astype(np.float32) / 255.0


def _ring_median(p):
    r = np.concatenate([p[0:3].reshape(-1, 3), p[-3:].reshape(-1, 3),
                        p[:, 0:3].reshape(-1, 3), p[:, -3:].reshape(-1, 3)])
    return np.median(r, 0)


def build_templates(labels, corpus, iters=3):
    """Average each type's exemplars into a template plus a soft sprite mask."""
    g = np.abs(np.arange(TPL) - (TPL - 1) / 2)
    radial = np.clip((16.0 - np.hypot(*np.meshgrid(g, g))) / 5.0, 0, 1)
    out = {}
    for t, pts in labels.items():
        nbs = [corpus.patch(p['zone'], p['at'][0], p['at'][1], TPL + 2 * PAD) for p in pts]

        def at(nb, dx, dy):
            return nb[PAD + dy:PAD + dy + TPL, PAD + dx:PAD + dx + TPL]

        offs = [(0, 0)] * len(pts)
        for it in range(iters):
            stack = np.array([at(nb, *offs[i]) for i, nb in enumerate(nbs)])
            if it == iters - 1:
                break
            mc = stack.mean(0)
            mc = (mc - mc.mean()).ravel()
            mc /= np.linalg.norm(mc)
            for i, nb in enumerate(nbs):
                best = (-2.0, (0, 0))
                for dy in range(-PAD, PAD + 1):
                    for dx in range(-PAD, PAD + 1):
                        v = at(nb, dx, dy)
                        v = (v - v.mean()).ravel()
                        n = np.linalg.norm(v)
                        if n < 1e-6:
                            continue
                        sc = float(v @ mc / n)
                        if sc > best[0]:
                            best = (sc, (dx, dy))
                offs[i] = best[1]
        # The mask, not the template, is what has to know where the sprite ends.
        # Subtracting each exemplar's own background before averaging cancels the
        # varied terrain and leaves the sprite, which is where the mask comes from.
        dev = np.array([p - _ring_median(p) for p in stack]).mean(0)
        w = np.clip((np.linalg.norm(dev, axis=2) - 0.04) / 0.12, 0, 1) * radial
        out[t] = {'mean': stack.mean(0), 'w': w}
    return out


class Matcher:
    """Weighted normalised cross-correlation against every template at once.

    Folding the mask into the template turns the whole score into three matmuls,
    which is what makes an exhaustive offset search affordable.
    """

    def __init__(self, templates):
        self.types = list(templates)
        mean = np.array([_half(templates[t]['mean']) for t in self.types]).astype(np.float32)
        w = np.array([np.repeat(_half(templates[t]['w'])[:, :, None], 3, 2)
                      for t in self.types]).astype(np.float32)
        n = len(self.types)
        self.n = TPL // MATCH_Q
        self.wsum = w.reshape(n, -1).sum(1)
        mt = (w * mean).reshape(n, -1).sum(1) / self.wsum
        dev = mean - mt[:, None, None, None]
        self.A = np.ascontiguousarray((w * dev).reshape(n, -1).T)
        self.B = np.ascontiguousarray(w.reshape(n, -1).T)
        self.varT = (w * dev * dev).reshape(n, -1).sum(1)

    def score(self, X):
        num = X @ self.A
        s1 = X @ self.B
        s2 = (X * X) @ self.B
        varI = np.maximum(s2 - s1 * s1 / self.wsum, 1e-9)
        return num / np.sqrt(varI * self.varT)


def _half(a, q=MATCH_Q):
    s = a.shape
    return a.reshape(s[0] // q, q, s[1] // q, q, *s[2:]).mean((1, 3))


def _windows(img, n, x0, y0, x1, y1):
    h, w = img.shape[:2]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(w - n, x1), min(h - n, y1)
    if x1 < x0 or y1 < y0:
        return None, None
    st = img.strides
    shape = (y1 - y0 + 1, x1 - x0 + 1)
    v = np.lib.stride_tricks.as_strided(img[y0:, x0:], (shape[0], shape[1], n, n, 3),
                                        (st[0], st[1], st[0], st[1], st[2]))
    return v.reshape(shape[0] * shape[1], -1), (shape, x0, y0)


def shape_class(t):
    return 'chest' if t in CHESTS else t


# ── reading one map ───────────────────────────────────────────────────────────

def lid_hue(corpus, mask, zone, x, y):
    """Hue of a chest's most saturated pixels - the lid is what carries the colour.

    The lid is not masked out explicitly; it is simply the most saturated thing
    under the chest mask. That holds while the lid is visible, and fails quietly
    when it is not, which is why an unreadable hue returns None rather than a guess.
    """
    p = corpus.patch(zone, x, y, TPL)
    px = p[mask > 0.5]
    if len(px) < 20:
        return None
    mx, mn = px.max(1), px.min(1)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    sel = px[np.argsort(-sat * mx)[:max(8, len(px) // 8)]]
    hs = np.array([colorsys.rgb_to_hsv(*c)[0] for c in sel]) * 2 * np.pi
    if sat[np.argsort(-sat * mx)[:len(sel)]].mean() < 0.25:
        return None                       # nothing coloured enough to call a lid
    # hue is circular, so average as unit vectors rather than as numbers
    ang = np.arctan2(np.sin(hs).mean(), np.cos(hs).mean())
    return float(np.degrees(ang) % 360)


def chest_colour(h):
    """(colour, certain). An unreadable lid is reported, never guessed away."""
    if h is None:
        return 'treasuresGreen', False
    return ('treasuresYellow' if h < HUE_YELLOW_GREEN
            else 'treasuresGreen' if h < HUE_GREEN_BLUE else 'treasuresBlue'), True


def _brown(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (r > g + 12) & (r > b + 12) & (r > 62) & (r < 150)


def clearing(brown, base, scale, x, y):
    """Cleared ground around a node, less what this map has everywhere anyway."""
    r = max(1, int(28 * scale))
    y0, y1 = max(0, y - r), min(brown.shape[0], y + r)
    x0, x1 = max(0, x - r), min(brown.shape[1], x + r)
    crop = brown[y0:y1, x0:x1]
    if crop.size == 0:
        return 0.0
    return float((crop.mean() - base) * crop.size / (scale * scale))


def read_map(path, corpus, matcher, chest_mask):
    det = detect(path)
    if det is None:
        return None
    im, a, boxes, scale, q, play = det
    n = matcher.n
    w, h = int(im.width / scale / MATCH_Q), int(im.height / scale / MATCH_Q)
    img = np.ascontiguousarray(np.asarray(im.resize((w, h), Image.BILINEAR)).astype(np.float32) / 255.0)
    bar = np.array([THRESHOLDS[shape_class(t)] for t in matcher.types])

    raw = []
    for bx in boxes:
        x0, y0, x1, y1 = [v / scale / MATCH_Q for v in bx[:4]]
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        ex, ey = (x1 - x0) / 2, (y1 - y0) / 2
        X, info = _windows(img, n, int(cx - n / 2 - 4 - ex), int(cy - n / 2 - 4 - ey),
                           int(cx - n / 2 + 4 + ex), int(cy - n / 2 + 4 + ey))
        if X is None:
            continue
        S = matcher.score(X)
        (shape, ox, oy) = info
        # Only a position that clears some type's own threshold is a peak. Suppressing
        # by raw score first would let a high-scoring reject shadow a real icon and
        # then drop out itself, and types differ by 0.2 in what counts as a match.
        eligible = np.where(S >= bar, S, -np.inf)
        best, arg = eligible.max(1), eligible.argmax(1)
        taken = []
        for idx in np.argsort(-best):
            if not np.isfinite(best[idx]):
                break
            py, px = divmod(int(idx), shape[1])
            px_ref = (ox + px + n / 2) * MATCH_Q
            py_ref = (oy + py + n / 2) * MATCH_Q
            if any((px_ref - p) ** 2 + (py_ref - r) ** 2 < SEP * SEP for p, r in taken):
                continue
            taken.append((px_ref, py_ref))
            row = S[idx]
            i = int(arg[idx])
            other = [row[j] - bar[j] for j in range(len(row))
                     if shape_class(matcher.types[j]) != shape_class(matcher.types[i])]
            raw.append({'ref': (px_ref, py_ref), 'at': [round(px_ref * scale), round(py_ref * scale)],
                        'type': matcher.types[i], 'score': float(row[i]),
                        'margin': float(row[i] - bar[i] - max(other, default=-9.0))})

    raw.sort(key=lambda r: -r['score'])
    kept = []
    for r in raw:
        if any((r['ref'][0] - k['ref'][0]) ** 2 + (r['ref'][1] - k['ref'][1]) ** 2 < SEP * SEP
               for k in kept):
            continue
        kept.append(r)

    brown = _brown(a)
    base = brown[play].mean() if play.any() else 0.0
    zone = os.path.basename(path)[:-4]
    icons, ambiguous, unlit = [], 0, 0
    for r in kept:
        t = r['type']
        if r['margin'] < 0.05:
            ambiguous += 1
        icon = {'type': t, 'score': round(r['score'], 3), 'at': r['at']}
        if shape_class(t) == 'chest':
            colour, certain = chest_colour(lid_hue(corpus, chest_mask, zone, *r['at']))
            icon['type'] = colour
            if not certain:
                icon['lidUnreadable'] = True
                unlit += 1
        elif t in RESOURCES:
            area = clearing(brown, base, scale, *r['at'])
            icon['size'] = 'large' if area >= LARGE_CLEARING else 'small'
            icon['clearing'] = round(area)
        icons.append(icon)

    review = []
    if not q['ok']:
        review.append('frame not cleanly located - the map may be clipped or zoomed')
    edge = panel_edge(a, play, scale)
    if edge > PANEL_EDGE:
        review.append(f'a {edge:.0f}px panel covers part of the map')
    if unlit:
        review.append(f'{unlit} chest(s) had an unreadable lid and were counted as green')
    if ambiguous:
        review.append(f'{ambiguous} icon(s) matched two types within 0.05')
    return {'icons': icons, 'needsReview': review or None}


def summarise(icons):
    chests = collections.Counter(i['type'] for i in icons if i['type'] in CHESTS)
    res = {}
    for t in RESOURCES:
        sizes = collections.Counter(i['size'] for i in icons if i['type'] == t)
        if sizes:
            res[t] = {'small': sizes.get('small', 0), 'large': sizes.get('large', 0)}
    return {'chests': {k + 'Count': chests.get(k, 0) for k in sorted(CHESTS)},
            'resources': res,
            'dungeonCount': sum(1 for i in icons if i['type'] == 'dungeon')}


# ── reporting ─────────────────────────────────────────────────────────────────

REF_KEYS = {'treasuresGreen': ('chests', 'treasuresGreenCount'),
            'treasuresBlue': ('chests', 'treasuresBlueCount'),
            'treasuresYellow': ('chests', 'treasuresYellowCount'),
            'wood': ('resources', 'wood'), 'ore': ('resources', 'ore'),
            'stone': ('resources', 'stone'), 'fibre': ('resources', 'fibre'),
            'leather': ('resources', 'leather'), 'dungeon': ('dungeonCount', None)}


def read_count(features, t):
    sec, key = REF_KEYS[t]
    if key is None:
        return features['dungeonCount']
    if sec == 'chests':
        return features['chests'].get(key, 0)
    r = features['resources'].get(t)
    return (r['small'] + r['large']) if r else 0


def compare(results, reference):
    """Per-type agreement, and the zones that disagree.

    Agreement is counted only over zones where one side or the other says the
    feature is present. Counting all 325 would score every zone that has no ore
    as an ore success, which most of them are, and flatter the reader by 60
    points on the rarer features.
    """
    tally = collections.defaultdict(collections.Counter)
    disagree = collections.defaultdict(list)
    for zone, v in results.items():
        e = reference.get(zone.lower())
        if not e:
            continue
        for t, (sec, key) in REF_KEYS.items():
            want = e[sec] if key is None else e[sec].get(key, 0)
            got = read_count(v['features'], t)
            c = tally[t]
            c['ref'] += want
            c['read'] += got
            if not (want or got):
                continue
            c['zones'] += 1
            if got == want:
                c['exact'] += 1
            else:
                c['over'] += max(0, got - want)
                c['under'] += max(0, want - got)
                disagree[zone].append(f'{t}: read {got}, reference {want}')
    print('\n%-16s %6s %6s %14s %7s %7s'
          % ('type', 'ref', 'read', 'agree/present', 'over', 'under'))
    for t in REF_KEYS:
        c = tally[t]
        print('%-16s %6d %6d %6d/%3d %3.0f%% %7d %7d'
              % (t, c['ref'], c['read'], c['exact'], c['zones'],
                 100 * c['exact'] / max(1, c['zones']), c['over'], c['under']))
    return disagree


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--maps', required=True, help='directory of <Zone-Name>.png screenshots')
    ap.add_argument('--labels', required=True, help='exemplar icon coordinates per feature type')
    ap.add_argument('--reference', help='tabulated feature counts to compare against')
    ap.add_argument('--out', default='icon-results.json')
    args = ap.parse_args()

    corpus = Corpus(args.maps)
    labels = json.load(open(args.labels))
    templates = build_templates(labels, corpus)
    print(f'{len(templates)} templates from '
          f'{sum(len(v) for v in labels.values())} exemplars')
    matcher = Matcher(templates)
    chest_mask = np.maximum.reduce([templates[t]['w'] for t in CHESTS if t in templates])

    results, skipped = {}, []
    for f in sorted(os.listdir(args.maps)):
        if not f.endswith('.png'):
            continue
        r = read_map(os.path.join(args.maps, f), corpus, matcher, chest_mask)
        if r is None:
            skipped.append(f[:-4])
            continue
        r['features'] = summarise(r['icons'])
        results[f[:-4]] = r
    print(f'{len(results)} maps read, {len(skipped)} could not be located')

    if args.reference:
        disagree = compare(results, json.load(open(args.reference)))
        for zone, notes in disagree.items():
            results[zone]['needsReview'] = (results[zone]['needsReview'] or []) + notes

    json.dump(results, open(args.out, 'w'), indent=1)
    flagged = {k: v for k, v in results.items() if v['needsReview']}
    print(f'\nwrote {args.out}; {len(flagged)} zones need review')
    for k, v in sorted(flagged.items())[:20]:
        print(f'  {k:24s} {"; ".join(v["needsReview"])}')
    if len(flagged) > 20:
        print(f'  ... and {len(flagged) - 20} more')


if __name__ == '__main__':
    main()
