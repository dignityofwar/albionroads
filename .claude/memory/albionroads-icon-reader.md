---
name: albionroads-icon-reader
description: "How tools/map-analysis/map_icons.py reads map features, and the two non-obvious tricks it depends on"
metadata: 
  node_type: memory
  type: project
  originSessionId: ca3c8f95-42f3-49b9-9a08-0462c25e3bbf
  modified: 2026-08-02T12:47:09.848Z
---

`tools/map-analysis/map_icons.py` reads chests, resources and dungeons off a Roads map
screenshot. Two findings are load-bearing and easy to undo by accident:

- **Chest colour cannot come from template matching.** The three chests share one sprite body
  and differ only in lid colour, which normalised cross-correlation removes along with the mean.
  The shape is matched once and the colour comes from the hue of the lid's most saturated
  pixels — gold 42°, green 88°, blue 190°. Adding colour as a *term* in the correlation score
  was tried and made recall worse; the split has to be a separate step.
- **Small vs large resources is the cleared ground, not the sprite.** Both sizes draw an
  identical icon; a large node stands in a cleared patch. The measure has to be normalised
  against each map's own terrain coverage or it just detects brown maps. Where the reader gets
  a resource's *count* right the split is right every time — the failures are always counting,
  never sizing.
- **Peaks have to clear their own type's threshold before non-maximum suppression, not after.**
  The thresholds differ by 0.2 between types, so suppressing on raw score first lets a
  high-scoring reject shadow a real icon and then drop out itself. Getting that order wrong cost
  25 points of yellow-chest agreement and looked like a detection problem.

The tool needs a corpus of map screenshots that is deliberately not in the repo, plus
`icon-labels.json` — exemplar coordinates *into those specific images*, from which templates are
averaged. Re-acquiring the screenshots can invalidate the coordinates silently, so check a few
templates by eye if counts move. Same arrangement as `road_shapes.py` and its shape baselines.

The tabulated third-party reference is not ground truth in either direction: it under-reports
chest colours (already known) and appears to over-report dungeons (found on 2026-08-02 —
`Casos-Aximam` is tabulated at 2 dungeons and its map draws 1). Treat disagreements as needing a
human, not as reader bugs.

**Score agreement over zones where the feature is actually present.** Counting all 325 zones
scores every zone with no ore as an ore success, and about two thirds of them have none — it
turns a 96% into a 99% and hides which features are weak. That mistake made yellow chests and
dungeons look fine when they were the two worst. See [[albionroads-docs]] for where the proposal
records the measured agreement.
